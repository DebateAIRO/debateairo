/**
 * Preview practice: THE PERPLEXITY STAND-IN (Perplexity plan 2026-10-30, task W5-2).
 *
 * Plain words: a scripted Perplexity, so a practice debate's web step can run with no search fee. It answers each search
 * the way Perplexity's Search API answers (`{id, results: [{title, url, snippet, date, last_updated}]}`), from one of two
 * sources:
 *  - made-up pages (`practiceMadeUpSearchReplies`), written here by code from the search's own words: committed, no real
 *    site, no real text;
 *  - saved replies (`practiceSavedSearchReplies`): a folder OUTSIDE the repository of saved Search API replies (the sieve
 *    kitchen's files, `{query, response}`), read as data and never committed. A search whose words match a saved one gets
 *    that reply; any other gets the next saved reply not used yet, in file-name order (the planner writes new words each
 *    run); with none left it is answered with no results (EMPTY).
 *
 * Where it plugs in: in the SEARCH GATE's place (`PreviewBudgetPort`, the `perplexity` member of the practice's gate
 * ports), behind the REAL adapter (`createPerplexitySearchPort`) and the REAL guarded fetch, exactly where
 * tests/support/web-step-world.ts scripts its fetch: the request is built, checked and read by the shipped code, and only
 * the vendor is scripted. `practiceStandInSearchPort` builds that whole chain as one search port, for a web step handed
 * its settings directly (the self-test, WebStepRunnerSettings.search). The stand-in never reaches a socket, never holds
 * or books money (`spentNanoUsd` stays 0), and keeps only counts.
 *
 * Only the practice tool and its tests import this file; apps/runner/src/main.ts never does (tests/unit/
 * practice-search-stand-in.test.ts reads main.ts to keep it so).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
// The W1-2 page rules, as the runner reads them (the practice tool has no package of its own to name @debateai/evidence).
import { selectPathPages } from "../../packages/evidence/src/host-filter.js";
import {
  PERPLEXITY_SEARCH_BOUNDS, PREVIEW_SEARCH_SOCKET_KEY, createPerplexitySearchPort, createPreviewGuardedFetch,
  type PerplexitySearchPort, type PreviewBudgetExecution, type PreviewBudgetPort, type PreviewBudgetPorts
} from "@debateai/providers";
import { assertOutsideRepository } from "./practice-report.js";
import type { PracticeRunnerSettings } from "./practice-runner-composition.js";

/** One result as Perplexity's Search API gives it (the adapter's closed member list). */
export type PracticeSearchResult = Readonly<{ title: string; url: string; snippet: string; date: string | null; last_updated: string | null }>;
/** How a search was answered: its words matched a saved reply, it took the next unused one, made-up pages, or nothing. */
export type PracticeSearchAnswerKind = "SAVED_MATCH" | "SAVED_IN_ORDER" | "MADE_UP" | "NONE_LEFT";
/** A source of replies: the results for one search (at most `maxResults`), and how they were found. */
export type PracticeSearchReplies = Readonly<{
  source: "MADE_UP" | "SAVED";
  answer: (query: string, maxResults: number) => Readonly<{ kind: PracticeSearchAnswerKind; results: readonly PracticeSearchResult[] }>;
}>;

/** The made-up pages' fixed shape: how many per search (Perplexity's own top is 10 at a debate's start, 5 in a dig). */
export const PRACTICE_MADE_UP_PAGES = Object.freeze({ perSearch: 3, date: "2026-03-01" });

const slugOf = (query: string): string => query.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 40) || "search";

/**
 * Made-up pages for a search, written from its words: each page on its own made-up site (the page rules keep one page per
 * site), its first sentence a plain fact a reader can copy word for word. Nothing here is real.
 */
