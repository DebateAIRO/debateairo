// The preview practice tool's pure rules (tools/preview-practice): the verdict and its exit codes, the redaction of
// reply text, the gate brake (stop after four connection failures in a row; vendor refusals and cool-offs never stop it), the
// busy-model skip of the formats mode, the start refusals, the samples log and its rebuilt report, the interrupt
// debounce, the per-gate limit and the one-call-per-model rule of the parallel formats mode.
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS,
  createPreviewBudgetRpcPort,
  createPreviewBusyCoordinator,
  PreviewGateUnavailable,
  PreviewModelCooling,
  PreviewUnbilledRefusal,
  PreviewVendorRefusedUnbilled,
  parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets,
  previewModelRow,
  previewRunnerPolicy,
  previewTargetJsonRow,
  type PreviewBudgetPort
} from "@debateai/providers";
import { loadStoryPack, resolveStoryPackDir } from "@debateai/story";
import { DEVELOPMENT_ORGAN_COST_BOUNDS } from "../../apps/runner/src/dev-deployment-register.js";
import { PracticeGateObserver, PRACTICE_GATE_STOPPED, practiceStopIsPause, vendorUsage } from "../../tools/preview-practice/practice-gate-observer.js";
import { onePerModel, practiceBusyWaitMs, practiceTurnOrder, runPracticeFormats, type PracticeSample } from "../../tools/preview-practice/practice-formats.js";
import { jitteredGap, limitPort, PracticeSemaphore, runModelQueues } from "../../tools/preview-practice/practice-concurrency.js";
import { practiceInterruptGate, takeOverSignals } from "../../tools/preview-practice/practice-interrupt.js";
import { EventEmitter } from "node:events";
import {
  parsePracticeSampleLog,
  PracticeSampleLog,
  practiceReportFromLog,
  PRACTICE_LOG_HAS_NO_END,
  readPracticeSampleLog,
  type PracticeLogLine
} from "../../tools/preview-practice/practice-samples-log.js";
import { stubVendorReply } from "../support/preview-gate-stubs.js";
import { issueListFromParseError, recheckReply, replyContentOf, callFamilyOf } from "../../tools/preview-practice/practice-lanes.js";
import { capReplyText, redactKeyShapes, reportableReplyText } from "../../tools/preview-practice/practice-redaction.js";
import { parsePracticeRegisterExport } from "../../tools/preview-practice/practice-register-import.js";
import { assertOutsideRepository, debateReport, reportMarkdown } from "../../tools/preview-practice/practice-report.js";
import type { PracticeDebateResult } from "../../tools/preview-practice/practice-debate.js";
import {
  formatPracticeCallConcurrency,
  parsePracticeCallConcurrency,
  PracticeCallStats,
  practiceParallelBlock
} from "../../tools/preview-practice/practice-parallel.js";
import { parsePracticeArgs, runPractice } from "../../tools/preview-practice/practice.js";
import { createCallScheduler } from "../../apps/runner/src/call-scheduler.js";
import { applyPreviewGateCapacities } from "../../apps/runner/src/call-lane-gateway.js";
import {
  assertGateStatusAllowsPractice,
  PracticeRefusal,
  parseGateStatus,
  parsePracticeSettings,
  practiceSocketsFromEnvironment
} from "../../tools/preview-practice/practice-settings.js";
import { latencySummary, percentile, practiceVerdict, type PracticeVerdictInput } from "../../tools/preview-practice/practice-verdict.js";

const CLEAN: PracticeVerdictInput = Object.freeze({
  harnessError: null, completed: true, servedAnswer: true, storyOutcome: "READY", formatFailures: 0, failedCalls: 0,
  gateHalted: false, gateStopped: false, notExercisedModels: [], unbilledRefusals: 0, p90ByModel: { a: 1_000 }
});

describe("practice verdict", () => {
  it("PASS (0) only when everything is clean", () => {
    expect(practiceVerdict(CLEAN)).toEqual({ verdict: "PASS", exitCode: 0, reasons: [] });
  });
  it.each([
    [{ completed: false }, "RUN_NOT_COMPLETED"],
    [{ servedAnswer: false }, "NO_SERVED_ANSWER"],
    [{ storyOutcome: "FAILED" }, "STORY_NOT_READY:FAILED"],
    [{ formatFailures: 1 }, "FORMAT_FAILED:1"],
    [{ failedCalls: 2 }, "CALL_FAILED:2"],
    [{ gateHalted: true }, "GATE_HALTED"],
    [{ gateStopped: true }, "GATE_STOPPED_BY_PRACTICE"]
  ] as const)("FAIL (20): %o -> %s", (change, reason) => {
    expect(practiceVerdict({ ...CLEAN, ...change })).toEqual({ verdict: "FAIL", exitCode: 20, reasons: [reason] });
  });
  it("NOT_PROVEN (30) when a model sat out, outranking warnings but not a failure", () => {
    expect(practiceVerdict({ ...CLEAN, notExercisedModels: ["m"], unbilledRefusals: 1 }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["MODEL_NOT_EXERCISED:m", "UNBILLED_REFUSALS:1"] });
    expect(practiceVerdict({ ...CLEAN, notExercisedModels: ["m"], formatFailures: 1 }).verdict).toBe("FAIL");
  });
  it("NOT_PROVEN (30), not FAIL, for a busy model: listed once, beside its busy refusals", () => {
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], notExercisedModels: ["glm"], unbilledRefusals: 2 }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["MODEL_BUSY:glm", "UNBILLED_REFUSALS:2"] });
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], formatFailures: 1 }).verdict).toBe("FAIL");
  });
  it("NOT_PROVEN (30) for a gate the practice paused itself after four connection failures in a row; FAIL for any other stop", () => {
    expect(practiceVerdict({ ...CLEAN, gatePauses: ["deepinfra:NOT_REACHED_IN_A_ROW_4"] }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["GATE_PAUSED:deepinfra:NOT_REACHED_IN_A_ROW_4"] });
    expect(practiceStopIsPause({ gate: "deepinfra", reason: "NOT_REACHED_IN_A_ROW_4", atSeq: 4 })).toBe(true);
    expect(practiceStopIsPause({ gate: "deepinfra", reason: "GATE_REFUSED_DAILY_COST_ENVELOPE_REACHED", atSeq: 1 })).toBe(false);
    expect(practiceStopIsPause({ gate: "deepinfra", reason: "GATE_REFUSED_PROVIDER_GATE_UNAVAILABLE", atSeq: 1 })).toBe(false);
    expect(practiceStopIsPause(null)).toBe(false);
  });
  it("PASS_WITH_WARNINGS (10): a recovered busy refusal, or a p90 over 120 s (120 s itself is not slow)", () => {
    expect(practiceVerdict({ ...CLEAN, unbilledRefusals: 2 })).toEqual({ verdict: "PASS_WITH_WARNINGS", exitCode: 10, reasons: ["UNBILLED_REFUSALS:2"] });
    expect(practiceVerdict({ ...CLEAN, p90ByModel: { m: 120_000 } }).verdict).toBe("PASS");
    expect(practiceVerdict({ ...CLEAN, p90ByModel: { m: 120_001 } })).toEqual({ verdict: "PASS_WITH_WARNINGS", exitCode: 10, reasons: ["SLOW_P90:m:120s"] });
  });
  it("HARNESS_ERROR (40) outranks everything", () => {
    expect(practiceVerdict({ ...CLEAN, harnessError: "PRACTICE_ACK_REQUIRED", formatFailures: 3 }))
      .toEqual({ verdict: "HARNESS_ERROR", exitCode: 40, reasons: ["HARNESS_ERROR:PRACTICE_ACK_REQUIRED"] });
  });
  it("formats mode (no answer, no story) passes on its own facts", () => {
    expect(practiceVerdict({ ...CLEAN, servedAnswer: null, storyOutcome: null }).verdict).toBe("PASS");
  });
  it("nearest-rank percentiles", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(latencySummary([7])).toEqual({ p50: 7, p90: 7, max: 7 });
  });
});

describe("practice redaction", () => {
  // Built from pieces at run time: no key-shaped literal in the source.
  const vendorKey = ["sk", "ant", "x".repeat(6) + "Y7".repeat(12)].join("-");
  const longRun = "Ab9_".repeat(10);
  const jwt = ["eyJ" + "hbGciOi", "eyJzdWIi" + "OiIxIn0", "c2lnbmF0" + "dXJl"].join(".");
  it("blanks each key shape and names only its kind", () => {
    const text = `key ${vendorKey} and Bearer ${"t0ken".repeat(4)} and ${jwt} and api_key=${"v4lue".repeat(2)} and ${longRun}`;
    const out = redactKeyShapes(text);
    for (const secret of [vendorKey, "t0ken".repeat(4), jwt, "v4lue".repeat(2), longRun]) expect(out).not.toContain(secret);
    expect(out).toContain("[REDACTED:vendor-key]");
    expect(out).toContain("[REDACTED:bearer]");
    expect(out).toContain("[REDACTED:jwt]");
    expect(out).toContain("[REDACTED:named-secret]");
    expect(out).toContain("[REDACTED:long-run]");
  });
  it("leaves prose, model ids, short identifiers and JSON alone", () => {
    const prose = JSON.stringify({ steelman: { summary: "Free buses raise ridership.", fidelity: 0.7 }, model: "deepseek-ai/DeepSeek-V4.1-Flash",
      ref: "preview:qwen-3-8-flash", text: "Ar trebui un oraș de mărime medie să facă gratuite liniile?" });
    expect(redactKeyShapes(prose)).toBe(prose);
  });
  it("caps at 64 KiB keeping head and tail", () => {
    const big = `HEAD${"a b ".repeat(40_000)}TAIL`;
    const capped = capReplyText(big);
    expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(capped.startsWith("HEAD")).toBe(true);
    expect(capped.endsWith("TAIL")).toBe(true);
    expect(capped).toContain("bytes left out");
    expect(capReplyText("short")).toBe("short");
    expect(reportableReplyText(`x ${vendorKey}`)).toBe("x [REDACTED:vendor-key]");
  });
});

