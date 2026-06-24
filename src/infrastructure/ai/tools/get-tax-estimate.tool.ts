import { z } from "zod";
import { RunTaxSimulationUseCase } from "@/application/use-cases/tax/run-tax-simulation.usecase";

export const getTaxEstimateDefinition = {
  name: "get_tax_estimate",
  description: "Compute estimated income tax liability for a given financial year. Returns taxable income, estimated liability, TDS paid, and tax payable/refundable.",
  inputSchema: {
    type: "object" as const,
    properties: {
      financialYear: {
        type: "string",
        description: "Financial year in format YYYY-YY e.g. '2024-25'",
      },
    },
    required: ["financialYear"],
  },
};

const inputSchema = z.object({ financialYear: z.string() });

const useCase = new RunTaxSimulationUseCase();

export async function executeGetTaxEstimate(userId: string, rawInput: unknown) {
  const { financialYear } = inputSchema.parse(rawInput);
  return useCase.execute(userId, financialYear);
}
