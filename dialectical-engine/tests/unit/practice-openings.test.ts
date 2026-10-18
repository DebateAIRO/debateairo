// The preview practice's openings run (tools/preview-practice/practice-openings.ts) and its --dry gates
// (practice-openings-dry.ts): arm T through today's judge contract, arms A/B/C through the map, every step through the
// formats mode's own preview gateway (frame, door, call policy, patch follow-up, busy handling, gate watch, tokens,
// cost). The dry ports answer on the spot, so nothing here opens a socket or spends anything.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAP_CONTRACT_IDS, mapEnginePromptContracts, mapListSpec, mapPromptContractHash, type MapSpecContext } from "@debateai/map";
import { LENGTH_GUIDANCE_START, replyLanguageExpectation } from "@debateai/kernel";
import { anthropicMessagesRequestBody, readPromptFrame, type PreviewBudgetPort, type PromptPacket } from "@debateai/providers";
import { engineMapScriptedContent } from "../support/engine-map-script.js";
import { stubChatBody, stubVendorReply } from "../support/preview-gate-stubs.js";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { practiceRunnerPolicy, practiceTurnOrder } from "../../tools/preview-practice/practice-formats.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import { PRACTICE_CONTRACT_HASHES } from "../../tools/preview-practice/practice-lanes.js";
import {
  OPENINGS_DRY_MODELS,
  openingsDryConfig,
  openingsDryPacket,
  openingsDryPorts,
  openingsDryTargets
} from "../../tools/preview-practice/practice-openings-dry.js";
import {
  OPENINGS_SCHEMA,
  OpeningsLog,
  openingsReportFromLog,
  readOpeningsLog,
  type OpeningsBusyWait,
  type OpeningsLogLine
} from "../../tools/preview-practice/practice-openings-log.js";
import {
  OPENINGS_QUESTIONS,
  openingsArmsFromFlag,
  openingsQuestionDigests,
  openingsQuestionsFromFlag
} from "../../tools/preview-practice/practice-openings-questions.js";
import {
  openingsGapRoundsMax,
  openingsMapContractHash,
  openingsQuestionRotations,
  runPracticeOpenings,
  type OpeningsRunInput
} from "../../tools/preview-practice/practice-openings.js";
import { MAP_WORDING_N_ID_SUFFIX } from "../../tools/preview-practice/practice-map-wording.js";
import { reportMarkdown } from "../../tools/preview-practice/practice-report.js";
import { PracticeRefusal } from "../../tools/preview-practice/practice-settings.js";
import { runPractice } from "../../tools/preview-practice/practice.js";

const HAIKU = "claude-haiku-5-5";
const config = openingsDryConfig();
const targets = openingsDryTargets(config);
const policy = practiceRunnerPolicy(config);

type Wrap = (port: PreviewBudgetPort, provider: "deepinfra" | "anthropic") => PreviewBudgetPort;
const asIs: Wrap = (port) => port;

async function run(questions: string | undefined, arms: string | undefined, wrap: Wrap = asIs,
  more: Partial<OpeningsRunInput> = {}) {
  const observer = more.observer ?? new PracticeGateObserver({ now: () => 0 });
  const dry = openingsDryPorts();
  const ports = { deepinfra: observer.wrap("deepinfra", wrap(dry.ports.deepinfra, "deepinfra")),
    anthropic: observer.wrap("anthropic", wrap(dry.ports.anthropic, "anthropic")) };
  const result = await runPracticeOpenings({ config, targets, ports, observer, questions: openingsQuestionsFromFlag(questions),
    arms: openingsArmsFromFlag(arms), bound: policy.bounds.JUDGE,
    contractHashes: { judge: PRACTICE_CONTRACT_HASHES.judge, map: mapPromptContractHash() },
    sleep: dry.sleep, busyWaitMs: 0, ...more });
  return { ...result, script: dry.script };
}

const folders: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("practice openings --dry: the scripted gates", () => {
  it("uses the five preview AIs", () => {
    expect(targets.map((target) => target.model).sort()).toEqual([...OPENINGS_DRY_MODELS].sort());
  });

  it("answers on the spot: no fetch, no socket, a no-op sleep, every request counted by the script", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const dry = openingsDryPorts();
    const started = Date.now();
    await dry.sleep(600_000);
    expect(Date.now() - started).toBeLessThan(1_000);
    const result = await run("ro-euro", "T,C");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.script.requests).toBeGreaterThanOrEqual(result.calls.length);
  });
});

