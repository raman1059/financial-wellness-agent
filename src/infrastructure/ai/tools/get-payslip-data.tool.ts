import { z } from "zod";
import { prisma } from "@/infrastructure/db/prisma/client";

export const getPayslipDataDefinition = {
  name: "get_payslip_data",
  description:
    "Fetch uploaded payslip documents and their OCR-extracted fields for a user. " +
    "Use this when the user asks about a specific payslip, wants to verify OCR data, " +
    "or when payroll records are absent and payslips are the only source.",
  inputSchema: {
    type: "object" as const,
    properties: {
      status: {
        type: "string",
        enum: ["PARSED", "VERIFIED", "FAILED", "PROCESSING"],
        description: "Filter by processing status. Omit to get all.",
      },
      limit: {
        type: "number",
        description: "Max results to return. Default 10.",
      },
    },
    required: [],
  },
};

const inputSchema = z.object({
  status: z.enum(["PARSED", "VERIFIED", "FAILED", "PROCESSING"]).optional(),
  limit: z.number().min(1).max(20).default(10),
});

export async function executeGetPayslipData(userId: string, rawInput: unknown) {
  const { status, limit } = inputSchema.parse(rawInput);

  const payslips = await prisma.payslip.findMany({
    where: {
      userId,
      ...(status ? { status } : { status: "PARSED" }),
    },
    orderBy: [{ payPeriodYear: "desc" }, { payPeriodMonth: "desc" }],
    take: limit,
  });

  if (payslips.length === 0) {
    return {
      payslips: [],
      count: 0,
      reason: "no_payslips_found",
      guidance:
        "No payslips have been uploaded and parsed yet. " +
        "Upload a payslip PDF or image on the Documents page.",
    };
  }

  const formatted = payslips.map((p) => {
    const f = (p.parsedFields as Record<string, number | null> | null) ?? {};
    return {
      id:              p.id,
      fileName:        p.fileName,
      period:          p.payPeriodMonth && p.payPeriodYear
        ? `${p.payPeriodYear}-${String(p.payPeriodMonth).padStart(2, "0")}`
        : "unknown",
      ocrConfidence:   p.ocrConfidence ?? 0,
      status:          p.status,
      basicSalary:     Number(f.basicSalary  ?? 0),
      hra:             Number(f.hra           ?? 0),
      grossSalary:     Number(f.grossSalary   ?? 0),
      netSalary:       Number(f.netSalary     ?? 0),
      tdsDeducted:     Number(f.tdsDeducted   ?? 0),
      providentFund:   Number(f.providentFund ?? 0),
      imputedFields:   (f.imputedFields as string[] | undefined) ?? [],
    };
  });

  const lowConfidence = formatted.filter((p) => p.ocrConfidence < 0.70);

  return {
    payslips: formatted,
    count: formatted.length,
    ...(lowConfidence.length > 0 && {
      dataQualityWarning:
        `${lowConfidence.length} payslip(s) have low OCR confidence (< 70%). ` +
        "Figures from these documents may be inaccurate.",
    }),
  };
}
