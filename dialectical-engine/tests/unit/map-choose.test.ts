import { describe, expect, it } from "vitest";
import {
  mapAssignItemIds,
  mapFinishChoice,
  mapItemsById,
  mapKeyPoint,
  mapMergedAnswer,
  mapOppositeTemplate,
  type MapAngleKind,
  type MapChooseReply,
  type MapItemDraft,
  type MapLean,
  type MapSeat
} from "@debateai/map";

const A: MapSeat = { aiRef: "ai-a", maker: "maker-a" };
const B: MapSeat = { aiRef: "ai-b", maker: "maker-b" };
const C: MapSeat = { aiRef: "ai-c", maker: "maker-c" };
const point = (seat: MapSeat, listIndex: number, position: number, claim: string, angleKind: MapAngleKind | null, leans: MapLean): MapItemDraft =>
  ({ kind: "POINT", seat, origin: "BLIND", angleId: angleKind === null ? null : angleKind.toLowerCase(), angleKind, listIndex, position,
    claim, whyItMatters: "Why.", leans });
const answer = (seat: MapSeat, listIndex: number, text: string, angleKind: MapAngleKind | null = null): MapItemDraft =>
  ({ kind: "ANSWER", seat, origin: "BLIND", angleId: null, angleKind, listIndex, position: 0, answer: text });
const items = mapAssignItemIds([
  point(A, 0, 0, "Shared opposite", "OPPOSITE_CASE", "against_some_answer"),
  point(B, 1, 0, "Shared opposite", null, "against_some_answer"),
  point(C, 2, 0, "Worry", "ASKER_WORRY", "for_some_answer"),
  point(A, 0, 1, "Solo", null, "context"),
  point(B, 1, 1, "Practical", "PRACTICAL", "for_some_answer"),
  point(C, 2, 1, "Practical", null, "for_some_answer"),
  answer(A, 0, "Yes, with conditions."), answer(B, 1, "Yes, with conditions."), answer(C, 2, "No, keep it as it is.", "OPPOSITE_CASE")
], "seed-choose");
const byId = mapItemsById(items);
const ids = (text: string) => items.filter((item) => (item.kind === "POINT" ? item.claim : item.answer) === text).map((item) => item.itemId);
const keyPoints = [
  mapKeyPoint("kp01", "Shared opposite", ids("Shared opposite"), byId),
  mapKeyPoint("kp02", "Worry", ids("Worry"), byId),
  mapKeyPoint("kp03", "Solo", ids("Solo"), byId),
  mapKeyPoint("kp04", "Practical", ids("Practical"), byId)
];
const mergedAnswers = [
  mapMergedAnswer("an01", "Yes, with conditions.", ids("Yes, with conditions."), byId),
  mapMergedAnswer("an02", "No, keep it as it is.", ids("No, keep it as it is."), byId)
];
const BASE = { keyPoints, mergedAnswers, items, languageTag: "en", maxAnswers: 4, pointsPerAnswer: 3 };
type Answer = MapChooseReply["answers"][number];
const chosen = (answerId: string, statement: string, forIds: string[], against: string[], rival: string | null): Answer =>
  ({ answer_id: answerId, statement, for: forIds, against, strongest_rival: rival });
const marksOf = (marks: readonly { mark: string; detail: string }[]) => marks.map((mark) => `${mark.mark}:${mark.detail}`);

describe("map choose: a reply that meets every quota", () => {
  it("is kept as it is; the unchosen points are also raised, most-raised first", () => {
    const out = mapFinishChoice({ ...BASE, reply: { answers: [
      chosen("a1", "Yes, with conditions.", ["kp04"], ["kp01"], "a2"), chosen("a2", "No, keep it as it is.", ["kp02"], [], "a1")] } });
    expect(out.marks).toEqual([]);
    expect(out.choice.answers.map((entry) => `${entry.answerId}>${entry.strongestRival}`)).toEqual(["a1>a2", "a2>a1"]);
    expect(out.choice.alsoRaised).toEqual(["kp03"]);
  });
});

