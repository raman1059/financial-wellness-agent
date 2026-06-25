import { z } from "zod";

// ─── Request ──────────────────────────────────────────────────────────────────

export const chatRequestSchema = z.object({
  /** The user's current message. */
  message: z
    .string()
    .min(1,    "Message cannot be empty")
    .max(2000, "Message too long — keep it under 2000 characters"),

  /**
   * Prior conversation turns. Each must alternate user/assistant.
   * Capped at 20 to bound context-window cost.
   */
  history: z
    .array(
      z.object({
        role:    z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(20, "History too long — maximum 20 prior turns")
    .default([]),

  /** Existing chat session to continue. Omit to start a new one. */
  sessionId: z.string().cuid("Invalid session ID format").optional(),

  /**
   * Preferred financial year for tax queries.
   * Defaults to the current FY if omitted.
   */
  financialYear: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Financial year must be in YYYY-YY format (e.g. 2024-25)")
    .optional(),

  /**
   * When false, returns a structured JSON body instead of a text stream.
   * Default: true (streaming). Use false for API integrations or testing.
   */
  stream: z.boolean().default(true),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// ─── Legacy alias (used by existing callers) ──────────────────────────────────
export const chatMessageSchema = chatRequestSchema;
export type  ChatMessageInput  = ChatRequest;

// ─── Response types ───────────────────────────────────────────────────────────

export interface ChatSource {
  /** The tool that produced this data point. */
  tool:    string;
  /** Logical table / data store the value came from. */
  table:   string;
  /** Exact field name from the tool result. */
  field:   string;
  /** String-cast value as returned by the tool. */
  value:   string;
  /** Pay period if the source is a specific payroll month (e.g. "2025-04"). */
  period?: string;
}

export type ConfidenceLevel = "high" | "medium" | "low" | "refused";
export type DataCompleteness = "full" | "partial" | "none";

export interface ConfidenceNote {
  /** Overall confidence in the answer. */
  level:             ConfidenceLevel;
  /** True when the answer is backed by at least one tool result. */
  isGrounded:        boolean;
  /** Names of every tool called to produce this answer. */
  toolsUsed:         string[];
  /** Present when a payslip source had OCR confidence below 0.70. */
  payslipOcrWarning?: string;
  /**
   * full    — all requested periods have records
   * partial — some periods missing; answer covers available data only
   * none    — no records; answer is a refusal
   */
  dataCompleteness:  DataCompleteness;
  /**
   * Human-readable assumptions the system made.
   * E.g. "Used current financial year 2025-26".
   * Empty when no assumptions were required.
   */
  assumptionsMade:   string[];
}

export interface ChatMeta {
  /** Stable ID for this assistant message — for feedback / tracing. */
  messageId:    string;
  sessionId:    string;
  intentTags:   string[];
  inputTokens:  number;
  outputTokens: number;
  /** End-to-end latency from request receipt to response ready (ms). */
  durationMs:   number;
}

export interface ChatJsonResponse {
  answer:         string;
  sources:        ChatSource[];
  confidenceNote: ConfidenceNote;
  meta:           ChatMeta;
}

// ─── Streaming frame format ───────────────────────────────────────────────────
//
//   0:"text chunk"\n     — incremental text (Vercel AI SDK format)
//   8:{...metadata}\n    — final structured metadata frame
//
// The type-8 frame carries the same payload as ChatJsonResponse minus `answer`.
//
export interface ChatStreamMetaFrame {
  sources:        ChatSource[];
  confidenceNote: ConfidenceNote;
  meta:           ChatMeta;
}
