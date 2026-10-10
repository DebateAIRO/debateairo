// Owner's rule (2026-09-28: never stop a debate half-way; ESTIMATE before it starts, with a tolerance),
// contract A §5, owner's option (2) of 2026-10-10: on the private preview, admission prices the
// debate's calls per gate at an average call (4,000 in / 1,200 out, or the app's own measured average
// once it has 20 such calls) x 1.15, adds each gate's concurrency hold and holds back every unfinished
// debate, asks the gate's read-only POST /remaining what is left today, and refuses a debate that
// would not fit BEFORE any run exists, with the existing daily code (DAILY_COST_ENVELOPE_REACHED: 429
// and the plain "today's limit is used up" sentence). Off the preview nothing changes.
import { createServer, type Server, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildApi,
  evaluateAskAdmission,
  PostgresAskApplication,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import { computeStructuralCeilingBasis } from "@debateai/register";
import {
  createPreviewRemainingRpcPort,
  parsePreviewProviderTestConfig,
  previewModelRow,
  PREVIEW_GATE_UNREACHABLE,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  type PreviewGateRemaining,
  type PreviewProviderTestConfig
} from "@debateai/providers";
import {
  estimatePreviewGateNeeds,
  estimateUnfinishedRunHolds,
  previewGateEstimateCalls,
  previewGateEstimateNanoUsd,
  previewExpectedCalls,
  previewCallNanoUsd,
  previewCallShares,
  previewCallAverage,
  previewEstimatePricer,
  previewMeasuredCallUsageFrom,
  calibratedEstimatePricer,
  strictUpperBoundPricer,
  previewGateKeyOf,
  createPreviewAdmissionLock,
  assertPreviewBudgetAdmits,
  PREVIEW_ADMISSION_LOCK_NAME,
  PREVIEW_CALIBRATION_MIN_SAMPLES,
  PREVIEW_CALIBRATION_WINDOW_DAYS,
  PREVIEW_ESTIMATE_PRICING_MODE,
  PREVIEW_MEASURED_USAGE_SQL,
  PREVIEW_STRICT_INPUT_TOKENS_PER_CALL,
  PREVIEW_STRICT_PROBE_INPUT_TOKENS,
  type PreviewAdmissionLock,
  type PreviewCallOutputTokens,
  type PreviewCallShares,
  type PreviewMeasuredCallUsage,
  previewCallOutputTokens,
  PreviewGateUnavailableRefusal,
  PREVIEW_UNFINISHED_RUNS_SQL,
  type PreviewUnfinishedRun,
  nextBucharestMidnight,
  PreviewDailyLimitRefusal,
  type PreviewBudgetGateSettings
} from "../../apps/api/src/preview-budget-estimate.js";
import { AskRefusal, askRefusalRetryAfter } from "../../apps/api/src/index.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN],
  requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
}))!;
const ASK = Object.freeze({
  question_line: "Should cities price congestion on central roads?",
  risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker-declaration:test",
  composition_budget_tier: "low", plan_tier: "free", depth_params: { depth: 1 },
  decision_scope: "test-layer scope", as_of: "2026-10-10T00:00:00.000Z",
  steering_presets: [], steering_annotations: []
}) as unknown as AskRequest;

/** A two-debater, depth-1 basis as computeStructuralCeilingBasis mints it (2 roots x 3 nodes + 2 exchanges). */
function basis(panelSize: number): Readonly<Record<string, unknown>> {
  return Object.freeze({
    kind: "COMPUTED_STRUCTURAL_CEILING", panel_size: panelSize, depth: 1, max_model_attempts: 120, hold_cap: 2,
    call_sites: { author: 8, panel: 8, reviewer: 8, serve: 6 },
    serve_leg: { synthesis_loop_sites: 6, selected: "SYNTHESIS_LOOP" }
  });
}
const PANEL = Object.freeze([
  { provider_ref: "preview:fixture-a", model_id: GLM },
  { provider_ref: "preview:deepseek-v4-1-flash", model_id: DEEPSEEK }
]);
/** The max_tokens each call sends on the preview with today's register bounds (all organ and synthesis bounds 2,048 -> the 8,192 floor). */
const OUTPUT: PreviewCallOutputTokens = Object.freeze({ debate: 8192, storyteller: 12_000, storytellerRetry: 24_000, storyChecker: 8192 });
/** Every role on GLM; the five declared targets (two GLM refs, DeepSeek, MiMo, Qwen) are health-checked at ask time. */
const ROLE_MODELS = Object.freeze({ answerWriter: GLM, answerChecker: GLM, storyteller: GLM, storyChecker: GLM });
const ASK_PROBE_MODELS = Object.freeze([GLM, GLM, DEEPSEEK, MIMO, QWEN]);
// Calls: debate 120 (the basis's ceiling beats its 30 sites); story 2 rounds x 3 = 6; pickup health checks
// (1 + hold_cap 2 + 2 restarts) x (2 panel members + fixture-b, the checker, off the panel) = 15; this
// ask's own health checks 5; one unbilled retry per one-attempt call 120 + 2 = 122. Total 268.
const EXPECTED_CALLS = 268;
// With the 15% margin: ceil(308.2) = 309; plus 4 in flight = 313 calls needed.
const CALLS_NEEDED = 313;
// An average call (4,000 in, 1,200 out) at each row's list price, in nano-USD.
const AVG = Object.freeze({ GLM: 1_200_000n, DEEPSEEK: 1_520_000n, MIMO: 2_764_000n, QWEN: 910_400n });
// Who makes which call (per-gate shares): the 30 sites x 4 (120 / 30) = the panel's 24 sites -> 96 calls,
// 48 per member; the answer writer's and checker's 3 sites each -> 12 calls each, on GLM.
// GLM: 48 + 12 + 12 debate, 5 + 5 pickup checks (its panel seat and fixture-b), 2 + 2 + 2 story, 2 ask checks = 90 calls.
// DeepSeek: 48 debate, 5 pickup checks, 1 ask check = 54. MiMo and Qwen: 1 ask check each. Unbilled retries cost nothing.
// 90 x 1,200,000 + 54 x 1,520,000 + 2,764,000 + 910,400 = 193,754,400; x 1.15 = 222,817,560.
const CALLS_NANO = 222_817_560n;
const LARGEST = 131_481_600n;
const ESTIMATE = CALLS_NANO + 4n * LARGEST;
const UNAVAILABLE = "ASK_MODEL_CANDIDATE_UNAVAILABLE";

function remainingWith(patch: Partial<PreviewGateRemaining> = {}): PreviewGateRemaining {
  return Object.freeze({
    state: "active", windowOpen: true, remainingNanoUsd: 100_000_000_000n, remainingCalls: 100_000,
    maxConcurrentCalls: 4, largestReservationNanoUsd: LARGEST, enabledModels: [GLM, DEEPSEEK], ...patch
  });
}

type Counters = { probes: number; remaining: number };

