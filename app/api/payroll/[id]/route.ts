import { NextRequest, NextResponse } from "next/server";
import { payrollService } from "@/application/services/payroll.service";
import { updatePayrollSchema } from "@/lib/validation/schemas/payroll.schema";
import { toApiError } from "@/lib/errors/app-error";
import { withPermission } from "@/lib/middleware/with-auth";
import { assertOwnership } from "@/lib/auth/ownership";

// GET /api/payroll/:id
export const GET = withPermission(
  "payroll:read:own",
  async (_req: NextRequest, ctx, { userId, role }) => {
    try {
      const { id } = await ctx.params;
      await assertOwnership(userId, role, id, "payrollRecord");
      const record = await payrollService.getById(userId, id);
      return NextResponse.json(record);
    } catch (err) {
      const { error, status } = toApiError(err);
      return NextResponse.json({ error }, { status });
    }
  },
);

// PATCH /api/payroll/:id — partial update
export const PATCH = withPermission(
  "payroll:write:own",
  async (req: NextRequest, ctx, { userId, role }) => {
    try {
      const { id } = await ctx.params;
      await assertOwnership(userId, role, id, "payrollRecord");
      const body  = await req.json();
      const input = updatePayrollSchema.parse(body);
      const record = await payrollService.update(userId, id, input);
      return NextResponse.json(record);
    } catch (err) {
      const { error, status } = toApiError(err);
      return NextResponse.json({ error }, { status });
    }
  },
);

// DELETE /api/payroll/:id — admin only
export const DELETE = withPermission(
  "payroll:delete:any",
  async (_req: NextRequest, ctx, { userId, role }) => {
    try {
      const { id } = await ctx.params;
      await assertOwnership(userId, role, id, "payrollRecord");
      await payrollService.remove(userId, id);
      return new NextResponse(null, { status: 204 });
    } catch (err) {
      const { error, status } = toApiError(err);
      return NextResponse.json({ error }, { status });
    }
  },
);
