// Owner ruling 2026-10-09: the two new authenticator-recovery mails — the 24-hour wait notice (every bound address,
// cancel link where that address may cancel) and the finish link (the proving address, once the 24 hours are over).
import { describe, expect, it, vi } from "vitest";
import { encrypt } from "@debateai/crypto";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from "@debateai/register";
import { EmailRecoveryNotificationWorker, renderEmailRecoveryMail, type EmailRecoveryMail } from "../../apps/api/src/email-mfa-mail.js";
import { emailRecoveryNoticeAad } from "../../apps/api/src/email-mfa-recovery.js";

const options = { from: "noreply@example.test", publicAppUrl: "https://app.example.test" };
const CANCEL = "C".repeat(43), FINISH = "F".repeat(43);
const NOT_BEFORE = new Date("2026-10-10T12:00:00.000Z"), EXPIRES = new Date("2026-10-17T12:00:00.000Z");
const base = { flow: "mfa_recovery", messageId: "11111111-1111-4111-8111-111111111111", recipient: "main@example.test", expiresAt: EXPIRES } as const;
const body = (mail: Record<string, unknown>) => renderEmailRecoveryMail(mail as EmailRecoveryMail, options);

describe("the 24-hour wait notice", () => {
  it("states when it finishes, that everything keeps working until then, and how to cancel", () => {
    const text = body({ ...base, event: "WAITING", notBefore: NOT_BEFORE, cancelToken: CANCEL });
    expect(text).toContain("Subject: DebateAI authenticator recovery finishes in 24 hours\r\n");
    expect(text).toContain(NOT_BEFORE.toISOString());
    expect(text).toContain("your current authenticator, your recovery codes and your signed-in sessions keep working");
    expect(text).toContain(`https://app.example.test/recover-authenticator#cancel=${CANCEL}\r\n`);
    expect(text).toContain("Settings, then Security");
  });
  it("leaves out the cancel link for an address that may not cancel but still points to Settings", () => {
    const text = body({ ...base, event: "WAITING", notBefore: NOT_BEFORE });
    expect(text).not.toContain("#cancel=");
    expect(text).toContain("Settings, then Security");
  });
  it.each([
    ["without its time", { ...base, event: "WAITING" }],
    ["with an invalid time", { ...base, event: "WAITING", notBefore: new Date(Number.NaN) }],
    ["with a finish link", { ...base, event: "WAITING", notBefore: NOT_BEFORE, finishToken: FINISH }],
    ["with a malformed cancel link", { ...base, event: "WAITING", notBefore: NOT_BEFORE, cancelToken: "short" }]
  ])("refuses a wait notice %s", (_name, mail) => { expect(() => body(mail)).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID"); });
});

describe("the finish link", () => {
  it("says the person can finish now, gives the link and its expiry, and asks for the current password", () => {
    const text = body({ ...base, event: "FINISH", finishToken: FINISH });
    expect(text).toContain("You can finish setting up your new authenticator now.");
    expect(text).toContain(`https://app.example.test/recover-authenticator#finish=${FINISH}\r\n`);
    expect(text).toContain(`This link expires at ${EXPIRES.toISOString()}.`);
    expect(text).toContain("You will need your current password.");
    expect(text).not.toContain("#cancel=");
  });
  it.each([
    ["without its link", { ...base, event: "FINISH" }],
    ["with a cancel link", { ...base, event: "FINISH", finishToken: FINISH, cancelToken: CANCEL }],
    ["with a malformed link", { ...base, event: "FINISH", finishToken: "short" }]
  ])("refuses a finish mail %s", (_name, mail) => { expect(() => body(mail)).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID"); });
  it("keeps the wait time and the finish link out of every other recovery mail", () => {
    expect(() => body({ ...base, event: "COMPLETED", notBefore: NOT_BEFORE })).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
    expect(() => body({ ...base, event: "STARTED", finishToken: FINISH })).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
    expect(() => body({ ...base, flow: "backup_email", event: "VERIFIED", notBefore: NOT_BEFORE })).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
  });
});

describe("the notice worker reads the two new claims", () => {
  const USER = "22222222-2222-4222-8222-222222222222", CHANNEL = "33333333-3333-4333-8333-333333333333", KEY = Buffer.alloc(32, 9);
  async function deliver(event: "WAITING" | "FINISH", payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const sent: EmailRecoveryMail[] = [], diagnostics: string[] = [];
    const notice = { noticeId: base.messageId, leaseId: "44444444-4444-4444-8444-444444444444", userId: USER, channelId: CHANNEL, event, payload: encrypt(KEY, Buffer.from(JSON.stringify(payload)), emailRecoveryNoticeAad("mfa_recovery", USER, CHANNEL)), expiresAt: EXPIRES.toISOString(), notBefore: NOT_BEFORE.toISOString(), ...extra };
    let claimed = false;
    const repository = { expire: vi.fn(async () => 0), claimNotice: vi.fn(async () => { if (claimed) return null; claimed = true; return notice as never; }), finishNotice: vi.fn(async () => true) };
    const worker = new EmailRecoveryNotificationWorker({ flow: "mfa_recovery", repository, users: { load: async () => Buffer.from(KEY) } as never, sender: { send: async mail => { sent.push(mail); } }, authPolicy: authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), reportDiagnostic: code => diagnostics.push(code), dispatch: async prepare => { await (await prepare())?.(); } });
    await worker.reconcile(5);
    return { sent, diagnostics, repository };
  }
  it("sends the wait notice with its cancel link and its time", async () => {
    const { sent } = await deliver("WAITING", { recipient: "main@example.test", cancelToken: CANCEL }, { cancelAllowed: true });
    expect(sent).toEqual([{ flow: "mfa_recovery", messageId: base.messageId, event: "WAITING", recipient: "main@example.test", expiresAt: EXPIRES, notBefore: NOT_BEFORE, cancelToken: CANCEL }]);
  });
  it("sends the wait notice without a cancel link where cancelling is not allowed", async () => {
    const { sent } = await deliver("WAITING", { recipient: "backup@example.test" }, { cancelAllowed: false });
    expect(sent).toEqual([{ flow: "mfa_recovery", messageId: base.messageId, event: "WAITING", recipient: "backup@example.test", expiresAt: EXPIRES, notBefore: NOT_BEFORE }]);
  });
  it("sends the finish link", async () => {
    const { sent } = await deliver("FINISH", { recipient: "main@example.test", finishToken: FINISH });
    expect(sent).toEqual([{ flow: "mfa_recovery", messageId: base.messageId, event: "FINISH", recipient: "main@example.test", expiresAt: EXPIRES, finishToken: FINISH }]);
  });
  it.each([
    ["a cancel link the address may not use", "WAITING", { recipient: "main@example.test", cancelToken: CANCEL }, { cancelAllowed: false }],
    ["a wait notice without its time", "WAITING", { recipient: "main@example.test" }, { cancelAllowed: false, notBefore: undefined }],
    ["a finish claim without its link", "FINISH", { recipient: "main@example.test" }, {}],
    ["a finish claim carrying a cancel link", "FINISH", { recipient: "main@example.test", finishToken: FINISH, cancelToken: CANCEL }, {}]
  ] as const)("sends nothing for %s and reports it", async (_name, event, payload, extra) => {
    const { sent, diagnostics, repository } = await deliver(event, payload, extra);
    expect(sent).toEqual([]); expect(diagnostics).toContain("EMAIL_RECOVERY_NOTICE_PENDING");
    expect(repository.finishNotice).toHaveBeenCalledWith(base.messageId, "44444444-4444-4444-8444-444444444444", false, 300000, expect.any(Number));
  });
});