function gateWith(counters: Counters, answer: () => Promise<PreviewGateRemaining>,
  unfinished: readonly PreviewUnfinishedRun[] = [], measured?: () => Promise<PreviewMeasuredCallUsage>): PreviewBudgetGateSettings {
  return Object.freeze({
    remaining: { deepinfra: async () => { counters.remaining += 1; return answer(); } },
    roleModels: ROLE_MODELS,
    roleProviderRefs: ["preview:fixture-a", "preview:fixture-b"],
    storyRounds: 2,
    callOutputTokens: OUTPUT,
    askProbeModelIds: ASK_PROBE_MODELS,
    maxCooldownHoldsPerRun: 2,
    readUnfinishedRuns: async () => unfinished,
    ...(measured === undefined ? {} : { readMeasuredCallUsage: measured })
  });
}

function settings(counters: Counters, extra: Partial<RunCreationSettings> = {}): RunCreationSettings {
  return {
    previewProviderTestConfig: PREVIEW,
    strangerSampleRate: 0, registerVersion: 5, batteryVersion: "fixture", settlementWatchHandle: "fixture",
    resolveDiscoveredPanel: async () => {
      counters.probes += 1;
      return [
        { provider_ref: "preview:fixture-a", maker: "Z.AI", model_id: GLM, probe_evidence_ref: "fixture:a", probed_at: "2026-10-10T00:00:00Z" },
        { provider_ref: "preview:deepseek-v4-1-flash", maker: "DeepSeek", model_id: DEEPSEEK, probe_evidence_ref: "fixture:d", probed_at: "2026-10-10T00:00:00Z" }
      ];
    },
    resolveEnvelopeBasis: async (input) => basis(input.panelSize),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
    ...extra
  } as RunCreationSettings;
}
const ROLES = { roleModels: ROLE_MODELS, roleProviderRefs: ["preview:fixture-a", "preview:fixture-b"], storyRounds: 2,
  callOutputTokens: OUTPUT, askProbeModelIds: ASK_PROBE_MODELS, maxCooldownHoldsPerRun: 2 };
/** Each model's calls of each kind, as whole calls (the shares' fractions summed). */
function callsBy(calls: PreviewCallShares): Record<string, number> {
  const out: Record<string, bigint> = {};
  for (const share of calls.shares) {
    const key = `${share.model} ${share.type}`;
    out[key] = (out[key] ?? 0n) + share.numerator;
  }
  return Object.fromEntries(Object.entries(out).map(([key, numerator]) => [key, Number(numerator) / Number(calls.denominator)]));
}
/** A measured-usage entry: `calls` calls averaging `input` in and `output` out. */
const sample = (model: string, bucket: "DEBATE" | "STORY", calls: number, input: number, output: number) =>
  Object.freeze({ model, bucket, calls, inputTokens: BigInt(calls * input), outputTokens: BigInt(calls * output) });

