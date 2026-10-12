import { readPromptFrame } from "@debateai/providers";
import { describe, expect, it } from "vitest";
import {
  mapProviderPieces,
  mapRunAngleMap,
  mapRunBlindLists,
  mapRunSnowball,
  type MapCallOutcome,
  type MapCallRequest,
  type MapCaller,
  type MapResult,
  type MapRunInput,
  type MapSeat
} from "@debateai/map";

type Reply = string | "BUSY" | "FAIL" | "THROW";
type Script = (request: MapCallRequest<unknown>) => Reply;
const STOP = { finishReason: "stop" };

/**
 * A scripted caller: replies are TEXT, read through the step's own classifier, as a real gateway would. It records the
 * requests in the order they were sent and the plan positions (`order`) in the order the calls FINISHED.
 */
function scripted(script: Script, delayOf: (request: MapCallRequest<unknown>) => number = () => 0):
  { caller: MapCaller; requests: MapCallRequest<unknown>[]; finished: number[] } {
  const requests: MapCallRequest<unknown>[] = [];
  const finished: number[] = [];
  const caller: MapCaller = {
    async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
      const seen = request as MapCallRequest<unknown>;
      requests.push(seen);
      const delay = delayOf(seen);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      finished.push(request.order);
      const reply = script(seen);
      if (reply === "THROW") throw new Error("the relay fell over");
      if (reply === "BUSY") return { kind: "BUSY", code: "TEST_BUSY" };
      if (reply === "FAIL") return { kind: "FAILED", code: "TEST_FAILED" };
      if (request.spec.classify(reply, STOP).parseStatus !== "PARSED") return { kind: "FAILED", code: "TEST_UNPARSED" };
      return { kind: "OK", value: request.spec.read(reply, STOP) };
    }
  };
  return { caller, requests, finished };
}

