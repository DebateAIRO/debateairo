import type { Pool } from "pg";
import { EntitlementRepository, PostgresInternalAllowanceRepository, settingsRefusalCode } from "@debateai/db";
import { LEGACY_RELEASE_KEY, TypedDomainError } from "@debateai/kernel";
import {
  composeDebateCostEnvelope,
  costEnvelopeBand,
  costEnvelopeCeilings,
  debateCallLaneLimits,
  readBillingPlans,
  readCallConcurrencyPolicy,
  readCostEnvelopePolicy,
  readEngineContractHash,
  readEngineVersion,
  readMapContractHash,
  readModelScorecard,
  readPreviewLineUpPolicy,
  readStoryPolicyFromRegister,
  type CallConcurrencyPolicyState,
  type CostEnvelopeBand,
  type CostEnvelopePolicy,
  type DeploymentMode,
  type ModelScorecardReadResult,
  type PlanId,
  type StoryPolicy
} from "@debateai/register";
import {
  CostEnvelopeGuard,
  PostgresModelSpendStore,
  assertRunCeilingCoversOneCall,
  costEnvelopeGuardPolicy,
  type SharedWallInput
} from "@debateai/budget";
import { BillingPersonAllowanceSource, FundingAwarePersonAllowanceSource } from "@debateai/billing-core";
import { PLAN_TIER_ROSTERS, askQuestionMaxBytes } from "@debateai/contract";
import { readDeploymentMakerCapability } from "@debateai/critique";
import { firstCallsByPlanRoster, firstPositionCallProjections } from "@debateai/judgement";
import { mapPromptContractHash } from "@debateai/map";
import { firstCallPlanModels } from "@debateai/scorecard";
import {
  assertDeploymentProviderTargets,
  assertPreviewRoleTargets,
  assertPreviewRostersServed,
  assertPreviewTargetSet,
  assertPricedProviderTargets,
  createPerplexitySearchPort,
  parseProviderDiscoveryTargets,
  previewGateSocket,
  previewPlanTierRosters,
  previewRunnerPolicy,
  resolvePreviewLineUp,
  type PreviewGateSettings,
  type PreviewLineUp,
  type PreviewProviderTestConfig,
  type PreviewThinkingLevels,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import { assertRegisterPromptContractHashes, assertRunnerSettingsGates, plansUnresolvedPersonAllowance, settingsJournalCode, type WalkingSkeletonSettings } from "./index.js";
import { engineContractHash } from "./engine-contracts.js";
import { runnerConfiguredMakerRefs } from "./provider-topology.js";
import type { RunInFlight } from "./run-in-flight.js";
import { runnerSettingsOfVersion } from "./run-debate-members.js";
import { readDebateShapeRunnerSettings, type DebateShapeRunnerSettings } from "./debate-shape-boot.js";
import { readEngineRunnerSettings, type EngineRunnerSettings } from "./engine-boot.js";
import { readDevelopmentRunnerPolicy, type DevelopmentRunnerPolicy } from "./dev-runner-policy.js";
import { selectPathPages } from "@debateai/evidence";
import { searchCallSubject } from "./call-lane-gateway.js";
import type { RecordPlanPathStatuses, WebStepRunnerSettings } from "./web-step.js";

/**
 * Side-by-side spec §13 (settings changes without an upload), runner points 1, 2 and 7: the runner's ONE per-version
 * settings loader and its cache.
 *
 * Plain words: everything the runner reads from one sealed settings version (the runner policy and its prompt
 * fingerprints, the story's rows, the preview's AI line-up, the debate shape, the engine, the debate's call lanes) is
 * read here, by one function, for the version asked, and kept for the life of the process: a sealed version never
 * changes. apps/runner/src/main.ts and the preview practice (tools/preview-practice/practice-runner-composition.ts) both
 * boot through it, so the two cannot read a version differently. The boot loads the site version (REGISTER_VERSION);
 * every debate then runs on its own stamped version (S6: `WalkingSkeletonSettings.settingsForVersion`).
 *
 * The SITE members (what follows the release, not the debate: the deployment mode, the declared provider targets, the
 * day's money ceiling and its band, the gate part of the preview configuration, the money every version's guard shares)
 * are read once at boot by `readRunnerSiteContext` (below; S14: main.ts, the practice and check-version's runner half
 * all read them through it), outside the loader, and handed in as `RunnerSiteContext`. The loader never reads them
 * from a version.
 */

/** Side-by-side spec §13: what the runner knows of its release, read once at boot from the site version and env. */
export type RunnerSiteContext = Readonly<{
  siteVersion: number;
  deploymentMode: "local" | "hosted";
  /**
   * Addition D14-D16: the preview configuration's env part (parsePreviewEnvironmentConfig): the gate part, and the old
   * forms' line-up (null for the sockets-only form). Undefined off the preview.
   */
  preview: Readonly<{ gate: PreviewGateSettings; envLineUp: PreviewLineUp | null }> | undefined;
  declaredProviderTargets: readonly ProviderDiscoveryTarget[];
  /** Hosted only (null in local mode): the site version's costEnvelopePolicy row. Its day and its band are site members. */
  siteCostEnvelopePolicy: CostEnvelopePolicy | null;
  envelopeBand: CostEnvelopeBand | null;
  /**
   * Side-by-side spec §13 (S6): the claim time and its margin (env CLAIM_MS, CLAIM_MARGIN_MS) and this runner's makers'
   * provider refs (`runnerConfiguredMakerRefs`), so the loader runs the claim-time gates (`assertRunnerSettingsGates`)
   * over each version it loads: a version that fails one is UNSUPPORTED at load, never a debate refused at claim.
   */
  claim: Readonly<{ claimMs: number; claimMarginMs: number }>;
  configuredMakerRefs: readonly string[];
  /**
   * Side-by-side spec §13 runner point 4 (S6), hosted only (null in local mode): the money this process shares across
   * every version's guard — ONE spend store, ONE in-flight counter (the money guard's, never the gateway's) and ONE
   * shared wall (the site's day at the band's finish edge, every person's windows) with the funding admission. Each
   * version's guard adds only its own per-run ceilings and story ceiling.
   */
  money: Readonly<{
    store: PostgresModelSpendStore;
    inFlight: RunInFlight;
    sharedWall?: SharedWallInput;
    fundingAdmission?: FundingAwarePersonAllowanceSource;
  }> | null;
}>;

/**
 * Side-by-side spec §13 (S14): the environment keys the runner's site reads use. A full runner environment
 * (`loadRunnerEnvironment()`) and the practice's runner settings (tools/preview-practice) both fit it.
 */
export type RunnerSiteEnvironment = Readonly<{
  REGISTER_VERSION: number;
  DEPLOYMENT_MODE: DeploymentMode;
  NODE_ENV?: string | undefined;
  PROVIDER_DISCOVERY_TARGETS_JSON?: string | undefined;
  /** Addition D14-D16: the preview configuration's gate part; undefined off the preview. */
  PREVIEW_GATE_SETTINGS: PreviewGateSettings | undefined;
  /** Addition D14: the old env forms' line-up (null for the sockets-only form; absent off the preview). */
  PREVIEW_ENV_LINE_UP?: PreviewLineUp | null | undefined;
  CLAIM_MS: number;
  CLAIM_MARGIN_MS: number;
}>;

/** What `readRunnerSiteContext` read: the site context, and the two facts the practice's report also states. */
export type RunnerSiteReads = Readonly<{
  site: RunnerSiteContext;
  /** The register's configured providers at the site version (`readDeploymentMakerCapability`). */
  configuredProviders: Awaited<ReturnType<typeof readDeploymentMakerCapability>>["configuredProviders"];
  /** Hosted: the site version sealed a billingPlans row (else the person wall fails closed, PLANS_UNRESOLVED). */
  billingPlansSealed: boolean;
}>;

/**
 * Side-by-side spec §13 (S14) — THE RUNNER'S SITE READS, ONCE, IN ONE PLACE. Everything main.ts read at boot that follows
 * the release and not a debate, moved here so apps/runner/src/main.ts, the preview practice
 * (tools/preview-practice/practice-runner-composition.ts) and `check-version`'s runner half (./settings-check.ts) build
 * the context the same way, statement for statement:
 *  - the declared provider targets (PROVIDER_DISCOVERY_TARGETS_JSON over the register's configured providers), with the
 *    mode decision taken on what the operator DECLARED (V-9(c): `assertDeploymentProviderTargets`), a hosted debate
 *    target's price (V-28: `assertPricedProviderTargets`) and, on the preview, the reviewed provider set (addition D16:
 *    `assertPreviewTargetSet`; the rosters, roles and scorecard are each version's, the loader's). No credential file
 *    is read here: credentials are resolved by main.ts after the site version has loaded;
 *  - hosted only: the site's costEnvelopePolicy row and its band, the billingPlans row (B9b, amendment A20: never
 *    billingPolicy), and THE MONEY every version's guard shares (`RunnerSiteContext.money`): one spend store, the money
 *    guard's in-flight counter (`moneyInFlight`, created by the caller beside the gateway's own: two counters, never
 *    one, ruling R15) and the B9 shared wall with the funding admission (side-by-side spec §9: no funding read and no
 *    funding refusal at boot).
 * Nothing here writes: every constructor below only holds the pool. A refusal propagates with its own code, so a boot
 * refuses as before and the check records the code.
 */
export async function readRunnerSiteContext(input: Readonly<{
  pool: Pool;
  environment: RunnerSiteEnvironment;
  moneyInFlight: RunInFlight;
}>): Promise<RunnerSiteReads> {
  const { pool, environment, moneyInFlight } = input;
  // Addition D14 / ruling R25: "is this the preview?" keys on the env's gate part, present for every accepted form.
  const previewGate = environment.PREVIEW_GATE_SETTINGS;
  const deploymentMakers = await readDeploymentMakerCapability(pool, environment.REGISTER_VERSION);
  if (environment.PROVIDER_DISCOVERY_TARGETS_JSON === undefined) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_REQUIRED");
  }
  const declaredProviderTargets = parseProviderDiscoveryTargets(
    environment.PROVIDER_DISCOVERY_TARGETS_JSON,
    deploymentMakers.configuredProviders
  );
  // The mode decision is taken on what the operator DECLARED, before any credential
  // is resolved: that is what makes an inline `authorization_header` refusable in
  // hosted mode even though a resolved target legitimately carries a header.
  assertDeploymentProviderTargets(declaredProviderTargets, {
    mode: environment.DEPLOYMENT_MODE, nodeEnv: environment.NODE_ENV
  });
  // V-28: and a hosted DEBATE target must carry its price, or its calls cannot be
  // billed against the per-run and daily envelopes. Separate from the rule above
  // because the support chat's target shares that one and keeps its own accounting.
  assertPricedProviderTargets(declaredProviderTargets, environment.DEPLOYMENT_MODE);
  // Addition D16: on the preview the declared targets must be one of the reviewed provider sets, each equal to its row.
  // That half needs no line-up, so it runs once, here; the rosters, roles and scorecard are each version's (the loader).
  if (previewGate !== undefined) {
    assertPreviewTargetSet(declaredProviderTargets);
  }
  /**
   * V-28 (DL4-F2): the site's money row, HOSTED only (local mode is the relays and loopback model servers, which cost
   * no money). Its day and its band are site members; each version's per-run members are the loader's.
   */
  const costEnvelopePolicy = environment.DEPLOYMENT_MODE === "hosted"
    ? await readCostEnvelopePolicy(pool, environment.REGISTER_VERSION)
    : null;
  const modelSpendStore = new PostgresModelSpendStore(pool);
  /**
   * B9 (budget spec §2.9, paid-plans spec §2.4.1-2.4.2) — THE SHARED WALL WHILE ARGUING, in two independent halves,
   * built whenever hosted: the site's day (only with the band's three members, at its finish edge) and the person (each
   * of the run owner's windows at its finish edge, from billingPlans over the READ-ONLY entitlement port, never the lazy
   * Free append, ruling R-12). A missing billingPlans row fails the person wall closed (`plansUnresolvedPersonAllowance`)
   * and is said once, in one content-free line on standard error (main.ts's boot and the check alike).
   */
  const envelopeBand = costEnvelopePolicy === null ? null : costEnvelopeBand(costEnvelopePolicy);
  const billingPlans = costEnvelopePolicy === null ? null : await readBillingPlans(pool, environment.REGISTER_VERSION);
  if (costEnvelopePolicy !== null && billingPlans === null) {
    console.warn(JSON.stringify({ kind: "DEBATEAI_PERSON_WALL", event: "PLANS_UNRESOLVED" }));
  }
  const fundingEntitlements = new EntitlementRepository(pool);
  const allowances = new PostgresInternalAllowanceRepository(pool);
  // Side-by-side spec §9: no funding read and no funding refusal at boot. A grant is checked against the policy of the
  // version it was issued with, never the pointer, so a funding selection made after boot works without a restart.
  const fundingAllowance = billingPlans === null ? undefined : new FundingAwarePersonAllowanceSource({
    allowances,entitlements:{...fundingEntitlements.readOnlyPort(),readRunFundingBasis:(runId)=>fundingEntitlements.readRunFundingBasis(runId)},
    plans:billingPlans,closeBasisPoints:envelopeBand?.closeBasisPoints ?? 10000
  });
  const sharedWallTerms = costEnvelopePolicy === null
    ? null
    : Object.freeze({
        finishBasisPoints: envelopeBand === null ? null : envelopeBand.finishBasisPoints,
        persons: billingPlans === null
          ? plansUnresolvedPersonAllowance()
          : fundingAllowance ?? new BillingPersonAllowanceSource({
              entitlements: new EntitlementRepository(pool).readOnlyPort(),
              plans: billingPlans,
              closeBasisPoints: envelopeBand === null ? 10_000 : envelopeBand.closeBasisPoints
            }),
        owners: modelSpendStore
      });
  const runnerSite: RunnerSiteContext = Object.freeze({
    siteVersion: environment.REGISTER_VERSION,
    deploymentMode: environment.DEPLOYMENT_MODE,
    preview: previewGate === undefined ? undefined : { gate: previewGate, envLineUp: environment.PREVIEW_ENV_LINE_UP ?? null },
    declaredProviderTargets,
    siteCostEnvelopePolicy: costEnvelopePolicy,
    envelopeBand,
    claim: { claimMs: environment.CLAIM_MS, claimMarginMs: environment.CLAIM_MARGIN_MS },
    configuredMakerRefs: runnerConfiguredMakerRefs(declaredProviderTargets),
    /**
     * V-28 / B9 (side-by-side spec §13 runner point 4): hosted only, the money every version's guard shares — this
     * process's one spend store, the money guard's one in-flight counter (never the gateway's) and the one shared wall
     * with the funding admission. Each version's guard (the loader's) adds its own per-run and story ceilings, built by
     * the one check over both money rows (STORY_DAILY_CEILING_INSUFFICIENT refuses the site version's at boot, as before).
     */
    money: costEnvelopePolicy === null ? null : Object.freeze({
      store: modelSpendStore,
      inFlight: moneyInFlight,
      ...(sharedWallTerms === null ? {} : { sharedWall: sharedWallTerms }),
      ...(fundingAllowance === undefined ? {} : { fundingAdmission: fundingAllowance })
    })
  });
  return Object.freeze({
    site: runnerSite,
    configuredProviders: deploymentMakers.configuredProviders,
    billingPlansSealed: billingPlans !== null
  });
}

