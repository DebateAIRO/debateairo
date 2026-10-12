// Owner rulings of 2026-10-12 for the preview practice's verdict:
//  - "Fixed slips = warning": a format or content slip the SAME call's second try fixed is a warning, listed per AI
//    (FORMAT_REPAIRED:<model>:<n>); a call that ends without an accepted reply after its tries fails; one AI whose first
//    tries slip more than 1 in 10 of its answered calls fails (one slip always allowed: slips > max(1, floor(answered/10))).
//  - "Keep GLM, it sits out": a busy model that gave at least one accepted answer is a warning (MODEL_BUSY_PARTLY), not
//    NOT_PROVEN; a busy model with no accepted answer stays NOT_PROVEN.
import { describe, expect, it } from "vitest";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS,
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
import { stubVendorReply } from "../support/preview-gate-stubs.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import { onePerModel, runPracticeFormats } from "../../tools/preview-practice/practice-formats.js";
import { formatsReport } from "../../tools/preview-practice/practice-report.js";
import {
  practiceCallFacts,
  practiceModelCalls,
  practiceSlipRateExceeded,
  practiceVerdict,
  type PracticeVerdictInput
} from "../../tools/preview-practice/practice-verdict.js";

const CLEAN: PracticeVerdictInput = Object.freeze({
  harnessError: null, completed: true, servedAnswer: true, storyOutcome: "READY", formatFailures: 0, failedCalls: 0,
  gateHalted: false, gateStopped: false, notExercisedModels: [], unbilledRefusals: 0, p90ByModel: { a: 1_000 }
});
const calls = (answered: number, slips: number, repaired = slips, unrecovered = 0) => ({ answered, slips, repaired, unrecovered });

describe("practice verdict: fixed slips are a warning (owner ruling 2026-10-12)", () => {
  it("a slip the same call's second try fixed: PASS_WITH_WARNINGS, listed per AI", () => {
    expect(practiceVerdict({ ...CLEAN, callsByModel: { mimo: calls(12, 1), haiku: calls(12, 0) } }))
      .toEqual({ verdict: "PASS_WITH_WARNINGS", exitCode: 10, reasons: ["FORMAT_REPAIRED:mimo:1"] });
  });

  it("2 slips in 10 answered calls: FAIL (SLIP_RATE), even when both were fixed", () => {
    expect(practiceVerdict({ ...CLEAN, callsByModel: { mimo: calls(10, 2) } }))
      .toEqual({ verdict: "FAIL", exitCode: 20, reasons: ["SLIP_RATE:mimo:2/10", "FORMAT_REPAIRED:mimo:2"] });
  });

  it("a call that never got an accepted reply after its tries: FAIL", () => {
    expect(practiceVerdict({ ...CLEAN, formatFailures: 1, callsByModel: { mimo: calls(20, 1, 0, 1) } }))
      .toEqual({ verdict: "FAIL", exitCode: 20, reasons: ["FORMAT_FAILED:1"] });
  });

  it("the exact rule: FAIL when slips > max(1, floor(answered / 10))", () => {
    const cases: readonly (readonly [number, number, boolean])[] = [
      [0, 1, false], [3, 1, false], [1, 1, false], [9, 2, true], [10, 2, true], [19, 2, true], [20, 2, false], [25, 3, true],
      [30, 3, false], [100, 10, false], [100, 11, true], [5, 0, false]
    ];
    for (const [answered, slips, fails] of cases) {
      expect(practiceSlipRateExceeded({ answered, slips }), `${String(slips)} in ${String(answered)}`).toBe(slips > Math.max(1, Math.floor(answered / 10)));
      expect(practiceSlipRateExceeded({ answered, slips }), `${String(slips)} in ${String(answered)}`).toBe(fails);
    }
  });

  it("a call's tries: the first REPLY decides the slip (an unbilled refusal has none); answered when one try ended OK", () => {
    expect(practiceCallFacts([{ outcome: "FAILED", parseStatus: "SCHEMA_FAILED" }, { outcome: "OK", parseStatus: "PARSED" }]))
      .toEqual({ answered: true, slip: true, repaired: true, unrecovered: false });
    expect(practiceCallFacts([{ outcome: "REFUSED", parseStatus: null }, { outcome: "OK", parseStatus: "PARSED" }]))
      .toEqual({ answered: true, slip: false, repaired: false, unrecovered: false });
    expect(practiceCallFacts([{ outcome: "FAILED", parseStatus: "PARSE_FAILED" }, { outcome: "FAILED", parseStatus: "PARSE_FAILED" }]))
      .toEqual({ answered: false, slip: true, repaired: false, unrecovered: true });
    // A slip, then a transport failure, then (the runner's final retry) an answer: the step on that maker was answered.
    expect(practiceCallFacts([{ outcome: "FAILED", parseStatus: "PARSE_FAILED" }, { outcome: "TIMED_OUT", parseStatus: null },
      { outcome: "OK", parseStatus: "PARSED" }])).toEqual({ answered: true, slip: true, repaired: true, unrecovered: false });
    expect(practiceModelCalls([
      { model: "m", tries: [{ outcome: "OK", parseStatus: "PARSED" }] },
      { model: "m", tries: [{ outcome: "FAILED", parseStatus: "SCHEMA_FAILED" }, { outcome: "OK", parseStatus: "PARSED" }] },
      { model: "n", tries: [{ outcome: "FAILED", parseStatus: "UNPARSED" }] }
    ])).toEqual({ m: { answered: 2, slips: 1, repaired: 1, unrecovered: 0 }, n: { answered: 0, slips: 1, repaired: 0, unrecovered: 1 } });
  });

  it("the story's outcome stays as it was: anything but READY fails, READY_WITH_RESERVATION too", () => {
    expect(practiceVerdict({ ...CLEAN, storyOutcome: "READY_WITH_RESERVATION" }).reasons).toEqual(["STORY_NOT_READY:READY_WITH_RESERVATION"]);
  });
});

