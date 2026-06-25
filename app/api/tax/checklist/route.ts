/**
 * GET /api/tax/checklist?fy=2024-25
 *
 * Returns a personalised investment-proof checklist for the authenticated user.
 *
 * ── What it returns ───────────────────────────────────────────────────────────
 * - submitted[]     Proofs already uploaded (any status: PENDING_REVIEW / APPROVED /
 *                   NEEDS_RESUBMISSION / REJECTED)
 * - pending[]       Declared investments with no document uploaded yet
 * - actionsRequired[] Proofs returned or rejected — need immediate attention
 * - summary         Counts, totals, tax-at-risk, deadline, completion %
 * - recommendations[] Prioritised action items with estimated tax impact
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 * userId is always sourced from the JWT session — never from the query string.
 * The use-case queries only WHERE userId = session.user.id.
 *
 * ── Not financial advice ──────────────────────────────────────────────────────
 * Tax-at-risk figures are estimates for planning purposes only.
 * Surface the disclaimer from the response to the user.
 */

import { NextRequest, NextResponse } from "next/server";
import { withPermission }           from "@/lib/middleware/with-auth";
import { toApiError }               from "@/lib/errors/app-error";
import { GenerateProofChecklistUseCase } from "@/application/use-cases/tax/generate-proof-checklist.usecase";
import { auditService }             from "@/infrastructure/audit/db-audit-logger";
import { extractRequestContext }    from "@/lib/middleware/request-context";

const FY_REGEX = /^\d{4}-\d{2}$/;

const useCase = new GenerateProofChecklistUseCase();

export const GET = withPermission(
  "tax:read:own",
  async (req: NextRequest, _ctx, { userId }) => {
    // ── Parse ?fy query param ──────────────────────────────────────────────────
    const { searchParams } = new URL(req.url);
    const fy = searchParams.get("fy") ?? "2024-25";

    if (!FY_REGEX.test(fy)) {
      return NextResponse.json(
        {
          error: "Invalid financial year format. Expected YYYY-YY (e.g. 2024-25).",
          code: "INVALID_FY",
        },
        { status: 400 },
      );
    }

    try {
      const result = await useCase.execute(userId, fy);
      const reqCtx = extractRequestContext(req);

      void auditService.logEvent(
        "TAX_CHECKLIST_VIEWED",
        {
          financialYear:  fy,
          pendingCount:   result.summary.pendingReviewCount,
          missingCount:   result.summary.missingCount,
          actionsRequired: result.summary.rejectedCount + result.summary.needsResubmissionCount,
          totalTaxAtRisk: result.summary.totalTaxAtRisk,
        },
        { userId, resourceType: "TaxDeclaration", ...reqCtx },
      );

      return NextResponse.json(
        {
          ...result,
          disclaimer:
            "Tax-at-risk figures are estimates for planning purposes only. " +
            "They assume the declared amounts are fully eligible under the relevant " +
            "section and do not constitute tax, legal, or financial advice. " +
            "Verify all calculations with a qualified CA before filing your ITR.",
        },
        { status: 200 },
      );
    } catch (err) {
      const { error, status } = toApiError(err);
      return NextResponse.json({ error }, { status });
    }
  },
);
