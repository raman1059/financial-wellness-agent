export type TaxRegime = "OLD" | "NEW";

interface TaxSlab { upTo: number; rate: number; }

const NEW_REGIME_SLABS_2024_25: TaxSlab[] = [
  { upTo: 300000, rate: 0 },
  { upTo: 600000, rate: 0.05 },
  { upTo: 900000, rate: 0.10 },
  { upTo: 1200000, rate: 0.15 },
  { upTo: 1500000, rate: 0.20 },
  { upTo: Infinity, rate: 0.30 },
];

const OLD_REGIME_SLABS_2024_25: TaxSlab[] = [
  { upTo: 250000, rate: 0 },
  { upTo: 500000, rate: 0.05 },
  { upTo: 1000000, rate: 0.20 },
  { upTo: Infinity, rate: 0.30 },
];

export class TaxBracketService {
  computeTax(taxableIncome: number, regime: TaxRegime): number {
    const slabs = regime === "NEW" ? NEW_REGIME_SLABS_2024_25 : OLD_REGIME_SLABS_2024_25;

    if (taxableIncome <= 0) return 0;

    let tax = 0;
    let remaining = taxableIncome;
    let prevLimit = 0;

    for (const slab of slabs) {
      const slabSize = Math.min(remaining, slab.upTo - prevLimit);
      if (slabSize <= 0) break;
      tax += slabSize * slab.rate;
      remaining -= slabSize;
      prevLimit = slab.upTo;
      if (remaining <= 0) break;
    }

    // Rebate u/s 87A: zero tax if income ≤ 7L (New) or 5L (Old)
    const rebateLimit = regime === "NEW" ? 700000 : 500000;
    if (taxableIncome <= rebateLimit) tax = 0;

    // 4% Health & Education Cess
    tax += tax * 0.04;

    return Math.round(tax);
  }

  effectiveRate(taxableIncome: number, regime: TaxRegime): number {
    if (taxableIncome <= 0) return 0;
    return (this.computeTax(taxableIncome, regime) / taxableIncome) * 100;
  }
}
