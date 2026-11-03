/**
 * V4 start step, Task 4 (spec 2026-11-03 §5): the start-of-debate estimate prices a v2 run's final writers by the same
 * rule the call policy sends (previewFinalWriterAsk), each body at the end-of-debate line (195,904 bytes = 65,984
 * tokens at the estimate's 3 bytes per token). A v1 run keeps R22.1's own terms, byte for byte. Until Task 40 prices a
 * v2 receipt's shape, previewCallShares refuses one (PREVIEW_SHAPE_V2_UNPRICED) and admission answers "unavailable".
 */
import { describe, expect, it, vi } from "vitest";
import {
  PREVIEW_MODEL_ROWS, parsePreviewGateRemaining, parsePreviewProviderTestConfig, previewFinalWriterAsk, previewModelRow,
  withPreviewProviderCallPolicy, type PreviewFinalWriterPlan, type PreviewFinalWriterRole, type PreviewGateRemaining,
  type PreviewModelRow, type ProviderCallRequest, type ProviderCallResult, type ProviderGateway
} from "@debateai/providers";
import { computeStructuralCeilingBasis, debateShapePolicyStartValues, resolveDebateShape } from "@debateai/register";
import {
  PREVIEW_V2_FINAL_WRITER_INPUT_TOKENS, PreviewGateUnavailableRefusal, assertPreviewBudgetAdmits, previewCallShares,
  previewFinalWriterOutputTokens, realisticWorstCasePricer, type PreviewBudgetGateSettings, type PreviewCallOutputTokens
} from "../../apps/api/src/preview-budget-estimate.js";
import { framedFixturePacket } from "../support/framed-packet.js";

const GLM = "zai-org/GLM-5.3-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const HAIKU = "claude-haiku-5-5";
const OUTPUT: PreviewCallOutputTokens = Object.freeze({ debate: 8192, storyteller: 32_768, storytellerRetry: 65_536, storyChecker: 8192 });
const row = (model: string): PreviewModelRow => previewModelRow(model)!;

type FinalWriterType = "ANSWER_WRITER" | "ANSWER_CHECKER" | "STORYTELLER" | "STORYTELLER_RETRY" | "STORY_CHECKER" | "STORY_CHECKER_RETRY";
const TYPES: readonly (readonly [FinalWriterType, PreviewFinalWriterRole, 1 | 2, readonly [string, string, string]])[] = [
  ["ANSWER_WRITER", "ANSWER_WRITER", 1, ["COMPOSER:SYNTHESIZER:INITIAL:1", "served", "SYNTHESIZER"]],
  ["ANSWER_CHECKER", "ANSWER_CHECKER", 1, ["POST_COMPOSE_R9:EVALUATOR:1", "served", "EVALUATOR"]],
  ["STORYTELLER", "STORYTELLER", 1, ["STORY:STORYTELLER:1", "story", "SYNTHESIZER"]],
  ["STORYTELLER_RETRY", "STORYTELLER", 2, ["STORY:STORYTELLER:1", "story", "SYNTHESIZER"]],
  ["STORY_CHECKER", "STORY_CHECKER", 1, ["STORY:CHECKER:1", "story", "EVALUATOR"]],
  ["STORY_CHECKER_RETRY", "STORY_CHECKER", 2, ["STORY:CHECKER:1", "story", "EVALUATOR"]]
];
const PLANS: readonly PreviewFinalWriterPlan[] = ["free", "paid"];

const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "v4-one-rule-fixture",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
  free_model_ids: [GLM, HAIKU], premium_model_ids: PREVIEW_MODEL_ROWS.map((r) => r.model) }))!;
const OFFERED = parsePreviewGateRemaining({ state: "active", window_open: true, remaining_usd: "2.00", remaining_calls: 10,
  max_concurrent_calls: 2, largest_reservation_usd: "0.24704", enabled_models: [HAIKU],
  largest_final_writer_reservation_usd: "0.97664", final_writer_max_in_flight: 1 })!;

/** The max_tokens the call policy sends a v2 final writer of this row, role site and plan (the gate offers the tier). */
async function policySends(model: string, site: readonly [string, string, string], plan: PreviewFinalWriterPlan): Promise<number> {
  const seen: ProviderCallRequest[] = [];
  const inner: ProviderGateway = { call: async (sent) => {
    seen.push(sent);
    return { rawArtifactRef: "artifact", ledgerEntryRef: "entry", content: "{}", provider: "openai-compatible-http",
      model, maker: "Synthetic", modelVersion: model } satisfies ProviderCallResult;
  } };
  const read = async (): Promise<PreviewGateRemaining> => OFFERED;
  const policy = withPreviewProviderCallPolicy(inner, CONFIG, { model },
    { gateRemaining: { deepinfra: read, anthropic: read }, finalWriterTermsOf: () => ({ plan }) });
  await policy.call({ runId: "run:v2", subjectItemId: "node:synthetic", callSiteKey: site[0], role: site[2] as ProviderCallRequest["role"],
    lane: site[1] as ProviderCallRequest["lane"], bound: { maxAttempts: 2, tokenCeiling: 2048, deadlineMs: 5_000 },
    contractHash: "contract:synthetic", providerRef: "preview:fixture-a", packet: framedFixturePacket("v4 one rule") });
  return seen[0]!.bound.tokenCeiling;
}

