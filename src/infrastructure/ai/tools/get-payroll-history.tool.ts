import { z } from "zod";
import { prisma } from "@/infrastructure/db/prisma/client";

export const getPayrollHistoryDefinition = {
  name: "get_payroll_history",
  description: "Fetch payroll records for a specific year or all years. Returns month-by-month salary breakdown.",
  inputSchema: {
    type: "object" as const,
    properties: {
      year: { type: "number", description: "Calendar year e.g. 2025. Omit to get all records." },
      limit: { type: "number", description: "Max records to return. Default 12." },
    },
    required: [],
  },
};

const inputSchema = z.object({
  year: z.number().optional(),
  limit: z.number().min(1).max(36).default(12),
});

export async function executeGetPayrollHistory(
  userId: string,
  rawInput: unknown,
) {
  const { year, limit } = inputSchema.parse(rawInput);
  const records = await prisma.payrollRecord.findMany({
    where: { userId, ...(year ? { payPeriodYear: year } : {}) },
    orderBy: [{ payPeriodYear: "desc" }, { payPeriodMonth: "desc" }],
    take: limit,
    select: {
      payPeriodMonth: true,
      payPeriodYear: true,
      grossSalary: true,
      netSalary: true,
      tdsDeducted: true,
      basicSalary: true,
      hra: true,
      providentFund: true,
    },
  });

  const formatted = records.map((r) => ({
    period: `${r.payPeriodYear}-${String(r.payPeriodMonth).padStart(2, "0")}`,
    grossSalary: Number(r.grossSalary),
    netSalary: Number(r.netSalary),
    tdsDeducted: Number(r.tdsDeducted),
    basicSalary: Number(r.basicSalary),
    hra: Number(r.hra),
    providentFund: Number(r.providentFund),
  }));

  return {
    records: formatted,
    count: formatted.length,
    ytdGross: formatted.reduce((s, r) => s + r.grossSalary, 0),
    ytdTds: formatted.reduce((s, r) => s + r.tdsDeducted, 0),
  };
}
