// tests/unit/path-outcome-step.test.ts
// V4 start step, Task 49 (spec 2026-11-03 §4.3): each path's answer so far, as soon as that path's own checks end. One path's writer
// (Haiku) and checker (GLM) rounds on the served lane, 2 on a paid plan and 1 on Free, no backup writer; satisfied → READY, still
// objected after the last round → READY_WITH_RESERVATION, no draft or no root → FAILED. The trust word is code's (FELL → DIDNT_HOLD,
// else the weakest word of the points the changes rest on, or of every point under the root), the person's own words are quoted in
// order, and the outcome is stored at once and read back on a re-run. The material keeps whole points only (all, 40, 20, 10, none),
// every round-2 body stays under the 100K line, and the real count near the line moves it one step down. A scripted gateway answers
// TEXT read by each request's own classifier (two tries, as the gateway's first try and repair). Data is made up.
import { describe, expect, it } from "vitest";
import { PathOutcomeSchema, type PathOutcome, type TrustWord } from "@debateai/contract";
import {
  READER_SENTENCE_ANSWER_CHECKER, READER_SENTENCE_WRITING, TEXT_NOT_IN_QUESTION_LANGUAGE, questionLanguageField, questionLanguageFromRun,
  questionLanguageSentence, readerField, type PathId
} from "@debateai/kernel";
import {
  ANTHROPIC_TOKEN_COUNT, PREVIEW_V2_FINAL_SEATS, ProviderContentUnacceptedError, buildFramedRevisionPrompt, readPromptFrame, type PromptPacket,
  type ProviderCallRequest, type ProviderCallResult, type ProviderGateway, type TokenCounter
} from "@debateai/providers";
import { PATH_OUTCOME_CHECKER_CONTRACT_ID, PATH_OUTCOME_REPLY_ISSUES, PATH_OUTCOME_WRITER_CONTRACT_ID } from "@debateai/story";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import {
  pathOutcomeMaterial, pathsFinalSeatsOf, runPathOutcomeFor, runPathOutcomes, type PathOutcomesJob
} from "../../apps/runner/src/path-outcomes.js";
import {
  PATH_REWRITE_BODY_MAX_BYTES, PATH_REWRITE_ROUND_TWO_ROOM_BYTES, pathRewriteBodyBytes, pathRewriteDigPathsOf, pathRewriteDigPathsOfRoots,
  type PathRewritePoint, type PathRewriteQuestion
} from "../../apps/runner/src/path-rewrite-material.js";
import { fitPathOutcomeToTokenLine } from "../../apps/runner/src/token-line.js";
import { DIG_NODES, digSnapshot } from "../support/path-rewrite-world.js";

/* ----------------------------------------------------------------- the world */

const RUN = "33333333-3333-4333-8333-333333333333";
const Q = "Should the town build a second ferry pier before next summer?";
const QUESTION: PathRewriteQuestion = Object.freeze({ line: Q, place: null, time: null, purpose: null, readingLevel: null, language: null });
const ENGLISH = Object.freeze({ name: "English", tag: "en" });
const HAIKU = Object.freeze({ providerRef: "ref-haiku", model: PREVIEW_V2_FINAL_SEATS.writer, maker: "Anthropic" });
const GLM = Object.freeze({ providerRef: "ref-glm", model: PREVIEW_V2_FINAL_SEATS.checker, maker: "Z.AI" });
const DEEPSEEK = Object.freeze({ providerRef: "ref-deepseek", model: "deepseek-ai/DeepSeek-V4.1-Flash", maker: "DeepSeek" });
const SHARED = ["question", "path", "viewpoints", "points", "sources"];
const LINE = PATH_REWRITE_BODY_MAX_BYTES;
const ROOM = PATH_REWRITE_ROUND_TWO_ROOM_BYTES;

const point = (id: string, text: string, trust: TrustWord | null, over: Partial<PathRewritePoint> = {}): PathRewritePoint =>
  Object.freeze({ id, text, onId: null, side: "for" as const, trust, disputed: false, ...over });

type JobPath = PathOutcomesJob["paths"][number];
const TITLES = ["Whole-system costs", "Winter use", "Using less power first"];
function pathOf(no: number, over: Partial<JobPath> = {}): JobPath {
  return Object.freeze({
    pathId: `b${String(no)}` as PathId, pathNo: no, title: TITLES[(no - 1) % TITLES.length]!,
    question: "What would the second pier cost to build and run each year?",
    statement: "Counting upkeep, a second pier costs more than it saves before the town grows.",
    viewpoints: ["Building costs: what would it cost to build?", "Upkeep: what would it cost each year?"],
    ownWords: [], rootNodeId: `root-${String(no)}`,
    points: [point(`n${String(no)}-1`, "Queues at the pier run long at rush hour.", "SURE"),
      point(`n${String(no)}-2`, "Winter ridership falls by half.", "SURE_FOR_CASE", { side: "against" })],
    sources: [{ pointId: `n${String(no)}-1`, site: "harbour.example", link: null, title: "Pier queues", quote: "Queues reach forty minutes at eight.", line: null }],
    ...over
  });
}

const WRITTEN_TEXT = Object.freeze({
  line: "The second pier helps at rush hour, but not all year.",
  summary: "The queues at rush hour are real, but winter ridership falls by half, so the pier earns its keep in the busy months only.",
  sentence: "The arguing showed that winter ridership falls by half, which weakens the case for building the pier now."
});
const written = (over: Record<string, unknown> = {}): string => JSON.stringify({
  line: WRITTEN_TEXT.line, summary: WRITTEN_TEXT.summary, fate: "PARTLY_HELD",
  what_changed: [{ text: WRITTEN_TEXT.sentence, rests_on: ["P1", "P2"] }], view: null, ...over
});
const SATISFIED = JSON.stringify({ satisfied: true, problem: null, part: null });
const OBJECTION = JSON.stringify({ satisfied: false, problem: "The summary calls the winter figure settled, but a point still disputes it.", part: "summary" });
const VIEW = Object.freeze({ outcome: "DID_NOT_HELP" as const, scope: "PATH" as const,
  reason: "The points showed that the ferries run half empty in the winter months." });