describe("practice verdict: a busy model that answered is a warning (owner ruling 2026-10-12, \"Keep GLM, it sits out\")", () => {
  it("busy with at least one accepted answer: PASS_WITH_WARNINGS, with what it answered and skipped", () => {
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], busyRuns: { glm: { answered: 3, skipped: 15 } }, unbilledRefusals: 4,
      callsByModel: { glm: calls(3, 0) } }))
      .toEqual({ verdict: "PASS_WITH_WARNINGS", exitCode: 10, reasons: ["MODEL_BUSY_PARTLY:glm:answered=3:skipped=15", "UNBILLED_REFUSALS:4"] });
  });

  it("busy with no accepted answer: NOT_PROVEN, as before", () => {
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], busyRuns: { glm: { answered: 0, skipped: 18 } }, notExercisedModels: ["glm"] }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["MODEL_BUSY:glm"] });
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"] }).verdict).toBe("NOT_PROVEN");
  });

  it("its answered calls count toward its slip rate like any other AI's; everything else is unchanged", () => {
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], busyRuns: { glm: { answered: 3, skipped: 15 } }, callsByModel: { glm: calls(3, 2) } }).verdict)
      .toBe("FAIL");
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], busyRuns: { glm: { answered: 3, skipped: 1 } }, gateHalted: true }).verdict).toBe("FAIL");
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], busyRuns: { glm: { answered: 3, skipped: 1 } },
      gatePauses: ["deepinfra:NOT_REACHED_IN_A_ROW_4"] }).verdict).toBe("NOT_PROVEN");
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], busyRuns: { glm: { answered: 3, skipped: 1 } }, interrupted: true }).verdict).toBe("NOT_PROVEN");
  });
});

