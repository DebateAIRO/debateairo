import type { Answer, PathRewrite } from "@debateai/contract";
import { selectionForChange } from "./changes.js";
import { rewriteByDig } from "./mapModel.js";
import type { V4Change, V4Map, V4Path, V4Selection } from "./types.js";

/*
 * V4 screen review, owner picks of 3 Nov 2026 (docs/research/2026-11-03-v4-ux-review/OWNER-PICKS-2026-11-03.md):
 * - journey-f17 / wait-f4: one ready moment for the answer, a dig and the report (a small note, the tab title, one line
 *   for screen readers, focus kept, a dot on that place until opened, kept with the account).
 * - wait-f15 / map-f21: the first arrival of the answer, and the short answer being finished, are never news; only digs
 *   and rewrites that land after the person has seen the map are.
 * - journey-f10 / dig-f3: "What your digs did", one name and one set of sentences: Corrected, Added to, Confirmed (the
 *   three result tags of journey-f11), and the win sentence "Confirmed: the answer holds."
 * - dig-f1: the main answer rewritten after a dig is news at the question, and the last stop of the tour.
 * - dig-f19 / map-f17: the paths changed since the report, named, with no count.
 * - map-f19: "Since you last looked", from the last visit the account keeps (migration 0131).
 * Everything here is worked out by code from what the page already reads; nothing is kept in the browser.
 */

/** journey-f11: the three result tags a dig gives a path. */
export const DIG_RESULTS = ["CORRECTED", "ADDED_TO", "CONFIRMED"] as const;
export type DigResult = (typeof DIG_RESULTS)[number];

type FinishedRewrite = Extract<PathRewrite, { state: "READY" | "READY_WITH_RESERVATION" }>;

function isFinished(rewrite: PathRewrite): rewrite is FinishedRewrite {
  return rewrite.state === "READY" || rewrite.state === "READY_WITH_RESERVATION";
}

/**
 * What a finished rewrite made of its path: CONFIRMED when the dig changed nothing, CORRECTED when it changed where the
 * path landed, ADDED_TO when it changed the path but not where it landed. Null while it is written, or when it failed.
 */
export function digResultOf(rewrite: PathRewrite): DigResult | null {
  if (!isFinished(rewrite)) return null;
  if (!rewrite.changed) return "CONFIRMED";
  return rewrite.fate_before !== rewrite.text.fate ? "CORRECTED" : "ADDED_TO";
}

export type PathResult = Readonly<{ path: V4Path; result: DigResult }>;

/** Each path a dig settled, with what its newest finished rewrite made of it, in the map's order (each position once). */
export function pathResults(map: V4Map): readonly PathResult[] {
  const seen = new Set<string>();
  const results: PathResult[] = [];
  for (const path of map.paths) {
    const key = path.positionRef ?? path.id;
    if (seen.has(key)) continue;
    const newest = (path.rewrites?.history ?? []).filter(isFinished).at(-1);
    if (newest === undefined) continue;
    seen.add(key);
    results.push({ path, result: digResultOf(newest)! });
  }
  return results;
}

/** The win sentence's moment: every path a dig settled held as it was, so the answer holds. */
export function answerHolds(results: readonly PathResult[]): boolean {
  return results.length > 0 && results.every((entry) => entry.result === "CONFIRMED");
}

// ── What is news ────────────────────────────────────────────────────────────────────────────────────────────────

/** dig-f1: the item that stands for the main answer in the page's snapshot (never kept by the account: 0131's ids are digs, paths, open questions and points). */
export const MAIN_ANSWER_PREFIX = "main:";

/** dig-f1: the main answer's item (its current version), or none when the answer has no main answer part. */
export function mainAnswerItems(answer: Answer | null | undefined): Readonly<Record<string, string>> {
  const main = answer?.main_answer;
  if (answer === null || answer === undefined || main === undefined) return {};
  return { [`${MAIN_ANSWER_PREFIX}${answer.answer_id}`]: main.current === null ? "none" : `v${main.current.version}` };
}

