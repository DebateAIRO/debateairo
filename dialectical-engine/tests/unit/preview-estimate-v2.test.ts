/**
 * V4 start step, Task 40 (spec 2026-11-03 §4.3, §5): the start-of-debate estimate prices SHAPE RECEIPT V2 (a path debate)
 * on its own terms, so admission no longer answers "unavailable" for it (Task 4's bridge is gone):
 * - no map choose is priced apart (a v2 receipt has no choose bound); the one merge, on a run that builds its own list
 *   only (RUN_BUILT), at each gate's dearest member;
 * - the authored sites (each path's root and points, the gap rounds) from the v2 role split, in full at each gate's
 *   dearest member, the grading at `previewShapedGradingShare`, as a v1 shaped run;
 * - the main answer and the first story loop on the fixed final seats (PREVIEW_V2_FINAL_SEATS: Haiku writes, GLM checks)
 *   whatever the register's roles or a rotation pin; engine 2's second story loop on each gate's dearest member;
 * - every path's answer so far (`path_outcome_sites`), half on each seat, each with its unbilled retry, its body at the
 *   end-of-debate line and its answer at the path rewrite's bound on the preview (8,192);
 * - the web part read from either receipt version; every pricer takes the run's final-writer terms from its own receipt.
 * Made-up figures only: the row prices are the preview's reviewed list prices.
 */
import { describe, expect, it, vi } from "vitest";
import { PREVIEW_V2_FINAL_SEATS, previewModelRow, type PreviewGateRemaining, type PreviewModelRow } from "@debateai/providers";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, engineSettingsOf, engineVersionPolicyStartValues,
  lengthGuidancePolicyStartValues, resolveDebateShape, resolveDebateShapeV2, resolveLengthGuidance, webSitesOf,
  type DebateShapePlanKey, type WebSites
} from "@debateai/register";
import type { StartPathsSource } from "@debateai/contract";
import { admittedShapeV2Of, expectedCallsByRoleFromBasis } from "../../apps/api/src/ask-model-picker.js";
import {
  PREVIEW_V2_FINAL_WRITER_INPUT_TOKENS, PreviewDailyLimitRefusal, assertPreviewBudgetAdmits, estimatePreviewGateNeeds,
  estimateUnfinishedRunHolds, previewCallNanoUsd, previewCallShares, previewExpectedCalls, previewFinalWriterPricingOf, previewGateKeyOf,
  previewOutputTokensForBasis, previewWebSitesOf, realisticWorstCasePricer, type PreviewBudgetGateSettings,
  type PreviewCallOutputTokens, type PreviewCallShare, type PreviewPanelMember, type PreviewRoleModels, type PreviewUnfinishedRun
} from "../../apps/api/src/preview-budget-estimate.js";

const GLM = "zai-org/GLM-5.3-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const HAIKU = "claude-haiku-5-5";
const row = (model: string): PreviewModelRow => previewModelRow(model)!;
const OUTPUT: PreviewCallOutputTokens = Object.freeze({ debate: 8192, storyteller: 32_768, storytellerRetry: 65_536, storyChecker: 8192 });
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const POLICY = debateShapePolicyStartValues();
const SETTINGS = Object.freeze({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const);
/** Three DeepInfra makers and Haiku, alone on the Anthropic gate. */
const PANEL: readonly PreviewPanelMember[] = Object.freeze([GLM, MIMO, DEEPSEEK, HAIKU]
  .map((model_id, index) => Object.freeze({ provider_ref: `preview:m${index}`, model_id })));
/** The register's roles, none of them a final seat: a path debate's answer and first story loop sit on the seats anyway. */
const ROLES: PreviewRoleModels = Object.freeze({ answerWriter: MIMO, answerChecker: MIMO, storyteller: MIMO, storyChecker: DEEPSEEK });
const STORY_ROUNDS = 2;

/** A path debate's receipt as admission mints it (Task 34): engine 2 without a map opening, length guidance, web when given. */
function pathBasis(plan: DebateShapePlanKey, paths: number, pathsSource: StartPathsSource,
  options: Readonly<{ engine?: boolean; web?: WebSites; panel?: readonly PreviewPanelMember[] }> = {}): Readonly<Record<string, unknown>> {
  const makers = (options.panel ?? PANEL).length;
  const shapeV2 = resolveDebateShapeV2(POLICY, plan, { ...SETTINGS, paths, pathsSource }, makers);
  return computeStructuralCeilingBasis({ ...TERMS, panelSize: makers, depth: 1, shapeV2,
    length: resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan, answerLength: "standard" }),
    ...(options.engine === false ? {} : { engine: engineSettingsOf(engineVersionPolicyStartValues(), { makers, mapOpening: false }) }),
    ...(options.web === undefined ? {} : { web: options.web }) });
}
/** R22's receipt for the same question: shape v1 with its 3 answers, engine 2 with the map opening. */
function r22Basis(web?: WebSites): Readonly<Record<string, unknown>> {
  const shape = resolveDebateShape({ policy: POLICY, plan: "plus", makers: PANEL.length, settings: SETTINGS })!;
  expect(shape.answers).toBe(3);
  return computeStructuralCeilingBasis({ ...TERMS, panelSize: PANEL.length, depth: 1, shape,
    length: resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "plus", answerLength: "standard" }),
    engine: engineSettingsOf(engineVersionPolicyStartValues(), { makers: PANEL.length, mapOpening: true }),
    ...(web === undefined ? {} : { web }) });
}
const legacy = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1 });
/** The stand-in seat chooser: MiMo is the DeepInfra gate's dearest member, Haiku the Anthropic gate's only one. */
const dearestFor = (models: readonly string[]): string => models.includes(MIMO) ? MIMO : models[0]!;
const sharesOf = (basis: Readonly<Record<string, unknown>>, options: Readonly<{ rotated?: boolean }> = {}) => previewCallShares({
  basis, panel: PANEL, roleModels: ROLES, roleProviderRefs: [], storyRounds: STORY_ROUNDS, maxCooldownHoldsPerRun: 2, dearestFor,
  ...(options.rotated === true ? { rotated: true } : {}) });
