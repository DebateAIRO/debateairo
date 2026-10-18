// tests/unit/r2-estimate-sites.test.ts
// Engine redesign R2, Task B10 (INTERFACE §3.4; spec §10: the start-of-debate estimate stays a ceiling that never
// under-counts). An engine-2 receipt adds the comparing judges, the investigations at their cap and the map's answer
// check to the calls of the debate; each gate is charged the most of them its own members could make, each call at its
// own step's allowance. A receipt without the `engine` member prices exactly as today.
import { describe, expect, it } from "vitest";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, engineSettingsOf, engineVersionPolicyStartValues,
  lengthGuidanceAllowanceTokens, lengthGuidancePolicyStartValues, resolveDebateShape, resolveLengthGuidance
} from "@debateai/register";
import {
  previewCallShares, previewExpectedCalls, previewOutputTokensForBasis, type PreviewCallShares, type PreviewPanelMember
} from "../../apps/api/src/preview-budget-estimate.js";
import {
  admittedEngineOf, answerTokenCeilingsForBasis, expectedCallsByRoleFromBasis
} from "../../apps/api/src/ask-model-picker.js";

const GLM = "zai-org/GLM-5.3-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const HAIKU = "claude-haiku-5-5";
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const SETTINGS = Object.freeze({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const);
const LENGTH = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });
const POLICY = engineVersionPolicyStartValues();
const ROLES = Object.freeze({ answerWriter: GLM, answerChecker: GLM, storyteller: GLM, storyChecker: GLM });
const DEEPINFRA = Object.freeze([GLM, MIMO]);
const ANTHROPIC = Object.freeze([HAIKU]);

/** A receipt on `models` (each its own maker), today's shape or the new one, with the length member; engine 2 when asked. */
function receipt(models: readonly string[], shaped: boolean, engine: boolean): Readonly<Record<string, unknown>> {
  const makers = models.length;
  const shape = shaped
    ? resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "free", makers, settings: SETTINGS })!
    : undefined;
  return computeStructuralCeilingBasis({ ...TERMS, panelSize: models.length, depth: 1, length: LENGTH,
    ...(shape === undefined ? {} : { shape }),
    ...(engine ? { engine: engineSettingsOf(POLICY, { makers, mapOpening: shaped }) } : {}) });
}
/** The same receipt with its `engine` member taken off (what an engine-1 reader of the same debate would see). */
function withoutEngine(basis: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const { engine: _engine, ...rest } = basis;
  return rest;
}
const panelOf = (models: readonly string[]): readonly PreviewPanelMember[] =>
  models.map((model_id, index) => Object.freeze({ provider_ref: `preview:m${String(index)}`, model_id }));
const sharesOf = (basis: Readonly<Record<string, unknown>>, models: readonly string[]): PreviewCallShares => previewCallShares({
  basis, panel: panelOf(models), roleModels: ROLES, roleProviderRefs: [], storyRounds: 0, maxCooldownHoldsPerRun: 2,
  dearestFor: (candidates) => candidates[candidates.length - 1]! });
/** The calls of one kind charged to a gate's models, as a number (numerator over the shares' one denominator). */
function callsOn(shares: PreviewCallShares, gate: readonly string[], type: "DEBATE" | "UNBILLED_RETRY"): number {
  const numerator = shares.shares.filter((share) => share.type === type && gate.includes(share.model))
    .reduce((sum, share) => sum + share.numerator, 0n);
  return Number(numerator) / Number(shares.denominator);
}
/**
 * How many more calls the engine receipt charges a gate than the same debate without the engine. The shaped grading
 * share is rounded up per gate on each receipt's own denominator, so the two may differ by less than one part in each
 * denominator; nothing else moves.
 */
function expectAdded(models: readonly string[], shaped: boolean, gate: readonly string[], added: number): void {
  const engine = sharesOf(receipt(models, shaped, true), models);
  const plain = sharesOf(receipt(models, shaped, false), models);
  const slack = 1 / Number(engine.denominator) + 1 / Number(plain.denominator);
  for (const type of ["DEBATE", "UNBILLED_RETRY"] as const) {
    expect(Math.abs(callsOn(engine, gate, type) - callsOn(plain, gate, type) - added), `${gate.join("+")} ${type}`)
      .toBeLessThan(slack);
  }
}

