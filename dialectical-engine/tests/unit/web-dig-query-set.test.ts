// tests/unit/web-dig-query-set.test.ts
// W4-2, R22 decision 9 and the owner's "always a pair": the dig's frozen query set. 0, 2 or 4 searches per chosen path, side `dig`,
// W1-2's personal-data guard (a held search holds its partner), the look-back date from each pick's pace; a local pair with its
// language and country; every other shape refused by a typed code.
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { digSearchSameAs, freezeDigQuerySet, type PlannedDigPick } from "../../packages/evidence/src/web-dig-query-set.js";

const AS_OF = new Date("2026-10-31T09:00:00Z");
const context = (pickIds: readonly string[] = ["1", "2", "3"], questionLanguage: string | null = null) => ({ pickIds,
  pathIdOf: (pickId: string) => `dig-pick-${pickId}`, asOf: AS_OF, questionLanguage });
const PAIR_SIDES = ["SUPPORTING", "DISCONFIRMING"] as const;
/** A pick's English pair: its words, and those words with "doubts" for the side against. */
const search = (pickId: string, text: string, pace: PlannedDigPick["pace"] = "NORMAL"): PlannedDigPick =>
  ({ pickId, pace, country: null, searches: PAIR_SIDES.map((polarity, at) => ({ scope: "ENGLISH" as const, polarity, text: at === 0 ? text : `${text} doubts` })) });
const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (error instanceof TypedDomainError) return error.code;
    throw error;
  }
  return "NO_ERROR";
};

