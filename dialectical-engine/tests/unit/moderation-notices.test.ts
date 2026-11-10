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
const HOLD: ModerationStatementGround = { recorded: true, interim: true, grounds: ["REVIEW_HOLD"], suspected: ["HATE_SPEECH"], sources: ["REPORT_BUTTON"], automated_detection: true, automated_decision: false };
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
    const kinds: ModerationStatementKind[] = ["DEBATE_HIDDEN", "DEBATE_DECIDED", "CONTRIBUTION_REMOVED", "REPORT_REMOVED", "CORRECTED", "CONTRIBUTION_AFFECTED", "REPORT_AFFECTED"];
    const { reconciler, claims, completed } = world(kinds.map((kind, index) => statement(kind, { mailLocale: index === 1 ? "ro" : "en" })), memory);
    await reconciler.reconcile(100);
    expect(memory.messages.map(({ mail }) => [mail.to, mail.templateId, mail.locale, mail.messageId])).toEqual(kinds.map((kind, index) =>
      ["bea@example.test", `MODERATION_STATEMENT_${kind}`, index === 1 ? "ro" : "en", claims[index]!.statementId]));
    const params = memory.messages[0]!.mail.params;
    expect(params.itemUrl).toBe(`https://debate.example.test/public/debate/${REF}`);
    expect(params.statementUrl).toBe(`https://debate.example.test/settings/notices#${claims[0]!.statementId}`);
    expect(completed).toEqual(claims.map((claim) => [claim.statementId, "SENT"]));
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
    const automatic = statementMailParams({ happenedAt: "2026-11-05T09:30:00.000Z", itemUrl: "https://x.test/i", statementUrl: "https://x.test/s",
      ground: { ...HOLD, automated_decision: true } });
    expect(automatic).toMatchObject({ automatedDecision: "true", groundHold: "true", groundHate: "true", groundNone: "false", sourceReport: "true" });
    const text = renderMail("MODERATION_STATEMENT_DEBATE_HIDDEN", "en", automatic).text;
    expect(text).toContain("An automatic check read the report and took this step by itself, with no person involved yet.");
    expect(text).toContain("Our Terms of Service, section 7: no hate speech of any kind.");
    const before = statementMailParams({ happenedAt: "2026-11-05T09:30:00.000Z", itemUrl: "https://x.test/i", statementUrl: "https://x.test/s",
      ground: { recorded: false, interim: false, grounds: [], suspected: [], sources: [], automated_detection: false, automated_decision: false } });
    expect(before.groundNone).toBe("true");
    expect(Object.entries(before).filter(([name, value]) => name.startsWith("ground") && name !== "groundNone" && value === "true")).toEqual([]);
    expect(renderMail("MODERATION_STATEMENT_CONTRIBUTION_REMOVED", "de", before).text).toContain("office@dezbatere.ro");
    // Every param is a date, a link or a flag: no words of the debate, no staff id, no reporter can travel in one.
    for (const [name, value] of Object.entries(automatic)) expect(name === "happened" || name.endsWith("Url") || value === "true" || value === "false", name).toBe(true);
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
      ({ userId: USER, mailId: randomUUID(), kind, happenedAt: "2026-11-05T09:30:00.000Z", mailLocale: "en", publicationRef: REF, emailCiphertext: sealed("bea@example.test") }));
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
