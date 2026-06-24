import { TaxBracketService, type TaxRegime } from "@/domain/services/tax-bracket.service";
import { prisma } from "@/infrastructure/db/prisma/client";

export interface TaxSimulationResult {
  financialYear: string;
  taxRegime: TaxRegime;
  grossIncome: number;
  standardDeduction: number;
  section80C: number;
  section80D: number;
  hraExemption: number;
  npsDeduction: number;
  totalDeductions: number;
  taxableIncome: number;
  estimatedTaxLiability: number;
  totalTdsPaid: number;
  taxPayable: number;
  effectiveRate: number;
}

export class RunTaxSimulationUseCase {
  private readonly taxService = new TaxBracketService();

  async execute(userId: string, financialYear: string): Promise<TaxSimulationResult> {
    const declaration = await prisma.taxDeclaration.findFirst({
      where: { userId, financialYear },
      include: { employee: true },
    });

    const [fyStart, fyEnd] = financialYear.split("-").map(Number);

    // Sum payroll records for the FY (April to March)
    const payrollRecords = await prisma.payrollRecord.findMany({
      where: {
        userId,
        OR: [
          { payPeriodYear: 2000 + fyStart, payPeriodMonth: { gte: 4 } },
          { payPeriodYear: 2000 + fyEnd, payPeriodMonth: { lte: 3 } },
        ],
      },
    });

    const grossIncome = payrollRecords.reduce(
      (sum, r) => sum + Number(r.grossSalary), 0,
    );
    const totalTdsPaid = payrollRecords.reduce(
      (sum, r) => sum + Number(r.tdsDeducted), 0,
    );

    const regime: TaxRegime = (declaration?.taxRegime as TaxRegime) ?? "NEW";
    const STANDARD_DEDUCTION = 50000;

    const section80C = Math.min(Number(declaration?.total80C ?? 0), 150000);
    const section80D = Number(declaration?.selfHealthInsurance ?? 0) + Number(declaration?.parentHealthInsurance ?? 0);
    const hraExemption = Number(declaration?.hraExempt ?? 0);
    const npsDeduction = Math.min(Number(declaration?.npsContribution ?? 0), 50000);

    const totalDeductions =
      regime === "OLD"
        ? STANDARD_DEDUCTION + section80C + section80D + hraExemption + npsDeduction
        : STANDARD_DEDUCTION;

    const taxableIncome = Math.max(grossIncome - totalDeductions, 0);
    const estimatedTaxLiability = this.taxService.computeTax(taxableIncome, regime);
    const effectiveRate = this.taxService.effectiveRate(taxableIncome, regime);

    const result = {
      financialYear,
      taxRegime: regime,
      grossIncome,
      standardDeduction: STANDARD_DEDUCTION,
      section80C,
      section80D,
      hraExemption,
      npsDeduction,
      totalDeductions,
      taxableIncome,
      estimatedTaxLiability,
      totalTdsPaid,
      taxPayable: estimatedTaxLiability - totalTdsPaid,
      effectiveRate,
    };

    // Persist the computed values
    if (declaration) {
      await prisma.taxDeclaration.update({
        where: { id: declaration.id },
        data: {
          grossIncome,
          standardDeduction: STANDARD_DEDUCTION,
          totalDeductions,
          taxableIncome,
          estimatedTaxLiability,
          totalTdsPaid,
          taxPayable: estimatedTaxLiability - totalTdsPaid,
        },
      });
    }

    return result;
  }
}
