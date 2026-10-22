import { describe, expect, it, vi } from "vitest";
import { previewModelRow, type PreviewGateRemaining } from "@debateai/providers";
import { computeStructuralCeilingBasis, debateShapePolicyStartValues, resolveDebateShape } from "@debateai/register";
import {
  assertPreviewBudgetAdmits, estimatePreviewGateNeeds, PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, PreviewDailyLimitRefusal,
  previewCallNanoUsd, previewCallShares, previewOutputTokensForBasis, previewShapedGradingShare, previewShapeWriterBound, realisticWorstCasePricer,
  type PreviewBudgetGateSettings, type PreviewCallOutputTokens, type PreviewCallPricer, type PreviewPanelMember, type PreviewUnfinishedRun
} from "../../apps/api/src/preview-budget-estimate.js";
import { expectedCallsByRoleFromBasis } from "../../apps/api/src/ask-model-picker.js";

const GLM = "zai-org/GLM-5.3-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const HAIKU = "claude-haiku-5-5";
const OUTPUT: PreviewCallOutputTokens = Object.freeze({ debate: 8192, storyteller: 32_768, storytellerRetry: 65_536, storyChecker: 8192 });
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const SHAPE = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "free", makers: 2,
  settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" } })!;
const shaped = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, shape: SHAPE });
const legacy = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1 });
const PANEL = Object.freeze([{ provider_ref: "preview:fixture-a", model_id: GLM }, { provider_ref: "preview:mimo", model_id: MIMO }]);
const ROLES = Object.freeze({ answerWriter: GLM, answerChecker: GLM, storyteller: GLM, storyChecker: GLM });
// M2: a shaped receipt needs `dearestFor`; MiMo is the dearer of the DeepInfra gate's members here.
const sharesOf = (basis: Readonly<Record<string, unknown>>, panel: readonly PreviewPanelMember[] = PANEL) => previewCallShares({ basis, panel,
  roleModels: ROLES, roleProviderRefs: [], storyRounds: 0, maxCooldownHoldsPerRun: 2,
  dearestFor: (models) => models.includes(MIMO) ? MIMO : models[0]! });

describe("the preview prices the answer writer at the run's answer length (spec 2026-10-12 §3.3 step 8)", () => {
  it("the answer writer is priced at the row's own maximum on every receipt (LG-B, L26)", () => {
    const row = previewModelRow(MIMO)!;
    const own = previewCallNanoUsd(row, PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, row.finalWriterOutputBound, "FINAL_WRITER");
    expect(own).toBe(PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL * 430n + 65_536n * 870n);
    expect(realisticWorstCasePricer(OUTPUT)(row, "ANSWER_WRITER")).toBe(own);
    // A shape's writer bound no longer lowers or raises it: the writer is a final writer.
    expect(realisticWorstCasePricer({ ...OUTPUT, answerWriter: 16_384 })(row, "ANSWER_WRITER")).toBe(own);
  });
  it("reads the writer bound (and the map step bounds, X1) from a shape receipt only", () => {
    expect(previewShapeWriterBound(legacy)).toBeNull();
    expect(previewShapeWriterBound(shaped)).toBe(16_384);
    expect(previewOutputTokensForBasis(OUTPUT, legacy)).toBe(OUTPUT);
    expect(previewOutputTokensForBasis(OUTPUT, shaped)).toEqual({ ...OUTPUT, answerWriter: 16_384, mapMerge: 32_768, mapChoose: 32_768 });
    // A bound below the gate's own debate bound never lowers a call (max of the two).
    expect(previewOutputTokensForBasis({ ...OUTPUT, debate: 40_000 }, shaped))
      .toEqual({ ...OUTPUT, debate: 40_000, answerWriter: 40_000, mapMerge: 40_000, mapChoose: 40_000 });
  });
  it("PF7: a shape-formula receipt the strict reader refuses is refused, never priced as today's", () => {
    const { shape: _dropped, ...withoutShape } = shaped;
    expect(() => previewShapeWriterBound(withoutShape)).toThrow(/malformed debate shape/u);
    expect(() => previewOutputTokensForBasis(OUTPUT, { ...shaped, shape: { ...(shaped.shape as Readonly<Record<string, unknown>>), writer_bound: "16384" } }))
      .toThrow(/malformed debate shape/u);
  });
  it("I1: a shaped receipt whose sites do not split into roles is refused, never priced as today's shape", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const odd: any = JSON.parse(JSON.stringify(shaped));
    odd.serve_leg.synthesis_loop_sites = 7; odd.call_sites.serve = 7; odd.serve_reserve_attempts = 7 * odd.per_site_attempts.organ;
    expect(() => estimatePreviewGateNeeds({ roleModels: ROLES, roleProviderRefs: [], storyRounds: 0, callOutputTokens: OUTPUT,
      maxCooldownHoldsPerRun: 2, basis: odd, panel: PANEL })).toThrow(/synthesis-loop sites 7 are odd/u);
  });
  it("every receipt puts the writer's sites on ANSWER_WRITER and the checker's on ANSWER_CHECKER (LG-B, L26)", () => {
    for (const basis of [legacy, shaped]) {
      const { shares } = sharesOf(basis);
      expect([...new Set(shares.filter((share) => share.type === "ANSWER_WRITER").map((share) => share.model))]).toEqual([GLM]);
      expect([...new Set(shares.filter((share) => share.type === "ANSWER_CHECKER").map((share) => share.model))]).toEqual([GLM]);
    }
    const writer = sharesOf(shaped).shares.filter((share) => share.type === "ANSWER_WRITER");
    // 3 writer sites x 44 debate calls (one per site: author 18 + panel 10 + reviewer 10 + serve 6) x 2 members.
    expect(writer).toEqual([{ model: GLM, type: "ANSWER_WRITER", numerator: 264n }]);
    expect(sharesOf(shaped).denominator).toBe(88n);
  });
});

