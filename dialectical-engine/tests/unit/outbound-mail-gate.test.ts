import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createEmailBlindIndex } from "@debateai/crypto";
import { MAIL_TEMPLATES, MAIL_TEMPLATE_IDS, renderMail } from "@debateai/mail-templates";
import {
  OUTBOUND_MAIL_POLICY_DEPLOYMENT_REGISTER_ROW,
  outboundMailPolicyFromValue,
  settingsRowKind
} from "@debateai/register";
import { hostedRegisterRefusalCode, parseHostedRegisterFile, planHostedRegisterPublication } from "../../apps/runner/src/hosted-register-publish.js";
import {
  OutboundMailGate,
  OutboundMailRefusal,
  mailPurposeClass,
  outboundMailReport,
  type MailPurpose,
  type MailSuppressionList,
  type OutboundMailGateEvent,
  type OutboundMailLedger
} from "../../apps/api/src/outbound-mail-gate.js";
import {
  SendmailConsumerAccountSender,
  SendmailEmailChangeMailSender,
  SendmailMailSender,
  SendmailRecoveryEmailMailSender,
  SendmailSecurityNotificationSender,
  TemplatedMailSender
} from "../../apps/api/src/mail-channel.js";
import { SendmailPasswordResetSender } from "../../apps/api/src/password-reset-mail.js";
import { SendmailEmailRecoverySender } from "../../apps/api/src/email-mfa-mail.js";
import { MemoryOutboundMailStore } from "../support/outboundMailGate.js";

const KEY = Buffer.alloc(32, 0x5a);
const policy = (dailyLimit: number, reservedForSecurityPct = 20, alertAtPct = 50) => ({ dailyLimit, reservedForSecurityPct, alertAtPct });

function harness(options: { limit?: number; reserved?: number; alertAt?: number; ledger?: OutboundMailLedger; suppression?: MailSuppressionList } = {}) {
  const store = new MemoryOutboundMailStore();
  const events: OutboundMailGateEvent[] = [];
  const gate = new OutboundMailGate({
    policy: policy(options.limit ?? 10, options.reserved ?? 20, options.alertAt ?? 50),
    blindIndexKey: KEY,
    ledger: options.ledger ?? store,
    suppression: options.suppression ?? store,
    report: (event) => { events.push(event); },
    now: () => new Date("2026-11-01T10:00:00Z")
  });
  return { gate, store, events };
}

const outcome = (promise: Promise<boolean>) => promise.then((go) => go ? "SEND" : "SKIP", (error: unknown) => error instanceof OutboundMailRefusal ? error.code : `OTHER:${String(error)}`);
const alerts = (events: readonly OutboundMailGateEvent[]) => events.flatMap((event) => event.kind === "alert" ? [event.alert] : []);

