/**
 * Tax Bracket Service
 *
 * Computes Indian income tax liability using progressive slab rates.
 * Supports FY 2024-25 and FY 2025-26 for both Old and New Regimes.
 *
 * ── ASSUMPTIONS (declared, not compliance guarantees) ────────────────────────
 * 1. Only salary income is considered. Capital gains, business income,
 *    and other heads are out of scope.
 * 2. Surcharge applies above ₹50L. Marginal relief is NOT applied here —
 *    always verify high-income calculations with a CA.
 * 3. 87A rebate is applied as a full rebate (tax = 0) when taxable income
 *    falls within the rebate threshold. Partial rebates are not modelled.
 * 4. Health & Education Cess: 4% on tax after surcharge.
 * 5. New Regime standard deduction: ₹75,000 (FY 2024-25 onward per Budget 2024).
 *    Old Regime standard deduction: ₹50,000.
 * 6. FY 2025-26 New Regime slabs and ₹12L rebate threshold per Budget 2025.
 */

export type TaxRegime = "OLD" | "NEW";

interface TaxSlab {
  upTo: number;  // upper bound of this slab (Infinity for the top slab)
  rate: number;  // marginal rate as a decimal (0.05 = 5%)
}

// ─── Slab tables ─────────────────────────────────────────────────────────────

// FY 2024-25 — New Regime (Budget 2024)
const NEW_SLABS_2024_25: TaxSlab[] = [
  { upTo:   300_000, rate: 0.00 },
  { upTo:   700_000, rate: 0.05 },
  { upTo: 1_000_000, rate: 0.10 },
  { upTo: 1_200_000, rate: 0.15 },
  { upTo: 1_500_000, rate: 0.20 },
  { upTo:   Infinity, rate: 0.30 },
];

// FY 2024-25 — Old Regime
const OLD_SLABS_2024_25: TaxSlab[] = [
  { upTo:   250_000, rate: 0.00 },
  { upTo:   500_000, rate: 0.05 },
  { upTo: 1_000_000, rate: 0.20 },
  { upTo:   Infinity, rate: 0.30 },
];

// FY 2025-26 — New Regime (Budget 2025)
const NEW_SLABS_2025_26: TaxSlab[] = [
  { upTo:   400_000, rate: 0.00 },
  { upTo:   800_000, rate: 0.05 },
  { upTo: 1_200_000, rate: 0.10 },
  { upTo: 1_600_000, rate: 0.15 },
  { upTo: 2_000_000, rate: 0.20 },
  { upTo: 2_400_000, rate: 0.25 },
  { upTo:   Infinity, rate: 0.30 },
];

// FY 2025-26 — Old Regime (unchanged from 2024-25)
const OLD_SLABS_2025_26: TaxSlab[] = OLD_SLABS_2024_25;

// ─── Per-FY config ────────────────────────────────────────────────────────────

interface FYConfig {
  newSlabs:              TaxSlab[];
  oldSlabs:              TaxSlab[];
  newRebateLimit:        number;   // 87A threshold (New)
  oldRebateLimit:        number;   // 87A threshold (Old)
  newStandardDeduction:  number;
  oldStandardDeduction:  number;
}

const FY_CONFIG: Record<string, FYConfig> = {
  "2024-25": {
    newSlabs:             NEW_SLABS_2024_25,
    oldSlabs:             OLD_SLABS_2024_25,
    newRebateLimit:       700_000,
    oldRebateLimit:       500_000,
    newStandardDeduction: 75_000,
    oldStandardDeduction: 50_000,
  },
  "2025-26": {
    newSlabs:             NEW_SLABS_2025_26,
    oldSlabs:             OLD_SLABS_2025_26,
    newRebateLimit:       1_200_000,
    oldRebateLimit:         500_000,
    newStandardDeduction:    75_000,
    oldStandardDeduction:    50_000,
  },
};

const DEFAULT_FY = "2024-25";

// ─── Surcharge rates (same for both regimes, capped at 25% for New post-2023) ─

interface SurchargeRule {
  above: number;
  rate:  number;
}

