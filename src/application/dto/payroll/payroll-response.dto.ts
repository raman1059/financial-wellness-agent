import type { ReimbursementData } from "@/domain/value-objects/reimbursement.vo";
import type { PayrollRecordEntity } from "@/domain/entities/payroll-record.entity";

// ─── Sub-shapes ───────────────────────────────────────────────────────────────

export interface PeriodDto {
  month: number;
  year: number;
  label: string;          // "April 2024"
  shortLabel: string;     // "Apr 2024"
  financialYear: string;  // "2024-25"
}

export interface EarningsDto {
  basicSalary: number;
  hra: number;
  lta: number;
  specialAllowance: number;
  medicalAllowance: number;
  reimbursements: ReimbursementData[];
  otherEarnings: number;
  grossPay: number;
}

export interface DeductionsDto {
  providentFund: number;
  professionalTax: number;
  tdsDeducted: number;
  esic: number;
  otherDeductions: number;
  totalDeductions: number;
  statutory: number;     // PF + PT + ESIC
  discretionary: number; // TDS + other
}

export interface PayrollSummaryDto {
  grossPay: number;
  netPay: number;
  ctc: number;                  // Cost to Company (includes employer PF)
  employerPfContribution: number;
  effectiveTdsRate: number;     // percentage, e.g. 9.5
  taxableEarnings: number;
}

export interface PayrollMetaDto {
  isVerified: boolean;
  verifiedAt: string | null;
  payslipId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Full single-record response ──────────────────────────────────────────────

export interface PayrollResponseDto {
  id: string;
  employeeId: string;
  period: PeriodDto;
  earnings: EarningsDto;
  deductions: DeductionsDto;
  summary: PayrollSummaryDto;
  meta: PayrollMetaDto;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function toPayrollResponseDto(entity: PayrollRecordEntity): PayrollResponseDto {
  const { earnings, deductions, period } = entity;

  return {
    id:         entity.id,
    employeeId: entity.employeeId,

    period: {
      month:         period.month,
      year:          period.year,
      label:         period.label,
      shortLabel:    period.shortLabel,
      financialYear: period.financialYear,
    },

    earnings: {
      basicSalary:      earnings.basicSalary.amount,
      hra:              earnings.hra.amount,
      lta:              earnings.lta.amount,
      specialAllowance: earnings.specialAllowance.amount,
      medicalAllowance: earnings.medicalAllowance.amount,
      reimbursements:   earnings.reimbursements.toData(),
      otherEarnings:    earnings.otherEarnings.amount,
      grossPay:         earnings.grossPay.amount,
    },

    deductions: {
      providentFund:   deductions.providentFund.amount,
      professionalTax: deductions.professionalTax.amount,
      tdsDeducted:     deductions.tdsDeducted.amount,
      esic:            deductions.esic.amount,
      otherDeductions: deductions.otherDeductions.amount,
      totalDeductions: deductions.totalDeductions.amount,
      statutory:       deductions.statutory.amount,
      discretionary:   deductions.discretionary.amount,
    },

    summary: {
      grossPay:               entity.grossPay.amount,
      netPay:                 entity.netPay.amount,
      ctc:                    entity.ctc.amount,
      employerPfContribution: entity.employerPfContribution.amount,
      effectiveTdsRate:       Math.round(entity.effectiveTdsRate * 100) / 100,
      taxableEarnings:        entity.taxableEarnings.amount,
    },

    meta: {
      isVerified:  entity.isVerified,
      verifiedAt:  entity.verifiedAt?.toISOString() ?? null,
      payslipId:   entity.payslipId,
      createdAt:   entity.createdAt.toISOString(),
      updatedAt:   entity.updatedAt.toISOString(),
    },
  };
}
