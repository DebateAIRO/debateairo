// The mail program's schema v2 checks every mail against the release's OWN producers, so it cannot drift from them the
// way the frozen v4 copy did. This file first records that drift as a measured fact, then guards against it: every
// account template, in every language, on both public origins; every reset, backup-email and authenticator-recovery
// event on both origins; and the templated mail the API's own sender writes.
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderPasswordResetMail } from "../../apps/api/src/password-reset-mail.js";
import { renderEmailRecoveryMail } from "../../apps/api/src/email-mfa-mail.js";
import { buildTemplatedMessage } from "../../apps/api/src/mail-mime.js";
import {
  MemoryTemplatedMailSender, SendmailConsumerAccountSender, SendmailEmailChangeMailSender, SendmailMailSender, SendmailRecoveryEmailMailSender,
  SendmailSecurityNotificationSender, emailChangeLink, isSingleDeliverableRecipient, recoveryEmailLink, renderAccountMailMessage
} from "../../apps/api/src/mail-channel.js";

const mail = await import("../../deploy/" + "preview-auth-dev/v1/mail-handoff.mjs");
const v4 = await import("../../deploy/" + "preview-mail/v4-20261005/sendmail-owned-preview.mjs");
const fixture = await import("../../deploy/" + "preview-mail/v4-20261005/synthetic-recipient-fixture.mjs");
const accountTemplate = await import("../../apps/api/src/" + "account-mail-template.mjs");

const PREVIEW = "https://v3-preview.dezbatere.ro";
const MAIN = "https://dezbatere.ro";
const ORIGINS = [PREVIEW, MAIN] as const;
const FROM = "noreply@dezbatere.ro";
const TOKEN = "T".repeat(43), CANCEL = "C".repeat(43), FINISH = "F".repeat(43);
const ID = "11111111-1111-4111-8111-111111111111";
const EXPIRES = new Date("2026-10-06T22:00:00Z");
const STRANGER = "stranger@example.com";
const PROOF: string = fixture.aliases["verification-direct-and-recovery-proof"];

const open = mail.openRecipient(isSingleDeliverableRecipient);
const allowList = mail.allowListRecipient(fixture.recipientPolicy);
const siteOptions = (origin: string, recipientOf: unknown) => ({
  from: FROM, origin, renderPasswordResetMail, renderEmailRecoveryMail, buildTemplatedMessage, renderAccountMail: renderAccountMailMessage, recipientOf
});
const legacyOptions = { from: FROM, publicAppUrl: PREVIEW, renderPasswordResetMail, renderEmailRecoveryMail, buildTemplatedMessage, recipientPolicy: fixture.recipientPolicy };
const refused = (run: () => unknown) => expect(run).toThrow(/^PREVIEW_MAIL_REFUSED$/);

/** The input each API sender gives the account composition (mail-channel.ts), for one template on one origin. */
function accountInput(template: string, origin: string, recipient: string, display?: { locale: string; timeZone: string | null }) {
  const link = (path: string) => { const url = new URL(path, origin); url.hash = `token=${TOKEN}`; return url; };
  const urls: Record<string, () => URL> = {
    "verification-v1": () => link("/verify-email"),
    "consumer-recovery-v1": () => link("/recover"),
    "recovery-v1": () => new URL(recoveryEmailLink(origin, TOKEN)),
    "email-change-confirm-v1": () => new URL(emailChangeLink(origin, "confirm", TOKEN)),
    "email-change-notice-v1": () => new URL(emailChangeLink(origin, "cancel", TOKEN))
  };
  return {
    template, recipient, ...(display === undefined ? {} : { display }),
    ...(template === "email-change-unavailable-v1" ? {} : { expiresAt: EXPIRES }),
    ...(template.startsWith("security-") ? { messageId: ID } : {}),
    ...(urls[template] ? { url: urls[template]!() } : {}),
    ...(template === "email-change-notice-v1" ? { newEmail: "next@example.com" } : {})
  } as Parameters<typeof renderAccountMailMessage>[0];
}
const accountMail = (template: string, origin: string, recipient: string, display?: { locale: string; timeZone: string | null }) =>
  Buffer.from(renderAccountMailMessage(accountInput(template, origin, recipient, display), FROM), "utf8");

