import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { RunTaxSimulationUseCase } from "@/application/use-cases/tax/run-tax-simulation.usecase";
import { toApiError } from "@/lib/errors/app-error";

const useCase = new RunTaxSimulationUseCase();

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fy = req.nextUrl.searchParams.get("fy") ?? "2024-25";

  try {
    const result = await useCase.execute(session.user.id, fy);
    return NextResponse.json(result);
  } catch (err) {
    const { error, status } = toApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
