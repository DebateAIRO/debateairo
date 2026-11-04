import {
  START_STEP_LIMITS,
  type StartAngle,
  type StartCard,
  type StartCombineMember,
  type StartMenu,
  type StartMenuPath,
  type StartMenuViewpoint,
  type StartPathChoice,
  type StartPathMember,
  type StartSuggestion
} from "@debateai/contract";

/*
 * V4 start step, Task 64 (spec 2026-11-03 §2 items 3, 5 and 6; row D section 5): the path plan, the list of paths the
 * person shapes on step 2 before Start, and what Start sends from it. A plan comes from the merged menu (the first How
 * wide paths in, the rest under "+ N more", most useful first) or from a dig's picks (one path per pick). Every change
 * goes through pathPlanReduce and answers a new plan, or the same object when nothing changes; each change except the
 * selection is one Undo step. Owner rules this file holds, so no page can break them:
 *  - choose-f22: a menu with fewer paths than How wide gives them all, "+ N more" stays empty and the asked width stays
 *    (the page counts the real paths);
 *  - choose-f8: widening adds the next ideas from "+ N more", each marked "Added when you widened"; narrowing folds those
 *    back first, then from the bottom, and never folds a path the person made or changed (when only theirs are over,
 *    nothing changes);
 *  - choose-d5: How wide alone is not a change, so "Just answer it" can hide after the first change and come back when
 *    every change is undone (pathPlanChanged);
 *  - Free: at most 3 paths, whatever How wide says.
 * Task 65 (spec §2 item 5): Combine (the picked paths and chips become one new path, in the place of the first, joined
 * until an AI writes one question for them), Split apart, a chip's ⋯ (into a path, its own path, Remove), Rewrite and
 * "Rewrite it for me / Keep my wording". The words rule whenever a path's viewpoints change: the person's words stay and
 * the page asks; one viewpoint left speaks in its own words (the person's, for their own point of view); two to four are
 * joined and written again; none, and the path goes. A change that adds paths to a full list folds the bottom path the
 * AI wrote and no one changed into "+ N more", or is refused (PATHS_FULL). The AI's combined words are no Undo step.
 * Task 66 (spec §2 items 3-5; choose-f4, chat-start-waits-for-paths): the person's own path, "+ Look into this" from
 * "+ N more", the "Another way to see it" cards and "Make this my question", the one-tap suggestions (at most two shown,
 * only those that still apply), late merges and the drawer's "Other directions" and "All, by area". A new path on a full
 * list is never a dead end: it is refused (PATHS_FULL; the page offers a path where it fits, a swap or a wider list), and
 * a swap sends the swapped path to the front of more. Ideas a late merge adds go only to the end of more, marked new:
 * they never replace a path or a suggestion on screen, and Undo never takes them away.
 * Keys: a menu path's is its path_ref, a menu viewpoint's its viewpoint id (a card's, its card id), a dig pick's k<pick
 * number>, the person's own words o<n>, a new path p<n> (nextKey counts on and is never put back by Undo). Path keys and
 * chip keys never meet, so one key names one thing. A path still being written whose viewpoints change, or that the
 * person rewrites, takes a new key, so the answer for its old viewpoints can never land on it. Pure functions: nothing
 * here fetches, stores or keeps anything.
 */

/** The start step's limits the plan holds (START_STEP_LIMITS; a chosen path's title and question are the wire's). */
export const PATH_PLAN_LIMITS = Object.freeze({
  viewpointsPerPathMax: START_STEP_LIMITS.viewpointsPerPathMax,
  pathsMax: START_STEP_LIMITS.pathsMax,
  freePathsMax: START_STEP_LIMITS.freePathsMax,
  ownTextMaxChars: START_STEP_LIMITS.ownTextMaxChars,
  titleMaxChars: START_STEP_LIMITS.pathTitleMaxChars,
  questionMaxChars: START_STEP_LIMITS.pathQuestionMaxChars
});

/** A dig pick's number: 1..16, as the contract's pick_no members allow. */
const PICK_NO_MAX = 16;
/** Suggestions shown at a time (spec §2 item 5: "At most two at a time"). */
const SUGGESTIONS_SHOWN_MAX = 2;
const ELLIPSIS = "…";

/** Where a viewpoint (a chip on a path) came from: the menu (or one of its cards), a dig's pick, or the person's own words. */
export type PlanViewpointSource = { kind: "MENU"; viewpointId: string } | { kind: "PICK"; pickNo: number } | { kind: "OWN" };
export type PlanViewpoint = Readonly<{ key: string; source: PlanViewpointSource; title: string | null; question: string; angleId: string | null }>;
export type PlanPath = Readonly<{
  key: string;
  title: string;
  question: string;
  viewpoints: readonly PlanViewpoint[];
  /** Who wrote the words: the menu's AI, the AI combine, the person, a combine still being written, or the joined fallback. */
  wording: "AI" | "COMBINED" | "PERSON" | "WRITING" | "FALLBACK";
  combineRef: string | null;
  menuPathRef: string | null;
  isNew: boolean;
  tag: "PUT_TOGETHER_BY_US" | "COMBINED_BY_YOU" | "ADDED_BY_YOU" | "ADDED_WHEN_WIDENED" | null;
  /** The person's words stay while the viewpoints changed: the page asks "Rewrite it for me / Keep my wording". */
  askReword: boolean;
}>;
export type PathPlanQuestionSwap = Readonly<{ cardId: string; question: string; original: string }>;
/** One Undo step: what the plan was before the change. "WIDTH" when How wide made it, "CHANGE" for everything else. */
export type PathPlanSnapshot = Readonly<{
  paths: readonly PlanPath[];
  more: readonly PlanPath[];
  width: number;
  done: readonly string[];
  questionSwap: PathPlanQuestionSwap | null;
  kind: "WIDTH" | "CHANGE";
}>;
export type PathPlan = Readonly<{
  paths: readonly PlanPath[];
  more: readonly PlanPath[];
  /** Path keys and chip keys picked to combine (never an Undo step). */
  selected: readonly string[];
  width: number;
  freePlan: boolean;
  undo: readonly PathPlanSnapshot[];
  cards: readonly StartCard[];
  suggestions: readonly StartSuggestion[];
  /** Suggestions applied or dismissed. */
  done: readonly string[];
  questionSwap: PathPlanQuestionSwap | null;
  /** Every menu path the plan has seen, so a later revision adds only its new ones. */
  seenPathRefs: readonly string[];
  nextKey: number;
}>;
/** MOVE_SELECTED stays in the model; no row sends it (Task 72). MOVE_CHIP's toPathKey is a path key, or "NEW". */
export type PathPlanAction =
  | { type: "SELECT" | "UNSELECT"; key: string }
  | { type: "CLEAR_SELECTION" }
  | { type: "COMBINE_SELECTED" }
  | { type: "COMBINE_WRITTEN"; key: string; title: string; question: string; combineRef: string }
  | { type: "COMBINE_FAILED"; key: string }
  | { type: "SPLIT"; key: string }
  | { type: "MOVE"; key: string; to: number }
  | { type: "MOVE_CHIP"; chipKey: string; toPathKey: string }
  | { type: "MOVE_SELECTED"; toPathKey: string }
  | { type: "REMOVE"; key: string }
  | { type: "REWRITE"; key: string; title?: string; question: string }
  | { type: "KEEP_WORDING"; key: string }
  | { type: "REWORD"; key: string }
  | { type: "ADD_OWN"; text: string; intoPathKey: string | null; swapWithKey?: string }
  | { type: "ADD_FROM_MORE"; key: string; intoPathKey: string | null; swapWithKey?: string }
  | { type: "USE_CARD"; cardId: string; intoPathKey: string | null; swapWithKey?: string }
  | { type: "MAKE_MY_QUESTION"; cardId: string; originalQuestion: string }
  | { type: "APPLY_SUGGESTION" | "DISMISS_SUGGESTION"; suggestionId: string }
  | { type: "SET_WIDTH"; width: number }
  | { type: "UNDO" };
