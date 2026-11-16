import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { encrypt } from "@debateai/crypto";
import type { ModerationStatementClaim, ModerationStatementGround, ModerationStatementKind, ModerationStatementMail, ModerationStatementOutcome, PublicFlagMail, PublicFlagMailClaim } from "@debateai/db";
import { renderMail } from "@debateai/mail-templates";
import { MemoryTemplatedMailSender, TemplatedMailSender, type TemplatedMail } from "../../apps/api/src/mail-channel.js";
import { ModerationStatementReconciler, PublicFlagAnswerReconciler, statementMailParams } from "../../apps/api/src/moderation-statements.js";
import { testOutboundMailGate } from "../support/outboundMailGate.js";

/*
 * 0157 (changed on purpose from 0156's sender test): the API no longer sends 0156's no-reason notice. Its statement of reasons (DSA Art 17; the owner's D1
 * and D6 of 6 November 2026) says what was done, the source, the automated means, the ground and the routes, with office@ as Reply-To. Here over a fake
 * queue, the real crypto and the memory mail channel (what sendmail would receive).
 */
const USER = randomUUID();
const DEK = randomBytes(32);
const REF = "f1000000-0000-4000-8000-000000000001";
const sealed = (address: string) => encrypt(DEK, Buffer.from(address, "utf8"), ["identity", "user.email_ciphertext", USER, "run:none", USER, `user-dek:${USER}`, "1"]);
const HOLD: ModerationStatementGround = { recorded: true, interim: true, grounds: ["REVIEW_HOLD"], suspected: ["HATE_SPEECH"], sources: ["REPORT_BUTTON"], automated_detection: true, automated_decision: false, law: null };
const statement = (kind: ModerationStatementKind, overrides: Partial<ModerationStatementMail> = {}): ModerationStatementMail =>
  ({ userId: USER, statementId: randomUUID(), kind, happenedAt: "2026-11-05T09:30:00.000Z", mailLocale: "en", publicationRef: REF, ground: HOLD, emailCiphertext: sealed("bea@example.test"), ...overrides });

/** What the sender logs on console.error while `work` runs: its first argument only, the marker. */
function captureErrors(): { lines: string[]; restore(): void } {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { lines.push(String(args[0])); };
  return { lines, restore: () => { console.error = original; } };
}

/** `breaksAt`: the claims (by index) whose settle throws, after it was recorded as asked. */
function world(statements: ReadonlyArray<ModerationStatementMail | null>, channel: { sendTemplated(mail: TemplatedMail): Promise<void> } = new MemoryTemplatedMailSender(),
  breaksAt: readonly number[] = []) {
  const claims: ModerationStatementClaim[] = statements.map((one) => ({ statementId: one?.statementId ?? randomUUID(), claimToken: randomUUID() }));
  const completed: Array<[string, ModerationStatementOutcome]> = [];
  const repository = {
    claim: async () => claims,
    read: async (claim: ModerationStatementClaim) => statements[claims.indexOf(claim)] ?? null,
    complete: async (claim: ModerationStatementClaim, outcome: ModerationStatementOutcome) => {
      completed.push([claim.statementId, outcome]);
      if (breaksAt.includes(claims.indexOf(claim))) throw new Error("CONNECTION_TERMINATED");
      return true;
    }
  };
  const users = { load: async (userId: string) => { if (userId !== USER) throw new Error("NO_KEY"); return Buffer.from(DEK); } };
  return { reconciler: new ModerationStatementReconciler(repository, users, channel, "https://debate.example.test/app/"), claims, completed, channel };
}

