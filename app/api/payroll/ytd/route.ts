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
      return NextResponse.json({ financialYear: fyParam, records });
    }

    const year = yearParam ? Number(yearParam) : new Date().getFullYear();
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: "Invalid year parameter" }, { status: 400 });
    }

    const ytd = await payrollService.getYtd(userId, year);
    return NextResponse.json(ytd);
  } catch (err) {
    const { error, status } = toApiError(err);
    return NextResponse.json({ error }, { status });
  }
});