/**
 * Side-by-side spec §13 condition 5 (plan D5): "the prompt fingerprints are always declared". The boot readers stay byte
 * for byte (no shape row: no map hash read; no engine row: no engine hash read), so this is `check-version`'s alone: a
 * version must seal BOTH `mapContractHash` and `engineContractHash` rows, each equal to this code's fingerprint
 * (`mapPromptContractHash()`, `engineContractHash()`), whether or not the policy rows exist, so no activated version can
 * hide a stale hash. Every problem, map row first: SETTINGS_HASH_UNDECLARED:<row> (absent), MAP_CONTRACT_HASH_MISMATCH /
 * ENGINE_CONTRACT_HASH_MISMATCH (the boot readers' own codes), or a malformed row's reader code
 * (MAP_CONTRACT_HASH_INVALID / ENGINE_CONTRACT_HASH_INVALID). A database failure propagates. Read-only.
 */
export async function declaredContractHashRefusals(pool: Pick<Pool, "query">, version: number): Promise<readonly string[]> {
  const refusals: string[] = [];
  const rows = [
    { rowKey: "mapContractHash", read: readMapContractHash, code: () => mapPromptContractHash(), mismatch: "MAP_CONTRACT_HASH_MISMATCH" },
    { rowKey: "engineContractHash", read: readEngineContractHash, code: () => engineContractHash(), mismatch: "ENGINE_CONTRACT_HASH_MISMATCH" }
  ] as const;
  for (const row of rows) {
    let sealed: string | null;
    try {
      sealed = await row.read(pool, version);
    } catch (error) {
      const code = settingsRefusalCode(error);
      if (code === null) throw error;
      refusals.push(code);
      continue;
    }
    if (sealed === null) refusals.push(`SETTINGS_HASH_UNDECLARED:${row.rowKey}`);
    else if (sealed !== row.code()) refusals.push(row.mismatch);
  }
  return Object.freeze(refusals);
}

