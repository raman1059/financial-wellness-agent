import { InvalidOperationError } from "../errors/domain.error";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export class PayPeriod {
  private constructor(
    private readonly _month: number,
    private readonly _year: number,
  ) {}

  static of(month: number, year: number): PayPeriod {
    if (month < 1 || month > 12) throw new InvalidOperationError(`Invalid month: ${month}`);
    if (year < 2000 || year > 2100) throw new InvalidOperationError(`Invalid year: ${year}`);
    return new PayPeriod(month, year);
  }

  static current(): PayPeriod {
    const now = new Date();
    return new PayPeriod(now.getMonth() + 1, now.getFullYear());
  }

  get month(): number { return this._month; }
  get year(): number { return this._year; }

  /** "April 2024" */
  get label(): string {
    return `${MONTH_NAMES[this._month - 1]} ${this._year}`;
  }

  /** "Apr 2024" */
  get shortLabel(): string {
    return `${MONTH_NAMES[this._month - 1].slice(0, 3)} ${this._year}`;
  }

  /**
   * Indian financial year runs April–March.
   * April 2024 → "2024-25", March 2025 → "2024-25"
   */
  get financialYear(): string {
    const fyStart = this._month >= 4 ? this._year : this._year - 1;
    const fyEnd = (fyStart + 1) % 100;
    return `${fyStart}-${String(fyEnd).padStart(2, "0")}`;
  }

  /**
   * Returns [startDate, endDate] of the pay period.
   */
  get dateRange(): [Date, Date] {
    const start = new Date(this._year, this._month - 1, 1);
    const end   = new Date(this._year, this._month, 0);    // last day of month
    return [start, end];
  }

  isCurrentPeriod(): boolean {
    const now = PayPeriod.current();
    return this._month === now.month && this._year === now.year;
  }

  isSamePeriod(other: PayPeriod): boolean {
    return this._month === other._month && this._year === other._year;
  }

  belongsToFY(fy: string): boolean {
    return this.financialYear === fy;
  }

  /** Chronological comparison: -1, 0, 1 */
  compareTo(other: PayPeriod): number {
    if (this._year !== other._year) return this._year < other._year ? -1 : 1;
    if (this._month !== other._month) return this._month < other._month ? -1 : 1;
    return 0;
  }

  toString(): string {
    return `${this._year}-${String(this._month).padStart(2, "0")}`;
  }
}
