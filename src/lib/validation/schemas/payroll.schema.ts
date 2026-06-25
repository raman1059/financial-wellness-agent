import { z } from "zod";

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

export const reimbursementSchema = z.object({
  description: z.string().min(1).max(120),
  amount:      z.number().min(0),
  isTaxable:   z.boolean().default(false),
});

// ─── Create ───────────────────────────────────────────────────────────────────

export const createPayrollSchema = z.object({
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
}).refine(
  (d) => {
    const gross =
      d.basicSalary + d.hra + d.lta + d.specialAllowance +
      d.medicalAllowance + d.otherEarnings +
      d.reimbursements.reduce((s, r) => s + r.amount, 0);
    const deductions =
      d.providentFund + d.professionalTax + d.tdsDeducted + d.esic + d.otherDeductions;
    return deductions <= gross;
  },
  { message: "Total deductions cannot exceed gross salary", path: ["otherDeductions"] },
);

// ─── Update (all fields optional) ────────────────────────────────────────────

export const updatePayrollSchema = createPayrollSchema
  .omit({ payPeriodMonth: true, payPeriodYear: true })
  .partial();

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreatePayrollInput  = z.infer<typeof createPayrollSchema>;
export type UpdatePayrollInput  = z.infer<typeof updatePayrollSchema>;
export type ReimbursementInput  = z.infer<typeof reimbursementSchema>;
