// The preview practice's openings run (tools/preview-practice/practice-openings.ts) and its --dry gates
// (practice-openings-dry.ts): arm T through today's judge contract, arms A/B/C through the map, every step through the
// formats mode's own preview gateway (frame, door, call policy, patch follow-up, busy handling, gate watch, tokens,
// cost). The dry ports answer on the spot, so nothing here opens a socket or spends anything.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAP_CONTRACT_IDS, mapPromptContractHash } from "@debateai/map";
import { readPromptFrame, type PreviewBudgetPort } from "@debateai/providers";
import { stubVendorReply } from "../support/preview-gate-stubs.js";
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
  type OpeningsBusyWait
} from "../../tools/preview-practice/practice-openings-log.js";
import {
  OPENINGS_QUESTIONS,
  openingsArmsFromFlag,
  openingsQuestionDigests,
  openingsQuestionsFromFlag
} from "../../tools/preview-practice/practice-openings-questions.js";
import { openingsGapRoundsMax, runPracticeOpenings, type OpeningsRunInput } from "../../tools/preview-practice/practice-openings.js";

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