describe("the outbound mail gate", () => {
  it("classes every purpose: the reserve covers resets, recovery, security notices, billing and alerts to staff", () => {
    const security: MailPurpose[] = ["billing", "email-change-notice", "account-erasure-notice", "consumer-recovery", "consumer-security-notice", "password-reset", "email-recovery", "owner-notice", "threat-report-alert"];
    const standard: MailPurpose[] = ["verification", "recovery-email-confirmation", "email-change-confirmation", "email-change-unavailable", "data-export"];
    for (const purpose of security) expect(mailPurposeClass(purpose)).toBe("security");
    for (const purpose of standard) expect(mailPurposeClass(purpose)).toBe("standard");
    expect(mailPurposeClass("owner-limit-alert")).toBe("unmetered");
    expect(() => mailPurposeClass("staff-alert" as MailPurpose)).toThrow("MAIL_PURPOSE_UNKNOWN");
  });

  it("asks the address rule first: a malformed address is refused and counts nothing", async () => {
    const h = harness();
    for (const recipient of ["person@localhost", "a@example.com,b@example.com", "pérson@example.com", "a@example.com\r\nBcc: x@example.org"]) {
      expect(await outcome(h.gate.authorize({ recipient, purpose: "verification" }))).toBe("MAIL_INPUT_INVALID");
    }
    expect(h.store.sum(h.store.day)).toBe(0);
  });

  it("drops a suppressed address without a send and without counting: its worker must not retry for ever", async () => {
    const h = harness();
    h.store.suppress(createEmailBlindIndex(KEY, "Bounced@Example.com"));
    // The digest is of the normalised address: case does not slip past it.
    expect(await outcome(h.gate.authorize({ recipient: "bounced@example.com", purpose: "password-reset" }))).toBe("SKIP");
    expect(await outcome(h.gate.authorize({ recipient: "BOUNCED@EXAMPLE.COM", purpose: "verification" }))).toBe("SKIP");
    expect(h.store.sum(h.store.day)).toBe(0);
    expect(await outcome(h.gate.authorize({ recipient: "other@example.com", purpose: "verification" }))).toBe("SEND");
    expect(h.events).toContainEqual({ kind: "refused", code: "RECIPIENT_SUPPRESSED", purpose: "password-reset", purposeClass: "security" });
  });

  it("the suppression list only ever sees a 32-byte keyed digest, never the address", async () => {
    const seen: Buffer[] = [];
    const h = harness({ suppression: { isSuppressed: async (digest) => { seen.push(Buffer.from(digest)); return false; } } });
    await h.gate.authorize({ recipient: "hidden.person@example.com", purpose: "verification" });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.byteLength).toBe(32);
    expect(seen[0]!.toString("latin1")).not.toContain("hidden");
    expect(seen[0]).toEqual(createEmailBlindIndex(KEY, "hidden.person@example.com"));
  });

  it("stops standard mail at the limit minus the reserve, and security mail at the limit", async () => {
    const h = harness({ limit: 10, reserved: 20 });
    for (let i = 0; i < 8; i += 1) expect(await outcome(h.gate.authorize({ recipient: `p${i}@example.com`, purpose: "verification" }))).toBe("SEND");
    expect(await h.gate.hasStandardRoom()).toBe(false);
    expect(await outcome(h.gate.authorize({ recipient: "late@example.com", purpose: "verification" }))).toBe("MAIL_DAILY_LIMIT");
    expect(await outcome(h.gate.authorize({ recipient: "late@example.com", purpose: "data-export" }))).toBe("MAIL_DAILY_LIMIT");
    expect(await outcome(h.gate.authorize({ recipient: "reset1@example.com", purpose: "password-reset" }))).toBe("SEND");
    expect(await outcome(h.gate.authorize({ recipient: "receipt@example.com", purpose: "billing" }))).toBe("SEND");
    expect(await outcome(h.gate.authorize({ recipient: "reset3@example.com", purpose: "password-reset" }))).toBe("MAIL_DAILY_LIMIT");
    expect([h.store.standard.get(h.store.day), h.store.security.get(h.store.day)]).toEqual([8, 2]);
  });

  it("the preview's and the live site's limits keep 20% for security mail", async () => {
    for (const [limit, standard] of [[2000, 1600], [10000, 8000]] as const) {
      const h = harness({ limit, reserved: 20 });
      h.store.standard.set(h.store.day, standard - 1);
      expect(await h.gate.hasStandardRoom()).toBe(true);
      h.store.standard.set(h.store.day, standard);
      expect(await h.gate.hasStandardRoom()).toBe(false);
      h.store.security.set(h.store.day, limit - standard - 1);
      expect(await outcome(h.gate.authorize({ recipient: "reset@example.com", purpose: "password-reset" }))).toBe("SEND");
      expect(await outcome(h.gate.authorize({ recipient: "reset@example.com", purpose: "password-reset" }))).toBe("MAIL_DAILY_LIMIT");
    }
  });

  it("alerts once at half the limit and once at each stop, with counts and codes only", async () => {
    const h = harness({ limit: 10, reserved: 20, alertAt: 50 });
    for (let i = 0; i < 4; i += 1) await h.gate.authorize({ recipient: `p${i}@example.com`, purpose: "verification" });
    expect(h.events).toEqual([]);
    await h.gate.authorize({ recipient: "p4@example.com", purpose: "verification" });
    expect(h.events).toEqual([{ kind: "alert", alert: "ALERT_SHARE", day: h.store.day, total: 5, dailyLimit: 10 }]);
    for (let i = 5; i < 12; i += 1) await outcome(h.gate.authorize({ recipient: `p${i}@example.com`, purpose: "verification" }));
    for (let i = 0; i < 5; i += 1) await outcome(h.gate.authorize({ recipient: `s${i}@example.com`, purpose: "password-reset" }));
    expect(alerts(h.events)).toEqual(["ALERT_SHARE", "STANDARD_LIMIT", "DAILY_LIMIT"]);
    h.store.day = "2026-11-02";
    for (let i = 0; i < 5; i += 1) await h.gate.authorize({ recipient: `n${i}@example.com`, purpose: "verification" });
    expect(h.events.at(-1)).toMatchObject({ alert: "ALERT_SHARE", day: "2026-11-02" });
  });

  it("alerts the owner when sign-up stops at the pre-check, where no send reaches authorize", async () => {
    const h = harness({ limit: 10, reserved: 20, alertAt: 100 });
    h.store.standard.set(h.store.day, 8);
    expect(await h.gate.hasStandardRoom()).toBe(false);
    expect(await h.gate.hasStandardRoom()).toBe(false);
    expect(h.events).toEqual([{ kind: "alert", alert: "STANDARD_LIMIT", day: h.store.day, total: 8, dailyLimit: 10 }]);
  });

  it("of two API copies only the one that takes the alert reports it", async () => {
    const shared = new MemoryOutboundMailStore();
    shared.standard.set(shared.day, 8);
    const one = harness({ ledger: shared, suppression: shared, alertAt: 100 });
    const two = harness({ ledger: shared, suppression: shared, alertAt: 100 });
    await Promise.all([one.gate.hasStandardRoom(), two.gate.hasStandardRoom()]);
    expect(alerts([...one.events, ...two.events])).toEqual(["STANDARD_LIMIT"]);
  });

  it("an alert whose claim could not be read is asked again by the next mail, and never decides the send", async () => {
    const store = new MemoryOutboundMailStore();
    let broken = true;
    const ledger: OutboundMailLedger = { reserve: (r) => store.reserve(r), today: () => store.today(),
      claimAlert: async (kind, day) => { if (broken) throw new Error("down"); return store.claimAlert(kind, day); } };
    const h = harness({ ledger, suppression: store, limit: 10, alertAt: 10 });
    expect(await outcome(h.gate.authorize({ recipient: "a@example.com", purpose: "verification" }))).toBe("SEND");
    expect(h.events).toEqual([]);
    broken = false;
    expect(await outcome(h.gate.authorize({ recipient: "b@example.com", purpose: "verification" }))).toBe("SEND");
    expect(alerts(h.events)).toEqual(["ALERT_SHARE"]);
  });

  it("a count that cannot be read refuses the mail and rejects the sign-up question", async () => {
    const store = new MemoryOutboundMailStore();
    const ledger: OutboundMailLedger = { reserve: async () => { throw new Error("down"); }, today: async () => { throw new Error("down"); }, claimAlert: async () => false };
    const h = harness({ ledger, suppression: store });
    expect(await outcome(h.gate.authorize({ recipient: "a@example.com", purpose: "password-reset" }))).toBe("OTHER:Error: down");
    await expect(h.gate.hasStandardRoom()).rejects.toThrow("down");
    expect(h.events).toContainEqual({ kind: "refused", code: "OUTBOUND_MAIL_GATE_UNAVAILABLE", purpose: "password-reset", purposeClass: "security" });
    const brokenList = harness({ suppression: { isSuppressed: async () => { throw new Error("down"); } } });
    expect(await outcome(brokenList.gate.authorize({ recipient: "a@example.com", purpose: "verification" }))).toBe("OTHER:Error: down");
  });

  it("the owner's limit alert passes at the limit, uncounted and unsuppressed; a broken address does not", async () => {
    const h = harness({ limit: 10 });
    h.store.standard.set(h.store.day, 10);
    h.store.suppress(createEmailBlindIndex(KEY, "owner@example.com"));
    expect(await outcome(h.gate.authorize({ recipient: "owner@example.com", purpose: "owner-limit-alert" }))).toBe("SEND");
    expect(h.store.sum(h.store.day)).toBe(10);
    expect(await outcome(h.gate.authorize({ recipient: "owner@localhost", purpose: "owner-limit-alert" }))).toBe("MAIL_INPUT_INVALID");
  });

  it("never puts an address or a digest into a refusal, an event or a log line", async () => {
    const h = harness({ limit: 1, reserved: 0 });
    h.store.suppress(createEmailBlindIndex(KEY, "suppressed.person@example.com"));
    const sent: unknown[] = [];
    const lines: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
    try {
      const refusals: unknown[] = [];
      for (const recipient of ["broken.person@localhost", "suppressed.person@example.com", "first.person@example.com", "second.person@example.com"]) {
        await h.gate.authorize({ recipient, purpose: "verification" }).catch((error: unknown) => { refusals.push(error); });
      }
      const report = outboundMailReport({ ownerAddress: undefined, mail: { sendTemplated: async (mail) => { sent.push(mail); } } });
      for (const event of h.events) report(event);
      expect(refusals.map((error) => (error as OutboundMailRefusal).code)).toEqual(["MAIL_INPUT_INVALID", "MAIL_DAILY_LIMIT"]);
      const everything = JSON.stringify([refusals.map((error) => ({ ...(error as object), message: (error as Error).message, stack: (error as Error).stack })), h.events, lines]);
      for (const fragment of ["person", "localhost", "example.com", createEmailBlindIndex(KEY, "suppressed.person@example.com").toString("hex")]) {
        expect(everything).not.toContain(fragment);
      }
      expect(sent).toEqual([]);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(line).toMatch(/^\[OUTBOUND_MAIL_(REFUSED|ALERT)\] [a-z]+=[A-Z_]+ /);
    } finally { console.error = realError; }
  });

  it("a failing report never decides a send", async () => {
    const store = new MemoryOutboundMailStore();
    const gate = new OutboundMailGate({ policy: policy(2, 0, 50), blindIndexKey: KEY, ledger: store, suppression: store, report: () => { throw new Error("log down"); } });
    expect(await outcome(gate.authorize({ recipient: "a@example.com", purpose: "verification" }))).toBe("SEND");
    expect(await outcome(gate.authorize({ recipient: "b@example.com", purpose: "verification" }))).toBe("SEND");
    expect(await outcome(gate.authorize({ recipient: "c@example.com", purpose: "verification" }))).toBe("MAIL_DAILY_LIMIT");
  });

  it("refuses a malformed configuration", () => {
    const store = new MemoryOutboundMailStore();
    for (const bad of [policy(0), policy(1.5), policy(10, -1), policy(10, 91), policy(1, 20), policy(10, 20, 0), policy(10, 20, 101)]) {
      expect(() => new OutboundMailGate({ policy: bad, blindIndexKey: KEY, ledger: store, suppression: store, report: () => undefined }))
        .toThrow("OUTBOUND_MAIL_GATE_CONFIGURATION_INVALID");
    }
    expect(() => new OutboundMailGate({ policy: policy(10), blindIndexKey: new Uint8Array(), ledger: store, suppression: store, report: () => undefined }))
      .toThrow("OUTBOUND_MAIL_GATE_CONFIGURATION_INVALID");
  });
});

