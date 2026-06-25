import type { PayrollListResponseDto, PayrollResponseDto, YtdSummaryDto } from "@/application/dto/payroll";
import type { CreatePayrollInput, UpdatePayrollInput } from "@/lib/validation/schemas/payroll.schema";
import { prisma } from "@/infrastructure/db/prisma/client";
import { auditService } from "@/infrastructure/audit/db-audit-logger";
import { PayrollRecordEntity, type PayrollRecordData } from "@/domain/entities/payroll-record.entity";
import { toPayrollResponseDto } from "@/application/dto/payroll/payroll-response.dto";
import { buildYtdSummary } from "@/application/dto/payroll/ytd-summary.dto";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import type { MockPayrollRecord } from "../../../mock-data";

// ─── Service contract ─────────────────────────────────────────────────────────

export interface IPayrollService {
  list(userId: string): Promise<PayrollListResponseDto>;
  getById(userId: string, recordId: string): Promise<PayrollResponseDto>;
  create(userId: string, input: CreatePayrollInput): Promise<PayrollResponseDto>;
  update(userId: string, recordId: string, input: UpdatePayrollInput): Promise<PayrollResponseDto>;
  remove(userId: string, recordId: string): Promise<void>;
  getYtd(userId: string, year: number): Promise<YtdSummaryDto>;
  getByFinancialYear(userId: string, fy: string): Promise<PayrollResponseDto[]>;
}

// ─── Mapper: raw DB row → domain entity ──────────────────────────────────────

function toEntity(raw: MockPayrollRecord): PayrollRecordEntity {
  const data: PayrollRecordData = {
    ...raw,
    lta: raw.lta ?? 0,
    reimbursements: (raw as unknown as { reimbursements?: unknown }).reimbursements
      ? (raw as unknown as { reimbursements: Array<{ description: string; amount: number; isTaxable: boolean }> }).reimbursements
      : [],
  };
  return PayrollRecordEntity.fromData(data);
}

// ─── Concrete service ─────────────────────────────────────────────────────────

export class PayrollService implements IPayrollService {
  async list(userId: string): Promise<PayrollListResponseDto> {
    const rows = await prisma.payrollRecord.findMany({
      where: { userId },
      orderBy: [{ payPeriodYear: "desc" }, { payPeriodMonth: "desc" }],
    });

    const entities = rows.map(toEntity);
    const records  = entities.map(toPayrollResponseDto);
    const year     = new Date().getFullYear();
    const ytd      = buildYtdSummary(entities, year);

    const financialYears = [
      ...new Set(entities.map((e) => e.period.financialYear)),
    ].sort((a, b) => b.localeCompare(a));

    return { records, ytd, total: records.length, financialYears };
  }

  async getById(userId: string, recordId: string): Promise<PayrollResponseDto> {
    const row = await prisma.payrollRecord.findFirst({ where: { id: recordId, userId } });
    if (!row) throw new NotFoundError(`Payroll record ${recordId} not found`);
    return toPayrollResponseDto(toEntity(row));
  }