export function practiceMadeUpSearchReplies(perSearch: number = PRACTICE_MADE_UP_PAGES.perSearch): PracticeSearchReplies {
  return Object.freeze({
    source: "MADE_UP" as const,
    answer: (query: string, maxResults: number) => {
      const slug = slugOf(query);
      const results = Array.from({ length: Math.min(perSearch, maxResults) }, (_unused, index): PracticeSearchResult => {
        const rank = index + 1;
        return Object.freeze({
          title: `Made-up page ${String(rank)} on ${query.slice(0, 80)}`,
          url: `https://madeup-${slug}-${String(rank)}.example/page-${String(rank)}`,
          snippet: `This made-up page ${String(rank)} says that ${String(rank * 12)} out of 100 people asked agree. `
            + `It was written by the practice tool for the search "${query.slice(0, 120)}". `
            + `Its numbers are invented and stand for no real place, person or study.`,
          date: PRACTICE_MADE_UP_PAGES.date, last_updated: null
        });
      });
      return Object.freeze({ kind: "MADE_UP" as const, results: Object.freeze(results) });
    }
  });
}

/** One saved reply's file, as the kitchen keeps it: its search words and the Search API's reply. */
type SavedReply = Readonly<{ file: string; query: string; results: readonly PracticeSearchResult[] }>;

const isText = (value: unknown): value is string => typeof value === "string";
const textOrNull = (value: unknown): string | null => isText(value) ? value : null;

/** A saved file's results, members limited to the Search API's own five (anything else is left out); null when it is none. */
function savedResultsOf(value: unknown): readonly PracticeSearchResult[] | null {
  if (typeof value !== "object" || value === null) return null;
  const response = (value as { response?: unknown }).response ?? value;
  const results = (response as { results?: unknown }).results;
  if (!Array.isArray(results)) return null;
  return Object.freeze(results.flatMap((entry): PracticeSearchResult[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const row = entry as Record<string, unknown>;
    if (!isText(row.url) || !isText(row.snippet)) return [];
    return [Object.freeze({ title: isText(row.title) ? row.title : row.url, url: row.url, snippet: row.snippet,
      date: textOrNull(row.date), last_updated: textOrNull(row.last_updated) })];
  }));
}

/**
 * Saved replies from a folder outside the repository (refused inside it: PRACTICE_REPORT_INSIDE_REPOSITORY): every
 * `*.json` file holding `{query, response: {results}}` (or `{query, results}`), in file-name order. A file that is no
 * such reply is skipped and counted. Each reply is used at most once.
 */
export function practiceSavedSearchReplies(folder: string, repositoryRoot: string): PracticeSearchReplies & Readonly<{
  files: number; skipped: number;
}> {
  const directory = assertOutsideRepository(folder, repositoryRoot);
  const saved: SavedReply[] = [];
  let skipped = 0;
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".json")).sort()) {
    let value: unknown;
    try { value = JSON.parse(readFileSync(join(directory, file), "utf8")); } catch { skipped += 1; continue; }
    const query = typeof value === "object" && value !== null ? (value as { query?: unknown }).query : undefined;
    const results = savedResultsOf(value);
    if (!isText(query) || results === null) { skipped += 1; continue; }
    saved.push(Object.freeze({ file, query, results }));
  }
  const used = new Set<number>();
  const take = (index: number, kind: PracticeSearchAnswerKind, maxResults: number) => {
    used.add(index);
    return Object.freeze({ kind, results: Object.freeze(saved[index]!.results.slice(0, maxResults)) });
  };
  return Object.freeze({
    source: "SAVED" as const, files: saved.length, skipped,
    answer: (query: string, maxResults: number) => {
      const matched = saved.findIndex((reply, index) => !used.has(index) && reply.query.trim() === query.trim());
      if (matched >= 0) return take(matched, "SAVED_MATCH", maxResults);
      const next = saved.findIndex((_reply, index) => !used.has(index));
      if (next >= 0) return take(next, "SAVED_IN_ORDER", maxResults);
      return Object.freeze({ kind: "NONE_LEFT" as const, results: Object.freeze([]) });
    }
  });
}

/** The stand-in's own count: searches answered, by how, and the money it spent (always 0). */
export type PracticeSearchStandInCounts = Readonly<{
  source: PracticeSearchReplies["source"];
  searches: number;
  byKind: Readonly<Partial<Record<PracticeSearchAnswerKind, number>>>;
  results: number;
  spentNanoUsd: string;
}>;

