/**
 * Side-by-side spec §13 (runner points 1, 2, 7) and its addition D14-D16: the runner's ONE per-version settings loader
 * and cache (apps/runner/src/run-settings.ts), with injected readers, so no database is needed.
 *
 * - the loader reads, for the version asked and in main.ts's order, every row main.ts read for its one REGISTER_VERSION,
 *   and each reader is handed that version, never the site version;
 * - every reader's typed refusal propagates unchanged; unreadable story rows are null plus one line (strict: refused);
 * - the cache shares a load, keeps a typed refusal as UNSUPPORTED, never keeps an untyped failure, and the boot's
 *   `requireSettings` rethrows the loader's own refusal;
 * - each version resolves its own preview line-up (the row, or the env's for a version without it), and the D15
 *   refusals; the version's rosters, seats and scorecard are checked against the declared targets;
 * - `runnerSettingsOfVersion` maps one version's debate members, written once;
 * - S8 (spec §13 runner point 3): the boot preload is the sorted, distinct union of the site version, the release's open
 *   debates' versions and its passed versions, never the activation pointer; a legacy process preloads its site version
 *   only; an unsupported version is one loud line and the boot goes on; a database failure refuses the boot; one
 *   content-free DEBATEAI_RUNNER_SETTINGS line after the ready line, in main.ts and (as a log line) in the practice.
 */
import { readFileSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createPool, isDatabasePoolBusy } from "@debateai/db";
import { LEGACY_RELEASE_KEY, TypedDomainError } from "@debateai/kernel";
import { WorkItemRepository } from "@debateai/battery";
import {
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW,
  costEnvelopeBand,
  costEnvelopePolicyFromValue,
  parseRunnerEnvironment,
  type CostEnvelopePolicy
} from "@debateai/register";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS,
  composePreviewProviderTestConfig,
  parsePreviewEnvironmentConfig,
  parsePreviewLineUp,
  parseProviderDiscoveryTargets,
  previewModelRow,
  previewTargetJsonRow,
  type PreviewLineUp,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import { codePromptContractHashes } from "../../apps/runner/src/index.js";
import { CostEnvelopeGuard } from "@debateai/budget";
import { createRunInFlight } from "../../apps/runner/src/run-in-flight.js";
import type { DevelopmentRunnerPolicy } from "../../apps/runner/src/dev-runner-policy.js";
import {
  assertPreviewVersionTargets,
  createRunnerSettingsCache,
  listRunnerSettingsPreload,
  loadRunnerVersionSettings,
  preloadRunnerSettings,
  resolvePreviewVersionConfig,
  runnerSettingsLine,
  runnerSettingsOfVersion,
  runnerSettingsSummary,
  type RunnerSiteContext,
  type RunnerVersionReaders,
  type RunnerVersionSettings
} from "../../apps/runner/src/run-settings.js";
import { validRunnerEnvironmentFixture } from "../support/apiEnvironmentFixture.js";

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
  requested_thinking_level: "high", scope_id: "run-settings-fixture",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock"
};
const TABLE = { [GLM]: { level: "high" }, [DEEPSEEK]: { level: "none" } };
/** The old six-key env form: the gate part plus a line-up (the fallback for a version without the row). */
const OLD_FORM = { ...SOCKETS, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU],
  thinking_levels: TABLE };
const OLD_ENV = parsePreviewEnvironmentConfig(JSON.stringify(OLD_FORM))!;
const SOCKETS_ONLY_ENV = parsePreviewEnvironmentConfig(JSON.stringify(SOCKETS))!;
/** A version's own line-up row, different from the env's (another free roster, no table). */
const ROW: PreviewLineUp = parsePreviewLineUp({ free_model_ids: [QWEN, HAIKU], premium_model_ids: [GLM, DEEPSEEK, QWEN, HAIKU],
  thinking_levels: null });

/** The six reviewed preview targets, exactly as the preview declares them. */
function reviewedTargets(refs: readonly string[] = PREVIEW_REVIEWED_PROVIDER_REFS): readonly ProviderDiscoveryTarget[] {
  return parseProviderDiscoveryTargets(JSON.stringify(refs.map((ref) => previewTargetJsonRow(ref))), refs.map((ref) => {
    const row = previewModelRow(previewTargetJsonRow(ref).model as string)!;
    return { providerRef: ref, maker: row.maker, adapterKind: row.adapterKind };
  }));
}

const bound = (tokenCeiling = 2048) => Object.freeze({ maxAttempts: 3, tokenCeiling, deadlineMs: 60000 });
/** A sentinel runner policy: each member a distinct object, the prompt hashes the code's own. */
function fakePolicy(change: Partial<Record<keyof DevelopmentRunnerPolicy, unknown>> = {}): DevelopmentRunnerPolicy {
  return Object.freeze({
    compositionRow: { sentinel: "compositionRow" },
    bounds: { JUDGE: bound(2048), COMPOSER: bound(1024), CONFORMANCE: bound(512) },
    compositionBudgets: { sentinel: "compositionBudgets" },
    candidateConfidenceBand: "sentinel-band",
    bandCeiling: { sentinel: "bandCeiling" },
    judgementPolicy: { sentinel: "judgementPolicy" },
    scoringOperator: { sentinel: "scoringOperator" },
    runDeathPolicy: { sentinel: "runDeathPolicy" },
    hiddenNodeScoreThreshold: { value: 0.25, sourceRef: "sentinel" },
    verdictLabelPolicy: { sentinel: "verdictLabelPolicy" },
    panelPolicy: { sentinel: "panelPolicy" },
    stoppingPolicy: { sentinel: "stoppingPolicy" },
    synthesisRolePolicy: {
      synthesizerRoleRef: "preview:fixture-a", evaluatorRoleRef: "preview:deepseek-v4-1-flash",
      synthesizerBound: bound(2048), evaluatorBound: bound(2048)
    },
    hashes: { ...codePromptContractHashes(), propagation: "p".repeat(64), serve: "s".repeat(64) },
    ...change
  }) as unknown as DevelopmentRunnerPolicy;
}

const COST_VALUE = COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value;
const envelope = (perRunCeilingMicros: number, sourceRef: string): CostEnvelopePolicy =>
  costEnvelopePolicyFromValue({ ...COST_VALUE, per_run_ceiling_micros: perRunCeilingMicros }, sourceRef);

type Call = readonly [name: string, version: number | null];
/**
 * Injected readers that record each call. A reader handed anything but `expected` (the version being loaded) throws, so
 * a loader that reads the site version for another version fails the test.
 */
