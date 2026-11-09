// tests/unit/path-gap.test.ts
// V4 start step, Task 47 (spec 2026-11-03 §4.3): after Start, on paid plans, the "what did the others miss" round for a path debate. One
// drafted contract (map.gap-paths.v1, awaiting the owners' wording), up to two rounds on rotating seats, each reading the points raised so
// far, and a reader that keeps only what fits: a point for a path it was given (else for the question as a whole), never a repeat, at most
// 20 a round and 40 in all, each at most 400 characters. A scripted caller whose replies are TEXT read by the call's own spec. Data is made up.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PATH_RESULT_LIMITS, READER_SENTENCE_WRITING, readerField, type ReadingLevel } from "@debateai/kernel";
import {
  PATH_GAP_CONTRACT_ID, PATH_GAP_DRAFT_CONTRACTS, PATH_GAP_LIMITS, mapContractNameOf, mapEngineContractNameOf, mapRunPathGapRounds, pathGapCallSiteKey,
  type MapCallOutcome, type MapCallRequest, type MapCaller, type MapSeat
} from "@debateai/map";
import { PathGapRoundSchema } from "@debateai/contract";
import { engineSealedContracts } from "../../apps/runner/src/engine-contracts.js";

const Q = "Should the town build a second ferry pier before next summer?";
const STOP = { finishReason: "stop" };
const A: MapSeat = { aiRef: "a", maker: "A" };
const B: MapSeat = { aiRef: "b", maker: "B" };
const PATHS = [
  { pathId: "b1" as const, title: "Whole-system costs", question: "What would the pier cost to build and run each year?", viewpoints: ["Building costs: what would it cost?"] },
  { pathId: "b2" as const, title: "Winter use", question: "Would the pier be used at all in the winter months?", viewpoints: ["Ferries in the winter: do they run?"] }
];
const point = (text: string, path: string | null) => ({ text, path });
const reply = (points: readonly Readonly<{ text: string; path: string | null }>[]): string => JSON.stringify({ points });
const field = (request: MapCallRequest<unknown>, name: string): string | undefined => request.spec.material.find((entry) => entry.name === name)?.content;

function scripted(replies: readonly (string | "FAIL")[]) {
  const requests: MapCallRequest<unknown>[] = [];
  const caller: MapCaller = {
    async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
      const text = replies[requests.length];
      requests.push(request as MapCallRequest<unknown>);
      if (text === undefined || text === "FAIL") return { kind: "FAILED", code: "TEST_FAILED" };
      if (request.spec.classify(text, STOP).parseStatus !== "PARSED") return { kind: "FAILED", code: "TEST_UNPARSED" };
      return { kind: "OK", value: request.spec.read(text, STOP) };
    }
  };
  return { caller, requests };
}
const RUN = { questionLine: Q, languageName: "English", languageTag: "en", readingLevel: null as ReadingLevel | null, paths: PATHS,
  alreadyRaised: ["The harbour is silting up."], seats: [A, B] };

describe("the drafted contract", () => {
  it("one draft, awaiting the owners' wording, unsealed; no field names, no example ids, no reader sentence", () => {
    expect(PATH_GAP_CONTRACT_ID).toBe("map.gap-paths.v1");
    expect(PATH_GAP_DRAFT_CONTRACTS.map((contract) => contract.contractId)).toEqual([PATH_GAP_CONTRACT_ID]);
    expect(readFileSync(join(process.cwd(), "packages/map/src/path-gap-prompts.ts"), "utf8").split("// OWNER WORDING — approve before switch-on").length - 1)
      .toBe(1);
    const [draft] = PATH_GAP_DRAFT_CONTRACTS;
    expect(draft!.instruction).not.toMatch(/[A-Za-z]+_[A-Za-z]+/u);
    expect(draft!.answerForm).not.toMatch(/\b(pt[1-9][1-6]|kp\d{2}|cd[1-3]|sg[1-9]|g[1-7]|b[1-8])\b/u);
    expect(draft!.answerForm.startsWith("Return only one JSON object with exactly this schema and no additional keys:")).toBe(true);
    expect(draft!.instruction).not.toContain(READER_SENTENCE_WRITING);
    expect(draft!.instruction).not.toContain("Write for the reader");
    expect(engineSealedContracts().map((contract) => contract.contractId)).not.toContain(PATH_GAP_CONTRACT_ID);
    expect([mapContractNameOf(PATH_GAP_CONTRACT_ID), mapEngineContractNameOf(PATH_GAP_CONTRACT_ID)]).toEqual([null, null]);
    expect(PATH_GAP_LIMITS).toEqual({ pointsPerRoundMax: 20, roundsMax: 2 });
    expect(pathGapCallSiteKey(2)).toBe("MAP:gap-paths:2");
  });
});

