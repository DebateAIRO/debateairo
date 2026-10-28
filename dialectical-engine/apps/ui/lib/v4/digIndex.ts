import type { ContractClient } from "@debateai/contract";
import { contractClient } from "../api.js";
import type { MessageCatalog } from "../i18n/translate.js";
import { carriedMatch, ownWords, parseDigDetail, sameItemText, sameParentText, type DigDetail, type DigItemKind } from "./askText.js";
import { uniqueOpenQuestions } from "./mapModel.js";
import type { DigLink, V4Map } from "./types.js";

/*
 * V4 initial, fix wave 1 (Decision A): the API has no link between a dig and the debate it came from, and V4 stores
 * nothing in the browser. So digs are found again from the signed-in account's own question list (GET /v1/answers:
 * answers and open runs, both asker-scoped), by text: a dig's question_line names its parent's own words on its first
 * added line (askText.digQuestion / parseDigQuestion).
 *
 * Fix wave 2: the list is read page by page until a given run has been seen (R2DIG-6), later re-reads are merged into it
 * (mergeIndex), and each dig gets exactly ONE parent (R2DIG-1/-2, R2REG-1): among the older entries with the words it
 * names, the one whose added lines it carried, else the newest.
 */

export type IndexEntry = Readonly<{
  runId: string;
  questionLine: string;
  /** The newest row's sequence for this run (the list's order: newest first). */
  createdAtSequence: number;
  /**
   * The LOWEST created_at_sequence seen for this run. An open run is listed at its start; a served one at its answer's
   * sealing, and a recomposed answer can be newer than a dig of it, so "older than" uses this.
   */
  firstSequence: number;
}>;

/** GET /v1/answers allows 1..128 (MAX_OWNER_PRIVATE_HISTORY_SCAN). */
const INDEX_LIMIT_MAX = 128;
const INDEX_LIMIT_DEFAULT = INDEX_LIMIT_MAX;
/** A hard cap on pages per read (10 × 128 runs), so a huge account never turns one page load into a long scan. */
const INDEX_MAX_PAGES_DEFAULT = 10;

export type QuestionIndexOptions = Readonly<{
  /** Rows per page: default 128 on a first load; re-reads use 20 (new digs are always the newest rows). */
  limit?: number;
  /** Keep reading pages (offset += limit, while offset < total) until this run has been seen. Absent: one page. */
  untilRunId?: string;
  /** Pages to read after untilRunId was seen (default 0; a dig page uses 2 to reach its parent). */
  extraPages?: number;
  /** Hard cap on pages, default 10. */
  maxPages?: number;
}>;

function wholeIn(value: number | undefined, low: number, high: number, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(high, Math.max(low, Math.floor(value))) : fallback;
}

function byNewest(a: IndexEntry, b: IndexEntry): number {
  return b.createdAtSequence - a.createdAtSequence || b.firstSequence - a.firstSequence;
}

/** One entry per run: the fresher row's text and newest sequence, and the lowest first sequence of both. */
function joined(known: IndexEntry | undefined, row: IndexEntry): IndexEntry {
  if (known === undefined) return Object.freeze({ ...row });
  const fresher = row.createdAtSequence >= known.createdAtSequence ? row : known;
  return Object.freeze({
    runId: row.runId,
    questionLine: fresher.questionLine,
    createdAtSequence: Math.max(known.createdAtSequence, row.createdAtSequence),
    firstSequence: Math.min(known.firstSequence, row.firstSequence)
  });
}

function collect(byRun: Map<string, IndexEntry>, rows: readonly IndexEntry[]): void {
  for (const row of rows) byRun.set(row.runId, joined(byRun.get(row.runId), row));
}

function sorted(byRun: ReadonlyMap<string, IndexEntry>): readonly IndexEntry[] {
  return Object.freeze([...byRun.values()].sort(byNewest));
}

