import * as contract from "@debateai/contract";
import { decrypt, type CryptoEnvelope, type PreparedPublicationCipher, type ReadableUserDekStore } from "@debateai/crypto";
import type { ModerationStatementClaim, ModerationStatementGround, ModerationStatementKind, ModerationStatementOutcome, OwnModerationStatementRead, PostgresModerationStatementRepository,
  PostgresPublicFlagMailRepository, PublicFlagMailClaim, PublicFlagMailKind } from "@debateai/db";
import type { MailTemplateId } from "@debateai/mail-templates";
import { isSingleDeliverableRecipient, type TemplatedMailChannel } from "./mail-channel.js";

/**
 * THE STATEMENT OF REASONS (migration 0157; DSA Art 17; the owner's D1, D3, D6-D9 of 6 November 2026). Each review step queued one statement per person
 * it affects; this mails each once, to the account's address as it is now, in the language the person last accepted the Terms in. It replaces 0156's
 * notice: the new release no longer calls 0156's claim, so a person gets this mail and not both (the release before still may, side by side).
 * WHAT IT SAYS (D1): what was done, everywhere and until when; where the facts came from; how automated means were used; the ground; office@ and the
 * three routes; a link to the item and one to the full statement in the person's account, which alone shows the facts and the quote. Every one of
 * those is a flag or a link: no words of the debate, no staff id and nobody's name are ever mailed. Its Reply-To is office@ (D6).
 */
const TEMPLATE_OF: Readonly<Record<ModerationStatementKind, MailTemplateId>> = Object.freeze({
  DEBATE_HIDDEN: "MODERATION_STATEMENT_DEBATE_HIDDEN",
  DEBATE_DECIDED: "MODERATION_STATEMENT_DEBATE_DECIDED",
  CONTRIBUTION_REMOVED: "MODERATION_STATEMENT_CONTRIBUTION_REMOVED",
  REPORT_REMOVED: "MODERATION_STATEMENT_REPORT_REMOVED",
  CORRECTED: "MODERATION_STATEMENT_CORRECTED",
  CONTRIBUTION_AFFECTED: "MODERATION_STATEMENT_CONTRIBUTION_AFFECTED",
  REPORT_AFFECTED: "MODERATION_STATEMENT_REPORT_AFFECTED",
  CONTRIBUTION_DECIDED: "MODERATION_STATEMENT_CONTRIBUTION_DECIDED",
  REPORT_DECIDED: "MODERATION_STATEMENT_REPORT_DECIDED"
});
/** The mail's flag for each ground code. */
const GROUND_FLAGS: Readonly<Record<string, string>> = Object.freeze({
  REVIEW_HOLD: "groundHold", UNLAWFUL: "groundUnlawful", HATE_SPEECH: "groundHate", WEAPONS_OR_DRUGS: "groundWeapons", SUICIDE_OR_HARM: "groundSuicide",
  RELIGIOUS_INSULT: "groundReligious", PERSONAL_DATA: "groundPersonal", ILLEGAL: "groundIllegal"
});
const SOURCE_FLAGS: Readonly<Record<string, string>> = Object.freeze({ REPORT_BUTTON: "sourceReport", EMAIL_NOTICE: "sourceEmail", AUTHORITY_ORDER: "sourceAuthority", OWN_INITIATIVE: "sourceOwn" });
const flag = (value: boolean): string => (value ? "true" : "false");

/**
 * The mail's params for one statement: two links, the date and one flag each. A staff hide relies on the hold alone, and what a person suspected stays on
 * the page; the automatic hide relied on the rule the check found, so that rule is named beside the hold (D2).
 */
