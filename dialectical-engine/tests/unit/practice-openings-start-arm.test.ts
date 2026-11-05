// tests/unit/practice-openings-start-arm.test.ts
// V4 start step, Task 91 (spec 2026-11-03 §4.1, "About a minute"): the openings practice's arm S. For each fixed question and each plan
// (Free, Plus, Pro, Max) it runs the step before Start as the API runs it: the plan's list seats (startSeatsFor, the planner on the first
// seat), the planner and the lists (mapRunStartLists, STREAM), the first merge at the cut and a late merge after it (mapMergeStartLists,
// on Haiku), every call through the openings' own preview gateway. One START_CARD line per question and plan says how long the card took,
// how many lists were in by the cut, how many came late and each seat's list time; report.json gives the per-plan summary, the seat order
// the times suggest and the cost per plan. The dry gates answer on the spot, so nothing here opens a socket or spends anything. The
// figures in the made-up lines are made up.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { START_CALL_SITES, START_LIST_CONTRACT_ID, START_STEP_TIMING, mapPromptContractHash, type StartClock } from "@debateai/map";
import { PreviewVendorRefusedUnbilled, readPromptFrame, type PreviewBudgetPort } from "@debateai/providers";
import { START_SEAT_SPEED_ORDER } from "../../apps/api/src/start-step/seats.js";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { PRACTICE_FORMATS_DEFAULTS, practiceRunnerPolicy, practiceWireUsage } from "../../tools/preview-practice/practice-formats.js";
import { PracticeGateObserver, type PracticeWireEvent } from "../../tools/preview-practice/practice-gate-observer.js";
import { PRACTICE_CONTRACT_HASHES } from "../../tools/preview-practice/practice-lanes.js";
import {
  OPENINGS_DRY_MODELS,
  openingsDryConfig,
  openingsDryPacket,
  openingsDryPorts,
  openingsDryTargets,
  openingsDryVendorReply
} from "../../tools/preview-practice/practice-openings-dry.js";
import {
  OPENINGS_SCHEMA,
  openingsReportFromLog,
  startSeatOrderOf,
  startStepSummary,
  type OpeningsCall,
  type OpeningsLogLine,
  type OpeningsStartCardLine
} from "../../tools/preview-practice/practice-openings-log.js";
import {
  OPENINGS_ARMS,
  OPENINGS_QUESTIONS,
  OPENINGS_START_ARMS,
  OPENINGS_START_PLANS,
  openingsArmsFromFlag,
  openingsQuestionsFromFlag
} from "../../tools/preview-practice/practice-openings-questions.js";
import { OPENINGS_START_LIST_WRITERS, openingsMaxInFlightDefault, runStartStepArm } from "../../tools/preview-practice/practice-openings.js";
import { practiceVerdict } from "../../tools/preview-practice/practice-verdict.js";
import { parsePracticeArgs, runPractice } from "../../tools/preview-practice/practice.js";

const HAIKU = "claude-haiku-5-5";
const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const QWEN = "Qwen/Qwen3.8-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const config = openingsDryConfig();
const targets = openingsDryTargets(config);
const policy = practiceRunnerPolicy(config);
const hashes = { judge: PRACTICE_CONTRACT_HASHES.judge, map: mapPromptContractHash(), engine: engineContractHash() };

const folders: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const freshOut = (): string => { const folder = mkdtempSync(join(tmpdir(), "pp-start-arm-")); folders.push(folder); return join(folder, "out"); };
const jsonl = (out: string): Record<string, any>[] => readFileSync(join(out, "openings.jsonl"), "utf8").trim().split("\n")
  .map((line) => JSON.parse(line) as Record<string, any>);

/** A clock that moves only when told: the cut, the cap and the planner's race wait on it (StartClock). */
function fakeClock(): StartClock & { advance(ms: number): void } {
  let at = 0;
  let waits: { until: number; done: () => void }[] = [];
  return {
    now: () => at,
    sleep: (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
      if (signal.aborted) { resolve(); return; }
      waits.push({ until: at + ms, done: resolve });
      signal.addEventListener("abort", () => { resolve(); }, { once: true });
    }),
    advance(ms: number): void {
      at += ms;
      const due = waits.filter((wait) => wait.until <= at);
      waits = waits.filter((wait) => wait.until > at);
      for (const wait of due) wait.done();
    }
  };
}

