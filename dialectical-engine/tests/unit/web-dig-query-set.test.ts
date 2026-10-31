// tests/unit/web-dig-query-set.test.ts
// W4-2 and R22 decision 9 (the planner alone writes a dig's searches, 0 to 4 per chosen path): the dig's frozen query set.
// Side `dig`, no for-and-against pair needed, W1-2's personal-data guard on every search, the look-back date from each pick's
// pace; a local search with its language and country; every other shape refused by a typed code.
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { freezeDigQuerySet, type PlannedDigPick } from "../../packages/evidence/src/web-dig-query-set.js";

const AS_OF = new Date("2026-10-31T09:00:00Z");
const context = (pickIds: readonly string[] = ["1", "2", "3"], questionLanguage: string | null = null) => ({ pickIds, pathId: "a1", asOf: AS_OF, questionLanguage });
const search = (pickId: string, text: string, pace: PlannedDigPick["pace"] = "NORMAL"): PlannedDigPick =>
  ({ pickId, pace, country: null, searches: [{ scope: "ENGLISH", polarity: "SUPPORTING", text }] });
const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (error instanceof TypedDomainError) return error.code;
    throw error;
  }
  return "NO_ERROR";
};

describe("the dig's frozen query set", () => {
  it("in pick order, side dig, English with no country, kept under the dig's path, each named by its pick and place", () => {
    const set = freezeDigQuerySet([
      search("2", "Munich one-bedroom rent average 2026 report"),
      search("1", "nurse net salary Germany statistics", "FAST"),
      search("3", "cost of living Munich compared with Cluj study", "SLOW")
    ], context());
    expect(set.searches.map((entry) => [entry.pickId, entry.side, entry.scope, entry.language, entry.country, entry.pathId]))
      .toEqual([["1", "dig", "ENGLISH", "en", null, "a1"], ["2", "dig", "ENGLISH", "en", null, "a1"], ["3", "dig", "ENGLISH", "en", null, "a1"]]);
    expect(set.searches.map((entry) => entry.searchId)).toEqual(["a1:DIG:1:1", "a1:DIG:2:1", "a1:DIG:3:1"]);
    expect(set.searches.every((entry) => entry.status === "SEND")).toBe(true);
    expect(set.pathId).toBe("a1");
  });

  it("a pick may send none, or one, or 4; a pick with no plan sends none and holds back no other; 5 is refused", () => {
    const words = ["alpha report", "beta statistic", "gamma study", "delta law", "epsilon event"];
    const many = (count: number): PlannedDigPick => ({ pickId: "1", pace: "NORMAL", country: "RO", searches: words.slice(0, count).map((text, at) => ({
      scope: at < 2 ? "ENGLISH" as const : "LOCAL" as const, polarity: at % 2 === 0 ? "SUPPORTING" as const : "DISCONFIRMING" as const, text })) });
    expect(freezeDigQuerySet([], context(["1"])).searches).toEqual([]);
    expect(freezeDigQuerySet([{ pickId: "1", pace: null, country: null, searches: [] }], context(["1"])).searches).toEqual([]);
    expect(freezeDigQuerySet([search("2", "rent report")], context(["1", "2"])).searches.map((entry) => entry.pickId)).toEqual(["2"]);
    expect(freezeDigQuerySet([many(4)], context(["1"], "ro")).searches).toHaveLength(4);
    expect(codeOf(() => freezeDigQuerySet([many(5)], context(["1"], "ro")))).toBe("DIG_PLAN_SEARCH_COUNT_INVALID");
  });

  it("a local search carries the question's language and the country the planner read; with nowhere to look it is held", () => {
    const local: PlannedDigPick = { pickId: "1", pace: "FAST", country: "RO", searches: [
      { scope: "LOCAL", polarity: "SUPPORTING", text: "chirii Cluj raport" }, { scope: "ENGLISH", polarity: "SUPPORTING", text: "Cluj rent report" }] };
    const [first, second] = freezeDigQuerySet([local], context(["1"], "ro")).searches;
    expect([first!.scope, first!.language, first!.country, first!.status]).toEqual(["LOCAL", "ro", "RO", "SEND"]);
    expect([second!.scope, second!.language, second!.country]).toEqual(["ENGLISH", "en", null]);
    const nowhere = freezeDigQuerySet([{ ...local, country: null }], context(["1"], "en")).searches[0]!;
    expect([nowhere.status, nowhere.text, nowhere.heldBecause]).toEqual(["HELD", null, ["NO_LOCAL_TARGET"]]);
  });

  it("the look-back date comes from each pick's pace and the run's date; the words lose their dates", () => {
    const set = freezeDigQuerySet([search("1", "Munich rent report in October 2025", "FAST"), search("2", "nurse pay law", "NORMAL"),
      search("3", "history of nurse unions", "SLOW")], context());
    expect(set.searches.map((entry) => entry.afterDate)).toEqual(["2025-10-31", "2023-10-31", null]);
    expect(set.searches[0]!.text).toBe("Munich rent report");
    expect(set.searches[0]!.removed).toContain("DATE");
  });

  it("the personal-data guard: a search with an email or first-person words is held, keeps no words, holds back no other", () => {
    const set = freezeDigQuerySet([search("1", "contact ana.pop@example.com about nurse jobs"), search("2", "I am a nurse from Cluj"),
      search("3", "nurse net salary Germany")], context());
    expect(set.searches.map((entry) => [entry.status, entry.text])).toEqual([["HELD", null], ["HELD", null],
      ["SEND", "nurse net salary Germany"]]);
    expect(set.searches[0]!.heldBecause).toContain("PERSONAL_DATA");
    expect(set.searches[0]!.personalData).toContain("EMAIL");
    expect(set.searches[1]!.heldBecause).toContain("FIRST_PERSON");
    expect(set.searches[2]!.heldBecause).toEqual([]);
  });

  it("the same words from two picks are sent once, never paid twice; the later is left out", () => {
    const set = freezeDigQuerySet([search("1", "Munich rent"), search("2", "munich RENT"), search("3", "nurse pay")], context());
    expect(set.searches.map((entry) => entry.pickId)).toEqual(["1", "3"]);
  });

  it("refuses a search for no pick, a pick planned twice, an unknown pace, no picks, repeated picks and no path", () => {
    expect(codeOf(() => freezeDigQuerySet([search("9", "x y z")], context()))).toBe("OFF_PLAN_QUERY_REFUSED");
    expect(codeOf(() => freezeDigQuerySet([search("1", "a b c"), search("1", "d e f")], context()))).toBe("DIG_PLAN_PICK_REPEATED");
    expect(codeOf(() => freezeDigQuerySet([search("1", "a b c", "SOON" as never)], context(["1"])))).toBe("WEB_PACE_INVALID");
    expect(codeOf(() => freezeDigQuerySet([], context([])))).toBe("DIG_PLAN_PICKS_INVALID");
    expect(codeOf(() => freezeDigQuerySet([], context(["1", "1"])))).toBe("DIG_PLAN_PICKS_INVALID");
    expect(codeOf(() => freezeDigQuerySet([search("1", "a b c")], { ...context(["1"]), pathId: " " }))).toBe("DIG_PLAN_PATH_INVALID");
  });

  it("the same plan freezes to the same bytes (a resumed dig works out the same rows)", () => {
    const plan = [search("1", "nurse net salary Germany"), search("2", "Munich rent one-bedroom")];
    expect(freezeDigQuerySet(plan, context(["1", "2"])).contentHash).toBe(freezeDigQuerySet(plan, context(["1", "2"])).contentHash);
  });
});