const FAILED: PathOutcome = Object.freeze({ state: "FAILED", text: null, what_changed: [], view: null, trust: null, rests_on: [] }) as PathOutcome;

type Answer = (request: ProviderCallRequest, attempt: number) => string;
const sentOf = async (request: ProviderCallRequest, packet: PromptPacket): Promise<PromptPacket> =>
  request.vendorPacketOf === undefined ? packet : request.vendorPacketOf(packet);
function resultOf(request: ProviderCallRequest, content: string): ProviderCallResult {
  const seat = request.providerRef === HAIKU.providerRef ? HAIKU : GLM;
  return { rawArtifactRef: `raw:${request.callSiteKey}`, ledgerEntryRef: `ledger:${request.callSiteKey}`, content, provider: "openai-compatible-http",
    model: seat.model, maker: seat.maker, modelVersion: "test" };
}
/** The gateway's first try and its one repair, each read by the request's own classifier; every packet as it leaves is kept. */
function scripted(answer: Answer) {
  const requests: ProviderCallRequest[] = [];
  const sent: Array<Readonly<{ key: string; packet: PromptPacket }>> = [];
  const gateway: ProviderGateway = {
    async call(request) {
      requests.push(request);
      let packet = await sentOf(request, request.packet);
      for (let attempt = 1; ; attempt += 1) {
        sent.push(Object.freeze({ key: request.callSiteKey, packet }));
        const content = answer(request, attempt);
        const read = request.classifyContent?.(content, { finishReason: "stop" }) ?? { parseStatus: "PARSED" as const, parseError: null };
        if (read.parseStatus === "PARSED") return resultOf(request, content);
        if (attempt >= 2) throw new ProviderContentUnacceptedError(attempt, read.parseStatus, read.parseError, "raw:refused", "ledger:refused");
        packet = await sentOf(request, request.buildRepairPacket!({ rawText: content, parseStatus: read.parseStatus, parseError: read.parseError }));
      }
    }
  };
  return { gateway, requests, sent };
}
const isWriter = (request: ProviderCallRequest): boolean => request.role === "SYNTHESIZER";
const team = (writer: Answer = () => written(), checker: Answer = () => SATISFIED) =>
  scripted((request, attempt) => (isWriter(request) ? writer(request, attempt) : checker(request, attempt)));

function memoryStore(initial: ReadonlyMap<PathId, PathOutcome> = new Map()) {
  const rows = new Map(initial);
  const recorded: PathId[] = [];
  let reads = 0;
  const store: PathOutcomesJob["store"] = {
    readPathOutcomes: async (runId: string) => { reads += 1; expect(runId).toBe(RUN); return new Map(rows); },
    recordPathOutcome: async (input) => {
      expect(input.runId).toBe(RUN);
      recorded.push(input.pathId);
      if (rows.has(input.pathId)) return "ALREADY" as const;
      rows.set(input.pathId, input.outcome);
      return "RECORDED" as const;
    }
  };
  return { rows, recorded, store, reads: () => reads };
}

function jobOf(over: Partial<PathOutcomesJob> & Pick<PathOutcomesJob, "gateway" | "store">): PathOutcomesJob {
  return Object.freeze({
    runId: RUN, free: false, question: QUESTION, readingLevel: null, language: ENGLISH, paths: [pathOf(1), pathOf(2), pathOf(3)],
    seats: pathsFinalSeatsOf([DEEPSEEK, HAIKU, GLM])!, tokenCount: undefined, log: () => undefined, ...over
  });
}
const fieldsOf = (packet: PromptPacket): Map<string, string> => new Map(readPromptFrame(packet).fields.map((entry) => [entry.name, entry.content] as const));
const fenceOf = (packet: PromptPacket): string => readPromptFrame(packet).fence;
const systemOf = (packet: PromptPacket): string => packet.messages[0]!.content;

/* ----------------------------------------------------------------- the seats */

describe("pathsFinalSeatsOf", () => {
  it("Haiku writes and GLM checks, two makers; any other line-up has none (the run's answer seats then)", () => {
    expect(pathsFinalSeatsOf([DEEPSEEK, HAIKU, GLM])).toEqual({ writer: HAIKU, checker: GLM });
    expect(pathsFinalSeatsOf([DEEPSEEK, HAIKU, GLM])!.writer).toBe(HAIKU);
    expect(pathsFinalSeatsOf([HAIKU, DEEPSEEK])).toBeNull();
    expect(pathsFinalSeatsOf([GLM, DEEPSEEK])).toBeNull();
    expect(pathsFinalSeatsOf([HAIKU, { ...GLM, maker: HAIKU.maker }])).toBeNull();
    expect(pathsFinalSeatsOf([])).toBeNull();
  });
});

/* ----------------------------------------------------------------- the rounds */

