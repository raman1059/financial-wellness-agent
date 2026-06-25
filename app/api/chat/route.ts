/**
 * POST /api/chat
 *
 * AI chat endpoint for the Financial Wellness Agent.
 *
 * ── Security model ────────────────────────────────────────────────────────────
 * Employee ID is NEVER taken from the request body — it comes from the
 * verified JWT session.  Payroll data and payslip data are fetched server-side
 * via scoped tool calls (WHERE userId = session.user.id).  The client sends
 * only the question and optional session context.
 *
 * ── Response modes ────────────────────────────────────────────────────────────
 * stream: true  (default) — streams text chunks, then emits a type-8 metadata
 *                            frame containing sources + confidenceNote.
 * stream: false           — returns a single JSON body (ChatJsonResponse).
 *                           Use for API integrations, testing, or when the
 *                           client needs sources before rendering.
 *
 * ── Rate limiting ─────────────────────────────────────────────────────────────
 * 20 requests / minute per user (in-process window; replace with Redis in prod).
 */

import { NextRequest, NextResponse }  from "next/server";
import { randomUUID }                  from "crypto";
import Anthropic                       from "@anthropic-ai/sdk";

import { auth }                          from "@/lib/auth/auth.config";
import { checkRateLimit }                from "@/lib/rate-limiter";
import { chatRequestSchema }             from "@/lib/validation/schemas/chat.schema";
import { SYSTEM_PROMPT }                 from "@/infrastructure/ai/prompts/system.prompt";
import { classifyIntent, toolsForIntent } from "@/infrastructure/ai/intent-classifier";
import { buildUserSnapshot, buildSystemPrompt } from "@/infrastructure/ai/context-builder";
import { detectPromptInjection, injectionRefusalMessage } from "@/lib/edge-cases/injection-detector";
import { groundingService }              from "@/application/services/grounding.service";
import { scoreConfidence }               from "@/application/services/confidence-scorer";
import { prisma }                        from "@/infrastructure/db/prisma/client";
import { auditService }                  from "@/infrastructure/audit/db-audit-logger";

import {
  getPayrollHistoryDefinition,
  executeGetPayrollHistory,
} from "@/infrastructure/ai/tools/get-payroll-history.tool";
import {
  getTaxEstimateDefinition,
  executeGetTaxEstimate,
} from "@/infrastructure/ai/tools/get-tax-estimate.tool";
import {
  getPayslipDataDefinition,
  executeGetPayslipData,
} from "@/infrastructure/ai/tools/get-payslip-data.tool";
import {
  getYtdSummaryDefinition,
  executeGetYtdSummary,
} from "@/infrastructure/ai/tools/get-ytd-summary.tool";

import type {
  ToolCallResult,
}                         from "@/application/services/grounding.service";
import type {
  ChatJsonResponse,
  ChatStreamMetaFrame,
  ChatSource,
}                         from "@/lib/validation/schemas/chat.schema";

// ─── Tool registry ────────────────────────────────────────────────────────────

const ALL_TOOLS: Record<string, Anthropic.Tool> = {
  get_payroll_history: getPayrollHistoryDefinition as Anthropic.Tool,
  get_tax_estimate:    getTaxEstimateDefinition    as Anthropic.Tool,
  get_payslip_data:    getPayslipDataDefinition    as Anthropic.Tool,
  get_ytd_summary:     getYtdSummaryDefinition     as Anthropic.Tool,
};