describe("practice openings: arm T, today's opening", () => {
  it("asks every AI for a full position, blind, with today's judge contract and call sites", async () => {
    const result = await run("ro-euro", "T");
    const calls = [...result.calls].sort((a, b) => a.order - b.order);
    expect(calls.map((call) => call.callSiteKey)).toEqual(["JUDGE", "JUDGE:root:secondary", "JUDGE:root:2", "JUDGE:root:3", "JUDGE:root:4"]);
    expect(calls.every((call) => call.step === "POSITION" && call.shown === "BLIND" && call.status === "ACCEPTED")).toBe(true);
    expect(calls.every((call) => call.inputTokens === 100 && call.outputTokens === 50 && call.costNanoUsd !== null)).toBe(true);
    expect(calls.every((call) => typeof call.replyText === "string" && call.replyText.includes("statement"))).toBe(true);
    expect(calls.every((call) => call.attempts.length === 1 && call.attempts[0]!.replyForm === "ORIGINAL")).toBe(true);
    expect(result.arms).toEqual([expect.objectContaining({ arm: "T", questionId: "ro-euro", outcome: "POSITIONS", positions: 5, map: null })]);
  });

  it("seats rotate by the question's fixed place among the twelve, so a rerun of a subset keeps the full run's order (ruling P9)", async () => {
    const order = practiceTurnOrder(targets).map((target) => target.model);
    const firstOf = async (questions: string, id: string) =>
      (await run(questions, "T")).calls.find((call) => call.questionId === id && call.callSiteKey === "JUDGE")!.model;
    for (const id of ["en-four-day-week", "en-rent-caps"]) {
      const fixed = OPENINGS_QUESTIONS.findIndex((question) => question.id === id);
      expect(await firstOf(id, id)).toBe(order[fixed % order.length]);
    }
    expect(await firstOf("ro-euro,en-four-day-week", "en-four-day-week")).toBe(await firstOf("en-four-day-week", "en-four-day-week"));
  });
});

