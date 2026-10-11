// The preview practice tool's pure rules (tools/preview-practice): the verdict and its exit codes, the redaction of
// reply text, the gate brake (stop after four unbilled refusals in a row, or once the day's count reaches twelve), the
// busy-model skip of the formats mode, and the start refusals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS,
  PreviewGateUnavailable,
  PreviewUnbilledRefusal,
  parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets,
  previewModelRow,
  previewRunnerPolicy,
  previewTargetJsonRow,
  type PreviewBudgetPort
} from "@debateai/providers";
import { loadStoryPack, resolveStoryPackDir } from "@debateai/story";
import { DEVELOPMENT_ORGAN_COST_BOUNDS } from "../../apps/runner/src/dev-deployment-register.js";
import { PracticeGateObserver, PRACTICE_GATE_STOPPED, practiceStopIsBusyPause, vendorUsage } from "../../tools/preview-practice/practice-gate-observer.js";
import { onePerModel, practiceTurnOrder, runPracticeFormats } from "../../tools/preview-practice/practice-formats.js";
import { stubVendorReply } from "../support/preview-gate-stubs.js";
import { issueListFromParseError, recheckReply, replyContentOf, callFamilyOf } from "../../tools/preview-practice/practice-lanes.js";
import { capReplyText, redactKeyShapes, reportableReplyText } from "../../tools/preview-practice/practice-redaction.js";
import { parsePracticeRegisterExport } from "../../tools/preview-practice/practice-register-import.js";
import { assertOutsideRepository } from "../../tools/preview-practice/practice-report.js";
import {
  assertGateStatusAllowsPractice,
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
  it("NOT_PROVEN (30) for a gate the brake paused for busy refusals only; FAIL for any other brake stop", () => {
    expect(practiceVerdict({ ...CLEAN, gateBusyPauses: ["deepinfra:UNBILLED_IN_A_ROW_4"] }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["GATE_PAUSED_BUSY:deepinfra:UNBILLED_IN_A_ROW_4"] });
    expect(practiceStopIsBusyPause({ gate: "deepinfra", reason: "UNBILLED_IN_A_ROW_4", atSeq: 4 })).toBe(true);
    expect(practiceStopIsBusyPause({ gate: "deepinfra", reason: "UNBILLED_TODAY_12", atSeq: 4 })).toBe(true);
    expect(practiceStopIsBusyPause({ gate: "deepinfra", reason: "GATE_REFUSED_DAILY_COST_ENVELOPE_REACHED", atSeq: 1 })).toBe(false);
    expect(practiceStopIsBusyPause(null)).toBe(false);
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
  function scriptedPort(steps: ("OK" | "UNBILLED" | "INFLIGHT" | "DAILY" | "HALTED")[]) {
    let sent = 0;
    const port: PreviewBudgetPort = {
      async execute() {
        const step = steps[sent] ?? "OK";
        sent += 1;
        if (step === "UNBILLED") throw new PreviewUnbilledRefusal();
        // The gate's own CONCURRENCY_LIMIT_REACHED, as previewAuthorityRefusal maps it.
        if (step === "INFLIGHT") throw new PreviewUnbilledRefusal("Private preview gate is at its limit of calls in flight");
        if (step === "DAILY") throw new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "day");
        if (step === "HALTED") throw new PreviewGateUnavailable();
        return { status: 200, body: JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 4 } }) };
      }
    };
    return { port, sent: () => sent };
  }
  it("stops a gate after FOUR unbilled refusals in a row (the gate halts at five) and never sends to it again", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const gate = scriptedPort(["UNBILLED", "UNBILLED", "UNBILLED", "UNBILLED", "OK"]);
    const watched = observer.wrap("deepinfra", gate.port);
    for (let index = 0; index < 3; index += 1) await expect(watched.execute(execution("m"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    expect(observer.stopped("deepinfra")).toBeNull();
    await expect(watched.execute(execution("m"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    await expect(watched.execute(execution("m"))).rejects.toMatchObject({ code: PRACTICE_GATE_STOPPED });
    expect(gate.sent()).toBe(4);
    expect(observer.summary("deepinfra")).toMatchObject({ calls: 4, unbilled: 4, maxConsecutiveUnbilled: 4, stoppedLocally: 1,
      stop: { reason: "UNBILLED_IN_A_ROW_4" } });
    expect(observer.stopped("anthropic")).toBeNull();
  });
  it("three in a row then an answer resets the run: no stop", async () => {
    const observer = new PracticeGateObserver();
    const gate = scriptedPort(["UNBILLED", "UNBILLED", "UNBILLED", "OK", "UNBILLED", "UNBILLED", "UNBILLED", "OK"]);
    const watched = observer.wrap("anthropic", gate.port);
    for (const expected of ["refused", "refused", "refused", "ok", "refused", "refused", "refused", "ok"]) {
      if (expected === "ok") await expect(watched.execute(execution("m"))).resolves.toMatchObject({ status: 200 });
      else await expect(watched.execute(execution("m"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    }
    expect(observer.stopped("anthropic")).toBeNull();
    expect(observer.summary("anthropic")).toMatchObject({ calls: 8, vendorOk: 2, unbilled: 6, maxConsecutiveUnbilled: 3 });
  });
  it("the gate's own in-flight limit moves neither count (the gate refuses it before reserving anything)", async () => {
    const observer = new PracticeGateObserver({ unbilledTodayAtStart: { deepinfra: 11 } });
    const gate = scriptedPort(["INFLIGHT", "INFLIGHT", "INFLIGHT", "INFLIGHT", "INFLIGHT", "OK"]);
    const watched = observer.wrap("deepinfra", gate.port);
    for (let index = 0; index < 5; index += 1) await expect(watched.execute(execution("m"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    await expect(watched.execute(execution("m"))).resolves.toMatchObject({ status: 200 });
    expect(observer.stopped("deepinfra")).toBeNull();
    expect(observer.summary("deepinfra")).toMatchObject({ unbilled: 5, concurrencyLimit: 5, maxConsecutiveUnbilled: 0, unbilledCounted: 0 });
  });
  it("stops a gate once root's count at the start plus the refusals seen reach twelve (the next would pass twelve)", async () => {
    const observer = new PracticeGateObserver({ unbilledTodayAtStart: { deepinfra: 9 } });
    const gate = scriptedPort(["UNBILLED", "OK", "UNBILLED", "OK", "UNBILLED", "OK"]);
    const watched = observer.wrap("deepinfra", gate.port);
    await expect(watched.execute(execution("a"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    await expect(watched.execute(execution("b"))).resolves.toMatchObject({ status: 200 });
    await expect(watched.execute(execution("a"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    await expect(watched.execute(execution("b"))).resolves.toMatchObject({ status: 200 });
    expect(observer.stopped("deepinfra")).toBeNull();
    await expect(watched.execute(execution("a"))).rejects.toBeInstanceOf(PreviewUnbilledRefusal);
    expect(observer.summary("deepinfra")).toMatchObject({ unbilledTodayAtStart: 9, unbilledCounted: 3, stop: { reason: "UNBILLED_TODAY_12" } });
    await expect(watched.execute(execution("b"))).rejects.toMatchObject({ code: PRACTICE_GATE_STOPPED });
    expect(gate.sent()).toBe(5);
    // The other gate keeps its own count.
    expect(observer.stopped("anthropic")).toBeNull();
    // A gate whose day is already at twelve is stopped before anything is sent.
    const full = new PracticeGateObserver({ unbilledTodayAtStart: { anthropic: 12 } });
    const untouched = scriptedPort(["OK"]);
    await expect(full.wrap("anthropic", untouched.port).execute(execution("m"))).rejects.toMatchObject({ code: PRACTICE_GATE_STOPPED });
    expect(untouched.sent()).toBe(0);
    expect(full.stopped("anthropic")).toMatchObject({ reason: "UNBILLED_TODAY_12" });
  });
  it("names the models whose last call ended refused as busy (the debate's sit-outs)", async () => {
    const observer = new PracticeGateObserver();
    const gate = scriptedPort(["UNBILLED", "OK", "UNBILLED", "UNBILLED", "OK"]);
    const watched = observer.wrap("deepinfra", gate.port);
    await watched.execute(execution("glm")).catch(() => undefined);
    await watched.execute(execution("glm"));
    await watched.execute(execution("mimo")).catch(() => undefined);
    await watched.execute(execution("mimo")).catch(() => undefined);
    await watched.execute(execution("qwen"));
    expect(observer.modelsEndingUnbilled()).toEqual(["mimo"]);
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
      .toEqual({ inputTokens: 3, outputTokens: 2, reasoningTokens: null });
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
  it("refuses a gate that is not active or has had more than 10 unbilled refusals today", () => {
    expect(() => assertGateStatusAllowsPractice("deepinfra", parseGateStatus("deepinfra", JSON.stringify({ state: "active", today_unbilled_releases: 10 })))).not.toThrow();
    expect(() => assertGateStatusAllowsPractice("deepinfra", parseGateStatus("deepinfra", JSON.stringify({ state: "active", today_unbilled_releases: 11 }))))
      .toThrow("PRACTICE_GATE_TOO_MANY_UNBILLED_TODAY");
    expect(() => assertGateStatusAllowsPractice("anthropic", parseGateStatus("anthropic", JSON.stringify({ state: "halted", today_unbilled_releases: 0 }))))
      .toThrow("PRACTICE_GATE_NOT_ACTIVE");
    expect(() => parseGateStatus("anthropic", "{}")).toThrow("PRACTICE_GATE_STATUS_INVALID");
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

  /** A gate port answering every model with a (wrong-format) reply, except the busy ones: refused, not billed, every time. */
  function gatePort(provider: "deepinfra" | "anthropic", busy: readonly string[], seen: string[]): PreviewBudgetPort {
    let id = 0;
    return { async execute(input) {
      const model = String((JSON.parse(input.requestBody) as { model: unknown }).model);
      seen.push(model);
      if (busy.includes(model)) throw new PreviewUnbilledRefusal();
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
});
