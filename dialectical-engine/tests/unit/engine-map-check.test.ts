// tests/unit/engine-map-check.test.ts
import { describe, expect, it } from "vitest";
import {
  MAP_ANSWER_CHECK_CODE, MAP_ANSWER_CHECK_OUTCOMES, MAP_ENGINE_INTERNAL_FIELD_NAMES, mapAnswerCheckCodes, mapApplyAnswerCheck, mapCheckCandidatesOf,
  mapCheckFailedStatements, mapCheckOutcomeOf, mapCheckPremiseExemptIds, mapCheckReadingOf, mapPickChecker, type MapAnswerCheckOutcome, type MapAnswerCheckReading, type MapCheckCandidate,
  type MapChoice, type MapChosenAnswer, type MapKeyPoint, type MapMergedAnswer
} from "@debateai/map";

const seat = (n: number) => Object.freeze({ aiRef: `preview:${String(n)}`, maker: `maker-${String(n)}` });
const CHECKER = seat(3);
const kp = (keyPointId: string, blind: string[]): MapKeyPoint => Object.freeze({ keyPointId, claim: `Claim ${keyPointId}.`,
  memberItemIds: [`pt${keyPointId.slice(2)}`], blindMakers: blind, gapMakers: [], makers: blind, fixedAngleKinds: [], leansAgainst: false });
const KEY_POINTS = [kp("kp01", ["m1", "m2"]), kp("kp02", ["m1"]), kp("kp03", ["m2"]), kp("kp04", ["m3"]), kp("kp05", ["m3"])];
const answer = (n: number, statement: string, sides: Readonly<{ for?: string[]; against?: string[] }> = {}): MapChosenAnswer => Object.freeze({
  answerId: `a${String(n)}`, statement, forKeyPointIds: sides.for ?? [], againstKeyPointIds: sides.against ?? [],
  strongestRival: `a${String(n === 1 ? 2 : 1)}`, filled: false, assumptions: [], pointsRaised: [] });
const choiceOf = (answers: MapChosenAnswer[], reserves: MapChoice["reserves"] = []): MapChoice => Object.freeze({ answers, alsoRaised: [], reserves });
const RESERVE = Object.freeze({ reserveId: "r1" as const, statement: "Only on night lines.", forKeyPointIds: ["kp04"], againstKeyPointIds: [],
  assumptions: ["Night riders are shift workers."] });
const merged = (answerId: string, text: string, blind: string[]): MapMergedAnswer => Object.freeze({ answerId, answer: text,
  memberItemIds: [`ca${answerId.slice(2)}`], blindMakers: blind, makers: blind, fromOppositeCase: false });
// (pre-flight consistency) the reading's REQUIRED premiseExempt (Task 1): none unless a case names it.
const reading = (outcomes: Record<string, Exclude<MapAnswerCheckOutcome, "UNCHECKED">>, premiseExempt: readonly string[] = []): MapAnswerCheckReading => Object.freeze({
  checker: CHECKER, outcomes, reasons: Object.fromEntries(Object.entries(outcomes).filter(([, o]) => o !== "PASSED").map(([id]) => [id, "Only says it depends."])),
  premiseExempt });
const apply = (choice: MapChoice, read: MapAnswerCheckReading | null, candidates: readonly MapCheckCandidate[]) =>
  mapApplyAnswerCheck({ choice, reading: read, candidates, keyPoints: KEY_POINTS, pointsPerAnswer: 2, internalNames: MAP_ENGINE_INTERNAL_FIELD_NAMES,
    unavailableDetail: "check reply missing" });
const THREE = choiceOf([answer(1, "Yes, where buses run full.", { for: ["kp01"] }), answer(2, "It depends on the budget.", { against: ["kp02"] }),
  answer(3, "No, fund repairs first.", { for: ["kp03"] })], [RESERVE]);
const candidatesOf = (choice: MapChoice, extra: readonly MapMergedAnswer[] = [], max = 3) =>
  mapCheckCandidatesOf({ choice, mergedAnswers: extra, max, internalNames: MAP_ENGINE_INTERNAL_FIELD_NAMES });