describe("measured: the schema v1 path refuses the API's current account mail", () => {
  it("v4 refuses every current account mail even to an allow-listed address; v2 takes the same bytes", () => {
    // The proving address may receive every account purpose under v4's own rule, so a refusal is the copy, not the address.
    const to = PROOF;
    for (const locale of ["en", "ro", "en-US"]) {
      const verification = accountMail("verification-v1", PREVIEW, to, { locale, timeZone: null });
      const notice = accountMail("security-method-changed-v1", PREVIEW, to, { locale, timeZone: null });
      const codeUsed = accountMail("security-recovery-code-used-v1", PREVIEW, to, { locale, timeZone: null });
      expect(() => v4.ownedForwardingMessage(verification, fixture.recipientPolicy), locale).toThrow(/^OWNED_PREVIEW_MAIL_TEMPLATE_REFUSED$/);
      expect(() => v4.ownedForwardingMessage(notice, fixture.recipientPolicy), locale).toThrow(/^OWNED_PREVIEW_MAIL_TEMPLATE_REFUSED$/);
      // v4 does not know this template at all.
      expect(() => v4.ownedForwardingMessage(codeUsed, fixture.recipientPolicy), locale).toThrow(/^OWNED_PREVIEW_MAIL_HEADER_REFUSED$/);
      for (const message of [verification, notice, codeUsed]) {
        refused(() => mail.selectCanonicalMail(message, legacyOptions));
        expect(mail.selectSiteMail(message, siteOptions(PREVIEW, allowList))).toMatchObject({ family: "account", recipient: to });
      }
    }
  });

  it("the Content-Language header is one cause, not the only one: the API's HTML also writes dir", () => {
    const to = PROOF;
    const message = accountMail("verification-v1", PREVIEW, to, { locale: "en", timeZone: null }).toString("utf8");
    expect(message).toContain("\r\nContent-Language: en\r\n");
    const html = Buffer.from(message.split("Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n")[1]!.split("\r\n--")[0]!.replace(/\r\n/g, ""), "base64").toString("utf8");
    expect(html).toContain('<html lang="en" dir="ltr">');
    const withoutLanguage = Buffer.from(message.replace("Content-Language: en\r\n", ""), "utf8");
    expect(() => v4.ownedForwardingMessage(withoutLanguage, fixture.recipientPolicy)).toThrow(/^OWNED_PREVIEW_MAIL_TEMPLATE_REFUSED$/);
  });
});

