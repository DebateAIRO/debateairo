/**
 * Paid-plans spec 2026-09-29 §2.4.1, amending the budget spec 2026-09-28 §2.8 —
 * THE PERSON'S WINDOWS.
 *
 * The budget spec's slot returned ONE period or null. Billing gives each person
 * up to three windows (a day, a week and a month; Free only the month), each with
 * its own limit, reset, finish edge (the plan row's share, and since billingPlans
 * v4 its fixed overflow) and close edge (the
 * costEnvelopePolicy band's). An EMPTY list means no personal limit: billing off,
 * local mode, or a legacy asker with no owner_ref.
 */
export type SpendScope = "SITE_DAY" | "PERSON_DAY" | "PERSON_WEEK" | "PERSON_MONTH" | "PERSON_GRANT";

export type PersonWindow = Readonly<{
  scope: Exclude<SpendScope, "SITE_DAY">;
  /** The window's limit in USD micro-units: credit × basis points ÷ 10 000, rounded down. */
  limitMicros: number;
  /** Spend recorded at or after this instant counts. */
  periodStart: Date;
  /** When the next window starts; spend before this instant counts. */
  resetsAt: Date;
  /** Exact internal grant pin; absent on historical customer windows. */
  funding?: import("@debateai/kernel").FundingBasis;
  finishBasisPoints: number;
  /**
   * billingPlans v4 (owner 2026-10-30, Q1-Q3), reworked by the owner's money rule of 31 Oct: on the MONTH window only,
   * the tolerance for calls already in flight when the month reaches its wall (20 cents). No new call starts at the
   * wall (`decideMonthWall`, ./room.ts). Absent on a v3 plan's window, and on an internal grant: the share alone.
   */
  finishOverflowMicros?: number;
  /**
   * The money rule (owner, 31 Oct), on a billingPlans v4 DAY or WEEK window: running work is never stopped by it, and
   * what it uses past the limit is borrowed from the next window of its kind (derived from the ledger, never stored:
   * `deriveBorrows`, ./room.ts). New starts still wait for its reset.
   */
  borrows?: true;
  /**
   * The money rule, on a billingPlans v4 MONTH window: the final-answer reserve kept INSIDE the month (a paid plan's 20
   * cents; 0 on Free, whose 5 cents sit on top of its credit). New starts and running work stop that far below the
   * limit, so writing the report is always possible.
   */
  keepsReserveMicros?: number;
  closeBasisPoints: number;
}>;

export interface PersonAllowanceSource {
  read(ownerRef: string, now: Date, context?: Readonly<{ runId: string }>): Promise<ReadonlyArray<PersonWindow>>;
}

/** The only source until billing is switched on: nobody has a personal limit. */
export const NO_PERSON_ALLOWANCE: PersonAllowanceSource = Object.freeze({
  read: async (): Promise<ReadonlyArray<PersonWindow>> => Object.freeze([])
});
