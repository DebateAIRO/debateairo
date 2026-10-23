/**
 * Side-by-side spec §13 (API points 1-3) and its addition D16: the API's ONE per-version admission settings loader and
 * its cache (apps/api/src/admission-settings.ts), with injected readers, so no database is needed.
 *
 * - every moved stage reads the version asked, never the site version, under main.ts's own stage name and in its order;
 * - the version's money: its per-run members composed over the site's day and band, its story's reserve, the daily
 *   guard over the site's store (without the room) and the room's estimator capped at what one run may spend;
 * - each version's preview line-up (its row, or the env's), the D15 refusals, and the two preview stages on the
 *   version's composed configuration;
 * - the one mapping to `RunCreationSettings` members;
 * - the cache: one load per version, kept forever, the seed never loaded, settings refusals kept, database failures and
 *   untyped errors never kept.
 */
import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPool, isDatabasePoolBusy } from "@debateai/db";
import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import {
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW,
  composeDebateCostEnvelope,
  costEnvelopeBand,
  costEnvelopePolicyFromValue,
  type CostEnvelopePolicy,
  type StoryPolicy
} from "@debateai/register";
import { costEnvelopeGuardPolicy, mostOneRunMaySpendMicros, type PostgresModelSpendStore } from "@debateai/budget";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS,
  composePreviewProviderTestConfig,
  parsePreviewEnvironmentConfig,
  parsePreviewLineUp,
  parseProviderDiscoveryTargets,
  previewModelRow,
  previewTargetJsonRow,
  type PreviewLineUp,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import {
  admissionSettingsOfVersion,
  createAdmissionSettingsCache,
  loadAdmissionSettings,
  type AdmissionSiteContext,
  type AdmissionVersionReaders,
  type AdmissionVersionSettings
} from "../../apps/api/src/admission-settings.js";
import type { AskModelPickerSettings } from "../../apps/api/src/ask-model-picker.js";
import type { PreviewBudgetGateSettings } from "../../apps/api/src/preview-budget-estimate.js";
import { newQuestionLanguageReferenceKey } from "../../apps/api/src/question-language/reference.js";

const SITE_VERSION = 17;
const VERSION = 18;
const POOL = {} as Pool;

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const SOCKETS = {
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", deployment: "v3-preview",
  requested_thinking_level: "high", scope_id: "admission-settings-fixture",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock"
};
/** The old env form: the gate part plus a line-up (the fallback for a version without the row). */
const OLD_ENV = parsePreviewEnvironmentConfig(JSON.stringify({ ...SOCKETS, free_model_ids: [GLM, DEEPSEEK],
  premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU], thinking_levels: { [GLM]: { level: "high" } } }))!;
const SOCKETS_ONLY_ENV = parsePreviewEnvironmentConfig(JSON.stringify(SOCKETS))!;
/** A version's own line-up row, different from the env's. */
const ROW: PreviewLineUp = parsePreviewLineUp({ free_model_ids: [QWEN, HAIKU], premium_model_ids: [GLM, DEEPSEEK, QWEN, HAIKU],
  thinking_levels: null });

function reviewedTargets(): readonly ProviderDiscoveryTarget[] {
  const refs = PREVIEW_REVIEWED_PROVIDER_REFS;
  return parseProviderDiscoveryTargets(JSON.stringify(refs.map((ref) => previewTargetJsonRow(ref))), refs.map((ref) => {
    const row = previewModelRow(previewTargetJsonRow(ref).model as string)!;
    return { providerRef: ref, maker: row.maker, adapterKind: row.adapterKind };
  }));
}
const TARGETS = reviewedTargets();

const COST_VALUE = COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value;
const envelope = (perRunCeilingMicros: number, sourceRef: string): CostEnvelopePolicy =>
  costEnvelopePolicyFromValue({ ...COST_VALUE, per_run_ceiling_micros: perRunCeilingMicros }, sourceRef);
const SITE_ROW = envelope(300000, "site-row");
const VERSION_ROW = envelope(250000, "version-row");
const STORY = Object.freeze({ perStoryCeilingMicros: 40000, perStoryOverrunBasisPoints: 1000 }) as unknown as StoryPolicy;

