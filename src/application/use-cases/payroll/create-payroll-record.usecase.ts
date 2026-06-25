import type { IPayrollRepository } from "@/domain/repositories/payroll.repository";
import type { AuditService } from "@/application/services/audit.service";
import type { CreatePayrollInput } from "@/lib/validation/schemas/payroll.schema";
import { ValidationError } from "@/lib/errors/app-error";
import type { MockPayrollRecord as PayrollRecord } from "../../../../mock-data";

export class CreatePayrollRecordUseCase {
  constructor(
    private readonly payrollRepo: IPayrollRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(userId: string, employeeId: string, input: CreatePayrollInput): Promise<PayrollRecord> {
    const existing = await this.payrollRepo.findByPeriod(employeeId, input.payPeriodMonth, input.payPeriodYear);
    if (existing) throw new ValidationError("Payroll record already exists for this period");

    const grossSalary =
      input.basicSalary + input.hra + input.specialAllowance +
      input.lta + input.medicalAllowance + input.otherEarnings;

    const totalDeductions =
      input.providentFund + input.professionalTax + input.tdsDeducted +
      input.esic + input.otherDeductions;

    const record = await this.payrollRepo.create({
      employeeId,
      userId,
      payPeriodMonth: input.payPeriodMonth,
      payPeriodYear: input.payPeriodYear,
      basicSalary: input.basicSalary,
      hra: input.hra,
      specialAllowance: input.specialAllowance,
      lta: input.lta,
      medicalAllowance: input.medicalAllowance,
      otherEarnings: input.otherEarnings,
      grossSalary,
      providentFund: input.providentFund,
      professionalTax: input.professionalTax,
      tdsDeducted: input.tdsDeducted,
      esic: input.esic,
      otherDeductions: input.otherDeductions,
      totalDeductions,
      netSalary: grossSalary - totalDeductions,
      payslipId: null,
      isVerified: false,
      verifiedAt: null,
    });

    await this.auditService.log({
      userId,
      actorId: userId,
      action: "RECORD_CREATED",
      resourceType: "PayrollRecord",
      resourceId: record.id,
      metadata: { payPeriodMonth: input.payPeriodMonth, payPeriodYear: input.payPeriodYear },
    });

    return record;
  }
}
