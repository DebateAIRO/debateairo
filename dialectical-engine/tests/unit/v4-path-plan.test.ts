import { describe, expect, it } from "vitest";

import {
  PATH_PLAN_LIMITS,
  combineMembersKey,
  cutText,
  isPersonPath,
  pathPlanChanged,
  pathPlanCombineFrees,
  pathPlanByArea,
  pathPlanCombineMembers,
  pathPlanDirections,
  pathPlanFromMenu,
  pathPlanFromPicks,
  pathPlanOwnWords,
  pathPlanReduce,
  pathPlanSuggestions,
  pathPlanToStartPaths,
  pathPlanWithRevision,
  type PathPlan,
  type PathPlanAction,
  type PathPlanResult,
  type PlanPath,
  type PlanViewpoint
} from "../../apps/ui/lib/v4/pathPlan.js";
import {
  SignedStartListSchema, SignedStartMenuSchema, START_STEP_LIMITS, StartCombineRequestSchema, StartMenuSchema, StartPathsSchema, type StartCard,
  type StartCombineMember
} from "../../packages/contract/src/index.js";
import {
  NUCLEAR_MENU, NUCLEAR_MENU_REV2, SIXTEEN_PATH_MENU, START_FIXTURE_QUESTION, TWO_PATH_MENU, signedList, signedMenu
} from "../support/v4-start-menu.js";

/*
 * V4 start step, Task 64 (spec 2026-11-03 §2 items 3, 5 and 6): the path plan is the list the person shapes on step 2
 * before Start. Here: the plan built from a menu or from a dig's picks, what Start sends, the selection, Remove, Move,
 * Undo, and How wide both ways:
 *  - choose-f22: fewer paths than How wide asks → all are in, "+ N more" is empty, the asked width stays;
 *  - choose-f8: widening takes the next ideas from "+ N more", each marked "Added when you widened"; narrowing folds
 *    them back from the bottom and never folds a path the person made or changed;
 *  - choose-d5: the plan says whether anything changed (How wide alone is not a change), so "Just answer it" can hide
 *    after the first change and come back when every change is undone.
 * Task 65 (spec §2 item 5: Combine with…, Split apart, the chips' ⋯, Rewrite): combining paths and chips, the AI's
 * combined words or the joined fallback, Split apart, moving and removing chips, Rewrite with "Rewrite it for me / Keep
 * my wording", and how many paths a combine frees. The words rule when a path's viewpoints change: the person's words
 * stay (and the page asks); one viewpoint left speaks in its own words; two to four are written again as one question.
 * Task 66 (spec §2 items 3-5; choose-f4, chat-start-waits-for-paths): the person's own path, "+ N more to explore", the
 * "Another way to see it" cards with "Make this my question", the one-tap suggestions, late merges (new ideas only ever
 * go under "+ N more", marked new; they never replace a path), the drawer's "Other directions" and "All, by area", and
 * the words the person wrote. A new path on a full list is never a dead end: it is refused (the page offers a path where
 * it fits, a swap or a wider list), and a swap sends the swapped path to the front of more.
 */

const keys = (paths: readonly PlanPath[]): string[] => paths.map((path) => path.key);
const pathOf = (plan: PathPlan, key: string): PlanPath => {
  const found = [...plan.paths, ...plan.more].find((path) => path.key === key);
  if (found === undefined) throw new Error(`no path ${key}`);
  return found;
};
const reduce = (plan: PathPlan, ...actions: Parameters<typeof pathPlanReduce>[1][]): PathPlanResult => {
  let result: PathPlanResult = { plan, refusal: null, folded: [], added: [] };
  for (const action of actions) result = pathPlanReduce(result.plan, action);
  return result;
};
const viewpointQuestion = (id: string): string => {
  const found = NUCLEAR_MENU.viewpoints.find((one) => one.viewpoint_id === id);
  if (found === undefined) throw new Error(`no viewpoint ${id}`);
  return found.question;
};
/** The person rewrote these paths in their own words (Task 65 builds REWRITE; here the plan is shaped by hand). */
const rewrittenByPerson = (plan: PathPlan, rewritten: readonly string[]): PathPlan => ({
  ...plan,
  paths: plan.paths.map((path) => rewritten.includes(path.key) ? { ...path, wording: "PERSON", question: `My own question about ${path.title}?` } : path)
});
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

