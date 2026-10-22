// Engine redesign R1d, Task 6 (spec §3.2, §3.3; INTERFACE §1.4, §1.5 row 1): admission freezes engine 2's settings on the
// receipt only with the row in force; without it the receipt keeps today's bytes. The API boot refuses an engine row in
// force without the length row; engineForAsk refuses it again as a belt.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { askRefusalPublicMessage, evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, engineSettingsOf, engineVersionPolicyStartValues,
  lengthGuidancePolicyStartValues, resolveLengthGuidance, type EngineSettings
} from "@debateai/register";
import { normaliseAskForDebateShape } from "../../apps/api/src/debate-shape-ask.js";
import { assertEngineHasLengthPolicy, engineForAsk } from "../../apps/api/src/engine-ask.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
const member = (providerRef: string, maker: string, modelId: string): DiscoveredPanelMember => Object.freeze({
  provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-16T00:00:00.000Z" });
/** The free plan's two local roster models, two makers. */
const PANEL = Object.freeze([member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "Anthropic", "claude-sonnet-5")]);
const ENGINE = engineVersionPolicyStartValues();
const LENGTH_POLICY = lengthGuidancePolicyStartValues();
const LENGTH = resolveLengthGuidance({ policy: LENGTH_POLICY, plan: "free", answerLength: "standard" });
const SHAPE = debateShapePolicyStartValues();
const ASK: AskRequest = { question_line: "Should cities price congestion?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "low", depth_params: { depth: 2 }, decision_scope: "engine admission test",
  as_of: "2026-10-16T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [] };

function settings(input: Readonly<{ engine?: boolean; length?: boolean; shape?: boolean; seen?: (EngineSettings | null)[] }>): RunCreationSettings {
  return {
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "battery:engine", settlementWatchHandle: "watch:engine",
    resolveDiscoveredPanel: async () => PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape, length, engine }) => {
      input.seen?.push(engine);
      return computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned,
        ...(shape === null ? {} : { shape }), ...(length === null ? {} : { length }), ...(engine === null ? {} : { engine }) });
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
    ...(input.shape === true ? { debateShapePolicy: SHAPE } : {}),
    ...(input.length === true ? { lengthGuidancePolicy: LENGTH_POLICY } : {}),
    ...(input.engine === true ? { engineVersionPolicy: ENGINE } : {})
  };
}
type EngineSitesReceipt = Readonly<{ comparing_judges: number; investigations: number; answer_check: number; added_model_attempts: number }>;
const sitesOf = (basis: Readonly<Record<string, unknown>>) => (basis.engine as { sites: EngineSitesReceipt }).sites;
const panelMemberAttempts = (basis: Readonly<Record<string, unknown>>) => (basis.per_site_attempts as { panel_member: number }).panel_member;

