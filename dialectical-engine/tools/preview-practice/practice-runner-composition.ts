/**
 * Preview practice: the runner, composed exactly as apps/runner/src/main.ts composes it on the preview.
 *
 * Plain words: the practice must exercise the same runner the live preview runs, with the same settings read from the
 * same register rows, the same five gateways and the same claim probes. main.ts is a process entry point (environment,
 * key files, Hatchet), so it cannot be called; its preview wiring is mirrored here line for line, and
 * tests/unit/preview-practice-wiring-drift.test.ts reads both files and fails when the settings main.ts hands the
 * runner and this file hands it stop matching. That test, not this comment, is what keeps the two together.
 *
 * Both deployment modes (owner rulings 2026-10-13: the preview switches to hosted mode). In LOCAL mode nothing below
 * is built that main.ts does not build in local mode: no money guard, no shared wall, no billing read. In HOSTED mode the
 * runner gets main.ts's hosted money wiring, mirrored in `composePracticeRunnerMoney` below: the sealed per-run and
 * daily envelopes (costEnvelopePolicy), the story's own money row (storyCostEnvelopePolicy) through the one check over
 * both, the shared wall (the site's day at the band's finish edge, and each person's windows from the billingPlans row
 * over the read-only entitlement view), main.ts's refusal of a run ceiling below one call, every target's price on its
 * gateway, the story writer in hosted mode and the body cost fallback with the band. None of it reads billingPolicy
 * (amendment A20, as main.ts) or touches NETOPIA, Quaderno, SmartBill or mail: the runner never does.
 *
 * Differences from main.ts, all on purpose:
 *  - The two gate ports are passed in (the forwarded sockets, wrapped by the practice's gate watcher) instead of being
 *    built from the configuration's server socket paths; so are the gates' read-only `/remaining` readers, which set
 *    the call scheduler's gate slots, and the keep-alive pool the claim renewals use (the throwaway database's).
 *  - Local mode has no money guard, so of main.ts's two in-flight counters only the gateway's (attempts) exists there;
 *    hosted mode has both, as main.ts.
 *  - Hosted: the money ledger is the throwaway database's, so the site's day counts only this practice's own spend (the
 *    gates' daily pots, which the practice shares with the site, are the real limit). The person wall is built as on
 *    the server but holds nothing: billing is kept off in the practice's ask (practice-ask-composition.ts), so the
 *    practice's run has no charge scope, exactly as every run of a hosted server with billing off.
 *  - The call-concurrency setting can be handed in (`callConcurrency`, the practice's --call-concurrency) instead of
 *    read from the register; it is never written anywhere. The one scheduler and the one busy coordinator are watched
 *    (practice-parallel.ts: every lane's stats, each gate's slots at the start, each model's busy probes) for the
 *    report; the watching changes nothing they do.
 *  - No Hatchet, no worker, no start-up re-dispatch, no team gate: the practice calls executeWorkItem itself.
 *  - The story shape pack is the repository's own (the server's DEBATEAI_STORY_SHAPES_DIR is a server path).
 *  - `wait` (the runner's cooldown hold) and `sleep` (the preview policy's one 60-second resend) can be injected, for
 *    the integration test only; the real practice waits for real.
 */
