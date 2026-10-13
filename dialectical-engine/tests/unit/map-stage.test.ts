import { describe, expect, it } from "vitest";
import { replyLanguageExpectation, TypedDomainError } from "@debateai/kernel";
import { mapAnglesSpec, mapPromptContractHash, type MapCallRequest } from "@debateai/map";
import type { ProviderCallRequest, ProviderGateway } from "@debateai/providers";
import { createRunnerMapCaller, mapConditionRecords, mapStageBound, mapStageSeats, resolveShapeMap, type MapStageDeps } from "../../apps/runner/src/map-stage.js";
import type { MapResult } from "@debateai/map";

const BOUND = { maxAttempts: 3, tokenCeiling: 8_192, deadlineMs: 1_260_000 };
const ANGLES = JSON.stringify({ angles: [
  { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the asker fears." },
  { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What to do first." },
  { angle_id: "cost", kind: "SPECIFIC", label: "The cost", focus: "Who pays." }] });
const request = (callSiteKey = "MAP:angles"): MapCallRequest<unknown> => ({ step: "ANGLES", callSiteKey, seat: { aiRef: "ref-a", maker: "a" }, order: 0, shown: "BLIND",
  // Pre-flight PF-B39: `MapSpecContext` requires `replyLanguage` (P2a ruling R-5), built once per question.
  spec: mapAnglesSpec({ questionLine: "Should buses be free?", languageName: "English", languageTag: "en",
    replyLanguage: replyLanguageExpectation("Should buses be free?") }) as never });
const deps = (provider: ProviderGateway, extra: Partial<MapStageDeps> = {}): MapStageDeps => ({
  runId: "run-1", subjectItemId: "wi-1", mapContractHash: mapPromptContractHash(), judgeBound: BOUND, longBounds: { merge: 32_768, choose: 32_768 },
  memberOf: () => ({ provider, providerRef: "ref-a" }), sitsOut: () => false, satOutBy: () => false,
  spendStopOf: (error) => error instanceof TypedDomainError && error.code === "RUN_COST_ENVELOPE_MONEY_REACHED" ? "MONEY" : null,
  laneStopped: (error) => error instanceof TypedDomainError && (error.code === "CALL_LANE_STOPPED" || error.code === "CALL_LANE_HELD_BACK"),
  abandon: (error) => error instanceof TypedDomainError && error.code === "RUNNER_CLAIM_LOST", serial: false, ...extra });
const answering = (content: string, seen: ProviderCallRequest[] = []): ProviderGateway => ({
  call: async (call: ProviderCallRequest) => { seen.push(call); return { content } as never; } } as ProviderGateway);
const throwing = (error: unknown): ProviderGateway => ({ call: async () => { throw error; } } as unknown as ProviderGateway);

describe("the runner's map caller", () => {
  it("sends a JUDGE/served call under the map hash, no model role, the step's bound", async () => {
    const seen: ProviderCallRequest[] = [];
    const outcome = await createRunnerMapCaller(deps(answering(ANGLES, seen))).call(request());
    expect(outcome.kind).toBe("OK");
    expect(seen[0]).toMatchObject({ callSiteKey: "MAP:angles", role: "JUDGE", lane: "served", contractHash: mapPromptContractHash(),
      providerRef: "ref-a", subjectItemId: "wi-1", bound: BOUND });
    expect(seen[0]).not.toHaveProperty("modelRole");
    expect(mapStageBound(BOUND, "MERGE", { merge: 32_768, choose: 16_384 }).tokenCeiling).toBe(32_768);
    expect(mapStageBound(BOUND, "CHOOSE", { merge: 32_768, choose: 16_384 }).tokenCeiling).toBe(16_384);
    expect(mapStageBound(BOUND, "LIST", { merge: 32_768, choose: 16_384 })).toBe(BOUND);
  });

  it("never lowers the judge bound for a long step (the larger of the two is asked)", () => {
    const wide = { ...BOUND, tokenCeiling: 40_000 };
    expect(mapStageBound(wide, "MERGE", { merge: 32_768, choose: 8_192 })).toBe(wide);
    expect(mapStageBound(wide, "CHOOSE", { merge: 32_768, choose: 8_192 })).toBe(wide);
  });

  it("a money refusal is STOPPED and remembered; a lane stop is STOPPED; a busy member is BUSY; a format failure is FAILED", async () => {
    const money = createRunnerMapCaller(deps(throwing(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "x"))));
    expect(await money.call(request())).toEqual({ kind: "STOPPED", code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    expect(money.spendStop()).toBe("MONEY");
    expect(money.stopped()).toBe(true);
    expect(await createRunnerMapCaller(deps(throwing(new TypedDomainError("CALL_LANE_HELD_BACK", "x")))).call(request()))
      .toEqual({ kind: "STOPPED", code: "CALL_LANE_HELD_BACK" });
    const busy = new Error("busy");
    expect(await createRunnerMapCaller(deps(throwing(busy), { satOutBy: (error) => error === busy })).call(request()))
      .toEqual({ kind: "BUSY", code: "MAKER_SAT_OUT" });
    expect(await createRunnerMapCaller(deps(answering("not json"))).call(request())).toMatchObject({ kind: "FAILED" });
    expect(await createRunnerMapCaller(deps(answering(ANGLES), { sitsOut: () => true })).call(request()))
      .toEqual({ kind: "BUSY", code: "MAKER_SAT_OUT" });
  });

  it("names root 0's room on every map call when there is one, and never when there is none (T12-R0)", async () => {
    const seen: ProviderCallRequest[] = [];
    await createRunnerMapCaller(deps(answering(ANGLES, seen), { keepRoomMicros: 4_321 })).call(request());
    await createRunnerMapCaller(deps(answering(ANGLES, seen), { keepRoomMicros: 0 })).call(request());
    await createRunnerMapCaller(deps(answering(ANGLES, seen))).call(request());
    expect(seen[0]).toMatchObject({ keepRoomMicros: 4_321 });
    expect(seen[1]).not.toHaveProperty("keepRoomMicros");
    expect(seen[2]).not.toHaveProperty("keepRoomMicros");
  });

  it("a lost claim is rethrown (the orchestrator then rethrows it: the run is abandoned)", async () => {
    const lost = new TypedDomainError("RUNNER_CLAIM_LOST", "x");
    await expect(createRunnerMapCaller(deps(throwing(lost))).call(request())).rejects.toBe(lost);
  });

  // Task 1 NOTE: when the abandon is rethrown during the list round, list calls already running finish in the
  // background. The caller sends nothing more once it has seen the abandon (a call waiting its turn included), and
  // `settled()` resolves only once every call it sent has finished, so the runner can wait for their receipts.
  it("after an abandon nothing more is sent, and settled() waits for the calls already sent", async () => {
    const lost = new TypedDomainError("RUNNER_CLAIM_LOST", "x");
    const sent: string[] = [];
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const gateway: ProviderGateway = { call: async (call: ProviderCallRequest) => {
      sent.push(call.callSiteKey);
      if (call.callSiteKey === "MAP:list:0") throw lost;
      await held;
      return { content: ANGLES } as never;
    } } as ProviderGateway;
    const caller = createRunnerMapCaller(deps(gateway));
    const slow = caller.call(request("MAP:list:1"));
    await expect(caller.call(request("MAP:list:0"))).rejects.toBe(lost);
    await expect(caller.call(request("MAP:list:2"))).rejects.toBe(lost);
    expect(sent).toEqual(["MAP:list:1", "MAP:list:0"]);
    let settled = false;
    const settling = caller.settled().then(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(settled).toBe(false);
    release();
    await settling;
    expect(settled).toBe(true);
    expect((await slow).kind).toBe("OK");
  });

  it("serial mode: a call waiting its turn is never sent once an abandon was seen", async () => {
    const lost = new TypedDomainError("RUNNER_CLAIM_LOST", "x");
    const sent: string[] = [];
    const gateway: ProviderGateway = { call: async (call: ProviderCallRequest) => {
      sent.push(call.callSiteKey);
      await new Promise((resolve) => setTimeout(resolve, 2));
      if (call.callSiteKey === "MAP:list:0") throw lost;
      return { content: ANGLES } as never;
    } } as ProviderGateway;
    const caller = createRunnerMapCaller(deps(gateway, { serial: true }));
    const outcomes = await Promise.allSettled(["MAP:list:0", "MAP:list:1", "MAP:list:2"].map((key) => caller.call(request(key))));
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(sent).toEqual(["MAP:list:0"]);
    await caller.settled();
  });

  it("serial mode sends one call at a time, in the order asked", async () => {
    let inFlight = 0;
    let most = 0;
    const order: string[] = [];
    const slow: ProviderGateway = { call: async (call: ProviderCallRequest) => {
      inFlight += 1; most = Math.max(most, inFlight); order.push(call.callSiteKey);
      await new Promise((resolve) => setTimeout(resolve, 5)); inFlight -= 1; return { content: ANGLES } as never; } } as ProviderGateway;
    const caller = createRunnerMapCaller(deps(slow, { serial: true }));
    await Promise.all(["MAP:angles", "MAP:list:0", "MAP:list:1"].map((key) => caller.call(request(key))));
    expect(most).toBe(1);
    expect(order).toEqual(["MAP:angles", "MAP:list:0", "MAP:list:1"]);
  });

  it("map seats: the first A seats of the distinct-maker order", () => {
    const seat = (providerRef: string, maker: string) => ({ main: { providerRef, maker } });
    expect(mapStageSeats([seat("g1", "glm"), seat("g2", "glm"), seat("d", "ds"), seat("q", "qw")], 3))
      .toEqual([{ aiRef: "g1", maker: "glm" }, { aiRef: "d", maker: "ds" }, { aiRef: "q", maker: "qw" }]);
  });

  // Pre-flight PF-B47: saving the answer refuses a record with an empty node list
  // (CONDITION_MARK_AFFECTED_NODES_REQUIRED), so every map record names the served root, as runBodyStopDisclosure does.
  it("each map mark becomes an answer-scope record on the served root, with no detail text", () => {
    const records = mapConditionRecords({ marks: [{ mark: "MAP_MERGE_FALLBACK", step: "MERGE", detail: "merge reply missing" },
      { mark: "CHOOSE_QUOTA_FILLED", step: "CHOOSE", detail: "pt07" }] } as never, "run-1", "node-0");
    expect(records).toEqual([
      { mark: "MAP_MERGE_FALLBACK", scope: "answer", subjectRef: "run-1", reason: "MAP_MERGE_FALLBACK:MERGE", liftPath: null, servedRootRule: null, affectedNodeIds: ["node-0"] },
      { mark: "CHOOSE_QUOTA_FILLED", scope: "answer", subjectRef: "run-1", reason: "CHOOSE_QUOTA_FILLED:CHOOSE", liftPath: null, servedRootRule: null, affectedNodeIds: ["node-0"] }]);
  });

  // Task 3 NOTE: the honesty drawer keys each record by `${mark}:${subject_ref}` and prints `reason` raw, and the story
  // writer reads `${mark}: ${reason}`: a repeated mark needs its own subject ref, and no record carries the detail text.
  it("a repeated mark gets a distinct subject ref, and no reason carries ids or detail text", () => {
    const records = mapConditionRecords({ marks: [
      { mark: "CHOOSE_QUOTA_FILLED", step: "CHOOSE", detail: "SINGLE_AI:k3" },
      { mark: "ANSWERS_FILLED", step: "CHOOSE", detail: "TEMPLATE" },
      { mark: "CHOOSE_QUOTA_FILLED", step: "CHOOSE", detail: "OPPOSITE_CASE:k7" },
      { mark: "ANSWERS_FILLED", step: "CHOOSE", detail: "MAP_CANDIDATE" },
      { mark: "CHOOSE_QUOTA_FILLED", step: "CHOOSE", detail: "ASKER_WORRY:k9" }] } as never, "run-1", "node-0");
    expect(records.map((record) => record.subjectRef)).toEqual(["run-1", "run-1", "run-1:2", "run-1:2", "run-1:3"]);
    expect(new Set(records.map((record) => `${record.mark}:${record.subjectRef}`)).size).toBe(records.length);
    for (const record of records) {
      expect(record.reason).toMatch(/^[A-Z_]+:[A-Z]+$/u);
      for (const detail of ["k3", "k7", "k9", "TEMPLATE", "MAP_CANDIDATE", "SINGLE_AI"]) expect(record.reason).not.toContain(detail);
    }
  });

  // Amendment 2026-10-13 (P2L amendment 4, CR-3): every MARK the map returns becomes a record, never a fixed list of
  // them; the map's NOTES (operator facts such as LIST_REASSIGNED, and P2L's LANGUAGE_PLANNER_DISAGREES) never do.
  it("converts every mark the result holds, and never a note", () => {
    const records = mapConditionRecords({
      marks: ["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK", "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED"]
        .map((mark) => ({ mark, step: "MAP", detail: "x" })),
      notes: [{ note: "LIST_REASSIGNED", step: "LIST", detail: "2" }]
    } as never, "run-1", "node-0");
    expect(records.map((record) => record.mark)).toEqual(["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK",
      "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED"]);
    expect(records.every((record) => record.affectedNodeIds.length === 1 && record.affectedNodeIds[0] === "node-0")).toBe(true);
  });
});

/** Fix round 1: where the run's map comes from — the stored one, or a new one, and the stored one when another copy won. */
describe("resolveShapeMap", () => {
  const result = (stoppedBy: string | null, tag: string): MapResult => ({ arm: "C", kind: "MAP", angles: [], items: [], keyPoints: [],
    mergedAnswers: [], framingChallenges: [tag], choice: null, marks: [], notes: [], calls: [], stoppedBy }) as MapResult;
  const spendStopOfCode = (code: string) => code === "RUN_COST_ENVELOPE_MONEY_REACHED" ? "MONEY" as const
    : code === "RUN_COST_ENVELOPE_EXHAUSTED" ? "ATTEMPTS" as const : null;
  const storeOf = (stored: MapResult | null, onWrite: () => "INSERTED" | "ALREADY_PRESENT" | "RUN_ERASED", written: unknown[] = []) => {
    let row = stored;
    return { written, store: {
      readMapResultForRun: async () => row,
      writeMapRun: async (input: Readonly<{ runId: string; result: MapResult; answerCount: number }>) => {
        written.push(input);
        const outcome = onWrite();
        if (outcome === "ALREADY_PRESENT") row = result(null, "winner");
        return outcome;
      }
    } };
  };

  it("a re-claimed run reuses its stored map, asks nothing, and restores a money stop the map met (Minor 2)", async () => {
    let asked = 0;
    const { store, written } = storeOf(result("RUN_COST_ENVELOPE_MONEY_REACHED", "stored"), () => "INSERTED");
    const resolved = await resolveShapeMap({ store, runId: "run-1", answerCount: () => 2, spendStopOfCode,
      runMap: async () => { asked += 1; return { result: result(null, "new"), spendStop: null }; } });
    expect(asked).toBe(0);
    expect(written).toEqual([]);
    expect(resolved.result.framingChallenges).toEqual(["stored"]);
    expect(resolved.spendStop).toBe("MONEY");
    // A lane stop is not a spend stop: nothing is restored.
    const laneStopped = await resolveShapeMap({ store: storeOf(result("CALL_LANE_HELD_BACK", "stored"), () => "INSERTED").store,
      runId: "run-1", answerCount: () => 2, spendStopOfCode, runMap: async () => ({ result: result(null, "new"), spendStop: null }) });
    expect(laneStopped.spendStop).toBeNull();
  });

  it("a first claim asks the map, stores it with the run's answer count, and keeps its own stop", async () => {
    const { store, written } = storeOf(null, () => "INSERTED");
    const resolved = await resolveShapeMap({ store, runId: "run-1", answerCount: () => 3, spendStopOfCode,
      runMap: async () => ({ result: result("RUN_COST_ENVELOPE_EXHAUSTED", "new"), spendStop: "ATTEMPTS" }) });
    expect(resolved.result.framingChallenges).toEqual(["new"]);
    expect(resolved.spendStop).toBe("ATTEMPTS");
    expect(written).toEqual([{ runId: "run-1", result: result("RUN_COST_ENVELOPE_EXHAUSTED", "new"), answerCount: 3 }]);
  });

  it("an erased run stops the run as the graph's own write does: PRIVATE_CONTENT_ERASED (binding note 4)", async () => {
    const { store } = storeOf(null, () => "RUN_ERASED");
    await expect(resolveShapeMap({ store, runId: "run-1", answerCount: () => 2, spendStopOfCode,
      runMap: async () => ({ result: result(null, "own"), spendStop: null }) })).rejects.toMatchObject({ code: "PRIVATE_CONTENT_ERASED" });
  });

  it("a second writer that loses the race argues the STORED map, not its own (Important 1)", async () => {
    const { store } = storeOf(null, () => "ALREADY_PRESENT");
    const resolved = await resolveShapeMap({ store, runId: "run-1", answerCount: () => 2, spendStopOfCode,
      runMap: async () => ({ result: result(null, "loser"), spendStop: null }) });
    expect(resolved.result.framingChallenges).toEqual(["winner"]);
    expect(resolved.spendStop).toBeNull();
    // Its own map's money stop still stands: the money it spent is spent.
    const stopped = await resolveShapeMap({ store: storeOf(null, () => "ALREADY_PRESENT").store, runId: "run-1", answerCount: () => 2,
      spendStopOfCode, runMap: async () => ({ result: result("RUN_COST_ENVELOPE_MONEY_REACHED", "loser"), spendStop: "MONEY" }) });
    expect(stopped.result.framingChallenges).toEqual(["winner"]);
    expect(stopped.spendStop).toBe("MONEY");
  });
});