describe("map choose: quotas over the whole chosen set", () => {
  it("adds the top single-AI point to the answer with the fewest points, then the OPPOSITE_CASE point to the opposite-case answer's for", () => {
    const out = mapFinishChoice({ ...BASE, reply: { answers: [
      chosen("a1", "Yes, with conditions.", ["kp04"], [], "a2"), chosen("a2", "No, keep it as it is.", [], [], "a1")] } });
    expect(marksOf(out.marks)).toEqual(["CHOOSE_QUOTA_FILLED:SINGLE_AI:kp02", "CHOOSE_QUOTA_FILLED:OPPOSITE_CASE:kp01"]);
    // Fix round 1 (controller ruling 2): a2 is the opposite-case answer, so kp01 goes into its for, not its against.
    expect(out.choice.answers[0]!.againstKeyPointIds).toEqual([]);
    expect(out.choice.answers[1]!.forKeyPointIds).toEqual(["kp02", "kp01"]);
  });
});

describe("map choose: at least two distinct answers (ANSWERS_FILLED)", () => {
  it("fills from the map's best-supported different answer first", () => {
    const out = mapFinishChoice({ ...BASE, reply: { answers: [chosen("a1", "Yes, with conditions.", [], ["kp01"], null)] } });
    expect(out.choice.answers.map((entry) => `${entry.answerId}:${entry.statement}:${String(entry.filled)}>${entry.strongestRival}`))
      .toEqual(["a1:Yes, with conditions.:false>a2", "a2:No, keep it as it is.:true>a1"]);
    expect(marksOf(out.marks)).toEqual(["ANSWERS_FILLED:MAP_CANDIDATE", "CHOOSE_QUOTA_FILLED:SINGLE_AI:kp02"]);
  });

  it("then from an OPPOSITE_CASE list's own candidate answer", () => {
    const lumped = [mapMergedAnswer("an01", "Yes, with conditions.", [...ids("Yes, with conditions."), ...ids("No, keep it as it is.")], byId)];
    const out = mapFinishChoice({ ...BASE, mergedAnswers: lumped, reply: { answers: [chosen("a1", "Yes, with conditions.", [], [], null)] } });
    expect(out.choice.answers[1]!.statement).toBe("No, keep it as it is.");
    expect(marksOf(out.marks)[0]).toBe("ANSWERS_FILLED:OPPOSITE_CASE_LIST");
  });

  it("then from the code's template, in the question's language", () => {
    const pointsOnly = items.filter((item) => item.kind === "POINT");
    const en = mapFinishChoice({ ...BASE, items: pointsOnly, mergedAnswers: [], reply: { answers: [chosen("a1", "Yes, with conditions.", [], [], null)] } });
    expect(en.choice.answers[1]!.statement).toBe("The opposite of this answer: Yes, with conditions.");
    expect(marksOf(en.marks)[0]).toBe("ANSWERS_FILLED:TEMPLATE");
    expect(mapOppositeTemplate("Da, cu condiții.", "ro")).toBe("Opusul acestui răspuns: Da, cu condiții.");
  });

  it("counts two wordings of one answer once", () => {
    const out = mapFinishChoice({ ...BASE, reply: { answers: [chosen("a1", "Yes, with conditions.", [], [], "a2"),
      chosen("a2", "yes  with conditions", [], [], "a1")] } });
    expect(out.choice.answers.map((entry) => `${entry.answerId}:${String(entry.filled)}`)).toEqual(["a1:false", "a2:true"]);
  });

  it("keeps at most maxAnswers", () => {
    const four = ["Yes.", "No.", "Only in the centre.", "Only for students."].map((text, index) => chosen(`a${String(index + 1)}`, text, [], [], null));
    expect(mapFinishChoice({ ...BASE, maxAnswers: 3, reply: { answers: four } }).choice.answers).toHaveLength(3);
  });
});