describe("the dig's frozen query set: always a pair", () => {
  const first = (set: ReturnType<typeof freezeDigQuerySet>) => set.searches.filter((entry) => entry.polarity === "SUPPORTING");

  it("in pick order, side dig, English with no country, each pick under its own ref, each search named by its pair and side", () => {
    const set = freezeDigQuerySet([
      search("2", "Munich one-bedroom rent average 2026 report"),
      search("1", "nurse net salary Germany statistics", "FAST"),
      search("3", "cost of living Munich compared with Cluj study", "SLOW")
    ], context());
    expect(first(set).map((entry) => [entry.pickId, entry.side, entry.scope, entry.language, entry.country, entry.pathId]))
      .toEqual([["1", "dig", "ENGLISH", "en", null, "dig-pick-1"], ["2", "dig", "ENGLISH", "en", null, "dig-pick-2"], ["3", "dig", "ENGLISH", "en", null, "dig-pick-3"]]);
    expect(set.searches.slice(0, 2).map((entry) => entry.searchId)).toEqual(["dig-pick-1:DIG:ENGLISH:SUPPORTING", "dig-pick-1:DIG:ENGLISH:DISCONFIRMING"]);
    expect(set.searches.every((entry) => entry.status === "SEND")).toBe(true);
    expect(set.distinctSends).toBe(6);
  });

  it("a pick sends none, a pair or two pairs; one search, three, five, two for one side or an English-less local pair are refused", () => {
    const words = ["alpha report", "beta statistic", "gamma study", "delta law", "epsilon event"];
    const of = (entries: readonly (readonly ["ENGLISH" | "LOCAL", "SUPPORTING" | "DISCONFIRMING"])[]): PlannedDigPick => ({ pickId: "1", pace: "NORMAL", country: "RO",
      searches: entries.map(([scope, polarity], at) => ({ scope, polarity, text: words[at]! })) });
    const E = (polarity: "SUPPORTING" | "DISCONFIRMING") => ["ENGLISH", polarity] as const;
    const L = (polarity: "SUPPORTING" | "DISCONFIRMING") => ["LOCAL", polarity] as const;
    const FOR = "SUPPORTING" as const;
    const AG = "DISCONFIRMING" as const;
    expect(freezeDigQuerySet([], context(["1"])).searches).toEqual([]);
    expect(freezeDigQuerySet([{ pickId: "1", pace: null, country: null, searches: [] }], context(["1"])).searches).toEqual([]);
    expect(freezeDigQuerySet([search("2", "rent report")], context(["1", "2"])).searches.map((entry) => entry.pickId)).toEqual(["2", "2"]);
    expect(freezeDigQuerySet([of([E(FOR), E(AG)])], context(["1"], "ro")).searches).toHaveLength(2);
    expect(freezeDigQuerySet([of([E(FOR), E(AG), L(FOR), L(AG)])], context(["1"], "ro")).searches).toHaveLength(4);
    expect(codeOf(() => freezeDigQuerySet([of([E(FOR)])], context(["1"], "ro")))).toBe("DIG_PLAN_PAIR_INVALID");
    expect(codeOf(() => freezeDigQuerySet([of([E(FOR), E(AG), L(FOR)])], context(["1"], "ro")))).toBe("DIG_PLAN_PAIR_INVALID");
    expect(codeOf(() => freezeDigQuerySet([of([E(FOR), E(FOR)])], context(["1"], "ro")))).toBe("DIG_PLAN_PAIR_INVALID");
    expect(codeOf(() => freezeDigQuerySet([of([L(FOR), L(AG)])], context(["1"], "ro")))).toBe("DIG_PLAN_PAIR_INVALID");
    expect(codeOf(() => freezeDigQuerySet([of([E(FOR), E(AG), L(FOR), L(AG), E(FOR)])], context(["1"], "ro")))).toBe("DIG_PLAN_SEARCH_COUNT_INVALID");
    expect(codeOf(() => freezeDigQuerySet([{ pickId: "1", pace: "NORMAL", country: null, searches: [
      { scope: "ENGLISH", polarity: "SUPPORTING", text: "Same Words" }, { scope: "ENGLISH", polarity: "DISCONFIRMING", text: "same words" }] }], context(["1"])))).toBe("DIG_PLAN_PAIR_INVALID");
  });

  it("a local pair carries the question's language and the country the planner read; with nowhere to look it is held whole", () => {
    const local: PlannedDigPick = { pickId: "1", pace: "FAST", country: "RO", searches: [
      { scope: "ENGLISH", polarity: "SUPPORTING", text: "Cluj rent report" }, { scope: "ENGLISH", polarity: "DISCONFIRMING", text: "Cluj rent falling" },
      { scope: "LOCAL", polarity: "SUPPORTING", text: "chirii Cluj raport" }, { scope: "LOCAL", polarity: "DISCONFIRMING", text: "chirii Cluj scad" }] };
    const set = freezeDigQuerySet([local], context(["1"], "ro")).searches;
    expect(set.map((entry) => [entry.scope, entry.language, entry.country, entry.status])).toEqual([["ENGLISH", "en", null, "SEND"], ["ENGLISH", "en", null, "SEND"],
      ["LOCAL", "ro", "RO", "SEND"], ["LOCAL", "ro", "RO", "SEND"]]);
    const nowhere = freezeDigQuerySet([{ ...local, country: null }], context(["1"], "en")).searches.filter((entry) => entry.scope === "LOCAL");
    expect(nowhere.map((entry) => [entry.status, entry.text, entry.heldBecause])).toEqual([["HELD", null, ["NO_LOCAL_TARGET"]], ["HELD", null, ["NO_LOCAL_TARGET"]]]);
  });

  it("the look-back date comes from each pick's pace and the run's date; the words lose their dates", () => {
    const set = freezeDigQuerySet([search("1", "Munich rent report in October 2025", "FAST"), search("2", "nurse pay law", "NORMAL"),
      search("3", "history of nurse unions", "SLOW")], context());
    expect(first(set).map((entry) => entry.afterDate)).toEqual(["2025-10-31", "2023-10-31", null]);
    expect(first(set)[0]!.text).toBe("Munich rent report");
    expect(first(set)[0]!.removed).toContain("DATE");
  });

  it("the personal-data guard: a held search keeps no words and holds its partner back, never another pick's pair", () => {
    const set = freezeDigQuerySet([{ pickId: "1", pace: "NORMAL", country: null, searches: [{ scope: "ENGLISH", polarity: "SUPPORTING", text: "contact ana.pop@example.com about nurse jobs" },
      { scope: "ENGLISH", polarity: "DISCONFIRMING", text: "nurse jobs falling report" }] }, search("2", "nurse net salary Germany")], context(["1", "2"]));
    expect(set.searches.map((entry) => [entry.pickId, entry.status])).toEqual([["1", "HELD"], ["1", "HELD"], ["2", "SEND"], ["2", "SEND"]]);
    expect(set.searches.slice(0, 2).map((entry) => entry.text)).toEqual([null, null]);
    expect(set.searches[0]!.personalData).toContain("EMAIL");
    expect(set.searches[1]!.heldBecause).toEqual(["PAIR_PARTNER_HELD"]);
    expect(set.distinctSends).toBe(2);
  });

  it("the same words from two picks: both picks keep their whole pair, and the count says the one search that is really sent", () => {
    const set = freezeDigQuerySet([search("1", "Munich rent"), { ...search("2", "munich RENT"), searches: [
      { scope: "ENGLISH", polarity: "SUPPORTING", text: "munich RENT" }, { scope: "ENGLISH", polarity: "DISCONFIRMING", text: "Munich rent falling" }] }], context(["1", "2"]));
    expect(set.searches.map((entry) => entry.pickId)).toEqual(["1", "1", "2", "2"]);
    expect(set.searches.every((entry) => entry.status === "SEND")).toBe(true);
    expect(digSearchSameAs(set.searches[0]!)).toBe(digSearchSameAs(set.searches[2]!));
    expect(set.distinctSends).toBe(3);
  });

  it("refuses a search for no pick, a pick planned twice, an unknown pace, no picks, repeated picks and no path", () => {
    expect(codeOf(() => freezeDigQuerySet([search("9", "x y z")], context()))).toBe("OFF_PLAN_QUERY_REFUSED");
    expect(codeOf(() => freezeDigQuerySet([search("1", "a b c"), search("1", "d e f")], context()))).toBe("DIG_PLAN_PICK_REPEATED");
    expect(codeOf(() => freezeDigQuerySet([search("1", "a b c", "SOON" as never)], context(["1"])))).toBe("WEB_PACE_INVALID");
    expect(codeOf(() => freezeDigQuerySet([], context([])))).toBe("DIG_PLAN_PICKS_INVALID");
    expect(codeOf(() => freezeDigQuerySet([], context(["1", "1"])))).toBe("DIG_PLAN_PICKS_INVALID");
    expect(codeOf(() => freezeDigQuerySet([search("1", "a b c")], { ...context(["1"]), pathIdOf: () => " " }))).toBe("DIG_PLAN_PATH_INVALID");
  });

  it("the same plan freezes to the same bytes (a resumed dig works out the same rows)", () => {
    const plan = [search("1", "nurse net salary Germany"), search("2", "Munich rent one-bedroom")];
    expect(freezeDigQuerySet(plan, context(["1", "2"])).contentHash).toBe(freezeDigQuerySet(plan, context(["1", "2"])).contentHash);
  });
});