describe("the start-of-debate estimate is a calibrated estimate, per gate (pure)", () => {
  it("counts repeat attempts, the story with its repair, every pickup and ask health check, and the unbilled retries", () => {
    expect(previewExpectedCalls({ basis: basis(2), panel: PANEL, ...ROLES, askProbeTargets: 5 }))
      .toEqual({ debate: 120, story: 6, probes: 15, askProbes: 5, unbilledRetries: 122, total: EXPECTED_CALLS });
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES });
    expect(need).toEqual({ gate: "deepinfra", modelIds: [GLM, DEEPSEEK], expectedCalls: EXPECTED_CALLS, callsWithMargin: 309, callsNanoUsd: CALLS_NANO });
    expect(previewGateEstimateNanoUsd(need!, remainingWith())).toBe(ESTIMATE);
    expect(previewGateEstimateCalls(need!, remainingWith())).toBe(CALLS_NEEDED);
  });

  it("puts each call on the model that makes it: the panel's sites shared by the panel, the answer roles' on their models", () => {
    const calls = previewCallShares({ basis: basis(2), panel: PANEL, ...ROLES });
    expect(callsBy(calls)).toEqual({
      [`${GLM} DEBATE`]: 72, [`${GLM} UNBILLED_RETRY`]: 74, [`${DEEPSEEK} DEBATE`]: 48, [`${DEEPSEEK} UNBILLED_RETRY`]: 48,
      [`${GLM} PROBE`]: 12, [`${DEEPSEEK} PROBE`]: 6, [`${MIMO} PROBE`]: 1, [`${QWEN} PROBE`]: 1,
      [`${GLM} STORYTELLER`]: 2, [`${GLM} STORYTELLER_RETRY`]: 2, [`${GLM} STORY_CHECKER`]: 2
    });
    // The shares add up to the count exactly.
    const total = calls.shares.reduce((sum, share) => sum + share.numerator, 0n);
    expect(total).toBe(BigInt(EXPECTED_CALLS) * calls.denominator);
    // The answer checker on MiMo moves its 12 debate calls (and their retries) there, and only those.
    const checkerOnMimo = callsBy(previewCallShares({ basis: basis(2), panel: PANEL, ...ROLES, roleModels: { ...ROLE_MODELS, answerChecker: MIMO } }));
    expect(checkerOnMimo[`${MIMO} DEBATE`]).toBe(12);
    expect(checkerOnMimo[`${GLM} DEBATE`]).toBe(60);
    // A basis without a role split puts every debate call on the panel, evenly.
    expect(callsBy(previewCallShares({ basis: { panel_size: 2, max_model_attempts: 10 }, panel: PANEL, ...ROLES }))[`${DEEPSEEK} DEBATE`]).toBe(5);
    // A story without its roles is a fault.
    expect(() => previewCallShares({ basis: basis(2), panel: PANEL, ...ROLES, roleModels: { ...ROLE_MODELS, storyteller: null } }))
      .toThrow("PREVIEW_STORY_ROLE_MISSING");
  });

  it("each gate is charged only for its own models' calls, each at its own row: a dearer answer checker costs exactly its calls", () => {
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, roleModels: { ...ROLE_MODELS, answerChecker: MIMO } });
    // 12 checker calls move from GLM to MiMo: + 12 x (2,764,000 - 1,200,000) = 18,768,000 before the margin.
    expect(need).toMatchObject({ modelIds: [GLM, DEEPSEEK, MIMO], callsNanoUsd: (193_754_400n + 18_768_000n) * 115n / 100n });
    expect(() => estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, roleModels: { ...ROLE_MODELS, answerWriter: "other/model" } })).toThrow();
    expect(() => estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, roleProviderRefs: ["preview:unknown"] })).toThrow("PREVIEW_MODEL_UNREVIEWED");
  });

  it("prices an average call: 4,000 in and 1,200 out at the row's list price, x 1.15, output clamped to the row", () => {
    const pricer = calibratedEstimatePricer([]);
    expect(pricer(previewModelRow(GLM)!, "DEBATE")).toBe(AVG.GLM);
    expect(pricer(previewModelRow(DEEPSEEK)!, "STORYTELLER")).toBe(AVG.DEEPSEEK);
    expect(pricer(previewModelRow(MIMO)!, "PROBE")).toBe(AVG.MIMO);
    expect(pricer(previewModelRow(QWEN)!, "STORY_CHECKER")).toBe(AVG.QWEN);
    expect(previewCallNanoUsd(previewModelRow(QWEN)!, 0n, 200_000)).toBe(131_072n * 382n);
    // No cached-input discount: every prompt token at the full input price.
    expect(previewCallNanoUsd(previewModelRow(QWEN)!, 1_000_000n, 0)).toBe(113_000_000n);
    // x 1.15, rounded up: 193,754,400 -> 222,817,560 (exact); one nano-USD more rounds up.
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES });
    expect(need!.callsNanoUsd).toBe(193_754_400n * 115n / 100n);
  });

  it("the app's own measured average replaces the default once it has 20 calls of that kind by that model, at today's prices", () => {
    const deepseek = previewModelRow(DEEPSEEK)!;
    expect(PREVIEW_CALIBRATION_MIN_SAMPLES).toBe(20);
    expect(PREVIEW_CALIBRATION_WINDOW_DAYS).toBe(14);
    // 19 debate calls are not enough: the default stays.
    expect(previewCallAverage(DEEPSEEK, "DEBATE", [sample(DEEPSEEK, "DEBATE", 19, 10_000, 3_000)]))
      .toEqual({ inputTokens: 4_000n, outputTokens: 1_200n, measured: false });
    // 20 are: 10,000 in and 3,000 out (rounded up), priced at DeepSeek's row today.
    const measured = [sample(DEEPSEEK, "DEBATE", 20, 10_000, 3_000), { ...sample(GLM, "STORY", 20, 6_000, 2_000), outputTokens: 40_001n }];
    expect(previewCallAverage(DEEPSEEK, "DEBATE", measured)).toEqual({ inputTokens: 10_000n, outputTokens: 3_000n, measured: true });
    expect(calibratedEstimatePricer(measured)(deepseek, "DEBATE")).toBe(10_000n * 200n + 3_000n * 600n);
    // Per kind and per model: DeepSeek's story calls and GLM's debate calls keep the default.
    expect(previewCallAverage(DEEPSEEK, "STORYTELLER", measured).measured).toBe(false);
    expect(previewCallAverage(GLM, "DEBATE", measured).measured).toBe(false);
    // The story bucket calibrates the storyteller, its repair and the story check; health checks never.
    for (const type of ["STORYTELLER", "STORYTELLER_RETRY", "STORY_CHECKER"] as const) {
      expect(previewCallAverage(GLM, type, measured)).toEqual({ inputTokens: 6_000n, outputTokens: 2_001n, measured: true });
    }
    expect(previewCallAverage(GLM, "PROBE", [...measured, sample(GLM, "DEBATE", 50, 9, 9)]).measured).toBe(false);
    // In the gate's need: DeepSeek's 48 debate calls at 3,800,000 instead of 1,520,000.
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, pricer: calibratedEstimatePricer([sample(DEEPSEEK, "DEBATE", 20, 10_000, 3_000)]) });
    expect(need!.callsNanoUsd).toBe((193_754_400n + 48n * (3_800_000n - 1_520_000n)) * 115n / 100n);
  });

  it("reads the measured usage from the model-spend ledger: reviewed preview refs, debate and story charges, within the window", () => {
    expect(PREVIEW_MEASURED_USAGE_SQL).toMatch(/FROM ledger\.model_spend AS spend/u);
    expect(PREVIEW_MEASURED_USAGE_SQL).toMatch(/spend\.spend_source IN \('RUN', 'STORY'\)/u);
    expect(PREVIEW_MEASURED_USAGE_SQL).toMatch(/spend\.provider_ref = ANY\(\$1::text\[\]\)/u);
    expect(PREVIEW_MEASURED_USAGE_SQL).toMatch(/recorded_at > clock_timestamp\(\) - make_interval\(days => \$2::integer\)/u);
    expect(PREVIEW_MEASURED_USAGE_SQL).toMatch(/GROUP BY spend\.provider_ref, spend\.spend_source$/u);
    // Two refs of one model (fixture-a and fixture-b are both GLM) add up.
    expect(previewMeasuredCallUsageFrom([
      { provider_ref: "preview:fixture-a", spend_source: "RUN", calls: 12, input_tokens: "48000", output_tokens: "12000" },
      { provider_ref: "preview:fixture-b", spend_source: "RUN", calls: 8, input_tokens: "32000", output_tokens: "8000" },
      { provider_ref: "preview:qwen-3-8-flash", spend_source: "STORY", calls: 3, input_tokens: "9", output_tokens: "6" }
    ])).toEqual([
      { model: GLM, bucket: "DEBATE", calls: 20, inputTokens: 80_000n, outputTokens: 20_000n },
      { model: QWEN, bucket: "STORY", calls: 3, inputTokens: 9n, outputTokens: 6n }
    ]);
    expect(PREVIEW_REVIEWED_PROVIDER_REFS).toContain("preview:qwen-3-8-flash");
    for (const bad of [
      { provider_ref: "openai", spend_source: "RUN", calls: 1, input_tokens: "1", output_tokens: "1" },
      { provider_ref: "preview:fixture-a", spend_source: "SUPPORT", calls: 1, input_tokens: "1", output_tokens: "1" },
      { provider_ref: "preview:fixture-a", spend_source: "RUN", calls: 0, input_tokens: "1", output_tokens: "1" },
      { provider_ref: "preview:fixture-a", spend_source: "RUN", calls: 1, input_tokens: "-1", output_tokens: "1" },
      { provider_ref: "preview:fixture-a", spend_source: "RUN", calls: 1, input_tokens: 5, output_tokens: "1" }
    ]) expect(() => previewMeasuredCallUsageFrom([bad])).toThrow("PREVIEW_MEASURED_USAGE_UNREADABLE");
  });

  it("the pricing is ONE switch: the calibrated estimate is active; the strict bound of 6f62b6ba3 is one constant away", () => {
    expect(PREVIEW_ESTIMATE_PRICING_MODE).toBe("CALIBRATED_ESTIMATE");
    const context = { measured: [], callOutputTokens: OUTPUT };
    const deepseek = previewModelRow(DEEPSEEK)!;
    expect(previewEstimatePricer(context)(deepseek, "DEBATE")).toBe(AVG.DEEPSEEK);
    const strict = previewEstimatePricer(context, "STRICT_BOUND");
    expect(PREVIEW_STRICT_INPUT_TOKENS_PER_CALL).toBe(262_144n + 2048n);
    expect(PREVIEW_STRICT_PROBE_INPUT_TOKENS).toBe(1024n + 2048n);
    expect(strict(deepseek, "DEBATE")).toBe(264_192n * 200n + 8192n * 600n);
    expect(strict(deepseek, "STORYTELLER_RETRY")).toBe(264_192n * 200n + 24_000n * 600n);
    expect(strict(deepseek, "PROBE")).toBe(3072n * 200n + 8192n * 600n);
    expect(strictUpperBoundPricer(OUTPUT)(deepseek, "STORY_CHECKER")).toBe(strict(deepseek, "DEBATE"));
    // The same debate under the strict bound costs far more than under the estimate.
    const [bound] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, pricer: strict });
    expect(bound!.callsNanoUsd > 25n * CALLS_NANO).toBe(true);
    expect(bound!.expectedCalls).toBe(EXPECTED_CALLS);
  });

  it("an unfinished debate holds its whole estimate but its ask's probes; an older model off the rows is priced at the dearest row", () => {
    const [hold] = estimateUnfinishedRunHolds({ basis: basis(2), panel: PANEL }, ROLES);
    // Without this ask's five health checks (2 x GLM, DeepSeek, MiMo, Qwen: 7,594,400): 186,160,000 x 1.15.
    expect(hold).toEqual({ gate: "deepinfra", modelIds: [GLM, DEEPSEEK], expectedCalls: EXPECTED_CALLS - 5, callsWithMargin: 303,
      callsNanoUsd: 214_084_000n });
    const old = estimateUnfinishedRunHolds({ basis: basis(2), panel: [{ provider_ref: "preview:other", model_id: "old/model" }] }, ROLES);
    const asMimo = estimateUnfinishedRunHolds({ basis: basis(2), panel: [{ provider_ref: "preview:other", model_id: MIMO }] }, ROLES);
    expect(old[0]!.callsNanoUsd).toBe(asMimo[0]!.callsNanoUsd);
    // The same pricing as the new debate: a measured average applies to the held debate too.
    const measuredPricer = calibratedEstimatePricer([sample(DEEPSEEK, "DEBATE", 20, 10_000, 3_000)]);
    expect(estimateUnfinishedRunHolds({ basis: basis(2), panel: PANEL }, ROLES, measuredPricer)[0]!.callsNanoUsd)
      .toBe((186_160_000n + 48n * (3_800_000n - 1_520_000n)) * 115n / 100n);
  });

  it("a debate only writing its story holds the story's calls: 3 per round plus the checker's retry", () => {
    const [story] = estimateUnfinishedRunHolds({ basis: basis(2), panel: PANEL, phase: "STORY" }, ROLES);
    // 2 rounds x (storyteller, its repair, the check) on GLM = 6 x 1,200,000 = 7,200,000; x 1.15 = 8,280,000.
    expect(story).toMatchObject({ gate: "deepinfra", expectedCalls: 8, callsWithMargin: 10, callsNanoUsd: 8_280_000n });
    expect(estimateUnfinishedRunHolds({ basis: basis(2), panel: PANEL, phase: "STORY" }, { ...ROLES, storyRounds: 0 })[0])
      .toMatchObject({ expectedCalls: 0, callsNanoUsd: 0n });
  });

  it("Qwen is priced from its own row, on the DeepInfra gate", () => {
    expect(previewGateKeyOf(QWEN)).toBe("deepinfra");
    const qwenRoles = { answerWriter: QWEN, answerChecker: QWEN, storyteller: QWEN, storyChecker: QWEN };
    const input = { ...ROLES, basis: basis(1), panel: [{ provider_ref: "preview:qwen-3-8-flash", model_id: QWEN }],
      roleModels: qwenRoles, roleProviderRefs: ["preview:qwen-3-8-flash"], askProbeModelIds: [QWEN] };
    // 120 debate + 5 pickup checks + 1 ask check + 6 story calls = 132 billed calls x 910,400 = 120,172,800; x 1.15.
    expect(estimatePreviewGateNeeds(input)).toEqual([{ gate: "deepinfra", modelIds: [QWEN], expectedCalls: 254, callsWithMargin: 293,
      callsNanoUsd: 138_198_720n }]);
    // On the four-maker Premium panel it is one more model on the same gate.
    const premium = [...PANEL, { provider_ref: "preview:mimo-v2-6-pro", model_id: MIMO }, { provider_ref: "preview:qwen-3-8-flash", model_id: QWEN }];
    expect(estimatePreviewGateNeeds({ basis: basis(4), panel: premium, ...ROLES })).toEqual([
      expect.objectContaining({ gate: "deepinfra", modelIds: [GLM, DEEPSEEK, MIMO, QWEN] })]);
  });
});