/** The material the AI would see, read off the framed packet through the one frame reader (as the gateway's door does). */
const frameOf = (request: MapCallRequest<unknown>) => readPromptFrame(mapProviderPieces(request.spec).framed.packet);
const field = (request: MapCallRequest<unknown>, name: string) => frameOf(request).fields.find((entry) => entry.name === name)?.content ?? "";
const why = "It could change the answer for the people who ride the bus.";
const ANGLES = JSON.stringify({ angles: [
  { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The strongest case for keeping the fares." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the person asking is afraid of." },
  { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What the city should do first." },
  { angle_id: "cost", kind: "SPECIFIC", label: "The cost", focus: "Who pays for the free rides." }
] });
const list = (request: MapCallRequest<unknown>) => {
  const label = field(request, "angle_label") || "open";
  return JSON.stringify({ points: [
    { claim: "The shared point is that the cost of the change is high.", why_it_matters: why, leans: "against_some_answer" },
    { claim: `A point from the ${label} angle, number ${String(request.order)}.`, why_it_matters: why, leans: "for_some_answer" },
    { claim: `Another point from the ${label} angle, number ${String(request.order)}.`, why_it_matters: why, leans: "context" }
  ], candidate_answers: [label === "The other side" ? "No, keep the fares as they are." : "Yes, with clear conditions."] });
};
const snowball = (request: MapCallRequest<unknown>) => JSON.stringify({ points: [
  { claim: `A new point after seeing the others, number ${String(request.order)}.`, why_it_matters: why, leans: "context" }], candidate_answers: [] });
const merge = (request: MapCallRequest<unknown>) => {
  const points = JSON.parse(field(request, "points")) as { item_id: string; claim: string }[];
  const answers = JSON.parse(field(request, "candidate_answers")) as { item_id: string; answer: string }[];
  const group = <T,>(rows: T[], key: (row: T) => string) => [...new Set(rows.map(key))].map((text) => [text, rows.filter((row) => key(row) === text)] as const);
  return JSON.stringify({
    key_points: group(points, (row) => row.claim).map(([claim, rows], index) => ({ key_point_id: `k${String(index + 1)}`, claim, member_item_ids: rows.map((row) => row.item_id) })),
    answers: group(answers, (row) => row.answer).map(([answer, rows], index) => ({ answer_id: `a${String(index + 1)}`, answer, member_item_ids: rows.map((row) => row.item_id) }))
  });
};
const gap = (count: number) => JSON.stringify({ new_points: Array.from({ length: count }, (_unused, index) =>
  ({ claim: `A missing point about night buses, number ${String(index + 1)}.`, why_it_matters: why, leans: "context" })), framing_challenges: [] });
const keyPointIds = (request: MapCallRequest<unknown>) =>
  (JSON.parse(field(request, "key_points")) as { key_point_id: string }[]).map((row) => row.key_point_id);
const choose = (request: MapCallRequest<unknown>) => {
  const ids = keyPointIds(request);
  return JSON.stringify({ answers: [
    { answer_id: "a1", statement: "Yes, with clear conditions.", for: [ids[0]], against: [ids[1]], strongest_rival: "a2" },
    { answer_id: "a2", statement: "No, keep the fares as they are.", for: [ids[1]], against: [], strongest_rival: "a1" }] });
};
/** A choose reply naming three different answers: the cap on the answers (P7) is what decides how many are kept. */
const chooseThree = (request: MapCallRequest<unknown>) => {
  const ids = keyPointIds(request);
  return JSON.stringify({ answers: [
    { answer_id: "a1", statement: "Yes, with clear conditions.", for: [ids[0]], against: [], strongest_rival: "a2" },
    { answer_id: "a2", statement: "No, keep the fares as they are.", for: [ids[1]], against: [], strongest_rival: "a1" },
    { answer_id: "a3", statement: "Only at night, when the buses are nearly empty anyway.", for: [ids[2]], against: [], strongest_rival: "a1" }] });
};
const normal: Script = (request) => {
  if (request.step === "ANGLES") return ANGLES;
  if (request.step === "LIST") return list(request);
  if (request.step === "SNOWBALL") return snowball(request);
  if (request.step === "MERGE") return merge(request);
  if (request.step === "GAP") return gap(1);
  return choose(request);
};
const withChooseThree: Script = (request) => (request.step === "CHOOSE" ? chooseThree(request) : normal(request));
const SEATS = [0, 1, 2, 3, 4].map((index): MapSeat => ({ aiRef: `ai-${String(index)}`, maker: `m${String(index)}` }));
const seatsOf = (makers: readonly string[]) => makers.map((maker, index): MapSeat => ({ aiRef: `ai-${String(index)}`, maker }));
const input = (caller: MapCaller, overrides: Partial<MapRunInput> = {}): MapRunInput => ({
  questionLine: "Should a city make its central buses free to ride?", languageName: "English", languageTag: "en",
  seats: SEATS, caller, seed: "q1|C", gapRoundsMax: 2, maxAnswers: 4, pointsPerAnswer: 4, ...overrides });
const steps = (result: MapResult) => result.calls.map((call) => `${call.step}:${call.aiRef}`);
const marks = (result: MapResult) => result.marks.map((mark) => mark.mark);
const notes = (result: MapResult) => result.notes.map((note) => note.note);

describe("map arm C: the angle map", () => {
  it("plans, lists in parallel, merges, fills one gap round and chooses, in plan order", async () => {
    const result = await mapRunAngleMap(input(scripted(normal).caller));
    expect(result.kind).toBe("MAP");
    expect(steps(result)).toEqual(["ANGLES:ai-0", "LIST:ai-0", "LIST:ai-1", "LIST:ai-2", "LIST:ai-3", "MERGE:ai-1", "GAP:ai-4", "CHOOSE:ai-2"]);
    expect(result.calls.map((call) => call.callSiteKey)).toEqual(["MAP:angles", "MAP:list:0", "MAP:list:1", "MAP:list:2", "MAP:list:3",
      "MAP:merge", "MAP:gap:1", "MAP:choose"]);
    expect(result.calls.map((call) => call.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.angles.map((angle) => angle.kind)).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "SPECIFIC"]);
    expect(notes(result)).toEqual(["GAP_STOPPED"]);
    expect(marks(result).filter((mark) => mark.startsWith("MAP_"))).toEqual([]);
    const shared = result.keyPoints.find((keyPoint) => keyPoint.claim.startsWith("The shared point"))!;
    expect(shared.blindMakers).toEqual(["m0", "m1", "m2", "m3"]);
    expect(result.choice?.answers.length).toBeGreaterThanOrEqual(2);
    expect(result.calls.find((call) => call.step === "MERGE")!.shown).toEqual(result.items
      .filter((item) => item.origin === "BLIND").map((item) => item.itemId).sort());
    expect(result.calls.filter((call) => call.step === "LIST").every((call) => call.shown === "BLIND")).toBe(true);
    expect(result.items.filter((item) => item.origin === "GAP")).toHaveLength(1);
  });

  it("falls back to the fixed angles and GENERAL when the planner fails (MAP_ANGLES_FALLBACK)", async () => {
    const result = await mapRunAngleMap(input(scripted((request) => request.step === "ANGLES" ? "FAIL" : normal(request)).caller));
    expect(marks(result)).toContain("MAP_ANGLES_FALLBACK");
    expect(result.angles.map((angle) => angle.kind)).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "GENERAL"]);
  });

  it("a busy list is reassigned to the first finished seat, and the busy seat takes no later role", async () => {
    const result = await mapRunAngleMap(input(scripted((request) =>
      request.step === "LIST" && request.seat.aiRef === "ai-2" ? "BUSY" : normal(request)).caller));
    expect(notes(result)).toEqual(["LIST_REASSIGNED", "GAP_STOPPED"]);
    expect(result.calls.filter((call) => call.callSiteKey === "MAP:list:2").map((call) => `${call.aiRef}:${call.outcome}`))
      .toEqual(["ai-2:BUSY", "ai-0:OK"]);
    // Without the sit-out, ai-2 would be the chooser (see the first test).
    expect(steps(result).slice(-3)).toEqual(["MERGE:ai-1", "GAP:ai-4", "CHOOSE:ai-3"]);
  });

  it("a busy merger sits out the gap rounds and the choose", async () => {
    const result = await mapRunAngleMap(input(scripted((request) => request.step === "MERGE" ? "BUSY" : normal(request)).caller));
    expect(marks(result)).toContain("MAP_MERGE_FALLBACK");
    const after = result.calls.filter((call) => call.order > result.calls.find((entry) => entry.step === "MERGE")!.order);
    expect(after.map((call) => call.aiRef)).not.toContain("ai-1");
    expect(steps(result).slice(-2)).toEqual(["GAP:ai-4", "CHOOSE:ai-3"]);
  });

  it("merges by rule when the merge fails (MAP_MERGE_FALLBACK); with no merger the chooser starts at the third seat", async () => {
    const result = await mapRunAngleMap(input(scripted((request) => request.step === "MERGE" ? "FAIL" : normal(request)).caller));
    expect(marks(result)).toContain("MAP_MERGE_FALLBACK");
    expect(result.keyPoints.find((keyPoint) => keyPoint.claim.startsWith("The shared point"))!.memberItemIds).toHaveLength(4);
    expect(steps(result).slice(-2)).toEqual(["GAP:ai-4", "CHOOSE:ai-2"]);
  });

  it("keeps the items a merge reply left out, as their own points (MERGE_ITEMS_KEPT)", async () => {
    const onlyShared: Script = (request) => {
      if (request.step !== "MERGE") return normal(request);
      const full = JSON.parse(merge(request)) as { key_points: unknown[]; answers: unknown[] };
      return JSON.stringify({ key_points: full.key_points.slice(0, 1), answers: full.answers });
    };
    const result = await mapRunAngleMap(input(scripted(onlyShared).caller));
    expect(notes(result)).toContain("MERGE_ITEMS_KEPT");
    expect(result.keyPoints.length).toBeGreaterThan(1);
  });

  it("chooses by rule when the choose fails (MAP_CHOOSE_FALLBACK)", async () => {
    const result = await mapRunAngleMap(input(scripted((request) => request.step === "CHOOSE" ? "FAIL" : normal(request)).caller));
    expect(marks(result)).toContain("MAP_CHOOSE_FALLBACK");
    expect(result.choice?.answers.length).toBeGreaterThanOrEqual(2);
  });

  it("a caller that throws counts as a failed call (MAP_CALLER_THREW), and the fallback still gives an answer", async () => {
    const result = await mapRunAngleMap(input(scripted((request) => request.step === "CHOOSE" ? "THROW" : normal(request)).caller));
    expect(result.calls.find((call) => call.step === "CHOOSE")).toMatchObject({ outcome: "FAILED", code: "MAP_CALLER_THREW" });
    expect(marks(result)).toContain("MAP_CHOOSE_FALLBACK");
    expect(result.choice?.answers.length).toBeGreaterThanOrEqual(2);
  });

  it("gives today's opening when fewer than two lists arrive (MAP_UNAVAILABLE_TODAYS_OPENING), and asks no merge", async () => {
    const result = await mapRunAngleMap(input(scripted((request) =>
      request.step === "LIST" && request.callSiteKey !== "MAP:list:0" ? "FAIL" : normal(request)).caller));
    expect(result.kind).toBe("UNAVAILABLE");
    expect(marks(result)).toEqual(["MAP_UNAVAILABLE_TODAYS_OPENING"]);
    expect(result.calls.some((call) => call.step === "MERGE")).toBe(false);
  });

  it("goes on to a second gap round only after a round with at least 2 new points", async () => {
    const twoThenNone: Script = (request) => request.step !== "GAP" ? normal(request) : request.callSiteKey === "MAP:gap:1" ? gap(2) : gap(0);
    const result = await mapRunAngleMap(input(scripted(twoThenNone).caller));
    expect(steps(result).filter((step) => step.startsWith("GAP"))).toEqual(["GAP:ai-4", "GAP:ai-2"]);
    expect(notes(result)).toEqual(["GAP_STOPPED"]);
    expect(result.items.filter((item) => item.origin === "GAP")).toHaveLength(2);
  });

  it("skips a failed gap round without the stop rule, and tries the next round", async () => {
    const failFirst: Script = (request) => request.step === "GAP" && request.callSiteKey === "MAP:gap:1" ? "FAIL" : normal(request);
    const result = await mapRunAngleMap(input(scripted(failFirst).caller));
    expect(result.calls.filter((call) => call.step === "GAP").map((call) => call.outcome)).toEqual(["FAILED", "OK"]);
    expect(notes(result)).toEqual(["GAP_SKIPPED", "GAP_STOPPED"]);
  });

  it("needs two makers: one maker gives today's opening with no call", async () => {
    const { caller, requests } = scripted(normal);
    const result = await mapRunAngleMap(input(caller, { seats: SEATS.map((seat) => ({ ...seat, maker: "same" })) }));
    expect(result.kind).toBe("UNAVAILABLE");
    expect(marks(result)).toEqual(["MAP_UNAVAILABLE_TODAYS_OPENING"]);
    expect(requests).toHaveLength(0);
  });

  it("records the same map whatever order the parallel lists finish in", async () => {
    const plain = scripted(normal);
    const plainResult = await mapRunAngleMap(input(plain.caller));
    // The four lists hold plan positions 1-4; the later the position, the sooner the reply.
    const reversed = scripted(normal, (request) => (request.step === "LIST" ? 10 * (5 - request.order) : 0));
    const reversedResult = await mapRunAngleMap(input(reversed.caller));
    const listOrders = (orders: readonly number[]) => orders.filter((order) => order >= 1 && order <= 4);
    expect(listOrders(plain.finished)).toEqual([1, 2, 3, 4]);
    expect(listOrders(reversed.finished)).toEqual([4, 3, 2, 1]);
    expect(steps(reversedResult)).toEqual(steps(plainResult));
    expect(reversedResult).toEqual(plainResult);
  });

  it("drops each angle past the available seats with one LIST_DROPPED note (ruling P8)", async () => {
    const result = await mapRunAngleMap(input(scripted(normal).caller, { seats: SEATS.slice(0, 3) }));
    expect(result.calls.filter((call) => call.step === "LIST").map((call) => call.callSiteKey)).toEqual(["MAP:list:0", "MAP:list:1", "MAP:list:2"]);
    expect(result.notes.filter((note) => note.note === "LIST_DROPPED").map((note) => note.detail)).toEqual(["3:cost"]);
  });

  it("a list that fails again after its reassignment is dropped with ONE note, not one per failure", async () => {
    const result = await mapRunAngleMap(input(scripted((request) =>
      request.callSiteKey === "MAP:list:2" ? "FAIL" : normal(request)).caller, { seats: SEATS.slice(0, 4) }));
    expect(result.calls.filter((call) => call.callSiteKey === "MAP:list:2").map((call) => `${call.aiRef}:${call.outcome}`))
      .toEqual(["ai-2:FAILED", "ai-0:FAILED"]);
    expect(notes(result)).toEqual(["LIST_REASSIGNED", "LIST_DROPPED", "GAP_STOPPED"]);
    expect(result.notes.find((note) => note.note === "LIST_DROPPED")!.detail).toBe("2:do");
  });

  it("never shows an AI reference or a maker in any material", async () => {
    const seats = SEATS.map((seat) => ({ aiRef: `AIREF-SENTINEL-${seat.aiRef}`, maker: `MAKER-SENTINEL-${seat.maker}` }));
    const { caller, requests } = scripted(normal);
    await mapRunAngleMap(input(caller, { seats }));
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      for (const entry of request.spec.material) expect(entry.content).not.toContain("SENTINEL");
      for (const message of mapProviderPieces(request.spec).framed.packet.messages) expect(message.content).not.toContain("SENTINEL");
    }
  });
});