export function statementMailParams(input: Readonly<{ happenedAt: string; itemUrl: string; statementUrl: string; ground: ModerationStatementGround }>): Record<string, string> {
  const grounds = new Set([...input.ground.grounds, ...(input.ground.automated_decision ? input.ground.suspected : [])]);
  const params: Record<string, string> = { happened: new Date(input.happenedAt).toISOString(), itemUrl: input.itemUrl, statementUrl: input.statementUrl,
    automatedDecision: flag(input.ground.automated_decision), automatedDetection: flag(input.ground.automated_detection), groundNone: flag(!input.ground.recorded) };
  for (const [code, name] of Object.entries(GROUND_FLAGS)) params[name] = flag(input.ground.recorded && grounds.has(code));
  for (const [code, name] of Object.entries(SOURCE_FLAGS)) params[name] = flag(input.ground.sources.includes(code));
  return params;
}

export class ModerationStatementReconciler {
  private readonly appUrl: string;

  constructor(private readonly repository: Pick<PostgresModerationStatementRepository, "claim" | "read" | "complete">, private readonly users: Pick<ReadableUserDekStore, "load">,
    private readonly channel: Pick<TemplatedMailChannel, "sendTemplated">, publicAppUrl: string) {
    this.appUrl = publicAppUrl;
  }

  /**
   * One pass. A statement whose send failed is claimable again after its claim runs out; the database ends it after twenty tries. M5 (owner, 10 Nov
   * 2026): a settle that throws (the database went away for a moment) is logged by its marker alone and the pass goes on, so one claim never stops
   * the others; the one it could not settle is claimable again when its claim runs out.
   */
  async reconcile(limit = 100): Promise<void> {
    for (const claim of await this.repository.claim(limit)) {
      let outcome: ModerationStatementOutcome;
      try { outcome = await this.send(claim); } catch { outcome = "RETRY"; }
      try { await this.repository.complete(claim, outcome); } catch { console.error("[MODERATION_STATEMENT_COMPLETE_FAILED]"); }
    }
  }

  private async send(claim: ModerationStatementClaim): Promise<ModerationStatementOutcome> {
    const statement = await this.repository.read(claim);
    if (statement === null) return "DROPPED";
    let dek: Buffer | undefined, plain: Buffer | undefined;
    try {
      dek = await this.users.load(statement.userId);
      plain = decrypt(dek, statement.emailCiphertext, ["identity", "user.email_ciphertext", statement.userId, "run:none", statement.userId, `user-dek:${statement.userId}`, "1"]);
      const recipient = plain.toString("utf8");
      if (!isSingleDeliverableRecipient(recipient)) return "DROPPED";
      await this.channel.sendTemplated({ to: recipient, templateId: TEMPLATE_OF[statement.kind], locale: statement.mailLocale, messageId: claim.statementId,
        params: statementMailParams({ happenedAt: statement.happenedAt, ground: statement.ground,
          itemUrl: new URL(`/public/debate/${encodeURIComponent(statement.publicationRef)}`, this.appUrl).toString(),
          statementUrl: new URL(`/settings/notices#${encodeURIComponent(statement.statementId)}`, this.appUrl).toString() }) });
      return "SENT";
    } finally {
      plain?.fill(0);
      dek?.fill(0);
    }
  }
}

/* ----------------------------------------------------------------- the answers to people who report (D4) */

/**
 * The reporter's answers (DSA Art 16(4)-(6)): the receipt of a report a person will read, the automatic check's two decisions, and a person's
 * decision (a close, or a review step that names the report). Each says when and links to the debate; the decisions say how automated means were
 * used and give office@ and the routes. No words of the report or of the debate, no staff id, and nothing of the reporter but their own address.
 * Reply-To office@ on the decisions (D6); the receipt has none.
 */
const FLAG_TEMPLATE_OF: Readonly<Record<PublicFlagMailKind, MailTemplateId>> = Object.freeze({
  RECEIPT: "PUBLIC_FLAG_ANSWER_RECEIPT",
  AUTO_HIDDEN: "PUBLIC_FLAG_ANSWER_AUTO_HIDDEN",
  AUTO_NOT_FOUND: "PUBLIC_FLAG_ANSWER_AUTO_NOT_FOUND",
  NO_BREACH: "PUBLIC_FLAG_ANSWER_NO_BREACH",
  ACTED: "PUBLIC_FLAG_ANSWER_ACTED"
});