describe("one path's answer so far", () => {
  it("paid: the writer on Haiku, then the checker on GLM, on the served lane; satisfied → READY, the trust word from the points it rests on", async () => {
    const { gateway, requests } = team();
    const store = memoryStore();
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: store.store }), "b1");

    expect(requests.map((request) => [request.callSiteKey, request.role, request.lane, request.providerRef])).toEqual([
      ["PATH_OUTCOME:WRITER:1:1", "SYNTHESIZER", "served", HAIKU.providerRef], ["PATH_OUTCOME:CHECKER:1:1", "EVALUATOR", "served", GLM.providerRef]]);
    expect(outcome).toEqual({ state: "READY", text: { line: WRITTEN_TEXT.line, summary: WRITTEN_TEXT.summary, fate: "PARTLY_HELD" },
      what_changed: [WRITTEN_TEXT.sentence], view: null, trust: "SURE_FOR_CASE", rests_on: ["n1-1", "n1-2"] });
    expect(PathOutcomeSchema.parse(outcome)).toEqual(outcome);
    expect(store.rows.get("b1")).toEqual(outcome);
    expect(store.recorded).toEqual(["b1"]);
    expect(requests.map((request) => readPromptFrame(request.packet).contractId)).toEqual([PATH_OUTCOME_WRITER_CONTRACT_ID, PATH_OUTCOME_CHECKER_CONTRACT_ID]);
    expect(requests.map((request) => request.bound.tokenCeiling)).toEqual([8192, 2048]);
    expect(requests.every((request) => request.contractHash === engineContractHash())).toBe(true);
    expect(requests.every((request) => request.sentInputTokensBelow === ANTHROPIC_TOKEN_COUNT.line)).toBe(true);
    // Shared fields first, the same bytes for both, so the checker reads them from the cache.
    expect(requests.map((request) => request.sharedFirstFieldCount)).toEqual([SHARED.length, SHARED.length]);
    const writer = fieldsOf(requests[0]!.packet);
    const checker = fieldsOf(requests[1]!.packet);
    expect([...writer.keys()]).toEqual([...SHARED, "question_language"]);
    expect([...checker.keys()]).toEqual([...SHARED, "answer_so_far", "question_language"]);
    for (const name of SHARED) expect(checker.get(name), name).toBe(writer.get(name));
    expect(writer.get("question")).toBe(Q);
    expect(JSON.parse(writer.get("path")!)).toEqual({ title: "Whole-system costs", question: pathOf(1).question, statement: pathOf(1).statement });
    expect(JSON.parse(writer.get("viewpoints")!)).toEqual(pathOf(1).viewpoints);
    expect(JSON.parse(writer.get("points")!)).toEqual([{ ref: "P1", text: "Queues at the pier run long at rush hour.", on: "path", side: "for" },
      { ref: "P2", text: "Winter ridership falls by half.", on: "path", side: "against" }]);
    expect(JSON.parse(writer.get("sources")!)).toEqual([{ ref: "W1", point: "P1", site: "harbour.example", title: "Pier queues",
      quote: "Queues reach forty minutes at eight." }]);
    expect(JSON.parse(checker.get("answer_so_far")!)).toMatchObject({ line: WRITTEN_TEXT.line, fate: "PARTLY_HELD" });
    // No ids reach a model: the run, the root and the points are named by refs only.
    for (const request of requests) {
      const body = JSON.stringify(request.packet.messages);
      // Whole words only: the random fence and canary are hex, and may hold "b1" inside them.
      for (const id of [RUN, "root-1", "n1-1", "n1-2", "b1"]) expect(body, id).not.toMatch(new RegExp(`(?<![0-9A-Za-z])${id}(?![0-9A-Za-z])`, "u"));
    }
  });

  it("two unsatisfied rounds: 4 calls, READY_WITH_RESERVATION; round 2 revises the writer's own draft under the same fence", async () => {
    const { gateway, requests, sent } = team(undefined, () => OBJECTION);
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: memoryStore().store }), "b1");
    expect(requests.map((request) => request.callSiteKey)).toEqual([
      "PATH_OUTCOME:WRITER:1:1", "PATH_OUTCOME:CHECKER:1:1", "PATH_OUTCOME:WRITER:1:2", "PATH_OUTCOME:CHECKER:1:2"]);
    expect(outcome.state).toBe("READY_WITH_RESERVATION");
    expect(outcome.text?.line).toBe(WRITTEN_TEXT.line);
    const second = requests[2]!.packet.messages;
    expect(second.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(second[2]!.content).toContain(WRITTEN_TEXT.line);
    expect(second[3]!.content).toContain("revision_problems");
    expect(second[3]!.content).toContain("still disputes it");
    expect(new Set(sent.map((one) => fenceOf(one.packet))).size).toBe(1);
  });

  it("Free: one round only (2 calls), even when the checker objects", async () => {
    const { gateway, requests } = team(undefined, () => OBJECTION);
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: memoryStore().store, free: true }), "b1");
    expect(requests.map((request) => request.callSiteKey)).toEqual(["PATH_OUTCOME:WRITER:1:1", "PATH_OUTCOME:CHECKER:1:1"]);
    expect(outcome.state).toBe("READY_WITH_RESERVATION");
  });

  it("a writer refused twice: no checker call, the FAILED shape stored", async () => {
    const { gateway, requests, sent } = team(() => "Here is the answer so far, in plain words.");
    const store = memoryStore();
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: store.store }), "b1");
    expect(outcome).toEqual(FAILED);
    expect(PathOutcomeSchema.parse(outcome)).toEqual(FAILED);
    expect(requests.map((request) => request.callSiteKey)).toEqual(["PATH_OUTCOME:WRITER:1:1"]);
    expect(sent).toHaveLength(2);
    expect(store.rows.get("b1")).toEqual(FAILED);
  });

  it("a path whose root dropped: FAILED with no call, stored", async () => {
    const { gateway, requests } = team();
    const store = memoryStore();
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: store.store, paths: [pathOf(1, { rootNodeId: null })] }), "b1");
    expect(outcome).toEqual(FAILED);
    expect(requests).toEqual([]);
    expect(store.rows.get("b1")).toEqual(FAILED);
  });

  it("the person's own words: in the material, a verdict on them is required, and it quotes them in order", async () => {
    const own = ["I think tourists keep the ferries full all year.", "The ferries are packed in August."];
    // The first try leaves the verdict out: code refuses it (view missing) and the repair gives it.
    const { gateway, requests, sent } = team((_request, attempt) => written({ view: attempt === 1 ? null : VIEW }));
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: memoryStore().store, paths: [pathOf(1, { ownWords: own })] }), "b1");
    const writer = fieldsOf(requests[0]!.packet);
    expect([...writer.keys()]).toEqual(["question", "path", "viewpoints", "own_words", "points", "sources", "question_language"]);
    expect(JSON.parse(writer.get("own_words")!)).toEqual(own);
    expect(sent.filter((one) => one.key === "PATH_OUTCOME:WRITER:1:1")).toHaveLength(2);
    expect(requests[0]!.classifyContent!(written(), { finishReason: "stop" }))
      .toMatchObject({ parseStatus: "SCHEMA_FAILED", parseError: expect.stringContaining("PATH_OUTCOME_VIEW_MISSING") });
    // The repair names the place that failed, under the same fence.
    expect(JSON.stringify(sent[1]!.packet.messages.at(-1))).toContain("view");
    expect(fenceOf(sent[1]!.packet)).toBe(fenceOf(sent[0]!.packet));
    expect(outcome.view).toEqual({ ...VIEW, own_words: own });
    expect(PathOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it("a verdict without own words is refused, then FAILED when the repair keeps it", async () => {
    const { gateway, requests } = team(() => written({ view: VIEW }));
    expect(await runPathOutcomeFor(jobOf({ gateway, store: memoryStore().store }), "b1")).toEqual(FAILED);
    expect(requests[0]!.classifyContent!(written({ view: VIEW }), { finishReason: "stop" })).toMatchObject({ parseStatus: "SCHEMA_FAILED" });
    expect(requests[0]!.classifyContent!(written({ what_changed: [{ text: WRITTEN_TEXT.sentence, rests_on: ["P1", "P3"] }] }), { finishReason: "stop" }))
      .toMatchObject({ parseStatus: "SCHEMA_FAILED", parseError: expect.stringContaining("PATH_OUTCOME_REF_NOT_IN_THE_MATERIAL") });
  });

  // Task 49 review: as the dig rewrite's (owner 2026-09-26: no point or page ref in a text the person reads).
  it("a point's or a page's ref in a text the person reads is refused and asked again; a word the material itself uses is not", async () => {
    const { gateway, requests, sent } = team((_request, attempt) =>
      written(attempt === 1 ? { summary: "As P2 shows, winter ridership falls by half." } : {}));
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: memoryStore().store }), "b1");
    expect(sent.filter((one) => one.key === "PATH_OUTCOME:WRITER:1:1")).toHaveLength(2);
    expect(outcome).toMatchObject({ state: "READY", text: { summary: WRITTEN_TEXT.summary } });
    const read = requests[0]!.classifyContent!;
    for (const over of [{ line: "P1 holds up so far." }, { summary: "As P2 shows, winter ridership falls by half." },
      { what_changed: [{ text: "The page W1 weakened the year-round case.", rests_on: ["P1"] }] }]) {
      expect(read(written(over), { finishReason: "stop" }), JSON.stringify(over))
        .toMatchObject({ parseStatus: "SCHEMA_FAILED", parseError: expect.stringContaining(PATH_OUTCOME_REPLY_ISSUES.refInProse) });
    }
    // The material's own words: a point about tax form W1 (the ref its page is given too) may be named as the point names it.
    const form = team();
    await runPathOutcomeFor(jobOf({ gateway: form.gateway, store: memoryStore().store, paths: [pathOf(1, {
      points: [point("n1-1", "Form W1 is filed late every winter.", "SURE"), point("n1-2", "Winter ridership falls by half.", "SURE_FOR_CASE")] })] }), "b1");
    expect(form.requests[0]!.classifyContent!(written({ summary: "Form W1 is filed late, and winter ridership falls by half." }), { finishReason: "stop" }))
      .toMatchObject({ parseStatus: "PARSED" });
  });

  it("FELL → DIDNT_HOLD, whatever the points' words", async () => {
    const { gateway } = team(() => written({ fate: "FELL" }));
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: memoryStore().store }), "b1");
    expect(outcome).toMatchObject({ state: "READY", trust: "DIDNT_HOLD", rests_on: ["n1-1", "n1-2"] });
  });

  it("changes resting on no point: the trust word of every point under the root", async () => {
    const { gateway } = team(() => written({ what_changed: [{ text: WRITTEN_TEXT.sentence, rests_on: [] }] }));
    const paths = [pathOf(1, { points: [point("n1-1", "Queues at the pier run long at rush hour.", "SURE"),
      point("n1-2", "Winter ridership falls by half.", "STILL_ARGUED", { disputed: true }), point("n1-3", "A bus line would cost less.", null)] })];
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: memoryStore().store, paths }), "b1");
    expect(outcome).toMatchObject({ state: "READY", trust: "STILL_ARGUED", rests_on: [] });
  });

  it("a stored outcome is read back: 0 calls, nothing written again", async () => {
    const stored: PathOutcome = { state: "READY", text: { line: "Stored.", summary: "Stored before the runner stopped.", fate: "HELD_UP" },
      what_changed: ["It was stored."], view: null, trust: "SURE", rests_on: ["n1-1"] } as PathOutcome;
    const { gateway, requests } = team();
    const store = memoryStore(new Map([["b1", stored]]));
    expect(await runPathOutcomeFor(jobOf({ gateway, store: store.store }), "b1")).toEqual(stored);
    expect(requests).toEqual([]);
    expect(store.recorded).toEqual([]);
  });

  it("the step-2 place, time and purpose ride in their own fields after the question, as the rewrite's do", async () => {
    const { gateway, requests } = team();
    const question = { ...QUESTION, place: "Harbour Town", purpose: "A council vote next spring." };
    await runPathOutcomeFor(jobOf({ gateway, store: memoryStore().store, question }), "b1");
    const writer = fieldsOf(requests[0]!.packet);
    expect([...writer.keys()]).toEqual(["question", "place", "purpose", ...SHARED.slice(1), "question_language"]);
    expect(writer.get("place")).toBe("Harbour Town");
    expect(requests[1]!.sharedFirstFieldCount).toBe(SHARED.length + 2);
  });

  it("the reading level: the reader field and the reader sentences only with a level, the language line last", async () => {
    const plain = team();
    await runPathOutcomeFor(jobOf({ gateway: plain.gateway, store: memoryStore().store, readingLevel: "plain" }), "b1");
    const [writer, checker] = plain.requests;
    expect([...fieldsOf(writer!.packet).keys()].slice(-2)).toEqual(["reader", "question_language"]);
    expect(fieldsOf(writer!.packet).get("reader")).toBe(readerField("plain").content);
    const english = questionLanguageSentence(questionLanguageFromRun("en", "English")!);
    expect(systemOf(writer!.packet)).toContain(`\n\n${READER_SENTENCE_WRITING}\n\n${english}`);
    expect(systemOf(checker!.packet)).toContain(`\n\n${READER_SENTENCE_ANSWER_CHECKER}\n\n${english}`);
    const none = team();
    await runPathOutcomeFor(jobOf({ gateway: none.gateway, store: memoryStore().store }), "b1");
    expect([...fieldsOf(none.requests[0]!.packet).keys()]).not.toContain("reader");
    for (const request of none.requests) {
      expect(systemOf(request.packet)).not.toContain(READER_SENTENCE_WRITING);
      expect(systemOf(request.packet)).not.toContain(READER_SENTENCE_ANSWER_CHECKER);
      expect(systemOf(request.packet)).toContain(english);
    }
  });

  it("a Romanian question: the Romanian field last, and an English reply is classified as the wrong language", async () => {
    const ro = "Ar trebui orașul să construiască un al doilea debarcader înainte de vara viitoare?";
    const romanian = written({ line: "Al doilea debarcader ajută la ora de vârf, dar nu tot anul.",
      summary: "Cozile de la ora de vârf sunt reale, dar iarna numărul pasagerilor scade la jumătate, așa că debarcaderul își merită costul doar vara.",
      what_changed: [{ text: "Dezbaterea a arătat că iarna numărul pasagerilor scade la jumătate, ceea ce slăbește argumentul pentru a construi acum.",
        rests_on: ["P1"] }] });
    const { gateway, requests } = team();
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: memoryStore().store, question: { ...QUESTION, line: ro },
      language: { name: "Romanian", tag: "ro" } }), "b1");
    const writer = requests[0]!;
    const last = readPromptFrame(writer.packet).fields.at(-1)!;
    expect(last).toEqual(questionLanguageField(questionLanguageFromRun("ro", "Romanian")!));
    expect(systemOf(writer.packet)).toContain(questionLanguageSentence(questionLanguageFromRun("ro", "Romanian")!));
    const english = writer.classifyContent!(written(), { finishReason: "stop" });
    expect(english).toMatchObject({ parseStatus: "SCHEMA_FAILED", parseError: expect.stringContaining(TEXT_NOT_IN_QUESTION_LANGUAGE) });
    expect(writer.classifyContent!(romanian, { finishReason: "stop" })).toMatchObject({ parseStatus: "PARSED" });
    // The team answers in English: refused twice, the path FAILED.
    expect(outcome).toEqual(FAILED);
  });
});

