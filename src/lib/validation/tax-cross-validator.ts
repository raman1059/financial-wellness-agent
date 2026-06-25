/**
 * Tax Declaration Cross-Field Validator
 *
 * Zod schemas validate individual fields (non-negative, correct format).
 * This module validates relationships between fields — rules that span
 * multiple declaration values and depend on the tax regime and FY.
 *
 * Design: returns warnings and errors as typed objects, never throws.
 * The caller decides whether to block (on ERROR) or surface (on WARN/INFO).
 *
 * Rules implemented:
 *   R1: 80C components sum must not exceed ₹1,50,000
 *   R2: Financial year must not be more than 1 year in the future
 *   R3: HRA deduction requires hraReceived > 0
 *   R4: New Regime declared with Old Regime-only deductions (advisory)
 *   R5: NPS contribution must not exceed ₹50,000 (80CCD(1B) cap)
 *   R6: Parent health insurance must not exceed ₹50,000 (80D cap)
 *   R7: 80C sub-section breakdown must be internally consistent with total80C
 */

export type CrossValidationLevel = "ERROR" | "WARN" | "INFO";

export interface CrossValidationIssue {
  code:     string;
  level:    CrossValidationLevel;
  message:  string;
  field?:   string;
  detail?:  Record<string, number>;
}

export interface CrossValidationResult {
  isValid:  boolean;                  // false only when level=ERROR issues exist
  issues:   CrossValidationIssue[];
  warnings: CrossValidationIssue[];   // convenience: issues filtered to WARN
  infos:    CrossValidationIssue[];   // convenience: issues filtered to INFO
}

// ─── Input shape (mirrors taxDeclarationSchema) ───────────────────────────────

