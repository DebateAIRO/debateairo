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
 * runner gets main.ts's hosted money wiring, through the SAME function main.ts reads its site with
 * (`readRunnerSiteContext`, apps/runner/src/run-settings.ts; side-by-side spec §13, S14): the sealed per-run and daily
 * envelopes (costEnvelopePolicy), the story's own money row (storyCostEnvelopePolicy) through the one check over both,
 * the shared wall (the site's day at the band's finish edge, and each person's windows from the billingPlans row over
 * the read-only entitlement view), main.ts's refusal of a run ceiling below one call, every target's price on its
 * gateway, the story writer in hosted mode and the body cost fallback with the band. None of it reads billingPolicy
 * (amendment A20, as main.ts) or touches NETOPIA, Quaderno, SmartBill or mail: the runner never does.
 *
 * Differences from main.ts, all on purpose:
 *  - The two gate ports are passed in (the forwarded sockets, wrapped by the practice's gate watcher) instead of being
 *    built from the configuration's server socket paths; so are the gates' read-only `/remaining` readers, which set
 *    the call scheduler's gate slots, and the keep-alive pool the claim renewals use (the throwaway database's).
 *  - As main.ts, both in-flight counters exist in both modes; local mode builds no money guard, so the money one is never
 *    read there (main.ts's local mode alike).
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
import { PostgresDigModelRunnerRepository, RunRepository } from "@debateai/db";
import { createTerminalActivationEvaluator, WorkItemRepository } from "@debateai/battery";
import { TypedDomainError } from "@debateai/kernel";
import {
  assertHostedCostEnvelopesSealed,
  effectiveCallConcurrency,
  readCallConcurrencyPolicy,
  type CallConcurrencyPolicy,
  type DeploymentMode
} from "@debateai/register";
import {
  type CostEnvelopePhase,
  type SharedWallApplication
} from "@debateai/budget";
import {
  createPreviewBusyCoordinator,
  createPreviewGuardedFetch,
  observeClaimTimeTarget,
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
  previewTargetChargePrice,
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
  WalkingSkeletonRunner
} from "@debateai/runner";
import { assertRunnerPrimaryProviderConfiguration, createRunnerProviderTopology } from "../../apps/runner/src/provider-topology.js";
import { createCallScheduler, type CallSubject } from "../../apps/runner/src/call-scheduler.js";
import { applyPreviewGateCapacities, previewCallSubjects, previewGateNames, structureRepairThroughLane } from "../../apps/runner/src/call-lane-gateway.js";
import { createRunInFlight } from "../../apps/runner/src/run-in-flight.js";
import { MonthPause, monthPaused } from "../../apps/runner/src/month-pause.js";
import {
  createRunnerSettingsCache, createRunSettingsVersions, loadRunnerVersionSettings, preloadRunnerSettings, readRunnerSiteContext,
  runCostEnvelopeGuardOf, runnerSettingsOfVersion, runnerSettingsSummary, runnerWebSearchSettings, runPreviewThinkingLevelsOf,
  type RunnerVersionReaders
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
 * Final fix wave F4: the practice's --call-concurrency reaches the debate's lanes. A debate's lane opens with its
 * version's per-debate limits (execute(): `openLane(runId, settings.callLaneLimits)`, from the version's
 * callConcurrencyPolicy row), so the flag replaces that one read for EVERY version the practice's loader loads: the
 * lanes then run the flag's per-debate limits and the report's "FLAG" policy is the one they ran. Without the flag
 * nothing is replaced: each version's own row, as main.ts. Never written anywhere.
 */
export function practiceVersionReaders(callConcurrency: CallConcurrencyPolicy | undefined): Partial<RunnerVersionReaders> {
  if (callConcurrency === undefined) return Object.freeze({});
  const flag = Object.freeze({ state: "SET" as const, policy: callConcurrency });
  return Object.freeze({ readCallConcurrencyPolicy: async () => flag });
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
   * Content-free settings lines: the cache's DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED (a version and a code) and, as main.ts
   * prints after its ready line, the boot preload's DEBATEAI_RUNNER_SETTINGS (versions and codes; S8). Default: none, as
   * the story log (the site version's refusal is rethrown with its own code anyway).
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
  // As main.ts (side-by-side spec §13, S14): both in-flight counters, the gateway's (attempts) and the money guard's.
  const gatewayInFlight = createRunInFlight();
  // W3-2, as main.ts: at the month wall a debate's planned calls pause until the person continues.
  const monthPause = new MonthPause({ store: new PostgresDigModelRunnerRepository(pool) });
  const moneyInFlight = createRunInFlight();
  /**
   * As main.ts: the site reads, by the SAME function (`readRunnerSiteContext`, apps/runner/src/run-settings.ts): the
   * declared targets with the mode decision, the price and the reviewed provider set; hosted only, the site's money row
   * and band, the billingPlans row and the money every version's guard shares (one spend store, the money counter above,
   * the shared wall and the funding admission), on the throwaway database.
   */
  const { site: runnerSite, configuredProviders, billingPlansSealed } = await readRunnerSiteContext({ pool, environment, moneyInFlight });
  const { declaredProviderTargets, envelopeBand, siteCostEnvelopePolicy: costEnvelopePolicy } = runnerSite;
  const previewFetch = createPreviewGuardedFetch(input.budgetPorts);
  const settingsLog = input.settingsLog ?? (() => undefined);
  const runnerSettings = createRunnerSettingsCache({
    // The practice's story lines go to its own story log (main.ts's go to standard error).
    // Final fix wave F4: with --call-concurrency every version's lanes take the flag's per-debate limits.
    load: (version) => loadRunnerVersionSettings(pool, version, runnerSite, { readers: practiceVersionReaders(input.callConcurrency),
      log: ({ event, ...detail }) => { storyLog(String(event), detail); }
    }),
    log: settingsLog
  });
  const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);
  // Side-by-side spec §13 runner point 3 (S8), as main.ts: the release's open debates' and passed versions, through the
  // same cache, never the activation pointer; an unsupported one is one line and the practice goes on; a database
  // failure refuses. The practice has no ready line: its summary goes to the settings log.
  const runnerSettingsPreload = await preloadRunnerSettings({
    cache: runnerSettings, pool, work: new WorkItemRepository(pool, { releaseKey: environment.RELEASE_KEY }),
    releaseKey: environment.RELEASE_KEY, siteVersion: environment.REGISTER_VERSION
  });
  settingsLog({ kind: "DEBATEAI_RUNNER_SETTINGS", ...runnerSettingsSummary(runnerSettingsPreload) });
  const { policy, storyPolicy } = siteVersionSettings;
  // Side-by-side spec §13 (S6), as main.ts: each claimed run's version by run id, and each call's own version's guard.
  const runSettingsVersions = createRunSettingsVersions();
  const runCostEnvelopeGuard = runCostEnvelopeGuardOf(runnerSettings, runSettingsVersions);
  // Parallel AI calls (spec 2026-10-12 §3.2-§3.5), as main.ts composes them on the preview.
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
    // Owner answer F4 (2026-10-30), as main.ts: a reviewed Anthropic row's calls at the vendor's real prices.
    const price = previewTargetChargePrice(previewGate !== undefined, target, providerTargetPrice(target));
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
        // W3-2, as main.ts: the month pause on a walled call, and a dig's path rewrite on its own seam.
        buildCostEnvelopeSeam: (runId: string, phase: CostEnvelopePhase, sharedWall: SharedWallApplication) => monthPaused(runCostEnvelopeGuard(runId).providerSeam({ runId, price, requireReportedUsage: true, phase, sharedWall }), { runId, phase, sharedWall, pause: monthPause, plannedMicros: () => runCostEnvelopeGuard(runId).bodyMicrosLeft(runId) }),
        buildStoryCostEnvelopeSeam: (runId: string) => runCostEnvelopeGuard(runId).storySeam({ runId, price, requireReportedUsage: true }),
        buildPathRewriteCostEnvelopeSeam: (runId: string) => runCostEnvelopeGuard(runId).pathRewriteSeam({ runId, price, requireReportedUsage: true })
      })
    });
    // Spec §3.4, as main.ts: the gate is marked unhealthy on its FIRST unsent refusal, before the resend wait.
    // Addition D16-D18 (SA5), as main.ts: each call runs at its OWN debate's thinking table, by its run id through the
    // run → version map (a call of no debate: the site version's); the site version's composed config gives only the
    // gate part. The formats run (`--levels`, practice-formats.ts) keeps its own per-level config and passes no resolver.
    return withPreviewProviderCallPolicy(gateway, siteVersionSettings.previewConfig!, target, {
      busy: previewBusy,
      onGateUnsent: (gate) => { runnerCallScheduler.markGateUnhealthy(gate); },
      gateRemaining: input.remaining,
      onFinalWriterTierUnread: finalWriterTierUnread,
      thinkingLevelsOf: runPreviewThinkingLevelsOf(runnerSettings, runSettingsVersions, environment.REGISTER_VERSION),
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
    log: storyLog,
    // Charts in the verdict PDF (design 2026-10-28), as main.ts: the practice debate makes the same chart call.
    charts: true
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
    // Perplexity plan W3-1, as main.ts: the web step where the practice's gate names the search socket; a debate whose
    // run names no paid plan (billing.run_charge_scope) is NOT_ON_PLAN and makes no web call.
    webSearch: runnerWebSearchSettings({ pool, previewGate, fetch: previewFetch,
      guardOf: runnerSite.money === null ? null : runCostEnvelopeGuard }),
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
    configuredProviders, callScheduler: runnerCallScheduler, callStats,
    // For the report: the ceilings the practice's run is held to (micro-dollars): the site version's.
    money: runnerSite.money === null || costEnvelopePolicy === null ? null : Object.freeze({
      perRunCeilingMicros: costEnvelopePolicy.perRunCeilingMicros,
      dailyCeilingMicros: costEnvelopePolicy.dailyCeilingMicros,
      perStoryCeilingMicros: storyPolicy?.perStoryCeilingMicros ?? null,
      band: envelopeBand !== null,
      billingPlansSealed
    }),
    // Refused-repair salvage: the run had a structure-repair route (its ceiling is set), so a STRUCTURE reply's follow-up is B.
    structureRouted: previewStructureRepairCeiling(structureRepairRoute) !== null });
}