describe("map choose: the fallback when the choose step failed (MAP_CHOOSE_FALLBACK)", () => {
  it("takes the most-raised merged answers and deals the points most-raised first", () => {
    const out = mapFinishChoice({ ...BASE, maxAnswers: 2, pointsPerAnswer: 2, reply: null });
    expect(marksOf(out.marks)).toEqual(["MAP_CHOOSE_FALLBACK:choose reply missing"]);
    expect(out.choice.answers.map((entry) => `${entry.answerId}:${entry.statement}>${entry.strongestRival}`))
      .toEqual(["a1:Yes, with conditions.>a2", "a2:No, keep it as it is.>a1"]);
    expect(out.choice.answers[0]!.againstKeyPointIds).toEqual(["kp01"]);
    expect(out.choice.answers[0]!.forKeyPointIds).toEqual(["kp02"]);
    expect(out.choice.answers[1]!.forKeyPointIds).toEqual(["kp04", "kp03"]);
    expect(out.choice.alsoRaised).toEqual([]);
  });
});

describe("map choose: the single-AI quota counts every maker of a point (controller ruling, 2026-10-12)", () => {
  const shown = (draft: MapItemDraft): MapItemDraft => ({ ...draft, origin: "SHOWN" }) as MapItemDraft;
  const gap = (draft: MapItemDraft): MapItemDraft => ({ ...draft, origin: "GAP" }) as MapItemDraft;
  const pair = (a: MapItemDraft[], seed: string) => {
    const made = mapAssignItemIds(a, seed);
    const index = mapItemsById(made);
    const idsOf = (text: string) => made.filter((item) => (item.kind === "POINT" ? item.claim : item.answer) === text).map((item) => item.itemId);
    return { made, index, idsOf };
  };

  it("counts a point raised only by one shown (snowball) AI as single-AI, and it meets the quota", () => {
    const { made, index, idsOf } = pair([
      point(A, 0, 0, "Shared", null, "for_some_answer"), point(B, 1, 0, "Shared", null, "for_some_answer"),
      shown(point(C, 2, 0, "Shown only", null, "context")),
      answer(A, 0, "Yes."), answer(B, 1, "No.")
    ], "seed-shown");
    const kps = [mapKeyPoint("kp01", "Shared", idsOf("Shared"), index), mapKeyPoint("kp02", "Shown only", idsOf("Shown only"), index)];
    const merged = [mapMergedAnswer("an01", "Yes.", idsOf("Yes."), index), mapMergedAnswer("an02", "No.", idsOf("No."), index)];
    const out = mapFinishChoice({ keyPoints: kps, mergedAnswers: merged, items: made, languageTag: "en", maxAnswers: 4, pointsPerAnswer: 3,
      reply: { answers: [chosen("a1", "Yes.", [], [], null), chosen("a2", "No.", [], [], null)] } });
    expect(marksOf(out.marks)).toEqual(["CHOOSE_QUOTA_FILLED:SINGLE_AI:kp02"]);
    expect(out.choice.answers[0]!.forKeyPointIds).toEqual(["kp02"]);
  });

  it("counts a point a gap round raised by one maker as single-AI", () => {
    const { made, index, idsOf } = pair([
      point(A, 0, 0, "Shared", null, "for_some_answer"), point(B, 1, 0, "Shared", null, "for_some_answer"),
      gap(point(C, 2, 0, "Gap only", null, "context")),
      answer(A, 0, "Yes."), answer(B, 1, "No.")
    ], "seed-gap");
    const kps = [mapKeyPoint("kp01", "Shared", idsOf("Shared"), index), mapKeyPoint("kp02", "Gap only", idsOf("Gap only"), index)];
    const merged = [mapMergedAnswer("an01", "Yes.", idsOf("Yes."), index), mapMergedAnswer("an02", "No.", idsOf("No."), index)];
    const out = mapFinishChoice({ keyPoints: kps, mergedAnswers: merged, items: made, languageTag: "en", maxAnswers: 4, pointsPerAnswer: 3,
      reply: { answers: [chosen("a1", "Yes.", [], [], null), chosen("a2", "No.", [], [], null)] } });
    expect(marksOf(out.marks)).toEqual(["CHOOSE_QUOTA_FILLED:SINGLE_AI:kp02"]);
  });
});

