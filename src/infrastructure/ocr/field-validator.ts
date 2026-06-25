/**
 * Field Validator
 *
 * Cross-validates extracted payslip fields using double-entry accounting rules.
 * All amounts in the same payslip must be internally consistent.
 *
 * Returns typed errors (not thrown exceptions) so the caller can decide
 * whether to reject or soft-accept with warnings.
 */

import type { ExtractedFields } from "./field-extractor";

export type ValidationSeverity = "ERROR" | "WARNING";

export interface ValidationIssue {
  code:     string;
  severity: ValidationSeverity;
  message:  string;
  expected?: number;
  actual?:   number;
  tolerance?: number;
}

export interface ValidationReport {
  isValid:       boolean;    // true if no ERRORs (warnings are allowed)
  issues:        ValidationIssue[];
  overallScore:  number;     // 0-1, decremented per issue
  repairedFields: Partial<ExtractedFields>; // fields corrected by heuristics
}

const TOLERANCE = 0.01; // 1% tolerance for floating-point rounding

function near(a: number, b: number, pct = TOLERANCE): boolean {
  if (b === 0) return a === 0;
  return Math.abs(a - b) / b <= pct;
}

export function validateFields(f: ExtractedFields): ValidationReport {
  const issues: ValidationIssue[] = [];
  const repairedFields: Partial<ExtractedFields> = {};
  let score = 1.0;

  // ── Rule 1: Gross = sum of earning components ─────────────────────────────
  const computedGross =
    f.basicSalary + f.hra + f.lta + f.specialAllowance + f.otherEarnings;

  if (f.grossSalary > 0 && !near(f.grossSalary, computedGross, 0.03)) {
    // Allow 3% tolerance — some slips include allowances we don't model
    if (computedGross > 0) {
      issues.push({
        code:     "GROSS_MISMATCH",
        severity: "WARNING",
        message:  "Extracted gross salary does not match sum of components",
        expected: computedGross,
        actual:   f.grossSalary,
        tolerance: 3,
      });
      score -= 0.1;
      // Trust the stated gross over the sum — some allowances may be unlabelled
    }
  } else if (f.grossSalary === 0 && computedGross > 0) {
    // Repair: derive gross from components
    repairedFields.grossSalary = computedGross;
    score -= 0.05;
  }

  const effectiveGross = f.grossSalary || computedGross;

  // ── Rule 2: Total Deductions = sum of deduction lines ────────────────────
  const computedDed =
    f.providentFund + f.professionalTax + f.tdsDeducted + f.esic + f.otherDeductions;

  if (f.totalDeductions > 0 && !near(f.totalDeductions, computedDed, 0.03)) {
    issues.push({
      code:     "DEDUCTIONS_MISMATCH",
      severity: "WARNING",
      message:  "Total deductions do not match sum of deduction lines",
      expected: computedDed,
      actual:   f.totalDeductions,
    });
    score -= 0.1;
  } else if (f.totalDeductions === 0 && computedDed > 0) {
    repairedFields.totalDeductions = computedDed;
    score -= 0.05;
  }

  const effectiveDed = f.totalDeductions || computedDed;

  // ── Rule 3: Net = Gross − Deductions ─────────────────────────────────────
  const computedNet = effectiveGross - effectiveDed;

  if (f.netSalary > 0 && !near(f.netSalary, computedNet, 0.03)) {
    issues.push({
      code:     "NET_MISMATCH",
      severity: "ERROR",
      message:  "Net salary does not reconcile: gross − deductions ≠ net",
      expected: computedNet,
      actual:   f.netSalary,
    });
    score -= 0.25;
  } else if (f.netSalary === 0 && computedNet > 0) {
    repairedFields.netSalary = computedNet;
    score -= 0.05;
  }

  // ── Rule 4: Basic salary plausibility ─────────────────────────────────────
  if (f.basicSalary === 0) {
    issues.push({
      code:     "BASIC_MISSING",
      severity: "ERROR",
      message:  "Basic salary is zero or could not be extracted",
    });
    score -= 0.3;
  }

  if (effectiveGross > 0 && f.basicSalary > effectiveGross) {
    issues.push({
      code:     "BASIC_EXCEEDS_GROSS",
      severity: "ERROR",
      message:  "Basic salary cannot exceed gross salary",
      expected: effectiveGross,
      actual:   f.basicSalary,
    });
    score -= 0.3;
  }

  // ── Rule 5: HRA ≤ 50% of basic (Indian tax rule) ─────────────────────────
  if (f.basicSalary > 0 && f.hra > 0 && f.hra > f.basicSalary * 0.6) {
    issues.push({
      code:     "HRA_EXCESSIVE",
      severity: "WARNING",
      message:  "HRA exceeds 60% of basic salary — verify the payslip",
      expected: f.basicSalary * 0.5,
      actual:   f.hra,
    });
    score -= 0.1;
  }

  // ── Rule 6: PF = 12% of basic (statutory minimum) ────────────────────────
  if (f.basicSalary > 0 && f.providentFund > 0) {
    const expectedPf = Math.round(f.basicSalary * 0.12);
    if (!near(f.providentFund, expectedPf, 0.05)) {
      issues.push({
        code:     "PF_RATE_UNUSUAL",
        severity: "WARNING",
        message:  "PF deduction does not match expected 12% of basic salary",
        expected: expectedPf,
        actual:   f.providentFund,
      });
      score -= 0.05;
    }
  }

  // ── Rule 7: Reasonable salary bounds ─────────────────────────────────────
  if (effectiveGross > 0 && effectiveGross < 5000) {
    issues.push({ code: "GROSS_TOO_LOW",  severity: "WARNING", message: "Gross salary seems unusually low (< ₹5,000)" });
    score -= 0.1;
  }
  if (effectiveGross > 10_000_000) {
    issues.push({ code: "GROSS_TOO_HIGH", severity: "WARNING", message: "Gross salary seems unusually high (> ₹1 Cr/month)" });
    score -= 0.1;
  }

  // ── Rule 8: Pay period must be present ───────────────────────────────────
  if (!f.payPeriodMonth || !f.payPeriodYear) {
    issues.push({
      code:     "PERIOD_MISSING",
      severity: "ERROR",
      message:  "Pay period (month/year) could not be determined from payslip",
    });
    score -= 0.2;
  }

  const hasErrors = issues.some((i) => i.severity === "ERROR");

  return {
    isValid:       !hasErrors,
    issues,
    overallScore:  Math.max(0, Math.min(1, score)),
    repairedFields,
  };
}