describe("X1: the map's merge and choose are priced at the run's map step bounds; every other map site at the debate bound", () => {
  it("M2: a shaped receipt without a seat chooser is refused (its map seats are never chosen at a debate call's price); today's needs none", () => {
    expect(() => previewCallShares({ basis: shaped, panel: PANEL, roleModels: ROLES, roleProviderRefs: [], storyRounds: 0,
      maxCooldownHoldsPerRun: 2 })).toThrow("PREVIEW_ROTATION_PRICER_MISSING");
    expect(previewCallShares({ basis: legacy, panel: PANEL, roleModels: ROLES, roleProviderRefs: [], storyRounds: 0,
      maxCooldownHoldsPerRun: 2 })).toEqual(sharesOf(legacy));
  });
  it("a MAP_MERGE or MAP_CHOOSE call is a debate call unless the run's bound is larger", () => {
    const row = previewModelRow(GLM)!;
    for (const type of ["MAP_MERGE", "MAP_CHOOSE"] as const) {
      expect(realisticWorstCasePricer(OUTPUT)(row, type)).toBe(realisticWorstCasePricer(OUTPUT)(row, "DEBATE"));
    }
    const long = realisticWorstCasePricer({ ...OUTPUT, mapMerge: 32_768, mapChoose: 16_384 });
    expect(long(row, "MAP_MERGE")).toBe(previewCallNanoUsd(row, PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, 32_768));
    expect(long(row, "MAP_CHOOSE")).toBe(previewCallNanoUsd(row, PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, 16_384));
  });
  it("one merge and one choose per run, on the gate's dearest member; the other six map sites stay debate calls", () => {
    expect(sharesOf(legacy).shares.some((share) => share.type === "MAP_MERGE" || share.type === "MAP_CHOOSE")).toBe(false);
    const { denominator, shares } = sharesOf(shaped);
    // One call each (numerator = denominator), at MiMo, the dearer of the gate's two members.
    expect(shares.filter((share) => share.type === "MAP_MERGE")).toEqual([{ model: MIMO, type: "MAP_MERGE", numerator: 88n }]);
    expect(shares.filter((share) => share.type === "MAP_CHOOSE")).toEqual([{ model: MIMO, type: "MAP_CHOOSE", numerator: 88n }]);
    // Still exactly one call per site on the one gate: 44 = the 8 map sites (6 DEBATE + merge + choose) and every other site.
    const billed = shares.filter((share) => share.type !== "PROBE" && share.type !== "UNBILLED_RETRY")
      .reduce((sum, share) => sum + share.numerator, 0n);
    expect(billed).toBe(44n * denominator);
  });
  it("with more lists and gap rounds still two long calls per gate, one gate's dearest member each", () => {
    const pro = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "pro", makers: 4,
      settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } })!;
    expect(pro).toMatchObject({ mapAIs: 4, gapRounds: 2 });
    const basis = computeStructuralCeilingBasis({ ...TERMS, panelSize: 4, depth: 2, shape: pro });
    const panel = [GLM, MIMO, DEEPSEEK, HAIKU].map((model_id, index) => ({ provider_ref: `preview:m${index}`, model_id }));
    const { denominator, shares } = sharesOf(basis, panel);
    for (const type of ["MAP_MERGE", "MAP_CHOOSE"] as const) {
      expect(shares.filter((share) => share.type === type)).toEqual([
        { model: MIMO, type, numerator: denominator }, { model: HAIKU, type, numerator: denominator }
      ]);
    }
  });
});