/* ----------------------------------------------------------------- per path, and every path at once */

describe("runPathOutcomeFor and runPathOutcomes", () => {
  it("one path's chain sends only that path's keys and records only that path; called again it reads it back with 0 calls", async () => {
    const { gateway, requests } = team(undefined, (_request) => OBJECTION);
    const store = memoryStore();
    const job = jobOf({ gateway, store: store.store });
    const first = await runPathOutcomeFor(job, "b2");
    expect(requests.map((request) => request.callSiteKey)).toEqual([
      "PATH_OUTCOME:WRITER:2:1", "PATH_OUTCOME:CHECKER:2:1", "PATH_OUTCOME:WRITER:2:2", "PATH_OUTCOME:CHECKER:2:2"]);
    expect([...store.rows.keys()]).toEqual(["b2"]);
    expect(first.rests_on).toEqual(["n2-1", "n2-2"]);
    expect(await runPathOutcomeFor(job, "b2")).toEqual(first);
    expect(requests).toHaveLength(4);
    expect(store.recorded).toEqual(["b2"]);
    await expect(runPathOutcomeFor(job, "b7")).rejects.toMatchObject({ code: "PATH_OUTCOME_PATH_UNKNOWN" });
  });

  it("the rounds of one path share one fence; two paths have different ones", async () => {
    const { gateway, sent } = team(undefined, () => OBJECTION);
    const job = jobOf({ gateway, store: memoryStore().store });
    await runPathOutcomeFor(job, "b1");
    await runPathOutcomeFor(job, "b2");
    const fences = (pathNo: number) => new Set(sent.filter((one) => one.key.split(":")[2] === String(pathNo)).map((one) => fenceOf(one.packet)));
    expect(sent.filter((one) => one.key.startsWith("PATH_OUTCOME:WRITER:1:"))).toHaveLength(2);
    expect(fences(1).size).toBe(1);
    expect(fences(2).size).toBe(1);
    expect([...fences(1)][0]).not.toBe([...fences(2)][0]);
  });

  it("every path at once gives the same outcomes, keys and per-path fences as one call per path", async () => {
    const one = team(undefined, (request) => (request.callSiteKey.split(":")[2] === "2" ? OBJECTION : SATISFIED));
    const each = new Map<PathId, PathOutcome>();
    const eachJob = jobOf({ gateway: one.gateway, store: memoryStore().store });
    for (const pathId of ["b1", "b2", "b3"] as const) each.set(pathId, await runPathOutcomeFor(eachJob, pathId));
    const all = team(undefined, (request) => (request.callSiteKey.split(":")[2] === "2" ? OBJECTION : SATISFIED));
    const store = memoryStore();
    const together = await runPathOutcomes(jobOf({ gateway: all.gateway, store: store.store }));
    expect(together).toEqual(each);
    expect([...together.keys()]).toEqual(["b1", "b2", "b3"]);
    expect([...store.rows.keys()].sort()).toEqual(["b1", "b2", "b3"]);
    expect(all.requests.map((request) => request.callSiteKey).sort()).toEqual(one.requests.map((request) => request.callSiteKey).sort());
    for (const run of [one, all]) {
      const byPath = [1, 2, 3].map((pathNo) => new Set(run.sent.filter((sent) => sent.key.split(":")[2] === String(pathNo)).map((sent) => fenceOf(sent.packet))));
      expect(byPath.map((fences) => fences.size)).toEqual([1, 1, 1]);
      expect(new Set(byPath.map((fences) => [...fences][0])).size).toBe(3);
    }
  });
});

