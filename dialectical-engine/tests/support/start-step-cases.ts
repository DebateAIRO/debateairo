import {
  START_STEP_LIMITS, StartPathsSchema, startListNosOfMenu, type AccountReadingLevel, type ContractClient, type SignedStartList,
  type SignedStartMenu, type SiteLanguage, type StartCombineMember, type StartListsEvent, type StartListsRequest, type StartMenu,
  type StartMenuPath, type StartMenuViewpoint, type StartMergeRequest, type StartMergeResponse, type StartPathChoice, type StartPaths
} from "@debateai/contract";
import { parseDebateShapePolicy, type DebateShapePolicy } from "@debateai/register";

/*
 * V4 start step, Task 84 (spec 2026-11-03 §8, "the end-to-end test world"): THE START STEP'S SHARED CASES, and the
 * helpers that drive the step before Start as the page does (Tasks 70 and 71), for the end-to-end world (Tasks 86, 88,
 * 90) and the rehearsal (Task 93). The page's rules the drive keeps:
 *  - the lists are read once, for the line posted at Next (the read line); every pre-Start call (merge, combine) sends
 *    that line and the check's reference, never a line edited on step 2;
 *  - the first merge is asked at the `cut`, with the lists in by then; every list the menu does not hold afterwards
 *    (the late lists, and lists a CODE fallback left out) goes to one late merge with the menu so far, asked once more
 *    when it answers none; a list still unmerged at Start travels in `late_lists`;
 *  - nothing expires and nothing is read again (owner answer Q8): a Start sends the box's line with the check, and the
 *    server keeps the paths and checks the whole line once when it changed (Tasks 33 and 36).
 * Pure test support: no figure, no key, no network of its own (the client given does the talking).
 */

export type StartStepCase = Readonly<{
  id: string;
  plan: "FREE" | "PLUS" | "PRO" | "MAX";
  depth: "quick" | "thorough";
  /**
   * How the case starts: SHAPED, the person's list (`shapedChoice`); TOP, the AIs' top paths ("Just answer it" on step 2,
   * `topPathsChoice`); JUST_ANSWER, the question alone from step 1 (no lists read before Start: the run builds its own);
   * NO_START, the lists are read and Start is never pressed; TROUBLE, lists that fail or run slow, then Start with the
   * latest menu. A dig case starts with the AIs' top paths, then digs with paths.
   */
  start: "SHAPED" | "TOP" | "JUST_ANSWER" | "NO_START" | "TROUBLE";
  dig: boolean;
}>;

const startCase = (plan: StartStepCase["plan"], depth: StartStepCase["depth"], start: StartStepCase["start"], dig = false): StartStepCase =>
  Object.freeze({ id: `${plan}_${depth.toUpperCase()}_${dig ? "DIG" : start}`, plan, depth, start, dig });

/** The ten cases, in the order the world runs them. Free has no thorough debate, so its cases are quick only. */
export const START_STEP_CASES: readonly StartStepCase[] = Object.freeze([
  startCase("FREE", "quick", "TOP"),
  startCase("FREE", "quick", "TOP", true),
  startCase("PLUS", "quick", "SHAPED"),
  startCase("PLUS", "thorough", "SHAPED"),
  startCase("PLUS", "quick", "JUST_ANSWER"),
  startCase("PLUS", "quick", "NO_START"),
  startCase("PLUS", "quick", "TROUBLE"),
  startCase("PRO", "quick", "TOP"),
  startCase("MAX", "thorough", "TOP"),
  startCase("PLUS", "quick", "TOP", true)
]);

type ListsClient = Pick<ContractClient, "startPathLists">;
type DriveClient = Pick<ContractClient, "startPathLists" | "startPathMerge">;
type CheckEvent = Extract<StartListsEvent, { event: "check" }>["data"];

/** Every event of one lists stream, in order, once it has ended. */
export async function readStartLists(client: ListsClient, request: StartListsRequest, signal?: AbortSignal): Promise<readonly StartListsEvent[]> {
  const events: StartListsEvent[] = [];
  await client.startPathLists(request, (event) => { events.push(event); }, signal ?? new AbortController().signal);
  return Object.freeze(events);
}

/**
 * One drive of the step before Start. `read`: what the lists were read with (every later pre-Start call sends the same
 * line and level); `events`: the lists stream as it came; `check`: its check (null: none came); `menu`: the latest menu
 * (null: no list, or the first merge answered none); `lists`: the lists in at the cut (the first merge's); `late`: the
 * lists that came after it; `merges`: every merge's answer, in order (the first one's menu is revision 1).
 */
export type StartStepDrive = Readonly<{
  read: Readonly<{ questionLine: string; siteLanguage: SiteLanguage; readingLevel: AccountReadingLevel }>;
  events: readonly StartListsEvent[];
  check: CheckEvent | null;
  menu: SignedStartMenu | null;
  lists: readonly SignedStartList[];
  late: readonly SignedStartList[];
  merges: readonly StartMergeResponse[];
}>;

