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
  costEnvelopeCeilings,
  effectiveCallConcurrency,
  readBillingPlans,
  readCallConcurrencyPolicy,
  readCostEnvelopePolicy,
  readEngineVersion,
  readModelScorecard,
  readStoryPolicyFromRegister,
  type CallConcurrencyPolicy,
  type DeploymentMode,
  type StoryPolicy
} from "@debateai/register";
import {
  CostEnvelopeGuard,
  PostgresModelSpendStore,
  assertRunCeilingCoversOneCall,
  costEnvelopeGuardPolicy,
  type CostEnvelopePhase,
  type SharedWallApplication
} from "@debateai/budget";
import { PLAN_TIER_ROSTERS, askQuestionMaxBytes } from "@debateai/contract";
import { firstCallsByPlanRoster, firstPositionCallProjections } from "@debateai/judgement";
import { firstCallPlanModels } from "@debateai/scorecard";
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
  previewFinalWriterTierUnreadLine,
  previewProbeControls,
  previewRunnerPolicy,
  previewRunResilience,
  previewSealedRoleFallbackCovered,
  previewStructureRepairCeiling,
  previewStructureRepairRoute,
  previewTargetGatewayControls,
  providerTargetGatewayControls,
  providerTargetPrice,
  resolveProviderTargetCredentials,
  type ProviderDiscoveryTarget,
  withPreviewProviderCallPolicy,
  withStructureRepair,
  type PreviewBudgetPorts,
  type PreviewFinalWriterTierUnread,
  type PreviewGateRemaining,
  type PreviewProviderName,
  type PreviewProviderTestConfig,
  type ProviderGateway
} from "@debateai/providers";
import { StoryWriter, loadStoryPack, resolveStoryPackDir, type StoryPack } from "@debateai/story";
import {
  assertRegisterPromptContractHashes,
  buildProviderPriceMap,
  createPostgresProviderGateway,
  logBodyCostFallback,
  logServeDisclosure,
  plansUnresolvedPersonAllowance,
  WalkingSkeletonRunner
} from "@debateai/runner";
import { assertRunnerPrimaryProviderConfiguration, createRunnerProviderTopology } from "../../apps/runner/src/provider-topology.js";
import { readDevelopmentRunnerPolicy } from "../../apps/runner/src/dev-runner-policy.js";
import { createCallScheduler, type CallSubject } from "../../apps/runner/src/call-scheduler.js";
import { applyPreviewGateCapacities, previewCallSubjects, previewGateNames, structureRepairThroughLane } from "../../apps/runner/src/call-lane-gateway.js";
import { createRunInFlight } from "../../apps/runner/src/run-in-flight.js";
import { readDebateShapeRunnerSettings } from "../../apps/runner/src/debate-shape-boot.js";
import { readEngineRunnerSettings } from "../../apps/runner/src/engine-boot.js";
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

/**
 * HOSTED only: main.ts's money wiring, line for line (its V-28 per-run envelope, B9 shared wall, internal-funding
 * refusal, the guard over both money rows and B9's run-ceiling-below-one-call refusal), on the throwaway database.
 * Returns null in local mode, where main.ts builds none of it. tests/unit/preview-practice-hosted.test.ts pins the
 * statements below against main.ts's.
 */