/* ----------------------------------------------------------------- the material's size */

const long = (sentence: string, chars: number): string => {
  let text = "";
  while (text.length + sentence.length + 1 <= chars) text += (text === "" ? "" : " ") + sentence;
  return text;
};
/** The largest legal path: 200 long points, a third disputed, each citing a page, four long viewpoints and long own words. */
const HUGE: JobPath = pathOf(1, {
  title: long("Whole-system costs", 120), question: long("What would the pier cost to build and run each year?", 1000),
  statement: long("Counting upkeep, a second pier costs more than it saves before the town grows.", 2000),
  viewpoints: [1, 2, 3, 4].map((at) => long(`Viewpoint ${String(at)}: what would it cost to build and to run?`, 1000)),
  ownWords: [long("I think tourists keep the ferries full all year.", 1000)],
  points: Array.from({ length: 200 }, (_, at) => point(`h${String(at)}`, long(`Point ${String(at)}: the winter ferry runs half empty most days.`, 3000),
    (["SURE", "SURE_FOR_CASE", "STILL_ARGUED"] as const)[at % 3]!, { disputed: at % 3 === 2, ...(at % 4 === 3 ? { onId: `h${String(at - 1)}` } : {}) })),
  sources: Array.from({ length: 200 }, (_, at) => ({ pointId: `h${String(at)}`, site: "harbour.example", link: null, title: "Ferry counts",
    quote: long("The harbour office counted the winter crossings by hand.", 400), line: null }))
});
const HUGE_INPUT = Object.freeze({ question: QUESTION, path: HUGE, readingLevel: "plain" as const, language: ENGLISH });
const charactersOf = (packet: PromptPacket): number => packet.messages.reduce((sum, message) => sum + Array.from(message.content).length, 0);