describe("the gap rounds", () => {
  it("no level: no reader field and no reader sentence; a level: both, the sentence before the language line", async () => {
    const plain = scripted([reply([])]);
    await mapRunPathGapRounds({ ...RUN, readingLevel: "plain", rounds: 1, caller: plain.caller });
    const told = plain.requests[0]!.spec;
    expect(told.material.map((entry) => entry.name)).toEqual(["question_line", "paths", "already_raised", "reader", "question_language"]);
    expect(field(plain.requests[0]!, "reader")).toBe(readerField("plain").content);
    expect(told.contract.instruction).toContain(`\n\n${READER_SENTENCE_WRITING}\n\n`);
    expect(told.contract.instruction.indexOf(READER_SENTENCE_WRITING)).toBeLessThan(told.contract.instruction.lastIndexOf("\n\n"));
    const none = scripted([reply([])]);
    await mapRunPathGapRounds({ ...RUN, rounds: 1, caller: none.caller });
    expect(none.requests[0]!.spec.material.map((entry) => entry.name)).toEqual(["question_line", "paths", "already_raised", "question_language"]);
    expect(none.requests[0]!.spec.contract.instruction).not.toContain(READER_SENTENCE_WRITING);
    expect(field(none.requests[0]!, "paths")).toBe(JSON.stringify(PATHS.map((path) => ({ id: path.pathId, title: path.title, question: path.question,
      viewpoints: path.viewpoints }))));
  });

  it("no round asks nothing", async () => {
    const script = scripted([]);
    expect(await mapRunPathGapRounds({ ...RUN, rounds: 0, caller: script.caller })).toEqual({ round: { points: [] }, roundCount: 0, calls: [] });
    expect(script.requests).toEqual([]);
  });

  it("two rounds on rotating seats; the second reads the first's points", async () => {
    const script = scripted([reply([point("Ticket prices would have to rise to pay for it.", "b1")]),
      reply([point("Nobody asked the ferry crews whether they want a second pier.", null)])]);
    const done = await mapRunPathGapRounds({ ...RUN, rounds: 2, caller: script.caller });
    expect(script.requests.map((request) => [request.callSiteKey, request.step, request.seat.aiRef])).toEqual([["MAP:gap-paths:1", "GAP", "a"],
      ["MAP:gap-paths:2", "GAP", "b"]]);
    expect(JSON.parse(field(script.requests[0]!, "already_raised")!)).toEqual(["The harbour is silting up."]);
    expect(JSON.parse(field(script.requests[1]!, "already_raised")!)).toEqual(["The harbour is silting up.", "Ticket prices would have to rise to pay for it."]);
    expect(done.round).toEqual({ points: [{ text: "Ticket prices would have to rise to pay for it.", path_id: "b1" },
      { text: "Nobody asked the ferry crews whether they want a second pier.", path_id: null }] });
    expect(done.roundCount).toBe(2);
    expect(done.calls.map((call) => [call.callSiteKey, call.order, call.outcome])).toEqual([["MAP:gap-paths:1", 0, "OK"], ["MAP:gap-paths:2", 1, "OK"]]);
    expect(PathGapRoundSchema.safeParse(done.round).success).toBe(true);
  });

  it("never more than two rounds; one seat asks every round", async () => {
    const script = scripted([reply([]), reply([]), reply([])]);
    const done = await mapRunPathGapRounds({ ...RUN, seats: [A], rounds: 3, caller: script.caller });
    expect(script.requests.map((request) => [request.callSiteKey, request.seat.aiRef])).toEqual([["MAP:gap-paths:1", "a"], ["MAP:gap-paths:2", "a"]]);
    expect(done.roundCount).toBe(2);
  });

  it("keeps only what fits: an unknown path is the question's, a repeat is dropped, 20 a round, 400 characters", async () => {
    const many = Array.from({ length: 25 }, (_unused, at) => point(`A different worry about the pier, number ${String(at + 1)}.`, "b2"));
    const script = scripted([reply([point("Ferry fares could double in the first year.", "b9"), point("The harbour is silting up.", "b1"),
      point("Ferry fares could double in the first year!", null), point("x".repeat(PATH_RESULT_LIMITS.gapPointMaxChars + 1), "b1"), ...many])]);
    const done = await mapRunPathGapRounds({ ...RUN, rounds: 1, caller: script.caller });
    expect(done.round.points[0]).toEqual({ text: "Ferry fares could double in the first year.", path_id: null });
    expect(done.round.points).toHaveLength(PATH_GAP_LIMITS.pointsPerRoundMax);
    expect(done.round.points.slice(1).every((one) => one.path_id === "b2" && one.text.startsWith("A different worry"))).toBe(true);
    expect(PathGapRoundSchema.safeParse(done.round).success).toBe(true);
  });

  it("forty in all over the two rounds", async () => {
    const round = (from: number) => reply(Array.from({ length: 20 }, (_unused, at) => point(`Another point about the pier, number ${String(from + at)}.`, null)));
    const done = await mapRunPathGapRounds({ ...RUN, rounds: 2, caller: scripted([round(1), round(21)]).caller });
    expect(done.round.points).toHaveLength(PATH_RESULT_LIMITS.gapPointsMax);
    expect(PathGapRoundSchema.safeParse(done.round).success).toBe(true);
  });

  it("a failed round gives nothing and leaves the other", async () => {
    const firstFails = await mapRunPathGapRounds({ ...RUN, rounds: 2,
      caller: scripted(["FAIL", reply([point("Nobody asked the ferry crews whether they want a second pier.", "b2")])]).caller });
    expect(firstFails.round.points).toEqual([{ text: "Nobody asked the ferry crews whether they want a second pier.", path_id: "b2" }]);
    expect(firstFails.calls.map((call) => call.outcome)).toEqual(["FAILED", "OK"]);
    const secondFails = await mapRunPathGapRounds({ ...RUN, rounds: 2,
      caller: scripted([reply([point("Ticket prices would have to rise to pay for it.", "b1")]), "FAIL"]).caller });
    expect(secondFails.round.points).toEqual([{ text: "Ticket prices would have to rise to pay for it.", path_id: "b1" }]);
  });

  it("no seat asks nothing", async () => {
    const script = scripted([reply([])]);
    expect(await mapRunPathGapRounds({ ...RUN, seats: [], rounds: 2, caller: script.caller })).toEqual({ round: { points: [] }, roundCount: 0, calls: [] });
    expect(script.requests).toEqual([]);
  });
});
