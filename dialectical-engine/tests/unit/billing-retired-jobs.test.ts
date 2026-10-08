import { describe, expect, it, vi } from "vitest";
import { RETIRED_OUTBOX_KINDS, type OutboxJob } from "@debateai/db";
import { BillingOutboxWorker, isThisPaymentSystem, otherPaymentSystem, otherSystemCode } from "../../apps/api/src/billing/outbox.js";
import { createRetiredJobHandler, registerRetiredJobs, retiredVerifyJob } from "../../apps/api/src/billing/retired-jobs.js";

const NOW = new Date("2026-10-20T10:00:00.000Z");
const CHARGE = "a".repeat(32);
const job = (kind: OutboxJob["kind"], ref: string): OutboxJob => ({
  jobId: `job-${kind}-${ref}`, kind, ref, payload: {}, attempts: 1, notBefore: NOW, createdAt: NOW
}) as unknown as OutboxJob;

describe("N23 the jobs the previous card processor's flows queued (spec 2026-10-05 §2.5.4)", () => {
  it("keeps exactly one retired kind, which no NETOPIA flow queues", () => {
    expect(RETIRED_OUTBOX_KINDS).toHaveLength(1);
    expect(RETIRED_OUTBOX_KINDS).not.toContain("PAYMENT_REFUND");
    expect(RETIRED_OUTBOX_KINDS).not.toContain("VERIFY_PAYMENT");
    expect(Object.isFrozen(RETIRED_OUTBOX_KINDS)).toBe(true);
  });

  it("ends a retired job DEAD OTHER_PAYMENT_SYSTEM with one content-free line, whatever its payload", async () => {
    const audit = vi.fn();
    const handler = createRetiredJobHandler(audit);
    const kind = RETIRED_OUTBOX_KINDS[0]!;
    const outcome = await handler({ ...job(kind, `${CHARGE}:61001`), payload: { amount_micros: 24_200_000, owner_ref: "o" } } as OutboxJob, NOW);
    expect(outcome).toEqual({ kind: "DEAD", code: "OTHER_PAYMENT_SYSTEM" });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith("billing.outbox.other_system", { kind, code: "OTHER_PAYMENT_SYSTEM" });
  });

  it("registers every retired kind on the worker, once", () => {
    const registered: string[] = [];
    registerRetiredJobs({ register: (kind) => { registered.push(kind); } }, vi.fn());
    expect(registered).toEqual([...RETIRED_OUTBOX_KINDS]);
    const worker = new BillingOutboxWorker({
      repository: { claim: vi.fn(), complete: vi.fn(), fail: vi.fn(), renewClaim: vi.fn() } as never,
      workerId: "w", clock: () => NOW, audit: vi.fn(), batchSize: 1
    });
    registerRetiredJobs(worker, vi.fn());
    expect(() => registerRetiredJobs(worker, vi.fn())).toThrow(`BILLING_OUTBOX_HANDLER_DUPLICATE:${RETIRED_OUTBOX_KINDS[0]!}`);
  });

  it("reads a payment check keyed by anything but our 32-hex charge id as the previous processor's", () => {
    expect(retiredVerifyJob(job("VERIFY_PAYMENT", "9912345"))).toBe(true);
    expect(retiredVerifyJob(job("VERIFY_PAYMENT", "A".repeat(32)))).toBe(true);
    expect(retiredVerifyJob(job("VERIFY_PAYMENT", `${CHARGE}0`))).toBe(true);
    expect(retiredVerifyJob(job("VERIFY_PAYMENT", CHARGE))).toBe(false);
    // Only payment checks: every other kind keeps its own ref rules.
    expect(retiredVerifyJob(job("EMAIL", "9912345"))).toBe(false);
  });

  it("names this host's payment system only for a NETOPIA row of the same environment", () => {
    expect(isThisPaymentSystem({ paymentProvider: "netopia", paymentEnvironment: "sandbox" }, "sandbox")).toBe(true);
    expect(isThisPaymentSystem({ paymentProvider: "netopia", paymentEnvironment: "live" }, "sandbox")).toBe(false);
    expect(isThisPaymentSystem({ paymentProvider: "netopia", paymentEnvironment: "sandbox" }, "live")).toBe(false);
    // An old row: any other provider, whatever its environment.
    expect(isThisPaymentSystem({ paymentProvider: ["x", "money"].join(""), paymentEnvironment: "live" }, "live")).toBe(false);
    expect(isThisPaymentSystem({ paymentProvider: ["x", "money"].join(""), paymentEnvironment: "stage" }, "sandbox")).toBe(false);
  });

  it("writes OTHER_PAYMENT_SYSTEM, and still reads the code old rows were stored with as another system", () => {
    const audit = vi.fn();
    expect(otherPaymentSystem(audit, "VERIFY_PAYMENT")).toEqual({ kind: "DEAD", code: "OTHER_PAYMENT_SYSTEM" });
    expect(otherSystemCode("OTHER_PAYMENT_SYSTEM")).toBe(true);
    expect(otherSystemCode(["OTHER", "X" + "MONEY", "SYSTEM"].join("_"))).toBe(true);
    expect(otherSystemCode("REFUND_NOT_REQUESTED")).toBe(false);
    expect(otherSystemCode(null)).toBe(false);
  });
});