/**
 * D5, as one assertion (the plan's interface): throws the first of `declaredContractHashRefusals` as a TypedDomainError
 * in the house form, the bare code and the whole refusal as the message (`SETTINGS_HASH_UNDECLARED` /
 * `SETTINGS_HASH_UNDECLARED:engineContractHash`; check-version's report keeps the detail).
 */
export async function assertDeclaredContractHashes(pool: Pick<Pool, "query">, version: number): Promise<void> {
  const [first] = await declaredContractHashRefusals(pool, version);
  if (first !== undefined) throw new TypedDomainError(first.split(":")[0]!, first);
}

/** One sealed version, as this runner runs it. Kept forever: sealed versions never change. */
export type RunnerVersionSettings = Readonly<{
  registerVersion: number;
  /** After previewRunnerPolicy: on the preview, every call bound carries the preview's token floor and deadline. */
  policy: DevelopmentRunnerPolicy;
  storyPolicy: StoryPolicy | null;
  /** Addition D16: the version's own preview configuration (its line-up over the env's gate part); undefined off the preview. */
  previewConfig: PreviewProviderTestConfig | undefined;
  debateShape: DebateShapeRunnerSettings | null;
  engine: EngineRunnerSettings | null;
  callLaneLimits: Readonly<{ perDebate: number; perModelPerDebate: number }>;
  /**
   * Side-by-side spec §13 runner point 4 (S6), hosted only (null in local mode): the version's money envelope (its
   * per-run ceilings over the site's day and band, `composeDebateCostEnvelope`) and its guard over the site's one store,
   * in-flight counter and shared wall (`RunnerSiteContext.money`). Every money seam of a run reads its own version's
   * guard by run id (`runCostEnvelopeGuardOf`).
   */
  costEnvelope: Readonly<{ policy: CostEnvelopePolicy; guard: CostEnvelopeGuard }> | null;
}>;

