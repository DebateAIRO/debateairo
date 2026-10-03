import { exhaustive, TypedDomainError } from "@debateai/kernel";
import type { BillingJobQueries, BillingRepository, OutboxClaimFence, OutboxJob, OutboxKind } from "@debateai/db";
import type { PoolClient } from "pg";
import { MailDeliveryError } from "../mail-channel.js";
import type { BillingAudit } from "./audit.js";

/**
 * A handler's verdict on one claimed job. `RETRY` with `retryAt: null` means the handler's own schedule is spent:
 * the job is dead-lettered and left to the reconciler (P14a) or the owner.
 */
export type OutboxOutcome =
  | Readonly<{ kind: "DONE" }>
  | Readonly<{ kind: "RETRY"; code: string; retryAt: Date | null }>
  | Readonly<{ kind: "DEAD"; code: string }>;

export type OutboxHandler = (job: OutboxJob, now: Date) => Promise<OutboxOutcome>;

export const DONE: OutboxOutcome = Object.freeze({ kind: "DONE" as const });

const DECLARED_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;

/**
 * P2-I4 (D5 5h): the two xMoney systems number their transactions separately, and the database keeps the sandbox's
 * records across README §14.8's same-host switch. A refund, invoice or credit-note job, or a payment check
 * (VERIFY_PAYMENT) that names its own charge, whose charge was paid in the other system, and (P2-W3 (b)) a
 * still-due RENEWAL_NOTICE whose plan belongs to the other system end here, DEAD before any vendor call or quote,
 * with this one content-free code and one audit line (the kind and the code). The charge jobs' callers compare
 * `charge.xmoneyEnvironment` with the connectors' system; the RENEWAL_NOTICE handler compares the subscription's
 * `xmoneyEnvironment` (its folded state) instead, since a notice names no charge.
 */
export function otherXMoneySystem(
  audit: BillingAudit, kind: OutboxKind
): Readonly<{ kind: "DEAD"; code: "OTHER_XMONEY_SYSTEM" }> {
  audit("billing.outbox.other_system", { kind, code: "OTHER_XMONEY_SYSTEM" });
  return Object.freeze({ kind: "DEAD" as const, code: "OTHER_XMONEY_SYSTEM" as const });
}

