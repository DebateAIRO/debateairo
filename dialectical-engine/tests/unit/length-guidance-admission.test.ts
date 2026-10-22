import { describe, expect, it } from "vitest";
import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, lengthGuidancePolicyStartValues, normaliseDepthParamsForShape,
  type LengthGuidance
} from "@debateai/register";
import { normaliseAskForDebateShape } from "../../apps/api/src/debate-shape-ask.js";
import { lengthGuidanceForAsk } from "../../apps/api/src/length-guidance-ask.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
const member = (providerRef: string, maker: string, modelId: string): DiscoveredPanelMember => Object.freeze({
  provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-15T00:00:00.000Z" });
const PANEL = Object.freeze([member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "Anthropic", "claude-sonnet-5")]);
const LENGTH = lengthGuidancePolicyStartValues();
const SHAPE = debateShapePolicyStartValues();
const ASK: AskRequest = { question_line: "Should cities price congestion?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "low", depth_params: { depth: 2 }, decision_scope: "length admission test",
  as_of: "2026-10-15T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [] };

function settings(input: Readonly<{ length?: boolean; seen?: (LengthGuidance | null)[] }>): RunCreationSettings {
  return {
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "battery:length", settlementWatchHandle: "watch:length",
    resolveDiscoveredPanel: async () => PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape, length }) => {
      input.seen?.push(length);
      return computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned,
        ...(shape === null ? {} : { shape }), ...(length === null ? {} : { length }) });
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
    ...(input.length === true ? { lengthGuidancePolicy: LENGTH } : {})
  };
}

describe("the answer-length choice without the shape row (spec §3.1; OVERVIEW §6)", () => {
  it("no row at all: a depth-only ask is the same object, and every other setting is dropped", () => {
    const depthOnly = { depth: 2 };
    expect(normaliseDepthParamsForShape(depthOnly, null, "free")).toBe(depthOnly);
    expect(normaliseDepthParamsForShape(depthOnly, null, "free", null)).toBe(depthOnly);
    expect(JSON.stringify(normaliseDepthParamsForShape({ depth: 2, answerLength: "detailed", scrutiny: "deep" }, null, "free")))
      .toBe("{\"depth\":2}");
  });

  it("the length row alone keeps exactly the depth and the answer length, in that order", () => {
    expect(JSON.stringify(normaliseDepthParamsForShape({ depth: 2, answerLength: "detailed", depthMode: "fixed", scrutiny: "deep" },
      null, "plus", LENGTH))).toBe("{\"depth\":2,\"answerLength\":\"detailed\"}");
    expect(JSON.stringify(normaliseDepthParamsForShape({ depth: 1 }, null, "free", LENGTH))).toBe("{\"depth\":1,\"answerLength\":\"standard\"}");
  });

  it("with the shape row the shape's normalisation is unchanged, length row or not", () => {
    const asked = { depth: 3, answerLength: "short" as const };
    expect(normaliseDepthParamsForShape(asked, SHAPE, "free", LENGTH)).toEqual(normaliseDepthParamsForShape(asked, SHAPE, "free"));
  });

  it("the ask is returned as the same object when nothing changes", () => {
    expect(normaliseAskForDebateShape(ASK, null, "free")).toBe(ASK);
    expect(normaliseAskForDebateShape(ASK, null, "free", LENGTH).depth_params).toEqual({ depth: 2, answerLength: "standard" });
  });
});

describe("admission freezes the debate's numbers on its receipt (spec §3.1)", () => {
  it("no row: nothing is resolved and the receipt has no length member", async () => {
    const seen: (LengthGuidance | null)[] = [];
    const admitted = await evaluateAskAdmission(settings({ seen }), ASK);
    expect(seen).toEqual([null]);
    expect(Object.hasOwn(admitted.envelopeBasis, "length")).toBe(false);
    expect(lengthGuidanceForAsk(undefined, ASK.depth_params, "free")).toBeNull();
  });

  it("the row in force: the plan's numbers at the asked length, frozen with today's shape", async () => {
    const seen: (LengthGuidance | null)[] = [];
    const ask = normaliseAskForDebateShape({ ...ASK, depth_params: { depth: 2, answerLength: "detailed" } }, null, "free", LENGTH);
    const admitted = await evaluateAskAdmission(settings({ length: true, seen }), ask);
    expect(seen[0]?.answerLength).toBe("detailed");
    // Pre-flight PF-C2.1: OVERVIEW C-1 / engine INTERFACE §4.1 Detailed answer words (kernel LENGTH_GUIDANCE_START).
    expect(seen[0]?.steps.answer_writer).toBe(1000);
    expect(admitted.envelopeBasis.formula_version).toBe("DR-184-v4");
    expect(admitted.envelopeBasis.length).toMatchObject({ version: 1, plan: "free", answer_length: "detailed" });
  });
});
