import { describe, expect, it } from "vitest";
import { createEmailBlindIndex } from "@debateai/crypto";
import {
  InMemoryOutboundMailStore,
  OutboundMailGate,
  OutboundMailRefusal,
  consoleOutboundMailReport,
  mailPurposeClass,
  type MailPurpose,
  type OutboundMailGateEvent,
  type OutboundMailLedger,
  type MailSuppressionList
} from "../../apps/api/src/outbound-mail-gate.js";
import { readFile } from "node:fs/promises";
import {
  OUTBOUND_MAIL_POLICY_DEPLOYMENT_REGISTER_ROW,
  outboundMailPolicyFromValue
} from "@debateai/register";
import { hostedRegisterRefusalCode, parseHostedRegisterFile, planHostedRegisterPublication } from "../../apps/runner/src/hosted-register-publish.js";
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

const KEY = Buffer.alloc(32, 0x5a);
const policy = (dailyCap: number, reservedForSecurityPct = 20, alertAtPct = 50) => ({ dailyCap, reservedForSecurityPct, alertAtPct });

function harness(options: { cap?: number; reserved?: number; alertAt?: number; now?: () => Date; ledger?: OutboundMailLedger; suppression?: MailSuppressionList } = {}) {
  const store = new InMemoryOutboundMailStore();
  const events: OutboundMailGateEvent[] = [];
  let clock = new Date("2026-10-09T10:00:00Z");
  const gate = new OutboundMailGate({
    policy: policy(options.cap ?? 10, options.reserved ?? 20, options.alertAt ?? 50),
    blindIndexKey: KEY,
    ledger: options.ledger ?? store,
    suppression: options.suppression ?? store,
    report: (event) => { events.push(event); },
    now: options.now ?? (() => clock)
  });
  return { gate, store, events, setClock: (value: Date) => { clock = value; } };
}

const code = (promise: Promise<unknown>) => promise.then(() => "SENT", (error: unknown) => error instanceof OutboundMailRefusal ? error.code : `OTHER:${String(error)}`);

