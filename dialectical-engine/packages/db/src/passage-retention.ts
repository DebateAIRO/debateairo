import type { Pool, PoolClient } from "pg";
import type { CryptoEnvelope } from "@debateai/crypto";
import type { WebSealed } from "./web-evidence.js";

/**
 * Page texts and passages go when nothing runs (migration 0139; plan 2026-10-31-r22-owner-changes decisions 6 and 7), through 0139's definers only,
 * on the runner's pool: the shown quotes' reader (`readShownQuotes`), which the API's answer read calls too, is debateai_runtime's; the writers of a
 * debate's replies and shown quotes, the sweep's list (`readHolding`), the wipe and the replies' reader (`readReplyTexts`) need the cross-account
 * marker (debateai_rls_all_accounts), which the runner, the scheduler and the API's system pool outside a request hold and the API's request login
 * does not (0171, the security review's F5).
 *
 * THE RECORDED FORM. A passage lives in four kinds of place. Two are rows the wipe deletes (identity.web_extract, identity.web_pack). Two
 * are the append-only AI call records, which nothing may edit (sealed values are never edited, and they replay byte for byte), so they must
 * never hold it, from the moment they are written, as W3-0 does for page texts:
 * - a reader's saved reply (`ledger.raw_artifact`): the gateway stores the vendor's bytes with `recordReplyText` and records only
 *   `webReplyTextRef(artifactId)`; the replay book (apps/runner/src/run-replay.ts) swaps the reference back from `readReplyTexts`. A reference
 *   with no stored text reads as no reply: the call cannot be replayed, the same path an unreadable reply already takes. The reply's parse
 *   error detail is recorded as null for these calls: it can quote the reply.
 * - a prompt carrying a passage (`ledger.call_prompt`): the pack's and a cited extract's `quote`, and a rejected reader reply inside a repair
 *   packet, stand as `webExtractTextRef(extractId)` or `webReplyTextRef(artifactId)` in the recorded packet; `packetWithPageTexts`
 *   (packages/providers sent-form.ts) already fills whole-text references in for the vendor only, at any escape level.
 *
 * What the Retention lane must respect:
 * - `recordShownQuote` right after each extract, or the wipe answers QUOTES_MISSING: the quote must survive, so it goes first.
 * - Every later reader (the page, digs, climbs, answer updates, reports) reads `readShownQuotes`, never identity.web_extract or a pack.
 * - `wipe` when a debate settles and after a report is written, and `readHolding` for the sweep. STILL_RUNNING is normal: try later.
 * - Close with identity.close_investigation_keeping_texts, not 0133's, which would take the "other pages" with it.
 */
type Executor = Pick<Pool, "query"> | PoolClient;

export const WEB_SHOWN_QUOTE_CARRIER = "identity.web_shown_quote" as const;
export const WEB_REPLY_TEXT_CARRIER = "identity.web_reply_text" as const;
export const READ_DATA_EXPORT_PASSAGE_RETENTION = "identity.read_data_export_passage_retention(uuid,uuid)" as const;

const REF_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
function refOf(prefix: string, id: string): string {
  if (!REF_ID.test(id)) throw new TypeError("PASSAGE_REF_ID_INVALID");
  return `${prefix}:${id}`;
}
/** The name a call record carries in place of a reader's saved reply: all of raw_artifact's recorded text. */
export const webReplyTextRef = (artifactId: string): string => refOf("web-reply-text", artifactId);
/** The name a prompt carries in place of a passage. */
export const webExtractTextRef = (extractId: string): string => refOf("web-extract-text", extractId);
/** The artifact id a recorded reply names, or null when it is an ordinary reply. */
export function webReplyTextIdOf(recorded: string): string | null {
  const match = /^web-reply-text:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u.exec(recorded);
  return match?.[1] ?? null;
}