describe("evaluateAskAdmission on the preview asks the gate before any run exists", () => {
  it("admits when the pot is ample, asking the gate once after discovery", async () => {
    const counters = { probes: 0, remaining: 0 };
    const result = await evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => remainingWith()) }), ASK);
    expect(result.discoveredPanel.map((member) => member.model_id)).toEqual([GLM, DEEPSEEK]);
    expect(counters).toEqual({ probes: 1, remaining: 1 });
  });

  it("admits at exactly the estimate and refuses one nano-USD or one call below it with the daily code", async () => {
    const counters = { probes: 0, remaining: 0 };
    await expect(evaluateAskAdmission(settings(counters, {
      previewBudgetGate: gateWith(counters, async () => remainingWith({ remainingNanoUsd: ESTIMATE, remainingCalls: CALLS_NEEDED }))
    }), ASK)).resolves.toBeDefined();
    await expect(evaluateAskAdmission(settings(counters, {
      previewBudgetGate: gateWith(counters, async () => remainingWith({ remainingNanoUsd: ESTIMATE - 1n }))
    }), ASK)).rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    await expect(evaluateAskAdmission(settings(counters, {
      previewBudgetGate: gateWith(counters, async () => remainingWith({ remainingCalls: CALLS_NEEDED - 1 }))
    }), ASK)).rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
  });

  it("debates still running hold their estimate: a pot that fits one debate refuses the second", async () => {
    const counters = { probes: 0, remaining: 0 };
    // A running debate holds its estimate without its own ask's health checks: 214,084,000 and 303 calls.
    const pot = remainingWith({ remainingNanoUsd: ESTIMATE + 214_084_000n - 1n });
    const running = [{ basis: basis(2), panel: PANEL }];
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => pot) }), ASK)).resolves.toBeDefined();
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => pot, running) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    // The calls held count too.
    const calls = remainingWith({ remainingCalls: CALLS_NEEDED + 302 });
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => calls, running) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
  });

  it("adds the gate's concurrency hold: its calls in flight at once x its largest reservation (10 x MiMo's on the preview)", async () => {
    const counters = { probes: 0, remaining: 0 };
    const hold = 10n * 227_635_200n;
    const pot = (remainingNanoUsd: bigint) => remainingWith({ remainingNanoUsd, maxConcurrentCalls: 10, largestReservationNanoUsd: 227_635_200n });
    expect(previewGateEstimateNanoUsd(estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES })[0]!, pot(0n))).toBe(CALLS_NANO + hold);
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => pot(CALLS_NANO + hold)) }), ASK))
      .resolves.toBeDefined();
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => pot(CALLS_NANO + hold - 1n)) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    // Ten calls in flight need ten calls of room too.
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters,
      async () => remainingWith({ maxConcurrentCalls: 10, remainingCalls: 309 + 9 })) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
  });

  it("prices with the app's measured averages when it has them, and refuses as not available when they cannot be read", async () => {
    const counters = { probes: 0, remaining: 0 };
    const measured = [sample(DEEPSEEK, "DEBATE", 20, 10_000, 3_000)];
    const calibrated = (193_754_400n + 48n * (3_800_000n - 1_520_000n)) * 115n / 100n + 4n * LARGEST;
    // A pot that fits the default-average estimate but not the measured one.
    const gate = gateWith(counters, async () => remainingWith({ remainingNanoUsd: calibrated - 1n }), [], async () => measured);
    expect(ESTIMATE < calibrated - 1n).toBe(true);
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gate }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate:
      gateWith(counters, async () => remainingWith({ remainingNanoUsd: calibrated }), [], async () => measured) }), ASK)).resolves.toBeDefined();
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate:
      gateWith(counters, async () => remainingWith(), [], async () => { throw new Error("db gone"); }) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
  });

  it.each([
    ["the gate is halted", { state: "halted" as const }],
    ["the gate is only initialized", { state: "initialized" as const }],
    ["the gate's window is closed", { windowOpen: false }],
    ["a panel model is not enabled", { enabledModels: [GLM] }],
    ["nothing is enabled", { enabledModels: [] }]
  ])("refuses as not available right now (not the daily limit) when %s", async (_name, patch) => {
    const counters = { probes: 0, remaining: 0 };
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => remainingWith(patch)) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
    expect(counters).toEqual({ probes: 1, remaining: 1 });
  });

  it("a Premium debate with Qwen on the panel asks the DeepInfra gate, and is refused until the gate switches Qwen on", async () => {
    const premiumAsk = { ...ASK, plan_tier: "premium" } as unknown as AskRequest;
    const member = (provider_ref: string, maker: string, model_id: string) =>
      ({ provider_ref, maker, model_id, probe_evidence_ref: `fixture:${provider_ref}`, probed_at: "2026-10-10T00:00:00Z" });
    const panel = [member("preview:fixture-a", "Z.AI", GLM), member("preview:deepseek-v4-1-flash", "DeepSeek", DEEPSEEK),
      member("preview:mimo-v2-6-pro", "Xiaomi", MIMO), member("preview:qwen-3-8-flash", "Alibaba", QWEN)];
    const counters = { probes: 0, remaining: 0 };
    const withEnabled = (enabledModels: string[]) => settings(counters, { resolveDiscoveredPanel: async () => panel,
      previewBudgetGate: gateWith(counters, async () => remainingWith({ enabledModels, largestReservationNanoUsd: 227_635_200n })) });
    await expect(evaluateAskAdmission(withEnabled([GLM, DEEPSEEK, MIMO]), premiumAsk)).rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
    expect(counters.remaining).toBe(1);
    const result = await evaluateAskAdmission(withEnabled([GLM, DEEPSEEK, MIMO, QWEN]), premiumAsk);
    expect(result.discoveredPanel.map((entry) => entry.model_id)).toEqual([GLM, DEEPSEEK, MIMO, QWEN]);
    expect(result.criticUnavailableCap).toEqual({ serves: true, conditionMarks: [], confidenceBandCapRequired: false, liftCondition: null });
    expect(counters.remaining).toBe(2);
  });

  it("refuses as not available when a role model (the answer checker) is not enabled, though the panel is", async () => {
    const counters = { probes: 0, remaining: 0 };
    const gate = { ...gateWith(counters, async () => remainingWith({ enabledModels: [GLM, DEEPSEEK] })), roleModels: { ...ROLE_MODELS, answerChecker: MIMO } };
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gate }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
  });

  it("refuses as not available when the gate cannot be asked, the running debates cannot be read, or no settings were built", async () => {
    const counters = { probes: 0, remaining: 0 };
    await expect(evaluateAskAdmission(settings(counters, {
      previewBudgetGate: gateWith(counters, async () => { throw new Error("socket gone"); })
    }), ASK)).rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
    await expect(evaluateAskAdmission(settings(counters, {
      previewBudgetGate: { ...gateWith(counters, async () => remainingWith()), readUnfinishedRuns: async () => { throw new Error("db gone"); } }
    }), ASK)).rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
    await expect(evaluateAskAdmission(settings(counters), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: UNAVAILABLE });
  });

  it("the not-available refusal asks for a retry in about a minute", () => {
    const now = new Date("2026-10-10T10:00:00.000Z");
    const refusal = new AskRefusal(new PreviewGateUnavailableRefusal(new Date(now.getTime() + 60_000)));
    expect(askRefusalRetryAfter(refusal.code, now, refusal.retryAt)).toBe("Sat, 10 Oct 2026 10:01:00 GMT");
    expect(refusal.message).not.toMatch(/gate|nano|USD|halted/u);
  });

  it("off the preview the gate is never asked, even when a port is present", async () => {
    const counters = { probes: 0, remaining: 0 };
    const offPreview = settings(counters, {
      previewBudgetGate: gateWith(counters, async () => remainingWith({ state: "halted" })),
      resolveDiscoveredPanel: async () => {
        counters.probes += 1;
        return [
          { provider_ref: "openai", maker: "OpenAI", model_id: "gpt-5.6-luna", probe_evidence_ref: "fixture:o", probed_at: "2026-10-10T00:00:00Z" },
          { provider_ref: "anthropic", maker: "Anthropic", model_id: "claude-sonnet-5", probe_evidence_ref: "fixture:c", probed_at: "2026-10-10T00:00:00Z" }
        ];
      }
    });
    delete (offPreview as { previewProviderTestConfig?: PreviewProviderTestConfig }).previewProviderTestConfig;
    await expect(evaluateAskAdmission(offPreview, ASK)).resolves.toBeDefined();
    expect(counters).toEqual({ probes: 1, remaining: 0 });
  });
});