const ofType = (shares: readonly PreviewCallShare[], type: PreviewCallShare["type"]) => shares.filter((share) => share.type === type);
const debateOf = (shares: readonly PreviewCallShare[], models: readonly string[]): bigint =>
  shares.filter((share) => share.type === "DEBATE" && models.includes(share.model)).reduce((sum, share) => sum + share.numerator, 0n);
const ceilDiv = (numerator: bigint, divisor: bigint): bigint => (numerator + divisor - 1n) / divisor;

describe("a path debate's map: no choose priced apart; the merge only when the run builds its own list", () => {
  it("MENU and DIG_PICKS: no MAP_MERGE or MAP_CHOOSE share (their lists were written, and charged, before Start)", () => {
    for (const source of ["MENU", "DIG_PICKS"] as const) {
      const { shares } = sharesOf(pathBasis("plus", 5, source));
      expect(shares.filter((share) => share.type === "MAP_MERGE" || share.type === "MAP_CHOOSE"), source).toEqual([]);
    }
  });

  it("RUN_BUILT: one merge per gate at its dearest member, a whole call each; no choose", () => {
    const { denominator, shares } = sharesOf(pathBasis("plus", 5, "RUN_BUILT"));
    const merges = ofType(shares, "MAP_MERGE");
    expect(merges.map((share) => previewGateKeyOf(share.model)).sort()).toEqual(["anthropic", "deepinfra"]);
    expect(merges).toEqual([{ model: MIMO, type: "MAP_MERGE", numerator: denominator }, { model: HAIKU, type: "MAP_MERGE", numerator: denominator }]);
    expect(ofType(shares, "MAP_CHOOSE")).toEqual([]);
  });
});