const SURCHARGE_RULES: SurchargeRule[] = [
  { above: 5_000_000, rate: 0.10 },
  { above: 10_000_000, rate: 0.15 },
  { above: 20_000_000, rate: 0.25 },  // New Regime capped here; Old allows 37% above 5Cr
  { above: 50_000_000, rate: 0.37 },  // Old Regime only
];

function computeSurcharge(taxableIncome: number, baseTax: number, regime: TaxRegime): number {
  // New Regime: surcharge capped at 25% (no 37% slab)
  const rules = regime === "NEW"
    ? SURCHARGE_RULES.filter((r) => r.rate <= 0.25)
    : SURCHARGE_RULES;

  let surchargeRate = 0;
  for (const rule of [...rules].reverse()) {
    if (taxableIncome > rule.above) {
      surchargeRate = rule.rate;
      break;
    }
  }
  return Math.round(baseTax * surchargeRate);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface TaxBreakdown {
  slabTax:      number;   // tax before surcharge and cess
  surcharge:    number;
  cess:         number;   // 4% on (slabTax + surcharge)
  totalTax:     number;   // final liability
  rebateApplied: boolean;
}

export class TaxBracketService {
  /**
   * Computes the full tax breakdown for a given taxable income.
   * @param taxableIncome  Income AFTER all applicable deductions
   * @param regime         "OLD" or "NEW"
   * @param financialYear  e.g. "2024-25". Defaults to 2024-25.
   */
  computeBreakdown(
    taxableIncome: number,
    regime:        TaxRegime,
    financialYear: string = DEFAULT_FY,
  ): TaxBreakdown {
    if (taxableIncome <= 0) {
      return { slabTax: 0, surcharge: 0, cess: 0, totalTax: 0, rebateApplied: false };
    }

    const config = FY_CONFIG[financialYear] ?? FY_CONFIG[DEFAULT_FY];
    const slabs  = regime === "NEW" ? config.newSlabs : config.oldSlabs;

    // ── Progressive slab computation ────────────────────────────────────────
    let slabTax   = 0;
    let remaining = taxableIncome;
    let prevLimit = 0;

    for (const slab of slabs) {
      const slabSize = Math.min(remaining, slab.upTo - prevLimit);
      if (slabSize <= 0) break;
      slabTax  += slabSize * slab.rate;
      remaining -= slabSize;
      prevLimit  = slab.upTo;
      if (remaining <= 0) break;
    }

    // ── 87A Rebate ───────────────────────────────────────────────────────────
    const rebateLimit = regime === "NEW" ? config.newRebateLimit : config.oldRebateLimit;
    const rebateApplied = taxableIncome <= rebateLimit;
    if (rebateApplied) slabTax = 0;

    // ── Surcharge ────────────────────────────────────────────────────────────
    const surcharge = rebateApplied ? 0 : computeSurcharge(taxableIncome, slabTax, regime);

    // ── 4% Health & Education Cess ───────────────────────────────────────────
    const cess    = Math.round((slabTax + surcharge) * 0.04);
    const totalTax = Math.round(slabTax + surcharge + cess);

    return { slabTax: Math.round(slabTax), surcharge, cess, totalTax, rebateApplied };
  }

  /** Convenience wrapper — returns only the final liability. */
  computeTax(
    taxableIncome: number,
    regime:        TaxRegime,
    financialYear: string = DEFAULT_FY,
  ): number {
    return this.computeBreakdown(taxableIncome, regime, financialYear).totalTax;
  }

  /** Effective tax rate as a percentage of taxable income. */
  effectiveRate(
    taxableIncome: number,
    regime:        TaxRegime,
    financialYear: string = DEFAULT_FY,
  ): number {
    if (taxableIncome <= 0) return 0;
    const tax = this.computeTax(taxableIncome, regime, financialYear);
    return Math.round((tax / taxableIncome) * 10000) / 100;  // 2 decimal places
  }

  /** Standard deduction for a given regime and FY. */
  standardDeduction(regime: TaxRegime, financialYear: string = DEFAULT_FY): number {
    const config = FY_CONFIG[financialYear] ?? FY_CONFIG[DEFAULT_FY];
    return regime === "NEW" ? config.newStandardDeduction : config.oldStandardDeduction;
  }

  /** Returns all configured FY keys. */
  supportedFinancialYears(): string[] {
    return Object.keys(FY_CONFIG);
  }
}
