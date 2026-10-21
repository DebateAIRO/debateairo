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
import { afterEach, describe, expect, it, vi } from "vitest";
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
  PREVIEW_ESTIMATE_PRICING_MODE,
  PREVIEW_MEASURED_USAGE_SQL,
  PREVIEW_STRICT_INPUT_TOKENS_PER_CALL,
  PREVIEW_STRICT_PROBE_INPUT_TOKENS,
  PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL,
  PREVIEW_STORY_REQUEST_BYTES,
  PREVIEW_STORY_TIER_FALLBACK,
  previewEstimateInputTokens,
  type PreviewAdmissionLock,
  type PreviewCallOutputTokens,
  type PreviewCallShares,
  type PreviewMeasuredCallUsage,
  previewCallOutputTokens,
  previewUnfinishedRunFrom,
  readPreviewBudgetGateSettings,
  PreviewGateUnavailableRefusal,
  PREVIEW_UNFINISHED_RUNS_SQL,
  type PreviewUnfinishedRun,
  type PreviewVersionTerms,
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
  composition_budget_tier: "high", plan_tier: "free", depth_params: { depth: 1 },
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
/**
 * The max_tokens each call sends on the preview with today's register bounds (all organ and synthesis bounds 2,048 -> the 8,192 floor).
 * Story format robustness (2026-10-12): the storyteller asks for its row's whole answer cap (32,768 on every row), and its retry is
 * held to that cap by each row's clamp; the story checker's repair try asks for at most twice its 8,192 (16,384).
 */
const OUTPUT: PreviewCallOutputTokens = Object.freeze({ debate: 8192, storyteller: 32_768, storytellerRetry: 65_536, storyChecker: 8192 });
/** Every role on GLM; the five declared targets (two GLM refs, DeepSeek, MiMo, Qwen) are health-checked at ask time. */
const ROLE_MODELS = Object.freeze({ answerWriter: GLM, answerChecker: GLM, storyteller: GLM, storyChecker: GLM });
const ASK_PROBE_MODELS = Object.freeze([GLM, GLM, DEEPSEEK, MIMO, QWEN]);
// THE ACTIVE MODE (realistic worst case, owner ruling 2026-10-10), calls: debate 30 (each of the basis's
// 30 sites once, not its ceiling of 120 repeat attempts); story 2 rounds x 4 = 8 (the storyteller and the
// checker each with one repair try, 2026-10-12); pickup health checks (1 + hold_cap 2 + 2 restarts) x
// (2 panel members + fixture-b, the checker, off the panel) = 15; this ask's own health checks 5; one
// unbilled retry per one-attempt debate call 30. Total 88 (the checker's repair took its unbilled retry's place).
const EXPECTED_CALLS = 88;
// With the 15% margin: ceil(101.2) = 102; plus 4 in flight = 106 calls needed.
const CALLS_NEEDED = 106;
// One call at the realistic worst case, in nano-USD. Owner rulings 2026-10-10: request sizes become tokens at
// 3 bytes per token (the gate itself keeps bytes = tokens). A debate call's prompt is 64 KiB: (65,536 + 2,048)
// / 3 = 22,528 tokens; a story call's is its story size's largest measured request (+ 2,048) / 3; the answer
// is the call's own max_tokens (debate 8,192; storyteller its row's story allowance, GLM 16,384 (slow answer, owner ruling
// 2026-10-12), its length retry twice that, held to the row's 32,768; story check 8,192, its repair 16,384); a
// health check is its one-line body (1,024 + 2,048 in, bytes as tokens) and 8,192 out.
const IN = 22_528n;
const STORY_IN = Object.freeze({
  low: { storyteller: 33_451n, storyChecker: 41_302n }, // 96 KiB and 119 KiB
  medium: { storyteller: 53_248n, storyChecker: 61_440n }, // 154 KiB and 178 KiB
  high: { storyteller: 73_387n, storyChecker: 81_579n } // 213 KiB and 237 KiB
});
const REAL = Object.freeze({
  GLM: IN * 150n + 8192n * 500n, DEEPSEEK: IN * 200n + 8192n * 600n, MIMO: IN * 430n + 8192n * 870n, QWEN: IN * 113n + 8192n * 382n,
  PROBE_GLM: 3072n * 150n + 8192n * 500n, PROBE_DEEPSEEK: 3072n * 200n + 8192n * 600n,
  PROBE_MIMO: 3072n * 430n + 8192n * 870n, PROBE_QWEN: 3072n * 113n + 8192n * 382n,
  // The test ask's story size is "high" (the largest; also what an unknown size is held at).
  STORYTELLER_GLM: STORY_IN.high.storyteller * 150n + 16_384n * 500n,
  STORYTELLER_RETRY_GLM: STORY_IN.high.storyteller * 150n + 32_768n * 500n,
  STORY_CHECKER_GLM: STORY_IN.high.storyChecker * 150n + 131_072n * 500n,
  STORY_CHECKER_RETRY_GLM: STORY_IN.high.storyChecker * 150n + 131_072n * 500n,
  // LG-B (L26): the answer writer and checker (final writers) at the row's own maximum (GLM 131,072; MiMo 65,536).
  FW_GLM: IN * 150n + 131_072n * 500n,
  FW_MIMO: IN * 430n + 65_536n * 870n
});
/** x 1.15, rounded up, as the estimate does. */
const margin = (value: bigint) => (value * 115n + 99n) / 100n;
// Who makes which call (per-gate shares): of the panel's 24 sites, the 16 that are not reviews are shared,
// 8 per member; the 8 reviews all go to the gate's dearest panel member (DeepSeek); the answer writer's and
// checker's 3 sites each, on GLM. GLM: 8 shared debate calls, 3 ANSWER_WRITER and 3 ANSWER_CHECKER calls at 131,072 out,
// 12 health checks (5 + 5 pickups for its seat and fixture-b, 2 at ask time), 2 story rounds; DeepSeek: 8 + 8 = 16
// debate, 6 checks; MiMo and Qwen one ask-time check each. Unbilled retries cost nothing.
// 8 x 7,475,200 + 6 x 68,915,200 + 16 x 9,420,800 + 12 x 4,556,800 + 6 x 5,529,600 + 8,448,000 + 3,476,480
//   + 2 x (19,200,050 + 27,392,050 + 77,772,850 + 77,772,850) = 1,128,084,880; x 1.15 = 1,297,297,612 (rounded up; $1.30).
// LG-B (L26, 2026-10-15): the answer writer and checker and the story checker ask each model's own maximum (GLM 131,072);
// before LG-B 521,876,880, x 1.15 = 600,158,412 ($0.60).
// Before the slow-answer ruling (2026-10-12; GLM's storyteller asked 32,768): 2 x (27,392,050 + 27,392,050 + ...),
// 538,260,880, x 1.15 = 619,000,012 ($0.62).
// Before story format robustness (2026-10-12): 2 x (17,008,050 + 23,008,050 + 16,332,850), 538,047,257 ($0.54).
const CALLS_BASE = 8n * REAL.GLM + 6n * REAL.FW_GLM + 16n * REAL.DEEPSEEK + 12n * REAL.PROBE_GLM + 6n * REAL.PROBE_DEEPSEEK + REAL.PROBE_MIMO
  + REAL.PROBE_QWEN + 2n * (REAL.STORYTELLER_GLM + REAL.STORYTELLER_RETRY_GLM + REAL.STORY_CHECKER_GLM + REAL.STORY_CHECKER_RETRY_GLM);
const CALLS_NANO = 1_297_297_612n;
/** The gate's largest worst-case reservation under the hard caps with GLM and DeepSeek switched on (DeepSeek, 256 KiB). */
const LARGEST = 72_499_200n;
const ESTIMATE = CALLS_NANO + 4n * LARGEST;
/** MiMo's worst-case reservation under the hard caps: (262,144 + 2,048) x 430 + 32,768 x 870 nano-USD. */
const MIMO_LARGEST = 142_110_720n;

