// apps/runner/src/web-reuse.ts
/**
 * WEB SEARCH: PAGES ALREADY READ IN THE INVESTIGATION (Perplexity plan 2026-10-30, task W4-2; owner Q9: "pages already
 * read in the investigation are reused, not paid again"; Q4: a wiped page is fetched again, about 0.1¢ a search).
 *
 * Plain words: a dig belongs to an investigation (0133) with its first debate and the other digs. When the dig's search
 * finds a page one of them already read, the page is not read again: what its readers gave there (reader 1's grade, line
 * and copied passages, and readers 2 and 3's readings and checked extracts when it was one of their top pages) is carried
 * into the dig. Its text comes from the investigation's store while it is kept there; once a report closed the
 * investigation (or 30 days passed) it was wiped, and the text the dig's own search just brought back is used instead:
 * that search is the fetch again, its one charge (0.1¢) all it costs, no reader paid.
 *
 * - A page counts as read when reader 1 READ it (0132's identity.web_reading). The same address is matched as the page
 *   rules match it (`addressKey`: no scheme, no www, no tracking parameters). The first member to have read it, in the
 *   order they joined, is the one reused.
 * - Each member's rows are opened under that member's own key, one short lease at a time, after the dig's searches and
 *   before any reader call: no lease waits on a vendor.
 * - What a page carries is sealed into the dig's own reader-1 reading at once (`reusedReadingContent`), before any
 *   reader call: a copy of the dig claimed again reads it back from its own store (`reusedOfReadingContent`), so it reuses
 *   exactly the same pages and sends byte-identical prompts.
 * - Nothing here stops the dig: an investigation that cannot be read leaves every page to be read as usual.
 */
import type { Pool } from "pg";
import {
  PostgresInvestigationRunnerRepository, PostgresWebEvidenceRepository, WEB_EVIDENCE_CARRIERS, decryptLeasedContentForRun,
  prepareLeasedContentEncryptionForRun, type CryptoEnvelope
} from "@debateai/db";
import { addressKey } from "@debateai/evidence";

export type WebReaderNumber = 1 | 2 | 3;
export type WebReusedGrade = 0 | 1 | 2 | 3;
/** A reading of readers 2 and 3 carried from the investigation (their maker, outcome and grade). */
export type WebReusedTopReading = Readonly<{ reader: 2 | 3; maker: string; outcome: "READ" | "FAILED"; grade: WebReusedGrade | null }>;
/** A checked extract of the page carried from the investigation, with the readers that found it. */
export type WebReusedExtract = Readonly<{ quote: string; foundBy: readonly WebReaderNumber[] }>;

/** A page the investigation already read, as the dig reuses it. */
export type WebReusedPage = Readonly<{
  /** Where it was read: the member debate and its page row. */
  sourceRunId: string;
  sourcePageId: string;
  /** Its text as the investigation keeps it, or null once wiped (the dig's own search then brought it back). */
  text: string | null;
  /** Reader 1's reading: grade, its one line (in the site's language then) and the maker that read it. */
  grade: WebReusedGrade;
  line: string;
  lineLanguage: string;
  readerOneMaker: string;
  /** Readers 2 and 3's readings, when the page was one of their top pages there; empty otherwise (they read it now). */
  topReadings: readonly WebReusedTopReading[];
  /** The page's checked extracts there (reader 1's among them), in label order. */
  extracts: readonly WebReusedExtract[];
}>;

/** The investigation's read pages, found by address (`addressKey`); a page none of its debates read is absent. */
export interface WebReuseSource {
  find(addresses: readonly string[]): Promise<ReadonlyMap<string, WebReusedPage>>;
}

/** Reader 1's own passages among the carried extracts (it found them), for the pick and readers 2 and 3. */
export function reusedReaderOneExtracts(page: WebReusedPage): readonly string[] {
  return Object.freeze(page.extracts.filter((extract) => extract.foundBy.includes(1)).map((extract) => extract.quote));
}

/* ----------------------------------------------------------------- kept in the dig's own reader-1 reading */

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isGrade = (value: unknown): value is WebReusedGrade => value === 0 || value === 1 || value === 2 || value === 3;
const isReader = (value: unknown): value is WebReaderNumber => value === 1 || value === 2 || value === 3;

/**
 * The dig's reader-1 reading of a reused page, as sealed (`{ line, language }`, serve W3-3's shape, plus `reused`): where
 * it was read and everything carried, but never its text (the dig keeps that in its own page-text row).
 */
export function reusedReadingContent(page: WebReusedPage): Readonly<Record<string, unknown>> {
  return Object.freeze({
    line: page.line,
    language: page.lineLanguage,
    reused: Object.freeze({
      run_id: page.sourceRunId, page_id: page.sourcePageId, wiped: page.text === null,
      top_readings: page.topReadings.map((reading) => ({ reader: reading.reader, maker: reading.maker, outcome: reading.outcome,
        grade: reading.grade })),
      extracts: page.extracts.map((extract) => ({ quote: extract.quote, found_by: [...extract.foundBy] }))
    })
  });
}

/**
 * A stored reader-1 reading read back: the reused page it carries, or null for a reading the dig's reader 1 made itself.
 * `keptText` is the dig's own stored text: it stands for the investigation's, unless the page was wiped there (null).
 */
