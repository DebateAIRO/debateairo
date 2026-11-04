import { DIG_LEVEL_MAX, type Answer, type DigLinks, type PathRewrite } from "@debateai/contract";
import type { MessageCatalog } from "../i18n/translate.js";
import { mergeDigLinks } from "./accountMemory.js";
import { digLinksFor, type IndexEntry } from "./digIndex.js";
import { isFinishedRewrite } from "./mapModel.js";
import type { DigLink, DigView } from "./types.js";

/*
 * Owner's screen review, 3 Nov 2026 (dig-f2): when a dig deeper down (level 2 or 3) rewrites paths higher up, the first
 * map did not notice until a reload: it followed only its own digs. The fix: "While any dig below this map is still working
 * or still climbing, check every 15 seconds. Stop checking once nothing is running."
 *
 * A map follows its own digs itself (depth 1: their state, and their rewrite of its paths). This module finds the digs
 * BELOW those (depth 2 and more) and says whether any of them can still change this map:
 *  - WORKING: it waits or runs (a dig held at the month wall waits for the person, so it is not counted);
 *  - CLIMBING: it is done and its change is still on its way up. The server's climb (apps/runner/src/path-climb.ts) rewrites
 *    the path above each level in turn, and stops at a level that comes out unchanged or failed. Each level's row is on that
 *    debate's answer, in the history of the path the dig below it dug, named by the dig that STARTED the climb
 *    (packages/serve/src/path-rewrites.ts turnsOnTheLine: the row's run id). So the page walks up from the dig's own rewrite
 *    (its own answer's `dig.rewrite`) through each debate above, to this map's own answer;
 *  - QUIET: nothing more can come of it here.
 * A level whose row is not there yet (the climb has not taken its turn there) counts as climbing, but only for
 * CLIMB_WATCH_MS after the dig's own rewrite was done, so a row the server leaves out never keeps the page asking for ever.
 *
 * Where the digs below are found: each dig's own records (N11, GET /v1/runs/{id}/dig-links), the account's question list by
 * text for digs made before the records existed (lib/v4/digIndex.ts), and the digs started in this visit (memory only).
 * Nothing here reads or stores anything; the hook (useDigsBelow.ts) does the reads.
 */

/** A level whose climb row is not there yet is waited for this long after the dig's own rewrite was done (never shown). */
export const CLIMB_WATCH_MS = 30 * 60_000;

/** One dig below a map. `above`: the debates above it, nearest first — its parent first, the map's own debate last. */
export type BelowDig = Readonly<{ link: DigLink; depth: number; above: readonly string[] }>;

export type BelowState = "WORKING" | "CLIMBING" | "QUIET";

const lower = (runId: string): string => runId.toLowerCase();

export type BelowTreeInput = Readonly<{
  /** The map's own debate. */
  rootRunId: string;
  /** The map's own digs (depth 1), as the page already follows them. */
  direct: readonly DigLink[];
  /** Each debate's dig records as read (by run id); absent: not read; null: could not be read. */
  records: ReadonlyMap<string, DigLinks | null>;
  /** The account's question list (digs made before the records are found in it by text). */
  index: readonly IndexEntry[];
  /** The digs started in this visit, on any V4 page (memory only). */
  visit: readonly DigLink[];
  catalog: MessageCatalog;
}>;

/** The digs made from one debate: its records first, then the ones found by text, then this visit's own. */
function childrenOf(runId: string, input: BelowTreeInput): readonly DigLink[] {
  const entry = input.index.find((candidate) => lower(candidate.runId) === lower(runId));
  const byText = entry === undefined ? [] : digLinksFor(runId, entry.questionLine, null, input.index, input.catalog);
  const known = mergeDigLinks(input.records.get(runId) ?? null, byText, null);
  const ids = new Set(known.map((link) => lower(link.childRunId)));
  return [...known, ...input.visit.filter((link) => lower(link.parentRunId) === lower(runId) && !ids.has(lower(link.childRunId)))];
}

/**
 * Every dig below the map's own digs, nearest levels first, each once (a loop in the records, or a dig found two ways, is
 * taken once). At most DIG_LEVEL_MAX levels below the map: no dig sits deeper than that.
 */
