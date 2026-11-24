import { describe, expect, it, vi } from "vitest";
import { createEmailBlindIndex, decrypt, encrypt, hashToken, type AeadAad, type CryptoEnvelope } from "@debateai/crypto";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, type AuthPolicy } from "@debateai/register";
import { emailRecoveryNoticeAad } from "../../apps/api/src/email-mfa-recovery.js";
import { RecoveryPermitError, RecoveryPermitService } from "../../apps/api/src/recovery-permit.js";
import { RECOVERY_START_PUBLIC_RESPONSE } from "../../apps/api/src/recovery.js";
import { authenticationRiskSignalAad } from "../../packages/db/src/auth-risk.js";

/**
 * The person's side of the Owner's permit (migration 0188) with its database calls, the account key and Argon2 in
 * memory. The service checks the typed password against the stored one, seals what the mails carry with the account's
 * key, and hands the database only digests, sealed envelopes and the STORED password hash.
 */
const USER = "11111111-1111-4111-8111-111111111111", PROOF = "22222222-2222-4222-8222-222222222222";
const BACKUP = "33333333-3333-4333-8333-333333333333", QUIET = "44444444-4444-4444-8444-444444444444";
const KEY = Buffer.alloc(32, 7), BLIND = Buffer.alloc(32, 1);
const LINK = "L".repeat(43), CANCEL = "C".repeat(43), FINISH = "F".repeat(43);
const RIGHT = "current password", WRONG = "wrong password";
const SOURCE = { ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}` };
const request = { ip: "192.0.2.10", userAgent: "synthetic", requestId: "permit" };
const registered = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), cost = registered.password.argon2id;
// The start's equal-time floor is the email route's; it is proven there, and here it would only slow every case.
const authPolicy: AuthPolicy = { ...registered, verification: { ...registered.verification, enumerationResponseFloorMs: 0 } };
const PASSWORD_HASH = `$argon2id$v=19$m=${cost.memoryCostKiB},t=${cost.timeCost},p=${cost.parallelism}$${Buffer.alloc(16, 1).toString("base64").replace(/=/g, "")}$${Buffer.alloc(32, 1).toString("base64").replace(/=/g, "")}`;
const addressAad = (type: "email" | "recovery_email"): AeadAad => ["identity", type === "email" ? "user.email_ciphertext" : "user.recovery_email_ciphertext", USER, "run:none", USER, `user-dek:${USER}`, "1"];
const sealedAddress = (type: "email" | "recovery_email", address: string) => encrypt(KEY, Buffer.from(address), addressAad(type));
const channel = (channelId: string, channelType: "email" | "recovery_email", address: string, proof: boolean, cancelAuthorized: boolean) =>
  ({ channelId, channelType, addressCiphertext: sealedAddress(channelType, address), proof, cancelAuthorized });
const open = (envelope: unknown, channelId: string) => JSON.parse(decrypt(KEY, envelope as CryptoEnvelope, emailRecoveryNoticeAad("recovery_permit", USER, channelId)).toString("utf8")) as Record<string, string>;
const CANDIDATE = { userId: USER, channels: [channel(PROOF, "email", "main@example.test", true, true), channel(BACKUP, "recovery_email", "backup@example.test", false, true),
  channel(QUIET, "recovery_email", "quiet@example.test", false, false)] };
const REQUEST_CANDIDATE = { userId: USER, passwordHash: PASSWORD_HASH, proofChannelId: PROOF, proofAddressCiphertext: sealedAddress("email", "main@example.test") };
const LATER = () => new Date(Date.now() + 3_600_000).toISOString(), EARLIER = () => new Date(Date.now() - 3_600_000).toISOString();
const finishCandidate = (ready: boolean, notBefore: string) => ({ userId: USER, passwordHash: PASSWORD_HASH, notBefore, expiresAt: "2030-01-08T00:00:00.000Z", ready });

function repository(overrides: Record<string, unknown> = {}) {
  return {
    prepare: vi.fn(async (): Promise<unknown> => CANDIDATE),
    start: vi.fn(async () => true),
    prepareRequest: vi.fn(async (): Promise<unknown> => REQUEST_CANDIDATE),
    request: vi.fn(async (): Promise<string> => "REQUESTED"),
    recordFailure: vi.fn(async (): Promise<string> => "PROOF_INVALID"),
    cancel: vi.fn(async (): Promise<string> => "CANCELLED"),
    prepareFinish: vi.fn(async (): Promise<unknown> => finishCandidate(true, EARLIER())),
    finish: vi.fn(async (): Promise<unknown> => ({ status: "OPENED", expiresAt: "2030-01-01T00:05:00.000Z" })),
    ...overrides
  };
}
function service(repo = repository(), admitted = true) {
  const sources = { prepareSource: vi.fn(async () => SOURCE), admit: vi.fn(async () => admitted) };
  const argon2 = { verifyPassword: vi.fn(async (password: Uint8Array) => Buffer.from(password).toString("utf8") === RIGHT) };
  const users = { load: vi.fn(async () => Buffer.from(KEY)) };
  return { repo, sources, argon2, users, service: new RecoveryPermitService({ repository: repo as never, sources: sources as never, users: users as never, argon2: argon2 as never, authPolicy, blindIndexKey: BLIND }) };
}
/** The refusal a call ends in, as the routes see it. */
const refusal = async (work: Promise<unknown>) => { const error = await work.then(() => null, (e: unknown) => e); expect(error).toBeInstanceOf(RecoveryPermitError); return (error as RecoveryPermitError).code; };

describe("start", () => {
  it("answers the very same object for a malformed address, an address with no account, a source over its limit and an account that may ask", async () => {
    const malformed = service(), unknown = service(repository({ prepare: vi.fn(async () => null) })), limited = service(repository(), false), real = service();
    const answers = [await malformed.service.start({ email: "no at sign here" }, request), await unknown.service.start({ email: "nobody@example.test" }, request),
      await limited.service.start({ email: "main@example.test" }, request), await real.service.start({ email: "main@example.test" }, request)];
    for (const answer of answers) expect(answer).toBe(RECOVERY_START_PUBLIC_RESPONSE);
    expect([malformed, unknown, limited, real].map((s) => s.repo.start.mock.calls.length)).toEqual([0, 0, 0, 1]);
    // A malformed address is answered before anything is counted; a source over its limit before any account is looked up.
    expect(malformed.sources.prepareSource).not.toHaveBeenCalled();
    expect(limited.repo.prepare).not.toHaveBeenCalled();
    // An address with no account spends no account key.
    expect(unknown.users.load).not.toHaveBeenCalled();
    expect(real.repo.prepare).toHaveBeenCalledWith(createEmailBlindIndex(BLIND, "main@example.test"));
  });
  it("seals one entry per verified address: the recipient, the cancel link where the address may cancel, and the mailbox link on the proving address", async () => {
    const { repo, service: s } = service();
    await s.start({ email: "  MAIN@example.test " }, { ...request, mailLocale: "ro" } as never);
    const [input] = repo.start.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input).toMatchObject({ index: createEmailBlindIndex(BLIND, "main@example.test"), candidateId: USER, channels: [PROOF, BACKUP, QUIET], source: SOURCE, mailLocale: "ro" });
    expect(input.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    const notices = input.notices as Record<string, unknown>[];
    expect(notices.map((n) => [n.channelId, Object.keys(n).sort()])).toEqual([
      [PROOF, ["cancelEnvelope", "channelId", "envelope", "proofEnvelope"]],
      [BACKUP, ["cancelEnvelope", "channelId", "envelope"]],
      [QUIET, ["channelId", "envelope"]]
    ]);
    expect(notices.map((n) => open(n.envelope, n.channelId as string))).toEqual([{ recipient: "main@example.test" }, { recipient: "backup@example.test" }, { recipient: "quiet@example.test" }]);
    const proof = open(notices[0]!.proofEnvelope, PROOF), cancelMain = open(notices[0]!.cancelEnvelope, PROOF), cancelBackup = open(notices[1]!.cancelEnvelope, BACKUP);
    expect(Object.keys(proof).sort()).toEqual(["cancelToken", "recipient", "token"]);
    expect(proof.recipient).toBe("main@example.test");
    expect(cancelMain).toEqual({ recipient: "main@example.test", cancelToken: proof.cancelToken });
    expect(cancelBackup).toEqual({ recipient: "backup@example.test", cancelToken: proof.cancelToken });
    for (const token of [proof.token!, proof.cancelToken!]) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(proof.token).not.toBe(proof.cancelToken);
    expect(input.linkHash).toBe(hashToken("recovery-permit-link", proof.token!));
    expect(input.cancelHash).toBe(hashToken("recovery-permit-cancel", proof.cancelToken!));
    // Each entry is sealed for its own address: one address's envelope does not open as another's.
    expect(() => open(notices[0]!.proofEnvelope, BACKUP)).toThrow();
  });
  it("names English as the mail language when the request carries none", async () => {
    const { repo, service: s } = service();
    await s.start({ email: "main@example.test" }, request);
    expect((repo.start.mock.calls[0] as unknown as [Record<string, unknown>])[0].mailLocale).toBe("en");
  });
});

describe("request", () => {
  const linkHash = hashToken("recovery-permit-link", LINK);
  it("a wrong password is counted with the sealed risk context and never asks the Owner", async () => {
    const { repo, service: s } = service();
    expect(await refusal(s.request({ token: LINK, password: WRONG }, request))).toBe("RECOVERY_PERMIT_PROOF_INVALID");
    expect(repo.prepareRequest).toHaveBeenCalledWith(linkHash);
    expect(repo.recordFailure).toHaveBeenCalledTimes(1);
    const [selector, kind, source, context] = repo.recordFailure.mock.calls[0] as unknown as [string, string, unknown, CryptoEnvelope];
    expect([selector, kind, source]).toEqual([linkHash, "link", SOURCE]);
    expect(JSON.parse(decrypt(KEY, context, authenticationRiskSignalAad(USER)).toString("utf8"))).toEqual({ v: 1, networkRef: SOURCE.ipArgon2id, clientRef: SOURCE.userAgentArgon2id });
    expect(repo.request).not.toHaveBeenCalled();
  });
  it.each(["REFUSED", "INVALID"])("a wrong password the recorder answers %s with is a dead link to the person", async (outcome) => {
    const { repo, service: s } = service(repository({ recordFailure: vi.fn(async () => outcome) }));
    expect(await refusal(s.request({ token: LINK, password: WRONG }, request))).toBe("RECOVERY_PERMIT_INVALID");
    expect(repo.request).not.toHaveBeenCalled();
  });
  it("the right password seals the finish link for the proving address and hands the database the STORED password hash", async () => {
    const { repo, argon2, service: s } = service();
    await expect(s.request({ token: LINK, password: RIGHT }, request)).resolves.toEqual({ status: "requested" });
    expect(argon2.verifyPassword).toHaveBeenCalledWith(expect.any(Uint8Array), PASSWORD_HASH);
    expect(repo.request).toHaveBeenCalledTimes(1);
    const [link, password, finishHash, envelope, source] = repo.request.mock.calls[0] as unknown as [string, string, string, CryptoEnvelope, unknown];
    expect([link, password, source]).toEqual([linkHash, PASSWORD_HASH, SOURCE]);
    const sealed = open(envelope, PROOF);
    expect(Object.keys(sealed).sort()).toEqual(["finishToken", "recipient"]);
    expect(sealed.recipient).toBe("main@example.test");
    expect(finishHash).toBe(hashToken("recovery-permit-finish", sealed.finishToken!));
    expect(JSON.stringify(repo.request.mock.calls)).not.toContain(RIGHT);
    expect(repo.recordFailure).not.toHaveBeenCalled();
  });
  it("an ask the database refuses and a link it does not know are answered alike", async () => {
    const answers = [];
    for (const outcome of ["REFUSED", "INVALID"]) {
      const error = await service(repository({ request: vi.fn(async () => outcome) })).service.request({ token: LINK, password: RIGHT }, request).catch((e: unknown) => e) as RecoveryPermitError;
      answers.push([error.name, error.code, error.message]);
    }
    const unknown = await service(repository({ prepareRequest: vi.fn(async () => null) })).service.request({ token: LINK, password: RIGHT }, request).catch((e: unknown) => e) as RecoveryPermitError;
    answers.push([unknown.name, unknown.code, unknown.message]);
    expect(answers).toEqual([["RecoveryPermitError", "RECOVERY_PERMIT_INVALID", "RECOVERY_PERMIT_INVALID"], ["RecoveryPermitError", "RECOVERY_PERMIT_INVALID", "RECOVERY_PERMIT_INVALID"],
      ["RecoveryPermitError", "RECOVERY_PERMIT_INVALID", "RECOVERY_PERMIT_INVALID"]]);
  });
  it("a malformed link is a dead link before the database is asked; a source over its limit is told so", async () => {
    const { repo, service: s } = service();
    expect(await refusal(s.request({ token: "short", password: RIGHT }, request))).toBe("RECOVERY_PERMIT_INVALID");
    expect(repo.prepareRequest).not.toHaveBeenCalled();
    const limited = service(repository(), false);
    expect(await refusal(limited.service.request({ token: LINK, password: RIGHT }, request))).toBe("RECOVERY_PERMIT_RATE_LIMITED");
    expect(limited.repo.prepareRequest).not.toHaveBeenCalled();
  });
});

describe("cancel", () => {
  it("the cancel link's digest goes to the database, and anything but a cancellation is a dead link", async () => {
    const { repo, service: s } = service();
    await expect(s.cancel({ token: CANCEL }, request)).resolves.toEqual({ status: "cancelled" });
    expect(repo.cancel).toHaveBeenCalledWith(hashToken("recovery-permit-cancel", CANCEL), SOURCE);
    expect(await refusal(service(repository({ cancel: vi.fn(async () => "INVALID") })).service.cancel({ token: CANCEL }, request))).toBe("RECOVERY_PERMIT_INVALID");
    const malformed = service();
    expect(await refusal(malformed.service.cancel({ token: "short" }, request))).toBe("RECOVERY_PERMIT_INVALID");
    expect(malformed.repo.cancel).not.toHaveBeenCalled();
  });
});

describe("the finish link", () => {
  const finishHash = hashToken("recovery-permit-finish", FINISH);
  it("before the wait is over it says until when; ready, until when it works; spent, it is a dead link", async () => {
    const notBefore = LATER(), waiting = service(repository({ prepareFinish: vi.fn(async () => finishCandidate(false, notBefore)) }));
    await expect(waiting.service.prepareFinish({ token: FINISH }, request)).resolves.toEqual({ status: "waiting", not_before: new Date(notBefore).toISOString() });
    expect(waiting.repo.prepareFinish).toHaveBeenCalledWith(finishHash);
    await expect(service().service.prepareFinish({ token: FINISH }, request)).resolves.toEqual({ status: "ready_to_finish", expires_at: "2030-01-08T00:00:00.000Z" });
    expect(await refusal(service(repository({ prepareFinish: vi.fn(async () => finishCandidate(false, EARLIER())) })).service.prepareFinish({ token: FINISH }, request))).toBe("RECOVERY_PERMIT_INVALID");
    expect(await refusal(service(repository({ prepareFinish: vi.fn(async () => null) })).service.prepareFinish({ token: FINISH }, request))).toBe("RECOVERY_PERMIT_INVALID");
  });
  it("finishing before the wait is over is too early, and the password is not checked", async () => {
    const { repo, argon2, service: s } = service(repository({ prepareFinish: vi.fn(async () => finishCandidate(false, LATER())) }));
    expect(await refusal(s.finish({ token: FINISH, password: RIGHT }, request))).toBe("RECOVERY_PERMIT_TOO_EARLY");
    expect(argon2.verifyPassword).not.toHaveBeenCalled();
    expect(repo.finish).not.toHaveBeenCalled();
    expect(repo.recordFailure).not.toHaveBeenCalled();
  });
  it("a wrong password is counted against this finish link, with no risk context", async () => {
    const { repo, service: s } = service();
    expect(await refusal(s.finish({ token: FINISH, password: WRONG }, request))).toBe("RECOVERY_PERMIT_PROOF_INVALID");
    expect(repo.recordFailure).toHaveBeenCalledWith(finishHash, "finish", SOURCE, null);
    expect(repo.finish).not.toHaveBeenCalled();
    expect(await refusal(service(repository({ recordFailure: vi.fn(async () => "REFUSED") })).service.finish({ token: FINISH, password: WRONG }, request))).toBe("RECOVERY_PERMIT_INVALID");
  });
  it("the right password opens the enrol-only step with a fresh capability whose digest alone the database receives", async () => {
    const { repo, service: s } = service();
    const opened = await s.finish({ token: FINISH, password: RIGHT }, request);
    expect(opened).toEqual({ status: "RECOVERY_ENROLL_ONLY", available_methods: ["passkey", "totp"], totp_unavailable_reason: null, recovery_capability: expect.any(String), expires_at: "2030-01-01T00:05:00.000Z" });
    expect(opened.recovery_capability).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(repo.finish).toHaveBeenCalledWith(finishHash, PASSWORD_HASH, hashToken("consumer-recovery-enroll", opened.recovery_capability), SOURCE);
    expect(JSON.stringify(repo.finish.mock.calls)).not.toContain(opened.recovery_capability);
    // A second opening gets a capability of its own.
    expect((await s.finish({ token: FINISH, password: RIGHT }, request)).recovery_capability).not.toBe(opened.recovery_capability);
  });
  it("the database's own too-early and anything else it says are passed on as too early and a dead link", async () => {
    expect(await refusal(service(repository({ finish: vi.fn(async () => ({ status: "TOO_EARLY", notBefore: LATER() })) })).service.finish({ token: FINISH, password: RIGHT }, request))).toBe("RECOVERY_PERMIT_TOO_EARLY");
    expect(await refusal(service(repository({ finish: vi.fn(async () => ({ status: "INVALID" })) })).service.finish({ token: FINISH, password: RIGHT }, request))).toBe("RECOVERY_PERMIT_INVALID");
  });
  it("a malformed finish link is a dead link before the database is asked", async () => {
    const { repo, service: s } = service();
    expect(await refusal(s.finish({ token: "short", password: RIGHT }, request))).toBe("RECOVERY_PERMIT_INVALID");
    expect(await refusal(s.prepareFinish({ token: "short" }, request))).toBe("RECOVERY_PERMIT_INVALID");
    expect(repo.prepareFinish).not.toHaveBeenCalled();
  });
});

describe("a failure underneath", () => {
  // A failure whose own words hold the typed password and a link: none of it may reach the caller.
  const leaky = vi.fn(async () => { throw new Error(`database down near ${RIGHT} ${WRONG} ${LINK} ${FINISH}`); });
  it.each(["prepare", "start", "prepareRequest", "request", "recordFailure", "cancel", "prepareFinish", "finish"])("a %s that throws becomes RECOVERY_PERMIT_UNAVAILABLE", async (method) => {
    const { service: s } = service(repository({ [method]: leaky }));
    const call = method === "prepare" || method === "start" ? s.start({ email: "main@example.test" }, request)
      : method === "prepareRequest" || method === "request" ? s.request({ token: LINK, password: RIGHT }, request)
      : method === "recordFailure" ? s.request({ token: LINK, password: WRONG }, request)
      : method === "cancel" ? s.cancel({ token: CANCEL }, request)
      : s.finish({ token: FINISH, password: RIGHT }, request);
    const error = await call.catch((e: unknown) => e) as RecoveryPermitError;
    expect(error).toBeInstanceOf(RecoveryPermitError);
    expect([error.code, error.message]).toEqual(["RECOVERY_PERMIT_UNAVAILABLE", "RECOVERY_PERMIT_UNAVAILABLE"]);
  });
  it("a key store or source window that throws becomes RECOVERY_PERMIT_UNAVAILABLE too", async () => {
    const keyless = service();
    keyless.users.load.mockRejectedValue(new Error(`no key for ${RIGHT}`));
    expect(await refusal(keyless.service.request({ token: LINK, password: RIGHT }, request))).toBe("RECOVERY_PERMIT_UNAVAILABLE");
    const sourceless = service();
    sourceless.sources.prepareSource.mockRejectedValue(new Error("source down"));
    expect(await refusal(sourceless.service.cancel({ token: CANCEL }, request))).toBe("RECOVERY_PERMIT_UNAVAILABLE");
  });
});

describe("what leaves the service", () => {
  it("nothing it answers or throws holds the typed password or a token it did not hand out", async () => {
    const out: unknown[] = [];
    const record = async (work: Promise<unknown>) => { try { out.push(await work); } catch (error) { out.push(error, (error as Error).message, (error as Error).stack); } };
    const leaky = vi.fn(async () => { throw new Error(`database down near ${RIGHT} ${WRONG} ${LINK} ${CANCEL} ${FINISH}`); });
    for (const repo of [repository(), repository({ request: vi.fn(async () => "REFUSED"), recordFailure: vi.fn(async () => "REFUSED") }),
      repository({ prepareFinish: vi.fn(async () => finishCandidate(false, LATER())) }), repository({ prepareRequest: leaky, cancel: leaky, prepareFinish: leaky, prepare: leaky })]) {
      const { service: s } = service(repo);
      await record(s.start({ email: "main@example.test" }, request));
      for (const password of [RIGHT, WRONG]) {
        await record(s.request({ token: LINK, password }, request));
        await record(s.finish({ token: FINISH, password }, request));
      }
      await record(s.cancel({ token: CANCEL }, request));
      await record(s.prepareFinish({ token: FINISH }, request));
    }
    const text = out.map((value) => typeof value === "string" ? value : JSON.stringify(value, Object.getOwnPropertyNames(value ?? {}))).join("\n");
    for (const secret of [RIGHT, WRONG, LINK, CANCEL, FINISH, PASSWORD_HASH, "main@example.test"]) expect(text).not.toContain(secret);
  });
});
