import { NextRequest, NextResponse } from "next/server";
import { RunTaxSimulationUseCase } from "@/application/use-cases/tax/run-tax-simulation.usecase";
import { toApiError } from "@/lib/errors/app-error";
import { withPermission } from "@/lib/middleware/with-auth";

const useCase = new RunTaxSimulationUseCase();

export const GET = withPermission(
  "tax:simulate",
  async (req: NextRequest, _ctx, { userId }) => {
    const fy = req.nextUrl.searchParams.get("fy") ?? "2024-25";
    try {
      const result = await useCase.execute(userId, fy);
      return NextResponse.json(result);
    } catch (err) {
      const { error, status } = toApiError(err);
      return NextResponse.json({ error }, { status });
    }
  },
);
