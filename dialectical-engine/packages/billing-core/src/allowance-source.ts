import type { PersonAllowanceSource, PersonWindow } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import type { BillingPlans, PlanId } from "@debateai/register";
import { planIn } from "./plan-lookup.js";
import { personWindowsFor } from "./windows.js";

/**
 * PAID PLANS, Part 1b (spec 2026-09-29 §2.4.1; ruling R-1) — the billing
 * implementation of the budget spec's person-allowance slot. It lives in
 * `@debateai/billing-core` (kernel-only manifest; register and budget are type
 * imports), never in `packages/db`, which may not reach register or budget.
 *
 * It does no I/O of its own: `entitlements` is a port. The API passes
 * `EntitlementRepository` itself, which lazily writes the Free sign-up event.
 * The runner passes `EntitlementRepository.readOnlyPort()`, which reads only
 * `billing.person_windows_v` and never writes (A20, R-12). `null` from the port
 * means no personal limit.
 */
export type EntitlementWindowBasis = Readonly<{
  planId: PlanId;
  periodAnchorAt: Date;
  monthCreditOverrideMicros: number | null;
}>;

export interface EntitlementPort {
  current(ownerRef: string, now: Date): Promise<EntitlementWindowBasis | null>;
}

export class BillingPersonAllowanceSource implements PersonAllowanceSource {
  readonly #entitlements: EntitlementPort;
  readonly #plans: BillingPlans;
  readonly #closeBasisPoints: number;

  constructor(options: Readonly<{ entitlements: EntitlementPort; plans: BillingPlans; closeBasisPoints: number }>) {
    if (!Number.isInteger(options.closeBasisPoints) || options.closeBasisPoints < 5_000 || options.closeBasisPoints > 10_000) {
      throw new TypedDomainError("BILLING_WINDOW_INPUT_INVALID", "The close edge is outside 5000-10000 basis points");
    }
    this.#entitlements = options.entitlements;
    this.#plans = options.plans;
    this.#closeBasisPoints = options.closeBasisPoints;
  }

  async read(ownerRef: string, now: Date): Promise<ReadonlyArray<PersonWindow>> {
    const entitlement = await this.#entitlements.current(ownerRef, now);
    if (entitlement === null) return Object.freeze([]);
    // The caller's `now` can fall BEFORE an entitlement the port already reports
    // in force, and `computeWindows` refuses an instant before its anchor
    // (BILLING_WINDOW_BEFORE_ANCHOR). Three ways reach it:
    //  - the runner's port reads `billing.person_windows_v`, which resolves at
    //    the database's `statement_timestamp()`, while the runner took `now`
    //    from its own clock before the query;
    //  - a period end (a lapse anchors at `paid_through`) or an API-dated event
    //    (a new subscription's activation) falls between that `now` and the read;
    //  - an INITIAL charge is anchored at the payment's own time (NETOPIA's `operationDate`, else ours),
    //    another clock again.
    // Such a plan's first window opens at its anchor, and nothing has been spent
    // inside it yet, so the windows are built at max(now, anchor): the correct
    // windows for that instant, never an untyped refusal inside a wall check.
    const at = entitlement.periodAnchorAt.getTime() > now.getTime() ? entitlement.periodAnchorAt : now;
    return personWindowsFor(
      planIn(this.#plans, entitlement.planId),
      entitlement.periodAnchorAt,
      at,
      this.#closeBasisPoints,
      entitlement.monthCreditOverrideMicros
    );
  }
}
