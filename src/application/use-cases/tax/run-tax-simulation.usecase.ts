import { TaxBracketService, type TaxRegime } from "@/domain/services/tax-bracket.service";
import { prisma } from "@/infrastructure/db/prisma/client";
import { auditService } from "@/infrastructure/audit/db-audit-logger";

export interface TaxSimulationResult {
  financialYear:         string;
  taxRegime:             TaxRegime;
  grossIncome:           number;
  standardDeduction:     number;
  section80C:            number;
  section80D:            number;
  hraExemption:          number;
  npsDeduction:          number;
  totalDeductions:       number;
  taxableIncome:         number;
  estimatedTaxLiability: number;
  totalTdsPaid:          number;
  taxPayable:            number;
  effectiveRate:         number;
  rebateApplied:         boolean;
}

export class RunTaxSimulationUseCase {
  private readonly taxService = new TaxBracketService();

  async execute(userId: string, financialYear: string): Promise<TaxSimulationResult> {
    const declaration = await prisma.taxDeclaration.findFirst({
      where: { userId, financialYear },
    });

    // FY "2024-25" → fyStartYear = 2024, fyEndYear = 2025
    const [fyStartYear] = financialYear.split("-").map(Number);
    const fyEndYear = fyStartYear + 1;

    const payrollRecords = await prisma.payrollRecord.findMany({
      where: {
        userId,
        OR: [
          { payPeriodYear: fyStartYear, payPeriodMonth: { gte: 4 } },
          { payPeriodYear: fyEndYear,   payPeriodMonth: { lte: 3 } },
        ],
      },
    });

    const grossIncome  = payrollRecords.reduce((s, r) => s + Number(r.grossSalary), 0);
    const totalTdsPaid = payrollRecords.reduce((s, r) => s + Number(r.tdsDeducted), 0);

    const regime: TaxRegime = (declaration?.taxRegime as TaxRegime) ?? "NEW";

    // Standard deduction differs by regime and FY
    const standardDeduction = this.taxService.standardDeduction(regime, financialYear);

    const section80C    = Math.min(Number(declaration?.total80C            ?? 0), 150_000);
    const section80D    = Number(declaration?.selfHealthInsurance ?? 0) + Number(declaration?.parentHealthInsurance ?? 0);
    const hraExemption  = Number(declaration?.hraExempt           ?? 0);
    const npsDeduction  = Math.min(Number(declaration?.npsContribution     ?? 0), 50_000);

    const totalDeductions =
      regime === "OLD"
        ? standardDeduction + section80C + section80D + hraExemption + npsDeduction
        : standardDeduction;

    const taxableIncome = Math.max(grossIncome - totalDeductions, 0);
    const breakdown     = this.taxService.computeBreakdown(taxableIncome, regime, financialYear);
    const effectiveRate = this.taxService.effectiveRate(taxableIncome, regime, financialYear);

    const result: TaxSimulationResult = {
      financialYear,
      taxRegime:             regime,
      grossIncome,
      standardDeduction,
      section80C,
      section80D,
      hraExemption,
      npsDeduction,
      totalDeductions,
      taxableIncome,
      estimatedTaxLiability: breakdown.totalTax,
      totalTdsPaid,
      taxPayable:            breakdown.totalTax - totalTdsPaid,
      effectiveRate,
      rebateApplied:         breakdown.rebateApplied,
    };

    const startMs = Date.now();

    if (declaration) {
      await prisma.taxDeclaration.update({
        where: { id: declaration.id },
        data: {
          grossIncome,
          standardDeduction,
          totalDeductions,
          taxableIncome,
          estimatedTaxLiability: breakdown.totalTax,
          totalTdsPaid,
          taxPayable: breakdown.totalTax - totalTdsPaid,
        },
      });
    }

    void auditService.logEvent(
      "TAX_SIMULATION_RUN",
      {
        financialYear,
        regime,
        grossIncome,
        taxLiability: breakdown.totalTax,
        durationMs:   Date.now() - startMs,
      },
      {
        userId,
        resourceType: "TaxDeclaration",
        resourceId:   declaration?.id,
      },
    );

    return result;
  }
}