describe("map: the answers are capped by the makers present (spec §5, ruling P7)", () => {
  it("keeps three answers when five makers are present", async () => {
    const result = await mapRunAngleMap(input(scripted(withChooseThree).caller));
    expect(result.choice?.answers.map((answer) => answer.answerId)).toEqual(["a1", "a2", "a3"]);
  });

  it("keeps at most two answers when only two makers are present, though four were allowed", async () => {
    const result = await mapRunAngleMap(input(scripted(withChooseThree).caller, { seats: seatsOf(["m0", "m1", "m0", "m1", "m0"]) }));
    expect(result.choice?.answers.map((answer) => answer.answerId)).toEqual(["a1", "a2"]);
  });

  it("counts only the makers still available: a maker that went busy no longer counts", async () => {
    const result = await mapRunAngleMap(input(scripted((request) =>
      request.seat.aiRef === "ai-2" ? "BUSY" : withChooseThree(request)).caller, { seats: seatsOf(["m0", "m1", "m2"]) }));
    expect(result.calls.find((call) => call.aiRef === "ai-2")?.outcome).toBe("BUSY");
    expect(result.choice?.answers.map((answer) => answer.answerId)).toEqual(["a1", "a2"]);
  });

  it("never caps below two answers, even with one maker left at the choose", async () => {
    // Three makers list; the merger is m1; both gap seats (ai-2, then ai-0) go busy, leaving only m1, which may not choose.
    const result = await mapRunAngleMap(input(scripted((request) =>
      request.step === "GAP" ? "BUSY" : withChooseThree(request)).caller, { seats: seatsOf(["m0", "m1", "m2"]) }));
    expect(steps(result).filter((step) => step.startsWith("GAP"))).toEqual(["GAP:ai-2", "GAP:ai-0"]);
    expect(marks(result)).toContain("MAP_CHOOSE_FALLBACK");
    expect(marks(result)).not.toContain("ANSWERS_FILLED");
    expect(result.choice?.answers).toHaveLength(2);
  });
});

