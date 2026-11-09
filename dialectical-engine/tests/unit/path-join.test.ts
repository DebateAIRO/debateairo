import { describe, expect, it } from "vitest";

import { cutPathText, joinedPathWords } from "../../packages/kernel/src/index.js";
import { pathPlanFromMenu, pathPlanReduce, type PathPlanAction, type PlanPath } from "../../apps/ui/lib/v4/pathPlan.js";
import type { StartMenu } from "../../packages/contract/src/index.js";
import { NUCLEAR_MENU } from "../support/v4-start-menu.js";

/*
 * V4 start step, Task 33b (spec 2026-11-03 §7 "A path you added or rewrote is your own words"; the coordinator's ruling
 * of 5 Nov on Task 63's review) — THE ONE JOIN. When no AI writes one question for two to four viewpoints put together
 * (the combine failed, or Start sends a path still being written), the page shows their titles joined with " · " and
 * their questions numbered. The page and the server make those words with the one function, joinedPathWords, so the
 * server can recompute them from the signed menu's own texts and store them as the AIs' words. Here: the words it makes,
 * byte for byte as the page's fallback showed them before the join moved to the kernel, in Latin, CJK and right-to-left
 * texts, and the page's fallback made by it. Every text here is made up.
 */

const LATIN = [
  { title: "Whole-system costs", question: "What would new nuclear plants cost households once the whole power system is counted?" },
  { title: "A calm winter week", question: "What happens to Romania's power in a cold winter week with little wind or sun?" }
] as const;
/** Chinese, Arabic, Japanese and Hebrew: two of them written right to left. */
const WORLD = [
  { title: "能源成本", question: "新建核电站会让家庭的电费上涨多少？" },
  { title: "تكلفة الطاقة", question: "هل ستزيد المحطات الجديدة فواتير الكهرباء؟" },
  { title: "電力の安定", question: "寒い冬の週に電力は足りるのか？" },
  { title: "ביטחון האספקה", question: "האם המדינה תהיה תלויה בדלק מיובא?" }
] as const;
/** Four titles that join past 120 UTF-16 code units, the cut falling among emoji (two code units each). */
const LONG_TITLES = [
  { title: "A".repeat(50), question: "First?" },
  { title: "B".repeat(50), question: "Second?" },
  { title: "😀".repeat(20), question: "Third?" },
  { title: "C", question: "Fourth?" }
] as const;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

/** The nuclear menu with pt11, pt13, pt14 and pt15 (kp01, kp02 and kp03's viewpoints, in that order) in other words. */
const menuWith = (words: readonly Readonly<{ title: string; question: string }>[]): StartMenu => {
  const ids = ["pt11", "pt13", "pt14", "pt15"];
  return { ...NUCLEAR_MENU, viewpoints: NUCLEAR_MENU.viewpoints.map((one) => {
    const at = ids.indexOf(one.viewpoint_id);
    return at < 0 || words[at] === undefined ? one : { ...one, ...words[at] };
  }) };
};
/** The page's path for the picked menu paths put together: still being written, then after the AI could not write it. */
const pagePaths = (menu: StartMenu, ...picked: string[]): Readonly<{ writing: PlanPath; fallback: PlanPath }> => {
  const actions: PathPlanAction[] = [...picked.map((key): PathPlanAction => ({ type: "SELECT", key })), { type: "COMBINE_SELECTED" }];
  let plan = pathPlanFromMenu(menu, 5, false);
  for (const action of actions) plan = pathPlanReduce(plan, action).plan;
  const writing = plan.paths[0]!;
  return { writing, fallback: pathPlanReduce(plan, { type: "COMBINE_FAILED", key: writing.key }).plan.paths[0]! };
};

describe("joinedPathWords: the words the page shows for viewpoints no AI has written as one (Task 33b)", () => {
  it("two viewpoints: the titles joined with ' · ', the questions numbered one per line", () => {
    expect(joinedPathWords(LATIN)).toEqual({
      title: "Whole-system costs · A calm winter week",
      question: "1. What would new nuclear plants cost households once the whole power system is counted?\n"
        + "2. What happens to Romania's power in a cold winter week with little wind or sun?"
    });
  });

  it("four viewpoints in Chinese, Arabic, Japanese and Hebrew: the same join, byte for byte, in the viewpoints' order", () => {
    expect(joinedPathWords(WORLD)).toEqual({
      title: "能源成本 · تكلفة الطاقة · 電力の安定 · ביטחון האספקה",
      question: "1. 新建核电站会让家庭的电费上涨多少？\n2. هل ستزيد المحطات الجديدة فواتير الكهرباء؟\n3. 寒い冬の週に電力は足りるのか？\n"
        + "4. האם המדינה תהיה תלויה בדלק מיובא?"
    });
  });

  it("cuts the title at 120 and the question at 1000 UTF-16 code units with '…', never inside an emoji", () => {
    const cut = joinedPathWords(LONG_TITLES);
    expect(cut.title).toBe(`${"A".repeat(50)} · ${"B".repeat(50)} · ${"😀".repeat(6)}…`);
    expect(cut.title).toHaveLength(119);
    expect(LONE_SURROGATE.test(cut.title)).toBe(false);
    expect(cut.question).toBe("1. First?\n2. Second?\n3. Third?\n4. Fourth?");
    const long = joinedPathWords(["a", "b", "c", "d"].map((letter) => ({ title: letter, question: letter.repeat(300) })));
    expect(long.question).toBe(`1. ${"a".repeat(300)}\n2. ${"b".repeat(300)}\n3. ${"c".repeat(300)}\n4. ${"d".repeat(84)}…`);
    expect(long.question).toHaveLength(1000);
  });

  it("the cut is the page's: a text that fits stays whole, else whole code points and '…'", () => {
    expect(cutPathText("Whole-system costs", 18)).toBe("Whole-system costs");
    expect(cutPathText("Whole-system costs", 10)).toBe("Whole-sys…");
    expect(cutPathText("😀😀😀😀", 6)).toBe("😀😀…");
  });
});

describe("the page's joined fallback is made by joinedPathWords (Task 33b)", () => {
  it("two Latin viewpoints: the path being written and the fallback both read joinedPathWords of their viewpoints", () => {
    const { writing, fallback } = pagePaths(NUCLEAR_MENU, "kp01", "kp02");
    expect(writing.viewpoints.map((one) => one.key)).toEqual(["pt11", "pt13"]);
    expect({ title: writing.title, question: writing.question }).toEqual(joinedPathWords(LATIN));
    expect(fallback).toMatchObject({ wording: "FALLBACK", combineRef: null, ...joinedPathWords(LATIN) });
  });

  it("four viewpoints in Chinese, Arabic, Japanese and Hebrew", () => {
    const { writing, fallback } = pagePaths(menuWith(WORLD), "kp01", "kp02", "kp03");
    expect(writing.viewpoints.map((one) => one.key)).toEqual(["pt11", "pt13", "pt14", "pt15"]);
    expect(fallback).toMatchObject({ wording: "FALLBACK", combineRef: null, ...joinedPathWords(WORLD) });
  });

  it("four titles cut among emoji", () => {
    const { fallback } = pagePaths(menuWith(LONG_TITLES), "kp01", "kp02", "kp03");
    expect(fallback).toMatchObject({ wording: "FALLBACK", ...joinedPathWords(LONG_TITLES) });
    expect(fallback.title).toBe(`${"A".repeat(50)} · ${"B".repeat(50)} · ${"😀".repeat(6)}…`);
  });
});