import type { Pool } from "pg";
import { EntitlementRepository, PostgresInternalAllowanceRepository, RunRepository } from "@debateai/db";
import { BillingPersonAllowanceSource, FundingAwarePersonAllowanceSource } from "@debateai/billing-core";
import { createTerminalActivationEvaluator, WorkItemRepository } from "@debateai/battery";
import { TypedDomainError } from "@debateai/kernel";
import {
  assertHostedCostEnvelopesSealed,
  costEnvelopeBand,
  effectiveCallConcurrency,
  readBillingPlans,
  readCallConcurrencyPolicy,
  readCostEnvelopePolicy,
  type CallConcurrencyPolicy,
  type CostEnvelopeBand,
  type CostEnvelopePolicy,
  type DeploymentMode
} from "@debateai/register";
import {
  PostgresModelSpendStore,
  type CostEnvelopePhase,
  type SharedWallApplication
} from "@debateai/budget";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  assertDeploymentProviderTargets,
  assertPreviewTargetSet,
  assertPricedProviderTargets,
  createPreviewBusyCoordinator,
  createPreviewGuardedFetch,
  observeClaimTimeTarget,
  parseProviderDiscoveryTargets,
  PREVIEW_GLM_DEADLINE_MS,
  previewFinalWriterTierUnreadLine,
  previewProbeControls,
  previewRunResilience,
  previewSealedRoleFallbackCovered,
  previewStructureRepairCeiling,
  previewStructureRepairRoute,
  previewTargetGatewayControls,
  providerTargetGatewayControls,
  providerTargetPrice,
  resolveProviderTargetCredentials,
  withPreviewProviderCallPolicy,
  withStructureRepair,
  type PreviewBudgetPorts,
  type PreviewFinalWriterTierUnread,
  type PreviewGateRemaining,
  type PreviewGateSettings,
  type PreviewLineUp,
  type PreviewProviderName,
  type ProviderGateway
} from "@debateai/providers";
import { StoryWriter, loadStoryPack, resolveStoryPackDir, type StoryPack } from "@debateai/story";
import {
  buildProviderPriceMap,
  createPostgresProviderGateway,
  logBodyCostFallback,
  logServeDisclosure,
  plansUnresolvedPersonAllowance,
  WalkingSkeletonRunner
} from "@debateai/runner";
import { assertRunnerPrimaryProviderConfiguration, createRunnerProviderTopology, runnerConfiguredMakerRefs } from "../../apps/runner/src/provider-topology.js";
import { createCallScheduler, type CallSubject } from "../../apps/runner/src/call-scheduler.js";
import { applyPreviewGateCapacities, previewCallSubjects, previewGateNames, structureRepairThroughLane } from "../../apps/runner/src/call-lane-gateway.js";
import { createRunInFlight } from "../../apps/runner/src/run-in-flight.js";
import {
  createRunnerSettingsCache, createRunSettingsVersions, loadRunnerVersionSettings, runCostEnvelopeGuardOf, runnerSettingsOfVersion,
  type RunnerSiteContext
} from "../../apps/runner/src/run-settings.js";
import { createRunnerRetirementSignal } from "../../apps/runner/src/runner-retirement.js";
import { PracticeCallStats } from "./practice-parallel.js";

/** The runner settings the practice needs: the non-secret runner.env keys the operator exports (README step S-2). */
export type PracticeRunnerSettings = Readonly<{
  REGISTER_VERSION: number;
  /**
   * Side-by-side spec §1, §3: the practice's one release key (practice-settings.ts, practiceReleaseKey). Its runner runs
   * as this key and its ask stamps every run with it, so the runner never answers NO_WORK to its own practice debate.
   */
  RELEASE_KEY: string;
  /**
   * Addition D14-D16, as main.ts's environment carries them: the preview configuration's gate part, and the line-up its
   * env form carries (null for the sockets-only form), the fallback for a settings version without the line-up row.
   */
  PREVIEW_GATE_SETTINGS: PreviewGateSettings;
  PREVIEW_ENV_LINE_UP: PreviewLineUp | null;
  PROVIDER_DISCOVERY_TARGETS_JSON: string;
  DEPLOYMENT_MODE: DeploymentMode;
  NODE_ENV: "development" | "test" | "production" | undefined;
  PROVIDER_PROBE_TIMEOUT_MS: number;
  RUNNER_WORKER_ID: string;
  CLAIM_MS: number;
  CLAIM_MARGIN_MS: number;
  MAX_RECOMPOSE: number;
  JUDGEMENT_NUMBER_KIND: string;
  JUDGEMENT_PRODUCER: string;
  PROPAGATION_NUMBER_KIND: string;
  PROPAGATION_PRODUCER: string;
  PROVIDER_REF: string;
  VLLM_BASE_URL?: string | undefined;
  VLLM_MODEL?: string | undefined;
  VLLM_MAKER?: string | undefined;
}>;