describe("a path debate's arguing: the v2 split at each gate's dearest member", () => {
  it("DIG_PICKS, 5 paths: POSITION 5 (one root per path), no cross replies; authored in full, grading by the gate's share", () => {
    const basis = pathBasis("plus", 5, "DIG_PICKS", { engine: false });
    const roles = expectedCallsByRoleFromBasis(basis);
    expect(roles).toMatchObject({ POSITION: 5, CROSS_EXCHANGE: 0 });
    const { shape } = admittedShapeV2Of(basis)!;
    expect(shape).toMatchObject({ graders: 3, closeCallExtraGraders: 0 });
    const { denominator, shares } = sharesOf(basis);
    const members = 4n;
    const debate = denominator / members; // PER_STEP: one call per site
    const authored = BigInt(roles.POSITION + roles.SUPPORT_ATTACK);
    const judge = BigInt(roles.JUDGE);
    const reviewer = BigInt(roles.REVIEWER);
    // The Anthropic gate (Haiku alone, g = 1, J + E = 3): every authored site, a third of the grading (rounded up), the others' reviews.
    expect(debateOf(shares, [HAIKU])).toBe(authored * debate * members + ceilDiv(judge * debate * members, 3n) + reviewer * debate * (members - 1n));
    // The DeepInfra gate (three members, min(1, 3/3) = 1): every authored, grading and review site.
    expect(debateOf(shares, [GLM, MIMO, DEEPSEEK])).toBe((authored + judge + reviewer) * debate * members);
  });

  it("RUN_BUILT, 5 paths: only the merge is priced apart; the run's own lists and its choose stay authored, in full", () => {
    const basis = pathBasis("plus", 5, "RUN_BUILT", { engine: false });
    const roles = expectedCallsByRoleFromBasis(basis);
    // POSITION holds the 5 roots and every map site: the plan's list writers, the merge, the choose and the gap rounds.
    expect(roles.POSITION).toBe(5 + admittedShapeV2Of(basis)!.counts.mapSites);
    const { denominator, shares } = sharesOf(basis);
    const members = 4n;
    const debate = denominator / members; // PER_STEP: one call per site
    // The merge alone leaves the authored sites (it is a MAP_MERGE on every gate); a v2 receipt has no choose priced apart.
    const authored = BigInt(roles.POSITION + roles.SUPPORT_ATTACK) - 1n;
    const judge = BigInt(roles.JUDGE);
    const reviewer = BigInt(roles.REVIEWER);
    expect(debateOf(shares, [HAIKU])).toBe(authored * debate * members + ceilDiv(judge * debate * members, 3n) + reviewer * debate * (members - 1n));
    expect(debateOf(shares, [GLM, MIMO, DEEPSEEK])).toBe((authored + judge + reviewer) * debate * members);
  });

  // V4 start step, Task 54e (the owner's answer of 5 Nov, "One per path"): a paid path debate's investigations are one per path at
  // least, and every one of them is priced in full on each gate (any member may take one).
  it("Task 54e: Plus, 3 paths prices 3 investigations, each in full on every gate; Free, 3 paths, the cap of 2", () => {
    const plus3 = pathBasis("plus", 3, "MENU");
    const roles = expectedCallsByRoleFromBasis(plus3);
    expect(roles.REVIEWER - (plus3.call_sites as { reviewer: number }).reviewer).toBe(3);
    const free3 = pathBasis("free", 3, "MENU");
    expect(expectedCallsByRoleFromBasis(free3).REVIEWER - (free3.call_sites as { reviewer: number }).reviewer).toBe(2);
    const { denominator, shares } = sharesOf(plus3);
    const members = 4n;
    const debate = denominator / members; // PER_STEP: one call per site
    const investigations = 3n;
    const comparingJudges = 3n; // min(the row's 3 judges, 4 makers)
    const authored = BigInt(roles.POSITION + roles.SUPPORT_ATTACK);
    // The Anthropic gate (Haiku alone): the authored sites, a third of the grading, the others' reviews, then its one judge seat
    // and every investigation in full.
    expect(debateOf(shares, [HAIKU])).toBe(authored * debate * members
      + ceilDiv((BigInt(roles.JUDGE) - comparingJudges) * debate * members, 3n)
      + (BigInt(roles.REVIEWER) - investigations) * debate * (members - 1n)
      + (1n + investigations) * debate * members);
  });

  it("the outcomes are the debate's own calls: one per site, each with its unbilled retry", () => {
    const basis = pathBasis("plus", 5, "MENU");
    const roles = expectedCallsByRoleFromBasis(basis);
    const calls = previewExpectedCalls({ basis, panel: PANEL, roleProviderRefs: [], storyRounds: STORY_ROUNDS, maxCooldownHoldsPerRun: 2 });
    const split = Object.values(roles).reduce((sum, value) => sum + value, 0);
    expect(calls.debate).toBe(split + admittedShapeV2Of(basis)!.counts.pathOutcomeSites);
    expect(calls.unbilledRetries).toBe(calls.debate);
  });
});

