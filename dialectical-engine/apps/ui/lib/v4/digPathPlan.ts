import type { Answer, StartPaths } from "@debateai/contract";
import { joinedPathWords } from "@debateai/kernel";
import {
  cutText, PATH_PLAN_LIMITS, pathPlanFromPicks, pathPlanToStartPaths, type PathPlan, type PlanPath, type PlanViewpoint
} from "./pathPlan.js";
import { isEdited } from "./suggestions.js";
import type { V4DigPick } from "./types.js";

/*
 * V4 start step, Task 79 (spec 2026-11-03 §4.4; dig-f35 "Do not build it twice", r2-1, choose-d3; owner answers Q18 A and Q19 A):
 * a dig's picks as paths. On a path debate (a parent whose answer has branches) each pick that is not an open question becomes
 * its own path, in pick order, on the start step's own plan (pathPlan.ts: the same rows, the same Combine, Split apart, Rewrite,
 * Move and Undo). Open questions stay places in the dig's question and are never paths. Plain words:
 *  - A pick's number is its place among the picks the ask sends (suggestions.ts sends every pick but the open questions, in
 *    order), so `pick_no` names the same pick on the page and on the server. A chip is known by its pick's key, so a pick added
 *    or taken away keeps the rows already shaped (digPathPlanWithPicks): a new pick comes last, a pick gone leaves its path (a
 *    combined path keeps the rest by the start step's words rule), and later picks are numbered again.
 *  - A pick's words are what the ask sends (its text, trimmed; a "+ N more" item's question), with no title: the server knows a
 *    pick by its text alone (Task 33), so the combine call and the server read the same members. The person's own view, and
 *    their wording of a suggestion, are theirs (never marked as the AIs' words).
 *  - A dig looks into at most How wide's widest, 7 paths (Free 3). One more pick is refused PATHS_FULL before it is added; a
 *    plan that holds more anyway (picks brought back by another way) sends its first 7 (digStartPaths).
 *  - Two picks overlap when they rest on one point of the map (Task 79a's pickPointsOf; code, no AI call, nothing counted).
 * Pure functions: nothing here fetches, stores or keeps anything.
 */

/** The most paths a dig may send: Free 3, else How wide's widest, 7. */
export function digPathsMax(freePlan: boolean): number {
  return freePlan ? PATH_PLAN_LIMITS.freePathsMax : PATH_PLAN_LIMITS.pathsMax;
}

/** A parent whose dig is argued as paths: a path debate's answer (it has branches); an R22 answer sends today's dig. */
export function isPathsParent(answer: Answer): boolean {
  return answer.branches !== undefined;
}

/** A pick's words as the ask sends them (suggestions.ts digPickOf): its text trimmed; a "+ N more" item's question. */
export function digPickText(pick: V4DigPick): string {
  switch (pick.kind) {
    case "OPEN": return pick.question.text.trim();
    case "MORE": return pick.more.question.trim();
    default: return pick.text.trim();
  }
}

/** The picks a dig sends as picks (every one but the open questions), in pick order: each one a path. */
const pathPicksOf = (picks: readonly V4DigPick[]): readonly V4DigPick[] => picks.filter((pick) => pick.kind !== "OPEN");
/** The person's own words: their own view, or their wording of a suggestion. */
const isOwnPick = (pick: V4DigPick): boolean => pick.kind === "OWN_VIEW" || isEdited(pick);

function pickViewpoint(pick: V4DigPick, pickNo: number): PlanViewpoint {
  return { key: pick.key, source: { kind: "PICK", pickNo }, title: null, question: digPickText(pick), angleId: null };
}

const titleOf = (viewpoint: PlanViewpoint): string => viewpoint.title ?? cutText(viewpoint.question, PATH_PLAN_LIMITS.titleMaxChars);
const questionOf = (viewpoint: PlanViewpoint): string => cutText(viewpoint.question, PATH_PLAN_LIMITS.questionMaxChars);
/** A path that shows exactly its one pick's words (not rewritten by the person). */
const inPickWords = (path: PlanPath, viewpoint: PlanViewpoint): boolean => path.title === titleOf(viewpoint) && path.question === questionOf(viewpoint);