/** Every register read the loader makes, each handed the version it loads (unit tests inject them; no database). */
export type RunnerVersionReaders = Readonly<{
  readDevelopmentRunnerPolicy: (pool: Pool, version: number) => Promise<DevelopmentRunnerPolicy>;
  readStoryPolicyFromRegister: (pool: Pool, version: number) => Promise<StoryPolicy | null>;
  readPreviewLineUpPolicy: (pool: Pool, version: number) => Promise<PreviewLineUp | null>;
  readDebateShapeRunnerSettings: (pool: Pool, version: number) => Promise<DebateShapeRunnerSettings | null>;
  readEngineRunnerSettings: (pool: Pool, version: number) => Promise<EngineRunnerSettings | null>;
  readModelScorecard: (pool: Pool, version: number, engineVersion: string) => Promise<ModelScorecardReadResult>;
  readEngineVersion: () => Promise<string>;
  readCostEnvelopePolicy: (pool: Pool, version: number) => Promise<CostEnvelopePolicy>;
  readCallConcurrencyPolicy: (pool: Pool, version: number) => Promise<CallConcurrencyPolicyState>;
}>;

const RUNNER_VERSION_READERS: RunnerVersionReaders = Object.freeze({
  readDevelopmentRunnerPolicy,
  readStoryPolicyFromRegister,
  readPreviewLineUpPolicy,
  readDebateShapeRunnerSettings: (pool: Pool, version: number) => readDebateShapeRunnerSettings(pool, version),
  readEngineRunnerSettings: (pool: Pool, version: number) => readEngineRunnerSettings(pool, version),
  readModelScorecard,
  readEngineVersion: () => readEngineVersion(),
  readCostEnvelopePolicy,
  readCallConcurrencyPolicy
});

/**
 * Addition D14-D16: a version's preview configuration, by the one shared rule (`resolvePreviewLineUp`, providers;
 * ruling R17). Throws TypedDomainError PREVIEW_LINE_UP_REQUIRED (no row beside a sockets-only env),
 * PREVIEW_LINE_UP_ENV_CONFLICT (a row on the site version beside an env that still carries a line-up) or
 * PREVIEW_LINE_UP_WITHOUT_PREVIEW (a row off the preview). The site version's refusal refuses the boot; another
 * version's makes it unsupported (S7's plain path).
 */
export function resolvePreviewVersionConfig(input: Readonly<{
  preview: RunnerSiteContext["preview"];
  row: PreviewLineUp | null;
  isSiteVersion: boolean;
}>): PreviewProviderTestConfig | undefined {
  return resolvePreviewLineUp(input);
}

/**
 * The preview's per-version target checks (addition D16, D19): every model the version's rosters name has a declared
 * target (the served half of assertPreviewProviderTargets; the target-set half needs no line-up and stays in main.ts,
 * once), every answer role the version names is a declared target with its gate's socket, and a version whose sealed
 * model scorecard is VALID is refused (the preview's roster may not override it: PREVIEW_SCORECARD_CONFLICT).
 */
export function assertPreviewVersionTargets(input: Readonly<{
  previewConfig: PreviewProviderTestConfig;
  declaredProviderTargets: readonly ProviderDiscoveryTarget[];
  policy: Pick<DevelopmentRunnerPolicy, "synthesisRolePolicy">;
  storyPolicy: StoryPolicy | null;
  scorecardState: ModelScorecardReadResult["state"];
}>): void {
  const { previewConfig, declaredProviderTargets, policy, storyPolicy } = input;
  assertPreviewRostersServed(previewConfig, declaredProviderTargets);
  // Every role the register names must be a declared target, or its debates would fail at claim.
  assertPreviewRoleTargets(previewConfig, declaredProviderTargets, [
    policy.synthesisRolePolicy.synthesizerRoleRef, policy.synthesisRolePolicy.evaluatorRoleRef,
    ...(storyPolicy === null ? [] : [storyPolicy.storytellerRoleRef, storyPolicy.storyCheckerRoleRef])
  ]);
  if (input.scorecardState === "VALID") {
    throw new TypedDomainError("PREVIEW_SCORECARD_CONFLICT", "Preview roster cannot override a valid scorecard");
  }
}

/**
 * Side-by-side spec §13 — ONE SEALED VERSION, LOADED. The reads and checks main.ts made at boot for its one
 * REGISTER_VERSION, in main.ts's order, each handed `version` (never the site version): a version is read as itself.
 * Every reader's typed refusal propagates unchanged (the boot refuses with today's codes; the cache keeps another
 * version's refusal as UNSUPPORTED). The story rows are the exception they always were: unreadable story rows are
 * `storyPolicy: null` and one content-free STORY_POLICY_UNREADABLE line, so the story never stops the runner — except
 * under `strict: true` (check-version, S14), where the refusal propagates.
 *
 * `readers` replaces any of the register reads (unit tests inject them all; final fix wave F4: the practice's
 * --call-concurrency replaces only `readCallConcurrencyPolicy`, for every version it loads); the rest are the boot's own.
 */
