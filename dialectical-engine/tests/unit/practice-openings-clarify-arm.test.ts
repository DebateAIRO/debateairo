// tests/unit/practice-openings-clarify-arm.test.ts
// V4 start step, Task 91c (owner card "As picked, on measured time"; wait-f8's rule: never a guessed number): the openings practice's arm Q
// times the clarifying call of step 1's Next. One call per fixed question goes to the Anthropic gate exactly as apps/api/src/ask-clarify.ts
// sends it (its own step: the sealed contract, ASK_CLARIFY_MODEL_SETTINGS, its bound and its one retry). One CLARIFY_TIME line per question
// holds the question's id, the time, AI or NONE and NONE's code: never a word of the question or the reply, never a cost. clarifySummary
// gives p50, p90, max and the NONE count; clarifyWaitProposal the three values the owner applies together (the usual top, the server's bound,
// the page's wait). The arm is Q, not C: C is the angle map (Task 91c ruling). --dry writes made-up times and calls nothing; the other cases
// hand the gates a script, so nothing here opens a socket or spends anything. Every figure here is made up.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASK_CLARIFY_CONTRACT_ID, ASK_CLARIFY_INSTRUCTION } from "@debateai/judgement";
import { mapPromptContractHash } from "@debateai/map";
import {
  createPreviewBudgetRpcPort,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  PreviewVendorRefusedUnbilled,
  previewTargetJsonRow,
  readPromptFrame,
  type PreviewBudgetPort,
  type PreviewGateRemaining
} from "@debateai/providers";
import { ASK_CLARIFY_MODEL_SETTINGS } from "../../apps/api/src/ask-clarify.js";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { practiceRemainingPorts } from "../../tools/preview-practice/practice-ask-composition.js";
import { practiceRunnerPolicy, practiceWireUsage } from "../../tools/preview-practice/practice-formats.js";
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
  type OpeningsClarifyLine,
  type OpeningsLogLine
} from "../../tools/preview-practice/practice-openings-log.js";
import {
  OPENINGS_ARMS,
  OPENINGS_QUESTIONS,
  OPENINGS_START_ARMS,
  openingsArmsFromFlag,
  openingsQuestionsFromFlag
} from "../../tools/preview-practice/practice-openings-questions.js";
import { OPENINGS_DRY_CLARIFY_MS, openingsMaxInFlightDefault, runClarifyArm } from "../../tools/preview-practice/practice-openings.js";
import { practiceSocketsFromEnvironment } from "../../tools/preview-practice/practice-settings.js";
import { clarifySummary, clarifyWaitProposal, practiceVerdict } from "../../tools/preview-practice/practice-verdict.js";
import { parsePracticeArgs, runPractice } from "../../tools/preview-practice/practice.js";

vi.mock("@debateai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@debateai/providers")>();
  return { ...real, createPreviewBudgetRpcPort: vi.fn(real.createPreviewBudgetRpcPort) };
});
vi.mock("../../tools/preview-practice/practice-ask-composition.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../tools/preview-practice/practice-ask-composition.js")>();
  return { ...real, practiceRemainingPorts: vi.fn(real.practiceRemainingPorts) };
});
vi.mock("../../tools/preview-practice/practice-settings.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../tools/preview-practice/practice-settings.js")>();
  return { ...real, practiceSocketsFromEnvironment: vi.fn(real.practiceSocketsFromEnvironment) };
});

const HAIKU = "claude-haiku-5-5";
const config = openingsDryConfig();
const targets = openingsDryTargets(config);
const policy = practiceRunnerPolicy(config);
const hashes = { judge: PRACTICE_CONTRACT_HASHES.judge, map: mapPromptContractHash(), engine: engineContractHash() };
const quiet = { log: () => undefined, sleep: async () => undefined, wait: async () => undefined };

