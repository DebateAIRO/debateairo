import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { encrypt } from "@debateai/crypto";
import { copyOf } from "@debateai/mail-templates";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from "@debateai/register";
import { EmailRecoveryNotificationWorker, renderEmailRecoveryMail, type EmailRecoveryMail } from "../../apps/api/src/email-mfa-mail.js";
import { emailRecoveryNoticeAad } from "../../apps/api/src/email-mfa-recovery.js";

/**
 * The mails of the Owner's permit for a locked-out account (migration 0188): the mailbox link with its cancel link, the
 * notice of the 72 hours, the finish link, and the two short endings. Each event carries only the fields it may, and
 * every link points at /recover/help with the token in the fragment, never in the path or the query.
 */
const options = { from: "noreply@example.test", publicAppUrl: "https://app.example.test" };
const TOKEN = "T".repeat(43), CANCEL = "C".repeat(43), FINISH = "F".repeat(43);
const NOT_BEFORE = new Date("2026-11-27T12:00:00.000Z"), EXPIRES = new Date("2026-12-04T12:00:00.000Z");
const base = { flow: "recovery_permit", messageId: "11111111-1111-4111-8111-111111111111", recipient: "main@example.test", expiresAt: EXPIRES } as const;
const render = (mail: Record<string, unknown>) => renderEmailRecoveryMail(mail as unknown as EmailRecoveryMail, options);
/** The body as the reader sees it, whether it went out as plain text or as base64. */
function body(message: string): string {
  const split = message.indexOf("\r\n\r\n"), head = message.slice(0, split).split("\r\n"), raw = message.slice(split + 4);
  return head.includes("Content-Transfer-Encoding: base64") ? Buffer.from(raw.replace(/\r\n/g, ""), "base64").toString("utf8") : raw;
}
const lines = (message: string) => body(message).split("\r\n");
const copy = (key: string, values: Record<string, string> = {}) => Object.entries(values).reduce((text, [name, value]) => text.split(`{${name}}`).join(value), copyOf("en", key));
const link = (kind: "token" | "cancel" | "finish", value: string) => `https://app.example.test/recover/help#${kind}=${value}`;

