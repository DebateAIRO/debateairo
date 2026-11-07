import { DIG_LEVEL_MAX, type AnswerIndex, type ContractClient } from "@debateai/contract";
import { contractClient } from "../api.js";
import { t, type MessageCatalog } from "../i18n/translate.js";
import { digPicksOf, ownWords, parseDigDetail } from "./askText.js";
import { digParentOf, type IndexEntry } from "./digIndex.js";
import { cardLabel } from "./mapLooks.js";
import { TRUST_WORDS, type TrustCounts, type TrustWord } from "./types.js";

/*
 * "Your maps" (owner pick ask-d5 B, with ask-f10, ask-f20, wait-f13, map-f34 and dig-f30; 3 Nov 2026): the person's own
 * questions as small cards, newest first, each with one state word, the four-shade bar and a "New" dot when the server
 * gives them, and its digs under it in the person's own words. Nothing is kept in the browser.
 *
 *  - Digs are left out of the cards (ask-f10). A dig is known by the link to the debate it was dug from that the account
 *    keeps (GET /v1/runs/{id}/dig-links, migration 0131), never by its first line; a dig made before the account kept
 *    those links is known by the context line its text carries (askText.parseDigDetail, as the map page finds it).
 *  - The list is read further back until `want` real questions remain.
 *  - Each dig hangs under the question it came from (a dig of a dig under that question too), shown by its first pick in
 *    the person's words, "and more" when it had several (dig-f30).
 *
 * The answer list (GET /v1/answers) says today which runs are open, waiting, failed or answered. What it does not say
 * yet is read from OPTIONAL fields the server may add to its rows (absent: the calm fallback, nothing invented):
 *  - `started_at` (an open run): "Being looked into, started 14:00"; without it, "Being looked into";
 *  - `map_bar` ({ sure, sure_for_case, still_argued, didnt_hold }, whole numbers): the map's four-shade bar; without it, none;
 *  - `changed_since_visit` (true): the "New" dot (the map changed since the person last opened it); without it, none;
 *  - `dug_from` (a run id, or null for a first question): the dig link, so no per-row read is needed; without it, read;
 *  - `dug_on_public` (true) with `dig_pick` (its first pick's words as the person sent them): a dig the person made on
 *    someone else's public page (the start-step session's Task 79c), a card of its own (question 33 A, below).
 * The contract's answer-list rows are strict today, so these arrive only once the contract names them.
 *
 * journey-f22 / public-f17: the answer list says "running" for a question paused at the month wall too, so each map or dig
 * the shelf shows as being looked into is read once more (GET /v1/runs/{id}, its `month_pause`): a paused one reads
 * "Paused until 1 December" with the still pause mark, never "Looking into it" with a pulse. A failed read keeps the word.
 */

/** One state word per map: being looked into, waiting to start, paused at the month wall, answer ready, didn't finish. */
export type ShelfState = "WORKING" | "WAITING" | "PAUSED" | "READY" | "FAILED";

/** A run paused at the month wall: until when, and whether the new month has started (it can continue). */
export type ShelfPause = Readonly<{ until: string; canContinue: boolean }>;

/** One row of the account's answer list, with what the server may add to it. */
export type ShelfRow = Readonly<{
  runId: string;
  questionLine: string;
  /** The newest row's sequence for this run (the list's order). */
  sequence: number;
  /** The lowest sequence seen for this run (a served answer is listed at its sealing, an open run at its start). */
  firstSequence: number;
  state: ShelfState;
  startedAt: string | null;
  bar: TrustCounts | null;
  changed: boolean;
  /** The run this one was dug from as the server says it (null: a first question); undefined when the row does not say. */
  dugFrom: string | null | undefined;
  /** The server says this is a dig the person made on someone else's public page (`dug_on_public`). */
  publicDig: boolean;
  /** That dig's first pick in the person's words (`dig_pick`); null when it had none (a whole path) or it is not such a dig. */
  publicPick: string | null;
}>;

export type ShelfDig = Readonly<{ runId: string; pick: string; more: boolean; state: ShelfState; pause: ShelfPause | null }>;

