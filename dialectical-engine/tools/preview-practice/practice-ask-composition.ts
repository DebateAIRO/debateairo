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
 * HOSTED mode (owner rulings 2026-10-13) adds main.ts's hosted ask wiring, in `composePracticeAskMoney` below: the
 * sealed-envelope and support-scope boot refusals, the daily guard over both money rows, and, with the band, THE ROOM
 * (the site's day at its close edge, the waiting line, the estimate from recent runs), the picker's per-run money
 * limits and the refusal of a run ceiling below one call. The boot questions are asked of the register exactly as the
 * server's API asks them, billing included (assertBillingReady with the register's own billingPolicy), so a version
 * the hosted API would refuse to start on is refused here too.
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
import { PostgresAskApplication, preserveSubmittedTierSource, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import { ProviderProbeRepository, readRoleRotationCounts, RunWaitRepository } from "@debateai/db";
import { readDeploymentMakerCapability } from "@debateai/critique";
import { TypedDomainError, type RiskTier } from "@debateai/kernel";
import { PLAN_TIER_ROSTERS, askQuestionMaxBytes } from "@debateai/contract";
import {
  CostEnvelopeGuard,
  NO_PERSON_ALLOWANCE,
  PostgresModelSpendStore,
  PostgresRecentRunUsageSource,
  RecentRunsCostEstimator,
  assertRunCeilingCoversOneCall,
  costEnvelopeGuardPolicy,
  mostOneRunMaySpendMicros
} from "@debateai/budget";
import { firstCallsByPlanRoster, firstPositionCallProjections } from "@debateai/judgement";
import { firstCallPlanModels } from "@debateai/scorecard";
import {
  assertDeploymentProviderTargets,
  assertPreviewProviderTargets,
  assertPreviewRoleTargets,
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
  computeStructuralCeilingBasis,
  costEnvelopeBand,
  costEnvelopeCeilings,
  debateShapeInForce,
  engineInForce,
  readAdmissionPolicy,
  readAnswerRoleRotationPolicy,
  readBillingPlans,
  readBillingPolicy,
  readCallTokenCeilings,
  readCostEnvelopePolicy,
  readDebateShapePolicy,
  readDeploymentRiskTier,
  readEngineVersion,
  readEngineVersionPolicy,
  readEnvelopeFormulaInputs,
  readJudgeTokenCeiling,
  lengthGuidedFirstCallCeiling,
  readLengthGuidancePolicy,
  readModelScorecard,
  readPanelDiscoveryPolicy,
  readQuestionLanguagePolicy,
  readStoryPolicyFromRegister,
  readStructuralCeilingPolicyInputs,
  resolveEffectiveRiskTier,
  type DeploymentMode,
  type LengthGuidancePolicy
} from "@debateai/register";
import { composeAskModelPicker } from "../../apps/api/src/ask-model-picker.js";
import { assertEngineHasLengthPolicy } from "../../apps/api/src/engine-ask.js";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import { PostgresAskAdmissionGate } from "../../apps/api/src/release-state.js";
import { buildApiProviderPriceMap, createProviderDiscoveryResolver } from "../../apps/api/src/provider-discovery.js";
import { readPreviewBudgetGateSettings } from "../../apps/api/src/preview-budget-estimate.js";
import { composeQuestionLanguage, questionLanguageRouteFor } from "../../apps/api/src/question-language/boot.js";
import type { QuestionLanguageChoiceNeeded, QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import { newQuestionLanguageReferenceKey } from "../../apps/api/src/question-language/reference.js";
import { practicePinsRequireRotation, practiceRotationCountsWithPins, type PracticeWriterPins } from "./practice-pins.js";
import type { PracticeSettings, PracticeSockets } from "./practice-settings.js";

/** The read-only "what is left today" answer of each gate, over the forwarded sockets. */
export function practiceRemainingPorts(settings: PracticeSettings, sockets: PracticeSockets) {
  const scope = settings.previewConfig.scope_id;
  const deepinfra = createPreviewRemainingRpcPort({ budget_socket: sockets.deepinfra, scope_id: scope });
  const anthropic = createPreviewRemainingRpcPort({ budget_socket: sockets.anthropic, scope_id: scope });
  return Object.freeze({
    deepinfra: (signal?: AbortSignal): Promise<PreviewGateRemaining> => deepinfra.remaining(signal),
    anthropic: (signal?: AbortSignal): Promise<PreviewGateRemaining> => anthropic.remaining(signal)
  });
}

/**
 * HOSTED only (null in local mode, where main.ts builds none of it): apps/api/src/main.ts's money stages, in its order
 * and with its statements (tests/unit/preview-practice-hosted.test.ts pins them): "support-admission-scopes",
 * "cost-envelope-policy" and the daily guard, then "ask-room" with billing kept off (see the file's head).
 */
export async function composePracticeAskMoney(input: Readonly<{
  pool: Pool;
  /** The room's own decision pool (main.ts: API_DATABASE_POOLS.roomDecision), distinct from `pool`; hosted only. */
  roomDecisionPool?: Pool;
  registerVersion: number;
  deploymentMode: DeploymentMode;
  /** Side-by-side spec §1, §3: the practice's one release key is read from here, as its runner reads it. */
  settings: Readonly<{ runner: Pick<PracticeSettings["runner"], "RELEASE_KEY"> }>;
  declaredProviderTargets: Parameters<typeof buildApiProviderPriceMap>[0];
  log?: (line: string) => void;
}>) {
  const { pool, settings } = input;
  const environment = Object.freeze({ DEPLOYMENT_MODE: input.deploymentMode, REGISTER_VERSION: input.registerVersion });
  if (environment.DEPLOYMENT_MODE !== "hosted") return null;
  assertHostedCostEnvelopesSealed(environment.DEPLOYMENT_MODE);
  const admissionPolicy = await readAdmissionPolicy(pool, environment.REGISTER_VERSION);
  assertHostedSupportAdmissionSealed(environment.DEPLOYMENT_MODE, admissionPolicy);
  const costEnvelopeRows = await (async () => {
    const runPolicy = await readCostEnvelopePolicy(pool, environment.REGISTER_VERSION);
    const storyPolicy = await readStoryPolicyFromRegister(pool, environment.REGISTER_VERSION)
      .catch((error: unknown) => {
        input.log?.(JSON.stringify({ kind: "DEBATEAI_STORY", event: "STORY_POLICY_UNREADABLE",
          code: error instanceof TypedDomainError ? error.code : "UNTYPED" }));
        return null;
      });
    return Object.freeze({ runPolicy, guardPolicy: costEnvelopeGuardPolicy(runPolicy, storyPolicy) });
  })();
  const costEnvelopeGuard = new CostEnvelopeGuard({ store: new PostgresModelSpendStore(pool), policy: costEnvelopeRows.guardPolicy });
  // main.ts's "ask-room" stage: the readiness question with the register's OWN billingPolicy (refuses exactly as the
  // hosted API's boot does). Its answer (the plans when billing is on) is kept only for the report and the boot's
  // run-ceiling question: the practice's room is built with billing off.
  const registerBillingPlans = assertBillingReady({
    policy: await readBillingPolicy(pool, environment.REGISTER_VERSION),
    plans: await readBillingPlans(pool, environment.REGISTER_VERSION),
    envelope: costEnvelopeRows.runPolicy
  });
  const billingPlans = null;
  const band = costEnvelopeBand(costEnvelopeRows.runPolicy);
  let askRoom: AskRoom | undefined;
  if (band === null) {
    const stranded = await new RunWaitRepository(pool).countWaiting();
    if (stranded > 0) {
      throw new TypedDomainError(
        "WAITING_LINE_REQUIRES_BAND",
        "Questions are waiting in line, and a register version without the band has no waker to start them"
      );
    }
  } else {
    assertAskRoomAdmissionSealed({ envelope: costEnvelopeRows.runPolicy, admission: admissionPolicy });
    const spend = new PostgresModelSpendStore(pool);
    const entitlements = null;
    // Side-by-side spec §9 (C17), as main.ts: no funding read and no funding refusal at boot. main.ts builds the funding
    // source only with billing on; billing is kept off here, so there is none (the room gets no `funding`).
    const personAllowance = NO_PERSON_ALLOWANCE;
    const estimator = new RecentRunsCostEstimator({
      source: new PostgresRecentRunUsageSource(pool),
      prices: buildApiProviderPriceMap(input.declaredProviderTargets, environment.DEPLOYMENT_MODE),
      maximumMicros: mostOneRunMaySpendMicros(costEnvelopeRows.guardPolicy)
    });
    if (input.roomDecisionPool === undefined) throw new TypeError("PRACTICE_ROOM_POOL_REQUIRED");
    const room = new AskRoom({
      lockPool: input.roomDecisionPool,
      spend,
      line: new RunWaitRepository(pool),
      estimator,
      personAllowance,
      entitlements,
      billingPlans,
      dailyCeilingMicros: costEnvelopeRows.runPolicy.dailyCeilingMicros,
      closeBasisPoints: band.closeBasisPoints,
      waitingLinePerPerson: band.waitingLinePerPerson,
      // Side-by-side C8, as main.ts: the site's cap of debates and the release re-check, in the decision's lock. The
      // practice's throwaway database records no release and its runner lives in this process, so it is the only
      // release there is: read as not hosted ("no row, not hosted" is current), under the key its runs are stamped with
      // and its runner claims under (settings.runner.RELEASE_KEY, practice-settings.ts practiceReleaseKey).
      gate: new PostgresAskAdmissionGate({ releaseKey: settings.runner.RELEASE_KEY, hosted: false })
    });
    askRoom = room;
  }
  return Object.freeze({
    costEnvelopeRows, costEnvelopeGuard, askRoom,
    /** What the register says (the practice runs billing off either way). */
    billingInRegister: registerBillingPlans === null ? "off" as const : "on" as const,
    /** The boot's run-ceiling question prices Free on its own roster when billing is on (main.ts, paid plans S4b). */
    registerBillingEnabled: registerBillingPlans !== null
  });
}

/**
 * main.ts's "run-ceiling-covers-one-call" stage (hosted, with the band): a run ceiling below the first position's own
 * call at the cheapest price among each plan's models refuses (RUN_CEILING_BELOW_ONE_CALL). Asked with the register's
 * own billing state, as the server's boot asks it.
 */
async function assertPracticeRunCeilingCoversOneCall(input: Readonly<{
  pool: Pool;
  registerVersion: number;
  money: NonNullable<Awaited<ReturnType<typeof composePracticeAskMoney>>>;
  declaredProviderTargets: Parameters<typeof firstPositionCallProjections>[0]["targets"];
  scorecardState: string;
  /** main.ts's `debateShapeInForcePolicy !== null`: a shaped run's first call carries the locked language. */
  questionLanguageLocked: boolean;
  /** Length guidance (spec 2026-10-15 §3.3), as main.ts: the first call is checked at the largest guided opening allowance. */
  lengthGuidancePolicy: LengthGuidancePolicy | null;
}>): Promise<void> {
  const { pool, money: { costEnvelopeRows }, declaredProviderTargets } = input;
  const billingEnabled = input.money.registerBillingEnabled;
  if (costEnvelopeBand(costEnvelopeRows.runPolicy) === null) return;
  const firstCalls = firstPositionCallProjections({
    targets: declaredProviderTargets,
    judgeTokenCeiling: lengthGuidedFirstCallCeiling(await readJudgeTokenCeiling(pool, input.registerVersion), input.lengthGuidancePolicy),
    questionMaxBytes: askQuestionMaxBytes(),
    // Pre-flight PF-L38, as main.ts: with the debate-shape row in force a run may be shaped, and its first call carries
    // the locked language: priced at the longest lock too. Row absent (or switched off): today's price.
    questionLanguageLocked: input.questionLanguageLocked,
    // Length guidance (spec 2026-10-15 §3.2), as main.ts: with the row the first call is the lengthed variant.
    lengthed: input.lengthGuidancePolicy !== null
  });
  assertRunCeilingCoversOneCall({
    bodyCeilingMicros: costEnvelopeCeilings(costEnvelopeRows.runPolicy).bodyMicros,
    firstCallsByRoster: firstCallsByPlanRoster({
      projections: firstCalls,
      rosters: firstCallPlanModels({
        scorecardInForce: input.scorecardState === "VALID",
        rosters: PLAN_TIER_ROSTERS,
        models: firstCalls.map((call) => call.model),
        ownRosterOnly: billingEnabled ? ["free"] : []
      })
    })
  });
}

const BOOT = Object.freeze({
  run: async <T>(_stage: string, step: () => Promise<T> | T): Promise<T> => step(),
  runSync: <T>(_stage: string, step: () => T): T => step()
});

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
  const version = settings.runner.REGISTER_VERSION;
  const previewConfig = settings.previewConfig;
  const deploymentMakers = await readDeploymentMakerCapability(pool, version);
  const discoveryPolicy = await readPanelDiscoveryPolicy(pool, version);
  const structuralInputs = await readStructuralCeilingPolicyInputs(pool, version);
  const envelopeFormulaInputs = await readEnvelopeFormulaInputs(pool, version);
  const probes = new ProviderProbeRepository(pool);
  const declaredProviderTargets = parseProviderDiscoveryTargets(
    settings.runner.PROVIDER_DISCOVERY_TARGETS_JSON, deploymentMakers.configuredProviders);
  assertDeploymentProviderTargets(declaredProviderTargets, { mode: settings.runner.DEPLOYMENT_MODE, nodeEnv: settings.runner.NODE_ENV });
  assertPricedProviderTargets(declaredProviderTargets, settings.runner.DEPLOYMENT_MODE);
  assertPreviewProviderTargets(previewConfig, declaredProviderTargets);
  if ((await readModelScorecard(pool, version, await readEngineVersion())).state === "VALID") {
    throw new TypedDomainError("PREVIEW_SCORECARD_CONFLICT", "Preview roster cannot override a valid scorecard");
  }
  const previewFetch = createPreviewGuardedFetch(input.budgetPorts);
  const gateSettings = await readPreviewBudgetGateSettings(pool, version, previewConfig,
    declaredProviderTargets.map((target) => target.model));
  assertPreviewRoleTargets(previewConfig, declaredProviderTargets, gateSettings.roleProviderRefs);
  // The one seam: the read-only answer comes over the forwarded sockets, not the configuration's server paths.
  const previewBudgetGate = Object.freeze({ ...gateSettings, remaining: practiceRemainingPorts(settings, input.sockets) });
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
  // Hosted only: the money stages (null in local mode, which builds none of them).
  const money = await composePracticeAskMoney({
    pool, registerVersion: version, deploymentMode: settings.runner.DEPLOYMENT_MODE, settings, declaredProviderTargets,
    ...(input.roomDecisionPool === undefined ? {} : { roomDecisionPool: input.roomDecisionPool }),
    ...(input.log === undefined ? {} : { log: input.log })
  });
  const costEnvelopeRows = money?.costEnvelopeRows;
  const costEnvelopeGuard = money?.costEnvelopeGuard;
  const askRoom = money?.askRoom;
  const callTokenCeilings = await readCallTokenCeilings(pool, version);
  // Debate shape (spec 2026-10-12 §3.1): as main.ts reads it; the practice runner's composition resolves the shape.
  const debateShapePolicy = await readDebateShapePolicy(pool, version);
  // As main.ts: the row in force for the ask side (amendment 2026-10-13, the preview's rollback).
  const debateShapeInForcePolicy = debateShapeInForce(debateShapePolicy);
  // Length guidance (spec 2026-10-15 §3.1): as main.ts reads it.
  const lengthGuidancePolicy = await readLengthGuidancePolicy(pool, version);
  // Engine redesign (R1d), as main.ts: the row, the boot rule (in force without the length row refuses), and the row in
  // force for the ask side. The throwaway practice register is the only place the practice writes it (Task 20).
  const engineVersionPolicy = await readEngineVersionPolicy(pool, version);
  const engineInForcePolicy = engineInForce(engineVersionPolicy);
  assertEngineHasLengthPolicy(engineInForcePolicy, lengthGuidancePolicy);
  // Question language (spec 2026-10-13), as main.ts composes it: only with the shape row in force. The route is the
  // practice's guarded fetch when it has the Anthropic gate (ruling L-ROUTE), else no fast check. One process and no
  // blind-index key here, so the check reference key is per process. The same in hosted mode: the hosted preview still
  // has its preview configuration, so main.ts takes this preview route there too (never its hosted route, L-ROUTE).
  const questionLanguage = debateShapeInForcePolicy === null ? undefined : await composeQuestionLanguage({
    policy: await readQuestionLanguagePolicy(pool, version),
    route: questionLanguageRouteFor({
      previewConfigured: true,
      previewFetch,
      // The forwarded Anthropic gate socket, when the practice has a port on it (the seam main.ts reads from the config).
      anthropicSocket: input.budgetPorts.anthropic === undefined ? undefined : input.sockets.anthropic,
      hosted: () => { throw new TypeError("PRACTICE_QUESTION_LANGUAGE_HOSTED_ROUTE"); }
    }),
    clock: () => new Date(),
    maxQuestionBytes: askQuestionMaxBytes(),
    referenceKey: newQuestionLanguageReferenceKey(),
    ...(input.onQuestionLanguage === undefined ? {} : { onDecided: input.onQuestionLanguage })
  });
  const modelPicker = await composeAskModelPicker({
    boot: BOOT,
    pool,
    deploymentMode: settings.runner.DEPLOYMENT_MODE,
    registerVersion: version,
    targets: declaredProviderTargets,
    perRunCeilingMicros: costEnvelopeRows?.guardPolicy.perRunCeilingMicros ?? null,
    callTokenCeilings,
    moneyPolicy: costEnvelopeRows?.guardPolicy ?? null,
    // Billing kept off in the practice (the file's head says why); on the preview it changes nothing here, because the
    // picker's billing rules apply only under a VALID scorecard, which the preview refuses (PREVIEW_SCORECARD_CONFLICT).
    billingEnabled: false,
    debateShapePolicy: debateShapeInForcePolicy,
    lengthGuidancePolicy,
    log: (line) => input.log?.(line)
  });
  if (money !== null) {
    await assertPracticeRunCeilingCoversOneCall({ pool, registerVersion: version, money, declaredProviderTargets,
      scorecardState: modelPicker.scorecard.state, questionLanguageLocked: debateShapeInForcePolicy !== null,
      lengthGuidancePolicy });
  }
  const deploymentRiskTier = await readDeploymentRiskTier(pool, version);
  const answerRoleRotation = await readAnswerRoleRotationPolicy(pool, version);
  // Pinned final writers (R1d): they work through the rotation; refused with the rotation off, before any AI is asked.
  if (input.pins !== undefined) practicePinsRequireRotation(input.pins, answerRoleRotation.state === "ON");
  const runSettings: RunCreationSettings = {
    previewProviderTestConfig: previewConfig, previewTeamUserIds: [...input.teamUserIds],
    previewBudgetGate,
    strangerSampleRate: settings.strangerSampleRate,
    registerVersion: version,
    // Side-by-side spec §1, §3, as main.ts: every practice run is stamped, with the one key its runner claims under
    // (practice-runner-composition.ts reads the same settings.runner.RELEASE_KEY); a run stamped with another key would
    // be NO_WORK for that runner.
    releaseKey: settings.runner.RELEASE_KEY,
    batteryVersion: settings.batteryVersion,
    settlementWatchHandle: settings.settlementWatchHandle,
    // Hosted, as main.ts: the room when it is composed (the band), else the daily guard; neither locally. No `billing`.
    ...(askRoom !== undefined
      ? { room: askRoom, waitingLine: askRoom }
      : costEnvelopeGuard === undefined ? {} : {
          assertDailyCostEnvelope: () => costEnvelopeGuard.assertDailyEnvelopeAdmitsNewRun()
        }),
    resolveDiscoveredPanel: resolveProviderPanel,
    modelPicker,
    // Pinned final writers (R1d, INTERFACE §15.2, counts mechanism): the counts the rotation reads give the pinned model
    // share 0 in its role and every other preview model share 1, so the rotation's own rule picks it when it is on the
    // panel; the checkers still come from another maker. Without a pin: main.ts's own counts, unchanged.
    ...(answerRoleRotation.state === "ON" ? { roleRotation: { readCounts: async () => {
      const counts = await readRoleRotationCounts(pool);
      return input.pins === undefined ? counts : practiceRotationCountsWithPins(counts, input.pins, previewConfig.premium_model_ids);
    } } } : {}),
    ...(debateShapeInForcePolicy === null ? {} : { debateShapePolicy: debateShapeInForcePolicy }),
    ...(lengthGuidancePolicy === null ? {} : { lengthGuidancePolicy }),
    ...(engineInForcePolicy === null ? {} : { engineVersionPolicy: engineInForcePolicy }),
    ...(questionLanguage === undefined ? {} : { questionLanguage }),
    resolveEnvelopeBasis: async (basis) => computeStructuralCeilingBasis({
      ...structuralInputs,
      panelSize: basis.panelSize,
      depth: Number(basis.depthParams.depth),
      maxRecompose: envelopeFormulaInputs.maxRecompose,
      branchingFactor: envelopeFormulaInputs.branchingFactor,
      compositionSegmentCap: envelopeFormulaInputs.compositionSegmentCap,
      fixedOrgansPerComposition: envelopeFormulaInputs.fixedOrgansPerComposition,
      reviewerCallsPerNode: envelopeFormulaInputs.reviewerCallsPerNode,
      synthesizerMaxRounds: envelopeFormulaInputs.synthesizerMaxRounds,
      evaluatorMaxRounds: envelopeFormulaInputs.evaluatorMaxRounds,
      maxDepth: envelopeFormulaInputs.maxDepth,
      backupSequencesProvisioned: basis.backupSequencesProvisioned,
      ...(basis.shape === null ? {} : { shape: basis.shape }),
      ...(basis.length === null ? {} : { length: basis.length }),
      ...(basis.engine === null ? {} : { engine: basis.engine })
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
  } as RunCreationSettings;
  const application = new PostgresAskApplication(pool, input.dispatcher, runSettings, undefined, input.provisionPool,
    Object.freeze({ server: input.serverAdmissionPool, legacy: input.legacyAdmissionPool }));
  return Object.freeze({ application, rotationOn: answerRoleRotation.state === "ON", declaredProviderTargets,
    configuredProviders: deploymentMakers.configuredProviders,
    hosted: money === null ? null : Object.freeze({ room: askRoom !== undefined, billingInRegister: money.billingInRegister,
      billingInPractice: "off" as const }) });
}