function readers(expected: number, change: Partial<RunnerVersionReaders> = {}) {
  const calls: Call[] = [];
  const at = <T>(name: string, value: (version: number) => T | Promise<T>) => async (_pool: Pool, version: number) => {
    calls.push([name, version]);
    if (version !== expected) throw new Error(`READER_GOT_${version}_NOT_${expected}`);
    return value(version);
  };
  const base: RunnerVersionReaders = {
    readDevelopmentRunnerPolicy: at("readDevelopmentRunnerPolicy", () => fakePolicy()),
    readStoryPolicyFromRegister: at("readStoryPolicyFromRegister", () => null),
    readPreviewLineUpPolicy: at("readPreviewLineUpPolicy", () => null),
    readDebateShapeRunnerSettings: at("readDebateShapeRunnerSettings", () => null),
    readEngineRunnerSettings: at("readEngineRunnerSettings", () => null),
    readModelScorecard: async (_pool, version) => {
      calls.push(["readModelScorecard", version]);
      if (version !== expected) throw new Error(`READER_GOT_${version}_NOT_${expected}`);
      return { state: "ABSENT" };
    },
    readEngineVersion: async () => { calls.push(["readEngineVersion", null]); return "engine-fixture"; },
    readCostEnvelopePolicy: at("readCostEnvelopePolicy", () => envelope(250000, "version-row")),
    readCallConcurrencyPolicy: at("readCallConcurrencyPolicy", () => ({ state: "ABSENT" as const }))
  };
  const wrapped = Object.fromEntries(Object.entries(change).map(([name, reader]) => [name,
    async (...args: unknown[]) => {
      calls.push([name, typeof args[1] === "number" ? args[1] : null]);
      if (typeof args[1] === "number" && args[1] !== expected) throw new Error(`READER_GOT_${String(args[1])}_NOT_${expected}`);
      return (reader as (...inner: unknown[]) => unknown)(...args);
    }]));
  return { readers: Object.freeze({ ...base, ...wrapped }) as RunnerVersionReaders, calls, names: () => calls.map(([name]) => name) };
}

/** The fixture policy's synthesizer and evaluator refs (fakePolicy): the makers every fixture site configures. */
const FIXTURE_ROLE_REFS = Object.freeze(["preview:fixture-a", "preview:deepseek-v4-1-flash"]);
/** A site: local or hosted (with the site's band), with or without the preview's env part. */
function site(change: Partial<RunnerSiteContext> = {}): RunnerSiteContext {
  return Object.freeze({
    siteVersion: SITE_VERSION, deploymentMode: "local", preview: undefined, declaredProviderTargets: reviewedTargets(),
    siteCostEnvelopePolicy: null, envelopeBand: null,
    // Side-by-side spec §13 (S6): the claim time the gates price, and makers carrying the fixture policy's two roles.
    claim: { claimMs: 7200000, claimMarginMs: 1000 }, configuredMakerRefs: FIXTURE_ROLE_REFS, money: null, ...change
  });
}
const hostedPreviewSite = (change: Partial<RunnerSiteContext> = {}) => {
  const siteEnvelope = envelope(250000, "site-row");
  return site({ deploymentMode: "hosted", preview: OLD_ENV, siteCostEnvelopePolicy: siteEnvelope,
    envelopeBand: costEnvelopeBand(siteEnvelope), ...change });
};
/**
 * A hosted site off the preview whose targets serve the code's Free roster (PLAN_TIER_ROSTERS.free), so B9's first-call
 * check has a plan group to price (a roster no target wholly serves is skipped by firstCallsByPlanRoster).
 */
const priced = (providerRef: string, model: string): ProviderDiscoveryTarget => Object.freeze({
  providerRef, maker: `maker:${providerRef}`, baseUrl: "https://vendor.invalid/v1", model,
  inputPriceMicrosPerMillionTokens: 3000000, outputPriceMicrosPerMillionTokens: 15000000
});
const hostedSite = (siteEnvelope: CostEnvelopePolicy) => site({ deploymentMode: "hosted",
  declaredProviderTargets: PLAN_TIER_ROSTERS.free.map((model, index) => priced(`vendor:${index}`, model)),
  siteCostEnvelopePolicy: siteEnvelope, envelopeBand: costEnvelopeBand(siteEnvelope) });
const load = (version: number, at: RunnerSiteContext, injected: RunnerVersionReaders,
  options: Readonly<{ strict?: true; log?: (line: Readonly<Record<string, unknown>>) => void }> = {}) =>
  loadRunnerVersionSettings(POOL, version, at, { readers: injected, ...options });

