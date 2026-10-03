import type { BillingJobQueries, BillingRepository, EntitlementRepository } from "@debateai/db";
import type { BillingAudit } from "./audit.js";
import type { BillingReconciler, ReconcileReport } from "./reconcile.js";
import { writeCancelLocked } from "./subscription-actions.js";
import { appendChecked, lockedSubscription } from "./subscription-core.js";

export type BillingErasureDeps = Readonly<{
  billing: BillingRepository;
  jobs: Pick<BillingJobQueries, "lockOwner">;
  entitlements: EntitlementRepository;
  audit: BillingAudit;
  clock: () => Date;
}>;

/** The states the fold (P2) lets ERASURE_STOPPED end. */
const STOPPABLE: ReadonlySet<string> = new Set(["CREATED", "ACTIVE", "PAST_DUE", "SUSPENDED"]);

/** R3-2: the data of an ERASURE_STOPPED row — an erasure's carries none, an age-frozen account's says so. */
const ERASURE_STOP: Readonly<Record<string, string>> = Object.freeze({});
const AGE_FROZEN_STOP: Readonly<Record<string, string>> = Object.freeze({ stopped_for: "AGE_FROZEN" });

/**
 * What one stop did: STOPPED ended the plan (ERASURE_STOPPED and FREE: the erasure committed, or the age gate froze
 * the account), RENEWAL_STOPPED wrote a pending deletion's renewal stop (W7), NOTHING found nothing left to do.
 */
export type BillingErasureStop = "STOPPED" | "RENEWAL_STOPPED" | "NOTHING";

/**
 * R-34: the `erasurePending` port of P11a's `RenewalService` (its `erasureBlocks` guards every renewal charge, every
 * resubmission and P11b's dunning retry), answered by `billing.owner_erasure_pending` — true while an erasure is
 * pending and after it finished, so no rebill ever reaches an erased account, and (R3-2) while the account is
 * age_frozen, so no rebill reaches a person the age gate locked out.
 */
export function erasurePendingOf(
  billing: Pick<BillingRepository, "ownerErasurePending">
): (ownerRef: string) => Promise<boolean> {
  return (ownerRef) => billing.ownerErasurePending(ownerRef);
}

/**
 * Spec §2.5.6 "Erasure", as the owner ruled on 2 October 2026 (W7, P2-I10; spec A29 (j)). Read under the owner lock,
 * one of three things happens:
 * - The erasure has committed (0091's `billing.owner_erasure_committed`), or (R3-2) the age gate froze the account:
 *   the plan ends as P15 ended it at scheduling before: ERASURE_STOPPED and the FREE entitlement, never an xMoney call
 *   (A4d), never a refund. A freeze marks the row `stopped_for: "AGE_FROZEN"` and the audit line
 *   `billing.age_frozen.stopped` (P2's fold has one stop kind, so the mark lives on the row), so it is never read as
 *   an erasure. Whether its money goes back is the owner's question, not this hook's.
 * - A deletion is scheduled and has not run: only the renewal stops, at once — CANCEL_REQUESTED with
 *   `source: "ACCOUNT_ERASURE"` (`writeCancelLocked`, no M7) — and the paid plan goes on until the commit, with its
 *   14-day withdrawal still open. A PAST_DUE plan (whose next charge would be a dunning retry) or one whose renewal is
 *   already under way ends now, exactly as the person's own cancel ends it. Cancelling the deletion leaves that stop
 *   standing: the plan runs to the end of its paid month and renews only if the person undoes the cancel (refused
 *   while the deletion is pending). P11a's guard (`owner_erasure_pending`) also refuses every rebill meanwhile.
 * - Otherwise (no deletion, or it was cancelled): nothing.
 * Idempotent: an owner with nothing left to stop is NOTHING. A payment arriving during the grace is refunded by the
 * settlement itself.
 */
export class BillingErasureHook {
  constructor(private readonly deps: BillingErasureDeps) {}

