/**
 * Preview practice: the ask path, composed exactly as apps/api/src/main.ts composes it on the preview.
 *
 * Plain words: a practice debate starts the way a person's debate starts on the preview: the same health check of
 * each model (one probe per model, a busy model sits out), the same start-of-debate estimate against what each gate
 * says is left today, the same role rotation, the same admission and the same `submit` that creates the run, pins
 * the roles and queues the first job. The API's process (mail, sign-in, billing, Hatchet) is not booted; its preview
 * wiring is mirrored here, and tests/unit/preview-practice-wiring-drift.test.ts fails when the settings main.ts hands
 * PostgresAskApplication gain a key this file does not hand it (hosted-only keys excepted).
 *
 * Side-by-side spec §13: every per-version admission read (the preview's line-up and gate terms, the per-run money and
 * the story's reserve, the shape, length, engine and question-language rows, the picker, the run ceiling against one
 * call, the risk tier, the role rotation) is made by main.ts's ONE loader (apps/api/src/admission-settings.ts), over the
 * same site context, and kept in the same per-version cache beside the same activation-pointer reader.
 *
 * HOSTED mode (owner rulings 2026-10-13) adds main.ts's hosted ask wiring, in `composePracticeAskMoney` (before the
 * loader) and `composePracticeAskRoom` (after it) below: the sealed-envelope and support-scope boot refusals, the
 * site's day and band, the daily guard over both money rows (the loader's), and, with the band, THE ROOM (the site's
 * day at its close edge, the waiting line, the estimate from recent runs). The boot questions are asked of the register
 * exactly as the server's API asks them, billing included (assertBillingReady with the register's own billingPolicy),
 * so a version the hosted API would refuse to start on is refused here too.
 *
 * BILLING IS KEPT OFF in the practice's ask, whatever the register says (the server's own "hosted, billing off"
 * composition, H6 of deploy/preview-release/v1/README.md): no `billing` member (the server-decided plan tier, the
 * person's plan windows and the run's charge scope), and the room built with no person allowance, no entitlements and
 * no plans. Why: with billing on, a person's ask is held to the plan that person bought through NETOPIA's sandbox; the
 * practice's throwaway person has bought nothing (a real purchase needs NETOPIA, Quaderno and the server's key files,
 * which the practice must never touch), so it would run as an unpaid Free account and its walls would measure a
 * fabricated person, not the release. Billing's own flows (checkout, NETOPIA's notify message, invoices, mail) are
 * tested on the server with the sandbox cards (H7/H8). Everything the debate path spends is still held to the hosted
 * rules: the per-run ceiling, the story's own ceiling, the site's day, the priced targets.
 *
 * Differences from main.ts, all on purpose:
 *  - The gate ports (paid calls and the read-only "what is left" answer) are the forwarded sockets, watched by the
 *    practice's gate watcher, not the configuration's server paths.
 *  - The team is the practice's one throwaway person; the dispatcher is the practice's own (no Hatchet).
 *  - All pools are the throwaway database's (its superuser): a missing grant on the live roles would not show here.
 *  - Hosted: billing kept off (above); the room's money ledger and waiting line are the throwaway database's, so the
 *    site's day holds only this practice's spend; no waker is started (a practice ask that would WAIT is reported as
 *    not admitted, ASK_WAITING_IN_LINE); the staff settings are not exported, and with billing off no funding source is
 *    built, so an internal-funding selection is neither read nor refused (side-by-side spec §9, C17, as main.ts).
 */