describe("loadRunnerVersionSettings: one version, read as itself (side-by-side spec §13)", () => {
  it("reads every row main.ts read, in main.ts's order, each with the version asked and never the site version", async () => {
    const recorded = readers(VERSION);
    const settings = await load(VERSION, hostedPreviewSite(), recorded.readers);
    expect(recorded.names()).toEqual([
      "readDevelopmentRunnerPolicy",
      "readStoryPolicyFromRegister",
      // Addition D16: the line-up right after the story's rows, before the version's target checks.
      "readPreviewLineUpPolicy",
      "readDebateShapeRunnerSettings",
      "readEngineRunnerSettings",
      // The preview's scorecard conflict check (assertPreviewVersionTargets).
      "readEngineVersion", "readModelScorecard",
      // B9 (hosted, with the site's band): the version's own money row, then its scorecard for the plan groups.
      "readCostEnvelopePolicy", "readEngineVersion", "readModelScorecard",
      "readCallConcurrencyPolicy"
    ]);
    expect(recorded.calls.filter(([name]) => name !== "readEngineVersion").every(([, version]) => version === VERSION)).toBe(true);
    expect(settings.registerVersion).toBe(VERSION);
    expect(Object.isFrozen(settings)).toBe(true);
    // previewRunnerPolicy ran: the preview's token floor is on every organ bound.
    expect(settings.policy.bounds.JUDGE.tokenCeiling).toBe(8192);
    expect(settings.callLaneLimits).toEqual({ perDebate: 1, perModelPerDebate: 1 });
  });

  it("reads neither the scorecard nor the money row off the preview and without the hosted band", async () => {
    const recorded = readers(VERSION);
    const settings = await load(VERSION, site(), recorded.readers);
    expect(recorded.names()).toEqual(["readDevelopmentRunnerPolicy", "readStoryPolicyFromRegister", "readPreviewLineUpPolicy",
      "readDebateShapeRunnerSettings", "readEngineRunnerSettings", "readCallConcurrencyPolicy"]);
    expect(settings.previewConfig).toBeUndefined();
    // Off the preview the sealed bounds are kept as sealed.
    expect(settings.policy.bounds.JUDGE.tokenCeiling).toBe(2048);
  });

  it("refuses a reader handed the site version: the test's own control", async () => {
    const recorded = readers(SITE_VERSION);
    await expect(load(VERSION, site(), recorded.readers)).rejects.toThrow(`READER_GOT_${VERSION}_NOT_${SITE_VERSION}`);
  });

  it("propagates each refusal unchanged, and nothing after it is read", async () => {
    const typed = (code: string) => async () => { throw new TypedDomainError(code, "fixture"); };
    const hash = readers(VERSION, { readDevelopmentRunnerPolicy: async () => fakePolicy({
      hashes: { ...codePromptContractHashes(), judge: "0".repeat(64), propagation: "p".repeat(64), serve: "s".repeat(64) } }) });
    await expect(load(VERSION, site(), hash.readers)).rejects.toMatchObject({ code: "REGISTER_PROMPT_CONTRACT_HASH_MISMATCH" });
    expect(hash.names()).toEqual(["readDevelopmentRunnerPolicy"]);

    const shape = readers(VERSION, { readDebateShapeRunnerSettings: typed("DEBATE_SHAPE_MAP_HASH_UNSEALED") });
    await expect(load(VERSION, site(), shape.readers)).rejects.toMatchObject({ code: "DEBATE_SHAPE_MAP_HASH_UNSEALED" });
    expect(shape.names().at(-1)).toBe("readDebateShapeRunnerSettings");

    const engine = readers(VERSION, { readEngineRunnerSettings: typed("ENGINE_CONTRACT_HASH_MISMATCH") });
    await expect(load(VERSION, site(), engine.readers)).rejects.toMatchObject({ code: "ENGINE_CONTRACT_HASH_MISMATCH" });
    expect(engine.names().at(-1)).toBe("readEngineRunnerSettings");

    const scorecard = readers(VERSION, { readModelScorecard: async () => ({ state: "VALID" }) as never });
    await expect(load(VERSION, hostedPreviewSite(), scorecard.readers)).rejects.toMatchObject({ code: "PREVIEW_SCORECARD_CONFLICT" });
    expect(scorecard.names()).not.toContain("readCostEnvelopePolicy");

    const ceiling = readers(VERSION, { readCostEnvelopePolicy: async () => envelope(1, "version-row") });
    await expect(load(VERSION, hostedSite(envelope(250000, "site-row")), ceiling.readers))
      .rejects.toMatchObject({ code: "RUN_CEILING_BELOW_ONE_CALL" });
    expect(ceiling.names()).not.toContain("readCallConcurrencyPolicy");

    const lanes = readers(VERSION, { readCallConcurrencyPolicy: async () => { throw new TypeError("CALL_CONCURRENCY_POLICY_INVALID"); } });
    const refused = load(VERSION, site(), lanes.readers);
    await expect(refused).rejects.toBeInstanceOf(TypeError);
    await expect(refused).rejects.toThrow(/^CALL_CONCURRENCY_POLICY_INVALID$/u);
  });

  it("prices the first call against the VERSION's per-run ceiling over the site's day and band (composeDebateCostEnvelope)", async () => {
    // The site's own per-run ceiling would refuse; the version's debate member is what the check reads.
    const tiny = envelope(1, "site-row");
    await expect(load(VERSION, hostedSite(tiny), readers(VERSION).readers)).resolves.toMatchObject({ registerVersion: VERSION });
    // Control: the same site's own row as the version's refuses, so the check really prices this group.
    await expect(load(VERSION, hostedSite(tiny), readers(VERSION, { readCostEnvelopePolicy: async () => tiny }).readers))
      .rejects.toMatchObject({ code: "RUN_CEILING_BELOW_ONE_CALL" });
  });

  it("reads unreadable story rows as no story and one content-free line naming the version; strict refuses", async () => {
    const story = () => readers(VERSION, { readStoryPolicyFromRegister: async () => {
      throw new TypedDomainError("STORY_POLICY_INCOMPLETE", "fixture text that never reaches the line"); } });
    const lines: Readonly<Record<string, unknown>>[] = [];
    const settings = await load(VERSION, site(), story().readers, { log: (line) => { lines.push(line); } });
    expect(settings.storyPolicy).toBeNull();
    expect(lines).toEqual([{ kind: "DEBATEAI_STORY", event: "STORY_POLICY_UNREADABLE", code: "STORY_POLICY_INCOMPLETE",
      version: String(VERSION) }]);
    const strictLines: unknown[] = [];
    await expect(load(VERSION, site(), story().readers, { strict: true, log: (line) => { strictLines.push(line); } }))
      .rejects.toMatchObject({ code: "STORY_POLICY_INCOMPLETE" });
    expect(strictLines).toEqual([]);
  });
});