export function reusedOfReadingContent(value: unknown, grade: number | null, maker: string, keptText: string): WebReusedPage | null {
  if (!isRecord(value) || !isRecord(value.reused) || !isGrade(grade)) return null;
  const reused = value.reused;
  if (typeof value.line !== "string" || typeof value.language !== "string" || typeof reused.run_id !== "string"
    || typeof reused.page_id !== "string" || !Array.isArray(reused.top_readings) || !Array.isArray(reused.extracts)) return null;
  const topReadings = reused.top_readings.flatMap((entry: unknown): WebReusedTopReading[] => {
    if (!isRecord(entry) || (entry.reader !== 2 && entry.reader !== 3) || typeof entry.maker !== "string"
      || (entry.outcome !== "READ" && entry.outcome !== "FAILED") || !(entry.grade === null || isGrade(entry.grade))) return [];
    return [Object.freeze({ reader: entry.reader, maker: entry.maker, outcome: entry.outcome, grade: entry.grade })];
  });
  const extracts = reused.extracts.flatMap((entry: unknown): WebReusedExtract[] => {
    if (!isRecord(entry) || typeof entry.quote !== "string" || !Array.isArray(entry.found_by)
      || entry.found_by.length === 0 || !entry.found_by.every(isReader)) return [];
    return [Object.freeze({ quote: entry.quote, foundBy: Object.freeze([...entry.found_by as WebReaderNumber[]]) })];
  });
  return Object.freeze({ sourceRunId: reused.run_id, sourcePageId: reused.page_id, text: reused.wiped === true ? null : keptText, grade, line: value.line,
    lineLanguage: value.language, readerOneMaker: maker, topReadings: Object.freeze(topReadings), extracts: Object.freeze(extracts) });
}

/* ----------------------------------------------------------------- the investigation in PostgreSQL */

const textOf = (value: unknown, key: string): string | null => isRecord(value) && typeof value[key] === "string" ? value[key] : null;

/**
 * The investigation's read pages on the runner's pool (debateai_runtime): 0133's members (`read_investigation_of_run`),
 * each other member's 0132 rows (`read_web_evidence`, `read_web_page_texts`), each opened under its own run's key in a
 * short lease of its own. A member that is gone (erased, not live) or keeps no content key is skipped.
 */
export function postgresWebReuseSource(pool: Pool, runId: string): WebReuseSource {
  return Object.freeze({
    find: async (addresses: readonly string[]): Promise<ReadonlyMap<string, WebReusedPage>> => {
      const found = new Map<string, WebReusedPage>();
      const wanted = new Set(addresses);
      if (wanted.size === 0) return found;
      const investigation = await new PostgresInvestigationRunnerRepository(pool).ofRun(runId);
      if (investigation === null) return found;
      const others = investigation.members.map((member) => member.run_id).filter((member) => member.toLowerCase() !== runId.toLowerCase());
      const store = new PostgresWebEvidenceRepository(pool);
      for (const memberRunId of others) {
        if (found.size === wanted.size) break;
        const evidence = await store.read(memberRunId);
        if (evidence === null || evidence.pages.length === 0) continue;
        const leased = await prepareLeasedContentEncryptionForRun(pool, memberRunId);
        try {
          if (leased.prepared === null) continue;
          const open = (carrier: (typeof WEB_EVIDENCE_CARRIERS)[keyof typeof WEB_EVIDENCE_CARRIERS], id: string,
            envelope: CryptoEnvelope | null): unknown => decryptLeasedContentForRun<unknown>(leased, carrier, id, envelope, null);
          for (const page of evidence.pages) {
            const one = evidence.readings.find((reading) => reading.page_id === page.page_id && reading.reader === 1
              && reading.outcome === "READ");
            if (one === undefined || !isGrade(one.grade)) continue;
            const url = textOf(open(WEB_EVIDENCE_CARRIERS.page, page.page_id, page.content), "url");
            const key = url === null ? null : addressKey(url);
            if (key === null || !wanted.has(key) || found.has(key)) continue;
            const reading = open(WEB_EVIDENCE_CARRIERS.reading, one.reading_id, one.content);
            const line = textOf(reading, "line");
            const language = textOf(reading, "language");
            if (line === null || language === null) continue;
            const extracts = evidence.extracts.filter((extract) => extract.page_id === page.page_id).flatMap((extract): WebReusedExtract[] => {
              const quote = textOf(open(WEB_EVIDENCE_CARRIERS.extract, extract.extract_id, extract.content), "quote");
              const foundBy = extract.found_by.filter(isReader);
              return quote === null || foundBy.length === 0 ? [] : [Object.freeze({ quote, foundBy: Object.freeze(foundBy) })];
            });
            const topReadings = evidence.readings.filter((entry) => entry.page_id === page.page_id && (entry.reader === 2 || entry.reader === 3))
              .map((entry): WebReusedTopReading => Object.freeze({ reader: entry.reader as 2 | 3, maker: entry.maker,
                outcome: entry.outcome === "READ" ? "READ" as const : "FAILED" as const, grade: isGrade(entry.grade) ? entry.grade : null }));
            let text: string | null = null;
            if (page.text_state === "STORED") {
              const kept = (await store.readPageTexts(memberRunId, [page.page_id]))[0];
              const opened = kept === undefined ? null : open(WEB_EVIDENCE_CARRIERS.pageText, page.page_id, kept.envelope);
              text = typeof opened === "string" ? opened : null;
            }
            found.set(key, Object.freeze({ sourceRunId: memberRunId, sourcePageId: page.page_id, text, grade: one.grade, line,
              lineLanguage: language, readerOneMaker: one.maker, topReadings: Object.freeze(topReadings), extracts: Object.freeze(extracts) }));
          }
          await leased.assertLive();
        } finally {
          await leased.close();
        }
      }
      return found;
    }
  });
}