describe("the alert to the owner", () => {
  const event = { kind: "alert", alert: "DAILY_LIMIT", day: "2026-11-01", total: 2000, dailyLimit: 2000 } as const;

  it("mails the owner's address the fixed template with counts only", async () => {
    const sent: { to: string; templateId: string; params: Record<string, string> }[] = [];
    const realError = console.error;
    console.error = () => undefined;
    try {
      outboundMailReport({ ownerAddress: "boss@example.test", mail: { sendTemplated: async (mail) => { sent.push(mail); } } })(event);
    } finally { console.error = realError; }
    expect(sent).toEqual([{ to: "boss@example.test", templateId: "OUTBOUND_MAIL_ALL_STOPPED", locale: "en", params: { day: "2026-11-01", total: "2000", limit: "2000" } }]);
  });

  it("a mail that fails leaves its own line", async () => {
    const lines: string[] = [];
    const realError = console.error;
    console.error = (line: string) => { lines.push(line); };
    try {
      outboundMailReport({ ownerAddress: "boss@example.test", mail: { sendTemplated: async () => { throw new Error("down"); } } })(event);
      await new Promise((resolve) => { setImmediate(resolve); });
    } finally { console.error = realError; }
    expect(lines).toEqual(["[OUTBOUND_MAIL_ALERT] alert=DAILY_LIMIT day=2026-11-01 total=2000 limit=2000", "[OUTBOUND_MAIL_ALERT_MAIL_FAILED] alert=DAILY_LIMIT day=2026-11-01"]);
  });

  it.each(["OUTBOUND_MAIL_SHARE", "OUTBOUND_MAIL_SIGN_UP_STOPPED", "OUTBOUND_MAIL_ALL_STOPPED"] as const)("%s renders in plain words", (id) => {
    expect(MAIL_TEMPLATE_IDS).toContain(id);
    expect(MAIL_TEMPLATES[id].catalogue).toBe("owner");
    const rendered = renderMail(id, "en", { day: "2026-11-01", total: "1000", limit: "2000" }, { attached: {} } as never);
    expect(rendered.text).toContain("Mails sent: 1000. Daily limit: 2000.");
    expect(`${rendered.subject} ${rendered.text}`).not.toMatch(/OUTBOUND_MAIL|STANDARD_LIMIT|ALERT_SHARE/);
  });
});