/** The lists held that the menu does not hold yet, in the order they came (Task 71). */
function unmergedOf(menu: StartMenu, held: readonly SignedStartList[]): readonly SignedStartList[] {
  const inMenu = new Set(startListNosOfMenu(menu));
  return held.filter((one) => !inMenu.has(one.list.list_no));
}

/**
 * Reads the lists for `input` and merges them as the page does: the first merge at the cut, with the lists in by then;
 * then one late merge of every list the menu does not hold, with the menu so far (asked once more if it answers none;
 * after that the menu stays and Start carries those lists). A stream with no cut (no list came) asks no merge.
 */
export async function driveStartStep(client: DriveClient, input: Readonly<{ questionLine: string; siteLanguage: SiteLanguage;
  readingLevel: AccountReadingLevel }>): Promise<StartStepDrive> {
  const read = Object.freeze({ questionLine: input.questionLine, siteLanguage: input.siteLanguage, readingLevel: input.readingLevel });
  const events: StartListsEvent[] = [];
  const lists: SignedStartList[] = [];
  const late: SignedStartList[] = [];
  const seen: { check: CheckEvent | null; firstMerge: Promise<StartMergeResponse> | null } = { check: null, firstMerge: null };
  const mergeOf = (checkRef: string, signed: readonly SignedStartList[], prior?: SignedStartMenu): Promise<StartMergeResponse> => {
    const request: StartMergeRequest = { question_line: read.questionLine, check_ref: checkRef, reading_level: read.readingLevel,
      lists: [...signed], ...(prior === undefined ? {} : { prior_menu: prior }) };
    return client.startPathMerge(request);
  };
  await client.startPathLists({ question_line: read.questionLine, site_language: read.siteLanguage, reading_level: read.readingLevel }, (event) => {
    events.push(event);
    if (event.event === "check") seen.check = event.data;
    else if (event.event === "list") lists.push(event.data.list);
    else if (event.event === "late_list") late.push(event.data.list);
    else if (event.event === "cut" && seen.firstMerge === null && seen.check !== null && lists.length > 0) {
      const merging = mergeOf(seen.check.check_ref, lists);
      // Read below once the stream has ended; until then a failure must not go unhandled.
      merging.catch(() => undefined);
      seen.firstMerge = merging;
    }
  }, new AbortController().signal);

  const { check, firstMerge } = seen;
  const merges: StartMergeResponse[] = [];
  let menu: SignedStartMenu | null = null;
  if (check !== null && firstMerge !== null) {
    const first = await firstMerge;
    merges.push(first);
    if (first.source !== "NONE") menu = first.menu;
    for (let attempt = 0; menu !== null && attempt < 2; attempt += 1) {
      const pending = unmergedOf(menu.menu, [...lists, ...late]);
      if (pending.length === 0) break;
      const answer = await mergeOf(check.check_ref, pending, menu);
      merges.push(answer);
      if (answer.source !== "NONE") {
        menu = answer.menu;
        break;
      }
    }
  }
  return Object.freeze({ read, events: Object.freeze(events), check, menu, lists: Object.freeze(lists), late: Object.freeze(late),
    merges: Object.freeze(merges) });
}

/** The lists Start carries beside the menu: those it does not hold yet, if any (Task 71). */
function lateListsOf(drive: StartStepDrive, menu: SignedStartMenu): Readonly<{ late_lists?: SignedStartList[] }> {
  const pending = unmergedOf(menu.menu, [...drive.lists, ...drive.late]);
  return pending.length === 0 ? {} : { late_lists: [...pending] };
}

/** A menu path as the AIs wrote it: its words and its viewpoints (Task 33 reads it as the AIs' suggestion). */
const asWritten = (path: StartMenuPath): StartPathChoice =>
  ({ title: path.title, question: path.question, members: path.viewpoint_ids.map((id) => ({ viewpoint_id: id })) });
/** One viewpoint as its own path, in its own words (a split; Task 33 reads it as the AIs' suggestion). */
const asItself = (viewpoint: StartMenuViewpoint): StartPathChoice =>
  ({ title: viewpoint.title, question: viewpoint.question, members: [{ viewpoint_id: viewpoint.viewpoint_id }] });

/**
 * "Just answer it" on step 2: the menu's first `width` paths (all of them when it has fewer) in the AIs' words, MENU,
 * chosen by the AIs, at How wide `width` (Free: pass 3). Null when the drive has no menu (Start then sends the check alone).
 */
export function topPathsChoice(drive: StartStepDrive, width: number): StartPaths | null {
  const menu = drive.menu;
  if (menu === null) return null;
  return StartPathsSchema.parse({ source: "MENU", menu, ...lateListsOf(drive, menu), paths: menu.menu.paths.slice(0, width).map(asWritten),
    width, chosen_by: "AIS" });
}