describe("the material", () => {
  it("is the same bytes every time; refs name the points, kept whole, disputed first, on the ladder all → 40 → 20 → 10 → none", () => {
    const small = pathOutcomeMaterial({ question: QUESTION, path: pathOf(1), readingLevel: null, language: ENGLISH });
    expect(JSON.stringify(pathOutcomeMaterial({ question: QUESTION, path: pathOf(1), readingLevel: null, language: ENGLISH }).fields))
      .toBe(JSON.stringify(small.fields));
    expect(small).toMatchObject({ ladderStep: 1, pointsKept: 2, fits: true });
    expect([...small.refs]).toEqual([["P1", "n1-1"], ["P2", "n1-2"]]);
    const huge = pathOutcomeMaterial(HUGE_INPUT);
    expect(huge.ladderStep).toBeGreaterThan(1);
    expect(huge.pointsKept).toBeLessThan(120);
    expect(huge.pointsKept).toBe([Infinity, 40, 20, 10, 0][huge.ladderStep - 1]);
    const points = JSON.parse(new Map(huge.fields.map((entry) => [entry.name, entry.content])).get("points")!) as Array<{ ref: string; disputed?: boolean }>;
    // Disputed points are kept first (a third of 200 is more than 40): every point kept is a disputed one, written in its own order.
    expect(points.every((one) => one.disputed === true)).toBe(true);
    expect(points.map((one) => Number(one.ref.slice(1)))).toEqual([...points.map((one) => Number(one.ref.slice(1)))].sort((a, b) => a - b));
    // Refs are given over the whole path, so a point keeps its ref on every step; only the kept points' pages ride along.
    expect(points[0]!.ref).toBe("P3");
    const sources = JSON.parse(new Map(huge.fields.map((entry) => [entry.name, entry.content])).get("sources")!) as Array<{ point: string; quote: string }>;
    expect(sources.map((one) => one.point)).toEqual(points.map((one) => one.ref));
    expect(sources.every((one) => one.quote.length <= 120)).toBe(true);
    expect(huge.bodyBytes + ROOM).toBeLessThanOrEqual(LINE);
    expect(pathOutcomeMaterial(HUGE_INPUT, { fromStep: 5 })).toMatchObject({ ladderStep: 5, pointsKept: 0 });
  });

  it("on the largest path, every body sent, round 2's included, stays at or under 195,904 bytes", async () => {
    // The largest draft the form allows near its limits: a long line, a 3,900-character summary, three 950-character sentences, a verdict.
    const big = { line: long("The second pier helps at rush hour.", 300), fate: "PARTLY_HELD",
      summary: long("The queues at rush hour are real, but winter ridership falls by half.", 3900),
      what_changed: [1, 2, 3].map(() => ({ text: long("The arguing showed that winter ridership falls by half in the town.", 950), rests_on: ["P3", "P6"] })),
      view: VIEW };
    const problem = JSON.stringify({ satisfied: false, problem: long("The summary calls the winter figure settled, but a point still disputes it.", 3900),
      part: "summary" });
    const { gateway, sent, requests } = team(() => JSON.stringify(big), () => problem);
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: memoryStore().store, paths: [HUGE], readingLevel: "plain" }), "b1");
    expect(requests[0]!.classifyContent!(JSON.stringify(big), { finishReason: "stop" })).toMatchObject({ parseStatus: "PARSED" });
    expect(requests.map((request) => request.callSiteKey)).toEqual([
      "PATH_OUTCOME:WRITER:1:1", "PATH_OUTCOME:CHECKER:1:1", "PATH_OUTCOME:WRITER:1:2", "PATH_OUTCOME:CHECKER:1:2"]);
    expect(outcome.state).toBe("READY_WITH_RESERVATION");
    expect(sent.length).toBe(4);
    for (const one of sent) expect(pathRewriteBodyBytes(one.packet), one.key).toBeLessThanOrEqual(LINE);
    // P3 and P6 are h2 and h5, two of the disputed points the step kept.
    expect(outcome.rests_on).toEqual(["h2", "h5"]);
  });

  // Task 49 review (Review Focus 5): the 100K line is kept by code, not only by the ladder's room. Neither case below was exercised:
  // with the guard and the too-large refusal both taken out, every test above still passed.
  it("a path over the line on every step: FAILED with no call, stored, and logged as too large", async () => {
    const { gateway, requests } = team();
    const store = memoryStore();
    const logged: string[] = [];
    const over = pathOf(1, { viewpoints: [long("Viewpoint: what would the second pier cost to build and to run each year?", 220_000)] });
    expect(pathOutcomeMaterial({ question: QUESTION, path: over, readingLevel: null, language: ENGLISH })).toMatchObject({ ladderStep: 5, fits: false });
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: store.store, paths: [over], log: (event) => { logged.push(event); } }), "b1");
    expect(outcome).toEqual(FAILED);
    expect(requests).toEqual([]);
    expect(store.rows.get("b1")).toEqual(FAILED);
    expect(logged).toEqual(["PATH_OUTCOME_MATERIAL_TOO_LARGE", "PATH_OUTCOME_STORED"]);
  });

  it("a round-2 revision over the line is refused before it is sent: round 1's objected draft is kept, with a reservation", async () => {
    // The largest draft and problem the forms allow, in a 3-byte script, outgrow round 2's room; the material is padded to just under
    // the line with that room, so only the guard on every packet can stop the revision.
    const CJK = "中";
    const ZH = Object.freeze({ name: "Chinese", tag: "zh" });
    const question = { ...QUESTION, line: CJK.repeat(100) };
    const padded = (chars: number): JobPath => pathOf(1, { title: CJK.repeat(20), question: CJK.repeat(100), statement: CJK.repeat(100),
      viewpoints: [CJK.repeat(chars)], ownWords: [CJK.repeat(200)], sources: [], points: [point("n1-1", CJK.repeat(300), "SURE")] });
    const fitsWhole = (chars: number): boolean => {
      const built = pathOutcomeMaterial({ question, path: padded(chars), readingLevel: null, language: ZH });
      return built.fits && built.ladderStep === 1;
    };
    let low = 0;
    let high = 70_000;
    while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (fitsWhole(mid)) low = mid; else high = mid; }
    const path = padded(low);
    const material = pathOutcomeMaterial({ question, path, readingLevel: null, language: ZH });
    expect(LINE - (material.bodyBytes + ROOM)).toBeLessThan(16);
    const draft = { line: CJK.repeat(2000), summary: CJK.repeat(4000), fate: "PARTLY_HELD",
      what_changed: [1, 2, 3].map(() => ({ text: CJK.repeat(1000), rests_on: ["P1"] })),
      view: { outcome: "NOT_SETTLED", scope: "PATH", reason: CJK.repeat(1000) } };
    const problem = CJK.repeat(4000);
    const { gateway, requests, sent } = team(() => JSON.stringify(draft), () => JSON.stringify({ satisfied: false, problem, part: "summary" }));
    const outcome = await runPathOutcomeFor(jobOf({ gateway, store: memoryStore().store, question, language: ZH, paths: [path] }), "b1");
    expect(requests.map((request) => request.callSiteKey)).toEqual(["PATH_OUTCOME:WRITER:1:1", "PATH_OUTCOME:CHECKER:1:1"]);
    for (const one of sent) expect(pathRewriteBodyBytes(one.packet), one.key).toBeLessThanOrEqual(LINE);
    expect(outcome).toMatchObject({ state: "READY_WITH_RESERVATION", text: { line: draft.line, fate: "PARTLY_HELD" } });
    // Not vacuous: the revision round 2 would have sent is over the line.
    const revision = buildFramedRevisionPrompt(requests[0]!.packet, JSON.stringify(draft), JSON.stringify({ part: "summary", problem }));
    expect(pathRewriteBodyBytes(revision)).toBeGreaterThan(LINE);
  });
});