export type PracticeRunnerComposition = Awaited<ReturnType<typeof composePracticeRunner>>;

/**
 * HOSTED only: main.ts's money wiring, line for line (its V-28 spend store and money in-flight counter, the B9 shared
 * wall and the funding admission: the money every version's guard shares, `RunnerSiteContext.money`), on the throwaway
 * database. Side-by-side spec §13 (S6), as main.ts: each version's guard over both money rows, and B9's
 * run-ceiling-below-one-call refusal, are the settings loader's (run-settings.ts). Returns null in local mode, where
 * main.ts builds none of it. tests/unit/preview-practice-wiring-drift.test.ts pins the statements below against main.ts's.
 */
export async function composePracticeRunnerMoney(input: Readonly<{
  pool: Pool;
  environment: PracticeRunnerSettings;
  /** The site's money row and its band, read as main.ts reads them before its settings loader (null in local mode). */
  costEnvelopePolicy: CostEnvelopePolicy | null;
  envelopeBand: CostEnvelopeBand | null;
  log?: (line: string) => void;
}>) {
  const { pool, environment, costEnvelopePolicy, envelopeBand } = input;
  if (environment.DEPLOYMENT_MODE !== "hosted") return null;
  const modelSpendStore = new PostgresModelSpendStore(pool);
  const moneyInFlight = createRunInFlight();
  const billingPlans = costEnvelopePolicy === null ? null : await readBillingPlans(pool, environment.REGISTER_VERSION);
  if (costEnvelopePolicy !== null && billingPlans === null) {
    (input.log ?? console.warn)(JSON.stringify({ kind: "DEBATEAI_PERSON_WALL", event: "PLANS_UNRESOLVED" }));
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
  return Object.freeze({
    /** `RunnerSiteContext.money`, as main.ts's literal. */
    site: Object.freeze({
      store: modelSpendStore,
      inFlight: moneyInFlight,
      ...(sharedWallTerms === null ? {} : { sharedWall: sharedWallTerms }),
      ...(fundingAllowance === undefined ? {} : { fundingAdmission: fundingAllowance })
    }),
    billingPlansSealed: billingPlans !== null
  });
}

export async function composePracticeRunner(input: Readonly<{
  pool: Pool;
  environment: PracticeRunnerSettings;
  /** The two gate ports (the forwarded sockets, watched). */
  budgetPorts: PreviewBudgetPorts;
  /** Each gate's read-only `/remaining` (the forwarded sockets): the call scheduler's gate slots, read once. */
  remaining: Readonly<Record<PreviewProviderName, () => Promise<PreviewGateRemaining>>>;
  /** The claim renewals' own pool (main.ts: RUNNER_DATABASE_POOLS.keepAlive), distinct from `pool`. */
  keepAlivePool: Pool;
  /** The practice's --call-concurrency: used as it is, instead of the register's row. Absent: the register's row (main.ts). */
  callConcurrency?: CallConcurrencyPolicy;
  /** Test seam: the runner's cooldown hold. Default: real time. */
  wait?: (milliseconds: number) => Promise<void>;
  /** Test seam: the preview call policy's and the claim probe's one 60-second resend. Default: real time. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** Content-free story log lines (codes and ids only). */
  storyLog?: (event: string, detail: Record<string, unknown>) => void;
  /**
   * Content-free settings-cache lines (DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED: a version and a code). Default: none, as the
   * story log: the practice loads only its site version, whose refusal is rethrown with its own code anyway.
   */
  settingsLog?: (line: Readonly<Record<string, unknown>>) => void;
}>) {
  const { pool, environment } = input;
  // Addition D14-D16, as main.ts: the gate part is the process's; the line-up is each settings version's own.
  const previewGate = environment.PREVIEW_GATE_SETTINGS;
  // As main.ts's first line: a hosted deployment may not claim work until the envelopes are sealed (local: nothing).
  assertHostedCostEnvelopesSealed(environment.DEPLOYMENT_MODE);
  const storyLog = input.storyLog ?? (() => undefined);
  let storyPack: StoryPack | { readonly error: string };
  try {
    storyPack = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
  } catch (error) {
    storyPack = Object.freeze({
      error: error instanceof TypedDomainError ? `${error.code}: ${error.message}` : "STORY_PACK_UNREADABLE"
    });
    storyLog("STORY_PACK_INVALID", { reason: storyPack.error });
  }
  const deploymentMakers = await readDeploymentMakerCapability(pool, environment.REGISTER_VERSION);
  const declaredProviderTargets = parseProviderDiscoveryTargets(
    environment.PROVIDER_DISCOVERY_TARGETS_JSON,
    deploymentMakers.configuredProviders
  );
  assertDeploymentProviderTargets(declaredProviderTargets, {
    mode: environment.DEPLOYMENT_MODE, nodeEnv: environment.NODE_ENV
  });
  assertPricedProviderTargets(declaredProviderTargets, environment.DEPLOYMENT_MODE);
  // Addition D16, as main.ts: the reviewed provider set once; the rosters, roles and scorecard per version (the loader).
  if (previewGate !== undefined) {
    assertPreviewTargetSet(declaredProviderTargets);
  }
  const previewFetch = createPreviewGuardedFetch(input.budgetPorts);
  // Hosted only (null in local mode), as main.ts: the site's money row and its band, read before the settings loader.
  const costEnvelopePolicy = environment.DEPLOYMENT_MODE === "hosted"
    ? await readCostEnvelopePolicy(pool, environment.REGISTER_VERSION)
    : null;
  const envelopeBand = costEnvelopePolicy === null ? null : costEnvelopeBand(costEnvelopePolicy);
  // Hosted only (null in local mode), as main.ts: the spend store, the money in-flight counter and the shared wall
  // every version's guard shares (RunnerSiteContext.money), built before the settings loader.
  const money = await composePracticeRunnerMoney({ pool, environment, costEnvelopePolicy, envelopeBand,
    log: (line) => { console.warn(line); } });
  /**
   * Side-by-side spec §13, as main.ts: every per-version read (the runner policy and its prompt fingerprints, the story's
   * rows, the preview line-up, the debate shape, the engine, the preview's roster, role and scorecard checks, the run
   * ceiling against one call, the call lanes) through the ONE loader (apps/runner/src/run-settings.ts), in both modes.
   */
  const runnerSite: RunnerSiteContext = Object.freeze({
    siteVersion: environment.REGISTER_VERSION,
    deploymentMode: environment.DEPLOYMENT_MODE,
    preview: previewGate === undefined ? undefined : { gate: previewGate, envLineUp: environment.PREVIEW_ENV_LINE_UP ?? null },
    declaredProviderTargets,
    siteCostEnvelopePolicy: costEnvelopePolicy,
    envelopeBand,
    claim: { claimMs: environment.CLAIM_MS, claimMarginMs: environment.CLAIM_MARGIN_MS },
    configuredMakerRefs: runnerConfiguredMakerRefs(declaredProviderTargets),
    money: money === null ? null : money.site
  });
  const runnerSettings = createRunnerSettingsCache({
    // The practice's story lines go to its own story log (main.ts's go to standard error).
    load: (version) => loadRunnerVersionSettings(pool, version, runnerSite, {
      log: ({ event, ...detail }) => { storyLog(String(event), detail); }
    }),
    log: input.settingsLog ?? (() => undefined)
  });
  const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);
  const { policy, storyPolicy } = siteVersionSettings;
  // Side-by-side spec §13 (S6), as main.ts: each claimed run's version by run id, and each call's own version's guard.
  const runSettingsVersions = createRunSettingsVersions();
  const runCostEnvelopeGuard = runCostEnvelopeGuardOf(runnerSettings, runSettingsVersions);
  // Parallel AI calls (spec 2026-10-12 §3.2-§3.5), as main.ts composes them on the preview.
  const gatewayInFlight = createRunInFlight();
  const callStats = new PracticeCallStats();
  const callPolicy = input.callConcurrency
    ?? effectiveCallConcurrency(await readCallConcurrencyPolicy(pool, environment.REGISTER_VERSION).then(callStats.noteRegisterRow));
  callStats.notePolicy(callPolicy, input.callConcurrency === undefined ? "REGISTER" : "FLAG");
  const runnerCallScheduler = callStats.observeScheduler(createCallScheduler({ policy: callPolicy }));
  await applyPreviewGateCapacities({
    scheduler: runnerCallScheduler,
    gates: previewGateNames(previewGate).map((gate) => ({ gate, remaining: input.remaining[gate] })),
    log: (line) => { callStats.gateCapacityLog(line); console.warn(line); }
  });
  const previewBusy = callStats.observeBusy(createPreviewBusyCoordinator());
  // Task 4 review fix 1, as main.ts: ONE notice for every target's policy (one line per gate and reason), codes only.
  const finalWriterTierUnread = (event: PreviewFinalWriterTierUnread): void => {
    console.warn(previewFinalWriterTierUnreadLine(event));
  };
  // The preview declares no credential (the gates hold the keys); the resolver must then find nothing to read.
  const providerTargets = resolveProviderTargetCredentials(declaredProviderTargets, () => {
    throw new TypeError("PRACTICE_TARGET_DECLARES_A_CREDENTIAL");
  });
  function targetGateway(target: (typeof providerTargets)[number]): ProviderGateway {
    const price = providerTargetPrice(target);
    if (runnerSite.money !== null && price === null) {
      throw new TypeError(`PROVIDER_TARGET_PRICE_REQUIRED:${target.providerRef}`);
    }
    const gateway = createPostgresProviderGateway(pool, {
      fetchImplementation: previewFetch,
      endpoint: target.baseUrl,
      model: target.model,
      maker: target.maker,
      ...providerTargetGatewayControls(target),
      ...previewTargetGatewayControls(previewGate, target),
      inFlight: gatewayInFlight,
      // Hosted only, as main.ts: each call charged to the run's envelope (and the story's calls to the story's own).
      // Side-by-side spec §13 (S6), as main.ts: each call charged to its own run's version's guard.
      ...(runnerSite.money === null || price === null ? {} : {
        buildCostEnvelopeSeam: (runId: string, phase: CostEnvelopePhase, sharedWall: SharedWallApplication) => runCostEnvelopeGuard(runId).providerSeam({ runId, price, requireReportedUsage: true, phase, sharedWall }),
        buildStoryCostEnvelopeSeam: (runId: string) => runCostEnvelopeGuard(runId).storySeam({ runId, price, requireReportedUsage: true })
      })
    });
    // Spec §3.4, as main.ts: the gate is marked unhealthy on its FIRST unsent refusal, before the resend wait.
    // Addition D16-D17, as main.ts: the site version's thinking table until each call reads its own run's (SA5). Its
    // composed config exists whenever the gate part does: the loader refuses a preview version it cannot compose.
    return withPreviewProviderCallPolicy(gateway, siteVersionSettings.previewConfig!, target, {
      busy: previewBusy,
      onGateUnsent: (gate) => { runnerCallScheduler.markGateUnhealthy(gate); },
      gateRemaining: input.remaining,
      onFinalWriterTierUnread: finalWriterTierUnread,
      ...(input.sleep === undefined ? {} : { sleep: input.sleep })
    });
  }
  /**
   * LG-A (spec 2026-10-15, L32; ruling R10), as main.ts: every target's gateway first, so the structure-repair route can
   * name the repair model's own (Haiku's, through its own gate); then every target's gateway is wrapped by
   * withStructureRepair. The practice always has the preview provider config, so the route is built whenever Haiku is a
   * target (the practice proof exercises it); without a Haiku target it is null and nothing is wrapped. Its repair calls
   * ask the debate's lane for the repair model's slots the original call does not hold (`structureRepairThroughLane`).
   */
  const targetGateways = new Map(providerTargets.map((target) => [target.providerRef, targetGateway(target)] as const));
  const structureRepairRoute = structureRepairThroughLane(
    previewStructureRepairRoute(providerTargets, (providerRef) => targetGateways.get(providerRef)), previewCallSubjects(previewGate));
  const providerTopology = createRunnerProviderTopology(providerTargets,
    (target) => withStructureRepair(targetGateways.get(target.providerRef)!, structureRepairRoute));
  const runRepository = new RunRepository(pool);
  assertRunnerPrimaryProviderConfiguration({
    primary: providerTopology.primary,
    firstTarget: declaredProviderTargets[0],
    declared: environment
  });
  const storyWriter = new StoryWriter({
    pool,
    pack: storyPack,
    // Side-by-side spec §13 (ruling R36), as main.ts: no boot policy; every write carries its debate's version's own.
    hosted: environment.DEPLOYMENT_MODE === "hosted",
    resolveProvider: (roleRef) => {
      const member = [
        providerTopology.primary,
        ...(providerTopology.critique === undefined ? [] : [providerTopology.critique]),
        ...providerTopology.additionalMakers
      ].find((candidate) => candidate.providerRef === roleRef);
      return member === undefined ? null : { provider: member.provider, providerRef: member.providerRef };
    },
    log: storyLog
  });
  function observeClaimTarget(target: (typeof providerTargets)[number]) {
    return observeClaimTimeTarget({
      preview: true,
      ...(input.sleep === undefined ? {} : { sleep: input.sleep }),
      target,
      timeoutMs: PREVIEW_GLM_DEADLINE_MS,
      ...previewProbeControls(target),
      fetchImplementation: previewFetch,
      clock: () => new Date()
    });
  }
  const wait = input.wait ?? ((cooldownMs: number) => new Promise<void>((resolve) => setTimeout(resolve, cooldownMs)));
  const runner = new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {
    workerId: environment.RUNNER_WORKER_ID, claimMs: environment.CLAIM_MS, claimMarginMs: environment.CLAIM_MARGIN_MS,
    // Side-by-side spec §3, as main.ts: the runner runs only debates of its release (the practice's one key).
    releaseKey: environment.RELEASE_KEY,
    // Side-by-side spec §4, as main.ts: the practice never retires (both stops stay off); the drift guard keeps the keys equal.
    retirement: createRunnerRetirementSignal(),
    // Side-by-side spec §13 runner point 7, as main.ts: every debate member of the site version, written once.
    ...runnerSettingsOfVersion(siteVersionSettings),
    // Side-by-side spec §13 (S6), as main.ts: every debate on its own stamped version, with the run → version map.
    settingsForVersion: (version) => runnerSettings.settingsFor(version),
    runSettingsVersions,
    providerRef: providerTopology.primary.providerRef, maker: providerTopology.primary.maker,
    ...(providerTopology.critique === undefined
      ? {} : { critique: providerTopology.critique }),
    additionalMakers: providerTopology.additionalMakers,
    maxRecompose: environment.MAX_RECOMPOSE,
    judgementNumberKind: environment.JUDGEMENT_NUMBER_KIND, judgementProducer: environment.JUDGEMENT_PRODUCER,
    propagationNumberKind: environment.PROPAGATION_NUMBER_KIND,
    propagationProducer: environment.PROPAGATION_PRODUCER,
    resolveTerminalActivations: createTerminalActivationEvaluator(pool),
    claimTimeProbe: async (member) => {
      const target = providerTargets.find((candidate) => candidate.providerRef === member.provider_ref);
      if (target === undefined) {
        return { state: "ABSENT" as const, modelId: null, failureCode: "CLAIM_GATEWAY_UNRESOLVED" };
      }
      const observation = await observeClaimTarget(target);
      return {
        state: observation.state,
        modelId: observation.modelId,
        failureCode: observation.failureCode
      };
    },
    story: storyWriter,
    providerPrices: buildProviderPriceMap(providerTargets, environment.DEPLOYMENT_MODE),
    // LG-A (Task 14 carry), as main.ts: root 0's room adds the structure-repair call to its first attempt and retry (the sum).
    structureRepairCeiling: previewStructureRepairCeiling(structureRepairRoute),
    bodyCostFallback: envelopeBand !== null,
    serveDisclosure: { log: logServeDisclosure },
    costSubstitutions: { log: logBodyCostFallback },
    claimTimeSynthesisRoleProbe: async (providerRef) => {
      const target = providerTargets.find((candidate) => candidate.providerRef === providerRef);
      if (target === undefined) {
        return { state: "ABSENT" as const, modelId: null, failureCode: "CLAIM_GATEWAY_UNRESOLVED" };
      }
      const observation = await observeClaimTarget(target);
      return { state: observation.state, modelId: observation.modelId, failureCode: observation.failureCode };
    },
    // Run resilience (spec docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md; ruling R-c), as main.ts
    // composes it on the preview: each maker's own attempt allowance, a busy member or a halted gate sitting out the
    // rest of the run, and the answer and story roles moving on from it. The practice is always the preview.
    runResilience: previewRunResilience(previewGate)!,
    answerRoleFallbackCovered: ({ roleRef, panel }: Readonly<{ roleRef: string; panel: readonly Readonly<{ provider_ref: string; model_id: string }>[] }>) =>
      previewSealedRoleFallbackCovered(roleRef, panel),
    // Parallel AI calls (spec 2026-10-12 §3.2, §3.6), as main.ts: the one scheduler's lane per debate, each ref's
    // model, vendor and gate, and the claim renewals on their own pool.
    callScheduler: runnerCallScheduler,
    callSubjects: previewCallSubjects(previewGate),
    // Ruling R31, as main.ts: a call to a busy model waits on the busy coordinator BEFORE it takes any slot.
    callBeforeSlot: (subject: CallSubject) => previewBusy.admit(subject.model),
    renewals: new WorkItemRepository(input.keepAlivePool, { releaseKey: environment.RELEASE_KEY, workerId: environment.RUNNER_WORKER_ID }),
    holdRecorder: {
      countCooldownHolds: (runId) => runRepository.countCooldownHolds(runId),
      record: (event) => runRepository.recordRunLifecycleEvent({
        runId: event.runId,
        kind: event.kind,
        value: {
          state: event.state,
          call_site_key: event.callSiteKey,
          parent_node_ref: event.parentNodeId,
          hold_ms: event.holdMs,
          hold_until: event.holdUntil,
          attempts_spent: event.attemptsSpent,
          transport_outcome: event.transportOutcome,
          planned_leg_count: event.plannedLegCount
        }
      }),
      wait
    }
  });
  return Object.freeze({ runner, providerTopology, providerTargets, declaredProviderTargets, policy, storyPolicy, previewFetch,
    configuredProviders: deploymentMakers.configuredProviders, callScheduler: runnerCallScheduler, callStats,
    // For the report: the ceilings the practice's run is held to (micro-dollars): the site version's.
    money: money === null || costEnvelopePolicy === null ? null : Object.freeze({
      perRunCeilingMicros: costEnvelopePolicy.perRunCeilingMicros,
      dailyCeilingMicros: costEnvelopePolicy.dailyCeilingMicros,
      perStoryCeilingMicros: storyPolicy?.perStoryCeilingMicros ?? null,
      band: envelopeBand !== null,
      billingPlansSealed: money.billingPlansSealed
    }),
    // Refused-repair salvage: the run had a structure-repair route (its ceiling is set), so a STRUCTURE reply's follow-up is B.
    structureRouted: previewStructureRepairCeiling(structureRepairRoute) !== null });
}
