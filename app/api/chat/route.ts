import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth/auth.config";
import { SYSTEM_PROMPT } from "@/infrastructure/ai/prompts/system.prompt";
import { getPayrollHistoryDefinition, executeGetPayrollHistory } from "@/infrastructure/ai/tools/get-payroll-history.tool";
import { getTaxEstimateDefinition, executeGetTaxEstimate } from "@/infrastructure/ai/tools/get-tax-estimate.tool";
import { prisma } from "@/infrastructure/db/prisma/client";
import { auditService } from "@/infrastructure/audit/db-audit-logger";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tools: Anthropic.Tool[] = [
  getPayrollHistoryDefinition as Anthropic.Tool,
  getTaxEstimateDefinition as Anthropic.Tool,
];

async function executeTool(name: string, input: unknown, userId: string): Promise<string> {
  try {
    if (name === "get_payroll_history") return JSON.stringify(await executeGetPayrollHistory(userId, input));
    if (name === "get_tax_estimate") return JSON.stringify(await executeGetTaxEstimate(userId, input));
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { messages, sessionId } = await req.json() as {
    messages: Array<{ role: string; content: string }>;
    sessionId?: string;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const userId = session.user.id;

  // Persist user message
  let chatSessionId = sessionId;
  if (!chatSessionId) {
    const chatSession = await prisma.chatSession.create({
      data: { userId, contextPayload: { financialYear: "2024-25" } },
    });
    chatSessionId = chatSession.id;
  }

  await auditService.log({ userId, action: "AI_MESSAGE_SENT", resourceType: "ChatSession", resourceId: chatSessionId });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicMessages = messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Tool-use loop
        let response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools,
          messages: anthropicMessages,
        });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        while (response.stop_reason === "tool_use") {
          const toolUseBlocks = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          for (const toolUse of toolUseBlocks) {
            const result = await executeTool(toolUse.name, toolUse.input, userId);
            toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
          }

          anthropicMessages.push({ role: "assistant", content: response.content as never });
          anthropicMessages.push({ role: "user", content: toolResults as never });

          response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            tools,
            messages: anthropicMessages,
          });
        }

        const textContent = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");

        // Stream as Vercel AI SDK text format
        controller.enqueue(encoder.encode(`0:${JSON.stringify(textContent)}\n`));

        // Persist assistant message
        await prisma.chatMessage.createMany({
          data: [
            {
              sessionId: chatSessionId!,
              userId,
              role: "USER",
              content: messages[messages.length - 1].content,
              isGrounded: false,
            },
            {
              sessionId: chatSessionId!,
              userId,
              role: "ASSISTANT",
              content: textContent,
              toolCalls: response.content as never,
              isGrounded: toolResults.length > 0,
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            },
          ],
        });

        await auditService.log({ userId, action: "AI_RESPONSE_GENERATED", resourceType: "ChatSession", resourceId: chatSessionId });

        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI service error";
        controller.enqueue(encoder.encode(`0:${JSON.stringify(msg)}\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "x-session-id": chatSessionId ?? "",
    },
  });
}
