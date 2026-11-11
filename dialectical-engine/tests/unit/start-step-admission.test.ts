/**
 * V4 start step, Task 34 (spec 2026-11-03 §4.2, §4.3, §5): the v2 decision and admission. The ONE v2 predicate
 * (`startStepWidthsFor`) answers widths only with the switch on for the plan, engine 2 in force, no VALID scorecard (v2
 * pins backup 0) and a signed-in person; admission then mints shape receipt v2 for a panel of two makers or more (one
 * maker keeps today's receipt), with engine 2's answer check at 0 (the map no longer opens the debate) and a web pack per
 * path on a paid plan that can search. The picker's role split reads a v2 receipt on its own terms: each path's root is a
 * POSITION call, no cross replies, and every path's answer so far is left out of SUPPORT_ATTACK (Task 40 prices those
 * calls on the fixed seats).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateAskAdmission, evaluationOrRefusal, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, debateShapeStartStepStartValues, engineVersionPolicyStartValues,
  lengthGuidancePolicyStartValues, resolveDebateShape, resolveDebateShapeV2, webSitesOf, type DebateShapePolicy, type DebateShapeV2Input
} from "@debateai/register";
import { admissionViewOf, type AdmissionVersionSettings } from "../../apps/api/src/admission-settings.js";
import { admittedShapeOf, admittedShapeV2Of, expectedCallsByRoleFromBasis } from "../../apps/api/src/ask-model-picker.js";
import {
  askShapesForPanel, askStartShapeOf, normaliseAskForDebateShape, startRunBuiltPaths, startStepWidthsFor, type StartStepGate
} from "../../apps/api/src/debate-shape-ask.js";
import { webSitesForAsk } from "../../apps/api/src/engine-ask.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
const member = (providerRef: string, maker: string, modelId: string): DiscoveredPanelMember => Object.freeze({
  provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-11-04T00:00:00.000Z" });
/** The free plan's two local roster models (PLAN_TIER_ROSTERS.free), two makers. */
const PANEL = Object.freeze([member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "Anthropic", "claude-sonnet-5")]);
const ONE_MAKER = Object.freeze([member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "OpenAI", "claude-sonnet-5")]);
/** The switch absent: today's row (R22). */
const POLICY = debateShapePolicyStartValues();
/** The switch on (Task 11): the same row with the start step's widths. */
const POLICY_ON: DebateShapePolicy = { ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() };
const ENGINE = engineVersionPolicyStartValues();
const LENGTH_POLICY = lengthGuidancePolicyStartValues();
const SHAPED_DEPTH = Object.freeze({ depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const);
const ASK: AskRequest = { question_line: "Should cities price congestion?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "start step admission test",
  as_of: "2026-11-04T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [] };
const GATE: StartStepGate = Object.freeze({ policy: POLICY_ON, engineInForce: true, scorecardInForce: false, serverPrincipal: true });
const MENU_3 = Object.freeze({ paths: 3, pathsSource: "MENU" as const });

type Seen = { shape: unknown; shapeV2: unknown; web: unknown };
function settings(input: Readonly<{ engine?: boolean; panel?: readonly DiscoveredPanelMember[]; seen?: Seen[] }>): RunCreationSettings {
  return {
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "battery:start", settlementWatchHandle: "watch:start",
    resolveDiscoveredPanel: async () => input.panel ?? PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape, shapeV2, length, engine, web }) => {
      input.seen?.push({ shape, shapeV2: shapeV2 ?? null, web });
      return computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned,
        ...(shape === null ? {} : { shape }), ...(shapeV2 == null ? {} : { shapeV2 }), ...(length === null ? {} : { length }),
        ...(engine === null ? {} : { engine }), ...(web === null ? {} : { web }) });
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
    debateShapePolicy: POLICY_ON,
    ...(input.engine === true ? { lengthGuidancePolicy: LENGTH_POLICY, engineVersionPolicy: ENGINE } : {})
  };
}

