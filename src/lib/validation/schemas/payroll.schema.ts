import { z } from "zod";

export const createPayrollSchema = z.object({
  payPeriodMonth: z.number().int().min(1).max(12),
  payPeriodYear: z.number().int().min(2020).max(2100),
  basicSalary: z.number().positive(),
  hra: z.number().min(0).default(0),
  specialAllowance: z.number().min(0).default(0),
  lta: z.number().min(0).default(0),
  medicalAllowance: z.number().min(0).default(0),
  otherEarnings: z.number().min(0).default(0),
  providentFund: z.number().min(0).default(0),
  professionalTax: z.number().min(0).default(0),
  tdsDeducted: z.number().min(0).default(0),
  esic: z.number().min(0).default(0),
  otherDeductions: z.number().min(0).default(0),
});

export const updatePayrollSchema = createPayrollSchema.partial();

export type CreatePayrollInput = z.infer<typeof createPayrollSchema>;
export type UpdatePayrollInput = z.infer<typeof updatePayrollSchema>;