/** dig-f1: a change is being written into the main answer, so the page keeps reading it (every 15 s). */
export function mainAnswerWriting(answer: Answer | null | undefined): boolean {
  return answer?.main_answer?.writing === true;
}

/** True while the first answer is still arriving or has just finished arriving: its short answer is being written, or that state just changed. */
export function firstAnswerArriving(before: V4Map["storyState"] | null, now: V4Map["storyState"]): boolean {
  return before === "WRITING" || now === "WRITING" || (before !== null && before !== now);
}

/**
 * wait-f15 / map-f21: while the first answer arrives (the short answer written, the paths filling in), what it changes is
 * the person's first sight of it, never news. Only digs (finishing, failing, rewriting) and the main answer's rewrite are.
 */
export function laterNewsOnly(changes: readonly V4Change[]): readonly V4Change[] {
  return changes.filter((change) => change.id.startsWith("dig:") || change.id.startsWith(MAIN_ANSWER_PREFIX));
}

/** dig-f1: the question itself (the main answer at the top) is the tour's last stop; the other stops keep their order. */
export function rootLast(stops: readonly V4Selection[]): readonly V4Selection[] {
  return stops.includes("root") ? [...stops.filter((stop) => stop !== "root"), "root"] : stops;
}

/** The places these changes are at, each once, in the order they came, the question itself last (RULES-11: a stop is a place). */
export function stopsOfChanges(map: V4Map, changes: readonly V4Change[]): readonly V4Selection[] {
  const stops: V4Selection[] = [];
  for (const change of changes) {
    const stop = selectionForChange(map, change);
    if (!stops.includes(stop)) stops.push(stop);
  }
  return rootLast(stops);
}

/** The words of a dig that has finished one way or another (lib/v4/changes.ts digWord). */
const FINISHED_DIG_WORDS: ReadonlySet<string> = new Set(["DONE", "FAILED", "CHANGED", "NO_CHANGE", "REWRITE_FAILED"]);

/** journey-f17: the news that is a ready moment of its own: a dig finished (one way or another), or the main answer rewritten. */
export function readyNewsOf(changes: readonly V4Change[]): readonly V4Change[] {
  return changes.filter((change) => change.id.startsWith(MAIN_ANSWER_PREFIX)
    || (change.id.startsWith("dig:") && FINISHED_DIG_WORDS.has(change.now)));
}

/**
 * dig-f3: the finished-dig notice speaks as a result. One dig: what it made of its path ("Done: “…” changed." or "…
 * holds."), or that it didn't finish; several: "Done: your digs finished."; the main answer alone: "The answer was
 * updated."; anything else (a dig started from another page): "Something new on the map."
 */
export type NewsHeadline =
  | Readonly<{ kind: "CHANGED" | "HOLDS"; path: V4Path }>
  | Readonly<{ kind: "FAILED"; path: V4Path | null }>
  | Readonly<{ kind: "MANY" | "ONE_DONE" | "ANSWER" | "OTHER" }>;

export function newsHeadlineOf(map: V4Map, changes: readonly V4Change[]): NewsHeadline {
  const finished = new Map<string, V4Change>();
  for (const change of changes) {
    if (change.id.startsWith("dig:") && FINISHED_DIG_WORDS.has(change.now)) finished.set(change.id, change);
  }
  if (finished.size >= 2) return { kind: "MANY" };
  const only = [...finished.values()][0];
  if (only !== undefined) {
    const rewritten = rewriteByDig(map, only.id.slice("dig:".length));
    if (only.now === "FAILED" || only.now === "REWRITE_FAILED") return { kind: "FAILED", path: rewritten?.path ?? null };
    const result = rewritten === null ? null : digResultOf(rewritten.rewrite);
    if (rewritten === null || result === null) return { kind: "ONE_DONE" };
    return { kind: result === "CONFIRMED" ? "HOLDS" : "CHANGED", path: rewritten.path };
  }
  if (changes.some((change) => change.id.startsWith(MAIN_ANSWER_PREFIX))) return { kind: "ANSWER" };
  return { kind: "OTHER" };
}