export type PathPlanRefusal = "VIEWPOINTS_FULL" | "PATHS_FULL" | "EMPTY" | "TOO_LONG" | "LAST_PATH";
/** The plan after an action; `folded`: path keys folded into "+ N more", bottom first; `added`: path keys widening added. */
export type PathPlanResult = Readonly<{ plan: PathPlan; refusal: PathPlanRefusal | null; folded: readonly string[]; added: readonly string[] }>;

/** A width How wide can hold: a whole number of paths from 1 to 7; anything else is TypeError("PATH_PLAN_WIDTH_INVALID"). */
function checkedWidth(width: number): number {
  if (!Number.isSafeInteger(width) || width < 1 || width > PATH_PLAN_LIMITS.pathsMax) throw new TypeError("PATH_PLAN_WIDTH_INVALID");
  return width;
}

/** Free's width is at most 3 whatever it is asked for. */
function cappedWidth(width: number, freePlan: boolean): number {
  return freePlan ? Math.min(width, PATH_PLAN_LIMITS.freePathsMax) : width;
}

function menuViewpoint(viewpoint: StartMenuViewpoint): PlanViewpoint {
  return {
    key: viewpoint.viewpoint_id, source: { kind: "MENU", viewpointId: viewpoint.viewpoint_id }, title: viewpoint.title,
    question: viewpoint.question, angleId: viewpoint.angle_id
  };
}

function menuPath(path: StartMenuPath, viewpoints: ReadonlyMap<string, StartMenuViewpoint>): PlanPath {
  return {
    key: path.path_ref,
    title: path.title,
    question: path.question,
    viewpoints: path.viewpoint_ids.map((id) => {
      const viewpoint = viewpoints.get(id);
      if (viewpoint === undefined) throw new TypeError("PATH_PLAN_MENU_INVALID");
      return menuViewpoint(viewpoint);
    }),
    wording: "AI",
    combineRef: null,
    menuPathRef: path.path_ref,
    isNew: path.is_new,
    tag: path.put_together ? "PUT_TOGETHER_BY_US" : null,
    askReword: false
  };
}

/** The plan of a merged menu: its first `width` paths in (Free: at most 3), the rest under "+ N more" in the menu's order. */
export function pathPlanFromMenu(menu: StartMenu, width: number, freePlan: boolean): PathPlan {
  const asked = cappedWidth(checkedWidth(width), freePlan);
  const viewpoints = new Map(menu.viewpoints.map((viewpoint) => [viewpoint.viewpoint_id, viewpoint] as const));
  const all = menu.paths.map((path) => menuPath(path, viewpoints));
  return {
    paths: all.slice(0, asked),
    more: all.slice(asked),
    selected: [],
    width: asked,
    freePlan,
    undo: [],
    cards: menu.cards,
    suggestions: menu.suggestions,
    done: [],
    questionSwap: null,
    seenPathRefs: menu.paths.map((path) => path.path_ref),
    nextKey: 1
  };
}

/**
 * A late merge's menu (a later revision): its paths the plan has not seen go to the end of more, marked new, never onto
 * the list; its suggestions the plan does not hold are added after the others. Every Undo step's more gets the same new
 * paths, so undoing a change never takes a late idea away. The same object when nothing is new.
 */
export function pathPlanWithRevision(plan: PathPlan, menu: StartMenu): PathPlan {
  const seen = new Set(plan.seenPathRefs);
  const viewpoints = new Map(menu.viewpoints.map((viewpoint) => [viewpoint.viewpoint_id, viewpoint] as const));
  const fresh = menu.paths.filter((path) => !seen.has(path.path_ref)).map((path): PlanPath => ({ ...menuPath(path, viewpoints), isNew: true }));
  const held = new Set(plan.suggestions.map((suggestion) => suggestion.suggestion_id));
  const suggestions = menu.suggestions.filter((suggestion) => !held.has(suggestion.suggestion_id));
  if (fresh.length === 0 && suggestions.length === 0) return plan;
  const withFresh = (more: readonly PlanPath[]): readonly PlanPath[] => fresh.length === 0 ? more : [...more, ...fresh];
  return {
    ...plan,
    more: withFresh(plan.more),
    suggestions: suggestions.length === 0 ? plan.suggestions : [...plan.suggestions, ...suggestions],
    seenPathRefs: fresh.length === 0 ? plan.seenPathRefs : [...plan.seenPathRefs, ...fresh.map((path) => path.key)],
    undo: fresh.length === 0 ? plan.undo : plan.undo.map((step) => ({ ...step, more: withFresh(step.more) }))
  };
}

/**
 * The plan of a dig's picks: one path per pick, in pick order, with nothing under "+ N more". Its width is the most paths
 * a dig may send (Free 3, else 7). The person's own pick keeps their words, marked added by them. Picks the plan cannot
 * hold (more than that width, a repeated or out-of-range number) are TypeError("PATH_PLAN_PICKS_INVALID").
 */