/** One pick as its own path, in its own words: the person's own view (or their wording) is theirs, an AI suggestion the AIs'. */
function pickPath(key: string, viewpoint: PlanViewpoint, pick: V4DigPick): PlanPath {
  return {
    key, title: titleOf(viewpoint), question: questionOf(viewpoint), viewpoints: [viewpoint], wording: isOwnPick(pick) ? "PERSON" : "AI",
    combineRef: null, menuPathRef: null, isNew: false, tag: pick.kind === "OWN_VIEW" ? "ADDED_BY_YOU" : null, askReword: false
  };
}

type NowPick = Readonly<{ pick: V4DigPick; pickNo: number }>;

/**
 * One path after the picks changed: each chip follows its pick (its number and its words) and goes with it. Same object when
 * nothing changed. Only renumbered: the words stay (a combined path keeps its words and reference). A pick's words changed or a
 * pick gone: a path in its one pick's words follows that pick; one the person rewrote keeps their words and asks "Rewrite it for
 * me / Keep my wording"; any other speaks in its one pick's words, or is joined to be written again (a path still being written
 * takes a new key, so the answer for its old picks cannot land on it). No chip left: the path goes (null). `held`: chips an
 * earlier path already holds.
 */
function followed(path: PlanPath, now: ReadonlyMap<string, NowPick>, held: ReadonlySet<string>, fresh: () => string): PlanPath | null {
  let gone = false;
  let reworded = false;
  let renumbered = false;
  const kept: PlanViewpoint[] = [];
  for (const viewpoint of path.viewpoints) {
    const found = viewpoint.source.kind === "PICK" && !held.has(viewpoint.key) ? now.get(viewpoint.key) : undefined;
    if (found === undefined) {
      gone = true;
      continue;
    }
    const question = digPickText(found.pick);
    const sameNo = viewpoint.source.kind === "PICK" && viewpoint.source.pickNo === found.pickNo;
    if (question !== viewpoint.question) reworded = true;
    if (!sameNo) renumbered = true;
    kept.push(question === viewpoint.question && sameNo ? viewpoint : { ...viewpoint, source: { kind: "PICK", pickNo: found.pickNo }, question });
  }
  if (kept.length === 0) return null;
  const only = kept.length === 1 ? kept[0]! : null;
  const pickOf = (viewpoint: PlanViewpoint): V4DigPick => now.get(viewpoint.key)!.pick;
  if (!gone && !reworded) {
    const same = renumbered ? { ...path, viewpoints: kept } : path;
    if (only === null || !inPickWords(same, only)) return same;
    // One pick in its own words: who wrote them follows the pick (a split, say, gives a pick back as the AIs' words).
    const own = pickPath(same.key, only, pickOf(only));
    return own.wording === same.wording && own.tag === same.tag ? same : { ...same, wording: own.wording, tag: own.tag };
  }
  const was = path.viewpoints.length === 1 ? path.viewpoints[0]! : null;
  const key = path.wording === "WRITING" ? fresh() : path.key;
  if (path.wording === "PERSON" && (was === null || !inPickWords(path, was))) {
    return { ...path, key, viewpoints: kept, combineRef: null, askReword: true };
  }
  if (only !== null) return pickPath(key, only, pickOf(only));
  return {
    ...path, key, viewpoints: kept,
    ...joinedPathWords(kept.map((viewpoint) => ({ title: titleOf(viewpoint), question: viewpoint.question }))),
    wording: "WRITING", tag: "COMBINED_BY_YOU", combineRef: null, askReword: false
  };
}

/**
 * The plan after the draft's picks changed, keeping the rows already shaped: each path follows its picks (see `followed`), a pick
 * on no path yet comes last as its own path, and the selection keeps only what is still on the list. Nothing waits in "+ N more"
 * on a dig. The Undo steps are kept as they are (what a step brings back follows the picks the same way). The same object when
 * nothing changed.
 */
