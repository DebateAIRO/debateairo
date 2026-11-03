/**
 * V4 start step, Task 9 (spec 2026-11-03 §2, §4): the step before Start's ids, limits and wire shapes. Every shape is
 * strict; a list never names its maker or model; a menu holds every viewpoint once (shown in exactly one path, or kept
 * as the words of a repeat), so every list is sealed whole; the chosen paths fit How wide and name only what their
 * source allows. The largest legal ask body (every limit at once, in a 3-byte script: 54 viewpoints across the menu and
 * the late lists, 7 paths of 4 own-words members, the question and both originals at their limits) stays under the
 * route's limit.
 */
import { describe, expect, it } from "vitest";
import {
  ANGLE_ID_PATTERN, CARD_ID_PATTERN, MENU_ID_PATTERN, MENU_PATH_REF_PATTERN, PATH_ID_PATTERN, QuestionLanguageChoiceNeededSchema,
  QuestionLanguageOfferSchema, START_STEP_LIMITS, SUGGESTION_ID_PATTERN, StartListSchema, StartListsEventSchema, StartMenuSchema,
  StartPathsSchema, VIEWPOINT_ID_PATTERN, askQuestionMaxBytes, pathIdOf, startListNosOfMenu, type StartMenu
} from "@debateai/contract";

const REF = "eyJhIjoxfQ.c2lnbmF0dXJl";
const MENU_ID = "AAAAAAAAAAAAAAAAAAAAAA";
const ANGLES = [{ angle_id: "g1", kind: "OPPOSITE_CASE", label: "The other side" }];
const viewpoint = (list: number, item: number, fill?: string) => ({
  viewpoint_id: `pt${list}${item}`,
  title: fill === undefined ? `Title ${list}${item}` : fill.repeat(START_STEP_LIMITS.titleMaxChars),
  question: fill === undefined ? `Question ${list}${item}?` : fill.repeat(START_STEP_LIMITS.questionMaxChars),
  why: fill === undefined ? "It matters." : fill.repeat(START_STEP_LIMITS.whyMaxChars),
  angle_id: "g1"
});
const LIST = { list_no: 1, angles: ANGLES, viewpoints: [viewpoint(1, 1), viewpoint(1, 2)] };
/** The n-th viewpoint id in list order: pt11..pt16, pt21..pt96. */
const nth = (index: number) => [Math.floor(index / 6) + 1, (index % 6) + 1] as const;
const ref = (index: number) => `kp${String(index + 1).padStart(2, "0")}`;

/** A menu of `shown` viewpoints, each its own path, and `repeats` more kept as repeats of the first ones. */
function menuOf(shown: number, repeats = 0, fill?: string): StartMenu {
  const shownViewpoints = Array.from({ length: shown }, (_, index) => ({ ...viewpoint(...nth(index), fill), repeat_ids: [] as string[] }));
  const repeatWords = Array.from({ length: repeats }, (_, index) => viewpoint(...nth(shown + index), fill));
  repeatWords.forEach((repeat, index) => { shownViewpoints[index % shown]!.repeat_ids.push(repeat.viewpoint_id); });
  return {
    menu_id: MENU_ID, revision: 1, language: { code: "en", name: "English" }, angles: ANGLES,
    viewpoints: shownViewpoints, repeats: repeatWords,
    paths: shownViewpoints.map((one, index) => ({ path_ref: ref(index), title: one.title, question: one.question,
      viewpoint_ids: [one.viewpoint_id], put_together: false, is_new: false })),
    cards: [], suggestions: []
  } as StartMenu;
}
const MENU1 = menuOf(2);
const PATHS = { source: "MENU", menu: { menu: MENU1, ref: REF }, width: 3, chosen_by: "PERSON",
  paths: [{ title: "Whole-system costs", question: "What does the whole system cost?", members: [{ viewpoint_id: "pt11" }] }] };
const lateList = (listNo: number) => ({ list: { ...LIST, list_no: listNo, viewpoints: [viewpoint(listNo, 1)] }, ref: REF });