describe("PF5: a rotated shaped debate puts its writer on each gate's dearest member at the WRITER's price", () => {
  it("the writer's member is chosen by its ANSWER_WRITER price, not its debate price", () => {
    // Only the writer's calls cost anything: GLM's writer call is the dearer, while every debate call ties (MiMo first wins a tie).
    const pricer: PreviewCallPricer = (row, type) => type === "ANSWER_WRITER" ? (row.model === GLM ? 1000n : 100n) : 0n;
    const needs = estimatePreviewGateNeeds({ roleModels: ROLES, roleProviderRefs: [], storyRounds: 0, callOutputTokens: OUTPUT,
      maxCooldownHoldsPerRun: 2, basis: shaped, panel: [PANEL[1]!, PANEL[0]!], pricer, rotated: true });
    // 3 writer calls at GLM's 1,000, x 1.15 = 3,450 (at MiMo's 100 it would be 345).
    expect(needs).toHaveLength(1);
    expect(needs[0]!.callsNanoUsd).toBe(3450n);
  });
});

describe("PF6: admission prices a new and an unfinished debate, each with ITS OWN shape's bounds", () => {
  const remaining = (): PreviewGateRemaining => Object.freeze({ state: "active", windowOpen: true, remainingNanoUsd: 0n,
    remainingCalls: 10_000_000, maxConcurrentCalls: 0, largestReservationNanoUsd: 0n, enabledModels: [GLM, MIMO] });
  const gate = (unfinished: readonly PreviewUnfinishedRun[]): PreviewBudgetGateSettings => Object.freeze({
    remaining: { deepinfra: async () => remaining() }, roleModels: ROLES, roleProviderRefs: [], storyRounds: 0,
    callOutputTokens: OUTPUT, askProbeModelIds: [], maxCooldownHoldsPerRun: 2, readUnfinishedRuns: async () => unfinished,
    // The unfinished debate was admitted under the API's own version (side-by-side C16).
    termsForVersion: async () => Object.freeze({ roleModels: ROLES, roleProviderRefs: [], storyRounds: 0, callOutputTokens: OUTPUT,
      maxCooldownHoldsPerRun: 2 })
  });
  /** The gate refuses (no money left); its refusal names what the unfinished debates hold and what the new one needs. */
  const figures = async (settings: PreviewBudgetGateSettings, basis: Readonly<Record<string, unknown>>) => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await assertPreviewBudgetAdmits(settings, { basis, panel: PANEL });
    } catch (error) {
      if (!(error instanceof PreviewDailyLimitRefusal)) throw error;
      const found = /(\d+) held by unfinished debates, the debate needs (\d+)/u.exec(error.message);
      if (found === null) throw error;
      return { held: BigInt(found[1]!), needs: BigInt(found[2]!) };
    } finally {
      quiet.mockRestore();
    }
    throw new Error("the gate admitted a debate it had no money for");
  };
  /** The same debate priced at the gate's own bounds only, as if its receipt carried no shape bounds. */
  const shapeBlind = (basis: Readonly<Record<string, unknown>>): bigint => estimatePreviewGateNeeds({ roleModels: ROLES,
    roleProviderRefs: [], storyRounds: 0, callOutputTokens: OUTPUT, maxCooldownHoldsPerRun: 2, basis, panel: PANEL,
    pricer: realisticWorstCasePricer(OUTPUT) })[0]!.callsNanoUsd;
  // What the shape adds, from the rows' list prices alone: MiMo (the gate's dearest member) merges and chooses once each
  // at 32,768 instead of 8,192. Before the 15% margin. LG-B (L26): the writer is a final writer, priced at its row's own
  // maximum with or without a shape, so the shape no longer adds GLM's 3 answers at 16,384 instead of 8,192.
  const mimo = previewModelRow(MIMO)!;
  const added = 2n * (32_768n - 8192n) * mimo.outputNanoUsdPerToken;
  const withinMargin = (more: bigint): boolean => 100n * more >= 115n * added - 100n && 100n * more <= 115n * added + 100n;

  it("a new shaped debate and an unfinished shaped one are both charged the map step bounds (the writer at its row's maximum, LG-B)", async () => {
    const run: PreviewUnfinishedRun = { basis: shaped, panel: PANEL, phase: "DEBATE", registerVersion: 17 };
    const { held, needs } = await figures(gate([run]), shaped);
    expect(needs).toBe(held);
    expect(needs).toBeGreaterThan(shapeBlind(shaped));
    expect(withinMargin(needs - shapeBlind(shaped))).toBe(true);
  });
  it("a new debate of today's shape is priced exactly as today while the unfinished shaped one keeps its own bounds", async () => {
    const run: PreviewUnfinishedRun = { basis: shaped, panel: PANEL, phase: "DEBATE", registerVersion: 17 };
    const { held, needs } = await figures(gate([run]), legacy);
    expect(needs).toBe(shapeBlind(legacy));
    expect(withinMargin(held - shapeBlind(shaped))).toBe(true);
  });
});