export class PublicFlagAnswerReconciler {
  constructor(private readonly repository: Pick<PostgresPublicFlagMailRepository, "claim" | "read" | "complete">, private readonly users: Pick<ReadableUserDekStore, "load">,
    private readonly channel: Pick<TemplatedMailChannel, "sendTemplated">, private readonly appUrl: string) {}

  /** One pass. A mail whose send failed is claimable again after its claim runs out; the database ends it after twenty tries. M5: as the statements'. */
  async reconcile(limit = 100): Promise<void> {
    for (const claim of await this.repository.claim(limit)) {
      let outcome: ModerationStatementOutcome;
      try { outcome = await this.send(claim); } catch { outcome = "RETRY"; }
      try { await this.repository.complete(claim, outcome); } catch { console.error("[PUBLIC_FLAG_ANSWER_COMPLETE_FAILED]"); }
    }
  }

  private async send(claim: PublicFlagMailClaim): Promise<ModerationStatementOutcome> {
    const mail = await this.repository.read(claim);
    if (mail === null) return "DROPPED";
    let dek: Buffer | undefined, plain: Buffer | undefined;
    try {
      dek = await this.users.load(mail.userId);
      plain = decrypt(dek, mail.emailCiphertext, ["identity", "user.email_ciphertext", mail.userId, "run:none", mail.userId, `user-dek:${mail.userId}`, "1"]);
      const recipient = plain.toString("utf8");
      if (!isSingleDeliverableRecipient(recipient)) return "DROPPED";
      await this.channel.sendTemplated({ to: recipient, templateId: FLAG_TEMPLATE_OF[mail.kind], locale: mail.mailLocale, messageId: claim.mailId,
        params: { happened: new Date(mail.happenedAt).toISOString(), itemUrl: new URL(`/public/debate/${encodeURIComponent(mail.publicationRef)}`, this.appUrl).toString() } });
      return "SENT";
    } finally {
      plain?.fill(0);
      dek?.fill(0);
    }
  }
}

/* ----------------------------------------------------------------- the signed-in page (D1) */

export type ModerationStatementPorts = Readonly<{
  repository: Pick<PostgresModerationStatementRepository, "readOwn">;
  withKey: <T>(publicationRef: string, runId: string, use: (cipher: PreparedPublicationCipher) => T) => Promise<T>;
}>;
const openedText = (cipher: PreparedPublicationCipher, envelope: CryptoEnvelope | null, field: "facts" | "quote"): string | null => {
  if (envelope === null) return null;
  const opened = cipher.decrypt(envelope) as Record<string, unknown> | null;
  return typeof opened?.[field] === "string" ? opened[field] : null;
};
/** The person's own statements, the facts and the quote opened under each debate's key. A piece that will not open shows no words, never an error. */
export async function moderationStatementsOf(ownerRef: string, ports: ModerationStatementPorts): Promise<contract.ModerationStatements> {
  const statements = [];
  for (const row of await ports.repository.readOwn(ownerRef)) {
    let facts: string[] = [], quote: string | null = null;
    if (row.run_id !== null) {
      const runId = row.run_id;
      const read = (envelopes: readonly (CryptoEnvelope | null)[], envelope: CryptoEnvelope | null) => ports.withKey(row.publication_ref, runId, (cipher) => ({
        facts: envelopes.map((one) => openedText(cipher, one, "facts")).filter((text): text is string => text !== null), quote: openedText(cipher, envelope, "quote") }));
      ({ facts, quote } = await read(row.facts ?? [], row.quote).catch(() => ({ facts: [] as string[], quote: null })));
    }
    statements.push({ statement_id: row.statement_id, kind: row.kind, public_ref: row.publication_ref, happened_at: new Date(row.happened_at).toISOString(), piece_kind: row.piece_kind,
      hidden_now: row.hidden_now, ground: row.ground, facts, facts_deleted: row.facts_deleted, quote,
      places: row.places.map((place) => ({ piece_kind: place.piece_kind, pointer: place.pointer })) });
  }
  return contract.ModerationStatementsSchema.parse({ statements });
}
