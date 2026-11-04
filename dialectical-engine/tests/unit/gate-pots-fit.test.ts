/**
 * V4 start step, Task 41 (spec 2026-11-03 §5 "Money", its "Before upload" line): one debate must fit each spending gate's
 * daily pot. The pure half of the guard: which choices are checked (every switched-on plan at its widest How wide, both
 * question depths and one dig), and what comes out of weighing each case's needs against each gate's `/remaining` answer
 * with its pot: a refusal code when one debate does not fit the pot, when the gate reports no pot or did not answer; a
 * note (never a failure) when the pot fits but today's money is already spent. Task 42 wires it into check-version: each
 * case's needs are the estimate of the basis the checked version mints for it, and each needed gate is asked once, with
 * its pot. Every pot and price here is made up.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { parsePreviewEnvironmentConfig, type PreviewGateRemaining, type PreviewGateSettings } from "@debateai/providers";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, debateShapeStartStepStartValues, engineVersionPolicyStartValues,
  lengthGuidancePolicyStartValues, normaliseDepthParamsForShape, type DebateShapePolicy
} from "@debateai/register";
import type { AdmissionSiteContext, AdmissionVersionSettings } from "../../apps/api/src/admission-settings.js";
import {
  estimatePreviewGateNeeds, previewGateEstimateNanoUsd, previewWebSitesOf, type PreviewBudgetGateSettings, type PreviewGateNeed,
  type PreviewPanelMember
} from "../../apps/api/src/preview-budget-estimate.js";
import {
  GATE_POT_CODES, checkGatePotsFitOneDebate, gatePotCaseNeeds, gatePotCases, gatePotChoice, readGatePotFindings,
  type ApiCheckEnvironment, type GatePotCase, type GatePotCaseNeeds
} from "../../apps/api/src/settings-check.js";
import { startPreviewGateStubs, type PreviewGateStubs } from "../support/preview-gate-stubs.js";

const ON: DebateShapePolicy = Object.freeze({ ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() });
const OFF: DebateShapePolicy = debateShapePolicyStartValues();
// Made-up pots: 0.05, 2.5 and 7.25 dollars, as exact nano-USD.
const POT_SMALL = 50_000_000n;
const POT_MID = 2_500_000_000n;
const POT_BIG = 7_250_000_000n;
const CODE = /^GATE_POT_[A-Z_]+:(deepinfra|anthropic|perplexity)(:[a-z0-9]+)*$/u;

/** A gate's answer with the pot asked: today's money left starts at the whole pot; each slot holds a made-up 0.1. */
const withPot = (pot: bigint, change: Partial<PreviewGateRemaining> = {}): PreviewGateRemaining => Object.freeze({
  state: "active", windowOpen: true, remainingNanoUsd: pot, remainingCalls: 600, maxConcurrentCalls: 2,
  largestReservationNanoUsd: 100_000_000n, enabledModels: ["made-up-model"], dailyPotNanoUsd: pot, ...change });
/** The same answer from a gate whose code does not report the pot. */
const noPot = (): PreviewGateRemaining => {
  const { dailyPotNanoUsd: _pot, ...rest } = withPot(POT_BIG);
  return Object.freeze(rest);
};
const need = (gate: PreviewGateNeed["gate"], callsNanoUsd: bigint): PreviewGateNeed => Object.freeze({
  gate, modelIds: Object.freeze(["made-up-model"]), expectedCalls: 10, callsWithMargin: 12, callsNanoUsd });
const PLUS_D2: GatePotCase = Object.freeze({ plan: "plus", kind: "QUESTION", depth: 2, paths: 7, web: true });
const FREE_D1: GatePotCase = Object.freeze({ plan: "free", kind: "QUESTION", depth: 1, paths: 3, web: false });
const caseOf = (choice: GatePotCase, needs: readonly PreviewGateNeed[], searchNanoUsd: bigint | null = null): GatePotCaseNeeds =>
  Object.freeze({ choice, needs: Object.freeze([...needs]), searchNanoUsd });
const PLANS = ["pro", "max", "premium"] as const;