describe("fitPathOutcomeToTokenLine", () => {
  it("on the largest path, a count of 99,000 moves the material one step down, logged by step only", async () => {
    const start = pathOutcomeMaterial(HUGE_INPUT);
    const logged: Array<[string, Record<string, unknown>]> = [];
    const asked: number[] = [];
    const count: TokenCounter = async ({ sharedFirstFieldCount }) => {
      asked.push(sharedFirstFieldCount ?? -1);
      return asked.length === 1 ? 99_000 : 50_000;
    };
    const fitted = await fitPathOutcomeToTokenLine(HUGE_INPUT, count, (event, detail) => { logged.push([event, detail]); });
    expect(fitted.ladderStep).toBe(start.ladderStep + 1);
    expect(logged).toEqual([["PATH_OUTCOME_OVER_THE_TOKEN_LINE", { ladderStep: start.ladderStep }]]);
    // Counted with its shared fields first, as sent; the step below is counted again only when it still looks close to the line.
    expect(asked.length).toBeGreaterThanOrEqual(1);
    expect(new Set(asked)).toEqual(new Set([start.sharedFieldCount]));
    expect(fitted.fields).toEqual(pathOutcomeMaterial(HUGE_INPUT, { fromStep: start.ladderStep + 1 }).fields);
  });

  it("no counter, or a failed count: the byte ladder alone", async () => {
    const bytesOnly = pathOutcomeMaterial(HUGE_INPUT);
    for (const fitted of [await fitPathOutcomeToTokenLine(HUGE_INPUT, undefined, () => undefined),
      await fitPathOutcomeToTokenLine(HUGE_INPUT, async () => null, () => undefined)]) {
      expect(fitted.ladderStep).toBe(bytesOnly.ladderStep);
      expect(fitted.fields).toEqual(bytesOnly.fields);
    }
  });

  it("seven paths in \"中\", one token per character: every path's fitted material stays below the line with the round-two room", async () => {
    const CJK = "中";
    const answers: number[] = [];
    const logged: string[] = [];
    const count: TokenCounter = async ({ packet }) => { const real = charactersOf(packet); answers.push(real); return real; };
    for (const no of [1, 2, 3, 4, 5, 6, 7]) {
      const path = pathOf(no, { title: CJK.repeat(30), question: CJK.repeat(1000), statement: CJK.repeat(1000), viewpoints: [CJK.repeat(1000), CJK.repeat(1000)],
        ownWords: [CJK.repeat(1000)], sources: [],
        points: Array.from({ length: 120 }, (_, at) => point(`c${String(no)}-${String(at)}`, CJK.repeat(300), "STILL_ARGUED", { disputed: at % 5 === 0 })) });
      const before = answers.length;
      const fitted = await fitPathOutcomeToTokenLine({ question: { ...QUESTION, line: CJK.repeat(200) }, path, readingLevel: null,
        language: { name: "Chinese", tag: "zh" } }, count, (event) => { logged.push(event); });
      expect(answers.length, `b${String(no)}`).toBeGreaterThan(before);
      expect(answers.at(-1)! + Math.ceil(ROOM / 2), `b${String(no)}`).toBeLessThan(ANTHROPIC_TOKEN_COUNT.line);
      expect(fitted.fits).toBe(true);
      expect(fitted.bodyBytes + ROOM).toBeLessThanOrEqual(LINE);
    }
    expect(logged).toEqual([]);
  });
});

