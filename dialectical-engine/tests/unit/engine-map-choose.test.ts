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
