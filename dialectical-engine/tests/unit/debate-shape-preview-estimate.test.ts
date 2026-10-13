import { describe, expect, it, vi } from "vitest";
import { previewModelRow, type PreviewGateRemaining } from "@debateai/providers";
import { computeStructuralCeilingBasis, debateShapePolicyStartValues, resolveDebateShape } from "@debateai/register";
import {
  assertPreviewBudgetAdmits, estimatePreviewGateNeeds, PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, PreviewDailyLimitRefusal,
  previewCallNanoUsd, previewCallShares, previewOutputTokensForBasis, previewShapeWriterBound, realisticWorstCasePricer,
  type PreviewBudgetGateSettings, type PreviewCallOutputTokens, type PreviewCallPricer, type PreviewPanelMember, type PreviewUnfinishedRun
} from "../../apps/api/src/preview-budget-estimate.js";

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
const sharesOf = (basis: Readonly<Record<string, unknown>>, panel: readonly PreviewPanelMember[] = PANEL) => previewCallShares({ basis, panel,
  roleModels: ROLES, roleProviderRefs: [], storyRounds: 0, maxCooldownHoldsPerRun: 2 });

describe("the preview prices the answer writer at the run's answer length (spec 2026-10-12 §3.3 step 8)", () => {
  it("an ANSWER_WRITER call is a debate call unless the run's writer bound is larger", () => {
    const row = previewModelRow(MIMO)!;
    expect(realisticWorstCasePricer(OUTPUT)(row, "ANSWER_WRITER")).toBe(realisticWorstCasePricer(OUTPUT)(row, "DEBATE"));
    expect(realisticWorstCasePricer({ ...OUTPUT, answerWriter: 16_384 })(row, "ANSWER_WRITER"))
      .toBe(previewCallNanoUsd(row, PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, 16_384));
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
  it("today's debate keeps today's shares; a shaped one puts the writer's sites on ANSWER_WRITER", () => {
    expect(sharesOf(legacy).shares.some((share) => share.type === "ANSWER_WRITER")).toBe(false);
    const writer = sharesOf(shaped).shares.filter((share) => share.type === "ANSWER_WRITER");
    // 3 writer sites x 44 debate calls (one per site: author 18 + panel 10 + reviewer 10 + serve 6) x 2 members.
    expect(writer).toEqual([{ model: GLM, type: "ANSWER_WRITER", numerator: 264n }]);
    expect(sharesOf(shaped).denominator).toBe(88n);
  });
});

describe("X1: the map's merge and choose are priced at the run's map step bounds; every other map site at the debate bound", () => {
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
    callOutputTokens: OUTPUT, askProbeModelIds: [], maxCooldownHoldsPerRun: 2, readUnfinishedRuns: async () => unfinished
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
  // What the shape adds, from the rows' list prices alone: GLM writes 3 answers at 16,384 instead of 8,192 tokens; MiMo
  // (the gate's dearest member) merges and chooses once each at 32,768 instead of 8,192. Before the 15% margin.
  const glm = previewModelRow(GLM)!;
  const mimo = previewModelRow(MIMO)!;
  const added = 3n * (16_384n - 8192n) * glm.outputNanoUsdPerToken + 2n * (32_768n - 8192n) * mimo.outputNanoUsdPerToken;
  const withinMargin = (more: bigint): boolean => 100n * more >= 115n * added - 100n && 100n * more <= 115n * added + 100n;

  it("a new shaped debate and an unfinished shaped one are both charged the writer and map step bounds", async () => {
    const run: PreviewUnfinishedRun = { basis: shaped, panel: PANEL, phase: "DEBATE" };
    const { held, needs } = await figures(gate([run]), shaped);
    expect(needs).toBe(held);
    expect(needs).toBeGreaterThan(shapeBlind(shaped));
    expect(withinMargin(needs - shapeBlind(shaped))).toBe(true);
  });
  it("a new debate of today's shape is priced exactly as today while the unfinished shaped one keeps its own bounds", async () => {
    const run: PreviewUnfinishedRun = { basis: shaped, panel: PANEL, phase: "DEBATE" };
    const { held, needs } = await figures(gate([run]), legacy);
    expect(needs).toBe(shapeBlind(legacy));
    expect(withinMargin(held - shapeBlind(shaped))).toBe(true);
  });
});