describe("R2 B10: the engine's call sites in the role split (INTERFACE §3.4)", () => {
  it("today's shape: JUDGE gains the comparing judges, REVIEWER the investigations at their cap, POSITION nothing", () => {
    const plain = expectedCallsByRoleFromBasis(receipt(DEEPINFRA, false, false));
    const engine = expectedCallsByRoleFromBasis(receipt(DEEPINFRA, false, true));
    // Two makers: min(judges 3, makers 2) = 2 judges; the investigation cap is 2; no map, so no answer check.
    expect(engine).toEqual({ ...plain, JUDGE: plain.JUDGE + 2, REVIEWER: plain.REVIEWER + 2 });
  });
  it("the new shape: POSITION also gains the map's answer check", () => {
    const plain = expectedCallsByRoleFromBasis(receipt(DEEPINFRA, true, false));
    const engine = expectedCallsByRoleFromBasis(receipt(DEEPINFRA, true, true));
    expect(engine).toEqual({ ...plain, POSITION: plain.POSITION + 1, JUDGE: plain.JUDGE + 2, REVIEWER: plain.REVIEWER + 2 });
  });
  it("a receipt without the engine member is engine 1: today's split and today's shares, byte for byte", () => {
    for (const shaped of [false, true]) {
      const engineBasis = receipt(DEEPINFRA, shaped, true);
      expect(admittedEngineOf(withoutEngine(engineBasis))).toBeNull();
      expect(admittedEngineOf(engineBasis)).toEqual(engineSettingsOf(POLICY, { makers: 2, mapOpening: shaped }));
      // The golden numbers are today's function on the same debate minted without the engine.
      expect(expectedCallsByRoleFromBasis(withoutEngine(engineBasis))).toEqual(expectedCallsByRoleFromBasis(receipt(DEEPINFRA, shaped, false)));
      expect(sharesOf(withoutEngine(engineBasis), DEEPINFRA)).toEqual(sharesOf(receipt(DEEPINFRA, shaped, false), DEEPINFRA));
    }
  });
  it("an engine member the strict reader refuses is refused, never priced as engine 1", () => {
    const basis = receipt(DEEPINFRA, false, true);
    const broken = { ...basis, engine: { ...(basis.engine as Readonly<Record<string, unknown>>), version: 2 } };
    expect(() => admittedEngineOf(broken)).toThrow(/malformed engine member/u);
    expect(() => expectedCallsByRoleFromBasis(broken)).toThrow(/malformed engine member/u);
    expect(() => sharesOf(broken, DEEPINFRA)).toThrow(/malformed engine member/u);
  });
  // Pre-flight PF-R2b6.4 (Ruling PF-R2a8.14, option (a)): R1d's allowance, pinned. The receipt is untyped JSON, so its
  // numbers are read with Number().
  it("each engine site is allowed POST + structure repair + PATCH (Ruling PF-R2a8.14)", () => {
    const basis = receipt(DEEPINFRA, false, true);
    const sites = (basis.engine as { sites: { comparing_judges: number; investigations: number; answer_check: number;
      added_model_attempts: number } }).sites;
    const perSite = (basis.per_site_attempts as { panel_member: number }).panel_member;
    // The original POST, Haiku's repair POST, the salvage's PATCH POST: three run attempts per site.
    expect(perSite).toBeGreaterThanOrEqual(3);
    expect(sites.added_model_attempts).toBe((sites.comparing_judges + sites.investigations + sites.answer_check) * perSite);
    expect(Number(basis.max_model_attempts) - Number(receipt(DEEPINFRA, false, false).max_model_attempts))
      .toBe(sites.added_model_attempts);
  });
});

describe("R2 B10: each gate is charged the engine calls its own members could make (never under-counted)", () => {
  it("the debate's call count grows by exactly judges + investigations + check", () => {
    for (const [shaped, added] of [[false, 4], [true, 5]] as const) {
      const count = (basis: Readonly<Record<string, unknown>>) => previewExpectedCalls({ basis, panel: panelOf(DEEPINFRA),
        roleProviderRefs: [], storyRounds: 0, maxCooldownHoldsPerRun: 2 }).debate;
      expect(count(receipt(DEEPINFRA, shaped, true)) - count(receipt(DEEPINFRA, shaped, false))).toBe(added);
    }
  });
  it("one gate: exactly one more call per engine site (2 judges + 2 investigations, + the check in the new shape)", () => {
    expectAdded(DEEPINFRA, false, DEEPINFRA, 4);
    expectAdded(DEEPINFRA, true, DEEPINFRA, 5);
  });
  it("two gates: each carries min(its members, the judges) judges and every investigation (and the check)", () => {
    const three = [GLM, MIMO, HAIKU];
    // Three makers: 3 judges. DeepInfra (2 members) can hold 2 judge seats, Anthropic (Haiku alone) 1; any member may
    // investigate, so both gates carry both investigations (the careful side, as the reviews already are).
    expectAdded(three, false, DEEPINFRA, 2 + 2);
    expectAdded(three, false, ANTHROPIC, 1 + 2);
    expectAdded(three, true, DEEPINFRA, 2 + 2 + 1);
    expectAdded(three, true, ANTHROPIC, 1 + 2 + 1);
  });
});

