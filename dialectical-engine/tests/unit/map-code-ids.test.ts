import { describe, expect, it } from "vitest";
import { readPromptFrame } from "@debateai/providers";
import {
  MAP_LIMITS,
  mapApplyMerge,
  mapAssignItemIds,
  mapFinishChoice,
  mapItemsById,
  mapKeyPoint,
  mapMergedAnswer,
  mapProviderPieces,
  mapRunAngleMap,
  mapRunBlindLists,
  mapRunSnowball,
  type MapCallOutcome,
  type MapCallRequest,
  type MapCaller,
  type MapItemDraft,
  type MapResult,
  type MapRunInput,
  type MapSeat
} from "@debateai/map";

/**
 * Controller ruling T7-PRIV: every id that can reach a readable column (core.map_item.angle_id,
 * core.map_position.answer_id) is minted by code, never written by an AI. An AI's own ids (slugs such as
 * "sell-family-home") are private content in token form: they would outlive account erasure in a readable column. They
 * may live only inside the raw reply text, which the runner stores encrypted. MapResult carries no raw reply, so no AI
 * id may appear anywhere in it.
 */
type Reply = string | "FAIL";
type Script = (request: MapCallRequest<unknown>) => Reply;
const STOP = { finishReason: "stop" };

function scripted(script: Script): { caller: MapCaller; requests: MapCallRequest<unknown>[] } {
  const requests: MapCallRequest<unknown>[] = [];
  const caller: MapCaller = {
    async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
      requests.push(request as MapCallRequest<unknown>);
      const reply = script(request as MapCallRequest<unknown>);
      if (reply === "FAIL") return { kind: "FAILED", code: "TEST_FAILED" };
      if (request.spec.classify(reply, STOP).parseStatus !== "PARSED") return { kind: "FAILED", code: "TEST_UNPARSED" };
      return { kind: "OK", value: request.spec.read(reply, STOP) };
    }
  };
  return { caller, requests };
}

const frameOf = (request: MapCallRequest<unknown>) => readPromptFrame(mapProviderPieces(request.spec).framed.packet);
const field = (request: MapCallRequest<unknown>, name: string) => frameOf(request).fields.find((entry) => entry.name === name)?.content ?? "";
const why = "It decides whether the family can afford the next ten years.";

/** Every id an AI writes in these scripts. None may survive into MapResult. */
const AI_IDS = ["sell-family-home", "keep-renting", "move-abroad", "grandmas-house", "rent-burden", "mortgage-gone",
  "sell-it-now", "stay-put-forever", "wait-and-see"] as const;

const ANGLES = JSON.stringify({ angles: [
  { angle_id: "grandmas-house", kind: "SPECIFIC", label: "The house itself", focus: "What the house means to the family." },
  { angle_id: "sell-family-home", kind: "OPPOSITE_CASE", label: "The other side", focus: "The strongest case for selling now." },
  { angle_id: "keep-renting", kind: "ASKER_WORRY", label: "The worry", focus: "What the person asking is afraid of." },
  { angle_id: "move-abroad", kind: "PRACTICAL", label: "What to do", focus: "What the family should do first." }
] });
const list = (request: MapCallRequest<unknown>) => {
  const label = field(request, "angle_label") || "open";
  return JSON.stringify({ points: [
    { claim: "The shared point is that the house costs a lot to keep.", why_it_matters: why, leans: "against_some_answer" },
    { claim: `A point from the ${label} angle, number ${String(request.order)}.`, why_it_matters: why, leans: "for_some_answer" },
    { claim: `Another point from the ${label} angle, number ${String(request.order)}.`, why_it_matters: why, leans: "context" }
  ], candidate_answers: [label === "The other side" ? "Sell the house this year." : "Keep the house for now."] });
};
const snowball = (request: MapCallRequest<unknown>) => JSON.stringify({ points: [
  { claim: `A new point after seeing the others, number ${String(request.order)}.`, why_it_matters: why, leans: "context" }],
candidate_answers: ["Keep the house for now."] });
/** The merger names its groups with its own slugs; the code renames them. */
const merge = (request: MapCallRequest<unknown>) => {
  const points = JSON.parse(field(request, "points")) as { item_id: string; claim: string }[];
  const answers = JSON.parse(field(request, "candidate_answers")) as { item_id: string; answer: string }[];
  const group = <T,>(rows: T[], key: (row: T) => string) => [...new Set(rows.map(key))].map((text) => [text, rows.filter((row) => key(row) === text)] as const);
  const kpSlugs = ["rent-burden", "mortgage-gone"];
  const anSlugs = ["sell-it-now", "wait-and-see"];
  return JSON.stringify({
    key_points: group(points, (row) => row.claim).map(([claim, rows], index) => ({ key_point_id: kpSlugs[index] ?? `rent-burden-${String(index)}`,
      claim, member_item_ids: rows.map((row) => row.item_id) })),
    answers: group(answers, (row) => row.answer).map(([answer, rows], index) => ({ answer_id: anSlugs[index] ?? `sell-it-now-${String(index)}`,
      answer, member_item_ids: rows.map((row) => row.item_id) }))
  });
};
const gap = () => JSON.stringify({ new_points: [{ claim: "A missing point about the neighbours.", why_it_matters: why, leans: "context" }],
  framing_challenges: [] });