describe("the shared fixture", () => {
  it("parses as the contract's menus and lists", () => {
    for (const menu of [NUCLEAR_MENU, NUCLEAR_MENU_REV2, TWO_PATH_MENU, SIXTEEN_PATH_MENU]) {
      expect(StartMenuSchema.safeParse(menu).error?.issues ?? []).toEqual([]);
    }
    expect(SignedStartMenuSchema.parse(signedMenu(NUCLEAR_MENU)).ref).toBe("menu1.sig");
    expect(signedMenu(NUCLEAR_MENU_REV2).ref).toBe("menu2.sig");
    for (const n of [1, 2, 3]) {
      const list = SignedStartListSchema.parse(signedList(n));
      expect(list.ref).toBe(`list${n}.sig`);
      expect(list.list.viewpoints.map((one) => [one.viewpoint_id, one.title])).toEqual([[`pt${n}1`, `List ${n} idea`]]);
    }
    expect(START_FIXTURE_QUESTION).toBe("Should Romania build new nuclear plants?");
    expect(NUCLEAR_MENU.paths.map((one) => one.path_ref)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05", "kp06", "kp07", "kp08", "kp09"]);
    expect(NUCLEAR_MENU_REV2.paths.at(-1)).toMatchObject({ path_ref: "kp10", title: "Cooling water in hot summers", is_new: true });
    expect(TWO_PATH_MENU.paths.map((one) => one.path_ref)).toEqual(["kp01", "kp02"]);
    expect(SIXTEEN_PATH_MENU.paths).toHaveLength(16);
  });
});

describe("PATH_PLAN_LIMITS", () => {
  it("are the start step's own limits", () => {
    expect(PATH_PLAN_LIMITS).toEqual({ viewpointsPerPathMax: 4, pathsMax: 7, freePathsMax: 3, ownTextMaxChars: 1000, titleMaxChars: 120, questionMaxChars: 1000 });
    expect(PATH_PLAN_LIMITS).toEqual({
      viewpointsPerPathMax: START_STEP_LIMITS.viewpointsPerPathMax, pathsMax: START_STEP_LIMITS.pathsMax,
      freePathsMax: START_STEP_LIMITS.freePathsMax, ownTextMaxChars: START_STEP_LIMITS.ownTextMaxChars,
      titleMaxChars: START_STEP_LIMITS.pathTitleMaxChars, questionMaxChars: START_STEP_LIMITS.pathQuestionMaxChars
    });
    expect(Object.isFrozen(PATH_PLAN_LIMITS)).toBe(true);
  });
});

describe("pathPlanFromMenu", () => {
  it("puts the first How wide paths in and the rest under more, most useful first", () => {
    const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    expect(keys(plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(keys(plan.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
    expect(plan).toMatchObject({ width: 5, freePlan: false, selected: [], undo: [], done: [], questionSwap: null, nextKey: 1 });
    expect(plan.cards.map((card) => card.card_id)).toEqual(["cd1", "cd2"]);
    expect(plan.suggestions.map((one) => one.suggestion_id)).toEqual(["sg1", "sg2", "sg3"]);
    expect(plan.seenPathRefs).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05", "kp06", "kp07", "kp08", "kp09"]);
    expect(plan.paths[0]).toEqual({
      key: "kp01", title: "Whole-system costs", question: viewpointQuestion("pt11"),
      viewpoints: [{ key: "pt11", source: { kind: "MENU", viewpointId: "pt11" }, title: "Whole-system costs", question: viewpointQuestion("pt11"), angleId: "g2" }],
      wording: "AI", combineRef: null, menuPathRef: "kp01", isNew: false, tag: null, askReword: false
    });
    const kp03 = pathOf(plan, "kp03");
    expect(kp03.tag).toBe("PUT_TOGETHER_BY_US");
    expect(kp03.viewpoints.map((one) => one.key)).toEqual(["pt14", "pt15"]);
    expect([...plan.paths, ...plan.more].filter((path) => path.tag !== null).map((path) => path.key)).toEqual(["kp03"]);
    expect(pathPlanChanged(plan)).toBe(false);
  });

  it("gives Free 3 paths whatever width it is asked for, and How wide cannot widen it", () => {
    for (const width of [3, 5, 7]) {
      const plan = pathPlanFromMenu(NUCLEAR_MENU, width, true);
      expect(plan.width).toBe(3);
      expect(keys(plan.paths)).toEqual(["kp01", "kp02", "kp03"]);
      expect(keys(plan.more)).toEqual(["kp04", "kp05", "kp06", "kp07", "kp08", "kp09"]);
    }
    const free = pathPlanFromMenu(NUCLEAR_MENU, 5, true);
    for (const width of [5, 7]) {
      const result = pathPlanReduce(free, { type: "SET_WIDTH", width });
      expect(result.plan).toBe(free);
      expect(result).toMatchObject({ refusal: null, folded: [], added: [] });
    }
  });

  it("takes every path of a menu with fewer than How wide, and keeps the asked width (choose-f22)", () => {
    const plan = pathPlanFromMenu(TWO_PATH_MENU, 5, false);
    expect(keys(plan.paths)).toEqual(["kp01", "kp02"]);
    expect(plan.more).toEqual([]);
    expect(plan.width).toBe(5);
    const wider = pathPlanReduce(plan, { type: "SET_WIDTH", width: 7 });
    expect(wider.added).toEqual([]);
    expect(keys(wider.plan.paths)).toEqual(["kp01", "kp02"]);
    expect(wider.plan.width).toBe(7);
    const narrower = pathPlanReduce(wider.plan, { type: "SET_WIDTH", width: 3 });
    expect(narrower).toMatchObject({ refusal: null, folded: [] });
    expect(keys(narrower.plan.paths)).toEqual(["kp01", "kp02"]);
    expect(narrower.plan.width).toBe(3);
  });

  it("refuses a width How wide never offers", () => {
    for (const width of [0, 8, 2.5, Number.NaN]) {
      expect(() => pathPlanFromMenu(NUCLEAR_MENU, width, false)).toThrow("PATH_PLAN_WIDTH_INVALID");
      expect(() => pathPlanReduce(pathPlanFromMenu(NUCLEAR_MENU, 5, false), { type: "SET_WIDTH", width })).toThrow("PATH_PLAN_WIDTH_INVALID");
    }
  });
});

describe("pathPlanToStartPaths", () => {
  it("sends each path's words and its viewpoints, and no combine reference the plan does not hold", () => {
    const sent = pathPlanToStartPaths(pathPlanFromMenu(NUCLEAR_MENU, 5, false));
    expect(sent).toHaveLength(5);
    expect(sent[0]).toEqual({ title: "Whole-system costs", question: viewpointQuestion("pt11"), members: [{ viewpoint_id: "pt11" }] });
    expect(sent[2]).toEqual({
      title: "Security and weapons risks", question: "Do imports and weapons risks make new plants less safe for Romania?",
      members: [{ viewpoint_id: "pt14" }, { viewpoint_id: "pt15" }]
    });
    for (const choice of sent) expect(choice).not.toHaveProperty("combine_ref");
    const paths = StartPathsSchema.safeParse({ source: "MENU", menu: signedMenu(NUCLEAR_MENU), paths: sent, width: 5, chosen_by: "PERSON" });
    expect(paths.error?.issues ?? []).toEqual([]);
  });

  it("sends a combined path's reference", () => {
    const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    const combined: PathPlan = { ...plan, paths: plan.paths.map((path) => path.key === "kp03" ? { ...path, wording: "COMBINED", combineRef: "cmb.sig" } : path) };
    expect(pathPlanToStartPaths(combined)[2]).toMatchObject({ combine_ref: "cmb.sig" });
  });
});

describe("pathPlanFromPicks", () => {
  const PICKS = [
    { pickNo: 1, title: "Seasonal lulls?", question: "What happens in the seasonal lulls of wind and sun?", own: false },
    { pickNo: 2, title: null, question: "I think the cost of waiting matters most.", own: true }
  ] as const;

  it("makes one path per pick, in pick order, each sending its pick number", () => {
    const plan = pathPlanFromPicks(PICKS, false);
    expect(pathPlanToStartPaths(plan).map((choice) => choice.members)).toEqual([[{ pick_no: 1 }], [{ pick_no: 2 }]]);
    expect(keys(plan.paths)).toEqual(["p1", "p2"]);
    expect(plan.paths.map((path) => path.viewpoints.map((one) => [one.key, one.source]))).toEqual([
      [["k1", { kind: "PICK", pickNo: 1 }]], [["k2", { kind: "PICK", pickNo: 2 }]]
    ]);
    expect(plan).toMatchObject({ more: [], width: 7, nextKey: 3, cards: [], suggestions: [], seenPathRefs: [] });
    expect(plan.paths[0]).toMatchObject({ title: "Seasonal lulls?", wording: "AI", tag: null, menuPathRef: null });
    expect(isPersonPath(plan.paths[0]!)).toBe(false);
  });

  it("keeps the person's own pick as theirs: their words, added by them", () => {
    const own = pathPlanFromPicks(PICKS, false).paths[1]!;
    expect(own).toMatchObject({ wording: "PERSON", tag: "ADDED_BY_YOU", title: "I think the cost of waiting matters most.",
      question: "I think the cost of waiting matters most." });
    expect(isPersonPath(own)).toBe(true);
    const paths = StartPathsSchema.safeParse({ source: "DIG_PICKS", paths: pathPlanToStartPaths(pathPlanFromPicks(PICKS, false)), width: 2, chosen_by: "PERSON" });
    expect(paths.error?.issues ?? []).toEqual([]);
  });

  it("gives Free its 3 paths and refuses picks it cannot hold", () => {
    expect(pathPlanFromPicks(PICKS, true).width).toBe(3);
    const four = [1, 2, 3, 4].map((pickNo) => ({ pickNo, title: `Pick ${pickNo}`, question: `Pick ${pickNo}?`, own: false }));
    expect(() => pathPlanFromPicks(four, true)).toThrow("PATH_PLAN_PICKS_INVALID");
    expect(() => pathPlanFromPicks([PICKS[0], PICKS[0]], false)).toThrow("PATH_PLAN_PICKS_INVALID");
    expect(() => pathPlanFromPicks([{ ...PICKS[0], pickNo: 17 }], false)).toThrow("PATH_PLAN_PICKS_INVALID");
  });
});

describe("the selection", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);

  it("picks paths and chips on the list, and is never an Undo step", () => {
    const one = pathPlanReduce(plan, { type: "SELECT", key: "kp01" });
    expect(one.plan.selected).toEqual(["kp01"]);
    const two = pathPlanReduce(one.plan, { type: "SELECT", key: "pt14" });
    expect(two.plan.selected).toEqual(["kp01", "pt14"]);
    expect(two.plan.undo).toEqual([]);
    expect(pathPlanChanged(two.plan)).toBe(false);
    expect(pathPlanReduce(two.plan, { type: "UNSELECT", key: "kp01" }).plan.selected).toEqual(["pt14"]);
    const cleared = pathPlanReduce(two.plan, { type: "CLEAR_SELECTION" });
    expect(cleared.plan.selected).toEqual([]);
    expect(cleared.plan.undo).toEqual([]);
  });

  it("answers the same plan when nothing would change", () => {
    const picked = pathPlanReduce(plan, { type: "SELECT", key: "kp01" }).plan;
    for (const [from, action] of [
      [picked, { type: "SELECT", key: "kp01" }],
      [plan, { type: "SELECT", key: "kp06" }],
      [plan, { type: "SELECT", key: "pt12" }],
      [plan, { type: "SELECT", key: "nope" }],
      [picked, { type: "UNSELECT", key: "kp02" }],
      [plan, { type: "CLEAR_SELECTION" }]
    ] as const) {
      const result = pathPlanReduce(from, action);
      expect(result.plan).toBe(from);
      expect(result).toMatchObject({ refusal: null, folded: [], added: [] });
    }
  });

  it("lets go of a removed path and of its chips", () => {
    const picked = reduce(plan, { type: "SELECT", key: "kp03" }, { type: "SELECT", key: "pt14" }, { type: "SELECT", key: "kp01" }).plan;
    expect(pathPlanReduce(picked, { type: "REMOVE", key: "kp03" }).plan.selected).toEqual(["kp01"]);
  });
});

describe("Remove, Move and Undo", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);

  it("puts a removed path at the front of more, and Undo brings it back", () => {
    const removed = pathPlanReduce(plan, { type: "REMOVE", key: "kp04" });
    expect(removed.refusal).toBeNull();
    expect(keys(removed.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp05"]);
    expect(keys(removed.plan.more)).toEqual(["kp04", "kp06", "kp07", "kp08", "kp09"]);
    expect(removed.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
    const undone = pathPlanReduce(removed.plan, { type: "UNDO" });
    expect(keys(undone.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(keys(undone.plan.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
    expect(undone.plan.undo).toEqual([]);
    expect(pathPlanReduce(undone.plan, { type: "UNDO" }).plan).toBe(undone.plan);
  });

  it("never removes the last path", () => {
    const one = pathPlanReduce(pathPlanFromMenu(TWO_PATH_MENU, 5, false), { type: "REMOVE", key: "kp01" }).plan;
    expect(keys(one.paths)).toEqual(["kp02"]);
    const last = pathPlanReduce(one, { type: "REMOVE", key: "kp02" });
    expect(last.refusal).toBe("LAST_PATH");
    expect(last.plan).toBe(one);
    expect(pathPlanReduce(plan, { type: "REMOVE", key: "kp06" }).plan).toBe(plan);
  });

  it("drops a removed path made only of the person's own words, and Undo brings it back", () => {
    const own: PlanPath = {
      key: "p1", title: "Fish?", question: "What would the plants do to the fish in the Danube?",
      viewpoints: [{ key: "o1", source: { kind: "OWN" }, title: null, question: "What would the plants do to the fish in the Danube?", angleId: null }],
      wording: "PERSON", combineRef: null, menuPathRef: null, isNew: false, tag: "ADDED_BY_YOU", askReword: false
    };
    const withOwn: PathPlan = { ...plan, paths: [...plan.paths.slice(0, 4), own], more: [plan.paths[4]!, ...plan.more], nextKey: 2 };
    expect(pathPlanToStartPaths(withOwn)[4]).toEqual({ title: "Fish?", question: own.question, members: [{ own_text: own.question }] });
    const removed = pathPlanReduce(withOwn, { type: "REMOVE", key: "p1" });
    expect(keys(removed.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04"]);
    expect(keys(removed.plan.more)).toEqual(["kp05", "kp06", "kp07", "kp08", "kp09"]);
    expect(keys(pathPlanReduce(removed.plan, { type: "UNDO" }).plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "p1"]);
  });

  it("moves a path to the top, as one Undo step", () => {
    const moved = pathPlanReduce(plan, { type: "MOVE", key: "kp03", to: 0 });
    expect(keys(moved.plan.paths)).toEqual(["kp03", "kp01", "kp02", "kp04", "kp05"]);
    expect(moved.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
    expect(keys(pathPlanReduce(moved.plan, { type: "UNDO" }).plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(keys(pathPlanReduce(plan, { type: "MOVE", key: "kp01", to: 9 }).plan.paths)).toEqual(["kp02", "kp03", "kp04", "kp05", "kp01"]);
    for (const action of [{ type: "MOVE", key: "kp02", to: 1 }, { type: "MOVE", key: "kp06", to: 0 }, { type: "MOVE", key: "kp02", to: 0.5 }] as const) {
      expect(pathPlanReduce(plan, action).plan).toBe(plan);
    }
  });
});

describe("How wide (choose-f8)", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);

  it("widening adds the next ideas from more, each marked added when you widened", () => {
    const wider = pathPlanReduce(plan, { type: "SET_WIDTH", width: 7 });
    expect(wider).toMatchObject({ refusal: null, folded: [], added: ["kp06", "kp07"] });
    expect(keys(wider.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05", "kp06", "kp07"]);
    expect(wider.plan.paths.slice(5).map((path) => path.tag)).toEqual(["ADDED_WHEN_WIDENED", "ADDED_WHEN_WIDENED"]);
    expect(keys(wider.plan.more)).toEqual(["kp08", "kp09"]);
    expect(wider.plan.width).toBe(7);
    expect(wider.plan.undo.map((step) => step.kind)).toEqual(["WIDTH"]);
  });

  it("narrowing folds them back from the bottom, without the mark, and Undo widens again", () => {
    const wider = pathPlanReduce(plan, { type: "SET_WIDTH", width: 7 }).plan;
    const back = pathPlanReduce(wider, { type: "SET_WIDTH", width: 5 });
    expect(back).toMatchObject({ refusal: null, folded: ["kp07", "kp06"], added: [] });
    expect(keys(back.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(keys(back.plan.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
    expect(back.plan.more.map((path) => path.tag)).toEqual([null, null, null, null]);
    expect(back.plan.width).toBe(5);
    const undone = pathPlanReduce(back.plan, { type: "UNDO" }).plan;
    expect(undone.width).toBe(7);
    expect(undone.paths.slice(5).map((path) => [path.key, path.tag])).toEqual([["kp06", "ADDED_WHEN_WIDENED"], ["kp07", "ADDED_WHEN_WIDENED"]]);
  });

  it("a path put together by us that came in by widening is put together by us again once folded", () => {
    const narrow = pathPlanReduce(plan, { type: "SET_WIDTH", width: 3 });
    expect(narrow.folded).toEqual(["kp05", "kp04"]);
    const removed = pathPlanReduce(narrow.plan, { type: "REMOVE", key: "kp03" }).plan;
    expect(keys(removed.more).slice(0, 3)).toEqual(["kp03", "kp04", "kp05"]);
    const wider = pathPlanReduce(removed, { type: "SET_WIDTH", width: 5 });
    expect(wider.added).toEqual(["kp03", "kp04", "kp05"]);
    expect(pathOf(wider.plan, "kp03").tag).toBe("ADDED_WHEN_WIDENED");
    const folded = pathPlanReduce(wider.plan, { type: "SET_WIDTH", width: 2 });
    expect(folded.folded).toEqual(["kp05", "kp04", "kp03"]);
    expect(keys(folded.plan.paths)).toEqual(["kp01", "kp02"]);
    expect(pathOf(folded.plan, "kp03").tag).toBe("PUT_TOGETHER_BY_US");
  });

  it("never folds a path the person changed, and says the list is full when only theirs are over", () => {
    const mine = rewrittenByPerson(plan, ["kp04", "kp05"]);
    const three = pathPlanReduce(mine, { type: "SET_WIDTH", width: 3 });
    expect(three).toMatchObject({ refusal: null, folded: ["kp03", "kp02"], added: [] });
    expect(keys(three.plan.paths)).toEqual(["kp01", "kp04", "kp05"]);
    expect(keys(three.plan.more)).toEqual(["kp02", "kp03", "kp06", "kp07", "kp08", "kp09"]);
    const two = pathPlanReduce(three.plan, { type: "SET_WIDTH", width: 2 });
    expect(two).toMatchObject({ refusal: null, folded: ["kp01"] });
    expect(keys(two.plan.paths)).toEqual(["kp04", "kp05"]);
    const full = pathPlanReduce(two.plan, { type: "SET_WIDTH", width: 1 });
    expect(full.refusal).toBe("PATHS_FULL");
    expect(full.plan).toBe(two.plan);
    expect(full).toMatchObject({ folded: [], added: [] });
  });

  it("keeps the person's own mark on a path of theirs that widening brings back", () => {
    const mine = rewrittenByPerson(plan, ["kp05"]);
    const combinedByYou: PathPlan = { ...mine, paths: mine.paths.map((path) => path.key === "kp04" ? { ...path, wording: "COMBINED", tag: "COMBINED_BY_YOU" } : path) };
    const removed = reduce(combinedByYou, { type: "REMOVE", key: "kp05" }, { type: "REMOVE", key: "kp04" }).plan;
    expect(keys(removed.more).slice(0, 2)).toEqual(["kp04", "kp05"]);
    const wider = pathPlanReduce(removed, { type: "SET_WIDTH", width: 7 });
    expect(wider.added).toEqual(["kp04", "kp05", "kp06", "kp07"]);
    expect(wider.plan.paths.slice(3).map((path) => [path.key, path.tag])).toEqual([
      ["kp04", "COMBINED_BY_YOU"], ["kp05", null], ["kp06", "ADDED_WHEN_WIDENED"], ["kp07", "ADDED_WHEN_WIDENED"]
    ]);
    expect(pathPlanReduce(wider.plan, { type: "SET_WIDTH", width: 5 }).folded).toEqual(["kp07", "kp06"]);
  });

  /* Review of Tasks 64-66: spec §2 item 5, "Narrowing folds those back first": the paths widening added, wherever they now are. */
  it("narrowing folds the paths widening added first, then the others from the bottom", () => {
    const wider = pathPlanReduce(plan, { type: "SET_WIDTH", width: 7 }).plan;
    const back = reduce(wider, { type: "REMOVE", key: "kp02" }, { type: "ADD_FROM_MORE", key: "kp02", intoPathKey: null }).plan;
    expect(keys(back.paths)).toEqual(["kp01", "kp03", "kp04", "kp05", "kp06", "kp07", "kp02"]);
    const five = pathPlanReduce(back, { type: "SET_WIDTH", width: 5 });
    expect(five).toMatchObject({ refusal: null, folded: ["kp07", "kp06"], added: [] });
    expect(keys(five.plan.paths)).toEqual(["kp01", "kp03", "kp04", "kp05", "kp02"]);
    expect(keys(five.plan.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
    expect(five.plan.more.map((path) => path.tag)).toEqual([null, null, null, null]);
    const three = pathPlanReduce(back, { type: "SET_WIDTH", width: 3 });
    expect(three.folded).toEqual(["kp07", "kp06", "kp02", "kp05"]);
    expect(keys(three.plan.paths)).toEqual(["kp01", "kp03", "kp04"]);
    const moved = pathPlanReduce(wider, { type: "MOVE", key: "kp07", to: 0 }).plan;
    const folded = pathPlanReduce(moved, { type: "SET_WIDTH", width: 5 });
    expect(folded.folded).toEqual(["kp06", "kp07"]);
    expect(keys(folded.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
  });

  it("a path widening added loses its mark when it is removed into more", () => {
    const wider = pathPlanReduce(plan, { type: "SET_WIDTH", width: 7 }).plan;
    const removed = pathPlanReduce(wider, { type: "REMOVE", key: "kp06" }).plan;
    expect(removed.more[0]).toMatchObject({ key: "kp06", tag: null });
  });
});

describe("pathPlanChanged (choose-d5)", () => {
  it("is true only while a change, not How wide alone, is on the Undo stack", () => {
    const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    expect(pathPlanChanged(plan)).toBe(false);
    const wider = pathPlanReduce(plan, { type: "SET_WIDTH", width: 7 }).plan;
    expect(pathPlanChanged(wider)).toBe(false);
    const removed = pathPlanReduce(wider, { type: "REMOVE", key: "kp02" }).plan;
    expect(pathPlanChanged(removed)).toBe(true);
    const undone = pathPlanReduce(removed, { type: "UNDO" }).plan;
    expect(pathPlanChanged(undone)).toBe(false);
    expect(undone.undo.map((step) => step.kind)).toEqual(["WIDTH"]);
  });
});

describe("combine members", () => {
  it("are a path's viewpoints as the combine call reads them, keyed whatever their order", () => {
    const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    const members = pathPlanCombineMembers(pathOf(plan, "kp03"));
    expect(members).toEqual([
      { viewpoint_id: "pt14", pick_no: null, title: "Imports of fuel and minerals", question: viewpointQuestion("pt14") },
      { viewpoint_id: "pt15", pick_no: null, title: "Weapons spread and sabotage", question: viewpointQuestion("pt15") }
    ]);
    expect(combineMembersKey([...members].reverse())).toBe(combineMembersKey(members));
    const pick: StartCombineMember = { viewpoint_id: null, pick_no: 2, title: "Seasonal lulls?", question: "What happens in the lulls?" };
    const own: StartCombineMember = { viewpoint_id: null, pick_no: null, title: null, question: "Fish?" };
    const key = combineMembersKey([members[1]!, pick, own, members[0]!]);
    expect(combineMembersKey([own, members[0]!, pick, members[1]!])).toBe(key);
    expect(key).toBe(JSON.stringify([
      { pick_no: null, question: "Fish?", title: null, viewpoint_id: null },
      { pick_no: 2, question: "What happens in the lulls?", title: "Seasonal lulls?", viewpoint_id: null },
      { pick_no: null, question: viewpointQuestion("pt14"), title: "Imports of fuel and minerals", viewpoint_id: "pt14" },
      { pick_no: null, question: viewpointQuestion("pt15"), title: "Weapons spread and sabotage", viewpoint_id: "pt15" }
    ]));
    expect(combineMembersKey(members)).not.toBe(combineMembersKey([members[0]!]));
  });
});

describe("cutText", () => {
  it("keeps text that fits and cuts the rest to at most max code units, ending in …", () => {
    expect(cutText("Whole-system costs", 18)).toBe("Whole-system costs");
    expect(cutText("Whole-system costs", 10)).toBe("Whole-sys…");
    expect(cutText("Whole-system costs", 1)).toBe("…");
    expect(cutText("", 5)).toBe("");
    for (let max = 1; max <= 40; max += 1) expect(cutText("Security and weapons risks, and the rest of it", max).length).toBeLessThanOrEqual(max);
  });

  it("never splits an emoji", () => {
    const emoji = "😀".repeat(5);
    expect(cutText(emoji, 5)).toBe("😀😀…");
    expect(cutText(emoji, 6)).toBe("😀😀…");
    expect(cutText(emoji, 7)).toBe("😀😀😀…");
    expect(cutText(emoji, 10)).toBe(emoji);
    for (let max = 1; max <= 12; max += 1) {
      const cut = cutText(`a${emoji}`, max);
      expect(cut.length).toBeLessThanOrEqual(max);
      expect(LONE_SURROGATE.test(cut)).toBe(false);
    }
  });
});

/* Task 65: combine, split, chips and rewrite. */

const menuChip = (id: string): PlanViewpoint => {
  const found = NUCLEAR_MENU.viewpoints.find((one) => one.viewpoint_id === id);
  if (found === undefined) throw new Error(`no viewpoint ${id}`);
  return { key: id, source: { kind: "MENU", viewpointId: id }, title: found.title, question: found.question, angleId: found.angle_id };
};
const chips = (path: PlanPath): string[] => path.viewpoints.map((one) => one.key);
const titleOf = (id: string): string => menuChip(id).title!;
const numbered = (...ids: string[]): string => ids.map((id, at) => `${at + 1}. ${viewpointQuestion(id)}`).join("\n");
const WRITTEN_WORDS = {
  title: "Costs and the hardest weeks", question: "What would new plants cost households, and would they keep the lights on in the hardest weeks?"
} as const;
const written = (key: string): PathPlanAction => ({ type: "COMBINE_WRITTEN", key, ...WRITTEN_WORDS, combineRef: "cmb.sig" });
const selectAll = (...selected: string[]): PathPlanAction[] => selected.map((key): PathPlanAction => ({ type: "SELECT", key }));
const sameObject = (plan: PathPlan, action: PathPlanAction): void => {
  const result = pathPlanReduce(plan, action);
  expect(result.plan).toBe(plan);
  expect(result).toMatchObject({ refusal: null, folded: [], added: [] });
};

describe("Combine (Task 65)", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
  const combined = (): PathPlanResult => reduce(plan, ...selectAll("kp01", "kp02"), { type: "COMBINE_SELECTED" });

  it("puts two paths together as one new path in the place of the first, joined until the AI writes it, as one Undo step", () => {
    const result = combined();
    expect(result).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(result.plan.paths)).toEqual(["p1", "kp03", "kp04", "kp05"]);
    expect(keys(result.plan.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
    expect(result.plan.paths[0]).toEqual({
      key: "p1", title: `${titleOf("pt11")} · ${titleOf("pt13")}`, question: numbered("pt11", "pt13"),
      viewpoints: [menuChip("pt11"), menuChip("pt13")],
      wording: "WRITING", combineRef: null, menuPathRef: null, isNew: false, tag: "COMBINED_BY_YOU", askReword: false
    });
    expect(result.plan.paths[0]!.title).toBe("Whole-system costs · A calm winter week");
    expect(result.plan.paths[0]!.question).toMatch(/^1\. What would new nuclear plants cost.*\n2\. What happens to Romania's power/u);
    expect(isPersonPath(result.plan.paths[0]!)).toBe(true);
    expect(result.plan).toMatchObject({ selected: [], nextKey: 2 });
    expect(result.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
    expect(pathPlanChanged(result.plan)).toBe(true);
    expect(pathPlanCombineMembers(result.plan.paths[0]!).map((member) => member.viewpoint_id)).toEqual(["pt11", "pt13"]);
    const undone = pathPlanReduce(result.plan, { type: "UNDO" }).plan;
    expect(keys(undone.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(undone.nextKey).toBe(2);
    expect(pathPlanChanged(undone)).toBe(false);
  });

  it("takes the AI's words when they are written and sends them with their reference; a combine result is no Undo step", () => {
    const result = pathPlanReduce(combined().plan, written("p1"));
    expect(result).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(result.plan.paths[0]).toMatchObject({ key: "p1", ...WRITTEN_WORDS, wording: "COMBINED", combineRef: "cmb.sig", tag: "COMBINED_BY_YOU" });
    expect(result.plan.undo).toHaveLength(1);
    const sent = pathPlanToStartPaths(result.plan);
    expect(sent[0]).toEqual({ ...WRITTEN_WORDS, members: [{ viewpoint_id: "pt11" }, { viewpoint_id: "pt13" }], combine_ref: "cmb.sig" });
    const paths = StartPathsSchema.safeParse({ source: "MENU", menu: signedMenu(NUCLEAR_MENU), paths: sent, width: 5, chosen_by: "PERSON" });
    expect(paths.error?.issues ?? []).toEqual([]);
    sameObject(result.plan, written("p1"));
    sameObject(result.plan, { type: "COMBINE_FAILED", key: "p1" });
    expect(keys(pathPlanReduce(result.plan, { type: "UNDO" }).plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
  });

  it("ignores an answer that comes after the combine was undone, and a new combine is a new path", () => {
    const undone = pathPlanReduce(combined().plan, { type: "UNDO" }).plan;
    sameObject(undone, written("p1"));
    sameObject(undone, { type: "COMBINE_FAILED", key: "p1" });
    const again = reduce(undone, ...selectAll("kp01", "kp02"), { type: "COMBINE_SELECTED" }).plan;
    expect(keys(again.paths)).toEqual(["p2", "kp03", "kp04", "kp05"]);
    sameObject(again, written("p1"));
    expect(pathPlanReduce(again, written("p2")).plan.paths[0]).toMatchObject({ key: "p2", wording: "COMBINED" });
    sameObject(pathPlanFromMenu(NUCLEAR_MENU, 5, false), written("kp03"));
  });

  it("keeps the joined words when no AI could write them (FALLBACK), and sends them without a reference", () => {
    const writing = combined().plan;
    const failed = pathPlanReduce(writing, { type: "COMBINE_FAILED", key: "p1" });
    expect(failed.refusal).toBeNull();
    expect(failed.plan.paths[0]).toMatchObject({
      key: "p1", wording: "FALLBACK", title: writing.paths[0]!.title, question: writing.paths[0]!.question, combineRef: null, tag: "COMBINED_BY_YOU"
    });
    expect(failed.plan.undo).toHaveLength(1);
    expect(pathPlanToStartPaths(failed.plan)[0]).not.toHaveProperty("combine_ref");
    sameObject(failed.plan, written("p1"));
  });

  it("lands an answer on the Undo steps that hold the same path, so undoing a later change keeps it", () => {
    const removed = pathPlanReduce(combined().plan, { type: "REMOVE", key: "kp05" }).plan;
    const answered = pathPlanReduce(removed, written("p1")).plan;
    expect(answered.undo).toHaveLength(2);
    const undone = pathPlanReduce(answered, { type: "UNDO" }).plan;
    expect(keys(undone.paths)).toEqual(["p1", "kp03", "kp04", "kp05"]);
    expect(undone.paths[0]).toMatchObject({ wording: "COMBINED", combineRef: "cmb.sig", ...WRITTEN_WORDS });
    const removedWhileWriting = pathPlanReduce(combined().plan, { type: "REMOVE", key: "p1" }).plan;
    expect(keys(removedWhileWriting.more)[0]).toBe("p1");
    expect(pathPlanReduce(removedWhileWriting, written("p1")).plan.more[0]).toMatchObject({ key: "p1", wording: "COMBINED" });
  });

  it("gives a path still being written a new key when its viewpoints change, so the answer for the old ones cannot land", () => {
    const writing = combined().plan;
    const moved = pathPlanReduce(writing, { type: "MOVE_CHIP", chipKey: "pt14", toPathKey: "p1" }).plan;
    expect(keys(moved.paths)).toEqual(["p2", "kp03", "kp04", "kp05"]);
    expect(moved.paths[0]).toMatchObject({ wording: "WRITING", title: "Whole-system costs · A calm winter week · Imports of fuel and minerals" });
    expect(chips(moved.paths[0]!)).toEqual(["pt11", "pt13", "pt14"]);
    expect(moved.nextKey).toBe(3);
    sameObject(moved, written("p1"));
    const back = pathPlanReduce(moved, { type: "UNDO" }).plan;
    expect(pathPlanReduce(back, written("p1")).plan.paths[0]).toMatchObject({ key: "p1", wording: "COMBINED" });
  });

  it("puts a path and a chip of another path together; the other path keeps the rest in its own words", () => {
    const result = reduce(plan, ...selectAll("kp01", "pt14"), { type: "COMBINE_SELECTED" });
    expect(result.refusal).toBeNull();
    expect(keys(result.plan.paths)).toEqual(["p1", "kp02", "kp03", "kp04", "kp05"]);
    expect(result.plan.paths[0]).toMatchObject({ title: "Whole-system costs · Imports of fuel and minerals", question: numbered("pt11", "pt14"), wording: "WRITING" });
    expect(chips(result.plan.paths[0]!)).toEqual(["pt11", "pt14"]);
    expect(pathOf(result.plan, "kp03")).toEqual({
      key: "kp03", title: titleOf("pt15"), question: viewpointQuestion("pt15"), viewpoints: [menuChip("pt15")],
      wording: "AI", combineRef: null, menuPathRef: "kp03", isNew: false, tag: null, askReword: false
    });
    expect(result.plan.undo).toHaveLength(1);
    const lone = reduce(plan, ...selectAll("pt22", "kp01"), { type: "COMBINE_SELECTED" }).plan;
    expect(keys(lone.paths)).toEqual(["p1", "kp02", "kp03", "kp04"]);
    expect(chips(lone.paths[0]!)).toEqual(["pt11", "pt22"]);
  });

  it("refuses more than four viewpoints in one path and changes nothing", () => {
    const four = reduce(plan, ...selectAll("kp01", "kp02", "kp03", "kp04")).plan;
    const full = pathPlanReduce(four, { type: "COMBINE_SELECTED" });
    expect(full).toMatchObject({ refusal: "VIEWPOINTS_FULL", folded: [], added: [] });
    expect(full.plan).toBe(four);
    const fits = reduce(plan, ...selectAll("kp01", "kp02", "kp03"), { type: "COMBINE_SELECTED" }).plan;
    expect(chips(fits.paths[0]!)).toEqual(["pt11", "pt13", "pt14", "pt15"]);
  });

  it("combines nothing without two parts to put together", () => {
    sameObject(plan, { type: "COMBINE_SELECTED" });
    sameObject(pathPlanReduce(plan, { type: "SELECT", key: "kp01" }).plan, { type: "COMBINE_SELECTED" });
    sameObject(reduce(plan, ...selectAll("kp03", "pt14")).plan, { type: "COMBINE_SELECTED" });
  });

  it("says how many paths combining what is picked frees", () => {
    expect(pathPlanCombineFrees(reduce(plan, ...selectAll("kp01", "kp02")).plan)).toBe(1);
    expect(pathPlanCombineFrees(reduce(plan, ...selectAll("kp01", "pt14")).plan)).toBe(0);
    expect(pathPlanCombineFrees(reduce(plan, ...selectAll("kp01", "kp02", "kp04")).plan)).toBe(2);
    expect(pathPlanCombineFrees(reduce(plan, ...selectAll("kp01", "pt22")).plan)).toBe(1);
    expect(pathPlanCombineFrees(plan)).toBe(0);
    expect(pathPlanCombineFrees(pathPlanReduce(plan, { type: "SELECT", key: "kp01" }).plan)).toBe(0);
    expect(pathPlanCombineFrees(reduce(plan, ...selectAll("kp01", "kp02", "kp03", "kp04")).plan)).toBe(0);
  });

  it("combines a dig's picks the same way, sending their pick numbers", () => {
    const picks = pathPlanFromPicks([1, 2, 3].map((pickNo) => ({ pickNo, title: `Pick ${pickNo}?`, question: `What about pick ${pickNo}?`, own: false })), false);
    const result = reduce(picks, ...selectAll("p1", "p2"), { type: "COMBINE_SELECTED" }, written("p4")).plan;
    expect(keys(result.paths)).toEqual(["p4", "p3"]);
    expect(pathPlanCombineMembers(result.paths[0]!).map((member) => member.pick_no)).toEqual([1, 2]);
    const sent = pathPlanToStartPaths(result);
    expect(sent[0]).toEqual({ ...WRITTEN_WORDS, members: [{ pick_no: 1 }, { pick_no: 2 }], combine_ref: "cmb.sig" });
    const paths = StartPathsSchema.safeParse({ source: "DIG_PICKS", paths: sent, width: 2, chosen_by: "PERSON" });
    expect(paths.error?.issues ?? []).toEqual([]);
  });

  /*
   * Review of Tasks 64-66: a dig's pick reaches the server as its text alone (DigPick has no title, and Start sends only
   * pick_no), so Task 33 reads a pick member as {viewpoint_id: null, pick_no, title: null, question: the text}. The
   * combine reference binds the hash of the members the combine call was given; a pick sent with its title would never
   * verify at Start, and the AI's combined words would be read as the person's own (PERSON_EDITED).
   */
  it("gives the combine call a dig's picks without their titles, as the server reads a pick at Start", () => {
    const picks = pathPlanFromPicks([
      { pickNo: 1, title: "Seasonal lulls?", question: "What happens in the seasonal lulls of wind and sun?", own: false },
      { pickNo: 2, title: "2030s gap?", question: "Is there a power gap in the 2030s?", own: false }
    ], false);
    const writing = reduce(picks, ...selectAll("p1", "p2"), { type: "COMBINE_SELECTED" }).plan;
    expect(writing.paths[0]!.title).toBe("Seasonal lulls? · 2030s gap?");
    expect(pathPlanCombineMembers(writing.paths[0]!)).toEqual([
      { viewpoint_id: null, pick_no: 1, title: null, question: "What happens in the seasonal lulls of wind and sun?" },
      { viewpoint_id: null, pick_no: 2, title: null, question: "Is there a power gap in the 2030s?" }
    ]);
  });
});

describe("Split apart (Task 65)", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);

  it("gives each viewpoint its own path in its place, folding the bottom path no one changed", () => {
    const split = pathPlanReduce(plan, { type: "SPLIT", key: "kp03" });
    expect(split).toMatchObject({ refusal: null, folded: ["kp05"], added: [] });
    expect(keys(split.plan.paths)).toEqual(["kp01", "kp02", "p1", "p2", "kp04"]);
    expect(keys(split.plan.more)).toEqual(["kp05", "kp06", "kp07", "kp08", "kp09"]);
    expect(split.plan.paths[2]).toEqual({
      key: "p1", title: titleOf("pt14"), question: viewpointQuestion("pt14"), viewpoints: [menuChip("pt14")],
      wording: "AI", combineRef: null, menuPathRef: null, isNew: false, tag: null, askReword: false
    });
    expect(split.plan.paths[3]).toMatchObject({ key: "p2", title: titleOf("pt15"), viewpoints: [menuChip("pt15")], wording: "AI", tag: null });
    expect(split.plan.nextKey).toBe(3);
    expect(split.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
    const undone = pathPlanReduce(split.plan, { type: "UNDO" }).plan;
    expect(keys(undone.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(keys(undone.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
  });

  it("folds nothing while the list has room", () => {
    const four = pathPlanReduce(plan, { type: "REMOVE", key: "kp05" }).plan;
    const split = pathPlanReduce(four, { type: "SPLIT", key: "kp03" });
    expect(split).toMatchObject({ refusal: null, folded: [] });
    expect(keys(split.plan.paths)).toEqual(["kp01", "kp02", "p1", "p2", "kp04"]);
  });

  it("splits a combined path back out", () => {
    const writing = reduce(plan, ...selectAll("kp01", "kp02"), { type: "COMBINE_SELECTED" }).plan;
    const split = pathPlanReduce(writing, { type: "SPLIT", key: "p1" });
    expect(split.folded).toEqual([]);
    expect(keys(split.plan.paths)).toEqual(["p2", "p3", "kp03", "kp04", "kp05"]);
    expect(split.plan.paths.slice(0, 2).map((path) => [chips(path), path.title, path.wording, path.tag])).toEqual([
      [["pt11"], "Whole-system costs", "AI", null], [["pt13"], "A calm winter week", "AI", null]
    ]);
    sameObject(split.plan, written("p1"));
  });

  it("folds only a path the AI wrote that is untagged or put together by us, never one widening added", () => {
    const wider = pathPlanReduce(plan, { type: "SET_WIDTH", width: 7 }).plan;
    const split = pathPlanReduce(wider, { type: "SPLIT", key: "kp03" });
    expect(split.folded).toEqual(["kp05"]);
    expect(keys(split.plan.paths)).toEqual(["kp01", "kp02", "p1", "p2", "kp04", "kp06", "kp07"]);
  });

  it("says the list is full when only paths the person made or changed could make room", () => {
    const mine = rewrittenByPerson(plan, ["kp01", "kp02", "kp04", "kp05"]);
    const full = pathPlanReduce(mine, { type: "SPLIT", key: "kp03" });
    expect(full).toMatchObject({ refusal: "PATHS_FULL", folded: [], added: [] });
    expect(full.plan).toBe(mine);
  });

  /* Review of Tasks 64-66: the fold skips the paths the split just made, even when they are the bottom ones. */
  it("never folds a piece the split just made, even at the bottom of the list", () => {
    const bottom = pathPlanReduce(plan, { type: "MOVE", key: "kp03", to: 4 }).plan;
    expect(keys(bottom.paths)).toEqual(["kp01", "kp02", "kp04", "kp05", "kp03"]);
    const split = pathPlanReduce(bottom, { type: "SPLIT", key: "kp03" });
    expect(split).toMatchObject({ refusal: null, folded: ["kp05"], added: [] });
    expect(keys(split.plan.paths)).toEqual(["kp01", "kp02", "kp04", "p1", "p2"]);
  });

  it("splits nothing that has one viewpoint or is not on the list", () => {
    for (const key of ["kp01", "kp06", "nope"]) sameObject(plan, { type: "SPLIT", key });
  });
});

describe("Chips (Task 65)", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);

  it("moves a chip into another path; both paths follow the words rule", () => {
    const moved = pathPlanReduce(plan, { type: "MOVE_CHIP", chipKey: "pt14", toPathKey: "kp01" });
    expect(moved).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(moved.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(moved.plan.paths[0]).toEqual({
      key: "kp01", title: "Whole-system costs · Imports of fuel and minerals", question: numbered("pt11", "pt14"),
      viewpoints: [menuChip("pt11"), menuChip("pt14")],
      wording: "WRITING", combineRef: null, menuPathRef: "kp01", isNew: false, tag: "COMBINED_BY_YOU", askReword: false
    });
    expect(pathOf(moved.plan, "kp03")).toMatchObject({ title: titleOf("pt15"), viewpoints: [menuChip("pt15")], wording: "AI", tag: null });
    expect(moved.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
    expect(keys(pathPlanReduce(moved.plan, { type: "UNDO" }).plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
  });

  it("drops a path whose last chip moves out", () => {
    const moved = pathPlanReduce(plan, { type: "MOVE_CHIP", chipKey: "pt22", toPathKey: "kp04" }).plan;
    expect(keys(moved.paths)).toEqual(["kp01", "kp02", "kp03", "kp04"]);
    expect(pathOf(moved, "kp04")).toMatchObject({ wording: "WRITING", tag: "COMBINED_BY_YOU" });
    expect(chips(pathOf(moved, "kp04"))).toEqual(["pt21", "pt22"]);
    expect(keys(moved.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
  });

  it("refuses a fifth viewpoint", () => {
    const four = reduce(plan, ...selectAll("kp01", "kp02", "kp03"), { type: "COMBINE_SELECTED" }).plan;
    const full = pathPlanReduce(four, { type: "MOVE_CHIP", chipKey: "pt21", toPathKey: "p1" });
    expect(full).toMatchObject({ refusal: "VIEWPOINTS_FULL", folded: [], added: [] });
    expect(full.plan).toBe(four);
  });

  it("makes a chip its own path under its path, folding the bottom path no one changed", () => {
    const own = pathPlanReduce(plan, { type: "MOVE_CHIP", chipKey: "pt14", toPathKey: "NEW" });
    expect(own).toMatchObject({ refusal: null, folded: ["kp05"], added: [] });
    expect(keys(own.plan.paths)).toEqual(["kp01", "kp02", "kp03", "p1", "kp04"]);
    expect(own.plan.paths[3]).toMatchObject({ title: titleOf("pt14"), viewpoints: [menuChip("pt14")], wording: "AI", tag: null, menuPathRef: null });
    expect(pathOf(own.plan, "kp03")).toMatchObject({ title: titleOf("pt15"), wording: "AI", tag: null });
    expect(keys(own.plan.more)).toEqual(["kp05", "kp06", "kp07", "kp08", "kp09"]);
    const mine = rewrittenByPerson(plan, ["kp01", "kp02", "kp04", "kp05"]);
    const full = pathPlanReduce(mine, { type: "MOVE_CHIP", chipKey: "pt14", toPathKey: "NEW" });
    expect(full.refusal).toBe("PATHS_FULL");
    expect(full.plan).toBe(mine);
  });

  /* Review of Tasks 64-66: the fold skips the chip's own new path and the path the chip left, even at the bottom. */
  it("never folds the chip's new path nor the path it left, even at the bottom of the list", () => {
    const bottom = pathPlanReduce(plan, { type: "MOVE", key: "kp03", to: 4 }).plan;
    const own = pathPlanReduce(bottom, { type: "MOVE_CHIP", chipKey: "pt14", toPathKey: "NEW" });
    expect(own).toMatchObject({ refusal: null, folded: ["kp05"], added: [] });
    expect(keys(own.plan.paths)).toEqual(["kp01", "kp02", "kp04", "kp03", "p1"]);
    expect(chips(pathOf(own.plan, "kp03"))).toEqual(["pt15"]);
  });

  it("moves nothing that would not change, or is not on the list", () => {
    for (const action of [
      { type: "MOVE_CHIP", chipKey: "pt11", toPathKey: "NEW" },
      { type: "MOVE_CHIP", chipKey: "pt14", toPathKey: "kp03" },
      { type: "MOVE_CHIP", chipKey: "pt12", toPathKey: "kp01" },
      { type: "MOVE_CHIP", chipKey: "pt14", toPathKey: "kp06" },
      { type: "MOVE_CHIP", chipKey: "nope", toPathKey: "kp01" }
    ] as const) sameObject(plan, action);
  });

  it("puts a removed chip under more as its own path, and Undo puts it back", () => {
    const removed = pathPlanReduce(plan, { type: "REMOVE", key: "pt14" });
    expect(removed).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(removed.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(pathOf(removed.plan, "kp03")).toMatchObject({ title: titleOf("pt15"), viewpoints: [menuChip("pt15")] });
    expect(keys(removed.plan.more)).toEqual(["p1", "kp06", "kp07", "kp08", "kp09"]);
    expect(removed.plan.more[0]).toMatchObject({ title: titleOf("pt14"), viewpoints: [menuChip("pt14")], wording: "AI", tag: null });
    const undone = pathPlanReduce(removed.plan, { type: "UNDO" }).plan;
    expect(chips(pathOf(undone, "kp03"))).toEqual(["pt14", "pt15"]);
    expect(keys(undone.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
    const lone = pathPlanReduce(plan, { type: "REMOVE", key: "pt11" }).plan;
    expect(keys(lone.paths)).toEqual(["kp02", "kp03", "kp04", "kp05"]);
    expect(lone.more[0]).toMatchObject({ key: "kp01", title: "Whole-system costs", wording: "AI" });
    const last = pathPlanFromMenu(TWO_PATH_MENU, 5, false);
    const one = pathPlanReduce(last, { type: "REMOVE", key: "kp01" }).plan;
    expect(pathPlanReduce(one, { type: "REMOVE", key: "pt13" })).toMatchObject({ refusal: "LAST_PATH", plan: one });
  });

  it("keeps the person's own words theirs: an own chip removed is dropped, one left alone is their path", () => {
    const ownChip: PlanViewpoint = { key: "o1", source: { kind: "OWN" }, title: null, question: "What would the plants do to the fish in the Danube?", angleId: null };
    const mixed: PlanPath = {
      key: "p1", title: "Joined", question: "1. …\n2. …", viewpoints: [menuChip("pt11"), ownChip],
      wording: "COMBINED", combineRef: "cmb.sig", menuPathRef: null, isNew: false, tag: "COMBINED_BY_YOU", askReword: false
    };
    const withOwn: PathPlan = { ...plan, paths: [mixed, ...plan.paths.slice(1)], more: [plan.paths[0]!, ...plan.more], nextKey: 2 };
    const droppedOwn = pathPlanReduce(withOwn, { type: "REMOVE", key: "o1" }).plan;
    expect(droppedOwn.paths[0]).toMatchObject({ key: "p1", title: "Whole-system costs", wording: "AI", tag: null, combineRef: null });
    expect(keys(droppedOwn.more)).toEqual(keys(withOwn.more));
    const leftAlone = pathPlanReduce(withOwn, { type: "REMOVE", key: "pt11" }).plan;
    expect(leftAlone.paths[0]).toMatchObject({
      key: "p1", title: ownChip.question, question: ownChip.question, viewpoints: [ownChip], wording: "PERSON", tag: "ADDED_BY_YOU", combineRef: null
    });
    expect(keys(leftAlone.more)).toEqual(["p2", ...keys(withOwn.more)]);
    expect(pathPlanToStartPaths(leftAlone)[0]).toEqual({ title: ownChip.question, question: ownChip.question, members: [{ own_text: ownChip.question }] });
  });

  it("moves the picked chips and paths into one path (no row sends it)", () => {
    const picked = reduce(plan, ...selectAll("pt14", "kp04")).plan;
    const moved = pathPlanReduce(picked, { type: "MOVE_SELECTED", toPathKey: "kp01" });
    expect(moved).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(moved.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp05"]);
    expect(chips(pathOf(moved.plan, "kp01"))).toEqual(["pt11", "pt14", "pt21"]);
    expect(pathOf(moved.plan, "kp01")).toMatchObject({ wording: "WRITING", tag: "COMBINED_BY_YOU", question: numbered("pt11", "pt14", "pt21") });
    expect(pathOf(moved.plan, "kp03")).toMatchObject({ title: titleOf("pt15"), wording: "AI" });
    expect(moved.plan.selected).toEqual([]);
    expect(moved.plan.undo).toHaveLength(1);
    const tooMany = reduce(plan, ...selectAll("kp03", "kp04", "kp05")).plan;
    expect(pathPlanReduce(tooMany, { type: "MOVE_SELECTED", toPathKey: "kp01" })).toMatchObject({ refusal: "VIEWPOINTS_FULL", plan: tooMany });
    sameObject(plan, { type: "MOVE_SELECTED", toPathKey: "kp01" });
    sameObject(pathPlanReduce(plan, { type: "SELECT", key: "kp01" }).plan, { type: "MOVE_SELECTED", toPathKey: "kp01" });
    sameObject(picked, { type: "MOVE_SELECTED", toPathKey: "kp06" });
  });
});

describe("Rewrite (Task 65)", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
  const MINE = "Would new plants make Romania's power bills higher or lower?";

  it("keeps the person's trimmed words, as one Undo step", () => {
    const result = pathPlanReduce(plan, { type: "REWRITE", key: "kp03", title: "  Bills  ", question: `  ${MINE}\n` });
    expect(result).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(result.plan.paths[2]).toMatchObject({ key: "kp03", title: "Bills", question: MINE, wording: "PERSON", tag: "PUT_TOGETHER_BY_US", askReword: false });
    expect(chips(result.plan.paths[2]!)).toEqual(["pt14", "pt15"]);
    expect(isPersonPath(result.plan.paths[2]!)).toBe(true);
    expect(result.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
    const titleKept = pathPlanReduce(plan, { type: "REWRITE", key: "kp01", question: MINE }).plan;
    expect(titleKept.paths[0]).toMatchObject({ title: "Whole-system costs", question: MINE, wording: "PERSON" });
    sameObject(plan, { type: "REWRITE", key: "kp01", question: ` ${viewpointQuestion("pt11")} ` });
    sameObject(plan, { type: "REWRITE", key: "kp06", question: MINE });
  });

  it("drops a combined path's reference once the person rewrites it", () => {
    const answered = reduce(plan, ...selectAll("kp01", "kp02"), { type: "COMBINE_SELECTED" }, written("p1")).plan;
    const mine = pathPlanReduce(answered, { type: "REWRITE", key: "p1", question: MINE }).plan;
    expect(mine.paths[0]).toMatchObject({ wording: "PERSON", combineRef: null, title: WRITTEN_WORDS.title, question: MINE });
    expect(pathPlanToStartPaths(mine)[0]).not.toHaveProperty("combine_ref");
    const whileWriting = reduce(plan, ...selectAll("kp01", "kp02"), { type: "COMBINE_SELECTED" }, { type: "REWRITE", key: "p1", question: MINE }).plan;
    sameObject(whileWriting, written("p1"));
  });

  /*
   * Review of Tasks 64-66: the combine call for p1 (pt11 and pt13) may still be running when the person rewrites p1. If
   * the rewritten path kept p1, a chip moved in and "Rewrite it for me" would make p1 WRITING again with other viewpoints,
   * and the late answer for pt11 and pt13 alone would land on it, with a reference the server cannot verify.
   */
  it("gives a path rewritten while it was being written a new key, so the answer for it can never land later", () => {
    const writing = reduce(plan, ...selectAll("kp01", "kp02"), { type: "COMBINE_SELECTED" }).plan;
    const mine = pathPlanReduce(writing, { type: "REWRITE", key: "p1", question: MINE }).plan;
    const key = mine.paths[0]!.key;
    const moved = pathPlanReduce(mine, { type: "MOVE_CHIP", chipKey: "pt14", toPathKey: key }).plan;
    const reworded = pathPlanReduce(moved, { type: "REWORD", key }).plan;
    expect(reworded.paths[0]).toMatchObject({ key, wording: "WRITING" });
    expect(chips(reworded.paths[0]!)).toEqual(["pt11", "pt13", "pt14"]);
    sameObject(reworded, written("p1"));
    expect(key).toBe("p2");
    expect(mine.paths[0]).toMatchObject({ wording: "PERSON", question: MINE, tag: "COMBINED_BY_YOU" });
    expect(mine.nextKey).toBe(3);
    const picked = reduce(writing, { type: "SELECT", key: "p1" }, { type: "REWRITE", key: "p1", question: MINE }).plan;
    expect(picked.selected).toEqual([]);
    const undone = pathPlanReduce(mine, { type: "UNDO" }).plan;
    expect(pathPlanReduce(undone, written("p1")).plan.paths[0]).toMatchObject({ key: "p1", wording: "COMBINED" });
  });

  it("keeps the person's words when the viewpoints change and asks; Keep my wording stops asking", () => {
    const mine = pathPlanReduce(plan, { type: "REWRITE", key: "kp01", question: MINE }).plan;
    const moved = pathPlanReduce(mine, { type: "MOVE_CHIP", chipKey: "pt14", toPathKey: "kp01" }).plan;
    expect(moved.paths[0]).toMatchObject({ key: "kp01", title: "Whole-system costs", question: MINE, wording: "PERSON", askReword: true });
    expect(chips(moved.paths[0]!)).toEqual(["pt11", "pt14"]);
    const kept = pathPlanReduce(moved, { type: "KEEP_WORDING", key: "kp01" }).plan;
    expect(kept.paths[0]).toMatchObject({ question: MINE, wording: "PERSON", askReword: false });
    expect(kept.undo).toHaveLength(3);
    expect(pathPlanReduce(kept, { type: "UNDO" }).plan.paths[0]).toMatchObject({ askReword: true });
    sameObject(kept, { type: "KEEP_WORDING", key: "kp01" });
    sameObject(kept, { type: "REWORD", key: "kp01" });
  });

  it("Rewrite it for me writes two or more viewpoints again, and gives one its own words", () => {
    const mine = pathPlanReduce(plan, { type: "REWRITE", key: "kp01", question: MINE }).plan;
    const moved = pathPlanReduce(mine, { type: "MOVE_CHIP", chipKey: "pt14", toPathKey: "kp01" }).plan;
    const reworded = pathPlanReduce(moved, { type: "REWORD", key: "kp01" });
    expect(reworded.refusal).toBeNull();
    expect(reworded.plan.paths[0]).toMatchObject({
      key: "kp01", title: "Whole-system costs · Imports of fuel and minerals", question: numbered("pt11", "pt14"),
      wording: "WRITING", tag: "COMBINED_BY_YOU", askReword: false, combineRef: null
    });
    expect(reworded.plan.undo).toHaveLength(3);
    const security = pathPlanReduce(plan, { type: "REWRITE", key: "kp03", question: MINE }).plan;
    const left = pathPlanReduce(security, { type: "MOVE_CHIP", chipKey: "pt14", toPathKey: "kp01" }).plan;
    expect(pathOf(left, "kp03")).toMatchObject({ question: MINE, wording: "PERSON", askReword: true, viewpoints: [menuChip("pt15")] });
    const own = pathPlanReduce(left, { type: "REWORD", key: "kp03" }).plan;
    expect(pathOf(own, "kp03")).toMatchObject({ title: titleOf("pt15"), question: viewpointQuestion("pt15"), wording: "AI", tag: null, askReword: false });
  });

  it("refuses empty words and words too long, and changes nothing", () => {
    for (const [action, refusal] of [
      [{ type: "REWRITE", key: "kp01", question: "   " }, "EMPTY"],
      [{ type: "REWRITE", key: "kp01", title: " \n ", question: MINE }, "EMPTY"],
      [{ type: "REWRITE", key: "kp01", question: "a".repeat(1001) }, "TOO_LONG"],
      [{ type: "REWRITE", key: "kp01", title: "a".repeat(121), question: MINE }, "TOO_LONG"]
    ] as const) {
      const result = pathPlanReduce(plan, action);
      expect(result).toMatchObject({ refusal, folded: [], added: [] });
      expect(result.plan).toBe(plan);
    }
    const longest = pathPlanReduce(plan, { type: "REWRITE", key: "kp01", title: "a".repeat(120), question: ` ${"a".repeat(1000)} ` });
    expect(longest.refusal).toBeNull();
    expect(longest.plan.paths[0]).toMatchObject({ title: "a".repeat(120), question: "a".repeat(1000) });
    expect(StartPathsSchema.safeParse({
      source: "MENU", menu: signedMenu(NUCLEAR_MENU), paths: pathPlanToStartPaths(longest.plan), width: 5, chosen_by: "PERSON"
    }).success).toBe(true);
  });
});

/* Task 66: own paths, "+ N more", the cards, the suggestions, late merges and the drawer's groups. */

const FISH = "What would the plants do to the fish in the Danube?";
const ownChip = (key: string, text: string): PlanViewpoint => ({ key, source: { kind: "OWN" }, title: null, question: text, angleId: null });
const cardOf = (id: string): StartCard => {
  const found = NUCLEAR_MENU.cards.find((card) => card.card_id === id);
  if (found === undefined) throw new Error(`no card ${id}`);
  return found;
};
const cardChip = (id: string): PlanViewpoint => {
  const card = cardOf(id);
  return { key: id, source: { kind: "MENU", viewpointId: id }, title: card.new_path.title, question: card.new_path.question, angleId: null };
};
/** What Start would send from this plan, checked as the contract checks it (an empty list: it passes). */
const sendIssues = (plan: PathPlan): unknown[] => StartPathsSchema.safeParse({
  source: "MENU", menu: signedMenu(NUCLEAR_MENU_REV2), paths: pathPlanToStartPaths(plan), width: plan.width, chosen_by: "PERSON"
}).error?.issues ?? [];
const ids = (suggestions: readonly { suggestion_id: string }[]): string[] => suggestions.map((one) => one.suggestion_id);
const refused = (plan: PathPlan, action: PathPlanAction, refusal: string): void => {
  const result = pathPlanReduce(plan, action);
  expect(result).toMatchObject({ refusal, folded: [], added: [] });
  expect(result.plan).toBe(plan);
};

describe("Your own path (Task 66)", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);

  it("is refused on a full list, and swapped for a path, which goes to the front of more", () => {
    refused(plan, { type: "ADD_OWN", text: FISH, intoPathKey: null }, "PATHS_FULL");
    const swapped = pathPlanReduce(plan, { type: "ADD_OWN", text: `  ${FISH}\n`, intoPathKey: null, swapWithKey: "kp05" });
    expect(swapped).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(swapped.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "p2"]);
    expect(swapped.plan.paths[4]).toEqual({
      key: "p2", title: FISH, question: FISH, viewpoints: [ownChip("o1", FISH)],
      wording: "PERSON", combineRef: null, menuPathRef: null, isNew: false, tag: "ADDED_BY_YOU", askReword: false
    });
    expect(pathPlanToStartPaths(swapped.plan)[4]).toEqual({ title: FISH, question: FISH, members: [{ own_text: FISH }] });
    expect(sendIssues(swapped.plan)).toEqual([]);
    expect(keys(swapped.plan.more)).toEqual(["kp05", "kp06", "kp07", "kp08", "kp09"]);
    expect(swapped.plan.nextKey).toBe(3);
    expect(isPersonPath(swapped.plan.paths[4]!)).toBe(true);
    expect(swapped.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
    expect(pathPlanChanged(swapped.plan)).toBe(true);
    const undone = pathPlanReduce(swapped.plan, { type: "UNDO" }).plan;
    expect(keys(undone.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(keys(undone.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
    sameObject(plan, { type: "ADD_OWN", text: FISH, intoPathKey: null, swapWithKey: "kp06" });
  });

  it("goes at the end while the list has room", () => {
    const four = pathPlanReduce(plan, { type: "REMOVE", key: "kp05" }).plan;
    const added = pathPlanReduce(four, { type: "ADD_OWN", text: FISH, intoPathKey: null });
    expect(added).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(added.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "p2"]);
    expect(keys(added.plan.more)).toEqual(keys(four.more));
    expect(added.plan.undo).toHaveLength(2);
  });

  it("goes into a path, which is written again as one question", () => {
    const into = pathPlanReduce(plan, { type: "ADD_OWN", text: FISH, intoPathKey: "kp04" });
    expect(into).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(into.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(pathOf(into.plan, "kp04")).toEqual({
      key: "kp04", title: `${titleOf("pt21")} · ${FISH}`, question: `1. ${viewpointQuestion("pt21")}\n2. ${FISH}`,
      viewpoints: [menuChip("pt21"), ownChip("o1", FISH)],
      wording: "WRITING", combineRef: null, menuPathRef: "kp04", isNew: false, tag: "COMBINED_BY_YOU", askReword: false
    });
    expect(pathPlanToStartPaths(into.plan)[3]!.members).toEqual([{ viewpoint_id: "pt21" }, { own_text: FISH }]);
    expect(pathPlanCombineMembers(pathOf(into.plan, "kp04"))[1]).toEqual({ viewpoint_id: null, pick_no: null, title: null, question: FISH });
    expect(into.plan.nextKey).toBe(2);
    expect(into.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
    const ignoringSwap = pathPlanReduce(plan, { type: "ADD_OWN", text: FISH, intoPathKey: "kp04", swapWithKey: "kp05" }).plan;
    expect(ignoringSwap.paths).toEqual(into.plan.paths);
    const four = reduce(plan, ...selectAll("kp01", "kp02", "kp03"), { type: "COMBINE_SELECTED" }).plan;
    refused(four, { type: "ADD_OWN", text: FISH, intoPathKey: "p1" }, "VIEWPOINTS_FULL");
    sameObject(plan, { type: "ADD_OWN", text: FISH, intoPathKey: "kp06" });
    sameObject(plan, { type: "ADD_OWN", text: FISH, intoPathKey: "nope" });
  });

  it("refuses empty words and words too long, counted in UTF-16 code units", () => {
    refused(plan, { type: "ADD_OWN", text: " \n ", intoPathKey: null, swapWithKey: "kp05" }, "EMPTY");
    refused(plan, { type: "ADD_OWN", text: "", intoPathKey: "kp04" }, "EMPTY");
    refused(plan, { type: "ADD_OWN", text: "😀".repeat(501), intoPathKey: null, swapWithKey: "kp05" }, "TOO_LONG");
    refused(plan, { type: "ADD_OWN", text: "a".repeat(1001), intoPathKey: "kp04" }, "TOO_LONG");
    const emoji = "😀".repeat(500);
    expect(emoji).toHaveLength(1000);
    const fits = pathPlanReduce(plan, { type: "ADD_OWN", text: ` ${emoji} `, intoPathKey: null, swapWithKey: "kp05" });
    expect(fits.refusal).toBeNull();
    const own = fits.plan.paths[4]!;
    expect(own.question).toBe(emoji);
    expect(own.title.length).toBeLessThanOrEqual(120);
    expect(LONE_SURROGATE.test(own.title)).toBe(false);
    expect(pathPlanToStartPaths(fits.plan)[4]!.members).toEqual([{ own_text: emoji }]);
    expect(sendIssues(fits.plan)).toEqual([]);
  });
});

describe("+ N more to explore (Task 66)", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);

  it("adds an idea from more to a path as a viewpoint, no extra path", () => {
    const into = pathPlanReduce(plan, { type: "ADD_FROM_MORE", key: "kp06", intoPathKey: "kp01" });
    expect(into).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(into.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(pathOf(into.plan, "kp01")).toMatchObject({
      title: "Whole-system costs · Falling prices", question: numbered("pt11", "pt12"), wording: "WRITING", tag: "COMBINED_BY_YOU", menuPathRef: "kp01"
    });
    expect(chips(pathOf(into.plan, "kp01"))).toEqual(["pt11", "pt12"]);
    expect(keys(into.plan.more)).toEqual(["kp07", "kp08", "kp09"]);
    expect(into.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
    expect(keys(pathPlanReduce(into.plan, { type: "UNDO" }).plan.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
  });

  it("is refused as its own path on a full list, and swapped for a path, which goes to the front of more", () => {
    refused(plan, { type: "ADD_FROM_MORE", key: "kp06", intoPathKey: null }, "PATHS_FULL");
    const swapped = pathPlanReduce(plan, { type: "ADD_FROM_MORE", key: "kp06", intoPathKey: null, swapWithKey: "kp02" });
    expect(swapped).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(swapped.plan.paths)).toEqual(["kp01", "kp06", "kp03", "kp04", "kp05"]);
    expect(swapped.plan.paths[1]).toBe(pathOf(plan, "kp06"));
    expect(keys(swapped.plan.more)).toEqual(["kp02", "kp07", "kp08", "kp09"]);
    expect(swapped.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
    expect(sendIssues(swapped.plan)).toEqual([]);
  });

  it("goes at the end while the list has room, keeping its marks", () => {
    const removed = pathPlanReduce(plan, { type: "REMOVE", key: "kp03" }).plan;
    expect(keys(removed.more)[0]).toBe("kp03");
    const back = pathPlanReduce(removed, { type: "ADD_FROM_MORE", key: "kp03", intoPathKey: null });
    expect(keys(back.plan.paths)).toEqual(["kp01", "kp02", "kp04", "kp05", "kp03"]);
    expect(pathOf(back.plan, "kp03").tag).toBe("PUT_TOGETHER_BY_US");
    expect(keys(back.plan.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
  });

  it("keeps a path the person made when another is swapped in for it, and can bring it back", () => {
    const mine = pathPlanReduce(plan, { type: "ADD_OWN", text: FISH, intoPathKey: null, swapWithKey: "kp05" }).plan;
    const swapped = pathPlanReduce(mine, { type: "ADD_FROM_MORE", key: "kp05", intoPathKey: null, swapWithKey: "p2" }).plan;
    expect(keys(swapped.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(swapped.more[0]).toMatchObject({ key: "p2", question: FISH, tag: "ADDED_BY_YOU", wording: "PERSON" });
    const back = pathPlanReduce(swapped, { type: "ADD_FROM_MORE", key: "p2", intoPathKey: null, swapWithKey: "kp05" }).plan;
    expect(keys(back.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "p2"]);
  });

  it("adds nothing that is not in more, nor into a path that is not on the list or is full", () => {
    sameObject(plan, { type: "ADD_FROM_MORE", key: "kp01", intoPathKey: null, swapWithKey: "kp02" });
    sameObject(plan, { type: "ADD_FROM_MORE", key: "nope", intoPathKey: "kp01" });
    sameObject(plan, { type: "ADD_FROM_MORE", key: "kp06", intoPathKey: "kp07" });
    sameObject(plan, { type: "ADD_FROM_MORE", key: "kp06", intoPathKey: null, swapWithKey: "kp07" });
    const four = reduce(plan, ...selectAll("kp01", "kp02", "kp03"), { type: "COMBINE_SELECTED" }).plan;
    refused(four, { type: "ADD_FROM_MORE", key: "kp06", intoPathKey: "p1" }, "VIEWPOINTS_FULL");
  });
});

describe("Another way to see it (Task 66)", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);

  it("adds a card to a path as a viewpoint (cd2), no extra path", () => {
    const into = pathPlanReduce(plan, { type: "USE_CARD", cardId: "cd2", intoPathKey: "kp01" });
    expect(into).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(into.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(pathOf(into.plan, "kp01")).toEqual({
      key: "kp01", title: "Whole-system costs · Cheaper storage", question: `1. ${viewpointQuestion("pt11")}\n2. ${cardOf("cd2").new_path.question}`,
      viewpoints: [menuChip("pt11"), cardChip("cd2")],
      wording: "WRITING", combineRef: null, menuPathRef: "kp01", isNew: false, tag: "COMBINED_BY_YOU", askReword: false
    });
    expect(pathPlanToStartPaths(into.plan)[0]!.members).toEqual([{ viewpoint_id: "pt11" }, { viewpoint_id: "cd2" }]);
    expect(sendIssues(into.plan)).toEqual([]);
    expect(into.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
  });

  it("is refused as its own path on a full list, goes at the end while there is room, and can be swapped in", () => {
    refused(plan, { type: "USE_CARD", cardId: "cd1", intoPathKey: null }, "PATHS_FULL");
    const four = pathPlanReduce(plan, { type: "REMOVE", key: "kp05" }).plan;
    const own = pathPlanReduce(four, { type: "USE_CARD", cardId: "cd1", intoPathKey: null });
    expect(own).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(own.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "p1"]);
    expect(own.plan.paths[4]).toEqual({
      key: "p1", title: "Running today's reactors longer", question: cardOf("cd1").new_path.question, viewpoints: [cardChip("cd1")],
      wording: "AI", combineRef: null, menuPathRef: null, isNew: false, tag: null, askReword: false
    });
    expect(pathPlanToStartPaths(own.plan)[4]!.members).toEqual([{ viewpoint_id: "cd1" }]);
    expect(isPersonPath(own.plan.paths[4]!)).toBe(false);
    expect(own.plan.nextKey).toBe(2);
    const swapped = pathPlanReduce(plan, { type: "USE_CARD", cardId: "cd1", intoPathKey: null, swapWithKey: "kp03" }).plan;
    expect(keys(swapped.paths)).toEqual(["kp01", "kp02", "p1", "kp04", "kp05"]);
    expect(keys(swapped.more)).toEqual(["kp03", "kp06", "kp07", "kp08", "kp09"]);
    expect(sendIssues(swapped)).toEqual([]);
  });

  it("uses a card once; one whose path waits in more comes back from there", () => {
    const four = pathPlanReduce(plan, { type: "REMOVE", key: "kp05" }).plan;
    const used = pathPlanReduce(four, { type: "USE_CARD", cardId: "cd1", intoPathKey: null }).plan;
    sameObject(used, { type: "USE_CARD", cardId: "cd1", intoPathKey: null });
    sameObject(used, { type: "USE_CARD", cardId: "cd1", intoPathKey: "kp01" });
    sameObject(plan, { type: "USE_CARD", cardId: "cd3", intoPathKey: null, swapWithKey: "kp05" });
    sameObject(plan, { type: "USE_CARD", cardId: "cd2", intoPathKey: "kp06" });
    const waiting = pathPlanReduce(used, { type: "REMOVE", key: "p1" }).plan;
    expect(keys(waiting.more)[0]).toBe("p1");
    const back = pathPlanReduce(waiting, { type: "USE_CARD", cardId: "cd1", intoPathKey: null }).plan;
    expect(keys(back.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "p1"]);
    expect(keys(back.more)).toEqual(keys(four.more));
    expect(back.nextKey).toBe(2);
  });
});

describe("Make this my question (Task 66)", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
  const Q = START_FIXTURE_QUESTION;
  const CD3: StartCard = {
    card_id: "cd3", kind: "OTHER_READING", sentence: "Another reading of your question: whether to keep any nuclear power at all.",
    new_path: { title: "Any nuclear power at all", question: "Should Romania keep any nuclear power at all?" }, fits_path_ref: null,
    as_question: "Should Romania keep any nuclear power at all?"
  };

  it("keeps the person's question as their own path at the top, folding the bottom path no one changed; Undo puts it back", () => {
    const swapped = pathPlanReduce(plan, { type: "MAKE_MY_QUESTION", cardId: "cd1", originalQuestion: Q });
    expect(swapped).toMatchObject({ refusal: null, folded: ["kp05"], added: [] });
    expect(swapped.plan.questionSwap).toEqual({ cardId: "cd1", question: cardOf("cd1").as_question, original: Q });
    expect(keys(swapped.plan.paths)).toEqual(["p2", "kp01", "kp02", "kp03", "kp04"]);
    expect(swapped.plan.paths[0]).toEqual({
      key: "p2", title: Q, question: Q, viewpoints: [ownChip("o1", Q)],
      wording: "PERSON", combineRef: null, menuPathRef: null, isNew: false, tag: "ADDED_BY_YOU", askReword: false
    });
    expect(pathPlanToStartPaths(swapped.plan)[0]!.members).toEqual([{ own_text: Q }]);
    expect(keys(swapped.plan.more)).toEqual(["kp05", "kp06", "kp07", "kp08", "kp09"]);
    expect(swapped.plan).toMatchObject({ nextKey: 3 });
    expect(swapped.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
    const undone = pathPlanReduce(swapped.plan, { type: "UNDO" }).plan;
    expect(undone.questionSwap).toBeNull();
    expect(keys(undone.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(keys(undone.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
  });

  it("does nothing for a card without a question, an unknown card, or the card already swapped", () => {
    sameObject(plan, { type: "MAKE_MY_QUESTION", cardId: "cd2", originalQuestion: Q });
    sameObject(plan, { type: "MAKE_MY_QUESTION", cardId: "cd3", originalQuestion: Q });
    const swapped = pathPlanReduce(plan, { type: "MAKE_MY_QUESTION", cardId: "cd1", originalQuestion: Q }).plan;
    sameObject(swapped, { type: "MAKE_MY_QUESTION", cardId: "cd1", originalQuestion: cardOf("cd1").as_question! });
  });

  it("folds nothing while the list has room, and says the list is full when only the person's paths could make room", () => {
    const four = pathPlanReduce(plan, { type: "REMOVE", key: "kp05" }).plan;
    const roomy = pathPlanReduce(four, { type: "MAKE_MY_QUESTION", cardId: "cd1", originalQuestion: Q });
    expect(roomy).toMatchObject({ refusal: null, folded: [] });
    expect(keys(roomy.plan.paths)).toEqual(["p2", "kp01", "kp02", "kp03", "kp04"]);
    const mine = rewrittenByPerson(plan, ["kp01", "kp02", "kp03", "kp04", "kp05"]);
    refused(mine, { type: "MAKE_MY_QUESTION", cardId: "cd1", originalQuestion: Q }, "PATHS_FULL");
    refused(plan, { type: "MAKE_MY_QUESTION", cardId: "cd1", originalQuestion: "  " }, "EMPTY");
    refused(plan, { type: "MAKE_MY_QUESTION", cardId: "cd1", originalQuestion: "a".repeat(1001) }, "TOO_LONG");
  });

  it("lets a second card's question take the first one's place, keeping the words the person first asked", () => {
    const withCd3: PathPlan = { ...plan, cards: [...plan.cards, CD3] };
    const first = pathPlanReduce(withCd3, { type: "MAKE_MY_QUESTION", cardId: "cd1", originalQuestion: Q }).plan;
    const second = pathPlanReduce(first, { type: "MAKE_MY_QUESTION", cardId: "cd3", originalQuestion: cardOf("cd1").as_question! });
    expect(second).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(second.plan.questionSwap).toEqual({ cardId: "cd3", question: CD3.as_question, original: Q });
    expect(second.plan.paths).toBe(first.paths);
    expect(second.plan.undo.map((step) => step.kind)).toEqual(["CHANGE", "CHANGE"]);
    expect(pathPlanReduce(second.plan, { type: "UNDO" }).plan.questionSwap).toEqual(first.questionSwap);
  });
});

describe("Suggestions (Task 66)", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);

  it("shows at most two that apply and are not done", () => {
    expect(ids(pathPlanSuggestions(plan))).toEqual(["sg1", "sg2"]);
    expect(ids(pathPlanSuggestions(pathPlanFromPicks([{ pickNo: 1, title: "Pick 1", question: "Pick 1?", own: false }], false)))).toEqual([]);
  });

  it("Combine puts the two paths together in the place of the first, as one Undo step", () => {
    const picked = pathPlanReduce(plan, { type: "SELECT", key: "kp05" }).plan;
    const combined = pathPlanReduce(picked, { type: "APPLY_SUGGESTION", suggestionId: "sg1" });
    expect(combined).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(combined.plan.paths)).toEqual(["kp01", "p1", "kp03", "kp05"]);
    expect(combined.plan.paths[1]).toMatchObject({
      title: `${titleOf("pt13")} · ${titleOf("pt21")}`, question: numbered("pt13", "pt21"), wording: "WRITING", tag: "COMBINED_BY_YOU"
    });
    expect(chips(combined.plan.paths[1]!)).toEqual(["pt13", "pt21"]);
    expect(combined.plan.selected).toEqual(["kp05"]);
    expect(combined.plan.done).toEqual(["sg1"]);
    expect(ids(pathPlanSuggestions(combined.plan))).toEqual(["sg2", "sg3"]);
    expect(combined.plan.undo.map((step) => step.kind)).toEqual(["CHANGE"]);
    const undone = pathPlanReduce(combined.plan, { type: "UNDO" }).plan;
    expect(keys(undone.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(undone.done).toEqual([]);
    expect(ids(pathPlanSuggestions(undone))).toEqual(["sg1", "sg2"]);
  });

  it("fits adds the idea to the path as a viewpoint, from more or from the list, no extra path", () => {
    const fits = pathPlanReduce(plan, { type: "APPLY_SUGGESTION", suggestionId: "sg2" });
    expect(fits).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(keys(fits.plan.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(chips(pathOf(fits.plan, "kp01"))).toEqual(["pt11", "pt12"]);
    expect(pathOf(fits.plan, "kp01")).toMatchObject({ wording: "WRITING", tag: "COMBINED_BY_YOU", menuPathRef: "kp01" });
    expect(keys(fits.plan.more)).toEqual(["kp07", "kp08", "kp09"]);
    expect(fits.plan.done).toEqual(["sg2"]);
    expect(fits.plan.undo).toHaveLength(1);
    const wider = pathPlanReduce(plan, { type: "SET_WIDTH", width: 7 }).plan;
    const onList = pathPlanReduce(wider, { type: "APPLY_SUGGESTION", suggestionId: "sg2" }).plan;
    expect(keys(onList.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05", "kp07"]);
    expect(chips(pathOf(onList, "kp01"))).toEqual(["pt11", "pt12"]);
    expect(keys(onList.more)).toEqual(["kp08", "kp09"]);
  });

  it("steps aside when dismissed or when it no longer applies", () => {
    const dismissed = pathPlanReduce(plan, { type: "DISMISS_SUGGESTION", suggestionId: "sg1" });
    expect(dismissed).toMatchObject({ refusal: null, folded: [], added: [] });
    expect(dismissed.plan.done).toEqual(["sg1"]);
    expect(ids(pathPlanSuggestions(dismissed.plan))).toEqual(["sg2", "sg3"]);
    expect(dismissed.plan.undo).toEqual([]);
    expect(pathPlanChanged(dismissed.plan)).toBe(false);
    sameObject(dismissed.plan, { type: "DISMISS_SUGGESTION", suggestionId: "sg1" });
    sameObject(dismissed.plan, { type: "APPLY_SUGGESTION", suggestionId: "sg1" });
    sameObject(plan, { type: "APPLY_SUGGESTION", suggestionId: "sg9" });
    sameObject(plan, { type: "DISMISS_SUGGESTION", suggestionId: "sg9" });
    const later = reduce(plan, { type: "REMOVE", key: "kp09" }, { type: "DISMISS_SUGGESTION", suggestionId: "sg1" }, { type: "UNDO" }).plan;
    expect(later.done).toEqual(["sg1"]);
    expect(ids(pathPlanSuggestions(later))).toEqual(["sg2", "sg3"]);
    const noKp04 = pathPlanReduce(plan, { type: "REMOVE", key: "kp04" }).plan;
    expect(ids(pathPlanSuggestions(noKp04))).toEqual(["sg2", "sg3"]);
    sameObject(noKp04, { type: "APPLY_SUGGESTION", suggestionId: "sg1" });
    const full = reduce(plan, { type: "REWRITE", key: "kp01", question: "Mine?" }, { type: "MOVE_CHIP", chipKey: "pt14", toPathKey: "kp01" },
      { type: "MOVE_CHIP", chipKey: "pt15", toPathKey: "kp01" }, { type: "MOVE_CHIP", chipKey: "pt21", toPathKey: "kp01" }).plan;
    expect(chips(pathOf(full, "kp01"))).toEqual(["pt11", "pt14", "pt15", "pt21"]);
    expect(ids(pathPlanSuggestions(full))).toEqual(["sg3"]);
    refused(full, { type: "APPLY_SUGGESTION", suggestionId: "sg2" }, "VIEWPOINTS_FULL");
  });
});

describe("Late merges (Task 66)", () => {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);

  it("put a revision's new paths at the end of more, marked new, never into the list, and add its new suggestions", () => {
    const four = pathPlanReduce(plan, { type: "REMOVE", key: "kp04" }).plan;
    const next = pathPlanWithRevision(four, NUCLEAR_MENU_REV2);
    expect(next.paths).toBe(four.paths);
    expect(keys(next.more)).toEqual(["kp04", "kp06", "kp07", "kp08", "kp09", "kp10"]);
    const pt31 = NUCLEAR_MENU_REV2.viewpoints.find((one) => one.viewpoint_id === "pt31")!;
    expect(pathOf(next, "kp10")).toEqual({
      key: "kp10", title: "Cooling water in hot summers", question: pt31.question,
      viewpoints: [{ key: "pt31", source: { kind: "MENU", viewpointId: "pt31" }, title: pt31.title, question: pt31.question, angleId: "g3" }],
      wording: "AI", combineRef: null, menuPathRef: "kp10", isNew: true, tag: null, askReword: false
    });
    expect(ids(next.suggestions)).toEqual(["sg1", "sg2", "sg3", "sg4"]);
    expect(next.seenPathRefs.at(-1)).toBe("kp10");
    expect(next.undo.map((step) => [step.kind, step.paths])).toEqual(four.undo.map((step) => [step.kind, step.paths]));
    expect(pathPlanChanged(next)).toBe(true);
    expect(pathPlanWithRevision(next, NUCLEAR_MENU_REV2)).toBe(next);
    expect(pathPlanWithRevision(plan, NUCLEAR_MENU)).toBe(plan);
    const undone = pathPlanReduce(next, { type: "UNDO" }).plan;
    expect(keys(undone.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(keys(undone.more)).toEqual(["kp06", "kp07", "kp08", "kp09", "kp10"]);
  });

  it("offer the new idea through its suggestion and How wide, like any idea in more", () => {
    const next = pathPlanWithRevision(plan, NUCLEAR_MENU_REV2);
    const fits = pathPlanReduce(next, { type: "APPLY_SUGGESTION", suggestionId: "sg4" }).plan;
    expect(chips(pathOf(fits, "kp02"))).toEqual(["pt13", "pt31"]);
    expect(keys(fits.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
    expect(sendIssues(fits)).toEqual([]);
    const wider = pathPlanReduce(next, { type: "SET_WIDTH", width: 7 }).plan;
    expect(keys(wider.more)).toEqual(["kp08", "kp09", "kp10"]);
    const looked = pathPlanReduce(wider, { type: "ADD_FROM_MORE", key: "kp10", intoPathKey: null, swapWithKey: "kp07" }).plan;
    expect(keys(looked.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05", "kp06", "kp10"]);
    expect(pathOf(looked, "kp10").isNew).toBe(true);
    expect(keys(looked.more)).toEqual(["kp07", "kp08", "kp09"]);
    expect(pathOf(looked, "kp07").tag).toBeNull();
  });
});

describe("The drawer's groups (Task 66)", () => {
  it("Other directions: for each area the list does not touch, the most useful idea from more", () => {
    const three = pathPlanFromMenu(NUCLEAR_MENU, 3, false);
    expect(pathPlanDirections(three, NUCLEAR_MENU.angles).map((one) => [one.angle.angle_id, one.path.key])).toEqual([["g1", "kp05"], ["g5", "kp04"]]);
    expect(pathPlanDirections(pathPlanFromMenu(NUCLEAR_MENU, 5, false), NUCLEAR_MENU.angles)).toEqual([]);
  });

  it("All, by area: more by the menu's angles, then what has no area of the menu's", () => {
    const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    const byArea = (one: PathPlan, angles = NUCLEAR_MENU.angles): unknown[] =>
      pathPlanByArea(one, angles).map((group) => [group.angle?.angle_id ?? null, keys(group.paths)]);
    expect(byArea(plan)).toEqual([["g1", ["kp07", "kp08"]], ["g2", ["kp06"]], ["g5", ["kp09"]]]);
    const mine = reduce(plan, { type: "ADD_OWN", text: FISH, intoPathKey: null, swapWithKey: "kp05" },
      { type: "ADD_FROM_MORE", key: "kp05", intoPathKey: null, swapWithKey: "p2" }).plan;
    expect(byArea(mine)).toEqual([["g1", ["kp07", "kp08"]], ["g2", ["kp06"]], ["g5", ["kp09"]], [null, ["p2"]]]);
    expect(byArea(plan, NUCLEAR_MENU.angles.filter((angle) => angle.angle_id !== "g5"))).toEqual([["g1", ["kp07", "kp08"]], ["g2", ["kp06"]], [null, ["kp09"]]]);
  });
});

describe("pathPlanOwnWords (Task 66)", () => {
  it("are the words the person wrote on the list, once each, in list order", () => {
    const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    expect(pathPlanOwnWords(plan)).toEqual([]);
    const mine = reduce(plan, { type: "REWRITE", key: "kp01", question: "Mine?" }, { type: "ADD_OWN", text: "Fish?", intoPathKey: null, swapWithKey: "kp05" }).plan;
    expect(pathPlanOwnWords(mine)).toEqual(["Whole-system costs", "Mine?", "Fish?"]);
    const eels = pathPlanReduce(mine, { type: "ADD_OWN", text: "Eels?", intoPathKey: "kp04" }).plan;
    expect(pathPlanOwnWords(eels)).toEqual(["Whole-system costs", "Mine?", "Eels?", "Fish?"]);
  });
});

describe("pathPlanReduce (Task 66)", () => {
  it("builds every action and refuses one it does not know", () => {
    const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    expect(() => pathPlanReduce(plan, { type: "NOPE" } as unknown as PathPlanAction)).toThrow("PATH_PLAN_ACTION_INVALID");
  });
});

/*
 * Task 92a (owner, 4 Nov, AI instructions batch 1): the merges no longer say "of at most four", so the menu may hold a path the AI
 * put together of five or more. The page takes it whole ("put together by us · Split"), sends it whole at Start, and when one
 * viewpoint is taken out the rest stay joined and the AI writes them again (the combine takes up to 54 points). What the person
 * puts together themselves stays four until Task 92c's answer.
 */
describe("a merged path of any size (Task 92a)", () => {
  const SIX_IDS = ["pt11", "pt12", "pt13", "pt14", "pt15", "pt21"];
  const SIX_MENU = {
    ...NUCLEAR_MENU,
    paths: [
      { path_ref: "kp01", title: "Costs, supply and security", question: "What would new plants cost, and could Romania supply and guard them?",
        viewpoint_ids: SIX_IDS, put_together: true, is_new: false },
      ...NUCLEAR_MENU.paths.filter((path) => path.viewpoint_ids.every((id) => !SIX_IDS.includes(id)))
    ],
    suggestions: []
  };

  it("a merged path of six comes in whole and goes out whole; one taken out is written again", () => {
    expect(StartMenuSchema.safeParse(SIX_MENU).error?.issues ?? []).toEqual([]);
    const plan = pathPlanFromMenu(SIX_MENU, 5, false);
    const six = pathOf(plan, "kp01");
    expect(six.viewpoints.map((viewpoint) => viewpoint.key)).toEqual(SIX_IDS);
    expect(six.tag).toBe("PUT_TOGETHER_BY_US");
    const sent = pathPlanToStartPaths(plan);
    expect(sent[0]!.members).toEqual(SIX_IDS.map((viewpoint_id) => ({ viewpoint_id })));
    expect(StartPathsSchema.safeParse({ source: "MENU", menu: signedMenu(SIX_MENU), paths: sent, width: 5, chosen_by: "PERSON" }).error?.issues ?? [])
      .toEqual([]);
    // A chip's Remove: the five left stay joined, to be written again by the AI.
    const five = pathOf(pathPlanReduce(plan, { type: "REMOVE", key: "pt21" }).plan, "kp01");
    expect(five.viewpoints.map((viewpoint) => viewpoint.key)).toEqual(SIX_IDS.slice(0, 5));
    expect(five.wording).toBe("WRITING");
    const combine = { context: { kind: "MENU", question_line: START_FIXTURE_QUESTION, check_ref: "check1.sig", menu_id: SIX_MENU.menu_id },
      reading_level: "plain", members: pathPlanCombineMembers(five) };
    expect(StartCombineRequestSchema.safeParse(combine).error?.issues ?? []).toEqual([]);
    // Combining it with another path is still the person's four (Task 92c asks the owner).
    expect(keys(plan.paths)).toEqual(["kp01", "kp05", "kp07", "kp08", "kp09"]);
    const picked = reduce(plan, { type: "SELECT", key: "kp01" }, { type: "SELECT", key: "kp05" }).plan;
    expect(pathPlanReduce(picked, { type: "COMBINE_SELECTED" })).toMatchObject({ refusal: "VIEWPOINTS_FULL", plan: picked });
    expect(PATH_PLAN_LIMITS).toEqual({ viewpointsPerPathMax: 4, pathsMax: 7, freePathsMax: 3, ownTextMaxChars: 1000, titleMaxChars: 120, questionMaxChars: 1000 });
  });
});