/** Every limit at once: a full menu, every late list, 7 chosen paths of 4 own-words members, in `fill`'s script. */
function worstCaseAskBody(fill: string): Record<string, unknown> {
  const longRef = `${"A".repeat(300)}.${"B".repeat(49)}`;
  const menu = menuOf(30, 0, fill);
  const fullMenu: StartMenu = {
    ...menu,
    angles: Array.from({ length: START_STEP_LIMITS.anglesMax }, (_, index) => ({ angle_id: `g${index + 1}`, kind: "GENERAL",
      label: fill.repeat(START_STEP_LIMITS.angleLabelMaxChars) })),
    cards: Array.from({ length: START_STEP_LIMITS.cardsMax }, (_, index) => ({ card_id: `cd${index + 1}`, kind: "OTHER_READING",
      sentence: fill.repeat(START_STEP_LIMITS.cardSentenceMaxChars), new_path: { title: fill.repeat(START_STEP_LIMITS.titleMaxChars),
        question: fill.repeat(START_STEP_LIMITS.questionMaxChars) }, fits_path_ref: "kp01", as_question: fill.repeat(START_STEP_LIMITS.questionMaxChars) })),
    suggestions: Array.from({ length: START_STEP_LIMITS.suggestionsMax }, (_, index) => ({ suggestion_id: `sg${index + 1}`, kind: "COMBINE",
      path_refs: [ref(index), ref(index + 1)], reason: fill.repeat(START_STEP_LIMITS.suggestionReasonMaxChars) }))
  } as StartMenu;
  const late = Array.from({ length: 4 }, (_, index) => ({ ref: longRef, list: { list_no: 6 + index,
    angles: Array.from({ length: START_STEP_LIMITS.anglesPerListMax }, (__, angle) => ({ angle_id: `g${angle + 1}`, kind: "GENERAL",
      label: fill.repeat(START_STEP_LIMITS.angleLabelMaxChars) })),
    viewpoints: Array.from({ length: START_STEP_LIMITS.viewpointsPerListMax }, (__, item) => viewpoint(6 + index, item + 1, fill)) } }));
  const own = fill.repeat(START_STEP_LIMITS.ownTextMaxChars);
  const body = {
    // The question at its byte limit (askQuestionMaxBytes, 8,192), the two originals at their 8,192 characters.
    question_line: fill.repeat(Math.floor(askQuestionMaxBytes() / Buffer.byteLength(fill, "utf8"))),
    start_check: { ref: longRef, original_question_line: fill.repeat(8192) },
    start_paths: {
      source: "MENU", menu: { menu: fullMenu, ref: longRef }, late_lists: late, width: START_STEP_LIMITS.pathsMax, chosen_by: "PERSON",
      question_swap: { card_id: "cd1", original_question_line: fill.repeat(8192) },
      paths: Array.from({ length: START_STEP_LIMITS.pathsMax }, () => ({ title: fill.repeat(START_STEP_LIMITS.pathTitleMaxChars),
        question: fill.repeat(START_STEP_LIMITS.pathQuestionMaxChars),
        members: Array.from({ length: START_STEP_LIMITS.viewpointsPerPathMax }, () => ({ own_text: own })), combine_ref: longRef }))
    }
  };
  const parsed = StartPathsSchema.safeParse(body.start_paths);
  if (!parsed.success) throw new Error(`worst case is not a legal body: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  return body;
}

describe("the start step's limits and ids", () => {
  it("pins every limit, frozen", () => {
    expect(START_STEP_LIMITS).toEqual({ listsMax: 9, viewpointsPerListMax: 6, viewpointsMax: 54, anglesMax: 7, anglesPerListMax: 4,
      titleMaxChars: 80, questionMaxChars: 240, whyMaxChars: 200, angleLabelMaxChars: 80, menuPathsMax: 54, viewpointsPerPathMax: 4, cardsMax: 3,
      cardSentenceMaxChars: 300, suggestionsMax: 9, suggestionReasonMaxChars: 200, lateListsMax: 8, menuRevisionsMax: 9, pathsMax: 7, storedPathsMax: 8,
      freePathsMax: 3, pathTitleMaxChars: 120, pathQuestionMaxChars: 1000, ownTextMaxChars: 1000, refMaxChars: 4096, askBodyMaxBytes: 393_216 });
    expect(Object.isFrozen(START_STEP_LIMITS)).toBe(true);
  });

  it("reads every id by its pattern", () => {
    expect(["b1", "b8"].every((id) => PATH_ID_PATTERN.test(id))).toBe(true);
    expect(["b9", "b0", "a1"].some((id) => PATH_ID_PATTERN.test(id))).toBe(false);
    expect(["pt11", "pt96", "cd3"].every((id) => VIEWPOINT_ID_PATTERN.test(id))).toBe(true);
    expect(["pt97", "pt01", "cd4"].some((id) => VIEWPOINT_ID_PATTERN.test(id))).toBe(false);
    expect(["kp01", "kp54"].every((id) => MENU_PATH_REF_PATTERN.test(id))).toBe(true);
    expect(["kp5", "kp60"].some((id) => MENU_PATH_REF_PATTERN.test(id))).toBe(false);
    expect([CARD_ID_PATTERN.test("cd1"), SUGGESTION_ID_PATTERN.test("sg9"), ANGLE_ID_PATTERN.test("g7"), MENU_ID_PATTERN.test(MENU_ID)]).toEqual([true, true, true, true]);
    expect([1, 7, 8].map(pathIdOf)).toEqual(["b1", "b7", "b8"]);
    expect(() => pathIdOf(9)).toThrow("PATH_NO_INVALID");
  });

  it("keeps the language offer one schema where it moved", () => {
    expect(QuestionLanguageChoiceNeededSchema.shape.offer).toBe(QuestionLanguageOfferSchema);
  });
});

describe("the lists and the menu", () => {
  it("never lets a list name its maker", () => {
    expect(StartListSchema.safeParse(LIST).success).toBe(true);
    expect(StartListSchema.safeParse({ ...LIST, maker: "Z.AI" }).success).toBe(false);
  });

  it("sends each live event as its name and its data", () => {
    expect(StartListsEventSchema.safeParse({ event: "progress", data: { answered: 1, of: 4 } }).success).toBe(true);
    expect(StartListsEventSchema.safeParse({ event: "end", data: { reason: "DONE" } }).success).toBe(true);
    expect(StartListsEventSchema.safeParse({ event: "list", data: { list: { list: LIST, ref: REF } } }).success).toBe(true);
    expect(StartListsEventSchema.safeParse({ event: "end", data: { reason: "LATER" } }).success).toBe(false);
  });

  it("refuses a viewpoint in two paths, and put together on a one-viewpoint path", () => {
    expect(StartMenuSchema.safeParse(MENU1).success).toBe(true);
    const twice = { ...MENU1, paths: [...MENU1.paths, { ...MENU1.paths[0]!, path_ref: "kp09" }] };
    expect(StartMenuSchema.safeParse(twice).success).toBe(false);
    const alone = { ...MENU1, paths: MENU1.paths.map((path, index) => index === 0 ? { ...path, put_together: true } : path) };
    expect(StartMenuSchema.safeParse(alone).success).toBe(false);
  });

  it("keeps every repeat's words exactly once, and no more than 54 viewpoints in all", () => {
    const menu = menuOf(4, 2);
    expect(StartMenuSchema.safeParse(menu).success).toBe(true);
    const unnamedEntry = { ...menu, viewpoints: menu.viewpoints.map((one) => ({ ...one, repeat_ids: one.repeat_ids.slice(0, 0) })) };
    expect(StartMenuSchema.safeParse(unnamedEntry).success).toBe(false);
    const noEntry = { ...menu, repeats: menu.repeats.slice(0, 1) };
    expect(StartMenuSchema.safeParse(noEntry).success).toBe(false);
    const alsoShown = { ...menu, repeats: [...menu.repeats.slice(0, 1), { ...menu.viewpoints[3]!, repeat_ids: undefined }].map(({ repeat_ids: _drop, ...words }: Record<string, unknown>) => words) };
    expect(StartMenuSchema.safeParse(alsoShown).success).toBe(false);
    expect(StartMenuSchema.safeParse(menuOf(40, 15)).success).toBe(false);
    expect(StartMenuSchema.safeParse(menuOf(50, 4)).success).toBe(true);
  });
});

describe("the chosen paths", () => {
  it("needs the menu for a menu source, fits How wide, and takes only new late lists", () => {
    expect(StartPathsSchema.safeParse(PATHS).success).toBe(true);
    const { menu: _menu, ...withoutMenu } = PATHS;
    expect(StartPathsSchema.safeParse(withoutMenu).success).toBe(false);
    expect(StartPathsSchema.safeParse({ ...PATHS, width: 1, paths: [PATHS.paths[0], PATHS.paths[0]] }).success).toBe(false);
    expect(startListNosOfMenu(MENU1)).toEqual([1]);
    expect(StartPathsSchema.safeParse({ ...PATHS, late_lists: [lateList(1)] }).success).toBe(false);
    expect(StartPathsSchema.safeParse({ ...PATHS, late_lists: [lateList(2)] }).success).toBe(true);
  });

  it("keeps the largest legal ask body, in a 3-byte script, under the route's limit", () => {
    const bytes = Buffer.byteLength(JSON.stringify(worstCaseAskBody("中")), "utf8");
    expect(bytes).toBeGreaterThan(300_000);
    expect(bytes).toBeLessThan(START_STEP_LIMITS.askBodyMaxBytes);
    expect(START_STEP_LIMITS.askBodyMaxBytes).toBeLessThan(1_048_576);
  });
});
