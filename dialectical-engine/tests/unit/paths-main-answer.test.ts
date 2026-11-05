// tests/unit/paths-main-answer.test.ts
// V4 start step, Task 50 (spec 2026-11-03 §4.3): THE MAIN ANSWER OF A PATH RUN weighs every path. Its material is the approved
// "overall view" writer's dossier (investigation-dossier.ts), built from the paths: each path's answer so far (its outcome; the
// path's question and SET_ASIDE when it FAILED), its points and pages, and the person's own words in `views`, never beside the
// path. The length line is the receipt's words. The writer (Haiku) and the checker (GLM) run report.answer.v4 and
// report.answer-check.v3 byte for byte through `writeOverallAnswer`, at the first debate's own answer keys on the served lane, 2
// rounds on a paid plan and 1 on Free, every round under one fence. The material stays under the 100K line (the byte ladder, then
// the real count near the line). The answer's segments map back to the run's nodes. R22's dossier keeps its bytes. Data made up.
import { describe, expect, it } from "vitest";
import type { PathOutcome } from "@debateai/contract";
import {
  TEXT_NOT_IN_QUESTION_LANGUAGE, questionLanguageField, questionLanguageFromRun, questionLanguageSentence, type PathId
} from "@debateai/kernel";
import {
  ANTHROPIC_TOKEN_COUNT, PREVIEW_V2_FINAL_SEATS, ProviderContentUnacceptedError, readPromptFrame, type PromptPacket, type ProviderCallRequest,
  type ProviderCallResult, type ProviderGateway, type TokenCounter
} from "@debateai/providers";
import {
  REPORT_ANSWER_CHECK_V3_PROMPT_CONTRACT, REPORT_ANSWER_V4_PROMPT_CONTRACT, type ReportAnswerDraft
} from "@debateai/story";
import {
  INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES, buildInvestigationDossier, digsInTreeOrder, dossierFieldsOf, dossierRefsOf, type Dossier,
  type DossierInput
} from "../../apps/runner/src/investigation-dossier.js";
import { PATH_REWRITE_BODY_MAX_BYTES, pathRewriteBodyBytes, type PathRewriteQuestion } from "../../apps/runner/src/path-rewrite-material.js";
import {
  pathsComposedSegments, pathsDossierInput, pathsMainAnswerCallSiteOf, runPathsMainAnswer, type PathsDossierPath, type PathsMainAnswerInput
} from "../../apps/runner/src/paths-main-answer.js";
import { fitDossierToTokenLine } from "../../apps/runner/src/token-line.js";
import {
  DIG_FAILED, DIG_NESTED, DIG_READY, PATH_NO, PATH_YES, investigationInput
} from "../support/investigation-close-world.js";

/* ----------------------------------------------------------------- the world */

const RUN = "33333333-3333-4333-8333-333333333333";
const Q = "Should the town build a second ferry pier before next summer?";
const QUESTION: PathRewriteQuestion = Object.freeze({ line: Q, place: null, time: null, purpose: null, readingLevel: null, language: null });
const HAIKU = Object.freeze({ providerRef: "ref-haiku", model: PREVIEW_V2_FINAL_SEATS.writer, maker: "Anthropic" });
const GLM = Object.freeze({ providerRef: "ref-glm", model: PREVIEW_V2_FINAL_SEATS.checker, maker: "Z.AI" });
const LINE = PATH_REWRITE_BODY_MAX_BYTES;
const OWN = "I think tourists keep the ferries full all year.";

const point = (id: string, text: string, trust: string | null, over: Partial<PathsDossierPath["points"][number]> = {}) =>
  Object.freeze({ id, text, onId: null, side: "for" as const, trust, disputed: false, ...over });
