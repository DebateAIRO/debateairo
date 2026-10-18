// tests/unit/engine-map-estimate.test.ts
import { describe, expect, it } from "vitest";
import { LENGTH_ALLOWANCE_LIMITS } from "@debateai/kernel";
import { mapEngineLargestReplyWordsCeiling, mapLargestReplyWordsCeiling } from "@debateai/map";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues,
  resolveDebateShape, resolveLengthGuidance, type EngineSettings, type LengthGuidance
} from "@debateai/register";
import { previewOutputTokensForBasis, type PreviewCallOutputTokens } from "../../apps/api/src/preview-budget-estimate.js";
import { expectedCallsByRoleFromBasis, mapLengthAllowanceTokens } from "../../apps/api/src/ask-model-picker.js";

// As tests/unit/debate-shape-preview-estimate.test.ts builds its shaped basis, with LG-C's length and R1d's engine.
const OUTPUT: PreviewCallOutputTokens = Object.freeze({ debate: 8192, storyteller: 32_768, storytellerRetry: 65_536, storyChecker: 8192 });
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const SHAPE = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "free", makers: 2,
  settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } })!;
const LENGTH = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });
const basisWith = (length: LengthGuidance, engineSettings?: EngineSettings) => computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1,
  shape: SHAPE, length, ...(engineSettings === undefined ? {} : { engine: engineSettings }) });
const basis = (extra: object) => computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, shape: SHAPE, length: LENGTH, ...extra });
const engine = (mapOpening: boolean) => engineSettingsOf(engineVersionPolicyStartValues(), { makers: 2, mapOpening });
const targetsOf = (length: LengthGuidance) => ({ targets: length.map, charactersPerWord: length.charactersPerWord });

/** Spec §10 (Review Focus 5 of the program): the estimate must count the check, or a debate could be refused or overspend. */
describe("engine 2: the start-of-debate estimate counts the map's answer check", () => {
  it("the new shape on engine 2 prices exactly one more POSITION call than without the engine; today's shape none", () => {
    expect(expectedCallsByRoleFromBasis(basis({ engine: engine(true) })).POSITION)
      .toBe(expectedCallsByRoleFromBasis(basis({})).POSITION + 1);
    expect(expectedCallsByRoleFromBasis(basis({ engine: engine(false) })).POSITION).toBe(expectedCallsByRoleFromBasis(basis({})).POSITION);
  });

  /** Pre-flight PF-R35.11, PF-R35.12: engine compared with engine, through the ONE shared map pricer, below the cap. */
  it("a raised checkReason raises the shared map allowance under engine 2 only, and the engine estimate covers it", () => {
    // The smallest raise (in steps of 10 words) that makes the check's reply the map's largest by at least 100 words,
    // found from the code's own ceilings, never typed.
    const withReason = (words: number): LengthGuidance => ({ ...LENGTH, map: { ...LENGTH.map, checkReason: words } });
    let reason = LENGTH.map.checkReason;
    while (mapEngineLargestReplyWordsCeiling(targetsOf(withReason(reason))) < mapLargestReplyWordsCeiling(targetsOf(withReason(reason))) + 100
      && reason < LENGTH_ALLOWANCE_LIMITS.capTokens) reason += 10;
    const raised = withReason(reason);
    expect(mapEngineLargestReplyWordsCeiling(targetsOf(raised))).toBeGreaterThanOrEqual(mapLargestReplyWordsCeiling(targetsOf(raised)) + 100);
    const today = mapLengthAllowanceTokens(raised, OUTPUT.debate, false);
    expect(today).toBeLessThan(LENGTH_ALLOWANCE_LIMITS.capTokens);
    expect(mapLengthAllowanceTokens(raised, OUTPUT.debate, true)).toBeGreaterThan(today);
    expect(mapLengthAllowanceTokens(raised, OUTPUT.debate)).toBe(today);
    // The engine-2 estimate prices a debate call at least at the engine map allowance (engine with engine).
    expect(previewOutputTokensForBasis(OUTPUT, basisWith(raised, engine(true))).debate)
      .toBeGreaterThanOrEqual(mapLengthAllowanceTokens(raised, OUTPUT.debate, true));
    // Without the engine the raised and the start receipts price the same: checkReason reaches no engine-1 map contract.
    expect(previewOutputTokensForBasis(OUTPUT, basisWith(raised)).debate).toBe(previewOutputTokensForBasis(OUTPUT, basisWith(LENGTH)).debate);
  });
});
