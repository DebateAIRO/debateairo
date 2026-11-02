import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  encrypt,
  generateDek,
  generateRecoveryCodes,
  generateTotpSecret,
  totpCodeAtStep,
  type Argon2Executor,
  type ReadableUserDekStore
} from "../../packages/crypto/src/index.js";
import {
  AUTH_POLICY_REGISTER_ROWS,
  authPolicyFromRegisterRows,
  MFA_POLICY_REGISTER_ROW,
  mfaPolicyFromValue,
  SESSION_POLICY_REGISTER_ROW,
  sessionPolicyFromValue
} from "@debateai/register";
import { SessionService } from "../../apps/api/src/sessions.js";

/**
 * NV-04 (security audit run 3): login TOTP guesses are budgeted per account and factor, not per challenge.
 * `completeLogin`'s 6-digit branch charges an in-process per-account key and then the durable per-factor admit
 * (`admitTotpLoginAttempt`) BEFORE the DEK is loaded, so neither a new challenge, a new source nor a restarted process
 * buys more guesses. The escalating cooldown itself lives in SQL and is tested in session-database.test.ts; this file
 * pins what the service does with the admit's answer, using a stub that refuses once five charges are uncleared.
 */

type SessionDependencies = Parameters<typeof SessionService.create>[0];

const SOURCES = ["203.0.113.11", "198.51.100.22", "192.0.2.33"].map((ip) => Object.freeze({
  ip,
  userAgent: "login-totp-guess-budget-test",
  requestId: `request:login-totp-guess-budget:${ip}`
}));