/** An in-memory stand-in for the advisory lock: one holder at a time, waiters queue in order. */
function memoryLock(events: string[], name: string, state: { tail: Promise<void> }): PreviewAdmissionLock {
  let releaseHeld: (() => void) | undefined;
  return {
    async acquire() {
      const previous = state.tail;
      let unlock!: () => void;
      state.tail = new Promise<void>((resolve) => { unlock = resolve; });
      await previous;
      releaseHeld = unlock;
      events.push(`${name}:acquired`);
    },
    async release() {
      if (releaseHeld === undefined) return;
      const unlock = releaseHeld;
      releaseHeld = undefined;
      events.push(`${name}:released`);
      unlock();
    }
  };
}

describe("one ask at a time is estimated and started on the preview (review finding 2)", () => {
  it("the lock is a transaction-scoped advisory lock on one connection, released by COMMIT, idempotent", async () => {
    const queries: string[] = [];
    const releases: unknown[] = [];
    const client = { query: async (sql: string, values?: unknown[]) => { queries.push(values === undefined ? sql : `${sql} ${JSON.stringify(values)}`); return { rows: [] }; },
      release: (error?: unknown) => { releases.push(error); } };
    const lock = createPreviewAdmissionLock({ connect: async () => client } as never);
    await lock.acquire();
    await lock.acquire();
    expect(queries).toEqual(["BEGIN", `SELECT pg_advisory_xact_lock(hashtextextended($1, 0)) ${JSON.stringify([PREVIEW_ADMISSION_LOCK_NAME])}`]);
    await lock.release();
    await lock.release();
    expect(queries.at(-1)).toBe("COMMIT");
    expect(releases).toEqual([undefined]);
    await expect(lock.acquire()).rejects.toThrow("PREVIEW_ADMISSION_LOCK_RELEASED");
  });

  it("a lock that cannot be taken frees its connection as broken, and the ask is refused as not available", async () => {
    const releases: unknown[] = [];
    const client = { query: async (sql: string) => { if (sql !== "BEGIN") throw new Error("lock timeout"); return { rows: [] }; },
      release: (error?: unknown) => { releases.push(error); } };
    const lock = createPreviewAdmissionLock({ connect: async () => client } as never);
    await expect(lock.acquire()).rejects.toThrow("lock timeout");
    expect(releases).toHaveLength(1);
    expect(releases[0]).toBeInstanceOf(Error);
    await lock.release();
    expect(releases).toHaveLength(1);
    const counters = { probes: 0, remaining: 0 };
    await expect(assertPreviewBudgetAdmits(gateWith(counters, async () => remainingWith()), { basis: basis(2), panel: PANEL }, undefined,
      createPreviewAdmissionLock({ connect: async () => client } as never))).rejects.toBeInstanceOf(PreviewGateUnavailableRefusal);
    expect(counters.remaining).toBe(0);
  });

  it("two asks at once: the second estimates only after the first debate is held, so a pot for one admits one", async () => {
    // A pot that fits exactly one debate: the estimate plus nothing held.
    const pot = remainingWith({ remainingNanoUsd: ESTIMATE });
    const started: PreviewUnfinishedRun[] = [];
    const events: string[] = [];
    const counters = { probes: 0, remaining: 0 };
    const gate = gateWith(counters, async () => pot);
    const live = { ...gate, readUnfinishedRuns: async () => [...started] };
    const state = { tail: Promise.resolve() };
    const ask = async (name: string) => {
      const lock = memoryLock(events, name, state);
      try {
        await evaluateAskAdmission(settings(counters, { previewBudgetGate: live }), ASK, null, lock);
        // What submit does next while holding the lock: the run row, then its READY job.
        await new Promise((resolve) => setTimeout(resolve, 5));
        started.push({ basis: basis(2), panel: PANEL });
        events.push(`${name}:queued`);
        return "admitted";
      } catch (error) {
        return (error as { code?: string }).code;
      } finally {
        await lock.release();
      }
    };
    expect(await Promise.all([ask("first"), ask("second")])).toEqual(["admitted", "DAILY_COST_ENVELOPE_REACHED"]);
    expect(events).toEqual(["first:acquired", "first:queued", "first:released", "second:acquired", "second:released"]);
    // Without the lock both asks read the same empty list and both pass: what the lock prevents.
    started.length = 0;
    const unlocked = await Promise.all([1, 2].map(() => evaluateAskAdmission(settings(counters, { previewBudgetGate: live }), ASK).then(() => "admitted")));
    expect(unlocked).toEqual(["admitted", "admitted"]);
  });

  it("the output ceilings: the preview floor, the storyteller's retry at twice its ceiling, no story means none", () => {
    const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture", free_model_ids: [GLM] }))!;
    expect(previewCallOutputTokens(config, { debate: [2048, 16_000], story: { storyteller: 12_000, checker: 2048 } }))
      .toEqual({ debate: 16_000, storyteller: 12_000, storytellerRetry: 24_000, storyChecker: 8192 });
    expect(previewCallOutputTokens(config, { debate: [2048], story: null })).toEqual({ debate: 8192, storyteller: 0, storytellerRetry: 0, storyChecker: 0 });
    const invalid = "PREVIEW_CALL_CEILINGS_INVALID";
    expect(() => previewCallOutputTokens(config, { debate: [], story: null })).toThrow(invalid);
  });
});