describe("drift guard: account mail through the API's own composition", () => {
  it("knows the API's fourteen account templates", () => {
    expect(accountTemplate.ACCOUNT_MAIL_TEMPLATES).toEqual(["verification-v1", "recovery-v1", "security-scheduled-v1", "security-cancelled-v1", "security-completion-v1",
      "email-change-confirm-v1", "email-change-notice-v1", "email-change-unavailable-v1", "consumer-recovery-v1", "security-method-changed-v1",
      "security-codes-regenerated-v1", "security-recovery-proved-v1", "security-recovery-completed-v1", "security-recovery-code-used-v1"]);
  });

  const named = ["en", "ro", "en-US", "en-GB", "ar"];
  for (const origin of ORIGINS) {
    it(`open mode on ${origin} takes every template in en, ro, en-US, en-GB and ar unchanged, to its own To`, () => {
      for (const template of accountTemplate.ACCOUNT_MAIL_TEMPLATES as string[]) for (const [index, locale] of named.entries()) {
        const message = accountMail(template, origin, STRANGER, { locale, timeZone: index % 2 === 0 ? null : "Europe/Bucharest" });
        const selected = mail.selectSiteMail(message, siteOptions(origin, open));
        expect(selected.family, `${template} ${locale}`).toBe("account");
        expect(selected.recipient).toBe(STRANGER);
        expect(selected.message.equals(message), `${template} ${locale}`).toBe(true);
      }
    });

    it(`open mode on ${origin} takes every template in every one of the 37 languages, and with no language given`, () => {
      for (const template of accountTemplate.ACCOUNT_MAIL_TEMPLATES as string[]) {
        for (const locale of accountTemplate.ACCOUNT_MAIL_LOCALES as string[]) {
          const message = accountMail(template, origin, STRANGER, { locale, timeZone: "America/New_York" });
          expect(mail.selectSiteMail(message, siteOptions(origin, open)).message.equals(message), `${template} ${locale}`).toBe(true);
        }
        const english = accountMail(template, origin, STRANGER);
        expect(mail.selectSiteMail(english, siteOptions(origin, open)).message.equals(english), template).toBe(true);
      }
    });
  }

  it("refuses a link template rendered for the other origin, and keeps link-free notices on either", () => {
    const linked = ["verification-v1", "recovery-v1", "consumer-recovery-v1", "email-change-confirm-v1", "email-change-notice-v1"];
    for (const template of accountTemplate.ACCOUNT_MAIL_TEMPLATES as string[]) {
      const message = accountMail(template, PREVIEW, STRANGER);
      if (linked.includes(template)) refused(() => mail.selectSiteMail(message, siteOptions(MAIN, open)));
      else expect(mail.selectSiteMail(message, siteOptions(MAIN, open)).family).toBe("account");
    }
  });

  const swapped = (message: Buffer, from: string, to: string) => { const text = message.toString("utf8"); expect(text).toContain(from); return Buffer.from(text.replace(from, to), "utf8"); };
  const plainPart = (message: Buffer) => message.toString("utf8").split("Content-Transfer-Encoding: base64\r\n\r\n")[1]!.split("\r\n--")[0]!;
  const withPlain = (message: Buffer, change: (text: string) => string) => {
    const encoded = plainPart(message), text = Buffer.from(encoded.replace(/\r\n/g, ""), "base64").toString("utf8");
    return swapped(message, encoded, Buffer.from(change(text), "utf8").toString("base64").match(/.{1,76}/g)!.join("\r\n"));
  };
  it.each([
    ["a second recipient", (m: Buffer) => swapped(m, `To: ${PROOF}`, `To: ${PROOF}, other@example.com`)],
    ["a Bcc", (m: Buffer) => swapped(m, "MIME-Version: 1.0", "Bcc: other@example.com\r\nMIME-Version: 1.0")],
    ["an extra header", (m: Buffer) => swapped(m, "MIME-Version: 1.0", "X-Priority: 1\r\nMIME-Version: 1.0")],
    ["another From", (m: Buffer) => swapped(m, "From: dezbatere.ro <noreply@dezbatere.ro>", "From: dezbatere.ro <billing@dezbatere.ro>")],
    ["a folded line", (m: Buffer) => swapped(m, "\r\nMIME-Version: 1.0", "\r\n MIME-Version: 1.0")],
    ["a trailer", (m: Buffer) => Buffer.concat([m, Buffer.from("trailer\r\n")])],
    ["a link on another host", (m: Buffer) => withPlain(m, (t) => t.replace(`${PREVIEW}/verify-email#token=`, "https://evil.example/verify-email#token="))],
    ["a second link", (m: Buffer) => withPlain(m, (t) => `${t}${PREVIEW}/verify-email#token=${"X".repeat(43)}\r\n`)],
    ["changed wording", (m: Buffer) => withPlain(m, (t) => t.replace("Dialectical Engine", "Dialectical Engine!"))],
    ["another template name", (m: Buffer) => swapped(m, "X-Account-Template: verification-v1", "X-Account-Template: recovery-v1")],
    ["another expiry", (m: Buffer) => swapped(m, `X-Account-Expires: ${EXPIRES.getTime()}`, `X-Account-Expires: ${EXPIRES.getTime() + 60_000}`)]
  ])("refuses an account mail with %s, in both v2 modes", (_name, tamper) => {
    const message = tamper(accountMail("verification-v1", PREVIEW, PROOF));
    refused(() => mail.selectSiteMail(message, siteOptions(PREVIEW, open)));
    refused(() => mail.selectSiteMail(message, siteOptions(PREVIEW, allowList)));
  });

  describe("the bytes the API's own account senders hand to the mail program", () => {
    let folder = "", sink = "", output = "";
    beforeAll(async () => {
      folder = await mkdtemp(join(tmpdir(), "lock-mail-sink-"));
      output = join(folder, "message");
      sink = join(folder, "sink.mjs");
      await writeFile(sink, `#!${process.execPath}\nimport fs from "node:fs";const b=[];for await(const c of process.stdin)b.push(c);fs.writeFileSync(${JSON.stringify(output)},Buffer.concat(b));\n`);
      await chmod(sink, 0o700);
    });
    afterAll(async () => { if (folder) await rm(folder, { recursive: true, force: true }); });

    it.each(ORIGINS)("every account sender's mail on %s passes open mode unchanged", async (origin) => {
      const gate = { authorize: async () => true };
      const options = { executable: sink, from: FROM, publicAppUrl: origin, timeoutMs: 20_000, gate };
      const display = { locale: "ro", timeZone: "Europe/Bucharest" };
      const verification = new SendmailMailSender(options), recovery = new SendmailRecoveryEmailMailSender(options);
      const security = new SendmailSecurityNotificationSender({ executable: sink, from: FROM, timeoutMs: 20_000, gate });
      const change = new SendmailEmailChangeMailSender(options), consumer = new SendmailConsumerAccountSender(options);
      const sends: Array<() => Promise<void>> = [
        () => verification.sendVerification({ attemptId: ID, recipient: STRANGER, token: TOKEN, expiresAt: EXPIRES, display }),
        () => recovery.sendRecoveryEmail({ kind: "confirmation", recipient: STRANGER, token: TOKEN, expiresAt: EXPIRES, display }),
        ...(["SCHEDULED", "CANCELLED", "COMPLETION"] as const).map((eventKind) => () => security.sendSecurityNotification({ messageId: ID, recipient: STRANGER, eventKind, executeAt: EXPIRES, display })),
        () => change.sendEmailChange({ kind: "confirmation", recipient: STRANGER, token: TOKEN, expiresAt: EXPIRES, display }),
        () => change.sendEmailChange({ kind: "notice", recipient: STRANGER, newEmail: "next@example.com", cancelToken: TOKEN, expiresAt: EXPIRES, display }),
        () => change.sendEmailChange({ kind: "address-unavailable", recipient: STRANGER, display }),
        () => consumer.sendRecovery({ recipient: STRANGER, token: TOKEN, expiresAt: EXPIRES, display }),
        ...(["METHOD_CHANGED", "CODES_REGENERATED", "RECOVERY_PROVED", "RECOVERY_COMPLETED", "RECOVERY_CODE_USED"] as const)
          .map((eventKind) => () => consumer.sendConsumerSecurityNotice({ recipient: STRANGER, messageId: ID, eventKind, happenedAt: EXPIRES, display }))
      ];
      const seen: string[] = [];
      for (const send of sends) {
        await send();
        const message = await readFile(output);
        seen.push(/\r\nX-Account-Template: ([a-z0-9-]+)\r\n/.exec(message.toString("utf8"))![1]!);
        const selected = mail.selectSiteMail(message, siteOptions(origin, open));
        expect(selected.recipient).toBe(STRANGER);
        expect(selected.message.equals(message)).toBe(true);
      }
      expect(seen.sort()).toEqual([...(accountTemplate.ACCOUNT_MAIL_TEMPLATES as string[])].sort());
    }, 60_000);
  });
});