export function pathPlanFromPicks(
  picks: readonly Readonly<{ pickNo: number; title: string | null; question: string; own: boolean }>[],
  freePlan: boolean
): PathPlan {
  const width = freePlan ? PATH_PLAN_LIMITS.freePathsMax : PATH_PLAN_LIMITS.pathsMax;
  const numbers = picks.map((pick) => pick.pickNo);
  if (picks.length > width || new Set(numbers).size !== numbers.length
    || numbers.some((no) => !Number.isSafeInteger(no) || no < 1 || no > PICK_NO_MAX)) {
    throw new TypeError("PATH_PLAN_PICKS_INVALID");
  }
  const paths = picks.map((pick, index): PlanPath => ({
    key: `p${index + 1}`,
    title: pick.title ?? cutText(pick.question, PATH_PLAN_LIMITS.titleMaxChars),
    question: pick.question,
    viewpoints: [{ key: `k${pick.pickNo}`, source: { kind: "PICK", pickNo: pick.pickNo }, title: pick.title, question: pick.question, angleId: null }],
    wording: pick.own ? "PERSON" : "AI",
    combineRef: null,
    menuPathRef: null,
    isNew: false,
    tag: pick.own ? "ADDED_BY_YOU" : null,
    askReword: false
  }));
  return {
    paths, more: [], selected: [], width, freePlan, undo: [], cards: [], suggestions: [], done: [], questionSwap: null, seenPathRefs: [],
    nextKey: picks.length + 1
  };
}

/** A path the person made or changed: their words, their own viewpoint, or a path they combined or added. Never folded. */
export function isPersonPath(path: PlanPath): boolean {
  return path.wording === "PERSON" || path.tag === "ADDED_BY_YOU" || path.tag === "COMBINED_BY_YOU"
    || path.viewpoints.some((viewpoint) => viewpoint.source.kind === "OWN");
}

/** Whether the person changed the list: an Undo step of kind CHANGE is on the stack (How wide alone is not a change). */
export function pathPlanChanged(plan: PathPlan): boolean {
  return plan.undo.some((step) => step.kind === "CHANGE");
}

function memberOf(viewpoint: PlanViewpoint): StartPathMember {
  switch (viewpoint.source.kind) {
    case "MENU": return { viewpoint_id: viewpoint.source.viewpointId };
    case "PICK": return { pick_no: viewpoint.source.pickNo };
    case "OWN": return { own_text: viewpoint.question };
  }
}

/** What Start sends: each path's words and members, in the person's order, with its combine reference when it has one. */
export function pathPlanToStartPaths(plan: PathPlan): readonly StartPathChoice[] {
  return plan.paths.map((path) => {
    const choice: StartPathChoice = { title: path.title, question: path.question, members: path.viewpoints.map(memberOf) };
    return path.combineRef === null ? choice : { ...choice, combine_ref: path.combineRef };
  });
}

/**
 * A path's viewpoints as the combine call reads them, and as the server reads the same members at Start (Task 33): the
 * combine reference binds their hash. A dig's pick goes without its title: the server knows a pick by its text alone.
 */
export function pathPlanCombineMembers(path: PlanPath): readonly StartCombineMember[] {
  return path.viewpoints.map((viewpoint) => ({
    viewpoint_id: viewpoint.source.kind === "MENU" ? viewpoint.source.viewpointId : null,
    pick_no: viewpoint.source.kind === "PICK" ? viewpoint.source.pickNo : null,
    title: viewpoint.source.kind === "PICK" ? null : viewpoint.title,
    question: viewpoint.question
  }));
}

const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/**
 * One key for a set of combine members whatever their order: sorted as the API's startMembersHash sorts them (viewpoint id,
 * pick number, question) and written as its canonical JSON (keys sorted, no spaces), so the page's cache of written
 * combines and the server's signed combine reference agree on what "the same members" means.
 */
export function combineMembersKey(members: readonly StartCombineMember[]): string {
  const sorted = [...members].sort((a, b) => compareText(a.viewpoint_id ?? "", b.viewpoint_id ?? "")
    || (a.pick_no ?? 0) - (b.pick_no ?? 0) || compareText(a.question, b.question));
  return JSON.stringify(sorted.map((member) => ({
    pick_no: member.pick_no, question: member.question, title: member.title, viewpoint_id: member.viewpoint_id
  })));
}

/** `text` when it fits in `max` UTF-16 code units; else whole code points (never half an emoji) and "…", at most `max` in all. */
export function cutText(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max < ELLIPSIS.length) return "";
  let kept = "";
  for (const point of text) {
    if (kept.length + point.length + ELLIPSIS.length > max) break;
    kept += point;
  }
  return `${kept}${ELLIPSIS}`;
}

const unchanged = (plan: PathPlan): PathPlanResult => ({ plan, refusal: null, folded: [], added: [] });
const refused = (plan: PathPlan, refusal: PathPlanRefusal): PathPlanResult => ({ plan, refusal, folded: [], added: [] });

/** The plan with `next` applied and the plan as it was pushed as one Undo step. */
function stepped(plan: PathPlan, kind: PathPlanSnapshot["kind"], next: Partial<PathPlan>): PathPlan {
  const snapshot: PathPlanSnapshot = { paths: plan.paths, more: plan.more, width: plan.width, done: plan.done, questionSwap: plan.questionSwap, kind };
  return { ...plan, ...next, undo: [...plan.undo, snapshot] };
}

/** The selected keys still on the list (a path key, or a chip key of a path on it). */
function selectedIn(selected: readonly string[], paths: readonly PlanPath[]): readonly string[] {
  const onList = new Set(paths.flatMap((path) => [path.key, ...path.viewpoints.map((viewpoint) => viewpoint.key)]));
  return selected.every((key) => onList.has(key)) ? selected : selected.filter((key) => onList.has(key));
}

const isChip = (paths: readonly PlanPath[], key: string): boolean =>
  paths.some((path) => path.viewpoints.some((viewpoint) => viewpoint.key === key));

/** A path going into "+ N more": "Added when you widened" no longer says anything there (a path put together by us is that again). */
function intoMore(path: PlanPath): PlanPath {
  if (path.tag !== "ADDED_WHEN_WIDENED") return path;
  return { ...path, tag: path.wording === "AI" && path.viewpoints.length > 1 ? "PUT_TOGETHER_BY_US" : null };
}

/** A path widening brings in is marked "Added when you widened"; one the person made or changed keeps its own mark. */
function widened(path: PlanPath): PlanPath {
  return isPersonPath(path) ? path : { ...path, tag: "ADDED_WHEN_WIDENED" };
}

function select(plan: PathPlan, key: string): PathPlanResult {
  const onList = plan.paths.some((path) => path.key === key) || isChip(plan.paths, key);
  if (!onList || plan.selected.includes(key)) return unchanged(plan);
  return unchanged({ ...plan, selected: [...plan.selected, key] });
}

function unselect(plan: PathPlan, key: string): PathPlanResult {
  if (!plan.selected.includes(key)) return unchanged(plan);
  return unchanged({ ...plan, selected: plan.selected.filter((one) => one !== key) });
}