const ready = (line: string, fate: "HELD_UP" | "PARTLY_HELD" | "FELL" | "SET_ASIDE", over: Partial<PathOutcome> = {}): PathOutcome => Object.freeze({
  state: "READY", text: { line, summary: `${line} The arguing showed why.`, fate }, what_changed: ["The arguing changed it."], view: null,
  trust: "SURE", rests_on: [], ...over
}) as PathOutcome;
const FAILED: PathOutcome = Object.freeze({ state: "FAILED", text: null, what_changed: [], view: null, trust: null, rests_on: [] }) as PathOutcome;

const B1_LINE = "The second pier pays for itself within ten years.";
const B2_LINE = "Winter use is low, so the pier helps in summer only.";
const B3_QUESTION = "Would more boats on the one pier do the same job?";
function pathOf(no: number, over: Partial<PathsDossierPath> = {}): PathsDossierPath {
  return Object.freeze({
    pathId: `b${String(no)}` as PathId, rootNodeId: `root-${String(no)}`, title: `Path ${String(no)}`, question: `What does path ${String(no)} ask?`,
    ownWords: [], outcome: null,
    points: [point(`n${String(no)}-1`, `Queues at the pier run long at rush hour (${String(no)}).`, "SURE"),
      point(`n${String(no)}-2`, `Winter ridership falls by half (${String(no)}).`, "STILL_ARGUED", { side: "against", disputed: true })],
    sources: [{ pointId: `n${String(no)}-1`, site: "harbour.example", link: null, title: "Pier queues",
      quote: `Queues reach ${String(no * 10)} minutes at eight.`, line: null }],
    ...over
  });
}
/** b2's answer so far's verdict on the person's own words, as the material carries it beside them (Task 55e). */
const B2_VIEW = Object.freeze({ outcome: "DID_NOT_HELP", scope: "PATH", reason: "The ferries run half empty in winter." });
const PATHS: readonly PathsDossierPath[] = Object.freeze([
  pathOf(1, { outcome: ready(B1_LINE, "HELD_UP") }),
  pathOf(2, { ownWords: [OWN], outcome: ready(B2_LINE, "PARTLY_HELD", { view: { outcome: "DID_NOT_HELP", scope: "PATH",
    reason: "The ferries run half empty in winter.", own_words: [OWN] } }) }),
  pathOf(3, { rootNodeId: null, question: B3_QUESTION, outcome: FAILED, points: [], sources: [] })
]);

const dossierOf = (input: DossierInput): Dossier => {
  const built = buildInvestigationDossier(input);
  if (built.kind !== "BUILT") throw new Error("the dossier did not fit");
  return built;
};
const fieldOf = (fields: readonly Readonly<{ name: string; content: string }>[], name: string): string | undefined =>
  fields.find((entry) => entry.name === name)?.content;
const pathsInput = (over: Partial<Parameters<typeof pathsDossierInput>[0]> = {}): DossierInput =>
  pathsDossierInput({ runId: RUN, question: QUESTION, paths: PATHS, answerWords: 300, ...over });

/* ----------------------------------------------------------------- a scripted gateway (as path-outcome-step's) */

type Answer = (request: ProviderCallRequest, attempt: number) => string;
const sentOf = async (request: ProviderCallRequest, packet: PromptPacket): Promise<PromptPacket> =>
  request.vendorPacketOf === undefined ? packet : request.vendorPacketOf(packet);
function resultOf(request: ProviderCallRequest, content: string): ProviderCallResult {
  const seat = request.providerRef === HAIKU.providerRef ? HAIKU : GLM;
  return { rawArtifactRef: `raw:${request.callSiteKey}`, ledgerEntryRef: `ledger:${request.callSiteKey}`, content, provider: "openai-compatible-http",
    model: seat.model, maker: seat.maker, modelVersion: "test" };
}
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
const ANSWER: ReportAnswerDraft = Object.freeze({ segments: [
  { text: "Build the second pier for the summer months: it pays for itself within ten years.", rests_on: ["A1", "P2", "W1"] },
  { text: "Winter use stays low; a count of winter crossings would settle whether more boats would do.", rests_on: ["A2", "A3", "P3"] }] });
