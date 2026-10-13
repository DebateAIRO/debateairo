/**
 * Preview practice: the runner, composed exactly as apps/runner/src/main.ts composes it on the preview.
 *
 * Plain words: the practice must exercise the same runner the live preview runs, with the same settings read from the
 * same register rows, the same five gateways and the same claim probes. main.ts is a process entry point (environment,
 * key files, Hatchet), so it cannot be called; its preview wiring is mirrored here line for line, and
 * tests/unit/preview-practice-wiring-drift.test.ts reads both files and fails when the settings main.ts hands the
 * runner and this file hands it stop matching. That test, not this comment, is what keeps the two together.
 *
 * Differences from main.ts, all on purpose:
 *  - LOCAL mode only (the preview stays local mode): no per-run money envelope, no shared wall, no billing reads. A
 *    hosted settings file is refused (PRACTICE_REQUIRES_LOCAL_MODE).
 *  - The two gate ports are passed in (the forwarded sockets, wrapped by the practice's gate watcher) instead of being
 *    built from the configuration's server socket paths; so are the gates' read-only `/remaining` readers, which set
 *    the call scheduler's gate slots, and the keep-alive pool the claim renewals use (the throwaway database's).
 *  - Local mode has no money guard, so of main.ts's two in-flight counters only the gateway's (attempts) exists here.
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
import { RunRepository } from "@debateai/db";
import { createTerminalActivationEvaluator, WorkItemRepository } from "@debateai/battery";
import { TypedDomainError } from "@debateai/kernel";
import {
  effectiveCallConcurrency,
  readCallConcurrencyPolicy,
  readEngineVersion,
  readModelScorecard,
  readStoryPolicyFromRegister,
  type CallConcurrencyPolicy,
  type DeploymentMode
} from "@debateai/register";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  assertDeploymentProviderTargets,
  assertPreviewProviderTargets,
  assertPreviewRoleTargets,
  assertPricedProviderTargets,
  createPreviewBusyCoordinator,
  createPreviewGuardedFetch,
  observeClaimTimeTarget,
  parseProviderDiscoveryTargets,
  PREVIEW_GLM_DEADLINE_MS,
  previewProbeControls,
  previewRunnerPolicy,
  previewRunResilience,
  previewSealedRoleFallbackCovered,
  previewTargetGatewayControls,
  providerTargetGatewayControls,
  resolveProviderTargetCredentials,
  withPreviewProviderCallPolicy,
  type PreviewBudgetPorts,
  type PreviewGateRemaining,
  type PreviewProviderName,
  type PreviewProviderTestConfig
} from "@debateai/providers";
import { StoryWriter, loadStoryPack, resolveStoryPackDir, type StoryPack } from "@debateai/story";
import {
  assertRegisterPromptContractHashes,
  buildProviderPriceMap,
  createPostgresProviderGateway,
  logBodyCostFallback,
  logServeDisclosure,
  WalkingSkeletonRunner
} from "@debateai/runner";
import { assertRunnerPrimaryProviderConfiguration, createRunnerProviderTopology } from "../../apps/runner/src/provider-topology.js";
import { readDevelopmentRunnerPolicy } from "../../apps/runner/src/dev-runner-policy.js";
import { createCallScheduler, type CallSubject } from "../../apps/runner/src/call-scheduler.js";
import { applyPreviewGateCapacities, previewCallSubjects, previewGateNames } from "../../apps/runner/src/call-lane-gateway.js";
import { createRunInFlight } from "../../apps/runner/src/run-in-flight.js";
import { PracticeCallStats } from "./practice-parallel.js";

/** The runner settings the practice needs: the non-secret runner.env keys the operator exports (README step S-2). */
export type PracticeRunnerSettings = Readonly<{
  REGISTER_VERSION: number;
  PREVIEW_PROVIDER_TEST_CONFIG: PreviewProviderTestConfig;
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
}>) {
  const { pool, environment } = input;
  const previewConfig = environment.PREVIEW_PROVIDER_TEST_CONFIG;
  if (environment.DEPLOYMENT_MODE !== "local") throw new TypeError("PRACTICE_REQUIRES_LOCAL_MODE");
  const policy = previewRunnerPolicy(await readDevelopmentRunnerPolicy(pool, environment.REGISTER_VERSION), previewConfig);
  // As main.ts: a register that does not carry this code's prompt fingerprints refuses the start.
  assertRegisterPromptContractHashes(policy.hashes, environment.REGISTER_VERSION);
  const storyLog = input.storyLog ?? (() => undefined);
  const storyPolicy = await readStoryPolicyFromRegister(pool, environment.REGISTER_VERSION)
    .catch((error: unknown) => {
      storyLog("STORY_POLICY_UNREADABLE", { code: error instanceof TypedDomainError ? error.code : "UNTYPED" });
      return null;
    });
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
  assertPreviewProviderTargets(previewConfig, declaredProviderTargets);
  assertPreviewRoleTargets(previewConfig, declaredProviderTargets, [
    policy.synthesisRolePolicy.synthesizerRoleRef, policy.synthesisRolePolicy.evaluatorRoleRef,
    ...(storyPolicy === null ? [] : [storyPolicy.storytellerRoleRef, storyPolicy.storyCheckerRoleRef])
  ]);
  if ((await readModelScorecard(pool, environment.REGISTER_VERSION, await readEngineVersion())).state === "VALID") {
    throw new TypedDomainError("PREVIEW_SCORECARD_CONFLICT", "Preview roster cannot override a valid scorecard");
  }
  const previewFetch = createPreviewGuardedFetch(input.budgetPorts);
  // Parallel AI calls (spec 2026-10-12 §3.2-§3.5), as main.ts composes them on the preview.
  const gatewayInFlight = createRunInFlight();
  const callStats = new PracticeCallStats();
  const callPolicy = input.callConcurrency
    ?? effectiveCallConcurrency(await readCallConcurrencyPolicy(pool, environment.REGISTER_VERSION).then(callStats.noteRegisterRow));
  callStats.notePolicy(callPolicy, input.callConcurrency === undefined ? "REGISTER" : "FLAG");
  const runnerCallScheduler = callStats.observeScheduler(createCallScheduler({ policy: callPolicy }));
  await applyPreviewGateCapacities({
    scheduler: runnerCallScheduler,
    gates: previewGateNames(previewConfig).map((gate) => ({ gate, remaining: input.remaining[gate] })),
    log: (line) => { callStats.gateCapacityLog(line); console.warn(line); }
  });
  const previewBusy = callStats.observeBusy(createPreviewBusyCoordinator());
  // The preview declares no credential (the gates hold the keys); the resolver must then find nothing to read.
  const providerTargets = resolveProviderTargetCredentials(declaredProviderTargets, () => {
    throw new TypeError("PRACTICE_TARGET_DECLARES_A_CREDENTIAL");
  });
  const providerTopology = createRunnerProviderTopology(providerTargets, (target) => {
    const gateway = createPostgresProviderGateway(pool, {
      fetchImplementation: previewFetch,
      endpoint: target.baseUrl,
      model: target.model,
      maker: target.maker,
      ...providerTargetGatewayControls(target),
      ...previewTargetGatewayControls(previewConfig, target),
      inFlight: gatewayInFlight
    });
    // Spec §3.4, as main.ts: the gate is marked unhealthy on its FIRST unsent refusal, before the resend wait.
    return withPreviewProviderCallPolicy(gateway, previewConfig, target, {
      busy: previewBusy,
      onGateUnsent: (gate) => { runnerCallScheduler.markGateUnhealthy(gate); },
      ...(input.sleep === undefined ? {} : { sleep: input.sleep })
    });
  });
  const runRepository = new RunRepository(pool);
  assertRunnerPrimaryProviderConfiguration({
    primary: providerTopology.primary,
    firstTarget: declaredProviderTargets[0],
    declared: environment
  });
  const storyWriter = new StoryWriter({
    pool,
    pack: storyPack,
    policy: storyPolicy,
    hosted: false,
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
    judgeBound: policy.bounds.JUDGE,
    composerBound: policy.bounds.COMPOSER,
    conformanceBound: policy.bounds.CONFORMANCE,
    providerRef: providerTopology.primary.providerRef, maker: providerTopology.primary.maker,
    ...(providerTopology.critique === undefined
      ? {} : { critique: providerTopology.critique }),
    additionalMakers: providerTopology.additionalMakers,
    judgeContractHash: policy.hashes.judge,
    composerContractHash: policy.hashes.composer,
    conformanceContractHash: policy.hashes.conformance,
    propagationContractHash: policy.hashes.propagation,
    serveContractHash: policy.hashes.serve,
    maxRecompose: environment.MAX_RECOMPOSE, factBundleVersion: environment.REGISTER_VERSION,
    judgementNumberKind: environment.JUDGEMENT_NUMBER_KIND, judgementProducer: environment.JUDGEMENT_PRODUCER,
    propagationNumberKind: environment.PROPAGATION_NUMBER_KIND,
    propagationProducer: environment.PROPAGATION_PRODUCER,
    resolveTerminalActivations: createTerminalActivationEvaluator(pool),
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
    synthesisRolePolicy: policy.synthesisRolePolicy,
    story: storyWriter,
    providerPrices: buildProviderPriceMap(providerTargets, environment.DEPLOYMENT_MODE),
    bodyCostFallback: false,
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
    runResilience: previewRunResilience(previewConfig)!,
    answerRoleFallbackCovered: ({ roleRef, panel }: Readonly<{ roleRef: string; panel: readonly Readonly<{ provider_ref: string; model_id: string }>[] }>) =>
      previewSealedRoleFallbackCovered(roleRef, panel),
    // Parallel AI calls (spec 2026-10-12 §3.2, §3.6), as main.ts: the one scheduler's lane per debate, each ref's
    // model, vendor and gate, and the claim renewals on their own pool.
    callScheduler: runnerCallScheduler,
    callSubjects: previewCallSubjects(previewConfig),
    // Ruling R31, as main.ts: a call to a busy model waits on the busy coordinator BEFORE it takes any slot.
    callBeforeSlot: (subject: CallSubject) => previewBusy.admit(subject.model),
    renewals: new WorkItemRepository(input.keepAlivePool),
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
    configuredProviders: deploymentMakers.configuredProviders, callScheduler: runnerCallScheduler, callStats });
}