const shownKeyPointIds = (request: MapCallRequest<unknown>) =>
  (JSON.parse(field(request, "key_points")) as { key_point_id: string }[]).map((row) => row.key_point_id);
const shownAnswerIds = (request: MapCallRequest<unknown>) =>
  (JSON.parse(field(request, "answers")) as { answer_id: string }[]).map((row) => row.answer_id);
/** The chooser writes slugs of its own, and names its rivals by them. */
const choose = (request: MapCallRequest<unknown>) => {
  const ids = shownKeyPointIds(request);
  return JSON.stringify({ answers: [
    { answer_id: "sell-family-home", statement: "Sell the house this year.", for: [ids[0]], against: [ids[1]], strongest_rival: "stay-put-forever" },
    { answer_id: "stay-put-forever", statement: "Keep the house for now.", for: [ids[1]], against: [], strongest_rival: "sell-family-home" },
    { answer_id: "move-abroad", statement: "Rent it out and move abroad.", for: [ids[2]], against: [], strongest_rival: "sell-family-home" }] });
};
const script = (overrides: Partial<Record<MapCallRequest<unknown>["step"], Script>> = {}): Script => (request) => {
  const own = overrides[request.step];
  if (own !== undefined) return own(request);
  if (request.step === "ANGLES") return ANGLES;
  if (request.step === "LIST") return list(request);
  if (request.step === "SNOWBALL") return snowball(request);
  if (request.step === "MERGE") return merge(request);
  if (request.step === "GAP") return gap();
  return choose(request);
};
const SEATS = [0, 1, 2, 3, 4].map((index): MapSeat => ({ aiRef: `ai-${String(index)}`, maker: `m${String(index)}` }));
const input = (caller: MapCaller, overrides: Partial<MapRunInput> = {}): MapRunInput => ({
  questionLine: "Should we sell the family home?", languageName: "English", languageTag: "en",
  seats: SEATS, caller, seed: "q-home|C", gapRoundsMax: 2, maxAnswers: 4, pointsPerAnswer: 4, ...overrides });

/** No AI-written id anywhere in the result: angles, items, key points, answers, choice, marks, notes, call records. */
function expectNoAiId(result: MapResult): void {
  const text = JSON.stringify(result);
  for (const slug of AI_IDS) expect(text, slug).not.toContain(slug);
}
function expectCodeIds(result: MapResult): void {
  result.angles.forEach((angle, index) => expect(angle.angleId).toBe(`g${String(index + 1)}`));
  const angleIds = new Set(result.angles.map((angle) => angle.angleId));
  for (const item of result.items) if (item.angleId !== null) expect(angleIds.has(item.angleId), item.angleId).toBe(true);
  const keyPointIds = new Set(result.keyPoints.map((keyPoint) => keyPoint.keyPointId));
  const itemIds = new Set(result.items.map((item) => item.itemId));
  for (const keyPoint of [...result.keyPoints, ...result.mergedAnswers]) for (const id of keyPoint.memberItemIds) expect(itemIds.has(id), id).toBe(true);
  const answers = result.choice?.answers ?? [];
  answers.forEach((answer, index) => expect(answer.answerId).toBe(`a${String(index + 1)}`));
  const answerIds = new Set(answers.map((answer) => answer.answerId));
  for (const answer of answers) {
    expect(answerIds.has(answer.strongestRival), answer.strongestRival).toBe(true);
    expect(answer.strongestRival).not.toBe(answer.answerId);
    for (const id of [...answer.forKeyPointIds, ...answer.againstKeyPointIds]) expect(keyPointIds.has(id), id).toBe(true);
  }
  for (const id of result.choice?.alsoRaised ?? []) expect(keyPointIds.has(id), id).toBe(true);
}

