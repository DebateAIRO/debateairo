import type { Pool, PoolClient } from "pg";
import type { CryptoEnvelope } from "@debateai/crypto";

/**
 * The web evidence store (migration 0132; Perplexity plan 2026-10-30, task W1-3): what one debate's web step keeps, per
 * run, through 0132's definers on the runner's pool (debateai_runtime) and, for "add to researched", the API's own
 * pool (debateai_billing_runtime). No table is read directly.
 *
 * Every content value is a run content carrier: the caller seals it under the run's key BEFORE calling, with the
 * carrier name below and the row's own id as the primary key (this package's attested encrypt helpers, under the
 * run's content lease, purpose "content_ciphertext"), and passes the envelope with its attestation. 0132 refuses a run without content encryption (WEB_EVIDENCE_ENCRYPTION_REQUIRED) and an envelope whose
 * attestation does not match (CONTENT_ATTESTATION_INVALID): no web text is ever kept as plaintext.
 *
 * What the later tasks must respect (W2, W3-1, W4):
 * - The page text lives ONLY in identity.web_page_text. A reader's prompt, as kept in ledger.call_prompt and replayed
 *   byte for byte (run-replay.ts), must name each page by `webPageTextRef(pageId, textDigest)` and the runner must put
 *   the text in only on the way to the vendor; no raw artifact may echo it.
 * - `textDigest` is a KEYED digest (for example HMAC-SHA-256 under the run's attestation secret), never a plain hash of
 *   public text; a replay compares it with the stored one, and a WIPED text (`textState`) cannot be replayed: fetch it
 *   again (W4-2).
 * - Store the searches and pages (with their texts) before any reader call, so a resumed run reads them back.
 * - Each writer answers RECORDED or ALREADY (a resumed run's second write; the first stays), NOT_LIVE (the debate was
 *   deleted or its account is gone: stop the web step), or its own refusal word.
 */
export const WEB_EVIDENCE_CARRIERS = Object.freeze({
  search: "identity.web_search",
  page: "identity.web_page",
  pageText: "identity.web_page_text",
  reading: "identity.web_reading",
  extract: "identity.web_extract",
  pack: "identity.web_pack"
} as const);

/** 0132's runner-side functions (debateai_runtime), the API's one, and the erasure and export readers. */
export const WEB_EVIDENCE_RUNNER_FUNCTIONS = Object.freeze([
  "identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea)",
  "identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea)",
  "identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea)",
  "identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea)",
  "identity.record_web_picks(uuid,text,uuid[])",
  "identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea)",
  "identity.read_web_evidence(uuid)",
  "identity.read_web_page_texts(uuid,uuid[])",
  "identity.settle_web_researched(uuid,uuid,text)"
] as const);
export const RECORD_WEB_RESEARCHED = "identity.record_web_researched(uuid,uuid,uuid)" as const;
export const READ_DATA_EXPORT_WEB_EVIDENCE = "identity.read_data_export_web_evidence(uuid,uuid)" as const;

/** The name a ledger prompt carries in place of a page's text (never the text itself). */
export function webPageTextRef(pageId: string, textDigest: Buffer): string {
  if (textDigest.length !== 32) throw new TypeError("WEB_PAGE_TEXT_DIGEST_INVALID");
  return `web-page-text:${pageId}@${textDigest.toString("hex")}`;
}

/** A sealed content value: the envelope and the runner's attestation of it (packages/db encryptAttested*). */
export type WebSealed = Readonly<{ envelope: CryptoEnvelope; attestation: Buffer }>;
export type WebWriteOutcome = "RECORDED" | "ALREADY" | "NOT_LIVE";
type Executor = Pick<Pool, "query"> | PoolClient;