/** Remove a path: the last one stays (LAST_PATH); one made only of the person's own words goes, any other to the front of more. */
function remove(plan: PathPlan, key: string): PathPlanResult {
  const index = plan.paths.findIndex((path) => path.key === key);
  if (index < 0) return isChip(plan.paths, key) ? removeChip(plan, key) : unchanged(plan);
  if (plan.paths.length === 1) return refused(plan, "LAST_PATH");
  const path = plan.paths[index]!;
  const paths = plan.paths.filter((_, at) => at !== index);
  const ownOnly = path.viewpoints.every((viewpoint) => viewpoint.source.kind === "OWN");
  return unchanged(stepped(plan, "CHANGE", {
    paths, more: ownOnly ? plan.more : [intoMore(path), ...plan.more], selected: selectedIn(plan.selected, paths)
  }));
}

/** Move a path to place `to` on the list (0 = the top; past the end = the bottom). */
function move(plan: PathPlan, key: string, to: number): PathPlanResult {
  const from = plan.paths.findIndex((path) => path.key === key);
  if (from < 0 || !Number.isSafeInteger(to)) return unchanged(plan);
  const place = Math.min(Math.max(to, 0), plan.paths.length - 1);
  if (place === from) return unchanged(plan);
  const paths = plan.paths.filter((_, at) => at !== from);
  paths.splice(place, 0, plan.paths[from]!);
  return unchanged(stepped(plan, "CHANGE", { paths }));
}

/**
 * How wide. Widening moves paths from the front of more to the end of the list until the list is that wide or more is
 * empty. Narrowing folds paths the person did not make or change into the front of more (in list order): first those
 * widening added, wherever they now are (spec §2 item 5: "Narrowing folds those back first"), then the others, each
 * from the bottom; when that cannot bring the list down to the width, nothing changes (PATHS_FULL).
 */
function setWidth(plan: PathPlan, width: number): PathPlanResult {
  const target = cappedWidth(checkedWidth(width), plan.freePlan);
  if (target === plan.width) return unchanged(plan);
  if (target > plan.width) {
    const coming = plan.more.slice(0, Math.max(0, target - plan.paths.length)).map(widened);
    const next = stepped(plan, "WIDTH", { width: target, paths: [...plan.paths, ...coming], more: plan.more.slice(coming.length) });
    return { plan: next, refusal: null, folded: [], added: coming.map((path) => path.key) };
  }
  const over = plan.paths.length - target;
  const bottomFirst = plan.paths.map((_, at) => plan.paths.length - 1 - at).filter((at) => !isPersonPath(plan.paths[at]!));
  const isWidened = (at: number): boolean => plan.paths[at]!.tag === "ADDED_WHEN_WIDENED";
  const folding = [...bottomFirst.filter(isWidened), ...bottomFirst.filter((at) => !isWidened(at))].slice(0, Math.max(0, over));
  if (folding.length < over) return refused(plan, "PATHS_FULL");
  const paths = plan.paths.filter((_, at) => !folding.includes(at));
  const leaving = plan.paths.filter((_, at) => folding.includes(at)).map(intoMore);
  const next = stepped(plan, "WIDTH", { width: target, paths, more: [...leaving, ...plan.more], selected: selectedIn(plan.selected, paths) });
  return { plan: next, refusal: null, folded: folding.map((at) => plan.paths[at]!.key), added: [] };
}

/** Undo the last step: the list, more, How wide, the suggestions done and the question swap as they were; nextKey goes on. */
function undo(plan: PathPlan): PathPlanResult {
  const last = plan.undo.at(-1);
  if (last === undefined) return unchanged(plan);
  return unchanged({
    ...plan, paths: last.paths, more: last.more, width: last.width, done: last.done, questionSwap: last.questionSwap,
    undo: plan.undo.slice(0, -1), selected: selectedIn(plan.selected, last.paths)
  });
}

/** New keys counted on from the plan's nextKey: a path's p<n>, the person's own words' o<n>. */
type KeyCounter = { next(): string; own(): string; readonly value: number };
function keyCounter(start: number): KeyCounter {
  let value = start;
  return { next: () => `p${value++}`, own: () => `o${value++}`, get value() { return value; } };
}

/** A viewpoint's title, or the start of its question when it has none (the person's own words, a pick without one). */
const viewpointTitle = (viewpoint: PlanViewpoint): string => viewpoint.title ?? cutText(viewpoint.question, PATH_PLAN_LIMITS.titleMaxChars);

/** A path this plan makes (a combine, a split, a chip on its own): no menu path behind it, words still to be set. */
function madePath(key: string): PlanPath {
  return { key, title: "", question: "", viewpoints: [], wording: "AI", combineRef: null, menuPathRef: null, isNew: false, tag: null, askReword: false };
}

/** One viewpoint in its own words: the AI's for a menu point or a pick, untagged; the person's own words stay theirs. */
function inOwnWords(path: PlanPath, viewpoint: PlanViewpoint): PlanPath {
  const own = viewpoint.source.kind === "OWN";
  return {
    ...path, viewpoints: [viewpoint], title: viewpointTitle(viewpoint), question: cutText(viewpoint.question, PATH_PLAN_LIMITS.questionMaxChars),
    wording: own ? "PERSON" : "AI", tag: own ? "ADDED_BY_YOU" : null, combineRef: null, askReword: false
  };
}

/** Two to four viewpoints put together: an AI writes one question; until then their titles joined and their questions numbered. */
function joined(path: PlanPath, viewpoints: readonly PlanViewpoint[]): PlanPath {
  return {
    ...path, viewpoints,
    title: cutText(viewpoints.map(viewpointTitle).join(" · "), PATH_PLAN_LIMITS.titleMaxChars),
    question: cutText(viewpoints.map((viewpoint, at) => `${at + 1}. ${viewpoint.question}`).join("\n"), PATH_PLAN_LIMITS.questionMaxChars),
    wording: "WRITING", tag: "COMBINED_BY_YOU", combineRef: null, askReword: false
  };
}

/**
 * The words rule when a path's viewpoints change: the person's words stay and the page asks "Rewrite it for me / Keep my
 * wording"; one viewpoint left speaks in its own words; two to four are joined to be written again; none, and the path
 * goes (null). A path still being written takes a new key, so the answer for its old viewpoints cannot land on it.
 */
function regrouped(path: PlanPath, viewpoints: readonly PlanViewpoint[], keys: KeyCounter): PlanPath | null {
  if (viewpoints.length === 0) return null;
  const kept = path.wording === "WRITING" ? { ...path, key: keys.next() } : path;
  if (path.wording === "PERSON") return { ...kept, viewpoints, combineRef: null, askReword: true };
  return viewpoints.length === 1 ? inOwnWords(kept, viewpoints[0]!) : joined(kept, viewpoints);
}

