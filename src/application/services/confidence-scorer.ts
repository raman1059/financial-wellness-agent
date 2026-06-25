/**
 * Confidence Scorer
 *
 * Produces the ConfidenceNote attached to every chat response.
 * Combines grounding status, tool result content, and data snapshot
 * into a single structured object that the client renders as a
 * "source reliability" indicator.
 *
 * Level ladder:
 *   high    — grounded + full data + no OCR warnings
 *   medium  — grounded + partial data OR OCR warning present
 *   low     — grounded but data completeness issues or imputed fields used
 *   refused — answer is a refusal (no usable data returned by tools)
 */

import type { GroundingResult, ToolCallResult } from "./grounding.service";
import type { UserDataSnapshot }                from "@/infrastructure/ai/context-builder";
import type { ConfidenceLevel, ConfidenceNote, DataCompleteness } from "@/lib/validation/schemas/chat.schema";

interface ScorerInput {
  grounding:   GroundingResult;
  toolResults: ToolCallResult[];
  snapshot:    UserDataSnapshot;
  toolsUsed:   string[];
}

export function scoreConfidence(input: ScorerInput): ConfidenceNote {
  const { grounding, toolResults, snapshot, toolsUsed } = input;

  // ── Data completeness ────────────────────────────────────────────────────────
  const dataCompleteness = computeDataCompleteness(toolResults, snapshot);

  // ── Assumptions ─────────────────────────────────────────────────────────────
  const assumptionsMade = extractAssumptions(toolResults, snapshot);

  // ── OCR warning ─────────────────────────────────────────────────────────────
  const payslipOcrWarning = extractOcrWarning(toolResults);

  // ── Level ────────────────────────────────────────────────────────────────────
  const level = computeLevel({
    isGrounded:       grounding.isGrounded,
    dataCompleteness,
    hasOcrWarning:    !!payslipOcrWarning,
    hasImputedFields: hasAnyImputedFields(toolResults),
    citedAll:         grounding.citedAll,
  });

  return {
    level,
    isGrounded:        grounding.isGrounded,
    toolsUsed,
    payslipOcrWarning,
    dataCompleteness,
    assumptionsMade,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeDataCompleteness(
  toolResults: ToolCallResult[],
  snapshot:    UserDataSnapshot,
): DataCompleteness {
  if (toolResults.length === 0) {
    return snapshot.payrollRecordCount === 0 && snapshot.payslipCount === 0
      ? "none"
      : "partial";
  }

  // Check each tool result for "no_records" reasons
  const emptyReasons = [
    "no_records_for_year",
    "no_records_for_financial_year",
    "no_payslips_found",
  ];

  let anyEmpty = false;
  let anyPopulated = false;

  for (const result of toolResults) {
    const reason = result.content.reason;
    if (typeof reason === "string" && emptyReasons.includes(reason)) {
      anyEmpty = true;
    } else {
      anyPopulated = true;
    }
  }

  if (anyEmpty && anyPopulated) return "partial";
  if (anyEmpty && !anyPopulated) return "none";
  return "full";
}

function extractAssumptions(
  toolResults: ToolCallResult[],
  snapshot:    UserDataSnapshot,
): string[] {
  const assumptions: string[] = [];

  // FY assumption: if a tool was called with a financial year, note it
  for (const r of toolResults) {
    if (r.content.financialYear && typeof r.content.financialYear === "string") {
      assumptions.push(`Financial year: ${r.content.financialYear}`);
      break;
    }
    if (r.content.calendarYear && typeof r.content.calendarYear === "number") {
      assumptions.push(`Calendar year: ${r.content.calendarYear}`);
      break;
    }
  }

  // If we have fewer months than a full year, note it
  for (const r of toolResults) {
    const records = r.content.records;
    if (Array.isArray(records) && records.length > 0 && records.length < 12) {
      assumptions.push(
        `Answer based on ${records.length} of 12 months — remaining months have no records`,
      );
      break;
    }
  }

  // If any imputed fields are in the response
  if (hasAnyImputedFields(toolResults)) {
    assumptions.push(
      "Some payslip fields were estimated by the OCR pipeline (not read directly from the document)",
    );
  }

  // If snapshot shows no declaration
  if (!snapshot.hasDeclaration && toolResults.some((r) => r.toolName === "get_tax_estimate")) {
    assumptions.push("No tax declaration on file — tax estimate uses salary data only");
  }

  return assumptions;
}

function extractOcrWarning(toolResults: ToolCallResult[]): string | undefined {
  for (const r of toolResults) {
    if (r.toolName === "get_payslip_data") {
      const warning = r.content.dataQualityWarning;
      if (typeof warning === "string") return warning;
    }
  }
  return undefined;
}

function hasAnyImputedFields(toolResults: ToolCallResult[]): boolean {
  for (const r of toolResults) {
    const payslips = r.content.payslips;
    if (Array.isArray(payslips)) {
      for (const p of payslips as Array<{ imputedFields?: string[] }>) {
        if (p.imputedFields && p.imputedFields.length > 0) return true;
      }
    }
  }
  return false;
}

function computeLevel(opts: {
  isGrounded:       boolean;
  dataCompleteness: DataCompleteness;
  hasOcrWarning:    boolean;
  hasImputedFields: boolean;
  citedAll:         boolean;
}): ConfidenceLevel {
  const { isGrounded, dataCompleteness, hasOcrWarning, hasImputedFields, citedAll } = opts;

  if (!isGrounded || dataCompleteness === "none") return "refused";

  if (dataCompleteness === "full" && !hasOcrWarning && !hasImputedFields && citedAll) {
    return "high";
  }

  if (dataCompleteness === "partial" || hasImputedFields) {
    return "low";
  }

  // grounded + full data but OCR warning or missing citations
  return "medium";
}
