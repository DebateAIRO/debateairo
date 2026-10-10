// Owner's rule (2026-09-28: never stop a debate half-way; ESTIMATE before it starts, with a tolerance),
// contract A §5, owner ruling 3 of 2026-10-10 (the realistic worst case): on the private preview,
// admission counts each debate step once and prices every call at 64 KiB in and the full max_tokens it
// asks for out (a health check at its one-line body), x 1.15, adds each gate's concurrency hold (its
// calls at once x its largest worst-case reservation, from the gate's reply) and holds back every
// unfinished debate, asks the gate's read-only POST /remaining what is left today, and refuses a debate that
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
  previewDebateCallCount,
  previewModeReadsMeasuredUsage,
  previewMeasuredCallUsageFrom,
  calibratedEstimatePricer,
  realisticWorstCasePricer,
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
  PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL,
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
// THE ACTIVE MODE (realistic worst case, owner ruling 2026-10-10), calls: debate 30 (each of the basis's
// 30 sites once, not its ceiling of 120 repeat attempts); story 2 rounds x 3 = 6; pickup health checks
// (1 + hold_cap 2 + 2 restarts) x (2 panel members + fixture-b, the checker, off the panel) = 15; this
// ask's own health checks 5; one unbilled retry per one-attempt call 30 + 2 = 32. Total 88.
const EXPECTED_CALLS = 88;
// With the 15% margin: ceil(101.2) = 102; plus 4 in flight = 106 calls needed.
const CALLS_NEEDED = 106;
// One call at the realistic worst case, in nano-USD: 67,584 tokens in (64 KiB + 2,048) and the call's own
// max_tokens out (debate 8,192; storyteller 12,000, its retry 24,000; story check 8,192); a health check
// at its one-line body (1,024 + 2,048 in) and 8,192 out.
const REAL = Object.freeze({
  GLM: 67_584n * 150n + 8192n * 500n, DEEPSEEK: 67_584n * 200n + 8192n * 600n, MIMO: 67_584n * 430n + 8192n * 870n,
  QWEN: 67_584n * 113n + 8192n * 382n,
  PROBE_GLM: 3072n * 150n + 8192n * 500n, PROBE_DEEPSEEK: 3072n * 200n + 8192n * 600n,
  PROBE_MIMO: 3072n * 430n + 8192n * 870n, PROBE_QWEN: 3072n * 113n + 8192n * 382n,
  STORYTELLER_GLM: 67_584n * 150n + 12_000n * 500n, STORYTELLER_RETRY_GLM: 67_584n * 150n + 24_000n * 500n
});
// Who makes which call (per-gate shares): the panel's 24 sites, 12 per member; the answer writer's and
// checker's 3 sites each, on GLM. GLM: 12 + 3 + 3 = 18 debate calls, 12 health checks (5 + 5 pickups for
// its seat and fixture-b, 2 at ask time), 2 story rounds; DeepSeek: 12 debate, 6 checks; MiMo and Qwen one
// ask-time check each. Unbilled retries cost nothing.
// 18 x 14,233,600 + 12 x 18,432,000 + 12 x 4,556,800 + 6 x 5,529,600 + 8,448,000 + 3,476,480
//   + 2 x (16,137,600 + 22,137,600 + 14,233,600) = 682,190,080; x 1.15 = 784,518,592 ($0.785).
const CALLS_BASE = 18n * REAL.GLM + 12n * REAL.DEEPSEEK + 12n * REAL.PROBE_GLM + 6n * REAL.PROBE_DEEPSEEK + REAL.PROBE_MIMO + REAL.PROBE_QWEN
  + 2n * (REAL.STORYTELLER_GLM + REAL.STORYTELLER_RETRY_GLM + REAL.GLM);
const CALLS_NANO = 784_518_592n;
/** The gate's largest worst-case reservation under the hard caps with GLM and DeepSeek switched on (DeepSeek, 128 KiB). */
const LARGEST = 46_284_800n;
const ESTIMATE = CALLS_NANO + 4n * LARGEST;
/** MiMo's worst-case reservation under the hard caps: (131,072 + 2,048) x 430 + 32,768 x 870 nano-USD. */
const MIMO_LARGEST = 85_749_760n;

