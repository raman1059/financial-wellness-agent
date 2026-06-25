import { NextRequest, NextResponse } from "next/server";
import { payrollService } from "@/application/services/payroll.service";
import { createPayrollSchema } from "@/lib/validation/schemas/payroll.schema";
import { toApiError } from "@/lib/errors/app-error";
import { withAuth, withPermission } from "@/lib/middleware/with-auth";

// GET /api/payroll — full list with YTD summary and financial year breakdown
export const GET = withAuth(async (_req, _ctx, { userId }) => {
  try {
    const result = await payrollService.list(userId);
    return NextResponse.json(result);
  } catch (err) {
    const { error, status } = toApiError(err);
    return NextResponse.json({ error }, { status });
  }
});

// POST /api/payroll — create a new payroll record
export const POST = withPermission(
  "payroll:write:own",
  async (req: NextRequest, _ctx, { userId }) => {
    try {
      const body  = await req.json();
      const input = createPayrollSchema.parse(body);
      const record = await payrollService.create(userId, input);
      return NextResponse.json(record, { status: 201 });
    } catch (err) {
      const { error, status } = toApiError(err);
      return NextResponse.json({ error }, { status });
    }
  },
);