export function digsBelowOf(input: BelowTreeInput): readonly BelowDig[] {
  const seen = new Set<string>([lower(input.rootRunId), ...input.direct.map((link) => lower(link.childRunId))]);
  let frontier: readonly Readonly<{ runId: string; depth: number; above: readonly string[] }>[] =
    input.direct.map((link) => ({ runId: link.childRunId, depth: 1, above: [input.rootRunId] }));
  const out: BelowDig[] = [];
  while (frontier.length > 0) {
    const next: Array<Readonly<{ runId: string; depth: number; above: readonly string[] }>> = [];
    for (const node of frontier) {
      if (node.depth >= DIG_LEVEL_MAX) continue;
      for (const link of childrenOf(node.runId, input)) {
        if (seen.has(lower(link.childRunId))) continue;
        seen.add(lower(link.childRunId));
        const below: BelowDig = Object.freeze({ link, depth: node.depth + 1, above: Object.freeze([node.runId, ...node.above]) });
        out.push(below);
        next.push({ runId: link.childRunId, depth: below.depth, above: below.above });
      }
    }
    frontier = next;
  }
  return Object.freeze(out);
}

/** The debates whose dig records the tree still needs (the map's own digs and every dig below), not read yet. */
export function recordsToRead(input: BelowTreeInput, below: readonly BelowDig[]): readonly string[] {
  const nodes = [...input.direct.map((link) => link.childRunId), ...below.filter((dig) => dig.depth < DIG_LEVEL_MAX).map((dig) => dig.link.childRunId)];
  return [...new Set(nodes)].filter((runId) => !input.records.has(runId));
}

/** The row a climb started by `digRunId` left on a debate's answer (in any of its paths' histories), or null. */
export function climbRowOf(answer: Answer | null | undefined, digRunId: string): PathRewrite | null {
  for (const path of answer?.path_rewrites?.paths ?? []) {
    const row = path.history.find((rewrite) => lower(rewrite.dig_run_id) === lower(digRunId));
    if (row !== undefined) return row;
  }
  return null;
}

/** The debates above a dig whose answers the climb's walk reads: all but its parent (its own rewrite says that level). */
export function climbAnswersNeeded(dig: BelowDig): readonly string[] {
  return dig.above.slice(1);
}

/**
 * Whether one dig below can still change the map (see the head of this file). `view`: the dig as last read (null: not read
 * yet, so it counts as working until it is). `answerOf`: the answer of a debate above it as last read (undefined: not read
 * yet); the map's own debate gives the page's own answer.
 */
export function belowStateOf(dig: BelowDig, view: DigView | null, answerOf: (runId: string) => Answer | null | undefined,
  now: number): BelowState {
  if (view === null) return "WORKING";
  if (view.state === "WAITING" || view.state === "RUNNING") return view.pausedUntil === undefined ? "WORKING" : "QUIET";
  if (view.state === "FAILED") return "QUIET";
  const own = view.rewrite ?? null;
  if (own === null) return "QUIET";
  if (own.state === "WRITING") return "CLIMBING";
  if (!isFinishedRewrite(own) || !own.changed) return "QUIET";
  const since = Date.parse(own.rewritten_at);
  const stillWatched = Number.isNaN(since) || now - since <= CLIMB_WATCH_MS;
  for (const runId of climbAnswersNeeded(dig)) {
    const row = climbRowOf(answerOf(runId), dig.link.childRunId);
    if (row === null) return stillWatched ? "CLIMBING" : "QUIET";
    if (row.state === "WRITING") return "CLIMBING";
    if (!isFinishedRewrite(row) || !row.changed) return "QUIET";
  }
  // The change reached the map's own paths; the main answer that follows is the page's own wait (mainAnswerWriting).
  return "QUIET";
}

/** True while a dig below may still change this map: the page then reads its own answer again every 15 s. */
export function belowBusy(states: Iterable<BelowState>): boolean {
  for (const state of states) if (state !== "QUIET") return true;
  return false;
}

/**
 * A dig below that needs no more reads: it failed, or it is done and its change stopped (or reached the map). A dig held at
 * the month wall, or one climbing, is read again (it may still move on).
 */
export function belowSettled(view: DigView | null, state: BelowState): boolean {
  if (view === null || state !== "QUIET") return false;
  return view.state === "FAILED" || view.state === "DONE";
}