describe("practice formats: the second try is the app's own (same preview call policy), and its slip is a warning", () => {
  const FIVE = ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"];
  const MIMO = FIVE[2]!;
  const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", free_model_ids: FIVE.slice(0, 2),
    premium_model_ids: FIVE, requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-slips-unit" }))!;
  const configured = PREVIEW_REVIEWED_PROVIDER_REFS.map((providerRef) => {
    const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
    return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
  });
  const targets = onePerModel(parseProviderDiscoveryTargets(JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)), configured), FIVE);
  const policy = previewRunnerPolicy({ bounds: DEVELOPMENT_ORGAN_COST_BOUNDS.organs,
    synthesisRolePolicy: { synthesizerBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.COMPOSER, evaluatorBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.CONFORMANCE } }, config);
  const bounds = { judge: policy.bounds.JUDGE, synthesizer: policy.synthesisRolePolicy.synthesizerBound, evaluator: policy.synthesisRolePolicy.evaluatorBound };
  const pack = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
  const GOOD = JSON.stringify({ statement: "Free central lines are worth it if new money pays for them.", way_of_knowing: "REASONING",
    locator: null, restatement_text: "Should central buses be free?", restatement_status: "PASS", value_laden: true, claim_type: "normative",
    steelman: { summary: "Fares are a barrier.", fidelity: 0.8 }, critic: { summary: "Lost fares cut service.", counterargumentStrength: 0.6, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: 0.4, relevance: 0.8 }, context: { fit: 0.8, ambiguityFlags: [] }, fallacy: { severity: 0.1, fatalFlags: [] } });
  const { value_laden: _left, ...withoutValueLaden } = JSON.parse(GOOD) as Record<string, unknown>;
  const MISSING_FIELD = JSON.stringify(withoutValueLaden);

  /**
   * Every model answers well, except MiMo's first reply of its first `slips.remaining` jobs, which leaves out a
   * required field (its requests 1, 3, 5 … are each a job's first try while every repair is answered well).
   */
  function port(provider: "deepinfra" | "anthropic", slips: { remaining: number }, sent: string[]): PreviewBudgetPort {
    let id = 0;
    let mimo = 0;
    return { async execute(input) {
      const body = JSON.parse(input.requestBody) as { model: unknown };
      const model = String(body.model);
      sent.push(model);
      id += 1;
      const slipNow = model === MIMO && ++mimo % 2 === 1 && (mimo + 1) / 2 <= slips.remaining;
      const content = slipNow ? MISSING_FIELD : GOOD;
      return { status: 200, body: stubVendorReply(provider, model, content, `slip-${String(id)}`) };
    } };
  }
  const remaining = { deepinfra: { before: null, after: null }, anthropic: { before: null, after: null } };

  async function run(slipCount: number, samples: number) {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const sent: string[] = [];
    const slips = { remaining: slipCount };
    const ports = { deepinfra: observer.wrap("deepinfra", port("deepinfra", slips, sent)), anthropic: observer.wrap("anthropic", port("anthropic", slips, sent)) };
    const result = await runPracticeFormats({ config, targets, ports, observer, lanes: ["JUDGE_POSITION"], samples, gapMs: 0, pack, bounds,
      sleep: async () => undefined });
    const report = formatsReport({ result, observer, remaining, startedAt: new Date(0), finishedAt: new Date(1), interrupted: false });
    return { result, report, sent };
  }

  it("MiMo leaves out a field once, the same call's repair fixes it: REPAIRED, PASS_WITH_WARNINGS with FORMAT_REPAIRED", async () => {
    const { result, report, sent } = await run(1, 2);
    const mimo = result.samples.filter((sample) => sample.model === MIMO);
    expect(mimo.map((sample) => sample.status)).toEqual(["REPAIRED", "PARSED"]);
    expect(mimo[0]!.attempts.map((attempt) => [attempt.outcome, attempt.parseStatus])).toEqual([["FAILED", "SCHEMA_FAILED"], ["OK", "PARSED"]]);
    expect(mimo[0]!.issues).toEqual(["invalid_type@value_laden"]);
    expect(sent.filter((model) => model === MIMO)).toHaveLength(3);
    expect(report).toMatchObject({ verdict: "PASS_WITH_WARNINGS", exitCode: 10, reasons: [`FORMAT_REPAIRED:${MIMO}:1`] });
    expect((report.slipsByModel as Record<string, unknown>)[MIMO]).toMatchObject({ answered: 2, slips: 1, repaired: 1, unrecovered: 0, slipRateExceeded: false });
    expect(report.totals).toMatchObject({ formatFailures: 0, formatRepaired: 1 });
  });

  it("MiMo slips twice in its two jobs, each fixed: over the slip rule, FAIL", async () => {
    const { report } = await run(2, 2);
    expect(report.verdict).toBe("FAIL");
    expect(report.reasons).toEqual([`SLIP_RATE:${MIMO}:2/2`, `FORMAT_REPAIRED:${MIMO}:2`]);
  });

  it("MiMo's repair is refused too: the call ends without an accepted reply, FAIL (FORMAT_FAILED)", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const always: PreviewBudgetPort = { async execute(input) {
      const model = String((JSON.parse(input.requestBody) as { model: unknown }).model);
      return { status: 200, body: stubVendorReply("deepinfra", model, model === MIMO ? MISSING_FIELD : GOOD, "x") };
    } };
    const ports = { deepinfra: observer.wrap("deepinfra", always), anthropic: observer.wrap("anthropic", port("anthropic", { remaining: 0 }, [])) };
    const result = await runPracticeFormats({ config, targets, ports, observer, lanes: ["JUDGE_POSITION"], samples: 1, gapMs: 0, pack, bounds,
      sleep: async () => undefined });
    const mimo = result.samples.find((sample) => sample.model === MIMO)!;
    expect(mimo.status).toBe("SCHEMA_FAILED");
    expect(mimo.attempts).toHaveLength(2);
    const report = formatsReport({ result, observer, remaining, startedAt: new Date(0), finishedAt: new Date(1), interrupted: false });
    expect(report.verdict).toBe("FAIL");
    expect(report.reasons).toContain("FORMAT_FAILED:1");
  });

  it("a busy GLM that answered one job and then sat out: MODEL_BUSY_PARTLY, a warning", async () => {
    const GLM = FIVE[0]!;
    const observer = new PracticeGateObserver({ now: () => 0 });
    let glmCalls = 0;
    const busyAfterOne: PreviewBudgetPort = { async execute(input) {
      const model = String((JSON.parse(input.requestBody) as { model: unknown }).model);
      if (model === GLM && ++glmCalls > 1) throw new PreviewVendorRefusedUnbilled();
      return { status: 200, body: stubVendorReply("deepinfra", model, GOOD, "x") };
    } };
    const ports = { deepinfra: observer.wrap("deepinfra", busyAfterOne), anthropic: observer.wrap("anthropic", port("anthropic", { remaining: 0 }, [])) };
    const result = await runPracticeFormats({ config, targets, ports, observer, lanes: ["JUDGE_POSITION"], samples: 4, gapMs: 0, pack, bounds,
      sleep: async () => undefined });
    expect(result.busyModels).toEqual([GLM]);
    const report = formatsReport({ result, observer, remaining, startedAt: new Date(0), finishedAt: new Date(1), interrupted: false });
    expect(report.verdict).toBe("PASS_WITH_WARNINGS");
    expect(report.reasons).toContain(`MODEL_BUSY_PARTLY:${GLM}:answered=1:skipped=3`);
    expect(report.reasons.some((reason) => reason.startsWith("MODEL_BUSY:"))).toBe(false);
  });
});