describe("practice gate brake", () => {
  const body = (model: string) => JSON.stringify({ model, max_tokens: 1, messages: [] });
  const execution = (model: string) => ({ operationId: "op", requestBody: body(model), requestSha256: "0".repeat(64), reservedUsd: "0.1" });
  type Step = "OK" | "UNBILLED" | "COOLING" | "NOTREACHED" | "INFLIGHT" | "DAILY" | "HALTED";
  function scriptedPort(steps: Step[]) {
    let sent = 0;
    const port: PreviewBudgetPort = {
      async execute() {
        const step = steps[sent] ?? "OK";
        sent += 1;
        // The vendor's PROVIDER_REFUSED_UNBILLED, as previewAuthorityRefusal maps it.
        if (step === "UNBILLED") throw new PreviewVendorRefusedUnbilled();
        // Gate v4's MODEL_COOLING: this one model cools off; nothing was reserved or sent.
        if (step === "COOLING") throw new PreviewModelCooling(60);
        // The gate's PROVIDER_NOT_REACHED (the connection failed before a byte was written), as previewAuthorityRefusal maps it.
        if (step === "NOTREACHED") throw new PreviewUnbilledRefusal();
        // The gate's own CONCURRENCY_LIMIT_REACHED, as previewAuthorityRefusal maps it.
        if (step === "INFLIGHT") throw new PreviewUnbilledRefusal("Private preview gate is at its limit of calls in flight");
        if (step === "DAILY") throw new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "day");
        if (step === "HALTED") throw new PreviewGateUnavailable();
        return { status: 200, body: JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 4 } }) };
      }
    };
    return { port, sent: () => sent };
  }
  it("stops a gate after FOUR connection failures in a row (the gate halts at five) and never sends to it again", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const gate = scriptedPort(["NOTREACHED", "NOTREACHED", "NOTREACHED", "NOTREACHED", "OK"]);
    const watched = observer.wrap("deepinfra", gate.port);
    for (let index = 0; index < 3; index += 1) await expect(watched.execute(execution("m"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    expect(observer.stopped("deepinfra")).toBeNull();
    await expect(watched.execute(execution("m"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    await expect(watched.execute(execution("m"))).rejects.toMatchObject({ code: PRACTICE_GATE_STOPPED });
    expect(gate.sent()).toBe(4);
    expect(observer.summary("deepinfra")).toMatchObject({ calls: 4, unbilled: 4, notReached: 4, longestNotReachedRun: 4,
      stoppedLocally: 1, stop: { reason: "NOT_REACHED_IN_A_ROW_4" } });
    expect(observer.stopped("anthropic")).toBeNull();
  });
  it("vendor refusals (429, not billed) never stop the gate, however many come in a row, and never count as connection failures", async () => {
    const observer = new PracticeGateObserver();
    const gate = scriptedPort([...Array<Step>(12).fill("UNBILLED"), "OK"]);
    const watched = observer.wrap("deepinfra", gate.port);
    for (let index = 0; index < 12; index += 1) await expect(watched.execute(execution("m"))).rejects.toBeInstanceOf(PreviewVendorRefusedUnbilled);
    await expect(watched.execute(execution("m"))).resolves.toMatchObject({ status: 200 });
    expect(observer.stopped("deepinfra")).toBeNull();
    expect(observer.summary("deepinfra")).toMatchObject({ calls: 13, unbilled: 12, vendorRefused: 12, notReached: 0,
      longestNotReachedRun: 0, stop: null });
  });
  it("a model cooling off (MODEL_COOLING) never stops the gate: that model is busy, the other models go on", async () => {
    const observer = new PracticeGateObserver();
    const gate = scriptedPort([...Array<Step>(5).fill("COOLING"), "OK"]);
    const watched = observer.wrap("deepinfra", gate.port);
    for (let index = 0; index < 5; index += 1) await expect(watched.execute(execution("glm"))).rejects.toBeInstanceOf(PreviewModelCooling);
    await expect(watched.execute(execution("qwen"))).resolves.toMatchObject({ status: 200 });
    expect(observer.stopped("deepinfra")).toBeNull();
    expect(observer.summary("deepinfra")).toMatchObject({ unbilled: 5, modelCooling: 5, notReached: 0, longestNotReachedRun: 0, stop: null });
    expect(observer.modelsEndingBusy()).toEqual(["glm"]);
  });
  it("a vendor refusal or a cool-off in between neither adds to nor resets the connection-failure run (the gate's own rule)", async () => {
    const observer = new PracticeGateObserver();
    const gate = scriptedPort(["NOTREACHED", "UNBILLED", "NOTREACHED", "COOLING", "NOTREACHED", "NOTREACHED", "OK"]);
    const watched = observer.wrap("deepinfra", gate.port);
    for (let index = 0; index < 6; index += 1) await expect(watched.execute(execution("m"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    await expect(watched.execute(execution("m"))).rejects.toMatchObject({ code: PRACTICE_GATE_STOPPED });
    expect(gate.sent()).toBe(6);
    expect(observer.summary("deepinfra")).toMatchObject({ notReached: 4, vendorRefused: 1, modelCooling: 1, longestNotReachedRun: 4,
      stop: { reason: "NOT_REACHED_IN_A_ROW_4" } });
  });
  it("an answer resets the connection-failure run: three, an answer, three more: no stop", async () => {
    const observer = new PracticeGateObserver();
    const gate = scriptedPort(["NOTREACHED", "NOTREACHED", "NOTREACHED", "OK", "NOTREACHED", "NOTREACHED", "NOTREACHED", "OK"]);
    const watched = observer.wrap("anthropic", gate.port);
    for (const expected of ["refused", "refused", "refused", "ok", "refused", "refused", "refused", "ok"]) {
      if (expected === "ok") await expect(watched.execute(execution("m"))).resolves.toMatchObject({ status: 200 });
      else await expect(watched.execute(execution("m"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    }
    expect(observer.stopped("anthropic")).toBeNull();
    expect(observer.summary("anthropic")).toMatchObject({ calls: 8, vendorOk: 2, unbilled: 6, notReached: 6, longestNotReachedRun: 3 });
  });
  it("the gate's own in-flight limit moves neither count (the gate refuses it before reserving anything)", async () => {
    const observer = new PracticeGateObserver();
    const gate = scriptedPort(["INFLIGHT", "INFLIGHT", "INFLIGHT", "INFLIGHT", "INFLIGHT", "OK"]);
    const watched = observer.wrap("deepinfra", gate.port);
    for (let index = 0; index < 5; index += 1) await expect(watched.execute(execution("m"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    await expect(watched.execute(execution("m"))).resolves.toMatchObject({ status: 200 });
    expect(observer.stopped("deepinfra")).toBeNull();
    expect(observer.summary("deepinfra")).toMatchObject({ unbilled: 5, concurrencyLimit: 5, notReached: 0, longestNotReachedRun: 0 });
  });
  it("a gate that starts with a connection-failure streak of two has two more before the brake; a gate at the limit sends nothing", async () => {
    const observer = new PracticeGateObserver({ unsentStreakAtStart: { deepinfra: 2 } });
    const gate = scriptedPort(["NOTREACHED", "NOTREACHED", "OK"]);
    const watched = observer.wrap("deepinfra", gate.port);
    await expect(watched.execute(execution("m"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    await expect(watched.execute(execution("m"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    await expect(watched.execute(execution("m"))).rejects.toMatchObject({ code: PRACTICE_GATE_STOPPED });
    expect(gate.sent()).toBe(2);
    expect(observer.summary("deepinfra")).toMatchObject({ unsentStreakAtStart: 2, longestNotReachedRun: 4,
      stop: { reason: "NOT_REACHED_IN_A_ROW_4" } });
    const full = new PracticeGateObserver({ unsentStreakAtStart: { anthropic: 4 } });
    const untouched = scriptedPort(["OK"]);
    await expect(full.wrap("anthropic", untouched.port).execute(execution("m"))).rejects.toMatchObject({ code: PRACTICE_GATE_STOPPED });
    expect(untouched.sent()).toBe(0);
    expect(full.stopped("anthropic")).toMatchObject({ reason: "NOT_REACHED_IN_A_ROW_4" });
  });
  it("names the models whose last call ended in the vendor's refusal (the debate's sit-outs), not the gate's own", async () => {
    const observer = new PracticeGateObserver();
    const gate = scriptedPort(["UNBILLED", "OK", "UNBILLED", "UNBILLED", "OK", "NOTREACHED", "INFLIGHT"]);
    const watched = observer.wrap("deepinfra", gate.port);
    await watched.execute(execution("glm")).catch(() => undefined);
    await watched.execute(execution("glm"));
    await watched.execute(execution("mimo")).catch(() => undefined);
    await watched.execute(execution("mimo")).catch(() => undefined);
    await watched.execute(execution("qwen"));
    await watched.execute(execution("deepseek")).catch(() => undefined);
    await watched.execute(execution("haiku")).catch(() => undefined);
    expect(observer.modelsEndingBusy()).toEqual(["mimo"]);
  });
  it("any gate refusal that is not unbilled stops the gate at once", async () => {
    const observer = new PracticeGateObserver();
    const gate = scriptedPort(["DAILY"]);
    const watched = observer.wrap("deepinfra", gate.port);
    await expect(watched.execute(execution("m"))).rejects.toMatchObject({ code: "DAILY_COST_ENVELOPE_REACHED" });
    await expect(watched.execute(execution("m"))).rejects.toMatchObject({ code: PRACTICE_GATE_STOPPED });
    expect(gate.sent()).toBe(1);
    expect(observer.summary("deepinfra")).toMatchObject({ gateRefused: 1, stop: { reason: "GATE_REFUSED_DAILY_COST_ENVELOPE_REACHED" } });
  });
  it("a halted gate (PROVIDER_GATE_UNAVAILABLE, run resilience fix (c)) is a gate refusal: the gate stops at once", async () => {
    const observer = new PracticeGateObserver();
    const gate = scriptedPort(["HALTED"]);
    const watched = observer.wrap("deepinfra", gate.port);
    await expect(watched.execute(execution("m"))).rejects.toMatchObject({ code: "PROVIDER_GATE_UNAVAILABLE" });
    await expect(watched.execute(execution("m"))).rejects.toMatchObject({ code: PRACTICE_GATE_STOPPED });
    expect(gate.sent()).toBe(1);
    expect(observer.summary("deepinfra")).toMatchObject({ gateRefused: 1, transportFailed: 0,
      stop: { reason: "GATE_REFUSED_PROVIDER_GATE_UNAVAILABLE" } });
  });
  it("records the model and the vendor's token counts, never a body", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    await observer.wrap("deepinfra", scriptedPort(["OK"]).port).execute(execution("deepseek-ai/DeepSeek-V4.1-Flash"));
    expect(observer.events).toEqual([expect.objectContaining({ model: "deepseek-ai/DeepSeek-V4.1-Flash", outcome: "VENDOR_OK",
      inputTokens: 10, outputTokens: 4 })]);
    expect(JSON.stringify(observer.events)).not.toContain("messages");
    expect(vendorUsage("anthropic", JSON.stringify({ usage: { input_tokens: 3, output_tokens: 2 } })))
      .toEqual({ inputTokens: 3, outputTokens: 2, reasoningTokens: null, cachedInputTokens: null });
  });
});

describe("practice start refusals", () => {
  const sockets = { PRACTICE_ACK: "spends-real-money", PRACTICE_DEEPINFRA_SOCKET: "/x/deepinfra.sock", PRACTICE_ANTHROPIC_SOCKET: "/x/anthropic.sock" };
  const isSocket = (path: string) => path.startsWith("/x/");
  it("needs the acknowledgement, both sockets, absolute, existing and distinct", () => {
    expect(practiceSocketsFromEnvironment(sockets, isSocket)).toEqual({ deepinfra: "/x/deepinfra.sock", anthropic: "/x/anthropic.sock" });
    expect(() => practiceSocketsFromEnvironment({ ...sockets, PRACTICE_ACK: "yes" }, isSocket)).toThrow("PRACTICE_ACK_REQUIRED");
    expect(() => practiceSocketsFromEnvironment({ ...sockets, PRACTICE_ANTHROPIC_SOCKET: undefined }, isSocket)).toThrow("PRACTICE_SOCKET_MISSING");
    expect(() => practiceSocketsFromEnvironment({ ...sockets, PRACTICE_DEEPINFRA_SOCKET: "relative.sock" }, isSocket)).toThrow("PRACTICE_SOCKET_NOT_ABSOLUTE");
    expect(() => practiceSocketsFromEnvironment({ ...sockets, PRACTICE_DEEPINFRA_SOCKET: "/y/none.sock" }, isSocket)).toThrow("PRACTICE_SOCKET_NOT_FOUND");
    expect(() => practiceSocketsFromEnvironment({ ...sockets, PRACTICE_ANTHROPIC_SOCKET: "/x/deepinfra.sock" }, isSocket)).toThrow("PRACTICE_SOCKETS_SAME");
  });
  it("refuses a gate that is not active, or whose connection-failure streak is three or more; there is no daily cap", () => {
    expect(parseGateStatus("deepinfra", JSON.stringify({ state: "active", unsent_streak: 2 }))).toMatchObject({ unsentStreak: 2 });
    expect(() => assertGateStatusAllowsPractice("deepinfra", parseGateStatus("deepinfra", JSON.stringify({ state: "active", unsent_streak: 2, today_unbilled_releases: 500 }))))
      .not.toThrow();
    expect(() => assertGateStatusAllowsPractice("deepinfra", parseGateStatus("deepinfra", JSON.stringify({ state: "active", unsent_streak: 3, today_unbilled_releases: 0 }))))
      .toThrow("PRACTICE_GATE_UNSENT_STREAK_TOO_HIGH: deepinfra: 3");
    expect(() => assertGateStatusAllowsPractice("anthropic", parseGateStatus("anthropic", JSON.stringify({ state: "halted", unsent_streak: 0 }))))
      .toThrow("PRACTICE_GATE_NOT_ACTIVE");
    expect(() => parseGateStatus("anthropic", "{}")).toThrow("PRACTICE_GATE_STATUS_INVALID");
    expect(() => parseGateStatus("anthropic", JSON.stringify({ state: "active" }))).toThrow("PRACTICE_GATE_STATUS_INVALID");
  });
  const config = JSON.stringify({ deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash"],
    premium_model_ids: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"],
    requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-unit" });
  const lines = [`PREVIEW_PROVIDER_TEST_CONFIG_JSON=${config}`, "PROVIDER_DISCOVERY_TARGETS_JSON=[]", "REGISTER_VERSION=11",
    "DEBATEAI_DEPLOYMENT_MODE=local", "NODE_ENV=production", "CLAIM_MS=3000000", "CLAIM_MARGIN_MS=60000", "MAX_RECOMPOSE=1",
    "JUDGEMENT_NUMBER_KIND=k", "JUDGEMENT_PRODUCER=p", "PROPAGATION_NUMBER_KIND=k", "PROPAGATION_PRODUCER=p", "PROVIDER_REF=preview:fixture-a",
    "STRANGER_SAMPLE_RATE=0", "BATTERY_VERSION=s00", "SETTLEMENT_WATCH_HANDLE=h"];
  it("reads the allowed settings", () => {
    const settings = parsePracticeSettings(lines.join("\n"));
    expect(settings.runner).toMatchObject({ REGISTER_VERSION: 11, DEPLOYMENT_MODE: "local", CLAIM_MS: 3_000_000 });
    expect(settings.previewConfig.scope_id).toBe("preview-practice-unit");
  });
  it("refuses a key outside the allow-list (a database address, a team list), a key-shaped value, hosted mode, a credential", () => {
    expect(() => parsePracticeSettings([...lines, "DATABASE_URL=postgresql://x"].join("\n"))).toThrow("PRACTICE_SETTINGS_KEY_REFUSED");
    expect(() => parsePracticeSettings([...lines, "PREVIEW_TEAM_USER_IDS_JSON=[]"].join("\n"))).toThrow("PRACTICE_SETTINGS_KEY_REFUSED");
    expect(() => parsePracticeSettings(lines.map((line) => line.startsWith("JUDGEMENT_PRODUCER=")
      ? `JUDGEMENT_PRODUCER=${["sk", "x".repeat(4) + "Q9".repeat(8)].join("-")}` : line).join("\n"))).toThrow("PRACTICE_SETTINGS_VALUE_KEY_SHAPED");
    expect(() => parsePracticeSettings(lines.map((line) => line.startsWith("DEBATEAI_DEPLOYMENT_MODE=") ? "DEBATEAI_DEPLOYMENT_MODE=hosted" : line).join("\n")))
      .toThrow("PRACTICE_REQUIRES_LOCAL_MODE");
    expect(() => parsePracticeSettings(lines.map((line) => line.startsWith("PROVIDER_DISCOVERY_TARGETS_JSON=")
      ? 'PROVIDER_DISCOVERY_TARGETS_JSON=[{"authorization_file":"/x"}]' : line).join("\n"))).toThrow("PRACTICE_SETTINGS_VALUE_INVALID");
    expect(() => parsePracticeSettings(lines.filter((line) => !line.startsWith("CLAIM_MS=")).join("\n"))).toThrow("PRACTICE_SETTINGS_KEY_MISSING");
  });
  it("never writes its report inside the repository", () => {
    expect(() => assertOutsideRepository("/repo/root/out", "/repo/root")).toThrow("PRACTICE_REPORT_INSIDE_REPOSITORY");
    expect(assertOutsideRepository("/elsewhere/out", "/repo/root")).toBe("/elsewhere/out");
  });
});

describe("practice diagnosis", () => {
  it("reads both forms of a format check's error as code@path", () => {
    expect(issueListFromParseError("invalid_type@steelman.fidelity,too_big@$")).toEqual(["invalid_type@steelman.fidelity", "too_big@$"]);
    expect(issueListFromParseError(JSON.stringify([{ code: "invalid_type", path: ["criteria", "restatement"], message: "x" },
      { path: ["segments", 0, "text"], message: "COMPOSED_TEXT_NAMES_A_NODE" }])))
      .toEqual(["invalid_type@criteria.restatement", "COMPOSED_TEXT_NAMES_A_NODE@segments.0.text"]);
    expect(issueListFromParseError(null)).toEqual([]);
  });
  it("re-checks a stored reply with the job's own check, by call-site key", () => {
    const badPanel = JSON.stringify({ steelman: { summary: "s", fidelity: "high" }, critic: { summary: "c", counterargumentStrength: 1, basis: "PLAUSIBLE_COUNTER" },
      evidence: { quality: 0, relevance: 0 }, context: { fit: 0, ambiguityFlags: [] }, fallacy: { severity: 1, fatalFlags: [] } });
    expect(recheckReply("PANEL:root:preview:mimo-v2-6-pro", badPanel)).toEqual({ family: "PANEL", issues: ["invalid_type@steelman.fidelity"] });
    expect(recheckReply("POST_COMPOSE_R9:EVALUATOR:1", JSON.stringify({ satisfied: true })).issues.length).toBeGreaterThan(0);
    expect(recheckReply("SOMETHING:ELSE", "{}")).toEqual({ family: "UNMAPPED", issues: ["UNMAPPED"] });
    expect(callFamilyOf("JUDGE:review:abc")).toBe("REVIEW");
    expect(callFamilyOf("JUDGE:defender:root0:r2:p0")).toBe("JUDGE");
    expect(callFamilyOf("STORY:CHECKER:1")).toBe("STORY_CHECKER");
  });
  it("takes the model's text out of the stored vendor body", () => {
    expect(replyContentOf(JSON.stringify({ choices: [{ message: { content: "{\"a\":1}" } }] }))).toBe("{\"a\":1}");
    expect(replyContentOf(JSON.stringify({ content: [{ type: "text", text: "hi" }] }))).toBe("hi");
    expect(replyContentOf("plain")).toBe("plain");
  });
});

describe("practice register export", () => {
  it("the README's root export is one read-only statement in a read-only session, bounded by the live version", () => {
    const readme = readFileSync(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
    const command = readme.split("\n").find((line) => line.startsWith("runuser -u postgres -- env PGOPTIONS='-c default_transaction_read_only=on' psql "));
    expect(command).toBeDefined();
    const sql = /-c "(SELECT json_build_object\('schema','preview-practice-register-export-v1'[^"]+)"/u.exec(command!)?.[1];
    expect(sql).toBeDefined();
    expect(sql!.match(/register_version <= \$\{V\}/gu)).toHaveLength(2);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT)\b/iu);
    expect(command).toContain("-v ON_ERROR_STOP=1");
  });
  it("refuses an export of the wrong shape", () => {
    expect(() => parsePracticeRegisterExport("[]")).toThrow("PRACTICE_REGISTER_EXPORT_INVALID");
    expect(() => parsePracticeRegisterExport(JSON.stringify({ schema: "other", versions: [], rows: [] }))).toThrow("PRACTICE_REGISTER_EXPORT_INVALID");
    const one = { register_version: "1", row_count: 1, base_register_version: null, publication_id: null, request_sha256: null,
      snapshot_sha256: null, publication_kind: null, recorded_at: null };
    expect(() => parsePracticeRegisterExport(JSON.stringify({ schema: "preview-practice-register-export-v1", versions: [one],
      rows: [{ register_version: "2", row_key: "k", value_json: "1", source_ref: "s" }] }))).toThrow("row of unknown version 2");
    expect(parsePracticeRegisterExport(JSON.stringify({ schema: "preview-practice-register-export-v1", versions: [one],
      rows: [{ register_version: "1", row_key: "k", value_json: "1", source_ref: "s" }] })).versions).toHaveLength(1);
  });
});

describe("practice formats: a busy model sits out, the others go on, in turns", () => {
  const FIVE = ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"];
  const GLM = FIVE[0]!;
  const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", free_model_ids: FIVE.slice(0, 2),
    premium_model_ids: FIVE, requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-unit" }))!;
  const configured = PREVIEW_REVIEWED_PROVIDER_REFS.map((providerRef) => {
    const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
    return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
  });
  const targets = onePerModel(parseProviderDiscoveryTargets(JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)), configured), FIVE);
  const policy = previewRunnerPolicy({ bounds: DEVELOPMENT_ORGAN_COST_BOUNDS.organs,
    synthesisRolePolicy: { synthesizerBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.COMPOSER, evaluatorBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.CONFORMANCE } }, config);
  const pack = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));

  /**
   * A gate port answering every model with a (wrong-format) reply, except: the busy ones, refused by the vendor, not
   * billed, every time; the unreached ones, the gate's own "vendor not reached", every time.
   */
  function gatePort(provider: "deepinfra" | "anthropic", busy: readonly string[], seen: string[], unreached: readonly string[] = []): PreviewBudgetPort {
    let id = 0;
    return { async execute(input) {
      const model = String((JSON.parse(input.requestBody) as { model: unknown }).model);
      seen.push(model);
      if (busy.includes(model)) throw new PreviewVendorRefusedUnbilled();
      if (unreached.includes(model)) throw new PreviewUnbilledRefusal();
      id += 1;
      return { status: 200, body: stubVendorReply(provider, model, "{}", `unit-${String(id)}`) };
    } };
  }

  it("takes the models in turns, the Anthropic model between the DeepInfra ones", () => {
    expect(practiceTurnOrder(targets).map((target) => target.model))
      .toEqual(["zai-org/GLM-5.3-Flash", "claude-haiku-5-5", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash"]);
  });

  it("GLM refused as busy every time: its first job UNBILLED_REFUSED, the rest SKIPPED_MODEL_BUSY; the other four keep going; no gate stop", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const seen: string[] = [];
    const ports = { deepinfra: observer.wrap("deepinfra", gatePort("deepinfra", [GLM], seen)),
      anthropic: observer.wrap("anthropic", gatePort("anthropic", [GLM], seen)) };
    const result = await runPracticeFormats({ config, targets, ports, observer, lanes: ["JUDGE_POSITION", "PANEL"], samples: 2, gapMs: 0,
      pack, bounds: { judge: policy.bounds.JUDGE, synthesizer: policy.synthesisRolePolicy.synthesizerBound,
        evaluator: policy.synthesisRolePolicy.evaluatorBound }, sleep: async () => undefined });
    const glm = result.samples.filter((sample) => sample.model === GLM).map((sample) => sample.status);
    expect(glm).toEqual(["UNBILLED_REFUSED", "SKIPPED_MODEL_BUSY", "SKIPPED_MODEL_BUSY", "SKIPPED_MODEL_BUSY"]);
    expect(result.busyModels).toEqual([GLM]);
    for (const model of FIVE.slice(1)) {
      const statuses = result.samples.filter((sample) => sample.model === model).map((sample) => sample.status);
      expect(statuses).toHaveLength(4);
      expect(statuses.some((status) => status.startsWith("SKIPPED") || status === "UNBILLED_REFUSED")).toBe(false);
    }
    // GLM was sent its first call and the one resend, never again; the gate was never stopped.
    expect(seen.filter((model) => model === GLM)).toHaveLength(2);
    expect(observer.stopped("deepinfra")).toBeNull();
    // The first round: one job of each model, in turn order.
    expect(result.samples.slice(0, 5).map((sample) => sample.model)).toEqual(practiceTurnOrder(targets).map((target) => target.model));
  });

  it("the gate's own refusal (vendor not reached) never marks a model busy: its jobs are each tried", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const seen: string[] = [];
    const ports = { deepinfra: observer.wrap("deepinfra", gatePort("deepinfra", [], seen, [GLM])),
      anthropic: observer.wrap("anthropic", gatePort("anthropic", [], seen)) };
    const result = await runPracticeFormats({ config, targets, ports, observer, lanes: ["JUDGE_POSITION"], samples: 1, gapMs: 0,
      pack, bounds: { judge: policy.bounds.JUDGE, synthesizer: policy.synthesisRolePolicy.synthesizerBound,
        evaluator: policy.synthesisRolePolicy.evaluatorBound }, sleep: async () => undefined });
    expect(result.busyModels).toEqual([]);
    expect(result.samples.find((sample) => sample.model === GLM)?.status).toBe("UNBILLED_REFUSED");
  });

  it("parallel: the same busy-model rule, each sample counts only its own model's calls, every sample is told at once", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const seen: string[] = [];
    const ports = { deepinfra: observer.wrap("deepinfra", gatePort("deepinfra", [GLM], seen)),
      anthropic: observer.wrap("anthropic", gatePort("anthropic", [GLM], seen)) };
    const told: string[] = [];
    const result = await runPracticeFormats({ config, targets, ports, observer, lanes: ["JUDGE_POSITION", "PANEL"], samples: 2, gapMs: 0,
      pack, bounds: { judge: policy.bounds.JUDGE, synthesizer: policy.synthesisRolePolicy.synthesizerBound,
        evaluator: policy.synthesisRolePolicy.evaluatorBound }, sleep: async () => undefined, parallel: true,
      onSample: (sample) => told.push(`${sample.model}|${sample.lane}|${String(sample.sample)}`), onBusy: (model) => told.push(`busy:${model}`) });
    expect(result.samples.filter((sample) => sample.model === GLM).map((sample) => sample.status))
      .toEqual(["UNBILLED_REFUSED", "SKIPPED_MODEL_BUSY", "SKIPPED_MODEL_BUSY", "SKIPPED_MODEL_BUSY"]);
    expect(result.busyModels).toEqual([GLM]);
    expect(seen.filter((model) => model === GLM)).toHaveLength(2);
    // Each of the other models' samples counted only its own calls (no other model's refusals or tokens).
    for (const sample of result.samples.filter((entry) => entry.model !== GLM)) {
      expect(sample.attempts.length).toBeGreaterThan(0);
      expect(sample).toMatchObject({ unbilledRefusals: 0, inputTokens: 100 * sample.attempts.length, outputTokens: 50 * sample.attempts.length });
    }
    expect(told.filter((entry) => !entry.startsWith("busy:"))).toHaveLength(20);
    expect(told).toContain(`busy:${GLM}`);
  });
});

describe("practice verdict: an interrupted or aborted run", () => {
  it("one interrupt (the calls in flight finished, the rest skipped) is NOT_PROVEN, never FAIL on its own", () => {
    expect(practiceVerdict({ ...CLEAN, interrupted: true }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["RUN_INTERRUPTED"] });
    expect(practiceVerdict({ ...CLEAN, interrupted: true, formatFailures: 1 }).verdict).toBe("FAIL");
  });
  it("ABORTED (50) outranks FAIL and lists every other rule after the abort; HARNESS_ERROR still outranks it", () => {
    expect(practiceVerdict({ ...CLEAN, aborted: "OPERATOR_SECOND_INTERRUPT", formatFailures: 1 }))
      .toEqual({ verdict: "ABORTED", exitCode: 50, reasons: ["ABORTED:OPERATOR_SECOND_INTERRUPT", "FORMAT_FAILED:1"] });
    expect(practiceVerdict({ ...CLEAN, aborted: "X", harnessError: "Y" }).verdict).toBe("HARNESS_ERROR");
  });
});

describe("practice gate status: the gate's own limit of calls at once", () => {
  it("reads max_concurrent_calls at the top level or under limits; null when absent or invalid", () => {
    expect(parseGateStatus("deepinfra", JSON.stringify({ state: "active", unsent_streak: 0, max_concurrent_calls: 10 })).maxConcurrentCalls).toBe(10);
    expect(parseGateStatus("anthropic", JSON.stringify({ state: "active", unsent_streak: 0, limits: { max_concurrent_calls: 2 } })).maxConcurrentCalls).toBe(2);
    expect(parseGateStatus("anthropic", JSON.stringify({ state: "active", unsent_streak: 0 })).maxConcurrentCalls).toBeNull();
    expect(parseGateStatus("anthropic", JSON.stringify({ state: "active", unsent_streak: 0, max_concurrent_calls: 0 })).maxConcurrentCalls).toBeNull();
  });
});

describe("practice gate brake: PROVIDER_ERROR_UNBILLED and calls at once", () => {
  const body = (model: string) => JSON.stringify({ model, max_tokens: 1, messages: [] });
  const execution = (model: string) => ({ operationId: "op", requestBody: body(model), requestSha256: "0".repeat(64), reservedUsd: "0.1" });

  it("the gate's PROVIDER_ERROR_UNBILLED (through the app's real port) counts in the run like 'not reached', never as busy", async () => {
    const folder = mkdtempSync(join(tmpdir(), "pp-err-"));
    const socket = join(folder, "gate.sock");
    let sent = 0;
    const server = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        sent += 1;
        response.writeHead(409, { "content-type": "application/json" }).end(JSON.stringify({ error: "PROVIDER_ERROR_UNBILLED" }));
      });
    });
    await new Promise<void>((done) => server.listen(socket, done));
    try {
      const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash"],
        premium_model_ids: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"],
        requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
        anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-unit" }))!;
      const observer = new PracticeGateObserver({ now: () => 0 });
      const watched = observer.wrap("anthropic", createPreviewBudgetRpcPort(config, socket));
      for (let index = 0; index < 4; index += 1) await expect(watched.execute(execution("claude-haiku-5-5"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
      await expect(watched.execute(execution("claude-haiku-5-5"))).rejects.toMatchObject({ code: PRACTICE_GATE_STOPPED });
      expect(sent).toBe(4);
      expect(observer.events.slice(0, 4).map((event) => event.unbilledKind)).toEqual(Array(4).fill("VENDOR_ERROR_UNBILLED"));
      expect(observer.summary("anthropic")).toMatchObject({ unbilled: 4, vendorErrorUnbilled: 4, notReached: 0, vendorRefused: 0,
        longestNotReachedRun: 4, stop: { reason: "NOT_REACHED_IN_A_ROW_4" } });
      expect(observer.modelsEndingBusy()).toEqual([]);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("under concurrency a call is only sent while the run plus the calls in flight stays under the brake", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const pending: ((fail: boolean) => void)[] = [];
    let sent = 0;
    const port: PreviewBudgetPort = { execute: () => new Promise((resolve, reject) => {
      sent += 1;
      pending.push((fail) => fail ? reject(new PreviewUnbilledRefusal()) : resolve({ status: 200, body: "{}" }));
    }) };
    const watched = observer.wrap("deepinfra", port);
    const settle = async (fail: boolean) => { pending.shift()!(fail); await new Promise((resolve) => setImmediate(resolve)); };
    // Two connection failures so far.
    const first = [watched.execute(execution("a")).catch(() => "x"), watched.execute(execution("b")).catch(() => "x")];
    await new Promise((resolve) => setImmediate(resolve));
    await settle(true); await settle(true);
    await Promise.all(first);
    // Run 2: two more may go at once (2 + 2 = 4, the brake); the third waits.
    const calls = [watched.execute(execution("a")).catch(() => "x"), watched.execute(execution("b")).catch(() => "x"),
      watched.execute(execution("c")).catch((error: unknown) => error)];
    await new Promise((resolve) => setImmediate(resolve));
    expect(sent).toBe(4);
    expect(observer.inFlight("deepinfra")).toBe(2);
    // Both in flight fail: the run reaches four, the brake stops the gate, and the waiting call is never sent.
    await settle(true); await settle(true);
    expect(await calls[2]).toMatchObject({ code: PRACTICE_GATE_STOPPED });
    expect(sent).toBe(4);
    expect(observer.summary("deepinfra")).toMatchObject({ longestNotReachedRun: 4, stop: { reason: "NOT_REACHED_IN_A_ROW_4" } });
  });

  it("the waiting call goes as soon as a call in flight comes back with an answer (the run resets)", async () => {
    const observer = new PracticeGateObserver({ unsentStreakAtStart: { deepinfra: 3 }, now: () => 0 });
    const pending: (() => void)[] = [];
    let sent = 0;
    const port: PreviewBudgetPort = { execute: () => new Promise((resolve) => {
      sent += 1;
      pending.push(() => resolve({ status: 200, body: "{}" }));
    }) };
    const watched = observer.wrap("deepinfra", port);
    const one = watched.execute(execution("a"));
    const two = watched.execute(execution("b"));
    await new Promise((resolve) => setImmediate(resolve));
    expect(sent).toBe(1); // 3 at the start + 1 in flight = 4: the second waits
    pending.shift()!();
    await one;
    await new Promise((resolve) => setImmediate(resolve));
    expect(sent).toBe(2);
    pending.shift()!();
    await two;
    expect(observer.stopped("deepinfra")).toBeNull();
  });
});

describe("practice concurrency", () => {
  it("a gate's semaphore never lets more than its limit through, in arrival order; an abort leaves the queue", async () => {
    const semaphore = new PracticeSemaphore(2);
    const order: number[] = [];
    const releases = await Promise.all([semaphore.acquire(), semaphore.acquire()]);
    const third = semaphore.acquire().then((release) => { order.push(3); return release; });
    const controller = new AbortController();
    const aborted = semaphore.acquire(controller.signal).catch(() => "aborted");
    const fifth = semaphore.acquire().then((release) => { order.push(5); return release; });
    expect(semaphore.held).toBe(2);
    controller.abort();
    expect(await aborted).toBe("aborted");
    releases[0]!();
    (await third)();
    releases[1]!();
    (await fifth)();
    expect(order).toEqual([3, 5]);
    expect(semaphore.most).toBe(2);
    expect(semaphore.held).toBe(0);
  });

  it("a limited port holds every semaphore it is given while the call runs, and gives them back when it fails too", async () => {
    const gate = new PracticeSemaphore(1);
    const overall = new PracticeSemaphore(3);
    let inside = 0;
    let most = 0;
    const port: PreviewBudgetPort = { async execute(input) {
      inside += 1; most = Math.max(most, inside);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inside -= 1;
      if (input.operationId === "fail") throw new Error("boom");
      return { status: 200, body: "{}" };
    } };
    const limited = limitPort(port, [gate, overall]);
    const run = (operationId: string) => limited.execute({ operationId, requestBody: "{}", requestSha256: "0".repeat(64), reservedUsd: "0" });
    await Promise.allSettled([run("a"), run("fail"), run("b")]);
    expect(most).toBe(1);
    expect(gate.held + overall.held).toBe(0);
  });

  it("the jittered gap stays within 75% to 125% of the gap", () => {
    expect(jitteredGap(1_000, () => 0)).toBe(750);
    expect(jitteredGap(1_000, () => 1)).toBe(1_250);
    expect(jitteredGap(0, () => 0.5)).toBe(0);
  });

  /** Fake jobs: each holds its model's slot until released by hand; records what was in flight at once. */
  function fakeJobs(models: readonly string[]) {
    const inFlight = new Map<string, number>();
    const mostByModel = new Map<string, number>();
    let now = 0;
    let most = 0;
    const started: string[] = [];
    const prepare = (model: string, job: number) => async () => {
      started.push(`${model}#${String(job)}`);
      inFlight.set(model, (inFlight.get(model) ?? 0) + 1);
      mostByModel.set(model, Math.max(mostByModel.get(model) ?? 0, inFlight.get(model)!));
      now += 1; most = Math.max(most, now);
      await new Promise((resolve) => setTimeout(resolve, model === models[0] ? 3 : 1));
      inFlight.set(model, inFlight.get(model)! - 1);
      now -= 1;
    };
    return { prepare, started, mostByModel, most: () => most };
  }

  it("parallel: every model at once, but never two calls of one model at once; each model's jobs keep their order", async () => {
    const models = ["glm", "haiku", "qwen"];
    const fake = fakeJobs(models);
    const gaps: number[] = [];
    await runModelQueues({ models, jobs: [1, 2, 3], parallel: true, gapMs: 1_000, prepare: fake.prepare,
      sleep: async (milliseconds) => { gaps.push(milliseconds); }, random: () => 0.5 });
    expect(fake.most()).toBe(3);
    expect([...fake.mostByModel.values()]).toEqual([1, 1, 1]);
    for (const model of models) expect(fake.started.filter((entry) => entry.startsWith(model))).toEqual([`${model}#1`, `${model}#2`, `${model}#3`]);
    // A gap before each model's calls but its first.
    expect(gaps).toEqual(Array(6).fill(1_000));
  });

  it("sequential: one call at a time, the models taking turns, job by job", async () => {
    const models = ["glm", "haiku"];
    const fake = fakeJobs(models);
    await runModelQueues({ models, jobs: [1, 2], parallel: false, gapMs: 0, prepare: fake.prepare, sleep: async () => undefined });
    expect(fake.most()).toBe(1);
    expect(fake.started).toEqual(["glm#1", "haiku#1", "glm#2", "haiku#2"]);
  });

  it("a skipped job costs no call and no gap", async () => {
    const gaps: number[] = [];
    const sent: number[] = [];
    await runModelQueues({ models: ["m"], jobs: [1, 2, 3, 4], parallel: true, gapMs: 100,
      prepare: (_model, job) => job === 2 || job === 3 ? null : async () => { sent.push(job); },
      sleep: async (milliseconds) => { gaps.push(milliseconds); }, random: () => 0.5 });
    expect(sent).toEqual([1, 4]);
    expect(gaps).toEqual([100]);
  });
});

describe("practice interrupt", () => {
  it("interrupts within two seconds of the first are the same interrupt; a later one quits", () => {
    let clock = 1_000;
    const gate = practiceInterruptGate({ now: () => clock });
    expect(gate.signal()).toBe("FIRST");
    clock += 5; expect(gate.signal()).toBe("REPEAT_IGNORED");
    clock += 1_990; expect(gate.signal()).toBe("REPEAT_IGNORED");
    clock += 5; expect(gate.signal()).toBe("QUIT");
    expect(gate.signal()).toBe("QUIT");
  });
  it("a stop signal within two seconds of the first interrupt is the same key press (pnpm sends its child SIGTERM on Ctrl-C)", () => {
    let clock = 0;
    const gate = practiceInterruptGate({ now: () => clock });
    expect(gate.justInterrupted()).toBe(false);
    gate.signal();
    clock += 1_500; expect(gate.justInterrupted()).toBe(true);
    clock += 600; expect(gate.justInterrupted()).toBe(false);
  });
  it("takes over SIGINT, SIGTERM and SIGHUP: a library's own listener (async-exit-hook's process.exit(130)) is removed, ours alone answers", () => {
    const target = new EventEmitter();
    const quits: string[] = [];
    // What embedded-postgres's async-exit-hook installs when it loads.
    const libraryExit = () => { quits.push("library exit 130"); };
    target.on("SIGINT", libraryExit);
    target.on("SIGTERM", libraryExit);
    target.on("exit", libraryExit);
    const heard: string[] = [];
    const handlers = { SIGINT: () => heard.push("SIGINT"), SIGTERM: () => heard.push("SIGTERM"), SIGHUP: () => heard.push("SIGHUP") };
    const signals = target as unknown as Parameters<typeof takeOverSignals>[0];
    expect(takeOverSignals(signals, handlers)).toEqual({ SIGINT: 1, SIGTERM: 1, SIGHUP: 0 });
    // Again (as the run starts): nothing new, ours not added twice.
    expect(takeOverSignals(signals, handlers)).toEqual({ SIGINT: 0, SIGTERM: 0, SIGHUP: 0 });
    target.emit("SIGINT"); target.emit("SIGTERM"); target.emit("SIGHUP");
    expect(heard).toEqual(["SIGINT", "SIGTERM", "SIGHUP"]);
    expect(quits).toEqual([]);
    // Its exit hook stays (the throwaway database is still stopped when the process ends).
    expect(target.listeners("exit")).toEqual([libraryExit]);
  });
});

describe("practice samples log", () => {
  const start: PracticeLogLine = { kind: "start", schema: "preview-practice-samples-v1", mode: "formats", startedAt: "2026-10-12T00:00:00.000Z",
    models: ["glm", "haiku"], lanes: ["PANEL"], samples: 2, parallel: true, unsentStreakAtStart: { deepinfra: 0, anthropic: 0 },
    remainingBefore: { deepinfra: null, anthropic: null } };
  const sample = (model: string, sampleNo: number, status: PracticeSample["status"], replyText: string | null = null): PracticeSample => ({
    model, providerRef: `preview:${model}`, gate: model === "haiku" ? "anthropic" : "deepinfra", lane: "PANEL", sample: sampleNo,
    questionId: "en", status, latencyMs: 1_000, attempts: [{ callSiteKey: "PANEL:x", outcome: "OK", parseStatus: status === "PARSED" ? "PARSED" : "SCHEMA_FAILED", latencyMs: 1_000 }],
    inputTokens: 10, outputTokens: 5, costNanoUsd: "100", unbilledRefusals: 0, issues: replyText === null ? [] : ["invalid_type@x"],
    recheckIssues: [], errorCode: null, replyText, detail: null });
  const wire = (seq: number, model: string) => ({ kind: "wire", event: { seq, gate: model === "haiku" ? "anthropic" : "deepinfra", model,
    startedAt: "2026-10-12T00:00:01.000Z", latencyMs: 1_000, outcome: "VENDOR_OK", vendorStatus: 200, refusalCode: null, concurrencyLimit: false,
    unbilledKind: null, inputTokens: 10, outputTokens: 5, reasoningTokens: null } }) as PracticeLogLine;
  const folders: string[] = [];
  const folder = () => { const made = mkdtempSync(join(tmpdir(), "pp-log-")); folders.push(made); return made; };
  afterEach(() => { for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true }); });

  it("appends each line at once and rebuilds the run's own report from the lines alone", () => {
    const directory = folder();
    const log = PracticeSampleLog.create(directory);
    log.append(start);
    log.append(wire(1, "glm"));
    log.append({ kind: "sample", sample: sample("glm", 1, "PARSED") });
    // Readable on the disk before the run ends.
    expect(readPracticeSampleLog(directory).filter((line) => line.kind === "sample")).toHaveLength(1);
    log.append(wire(2, "haiku"));
    log.append({ kind: "sample", sample: sample("haiku", 1, "SCHEMA_FAILED", "{\"x\":\"high\"}") });
    log.append({ kind: "end", finishedAt: "2026-10-12T00:10:00.000Z", interrupted: false, remainingAfter: { deepinfra: null, anthropic: null } });
    log.close();
    const report = practiceReportFromLog(readPracticeSampleLog(directory)) as unknown as {
      verdict: string; exitCode: number; reasons: string[]; totals: { samples: number }; failures: PracticeSample[];
      gates: Record<string, { observed: { calls: number } }>; plannedSamples: number; wallSeconds: number };
    expect(report).toMatchObject({ verdict: "FAIL", exitCode: 20, totals: { samples: 2 }, plannedSamples: 4, wallSeconds: 600 });
    expect(report.reasons[0]).toBe("FORMAT_FAILED:1");
    expect(report.failures.map((failure) => failure.replyText)).toEqual(["{\"x\":\"high\"}"]);
    expect(report.gates.deepinfra!.observed.calls).toBe(1);
    expect(report.gates.anthropic!.observed.calls).toBe(1);
  });

  it("an aborted run (or one killed outright, with no end line) is ABORTED (exit 50) with every finished sample", () => {
    const lines: PracticeLogLine[] = [start, wire(1, "glm"), { kind: "sample", sample: sample("glm", 1, "PARSED") },
      { kind: "abort", at: "2026-10-12T00:05:00.000Z", code: "OPERATOR_SECOND_INTERRUPT" }];
    const aborted = practiceReportFromLog(lines) as unknown as { verdict: string; exitCode: number; reasons: string[]; totals: { samples: number } };
    expect(aborted).toMatchObject({ verdict: "ABORTED", exitCode: 50, totals: { samples: 1 } });
    expect(aborted.reasons[0]).toBe("ABORTED:OPERATOR_SECOND_INTERRUPT");
    const killed = practiceReportFromLog(lines.slice(0, 3)) as unknown as { reasons: string[]; exitCode: number };
    expect(killed.exitCode).toBe(50);
    expect(killed.reasons[0]).toBe(`ABORTED:${PRACTICE_LOG_HAS_NO_END}`);
  });

  it("an interrupted run that ended its log is NOT_PROVEN with the samples it finished", () => {
    const lines: PracticeLogLine[] = [start, wire(1, "glm"), { kind: "sample", sample: sample("glm", 1, "PARSED") },
      { kind: "stop", stop: { gate: "deepinfra", reason: "OPERATOR_INTERRUPT", atSeq: 1 } },
      { kind: "stop", stop: { gate: "anthropic", reason: "OPERATOR_INTERRUPT", atSeq: 1 } },
      { kind: "sample", sample: { ...sample("haiku", 1, "PARSED"), status: "SKIPPED_GATE_STOPPED", attempts: [] } },
      { kind: "end", finishedAt: "2026-10-12T00:05:00.000Z", interrupted: true, remainingAfter: { deepinfra: null, anthropic: null } }];
    const report = practiceReportFromLog(lines) as unknown as { verdict: string; reasons: string[] };
    expect(report.verdict).toBe("NOT_PROVEN");
    expect(report.reasons).toContain("RUN_INTERRUPTED");
    expect(report.reasons).toContain("MODEL_NOT_EXERCISED:haiku");
  });

  it("a last line cut short is left out; any other unreadable line, or a log without its start line, refuses", () => {
    const text = [start, wire(1, "glm")].map((line) => JSON.stringify(line)).join("\n");
    expect(parsePracticeSampleLog(`${text}\n{"kind":"sam`)).toHaveLength(2);
    expect(() => parsePracticeSampleLog(`${text}\n{"kind":"sam\n${JSON.stringify(wire(2, "glm"))}\n`)).toThrow("PRACTICE_SAMPLES_LOG_INVALID");
    expect(() => parsePracticeSampleLog(`${JSON.stringify(wire(1, "glm"))}\n`)).toThrow("PRACTICE_SAMPLES_LOG_INVALID");
  });

  it("refuses a folder that already holds a samples log (another run's), and leaves it as it was", () => {
    const directory = folder();
    writeFileSync(join(directory, "samples.jsonl"), `${JSON.stringify(start)}\n`);
    appendFileSync(join(directory, "samples.jsonl"), `${JSON.stringify(wire(1, "glm"))}\n`);
    expect(() => PracticeSampleLog.create(directory)).toThrow("PRACTICE_OUT_ALREADY_HOLDS_SAMPLES");
    expect(readPracticeSampleLog(directory)).toHaveLength(2);
  });
});

describe("practice formats: a busy model waits out its cool-off and retries the same job", () => {
  it("the wait: the gate's retry_after when it gave one, else 60 s doubling to at most 600 s (the gate's own steps); never shorter, at most a quarter longer", () => {
    expect(practiceBusyWaitMs({ retryAfterSeconds: 60, waitsInARow: 0, random: () => 0 })).toBe(60_000);
    expect(practiceBusyWaitMs({ retryAfterSeconds: 60, waitsInARow: 3, random: () => 1 })).toBe(75_000);
    expect([0, 1, 2, 3, 4].map((waitsInARow) => practiceBusyWaitMs({ retryAfterSeconds: null, waitsInARow, random: () => 0 })))
      .toEqual([60_000, 120_000, 240_000, 480_000, 600_000]);
    expect(practiceBusyWaitMs({ retryAfterSeconds: null, waitsInARow: 0, random: () => 1 })).toBe(75_000);
    expect(practiceBusyWaitMs({ retryAfterSeconds: null, waitsInARow: 3, random: () => 1 })).toBe(600_000);
    expect(practiceBusyWaitMs({ retryAfterSeconds: null, waitsInARow: 9, random: () => 1 })).toBe(600_000);
  });

  it("parallel: only the busy model is parked; the others finish their jobs while it waits; then the SAME job is retried", async () => {
    const started: string[] = [];
    let release: (() => void) | null = null;
    const waits: number[] = [];
    let busyOnce = true;
    const run = runModelQueues({ models: ["glm", "haiku"], jobs: [1, 2], parallel: true, gapMs: 0,
      prepare: (model, job) => async () => {
        started.push(`${model}#${String(job)}`);
        if (model === "glm" && job === 1 && busyOnce) { busyOnce = false; return { retryAfterMs: 5_000 }; }
        return undefined;
      },
      sleep: (milliseconds) => { waits.push(milliseconds); return new Promise<void>((resolve) => { release = resolve; }); } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    // GLM waits; Haiku did both its jobs meanwhile.
    expect(waits).toEqual([5_000]);
    expect(started).toEqual(["glm#1", "haiku#1", "haiku#2"]);
    release!();
    await run;
    expect(started).toEqual(["glm#1", "haiku#1", "haiku#2", "glm#1", "glm#2"]);
  });

  it("sequential: the parked model gives up its turns until its wait is over; the others go on", async () => {
    let clock = 0;
    const started: string[] = [];
    let busyOnce = true;
    await runModelQueues({ models: ["glm", "haiku"], jobs: [1, 2], parallel: false, gapMs: 0, now: () => clock,
      prepare: (model, job) => async () => {
        started.push(`${model}#${String(job)}`);
        if (model === "glm" && job === 1 && busyOnce) { busyOnce = false; return { retryAfterMs: 5_000 }; }
        return undefined;
      },
      sleep: async (milliseconds) => { clock += milliseconds; } });
    expect(started).toEqual(["glm#1", "haiku#1", "haiku#2", "glm#1", "glm#2"]);
    expect(clock).toBe(5_000);
  });

  it("an interrupt cancels a wait at once (the waits are abortable), and the job is then prepared again (and skipped)", async () => {
    const controller = new AbortController();
    const prepared: string[] = [];
    const run = runModelQueues({ models: ["glm"], jobs: [1], parallel: true, gapMs: 0, signal: controller.signal,
      prepare: (model, job) => {
        prepared.push(`${model}#${String(job)}`);
        if (controller.signal.aborted) return null;
        return async () => ({ retryAfterMs: 600_000 });
      },
      sleep: () => new Promise<void>(() => undefined) });
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await run;
    expect(prepared).toEqual(["glm#1", "glm#1"]);
  });
});

describe("practice formats: busy retries end to end (unit, fake waits)", () => {
  const FIVE = ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"];
  const GLM = FIVE[0]!;
  const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", free_model_ids: FIVE.slice(0, 2),
    premium_model_ids: FIVE, requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-unit" }))!;
  const configured = PREVIEW_REVIEWED_PROVIDER_REFS.map((providerRef) => {
    const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
    return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
  });
  const targets = onePerModel(parseProviderDiscoveryTargets(JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)), configured), FIVE);
  const policy = previewRunnerPolicy({ bounds: DEVELOPMENT_ORGAN_COST_BOUNDS.organs,
    synthesisRolePolicy: { synthesizerBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.COMPOSER, evaluatorBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.CONFORMANCE } }, config);
  const pack = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
  const bounds = { judge: policy.bounds.JUDGE, synthesizer: policy.synthesisRolePolicy.synthesizerBound, evaluator: policy.synthesisRolePolicy.evaluatorBound };
  /** GLM refused as busy for its first `refusals` calls (vendor 429, or the gate's cool-off), then answered. */
  function ports(observer: PracticeGateObserver, refusals: number, cooling = false) {
    let glmCalls = 0;
    const port = (provider: "deepinfra" | "anthropic"): PreviewBudgetPort => ({ async execute(input) {
      const model = String((JSON.parse(input.requestBody) as { model: unknown }).model);
      if (model === GLM && glmCalls++ < refusals) throw cooling ? new PreviewModelCooling(90) : new PreviewVendorRefusedUnbilled();
      return { status: 200, body: stubVendorReply(provider, model, "{}", "unit") };
    } });
    return { deepinfra: observer.wrap("deepinfra", port("deepinfra")), anthropic: observer.wrap("anthropic", port("anthropic")) };
  }

  it("GLM busy twice (each time after its resend), then answers: every GLM job is done, never skipped, never busy at the end", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const waits: { model: string; lane: string; sample: number; waitMs: number; reason: string }[] = [];
    const resumes: string[] = [];
    const result = await runPracticeFormats({ config, targets, ports: ports(observer, 4), observer, lanes: ["JUDGE_POSITION", "PANEL"], samples: 1,
      gapMs: 0, pack, bounds, sleep: async () => undefined, parallel: true, busyWaitMs: 30 * 60_000, random: () => 0,
      onBusyWait: (line) => waits.push(line), onResume: (line) => resumes.push(`${line.model}|${line.lane}`) });
    expect(result.busyModels).toEqual([]);
    const glm = result.samples.filter((sample) => sample.model === GLM);
    expect(glm.map((sample) => sample.lane)).toEqual(["JUDGE_POSITION", "PANEL"]);
    expect(glm.some((sample) => sample.status.startsWith("SKIPPED") || sample.status === "UNBILLED_REFUSED")).toBe(false);
    expect(waits.map((wait) => [wait.lane, wait.waitMs, wait.reason])).toEqual([["JUDGE_POSITION", 60_000, "VENDOR_REFUSED"], ["JUDGE_POSITION", 120_000, "VENDOR_REFUSED"]]);
    expect(resumes).toEqual([`${GLM}|JUDGE_POSITION`, `${GLM}|JUDGE_POSITION`]);
  });

  it("a cooling model waits the gate's retry_after", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const waits: { waitMs: number; reason: string }[] = [];
    await runPracticeFormats({ config, targets: targets.filter((target) => target.model === GLM), ports: ports(observer, 2, true), observer,
      lanes: ["JUDGE_POSITION"], samples: 1, gapMs: 0, pack, bounds, sleep: async () => undefined, parallel: true,
      busyWaitMs: 30 * 60_000, random: () => 0, onBusyWait: (line) => waits.push(line) });
    expect(waits.map((wait) => [wait.waitMs, wait.reason])).toEqual([[90_000, "MODEL_COOLING"]]);
  });

  it("busy past the budget: the waits add up to the budget exactly, then the rest are skipped (the old rule)", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const waits: number[] = [];
    const result = await runPracticeFormats({ config, targets: targets.filter((target) => target.model === GLM), ports: ports(observer, 1_000), observer,
      lanes: ["JUDGE_POSITION", "PANEL"], samples: 1, gapMs: 0, pack, bounds, sleep: async () => undefined, parallel: true,
      busyWaitMs: 10 * 60_000, random: () => 0, onBusyWait: (line) => waits.push(line.waitMs) });
    expect(waits).toEqual([60_000, 120_000, 240_000, 180_000]);
    expect(result.busyModels).toEqual([GLM]);
    expect(result.samples.map((sample) => sample.status)).toEqual(["UNBILLED_REFUSED", "SKIPPED_MODEL_BUSY"]);
  });

  it("a budget of 0 is the old rule: no wait, skipped at once", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const waits: number[] = [];
    const result = await runPracticeFormats({ config, targets: targets.filter((target) => target.model === GLM), ports: ports(observer, 1_000), observer,
      lanes: ["JUDGE_POSITION", "PANEL"], samples: 1, gapMs: 0, pack, bounds, sleep: async () => undefined, parallel: true,
      busyWaitMs: 0, onBusyWait: (line) => waits.push(line.waitMs) });
    expect(waits).toEqual([]);
    expect(result.samples.map((sample) => sample.status)).toEqual(["UNBILLED_REFUSED", "SKIPPED_MODEL_BUSY"]);
  });
});

describe("practice report: busy waits per model", () => {
  const start: PracticeLogLine = { kind: "start", schema: "preview-practice-samples-v1", mode: "formats", startedAt: "2026-10-12T00:00:00.000Z",
    models: ["glm", "haiku"], lanes: ["PANEL"], samples: 1, parallel: true, unsentStreakAtStart: { deepinfra: 0, anthropic: 0 },
    remainingBefore: { deepinfra: null, anthropic: null } };
  const sample = (model: string, status: PracticeSample["status"]): PracticeSample => ({
    model, providerRef: `preview:${model}`, gate: model === "haiku" ? "anthropic" : "deepinfra", lane: "PANEL", sample: 1,
    questionId: "en", status, latencyMs: 1_000, attempts: status === "PARSED" ? [{ callSiteKey: "PANEL:x", outcome: "OK", parseStatus: "PARSED", latencyMs: 1_000 }] : [],
    inputTokens: null, outputTokens: null, costNanoUsd: null, unbilledRefusals: 0, issues: [], recheckIssues: [], errorCode: null, replyText: null, detail: null });
  const end: PracticeLogLine = { kind: "end", finishedAt: "2026-10-12T00:30:00.000Z", interrupted: false, remainingAfter: { deepinfra: null, anthropic: null } };
  const wait = (waitMs: number): PracticeLogLine => ({ kind: "busy-wait", model: "glm", lane: "PANEL", sample: 1, wait: 1, waitMs, reason: "VENDOR_REFUSED", retryAfterSeconds: null });
  const resume: PracticeLogLine = { kind: "resume", model: "glm", lane: "PANEL", sample: 1, waitedMs: 120_000, cancelled: false };

  it("a model that recovered and did all its jobs is not NOT_PROVEN; the report shows its waits", () => {
    const report = practiceReportFromLog([start, wait(120_000), resume, wait(240_000), resume,
      { kind: "sample", sample: sample("glm", "PARSED") }, { kind: "sample", sample: sample("haiku", "PARSED") }, end]) as unknown as {
      verdict: string; busyByModel: Record<string, { waits: number; totalWaitMs: number; recovered: boolean; gaveUp: boolean }> };
    expect(report.verdict).toBe("PASS");
    expect(report.busyByModel).toEqual({ glm: { waits: 2, totalWaitMs: 360_000, recovered: true, gaveUp: false } });
  });

  it("a model that gave up after its waits is NOT_PROVEN, not recovered", () => {
    const report = practiceReportFromLog([start, wait(120_000), resume, { kind: "busy", model: "glm" },
      { kind: "sample", sample: sample("glm", "UNBILLED_REFUSED") }, { kind: "sample", sample: sample("haiku", "PARSED") }, end]) as unknown as {
      verdict: string; reasons: string[]; busyByModel: Record<string, { recovered: boolean; gaveUp: boolean }> };
    expect(report.verdict).toBe("NOT_PROVEN");
    expect(report.reasons).toContain("MODEL_BUSY:glm");
    expect(report.busyByModel.glm).toMatchObject({ recovered: false, gaveUp: true });
  });
});

/*
 * Parallel AI calls (spec 2026-10-12, plan Task 14): the debate practice can be given the call-concurrency setting on
 * the command line (never written to any register), and its report shows how many calls really went at once, how long
 * calls waited for a slot, each gate's slots as read at the start, and each model's busy probes.
 */
describe("practice debate: --call-concurrency and the parallel stats", () => {
  it("reads <perDebate>/<perModelPerDebate>/<vendor>=<n>,… into the register's policy, and writes it back the same way", () => {
    const policy = parsePracticeCallConcurrency("12/3/default=50,deepinfra=150,anthropic=50");
    expect(policy).toEqual({ perDebate: 12, perModelPerDebate: 3, perModelPerRunner: { default: 50, deepinfra: 150, anthropic: 50 } });
    expect(formatPracticeCallConcurrency(policy)).toBe("12/3/default=50,deepinfra=150,anthropic=50");
    expect(parsePracticeCallConcurrency("1/1/default=1")).toEqual({ perDebate: 1, perModelPerDebate: 1, perModelPerRunner: { default: 1 } });
    expect(parsePracticeCallConcurrency("64/16/deepinfra=1000,default=1000").perModelPerRunner).toEqual({ deepinfra: 1000, default: 1000 });
    // The default is always written first.
    expect(formatPracticeCallConcurrency(parsePracticeCallConcurrency("2/1/deepinfra=9,default=3"))).toBe("2/1/default=3,deepinfra=9");
  });

  it("refuses every other form (PRACTICE_FLAG_VALUE_INVALID), the register's bounds included", () => {
    for (const text of ["", "12/3", "12/3/default=50/4", "0/3/default=50", "65/3/default=50", "12/0/default=50", "12/17/default=50",
      "12/3/deepinfra=150", "12/3/default=0", "12/3/default=1001", "12/3/default=50,default=60", "12/3/Default=50",
      "12/3/default=5x", "12/ 3/default=50", "1.5/3/default=50", "012/3/default=50", "+12/3/default=50", "12/3/default=50,",
      "12/3/default", "12/3/default==50", "12/3/=50,default=1", "1e1/3/default=50", "12/3/default=-1"]) {
      let caught: unknown = null;
      try { parsePracticeCallConcurrency(text); } catch (error) { caught = error; }
      expect(caught, text).toBeInstanceOf(PracticeRefusal);
      expect((caught as PracticeRefusal).code, text).toBe("PRACTICE_FLAG_VALUE_INVALID");
    }
  });

  it("the command takes the flag in debate mode, refuses a bad value before anything is read or sent, and refuses it in formats mode", async () => {
    expect(parsePracticeArgs(["debate", "--call-concurrency", "12/3/default=50"]).flags.get("--call-concurrency")).toBe("12/3/default=50");
    for (const argv of [["debate", "--call-concurrency", "0/3/default=50"], ["formats", "--call-concurrency", "12/3/default=50"]]) {
      const out = mkdtempSync(join(tmpdir(), "practice-cc-"));
      try {
        // No socket, no acknowledgement, no settings file: the refusal comes first.
        const result = await runPractice([...argv, "--out", join(out, "report")], {}, { log: () => undefined });
        expect(result.report.verdict, argv.join(" ")).toBe("HARNESS_ERROR");
        expect(result.report.reasons, argv.join(" ")).toEqual(["HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID"]);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    }
  });

  it("the composition takes the flag's policy as it is, else the imported register's row (one at a time when absent); the debate passes it on", () => {
    const composition = readFileSync(new URL("../../tools/preview-practice/practice-runner-composition.ts", import.meta.url), "utf8");
    expect(composition).toMatch(/input\.callConcurrency\s*\?\?\s*effectiveCallConcurrency\(await readCallConcurrencyPolicy\(pool, environment\.REGISTER_VERSION\)/u);
    const debate = readFileSync(new URL("../../tools/preview-practice/practice-debate.ts", import.meta.url), "utf8");
    expect(debate).toMatch(/callConcurrency: input\.callConcurrency/u);
    const command = readFileSync(new URL("../../tools/preview-practice/practice.ts", import.meta.url), "utf8");
    expect(command).toMatch(/parsePracticeCallConcurrency\(/u);
  });

  it("counts the lanes' calls, each gate's slots as read at the start (an unread gate runs at 1 slot), and each model's busy probes", async () => {
    const stats = new PracticeCallStats();
    stats.noteRegisterRow({ state: "ABSENT" });
    const policy = parsePracticeCallConcurrency("4/2/default=50");
    const scheduler = stats.observeScheduler(createCallScheduler({ policy }));
    stats.notePolicy(policy, "REGISTER");
    await applyPreviewGateCapacities({ scheduler, log: stats.gateCapacityLog, gates: [
      { gate: "deepinfra", remaining: async () => ({ maxConcurrentCalls: 4 }) as never },
      { gate: "anthropic", remaining: async () => { throw new Error("socket gone"); } }
    ] });
    const lane = scheduler.openLane("run-1");
    const gates: Array<() => void> = [];
    const hold = () => new Promise<void>((resolve) => { gates.push(resolve); });
    const subject = { model: "glm", vendor: "deepinfra", gate: "deepinfra", priority: "PANEL" as const };
    const calls = [lane.run(subject, hold), lane.run(subject, hold), lane.run({ ...subject, model: "haiku", vendor: "anthropic", gate: "anthropic" }, hold)];
    await Promise.resolve();
    expect(gates).toHaveLength(3);
    for (const release of gates) release();
    await Promise.all(calls);
    lane.close();
    const busy = stats.observeBusy(createPreviewBusyCoordinator());
    expect(await busy.refusedBusy("glm", undefined)).toBe("PROBE");
    const waiter = busy.refusedBusy("glm", undefined);
    busy.probeOutcome("glm", "ANSWERED");
    expect(await waiter).toBe("RESEND");
    expect(await busy.refusedBusy("glm", undefined)).toBe("PROBE");
    const summary = stats.summary();
    expect(summary).toMatchObject({
      setting: "4/2/default=50", source: "REGISTER", registerRow: "ABSENT",
      gateSlotsAtStart: { deepinfra: { slots: 4, read: true }, anthropic: { slots: 1, read: false } },
      lanes: 1, calls: 3, peakInFlight: 3, peakByModel: { glm: 2, haiku: 1 },
      peakByGate: { deepinfra: 2, anthropic: 1 }, busyProbesByModel: { glm: 2 }
    });
    expect(Object.keys(summary.waitedMsByModel).sort()).toEqual(["glm", "haiku"]);
  });

  it("the report block from lane stats: peaks are the highest, waits and calls add up, waits in whole milliseconds", () => {
    const block = practiceParallelBlock({
      policy: parsePracticeCallConcurrency("12/3/default=50,deepinfra=150,anthropic=50"), source: "FLAG", registerRow: null,
      gateSlotsAtStart: { deepinfra: { slots: 6, read: true }, anthropic: { slots: 1, read: false } },
      lanes: [
        { running: 0, heldBack: 0, peakInFlight: 5, peakByModel: { glm: 3, haiku: 1 }, waitedMsByModel: { glm: 1200.4, haiku: 0.2 }, calls: 40 },
        { running: 0, heldBack: 0, peakInFlight: 2, peakByModel: { glm: 1, qwen: 2 }, waitedMsByModel: { glm: 100.3, qwen: 7.6 }, calls: 3 }
      ],
      scheduler: { peakByGate: { deepinfra: 6, anthropic: 1 }, peakByModel: { glm: 3 } },
      busyProbesByModel: { glm: 1 }
    });
    expect(block).toEqual({
      setting: "12/3/default=50,deepinfra=150,anthropic=50", source: "FLAG", registerRow: null,
      gateSlotsAtStart: { deepinfra: { slots: 6, read: true }, anthropic: { slots: 1, read: false } },
      lanes: 2, calls: 43, peakInFlight: 5, peakByModel: { glm: 3, haiku: 1, qwen: 2 },
      waitedMsByModel: { glm: 1301, haiku: 0, qwen: 8 }, peakByGate: { deepinfra: 6, anthropic: 1 }, busyProbesByModel: { glm: 1 }
    });
    // No lane (the ask was refused): the setting and the gates' slots are still reported.
    expect(practiceParallelBlock({ policy: parsePracticeCallConcurrency("1/1/default=1000"), source: "REGISTER", registerRow: "ABSENT",
      gateSlotsAtStart: {}, lanes: [], scheduler: { peakByGate: {}, peakByModel: {} }, busyProbesByModel: {} }))
      .toMatchObject({ lanes: 0, calls: 0, peakInFlight: 0, peakByModel: {}, waitedMsByModel: {} });
  });

  it("the debate report carries the block, and its summary says it in plain words (an unread gate named as running at 1 slot)", () => {
    const parallel = practiceParallelBlock({
      policy: parsePracticeCallConcurrency("12/3/default=50,deepinfra=150,anthropic=50"), source: "FLAG", registerRow: null,
      gateSlotsAtStart: { deepinfra: { slots: 6, read: true }, anthropic: { slots: 1, read: false } },
      lanes: [{ running: 0, heldBack: 0, peakInFlight: 5, peakByModel: { glm: 3 }, waitedMsByModel: { glm: 12_400 }, calls: 40 }],
      scheduler: { peakByGate: { deepinfra: 6, anthropic: 1 }, peakByModel: { glm: 3 } },
      busyProbesByModel: { glm: 2 }
    });
    const none = { before: null, after: null };
    const result = {
      register: null, questionId: "ro", depth: 1,
      admission: { admitted: true, refusalCode: null, panel: [], satOut: [], rotation: null },
      run: { runId: "r", workItemOutcome: "COMPLETED", failureCode: null,
        answer: { served: true, terminal: "SERVED", serveState: null, verdictState: null, conditionMarks: [] },
        story: { outcome: "READY", failureCode: null } },
      byModelAndSite: [], probes: [], failures: [], formatFailures: 0, callsByModel: {}, answersByModel: {}, jsonRepairs: [],
      failedCalls: 0, refusedCalls: 0, remaining: { deepinfra: none, anthropic: none }, seconds: { admission: 1, debate: 2 },
      parallel
    } as unknown as PracticeDebateResult;
    const report = debateReport({ result, observer: new PracticeGateObserver(), startedAt: new Date(0), finishedAt: new Date(1_000) });
    expect(report.parallel).toEqual(parallel);
    const text = reportMarkdown(report);
    expect(text).toContain("Calls at once");
    expect(text).toContain("12/3/default=50,deepinfra=150,anthropic=50 (from --call-concurrency)");
    expect(text).toContain("- deepinfra gate: 6 slots, read from the gate at the start");
    expect(text).toContain("- anthropic gate: could not be read at the start, so it ran with 1 slot");
    expect(text).toContain("most calls at once in the debate: 5");
    expect(text).toContain("glm: most at once 3, waited for a slot 12.4 s in all, busy probes 2");
    expect(text).toContain("most calls at once through each gate: deepinfra 6, anthropic 1");
    // The register's own setting, and the register with no row.
    const fromRegister = reportMarkdown({ ...report, parallel: { ...parallel, source: "REGISTER", registerRow: "ABSENT", setting: "1/1/default=1000" } });
    expect(fromRegister).toContain("1/1/default=1000 (the register has no call-concurrency row: one call at a time)");
    const setRow = reportMarkdown({ ...report, parallel: { ...parallel, source: "REGISTER", registerRow: "SET" } });
    expect(setRow).toContain("(from the register's call-concurrency row)");
  });
});