export async function loadRunnerVersionSettings(pool: Pool, version: number, site: RunnerSiteContext,
  options?: Readonly<{
    strict?: true;
    readers?: Partial<RunnerVersionReaders>;
    /** Where the STORY_POLICY_UNREADABLE line goes. Default: one JSON line on standard error (main.ts's). */
    log?: (line: Readonly<Record<string, unknown>>) => void;
  }>): Promise<RunnerVersionSettings> {
  const {
    readDevelopmentRunnerPolicy, readStoryPolicyFromRegister, readPreviewLineUpPolicy, readDebateShapeRunnerSettings,
    readEngineRunnerSettings, readModelScorecard, readEngineVersion, readCostEnvelopePolicy, readCallConcurrencyPolicy
  } = { ...RUNNER_VERSION_READERS, ...options?.readers };
  const log = options?.log ?? ((line: Readonly<Record<string, unknown>>) => { console.warn(JSON.stringify(line)); });
  // Addition D16: previewRunnerPolicy only tests whether this runner is the preview's, which the site's gate part says
  // for every version (a version that resolves a preview configuration has one exactly when the gate part exists).
  const previewGate = site.preview?.gate;
  const policy = previewRunnerPolicy(await readDevelopmentRunnerPolicy(pool, version), previewGate);
  // Practice debate 3 (2026-10-12): every judge, answer-writer and answer-checker call is recorded under the register's
  // prompt fingerprint, so a register that does not carry the fingerprint of a prompt this code sends refuses the start
  // (REGISTER_PROMPT_CONTRACT_HASH_MISMATCH) instead of logging the new prompt under the old fingerprint.
  assertRegisterPromptContractHashes(policy.hashes, version);
  /**
   * VERDICT STORY (spec 2026-09-26 §9): the story's register rows are OPTIONAL.
   * A register that never sealed them — every version before this feature,
   * acceptance v3 included — reads as `null`, and each story is then written as
   * FAILED/STORY_NOT_CONFIGURED without a model call. A PARTLY sealed or
   * malformed family is logged by code and treated the same way: the story can
   * never stop this runner from claiming a debate.
   */
  // Ruling R32: only a typed refusal of the story's ROWS is "no story"; a database failure (the pool's typed
  // DATABASE_POOL_FAILED included) or an untyped error propagates, so the cache never keeps a passing blip as no story.
  const storyPolicy = await readStoryPolicyFromRegister(pool, version)
    .catch((error: unknown) => {
      const code = settingsRefusalCode(error);
      if (options?.strict === true || code === null) throw error;
      log({ kind: "DEBATEAI_STORY", event: "STORY_POLICY_UNREADABLE", code, version: String(version) });
      return null;
    });
  // Addition D14-D16: the version's own line-up (rosters and thinking levels), or the env's for a version without it.
  const previewLineUp = await readPreviewLineUpPolicy(pool, version);
  const previewConfig = resolvePreviewVersionConfig({
    preview: site.preview, row: previewLineUp, isSiteVersion: version === site.siteVersion
  });
  /**
   * Debate shape (spec 2026-10-12 §3.1, §4): the optional row (absent = today's shape, byte for byte; malformed = boot
   * refused, DEBATE_SHAPE_POLICY_INVALID) and, only with it, the sealed map contracts (DEBATE_SHAPE_MAP_HASH_UNSEALED /
   * MAP_CONTRACT_HASH_MISMATCH). A run's sizes are read from its own receipt, never from this row.
   */
  const debateShape = await readDebateShapeRunnerSettings(pool, version);
  /**
   * Engine redesign (spec 2026-10-15 §3.3; INTERFACE §1.5, §2.3): the optional engineVersionPolicy row (absent = engine 1,
   * today's runner byte for byte, and neither the length row nor the seal is read; malformed = boot refused,
   * ENGINE_VERSION_POLICY_INVALID) and, only with it (enabled or not), the length row's presence and the sealed
   * engineContractHash (ENGINE_REQUIRES_LENGTH_POLICY / ENGINE_CONTRACT_HASH_UNSEALED / ENGINE_CONTRACT_HASH_MISMATCH).
   * A run's engine is read from its own receipt, never from this row.
   */
  const engine = await readEngineRunnerSettings(pool, version);
  const { siteCostEnvelopePolicy, envelopeBand, declaredProviderTargets } = site;
  if (previewConfig !== undefined) {
    assertPreviewVersionTargets({
      previewConfig, declaredProviderTargets, policy, storyPolicy,
      scorecardState: (await readModelScorecard(pool, version, await readEngineVersion())).state
    });
  }
  /**
   * B9 (budget spec §2.10) — A LIMIT BELOW ONE CALL REFUSES THIS VERSION
   * (RUN_CEILING_BELOW_ONE_CALL), instead of failing a person's first debate.
   * Hosted, and only with the site costEnvelopePolicy row's three band members
   * (the same `envelopeBand` that builds the shared wall's site-day half, B9b).
   * Side-by-side spec §13: the per-run ceiling is the version's own (its debate
   * members over the site's day and band, composeDebateCostEnvelope), and so are
   * the judge's bound, the shape's presence and the scorecard.
   * Priced per plan: the cheapest price among each plan's models, and every
   * plan's cheapest must fit.
   * Paid plans S2: while the sealed model scorecard at this register version is
   * VALID (the row the hosted API's picker reads), each plan's models are every
   * configured model, because the picker seats from all of them. Paid plans S4b:
   * with billing on the picker seats Free from the Free roster only, but this
   * process never reads billingPolicy (amendment A20), so it keeps the looser
   * all-models groups; the API's boot and the hosted publish, which know billing,
   * price Free on its own roster (`ownRosterOnly`).
   *
   * Final fix wave F9 (ruling R79, owner-visible): the plan groups are the version's own PREVIEW rosters
   * (`previewPlanTierRosters(previewConfig, PLAN_TIER_ROSTERS)`: its line-up's free and premium rosters on the preview,
   * the code's plan rosters off it) for every version but the site version at boot, and for every version under
   * check-version (`strict`). The site version's boot keeps today's grouping (PLAN_TIER_ROSTERS, which no preview target
   * serves) until a live dry run on the preview: no new boot refusal without one.
   */
  // Side-by-side spec §13: the version's money envelope, read once (hosted: the site's money row is non-null) — its
  // per-run members over the site's day and band. B9 below and the version's guard both use it.
  const debateEnvelope = siteCostEnvelopePolicy === null
    ? null
    : composeDebateCostEnvelope(siteCostEnvelopePolicy, await readCostEnvelopePolicy(pool, version));
  if (debateEnvelope !== null && envelopeBand !== null) {
    const firstCalls = firstPositionCallProjections({
      targets: declaredProviderTargets,
      judgeTokenCeiling: policy.bounds.JUDGE.tokenCeiling,
      questionMaxBytes: askQuestionMaxBytes(),
      // Ruling L-B9R (P2L Task 17): with ANY debateShapePolicy row (read raw above, enabled false too: this runner still
      // finishes the shaped runs admitted before the switch), a run's first call may carry the locked language, so it is
      // priced at the longest lock too. No row: today's price.
      questionLanguageLocked: debateShape !== null
    });
    assertRunCeilingCoversOneCall({
      bodyCeilingMicros: costEnvelopeCeilings(debateEnvelope).bodyMicros,
      firstCallsByRoster: firstCallsByPlanRoster({
        projections: firstCalls,
        rosters: firstCallPlanModels({
          scorecardInForce: (await readModelScorecard(pool, version, await readEngineVersion())).state === "VALID",
          rosters: options?.strict === true || version !== site.siteVersion
            ? previewPlanTierRosters(previewConfig, PLAN_TIER_ROSTERS)
            : PLAN_TIER_ROSTERS,
          models: firstCalls.map((call) => call.model)
        })
      })
    });
  }
  // Parallel AI calls (spec 2026-10-12 §3.1; side-by-side spec §13): the debate's own lane limits, from its version's
  // callConcurrencyPolicy row (absent: one call at a time). The runner-wide limit (perModelPerRunner) is a site member.
  const callLaneLimits = debateCallLaneLimits(await readCallConcurrencyPolicy(pool, version));
  /**
   * V-28 / B9 / Task M7 (side-by-side spec §13 runner point 4): THIS VERSION'S MONEY GUARD, hosted only. One store, one
   * in-flight counter and one shared wall for every version (the site's); this version's per-run ceilings and its story
   * ceiling. Engine money rule, Task M7: built by the one check over BOTH money rows, which refuses the version
   * (STORY_DAILY_CEILING_INSUFFICIENT) when the site's day cannot hold one full run plus its story (the site version's
   * refusal refuses the boot, as before; another version's makes it unsupported).
   */
  const money = site.money;
  const costEnvelope = money === null || debateEnvelope === null
    ? null
    : Object.freeze({
        policy: debateEnvelope,
        guard: new CostEnvelopeGuard({
          store: money.store,
          policy: costEnvelopeGuardPolicy(debateEnvelope, storyPolicy),
          ...(money.sharedWall === undefined ? {} : { sharedWall: money.sharedWall }),
          ...(money.fundingAdmission === undefined ? {} : { fundingAdmission: money.fundingAdmission }),
          inFlight: money.inFlight
        })
      });
  const loaded: RunnerVersionSettings = Object.freeze({
    registerVersion: version, policy, storyPolicy, previewConfig, debateShape, engine, callLaneLimits, costEnvelope
  });
  // Side-by-side spec §13 (S6): last, the claim-time gates every debate of this version would meet, so a version that
  // fails one is refused here (UNSUPPORTED; the site version's refusal refuses the boot) with the gate's own code.
  try {
    assertRunnerSettingsGates({
      settings: { ...runnerSettingsOfVersion(loaded), claimMs: site.claim.claimMs, claimMarginMs: site.claim.claimMarginMs },
      configuredMakerRefs: site.configuredMakerRefs
    });
  } catch (error) {
    // The claim guard's refusal is the battery's TypeError in prose ("CLAIM_BOUND_MISMATCH: why"); the cache keeps only
    // a code-shaped refusal, so it is handed on typed, by its code, as the version's settings refusal it is.
    if (error instanceof TypeError && error.message.startsWith(`${CLAIM_BOUND_MISMATCH}:`)) {
      throw new TypedDomainError(CLAIM_BOUND_MISMATCH, error.message);
    }
    throw error;
  }
  return loaded;
}