describe("the answer check's seat and candidates (spec §5.2 item 5)", () => {
  it("the checker is never of the chooser's maker; null when only that maker is left; the planner seat when nobody chose", () => {
    const order = [seat(0), seat(1), seat(2), { aiRef: "preview:2b", maker: "maker-2" }];
    expect(mapPickChecker(order, new Set(), seat(2))).toEqual({ aiRef: "preview:0", maker: "maker-0" });
    expect(mapPickChecker(order, new Set(["preview:0", "preview:1"]), seat(2))).toBeNull();
    expect(mapPickChecker(order, new Set(), null)).toEqual(seat(0));
  });

  it("reserves first, then the most-raised unchosen merged answers; never a chosen statement, a repeat or an internal word; capped", () => {
    const extra = [merged("an05", "Yes, where buses run full", ["m1", "m2", "m3"]), merged("an06", "Only for students.", ["m1"]),
      merged("an07", "Its rests_on says no.", ["m1", "m2"]), merged("an08", "Only for pensioners.", ["m2", "m3"])];
    expect(candidatesOf(THREE, extra).map((c) => [c.checkId, c.source, c.statement])).toEqual([
      ["c1", "RESERVE", "Only on night lines."], ["c2", "MERGED", "Only for pensioners."], ["c3", "MERGED", "Only for students."]]);
    expect(candidatesOf(THREE, extra, 0)).toEqual([]);
    expect(candidatesOf(THREE, extra, 9)).toHaveLength(3);
  });

  it("a merged answer the chooser kept, even reworded, is never a candidate (Review Focus 2; pre-flight PF-R33.8)", () => {
    const extra = [merged("an01", "Yes.", ["m1", "m2", "m3"]), merged("an02", "Only for students.", ["m1"])];
    // Without the chooser's reused ids the reworded original comes back (the text guard alone cannot see it) ...
    expect(candidatesOf(THREE, extra).map((c) => c.statement)).toEqual(["Only on night lines.", "Yes.", "Only for students."]);
    // ... with them it never does.
    const kept = mapCheckCandidatesOf({ choice: THREE, mergedAnswers: extra, max: 3, internalNames: MAP_ENGINE_INTERNAL_FIELD_NAMES,
      keptMergedAnswerIds: new Set(["an01"]) });
    expect(kept.map((c) => [c.checkId, c.statement])).toEqual([["c1", "Only on night lines."], ["c2", "Only for students."]]);
  });
});