export function digPathPlanWithPicks(plan: PathPlan, picks: readonly V4DigPick[]): PathPlan {
  const now = new Map(pathPicksOf(picks).map((pick, at) => [pick.key, { pick, pickNo: at + 1 }] as const));
  let nextKey = plan.nextKey;
  const fresh = (): string => `p${String(nextKey++)}`;
  const held = new Set<string>();
  let changed = plan.more.length > 0;
  const paths: PlanPath[] = [];
  for (const path of plan.paths) {
    const next = followed(path, now, held, fresh);
    if (next !== path) changed = true;
    if (next === null) continue;
    for (const viewpoint of next.viewpoints) held.add(viewpoint.key);
    paths.push(next);
  }
  for (const [key, { pick, pickNo }] of now) {
    if (held.has(key)) continue;
    paths.push(pickPath(fresh(), pickViewpoint(pick, pickNo), pick));
    changed = true;
  }
  const onList = new Set(paths.flatMap((path) => [path.key, ...path.viewpoints.map((viewpoint) => viewpoint.key)]));
  const selected = plan.selected.filter((key) => onList.has(key));
  if (!changed && selected.length === plan.selected.length) return plan;
  return { ...plan, paths, more: [], selected, nextKey };
}

/** The plan of a dig's picks: pathPlanFromPicks over the picks that are not open questions, in pick order (past the most a dig may send, they still come, last). */
export function digPathPlanOf(picks: readonly V4DigPick[], freePlan: boolean): PathPlan {
  const first = pathPicksOf(picks).slice(0, digPathsMax(freePlan));
  const base = pathPlanFromPicks(first.map((pick, at) => ({ pickNo: at + 1, title: null, question: digPickText(pick), own: isOwnPick(pick) })), freePlan);
  const plan: PathPlan = { ...base, paths: base.paths.map((path, at) => pickPath(path.key, pickViewpoint(first[at]!, at + 1), first[at]!)) };
  return digPathPlanWithPicks(plan, picks);
}

/** PATHS_FULL when one more pick would give the dig more paths than it may send (Free 3, else 7); else null. */
export function digNewPickRefusal(plan: PathPlan | null): "PATHS_FULL" | null {
  return plan !== null && plan.paths.length >= digPathsMax(plan.freePlan) ? "PATHS_FULL" : null;
}

/** What a dig sends as its paths: DIG_PICKS, each path's words and pick numbers in the person's order, never more than it may send. */
export function digStartPaths(plan: PathPlan): StartPaths {
  const paths = pathPlanToStartPaths(plan).slice(0, digPathsMax(plan.freePlan));
  return { source: "DIG_PICKS", paths: [...paths], width: paths.length, chosen_by: "PERSON" };
}

/** One key for a pair of picks, whatever their order (the pairs the person kept apart). */
export function digPairKey(a: string, b: string): string {
  return a < b ? `${a}\n${b}` : `${b}\n${a}`;
}

/**
 * Owner answer Q18 A: the pairs of picks that rest on one point of the map (`pointsOf`, Task 79a's pickPointsOf), in pick order,
 * leaving out the pairs kept apart (digPairKey) and the open questions (they are places, never paths). No AI call.
 */
export function digOverlaps(
  picks: readonly V4DigPick[], pointsOf: (pick: V4DigPick) => readonly string[], keptApart: ReadonlySet<string>
): readonly Readonly<{ a: string; b: string }>[] {
  const pathPicks = pathPicksOf(picks);
  const points = pathPicks.map((pick) => new Set(pointsOf(pick)));
  const pairs: Readonly<{ a: string; b: string }>[] = [];
  pathPicks.forEach((first, at) => {
    for (let other = at + 1; other < pathPicks.length; other += 1) {
      const second = pathPicks[other]!;
      if (keptApart.has(digPairKey(first.key, second.key))) continue;
      if ([...points[other]!].some((point) => points[at]!.has(point))) pairs.push({ a: first.key, b: second.key });
    }
  });
  return pairs;
}