/**
 * map-f19: what a dig made of each path since the account's last visit (only the news that visit gave), by path id.
 * A path a later dig settled again shows the newest result.
 */
export function sinceLastLookedOf(map: V4Map, visitChanges: readonly V4Change[]): ReadonlyMap<string, DigResult> {
  const results = new Map<string, DigResult>();
  for (const change of visitChanges) {
    if (!change.id.startsWith("dig:") || (change.now !== "CHANGED" && change.now !== "NO_CHANGE")) continue;
    const rewritten = rewriteByDig(map, change.id.slice("dig:".length));
    if (rewritten === null) continue;
    const newest = (rewritten.path.rewrites?.history ?? []).filter(isFinished).at(-1);
    const result = newest === undefined ? null : digResultOf(newest);
    if (result !== null) results.set(rewritten.path.id, result);
  }
  return results;
}

// ── "Seen" kept with the account ────────────────────────────────────────────────────────────────────────────────

/** journey-f17: the items of these changes whose place (never the question itself) the person has not opened. */
export function unseenIdsOf(map: V4Map, changes: readonly V4Change[], opened: ReadonlySet<string>): ReadonlySet<string> {
  const unseen = new Set<string>();
  for (const change of changes) {
    const stop = selectionForChange(map, change);
    if (stop !== "root" && !opened.has(stop)) unseen.add(change.id);
  }
  return unseen;
}

/**
 * journey-f17: whether a ready place was seen is kept with the account, in the last visit it already keeps (0131): the
 * map as shown now, except that an item whose news the person has not opened yet keeps the word the account had (or
 * stays out when it had none). The next visit, on any device, still tells that news and still marks its place, until
 * the person opens it.
 */
export function visitItemsToKeep(
  now: Readonly<Record<string, string>>,
  account: Readonly<Record<string, string>>,
  unseen: ReadonlySet<string>
): Readonly<Record<string, string>> {
  const kept: Record<string, string> = {};
  for (const [id, word] of Object.entries(now)) {
    if (!unseen.has(id)) {
      kept[id] = word;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(account, id)) kept[id] = account[id]!;
  }
  return kept;
}

// ── The report is older than the map ────────────────────────────────────────────────────────────────────────────

/** When a dig last changed this path (its newest finished rewrite that changed it), or null when none did. */
function lastChangedAt(path: V4Path): number | null {
  const times = (path.rewrites?.history ?? [])
    .filter((rewrite): rewrite is FinishedRewrite => isFinished(rewrite) && rewrite.changed)
    .map((rewrite) => Date.parse(rewrite.rewritten_at))
    .filter((time) => !Number.isNaN(time));
  return times.length === 0 ? null : Math.max(...times);
}

/**
 * dig-f19 / map-f17: the paths a dig changed since the latest report, named, in the map's order. The server says whether
 * the map moved on since that report (`changed_since`, with its count, which is never shown); the names are the paths a
 * dig changed after the report was written. When the page does not know when that was, they are the `count` paths a dig
 * changed last. None before any report: since the 31 Oct ruling the main answer updates itself after each change.
 */
export function pathsChangedSinceReport(map: V4Map, reportWrittenAt: string | null = null): readonly V4Path[] {
  const since = map.changedSince ?? null;
  if (since === null || since.since_report_version === null || since.count === 0) return [];
  const seen = new Set<string>();
  const changed: { path: V4Path; at: number; order: number }[] = [];
  for (const [order, path] of map.paths.entries()) {
    const key = path.positionRef ?? path.id;
    const at = lastChangedAt(path);
    if (at === null || seen.has(key)) continue;
    seen.add(key);
    changed.push({ path, at, order });
  }
  const cut = reportWrittenAt === null ? Number.NaN : Date.parse(reportWrittenAt);
  const named = Number.isNaN(cut)
    ? changed.sort((a, b) => b.at - a.at).slice(0, since.count)
    : changed.filter((entry) => entry.at > cut);
  return named.sort((a, b) => a.order - b.order).map((entry) => entry.path);
}