describe("engineForAsk (INTERFACE §1.4)", () => {
  it("no row in force: null, whatever else is given", () => {
    expect(engineForAsk({ policy: undefined, length: null, makers: 2, mapOpening: false })).toBeNull();
    expect(engineForAsk({ policy: undefined, length: LENGTH, makers: 3, mapOpening: true })).toBeNull();
  });

  it("the row with the length numbers: the row's settings with this panel's sites", () => {
    const opened = engineForAsk({ policy: ENGINE, length: LENGTH, makers: 2, mapOpening: true });
    expect(opened).toEqual(engineSettingsOf(ENGINE, { makers: 2, mapOpening: true }));
    expect(opened!.engine).toBe(2);
    expect(opened!.sites).toEqual({ comparingJudges: 2, investigations: 2, answerCheck: 1 });
    expect(engineForAsk({ policy: ENGINE, length: LENGTH, makers: 2, mapOpening: false })!.sites.answerCheck).toBe(0);
  });

  it("the comparing judges are capped by the makers present: min(judges.count, makers)", () => {
    for (const [makers, judges] of [[2, 2], [3, 3], [5, 3], [7, 3]] as const) {
      expect(engineForAsk({ policy: ENGINE, length: LENGTH, makers, mapOpening: false })!.sites.comparingJudges, String(makers)).toBe(judges);
    }
  });

  it("the row without the length numbers is refused ENGINE_REQUIRES_LENGTH_POLICY (a belt: the boot refuses first)", () => {
    // Task 6 review 3 (final wave B4): one call, one try/catch, the class and the code.
    let thrown: unknown = null;
    try { engineForAsk({ policy: ENGINE, length: null, makers: 2, mapOpening: false }); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(TypedDomainError);
    expect(thrown).toMatchObject({ code: "ENGINE_REQUIRES_LENGTH_POLICY" });
  });

  it("the boot rule: the row in force without the length row refuses; every other pair passes", () => {
    expect(() => assertEngineHasLengthPolicy(ENGINE, null)).toThrowError(expect.objectContaining({ code: "ENGINE_REQUIRES_LENGTH_POLICY" }));
    expect(() => assertEngineHasLengthPolicy(ENGINE, LENGTH_POLICY)).not.toThrow();
    expect(() => assertEngineHasLengthPolicy(null, null)).not.toThrow();
    expect(() => assertEngineHasLengthPolicy(null, LENGTH_POLICY)).not.toThrow();
  });
});

describe("admission freezes the engine on the receipt (spec §3.2)", () => {
  it("no row: nothing is resolved and the receipt is today's, byte for byte, with the length row or without it", async () => {
    const seen: (EngineSettings | null)[] = [];
    const ask = normaliseAskForDebateShape(ASK, null, "free", LENGTH_POLICY);
    const admitted = await evaluateAskAdmission(settings({ length: true, seen }), ask);
    expect(seen).toEqual([null]);
    expect(Object.hasOwn(admitted.envelopeBasis, "engine")).toBe(false);
    expect(JSON.stringify(admitted.envelopeBasis)).toBe(JSON.stringify(computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize: 2,
      depth: 2, backupSequencesProvisioned: 0, length: LENGTH })));
    const bare: (EngineSettings | null)[] = [];
    const today = await evaluateAskAdmission(settings({ seen: bare }), ASK);
    expect(bare).toEqual([null]);
    expect(JSON.stringify(today.envelopeBasis)).toBe(JSON.stringify(computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize: 2,
      depth: 2, backupSequencesProvisioned: 0 })));
  });

  it("the row in force with the length row, today's shape: engine 2 frozen, no answer check, its sites added to the ceiling", async () => {
    const seen: (EngineSettings | null)[] = [];
    const ask = normaliseAskForDebateShape(ASK, null, "free", LENGTH_POLICY);
    const admitted = await evaluateAskAdmission(settings({ engine: true, length: true, seen }), ask);
    expect(seen[0]?.engine).toBe(2);
    expect(seen[0]?.sites).toEqual({ comparingJudges: 2, investigations: 2, answerCheck: 0 });
    const perSite = panelMemberAttempts(admitted.envelopeBasis);
    expect(sitesOf(admitted.envelopeBasis)).toEqual({ comparing_judges: 2, investigations: 2, answer_check: 0, added_model_attempts: 4 * perSite });
    const lengthOnly = await evaluateAskAdmission(settings({ length: true }), ask);
    expect(admitted.envelopeBasis.formula_version).toBe(lengthOnly.envelopeBasis.formula_version);
    expect(admitted.envelopeBasis.max_model_attempts).toBe(Number(lengthOnly.envelopeBasis.max_model_attempts) + 4 * perSite);
  });

  it("the row in force with the shape (its opening is the map): the answer check is a site", async () => {
    const ask = normaliseAskForDebateShape(ASK, SHAPE, "free", LENGTH_POLICY);
    const admitted = await evaluateAskAdmission(settings({ engine: true, length: true, shape: true }), ask);
    expect(admitted.envelopeBasis.formula_version).toBe("DR-185-shape-v1");
    expect(sitesOf(admitted.envelopeBasis)).toMatchObject({ comparing_judges: 2, investigations: 2, answer_check: 1 });
    expect(sitesOf(admitted.envelopeBasis).added_model_attempts).toBe(5 * panelMemberAttempts(admitted.envelopeBasis));
  });

  it("the row in force without the length row (a composition that skipped the boot rule) is refused, never admitted", async () => {
    await expect(evaluateAskAdmission(settings({ engine: true }), ASK)).rejects.toMatchObject({ code: "ENGINE_REQUIRES_LENGTH_POLICY" });
  });

  it("an HTTP caller is told the code only: the refusal's message names engine words (Task 6 review 2, final wave A4)", async () => {
    const refusal = await evaluateAskAdmission(settings({ engine: true }), ASK)
      .then(() => null, (error: unknown) => error as { code: string; message: string });
    expect(refusal).not.toBeNull();
    expect(refusal!.code).toBe("ENGINE_REQUIRES_LENGTH_POLICY");
    expect(refusal!.message).toMatch(/Engine 2/u);
    expect(askRefusalPublicMessage(refusal!.code, refusal!.message)).toBe("ENGINE_REQUIRES_LENGTH_POLICY");
  });
});

