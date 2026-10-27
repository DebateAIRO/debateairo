import { openQuestionsOf } from "./mapModel.js";
import type { DigView, SeenSnapshot, V4Change, V4Map, V4Selection } from "./types.js";

/*
 * V4 initial (2026-10-28), D4 "back after a round": what this browser saw last time, item by item, and what changed
 * since. Each item id carries its word (a dig state, a fate, open/dug, a trust word); removed items are not news.
 */

/** The item kinds in the order the changes are told: digs, paths, open questions, points. */
const ITEM_ORDER = ["dig:", "path:", "open:", "point:"] as const;

function rankOf(id: string): number {
  const rank = ITEM_ORDER.findIndex((prefix) => id.startsWith(prefix));
  return rank < 0 ? ITEM_ORDER.length : rank;
}

export function snapshotItems(map: V4Map, digs: readonly DigView[]): Readonly<Record<string, string>> {
  const items: Record<string, string> = {};
  for (const dig of digs) items[`dig:${dig.link.childRunId}`] = dig.state;
  for (const path of map.paths) items[`path:${path.id}`] = path.fate ?? "none";
  const dug = new Set(digs.flatMap((dig) => dig.link.openQuestionIds));
  for (const question of openQuestionsOf(map)) {
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
  if (kind === "dig") return `dig:${rest}`;
  if (kind === "path") return `path:${rest}`;
  if (kind === "open") return `open:${rest}`;
  if (kind === "point") {
    const path = map.paths.find((candidate) => candidate.points.some((point) => point.id === rest));
    return path === undefined ? "root" : `path:${path.id}`;
  }
  return "root";
}
