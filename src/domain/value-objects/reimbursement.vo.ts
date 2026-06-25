import { Money } from "./money.vo";
import { InvalidOperationError } from "../errors/domain.error";

export interface ReimbursementData {
  description: string;
  amount: number;
  isTaxable: boolean;
}

/**
 * A single reimbursement line item within a pay period.
 * isTaxable=false items are not included in taxable income (e.g. meal/internet allowance).
 */
export class Reimbursement {
  private constructor(
    private readonly _description: string,
    private readonly _amount: Money,
    private readonly _isTaxable: boolean,
  ) {}

  static of(data: ReimbursementData): Reimbursement {
    if (!data.description.trim()) throw new InvalidOperationError("Reimbursement description is required");
    if (data.amount < 0) throw new InvalidOperationError("Reimbursement amount cannot be negative");
    return new Reimbursement(data.description, Money.of(data.amount), data.isTaxable);
  }

  get description(): string { return this._description; }
  get amount(): Money { return this._amount; }
  get isTaxable(): boolean { return this._isTaxable; }

  toData(): ReimbursementData {
    return {
      description: this._description,
      amount: this._amount.amount,
      isTaxable: this._isTaxable,
    };
  }
}

/** Aggregate of all reimbursement line items for a pay period. */
export class ReimbursementBundle {
  private readonly items: Reimbursement[];

  private constructor(items: Reimbursement[]) {
    this.items = items;
  }

  static from(data: ReimbursementData[]): ReimbursementBundle {
    return new ReimbursementBundle(data.map(Reimbursement.of));
  }

  static empty(): ReimbursementBundle {
    return new ReimbursementBundle([]);
  }

  get total(): Money {
    return this.items.reduce((s, r) => s.add(r.amount), Money.zero());
  }

  get taxableTotal(): Money {
    return this.items
      .filter((r) => r.isTaxable)
      .reduce((s, r) => s.add(r.amount), Money.zero());
  }

  get exemptTotal(): Money {
    return this.items
      .filter((r) => !r.isTaxable)
      .reduce((s, r) => s.add(r.amount), Money.zero());
  }

  toArray(): Reimbursement[] {
    return [...this.items];
  }

  toData(): ReimbursementData[] {
    return this.items.map((r) => r.toData());
  }
}
