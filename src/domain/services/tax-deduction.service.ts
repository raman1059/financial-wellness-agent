/**
 * Tax Deduction Service
 *
 * Pure functions for computing deduction eligibility, applicable caps,
 * and remaining headroom for each section under the Old Regime.
 *
 * ── DISCLAIMER ───────────────────────────────────────────────────────────────
 * These calculations are ESTIMATES for planning purposes only.
 * Actual deduction eligibility depends on:
 *   - Proof of investment / expense submission to employer
 *   - IT Department's assessment of submitted proofs
 *   - Specific sub-conditions within each section (e.g. HRA metro/non-metro)
 *   - Any amendments or notifications issued after this code was written
 *
 * This service does NOT provide tax advice. Consult a Chartered Accountant
 * for any investment decision based on tax considerations.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Sections covered:
 *   80C    — Life insurance, PPF, ELSS, home loan principal, NSC, tuition fees
 *   80CCC  — Pension plan premiums (sub-limit within 80C + 80CCC combined: ₹1.5L)
 *   80CCD(1)  — NPS employee contribution (within 80C + 80CCC + 80CCD(1): ₹1.5L)
 *   80CCD(1B) — NPS additional contribution: ₹50,000 OVER the ₹1.5L limit
 *   80D    — Health insurance premiums
 *   24(b)  — Home loan interest (self-occupied: ₹2L cap; let-out: actual interest)
 *   80E    — Education loan interest (no cap)
 *   HRA    — House Rent Allowance exemption (min of three conditions)
 *
 * NOT covered (out of scope for salary-based simulation):
 *   80G (donations), 80TTA (savings interest), 80EEA (first home loan), etc.
 */

// ─── Section 80C ─────────────────────────────────────────────────────────────

export const SECTION_80C_LIMIT = 150_000;

export interface Section80CComponents {
  ppf:               number;
  elss:              number;
  lifeInsurance:     number;
  homeLoanPrincipal: number;
  nsc:               number;
  tuitionFees:       number;
  other:             number;
}

export interface Section80CResult {
  totalEligible:   number;   // sum of components (uncapped)
  allowedDeduction: number;  // min(totalEligible, ₹1,50,000)
  headroom:        number;   // how much more can be invested before hitting cap
  capApplied:      boolean;
  assumption:      string;
}

export function compute80C(components: Section80CComponents): Section80CResult {
  const totalEligible =
    components.ppf +
    components.elss +
    components.lifeInsurance +
    components.homeLoanPrincipal +
    components.nsc +
    components.tuitionFees +
    components.other;

  const allowedDeduction = Math.min(totalEligible, SECTION_80C_LIMIT);
  const headroom         = Math.max(SECTION_80C_LIMIT - totalEligible, 0);

  return {
    totalEligible,
    allowedDeduction,
    headroom,
    capApplied: totalEligible > SECTION_80C_LIMIT,
    assumption:
      "80C cap is ₹1,50,000 combined across PPF, ELSS, LIC, home loan principal, NSC, " +
      "tuition fees, and other eligible investments. EPF employee contribution is typically " +
      "included by the employer — not modelled here unless provided separately.",
  };
}

// ─── Section 80CCD(1B) — Additional NPS ──────────────────────────────────────

export const NPS_ADDITIONAL_LIMIT = 50_000;

export interface NpsAdditionalResult {
  allowedDeduction: number;
  headroom:         number;
  assumption:       string;
}

export function compute80CCD1B(npsAdditionalContribution: number): NpsAdditionalResult {
  const allowedDeduction = Math.min(npsAdditionalContribution, NPS_ADDITIONAL_LIMIT);
  return {
    allowedDeduction,
    headroom: Math.max(NPS_ADDITIONAL_LIMIT - npsAdditionalContribution, 0),
    assumption:
      "₹50,000 deduction u/s 80CCD(1B) is OVER and ABOVE the ₹1.5L limit under 80C. " +
      "Contributions must be to Tier-1 NPS account. Available under Old Regime only.",
  };
}