export async function composePracticeRunnerMoney(input: Readonly<{
  pool: Pool;
  environment: PracticeRunnerSettings;
  declaredProviderTargets: readonly ProviderDiscoveryTarget[];
  judgeTokenCeiling: number;
  storyPolicy: StoryPolicy | null;
  /** The debate shape main.ts resolved at boot (null without the row): the first call is priced with the locked language. */
  debateShape: Awaited<ReturnType<typeof readDebateShapeRunnerSettings>>;
  log?: (line: string) => void;
}>) {
  const { pool, environment, declaredProviderTargets, storyPolicy } = input;
  if (environment.DEPLOYMENT_MODE !== "hosted") return null;
  const costEnvelopePolicy = environment.DEPLOYMENT_MODE === "hosted"
    ? await readCostEnvelopePolicy(pool, environment.REGISTER_VERSION)
    : null;
  const modelSpendStore = new PostgresModelSpendStore(pool);
  const moneyInFlight = createRunInFlight();
  const envelopeBand = costEnvelopePolicy === null ? null : costEnvelopeBand(costEnvelopePolicy);
  const billingPlans = costEnvelopePolicy === null ? null : await readBillingPlans(pool, environment.REGISTER_VERSION);
  if (costEnvelopePolicy !== null && billingPlans === null) {
    (input.log ?? console.warn)(JSON.stringify({ kind: "DEBATEAI_PERSON_WALL", event: "PLANS_UNRESOLVED" }));
  }
  const fundingEntitlements = new EntitlementRepository(pool);
  const allowances = new PostgresInternalAllowanceRepository(pool);
  const selectedFunding = await allowances.readPolicy();
  if (selectedFunding !== null && (environment.DEPLOYMENT_MODE !== "hosted" || envelopeBand === null || billingPlans === null))
    throw new TypedDomainError("INTERNAL_FUNDING_UNAVAILABLE","Internal funding requires hosted billing and finite envelope members");
  const fundingAllowance = selectedFunding === null || billingPlans === null ? undefined : new FundingAwarePersonAllowanceSource({
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
  const costEnvelopeGuard = costEnvelopePolicy === null
    ? undefined
    : new CostEnvelopeGuard({
        store: modelSpendStore,
        policy: costEnvelopeGuardPolicy(costEnvelopePolicy, storyPolicy),
        ...(sharedWallTerms === null ? {} : { sharedWall: sharedWallTerms }),
        ...(fundingAllowance === undefined ? {} : {fundingAdmission:fundingAllowance}),
        inFlight: moneyInFlight
      });
  if (costEnvelopePolicy !== null && envelopeBand !== null) {
    const firstCalls = firstPositionCallProjections({
      targets: declaredProviderTargets,
      judgeTokenCeiling: input.judgeTokenCeiling,
      questionMaxBytes: askQuestionMaxBytes(),
      // Ruling L-B9R (P2L Task 17), as main.ts: with ANY debateShapePolicy row (enabled false too) a run's first call may
      // carry the locked language, so it is priced at the longest lock too. No row: today's price.
      questionLanguageLocked: input.debateShape !== null
    });
    assertRunCeilingCoversOneCall({
      bodyCeilingMicros: costEnvelopeCeilings(costEnvelopePolicy).bodyMicros,
      firstCallsByRoster: firstCallsByPlanRoster({
        projections: firstCalls,
        rosters: firstCallPlanModels({
          scorecardInForce: (await readModelScorecard(pool, environment.REGISTER_VERSION, await readEngineVersion())).state === "VALID",
          rosters: PLAN_TIER_ROSTERS,
          models: firstCalls.map((call) => call.model)
        })
      })
    });
  }
  return Object.freeze({
    costEnvelopeGuard: costEnvelopeGuard!,
    envelopeBand,
    storyCeilingMicros: storyPolicy?.perStoryCeilingMicros ?? null,
    /** For the report: the ceilings the practice's run is held to (micro-dollars). */
    summary: Object.freeze({
      perRunCeilingMicros: costEnvelopePolicy!.perRunCeilingMicros,
      dailyCeilingMicros: costEnvelopePolicy!.dailyCeilingMicros,
      perStoryCeilingMicros: storyPolicy?.perStoryCeilingMicros ?? null,
      band: envelopeBand !== null,
      billingPlansSealed: billingPlans !== null
    })
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
}>) {
  const { pool, environment } = input;
  const previewConfig = environment.PREVIEW_PROVIDER_TEST_CONFIG;
  // As main.ts's first line: a hosted deployment may not claim work until the envelopes are sealed (local: nothing).
  assertHostedCostEnvelopesSealed(environment.DEPLOYMENT_MODE);
  const policy = previewRunnerPolicy(await readDevelopmentRunnerPolicy(pool, environment.REGISTER_VERSION), previewConfig);
  // As main.ts: a register that does not carry this code's prompt fingerprints refuses the start.
  assertRegisterPromptContractHashes(policy.hashes, environment.REGISTER_VERSION);
  /**
   * Debate shape (spec 2026-10-12 §3.1, §4; controller ruling PF10), as apps/runner/src/main.ts resolves it, in both
   * modes: the optional row (absent = today's shape; malformed = refused, DEBATE_SHAPE_POLICY_INVALID) and, only with
   * it, the sealed map contracts (DEBATE_SHAPE_MAP_HASH_UNSEALED / MAP_CONTRACT_HASH_MISMATCH).
   */
  const debateShape = await readDebateShapeRunnerSettings(pool, environment.REGISTER_VERSION);
  // Engine redesign (R1d; INTERFACE §2.3), as apps/runner/src/main.ts resolves it, in both modes: the optional engine row
  // and, only with it, the length row's presence and the sealed engineContractHash.
  const engine = await readEngineRunnerSettings(pool, environment.REGISTER_VERSION);
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
  // Hosted only (null in local mode): main.ts's per-run and daily envelopes, the story's money row and the shared wall.
  const money = await composePracticeRunnerMoney({ pool, environment, declaredProviderTargets,
    judgeTokenCeiling: policy.bounds.JUDGE.tokenCeiling, storyPolicy, debateShape, log: (line) => { console.warn(line); } });
  const costEnvelopeGuard = money?.costEnvelopeGuard;
  const storyCeilingMicros = money?.storyCeilingMicros ?? null;
  const envelopeBand = money?.envelopeBand ?? null;
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
    if (costEnvelopeGuard !== undefined && price === null) {
      throw new TypeError(`PROVIDER_TARGET_PRICE_REQUIRED:${target.providerRef}`);
    }
    const gateway = createPostgresProviderGateway(pool, {
      fetchImplementation: previewFetch,
      endpoint: target.baseUrl,
      model: target.model,
      maker: target.maker,
      ...providerTargetGatewayControls(target),
      ...previewTargetGatewayControls(previewConfig, target),
      inFlight: gatewayInFlight,
      // Hosted only, as main.ts: each call charged to the run's envelope (and the story's calls to the story's own).
      ...(costEnvelopeGuard === undefined || price === null ? {} : {
        buildCostEnvelopeSeam: (runId: string, phase: CostEnvelopePhase, sharedWall: SharedWallApplication) => costEnvelopeGuard.providerSeam({
          runId, price, requireReportedUsage: true, phase, sharedWall
        }),
        ...(storyCeilingMicros === null ? {} : {
          buildStoryCostEnvelopeSeam: (runId: string) => costEnvelopeGuard.storySeam({
            runId, price, requireReportedUsage: true
          })
        })
      })
    });
    // Spec §3.4, as main.ts: the gate is marked unhealthy on its FIRST unsent refusal, before the resend wait.
    return withPreviewProviderCallPolicy(gateway, previewConfig, target, {
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
    previewStructureRepairRoute(providerTargets, (providerRef) => targetGateways.get(providerRef)), previewCallSubjects(previewConfig));
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
    policy: storyPolicy,
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
    runResilience: previewRunResilience(previewConfig)!,
    answerRoleFallbackCovered: ({ roleRef, panel }: Readonly<{ roleRef: string; panel: readonly Readonly<{ provider_ref: string; model_id: string }>[] }>) =>
      previewSealedRoleFallbackCovered(roleRef, panel),
    // Parallel AI calls (spec 2026-10-12 §3.2, §3.6), as main.ts: the one scheduler's lane per debate, each ref's
    // model, vendor and gate, and the claim renewals on their own pool.
    callScheduler: runnerCallScheduler,
    // Debate shape, as main.ts: resolved at boot above; null without the row (today's runner).
    debateShape,
    // Engine redesign (R1d), as main.ts: resolved at boot above; null without the engine row (engine 1).
    engine,
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
    configuredProviders: deploymentMakers.configuredProviders, callScheduler: runnerCallScheduler, callStats,
    money: money === null ? null : money.summary,
    // Refused-repair salvage: the run had a structure-repair route (its ceiling is set), so a STRUCTURE reply's follow-up is B.
    structureRouted: previewStructureRepairCeiling(structureRepairRoute) !== null });
}