/** A card of the list: one of the person's questions, or a dig they made on someone else's public page (question 33 A). */
export type ShelfCardKind = "QUESTION" | "PUBLIC_DIG";

export type ShelfMap = Readonly<{
  runId: string;
  kind: ShelfCardKind;
  /** The card's words: the person's own question (askText.ownWords), or a public dig's "Dig: …" (publicDigCardText). */
  question: string;
  state: ShelfState;
  /** Set when state is PAUSED. */
  pause: ShelfPause | null;
  startedAt: string | null;
  bar: TrustCounts | null;
  changed: boolean;
  /** Its digs, newest first, a dig of a dig included. */
  digs: readonly ShelfDig[];
}>;

export type ShelfRead = Readonly<{
  maps: readonly ShelfMap[];
  /** More questions may be further back. */
  more: boolean;
  /** The account has any debate at all (false: a first visit). */
  anyRows: boolean;
}>;

/** A run id → the run it was dug from (null: not a dig), or FAILED when its dig links could not be read. */
export type DigLinkCache = Map<string, string | null | "FAILED">;
export type ShelfClient = Pick<ContractClient, "readAnswerIndex" | "readDigLinks"> & Partial<Pick<ContractClient, "readRun">>;

/** Rows per page of GET /v1/answers (1..128). */
const SHELF_PAGE = 32;
/** Dig-link reads sent at once. */
const LINK_READS_AT_ONCE = 6;

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u;

function stateOfOpenRun(state: AnswerIndex["open_runs"][number]["state"]): ShelfState {
  if (state === "FAILED") return "FAILED";
  if (state === "WAITING") return "WAITING";
  return "WORKING";
}

/** The four counts of an optional `map_bar`, or null when absent or not four whole numbers. */
function barOf(value: unknown): TrustCounts | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Readonly<Record<string, unknown>>;
  const counts: Partial<Record<TrustWord, number>> = {};
  for (const word of TRUST_WORDS) {
    const count = raw[word.toLowerCase()];
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return null;
    counts[word] = count;
  }
  return Object.freeze(counts as Record<TrustWord, number>);
}

/** The optional fields of one answer-list row (see the header). */
export function shelfExtrasOf(row: object): Pick<ShelfRow, "startedAt" | "bar" | "changed" | "dugFrom" | "publicDig" | "publicPick"> {
  const loose = row as Readonly<Record<string, unknown>>;
  const started = loose.started_at;
  const dug = loose.dug_from;
  const publicDig = loose.dug_on_public === true;
  const pick = publicDig && typeof loose.dig_pick === "string" ? loose.dig_pick.trim() : "";
  return {
    startedAt: typeof started === "string" && ISO_TIME.test(started) && Number.isFinite(Date.parse(started)) ? started : null,
    bar: barOf(loose.map_bar),
    changed: loose.changed_since_visit === true,
    dugFrom: dug === null ? null : typeof dug === "string" && dug.length > 0 ? dug : undefined,
    publicDig,
    publicPick: pick.length > 0 ? pick : null
  };
}

/** One row per run: a served answer wins over an open run of the same debate; what either says is kept. */
function joined(known: ShelfRow | undefined, row: ShelfRow): ShelfRow {
  if (known === undefined) return row;
  const served = (candidate: ShelfRow) => candidate.state === "READY";
  const lead = served(row) !== served(known) ? (served(row) ? row : known) : row.sequence >= known.sequence ? row : known;
  const other = lead === row ? known : row;
  return Object.freeze({
    ...lead,
    sequence: Math.max(known.sequence, row.sequence),
    firstSequence: Math.min(known.firstSequence, row.firstSequence),
    startedAt: lead.startedAt ?? other.startedAt,
    bar: lead.bar ?? other.bar,
    changed: lead.changed || other.changed,
    dugFrom: lead.dugFrom !== undefined ? lead.dugFrom : other.dugFrom,
    publicDig: lead.publicDig || other.publicDig,
    publicPick: lead.publicPick ?? other.publicPick
  });
}

function newestFirst(a: ShelfRow, b: ShelfRow): number {
  return b.sequence - a.sequence || b.firstSequence - a.firstSequence;
}

