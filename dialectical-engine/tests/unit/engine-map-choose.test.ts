// tests/unit/engine-map-choose.test.ts
import { describe, expect, it } from "vitest";
import {
  MAP_ENGINE_INTERNAL_FIELD_NAMES, mapFinishChoice, type MapChooseReplyV2, type MapFinishChoiceInput, type MapFixedAngleKind,
  type MapKeyPoint, type MapMergedAnswer
} from "@debateai/map";

const kp = (keyPointId: string, blind: string[], options: Readonly<{ fixed?: MapFixedAngleKind[]; against?: boolean }> = {}): MapKeyPoint =>
  Object.freeze({ keyPointId, claim: `Claim ${keyPointId}.`, memberItemIds: [`pt${keyPointId.slice(2)}`], blindMakers: blind, gapMakers: [],
    makers: blind, fixedAngleKinds: options.fixed ?? [], leansAgainst: options.against ?? false });
const merged = (answerId: string, answer: string, blind: string[], fromOppositeCase = false): MapMergedAnswer =>
  Object.freeze({ answerId, answer, memberItemIds: [`ca${answerId.slice(2)}`], blindMakers: blind, makers: blind, fromOppositeCase });
const KEY_POINTS = [kp("kp01", ["m1", "m2"], { fixed: ["OPPOSITE_CASE"], against: true }), kp("kp02", ["m1"], { fixed: ["ASKER_WORRY"] }),
  kp("kp03", ["m2", "m3"]), kp("kp04", ["m3"])];
const MERGED = [merged("an01", "Yes, with conditions.", ["m1", "m2"]), merged("an02", "No, keep the fares.", ["m3"], true),
  merged("an03", "Only at night.", ["m2"])];
const base = (reply: MapChooseReplyV2 | null): MapFinishChoiceInput => ({ reply, keyPoints: KEY_POINTS, mergedAnswers: MERGED, items: [],
  languageTag: "en", maxAnswers: 3, pointsPerAnswer: 2, siding: "NONE", internalNames: MAP_ENGINE_INTERNAL_FIELD_NAMES });
const sided = (answer: { forKeyPointIds: readonly string[]; againstKeyPointIds: readonly string[] }) => [...answer.forKeyPointIds, ...answer.againstKeyPointIds];

/** Spec §5.2 rule 4 (P2.3): "the code fallback never puts a point on a side". */
describe("engine 2: choose never sides a point by code", () => {
  it("the choose fallback picks answers by code and deals the most-raised points to them UNSIDED, round-robin", () => {
    const out = mapFinishChoice(base(null));
    expect(out.marks.map((mark) => mark.mark)).toContain("MAP_CHOOSE_FALLBACK");
    for (const answer of out.choice.answers) expect(sided(answer)).toEqual([]);
    expect(out.choice.answers.map((answer) => [answer.statement, answer.pointsRaised])).toEqual([
      ["Yes, with conditions.", ["kp01", "kp04"]], ["No, keep the fares.", ["kp03"]], ["Only at night.", ["kp02"]]]);
    expect(out.choice.answers.map((answer) => answer.assumptions)).toEqual([[], [], []]);
    expect(out.choice.reserves).toEqual([]);
    expect(out.choice.alsoRaised).toEqual([]);
  });

  it("the AI's sides, assumptions and reserves are kept; a code-filled answer and a quota fill are unsided", () => {
    const reply: MapChooseReplyV2 = {
      answers: [{ answer_id: "an01", statement: "Yes, with conditions.", for: ["kp03"], against: ["kp01"], strongest_rival: null,
        assumptions: ["Riders pay fares today."] }],
      reserve_answers: [{ statement: "Only at night.", for: ["kp04"], against: [], assumptions: [] },
        { statement: "yes, with conditions", for: [], against: [], assumptions: [] }]
    };
    const out = mapFinishChoice({ ...base(reply), maxAnswers: 2 });
    const [first, filled] = out.choice.answers;
    expect(first).toMatchObject({ forKeyPointIds: ["kp03"], againstKeyPointIds: ["kp01"], assumptions: ["Riders pay fares today."], pointsRaised: [] });
    expect(filled).toMatchObject({ statement: "No, keep the fares.", filled: true, forKeyPointIds: [], againstKeyPointIds: [], assumptions: [] });
    expect(filled!.pointsRaised).toEqual(["kp02", "kp04"]);
    expect(out.marks.map((mark) => `${mark.mark}:${mark.detail}`)).toEqual(["ANSWERS_FILLED:MAP_CANDIDATE", "CHOOSE_QUOTA_FILLED:SINGLE_AI:kp02"]);
    expect(out.choice.reserves).toEqual([{ reserveId: "r1", statement: "Only at night.", forKeyPointIds: ["kp04"], againstKeyPointIds: [], assumptions: [] }]);
  });

  it("an OPPOSITE_CASE quota fill goes to the opposite answer as a point raised, never onto its 'for'", () => {
    const reply: MapChooseReplyV2 = { answers: [
      { answer_id: "an01", statement: "Yes, with conditions.", for: ["kp03"], against: [], strongest_rival: null, assumptions: [] },
      { answer_id: "an02", statement: "No, keep the fares.", for: ["kp04"], against: [], strongest_rival: null, assumptions: [] }] };
    const out = mapFinishChoice({ ...base(reply), maxAnswers: 2 });
    expect(out.choice.answers[1]).toMatchObject({ forKeyPointIds: ["kp04"], againstKeyPointIds: [] });
    expect(out.choice.answers[1]!.pointsRaised).toContain("kp01");
  });

  it("engine 1 (no siding given): no new member on any answer or on the choice", () => {
    const { siding: _s, internalNames: _n, ...engineOne } = base(null);
    const out = mapFinishChoice(engineOne);
    for (const answer of out.choice.answers) {
      expect(Object.hasOwn(answer, "assumptions")).toBe(false);
      expect(Object.hasOwn(answer, "pointsRaised")).toBe(false);
    }
    expect(Object.hasOwn(out.choice, "reserves")).toBe(false);
    expect(out.choice.answers.some((answer) => sided(answer).length > 0)).toBe(true);
  });

  it("engine 2's skip reads engine 2's words: an answer naming rests_on is never chosen by code", () => {
    const out = mapFinishChoice({ ...base(null), mergedAnswers: [merged("an09", "Its rests_on says yes.", ["m1", "m2", "m3"]), ...MERGED] });
    expect(out.choice.answers.map((answer) => answer.statement)).not.toContain("Its rests_on says yes.");
  });
});

