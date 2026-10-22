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
 * - `runnerSettingsOfVersion` maps one version's debate members, written once.
 */
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";
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
import type { DevelopmentRunnerPolicy } from "../../apps/runner/src/dev-runner-policy.js";
import {
  assertPreviewVersionTargets,
  createRunnerSettingsCache,
  loadRunnerVersionSettings,
  resolvePreviewVersionConfig,
  runnerSettingsOfVersion,
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

/** A site: local or hosted (with the site's band), with or without the preview's env part. */
function site(change: Partial<RunnerSiteContext> = {}): RunnerSiteContext {
  return Object.freeze({
    siteVersion: SITE_VERSION, deploymentMode: "local", preview: undefined, declaredProviderTargets: reviewedTargets(),
    siteCostEnvelopePolicy: null, envelopeBand: null, ...change
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
          .toEqual(parsed.PREVIEW_PROVIDER_TEST_CONFIG);
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