describe("map arm B: blind lists with no angle", () => {
  it("lists from every seat without an angle, then merge, one gap round and choose", async () => {
    const { caller, requests } = scripted(normal);
    const result = await mapRunBlindLists(input(caller, { gapRoundsMax: 1, seed: "q1|B" }));
    expect(result.arm).toBe("B");
    expect(steps(result)).toEqual(["LIST:ai-0", "LIST:ai-1", "LIST:ai-2", "LIST:ai-3", "LIST:ai-4", "MERGE:ai-1", "GAP:ai-2", "CHOOSE:ai-2"]);
    expect(requests.filter((request) => request.step === "LIST").every((request) => frameOf(request).contractId === "map.list.open.v1")).toBe(true);
    expect(result.angles).toEqual([]);
  });

  it("notes a failed open list as dropped and goes on with the rest", async () => {
    const result = await mapRunBlindLists(input(scripted((request) =>
      request.callSiteKey === "MAP:list:3" ? "FAIL" : normal(request)).caller, { gapRoundsMax: 1, seed: "q1|B" }));
    expect(result.kind).toBe("MAP");
    expect(result.notes.filter((note) => note.note === "LIST_DROPPED").map((note) => note.detail)).toEqual(["3:open"]);
  });
});

describe("map arm A: snowball from the first AI", () => {
  it("the first AI lists blind; each next sees the points so far and adds only new ones; then choose, no merge", async () => {
    const result = await mapRunSnowball(input(scripted(normal).caller, { seed: "q1|A" }));
    expect(result.arm).toBe("A");
    expect(steps(result)).toEqual(["LIST:ai-0", "SNOWBALL:ai-1", "SNOWBALL:ai-2", "SNOWBALL:ai-3", "SNOWBALL:ai-4", "CHOOSE:ai-2"]);
    expect(result.calls.filter((call) => call.step === "SNOWBALL").map((call) => call.shown.length)).toEqual([3, 4, 5, 6]);
    expect(result.items.filter((item) => item.origin === "SHOWN")).toHaveLength(4);
    expect(result.keyPoints).toHaveLength(7);
  });

  it("a busy AI in the snowball sits out the choose too", async () => {
    const result = await mapRunSnowball(input(scripted((request) =>
      request.seat.aiRef === "ai-2" && request.step === "SNOWBALL" ? "BUSY" : normal(request)).caller, { seed: "q1|A" }));
    expect(steps(result)).toEqual(["LIST:ai-0", "SNOWBALL:ai-1", "SNOWBALL:ai-2", "SNOWBALL:ai-3", "SNOWBALL:ai-4", "CHOOSE:ai-3"]);
    expect(notes(result)).toEqual(["LIST_DROPPED"]);
  });
});