describe("practice openings: arm C through the real gateway path", () => {
  it("plans, lists, merges (the merger busy: code merge), fills one gap and chooses; the busy AI sits out", async () => {
    const result = await run("ro-euro", "C");
    const calls = [...result.calls].sort((a, b) => a.order - b.order);
    expect(calls.map((call) => call.step)).toEqual(["ANGLES", "LIST", "LIST", "LIST", "LIST", "MERGE", "GAP", "CHOOSE"]);
    expect(calls.map((call) => call.callSiteKey))
      .toEqual(["MAP:angles", "MAP:list:0", "MAP:list:1", "MAP:list:2", "MAP:list:3", "MAP:merge", "MAP:gap:1", "MAP:choose"]);
    expect(calls.find((call) => call.step === "MERGE")).toMatchObject({ model: HAIKU, status: "BUSY" });
    expect(result.busyModels).toEqual([HAIKU]);
    const arm = result.arms[0]!;
    expect(arm.outcome).toBe("MAP");
    expect(arm.marks.map((mark) => mark.mark)).toEqual(expect.arrayContaining(["MAP_MERGE_FALLBACK", "ANSWERS_FILLED"]));
    expect(arm.notes.map((note) => note.note)).toContain("GAP_STOPPED");
    expect(arm.map?.choice?.answers.length).toBeGreaterThanOrEqual(2);
    expect(calls.filter((call) => call.step !== "MERGE").every((call) => call.status === "ACCEPTED")).toBe(true);
    expect(calls.filter((call) => call.step !== "MERGE").every((call) => call.inputTokens === 100 && call.costNanoUsd !== null)).toBe(true);
    expect(calls.find((call) => call.step === "GAP")!.shown).not.toBe("BLIND");
  });

  it("never sends a model id or a maker to the merge, gap or choose AI", async () => {
    const bodies: string[] = [];
    const spy: Wrap = (port) => ({ execute: async (input, signal) => { bodies.push(input.requestBody); return port.execute(input, signal); } });
    await run("en-rent-caps", "B,C", spy);
    const names = [...targets.map((target) => target.model), ...targets.map((target) => target.maker)];
    const later = bodies.map((body) => readPromptFrame(openingsDryPacket(body).packet))
      .filter((frame) => [MAP_CONTRACT_IDS.merge, MAP_CONTRACT_IDS.gap, MAP_CONTRACT_IDS.choose].includes(frame.contractId));
    expect(new Set(later.map((frame) => frame.contractId)).size).toBe(3);
    for (const frame of later) for (const entry of frame.fields) for (const name of names) expect(entry.content).not.toContain(name);
  });

  it("gap rounds per arm: A none, B exactly one, C up to two (ruling T9-m1)", async () => {
    expect((["A", "B", "C"] as const).map(openingsGapRoundsMax)).toEqual([0, 1, 2]);
    // Every gap round adds two new points here, so the stop rule never ends the rounds early: the rounds asked are the arm's own.
    let serial = 0;
    const generous: Wrap = (port, provider) => ({ execute: async (input, signal) => {
      const { model, packet } = openingsDryPacket(input.requestBody);
      if (readPromptFrame(packet).contractId !== MAP_CONTRACT_IDS.gap) return port.execute(input, signal);
      serial += 1;
      const point = (n: number) => ({ claim: `A point the list missed about the housing market, number ${String(serial)}.${String(n)}`,
        why_it_matters: "If it is true, the answer has to take it into account.", leans: "context" });
      return { status: 200, body: stubVendorReply(provider, model, JSON.stringify({ new_points: [point(1), point(2)], framing_challenges: [] }),
        `gap-${String(serial)}`) };
    } });
    const result = await run("en-rent-caps", "A,B,C", generous);
    const gaps = (arm: string) => result.calls.filter((call) => call.arm === arm && call.step === "GAP");
    expect([gaps("A").length, gaps("B").length, gaps("C").length]).toEqual([0, 1, 2]);
    expect([...gaps("B"), ...gaps("C")].every((call) => call.status === "ACCEPTED")).toBe(true);
  });
});

describe("practice openings: the merge and choose calls get the full answer room (controller ruling R-1)", () => {
  it("MAP:merge and MAP:choose ask for 32,768 tokens; the angle, list and gap calls and arm T ask for the judge bound", async () => {
    // Each request as the scripted gate reads it: the contract the step carries and the max_tokens its body asks for.
    const asked: { contract: string; maxTokens: number }[] = [];
    const reading: Wrap = (port) => ({ execute: async (input, signal) => {
      const body = JSON.parse(input.requestBody) as { max_tokens?: unknown };
      asked.push({ contract: readPromptFrame(openingsDryPacket(input.requestBody).packet).contractId, maxTokens: Number(body.max_tokens) });
      return port.execute(input, signal);
    } });
    await run("ro-euro", "T,C", reading);
    const judgeRoom = policy.bounds.JUDGE.tokenCeiling;
    const answerRoom = 32_768;
    expect(judgeRoom).toBeLessThan(answerRoom);
    const longSteps = [MAP_CONTRACT_IDS.merge, MAP_CONTRACT_IDS.choose];
    const sentLong = asked.filter((request) => longSteps.includes(request.contract));
    expect(new Set(sentLong.map((request) => request.contract))).toEqual(new Set(longSteps));
    expect(sentLong.every((request) => request.maxTokens === answerRoom)).toBe(true);
    const others = asked.filter((request) => !longSteps.includes(request.contract));
    expect(others.map((request) => request.contract)).toEqual(expect.arrayContaining([MAP_CONTRACT_IDS.angles, MAP_CONTRACT_IDS.listAngle, MAP_CONTRACT_IDS.gap]));
    expect(others.some((request) => request.contract.startsWith("judge."))).toBe(true);
    expect(others.every((request) => request.maxTokens === judgeRoom)).toBe(true);
  });
});

