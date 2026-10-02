import type { BillingJobQueries, BillingRepository, EntitlementRepository } from "@debateai/db";
import type { BillingAudit } from "./audit.js";
import type { BillingReconciler, ReconcileReport } from "./reconcile.js";
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
 * Spec §2.5.6 "Erasure": scheduling an erasure stops renewals at once. It writes ERASURE_STOPPED and the FREE
 * entitlement; it never calls xMoney (A4d) and never refunds (a payment arriving during the grace is refunded by the
 * settlement itself). Idempotent: an owner with nothing live left is NOTHING. R3-2: the sweep stops an account the
 * age gate froze the same way; read under the owner lock, the freeze marks the row `stopped_for: "AGE_FROZEN"` and
 * the audit line `billing.age_frozen.stopped` (P2's fold has one stop kind, so the mark lives on the row), so it is
 * never read as an erasure. Whether its money goes back is the owner's question, not this hook's.
 */
export class BillingErasureHook {
  constructor(private readonly deps: BillingErasureDeps) {}

  async stop(ownerRef: string): Promise<"STOPPED" | "NOTHING"> {
    const now = this.deps.clock();
    const stopped = await this.deps.billing.withTransaction(async (client) => {
      const locked = await lockedSubscription(this.deps, client, ownerRef);
      if (locked === null || !STOPPABLE.has(locked.state.status)) return null;
      const frozen = await this.deps.billing.ownerAgeFrozen(ownerRef, client);
      await appendChecked(this.deps.billing, client, locked, {
        kind: "ERASURE_STOPPED", at: now, data: frozen ? AGE_FROZEN_STOP : ERASURE_STOP
      });
      await this.deps.entitlements.append(client, {
        ownerRef, planId: "FREE", periodAnchorAt: now, cause: "ERASURE_STOPPED", effectiveAt: now,
        subscriptionId: locked.state.subscriptionId, paidThrough: null, monthCreditOverrideMicros: null
      });
      return Object.freeze({ frozen });
    });
    if (stopped === null) return "NOTHING";
    this.deps.audit(stopped.frozen ? "billing.age_frozen.stopped" : "billing.erasure.stopped", {});
    return "STOPPED";
  }

  /**
   * The durable second line: every owner whose erasure is pending or finished, or whose account the age gate froze
   * (R3-2: the only line that ends such a plan), and who still has a live plan is stopped, page after page, until a
   * page comes back empty. One failing owner does not stop the others; the first failure is thrown at the end, so the
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
          if (await this.stop(ownerRef) === "STOPPED") stopped += 1;
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
