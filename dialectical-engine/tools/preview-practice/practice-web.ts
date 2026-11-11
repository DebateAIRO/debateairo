/**
 * Preview practice, debate mode (Perplexity plan 2026-10-30, task W5-2): THE WEB TABLE.
 *
 * Plain words: per path of the map, what its web step did: the planner's decision (0134), its searches and how many were
 * answered, the pages found and read, its top pages with each reader's grade and how far readers 1, 2 and 3 agree on
 * each (the reader spread: the highest grade less the lowest), the extracts kept (0132) and dropped (proposed by a reader
 * and not kept: its page was not a top page, the word-for-word check refused it, or it repeated one already kept), how
 * many went into the path's
 * pack, how many points are "Sure" on this path's extracts, and its money and time. Below it: the planner's own calls,
 * the points that are at most "Sure, for the case named", and the web calls no path could be named for.
 *
 * Counts, grades, codes, money and time only: never a search word, a page, a title, a line or a quote (report.md and
 * report.json alike). The search fee: Perplexity's per-search price as each search row records it (0.1¢ an answered
 * search); on the stand-in (practice-search-stand-in.ts) nothing was paid, so the fee is 0 and the price-list figure is
 * shown apart as "not paid".
 *
 * "Sure" is serve's rule (packages/serve/src/web-sources.ts `lookedUpChecked`): a looked-up point whose locator is one of
 * THIS debate's extracts, with the reviewer agreeing. Freshness is not read: a practice debate is read the minute it ends.
 * Every other agreed point is at most "Sure, for the case named" (apps/ui/lib/v4/trust.ts).
 */
import type { Pool } from "pg";
import { decryptContentForRun, readCallPrompt } from "@debateai/db";
import { previewModelRow } from "@debateai/providers";
import { previewCallNanoUsd } from "../../apps/api/src/preview-budget-estimate.js";
import { practiceModelOfRef, replyContentOf } from "./practice-lanes.js";
import { practiceTryTier } from "./practice-tokens.js";

/** Who answered the searches: the real Perplexity (through its gate), or the practice's stand-in (no search paid). */
export type PracticeWebSearchSource = "PERPLEXITY" | "STAND_IN";

/** One top page of a path: its pick rank, each reader's grade (null: no reading, or a failed one), and the spread. */
export type PracticeWebTopPage = Readonly<{ rank: number; grades: readonly (number | null)[]; spread: number | null }>;

export type PracticeWebPathRow = Readonly<{
  pathRef: string;
  /** The planner's decision for the path (0134's status), or null when none was stored. */
  plan: string | null;
  searches: number;
  /** FOUND or EMPTY. */
  searchesAnswered: number;
  /** FAILED or REFUSED (held before sending). */
  searchesFailed: number;
  pagesFound: number;
  /** Pages reader 1 read (a READ row). */
  pagesRead: number;
  top: readonly PracticeWebTopPage[];
  extractsKept: number;
  extractsDropped: number;
  extractsInPack: number;
  /** Points "Sure" on this path's extracts (serve's rule). */
  sure: number;
  /** The path's reader and pick calls, priced as the practice prices every call. */
  aiCostNanoUsd: string;
  /** The search fee paid (0 on the stand-in). */
  searchFeeMicros: number;
  /** On the stand-in only: the price-list fee its searches would have cost. */
  searchFeeNotPaidMicros: number;
  /** The path's first search or call to its last call's end, whole seconds; null with nothing measured. */
  seconds: number | null;
}>;

export type PracticeWebBlock = Readonly<{
  search: PracticeWebSearchSource;
  paths: readonly PracticeWebPathRow[];
  planner: Readonly<{ calls: number; costNanoUsd: string }>;
  /** Web calls whose path could not be named (their prompt named no page of the run). */
  unplacedCalls: number;
  /** Agreed points that are not "Sure": at most "Sure, for the case named". */
  sureForCaseNamed: number;
  totals: Readonly<{
    searches: number; pagesRead: number; extractsKept: number; extractsDropped: number; sure: number;
    aiCostNanoUsd: string; searchFeeMicros: number; searchFeeNotPaidMicros: number; seconds: number | null;
  }>;
}>;

