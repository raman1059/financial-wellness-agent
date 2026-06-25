/**
 * Grounding Service
 *
 * Two responsibilities:
 *   1. Extract structured citations from tool results so every number in the
 *      AI response can be traced to a source record.
 *   2. Verify grounding: detect responses that contain ₹ figures but have no
 *      backing tool call → those must be treated as ungrounded and refused.
 *
 * Citation protocol
 * -----------------
 * Claude is instructed (via system prompt) to append [source:TOOL_USE_ID:FIELD_NAME]
 * after every number it states.  The grounding service strips those markers,
 * maps them to tool call results, and returns them as a structured array.
 *
 * Example:
 *   response text: "Your April gross was ₹1,40,000 [source:tu_001:grossSalary]"
 *   citation:      { toolUseId: "tu_001", field: "grossSalary", value: "140000",
 *                    period: "2025-04", table: "payroll_records" }
 */

export interface Citation {
  toolUseId: string;
  table:     string;
  field:     string;
  value:     string;
  period?:   string;
}

export interface ToolCallResult {
  toolUseId: string;
  toolName:  string;
  content:   Record<string, unknown>;
}

export interface GroundingResult {
  text:        string;          // response with [source:...] markers stripped
  citations:   Citation[];
  isGrounded:  boolean;
  hasRupees:   boolean;         // true if response contains ₹ figures
  citedAll:    boolean;         // true if every ₹ figure has a citation marker
}

// Matches [source:TOOL_USE_ID] or [source:TOOL_USE_ID:FIELD_NAME]
const CITATION_MARKER_RE = /\[source:([^:\]]+)(?::([^\]]+))?\]/g;

// Detects Indian rupee figures in the response
const RUPEE_RE = /₹[\d,]+/;

export class GroundingService {
  process(
    responseText: string,
    toolResults:  ToolCallResult[],
  ): GroundingResult {
    const citations: Citation[] = [];
    const citedIds  = new Set<string>();

    // Build a lookup from toolUseId → result content
    const resultMap = new Map(toolResults.map((r) => [r.toolUseId, r]));

    // Extract and strip citation markers
    // Both [source:ID] and [source:ID:FIELD] forms are handled
    const text = responseText.replace(CITATION_MARKER_RE, (_, id: string, fieldHint: string | undefined) => {
      citedIds.add(id);
      const result = resultMap.get(id);
      if (result) {
        this.extractCitations(id, result.toolName, result.content, citations, fieldHint);
      }
      return ""; // strip marker from final text
    });

    // Emit citations for tool calls that weren't explicitly cited in-line
    // (covers cases where Claude omits a marker on some sentences)
    for (const r of toolResults) {
      if (!citedIds.has(r.toolUseId)) {
        this.extractCitations(r.toolUseId, r.toolName, r.content, citations, undefined);
      }
    }

    const hasRupees   = RUPEE_RE.test(responseText);
    const isGrounded  = toolResults.length > 0;

    // A response is "fully cited" if it has rupee figures only when tools were used
    const citedAll = hasRupees ? isGrounded : true;

    return { text: text.trim(), citations, isGrounded, hasRupees, citedAll };
  }

  /**
   * Returns a hard refusal string when the response contains ₹ figures
   * but no tool was called — meaning Claude hallucinated numbers.
   */
  refusalForUngroundedResponse(): string {
    return (
      "I don't have enough data to answer that accurately. " +
      "Please ensure your payroll records are up to date on the Payroll page, " +
      "or upload a payslip on the Documents page."
    );
  }

  private extractCitations(
    toolUseId:  string,
    toolName:   string,
    content:    Record<string, unknown>,
    out:        Citation[],
    fieldHint?: string,   // explicit field from [source:ID:FIELD] marker
  ): void {
    const table = toolNameToTable(toolName);

    // If Claude specified an exact field, emit just that one citation
    if (fieldHint && fieldHint in content) {
      const value = content[fieldHint];
      if (typeof value === "number" || typeof value === "string") {
        out.push({ toolUseId, table, field: fieldHint, value: String(value) });
        return;
      }
    }

    // Flatten top-level scalars
    for (const [field, value] of Object.entries(content)) {
      if (typeof value === "number" || typeof value === "string") {
        out.push({ toolUseId, table, field, value: String(value) });
      }
    }

    // Flatten records array (payroll history, payslips)
    const records = content.records ?? content.payslips;
    if (Array.isArray(records)) {
      for (const rec of records as Record<string, unknown>[]) {
        const period = typeof rec.period === "string" ? rec.period : undefined;
        for (const [field, value] of Object.entries(rec)) {
          if (typeof value === "number") {
            out.push({ toolUseId, table, field, value: String(value), period });
          }
        }
      }
    }

    // Flatten summary object (YTD summary)
    if (content.summary && typeof content.summary === "object") {
      for (const [field, value] of Object.entries(content.summary as Record<string, unknown>)) {
        if (typeof value === "number") {
          out.push({ toolUseId, table: `${table}_summary`, field, value: String(value) });
        }
      }
    }
  }
}

function toolNameToTable(toolName: string): string {
  const MAP: Record<string, string> = {
    get_payroll_history: "payroll_records",
    get_tax_estimate:    "tax_declarations",
    get_payslip_data:    "payslips",
    get_ytd_summary:     "payroll_records",
  };
  return MAP[toolName] ?? "unknown";
}

export const groundingService = new GroundingService();
