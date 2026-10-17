// Engine redesign R1d, Task 7 (spec §10; INTERFACE §3.4; decision 7): an engine-2 receipt prices the story's rounds twice
// (the backup storyteller's whole second loop, the worst case); a receipt without the member prices exactly as today. The
// engine's judge, investigation and check sites are NOT priced in R1d (R2): every debate count stays today's.
import { describe, expect, it } from "vitest";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, engineSettingsOf, engineVersionPolicyStartValues,
  lengthGuidancePolicyStartValues, resolveDebateShape, resolveLengthGuidance
} from "@debateai/register";
import { PREVIEW_MODEL_ROWS_BY_PROVIDER, parsePreviewProviderTestConfig, previewStorytellerTokenCeiling } from "@debateai/providers";
import { STORY_GUIDED_BOUND_LIMITS } from "@debateai/story";
import {
  previewCallOutputTokens, previewCallShares, previewExpectedCalls, type PreviewCallShares
} from "../../apps/api/src/preview-budget-estimate.js";
import { admittedShapeOf, expectedCallsByRoleFromBasis } from "../../apps/api/src/ask-model-picker.js";

const GLM = "zai-org/GLM-5.3-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const HAIKU = "claude-haiku-5-5";
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const LENGTH = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });
const SHAPE = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "free", makers: 2,
  settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } })!;
const today = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1 });
const lengthOnly = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, length: LENGTH });
const engine2 = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, length: LENGTH,
  engine: engineSettingsOf(engineVersionPolicyStartValues(), { makers: 2, mapOpening: false }) });
const shapedLength = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, shape: SHAPE, length: LENGTH });
const shapedEngine = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, shape: SHAPE, length: LENGTH,
  engine: engineSettingsOf(engineVersionPolicyStartValues(), { makers: 2, mapOpening: true }) });
const PANEL = Object.freeze([{ provider_ref: "preview:fixture-a", model_id: GLM }, { provider_ref: "preview:mimo", model_id: MIMO }]);
const ROLES = Object.freeze({ answerWriter: GLM, answerChecker: GLM, storyteller: GLM, storyChecker: MIMO });
const calls = (basis: Readonly<Record<string, unknown>>, storyRounds = 2, debateCallCount: "PER_STEP" | "BASIS_CEILING" = "PER_STEP") =>
  previewExpectedCalls({ basis, panel: PANEL, roleProviderRefs: [], storyRounds, maxCooldownHoldsPerRun: 2, debateCallCount });
const shares = (basis: Readonly<Record<string, unknown>>, storyRounds = 2) => previewCallShares({ basis, panel: PANEL, roleModels: ROLES,
  roleProviderRefs: [], storyRounds, maxCooldownHoldsPerRun: 2, debateCallCount: "PER_STEP",
  dearestFor: (models) => models.includes(MIMO) ? MIMO : models[0]! });
const STORY_TYPES = new Set(["STORYTELLER", "STORYTELLER_RETRY", "STORY_CHECKER", "STORY_CHECKER_RETRY"]);
const storyOf = (result: PreviewCallShares) => result.shares.filter((share) => STORY_TYPES.has(share.type));
const debateOf = (result: PreviewCallShares) => result.shares.filter((share) => !STORY_TYPES.has(share.type));
const storyAt = (rounds: bigint) => [
  { model: GLM, type: "STORYTELLER", numerator: rounds }, { model: GLM, type: "STORYTELLER_RETRY", numerator: rounds },
  { model: MIMO, type: "STORY_CHECKER", numerator: rounds }, { model: MIMO, type: "STORY_CHECKER_RETRY", numerator: rounds }
];

describe("a receipt without the engine member: today's numbers (row absent)", () => {
  it("the story is four calls per round, with the length row or without it", () => {
    expect(calls(today).story).toBe(8);
    expect(calls(lengthOnly).story).toBe(8);
    expect(calls(today, 0).story).toBe(0);
  });

  it("each story role's share is its rounds over the one denominator", () => {
    for (const basis of [today, lengthOnly]) {
      const result = shares(basis);
      expect(storyOf(result)).toEqual(storyAt(2n * result.denominator));
    }
  });
});

