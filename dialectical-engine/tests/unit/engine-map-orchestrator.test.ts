// tests/unit/engine-map-orchestrator.test.ts
import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START } from "@debateai/kernel";
import {
  MAP_ENGINE_CONTRACT_IDS, mapAlsoRaisedOf, mapProviderPieces, mapRunAngleMap, type MapCallOutcome, type MapCallRequest, type MapCaller,
  type MapLength, type MapRunInput,
  // Review carries (the last describe).
  MAP_ENGINE_INTERNAL_FIELD_NAMES, MAP_INTERNAL_FIELD_NAMES, type MapKeyPoint, type MapPointItem
} from "@debateai/map";
import { readPromptFrame } from "@debateai/providers";
import { engineMapScriptedContent, type EngineMapScriptOptions } from "../support/engine-map-script.js";

const STOP = { finishReason: "stop" };
const LENGTH: MapLength = { targets: LENGTH_GUIDANCE_START.map, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const SEATS = [0, 1, 2, 3].map((n) => Object.freeze({ aiRef: `preview:${String(n)}`, maker: `maker-${String(n)}` }));
const frameOf = (request: MapCallRequest<unknown>) => readPromptFrame(mapProviderPieces(request.spec).framed.packet);

/** A scripted caller (as tests/unit/map-orchestrator.test.ts): replies are TEXT read through the step's own classifier. */
function scripted(options: EngineMapScriptOptions, override: (request: MapCallRequest<unknown>) => MapCallOutcome<unknown> | null = () => null) {
  const requests: MapCallRequest<unknown>[] = [];
  const caller: MapCaller = {
    async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
      const seen = request as MapCallRequest<unknown>;
      requests.push(seen);
      const forced = override(seen);
      if (forced !== null) return forced as MapCallOutcome<T>;
      const frame = frameOf(seen);
      const reply = engineMapScriptedContent(frame.contractId, frame.fields, options);
      if (reply === null || request.spec.classify(reply, STOP).parseStatus !== "PARSED") return { kind: "FAILED", code: "TEST_UNPARSED" };
      return { kind: "OK", value: request.spec.read(reply, STOP) };
    }
  };
  return { caller, requests };
}
const input = (caller: MapCaller, extra: Partial<MapRunInput> = {}): MapRunInput => ({ questionLine: "Should a mid-sized city make its central bus lines free to ride?",
  languageName: "English", languageTag: "en", seats: SEATS, caller, seed: "q1", gapRoundsMax: 1, maxAnswers: 2, pointsPerAnswer: 2,
  length: LENGTH, engine: { answerCheckCandidates: 3 }, ...extra });