describe("the outbound mail gate", () => {
  it("classes every purpose; the security reserve covers resets, recovery and security notices", () => {
    const security: MailPurpose[] = ["email-change-notice", "account-erasure-notice", "consumer-recovery", "consumer-security-notice", "password-reset", "email-recovery"];
    const standard: MailPurpose[] = ["verification", "recovery-email-confirmation", "email-change-confirmation", "email-change-unavailable", "templated"];
    for (const purpose of security) expect(mailPurposeClass(purpose)).toBe("security");
    for (const purpose of standard) expect(mailPurposeClass(purpose)).toBe("standard");
    expect(() => mailPurposeClass("staff-alert" as MailPurpose)).toThrow("MAIL_PURPOSE_UNKNOWN");
  });

  it("asks the address rule first: a malformed address is refused and counts nothing", async () => {
    const h = harness();
    for (const recipient of ["person@localhost", "a@example.com,b@example.com", "pérson@example.com", "a@example.com\r\nBcc: x@example.org"]) {
      expect(await code(h.gate.authorize({ recipient, purpose: "verification" }))).toBe("MAIL_INPUT_INVALID");
    }
    expect(await h.store.total("2026-10-09")).toBe(0);
  });

  it("asks the suppression list second, by keyed digest only, before any budget is spent", async () => {
    const h = harness();
    h.store.suppress(createEmailBlindIndex(KEY, "Bounced@Example.com"));
    // The digest is of the normalised address: case does not slip past it.
    expect(await code(h.gate.authorize({ recipient: "bounced@example.com", purpose: "password-reset" }))).toBe("RECIPIENT_SUPPRESSED");
    expect(await code(h.gate.authorize({ recipient: "BOUNCED@EXAMPLE.COM", purpose: "verification" }))).toBe("RECIPIENT_SUPPRESSED");
    expect(await h.store.total("2026-10-09")).toBe(0);
    expect(await code(h.gate.authorize({ recipient: "other@example.com", purpose: "verification" }))).toBe("SENT");
  });

  it("the suppression list only ever sees a 32-byte digest, never the address", async () => {
    const seen: unknown[] = [];
    const h = harness({ suppression: { isSuppressed: async (index) => { seen.push(Buffer.from(index)); return false; } } });
    await h.gate.authorize({ recipient: "secret.person@example.com", purpose: "verification" });
    expect(seen).toHaveLength(1);
    expect(Buffer.isBuffer(seen[0])).toBe(true);
    expect((seen[0] as Buffer).byteLength).toBe(32);
    expect((seen[0] as Buffer).toString("latin1")).not.toContain("secret");
    expect(seen[0]).toEqual(createEmailBlindIndex(KEY, "secret.person@example.com"));
  });

  it("stops standard mail at the cap minus the security reserve, and security mail at the cap", async () => {
    const h = harness({ cap: 10, reserved: 20 });
    for (let i = 0; i < 8; i += 1) expect(await code(h.gate.authorize({ recipient: `p${i}@example.com`, purpose: "verification" }))).toBe("SENT");
    expect(await h.gate.hasCapacity("standard")).toBe(false);
    expect(await h.gate.hasCapacity("security")).toBe(true);
    expect(await code(h.gate.authorize({ recipient: "late@example.com", purpose: "verification" }))).toBe("MAIL_DAILY_LIMIT");
    expect(await code(h.gate.authorize({ recipient: "late@example.com", purpose: "templated" }))).toBe("MAIL_DAILY_LIMIT");
    expect(await code(h.gate.authorize({ recipient: "reset1@example.com", purpose: "password-reset" }))).toBe("SENT");
    expect(await code(h.gate.authorize({ recipient: "reset2@example.com", purpose: "consumer-security-notice" }))).toBe("SENT");
    expect(await code(h.gate.authorize({ recipient: "reset3@example.com", purpose: "password-reset" }))).toBe("MAIL_DAILY_LIMIT");
    expect(await h.gate.hasCapacity("security")).toBe(false);
    expect(h.store.counts("2026-10-09")).toEqual({ standard: 8, security: 2 });
    expect(await h.store.total("2026-10-09")).toBe(10);
  });

  it("a refused send counts nothing; the counter never passes the cap under a burst", async () => {
    const h = harness({ cap: 5, reserved: 0 });
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => code(h.gate.authorize({ recipient: `burst${i}@example.com`, purpose: "verification" }))));
    expect(results.filter((value) => value === "SENT")).toHaveLength(5);
    expect(results.filter((value) => value === "MAIL_DAILY_LIMIT")).toHaveLength(45);
    expect(await h.store.total("2026-10-09")).toBe(5);
  });

  it("starts a new count at UTC midnight", async () => {
    const h = harness({ cap: 1, reserved: 0 });
    h.setClock(new Date("2026-10-09T23:59:59.999Z"));
    expect(await code(h.gate.authorize({ recipient: "a@example.com", purpose: "verification" }))).toBe("SENT");
    expect(await code(h.gate.authorize({ recipient: "b@example.com", purpose: "verification" }))).toBe("MAIL_DAILY_LIMIT");
    h.setClock(new Date("2026-10-10T00:00:00.000Z"));
    expect(await h.gate.hasCapacity("standard")).toBe(true);
    expect(await code(h.gate.authorize({ recipient: "b@example.com", purpose: "verification" }))).toBe("SENT");
    expect(await h.store.total("2026-10-09")).toBe(0);
    expect(await h.store.total("2026-10-10")).toBe(1);
  });

  it("alerts once a day at the threshold and once at each cap, with counts and codes only", async () => {
    const h = harness({ cap: 10, reserved: 20, alertAt: 50 });
    for (let i = 0; i < 4; i += 1) await h.gate.authorize({ recipient: `p${i}@example.com`, purpose: "verification" });
    expect(h.events).toEqual([]);
    await h.gate.authorize({ recipient: "p4@example.com", purpose: "verification" });
    expect(h.events).toEqual([{ kind: "alert", code: "OUTBOUND_MAIL_DAILY_THRESHOLD", day: "2026-10-09", total: 5, dailyCap: 10 }]);
    for (let i = 5; i < 12; i += 1) await code(h.gate.authorize({ recipient: `p${i}@example.com`, purpose: "verification" }));
    for (let i = 0; i < 5; i += 1) await code(h.gate.authorize({ recipient: `s${i}@example.com`, purpose: "password-reset" }));
    expect(h.events.map((event) => event.code)).toEqual([
      "OUTBOUND_MAIL_DAILY_THRESHOLD",
      "OUTBOUND_MAIL_STANDARD_CAP_REACHED",
      "MAIL_DAILY_LIMIT",
      "OUTBOUND_MAIL_DAILY_CAP_REACHED",
      "MAIL_DAILY_LIMIT"
    ]);
    expect(h.events.filter((event) => event.kind === "refused")).toEqual([
      { kind: "refused", code: "MAIL_DAILY_LIMIT", purpose: "verification", purposeClass: "standard" },
      { kind: "refused", code: "MAIL_DAILY_LIMIT", purpose: "password-reset", purposeClass: "security" }
    ]);
    h.setClock(new Date("2026-10-10T08:00:00Z"));
    for (let i = 0; i < 5; i += 1) await h.gate.authorize({ recipient: `n${i}@example.com`, purpose: "verification" });
    expect(h.events.at(-1)).toMatchObject({ code: "OUTBOUND_MAIL_DAILY_THRESHOLD", day: "2026-10-10" });
  });

  it("alerts the owner when sign-up stops at the pre-check, where no send reaches authorize", async () => {
    const h = harness({ cap: 10, reserved: 20, alertAt: 100 });
    for (let i = 0; i < 8; i += 1) await h.gate.authorize({ recipient: `p${i}@example.com`, purpose: "verification" });
    expect(h.events).toEqual([]);
    expect(await h.gate.hasCapacity("standard")).toBe(false);
    expect(await h.gate.hasCapacity("standard")).toBe(false);
    expect(h.events).toEqual([{ kind: "alert", code: "OUTBOUND_MAIL_STANDARD_CAP_REACHED", day: "2026-10-09", total: 8, dailyCap: 10 }]);
  });

  it("a call still carrying yesterday counts on today, never wiping today's count", async () => {
    const store = new InMemoryOutboundMailStore();
    await store.reserve({ day: "2026-10-10", purposeClass: "standard", ceiling: 10 });
    await store.reserve({ day: "2026-10-09", purposeClass: "standard", ceiling: 10 });
    expect(await store.total("2026-10-10")).toBe(2);
    await store.reserve({ day: "2026-10-11", purposeClass: "security", ceiling: 10 });
    expect(await store.total("2026-10-11")).toBe(1);
  });

  it("never puts an address into a refusal, an event or a log line", async () => {
    const h = harness({ cap: 1, reserved: 0 });
    h.store.suppress(createEmailBlindIndex(KEY, "suppressed.person@example.com"));
    const lines: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
    try {
      const refusals: unknown[] = [];
      for (const recipient of ["broken.person@localhost", "suppressed.person@example.com", "first.person@example.com", "second.person@example.com"]) {
        await h.gate.authorize({ recipient, purpose: "verification" }).catch((error: unknown) => { refusals.push(error); });
      }
      for (const event of h.events) consoleOutboundMailReport(event);
      expect(refusals.map((error) => (error as OutboundMailRefusal).code)).toEqual(["MAIL_INPUT_INVALID", "RECIPIENT_SUPPRESSED", "MAIL_DAILY_LIMIT"]);
      const everything = JSON.stringify([refusals.map((error) => ({ ...(error as object), message: (error as Error).message, stack: (error as Error).stack })), h.events, lines]);
      for (const fragment of ["person", "localhost", "example.com", createEmailBlindIndex(KEY, "suppressed.person@example.com").toString("hex")]) {
        expect(everything).not.toContain(fragment);
      }
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(line).toMatch(/^\[OUTBOUND_MAIL_(REFUSED|ALERT)\] code=[A-Z_]+ /);
    } finally { console.error = realError; }
  });

  it("a failing report never decides a send", async () => {
    const store = new InMemoryOutboundMailStore();
    const gate = new OutboundMailGate({ policy: policy(2, 0, 50), blindIndexKey: KEY, ledger: store, suppression: store, report: () => { throw new Error("log down"); } });
    expect(await code(gate.authorize({ recipient: "a@example.com", purpose: "verification" }))).toBe("SENT");
    expect(await code(gate.authorize({ recipient: "b@example.com", purpose: "verification" }))).toBe("SENT");
    expect(await code(gate.authorize({ recipient: "c@example.com", purpose: "verification" }))).toBe("MAIL_DAILY_LIMIT");
  });

  it("refuses a malformed configuration", () => {
    const store = new InMemoryOutboundMailStore();
    for (const bad of [policy(0), policy(1.5), policy(10, -1), policy(10, 91), policy(1, 20), policy(10, 20, 0), policy(10, 20, 101)]) {
      expect(() => new OutboundMailGate({ policy: bad, blindIndexKey: KEY, ledger: store, suppression: store, report: () => undefined }))
        .toThrow("OUTBOUND_MAIL_GATE_CONFIGURATION_INVALID");
    }
    expect(() => new OutboundMailGate({ policy: policy(10), blindIndexKey: new Uint8Array(), ledger: store, suppression: store, report: () => undefined }))
      .toThrow("OUTBOUND_MAIL_GATE_CONFIGURATION_INVALID");
  });
});