const SATISFIED = JSON.stringify({ satisfied: true, problem: null, part: null });
const OBJECTION = JSON.stringify({ satisfied: false, problem: "It leaves out that the third path ended without an answer.", part: "segments" });
const team = (writer: Answer = () => JSON.stringify(ANSWER), checker: Answer = () => SATISFIED) =>
  scripted((request, attempt) => (isWriter(request) ? writer(request, attempt) : checker(request, attempt)));

const frameOf = (packet: PromptPacket) => readPromptFrame({ messages: packet.messages.slice(0, 2) });
const callsOf = (requests: readonly ProviderCallRequest[]) =>
  requests.map((request) => [request.callSiteKey, request.providerRef, frameOf(request.packet).contractId]);
function inputOf(over: Partial<PathsMainAnswerInput> & Pick<PathsMainAnswerInput, "gateway">): PathsMainAnswerInput {
  return Object.freeze({ runId: RUN, free: false, answerWords: 300, question: QUESTION, paths: PATHS, seats: { writer: HAIKU, checker: GLM },
    tokenCount: undefined, log: () => undefined, ...over });
}

/* ----------------------------------------------------------------- the dossier */

describe("pathsDossierInput: a path run's dossier", () => {
  it("gives each path its answer so far, the question and SET_ASIDE when it failed, its points and pages; the first debate has no answer", () => {
    const input = pathsInput();
    expect(input).toMatchObject({ first: { runId: RUN, answer: null }, digs: [], earlier: null, answerWords: 300 });
    expect(input.first.paths.map((path) => [path.ref, path.storyFate])).toEqual([["b1", "HELD_UP"], ["b2", "PARTLY_HELD"], ["b3", "SET_ASIDE"]]);
    const dossier = dossierOf(input);
    const first = JSON.parse(fieldOf(dossierFieldsOf(dossier), "first_debate")!) as Record<string, unknown> & { paths: Array<Record<string, unknown>> };
    expect(first).not.toHaveProperty("answer");
    expect(first.paths.map((path) => [path.ref, path.line, path.fate])).toEqual([
      ["A1", B1_LINE, "HELD_UP"], ["A2", B2_LINE, "PARTLY_HELD"], ["A3", B3_QUESTION, "SET_ASIDE"]]);
    expect(first.paths[0]).toEqual({ ref: "A1", line: B1_LINE, summary: `${B1_LINE} The arguing showed why.`, fate: "HELD_UP",
      points: [{ ref: "P1", text: "Queues at the pier run long at rush hour (1).", on: "A1", side: "for", trust: "SURE" },
        { ref: "P2", text: "Winter ridership falls by half (1).", on: "A1", side: "against", trust: "STILL_ARGUED", disputed: true }],
      sources: ["W1"] });
    // A failed path keeps its question as its line, with no summary and nothing beside it.
    expect(first.paths[2]).toEqual({ ref: "A3", line: B3_QUESTION, fate: "SET_ASIDE", points: [], sources: [] });
    expect(dossier.material.index.refs).toEqual(new Set(["A1", "A2", "A3", "P1", "P2", "P3", "P4", "W1", "W2"]));
  });

  it("puts the person's own words in views, marked as theirs, by their path, and nowhere beside the path", () => {
    const dossier = dossierOf(pathsInput());
    const fields = dossierFieldsOf(dossier);
    // Task 55e: the outcome's verdict on those words sits beside them, as a report's and an answer update's do (Task 55b).
    expect(JSON.parse(fieldOf(fields, "views")!)).toEqual([{ path: "A2", words: [OWN], marked: "PERSON", verdict: B2_VIEW }]);
    // A path whose answer so far keeps no verdict: the words alone.
    const unweighed = dossierFieldsOf(dossierOf(pathsInput({ paths: PATHS.map((path) => path.pathId !== "b2" ? path
      : { ...path, outcome: ready(B2_LINE, "PARTLY_HELD") }) })));
    expect(JSON.parse(fieldOf(unweighed, "views")!)).toEqual([{ path: "A2", words: [OWN], marked: "PERSON" }]);
    expect(fields.filter((entry) => entry.content.includes(OWN)).map((entry) => entry.name)).toEqual(["views"]);
    expect(dossier.material.answerWriter.map((entry) => entry.name)).toEqual(["question", "first_debate", "follow_ups", "views", "sources", "answer_length"]);
    // A path run with no own words has no views field at all.
    const none = dossierFieldsOf(dossierOf(pathsInput({ paths: PATHS.map((path) => ({ ...path, ownWords: [] })) })));
    expect(none.map((entry) => entry.name)).not.toContain("views");
  });

  it("the length line is the receipt's words (300, and a made-up 220), on the byte fit and on the token-counter path", async () => {
    const counted: number[] = [];
    const count: TokenCounter = async () => { counted.push(1); return 1_000; };
    for (const words of [300, 220]) {
      const input = pathsInput({ answerWords: words });
      const length = `about ${String(words)} words`;
      expect(fieldOf(dossierOf(input).material.answerWriter, "answer_length")).toBe(length);
      const fitted = await fitDossierToTokenLine(input, count, () => undefined) as Dossier;
      expect(fieldOf(fitted.material.answerWriter, "answer_length")).toBe(length);
    }
    // investigationReportAnswerLength would say "about 300 words" for three paths: 220 is the receipt's alone.
    const { answerWords: _receiptWords, ...withoutWords } = pathsInput({ answerWords: 220 });
    expect(fieldOf(dossierOf(withoutWords).material.answerWriter, "answer_length")).toBe("about 300 words");
    for (const bad of [0, 1.5, -300]) expect(() => buildInvestigationDossier(pathsInput({ answerWords: bad }))).toThrow(expect.objectContaining({ code: "INVESTIGATION_REPORT_ANSWER_WORDS_INVALID" }));
  });
});

