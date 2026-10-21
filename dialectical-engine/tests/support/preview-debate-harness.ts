// The preview debate harness: the REAL WalkingSkeletonRunner composed as apps/runner/src/main.ts composes it on the
// preview, over the two preview gates' unix-socket doubles (tests/support/preview-gate-stubs.ts), on a migrated embedded
// PostgreSQL the caller owns. Factored out of tests/integration/preview-busy-model-run.test.ts (spec
// docs/superpowers/specs/2026-10-11-preview-busy-model-design.md; run resilience 2026-10-12) so the parallel-calls
// proof (tests/integration/parallel-calls-debate.test.ts, spec docs/superpowers/specs/2026-10-12-parallel-calls-design.md)
// drives the SAME composition.
//
// What main.ts composes and this harness mirrors: the six reviewed targets, the topology's first target as primary;
// each gateway = withPreviewProviderCallPolicy(createPostgresProviderGateway(… over createPreviewGuardedFetch …), …,
// { busy }) with ONE busy coordinator shared by every gateway of the runner (spec §3.3, owner ruling O4); the attempt
// counter on every gateway (spec §3.5); and the runner's call scheduler, built from the register's
// `callConcurrencyPolicy` row (absent: one call at a time per debate) with each gate's own slots read once from its
// `/remaining` at boot (applyPreviewGateCapacities). Only the 60-second waits and the cooldown holds are injected.
import { randomUUID } from "node:crypto";
import { createInitialBatteryRows, WorkItemRepository } from "@debateai/battery";
import { RunRepository, insertRunRoleRotation, type DiscoveredPanelMember, type Pool } from "@debateai/db";
import {
  assertPreviewProviderTargets,
  assertPreviewRoleTargets,
  createPreviewBudgetRpcPort,
  createPreviewBusyCoordinator,
  createPreviewGuardedFetch,
  createPreviewRemainingRpcPort,
  observeClaimTimeTarget,
  observeProviderTarget,
  parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets,
  PREVIEW_GLM_DEADLINE_MS,
  previewModelRow,
  previewProbeControls,
  previewStructureRepairCeiling,
  previewStructureRepairRoute,
  previewRunnerPolicy,
  previewRunResilience,
  previewSealedRoleFallbackCovered,
  previewTargetGatewayControls,
  previewTargetJsonRow,
  providerTargetGatewayControls,
  PREVIEW_PROVIDER_REF_MODELS,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  withPreviewProviderCallPolicy,
  withStructureRepair,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import {
  CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY,
  buildStoryRegisterRows,
  computeStructuralCeilingBasis,
  effectiveCallConcurrency,
  readStoryPolicy,
  type CallConcurrencyPolicy,
  type DebateShapeCeilingInput,
  type EngineSettings,
  type LengthGuidance
} from "@debateai/register";
import type { DebateShapeSettings } from "@debateai/contract";
import { createPostgresProviderGateway, WalkingSkeletonRunner, type ProviderPriceMap, type WalkingSkeletonSettings } from "@debateai/runner";
import {
  pickRotatedRoles,
  ROLE_ROTATION_RULE,
  roleRotationSeed,
  rotationPinFields,
  type RotatedRoles,
  type RotationPick
} from "@debateai/scorecard";
import { ServeRepository } from "@debateai/serve";
import {
  StoryRepository,
  StoryWriter,
  loadStoryPack,
  resolveStoryPackDir
} from "@debateai/story";
import { DEVELOPMENT_ORGAN_COST_BOUNDS, DEVELOPMENT_RUN_DEATH_POLICY } from "../../apps/runner/src/dev-deployment-register.js";
import { createRunnerProviderTopology } from "../../apps/runner/src/provider-topology.js";
import { createCallScheduler, type CallPriority, type CallScheduler, type DebateCallLane } from "../../apps/runner/src/call-scheduler.js";
import { applyPreviewGateCapacities, previewCallSubjects, structureRepairThroughLane } from "../../apps/runner/src/call-lane-gateway.js";
import { createRunInFlight } from "../../apps/runner/src/run-in-flight.js";
import type { DebateShapeRunnerSettings } from "../../apps/runner/src/debate-shape-boot.js";
import type { EngineRunnerSettings } from "../../apps/runner/src/engine-boot.js";
import type { RunnerRetirementSignal } from "../../apps/runner/src/runner-retirement.js";
import {
  startPreviewGateStubs,
  type GateDebateScripts,
  type GateOverride,
  type GateProvider,
  type GateRequest
} from "./preview-gate-stubs.js";
import { clearPendingRunId, fixedRunIdTaken, nextRandomUUIDIs } from "./fixed-run-id.js";

export const GLM = "zai-org/GLM-5.3-Flash";
export const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
export const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
export const QWEN = "Qwen/Qwen3.8-Flash";
export const HAIKU = "claude-haiku-5-5";
/** Owner ruling 5 / R4: the one wait before the one resend of a gate-proven unbilled refusal. */
export const UNBILLED_RESEND_MS = 60_000;
/** The frozen panel the ask admitted with GLM busy (spec §3): the four makers that answered, in register order. */
export const PANEL_REFS = Object.freeze([
  "preview:deepseek-v4-1-flash", "preview:mimo-v2-6-pro", "preview:qwen-3-8-flash", "preview:claude-haiku-5-5"
]);
export const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU],
  requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/provider-budget.sock",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget.sock", scope_id: "preview-busy-model-run"
}))! as PreviewProviderTestConfig;
/** The register's configured provider for a reviewed ref (its row's maker and adapter kind). */
export const configured = (providerRef: string) => {
  const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
  return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
};
/** All SIX reviewed targets, GLM's two refs included: GLM is configured, only the run's panel leaves it out. */
export const TARGETS = parseProviderDiscoveryTargets(
  JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)), PREVIEW_REVIEWED_PROVIDER_REFS.map(configured)
);
/** The sealed organ bounds, seen through the preview's runner policy exactly as main.ts reads them. */
export const POLICY = previewRunnerPolicy({
  bounds: DEVELOPMENT_ORGAN_COST_BOUNDS.organs,
  synthesisRolePolicy: {
    synthesizerBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.COMPOSER,
    evaluatorBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.CONFORMANCE
  }
}, PREVIEW);
/** Register v11's sealed answer roles: GLM writes, DeepSeek checks (deploy/preview-auth-dev/v1/publish-register-v2.ts). */
export const SEALED_WRITER_REF = "preview:fixture-a";
export const SEALED_CHECKER_REF = "preview:deepseek-v4-1-flash";
/** The v11 story rows: the storyteller follows the sealed writer, the story checker the sealed checker. */
export const STORY_POLICY = readStoryPolicy(buildStoryRegisterRows({
  synthesizerRoleRef: SEALED_WRITER_REF, evaluatorRoleRef: SEALED_CHECKER_REF,
  sourceRef: "test-layer:preview-busy-model", hosted: false
}), 11)!;
/** The sealed envelope-formula terms the ask path sizes a run with (as tests/integration/preview-busy-model-ask.test.ts). */
export const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 2,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
/** Run b53b9a9e's panel (spec 2026-10-12 "Incident"): all five makers, in register order, GLM by its writer ref. */
export const FIVE_MAKER_REFS = Object.freeze([SEALED_WRITER_REF, ...PANEL_REFS]);
export const rotationPick = (providerRef: string): RotationPick => Object.freeze({
  providerRef, modelId: PREVIEW_PROVIDER_REF_MODELS[providerRef]!, maker: configured(providerRef).maker
});
/**
 * The incident's rotation pin, written by hand (spec 2026-10-12 "Incident"): GLM writes and tells the story, DeepSeek
 * checks the answer, Haiku checks the story. The runner seats the debaters in `eligibleModelIds` order, opener first
 * (apps/runner/src/run-seats.ts pinnedPositionOrder), so GLM is the last root (root index 4, key JUDGE:root:4), as in
 * the incident.
 */
