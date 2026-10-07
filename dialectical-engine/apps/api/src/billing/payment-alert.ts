import type { BillingJobQueries, BillingRepository } from "@debateai/db";
import { emailJob } from "./email-job.js";
import { enqueueOnce } from "./outbox.js";

/**
 * The owner's O3 for a payment that needs them (spec §2.7 O3 codes), in its own transaction, at most once per
 * `dedupeRef` ever (`enqueueOnce`): a per-hour ref (`code:YYYY-MM-DDTHH`) gives "once per code and hour", a per-charge
 * ref "once per charge". Owner-facing English, content-free: our reference and the code. Returns whether it was queued.
 */
export async function queuePaymentAlert(
  deps: Readonly<{ repository: Pick<BillingRepository, "withTransaction" | "enqueue">; jobs: Pick<BillingJobQueries, "outboxJobExists"> }>,
  input: Readonly<{ code: string; reference: string; nextSteps: string; dedupeRef: string; now: Date }>
): Promise<boolean> {
  return deps.repository.withTransaction((client) => enqueueOnce(deps, client, emailJob({
    template: "O3", recipient: { kind: "OWNER" }, dedupeRef: input.dedupeRef,
    params: { jobKind: "PAYMENT", reference: input.reference, reasonCode: input.code, nextSteps: input.nextSteps, paymentAlert: "true" },
    notBefore: input.now
  })));
}