describe("the main answer, the story and every path's answer so far sit on the fixed final seats", () => {
  it("the answer is written on Haiku and checked on GLM whatever the register's roles, rotated or not", () => {
    for (const rotated of [false, true]) {
      const { denominator, shares } = sharesOf(pathBasis("plus", 5, "MENU"), { rotated });
      const sites = expectedCallsByRoleFromBasis(pathBasis("plus", 5, "MENU"));
      expect(ofType(shares, "ANSWER_WRITER"), `rotated ${String(rotated)}`)
        .toEqual([{ model: PREVIEW_V2_FINAL_SEATS.writer, type: "ANSWER_WRITER", numerator: BigInt(sites.ANSWER_WRITER) * denominator }]);
      expect(ofType(shares, "ANSWER_CHECKER"), `rotated ${String(rotated)}`)
        .toEqual([{ model: PREVIEW_V2_FINAL_SEATS.checker, type: "ANSWER_CHECKER", numerator: BigInt(sites.ANSWER_CHECKER) * denominator }]);
    }
    expect(PREVIEW_V2_FINAL_SEATS).toEqual({ writer: HAIKU, checker: GLM });
  });

  it("the first story loop on the seats; engine 2's second loop on each gate's dearest member, so on both gates", () => {
    for (const rotated of [false, true]) {
      const { denominator, shares } = sharesOf(pathBasis("plus", 5, "MENU"), { rotated });
      const rounds = BigInt(STORY_ROUNDS) * denominator;
      const story = (type: PreviewCallShare["type"], first: string) => [{ model: first, type, numerator: rounds },
        { model: MIMO, type, numerator: rounds }, { model: HAIKU, type, numerator: rounds }];
      expect(ofType(shares, "STORYTELLER")).toEqual(story("STORYTELLER", HAIKU));
      expect(ofType(shares, "STORYTELLER_RETRY")).toEqual(story("STORYTELLER_RETRY", HAIKU));
      expect(ofType(shares, "STORY_CHECKER")).toEqual(story("STORY_CHECKER", GLM));
      expect(ofType(shares, "STORY_CHECKER_RETRY")).toEqual(story("STORY_CHECKER_RETRY", GLM));
    }
    // Without engine 2 there is no backup storyteller: the seats' loop alone.
    const plain = sharesOf(pathBasis("plus", 5, "MENU", { engine: false }));
    expect(ofType(plain.shares, "STORYTELLER")).toEqual([{ model: HAIKU, type: "STORYTELLER", numerator: BigInt(STORY_ROUNDS) * plain.denominator }]);
    expect(ofType(plain.shares, "STORY_CHECKER")).toEqual([{ model: GLM, type: "STORY_CHECKER", numerator: BigInt(STORY_ROUNDS) * plain.denominator }]);
  });

  it("Plus, 5 paths: 20 outcome sites, 10 written on Haiku and 10 checked on GLM, each with its unbilled retry", () => {
    const basis = pathBasis("plus", 5, "RUN_BUILT");
    expect(admittedShapeV2Of(basis)!.counts.pathOutcomeSites).toBe(20);
    const { denominator, shares } = sharesOf(basis);
    expect(ofType(shares, "PATH_OUTCOME_WRITER")).toEqual([{ model: HAIKU, type: "PATH_OUTCOME_WRITER", numerator: 10n * denominator }]);
    expect(ofType(shares, "PATH_OUTCOME_CHECKER")).toEqual([{ model: GLM, type: "PATH_OUTCOME_CHECKER", numerator: 10n * denominator }]);
    for (const [type, model] of [["PATH_OUTCOME_WRITER", HAIKU], ["PATH_OUTCOME_CHECKER", GLM]] as const) {
      const at = shares.findIndex((share) => share.type === type);
      expect(shares[at + 1]).toEqual({ model, type: "UNBILLED_RETRY", numerator: 10n * denominator });
    }
  });
});

describe("the run's final-writer terms and output tokens come from its own receipt", () => {
  it("a paid path debate prices its final writers as paid, a Free one as free; a v1 receipt keeps R22.1's terms", () => {
    expect(previewFinalWriterPricingOf(pathBasis("plus", 5, "MENU"))).toEqual({ plan: "paid" });
    expect(previewFinalWriterPricingOf(pathBasis("free", 3, "MENU"))).toEqual({ plan: "free" });
    expect(previewFinalWriterPricingOf(r22Basis())).toBeNull();
    expect(previewFinalWriterPricingOf(legacy)).toBeNull();
  });

  it("each path's answer so far asks 8,192 on the preview (writer and checker), its body at the end-of-debate line", () => {
    const outputs = previewOutputTokensForBasis(OUTPUT, pathBasis("plus", 5, "MENU"));
    expect(outputs).toMatchObject({ pathOutcomeWriter: 8192, pathOutcomeChecker: 8192 });
    expect(previewOutputTokensForBasis(OUTPUT, r22Basis())).not.toHaveProperty("pathOutcomeWriter");
    expect(previewOutputTokensForBasis(OUTPUT, legacy)).toBe(OUTPUT);
    const pricer = realisticWorstCasePricer(outputs, "high", { plan: "paid" });
    expect(pricer(row(HAIKU), "PATH_OUTCOME_WRITER")).toBe(previewCallNanoUsd(row(HAIKU), PREVIEW_V2_FINAL_WRITER_INPUT_TOKENS, 8192));
    expect(pricer(row(GLM), "PATH_OUTCOME_CHECKER")).toBe(previewCallNanoUsd(row(GLM), PREVIEW_V2_FINAL_WRITER_INPUT_TOKENS, 8192));
    expect([pricer(row(HAIKU), "PATH_OUTCOME_WRITER"), pricer(row(GLM), "PATH_OUTCOME_CHECKER")]).toEqual([10_694_400n, 13_993_600n]);
  });
});

