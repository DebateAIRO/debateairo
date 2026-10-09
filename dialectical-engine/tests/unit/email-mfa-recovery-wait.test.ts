// Owner ruling 2026-10-09: the email-link + current-password authenticator recovery no longer finishes at once.
// "complete" starts a 24-hour wait; the person finishes later from an emailed link with the current password.
import { describe, expect, it, vi } from "vitest";
import { decrypt, encrypt, hashToken, type CryptoEnvelope } from "@debateai/crypto";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from "@debateai/register";
import { MfaRecoveryService, emailRecoveryNoticeAad } from "../../apps/api/src/email-mfa-recovery.js";
import { PostgresMfaRecoveryRepository } from "../../packages/db/src/email-mfa-recovery.js";

const USER = "11111111-1111-4111-8111-111111111111", PROOF = "22222222-2222-4222-8222-222222222222", OTHER = "33333333-3333-4333-8333-333333333333";
const SESSION = "S".repeat(43), FINISH = "F".repeat(43), KEY = Buffer.alloc(32, 7);
const SOURCE = { ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}` };
const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), cost = authPolicy.password.argon2id;
const PASSWORD_HASH = `$argon2id$v=19$m=${cost.memoryCostKiB},t=${cost.timeCost},p=${cost.parallelism}$${Buffer.alloc(16, 1).toString("base64").replace(/=/g, "")}$${Buffer.alloc(32, 1).toString("base64").replace(/=/g, "")}`;
const addressAad = (type: "email" | "recovery_email") => ["identity", type === "email" ? "user.email_ciphertext" : "user.recovery_email_ciphertext", USER, "run:none", USER, `user-dek:${USER}`, "1"] as const;
const channel = (channelId: string, channelType: "email" | "recovery_email", address: string, cancelAuthorized: boolean) => ({ channelId, channelType, addressCiphertext: encrypt(KEY, Buffer.from(address), [...addressAad(channelType)]), cancelAuthorized });
const open = (envelope: unknown, channelId: string) => JSON.parse(decrypt(KEY, envelope as CryptoEnvelope, emailRecoveryNoticeAad("mfa_recovery", USER, channelId)).toString("utf8"));
const NOT_BEFORE = "2026-10-10T12:00:00.000Z", EXPIRES = "2026-10-17T12:00:00.000Z";

function repository(overrides: Record<string, unknown> = {}) {
  return {
    prepareSource: vi.fn(async () => SOURCE),
    admit: vi.fn(async () => true),
    read: vi.fn(async () => ({ stage: "READY", expiresAt: "2026-10-09T12:04:00.000Z", csrfHash: "sha256:" + "c".repeat(64) })),
    risk: vi.fn(async () => ({ userId: USER, evaluatedAt: "2026-10-09T12:00:00.000Z", fingerprint: "risk-fingerprint", signals: [] })),
    prepareWait: vi.fn(async () => ({ userId: USER, proofChannelId: PROOF, channels: [channel(PROOF, "email", "main@example.test", true), channel(OTHER, "recovery_email", "backup@example.test", false)] })),
    beginWait: vi.fn(async () => ({ status: "WAITING", notBefore: NOT_BEFORE, expiresAt: EXPIRES })),
    prepareFinish: vi.fn(async () => ({ userId: USER, passwordHash: PASSWORD_HASH, notBefore: NOT_BEFORE, expiresAt: EXPIRES, ready: true })),
    finish: vi.fn(async () => "COMPLETED"),
    failure: vi.fn(async () => undefined),
    complete: vi.fn(async () => "COMPLETED"),
    ...overrides
  };
}
function service(repo = repository()) {
  const argon2 = { verifyPassword: vi.fn(async (password: Uint8Array) => Buffer.from(password).toString("utf8") === "current password") };
  const users = { load: vi.fn(async () => Buffer.from(KEY)) };
  return { repo, argon2, users, service: new MfaRecoveryService({ repository: repo as never, users: users as never, argon2: argon2 as never, authPolicy, mfaPolicy: {} as never, policy: {} as never, blindIndexKey: Buffer.alloc(32, 1) }) };
}
const request = { ip: "192.0.2.10", userAgent: "synthetic", requestId: "wait" };

describe("complete starts the 24-hour wait instead of replacing the authenticator", () => {
  it("prepares the wait, mails a cancel link to every address that may cancel and a finish link to the proving address", async () => {
    const { repo, service: s } = service();
    await expect(s.complete({ sessionToken: SESSION }, request)).resolves.toEqual({ status: "waiting", not_before: NOT_BEFORE });
    const session = hashToken("mfa-recovery-session", SESSION);
    expect(repo.risk).toHaveBeenCalledWith(session, "session");
    expect(repo.prepareWait).toHaveBeenCalledWith(session);
    expect(repo.complete).not.toHaveBeenCalled();
    expect(repo.beginWait).toHaveBeenCalledTimes(1);
    const [hash, risk, finishHash, cancelHash, notices, source] = repo.beginWait.mock.calls[0]! as unknown as [string, string, string, string, Record<string, unknown>[], unknown];
    expect([hash, risk, source]).toEqual([session, "risk-fingerprint", SOURCE]);
    expect(notices.map(n => Object.keys(n).sort())).toEqual([["cancelEnvelope", "channelId", "finishEnvelope"], ["channelId"]]);
    expect(notices.map(n => n.channelId)).toEqual([PROOF, OTHER]);
    const cancel = open(notices[0]!.cancelEnvelope, PROOF), finish = open(notices[0]!.finishEnvelope, PROOF);
    expect(Object.keys(cancel).sort()).toEqual(["cancelToken", "recipient"]);
    expect(Object.keys(finish).sort()).toEqual(["finishToken", "recipient"]);
    expect(cancel.recipient).toBe("main@example.test"); expect(finish.recipient).toBe("main@example.test");
    expect(finishHash).toBe(hashToken("mfa-recovery-finish", finish.finishToken));
    expect(cancelHash).toBe(hashToken("mfa-recovery-cancel", cancel.cancelToken));
    expect(finish.finishToken).not.toBe(cancel.cancelToken);
    expect(() => open(notices[0]!.finishEnvelope, OTHER)).toThrow();
  });
  it("gives a finish link to a backup proving address that may not cancel, and no cancel link there", async () => {
    const repo = repository({ prepareWait: vi.fn(async () => ({ userId: USER, proofChannelId: OTHER, channels: [channel(PROOF, "email", "main@example.test", true), channel(OTHER, "recovery_email", "backup@example.test", false)] })) });
    const { service: s } = service(repo);
    await s.complete({ sessionToken: SESSION }, request);
    const notices = (repo.beginWait.mock.calls[0]! as unknown as unknown[])[4] as Record<string, unknown>[];
    expect(notices.map(n => Object.keys(n).sort())).toEqual([["cancelEnvelope", "channelId"], ["channelId", "finishEnvelope"]]);
    expect(open(notices[1]!.finishEnvelope, OTHER).recipient).toBe("backup@example.test");
  });
  it.each([
    ["nothing to prepare", null],
    ["a proving address outside the bound channels", { userId: USER, proofChannelId: "44444444-4444-4444-8444-444444444444", channels: [channel(PROOF, "email", "main@example.test", true)] }],
    ["repeated channels", { userId: USER, proofChannelId: PROOF, channels: [channel(PROOF, "email", "main@example.test", true), channel(PROOF, "email", "main@example.test", true)] }],
    ["no channels", { userId: USER, proofChannelId: PROOF, channels: [] }]
  ])("refuses %s without starting a wait", async (_name, prepared) => {
    const repo = repository({ prepareWait: vi.fn(async () => prepared) }), { service: s } = service(repo);
    await expect(s.complete({ sessionToken: SESSION }, request)).rejects.toThrow("MFA_RECOVERY_INVALID");
    expect(repo.beginWait).not.toHaveBeenCalled();
  });
  it("refuses when the database does not start the wait", async () => {
    const { service: s } = service(repository({ beginWait: vi.fn(async () => null) }));
    await expect(s.complete({ sessionToken: SESSION }, request)).rejects.toThrow("MFA_RECOVERY_INVALID");
  });
  it("shows a waiting recovery session as waiting with the time it can be finished", async () => {
    const { service: s } = service(repository({ read: vi.fn(async () => ({ stage: "WAITING", expiresAt: EXPIRES, csrfHash: null, notBefore: NOT_BEFORE })) }));
    await expect(s.status({ sessionToken: SESSION })).resolves.toEqual({ status: "waiting", expires_at: EXPIRES, not_before: NOT_BEFORE });
  });
});

describe("finishing after the 24 hours with the finish link and the current password", () => {
  const finishHash = hashToken("mfa-recovery-finish", FINISH);
  it("says how long is left before the 24 hours are over", async () => {
    const repo = repository({ prepareFinish: vi.fn(async () => ({ userId: USER, passwordHash: PASSWORD_HASH, notBefore: NOT_BEFORE, expiresAt: EXPIRES, ready: false })) }), { service: s } = service(repo);
    await expect(s.prepareFinish({ token: FINISH }, request)).resolves.toEqual({ status: "waiting", not_before: NOT_BEFORE });
    expect(repo.prepareFinish).toHaveBeenCalledWith(finishHash);
  });
  it("offers to finish once the 24 hours are over", async () => {
    const { service: s } = service();
    await expect(s.prepareFinish({ token: FINISH }, request)).resolves.toEqual({ status: "ready_to_finish", expires_at: EXPIRES });
  });
  it("refuses an unknown or malformed finish link", async () => {
    const repo = repository({ prepareFinish: vi.fn(async () => null) }), { service: s } = service(repo);
    await expect(s.prepareFinish({ token: FINISH }, request)).rejects.toThrow("MFA_RECOVERY_INVALID");
    await expect(s.prepareFinish({ token: "short" }, request)).rejects.toThrow("MFA_RECOVERY_INVALID");
    await expect(s.finish({ token: "short", password: "current password" }, request)).rejects.toThrow("MFA_RECOVERY_INVALID");
    expect(repo.prepareFinish).toHaveBeenCalledTimes(1);
  });
  it("finishes with the current password, the risk check and the stored password hash", async () => {
    const { repo, argon2, service: s } = service();
    await expect(s.finish({ token: FINISH, password: "current password" }, request)).resolves.toEqual({ status: "completed" });
    expect(argon2.verifyPassword).toHaveBeenCalledWith(expect.any(Uint8Array), PASSWORD_HASH);
    expect(repo.risk).toHaveBeenCalledWith(finishHash, "finish");
    expect(repo.finish).toHaveBeenCalledWith(finishHash, PASSWORD_HASH, "risk-fingerprint", SOURCE);
    expect(repo.failure).not.toHaveBeenCalled();
  });
  it("counts a wrong password as a failed attempt and changes nothing", async () => {
    const { repo, service: s } = service();
    await expect(s.finish({ token: FINISH, password: "wrong password" }, request)).rejects.toThrow("MFA_RECOVERY_PROOF_INVALID");
    expect(repo.failure).toHaveBeenCalledWith(finishHash, "finish", SOURCE);
    expect(repo.risk).not.toHaveBeenCalled(); expect(repo.finish).not.toHaveBeenCalled();
  });
  it("refuses before the 24 hours are over with its own reason, without checking the password", async () => {
    const repo = repository({ prepareFinish: vi.fn(async () => ({ userId: USER, passwordHash: PASSWORD_HASH, notBefore: NOT_BEFORE, expiresAt: EXPIRES, ready: false })) }), { argon2, service: s } = service(repo);
    await expect(s.finish({ token: FINISH, password: "current password" }, request)).rejects.toThrow("MFA_RECOVERY_TOO_EARLY");
    expect(argon2.verifyPassword).not.toHaveBeenCalled(); expect(repo.finish).not.toHaveBeenCalled();
  });
  it("passes the database's too-early refusal through and refuses anything else", async () => {
    await expect(service(repository({ finish: vi.fn(async () => "TOO_EARLY") })).service.finish({ token: FINISH, password: "current password" }, request)).rejects.toThrow("MFA_RECOVERY_TOO_EARLY");
    await expect(service(repository({ finish: vi.fn(async () => "INVALID") })).service.finish({ token: FINISH, password: "current password" }, request)).rejects.toThrow("MFA_RECOVERY_INVALID");
  });
});

// Review I1 2026-10-09: a second recovery started while one is already waiting is refused at the email link, right
// after the current password is checked, so nobody sets up an authenticator and ten codes only to be refused at the end.
// It is never refused at the public start step: only someone holding the emailed link (and the password) learns it.
describe("a second recovery while one is already waiting", () => {
  const LINK = "L".repeat(43), linkHash = hashToken("mfa-recovery-link", LINK);
  const candidate = { userId: USER, passwordHash: PASSWORD_HASH, channels: [PROOF, OTHER], bindingChannelIds: [PROOF] };
  const exchanging = (overrides: Record<string, unknown> = {}) => repository({ prepareExchange: vi.fn(async () => candidate), linkWaiting: vi.fn(async () => true), exchange: vi.fn(async () => "FACTOR_REQUIRED"), read: vi.fn(async () => ({ stage: "FACTOR_REQUIRED", expiresAt: "2026-10-09T12:05:00.000Z", csrfHash: "sha256:" + "c".repeat(64) })), ...overrides });
  it("is refused at the email link with its own reason, after the password, before anything is set up", async () => {
    const repo = exchanging(), { service: s } = service(repo);
    await expect(s.exchange({ token: LINK, password: "current password" }, request)).rejects.toThrow("MFA_RECOVERY_ALREADY_WAITING");
    expect(repo.linkWaiting).toHaveBeenCalledWith(linkHash);
    expect(repo.exchange).not.toHaveBeenCalled(); expect(repo.failure).not.toHaveBeenCalled();
  });
  it("tells nothing to a wrong password", async () => {
    const repo = exchanging(), { service: s } = service(repo);
    await expect(s.exchange({ token: LINK, password: "wrong password" }, request)).rejects.toThrow("MFA_RECOVERY_PROOF_INVALID");
    expect(repo.linkWaiting).not.toHaveBeenCalled(); expect(repo.exchange).not.toHaveBeenCalled();
  });
  it("tells nothing to an unknown link", async () => {
    const repo = exchanging({ prepareExchange: vi.fn(async () => null) }), { service: s } = service(repo);
    await expect(s.exchange({ token: LINK, password: "current password" }, request)).rejects.toThrow("MFA_RECOVERY_INVALID");
    expect(repo.linkWaiting).not.toHaveBeenCalled();
  });
  it("goes on as before when nothing is waiting", async () => {
    const repo = exchanging({ linkWaiting: vi.fn(async () => false) }), { service: s } = service(repo);
    await expect(s.exchange({ token: LINK, password: "current password" }, request)).resolves.toMatchObject({ state: { status: "factor_required" } });
    expect(repo.linkWaiting).toHaveBeenCalledWith(linkHash); expect(repo.exchange).toHaveBeenCalledTimes(1);
  });
});

describe("the database calls behind the wait", () => {
  function pool() { const calls: { sql: string; args: unknown[] }[] = []; return { calls, pool: { query: vi.fn(async (sql: string, args: unknown[]) => { calls.push({ sql, args }); return { rows: [{ result: null }] }; }) } }; }
  it("names the exact functions and passes the exact arguments", async () => {
    const { calls, pool: p } = pool(), repo = new PostgresMfaRecoveryRepository(p as never, {} as never, 1);
    const notices = [{ channelId: PROOF, cancelEnvelope: { v: 1 }, finishEnvelope: { v: 1 } }];
    await repo.prepareWait("session-hash");
    await repo.beginWait("session-hash", "risk", "finish-hash", "cancel-hash", notices, SOURCE);
    await repo.prepareFinish("finish-hash");
    await repo.finish("finish-hash", PASSWORD_HASH, "risk", SOURCE);
    await repo.risk("finish-hash", "finish");
    await repo.failure("finish-hash", "finish", SOURCE);
    await repo.linkWaiting("link-hash");
    expect(calls).toEqual([
      { sql: "SELECT identity.mfa_recovery_prepare_wait($1) AS result", args: ["session-hash"] },
      { sql: "SELECT identity.mfa_recovery_begin_wait($1,$2,$3,$4,$5,$6) AS result", args: ["session-hash", "risk", "finish-hash", "cancel-hash", JSON.stringify(notices), SOURCE] },
      { sql: "SELECT identity.mfa_recovery_prepare_finish($1) AS result", args: ["finish-hash"] },
      { sql: "SELECT identity.mfa_recovery_finish($1,$2,$3,$4) AS result", args: ["finish-hash", PASSWORD_HASH, "risk", SOURCE] },
      { sql: "SELECT identity.mfa_recovery_risk($1,$2) AS result", args: ["finish-hash", "finish"] },
      { sql: "SELECT identity.mfa_recovery_failure($1,$2,$3) AS result", args: ["finish-hash", "finish", SOURCE] },
      { sql: "SELECT identity.mfa_recovery_link_waiting($1) AS result", args: ["link-hash"] }
    ]);
  });
});
