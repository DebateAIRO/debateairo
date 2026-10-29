import { describe, expect, it } from "vitest";
import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, computeStructuralCeilingBasis, debateShapePolicyStartValues, planById
} from "@debateai/register";
import { decideSettingsForPlan, normaliseAskForPlan } from "../../apps/api/src/ask-billing.js";
import { normaliseAskForDebateShape, roomDepthParams } from "../../apps/api/src/debate-shape-ask.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
const member = (providerRef: string, maker: string, modelId: string): DiscoveredPanelMember => Object.freeze({
  provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-12T00:00:00.000Z" });
/** The free plan's two local roster models (PLAN_TIER_ROSTERS.free), two makers. */
const PANEL = Object.freeze([member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "Anthropic", "claude-sonnet-5")]);
const POLICY = debateShapePolicyStartValues();
const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
const ASK: AskRequest = { question_line: "Should cities price congestion?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "shape admission test",
  as_of: "2026-10-12T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [] };

function settings(input: Readonly<{ policy?: boolean; panel?: readonly DiscoveredPanelMember[]; seen?: unknown[] }>): RunCreationSettings {
  return {
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "battery:shape", settlementWatchHandle: "watch:shape",
    resolveDiscoveredPanel: async () => input.panel ?? PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape }) => {
      input.seen?.push(shape);
      return computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned,
        ...(shape === null ? {} : { shape }) });
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
    ...(input.policy === true ? { debateShapePolicy: POLICY } : {})
  };
}

describe("admission with the debate shape (spec 2026-10-12 §3.1, §3.6)", () => {
  it("no row: today's basis, no shape asked of the composition", async () => {
    const seen: unknown[] = [];
    const admitted = await evaluateAskAdmission(settings({ seen }), ASK);
    expect(seen).toEqual([null]);
    expect(admitted.envelopeBasis.formula_version).toBe("DR-184-v4");
    expect("shape" in admitted.envelopeBasis).toBe(false);
  });
  it("with the row: the sizes capped by the two makers, under the plan key it was handed", async () => {
    const shaped = normaliseAskForDebateShape(ASK, POLICY, "free");
    const admitted = await evaluateAskAdmission(settings({ policy: true }), shaped);
    expect(admitted.envelopeBasis.formula_version).toBe("DR-185-shape-v1");
    expect(admitted.envelopeBasis.max_model_attempts).toBe(160);
    expect(admitted.envelopeBasis.shape).toMatchObject({ plan: "free", answers: 2, graders: 1, close_call_extra_graders: 0, map_ais: 2 });
    const plus = await evaluateAskAdmission(settings({ policy: true }), normaliseAskForDebateShape(ASK, POLICY, "plus"), null, undefined, "plus");
    expect(plus.envelopeBasis.shape).toMatchObject({ plan: "plus" });
  });
  it("a one-maker panel keeps today's shape even with the row", async () => {
    const oneMaker = [member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "OpenAI", "claude-sonnet-5")];
    const admitted = await evaluateAskAdmission(settings({ policy: true, panel: oneMaker }), normaliseAskForDebateShape(ASK, POLICY, "free"));
    expect(admitted.envelopeBasis.formula_version).toBe("DR-184-v4");
  });
  it("an ask that was never normalised for its plan is an engine fault, never admitted", async () => {
    const unnormalised = { ...ASK, depth_params: { depth: 1, depthMode: "fixed" as const, scrutiny: "standard" as const, answerLength: "standard" as const } };
    await expect(evaluateAskAdmission(settings({ policy: true }), unnormalised)).rejects.toThrow("DEBATE_SHAPE_SETTINGS_NOT_NORMALISED:depthMode");
  });
});

describe("plan normalisation keeps the shape settings (spec §3.2)", () => {
  it("Free keeps the asked answer length; a depth-only ask stays {\"depth\":1}", () => {
    const free = planById(plans, "FREE");
    const asked = { ...ASK, plan_tier: "premium" as const, depth_params: { depth: 3, depthMode: "fixed" as const, answerLength: "detailed" as const } };
    const decided = normaliseAskForPlan(asked, free).ask;
    expect(decided.depth_params).toEqual({ depth: 1, depthMode: "fixed", answerLength: "detailed" });
    expect(normaliseAskForDebateShape(decided, POLICY, "free").depth_params)
      .toEqual({ depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" });
    expect(JSON.stringify(normaliseAskForPlan({ ...ASK, depth_params: { depth: 3 } }, free).ask.depth_params)).toBe('{"depth":1}');
    expect(decideSettingsForPlan({ plan_tier: "premium" as const, composition_budget_tier: "high" as const,
      depth_params: { depth: 3, answerLength: "short" as const } }, free).depth_params).toEqual({ depth: 1, answerLength: "short" });
  });
  it("without the row a depth-only ask is the same object, and the shape settings are dropped", () => {
    expect(normaliseAskForDebateShape(ASK, null, "free")).toBe(ASK);
    expect(normaliseAskForDebateShape({ ...ASK, depth_params: { depth: 1, scrutiny: "deep" as const } }, null, "pro").depth_params).toEqual({ depth: 1 });
  });
  it("the room query becomes depth_params with only the settings it carries", () => {
    expect(roomDepthParams({ depth: 2 })).toEqual({ depth: 2 });
    expect(roomDepthParams({ depth: 2, depth_mode: "fixed", scrutiny: "deep", answer_length: "short" }))
      .toEqual({ depth: 2, depthMode: "fixed", scrutiny: "deep", answerLength: "short" });
  });
});