/** Syntactically valid argon2id encoding: `verifyPassword` parses it before delegating. */
const PARSEABLE_PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$`
  + `${Buffer.alloc(16, 0x11).toString("base64").replace(/=+$/, "")}$`
  + `${Buffer.alloc(32, 0x22).toString("base64").replace(/=+$/, "")}`;

type Admission = Readonly<{ admitted: boolean; retryAfterMs: number }>;

/** The shared durable counter, as two services over one database would see it. */
function lockoutStub(behaviour: Readonly<{ admitAll?: boolean; admitError?: unknown; clearError?: unknown }> = {}) {
  let uncleared = 0;
  const admits: Array<Record<string, unknown>> = [];
  const clears: Array<Record<string, unknown>> = [];
  return {
    admits,
    clears,
    get uncleared() { return uncleared; },
    async admitTotpLoginAttempt(input: Record<string, unknown>): Promise<Admission> {
      admits.push({ ...input });
      if (behaviour.admitError !== undefined) throw behaviour.admitError;
      if (behaviour.admitAll !== true && uncleared >= 5) return Object.freeze({ admitted: false, retryAfterMs: 300_000 });
      uncleared += 1;
      return Object.freeze({ admitted: true, retryAfterMs: 0 });
    },
    async clearTotpLoginLockout(input: Record<string, unknown>): Promise<void> {
      clears.push({ ...input });
      if (behaviour.clearError !== undefined) throw behaviour.clearError;
      uncleared = 0;
    }
  };
}
type LockoutStub = ReturnType<typeof lockoutStub>;

async function harness(lockout: LockoutStub, options: Readonly<{ withFactor?: boolean }> = {}) {
  const withFactor = options.withFactor ?? true;
  const userId = randomUUID();
  const factorId = randomUUID();
  const dek = generateDek();
  const secret = generateTotpSecret();
  const now = new Date();
  const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
  const mfaPolicy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);
  const step = Math.floor(now.getTime() / (mfaPolicy.totp.periodSeconds * 1_000));
  const correctCode = totpCodeAtStep(secret, step);
  let wrongCode = "";
  for (let n = 0; wrongCode === ""; n += 1) {
    const candidate = String(n).padStart(6, "0");
    if (![step - 1, step, step + 1].some((s) => totpCodeAtStep(secret, s) === candidate)) wrongCode = candidate;
  }
  const identity = Object.freeze({
    userId,
    ownerRef: randomUUID(),
    auditToken: randomUUID(),
    passwordHash: PARSEABLE_PASSWORD_HASH,
    factorId: withFactor ? factorId : null,
    secretCiphertext: withFactor ? encrypt(dek, secret, [
      "identity", "mfa_factor.secret_ciphertext", factorId,
      "run:none", userId, `user-dek:${userId}`, "1"
    ]) : null,
    lastAcceptedStep: null
  });
  const calls = { dekLoads: 0, recoveryReads: 0, failures: [] as unknown[], recoveryAccepted: false };
  const challenges = new Map<string, Record<string, unknown>>();
  const repository = {
    async findLoginIdentity() { return identity; },
    async createLoginChallenge(input: Record<string, unknown>) {
      challenges.set(String(input.challengeTokenHash), {
        ...identity,
        firstStep: "PASSWORD",
        challengeId: input.challengeId,
        challengeTokenHash: input.challengeTokenHash,
        bindingHash: input.bindingHash,
        expiresAt: input.expiresAt,
        consumedAt: null
      });
      return true;
    },
    async readLoginChallenge(hash: string) { return challenges.get(hash) ?? null; },
    // totpStep already gates this on a matched step, so the fake always completes.
    async completeTotpLogin() { return true; },
    async readRecoveryCodeForLogin(hash: string, slot: number) {
      calls.recoveryReads += 1;
      const challenge = challenges.get(hash);
      return calls.recoveryAccepted && challenge !== undefined
        ? Object.freeze({ challenge, recoveryCodeId: randomUUID(), codeHash: PARSEABLE_PASSWORD_HASH, codeSlot: slot })
        : null;
    },
    async completeRecoveryLogin() { return true; },
    async recordLoginFailure(input: Record<string, unknown>) { calls.failures.push({ ...input }); },
    admitTotpLoginAttempt: (input: Record<string, unknown>) => lockout.admitTotpLoginAttempt(input),
    clearTotpLoginLockout: (input: Record<string, unknown>) => lockout.clearTotpLoginLockout(input)
  } as unknown as SessionDependencies["repository"];
  const dekStore: ReadableUserDekStore = {
    store: async () => undefined,
    destroy: async () => "ALREADY_ABSENT",
    exists: async () => true,
    // A fresh copy per call: totpStep zeroes the buffer it is handed.
    load: async (requested) => {
      if (requested !== userId) throw new Error("UNEXPECTED_USER_DEK_LOOKUP");
      calls.dekLoads += 1;
      return Buffer.from(dek);
    }
  };
  const clearFailures: unknown[] = [];
  const riskFailures: unknown[] = [];
  /** One API process. Two calls are two processes (or one process before and after a restart). */
  const service = () => SessionService.create({
    repository,
    riskSignals: { recordForSession: async () => "recorded" } as SessionDependencies["riskSignals"],
    onRiskSignalFailure: (error: unknown) => { riskFailures.push(error); },
    onTotpLockoutClearFailure: (error: unknown) => { clearFailures.push(error); },
    dekStore,
    argon2: {
      hashPassword: async () => PARSEABLE_PASSWORD_HASH,
      verifyPassword: async () => true,
      hashAuditContext: async () => "argon2id-audit:v1:" + "0".repeat(64)
    } as unknown as Argon2Executor,
    authPolicy,
    mfaPolicy,
    sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value, SESSION_POLICY_REGISTER_ROW.sourceRef),
    blindIndexKey: Buffer.alloc(32, 0x61),
    bindingKey: Buffer.alloc(32, 0x62),
    dummyPasswordHash: PARSEABLE_PASSWORD_HASH,
    clock: () => now
  });
  const begin = async (sessions: SessionService, source: (typeof SOURCES)[number]) =>
    (await sessions.beginLogin({ email: "totp-budget@example.test", password: "correct horse battery staple" }, source)).challengeToken;
  return {
    userId, factorId, correctCode, wrongCode, calls, clearFailures, riskFailures, service, begin,
    recoveryCode: generateRecoveryCodes()[0]!
  };
}

describe("NV-04 login TOTP attempts are budgeted per account and factor", () => {
  it("Case 1: the sixth wrong code for one account across two challenges and two sources is refused before the DEK", async () => {
    const lockout = lockoutStub();
    const h = await harness(lockout);
    const sessions = await h.service();
    const answers: unknown[] = [];
    for (const [index, source] of [SOURCES[0]!, SOURCES[1]!].entries()) {
      const challengeToken = await h.begin(sessions, source);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        answers.push(await sessions.completeLogin({ challengeToken, code: h.wrongCode }, source)
          .then(() => `signed-in:${index}`, (error: { code?: unknown }) => error.code));
      }
    }
    expect(answers).toEqual([
      "AUTH_CREDENTIALS_INVALID", "AUTH_CREDENTIALS_INVALID", "AUTH_CREDENTIALS_INVALID",
      "AUTH_CREDENTIALS_INVALID", "AUTH_CREDENTIALS_INVALID", "MFA_RATE_LIMITED"
    ]);
    expect(h.calls.dekLoads).toBe(5);
    // The in-process per-account key refused the sixth, so the durable counter was charged five times only.
    expect(lockout.admits).toHaveLength(5);
    expect(h.calls.failures.at(-1)).toMatchObject({ reason: "AUTH_RATE_LIMITED" });
  });

  it("Case 2: after five wrong codes a fresh process refuses even the correct code, without loading the DEK", async () => {
    const lockout = lockoutStub();
    const h = await harness(lockout);
    const first = await h.service();
    const challengeToken = await h.begin(first, SOURCES[0]!);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(first.completeLogin({ challengeToken, code: h.wrongCode }, SOURCES[0]!))
        .rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
    }
    expect(h.calls.dekLoads).toBe(5);
    // A restart: a new service (a new in-process limiter) over the same durable counter.
    const restarted = await h.service();
    const fresh = await h.begin(restarted, SOURCES[1]!);
    await expect(restarted.completeLogin({ challengeToken: fresh, code: h.correctCode }, SOURCES[1]!))
      .rejects.toMatchObject({ code: "MFA_RATE_LIMITED" });
    expect(h.calls.dekLoads).toBe(5);
    expect(lockout.admits).toHaveLength(6);
    expect(h.calls.failures.at(-1)).toMatchObject({ reason: "AUTH_RATE_LIMITED" });
    expect(lockout.clears).toEqual([]);
  });

  it("Case 3 (guard): recovery codes are never charged or refused by the TOTP budget", async () => {
    const lockout = lockoutStub();
    const h = await harness(lockout);
    const sessions = await h.service();
    for (const source of [SOURCES[0]!, SOURCES[1]!]) {
      const challengeToken = await h.begin(sessions, source);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await sessions.completeLogin({ challengeToken, code: h.wrongCode }, source).catch(() => undefined);
      }
    }
    // A guard, green before and after the fix: whatever the TOTP codes charged, the recovery codes add nothing.
    const charged = lockout.admits.length;
    const uncleared = lockout.uncleared;
    // A failed recovery code on a fresh challenge from a third source reaches the recovery reader and charges nothing.
    const failed = await h.begin(sessions, SOURCES[2]!);
    await expect(sessions.completeLogin({ challengeToken: failed, code: h.recoveryCode }, SOURCES[2]!))
      .rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
    expect(h.calls.recoveryReads).toBe(1);
    expect(lockout.admits).toHaveLength(charged);
    expect(lockout.uncleared).toBe(uncleared);
    // A valid recovery code still signs in after the TOTP budget is spent.
    h.calls.recoveryAccepted = true;
    const valid = await h.begin(sessions, SOURCES[2]!);
    await expect(sessions.completeLogin({ challengeToken: valid, code: h.recoveryCode }, SOURCES[2]!))
      .resolves.toMatchObject({ status: "authenticated" });
    expect(h.calls.recoveryReads).toBe(2);
    expect(lockout.admits).toHaveLength(charged);
    expect(lockout.clears).toEqual([]);
  });

  it("Case 4 (guard): a challenge with no TOTP factor answers AUTH_CREDENTIALS_INVALID and never meets the counter", async () => {
    const lockout = lockoutStub();
    const h = await harness(lockout, { withFactor: false });
    const sessions = await h.service();
    const challengeToken = await h.begin(sessions, SOURCES[0]!);
    await expect(sessions.completeLogin({ challengeToken, code: "123456" }, SOURCES[0]!))
      .rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
    expect(lockout.admits).toEqual([]);
    expect(lockout.clears).toEqual([]);
    expect(h.calls.dekLoads).toBe(0);
  });

  it("Case 5: a TOTP success clears both counters best-effort; a recovery-code success clears neither", async () => {
    // (a) the success clears the durable round with the challenge's user and factor.
    const lockout = lockoutStub();
    const h = await harness(lockout);
    const sessions = await h.service();
    const challengeToken = await h.begin(sessions, SOURCES[0]!);
    await expect(sessions.completeLogin({ challengeToken, code: h.correctCode }, SOURCES[0]!))
      .resolves.toMatchObject({ status: "authenticated" });
    expect(lockout.clears).toEqual([{ userId: h.userId, factorId: h.factorId }]);
    expect(h.clearFailures).toEqual([]);

    // (b) a failed clear never turns the committed login into an error; the reporter receives the cause.
    const sentinel = new Error("TOTP_LOCKOUT_CLEAR_REJECTED");
    const failing = lockoutStub({ clearError: sentinel });
    const hb = await harness(failing);
    const sessionsB = await hb.service();
    const tokenB = await hb.begin(sessionsB, SOURCES[0]!);
    await expect(sessionsB.completeLogin({ challengeToken: tokenB, code: hb.correctCode }, SOURCES[0]!))
      .resolves.toMatchObject({ status: "authenticated" });
    expect(failing.clears).toHaveLength(1);
    expect(hb.clearFailures).toEqual([sentinel]);

    // (c) the success also clears the in-process per-account key: with a durable stub that admits everything, four
    //     wrong codes, a success, then five more wrong codes on a new challenge all reach the DEK.
    const open = lockoutStub({ admitAll: true });
    const hc = await harness(open);
    const sessionsC = await hc.service();
    const tokenC = await hc.begin(sessionsC, SOURCES[0]!);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(sessionsC.completeLogin({ challengeToken: tokenC, code: hc.wrongCode }, SOURCES[0]!))
        .rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
    }
    await expect(sessionsC.completeLogin({ challengeToken: tokenC, code: hc.correctCode }, SOURCES[0]!))
      .resolves.toMatchObject({ status: "authenticated" });
    const tokenC2 = await hc.begin(sessionsC, SOURCES[1]!);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(sessionsC.completeLogin({ challengeToken: tokenC2, code: hc.wrongCode }, SOURCES[1]!))
        .rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
    }
    expect(hc.calls.dekLoads).toBe(10);

    // (d) review r3 M4: after five wrong codes, a recovery-code success on a FRESH challenge (a sixth call on the
    //     first challenge would meet the per-challenge key first) clears neither counter: the durable clear is not
    //     called, and with a durable stub that admits everything the next 6-digit code, even the right one, is still
    //     refused by the in-process per-account key.
    const admitting = lockoutStub({ admitAll: true });
    const hd = await harness(admitting);
    const sessionsD = await hd.service();
    const tokenD = await hd.begin(sessionsD, SOURCES[0]!);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(sessionsD.completeLogin({ challengeToken: tokenD, code: hd.wrongCode }, SOURCES[0]!))
        .rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
    }
    hd.calls.recoveryAccepted = true;
    const recoveryToken = await hd.begin(sessionsD, SOURCES[1]!);
    await expect(sessionsD.completeLogin({ challengeToken: recoveryToken, code: hd.recoveryCode }, SOURCES[1]!))
      .resolves.toMatchObject({ status: "authenticated" });
    expect(admitting.clears).toEqual([]);
    const totpToken = await hd.begin(sessionsD, SOURCES[2]!);
    await expect(sessionsD.completeLogin({ challengeToken: totpToken, code: hd.correctCode }, SOURCES[2]!))
      .rejects.toMatchObject({ code: "MFA_RATE_LIMITED" });
    expect(admitting.admits).toHaveLength(5);
    expect(hd.calls.dekLoads).toBe(5);
  });

  it("Case 6: the admit receives the MFA policy's five attempts, its 300 s lock and the 24 h cap, for the challenge's factor", async () => {
    const lockout = lockoutStub();
    const h = await harness(lockout);
    const sessions = await h.service();
    const challengeToken = await h.begin(sessions, SOURCES[0]!);
    await expect(sessions.completeLogin({ challengeToken, code: h.wrongCode }, SOURCES[0]!))
      .rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
    expect(lockout.admits).toEqual([{
      userId: h.userId, factorId: h.factorId, maxAttempts: 5, baseLockMs: 300_000, maxLockMs: 86_400_000
    }]);
  });

  it("Case 7: an account removed before the admit (23503) answers AUTH_CREDENTIALS_INVALID; any other admit error propagates", async () => {
    const gone = lockoutStub({ admitError: Object.assign(new Error("insert or update violates foreign key"), { code: "23503" }) });
    const h = await harness(gone);
    const sessions = await h.service();
    const challengeToken = await h.begin(sessions, SOURCES[0]!);
    await expect(sessions.completeLogin({ challengeToken, code: h.correctCode }, SOURCES[0]!))
      .rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
    expect(h.calls.dekLoads).toBe(0);
    expect(gone.clears).toEqual([]);

    const denied = Object.assign(new Error("permission denied for function totp_login_admit"), { code: "42501" });
    const broken = lockoutStub({ admitError: denied });
    const hb = await harness(broken);
    const sessionsB = await hb.service();
    const tokenB = await hb.begin(sessionsB, SOURCES[0]!);
    await expect(sessionsB.completeLogin({ challengeToken: tokenB, code: hb.correctCode }, SOURCES[0]!)).rejects.toBe(denied);
    expect(hb.calls.dekLoads).toBe(0);
  });
});