/** The stage names main.ts always used, in its order (hosted, on the preview, with the shape row in force). */
const STAGES = ["cost-envelope-policy", "structural-ceilings", "envelope-formula-inputs", "preview-line-up",
  "preview-scorecard-conflict", "preview-budget-gate", "call-token-ceilings", "debate-shape-policy",
  "length-guidance-policy", "engine-version-policy", "engine-requires-length-policy", "question-language",
  "model-scorecard", "model-picker", "run-ceiling-covers-one-call", "deployment-risk-tier", "answer-role-rotation-policy"];

type Call = readonly [name: string, version: number | null];

/** Injected readers that record each call; a reader handed anything but `expected` throws. */
function readers(expected: number, change: Partial<AdmissionVersionReaders> = {}) {
  const calls: Call[] = [];
  const configs: PreviewProviderTestConfig[] = [];
  const pickerInputs: unknown[] = [];
  const check = (name: string, version: number) => {
    calls.push([name, version]);
    if (version !== expected) throw new Error(`READER_GOT_${version}_NOT_${expected}`);
  };
  const at = <T>(name: string, value: () => T) => async (_pool: Pool, version: number) => { check(name, version); return value(); };
  const base = {
    readCostEnvelopePolicy: at("readCostEnvelopePolicy", () => VERSION_ROW),
    readStoryPolicyFromRegister: at("readStoryPolicyFromRegister", () => STORY),
    readStructuralCeilingPolicyInputs: at("readStructuralCeilingPolicyInputs", () => ({ sentinel: "structural" })),
    readEnvelopeFormulaInputs: at("readEnvelopeFormulaInputs", () => ({ sentinel: "formula" })),
    readPreviewLineUpPolicy: at("readPreviewLineUpPolicy", () => ROW),
    readModelScorecard: async (_pool: Pool, version: number) => { check("readModelScorecard", version); return { state: "ABSENT" }; },
    readEngineVersion: async () => { calls.push(["readEngineVersion", null]); return "engine-fixture"; },
    readPreviewBudgetGateSettings: async (_pool: Pool, version: number, config: PreviewProviderTestConfig) => {
      check("readPreviewBudgetGateSettings", version);
      configs.push(config);
      return Object.freeze({ remaining: { sentinel: "config-sockets" }, roleProviderRefs: [TARGETS[0]!.providerRef, TARGETS[1]!.providerRef] });
    },
    readCallTokenCeilings: at("readCallTokenCeilings", () => ({ sentinel: "ceilings" })),
    readDebateShapePolicy: at("readDebateShapePolicy", () => ({ enabled: true, sentinel: "shape" })),
    readLengthGuidancePolicy: at("readLengthGuidancePolicy", () => null),
    readEngineVersionPolicy: at("readEngineVersionPolicy", () => null),
    readQuestionLanguagePolicy: at("readQuestionLanguagePolicy", () => null),
    composeQuestionLanguage: async () => ({ sentinel: "question-language" }),
    composeAskModelPicker: async (input: Parameters<AdmissionVersionReaders["composeAskModelPicker"]>[0]) => {
      pickerInputs.push(input);
      check("composeAskModelPicker", input.registerVersion);
      const scorecard = await input.boot.run("model-scorecard", async () => ({ state: "ABSENT" }));
      return input.boot.runSync("model-picker", () => ({ sentinel: "picker", scorecard }));
    },
    readJudgeTokenCeiling: at("readJudgeTokenCeiling", () => 2048),
    readDeploymentRiskTier: at("readDeploymentRiskTier", () => ({ value: "high-stakes" })),
    readAnswerRoleRotationPolicy: at("readAnswerRoleRotationPolicy", () => ({ state: "ON" }))
  } as unknown as AdmissionVersionReaders;
  return { readers: Object.freeze({ ...base, ...change }) as AdmissionVersionReaders, calls, configs, pickerInputs };
}

