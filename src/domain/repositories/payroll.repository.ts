import type { PayrollRecord } from "@prisma/client";

export interface IPayrollRepository {
  findAllByUser(userId: string): Promise<PayrollRecord[]>;
  findById(id: string, userId: string): Promise<PayrollRecord | null>;
  findByPeriod(employeeId: string, month: number, year: number): Promise<PayrollRecord | null>;
  create(data: Omit<PayrollRecord, "id" | "createdAt" | "updatedAt">): Promise<PayrollRecord>;
  update(id: string, userId: string, data: Partial<PayrollRecord>): Promise<PayrollRecord>;
  delete(id: string, userId: string): Promise<void>;
  getYtdSummary(userId: string, year: number): Promise<{ grossTotal: number; netTotal: number; tdsTotal: number }>;
}
