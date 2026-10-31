import type { PathRewrite } from "@debateai/contract";
import { rewriteByDig, rewriteStateOf, uniqueOpenQuestions } from "./mapModel.js";
import type { DigView, RewriteState, SeenSnapshot, V4Change, V4Map, V4Path, V4Selection } from "./types.js";

/*
 * V4 initial (2026-10-28), D4: what the page saw, item by item, and what changed since. Fix wave 1 (Decision A): the
 * snapshot lives in memory only — the first complete load is the baseline and later live changes are news ("while you
 * were here"). Each item id carries its word (a dig state, a fate, open/dug, a trust word); removed items are not news.
 */

/** The item kinds in the order the changes are told: digs, paths, open questions, points. */
const ITEM_ORDER = ["dig:", "path:", "open:", "point:"] as const;

function rankOf(id: string): number {
  const rank = ITEM_ORDER.findIndex((prefix) => id.startsWith(prefix));
  return rank < 0 ? ITEM_ORDER.length : rank;
}

/*
 * W4-6 (dig model revision): a dig of the new model rewrites the path it came from, so once its run is done its item's
 * word is what became of that rewrite. The words fit the account's last-visit shape (0131), so "since your last visit"
 * tells a finished rewrite too. A rewrite on this map whose dig the page does not list is an item of its own.
 */
const REWRITE_WORDS: Readonly<Record<RewriteState, string>> = Object.freeze({
  REWRITING: "REWRITING",
  REWRITTEN: "CHANGED",
  NO_CHANGE: "NO_CHANGE",
  FAILED: "REWRITE_FAILED"
});
const REWRITE_WORD_SET: ReadonlySet<string> = new Set(Object.values(REWRITE_WORDS));
/** The words of a finished rewrite: told as "A dig changed the path …" or "A dig didn't change the path …". */
const FINISHED_WORDS: ReadonlyMap<string, boolean> = new Map([["CHANGED", true], ["NO_CHANGE", false]]);

function rewriteWord(rewrite: PathRewrite): string {
  return REWRITE_WORDS[rewriteStateOf(rewrite)!];
}

/** A dig's word: its state, and once it is done, what became of its rewrite (this map's record of it first). */
function digWord(map: V4Map, dig: DigView): string {
  if (dig.state !== "DONE") return dig.state;
  const rewrite = rewriteByDig(map, dig.link.childRunId)?.rewrite ?? dig.rewrite ?? null;
  return rewrite === null ? dig.state : rewriteWord(rewrite);
}

/** W4-6: the word is about a dig's rewrite of a path (so its news is told at that path). */
export function isRewriteWord(word: string): boolean {
  return REWRITE_WORD_SET.has(word);
}

export function snapshotItems(map: V4Map, digs: readonly DigView[]): Readonly<Record<string, string>> {
  const items: Record<string, string> = {};
  for (const dig of digs) items[`dig:${dig.link.childRunId}`] = digWord(map, dig);
  for (const path of map.paths) {
    for (const rewrite of path.rewrites?.history ?? []) {
      const id = `dig:${rewrite.dig_run_id}`;
      if (!(id in items)) items[id] = rewriteWord(rewrite);
    }
  }
  for (const path of map.paths) items[`path:${path.id}`] = path.fate ?? "none";
  // DATA-9: a failed dig leaves its question open again, as the map shows it.
  const dug = new Set(digs.filter((dig) => dig.state !== "FAILED").flatMap((dig) => dig.link.openQuestionIds));
  for (const question of uniqueOpenQuestions(map)) {
    items[`open:${question.id}`] = dug.has(question.id) ? "dug" : "open";
  }
  for (const point of map.points) items[`point:${point.id}`] = point.trust ?? "unchecked";
  return items;
}

export function diffSnapshots(before: SeenSnapshot | null, now: Readonly<Record<string, string>>): readonly V4Change[] {
  if (before === null) return [];
  const changes: V4Change[] = [];
  for (const [id, word] of Object.entries(now)) {
    const old = Object.prototype.hasOwnProperty.call(before.items, id) ? before.items[id] : undefined;
    if (old === undefined) changes.push({ id, kind: "ADDED", before: null, now: word });
    else if (old !== word) changes.push({ id, kind: "CHANGED", before: old, now: word });
  }
  // Array.prototype.sort is stable, so items keep their map order within a kind.
  return changes.sort((a, b) => rankOf(a.id) - rankOf(b.id));
}

/** Where the "Show me the changes" tour goes for one change: a point opens the first path that holds it. */
export function selectionForChange(map: V4Map, change: V4Change): V4Selection {
  const cut = change.id.indexOf(":");
  if (cut < 0) return "root";
  const kind = change.id.slice(0, cut);
  const rest = change.id.slice(cut + 1);
  if (kind === "dig") {
    // W4-6: a dig's rewrite is news at the path it rewrote, where the new text is.
    const rewritten = isRewriteWord(change.now) ? rewriteByDig(map, rest) : null;
    return rewritten === null ? `dig:${rest}` : `path:${rewritten.path.id}`;
  }
  if (kind === "path") return `path:${rest}`;
  if (kind === "open") return `open:${rest}`;
  if (kind === "point") {
    const path = map.paths.find((candidate) => candidate.points.some((point) => point.id === rest));
    return path === undefined ? "root" : `path:${path.id}`;
  }
  return "root";
}

/** W4-6: one finished rewrite told in the news: the path it rewrote and whether the dig changed it. */
export type RewriteNews = Readonly<{ path: V4Path; changed: boolean }>;

/** W4-6: the finished rewrites among these changes, each path once (the newest word wins), in the order they came. */
export function rewriteNewsOf(map: V4Map, changes: readonly V4Change[]): readonly RewriteNews[] {
  const byPath = new Map<string, RewriteNews>();
  for (const change of changes) {
    if (!change.id.startsWith("dig:")) continue;
    const changed = FINISHED_WORDS.get(change.now);
    if (changed === undefined) continue;
    const rewritten = rewriteByDig(map, change.id.slice("dig:".length));
    if (rewritten === null) continue;
    byPath.delete(rewritten.path.id);
    byPath.set(rewritten.path.id, { path: rewritten.path, changed });
  }
  return [...byPath.values()];
}
