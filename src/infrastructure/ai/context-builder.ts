/**
 * Context Builder
 *
 * Pre-fetches a lightweight user snapshot (record counts, current FY, latest
 * period) and injects it into the system prompt as grounding context.
 *
 * This "pre-flight" context achieves two things:
 *   1. Tells Claude what data *exists* without fetching all of it upfront.
 *   2. Makes Claude aware of data gaps before it asks — so it can proactively
 *      tell the user what's missing rather than hallucinating fill-ins.
 *
 * The snapshot is cheap (3 COUNT queries). The actual records are only fetched
 * when Claude calls a tool.
 */

import { prisma } from "@/infrastructure/db/prisma/client";

export interface UserDataSnapshot {
  payrollRecordCount: number;
  payslipCount:       number;
  latestPayPeriod:    string | null;   // "2026-06" or null
  currentFY:          string;          // "2025-26"
  hasDeclaration:     boolean;
}

/** Current Indian financial year string, e.g. "2025-26". */
function currentFinancialYear(): string {
  const now   = new Date();
  const month = now.getMonth() + 1;   // 1-based
  const year  = now.getFullYear();
  return month >= 4
    ? `${year}-${String(year + 1).slice(-2)}`
    : `${year - 1}-${String(year).slice(-2)}`;
}

export async function buildUserSnapshot(userId: string): Promise<UserDataSnapshot> {
  const [payrollCount, payslipCount, latest, declaration] = await Promise.all([
    prisma.payrollRecord.count({ where: { userId } }),
    prisma.payslip.count({ where: { userId, status: "PARSED" } }),
    prisma.payrollRecord.findFirst({
      where:   { userId },
      orderBy: [{ payPeriodYear: "desc" }, { payPeriodMonth: "desc" }],
    }),
    prisma.taxDeclaration.findFirst({ where: { userId } }),
  ]);

  const latestPayPeriod = latest
    ? `${latest.payPeriodYear}-${String(latest.payPeriodMonth).padStart(2, "0")}`
    : null;

  return {
    payrollRecordCount: payrollCount,
    payslipCount,
    latestPayPeriod,
    currentFY:      currentFinancialYear(),
    hasDeclaration: !!declaration,
  };
}

/** Appends a "User Data Context" section to the base system prompt. */
export function buildSystemPrompt(basePrompt: string, snapshot: UserDataSnapshot): string {
  const dataLines = [
    `- Payroll records on file: ${snapshot.payrollRecordCount}`,
    `- Parsed payslips on file: ${snapshot.payslipCount}`,
    `- Latest payroll period:   ${snapshot.latestPayPeriod ?? "none"}`,
    `- Current financial year:  ${snapshot.currentFY}`,
    `- Tax declaration filed:   ${snapshot.hasDeclaration ? "yes" : "no"}`,
  ];

  const noDataWarning =
    snapshot.payrollRecordCount === 0 && snapshot.payslipCount === 0
      ? "\n\nIMPORTANT: This user has NO payroll records and NO payslips on file. " +
        "If they ask about salary or tax figures, you MUST respond that no data is available " +
        "and guide them to upload a payslip or add payroll records. Do NOT fabricate any numbers."
      : "";

  return (
    basePrompt +
    "\n\n---\nUSER DATA CONTEXT (pre-fetched snapshot):\n" +
    dataLines.join("\n") +
    noDataWarning +
    "\n\nWhen you call a tool and it returns { reason: 'no_records_for_year' } or similar, " +
    "respond with the exact guidance string from the tool result. Never guess at figures."
  );
}
