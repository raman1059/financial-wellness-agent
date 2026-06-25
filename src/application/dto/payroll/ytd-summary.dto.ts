import { Money } from "@/domain/value-objects/money.vo";
import { PayPeriod } from "@/domain/value-objects/pay-period.vo";
import type { PayrollRecordEntity } from "@/domain/entities/payroll-record.entity";

// ─── DTO shape ────────────────────────────────────────────────────────────────

export interface YtdEarningsDto {
  grossPay: number;
  basicSalary: number;
  hra: number;
  lta: number;
  specialAllowance: number;
  medicalAllowance: number;
  reimbursements: number;
  otherEarnings: number;
}

export interface YtdDeductionsDto {
  tdsDeducted: number;
  providentFund: number;
  professionalTax: number;
  esic: number;
  otherDeductions: number;
  totalDeductions: number;
}

export interface YtdSummaryDto {
  year: number;
  financialYear: string;      // e.g. "2025-26"
  monthsRecorded: number;
  earnings: YtdEarningsDto;
  deductions: YtdDeductionsDto;
  netPay: number;
  ctc: number;
  projectedAnnualGross: number;   // grossPay / monthsRecorded * 12
  projectedAnnualTds: number;     // tdsDeducted / monthsRecorded * 12
  effectiveTdsRate: number;       // percentage
}

// ─── Aggregator ───────────────────────────────────────────────────────────────

/**
 * Aggregates a list of PayrollRecordEntity objects into a YTD summary.
 * `year` should be a calendar year (e.g. 2026) or financial year boundary.
 */
export function buildYtdSummary(
  entities: PayrollRecordEntity[],
  year: number,
): YtdSummaryDto {
  const forYear = entities.filter((e) => e.period.year === year);
  const n = forYear.length;

  const sum = (fn: (e: PayrollRecordEntity) => number) =>
    forYear.reduce((acc, e) => acc + fn(e), 0);

  const grossPay         = sum((e) => e.earnings.grossPay.amount);
  const basicSalary      = sum((e) => e.earnings.basicSalary.amount);
  const hra              = sum((e) => e.earnings.hra.amount);
  const lta              = sum((e) => e.earnings.lta.amount);
  const specialAllowance = sum((e) => e.earnings.specialAllowance.amount);
  const medicalAllowance = sum((e) => e.earnings.medicalAllowance.amount);
  const reimbursements   = sum((e) => e.earnings.reimbursements.total.amount);
  const otherEarnings    = sum((e) => e.earnings.otherEarnings.amount);

  const tdsDeducted      = sum((e) => e.deductions.tdsDeducted.amount);
  const providentFund    = sum((e) => e.deductions.providentFund.amount);
  const professionalTax  = sum((e) => e.deductions.professionalTax.amount);
  const esic             = sum((e) => e.deductions.esic.amount);
  const otherDeductions  = sum((e) => e.deductions.otherDeductions.amount);
  const totalDeductions  = sum((e) => e.deductions.totalDeductions.amount);

  const netPay = grossPay - totalDeductions;
  const ctc    = sum((e) => e.ctc.amount);

  const projectedAnnualGross = n > 0 ? Math.round((grossPay / n) * 12) : 0;
  const projectedAnnualTds   = n > 0 ? Math.round((tdsDeducted / n) * 12) : 0;
  const effectiveTdsRate     = grossPay > 0 ? Math.round((tdsDeducted / grossPay) * 10000) / 100 : 0;

  // Derive financial year from the latest record in the set
  const latestEntity = [...forYear].sort((a, b) => b.period.compareTo(a.period))[0];
  const financialYear = latestEntity?.period.financialYear
    ?? PayPeriod.of(new Date().getMonth() + 1, year).financialYear;

  return {
    year,
    financialYear,
    monthsRecorded: n,
    earnings: { grossPay, basicSalary, hra, lta, specialAllowance, medicalAllowance, reimbursements, otherEarnings },
    deductions: { tdsDeducted, providentFund, professionalTax, esic, otherDeductions, totalDeductions },
    netPay,
    ctc,
    projectedAnnualGross,
    projectedAnnualTds,
    effectiveTdsRate,
  };
}

/**
 * Aggregates by Indian financial year (Apr–Mar span).
 */
export function buildFYSummary(
  entities: PayrollRecordEntity[],
  financialYear: string,
): YtdSummaryDto {
  const forFY = entities.filter((e) => e.period.financialYear === financialYear);
  const [fyStartStr] = financialYear.split("-");
  const fyStart = Number(fyStartStr);

  // Reuse buildYtdSummary logic but over the FY slice
  const dummy = buildYtdSummary(
    // tag all entities with the fyStart year so the year filter passes
    forFY.map((e) => e),   // entities already filtered
    fyStart,               // will not match — see below
  );

  // Build directly since buildYtdSummary filters by calendar year
  const n = forFY.length;
  const sum = (fn: (e: PayrollRecordEntity) => number) =>
    forFY.reduce((acc, e) => acc + fn(e), 0);

  const grossPay         = sum((e) => e.earnings.grossPay.amount);
  const basicSalary      = sum((e) => e.earnings.basicSalary.amount);
  const hra              = sum((e) => e.earnings.hra.amount);
  const lta              = sum((e) => e.earnings.lta.amount);
  const specialAllowance = sum((e) => e.earnings.specialAllowance.amount);
  const medicalAllowance = sum((e) => e.earnings.medicalAllowance.amount);
  const reimbursements   = sum((e) => e.earnings.reimbursements.total.amount);
  const otherEarnings    = sum((e) => e.earnings.otherEarnings.amount);
  const tdsDeducted      = sum((e) => e.deductions.tdsDeducted.amount);
  const providentFund    = sum((e) => e.deductions.providentFund.amount);
  const professionalTax  = sum((e) => e.deductions.professionalTax.amount);
  const esic             = sum((e) => e.deductions.esic.amount);
  const otherDeductions  = sum((e) => e.deductions.otherDeductions.amount);
  const totalDeductions  = sum((e) => e.deductions.totalDeductions.amount);

  void dummy; // suppress unused warning

  return {
    year: fyStart,
    financialYear,
    monthsRecorded: n,
    earnings: { grossPay, basicSalary, hra, lta, specialAllowance, medicalAllowance, reimbursements, otherEarnings },
    deductions: { tdsDeducted, providentFund, professionalTax, esic, otherDeductions, totalDeductions },
    netPay:                grossPay - totalDeductions,
    ctc:                   sum((e) => e.ctc.amount),
    projectedAnnualGross:  n > 0 ? Math.round((grossPay  / n) * 12) : 0,
    projectedAnnualTds:    n > 0 ? Math.round((tdsDeducted / n) * 12) : 0,
    effectiveTdsRate:      grossPay > 0 ? Math.round((tdsDeducted / grossPay) * 10000) / 100 : 0,
  };
}