describe("an engine-2 receipt: the story's rounds count twice (the backup storyteller's worst case)", () => {
  it("the story calls double; every debate call stays today's (the engine's sites are priced by R2)", () => {
    expect(calls(engine2).story).toBe(16);
    expect(calls(engine2).debate).toBe(calls(lengthOnly).debate);
    expect(calls(engine2).probes).toBe(calls(lengthOnly).probes);
    expect(calls(engine2).unbilledRetries).toBe(calls(lengthOnly).unbilledRetries);
    expect(calls(engine2).total).toBe(calls(lengthOnly).total + 8);
    expect(calls(engine2, 0).story).toBe(0);
  });

  it("the story shares double over the same denominator; every other share is the length-only receipt's", () => {
    const engine = shares(engine2), plain = shares(lengthOnly);
    expect(engine.denominator).toBe(plain.denominator);
    expect(storyOf(engine)).toEqual(storyAt(4n * engine.denominator));
    expect(debateOf(engine)).toEqual(debateOf(plain));
    expect(storyOf(shares(engine2, 0))).toEqual([]);
  });

  it("the structure-repair call's shares use the same rounds, so they double with the story's (pre-flight PF-D3.6)", () => {
    // "Every other share is the length-only receipt's" holds above because no structure-repair model is given: the repair
    // call (`previewCallShares`, `:804` at 39ac91775) is counted per story round and story role, so it doubles too (the
    // backup's tries can each go to the repair model: correct for a never-under-count ceiling).
    const repairPerDenominator = (basis: Readonly<Record<string, unknown>>) => {
      const result = previewCallShares({ basis, panel: PANEL, roleModels: ROLES, roleProviderRefs: [], storyRounds: 2,
        maxCooldownHoldsPerRun: 2, debateCallCount: "PER_STEP", dearestFor: (models) => models.includes(MIMO) ? MIMO : models[0]!,
        structureRepairModel: HAIKU });
      return result.shares.filter((share) => share.model === HAIKU && share.type === "STRUCTURE_REPAIR")
        .reduce((sum, share) => sum + share.numerator, 0n) / result.denominator;
    };
    // One storyteller and one story checker per round: 2 rounds x 2 = 4 on the length-only receipt, 4 rounds x 2 = 8 on engine 2.
    expect(repairPerDenominator(lengthOnly)).toBe(4n);
    expect(repairPerDenominator(engine2)).toBe(8n);
  });

  it("at the basis ceiling the engine's receipt is priced at the length-only one plus exactly the engine's added attempts", () => {
    // Task 7 review 1 (final wave B5): an exact value, not a lower bound. Per step (above) R1d prices no engine site; the
    // basis ceiling reads max_model_attempts, which holds the engine's attempts (4 sites x 3 = 12 here), so it is exactly
    // the length-only value plus the receipt's added_model_attempts (R2 replaces this pin).
    const added = (engine2.engine as { sites: { added_model_attempts: number } }).sites.added_model_attempts;
    expect(added).toBe(12);
    expect(calls(engine2, 2, "BASIS_CEILING").debate).toBe(calls(lengthOnly, 2, "BASIS_CEILING").debate + added);
    expect(calls(engine2, 2, "BASIS_CEILING").story).toBe(16);
  });

  it("a malformed engine member is refused by the strict reader, never priced as engine 1", () => {
    const engine = engine2.engine as Readonly<Record<string, unknown>>;
    // The parser's TypedDomainError carries the code on `.code` (its message is a sentence).
    expect(() => calls({ ...engine2, engine: { ...engine, version: 9 } }))
      .toThrowError(expect.objectContaining({ code: "RUN_COST_ENVELOPE_UNRESOLVED" }));
    const { length: _dropped, ...withoutLength } = engine2;
    expect(() => calls(withoutLength)).toThrowError(expect.objectContaining({ code: "RUN_COST_ENVELOPE_UNRESOLVED" }));
  });
});

describe("the picker's receipt readers accept an engine-bearing receipt (apps/api/src/ask-model-picker.ts:447-540)", () => {
  it("admittedShapeOf reads a shaped engine receipt through the strict parser: the same shape as without the member", () => {
    expect(admittedShapeOf(shapedEngine)).toEqual(admittedShapeOf(shapedLength));
    expect(admittedShapeOf(engine2)).toBeNull();
  });

  it("expectedCallsByRoleFromBasis counts no engine site in R1d (R2 replaces this pin)", () => {
    expect(expectedCallsByRoleFromBasis(shapedEngine)).toEqual(expectedCallsByRoleFromBasis(shapedLength));
    expect(expectedCallsByRoleFromBasis(engine2)).toEqual(expectedCallsByRoleFromBasis(lengthOnly));
  });

  it("a shaped receipt with a malformed engine member is refused as a malformed receipt", () => {
    const engine = shapedEngine.engine as Readonly<Record<string, unknown>>;
    expect(() => admittedShapeOf({ ...shapedEngine, engine: { ...engine, engine: 3 } })).toThrow(/malformed debate shape/u);
  });
});

describe("the v4 storyteller's price (pre-flight Ruling PF-D4.2)", () => {
  it("on the preview each row's storyteller is priced at its own story ceiling; the largest is 128 * 1024, Task 11's v4 cap", () => {
    const ceilings = Object.values(PREVIEW_MODEL_ROWS_BY_PROVIDER).flat().map(previewStorytellerTokenCeiling);
    // The estimate's storyteller output (previewCallOutputTokens) is the largest row ceiling: never below the v4 storyteller's
    // guided cap off the preview (STORY_GUIDED_BOUND_LIMITS.tokenCeiling, Task 11, = 131,072).
    expect(Math.max(...ceilings)).toBe(128 * 1024);
    // The slow rows (GLM, MiMo, Qwen) keep LG-B's 16,384 on the preview, whatever Task 11's bound asks.
    expect(ceilings.filter((ceiling) => ceiling === 16_384)).toHaveLength(3);
    // Task 7 review 2 (final wave B5): the estimate's storyteller output IS that value, the v4 storyteller's guided cap off
    // the preview (STORY_GUIDED_BOUND_LIMITS.tokenCeiling), whatever the story row's own bound says.
    const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture", free_model_ids: [GLM] }))!;
    const sent = previewCallOutputTokens(config, { debate: [2048], story: { storyteller: 12_000, checker: 2048 } });
    expect(sent.storyteller).toBe(STORY_GUIDED_BOUND_LIMITS.tokenCeiling);
    expect(STORY_GUIDED_BOUND_LIMITS.tokenCeiling).toBe(128 * 1024);
  });
});