/** `attempts` counts the attempt that just failed (the claim increments it). 1m, 5m, 30m, 2h, 12h, then dead. */
export function failureRetryAt(attempts: number, now: Date): Date | null {
  const delaysMs = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
  const delay = delaysMs[attempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}

/** A9: a payment that is not final yet is looked at again after 1m, 5m, 15m, 1h, 6h and 24h. */
export function notFinalRetryAt(attempts: number, now: Date): Date | null {
  const delaysMs = [60_000, 300_000, 900_000, 3_600_000, 21_600_000, 86_400_000];
  const delay = delaysMs[attempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}

/** Only a code this system declared reaches `billing.outbox.last_error_code`; anything else is one constant. */
export function outboxErrorCode(error: unknown): string {
  const code = error instanceof TypedDomainError ? error.code
    : error instanceof MailDeliveryError ? error.operatorCode
      : null;
  return code !== null && DECLARED_CODE.test(code) ? code : "OUTBOX_HANDLER_FAILED";
}

/**
 * The open-job uniqueness (A3e) only holds while a job is open. A "send once ever" email or notice therefore
 * checks for ANY row with this kind and ref, done or not, before enqueueing.
 */
export async function enqueueOnce(
  d: Readonly<{ repository: Pick<BillingRepository, "enqueue">; jobs: Pick<BillingJobQueries, "outboxJobExists"> }>,
  client: PoolClient,
  job: Parameters<BillingRepository["enqueue"]>[1]
): Promise<boolean> {
  if (await d.jobs.outboxJobExists(client, job.kind, job.ref)) return false;
  await d.repository.enqueue(client, job);
  return true;
}

/**
 * `code` is set only on a job whose claim was lost (`BILLING_OUTBOX_CLAIM_LOST`): skipped before its handler, or
 * settled by nobody because P1b's fence refused the write (the job was re-claimed while its handler ran).
 */
export type OutboxRunRow = Readonly<{ jobId: string; kind: OutboxKind; outcome: OutboxOutcome["kind"]; code?: string }>;
export type OutboxRunReport = ReadonlyArray<OutboxRunRow>;

const lostClaim = (job: OutboxJob): OutboxRunRow =>
  Object.freeze({ jobId: job.jobId, kind: job.kind, outcome: "RETRY" as const, code: "BILLING_OUTBOX_CLAIM_LOST" });

export class BillingOutboxWorker {
  private readonly handlers = new Map<OutboxKind, OutboxHandler>();

  constructor(private readonly options: Readonly<{
    /** P1b: the claim, its re-assert (`renewClaim`) and the fenced settle (see "The claim lease and its invariant"). */
    repository: Pick<BillingRepository, "claim" | "complete" | "fail" | "renewClaim">;
    workerId: string;
    clock: () => Date;
    audit: BillingAudit;
    batchSize: number;
    /**
     * W12 (P2-I16): called once a job's dead-letter has landed (never for a retry, nor when P1b's fence refused it).
     * The runtime queues the owner's O3 here (`createDeadJobAlert`). A failure leaves the job dead and writes one
     * content-free line; the owner summary still lists the job.
     */
    onDead?: (job: OutboxJob, code: string, now: Date) => Promise<void>;
  }>) {}

  register(kind: OutboxKind, handler: OutboxHandler): void {
    if (this.handlers.has(kind)) throw new TypeError(`BILLING_OUTBOX_HANDLER_DUPLICATE:${kind}`);
    this.handlers.set(kind, handler);
  }

  /**
   * One claim of at most `batchSize` jobs of the registered kinds; a kind with no handler stays queued. The jobs run
   * one after another, so each is re-claimed right before its handler: P1b hands a job whose claim is older than its
   * 5-minute lease to the next claimer, and a job another process took meanwhile is skipped, not run a second time.
   * This holds because one handler, once started, finishes well inside the lease (every external call is bounded;
   * VERIFY_PAYMENT, the slowest, makes about three 10-second xMoney calls).
   */
  async runOnce(): Promise<OutboxRunReport> {
    const kinds = [...this.handlers.keys()];
    if (kinds.length === 0) return Object.freeze([]);
    const claimed = await this.options.repository.claim(
      kinds, this.options.batchSize, this.options.workerId, this.options.clock()
    );
    const report: OutboxRunRow[] = [];
    for (const job of claimed) {
      const handler = this.handlers.get(job.kind);
      if (handler === undefined) continue;
      if (!await this.options.repository.renewClaim(job.jobId, this.options.workerId, job.attempts, this.options.clock())) {
        // Another process holds it now, at a later attempt; its own run settles it.
        report.push(lostClaim(job));
        continue;
      }
      let outcome: OutboxOutcome;
      try {
        outcome = await handler(job, this.options.clock());
      } catch (error) {
        outcome = Object.freeze({
          kind: "RETRY" as const, code: outboxErrorCode(error),
          retryAt: failureRetryAt(job.attempts, this.options.clock())
        });
      }
      try {
        const settled = await this.settle(job, outcome);
        report.push(settled === null ? lostClaim(job) : Object.freeze({ jobId: job.jobId, kind: job.kind, outcome: settled }));
      } catch {
        // The job keeps its claim and runs again after its 5-minute lease, so a DONE side effect (an email) may
        // repeat: delivery is at-least-once, and this line is the operator's signal. Later jobs in the batch
        // still get their attempt.
        this.options.audit("billing.outbox.settle_failed", { kind: job.kind, outcome: outcome.kind, attempts: job.attempts });
        report.push(Object.freeze({ jobId: job.jobId, kind: job.kind, outcome: "RETRY" as const }));
      }
    }
    return Object.freeze(report);
  }

  /**
   * Runs rounds until one claims nothing, at most `maxRounds`; returns how many jobs it handled. A handler that
   * queues a follow-up job due now (VERIFY_PAYMENT → XMONEY_REFUND → EMAIL) is served in the same drain. A job
   * retried later is not re-claimed: its `not_before` is in the future, and a job whose settle failed keeps its
   * five-minute claim lease.
   */
  async drain(maxRounds: number): Promise<number> {
    let handled = 0;
    for (let round = 0; round < maxRounds; round += 1) {
      const report = await this.runOnce();
      handled += report.length;
      if (report.length === 0) break;
    }
    return handled;
  }

  /** P1b's fence: only the worker still holding this attempt may finish, release or kill the job. */
  private fence(job: OutboxJob): OutboxClaimFence {
    return Object.freeze({ workerId: this.options.workerId, attempts: job.attempts });
  }

  /** `null`: the fence refused the write, because the job was re-claimed while its handler ran; its new owner settles it. */
  private async settle(job: OutboxJob, outcome: OutboxOutcome): Promise<OutboxOutcome["kind"] | null> {
    const now = this.options.clock();
    switch (outcome.kind) {
      case "DONE":
        return await this.options.repository.complete(job.jobId, now, this.fence(job)) ? "DONE" : null;
      case "RETRY":
        if (outcome.retryAt !== null) {
          return await this.options.repository.fail(job.jobId, outcome.code, outcome.retryAt, now, this.fence(job))
            ? "RETRY" : null;
        }
        return this.dead(job, outcome.code, now);
      case "DEAD":
        return this.dead(job, outcome.code, now);
      default:
        return exhaustive(outcome);
    }
  }

  private async dead(job: OutboxJob, code: string, now: Date): Promise<"DEAD" | null> {
    if (!await this.options.repository.fail(job.jobId, code, null, now, this.fence(job))) return null;
    this.options.audit("billing.outbox.dead", { kind: job.kind, code, attempts: job.attempts });
    if (this.options.onDead !== undefined) {
      try {
        await this.options.onDead(job, code, now);
      } catch {
        this.options.audit("billing.outbox.alert_failed", { kind: job.kind, code });
      }
    }
    return "DEAD";
  }
}
