import { RETIRED_OUTBOX_KINDS, type OutboxJob } from "@debateai/db";
import type { BillingAudit } from "./audit.js";
import { otherPaymentSystem, type BillingOutboxWorker, type OutboxHandler } from "./outbox.js";

/** Our charge id: 32 lower-case hex characters, a uuid without its dashes (A24). */
const CHARGE_ID = /^[0-9a-f]{32}$/u;

/**
 * NETOPIA spec 2026-10-05 §2.8: a payment check is keyed by our charge id. A VERIFY_PAYMENT whose ref is anything
 * else was queued by the previous card processor's flows (its transaction number), and ends DEAD
 * OTHER_PAYMENT_SYSTEM before any read (§2.5.4).
 */
export function retiredVerifyJob(job: Pick<OutboxJob, "kind" | "ref">): boolean {
  return job.kind === "VERIFY_PAYMENT" && !CHARGE_ID.test(job.ref);
}

/**
 * §2.5.4: a queued job of a kind only the previous card processor's flows used ends at once, before any call. Nothing
 * is owed on this host for it; the owner summary lists a dead refund of that era as REFUND_OTHER_SYSTEM.
 */
export function createRetiredJobHandler(audit: BillingAudit): OutboxHandler {
  return async (job) => otherPaymentSystem(audit, job.kind);
}

export function registerRetiredJobs(outbox: Pick<BillingOutboxWorker, "register">, audit: BillingAudit): void {
  for (const kind of RETIRED_OUTBOX_KINDS) outbox.register(kind, createRetiredJobHandler(audit));
}