/** What the picked keys take from the list, other than from `intoKey`'s path: whole picked paths, and picked chips of other paths. */
type Taken = Readonly<{
  viewpoints: readonly PlanViewpoint[];
  /** The viewpoints each path the selection takes from keeps, by path key. */
  left: ReadonlyMap<string, readonly PlanViewpoint[]>;
  /** How many things are put together: a whole path counts once, a chip once. */
  parts: number;
  /** The place on the list of the first path the selection takes from. */
  firstAt: number;
}>;
function taken(plan: PathPlan, intoKey: string | null): Taken {
  const picked = new Set(plan.selected);
  const viewpoints: PlanViewpoint[] = [];
  const left = new Map<string, readonly PlanViewpoint[]>();
  let parts = 0;
  let firstAt = -1;
  plan.paths.forEach((path, at) => {
    if (path.key === intoKey) return;
    const whole = picked.has(path.key);
    const chips = whole ? path.viewpoints : path.viewpoints.filter((viewpoint) => picked.has(viewpoint.key));
    if (chips.length === 0) return;
    if (firstAt < 0) firstAt = at;
    parts += whole ? 1 : chips.length;
    viewpoints.push(...chips);
    left.set(path.key, path.viewpoints.filter((viewpoint) => !chips.includes(viewpoint)));
  });
  return { viewpoints, left, parts, firstAt };
}

/** The list with each path in `left` keeping only those viewpoints (by the words rule; a path left empty goes). */
function withLeft(paths: readonly PlanPath[], left: ReadonlyMap<string, readonly PlanViewpoint[]>, keys: KeyCounter): PlanPath[] {
  return paths.flatMap((path) => {
    const rest = left.get(path.key);
    if (rest === undefined) return [path];
    const next = regrouped(path, rest, keys);
    return next === null ? [] : [next];
  });
}

/**
 * Room for a change that added paths: while the list is wider than How wide, fold from the bottom the first path the AI
 * wrote that is untagged or put together by us, other than those this change made or changed (`touched`), into the
 * front of more (in list order). null when no such path is left (PATHS_FULL).
 */
function foldedToWidth(
  paths: readonly PlanPath[], more: readonly PlanPath[], width: number, touched: ReadonlySet<string>
): Readonly<{ paths: readonly PlanPath[]; more: readonly PlanPath[]; folded: readonly string[] }> | null {
  const folding: number[] = [];
  for (let at = paths.length - 1; at >= 0 && paths.length - folding.length > width; at -= 1) {
    const path = paths[at]!;
    if (path.wording === "AI" && (path.tag === null || path.tag === "PUT_TOGETHER_BY_US") && !touched.has(path.key)) folding.push(at);
  }
  if (paths.length - folding.length > width) return null;
  return {
    paths: paths.filter((_, at) => !folding.includes(at)),
    more: [...paths.filter((_, at) => folding.includes(at)).map(intoMore), ...more],
    folded: folding.map((at) => paths[at]!.key)
  };
}

/**
 * A change that may add paths, as one Undo step, after folding to How wide; PATHS_FULL and the same plan when it cannot.
 * `also`: what else the change sets (Make this my question's swap).
 */
function grown(plan: PathPlan, paths: readonly PlanPath[], touched: ReadonlySet<string>, nextKey: number, also: Partial<PathPlan> = {}): PathPlanResult {
  const room = foldedToWidth(paths, plan.more, plan.width, touched);
  if (room === null) return refused(plan, "PATHS_FULL");
  const next = stepped(plan, "CHANGE", { ...also, paths: room.paths, more: room.more, nextKey, selected: selectedIn(plan.selected, room.paths) });
  return { plan: next, refusal: null, folded: room.folded, added: [] };
}

/**
 * Combine what is picked (two or more parts: paths, or chips of other paths) into one new path in the place of the first
 * path it takes from, joined until an AI writes it. More than four viewpoints → VIEWPOINTS_FULL; fewer than two parts,
 * nothing. The selection is cleared.
 */
function combineSelected(plan: PathPlan): PathPlanResult {
  const pick = taken(plan, null);
  if (pick.parts < 2) return unchanged(plan);
  if (pick.viewpoints.length > PATH_PLAN_LIMITS.viewpointsPerPathMax) return refused(plan, "VIEWPOINTS_FULL");
  const keys = keyCounter(plan.nextKey);
  const made = joined(madePath(keys.next()), pick.viewpoints);
  const above = withLeft(plan.paths.slice(0, pick.firstAt), pick.left, keys);
  const paths = [...above, made, ...withLeft(plan.paths.slice(pick.firstAt), pick.left, keys)];
  return unchanged(stepped(plan, "CHANGE", { paths, selected: [], nextKey: keys.value }));
}

/** How many paths combining what is picked would free (0 when it cannot be combined), for "Combining frees 1 path". */
export function pathPlanCombineFrees(plan: PathPlan): number {
  const result = combineSelected(plan);
  return result.plan === plan ? 0 : plan.paths.length - result.plan.paths.length;
}

/**
 * The AI's answer for a path still being written (on the list or in more): its words (COMBINED) or the joined words kept
 * (FALLBACK). Not an Undo step: Undo steps that hold the same path get the same answer, so undoing another change never
 * undoes it. Any other key (a path written, undone or regrouped since) changes nothing.
 */
function combineAnswered(plan: PathPlan, key: string, answered: (path: PlanPath) => PlanPath): PathPlanResult {
  const writing = (path: PlanPath): boolean => path.key === key && path.wording === "WRITING";
  if (!plan.paths.some(writing) && !plan.more.some(writing)) return unchanged(plan);
  const answer = (paths: readonly PlanPath[]): readonly PlanPath[] => paths.some(writing) ? paths.map((path) => writing(path) ? answered(path) : path) : paths;
  return unchanged({
    ...plan, paths: answer(plan.paths), more: answer(plan.more),
    undo: plan.undo.map((step) => step.paths.some(writing) || step.more.some(writing) ? { ...step, paths: answer(step.paths), more: answer(step.more) } : step)
  });
}

/** Split apart: each viewpoint of a path becomes its own path, in its own words, in the path's place (folding to How wide). */
function split(plan: PathPlan, key: string): PathPlanResult {
  const at = plan.paths.findIndex((path) => path.key === key);
  if (at < 0 || plan.paths[at]!.viewpoints.length < 2) return unchanged(plan);
  const keys = keyCounter(plan.nextKey);
  const pieces = plan.paths[at]!.viewpoints.map((viewpoint) => inOwnWords(madePath(keys.next()), viewpoint));
  const paths = [...plan.paths.slice(0, at), ...pieces, ...plan.paths.slice(at + 1)];
  return grown(plan, paths, new Set(pieces.map((piece) => piece.key)), keys.value);
}

