import type { PoolClient } from "pg";
import type { BillingJobQueries, BillingRepository } from "@debateai/db";
import { emailJob } from "./email-job.js";
import { enqueueOnce } from "./outbox.js";

/**
 * The owner's O3 for a payment that needs them (spec §2.7 O3 codes), in its own transaction, at most once per
 * `dedupeRef` ever (`enqueueOnce`): a per-hour ref (`code:YYYY-MM-DDTHH`) gives "once per code and hour", a per-charge
 * ref "once per charge". Owner-facing English, content-free: our reference and the code. Returns whether it was queued.
 * `client`: queued in the caller's transaction instead (N15b: with the CHARGEBACK row that makes it true).
 */
export async function queuePaymentAlert(
  deps: Readonly<{ repository: Pick<BillingRepository, "withTransaction" | "enqueue">; jobs: Pick<BillingJobQueries, "outboxJobExists"> }>,
  input: Readonly<{ code: string; reference: string; nextSteps: string; dedupeRef: string; now: Date }>,
  client?: PoolClient
): Promise<boolean> {
  const queue = (on: PoolClient) => enqueueOnce(deps, on, emailJob({
    template: "O3", recipient: { kind: "OWNER" }, dedupeRef: input.dedupeRef,
    params: { jobKind: "PAYMENT", reference: input.reference, reasonCode: input.code, nextSteps: input.nextSteps, paymentAlert: "true" },
    notBefore: input.now
  }));
  return client === undefined ? deps.repository.withTransaction(queue) : queue(client);
}

/**
 * The dedupe ref of a charge's one O3 CHARGEBACK_LOST (VERIFY_PAYMENT's lost charge-back, NETOPIA status 10). Shared
 * with `queueRefundHeldAlert`, which queues no REFUND_HELD_BY_CHARGEBACK once that O3 exists (it already names the
 * held refund).
 */
export function chargebackLostAlertRef(chargeId: string): string {
  return `${chargeId}:CHARGEBACK_LOST`;
}

/** Whether the O3 `queuePaymentAlert` queues for `dedupeRef` was ever queued (the same job kind and ref it writes). */
export async function paymentAlertQueued(
  jobs: Pick<BillingJobQueries, "outboxJobExists">, client: PoolClient, dedupeRef: string
): Promise<boolean> {
  const job = emailJob({ template: "O3", recipient: { kind: "OWNER" }, dedupeRef, params: {}, notBefore: new Date(0) });
  return jobs.outboxJobExists(client, job.kind, job.ref);
}