// THE CALIBRATED ESTIMATE (owner option 2, kept one constant away): the basis's ceiling of 120 debate calls
// (30 sites x 4), so 268 calls in all; an average call (4,000 in, 1,200 out) at each row's list price.
const CALIBRATED = Object.freeze({ debateCallCount: "BASIS_CEILING" as const, pricer: calibratedEstimatePricer([]) });
const CAL_EXPECTED_CALLS = 268;
const AVG = Object.freeze({ GLM: 1_200_000n, DEEPSEEK: 1_520_000n, MIMO: 2_764_000n, QWEN: 910_400n });
// GLM: 32 + 12 + 12 debate, 12 checks, 8 story = 76 calls; DeepSeek: 32 + 32 reviews debate, 6 checks = 70;
// MiMo, Qwen 1 each. 76 x 1,200,000 + 70 x 1,520,000 + 2,764,000 + 910,400 = 201,274,400; x 1.15 = 231,465,560.
const CAL_BASE = 201_274_400n;
const CAL_CALLS_NANO = 231_465_560n;
const UNAVAILABLE = "ASK_MODEL_CANDIDATE_UNAVAILABLE";

function remainingWith(patch: Partial<PreviewGateRemaining> = {}): PreviewGateRemaining {
  return Object.freeze({
    state: "active", windowOpen: true, remainingNanoUsd: 100_000_000_000n, remainingCalls: 100_000,
    maxConcurrentCalls: 4, largestReservationNanoUsd: LARGEST, enabledModels: [GLM, DEEPSEEK], ...patch
  });
}

type Counters = { probes: number; remaining: number };