describe("the real submit and the HTTP boundary", () => {
  const member = testHttpIdentity("estimate-member");
  /** `this` for the real submit; a run would be created through the private admission pools, which a fake has not. */
  const self = (extra: Partial<RunCreationSettings>, counters: Counters) => ({
    settings: { ...settings(counters, extra), previewTeamUserIds: [member.authenticated.userId] }
  });
  const principal = Object.freeze({ kind: "server" as const, userId: member.authenticated.userId, ownerRef: member.authenticated.ownerRef });

  it("a tight pot is refused before any run is created; an ample pot goes on to create one", async () => {
    const counters = { probes: 0, remaining: 0 };
    const tight = self({ previewBudgetGate: gateWith(counters, async () => remainingWith({ remainingNanoUsd: 1_000_000n })) }, counters);
    await expect(PostgresAskApplication.prototype.submit.call(tight as never, ASK, member.authenticated.session, principal as never))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    // Admitted, submit goes on to create the run, which this fake `this` cannot: a TypeError, not a refusal.
    const ample = self({ previewBudgetGate: gateWith(counters, async () => remainingWith()) }, counters);
    await expect(PostgresAskApplication.prototype.submit.call(ample as never, ASK, member.authenticated.session, principal as never))
      .rejects.toBeInstanceOf(TypeError);
    // Discovery is the only model call either ask made.
    expect(counters).toEqual({ probes: 2, remaining: 2 });
  });

  it("submit takes the lock for the estimate and releases it whether the ask is refused or fails later", async () => {
    const counters = { probes: 0, remaining: 0 };
    const events: string[] = [];
    const state = { tail: Promise.resolve() };
    const locked = (answer: () => Promise<PreviewGateRemaining>) =>
      self({ previewBudgetGate: { ...gateWith(counters, answer), openAdmissionLock: () => memoryLock(events, "ask", state) } }, counters);
    await expect(PostgresAskApplication.prototype.submit.call(locked(async () => remainingWith({ remainingNanoUsd: 1_000_000n })) as never,
      ASK, member.authenticated.session, principal as never)).rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    expect(events).toEqual(["ask:acquired", "ask:released"]);
    await expect(PostgresAskApplication.prototype.submit.call(locked(async () => remainingWith()) as never,
      ASK, member.authenticated.session, principal as never)).rejects.toBeInstanceOf(TypeError);
    expect(events).toEqual(["ask:acquired", "ask:released", "ask:acquired", "ask:released"]);
  });

  it("answers 422 with the not-available code, a fixed plain message and a one-minute Retry-After when the gate is halted", async () => {
    const counters = { probes: 0, remaining: 0 };
    const that = self({ previewBudgetGate: gateWith(counters, async () => remainingWith({ state: "halted" })) }, counters);
    const application = new Proxy({}, {
      get: (_target, property) => property === "submit"
        ? async (askRequest: AskRequest, session: never, p: never) => PostgresAskApplication.prototype.submit.call(that as never, askRequest, session, p)
        : async () => null
    }) as AskApplication;
    const api = buildApi({
      previewProviderTestConfig: PREVIEW, previewTeamUserIds: [member.authenticated.userId],
      application, sessions: testSessionApplication([member]), allowedOrigin: TEST_APP_ORIGIN
    });
    try {
      const before = Date.now();
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(member, true), payload: ASK });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ error: UNAVAILABLE });
      expect(JSON.stringify(response.json())).not.toMatch(/halted|gate|nano/u);
      const retryAt = Date.parse(String(response.headers["retry-after"]));
      expect(retryAt - before).toBeGreaterThan(50_000);
      expect(retryAt - before).toBeLessThan(70_000);
    } finally {
      await api.close();
    }
  });

  it("reads unfinished debates as runs with a READY or CLAIMED job and no FAILED one, bounded", () => {
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/work\.state IN \('READY', 'CLAIMED'\)/u);
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/NOT EXISTS[\s\S]*work\.state = 'FAILED'/u);
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/SELECT run\.envelope_basis, run\.discovered_panel/u);
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/LIMIT 65$/u);
    // Review finding 4: a debate writing its story (answer served, no story row yet, a call within the window) is held too.
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/THEN 'DEBATE' ELSE 'STORY' END AS phase/u);
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/\$1::boolean\s+AND EXISTS \(SELECT 1 FROM serve\.answer AS answer WHERE answer\.run_id = run\.run_id\)/u);
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/NOT EXISTS \(SELECT 1 FROM serve\.answer_story AS story WHERE story\.run_id = run\.run_id\)/u);
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/entry\.finished_at > clock_timestamp\(\) - make_interval\(secs => \$2::integer\)/u);
  });

  it("answers 429 DAILY_COST_ENVELOPE_REACHED with a Retry-After and no figures", async () => {
    const counters = { probes: 0, remaining: 0 };
    let created = 0;
    const that = self({ previewBudgetGate: gateWith(counters, async () => remainingWith({ remainingNanoUsd: 0n })) }, counters);
    const application = new Proxy({}, {
      get: (_target, property) => property === "submit"
        ? async (askRequest: AskRequest, session: never, p: never) => {
          await PostgresAskApplication.prototype.submit.call(that as never, askRequest, session, p);
          created += 1;
          return { run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" };
        }
        : async () => null
    }) as AskApplication;
    const api = buildApi({
      previewProviderTestConfig: PREVIEW, previewTeamUserIds: [member.authenticated.userId],
      application, sessions: testSessionApplication([member]), allowedOrigin: TEST_APP_ORIGIN
    });
    try {
      const before = nextBucharestMidnight(new Date()).toUTCString();
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(member, true), payload: ASK });
      const after = nextBucharestMidnight(new Date()).toUTCString();
      expect(response.statusCode).toBe(429);
      // The gate's day ends at Bucharest midnight, not UTC midnight.
      expect([before, after]).toContain(response.headers["retry-after"]);
      // The public body is the code alone: no reason, no figures.
      expect(response.json()).toEqual({ error: "DAILY_COST_ENVELOPE_REACHED", message: "DAILY_COST_ENVELOPE_REACHED" });
      expect(response.headers["retry-after"]).toBeTruthy();
      expect(created).toBe(0);
      expect(counters).toEqual({ probes: 1, remaining: 1 });
    } finally {
      await api.close();
    }
  });
});

