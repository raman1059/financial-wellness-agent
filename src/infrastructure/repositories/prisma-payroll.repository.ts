import type { IPayrollRepository } from "@/domain/repositories/payroll.repository";
import type { MockPayrollRecord as PayrollRecord } from "../../../mock-data";
import { prisma } from "@/infrastructure/db/prisma/client";

export class PrismaPayrollRepository implements IPayrollRepository {
  async findAllByUser(userId: string): Promise<PayrollRecord[]> {
    return prisma.payrollRecord.findMany({
      where: { userId },
      orderBy: [{ payPeriodYear: "desc" }, { payPeriodMonth: "desc" }],
    });
  }

  async findById(id: string, userId: string): Promise<PayrollRecord | null> {
    return prisma.payrollRecord.findFirst({ where: { id, userId } });
  }

  async findByPeriod(employeeId: string, month: number, year: number): Promise<PayrollRecord | null> {
    return prisma.payrollRecord.findUnique({
      where: { employeeId_payPeriodMonth_payPeriodYear: { employeeId, payPeriodMonth: month, payPeriodYear: year } },
    });
  }

  async create(data: Omit<PayrollRecord, "id" | "createdAt" | "updatedAt">): Promise<PayrollRecord> {
    return prisma.payrollRecord.create({ data });
  }

  async update(id: string, userId: string, data: Partial<PayrollRecord>): Promise<PayrollRecord> {
    return prisma.payrollRecord.update({ where: { id }, data });
  }

  async delete(id: string, userId: string): Promise<void> {
    await prisma.payrollRecord.deleteMany({ where: { id, userId } });
  }

  async getYtdSummary(userId: string, year: number) {
    const records = await prisma.payrollRecord.findMany({
      where: { userId, payPeriodYear: year },
      select: { grossSalary: true, netSalary: true, tdsDeducted: true },
    });
    return {
      grossTotal: records.reduce((s, r) => s + Number(r.grossSalary), 0),
      netTotal: records.reduce((s, r) => s + Number(r.netSalary), 0),
      tdsTotal: records.reduce((s, r) => s + Number(r.tdsDeducted), 0),
    };
  }
}