// ─── Section 80D — Health Insurance ──────────────────────────────────────────

export interface Section80DComponents {
  selfAndFamilyPremium:   number;
  selfAndFamilySenior:    boolean;  // true if self or spouse is senior citizen (≥60)
  parentPremium:          number;
  parentSenior:           boolean;  // true if either parent is senior citizen (≥60)
  preventiveHealthCheck:  number;   // sub-limit ₹5,000 within the main limit
}

export interface Section80DResult {
  selfAndFamilyDeduction: number;
  parentDeduction:        number;
  allowedDeduction:       number;
  selfLimit:              number;
  parentLimit:            number;
  assumption:             string;
}

export const HEALTH_INS_LIMIT_GENERAL = 25_000;
export const HEALTH_INS_LIMIT_SENIOR  = 50_000;
export const PREVENTIVE_CHECK_LIMIT   = 5_000;

export function compute80D(components: Section80DComponents): Section80DResult {
  const selfLimit   = components.selfAndFamilySenior ? HEALTH_INS_LIMIT_SENIOR : HEALTH_INS_LIMIT_GENERAL;
  const parentLimit = components.parentSenior        ? HEALTH_INS_LIMIT_SENIOR : HEALTH_INS_LIMIT_GENERAL;

  // Preventive health check-up is a sub-limit within the main deduction cap
  const preventive         = Math.min(components.preventiveHealthCheck, PREVENTIVE_CHECK_LIMIT);
  const selfPremiumAllowed = Math.min(components.selfAndFamilyPremium + preventive, selfLimit);
  const parentAllowed      = Math.min(components.parentPremium, parentLimit);

  return {
    selfAndFamilyDeduction: selfPremiumAllowed,
    parentDeduction:        parentAllowed,
    allowedDeduction:       selfPremiumAllowed + parentAllowed,
    selfLimit,
    parentLimit,
    assumption:
      `Self/family limit: ₹${(selfLimit / 1000).toFixed(0)}K ` +
      `(${components.selfAndFamilySenior ? "senior citizen" : "below 60"}). ` +
      `Parent limit: ₹${(parentLimit / 1000).toFixed(0)}K ` +
      `(${components.parentSenior ? "senior citizen" : "below 60"}). ` +
      "Preventive health check-up sub-limit: ₹5,000 within the main cap.",
  };
}

// ─── Section 24(b) — Home Loan Interest ──────────────────────────────────────

export const HOME_LOAN_INTEREST_LIMIT_SELF_OCCUPIED = 200_000;

export interface Section24bResult {
  allowedDeduction: number;
  capApplied:       boolean;
  assumption:       string;
}

export function compute24B(
  homeLoanInterest:  number,
  isSelfOccupied:    boolean = true,
): Section24bResult {
  if (!isSelfOccupied) {
    return {
      allowedDeduction: homeLoanInterest,
      capApplied: false,
      assumption:
        "Property is let-out: actual interest deductible without cap. " +
        "However, set-off against salary income is limited to ₹2L per year under current rules. " +
        "Excess loss can be carried forward for 8 years. Consult a CA.",
    };
  }

  const allowedDeduction = Math.min(homeLoanInterest, HOME_LOAN_INTEREST_LIMIT_SELF_OCCUPIED);
  return {
    allowedDeduction,
    capApplied: homeLoanInterest > HOME_LOAN_INTEREST_LIMIT_SELF_OCCUPIED,
    assumption:
      "Self-occupied property: interest deduction capped at ₹2,00,000 u/s 24(b). " +
      "Construction must have been completed within 5 years from loan sanction date. " +
      "Not available under New Regime.",
  };
}

// ─── Section 80E — Education Loan Interest ───────────────────────────────────

export interface Section80EResult {
  allowedDeduction: number;
  assumption:       string;
}