/* ----------------------------------------------------------------- the paths of a settled run, by their roots */

describe("pathRewriteDigPathsOfRoots", () => {
  const snapshot = digSnapshot("55555555-5555-4555-8555-555555555555", { resolve: () => null, backups: [] });
  const enrichment = new Map([[DIG_NODES.bridge, { reviewOutcome: "dispute" as const }]]);

  it("pathRewriteDigPathsOf is unchanged: the judges' order, each point once after the one it argues", () => {
    expect(pathRewriteDigPathsOf(snapshot, enrichment)).toEqual([
      { positionRef: DIG_NODES.no, statement: "No: winter ridership falls by half.", extracts: [], points: [
        { id: DIG_NODES.queues, text: "Winter queues are short.", onId: null, side: "for", trust: null, disputed: false },
        { id: DIG_NODES.bridge, text: "The bridge takes winter traffic.", onId: null, side: "for", trust: null, disputed: true }] },
      { positionRef: DIG_NODES.yes, statement: "Yes: winter crowds fill both piers.", extracts: [], points: [
        { id: DIG_NODES.buses, text: "Buses carry the winter commuters.", onId: null, side: "against", trust: null, disputed: false }] }
    ]);
  });

  it("by the roots given, in their order, each named by its path's ref; a root the snapshot does not hold is left out", () => {
    const paths = pathRewriteDigPathsOfRoots(snapshot, enrichment, new Map(), [{ ref: "b1", rootNodeId: DIG_NODES.yes },
      { ref: "b2", rootNodeId: DIG_NODES.no }, { ref: "b3", rootNodeId: "aaaaaaaa-0000-4000-8000-0000000000ff" }]);
    expect(paths.map((path) => [path.positionRef, path.statement, path.points.map((one) => one.id)])).toEqual([
      ["b1", "Yes: winter crowds fill both piers.", [DIG_NODES.buses]],
      ["b2", "No: winter ridership falls by half.", [DIG_NODES.queues, DIG_NODES.bridge]]]);
    // Given the judges' order, it is pathRewriteDigPathsOf exactly.
    expect(pathRewriteDigPathsOfRoots(snapshot, enrichment, new Map(), [{ ref: DIG_NODES.no, rootNodeId: DIG_NODES.no },
      { ref: DIG_NODES.yes, rootNodeId: DIG_NODES.yes }])).toEqual(pathRewriteDigPathsOf(snapshot, enrichment));
  });
});
