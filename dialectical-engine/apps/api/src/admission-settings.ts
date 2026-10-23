import type { Pool } from "pg";
import { readRoleRotationCounts, settingsRefusalCode } from "@debateai/db";
import { TypedDomainError, type RiskTier } from "@debateai/kernel";
import { PLAN_TIER_ROSTERS, askQuestionMaxBytes, type AskRequest } from "@debateai/contract";
import {
  assertAskRoomAdmissionSealed,
  assertBillingReady,
  composeDebateCostEnvelope,
  computeStructuralCeilingBasis,
  costEnvelopeBand,
  costEnvelopeCeilings,
  debateShapeInForce,
  engineInForce,
  lengthGuidedFirstCallCeiling,
  readAnswerRoleRotationPolicy,
  readCallTokenCeilings,
  readCostEnvelopePolicy,
  readDebateShapePolicy,
  readDeploymentRiskTier,
  readEngineVersion,
  readEngineVersionPolicy,
  readEnvelopeFormulaInputs,
  readJudgeTokenCeiling,
  readLengthGuidancePolicy,
  readModelScorecard,
  readPreviewLineUpPolicy,
  readQuestionLanguagePolicy,
  readStoryPolicyFromRegister,
  readStructuralCeilingPolicyInputs,
  resolveEffectiveRiskTier,
  type AdmissionPolicy,
  type BillingPlans,
  type BillingPolicy,
  type CostEnvelopeBand,
  type CostEnvelopePolicy,
  type CostEstimateStartPolicy,
  type DebateShapePolicy,
  type DeploymentMode,
  type EngineVersionPolicy,
  type LengthGuidancePolicy,
  type QuestionLanguagePolicy
} from "@debateai/register";
import {
  CostEnvelopeGuard,
  PostgresModelSpendStore,
  PostgresRecentRunUsageSource,
  RecentRunsCostEstimator,
  assertRunCeilingCoversOneCall,
  costEnvelopeGuardPolicy,
  mostOneRunMaySpendMicros,
  type CostEnvelopeGuardInput,
  type ProviderTargetPrice,
  type RecentRunUsageSource
} from "@debateai/budget";
import { firstCallsByPlanRoster, firstPositionCallProjections } from "@debateai/judgement";
import { firstCallPlanModels, type RoleRotationCounts } from "@debateai/scorecard";
import {
  assertPreviewProviderTargets,
  assertPreviewRoleTargets,
  resolvePreviewLineUp,
  type PreviewGateSettings,
  type PreviewLineUp,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import { composeAskModelPicker, type AskModelPickerBoot, type AskModelPickerSettings, type CallTokenCeilings } from "./ask-model-picker.js";
import { assertEngineHasLengthPolicy } from "./engine-ask.js";
import { previewVersionTermsOf, readPreviewBudgetGateSettings, type PreviewBudgetGateSettings, type PreviewVersionTerms } from "./preview-budget-estimate.js";
import { composeQuestionLanguage, type QuestionLanguagePaidRoute } from "./question-language/boot.js";
import type { QuestionLanguageChoiceNeeded, QuestionLanguageLock, QuestionLanguagePort } from "./question-language/decider.js";
import type { QuestionLanguageReferenceKey } from "./question-language/reference.js";
import { preserveSubmittedTierSource, type AdmissionView, type RunCreationSettings } from "./index.js";
import { buildApiProviderPriceMap } from "./provider-discovery.js";

/**
 * Side-by-side spec §13 (settings changes without an upload), API points 1-3, and addition D16: THE API's ONE
 * per-version admission settings loader and its cache.
 *
 * Plain words: everything the API reads from one sealed settings version to admit an ask (the per-run money, the
 * envelope's formula inputs, the preview's AI line-up and its gate terms, the token ceilings, the debate shape, the
 * length guidance, the engine, the question language, the model picker, the run ceiling against one call, the risk
 * tier and the role rotation) is read here, by one function, for the version asked, under the boot stage names main.ts
 * always used. apps/api/src/main.ts and the preview practice (tools/preview-practice/practice-ask-composition.ts) both
 * compose the ask through it. The boot loads the site version (REGISTER_VERSION) and refuses with the loader's own
 * typed codes, as before; a sealed version never changes, so each loaded version is kept for the life of the process.
 * Since S10 every ask is admitted on the ACTIVE version (`askSettingsOf` in ./index.ts), which is the site
 * version while the pointer is empty (D1); the pages read the same version through `createAdmissionView`.
 *
 * The SITE members (what follows the release, not the debate: the deployment mode, the declared provider targets and
 * their prices, the gate part of the preview configuration, the day's money row and its band, billing, the spend and
 * usage stores, the question-language route) are read once at boot, outside this loader, and handed in as
 * `AdmissionSiteContext`. The loader never reads them from a version.
 */

/** Side-by-side spec §13: what the API knows of its release, read once at boot from the site version and the env. */
export type AdmissionSiteContext = Readonly<{
  siteVersion: number;
  deploymentMode: "local" | "hosted";
  /**
   * Addition D14-D16: the preview configuration's env part (`PREVIEW_GATE_SETTINGS`, `PREVIEW_ENV_LINE_UP`): the gate
   * part, and the old forms' line-up (null for the sockets-only form). Undefined off the preview.
   */
  preview: Readonly<{ gate: PreviewGateSettings; envLineUp: PreviewLineUp | null }> | undefined;
  declaredProviderTargets: readonly ProviderDiscoveryTarget[];
  /** Hosted only (null in local mode): the site version's costEnvelopePolicy row and its band (site members). */
  siteCostEnvelope: Readonly<{ runPolicy: CostEnvelopePolicy; band: CostEnvelopeBand | null }> | null;
  /** Paid plans S2/S4b: billing is on (hosted, the band, billingPolicy enabled with its plans): the picker and B9 read it. */
  billingEnabled: boolean;
  /**
   * V-28(2): the store of the daily guard, hosted WITHOUT the room only (null otherwise): the room decides an ask
   * instead of the guard (B6b), never both.
   */
  spend: PostgresModelSpendStore | null;
  /** B6b: the recent runs the room's estimator reads, hosted WITH the room only (null otherwise: no estimator). */
  recentRunUsage: RecentRunUsageSource | null;
  /** The declared targets' prices (`buildApiProviderPriceMap`), for the estimator. */
  prices: ReadonlyMap<string, ProviderTargetPrice>;
  /**
   * Fresh-site estimate (owner rulings 2026-10-22): the site version's optional `costEstimateStartPolicy` row (the
   * estimate's trusted minimum and per-depth starting figures; null without it = today's estimate). A SITE row
   * (settings-classification.ts: it follows the release), so every version's estimator starts from this one.
   */
  costEstimateStart: CostEstimateStartPolicy | null;
  /**
   * Question language (spec 2026-10-13): how this process reaches the fast check (main.ts: the preview's guarded fetch,
   * else the hosted route; the practice: its forwarded gate socket), asked per version with the version's policy and
   * the day ceiling its admission uses (ruling L-POT), and the reference key every API process of the site shares.
   */
  questionLanguage: Readonly<{
    routeFor(input: Readonly<{ policy: QuestionLanguagePolicy | null; dayCeilingMicros: number | null }>): Promise<QuestionLanguagePaidRoute>;
    referenceKey: QuestionLanguageReferenceKey;
    onDecided?: (outcome: QuestionLanguageLock | QuestionLanguageChoiceNeeded) => void;
  }>;
  /**
   * Contract A §5: the gates' read-only "what is left" answer, when the composition reaches the gates another way than
   * the configuration's own sockets (the practice's forwarded sockets). Absent: the configuration's (main.ts).
   */
  previewRemaining?: PreviewBudgetGateSettings["remaining"];
  /** One content-free line (the picker's MODEL_SCORECARD line, the story's STORY_POLICY_UNREADABLE line). */
  log: (line: string) => void;
}>;

/**
 * Budget spec 2026-09-28 §2.4-§2.7, paid-plans spec §2.4 (B6b, B4a, P4-G) and side-by-side spec §13 (S14, ruling R57) —
 * THE ROOM'S BOOT QUESTIONS, ONE DECISION, asked of the site's money row by main.ts's "ask-room" stage, the preview
 * practice's ask and check-version's API half alike. In order: B4a's one readiness check (R-5: billing switched on
 * without a billingPlans row, or without the band, refuses by name, BILLING_PLANS_UNRESOLVED /
 * BILLING_REQUIRES_ENVELOPE_MEMBERS, A22; it answers the plans when billing is on and null when off); then the band
 * (none: no room is built, null — the caller decides about a waiting line, which is live state); then, with the band,
 * the sealed askRoomReads budget (ASK_ROOM_ADMISSION_UNSEALED: with the band the room read is a real computation on
 * every call, go-live row 31). Pure: the caller reads the rows.
 */
export function decideAskRoomReadiness(input: Readonly<{
  envelope: CostEnvelopePolicy;
  admission: AdmissionPolicy;
  policy: BillingPolicy | null;
  plans: BillingPlans | null;
}>): Readonly<{ band: CostEnvelopeBand; billingPlans: BillingPlans | null }> | null {
  const billingPlans = assertBillingReady({ policy: input.policy, plans: input.plans, envelope: input.envelope });
  const band = costEnvelopeBand(input.envelope);
  if (band === null) return null;
  assertAskRoomAdmissionSealed({ envelope: input.envelope, admission: input.admission });
  return Object.freeze({ band, billingPlans });
}

/**
 * Side-by-side spec §13 (S14) — THE SITE CONTEXT, BUILT ONE WAY. apps/api/src/main.ts (inside its "admission-site" boot
 * stage), the preview practice's ask (tools/preview-practice/practice-ask-composition.ts) and `check-version`'s API half
 * (./settings-check.ts) all build `AdmissionSiteContext` here, from the site facts each read the same way (the declared
 * targets, the site's costEnvelopePolicy row, billing on or off, whether the room is built) and the parts each reaches
 * differently (the question-language route: main.ts's guarded fetch or hosted route, the practice's forwarded socket,
 * the check's route that can never call; the practice's forwarded "what is left" answer). What it derives is derived
 * here only: the preview's gate part and the env's line-up (addition D14-D16), the band of the site's row (budget spec
 * §2.4), the targets' prices, and which store the version's money uses — V-28(2)'s daily guard store only WITHOUT the
 * room (hosted), B6b's recent runs only WITH it: the room decides an ask instead of the guard, never both. Nothing here
 * reads or writes: the two stores only hold the pool.
 */
export function buildAdmissionSiteContext(input: Readonly<{
  pool: Pool;
  environment: Readonly<{
    REGISTER_VERSION: number;
    DEPLOYMENT_MODE: DeploymentMode;
    PREVIEW_GATE_SETTINGS: PreviewGateSettings | undefined;
    PREVIEW_ENV_LINE_UP?: PreviewLineUp | null | undefined;
  }>;
  declaredProviderTargets: readonly ProviderDiscoveryTarget[];
  /** Hosted only (null in local mode): the site version's costEnvelopePolicy row. */
  siteCostEnvelopePolicy: CostEnvelopePolicy | null;
  /** Hosted only (null in local mode, or without the row): the site version's costEstimateStartPolicy row. */
  costEstimateStartPolicy: CostEstimateStartPolicy | null;
  /**
   * The room's readiness answer (`decideAskRoomReadiness`): present exactly when the room is built (hosted, the site's
   * row carries the band); its plans are non-null exactly when billing is on (paid plans S2/S4b: the picker and B9 read it).
   */
  askRoomReadiness: Readonly<{ billingPlans: BillingPlans | null }> | null;
  questionLanguage: AdmissionSiteContext["questionLanguage"];
  previewRemaining?: AdmissionSiteContext["previewRemaining"];
  log: (line: string) => void;
}>): AdmissionSiteContext {
  const { pool, environment, declaredProviderTargets, siteCostEnvelopePolicy } = input;
  const askRoom = input.askRoomReadiness !== null;
  // Addition D14 / ruling R25: "is this the preview?" keys on the env's gate part, present for every accepted form.
  const previewGate = environment.PREVIEW_GATE_SETTINGS;
  return Object.freeze({
    siteVersion: environment.REGISTER_VERSION,
    deploymentMode: environment.DEPLOYMENT_MODE,
    preview: previewGate === undefined ? undefined : { gate: previewGate, envLineUp: environment.PREVIEW_ENV_LINE_UP ?? null },
    declaredProviderTargets,
    siteCostEnvelope: siteCostEnvelopePolicy === null ? null
      : { runPolicy: siteCostEnvelopePolicy, band: costEnvelopeBand(siteCostEnvelopePolicy) },
    // Paid plans S2/S4b: billing is on exactly when the room's readiness answer carries the plans.
    billingEnabled: (input.askRoomReadiness?.billingPlans ?? null) !== null,
    // V-28(2): the daily guard's store only without the room (hosted); with it the room decides instead, never both.
    spend: siteCostEnvelopePolicy === null || askRoom ? null : new PostgresModelSpendStore(pool),
    recentRunUsage: askRoom ? new PostgresRecentRunUsageSource(pool) : null,
    prices: buildApiProviderPriceMap(declaredProviderTargets, environment.DEPLOYMENT_MODE),
    costEstimateStart: input.costEstimateStartPolicy,
    questionLanguage: input.questionLanguage,
    ...(input.previewRemaining === undefined ? {} : { previewRemaining: input.previewRemaining }),
    log: input.log
  });
}

/** The members of `RunCreationSettings` a settings version decides (side-by-side spec §13; addition D16). */
export type AdmissionRunMembers = Pick<RunCreationSettings, "registerVersion" | "previewProviderTestConfig" | "previewBudgetGate"
  | "assertDailyCostEnvelope" | "resolveEnvelopeBasis" | "resolveRisk" | "modelPicker" | "roleRotation" | "debateShapePolicy"
  | "lengthGuidancePolicy" | "engineVersionPolicy" | "questionLanguage">;

/** One sealed version, as this API admits on it. Kept forever: sealed versions never change. */
export type AdmissionVersionSettings = Readonly<{
  registerVersion: number;
  /**
   * Hosted only (null in local mode): the version's money envelope (its per-run members over the site's day and band,
   * composeDebateCostEnvelope) and the guard policy over it and the version's story (costEnvelopeGuardPolicy).
   */
  costEnvelope: Readonly<{ runPolicy: CostEnvelopePolicy; guardPolicy: CostEnvelopeGuardInput["policy"] }> | null;
  /** V-28(2): the daily guard over the version's guard policy and the site's store; hosted without the room only. */
  dailyGuard: CostEnvelopeGuard | null;
  /** B6b: the room's estimate from recent runs, capped at what one run of this version may spend; with the room only. */
  estimator: RecentRunsCostEstimator | null;
  /** Addition D16: the version's own preview configuration (its line-up over the env's gate part); undefined off the preview. */
  previewConfig: PreviewProviderTestConfig | undefined;
  /** Contract A §5: the version's start-of-debate gate terms (preview only). */
  previewBudgetGate: PreviewBudgetGateSettings | undefined;
  callTokenCeilings: CallTokenCeilings;
  /** The rows in force for the ask side (null: absent, or switched off). */
  debateShapePolicy: DebateShapePolicy | null;
  lengthGuidancePolicy: LengthGuidancePolicy | null;
  engineVersionPolicy: EngineVersionPolicy | null;
  questionLanguage: QuestionLanguagePort | undefined;
  modelPicker: AskModelPickerSettings;
  /** Role rotation (spec 2026-10-11): the counts admission reads, only with the row ON. */
  roleRotation: Readonly<{ readCounts: () => Promise<RoleRotationCounts> }> | null;
  resolveEnvelopeBasis: RunCreationSettings["resolveEnvelopeBasis"];
  resolveRisk: RunCreationSettings["resolveRisk"];
}>;

/** Every register read and composition the loader makes, each handed the version it loads (unit tests inject them). */
export type AdmissionVersionReaders = Readonly<{
  readCostEnvelopePolicy: typeof readCostEnvelopePolicy;
  readStoryPolicyFromRegister: typeof readStoryPolicyFromRegister;
  readStructuralCeilingPolicyInputs: typeof readStructuralCeilingPolicyInputs;
  readEnvelopeFormulaInputs: typeof readEnvelopeFormulaInputs;
  readPreviewLineUpPolicy: typeof readPreviewLineUpPolicy;
  readModelScorecard: typeof readModelScorecard;
  readEngineVersion: () => Promise<string>;
  readPreviewBudgetGateSettings: typeof readPreviewBudgetGateSettings;
  readCallTokenCeilings: typeof readCallTokenCeilings;
  readDebateShapePolicy: typeof readDebateShapePolicy;
  readLengthGuidancePolicy: typeof readLengthGuidancePolicy;
  readEngineVersionPolicy: typeof readEngineVersionPolicy;
  readQuestionLanguagePolicy: typeof readQuestionLanguagePolicy;
  composeQuestionLanguage: typeof composeQuestionLanguage;
  composeAskModelPicker: typeof composeAskModelPicker;
  readJudgeTokenCeiling: typeof readJudgeTokenCeiling;
  readDeploymentRiskTier: typeof readDeploymentRiskTier;
  readAnswerRoleRotationPolicy: typeof readAnswerRoleRotationPolicy;
}>;

const ADMISSION_VERSION_READERS: AdmissionVersionReaders = Object.freeze({
  readCostEnvelopePolicy,
  readStoryPolicyFromRegister,
  readStructuralCeilingPolicyInputs,
  readEnvelopeFormulaInputs,
  readPreviewLineUpPolicy,
  readModelScorecard,
  readEngineVersion: () => readEngineVersion(),
  readPreviewBudgetGateSettings,
  readCallTokenCeilings,
  readDebateShapePolicy,
  readLengthGuidancePolicy,
  readEngineVersionPolicy,
  readQuestionLanguagePolicy,
  composeQuestionLanguage,
  composeAskModelPicker,
  readJudgeTokenCeiling,
  readDeploymentRiskTier,
  readAnswerRoleRotationPolicy
});

/** The boot ledger's stage, as main.ts hands it (`(name, run) => boot.run(name, …)`); absent: each step runs as it is. */
export type AdmissionStage = <T>(name: string, run: () => Promise<T> | T) => Promise<T>;

const UNSTAGED: AdmissionStage = async (_name, run) => run();

/**
 * Side-by-side spec §13 — ONE SEALED VERSION, LOADED FOR ADMISSION. The reads and checks main.ts made at boot for its
 * one REGISTER_VERSION, in main.ts's order and under its stage names, each handed `version` (never the site version).
 * Every step runs inside `stage` (main.ts: the boot ledger, DL7-F7), so a refusal at boot names its stage and zeroes the
 * keys held. Every reader's typed refusal propagates unchanged (the boot refuses with today's codes; the cache keeps
 * another version's refusal). The story rows are the exception they always were: a typed refusal of the story's rows is
 * `storyPolicy: null` (the day holds the run alone) and one content-free STORY_POLICY_UNREADABLE line; a database
 * failure propagates (ruling R32), so no version is kept story-less because of one passing blip.
 */
export async function loadAdmissionSettings(pool: Pool, version: number, site: AdmissionSiteContext,
  stage?: AdmissionStage, options?: Readonly<{ readers?: AdmissionVersionReaders }>): Promise<AdmissionVersionSettings> {
  const run = stage ?? UNSTAGED;
  const readers = options?.readers ?? ADMISSION_VERSION_READERS;
  const { declaredProviderTargets } = site;
  /**
   * V-28(2) and the verdict story (spec §8): the version's per-run money over the site's day and band, and the day's
   * reserve for the story beside the run. Engine money rule, Task M7: the ONE check over both money rows refuses the
   * version (STORY_DAILY_CEILING_INSUFFICIENT) when the day cannot hold one full run plus its story. Hosted only.
   */
  const siteEnvelope = site.siteCostEnvelope;
  const money = siteEnvelope === null ? null : await run("cost-envelope-policy", async () => {
    const runPolicy = composeDebateCostEnvelope(siteEnvelope.runPolicy, await readers.readCostEnvelopePolicy(pool, version));
    const storyPolicy = await readers.readStoryPolicyFromRegister(pool, version)
      .catch((error: unknown) => {
        const code = settingsRefusalCode(error);
        if (code === null) throw error;
        site.log(JSON.stringify({ kind: "DEBATEAI_STORY", event: "STORY_POLICY_UNREADABLE", code }));
        return null;
      });
    const guardPolicy = costEnvelopeGuardPolicy(runPolicy, storyPolicy);
    return Object.freeze({
      costEnvelope: Object.freeze({ runPolicy, guardPolicy }),
      // V-28(2): without the room, today's daily guard (its 429), over the version's guard policy and the site's store.
      dailyGuard: site.spend === null ? null : new CostEnvelopeGuard({ store: site.spend, policy: guardPolicy }),
      // B6b: with the room, its estimate from recent runs, capped at what one run of this version may spend.
      estimator: site.recentRunUsage === null ? null : new RecentRunsCostEstimator({
        source: site.recentRunUsage,
        prices: site.prices,
        maximumMicros: mostOneRunMaySpendMicros(guardPolicy),
        // Fresh-site estimate: the site's starting figures (a SITE row, read once from the site version).
        start: site.costEstimateStart
      })
    });
  });
  const costEnvelope = money?.costEnvelope ?? null;
  // Budget spec §2.4: the band is the site's (its finish edge is one wall for every debate), never a version's.
  const siteBand = siteEnvelope?.band ?? null;
  const structuralInputs = await run("structural-ceilings", () => readers.readStructuralCeilingPolicyInputs(pool, version));
  /** T17: the sealed `envelopeFormulaInputs` row (T16); a version that never sealed it is refused. */
  const envelopeFormulaInputs = await run("envelope-formula-inputs", () => readers.readEnvelopeFormulaInputs(pool, version));
  /**
   * Addition D14-D16: the version's own line-up (rosters and thinking levels), or the env's for a version without it,
   * by the one shared rule (resolvePreviewLineUp, ruling R17). PREVIEW_LINE_UP_REQUIRED / _ENV_CONFLICT /
   * _WITHOUT_PREVIEW refuse the site version at boot (D15) and make any other version unsupported.
   */
  const previewConfig = await run("preview-line-up", async () => resolvePreviewLineUp({
    preview: site.preview,
    row: await readers.readPreviewLineUpPolicy(pool, version),
    isSiteVersion: version === site.siteVersion
  }));
  // V-9(2): every roster model has a declared target, and a VALID scorecard is never overridden by the preview's roster.
  if (previewConfig !== undefined) {
    await run("preview-scorecard-conflict", async () => {
      assertPreviewProviderTargets(previewConfig, declaredProviderTargets);
      if ((await readers.readModelScorecard(pool, version, await readers.readEngineVersion())).state === "VALID") {
        throw new TypedDomainError("PREVIEW_SCORECARD_CONFLICT", "Preview roster cannot override a valid scorecard");
      }
    });
  }
  // Contract A §5: the preview's start-of-debate estimate asks the gate what is left today (read-only).
  const previewBudgetGate = previewConfig === undefined ? undefined : await run("preview-budget-gate", async () => {
    // Every declared target is health-checked at ask time, paid through the gate even when the ask is refused.
    const settings = await readers.readPreviewBudgetGateSettings(pool, version, previewConfig,
      declaredProviderTargets.map((target) => target.model));
    // Every role the register names must be a declared target, or its debates would fail at claim.
    assertPreviewRoleTargets(previewConfig, declaredProviderTargets, settings.roleProviderRefs);
    return site.previewRemaining === undefined ? settings : Object.freeze({ ...settings, remaining: site.previewRemaining });
  });
  const callTokenCeilings = await run("call-token-ceilings", () => readers.readCallTokenCeilings(pool, version));
  // Debate shape (spec 2026-10-12 §3.1): the optional row; absent = today's shape byte for byte, a malformed row refuses.
  const debateShapePolicy = await run("debate-shape-policy", () => readers.readDebateShapePolicy(pool, version));
  // The row in force for the ask side (amendment 2026-10-13, the preview's rollback): `enabled: false` is no row here.
  const debateShapeInForcePolicy = debateShapeInForce(debateShapePolicy);
  // Length guidance (spec 2026-10-15 §3.1): the optional row; absent = today's asks byte for byte, malformed = refused.
  const lengthGuidancePolicy = await run("length-guidance-policy", () => readers.readLengthGuidancePolicy(pool, version));
  // Engine redesign (R1d): the optional engine row; absent or `enabled: false` = engine 1; malformed = refused; in force
  // without the length row = refused (ENGINE_REQUIRES_LENGTH_POLICY).
  const engineVersionPolicy = await run("engine-version-policy", () => readers.readEngineVersionPolicy(pool, version));
  const engineInForcePolicy = engineInForce(engineVersionPolicy);
  await run("engine-requires-length-policy", () => assertEngineHasLengthPolicy(engineInForcePolicy, lengthGuidancePolicy));
  // Question language (spec 2026-10-13): only with the debate shape row in force (row absent, or `enabled: false`: no
  // row read, no eld load). A malformed row, an owner text carrying a frame token, or an unreviewed model refuses.
  const questionLanguage = debateShapeInForcePolicy === null ? undefined : await run("question-language", async () => {
    const policy = await readers.readQuestionLanguagePolicy(pool, version);
    return readers.composeQuestionLanguage({
      policy,
      // Ruling L-ROUTE / L-POT: the site's route, asked with this version's policy and the day ceiling its admission uses.
      route: await site.questionLanguage.routeFor({ policy, dayCeilingMicros: costEnvelope?.guardPolicy.dailyCeilingMicros ?? null }),
      clock: () => new Date(),
      maxQuestionBytes: askQuestionMaxBytes(),
      referenceKey: site.questionLanguage.referenceKey,
      ...(site.questionLanguage.onDecided === undefined ? {} : { onDecided: site.questionLanguage.onDecided })
    });
  });
  /**
   * A20 — the model scorecard of this version and the per-role picker, as the stages "model-scorecard" and
   * "model-picker" (composeAskModelPicker), with this version's per-run money and the site's billing switch.
   */
  const pickerBoot: AskModelPickerBoot = Object.freeze({
    run: <T>(name: string, operation: () => Promise<T>) => run(name, operation),
    runSync: <T>(name: string, decision: () => T) => run(name, decision)
  });
  const modelPicker = await readers.composeAskModelPicker({
    boot: pickerBoot,
    pool,
    deploymentMode: site.deploymentMode,
    registerVersion: version,
    targets: declaredProviderTargets,
    perRunCeilingMicros: costEnvelope?.guardPolicy.perRunCeilingMicros ?? null,
    callTokenCeilings,
    moneyPolicy: costEnvelope?.guardPolicy ?? null,
    billingEnabled: site.billingEnabled,
    // Debate shape (P2b Task 6, pre-flight PF-B22): only the Free answer-job check reads it (the row's largest writer bound).
    debateShapePolicy: debateShapeInForcePolicy,
    lengthGuidancePolicy,
    log: site.log
  });
  /**
   * B9 (budget spec §2.10): a run ceiling below the first position's own call at the cheapest price among each plan's
   * models refuses the version (RUN_CEILING_BELOW_ONE_CALL). Hosted, and only with the site's band. The per-run ceiling
   * is the version's; with a VALID scorecard each plan is seated from every configured model, except Free while billing
   * is on (paid plans S4b), which is priced on its own roster.
   */
  await run("run-ceiling-covers-one-call", async () => {
    if (costEnvelope === null || siteBand === null) return;
    const firstCalls = firstPositionCallProjections({
      targets: declaredProviderTargets,
      // Length guidance (spec 2026-10-15 §3.3): a first position may ask up to the largest guided opening allowance.
      judgeTokenCeiling: lengthGuidedFirstCallCeiling(await readers.readJudgeTokenCeiling(pool, version), lengthGuidancePolicy),
      questionMaxBytes: askQuestionMaxBytes(),
      // Pre-flight PF-L38: with the debate-shape row in force a run may be shaped, and its first call carries the locked
      // language: priced at the longest lock too. Row absent: today's.
      questionLanguageLocked: debateShapeInForcePolicy !== null,
      // Length guidance (spec 2026-10-15 §3.2): with the row a first call is the lengthed variant.
      lengthed: lengthGuidancePolicy !== null
    });
    assertRunCeilingCoversOneCall({
      bodyCeilingMicros: costEnvelopeCeilings(costEnvelope.runPolicy).bodyMicros,
      firstCallsByRoster: firstCallsByPlanRoster({
        projections: firstCalls,
        rosters: firstCallPlanModels({
          scorecardInForce: modelPicker.scorecard.state === "VALID",
          rosters: PLAN_TIER_ROSTERS,
          models: firstCalls.map((call) => call.model),
          ownRosterOnly: site.billingEnabled ? ["free"] : []
        })
      })
    });
  });
  const deploymentRiskTier = await run("deployment-risk-tier", () => readers.readDeploymentRiskTier(pool, version));
  // Role rotation (spec 2026-10-11): the optional row; ABSENT/OFF is today's engine, a malformed row refuses.
  const answerRoleRotation = await run("answer-role-rotation-policy", () => readers.readAnswerRoleRotationPolicy(pool, version));
  return Object.freeze({
    registerVersion: version,
    costEnvelope,
    dailyGuard: money?.dailyGuard ?? null,
    estimator: money?.estimator ?? null,
    previewConfig,
    previewBudgetGate,
    callTokenCeilings,
    debateShapePolicy: debateShapeInForcePolicy,
    lengthGuidancePolicy,
    engineVersionPolicy: engineInForcePolicy,
    questionLanguage,
    modelPicker,
    // Role rotation (spec 2026-10-11 Part 4): admission reads the counts only with the row ON.
    roleRotation: answerRoleRotation.state === "ON" ? Object.freeze({ readCounts: () => readRoleRotationCounts(pool) }) : null,
    resolveEnvelopeBasis: async (input) => computeStructuralCeilingBasis({
      ...structuralInputs,
      panelSize: input.panelSize,
      depth: Number(input.depthParams.depth),
      maxRecompose: envelopeFormulaInputs.maxRecompose,
      branchingFactor: envelopeFormulaInputs.branchingFactor,
      compositionSegmentCap: envelopeFormulaInputs.compositionSegmentCap,
      fixedOrgansPerComposition: envelopeFormulaInputs.fixedOrgansPerComposition,
      reviewerCallsPerNode: envelopeFormulaInputs.reviewerCallsPerNode,
      synthesizerMaxRounds: envelopeFormulaInputs.synthesizerMaxRounds,
      evaluatorMaxRounds: envelopeFormulaInputs.evaluatorMaxRounds,
      maxDepth: envelopeFormulaInputs.maxDepth,
      // A14/A20 (F17): DR-184-v5 only when the pinned assignment has a runner-up.
      backupSequencesProvisioned: input.backupSequencesProvisioned,
      // Debate shape (spec 2026-10-12 §3.6): the sizes admission resolved for this panel, or today's shape.
      ...(input.shape === null ? {} : { shape: input.shape }),
      // Length guidance (spec 2026-10-15 §3.1): the numbers admission resolved, or none (today's receipt).
      ...(input.length === null ? {} : { length: input.length }),
      // Engine redesign (R1d): engine 2's settings admission resolved for this panel, or none (today's receipt).
      ...(input.engine === null ? {} : { engine: input.engine })
    }),
    resolveRisk(askerRiskTier: RiskTier, askerTierSource: AskRequest["tier_source"], askerProvenanceRef: string) {
      const resolved = resolveEffectiveRiskTier({
        askerTier: askerRiskTier,
        askerProvenanceRef,
        policyLevels: {
          parent: {},
          run: {},
          deployment: { riskTier: deploymentRiskTier.value }
        }
      });
      return preserveSubmittedTierSource(resolved, askerTierSource);
    }
  });
}

/**
 * Side-by-side spec §13: one version's members of `RunCreationSettings`, the ONE mapping main.ts and the practice spread
 * into PostgresAskApplication's settings (the site version's, the defaults) and S10's per-ask read hands every
 * admission helper. A member the version does not have is absent (today's single-version wiring, byte for byte).
 */
export function admissionSettingsOfVersion(version: AdmissionVersionSettings): AdmissionRunMembers {
  const { dailyGuard, previewConfig, previewBudgetGate, roleRotation, debateShapePolicy, lengthGuidancePolicy,
    engineVersionPolicy, questionLanguage } = version;
  return Object.freeze({
    registerVersion: version.registerVersion,
    // Addition D16: the version's composed preview configuration (its line-up), exposed to the ask path.
    ...(previewConfig === undefined ? {} : { previewProviderTestConfig: previewConfig }),
    ...(previewBudgetGate === undefined ? {} : { previewBudgetGate }),
    // V-28(2): asked FIRST of every new ask without the room, before the panel is discovered (a probe is a request).
    ...(dailyGuard === null ? {} : { assertDailyCostEnvelope: () => dailyGuard.assertDailyEnvelopeAdmitsNewRun() }),
    resolveEnvelopeBasis: version.resolveEnvelopeBasis,
    resolveRisk: version.resolveRisk,
    modelPicker: version.modelPicker,
    ...(roleRotation === null ? {} : { roleRotation }),
    ...(debateShapePolicy === null ? {} : { debateShapePolicy }),
    ...(lengthGuidancePolicy === null ? {} : { lengthGuidancePolicy }),
    ...(engineVersionPolicy === null ? {} : { engineVersionPolicy }),
    ...(questionLanguage === undefined ? {} : { questionLanguage })
  });
}

/** Ruling R31: a settings refusal is `settingsRefusalCode` (@debateai/db, the runner's cache's too); a database failure
 * never is. */
type CacheEntry =
  | Readonly<{ kind: "SETTINGS"; version: AdmissionVersionSettings }>
  | Readonly<{ kind: "UNSUPPORTED"; error: unknown }>;

/**
 * Side-by-side spec §13 API point 2 — THE PER-VERSION CACHE, for the life of the process. The site version is the seed
 * (loaded at boot, served without a load); any other version is loaded once, concurrent asks sharing the load, and kept
 * forever. A settings refusal (typed, or a code-shaped message) is kept too, and every later ask for that version gets
 * the same refusal without a load. A database failure (ruling R31) or an untyped error is not kept: that ask is
 * refused and the next one loads again.
 * Spec §8 and plan C16 (S10): on the preview, an unfinished debate admitted on another version is priced at that
 * version's own terms. Each version's gate settings ask THIS cache for them (`termsForVersion` → that version's loaded
 * gate settings, `previewVersionTermsOf`), so a version is read once per process, with every other member of it, and
 * its terms come from its own line-up (addition D16). A version the cache refuses rejects there, and the estimate prices
 * that debate at the asking version's own terms with its one line (`versionTermsFallback`): never a refused ask.
 */
export function createAdmissionSettingsCache(input: Readonly<{
  load: (version: number) => Promise<AdmissionVersionSettings>;
  seed: AdmissionVersionSettings;
}>): Readonly<{ admissionSettingsFor(version: number): Promise<AdmissionVersionSettings> }> {
  const termsFor = (version: number): Promise<PreviewVersionTerms> => {
    if (!Number.isSafeInteger(version) || version < 1) return Promise.reject(new TypeError("PREVIEW_REGISTER_VERSION_INVALID"));
    return cache.admissionSettingsFor(version).then((settings) => {
      if (settings.previewBudgetGate === undefined) throw new TypeError("PREVIEW_VERSION_TERMS_UNAVAILABLE");
      return previewVersionTermsOf(settings.previewBudgetGate);
    });
  };
  /** A version as kept: its preview gate settings (when it has them) read other versions' terms through the cache. */
  const routed = (version: AdmissionVersionSettings): AdmissionVersionSettings => {
    const gate = version.previewBudgetGate;
    if (gate === undefined) return version;
    return Object.freeze({ ...version, previewBudgetGate: Object.freeze({ ...gate, termsForVersion: termsFor }) });
  };
  const settled = new Map<number, CacheEntry>([
    [input.seed.registerVersion, Object.freeze({ kind: "SETTINGS" as const, version: routed(input.seed) })]
  ]);
  const pending = new Map<number, Promise<AdmissionVersionSettings>>();
  const cache = Object.freeze({
    admissionSettingsFor(version: number): Promise<AdmissionVersionSettings> {
      const done = settled.get(version);
      if (done !== undefined) {
        return done.kind === "SETTINGS" ? Promise.resolve(done.version) : Promise.reject(done.error);
      }
      const inFlight = pending.get(version);
      if (inFlight !== undefined) return inFlight;
      const loading = input.load(version).then(
        (loaded) => {
          const settings = routed(loaded);
          settled.set(version, Object.freeze({ kind: "SETTINGS" as const, version: settings }));
          return settings;
        },
        (error: unknown) => {
          if (settingsRefusalCode(error) !== null) settled.set(version, Object.freeze({ kind: "UNSUPPORTED" as const, error }));
          throw error;
        }
      ).finally(() => { pending.delete(version); });
      pending.set(version, loading);
      return loading;
    }
  });
  return cache;
}

/**
 * Side-by-side spec §13 (Task S10): what one version says to the pages (`AdmissionView`, buildApi's `admissionView`):
 * its number, its shape and length rows in force, whether its picker's scorecard is VALID, and (addition D16) its
 * composed preview configuration.
 */
export function admissionViewOf(version: AdmissionVersionSettings): AdmissionView {
  return Object.freeze({
    registerVersion: version.registerVersion,
    ...(version.debateShapePolicy === null ? {} : { debateShapePolicy: version.debateShapePolicy }),
    ...(version.lengthGuidancePolicy === null ? {} : { lengthGuidancePolicy: version.lengthGuidancePolicy }),
    modelScorecardInForce: version.modelPicker.scorecard.state === "VALID",
    ...(version.previewConfig === undefined ? {} : { previewProviderTestConfig: version.previewConfig })
  });
}

/**
 * Side-by-side spec §13 (Task S10) — THE ACTIVE VERSION, AS THE PAGES READ IT: GET /v1/asks/room and GET /v1/session ask
 * this once per request (the pointer's one-second cache, then the per-version cache), so /new advises on the version
 * the next ask is admitted on. Their answers only advise (the ask is authoritative and refuses on its own), so a version
 * the cache refuses with a settings code (never in practice: activation needs a PASS of the same loader) is answered
 * from `fallback` (the site version) with one ADMISSION_SETTINGS_UNSUPPORTED line per version; a database failure
 * propagates, as any route's.
 */
export function createAdmissionView(input: Readonly<{
  activeSettingsVersion: () => Promise<number>;
  admissionSettingsFor: (version: number) => Promise<AdmissionVersionSettings>;
  fallback: AdmissionVersionSettings;
  log: (line: string) => void;
}>): () => Promise<AdmissionView> {
  const views = new Map<number, AdmissionView>();
  const said = new Set<number>();
  const fallbackView = admissionViewOf(input.fallback);
  return async () => {
    const version = await input.activeSettingsVersion();
    const kept = views.get(version);
    if (kept !== undefined) return kept;
    let loaded: AdmissionVersionSettings;
    try {
      loaded = await input.admissionSettingsFor(version);
    } catch (error) {
      const code = settingsRefusalCode(error);
      if (code === null) throw error;
      if (!said.has(version)) {
        said.add(version);
        input.log(JSON.stringify({ kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_SETTINGS_UNSUPPORTED", version, cause: code }));
      }
      return fallbackView;
    }
    const view = admissionViewOf(loaded);
    views.set(version, view);
    return view;
  };
}
