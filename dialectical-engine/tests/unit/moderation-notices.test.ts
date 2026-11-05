import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { encrypt } from "@debateai/crypto";
import type { ModerationNotice, ModerationNoticeClaim, ModerationNoticeKind, ModerationNoticeOutcome } from "@debateai/db";
import { renderMail } from "@debateai/mail-templates";
import { MemoryTemplatedMailSender, TemplatedMailSender, type TemplatedMail } from "../../apps/api/src/mail-channel.js";
import { ModerationNoticeReconciler } from "../../apps/api/src/moderation-notices.js";

/** 0156's sender over a fake queue, the real crypto and the memory mail channel (what sendmail would receive). */
const USER = randomUUID();
const DEK = randomBytes(32);
const sealed = (address: string) => encrypt(DEK, Buffer.from(address, "utf8"), ["identity", "user.email_ciphertext", USER, "run:none", USER, `user-dek:${USER}`, "1"]);
const notice = (kind: ModerationNoticeKind, overrides: Partial<ModerationNotice> = {}): ModerationNotice =>
  ({ userId: USER, kind, happenedAt: "2026-11-05T09:30:00.000Z", mailLocale: "en", emailCiphertext: sealed("bea@example.test"), ...overrides });

function world(notices: ReadonlyArray<ModerationNotice | null>, channel: { sendTemplated(mail: TemplatedMail): Promise<void> } = new MemoryTemplatedMailSender()) {
  const claims: ModerationNoticeClaim[] = notices.map(() => ({ noticeId: randomUUID(), claimToken: randomUUID() }));
  const completed: Array<[string, ModerationNoticeOutcome]> = [];
  const repository = {
    claim: async () => claims,
    read: async (claim: ModerationNoticeClaim) => notices[claims.indexOf(claim)] ?? null,
    complete: async (claim: ModerationNoticeClaim, outcome: ModerationNoticeOutcome) => { completed.push([claim.noticeId, outcome]); return true; }
  };
  const users = { load: async (userId: string) => { if (userId !== USER) throw new Error("NO_KEY"); return Buffer.from(DEK); } };
  return { reconciler: new ModerationNoticeReconciler(repository, users, channel, "https://debate.example.test/app/"), claims, completed, channel };
}

describe("0156: the moderation notice sender", () => {
  it("sends each kind's template to the account's address, in its language, with the date and the Terms link, and settles it SENT", async () => {
    const memory = new MemoryTemplatedMailSender();
    const { reconciler, claims, completed } = world([notice("DEBATE_HIDDEN"), notice("CONTRIBUTION_REMOVED", { mailLocale: "ro" }), notice("REPORT_REMOVED", { mailLocale: "de" })], memory);
    await reconciler.reconcile(100);
    expect(memory.messages.map(({ mail }) => [mail.to, mail.templateId, mail.locale, mail.messageId])).toEqual([
      ["bea@example.test", "MODERATION_DEBATE_HIDDEN", "en", claims[0]!.noticeId],
      ["bea@example.test", "MODERATION_CONTRIBUTION_REMOVED", "ro", claims[1]!.noticeId],
      ["bea@example.test", "MODERATION_REPORT_REMOVED", "de", claims[2]!.noticeId]
    ]);
    expect(memory.messages[0]!.mail.params).toEqual({ happened: "2026-11-05T09:30:00.000Z", termsUrl: "https://debate.example.test/terms" });
    expect(completed).toEqual(claims.map((claim) => [claim.noticeId, "SENT"]));
  });

  it("says what left the page and when, and where the Terms are; it names no reason, no staff person and no words of the debate", async () => {
    const memory = new MemoryTemplatedMailSender();
    await world([notice("DEBATE_HIDDEN")], memory).reconciler.reconcile();
    const { mail, raw } = memory.messages[0]!;
    const rendered = renderMail(mail.templateId, mail.locale, mail.params);
    expect(rendered.subject).toBe("Your debate was taken off the public page");
    expect(rendered.text).toContain("On November 5, 2026, your public debate was taken off the public page for a review against our Terms.");
    expect(rendered.text).toContain("It stays in your account, as your own.");
    expect(rendered.text).toContain("Our current Terms are online at https://debate.example.test/terms");
    expect(raw).toContain("Content-Language: en");
    const report = renderMail("MODERATION_REPORT_REMOVED", "en", mail.params).text;
    expect(report).toContain("a report you asked for on a public debate was removed from the public page");
    expect(report).not.toContain("as your own");
    const contribution = new MemoryTemplatedMailSender();
    await world([notice("CONTRIBUTION_REMOVED", { mailLocale: "fr" })], contribution).reconciler.reconcile();
    expect(contribution.messages[0]!.raw).toContain("Content-Language: fr");
    expect(renderMail("MODERATION_CONTRIBUTION_REMOVED", "fr", mail.params).subject).toBe("Votre contribution a été retirée d’un débat public");
  });

  it("drops a notice with nothing to send to, and retries one whose key or transport failed, without stopping the pass", async () => {
    const failing = { sendTemplated: async (mail: TemplatedMail) => { if (mail.templateId === "MODERATION_REPORT_REMOVED") throw new Error("SENDMAIL_TIMEOUT"); } };
    const { reconciler, claims, completed } = world([
      null, // the claim ran out, or the account is no longer active
      notice("DEBATE_HIDDEN", { emailCiphertext: sealed("a@example.test,b@example.test") }), // a fan-out address never reaches the transport
      notice("DEBATE_HIDDEN", { userId: randomUUID() }), // the key is gone (an erasure under way)
      notice("REPORT_REMOVED"), // the transport failed
      notice("CONTRIBUTION_REMOVED")
    ], failing);
    await reconciler.reconcile();
    expect(completed).toEqual([[claims[0]!.noticeId, "DROPPED"], [claims[1]!.noticeId, "DROPPED"], [claims[2]!.noticeId, "RETRY"], [claims[3]!.noticeId, "RETRY"], [claims[4]!.noticeId, "SENT"]]);
  });
  it("goes out through the production sendmail path: one message on the dev capture, to the account, in its language, with the Terms link", async () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-moderation-mail-"));
    const previous = process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR;
    process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR = join(root, "mail");
    try {
      const sendmail = new TemplatedMailSender({ executable: resolve("deploy/dev-auth/sendmail-capture.mjs"), from: "noreply@localhost.test", timeoutMs: 10_000 });
      const { reconciler, claims, completed } = world([notice("DEBATE_HIDDEN", { mailLocale: "ro" })], sendmail);
      await reconciler.reconcile();
      expect(completed).toEqual([[claims[0]!.noticeId, "SENT"]]);
      const files = readdirSync(join(root, "mail")).filter((name) => name.endsWith(".eml"));
      expect(files).toHaveLength(1);
      const message = readFileSync(join(root, "mail", files[0]!), "utf8");
      expect(message).toMatch(/^To: bea@example\.test\r?$/mu);
      expect(message).toContain(`Message-ID: <${claims[0]!.noticeId}@`);
      expect(message).toContain("Content-Language: ro");
      const text = [...message.matchAll(/Content-Transfer-Encoding: base64\r\n(?:[^\r\n]+\r\n)*\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)]
        .map((match) => Buffer.from(match[1]!.replaceAll("\r\n", ""), "base64").toString("utf8")).join("\n");
      expect(text).toContain("dezbaterea dumneavoastră publică a fost scoasă de pe pagina publică");
      expect(text).toContain("https://debate.example.test/terms");
    } finally {
      if (previous === undefined) delete process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR;
      else process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR = previous;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
