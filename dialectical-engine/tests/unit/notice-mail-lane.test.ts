import { describe, expect, it, vi } from "vitest";
import { AuthFlowError, InProcessAuthRateLimiter, RegistrationService } from "../../apps/api/src/registration.js";
import { reconcileEachIndependently } from "../../apps/api/src/email-mfa-mail.js";
import { AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS, authPolicyFromRegisterRows } from "@debateai/register";

/**
 * K09/NV-24: the background security-notice workers draw from their own notice lane. Anonymous or public traffic can
 * never directly hold, queue for or exhaust its permits, the notice workers never take the shared lane's permits, and
 * one email-recovery flow's failed run never skips the other flow's run in the same tick.
 */
const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS);
const defer = () => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise<void>((r) => setImmediate(r));
const outcome = (dispatch: Promise<void>): Promise<string> =>
  dispatch.then(() => "granted", (error: unknown) => (error as AuthFlowError).code);

function service() {
  const blind = Buffer.alloc(32, 4);
  const dispatcher = new RegistrationService({
    repository: {} as never,
    mail: { sendVerification: async () => {} },
    dekStore: { store: async () => {}, destroy: async () => "ALREADY_ABSENT" },
    blindIndexKey: blind,
    policy: authPolicy,
    limiter: new InProcessAuthRateLimiter(authPolicy.rateLimits, authPolicy.rateLimitBucketCapacity, authPolicy.rateLimitRefusalAuditIntervalMs),
    argon2: {} as never
  });
  const drain = async () => {
    await dispatcher.drainRegistrationAdmissions();
    await dispatcher.drainMailDispatches();
    dispatcher.drainMailCapacitySignals();
    await dispatcher.drainRateLimitAuditFlushes();
    blind.fill(0);
  };
  return { dispatcher, drain };
}

describe("K09/NV-24 notice mail lane", () => {
  it("a full shared lane (32 active, 96 queued) never refuses or delays a notice dispatch", async () => {
    const { dispatcher, drain } = service();
    const blockers = defer();
    await Promise.all(Array.from({ length: 32 }, () => dispatcher.dispatchRecoveryMail(async () => async () => { await blockers.promise; })));
    const queued = Array.from({ length: 96 }, () => outcome(dispatcher.dispatchRecoveryMail(async () => null)));
    await tick();
    expect(dispatcher.mailDispatchOccupancy()).toMatchObject({ inFlight: 32, queued: 96, maximum: 32, maximumQueued: 96 });
    await expect(dispatcher.dispatchRecoveryMail(async () => null)).rejects.toMatchObject({ code: "AUTH_MAIL_BUSY" });
    let sent = 0;
    const startedAt = performance.now();
    await dispatcher.dispatchNoticeMail(async () => async () => { sent += 1; });
    expect(performance.now() - startedAt).toBeLessThan(1_500);
    await vi.waitFor(() => expect(sent).toBe(1), { timeout: 2_000 });
    expect(dispatcher.noticeMailDispatchOccupancy()).toMatchObject({ maximum: 16, maximumQueued: 16 });
    expect(dispatcher.mailDispatchOccupancy()).toMatchObject({ inFlight: 32, queued: 96 });
    blockers.resolve();
    const outcomes = await Promise.all(queued);
    await drain();
    expect(outcomes.every((value) => value === "granted" || value === "AUTH_MAIL_BUSY")).toBe(true);
  }, 60_000);

  it("the notice lane is bounded by its own 16 permits and 16 waiters", async () => {
    const { dispatcher, drain } = service();
    const gate = defer();
    const held = Array.from({ length: 16 }, () => outcome(dispatcher.dispatchNoticeMail(async () => async () => { await gate.promise; })));
    const waiting = Array.from({ length: 16 }, () => outcome(dispatcher.dispatchNoticeMail(async () => null)));
    expect(dispatcher.noticeMailDispatchOccupancy()).toMatchObject({ inFlight: 16, queued: 16 });
    await expect(dispatcher.dispatchNoticeMail(async () => null)).rejects.toMatchObject({ code: "AUTH_MAIL_BUSY" });
    expect(dispatcher.mailDispatchOccupancy().inFlight).toBe(0);
    gate.resolve();
    const outcomes = await Promise.all([...held, ...waiting]);
    await drain();
    expect(outcomes.every((value) => value === "granted")).toBe(true);
    expect(dispatcher.noticeMailDispatchOccupancy()).toMatchObject({ inFlight: 0, queued: 0 });
  }, 60_000);

  it("runs every email-recovery flow even when an earlier one fails", async () => {
    const order: string[] = [];
    const failing = { reconcile: async (n: number) => { order.push(`backup:${n}`); throw new AuthFlowError("AUTH_MAIL_BUSY"); } };
    const healthy = { reconcile: async (n: number) => { order.push(`mfa:${n}`); } };
    await expect(reconcileEachIndependently([failing, healthy], 100)).rejects.toMatchObject({ code: "AUTH_MAIL_BUSY" });
    expect(order).toEqual(["backup:100", "mfa:100"]);
    await expect(reconcileEachIndependently([healthy, healthy], 7)).resolves.toBeUndefined();
  });
});