describe("the outboundMailPolicy register row", () => {
  it("is code-owned at the preview's values, a site setting", () => {
    const row = OUTBOUND_MAIL_POLICY_DEPLOYMENT_REGISTER_ROW;
    expect(row.rowKey).toBe("outboundMailPolicy");
    expect(outboundMailPolicyFromValue(row.value, row.sourceRef)).toEqual({ dailyLimit: 2000, reservedForSecurityPct: 20, alertAtPct: 50 });
    expect(settingsRowKind("outboundMailPolicy")).toBe("SITE");
  });

  it("is sealed by every hosted publication, and the live site's file supersedes it (10000 a day)", async () => {
    const row = OUTBOUND_MAIL_POLICY_DEPLOYMENT_REGISTER_ROW;
    const example = JSON.parse(await readFile(new URL("../../deploy/vps/register/hosted-register.example.json", import.meta.url), "utf8")) as Record<string, unknown>;
    const plan = async (file: unknown) => planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(file))));
    const sealedIn = async (file: unknown) => (await plan(file)).rows.filter((candidate) => candidate.rowKey === "outboundMailPolicy");
    expect(Object.hasOwn(example, "outboundMailPolicy")).toBe(false);
    const defaulted = await sealedIn(example);
    expect(defaulted).toHaveLength(1);
    expect(JSON.parse(defaulted[0]!.valueJsonText)).toEqual(row.value);
    const live = { kind: "OUTBOUND_MAIL_POLICY", daily_limit: 10000, reserved_for_security_pct: 20, alert_at_pct: 50 };
    const supplied = await sealedIn({ ...example, outboundMailPolicy: live });
    expect(supplied).toHaveLength(1);
    expect(JSON.parse(supplied[0]!.valueJsonText)).toEqual(live);
    const refusalOf = async (file: unknown): Promise<string> => {
      try { await plan(file); return "NO_REFUSAL"; } catch (error) { return hostedRegisterRefusalCode(error); }
    };
    expect(await refusalOf({ ...example, outboundMailPolicy: null })).toBe("OUTBOUND_MAIL_POLICY_INVALID");
    expect(await refusalOf({ ...example, outboundMailPolicy: { ...live, daily_limit: 0 } })).toBe("OUTBOUND_MAIL_POLICY_INVALID");
    expect(await refusalOf({ ...example, outboundMailPolicy: { ...live, reserved_for_security_pct: 95 } })).toBe("OUTBOUND_MAIL_POLICY_INVALID");
  });

  it("refuses anything malformed", () => {
    const value = { kind: "OUTBOUND_MAIL_POLICY", daily_limit: 10000, reserved_for_security_pct: 20, alert_at_pct: 50 };
    expect(outboundMailPolicyFromValue(value, "live")).toEqual({ dailyLimit: 10000, reservedForSecurityPct: 20, alertAtPct: 50 });
    for (const bad of [
      null, {}, { ...value, kind: "OTHER" }, { ...value, daily_limit: 0 }, { ...value, daily_limit: 1000001 }, { ...value, daily_limit: 1.5 },
      { ...value, reserved_for_security_pct: 91 }, { ...value, reserved_for_security_pct: -1 }, { ...value, alert_at_pct: 0 },
      { ...value, alert_at_pct: 101 }, { ...value, extra: true },
      { ...value, daily_limit: 1, reserved_for_security_pct: 20 }
    ]) {
      expect(() => outboundMailPolicyFromValue(bad, "live")).toThrow(expect.objectContaining({ code: "OUTBOUND_MAIL_POLICY_INVALID" }));
    }
    expect(() => outboundMailPolicyFromValue(value, "  ")).toThrow(expect.objectContaining({ code: "OUTBOUND_MAIL_POLICY_INVALID" }));
  });
});