function site(change: Partial<AdmissionSiteContext> = {}): AdmissionSiteContext {
  return Object.freeze({
    siteVersion: SITE_VERSION,
    deploymentMode: "hosted",
    preview: OLD_ENV,
    declaredProviderTargets: TARGETS,
    siteCostEnvelope: { runPolicy: SITE_ROW, band: costEnvelopeBand(SITE_ROW) },
    billingEnabled: false,
    spend: null,
    recentRunUsage: { readRecentRunUsage: async () => [] },
    prices: new Map(),
    costEstimateStart: null,
    questionLanguage: { routeFor: async () => ({ kind: "NONE", reason: "NO_GATE" }), referenceKey: newQuestionLanguageReferenceKey() },
    log: () => undefined,
    ...change
  } as AdmissionSiteContext);
}

/** A stage recorder: each name, in order, each step run through it. */
function recorder() {
  const names: string[] = [];
  const stage = async <T>(name: string, run: () => Promise<T> | T): Promise<T> => { names.push(name); return run(); };
  return { names, stage };
}

describe("loadAdmissionSettings: one version, read as itself (side-by-side spec §13)", () => {
  it("hands every reader the version asked, never the site version, and keeps the version on the result", async () => {
    const fake = readers(VERSION);
    const loaded = await loadAdmissionSettings(POOL, VERSION, site(), undefined, { readers: fake.readers });
    expect(loaded.registerVersion).toBe(VERSION);
    const versioned = fake.calls.filter(([, version]) => version !== null);
    expect(versioned).toHaveLength(16);
    expect(versioned.every(([, version]) => version === VERSION)).toBe(true);
    expect(new Set(versioned.map(([name]) => name))).toEqual(new Set(["readCostEnvelopePolicy", "readStoryPolicyFromRegister",
      "readStructuralCeilingPolicyInputs", "readEnvelopeFormulaInputs", "readPreviewLineUpPolicy", "readModelScorecard",
      "readPreviewBudgetGateSettings", "readCallTokenCeilings", "readDebateShapePolicy", "readLengthGuidancePolicy",
      "readEngineVersionPolicy", "readQuestionLanguagePolicy", "composeAskModelPicker", "readJudgeTokenCeiling",
      "readDeploymentRiskTier", "readAnswerRoleRotationPolicy"]));
  });

  it("control: a loader that read the site version would fail the readers above", async () => {
    const fake = readers(SITE_VERSION);
    await expect(loadAdmissionSettings(POOL, VERSION, site(), undefined, { readers: fake.readers }))
      .rejects.toThrow(`READER_GOT_${VERSION}_NOT_${SITE_VERSION}`);
  });

  it("runs every step through the stage it is handed, under main.ts's names and in main.ts's order", async () => {
    const fake = readers(VERSION);
    const { names, stage } = recorder();
    await loadAdmissionSettings(POOL, VERSION, site(), stage, { readers: fake.readers });
    expect(names).toEqual(STAGES);
  });

  it("off the preview and in local mode: no money, no preview stages, the rest in the same order", async () => {
    const fake = readers(VERSION, { readPreviewLineUpPolicy: async () => null });
    const { names, stage } = recorder();
    const loaded = await loadAdmissionSettings(POOL, VERSION,
      site({ preview: undefined, deploymentMode: "local", siteCostEnvelope: null, recentRunUsage: null }), stage,
      { readers: fake.readers });
    expect(names).toEqual(STAGES.filter((name) => !["cost-envelope-policy", "preview-scorecard-conflict",
      "preview-budget-gate"].includes(name)));
    expect(loaded).toMatchObject({ costEnvelope: null, dailyGuard: null, estimator: null, previewConfig: undefined,
      previewBudgetGate: undefined });
  });

  it("a refusal names nothing new: the reader's own typed code propagates from its stage", async () => {
    const refusal = new TypedDomainError("DEBATE_SHAPE_POLICY_INVALID", "DEBATE_SHAPE_POLICY_INVALID");
    const fake = readers(VERSION, { readDebateShapePolicy: async () => { throw refusal; } });
    const { names, stage } = recorder();
    await expect(loadAdmissionSettings(POOL, VERSION, site(), stage, { readers: fake.readers })).rejects.toBe(refusal);
    expect(names.at(-1)).toBe("debate-shape-policy");
  });
});