describe("the web part of a path debate is read from its receipt (version 2)", () => {
  it("PATHS, 5 paths on a Quick look: 5 packs, each path's arguing reads all 5, 20 searches", () => {
    const web = previewWebSitesOf(pathBasis("plus", 5, "MENU", { web: webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 5, origin: "START" }) }))!;
    expect([web.kind, web.packs, web.packReadsPerCall, web.searches]).toEqual(["PATHS", 5, 5, 20]);
    expect(previewWebSitesOf(r22Basis(webSitesOf({ kind: "START", depth: "QUICK", paths: 3 })))).toMatchObject({ kind: "START", packs: 3 });
    expect(previewWebSitesOf(pathBasis("plus", 5, "MENU"))).toBeNull();
  });

  it("the estimate adds the web part on each gate it uses", () => {
    const needs = (basis: Readonly<Record<string, unknown>>) => estimatePreviewGateNeeds({ roleModels: ROLES, roleProviderRefs: [],
      storyRounds: STORY_ROUNDS, callOutputTokens: OUTPUT, maxCooldownHoldsPerRun: 2, basis, panel: PANEL });
    const without = needs(pathBasis("plus", 5, "MENU"));
    const withWeb = needs(pathBasis("plus", 5, "MENU", { web: webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 5, origin: "START" }) }));
    for (const gate of ["deepinfra", "anthropic"] as const) {
      expect(withWeb.find((need) => need.gate === gate)!.callsNanoUsd).toBeGreaterThan(without.find((need) => need.gate === gate)!.callsNanoUsd);
    }
  });
});