describe("pre-flight PF-B35 / PF-B36: a shaped run's gate is never charged less than its own members can make", () => {
  it("PF-B35: a gate of g members carries min(1, g / (J + E)) of the grading sites, whatever the panel size", () => {
    const share = (gateMembers: number, graders: number, closeCallExtraGraders: number) =>
      previewShapedGradingShare({ gateMembers, graders, closeCallExtraGraders });
    // J=1, E=0 on a 4-maker panel: one member can grade every node. The old bound min(1, g·(J+E)/(M−1)) gave 1/3.
    expect(share(1, 1, 0)).toEqual({ numerator: 1n, denominator: 1n });
    // The Plus start values on 4 makers (J=3, E=0): a one-member gate grades at most a third.
    expect(share(1, 3, 0)).toEqual({ numerator: 1n, denominator: 3n });
    expect(share(3, 3, 0)).toEqual({ numerator: 3n, denominator: 3n });
    // The premium start values with makers to spare (J=3, E=2) and the free ones (J=2, E=2).
    expect(share(1, 3, 2)).toEqual({ numerator: 1n, denominator: 5n });
    expect(share(3, 3, 2)).toEqual({ numerator: 3n, denominator: 5n });
    expect(share(6, 3, 2)).toEqual({ numerator: 5n, denominator: 5n });
    expect(share(1, 2, 2)).toEqual({ numerator: 1n, denominator: 4n });
    expect(share(2, 2, 2)).toEqual({ numerator: 2n, denominator: 4n });
  });

  it("PF-B36: every gate carries the authored sites in full; each gate's total is what its own members can make", () => {
    const plus = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "plus", makers: 4,
      settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } })!;
    expect(plus).toMatchObject({ answers: 3, graders: 3, closeCallExtraGraders: 0 });
    const basis = computeStructuralCeilingBasis({ ...TERMS, panelSize: 4, depth: 2, shape: plus });
    const panel = [GLM, MIMO, DEEPSEEK, HAIKU].map((model_id, index) => ({ provider_ref: `preview:m${index}`, model_id }));
    const { denominator, shares } = sharesOf(basis, panel);
    const roles = expectedCallsByRoleFromBasis(basis);
    const members = 4n;
    const debate = denominator / members; // PER_STEP (the active mode): one call per site
    const authored = BigInt(roles.POSITION + roles.SUPPORT_ATTACK + roles.CROSS_EXCHANGE) - 2n; // merge and choose priced apart
    const judge = BigInt(roles.JUDGE);
    const reviewer = BigInt(roles.REVIEWER);
    const debateOf = (models: readonly string[]) => shares.filter((entry) => models.includes(entry.model) && entry.type === "DEBATE")
      .reduce((sum, entry) => sum + entry.numerator, 0n);
    // The Anthropic gate (Haiku alone, g=1, J+E=3): every authored site, a third of the grading, the others' reviews.
    // The old even split charged it a quarter of the authored and grading sites together.
    // The grading share is rounded UP, as the code rounds it (never under-count).
    expect(debateOf([HAIKU])).toBe(authored * debate * members + ceilDiv(judge * debate * members * 1n, 3n) + reviewer * debate * (members - 1n));
    // The DeepInfra gate (three members, min(1, 3/3) = 1): every authored, grading and review site; GLM also holds the
    // answer checker's sites (a role, not a panel share), its own kind of call since LG-B (L26).
    expect(debateOf([GLM, MIMO, DEEPSEEK])).toBe((authored + judge + reviewer) * debate * members);
    expect(shares.filter((entry) => entry.type === "ANSWER_CHECKER")).toEqual([
      { model: GLM, type: "ANSWER_CHECKER", numerator: BigInt(roles.ANSWER_CHECKER) * debate * members }]);
  });

  it("PF-B35 with close-call extras (J=3, E=2 on six members): a one-member gate carries a fifth of the grading, rounded up", () => {
    const plus = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "plus", makers: 6,
      settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } })!;
    expect(plus).toMatchObject({ graders: 3, closeCallExtraGraders: 2 });
    const basis = computeStructuralCeilingBasis({ ...TERMS, panelSize: 6, depth: 2, shape: plus });
    // Five DeepInfra members (one gate, g=5) and Haiku alone (g=1).
    const panel = [GLM, MIMO, DEEPSEEK, GLM, MIMO, HAIKU].map((model_id, index) => ({ provider_ref: `preview:m${index}`, model_id }));
    const { denominator, shares } = sharesOf(basis, panel);
    const roles = expectedCallsByRoleFromBasis(basis);
    const members = 6n;
    const debate = denominator / members;
    const authored = BigInt(roles.POSITION + roles.SUPPORT_ATTACK + roles.CROSS_EXCHANGE) - 2n;
    const judge = BigInt(roles.JUDGE);
    const reviewer = BigInt(roles.REVIEWER);
    const debateOf = (models: readonly string[]) => shares.filter((entry) => models.includes(entry.model) && entry.type === "DEBATE")
      .reduce((sum, entry) => sum + entry.numerator, 0n);
    expect(debateOf([HAIKU])).toBe(authored * debate * members + ceilDiv(judge * debate * members * 1n, 5n) + reviewer * debate * (members - 1n));
    // g=5 of J+E=5: every grading site. The answer checker's sites are their own kind of call since LG-B (L26).
    expect(debateOf([GLM, MIMO, DEEPSEEK])).toBe((authored + judge + reviewer) * debate * members);
    expect(shares.filter((entry) => entry.type === "ANSWER_CHECKER")).toEqual([
      { model: GLM, type: "ANSWER_CHECKER", numerator: BigInt(roles.ANSWER_CHECKER) * debate * members }]);
  });
});
/** Integer division rounded UP (the estimate's own rounding of a gate's grading share). */
function ceilDiv(numerator: bigint, divisor: bigint): bigint {
  return (numerator + divisor - 1n) / divisor;
}