export type PracticeSearchStandIn = Readonly<{
  /** The search gate's place: hand it as the `perplexity` gate port. */
  gate: PreviewBudgetPort;
  counts: () => PracticeSearchStandInCounts;
}>;

const STAND_IN_REPLY_ID = "practice-stand-in";

/**
 * The stand-in in the search gate's place: it reads the body the real guarded fetch let through (already checked against
 * the gate's own rules) and answers 200 with a Search API reply of at most `max_results` results. No hold is kept and
 * nothing is booked: the `reservedUsd` the fetch names is never spent.
 */
export function practiceSearchStandIn(replies: PracticeSearchReplies): PracticeSearchStandIn {
  let searches = 0;
  let results = 0;
  const byKind: Partial<Record<PracticeSearchAnswerKind, number>> = {};
  const gate: PreviewBudgetPort = Object.freeze({
    execute: async (input: PreviewBudgetExecution, signal?: AbortSignal) => {
      if (signal?.aborted === true) throw new DOMException("Practice search canceled", "AbortError");
      const body = JSON.parse(input.requestBody) as { query: string; max_results: number };
      const maxResults = Math.min(Math.max(1, body.max_results), PERPLEXITY_SEARCH_BOUNDS.maxResults[1]);
      const answered = replies.answer(body.query, maxResults);
      searches += 1;
      results += answered.results.length;
      byKind[answered.kind] = (byKind[answered.kind] ?? 0) + 1;
      return Object.freeze({ status: 200, body: JSON.stringify({ id: `${STAND_IN_REPLY_ID}-${String(searches)}`, results: answered.results }) });
    }
  });
  return Object.freeze({
    gate,
    counts: () => Object.freeze({ source: replies.source, searches, byKind: Object.freeze({ ...byKind }), results, spentNanoUsd: "0" })
  });
}

/**
 * The whole chain as one search port: the REAL adapter over the REAL guarded fetch, with the stand-in as the only gate
 * port, and the W1-2 page rules (`selectPathPages`, nothing read before), as apps/runner/src/run-settings.ts builds the
 * search port where a search gate is configured.
 */
export function practiceStandInSearchPort(standIn: PracticeSearchStandIn, options: Readonly<{ timeLimitMs?: number }> = {}): PerplexitySearchPort {
  return createPerplexitySearchPort({
    fetch: createPreviewGuardedFetch({ perplexity: standIn.gate }),
    selectPages: (pages) => selectPathPages(pages, new Set<string>()),
    ...(options.timeLimitMs === undefined ? {} : { timeLimitMs: options.timeLimitMs })
  });
}

/** The search gate's socket name the runner sees with the stand-in: a name only, never opened (the stand-in is the port). */
export const PRACTICE_STAND_IN_SEARCH_SOCKET = "/run/debateai-v3-preview/practice-search-stand-in.sock" as const;

/**
 * The practice runner's inputs with the stand-in in the search gate's place: the gate ports plus the stand-in as the
 * `perplexity` port, and the gate settings naming a search socket (so runnerWebSearchSettings builds its search port, as
 * on a server with a search gate). Nothing else changes; without a stand-in both come back as they were.
 */
export function practiceWithSearchStandIn(environment: PracticeRunnerSettings, budgetPorts: PreviewBudgetPorts,
  standIn: PracticeSearchStandIn | undefined): Readonly<{ environment: PracticeRunnerSettings; budgetPorts: PreviewBudgetPorts }> {
  if (standIn === undefined) return Object.freeze({ environment, budgetPorts });
  const gate = environment.PREVIEW_GATE_SETTINGS;
  return Object.freeze({
    environment: Object.freeze({ ...environment, PREVIEW_GATE_SETTINGS: Object.freeze({ ...gate,
      [PREVIEW_SEARCH_SOCKET_KEY]: gate[PREVIEW_SEARCH_SOCKET_KEY] ?? PRACTICE_STAND_IN_SEARCH_SOCKET }) }),
    budgetPorts: Object.freeze({ ...budgetPorts, perplexity: standIn.gate })
  });
}