/** The rows of answer-list pages, merged into what is known: one per run, newest first. */
export function mergeShelfRows(known: readonly ShelfRow[], page: Pick<AnswerIndex, "items" | "open_runs">): readonly ShelfRow[] {
  const byRun = new Map(known.map((row) => [row.runId, row]));
  const fresh: ShelfRow[] = [
    ...page.items.map((item): ShelfRow => Object.freeze({
      runId: item.run_ref, questionLine: item.question_line, sequence: item.created_at_sequence,
      firstSequence: item.created_at_sequence, state: "READY", ...shelfExtrasOf(item)
    })),
    ...page.open_runs.map((run): ShelfRow => Object.freeze({
      runId: run.run_ref, questionLine: run.question_line, sequence: run.created_at_sequence,
      firstSequence: run.created_at_sequence, state: stateOfOpenRun(run.state), ...shelfExtrasOf(run)
    }))
  ];
  for (const row of fresh) byRun.set(row.runId, joined(byRun.get(row.runId), row));
  return Object.freeze([...byRun.values()].sort(newestFirst));
}

/**
 * Where a row goes: a card of its own (a question, or a dig made on someone else's public page), or under the run it was
 * dug from (null: no known parent).
 */
export type ShelfPlace = Readonly<{ kind: ShelfCardKind }> | Readonly<{ kind: "DIG"; parent: string | null }>;

/** Whether a place is a card of the list. */
function isCard(place: ShelfPlace | undefined): boolean {
  return place !== undefined && place.kind !== "DIG";
}

/**
 * dig-f30: what a dig looked into, as its shelf line names it. A dig of picks on a path also names the path's line first
 * (W3-4); that line is the path, not a pick, so it is left out. A dig of a whole path is named by the path's short label
 * (map-f25, r2-20 A), never by its whole line with its outcome words ("Nuclear first: did not hold. …").
 */
export function shelfPicksOf(questionLine: string, catalog: MessageCatalog): readonly string[] {
  const detail = parseDigDetail(questionLine, catalog);
  if (detail !== null) {
    const picks = detail.items.filter((_, at) => detail.kinds[at] !== "PATH");
    if (picks.length > 0) return picks;
    const path = detail.items.find((_, at) => detail.kinds[at] === "PATH");
    if (path !== undefined && cardLabel(path).length > 0) return Object.freeze([cardLabel(path)]);
  }
  return digPicksOf(questionLine, catalog);
}

function entryOf(row: ShelfRow): IndexEntry {
  return { runId: row.runId, questionLine: row.questionLine, createdAtSequence: row.sequence, firstSequence: row.firstSequence };
}

/**
 * A row's place. A dig the server marks as made on someone else's public page is a card of its own (question 33 A): the
 * debate it was dug from is not the person's, so it has no question of theirs to hang under. Otherwise the dig link
 * decides: the server's `dug_from` when the row carries it, else the account's dig-link read. With no link (none
 * recorded, or the read failed), a dig made before the links existed is still known by the context line its text
 * carries, and placed under its one parent as the map page finds it (digIndex.digParentOf).
 */
export function shelfPlaceOf(row: ShelfRow, links: ReadonlyMap<string, string | null | "FAILED">, entries: readonly IndexEntry[], catalog: MessageCatalog): ShelfPlace {
  if (row.publicDig) return Object.freeze({ kind: "PUBLIC_DIG" });
  const read = links.get(row.runId);
  const linked = row.dugFrom !== undefined ? row.dugFrom : read === undefined || read === "FAILED" ? undefined : read;
  if (typeof linked === "string") return Object.freeze({ kind: "DIG", parent: linked });
  if (parseDigDetail(row.questionLine, catalog) !== null) {
    return Object.freeze({ kind: "DIG", parent: digParentOf(row.runId, row.questionLine, entries, catalog)?.runId ?? null });
  }
  return Object.freeze({ kind: "QUESTION" });
}