describe("the /remaining port reads the gate's reply strictly over a real unix socket", () => {
  const servers: Server[] = [];
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); })));
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  async function gate(answer: (response: ServerResponse) => void, timeoutMs?: number) {
    const directory = await mkdtemp(join(tmpdir(), "pvr-"));
    directories.push(directory);
    const socket = join(directory, "gate.sock");
    const received: string[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received.push(`${request.method} ${request.url} ${Buffer.concat(chunks).toString("utf8")}`);
        answer(response);
      });
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(socket, done));
    return { port: createPreviewRemainingRpcPort({ budget_socket: socket, scope_id: "fixture-scope" }, timeoutMs), received, socket };
  }
  const reply = (status: number, body: unknown) => (response: ServerResponse) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  const GOOD = Object.freeze({
    state: "active", window_open: true, remaining_usd: "2.879512", remaining_calls: 1177,
    max_concurrent_calls: 4, largest_reservation_usd: "0.131481600", enabled_models: [GLM, DEEPSEEK]
  });

  it("posts exactly the scope to /remaining and reads both figures as exact nano-USD", async () => {
    const { port, received } = await gate(reply(200, GOOD));
    await expect(port.remaining()).resolves.toEqual({
      state: "active", windowOpen: true, remainingNanoUsd: 2_879_512_000n, remainingCalls: 1177,
      maxConcurrentCalls: 4, largestReservationNanoUsd: 131_481_600n, enabledModels: [GLM, DEEPSEEK]
    });
    expect(received).toEqual(["POST /remaining {\"scope_id\":\"fixture-scope\"}"]);
  });

  it("accepts whole-dollar and zero figures", async () => {
    const { port } = await gate(reply(200, { ...GOOD, remaining_usd: "0", largest_reservation_usd: "3" }));
    await expect(port.remaining()).resolves.toMatchObject({ remainingNanoUsd: 0n, largestReservationNanoUsd: 3_000_000_000n });
  });

  it.each([
    ["409 stopped", 409, { error: "PREVIEW_TEST_AUTHORITY_STOPPED" }],
    ["500", 500, GOOD],
    ["an extra key", 200, { ...GOOD, held_usd: "0.1" }],
    ["a missing key", 200, (({ window_open: _omit, ...rest }) => rest)(GOOD)],
    ["an unknown state", 200, { ...GOOD, state: "paused" }],
    ["a string window", 200, { ...GOOD, window_open: "true" }],
    ["a number for money", 200, { ...GOOD, remaining_usd: 2.5 }],
    ["ten decimals", 200, { ...GOOD, remaining_usd: "0.1234567891" }],
    ["a negative figure", 200, { ...GOOD, remaining_usd: "-1.00" }],
    ["an exponent", 200, { ...GOOD, largest_reservation_usd: "1e-3" }],
    ["fractional calls", 200, { ...GOOD, remaining_calls: 1.5 }],
    ["negative calls", 200, { ...GOOD, remaining_calls: -1 }],
    ["zero concurrency", 200, { ...GOOD, max_concurrent_calls: 0 }],
    ["a non-string model", 200, { ...GOOD, enabled_models: [GLM, 7] }],
    ["a repeated model", 200, { ...GOOD, enabled_models: [GLM, GLM] }],
    ["an array body", 200, [GOOD]],
    ["non-JSON", 200, "not json"]
  ])("rejects %s as the gate being unreachable", async (_name, status, body) => {
    const { port } = await gate(reply(status, body));
    await expect(port.remaining()).rejects.toMatchObject({ code: PREVIEW_GATE_UNREACHABLE });
  });

  it("rejects an oversize reply", async () => {
    const { port } = await gate((response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ...GOOD, enabled_models: [GLM, "x".repeat(70 * 1024)] }));
    });
    await expect(port.remaining()).rejects.toMatchObject({ code: PREVIEW_GATE_UNREACHABLE });
  });

  it("rejects a gate that never answers, after the timeout", async () => {
    const { port } = await gate(() => undefined, 200);
    await expect(port.remaining()).rejects.toMatchObject({ code: PREVIEW_GATE_UNREACHABLE });
  });

  it("rejects a missing socket and an aborted read", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pvr-"));
    directories.push(directory);
    await expect(createPreviewRemainingRpcPort({ budget_socket: join(directory, "none.sock"), scope_id: "s" }).remaining())
      .rejects.toMatchObject({ code: PREVIEW_GATE_UNREACHABLE });
    const { port } = await gate(() => undefined);
    const controller = new AbortController();
    const pending = port.remaining(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: PREVIEW_GATE_UNREACHABLE });
  });
});

