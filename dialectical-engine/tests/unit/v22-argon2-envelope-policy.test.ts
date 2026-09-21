import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { ARGON2_POLICY_ENVELOPE } from "../../packages/crypto/src/argon2-worker-pool.js";
import {
  Argon2WorkerPool,
  argon2EnvelopeRefusal,
  generateRecoveryCode,
  hashPassword,
  hashRecoveryCode,
  verifyPassword,
  verifyRecoveryCode,
  type Argon2Executor
} from "../../packages/crypto/src/index.js";
import {
  AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS,
  authPolicyFromRegisterRows
} from "../../packages/register/src/auth-policy.js";
import {
  MFA_POLICY_REGISTER_ROW,
  mfaPolicyFromValue
} from "../../packages/register/src/mfa-policy.js";
import {
  SESSION_POLICY_REGISTER_ROW,
  sessionPolicyFromValue
} from "../../packages/register/src/session-policy.js";
import { MfaEnrollmentService } from "../../apps/api/src/mfa.js";
import { SessionService } from "../../apps/api/src/sessions.js";

const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS);
const mfaPolicy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);

/** The three sealed Argon2id costs this deployment runs, each with its own ceiling. */
const SEALED_COSTS = Object.freeze({
  password: authPolicy.password.argon2id,
  recoveryCodes: mfaPolicy.recoveryCodes.argon2id,
  auditSourceIp: Object.freeze({
    memoryCostKiB: authPolicy.auditSourceIpKdf.memoryCostKiB,
    timeCost: authPolicy.auditSourceIpKdf.iterations,
    parallelism: authPolicy.auditSourceIpKdf.parallelism
  })
});

/** A syntactically valid encoding at arbitrary costs — no compute, as a planted row would be. */
function encodingAt(memoryCostKiB: number, timeCost: number, parallelism: number): string {
  return `$argon2id$v=19$m=${memoryCostKiB},t=${timeCost},p=${parallelism}`
    + `$${Buffer.alloc(16, 0x11).toString("base64").replace(/=+$/, "")}`
    + `$${Buffer.alloc(32, 0x22).toString("base64").replace(/=+$/, "")}`;
}

const SOURCE = Object.freeze({
  ip: "203.0.113.22",
  userAgent: "vitest-v22",
  requestId: "v22-envelope-policy"
});

