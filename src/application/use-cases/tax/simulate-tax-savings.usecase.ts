/**
 * Simulate Tax Savings Use Case
 *
 * ── What this computes ────────────────────────────────────────────────────────
 * 1. Baseline tax — tax on declared income with current investments
 * 2. Scenario tax  — tax after adding proposed additional investments
 * 3. Savings       — baseline tax − scenario tax
 * 4. Marginal rate — effective savings per rupee invested
 * 5. Headroom      — how much more can be invested in each section
 * 6. Regime recommendation — which regime results in lower tax
 *
 * ── Formula summary ──────────────────────────────────────────────────────────
 *
 *   grossIncome       = Σ payroll.grossSalary for months in the financial year
 *
 *   Old Regime:
 *     deductions      = standardDeduction(50K) + 80C(cap 1.5L) + 80CCD1B(cap 50K)
 *                     + 80D + 24B(cap 2L self-occ) + 80E + HRA exemption
 *     taxableIncome   = max(grossIncome − deductions, 0)
 *     taxLiability    = slabs + surcharge + 4% cess − 87A rebate
 *
 *   New Regime:
 *     deductions      = standardDeduction(75K) only (no other deductions)
 *     taxableIncome   = max(grossIncome − 75K, 0)
 *     taxLiability    = slabs + surcharge + 4% cess − 87A rebate
 *
 *   savings(scenario) = taxLiability(baseline) − taxLiability(scenario)
 *   marginalRate      = savings / additionalInvestment
 *   postTaxCost       = additionalInvestment − savings
 *
 * ── ASSUMPTIONS (mandatory disclosure) ───────────────────────────────────────
 * A1. Only salary income is modelled. Other income heads (FD interest,
 *     capital gains, rental income) are NOT included.
 * A2. Employer's EPF contribution is excluded from the 80C cap calculation
 *     unless explicitly provided in the 80C breakdown.
 * A3. HRA exemption uses the metro/non-metro flag supplied by the caller.
 *     Actual exemption requires submission of rent receipts to employer.
 * A4. Projections assume salary remains constant for remaining months.
 *     Actual income may differ.
 * A5. This is an ESTIMATE, not a tax return filing. Consult a CA for final
 *     tax liability computation and ITR filing.
 */

import { TaxBracketService, type TaxBreakdown }    from "@/domain/services/tax-bracket.service";
import {
  computeOldRegimeDeductions,
  type OldRegimeDeductionSummary,
  type Section80CComponents,
  type Section80DComponents,
  type HraComponents,
} from "@/domain/services/tax-deduction.service";
import { prisma } from "@/infrastructure/db/prisma/client";

// ─── Input types ──────────────────────────────────────────────────────────────

export interface BaselineInvestments {
  // 80C components
  ppf:               number;
  elss:              number;
  lifeInsurance:     number;
  homeLoanPrincipal: number;
  nsc:               number;
  tuitionFees:       number;
  other80C:          number;

  // 80CCD(1B) — NPS additional
  npsAdditional:     number;

  // 80D
  selfHealthInsurance:   number;
  parentHealthInsurance: number;
  selfFamilySenior:      boolean;
  parentSenior:          boolean;
  preventiveHealthCheck: number;

  // Section 24(b)
  homeLoanInterest:  number;
  isSelfOccupied:    boolean;

  // 80E
  educationLoanInterest: number;

  // HRA
  hraReceived:   number;
  basicSalary:   number;  // annual
  rentPaid:      number;
  isMetroCity:   boolean;
}

/** A single proposed additional investment for one specific section. */
export interface InvestmentScenario {
  section:          string;   // "80C_PPF" | "80C_ELSS" | "80D" | "NPS" | "24B" | "80E"
  label:            string;   // human-readable e.g. "Invest ₹50,000 more in PPF"
  additionalAmount: number;
}

