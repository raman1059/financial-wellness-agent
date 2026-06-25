/**
 * Field Imputor
 *
 * Derives missing payslip fields from fields that were successfully extracted.
 * Every imputation is recorded in `imputedFields[]` so the caller knows which
 * values are real vs computed — crucial for audit trails and confidence scoring.
 *
 * Pseudocode
 * ----------
 * impute(fields, fileName):
 *
 *   # Phase 1 — derive totals from line items (bottom-up)
 *   if gross = 0 AND any earning > 0:
 *     gross ← basic + hra + lta + special + other          [IMPUTED]
 *
 *   if totalDeductions = 0 AND any deduction > 0:
 *     totalDeductions ← pf + pt + tds + esic + other       [IMPUTED]
 *
 *   if net = 0 AND gross > 0 AND totalDeductions > 0:
 *     net ← gross - totalDeductions                        [IMPUTED]
 *
 *   # Phase 2 — derive line items from totals (top-down, lower confidence)
 *   if gross > 0 AND basic = 0 AND net = 0:
 *     basic ← gross * 0.40    (industry heuristic: ~40% of CTC)  [IMPUTED, LOW_CONF]
 *
 *   if basic > 0 AND pf = 0:
 *     pf ← round(basic * 0.12)     (statutory EPF rate)          [IMPUTED]
 *
 *   if basic > 0 AND hra = 0 AND employeeCity = 'metro':
 *     hra ← round(basic * 0.40)    (HRA = 40% metro, 30% non-metro) [IMPUTED, LOW_CONF]
 *
 *   if total = 0 AND pf > 0:
 *     totalDeductions ← pf + pt + tds + esic + other               [IMPUTED]
 *
 *   # Phase 3 — pay period from filename if still missing
 *   if payPeriodMonth = null:
 *     (month, year) ← extractFromFilename(fileName)                [IMPUTED]
 *
 *   # Phase 4 — professional tax by state slab (if pt = 0)
 *   if professionalTax = 0 AND gross > 0:
 *     pt ← lookupPtSlab(gross)     (Maharashtra: ₹200 if >₹10K)   [IMPUTED]
 *
 *   return { fields: imputedFields, imputedKeys: string[] }
 */

import type { ExtractedFields } from "./field-extractor";
import { normalizePeriod } from "./normalizer";

export interface ImputationResult {
  fields:        ExtractedFields;
  imputedKeys:   Array<keyof ExtractedFields>;  // which fields were derived
  lowConfKeys:   Array<keyof ExtractedFields>;  // derived with low confidence
}

// ─── Professional Tax slabs (Maharashtra — most common in Indian payslips) ────
// Source: Maharashtra State Tax on Professions, Trades, Callings and Employments Act

function lookupMaharashtraPT(grossMonthly: number): number {
  if (grossMonthly > 20000) return 200;
  if (grossMonthly > 10000) return 150;
  return 0;
}

// ─── Main imputor ─────────────────────────────────────────────────────────────

export function imputeFields(
  raw: ExtractedFields,
  fileName?: string,
): ImputationResult {
  // Work on a mutable copy
  const f: ExtractedFields = { ...raw };
  const imputed  = new Set<keyof ExtractedFields>();
  const lowConf  = new Set<keyof ExtractedFields>();

  // ── Phase 1: totals from line items (high confidence) ─────────────────────

  const computedEarnings =
    f.basicSalary + f.hra + f.lta + f.specialAllowance + f.otherEarnings;

  if (f.grossSalary === 0 && computedEarnings > 0) {
    f.grossSalary = computedEarnings;
    imputed.add("grossSalary");
  }

  const computedDeductions =
    f.providentFund + f.professionalTax + f.tdsDeducted + f.esic + f.otherDeductions;

  if (f.totalDeductions === 0 && computedDeductions > 0) {
    f.totalDeductions = computedDeductions;
    imputed.add("totalDeductions");
  }

  if (f.netSalary === 0 && f.grossSalary > 0 && f.totalDeductions > 0) {
    f.netSalary = f.grossSalary - f.totalDeductions;
    imputed.add("netSalary");
  }

  // ── Phase 2: line items from totals (lower confidence) ───────────────────

  // PF from basic: statutory 12%
  if (f.providentFund === 0 && f.basicSalary > 0) {
    f.providentFund = Math.round(f.basicSalary * 0.12);
    imputed.add("providentFund");
    // Re-derive totalDeductions after PF imputation
    if (f.totalDeductions === 0) {
      f.totalDeductions =
        f.providentFund + f.professionalTax + f.tdsDeducted + f.esic + f.otherDeductions;
      imputed.add("totalDeductions");
    }
  }

  // Basic from gross: industry heuristic ~40% (only when we have nothing else)
  if (f.basicSalary === 0 && f.grossSalary > 0 && computedEarnings === 0) {
    f.basicSalary = Math.round(f.grossSalary * 0.40);
    imputed.add("basicSalary");
    lowConf.add("basicSalary");  // low confidence — purely heuristic
  }

  // Professional Tax from Maharashtra slabs
  if (f.professionalTax === 0 && f.grossSalary > 0) {
    const pt = lookupMaharashtraPT(f.grossSalary);
    if (pt > 0) {
      f.professionalTax = pt;
      imputed.add("professionalTax");
      lowConf.add("professionalTax");
    }
  }

  // ── Phase 3: pay period from filename ────────────────────────────────────

  if (!f.payPeriodMonth && fileName) {
    const { month, year } = normalizePeriod(fileName);
    if (month) {
      f.payPeriodMonth = month;
      imputed.add("payPeriodMonth");
    }
    if (year && !f.payPeriodYear) {
      f.payPeriodYear = year;
      imputed.add("payPeriodYear");
    }
  }

  // ── Phase 4: net recalculation after all imputations ─────────────────────

  if (f.netSalary === 0 && f.grossSalary > 0) {
    const finalDed =
      f.providentFund + f.professionalTax + f.tdsDeducted + f.esic + f.otherDeductions;
    if (finalDed > 0) {
      f.netSalary = f.grossSalary - finalDed;
      imputed.add("netSalary");
      f.totalDeductions = finalDed;
      imputed.add("totalDeductions");
    }
  }

  return {
    fields:      f,
    imputedKeys: Array.from(imputed),
    lowConfKeys: Array.from(lowConf),
  };
}