/**
 * The debate members of one version and their one mapping live in ./run-debate-members.ts (side-by-side spec §13,
 * S6), so WalkingSkeletonRunner (index.ts) can map a debate's version without importing this loader: this module reaches
 * index.ts back through the runner policy's readers, and that cycle would hand an importer of index.ts a half-loaded
 * module. Re-exported here for main.ts and the practice runner, which boot through this loader.
 */
export { runnerSettingsOfVersion, type RunnerDebateMembers } from "./run-debate-members.js";

export type RunnerSettingsResolution =
  | Readonly<{ kind: "SETTINGS"; version: RunnerVersionSettings }>
  | Readonly<{ kind: "UNSUPPORTED"; code: string }>;

/** The claim guard's refusal code (packages/battery assertClaimCoversCall). */
const CLAIM_BOUND_MISMATCH = "CLAIM_BOUND_MISMATCH";

/** Ruling R31: a settings refusal is `settingsRefusalCode` (@debateai/db, the API's cache's too); a database failure
 * never is. */
type CacheEntry =
  | Readonly<{ kind: "SETTINGS"; version: RunnerVersionSettings }>
  | Readonly<{ kind: "UNSUPPORTED"; code: string; error: unknown }>;

/**
 * Side-by-side spec §13 runner point 2 — THE PER-VERSION CACHE, for the life of the process. A sealed version never
 * changes, so each is loaded once: concurrent asks share one load; a settings refusal is kept as UNSUPPORTED with its
 * code (one content-free DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED line) and never loaded again; a database failure (the
 * pool's DATABASE_POOL_FAILED, busy or lost, ruling R31) or an untyped error is not kept, so the next ask loads again. `requireSettings` is the boot's: it rethrows the loader's own
 * typed refusal, so the site version refuses the boot with today's codes. `loaded` is synchronous, for the money seams.
 */
export function createRunnerSettingsCache(input: Readonly<{
  load: (version: number) => Promise<RunnerVersionSettings>;
  log: (line: Readonly<Record<string, unknown>>) => void;
}>): Readonly<{
  settingsFor(version: number): Promise<RunnerSettingsResolution>;
  requireSettings(version: number): Promise<RunnerVersionSettings>;
  loaded(version: number): RunnerVersionSettings | undefined;
  versions(): readonly Readonly<{ version: number; kind: "SETTINGS" | "UNSUPPORTED" }>[];
}> {
  const settled = new Map<number, CacheEntry>();
  const pending = new Map<number, Promise<CacheEntry>>();
  function entryOf(version: number): Promise<CacheEntry> {
    const done = settled.get(version);
    if (done !== undefined) return Promise.resolve(done);
    const inFlight = pending.get(version);
    if (inFlight !== undefined) return inFlight;
    const loading = input.load(version).then(
      (settings): CacheEntry => {
        const entry = Object.freeze({ kind: "SETTINGS" as const, version: settings });
        settled.set(version, entry);
        return entry;
      },
      (error: unknown): CacheEntry => {
        const code = settingsRefusalCode(error);
        if (code === null) throw error;
        const entry = Object.freeze({ kind: "UNSUPPORTED" as const, code, error });
        settled.set(version, entry);
        // Final fix wave S14: an owner-typed detail is printed only when plainly an id (`settingsJournalCode`).
        input.log({ kind: "DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED", version: String(version), code: settingsJournalCode(code) });
        return entry;
      }
    ).finally(() => { pending.delete(version); });
    pending.set(version, loading);
    return loading;
  }
  return Object.freeze({
    async settingsFor(version: number): Promise<RunnerSettingsResolution> {
      const entry = await entryOf(version);
      return entry.kind === "SETTINGS" ? entry : Object.freeze({ kind: "UNSUPPORTED" as const, code: entry.code });
    },
    async requireSettings(version: number): Promise<RunnerVersionSettings> {
      const entry = await entryOf(version);
      if (entry.kind === "SETTINGS") return entry.version;
      throw entry.error;
    },
    loaded(version: number): RunnerVersionSettings | undefined {
      const entry = settled.get(version);
      return entry?.kind === "SETTINGS" ? entry.version : undefined;
    },
    versions() {
      return Object.freeze([...settled.entries()].sort(([a], [b]) => a - b)
        .map(([version, entry]) => Object.freeze({ version, kind: entry.kind })));
    }
  });
}