describe("R22's dossier keeps its bytes", () => {
  it("the R22 fixture's fingerprint and length line are today's", () => {
    // Pinned before Task 50 changed investigation-dossier.ts (the fingerprint is sha256 over the dossier's fields).
    const r22 = dossierOf(investigationInput());
    expect(r22.fingerprint).toBe("109e523f2d7489eb8029678c4fddf6f632a9aebb92e323a457a09570ee0dc703");
    expect(dossierOf(investigationInput({ digs: [] })).fingerprint).toBe("278ed22400ef2f836d98379194a04f13724606d017f371b850e150724c954790");
    expect(fieldOf(r22.material.answerWriter, "answer_length")).toBe("about 300 words");
    expect(JSON.parse(fieldOf(dossierFieldsOf(r22), "views")!)).toEqual([expect.objectContaining({ card: "G1", marked: "PERSON" })]);
  });

  it("dossierRefsOf on the R22 fixture gives today's refs", () => {
    const input = investigationInput();
    const refs = dossierRefsOf(input, digsInTreeOrder(input));
    expect([...refs.pathRef]).toEqual([[PATH_YES, "A1"], [PATH_NO, "A2"]]);
    expect([...refs.cardRef]).toEqual([[DIG_READY, "G1"], [DIG_NESTED, "G2"], [DIG_FAILED, "G3"]]);
    expect([...refs.pointRef]).toEqual([
      ["bbbb0000-0000-4000-8000-000000000000", "P1"], ["bbbb0001-0000-4000-8000-000000000000", "P2"], ["bbbb0002-0000-4000-8000-000000000000", "P3"],
      ["cccc0000-0000-4000-8000-000000000000", "P4"], ["cccc0001-0000-4000-8000-000000000000", "P5"], ["cccc0002-0000-4000-8000-000000000000", "P6"],
      ["eeeeeeee-0000-4000-8000-0000000000a1", "P7"]]);
    expect([...refs.sourceRef.values()]).toEqual(["W1"]);
    expect(refs.sources.map(({ source }) => [source.site, Array.from(source.quote).length <= 120])).toEqual([["city.example.org", true]]);
  });
});