describe("map code ids (T7-PRIV): no AI-written id reaches MapResult", () => {
  it("arm C: angles become g1..gN in plan order, the chosen answers a1..aN in choice order, rivals remapped", async () => {
    const { caller, requests } = scripted(script());
    const result = await mapRunAngleMap(input(caller));
    expect(result.kind).toBe("MAP");
    expectNoAiId(result);
    expectCodeIds(result);
    // Plan order: the three fixed kinds first, then the planner's specific angle.
    expect(result.angles.map((angle) => `${angle.angleId}:${angle.kind}:${angle.label}`)).toEqual([
      "g1:OPPOSITE_CASE:The other side", "g2:ASKER_WORRY:The worry", "g3:PRACTICAL:What to do", "g4:SPECIFIC:The house itself"]);
    // Each list item carries its own angle's code id.
    const labelOf = new Map(result.angles.map((angle) => [angle.angleId, angle.label] as const));
    for (const item of result.items.filter((entry) => entry.origin === "BLIND")) {
      expect(labelOf.get(item.angleId!)).toBe(result.angles[item.listIndex]!.label);
    }
    // The choice keeps the chooser's statements and its rivals, by the new ids.
    expect(result.choice!.answers.map((answer) => `${answer.answerId}:${answer.statement}>${answer.strongestRival}`)).toEqual([
      "a1:Sell the house this year.>a2", "a2:Keep the house for now.>a1", "a3:Rent it out and move abroad.>a1"]);
    // The chooser was shown code ids only: key points and merged answers, never the merger's slugs.
    const chooseRequest = requests.find((request) => request.step === "CHOOSE")!;
    for (const id of [...shownKeyPointIds(chooseRequest), ...shownAnswerIds(chooseRequest)]) expect(id).toMatch(/^(kp|an)[0-9]{2}$/u);
    expect(JSON.stringify(chooseRequest.shown)).not.toMatch(/rent-burden|sell-it-now|wait-and-see|mortgage-gone/u);
  });

  it("arm C with the angles fallback: the code's own angles are g1..g4 too", async () => {
    const { caller } = scripted(script({ ANGLES: () => "FAIL" }));
    const result = await mapRunAngleMap(input(caller));
    expect(result.marks.map((mark) => mark.mark)).toContain("MAP_ANGLES_FALLBACK");
    expect(result.angles.map((angle) => `${angle.angleId}:${angle.kind}`)).toEqual(["g1:OPPOSITE_CASE", "g2:ASKER_WORRY", "g3:PRACTICAL", "g4:GENERAL"]);
    expectNoAiId(result);
    expectCodeIds(result);
  });

  it("a list dropped or reassigned is noted by its code angle id, never the planner's slug", async () => {
    const { caller } = scripted(script({ LIST: (request) => (request.callSiteKey === "MAP:list:1" ? "FAIL" : list(request)) }));
    const result = await mapRunAngleMap(input(caller, { seats: SEATS.slice(0, 3) }));
    const details = result.notes.filter((note) => note.note === "LIST_REASSIGNED" || note.note === "LIST_DROPPED").map((note) => note.detail);
    expect(details.length).toBeGreaterThan(0);
    for (const detail of details) expect(detail).toMatch(/^[0-9]+:g[1-7]$/u);
    expectNoAiId(result);
  });

  it("a chooser that names one answer: the filled answer is a2 (no filled-N form), its rival a1", async () => {
    const one: Script = (request) => {
      const ids = shownKeyPointIds(request);
      return JSON.stringify({ answers: [{ answer_id: "sell-family-home", statement: "Sell the house this year.", for: [ids[0]], against: [],
        strongest_rival: null }] });
    };
    const { caller } = scripted(script({ CHOOSE: one }));
    const result = await mapRunAngleMap(input(caller));
    expect(result.choice!.answers.map((answer) => `${answer.answerId}:${String(answer.filled)}>${answer.strongestRival}`))
      .toEqual(["a1:false>a2", "a2:true>a1"]);
    expectNoAiId(result);
    expectCodeIds(result);
  });

  it("a chooser that reuses a merged answer's id gets a1..aN all the same (the merged answer keeps its own id)", async () => {
    const reuse: Script = (request) => {
      const ids = shownKeyPointIds(request);
      const answerIds = shownAnswerIds(request);
      return JSON.stringify({ answers: [
        { answer_id: answerIds[1], statement: "Keep the house, for now at least.", for: [ids[0]], against: [], strongest_rival: "sell-family-home" },
        { answer_id: "sell-family-home", statement: "Sell the house this year.", for: [ids[1]], against: [], strongest_rival: answerIds[1] }] });
    };
    const { caller } = scripted(script({ CHOOSE: reuse }));
    const result = await mapRunAngleMap(input(caller));
    expect(result.choice!.answers.map((answer) => `${answer.answerId}>${answer.strongestRival}`)).toEqual(["a1>a2", "a2>a1"]);
    expectNoAiId(result);
    expectCodeIds(result);
  });

  it("the choose fallback and the merge fallback mint code ids", async () => {
    const { caller } = scripted(script({ MERGE: () => "FAIL", CHOOSE: () => "FAIL" }));
    const result = await mapRunAngleMap(input(caller));
    expect(result.marks.map((mark) => mark.mark)).toEqual(expect.arrayContaining(["MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK"]));
    expectNoAiId(result);
    expectCodeIds(result);
  });

  it.each([["B", mapRunBlindLists], ["A", mapRunSnowball]] as const)("arm %s: no AI id either", async (_arm, run) => {
    const { caller } = scripted(script());
    const result = await run(input(caller, { seed: `q-home|${_arm}` }));
    expect(result.kind).toBe("MAP");
    expectNoAiId(result);
    expectCodeIds(result);
  });
});