/** The shaped list's How wide and its own path's words (made up; Task 90 finds the own path by them). */
export const SHAPED_WIDTH = 5;
export const SHAPED_OWN_TEXT = "Made-up own path: what about the workers?";

/** `text` in at most `max` UTF-16 code units, whole code points and "…" when cut (the page's cutText, Task 64). */
function cutText(text: string, max: number): string {
  if (text.length <= max) return text;
  let kept = "";
  for (const point of text) {
    if (kept.length + point.length + 1 > max) break;
    kept += point;
  }
  return `${kept}…`;
}

/**
 * A list the person shaped, as the page sends it (MENU, chosen by the person, How wide 5), in this order: the menu's first
 * two paths (kp01 and kp02) combined through startPathCombine, its combine_ref kept (Task 33: the AI's combined question);
 * the first put-together path after them, split into its viewpoints, each in its own words (the AIs' suggestion; left
 * whole when its split would not fit); one own path, SHAPED_OWN_TEXT (the person's own view); then the rest of the top
 * paths, as written, to the width. One combine call, with the read line, the check and the menu's id. A combine that
 * answers none keeps the joined words the page shows (titles with " · ", numbered questions) and no reference: the
 * person's edit. Throws TypeError START_SHAPED_NO_MENU without a menu, START_SHAPED_MENU_TOO_SMALL under two paths.
 */
export async function shapedChoice(drive: StartStepDrive, client: Pick<ContractClient, "startPathCombine">): Promise<StartPaths> {
  const signed = drive.menu;
  if (signed === null || drive.check === null) throw new TypeError("START_SHAPED_NO_MENU");
  const menu = signed.menu;
  const [first, second] = menu.paths;
  if (first === undefined || second === undefined) throw new TypeError("START_SHAPED_MENU_TOO_SMALL");
  const shownOf = (id: string): StartMenuViewpoint => {
    const shown = menu.viewpoints.find((one) => one.viewpoint_id === id);
    if (shown === undefined) throw new TypeError("START_SHAPED_MENU_INVALID");
    return shown;
  };
  const together = [...first.viewpoint_ids, ...second.viewpoint_ids].map(shownOf);
  const members: StartCombineMember[] = together.map((one) => ({ viewpoint_id: one.viewpoint_id, pick_no: null, title: one.title, question: one.question }));
  const answer = await client.startPathCombine({
    context: { kind: "MENU", question_line: drive.read.questionLine, check_ref: drive.check.check_ref, menu_id: menu.menu_id },
    reading_level: drive.read.readingLevel, members
  });
  const combinedMembers = together.map((one) => ({ viewpoint_id: one.viewpoint_id }));
  const combined: StartPathChoice = answer.source === "AI"
    ? { title: answer.title, question: answer.question, members: combinedMembers, combine_ref: answer.combine_ref }
    : { title: cutText(together.map((one) => one.title).join(" · "), START_STEP_LIMITS.pathTitleMaxChars),
      question: cutText(together.map((one, at) => `${at + 1}. ${one.question}`).join("\n"), START_STEP_LIMITS.pathQuestionMaxChars),
      members: combinedMembers };
  const own: StartPathChoice = { title: SHAPED_OWN_TEXT, question: SHAPED_OWN_TEXT, members: [{ own_text: SHAPED_OWN_TEXT }] };
  const split = menu.paths.slice(2).find((path) => path.put_together && 1 + path.viewpoint_ids.length + 1 <= SHAPED_WIDTH);
  const paths: StartPathChoice[] = [combined, ...(split === undefined ? [] : split.viewpoint_ids.map((id) => asItself(shownOf(id)))), own];
  for (const path of menu.paths.slice(0, SHAPED_WIDTH)) {
    if (paths.length >= SHAPED_WIDTH) break;
    if (path !== first && path !== second && path !== split) paths.push(asWritten(path));
  }
  return StartPathsSchema.parse({ source: "MENU", menu: signed, ...lateListsOf(drive, signed), paths, width: SHAPED_WIDTH, chosen_by: "PERSON" });
}

/** The lean Free line-up the switched-on world runs (GLM, DeepSeek, Qwen, Haiku; free-plan-month's line-up). */
export const LEAN_FREE_MODEL_IDS: readonly string[] = Object.freeze([
  "zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"
]);

/**
 * The lean Free shape (free-plan-month's): `plans.free` with 2 list writers, 2 answers, 1 grader, 2 points an answer, no
 * gap round and no extra close-call graders; every other member as given, the start step's switch included. Parsed
 * again, so the result is a row a publisher could seal.
 */
export function leanFreeShape(start: DebateShapePolicy): DebateShapePolicy {
  return parseDebateShapePolicy({
    ...start,
    plans: { ...start.plans, free: { ...start.plans.free, mapAIs: 2, answers: 2, graders: 1, pointsPerAnswer: 2, gapRoundsMax: 0, closeCallExtraGraders: 0 } }
  });
}