describe("0157: the statement of reasons sender", () => {
  it("sends each kind's template to the account's address, in its language, with the two links, and settles it SENT", async () => {
    const memory = new MemoryTemplatedMailSender();
    const kinds: ModerationStatementKind[] = ["DEBATE_HIDDEN", "DEBATE_DECIDED", "CONTRIBUTION_REMOVED", "REPORT_REMOVED", "CORRECTED", "CONTRIBUTION_AFFECTED", "REPORT_AFFECTED", "CONTRIBUTION_DECIDED", "REPORT_DECIDED",
      "CONTRIBUTION_KEPT_OFF", "REPORT_KEPT_OFF", "CONTRIBUTION_BACK", "REPORT_BACK"];
    const { reconciler, claims, completed } = world(kinds.map((kind, index) => statement(kind, { mailLocale: index === 1 ? "ro" : "en" })), memory);
    await reconciler.reconcile(100);
    expect(memory.messages.map(({ mail }) => [mail.to, mail.templateId, mail.locale, mail.messageId])).toEqual(kinds.map((kind, index) =>
      ["bea@example.test", `MODERATION_STATEMENT_${kind}`, index === 1 ? "ro" : "en", claims[index]!.statementId]));
    const params = memory.messages[0]!.mail.params;
    expect(params.itemUrl).toBe(`https://debate.example.test/public/debate/${REF}`);
    expect(params.statementUrl).toBe(`https://debate.example.test/settings/notices#${claims[0]!.statementId}`);
    expect(completed).toEqual(claims.map((claim) => [claim.statementId, "SENT"]));
  });

  // Final review (0172): the statements of those whose dig or report left with the debate carry no facts (only the debate owner's does), so their
  // mail's link never promises "the facts we relied on"; the kinds whose page shows the facts keep that sentence. DEBATE_HIDDEN is unchanged (R14).
  it("the eight kinds with no facts link the full statement without promising facts; DEBATE_DECIDED and CONTRIBUTION_REMOVED still promise them", async () => {
    const memory = new MemoryTemplatedMailSender();
    const kinds: ModerationStatementKind[] = ["CONTRIBUTION_AFFECTED", "REPORT_AFFECTED", "CONTRIBUTION_DECIDED", "REPORT_DECIDED", "CONTRIBUTION_KEPT_OFF", "REPORT_KEPT_OFF",
      "CONTRIBUTION_BACK", "REPORT_BACK", "DEBATE_DECIDED", "CONTRIBUTION_REMOVED", "DEBATE_HIDDEN"];
    const { claims } = await (async () => { const made = world(kinds.map((kind) => statement(kind)), memory); await made.reconciler.reconcile(); return made; })();
    const catalog = JSON.parse(readFileSync(resolve(process.cwd(), "packages/mail-templates/messages/en/mail.json"), "utf8")) as Record<string, string>;
    expect(catalog["mail.statement.readFullNoFacts"]).toBe("The full statement is in your account: {statementUrl}");
    expect(catalog["mail.statement.readFull"]).toBe("The full statement, with the facts we relied on, is in your account: {statementUrl}");
    memory.messages.forEach(({ mail }, index) => {
      const link = `https://debate.example.test/settings/notices#${claims[index]!.statementId}`;
      const { text } = renderMail(mail.templateId, mail.locale, mail.params);
      // 0176: a BACK mail carries its date and two links alone (no flag); its link never promises facts either.
      expect(mail.params.noFacts, kinds[index]).toBe(index >= 6 && index < 8 ? undefined : index < 8 ? "true" : "false");
      if (index < 8) {
        expect(text, kinds[index]).toContain(`The full statement is in your account: ${link}`);
        expect(text, kinds[index]).not.toContain("the facts we relied on");
      } else {
        expect(text, kinds[index]).toContain(`The full statement, with the facts we relied on, is in your account: ${link}`);
      }
    });
  });

  // M3 (owner's decision D, 10 Nov 2026): the final decision to those whose dig or report left with the debate: its date, the item's link, the routes, Reply-To office@.
  it("the final-decision mails for a contributor and for a reporter render in en and ro with the routes, and carry Reply-To office@", async () => {
    const memory = new MemoryTemplatedMailSender();
    await world([statement("CONTRIBUTION_DECIDED", { mailLocale: "en" }), statement("REPORT_DECIDED", { mailLocale: "en" }),
      statement("CONTRIBUTION_DECIDED", { mailLocale: "ro" }), statement("REPORT_DECIDED", { mailLocale: "ro" })], memory).reconciler.reconcile();
    expect(memory.messages).toHaveLength(4);
    const en = memory.messages.slice(0, 2).map(({ mail }) => renderMail(mail.templateId, mail.locale, mail.params));
    expect(en[0]!.subject).toBe("Our decision on the debate your contribution was in");
    expect(en[0]!.text).toContain(`we decided that this public debate stays off the public page: https://debate.example.test/public/debate/${REF}. What you contributed there stays off it too, in every country and with no end date, because the debate does, not because of a finding about your own contribution.`);
    // 0176: the rule named is the debate's, and the mail says so; it never reads as a finding on the person's own content.
    expect(en[0]!.text).toContain("The rule we relied on, for other content and not for yours:");
    expect(en[0]!.text).not.toContain("The rule we relied on:\n");
    expect(en[1]!.subject).toBe("Our decision on the debate your report was in");
    expect(en[1]!.text).toContain("Any report you asked for there stays off it too, in every country and with no end date, because the debate does, not because of a finding about your own report.");
    for (const { mail, raw } of memory.messages) {
      const { text } = renderMail(mail.templateId, mail.locale, mail.params);
      // The routes paragraph is the one the same locale's other decision mail carries (the first line that names office@).
      const routes = renderMail("MODERATION_STATEMENT_DEBATE_DECIDED", mail.locale, mail.params).text.split("\n").find((line) => line.includes("office@dezbatere.ro"))!.trim();
      expect(text, `${mail.templateId} ${mail.locale}`).toContain(routes);
      expect(text).toContain("office@dezbatere.ro");
      expect(raw).toMatch(/^Reply-To: office@dezbatere\.ro\r?$/mu);
    }
    // ro has its own words, not English.
    expect(renderMail("MODERATION_STATEMENT_CONTRIBUTION_DECIDED", "ro", memory.messages[2]!.mail.params).subject).not.toBe(en[0]!.subject);
  });

  // 0176 (what was left of M3, owner, 11 Nov 2026): the end of a review that put the debate back, for those whose content left with other content.
  it("what stays off after a re-publish: everywhere, with no end date, the other content's rule, the routes; what is back: the link alone", async () => {
    const memory = new MemoryTemplatedMailSender();
    const removal = { recorded: true, interim: false, grounds: ["HATE_SPEECH"], suspected: [], sources: ["OWN_INITIATIVE"], automated_detection: false, automated_decision: false, law: null };
    await world([statement("CONTRIBUTION_KEPT_OFF", { ground: removal }), statement("REPORT_KEPT_OFF", { ground: removal }),
      statement("CONTRIBUTION_BACK", { ground: removal }), statement("REPORT_BACK", { ground: removal })], memory).reconciler.reconcile();
    const [keptOff, reportKeptOff, back, reportBack] = memory.messages.map(({ mail }) => renderMail(mail.templateId, mail.locale, mail.params));
    expect(keptOff!.subject).toBe("Your contribution stays off a public debate's page");
    expect(keptOff!.text).toContain(`this debate came back on the public page, but not all of what you contributed there: https://debate.example.test/public/debate/${REF}. Some or all of it stays off the page, in every country and with no end date`);
    expect(reportKeptOff!.text).toContain("One or more of them stay off the page, in every country and with no end date");
    for (const text of [keptOff!.text, reportKeptOff!.text]) {
      expect(text).toContain("The rule we relied on, for other content and not for yours:");
      expect(text).toContain("Our Terms of Service, section 7: no hate speech of any kind.");
      expect(text).toContain("To challenge this decision");
    }
    expect(back!.subject).toBe("Your contribution is back on a public debate's page");
    expect(reportBack!.subject).toBe("Your report is back on a public debate's page");
    for (const text of [back!.text, reportBack!.text]) {
      expect(text).toContain("is back on it too, in every country.");
      expect(text).toContain("The full statement is in your account:");
      // Nothing is restricted: no rule, no source and no routes.
      expect(text).not.toContain("The rule we relied on");
      expect(text).not.toContain("hate speech");
      expect(text).not.toContain("To challenge this decision");
    }
    for (const { raw } of memory.messages) expect(raw).toMatch(/^Reply-To: office@dezbatere\.ro\r?$/mu);
  });

  it("every final notice renders in every mail locale, in its own words", async () => {
    const memory = new MemoryTemplatedMailSender();
    const locales = ["bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "ga", "it", "lv", "lt", "mt", "pl", "pt", "ro", "ru", "sk", "sl", "es", "sv", "uk", "zh", "hi", "id", "ja", "ko", "vi", "ar", "he", "tr"];
    const kinds: ModerationStatementKind[] = ["CONTRIBUTION_DECIDED", "REPORT_DECIDED", "CONTRIBUTION_KEPT_OFF", "REPORT_KEPT_OFF", "CONTRIBUTION_BACK", "REPORT_BACK"];
    await world(locales.flatMap((locale) => kinds.map((kind) => statement(kind, { mailLocale: locale }))), memory).reconciler.reconcile(500);
    expect(memory.messages).toHaveLength(locales.length * kinds.length);
    for (const { mail } of memory.messages) {
      const { subject, text } = renderMail(mail.templateId, mail.locale, mail.params);
      expect(text, `${mail.templateId} ${mail.locale}`).toContain(`https://debate.example.test/public/debate/${REF}`);
      expect(text).not.toMatch(/\{(happened|itemUrl|statementUrl)\}/u);
      if (mail.locale !== "en") expect(subject, `${mail.templateId} ${mail.locale}`).not.toBe(renderMail(mail.templateId, "en", mail.params).subject);
    }
  });

  it("a staff hide on a report: what was done, everywhere and with no end date, the source, the AI's part, the hold, the routes; Reply-To office@", async () => {
    const memory = new MemoryTemplatedMailSender();
    await world([statement("DEBATE_HIDDEN")], memory).reconciler.reconcile();
    const { mail, raw } = memory.messages[0]!;
    const { subject, text } = renderMail(mail.templateId, mail.locale, mail.params);
    expect(subject).toBe("Your debate is off the public page while we review it");
    expect(text).toContain(`On 5 November 2026, we took your public debate off the public page while we review it: https://debate.example.test/public/debate/${REF}.`);
    expect(text).toContain("in any country");
    expect(text).toContain("This started from a report someone made with the Report button. We do not tell you who made it.");
    expect(text).toContain("An AI read the report first. A person made this decision.");
    expect(text).toContain("Our Terms of Service, section 9: we can hide a public debate while we review it.");
    // What a person suspected stays on the page: a staff hide relies on the hold alone.
    expect(text).not.toContain("hate speech");
    expect(text).toContain("office@dezbatere.ro within six months");
    expect(text).toContain("certified out-of-court dispute settlement body, or to court");
    expect(text).toContain("https://debate.example.test/settings/notices#");
    expect(raw).toMatch(/^Reply-To: office@dezbatere\.ro\r?$/mu);
    expect(raw).toContain("Content-Language: en");
  });

  it("the automatic hide names the rule it found and says no person was involved; a step from before 0157 says no rule was recorded", () => {
    const automatic = statementMailParams({ kind: "DEBATE_HIDDEN", happenedAt: "2026-11-05T09:30:00.000Z", itemUrl: "https://x.test/i", statementUrl: "https://x.test/s",
      ground: { ...HOLD, automated_decision: true } });
    expect(automatic).toMatchObject({ automatedDecision: "true", groundHold: "true", groundHate: "true", groundNone: "false", sourceReport: "true" });
    const text = renderMail("MODERATION_STATEMENT_DEBATE_HIDDEN", "en", automatic).text;
    expect(text).toContain("An automatic check read the report and took this step by itself, with no person involved yet.");
    expect(text).toContain("Our Terms of Service, section 7: no hate speech of any kind.");
    const before = statementMailParams({ kind: "CONTRIBUTION_REMOVED", happenedAt: "2026-11-05T09:30:00.000Z", itemUrl: "https://x.test/i", statementUrl: "https://x.test/s",
      ground: { recorded: false, interim: false, grounds: [], suspected: [], sources: [], automated_detection: false, automated_decision: false, law: null } });
    expect(before.groundNone).toBe("true");
    expect(Object.entries(before).filter(([name, value]) => name.startsWith("ground") && name !== "groundNone" && value === "true")).toEqual([]);
    expect(renderMail("MODERATION_STATEMENT_CONTRIBUTION_REMOVED", "de", before).text).toContain("office@dezbatere.ro");
    // Every param is a date, a link or a flag: no words of the debate, no staff id, no reporter can travel in one.
    for (const [name, value] of Object.entries(automatic)) expect(name === "happened" || name.endsWith("Url") || value === "true" || value === "false", name).toBe(true);
  });

  it("0172 (M7): the law an illegal ground names stays on the page; the mail says only that the full statement names it, and never carries its words", () => {
    const LAW = "Legea nr. 8/1996, art. 139 SECRET-LAW-WORDS";
    const params = statementMailParams({ kind: "CONTRIBUTION_REMOVED", happenedAt: "2026-11-05T09:30:00.000Z", itemUrl: "https://x.test/i", statementUrl: "https://x.test/s",
      ground: { recorded: true, interim: false, grounds: ["ILLEGAL"], suspected: [], sources: ["AUTHORITY_ORDER"], automated_detection: false, automated_decision: false, law: LAW } });
    expect(params.groundIllegal).toBe("true");
    expect(JSON.stringify(params)).not.toContain("SECRET-LAW-WORDS");
    for (const [name, value] of Object.entries(params)) expect(name === "happened" || name.endsWith("Url") || value === "true" || value === "false", name).toBe(true);
    const text = renderMail("MODERATION_STATEMENT_CONTRIBUTION_REMOVED", "en", params).text;
    expect(text).toContain("The full statement names the law.");
    expect(text).not.toContain("SECRET-LAW-WORDS");
  });

  it("drops a statement with nothing to send to, and retries one whose key or transport failed, without stopping the pass", async () => {
    const failing = { sendTemplated: async (mail: TemplatedMail) => { if (mail.templateId === "MODERATION_STATEMENT_REPORT_REMOVED") throw new Error("SENDMAIL_TIMEOUT"); } };
    const { reconciler, claims, completed } = world([
      null, // the claim ran out, or the account is erased (D8)
      statement("DEBATE_HIDDEN", { emailCiphertext: sealed("a@example.test,b@example.test") }), // a fan-out address never reaches the transport
      statement("DEBATE_HIDDEN", { userId: randomUUID() }), // the key is gone (an erasure under way)
      statement("REPORT_REMOVED"), // the transport failed
      statement("CONTRIBUTION_REMOVED")
    ], failing);
    await reconciler.reconcile();
    expect(completed).toEqual([[claims[0]!.statementId, "DROPPED"], [claims[1]!.statementId, "DROPPED"], [claims[2]!.statementId, "RETRY"], [claims[3]!.statementId, "RETRY"], [claims[4]!.statementId, "SENT"]]);
  });

  // M5 (owner, 10 Nov 2026): a settle that throws for one claim (the database went away for a moment, a claim ran out mid-call) is logged and the pass
  // goes on, so one bad row never stops the mail queue; the claim it could not settle is claimable again when its claim runs out.
  it("complete throwing for one claim does not stop the batch", async () => {
    const memory = new MemoryTemplatedMailSender();
    const { reconciler, claims, completed } = world([statement("DEBATE_HIDDEN"), statement("REPORT_REMOVED"), statement("CONTRIBUTION_REMOVED")], memory, [1]);
    const logged = captureErrors();
    try { await reconciler.reconcile(); } finally { logged.restore(); }
    expect(memory.messages).toHaveLength(3);
    expect(completed).toEqual(claims.map((claim) => [claim.statementId, "SENT"]));
    expect(logged.lines).toEqual(["[MODERATION_STATEMENT_COMPLETE_FAILED]"]);
  });

  it("the reporter's answers: complete throwing for one claim does not stop the batch", async () => {
    const memory = new MemoryTemplatedMailSender();
    const mails: PublicFlagMail[] = (["RECEIPT", "AUTO_HIDDEN", "NO_BREACH"] as const).map((kind) =>
      ({ userId: USER, mailId: randomUUID(), kind, aiReadFirst: false, happenedAt: "2026-11-05T09:30:00.000Z", mailLocale: "en", publicationRef: REF, emailCiphertext: sealed("bea@example.test") }));
    const claims: PublicFlagMailClaim[] = mails.map((mail) => ({ mailId: mail.mailId, claimToken: randomUUID() }));
    const completed: string[] = [];
    const repository = {
      claim: async () => claims,
      read: async (claim: PublicFlagMailClaim) => mails[claims.indexOf(claim)] ?? null,
      complete: async (claim: PublicFlagMailClaim) => { completed.push(claim.mailId); if (claim === claims[1]) throw new Error("CONNECTION_TERMINATED"); return true; }
    };
    const users = { load: async () => Buffer.from(DEK) };
    const logged = captureErrors();
    try { await new PublicFlagAnswerReconciler(repository, users, memory, "https://debate.example.test/app/").reconcile(); } finally { logged.restore(); }
    expect(memory.messages).toHaveLength(3);
    expect(completed).toEqual(claims.map((claim) => claim.mailId));
    expect(logged.lines).toEqual(["[PUBLIC_FLAG_ANSWER_COMPLETE_FAILED]"]);
  });

  it("M1: the reporter's mails carry aiReadFirst for the receipt and the two decisions a person made, and the automatic ones carry none", async () => {
    const memory = new MemoryTemplatedMailSender();
    const kinds = ["RECEIPT", "AUTO_HIDDEN", "AUTO_NOT_FOUND", "NO_BREACH", "ACTED"] as const;
    const mails: PublicFlagMail[] = kinds.flatMap((kind) => [true, false].map((aiReadFirst) =>
      ({ userId: USER, mailId: randomUUID(), kind, aiReadFirst, happenedAt: "2026-11-05T09:30:00.000Z", mailLocale: "en", publicationRef: REF, emailCiphertext: sealed("bea@example.test") })));
    const claims: PublicFlagMailClaim[] = mails.map((mail) => ({ mailId: mail.mailId, claimToken: randomUUID() }));
    const repository = { claim: async () => claims, read: async (claim: PublicFlagMailClaim) => mails[claims.indexOf(claim)] ?? null, complete: async () => true };
    await new PublicFlagAnswerReconciler(repository, { load: async () => Buffer.from(DEK) }, memory, "https://debate.example.test/app/").reconcile();
    expect(memory.messages).toHaveLength(10);
    const sent = memory.messages.map(({ mail }) => mail);
    expect(sent.map((mail) => [mail.templateId, mail.params.aiReadFirst])).toEqual([
      ["PUBLIC_FLAG_ANSWER_RECEIPT", "true"], ["PUBLIC_FLAG_ANSWER_RECEIPT", "false"], ["PUBLIC_FLAG_ANSWER_AUTO_HIDDEN", undefined], ["PUBLIC_FLAG_ANSWER_AUTO_HIDDEN", undefined],
      ["PUBLIC_FLAG_ANSWER_AUTO_NOT_FOUND", undefined], ["PUBLIC_FLAG_ANSWER_AUTO_NOT_FOUND", undefined],
      ["PUBLIC_FLAG_ANSWER_NO_BREACH", "true"], ["PUBLIC_FLAG_ANSWER_NO_BREACH", "false"], ["PUBLIC_FLAG_ANSWER_ACTED", "true"], ["PUBLIC_FLAG_ANSWER_ACTED", "false"]]);
    // Each renders: the sentence only where the flag is true.
    const text = (index: number) => renderMail(sent[index]!.templateId as never, "en", sent[index]!.params as never).text;
    expect(text(0)).toContain("An automatic check read your report first");
    expect(text(1)).not.toContain("An automatic check read your report first");
    expect(text(6)).toContain("An AI read the report first. A person made this decision.");
    expect(text(9)).not.toContain("An AI read the report first");
  });

  it("goes out through the production sendmail path: one message on the dev capture, to the account, in its language, with Reply-To office@", async () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-moderation-mail-"));
    const previous = process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR;
    process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR = join(root, "mail");
    try {
      const sendmail = new TemplatedMailSender({ gate: testOutboundMailGate(), executable: resolve("deploy/dev-auth/sendmail-capture.mjs"), from: "noreply@localhost.test", timeoutMs: 10_000 });
      const { reconciler, claims, completed } = world([statement("DEBATE_HIDDEN", { mailLocale: "ro" })], sendmail);
      await reconciler.reconcile();
      expect(completed).toEqual([[claims[0]!.statementId, "SENT"]]);
      const files = readdirSync(join(root, "mail")).filter((name) => name.endsWith(".eml"));
      expect(files).toHaveLength(1);
      const message = readFileSync(join(root, "mail", files[0]!), "utf8");
      expect(message).toMatch(/^To: bea@example\.test\r?$/mu);
      expect(message).toMatch(/^Reply-To: office@dezbatere\.ro\r?$/mu);
      expect(message).toContain(`Message-ID: <${claims[0]!.statementId}@`);
      expect(message).toContain("Content-Language: ro");
      const text = [...message.matchAll(/Content-Transfer-Encoding: base64\r\n(?:[^\r\n]+\r\n)*\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)]
        .map((match) => Buffer.from(match[1]!.replaceAll("\r\n", ""), "base64").toString("utf8")).join("\n");
      expect(text).toContain("office@dezbatere.ro");
      expect(text).toContain(`https://debate.example.test/public/debate/${REF}`);
    } finally {
      if (previous === undefined) delete process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR;
      else process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR = previous;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
