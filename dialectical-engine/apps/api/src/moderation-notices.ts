import { decrypt, type ReadableUserDekStore } from "@debateai/crypto";
import type { ModerationNoticeClaim, ModerationNoticeKind, ModerationNoticeOutcome, PostgresModerationNoticeRepository } from "@debateai/db";
import type { MailTemplateId } from "@debateai/mail-templates";
import { isSingleDeliverableRecipient, type TemplatedMailChannel } from "./mail-channel.js";

/**
 * THE MODERATION NOTICE (migration 0156; owner request of 5 November 2026). A review step that took a person's content off the public page queued a
 * notice in its own transaction; this sends it, to the account's address as it is now, in the language the person last accepted the Terms in.
 * WHAT IT SAYS: what left the page and when, and where the Terms are. No reason, no staff name and no text of the debate (decision 33).
 */
const TEMPLATE_OF: Readonly<Record<ModerationNoticeKind, MailTemplateId>> = Object.freeze({
  DEBATE_HIDDEN: "MODERATION_DEBATE_HIDDEN",
  CONTRIBUTION_REMOVED: "MODERATION_CONTRIBUTION_REMOVED",
  REPORT_REMOVED: "MODERATION_REPORT_REMOVED"
});

export class ModerationNoticeReconciler {
  private readonly termsUrl: string;

  constructor(private readonly repository: Pick<PostgresModerationNoticeRepository, "claim" | "read" | "complete">, private readonly users: Pick<ReadableUserDekStore, "load">,
    private readonly channel: Pick<TemplatedMailChannel, "sendTemplated">, publicAppUrl: string) {
    this.termsUrl = new URL("/terms", publicAppUrl).toString();
  }

  /** One pass. A notice whose send failed is claimable again after its claim runs out; the database ends it after twenty tries. */
  async reconcile(limit = 100): Promise<void> {
    for (const claim of await this.repository.claim(limit)) {
      let outcome: ModerationNoticeOutcome;
      try { outcome = await this.send(claim); } catch { outcome = "RETRY"; }
      await this.repository.complete(claim, outcome);
    }
  }

  private async send(claim: ModerationNoticeClaim): Promise<ModerationNoticeOutcome> {
    const notice = await this.repository.read(claim);
    if (notice === null) return "DROPPED";
    let dek: Buffer | undefined, plain: Buffer | undefined;
    try {
      dek = await this.users.load(notice.userId);
      plain = decrypt(dek, notice.emailCiphertext, ["identity", "user.email_ciphertext", notice.userId, "run:none", notice.userId, `user-dek:${notice.userId}`, "1"]);
      const recipient = plain.toString("utf8");
      if (!isSingleDeliverableRecipient(recipient)) return "DROPPED";
      await this.channel.sendTemplated({ to: recipient, templateId: TEMPLATE_OF[notice.kind], locale: notice.mailLocale,
        params: { happened: new Date(notice.happenedAt).toISOString(), termsUrl: this.termsUrl }, messageId: claim.noticeId });
      return "SENT";
    } finally {
      plain?.fill(0);
      dek?.fill(0);
    }
  }
}