describe("practice openings: repairs and busy AIs", () => {
  it("a slip fixed by the patch follow-up is REPAIRED, its accepted form PATCH", async () => {
    const result = await run("en-four-day-week", "B");
    const repaired = result.calls.find((call) => call.model === HAIKU && call.step === "LIST")!;
    expect(repaired.status).toBe("REPAIRED");
    expect(repaired.replyForm).toBe("PATCH");
    expect(repaired.attempts.map((attempt) => attempt.replyForm)).toEqual(["ORIGINAL", "PATCH"]);
    expect(repaired.attempts.map((attempt) => attempt.parseStatus)).toEqual(["SCHEMA_FAILED", "PARSED"]);
    // Both tries' tokens, from the gate's watch.
    expect(repaired.inputTokens).toBe(200);
    expect(result.script.slipped).toBe(true);
    // F-I1: the reply text is the merged reply the gateway accepted (what the owners score), not the patch fragment.
    const reply = JSON.parse(repaired.replyText ?? "null") as { points?: { claim: string }[]; candidate_answers?: string[] } | null;
    expect(Array.isArray(reply?.points) && Array.isArray(reply.candidate_answers)).toBe(true);
    expect(reply?.points).toHaveLength(3);
    expect(reply?.points?.every((entry) => entry.claim.length <= 240)).toBe(true);
    expect(reply?.candidate_answers).toHaveLength(1);
  });

  it("a model busy at merge sits out every later arm and question", async () => {
    const result = await run("ro-euro,en-rent-caps", "B,C");
    const firstMerge = result.calls.find((call) => call.step === "MERGE")!;
    expect(firstMerge.status).toBe("BUSY");
    const after = result.calls.filter((call) => call.startedAt > firstMerge.finishedAt || call.questionId === "en-rent-caps");
    expect(after.length).toBeGreaterThan(0);
    expect(after.filter((call) => call.model === firstMerge.model)).toEqual([]);
    expect(result.arms.map((arm) => `${arm.questionId}:${arm.arm}:${arm.outcome}`))
      .toEqual(["ro-euro:B:MAP", "ro-euro:C:MAP", "en-rent-caps:B:MAP", "en-rent-caps:C:MAP"]);
  });

  it("a busy model waits within its budget and the same call is tried again; its budget spent, it sits out (as formats)", async () => {
    const waits: OpeningsBusyWait[] = [];
    const busy: string[] = [];
    const result = await run("ro-euro", "B", asIs, { busyWaitMs: 120_000, random: () => 0,
      onBusyWait: (wait) => waits.push(wait), onBusy: (model) => busy.push(model) });
    expect(waits.map((wait) => [wait.model, wait.arm, wait.questionId, wait.callSiteKey, wait.wait, wait.waitMs, wait.reason]))
      .toEqual([[HAIKU, "B", "ro-euro", "MAP:merge", 1, 60_000, "VENDOR_REFUSED"], [HAIKU, "B", "ro-euro", "MAP:merge", 2, 60_000, "VENDOR_REFUSED"]]);
    // One record for the call, after the waits.
    expect(result.calls.filter((call) => call.step === "MERGE").map((call) => `${call.model}:${call.status}`)).toEqual([`${HAIKU}:BUSY`]);
    expect(busy).toEqual([HAIKU]);
  });

  it("a whole --dry run (12 questions, 4 arms) through openings.jsonl gives PASS_WITH_WARNINGS (exit 10)", async () => {
    const directory = mkdtempSync(join(tmpdir(), "practice-openings-dry-"));
    folders.push(directory);
    const log = OpeningsLog.create(directory);
    const questions = openingsQuestionsFromFlag(undefined);
    const arms = openingsArmsFromFlag(undefined);
    const observer = new PracticeGateObserver();
    log.append({ kind: "start", schema: OPENINGS_SCHEMA, mode: "openings", dry: true, startedAt: new Date().toISOString(),
      models: targets.map((target) => target.model), questions: questions.map((question) => question.id),
      questionDigests: openingsQuestionDigests(questions), arms, busyWaitMs: 0, unsentStreakAtStart: { deepinfra: 0, anthropic: 0 },
      remainingBefore: { deepinfra: null, anthropic: null } });
    observer.listen({ event: (event) => log.append({ kind: "wire", event }), stop: (stop) => log.append({ kind: "stop", stop }) });
    const result = await run(undefined, undefined, asIs, { observer,
      onCall: (call) => log.append({ kind: "call", call }), onArm: (arm) => log.append({ kind: "arm", arm }),
      onBusy: (model) => log.append({ kind: "busy", model }) });
    log.append({ kind: "end", finishedAt: new Date().toISOString(), interrupted: false, remainingAfter: { deepinfra: null, anthropic: null } });
    log.close();
    expect(result.arms).toHaveLength(48);
    expect(result.arms.every((arm) => arm.outcome === (arm.arm === "T" ? "POSITIONS" : "MAP"))).toBe(true);
    const marks = new Set(result.arms.flatMap((arm) => arm.marks.map((mark) => mark.mark)));
    expect([...marks]).toEqual(expect.arrayContaining(["MAP_MERGE_FALLBACK", "ANSWERS_FILLED"]));
    expect(result.arms.flatMap((arm) => arm.notes.map((note) => note.note))).toContain("GAP_STOPPED");
    expect(new Set(result.calls.map((call) => call.step))).toEqual(new Set(["POSITION", "ANGLES", "LIST", "SNOWBALL", "MERGE", "GAP", "CHOOSE"]));
    expect(result.script).toMatchObject({ busyModel: HAIKU, slipped: true });
    const report = openingsReportFromLog(readOpeningsLog(directory));
    expect(report.verdict).toBe("PASS_WITH_WARNINGS");
    expect(report.exitCode).toBe(10);
    expect(report.reasons).toEqual([expect.stringMatching(new RegExp(`^MODEL_BUSY_PARTLY:${HAIKU}:answered=\\d+:skipped=1$`, "u")),
      `FORMAT_REPAIRED:${HAIKU}:1`, "UNBILLED_REFUSALS:2"]);
  });
});

