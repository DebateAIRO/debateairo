import { createHash } from "node:crypto";
import { START_STEP_LIMITS, StartMenuSchema, pathIdOf, type StartMenu, type StartPathsSource } from "@debateai/contract";
import type { StartPathsStore, StoredPathViewpoint, StoredStartPath, StoredStartPathSet } from "@debateai/db";
import { TypedDomainError, type ReadingLevel } from "@debateai/kernel";
import {
  START_SEAT_REUSE_SUFFIX, mapMergeStartLists, mapRunStartLists, startCutAtWordEdge, startTopPaths, type MapCaller, type MapSeat
} from "@debateai/map";

/**
 * V4 start step, Task 53 (spec 2026-11-03 §4.2-§4.3; plan Task 53) — A PATH DEBATE'S SET, AS THE RUNNER FINDS IT. A run admitted with
 * shape receipt v2 argues the paths sealed for it at Start (0158): read first, always. A menu's or a dig's set that is missing refuses
 * the run before any call (PATHS_SET_MISSING): Start sealed it before the first job, so it cannot come later. A run that builds its own
 * list (RUN_BUILT: "Just answer it", an old page's ask on a v2 version) writes its lists and their merge itself, as the step before
 * Start does (the same calls: the angle planner, the list writers, one merge on Haiku), takes the menu's top paths at How wide, and
 * seals that set; on a re-claim the stored set is read back, so nothing is asked twice. The menu is checked against the contract here,
 * as the API checks it: the map package builds a menu, it never checks one.
 */
export const PATHS_RUN_CODES = Object.freeze({
  unconfigured: "PATHS_RUNNER_UNCONFIGURED",
  overReceipt: "PATHS_OVER_RECEIPT",
  noSet: "PATHS_SET_MISSING",
  menuInvalid: "START_MENU_INVALID"
} as const);

/**
 * The list seats of a run that builds its own list: each company's first seat in the given order (the opener-rotation order, distinct
 * companies first), then each of them again as the company's second seat, marked START_SEAT_REUSE_SUFFIX, never more than `writers`
 * (the plan's list writers on the receipt) nor nine lists. So at most two seats a company, and at most twice the companies.
 */
export function runBuiltListSeats(ordered: readonly MapSeat[], writers: number): readonly MapSeat[] {
  const seen = new Set<string>();
  const distinct = ordered.filter((seat) => {
    if (seen.has(seat.maker)) return false;
    seen.add(seat.maker);
    return true;
  });
  const seats = [...distinct, ...distinct.map((seat) => Object.freeze({ aiRef: `${seat.aiRef}${START_SEAT_REUSE_SUFFIX}`, maker: seat.maker }))];
  const most = Math.max(0, Math.min(Number.isSafeInteger(writers) ? writers : 0, START_STEP_LIMITS.listsMax));
  return Object.freeze(seats.slice(0, most).map((seat) => Object.freeze({ aiRef: seat.aiRef, maker: seat.maker })));
}

/** A run's own menu id: the same for every copy of the run, 22 base64url characters (MENU_ID_PATTERN). */
export function runBuiltMenuId(runId: string): string {
  return createHash("sha256").update(`run-built-menu:${runId}`, "utf8").digest("base64url").slice(0, 22);
}

/**
 * A run's own menu: the angle planner (the first seat), every list at once, waiting for all (no cut: nothing is shown before Start),
 * then the first merge on the Haiku seat (none: the first list's code menu), under the run's own menu id. The menu must pass the
 * contract, else the run is refused START_MENU_INVALID before any root. No list came back (or no seat): no menu, null.
 * Review of Task 88 (r22-end-to-end path 7): the start steps read a thrown call as a failed one, so `abandoned` (the runner caller's
 * first abandon: claim lost, time up, the month wall's pause) is asked after the lists and after the merge; a stop met there leaves
 * as itself, so this copy seals nothing it left (never the question alone as the one path) and the copy that resumes writes the lists
 * afresh (the calls already answered replayed from the record).
 */
export async function runBuiltMenu(input: Readonly<{ runId: string; questionLine: string; languageName: string; languageTag: string;
  readingLevel: ReadingLevel | null; clarifyLines: readonly string[]; seats: readonly MapSeat[]; haiku: MapSeat | null; caller: MapCaller;
  signal?: AbortSignal; abandoned?: () => Readonly<{ error: unknown }> | null }>): Promise<StartMenu | null> {
  const planner = input.seats[0];
  if (planner === undefined) return null;
  const signal = input.signal ?? new AbortController().signal;
  const leaveIfAbandoned = (): void => {
    const stop = input.abandoned?.() ?? null;
    if (stop !== null) throw stop.error;
  };
  const run = { questionLine: input.questionLine, languageName: input.languageName, languageTag: input.languageTag, readingLevel: input.readingLevel };
  const listed = await mapRunStartLists({ ...run, seats: input.seats, planner, caller: input.caller, signal, cut: "WAIT_ALL",
    onSeatDone: () => undefined, onList: () => undefined, onCut: () => undefined });
  leaveIfAbandoned();
  const lists = [...listed.lists, ...listed.late];
  if (lists.length === 0) return null;
  const made = await mapMergeStartLists({ ...run, clarifyLines: input.clarifyLines, lists, prior: null, seat: input.haiku, caller: input.caller,
    menuId: runBuiltMenuId(input.runId), signal });
  leaveIfAbandoned();
  const menu = StartMenuSchema.safeParse(made.menu);
  if (!menu.success) {
    throw new TypedDomainError(PATHS_RUN_CODES.menuInvalid, "The run's own menu does not pass the start-step contract");
  }
  return Object.freeze(menu.data);
}