const folders: string[] = [];
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => {
  vi.restoreAllMocks();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const freshFolder = (): string => { const folder = mkdtempSync(join(tmpdir(), "pp-clarify-arm-")); folders.push(folder); return folder; };
const jsonl = (out: string): Record<string, any>[] => readFileSync(join(out, "openings.jsonl"), "utf8").trim().split("\n")
  .map((line) => JSON.parse(line) as Record<string, any>);
const report = (out: string): Record<string, any> => JSON.parse(readFileSync(join(out, "report.json"), "utf8")) as Record<string, any>;
/** The five fields a CLARIFY_TIME line holds, and nothing else. */
const FIVE_FIELDS = ["code", "kind", "ms", "questionId", "source"];

/** Made-up replies of the clarifying call, in English: none of their words may reach a line. */
const PURPOSE = { text: "Whatever brings you to ask this today?", answers: ["Choosing a school", "Writing an essay"] };
const WHERE = { text: "Which harbour district are you thinking of?", answers: ["The north quay", "The old docks"] };
const GOOD_REPLY = JSON.stringify({ questions: [WHERE], purpose: PURPOSE });
const REPLY_WORDS = [PURPOSE.text, WHERE.text, ...PURPOSE.answers, ...WHERE.answers];

/**
 * The gates handed a script: the clarifying contract answered as `answer` says (per question line and try), every other contract by the dry
 * script. `asked` keeps what each clarifying call was sent with (the model, the contract, the token room), never its words.
 */
function clarifyGates(answer: (question: string, tryNo: number) => string | Error | Promise<string>) {
  const dry = openingsDryPorts();
  const asked: { model: string; contractId: string; maxTokens: number; question: string }[] = [];
  const tries = new Map<string, number>();
  const firstTurns: string[] = [];
  const anthropic: PreviewBudgetPort = Object.freeze({
    execute: async (input: Parameters<PreviewBudgetPort["execute"]>[0], signal?: AbortSignal) => {
      const { model, packet } = openingsDryPacket(input.requestBody);
      const system = packet.messages.find((message) => message.role === "system")?.content ?? "";
      if (!system.includes(ASK_CLARIFY_INSTRUCTION)) return dry.ports.anthropic.execute(input, signal);
      // The step's retry adds its rejection to the same user turn, after the material: the frame is read from the first try's turn.
      const turn = packet.messages.find((message) => message.role === "user")?.content ?? "";
      const first = firstTurns.find((known) => turn.startsWith(`${known}\n\n`)) ?? turn;
      if (first === turn) firstTurns.push(turn);
      const frame = readPromptFrame(Object.freeze({ messages: Object.freeze([{ role: "system" as const, content: system },
        { role: "user" as const, content: first }]) }));
      const question = frame.fields.find((field) => field.name === "question")?.content ?? "";
      const tryNo = (tries.get(question) ?? 0) + 1;
      tries.set(question, tryNo);
      asked.push({ model, contractId: frame.contractId, maxTokens: (JSON.parse(input.requestBody) as { max_tokens: number }).max_tokens, question });
      const reply = await answer(question, tryNo);
      if (reply instanceof Error) throw reply;
      return { status: 200, body: openingsDryVendorReply("anthropic", model, reply, asked.length) };
    }
  });
  return { ports: Object.freeze({ deepinfra: dry.ports.deepinfra, anthropic }), dry, asked };
}

describe("practice openings, arm Q: the clarifying call timed per question (Task 91c)", () => {
  it("arm Q runs only when named; C stays the angle map; anything else is still refused", () => {
    expect(OPENINGS_START_ARMS).toEqual(["S", "Q"]);
    // Ruling: the brief's letter C is the angle map's (OPENINGS_ARMS), which runs by default and asks all five AIs.
    expect(OPENINGS_ARMS).toContain("C");
    expect(openingsArmsFromFlag("C")).toEqual(["C"]);
    expect(openingsArmsFromFlag(undefined)).not.toContain("Q");
    expect(openingsArmsFromFlag("Q")).toEqual(["Q"]);
    expect(openingsArmsFromFlag("Q,S")).toEqual(["S", "Q"]);
    for (const bad of ["q", "Q,Q", "Q2"]) {
      expect(() => openingsArmsFromFlag(bad)).toThrow("--arms (only T, A, B, C, C2, C2N, S, Q, comma-separated, each once)");
    }
    // Arm Q asks one call at a time: Max's eight calls at once are arm S's only.
    expect(openingsMaxInFlightDefault(["Q"])).toBe(openingsMaxInFlightDefault(OPENINGS_ARMS));
    expect(openingsMaxInFlightDefault(["S", "Q"])).toBe(openingsMaxInFlightDefault(["S"]));
    expect(OPENINGS_DRY_CLARIFY_MS).toHaveLength(OPENINGS_QUESTIONS.length);
  });

  it("--dry --arms Q over the 12 questions: 12 CLARIFY_TIME lines of exactly five fields, made-up times, nothing called, no words", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const connectSpy = vi.spyOn(Socket.prototype, "connect");
    const out = join(freshFolder(), "out");
    const logged: string[] = [];
    const result = await runPractice(["openings", "--dry", "--arms", "Q", "--out", out], {},
      { ...quiet, log: (line) => { logged.push(line); } });
    expect([result.report.verdict, result.exitCode]).toEqual(["PASS", 0]);
    const lines = jsonl(out);
    expect(lines[0]).toMatchObject({ kind: "start", arms: ["Q"], dry: true, questions: OPENINGS_QUESTIONS.map((question) => question.id) });
    const times = lines.filter((line) => line.kind === "CLARIFY_TIME") as unknown as OpeningsClarifyLine[];
    expect(times).toHaveLength(12);
    expect(times.map((line) => line.questionId)).toEqual(OPENINGS_QUESTIONS.map((question) => question.id));
    for (const [at, line] of times.entries()) {
      expect(Object.keys(line).sort()).toEqual(FIVE_FIELDS);
      // Made up, by the question's fixed place: --dry calls nothing.
      expect(line).toEqual({ kind: "CLARIFY_TIME", questionId: OPENINGS_QUESTIONS[at]!.id, ms: OPENINGS_DRY_CLARIFY_MS[at], source: "AI", code: null });
    }
    // Nothing called: no gate line, no call line, no port reached, no socket.
    expect(lines.filter((line) => line.kind === "wire" || line.kind === "call")).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();
    expect(vi.mocked(createPreviewBudgetRpcPort)).not.toHaveBeenCalled();

    const clarify = report(out).clarify as Record<string, any>;
    expect(clarify.summary.p50Ms).toBeLessThanOrEqual(clarify.summary.p90Ms);
    expect(clarify.summary.p90Ms).toBeLessThanOrEqual(clarify.summary.maxMs);
    expect(clarify).toEqual({ readings: 12, summary: clarifySummary(times), proposal: clarifyWaitProposal(clarifySummary(times)), noneCodes: {},
      costUsd: "0.000000000" });
    // A run of arm Q alone asks none of the other arms' AIs, so none of them is "not exercised".
    expect(result.report.reasons).toEqual([]);
    // No line, report or progress line holds a question's words, and no progress line names a cost.
    const written = [readFileSync(join(out, "openings.jsonl"), "utf8"), readFileSync(join(out, "report.json"), "utf8"),
      readFileSync(join(out, "report.md"), "utf8"), logged.join("\n")].join("\n");
    for (const question of OPENINGS_QUESTIONS) expect(written).not.toContain(question.questionLine);
    expect(logged.filter((line) => /cost|usd|nano|\$/iu.test(line))).toEqual([]);
  });

  it("one clarifying call per question on the Anthropic gate, as the API's step sends it: Haiku, the sealed contract, its token room", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const wire: PracticeWireEvent[] = [];
    observer.listen({ event: (event) => { wire.push(event); } });
    const unreadable = "en-nuclear";
    const unreadableLine = OPENINGS_QUESTIONS.find((question) => question.id === unreadable)!.questionLine;
    const gates = clarifyGates((question) => (question === unreadableLine ? "no questions here" : GOOD_REPLY));
    const told: OpeningsClarifyLine[] = [];
    const progress: string[] = [];
    const lines = await runClarifyArm({ config, targets, observer, questions: openingsQuestionsFromFlag("ro-euro,en-nuclear,en-rent-caps"),
      ports: { deepinfra: observer.wrap("deepinfra", gates.ports.deepinfra), anthropic: observer.wrap("anthropic", gates.ports.anthropic) },
      arms: ["T"], bound: policy.bounds.JUDGE, contractHashes: hashes, sleep: gates.dry.sleep, busyWaitMs: 0,
      onClarify: (line) => { told.push(line); }, progress: (line) => { progress.push(line); } });
    expect(told).toEqual(lines);
    expect(lines.map((line) => [line.questionId, line.source, line.code])).toEqual([
      ["ro-euro", "AI", null],
      // An unreadable reply is asked again once (the step's slip order), then the page gets no questions.
      ["en-nuclear", "NONE", "UNREADABLE"],
      ["en-rent-caps", "AI", null]
    ]);
    for (const line of lines) {
      expect(Object.keys(line).sort()).toEqual(FIVE_FIELDS);
      expect(Number.isInteger(line.ms) && line.ms >= 0).toBe(true);
    }
    // Only the clarifying calls were sent (runClarifyArm runs arm Q alone, whatever `arms` says): each on Haiku, the sealed contract, the
    // step's token room; the unreadable one twice. No DeepInfra call.
    expect(gates.asked.map((call) => [call.model, call.contractId, call.maxTokens]))
      .toEqual(Array.from({ length: 4 }, () => [HAIKU, ASK_CLARIFY_CONTRACT_ID, ASK_CLARIFY_MODEL_SETTINGS.maxOutputTokens]));
    expect(ASK_CLARIFY_MODEL_SETTINGS.model).toBe(HAIKU);
    expect(gates.asked.filter((call) => call.question === unreadableLine)).toHaveLength(2);
    expect(wire.map((event) => [event.gate, event.model, event.outcome])).toEqual(Array.from({ length: 4 }, () => ["anthropic", HAIKU, "VENDOR_OK"]));
    expect(observer.stopped("anthropic")).toBeNull();
    expect(gates.dry.script.requests).toBe(0);
    // Codes and times only: no question or reply words in a line or a progress line.
    const written = JSON.stringify(lines) + progress.join("\n");
    for (const question of OPENINGS_QUESTIONS) expect(written).not.toContain(question.questionLine);
    for (const words of REPLY_WORDS) expect(written).not.toContain(words);
  });

  it("a gate that refuses the call: NONE with the step's code; a stop during a reading leaves it untimed and starts no other", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    let stop = false;
    const gates = clarifyGates((_question, tryNo) => {
      if (tryNo === 1 && gates.asked.length === 2) stop = true;
      return gates.asked.length === 1 ? new PreviewVendorRefusedUnbilled() : GOOD_REPLY;
    });
    const lines = await runClarifyArm({ config, targets, observer, questions: openingsQuestionsFromFlag("ro-euro,en-nuclear,en-rent-caps"),
      ports: { deepinfra: observer.wrap("deepinfra", gates.ports.deepinfra), anthropic: observer.wrap("anthropic", gates.ports.anthropic) },
      arms: ["Q"], bound: policy.bounds.JUDGE, contractHashes: hashes, sleep: gates.dry.sleep, busyWaitMs: 0, shouldStop: () => stop });
    // The first reading's call was refused: the step answers NONE (TRANSPORT) at once, as the page would see it. The second reading was cut
    // short by the stop, so it is not timed, and the third is never asked.
    expect(lines.map((line) => [line.questionId, line.source, line.code])).toEqual([["ro-euro", "NONE", "TRANSPORT"]]);
    expect(gates.asked).toHaveLength(2);
  });

  it("a reading cut at the step's bound is NONE DEADLINE at the bound; its call, let go as on the site, ends before the next reading", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      const observer = new PracticeGateObserver({ now: () => 0 });
      const order: string[] = [];
      observer.listen({ event: (event) => { order.push(`wire:${event.outcome}`); } });
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => { release = resolve; });
      const gates = clarifyGates(async () => {
        if (gates.asked.length === 1) await held;
        return GOOD_REPLY;
      });
      const running = runClarifyArm({ config, targets, observer, questions: openingsQuestionsFromFlag("ro-euro,en-nuclear"),
        ports: { deepinfra: observer.wrap("deepinfra", gates.ports.deepinfra), anthropic: observer.wrap("anthropic", gates.ports.anthropic) },
        arms: ["Q"], bound: policy.bounds.JUDGE, contractHashes: hashes, sleep: gates.dry.sleep, busyWaitMs: 0,
        onClarify: (line) => { order.push(`line:${line.questionId}:${line.source}:${String(line.code)}:${String(line.ms)}`); } });
      await vi.advanceTimersByTimeAsync(ASK_CLARIFY_MODEL_SETTINGS.timeoutMs);
      // The page has its answer (none) at the bound, but the call is still with the gate: no line yet, and no second reading.
      expect(order).toEqual([]);
      expect(gates.asked).toHaveLength(1);
      release();
      const lines = await running;
      // The late call's gate line (its money) is in before the reading's line; the next reading starts only then.
      expect(order).toEqual(["wire:VENDOR_OK", `line:ro-euro:NONE:DEADLINE:${String(ASK_CLARIFY_MODEL_SETTINGS.timeoutMs)}`, "wire:VENDOR_OK",
        "line:en-nuclear:AI:null:0"]);
      expect(lines.map((line) => [line.questionId, line.source, line.code])).toEqual([["ro-euro", "NONE", "DEADLINE"], ["en-nuclear", "AI", null]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a real run needs both --gate-status-* files, refused before any gate is built or any call is sent", async () => {
    const folder = freshFolder();
    const five = OPENINGS_DRY_MODELS;
    const preview = { deployment: "v3-preview", free_model_ids: five.slice(0, 2), premium_model_ids: five, requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
      scope_id: "preview-practice-clarify-test" };
    writeFileSync(join(folder, "settings.env"), [
      `PREVIEW_PROVIDER_TEST_CONFIG_JSON=${JSON.stringify(preview)}`,
      `PROVIDER_DISCOVERY_TARGETS_JSON=${JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow))}`,
      "REGISTER_VERSION=5", "DEBATEAI_DEPLOYMENT_MODE=local", "NODE_ENV=production", "CLAIM_MS=4000000", "CLAIM_MARGIN_MS=60000",
      "MAX_RECOMPOSE=1", "JUDGEMENT_NUMBER_KIND=base-probability", "JUDGEMENT_PRODUCER=judgement:preview-practice-test",
      "PROPAGATION_NUMBER_KIND=propagated-probability", "PROPAGATION_PRODUCER=propagation:preview-practice-test",
      "PROVIDER_REF=preview:fixture-a", "STRANGER_SAMPLE_RATE=0", "BATTERY_VERSION=s00",
      "SETTLEMENT_WATCH_HANDLE=settlement-watch:preview-practice-test", ""].join("\n"));
    writeFileSync(join(folder, "status.json"), JSON.stringify({ state: "active", unsent_streak: 0, halts: 0 }));
    const env = { PRACTICE_ACK: "spends-real-money", PRACTICE_DEEPINFRA_SOCKET: "/x/deepinfra.sock", PRACTICE_ANTHROPIC_SOCKET: "/x/anthropic.sock" };
    const real = await vi.importActual<typeof import("../../tools/preview-practice/practice-settings.js")>("../../tools/preview-practice/practice-settings.js");
    vi.mocked(practiceSocketsFromEnvironment).mockImplementation((given) => real.practiceSocketsFromEnvironment(given, () => true));
    const open = (enabledModels: readonly string[]): PreviewGateRemaining => Object.freeze({ state: "active", windowOpen: true,
      remainingNanoUsd: 5_000_000_000n, remainingCalls: 1_000, maxConcurrentCalls: 4, largestReservationNanoUsd: 50_000_000n, enabledModels });
    vi.mocked(practiceRemainingPorts).mockImplementation(() => Object.freeze({ deepinfra: async () => open(five), anthropic: async () => open(five) }));
    const gates = clarifyGates(() => GOOD_REPLY);
    vi.mocked(createPreviewBudgetRpcPort).mockImplementation((_settings, socket) => (socket === env.PRACTICE_ANTHROPIC_SOCKET ? gates.ports.anthropic : gates.ports.deepinfra));
    const settings = ["--settings", join(folder, "settings.env")];
    const deepinfraStatus = ["--gate-status-deepinfra", join(folder, "status.json")];
    const anthropicStatus = ["--gate-status-anthropic", join(folder, "status.json")];

    for (const [given, missing] of [[[...deepinfraStatus], "--gate-status-anthropic"], [[...anthropicStatus], "--gate-status-deepinfra"],
      [[], "--gate-status-deepinfra"]] as const) {
      const out = join(freshFolder(), "out");
      const logged: string[] = [];
      const refused = await runPractice(["openings", ...settings, ...given, "--arms", "Q", "--out", out], env,
        { ...quiet, log: (line) => { logged.push(line); } });
      expect(refused.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_FLAG_REQUIRED"]);
      expect(logged).toContain(`practice could not run: PRACTICE_FLAG_REQUIRED: ${missing}`);
      expect(existsSync(join(out, "openings.jsonl"))).toBe(false);
    }
    expect(vi.mocked(createPreviewBudgetRpcPort)).not.toHaveBeenCalled();
    expect(gates.asked).toEqual([]);

    // With both: the clarifying calls go through the gates' ports and the openings log keeps their CLARIFY_TIME lines.
    const out = join(freshFolder(), "out");
    const ran = await runPractice(["openings", ...settings, ...deepinfraStatus, ...anthropicStatus, "--questions", "ro-hpv,en-rent-caps",
      "--arms", "Q", "--out", out], env, quiet);
    expect([ran.report.verdict, ran.exitCode]).toEqual(["PASS", 0]);
    expect(gates.asked.map((call) => call.model)).toEqual([HAIKU, HAIKU]);
    const lines = jsonl(out);
    expect(lines.filter((line) => line.kind === "CLARIFY_TIME").map((line) => [line.questionId, line.source])).toEqual([["ro-hpv", "AI"], ["en-rent-caps", "AI"]]);
    // Arm Q alone: every gate line is its own, so report.json gives its cost (the gate's own priced usage); it is in the --out folder only.
    const wireNano = lines.filter((line) => line.kind === "wire").map((line) => line.event as PracticeWireEvent)
      .reduce((sum, event) => sum + BigInt(practiceWireUsage(event.model, [event]).costNanoUsd ?? "0"), 0n);
    expect(wireNano).toBeGreaterThan(0n);
    expect(report(out).clarify).toMatchObject({ readings: 2, noneCodes: {} });
    expect(BigInt(String(report(out).clarify.costUsd).replace(".", ""))).toBe(wireNano);
    const written = readFileSync(join(out, "openings.jsonl"), "utf8");
    for (const words of [...REPLY_WORDS, ...OPENINGS_QUESTIONS.map((question) => question.questionLine)]) expect(written).not.toContain(words);
  });
});