/** Side-by-side spec §13 (S6): the per-version cache, by name (the money seams and, addition D17, the thinking table). */
export type RunnerSettingsCache = ReturnType<typeof createRunnerSettingsCache>;

/** Side-by-side spec §13 runner point 3 (S8): where the boot's preload list comes from (unit tests inject fakes). */
export type RunnerSettingsPreloadSources = Readonly<{
  pool: Pick<Pool, "query">;
  /** The battery's WorkItemRepository, fenced to `releaseKey`. */
  work: Readonly<{ listOpenRunSettingsVersions(releaseKey: string): Promise<readonly number[]> }>;
  releaseKey: string;
  siteVersion: number;
}>;

/**
 * Side-by-side spec §13 runner point 3 (S8) — WHAT THE BOOT PRELOADS. The sorted, distinct union of the site version,
 * the versions of this release's open debates (READY or CLAIMED work, `listOpenRunSettingsVersions`) and every version
 * this release has a PASS verdict for (`register.read_passed_settings_versions`, which also names the key's own number).
 * Never the activation pointer: the runner runs what it was stamped with or has passed, and the pointer is the API's
 * alone (S16 pins that no runner file names its reader). A `legacy` process (development and tests: no release key
 * is ever legacy on a server) preloads its site version only, asking neither source — legacy runs are never listed
 * and a legacy key has no verdicts. A database failure propagates: the boot refuses (the S8 ruling: at boot the
 * database must work). Two reads, one after the other: the open debates', then the verdicts'.
 */
export async function listRunnerSettingsPreload(input: RunnerSettingsPreloadSources): Promise<readonly number[]> {
  const { pool, work, releaseKey, siteVersion } = input;
  const versions = new Set<number>([siteVersion]);
  if (releaseKey !== LEGACY_RELEASE_KEY) {
    for (const version of await work.listOpenRunSettingsVersions(releaseKey)) versions.add(version);
    const passed = await pool.query<{ register_version: number }>(
      // The bigint version is cast by the database (an out-of-range one refuses), never coerced in JavaScript.
      "SELECT passed::integer AS register_version FROM register.read_passed_settings_versions($1) AS passed",
      [releaseKey]
    );
    for (const row of passed.rows) versions.add(row.register_version);
  }
  return Object.freeze([...versions].sort((a, b) => a - b));
}

/** Side-by-side spec §13 runner point 3 (S8): what the boot's preload found, versions ascending. */
export type RunnerSettingsPreload = Readonly<{
  releaseKey: string;
  siteVersion: number;
  loaded: readonly number[];
  unsupported: readonly Readonly<{ version: number; code: string }>[];
}>;

/**
 * Side-by-side spec §13 runner point 3 (S8) — THE BOOT PRELOAD: "a bad version still fails loudly at start". Every
 * version `listRunnerSettingsPreload` names is loaded through the cache, one after another, so a debate's first claim
 * never waits on a load and a bad version is seen before the first claim. A version the release cannot run is
 * UNSUPPORTED: the cache prints its one loud DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED line (ruling R41) and the boot goes
 * on — its debates fail plainly at claim (S7: set aside, no quota use). Only the site version refuses the boot, and it
 * was already required (`requireSettings`) before this runs. A database failure is never a settings refusal (ruling
 * R31: not cached) and propagates: the boot refuses rather than start with a version it could not read.
 */
export async function preloadRunnerSettings(input: RunnerSettingsPreloadSources & Readonly<{
  cache: Pick<RunnerSettingsCache, "settingsFor">;
}>): Promise<RunnerSettingsPreload> {
  const versions = await listRunnerSettingsPreload(input);
  const loaded: number[] = [];
  const unsupported: Readonly<{ version: number; code: string }>[] = [];
  for (const version of versions) {
    const resolution = await input.cache.settingsFor(version);
    if (resolution.kind === "SETTINGS") loaded.push(version);
    else unsupported.push(Object.freeze({ version, code: resolution.code }));
  }
  return Object.freeze({
    releaseKey: input.releaseKey, siteVersion: input.siteVersion,
    loaded: Object.freeze(loaded), unsupported: Object.freeze(unsupported)
  });
}

/**
 * Side-by-side spec §13 runner point 3 (S8): the boot preload, content-free: versions as strings, codes only (each
 * unsupported version with the code the cache's UNSUPPORTED line printed). The practice logs it as one settings line.
 */
export function runnerSettingsSummary(preload: RunnerSettingsPreload): Readonly<{
  releaseKey: string;
  siteVersion: string;
  loaded: readonly string[];
  unsupported: readonly Readonly<{ version: string; code: string }>[];
}> {
  return Object.freeze({
    releaseKey: preload.releaseKey,
    siteVersion: String(preload.siteVersion),
    loaded: Object.freeze(preload.loaded.map(String)),
    // Final fix wave S14: the code as the cache's line printed it (`settingsJournalCode`).
    unsupported: Object.freeze(preload.unsupported.map(({ version, code }) => Object.freeze({ version: String(version), code: settingsJournalCode(code) })))
  });
}

/**
 * Side-by-side spec §13 runner point 3 (S8): the boot's one content-free journal line, printed right after
 * DEBATEAI_RUNNER_READY (which is unchanged: the preview's handshake reads it):
 * `DEBATEAI_RUNNER_SETTINGS {"releaseKey":…,"siteVersion":"17","loaded":["17","18"],"unsupported":[]}`, each unsupported
 * version as `{"version":"19","code":"…"}`.
 */
export function runnerSettingsLine(preload: RunnerSettingsPreload): string {
  return `DEBATEAI_RUNNER_SETTINGS ${JSON.stringify(runnerSettingsSummary(preload))}\n`;
}

/**
 * Side-by-side spec §13 (S6) — THE RUN → VERSION MAP, for the life of the process (a few bytes per run; a runner lives
 * one release). `execute()` sets it right after the claim, before any call; the money seams and (addition D17) the
 * preview's thinking table read it by run id, synchronously. A run's version is never re-pointed: a second, different
 * value refuses RUN_SETTINGS_VERSION_DRIFT (the same value again — a re-claim — is fine).
 */
export type RunSettingsVersions = Readonly<{
  set(runId: string, version: number): void;
  versionOf(runId: string): number | undefined;
}>;

export function createRunSettingsVersions(): RunSettingsVersions {
  const versions = new Map<string, number>();
  return Object.freeze({
    set(runId: string, version: number): void {
      const known = versions.get(runId);
      if (known !== undefined && known !== version) {
        throw new TypedDomainError(
          "RUN_SETTINGS_VERSION_DRIFT",
          `RUN_SETTINGS_VERSION_DRIFT:${String(known)}:${String(version)}`
        );
      }
      versions.set(runId, version);
    },
    versionOf(runId: string): number | undefined {
      return versions.get(runId);
    }
  });
}