  async create(userId: string, input: CreatePayrollInput): Promise<PayrollResponseDto> {
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundError("Employee profile not found");

    const existing = await prisma.payrollRecord.findUnique({
      where: {
        employeeId_payPeriodMonth_payPeriodYear: {
          employeeId: employee.id,
          payPeriodMonth: input.payPeriodMonth,
          payPeriodYear: input.payPeriodYear,
        },
      },
    });
    if (existing) throw new ValidationError("Payroll record already exists for this period");

    const reimbursements = (input as { reimbursements?: Array<{ description: string; amount: number; isTaxable: boolean }> }).reimbursements ?? [];
    const reimbTotal = reimbursements.reduce((s, r) => s + r.amount, 0);

    const grossSalary =
      input.basicSalary +
      input.hra +
      (input.lta ?? 0) +
      input.specialAllowance +
      input.medicalAllowance +
      reimbTotal +
      input.otherEarnings;

    const totalDeductions =
      input.providentFund +
      input.professionalTax +
      input.tdsDeducted +
      input.esic +
      input.otherDeductions;

    const row = await prisma.payrollRecord.create({
      data: {
        employeeId:       employee.id,
        userId,
        payPeriodMonth:   input.payPeriodMonth,
        payPeriodYear:    input.payPeriodYear,
        basicSalary:      input.basicSalary,
        hra:              input.hra,
        lta:              input.lta ?? 0,
        specialAllowance: input.specialAllowance,
        medicalAllowance: input.medicalAllowance,
        otherEarnings:    input.otherEarnings + reimbTotal,
        providentFund:    input.providentFund,
        professionalTax:  input.professionalTax,
        tdsDeducted:      input.tdsDeducted,
        esic:             input.esic,
        otherDeductions:  input.otherDeductions,
        grossSalary,
        totalDeductions,
        netSalary:        grossSalary - totalDeductions,
        payslipId:        null,
        isVerified:       false,
        verifiedAt:       null,
      },
    });

    await auditService.log({
      userId,
      actorId: userId,
      action: "RECORD_CREATED",
      resourceType: "PayrollRecord",
      resourceId: row.id,
      metadata: { payPeriodMonth: input.payPeriodMonth, payPeriodYear: input.payPeriodYear },
    });

    return toPayrollResponseDto(toEntity(row));
  }

  async update(userId: string, recordId: string, input: UpdatePayrollInput): Promise<PayrollResponseDto> {
    const existing = await prisma.payrollRecord.findFirst({ where: { id: recordId, userId } });
    if (!existing) throw new NotFoundError(`Payroll record ${recordId} not found`);

    const merged = { ...existing, ...input };
    const reimbursements = (input as { reimbursements?: Array<{ description: string; amount: number; isTaxable: boolean }> }).reimbursements ?? [];
    const reimbTotal = reimbursements.reduce((s, r) => s + r.amount, 0);

    const grossSalary =
      merged.basicSalary + merged.hra + (merged.lta ?? 0) +
      merged.specialAllowance + merged.medicalAllowance +
      reimbTotal + merged.otherEarnings;

    const totalDeductions =
      merged.providentFund + merged.professionalTax +
      merged.tdsDeducted + merged.esic + merged.otherDeductions;

    const updated = await prisma.payrollRecord.update({
      where: { id: recordId },
      data: { ...merged, grossSalary, totalDeductions, netSalary: grossSalary - totalDeductions },
    });

    await auditService.log({
      userId,
      actorId: userId,
      action: "RECORD_UPDATED",
      resourceType: "PayrollRecord",
      resourceId: recordId,
    });

    return toPayrollResponseDto(toEntity(updated));
  }

  async remove(userId: string, recordId: string): Promise<void> {
    const existing = await prisma.payrollRecord.findFirst({ where: { id: recordId, userId } });
    if (!existing) throw new NotFoundError(`Payroll record ${recordId} not found`);

    await prisma.payrollRecord.deleteMany({ where: { id: recordId } });
    await auditService.log({
      userId,
      actorId: userId,
      action: "RECORD_DELETED",
      resourceType: "PayrollRecord",
      resourceId: recordId,
    });
  }

  async getYtd(userId: string, year: number): Promise<YtdSummaryDto> {
    const rows = await prisma.payrollRecord.findMany({
      where: { userId, payPeriodYear: year },
    });
    return buildYtdSummary(rows.map(toEntity), year);
  }

  async getByFinancialYear(userId: string, fy: string): Promise<PayrollResponseDto[]> {
    const [fyStartStr] = fy.split("-");
    const fyStart = Number(fyStartStr);

    const rows = await prisma.payrollRecord.findMany({
      where: {
        userId,
        OR: [
          { payPeriodYear: fyStart,     payPeriodMonth: { gte: 4 } },
          { payPeriodYear: fyStart + 1, payPeriodMonth: { lte: 3 } },
        ],
      },
      orderBy: [{ payPeriodYear: "asc" }, { payPeriodMonth: "asc" }],
    });

    return rows.map(toEntity).map(toPayrollResponseDto);
  }
}

export const payrollService = new PayrollService();