describe("the wiring (source pins)", () => {
  const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

  it("both admission paths freeze the engine with the same expression, and the planned basis is reused only without the row", () => {
    const api = read("apps/api/src/index.ts");
    expect(api.split("engine: engineForAsk({ policy: settings.engineVersionPolicy, length, makers, mapOpening: shape !== null })")).toHaveLength(3);
    expect(api).toContain("&& settings.debateShapePolicy === undefined && settings.engineVersionPolicy === undefined");
    expect(api).toContain("readonly engineVersionPolicy?: EngineVersionPolicy;");
    expect(api).toContain("readonly engine: EngineSettings | null;");
    // Pre-flight PF-D3.5: the engine ceiling's refusal names receipt figures, so the caller is told the code only.
    const figures = api.slice(api.indexOf("const ASK_REFUSALS_WITH_OPERATOR_FIGURES"), api.indexOf("]);", api.indexOf("const ASK_REFUSALS_WITH_OPERATOR_FIGURES")));
    expect(figures).toContain("\"STRUCTURAL_CEILING_SHAPE_INVALID\",\n  \"STRUCTURAL_CEILING_ENGINE_INVALID\",");
  });

  it("apps/api/src/main.ts reads the row once, after the length row, refuses engine 2 without it, and hands the in-force row on", () => {
    // Side-by-side spec §13 (S9): the stages are the API's one per-version admission loader's, at the version it loads;
    // main.ts loads REGISTER_VERSION through it before the ask application and spreads its one mapping.
    const main = read("apps/api/src/main.ts");
    const loader = read("apps/api/src/admission-settings.ts");
    const stage = "run(\"engine-version-policy\", () => readers.readEngineVersionPolicy(pool, version))";
    expect(loader.split(stage)).toHaveLength(2);
    expect(loader.indexOf(stage)).toBeGreaterThan(loader.indexOf("run(\"length-guidance-policy\""));
    expect(main).not.toContain("readEngineVersionPolicy(");
    expect(main.indexOf("const siteAdmission = await loadAdmissionSettings(")).toBeLessThan(main.indexOf("new PostgresAskApplication("));
    expect(loader).toContain("const engineInForcePolicy = engineInForce(engineVersionPolicy);");
    expect(loader).toContain("await run(\"engine-requires-length-policy\", () => assertEngineHasLengthPolicy(engineInForcePolicy, lengthGuidancePolicy));");
    expect(loader).toContain("engineVersionPolicy: engineInForcePolicy,");
    expect(loader.split("...(engineVersionPolicy === null ? {} : { engineVersionPolicy }),")).toHaveLength(2);
    expect(main).toContain("...admissionSettingsOfVersion(siteAdmission),");
    expect(loader).toContain("...(input.engine === null ? {} : { engine: input.engine })");
  });

  it("the practice's ask composition reads and checks the row as main.ts does", () => {
    // Side-by-side spec §13 (S9): through main.ts's own loader and mapping, never a read of its own.
    const practice = read("tools/preview-practice/practice-ask-composition.ts");
    expect(practice).not.toContain("readEngineVersionPolicy(");
    expect(practice).not.toContain("assertEngineHasLengthPolicy(");
    expect(practice.split("const siteAdmission = await loadAdmissionSettings(pool, environment.REGISTER_VERSION, admissionSite);")).toHaveLength(2);
    expect(practice).toContain("...practiceMembersOf(admissionSettingsOfVersion(siteAdmission)),");
  });
});