describe("engine 2: the map asks one answer check after choose (spec §5.4)", () => {
  it("every call is engine 2's; MAP:check comes last, once, from a maker other than the chooser's", async () => {
    const { caller, requests } = scripted({});
    const result = await mapRunAngleMap(input(caller));
    const engineIds = new Set(Object.values(MAP_ENGINE_CONTRACT_IDS));
    for (const request of requests) expect(engineIds.has(frameOf(request).contractId)).toBe(true);
    expect(requests.filter((request) => request.callSiteKey === "MAP:check")).toHaveLength(1);
    expect(requests.at(-1)!.callSiteKey).toBe("MAP:check");
    const chooser = requests.find((request) => request.callSiteKey === "MAP:choose")!.seat;
    expect(requests.at(-1)!.seat.maker).not.toBe(chooser.maker);
    expect(result.answerCheck?.outcomes).toMatchObject({ a1: "PASSED", a2: "PASSED", c1: "PASSED" });
    expect(result.choice?.answers[0]?.assumptions).toEqual(["The city can pay for it from its own budget."]);
    expect(result.choice?.reserves?.map((reserve) => reserve.reserveId)).toEqual(["r1"]);
    expect(result.keyPoints.every((keyPoint) => keyPoint.restsOn !== undefined)).toBe(true);
    expect(result.calls.at(-1)).toMatchObject({ step: "CHECK", callSiteKey: "MAP:check", outcome: "OK" });
  });

  it("a failing chosen answer is replaced by the reserve and marked", async () => {
    const { caller } = scripted({ failChecks: ["a2"] });
    const result = await mapRunAngleMap(input(caller));
    expect(result.choice?.answers[1]?.statement).toBe("Only for the night lines, where riders are few.");
    expect(result.marks.map((mark) => mark.mark)).toContain("MAP_ANSWER_REPLACED");
    expect(result.answerCheck?.replacements).toEqual([expect.objectContaining({ answerId: "a2", replacedBy: "c1", action: "REPLACED" })]);
  });

  it("a failed check call leaves the answers unchecked; a stopped map never asks it", async () => {
    const failed = scripted({}, (request) => (request.callSiteKey === "MAP:check" ? { kind: "FAILED", code: "TEST_FAILED" } : null));
    const unchecked = await mapRunAngleMap(input(failed.caller));
    expect(unchecked.marks.map((mark) => mark.mark)).toContain("MAP_CHECK_UNAVAILABLE");
    expect(Object.values(unchecked.answerCheck!.outcomes).every((outcome) => outcome === "UNCHECKED")).toBe(true);
    const stopped = scripted({}, (request) => (request.callSiteKey === "MAP:merge" ? { kind: "STOPPED", code: "RUN_COST_ENVELOPE_EXHAUSTED" } : null));
    const result = await mapRunAngleMap(input(stopped.caller));
    expect(stopped.requests.some((request) => request.callSiteKey === "MAP:check")).toBe(false);
    expect(result.marks.map((mark) => mark.mark)).toEqual(expect.arrayContaining(["MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK", "MAP_CHECK_UNAVAILABLE"]));
    // Operators only (pre-flight PF-R34.12): a stopped map says so, never "check reply missing" for a call never made.
    expect(result.marks.find((mark) => mark.mark === "MAP_CHECK_UNAVAILABLE")?.detail).toBe("map stopped");
    for (const answer of result.choice!.answers) expect([...answer.forKeyPointIds, ...answer.againstKeyPointIds]).toEqual([]);
  });

  it("engine 2 without the length row is a programming error", async () => {
    const { length: _dropped, ...noLength } = input(scripted({}).caller);
    await expect(mapRunAngleMap(noLength)).rejects.toMatchObject({ code: "MAP_ENGINE_REQUIRES_LENGTH" });
  });

  // Pre-flight PF-R34.1 (FINAL Ruling D4(b) encoding): the third test through the real classifier and the real check.
  it("D4(b): an answer with no cost named is replaced; a premise challenge (null) is exempt; each failed test is named", async () => {
    const third = scripted({ noCostChecks: ["a2"], premiseChecks: ["a1"] });
    const result = await mapRunAngleMap(input(third.caller));
    expect(result.answerCheck?.outcomes).toMatchObject({ a1: "PASSED", a2: "NO_COST", c1: "PASSED" });
    expect(result.answerCheck?.replacements).toEqual([expect.objectContaining({ answerId: "a2", replacedBy: "c1", action: "REPLACED" })]);
    // (pre-flight consistency) the checker's null reaches the result for D1 (Task 11 stores it).
    expect(result.answerCheck?.premiseExempt).toEqual(["a1"]);
    const both = scripted({ failChecks: ["a2"], noCostChecks: ["a2"] });
    expect((await mapRunAngleMap(input(both.caller))).answerCheck?.outcomes).toMatchObject({ a2: "NOT_AN_ANSWER+NO_COST" });
  });
});

describe("engine 2: 'also raised' lists the unchosen answers some AI raised (spec §5.2 item 8)", () => {
  const choice = { answers: [{ answerId: "a1", statement: "Yes.", forKeyPointIds: [], againstKeyPointIds: [], strongestRival: "a2", filled: false },
    { answerId: "a2", statement: "No.", forKeyPointIds: [], againstKeyPointIds: [], strongestRival: "a1", filled: true }], alsoRaised: [] };
  const merged = (answerId: string, answer: string, blind: string[]) => ({ answerId, answer, memberItemIds: ["ca01"], blindMakers: blind, makers: blind.length === 0 ? ["m9"] : blind, fromOppositeCase: false });
  const mergedAnswers = [merged("an01", "Yes.", ["m1"]), merged("an02", "Only at night.", ["m1", "m2"]), merged("an03", "It depends.", ["m3"]),
    merged("an04", "Shown later only.", [])];
  it("lists an unchosen merged answer raised blind, as ANSWER; never a chosen one, a failed one or one raised only when shown", () => {
    const listed = mapAlsoRaisedOf({ choice, keyPoints: [], mergedAnswers, arguedAnswers: 2, unchosenAnswers: true, checkFailed: ["It depends."] });
    expect(listed).toEqual([{ keyPointId: "an02", claim: "Only at night.", makers: ["m1", "m2"], kind: "ANSWER" }]);
  });
  it("without the flag, today's list", () => {
    expect(mapAlsoRaisedOf({ choice, keyPoints: [], mergedAnswers, arguedAnswers: 2 })).toEqual([]);
  });
});