/** What the block is built from: 0132's and 0134's plaintext columns, the web calls, and the debate's points. */
export type PracticeWebFacts = Readonly<{
  search: PracticeWebSearchSource;
  plan: readonly Readonly<{ pathRef: string; status: string }>[];
  searches: readonly Readonly<{ searchId: string; pathRef: string; outcome: string; chargeMicros: number; searchedAt: Date | null }>[];
  pages: readonly Readonly<{ pageId: string; searchId: string }>[];
  readings: readonly Readonly<{ pageId: string; reader: number; outcome: string; grade: number | null }>[];
  extracts: readonly Readonly<{ pathRef: string; label: string; foundBy: readonly number[] }>[];
  picks: readonly Readonly<{ pathRef: string; rank: number; pageId: string }>[];
  packs: readonly Readonly<{ pathRef: string; extractLabels: readonly string[] }>[];
  /** Every web AI call (`WEB:` call sites): its path (null: the planner, or not placed), money, time, extracts proposed. */
  calls: readonly Readonly<{
    callSiteKey: string; pathRef: string | null; costNanoUsd: bigint; startedAt: Date; finishedAt: Date; proposedExtracts: number;
  }>[];
  points: readonly Readonly<{ wayOfKnowing: string; locator: string | null; reviewOutcome: string | null }>[];
}>;

const READERS = Object.freeze([1, 2, 3] as const);
const MILLISECONDS = Object.freeze({ perSecond: 1000 });
const ANSWERED: ReadonlySet<string> = new Set(["FOUND", "EMPTY"]);
const isPlanner = (callSiteKey: string): boolean => callSiteKey === "WEB:plan" || callSiteKey.startsWith("WEB:plan:");

/** The whole seconds from the first moment to the last, or null with none. */
function spanSeconds(moments: readonly Date[]): number | null {
  if (moments.length === 0) return null;
  const times = moments.map((moment) => moment.getTime());
  return Math.round((Math.max(...times) - Math.min(...times)) / MILLISECONDS.perSecond);
}