describe("each event's mail", () => {
  it("the mailbox link carries the link and the cancel link to /recover/help, and its expiry", () => {
    const text = render({ ...base, event: "PROOF", token: TOKEN, cancelToken: CANCEL });
    expect(text).toContain(`\r\nSubject: ${copy("auth.emr.permit.proof.subject")}\r\n`);
    expect(text).toMatch(/\r\nMessage-ID: <recovery-permit-11111111-1111-4111-8111-111111111111@app\.example\.test>\r\n/u);
    expect(lines(text)).toContain(link("token", TOKEN));
    expect(lines(text)).toContain(link("cancel", CANCEL));
    expect(lines(text)).toContain(copy("auth.emr.permit.proof.p3", { expiry: EXPIRES.toISOString() }));
    expect(lines(text)).toContain(copy("auth.emr.permit.proof.p5"));
    expect(body(text)).not.toContain(FINISH);
  });
  it("the mailbox link is refused without its cancel link or without its link", () => {
    expect(() => render({ ...base, event: "PROOF", token: TOKEN })).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
    expect(() => render({ ...base, event: "PROOF", cancelToken: CANCEL })).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
    expect(() => render({ ...base, event: "PROOF", token: "short", cancelToken: CANCEL })).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
  });
  it("the notice of the wait names the instant nothing changes before, with the cancel link where the address may cancel", () => {
    const text = render({ ...base, event: "WAITING", notBefore: NOT_BEFORE, cancelToken: CANCEL });
    expect(text).toContain(`\r\nSubject: ${copy("auth.emr.permit.waiting.subject")}\r\n`);
    expect(lines(text)).toContain(copy("auth.emr.permit.waiting.p2", { notBefore: NOT_BEFORE.toISOString() }));
    expect(lines(text)).toContain(copy("auth.emr.permit.waiting.p4"));
    expect(lines(text)).toContain(link("cancel", CANCEL));
    expect(lines(text)).toContain(copy("auth.emr.permit.waiting.p6"));
    expect(body(text)).not.toContain("{notBefore}");
  });
  it("the notice of the wait for an address that may not cancel carries no link at all", () => {
    const text = render({ ...base, event: "WAITING", notBefore: NOT_BEFORE });
    expect(lines(text)).toContain(copy("auth.emr.permit.waiting.p2", { notBefore: NOT_BEFORE.toISOString() }));
    expect(lines(text)).not.toContain(copy("auth.emr.permit.waiting.p4"));
    expect(body(text)).not.toContain("https://");
    expect(body(text)).not.toContain("#");
  });
  it("the notice of the wait is refused without its instant", () => {
    expect(() => render({ ...base, event: "WAITING", cancelToken: CANCEL })).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
    expect(() => render({ ...base, event: "WAITING", notBefore: new Date(Number.NaN) })).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
  });
  it("the finish mail carries the finish link and no cancel link", () => {
    const text = render({ ...base, event: "FINISH", finishToken: FINISH });
    expect(text).toContain(`\r\nSubject: ${copy("auth.emr.permit.finish.subject")}\r\n`);
    expect(lines(text)).toContain(link("finish", FINISH));
    expect(lines(text)).toContain(copy("auth.emr.permit.finish.p3", { expiry: EXPIRES.toISOString() }));
    expect(body(text)).not.toContain("#cancel=");
    expect(body(text).match(/https:\/\//gu)).toHaveLength(1);
    expect(() => render({ ...base, event: "FINISH" })).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
  });
  it.each([["REFUSED", "refused"], ["CANCELLED", "cancelled"]] as const)("the %s mail is one statement with no link and no token", (event, name) => {
    const text = render({ ...base, event });
    expect(text).toContain(`\r\nSubject: ${copy(`auth.emr.permit.${name}.subject`)}\r\n`);
    expect(lines(text)).toContain(copy(`auth.emr.permit.${name}.statement`));
    expect(body(text)).not.toContain("https://");
    expect(body(text)).not.toContain("#");
  });
});

describe("what a mail may carry", () => {
  it.each([
    ["a finish link on the notice of the wait", { event: "WAITING", notBefore: NOT_BEFORE, finishToken: FINISH }],
    ["the mailbox link on the notice of the wait", { event: "WAITING", notBefore: NOT_BEFORE, token: TOKEN }],
    ["a link on a refusal", { event: "REFUSED", token: TOKEN }],
    ["a cancel link on a refusal", { event: "REFUSED", cancelToken: CANCEL }],
    ["a cancel link on a cancellation", { event: "CANCELLED", cancelToken: CANCEL }],
    ["a cancel link on the finish mail", { event: "FINISH", finishToken: FINISH, cancelToken: CANCEL }],
    ["an instant on the mailbox link", { event: "PROOF", token: TOKEN, cancelToken: CANCEL, notBefore: NOT_BEFORE }],
    ["a finish link on the mailbox link", { event: "PROOF", token: TOKEN, cancelToken: CANCEL, finishToken: FINISH }],
    ["a field nobody names", { event: "REFUSED", amount: 1 }]
  ])("%s is refused", (_name, fields) => {
    expect(() => render({ ...base, ...fields })).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
  });
  it.each(["STARTED", "VERIFIED", "COMPLETED", "UNKNOWN"])("the event %s is not one of this flow's and is refused", (event) => {
    expect(() => render({ ...base, event })).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
  });
});

describe("every language has every sentence", () => {
  const root = join(import.meta.dirname, "../../packages/mail-templates/messages");
  const permitKeys = (locale: string) => {
    const catalogue = JSON.parse(readFileSync(join(root, locale, "mail.json"), "utf8")) as Record<string, unknown>;
    return new Map(Object.entries(catalogue).filter(([key]) => key.startsWith("auth.emr.permit.")));
  };
  const english = permitKeys("en");
  it("English names each sentence the renderer reads", () => {
    for (const event of ["proof", "waiting", "finish"]) expect(english.has(`auth.emr.permit.${event}.subject`)).toBe(true);
    for (const key of ["auth.emr.permit.refused.statement", "auth.emr.permit.cancelled.statement", "auth.emr.permit.proof.p6", "auth.emr.permit.waiting.p6", "auth.emr.permit.finish.p5"])
      expect(english.has(key), key).toBe(true);
  });
  it.each(readdirSync(root).filter((locale) => locale !== "en"))("%s has every auth.emr.permit key English has, each a sentence with the same placeholders", (locale) => {
    const keys = permitKeys(locale);
    expect([...keys.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, value] of keys) {
      expect(typeof value === "string" && value.trim().length > 0, `${locale} ${key}`).toBe(true);
      const holes = (text: unknown) => String(text).match(/\{[A-Za-z]+\}/gu)?.sort() ?? [];
      expect(holes(value), `${locale} ${key}`).toEqual(holes(english.get(key)));
    }
  });
});

describe("the notice worker for this flow", () => {
  const USER = "22222222-2222-4222-8222-222222222222", CHANNEL = "33333333-3333-4333-8333-333333333333", KEY = Buffer.alloc(32, 9);
  const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
  type Event = "PROOF" | "WAITING" | "FINISH" | "REFUSED" | "CANCELLED";
  /** One claimed notice, sealed under `sealedFor`'s address-bound AAD, through a worker of the Owner's permit. */
  async function deliver(event: Event, payload: Record<string, unknown>, extra: Record<string, unknown> = {}, sealedFor: "recovery_permit" | "mfa_recovery" = "recovery_permit") {
    const sent: EmailRecoveryMail[] = [], diagnostics: string[] = [];
    const notice = { noticeId: base.messageId, leaseId: "44444444-4444-4444-8444-444444444444", userId: USER, channelId: CHANNEL, event,
      payload: encrypt(KEY, Buffer.from(JSON.stringify(payload)), emailRecoveryNoticeAad(sealedFor, USER, CHANNEL)), expiresAt: EXPIRES.toISOString(), mailLocale: "en", ...extra };
    let claimed = false;
    const repository = { expire: vi.fn(async () => 0), claimNotice: vi.fn(async () => { if (claimed) return null; claimed = true; return notice as never; }), finishNotice: vi.fn(async () => true) };
    const worker = new EmailRecoveryNotificationWorker({ flow: "recovery_permit", repository, users: { load: async () => Buffer.from(KEY) } as never,
      sender: { send: async (mail) => { sent.push(mail); } }, authPolicy, reportDiagnostic: (code) => { diagnostics.push(code); }, dispatch: async (prepare) => { await (await prepare())?.(); } });
    await worker.reconcile(5);
    return { sent, diagnostics, finished: repository.finishNotice.mock.calls };
  }
  it("turns each of the five events into its mail, with exactly its own links", async () => {
    const cases: [Event, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>][] = [
      ["PROOF", { recipient: "main@example.test", token: TOKEN, cancelToken: CANCEL }, {}, { token: TOKEN, cancelToken: CANCEL }],
      ["WAITING", { recipient: "main@example.test", cancelToken: CANCEL }, { cancelAllowed: true, notBefore: NOT_BEFORE.toISOString() }, { cancelToken: CANCEL, notBefore: NOT_BEFORE }],
      ["FINISH", { recipient: "main@example.test", finishToken: FINISH }, {}, { finishToken: FINISH }],
      ["REFUSED", { recipient: "main@example.test" }, {}, {}],
      ["CANCELLED", { recipient: "main@example.test" }, {}, {}]
    ];
    for (const [event, payload, extra, carried] of cases) {
      const { sent, diagnostics, finished } = await deliver(event, payload, extra);
      expect(sent, event).toEqual([{ flow: "recovery_permit", messageId: base.messageId, event, recipient: "main@example.test", expiresAt: EXPIRES, mailLocale: "en", ...carried }]);
      expect(diagnostics, event).toEqual([]);
      expect(finished.map((call) => call[2]), event).toEqual([true]);
      // What the worker hands on renders, and a link in it goes to /recover/help.
      const text = render({ ...sent[0]! });
      for (const [kind, value] of [["token", TOKEN], ["cancel", CANCEL], ["finish", FINISH]] as const)
        expect(lines(text).includes(link(kind, value)), `${event} ${kind}`).toBe(Object.values(carried).includes(value));
    }
  });
  it("sends the notice of the wait without a link to an address that may not cancel", async () => {
    const { sent } = await deliver("WAITING", { recipient: "backup@example.test" }, { cancelAllowed: false, notBefore: NOT_BEFORE.toISOString() });
    expect(sent).toEqual([expect.objectContaining({ event: "WAITING", recipient: "backup@example.test", notBefore: NOT_BEFORE })]);
    expect(sent[0]).not.toHaveProperty("cancelToken");
  });
  it.each([
    ["a link on a refusal", "REFUSED", { recipient: "main@example.test", token: TOKEN }, {}],
    ["a finish link on the notice of the wait", "WAITING", { recipient: "main@example.test", cancelToken: CANCEL, finishToken: FINISH }, { cancelAllowed: true, notBefore: NOT_BEFORE.toISOString() }],
    ["a cancel link where the address may not cancel", "WAITING", { recipient: "main@example.test", cancelToken: CANCEL }, { cancelAllowed: false, notBefore: NOT_BEFORE.toISOString() }],
    ["the mailbox link without its cancel link", "PROOF", { recipient: "main@example.test", token: TOKEN }, {}],
    ["a cancel link on the finish mail", "FINISH", { recipient: "main@example.test", finishToken: FINISH, cancelToken: CANCEL }, {}],
    ["a key nobody names", "CANCELLED", { recipient: "main@example.test", note: "x" }, {}]
  ] as const)("sends nothing for a payload with an unexpected key (%s), and hands the notice back unsent", async (_name, event, payload, extra) => {
    const { sent, diagnostics, finished } = await deliver(event, payload, extra);
    expect(sent).toEqual([]);
    expect(diagnostics).toEqual(["EMAIL_RECOVERY_NOTICE_PENDING"]);
    expect(finished.map((call) => call[2])).toEqual([false]);
  });
  it("sends nothing for a payload sealed for another flow", async () => {
    const { sent, finished } = await deliver("REFUSED", { recipient: "main@example.test" }, {}, "mfa_recovery");
    expect(sent).toEqual([]);
    expect(finished.map((call) => call[2])).toEqual([false]);
  });
});