// Carries from the earlier R3 task reviews (each case fails without the wiring it names).
describe("engine 2: the orchestrator's wiring of Tasks 5-8 (review carries)", () => {
  const fieldOf = (request: MapCallRequest<unknown>, name: string) => frameOf(request).fields.find((entry) => entry.name === name)?.content ?? "";
  /** A reply built from the script, edited, then read through the step's own classifier (as `scripted` does). */
  const edited = (request: MapCallRequest<unknown>, edit: (value: Record<string, unknown>) => void): MapCallOutcome<unknown> => {
    const frame = frameOf(request);
    const value = JSON.parse(engineMapScriptedContent(frame.contractId, frame.fields)!) as Record<string, unknown>;
    edit(value);
    const reply = JSON.stringify(value);
    if (request.spec.classify(reply, STOP).parseStatus !== "PARSED") return { kind: "FAILED", code: "TEST_UNPARSED" };
    return { kind: "OK", value: request.spec.read(reply, STOP) };
  };
  // Two makers, the planner's maker twice: the chooser is then of the planner's maker, so a checker picked as if there
  // were no chooser (the planner) would be of the chooser's own maker.
  const SHARED = [Object.freeze({ aiRef: "preview:a0", maker: "maker-a" }), Object.freeze({ aiRef: "preview:b1", maker: "maker-b" }),
    Object.freeze({ aiRef: "preview:a2", maker: "maker-a" })];
  const engineOnlyName = MAP_ENGINE_INTERNAL_FIELD_NAMES.find((name) => !MAP_INTERNAL_FIELD_NAMES.includes(name))!;
  const leaked = `Yes, as the ${engineOnlyName} says.`;

  it("Task 7: a choose fallback sides no point by code and skips engine 2's internal words; Task 8: the checker is never the chooser's maker", async () => {
    const { caller, requests } = scripted({}, (request) => {
      if (request.callSiteKey === "MAP:choose") return { kind: "FAILED", code: "TEST_FAILED" };
      // Every list also raises an answer naming an engine-2-only field: the most raised merged answer.
      if (request.step === "LIST") return edited(request, (value) => { (value.candidate_answers as string[]).push(leaked); });
      return null;
    });
    const result = await mapRunAngleMap(input(caller, { seats: SHARED }));
    expect(result.mergedAnswers.map((answer) => answer.answer)).toContain(leaked);
    expect(result.marks.map((mark) => mark.mark)).toContain("MAP_CHOOSE_FALLBACK");
    // siding "NONE": no code-chosen answer has a point on a side; the points go to the writer unsided.
    for (const answer of result.choice!.answers) expect([...answer.forKeyPointIds, ...answer.againstKeyPointIds]).toEqual([]);
    expect(result.choice!.answers.some((answer) => (answer.pointsRaised ?? []).length > 0)).toBe(true);
    // internalNames: engine 2's words, so the leaked answer is never chosen and the skip is noted.
    expect(result.choice!.answers.map((answer) => answer.statement)).not.toContain(leaked);
    expect(result.notes).toContainEqual({ note: "INTERNAL_WORDS_SKIPPED", step: "CHOOSE", detail: "key points 0, answers 1" });
    // The chooser's real seat reaches the checker picker, although choose fell back to code.
    const chooser = requests.find((request) => request.callSiteKey === "MAP:choose")!.seat;
    const checker = requests.find((request) => request.callSiteKey === "MAP:check")!.seat;
    expect(chooser.maker).toBe("maker-a");
    expect(checker.maker).toBe("maker-b");
    expect(result.answerCheck?.checker?.maker).toBe("maker-b");
  });

  it("Task 8: a merged answer the chooser kept, reworded, is never a candidate (keptMergedAnswerIds)", async () => {
    const { caller, requests } = scripted({}, (request) => (request.callSiteKey !== "MAP:choose" ? null
      : edited(request, (value) => { (value.answers as { statement: string }[])[0]!.statement = "Yes, but only on weekday mornings."; })));
    const result = await mapRunAngleMap(input(caller));
    const choose = requests.find((request) => request.callSiteKey === "MAP:choose")!;
    const shown = JSON.parse(fieldOf(choose, "answers")) as { answer_id: string; answer: string }[];
    const keptWords = shown[0]!.answer;
    expect(result.choice!.answers[0]!.statement).toBe("Yes, but only on weekday mornings.");
    const candidates = result.answerCheck!.candidates.map((candidate) => candidate.statement);
    expect(candidates).toHaveLength(3);
    expect(candidates).not.toContain(keptWords);
  });

  it("Task 6: the gap rounds' framing challenges reach choose v2's material", async () => {
    const { caller, requests } = scripted({});
    const result = await mapRunAngleMap(input(caller));
    expect(result.framingChallenges).toEqual(["The question may be too narrow about who pays."]);
    const choose = requests.find((request) => request.callSiteKey === "MAP:choose")!;
    expect(JSON.parse(fieldOf(choose, "framing_challenges"))).toEqual(["The question may be too narrow about who pays."]);
  });

  it("Task 5: rests_on reaches the items and key points built from the list replies and from the gap replies", async () => {
    // A failed merge: the code merge builds every key point from the items alone (no merger's word).
    const { caller } = scripted({}, (request) => (request.callSiteKey === "MAP:merge" ? { kind: "FAILED", code: "TEST_FAILED" } : null));
    const result = await mapRunAngleMap(input(caller));
    expect(result.marks.map((mark) => mark.mark)).toContain("MAP_MERGE_FALLBACK");
    const points = result.items.filter((item): item is MapPointItem => item.kind === "POINT");
    const listed = points.filter((item) => item.origin === "BLIND");
    const gap = points.filter((item) => item.origin === "GAP");
    expect(listed.map((item) => item.restsOn)).toEqual(expect.arrayContaining(["question", "assumption"]));
    expect(listed.every((item) => item.restsOn !== undefined)).toBe(true);
    expect(gap.map((item) => item.restsOn)).toEqual(["assumption"]);
    const holding = (itemId: string): MapKeyPoint => result.keyPoints.find((keyPoint) => keyPoint.memberItemIds.includes(itemId))!;
    expect(result.keyPoints.every((keyPoint) => keyPoint.restsOn !== undefined)).toBe(true);
    expect(holding(listed.find((item) => item.restsOn === "assumption")!.itemId).restsOn).toBe("assumption");
    expect(holding(gap[0]!.itemId).restsOn).toBe("assumption");
  });

  it("Ruling R3-T5.1: an also-raised point keeps its key point's rests_on under engine 2 only", () => {
    const keyPoint = (keyPointId: string, claim: string, restsOn: "question" | "assumption"): MapKeyPoint => ({ keyPointId, claim,
      memberItemIds: ["pt01"], blindMakers: ["m1"], gapMakers: [], makers: ["m1"], fixedAngleKinds: [], leansAgainst: false, restsOn });
    const keyPoints = [keyPoint("kp01", "The city budget is tight.", "assumption"), keyPoint("kp02", "Riders are few at night.", "question")];
    const choice = { answers: [{ answerId: "a1", statement: "Yes.", forKeyPointIds: [], againstKeyPointIds: [], strongestRival: "a2", filled: false },
      { answerId: "a2", statement: "No.", forKeyPointIds: [], againstKeyPointIds: [], strongestRival: "a1", filled: false }], alsoRaised: ["kp01", "kp02"] };
    const engine = mapAlsoRaisedOf({ choice, keyPoints, mergedAnswers: [], arguedAnswers: 2, unchosenAnswers: true });
    expect(engine).toEqual([{ keyPointId: "kp01", claim: "The city budget is tight.", makers: ["m1"], restsOn: "assumption" },
      { keyPointId: "kp02", claim: "Riders are few at night.", makers: ["m1"], restsOn: "question" }]);
    // Engine 1: no such key at all (toEqual would not see an undefined one).
    const today = mapAlsoRaisedOf({ choice, keyPoints, mergedAnswers: [], arguedAnswers: 2 });
    expect(today.map((entry) => Object.keys(entry).sort())).toEqual([["claim", "keyPointId", "makers"], ["claim", "keyPointId", "makers"]]);
  });
});