/**
 * The account's questions, newest first: served answers and open runs together, one entry per run. Without
 * `untilRunId` one page is read; with it, pages are read until that run has been seen (plus `extraPages`), the list
 * ends, or `maxPages` is reached. A failed read is the caller's to handle (it throws).
 */
export async function readQuestionIndex(
  client: Pick<ContractClient, "readAnswerIndex"> = contractClient,
  options: QuestionIndexOptions = {}
): Promise<readonly IndexEntry[]> {
  const limit = wholeIn(options.limit, 1, INDEX_LIMIT_MAX, INDEX_LIMIT_DEFAULT);
  const maxPages = wholeIn(options.maxPages, 1, Number.MAX_SAFE_INTEGER, INDEX_MAX_PAGES_DEFAULT);
  const extraPages = wholeIn(options.extraPages, 0, Number.MAX_SAFE_INTEGER, 0);
  const until = options.untilRunId;
  const byRun = new Map<string, IndexEntry>();
  let offset = 0;
  let pages = 0;
  let pagesAfterSeen: number | null = null;
  for (;;) {
    const page = await client.readAnswerIndex(limit, offset);
    pages += 1;
    const rows: IndexEntry[] = [
      ...page.items.map((item) => ({
        runId: item.run_ref, questionLine: item.question_line,
        createdAtSequence: item.created_at_sequence, firstSequence: item.created_at_sequence
      })),
      ...page.open_runs.map((run) => ({
        runId: run.run_ref, questionLine: run.question_line,
        createdAtSequence: run.created_at_sequence, firstSequence: run.created_at_sequence
      }))
    ];
    collect(byRun, rows);
    if (until === undefined) break;
    if (pagesAfterSeen !== null) pagesAfterSeen += 1;
    else if (byRun.has(until)) pagesAfterSeen = 0;
    offset += limit;
    const listEnded = rows.length === 0 || offset >= page.total;
    const enoughAfter = pagesAfterSeen !== null && pagesAfterSeen >= extraPages;
    if (listEnded || enoughAfter || pages >= maxPages) break;
  }
  return sorted(byRun);
}

/** A re-read merged into what is known: one entry per run, the lowest first sequence kept, newest first. */
export function mergeIndex(known: readonly IndexEntry[], fresh: readonly IndexEntry[]): readonly IndexEntry[] {
  const byRun = new Map<string, IndexEntry>();
  collect(byRun, known);
  collect(byRun, fresh);
  return sorted(byRun);
}

/**
 * The one entry a dig was started from (R2DIG-1/-2, R2REG-1): among the OTHER entries whose own words are the ones the
 * dig names and that are older than the dig (firstSequence below the dig's), prefer those whose added lines the dig
 * carried whole, then those it carried the first of (the byte cap drops lines from the end), then any; the newest wins.
 */
function parentEntryOf(digEntry: IndexEntry, dig: DigDetail, index: readonly IndexEntry[], catalog: MessageCatalog): IndexEntry | null {
  const candidates = index.filter((entry) => entry.runId !== digEntry.runId
    && entry.firstSequence < digEntry.firstSequence
    && sameParentText(dig.parentQuestion, ownWords(entry.questionLine)));
  if (candidates.length === 0) return null;
  const tiered = candidates.map((entry) => ({ entry, match: carriedMatch(dig, entry.questionLine, catalog) }));
  const equal = tiered.filter((item) => item.match === "EQUAL");
  const leads = tiered.filter((item) => item.match === "LEADS");
  const pool = (equal.length > 0 ? equal : leads.length > 0 ? leads : tiered).map((item) => item.entry);
  return pool.reduce((best, entry) =>
    entry.firstSequence > best.firstSequence
    || (entry.firstSequence === best.firstSequence && entry.createdAtSequence > best.createdAtSequence) ? entry : best);
}

/**
 * Where one dig item hangs on the parent's map: an open question's id, a path ("path:<id>"), or nowhere (null).
 * R2DIG-4 / R2REG-2: "w" is also found by its other text (map.wouldChangeAlt, the reversal_point a dig sent before the
 * story was ready names) and, in English, by the "Would this change the answer?" framing itself.
 */