describe("the version's money (V-28, B6b, Task M7) over the site's day and band", () => {
  it("composes the version's row over the site's, with the version's story, the room's estimator capped at one run", async () => {
    const fake = readers(VERSION);
    const loaded = await loadAdmissionSettings(POOL, VERSION, site(), undefined, { readers: fake.readers });
    const runPolicy = composeDebateCostEnvelope(SITE_ROW, VERSION_ROW);
    expect(loaded.costEnvelope?.runPolicy).toEqual(runPolicy);
    expect(loaded.costEnvelope?.runPolicy.perRunCeilingMicros).toBe(250000);
    expect(loaded.costEnvelope?.runPolicy.dailyCeilingMicros).toBe(SITE_ROW.dailyCeilingMicros);
    const guardPolicy = costEnvelopeGuardPolicy(runPolicy, STORY);
    expect(loaded.costEnvelope?.guardPolicy).toEqual(guardPolicy);
    // With no recent runs the estimate is the cap: what one run of this version may spend.
    expect(await loaded.estimator!.estimateMicros({ planTier: "free", compositionBudgetTier: "low", makerCount: 2, depth: 1 }))
      .toBe(mostOneRunMaySpendMicros(guardPolicy));
    // With the room composed (the site context gives the guard no store), no daily guard and no assertDailyCostEnvelope.
    expect(loaded.dailyGuard).toBeNull();
    expect("assertDailyCostEnvelope" in admissionSettingsOfVersion(loaded)).toBe(false);
  });

  it("the estimator starts from the SITE's costEstimateStartPolicy row (fresh-site estimate, merge of PR #212)", async () => {
    const fake = readers(VERSION);
    const ask = { planTier: "free", compositionBudgetTier: "low", makerCount: 2, depth: 1 } as const;
    // A price to price with (the starting figure is used only then); no recent runs, so the sample is short.
    const prices = new Map([["provider/model", {} as never]]);
    const start = Object.freeze({ minSamples: 5, startMicrosByDepth: new Map([[1, 7]]) }) as never;
    const started = await loadAdmissionSettings(POOL, VERSION, site({ prices, costEstimateStart: start }), undefined,
      { readers: fake.readers });
    expect(await started.estimator!.estimateMicros(ask)).toBe(7);
    // Without the site's row: today's estimate, the cap while the sample is short.
    const today = await loadAdmissionSettings(POOL, VERSION, site({ prices }), undefined, { readers: readers(VERSION).readers });
    expect(await today.estimator!.estimateMicros(ask)).toBe(mostOneRunMaySpendMicros(today.costEnvelope!.guardPolicy));
    // A SITE row: no reader of it is handed the version (the loader never reads it per version).
    expect(fake.calls.some(([name]) => /CostEstimateStart/u.test(name))).toBe(false);
  });

  it("without the room: the daily guard over the site's store and the version's guard policy, and no estimator", async () => {
    const fake = readers(VERSION);
    const readDaySpentMicros = vi.fn(async () => 0);
    const spend = { readDaySpentMicros } as unknown as PostgresModelSpendStore;
    const loaded = await loadAdmissionSettings(POOL, VERSION, site({ spend, recentRunUsage: null }), undefined,
      { readers: fake.readers });
    expect(loaded.estimator).toBeNull();
    expect(loaded.dailyGuard).not.toBeNull();
    const members = admissionSettingsOfVersion(loaded);
    expect(typeof members.assertDailyCostEnvelope).toBe("function");
  });

  it("a typed refusal of the story's rows is no story (one content-free line); a database failure propagates (R32)", async () => {
    const lines: string[] = [];
    const typed = readers(VERSION, { readStoryPolicyFromRegister: async () => {
      throw new TypedDomainError("STORY_POLICY_INVALID", "STORY_POLICY_INVALID");
    } });
    const loaded = await loadAdmissionSettings(POOL, VERSION, site({ log: (line) => lines.push(line) }), undefined,
      { readers: typed.readers });
    expect(loaded.costEnvelope?.guardPolicy).toEqual(costEnvelopeGuardPolicy(composeDebateCostEnvelope(SITE_ROW, VERSION_ROW), null));
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { kind: "DEBATEAI_STORY", event: "STORY_POLICY_UNREADABLE", code: "STORY_POLICY_INVALID" }]);
    const blip = new TypedDomainError("DATABASE_POOL_FAILED", "DATABASE_POOL_FAILED");
    const failing = readers(VERSION, { readStoryPolicyFromRegister: async () => { throw blip; } });
    await expect(loadAdmissionSettings(POOL, VERSION, site(), undefined, { readers: failing.readers })).rejects.toBe(blip);
    const untyped = readers(VERSION, { readStoryPolicyFromRegister: async () => { throw new Error("connection reset by peer"); } });
    await expect(loadAdmissionSettings(POOL, VERSION, site(), undefined, { readers: untyped.readers }))
      .rejects.toThrow("connection reset by peer");
  });

  it("without the site's band, the run-ceiling check reads nothing (B9 is asked only with the site's band)", async () => {
    const fake = readers(VERSION);
    const { names, stage } = recorder();
    await loadAdmissionSettings(POOL, VERSION, site({ siteCostEnvelope: { runPolicy: SITE_ROW, band: null } }), stage,
      { readers: fake.readers });
    expect(names).toContain("run-ceiling-covers-one-call");
    expect(fake.calls.map(([name]) => name)).not.toContain("readJudgeTokenCeiling");
    const banded = readers(VERSION);
    await loadAdmissionSettings(POOL, VERSION, site(), undefined, { readers: banded.readers });
    expect(banded.calls.map(([name]) => name)).toContain("readJudgeTokenCeiling");
  });

  it("hands the picker this version's per-run money and the site's billing switch", async () => {
    const fake = readers(VERSION);
    const loaded = await loadAdmissionSettings(POOL, VERSION, site({ billingEnabled: true }), undefined, { readers: fake.readers });
    expect(fake.pickerInputs[0]).toMatchObject({
      registerVersion: VERSION,
      perRunCeilingMicros: loaded.costEnvelope?.guardPolicy.perRunCeilingMicros,
      moneyPolicy: loaded.costEnvelope?.guardPolicy,
      billingEnabled: true,
      deploymentMode: "hosted",
      targets: TARGETS
    });
  });
});