describe("the codes", () => {
  it("are the four the release guide's hints name", () => {
    expect(GATE_POT_CODES).toEqual({ BELOW: "GATE_POT_BELOW_ONE_DEBATE", SPENT_TODAY: "GATE_POT_SPENT_TODAY",
      UNREPORTED: "GATE_POT_UNREPORTED", UNANSWERED: "GATE_POT_UNANSWERED" });
    expect(Object.isFrozen(GATE_POT_CODES)).toBe(true);
  });
});

describe("the choices the guard checks", () => {
  it("checks every switched-on plan at its widest How wide: both question depths and one dig, web on paid plans", () => {
    const cases = gatePotCases(ON, { searchGate: true });
    expect(cases).toHaveLength(15);
    expect(cases.map(gatePotChoice).slice(0, 6)).toEqual(["free:question:d1:p3", "free:question:d2:p3", "free:dig:d1:p3",
      "plus:question:d1:p7:web", "plus:question:d2:p7:web", "plus:dig:d2:p7:web"]);
    expect(cases.map(gatePotChoice).slice(6)).toEqual(PLANS.flatMap((plan) =>
      [`${plan}:question:d1:p7:web`, `${plan}:question:d2:p7:web`, `${plan}:dig:d2:p7:web`]));
    expect(cases[0]).toEqual({ plan: "free", kind: "QUESTION", depth: 1, paths: 3, web: false });
    expect(cases[5]).toEqual({ plan: "plus", kind: "DIG", depth: 2, paths: 7, web: true });
  });

  it("has no web search without a search gate", () => {
    const cases = gatePotCases(ON, { searchGate: false });
    expect(cases).toHaveLength(15);
    expect(cases.every((c) => !c.web)).toBe(true);
    expect(cases.map(gatePotChoice).filter((choice) => choice.includes("web"))).toEqual([]);
    expect(gatePotChoice(cases[4]!)).toBe("plus:question:d2:p7");
  });

  it("checks nothing without the switch, or on a row switched off", () => {
    expect(gatePotCases(OFF, { searchGate: true })).toEqual([]);
    expect(gatePotCases({ ...ON, enabled: false }, { searchGate: true })).toEqual([]);
  });

  it("checks Free at 3 paths at most whatever its row says, and a paid plan at the widest of its own choices", () => {
    const widths = ON.startStep!.widths;
    const policy: DebateShapePolicy = { ...ON, startStep: { widths: { ...widths,
      free: { options: [3, 5, 7], default: 5 }, plus: { options: [3, 5], default: 3 } } } };
    const choices = gatePotCases(policy, { searchGate: true }).map(gatePotChoice);
    expect(choices.slice(0, 6)).toEqual(["free:question:d1:p3", "free:question:d2:p3", "free:dig:d1:p3",
      "plus:question:d1:p5:web", "plus:question:d2:p5:web", "plus:dig:d2:p5:web"]);
  });
});

