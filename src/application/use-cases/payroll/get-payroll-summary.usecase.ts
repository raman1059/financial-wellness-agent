import type { IPayrollRepository } from "@/domain/repositories/payroll.repository";
import type { MockPayrollRecord as PayrollRecord } from "../../../../mock-data";

export interface PayrollSummary {
  records: PayrollRecord[];
  ytd: { grossTotal: number; netTotal: number; tdsTotal: number };
  currentYear: number;
}

export class GetPayrollSummaryUseCase {
  constructor(private readonly payrollRepo: IPayrollRepository) {}

  async execute(userId: string): Promise<PayrollSummary> {
    const currentYear = new Date().getFullYear();
    const [records, ytd] = await Promise.all([
      this.payrollRepo.findAllByUser(userId),
      this.payrollRepo.getYtdSummary(userId, currentYear),
    ]);
    return { records, ytd, currentYear };
  }
}