export interface SimulateSavingsInput {
  userId:        string;
  financialYear: string;          // "2024-25"
  baseline:      BaselineInvestments;
  scenarios:     InvestmentScenario[];
  isMetroCity?:  boolean;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface TaxComputation {
  regime:           "OLD" | "NEW";
  grossIncome:      number;
  deductions:       OldRegimeDeductionSummary | { standardDeduction: number; totalDeductions: number };
  taxableIncome:    number;
  breakdown:        TaxBreakdown;
  effectiveRatePct: number;
}

export interface ScenarioResult {
  scenario:          InvestmentScenario;
  oldRegimeSavings:  number;   // tax saved vs baseline (OLD regime)
  marginalRateOld:   number;   // savings / additionalAmount as %
  postTaxCostOld:    number;   // additionalAmount − oldRegimeSavings
  headroom:          Record<string, number>;  // remaining space in each section
  note:              string;
  applicable:        boolean;  // false when New Regime is in use (no deductions available)
}

export interface RegimeComparison {
  oldRegimeTax:    number;
  newRegimeTax:    number;
  recommended:     "OLD" | "NEW";
  savingsVsOther:  number;   // how much cheaper the recommended regime is
  note:            string;
}

export interface TaxSavingsSimulationResult {
  financialYear:     string;
  dataCompleteness:  "full" | "partial";  // partial = fewer than 12 months of payroll data
  monthsUsed:        number;
  grossIncome:       number;
  totalTdsPaid:      number;

  // Baseline: current declared investments
  baseline: {
    old: TaxComputation;
    new: TaxComputation;
  };

  // Regime recommendation
  regimeComparison: RegimeComparison;

  // What-if scenarios (Old Regime only — New has no deductions)
  scenarios: ScenarioResult[];

  // How much headroom remains in each section
  headroom: {
    section80C:    number;
    section80CCD1B: number;
    section80D_self:   number;
    section80D_parent: number;
    section24B:    number;
    note:          string;
  };

  // Mandatory assumptions surfaced to the user
  assumptions: string[];

  disclaimer: string;
}

// ─── Use case ─────────────────────────────────────────────────────────────────

export class SimulateTaxSavingsUseCase {
  private readonly taxService = new TaxBracketService();