describe("practice openings: the selection is checked before the first call (ruling T11-m6)", () => {
  it("a question that is not one of the twelve word for word, or an unknown arm, is refused before anything is sent", async () => {
    const [first, second] = OPENINGS_QUESTIONS as [typeof OPENINGS_QUESTIONS[number], typeof OPENINGS_QUESTIONS[number]];
    let sent = 0;
    const counting: Wrap = (port) => ({ execute: async (input, signal) => { sent += 1; return port.execute(input, signal); } });
    for (const more of [
      { questions: [first, Object.freeze({ ...second, questionLine: "Should I lie to my boss?" })] },
      { questions: [first, Object.freeze({ ...second, id: "xx-unknown" })] },
      { questions: [first, first] },
      { arms: ["T", "Z"] as unknown as OpeningsRunInput["arms"] }
    ] satisfies Partial<OpeningsRunInput>[]) {
      await expect(run(undefined, "T", counting, more)).rejects.toThrow("PRACTICE_FLAG_VALUE_INVALID");
    }
    expect(sent).toBe(0);
    expect(openingsQuestionRotations(openingsQuestionsFromFlag("en-rent-caps,ro-euro"))).toEqual([0, 11]);
  });
});

describe("practice openings: a stopped gate ends the run after the arm in progress (ruling T11-m1)", () => {
  it("the arm in progress records a STOPPED note; no new arm or question starts", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    let requests = 0;
    const stopsAtFirst: Wrap = (port) => ({ execute: async (input, signal) => {
      requests += 1;
      if (requests === 1) observer.stop("deepinfra", "GATE_REFUSED_TEST");
      return port.execute(input, signal);
    } });
    const result = await run("ro-euro,en-rent-caps", "T,B", stopsAtFirst, { observer });
    expect(result.arms.map((arm) => `${arm.questionId}:${arm.arm}`)).toEqual(["ro-euro:T"]);
    expect(result.arms[0]!.notes).toEqual([{ note: "STOPPED", step: "POSITION", detail: "deepinfra:GATE_REFUSED_TEST" }]);
    expect(result.calls.every((call) => call.arm === "T" && call.questionId === "ro-euro")).toBe(true);
  });

  it("a stop during a map arm: its later calls behind the stopped gate are SKIPPED_STOPPED and the arm's note says why", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const stopsAtMerge: Wrap = (port) => ({ execute: async (input, signal) => {
      if (readPromptFrame(openingsDryPacket(input.requestBody).packet).contractId === MAP_CONTRACT_IDS.merge) observer.stop("deepinfra", "GATE_REFUSED_TEST");
      return port.execute(input, signal);
    } });
    const result = await run("ro-euro,en-rent-caps", "B", stopsAtMerge, { observer });
    expect(result.arms.map((arm) => `${arm.questionId}:${arm.arm}`)).toEqual(["ro-euro:B"]);
    expect(result.arms[0]!.notes.filter((note) => note.note === "STOPPED"))
      .toEqual([{ note: "STOPPED", step: "MAP", detail: "deepinfra:GATE_REFUSED_TEST" }]);
    const skipped = result.calls.filter((call) => call.status === "SKIPPED_STOPPED");
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped.every((call) => call.gate === "deepinfra" && call.errorCode === "GATE_REFUSED_TEST")).toBe(true);
  });

  it("an arm that ran with no stop has no STOPPED note", async () => {
    const result = await run("ro-euro", "T,B");
    expect(result.arms.flatMap((arm) => arm.notes.map((note) => note.note))).not.toContain("STOPPED");
  });
});