/* ----------------------------------------------------------------- the calls */

describe("pathsMainAnswerCallSiteOf: the first debate's own answer keys", () => {
  it("the writer at COMPOSER:SYNTHESIZER:INITIAL|RETRY:<r>, the checker at POST_COMPOSE_R9:EVALUATOR:<r>; no story, no other round", () => {
    expect(pathsMainAnswerCallSiteOf("ANSWER", 1)).toBe("COMPOSER:SYNTHESIZER:INITIAL:1");
    expect(pathsMainAnswerCallSiteOf("ANSWER", 2)).toBe("COMPOSER:SYNTHESIZER:RETRY:2");
    expect(pathsMainAnswerCallSiteOf("ANSWER_CHECK", 1)).toBe("POST_COMPOSE_R9:EVALUATOR:1");
    expect(pathsMainAnswerCallSiteOf("ANSWER_CHECK", 2)).toBe("POST_COMPOSE_R9:EVALUATOR:2");
    for (const site of ["ANSWER_ASKED", "STORY", "STORY_CHECK"] as const) {
      expect(() => pathsMainAnswerCallSiteOf(site, 1)).toThrow(expect.objectContaining({ code: "PATHS_MAIN_ANSWER_SITE_INVALID" }));
    }
    for (const round of [0, 5, 1.5]) {
      expect(() => pathsMainAnswerCallSiteOf("ANSWER", round)).toThrow(expect.objectContaining({ code: "INVESTIGATION_REPORT_ROUND_INVALID" }));
    }
  });
});