/**
 * Side-by-side spec §13 runner point 4 (S6): the money guard of a run's own version, by run id (main.ts's and the
 * practice's seams: `runCostEnvelopeGuard(runId).providerSeam(…)` / `.storySeam(…)`). Synchronous: the claim loaded the
 * version before any call. An unmapped run, a version not loaded or a version without a guard (local mode builds no
 * seam at all) refuses RUN_SETTINGS_VERSION_UNKNOWN: a call is never charged to another version's envelope.
 */
export function runCostEnvelopeGuardOf(
  cache: Pick<RunnerSettingsCache, "loaded">,
  versions: Pick<RunSettingsVersions, "versionOf">
): (runId: string) => CostEnvelopeGuard {
  return (runId: string): CostEnvelopeGuard => {
    const version = versions.versionOf(runId);
    if (version === undefined) {
      throw new TypedDomainError("RUN_SETTINGS_VERSION_UNKNOWN", "RUN_SETTINGS_VERSION_UNKNOWN:UNMAPPED");
    }
    const guard = cache.loaded(version)?.costEnvelope?.guard;
    if (guard === undefined) {
      throw new TypedDomainError("RUN_SETTINGS_VERSION_UNKNOWN", `RUN_SETTINGS_VERSION_UNKNOWN:${String(version)}`);
    }
    return guard;
  };
}

/**
 * Addition D17-D18 (owner 2026-10-22; Task SA5): the preview's thinking table of a call's OWN debate, by its run id, for
 * `withPreviewProviderCallPolicy`'s `thinkingLevelsOf`. A run id → its stamped version (`versions.versionOf`, set by
 * `execute()` right after the claim and again, same value, on every re-claim) → that loaded version's composed preview
 * configuration's `thinking_levels`; `runId === null` (a call of no debate) → the site version's table. So a debate keeps
 * its levels for its whole life (O1): through re-claims after an activation and through its verdict story after DONE
 * (the story's calls carry the run id). Undefined = the version has no table (every row's default, as today).
 *
 * An unmapped run, or a version not loaded (never happens: the claim loads the version before any call), refuses
 * RUN_SETTINGS_VERSION_UNKNOWN, exactly as the money seams (`runCostEnvelopeGuardOf`): a call never runs at another
 * version's levels, and the call policy ends the call before anything is sent. Synchronous and closure-captured over
 * the cache and the map: no AsyncLocalStorage and no process-wide "current run" (S6's O1 reason: the call scheduler's
 * pump starts debate B's waiting call from inside debate A's async context).
 */
export function runPreviewThinkingLevelsOf(
  cache: Pick<RunnerSettingsCache, "loaded">,
  versions: Pick<RunSettingsVersions, "versionOf">,
  siteVersion: number
): (runId: string | null) => PreviewThinkingLevels | undefined {
  return (runId: string | null): PreviewThinkingLevels | undefined => {
    const version = runId === null ? siteVersion : versions.versionOf(runId);
    if (version === undefined) {
      throw new TypedDomainError("RUN_SETTINGS_VERSION_UNKNOWN", "RUN_SETTINGS_VERSION_UNKNOWN:UNMAPPED");
    }
    const settings = cache.loaded(version);
    if (settings === undefined) {
      throw new TypedDomainError("RUN_SETTINGS_VERSION_UNKNOWN", `RUN_SETTINGS_VERSION_UNKNOWN:${String(version)}`);
    }
    return settings.previewConfig?.thinking_levels;
  };
}

/**
 * Perplexity plan 2026-10-30, task W3-1 — THE RUNNER'S WEB SETTINGS (web-step.ts `runRunnerWebStep`).
 *
 * - The search port: the preview's guarded fetch routes the search URL to the search gate's own socket and carries no
 *   key, so web search runs only where the configuration names that socket. Elsewhere (hosted production, local) there is
 *   no port yet, and every debate's paths are SWITCHED_OFF: no call, nothing charged.
 * - The web setting (owner Q16, "a settings switch"): until the register's `webSearchPolicy` row exists (plan §4.2), the
 *   switch is whether this server has a search gate, as above; the row replaces it without touching the step.
 * - The money: each search is charged through its run's own version's guard (`searchSeam`, W2-2), hosted only; local
 *   mode charges nothing, as for every call.
 * - The run's plan: billing pinned it at admission (`billing.run_charge_scope`, 0084, which the runner's role reads).
 *   No row (local mode) or no plan (a team grant) is no plan: no search.
 * - The planner's per-path decision goes to `recordPlanPathStatuses` (0134's store, wired at the merge with W2-8).
 * A search waits in the debate's lane under the search row's limits (`searchCallSubject`).
 */
export function runnerWebSearchSettings(input: Readonly<{
  pool: Pick<Pool, "query">;
  previewGate: PreviewGateSettings | undefined;
  fetch: typeof fetch;
  /** The run's own version's money guard (`runCostEnvelopeGuardOf`), or null in local mode. */
  guardOf: ((runId: string) => CostEnvelopeGuard) | null;
  /** 0134's writer of the planner's per-path decision (W2-8); absent until the merge: one content-free line instead. */
  recordPlanPathStatuses?: RecordPlanPathStatuses;
}>): WebStepRunnerSettings {
  const gated = input.previewGate !== undefined && previewGateSocket(input.previewGate, "perplexity") !== undefined;
  const search = gated
    ? createPerplexitySearchPort({ fetch: input.fetch, selectPages: (pages) => selectPathPages(pages, new Set<string>()) })
    : null;
  const guardOf = input.guardOf;
  return Object.freeze({
    switchedOn: search !== null,
    search,
    searchSubject: searchCallSubject(input.previewGate),
    searchSeamOf: guardOf === null ? null : (runId: string) => guardOf(runId).searchSeam({ runId }),
    readRunPlan: async (runId: string): Promise<PlanId | null> => {
      const row = (await input.pool.query<{ plan_id: PlanId | null }>(
        "SELECT plan_id FROM billing.run_charge_scope WHERE run_id = $1::uuid", [runId])).rows[0];
      return row?.plan_id ?? null;
    },
    recordPlanPathStatuses: input.recordPlanPathStatuses ?? (async (runId) => {
      console.warn(JSON.stringify({ kind: "DEBATEAI_WEB_STEP", event: "WEB_PLAN_STATUS_STORE_PENDING", runId }));
    })
  });
}
