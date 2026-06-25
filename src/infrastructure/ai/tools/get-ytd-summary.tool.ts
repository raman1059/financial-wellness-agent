import { z } from "zod";
import { prisma } from "@/infrastructure/db/prisma/client";
import { buildYtdSummary, buildFYSummary } from "@/application/dto/payroll/ytd-summary.dto";
import { PayrollRecordEntity } from "@/domain/entities/payroll-record.entity";

export const getYtdSummaryDefinition = {
  name: "get_ytd_summary",
  description:
    "Get year-to-date (YTD) aggregated salary and tax data. " +
    "Use for questions like 'how much have I earned so far this year', " +
    "'what is my total TDS for FY 2024-25', or 'show me my annual summary'.",
  inputSchema: {
    type: "object" as const,
    properties: {
      financialYear: {
        type: "string",
        description: "Indian financial year e.g. '2024-25'. Use for FY-based questions.",
      },
      calendarYear: {
        type: "number",
        description: "Calendar year e.g. 2025. Use for CY-based questions. Defaults to current year.",
      },
    },
    required: [],
  },
};

const inputSchema = z.object({
  financialYear: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  calendarYear:  z.number().optional(),
});

function toEntity(r: {
  id: string; userId: string; employeeId: string;
  payPeriodMonth: number; payPeriodYear: number;
  basicSalary: number; hra: number; lta: number;
  specialAllowance: number; grossSalary: number;
  providentFund: number; professionalTax: number;
  tdsDeducted: number; netSalary: number;
  esic?: number; otherDeductions?: number;
  reimbursements?: unknown; notes?: string | null;
  createdAt: Date; updatedAt: Date;
}): PayrollRecordEntity {
  return PayrollRecordEntity.fromData({
    id: r.id, userId: r.userId, employeeId: r.employeeId,
    payPeriodMonth: r.payPeriodMonth, payPeriodYear: r.payPeriodYear,
    basicSalary: r.basicSalary, hra: r.hra, lta: r.lta,
    specialAllowance: r.specialAllowance, otherEarnings: 0,
    grossSalary: r.grossSalary, providentFund: r.providentFund,
    professionalTax: r.professionalTax, tdsDeducted: r.tdsDeducted,
    esic: r.esic ?? 0, otherDeductions: r.otherDeductions ?? 0,
    netSalary: r.netSalary, reimbursements: [], notes: r.notes ?? null,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  });
}

export async function executeGetYtdSummary(userId: string, rawInput: unknown) {
  const { financialYear, calendarYear } = inputSchema.parse(rawInput);

  if (financialYear) {
    const [startYear] = financialYear.split("-").map(Number);
    const records = await prisma.payrollRecord.findMany({
      where: { userId },
      orderBy: [{ payPeriodYear: "desc" }, { payPeriodMonth: "desc" }],
    });

    const fyRecords = records.filter((r) => {
      if (r.payPeriodMonth >= 4) return r.payPeriodYear === startYear;
      return r.payPeriodYear === startYear + 1;
    });

    if (fyRecords.length === 0) {
      return {
        summary: null,
        reason: "no_records_for_financial_year",
        guidance: `No payroll records found for FY ${financialYear}. Add records on the Payroll page.`,
      };
    }

    const entities = fyRecords.map(toEntity);
    return { summary: buildFYSummary(entities, financialYear), financialYear };
  }

  const year = calendarYear ?? new Date().getFullYear();
  const records = await prisma.payrollRecord.findMany({
    where: { userId, payPeriodYear: year },
    orderBy: [{ payPeriodMonth: "desc" }],
  });

  if (records.length === 0) {
    return {
      summary: null,
      reason: "no_records_for_year",
      guidance: `No payroll records found for ${year}. Add records on the Payroll page.`,
    };
  }

  const entities = records.map(toEntity);
  return { summary: buildYtdSummary(entities, year), calendarYear: year };
}
