/**
 * V4 start step, Task 15 (spec 2026-11-03 §2.7, §4.3): each path's answer so far (its outcome), the gap round, the trust
 * word from the evidence, and the "+ N more to explore" list. A FAILED path has nothing; a READY one always has its text.
 * The trust word: no words → none; every word DIDNT_HOLD → DIDNT_HOLD; else the weakest of the rest (SURE > SURE_FOR_CASE
 * > STILL_ARGUED), the same rule for a path (from its points) and the main answer (from its paths).
 */
import { describe, expect, it } from "vitest";
import {
  PATH_RESULT_LIMITS, PathGapRoundSchema, PathOutcomeSchema, mainAnswerTrustWordOf, pathTrustWordOf, startMoreOf, type StartMenu,
  type TrustWord
} from "@debateai/contract";

const TEXT = { line: "Nuclear costs more than it saves within 20 years.", summary: "The costs come first; the savings much later.", fate: "HELD_UP" };
const READY = { state: "READY", text: TEXT, what_changed: ["The costs were checked against two sources."], view: null, trust: "SURE_FOR_CASE",
  rests_on: ["n1", "n2"] };
const FAILED = { state: "FAILED", text: null, what_changed: [], view: null, trust: null, rests_on: [] };
const path = (n: number) => ({ path_ref: `kp0${n}`, title: `Path ${n}`, question: `Question ${n}?`, viewpoint_ids: [`pt1${n}`], put_together: false, is_new: n === 3 });
const MENU = {
  menu_id: "AAAAAAAAAAAAAAAAAAAAAA", revision: 1, language: { code: "en", name: "English" },
  angles: [{ angle_id: "g1", kind: "GENERAL", label: "The whole picture" }],
  viewpoints: [1, 2, 3].map((n) => ({ viewpoint_id: `pt1${n}`, title: `Path ${n}`, question: `Question ${n}?`, why: "It matters.", angle_id: "g1", repeat_ids: [] })),
  repeats: [], paths: [1, 2, 3].map(path), cards: [], suggestions: []
} as StartMenu;

describe("a path's outcome", () => {
  it("has its text when ready, and nothing when it failed", () => {
    expect(PATH_RESULT_LIMITS).toEqual({ whatChangedMax: 3, restsOnMax: 120, gapPointsMax: 40, gapPointMaxChars: 400, moreMax: 54 });
    expect(PathOutcomeSchema.safeParse(READY).success).toBe(true);
    expect(PathOutcomeSchema.safeParse(FAILED).success).toBe(true);
    expect(PathOutcomeSchema.safeParse({ ...FAILED, text: TEXT }).success).toBe(false);
    expect(PathOutcomeSchema.safeParse({ ...READY, text: null }).success).toBe(false);
    expect(PathOutcomeSchema.safeParse({ ...READY, what_changed: ["a", "b", "c", "d"] }).success).toBe(false);
    expect(PathOutcomeSchema.safeParse({ ...READY, rests_on: Array.from({ length: 121 }, (_, i) => `n${i}`) }).success).toBe(false);
  });

  it("keeps the gap round's points to a path id or none, each at most 400 characters, at most 40", () => {
    expect(PathGapRoundSchema.safeParse({ points: [{ text: "What about storage?", path_id: "b2" }, { text: "Any other way?", path_id: null }] }).success).toBe(true);
    expect(PathGapRoundSchema.safeParse({ points: [{ text: "x", path_id: "b9" }] }).success).toBe(false);
    expect(PathGapRoundSchema.safeParse({ points: [{ text: "x".repeat(401), path_id: null }] }).success).toBe(false);
    expect(PathGapRoundSchema.safeParse({ points: Array.from({ length: 41 }, () => ({ text: "x", path_id: null })) }).success).toBe(false);
  });
});

describe("the trust word from the evidence", () => {
  it("takes the weakest word that held, or DIDNT_HOLD when nothing held", () => {
    const table: readonly (readonly [readonly (TrustWord | null)[], TrustWord | null])[] = [
      [[], null], [[null, null], null], [["SURE", "SURE"], "SURE"], [["SURE", "SURE_FOR_CASE"], "SURE_FOR_CASE"],
      [["SURE", "STILL_ARGUED", null], "STILL_ARGUED"], [["DIDNT_HOLD", "SURE"], "SURE"], [["DIDNT_HOLD", "DIDNT_HOLD"], "DIDNT_HOLD"],
      [["DIDNT_HOLD", "STILL_ARGUED"], "STILL_ARGUED"]
    ];
    for (const [words, expected] of table) {
      expect(pathTrustWordOf(words), JSON.stringify(words)).toBe(expected);
      expect(mainAnswerTrustWordOf(words), JSON.stringify(words)).toBe(expected);
    }
  });
});

describe("+ N more to explore", () => {
  it("lists the menu paths none of whose viewpoints was chosen, in menu order", () => {
    expect(startMoreOf(MENU, new Set(["pt11"])).map((item) => item.more_id)).toEqual(["more-kp02", "more-kp03"]);
    expect(startMoreOf(MENU, new Set(["pt11"]))[1]).toEqual({ more_id: "more-kp03", title: "Path 3", question: "Question 3?", is_new: true });
  });
});