describe("the loader's last check and its money (side-by-side spec §13, S6)", () => {
  it("runs the claim-time gates last: a version that fails one is refused with the gate's own code, and the cache keeps it UNSUPPORTED", async () => {
    const refusals = [
      [fakePolicy({ judgementPolicy: undefined }), site(), "JUDGEMENT_POLICY_UNRESOLVED"],
      [fakePolicy({ panelPolicy: undefined }), site(), "PANEL_WEIGHTING_UNRESOLVED"],
      // A sealed role ref no maker of this runner carries (J24), and a claim too short for the version's deadlines.
      [fakePolicy(), site({ configuredMakerRefs: ["preview:fixture-a"] }), "SYNTHESIS_ROLE_PROVIDER_UNRESOLVED"],
      [fakePolicy(), site({ claim: { claimMs: 1000, claimMarginMs: 1000 } }), "CLAIM_BOUND_MISMATCH"]
    ] as const;
    for (const [policy, at, code] of refusals) {
      const recorded = readers(VERSION, { readDevelopmentRunnerPolicy: async () => policy });
      const refused = load(VERSION, at, recorded.readers);
      // Every one typed, by its code (the claim guard's TypeError included), so the cache can keep it.
      await expect(refused, code).rejects.toMatchObject({ code });
      await expect(refused, code).rejects.toBeInstanceOf(TypedDomainError);
      // Last: every read was made first.
      expect(recorded.names().at(-1), code).toBe("readCallConcurrencyPolicy");
      const cache = createRunnerSettingsCache({ load: (version) => load(version, at, readers(VERSION, {
        readDevelopmentRunnerPolicy: async () => policy }).readers), log: () => undefined });
      await expect(cache.settingsFor(VERSION), code).resolves.toEqual({ kind: "UNSUPPORTED", code });
    }
    // Control: the same version with every family and a long enough claim passes.
    await expect(load(VERSION, site(), readers(VERSION).readers)).resolves.toMatchObject({ registerVersion: VERSION });
  });

  it("hosted: the version's guard is built over the site's one store and in-flight counter, with the version's per-run ceiling", async () => {
    const store = { sentinel: "store" } as never;
    const inFlight = createRunInFlight();
    const siteEnvelope = envelope(250000, "site-row");
    const hosted = site({ ...hostedSite(siteEnvelope), money: { store, inFlight } });
    const version = await load(VERSION, hosted, readers(VERSION, {
      readCostEnvelopePolicy: async () => envelope(200000, "version-row") }).readers);
    expect(version.costEnvelope).not.toBeNull();
    expect(version.costEnvelope!.guard).toBeInstanceOf(CostEnvelopeGuard);
    // The version's per-run member over the site's day.
    expect(version.costEnvelope!.policy.perRunCeilingMicros).toBe(200000);
    expect(version.costEnvelope!.policy.dailyCeilingMicros).toBe(siteEnvelope.dailyCeilingMicros);
    // Local mode (no money) builds none, and reads no money row.
    const local = readers(VERSION);
    expect((await load(VERSION, site(), local.readers)).costEnvelope).toBeNull();
    expect(local.names()).not.toContain("readCostEnvelopePolicy");
    // Hosted without the site's money (a fixture that forgot it) builds none either: never a guard over no store.
    expect((await load(VERSION, hostedSite(siteEnvelope), readers(VERSION).readers)).costEnvelope).toBeNull();
  });

  it("hosted: a version whose story the site's day cannot hold beside one full run is refused (STORY_DAILY_CEILING_INSUFFICIENT)", async () => {
    const siteEnvelope = envelope(250000, "site-row");
    const hosted = site({ ...hostedSite(siteEnvelope), money: { store: {} as never, inFlight: createRunInFlight() } });
    const story = Object.freeze({ perStoryCeilingMicros: siteEnvelope.dailyCeilingMicros, perStoryOverrunBasisPoints: 0,
      storytellerRoleRef: "preview:fixture-a", storyCheckerRoleRef: "preview:deepseek-v4-1-flash" }) as never;
    await expect(load(VERSION, hosted, readers(VERSION, { readStoryPolicyFromRegister: async () => story }).readers))
      .rejects.toMatchObject({ code: "STORY_DAILY_CEILING_INSUFFICIENT" });
  });
});

describe("resolvePreviewVersionConfig: each version's own line-up (addition D14-D16)", () => {
  const environment = (value: unknown) => parseRunnerEnvironment({
    ...validRunnerEnvironmentFixture(), PREVIEW_PROVIDER_TEST_CONFIG_JSON: JSON.stringify(value) });
  const siteOf = (parsed: ReturnType<typeof environment>): RunnerSiteContext["preview"] =>
    parsed.PREVIEW_GATE_SETTINGS === undefined ? undefined
      : { gate: parsed.PREVIEW_GATE_SETTINGS, envLineUp: parsed.PREVIEW_ENV_LINE_UP ?? null };

  it("without a row keeps today's config byte for byte: the env's composition equals the parsed env config", () => {
    for (const form of [OLD_FORM, { ...SOCKETS, free_model_ids: [GLM], anthropic_budget_socket: undefined }]) {
      const value = JSON.parse(JSON.stringify(form)) as Record<string, unknown>;
      const parsed = environment(value);
      expect(parsed.PREVIEW_PROVIDER_TEST_CONFIG).toBeDefined();
      for (const isSiteVersion of [true, false]) {
        expect(resolvePreviewVersionConfig({ preview: siteOf(parsed), row: null, isSiteVersion }))
          .toStrictEqual(parsed.PREVIEW_PROVIDER_TEST_CONFIG);
      }
    }
  });

  it("a row on another version wins over the env's line-up; on the site version beside an old-form env it is refused", () => {
    const composed = resolvePreviewVersionConfig({ preview: OLD_ENV, row: ROW, isSiteVersion: false });
    expect(composed).toEqual(composePreviewProviderTestConfig(OLD_ENV.gate, ROW));
    expect(composed?.free_model_ids).toEqual([QWEN, HAIKU]);
    expect(composed?.thinking_levels).toBeUndefined();
    expect(() => resolvePreviewVersionConfig({ preview: OLD_ENV, row: ROW, isSiteVersion: true }))
      .toThrowError(expect.objectContaining({ code: "PREVIEW_LINE_UP_ENV_CONFLICT" }));
    // The sockets-only env beside a row: the row, on any version.
    expect(resolvePreviewVersionConfig({ preview: SOCKETS_ONLY_ENV, row: ROW, isSiteVersion: true }))
      .toEqual(composePreviewProviderTestConfig(SOCKETS_ONLY_ENV.gate, ROW));
  });

  it("refuses a sockets-only env without a row, and a row without the preview; neither is nothing", () => {
    for (const isSiteVersion of [true, false]) {
      expect(() => resolvePreviewVersionConfig({ preview: SOCKETS_ONLY_ENV, row: null, isSiteVersion }))
        .toThrowError(expect.objectContaining({ code: "PREVIEW_LINE_UP_REQUIRED" }));
      expect(() => resolvePreviewVersionConfig({ preview: undefined, row: ROW, isSiteVersion }))
        .toThrowError(expect.objectContaining({ code: "PREVIEW_LINE_UP_WITHOUT_PREVIEW" }));
      expect(resolvePreviewVersionConfig({ preview: undefined, row: null, isSiteVersion })).toBeUndefined();
    }
  });

  it("the loader keeps the resolved config on the version: the row's on a version that carries one", async () => {
    const recorded = readers(VERSION, { readPreviewLineUpPolicy: async () => ROW });
    const settings = await load(VERSION, site({ preview: OLD_ENV }), recorded.readers);
    expect(settings.previewConfig).toEqual(composePreviewProviderTestConfig(OLD_ENV.gate, ROW));
    const siteSettings = await load(SITE_VERSION, site({ preview: OLD_ENV }), readers(SITE_VERSION).readers);
    expect(siteSettings.previewConfig).toEqual(composePreviewProviderTestConfig(OLD_ENV.gate, OLD_ENV.envLineUp!));
  });
});