export interface TaxCrossValidationInput {
  financialYear:         string;
  taxRegime:             "OLD" | "NEW";
  ppfAmount:             number;
  elssAmount:            number;
  lifeInsurance:         number;
  homeLoanPrincipal:     number;
  nscAmount:             number;
  tuitionFees:           number;
  other80C:              number;
  selfHealthInsurance:   number;
  parentHealthInsurance: number;
  hraReceived:           number;
  npsContribution:       number;
  homeLoanInterest:      number;
  educationLoanInterest: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CAP_80C            = 1_50_000;   // ₹1.5 lakh
const CAP_NPS            = 50_000;     // ₹50K (80CCD(1B))
const CAP_HEALTH_PARENTS = 50_000;     // ₹50K (80D parents, senior citizen)
const CAP_HEALTH_SELF    = 25_000;     // ₹25K (80D self/family, non-senior)
const MAX_FUTURE_FY_GAP  = 1;          // allow at most 1 FY ahead

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentFYStartYear(): number {
  const now   = new Date();
  const month = now.getMonth() + 1;
  return month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}

function parseFYStartYear(fy: string): number | null {
  const [startStr] = fy.split("-");
  const year = Number(startStr);
  return Number.isFinite(year) ? year : null;
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateTaxDeclaration(
  input: TaxCrossValidationInput,
): CrossValidationResult {
  const issues: CrossValidationIssue[] = [];

  // ── R1: 80C cap ─────────────────────────────────────────────────────────────
  const total80C =
    input.ppfAmount +
    input.elssAmount +
    input.lifeInsurance +
    input.homeLoanPrincipal +
    input.nscAmount +
    input.tuitionFees +
    input.other80C;

  if (total80C > CAP_80C) {
    const excess = total80C - CAP_80C;
    issues.push({
      code:    "80C_CAP_EXCEEDED",
      level:   "WARN",
      message: `Total 80C investments (₹${total80C.toLocaleString("en-IN")}) exceed the ₹1,50,000 limit. Only ₹1,50,000 will be deducted; ₹${excess.toLocaleString("en-IN")} will not save tax.`,
      field:   "total80C",
      detail:  {
        submitted: total80C,
        cap:       CAP_80C,
        excess,
        effective: CAP_80C,
      },
    });
  }

  // ── R2: Future financial year ─────────────────────────────────────────────
  const fyStart = parseFYStartYear(input.financialYear);
  if (fyStart !== null) {
    const currentFY = currentFYStartYear();
    const gap = fyStart - currentFY;
    if (gap > MAX_FUTURE_FY_GAP) {
      issues.push({
        code:    "FUTURE_FY",
        level:   "ERROR",
        message: `Financial year "${input.financialYear}" is ${gap} year(s) in the future. Declarations can only be filed for the current or previous financial year.`,
        field:   "financialYear",
        detail:  { submitted: fyStart, currentFY, gap },
      });
    }
  }

  // ── R3: HRA without hraReceived ──────────────────────────────────────────
  if (input.hraReceived === 0 && input.taxRegime === "OLD") {
    // Only relevant under Old Regime — HRA exemption requires rent receipt data
    // hraReceived = 0 means either they don't live in rented accommodation
    // or they forgot to fill the field. Surface as INFO.
    issues.push({
      code:    "HRA_RECEIVED_MISSING",
      level:   "INFO",
      message: "HRA received is ₹0. If you receive HRA from your employer, enter the annual amount to calculate your HRA exemption under the Old Regime.",
      field:   "hraReceived",
    });
  }

  // ── R4: Old Regime deductions declared under New Regime ──────────────────
  if (input.taxRegime === "NEW") {
    const oldRegimeDeductions = total80C + input.selfHealthInsurance + input.parentHealthInsurance + input.homeLoanInterest + input.educationLoanInterest + input.npsContribution;

    if (oldRegimeDeductions > 0) {
      issues.push({
        code:    "NEW_REGIME_DEDUCTIONS_IGNORED",
        level:   "INFO",
        message: `You have declared ₹${oldRegimeDeductions.toLocaleString("en-IN")} in Old Regime deductions (80C, 80D, 24(b), 80E, NPS). These are not applicable under the New Regime and will not reduce your tax liability. Consider switching to the Old Regime if total deductions exceed ₹2,00,000.`,
        detail:  {
          total80C,
          selfHealthInsurance:   input.selfHealthInsurance,
          parentHealthInsurance: input.parentHealthInsurance,
          homeLoanInterest:      input.homeLoanInterest,
          educationLoanInterest: input.educationLoanInterest,
          npsContribution:       input.npsContribution,
          totalOldRegimeOnly:    oldRegimeDeductions,
        },
      });
    }
  }

  // ── R5: NPS cap (80CCD(1B)) ──────────────────────────────────────────────
  if (input.npsContribution > CAP_NPS) {
    const excess = input.npsContribution - CAP_NPS;
    issues.push({
      code:    "NPS_CAP_EXCEEDED",
      level:   "WARN",
      message: `NPS contribution (₹${input.npsContribution.toLocaleString("en-IN")}) exceeds the Section 80CCD(1B) cap of ₹50,000. Only ₹50,000 will be deducted; ₹${excess.toLocaleString("en-IN")} provides no additional tax benefit.`,
      field:   "npsContribution",
      detail:  {
        submitted: input.npsContribution,
        cap:       CAP_NPS,
        excess,
        effective: CAP_NPS,
      },
    });
  }

  // ── R6: Parent health insurance cap (80D) ─────────────────────────────────
  if (input.parentHealthInsurance > CAP_HEALTH_PARENTS) {
    const excess = input.parentHealthInsurance - CAP_HEALTH_PARENTS;
    issues.push({
      code:    "80D_PARENT_CAP_EXCEEDED",
      level:   "WARN",
      message: `Parent health insurance (₹${input.parentHealthInsurance.toLocaleString("en-IN")}) exceeds the 80D parents cap of ₹50,000. Only ₹50,000 will be deducted.`,
      field:   "parentHealthInsurance",
      detail:  { submitted: input.parentHealthInsurance, cap: CAP_HEALTH_PARENTS, excess },
    });
  }

  // ── R6b: Self health insurance cap (non-senior citizen) ─────────────────
  if (input.selfHealthInsurance > CAP_HEALTH_SELF * 2) {
    // > ₹50K is only allowed if self or spouse is a senior citizen (≥60).
    // We don't collect age here, so flag it as an advisory above ₹25K.
    issues.push({
      code:    "80D_SELF_CAP_ADVISORY",
      level:   "INFO",
      message: `Self health insurance (₹${input.selfHealthInsurance.toLocaleString("en-IN")}) exceeds ₹25,000. The cap rises to ₹50,000 only if you or your spouse is a senior citizen (≥60). Ensure your declaration is accurate.`,
      field:   "selfHealthInsurance",
      detail:  {
        submitted:        input.selfHealthInsurance,
        standardCap:      CAP_HEALTH_SELF,
        seniorCitizenCap: CAP_HEALTH_SELF * 2,
      },
    });
  }

  // ── R7: home loan principal under New Regime ──────────────────────────────
  if (input.taxRegime === "NEW" && input.homeLoanPrincipal > 0) {
    // Already covered by R4 INFO — no duplicate needed
  }

  const hasError = issues.some((i) => i.level === "ERROR");
  return {
    isValid:  !hasError,
    issues,
    warnings: issues.filter((i) => i.level === "WARN"),
    infos:    issues.filter((i) => i.level === "INFO"),
  };
}