/** The path on the list holding a chip, with its place. */
function chipHolder(plan: PathPlan, chipKey: string): Readonly<{ at: number; path: PlanPath; chip: PlanViewpoint }> | null {
  for (let at = 0; at < plan.paths.length; at += 1) {
    const path = plan.paths[at]!;
    const chip = path.viewpoints.find((viewpoint) => viewpoint.key === chipKey);
    if (chip !== undefined) return { at, path, chip };
  }
  return null;
}

/**
 * `viewpoints` taken from their paths (as `left` says) into the end of the path `intoKey`, by the words rule. `keys` goes
 * on from keys the caller already took (an own viewpoint's o<n>); `more` is more after the change (an idea taken from it).
 */
function movedInto(
  plan: PathPlan, intoKey: string, viewpoints: readonly PlanViewpoint[], left: ReadonlyMap<string, readonly PlanViewpoint[]>,
  keys: KeyCounter = keyCounter(plan.nextKey), more: readonly PlanPath[] = plan.more
): PathPlanResult {
  const into = plan.paths.find((path) => path.key === intoKey)!;
  if (into.viewpoints.length + viewpoints.length > PATH_PLAN_LIMITS.viewpointsPerPathMax) return refused(plan, "VIEWPOINTS_FULL");
  const paths = withLeft(plan.paths, new Map<string, readonly PlanViewpoint[]>([...left, [intoKey, [...into.viewpoints, ...viewpoints]]]), keys);
  return unchanged(stepped(plan, "CHANGE", { paths, more, nextKey: keys.value, selected: selectedIn(plan.selected, paths) }));
}

/** A chip's ⋯: into another path on the list ("Move to path N"), or "NEW", its own path right under its path (folding to How wide). */
function moveChip(plan: PathPlan, chipKey: string, toPathKey: string): PathPlanResult {
  const from = chipHolder(plan, chipKey);
  if (from === null) return unchanged(plan);
  const rest = from.path.viewpoints.filter((viewpoint) => viewpoint !== from.chip);
  if (toPathKey === "NEW") {
    if (rest.length === 0) return unchanged(plan);
    const keys = keyCounter(plan.nextKey);
    const made = inOwnWords(madePath(keys.next()), from.chip);
    const source = regrouped(from.path, rest, keys)!;
    const paths = [...plan.paths.slice(0, from.at), source, made, ...plan.paths.slice(from.at + 1)];
    return grown(plan, paths, new Set([made.key, source.key]), keys.value);
  }
  if (toPathKey === from.path.key || !plan.paths.some((path) => path.key === toPathKey)) return unchanged(plan);
  return movedInto(plan, toPathKey, [from.chip], new Map([[from.path.key, rest]]));
}

/** Move what is picked (paths and chips of other paths) into one path on the list. The model keeps it; no row sends it (Task 72). */
function moveSelected(plan: PathPlan, toPathKey: string): PathPlanResult {
  if (!plan.paths.some((path) => path.key === toPathKey)) return unchanged(plan);
  const pick = taken(plan, toPathKey);
  if (pick.parts === 0) return unchanged(plan);
  const result = movedInto(plan, toPathKey, pick.viewpoints, pick.left);
  return result.refusal === null ? { ...result, plan: { ...result.plan, selected: [] } } : result;
}

/**
 * Remove a chip: its path keeps the rest (by the words rule), and the chip goes to the front of more as its own path; the
 * person's own words are dropped instead. A path's only chip is the path itself (Remove of the path).
 */
function removeChip(plan: PathPlan, chipKey: string): PathPlanResult {
  const from = chipHolder(plan, chipKey)!;
  if (from.path.viewpoints.length === 1) return remove(plan, from.path.key);
  const keys = keyCounter(plan.nextKey);
  const paths = withLeft(plan.paths, new Map([[from.path.key, from.path.viewpoints.filter((viewpoint) => viewpoint !== from.chip)]]), keys);
  const more = from.chip.source.kind === "OWN" ? plan.more : [inOwnWords(madePath(keys.next()), from.chip), ...plan.more];
  return unchanged(stepped(plan, "CHANGE", { paths, more, nextKey: keys.value, selected: selectedIn(plan.selected, paths) }));
}

/**
 * Rewrite: the person's own words for a path on the list, trimmed (empty → EMPTY, over the wire's lengths → TOO_LONG).
 * A path still being written takes a new key, so its combine answer, which may still come, can never land on it later
 * (after a chip moves in and "Rewrite it for me" makes it written again with other viewpoints).
 */
function rewrite(plan: PathPlan, key: string, title: string | undefined, question: string): PathPlanResult {
  const at = plan.paths.findIndex((path) => path.key === key);
  if (at < 0) return unchanged(plan);
  const path = plan.paths[at]!;
  const words = { title: title === undefined ? path.title : title.trim(), question: question.trim() };
  if (words.title === "" || words.question === "") return refused(plan, "EMPTY");
  if (words.title.length > PATH_PLAN_LIMITS.titleMaxChars || words.question.length > PATH_PLAN_LIMITS.questionMaxChars) return refused(plan, "TOO_LONG");
  if (words.title === path.title && words.question === path.question) return unchanged(plan);
  const keys = keyCounter(plan.nextKey);
  const rewritten: PlanPath = {
    ...path, ...words, key: path.wording === "WRITING" ? keys.next() : path.key, wording: "PERSON", combineRef: null, askReword: false
  };
  const paths = plan.paths.map((one, place) => place === at ? rewritten : one);
  return unchanged(stepped(plan, "CHANGE", { paths, nextKey: keys.value, selected: selectedIn(plan.selected, paths) }));
}

/** The answer to "Rewrite it for me / Keep my wording" on a path that asks: keep the words, or write them again (words rule). */
function reword(plan: PathPlan, key: string, keep: boolean): PathPlanResult {
  const at = plan.paths.findIndex((path) => path.key === key && path.askReword);
  if (at < 0) return unchanged(plan);
  const path = plan.paths[at]!;
  const next = keep ? { ...path, askReword: false } : path.viewpoints.length === 1 ? inOwnWords(path, path.viewpoints[0]!) : joined(path, path.viewpoints);
  return unchanged(stepped(plan, "CHANGE", { paths: plan.paths.map((one, place) => place === at ? next : one) }));
}

/** Why the person's own words cannot be sent (already trimmed): none, or over 1000 UTF-16 code units. */
function ownWordsRefusal(words: string): PathPlanRefusal | null {
  if (words === "") return "EMPTY";
  return words.length > PATH_PLAN_LIMITS.ownTextMaxChars ? "TOO_LONG" : null;
}

