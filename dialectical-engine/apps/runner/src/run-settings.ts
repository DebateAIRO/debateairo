import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import {
  composeDebateCostEnvelope,
  costEnvelopeCeilings,
  debateCallLaneLimits,
  readCallConcurrencyPolicy,
  readCostEnvelopePolicy,
  readEngineVersion,
  readModelScorecard,
  readPreviewLineUpPolicy,
  readStoryPolicyFromRegister,
  type CallConcurrencyPolicyState,
  type CostEnvelopeBand,
  type CostEnvelopePolicy,
  type ModelScorecardReadResult,
  type StoryPolicy
} from "@debateai/register";
import { assertRunCeilingCoversOneCall } from "@debateai/budget";
import { PLAN_TIER_ROSTERS, askQuestionMaxBytes } from "@debateai/contract";
import { firstCallsByPlanRoster, firstPositionCallProjections } from "@debateai/judgement";
import { firstCallPlanModels } from "@debateai/scorecard";
import {
  assertPreviewRoleTargets,
  assertPreviewRostersServed,
  previewRunnerPolicy,
  resolvePreviewLineUp,
  type PreviewGateSettings,
  type PreviewLineUp,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import { assertRegisterPromptContractHashes, type WalkingSkeletonSettings } from "./index.js";
import { readDebateShapeRunnerSettings, type DebateShapeRunnerSettings } from "./debate-shape-boot.js";
import { readEngineRunnerSettings, type EngineRunnerSettings } from "./engine-boot.js";
import { readDevelopmentRunnerPolicy, type DevelopmentRunnerPolicy } from "./dev-runner-policy.js";

/**
 * Side-by-side spec §13 (settings changes without an upload), runner points 1, 2 and 7: the runner's ONE per-version
 * settings loader and its cache.
 *
 * Plain words: everything the runner reads from one sealed settings version (the runner policy and its prompt
 * fingerprints, the story's rows, the preview's AI line-up, the debate shape, the engine, the debate's call lanes) is
 * read here, by one function, for the version asked, and kept for the life of the process: a sealed version never
 * changes. apps/runner/src/main.ts and the preview practice (tools/preview-practice/practice-runner-composition.ts) both
 * boot through it, so the two cannot read a version differently. Today the runner still runs one version, its site
 * version (REGISTER_VERSION); task S6 hands every debate its own.
 *
 * The SITE members (what follows the release, not the debate: the deployment mode, the declared provider targets, the
 * day's money ceiling and its band, the gate part of the preview configuration) are read once at boot, outside this
 * loader, and handed in as `RunnerSiteContext`. The loader never reads them from a version.
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
}>;

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
 */
export async function loadRunnerVersionSettings(pool: Pool, version: number, site: RunnerSiteContext,
  options?: Readonly<{
    strict?: true;
    readers?: RunnerVersionReaders;
    /** Where the STORY_POLICY_UNREADABLE line goes. Default: one JSON line on standard error (main.ts's). */
    log?: (line: Readonly<Record<string, unknown>>) => void;
  }>): Promise<RunnerVersionSettings> {
  const {
    readDevelopmentRunnerPolicy, readStoryPolicyFromRegister, readPreviewLineUpPolicy, readDebateShapeRunnerSettings,
    readEngineRunnerSettings, readModelScorecard, readEngineVersion, readCostEnvelopePolicy, readCallConcurrencyPolicy
  } = options?.readers ?? RUNNER_VERSION_READERS;
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
  const storyPolicy = await readStoryPolicyFromRegister(pool, version)
    .catch((error: unknown) => {
      if (options?.strict === true) throw error;
      log({
        kind: "DEBATEAI_STORY",
        event: "STORY_POLICY_UNREADABLE",
        code: error instanceof TypedDomainError ? error.code : "UNTYPED",
        version: String(version)
      });
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
   */
  if (siteCostEnvelopePolicy !== null && envelopeBand !== null) {
    const debateEnvelope = composeDebateCostEnvelope(siteCostEnvelopePolicy, await readCostEnvelopePolicy(pool, version));
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
          rosters: PLAN_TIER_ROSTERS,
          models: firstCalls.map((call) => call.model)
        })
      })
    });
  }
  // Parallel AI calls (spec 2026-10-12 §3.1; side-by-side spec §13): the debate's own lane limits, from its version's
  // callConcurrencyPolicy row (absent: one call at a time). The runner-wide limit (perModelPerRunner) is a site member.
  const callLaneLimits = debateCallLaneLimits(await readCallConcurrencyPolicy(pool, version));
  return Object.freeze({ registerVersion: version, policy, storyPolicy, previewConfig, debateShape, engine, callLaneLimits });
}

/**
 * The debate members of WalkingSkeletonSettings: every setting a debate's run reads from its settings version. The
 * process members (the worker, the claim times, the provider topology, the scheduler, the money seams, the story
 * writer, the probes) are the process's and stay in main.ts's literal; the release's site members never come from here.
 */