export type WebShownQuoteRead = Readonly<{
  extract_id: string; page_id: string; path_ref: string; label: string; found_by: readonly number[]; created_at: string;
  /** Sealed `{ quote }`, under the run's key, bound to the extract id. */
  content: CryptoEnvelope;
}>;
export type PassageWipeReason = "NOTHING_RUNS" | "REPORT_WRITTEN";
export type PassageWipeResult = Readonly<{
  outcome: "WIPED" | "STILL_RUNNING" | "NOT_LIVE" | "QUOTES_MISSING"; pageTexts: number; extracts: number; packs: number; replies: number;
}>;

export class PostgresPassageRetentionRepository {
  constructor(private readonly pool: Executor) {}

  async recordShownQuote(runId: string, extractId: string, sealed: WebSealed): Promise<"RECORDED" | "ALREADY" | "NOT_LIVE" | "UNKNOWN_EXTRACT"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_LIVE" | "UNKNOWN_EXTRACT" }>(
      "SELECT identity.record_web_shown_quote($1,$2,$3::jsonb,$4) AS outcome",
      [runId, extractId, JSON.stringify(sealed.envelope), sealed.attestation])).rows[0]!.outcome;
  }

  /** A live debate's shown quotes by label; null when it is not a live private debate or, in a request, not the connection's own (0171). */
  async readShownQuotes(runId: string): Promise<readonly WebShownQuoteRead[] | null> {
    return (await this.pool.query<{ quotes: WebShownQuoteRead[] | null }>(
      "SELECT identity.read_web_shown_quotes($1) AS quotes", [runId])).rows[0]?.quotes ?? null;
  }

  async recordReplyText(runId: string, artifactId: string, sealed: WebSealed): Promise<"RECORDED" | "ALREADY" | "NOT_LIVE"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_LIVE" }>(
      "SELECT identity.record_web_reply_text($1,$2,$3::jsonb,$4) AS outcome",
      [runId, artifactId, JSON.stringify(sealed.envelope), sealed.attestation])).rows[0]!.outcome;
  }

  /** The replay book's read: those still stored; null when the debate is not live. */
  async readReplyTexts(runId: string, artifactIds: readonly string[]): Promise<readonly Readonly<{ artifact_id: string; content: CryptoEnvelope }>[] | null> {
    return (await this.pool.query<{ replies: Array<{ artifact_id: string; content: CryptoEnvelope }> | null }>(
      "SELECT identity.read_web_reply_texts($1,$2::uuid[]) AS replies", [runId, [...artifactIds]])).rows[0]?.replies ?? null;
  }

  /** One debate's whole page texts and passages, when nothing runs on it. The notes, links, quotes and "other pages" stay. */
  async wipe(runId: string, reason: PassageWipeReason): Promise<PassageWipeResult> {
    const row = (await this.pool.query<{ outcome: PassageWipeResult["outcome"]; page_texts: number; extracts: number; packs: number; replies: number }>(
      "SELECT outcome,page_texts,extracts,packs,replies FROM identity.wipe_debate_passages($1,$2)", [runId, reason])).rows[0]!;
    return Object.freeze({ outcome: row.outcome, pageTexts: row.page_texts, extracts: row.extracts, packs: row.packs, replies: row.replies });
  }

  /** The debates a sweep may wipe, oldest first. */
  async readHolding(limit = 100): Promise<readonly string[]> {
    return (await this.pool.query<{ runs: string[] }>("SELECT identity.read_debates_holding_passages($1) AS runs", [limit])).rows[0]!.runs;
  }
}

/** The API's pool (debateai_billing_runtime): 0133's closing without its wipe. */
export class PostgresInvestigationClosingRepository {
  constructor(private readonly pool: Executor) {}

  async closeKeepingTexts(ownerRef: string, investigationId: string): Promise<Readonly<{
    outcome: "CLOSED" | "ALREADY_CLOSED" | "NOT_OWNED"; reportVersion: number | null }>> {
    const row = (await this.pool.query<{ outcome: "CLOSED" | "ALREADY_CLOSED" | "NOT_OWNED"; report_version: number | null }>(
      "SELECT outcome,report_version FROM identity.close_investigation_keeping_texts($1,$2)", [ownerRef, investigationId])).rows[0]!;
    return Object.freeze({ outcome: row.outcome, reportVersion: row.report_version });
  }
}