export const INCIDENT_PIN: RotatedRoles = Object.freeze({
  rule: ROLE_ROTATION_RULE,
  answerWriter: rotationPick(SEALED_WRITER_REF), answerChecker: rotationPick(SEALED_CHECKER_REF),
  storyteller: rotationPick(SEALED_WRITER_REF), storyChecker: rotationPick("preview:claude-haiku-5-5"),
  opener: rotationPick(SEALED_CHECKER_REF),
  eligibleModelIds: Object.freeze([DEEPSEEK, MIMO, QWEN, HAIKU, GLM])
});
/**
 * Spec 2026-10-12 fixes (a)-(d): the runner's one new preview setting, which gate serves a ref and which model it is
 * (so a busy model sits out on all of its refs, and a halted gate takes every member behind it). The same helper
 * apps/runner/src/main.ts composes it with on the preview (`previewRunResilience`).
 */
export const RUN_RESILIENCE = previewRunResilience(PREVIEW)!;
export const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
const batteryRows = createInitialBatteryRows({ settlementWatchHandle: "settlement-watch:preview-busy-model-run" });

/**
 * The owner's start values for the `callConcurrencyPolicy` row (spec 2026-10-12 parallel calls §3.1; global
 * constraints): 12 calls at once per debate, 3 per model per debate, and per model across the runner 50 by default,
 * 150 on DeepInfra, 50 on Anthropic.
 */
export const OWNER_CALL_CONCURRENCY: CallConcurrencyPolicy = Object.freeze({
  perDebate: 12, perModelPerDebate: 3, perModelPerRunner: Object.freeze({ default: 50, deepinfra: 150, anthropic: 50 })
});

/** The claim probe of one target: main.ts's (one 60-second resend after an unbilled refusal) or the pre-fix single probe. */
export type ClaimComposition = "resend" | "single";

export type PreviewGates = Awaited<ReturnType<ReturnType<typeof previewDebateHarness>["startGates"]>>;
/** One lane call as the runner's scheduler saw it (ruling R33), in the order it happened. */
export type LaneEvent = Readonly<
  | { kind: "STARTED"; priority: CallPriority; model: string }
  | { kind: "FAILED"; priority: CallPriority; model: string; error: unknown }
>;

/**
 * Debate shape (plan Task 15, ruling T12-R0): a HOSTED runner's money, on this preview composition — the run's money
 * seam built per call (`buildCostEnvelopeSeam`, as main.ts builds it from its CostEnvelopeGuard), the story's own seam,
 * and the price of every target (`providerPrices`, as main.ts's `buildProviderPriceMap` in hosted mode).
 */