describe("replace, drop, keep (spec §5.5)", () => {
  it("all pass: nothing changes, no mark; every id is stored PASSED", () => {
    const out = apply(THREE, reading({ a1: "PASSED", a2: "PASSED", a3: "PASSED", c1: "PASSED" }), candidatesOf(THREE));
    expect(out.choice.answers.map((a) => a.statement)).toEqual(THREE.answers.map((a) => a.statement));
    expect(out.marks).toEqual([]);
    expect(mapAnswerCheckCodes(out.answerCheck)).toEqual(["a1:PASSED", "a2:PASSED", "a3:PASSED", "c1:PASSED"]);
  });

  it("a failing answer is replaced by the first passing candidate, keeps its id, and takes the reserve's sides and assumptions", () => {
    const out = apply(THREE, reading({ a1: "PASSED", a2: "NOT_AN_ANSWER", a3: "PASSED", c1: "PASSED" }), candidatesOf(THREE));
    expect(out.choice.answers[1]).toMatchObject({ answerId: "a2", statement: "Only on night lines.", forKeyPointIds: ["kp04"],
      againstKeyPointIds: [], filled: false, assumptions: ["Night riders are shift workers."] });
    expect(out.marks).toEqual([{ mark: "MAP_ANSWER_REPLACED", step: "CHECK", detail: "a2>c1" }]);
    expect(out.answerCheck.replacements).toEqual([{ answerId: "a2", statement: "It depends on the budget.", replacedBy: "c1", action: "REPLACED" }]);
    expect(mapAnswerCheckCodes(out.answerCheck)).toEqual(["a1:PASSED", "a2:NOT_AN_ANSWER>c1", "a3:PASSED", "c1:PASSED"]);
  });

  it("a merged candidate brings no sides: its position gets the most-raised free points, unsided", () => {
    const candidates = candidatesOf(choiceOf(THREE.answers.slice()), [merged("an06", "Only for students.", ["m1"])]);
    const out = apply(choiceOf(THREE.answers.slice()), reading({ a1: "ADDED_FACT", a2: "PASSED", a3: "PASSED", c1: "PASSED" }), candidates);
    // kp01 was the replaced answer's own point: freed, it is the most-raised point nobody holds.
    expect(out.choice.answers[0]).toMatchObject({ statement: "Only for students.", forKeyPointIds: [], againstKeyPointIds: [], pointsRaised: ["kp01", "kp04"] });
    expect(out.choice.alsoRaised).toEqual(["kp05"]);
  });

  it("D4(b): an answer nothing would go wrong to follow is replaced; a premise challenge the checker exempted passes and is never replaced for it (pre-flight PF-R33.1)", () => {
    const out = apply(THREE, reading({ a1: "PASSED", a2: "NO_COST", a3: "PASSED", c1: "PASSED" }), candidatesOf(THREE));
    expect(out.choice.answers[1]).toMatchObject({ answerId: "a2", statement: "Only on night lines." });
    expect(out.marks).toEqual([{ mark: "MAP_ANSWER_REPLACED", step: "CHECK", detail: "a2>c1" }]);
    expect(mapAnswerCheckCodes(out.answerCheck)).toEqual(["a1:PASSED", "a2:NO_COST>c1", "a3:PASSED", "c1:PASSED"]);
    // A premise challenge is the checker's own null: exempt from the third test (PASSED here), and countable for D1.
    const premiseReply = { checks: [
      { check_id: "a1", answers_question: true, adds_unstated_fact: false, cost_can_be_named: null, reason: null },
      { check_id: "a2", answers_question: true, adds_unstated_fact: false, cost_can_be_named: false, reason: "Nothing would go wrong." }] };
    expect(mapCheckReadingOf(premiseReply, CHECKER).outcomes).toEqual({ a1: "PASSED", a2: "NO_COST" });
    expect(mapCheckPremiseExemptIds(premiseReply)).toEqual(["a1"]);
    // (pre-flight consistency) the reading carries the exemption, the result copies it (for D1, stored by Task 11), and the
    // exempted answer stands: the checker's null is never read as a fail.
    expect(mapCheckReadingOf(premiseReply, CHECKER).premiseExempt).toEqual(["a1"]);
    const exempted = apply(THREE, reading({ a1: "PASSED", a2: "PASSED", a3: "PASSED", c1: "PASSED" }, ["a1"]), candidatesOf(THREE));
    expect(exempted.choice.answers[0]!.statement).toBe("Yes, where buses run full.");
    expect(exempted.marks).toEqual([]);
    expect(exempted.answerCheck.premiseExempt).toEqual(["a1"]);
  });

  it("an answer the checker did not read stands, unchecked; code never fails it (G1; pre-flight PF-R33.7)", () => {
    const out = apply(THREE, reading({ a1: "PASSED", a3: "PASSED", c1: "PASSED" }), candidatesOf(THREE));
    expect(out.choice.answers.map((a) => a.answerId)).toEqual(["a1", "a2", "a3"]);
    expect(out.marks).toEqual([]);
    expect(mapAnswerCheckCodes(out.answerCheck)).toEqual(["a1:PASSED", "a2:UNCHECKED", "a3:PASSED", "c1:PASSED"]);
  });

  it("no passing candidate and three answers: the failing one is dropped, the rival naming it moves to the next answer", () => {
    const out = apply(THREE, reading({ a1: "PASSED", a2: "NOT_AN_ANSWER+ADDED_FACT", a3: "PASSED", c1: "ADDED_FACT" }), candidatesOf(THREE));
    expect(out.choice.answers.map((a) => a.answerId)).toEqual(["a1", "a3"]);
    expect(out.choice.answers[0]!.strongestRival).toBe("a3");
    expect(out.marks.map((mark) => mark.mark)).toEqual(["MAP_ANSWER_DROPPED"]);
    expect(mapAnswerCheckCodes(out.answerCheck)).toEqual(["a1:PASSED", "a2:NOT_AN_ANSWER+ADDED_FACT>DROPPED", "a3:PASSED", "c1:ADDED_FACT"]);
    expect(mapCheckFailedStatements(out.answerCheck)).toEqual(["It depends on the budget.", "Only on night lines."]);
  });

  it("each candidate replaces at most one answer (Review Focus 2)", () => {
    const out = apply(THREE, reading({ a1: "NOT_AN_ANSWER", a2: "NOT_AN_ANSWER", a3: "PASSED", c1: "PASSED" }), candidatesOf(THREE));
    expect(out.answerCheck.replacements.map((r) => `${r.answerId}:${r.action}`)).toEqual(["a1:REPLACED", "a2:DROPPED"]);
    expect(new Set(out.choice.answers.map((a) => a.statement)).size).toBe(out.choice.answers.length);
  });

  it("never leaves fewer than two answers: four failing, none passing, two dropped and two kept (Review Focus 1)", () => {
    const four = choiceOf([answer(1, "One."), answer(2, "Two."), answer(3, "Three."), answer(4, "Four.")]);
    const out = apply(four, reading({ a1: "NOT_AN_ANSWER", a2: "NOT_AN_ANSWER", a3: "NOT_AN_ANSWER+ADDED_FACT+NO_COST", a4: "ADDED_FACT" }), []);
    expect(out.choice.answers.map((a) => a.answerId)).toEqual(["a3", "a4"]);
    expect(out.marks.map((mark) => mark.mark)).toEqual(["MAP_ANSWER_DROPPED", "MAP_ANSWER_DROPPED", "MAP_ANSWER_KEPT_UNCHECKED", "MAP_ANSWER_KEPT_UNCHECKED"]);
    expect(mapAnswerCheckCodes(out.answerCheck)).toEqual(["a1:NOT_AN_ANSWER>DROPPED", "a2:NOT_AN_ANSWER>DROPPED", "a3:NOT_AN_ANSWER+ADDED_FACT+NO_COST>KEPT",
      "a4:ADDED_FACT>KEPT"]);
  });

  it("the check unavailable: the answers stand, every id UNCHECKED, one MAP_CHECK_UNAVAILABLE", () => {
    const out = apply(THREE, null, candidatesOf(THREE));
    expect(out.choice).toBe(THREE);
    expect(out.marks).toEqual([{ mark: "MAP_CHECK_UNAVAILABLE", step: "CHECK", detail: "check reply missing" }]);
    expect(mapAnswerCheckCodes(out.answerCheck)).toEqual(["a1:UNCHECKED", "a2:UNCHECKED", "a3:UNCHECKED", "c1:UNCHECKED"]);
    expect(out.answerCheck.checker).toBeNull();
    expect(out.answerCheck.premiseExempt).toEqual([]); // (pre-flight consistency) no check, no exemption
  });

  it("reads the checker's answers into outcomes, and every stored code matches the database's pattern", () => {
    const read = mapCheckReadingOf({ checks: [{ check_id: "a1", answers_question: false, adds_unstated_fact: false, cost_can_be_named: true,
      reason: " Only says it depends. " }] }, CHECKER);
    expect(read).toEqual({ checker: CHECKER, outcomes: { a1: "NOT_AN_ANSWER" }, reasons: { a1: "Only says it depends." }, premiseExempt: [] });
    for (const code of ["a4:NOT_AN_ANSWER+ADDED_FACT>KEPT", "c4:PASSED", "a1:UNCHECKED", "a2:NOT_AN_ANSWER>c3", "a3:NO_COST>DROPPED",
      "a1:ADDED_FACT+NO_COST", "c2:NOT_AN_ANSWER+NO_COST"]) expect(code).toMatch(MAP_ANSWER_CHECK_CODE);
    // BOTH is retired (deviation 12); failed tests only in the fixed order; nothing after PASSED or UNCHECKED (pre-flight PF-R33.1).
    for (const code of ["a5:PASSED", "c1:PASSED>DROPPED>KEPT", "a1:passed", "r1:PASSED", "a1:BOTH", "a4:BOTH>KEPT", "a1:NOCOST",
      "a1:ADDED_FACT+NOT_AN_ANSWER", "a1:NO_COST+ADDED_FACT", "a1:NO_COST+NOT_AN_ANSWER", "a1:PASSED+NO_COST", "a1:UNCHECKED+NO_COST",
      "a1:NOT_AN_ANSWER+", "a1:NOT_AN_ANSWER+NO_COST+ADDED_FACT"]) expect(code).not.toMatch(MAP_ANSWER_CHECK_CODE);
  });

  it("D4(b): every combination of the three tests is its own outcome, failed tests in fixed order; null (premise) is exempt (pre-flight PF-R33.1)", () => {
    const combos: readonly (readonly [boolean, boolean, boolean | null, MapAnswerCheckOutcome])[] = [
      [true, false, true, "PASSED"], [true, false, null, "PASSED"], [true, false, false, "NO_COST"],
      [false, false, true, "NOT_AN_ANSWER"], [false, false, null, "NOT_AN_ANSWER"], [false, false, false, "NOT_AN_ANSWER+NO_COST"],
      [true, true, true, "ADDED_FACT"], [true, true, null, "ADDED_FACT"], [true, true, false, "ADDED_FACT+NO_COST"],
      [false, true, true, "NOT_AN_ANSWER+ADDED_FACT"], [false, true, null, "NOT_AN_ANSWER+ADDED_FACT"],
      [false, true, false, "NOT_AN_ANSWER+ADDED_FACT+NO_COST"]];
    for (const [answers, adds, cost, expected] of combos) {
      expect(mapCheckOutcomeOf(answers, adds, cost), `${String(answers)} ${String(adds)} ${String(cost)}`).toBe(expected);
    }
    // The eight outcomes a reply can give are exactly Task 1's list without UNCHECKED, and each stores under the pattern.
    expect(new Set(combos.map(([answers, adds, cost]) => mapCheckOutcomeOf(answers, adds, cost))))
      .toEqual(new Set(MAP_ANSWER_CHECK_OUTCOMES.filter((outcome) => outcome !== "UNCHECKED")));
    for (const outcome of MAP_ANSWER_CHECK_OUTCOMES) {
      expect(`a1:${outcome}`).toMatch(MAP_ANSWER_CHECK_CODE);
      expect(`a4:${outcome}>c4`).toMatch(MAP_ANSWER_CHECK_CODE);
    }
  });
});