describe("reset, backup-email and authenticator-recovery mail on both origins", () => {
  type Event = Readonly<{ flow: "reset" | "backup_email" | "mfa_recovery"; event: string; cancel?: boolean }>;
  const EVENTS: Event[] = [
    ...["PROOF", "COMPLETED", "CANCELLED", "REFUSED"].map((event) => ({ flow: "reset" as const, event })),
    ...["PROOF", "VERIFIED"].map((event) => ({ flow: "backup_email" as const, event })),
    ...["PROOF", "COMPLETED", "CANCELLED", "REFUSED", "FINISH"].map((event) => ({ flow: "mfa_recovery" as const, event })),
    ...[true, false].flatMap((cancel) => ["STARTED", "WAITING"].map((event) => ({ flow: "mfa_recovery" as const, event, cancel })))
  ];
  function external({ flow, event, cancel = true }: Event, origin: string, recipient: string, mailLocale: string) {
    const input = {
      messageId: ID, recipient, expiresAt: EXPIRES, mailLocale, event,
      ...(event === "PROOF" ? { token: TOKEN } : {}),
      ...((flow === "reset" && event === "PROOF") || (flow === "mfa_recovery" && (event === "PROOF" || ((event === "STARTED" || event === "WAITING") && cancel))) ? { cancelToken: CANCEL } : {}),
      ...(event === "WAITING" ? { notBefore: new Date("2026-10-07T21:00:00Z") } : {}),
      ...(event === "FINISH" ? { finishToken: FINISH } : {})
    };
    const options = { from: FROM, publicAppUrl: origin };
    return Buffer.from(flow === "reset" ? renderPasswordResetMail(input as never, options) : renderEmailRecoveryMail({ ...input, flow } as never, options), "utf8");
  }

  for (const origin of ORIGINS) {
    it(`takes every event on ${origin}, in en, ro, en-US and ar, unchanged`, () => {
      for (const item of EVENTS) for (const locale of ["en", "ro", "en-US", "ar"]) {
        const message = external(item, origin, STRANGER, locale);
        const selected = mail.selectSiteMail(message, siteOptions(origin, open));
        expect(selected, `${item.flow} ${item.event} ${locale}`).toMatchObject({ family: "external", recipient: STRANGER });
        expect(selected.message.equals(message)).toBe(true);
      }
    });
  }

  it("refuses a Message-ID on the other host and a link on the other origin", () => {
    for (const item of EVENTS) {
      const message = external(item, PREVIEW, STRANGER, "en");
      // Rendered for the test name, offered on the main name: the Message-ID host is the test name's.
      refused(() => mail.selectSiteMail(message, siteOptions(MAIN, open)));
      // With only the Message-ID host moved, a mail that carries a link still names the test name in it. A mail with no
      // link is then exactly what the main name's renderer writes, so it passes.
      const hostOnly = Buffer.from(message.toString("utf8").replace("@v3-preview.dezbatere.ro>", "@dezbatere.ro>"), "utf8");
      const linked = item.event === "PROOF" || item.event === "FINISH" || item.cancel === true;
      if (linked) refused(() => mail.selectSiteMail(hostOnly, siteOptions(MAIN, open)));
      else expect(mail.selectSiteMail(hostOnly, siteOptions(MAIN, open)).family).toBe("external");
    }
    const proof = external({ flow: "reset", event: "PROOF" }, MAIN, STRANGER, "en").toString("utf8");
    const elsewhere = Buffer.from(proof.replace(`${MAIN}/reset-password#token=`, `${PREVIEW}/reset-password#token=`), "utf8");
    refused(() => mail.selectSiteMail(elsewhere, siteOptions(MAIN, open)));
  });
});