describe("addition D14-D16: each version's preview line-up, and the preview stages on it", () => {
  it("a version with the row runs on the row over the env's gate part, in both preview stages", async () => {
    const fake = readers(VERSION);
    const loaded = await loadAdmissionSettings(POOL, VERSION, site(), undefined, { readers: fake.readers });
    const composed = composePreviewProviderTestConfig(OLD_ENV.gate, ROW);
    expect(loaded.previewConfig).toEqual(composed);
    expect(fake.configs).toEqual([composed]);
    expect(admissionSettingsOfVersion(loaded).previewProviderTestConfig).toEqual(composed);
    expect(admissionSettingsOfVersion(loaded).previewBudgetGate).toBe(loaded.previewBudgetGate);
  });

  it("a version without the row runs on the env's line-up; the site's remaining-answer seam replaces the config's", async () => {
    const fake = readers(VERSION, { readPreviewLineUpPolicy: async () => null });
    const remaining = Object.freeze({ deepinfra: async () => ({ sentinel: "forwarded" }) }) as unknown as PreviewBudgetGateSettings["remaining"];
    const loaded = await loadAdmissionSettings(POOL, VERSION, site({ previewRemaining: remaining }), undefined,
      { readers: fake.readers });
    expect(loaded.previewConfig).toEqual(composePreviewProviderTestConfig(OLD_ENV.gate, OLD_ENV.envLineUp!));
    expect(loaded.previewBudgetGate?.remaining).toBe(remaining);
    expect(loaded.previewBudgetGate?.roleProviderRefs).toEqual([TARGETS[0]!.providerRef, TARGETS[1]!.providerRef]);
  });

  it("D15 at the site version: the row beside an env line-up refuses PREVIEW_LINE_UP_ENV_CONFLICT", async () => {
    const fake = readers(SITE_VERSION);
    await expect(loadAdmissionSettings(POOL, SITE_VERSION, site(), undefined, { readers: fake.readers }))
      .rejects.toMatchObject({ code: "PREVIEW_LINE_UP_ENV_CONFLICT" });
  });

  it("D14/D15: a sockets-only env and no row refuses PREVIEW_LINE_UP_REQUIRED; a row off the preview, _WITHOUT_PREVIEW", async () => {
    const noRow = readers(SITE_VERSION, { readPreviewLineUpPolicy: async () => null });
    await expect(loadAdmissionSettings(POOL, SITE_VERSION, site({ preview: SOCKETS_ONLY_ENV }), undefined, { readers: noRow.readers }))
      .rejects.toMatchObject({ code: "PREVIEW_LINE_UP_REQUIRED" });
    const fake = readers(VERSION);
    await expect(loadAdmissionSettings(POOL, VERSION, site({ preview: undefined }), undefined, { readers: fake.readers }))
      .rejects.toMatchObject({ code: "PREVIEW_LINE_UP_WITHOUT_PREVIEW" });
    // D15: the same at the site version (a row on a deployment without the preview configuration refuses the boot).
    const siteRow = readers(SITE_VERSION);
    await expect(loadAdmissionSettings(POOL, SITE_VERSION, site({ preview: undefined }), undefined, { readers: siteRow.readers }))
      .rejects.toMatchObject({ code: "PREVIEW_LINE_UP_WITHOUT_PREVIEW" });
    // The sockets-only env with the row: the row is the line-up (the site version too: nothing to conflict with).
    const row = readers(SITE_VERSION);
    const loaded = await loadAdmissionSettings(POOL, SITE_VERSION, site({ preview: SOCKETS_ONLY_ENV }), undefined, { readers: row.readers });
    expect(loaded.previewConfig).toEqual(composePreviewProviderTestConfig(SOCKETS_ONLY_ENV.gate, ROW));
  });

  it("a VALID scorecard of the version refuses PREVIEW_SCORECARD_CONFLICT; a roster model without a target is refused", async () => {
    const valid = readers(VERSION, { readModelScorecard: (async () => ({ state: "VALID" })) as never });
    await expect(loadAdmissionSettings(POOL, VERSION, site(), undefined, { readers: valid.readers }))
      .rejects.toMatchObject({ code: "PREVIEW_SCORECARD_CONFLICT" });
    // The row's QWEN has no declared target here.
    const unserved = readers(VERSION);
    await expect(loadAdmissionSettings(POOL, VERSION, site({ declaredProviderTargets: TARGETS.filter((target) => target.model !== QWEN) }),
      undefined, { readers: unserved.readers })).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
});

describe("admissionSettingsOfVersion: the one mapping", () => {
  it("maps the members a version has and omits the ones it does not", async () => {
    const fake = readers(VERSION);
    const loaded = await loadAdmissionSettings(POOL, VERSION, site(), undefined, { readers: fake.readers });
    const members = admissionSettingsOfVersion(loaded);
    expect(Object.keys(members).sort()).toEqual(["debateShapePolicy", "modelPicker", "previewBudgetGate",
      "previewProviderTestConfig", "questionLanguage", "registerVersion", "resolveEnvelopeBasis", "resolveRisk",
      "roleRotation"]);
    expect(members.registerVersion).toBe(VERSION);
    expect(members.modelPicker).toBe(loaded.modelPicker);
    expect(members.questionLanguage).toEqual({ sentinel: "question-language" });
    // The version's deployment tier is the floor an asker's lower tier is raised to.
    expect(members.resolveRisk("casual", "ASKER_DECLARED" as never, "provenance").effectiveRiskTier).toBe("high-stakes");
    expect(Object.isFrozen(members)).toBe(true);
  });
});

describe("createAdmissionSettingsCache: one load per version, for the life of the process", () => {
  const settings = (version: number) => Object.freeze({ registerVersion: version }) as unknown as AdmissionVersionSettings;

  it("serves the seed without a load, loads another version once (shared by concurrent asks) and keeps it", async () => {
    const load = vi.fn(async (version: number) => settings(version));
    const seed = settings(SITE_VERSION);
    const cache = createAdmissionSettingsCache({ load, seed });
    expect(await cache.admissionSettingsFor(SITE_VERSION)).toBe(seed);
    expect(load).not.toHaveBeenCalled();
    const [a, b] = await Promise.all([cache.admissionSettingsFor(VERSION), cache.admissionSettingsFor(VERSION)]);
    expect(a).toBe(b);
    expect(await cache.admissionSettingsFor(VERSION)).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(VERSION);
  });

  it("keeps a settings refusal (typed, or a code-shaped message): later asks get it without a load", async () => {
    const typed = new TypedDomainError("ENGINE_VERSION_POLICY_INVALID", "ENGINE_VERSION_POLICY_INVALID");
    const coded = new TypeError("CALL_CONCURRENCY_POLICY_INVALID");
    const load = vi.fn(async (version: number) => { throw version === VERSION ? typed : coded; });
    const cache = createAdmissionSettingsCache({ load, seed: settings(SITE_VERSION) });
    await expect(cache.admissionSettingsFor(VERSION)).rejects.toBe(typed);
    await expect(cache.admissionSettingsFor(VERSION)).rejects.toBe(typed);
    await expect(cache.admissionSettingsFor(19)).rejects.toBe(coded);
    await expect(cache.admissionSettingsFor(19)).rejects.toBe(coded);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never keeps a database failure (R31) or an untyped error: the next ask loads again", async () => {
    let attempt = 0;
    const failures = [
      new TypedDomainError("DATABASE_POOL_FAILED", "DATABASE_POOL_FAILED"),
      // The pool's code as the cause of another typed error is still the database's.
      Object.assign(new TypedDomainError("RUN_READ_FAILED", "fixture"), {
        cause: new TypedDomainError("DATABASE_POOL_FAILED", "DATABASE_POOL_FAILED") }),
      new Error("Connection terminated unexpectedly")
    ];
    const load = vi.fn(async (version: number) => {
      const failure = failures[attempt];
      attempt += 1;
      if (failure !== undefined) throw failure;
      return settings(version);
    });
    const cache = createAdmissionSettingsCache({ load, seed: settings(SITE_VERSION) });
    await expect(cache.admissionSettingsFor(VERSION)).rejects.toBe(failures[0]);
    await expect(cache.admissionSettingsFor(VERSION)).rejects.toBe(failures[1]);
    await expect(cache.admissionSettingsFor(VERSION)).rejects.toBe(failures[2]);
    expect((await cache.admissionSettingsFor(VERSION)).registerVersion).toBe(VERSION);
    expect(load).toHaveBeenCalledTimes(4);
  });
});

describe("createAdmissionSettingsCache over the house pool: a busy pool is never kept (R31)", () => {
  const servers: Server[] = [];
  const sockets: Socket[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const socket of sockets.splice(0)) socket.destroy();
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  });

  it("a load that fails with the pool's busy failure (marked at its origin) is refused and loaded again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // A server that accepts and never answers: the pool's wait times out, and createPool marks the failure busy.
    const server = createServer((socket) => { sockets.push(socket); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const address = server.address();
    if (address === null || typeof address === "string") throw new TypeError("TEST_SERVER_ADDRESS");
    const pool = createPool(`postgresql://nobody@127.0.0.1:${address.port}/none`, { max: 1, connectionTimeoutMillis: 150, name: "test:busy" });
    try {
      let loads = 0;
      const seed = Object.freeze({ registerVersion: SITE_VERSION }) as unknown as AdmissionVersionSettings;
      const cache = createAdmissionSettingsCache({ seed, load: async () => { loads += 1; await pool.query("SELECT 1"); return seed; } });
      const failure = await cache.admissionSettingsFor(VERSION).then(() => undefined, (error: unknown) => error);
      expect(isDatabasePoolBusy(failure)).toBe(true);
      await expect(cache.admissionSettingsFor(VERSION)).rejects.toMatchObject({ code: "DATABASE_POOL_FAILED" });
      expect(loads).toBe(2);
    } finally {
      await pool.end().catch(() => undefined);
    }
  });
});