describe("runPathsMainAnswer", () => {
  it("Haiku writes report.answer.v4 and GLM checks report.answer-check.v3, byte for byte, on the served lane", async () => {
    const { gateway, requests } = team();
    const { written } = await runPathsMainAnswer(inputOf({ gateway }));
    expect(callsOf(requests)).toEqual([
      ["COMPOSER:SYNTHESIZER:INITIAL:1", HAIKU.providerRef, "report.answer.v4"],
      ["POST_COMPOSE_R9:EVALUATOR:1", GLM.providerRef, "report.answer-check.v3"]]);
    expect(requests.map((request) => [request.role, request.lane])).toEqual([["SYNTHESIZER", "served"], ["EVALUATOR", "served"]]);
    expect(requests[0]!.packet.messages[0]!.content.startsWith(REPORT_ANSWER_V4_PROMPT_CONTRACT.instruction)).toBe(true);
    expect(requests[1]!.packet.messages[0]!.content.startsWith(REPORT_ANSWER_CHECK_V3_PROMPT_CONTRACT.instruction)).toBe(true);
    expect(written.outcome).toMatchObject({ outcome: "READY", body: ANSWER });
    // The writer reads the path run's dossier, its length line the receipt's.
    const fields = new Map(frameOf(requests[0]!.packet).fields.map((entry) => [entry.name, entry.content] as const));
    expect(fields.get("question")).toBe(Q);
    expect(fields.get("answer_length")).toBe("about 300 words");
    expect(JSON.parse(fields.get("views")!)).toEqual([{ path: "A2", words: [OWN], marked: "PERSON", verdict: B2_VIEW }]);
  });

  it("maps the segments back: s1.., the first alone load-bearing, A-refs to the path's root, P-refs to the point, the rest dropped", async () => {
    const { gateway } = team();
    const { segments } = await runPathsMainAnswer(inputOf({ gateway }));
    expect(segments).toEqual([
      { segmentId: "s1", text: ANSWER.segments[0]!.text, loadBearing: true, assertedNodeRefs: ["root-1", "n1-2"], servedNumberRefs: [] },
      { segmentId: "s2", text: ANSWER.segments[1]!.text, loadBearing: false, assertedNodeRefs: ["root-2", "n2-1"], servedNumberRefs: [] }]);
    const refToNode = new Map([["A1", "root-1"], ["P1", "n1-1"]]);
    expect(pathsComposedSegments({ segments: [{ text: "One.", rests_on: ["P1", "A1", "P1", "X9", "W1"] }, { text: "Two.", rests_on: [] }] }, refToNode))
      .toEqual([{ segmentId: "s1", text: "One.", loadBearing: true, assertedNodeRefs: ["n1-1", "root-1"], servedNumberRefs: [] },
        { segmentId: "s2", text: "Two.", loadBearing: false, assertedNodeRefs: [], servedNumberRefs: [] }]);
  });

  it("a paid plan runs a second round when the checker objects, under the same fence as the first; Free makes 2 calls only", async () => {
    let checked = 0;
    const paid = team(undefined, () => { checked += 1; return checked === 1 ? OBJECTION : SATISFIED; });
    const { written } = await runPathsMainAnswer(inputOf({ gateway: paid.gateway }));
    expect(paid.requests.map((request) => request.callSiteKey)).toEqual([
      "COMPOSER:SYNTHESIZER:INITIAL:1", "POST_COMPOSE_R9:EVALUATOR:1", "COMPOSER:SYNTHESIZER:RETRY:2", "POST_COMPOSE_R9:EVALUATOR:2"]);
    expect(written.outcome.outcome).toBe("READY");
    const fences = paid.requests.map((request) => frameOf(request.packet).fence);
    expect(new Set(fences).size).toBe(1);
    // Round 2's writer answers round 1's packet with its own draft and the problem (the cache reads round 1's bytes).
    expect(paid.requests[2]!.packet.messages.slice(0, 2)).toEqual(paid.requests[0]!.packet.messages);

    const free = team(undefined, () => OBJECTION);
    const freeWritten = await runPathsMainAnswer(inputOf({ gateway: free.gateway, free: true }));
    expect(free.requests.map((request) => request.callSiteKey)).toEqual(["COMPOSER:SYNTHESIZER:INITIAL:1", "POST_COMPOSE_R9:EVALUATOR:1"]);
    expect(freeWritten.written.outcome.outcome).toBe("READY_WITH_RESERVATION");
    expect(freeWritten.segments).toHaveLength(2);
  });

  // Review Focus 5 (independent review of Task 50): a Romanian question carries the question-language field everywhere, the main
  // answer included, and the writer's and the checker's prose are held to it.
  it("a Romanian question: the Romanian field ends both calls' material, and an English answer or problem is the wrong language", async () => {
    const lock = questionLanguageFromRun("ro", "Romanian")!;
    const question = { ...QUESTION, line: "Ar trebui orașul să construiască un al doilea debarcader înainte de vara viitoare?", language: lock };
    const romanian = JSON.stringify({ segments: [{ text: "Construiți al doilea debarcader pentru lunile de vară: costul lui se recuperează în zece ani, "
      + "dar iarna numărul pasagerilor scade la jumătate.", rests_on: ["A1", "P2"] }] });
    const english = JSON.stringify({ segments: [{ text: "Build the second pier for the summer months: it pays for itself within ten years, "
      + "although winter use stays low and the ferries run half empty.", rests_on: ["A1", "P2"] }] });
    const objection = (problem: string) => JSON.stringify({ satisfied: false, problem, part: "segments" });
    const { gateway, requests } = team(() => romanian);
    const { written } = await runPathsMainAnswer(inputOf({ gateway, question, free: true }));
    expect(written.outcome.outcome).toBe("READY");
    const [writer, checker] = requests;
    // The sealed report.answer.v4 / report.answer-check.v3 are sent byte for byte (no language sentence added, as R22's report): the
    // field names the language, and code holds each reply to it.
    for (const request of [writer!, checker!]) {
      expect(frameOf(request.packet).fields.at(-1)).toEqual(questionLanguageField(lock));
      expect(request.packet.messages[0]!.content).not.toContain(questionLanguageSentence(lock));
    }
    expect(writer!.classifyContent!(english, { finishReason: "stop" }))
      .toMatchObject({ parseStatus: "SCHEMA_FAILED", parseError: expect.stringContaining(TEXT_NOT_IN_QUESTION_LANGUAGE) });
    expect(writer!.classifyContent!(romanian, { finishReason: "stop" })).toMatchObject({ parseStatus: "PARSED" });
    expect(checker!.classifyContent!(objection("The answer leaves out that the third path ended without any answer, so the person "
      + "cannot see that one of the questions they chose is still open."), { finishReason: "stop" }))
      .toMatchObject({ parseStatus: "SCHEMA_FAILED", parseError: expect.stringContaining(TEXT_NOT_IN_QUESTION_LANGUAGE) });
    expect(checker!.classifyContent!(objection("Răspunsul lasă deoparte faptul că a treia cale s-a încheiat fără niciun răspuns, așa că "
      + "persoana nu vede că una dintre întrebările alese este încă deschisă."), { finishReason: "stop" })).toMatchObject({ parseStatus: "PARSED" });
  });

  it("a writer that never answers: FAILED, no segments", async () => {
    const { gateway, requests } = team(() => "not json");
    const { written, segments } = await runPathsMainAnswer(inputOf({ gateway, free: true }));
    expect(requests.map((request) => request.callSiteKey)).toEqual(["COMPOSER:SYNTHESIZER:INITIAL:1"]);
    expect(written.outcome.outcome).toBe("FAILED");
    expect(segments).toEqual([]);
  });

  it("material over the line on every ladder place: FAILED with no call, logged as too large", async () => {
    const { gateway, requests } = team();
    const logged: Array<[string, Record<string, unknown>]> = [];
    const { written, segments } = await runPathsMainAnswer(inputOf({ gateway, question: { ...QUESTION, line: "q".repeat(200_000) },
      log: (event, detail) => { logged.push([event, detail]); } }));
    expect(requests).toEqual([]);
    expect(written.outcome).toMatchObject({ outcome: "FAILED", failureCode: "PATHS_MAIN_ANSWER_DOSSIER_TOO_LARGE", rounds: [] });
    expect(segments).toEqual([]);
    expect(logged.map(([event]) => event)).toEqual(["PATHS_MAIN_ANSWER_DOSSIER_TOO_LARGE"]);
    expect(logged[0]![1]).toMatchObject({ runId: RUN });
  });
});