describe("V-22 a stored Argon2id envelope may not exceed twice its own policy", () => {
  it("derives every ceiling from the policy that governs that use", () => {
    expect(ARGON2_POLICY_ENVELOPE.multiplier).toBe(2);
    // The sealed costs the ceilings are derived from, measured on 2026-09-22.
    expect(SEALED_COSTS.password).toMatchObject({ memoryCostKiB: 65_536, timeCost: 3, parallelism: 1 });
    expect(SEALED_COSTS.recoveryCodes).toMatchObject({ memoryCostKiB: 19_456, timeCost: 2, parallelism: 1 });
    expect(SEALED_COSTS.auditSourceIp).toEqual({ memoryCostKiB: 19_456, timeCost: 2, parallelism: 1 });

    // Exactly twice the password cost is admitted for the password use...
    const twicePassword = encodingAt(131_072, 6, 2);
    expect(argon2EnvelopeRefusal(twicePassword, SEALED_COSTS.password)).toBeUndefined();
    // ...and refused for the two cheaper policies. One global number could not
    // do both, which is the whole point of the per-use derivation.
    expect(argon2EnvelopeRefusal(twicePassword, SEALED_COSTS.recoveryCodes))
      .toBe("ARGON2_ENVELOPE_EXCEEDS_POLICY");
    expect(argon2EnvelopeRefusal(twicePassword, SEALED_COSTS.auditSourceIp))
      .toBe("ARGON2_ENVELOPE_EXCEEDS_POLICY");
  });

  it("refuses one step past twice the policy on memory, time or parallelism alone", () => {
    const cost = SEALED_COSTS.password;
    expect(argon2EnvelopeRefusal(encodingAt(131_073, 3, 1), cost)).toBe("ARGON2_ENVELOPE_EXCEEDS_POLICY");
    expect(argon2EnvelopeRefusal(encodingAt(65_536, 7, 1), cost)).toBe("ARGON2_ENVELOPE_EXCEEDS_POLICY");
    expect(argon2EnvelopeRefusal(encodingAt(65_536, 3, 3), cost)).toBe("ARGON2_ENVELOPE_EXCEEDS_POLICY");
    // The 4x record the old envelope accepted: 262 144 KiB / t=10 / p=4.
    expect(argon2EnvelopeRefusal(encodingAt(262_144, 10, 4), cost)).toBe("ARGON2_ENVELOPE_EXCEEDS_POLICY");
    // A cost BELOW the policy stays acceptable: lowering the ruled cost must not
    // strand records minted under the older, higher one.
    expect(argon2EnvelopeRefusal(encodingAt(19_456, 2, 1), cost)).toBeUndefined();
  });

  it("leaves malformed and out-of-envelope encodings to the existing parse refusal", () => {
    const cost = SEALED_COSTS.password;
    // Not this check's question: these are already refused by the global
    // envelope before any compute, and must not be relabelled.
    expect(argon2EnvelopeRefusal("not-a-hash", cost)).toBeUndefined();
    expect(argon2EnvelopeRefusal("$argon2id$corrupt", cost)).toBeUndefined();
    expect(argon2EnvelopeRefusal(encodingAt(1_048_576, 3, 1), cost)).toBeUndefined();
  });

  it("refuses a policy cost it cannot trust, rather than deriving a ceiling from it", () => {
    const encoded = encodingAt(65_536, 3, 1);
    expect(argon2EnvelopeRefusal(encoded, { memoryCostKiB: 0, timeCost: 3, parallelism: 1 }))
      .toBe("ARGON2_ENVELOPE_EXCEEDS_POLICY");
    expect(argon2EnvelopeRefusal(encoded, { memoryCostKiB: 65_536, timeCost: Number.NaN, parallelism: 1 }))
      .toBe("ARGON2_ENVELOPE_EXCEEDS_POLICY");
  });

  it("still verifies every hash minted at each sealed cost, so no real user is locked out", async () => {
    const argon2 = new Argon2WorkerPool();
    try {
      await argon2.ready();
      const password = "correct horse battery staple";
      const passwordHash = await hashPassword(argon2, password, SEALED_COSTS.password);
      expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
      expect(argon2EnvelopeRefusal(passwordHash, SEALED_COSTS.password)).toBeUndefined();
      await expect(verifyPassword(argon2, passwordHash, password)).resolves.toBe(true);

      const recoveryCode = generateRecoveryCode(1);
      const recoveryHash = await hashRecoveryCode(argon2, recoveryCode, SEALED_COSTS.recoveryCodes);
      expect(recoveryHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(argon2EnvelopeRefusal(recoveryHash, SEALED_COSTS.recoveryCodes)).toBeUndefined();
      await expect(verifyRecoveryCode(argon2, recoveryHash, recoveryCode)).resolves.toBe(true);
    } finally {
      await argon2.close();
    }
  }, 60_000);

  it("refuses a planted 4x recovery-code record before any Argon2 work happens", async () => {
    const userId = randomUUID();
    const planted = encodingAt(262_144, 10, 4);
    const verifySpy = vi.fn(async () => true);
    const argon2 = {
      hashPassword: async () => encodingAt(19_456, 2, 1),
      verifyPassword: verifySpy,
      hashAuditContext: async () => "ab".repeat(32)
    } as unknown as Argon2Executor;
    const consumeAndReplaceRecoveryCode = vi.fn(async () => true);
    const service = new MfaEnrollmentService({
      repository: {
        async readRecoveryCodeForUse(_userId: string, slot: number) {
          return { userId, recoveryCodeId: randomUUID(), codeHash: planted, codeSlot: slot };
        },
        consumeAndReplaceRecoveryCode
      } as never,
      dekStore: {
        async store() { throw new Error("unused"); },
        async destroy() { return "ALREADY_ABSENT"; },
        async exists() { return true; },
        async load() { throw new Error("unused"); }
      } as never,
      argon2,
      policy: mfaPolicy,
      clock: () => new Date(0)
    });
    const refusals = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(service.consumeRecoveryCode({
        userId, recoveryCode: generateRecoveryCode(1)
      }, SOURCE)).resolves.toEqual({ consumed: false });
      // No worker occupied, no arena allocated, nothing replaced.
      expect(verifySpy).not.toHaveBeenCalled();
      expect(consumeAndReplaceRecoveryCode).not.toHaveBeenCalled();
      // ...and the operator gets the typed code rather than silence.
      expect(refusals.mock.calls.flat()).toEqual(
        expect.arrayContaining([expect.stringContaining("ARGON2_ENVELOPE_EXCEEDS_POLICY")])
      );
    } finally {
      refusals.mockRestore();
    }
  });

  it("refuses a planted 4x password record at login, with the audit row unchanged", async () => {
    const planted = encodingAt(262_144, 10, 4);
    const verifySpy = vi.fn(async () => true);
    const failures: string[] = [];
    let challenges = 0;
    const service = await SessionService.create({
      repository: {
        async findLoginIdentity() {
          return Object.freeze({
            userId: randomUUID(),
            ownerRef: randomUUID(),
            auditToken: randomUUID(),
            passwordHash: planted,
            factorId: randomUUID(),
            secretCiphertext: { v: 1, keyId: "unused", nonce: "", ct: "", tag: "" },
            lastAcceptedStep: null
          });
        },
        async recordLoginFailure(input: Record<string, unknown>) {
          failures.push(String(input.reason));
          return undefined;
        },
        async createLoginChallenge() {
          challenges += 1;
          return true;
        }
      } as never,
      riskSignals: { recordForSession: async () => undefined } as never,
      onRiskSignalFailure: () => undefined,
      dekStore: {
        store: async () => undefined,
        destroy: async () => "ALREADY_ABSENT",
        exists: async () => true,
        load: async () => { throw new Error("unused"); }
      },
      argon2: {
        hashPassword: async () => planted,
        verifyPassword: verifySpy,
        hashAuditContext: async () => "ab".repeat(32)
      } as unknown as Argon2Executor,
      authPolicy,
      mfaPolicy,
      sessionPolicy: sessionPolicyFromValue(
        SESSION_POLICY_REGISTER_ROW.value, SESSION_POLICY_REGISTER_ROW.sourceRef
      ),
      blindIndexKey: Buffer.alloc(32, 0x61),
      bindingKey: Buffer.alloc(32, 0x62),
      dummyPasswordHash: encodingAt(65_536, 3, 1),
      clock: () => new Date(0)
    });
    const refusals = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(service.beginLogin(
        { email: "planted@example.test", password: "correct horse battery staple" }, SOURCE
      )).rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
      expect(verifySpy).not.toHaveBeenCalled();
      expect(challenges).toBe(0);
      // The visitor sees exactly the wrong-password answer, and the same audit
      // row is written, so the refusal is no oracle.
      expect(failures).toEqual(["AUTH_CREDENTIALS_INVALID"]);
      expect(refusals.mock.calls.flat()).toEqual(
        expect.arrayContaining([expect.stringContaining("ARGON2_ENVELOPE_EXCEEDS_POLICY")])
      );
    } finally {
      refusals.mockRestore();
    }
  });

  it("guards every stored-hash verification in the API, not only the tested ones", async () => {
    for (const path of ["apps/api/src/sessions.ts", "apps/api/src/mfa.ts"]) {
      const source = await readFile(path, "utf8");
      const calls = [...source.matchAll(/await verify(?:Password|RecoveryCode)\(this\.dependencies\.argon2/gu)];
      expect(calls.length, path).toBeGreaterThan(0);
      for (const call of calls) {
        const preceding = source.slice(Math.max(0, call.index - 400), call.index);
        expect(preceding, `${path}@${call.index}`).toContain("storedArgon2EnvelopeWithinPolicy(");
      }
    }
  });

  it("keeps verifying a lawful recovery-code record through the same path", async () => {
    const userId = randomUUID();
    const lawful = encodingAt(19_456, 2, 1);
    const verifySpy = vi.fn(async () => true);
    const service = new MfaEnrollmentService({
      repository: {
        async readRecoveryCodeForUse(_userId: string, slot: number) {
          return { userId, recoveryCodeId: randomUUID(), codeHash: lawful, codeSlot: slot };
        },
        async consumeAndReplaceRecoveryCode() { return true; }
      } as never,
      dekStore: {
        async store() { throw new Error("unused"); },
        async destroy() { return "ALREADY_ABSENT"; },
        async exists() { return true; },
        async load() { throw new Error("unused"); }
      } as never,
      argon2: {
        hashPassword: async () => lawful,
        verifyPassword: verifySpy,
        hashAuditContext: async () => "ab".repeat(32)
      } as unknown as Argon2Executor,
      policy: mfaPolicy,
      clock: () => new Date(0)
    });
    await expect(service.consumeRecoveryCode({
      userId, recoveryCode: generateRecoveryCode(1)
    }, SOURCE)).resolves.toMatchObject({ consumed: true });
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});
