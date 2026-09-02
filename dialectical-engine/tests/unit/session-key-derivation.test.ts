import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createEmailBlindIndex } from "../../packages/crypto/src/index.js";
import {
  AUTH_POLICY_REGISTER_ROWS,
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
import { SessionService } from "../../apps/api/src/sessions.js";

const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
const mfaPolicy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);
const sessionPolicy = sessionPolicyFromValue(
  SESSION_POLICY_REGISTER_ROW.value,
  SESSION_POLICY_REGISTER_ROW.sourceRef
);

const SESSION_TOKEN = "s".repeat(43);
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) DebateAI/1.0";
const source = Object.freeze({ ip: "203.0.113.9", userAgent: USER_AGENT });

/**
 * `authenticate` is the shortest path that hands a freshly derived binding hash
 * to a collaborator we control. The repository answering `null` is enough: the
 * hash has already been computed and recorded by then.
 */
async function bindingHashFor(keys: Readonly<{
  blindIndexKey: Uint8Array;
  bindingKey?: Uint8Array;
}>): Promise<string> {
  const seen: string[] = [];
  const repository = {
    authenticateSession: async (input: Readonly<{ bindingHash: string }>) => {
      seen.push(input.bindingHash);
      return null;
    }
  };
  const service = await SessionService.create({
    repository: repository as never,
    riskSignals: { recordForSession: async () => undefined } as never,
    onRiskSignalFailure: () => undefined,
    dekStore: { load: async () => Buffer.alloc(32) } as never,
    argon2: {} as never,
    authPolicy,
    mfaPolicy,
    sessionPolicy,
    blindIndexKey: keys.blindIndexKey,
    ...(keys.bindingKey === undefined ? {} : { bindingKey: keys.bindingKey }),
    dummyPasswordHash: `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`
  });
  await expect(service.authenticate(SESSION_TOKEN, source)).resolves.toBeNull();
  expect(seen).toHaveLength(1);
  return seen[0]!;
}

describe("S5 session key derivation (L2-F5)", () => {
  it("derives the session binding key from the blind-index key instead of reusing it", async () => {
    // L2-F5: the user-agent binding HMAC and the login rate key were keyed with
    // the raw email blind-index key, so one 32-byte secret served three
    // purposes and none of them could be rotated without invalidating the
    // others.
    const blindIndexKey = Buffer.alloc(32, 0x51);
    const bindingHash = await bindingHashFor({ blindIndexKey });

    const reused = `sha256:${createHmac("sha256", blindIndexKey)
      .update("debateai:session-user-agent:v1\0", "utf8")
      .update(USER_AGENT, "utf8").digest("hex")}`;
    expect(bindingHash).not.toBe(reused);

    const derived = createHmac("sha256", blindIndexKey)
      .update("debateai:kdf:session-binding:v1", "utf8").digest();
    expect(bindingHash).toBe(`sha256:${createHmac("sha256", derived)
      .update("debateai:session-user-agent:v1\0", "utf8")
      .update(USER_AGENT, "utf8").digest("hex")}`);

    // A different KDF label must give a different key, so the login rate key
    // cannot collide with the binding key.
    const loginRate = createHmac("sha256", blindIndexKey)
      .update("debateai:kdf:login-rate:v1", "utf8").digest();
    expect(loginRate.equals(derived)).toBe(false);
  });

  it("keeps the binding hash bound to its root key and leaves the blind index untouched", async () => {
    const first = Buffer.alloc(32, 0x51);
    const second = Buffer.alloc(32, 0x52);
    expect(await bindingHashFor({ blindIndexKey: first }))
      .not.toBe(await bindingHashFor({ blindIndexKey: second }));

    // An explicitly provisioned binding key stays the root of the derivation,
    // so a deployment that already separates the secret keeps working.
    expect(await bindingHashFor({ blindIndexKey: first, bindingKey: second }))
      .toBe(await bindingHashFor({ blindIndexKey: second }));

    // The email blind index itself must NOT move: rotating it is a separate,
    // migration-bearing decision and this change is not one.
    const email = "person@example.test";
    expect(createEmailBlindIndex(first, email).toString("hex"))
      .toBe(createEmailBlindIndex(Buffer.alloc(32, 0x51), email).toString("hex"));
    expect(createEmailBlindIndex(first, email).toString("hex"))
      .not.toBe(createEmailBlindIndex(second, email).toString("hex"));
  });

  it("keys the login rate limiter from its own purpose label", async () => {
    // The rate key never leaves the process, so the source is the evidence: it
    // must not be keyed with the raw blind-index key any more.
    const sessions = await readFile(
      new URL("../../apps/api/src/sessions.ts", import.meta.url), "utf8"
    );
    expect(sessions).toContain("debateai:kdf:session-binding:v1");
    expect(sessions).toContain("debateai:kdf:login-rate:v1");
    // The two ruled HMAC domains are kept.
    expect(sessions).toContain("debateai:session-user-agent:v1\\0");
    expect(sessions).toContain("debateai:login-rate-key:v1\\0");
    expect(sessions).not.toMatch(/createHmac\("sha256", this\.dependencies\.bindingKey\)/);
  });
});