/** The fixture gate's own register version's terms (side-by-side C16). */
const GATE_TERMS: PreviewVersionTerms = Object.freeze({ roleModels: ROLE_MODELS,
  roleProviderRefs: Object.freeze(["preview:fixture-a", "preview:fixture-b"]), storyRounds: 2, callOutputTokens: OUTPUT,
  maxCooldownHoldsPerRun: 2 });

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
    // Every unfinished debate here was admitted under the API's own version (C16 cases build their own gate).
    termsForVersion: async () => GATE_TERMS,
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
      .toEqual({ debate: 30, story: 8, probes: 15, askProbes: 5, unbilledRetries: 30, total: EXPECTED_CALLS });
    // The calibrated mode counted the basis's ceiling of every repeat attempt instead.
    expect(previewExpectedCalls({ basis: basis(2), panel: PANEL, ...ROLES, askProbeTargets: 5, debateCallCount: "BASIS_CEILING" }))
      .toEqual({ debate: 120, story: 8, probes: 15, askProbes: 5, unbilledRetries: 120, total: CAL_EXPECTED_CALLS });
    // A basis without a per-site split is counted at its ceiling in either mode.
    expect(previewExpectedCalls({ basis: { panel_size: 2, max_model_attempts: 10 }, panel: PANEL, ...ROLES }).debate).toBe(10);
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES });
    expect(margin(CALLS_BASE)).toBe(CALLS_NANO);
    expect(need).toEqual({ gate: "deepinfra", modelIds: [GLM, DEEPSEEK], expectedCalls: EXPECTED_CALLS, callsWithMargin: 102, callsNanoUsd: CALLS_NANO });
    expect(previewGateEstimateNanoUsd(need!, remainingWith())).toBe(ESTIMATE);
    expect(previewGateEstimateCalls(need!, remainingWith())).toBe(CALLS_NEEDED);
  });

  it("puts each call on the model that makes it: the panel's sites shared by the panel, the answer roles' on their models", () => {
    const calls = previewCallShares({ basis: basis(2), panel: PANEL, ...ROLES });
    expect(callsBy(calls)).toEqual({
      [`${GLM} DEBATE`]: 8, [`${GLM} ANSWER_WRITER`]: 3, [`${GLM} ANSWER_CHECKER`]: 3, [`${GLM} UNBILLED_RETRY`]: 14, [`${DEEPSEEK} DEBATE`]: 16, [`${DEEPSEEK} UNBILLED_RETRY`]: 16,
      [`${GLM} PROBE`]: 12, [`${DEEPSEEK} PROBE`]: 6, [`${MIMO} PROBE`]: 1, [`${QWEN} PROBE`]: 1,
      [`${GLM} STORYTELLER`]: 2, [`${GLM} STORYTELLER_RETRY`]: 2, [`${GLM} STORY_CHECKER`]: 2, [`${GLM} STORY_CHECKER_RETRY`]: 2
    });
    // The shares add up to the count exactly.
    const total = calls.shares.reduce((sum, share) => sum + share.numerator, 0n);
    expect(total).toBe(BigInt(EXPECTED_CALLS) * calls.denominator);
    // The basis's ceiling (the calibrated mode) splits its 120 calls in the same proportions.
    expect(callsBy(previewCallShares({ basis: basis(2), panel: PANEL, ...ROLES, debateCallCount: "BASIS_CEILING" }))).toMatchObject({
      [`${GLM} DEBATE`]: 32, [`${GLM} UNBILLED_RETRY`]: 56, [`${DEEPSEEK} DEBATE`]: 64, [`${DEEPSEEK} UNBILLED_RETRY`]: 64 });
    // The reviews (the basis's 8 REVIEWER sites) go to each gate's dearest panel member, here DeepSeek: a
    // node's review goes to another maker in a fixed order (apps/runner/src/index.ts:834), not evenly.
    // The answer checker on MiMo moves its 3 ANSWER_CHECKER calls (and their retries) there, and only those.
    const checkerOnMimo = callsBy(previewCallShares({ basis: basis(2), panel: PANEL, ...ROLES, roleModels: { ...ROLE_MODELS, answerChecker: MIMO } }));
    expect(checkerOnMimo[`${MIMO} ANSWER_CHECKER`]).toBe(3);
    expect(checkerOnMimo[`${GLM} DEBATE`]).toBe(8);
    // A basis without a role split puts every debate call on the panel, evenly.
    expect(callsBy(previewCallShares({ basis: { panel_size: 2, max_model_attempts: 10 }, panel: PANEL, ...ROLES }))[`${DEEPSEEK} DEBATE`]).toBe(5);
    // A story without its roles is a fault.
    expect(() => previewCallShares({ basis: basis(2), panel: PANEL, ...ROLES, roleModels: { ...ROLE_MODELS, storyteller: null } }))
      .toThrow("PREVIEW_STORY_ROLE_MISSING");
  });

  it("each gate is charged only for its own models' calls, each at its own row: an answer checker on another row costs exactly its calls", () => {
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, roleModels: { ...ROLE_MODELS, answerChecker: MIMO } });
    // 3 checker calls move from GLM to MiMo at each row's own maximum: + 3 x (66,703,360 - 68,915,200) = -6,635,520 before the margin (LG-B: MiMo's 65,536 out is below GLM's 131,072, so the move is now cheaper).
    expect(need).toMatchObject({ modelIds: [GLM, DEEPSEEK, MIMO], callsNanoUsd: 1_289_666_764n });
    expect(margin(CALLS_BASE + 3n * (REAL.FW_MIMO - REAL.FW_GLM))).toBe(1_289_666_764n);
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
    expect(need!.callsNanoUsd).toBe(CAL_BASE * 115n / 100n);
    expect(need!.callsNanoUsd).toBe(CAL_CALLS_NANO);
  });

  it("prices a realistic worst case: 64 KiB at 3 bytes per token in, the call's own max_tokens out (clamped to the row), a health check at its one-line body", () => {
    expect(PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL).toBe((65_536n + 2048n) / 3n);
    expect(PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL).toBe(IN);
    // Rounded up: 1 byte + 2,048 = 2,049 -> 683 tokens; 2 bytes -> 684.
    expect([previewEstimateInputTokens(1), previewEstimateInputTokens(2)]).toEqual([683n, 684n]);
    const realistic = realisticWorstCasePricer(OUTPUT);
    expect(realistic(previewModelRow(GLM)!, "DEBATE")).toBe(REAL.GLM);
    expect(realistic(previewModelRow(GLM)!, "STORYTELLER")).toBe(REAL.STORYTELLER_GLM);
    expect(realistic(previewModelRow(GLM)!, "STORYTELLER_RETRY")).toBe(REAL.STORYTELLER_RETRY_GLM);
    expect(realistic(previewModelRow(GLM)!, "STORY_CHECKER")).toBe(REAL.STORY_CHECKER_GLM);
    expect(realistic(previewModelRow(GLM)!, "STORY_CHECKER_RETRY")).toBe(REAL.STORY_CHECKER_RETRY_GLM);
    expect(realistic(previewModelRow(MIMO)!, "PROBE")).toBe(REAL.PROBE_MIMO);
    expect(realistic(previewModelRow(QWEN)!, "DEBATE")).toBe(REAL.QWEN);
    // A call that asks for more than the row's answer cap is priced at the cap (32,768).
    expect(realisticWorstCasePricer({ ...OUTPUT, debate: 100_000 })(previewModelRow(MIMO)!, "DEBATE")).toBe(IN * 430n + 32_768n * 870n);
  });

  it("the story size changes the story calls' price only: its largest measured request at 3 bytes per token", () => {
    expect(PREVIEW_STORY_REQUEST_BYTES).toEqual({
      low: { storyteller: 96 * 1024, storyChecker: 119 * 1024 },
      medium: { storyteller: 154 * 1024, storyChecker: 178 * 1024 },
      high: { storyteller: 213 * 1024, storyChecker: 237 * 1024 } });
    const glm = previewModelRow(GLM)!;
    for (const tier of ["low", "medium", "high"] as const) {
      const pricer = realisticWorstCasePricer(OUTPUT, tier);
      expect(previewEstimateInputTokens(PREVIEW_STORY_REQUEST_BYTES[tier].storyteller)).toBe(STORY_IN[tier].storyteller);
      expect(previewEstimateInputTokens(PREVIEW_STORY_REQUEST_BYTES[tier].storyChecker)).toBe(STORY_IN[tier].storyChecker);
      expect(pricer(glm, "STORYTELLER")).toBe(STORY_IN[tier].storyteller * 150n + 16_384n * 500n);
      expect(pricer(glm, "STORYTELLER_RETRY")).toBe(STORY_IN[tier].storyteller * 150n + 32_768n * 500n);
      expect(pricer(glm, "STORY_CHECKER")).toBe(STORY_IN[tier].storyChecker * 150n + 131_072n * 500n);
      expect(pricer(glm, "STORY_CHECKER_RETRY")).toBe(STORY_IN[tier].storyChecker * 150n + 131_072n * 500n);
      expect([pricer(glm, "DEBATE"), pricer(glm, "PROBE")]).toEqual([REAL.GLM, REAL.PROBE_GLM]);
    }
    // An unknown size (and the default) is the largest.
    expect(PREVIEW_STORY_TIER_FALLBACK).toBe("high");
    expect(realisticWorstCasePricer(OUTPUT)(glm, "STORY_CHECKER")).toBe(REAL.STORY_CHECKER_GLM);
    // The same debate by story size: low 1,241,950,642; medium 1,269,505,792; high 1,297,297,612 (x 1.15, rounded up).
    const needAt = (tier: "low" | "medium" | "high") =>
      estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, pricer: realisticWorstCasePricer(OUTPUT, tier) })[0]!.callsNanoUsd;
    expect([needAt("low"), needAt("medium"), needAt("high")]).toEqual([1_241_950_642n, 1_269_505_792n, CALLS_NANO]);
  });

  it("the app's own measured average replaces the default once it has 20 calls of that kind by that model, at today's prices", () => {
    const deepseek = previewModelRow(DEEPSEEK)!;
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
    // The story bucket calibrates the storyteller, the story check and each one's repair; health checks never.
    for (const type of ["STORYTELLER", "STORYTELLER_RETRY", "STORY_CHECKER", "STORY_CHECKER_RETRY"] as const) {
      expect(previewCallAverage(GLM, type, measured)).toEqual({ inputTokens: 6_000n, outputTokens: 2_001n, measured: true });
    }
    expect(previewCallAverage(GLM, "PROBE", [...measured, sample(GLM, "DEBATE", 50, 9, 9)]).measured).toBe(false);
    // In the gate's need: DeepSeek's 64 debate calls (its 32 and the 32 reviews) at 3,800,000 instead of 1,520,000.
    const [need] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, debateCallCount: "BASIS_CEILING",
      pricer: calibratedEstimatePricer([sample(DEEPSEEK, "DEBATE", 20, 10_000, 3_000)]) });
    expect(need!.callsNanoUsd).toBe((CAL_BASE + 64n * (3_800_000n - 1_520_000n)) * 115n / 100n);
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
    // The strict bound's input is the hard 256 KiB body cap (owner ruling, 2026-10-10), bytes as tokens.
    expect(PREVIEW_STRICT_INPUT_TOKENS_PER_CALL).toBe(262_144n + 2048n);
    expect(PREVIEW_STRICT_PROBE_INPUT_TOKENS).toBe(1024n + 2048n);
    expect(strict(deepseek, "DEBATE")).toBe(264_192n * 200n + 8192n * 600n);
    expect(strict(deepseek, "STORYTELLER_RETRY")).toBe(BigInt(1024 * 1024 + 2048) * 200n + 131_072n * 600n);
    expect(strict(deepseek, "STORY_CHECKER_RETRY")).toBe(BigInt(1024 * 1024 + 2048) * 200n + 131_072n * 600n);
    expect(strict(deepseek, "PROBE")).toBe(3072n * 200n + 8192n * 600n);
    expect(strictUpperBoundPricer(OUTPUT)(deepseek, "STORY_CHECKER")).toBe(BigInt(1024 * 1024 + 2048) * 200n + 131_072n * 600n);
    // Per call: the calibrated average < the realistic worst case < the strict bound.
    expect(AVG.DEEPSEEK < REAL.DEEPSEEK && REAL.DEEPSEEK < strict(deepseek, "DEBATE")).toBe(true);
    // The same debate under the strict bound and the basis's ceiling costs far more than the realistic worst case.
    const [bound] = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, pricer: strict, debateCallCount: "BASIS_CEILING" });
    expect(bound!.callsNanoUsd > 5n * CALLS_NANO).toBe(true);
    expect(bound!.expectedCalls).toBe(CAL_EXPECTED_CALLS);
  });

  it("an unfinished debate holds its whole estimate but its ask's probes; an older model off the rows is priced at the dearest row", () => {
    const [hold] = estimateUnfinishedRunHolds({ registerVersion: 5, basis: basis(2), panel: PANEL }, ROLES);
    // Without this ask's five health checks (2 x GLM, DeepSeek, MiMo, Qwen: 26,567,680): 1,101,517,200 x 1.15.
    const askChecks = 2n * REAL.PROBE_GLM + REAL.PROBE_DEEPSEEK + REAL.PROBE_MIMO + REAL.PROBE_QWEN;
    expect(askChecks).toBe(26_567_680n);
    expect(hold).toEqual({ gate: "deepinfra", modelIds: [GLM, DEEPSEEK], expectedCalls: EXPECTED_CALLS - 5, callsWithMargin: 96,
      callsNanoUsd: 1_266_744_780n });
    expect(margin(CALLS_BASE - askChecks)).toBe(1_266_744_780n);
    const old = estimateUnfinishedRunHolds({ registerVersion: 5, basis: basis(2), panel: [{ provider_ref: "preview:other", model_id: "old/model" }] }, ROLES);
    const asMimo = estimateUnfinishedRunHolds({ registerVersion: 5, basis: basis(2), panel: [{ provider_ref: "preview:other", model_id: MIMO }] }, ROLES);
    expect(old[0]!.callsNanoUsd).toBe(asMimo[0]!.callsNanoUsd);
    // The same pricing as the new debate: a measured average applies to the held debate too.
    const measuredPricer = calibratedEstimatePricer([sample(DEEPSEEK, "DEBATE", 20, 10_000, 3_000)]);
    expect(estimateUnfinishedRunHolds({ registerVersion: 5, basis: basis(2), panel: PANEL }, ROLES, measuredPricer, "BASIS_CEILING")[0]!.callsNanoUsd)
      .toBe((193_680_000n + 64n * (3_800_000n - 1_520_000n)) * 115n / 100n);
  });

  it("a debate only writing its story holds the story's calls: 4 per round, the storyteller's and the checker's repair included", () => {
    const [story] = estimateUnfinishedRunHolds({ registerVersion: 5, basis: basis(2), panel: PANEL, phase: "STORY" }, ROLES);
    // 2 rounds x (storyteller 19,200,050 at GLM's 16,384 story allowance, its repair 27,392,050, the check 77,772,850,
    // its repair 77,772,850 (both at GLM's own 131,072)) on GLM at the largest story size (the run row carries none here)
    // = 404,275,600; x 1.15, rounded up.
    expect(story).toMatchObject({ gate: "deepinfra", expectedCalls: 8, callsWithMargin: 10, callsNanoUsd: 464_916_940n });
    // A run whose ask chose the low story size is held at that size.
    expect(estimateUnfinishedRunHolds({ registerVersion: 5, basis: basis(2), panel: PANEL, phase: "STORY" }, ROLES, realisticWorstCasePricer(OUTPUT, "low"))[0])
      .toMatchObject({ callsNanoUsd: 409_569_970n });
    expect(estimateUnfinishedRunHolds({ registerVersion: 5, basis: basis(2), panel: PANEL, phase: "STORY" }, { ...ROLES, storyRounds: 0 })[0])
      .toMatchObject({ expectedCalls: 0, callsNanoUsd: 0n });
  });

  it("Qwen is priced from its own row, on the DeepInfra gate", () => {
    expect(previewGateKeyOf(QWEN)).toBe("deepinfra");
    const qwenRoles = { answerWriter: QWEN, answerChecker: QWEN, storyteller: QWEN, storyChecker: QWEN };
    const input = { ...ROLES, basis: basis(1), panel: [{ provider_ref: "preview:qwen-3-8-flash", model_id: QWEN }],
      roleModels: qwenRoles, roleProviderRefs: ["preview:qwen-3-8-flash"], askProbeModelIds: [QWEN] };
    // A one-model panel is never reviewed (the runner reviews only across makers), so of the fixture's 30
    // sites its 8 reviews drop: 16 debate calls x 5,675,008 + the writer's 3 and the checker's 3 at Qwen's own 131,072 out
    // (6 x 52,615,168) + 6 health checks x 3,476,480 + 2 story rounds (4 calls each) at the largest story size (its
    // storyteller at Qwen's 16,384 story allowance, its checker and the checker's repair at 131,072) = 735,224,792; x 1.15,
    // rounded up. Calls: 22 + 8 + 6 + 22 unbilled retries = 58.
    // LG-B (L26, 2026-10-15): before, every call at 8,192 out (the checker's repair 16,384): 272,081,880, x 1.15 = 312,894,162;
    // + 6 x (52,615,168 - 5,675,008) + 2 x ((131,072 - 8,192) + (131,072 - 16,384)) x 382 = 735,224,792.
    expect(estimatePreviewGateNeeds(input)).toEqual([{ gate: "deepinfra", modelIds: [QWEN], expectedCalls: 58, callsWithMargin: 67,
      callsNanoUsd: 845_508_511n }]);
    // At the calibrated average (the basis's ceiling of 120, its 32 reviews dropped; 4,000 in / 1,200 out):
    // 88 + 8 + 6 = 102 billed calls x 910,400 = 92,860,800; x 1.15. Calls: 102 + 88 unbilled retries = 190.
    expect(estimatePreviewGateNeeds({ ...input, ...CALIBRATED })).toEqual([{ gate: "deepinfra", modelIds: [QWEN], expectedCalls: 190,
      callsWithMargin: 219, callsNanoUsd: 106_789_920n }]);
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

  it("spec 2026-10-12 §4.7: the owner's thinking levels never move the estimate (the call count and the price are the same)", async () => {
    const HAIKU = "claude-haiku-5-5";
    const levelled = parsePreviewProviderTestConfig(JSON.stringify({
      deployment: "v3-preview", free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN],
      requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture",
      thinking_levels: { [DEEPSEEK]: { level: "none" }, [HAIKU]: { level: "low" } }
    }))!;
    expect(levelled.thinking_levels).toBeDefined();
    // The one estimate function that takes the config: the same output ceilings.
    const ceilings = { debate: [2048, 16_000], story: { storyteller: 12_000, checker: 2048 } };
    expect(previewCallOutputTokens(levelled, ceilings)).toEqual(previewCallOutputTokens(PREVIEW, ceilings));
    // The whole admission: exactly the same estimate admits, one nano-USD or one call below refuses, as without a table.
    const counters = { probes: 0, remaining: 0 };
    const withLevels = (patch: Partial<PreviewGateRemaining>) => settings(counters, { previewProviderTestConfig: levelled,
      previewBudgetGate: gateWith(counters, async () => remainingWith(patch)) });
    await expect(evaluateAskAdmission(withLevels({ remainingNanoUsd: ESTIMATE, remainingCalls: CALLS_NEEDED }), ASK)).resolves.toBeDefined();
    await expect(evaluateAskAdmission(withLevels({ remainingNanoUsd: ESTIMATE - 1n }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    await expect(evaluateAskAdmission(withLevels({ remainingCalls: CALLS_NEEDED - 1 }), ASK))
      .rejects.toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
  });

  it("debates still running hold their estimate: a pot that fits one debate refuses the second", async () => {
    const counters = { probes: 0, remaining: 0 };
    // A running debate holds its estimate without its own ask's health checks: 1,266,744,780 and 96 calls.
    const pot = remainingWith({ remainingNanoUsd: ESTIMATE + 1_266_744_780n - 1n });
    const running = [{ basis: basis(2), panel: PANEL, registerVersion: 5 }];
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
    // A lock_timeout backstop right after BEGIN: a lock held elsewhere refuses instead of waiting forever.
    expect(queries).toEqual(["BEGIN", "SET LOCAL lock_timeout = '10s'",
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0)) ${JSON.stringify([PREVIEW_ADMISSION_LOCK_NAME])}`]);
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

  it("more waiting asks than the pool has connections never freeze it: asks queue in process, one holds a connection", async () => {
    // A fake pool of 2 connections (connect waits for a free one, no timeout, like pg's default) and a fake
    // transaction-scoped advisory lock: the holder also needs a SECOND connection (the unfinished debates,
    // then the run). Before the in-process queue, 2 waiting asks took both connections and all froze.
    const size = 2;
    let free = size;
    let busiest = 0;
    const connectWaiters: Array<() => void> = [];
    let lockHolder: object | undefined;
    const lockWaiters: Array<() => void> = [];
    const pool = {
      async connect() {
        if (free === 0) await new Promise<void>((resolve) => connectWaiters.push(resolve));
        else free -= 1;
        busiest = Math.max(busiest, size - free);
        const client = {
          async query(sql: string) {
            if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
              while (lockHolder !== undefined && lockHolder !== client) await new Promise<void>((resolve) => lockWaiters.push(resolve));
              lockHolder = client;
            }
            if (sql === "COMMIT" && lockHolder === client) { lockHolder = undefined; lockWaiters.splice(0).forEach((wake) => wake()); }
            return { rows: [] };
          },
          release() { const next = connectWaiters.shift(); if (next === undefined) free += 1; else next(); }
        };
        return client;
      }
    };
    const order: number[] = [];
    const ask = async (index: number) => {
      const lock = createPreviewAdmissionLock(pool as never);
      await lock.acquire();
      const other = await pool.connect(); // the holder's own queries on a second connection
      await new Promise((resolve) => setTimeout(resolve, 2));
      other.release();
      order.push(index);
      await lock.release();
    };
    const asks = 4 * size + 1;
    await Promise.all(Array.from({ length: asks }, (_unused, index) => ask(index)));
    expect(order).toHaveLength(asks);
    expect(busiest).toBeLessThanOrEqual(size);
  });

  it("an ask that waits in process longer than the wait limit is refused as not available, not as the daily limit", async () => {
    const client = { query: async () => ({ rows: [] }), release: () => undefined };
    const pool = { connect: async () => client };
    const holder = createPreviewAdmissionLock(pool as never);
    await holder.acquire();
    const counters = { probes: 0, remaining: 0 };
    await expect(assertPreviewBudgetAdmits(gateWith(counters, async () => remainingWith()), { basis: basis(2), panel: PANEL }, undefined,
      createPreviewAdmissionLock(pool as never, { waitMs: 20 }))).rejects.toBeInstanceOf(PreviewGateUnavailableRefusal);
    expect(counters.remaining).toBe(0);
    // Once the holder is done, the next ask goes ahead.
    await holder.release();
    const next = createPreviewAdmissionLock(pool as never, { waitMs: 20 });
    await expect(next.acquire()).resolves.toBeUndefined();
    await next.release();
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
        started.push({ basis: basis(2), panel: PANEL, registerVersion: 5 });
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

  it("the output ceilings: the preview floor, the storyteller at its row's cap (2026-10-12) and its retry at twice that, no story means none", () => {
    const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture", free_model_ids: [GLM] }))!;
    expect(previewCallOutputTokens(config, { debate: [2048, 16_000], story: { storyteller: 12_000, checker: 2048 } }))
      .toEqual({ debate: 16_000, storyteller: 131_072, storytellerRetry: 262_144, storyChecker: 8192 });
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
    // Each held debate is priced at its own ask's story size.
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/^SELECT run\.envelope_basis, run\.discovered_panel, run\.composition_budget_tier,/u);
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
    max_concurrent_calls: 4, largest_reservation_usd: "0.072499200", enabled_models: [GLM, DEEPSEEK]
  });

  it("posts exactly the scope to /remaining and reads both figures as exact nano-USD", async () => {
    const { port, received } = await gate(reply(200, GOOD));
    await expect(port.remaining()).resolves.toEqual({
      state: "active", windowOpen: true, remainingNanoUsd: 2_879_512_000n, remainingCalls: 1177,
      maxConcurrentCalls: 4, largestReservationNanoUsd: 72_499_200n, enabledModels: [GLM, DEEPSEEK]
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
  /**
   * The Anthropic gate's (PR #126): 2 at once x Claude Haiku's worst case at its upper price step. Prompt caching
   * (2026-10-12): a full-size CACHED call, its input at the 5-minute write price ($0.625 / $2.50):
   * (262,144 + 2,048) x 625 + 32,768 x 2,500 nano-USD each (it was 500 for input before).
   */
  const ANTHROPIC_HOLD = 2n * (264_192n * 625n + 32_768n * 2500n);
  /**
   * Claude Haiku in the estimate: the lower price step ($0.10 / $0.50), the same realistic sizes as every row. Prompt
   * caching (2026-10-12) leaves it there: only the cached system prefix pays the write premium, and reads cost a tenth.
   */
  const haikuCall = (type: string): bigint => type === "PROBE" ? 3072n * 100n + 8192n * 500n : IN * 100n + 8192n * 500n;
  /**
   * One debate's need of each gate at the largest story size: calls x 1.15 + calls in flight (10 DeepInfra, 2 Anthropic),
   * money x 1.15 + the gate's hold. Haiku's calls are the Anthropic gate's share.
   */
  const gateFigures = (panel: readonly { provider_ref: string; model_id: string }[], depth: number) => {
    const hasHaiku = panel.some((entry) => entry.model_id === HAIKU);
    const shares = previewCallShares({ basis: basisFor(panel.length, depth), panel, roleModels, roleProviderRefs, storyRounds: 2,
      maxCooldownHoldsPerRun: 2, askProbeModelIds: [...ASK_PROBE_MODELS, ...(hasHaiku ? [HAIKU] : [])] });
    const pricer = realisticWorstCasePricer(sent, "high");
    const sums = { deepinfra: { calls: 0n, money: 0n }, anthropic: { calls: 0n, money: 0n } };
    for (const share of shares.shares) {
      // PR B: Haiku has a reviewed row of its own, on the Anthropic gate; it is priced here independently.
      const haiku = share.model === HAIKU;
      expect(previewModelRow(share.model)!.provider).toBe(haiku ? "anthropic" : "deepinfra");
      const sum = haiku ? sums.anthropic : sums.deepinfra;
      sum.calls += share.numerator;
      if (share.type !== "UNBILLED_RETRY") sum.money += share.numerator * (haiku ? haikuCall(share.type) : pricer(previewModelRow(share.model)!, share.type));
    }
    const ceil = (value: bigint) => (value + shares.denominator - 1n) / shares.denominator;
    const figure = (sum: { calls: bigint; money: bigint }, inFlight: number, hold: bigint) =>
      ({ calls: Number(margin(ceil(sum.calls))) + inFlight, nanoUsd: margin(ceil(sum.money)) + hold });
    return { deepinfra: figure(sums.deepinfra, 10, HOLD), ...(hasHaiku ? { anthropic: figure(sums.anthropic, 2, ANTHROPIC_HOLD) } : {}) };
  };
  it("no standard call asks for more than the 32,768-token answer cap (owner ruling, 2026-10-10); the final writers ask their row's own maximum (LG-B, L26)", () => {
    expect(sent).toEqual({ debate: 8192, storyteller: 131_072, storytellerRetry: 262_144, storyChecker: 8192 });
    // LG-B (L26): the storyteller asks the largest row's own maximum (DeepSeek, 131,072); every other ceiling stays within the cap.
    for (const tokens of [sent.debate, sent.storyChecker]) expect(tokens).toBeLessThanOrEqual(32_768);
    expect(sent.storyteller).toBe(131_072);
    // Even a register ceiling above the cap is clamped by each row's bound before it is priced (and the
    // gateway clamps what is sent, preview-multi-model.test.ts).
    for (const row of [GLM, DEEPSEEK, MIMO, QWEN].map((model) => previewModelRow(model)!)) {
      expect(row.outputBound).toBe(32_768);
      expect(previewCallNanoUsd(row, 0n, 65_536)).toBe(32_768n * row.outputNanoUsdPerToken);
    }
  });

  it("depth 1-3 (the preview's most) x free, premium and all five fit DeepInfra's $12.00 / 2,000 and Anthropic's $4.00 / 600 (owner answer M1)", () => {
    // The new debate alone, through the real estimate: free GLM + DeepSeek, depth 2, largest story size.
    const [free] = estimatePreviewGateNeeds({ basis: basisFor(2, 2), panel: FREE, roleModels, roleProviderRefs, storyRounds: 2,
      callOutputTokens: sent, askProbeModelIds: ASK_PROBE_MODELS, maxCooldownHoldsPerRun: 2 });
    expect(free!.callsNanoUsd + HOLD).toBe(gateFigures(FREE, 2).deepinfra.nanoUsd);
    expect([HOLD, ANTHROPIC_HOLD]).toEqual([1_421_107_200n, 494_080_000n]);
    // Premium, depth 1: 24 nodes, each reviewed once; every review is priced on MiMo, the dearest of the four.
    const premiumCalls = callsBy(previewCallShares({ basis: basisFor(4, 1), panel: PREMIUM, roleModels, roleProviderRefs, storyRounds: 2,
      maxCooldownHoldsPerRun: 2, askProbeModelIds: ASK_PROBE_MODELS }));
    expect(premiumCalls[`${MIMO} DEBATE`]! - premiumCalls[`${QWEN} DEBATE`]!).toBeCloseTo(24, 9);
    const usd = (nano: bigint) => Math.round(Number(nano) / 1e7) / 100;
    const table = [1, 2, 3].map((depth) => {
      const five = gateFigures(ALL_FIVE, depth);
      return [gateFigures(FREE, depth).deepinfra, gateFigures(PREMIUM, depth).deepinfra, five.deepinfra, five.anthropic!]
        .map(({ calls, nanoUsd }) => [usd(nanoUsd), calls]);
    });
    // Checked against an independent computation of the same rule. Rows: depth 1, 2, 3; columns: free, premium,
    // all five (DeepInfra's share), all five (Anthropic's share); each [dollars, calls].
    // Story format robustness (2026-10-12): the storyteller at its row's cap and the checker's priced repair add
    // $0.08 to each DeepInfra column (the story roles are GLM's here); the calls do not change.
    // Before: [1.97, 3.34, 4.05, 0.92], [2.21, 4.38, 5.35, 1.18], [2.69, 6.45, 7.93, 1.71].
    // Prompt caching (2026-10-12): the Anthropic gate's in-flight hold is 2 x $0.24704 (a cached full-size call) instead
    // of 2 x $0.214016, so its column rises by $0.066048 (0.92 / 1.18 / 1.71 before); its calls and DeepInfra's do not move.
    // Slow answer (owner ruling 2026-10-12): GLM's storyteller asks 16,384, not 32,768: 2 rounds x 16,384 x $0.50/M x 1.15
    // = $0.0188416 less on each DeepInfra column; calls and the Anthropic column do not move.
    // Before: [2.05, 3.42, 4.14], [2.29, 4.46, 5.43], [2.77, 6.53, 8.01].
    // LG-B (L26, 2026-10-15): final writers at each model's own maximum; owner answer M1's GO budgets $12 (DeepInfra) / $4 (Anthropic). Before: [[2.03, 112], [3.41, 344], [4.12, 470], [0.98, 154]], [[2.27, 167], [4.44, 528], [5.41, 700], [1.25, 237]], [[2.75, 277], [6.51, 896], [7.99, 1160], [1.77, 403]].
    expect(table).toEqual([
      [[2.77, 112], [4.15, 344], [4.86, 470], [0.98, 154]],
      [[3.01, 167], [5.18, 528], [6.15, 700], [1.25, 237]],
      [[3.49, 277], [7.25, 896], [8.73, 1160], [1.77, 403]]
    ]);
    // PR B: the real estimate gives each gate exactly its share (the Anthropic gate's hold from its own /remaining).
    for (const depth of [1, 2, 3]) {
      const needs = estimatePreviewGateNeeds({ basis: basisFor(ALL_FIVE.length, depth), panel: ALL_FIVE, roleModels, roleProviderRefs,
        storyRounds: 2, callOutputTokens: sent, askProbeModelIds: [...ASK_PROBE_MODELS, HAIKU], maxCooldownHoldsPerRun: 2 });
      const five = gateFigures(ALL_FIVE, depth);
      expect(needs.map((need) => need.gate)).toEqual(["deepinfra", "anthropic"]);
      expect(needs.map((need) => [need.callsWithMargin, need.callsNanoUsd])).toEqual([
        [five.deepinfra.calls - 10, five.deepinfra.nanoUsd - HOLD], [five.anthropic!.calls - 2, five.anthropic!.nanoUsd - ANTHROPIC_HOLD]]);
      expect(needs[1]!.modelIds).toEqual([HAIKU]);
    }
    for (const [freeFigure, premiumFigure, fiveDeepinfra, fiveAnthropic] of table) {
      for (const [dollars, calls] of [freeFigure!, premiumFigure!, fiveDeepinfra!]) {
        expect(dollars).toBeLessThanOrEqual(12);
        expect(calls).toBeLessThanOrEqual(2000);
      }
      expect(fiveAnthropic![0]).toBeLessThanOrEqual(4);
      // Owner ruling 2026-10-10: the Anthropic gate allows 600 calls a day (all five at depth 3 needs 403).
      expect(fiveAnthropic![1]).toBeLessThanOrEqual(600);
    }
  });
});

describe("a rotated debate: each role on every gate, at that gate's dearest panel member (spec 2026-10-11, Part 5)", () => {
  const HAIKU = "claude-haiku-5-5";
  const member = (provider_ref: string, model_id: string) => ({ provider_ref, model_id });
  const FREE = [member("preview:fixture-a", GLM), member("preview:deepseek-v4-1-flash", DEEPSEEK)];
  const PREMIUM = [...FREE, member("preview:mimo-v2-6-pro", MIMO), member("preview:qwen-3-8-flash", QWEN)];
  const ALL_FIVE = [...PREMIUM, member("preview:claude-haiku-5-5", HAIKU)];
  const roleModels = Object.freeze({ answerWriter: GLM, answerChecker: DEEPSEEK, storyteller: GLM, storyChecker: GLM });
  const roleProviderRefs = ["preview:fixture-a", "preview:deepseek-v4-1-flash", "preview:fixture-b"];
  const basisFor = (panelSize: number, depth: number) => computeStructuralCeilingBasis({ panelSize, depth, judgeMaxAttempts: 3, organMaxAttempts: 3,
    maxRecompose: 2, maxCooldownHoldsPerRun: 2, finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 2, fixedOrgansPerComposition: 4,
    reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 }) as unknown as Readonly<Record<string, unknown>>;
  const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture", free_model_ids: [GLM, DEEPSEEK],
    premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN] }))!;
  const sent = previewCallOutputTokens(config, { debate: [2048, 2048, 2048, 2048, 2048], story: { storyteller: 12_000, checker: 2048 } });
  const HOLD = 10n * MIMO_LARGEST;
  const ANTHROPIC_HOLD = 2n * (264_192n * 625n + 32_768n * 2500n); // A cached full-size call each (2026-10-12).
  const needs = (panel: readonly { provider_ref: string; model_id: string }[], depth: number, rotated: boolean) =>
    estimatePreviewGateNeeds({ basis: basisFor(panel.length, depth), panel, roleModels, roleProviderRefs, storyRounds: 2, callOutputTokens: sent,
      askProbeModelIds: [...ASK_PROBE_MODELS, ...(panel.some((entry) => entry.model_id === HAIKU) ? [HAIKU] : [])], maxCooldownHoldsPerRun: 2, rotated });

  it("puts the answer roles on the dearest DEBATE member and the story roles on the dearest story member of each gate", () => {
    const shares = previewCallShares({ basis: basisFor(5, 1), panel: ALL_FIVE, roleModels, roleProviderRefs, storyRounds: 2,
      maxCooldownHoldsPerRun: 2, rotated: true,
      dearestFor: (models, role) => models.includes(MIMO) ? MIMO : models.includes(HAIKU) ? HAIKU : models[0]! });
    const calls = callsBy(shares);
    expect(calls[`${MIMO} STORYTELLER`]).toBe(2);
    expect(calls[`${HAIKU} STORYTELLER`]).toBe(2);
    expect(calls[`${MIMO} STORY_CHECKER`]).toBe(2);
    expect(calls[`${HAIKU} STORY_CHECKER`]).toBe(2);
    expect(calls[`${GLM} STORYTELLER`]).toBeUndefined();
    // No off-panel role refs: fixture-b is never health-checked for a rotated debate.
    expect(shares.shares.filter((share) => share.type === "PROBE" && share.model === GLM).length).toBe(1);
  });

  it("names only the panel's models on each gate (the register's role models are not called)", () => {
    const [deepinfra] = needs(FREE, 1, true);
    expect([...deepinfra!.modelIds].sort()).toEqual([DEEPSEEK, GLM].sort());
  });

  it("leaves the register's off-panel role models off the gate's list only when rotated", () => {
    const offPanelRoles = Object.freeze({ answerWriter: GLM, answerChecker: MIMO, storyteller: QWEN, storyChecker: MIMO });
    const modelIds = (rotated: boolean) => [...estimatePreviewGateNeeds({ basis: basisFor(2, 1), panel: FREE, roleModels: offPanelRoles,
      roleProviderRefs: ["preview:fixture-a", "preview:mimo-v2-6-pro", "preview:qwen-3-8-flash"], storyRounds: 2, callOutputTokens: sent,
      askProbeModelIds: ASK_PROBE_MODELS, maxCooldownHoldsPerRun: 2, rotated })[0]!.modelIds].sort();
    expect(modelIds(true)).toEqual([DEEPSEEK, GLM].sort());
    expect(modelIds(false)).toEqual([DEEPSEEK, GLM, MIMO, QWEN].sort());
  });

  it("admission passes rotated on: a register role model the gate does not serve no longer refuses a rotated ask", async () => {
    const counters = { probes: 0, remaining: 0 };
    const gate = Object.freeze({ ...gateWith(counters, async () => remainingWith()), roleModels: { ...ROLE_MODELS, answerChecker: MIMO } });
    await expect(assertPreviewBudgetAdmits(gate, { basis: basis(2), panel: PANEL })).rejects.toBeInstanceOf(PreviewGateUnavailableRefusal);
    await expect(assertPreviewBudgetAdmits(gate, { basis: basis(2), panel: PANEL, rotated: true })).resolves.toBeUndefined();
  });

  it("re-pins the depth 1-3 room table; every combination still fits DeepInfra's $12.00 / 2,000 and Anthropic's $4.00 / 600 (owner answer M1)", () => {
    const usd = (nano: bigint) => Math.round(Number(nano) / 1e7) / 100;
    const table = [1, 2, 3].map((depth) => {
      const five = needs(ALL_FIVE, depth, true);
      return [needs(FREE, depth, true)[0]!, needs(PREMIUM, depth, true)[0]!, five[0]!, five[1]!].map((need, column) => {
        const anthropic = column === 3;
        return [usd(need.callsNanoUsd + (anthropic ? ANTHROPIC_HOLD : HOLD)), need.callsWithMargin + (anthropic ? 2 : 10)];
      });
    });
    // Rows: depth 1, 2, 3; columns: free, premium, all five (DeepInfra), all five (Anthropic); each [dollars, calls].
    // Computed 2026-10-11 by the spec's scratch run of the same rule (spec Part 5); re-pinned 2026-10-12 (story format
    // robustness: the storyteller at its row's cap, the checker's repair priced). Calls unchanged; before:
    // [1.98, 3.56, 4.27, 1.07], [2.22, 4.59, 5.56, 1.33], [2.71, 6.66, 8.15, 1.85].
    // Prompt caching (2026-10-12): the Anthropic gate's hold is 2 x $0.24704 now (+$0.066048 on its column: 1.14 / 1.4 /
    // 1.93 before). Depth 3 still fits its $2.00 by under a cent, which is why the estimate keeps Haiku's input at its
    // plain price: priced at the 5-minute write price as well, all five rotated at depth 3 would need $2.12.
    // LG-B: with the final writers at Haiku's own 128,000 the rotated all-five column needs about $2.89 at depth 3, inside owner answer M1's $4.00; on a $2.00 Anthropic GO every rotated all-five ask is refused at the start, so the M1 GO goes on the gates before the R1b app runs.
    // Slow answer (owner ruling 2026-10-12): the rotated storyteller on premium and all five is MiMo, which now asks
    // 16,384: 2 rounds x 16,384 x $0.87/M x 1.15 = $0.0327844 less on those DeepInfra columns. Free's dearest storyteller
    // is DeepSeek (still 32,768) and Anthropic's is Haiku (still 32,768): unchanged. Before: premium 3.73 / 4.77 / 6.83,
    // all five 4.44 / 5.74 / 8.32.
    // Story wording (practice debate 2, 2026-10-12): MiMo, the rotated story checker on premium and all five, asks for
    // 16,384 (its repair 32,768) instead of 8,192 (16,384): 2 rounds x 24,576 x $0.87/M x 1.15 = $0.0491789 more on those
    // DeepInfra columns. Free's checker is not MiMo and Anthropic's is Haiku (still 8,192): unchanged; calls unchanged.
    // Before: premium 3.7 / 4.73 / 6.8, all five 4.41 / 5.7 / 8.29.
    // LG-B (L26, 2026-10-15): final writers at each model's own maximum; owner answer M1's GO budgets $12 (DeepInfra) / $4 (Anthropic). Before: [[2.08, 106], [3.75, 338], [4.46, 465], [1.2, 177]], [[2.33, 161], [4.78, 522], [5.75, 695], [1.47, 260]], [[2.81, 272], [6.85, 890], [8.34, 1155], [1.99, 426]].
    expect(table).toEqual([
      [[3.19, 106], [4.57, 338], [5.28, 465], [2.1, 177]],
      [[3.43, 161], [5.6, 522], [6.57, 695], [2.36, 260]],
      [[3.92, 272], [7.67, 890], [9.16, 1155], [2.89, 426]]
    ]);
    for (const [free, premium, fiveDeepinfra, fiveAnthropic] of table) {
      for (const [dollars, calls] of [free!, premium!, fiveDeepinfra!]) { expect(dollars).toBeLessThanOrEqual(12); expect(calls).toBeLessThanOrEqual(2000); }
      expect(fiveAnthropic![0]).toBeLessThanOrEqual(4);
      expect(fiveAnthropic![1]).toBeLessThanOrEqual(600);
    }
  });

  it("a non-rotated debate is priced exactly as before", () => {
    expect(needs(PREMIUM, 2, false)).toEqual(estimatePreviewGateNeeds({ basis: basisFor(4, 2), panel: PREMIUM, roleModels, roleProviderRefs,
      storyRounds: 2, callOutputTokens: sent, askProbeModelIds: ASK_PROBE_MODELS, maxCooldownHoldsPerRun: 2 }));
  });

  it("an unfinished rotated debate is held with the rotated pricing, not the boot roles", () => {
    const settings = { roleModels, roleProviderRefs, storyRounds: 2, callOutputTokens: sent, maxCooldownHoldsPerRun: 2 };
    const rotated = estimateUnfinishedRunHolds({ registerVersion: 5, basis: basisFor(4, 2), panel: PREMIUM, phase: "DEBATE", rotated: true }, settings);
    const fixed = estimateUnfinishedRunHolds({ registerVersion: 5, basis: basisFor(4, 2), panel: PREMIUM, phase: "DEBATE" }, settings);
    // Roles on MiMo (dearer than the boot roles' GLM and DeepSeek), and no health checks of the off-panel fixture-b.
    expect(rotated[0]!.callsNanoUsd).toBeGreaterThan(fixed[0]!.callsNanoUsd);
    expect(rotated[0]!.callsWithMargin).toBeLessThan(fixed[0]!.callsWithMargin);
  });

  it("the unfinished-runs query reports whether each run is rotated", () => {
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toContain("core.run_role_rotation");
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/AS rotated/u);
  });
});

describe("each unfinished debate is held at its own register version's terms (side-by-side C16)", () => {
  // Version 16 (an older release's): no story, debate calls at 4,096. Version 17 (the API's): 2 story rounds, debate
  // calls at 16,384.
  const V16: PreviewVersionTerms = Object.freeze({
    roleModels: Object.freeze({ answerWriter: GLM, answerChecker: GLM, storyteller: null, storyChecker: null }),
    roleProviderRefs: Object.freeze(["preview:fixture-a", "preview:fixture-b"]), storyRounds: 0,
    callOutputTokens: Object.freeze({ debate: 4096, storyteller: 0, storytellerRetry: 0, storyChecker: 0 }), maxCooldownHoldsPerRun: 2
  });
  const V17: PreviewVersionTerms = Object.freeze({ ...GATE_TERMS, callOutputTokens: Object.freeze({ ...OUTPUT, debate: 16_384 }) });
  const runAt = (registerVersion: number): PreviewUnfinishedRun => Object.freeze({ basis: basis(2), panel: PANEL, phase: "DEBATE", registerVersion });
  const RUNS = Object.freeze([runAt(16), runAt(17)]);
  /**
   * What the gate says, from its refusals (no calls, then no money, left): what the unfinished debates hold, what the
   * new debate needs, and the operator lines printed meanwhile (parsed).
   */
  const refusalsOf = async (gate: PreviewBudgetGateSettings): Promise<{
    held: { calls: number; nanoUsd: bigint }; needs: { calls: number; nanoUsd: bigint }; lines: Record<string, unknown>[];
  }> => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const refusalIn = async (remaining: PreviewGateRemaining): Promise<{ held: string; needs: string }> => {
      const live = { ...gate, remaining: { deepinfra: async () => remaining } };
      const refusal = await assertPreviewBudgetAdmits(live, { basis: basis(2), panel: PANEL }).then(() => null, (error: unknown) => error);
      if (!(refusal instanceof PreviewDailyLimitRefusal)) throw new Error(`expected the daily refusal, got ${String(refusal)}`);
      const [, held, needs] = /, (\d+) held by unfinished debates, the debate needs (\d+)/u.exec(refusal.message)!;
      return { held: held!, needs: needs! };
    };
    try {
      const calls = await refusalIn(remainingWith({ remainingCalls: 0 }));
      const money = await refusalIn(remainingWith({ remainingNanoUsd: 0n }));
      return {
        held: { calls: Number(calls.held), nanoUsd: BigInt(money.held) },
        needs: { calls: Number(calls.needs), nanoUsd: BigInt(money.needs) },
        lines: quiet.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
      };
    } finally {
      quiet.mockRestore();
    }
  };
  /** What the gate says the unfinished debates hold, from its refusal (no calls, or no money, left). */
  const heldBy = async (gate: PreviewBudgetGateSettings): Promise<{ calls: number; nanoUsd: bigint }> => (await refusalsOf(gate)).held;
  /** What a new debate needs on the fixture gate when priced at `terms`, as the refusal states it. */
  const needsAt = (terms: PreviewVersionTerms): { calls: number; nanoUsd: bigint } => {
    const need = estimatePreviewGateNeeds({ basis: basis(2), panel: PANEL, ...ROLES, ...terms, debateCallCount: previewDebateCallCount() })
      .find((entry) => entry.gate === "deepinfra")!;
    return {
      calls: previewGateEstimateCalls(need, remainingWith({ remainingCalls: 0 })),
      nanoUsd: previewGateEstimateNanoUsd(need, remainingWith({ remainingNanoUsd: 0n }))
    };
  };
  const sumOf = (priced: ReadonlyArray<readonly [PreviewUnfinishedRun, PreviewVersionTerms]>) => priced
    .map(([run, terms]) => estimateUnfinishedRunHolds(run, terms)[0]!)
    .reduce((sum, hold) => ({ calls: sum.calls + hold.callsWithMargin, nanoUsd: sum.nanoUsd + hold.callsNanoUsd }), { calls: 0, nanoUsd: 0n });

  it("two debates at versions 16 and 17 hold the sum of each priced alone at its own terms, not both at 17", async () => {
    const asked: number[] = [];
    const gate: PreviewBudgetGateSettings = Object.freeze({
      ...gateWith({ probes: 0, remaining: 0 }, async () => remainingWith(), RUNS), ...V17,
      termsForVersion: async (version: number) => { asked.push(version); return version === 16 ? V16 : V17; }
    });
    const { held, needs } = await refusalsOf(gate);
    expect(held).toEqual(sumOf([[RUNS[0]!, V16], [RUNS[1]!, V17]]));
    const allAt17 = sumOf([[RUNS[0]!, V17], [RUNS[1]!, V17]]);
    expect(held.nanoUsd).not.toBe(allAt17.nanoUsd);
    expect(held.calls).not.toBe(allAt17.calls);
    expect(asked).toEqual([16, 17, 16, 17]);
    // C16 review: the NEW debate is priced at the API's own version (17), never at an unfinished run's (16).
    expect(needs).toEqual(needsAt(V17));
    expect(needs.nanoUsd).not.toBe(needsAt(V16).nanoUsd);
  });

  it("a version whose terms cannot be read prices that run at the API's own terms, and says so once (C16 review)", async () => {
    // Controller ruling: one unreadable version must not refuse every preview ask. Its unfinished run is held exactly as
    // if it ran under the API's own terms (the behaviour before C16), and one content-free line names the version.
    const asked: number[] = [];
    const gate: PreviewBudgetGateSettings = Object.freeze({
      ...gateWith({ probes: 0, remaining: 0 }, async () => remainingWith(), RUNS), ...V17,
      termsForVersion: async (version: number) => {
        asked.push(version);
        if (version === 16) throw new TypeError("STORY_POLICY_INVALID");
        return V17;
      }
    });
    const { held, needs, lines } = await refusalsOf(gate);
    expect(held).toEqual(sumOf([[RUNS[0]!, V17], [RUNS[1]!, V17]]));
    expect(needs).toEqual(needsAt(V17));
    // Not kept as terms: every ask asks for version 16 again (a version that later reads fine is priced at its own).
    expect(asked).toEqual([16, 17, 16, 17]);
    expect(lines.filter((line) => line.event === "api.preview_estimate.version_terms_fallback"))
      .toEqual([{ event: "api.preview_estimate.version_terms_fallback", version: 16 }]);
    // With room on the gate the ask is admitted, and the line is not printed again.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(assertPreviewBudgetAdmits(gate, { basis: basis(2), panel: PANEL })).resolves.toBeUndefined();
      expect(quiet).not.toHaveBeenCalled();
    } finally {
      quiet.mockRestore();
    }
  });

  /**
   * A stand-in register: each version's rows by key; counts the register_row reads per version. The unfinished-debates
   * read returns `unfinishedRows` and keeps its parameters.
   */
  const registerPool = (versions: Readonly<Record<number, Readonly<Record<string, unknown>>>>, unfinishedRows: readonly unknown[] = []) => {
    const reads = new Map<number, number>();
    const unfinishedParams: unknown[][] = [];
    const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      if (sql === PREVIEW_UNFINISHED_RUNS_SQL) { unfinishedParams.push([...params]); return { rows: unfinishedRows }; }
      if (!sql.includes("register.register_row")) throw new Error(`unexpected query: ${sql}`);
      const version = Number(params[0]);
      reads.set(version, (reads.get(version) ?? 0) + 1);
      const keys = Array.isArray(params[1]) ? params[1] as string[] : [params[1] as string];
      const rows = versions[version] ?? {};
      return { rows: keys.filter((key) => Object.hasOwn(rows, key))
        .map((key) => ({ row_key: key, value_json: rows[key], source_ref: `fixture:v${String(version)}:${key}` })) };
    });
    return { pool: { query } as never, readsOf: (version: number) => reads.get(version) ?? 0, unfinishedParams };
  };
  const registerRows = (writerCeiling: number) => Object.freeze({
    synthesizerRoleRef: { kind: "SYNTHESIZER_ROLE_REF", providerRef: "preview:fixture-a", provisional: false },
    evaluatorRoleRef: { kind: "EVALUATOR_ROLE_REF", providerRef: "preview:fixture-b", provisional: false },
    evaluatorLoopMaxRounds: { kind: "EVALUATOR_LOOP_MAX_ROUNDS", maxRounds: 3 },
    synthesizerCallBound: { kind: "SYNTHESIZER_CALL_BOUND", maxAttempts: 3, tokenCeiling: writerCeiling, deadlineMs: 240_000 },
    evaluatorCallBound: { kind: "EVALUATOR_CALL_BOUND", maxAttempts: 3, tokenCeiling: 1024, deadlineMs: 240_000 },
    acceptanceOrganCostBounds: { kind: "ACCEPTANCE_ORGAN_COST_BOUNDS", organs: {
      JUDGE: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 180_000 },
      COMPOSER: { maxAttempts: 3, tokenCeiling: 512, deadlineMs: 60_000 },
      CONFORMANCE: { maxAttempts: 3, tokenCeiling: 512, deadlineMs: 60_000 }
    } },
    runDeathPolicy: { kind: "RUN_DEATH_POLICY", final_retry_attempts: 1, max_cooldown_holds_per_run: 2 }
  });

  it("termsForVersion reads a version's register once (a sealed version never changes), and the API's own not at all", async () => {
    const { pool, readsOf } = registerPool({ 16: registerRows(4096), 17: registerRows(16_384) });
    const settings = await readPreviewBudgetGateSettings(pool, 17, PREVIEW, []);
    const bootReads = readsOf(17);
    expect(bootReads).toBeGreaterThan(0);
    expect(readsOf(16)).toBe(0);
    const first = await settings.termsForVersion(16);
    const reads = readsOf(16);
    expect(reads).toBeGreaterThan(0);
    expect(await settings.termsForVersion(16)).toBe(first);
    expect(readsOf(16)).toBe(reads);
    await settings.termsForVersion(17);
    expect(readsOf(17)).toBe(bootReads);
    // Version 16's own terms: its writer's ceiling, no story.
    expect(first).toEqual({
      roleModels: { answerWriter: GLM, answerChecker: GLM, storyteller: null, storyChecker: null },
      roleProviderRefs: ["preview:fixture-a", "preview:fixture-b"], storyRounds: 0,
      callOutputTokens: previewCallOutputTokens(PREVIEW, { debate: [2048, 512, 512, 4096, 1024], story: null }), maxCooldownHoldsPerRun: 2
    });
    expect((await settings.termsForVersion(17)).callOutputTokens)
      .toEqual(previewCallOutputTokens(PREVIEW, { debate: [2048, 512, 512, 16_384, 1024], story: null }));
    expect(first.callOutputTokens.debate).not.toBe(settings.callOutputTokens.debate);
  });

  it("a version that cannot be read is not kept, and a version that is not a positive whole number is refused", async () => {
    const versions: Record<number, Readonly<Record<string, unknown>>> = { 17: registerRows(16_384) };
    const { pool, readsOf } = registerPool(versions);
    const settings = await readPreviewBudgetGateSettings(pool, 17, PREVIEW, []);
    await expect(settings.termsForVersion(15)).rejects.toThrow();
    versions[15] = registerRows(2048);
    await expect(settings.termsForVersion(15)).resolves.toMatchObject({ storyRounds: 0 });
    expect(readsOf(15)).toBeGreaterThan(1);
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      await expect(settings.termsForVersion(bad)).rejects.toThrow("PREVIEW_REGISTER_VERSION_INVALID");
    }
  });

  it("the unfinished-debates read names each debate's register version, and asks for every story phase", async () => {
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toContain("run.register_version::integer AS register_version");
    const row = { envelope_basis: basis(2), discovered_panel: PANEL, phase: "DEBATE", composition_budget_tier: "low", rotated: false };
    expect(previewUnfinishedRunFrom({ ...row, register_version: 16 })).toMatchObject({ registerVersion: 16, phase: "DEBATE" });
    // The API's version 17 has no story, yet a debate of a version with one is still held while it writes its story:
    // the story filter is on ($1 true), and each debate's own version's story rounds decide what it holds.
    const { pool, unfinishedParams } = registerPool({ 17: registerRows(16_384) }, [{ ...row, phase: "STORY", register_version: 16 }]);
    const settings = await readPreviewBudgetGateSettings(pool, 17, PREVIEW, []);
    expect(settings.storyRounds).toBe(0);
    expect(await settings.readUnfinishedRuns()).toMatchObject([{ registerVersion: 16, phase: "STORY" }]);
    expect(unfinishedParams).toEqual([[true, 3600]]);
    for (const bad of [null, "16", 0, 1.5]) {
      expect(() => previewUnfinishedRunFrom({ ...row, register_version: bad })).toThrow("PREVIEW_UNFINISHED_RUN_UNREADABLE");
    }
  });
});