describe("startStepWidthsFor: the ONE v2 predicate", () => {
  it("answers the plan's widths when the switch is on, engine 2 is in force, no scorecard is VALID and the person is signed in", () => {
    expect(startStepWidthsFor(GATE, "plus")).toEqual({ options: [3, 5, 7], default: 5 });
    expect(startStepWidthsFor(GATE, "free")).toEqual({ options: [3], default: 3 });
  });

  it("answers null for engine 2 off, a VALID scorecard, a signed-out person, the row switched off, no row, or the switch absent", () => {
    for (const change of [{ engineInForce: false }, { scorecardInForce: true }, { serverPrincipal: false },
      { policy: { ...POLICY_ON, enabled: false } }, { policy: null }, { policy: POLICY }] as const) {
      expect(startStepWidthsFor({ ...GATE, ...change }, "plus"), JSON.stringify(Object.keys(change))).toBeNull();
    }
  });

  it("caps Free at 3 paths whatever the row says", () => {
    const wide: DebateShapePolicy = { ...POLICY_ON, startStep: { widths: { ...POLICY_ON.startStep!.widths, free: { options: [3, 5], default: 5 } } } };
    expect(startStepWidthsFor({ ...GATE, policy: wide }, "free")).toEqual({ options: [3], default: 3 });
  });
});

describe("the ask's start shape", () => {
  const PAID = Object.freeze({ options: Object.freeze([3, 5, 7]), default: 5 });
  it("an ask without verified paths (an old page's ask on a v2 version) is RUN_BUILT at the default width; Free at most 3", () => {
    expect(askStartShapeOf({ options: [3, 5, 7], default: 5 }, "plus", null)).toEqual({ paths: 5, pathsSource: "RUN_BUILT" });
    expect(askStartShapeOf({ options: [3], default: 3 }, "free", null)).toEqual({ paths: 3, pathsSource: "RUN_BUILT" });
    expect(startRunBuiltPaths(PAID, "plus")).toBe(5);
    expect(startRunBuiltPaths(PAID, "free")).toBe(3);
  });

  it("verified paths keep their count and their source; no widths, no start", () => {
    expect(askStartShapeOf(PAID, "plus", { source: "MENU", paths: ["b1", "b2"] })).toEqual({ paths: 2, pathsSource: "MENU" });
    expect(askStartShapeOf(PAID, "pro", { source: "DIG_PICKS", paths: ["b1", "b2", "b3", "b4"] })).toEqual({ paths: 4, pathsSource: "DIG_PICKS" });
    expect(askStartShapeOf(null, "plus", null)).toBeNull();
    expect(askStartShapeOf(null, "plus", { source: "MENU", paths: ["b1"] })).toBeNull();
  });

  it("two makers or more with a start: shape v2 only; one maker: neither; no start: today's shape", () => {
    expect(askShapesForPanel(POLICY_ON, SHAPED_DEPTH, "plus", 1, { paths: 5, pathsSource: "MENU" })).toEqual({ shape: null, shapeV2: null });
    expect(askShapesForPanel(POLICY_ON, SHAPED_DEPTH, "plus", 4, { paths: 5, pathsSource: "MENU" })).toEqual({ shape: null,
      shapeV2: resolveDebateShapeV2(POLICY_ON, "plus", { ...SHAPED_DEPTH, paths: 5, pathsSource: "MENU" }, 4) });
    expect(askShapesForPanel(POLICY_ON, SHAPED_DEPTH, "plus", 4, null)).toEqual({ shapeV2: null,
      shape: resolveDebateShape({ policy: POLICY_ON, plan: "plus", makers: 4, settings: SHAPED_DEPTH }) });
    expect(askShapesForPanel(undefined, { depth: 1 }, "plus", 4, null)).toEqual({ shape: null, shapeV2: null });
  });
});