/**
 * The words of a public dig's card. The owner's answer to question 33 (5 Nov 2026, A): "Dig: {its pick}" (dig-f30's
 * words), from the server's `dig_pick`, with "and more" when the dig's own question line names more than one pick (as a
 * dig under a question says it). The fifth round (7 Nov): a dig of a whole path, which has no pick, reads "Dig: a closer
 * look at a path" (the map's own button is "A closer look at this path").
 *
 * A public dig is always on a path, and its question line names the path's line first (askText digItems). Written in
 * English, the line says which item is the path; written off English, nothing does, so the first item is taken as the
 * path's line, and only the server's `dig_pick` names the pick: the card never shows the path's line with its outcome
 * words (dig-f30, map-f25).
 */
export function publicDigCardText(row: Pick<ShelfRow, "questionLine" | "publicPick">, catalog: MessageCatalog): string {
  const detail = parseDigDetail(row.questionLine, catalog);
  const linePicks = detail === null ? []
    : detail.english ? detail.items.filter((_, at) => detail.kinds[at] !== "PATH") : detail.items.slice(1);
  const pick = row.publicPick ?? (detail?.english === true ? linePicks[0] : undefined) ?? null;
  if (pick === null) return t(catalog, "v4.maps.digWholePath");
  return t(catalog, linePicks.length > 1 ? "v4.maps.digMore" : "v4.maps.dig", { pick });
}

/**
 * The cards: the first `want` card rows (newest first, questions with no words of their own left out), each with the digs
 * whose chain of parents leads to it, newest first. A dig whose question is not among the rows read hangs nowhere here.
 * A dig the person made on someone else's public page is a card of its own, "Dig: …" (question 33 A, publicDigCardText),
 * the one case of a dig card of its own; the public dig box's "“My questions” will show it if it did." relies on it.
 * Until the server marks such a row (`dug_on_public`), the dig still hangs nowhere and the list leaves it out.
 */
export function buildShelf(
  rows: readonly ShelfRow[],
  places: ReadonlyMap<string, ShelfPlace>,
  catalog: MessageCatalog,
  want: number,
  /** Runs the answer list calls running that are paused at the month wall (read from each run). */
  pauses: ReadonlyMap<string, ShelfPause> = new Map()
): readonly ShelfMap[] {
  const stateOf = (row: ShelfRow): Readonly<{ state: ShelfState; pause: ShelfPause | null }> => {
    const pause = row.state === "WORKING" ? pauses.get(row.runId) ?? null : null;
    return pause === null ? { state: row.state, pause: null } : { state: "PAUSED", pause };
  };
  const rootOf = (runId: string): string | null => {
    let at = runId;
    const seen = new Set<string>();
    // A chain is at most DIG_LEVEL_MAX digs long; anything longer (or a loop) hangs nowhere.
    for (let step = 0; step <= DIG_LEVEL_MAX + 1; step += 1) {
      if (seen.has(at)) return null;
      seen.add(at);
      const place = places.get(at);
      if (place === undefined) return null;
      if (place.kind !== "DIG") return at;
      if (place.parent === null) return null;
      at = place.parent;
    }
    return null;
  };
  const digsOf = new Map<string, ShelfDig[]>();
  for (const row of rows) {
    if (places.get(row.runId)?.kind !== "DIG") continue;
    const root = rootOf(row.runId);
    if (root === null) continue;
    const picks = shelfPicksOf(row.questionLine, catalog);
    const list = digsOf.get(root) ?? [];
    list.push(Object.freeze({ runId: row.runId, pick: picks[0]!, more: picks.length > 1, ...stateOf(row) }));
    digsOf.set(root, list);
  }
  const maps: ShelfMap[] = [];
  for (const row of rows) {
    if (maps.length >= want) break;
    const kind = places.get(row.runId)?.kind;
    if (kind !== "QUESTION" && kind !== "PUBLIC_DIG") continue;
    const question = kind === "PUBLIC_DIG" ? publicDigCardText(row, catalog) : ownWords(row.questionLine);
    if (question.length === 0) continue;
    maps.push(Object.freeze({
      runId: row.runId, kind, question, ...stateOf(row), startedAt: row.startedAt, bar: row.bar, changed: row.changed,
      digs: Object.freeze(digsOf.get(row.runId) ?? [])
    }));
  }
  return Object.freeze(maps);
}