/* ----------------------------------------------------------------- seven full paths, in a 3-byte script */

const CJK = "中";
const CJK_QUESTION: PathRewriteQuestion = Object.freeze({ ...QUESTION, line: CJK.repeat(200) });
/** A full path: a long answer so far, the person's own 1000-character path, 30 long points (a third disputed), each citing a page. */
function fullPath(no: number): PathsDossierPath {
  return pathOf(no, {
    title: CJK.repeat(30), question: CJK.repeat(1000), ownWords: [CJK.repeat(1000)],
    outcome: ready(CJK.repeat(200), "PARTLY_HELD", { text: { line: CJK.repeat(200), summary: CJK.repeat(3000), fate: "PARTLY_HELD" } }),
    points: Array.from({ length: 30 }, (_, at) => point(`c${String(no)}-${String(at)}`, CJK.repeat(300), "STILL_ARGUED", { disputed: at % 3 === 0 })),
    sources: Array.from({ length: 30 }, (_, at) => ({ pointId: `c${String(no)}-${String(at)}`, site: `site${String(no)}.example`, link: null,
      title: CJK.repeat(20), quote: `${String(at)}${CJK.repeat(200)}`, line: CJK.repeat(100) }))
  });
}
const SEVEN: readonly PathsDossierPath[] = Object.freeze([1, 2, 3, 4, 5, 6, 7].map(fullPath));
const BIG_ANSWER = JSON.stringify({ segments: [{ text: CJK.repeat(3000), rests_on: ["A1"] }, { text: CJK.repeat(3000), rests_on: ["A7"] }] });
const BIG_OBJECTION = JSON.stringify({ satisfied: false, problem: CJK.repeat(2000), part: "segments" });

