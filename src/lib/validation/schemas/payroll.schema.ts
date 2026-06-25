import { z } from "zod";

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

export const reimbursementSchema = z.object({
  description: z.string().min(1).max(120),
  amount:      z.number().min(0),
  isTaxable:   z.boolean().default(false),
});

// ─── Create ───────────────────────────────────────────────────────────────────

const payrollBaseSchema = z.object({
  // Period
  payPeriodMonth: z.number().int().min(1).max(12),
  payPeriodYear:  z.number().int().min(2000).max(2100),

  // Earnings
  basicSalary:      z.number().positive("Basic salary must be positive"),
  hra:              z.number().min(0).default(0),
  lta:              z.number().min(0).default(0),
  specialAllowance: z.number().min(0).default(0),
  medicalAllowance: z.number().min(0).default(0),
  reimbursements:   z.array(reimbursementSchema).default([]),
  otherEarnings:    z.number().min(0).default(0),

  // Deductions
  providentFund:   z.number().min(0).default(0),
  professionalTax: z.number().min(0).default(0),
  tdsDeducted:     z.number().min(0).default(0),
  esic:            z.number().min(0).default(0),
  otherDeductions: z.number().min(0).default(0),
});

const deductionsRefinement = (d: {
  basicSalary: number; hra: number; lta: number; specialAllowance: number;
  medicalAllowance: number; otherEarnings: number;
  reimbursements: { amount: number }[];
  providentFund: number; professionalTax: number; tdsDeducted: number;
  esic: number; otherDeductions: number;
}) => {
  const gross =
    d.basicSalary + d.hra + d.lta + d.specialAllowance +
    d.medicalAllowance + d.otherEarnings +
    d.reimbursements.reduce((s, r) => s + r.amount, 0);
  const deductions =
    d.providentFund + d.professionalTax + d.tdsDeducted + d.esic + d.otherDeductions;
  return deductions <= gross;
};

export const createPayrollSchema = payrollBaseSchema.refine(
  deductionsRefinement,
  { message: "Total deductions cannot exceed gross salary", path: ["otherDeductions"] },
);

// ─── Update (all fields optional) ────────────────────────────────────────────

export const updatePayrollSchema = payrollBaseSchema
  .omit({ payPeriodMonth: true, payPeriodYear: true })
  .partial()
  .refine(
    (d) => deductionsRefinement({ basicSalary: 0, hra: 0, lta: 0, specialAllowance: 0, medicalAllowance: 0, otherEarnings: 0, reimbursements: [], providentFund: 0, professionalTax: 0, tdsDeducted: 0, esic: 0, otherDeductions: 0, ...d }),
    { message: "Total deductions cannot exceed gross salary", path: ["otherDeductions"] },
  );

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreatePayrollInput  = z.infer<typeof createPayrollSchema>;
export type UpdatePayrollInput  = z.infer<typeof updatePayrollSchema>;
export type ReimbursementInput  = z.infer<typeof reimbursementSchema>;