/** The month pause of a run the list calls running, or null (not paused, or the read failed: the word stays). */
async function readPause(runId: string, client: ShelfClient): Promise<ShelfPause | null> {
  if (client.readRun === undefined) return null;
  try {
    const run = await Promise.resolve().then(() => client.readRun!(runId));
    const pause = run.month_pause;
    return run.state === "RUNNING" && pause !== undefined ? Object.freeze({ until: pause.until, canContinue: pause.can_continue }) : null;
  } catch {
    return null;
  }
}

async function readLink(runId: string, client: ShelfClient): Promise<string | null | "FAILED"> {
  try {
    const links = await Promise.resolve().then(() => client.readDigLinks(runId));
    return links.parent?.parent_run_id ?? null;
  } catch {
    return "FAILED";
  }
}

export type ShelfOptions = Readonly<{
  client?: ShelfClient;
  /** Dig links already read (kept by the page between reads, e.g. "Show more"); filled as rows are read. */
  cache?: DigLinkCache;
  /** Pages of the answer list to read at most (default: enough for `want`, at least 4). */
  maxPages?: number;
}>;

/**
 * Reads the shelf: answer-list pages, newest first, and the dig links of the rows in order, until `want` real questions
 * are known in their place (a question listed after the last page read might still have a newer unread answer before
 * it), the list ends, or `maxPages` pages were read. A failed list read throws; a failed dig-link read falls back.
 */
export async function readMapShelf(want: number, catalog: MessageCatalog, options: ShelfOptions = {}): Promise<ShelfRead> {
  const client = options.client ?? contractClient;
  const cache = options.cache ?? new Map();
  const maxPages = Math.max(1, Math.floor(options.maxPages ?? Math.max(4, Math.ceil((want + 1) / 8))));
  const places = new Map<string, ShelfPlace>();
  let rows: readonly ShelfRow[] = [];
  let offset = 0;
  let pages = 0;
  let ended = false;
  /** The oldest answer read so far: a question older than it may still have unread answers before it. */
  let frontier = Number.POSITIVE_INFINITY;
  const settled = (row: ShelfRow) => ended || row.sequence >= frontier;
  const settledQuestions = () => rows.filter((row) => isCard(places.get(row.runId)) && settled(row)).length;
  for (;;) {
    const page = await client.readAnswerIndex(SHELF_PAGE, offset);
    pages += 1;
    rows = mergeShelfRows(rows, page);
    offset += SHELF_PAGE;
    ended = page.items.length === 0 || offset >= page.total;
    for (const item of page.items) frontier = Math.min(frontier, item.created_at_sequence);
    // Place rows newest first, a few dig-link reads at a time, until one more question than wanted is placed (so the
    // page knows whether there are more) or every row read so far is placed.
    for (;;) {
      if (settledQuestions() > want) break;
      const next = rows.filter((row) => !places.has(row.runId)).slice(0, LINK_READS_AT_ONCE);
      if (next.length === 0) break;
      await Promise.all(next
        .filter((row) => row.dugFrom === undefined && !row.publicDig && !cache.has(row.runId))
        .map(async (row) => { cache.set(row.runId, await readLink(row.runId, client)); }));
      const entries = rows.map(entryOf);
      for (const row of next) places.set(row.runId, shelfPlaceOf(row, cache, entries, catalog));
    }
    if (settledQuestions() > want || ended || pages >= maxPages) break;
  }
  const placedQuestions = rows.filter((row) => isCard(places.get(row.runId))).length;
  const unplaced = rows.some((row) => !places.has(row.runId));
  const shown = buildShelf(rows, places, catalog, want);
  // journey-f22: read again only what the shelf shows as being looked into (a few open runs at most).
  const working = shown.flatMap((map) => [map, ...map.digs]).filter((item) => item.state === "WORKING").map((item) => item.runId);
  const pauses = new Map<string, ShelfPause>();
  await Promise.all(working.map(async (runId) => {
    const pause = await readPause(runId, client);
    if (pause !== null) pauses.set(runId, pause);
  }));
  return Object.freeze({
    maps: pauses.size === 0 ? shown : buildShelf(rows, places, catalog, want, pauses),
    more: placedQuestions > want || unplaced || !ended,
    anyRows: rows.length > 0
  });
}