  async stop(ownerRef: string): Promise<BillingErasureStop> {
    const now = this.deps.clock();
    const { billing } = this.deps;
    const done = await billing.withTransaction(async (client) => {
      const locked = await lockedSubscription(this.deps, client, ownerRef);
      if (locked === null) return null;
      const frozen = await billing.ownerAgeFrozen(ownerRef, client);
      if (frozen || await billing.ownerErasureCommitted(ownerRef, client)) {
        if (!STOPPABLE.has(locked.state.status)) return null;
        await appendChecked(billing, client, locked, {
          kind: "ERASURE_STOPPED", at: now, data: frozen ? AGE_FROZEN_STOP : ERASURE_STOP
        });
        await this.deps.entitlements.append(client, {
          ownerRef, planId: "FREE", periodAnchorAt: now, cause: "ERASURE_STOPPED", effectiveAt: now,
          subscriptionId: locked.state.subscriptionId, paidThrough: null, monthCreditOverrideMicros: null
        });
        return Object.freeze({ kind: "STOPPED" as const, frozen });
      }
      // Neither committed nor frozen, so this is a deletion still scheduled (and not cancelled), or none at all.
      if (!await billing.ownerErasurePending(ownerRef, client)) return null;
      const written = await writeCancelLocked(this.deps, client, locked, now, "ACCOUNT_ERASURE");
      return written.outcome === "REQUESTED" ? Object.freeze({ kind: "RENEWAL_STOPPED" as const, frozen: false }) : null;
    });
    if (done === null) return "NOTHING";
    if (done.kind === "RENEWAL_STOPPED") {
      this.deps.audit("billing.cancel", { source: "ACCOUNT_ERASURE" });
      return "RENEWAL_STOPPED";
    }
    this.deps.audit(done.frozen ? "billing.age_frozen.stopped" : "billing.erasure.stopped", {});
    return "STOPPED";
  }

  /**
   * The durable second line, and (W7) the line that ends a plan at the erasure's commit: every owner whose erasure is
   * pending or finished, or whose account the age gate froze (R3-2: the only line that ends such a plan), and who
   * still has a live plan goes through `stop`, page after page, until a page comes back empty: a pending deletion's
   * renewal stop is repeated (the route's own call may have failed), a committed one's plan is ended. The count is the
   * owners `stop` changed. One failing owner does not stop the others; the first failure is thrown at the end, so the
   * single-flight reports the sweep as pending.
   */
  async sweep(pageSize: number): Promise<number> {
    let stopped = 0;
    let after: string | null = null;
    let failure: unknown = undefined;
    for (;;) {
      const page = await this.deps.billing.pendingErasureOwnerRefs(after, pageSize);
      if (page.length === 0) break;
      for (const ownerRef of page) {
        try {
          if (await this.stop(ownerRef) !== "NOTHING") stopped += 1;
        } catch (error) {
          failure ??= error;
        }
      }
      after = page[page.length - 1]!;
    }
    if (failure !== undefined) throw failure;
    return stopped;
  }
}

/**
 * The reconciler's 10-minute work (P14a) with this sweep in front of it, the two isolated: an owner whose stop keeps
 * failing — a history that does not fold refuses every read for that owner (P1b's strict `subscriptionForOwner`), and
 * the sweep lists the owner again on every tick — must never stop the money check for every customer (the daily
 * listing, A2's adoption, the dead-refund counts). A failed sweep reports its own pending code and is tried again on
 * the next tick; the reconciler then runs as always, and its failure alone rejects (the single-flight's
 * `BILLING_RECONCILIATION_PENDING`). P16b's payments-to-check list names the unfoldable subscription for the owner.
 */
export function reconcileWork(deps: Readonly<{
  erasure: Pick<BillingErasureHook, "sweep">;
  reconciler: Pick<BillingReconciler, "tick">;
  reportPending: (code: string) => void;
}>): () => Promise<ReconcileReport> {
  return async () => {
    try {
      await deps.erasure.sweep(100);
    } catch {
      deps.reportPending("BILLING_ERASURE_SWEEP_PENDING");
    }
    return deps.reconciler.tick();
  };
}
