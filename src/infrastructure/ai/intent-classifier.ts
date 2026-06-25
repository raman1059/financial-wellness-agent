/**
 * Intent Classifier
 *
 * Classifies user questions into intent tags. Used to build the minimal
 * set of tools Claude is offered — avoids giving Claude access to tax tools
 * when the user asks a pure payroll question, and vice versa.
 *
 * Smaller tool allowlists → fewer tool calls → lower latency + lower cost.
 * More importantly: Claude cannot hallucinate data from a tool it cannot call.
 */

export type IntentTag =
  | "payroll"      // salary, payslip, paycheck, income, CTC, gross, net
  | "tax"          // TDS, tax liability, regime, ITR, 80C, deductions
  | "documents"    // upload, payslip file, OCR, parse, document
  | "ytd"          // year-to-date, annual total, FY summary
  | "general";     // greeting, help, anything unclassified

export interface ClassifiedIntent {
  tags:         IntentTag[];
  primaryTag:   IntentTag;
  confidence:   "high" | "medium" | "low";
}

// Keyword patterns per intent
const PATTERNS: Record<IntentTag, RegExp> = {
  payroll:   /\b(salary|payroll|pay\s*slip|paycheck|gross|net pay|ctc|basic|hra|lta|allowance|pf|provident|take.?home)\b/i,
  tax:       /\b(tax|tds|liability|regime|new regime|old regime|itr|80c|80d|nps|deduct|section|income tax|refund|surcharge)\b/i,
  documents: /\b(upload|document|file|pdf|image|ocr|parse|payslip\s*file|scan)\b/i,
  ytd:       /\b(ytd|year.?to.?date|annual|fy|financial year|so far this year|total.*year|cumulative)\b/i,
  general:   /.*/,
};

// Which tools each intent tag enables
export const INTENT_TOOL_MAP: Record<IntentTag, string[]> = {
  payroll:   ["get_payroll_history"],
  tax:       ["get_payroll_history", "get_tax_estimate"],
  documents: ["get_payslip_data"],
  ytd:       ["get_ytd_summary", "get_payroll_history"],
  general:   ["get_payroll_history", "get_ytd_summary"],
};

export function classifyIntent(userMessage: string): ClassifiedIntent {
  const found: IntentTag[] = [];

  for (const [tag, pattern] of Object.entries(PATTERNS) as [IntentTag, RegExp][]) {
    if (tag === "general") continue;
    if (pattern.test(userMessage)) found.push(tag);
  }

  if (found.length === 0) {
    return { tags: ["general"], primaryTag: "general", confidence: "low" };
  }

  const primary = found[0];
  const confidence = found.length === 1 ? "high" : "medium";
  return { tags: found, primaryTag: primary, confidence };
}

/** Returns the deduplicated list of tool names for a set of intent tags. */
export function toolsForIntent(tags: IntentTag[]): string[] {
  const set = new Set<string>();
  for (const tag of tags) {
    for (const tool of INTENT_TOOL_MAP[tag] ?? []) {
      set.add(tool);
    }
  }
  return [...set];
}