/**
 * The set a run that builds its own list seals: the menu's top paths at How wide (Free at most 3), each an AI suggestion chosen by the
 * AIs, with its viewpoints, the menu kept whole. No menu (no list came back): one path b1, the question itself, as the person wrote it
 * (PERSON_EDITED), with no own words and no viewpoint. Review of Task 53: a question line may hold up to 8 KiB, a path's question at
 * most `pathQuestionMaxChars` (the bound every reader of a path keeps, Answer.branches among them), so b1's question is cut at a word
 * edge to it; the whole question line still reaches every leg.
 */
export function runBuiltStartPathSet(input: Readonly<{ runId: string; menu: StartMenu | null; width: number; free: boolean;
  carryOnToReport: boolean; questionLine: string }>): StoredStartPathSet {
  const base = { runId: input.runId, source: "RUN_BUILT" as const, width: input.width, chosenBy: "AIS" as const, carryOnToReport: input.carryOnToReport };
  if (input.menu === null) {
    const question = startCutAtWordEdge(input.questionLine.trim(), START_STEP_LIMITS.pathQuestionMaxChars);
    const only: StoredStartPath = Object.freeze({ pathId: pathIdOf(1), pathNo: 1, author: "PERSON_EDITED" as const,
      title: startCutAtWordEdge(question, START_STEP_LIMITS.pathTitleMaxChars), question, viewpoints: Object.freeze([]), ownWords: Object.freeze([]) });
    return Object.freeze({ ...base, paths: Object.freeze([only]), menu: null });
  }
  const menu = input.menu;
  const count = input.free ? Math.min(input.width, START_STEP_LIMITS.freePathsMax) : input.width;
  const shown = new Map(menu.viewpoints.map((one) => [one.viewpoint_id, one] as const));
  const paths = startTopPaths(menu, count).map((path, at): StoredStartPath => Object.freeze({
    pathId: pathIdOf(at + 1), pathNo: at + 1, author: "AI_SUGGESTION" as const, title: path.title, question: path.question,
    viewpoints: Object.freeze(path.viewpoint_ids.flatMap((id): StoredPathViewpoint[] => {
      const one = shown.get(id);
      return one === undefined ? [] : [Object.freeze({ viewpointId: one.viewpoint_id, pickNo: null, title: one.title, question: one.question, own: false })];
    })),
    ownWords: Object.freeze([])
  }));
  return Object.freeze({ ...base, paths: Object.freeze(paths), menu: Object.freeze({ menu, lateLists: Object.freeze([]) }) });
}

/**
 * What the gap round is told was already raised: the menu's paths none of the chosen paths holds, then every late list's viewpoint
 * none holds, each as "<title>: <question>". A set without a menu (a dig's picks) has none.
 */
export function gapAlreadyRaised(set: StoredStartPathSet): readonly string[] {
  const kept = set.menu;
  if (kept === null) return Object.freeze([]);
  const chosen = new Set(set.paths.flatMap((path) => path.viewpoints.flatMap((viewpoint) => viewpoint.viewpointId === null ? [] : [viewpoint.viewpointId])));
  const unchosen = kept.menu.paths.filter((path) => !path.viewpoint_ids.some((id) => chosen.has(id)))
    .map((path) => `${path.title}: ${path.question}`);
  const late = kept.lateLists.flatMap((list) => list.viewpoints).filter((one) => !chosen.has(one.viewpoint_id))
    .map((one) => `${one.title}: ${one.question}`);
  return Object.freeze([...unchosen, ...late]);
}

/**
 * The set a path debate argues: the stored one, read first. A menu's or a dig's that is missing refuses the run (PATHS_SET_MISSING). A
 * run that builds its own: built once and sealed; when another copy sealed one first (ALREADY), that stored set is argued, never this
 * copy's own.
 */
export async function resolvePathsRunSet(input: Readonly<{ store: StartPathsStore; runId: string; source: StartPathsSource;
  build: () => Promise<StoredStartPathSet> }>): Promise<StoredStartPathSet> {
  const stored = await input.store.readStartPaths(input.runId);
  if (stored !== null) return stored;
  if (input.source !== "RUN_BUILT") {
    throw new TypedDomainError(PATHS_RUN_CODES.noSet, "A path debate's chosen paths were not sealed at Start");
  }
  const built = await input.build();
  if (await input.store.recordStartPaths(built) === "RECORDED") return built;
  return (await input.store.readStartPaths(input.runId)) ?? built;
}

/** The ask contract's carry-on member (Task 35 writes it on receipt v2 only): true only when it is exactly true. */
export function carryOnToReportOf(askContract: unknown): boolean {
  return typeof askContract === "object" && askContract !== null && (askContract as { readonly carry_on_to_report?: unknown }).carry_on_to_report === true;
}