describe("map choose: an empty map (null reply, no merged answers, no OPPOSITE_CASE list) documents a case callers prevent", () => {
  it("fills two template answers, the second the template of the first, each recorded as ANSWERS_FILLED", () => {
    const pointsOnly = items.filter((item) => item.kind === "POINT");
    const out = mapFinishChoice({ ...BASE, items: pointsOnly, mergedAnswers: [], reply: null });
    expect(out.choice.answers.map((entry) => `${entry.answerId}:${entry.statement}:${String(entry.filled)}>${entry.strongestRival}`))
      .toEqual(["a1:An answer different from the one above:true>a2",
        "a2:The opposite of this answer: An answer different from the one above:true>a1"]);
    expect(marksOf(out.marks).filter((mark) => mark.startsWith("ANSWERS_FILLED"))).toEqual(["ANSWERS_FILLED:TEMPLATE", "ANSWERS_FILLED:TEMPLATE"]);
    expect(marksOf(out.marks)[0]).toBe("MAP_CHOOSE_FALLBACK:choose reply missing");
  });
});

describe("map choose (fix round 1): the fallback fills answers before it deals points", () => {
  it("gives the filled answer its share of points, and no point with room left goes to alsoRaised", () => {
    const out = mapFinishChoice({ ...BASE, mergedAnswers: [mergedAnswers[0]!], reply: null });
    expect(marksOf(out.marks)).toEqual(["MAP_CHOOSE_FALLBACK:choose reply missing", "ANSWERS_FILLED:OPPOSITE_CASE_LIST"]);
    expect(out.choice.answers.map((entry) => `${entry.answerId}:${String(entry.filled)}`)).toEqual(["a1:false", "a2:true"]);
    expect(out.choice.answers[0]!.againstKeyPointIds).toEqual(["kp01"]);
    expect(out.choice.answers[0]!.forKeyPointIds).toEqual(["kp02"]);
    expect(out.choice.answers[1]!.forKeyPointIds).toEqual(["kp04", "kp03"]);
    expect(out.choice.alsoRaised).toEqual([]);
  });
});

describe("map choose (fix round 1): an OPPOSITE_CASE point goes to the opposite-case answer's for", () => {
  it("puts the missing OPPOSITE_CASE point in the for of the opposite-case answer, never in its against", () => {
    const out = mapFinishChoice({ ...BASE, reply: { answers: [
      chosen("a1", "Yes, with conditions.", ["kp04", "kp02"], [], null),
      chosen("a2", "No, keep it as it is.", ["kp03"], [], null)] } });
    expect(marksOf(out.marks)).toEqual(["CHOOSE_QUOTA_FILLED:OPPOSITE_CASE:kp01"]);
    expect(out.choice.answers[1]!.forKeyPointIds).toEqual(["kp03", "kp01"]);
    expect(out.choice.answers[1]!.againstKeyPointIds).toEqual([]);
    expect(out.choice.answers[0]!.againstKeyPointIds).toEqual([]);
  });

  it("keeps the brief's rule when no answer is from the opposite case: fewest points, and against", () => {
    const pointsOnly = items.filter((item) => item.kind === "POINT");
    const out = mapFinishChoice({ ...BASE, items: pointsOnly, mergedAnswers: [mergedAnswers[0]!], reply: { answers: [
      chosen("a1", "Yes, with conditions.", ["kp04"], [], null), chosen("a2", "Maybe.", [], [], null)] } });
    expect(marksOf(out.marks)).toEqual(["CHOOSE_QUOTA_FILLED:SINGLE_AI:kp02", "CHOOSE_QUOTA_FILLED:OPPOSITE_CASE:kp01"]);
    expect(out.choice.answers[0]!.againstKeyPointIds).toEqual(["kp01"]);
    expect(out.choice.answers[1]!.forKeyPointIds).toEqual(["kp02"]);
  });
});