const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const SHAPE = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "free", makers: 2,
  settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" } })!;
const shapedV1Basis = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, shape: SHAPE });
const v2Like = Object.freeze({ ...shapedV1Basis, formula_version: "DR-185-shape-v2" });
const PANEL = Object.freeze([{ provider_ref: "preview:fixture-a", model_id: GLM }, { provider_ref: "preview:mimo", model_id: MIMO }]);
const ROLES = Object.freeze({ answerWriter: GLM, answerChecker: GLM, storyteller: GLM, storyChecker: GLM });
const SHARE_INPUT = Object.freeze({ basis: shapedV1Basis, panel: PANEL, roleModels: ROLES, roleProviderRefs: [], storyRounds: 0,
  maxCooldownHoldsPerRun: 2, dearestFor: (models: readonly string[]) => models.includes(MIMO) ? MIMO : models[0]! });
const GATE: PreviewBudgetGateSettings = Object.freeze({
  remaining: { deepinfra: async () => Object.freeze({ state: "active", windowOpen: true, remainingNanoUsd: 10n ** 12n,
    remainingCalls: 10_000_000, maxConcurrentCalls: 4, largestReservationNanoUsd: 0n, enabledModels: [GLM, MIMO] }) },
  roleModels: ROLES, roleProviderRefs: [], storyRounds: 0, callOutputTokens: OUTPUT, askProbeModelIds: [], maxCooldownHoldsPerRun: 2,
  readUnfinishedRuns: async () => [],
  termsForVersion: async () => Object.freeze({ roleModels: ROLES, roleProviderRefs: [], storyRounds: 0, callOutputTokens: OUTPUT,
    maxCooldownHoldsPerRun: 2 })
});

describe("the estimate prices v2 final writers by the rule the call policy sends", () => {
  it("prices every row, plan and final-writer type at exactly the max_tokens the policy sends", async () => {
    for (const r of PREVIEW_MODEL_ROWS) {
      for (const plan of PLANS) {
        for (const [type, role, attempt, site] of TYPES) {
          const priced = previewFinalWriterOutputTokens(r, type, { plan });
          expect(priced, `${r.model} ${plan} ${type}`).toBe(previewFinalWriterAsk(r, role, attempt, plan).maxTokens);
          expect(priced, `${r.model} ${plan} ${type} sent`).toBe(await policySends(r.model, site, plan));
        }
      }
    }
  });

  it("takes each v2 final writer's body at the end-of-debate line", () => {
    expect(PREVIEW_V2_FINAL_WRITER_INPUT_TOKENS).toBe(65_984n);
  });

  it("prices a paid and a free v2 run's final writers at the rule's caps", () => {
    const paid = realisticWorstCasePricer(OUTPUT, "high", { plan: "paid" });
    expect([paid(row(HAIKU), "STORYTELLER"), paid(row(HAIKU), "STORYTELLER_RETRY"), paid(row(HAIKU), "ANSWER_WRITER"), paid(row(GLM), "STORY_CHECKER")])
      .toEqual([47_558_400n, 47_558_400n, 14_790_400n, 13_993_600n]);
    expect(realisticWorstCasePricer(OUTPUT, "high", { plan: "free" })(row(HAIKU), "STORYTELLER")).toBe(14_790_400n);
  });

  it("keeps a v1 run on R22.1's own terms", () => {
    const v1 = realisticWorstCasePricer(OUTPUT, "high");
    expect([v1(row(HAIKU), "ANSWER_WRITER"), v1(row(HAIKU), "STORYTELLER"), v1(row(HAIKU), "STORY_CHECKER")])
      .toEqual([66_252_800n, 71_338_700n, 72_157_900n]);
    expect(realisticWorstCasePricer(OUTPUT, "high", null)(row(HAIKU), "ANSWER_WRITER")).toBe(66_252_800n);
  });

  it("refuses to share out a v2 receipt's calls until its shape is priced, and admission answers unavailable", async () => {
    expect(() => previewCallShares({ ...SHARE_INPUT, basis: { ...shapedV1Basis, formula_version: "DR-185-shape-v2" } }))
      .toThrow("PREVIEW_SHAPE_V2_UNPRICED");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(assertPreviewBudgetAdmits(GATE, { basis: v2Like, panel: PANEL })).rejects.toBeInstanceOf(PreviewGateUnavailableRefusal);
    } finally {
      quiet.mockRestore();
    }
  });
});