describe("assertPreviewVersionTargets: the version's rosters, seats and scorecard (addition D16, D19)", () => {
  const config = composePreviewProviderTestConfig(OLD_ENV.gate, ROW);
  const seats = (synthesizerRoleRef: string) => ({ synthesisRolePolicy: { synthesizerRoleRef, evaluatorRoleRef: "preview:fixture-a" } }) as never;
  it("passes a version whose rosters and seats the declared targets serve", () => {
    expect(() => assertPreviewVersionTargets({ previewConfig: config, declaredProviderTargets: reviewedTargets(),
      policy: seats("preview:qwen-3-8-flash"), storyPolicy: null, scorecardState: "ABSENT" })).not.toThrow();
  });
  it("refuses a roster model no declared target serves (the served half)", () => {
    const withoutQwen = reviewedTargets(PREVIEW_REVIEWED_PROVIDER_REFS.filter((ref) => ref !== "preview:qwen-3-8-flash"));
    expect(() => assertPreviewVersionTargets({ previewConfig: config, declaredProviderTargets: withoutQwen,
      policy: seats("preview:fixture-a"), storyPolicy: null, scorecardState: "ABSENT" }))
      .toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
  it("refuses a seat on an undeclared ref (the role half), the story's seats included", () => {
    expect(() => assertPreviewVersionTargets({ previewConfig: config, declaredProviderTargets: reviewedTargets(),
      policy: seats("preview:not-declared"), storyPolicy: null, scorecardState: "ABSENT" }))
      .toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(() => assertPreviewVersionTargets({ previewConfig: config, declaredProviderTargets: reviewedTargets(),
      policy: seats("preview:fixture-a"), scorecardState: "ABSENT",
      storyPolicy: { storytellerRoleRef: "preview:fixture-a", storyCheckerRoleRef: "preview:not-declared" } as never }))
      .toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
  it("refuses a version whose sealed scorecard is VALID (PREVIEW_SCORECARD_CONFLICT, unchanged)", () => {
    expect(() => assertPreviewVersionTargets({ previewConfig: config, declaredProviderTargets: reviewedTargets(),
      policy: seats("preview:fixture-a"), storyPolicy: null, scorecardState: "VALID" }))
      .toThrowError(expect.objectContaining({ code: "PREVIEW_SCORECARD_CONFLICT" }));
  });
});

describe("createRunnerSettingsCache: each version once, for the life of the process (side-by-side spec §13)", () => {
  const settingsOf = (version: number) => ({ registerVersion: version }) as unknown as RunnerVersionSettings;
  function cacheWith(load: (version: number) => Promise<RunnerVersionSettings>) {
    const lines: Readonly<Record<string, unknown>>[] = [];
    let loads = 0;
    const cache = createRunnerSettingsCache({ load: (version) => { loads += 1; return load(version); },
      log: (line) => { lines.push(line); } });
    return { cache, lines, loads: () => loads };
  }

  it("shares one load between concurrent asks, and `loaded` is undefined until it finished", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { cache, loads } = cacheWith(async (version) => { await gate; return settingsOf(version); });
    const first = cache.settingsFor(7);
    const second = cache.settingsFor(7);
    expect(cache.loaded(7)).toBeUndefined();
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({ kind: "SETTINGS", version: settingsOf(7) });
    expect(b).toBe(a);
    expect(loads()).toBe(1);
    expect(cache.loaded(7)).toEqual(settingsOf(7));
    await cache.settingsFor(7);
    expect(loads()).toBe(1);
    expect(cache.versions()).toEqual([{ version: 7, kind: "SETTINGS" }]);
  });

  it("keeps a typed refusal as UNSUPPORTED with its code, never loads it again, and requireSettings rethrows it", async () => {
    const refusal = new TypedDomainError("ENGINE_CONTRACT_HASH_MISMATCH", "fixture");
    const { cache, lines, loads } = cacheWith(async () => { throw refusal; });
    expect(await cache.settingsFor(9)).toEqual({ kind: "UNSUPPORTED", code: "ENGINE_CONTRACT_HASH_MISMATCH" });
    expect(await cache.settingsFor(9)).toEqual({ kind: "UNSUPPORTED", code: "ENGINE_CONTRACT_HASH_MISMATCH" });
    await expect(cache.requireSettings(9)).rejects.toBe(refusal);
    expect(loads()).toBe(1);
    expect(cache.loaded(9)).toBeUndefined();
    expect(cache.versions()).toEqual([{ version: 9, kind: "UNSUPPORTED" }]);
    expect(lines).toEqual([{ kind: "DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED", version: "9", code: "ENGINE_CONTRACT_HASH_MISMATCH" }]);
  });

  it("keeps a code-shaped TypeError as typed, and never keeps an untyped failure: the next ask loads again", async () => {
    const typeRefusal = cacheWith(async () => { throw new TypeError("CALL_CONCURRENCY_POLICY_INVALID"); });
    expect(await typeRefusal.cache.settingsFor(4)).toEqual({ kind: "UNSUPPORTED", code: "CALL_CONCURRENCY_POLICY_INVALID" });
    let fail = true;
    const connection = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
    const flaky = cacheWith(async (version) => { if (fail) throw connection; return settingsOf(version); });
    await expect(flaky.cache.settingsFor(5)).rejects.toBe(connection);
    await expect(flaky.cache.requireSettings(5)).rejects.toBe(connection);
    expect(flaky.cache.versions()).toEqual([]);
    expect(flaky.lines).toEqual([]);
    fail = false;
    expect(await flaky.cache.settingsFor(5)).toEqual({ kind: "SETTINGS", version: settingsOf(5) });
    expect(flaky.loads()).toBe(3);
    // A runtime TypeError in prose is untyped too.
    const prose = cacheWith(async () => { throw new TypeError("Cannot read properties of undefined (reading 'x')"); });
    await expect(prose.cache.settingsFor(6)).rejects.toThrow("Cannot read properties");
    expect(prose.cache.versions()).toEqual([]);
  });

  it("the line-up refusals: another version's is UNSUPPORTED (cached), the site version's refuses the boot", async () => {
    const lineUpCache = (preview: RunnerSiteContext["preview"], row: PreviewLineUp | null) => {
      const at = site({ preview });
      return createRunnerSettingsCache({ log: () => undefined,
        load: (version) => loadRunnerVersionSettings(POOL, version, at,
          { readers: readers(version, { readPreviewLineUpPolicy: async () => row }).readers }) });
    };
    const required = lineUpCache(SOCKETS_ONLY_ENV, null);
    expect(await required.settingsFor(VERSION)).toEqual({ kind: "UNSUPPORTED", code: "PREVIEW_LINE_UP_REQUIRED" });
    await expect(required.requireSettings(SITE_VERSION)).rejects.toMatchObject({ code: "PREVIEW_LINE_UP_REQUIRED" });
    expect(required.versions()).toEqual([{ version: SITE_VERSION, kind: "UNSUPPORTED" }, { version: VERSION, kind: "UNSUPPORTED" }]);
    const withoutPreview = lineUpCache(undefined, ROW);
    expect(await withoutPreview.settingsFor(VERSION)).toEqual({ kind: "UNSUPPORTED", code: "PREVIEW_LINE_UP_WITHOUT_PREVIEW" });
    await expect(withoutPreview.requireSettings(SITE_VERSION)).rejects.toMatchObject({ code: "PREVIEW_LINE_UP_WITHOUT_PREVIEW" });
    // D15: the env conflict is the site version's alone; another version's row simply wins.
    const conflict = lineUpCache(OLD_ENV, ROW);
    await expect(conflict.requireSettings(SITE_VERSION)).rejects.toMatchObject({ code: "PREVIEW_LINE_UP_ENV_CONFLICT" });
    expect(await conflict.settingsFor(VERSION)).toMatchObject({ kind: "SETTINGS" });
  });
});

describe("a database failure is never a settings refusal (rulings R31, R32)", () => {
  const servers: Server[] = [];
  const sockets: Socket[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const socket of sockets.splice(0)) socket.destroy();
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  });
  /** A port that refuses (a database that is down), or a server that accepts and never answers (a busy pool). */
  async function databaseUrl(kind: "refused" | "silent"): Promise<string> {
    const server = createServer((socket) => { sockets.push(socket); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new TypeError("TEST_SERVER_ADDRESS");
    if (kind === "refused") await new Promise((resolve) => server.close(resolve));
    else servers.push(server);
    return `postgresql://nobody@127.0.0.1:${address.port}/none`;
  }
  /** A cache over the REAL readers on the house pool (createPool), counting its loads. */
  function poolCache(pool: Pool) {
    let loads = 0;
    const lines: unknown[] = [];
    const cache = createRunnerSettingsCache({ log: (line) => { lines.push(line); },
      load: (version) => { loads += 1; return loadRunnerVersionSettings(pool, version, site()); } });
    return { cache, lines, loads: () => loads };
  }

  it("a refused connection (the pool's typed DATABASE_POOL_FAILED) is not kept: the next ask loads again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pool = createPool(await databaseUrl("refused"), { max: 1, connectionTimeoutMillis: 1000, name: "test:refused" });
    try {
      const { cache, lines, loads } = poolCache(pool);
      await expect(cache.settingsFor(VERSION)).rejects.toMatchObject({ code: "DATABASE_POOL_FAILED" });
      await expect(cache.requireSettings(VERSION)).rejects.toMatchObject({ code: "DATABASE_POOL_FAILED" });
      expect(loads()).toBe(2);
      expect(cache.versions()).toEqual([]);
      expect(lines).toEqual([]);
    } finally {
      await pool.end().catch(() => undefined);
    }
  });

  it("a busy pool (marked busy at its origin) is not kept either", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pool = createPool(await databaseUrl("silent"), { max: 1, connectionTimeoutMillis: 150, name: "test:busy" });
    try {
      const { cache, loads } = poolCache(pool);
      const failure = await cache.settingsFor(VERSION).then(() => undefined, (error: unknown) => error);
      expect(isDatabasePoolBusy(failure)).toBe(true);
      await expect(cache.settingsFor(VERSION)).rejects.toMatchObject({ code: "DATABASE_POOL_FAILED" });
      expect(loads()).toBe(2);
      expect(cache.versions()).toEqual([]);
    } finally {
      await pool.end().catch(() => undefined);
    }
  });

  it("the pool's code by itself or as a cause is not kept; a real settings code beside it still is", async () => {
    const pooled = new TypedDomainError("DATABASE_POOL_FAILED", "PostgreSQL pool operation failed: connection terminated");
    const wrapped = Object.assign(new TypedDomainError("RUN_READ_FAILED", "fixture"), { cause: pooled });
    for (const failure of [pooled, wrapped]) {
      let loads = 0;
      const cache = createRunnerSettingsCache({ log: () => undefined, load: async () => { loads += 1; throw failure; } });
      await expect(cache.settingsFor(3)).rejects.toBe(failure);
      await expect(cache.settingsFor(3)).rejects.toBe(failure);
      expect(loads).toBe(2);
      expect(cache.versions()).toEqual([]);
    }
    let loads = 0;
    const refusal = createRunnerSettingsCache({ log: () => undefined, load: async () => {
      loads += 1; throw new TypedDomainError("DEBATE_SHAPE_MAP_HASH_UNSEALED", "fixture"); } });
    expect(await refusal.settingsFor(3)).toEqual({ kind: "UNSUPPORTED", code: "DEBATE_SHAPE_MAP_HASH_UNSEALED" });
    expect(await refusal.settingsFor(3)).toEqual({ kind: "UNSUPPORTED", code: "DEBATE_SHAPE_MAP_HASH_UNSEALED" });
    expect(loads).toBe(1);
  });

  it("a story read that fails on the database propagates (never `no story`, never kept); a typed story refusal is still no story", async () => {
    const pooled = new TypedDomainError("DATABASE_POOL_FAILED", "PostgreSQL pool operation failed: connection terminated");
    const lines: unknown[] = [];
    for (const failure of [pooled, new Error("connection terminated unexpectedly")]) {
      const blip = readers(VERSION, { readStoryPolicyFromRegister: async () => { throw failure; } });
      await expect(load(VERSION, site(), blip.readers, { log: (line) => { lines.push(line); } })).rejects.toBe(failure);
      expect(blip.names()).not.toContain("readPreviewLineUpPolicy");
    }
    expect(lines).toEqual([]);
    let fail = true;
    let loads = 0;
    const cache = createRunnerSettingsCache({ log: () => undefined, load: (version) => { loads += 1;
      return load(version, site(), readers(version, { readStoryPolicyFromRegister: async () => {
        if (fail) throw pooled; return null; } }).readers); } });
    await expect(cache.settingsFor(VERSION)).rejects.toBe(pooled);
    fail = false;
    expect(await cache.settingsFor(VERSION)).toMatchObject({ kind: "SETTINGS" });
    expect(loads).toBe(2);
    // A typed refusal of the story's rows keeps today's behaviour, a code-shaped TypeError included.
    const typed = readers(VERSION, { readStoryPolicyFromRegister: async () => { throw new TypeError("STORY_POLICY_REGISTER_VERSION_INVALID"); } });
    const typedLines: Readonly<Record<string, unknown>>[] = [];
    expect((await load(VERSION, site(), typed.readers, { log: (line) => { typedLines.push(line); } })).storyPolicy).toBeNull();
    expect(typedLines).toEqual([{ kind: "DEBATEAI_STORY", event: "STORY_POLICY_UNREADABLE",
      code: "STORY_POLICY_REGISTER_VERSION_INVALID", version: String(VERSION) }]);
  });
});

describe("runnerSettingsOfVersion: the debate members of one version, written once (spec §13 runner point 7)", () => {
  it("stamps the facts with the version and takes every member from that version's bundle, and nothing else", async () => {
    const shape = Object.freeze({ mapContractHash: "m".repeat(64) });
    const engine = Object.freeze({ engineContractHash: "e".repeat(64) });
    const storyPolicy = Object.freeze({ sentinel: "storyPolicy" }) as never;
    const recorded = readers(VERSION, {
      readDebateShapeRunnerSettings: async () => shape,
      readEngineRunnerSettings: async () => engine,
      readStoryPolicyFromRegister: async () => storyPolicy,
      readCallConcurrencyPolicy: async () => ({ state: "SET" as const,
        policy: { perDebate: 12, perModelPerDebate: 3, perModelPerRunner: { default: 50 } } })
    });
    const version = await load(VERSION, site(), recorded.readers);
    const { policy } = version;
    const members = runnerSettingsOfVersion(version);
    expect(members).toEqual({
      judgeBound: policy.bounds.JUDGE, composerBound: policy.bounds.COMPOSER, conformanceBound: policy.bounds.CONFORMANCE,
      judgeContractHash: policy.hashes.judge, composerContractHash: policy.hashes.composer,
      conformanceContractHash: policy.hashes.conformance, propagationContractHash: policy.hashes.propagation,
      serveContractHash: policy.hashes.serve,
      factBundleVersion: VERSION,
      compositionRow: policy.compositionRow,
      servePolicy: { compositionBudgets: policy.compositionBudgets, candidateConfidenceBand: policy.candidateConfidenceBand,
        bandCeiling: policy.bandCeiling },
      judgementPolicy: policy.judgementPolicy, scoringOperator: policy.scoringOperator, runDeathPolicy: policy.runDeathPolicy,
      hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold, verdictLabelPolicy: policy.verdictLabelPolicy,
      panelPolicy: policy.panelPolicy, stoppingPolicy: policy.stoppingPolicy, synthesisRolePolicy: policy.synthesisRolePolicy,
      debateShape: shape, engine, storyPolicy, callLaneLimits: { perDebate: 12, perModelPerDebate: 3 }
    });
    // The same objects, not copies: one source.
    expect(members.compositionRow).toBe(policy.compositionRow);
    expect(members.debateShape).toBe(shape);
    expect(Object.isFrozen(members)).toBe(true);
    // Addition SA4 test 5: the line-up is not a runner member (the engine never reads the rosters; the gateways read the table).
    const preview = await load(VERSION, site({ preview: OLD_ENV }), readers(VERSION).readers);
    expect(preview.previewConfig).toBeDefined();
    expect(Object.keys(runnerSettingsOfVersion(preview))).toEqual(Object.keys(members));
    expect(Object.keys(members)).not.toContain("previewConfig");
  });
});

describe("the boot preload: open debates' and passed versions, never the pointer (side-by-side spec §13 runner point 3, S8)", () => {
  const KEY = ["r17", "0123456789ab"].join("-");
  const PASSED_SQL = "SELECT passed::integer AS register_version FROM register.read_passed_settings_versions($1) AS passed";
  const settingsOf = (version: number) => ({ registerVersion: version }) as unknown as RunnerVersionSettings;
  function sources(open: readonly number[], passed: readonly number[], releaseKey = KEY) {
    const asked: unknown[][] = [];
    const listed: string[] = [];
    const pool = { query: vi.fn(async (sql: string, values: unknown[]) => {
      asked.push([sql, values]);
      return { rows: passed.map((version) => ({ register_version: version })) };
    }) } as unknown as Pool;
    const work = { listOpenRunSettingsVersions: async (key: string) => { listed.push(key); return open; } };
    return { pool, work, releaseKey, siteVersion: SITE_VERSION, asked, listed };
  }

  it("is the sorted, distinct union of the site version, the open debates' versions and the passed versions", async () => {
    const input = sources([19, 17, 18, 19], [21, 17, 18]);
    const versions = await listRunnerSettingsPreload(input);
    expect(versions).toEqual([17, 18, 19, 21]);
    expect(Object.isFrozen(versions)).toBe(true);
    expect(input.listed).toEqual([KEY]);
    expect(input.asked).toEqual([[PASSED_SQL, [KEY]]]);
    // Nothing open and nothing passed: the site version alone.
    expect(await listRunnerSettingsPreload(sources([], []))).toEqual([SITE_VERSION]);
  });

  it("a legacy process preloads its site version only, asking neither source (legacy runs are never listed)", async () => {
    const input = sources([18], [19], LEGACY_RELEASE_KEY);
    expect(await listRunnerSettingsPreload(input)).toEqual([SITE_VERSION]);
    expect(input.listed).toEqual([]);
    expect(input.asked).toEqual([]);
  });

  it("the battery lists the fenced release's READY and CLAIMED runs' versions; legacy without a query; never another release's", async () => {
    const queries: unknown[][] = [];
    const pool = { query: vi.fn(async (sql: string, values: unknown[]) => {
      queries.push([sql, values]);
      return { rows: [{ register_version: 17 }, { register_version: 18 }] };
    }) } as unknown as Pool;
    expect(await new WorkItemRepository(pool, { releaseKey: KEY }).listOpenRunSettingsVersions(KEY)).toEqual([17, 18]);
    expect(queries).toHaveLength(1);
    const [sql, values] = queries[0] as [string, unknown[]];
    expect(values).toEqual([KEY]);
    const flatSql = sql.replace(/\s+/gu, " ");
    expect(flatSql).toContain("SELECT DISTINCT run.register_version::integer AS register_version FROM core.work_item AS item JOIN core.run AS run ON run.run_id = item.run_id");
    expect(flatSql).toContain("WHERE item.state IN ('READY','CLAIMED') AND run.release_key = $1");
    // Legacy: nothing, and no query.
    expect(await new WorkItemRepository(pool).listOpenRunSettingsVersions(LEGACY_RELEASE_KEY)).toEqual([]);
    expect(queries).toHaveLength(1);
    // Spec §3: a fenced repository reads only its own release's work.
    const other = ["r18", "0123456789ab"].join("-");
    await expect(new WorkItemRepository(pool, { releaseKey: KEY }).listOpenRunSettingsVersions(other))
      .rejects.toThrow("WORK_ITEM_FENCE_RELEASE_MISMATCH");
    await expect(new WorkItemRepository(pool).listOpenRunSettingsVersions(KEY)).rejects.toThrow("WORK_ITEM_FENCE_RELEASE_MISMATCH");
    expect(queries).toHaveLength(1);
  });

  it("loads every listed version through the cache: an unsupported one is one loud line and the boot goes on", async () => {
    const lines: Readonly<Record<string, unknown>>[] = [];
    const loads: number[] = [];
    const cache = createRunnerSettingsCache({
      load: async (version) => {
        loads.push(version);
        if (version === 19) throw new TypedDomainError("ENGINE_CONTRACT_HASH_MISMATCH", "fixture");
        return settingsOf(version);
      },
      log: (line) => { lines.push(line); }
    });
    await cache.settingsFor(SITE_VERSION);
    const preload = await preloadRunnerSettings({ ...sources([19, 18], [18, 17]), cache });
    expect(preload).toEqual({ releaseKey: KEY, siteVersion: SITE_VERSION, loaded: [17, 18],
      unsupported: [{ version: 19, code: "ENGINE_CONTRACT_HASH_MISMATCH" }] });
    expect(Object.isFrozen(preload)).toBe(true);
    // The site version was already loaded (the boot's requireSettings): each version once, in order.
    expect(loads).toEqual([17, 18, 19]);
    expect(cache.loaded(18)).toEqual(settingsOf(18));
    expect(lines).toEqual([{ kind: "DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED", version: "19", code: "ENGINE_CONTRACT_HASH_MISMATCH" }]);
    expect(runnerSettingsLine(preload)).toBe(`DEBATEAI_RUNNER_SETTINGS {"releaseKey":"${KEY}","siteVersion":"17",`
      + `"loaded":["17","18"],"unsupported":[{"version":"19","code":"ENGINE_CONTRACT_HASH_MISMATCH"}]}\n`);
    expect(runnerSettingsSummary(preload)).toEqual({ releaseKey: KEY, siteVersion: "17", loaded: ["17", "18"],
      unsupported: [{ version: "19", code: "ENGINE_CONTRACT_HASH_MISMATCH" }] });
    expect(runnerSettingsLine({ releaseKey: KEY, siteVersion: 17, loaded: [17, 18], unsupported: [] }))
      .toBe(`DEBATEAI_RUNNER_SETTINGS {"releaseKey":"${KEY}","siteVersion":"17","loaded":["17","18"],"unsupported":[]}\n`);
  });

  it("a database failure refuses the boot: in either listing, or in a version's load (never kept, ruling R31)", async () => {
    const connection = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
    const cacheOf = (load: (version: number) => Promise<RunnerVersionSettings>) => createRunnerSettingsCache({ load, log: () => undefined });
    const fine = cacheOf(async (version) => settingsOf(version));
    const listing = sources([18], []);
    await expect(preloadRunnerSettings({ ...listing, work: { listOpenRunSettingsVersions: async () => { throw connection; } }, cache: fine }))
      .rejects.toBe(connection);
    const passing = sources([18], []);
    (passing.pool.query as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(connection);
    await expect(preloadRunnerSettings({ ...passing, cache: fine })).rejects.toBe(connection);
    let fail = true;
    const flaky = cacheOf(async (version) => { if (version === 18 && fail) throw connection; return settingsOf(version); });
    await expect(preloadRunnerSettings({ ...sources([18], []), cache: flaky })).rejects.toBe(connection);
    expect(flaky.versions()).toEqual([{ version: 17, kind: "SETTINGS" }]);
    fail = false;
    expect((await preloadRunnerSettings({ ...sources([18], []), cache: flaky })).loaded).toEqual([17, 18]);
  });

  it("neither run-settings.ts nor main.ts names the activation pointer or its table (S16 pins every runner file)", () => {
    for (const file of ["apps/runner/src/run-settings.ts", "apps/runner/src/main.ts"]) {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      expect(source, file).not.toContain("read_active_settings_version");
      expect(source, file).not.toContain("settings_activation");
      expect(source, file).not.toMatch(/activeSettingsVersion|readActiveSettings/u);
    }
  });

  it("main.ts preloads after the site version, under its release fence, before the team gate; the settings line follows the unchanged ready line", () => {
    const main = readFileSync(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    const site = main.indexOf("const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);");
    const preload = main.indexOf("const runnerSettingsPreload = await preloadRunnerSettings({");
    const fence = main.indexOf("const workFence = Object.freeze(");
    const gate = main.indexOf("await refusePreviewOutsiderWork(");
    const ready = main.indexOf("announceRunnerReady({");
    const line = main.indexOf("process.stdout.write(runnerSettingsLine(runnerSettingsPreload));");
    const resend = main.indexOf("startLapsedClaimResend({");
    expect(site).toBeGreaterThan(0);
    expect(site).toBeLessThan(fence); expect(fence).toBeLessThan(preload); expect(preload).toBeLessThan(gate);
    expect(gate).toBeLessThan(ready); expect(ready).toBeLessThan(line); expect(line).toBeLessThan(resend);
    expect(main.split("preloadRunnerSettings(")).toHaveLength(2);
    expect(main.slice(preload, gate).replace(/\s+/gu, " ")).toContain("cache: runnerSettings, pool, work: new WorkItemRepository(pool, workFence), releaseKey: environment.RELEASE_KEY, siteVersion: environment.REGISTER_VERSION");
    // DEBATEAI_RUNNER_READY is unchanged (the preview's handshake reads it): the same five members.
    expect(main.slice(ready, line).replace(/\s+/gu, " ")).toContain("announceRunnerReady({ kind: \"DEBATEAI_RUNNER_READY\", worker: environment.HATCHET_WORKER_NAME, registerVersion: String(environment.REGISTER_VERSION),");
  });

  it("the practice runner preloads exactly as main.ts, right after its site version, and logs the settings line", () => {
    const practice = readFileSync(new URL("../../tools/preview-practice/practice-runner-composition.ts", import.meta.url), "utf8");
    const site = practice.indexOf("const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);");
    const preload = practice.indexOf("const runnerSettingsPreload = await preloadRunnerSettings({");
    expect(site).toBeGreaterThan(0);
    expect(site).toBeLessThan(preload);
    expect(practice.split("preloadRunnerSettings(")).toHaveLength(2);
    const flatPractice = practice.replace(/\s+/gu, " ");
    expect(flatPractice).toContain("cache: runnerSettings, pool, work: new WorkItemRepository(pool, { releaseKey: environment.RELEASE_KEY }), releaseKey: environment.RELEASE_KEY, siteVersion: environment.REGISTER_VERSION");
    expect(flatPractice).toContain("settingsLog({ kind: \"DEBATEAI_RUNNER_SETTINGS\", ...runnerSettingsSummary(runnerSettingsPreload) });");
  });
});