describe("practice openings, arm S: the start-step card per plan (Task 91)", () => {
  it("names arm S and the four plans; S runs only when named, after the other arms; anything else is still refused", () => {
    // Task 91c added arm Q (the clarifying call's time, tests/unit/practice-openings-clarify-arm.test.ts) beside S.
    expect(OPENINGS_START_ARMS).toEqual(["S", "Q"]);
    expect(OPENINGS_START_PLANS).toEqual(["FREE", "PLUS", "PRO", "MAX"]);
    // Spec §4.1 "Which AIs" (S5): Free 2, Plus 4, Pro 5, Max 7 list writers.
    expect(OPENINGS_START_LIST_WRITERS).toEqual({ FREE: 2, PLUS: 4, PRO: 5, MAX: 7 });
    // With arm S the run lets Max's seven lists and the merge go at once (spec §4.1: every list starts at the same moment);
    // without it, the formats' default stays.
    expect(openingsMaxInFlightDefault(["S"])).toBe(OPENINGS_START_LIST_WRITERS.MAX + 1);
    expect(openingsMaxInFlightDefault(["T", "S"])).toBe(OPENINGS_START_LIST_WRITERS.MAX + 1);
    expect(openingsMaxInFlightDefault(OPENINGS_ARMS)).toBe(PRACTICE_FORMATS_DEFAULTS.maxInFlight);
    expect(openingsArmsFromFlag(undefined)).toEqual([...OPENINGS_ARMS]);
    expect(openingsArmsFromFlag("S")).toEqual(["S"]);
    expect(openingsArmsFromFlag("S,T")).toEqual(["T", "S"]);
    for (const bad of ["s", "S,S", "S2"]) {
      expect(() => openingsArmsFromFlag(bad)).toThrow("--arms (only T, A, B, C, C2, C2N, S, Q, comma-separated, each once)");
    }
  });

  it("--dry --arms S over the 12 questions: 48 START_CARD lines, only planner, list and merge calls, the summary per plan, cost only in --out", async () => {
    const out = freshOut();
    const logged: string[] = [];
    const result = await runPractice(["openings", "--dry", "--arms", "S", "--out", out], {},
      { log: (line) => { logged.push(line); }, sleep: async () => undefined, wait: async () => undefined });
    expect([result.report.verdict, result.exitCode]).toEqual(["PASS", 0]);
    const lines = jsonl(out);
    expect(lines[0]).toMatchObject({ kind: "start", arms: ["S"], dry: true, questions: OPENINGS_QUESTIONS.map((question) => question.id) });

    const cards = lines.filter((line) => line.kind === "START_CARD") as unknown as OpeningsStartCardLine[];
    expect(cards).toHaveLength(48);
    expect(cards.map((card) => `${card.questionId}:${card.plan}`))
      .toEqual(OPENINGS_QUESTIONS.flatMap((question) => OPENINGS_START_PLANS.map((plan) => `${question.id}:${plan}`)));
    for (const card of cards) {
      // A card line carries the times and counts only, never a cost.
      expect(Object.keys(card).sort()).toEqual(["cardMs", "kind", "late", "listsIn", "plan", "questionId", "seatMs"]);
      expect(card.seatMs).toHaveLength(OPENINGS_START_LIST_WRITERS[card.plan]);
      // The dry gates answer at once: every list is in by the cut, none late.
      expect([card.listsIn, card.late]).toEqual([card.seatMs.length, 0]);
      expect(card.cardMs).toBeGreaterThanOrEqual(0);
      for (const seat of card.seatMs) expect(seat.ms).toBeGreaterThanOrEqual(0);
    }
    // Free seats the Free line-up (the dry one: GLM and DeepSeek); Max takes every company once in today's speed order, then a second seat
    // of the first two ("#2"), as startSeatsFor does in the API.
    expect(cards.find((card) => card.plan === "FREE")!.seatMs.map((seat) => seat.model)).toEqual([GLM, DEEPSEEK]);
    expect(cards.find((card) => card.plan === "MAX")!.seatMs.map((seat) => seat.model))
      .toEqual([...START_SEAT_SPEED_ORDER, `${START_SEAT_SPEED_ORDER[0]!}#2`, `${START_SEAT_SPEED_ORDER[1]!}#2`]);

    const calls = lines.filter((line) => line.kind === "call").map((line) => line.call as OpeningsCall);
    expect([...new Set(calls.map((call) => call.step))].sort()).toEqual(["ANGLES", "START_LIST", "START_MERGE"]);
    expect(calls.every((call) => call.arm === "S" && call.status === "ACCEPTED")).toBe(true);
    // Per card: the planner, one list per seat, one merge (12 x (4 + 6 + 7 + 9)).
    expect(calls).toHaveLength(12 * (OPENINGS_START_PLANS.reduce((sum, plan) => sum + OPENINGS_START_LIST_WRITERS[plan] + 2, 0)));
    for (const plan of OPENINGS_START_PLANS) {
      expect(calls.filter((call) => call.plan === plan && call.step === "START_LIST")).toHaveLength(12 * OPENINGS_START_LIST_WRITERS[plan]);
      expect(calls.filter((call) => call.plan === plan && call.callSiteKey === START_CALL_SITES.merge && call.model === HAIKU)).toHaveLength(12);
    }
    // Each gate event is counted once, by the call that sent it, even when two seats of one model ("#2") run at the same time
    // (they do here: on Max, Haiku's two lists are in flight together).
    const maxHaikuLists = calls.filter((call) => call.plan === "MAX" && call.step === "START_LIST" && call.model === HAIKU && call.questionId === "ro-euro");
    expect(maxHaikuLists).toHaveLength(2);
    expect(maxHaikuLists[0]!.startedAt <= maxHaikuLists[1]!.finishedAt && maxHaikuLists[1]!.startedAt <= maxHaikuLists[0]!.finishedAt).toBe(true);
    const wireNano = lines.filter((line) => line.kind === "wire").map((line) => line.event as PracticeWireEvent)
      .reduce((sum, event) => sum + BigInt(practiceWireUsage(event.model, [event]).costNanoUsd ?? "0"), 0n);
    expect(calls.reduce((sum, call) => sum + BigInt(call.costNanoUsd ?? "0"), 0n)).toBe(wireNano);
    expect(wireNano).toBeGreaterThan(0n);

    const report = JSON.parse(readFileSync(join(out, "report.json"), "utf8")) as Record<string, any>;
    const startStep = report.startStep as Record<string, any>;
    expect(Object.keys(startStep.summary).sort()).toEqual(["FREE", "MAX", "PLUS", "PRO", "seatP50Ms"]);
    for (const plan of OPENINGS_START_PLANS) {
      const one = startStep.summary[plan] as Record<string, number>;
      expect(one.p50Ms).toBeLessThanOrEqual(one.p90Ms!);
      expect(one.p90Ms).toBeLessThanOrEqual(one.maxMs!);
      expect(one.listsInP50).toBe(OPENINGS_START_LIST_WRITERS[plan]);
      expect(startStep.cardsByPlan[plan]).toBe(12);
      expect(startStep.costUsdByPlan[plan]).toMatch(/^\d+\.\d+$/u);
    }
    expect(Object.keys(startStep.summary.seatP50Ms).sort()).toEqual([...OPENINGS_DRY_MODELS].sort());
    expect([...startStep.seatOrder].sort()).toEqual([...OPENINGS_DRY_MODELS].sort());
    // Review (Task 91 Step 4, decision record "only one or two companies' lists may be in"): the companies whose lists were in by the
    // cut, a company's "#2" list counted once. Every list is in here, so Max's seven lists come from its five companies.
    const makerOf = (model: string): string => targets.find((target) => target.model === model)!.maker;
    const companiesOf = (plan: OpeningsStartCardLine["plan"]): string[] =>
      [...new Set(cards.find((card) => card.plan === plan)!.seatMs.map((seat) => makerOf(seat.model.replace(/#2$/u, ""))))].sort();
    for (const plan of OPENINGS_START_PLANS) {
      expect(startStep.companiesInByPlan[plan]).toEqual({ p50: companiesOf(plan).length,
        cards: Object.fromEntries(companiesOf(plan).map((maker) => [maker, 12])) });
    }
    expect(startStep.companiesInByPlan.MAX.p50).toBe(5);
    // The cost is in the --out folder only: no progress line names it.
    expect(logged.filter((line) => /cost|usd|nano|\$/iu.test(line))).toEqual([]);
  }, 60_000);

  it("STREAM: the merge starts at the cut, a list after it is late and gets the late merge, and the card is timed at the first merge's end", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const dry = openingsDryPorts();
    const held: (() => void)[] = [];
    // DeepSeek writes a list on every plan (Free's line-up holds it); its list is held until the test lets it go.
    const holding = (port: PreviewBudgetPort): PreviewBudgetPort => Object.freeze({
      execute: async (input: Parameters<PreviewBudgetPort["execute"]>[0], signal?: AbortSignal) => {
        const { model, packet } = openingsDryPacket(input.requestBody);
        if (model === DEEPSEEK && readPromptFrame(packet).contractId === START_LIST_CONTRACT_ID) {
          await new Promise<void>((resolve) => { held.push(resolve); });
        }
        return port.execute(input, signal);
      }
    });
    const ports = { deepinfra: observer.wrap("deepinfra", holding(dry.ports.deepinfra)), anthropic: observer.wrap("anthropic", dry.ports.anthropic) };
    const clock = fakeClock();
    const calls: OpeningsCall[] = [];
    const told: OpeningsStartCardLine[] = [];
    const running = runStartStepArm({ config, targets, ports, observer, questions: openingsQuestionsFromFlag("en-nuclear"), arms: ["S"],
      bound: policy.bounds.JUDGE, contractHashes: hashes, sleep: dry.sleep, busyWaitMs: 0, startClock: clock,
      onCall: (call) => { calls.push(call); }, onStartCard: (card) => { told.push(card); } });
    const LATE_BY_MS = 5_000;
    for (const plan of OPENINGS_START_PLANS) {
      const mine = (pick: (call: OpeningsCall) => boolean) => calls.filter((call) => call.plan === plan && pick(call));
      await vi.waitFor(() => {
        expect(held).toHaveLength(1);
        expect(mine((call) => call.step === "START_LIST")).toHaveLength(OPENINGS_START_LIST_WRITERS[plan] - 1);
      });
      // Nothing is merged before the cut, though every other list is in.
      expect(mine((call) => call.step === "START_MERGE")).toHaveLength(0);
      clock.advance(START_STEP_TIMING.cutAtMs);
      await vi.waitFor(() => { expect(mine((call) => call.callSiteKey === START_CALL_SITES.merge)).toHaveLength(1); });
      clock.advance(LATE_BY_MS);
      held.shift()!();
      await vi.waitFor(() => { expect(mine((call) => call.callSiteKey === START_CALL_SITES.mergeLate)).toHaveLength(1); });
    }
    const cards = await running;
    expect(told).toEqual(cards);
    expect(cards.map((card) => [card.plan, card.cardMs, card.listsIn, card.late]))
      .toEqual(OPENINGS_START_PLANS.map((plan) => [plan, START_STEP_TIMING.cutAtMs, OPENINGS_START_LIST_WRITERS[plan] - 1, 1]));
    for (const card of cards) {
      expect(card.seatMs.filter((seat) => seat.model === DEEPSEEK)).toEqual([{ model: DEEPSEEK, ms: START_STEP_TIMING.cutAtMs + LATE_BY_MS }]);
      expect(card.seatMs.filter((seat) => seat.model !== DEEPSEEK).every((seat) => seat.ms === 0)).toBe(true);
    }
    expect([...new Set(calls.map((call) => call.callSiteKey.replace(/:\d+$/u, "")))].sort())
      .toEqual(["START:angles", "START:list", "START:merge", "START:merge-late"]);
  }, 30_000);

  it("a model refused as busy sits out the later cards (the next company takes its seat, as startSeatsFor does); a failed list has no time", async () => {
    // Review: Qwen's lists are refused as busy (unbilled), so after Plus it sits out; MiMo's lists never come back readable.
    const observer = new PracticeGateObserver({ now: () => 0 });
    const dry = openingsDryPorts();
    const scripted = (port: PreviewBudgetPort): PreviewBudgetPort => Object.freeze({
      execute: async (input: Parameters<PreviewBudgetPort["execute"]>[0], signal?: AbortSignal) => {
        const { model, packet } = openingsDryPacket(input.requestBody);
        if (readPromptFrame(packet).contractId === START_LIST_CONTRACT_ID) {
          if (model === QWEN) throw new PreviewVendorRefusedUnbilled();
          if (model === MIMO) return { status: 200, body: openingsDryVendorReply("deepinfra", model, "no list here", 0) };
        }
        return port.execute(input, signal);
      }
    });
    const ports = { deepinfra: observer.wrap("deepinfra", scripted(dry.ports.deepinfra)), anthropic: observer.wrap("anthropic", dry.ports.anthropic) };
    const cards = await runStartStepArm({ config, targets, ports, observer, questions: openingsQuestionsFromFlag("en-nuclear"), arms: ["S"],
      bound: policy.bounds.JUDGE, contractHashes: hashes, sleep: dry.sleep, busyWaitMs: 0 });
    const shape = (card: OpeningsStartCardLine) => [card.plan, card.listsIn, card.seatMs.map((seat) => [seat.model, seat.ms === null ? null : "timed"])];
    expect(cards.map(shape)).toEqual([
      ["FREE", 2, [[GLM, "timed"], [DEEPSEEK, "timed"]]],
      ["PLUS", 3, [[HAIKU, "timed"], [GLM, "timed"], [QWEN, null], [DEEPSEEK, "timed"]]],
      ["PRO", 4, [[HAIKU, "timed"], [GLM, "timed"], [DEEPSEEK, "timed"], [MIMO, null], [`${HAIKU}#2`, "timed"]]],
      ["MAX", 6, [[HAIKU, "timed"], [GLM, "timed"], [DEEPSEEK, "timed"], [MIMO, null], [`${HAIKU}#2`, "timed"], [`${GLM}#2`, "timed"],
        [`${DEEPSEEK}#2`, "timed"]]]
    ]);
  }, 30_000);
});

describe("practice openings, arm S: the summary, the seat order and the verdict (made-up lines)", () => {
  const card = (plan: OpeningsStartCardLine["plan"], questionId: string, cardMs: number, listsIn: number,
    seats: readonly (readonly [string, number | null])[]): OpeningsStartCardLine => Object.freeze({ kind: "START_CARD", plan, questionId, cardMs,
    listsIn, late: 0, seatMs: seats.map(([model, ms]) => Object.freeze({ model, ms })) });
  const LINES: readonly OpeningsStartCardLine[] = [
    card("PLUS", "ro-euro", 40_000, 2, [[HAIKU, 20_000], [GLM, 26_000], [QWEN, 50_000], [DEEPSEEK, null]]),
    card("PLUS", "en-nuclear", 50_000, 3, [[HAIKU, 22_000], [GLM, 24_000], [QWEN, 52_000], [DEEPSEEK, 30_000]]),
    card("PLUS", "en-rent-caps", 60_000, 4, [[HAIKU, 24_000], [GLM, 28_000], [QWEN, 54_000], [DEEPSEEK, 32_000]]),
    // No list by the cut: no card was shown, so it is left out of the card times (and the verdict names it).
    card("PLUS", "ro-hpv", 150_000, 0, [[HAIKU, null], [GLM, null], [QWEN, null], [DEEPSEEK, null]]),
    card("MAX", "ro-euro", 70_000, 5, [[HAIKU, 10_000], [GLM, 30_000], [QWEN, 40_000], [DEEPSEEK, 34_000], [MIMO, 90_000],
      [`${HAIKU}#2`, 18_000], [`${GLM}#2`, 32_000]])
  ];

  it("per plan: p50, p90 and max of the shown cards, the slowest seat's model and the lists in by the cut; each model's p50 list time", () => {
    const summary = startStepSummary(LINES);
    expect(summary.PLUS).toEqual({ p50Ms: 50_000, p90Ms: 60_000, maxMs: 60_000, slowestSeatModel: QWEN, listsInP50: 3 });
    expect(summary.MAX).toEqual({ p50Ms: 70_000, p90Ms: 70_000, maxMs: 70_000, slowestSeatModel: MIMO, listsInP50: 5 });
    expect(summary.FREE).toEqual({ p50Ms: null, p90Ms: null, maxMs: null, slowestSeatModel: null, listsInP50: null });
    expect(summary.PRO).toEqual(summary.FREE);
    // "#2" seats fold into their model: Haiku's times are 10, 18, 20, 22, 24 s (p50 20 s); GLM's 24, 26, 28, 30, 32 s (p50 28 s).
    expect(summary.seatP50Ms).toEqual({ [HAIKU]: 20_000, [GLM]: 28_000, [QWEN]: 50_000, [DEEPSEEK]: 32_000, [MIMO]: 90_000 });
  });

  it("the seat order the times suggest: fastest p50 first, ties in today's START_SEAT_SPEED_ORDER, a model without a time last", () => {
    expect(START_SEAT_SPEED_ORDER).toEqual([HAIKU, GLM, QWEN, DEEPSEEK, MIMO]);
    const made = (seatP50Ms: Readonly<Record<string, number>>) => ({ ...startStepSummary([]), seatP50Ms });
    // GLM's p50 below Haiku's puts GLM first.
    expect(startSeatOrderOf(made({ [HAIKU]: 20_000, [GLM]: 12_000, [QWEN]: 25_000, [DEEPSEEK]: 30_000, [MIMO]: 40_000 })))
      .toEqual([GLM, HAIKU, QWEN, DEEPSEEK, MIMO]);
    // A tie keeps today's order (DeepSeek before MiMo, though MiMo sorts first by name); Qwen has no time, so it goes last.
    expect(startSeatOrderOf(made({ [MIMO]: 30_000, [DEEPSEEK]: 30_000, [HAIKU]: 20_000, [GLM]: 25_000 })))
      .toEqual([HAIKU, GLM, DEEPSEEK, MIMO, QWEN]);
  });

  it("a card with no list by the cut makes the run NOT_PROVEN (START_NO_CARD), and report.json carries the start step's block", () => {
    expect(practiceVerdict({ harnessError: null, completed: true, servedAnswer: null, storyOutcome: null, formatFailures: 0, failedCalls: 0,
      gateHalted: false, gateStopped: false, notExercisedModels: [], unbilledRefusals: 0, p90ByModel: {}, startNoCard: ["PLUS:ro-hpv"] }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["START_NO_CARD:PLUS:ro-hpv"] });
    const T0 = "2026-11-04T10:00:00.000Z";
    const log: OpeningsLogLine[] = [
      { kind: "start", schema: OPENINGS_SCHEMA, mode: "openings", dry: true, startedAt: T0, models: [], questions: ["ro-euro", "en-nuclear", "en-rent-caps", "ro-hpv"],
        questionDigests: [], arms: ["S"], busyWaitMs: 0, unsentStreakAtStart: { deepinfra: 0, anthropic: 0 }, remainingBefore: { deepinfra: null, anthropic: null } },
      ...LINES,
      { kind: "end", finishedAt: "2026-11-04T10:10:00.000Z", interrupted: false, remainingAfter: { deepinfra: null, anthropic: null } }
    ];
    const report = openingsReportFromLog(log);
    expect(report.verdict).toBe("NOT_PROVEN");
    expect(report.reasons).toContain("START_NO_CARD:PLUS:ro-hpv");
    expect(report.startStep).toMatchObject({ summary: startStepSummary(LINES), seatOrder: startSeatOrderOf(startStepSummary(LINES)),
      cardsByPlan: { FREE: 0, PLUS: 4, PRO: 0, MAX: 1 } });
    // A run without arm S has no start-step block (today's report, key for key).
    expect(openingsReportFromLog([log[0]!, log.at(-1)!])).not.toHaveProperty("startStep");
    // Review (Task 91 Step 4): the companies whose lists were in by the cut, named. Every list is asked at the same moment and taken in as it
    // arrives, so the `listsIn` fastest seats with a time are the ones in by the cut; a "#2" list is its company's. Max's five lists in come
    // from three companies (Haiku and Haiku#2, GLM and GLM#2, DeepSeek); a card with no list by the cut counts for none. No call line names
    // a maker here, so each comes from the reviewed preview rows.
    expect(report.startStep).toMatchObject({ companiesInByPlan: {
      FREE: { p50: null, cards: {} },
      PLUS: { p50: 3, cards: { Alibaba: 1, Anthropic: 3, DeepSeek: 2, "Z.AI": 3 } },
      PRO: { p50: null, cards: {} },
      MAX: { p50: 3, cards: { Anthropic: 1, DeepSeek: 1, "Z.AI": 1 } }
    } });
  });

  it("the README's arm S commands are real commands of this tool", () => {
    const readme = readFileSync(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
    const commands = readme.split("\n").filter((line) => line.includes("tools/preview-practice/practice.ts openings ") && line.includes("--arms S"));
    expect(commands.length).toBeGreaterThanOrEqual(2);
    for (const line of commands) {
      const args = parsePracticeArgs(line.slice(line.indexOf("practice.ts ") + "practice.ts ".length).trim().split(/\s+/u)
        .map((word) => word.replace(/^"(.*)"$/u, "$1")));
      expect(args.mode).toBe("openings");
      expect(openingsArmsFromFlag(args.flags.get("--arms"))).toEqual(["S"]);
    }
    expect(commands.some((line) => line.includes(" --dry "))).toBe(true);
    expect(commands.some((line) => line.includes("--gate-status-deepinfra") && line.includes("--gate-status-anthropic"))).toBe(true);
  });
});