describe("Retry-After names the gate's reset: the next midnight in Bucharest, across clock changes", () => {
  it.each([
    // Summer time (+03:00), the day before clocks go back on 2026-10-25.
    ["2026-10-24T12:00:00.000Z", "2026-10-24T21:00:00.000Z"],
    // Just before and exactly at Bucharest midnight.
    ["2026-10-24T20:59:59.999Z", "2026-10-24T21:00:00.000Z"],
    ["2026-10-24T21:00:00.000Z", "2026-10-25T22:00:00.000Z"],
    // The 25-hour day (04:00 summer time becomes 03:00 winter time): next midnight is at +02:00.
    ["2026-10-25T00:30:00.000Z", "2026-10-25T22:00:00.000Z"],
    ["2026-10-25T12:00:00.000Z", "2026-10-25T22:00:00.000Z"],
    // Winter time (+02:00), the day before clocks go forward on 2027-03-28.
    ["2027-03-27T12:00:00.000Z", "2027-03-27T22:00:00.000Z"],
    // The 23-hour day (03:00 winter time becomes 04:00 summer time): next midnight is at +03:00.
    ["2027-03-28T00:30:00.000Z", "2027-03-28T21:00:00.000Z"],
    ["2027-03-28T12:00:00.000Z", "2027-03-28T21:00:00.000Z"],
    // Year end, UTC still on the old day while Bucharest is on the new one.
    ["2026-12-31T22:30:00.000Z", "2027-01-01T22:00:00.000Z"]
  ])("at %s the gate's day resets at %s", (now, expected) => {
    expect(nextBucharestMidnight(new Date(now)).toISOString()).toBe(expected);
  });

  it("the estimate's refusal carries that instant, and the boundary's Retry-After uses it", () => {
    const now = new Date("2026-10-25T12:00:00.000Z");
    const refusal = new AskRefusal(new PreviewDailyLimitRefusal("synthetic", nextBucharestMidnight(now)));
    expect(refusal.code).toBe("DAILY_COST_ENVELOPE_REACHED");
    expect(askRefusalRetryAfter(refusal.code, now, refusal.retryAt)).toBe("Sun, 25 Oct 2026 22:00:00 GMT");
    // Off the preview the daily code keeps the UTC midnight it always had.
    expect(askRefusalRetryAfter("DAILY_COST_ENVELOPE_REACHED", now)).toBe("Mon, 26 Oct 2026 00:00:00 GMT");
    expect(new AskRefusal(new PreviewDailyLimitRefusal("synthetic", now)).retryAt).toEqual(now);
    // A reset instant already past is ignored (never a Retry-After in the past).
    expect(askRefusalRetryAfter(refusal.code, new Date("2026-10-26T00:00:00.000Z"), refusal.retryAt)).toBe("Tue, 27 Oct 2026 00:00:00 GMT");
  });
});

describe("what one debate is estimated at with today's register (calibrated estimate, default averages)", () => {
  // Today's register after the switch-on: the answer writer, the storyteller and the story checker on GLM
  // (fixture-a, fixture-b), the answer checker on DeepSeek; two story rounds; five declared targets.
  const roleModels = Object.freeze({ answerWriter: GLM, answerChecker: DEEPSEEK, storyteller: GLM, storyChecker: GLM });
  const roleProviderRefs = ["preview:fixture-a", "preview:deepseek-v4-1-flash", "preview:fixture-b"];
  const member = (provider_ref: string, model_id: string) => ({ provider_ref, model_id });
  const FREE = [member("preview:fixture-a", GLM), member("preview:deepseek-v4-1-flash", DEEPSEEK)];
  const PREMIUM = [...FREE, member("preview:mimo-v2-6-pro", MIMO), member("preview:qwen-3-8-flash", QWEN)];
  const basisFor = (panelSize: number, depth: number) => computeStructuralCeilingBasis({ panelSize, depth, judgeMaxAttempts: 3, organMaxAttempts: 3,
    maxRecompose: 2, maxCooldownHoldsPerRun: 2, finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 2, fixedOrgansPerComposition: 4,
    reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
  const figure = (panel: typeof FREE, depth: number) => {
    const input = { basis: basisFor(panel.length, depth), panel, roleModels, roleProviderRefs, storyRounds: 2, callOutputTokens: OUTPUT,
      askProbeModelIds: ASK_PROBE_MODELS, maxCooldownHoldsPerRun: 2 };
    const [need] = estimatePreviewGateNeeds(input);
    return { calls: need!.callsWithMargin, nanoUsd: need!.callsNanoUsd, byModel: callsBy(previewCallShares(input)) };
  };
  it("free GLM + DeepSeek and premium GLM, DeepSeek, MiMo, Qwen: calls and money on the DeepInfra gate", () => {
    // Free, depth 2 (the website's default): 194 debate calls, 97 by each maker (the panel's sites
    // shared, the writer on GLM, the checker on DeepSeek); GLM also 12 health checks and 6 story calls,
    // DeepSeek 6 health checks, MiMo and Qwen one ask-time check each.
    // (97 + 12 + 6) x 1,200,000 + (97 + 6) x 1,520,000 + 2,764,000 + 910,400 = 298,234,400; x 1.15 = 342,969,560 ($0.343).
    expect(figure(FREE, 2)).toEqual({ calls: 479, nanoUsd: 342_969_560n, byModel: {
      [`${GLM} DEBATE`]: 97, [`${GLM} UNBILLED_RETRY`]: 99, [`${GLM} PROBE`]: 12,
      [`${GLM} STORYTELLER`]: 2, [`${GLM} STORYTELLER_RETRY`]: 2, [`${GLM} STORY_CHECKER`]: 2,
      [`${DEEPSEEK} DEBATE`]: 97, [`${DEEPSEEK} UNBILLED_RETRY`]: 97, [`${DEEPSEEK} PROBE`]: 6,
      [`${MIMO} PROBE`]: 1, [`${QWEN} PROBE`]: 1 } });
    // Premium, depth 2: 698 debate calls over four makers ($1.338); then free and premium at depth 1.
    expect(Object.entries(figure(PREMIUM, 2).byModel).filter(([key]) => key.endsWith(" DEBATE")).reduce((sum, [, calls]) => sum + calls, 0))
      .toBeCloseTo(698, 9);
    expect([figure(PREMIUM, 2), figure(FREE, 1), figure(PREMIUM, 1)].map(({ calls, nanoUsd }) => ({ calls, nanoUsd }))).toEqual([
      { calls: 1650, nanoUsd: 1_338_299_205n }, { calls: 276, nanoUsd: 205_337_560n }, { calls: 1024, nanoUsd: 838_269_304n }]);
  });
});