describe("admission prices a path debate, new or unfinished, on its own terms", () => {
  const remaining = (remainingNanoUsd: bigint): PreviewGateRemaining => Object.freeze({ state: "active", windowOpen: true, remainingNanoUsd,
    remainingCalls: 10_000_000, maxConcurrentCalls: 0, largestReservationNanoUsd: 0n, enabledModels: [GLM, MIMO, DEEPSEEK, HAIKU] });
  const gate = (unfinished: readonly PreviewUnfinishedRun[], money = 0n): PreviewBudgetGateSettings => Object.freeze({
    remaining: { deepinfra: async () => remaining(money), anthropic: async () => remaining(money) }, roleModels: ROLES, roleProviderRefs: [],
    storyRounds: STORY_ROUNDS, callOutputTokens: OUTPUT, askProbeModelIds: [], maxCooldownHoldsPerRun: 2,
    readUnfinishedRuns: async () => unfinished,
    termsForVersion: async () => Object.freeze({ roleModels: ROLES, roleProviderRefs: [], storyRounds: STORY_ROUNDS, callOutputTokens: OUTPUT,
      maxCooldownHoldsPerRun: 2 })
  });
  /** The DeepInfra gate refuses (no money left); its refusal names what the unfinished debates hold and what the new one needs. */
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
  /** One debate's need on the DeepInfra gate at the given final-writer terms. */
  const deepinfraAt = (basis: Readonly<Record<string, unknown>>, finalWriters: Readonly<{ plan: "free" | "paid" }> | null): bigint =>
    estimatePreviewGateNeeds({ roleModels: ROLES, roleProviderRefs: [], storyRounds: STORY_ROUNDS, callOutputTokens: OUTPUT,
      maxCooldownHoldsPerRun: 2, basis, panel: PANEL,
      pricer: realisticWorstCasePricer(previewOutputTokensForBasis(OUTPUT, basis), "high", finalWriters) })
      .find((need) => need.gate === "deepinfra")!.callsNanoUsd;
  const v2 = pathBasis("plus", 5, "MENU", { web: webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 5, origin: "START" }) });

  it("a new path debate is admitted when the gates can carry it (no bridge refusal)", async () => {
    await expect(assertPreviewBudgetAdmits(gate([], 10n ** 15n), { basis: v2, panel: PANEL })).resolves.toBeUndefined();
  });

  it("an unfinished path debate is held at its own final-writer terms, beside a new debate of R22's shape", async () => {
    const run: PreviewUnfinishedRun = { basis: v2, panel: PANEL, phase: "DEBATE", registerVersion: 31 };
    const same = await figures(gate([run]), v2);
    expect(same.held).toBe(same.needs);
    expect(same.held).toBe(deepinfraAt(v2, { plan: "paid" }));
    expect(same.held).not.toBe(deepinfraAt(v2, null));
    const beside = await figures(gate([run]), r22Basis());
    expect(beside.held).toBe(deepinfraAt(v2, { plan: "paid" }));
    expect(beside.needs).toBe(deepinfraAt(r22Basis(), null));
  });

  it("both seats are on the gates' model lists, even when no panel member sits on the Anthropic gate", () => {
    const panel = PANEL.slice(0, 2);
    const needs = estimatePreviewGateNeeds({ roleModels: ROLES, roleProviderRefs: [], storyRounds: STORY_ROUNDS, callOutputTokens: OUTPUT,
      maxCooldownHoldsPerRun: 2, basis: pathBasis("plus", 3, "MENU", { panel }), panel, rotated: true });
    expect(needs.map((need) => need.gate)).toEqual(["deepinfra", "anthropic"]);
    expect(needs.find((need) => need.gate === "deepinfra")!.modelIds).toContain(GLM);
    expect(needs.find((need) => need.gate === "anthropic")!.modelIds).toEqual([HAIKU]);
    expect(needs.find((need) => need.gate === "anthropic")!.callsNanoUsd).toBeGreaterThan(0n);
  });

  it("an unfinished path debate with no panel member on the Anthropic gate is still held there, for its seats", () => {
    const panel = PANEL.slice(0, 2);
    const basis = pathBasis("plus", 3, "MENU", { panel });
    const settings = Object.freeze({ roleModels: ROLES, roleProviderRefs: [], storyRounds: STORY_ROUNDS, callOutputTokens: OUTPUT,
      maxCooldownHoldsPerRun: 2 });
    // Still debating: held at exactly what it needed when it was new, on both gates.
    const debating = estimateUnfinishedRunHolds({ basis, panel, phase: "DEBATE", registerVersion: 31 }, settings);
    expect(debating.map((hold) => hold.gate)).toEqual(["deepinfra", "anthropic"]);
    expect(debating).toEqual(estimatePreviewGateNeeds({ ...settings, basis, panel }));
    // Only writing its story: the story's first loop is told on Haiku, so the Anthropic gate still holds it.
    const telling = estimateUnfinishedRunHolds({ basis, panel, phase: "STORY", registerVersion: 31 }, settings);
    const anthropic = telling.find((hold) => hold.gate === "anthropic");
    expect(anthropic?.modelIds).toEqual([HAIKU]);
    expect(anthropic!.callsNanoUsd).toBeGreaterThan(0n);
  });

  it("Plus, 3 paths needs less of the Anthropic gate than R22's 3-answer receipt for the same question, rotated or not", () => {
    const anthropicOf = (basis: Readonly<Record<string, unknown>>, roles: PreviewRoleModels, rotated: boolean): bigint =>
      estimatePreviewGateNeeds({ roleModels: roles, roleProviderRefs: [], storyRounds: STORY_ROUNDS, callOutputTokens: OUTPUT,
        maxCooldownHoldsPerRun: 2, basis, panel: PANEL, ...(rotated ? { rotated: true } : {}) })
        .find((need) => need.gate === "anthropic")!.callsNanoUsd;
    // R22's register put the answer and the story on Haiku, checked on GLM: the same models as the v2 seats.
    const r22Roles: PreviewRoleModels = Object.freeze({ answerWriter: HAIKU, answerChecker: GLM, storyteller: HAIKU, storyChecker: GLM });
    const v2Plus3 = pathBasis("plus", 3, "MENU", { web: webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 3, origin: "START" }) });
    const r22Plus3 = r22Basis(webSitesOf({ kind: "START", depth: "QUICK", paths: 3 }));
    for (const rotated of [false, true]) {
      expect(anthropicOf(v2Plus3, r22Roles, rotated), `rotated ${String(rotated)}`).toBeLessThan(anthropicOf(r22Plus3, r22Roles, rotated));
    }
  });
});