describe("every account-mail sender asks the gate, with its purpose, before any spawn", () => {
  const recipient = "person@example.test";
  const token = "Z".repeat(43);
  const uuid = "11111111-1111-4111-8111-111111111111";
  const at = new Date("2026-11-01T12:00:00Z");
  const base = { executable: "/definitely/no/spawn", from: "noreply@dezbatere.ro", publicAppUrl: "https://dezbatere.ro", timeoutMs: 1000 };

  /** Refuses everything and remembers what it was asked; a sender that spawned first would fail SENDMAIL_EXEC_FAILED instead. */
  function refusingGate() {
    const asked: Array<Readonly<{ recipient: string; purpose: MailPurpose }>> = [];
    return {
      asked,
      gate: { authorize: async (request: Readonly<{ recipient: string; purpose: MailPurpose }>): Promise<boolean> => {
        asked.push(request);
        throw new OutboundMailRefusal("MAIL_DAILY_LIMIT", request.purpose, mailPurposeClass(request.purpose));
      } }
    };
  }

  it.each<[string, MailPurpose, (gate: never) => Promise<unknown>]>([
    ["verification", "verification", (gate) => new SendmailMailSender({ ...base, gate }).sendVerification({ attemptId: "a", recipient, token, expiresAt: at })],
    ["erasure notice", "account-erasure-notice", (gate) => new SendmailSecurityNotificationSender({ ...base, gate }).sendSecurityNotification({ messageId: uuid, recipient, eventKind: "SCHEDULED", executeAt: at, display: { locale: "en", timeZone: "UTC" } as never })],
    ["email change confirmation", "email-change-confirmation", (gate) => new SendmailEmailChangeMailSender({ ...base, gate }).sendEmailChange({ kind: "confirmation", recipient, token, expiresAt: at } as never)],
    ["email change notice", "email-change-notice", (gate) => new SendmailEmailChangeMailSender({ ...base, gate }).sendEmailChange({ kind: "notice", recipient, newEmail: "new@example.test", cancelToken: token, expiresAt: at } as never)],
    ["email change unavailable", "email-change-unavailable", (gate) => new SendmailEmailChangeMailSender({ ...base, gate }).sendEmailChange({ kind: "address-unavailable", recipient } as never)],
    ["recovery address", "recovery-email-confirmation", (gate) => new SendmailRecoveryEmailMailSender({ ...base, gate }).sendRecoveryEmail({ kind: "confirmation", recipient, token, expiresAt: at })],
    ["consumer recovery", "consumer-recovery", (gate) => new SendmailConsumerAccountSender({ ...base, gate }).sendRecovery({ recipient, token, expiresAt: at })],
    ["consumer security notice", "consumer-security-notice", (gate) => new SendmailConsumerAccountSender({ ...base, gate }).sendConsumerSecurityNotice({ recipient, messageId: uuid, eventKind: "METHOD_CHANGED", happenedAt: at })],
    ["password reset", "password-reset", (gate) => new SendmailPasswordResetSender({ ...base, gate }).send({ messageId: uuid, event: "COMPLETED", recipient, expiresAt: at } as never)],
    ["backup email / MFA recovery", "email-recovery", (gate) => new SendmailEmailRecoverySender({ ...base, gate }).send({ flow: "backup_email", messageId: uuid, event: "VERIFIED", recipient, expiresAt: at } as never)]
  ])("%s", async (_name, purpose, send) => {
    const { gate, asked } = refusingGate();
    const result = await send(gate as never).then(() => "SENT", (error: unknown) => (error as { operatorCode?: string }).operatorCode ?? String(error));
    expect(result).toBe("MAIL_DAILY_LIMIT");
    expect(asked).toEqual([{ recipient, purpose }]);
  });

  it.each([
    ["THREAT_REPORT_WAITING", {}, "threat-report-alert"],
    ["OUTBOUND_MAIL_SHARE", { day: "2026-11-01", total: "1", limit: "2" }, "owner-limit-alert"],
    ["DATA_EXPORT", { requested: "2026-11-01", expires: "2026-11-02T00:00:00Z", downloadUrl: "https://dezbatere.ro/x" }, "data-export"]
  ] as const)("the templated sender asks by template: %s", async (templateId, params, purpose) => {
    const { gate, asked } = refusingGate();
    const sender = new TemplatedMailSender({ executable: base.executable, from: base.from, timeoutMs: 1000, gate: gate as never });
    await expect(sender.sendTemplated({ to: recipient, templateId, locale: "en", params })).rejects.toMatchObject({ operatorCode: "MAIL_DAILY_LIMIT" });
    expect(asked).toEqual([{ recipient, purpose }]);
  });

  it("an input the sender refuses never reaches the gate, and a gate that breaks blocks the send", async () => {
    const { gate, asked } = refusingGate();
    await expect(new SendmailMailSender({ ...base, gate: gate as never }).sendVerification({ attemptId: "a", recipient: "person@localhost", token, expiresAt: at }))
      .rejects.toMatchObject({ operatorCode: "MAIL_INPUT_INVALID" });
    expect(asked).toEqual([]);
    const broken = { authorize: async (): Promise<boolean> => { throw new Error("database down"); } };
    await expect(new SendmailMailSender({ ...base, gate: broken }).sendVerification({ attemptId: "a", recipient, token, expiresAt: at }))
      .rejects.toMatchObject({ operatorCode: "OUTBOUND_MAIL_GATE_UNAVAILABLE" });
  });

  it("an admitted mail goes on to the spawn, and a suppressed one resolves without it (control: the stub path really is reached)", async () => {
    await expect(new SendmailMailSender({ ...base, gate: { authorize: async () => true } }).sendVerification({ attemptId: "a", recipient, token, expiresAt: at }))
      .rejects.toMatchObject({ operatorCode: "SENDMAIL_EXEC_FAILED" });
    await expect(new SendmailMailSender({ ...base, gate: { authorize: async () => false } }).sendVerification({ attemptId: "a", recipient, token, expiresAt: at }))
      .resolves.toBeUndefined();
  });
});