export type PreviewRunnerMoney = Readonly<{
  /** The seam builder of one target's gateway (main.ts builds it with that target's own price). */
  buildCostEnvelopeSeam: (providerRef: string) => NonNullable<Parameters<typeof createPostgresProviderGateway>[1]["buildCostEnvelopeSeam"]>;
  buildStoryCostEnvelopeSeam?: (providerRef: string) => NonNullable<Parameters<typeof createPostgresProviderGateway>[1]["buildStoryCostEnvelopeSeam"]>;
  providerPrices: ProviderPriceMap;
  /** LG-A (Task 14 carry): the runner's `structureRepairCeiling`, as main.ts passes it when the route is wired; absent: none. */
  structureRepairCeiling?: Readonly<{ providerRef: string; requestBytes: number; completionTokenCeiling: number }>;
}>;

export type ComposedPreviewRunner = ReturnType<ReturnType<typeof previewDebateHarness>["previewRunner"]>;
export type AdmittedRun = Awaited<ReturnType<ReturnType<typeof previewDebateHarness>["admittedRun"]>>;

/**
 * The harness over the caller's migrated database pool (read when called, so a `beforeAll` may start it) and the
 * caller's list of stub closers (closed by the caller's `afterEach`).
 */
export function previewDebateHarness(input: Readonly<{
  pool: () => Pool;
  stubClosers: (() => Promise<void>)[];
}>) {
  const pool = input.pool;

  /**
   * Both preview gates over real unix sockets, speaking the gate's RPC protocol (startPreviewGateStubs). Without
   * `debate` scripts a GLM request is answered as a billed vendor 500 (and fails the test by the record). `delayMs`
   * holds each /complete request that long before it is answered, so calls can overlap.
   */
  async function startGates(
    probeScripts: Readonly<Record<string, readonly ("OK" | "UNBILLED")[]>>, debate?: GateDebateScripts,
    override?: (request: GateRequest, chat: string) => GateOverride | null,
    delayMs?: (request: GateRequest) => number
  ) {
    const stubs = await startPreviewGateStubs({
      storyDefaultShape: PACK.defaultShape, probeScripts,
      ...(debate === undefined ? { refuseModels: [GLM] } : { debate }),
      ...(override === undefined ? {} : { override }),
      ...(delayMs === undefined ? {} : { delayMs })
    });
    input.stubClosers.push(stubs.close);
    // The /remaining reads arrive on the same socket as /complete, as on the preview (createPreviewRemainingRpcPort).
    const deepinfra = createPreviewBudgetRpcPort(PREVIEW, stubs.sockets.deepinfra);
    const anthropic = createPreviewBudgetRpcPort(PREVIEW, stubs.sockets.anthropic);
    return {
      requests: stubs.requests, arrivals: stubs.arrivals, remainingReads: stubs.remainingReads, halt: stubs.halt,
      cooling: stubs.cooling, concurrency: stubs.concurrency, sockets: stubs.sockets,
      deepinfraPort: deepinfra, guardedFetch: createPreviewGuardedFetch({ deepinfra, anthropic })
    };
  }

  /** Test-layer serving vocabulary (story-end-to-end.test.ts's), with one provider family per maker of the six refs. */
  function fixtureSettings(): Omit<WalkingSkeletonSettings, "providerRef" | "maker" | "synthesisRolePolicy"> {
    const families = new Map<string, string[]>();
    for (const target of TARGETS) families.set(target.maker, [...(families.get(target.maker) ?? []), target.providerRef]);
    return {
      workerId: "runner:preview-busy-model", claimMarginMs: 60_000,
      // assertClaimCoversCall: two holds of (cooldown + the preview's 600 s deadline), one more deadline, the margin.
      claimMs: 2 * (DEVELOPMENT_RUN_DEATH_POLICY.cooldown_ms + PREVIEW_GLM_DEADLINE_MS) + PREVIEW_GLM_DEADLINE_MS + 60_000,
      judgeBound: POLICY.bounds.JUDGE, composerBound: POLICY.bounds.COMPOSER, conformanceBound: POLICY.bounds.CONFORMANCE,
      judgeContractHash: "contract:judge:busy-model", composerContractHash: "contract:composer:busy-model",
      conformanceContractHash: "contract:conformance:busy-model", propagationContractHash: "contract:propagation:busy-model",
      serveContractHash: "contract:serve:busy-model", maxRecompose: 1, factBundleVersion: 1,
      judgementNumberKind: "base-probability", judgementProducer: "judgement:busy-model",
      propagationNumberKind: "propagated-probability", propagationProducer: "propagation:busy-model",
      compositionRow: {
        rowKey: CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY, registerVersion: 1, sourceRef: "test-layer:S04",
        value: { kind: "CLAIM_TYPE_COMPOSITION_MAP", entries: { unknown: {
          branch: "EVIDENCE_AWARE", clarityDecayPerAmbiguity: 0.1, terms: [{ metric: "steelman_fidelity", coefficient: 1 }],
          caps: [], uncertaintyLadder: [{ atMost: 1, label: "TEST_LAYER" }]
        } } }
      },
      servePolicy: {
        compositionBudgets: {
          low: { tier: "low", bound: 10_000, registerRowKey: "compositionBundleBudget.low", registerVersion: 1, sourceRef: "test-layer:DR-078" },
          medium: { tier: "medium", bound: 20_000, registerRowKey: "compositionBundleBudget.medium", registerVersion: 1, sourceRef: "test-layer:DR-078" },
          high: { tier: "high", bound: 30_000, registerRowKey: "compositionBundleBudget.high", registerVersion: 1, sourceRef: "test-layer:DR-078" }
        },
        candidateConfidenceBand: "TEST_TOP_BAND",
        bandCeiling: { rowKey: "wayOfKnowingCeiling", registerVersion: 1, sourceRef: "test-layer:DR-086", value: {
          bandOrder: ["TEST_CAPPED_BAND", "TEST_TOP_BAND"],
          ceilingLabels: ["TEST_DEFAULT_CEILING", "TEST_LOOKED_UP_CEILING", "TEST_EMPTY_BASIS_FLOOR"],
          defaultCeiling: { label: "TEST_DEFAULT_CEILING", ceilingBand: "TEST_TOP_BAND", liftPath: "test-layer:retain-band" },
          cuts: [{ minimumShares: { LOOKED_UP: 0.5 }, label: "TEST_LOOKED_UP_CEILING", ceilingBand: "TEST_CAPPED_BAND",
            liftPath: "test-layer:improve-way-of-knowing" }],
          emptyBasisFloor: { label: "TEST_EMPTY_BASIS_FLOOR", ceilingBand: "TEST_CAPPED_BAND",
            liftPath: "test-layer:gather-any-verified-evidence-to-lift" }
        } }
      },
      judgementPolicy: {
        selectionRule: { kind: "MAXIMIZE_WEIGHTED_TAU", rowKey: "test-layer:selection-rule", registerVersion: 1, sourceRef: "test-layer:DR-077" },
        earnedWeight: 1, judgeWeightVersion: "test-layer:weight-v1", reducerVersion: "test-layer:reducer-v1"
      },
      panelPolicy: {
        registerVersion: 1, dispersionScale: 1, repeatedFamilyMultiplier: 0.5, disagreementThreshold: 0.25,
        oneStepDown: { TEST_CAPPED_BAND: "TEST_CAPPED_BAND", TEST_TOP_BAND: "TEST_CAPPED_BAND" },
        providerFamilies: [...families].map(([maker, providerRefs]) => ({ familyRef: `test-layer:family:${maker}`, providerRefs })),
        unmappedReason: "PROVIDER_FAMILY_UNMAPPED",
        sourceRefs: { dispersionScale: "test-layer:J1", repeatedFamilyMultiplier: "test-layer:J1", disagreementThreshold: "test-layer:J1",
          downgradeBands: "test-layer:J1", providerFamilyMap: "test-layer:J1" }
      },
      // δ and ε of 0: no branch freezes and the run never stops early, so the requested depth is expanded in full.
      stoppingPolicy: { registerVersion: 1, delta: 0, epsilon: 0,
        sourceRefs: { globalStopDelta: "test-layer:T7", branchFreezeEpsilon: "test-layer:T7" } },
      verdictLabelPolicy: {
        registerVersion: 1, gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25,
        sourceRefs: { verdictMarginGamma: "test-layer:goal-v4:80-96", verdictHighCut: "test-layer:goal-v4:80-96",
          verdictLowCut: "test-layer:goal-v4:80-96", disagreementThreshold: "test-layer:J1",
          disagreementQuantity: "test-layer:goal-v4:80-96" }
      },
      scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" },
      runDeathPolicy: { cooldownMs: DEVELOPMENT_RUN_DEATH_POLICY.cooldown_ms, finalRetryAttempts: DEVELOPMENT_RUN_DEATH_POLICY.final_retry_attempts,
        maxCooldownHoldsPerRun: DEVELOPMENT_RUN_DEATH_POLICY.max_cooldown_holds_per_run },
      resolveTerminalActivations: async ({ waitingRows }) => waitingRows.map((batteryRowId) => ({
        batteryRowId, state: "INACTIVE" as const,
        predicateInputs: { kind: "PRESENT" as const, values: { fixture: "BUSY-MODEL", predicateResult: false, terminalEvaluation: true } },
        skipEvidence: { kind: "PRESENT" as const, evidenceType: "TEST_LAYER_TERMINAL_PREDICATE_RESULT", result: "FALSE_AT_COMPLETION" }
      }))
    };
  }

  /**
   * apps/runner/src/main.ts's preview runner, over these gates; the waits are recorded, never slept. `resilience` is the
   * run-resilience setting (RUN_RESILIENCE). `callConcurrency` is the register's `callConcurrencyPolicy` row: absent
   * (the default) one call at a time per debate, as on a register that never published it.
   *
   * Parallel AI calls (Task 9's review carry, Task 10): as main.ts, ONE busy coordinator is handed to every gateway's
   * preview policy, and the call scheduler reads each gate's own slots once, at boot, from its /remaining. Those boot
   * reads are main.ts's, not the run's: they are taken off the gates' record before the runner exists, so a test that
   * counts the run's /remaining reads counts what the RUN asked.
   */
  async function previewRunner(
    gates: Awaited<ReturnType<typeof startGates>>, claim: ClaimComposition,
    options: Readonly<{
      resilience?: typeof RUN_RESILIENCE; callConcurrency?: CallConcurrencyPolicy;
      /** The adaptive stopping row (δ, ε); absent, δ = ε = 0: nothing freezes, the requested depth is expanded in full. */
      stoppingPolicy?: Readonly<{ delta: number; epsilon: number }>;
      /** Debate shape (plan Task 15): the runner's shape settings (the sealed map hash), passed as main.ts passes them. */
      debateShape?: DebateShapeRunnerSettings;
      /** Plan Task 15 (T12-R0): a hosted runner's money seam and prices; absent, no money bound (local mode). */
      money?: PreviewRunnerMoney;
      /**
       * LG-A (final review I-1): wire the structure-repair route exactly as main.ts wires it on the preview — every
       * target's gateway first, the route named from Haiku's own, through the debate's lane, and every target's gateway
       * wrapped by withStructureRepair (with the route's ceiling for root 0's room). Absent: no route, today's composition.
       */
      structureRepair?: boolean;
      /**
       * R2a final wave W2: the runner's engine settings (the seal its engine-2 calls carry), passed as main.ts passes
       * `readEngineRunnerSettings`' answer. Absent: no engine settings, so an engine-2 receipt is refused (R1d B3).
       */
      engine?: EngineRunnerSettings;
      /** R2 (B12): every composition budget's bound at one byte, so no digest can exist and the answer ends at its floor. */
      noDigest?: boolean;
      /** Side-by-side spec §3 (B6): the release this runner runs as, as main.ts passes RELEASE_KEY; absent, `legacy`. */
      releaseKey?: string;
      /** Side-by-side spec §4 (B8): the retirement signal, as main.ts passes it; absent, the runner never retires. */
      retirement?: Pick<RunnerRetirementSignal, "claimsStopped" | "callsStopped">;
    }> = {}
  ) {
    const probeSleeps: number[] = [];
    const callSleeps: number[] = [];
    const holdWaits: number[] = [];
    /** Every hold and halt record the run made (COOLDOWN_HOLD / COOLDOWN_RETRY / *_HALTED), in the order made. */
    const holdRecords: Parameters<NonNullable<WalkingSkeletonSettings["holdRecorder"]>["record"]>[0][] = [];
    const gatewayInFlight = createRunInFlight();
    const scheduler = createCallScheduler({
      policy: effectiveCallConcurrency(options.callConcurrency === undefined
        ? { state: "ABSENT" } : { state: "SET", policy: options.callConcurrency })
    });
    /** Every debate lane the runner opened, in opening order (Task 12: a test reads a stopped run's lane stats). */
    const lanes: DebateCallLane[] = [];
    /**
     * Ruling R33: every lane's calls in the RUNNER's own order, never the gates' clocks. STARTED is pushed when the
     * scheduler starts a call (after the lane's start guard let it through); FAILED when that call's failure reaches
     * the lane, which is AFTER the runner's lane hook (`onFailed`, inside the call) has seen it and BEFORE its slot
     * frees. So a call STARTED after a FAILED entry was started by a lane whose guard already knew of that failure.
     */
    const laneEvents: LaneEvent[] = [];
    const callScheduler: CallScheduler = Object.freeze({
      ...scheduler,
      openLane: (debateId: string) => {
        const lane = scheduler.openLane(debateId);
        lanes.push(lane);
        return Object.freeze({
          ...lane,
          run: <T>(ticket: Parameters<DebateCallLane["run"]>[0], call: () => Promise<T>): Promise<T> => lane.run(ticket, () => {
            laneEvents.push(Object.freeze({ kind: "STARTED", priority: ticket.priority, model: ticket.model }));
            let settled: Promise<T>;
            try { settled = Promise.resolve(call()); } catch (error) { settled = Promise.reject(error); }
            return settled.catch((error: unknown) => {
              laneEvents.push(Object.freeze({ kind: "FAILED", priority: ticket.priority, model: ticket.model, error }));
              throw error;
            });
          })
        });
      }
    });
    const bootReads = gates.remainingReads.length;
    await applyPreviewGateCapacities({
      scheduler: callScheduler,
      gates: (["deepinfra", "anthropic"] as const satisfies readonly GateProvider[]).map((gate) => ({
        gate,
        remaining: () => createPreviewRemainingRpcPort({ budget_socket: gates.sockets[gate], scope_id: PREVIEW.scope_id }).remaining()
      })),
      log: () => undefined
    });
    gates.remainingReads.splice(bootReads);
    const busy = createPreviewBusyCoordinator();
    const targetGateway = (target: ProviderDiscoveryTarget) => withPreviewProviderCallPolicy(
      createPostgresProviderGateway(pool(), {
        fetchImplementation: gates.guardedFetch, endpoint: target.baseUrl, model: target.model, maker: target.maker,
        ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(PREVIEW, target), inFlight: gatewayInFlight,
        ...(options.money === undefined ? {} : {
          buildCostEnvelopeSeam: options.money.buildCostEnvelopeSeam(target.providerRef),
          ...(options.money.buildStoryCostEnvelopeSeam === undefined ? {} : { buildStoryCostEnvelopeSeam: options.money.buildStoryCostEnvelopeSeam(target.providerRef) })
        })
      }),
      PREVIEW, target, { sleep: async (milliseconds) => { callSleeps.push(milliseconds); }, busy }
    );
    // LG-A (final review I-1): main.ts's order when the route is asked for; otherwise each target's gateway as before.
    const targetGateways = options.structureRepair === true
      ? new Map(TARGETS.map((target) => [target.providerRef, targetGateway(target)] as const)) : null;
    const structureRepairRoute = targetGateways === null ? null : structureRepairThroughLane(
      previewStructureRepairRoute(TARGETS, (providerRef) => targetGateways.get(providerRef)), previewCallSubjects(PREVIEW));
    const topology = createRunnerProviderTopology(TARGETS, (target) => targetGateways === null ? targetGateway(target)
      : withStructureRepair(targetGateways.get(target.providerRef)!, structureRepairRoute));
    const story = new StoryWriter({
      pool: pool(), pack: PACK, policy: STORY_POLICY, hosted: false, log: () => undefined,
      resolveProvider: (roleRef) => {
        const member = [topology.primary, ...(topology.critique === undefined ? [] : [topology.critique]), ...topology.additionalMakers]
          .find((candidate) => candidate.providerRef === roleRef);
        return member === undefined ? null : { provider: member.provider, providerRef: member.providerRef };
      }
    });
    const observe = (target: ProviderDiscoveryTarget) => claim === "resend"
      ? observeClaimTimeTarget({
        preview: true, sleep: async (milliseconds) => { probeSleeps.push(milliseconds); }, target,
        timeoutMs: PREVIEW_GLM_DEADLINE_MS, ...previewProbeControls(target), fetchImplementation: gates.guardedFetch,
        clock: () => new Date()
      })
      : observeProviderTarget({
        target, timeoutMs: PREVIEW_GLM_DEADLINE_MS, ...previewProbeControls(target), fetchImplementation: gates.guardedFetch,
        clock: () => new Date()
      });
    const probe = async (providerRef: string) => {
      const target = TARGETS.find((candidate) => candidate.providerRef === providerRef);
      if (target === undefined) return { state: "ABSENT" as const, modelId: null, failureCode: "CLAIM_GATEWAY_UNRESOLVED" };
      const observation = await observe(target);
      return { state: observation.state, modelId: observation.modelId, failureCode: observation.failureCode };
    };
    const synthesisRolePolicy = {
      registerVersion: 11, synthesizerRoleRef: SEALED_WRITER_REF, evaluatorRoleRef: SEALED_CHECKER_REF,
      evaluatorLoopMaxRounds: 3, identicalRoleRefs: false,
      synthesizerBound: POLICY.synthesisRolePolicy.synthesizerBound, evaluatorBound: POLICY.synthesisRolePolicy.evaluatorBound,
      sourceRefs: { synthesizerRoleRef: "test-layer:v11", evaluatorRoleRef: "test-layer:v11", evaluatorLoopMaxRounds: "test-layer:v11" }
    };
    // main.ts's boot checks: the six reviewed targets, and every role the register names is one of them.
    assertPreviewProviderTargets(PREVIEW, TARGETS);
    assertPreviewRoleTargets(PREVIEW, TARGETS, [SEALED_WRITER_REF, SEALED_CHECKER_REF, STORY_POLICY.storytellerRoleRef, STORY_POLICY.storyCheckerRoleRef]);
    const fixture = fixtureSettings();
    const runner = new WalkingSkeletonRunner(pool(), topology.primary.provider, {
      ...fixture,
      ...(options.stoppingPolicy === undefined ? {} : {
        stoppingPolicy: { ...fixture.stoppingPolicy!, delta: options.stoppingPolicy.delta, epsilon: options.stoppingPolicy.epsilon }
      }),
      providerRef: topology.primary.providerRef, maker: topology.primary.maker,
      ...(topology.critique === undefined ? {} : { critique: topology.critique }),
      additionalMakers: topology.additionalMakers,
      synthesisRolePolicy,
      story,
      claimTimeProbe: (member) => probe(member.provider_ref),
      claimTimeSynthesisRoleProbe: probe,
      answerRoleFallbackCovered: ({ roleRef, panel }) => previewSealedRoleFallbackCovered(roleRef, panel),
      ...(options.resilience === undefined ? {} : { runResilience: options.resilience }),
      callScheduler,
      ...(options.debateShape === undefined ? {} : { debateShape: options.debateShape }),
      ...(options.engine === undefined ? {} : { engine: options.engine }),
      ...(options.noDigest === true ? { servePolicy: { ...fixture.servePolicy!, compositionBudgets: {
        low: { ...fixture.servePolicy!.compositionBudgets.low, bound: 1 },
        medium: { ...fixture.servePolicy!.compositionBudgets.medium, bound: 1 },
        high: { ...fixture.servePolicy!.compositionBudgets.high, bound: 1 }
      } } } : {}),
      ...(options.money === undefined ? {} : { providerPrices: options.money.providerPrices }),
      ...(options.money?.structureRepairCeiling === undefined ? {} : { structureRepairCeiling: options.money.structureRepairCeiling }),
      ...(options.structureRepair !== true || options.money?.structureRepairCeiling !== undefined ? {}
        : { structureRepairCeiling: previewStructureRepairCeiling(structureRepairRoute) }),
      callSubjects: previewCallSubjects(PREVIEW),
      ...(options.releaseKey === undefined ? {} : { releaseKey: options.releaseKey }),
      ...(options.retirement === undefined ? {} : { retirement: options.retirement }),
      holdRecorder: {
        countCooldownHolds: async () => holdWaits.length,
        record: async (event) => { holdRecords.push(event); },
        wait: async (cooldownMs) => { holdWaits.push(cooldownMs); }
      }
    });
    return { runner, topology, probeSleeps, callSleeps, holdWaits, holdRecords, callScheduler, lanes, laneEvents };
  }

  const panelMember = (providerRef: string, asOf: string): DiscoveredPanelMember => Object.freeze({
    provider_ref: providerRef, maker: configured(providerRef).maker, model_id: PREVIEW_PROVIDER_REF_MODELS[providerRef]!,
    probe_evidence_ref: randomUUID(), probed_at: asOf
  });

  /**
   * A run on `panelRefs` (default: the four-member panel) at `depth` (default 2), with the rotation pin admission
   * writes (counts empty: the first rotated debate), or with `pin` written by hand (the incident's, INCIDENT_PIN).
   * `question` (default: a fresh label) is the run's question line.
   *
   * Debate shape (plan Task 15): with `shape` (the sizes P2a freezes on the receipt) and `settings`, the run is admitted
   * shaped — `depthParams` carries the settings and the receipt the shape — and its argument language is passed to
   * `startRun` EXPLICITLY (`language`, default English), never through the question guesser (amendment 2026-10-13).
   */
  async function admittedRun(label: string, admission: Readonly<{
    panelRefs: readonly string[]; pin?: RotatedRoles; depth?: number; question?: string;
    shape?: DebateShapeCeilingInput; settings?: DebateShapeSettings; language?: Readonly<{ tag: string; name: string }>;
    /** LG-C Task 17: the length row's numbers frozen on the receipt (`envelope_basis.length`); absent, today's receipt. */
    length?: LengthGuidance;
    /** R1d final wave B3: engine 2 frozen on the receipt (`envelope_basis.engine`, needs `length`); absent, engine 1. */
    engine?: EngineSettings;
    /**
     * R2a final wave W2: an encrypted run's owner (the pool's content cipher must already name it, as
     * tests/support/storyEncryptedOwner.ts provisions it); absent, today's legacy asker.
     */
    owner?: Readonly<{ userId: string; ownerRef: string; sessionId: string }>;
    /**
     * R3 Task 17 fix round 1 (ruling R3-T17.1): the run's id, fixed, so everything the engine seeds by it (the map's item
     * order, the grading, review and attack seats) is the same on every run. Needs the test file's node:crypto mock
     * (tests/support/fixed-run-id.ts); absent, startRun mints a random id as today.
     */
    runId?: string;
    /** Side-by-side spec §1 (B6): the release the run is stamped with (startRun's `releaseKey`); absent, `legacy`. */
    releaseKey?: string;
  }> = { panelRefs: PANEL_REFS }): Promise<{ runId: string; workItemId: string; askerId: string; rotated: RotatedRoles; question: string }> {
    const asOf = "2026-10-11T19:30:00.000Z";
    const depth = admission.depth ?? 2;
    // A plain label, not a "should" question: the fixture composition map rates only the `unknown` claim type.
    // Reply language (#154): the scripted replies are English, checked against the question's language. A UUID's hex
    // letters made about 1 label in 6 read as Portuguese (lone "e", "a"), so the replies were refused at random; the
    // label's fresh part is digits only, so the label always reads as no named language ("und", Latin script) and the
    // English replies pass.
    const question = admission.question ?? `preview-busy-model-${label}-${randomUUID().replace(/[a-f]/gu, (hex) => String(hex.charCodeAt(0) - 87))}`;
    const askerId = `asker:${question}:${randomUUID()}`;
    const panel = admission.panelRefs.map((ref) => panelMember(ref, asOf));
    const rotated = admission.pin ?? pickRotatedRoles({ panel, counts: {}, seed: roleRotationSeed({ as_of: asOf, question_line: question }) });
    if (rotated === null) throw new Error("test: four makers always rotate");
    if (admission.runId !== undefined) nextRandomUUIDIs(admission.runId);
    // R3 final wave P17 (Task 17 Minor 2): a start that throws never leaves the fixed id pending for a later randomUUID().
    let runId: string;
    try {
      runId = await new RunRepository(pool()).startRun({
        questionLine: question,
        ...(admission.owner === undefined
          ? { principal: { kind: "legacy" as const, legacyAskerId: askerId }, sessionId: `session:${askerId}` }
          : { principal: { kind: "server" as const, userId: admission.owner.userId, ownerRef: admission.owner.ownerRef },
            sessionId: admission.owner.sessionId }),
        callerScope: "ASKER", asOf: new Date(asOf), askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER",
        tierProvenanceRef: `asker-declaration:${askerId}`, compositionBudgetTier: "high",
        depthParams: { depth, ...(admission.settings ?? {}) }, discoveredPanel: panel, strangerSampleRate: 1,
        envelopeBasis: computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize: panel.length, depth,
          ...(admission.shape === undefined ? {} : { shape: admission.shape }),
          ...(admission.length === undefined ? {} : { length: admission.length }),
          ...(admission.engine === undefined ? {} : { engine: admission.engine }) }),
        ...(admission.shape === undefined ? {} : {
          argumentLanguageTag: (admission.language ?? { tag: "en" }).tag,
          argumentLanguageName: (admission.language ?? { name: "English" }).name
        }),
        registerVersion: 1, batteryVersion: "s00", batteryRows,
        ...(admission.releaseKey === undefined ? {} : { releaseKey: admission.releaseKey })
      });
    } finally {
      if (admission.runId !== undefined) clearPendingRunId();
    }
    if (admission.runId !== undefined) fixedRunIdTaken(admission.runId, runId);
    await insertRunRoleRotation(pool(), { runId, ...rotationPinFields(rotated) });
    const workItemId = await new WorkItemRepository(pool()).enqueue({
      runId, batteryRowId: "Q1", nodeSet: [], commandKey: `preview-busy-model-run:${runId}`
    });
    return { runId, workItemId, askerId, rotated, question };
  }

  async function modelCalls(runId: string) {
    return (await pool().query<{ call_site_key: string; actor_ref: string; outcome: string }>(
      `SELECT call_site_key, actor_ref, outcome FROM ledger.ledger_entry
        WHERE run_id=$1 AND action_kind='MODEL_CALL' ORDER BY sequence`, [runId]
    )).rows;
  }

  /**
   * Runs the work item to its end. A run that does not complete fails the test with what the run left behind: the
   * error, the work item's terminal reason, every model call that did not answer OK, the waits and the gates' answers.
   */
  async function completedRun(
    composed: Awaited<ReturnType<typeof previewRunner>>, debate: Awaited<ReturnType<typeof admittedRun>>,
    gates: Awaited<ReturnType<typeof startGates>>
  ): Promise<{ kind: "COMPLETED"; answerId: string }> {
    let failure: string;
    try {
      const result = await composed.runner.executeWorkItem(debate.workItemId);
      if (result.kind === "COMPLETED") return result;
      failure = `result ${JSON.stringify(result)}`;
    } catch (error) {
      failure = `error ${String((error as { code?: unknown }).code)}: ${error instanceof Error ? error.message : String(error)}`;
    }
    const workItem = (await pool().query<{ state: string; terminal_reason: string | null }>(
      `SELECT state, terminal_reason FROM core.work_item WHERE work_item_id=$1`, [debate.workItemId])).rows[0];
    const notOk = (await modelCalls(debate.runId)).filter((call) => call.outcome !== "OK")
      .map((call) => `${call.call_site_key} ${call.actor_ref} ${call.outcome}`);
    const answers = new Map<string, number>();
    for (const request of gates.requests) {
      const key = `${request.provider} ${request.model} ${request.kind} ${request.answer}`;
      answers.set(key, (answers.get(key) ?? 0) + 1);
    }
    throw new Error([
      `expected a completed run; got ${failure}`,
      `work item ${workItem?.state ?? "?"} terminal_reason=${String(workItem?.terminal_reason)}`,
      `model calls not OK (${String(notOk.length)}): ${notOk.join(" | ")}`,
      `holdWaits=${JSON.stringify(composed.holdWaits)} callSleeps=${JSON.stringify(composed.callSleeps)}`,
      `deepinfra halt=${JSON.stringify(gates.halt)} remaining reads=${JSON.stringify(gates.remainingReads)}`,
      `gate answers: ${[...answers].map(([key, count]) => `${key} x${String(count)}`).join(" | ")}`
    ].join("\n"));
  }

  /** The answer's owner-side disclosure row (migrations 0076 and 0114): who wrote and checked it, and why it moved. */
  async function disclosureOf(answerId: string) {
    return (await pool().query<{
      fallback_reason: string | null; writer_fallback_reason: string | null; checker_fallback_reason: string | null;
    }>(`SELECT fallback_reason, writer_fallback_reason, checker_fallback_reason FROM serve.serve_disclosure
         WHERE answer_id=$1 ORDER BY answer_version DESC LIMIT 1`, [answerId])).rows[0];
  }

  /** The owner-side row's body facts (migration 0076): the spend stop that ended the arguing, and the points it left unreviewed. */
  async function bodyFactsOf(answerId: string) {
    return (await pool().query<{ body_stop: string | null; points_without_review: number | null }>(
      `SELECT body_stop, points_without_review FROM serve.serve_disclosure WHERE answer_id=$1 ORDER BY answer_version DESC LIMIT 1`,
      [answerId])).rows[0];
  }

  /** The served answer and its story, read as the asker reads them; with the work item's settled state. */
  async function servedAnswer(debate: Awaited<ReturnType<typeof admittedRun>>, answerId: string) {
    const answer = await new ServeRepository(pool()).readAnswerProjection(answerId, debate.askerId);
    const story = await new StoryRepository(pool()).readForAnswer({
      answerId, answerVersion: null, ownership: { legacyAskerId: debate.askerId }
    });
    const workItem = (await pool().query<{ state: string; terminal_reason: string | null }>(
      `SELECT state, terminal_reason FROM core.work_item WHERE work_item_id=$1`, [debate.workItemId])).rows[0];
    return { answer, story, workItem };
  }

  return {
    startGates, fixtureSettings, previewRunner, admittedRun, modelCalls, completedRun, disclosureOf, bodyFactsOf, servedAnswer
  };
}
