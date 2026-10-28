// NV-15 (security audit run 3): failed email-link password proofs feed the sealed MFA-recovery adverse rule. The service
// reads the account's risk before it checks a password, records a wrong one through identity.mfa_recovery_record_failure
// (migrations/0125_security_fixes_run3.sql) with an encrypted account-risk context, and answers a refusal the same way
// for a right and a wrong password.
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { decrypt, encrypt, hashToken, type CryptoEnvelope } from "@debateai/crypto";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from "@debateai/register";
import { MfaRecoveryService } from "../../apps/api/src/email-mfa-recovery.js";
import { authenticationRiskSignalAad } from "../../packages/db/src/auth-risk.js";
import { PostgresMfaRecoveryRepository } from "../../packages/db/src/email-mfa-recovery.js";

const USER = "11111111-1111-4111-8111-111111111111", PROOF = "22222222-2222-4222-8222-222222222222", OTHER = "33333333-3333-4333-8333-333333333333";
const LINK = "L".repeat(43), FINISH = "F".repeat(43), KEY = Buffer.alloc(32, 7);
const SOURCE = { ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}` };
const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), cost = authPolicy.password.argon2id;
const PASSWORD_HASH = `$argon2id$v=19$m=${cost.memoryCostKiB},t=${cost.timeCost},p=${cost.parallelism}$${Buffer.alloc(16, 1).toString("base64").replace(/=/g, "")}$${Buffer.alloc(32, 1).toString("base64").replace(/=/g, "")}`;
const EVALUATED_AT = "2026-10-09T12:00:00.000Z", NOT_BEFORE = "2026-10-10T12:00:00.000Z", EXPIRES = "2026-10-17T12:00:00.000Z";
const linkHash = hashToken("mfa-recovery-link", LINK), finishHash = hashToken("mfa-recovery-finish", FINISH);
const request = { ip: "192.0.2.10", userAgent: "synthetic", requestId: "proof-failure" };

function adverseSignal() {
  const observedAt = new Date(Date.parse(EVALUATED_AT) - 1000);
  return { riskSignalId: randomUUID(), kind: "RECOVERY_PROOF_FAILED",
    ciphertext: encrypt(KEY, Buffer.from(JSON.stringify({ v: 1, networkRef: SOURCE.ipArgon2id, clientRef: SOURCE.userAgentArgon2id })), authenticationRiskSignalAad(USER)),
    observedAt: observedAt.toISOString(), expiresAt: new Date(observedAt.getTime() + 7776000000).toISOString() };
}
const clean = (fingerprint = "f1") => ({ userId: USER, evaluatedAt: EVALUATED_AT, fingerprint, signals: [] });
const adverse = (fingerprint = "f1") => ({ userId: USER, evaluatedAt: EVALUATED_AT, fingerprint, signals: [adverseSignal()] });

function repository(overrides: Record<string, unknown> = {}) {
  return {
    prepareSource: vi.fn(async () => SOURCE),
    admit: vi.fn(async () => true),
    prepareExchange: vi.fn(async () => ({ userId: USER, passwordHash: PASSWORD_HASH, channels: [PROOF, OTHER], bindingChannelIds: [PROOF] })),
    prepareFinish: vi.fn(async () => ({ userId: USER, passwordHash: PASSWORD_HASH, notBefore: NOT_BEFORE, expiresAt: EXPIRES, ready: true })),
    read: vi.fn(async () => ({ stage: "FACTOR_REQUIRED", expiresAt: "2026-10-09T12:05:00.000Z", csrfHash: "sha256:" + "c".repeat(64) })),
    risk: vi.fn(async () => clean()),
    linkWaiting: vi.fn(async () => false),
    exchange: vi.fn(async () => "FACTOR_REQUIRED"),
    finish: vi.fn(async () => "COMPLETED"),
    recordFailure: vi.fn(async () => "PROOF_INVALID"),
    failure: vi.fn(async () => undefined),
    ...overrides
  };
}
function service(repo = repository()) {
  const argon2 = { verifyPassword: vi.fn(async (password: Uint8Array) => Buffer.from(password).toString("utf8") === "current password") };
  const users = { load: vi.fn(async () => Buffer.from(KEY)) };
  return { repo, argon2, users, service: new MfaRecoveryService({ repository: repo as never, users: users as never, argon2: argon2 as never, authPolicy, mfaPolicy: {} as never, policy: {} as never, blindIndexKey: Buffer.alloc(32, 1) }) };
}

describe("the email link refuses an adverse account and counts a wrong password against it", () => {
  it("refuses an adverse account at the email link before checking the password, the same for a right and a wrong password", async () => {
    for (const password of ["current password", "wrong password"]) {
      const { repo, argon2, service: s } = service(repository({ risk: vi.fn(async () => adverse()) }));
      await expect(s.exchange({ token: LINK, password }, request)).rejects.toThrow("MFA_RECOVERY_INVALID");
      expect(repo.risk).toHaveBeenCalledWith(linkHash, "link");
      expect(argon2.verifyPassword).not.toHaveBeenCalled();
      expect(repo.recordFailure).not.toHaveBeenCalled(); expect(repo.linkWaiting).not.toHaveBeenCalled(); expect(repo.exchange).not.toHaveBeenCalled();
    }
  });
  it("records a wrong email-link password once, with an encrypted account-risk context", async () => {
    const { repo, service: s } = service();
    await expect(s.exchange({ token: LINK, password: "wrong password" }, request)).rejects.toThrow("MFA_RECOVERY_PROOF_INVALID");
    expect(repo.recordFailure).toHaveBeenCalledTimes(1);
    const [selector, kind, source, envelope] = repo.recordFailure.mock.calls[0]! as unknown as [string, string, unknown, CryptoEnvelope];
    expect([selector, kind, source]).toEqual([linkHash, "link", SOURCE]);
    expect(JSON.parse(decrypt(KEY, envelope, authenticationRiskSignalAad(USER)).toString("utf8"))).toEqual({ v: 1, networkRef: SOURCE.ipArgon2id, clientRef: SOURCE.userAgentArgon2id });
    expect(repo.failure).not.toHaveBeenCalled(); expect(repo.exchange).not.toHaveBeenCalled();
  });
  it.each(["REFUSED", "INVALID"])("answers a wrong password like a refusal once the attempt or the account limit is used up (%s)", async (outcome) => {
    const { repo, service: s } = service(repository({ recordFailure: vi.fn(async () => outcome) }));
    await expect(s.exchange({ token: LINK, password: "wrong password" }, request)).rejects.toThrow("MFA_RECOVERY_INVALID");
    expect(repo.recordFailure).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["(a) turned adverse", [clean("f1"), adverse("f1")], "MFA_RECOVERY_INVALID"],
    ["(b) changed fingerprint", [clean("f1"), clean("f2")], "MFA_RECOVERY_INVALID"],
    ["(c) unchanged and clean", [clean("f1"), clean("f1")], "MFA_RECOVERY_ALREADY_WAITING"]
  ] as const)("does not report a waiting replacement once the account turned adverse during the password check: %s", async (_name, reads, expected) => {
    const risk = vi.fn<() => Promise<unknown>>().mockResolvedValueOnce(reads[0]).mockResolvedValueOnce(reads[1]);
    const { repo, service: s } = service(repository({ risk, linkWaiting: vi.fn(async () => true) }));
    await expect(s.exchange({ token: LINK, password: "current password" }, request)).rejects.toThrow(expected);
    expect(repo.risk.mock.calls).toEqual([[linkHash, "link"], [linkHash, "link"]]);
    expect(repo.exchange).not.toHaveBeenCalled(); expect(repo.recordFailure).not.toHaveBeenCalled();
  });
});

describe("the finish link refuses an adverse account and keeps its own five tries", () => {
  it("refuses an adverse account without checking the password", async () => {
    const { repo, argon2, service: s } = service(repository({ risk: vi.fn(async () => adverse()) }));
    await expect(s.finish({ token: FINISH, password: "current password" }, request)).rejects.toThrow("MFA_RECOVERY_INVALID");
    expect(repo.risk).toHaveBeenCalledWith(finishHash, "finish");
    expect(argon2.verifyPassword).not.toHaveBeenCalled(); expect(repo.finish).not.toHaveBeenCalled(); expect(repo.recordFailure).not.toHaveBeenCalled();
  });
  it("records a wrong finish password without a risk context", async () => {
    const { repo, service: s } = service();
    await expect(s.finish({ token: FINISH, password: "wrong password" }, request)).rejects.toThrow("MFA_RECOVERY_PROOF_INVALID");
    expect(repo.recordFailure).toHaveBeenCalledWith(finishHash, "finish", SOURCE, null);
    expect(repo.failure).not.toHaveBeenCalled(); expect(repo.finish).not.toHaveBeenCalled();
  });
  it("answers a wrong finish password like a refusal once the recorder refuses", async () => {
    const { service: s } = service(repository({ recordFailure: vi.fn(async () => "REFUSED") }));
    await expect(s.finish({ token: FINISH, password: "wrong password" }, request)).rejects.toThrow("MFA_RECOVERY_INVALID");
  });
});

describe("the failure recorder's database call", () => {
  it("names the recorder with the four arguments", async () => {
    const calls: { sql: string; args: unknown[] }[] = [];
    const pool = { query: vi.fn(async (sql: string, args: unknown[]) => { calls.push({ sql, args }); return { rows: [{ result: "PROOF_INVALID" }] }; }) };
    const repo = new PostgresMfaRecoveryRepository(pool as never, {} as never, 1);
    // SOURCE did not come from prepareSource, so it carries no mail language and the call goes to the pool directly.
    await expect(repo.recordFailure("link-hash", "link", SOURCE, { v: 1 } as never)).resolves.toBe("PROOF_INVALID");
    expect(calls).toEqual([{ sql: "SELECT identity.mfa_recovery_record_failure($1,$2,$3,$4) AS result", args: ["link-hash", "link", SOURCE, { v: 1 }] }]);
  });
});