/** Pure: the block from the facts. Paths in the planner's order, then any path searched without a stored decision. */
export function practiceWebBlock(facts: PracticeWebFacts): PracticeWebBlock {
  const standIn = facts.search === "STAND_IN";
  const pathRefs = [...new Set([...facts.plan.map((row) => row.pathRef), ...facts.searches.map((row) => row.pathRef)])];
  const searchPath = new Map(facts.searches.map((row) => [row.searchId, row.pathRef]));
  const pagePath = new Map(facts.pages.map((page) => [page.pageId, searchPath.get(page.searchId) ?? null]));
  const gradesOf = (pageId: string): (number | null)[] => READERS.map((reader) => {
    const reading = facts.readings.find((row) => row.pageId === pageId && row.reader === reader);
    return reading?.outcome === "READ" ? reading.grade : null;
  });
  // Serve's rule: a looked-up point whose whole locator is one of THIS debate's extract labels, the reviewer agreeing.
  const labelPath = new Map(facts.extracts.map((extract) => [extract.label, extract.pathRef]));
  const agreed = facts.points.filter((point) => point.reviewOutcome === "agree");
  const sureOn = new Map<string, number>();
  let sureForCaseNamed = 0;
  for (const point of agreed) {
    const path = point.wayOfKnowing === "LOOKED_UP" && point.locator !== null ? labelPath.get(point.locator) : undefined;
    if (path === undefined) sureForCaseNamed += 1;
    else sureOn.set(path, (sureOn.get(path) ?? 0) + 1);
  }
  const rows = pathRefs.map((pathRef): PracticeWebPathRow => {
    const searches = facts.searches.filter((row) => row.pathRef === pathRef);
    const pages = facts.pages.filter((page) => pagePath.get(page.pageId) === pathRef);
    const extracts = facts.extracts.filter((extract) => extract.pathRef === pathRef);
    const calls = facts.calls.filter((call) => call.pathRef === pathRef && !isPlanner(call.callSiteKey));
    const fee = searches.reduce((sum, row) => sum + row.chargeMicros, 0);
    const proposed = calls.reduce((sum, call) => sum + call.proposedExtracts, 0);
    const kept = extracts.reduce((sum, extract) => sum + extract.foundBy.length, 0);
    const top = facts.picks.filter((pick) => pick.pathRef === pathRef).sort((a, b) => a.rank - b.rank).map((pick): PracticeWebTopPage => {
      const grades = gradesOf(pick.pageId);
      const read = grades.filter((grade): grade is number => grade !== null);
      return Object.freeze({ rank: pick.rank, grades: Object.freeze(grades),
        spread: read.length < 2 ? null : Math.max(...read) - Math.min(...read) });
    });
    return Object.freeze({
      pathRef, plan: facts.plan.find((row) => row.pathRef === pathRef)?.status ?? null,
      searches: searches.length,
      searchesAnswered: searches.filter((row) => ANSWERED.has(row.outcome)).length,
      searchesFailed: searches.filter((row) => !ANSWERED.has(row.outcome)).length,
      pagesFound: pages.length,
      pagesRead: pages.filter((page) => gradesOf(page.pageId)[0] !== null).length,
      top: Object.freeze(top),
      extractsKept: extracts.length,
      extractsDropped: Math.max(0, proposed - kept),
      extractsInPack: facts.packs.find((pack) => pack.pathRef === pathRef)?.extractLabels.length ?? 0,
      sure: sureOn.get(pathRef) ?? 0,
      aiCostNanoUsd: String(calls.reduce((sum, call) => sum + call.costNanoUsd, 0n)),
      searchFeeMicros: standIn ? 0 : fee,
      searchFeeNotPaidMicros: standIn ? fee : 0,
      seconds: spanSeconds([...searches.flatMap((row) => row.searchedAt === null ? [] : [row.searchedAt]),
        ...calls.flatMap((call) => [call.startedAt, call.finishedAt])])
    });
  });
  const planner = facts.calls.filter((call) => isPlanner(call.callSiteKey));
  const sum = (pick: (row: PracticeWebPathRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  return Object.freeze({
    search: facts.search,
    paths: Object.freeze(rows),
    planner: Object.freeze({ calls: planner.length, costNanoUsd: String(planner.reduce((total, call) => total + call.costNanoUsd, 0n)) }),
    unplacedCalls: facts.calls.filter((call) => call.pathRef === null && !isPlanner(call.callSiteKey)).length,
    sureForCaseNamed,
    totals: Object.freeze({
      searches: sum((row) => row.searches), pagesRead: sum((row) => row.pagesRead), extractsKept: sum((row) => row.extractsKept),
      extractsDropped: sum((row) => row.extractsDropped), sure: sum((row) => row.sure),
      aiCostNanoUsd: String(facts.calls.reduce((total, call) => total + call.costNanoUsd, 0n)),
      searchFeeMicros: sum((row) => row.searchFeeMicros), searchFeeNotPaidMicros: sum((row) => row.searchFeeNotPaidMicros),
      seconds: spanSeconds([...facts.searches.flatMap((row) => row.searchedAt === null ? [] : [row.searchedAt]),
        ...facts.calls.flatMap((call) => [call.startedAt, call.finishedAt])])
    })
  });
}

/* ----------------------------------------------------------------- reading the throwaway database */

/** One stored model call of a run, priced as the practice prices every call (its usage at its own tier). */
export type PracticeLedgerCall = Readonly<{
  attemptId: string | null; callSiteKey: string; model: string; outcome: string; startedAt: Date; finishedAt: Date;
  costNanoUsd: bigint;
  /** The model's reply text (decrypted under the run's key), only for an accepted call; null otherwise. */
  reply: () => Promise<string | null>;
}>;

/** A try's price from its stored usage (the practice's own rule, practice-debate.ts `collect`). */
export function practiceCallCostNanoUsd(model: string, metadata: unknown): bigint {
  const row = previewModelRow(model);
  if (row === undefined || typeof metadata !== "object" || metadata === null) return 0n;
  const recorded = metadata as { usage?: unknown; token_ceiling?: unknown };
  const usage = typeof recorded.usage === "object" && recorded.usage !== null ? recorded.usage as Record<string, unknown> : {};
  const n = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const input = n(usage.prompt_tokens) + n(usage.input_tokens);
  const output = n(usage.completion_tokens) + n(usage.output_tokens);
  return previewCallNanoUsd(row, BigInt(input), output, practiceTryTier(row, recorded.token_ceiling));
}

/** A run's stored model calls whose call-site key starts with `prefix`, in ledger order. */
export async function readPracticeLedgerCalls(pool: Pool, runId: string, prefix: string): Promise<readonly PracticeLedgerCall[]> {
  const rows = (await pool.query<{ attempt_id: string | null; call_site_key: string; actor_ref: string; outcome: string;
    started_at: Date; finished_at: Date; raw_artifact_ref: string | null; metadata_json: unknown; raw_text: string | null;
    content_ciphertext: unknown }>(
    `SELECT entry.attempt_id::text, entry.call_site_key, entry.actor_ref, entry.outcome, entry.started_at, entry.finished_at,
            entry.raw_artifact_ref::text, artifact.metadata_json, artifact.raw_text, artifact.content_ciphertext
       FROM ledger.ledger_entry AS entry
       LEFT JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = entry.raw_artifact_ref
      WHERE entry.run_id=$1 AND entry.action_kind='MODEL_CALL' AND starts_with(entry.call_site_key, $2)
      ORDER BY entry.sequence`, [runId, prefix])).rows;
  return Object.freeze(rows.map((row): PracticeLedgerCall => {
    const model = practiceModelOfRef(row.actor_ref);
    return Object.freeze({
      attemptId: row.attempt_id, callSiteKey: row.call_site_key, model, outcome: row.outcome,
      startedAt: row.started_at, finishedAt: row.finished_at, costNanoUsd: practiceCallCostNanoUsd(model, row.metadata_json),
      reply: async () => {
        if (row.outcome !== "OK" || row.raw_artifact_ref === null || row.raw_text === null) return null;
        const stored = await decryptContentForRun<{ rawText: string }>(pool, runId, "ledger.raw_artifact", row.raw_artifact_ref,
          (row.content_ciphertext ?? null) as never, { rawText: row.raw_text });
        return replyContentOf(stored.rawText);
      }
    });
  }));
}

/** A reply's JSON object (a fenced or wrapped one too), or null. */
export function practiceReplyObject(content: string): Record<string, unknown> | null {
  const attempt = (text: string): Record<string, unknown> | null => {
    try {
      const value = JSON.parse(text) as unknown;
      return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
    } catch { return null; }
  };
  const first = content.indexOf("{");
  const last = content.lastIndexOf("}");
  return attempt(content) ?? (first >= 0 && last > first ? attempt(content.slice(first, last + 1)) : null);
}

/** How many extracts a reader's reply proposed (`pages[].extracts[]`), 0 for anything else. */
export function practiceProposedExtracts(content: string | null): number {
  const reply = content === null ? null : practiceReplyObject(content);
  const pages = reply?.pages;
  if (!Array.isArray(pages)) return 0;
  return pages.reduce<number>((sum, page) => {
    const extracts = typeof page === "object" && page !== null ? (page as { extracts?: unknown }).extracts : undefined;
    return sum + (Array.isArray(extracts) ? extracts.length : 0);
  }, 0);
}

/** The answer index a web call-site key names (`WEB:read1:<i>:<b>`, `WEB:pick:<i>`, `WEB:read-top:<i>:<r>`), or null. */
export function practiceWebCallIndex(callSiteKey: string): number | null {
  const match = /^WEB:(?:read1|pick|read-top):(\d+)(?::|$)/u.exec(callSiteKey);
  return match === null ? null : Number(match[1]);
}

const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu;

/**
 * The path a web call worked on: the path of the first page of the run its prompt names (a reader's prompt names each page
 * by `web-page-text:<page id>@<digest>`, the pick's by its id), or null when it names none.
 */
export function practicePathNamedBy(promptText: string | null, pathOfPage: ReadonlyMap<string, string>): string | null {
  const named = promptText === null ? [] : promptText.match(UUIDS) ?? [];
  return named.map((pageId) => pathOfPage.get(pageId)).find((path) => path !== undefined) ?? null;
}

/**
 * Each web call's path, in order: the path its answer index was first seen on (a reader's prompt names its pages; a pick's
 * names them by short prompt ids, so it takes its index's path), or null for the planner and an index no prompt placed.
 * `promptOf` reads a call's prompt only while its index has no path yet.
 */
export async function practicePlaceWebCalls<T extends Readonly<{ callSiteKey: string }>>(calls: readonly T[],
  pathOfPage: ReadonlyMap<string, string>, promptOf: (call: T) => Promise<string | null>): Promise<readonly (string | null)[]> {
  const pathOfIndex = new Map<number, string>();
  for (const call of calls) {
    const index = practiceWebCallIndex(call.callSiteKey);
    if (index === null || pathOfIndex.has(index)) continue;
    const path = practicePathNamedBy(await promptOf(call), pathOfPage);
    if (path !== null) pathOfIndex.set(index, path);
  }
  return Object.freeze(calls.map((call) => {
    const index = practiceWebCallIndex(call.callSiteKey);
    return index === null ? null : pathOfIndex.get(index) ?? null;
  }));
}

/**
 * Reads the block from the throwaway database (plaintext columns only; a reader's reply is opened under the run's key to
 * count its proposed extracts, nothing of it is kept). Null when the run's web step left no row at all (no plan decision,
 * no search): today's report keys. A call is placed on the path of the first page of the run its own prompt names.
 */
export async function readPracticeWeb(pool: Pool, runId: string, search: PracticeWebSearchSource): Promise<PracticeWebBlock | null> {
  const plan = (await pool.query<{ path_ref: string; status: string }>(
    "SELECT path_ref, status FROM identity.web_plan_path WHERE run_id=$1 ORDER BY decided_at, path_ref", [runId])).rows;
  const searches = (await pool.query<{ search_id: string; path_ref: string; outcome: string; charge_micros: string; searched_at: Date }>(
    `SELECT search_id::text, path_ref, outcome, charge_micros::text, searched_at FROM identity.web_search
      WHERE run_id=$1 ORDER BY searched_at, search_id`, [runId])).rows;
  if (plan.length === 0 && searches.length === 0) return null;
  const pages = (await pool.query<{ page_id: string; search_id: string }>(
    "SELECT page_id::text, search_id::text FROM identity.web_page WHERE run_id=$1 ORDER BY search_id, rank", [runId])).rows;
  const readings = (await pool.query<{ page_id: string; reader: number; outcome: string; grade: number | null }>(
    "SELECT page_id::text, reader, outcome, grade FROM identity.web_reading WHERE run_id=$1", [runId])).rows;
  const extracts = (await pool.query<{ path_ref: string; label: string; found_by: number[] }>(
    "SELECT path_ref, label, found_by FROM identity.web_extract WHERE run_id=$1 ORDER BY label", [runId])).rows;
  const picks = (await pool.query<{ path_ref: string; rank: number; page_id: string }>(
    "SELECT path_ref, rank, page_id::text FROM identity.web_pick WHERE run_id=$1 ORDER BY path_ref, rank", [runId])).rows;
  const packs = (await pool.query<{ path_ref: string; extract_labels: string[] }>(
    "SELECT path_ref, extract_labels FROM identity.web_pack WHERE run_id=$1", [runId])).rows;
  const points = (await pool.query<{ way_of_knowing: string; locator: string | null; review_outcome: string | null }>(
    `SELECT node.way_of_knowing, node.locator,
            (SELECT review.outcome FROM ledger.node_review AS review WHERE review.node_id = node.node_id
              ORDER BY review.at_seq DESC LIMIT 1) AS review_outcome
       FROM core.node AS node WHERE node.run_id=$1 AND node.generation_status IS DISTINCT FROM 'stale'`, [runId])).rows;
  const pathOfSearch = new Map(searches.map((row) => [row.search_id, row.path_ref]));
  const pathOfPage = new Map(pages.map((row) => [row.page_id, pathOfSearch.get(row.search_id)!]));
  const ledger = await readPracticeLedgerCalls(pool, runId, "WEB:");
  const placed = await practicePlaceWebCalls(ledger, pathOfPage,
    async (call) => call.attemptId === null ? null : (await readCallPrompt(pool, call.attemptId))?.promptText ?? null);
  const calls: PracticeWebFacts["calls"][number][] = [];
  for (const [at, call] of ledger.entries()) {
    const reads = call.callSiteKey.startsWith("WEB:read1:") || call.callSiteKey.startsWith("WEB:read-top:");
    calls.push(Object.freeze({ callSiteKey: call.callSiteKey, pathRef: placed[at]!, costNanoUsd: call.costNanoUsd,
      startedAt: call.startedAt, finishedAt: call.finishedAt, proposedExtracts: reads ? practiceProposedExtracts(await call.reply()) : 0 }));
  }
  return practiceWebBlock({
    search,
    plan: plan.map((row) => Object.freeze({ pathRef: row.path_ref, status: row.status })),
    searches: searches.map((row) => Object.freeze({ searchId: row.search_id, pathRef: row.path_ref, outcome: row.outcome,
      chargeMicros: Number(row.charge_micros), searchedAt: row.searched_at })),
    pages: pages.map((row) => Object.freeze({ pageId: row.page_id, searchId: row.search_id })),
    readings: readings.map((row) => Object.freeze({ pageId: row.page_id, reader: row.reader, outcome: row.outcome, grade: row.grade })),
    extracts: extracts.map((row) => Object.freeze({ pathRef: row.path_ref, label: row.label, foundBy: Object.freeze([...row.found_by]) })),
    picks: picks.map((row) => Object.freeze({ pathRef: row.path_ref, rank: row.rank, pageId: row.page_id })),
    packs: packs.map((row) => Object.freeze({ pathRef: row.path_ref, extractLabels: Object.freeze([...row.extract_labels]) })),
    calls,
    points: points.map((row) => Object.freeze({ wayOfKnowing: row.way_of_knowing, locator: row.locator, reviewOutcome: row.review_outcome }))
  });
}

/* ----------------------------------------------------------------- report.md */

/** A markdown table cell: backslashes first, so an escaped pipe can never be undone by the text's own backslash. */
const cell = (text: string): string => text.replace(/\\/gu, "\\\\").replace(/\|/gu, "\\|");
const microsAsNano = (micros: number): bigint => BigInt(micros) * 1_000n;

/** report.md: the web table, one row per path, then one line for the planner and the rest. `dollars` is the report's `usd`. */
export function practiceWebLines(block: PracticeWebBlock, dollars: (nano: bigint) => string): readonly string[] {
  const grade = (value: number | null) => value === null ? "-" : String(value);
  const searchLine = block.search === "STAND_IN"
    ? "searches answered by the practice's stand-in: no search was paid; the price list's fee is shown as not paid"
    : "searches answered by Perplexity through its gate";
  const lines = [
    `Web search per path (W5-2; counts, grades, money and time only; ${searchLine}):`, "",
    "| path | plan | searches (answered / failed) | pages read / found | top pages (rank: grades 1/2/3) | reader spread | "
      + "extracts kept | extracts dropped | in pack | Sure | AI cost $ | search fee $ | time s |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|"
  ];
  for (const row of block.paths) {
    const top = row.top.length === 0 ? "-" : row.top.map((page) => `${String(page.rank)}: ${page.grades.map(grade).join("/")}`).join(", ");
    const spread = row.top.length === 0 ? "-" : row.top.map((page) => grade(page.spread)).join(", ");
    const fee = block.search === "STAND_IN" ? `0 (not paid ${dollars(microsAsNano(row.searchFeeNotPaidMicros))})`
      : dollars(microsAsNano(row.searchFeeMicros));
    lines.push(`| ${cell(row.pathRef)} | ${row.plan ?? "-"} | ${String(row.searches)} (${String(row.searchesAnswered)} / `
      + `${String(row.searchesFailed)}) | ${String(row.pagesRead)} / ${String(row.pagesFound)} | ${top} | ${spread} | `
      + `${String(row.extractsKept)} | ${String(row.extractsDropped)} | ${String(row.extractsInPack)} | ${String(row.sure)} | `
      + `${dollars(BigInt(row.aiCostNanoUsd))} | ${fee} | ${row.seconds === null ? "-" : String(row.seconds)} |`);
  }
  const totals = block.totals;
  const totalFee = block.search === "STAND_IN" ? `$0 (not paid $${dollars(microsAsNano(totals.searchFeeNotPaidMicros))})`
    : `$${dollars(microsAsNano(totals.searchFeeMicros))}`;
  lines.push("",
    `- planner: ${String(block.planner.calls)} call(s), $${dollars(BigInt(block.planner.costNanoUsd))}; web calls on no named path: `
      + `${String(block.unplacedCalls)}`,
    `- "Sure, for the case named" at most (agreed, but not on a checked extract of this debate): ${String(block.sureForCaseNamed)}`,
    `- in all: ${String(totals.searches)} searches, ${String(totals.pagesRead)} pages read, ${String(totals.extractsKept)} extracts kept, `
      + `${String(totals.extractsDropped)} dropped, ${String(totals.sure)} "Sure"; AI $${dollars(BigInt(totals.aiCostNanoUsd))}, `
      + `search fee ${totalFee}; ${totals.seconds === null ? "-" : String(totals.seconds)} s`,
    "");
  return Object.freeze(lines);
}