describe("practice openings, arm Q: the summary, the proposal and the verdict (made-up lines)", () => {
  const time = (questionId: string, ms: number, source: "AI" | "NONE" = "AI", code: string | null = null): OpeningsClarifyLine =>
    Object.freeze({ kind: "CLARIFY_TIME", questionId, ms, source, code });

  it("the summary: p50, p90 and max over every reading (a NONE included: the page waited for it too) and the NONE count", () => {
    const lines = [time("ro-euro", 3_000), time("ro-autobuze", 2_000), time("en-nuclear", 8_004, "NONE", "DEADLINE"), time("en-rent-caps", 4_000),
      time("ro-hpv", 5_000)];
    expect(clarifySummary(lines)).toEqual({ p50Ms: 4_000, p90Ms: 8_004, maxMs: 8_004, none: 1 });
    const summary = clarifySummary(lines);
    expect(summary.p50Ms).toBeLessThanOrEqual(summary.p90Ms);
    expect(summary.p90Ms).toBeLessThanOrEqual(summary.maxMs);
    // No reading, no figure: never a guessed number.
    expect(() => clarifySummary([])).toThrow("PRACTICE_CLARIFY_NO_TIMES");
  });

  it("the proposal: the usual top (p90 up to the next 500 ms), the server's bound (up to the next 5 s) and the page's wait (2 s past it)", () => {
    expect(clarifyWaitProposal({ p90Ms: 4_200, maxMs: 9_800 })).toEqual({ usualTopMs: 4_500, serverBoundMs: 10_000, pageWaitMs: 12_000 });
    expect(clarifyWaitProposal({ p90Ms: 7_600, maxMs: 7_900 })).toEqual({ usualTopMs: 8_000, serverBoundMs: 15_000, pageWaitMs: 17_000 });
    expect(clarifyWaitProposal({ p90Ms: 1_000, maxMs: 2_000 })).toEqual({ usualTopMs: 1_000, serverBoundMs: 10_000, pageWaitMs: 12_000 });
    for (const bad of [{ p90Ms: Number.NaN, maxMs: 1_000 }, { p90Ms: 1_000, maxMs: -1 }]) {
      expect(() => clarifyWaitProposal(bad)).toThrow("PRACTICE_CLARIFY_TIMES_INVALID");
    }
  });

  it("a reading that answered NONE makes the run NOT_PROVEN (CLARIFY_NONE), and report.json carries the clarify block", () => {
    expect(practiceVerdict({ harnessError: null, completed: true, servedAnswer: null, storyOutcome: null, formatFailures: 0, failedCalls: 0,
      gateHalted: false, gateStopped: false, notExercisedModels: [], unbilledRefusals: 0, p90ByModel: {}, clarifyNone: ["en-nuclear:DEADLINE"] }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["CLARIFY_NONE:en-nuclear:DEADLINE"] });
    const T0 = "2026-11-05T10:00:00.000Z";
    const lines = [time("ro-euro", 3_000), time("en-nuclear", 8_004, "NONE", "DEADLINE"), time("en-rent-caps", 4_000)];
    const start = (arms: readonly string[]): OpeningsLogLine => ({ kind: "start", schema: OPENINGS_SCHEMA, mode: "openings", dry: false,
      startedAt: T0, models: [...OPENINGS_DRY_MODELS], questions: ["ro-euro", "en-nuclear", "en-rent-caps"], questionDigests: [],
      arms: arms as never, busyWaitMs: 0, unsentStreakAtStart: { deepinfra: 0, anthropic: 0 }, remainingBefore: { deepinfra: null, anthropic: null } });
    const end: OpeningsLogLine = { kind: "end", finishedAt: "2026-11-05T10:01:00.000Z", interrupted: false, remainingAfter: { deepinfra: null, anthropic: null } };
    const alone = openingsReportFromLog([start(["Q"]), ...lines, end]);
    // Arm Q alone: no other AI was meant to be asked, so the only reason is the NONE reading.
    expect([alone.verdict, alone.reasons]).toEqual(["NOT_PROVEN", ["CLARIFY_NONE:en-nuclear:DEADLINE"]]);
    expect(alone.byArm).toEqual([]);
    expect(alone.clarify).toEqual({ readings: 3, summary: clarifySummary(lines), proposal: clarifyWaitProposal(clarifySummary(lines)),
      noneCodes: { DEADLINE: 1 }, costUsd: "0.000000000" });
    // Beside another arm, its AIs must still answer (here none did), and the clarifying call's money is not told apart from that arm's.
    const beside = openingsReportFromLog([start(["T", "Q"]), ...lines, end]);
    expect(beside.reasons).toEqual(expect.arrayContaining(["CLARIFY_NONE:en-nuclear:DEADLINE", `MODEL_NOT_EXERCISED:${HAIKU}`]));
    expect((beside.byArm as readonly { arm: string }[]).map((row) => row.arm)).toEqual(["T"]);
    expect(beside.clarify).toMatchObject({ readings: 3, costUsd: null });
    // A run without arm Q has no clarify block.
    expect(openingsReportFromLog([start(["T"]), end])).not.toHaveProperty("clarify");
  });

  it("the README's arm Q commands are real commands of this tool", () => {
    const readme = readFileSync(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
    const commands = readme.split("\n").filter((line) => line.includes("tools/preview-practice/practice.ts openings ") && line.includes("--arms Q"));
    expect(commands.length).toBeGreaterThanOrEqual(2);
    for (const line of commands) {
      const args = parsePracticeArgs(line.slice(line.indexOf("practice.ts ") + "practice.ts ".length).trim().split(/\s+/u)
        .map((word) => word.replace(/^"(.*)"$/u, "$1")));
      expect(args.mode).toBe("openings");
      expect(openingsArmsFromFlag(args.flags.get("--arms"))).toEqual(["Q"]);
    }
    expect(commands.some((line) => line.includes(" --dry "))).toBe(true);
    expect(commands.some((line) => line.includes("--gate-status-deepinfra") && line.includes("--gate-status-anthropic"))).toBe(true);
    // The plan's "--arms C" is the angle map: the README never tells the sitting to run it for the clarifying call.
    expect(readme).not.toMatch(/--arms C\b(?!2)[^\n]*clarif/iu);
  });
});