describe("admission mints shape receipt v2", () => {
  const freeAsk = normaliseAskForDebateShape(ASK, POLICY_ON, "free", LENGTH_POLICY);

  it("Free, three chosen paths: receipt v2 with engine 2's answer check at 0 and no web part", async () => {
    const seen: Seen[] = [];
    const v2 = await evaluateAskAdmission(settings({ engine: true, seen }), freeAsk, null, undefined, "free", MENU_3);
    expect(seen).toEqual([{ shape: null, shapeV2: expect.objectContaining({ paths: 3, pathsSource: "MENU" }), web: null }]);
    expect(v2.envelopeBasis).toMatchObject({ formula_version: "DR-185-shape-v2", shape: { plan: "free", paths: 3, paths_source: "MENU",
      graders: 1, gap_rounds: 0, nodes: 12, path_outcome_sites: 6 }, engine: { sites: { answer_check: 0 } } });
    expect("web" in v2.envelopeBasis).toBe(false);
    const plain = await evaluateAskAdmission(settings({}), normaliseAskForDebateShape(ASK, POLICY_ON, "free"), null, undefined, "free", MENU_3);
    expect(plain.envelopeBasis.max_model_attempts).toBe(174);
  });

  it("the shared reader and the role split read the v2 receipt on its own terms", async () => {
    const v2 = await evaluateAskAdmission(settings({ engine: true }), freeAsk, null, undefined, "free", MENU_3);
    expect(admittedShapeV2Of(v2.envelopeBasis)).toMatchObject({ shape: { paths: 3 }, counts: { nodes: 12, pathOutcomeSites: 6 } });
    expect(admittedShapeOf(v2.envelopeBasis)).toBeNull();
    expect(expectedCallsByRoleFromBasis(v2.envelopeBasis)).toEqual({ POSITION: 3, CROSS_EXCHANGE: 0, SUPPORT_ATTACK: 9,
      JUDGE: 12 + 2, REVIEWER: 12 + 2, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 });
  });

  it("evaluationOrRefusal hands the start on", async () => {
    const v2 = await evaluationOrRefusal(settings({ engine: true }), freeAsk, null, "free", MENU_3);
    expect(v2).toMatchObject({ envelopeBasis: { formula_version: "DR-185-shape-v2" } });
  });

  it("no start (the switch absent or off): today's receipt, even with the switch on; one maker with a start: today's too", async () => {
    const seen: Seen[] = [];
    const today = await evaluateAskAdmission(settings({ seen }), normaliseAskForDebateShape(ASK, POLICY_ON, "free"), null, undefined, "free");
    expect(seen).toEqual([{ shape: expect.objectContaining({ plan: "free", answers: 2 }), shapeV2: null, web: null }]);
    expect(today.envelopeBasis).toMatchObject({ formula_version: "DR-185-shape-v1", max_model_attempts: 160 });
    expect(admittedShapeV2Of(today.envelopeBasis)).toBeNull();
    expect(admittedShapeOf(today.envelopeBasis)).toMatchObject({ shape: { answers: 2 } });
    const oneMaker = await evaluateAskAdmission(settings({ panel: ONE_MAKER }), normaliseAskForDebateShape(ASK, POLICY_ON, "free"),
      null, undefined, "free", MENU_3);
    expect(oneMaker.envelopeBasis.formula_version).toBe("DR-184-v4");
    expect(admittedShapeV2Of(oneMaker.envelopeBasis)).toBeNull();
  });
});

describe("the v2 role split and the strict reader on a paid run that builds its own list", () => {
  const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
    maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
    reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
  const plusBuilt: DebateShapeV2Input = resolveDebateShapeV2(POLICY_ON, "plus", { ...SHAPED_DEPTH, paths: 5, pathsSource: "RUN_BUILT" }, 4);
  const basis = computeStructuralCeilingBasis({ ...TERMS, panelSize: 4, depth: 1, shapeV2: plusBuilt });

  it("POSITION = paths + the run's list writers, their merge, the choose and the gap rounds; SUPPORT_ATTACK = the points", () => {
    // map sites 2 + 4 writers + 2 gap rounds = 8; 5 roots; 5 x 4 points; 5 x 2 x 2 answer-so-far sites.
    expect(admittedShapeV2Of(basis)).toMatchObject({ counts: { mapSites: 8, nodes: 25, pathOutcomeSites: 20 } });
    expect(expectedCallsByRoleFromBasis(basis)).toMatchObject({ POSITION: 13, CROSS_EXCHANGE: 0, SUPPORT_ATTACK: 20 });
  });

  it("a v2 receipt the strict parser refuses is refused by both readers, never read as no shape", () => {
    const broken = { ...basis, shape: { ...(basis.shape as Record<string, unknown>), nodes: 26 } };
    expect(() => admittedShapeV2Of(broken)).toThrow(expect.objectContaining({ code: "ASK_MODEL_ASSIGNMENT_INVALID" }));
    expect(() => admittedShapeOf(broken)).toThrow(expect.objectContaining({ code: "ASK_MODEL_ASSIGNMENT_INVALID" }));
    expect(() => expectedCallsByRoleFromBasis(broken)).toThrow(expect.objectContaining({ code: "ASK_MODEL_ASSIGNMENT_INVALID" }));
  });
});