/** R3 final wave P7 (Task 7 Minors 3-4): what code keeps of a reply, whatever reached it (the check refuses these first). */
describe("engine 2: choose's code guards over the reply (review carries)", () => {
  const answer = (id: string, statement: string, assumptions: readonly string[] = []) =>
    ({ answer_id: id, statement, for: ["kp03"], against: [], strongest_rival: null, assumptions: [...assumptions] });
  const reserve = (statement: string, assumptions: readonly string[] = []) => ({ statement, for: ["kp04"], against: [], assumptions: [...assumptions] });

  it("mints r1 and r2 in the reply's order and cuts a third reserve", () => {
    const reply: MapChooseReplyV2 = { answers: [answer("an01", "Yes, with conditions."), answer("an02", "No, keep the fares.")],
      reserve_answers: [reserve("Only at night."), reserve("Only for students."), reserve("Only on weekends.")] };
    const out = mapFinishChoice({ ...base(reply), maxAnswers: 2 });
    expect(out.choice.reserves?.map((entry) => [entry.reserveId, entry.statement])).toEqual([["r1", "Only at night."], ["r2", "Only for students."]]);
  });

  it("keeps at most three assumptions per answer and per reserve", () => {
    const four = ["One holds.", "Two holds.", "Three holds.", "Four holds."];
    const reply: MapChooseReplyV2 = { answers: [answer("an01", "Yes, with conditions.", four), answer("an02", "No, keep the fares.")],
      reserve_answers: [reserve("Only at night.", four)] };
    const out = mapFinishChoice({ ...base(reply), maxAnswers: 2 });
    expect(out.choice.answers[0]!.assumptions).toEqual(four.slice(0, 3));
    expect(out.choice.reserves?.[0]?.assumptions).toEqual(four.slice(0, 3));
  });

  it("drops an assumption, a reserve and a reserve's assumption that name an engine-2 word", () => {
    const reply: MapChooseReplyV2 = { answers: [answer("an01", "Yes, with conditions.", ["Its rests_on holds.", "Riders pay fares today."]),
      answer("an02", "No, keep the fares.")],
      reserve_answers: [reserve("The key_point_id says so."), reserve("Only at night.", ["Each raised_by counts.", "Night riders are workers."])] };
    const out = mapFinishChoice({ ...base(reply), maxAnswers: 2 });
    expect(out.choice.answers[0]!.assumptions).toEqual(["Riders pay fares today."]);
    expect(out.choice.reserves).toEqual([{ reserveId: "r1", statement: "Only at night.", forKeyPointIds: ["kp04"], againstKeyPointIds: [],
      assumptions: ["Night riders are workers."] }]);
  });

  it("skips a key point whose claim names an engine-2 word: never dealt, never also raised", () => {
    const leaked = Object.freeze({ ...kp("kp05", ["m1", "m2", "m3"]), claim: "The rests_on of each point is fine." });
    for (const reply of [null, { answers: [answer("an01", "Yes, with conditions."), answer("an02", "No, keep the fares.")] }]) {
      const out = mapFinishChoice({ ...base(reply), keyPoints: [...KEY_POINTS, leaked], maxAnswers: 2 });
      for (const chosen of out.choice.answers) expect([...sided(chosen), ...(chosen.pointsRaised ?? [])]).not.toContain("kp05");
      expect(out.choice.alsoRaised).not.toContain("kp05");
    }
  });
});

/** R3 final wave P9 (Task 9 O2): the reply path's fill never brings back, in its own words, a merged answer already chosen. */
describe("engine 2: a fill never reuses a merged answer a chosen answer reuses", () => {
  it("skips the reused merged answer under engine 2; engine 1 keeps today's text rule", () => {
    const reply: MapChooseReplyV2 = { answers: [{ answer_id: "an01", statement: "Yes, if the conditions hold.", for: ["kp03"], against: [],
      strongest_rival: null, assumptions: [] }] };
    const engine = mapFinishChoice({ ...base(reply), maxAnswers: 2 });
    expect(engine.choice.answers.map((answer) => [answer.statement, answer.filled, answer.mergedAnswerId])).toEqual([
      ["Yes, if the conditions hold.", false, "an01"], ["No, keep the fares.", true, "an02"]]);
    const { siding: _s, internalNames: _n, ...engineOne } = base(reply);
    expect(mapFinishChoice({ ...engineOne, maxAnswers: 2 }).choice.answers.map((answer) => answer.statement))
      .toEqual(["Yes, if the conditions hold.", "Yes, with conditions."]);
  });
});
