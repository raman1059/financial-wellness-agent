export interface Citation {
  recordId: string;
  table: string;
  field: string;
  value: string;
}

export interface ToolCallResult {
  toolUseId: string;
  content: Record<string, unknown>;
}

export class GroundingService {
  /**
   * Post-processes AI response text.
   * Extracts citation markers and maps them to tool results.
   * Returns the annotated text and the citation list.
   */
  process(
    responseText: string,
    toolResults: ToolCallResult[],
  ): { text: string; citations: Citation[]; isGrounded: boolean } {
    const citations: Citation[] = [];

    // Each tool result contributes grounding data
    for (const result of toolResults) {
      const entries = Object.entries(result.content);
      for (const [field, value] of entries) {
        if (typeof value === "number" || typeof value === "string") {
          citations.push({
            recordId: result.toolUseId,
            table: "tool_result",
            field,
            value: String(value),
          });
        }
      }
    }

    // A response is grounded if it was produced using at least one tool call
    const isGrounded = toolResults.length > 0;

    return { text: responseText, citations, isGrounded };
  }
}
