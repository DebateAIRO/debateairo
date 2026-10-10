import { describe, expect, it, vi } from "vitest";
import type { OutboxJob, OutboxKind } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import {
  BillingOutboxWorker,
  failureRetryAt,
  notFinalRetryAt,
  outboxErrorCode
} from "../../apps/api/src/billing/outbox.js";
import { createCoalescingSingleFlight } from "../../apps/api/src/billing/single-flight.js";
import { MailDeliveryError } from "../../apps/api/src/mail-channel.js";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const MINUTE = 60_000;

function job(kind: OutboxKind, attempts: number, ref = "ref-1"): OutboxJob {
  return {
    jobId: `job-${kind}-${ref}`, kind, ref, notBefore: NOW, attempts, payload: {}, createdAt: NOW,
    claimedBy: "w-1", claimedAt: NOW
  } as unknown as OutboxJob;
}

/** P1b's outbox surface: every claim is still ours (`renewClaim` true) and every fenced settle lands (true). */
function fakeRepository(jobs: OutboxJob[]) {
  return {
    claim: vi.fn(async (kinds: ReadonlyArray<OutboxKind>, limit: number) =>
      jobs.filter((candidate) => kinds.includes(candidate.kind)).slice(0, limit)),
    renewClaim: vi.fn(async (_jobId: string, _workerId: string, _attempts: number, _now: Date) => true),
    complete: vi.fn(async (_jobId: string, _now: Date, _claim?: { workerId: string; attempts: number }) => true),
    fail: vi.fn(async (_jobId: string, _code: string, _retryAt: Date | null, _now: Date, _claim?: { workerId: string; attempts: number }) => true)
  };
}

function workerOn(jobs: OutboxJob[], audit = vi.fn()) {
  const repository = fakeRepository(jobs);
  const worker = new BillingOutboxWorker({ repository, workerId: "w-1", clock: () => NOW, audit, batchSize: 20 });
  return { repository, worker };
}

const fence = (attempts: number) => ({ workerId: "w-1", attempts });