describe("the web part of a path debate", () => {
  const BASE = Object.freeze({ searchGate: true, shape: null, shapeV2: Object.freeze({ plan: "plus", paths: 5 }), engine: {}, depth: 1,
    parent: undefined });
  it("a pack per path: 4 searches each on a Quick look, Thorough from depth 2", () => {
    expect(webSitesForAsk(BASE)).toEqual(webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 5, origin: "START" }));
    expect(webSitesForAsk(BASE)).toMatchObject({ kind: "PATHS", origin: "START", packs: 5, searches: 20 });
    expect(webSitesForAsk({ ...BASE, depth: 2 })).toMatchObject({ kind: "PATHS", depth: "THOROUGH", searches: 40 });
  });

  it("a dig searches in its own mode, from a dig's origin (5 results per search)", () => {
    const pick = { kind: "OWN_VIEW", suggestion_id: null, place: "w", text: "x" } as const;
    expect(webSitesForAsk({ ...BASE, shapeV2: { plan: "plus", paths: 2 }, parent: { mode: "thorough", picks: [pick, pick] } }))
      .toMatchObject({ kind: "PATHS", origin: "DIG", depth: "THOROUGH", packs: 2, resultsPerSearch: 5 });
    expect(webSitesForAsk({ ...BASE, shapeV2: { plan: "plus", paths: 2 }, depth: 3, parent: { mode: "quick" } }))
      .toMatchObject({ kind: "PATHS", origin: "DIG", depth: "QUICK" });
  });

  it("none on Free, without the search gate or without engine 2", () => {
    for (const other of [{ shapeV2: { plan: "free", paths: 3 } }, { searchGate: false }, { engine: null }]) {
      expect(webSitesForAsk({ ...BASE, ...other })).toBeNull();
    }
  });

  it("a v1 shape keeps today's START sites; no shape, no web", () => {
    const v1 = { ...BASE, shape: { plan: "plus", answers: 4 }, shapeV2: null };
    expect(webSitesForAsk(v1)).toEqual(webSitesOf({ kind: "START", depth: "QUICK", paths: 4 }));
    expect(webSitesForAsk({ ...v1, shape: null })).toBeNull();
  });
});

describe("the pages' view of a version names its engine row", () => {
  const version = (engineVersionPolicy: unknown) => ({ registerVersion: 7, debateShapePolicy: POLICY_ON, lengthGuidancePolicy: null,
    engineVersionPolicy, modelPicker: { scorecard: { state: "ABSENT" } }, previewConfig: undefined }) as unknown as AdmissionVersionSettings;
  it("carries the engine row in force, and no key without one", () => {
    expect(admissionViewOf(version(ENGINE))).toMatchObject({ registerVersion: 7, engineVersionPolicy: ENGINE, debateShapePolicy: POLICY_ON });
    expect("engineVersionPolicy" in admissionViewOf(version(null))).toBe(false);
  });
});

describe("the wiring (source pins)", () => {
  const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
  it("both admission paths hand shape v2 and the web part on; the scorecard path never mints v2; the composition passes shape v2", () => {
    const api = read("apps/api/src/index.ts");
    expect(api.split("web: webOfAsk(settings, ask, shape, shapeV2, engine)")).toHaveLength(3);
    expect(api).toContain("askShapesForPanel(settings.debateShapePolicy, ask.depth_params, input.shapePlan, makers, null)");
    expect(api).toContain("askShapesForPanel(settings.debateShapePolicy, ask.depth_params, shapePlan, makers, start)");
    expect(read("apps/api/src/admission-settings.ts")).toContain("...(input.shapeV2 == null ? {} : { shapeV2: input.shapeV2 })");
  });
});
