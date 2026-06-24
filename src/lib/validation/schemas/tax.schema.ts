import { z } from "zod";

export const taxDeclarationSchema = z.object({
  financialYear: z.string().regex(/^\d{4}-\d{2}$/, "Format: YYYY-YY"),
  taxRegime: z.enum(["OLD", "NEW"]).default("NEW"),
  ppfAmount: z.number().min(0).default(0),
  elssAmount: z.number().min(0).default(0),
  lifeInsurance: z.number().min(0).default(0),
  homeLoanPrincipal: z.number().min(0).default(0),
  nscAmount: z.number().min(0).default(0),
  tuitionFees: z.number().min(0).default(0),
  other80C: z.number().min(0).default(0),
  selfHealthInsurance: z.number().min(0).default(0),
  parentHealthInsurance: z.number().min(0).default(0),
  hraReceived: z.number().min(0).default(0),
  npsContribution: z.number().min(0).default(0),
  homeLoanInterest: z.number().min(0).default(0),
  educationLoanInterest: z.number().min(0).default(0),
});

export type TaxDeclarationInput = z.infer<typeof taxDeclarationSchema>;