describe("P7 billing outbox worker", () => {
  it("claims only the kinds that have a handler and completes a handled job under its claim fence", async () => {
    const { repository, worker } = workerOn([job("EMAIL", 1), job("VERIFY_PAYMENT", 1, "tx-1")]);
    const seen: string[] = [];
    worker.register("EMAIL", async (claimed) => { seen.push(claimed.ref); return { kind: "DONE" }; });
    const report = await worker.runOnce();
    expect(repository.claim).toHaveBeenCalledWith(["EMAIL"], 20, "w-1", NOW);
    expect(seen).toEqual(["ref-1"]);
    expect(repository.complete).toHaveBeenCalledWith("job-EMAIL-ref-1", NOW, fence(1));
    expect(report).toEqual([{ jobId: "job-EMAIL-ref-1", kind: "EMAIL", outcome: "DONE" }]);
  });

  it("does not claim at all while no handler is registered", async () => {
    const { repository, worker } = workerOn([job("EMAIL", 1)]);
    expect(await worker.runOnce()).toEqual([]);
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it("re-asserts the claim at its attempt before each handler, and skips a job it lost without settling it", async () => {
    const repository = fakeRepository([job("EMAIL", 1, "kept"), job("EMAIL", 1, "lost")]);
    repository.renewClaim.mockImplementation(async (jobId: string) => jobId !== "job-EMAIL-lost");
    const worker = new BillingOutboxWorker({ repository, workerId: "w-1", clock: () => NOW, audit: vi.fn(), batchSize: 20 });
    const handled: string[] = [];
    worker.register("EMAIL", async (claimed) => { handled.push(claimed.ref); return { kind: "DONE" }; });
    const report = await worker.runOnce();
    expect(repository.renewClaim).toHaveBeenCalledWith("job-EMAIL-kept", "w-1", 1, NOW);
    expect(repository.renewClaim).toHaveBeenCalledWith("job-EMAIL-lost", "w-1", 1, NOW);
    expect(handled).toEqual(["kept"]);
    expect(report).toEqual([
      { jobId: "job-EMAIL-kept", kind: "EMAIL", outcome: "DONE" },
      { jobId: "job-EMAIL-lost", kind: "EMAIL", outcome: "RETRY", code: "BILLING_OUTBOX_CLAIM_LOST" }
    ]);
    expect(repository.complete).toHaveBeenCalledTimes(1);
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("reports a job re-claimed while its handler ran as lost, and writes no dead-letter audit for it", async () => {
    const audit = vi.fn();
    const { repository, worker } = workerOn([job("EMAIL", 6, "stale")], audit);
    // P1b's fence refuses the settle: the job now belongs to the worker that re-claimed it.
    repository.fail.mockResolvedValue(false);
    worker.register("EMAIL", async () => ({ kind: "DEAD", code: "EMAIL_PAYLOAD_INVALID" }));
    expect(await worker.runOnce()).toEqual([
      { jobId: "job-EMAIL-stale", kind: "EMAIL", outcome: "RETRY", code: "BILLING_OUTBOX_CLAIM_LOST" }
    ]);
    expect(repository.fail).toHaveBeenCalledWith("job-EMAIL-stale", "EMAIL_PAYLOAD_INVALID", null, NOW, fence(6));
    expect(audit).not.toHaveBeenCalled();
  });

  it("writes one content-free line when a settle throws, and still runs the rest of the batch", async () => {
    const audit = vi.fn();
    const { repository, worker } = workerOn([job("EMAIL", 1, "first"), job("EMAIL", 1, "second")], audit);
    repository.complete.mockRejectedValueOnce(new Error("connection terminated"));
    worker.register("EMAIL", async () => ({ kind: "DONE" }));
    expect(await worker.runOnce()).toEqual([
      { jobId: "job-EMAIL-first", kind: "EMAIL", outcome: "RETRY" },
      { jobId: "job-EMAIL-second", kind: "EMAIL", outcome: "DONE" }
    ]);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith("billing.outbox.settle_failed", { kind: "EMAIL", outcome: "DONE", attempts: 1 });
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("retries a thrown handler on 1m/5m/30m/2h/12h, then dead-letters it with one audit line", async () => {
    expect([1, 2, 3, 4, 5].map((attempts) => failureRetryAt(attempts, NOW)!.getTime() - NOW.getTime()))
      .toEqual([MINUTE, 5 * MINUTE, 30 * MINUTE, 120 * MINUTE, 720 * MINUTE]);
    expect(failureRetryAt(6, NOW)).toBeNull();
    for (const [attempts, dead] of [[1, false], [6, true]] as const) {
      const audit = vi.fn();
      const { repository, worker } = workerOn([job("EMAIL", attempts)], audit);
      worker.register("EMAIL", async () => { throw new TypedDomainError("PAYMENT_PROVIDER_UNAVAILABLE", "down"); });
      const [outcome] = await worker.runOnce();
      expect(outcome?.outcome).toBe(dead ? "DEAD" : "RETRY");
      expect(repository.fail).toHaveBeenCalledWith(
        "job-EMAIL-ref-1", "PAYMENT_PROVIDER_UNAVAILABLE", dead ? null : new Date(NOW.getTime() + MINUTE), NOW, fence(attempts)
      );
      expect(audit).toHaveBeenCalledTimes(dead ? 1 : 0);
      if (dead) expect(audit).toHaveBeenCalledWith("billing.outbox.dead", { kind: "EMAIL", code: "PAYMENT_PROVIDER_UNAVAILABLE", attempts: 6 });
    }
  });

  it("uses the not-final schedule a handler asks for and treats its end as dead", async () => {
    expect([1, 2, 3, 4, 5, 6].map((attempts) => notFinalRetryAt(attempts, NOW)!.getTime() - NOW.getTime()))
      .toEqual([MINUTE, 5 * MINUTE, 15 * MINUTE, 60 * MINUTE, 360 * MINUTE, 1440 * MINUTE]);
    expect(notFinalRetryAt(7, NOW)).toBeNull();
    const { repository, worker } = workerOn([job("VERIFY_PAYMENT", 7, "tx-9")]);
    worker.register("VERIFY_PAYMENT", async (claimed, now) => ({
      kind: "RETRY", code: "PAYMENT_NOT_FINAL", retryAt: notFinalRetryAt(claimed.attempts, now)
    }));
    await worker.runOnce();
    expect(repository.fail).toHaveBeenCalledWith("job-VERIFY_PAYMENT-tx-9", "PAYMENT_NOT_FINAL", null, NOW, fence(7));
  });

  it("stores only a declared code: provider text never becomes last_error_code", () => {
    expect(outboxErrorCode(new TypedDomainError("TAX_SERVICE_UNAVAILABLE", "x"))).toBe("TAX_SERVICE_UNAVAILABLE");
    expect(outboxErrorCode(new MailDeliveryError("SENDMAIL_TIMEOUT"))).toBe("SENDMAIL_TIMEOUT");
    expect(outboxErrorCode(new TypedDomainError("lower case from a provider", "x"))).toBe("OUTBOX_HANDLER_FAILED");
    expect(outboxErrorCode(new Error("CARD 4111 DECLINED"))).toBe("OUTBOX_HANDLER_FAILED");
  });

  it("refuses a second handler for one kind", () => {
    const { worker } = workerOn([]);
    worker.register("EMAIL", async () => ({ kind: "DONE" }));
    expect(() => worker.register("EMAIL", async () => ({ kind: "DONE" }))).toThrow("BILLING_OUTBOX_HANDLER_DUPLICATE:EMAIL");
  });

  it("drains until a round claims nothing, so a job queued by a handler runs in the same drain", async () => {
    const claimed = [job("VERIFY_PAYMENT", 1, "tx-1"), job("PAYMENT_REFUND", 1, "c")];
    const repository = fakeRepository([]);
    repository.claim
      .mockResolvedValueOnce([claimed[0]!])
      .mockResolvedValueOnce([claimed[1]!])
      .mockResolvedValue([]);
    const worker = new BillingOutboxWorker({ repository, workerId: "w-1", clock: () => NOW, audit: vi.fn(), batchSize: 20 });
    worker.register("VERIFY_PAYMENT", async () => ({ kind: "DONE" }));
    worker.register("PAYMENT_REFUND", async () => ({ kind: "DONE" }));
    expect(await worker.drain(10)).toBe(2);
    expect(repository.claim).toHaveBeenCalledTimes(3);
  });

  it("stops a drain after maxRounds even while every round finds work", async () => {
    const again = job("EMAIL", 1, "again");
    const repository = fakeRepository([again]);
    const claim = repository.claim;
    const worker = new BillingOutboxWorker({ repository, workerId: "w-1", clock: () => NOW, audit: vi.fn(), batchSize: 20 });
    worker.register("EMAIL", async () => ({ kind: "DONE" }));
    expect(await worker.drain(4)).toBe(4);
    expect(claim).toHaveBeenCalledTimes(4);
  });

  it("coalesces kicks that arrive during a run into exactly one more run", async () => {
    let release!: () => void;
    let runs = 0;
    const work = vi.fn(async () => {
      runs += 1;
      if (runs === 1) await new Promise<void>((resolve) => { release = resolve; });
    });
    const trigger = createCoalescingSingleFlight(work, vi.fn());
    trigger();
    trigger();
    trigger();
    expect(work).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(work).toHaveBeenCalledTimes(2);
  });
});
