import { InvalidOperationError } from "../errors/domain.error";

export class Money {
  private constructor(
    private readonly _amount: number,
    private readonly _currency: string = "INR",
  ) {
    if (!Number.isFinite(_amount)) throw new InvalidOperationError("Invalid monetary amount");
  }

  static of(amount: number, currency = "INR"): Money {
    return new Money(Math.round(amount * 100) / 100, currency);
  }

  static zero(currency = "INR"): Money {
    return new Money(0, currency);
  }

  get amount(): number { return this._amount; }
  get currency(): string { return this._currency; }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this._amount + other._amount, this._currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this._amount - other._amount, this._currency);
  }

  multiply(factor: number): Money {
    return Money.of(this._amount * factor, this._currency);
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amount > other._amount;
  }

  format(): string {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: this._currency,
      maximumFractionDigits: 0,
    }).format(this._amount);
  }

  private assertSameCurrency(other: Money) {
    if (this._currency !== other._currency) {
      throw new InvalidOperationError(`Currency mismatch: ${this._currency} vs ${other._currency}`);
    }
  }
}