describe("one debate against each gate's pot", () => {
  it("raises nothing when one debate fits every pot and today's money", () => {
    expect(checkGatePotsFitOneDebate({
      cases: [caseOf(PLUS_D2, [need("deepinfra", 1_000_000_000n), need("anthropic", 2_000_000_000n)])],
      remaining: { deepinfra: withPot(POT_BIG), anthropic: withPot(POT_MID) }
    })).toEqual({ refusals: [], warnings: [] });
  });

  it("weighs one debate as the ask's own estimate: the calls plus what the gate holds for calls in flight", () => {
    // 2.3 of calls + 2 slots x 0.1 = 2.5: exactly the pot, so it fits; 2.4 of calls alone fits, with the holds it does not.
    const at = (callsNanoUsd: bigint, change: Partial<PreviewGateRemaining> = {}) => checkGatePotsFitOneDebate({
      cases: [caseOf(PLUS_D2, [need("anthropic", callsNanoUsd)])], remaining: { anthropic: withPot(POT_MID, change) } });
    expect(previewGateEstimateNanoUsd(need("anthropic", 2_300_000_000n), withPot(POT_MID))).toBe(POT_MID);
    expect(at(2_300_000_000n)).toEqual({ refusals: [], warnings: [] });
    expect(at(2_400_000_000n)).toEqual({ refusals: ["GATE_POT_BELOW_ONE_DEBATE:anthropic:plus:question:d2:p7:web"], warnings: [] });
    // A final-writer slot holds its own worst case (made-up 0.45): 2.0 + 0.1 + 0.45 = 2.55 is above the pot.
    expect(at(2_000_000_000n)).toEqual({ refusals: [], warnings: [] });
    expect(at(2_000_000_000n, { largestFinalWriterReservationNanoUsd: 450_000_000n, finalWriterMaxInFlight: 1 }))
      .toEqual({ refusals: ["GATE_POT_BELOW_ONE_DEBATE:anthropic:plus:question:d2:p7:web"], warnings: [] });
  });

  it("names each choice that does not fit, on its own gate only", () => {
    const FREE_DIG: GatePotCase = Object.freeze({ plan: "free", kind: "DIG", depth: 1, paths: 3, web: false });
    expect(checkGatePotsFitOneDebate({
      cases: [caseOf(FREE_D1, [need("deepinfra", 3_000_000_000n)]), caseOf(FREE_DIG, [need("deepinfra", 2_000_000_000n)]),
        caseOf(PLUS_D2, [need("deepinfra", 1_000_000_000n), need("anthropic", 1_000_000_000n)])],
      remaining: { deepinfra: withPot(POT_MID), anthropic: withPot(POT_MID) }
    })).toEqual({ refusals: ["GATE_POT_BELOW_ONE_DEBATE:deepinfra:free:question:d1:p3"], warnings: [] });
  });

  it("notes once per gate, never as a failure, when the pot fits but today's money is already spent", () => {
    const FREE_D2: GatePotCase = Object.freeze({ ...FREE_D1, depth: 2 });
    expect(checkGatePotsFitOneDebate({
      cases: [caseOf(FREE_D1, [need("deepinfra", 1_000_000_000n)]), caseOf(FREE_D2, [need("deepinfra", 1_500_000_000n)])],
      remaining: { deepinfra: withPot(POT_BIG, { remainingNanoUsd: POT_SMALL }) }
    })).toEqual({ refusals: [], warnings: ["GATE_POT_SPENT_TODAY:deepinfra"] });
  });

  it("refuses a gate that reports no pot, and one that did not answer or was never asked", () => {
    const cases = [caseOf(PLUS_D2, [need("deepinfra", 1_000_000_000n), need("anthropic", 1_000_000_000n)])];
    expect(checkGatePotsFitOneDebate({ cases, remaining: { deepinfra: null, anthropic: noPot() } }))
      .toEqual({ refusals: ["GATE_POT_UNANSWERED:deepinfra", "GATE_POT_UNREPORTED:anthropic"], warnings: [] });
    expect(checkGatePotsFitOneDebate({ cases, remaining: {} }))
      .toEqual({ refusals: ["GATE_POT_UNANSWERED:anthropic", "GATE_POT_UNANSWERED:deepinfra"], warnings: [] });
  });

  it("never names a gate no case needs", () => {
    expect(checkGatePotsFitOneDebate({
      cases: [caseOf(FREE_D1, [need("deepinfra", 1_000_000_000n)])],
      remaining: { deepinfra: withPot(POT_BIG), anthropic: null, perplexity: noPot() }
    })).toEqual({ refusals: [], warnings: [] });
  });

  it("weighs the search gate on the searches' money, when the case searches", () => {
    // Made-up searches: 56 at 0.001 = 0.056, above the 0.05 pot; one slot holding nothing.
    const search = withPot(POT_SMALL, { maxConcurrentCalls: 1, largestReservationNanoUsd: 0n });
    const models = [need("deepinfra", 1_000_000_000n), need("anthropic", 1_000_000_000n)];
    const fine = { deepinfra: withPot(POT_BIG), anthropic: withPot(POT_BIG) };
    expect(checkGatePotsFitOneDebate({ cases: [caseOf(PLUS_D2, models, 56_000_000n)], remaining: { ...fine, perplexity: search } }))
      .toEqual({ refusals: ["GATE_POT_BELOW_ONE_DEBATE:perplexity:plus:question:d2:p7:web"], warnings: [] });
    expect(checkGatePotsFitOneDebate({ cases: [caseOf(PLUS_D2, models, 40_000_000n)], remaining: { ...fine, perplexity: search } }))
      .toEqual({ refusals: [], warnings: [] });
    expect(checkGatePotsFitOneDebate({ cases: [caseOf(PLUS_D2, models, 40_000_000n)], remaining: fine }))
      .toEqual({ refusals: ["GATE_POT_UNANSWERED:perplexity"], warnings: [] });
    expect(checkGatePotsFitOneDebate({ cases: [caseOf(PLUS_D2, models, null)], remaining: { ...fine, perplexity: null } }))
      .toEqual({ refusals: [], warnings: [] });
  });

  it("lists every code sorted and once, each a gate and a choice of lowercase parts", () => {
    const cases = gatePotCases(ON, { searchGate: true }).map((choice) => caseOf(choice,
      [need("deepinfra", 3_000_000_000n), need("anthropic", 3_000_000_000n)], choice.web ? 56_000_000n : null));
    const findings = checkGatePotsFitOneDebate({ cases: [...cases, ...cases],
      remaining: { deepinfra: withPot(POT_MID), anthropic: withPot(POT_MID), perplexity: withPot(POT_SMALL) } });
    // 15 choices on each model gate, 12 searching choices on the search gate.
    expect(findings.refusals).toHaveLength(15 + 15 + 12);
    expect(findings.refusals).toEqual([...new Set(findings.refusals)].sort());
    expect(findings.warnings).toEqual([]);
    for (const code of findings.refusals) expect(code).toMatch(CODE);
    const all = checkGatePotsFitOneDebate({ cases, remaining: { deepinfra: null, anthropic: noPot(),
      perplexity: withPot(POT_BIG, { remainingNanoUsd: 0n }) } });
    for (const code of [...all.refusals, ...all.warnings]) expect(code).toMatch(CODE);
    expect(all).toEqual({ refusals: ["GATE_POT_UNANSWERED:deepinfra", "GATE_POT_UNREPORTED:anthropic"],
      warnings: ["GATE_POT_SPENT_TODAY:perplexity"] });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Task 42: the guard in check-version. Each case is priced as the checked version would admit it, and each gate a case
// needs is asked once, with its pot. The structure terms are the code's own kind of numbers; the pots are made up.
// ---------------------------------------------------------------------------------------------------------------------

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const HAIKU = "claude-haiku-5-5";
const FREE_ROSTER = Object.freeze([GLM, DEEPSEEK]);
const PREMIUM_ROSTER = Object.freeze([GLM, DEEPSEEK, HAIKU]);
const LINE_UP = Object.freeze({ free_model_ids: FREE_ROSTER, premium_model_ids: PREMIUM_ROSTER });
const SOCKETS = "/run/debateai-v3-preview";
const GATE: PreviewGateSettings = parsePreviewEnvironmentConfig(JSON.stringify({ budget_socket: `${SOCKETS}/deepinfra-budget-v3.sock`,
  deployment: "v3-preview", requested_thinking_level: "high", scope_id: "made-up-scope",
  anthropic_budget_socket: `${SOCKETS}/anthropic-budget-v1.sock`, perplexity_budget_socket: `${SOCKETS}/perplexity-budget-v1.sock` }))!.gate;
const environmentWith = (gate: PreviewGateSettings | undefined): ApiCheckEnvironment => Object.freeze({
  REGISTER_VERSION: 17, RELEASE_KEY: "r17-" + "0123456789ab", DEPLOYMENT_MODE: "hosted", PREVIEW_GATE_SETTINGS: gate, PREVIEW_ENV_LINE_UP: null });
const TARGETS = Object.freeze([GLM, DEEPSEEK, HAIKU].map((model, index) => Object.freeze({ providerRef: `preview:made-up-${String(index)}`, model })));
const siteWith = (gate: PreviewGateSettings | undefined): AdmissionSiteContext =>
  ({ preview: gate === undefined ? undefined : { gate, envLineUp: null }, declaredProviderTargets: TARGETS }) as unknown as AdmissionSiteContext;
const SITE = siteWith(GATE);
/** The plan's roster as admission's panel: each model on its declared target. */
const panelOf = (roster: readonly string[]): readonly PreviewPanelMember[] =>
  roster.map((model) => ({ provider_ref: TARGETS.find((target) => target.model === model)!.providerRef, model_id: model }));
/** The version's estimate terms (its gate settings); no gate is asked through them here. */
const GATE_TERMS = Object.freeze({
  remaining: Object.freeze({}),
  roleModels: Object.freeze({ answerWriter: GLM, answerChecker: DEEPSEEK, storyteller: GLM, storyChecker: DEEPSEEK }),
  roleProviderRefs: Object.freeze([]), storyRounds: 2, askProbeModelIds: Object.freeze([]), structureRepairModel: null,
  callOutputTokens: Object.freeze({ debate: 8192, storyteller: 32_768, storytellerRetry: 65_536, storyChecker: 8192 }),
  maxCooldownHoldsPerRun: 2, readUnfinishedRuns: async () => [],
  termsForVersion: async () => { throw new TypeError("PREVIEW_VERSION_TERMS_UNAVAILABLE"); }
}) as unknown as PreviewBudgetGateSettings;
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
type MintInput = Parameters<AdmissionVersionSettings["resolveEnvelopeBasis"]>[0];

/** A loaded version (the members the guard reads), switched on, engine 2 and length in force; it mints as the loader does. */
function loadedVersion(change: Readonly<Record<string, unknown>> = {}) {
  const minted: Readonly<Record<string, unknown>>[] = [];
  const resolveEnvelopeBasis = vi.fn(async (input: MintInput) => {
    const basis = computeStructuralCeilingBasis({ ...TERMS, panelSize: input.panelSize, depth: Number(input.depthParams.depth),
      backupSequencesProvisioned: input.backupSequencesProvisioned,
      ...(input.shape === null ? {} : { shape: input.shape }), ...(input.shapeV2 == null ? {} : { shapeV2: input.shapeV2 }),
      ...(input.length === null ? {} : { length: input.length }), ...(input.engine === null ? {} : { engine: input.engine }),
      ...(input.web === null ? {} : { web: input.web }) });
    minted.push(basis);
    return basis;
  });
  const settings = Object.freeze({ registerVersion: 18, debateShapePolicy: ON, lengthGuidancePolicy: lengthGuidancePolicyStartValues(),
    engineVersionPolicy: engineVersionPolicyStartValues(), roleRotation: null, previewBudgetGate: GATE_TERMS,
    modelPicker: { scorecard: { state: "ABSENT" } }, resolveEnvelopeBasis, ...change }) as unknown as AdmissionVersionSettings;
  return { settings, minted, resolveEnvelopeBasis };
}
const askedSettings = (depth: 1 | 2, plan: GatePotCase["plan"]) => normaliseDepthParamsForShape(
  { depth, depthMode: "adaptive", scrutiny: depth === 2 ? "deep" : "standard", answerLength: "detailed" }, ON, plan, lengthGuidancePolicyStartValues());
// A made-up pot no case comes near: 999 dollars.
const POT_HUGE = 999_000_000_000n;

describe("Task 42: each case priced as the checked version would admit it", () => {
  it("a question at the widest: RUN_BUILT, a pack per path; its needs are the estimate of the basis the version mints", async () => {
    const { settings, minted, resolveEnvelopeBasis } = loadedVersion();
    const choice: GatePotCase = Object.freeze({ plan: "plus", kind: "QUESTION", depth: 2, paths: 7, web: true });
    const found = await gatePotCaseNeeds({ settings, site: SITE, lineUp: LINE_UP, choice });
    expect(resolveEnvelopeBasis).toHaveBeenCalledTimes(1);
    const input = resolveEnvelopeBasis.mock.calls[0]![0];
    expect(input.depthParams).toEqual(askedSettings(2, "plus"));
    expect(input).toMatchObject({ panelSize: 3, backupSequencesProvisioned: 0, shape: null,
      shapeV2: { plan: "plus", paths: 7, pathsSource: "RUN_BUILT" }, web: { kind: "PATHS", depth: "THOROUGH", origin: "START" } });
    expect(input.engine).not.toBeNull();
    const basis = minted[0]!;
    // 7 paths x 8 searches (a Thorough look) x 0.001 a search.
    expect(previewWebSitesOf(basis)).toMatchObject({ kind: "PATHS", searches: 56 });
    expect(found).toEqual({ choice, needs: estimatePreviewGateNeeds({ ...GATE_TERMS, basis, panel: panelOf(PREMIUM_ROSTER) }),
      searchNanoUsd: 56_000_000n });
    expect(found.needs.map((need) => need.gate).sort()).toEqual(["anthropic", "deepinfra"]);
  });

  it("a dig: its picks at the widest, a thorough look from a dig's origin; Free: its own roster and no web search", async () => {
    const dig = loadedVersion();
    const digChoice: GatePotCase = Object.freeze({ plan: "plus", kind: "DIG", depth: 2, paths: 7, web: true });
    const digFound = await gatePotCaseNeeds({ settings: dig.settings, site: SITE, lineUp: LINE_UP, choice: digChoice });
    expect(dig.resolveEnvelopeBasis.mock.calls[0]![0]).toMatchObject({ shapeV2: { plan: "plus", paths: 7, pathsSource: "DIG_PICKS" },
      web: { kind: "PATHS", depth: "THOROUGH", origin: "DIG" } });
    expect(digFound).toEqual({ choice: digChoice, needs: estimatePreviewGateNeeds({ ...GATE_TERMS, basis: dig.minted[0]!,
      panel: panelOf(PREMIUM_ROSTER) }), searchNanoUsd: 56_000_000n });
    const free = loadedVersion();
    const freeChoice: GatePotCase = Object.freeze({ plan: "free", kind: "QUESTION", depth: 2, paths: 3, web: false });
    const freeFound = await gatePotCaseNeeds({ settings: free.settings, site: SITE, lineUp: LINE_UP, choice: freeChoice });
    const input = free.resolveEnvelopeBasis.mock.calls[0]![0];
    expect(input.depthParams).toEqual(askedSettings(2, "free"));
    expect(input).toMatchObject({ panelSize: 2, shape: null, shapeV2: { plan: "free", paths: 3, pathsSource: "RUN_BUILT" }, web: null });
    expect(freeFound).toEqual({ choice: freeChoice, needs: estimatePreviewGateNeeds({ ...GATE_TERMS, basis: free.minted[0]!,
      panel: panelOf(FREE_ROSTER) }), searchNanoUsd: null });
  });

  it("with role rotation on, priced as admission prices a rotated debate", async () => {
    const { settings, minted } = loadedVersion({ roleRotation: { readCounts: async () => { throw new Error("never read"); } } });
    const choice: GatePotCase = Object.freeze({ plan: "plus", kind: "QUESTION", depth: 1, paths: 7, web: true });
    const found = await gatePotCaseNeeds({ settings, site: SITE, lineUp: LINE_UP, choice });
    expect(found.needs).toEqual(estimatePreviewGateNeeds({ ...GATE_TERMS, basis: minted[0]!, panel: panelOf(PREMIUM_ROSTER), rotated: true }));
  });
});

describe("Task 42: the guard asks each gate once, with its pot", () => {
  const fits = (change: Partial<PreviewGateRemaining> = {}): PreviewGateRemaining => Object.freeze({
    state: "active", windowOpen: true, remainingNanoUsd: POT_HUGE, remainingCalls: 99_999, maxConcurrentCalls: 2,
    largestReservationNanoUsd: 100_000_000n, enabledModels: [GLM], dailyPotNanoUsd: POT_HUGE, ...change });

  it("asks every gate a case needs exactly once (its socket, the one scope); a refused request is UNANSWERED, never a failure to check", async () => {
    const { settings, minted } = loadedVersion();
    const asked: string[] = [];
    const readRemaining = vi.fn(async (gate: string, socket: string, scopeId: string) => {
      asked.push(`${gate} ${socket} ${scopeId}`);
      if (gate === "perplexity") throw new TypedDomainError("PREVIEW_GATE_UNREACHABLE", "Private preview gate remaining read failed: status 403");
      return fits();
    });
    const findings = await readGatePotFindings({ loaded: settings, site: SITE, lineUp: LINE_UP, environment: environmentWith(GATE), readRemaining });
    expect(findings).toEqual({ refusals: ["GATE_POT_UNANSWERED:perplexity"], warnings: [] });
    expect(asked).toEqual([`deepinfra ${SOCKETS}/deepinfra-budget-v3.sock made-up-scope`, `anthropic ${SOCKETS}/anthropic-budget-v1.sock made-up-scope`,
      `perplexity ${SOCKETS}/perplexity-budget-v1.sock made-up-scope`]);
    // Every switched-on choice was priced once (5 plans x 3 choices).
    expect(minted).toHaveLength(15);
  });

  it("weighs every case against the answers: a small pot names each choice over it on its gate, today's spending is a note", async () => {
    const { settings } = loadedVersion();
    const answers: Readonly<Record<string, PreviewGateRemaining>> = { deepinfra: fits({ remainingNanoUsd: 0n }), anthropic: fits({ dailyPotNanoUsd: POT_SMALL }),
      perplexity: fits() };
    const findings = await readGatePotFindings({ loaded: settings, site: SITE, lineUp: LINE_UP, environment: environmentWith(GATE),
      readRemaining: async (gate) => answers[gate]! });
    expect(findings.warnings).toEqual(["GATE_POT_SPENT_TODAY:deepinfra"]);
    expect(findings.refusals).toContain("GATE_POT_BELOW_ONE_DEBATE:anthropic:plus:question:d2:p7:web");
    expect(findings.refusals).toContain("GATE_POT_BELOW_ONE_DEBATE:anthropic:free:dig:d1:p3");
    expect(findings.refusals.every((code) => code.startsWith("GATE_POT_BELOW_ONE_DEBATE:anthropic:"))).toBe(true);
    expect(findings.refusals).toHaveLength(15);
  });

  it("asks nothing off the preview, without the switch, or without a loaded version", async () => {
    for (const [name, loaded, environment] of [
      ["off the preview", loadedVersion().settings, environmentWith(undefined)],
      ["no shape row in force", loadedVersion({ debateShapePolicy: null }).settings, environmentWith(GATE)],
      ["the switch absent", loadedVersion({ debateShapePolicy: OFF }).settings, environmentWith(GATE)],
      ["no loaded version", undefined, environmentWith(GATE)]
    ] as const) {
      const readRemaining = vi.fn(async () => fits());
      const resolve = (loaded as { resolveEnvelopeBasis?: ReturnType<typeof vi.fn> } | undefined)?.resolveEnvelopeBasis;
      expect(await readGatePotFindings({ loaded, site: SITE, lineUp: LINE_UP, environment, readRemaining }), name)
        .toEqual({ refusals: [], warnings: [] });
      expect(readRemaining, name).not.toHaveBeenCalled();
      if (resolve !== undefined) expect(resolve, name).not.toHaveBeenCalled();
    }
  });

  describe("the default reader, against the gate doubles", () => {
    let gates: PreviewGateStubs | null = null;
    afterEach(async () => { await gates?.close(); gates = null; });
    const figures = (pot: boolean) => ({ usd: "999", calls: 99_999, maxConcurrentCalls: 2, largestReservationUsd: "0.1", ...(pot ? { dailyPotUsd: "999" } : {}) });

    it("asks each gate once with the pot question; a gate whose code does not report its pot is UNREPORTED", async () => {
      gates = await startPreviewGateStubs({ storyDefaultShape: "made-up-shape", remaining: { deepinfra: figures(true), anthropic: figures(true) } });
      // No search gate: no case searches, so only the two model gates are asked.
      const gate: PreviewGateSettings = Object.freeze({ deployment: "v3-preview", requested_thinking_level: "high", scope_id: "made-up-scope",
        budget_socket: gates.sockets.deepinfra, anthropic_budget_socket: gates.sockets.anthropic });
      const { settings } = loadedVersion();
      expect(await readGatePotFindings({ loaded: settings, site: siteWith(gate), lineUp: LINE_UP, environment: environmentWith(gate) }))
        .toEqual({ refusals: [], warnings: [] });
      expect(gates.remainingReads.map((read) => read.provider)).toEqual(["deepinfra", "anthropic"]);
      await gates.close();
      gates = await startPreviewGateStubs({ storyDefaultShape: "made-up-shape", remaining: { deepinfra: figures(true), anthropic: figures(false) } });
      const older: PreviewGateSettings = Object.freeze({ ...gate, budget_socket: gates.sockets.deepinfra, anthropic_budget_socket: gates.sockets.anthropic });
      expect(await readGatePotFindings({ loaded: loadedVersion().settings, site: siteWith(older), lineUp: LINE_UP, environment: environmentWith(older) }))
        .toEqual({ refusals: ["GATE_POT_UNREPORTED:anthropic"], warnings: [] });
    });
  });
});
