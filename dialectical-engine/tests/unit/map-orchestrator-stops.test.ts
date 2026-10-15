import { describe, expect, it } from "vitest";
import {
  mapErrorCodeOf, mapListCallSiteKey, mapRunAngleMap,
  type MapCallOutcome, type MapCallRequest, type MapCaller, type MapRunInput, type MapSeat
} from "@debateai/map";
import { TypedDomainError } from "@debateai/kernel";

const STOP = { finishReason: "stop" };
const why = "It matters for the riders.";
const SEATS = [0, 1, 2, 3].map((index): MapSeat => ({ aiRef: `ai-${String(index)}`, maker: `m${String(index)}` }));
const ANGLES = JSON.stringify({ angles: [
  { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the asker fears." },
  { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What to do first." },
  { angle_id: "cost", kind: "SPECIFIC", label: "The cost", focus: "Who pays." }] });
const LIST = (order: number) => JSON.stringify({ points: [
  { claim: `Point one, ${String(order)}.`, why_it_matters: why, leans: "against_some_answer" },
  { claim: `Point two, ${String(order)}.`, why_it_matters: why, leans: "for_some_answer" },
  { claim: `Point three, ${String(order)}.`, why_it_matters: why, leans: "context" }],
  candidate_answers: [order % 2 === 0 ? "Yes, with conditions." : "No, keep it as it is."] });

type Reply = string | MapCallOutcome<never> | Error;
function caller(script: (request: MapCallRequest<unknown>) => Reply): { caller: MapCaller; asked: string[] } {
  const asked: string[] = [];
  return { asked, caller: { async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
    asked.push(request.callSiteKey);
    const reply = script(request as MapCallRequest<unknown>);
    if (reply instanceof Error) throw reply;
    if (typeof reply !== "string") return reply;
    return { kind: "OK", value: request.spec.read(reply, STOP) };
  } } };
}
const input = (c: MapCaller, extra: Partial<MapRunInput> = {}): MapRunInput => ({
  questionLine: "Should a city make its buses free?", languageName: "English", languageTag: "en", seats: SEATS,
  caller: c, seed: "s|C", gapRoundsMax: 2, maxAnswers: 3, pointsPerAnswer: 3, ...extra });

describe("map stops (Phase 2 runner contract)", () => {
  it("a STOPPED call stops the map: no later call is made, the code fallbacks finish it, the stop is recorded", async () => {
    const run = caller((request) => request.step === "ANGLES" ? ANGLES
      : request.step === "LIST" ? LIST(request.order)
      : request.step === "MERGE" ? { kind: "STOPPED", code: "RUN_COST_ENVELOPE_MONEY_REACHED" } : new Error("never asked"));
    const result = await mapRunAngleMap(input(run.caller));
    expect(run.asked).toEqual(["MAP:angles", "MAP:list:0", "MAP:list:1", "MAP:list:2", "MAP:list:3", "MAP:merge"]);
    expect(result.kind).toBe("MAP");
    expect(result.stoppedBy).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(result.marks.map((mark) => mark.mark)).toEqual(expect.arrayContaining(["MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK"]));
    expect(result.notes.map((note) => note.note)).toContain("MAP_STOPPED");
    expect(result.calls.at(-1)).toMatchObject({ callSiteKey: "MAP:merge", outcome: "STOPPED", code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    expect(result.choice!.answers.length).toBeGreaterThanOrEqual(2);
  });

  it("a stop while lists run keeps the lists already paid for and reassigns nothing", async () => {
    const run = caller((request) => request.step === "ANGLES" ? ANGLES
      : request.callSiteKey === "MAP:list:1" ? { kind: "STOPPED", code: "CALL_LANE_STOPPED" }
      : request.step === "LIST" ? LIST(request.order) : new Error("never asked"));
    const result = await mapRunAngleMap(input(run.caller));
    // Exactly the first wave: no second-wave list key (MAP:list:<i>:2), no merge (a stop reassigns nothing, PF-B3).
    expect(run.asked).toEqual(["MAP:angles", "MAP:list:0", "MAP:list:1", "MAP:list:2", "MAP:list:3"]);
    expect(result.notes.map((note) => note.note)).not.toContain("LIST_REASSIGNED");
    expect(result.items.filter((item) => item.kind === "POINT")).toHaveLength(9);
    expect(result.stoppedBy).toBe("CALL_LANE_STOPPED");
  });

  it("a stop before two lists arrived ends in today's opening", async () => {
    const run = caller((request) => request.step === "ANGLES" ? { kind: "STOPPED", code: "PERSON_ALLOWANCE_REACHED" } : new Error("never"));
    const result = await mapRunAngleMap(input(run.caller));
    expect(run.asked).toEqual(["MAP:angles"]);
    expect(result.kind).toBe("UNAVAILABLE");
    expect(result.marks.map((mark) => mark.mark)).toEqual(["MAP_ANGLES_FALLBACK", "MAP_UNAVAILABLE_TODAYS_OPENING"]);
  });

  it("an error the caller marks as abandon is rethrown, never turned into a fallback", async () => {
    const lost = new TypedDomainError("RUNNER_CLAIM_LOST", "claim lost");
    const run = caller((request) => request.step === "ANGLES" ? ANGLES : lost);
    await expect(mapRunAngleMap(input(run.caller, { abandon: (error) => error === lost }))).rejects.toBe(lost);
  });

  it("a thrown typed error keeps its code; an untyped one is MAP_CALLER_THREW", async () => {
    expect(mapErrorCodeOf(new TypedDomainError("CALL_BUDGET_EXHAUSTED", "x"))).toBe("CALL_BUDGET_EXHAUSTED");
    expect(mapErrorCodeOf(new Error("boom"))).toBe("MAP_CALLER_THREW");
    expect(mapErrorCodeOf({ code: "lower case" })).toBe("MAP_CALLER_THREW");
  });

  it("a thrown typed error the caller does not abandon is recorded FAILED with its own code", async () => {
    const run = caller((request) => request.step === "ANGLES"
      ? new TypedDomainError("CALL_BUDGET_EXHAUSTED", "x") : request.step === "LIST" ? LIST(request.order) : { kind: "FAILED", code: "TEST_FAILED" });
    const result = await mapRunAngleMap(input(run.caller, { abandon: () => false }));
    expect(result.calls[0]).toMatchObject({ callSiteKey: "MAP:angles", outcome: "FAILED", code: "CALL_BUDGET_EXHAUSTED" });
    expect(result.stoppedBy).toBeNull();
  });

  it("a reassigned list is asked under its own key, after the first wave", async () => {
    expect(mapListCallSiteKey(2, 1)).toBe("MAP:list:2");
    expect(mapListCallSiteKey(2, 2)).toBe("MAP:list:2:2");
    const run = caller((request) => request.step === "ANGLES" ? ANGLES
      : request.callSiteKey === "MAP:list:2" ? { kind: "FAILED", code: "TEST_FAILED" }
      : request.step === "LIST" ? LIST(request.order) : { kind: "FAILED", code: "TEST_FAILED" });
    const result = await mapRunAngleMap(input(run.caller, { gapRoundsMax: 0 }));
    const lists = result.calls.filter((call) => call.step === "LIST").map((call) => `${call.callSiteKey}@${call.aiRef}`);
    expect(lists).toEqual(["MAP:list:0@ai-0", "MAP:list:1@ai-1", "MAP:list:2@ai-2", "MAP:list:3@ai-3", "MAP:list:2:2@ai-0"]);
  });
});