describe("seven full paths in \"中\"", () => {
  it("every body sent, round 2's included, stays at or under 195,904 bytes; every path keeps its line and fate", async () => {
    const byBytes = dossierOf(pathsDossierInput({ runId: RUN, question: CJK_QUESTION, paths: SEVEN, answerWords: 300 }));
    expect(byBytes.ladderStep).toBeGreaterThan(1);
    expect(byBytes.leftOut).toBeGreaterThan(0);
    let checked = 0;
    const { gateway, requests, sent } = team(() => BIG_ANSWER, () => { checked += 1; return checked === 1 ? BIG_OBJECTION : SATISFIED; });
    const { written } = await runPathsMainAnswer(inputOf({ gateway, question: CJK_QUESTION, paths: SEVEN }));
    expect(requests).toHaveLength(4);
    expect(written.outcome.outcome).toBe("READY");
    for (const one of sent) expect(pathRewriteBodyBytes(one.packet), one.key).toBeLessThanOrEqual(LINE);
    const first = JSON.parse(frameOf(requests[0]!.packet).fields.find((entry) => entry.name === "first_debate")!.content) as { paths: Array<{ ref: string; fate: string }> };
    expect(first.paths.map((path) => [path.ref, path.fate])).toEqual([1, 2, 3, 4, 5, 6, 7].map((no) => [`A${String(no)}`, "PARTLY_HELD"]));
  });

  it("a real count of 99,000 moves the dossier one ladder place down, logged with its place", async () => {
    const input = pathsDossierInput({ runId: RUN, question: CJK_QUESTION, paths: SEVEN, answerWords: 300 });
    const byBytes = dossierOf(input);
    // Close to the line by the bytes, so the real count is asked.
    expect((byBytes.bodyBytes + INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES) / 2).toBeGreaterThanOrEqual(ANTHROPIC_TOKEN_COUNT.fromEstimate);
    const countOnce = (): TokenCounter => {
      let asked = 0;
      return async () => { asked += 1; return asked === 1 ? 99_000 : 50_000; };
    };
    const logged: Array<[string, Record<string, unknown>]> = [];
    const fitted = await fitDossierToTokenLine(input, countOnce(), (event, detail) => { logged.push([event, detail]); }) as Dossier;
    expect(fitted.ladderAt).toBe(byBytes.ladderAt + 1);
    expect(logged).toEqual([["INVESTIGATION_REPORT_OVER_THE_TOKEN_LINE", { ladderAt: byBytes.ladderAt }]]);
    // The main answer fits its material the same way: its writer reads the place below.
    const lower = buildInvestigationDossier(input, { fromLadderAt: byBytes.ladderAt + 1 }) as Dossier;
    // Not vacuous: the place below holds less (some of the ladder's places repeat one another on a dossier without digs).
    expect(lower.fingerprint).not.toBe(byBytes.fingerprint);
    const runLog: Array<[string, Record<string, unknown>]> = [];
    const { gateway, requests } = team(() => BIG_ANSWER);
    await runPathsMainAnswer(inputOf({ gateway, question: CJK_QUESTION, paths: SEVEN, tokenCount: countOnce(),
      log: (event, detail) => { runLog.push([event, detail]); } }));
    const writerFields = frameOf(requests[0]!.packet).fields.map((entry) => [entry.name, entry.content]);
    expect(writerFields).toEqual(lower.material.answerWriter.map((entry) => [entry.name, entry.content]));
    expect(runLog).toContainEqual(["INVESTIGATION_REPORT_OVER_THE_TOKEN_LINE", { runId: RUN, ladderAt: byBytes.ladderAt }]);
  });
});