export type WebSearchRecord = Readonly<{
  runId: string; searchId: string; pathRef: string; side: "for" | "against" | "dig";
  languageKind: "english" | "local"; language: string; country: string | null; lookBack: "12m" | "3y" | "none";
  outcome: "FOUND" | "EMPTY" | "FAILED" | "REFUSED"; chargeMicros: number; resultCount: number;
  /** The search words, sealed; null exactly for a REFUSED search (it keeps no words). */
  words: WebSealed | null;
}>;
export type WebPageRecord = Readonly<{
  runId: string; pageId: string; searchId: string; rank: number; readDepth: "whole" | "preview" | "abstract";
  /** Address, site, title and date, sealed. */
  about: WebSealed;
  /** The whole text, sealed under the page_id (carrier identity.web_page_text), with its size and keyed digest. */
  text: Readonly<{ chars: number; digest: Buffer; sealed: WebSealed }> | null;
}>;
export type WebReadingRecord = Readonly<{
  runId: string; readingId: string; pageId: string; reader: 1 | 2 | 3; maker: string;
  outcome: "READ" | "FAILED"; grade: 0 | 1 | 2 | 3 | null;
  /** The reader's one line and leads, sealed; null exactly for a FAILED reading. */
  line: WebSealed | null;
}>;
export type WebExtractRecord = Readonly<{
  runId: string; extractId: string; pageId: string; label: string; foundBy: readonly (1 | 2 | 3)[]; quote: WebSealed;
}>;
export type WebPackRecord = Readonly<{
  runId: string; packId: string; pathRef: string; extractLabels: readonly string[]; pack: WebSealed;
}>;

export type WebEvidenceRead = Readonly<{
  searches: readonly Readonly<{ search_id: string; path_ref: string; side: string; language_kind: string; language: string;
    country: string | null; look_back: string; outcome: string; charge_micros: number; result_count: number;
    searched_at: string; content: CryptoEnvelope | null }>[];
  pages: readonly Readonly<{ page_id: string; search_id: string; rank: number; read_depth: string; text_chars: number | null;
    text_digest: string | null; found_at: string; content: CryptoEnvelope; text_state: "STORED" | "WIPED" | "NONE" }>[];
  readings: readonly Readonly<{ reading_id: string; page_id: string; reader: number; maker: string; outcome: string;
    grade: number | null; read_at: string; content: CryptoEnvelope | null }>[];
  extracts: readonly Readonly<{ extract_id: string; page_id: string; path_ref: string; label: string; found_by: number[];
    created_at: string; content: CryptoEnvelope }>[];
  picks: readonly Readonly<{ path_ref: string; rank: number; page_id: string }>[];
  packs: readonly Readonly<{ pack_id: string; path_ref: string; extract_labels: string[]; created_at: string;
    content: CryptoEnvelope }>[];
  researched: readonly Readonly<{ page_id: string; path_ref: string; chosen_at: string; outcome: string | null;
    settled_at: string | null }>[];
}>;

const envelope = (sealed: WebSealed | null): string | null => sealed === null ? null : JSON.stringify(sealed.envelope);
const attestation = (sealed: WebSealed | null): Buffer | null => sealed === null ? null : sealed.attestation;
async function outcome<T extends string>(executor: Executor, sql: string, values: readonly unknown[]): Promise<T> {
  return (await executor.query<{ outcome: T }>(sql, [...values])).rows[0]!.outcome;
}

/** The runner's side of 0132 (debateai_runtime). Pass a transaction client to write a step's rows together. */
export class PostgresWebEvidenceRepository {
  constructor(private readonly pool: Executor) {}

  recordSearch(input: WebSearchRecord, executor: Executor = this.pool): Promise<WebWriteOutcome> {
    return outcome(executor, "SELECT identity.record_web_search($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13) AS outcome", [
      input.runId, input.searchId, input.pathRef, input.side, input.languageKind, input.language, input.country,
      input.lookBack, input.outcome, input.chargeMicros, input.resultCount, envelope(input.words), attestation(input.words)]);
  }

  recordPage(input: WebPageRecord, executor: Executor = this.pool): Promise<WebWriteOutcome | "NO_SEARCH"> {
    return outcome(executor, "SELECT identity.record_web_page($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11) AS outcome", [
      input.runId, input.pageId, input.searchId, input.rank, input.readDepth, envelope(input.about), attestation(input.about),
      input.text?.chars ?? null, input.text?.digest ?? null, envelope(input.text?.sealed ?? null),
      attestation(input.text?.sealed ?? null)]);
  }