import type { Pool } from "pg";
import { PostgresAskApplication, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import { ProviderProbeRepository, RunWaitRepository } from "@debateai/db";
import { readDeploymentMakerCapability } from "@debateai/critique";
import { TypedDomainError } from "@debateai/kernel";
import {
  NO_PERSON_ALLOWANCE,
  PostgresModelSpendStore,
  PostgresRecentRunUsageSource,
  type CostEstimator
} from "@debateai/budget";
import {
  assertDeploymentProviderTargets,
  assertPricedProviderTargets,
  createPreviewGuardedFetch,
  createPreviewRemainingRpcPort,
  parseProviderDiscoveryTargets,
  PREVIEW_GLM_DEADLINE_MS,
  previewProbeControls,
  resolveProviderTargetCredentials,
  type PreviewBudgetPorts,
  type PreviewGateRemaining
} from "@debateai/providers";
import {
  assertAskRoomAdmissionSealed,
  assertBillingReady,
  assertHostedCostEnvelopesSealed,
  assertHostedSupportAdmissionSealed,
  costEnvelopeBand,
  readAdmissionPolicy,
  readBillingPlans,
  readBillingPolicy,
  readCostEnvelopePolicy,
  readPanelDiscoveryPolicy,
  type CostEnvelopePolicy,
  type DeploymentMode
} from "@debateai/register";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import { PostgresAskAdmissionGate } from "../../apps/api/src/release-state.js";
import { buildApiProviderPriceMap, createProviderDiscoveryResolver } from "../../apps/api/src/provider-discovery.js";
import {
  admissionSettingsOfVersion,
  createAdmissionSettingsCache,
  loadAdmissionSettings,
  type AdmissionRunMembers,
  type AdmissionSiteContext
} from "../../apps/api/src/admission-settings.js";
import { createActiveSettingsVersionReader } from "../../apps/api/src/active-settings-version.js";
import { questionLanguageRouteFor } from "../../apps/api/src/question-language/boot.js";
import type { QuestionLanguageChoiceNeeded, QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import { newQuestionLanguageReferenceKey } from "../../apps/api/src/question-language/reference.js";
import { practicePinsRequireRotation, practiceRotationCountsWithPins, type PracticeWriterPins } from "./practice-pins.js";
import type { PracticeSettings, PracticeSockets } from "./practice-settings.js";

/** The read-only "what is left today" answer of each gate, over the forwarded sockets (the gate part's scope). */
export function practiceRemainingPorts(settings: PracticeSettings, sockets: PracticeSockets) {
  const scope = settings.runner.PREVIEW_GATE_SETTINGS.scope_id;
  const deepinfra = createPreviewRemainingRpcPort({ budget_socket: sockets.deepinfra, scope_id: scope });
  const anthropic = createPreviewRemainingRpcPort({ budget_socket: sockets.anthropic, scope_id: scope });
  return Object.freeze({
    deepinfra: (signal?: AbortSignal): Promise<PreviewGateRemaining> => deepinfra.remaining(signal),
    anthropic: (signal?: AbortSignal): Promise<PreviewGateRemaining> => anthropic.remaining(signal)
  });
}

/**
 * HOSTED only (null in local mode, where main.ts builds none of it): apps/api/src/main.ts's site money stages, in its
 * order and with its statements, BEFORE the admission loader: the sealed-envelope and support-scope boot refusals,
 * "site-cost-envelope-policy" (the site's day and band), then "ask-room"'s boot questions with the register's own
 * billingPolicy (refuses exactly as the hosted API's boot does). The per-version money (the run's ceiling, the story's
 * reserve, the daily guard and the room's estimator) is the loader's; the room is built after it
 * (`composePracticeAskRoom`), with billing kept off (see the file's head).
 */
export async function composePracticeAskMoney(input: Readonly<{
  pool: Pool;
  registerVersion: number;
  deploymentMode: DeploymentMode;
}>) {
  const { pool } = input;
  const environment = Object.freeze({ DEPLOYMENT_MODE: input.deploymentMode, REGISTER_VERSION: input.registerVersion });
  if (environment.DEPLOYMENT_MODE !== "hosted") return null;
  assertHostedCostEnvelopesSealed(environment.DEPLOYMENT_MODE);
  const admissionPolicy = await readAdmissionPolicy(pool, environment.REGISTER_VERSION);
  assertHostedSupportAdmissionSealed(environment.DEPLOYMENT_MODE, admissionPolicy);
  const siteCostEnvelopePolicy: CostEnvelopePolicy = await readCostEnvelopePolicy(pool, environment.REGISTER_VERSION);
  // main.ts's "ask-room" stage: the readiness question with the register's OWN billingPolicy (refuses exactly as the
  // hosted API's boot does). Its answer (the plans when billing is on) is kept for the report and, as main.ts's
  // `billingEnabled`, for the loader's picker and run-ceiling stages: the practice's room is built with billing off.
  const registerBillingPlans = assertBillingReady({
    policy: await readBillingPolicy(pool, environment.REGISTER_VERSION),
    plans: await readBillingPlans(pool, environment.REGISTER_VERSION),
    envelope: siteCostEnvelopePolicy
  });
  const band = costEnvelopeBand(siteCostEnvelopePolicy);
  if (band === null) {
    const stranded = await new RunWaitRepository(pool).countWaiting();
    if (stranded > 0) {
      throw new TypedDomainError(
        "WAITING_LINE_REQUIRES_BAND",
        "Questions are waiting in line, and a register version without the band has no waker to start them"
      );
    }
  } else {
    assertAskRoomAdmissionSealed({ envelope: siteCostEnvelopePolicy, admission: admissionPolicy });
  }
  return Object.freeze({
    siteCostEnvelopePolicy, band,
    /** What the register says (the practice runs billing off either way). */
    billingInRegister: registerBillingPlans === null ? "off" as const : "on" as const,
    /** main.ts's `billingEnabled`: the loader's picker and run ceiling read the register's own billing state. */
    registerBillingEnabled: registerBillingPlans !== null
  });
}

/**
 * main.ts's "ask-room-composition" (hosted, with the band), after the admission loader: THE ROOM over the site
 * version's estimator and each version's own (`estimatorFor`), with billing kept off (no person allowance, no
 * entitlements, no plans, no funding).
 */
export function composePracticeAskRoom(input: Readonly<{
  pool: Pool;
  /** The room's own decision pool (main.ts: API_DATABASE_POOLS.roomDecision), distinct from `pool`; hosted only. */
  roomDecisionPool?: Pool;
  /** Side-by-side spec §1, §3: the practice's one release key is read from here, as its runner reads it. */
  settings: Readonly<{ runner: Pick<PracticeSettings["runner"], "RELEASE_KEY"> }>;
  money: NonNullable<Awaited<ReturnType<typeof composePracticeAskMoney>>>;
  estimator: CostEstimator | null;
  estimatorFor: (registerVersion: number) => Promise<CostEstimator>;
}>): AskRoom | undefined {
  const { pool, settings, money } = input;
  const band = money.band;
  if (band === null) return undefined;
  const spend = new PostgresModelSpendStore(pool);
  const billingPlans = null;
  const entitlements = null;
  // Side-by-side spec §9 (C17), as main.ts: no funding read and no funding refusal at boot. main.ts builds the funding
  // source only with billing on; billing is kept off here, so there is none (the room gets no `funding`).
  const personAllowance = NO_PERSON_ALLOWANCE;
  const estimator = input.estimator;
  if (estimator === null) throw new TypeError("ASK_ROOM_ESTIMATOR_REQUIRED");
  if (input.roomDecisionPool === undefined) throw new TypeError("PRACTICE_ROOM_POOL_REQUIRED");
  const room = new AskRoom({
    lockPool: input.roomDecisionPool,
    spend,
    line: new RunWaitRepository(pool),
    estimator,
    estimatorFor: input.estimatorFor,
    personAllowance,
    entitlements,
    billingPlans,
    dailyCeilingMicros: money.siteCostEnvelopePolicy.dailyCeilingMicros,
    closeBasisPoints: band.closeBasisPoints,
    waitingLinePerPerson: band.waitingLinePerPerson,
    // Side-by-side C8, as main.ts: the site's cap of debates and the release re-check, in the decision's lock. The
    // practice's throwaway database records no release and its runner lives in this process, so it is the only
    // release there is: read as not hosted ("no row, not hosted" is current), under the key its runs are stamped with
    // and its runner claims under (settings.runner.RELEASE_KEY, practice-settings.ts practiceReleaseKey).
    gate: new PostgresAskAdmissionGate({ releaseKey: settings.runner.RELEASE_KEY, hosted: false })
  });
  return room;
}

export async function composePracticeAsk(input: Readonly<{
  pool: Pool;
  /** Pools that must be distinct objects (the API's content-provision and the two admission pools). */
  provisionPool: Pool;
  serverAdmissionPool: Pool;
  legacyAdmissionPool: Pool;
  settings: PracticeSettings;
  sockets: PracticeSockets;
  /** The two gate ports (forwarded and watched). */
  budgetPorts: PreviewBudgetPorts;
  dispatcher: Dispatcher;
  teamUserIds: readonly string[];
  /** Hosted only: the room's own decision pool (distinct from the others). Absent in local mode, where no room exists. */
  roomDecisionPool?: Pool;
  log?: (line: string) => void;
  /** Question language (P2d's report): each lock or offer the decider makes. Never wired to a logger. */
  onQuestionLanguage?: (outcome: QuestionLanguageLock | QuestionLanguageChoiceNeeded) => void;
  /** Pinned final writers (R1d, `--answer-writer-model`, `--storyteller-model`): steer the rotation's counts, never the pin table. */
  pins?: PracticeWriterPins;
}>) {
  const { pool, settings } = input;
  const environment = settings.runner;
  // Addition D14-D16 / ruling R25, as main.ts: "is this the preview?" keys on the gate part; each settings version's
  // line-up is the admission loader's, composed over it.
  const previewGate = environment.PREVIEW_GATE_SETTINGS;
  const deploymentMakers = await readDeploymentMakerCapability(pool, environment.REGISTER_VERSION);
  const discoveryPolicy = await readPanelDiscoveryPolicy(pool, environment.REGISTER_VERSION);
  const probes = new ProviderProbeRepository(pool);
  const declaredProviderTargets = parseProviderDiscoveryTargets(
    environment.PROVIDER_DISCOVERY_TARGETS_JSON, deploymentMakers.configuredProviders);
  assertDeploymentProviderTargets(declaredProviderTargets, { mode: environment.DEPLOYMENT_MODE, nodeEnv: environment.NODE_ENV });
  assertPricedProviderTargets(declaredProviderTargets, environment.DEPLOYMENT_MODE);
  const previewFetch = createPreviewGuardedFetch(input.budgetPorts);
  const providerDiscoveryTargets = resolveProviderTargetCredentials(declaredProviderTargets, () => {
    throw new TypeError("PRACTICE_TARGET_DECLARES_A_CREDENTIAL");
  });
  const resolveProviderPanel = createProviderDiscoveryResolver({
    configuredProviders: deploymentMakers.configuredProviders,
    targets: providerDiscoveryTargets,
    probes,
    probeFreshnessMs: discoveryPolicy.probeFreshnessMs,
    probeTimeoutMs: PREVIEW_GLM_DEADLINE_MS,
    probeControlsFor: previewProbeControls, fetchImplementation: previewFetch, previewRound: true
  });
  // Hosted only: main.ts's site money stages, before the loader (null in local mode, which builds none of them).
  const money = await composePracticeAskMoney({ pool, registerVersion: environment.REGISTER_VERSION, deploymentMode: environment.DEPLOYMENT_MODE });
  /**
   * Side-by-side spec §13, as main.ts: THE SITE CONTEXT of the one per-version admission loader. Differences, on purpose:
   * the gates' "what is left" answer comes over the forwarded sockets; the question-language route is the practice's
   * guarded fetch when it has the Anthropic gate (ruling L-ROUTE), else no fast check, and its reference key is per
   * process (one process, no blind-index key). The same in hosted mode: the hosted preview still has its preview
   * configuration, so main.ts takes this preview route there too (never its hosted route, L-ROUTE).
   */
  const admissionSite: AdmissionSiteContext = Object.freeze({
    siteVersion: environment.REGISTER_VERSION,
    deploymentMode: environment.DEPLOYMENT_MODE,
    preview: previewGate === undefined ? undefined : { gate: previewGate, envLineUp: environment.PREVIEW_ENV_LINE_UP ?? null },
    declaredProviderTargets,
    siteCostEnvelope: money === null ? null : { runPolicy: money.siteCostEnvelopePolicy, band: money.band },
    billingEnabled: money?.registerBillingEnabled ?? false,
    // V-28(2), as main.ts: the daily guard's store only without the room (hosted); with it the room decides instead.
    spend: money === null || money.band !== null ? null : new PostgresModelSpendStore(pool),
    recentRunUsage: money === null || money.band === null ? null : new PostgresRecentRunUsageSource(pool),
    prices: buildApiProviderPriceMap(declaredProviderTargets, environment.DEPLOYMENT_MODE),
    questionLanguage: Object.freeze({
      routeFor: async () => questionLanguageRouteFor({
        previewConfigured: true,
        previewFetch,
        // The forwarded Anthropic gate socket, when the practice has a port on it (the seam main.ts reads from the config).
        anthropicSocket: input.budgetPorts.anthropic === undefined ? undefined : input.sockets.anthropic,
        hosted: () => { throw new TypeError("PRACTICE_QUESTION_LANGUAGE_HOSTED_ROUTE"); }
      }),
      referenceKey: newQuestionLanguageReferenceKey(),
      ...(input.onQuestionLanguage === undefined ? {} : { onDecided: input.onQuestionLanguage })
    }),
    // The one seam: the read-only answer comes over the forwarded sockets, not the configuration's server paths.
    previewRemaining: practiceRemainingPorts(settings, input.sockets),
    log: (line: string) => input.log?.(line)
  });
  // As main.ts: the site version, loaded by the one loader (its refusals refuse the practice with the same codes).
  const siteAdmission = await loadAdmissionSettings(pool, environment.REGISTER_VERSION, admissionSite);
  const admissionCache = createAdmissionSettingsCache({
    load: (version) => loadAdmissionSettings(pool, version, admissionSite),
    seed: siteAdmission
  });
  // As main.ts: the activation pointer's one reader, read once (a database that cannot answer it refuses the practice).
  const activeSettings = createActiveSettingsVersionReader({
    pool, siteVersion: environment.REGISTER_VERSION, ...(input.log === undefined ? {} : { log: (line) => input.log?.(JSON.stringify(line)) })
  });
  await activeSettings.current();
  const askRoom = money === null ? undefined : composePracticeAskRoom({
    pool, settings, money, estimator: siteAdmission.estimator,
    estimatorFor: async (version) => (await admissionCache.admissionSettingsFor(version)).estimator!,
    ...(input.roomDecisionPool === undefined ? {} : { roomDecisionPool: input.roomDecisionPool })
  });
  // Pinned final writers (R1d): they work through the rotation; refused with the rotation off, before any AI is asked.
  if (input.pins !== undefined) practicePinsRequireRotation(input.pins, siteAdmission.roleRotation !== null);
  /**
   * Pinned final writers (R1d, INTERFACE §15.2, counts mechanism): the counts the rotation reads give the pinned model
   * share 0 in its role and every other preview model share 1, so the rotation's own rule picks it when it is on the
   * panel; the checkers still come from another maker. Without a pin: main.ts's own members, unchanged. Applied to every
   * version's members (the defaults and S10's per-ask read alike).
   */
  const practiceMembersOf = (members: AdmissionRunMembers): AdmissionRunMembers => {
    const pins = input.pins;
    const rotation = members.roleRotation;
    const premium = members.previewProviderTestConfig?.premium_model_ids ?? [];
    return pins === undefined || rotation === undefined ? members : Object.freeze({
      ...members,
      roleRotation: { readCounts: async () => practiceRotationCountsWithPins(await rotation.readCounts(), pins, premium) }
    });
  };
  const runSettings: RunCreationSettings = {
    // Side-by-side spec §13, as main.ts: the site version's members by the one mapping (the defaults).
    ...practiceMembersOf(admissionSettingsOfVersion(siteAdmission)),
    previewTeamUserIds: [...input.teamUserIds],
    strangerSampleRate: settings.strangerSampleRate,
    // Side-by-side spec §1, §3, as main.ts: every practice run is stamped, with the one key its runner claims under
    // (practice-runner-composition.ts reads the same settings.runner.RELEASE_KEY); a run stamped with another key would
    // be NO_WORK for that runner.
    releaseKey: settings.runner.RELEASE_KEY,
    batteryVersion: settings.batteryVersion,
    settlementWatchHandle: settings.settlementWatchHandle,
    // Hosted, as main.ts: the room when it is composed (the band); else the mapping's daily guard; neither locally. No `billing`.
    ...(askRoom === undefined ? {} : { room: askRoom, waitingLine: askRoom }),
    resolveDiscoveredPanel: resolveProviderPanel,
    // Side-by-side spec §13, as main.ts: the active version and each version's members (S10 reads them per ask).
    admissionSettings: {
      activeSettingsVersion: () => activeSettings.current(),
      admissionSettingsFor: async (version: number) =>
        practiceMembersOf(admissionSettingsOfVersion(await admissionCache.admissionSettingsFor(version)))
    }
  } as RunCreationSettings;
  const application = new PostgresAskApplication(pool, input.dispatcher, runSettings, undefined, input.provisionPool,
    Object.freeze({ server: input.serverAdmissionPool, legacy: input.legacyAdmissionPool }));
  return Object.freeze({ application, rotationOn: siteAdmission.roleRotation !== null, declaredProviderTargets,
    configuredProviders: deploymentMakers.configuredProviders,
    hosted: money === null ? null : Object.freeze({ room: askRoom !== undefined, billingInRegister: money.billingInRegister,
      billingInPractice: "off" as const }) });
}