function placeOf(item: string, kind: DigItemKind | null, map: V4Map | null): string | null {
  if (map === null) return null;
  const open = uniqueOpenQuestions(map);
  const exact = open.find((question) => sameItemText(item, question.text));
  if (exact !== undefined) return exact.id;
  const hasW = open.some((question) => question.id === "w");
  if (hasW && map.wouldChangeAlt !== null && sameItemText(item, map.wouldChangeAlt)) return "w";
  const path = map.paths.find((candidate) => sameItemText(item, candidate.line));
  if (path !== undefined) return `path:${path.id}`;
  return hasW && kind === "WOULD_CHANGE" ? "w" : null;
}

/**
 * The digs of this debate found in the account's list, oldest first (the order they were started). An entry is a dig of
 * this parent only when this parent is the one entry it was started from (parentEntryOf). Each item is placed on the
 * map by text; an item that matches nothing keeps no id, so the dig hangs under the question itself. Mode and start
 * time are unknown here. The parent's own entry should be in the index (read with untilRunId = parentRunId); when it is
 * not, the parent stands in as older than every listed entry, so it is chosen only when no listed debate fits better.
 */
export function digLinksFor(
  parentRunId: string,
  parentQuestionLine: string,
  map: V4Map | null,
  index: readonly IndexEntry[],
  catalog: MessageCatalog
): readonly DigLink[] {
  if (ownWords(parentQuestionLine).length === 0) return [];
  const listed = index.some((entry) => entry.runId === parentRunId);
  const candidates: readonly IndexEntry[] = listed ? index : [...index, {
    runId: parentRunId,
    questionLine: parentQuestionLine,
    createdAtSequence: Number.NEGATIVE_INFINITY,
    firstSequence: Number.NEGATIVE_INFINITY
  }];
  const links: DigLink[] = [];
  const seen = new Set<string>();
  const oldestFirst = [...index].sort((a, b) => a.firstSequence - b.firstSequence || a.createdAtSequence - b.createdAtSequence);
  for (const entry of oldestFirst) {
    if (entry.runId === parentRunId || seen.has(entry.runId)) continue;
    const dig = parseDigDetail(entry.questionLine, catalog);
    if (dig === null || !sameParentText(dig.parentQuestion, ownWords(parentQuestionLine))) continue;
    if (parentEntryOf(entry, dig, candidates, catalog)?.runId !== parentRunId) continue;
    seen.add(entry.runId);
    const ids: string[] = [];
    dig.items.forEach((item, at) => {
      const id = placeOf(item, dig.kinds[at] ?? null, map);
      if (id !== null && !ids.includes(id)) ids.push(id);
    });
    links.push(Object.freeze({
      parentRunId,
      childRunId: entry.runId,
      openQuestionIds: Object.freeze(ids),
      questions: dig.items,
      mode: null,
      startedAt: null
    }));
  }
  return Object.freeze(links);
}

/**
 * The debate this one was dug from (R2DIG-2): the one entry parentEntryOf picks for the child, so never a debate asked
 * after the dig. The child's own entry gives its sequence; when the list does not hold it yet, every listed entry
 * counts as older. null when not a dig or no such entry is listed.
 */
export function digParentOf(
  childRunId: string,
  childQuestionLine: string,
  index: readonly IndexEntry[],
  catalog: MessageCatalog
): IndexEntry | null {
  const dig = parseDigDetail(childQuestionLine, catalog);
  if (dig === null) return null;
  const own = index.find((entry) => entry.runId === childRunId);
  const child: IndexEntry = own ?? {
    runId: childRunId,
    questionLine: childQuestionLine,
    createdAtSequence: Number.POSITIVE_INFINITY,
    firstSequence: Number.POSITIVE_INFINITY
  };
  return parentEntryOf(child, dig, index, catalog);
}