describe("LG-B (L30): an Anthropic body whose first turn is marked reads as today's packet", () => {
  it("the dry openings tool and the gate stub join a turn's text blocks, so the frame reader sees today's turn", () => {
    const messages: PromptPacket["messages"] = [{ role: "system", content: "Synthetic frame." },
      { role: "user", content: "Synthetic material." }, { role: "user", content: "Synthetic rejection." }];
    const body = (cacheFirstUserTurn: boolean) => anthropicMessagesRequestBody({ model: "claude-haiku-5-5", maxTokens: 8, thinkingLevel: "high",
      messages, cacheFirstUserTurn });
    // The marked form is what is really sent: two blocks, the first marked.
    expect((JSON.parse(body(true)) as { messages: { content: unknown[] }[] }).messages[0]!.content).toHaveLength(2);
    expect(openingsDryPacket(body(true))).toEqual(openingsDryPacket(body(false)));
    expect(stubChatBody("anthropic", JSON.parse(body(true)) as Record<string, unknown>))
      .toBe(stubChatBody("anthropic", JSON.parse(body(false)) as Record<string, unknown>));
  });
});

describe("practice openings: arms C2 and C2N, wording N's comparison (Task 17a, D5; rulings R3-T17a.1-3)", () => {
  const sealed = { judge: PRACTICE_CONTRACT_HASHES.judge, map: mapPromptContractHash(), engine: engineContractHash() };
  /** The dry ports, with every engine-2 map step (wording N's ids read as their sealed ones) answered by Task 17's script. */
  const engineScript = (sent: { arm: string; id: string; fields: string; named: boolean }[], arm: () => string): Wrap => (port, provider) => ({
    execute: async (input, signal) => {
      const { model, packet } = openingsDryPacket(input.requestBody);
      const frame = readPromptFrame(packet);
      sent.push({ arm: arm(), id: frame.contractId, fields: JSON.stringify(frame.fields), named: JSON.stringify(packet).includes("A if you prefer A") });
      const reply = engineMapScriptedContent(frame.contractId.replace(/\.wording-n$/u, ""), frame.fields);
      if (reply === null) return port.execute(input, signal);
      return { status: 200, body: stubVendorReply(provider, model, reply, `engine-${String(sent.length)}`) };
    } });

  it("the arms flag and check: C2 and C2N only when named, in the fixed order; anything else refused before a call", async () => {
    expect(openingsArmsFromFlag(undefined)).toEqual(["T", "A", "B", "C"]);
    expect(openingsArmsFromFlag("C2N,T,C2")).toEqual(["T", "C2", "C2N"]);
    for (const bad of ["C3", "C2,C2", "c2"]) {
      expect(() => openingsArmsFromFlag(bad)).toThrow("--arms (only T, A, B, C, C2, C2N, comma-separated, each once)");
    }
    const dry = openingsDryPorts();
    await expect(runPracticeOpenings({ config, targets, ports: dry.ports, observer: new PracticeGateObserver({ now: () => 0 }),
      questions: openingsQuestionsFromFlag("en-nuclear"), arms: ["C2", "C2"], bound: policy.bounds.JUDGE, contractHashes: sealed,
      sleep: dry.sleep, busyWaitMs: 0 })).rejects.toThrow("--arms (only T, A, B, C, C2, C2N, each once)");
    expect(dry.script.requests).toBe(0);
    // The dry script answers engine 1's forms only: the command refuses the engine-2 arms with --dry, before anything runs.
    for (const arms of ["C2", "T,C2N"]) {
      const folder = mkdtempSync(join(tmpdir(), "pp-openings-c2-"));
      folders.push(folder);
      const logged: string[] = [];
      const result = await runPractice(["openings", "--dry", "--arms", arms, "--out", join(folder, "out")], {},
        { log: (line: string) => { logged.push(line); }, sleep: async () => undefined, wait: async () => undefined });
      expect(result.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID"]);
      expect(logged).toContain("practice could not run: PRACTICE_FLAG_VALUE_INVALID: --arms C2, C2N (not read by openings --dry)");
    }
  });

  it("the hash pick: an engine-2 step records the engine seal, engine 1's the map hash; no engine seal is a practice refusal", () => {
    const ctx: MapSpecContext = { questionLine: "Should a city make its buses free?", languageName: "English", languageTag: "en",
      replyLanguage: replyLanguageExpectation("Should a city make its buses free?") };
    const engineCtx: MapSpecContext = { ...ctx, length: { targets: LENGTH_GUIDANCE_START.map, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord },
      engine: true };
    expect(openingsMapContractHash(mapListSpec(ctx, null), sealed)).toBe(mapPromptContractHash());
    expect(openingsMapContractHash(mapListSpec(engineCtx, null), sealed)).toBe(engineContractHash());
    // A wording-N call keeps spec.engine, so it records the engine seal too (its own .wording-n id says it is not that text).
    const wordingN = { ...mapListSpec(engineCtx, null), contract: { ...mapEnginePromptContracts().listOpen, contractId: `map.list.open.v2${MAP_WORDING_N_ID_SUFFIX}` } };
    expect(openingsMapContractHash(wordingN, sealed)).toBe(engineContractHash());
    expect(openingsMapContractHash(mapListSpec(ctx, null), { judge: sealed.judge, map: sealed.map })).toBe(mapPromptContractHash());
    expect(() => openingsMapContractHash(mapListSpec(engineCtx, null), { judge: sealed.judge, map: sealed.map })).toThrow(PracticeRefusal);
    expect(() => openingsMapContractHash(mapListSpec(engineCtx, null), { judge: sealed.judge, map: sealed.map }))
      .toThrow(/^PRACTICE_OPENINGS_ENGINE_UNSEALED/u);
  });

  it("end to end: wording N only on C2N's list and choose calls; angles, merge, gap and the check alike; the same items; the report", async () => {
    const sent: { arm: string; id: string; fields: string; named: boolean }[] = [];
    let current = "C2";
    const lines: OpeningsLogLine[] = [];
    const observer = new PracticeGateObserver({ now: () => 0 });
    const questions = openingsQuestionsFromFlag("en-nuclear");
    const arms = openingsArmsFromFlag("C2,C2N");
    lines.push({ kind: "start", schema: OPENINGS_SCHEMA, mode: "openings", dry: true, startedAt: new Date().toISOString(),
      models: targets.map((target) => target.model), questions: questions.map((question) => question.id),
      questionDigests: openingsQuestionDigests(questions), arms, busyWaitMs: 0, unsentStreakAtStart: { deepinfra: 0, anthropic: 0 },
      remainingBefore: { deepinfra: null, anthropic: null } });
    const result = await run("en-nuclear", "C2,C2N", engineScript(sent, () => current), { observer, contractHashes: sealed,
      onCall: (call) => lines.push({ kind: "call", call }),
      onArm: (arm) => { lines.push({ kind: "arm", arm }); current = "C2N"; } });
    lines.push({ kind: "end", finishedAt: new Date().toISOString(), interrupted: false, remainingAfter: { deepinfra: null, anthropic: null } });
    expect(result.calls.every((call) => call.status === "ACCEPTED")).toBe(true);
    expect(result.arms.map((line) => [line.arm, line.outcome, line.seats])).toEqual([["C2", "MAP", 5], ["C2N", "MAP", 5]]);
    const ids = (arm: string) => sent.filter((entry) => entry.arm === arm).map((entry) => entry.id);
    // The wrapper only on C2N, and only on the writing steps (the angle map asks the angle list and the choose).
    expect([...new Set(ids("C2"))].sort()).toEqual(["map.angles.v2", "map.check.v1", "map.choose.v2", "map.gap.v2", "map.list.angle.v2", "map.merge.v2"]);
    expect([...new Set(ids("C2N"))].sort()).toEqual(["map.angles.v2", "map.check.v1", "map.choose.v2.wording-n", "map.gap.v2",
      "map.list.angle.v2.wording-n", "map.merge.v2"]);
    expect(sent.filter((entry) => entry.id.endsWith(MAP_WORDING_N_ID_SUFFIX)).every((entry) => entry.named)).toBe(true);
    expect(sent.filter((entry) => /^map\.(list|choose)\./u.test(entry.id) && !entry.id.endsWith(MAP_WORDING_N_ID_SUFFIX)).some((entry) => entry.named)).toBe(false);
    // Ruling R3-T17a.1: one seed, so both arms see the same items in the same order, and the steps that are not wording N
    // (angles, merge, gap, the one sealed check) are sent the same material in both arms.
    for (const id of ["map.angles.v2", "map.merge.v2", "map.gap.v2", "map.check.v1"]) {
      const material = (arm: string) => sent.filter((entry) => entry.arm === arm && entry.id === id).map((entry) => entry.fields);
      expect(material("C2N"), id).toEqual(material("C2"));
      expect(material("C2").length, id).toBeGreaterThan(0);
    }
    const [c2, c2n] = result.arms;
    expect(c2n!.map!.items).toEqual(c2!.map!.items);
    expect(c2n!.map!.choice).toEqual(c2!.map!.choice);
    expect(c2!.map!.answerCheck).toBeDefined();
    // The report: per arm and question the debated answers and the codes; per arm D1's counts; report.md's table.
    const report = openingsReportFromLog(lines);
    const wording = report.wording as readonly Readonly<{ arm: string; questionId: string; answers: readonly string[]; codes: readonly string[]; seats: number }>[];
    expect(wording.map((row) => [row.arm, row.questionId, row.seats])).toEqual([["C2", "en-nuclear", 5], ["C2N", "en-nuclear", 5]]);
    expect(wording[0]!.answers.length).toBeGreaterThanOrEqual(2);
    expect(wording[0]!.codes.every((code) => /^(a|c)[1-4]:PASSED$/u.test(code))).toBe(true);
    expect((report.wordingTotals as readonly Readonly<{ arm: string }>[]).map((row) => row.arm)).toEqual(["C2", "C2N"]);
    const markdown = reportMarkdown(report);
    expect(markdown).toContain("Wording N (D5; counts only, the debated answers word for word are in report.json `wording`; C2 the sealed wording, C2N wording N):");
    expect(markdown).toMatch(/^\| C2 \| 1 \| \d+ \| 0 \| 0 \| 0 \| 0 \| 0 \| \d\.\d \|$/mu);
    expect(markdown).toMatch(/^\| C2N \| 1 \| \d+ \| 0 \| 0 \| 0 \| 0 \| 0 \| \d\.\d \|$/mu);
  });

  it("ruling R3-T17a.2: an engine-2 arm without the engine seal ends loudly: nothing sent, the arm's note names the refusal", async () => {
    const result = await run("en-nuclear", "C,C2", asIs, { contractHashes: { judge: sealed.judge, map: sealed.map } });
    expect(result.script.requests).toBeGreaterThan(0); // arm C (engine 1) runs as before
    expect(result.calls.filter((call) => call.arm === "C2")).toEqual([]);
    const line = result.arms.find((arm) => arm.arm === "C2")!;
    expect([line.outcome, line.map, line.marks]).toEqual(["UNAVAILABLE", null, []]);
    expect(line.notes).toEqual([{ note: "PRACTICE_REFUSED", step: "MAP", detail: "PRACTICE_OPENINGS_ENGINE_UNSEALED" }]);
    expect(result.arms.find((arm) => arm.arm === "C")!.outcome).toBe("MAP");
  });
});