describe("map code ids (T7-PRIV): the boundary holds for a reply the checks did not see", () => {
  const A: MapSeat = { aiRef: "ai-a", maker: "maker-a" };
  const B: MapSeat = { aiRef: "ai-b", maker: "maker-b" };
  const draft = (seat: MapSeat, listIndex: number, claim: string): MapItemDraft =>
    ({ kind: "POINT", seat, origin: "BLIND", angleId: null, angleKind: null, listIndex, position: 0, claim, whyItMatters: "Why.", leans: "context" });
  const items = mapAssignItemIds([draft(A, 0, "One"), draft(B, 1, "Two"),
    { kind: "ANSWER", seat: A, origin: "BLIND", angleId: null, angleKind: null, listIndex: 0, position: 0, answer: "Yes." }], "seed-boundary");
  const byId = mapItemsById(items);
  const pointIds = items.filter((item) => item.kind === "POINT").map((item) => item.itemId);
  const answerIds = items.filter((item) => item.kind === "ANSWER").map((item) => item.itemId);

  it("a merge member id the AI made up is dropped, never kept as a member", () => {
    const applied = mapApplyMerge({
      key_points: [{ key_point_id: "rent-burden", claim: "One and two", member_item_ids: [...pointIds, "grandmas-house"] }],
      answers: [{ answer_id: "sell-it-now", answer: "Yes.", member_item_ids: [...answerIds, "keep-renting"] }]
    }, items);
    const text = JSON.stringify(applied);
    for (const slug of ["rent-burden", "grandmas-house", "sell-it-now", "keep-renting"]) expect(text).not.toContain(slug);
    expect(applied.keyPoints[0]!.memberItemIds).toEqual(pointIds);
    expect(applied.mergedAnswers[0]!.memberItemIds).toEqual(answerIds);
  });

  it("a for/against id the AI made up is dropped; at most chooseAnswersMax answers, whatever maxAnswers says", () => {
    const keyPoints = [mapKeyPoint("kp01", "One", [pointIds[0]!], byId), mapKeyPoint("kp02", "Two", [pointIds[1]!], byId)];
    const mergedAnswers = [mapMergedAnswer("an01", "Yes.", answerIds, byId)];
    const statements = ["Yes.", "No.", "Maybe.", "Later.", "Never.", "Only in spring."];
    const out = mapFinishChoice({ keyPoints, mergedAnswers, items, languageTag: "en", maxAnswers: 9, pointsPerAnswer: 3, reply: { answers:
      statements.map((statement, index) => ({ answer_id: `${AI_IDS[index]!}`, statement, for: index === 0 ? ["kp01", "mortgage-gone"] : [],
        against: index === 1 ? ["stay-put-forever"] : [], strongest_rival: AI_IDS[(index + 1) % statements.length]! })) } });
    expect(out.choice.answers.map((answer) => answer.answerId)).toEqual(["a1", "a2", "a3", "a4"].slice(0, MAP_LIMITS.chooseAnswersMax));
    expect(out.choice.answers[0]!.forKeyPointIds).toEqual(["kp01"]);
    const text = JSON.stringify(out);
    for (const slug of AI_IDS) expect(text, slug).not.toContain(slug);
  });
});
