/**
 * POST /api/tax/simulate
 *
 * Tax-saving simulator endpoint.
 *
 * ── What it does ──────────────────────────────────────────────────────────────
 * Accepts the user's current investment baseline and a list of "what-if"
 * investment scenarios. Returns:
 *   - Baseline tax under Old and New Regime
 *   - Regime recommendation with savings delta
 *   - Per-scenario estimated tax saving (Old Regime only)
 *   - Marginal effective tax rate for each additional investment
 *   - Post-tax cost of each investment
 *   - Remaining headroom in each section
 *   - Full list of assumptions made
 *
 * ── Security ───────────────────────────────────────────────────────────────────
 * userId is always from the JWT session — never from the request body.
 * Payroll income is fetched server-side for the authenticated user only.
 *
 * ── Not a compliance guarantee ────────────────────────────────────────────────
 * Results are estimates for planning purposes only.
 * The disclaimer field in the response must be surfaced to the user.
 */

import { NextRequest, NextResponse }       from "next/server";
import { withPermission }                  from "@/lib/middleware/with-auth";
import { toApiError }                      from "@/lib/errors/app-error";
import { simulateSavingsRequestSchema }    from "@/lib/validation/schemas/tax.schema";
import { SimulateTaxSavingsUseCase }       from "@/application/use-cases/tax/simulate-tax-savings.usecase";

const useCase = new SimulateTaxSavingsUseCase();

export const POST = withPermission(
  "tax:simulate",
  async (req: NextRequest, _ctx, { userId }) => {
    // ── Parse and validate body ────────────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON", code: "INVALID_JSON" },
        { status: 400 },
      );
    }

    const parsed = simulateSavingsRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const { financialYear, baseline, scenarios } = parsed.data;

    try {
      const result = await useCase.execute({
        userId,
        financialYear,
        baseline,
        scenarios,
      });

      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      const { error, status } = toApiError(err);
      return NextResponse.json({ error }, { status });
    }
  },
);
