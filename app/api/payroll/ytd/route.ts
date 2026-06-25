import { NextRequest, NextResponse } from "next/server";
import { payrollService } from "@/application/services/payroll.service";
import { toApiError } from "@/lib/errors/app-error";
import { withAuth } from "@/lib/middleware/with-auth";

/**
 * GET /api/payroll/ytd?year=2026
 * GET /api/payroll/ytd?fy=2024-25
 *
 * Returns YTD earnings, deductions, and projections.
 */
export const GET = withAuth(async (req: NextRequest, _ctx, { userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const fyParam   = searchParams.get("fy");
    const yearParam = searchParams.get("year");

    if (fyParam) {
      const records = await payrollService.getByFinancialYear(userId, fyParam);
      const hasData = records.length > 0;
      return NextResponse.json({
        financialYear: fyParam,
        records,
        hasData,
        ...(hasData ? {} : {
          message: `No payroll records found for financial year ${fyParam}. Add records on the Payroll page or upload a payslip.`,
        }),
      });
    }

    const year = yearParam ? Number(yearParam) : new Date().getFullYear();
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year parameter — must be a calendar year (e.g. 2025)" }, { status: 400 });
    }

    const ytd     = await payrollService.getYtd(userId, year);
    const hasData = ytd.monthsRecorded > 0;

    return NextResponse.json({
      ...ytd,
      hasData,
      ...(hasData ? {} : {
        message: `No payroll records found for ${year}. Add records on the Payroll page or upload a payslip.`,
      }),
    });
  } catch (err) {
    const { error, status } = toApiError(err);
    return NextResponse.json({ error }, { status });
  }
});