  recordReading(input: WebReadingRecord, executor: Executor = this.pool): Promise<WebWriteOutcome | "NO_PAGE" | "SAME_MAKER"> {
    return outcome(executor, "SELECT identity.record_web_reading($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) AS outcome", [
      input.runId, input.readingId, input.pageId, input.reader, input.maker, input.outcome, input.grade,
      envelope(input.line), attestation(input.line)]);
  }

  recordExtract(input: WebExtractRecord, executor: Executor = this.pool): Promise<WebWriteOutcome | "NO_PAGE" | "LABEL_TAKEN"> {
    return outcome(executor, "SELECT identity.record_web_extract($1,$2,$3,$4,$5::smallint[],$6::jsonb,$7) AS outcome", [
      input.runId, input.extractId, input.pageId, input.label, [...input.foundBy], envelope(input.quote), attestation(input.quote)]);
  }

  /** A path's top pages, best first (3, or 5 on Thorough). */
  recordPicks(runId: string, pathRef: string, pageIds: readonly string[], executor: Executor = this.pool):
    Promise<WebWriteOutcome | "NOT_THIS_PATH"> {
    return outcome(executor, "SELECT identity.record_web_picks($1,$2,$3::uuid[]) AS outcome", [runId, pathRef, [...pageIds]]);
  }

  recordPack(input: WebPackRecord, executor: Executor = this.pool): Promise<WebWriteOutcome | "UNKNOWN_EXTRACT"> {
    return outcome(executor, "SELECT identity.record_web_pack($1,$2,$3,$4::text[],$5::jsonb,$6) AS outcome", [
      input.runId, input.packId, input.pathRef, [...input.extractLabels], envelope(input.pack), attestation(input.pack)]);
  }

  /** Everything the run's web step kept but the page texts, or null when the debate is not live. */
  async read(runId: string): Promise<WebEvidenceRead | null> {
    return (await this.pool.query<{ web: WebEvidenceRead | null }>("SELECT identity.read_web_evidence($1) AS web", [runId]))
      .rows[0]?.web ?? null;
  }

  /** The stored texts of up to 64 of the run's pages; a wiped or never-kept text is absent. */
  async readPageTexts(runId: string, pageIds: readonly string[]):
    Promise<readonly Readonly<{ pageId: string; textDigest: Buffer; envelope: CryptoEnvelope }>[]> {
    const rows = (await this.pool.query<{ page_id: string; text_digest: Buffer; content_ciphertext: CryptoEnvelope }>(
      "SELECT page_id,text_digest,content_ciphertext FROM identity.read_web_page_texts($1,$2::uuid[])", [runId, [...pageIds]])).rows;
    return Object.freeze(rows.map((row) => Object.freeze({ pageId: row.page_id, textDigest: row.text_digest, envelope: row.content_ciphertext })));
  }

  /** The readers' outcome of a page the person added to "researched" (W4-4), set once. */
  settleResearched(runId: string, pageId: string, settled: "ADDS" | "DOES_NOT_ADD" | "FAILED"):
    Promise<"SETTLED" | "ALREADY" | "NOT_CHOSEN" | "NOT_LIVE"> {
    return outcome(this.pool, "SELECT identity.settle_web_researched($1,$2,$3) AS outcome", [runId, pageId, settled]);
  }
}

/** The API's side of 0132 (debateai_billing_runtime): the person adds an other page of a path to "researched". */
export class PostgresWebResearchedRepository {
  constructor(private readonly pool: Executor) {}

  record(ownerRef: string, runId: string, pageId: string): Promise<"RECORDED" | "ALREADY" | "NOT_OWNED" | "NOT_OTHER_PAGE"> {
    return outcome(this.pool, "SELECT identity.record_web_researched($1,$2,$3) AS outcome", [ownerRef, runId, pageId]);
  }
}