describe("the outboundMailPolicy register row", () => {
  it("is sealed by every hosted publication, and the live site's file supersedes it (10 000 a day)", async () => {
    const row = OUTBOUND_MAIL_POLICY_DEPLOYMENT_REGISTER_ROW;
    const example = JSON.parse(await readFile(new URL("../../deploy/vps/register/hosted-register.example.json", import.meta.url), "utf8")) as Record<string, unknown>;
    const plan = async (file: unknown) => planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(file))));
    const sealedIn = async (file: unknown) => (await plan(file)).rows.filter((candidate) => candidate.rowKey === "outboundMailPolicy");
    expect(Object.hasOwn(example, "outboundMailPolicy")).toBe(false);
    const defaulted = await sealedIn(example);
    expect(defaulted).toHaveLength(1);
    expect(JSON.parse(defaulted[0]!.valueJsonText)).toEqual(row.value);
    expect(defaulted[0]!.sourceRef).toBe(row.sourceRef);
    const live = { kind: "OUTBOUND_MAIL_POLICY", daily_cap: 10_000, reserved_for_security_pct: 20, alert_at_pct: 50 };
    const supplied = await sealedIn({ ...example, outboundMailPolicy: live });
    expect(supplied).toHaveLength(1);
    expect(JSON.parse(supplied[0]!.valueJsonText)).toEqual(live);
    expect(supplied[0]!.sourceRef).toBe(example.sourceRef);
    const refusalOf = async (file: unknown): Promise<string> => {
      try { await plan(file); return "NO_REFUSAL"; } catch (error) { return hostedRegisterRefusalCode(error); }
    };
    expect(await refusalOf({ ...example, outboundMailPolicy: null })).toBe("OUTBOUND_MAIL_POLICY_INVALID");
    expect(await refusalOf({ ...example, outboundMailPolicy: { ...live, daily_cap: 0 } })).toBe("OUTBOUND_MAIL_POLICY_INVALID");
    expect(await refusalOf({ ...example, outboundMailPolicy: { ...live, reserved_for_security_pct: 95 } })).toBe("OUTBOUND_MAIL_POLICY_INVALID");
    const registerReadme = await readFile(new URL("../../deploy/vps/register/README.md", import.meta.url), "utf8");
    expect(registerReadme).toContain("| `outboundMailPolicy` |");
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    for (const needle of ["| `outboundMailPolicy` |", "`OUTBOUND_MAIL_POLICY_UNRESOLVED`", "| `OUTBOUND_MAIL_POLICY_INVALID` |",
      "### Upgrading to the outbound mail gate release", "'outboundMailPolicy') ORDER BY row_key"]) expect(readme, needle).toContain(needle);
  });

  it("is code-owned at the preview's values (G2)", () => {
    const row = OUTBOUND_MAIL_POLICY_DEPLOYMENT_REGISTER_ROW;
    expect(row.rowKey).toBe("outboundMailPolicy");
    expect(outboundMailPolicyFromValue(row.value, row.sourceRef)).toEqual({ dailyCap: 2_000, reservedForSecurityPct: 20, alertAtPct: 50 });
  });
  it("accepts the live override and refuses anything malformed", () => {
    const value = { kind: "OUTBOUND_MAIL_POLICY", daily_cap: 10_000, reserved_for_security_pct: 20, alert_at_pct: 50 };
    expect(outboundMailPolicyFromValue(value, "live")).toEqual({ dailyCap: 10_000, reservedForSecurityPct: 20, alertAtPct: 50 });
    for (const bad of [
      null, {}, { ...value, kind: "OTHER" }, { ...value, daily_cap: 0 }, { ...value, daily_cap: 1_000_001 }, { ...value, daily_cap: 1.5 },
      { ...value, reserved_for_security_pct: 91 }, { ...value, reserved_for_security_pct: -1 }, { ...value, alert_at_pct: 0 },
      { ...value, alert_at_pct: 101 }, { ...value, extra: true },
      // A reserve that leaves no room for one sign-up mail would refuse every sign-up.
      { ...value, daily_cap: 1, reserved_for_security_pct: 20 }
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
  const at = new Date("2026-10-09T12:00:00Z");
  const base = { executable: "/definitely/no/spawn", from: "noreply@dezbatere.ro", publicAppUrl: "https://dezbatere.ro", timeoutMs: 1000 };

  /** Refuses everything and remembers what it was asked; a sender that spawned first would fail SENDMAIL_EXEC_FAILED instead. */
  function refusingGate() {
    const asked: Array<Readonly<{ recipient: string; purpose: MailPurpose }>> = [];
    return {
      asked,
      gate: { authorize: async (request: Readonly<{ recipient: string; purpose: MailPurpose }>) => {
        asked.push(request);
        throw new OutboundMailRefusal("MAIL_DAILY_LIMIT", request.purpose, mailPurposeClass(request.purpose));
      } }
    };
  }

  it.each<[string, MailPurpose, (gate: never) => Promise<unknown>]>([
    ["verification", "verification", (gate) => new SendmailMailSender({ ...base, gate }).sendVerification({ attemptId: "a", recipient, token, expiresAt: at })],
    ["erasure notice", "account-erasure-notice", (gate) => new SendmailSecurityNotificationSender({ ...base, gate }).sendSecurityNotification({ messageId: uuid, recipient, eventKind: "SCHEDULED", executeAt: at })],
    ["email change confirmation", "email-change-confirmation", (gate) => new SendmailEmailChangeMailSender({ ...base, gate }).sendEmailChange({ kind: "confirmation", recipient, token, expiresAt: at })],
    ["email change notice", "email-change-notice", (gate) => new SendmailEmailChangeMailSender({ ...base, gate }).sendEmailChange({ kind: "notice", recipient, newEmail: "new@example.test", cancelToken: token, expiresAt: at })],
    ["email change unavailable", "email-change-unavailable", (gate) => new SendmailEmailChangeMailSender({ ...base, gate }).sendEmailChange({ kind: "address-unavailable", recipient })],
    ["recovery address", "recovery-email-confirmation", (gate) => new SendmailRecoveryEmailMailSender({ ...base, gate }).sendRecoveryEmail({ kind: "confirmation", recipient, token, expiresAt: at })],
    ["consumer recovery", "consumer-recovery", (gate) => new SendmailConsumerAccountSender({ ...base, gate }).sendRecovery({ recipient, token, expiresAt: at })],
    ["consumer security notice", "consumer-security-notice", (gate) => new SendmailConsumerAccountSender({ ...base, gate }).sendConsumerSecurityNotice({ recipient, messageId: uuid, eventKind: "METHOD_CHANGED", happenedAt: at })],
    ["password reset", "password-reset", (gate) => new SendmailPasswordResetSender({ ...base, gate }).send({ messageId: uuid, event: "COMPLETED", recipient, expiresAt: at })],
    ["backup email / MFA recovery", "email-recovery", (gate) => new SendmailEmailRecoverySender({ ...base, gate }).send({ flow: "backup_email", messageId: uuid, event: "VERIFIED", recipient, expiresAt: at })],
  ])("%s", async (_name, purpose, send) => {
    const { gate, asked } = refusingGate();
    const outcome = await send(gate as never).then(() => "SENT", (error: unknown) => (error as { operatorCode?: string }).operatorCode ?? String(error));
    expect(outcome).toBe("MAIL_DAILY_LIMIT");
    expect(asked).toEqual([{ recipient, purpose }]);
  });

  it("the templated sender asks the gate once it has a mail it can render", async () => {
    const { gate, asked } = refusingGate();
    const sender = new TemplatedMailSender({ executable: base.executable, from: base.from, timeoutMs: 1000, gate: gate as never });
    const mail = { to: recipient, templateId: "M1" as const, locale: "en", params: { plan: "PLUS", totalAmount: "24.20", renewDate: "2026-10-29", cancelPageUrl: "https://dezbatere.ro/cancel", withdrawalDays: "14", termsUrl: "https://dezbatere.ro/terms" } };
    await expect(sender.sendTemplated(mail)).rejects.toMatchObject({ operatorCode: "MAIL_DAILY_LIMIT" });
    expect(asked).toEqual([{ recipient, purpose: "templated" }]);
  });

  it("an input the sender refuses never reaches the gate, and a gate that breaks blocks the send", async () => {
    const { gate, asked } = refusingGate();
    await expect(new SendmailMailSender({ ...base, gate: gate as never }).sendVerification({ attemptId: "a", recipient: "person@localhost", token, expiresAt: at }))
      .rejects.toMatchObject({ operatorCode: "MAIL_INPUT_INVALID" });
    expect(asked).toEqual([]);
    const broken = { authorize: async () => { throw new Error("database down"); } };
    await expect(new SendmailMailSender({ ...base, gate: broken }).sendVerification({ attemptId: "a", recipient, token, expiresAt: at }))
      .rejects.toMatchObject({ operatorCode: "OUTBOUND_MAIL_GATE_UNAVAILABLE" });
  });

  it("an admitted mail goes on to the spawn (control: the stub path really is reached)", async () => {
    const gate = { authorize: async () => undefined };
    await expect(new SendmailMailSender({ ...base, gate }).sendVerification({ attemptId: "a", recipient, token, expiresAt: at }))
      .rejects.toMatchObject({ operatorCode: "SENDMAIL_EXEC_FAILED" });
  });
});