describe("templated mail through the API's own sender", () => {
  const PDF = (bytes: number) => Buffer.alloc(bytes, 0x25);
  const flags = Object.fromEntries(["automatedDecision", "automatedDetection", "groundNone", "groundHold", "groundUnlawful", "groundHate", "groundWeapons", "groundSuicide",
    "groundReligious", "groundPersonal", "groundIllegal", "sourceReport", "sourceEmail", "sourceAuthority", "sourceOwn", "noFacts"]
    .map((name) => [name, name === "groundHold" || name === "sourceOwn" ? "true" : "false"]));
  const MAILS = (origin: string) => ({
    "M1 with the Terms, the withdrawal form and a PDF": {
      templateId: "M1", locale: "ro",
      params: { plan: "PLUS", totalAmount: "1.00", renewDate: "2026-12-01", cancelPageUrl: `${origin}/settings`, termsUrl: `${origin}/terms`, withdrawalDays: "14" },
      attachments: [
        { filename: "terms-of-service.txt", contentType: "text/plain; charset=UTF-8", content: Buffer.from("Terms") },
        { filename: "withdrawal-form.txt", contentType: "text/plain; charset=UTF-8", content: Buffer.from("Form") },
        { filename: "terms.pdf", contentType: "application/pdf", content: PDF(600_000) }
      ]
    },
    "M2 with the invoice attached": {
      templateId: "M2_INVOICE_ATTACHED", locale: "en", params: { plan: "PLUS", totalAmount: "1.00", chargeDate: "2026-11-01T10:00:00.000Z", invoiceNumber: "DZB-1" },
      attachments: [{ filename: "invoice.pdf", contentType: "application/pdf", content: PDF(20_000) }]
    },
    "M2 with an invoice link": {
      templateId: "M2_INVOICE_LINK", locale: "en", params: { plan: "PLUS", totalAmount: "1.00", chargeDate: "2026-11-01T10:00:00.000Z", invoiceUrl: "https://quadernoapp.com/i/abc" }
    },
    "a moderation statement with its Reply-To": {
      templateId: "MODERATION_STATEMENT_DEBATE_HIDDEN", locale: "en",
      params: { happened: "2026-11-05T09:30:00.000Z", itemUrl: `${origin}/public/debate/x`, statementUrl: `${origin}/settings/notices#x`, ...flags }
    },
    "an owner notice": {
      templateId: "O3", locale: "en", params: { jobKind: "SMARTBILL_INVOICE", reference: "charge 1", reasonCode: "OUTBOX_HANDLER_FAILED", nextSteps: "Run the listed step." }
    },
    "a data export": {
      templateId: "DATA_EXPORT", locale: "ro", params: { requested: "2026-11-05", expires: "2026-11-12T10:00:00.000Z", downloadUrl: `${origin}/settings/export#x` }
    }
  });
  async function apiMail(origin: string, name: string, to: string, messageId: string | undefined = "22222222-2222-4222-8222-222222222222") {
    const sender = new MemoryTemplatedMailSender(FROM);
    const spec = (MAILS(origin) as Record<string, Record<string, unknown>>)[name]!;
    await sender.sendTemplated({ to, ...spec, ...(messageId === undefined ? {} : { messageId }) } as never);
    return Buffer.from(sender.messages[0]!.raw, "utf8");
  }
  const names = Object.keys(MAILS(PREVIEW));

  for (const origin of ORIGINS) {
    it.each(names)(`on ${origin}: %s goes to a stranger in open mode and is refused in allow-list mode`, async (name) => {
      const message = await apiMail(origin, name, STRANGER);
      const selected = mail.selectSiteMail(message, siteOptions(origin, open));
      expect(selected).toMatchObject({ family: "templated", recipient: STRANGER });
      expect(selected.message.equals(message)).toBe(true);
      refused(() => mail.selectSiteMail(message, siteOptions(origin, allowList)));
    });
  }

  it("keeps the moderation statement's one Reply-To, office@", async () => {
    const message = await apiMail(MAIN, "a moderation statement with its Reply-To", STRANGER);
    expect(message.toString("utf8")).toMatch(/\r\nSubject: [^\r]+\r\nReply-To: office@dezbatere\.ro\r\n/u);
  });

  const swap = (message: Buffer, from: string, to: string) => { const text = message.toString("utf8"); expect(text).toContain(from); return Buffer.from(text.replace(from, to), "utf8"); };
  it.each([
    ["a second recipient", async () => swap(await apiMail(PREVIEW, "an owner notice", STRANGER), `To: ${STRANGER}`, `To: ${STRANGER}, other@example.com`)],
    ["a Bcc", async () => swap(await apiMail(PREVIEW, "an owner notice", STRANGER), "MIME-Version: 1.0", "Bcc: other@example.com\r\nMIME-Version: 1.0")],
    ["an extra header", async () => swap(await apiMail(PREVIEW, "an owner notice", STRANGER), "MIME-Version: 1.0", "X-Priority: 1\r\nMIME-Version: 1.0")],
    ["another From", async () => swap(await apiMail(PREVIEW, "an owner notice", STRANGER), "From: noreply@dezbatere.ro", "From: billing@dezbatere.ro")],
    ["another Reply-To", async () => swap(await apiMail(PREVIEW, "a moderation statement with its Reply-To", STRANGER), "Reply-To: office@dezbatere.ro", "Reply-To: x@example.com")],
    ["a folded line", async () => swap(await apiMail(PREVIEW, "an owner notice", STRANGER), "\r\nMIME-Version: 1.0", "\r\n MIME-Version: 1.0")],
    ["a trailer", async () => Buffer.concat([await apiMail(PREVIEW, "an owner notice", STRANGER), Buffer.from("trailer\r\n")])]
  ])("refuses templated mail with %s, in both v2 modes", async (_name, make) => {
    const message = await make();
    refused(() => mail.selectSiteMail(message, siteOptions(PREVIEW, open)));
    refused(() => mail.selectSiteMail(message, siteOptions(PREVIEW, allowList)));
  });
});
