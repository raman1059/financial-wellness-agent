import { z } from "zod";

// ─── Tax Declaration (existing investments on file) ───────────────────────────

export const taxDeclarationSchema = z.object({
  financialYear:         z.string().regex(/^\d{4}-\d{2}$/, "Format: YYYY-YY"),
  taxRegime:             z.enum(["OLD", "NEW"]).default("NEW"),
  ppfAmount:             z.number().min(0).default(0),
  elssAmount:            z.number().min(0).default(0),
  lifeInsurance:         z.number().min(0).default(0),
  homeLoanPrincipal:     z.number().min(0).default(0),
  nscAmount:             z.number().min(0).default(0),
  tuitionFees:           z.number().min(0).default(0),
  other80C:              z.number().min(0).default(0),
  selfHealthInsurance:   z.number().min(0).default(0),
  parentHealthInsurance: z.number().min(0).default(0),
  hraReceived:           z.number().min(0).default(0),
  npsContribution:       z.number().min(0).default(0),
  homeLoanInterest:      z.number().min(0).default(0),
  educationLoanInterest: z.number().min(0).default(0),
});

export type TaxDeclarationInput = z.infer<typeof taxDeclarationSchema>;

// ─── Tax Savings Simulator ────────────────────────────────────────────────────

const SUPPORTED_SECTIONS = [
  "80C_PPF",      // Additional PPF contribution
  "80C_ELSS",     // Additional ELSS investment
  "80C_LIC",      // Additional life insurance premium
  "NPS",          // Additional NPS Tier-1 u/s 80CCD(1B)
  "80D_SELF",     // Additional health insurance (self/family)
  "80D_PARENT",   // Additional health insurance (parents)
] as const;

export type SimulatorSection = typeof SUPPORTED_SECTIONS[number];

const investmentScenarioSchema = z.object({
  section: z.enum(SUPPORTED_SECTIONS, {
    errorMap: () => ({
      message: `Unsupported section. Must be one of: ${SUPPORTED_SECTIONS.join(", ")}`,
    }),
  }),
  label:            z.string().min(1).max(200),
  additionalAmount: z
    .number()
    .min(1, "Additional amount must be at least ₹1")
    .max(10_000_000, "Additional amount too large"),
});

export const simulateSavingsRequestSchema = z.object({
  financialYear: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Format: YYYY-YY")
    .default("2024-25"),

  // Current declared investments (baseline)
  baseline: z.object({
    // 80C components
    ppf:               z.number().min(0).default(0),
    elss:              z.number().min(0).default(0),
    lifeInsurance:     z.number().min(0).default(0),
    homeLoanPrincipal: z.number().min(0).default(0),
    nsc:               z.number().min(0).default(0),
    tuitionFees:       z.number().min(0).default(0),
    other80C:          z.number().min(0).default(0),

    // NPS additional
    npsAdditional:     z.number().min(0).default(0),

    // 80D
    selfHealthInsurance:   z.number().min(0).default(0),
    parentHealthInsurance: z.number().min(0).default(0),
    selfFamilySenior:      z.boolean().default(false),
    parentSenior:          z.boolean().default(false),
    preventiveHealthCheck: z.number().min(0).max(5000).default(0),

    // 24(b)
    homeLoanInterest:  z.number().min(0).default(0),
    isSelfOccupied:    z.boolean().default(true),

    // 80E
    educationLoanInterest: z.number().min(0).default(0),

    // HRA
    hraReceived:   z.number().min(0).default(0),
    basicSalary:   z.number().min(0).default(0),
    rentPaid:      z.number().min(0).default(0),
    isMetroCity:   z.boolean().default(false),
  }).default({}),

  // What-if scenarios to evaluate
  scenarios: z
    .array(investmentScenarioSchema)
    .min(0)
    .max(10, "Maximum 10 scenarios per request")
    .default([]),
});

export type SimulateSavingsRequest = z.infer<typeof simulateSavingsRequestSchema>;
