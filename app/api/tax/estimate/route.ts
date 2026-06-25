import { NextRequest, NextResponse } from "next/server";
import { RunTaxSimulationUseCase } from "@/application/use-cases/tax/run-tax-simulation.usecase";
import { validateTaxDeclaration }   from "@/lib/validation/tax-cross-validator";
import { toApiError } from "@/lib/errors/app-error";
import { withPermission } from "@/lib/middleware/with-auth";
import { prisma } from "@/infrastructure/db/prisma/client";

const useCase = new RunTaxSimulationUseCase();

const FY_REGEX = /^\d{4}-\d{2}$/;

export const GET = withPermission(
  "tax:simulate",
  async (req: NextRequest, _ctx, { userId }) => {
    const fy = req.nextUrl.searchParams.get("fy") ?? "2024-25";

    if (!FY_REGEX.test(fy)) {
      return NextResponse.json(
        { error: "Invalid financial year format. Expected YYYY-YY (e.g. 2024-25).", code: "INVALID_FY" },
        { status: 400 },
      );
    }

    try {
      const result = await useCase.execute(userId, fy);

      // Cross-field validation on the tax declaration — surfaces advisory warnings
      // without blocking the simulation (cross-validation is informational, not a gate).
      const declaration = await prisma.taxDeclaration.findFirst({ where: { userId, financialYear: fy } });
      let crossValidation: ReturnType<typeof validateTaxDeclaration> | null = null;

      if (declaration) {
        crossValidation = validateTaxDeclaration({
          financialYear:         fy,
          taxRegime:             (declaration.taxRegime as "OLD" | "NEW") ?? "NEW",
          ppfAmount:             Number(declaration.ppfAmount             ?? 0),
          elssAmount:            Number(declaration.elssAmount            ?? 0),
          lifeInsurance:         Number(declaration.lifeInsurance         ?? 0),
          homeLoanPrincipal:     Number(declaration.homeLoanPrincipal     ?? 0),
          nscAmount:             Number(declaration.nscAmount             ?? 0),
          tuitionFees:           Number(declaration.tuitionFees           ?? 0),
          other80C:              Number(declaration.other80C              ?? 0),
          selfHealthInsurance:   Number(declaration.selfHealthInsurance   ?? 0),
          parentHealthInsurance: Number(declaration.parentHealthInsurance ?? 0),
          hraReceived:           Number(declaration.hraReceived           ?? 0),
          npsContribution:       Number(declaration.npsContribution       ?? 0),
          homeLoanInterest:      Number(declaration.homeLoanInterest      ?? 0),
          educationLoanInterest: Number(declaration.educationLoanInterest ?? 0),
        });

        // A cross-validation ERROR means the declaration itself is invalid
        // (e.g. future FY). Surface it so the caller can fix and retry.
        if (crossValidation && !crossValidation.isValid) {
          const errorIssues = crossValidation.issues.filter((i) => i.level === "ERROR");
          return NextResponse.json(
            {
              error:   errorIssues[0]?.message ?? "Tax declaration contains errors",
              code:    errorIssues[0]?.code    ?? "INVALID_DECLARATION",
              details: errorIssues,
            },
            { status: 422 },
          );
        }
      }

      return NextResponse.json({
        ...result,
        declarationWarnings: crossValidation?.warnings ?? [],
        declarationAdvisory: crossValidation?.infos    ?? [],
        disclaimer:
          "Tax liability figures are estimates for planning purposes only and do not " +
          "constitute financial or tax advice. Verify with a qualified CA before filing.",
      });
    } catch (err) {
      const { error, status } = toApiError(err);
      return NextResponse.json({ error }, { status });
    }
  },
);
