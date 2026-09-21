import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
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

/** Minted at exactly the sealed password cost, as `SessionService.create` mints it. */
const DUMMY_PASSWORD_HASH = encodingAt(65_536, 3, 1);

const SOURCE = Object.freeze({
  ip: "203.0.113.22",
  userAgent: "vitest-v22",
  requestId: "v22-envelope-policy"
});

/**
 * Every stored-hash verification, wherever it stands and however it is wrapped:
 * the call name alone, with no receiver and no line-shape assumption.
 */
const VERIFY_CALL = /\bverify(?:Password|RecoveryCode)\s*\(/gu;
const API_SOURCE_ROOT = "apps/api/src";

/** Every `.ts` file under a directory, depth-first, in a stable order. */
async function sourceFilesUnder(directory: string): Promise<readonly string[]> {
  const entries = [...await readdir(directory, { withFileTypes: true })]
    .sort((left, right) => left.name.localeCompare(right.name));
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFilesUnder(path));
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
}

/**
 * Locates every verification call in the API tree and, for each, the text of
 * its own statement plus the statement immediately before it — the only window
 * in which its guard may stand.
 */
async function verificationCallSites(): Promise<readonly Readonly<{
  path: string;
  line: number;
  statementAndPredecessor: string;
}>[]> {
  const sites: { path: string; line: number; statementAndPredecessor: string }[] = [];
  for (const path of await sourceFilesUnder(API_SOURCE_ROOT)) {
    const source = await readFile(path, "utf8");
    for (const call of source.matchAll(VERIFY_CALL)) {
      const before = source.slice(0, call.index);
      // Statements end at `;`. Taking the last two segments is exactly "this
      // statement, or the one immediately before it"; a stray semicolon can
      // only narrow the window, never widen it into a neighbour's guard.
      const statements = before.split(";");
      sites.push({
        path,
        line: before.split("\n").length,
        statementAndPredecessor: statements.slice(-2).join(";") + source.slice(call.index, call.index + 200)
      });
    }
  }
  return sites;
}

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
    // Answers `true` for the dummy too: the refusal must not depend on the
    // substituted verification failing.
    const verifySpy = vi.fn(async (_password: Uint8Array, _encodedHash: string) => true);
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
      dummyPasswordHash: DUMMY_PASSWORD_HASH,
      clock: () => new Date(0)
    });
    const refusals = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(service.beginLogin(
        { email: "planted@example.test", password: "correct horse battery staple" }, SOURCE
      )).rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
      // The attempt keeps its one-Argon shape — the process dummy is verified
      // in the planted record's place — and the hostile envelope is never
      // handed to Argon2, so no attacker-chosen arena is ever allocated.
      expect(verifySpy).toHaveBeenCalledTimes(1);
      expect(verifySpy.mock.calls[0]![1]).toBe(DUMMY_PASSWORD_HASH);
      expect(verifySpy.mock.calls.flatMap((call) => call)).not.toContain(planted);
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

  it("cannot be fooled by a call whose receiver a formatter moved onto the next line", () => {
    // Exactly what a formatter produces when the argument list grows, and what
    // the first version of this scan silently skipped, because it demanded the
    // receiver on the same line as the call.
    const wrapped = [
      "const verified = await verifyPassword(",
      "  this.dependencies.argon2, passwordHash, input.password",
      ");"
    ].join("\n");
    expect(wrapped.match(/await verify(?:Password|RecoveryCode)\(this\.dependencies\.argon2/gu)).toBeNull();
    expect(wrapped.match(VERIFY_CALL)).toHaveLength(1);
    // ...and the shape it was written to find still matches.
    expect("&& await verifyRecoveryCode(this.dependencies.argon2, record.codeHash, code);"
      .match(VERIFY_CALL)).toHaveLength(1);
  });

  it("guards every stored-hash verification in the whole API tree, and knows how many there are", async () => {
    const sites = await verificationCallSites();
    // An EXACT count, so a sixth call site fails loudly here instead of being
    // quietly skipped by a pattern that no longer matches it.
    expect(sites.map((site) => `${site.path}:${site.line}`)).toEqual([
      "apps/api/src/mfa.ts:375",
      "apps/api/src/mfa.ts:418",
      "apps/api/src/sessions.ts:325",
      "apps/api/src/sessions.ts:450",
      "apps/api/src/sessions.ts:578"
    ]);
    for (const site of sites) {
      // Structural, not "somewhere in the preceding 400 characters": the guard
      // must stand in this call's own statement or in the one just before it,
      // so a neighbouring verification's guard cannot vouch for this one.
      expect(site.statementAndPredecessor, `${site.path}:${site.line}`)
        .toContain("storedArgon2EnvelopeNotOverPolicy(");
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
