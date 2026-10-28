// NV-39 (security audit run 3): the three recovery source windows charge an IPv6 caller to its /64. The repositories
// hash the admission scope next to the full address and send the scope's digest to the new `_admit_evicting`
// functions; the prepared source keeps its shape and its full-address digest (audit and risk evidence). The services
// pass the scope from rateLimitSourceScope.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from "@debateai/register";
import { PostgresPasswordResetRepository } from "../../packages/db/src/password-reset.js";
import { PostgresBackupEmailRepository, PostgresMfaRecoveryRepository } from "../../packages/db/src/email-mfa-recovery.js";
import { BackupEmailService, MfaRecoveryService } from "../../apps/api/src/email-mfa-recovery.js";
import { passwordResetOnVirtualClock } from "../support/recoveryStartStorage.js";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = (ip: string) => `argon2id-audit:v1:${sha(`ip:${ip}`)}`;
function harness() {
  const audit = { hashSourceIp: vi.fn(async (input: string) => sha(`ip:${input}`)), hashUserAgent: vi.fn(async (input: string) => sha(`ua:${input}`)) };
  const queries: Array<Readonly<{ text: string; args: readonly unknown[] }>> = [];
  const pool = { query: vi.fn(async (text: string, args: readonly unknown[]) => { queries.push({ text, args }); return { rows: [{ result: true }] }; }) };
  return { audit, queries, pool: pool as never, hasher: audit as never };
}
const SIX = { ip: "2001:db8:1:2::1", userAgent: "u", requestId: "r" }, SIBLING = { ...SIX, ip: "2001:db8:1:2::2" }, SCOPE = "2001:db8:1:2::/64";

describe("the password-reset repository keys its window by the admission scope (NV-39)", () => {
  it("keeps the prepared shape and admits through password_reset_admit_evicting with the /64 digest", async () => {
    const h = harness(), repo = new PostgresPasswordResetRepository(h.pool, h.hasher, 3);
    const prepared = await repo.prepareSource(SIX, SCOPE);
    expect(prepared).toEqual({ ipArgon2id: digest(SIX.ip), userAgentArgon2id: `argon2id-audit:v1:${sha("ua:u")}`, mailLocale: "en" });
    expect(await repo.admit(prepared)).toBe(true);
    const sent = h.queries.at(-1)!;
    expect(sent.text).toContain("identity.password_reset_admit_evicting(");
    expect(typeof sent.args[0]).toBe("string");
    expect(JSON.parse(sent.args[0] as string)).toEqual({ ipArgon2id: digest(SCOPE), userAgentArgon2id: prepared.userAgentArgon2id });
    expect(sent.args[1]).toBe(3);
  });
  it("gives a sibling address in the same /64 the same admission digest and its own evidence digest", async () => {
    const h = harness(), repo = new PostgresPasswordResetRepository(h.pool, h.hasher, 3);
    const first = await repo.prepareSource(SIX, SCOPE), second = await repo.prepareSource(SIBLING, SCOPE);
    await repo.admit(first);
    await repo.admit(second);
    const [a, b] = h.queries.slice(-2).map(q => JSON.parse(q.args[0] as string).ipArgon2id);
    expect(a).toBe(digest(SCOPE));
    expect(b).toBe(a);
    expect(second.ipArgon2id).not.toBe(first.ipArgon2id);
  });
  it("hashes an IPv4 source once when its scope is its own address, and admits it by that digest", async () => {
    const h = harness(), repo = new PostgresPasswordResetRepository(h.pool, h.hasher, 3);
    const prepared = await repo.prepareSource({ ...SIX, ip: "203.0.113.9" }, "203.0.113.9");
    expect(h.audit.hashSourceIp).toHaveBeenCalledTimes(1);
    await repo.admit(prepared);
    expect(JSON.parse(h.queries.at(-1)!.args[0] as string).ipArgon2id).toBe(digest("203.0.113.9"));
  });
});

describe("the MFA-recovery and backup-email repositories key their windows by the admission scope (NV-39)", () => {
  it("MFA recovery sends mfa_recovery_admit_evicting the /64 digest as an object", async () => {
    const h = harness(), repo = new PostgresMfaRecoveryRepository(h.pool, h.hasher, 3);
    const prepared = await repo.prepareSource(SIX, SCOPE);
    expect(prepared).toEqual({ ipArgon2id: digest(SIX.ip), userAgentArgon2id: `argon2id-audit:v1:${sha("ua:u")}` });
    expect(await repo.admit(prepared)).toBe(true);
    const sent = h.queries.at(-1)!;
    expect(sent.text).toContain("identity.mfa_recovery_admit_evicting(");
    expect(sent.args[0]).toEqual({ ipArgon2id: digest(SCOPE), userAgentArgon2id: prepared.userAgentArgon2id });
    expect(sent.args[1]).toBe(3);
  });
  it("backup email sends backup_email_admit_evicting the /64 digest as an object", async () => {
    const h = harness(), repo = new PostgresBackupEmailRepository(h.pool, h.hasher, 3);
    const prepared = await repo.prepareSource(SIX, SCOPE);
    expect(await repo.admit("session-id", "token-hash", prepared)).toBe(true);
    const sent = h.queries.at(-1)!;
    expect(sent.text).toContain("identity.backup_email_admit_evicting(");
    expect(sent.args.slice(0, 2)).toEqual(["session-id", "token-hash"]);
    expect(sent.args[2]).toEqual({ ipArgon2id: digest(SCOPE), userAgentArgon2id: prepared.userAgentArgon2id });
    expect(sent.args[3]).toBe(3);
  });
});

describe("the recovery services pass the caller's /64 as the admission scope (NV-39)", () => {
  const caller = { ip: "2001:db8:1:2:ffff::1", userAgent: "u", requestId: "r" };
  const SOURCE = { ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}` };
  const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
  it("password reset: start and exchange", async () => {
    const { service, storage } = passwordResetOnVirtualClock([]);
    const prepare = vi.spyOn(storage.passwordResetRepository, "prepareSource");
    await service.start({ email: "a@example.test" }, caller);
    expect(prepare).toHaveBeenLastCalledWith(caller, SCOPE);
    await expect(service.exchange({ token: "x" }, caller)).rejects.toThrow("PASSWORD_RESET_INVALID");
    expect(prepare).toHaveBeenLastCalledWith(caller, SCOPE);
  });
  it("MFA recovery: start and exchange", async () => {
    const repository = { prepareSource: vi.fn(async () => SOURCE), admit: vi.fn(async () => false) };
    const service = new MfaRecoveryService({ repository: repository as never, users: {} as never, argon2: {} as never, authPolicy, mfaPolicy: {} as never, policy: {} as never, blindIndexKey: Buffer.alloc(32, 1) });
    await service.start({ email: "a@example.test", destination: "primary" }, caller);
    expect(repository.prepareSource).toHaveBeenLastCalledWith(caller, SCOPE);
    await expect(service.exchange({ token: "x", password: "p" }, caller)).rejects.toThrow("MFA_RECOVERY_RATE_LIMITED");
    expect(repository.prepareSource).toHaveBeenLastCalledWith(caller, SCOPE);
  });
  it("backup email: start", async () => {
    const repository = { prepareSource: vi.fn(async () => SOURCE), admit: vi.fn(async () => false) };
    const service = new BackupEmailService({ repository } as never);
    await expect(service.start({ password: "p", code: "123456" }, "session-id", "token-hash", caller)).rejects.toThrow("BACKUP_EMAIL_RATE_LIMITED");
    expect(repository.prepareSource).toHaveBeenLastCalledWith(caller, SCOPE);
  });
});
