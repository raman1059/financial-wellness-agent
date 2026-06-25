import { Money } from "../value-objects/money.vo";
import { PayPeriod } from "../value-objects/pay-period.vo";
import { ReimbursementBundle, type ReimbursementData } from "../value-objects/reimbursement.vo";

// ── Source data shape (flat, mirrors the DB row) ─────────────────────────────
export interface PayrollRecordData {
  id: string;
  employeeId: string;
  userId: string;
  payPeriodMonth: number;
  payPeriodYear: number;
  basicSalary: number;
  hra: number;
  lta: number;
  specialAllowance: number;
  medicalAllowance: number;
  reimbursements: ReimbursementData[];
  otherEarnings: number;
  providentFund: number;
  professionalTax: number;
  tdsDeducted: number;
  esic: number;
  otherDeductions: number;
  payslipId: string | null;
  isVerified: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Structured earnings breakdown ───────────────────────────────────────────
export interface EarningsBreakdown {
  basicSalary: Money;
  hra: Money;
  lta: Money;
  specialAllowance: Money;
  medicalAllowance: Money;
  reimbursements: ReimbursementBundle;
  otherEarnings: Money;
  grossPay: Money;
}

// ─── Structured deductions breakdown ─────────────────────────────────────────
export interface DeductionsBreakdown {
  providentFund: Money;       // employee share (12% of basic)
  professionalTax: Money;
  tdsDeducted: Money;
  esic: Money;
  otherDeductions: Money;
  totalDeductions: Money;
  statutory: Money;           // PF + PT + ESIC (cannot be waived)
  discretionary: Money;       // TDS + other
}

// ─── Rich domain entity ───────────────────────────────────────────────────────
export class PayrollRecordEntity {
  private constructor(private readonly data: PayrollRecordData) {}

  static fromData(data: PayrollRecordData): PayrollRecordEntity {
    return new PayrollRecordEntity(data);
  }

  // ── Identity
  get id(): string { return this.data.id; }
  get employeeId(): string { return this.data.employeeId; }
  get userId(): string { return this.data.userId; }

  // ── Period
  get period(): PayPeriod {
    return PayPeriod.of(this.data.payPeriodMonth, this.data.payPeriodYear);
  }

  // ── Earnings
  get earnings(): EarningsBreakdown {
    const bundle = ReimbursementBundle.from(this.data.reimbursements);
    const reimbTotal = bundle.total;

    const basicSalary      = Money.of(this.data.basicSalary);
    const hra              = Money.of(this.data.hra);
    const lta              = Money.of(this.data.lta);
    const specialAllowance = Money.of(this.data.specialAllowance);
    const medicalAllowance = Money.of(this.data.medicalAllowance);
    const otherEarnings    = Money.of(this.data.otherEarnings);

    const grossPay = basicSalary
      .add(hra)
      .add(lta)
      .add(specialAllowance)
      .add(medicalAllowance)
      .add(reimbTotal)
      .add(otherEarnings);

    return { basicSalary, hra, lta, specialAllowance, medicalAllowance, reimbursements: bundle, otherEarnings, grossPay };
  }

  // ── Deductions
  get deductions(): DeductionsBreakdown {
    const providentFund    = Money.of(this.data.providentFund);
    const professionalTax  = Money.of(this.data.professionalTax);
    const tdsDeducted      = Money.of(this.data.tdsDeducted);
    const esic             = Money.of(this.data.esic);
    const otherDeductions  = Money.of(this.data.otherDeductions);

    const statutory      = providentFund.add(professionalTax).add(esic);
    const discretionary  = tdsDeducted.add(otherDeductions);
    const totalDeductions = statutory.add(discretionary);

    return { providentFund, professionalTax, tdsDeducted, esic, otherDeductions, totalDeductions, statutory, discretionary };
  }

  // ── Summary
  get grossPay(): Money { return this.earnings.grossPay; }
  get netPay(): Money   { return this.grossPay.subtract(this.deductions.totalDeductions); }

  /**
   * Employer PF contribution (matches employee at 12% of basic).
   * This is an employer cost, not deducted from employee's pay.
   */
  get employerPfContribution(): Money {
    return Money.of(this.data.basicSalary * 0.12);
  }

  /**
   * Cost to Company = gross pay + employer PF contribution.
   */
  get ctc(): Money {
    return this.grossPay.add(this.employerPfContribution);
  }

  /**
   * Effective TDS rate as a percentage of gross pay.
   */
  get effectiveTdsRate(): number {
    const gross = this.grossPay.amount;
    if (gross === 0) return 0;
    return (this.deductions.tdsDeducted.amount / gross) * 100;
  }

  /**
   * Taxable earnings = gross - exempt HRA - exempt LTA - exempt reimbursements.
   * Approximation; actual HRA exemption is computed in the tax simulation use-case.
   */
  get taxableEarnings(): Money {
    const exemptReimb = this.earnings.reimbursements.exemptTotal;
    return this.grossPay.subtract(exemptReimb);
  }

  // ── Meta
  get payslipId(): string | null   { return this.data.payslipId; }
  get isVerified(): boolean        { return this.data.isVerified; }
  get verifiedAt(): Date | null    { return this.data.verifiedAt; }
  get createdAt(): Date            { return this.data.createdAt; }
  get updatedAt(): Date            { return this.data.updatedAt; }

  toData(): PayrollRecordData { return { ...this.data }; }
}