describe("map choose (F-I3): an opposite-case answer is known by its answer_id as well as its text", () => {
  it("gives the OPPOSITE_CASE point to the for of a reworded answer that reuses the opposite merged answer's answer_id", () => {
    expect(mergedAnswers[1]!.fromOppositeCase).toBe(true);
    const out = mapFinishChoice({ ...BASE, reply: { answers: [
      chosen("a1", "Yes, with conditions.", ["kp03", "kp02"], [], "an02"),
      chosen("an02", "Leave the system unchanged.", [], [], "a1")] } });
    expect(marksOf(out.marks)).toEqual(["CHOOSE_QUOTA_FILLED:OPPOSITE_CASE:kp01"]);
    // Ruling T7-PRIV: the reused id is read (above), then the answers are renamed a1..aN and the rivals with them.
    expect(out.choice.answers.map((entry) => `${entry.answerId}>${entry.strongestRival}`)).toEqual(["a1>a2", "a2>a1"]);
    expect(out.choice.answers[1]!.forKeyPointIds).toEqual(["kp01"]);
    expect(out.choice.answers[1]!.againstKeyPointIds).toEqual([]);
  });

  it("does not treat a reused id of a merged answer that is not from the opposite case as opposite", () => {
    const out = mapFinishChoice({ ...BASE, reply: { answers: [
      chosen("an01", "Yes, but only with conditions.", ["kp03", "kp02"], [], "a2"),
      chosen("a2", "Something else entirely.", [], [], "an01")] } });
    expect(marksOf(out.marks)).toEqual(["CHOOSE_QUOTA_FILLED:OPPOSITE_CASE:kp01"]);
    // No answer is from the opposite case: the brief's rule, against the answer with the fewest points.
    expect(out.choice.answers[1]!.againstKeyPointIds).toEqual(["kp01"]);
  });
});

describe("map choose (fix round 1, ruling T7-PRIV): filled answer ids are unique", () => {
  it("never reuses an id a reply answer already has, and no answer is its own strongest rival", () => {
    // A reply id shaped like the old internal filled-N form: the answers still come out a1, a2 (code ids, choice order).
    const out = mapFinishChoice({ ...BASE, reply: { answers: [chosen("filled-2", "Yes, with conditions.", [], [], null)] } });
    const answerIds = out.choice.answers.map((entry) => entry.answerId);
    expect(answerIds).toEqual(["a1", "a2"]);
    expect(new Set(answerIds).size).toBe(answerIds.length);
    for (const entry of out.choice.answers) expect(entry.strongestRival).not.toBe(entry.answerId);
  });
});

describe("map choose (fix round 1): answers are de-duplicated before the cut to maxAnswers", () => {
  it("keeps Yes., No. and Maybe. when a repeated wording would otherwise take a place", () => {
    const four = [chosen("a1", "Yes.", [], [], null), chosen("a2", "yes", [], [], null), chosen("a3", "No.", [], [], null), chosen("a4", "Maybe.", [], [], null)];
    const out = mapFinishChoice({ ...BASE, maxAnswers: 3, reply: { answers: four } });
    expect(out.choice.answers.map((entry) => entry.statement)).toEqual(["Yes.", "No.", "Maybe."]);
    expect(marksOf(out.marks).filter((mark) => mark.startsWith("ANSWERS_FILLED"))).toEqual([]);
  });
});