export function compute80E(educationLoanInterest: number): Section80EResult {
  return {
    allowedDeduction: educationLoanInterest,  // no cap
    assumption:
      "80E has NO upper cap on interest deduction. " +
      "Deduction available for 8 consecutive years from the year repayment starts. " +
      "Eligible loans: higher education for self, spouse, children, or a student for whom you are a legal guardian.",
  };
}

// ─── HRA Exemption ───────────────────────────────────────────────────────────

export interface HraComponents {
  hraReceived:   number;  // actual HRA received from employer
  basicSalary:   number;  // annual basic salary
  rentPaid:      number;  // actual annual rent paid
  isMetroCity:   boolean; // Delhi, Mumbai, Chennai, Kolkata = metro (50% of basic); others 40%
}

export interface HraResult {
  condition1:      number;  // actual HRA received
  condition2:      number;  // 50% or 40% of basic salary
  condition3:      number;  // rent paid − 10% of basic
  exemption:       number;  // min of three conditions
  fullyTaxable:    boolean; // true when not paying rent
  assumption:      string;
}

export function computeHraExemption(hra: HraComponents): HraResult {
  if (hra.rentPaid <= 0) {
    return {
      condition1: hra.hraReceived,
      condition2: 0,
      condition3: 0,
      exemption:  0,
      fullyTaxable: true,
      assumption: "HRA is fully taxable when no rent is paid.",
    };
  }

  const condition1 = hra.hraReceived;
  const condition2 = hra.basicSalary * (hra.isMetroCity ? 0.50 : 0.40);
  const condition3 = Math.max(hra.rentPaid - hra.basicSalary * 0.10, 0);
  const exemption  = Math.min(condition1, condition2, condition3);

  return {
    condition1,
    condition2,
    condition3,
    exemption,
    fullyTaxable: false,
    assumption:
      `HRA exemption = minimum of three conditions: ` +
      `(1) actual HRA received, ` +
      `(2) ${hra.isMetroCity ? "50%" : "40%"} of basic salary (${hra.isMetroCity ? "metro" : "non-metro"} city), ` +
      `(3) rent paid minus 10% of basic salary. ` +
      "Not available under New Regime.",
  };
}

// ─── Aggregate Old Regime Deductions ─────────────────────────────────────────

export interface OldRegimeDeductionSummary {
  standardDeduction:    number;
  section80C:           Section80CResult;
  section80CCD1B:       NpsAdditionalResult;
  section80D:           Section80DResult;
  section24B:           Section24bResult;
  section80E:           Section80EResult;
  hraExemption:         HraResult;
  totalDeductions:      number;
  allAssumptions:       string[];
}

export function computeOldRegimeDeductions(opts: {
  standardDeduction:  number;
  components80C:      Section80CComponents;
  npsAdditional:      number;
  components80D:      Section80DComponents;
  homeLoanInterest:   number;
  isSelfOccupied?:    boolean;
  educationLoanInt:   number;
  hraComponents:      HraComponents;
}): OldRegimeDeductionSummary {
  const s80c    = compute80C(opts.components80C);
  const s80ccd  = compute80CCD1B(opts.npsAdditional);
  const s80d    = compute80D(opts.components80D);
  const s24b    = compute24B(opts.homeLoanInterest, opts.isSelfOccupied ?? true);
  const s80e    = compute80E(opts.educationLoanInt);
  const hra     = computeHraExemption(opts.hraComponents);

  const totalDeductions =
    opts.standardDeduction +
    s80c.allowedDeduction +
    s80ccd.allowedDeduction +
    s80d.allowedDeduction +
    s24b.allowedDeduction +
    s80e.allowedDeduction +
    hra.exemption;

  return {
    standardDeduction:  opts.standardDeduction,
    section80C:         s80c,
    section80CCD1B:     s80ccd,
    section80D:         s80d,
    section24B:         s24b,
    section80E:         s80e,
    hraExemption:       hra,
    totalDeductions,
    allAssumptions: [
      s80c.assumption,
      s80ccd.assumption,
      s80d.assumption,
      s24b.assumption,
      s80e.assumption,
      hra.assumption,
    ],
  };
}