const ownViewpoint = (key: string, words: string): PlanViewpoint => ({ key, source: { kind: "OWN" }, title: null, question: words, angleId: null });
const onList = (plan: PathPlan, key: string): boolean => plan.paths.some((path) => path.key === key);

/**
 * A new path onto the list, as one Undo step: in the place of `swapWithKey` (a path on the list, which goes to the front of
 * more), else at the end while the list is narrower than How wide, else PATHS_FULL. `more` is more without the new path.
 */
function withNewPath(plan: PathPlan, path: PlanPath, swapWithKey: string | undefined, more: readonly PlanPath[], nextKey: number): PathPlanResult {
  if (swapWithKey === undefined) {
    if (plan.paths.length >= plan.width) return refused(plan, "PATHS_FULL");
    return unchanged(stepped(plan, "CHANGE", { paths: [...plan.paths, path], more, nextKey }));
  }
  const at = plan.paths.findIndex((one) => one.key === swapWithKey);
  if (at < 0) return unchanged(plan);
  const paths = plan.paths.map((one, place) => place === at ? path : one);
  return unchanged(stepped(plan, "CHANGE", { paths, more: [intoMore(plan.paths[at]!), ...more], nextKey, selected: selectedIn(plan.selected, paths) }));
}

/**
 * "+ Add your own path…": the person's words, trimmed (EMPTY; TOO_LONG over 1000 code units), kept as written: into a
 * path on the list (no extra path; a swap asked with it is not needed), or as their own path, added by them.
 */
function addOwn(plan: PathPlan, text: string, intoPathKey: string | null, swapWithKey: string | undefined): PathPlanResult {
  const words = text.trim();
  const refusal = ownWordsRefusal(words);
  if (refusal !== null) return refused(plan, refusal);
  const keys = keyCounter(plan.nextKey);
  const own = ownViewpoint(keys.own(), words);
  if (intoPathKey !== null) return onList(plan, intoPathKey) ? movedInto(plan, intoPathKey, [own], new Map(), keys) : unchanged(plan);
  return withNewPath(plan, inOwnWords(madePath(keys.next()), own), swapWithKey, plan.more, keys.value);
}

/** "+ Look into this" on an idea in more: its viewpoints into a path on the list (no extra path), or the idea as its own path. */
function addFromMore(plan: PathPlan, key: string, intoPathKey: string | null, swapWithKey: string | undefined): PathPlanResult {
  const idea = plan.more.find((path) => path.key === key);
  if (idea === undefined) return unchanged(plan);
  const more = plan.more.filter((path) => path !== idea);
  if (intoPathKey !== null) {
    return onList(plan, intoPathKey) ? movedInto(plan, intoPathKey, idea.viewpoints, new Map(), keyCounter(plan.nextKey), more) : unchanged(plan);
  }
  return withNewPath(plan, idea, swapWithKey, more, plan.nextKey);
}

/**
 * "Another way to see it": the card's own path (its viewpoint is the card id) into a path on the list, or as a path. A card
 * is used once: one already on the list changes nothing, and one whose path waits in more comes back from there.
 */
function useCard(plan: PathPlan, cardId: string, intoPathKey: string | null, swapWithKey: string | undefined): PathPlanResult {
  const card = plan.cards.find((one) => one.card_id === cardId);
  if (card === undefined || isChip(plan.paths, cardId)) return unchanged(plan);
  const waiting = plan.more.find((path) => path.viewpoints.some((viewpoint) => viewpoint.key === cardId));
  if (waiting !== undefined) return addFromMore(plan, waiting.key, intoPathKey, swapWithKey);
  const chip: PlanViewpoint = {
    key: cardId, source: { kind: "MENU", viewpointId: cardId }, title: card.new_path.title, question: card.new_path.question, angleId: null
  };
  const keys = keyCounter(plan.nextKey);
  if (intoPathKey !== null) return onList(plan, intoPathKey) ? movedInto(plan, intoPathKey, [chip], new Map(), keys) : unchanged(plan);
  return withNewPath(plan, inOwnWords(madePath(keys.next()), chip), swapWithKey, plan.more, keys.value);
}

/**
 * "Make this my question": the card's question takes the place of the person's words, and their words are kept as their
 * own path at the top (folding to How wide by the fold rule; PATHS_FULL when only their paths could make room). A card
 * without a question, or the card already swapped, changes nothing. A second card's question takes the first one's
 * place and keeps the words the person first asked, which are already kept as a path.
 */
function makeMyQuestion(plan: PathPlan, cardId: string, originalQuestion: string): PathPlanResult {
  const card = plan.cards.find((one) => one.card_id === cardId);
  if (card === undefined || card.as_question === null || plan.questionSwap?.cardId === cardId) return unchanged(plan);
  if (plan.questionSwap !== null) return unchanged(stepped(plan, "CHANGE", { questionSwap: { ...plan.questionSwap, cardId, question: card.as_question } }));
  const words = originalQuestion.trim();
  const refusal = ownWordsRefusal(words);
  if (refusal !== null) return refused(plan, refusal);
  const keys = keyCounter(plan.nextKey);
  const own = ownViewpoint(keys.own(), words);
  const kept = inOwnWords(madePath(keys.next()), own);
  return grown(plan, [kept, ...plan.paths], new Set([kept.key]), keys.value, {
    questionSwap: { cardId, question: card.as_question, original: originalQuestion }
  });
}

/**
 * A suggestion applied (whether it is done is the caller's): Combine needs both paths on the list; "fits path N" needs the
 * idea on the list or in more and the path on the list, and moves the idea's viewpoints into it. The same plan when it
 * does not apply, or the refusal (VIEWPOINTS_FULL).
 */
function applied(plan: PathPlan, suggestion: StartSuggestion): PathPlanResult {
  if (suggestion.kind === "COMBINE") {
    if (!suggestion.path_refs.every((key) => onList(plan, key))) return unchanged(plan);
    const picking: PathPlan = { ...plan, selected: [...suggestion.path_refs] };
    const result = combineSelected(picking);
    if (result.plan === picking) return result.refusal === null ? unchanged(plan) : refused(plan, result.refusal);
    return { ...result, plan: { ...result.plan, selected: selectedIn(plan.selected, result.plan.paths) } };
  }
  if (!onList(plan, suggestion.into_path_ref)) return unchanged(plan);
  const listed = plan.paths.find((path) => path.key === suggestion.path_ref);
  if (listed !== undefined) return movedInto(plan, suggestion.into_path_ref, listed.viewpoints, new Map([[listed.key, []]]));
  const idea = plan.more.find((path) => path.key === suggestion.path_ref);
  if (idea === undefined) return unchanged(plan);
  return movedInto(plan, suggestion.into_path_ref, idea.viewpoints, new Map(), keyCounter(plan.nextKey), plan.more.filter((path) => path !== idea));
}

