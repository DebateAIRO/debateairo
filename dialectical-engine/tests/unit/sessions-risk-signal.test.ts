import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  encrypt,
  generateDek,
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
 * F-SESSIONS-BARE-CATCH's standing pin. `sessions.ts` catches a failed risk-signal
 * record and hands it to `onRiskSignalFailure`. The real-database S5 test cannot check
 * that: on a healthy tip the catch is never entered, so a mutant that discards the cause
 * again survives the whole integration file. These cases drive the failure path
 * deliberately and assert on WHAT THE OBSERVER RECEIVED.
 *
 * The TOTP branch of completeLogin uses AES-GCM and HMAC only — no Argon2 — so the
 * service runs here against small stubs instead of the 81-line worker-pool fixture.
 */

type SessionDependencies = Parameters<typeof SessionService.create>[0];

const source = Object.freeze({
  ip: "203.0.113.7",
  userAgent: "sessions-risk-signal-test",
  requestId: "request:sessions-risk-signal"
});

/** Syntactically valid argon2id encoding: `verifyPassword` parses it before delegating. */
const PARSEABLE_PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$`
  + `${Buffer.alloc(16, 0x11).toString("base64").replace(/=+$/, "")}$`
  + `${Buffer.alloc(32, 0x22).toString("base64").replace(/=+$/, "")}`;

/**
 * Drives a real login to the point where the risk signal is recorded, with the recorder
 * behaving as `recorder` says, and returns what the observer received.
 */
async function loginWithRecorder(recorder: SessionDependencies["riskSignals"]["recordForSession"]): Promise<{
  readonly received: readonly unknown[];
  readonly result: Awaited<ReturnType<SessionService["completeLogin"]>>;
  readonly ownerRef: string;
}> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const factorId = randomUUID();
  const dek = generateDek();
  const secret = generateTotpSecret();
  const now = new Date();
  const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
  const mfaPolicy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);

  const identity = Object.freeze({
    userId,
    ownerRef,
    auditToken: randomUUID(),
    passwordHash: PARSEABLE_PASSWORD_HASH,
    factorId,
    secretCiphertext: encrypt(dek, secret, [
      "identity", "mfa_factor.secret_ciphertext", factorId,
      "run:none", userId, `user-dek:${userId}`, "1"
    ]),
    lastAcceptedStep: null
  });

  // beginLogin computes the binding hash itself; capturing it here keeps the test from
  // duplicating that derivation, so a change to it cannot silently pass this file.
  let challenge: Record<string, unknown> | undefined;
  const repository = {
    async findLoginIdentity() { return identity; },
    async createLoginChallenge(input: Record<string, unknown>) {
      challenge = {
        ...identity,
        challengeId: input.challengeId,
        challengeTokenHash: input.challengeTokenHash,
        bindingHash: input.bindingHash,
        expiresAt: input.expiresAt,
        consumedAt: null
      };
      return true;
    },
    async readLoginChallenge() { return challenge ?? null; },
    async completeTotpLogin() { return true; },
    async recordLoginFailure(input: Record<string, unknown>) {
      throw new Error(`UNEXPECTED_LOGIN_FAILURE:${String(input.reason)}`);
    }
  } as unknown as SessionDependencies["repository"];

  const dekStore: ReadableUserDekStore = {
    store: async () => undefined,
    destroy: async () => "ALREADY_ABSENT",
    exists: async () => true,
    // A fresh copy per call: totpStep zeroes the buffer it is handed.
    load: async (requested) => {
      if (requested !== userId) throw new Error("UNEXPECTED_USER_DEK_LOOKUP");
      return Buffer.from(dek);
    }
  };

  const received: unknown[] = [];
  const service = await SessionService.create({
    repository,
    riskSignals: { recordForSession: recorder } as SessionDependencies["riskSignals"],
    // Deliberately NON-THROWING, so the login's own result stays observable.
    onRiskSignalFailure: (error: unknown) => { received.push(error); },
    dekStore,
    argon2: {
      hashPassword: async () => PARSEABLE_PASSWORD_HASH,
      verifyPassword: async () => true,
      hashAuditContext: async () => "argon2id-audit:v1:" + "0".repeat(64)
    } as unknown as Argon2Executor,
    authPolicy,
    mfaPolicy,
    sessionPolicy: sessionPolicyFromValue(
      SESSION_POLICY_REGISTER_ROW.value,
      SESSION_POLICY_REGISTER_ROW.sourceRef
    ),
    blindIndexKey: Buffer.alloc(32, 0x61),
    bindingKey: Buffer.alloc(32, 0x62),
    dummyPasswordHash: PARSEABLE_PASSWORD_HASH,
    clock: () => now
  });

  const begun = await service.beginLogin(
    { email: "risk-signal@example.test", password: "correct horse battery staple" },
    source
  );
  const step = Math.floor(now.getTime() / (mfaPolicy.totp.periodSeconds * 1_000));
  const result = await service.completeLogin(
    { challengeToken: begun.challengeToken, code: totpCodeAtStep(secret, step) },
    source
  );
  secret.fill(0);
  dek.fill(0);
  return { received, result, ownerRef };
}

describe("F-SESSIONS-BARE-CATCH the login risk-signal cause reaches the observer", () => {
  it("hands the observer a TypeError naming LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED when the scope does not resolve", async () => {
    const { received, result, ownerRef } = await loginWithRecorder(async () => "scope_unresolved");

    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(TypeError);
    expect((received[0] as Error).message).toBe("LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED");

    // A pending signal must not change what the login returns.
    expect(result.status).toBe("authenticated");
    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.session).toMatchObject({
      asker_id: `owner:${ownerRef}`,
      ownership_provenance: "server_session",
      provisional_identity_model: false
    });
  });

  it("hands the observer the recorder's own rejection, unwrapped and unreplaced", async () => {
    const sentinel = new Error("RECORDER_REJECTED");
    const { received, result } = await loginWithRecorder(async () => { throw sentinel; });

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(sentinel);
    expect(result.status).toBe("authenticated");
  });
});