async function executeTool(name: string, input: unknown, userId: string): Promise<string> {
  try {
    if (name === "get_payroll_history") return JSON.stringify(await executeGetPayrollHistory(userId, input));
    if (name === "get_tax_estimate")    return JSON.stringify(await executeGetTaxEstimate(userId, input));
    if (name === "get_payslip_data")    return JSON.stringify(await executeGetPayslipData(userId, input));
    if (name === "get_ytd_summary")     return JSON.stringify(await executeGetYtdSummary(userId, input));
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (err) {
    return JSON.stringify({ error: String(err), reason: "tool_execution_error" });
  }
}

// ─── Anthropic client (lazy — only initialised when API key is present) ───────

let _client: Anthropic | null = null;
function getClient() {
  _client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _client;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errorResponse(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startMs = Date.now();

  // ── 1. Authentication ──────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Unauthorized", 401, "UNAUTHENTICATED");

  const role   = (session.user as { role?: string }).role ?? "USER";
  const userId = session.user.id;

  if (role !== "USER" && role !== "ADMIN") {
    return errorResponse("Forbidden — only USER and ADMIN can use the chat", 403, "FORBIDDEN");
  }

  // ── 2. Rate limiting ───────────────────────────────────────────────────────
  const rateLimit = checkRateLimit(userId, 20, 60_000);
  if (!rateLimit.allowed) {
    return errorResponse(
      `Rate limit exceeded. Retry in ${Math.ceil(rateLimit.retryAfterMs / 1000)}s.`,
      429,
      "RATE_LIMITED",
    );
  }

  // ── 3. Request validation ──────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Request body must be valid JSON", 400, "INVALID_JSON");
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { message, history, sessionId, financialYear, stream: wantStream } = parsed.data;

  // ── 3.5. Prompt injection detection ───────────────────────────────────────
  // Runs after schema validation so `message` is a clean, length-bounded string.
  // HIGH severity → block immediately and log. MEDIUM/LOW → log and continue.
  // The intent classifier already limits which tools Claude can call, so even
  // undetected LOW-severity attempts can't access data beyond the user's own.
  const injection = detectPromptInjection(message);
  if (injection.isSuspicious) {
    void auditService.logEvent(
      "SUSPICIOUS_REQUEST",
      {
        reason:     `Prompt injection attempt — severity ${injection.severity}`,
        triggers:   injection.triggers.map((t) => t.pattern),
        severity:   injection.severity,
        categories: injection.categories,
        blocked:    injection.severity === "HIGH",
      },
      { userId, resourceType: "ChatSession" },
    );

    if (injection.severity === "HIGH") {
      return errorResponse(injectionRefusalMessage(), 400, "INJECTION_DETECTED");
    }
  }

  // ── 4. Session management ──────────────────────────────────────────────────
  let chatSessionId = sessionId;
  if (!chatSessionId) {
    const s = await prisma.chatSession.create({
      data: { userId, contextPayload: { startedAt: new Date().toISOString(), financialYear } },
    });
    chatSessionId = s.id;
  }

  void auditService.logEvent(
    "AI_QUERY_RECEIVED",
    { intentTags: classifyIntent(message).tags, sessionId: chatSessionId!, messagePreview: message.slice(0, 80) },
    { userId, resourceType: "ChatSession", resourceId: chatSessionId },
  );

  // ── 5. Intent classification → minimal tool set ────────────────────────────
  const intent    = classifyIntent(message);
  const toolNames = toolsForIntent(intent.tags);
  const tools     = toolNames.map((n) => ALL_TOOLS[n]).filter(Boolean) as Anthropic.Tool[];

  // ── 6. Context: user snapshot → enriched system prompt ────────────────────
  const snapshot     = await buildUserSnapshot(userId);
  const systemPrompt = buildSystemPrompt(SYSTEM_PROMPT, snapshot);

  // If no API key fall through to mock path
  if (!process.env.ANTHROPIC_API_KEY) {
    return mockChatResponse({
      userId, message, history, chatSessionId,
      intent, snapshot, wantStream, startMs,
    });
  }

  // ── 7. Build Anthropic message list ───────────────────────────────────────
  // History comes from the client (trusted — all from this user's session).
  // The current message is appended as the final user turn.
  const anthropicMessages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: message },
  ];

  // ── 8. Tool-use loop ───────────────────────────────────────────────────────
  const collectedToolResults: ToolCallResult[]              = [];
  const toolResultBlocks:     Anthropic.ToolResultBlockParam[] = [];

  let response = await getClient().messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1024,
    system:     systemPrompt,
    tools,
    messages:   anthropicMessages,
  });

  while (response.stop_reason === "tool_use") {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    for (const toolUse of toolUseBlocks) {
      const rawResult = await executeTool(toolUse.name, toolUse.input, userId);
      const parsed    = JSON.parse(rawResult) as Record<string, unknown>;

      collectedToolResults.push({ toolUseId: toolUse.id, toolName: toolUse.name, content: parsed });
      toolResultBlocks.push({ type: "tool_result", tool_use_id: toolUse.id, content: rawResult });
    }

    anthropicMessages.push({ role: "assistant", content: response.content });
    anthropicMessages.push({ role: "user",      content: toolResultBlocks });

    response = await getClient().messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      system:     systemPrompt,
      tools,
      messages:   anthropicMessages,
    });
  }

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // ── 9. Grounding check ─────────────────────────────────────────────────────
  const grounded = groundingService.process(rawText, collectedToolResults);

  const finalText =
    grounded.hasRupees && !grounded.isGrounded
      ? groundingService.refusalForUngroundedResponse()
      : grounded.text;

  // ── 10. Confidence scoring ─────────────────────────────────────────────────
  const toolsUsed     = [...new Set(collectedToolResults.map((r) => r.toolName))];
  const confidenceNote = scoreConfidence({ grounding: grounded, toolResults: collectedToolResults, snapshot, toolsUsed });

  // ── 11. Sources ────────────────────────────────────────────────────────────
  const sources: ChatSource[] = grounded.citations.map((c) => ({
    tool:    collectedToolResults.find((r) => r.toolUseId === c.toolUseId)?.toolName ?? "unknown",
    table:   c.table,
    field:   c.field,
    value:   c.value,
    ...(c.period ? { period: c.period } : {}),
  }));

  // ── 12. Metadata ───────────────────────────────────────────────────────────
  const messageId = randomUUID();
  const meta = {
    messageId,
    sessionId:    chatSessionId!,
    intentTags:   intent.tags,
    inputTokens:  response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs:   Date.now() - startMs,
  };

  // ── 13. Persist ────────────────────────────────────────────────────────────
  await prisma.chatMessage.createMany({
    data: [
      {
        sessionId:  chatSessionId!,
        userId,
        role:       "USER",
        content:    message,
        isGrounded: false,
      },
      {
        sessionId:       chatSessionId!,
        userId,
        role:            "ASSISTANT",
        content:         finalText,
        toolCalls:       response.content as never,
        isGrounded:      grounded.isGrounded,
        confidenceScore: confidenceNote.level === "high"   ? 1.0
                       : confidenceNote.level === "medium" ? 0.7
                       : confidenceNote.level === "low"    ? 0.4
                       : 0,
        inputTokens:  response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    ],
  });

  void auditService.logEvent(
    "AI_QUERY_COMPLETED",
    {
      sessionId:     chatSessionId!,
      intentTags:    intent.tags,
      toolsUsed,
      inputTokens:   response.usage.input_tokens,
      outputTokens:  response.usage.output_tokens,
      durationMs:    meta.durationMs,
      confidence:    confidenceNote.level,
      isGrounded:    grounded.isGrounded,
      citationCount: sources.length,
    },
    { userId, resourceType: "ChatSession", resourceId: chatSessionId },
  );

  // ── 14. Response ───────────────────────────────────────────────────────────

  if (!wantStream) {
    const jsonBody: ChatJsonResponse = { answer: finalText, sources, confidenceNote, meta };
    return NextResponse.json(jsonBody, {
      status: 200,
      headers: {
        "x-session-id":  chatSessionId!,
        "x-intent-tags": intent.tags.join(","),
        "x-message-id":  messageId,
      },
    });
  }

  // Streaming: text chunks → final metadata frame
  const encoder  = new TextEncoder();
  const metaFrame: ChatStreamMetaFrame = { sources, confidenceNote, meta };

  const stream = new ReadableStream({
    start(controller) {
      // Type-0: full answer as single chunk (stateless streaming — no delta yet)
      controller.enqueue(encoder.encode(`0:${JSON.stringify(finalText)}\n`));
      // Type-8: structured metadata frame
      controller.enqueue(encoder.encode(`8:${JSON.stringify(metaFrame)}\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/plain; charset=utf-8",
      "x-session-id":  chatSessionId!,
      "x-intent-tags": intent.tags.join(","),
      "x-message-id":  messageId,
      "X-RateLimit-Remaining": String(rateLimit.remaining),
    },
  });
}

// ─── Mock path (no ANTHROPIC_API_KEY) ────────────────────────────────────────

interface MockChatInput {
  userId:        string;
  message:       string;
  history:       Array<{ role: string; content: string }>;
  chatSessionId: string;
  intent:        ReturnType<typeof classifyIntent>;
  snapshot:      Awaited<ReturnType<typeof buildUserSnapshot>>;
  wantStream:    boolean;
  startMs:       number;
}

async function mockChatResponse(opts: MockChatInput): Promise<Response> {
  const { userId, message, chatSessionId, intent, snapshot, wantStream, startMs } = opts;

  const [payrollRecords, declaration, payslips] = await Promise.all([
    prisma.payrollRecord.findMany({
      where:   { userId, payPeriodYear: new Date().getFullYear() },
      orderBy: [{ payPeriodYear: "desc" }, { payPeriodMonth: "desc" }],
      take: 6,
    }),
    prisma.taxDeclaration.findFirst({ where: { userId, financialYear: "2024-25" } }),
    prisma.payslip.findMany({ where: { userId, status: "PARSED" }, take: 3 }),
  ]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  const ytdGross = payrollRecords.reduce((s, r) => s + r.grossSalary, 0);
  const ytdTds   = payrollRecords.reduce((s, r) => s + r.tdsDeducted, 0);
  const msg      = message.toLowerCase();

  let answer: string;
  const mockSources: ChatSource[] = [];

  if (payrollRecords.length === 0 && payslips.length === 0) {
    answer =
      `I don't have any payroll records or payslips on file for you yet.\n\n` +
      `**To get started:**\n` +
      `- Add payroll records on the **Payroll** page\n` +
      `- Upload a payslip PDF or image on the **Documents** page\n\n` +
      `> ⓘ Demo mode — add \`ANTHROPIC_API_KEY\` to enable live AI.`;
  } else if (intent.tags.includes("documents")) {
    if (payslips.length === 0) {
      answer =
        `No parsed payslips found. Upload a payslip PDF or image on the Documents page.\n\n` +
        `> ⓘ Demo mode — add \`ANTHROPIC_API_KEY\` to enable live AI.`;
    } else {
      answer =
        `You have **${payslips.length}** parsed payslip(s) on file:\n\n` +
        payslips.map((p) => {
          const f = (p.parsedFields ?? {}) as Record<string, number>;
          mockSources.push({ tool: "get_payslip_data", table: "payslips", field: "grossSalary", value: String(f.grossSalary ?? 0), period: `${p.payPeriodYear}-${String(p.payPeriodMonth ?? 0).padStart(2, "0")}` });
          return `- **${p.fileName}** — Gross: ${fmt(f.grossSalary ?? 0)}, Net: ${fmt(f.netSalary ?? 0)}, OCR confidence: ${((p.ocrConfidence ?? 0) * 100).toFixed(0)}%`;
        }).join("\n") +
        `\n\n> ⓘ Demo mode — add \`ANTHROPIC_API_KEY\` to enable live AI.`;
    }
  } else if (intent.tags.includes("tax") || msg.includes("tax") || msg.includes("tds") || msg.includes("regime")) {
    const taxable = declaration?.taxableIncome ?? Math.max(0, ytdGross - 75_000);
    const tds     = declaration?.totalTdsPaid  ?? ytdTds;
    mockSources.push(
      { tool: "get_tax_estimate", table: "tax_declarations", field: "taxableIncome", value: String(taxable) },
      { tool: "get_tax_estimate", table: "tax_declarations", field: "totalTdsPaid",  value: String(tds) },
    );
    answer =
      `**FY 2024-25 Tax Summary — New Regime**\n\n` +
      `- Gross Income: ${fmt(declaration?.grossIncome ?? ytdGross)}\n` +
      `- Standard Deduction: ₹75,000\n` +
      `- Taxable Income: ${fmt(taxable)}\n` +
      `- TDS Deducted: ${fmt(tds)}\n` +
      `- Estimated Balance Payable: ${fmt(Math.max((declaration?.taxPayable ?? 0), 0))}\n\n` +
      `> ⓘ Demo mode — add \`ANTHROPIC_API_KEY\` to enable live AI.`;
  } else if (intent.tags.includes("payroll") || intent.tags.includes("ytd")) {
    mockSources.push(
      { tool: "get_payroll_history", table: "payroll_records", field: "ytdGross", value: String(ytdGross) },
      { tool: "get_payroll_history", table: "payroll_records", field: "ytdTds",   value: String(ytdTds) },
    );
    answer =
      `**Payroll Summary — ${new Date().getFullYear()}**\n\n` +
      `- Months on record: ${payrollRecords.length}\n` +
      `- YTD Gross: ${fmt(ytdGross)}\n` +
      `- YTD TDS Deducted: ${fmt(ytdTds)}\n` +
      `- Latest month gross: ${payrollRecords[0] ? fmt(payrollRecords[0].grossSalary) : "—"}\n\n` +
      `> ⓘ Demo mode — add \`ANTHROPIC_API_KEY\` to enable live AI.`;
  } else {
    answer =
      `Hello! I am your Financial Wellness AI Advisor.\n\n` +
      `**I can answer questions about:**\n` +
      `- Monthly and YTD payroll figures\n` +
      `- Tax liability — Old vs New regime\n` +
      `- Deductions: 80C, 80D, HRA, NPS\n` +
      `- Payslip OCR status and extracted fields\n\n` +
      `Try: *"What is my estimated tax for FY 2024-25?"*\n\n` +
      `> ⓘ Demo mode — add \`ANTHROPIC_API_KEY\` to enable live AI.`;
  }

  const messageId = randomUUID();
  const confidenceNote = {
    level:            (mockSources.length > 0 ? "high" : "refused") as "high" | "refused",
    isGrounded:       mockSources.length > 0,
    toolsUsed:        [...new Set(mockSources.map((s) => s.tool))],
    dataCompleteness: (snapshot.payrollRecordCount > 0 ? "full" : "none") as "full" | "none",
    assumptionsMade:  ["Demo mode — live AI disabled; response built from mock data"],
  };

  const meta = {
    messageId,
    sessionId:    chatSessionId,
    intentTags:   intent.tags,
    inputTokens:  0,
    outputTokens: 0,
    durationMs:   Date.now() - startMs,
  };

  await prisma.chatMessage.createMany({
    data: [
      { sessionId: chatSessionId, userId, role: "USER",      content: message, isGrounded: false },
      { sessionId: chatSessionId, userId, role: "ASSISTANT", content: answer,  isGrounded: mockSources.length > 0, confidenceScore: mockSources.length > 0 ? 1 : 0 },
    ],
  });

  if (!wantStream) {
    const jsonBody: ChatJsonResponse = { answer, sources: mockSources, confidenceNote, meta };
    return NextResponse.json(jsonBody, {
      headers: { "x-session-id": chatSessionId, "x-intent-tags": intent.tags.join(","), "x-message-id": messageId },
    });
  }

  const encoder  = new TextEncoder();
  const metaFrame: ChatStreamMetaFrame = { sources: mockSources, confidenceNote, meta };

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`0:${JSON.stringify(answer)}\n`));
      controller.enqueue(encoder.encode(`8:${JSON.stringify(metaFrame)}\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/plain; charset=utf-8",
      "x-session-id":  chatSessionId,
      "x-intent-tags": intent.tags.join(","),
      "x-message-id":  messageId,
    },
  });
}