/** [Combine] or [Add to path N]: the suggestion applied as one Undo step, and done. */
function applySuggestion(plan: PathPlan, suggestionId: string): PathPlanResult {
  const suggestion = plan.suggestions.find((one) => one.suggestion_id === suggestionId);
  if (suggestion === undefined || plan.done.includes(suggestionId)) return unchanged(plan);
  const result = applied(plan, suggestion);
  return result.plan === plan ? result : { ...result, plan: { ...result.plan, done: [...plan.done, suggestionId] } };
}

/**
 * [Keep apart] or [Not now]: the suggestion is done. It changes no path, so it is no Undo step; every Undo step holds it
 * done too, so undoing a change never brings it back.
 */
function dismissSuggestion(plan: PathPlan, suggestionId: string): PathPlanResult {
  if (!plan.suggestions.some((one) => one.suggestion_id === suggestionId) || plan.done.includes(suggestionId)) return unchanged(plan);
  return unchanged({
    ...plan, done: [...plan.done, suggestionId],
    undo: plan.undo.map((step) => step.done.includes(suggestionId) ? step : { ...step, done: [...step.done, suggestionId] })
  });
}

/** The suggestions to show: at most two, in the menu's order, not done, and only those that would still change the list. */
export function pathPlanSuggestions(plan: PathPlan): readonly StartSuggestion[] {
  const shown: StartSuggestion[] = [];
  for (const suggestion of plan.suggestions) {
    if (shown.length === SUGGESTIONS_SHOWN_MAX) break;
    if (!plan.done.includes(suggestion.suggestion_id) && applied(plan, suggestion).plan !== plan) shown.push(suggestion);
  }
  return shown;
}

/** A path's area: the angle of its first viewpoint that has one (none for the person's own words, a card or a pick). */
const areaOf = (path: PlanPath): string | null => path.viewpoints.find((viewpoint) => viewpoint.angleId !== null)?.angleId ?? null;

/** "Other directions": for each of the menu's angles no viewpoint on the list touches, the most useful idea in more of that area. */
export function pathPlanDirections(plan: PathPlan, angles: readonly StartAngle[]): readonly Readonly<{ angle: StartAngle; path: PlanPath }>[] {
  const touched = new Set(plan.paths.flatMap((path) => path.viewpoints.flatMap((viewpoint) => viewpoint.angleId === null ? [] : [viewpoint.angleId])));
  return angles.flatMap((angle) => {
    if (touched.has(angle.angle_id)) return [];
    const path = plan.more.find((idea) => areaOf(idea) === angle.angle_id);
    return path === undefined ? [] : [{ angle, path }];
  });
}

/**
 * "All, by area": every idea in more, grouped by the menu's angles in their order (empty areas left out), then, with angle
 * null ("Added by you"), those with no area of these angles, so nothing in more is left out.
 */
export function pathPlanByArea(plan: PathPlan, angles: readonly StartAngle[]): readonly Readonly<{ angle: StartAngle | null; paths: readonly PlanPath[] }>[] {
  const known = new Set(angles.map((angle) => angle.angle_id));
  const groups = angles.flatMap((angle) => {
    const paths = plan.more.filter((idea) => areaOf(idea) === angle.angle_id);
    return paths.length === 0 ? [] : [{ angle, paths }];
  });
  const rest = plan.more.filter((idea) => {
    const area = areaOf(idea);
    return area === null || !known.has(area);
  });
  return rest.length === 0 ? groups : [...groups, { angle: null, paths: rest }];
}

/**
 * The words the person wrote on the list, once each, in list order: a path in their wording gives its title and question,
 * and every path its own-words viewpoints (as the server reads a path the person wrote at Start, Task 33).
 */
export function pathPlanOwnWords(plan: PathPlan): readonly string[] {
  const words = plan.paths.flatMap((path) => [
    ...(path.wording === "PERSON" ? [path.title, path.question] : []),
    ...path.viewpoints.flatMap((viewpoint) => viewpoint.source.kind === "OWN" ? [viewpoint.question] : [])
  ]);
  return [...new Set(words)];
}

/**
 * Every change to the plan: the selection, Combine and its answers, Split apart, the chips' ⋯, Remove, Move, Rewrite and
 * its question, the person's own path, "+ Look into this" from more, the cards and "Make this my question", the
 * suggestions, How wide and Undo. An action it does not know is TypeError("PATH_PLAN_ACTION_INVALID").
 */
export function pathPlanReduce(plan: PathPlan, action: PathPlanAction): PathPlanResult {
  switch (action.type) {
    case "SELECT": return select(plan, action.key);
    case "UNSELECT": return unselect(plan, action.key);
    case "CLEAR_SELECTION": return plan.selected.length === 0 ? unchanged(plan) : unchanged({ ...plan, selected: [] });
    case "COMBINE_SELECTED": return combineSelected(plan);
    case "COMBINE_WRITTEN":
      return combineAnswered(plan, action.key, (path) => ({
        ...path, title: action.title, question: action.question, wording: "COMBINED", combineRef: action.combineRef
      }));
    case "COMBINE_FAILED": return combineAnswered(plan, action.key, (path) => ({ ...path, wording: "FALLBACK", combineRef: null }));
    case "SPLIT": return split(plan, action.key);
    case "MOVE_CHIP": return moveChip(plan, action.chipKey, action.toPathKey);
    case "MOVE_SELECTED": return moveSelected(plan, action.toPathKey);
    case "REMOVE": return remove(plan, action.key);
    case "MOVE": return move(plan, action.key, action.to);
    case "REWRITE": return rewrite(plan, action.key, action.title, action.question);
    case "KEEP_WORDING": return reword(plan, action.key, true);
    case "REWORD": return reword(plan, action.key, false);
    case "ADD_OWN": return addOwn(plan, action.text, action.intoPathKey, action.swapWithKey);
    case "ADD_FROM_MORE": return addFromMore(plan, action.key, action.intoPathKey, action.swapWithKey);
    case "USE_CARD": return useCard(plan, action.cardId, action.intoPathKey, action.swapWithKey);
    case "MAKE_MY_QUESTION": return makeMyQuestion(plan, action.cardId, action.originalQuestion);
    case "APPLY_SUGGESTION": return applySuggestion(plan, action.suggestionId);
    case "DISMISS_SUGGESTION": return dismissSuggestion(plan, action.suggestionId);
    case "SET_WIDTH": return setWidth(plan, action.width);
    case "UNDO": return undo(plan);
    default: throw new TypeError("PATH_PLAN_ACTION_INVALID");
  }
}