// Pre-flight PF-R2b6.5: the judges and investigators are sent `guidedCallBound(judgeBound, "comparing_judge" |
// "investigator", lengthGuidance)`, so their allowance, not the arguing steps', is what the ceiling must hold.
describe("R2 B10: engine calls at their own steps' allowance (never under-counted)", () => {
  // A length row whose judge and investigator think far longer than any arguing step.
  const ROOMY = Object.freeze({ ...LENGTH, thinkingRoom: Object.freeze({ ...LENGTH.thinkingRoom,
    comparing_judge: 24 * 1024, investigator: 16 * 1024 }) });
  const roomy = (engine: boolean) => computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, length: ROOMY,
    ...(engine ? { engine: engineSettingsOf(POLICY, { makers: 2, mapOpening: false }) } : {}) });
  const OUT = Object.freeze({ debate: 4096, storyteller: 16384, storytellerRetry: 8192, storyChecker: 8192 });
  it("the preview prices an engine receipt's debate calls at the judge's allowance; engine 1 keeps today's", () => {
    const judge = lengthGuidanceAllowanceTokens(ROOMY, "comparing_judge", OUT.debate);
    expect(previewOutputTokensForBasis(OUT, roomy(true)).debate).toBe(judge);
    expect(previewOutputTokensForBasis(OUT, roomy(false)).debate).toBeLessThan(judge);
  });
  // R2b final wave P10 (B10 Minor 1): when the investigator thinks longer than the judge, the investigator's allowance
  // prices the debate calls (PREVIEW_ENGINE_DEBATE_STEPS' "investigator" is read, not only the judge).
  it("the preview prices an engine receipt's debate calls at the investigator's allowance when it is the largest", () => {
    const INVESTIGATOR_ROOMIER = Object.freeze({ ...LENGTH, thinkingRoom: Object.freeze({ ...LENGTH.thinkingRoom,
      comparing_judge: 16 * 1024, investigator: 24 * 1024 }) });
    const basis = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, length: INVESTIGATOR_ROOMIER,
      engine: engineSettingsOf(POLICY, { makers: 2, mapOpening: false }) });
    const investigator = lengthGuidanceAllowanceTokens(INVESTIGATOR_ROOMIER, "investigator", OUT.debate);
    expect(investigator).toBeGreaterThan(lengthGuidanceAllowanceTokens(INVESTIGATOR_ROOMIER, "comparing_judge", OUT.debate));
    expect(previewOutputTokensForBasis(OUT, basis).debate).toBe(investigator);
  });

  // R2b final wave P10 (B10 Minor 2): a receipt with neither the shape nor the length member keeps the sealed table
  // before anything reads the engine member (the same object back; the engine reader is never reached).
  it("returns today's table for a receipt without shape and length before reading any engine member", () => {
    const CEILINGS = Object.freeze({ POSITION: 4096, SUPPORT_ATTACK: 4096, CROSS_EXCHANGE: 4096, JUDGE: 4096,
      REVIEWER: 4096, ANSWER_WRITER: 8192, ANSWER_CHECKER: 4096 });
    const { length: _length, ...noLength } = roomy(true);
    expect(() => admittedEngineOf(noLength)).toThrow(/malformed engine member/u);
    expect(answerTokenCeilingsForBasis(CEILINGS, noLength)).toBe(CEILINGS);
  });

  it("the picker's JUDGE and REVIEWER bounds hold the judge's and the investigator's allowance", () => {
    const CEILINGS = Object.freeze({ POSITION: 4096, SUPPORT_ATTACK: 4096, CROSS_EXCHANGE: 4096, JUDGE: 4096,
      REVIEWER: 4096, ANSWER_WRITER: 8192, ANSWER_CHECKER: 4096 });
    const engine = answerTokenCeilingsForBasis(CEILINGS, roomy(true));
    const plain = answerTokenCeilingsForBasis(CEILINGS, roomy(false));
    expect(engine.JUDGE).toBe(Math.max(plain.JUDGE, lengthGuidanceAllowanceTokens(ROOMY, "comparing_judge", CEILINGS.JUDGE)));
    expect(engine.REVIEWER).toBe(Math.max(plain.REVIEWER, lengthGuidanceAllowanceTokens(ROOMY, "investigator", CEILINGS.REVIEWER)));
    expect({ ...engine, JUDGE: 0, REVIEWER: 0 }).toEqual({ ...plain, JUDGE: 0, REVIEWER: 0 });
  });
});