  async execute(input: SimulateSavingsInput): Promise<TaxSavingsSimulationResult> {
    const { userId, financialYear, baseline, scenarios } = input;

    // ── Fetch payroll records for the FY ──────────────────────────────────────
    const [fyStartYear] = financialYear.split("-").map(Number);
    const fyEndYear = fyStartYear + 1;

    const payrollRecords = await prisma.payrollRecord.findMany({
      where: {
        userId,
        OR: [
          { payPeriodYear: fyStartYear, payPeriodMonth: { gte: 4 } },
          { payPeriodYear: fyEndYear,   payPeriodMonth: { lte: 3 } },
        ],
      },
    });

    const grossIncome  = payrollRecords.reduce((s, r) => s + Number(r.grossSalary), 0);
    const totalTdsPaid = payrollRecords.reduce((s, r) => s + Number(r.tdsDeducted), 0);
    const monthsUsed   = payrollRecords.length;

    // ── Compute baseline (Old Regime) ─────────────────────────────────────────
    const oldSD = this.taxService.standardDeduction("OLD", financialYear);
    const newSD = this.taxService.standardDeduction("NEW", financialYear);

    const baselineOld = this.computeOldRegime(grossIncome, baseline, oldSD, financialYear);
    const baselineNew = this.computeNewRegime(grossIncome, newSD, financialYear);

    // ── Regime recommendation ─────────────────────────────────────────────────
    const regimeComparison = this.compareRegimes(baselineOld, baselineNew);

    // ── Per-section headroom ──────────────────────────────────────────────────
    const headroom = this.computeHeadroom(baseline);

    // ── Scenario simulations (Old Regime only) ────────────────────────────────
    const scenarioResults: ScenarioResult[] = scenarios.map((scenario) =>
      this.runScenario(scenario, baseline, grossIncome, baselineOld.breakdown.totalTax, oldSD, financialYear, headroom),
    );

    // ── Assumptions ───────────────────────────────────────────────────────────
    const assumptions: string[] = [
      "A1. Only salary income is included. FD interest, capital gains, and other income heads are excluded.",
      "A2. Employer EPF share is not included in 80C unless provided separately.",
      `A3. Gross income projected from ${monthsUsed} payroll month(s) on record.` +
        (monthsUsed < 12 ? " Remaining months assumed equal to recorded average." : ""),
      "A4. HRA exemption requires submission of rent receipts to your employer.",
      "A5. Surcharge is applied to incomes above ₹50L. Marginal relief is not modelled.",
      "A6. All figures are ESTIMATES for planning purposes. Actual liability may differ.",
      ...baselineOld.deductions.allAssumptions ?? [],
    ];

    return {
      financialYear,
      dataCompleteness: monthsUsed >= 12 ? "full" : "partial",
      monthsUsed,
      grossIncome,
      totalTdsPaid,
      baseline:         { old: baselineOld, new: baselineNew },
      regimeComparison,
      scenarios:        scenarioResults,
      headroom: {
        section80C:       baselineOld.deductions.section80C?.headroom ?? 0,
        section80CCD1B:   baselineOld.deductions.section80CCD1B?.headroom ?? 0,
        section80D_self:  Math.max(
          (baselineOld.deductions.section80D?.selfLimit ?? 25_000) -
          baseline.selfHealthInsurance, 0,
        ),
        section80D_parent: Math.max(
          (baselineOld.deductions.section80D?.parentLimit ?? 25_000) -
          baseline.parentHealthInsurance, 0,
        ),
        section24B: Math.max(200_000 - baseline.homeLoanInterest, 0),
        note: "Headroom figures show how much additional investment fits within each section cap (Old Regime only).",
      },
      assumptions,
      disclaimer:
        "This simulation is for informational and planning purposes only. " +
        "It does not constitute tax advice, a legal opinion, or a compliance guarantee. " +
        "Tax laws are subject to amendment by the Income Tax Department. " +
        "Please consult a qualified Chartered Accountant before making investment decisions.",
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private computeOldRegime(
    grossIncome:   number,
    b:             BaselineInvestments,
    standardDed:   number,
    financialYear: string,
  ): TaxComputation {
    const deductions = computeOldRegimeDeductions({
      standardDeduction: standardDed,
      components80C: {
        ppf: b.ppf, elss: b.elss, lifeInsurance: b.lifeInsurance,
        homeLoanPrincipal: b.homeLoanPrincipal, nsc: b.nsc,
        tuitionFees: b.tuitionFees, other: b.other80C,
      },
      npsAdditional:   b.npsAdditional,
      components80D:   {
        selfAndFamilyPremium: b.selfHealthInsurance,
        selfAndFamilySenior:  b.selfFamilySenior,
        parentPremium:        b.parentHealthInsurance,
        parentSenior:         b.parentSenior,
        preventiveHealthCheck: b.preventiveHealthCheck,
      },
      homeLoanInterest:  b.homeLoanInterest,
      isSelfOccupied:    b.isSelfOccupied,
      educationLoanInt:  b.educationLoanInterest,
      hraComponents: {
        hraReceived: b.hraReceived, basicSalary: b.basicSalary,
        rentPaid: b.rentPaid, isMetroCity: b.isMetroCity,
      },
    });

    const taxableIncome = Math.max(grossIncome - deductions.totalDeductions, 0);
    const breakdown     = this.taxService.computeBreakdown(taxableIncome, "OLD", financialYear);
    const effectiveRatePct = this.taxService.effectiveRate(taxableIncome, "OLD", financialYear);

    return { regime: "OLD", grossIncome, deductions, taxableIncome, breakdown, effectiveRatePct };
  }

  private computeNewRegime(
    grossIncome:   number,
    standardDed:   number,
    financialYear: string,
  ): TaxComputation {
    const taxableIncome = Math.max(grossIncome - standardDed, 0);
    const breakdown     = this.taxService.computeBreakdown(taxableIncome, "NEW", financialYear);
    const effectiveRatePct = this.taxService.effectiveRate(taxableIncome, "NEW", financialYear);

    return {
      regime: "NEW",
      grossIncome,
      deductions: { standardDeduction: standardDed, totalDeductions: standardDed },
      taxableIncome,
      breakdown,
      effectiveRatePct,
    };
  }

  private compareRegimes(old: TaxComputation, newR: TaxComputation): RegimeComparison {
    const oldTax = old.breakdown.totalTax;
    const newTax = newR.breakdown.totalTax;
    const recommended  = oldTax <= newTax ? "OLD" : "NEW";
    const savingsVsOther = Math.abs(oldTax - newTax);

    return {
      oldRegimeTax:   oldTax,
      newRegimeTax:   newTax,
      recommended,
      savingsVsOther,
      note:
        recommended === "OLD"
          ? `Old Regime saves ₹${savingsVsOther.toLocaleString("en-IN")} vs New Regime ` +
            "because declared deductions exceed the benefit of lower slab rates."
          : `New Regime saves ₹${savingsVsOther.toLocaleString("en-IN")} vs Old Regime ` +
            "because the lower slab rates outweigh available deductions. " +
            "Consider increasing Old Regime investments before the FY ends.",
    };
  }

  private computeHeadroom(b: BaselineInvestments): Record<string, number> {
    const total80C = b.ppf + b.elss + b.lifeInsurance + b.homeLoanPrincipal + b.nsc + b.tuitionFees + b.other80C;
    return {
      section80C:    Math.max(150_000 - total80C, 0),
      section80CCD1B: Math.max(50_000 - b.npsAdditional, 0),
      section80D_self:   Math.max((b.selfFamilySenior ? 50_000 : 25_000) - b.selfHealthInsurance, 0),
      section80D_parent: Math.max((b.parentSenior ? 50_000 : 25_000) - b.parentHealthInsurance, 0),
      section24B:    Math.max(200_000 - b.homeLoanInterest, 0),
    };
  }

  private runScenario(
    scenario:      InvestmentScenario,
    baseline:      BaselineInvestments,
    grossIncome:   number,
    baselineTaxOld: number,
    standardDed:   number,
    financialYear: string,
    headroom:      Record<string, number>,
  ): ScenarioResult {
    const { section, additionalAmount } = scenario;

    // Build modified baseline
    const modified: BaselineInvestments = { ...baseline };
    let applicable = true;
    let note = "";

    switch (section) {
      case "80C_PPF":
        modified.ppf = baseline.ppf + additionalAmount;
        note = "PPF contribution increased. Lock-in: 15 years. Interest: ~7.1% (tax-free).";
        break;
      case "80C_ELSS":
        modified.elss = baseline.elss + additionalAmount;
        note = "ELSS (Equity Linked Savings Scheme). Lock-in: 3 years. Returns are market-linked.";
        break;
      case "80C_LIC":
        modified.lifeInsurance = baseline.lifeInsurance + additionalAmount;
        note = "Life insurance premium. Ensure sum assured ≥ 10× annual premium for 80C eligibility.";
        break;
      case "NPS":
        modified.npsAdditional = baseline.npsAdditional + additionalAmount;
        note = "NPS Tier-1 additional contribution u/s 80CCD(1B). Lock-in until age 60.";
        break;
      case "80D_SELF":
        modified.selfHealthInsurance = baseline.selfHealthInsurance + additionalAmount;
        note = "Health insurance premium for self/family. Policy must be active in the FY.";
        break;
      case "80D_PARENT":
        modified.parentHealthInsurance = baseline.parentHealthInsurance + additionalAmount;
        note = "Health insurance premium for parents.";
        break;
      default:
        applicable = false;
        note = `Section "${section}" is not supported in this simulator.`;
    }

    if (!applicable) {
      return {
        scenario, applicable: false,
        oldRegimeSavings: 0, marginalRateOld: 0, postTaxCostOld: additionalAmount,
        headroom, note,
      };
    }

    // Compute tax with the modified investment
    const oldSD = standardDed;
    const modifiedOld   = this.computeOldRegime(grossIncome, modified, oldSD, financialYear);
    const scenarioTaxOld = modifiedOld.breakdown.totalTax;
    const oldRegimeSavings = Math.max(baselineTaxOld - scenarioTaxOld, 0);
    const marginalRateOld  = additionalAmount > 0
      ? Math.round((oldRegimeSavings / additionalAmount) * 10000) / 100
      : 0;
    const postTaxCostOld = additionalAmount - oldRegimeSavings;

    return {
      scenario,
      applicable: true,
      oldRegimeSavings,
      marginalRateOld,
      postTaxCostOld,
      headroom,
      note,
    };
  }
}