// THE CALIBRATED ESTIMATE (owner option 2, kept one constant away): the basis's ceiling of 120 debate calls
// (30 sites x 4), so 268 calls in all; an average call (4,000 in, 1,200 out) at each row's list price.
const CALIBRATED = Object.freeze({ debateCallCount: "BASIS_CEILING" as const, pricer: calibratedEstimatePricer([]) });
const CAL_EXPECTED_CALLS = 268;
const AVG = Object.freeze({ GLM: 1_200_000n, DEEPSEEK: 1_520_000n, MIMO: 2_764_000n, QWEN: 910_400n });
// GLM: 48 + 12 + 12 debate, 12 checks, 6 story = 90 calls; DeepSeek: 48 debate, 6 checks = 54; MiMo, Qwen 1 each.
// 90 x 1,200,000 + 54 x 1,520,000 + 2,764,000 + 910,400 = 193,754,400; x 1.15 = 222,817,560.
const CAL_CALLS_NANO = 222_817_560n;
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

describe("the start-of-debate estimate is a realistic worst case, per gate (pure)", () => {
  it("counts each debate step once, the story with its repair, every pickup and ask health check, and the unbilled retries", () => {
    expect(previewExpectedCalls({ basis: basis(2), panel: PANEL, ...ROLES, askProbeTargets: 5 }))
      .toEqual({ debate: 30, story: 6, probes: 15, askProbes: 5, unbilledRetries: 32, total: EXPECTED_CALLS });
    // The calibrated mode counted the basis's ceiling of every repeat attempt instead.
    expect(previewExpectedCalls({ basis: basis(2), panel: PANEL, ...ROLES, askProbeTargets: 5, debateCallCount: "BASIS_CEILING" }))
      .toEqual({ debate: 120, story: 6, probes: 15, askProbes: 5, unbilledRetries: 122, total: CAL_EXPECTED_CALLS });
    // A basis without a per-site split is counted at its ceiling in either mode.
    expect(previewExpectedCalls({ basis: { panel_size: 2, max_model_attempts: 10 }, panel: PANEL, ...ROLES }).debate).toBe(10);
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES });
    expect(CALLS_BASE * 115n / 100n).toBe(CALLS_NANO);
    expect(need).toEqual({ gate: "deepinfra", modelIds: [GLM, DEEPSEEK], expectedCalls: EXPECTED_CALLS, callsWithMargin: 102, callsNanoUsd: CALLS_NANO });
    expect(previewGateEstimateNanoUsd(need!, remainingWith())).toBe(ESTIMATE);
    expect(previewGateEstimateCalls(need!, remainingWith())).toBe(CALLS_NEEDED);
  });

  it("puts each call on the model that makes it: the panel's sites shared by the panel, the answer roles' on their models", () => {
    const calls = previewCallShares({ basis: basis(2), panel: PANEL, ...ROLES });
    expect(callsBy(calls)).toEqual({
      [`${GLM} DEBATE`]: 18, [`${GLM} UNBILLED_RETRY`]: 20, [`${DEEPSEEK} DEBATE`]: 12, [`${DEEPSEEK} UNBILLED_RETRY`]: 12,
      [`${GLM} PROBE`]: 12, [`${DEEPSEEK} PROBE`]: 6, [`${MIMO} PROBE`]: 1, [`${QWEN} PROBE`]: 1,
      [`${GLM} STORYTELLER`]: 2, [`${GLM} STORYTELLER_RETRY`]: 2, [`${GLM} STORY_CHECKER`]: 2
    });
    // The shares add up to the count exactly.
    const total = calls.shares.reduce((sum, share) => sum + share.numerator, 0n);
    expect(total).toBe(BigInt(EXPECTED_CALLS) * calls.denominator);
    // The basis's ceiling (the calibrated mode) splits its 120 calls in the same proportions.
    expect(callsBy(previewCallShares({ basis: basis(2), panel: PANEL, ...ROLES, debateCallCount: "BASIS_CEILING" }))).toMatchObject({
      [`${GLM} DEBATE`]: 72, [`${GLM} UNBILLED_RETRY`]: 74, [`${DEEPSEEK} DEBATE`]: 48, [`${DEEPSEEK} UNBILLED_RETRY`]: 48 });
    // The answer checker on MiMo moves its 3 debate calls (and their retries) there, and only those.
    const checkerOnMimo = callsBy(previewCallShares({ basis: basis(2), panel: PANEL, ...ROLES, roleModels: { ...ROLE_MODELS, answerChecker: MIMO } }));
    expect(checkerOnMimo[`${MIMO} DEBATE`]).toBe(3);
    expect(checkerOnMimo[`${GLM} DEBATE`]).toBe(15);
    // A basis without a role split puts every debate call on the panel, evenly.
    expect(callsBy(previewCallShares({ basis: { panel_size: 2, max_model_attempts: 10 }, panel: PANEL, ...ROLES }))[`${DEEPSEEK} DEBATE`]).toBe(5);
    // A story without its roles is a fault.
    expect(() => previewCallShares({ basis: basis(2), panel: PANEL, ...ROLES, roleModels: { ...ROLE_MODELS, storyteller: null } }))
      .toThrow("PREVIEW_STORY_ROLE_MISSING");
  });

  it("each gate is charged only for its own models' calls, each at its own row: a dearer answer checker costs exactly its calls", () => {
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, roleModels: { ...ROLE_MODELS, answerChecker: MIMO } });
    // 3 checker calls move from GLM to MiMo: + 3 x (36,188,160 - 14,233,600) = 65,863,680 before the margin.
    expect(need).toMatchObject({ modelIds: [GLM, DEEPSEEK, MIMO], callsNanoUsd: (CALLS_BASE + 3n * (REAL.MIMO - REAL.GLM)) * 115n / 100n });
    expect(() => estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, roleModels: { ...ROLE_MODELS, answerWriter: "other/model" } })).toThrow();
    expect(() => estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, roleProviderRefs: ["preview:unknown"] })).toThrow("PREVIEW_MODEL_UNREVIEWED");
  });

  it("prices an average call: 4,000 in and 1,200 out at the row's list price, x 1.15, output clamped to the row", () => {
    const pricer = calibratedEstimatePricer([]);
    expect(pricer(previewModelRow(GLM)!, "DEBATE")).toBe(AVG.GLM);
    expect(pricer(previewModelRow(DEEPSEEK)!, "STORYTELLER")).toBe(AVG.DEEPSEEK);
    expect(pricer(previewModelRow(MIMO)!, "PROBE")).toBe(AVG.MIMO);
    expect(pricer(previewModelRow(QWEN)!, "STORY_CHECKER")).toBe(AVG.QWEN);
    expect(previewCallNanoUsd(previewModelRow(QWEN)!, 0n, 200_000)).toBe(32_768n * 382n);
    // No cached-input discount: every prompt token at the full input price.
    expect(previewCallNanoUsd(previewModelRow(QWEN)!, 1_000_000n, 0)).toBe(113_000_000n);
    // x 1.15, rounded up: 193,754,400 -> 222,817,560 (exact); one nano-USD more rounds up.
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, ...CALIBRATED });
    expect(need!.callsNanoUsd).toBe(193_754_400n * 115n / 100n);
    expect(need!.callsNanoUsd).toBe(CAL_CALLS_NANO);
  });

  it("prices a realistic worst case: 64 KiB + 2,048 in, the call's own max_tokens out (clamped to the row), a health check at its one-line body", () => {
    expect(PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL).toBe(65_536n + 2048n);
    const realistic = realisticWorstCasePricer(OUTPUT);
    expect(realistic(previewModelRow(GLM)!, "DEBATE")).toBe(REAL.GLM);
    expect(realistic(previewModelRow(GLM)!, "STORYTELLER")).toBe(REAL.STORYTELLER_GLM);
    expect(realistic(previewModelRow(GLM)!, "STORYTELLER_RETRY")).toBe(REAL.STORYTELLER_RETRY_GLM);
    expect(realistic(previewModelRow(DEEPSEEK)!, "STORY_CHECKER")).toBe(REAL.DEEPSEEK);
    expect(realistic(previewModelRow(MIMO)!, "PROBE")).toBe(REAL.PROBE_MIMO);
    expect(realistic(previewModelRow(QWEN)!, "DEBATE")).toBe(REAL.QWEN);
    // A call that asks for more than the row's answer cap is priced at the cap (32,768).
    expect(realisticWorstCasePricer({ ...OUTPUT, debate: 100_000 })(previewModelRow(MIMO)!, "DEBATE")).toBe(67_584n * 430n + 32_768n * 870n);
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
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, debateCallCount: "BASIS_CEILING",
      pricer: calibratedEstimatePricer([sample(DEEPSEEK, "DEBATE", 20, 10_000, 3_000)]) });
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

  it("the pricing is ONE switch: the realistic worst case (2026-10-10) is active; the calibrated estimate and the strict bound are one constant away", () => {
    expect(PREVIEW_ESTIMATE_PRICING_MODE).toBe("REALISTIC_WORST_CASE");
    expect(previewDebateCallCount()).toBe("PER_STEP");
    expect(previewModeReadsMeasuredUsage()).toBe(false);
    const context = { measured: [], callOutputTokens: OUTPUT };
    const deepseek = previewModelRow(DEEPSEEK)!;
    expect(previewEstimatePricer(context)(deepseek, "DEBATE")).toBe(REAL.DEEPSEEK);
    expect(previewEstimatePricer(context, "CALIBRATED_ESTIMATE")(deepseek, "DEBATE")).toBe(AVG.DEEPSEEK);
    expect([previewDebateCallCount("CALIBRATED_ESTIMATE"), previewModeReadsMeasuredUsage("CALIBRATED_ESTIMATE")]).toEqual(["BASIS_CEILING", true]);
    const strict = previewEstimatePricer(context, "STRICT_BOUND");
    expect(previewDebateCallCount("STRICT_BOUND")).toBe("BASIS_CEILING");
    // The strict bound's input is the hard 128 KiB body cap (owner ruling, 2026-10-10).
    expect(PREVIEW_STRICT_INPUT_TOKENS_PER_CALL).toBe(131_072n + 2048n);
    expect(PREVIEW_STRICT_PROBE_INPUT_TOKENS).toBe(1024n + 2048n);
    expect(strict(deepseek, "DEBATE")).toBe(133_120n * 200n + 8192n * 600n);
    expect(strict(deepseek, "STORYTELLER_RETRY")).toBe(133_120n * 200n + 24_000n * 600n);
    expect(strict(deepseek, "PROBE")).toBe(3072n * 200n + 8192n * 600n);
    expect(strictUpperBoundPricer(OUTPUT)(deepseek, "STORY_CHECKER")).toBe(strict(deepseek, "DEBATE"));
    // Per call: the calibrated average < the realistic worst case < the strict bound.
    expect(AVG.DEEPSEEK < REAL.DEEPSEEK && REAL.DEEPSEEK < strict(deepseek, "DEBATE")).toBe(true);
    // The same debate under the strict bound and the basis's ceiling costs far more than the realistic worst case.
    const [bound] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, pricer: strict, debateCallCount: "BASIS_CEILING" });
    expect(bound!.callsNanoUsd > 5n * CALLS_NANO).toBe(true);
    expect(bound!.expectedCalls).toBe(CAL_EXPECTED_CALLS);
  });

  it("an unfinished debate holds its whole estimate but its ask's probes; an older model off the rows is priced at the dearest row", () => {
    const [hold] = estimateUnfinishedRunHolds({ basis: basis(2), panel: PANEL }, ROLES);
    // Without this ask's five health checks (2 x GLM, DeepSeek, MiMo, Qwen: 26,567,680): 655,622,400 x 1.15.
    const askChecks = 2n * REAL.PROBE_GLM + REAL.PROBE_DEEPSEEK + REAL.PROBE_MIMO + REAL.PROBE_QWEN;
    expect(askChecks).toBe(26_567_680n);
    expect(hold).toEqual({ gate: "deepinfra", modelIds: [GLM, DEEPSEEK], expectedCalls: EXPECTED_CALLS - 5, callsWithMargin: 96,
      callsNanoUsd: 753_965_760n });
    expect((CALLS_BASE - askChecks) * 115n / 100n).toBe(753_965_760n);
    const old = estimateUnfinishedRunHolds({ basis: basis(2), panel: [{ provider_ref: "preview:other", model_id: "old/model" }] }, ROLES);
    const asMimo = estimateUnfinishedRunHolds({ basis: basis(2), panel: [{ provider_ref: "preview:other", model_id: MIMO }] }, ROLES);
    expect(old[0]!.callsNanoUsd).toBe(asMimo[0]!.callsNanoUsd);
    // The same pricing as the new debate: a measured average applies to the held debate too.
    const measuredPricer = calibratedEstimatePricer([sample(DEEPSEEK, "DEBATE", 20, 10_000, 3_000)]);
    expect(estimateUnfinishedRunHolds({ basis: basis(2), panel: PANEL }, ROLES, measuredPricer, "BASIS_CEILING")[0]!.callsNanoUsd)
      .toBe((186_160_000n + 48n * (3_800_000n - 1_520_000n)) * 115n / 100n);
  });

  it("a debate only writing its story holds the story's calls: 3 per round plus the checker's retry", () => {
    const [story] = estimateUnfinishedRunHolds({ basis: basis(2), panel: PANEL, phase: "STORY" }, ROLES);
    // 2 rounds x (storyteller 16,137,600, its repair 22,137,600, the check 14,233,600) on GLM = 105,017,600; x 1.15.
    expect(story).toMatchObject({ gate: "deepinfra", expectedCalls: 8, callsWithMargin: 10, callsNanoUsd: 120_770_240n });
    expect(estimateUnfinishedRunHolds({ basis: basis(2), panel: PANEL, phase: "STORY" }, { ...ROLES, storyRounds: 0 })[0])
      .toMatchObject({ expectedCalls: 0, callsNanoUsd: 0n });
  });

  it("Qwen is priced from its own row, on the DeepInfra gate", () => {
    expect(previewGateKeyOf(QWEN)).toBe("deepinfra");
    const qwenRoles = { answerWriter: QWEN, answerChecker: QWEN, storyteller: QWEN, storyChecker: QWEN };
    const input = { ...ROLES, basis: basis(1), panel: [{ provider_ref: "preview:qwen-3-8-flash", model_id: QWEN }],
      roleModels: qwenRoles, roleProviderRefs: ["preview:qwen-3-8-flash"], askProbeModelIds: [QWEN] };
    // 30 debate calls x 10,766,336 + 6 health checks x 3,476,480 + 2 story rounds x (12,220,992 + 16,804,992
    // + 10,766,336) = 423,433,600; x 1.15. Calls: 30 + 5 + 1 + 6 + 32 unbilled retries = 74.
    expect(estimatePreviewGateNeeds(input)).toEqual([{ gate: "deepinfra", modelIds: [QWEN], expectedCalls: 74, callsWithMargin: 86,
      callsNanoUsd: 486_948_640n }]);
    // At the calibrated average (the basis's ceiling, 4,000 in / 1,200 out): 132 billed calls x 910,400 = 120,172,800; x 1.15.
    expect(estimatePreviewGateNeeds({ ...input, ...CALIBRATED })).toEqual([{ gate: "deepinfra", modelIds: [QWEN], expectedCalls: 254,
      callsWithMargin: 293, callsNanoUsd: 138_198_720n }]);
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
    // A running debate holds its estimate without its own ask's health checks: 753,965,760 and 96 calls.
    const pot = remainingWith({ remainingNanoUsd: ESTIMATE + 753_965_760n - 1n });
    const running = [{ basis: basis(2), panel: PANEL }];
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => pot) }), ASK)).resolves.toBeDefined();
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => pot, running) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    // The calls held count too.
    const calls = remainingWith({ remainingCalls: CALLS_NEEDED + 95 });
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => calls, running) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
  });

  it("adds the gate's concurrency hold: its calls in flight at once x its largest reservation (10 x MiMo's on the preview)", async () => {
    const counters = { probes: 0, remaining: 0 };
    const hold = 10n * MIMO_LARGEST;
    const pot = (remainingNanoUsd: bigint) => remainingWith({ remainingNanoUsd, maxConcurrentCalls: 10, largestReservationNanoUsd: MIMO_LARGEST });
    expect(previewGateEstimateNanoUsd(estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES })[0]!, pot(0n))).toBe(CALLS_NANO + hold);
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => pot(CALLS_NANO + hold)) }), ASK))
      .resolves.toBeDefined();
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters, async () => pot(CALLS_NANO + hold - 1n)) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    // Ten calls in flight need ten calls of room too.
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate: gateWith(counters,
      async () => remainingWith({ maxConcurrentCalls: 10, remainingCalls: 102 + 9 })) }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
  });

  it("the realistic worst case never reads the app's measured averages: they neither move the figure nor refuse when unreadable", async () => {
    const counters = { probes: 0, remaining: 0 };
    let reads = 0;
    const measured = async () => { reads += 1; return [sample(DEEPSEEK, "DEBATE", 20, 900_000, 900_000)]; };
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate:
      gateWith(counters, async () => remainingWith({ remainingNanoUsd: ESTIMATE, remainingCalls: CALLS_NEEDED }), [], measured) }), ASK)).resolves.toBeDefined();
    await expect(evaluateAskAdmission(settings(counters, { previewBudgetGate:
      gateWith(counters, async () => remainingWith(), [], async () => { throw new Error("db gone"); }) }), ASK)).resolves.toBeDefined();
    expect(reads).toBe(0);
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
      previewBudgetGate: gateWith(counters, async () => remainingWith({ enabledModels, largestReservationNanoUsd: MIMO_LARGEST })) });
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
    max_concurrent_calls: 4, largest_reservation_usd: "0.046284800", enabled_models: [GLM, DEEPSEEK]
  });

  it("posts exactly the scope to /remaining and reads both figures as exact nano-USD", async () => {
    const { port, received } = await gate(reply(200, GOOD));
    await expect(port.remaining()).resolves.toEqual({
      state: "active", windowOpen: true, remainingNanoUsd: 2_879_512_000n, remainingCalls: 1177,
      maxConcurrentCalls: 4, largestReservationNanoUsd: 46_284_800n, enabledModels: [GLM, DEEPSEEK]
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

describe("what one debate is estimated at with today's register (realistic worst case, owner ruling 2026-10-10)", () => {
  // Today's register after the switch-on: the answer writer, the storyteller and the story checker on GLM
  // (fixture-a, fixture-b), the answer checker on DeepSeek; two story rounds; five declared targets.
  const roleModels = Object.freeze({ answerWriter: GLM, answerChecker: DEEPSEEK, storyteller: GLM, storyChecker: GLM });
  const roleProviderRefs = ["preview:fixture-a", "preview:deepseek-v4-1-flash", "preview:fixture-b"];
  const member = (provider_ref: string, model_id: string) => ({ provider_ref, model_id });
  const FREE = [member("preview:fixture-a", GLM), member("preview:deepseek-v4-1-flash", DEEPSEEK)];
  const PREMIUM = [...FREE, member("preview:mimo-v2-6-pro", MIMO), member("preview:qwen-3-8-flash", QWEN)];
  /** The owner's all-five roster: Claude Haiku's calls go through the Anthropic gate (PR #126), not this one. */
  const HAIKU = "claude-haiku-5-5";
  const ALL_FIVE = [...PREMIUM, member("preview:claude-haiku-5-5", HAIKU)];
  const basisFor = (panelSize: number, depth: number) => computeStructuralCeilingBasis({ panelSize, depth, judgeMaxAttempts: 3, organMaxAttempts: 3,
    maxRecompose: 2, maxCooldownHoldsPerRun: 2, finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 2, fixedOrgansPerComposition: 4,
    reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
  /** The register's sealed ceilings: every organ and synthesis bound 2,048, the storyteller 12,000, the story checker 2,048. */
  const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture", free_model_ids: [GLM, DEEPSEEK],
    premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN] }))!;
  const sent = previewCallOutputTokens(config, { debate: [2048, 2048, 2048, 2048, 2048], story: { storyteller: 12_000, checker: 2048 } });
  /** The DeepInfra gate's /remaining figures under the owner's GO: 10 at once x MiMo's worst case (the largest of the four). */
  const HOLD = 10n * MIMO_LARGEST;
  /** DeepInfra calls x 1.15 + 10 in flight: free 136 -> 167, premium 450 -> 528, all five 578 -> 675. */
  const [FREE_CALLS, PREMIUM_CALLS, ALL_FIVE_CALLS] = [167, 528, 675];
  // Checked against an independent float computation of the same rule ($2.1073, $5.8524, $7.3174).
  const [FREE_NANO, PREMIUM_NANO, ALL_FIVE_NANO] = [2_107_285_952n, 5_852_436_672n, 7_317_446_439n];
  /** The DeepInfra gate's part of one debate: its calls with the margin plus 10 in flight, and its money in nano-USD with the hold. */
  const deepinfraFigure = (panel: readonly { provider_ref: string; model_id: string }[], depth: number) => {
    const shares = previewCallShares({ basis: basisFor(panel.length, depth), panel, roleModels, roleProviderRefs, storyRounds: 2,
      maxCooldownHoldsPerRun: 2, askProbeModelIds: [...ASK_PROBE_MODELS, ...(panel.some((entry) => entry.model_id === HAIKU) ? [HAIKU] : [])] });
    const pricer = realisticWorstCasePricer(sent);
    let calls = 0n;
    let money = 0n;
    for (const share of shares.shares) {
      const row = previewModelRow(share.model);
      if (row === undefined) continue; // Claude Haiku: the Anthropic gate's share.
      calls += share.numerator;
      if (share.type !== "UNBILLED_RETRY") money += share.numerator * pricer(row, share.type);
    }
    const ceil = (value: bigint) => (value + shares.denominator - 1n) / shares.denominator;
    const expectedCalls = ceil(calls);
    const callsNanoUsd = (ceil(money) * 115n + 99n) / 100n;
    return { calls: Number((expectedCalls * 115n + 99n) / 100n) + 10, nanoUsd: callsNanoUsd + HOLD };
  };

  it("no call the app makes asks for more than the 32,768-token answer cap (owner ruling, 2026-10-10)", () => {
    expect(sent).toEqual({ debate: 8192, storyteller: 12_000, storytellerRetry: 24_000, storyChecker: 8192 });
    for (const tokens of Object.values(sent)) expect(tokens).toBeLessThanOrEqual(32_768);
    // Even a register ceiling above the cap is clamped by each row's bound before it is priced (and the
    // gateway clamps what is sent, preview-multi-model.test.ts).
    for (const row of [GLM, DEEPSEEK, MIMO, QWEN].map((model) => previewModelRow(model)!)) {
      expect(row.outputBound).toBe(32_768);
      expect(previewCallNanoUsd(row, 0n, 65_536)).toBe(32_768n * row.outputNanoUsdPerToken);
    }
  });

  it("free, premium and the all-five roster at depth 2 (the website's default) fit the $10.00 DeepInfra day and its 2,000 calls", () => {
    // The new debate alone, through the real estimate: free GLM + DeepSeek, depth 2.
    const [free] = estimatePreviewGateNeeds({ basis: basisFor(2, 2), panel: FREE, roleModels, roleProviderRefs, storyRounds: 2,
      callOutputTokens: sent, askProbeModelIds: ASK_PROBE_MODELS, maxCooldownHoldsPerRun: 2 });
    expect(free!.callsNanoUsd + HOLD).toBe(deepinfraFigure(FREE, 2).nanoUsd);
    const figures = { free: deepinfraFigure(FREE, 2), premium: deepinfraFigure(PREMIUM, 2), allFive: deepinfraFigure(ALL_FIVE, 2) };
    expect(figures).toEqual({
      free: { calls: FREE_CALLS, nanoUsd: FREE_NANO },
      premium: { calls: PREMIUM_CALLS, nanoUsd: PREMIUM_NANO },
      allFive: { calls: ALL_FIVE_CALLS, nanoUsd: ALL_FIVE_NANO }
    });
    // About $2.11, $5.85 and $7.32: all under the $10.00 pot, and all under 2,000 calls.
    expect([FREE_NANO, PREMIUM_NANO, ALL_FIVE_NANO].map((nano) => Math.round(Number(nano) / 1e7) / 100)).toEqual([2.11, 5.85, 7.32]);
    for (const figure of Object.values(figures)) {
      expect(figure.nanoUsd < 10_000_000_000n).toBe(true);
      expect(figure.calls).toBeLessThan(2000);
    }
  });
});