export type RunnerDebateMembers = Pick<WalkingSkeletonSettings, "judgeBound" | "composerBound" | "conformanceBound" |
  "judgeContractHash" | "composerContractHash" | "conformanceContractHash" | "propagationContractHash" |
  "serveContractHash" | "factBundleVersion" | "compositionRow" | "servePolicy" | "judgementPolicy" | "scoringOperator" |
  "runDeathPolicy" | "hiddenNodeScoreThreshold" | "verdictLabelPolicy" | "panelPolicy" | "stoppingPolicy" |
  "synthesisRolePolicy" | "debateShape" | "engine" | "storyPolicy" | "callLaneLimits">;

/**
 * Side-by-side spec §13 runner point 7 — THE DEBATE MEMBERS OF ONE VERSION, written ONCE (main.ts, the practice runner
 * and, from S6, the per-debate cache spread it). `factBundleVersion` is the version itself, so a debate's facts are
 * stamped with the version its settings came from. The preview line-up is not a member: the runner's engine never reads
 * the rosters (admission froze the panel) and only the gateways read the thinking table (addition SA5).
 */
export function runnerSettingsOfVersion(version: RunnerVersionSettings): RunnerDebateMembers {
  const { policy } = version;
  return Object.freeze({
    judgeBound: policy.bounds.JUDGE,
    composerBound: policy.bounds.COMPOSER,
    conformanceBound: policy.bounds.CONFORMANCE,
    judgeContractHash: policy.hashes.judge,
    composerContractHash: policy.hashes.composer,
    conformanceContractHash: policy.hashes.conformance,
    propagationContractHash: policy.hashes.propagation,
    serveContractHash: policy.hashes.serve,
    factBundleVersion: version.registerVersion,
    compositionRow: policy.compositionRow,
    servePolicy: {
      compositionBudgets: policy.compositionBudgets,
      candidateConfidenceBand: policy.candidateConfidenceBand,
      bandCeiling: policy.bandCeiling
    },
    judgementPolicy: policy.judgementPolicy,
    scoringOperator: policy.scoringOperator,
    runDeathPolicy: policy.runDeathPolicy,
    hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold,
    verdictLabelPolicy: policy.verdictLabelPolicy,
    panelPolicy: policy.panelPolicy,
    stoppingPolicy: policy.stoppingPolicy,
    // S6-2 / T9 (board F33 class): the SHIPPED entry point must LOAD and PASS
    // every register family the run reads. Without this line the claim-time
    // gate refuses every work item and no statement is ever synthesized.
    synthesisRolePolicy: policy.synthesisRolePolicy,
    // Debate shape (spec 2026-10-12 §3): null without the row (today's runner).
    debateShape: version.debateShape,
    // Engine redesign (R1d): null without the engine row (engine 1, today's runner).
    engine: version.engine,
    // Side-by-side spec §13 (S6 reads them): the version's story policy and its debate call lanes.
    storyPolicy: version.storyPolicy,
    callLaneLimits: version.callLaneLimits
  });
}

export type RunnerSettingsResolution =
  | Readonly<{ kind: "SETTINGS"; version: RunnerVersionSettings }>
  | Readonly<{ kind: "UNSUPPORTED"; code: string }>;

/** A code-shaped refusal message (`CODE` or `CODE:detail`, the house TypeError form); prose is never a code. */
const REFUSAL_CODE = /^[A-Z][A-Z0-9_]{2,}(?::[A-Za-z0-9_.:/-]+)?$/u;

/**
 * The code of a TYPED refusal: a TypedDomainError's code, or a TypeError/Error whose whole message is a code (the house
 * form the register readers refuse with, e.g. CALL_CONCURRENCY_POLICY_INVALID). Anything else (a database connection
 * error, a runtime TypeError in prose) is null: untyped, so never cached.
 */
function typedRefusalCode(error: unknown): string | null {
  if (error instanceof TypedDomainError) return error.code;
  return error instanceof Error && REFUSAL_CODE.test(error.message) ? error.message : null;
}

type CacheEntry =
  | Readonly<{ kind: "SETTINGS"; version: RunnerVersionSettings }>
  | Readonly<{ kind: "UNSUPPORTED"; code: string; error: unknown }>;

/**
 * Side-by-side spec §13 runner point 2 — THE PER-VERSION CACHE, for the life of the process. A sealed version never
 * changes, so each is loaded once: concurrent asks share one load; a typed refusal is kept as UNSUPPORTED with its code
 * (one content-free DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED line) and never loaded again; an untyped failure (the database
 * unreachable) is not kept, so the next ask loads again. `requireSettings` is the boot's: it rethrows the loader's own
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
        const code = typedRefusalCode(error);
        if (code === null) throw error;
        const entry = Object.freeze({ kind: "UNSUPPORTED" as const, code, error });
        settled.set(version, entry);
        input.log({ kind: "DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED", version: String(version), code });
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
