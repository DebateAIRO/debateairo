// A busy model never blocks a preview debate: the RUNNER's proof (spec
// docs/superpowers/specs/2026-10-11-preview-busy-model-design.md, "Must be proven by tests", Runner and Claim probe).
// On 2026-10-11 DeepInfra answered 429 to GLM-5.3-Flash continuously. After the fix the ask admits the four models
// that answered and pins the four rotated roles among them (spec §3); this file is what happens next: the REAL
// WalkingSkeletonRunner, on a migrated embedded PostgreSQL, drives that four-maker debate at depth 2 to a served
// answer and a verdict story, and never sends GLM a byte although GLM stays configured (both reviewed GLM refs are
// targets, exactly as on the preview, and the sealed v11 writer ref preview:fixture-a is GLM).
// The providers are composed as apps/runner/src/main.ts composes them on the preview: the six reviewed targets, the
// topology's first target as primary, each gateway = withPreviewProviderCallPolicy(createPostgresProviderGateway(…
// over createPreviewGuardedFetch …)), both claim probes through observeClaimTimeTarget. The two gates are real RPC
// ports (createPreviewBudgetRpcPort) over unix-socket stubs that answer vendor-shaped replies by the request's
// contract, so the 409 mapping, the body checks and the Anthropic wire are the shipped ones. Only the 60-second
// waits are injected. Integration suites are skipped by the CI gate: run this file by hand before merging.
//
// JSON mode (spec "Check the JSON-mode needs"; owner, 2026-10-12): GLM is the only reviewed row with jsonObject true
// (packages/providers/src/preview-models.ts; MiMo's JSON mode was tried and withdrawn the same day). The story calls ask for JSON mode themselves
// (packages/story/src/writer.ts, preferredResponseFormat "json_object"), and on the preview every structured served step
// (judge legs, panel, review, answer writer, answer checker) asks for it on a jsonObject row (withPreviewProviderCallPolicy).
// The gateway adds response_format only on the story or served lane AND for a gateway built with
// supportsJsonObjectResponse, which providerTargetGatewayControls sets only for a jsonObject row; the guarded fetch
// refuses response_format on any other row (packages/providers/src/preview-test.ts, deepInfraBodyAccepted). So here,
// without GLM, no request carries JSON mode; every story call goes out WITHOUT it, and the
// story's reader is a strict JSON.parse
// (packages/story/src/validate.ts:262-270),
// with the storyteller's one repair turn (story bound maxAttempts 2) as the only fallback. The doubles
// (tests/support/preview-gate-stubs.ts) answer bare JSON, so this file proves the plumbing, not that a real model answers bare JSON without JSON mode.
//
// Run resilience (spec docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md, "Tests" T1 and T2): the
// second describe replays the live incident of run b53b9a9e on the same harness. Five makers at depth 2 with the
// incident's rotation pin; GLM (and in T1 Qwen) refuses every call after claim as a gate-proven unbilled 429; in T1
// the DeepInfra gate halts after its 4th unbilled release (409 PREVIEW_TEST_AUTHORITY_STOPPED, /remaining "halted").
// Both expect the run to be served all the same. They were written red first, against 8b3201d75.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createInitialBatteryRows, WorkItemRepository } from "@debateai/battery";
import { RunRepository, insertRunRoleRotation, migrate, type DiscoveredPanelMember } from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";
import {
  assertPreviewProviderTargets,
  assertPreviewRoleTargets,
  createPreviewBudgetRpcPort,
  createPreviewGuardedFetch,
  observeClaimTimeTarget,
  observeProviderTarget,
  parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets,
  PREVIEW_GLM_DEADLINE_MS,
  PreviewModelCooling,
  previewModelRow,
  previewProbeControls,
  previewRunnerPolicy,
  previewRunResilience,
  previewSealedRoleFallbackCovered,
  previewTargetGatewayControls,
  previewTargetJsonRow,
  providerTargetGatewayControls,
  PREVIEW_PROVIDER_REF_MODELS,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  withPreviewProviderCallPolicy,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import {
  CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY,
  buildStoryRegisterRows,
  computeStructuralCeilingBasis,
  readStoryPolicy
} from "@debateai/register";
import { createPostgresProviderGateway, WalkingSkeletonRunner, type WalkingSkeletonSettings } from "@debateai/runner";
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
import {
  GATE_ANSWERS_REACHING_VENDOR,
  startPreviewGateStubs,
  STUB_COOL_OFF_RETRY_AFTER_SECONDS,
  type GateDebateScripts,
  type GateOverride,
  type GateRequest
} from "../support/preview-gate-stubs.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
/** Owner ruling 5 / R4: the one wait before the one resend of a gate-proven unbilled refusal. */
const UNBILLED_RESEND_MS = 60_000;
/** The frozen panel the ask admitted with GLM busy (spec §3): the four makers that answered, in register order. */
const PANEL_REFS = Object.freeze([
  "preview:deepseek-v4-1-flash", "preview:mimo-v2-6-pro", "preview:qwen-3-8-flash", "preview:claude-haiku-5-5"
]);
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU],
  requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/provider-budget.sock",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget.sock", scope_id: "preview-busy-model-run"
}))! as PreviewProviderTestConfig;
/** The register's configured provider for a reviewed ref (its row's maker and adapter kind). */
const configured = (providerRef: string) => {
  const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
  return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
};
/** All SIX reviewed targets, GLM's two refs included: GLM is configured, only the run's panel leaves it out. */
const TARGETS = parseProviderDiscoveryTargets(
  JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)), PREVIEW_REVIEWED_PROVIDER_REFS.map(configured)
);
/** The sealed organ bounds, seen through the preview's runner policy exactly as main.ts reads them. */
const POLICY = previewRunnerPolicy({
  bounds: DEVELOPMENT_ORGAN_COST_BOUNDS.organs,
  synthesisRolePolicy: {
    synthesizerBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.COMPOSER,
    evaluatorBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.CONFORMANCE
  }
}, PREVIEW);
/** Register v11's sealed answer roles: GLM writes, DeepSeek checks (deploy/preview-auth-dev/v1/publish-register-v2.ts). */
const SEALED_WRITER_REF = "preview:fixture-a";
const SEALED_CHECKER_REF = "preview:deepseek-v4-1-flash";
/** The v11 story rows: the storyteller follows the sealed writer, the story checker the sealed checker. */
const STORY_POLICY = readStoryPolicy(buildStoryRegisterRows({
  synthesizerRoleRef: SEALED_WRITER_REF, evaluatorRoleRef: SEALED_CHECKER_REF,
  sourceRef: "test-layer:preview-busy-model", hosted: false
}), 11)!;
/** The sealed envelope-formula terms the ask path sizes a run with (as tests/integration/preview-busy-model-ask.test.ts). */
const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 2,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
/** Run b53b9a9e's panel (spec 2026-10-12 "Incident"): all five makers, in register order, GLM by its writer ref. */
const FIVE_MAKER_REFS = Object.freeze([SEALED_WRITER_REF, ...PANEL_REFS]);
const rotationPick = (providerRef: string): RotationPick => Object.freeze({
  providerRef, modelId: PREVIEW_PROVIDER_REF_MODELS[providerRef]!, maker: configured(providerRef).maker
});
/**
 * The incident's rotation pin, written by hand (spec 2026-10-12 "Incident"): GLM writes and tells the story, DeepSeek
 * checks the answer, Haiku checks the story. The runner seats the debaters in `eligibleModelIds` order, opener first
 * (apps/runner/src/run-seats.ts pinnedPositionOrder; apps/runner/src/index.ts:5047-5049), so GLM is the last root
 * (root index 4, key JUDGE:root:4), as in the incident: roots 0-3 were written before GLM's own root was asked.
 */
const INCIDENT_PIN: RotatedRoles = Object.freeze({
  rule: ROLE_ROTATION_RULE,
  answerWriter: rotationPick(SEALED_WRITER_REF), answerChecker: rotationPick(SEALED_CHECKER_REF),
  storyteller: rotationPick(SEALED_WRITER_REF), storyChecker: rotationPick("preview:claude-haiku-5-5"),
  opener: rotationPick(SEALED_CHECKER_REF),
  eligibleModelIds: Object.freeze([DEEPSEEK, MIMO, QWEN, HAIKU, GLM])
});
/**
 * Spec 2026-10-12 fixes (a)-(d): the runner's one new preview setting, which gate serves a ref and which model it is
 * (so a busy model sits out on all of its refs, and a halted gate takes every member behind it). The same helper
 * apps/runner/src/main.ts composes it with on the preview (`previewRunResilience`); both answer undefined for a ref
 * the preview does not know. (The red run on 8b3201d75 built it inline: that runner had no such field and ignored it.)
 */
const RUN_RESILIENCE = previewRunResilience(PREVIEW)!;
const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
const batteryRows = createInitialBatteryRows({ settlementWatchHandle: "settlement-watch:preview-busy-model-run" });

let database: TestDatabase;
const stubClosers: (() => Promise<void>)[] = [];

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);
afterEach(async () => {
  await Promise.all(stubClosers.splice(0).map((close) => close()));
});
afterAll(async () => database?.stop());

/* ------------------------------------------------------------------ the gates */

/**
 * Both preview gates over real unix sockets (tests/support/preview-gate-stubs.ts, shared with the preview practice
 * tool's integration test), speaking the gate's RPC protocol, routed by URL as the gate routes them: `POST /complete`
 * (one model call) and `POST /remaining` (the read-only day figures, contract A §5). Every /complete request is
 * recorded in arrival order with how it was answered; every /remaining read is recorded apart. Without `debate`
 * scripts a GLM request is answered as a billed vendor 500 (and fails the test by the record). A probe takes the next
 * step of its model's script (OK once spent); with `debate` scripts (GateDebateScripts: absent, the first describe's
 * rule stands) a scripted model refuses every other request unbilled, and the DeepInfra gate halts at its ceiling
 * (409 PREVIEW_TEST_AUTHORITY_STOPPED, /remaining "halted"); the Anthropic gate never halts. Every other request is
 * answered by its contract. The story double tells one path per position the storyteller was handed (its own
 * `positions` field, packages/story/src/material.ts), so a debate that lost a root mid-run (T1, T2) is told with as
 * many paths as it has positions (validate.ts STORY_POSITION_COVERAGE).
 */
async function startGates(
  probeScripts: Readonly<Record<string, readonly ("OK" | "UNBILLED")[]>>, debate?: GateDebateScripts,
  override?: (request: GateRequest) => GateOverride | null
) {
  const stubs = await startPreviewGateStubs({
    storyDefaultShape: PACK.defaultShape, probeScripts,
    ...(debate === undefined ? { refuseModels: [GLM] } : { debate }),
    ...(override === undefined ? {} : { override })
  });
  stubClosers.push(stubs.close);
  // The /remaining reads arrive on the same socket as /complete, as on the preview (createPreviewRemainingRpcPort).
  const deepinfra = createPreviewBudgetRpcPort(PREVIEW, stubs.sockets.deepinfra);
  const anthropic = createPreviewBudgetRpcPort(PREVIEW, stubs.sockets.anthropic);
  return {
    requests: stubs.requests, remainingReads: stubs.remainingReads, halt: stubs.halt, cooling: stubs.cooling,
    deepinfraPort: deepinfra, guardedFetch: createPreviewGuardedFetch({ deepinfra, anthropic })
  };
}

/* ------------------------------------------------------------------ the runner, composed as main.ts */

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
    // δ and ε of 0: no branch freezes and the run never stops early, so depth 2 is expanded in full.
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
 * The claim probe of one target. `resend` is main.ts's observeClaimTarget (spec §2: one 60-second resend after a
 * gate-proven unbilled refusal, the claim keeps the last observation); `single` is the composition before the fix
 * (observeProviderTarget: one probe, no resend), kept as the control below.
 */
type ClaimComposition = "resend" | "single";

/**
 * apps/runner/src/main.ts's preview runner, over these gates; the waits are recorded, never slept. `resilience` is the
 * run-resilience setting (RUN_RESILIENCE): only the second describe passes it, so the first describe's runner stays
 * 8b3201d75's composition exactly.
 */
function previewRunner(gates: Awaited<ReturnType<typeof startGates>>, claim: ClaimComposition, resilience?: typeof RUN_RESILIENCE) {
  const probeSleeps: number[] = [];
  const callSleeps: number[] = [];
  const holdWaits: number[] = [];
  const topology = createRunnerProviderTopology(TARGETS, (target) => withPreviewProviderCallPolicy(
    createPostgresProviderGateway(database.pool, {
      fetchImplementation: gates.guardedFetch, endpoint: target.baseUrl, model: target.model, maker: target.maker,
      ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(PREVIEW, target)
    }),
    PREVIEW, target, { sleep: async (milliseconds) => { callSleeps.push(milliseconds); } }
  ));
  const story = new StoryWriter({
    pool: database.pool, pack: PACK, policy: STORY_POLICY, hosted: false, log: () => undefined,
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
  const runner = new WalkingSkeletonRunner(database.pool, topology.primary.provider, {
    ...fixtureSettings(),
    providerRef: topology.primary.providerRef, maker: topology.primary.maker,
    ...(topology.critique === undefined ? {} : { critique: topology.critique }),
    additionalMakers: topology.additionalMakers,
    synthesisRolePolicy,
    story,
    claimTimeProbe: (member) => probe(member.provider_ref),
    claimTimeSynthesisRoleProbe: probe,
    answerRoleFallbackCovered: ({ roleRef, panel }) => previewSealedRoleFallbackCovered(roleRef, panel),
    ...(resilience === undefined ? {} : { runResilience: resilience }),
    holdRecorder: {
      countCooldownHolds: async () => holdWaits.length,
      record: async () => undefined,
      wait: async (cooldownMs) => { holdWaits.push(cooldownMs); }
    }
  });
  return { runner, topology, probeSleeps, callSleeps, holdWaits };
}

/* ------------------------------------------------------------------ the run, as admission writes it */

const panelMember = (providerRef: string, asOf: string): DiscoveredPanelMember => Object.freeze({
  provider_ref: providerRef, maker: configured(providerRef).maker, model_id: PREVIEW_PROVIDER_REF_MODELS[providerRef]!,
  probe_evidence_ref: randomUUID(), probed_at: asOf
});

/**
 * A depth-2 run on `panelRefs` (default: the four-member panel), with the rotation pin admission writes (counts empty:
 * the first rotated debate), or with `pin` written by hand (the incident's, INCIDENT_PIN).
 */
async function admittedRun(label: string, admission: Readonly<{ panelRefs: readonly string[]; pin?: RotatedRoles }> = { panelRefs: PANEL_REFS }):
  Promise<{ runId: string; workItemId: string; askerId: string; rotated: RotatedRoles }> {
  const asOf = "2026-10-11T19:30:00.000Z";
  // A plain label, not a "should" question: the fixture composition map rates only the `unknown` claim type.
  const question = `preview-busy-model-${label}-${randomUUID()}`;
  const askerId = `asker:${question}`;
  const panel = admission.panelRefs.map((ref) => panelMember(ref, asOf));
  const rotated = admission.pin ?? pickRotatedRoles({ panel, counts: {}, seed: roleRotationSeed({ as_of: asOf, question_line: question }) });
  if (rotated === null) throw new Error("test: four makers always rotate");
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: question, principal: { kind: "legacy", legacyAskerId: askerId }, sessionId: `session:${question}`,
    callerScope: "ASKER", asOf: new Date(asOf), askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER",
    tierProvenanceRef: `asker-declaration:${question}`, compositionBudgetTier: "high",
    depthParams: { depth: 2 }, discoveredPanel: panel, strangerSampleRate: 1,
    envelopeBasis: computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize: panel.length, depth: 2 }),
    registerVersion: 1, batteryVersion: "s00", batteryRows
  });
  await insertRunRoleRotation(database.pool, { runId, ...rotationPinFields(rotated) });
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `preview-busy-model-run:${runId}`
  });
  return { runId, workItemId, askerId, rotated };
}

async function modelCalls(runId: string) {
  return (await database.pool.query<{ call_site_key: string; actor_ref: string; outcome: string }>(
    `SELECT call_site_key, actor_ref, outcome FROM ledger.ledger_entry
      WHERE run_id=$1 AND action_kind='MODEL_CALL' ORDER BY sequence`, [runId]
  )).rows;
}

describe("a preview debate admitted without busy GLM runs to an answer and a story (spec 2026-10-11 busy model)", () => {
  it("four makers, depth 2: the pinned writer's [409, OK] claim probe keeps it, and GLM is never sent a byte", async () => {
    const debate = await admittedRun("run");
    const writerModel = debate.rotated.answerWriter.modelId;
    const gates = await startGates({ [writerModel]: ["UNBILLED", "OK"] });
    const composed = previewRunner(gates, "resend");
    const startedAt = new Date();
    const result = await composed.runner.executeWorkItem(debate.workItemId);
    if (result.kind !== "COMPLETED") throw new Error(`expected a completed run, got ${result.kind}`);

    // GLM is configured (both reviewed refs are targets; the topology's primary is GLM) but never called or probed.
    expect(composed.topology.primary.providerRef).toBe(SEALED_WRITER_REF);
    expect(gates.requests.filter((request) => request.model === GLM)).toEqual([]);
    expect(gates.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);

    // The claim probe (spec §2): one 60-second resend for the writer's unbilled refusal and nothing else; the four
    // members claim-eligible, each recorded HEALTHY; no member dropped, so no CLAIM_PANEL_REVISED disclosure.
    expect(composed.probeSleeps).toEqual([UNBILLED_RESEND_MS]);
    expect(composed.callSleeps).toEqual([]);
    expect(composed.holdWaits).toEqual([]);
    const probes = gates.requests.filter((request) => request.kind === "PROBE").map((request) => request.model);
    expect([...probes].sort()).toEqual([...PANEL_REFS.map((ref) => PREVIEW_PROVIDER_REF_MODELS[ref]!), writerModel].sort());
    const probeRows = await database.pool.query<{ provider_ref: string; state: string; failure_code: string | null }>(
      `SELECT provider_ref, state, failure_code FROM core.provider_probe WHERE probed_at >= $1 ORDER BY provider_ref`, [startedAt]);
    expect(probeRows.rows).toEqual([...PANEL_REFS].sort().map((provider_ref) => ({ provider_ref, state: "HEALTHY", failure_code: null })));

    // A served answer, written by the pin's writer and checked by the pin's checker, with no revised-panel mark.
    const answer = await new ServeRepository(database.pool).readAnswerProjection(result.answerId, debate.askerId);
    expect(answer).not.toBeNull();
    expect(JSON.stringify(answer?.condition_mark_records ?? [])).not.toContain("CLAIM_PANEL_REVISED");
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => call.outcome !== "OK")).toEqual([]);
    expect(new Set(calls.map((call) => call.actor_ref))).toEqual(new Set(PANEL_REFS));
    const actorOf = (key: string) => calls.filter((call) => call.call_site_key === key).map((call) => call.actor_ref);
    expect(actorOf("COMPOSER:SYNTHESIZER:INITIAL:1")).toEqual([debate.rotated.answerWriter.providerRef]);
    expect(actorOf("POST_COMPOSE_R9:EVALUATOR:1")).toEqual([debate.rotated.answerChecker.providerRef]);
    // All four debated: one root position each, the pin's opener first (opener rotation); and depth 2 was really
    // argued, with second-round legs under every root.
    const roots = ["JUDGE", "JUDGE:root:secondary", "JUDGE:root:2", "JUDGE:root:3"].map((key) => actorOf(key));
    expect(roots[0]).toEqual([debate.rotated.opener.providerRef]);
    expect(new Set(roots.flat())).toEqual(new Set(PANEL_REFS));
    for (const root of [0, 1, 2, 3]) {
      expect(calls.some((call) => new RegExp(`^JUDGE:(?:defender|critic):root${String(root)}:r2:`, "u").test(call.call_site_key))).toBe(true);
    }

    // The verdict story, READY, told and checked by the pin's pair.
    const stored = await new StoryRepository(database.pool).readForAnswer({
      answerId: result.answerId, answerVersion: null, ownership: { legacyAskerId: debate.askerId }
    });
    expect(stored).toMatchObject({ outcome: "READY", failureCode: null });
    expect(calls.filter((call) => call.call_site_key.startsWith("STORY:")).map((call) => [call.call_site_key, call.actor_ref])).toEqual([
      ["STORY:STORYTELLER:1", debate.rotated.storyteller.providerRef],
      ["STORY:CHECKER:1", debate.rotated.storyChecker.providerRef]
    ]);
    expect(gates.requests.filter((request) => request.kind === "STORYTELLER").map((request) => request.model))
      .toEqual([debate.rotated.storyteller.modelId]);
    expect(gates.requests.filter((request) => request.kind === "STORY_CHECKER").map((request) => request.model))
      .toEqual([debate.rotated.storyChecker.modelId]);

    // JSON mode (header comment): no request for a row without jsonObject ever carried response_format, and without
    // GLM no row in this run has it (MiMo's requests went out with its sampling and without JSON mode).
    expect(gates.requests.filter((request) => Object.hasOwn(request.body, "response_format"))).toEqual([]);
    expect(gates.requests.some((request) => request.model === MIMO && request.kind !== "PROBE")).toBe(true);
  });

  it("control: the claim probe before the fix (one probe, no resend) loses the pinned writer and J24 refuses the run", async () => {
    // Without this, a scenario whose writer never met the refusal would pass the test above for the wrong reason.
    const debate = await admittedRun("control");
    const gates = await startGates({ [debate.rotated.answerWriter.modelId]: ["UNBILLED", "OK"] });
    const composed = previewRunner(gates, "single");
    await expect(composed.runner.executeWorkItem(debate.workItemId)).rejects.toMatchObject({
      code: "SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM",
      message: expect.stringContaining(`pinned SYNTHESIZER role ref ${debate.rotated.answerWriter.providerRef} was absent at claim (PROVIDER_PROBE_UNBILLED_REFUSAL)`)
    });
    expect(composed.probeSleeps).toEqual([]);
    expect(gates.requests.filter((request) => request.kind !== "PROBE")).toEqual([]);
    expect(gates.requests.filter((request) => request.model === GLM)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ run resilience (spec 2026-10-12, T1 and T2) */

const HAIKU_REF = "preview:claude-haiku-5-5";
const WRITER_KEY = "COMPOSER:SYNTHESIZER:INITIAL:1";
const CHECKER_KEY = "POST_COMPOSE_R9:EVALUATOR:1";
/** GLM's root: last in the incident pin's position order (INCIDENT_PIN), so root index 4. */
const GLM_ROOT_KEY = "JUDGE:root:4";
/** GLM's entry in the run-time panel disclosure (spec (d) "Disclosure"), inside the RUN_PANEL_REVISED list. */
const GLM_SAT_OUT = /RUN_PANEL_REVISED:(?:[^,;\s]+,)*preview:fixture-a=PROVIDER_BUSY(?:[,;\s]|$)/u;

/**
 * Runs the work item to its end. A run that does not complete fails the test with what the run left behind: the
 * error, the work item's terminal reason, every model call that did not answer OK, the waits and the gates' answers.
 * That message is the red evidence on 8b3201d75.
 */
async function completedRun(
  composed: ReturnType<typeof previewRunner>, debate: Awaited<ReturnType<typeof admittedRun>>,
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
  const workItem = (await database.pool.query<{ state: string; terminal_reason: string | null }>(
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
  return (await database.pool.query<{
    fallback_reason: string | null; writer_fallback_reason: string | null; checker_fallback_reason: string | null;
  }>(`SELECT fallback_reason, writer_fallback_reason, checker_fallback_reason FROM serve.serve_disclosure
       WHERE answer_id=$1 ORDER BY answer_version DESC LIMIT 1`, [answerId])).rows[0];
}

/** The owner-side row's body facts (migration 0076): the spend stop that ended the arguing, and the points it left unreviewed. */
async function bodyFactsOf(answerId: string) {
  return (await database.pool.query<{ body_stop: string | null; points_without_review: number | null }>(
    `SELECT body_stop, points_without_review FROM serve.serve_disclosure WHERE answer_id=$1 ORDER BY answer_version DESC LIMIT 1`,
    [answerId])).rows[0];
}

/** The served answer and its story, read as the asker reads them; with the work item's settled state. */
async function servedAnswer(debate: Awaited<ReturnType<typeof admittedRun>>, answerId: string) {
  const answer = await new ServeRepository(database.pool).readAnswerProjection(answerId, debate.askerId);
  const story = await new StoryRepository(database.pool).readForAnswer({
    answerId, answerVersion: null, ownership: { legacyAskerId: debate.askerId }
  });
  const workItem = (await database.pool.query<{ state: string; terminal_reason: string | null }>(
    `SELECT state, terminal_reason FROM core.work_item WHERE work_item_id=$1`, [debate.workItemId])).rows[0];
  return { answer, story, workItem };
}

describe("a preview debate survives a busy model and a halted gate (spec 2026-10-12 run resilience, T1 and T2)", () => {
  it("T1, the incident replay: GLM and Qwen busy, the DeepInfra gate halts at its 4th unbilled release, and the answer is still served", async () => {
    // N = 4, from the run's call order (apps/runner/src/index.ts). Root 0 is the opener DeepSeek's (`JUDGE`,
    // :5961-5990). Then root 0's panel (`PANEL:root`, :6019-6031): the judge seats in the pin's position order without
    // the author (runNodePanel, :5455-5521; the cap of panel size - 1 = 4 calls every other seat), asked one at a
    // time (runJudgePanel, packages/judgement/src/s04.ts:442): MiMo, Qwen, Haiku, GLM. Qwen's assessment is refused,
    // resent after the 60-second wait and refused again (unbilled releases 1 and 2); GLM's the same (3 and 4). So the
    // gate halts on GLM's resend inside root 0's panel: just when each busy model has had its one call ending in
    // unbilled refusals (R-a), and before any later call could ask either again. The incident's halt came at the 20th
    // release only because the run kept asking both. The next DeepInfra call (MiMo's root 1, `JUDGE:root:secondary`,
    // :6355-6370) is the first one the gate answers STOPPED; on 8b3201d75 that is a MONEY phase stop, and serve then
    // walks GLM, MiMo, Qwen (three STOPPED hops, three FAILED rows at the writer's key) and is refused
    // CALL_BUDGET_EXHAUSTED before it reaches Haiku (spec "Incident" step 3): the control below.
    const debate = await admittedRun("incident", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({}, { unbilled: [GLM, QWEN], deepInfraHaltAt: 4 });
    const composed = previewRunner(gates, "resend", RUN_RESILIENCE);
    const result = await completedRun(composed, debate, gates);

    // The scenario really replayed the incident: the DeepInfra gate reached its ceiling and halted.
    expect(gates.halt.unbilledReleases).toBe(4);
    expect(gates.halt.haltedAt).not.toBeNull();

    // A SERVED answer (serve_state COMPOSED or RECOMPOSED_ONCE, never the components-only floor) and a READY story.
    const { answer, story, workItem } = await servedAnswer(debate, result.answerId);
    expect(answer).not.toBeNull();
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(story).toMatchObject({ outcome: "READY", failureCode: null });

    // The work item never failed (no CALL_BUDGET_EXHAUSTED), and no reason anywhere is money.
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    const records = answer!.condition_mark_records;
    const recordsText = JSON.stringify(records.map((record) => [record.mark, record.reason]));
    expect(recordsText).not.toContain("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(recordsText).not.toContain("CALL_BUDGET_EXHAUSTED");
    expect(records.filter((record) => record.mark === "ENVELOPE_EXHAUSTED")).toEqual([]);
    expect(answer!.condition_marks).not.toContain("ENVELOPE_EXHAUSTED");
    expect(await disclosureOf(result.answerId)).toEqual({
      fallback_reason: null, writer_fallback_reason: "ROLE_UNAVAILABLE", checker_fallback_reason: "ROLE_UNAVAILABLE"
    });

    // GLM's root dropped, and disclosed in the existing CRITIQUE-UNAVAILABLE record (spec (d) "Disclosure", R-b).
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => call.call_site_key === GLM_ROOT_KEY && call.outcome === "OK")).toEqual([]);
    const revised = records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE" && record.reason.includes("RUN_PANEL_REVISED:"));
    expect(revised, `condition mark records: ${recordsText}`).toBeDefined();
    expect(revised!.reason, `condition mark records: ${recordsText}`).toMatch(GLM_SAT_OUT);
    // Review 2026-10-12, test gap (a): the disclosure pinned to the byte, derived from what the run did. A model whose
    // calls the vendor refused unbilled (two UNBILLED answers: the call and its resend) is PROVIDER_BUSY — Qwen and
    // GLM, in root 0's panel; every other DeepInfra member of the panel sat out when MiMo's root 1 met the halted gate
    // (STOPPED, /remaining "halted"): PROVIDER_GATE_UNAVAILABLE. Haiku, behind the other gate, never sat out. The list
    // follows the run's configured makers, the panel's order (GLM by its writer ref first).
    const vendorBusyModels = new Set(gates.requests.filter((request) => request.kind !== "PROBE" && request.answer === "UNBILLED")
      .map((request) => request.model));
    expect([...vendorBusyModels].sort()).toEqual([GLM, QWEN].sort());
    const derived = `RUN_PANEL_REVISED:${FIVE_MAKER_REFS.filter((ref) => ref !== HAIKU_REF)
      .map((ref) => `${ref}=${vendorBusyModels.has(PREVIEW_PROVIDER_REF_MODELS[ref]!) ? "PROVIDER_BUSY" : "PROVIDER_GATE_UNAVAILABLE"}`).join(",")}`;
    const T1_RUN_PANEL_REVISED = "RUN_PANEL_REVISED:preview:fixture-a=PROVIDER_BUSY,preview:deepseek-v4-1-flash=PROVIDER_GATE_UNAVAILABLE,"
      + "preview:mimo-v2-6-pro=PROVIDER_GATE_UNAVAILABLE,preview:qwen-3-8-flash=PROVIDER_BUSY";
    expect(derived).toBe(T1_RUN_PANEL_REVISED);
    // Nobody was absent at claim, so the CRITIQUE-UNAVAILABLE reason is the run-time revision alone.
    expect(revised!.reason).toBe(T1_RUN_PANEL_REVISED);

    // Test gap (b): fewer than 2 members were left to argue (after the halt only Haiku could still be asked), so the
    // arguing ended as a non-money stop: one authored root (the opener DeepSeek's), served on the members-sat-out
    // footing with a SINGLE-LINEAGE record naming the members that sat out; the owner's row has no spend stop and
    // counts the points left without a review (a number; null on a run that reviewed what it could).
    expect(calls.filter((call) => /^JUDGE(?::root:(?:secondary|\d+))?$/u.test(call.call_site_key) && call.outcome === "OK")
      .map((call) => [call.call_site_key, call.actor_ref])).toEqual([["JUDGE", "preview:deepseek-v4-1-flash"]]);
    expect(answer!.condition_marks).toContain("SINGLE-LINEAGE");
    expect(records.filter((record) => record.mark === "SINGLE-LINEAGE")).toEqual([expect.objectContaining({
      mark: "SINGLE-LINEAGE", scope: "answer", reason: T1_RUN_PANEL_REVISED, lift_path: "RESTORE_PINNED_PROVIDER_AND_RUN_AGAIN"
    })]);
    const body = await bodyFactsOf(result.answerId);
    // The one point the arguing left without a review is that root itself: no reviewer of another maker was left.
    expect(body).toEqual({ body_stop: null, points_without_review: 1 });

    // Zero DeepInfra requests after the halt: none arrives after the one the gate first answered STOPPED; and that
    // STOPPED was read back as a halted gate through its /remaining.
    expect(gates.halt.firstStoppedAt).not.toBeNull();
    expect(gates.requests.slice(gates.halt.firstStoppedAt! + 1).filter((request) => request.provider === "deepinfra")
      .map((request) => `${request.model} ${request.kind} ${request.answer}`)).toEqual([]);
    expect(gates.remainingReads).toContainEqual({ provider: "deepinfra", state: "halted" });

    // The answer writer and checker moved to Haiku, the one maker behind a gate that still serves.
    const okActors = (key: string) => calls.filter((call) => call.call_site_key === key && call.outcome === "OK").map((call) => call.actor_ref);
    expect(okActors(WRITER_KEY)).toEqual([HAIKU_REF]);
    expect(okActors(CHECKER_KEY)).toEqual([HAIKU_REF]);

    // No 10-minute holds (R-a: unbilled-only failures get no cooldown).
    expect(composed.holdWaits).toEqual([]);
  });

  it("T2: GLM refuses every call after claim with no halt; one call (POST + its one resend), then GLM sits out and the run is served", async () => {
    // GLM's first call is its seat on root 0's panel (see T1's call order): refused, resent after the 60-second wait,
    // refused again. From then on GLM sits out (spec (d), R-a): no later panel seat, no root of its own (root 4 is
    // dropped), no writer or storyteller call. Only GLM is scripted to refuse, so the one 60-second wait is GLM's.
    const debate = await admittedRun("busy-glm", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({}, { unbilled: [GLM] });
    const composed = previewRunner(gates, "resend", RUN_RESILIENCE);
    const result = await completedRun(composed, debate, gates);

    // Exactly one GLM call after claim: two POSTs, both refused unbilled; then none. The gate never halted.
    expect(gates.requests.filter((request) => request.model === GLM && request.kind !== "PROBE")
      .map((request) => [request.kind, request.answer])).toEqual([["PANEL", "UNBILLED"], ["PANEL", "UNBILLED"]]);
    expect(gates.halt.haltedAt).toBeNull();
    expect(composed.callSleeps).toEqual([UNBILLED_RESEND_MS]);
    expect(composed.holdWaits).toEqual([]);

    // Served, with a READY story; the work item never failed, so never MAKER_POSITION_UNAVAILABLE.
    const { answer, story, workItem } = await servedAnswer(debate, result.answerId);
    expect(answer).not.toBeNull();
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(story).toMatchObject({ outcome: "READY", failureCode: null });
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    const records = answer!.condition_mark_records;
    const recordsText = JSON.stringify(records.map((record) => [record.mark, record.reason]));
    expect(recordsText).not.toContain("MAKER_POSITION_UNAVAILABLE");

    // GLM's root dropped, disclosed as a run-time panel revision.
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => call.call_site_key === GLM_ROOT_KEY && call.outcome === "OK")).toEqual([]);
    expect(calls.filter((call) => call.outcome === "OK" && PREVIEW_PROVIDER_REF_MODELS[call.actor_ref] === GLM)).toEqual([]);
    const revised = records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE" && record.reason.includes("RUN_PANEL_REVISED:"));
    expect(revised, `condition mark records: ${recordsText}`).toBeDefined();
    expect(revised!.reason, `condition mark records: ${recordsText}`).toMatch(GLM_SAT_OUT);

    // The writer role moved off GLM for an unavailable role, not for money.
    const writers = calls.filter((call) => call.call_site_key === WRITER_KEY && call.outcome === "OK").map((call) => call.actor_ref);
    expect(writers).toHaveLength(1);
    expect(PREVIEW_PROVIDER_REF_MODELS[writers[0]!]).not.toBe(GLM);
    expect(await disclosureOf(result.answerId)).toMatchObject({ fallback_reason: null, writer_fallback_reason: "ROLE_UNAVAILABLE" });
  });

  it("gate v4: GLM busy, the gate cools GLM off after its two unbilled refusals; GLM sits out after ONE call and the run is served", async () => {
    // Gate v4 (preview_budget_authority.py note_unbilled_refusal): after two vendor-unbilled refusals in a row for one
    // model, the gate lets that model cool off and refuses its calls MODEL_COOLING without contacting the vendor; the
    // gate itself never halts on them any more. GLM's one call (its seat on root 0's panel, T2) is the two refusals
    // that start the cool-off: the POST and its one 60-second resend. Then the runner sits GLM out, so no GLM request
    // reaches the vendor again, and any that reached the gate would be answered MODEL_COOLING.
    const debate = await admittedRun("cooling-glm", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({}, { unbilled: [GLM], coolOffAfter: 2 });
    const composed = previewRunner(gates, "resend", RUN_RESILIENCE);
    const result = await completedRun(composed, debate, gates);

    // Two GLM requests reached the vendor after claim (the call and its resend), both refused unbilled; the gate then
    // cooled GLM off, and nothing for GLM reached the vendor after them. Any later GLM request was answered COOLING.
    const glm = gates.requests.filter((request) => request.model === GLM && request.kind !== "PROBE");
    expect(glm.slice(0, 2).map((request) => [request.kind, request.answer])).toEqual([["PANEL", "UNBILLED"], ["PANEL", "UNBILLED"]]);
    expect(glm.slice(2).filter((request) => GATE_ANSWERS_REACHING_VENDOR.has(request.answer))).toEqual([]);
    expect(glm.slice(2).every((request) => request.answer === "COOLING")).toBe(true);
    expect(gates.cooling.get(GLM)).toBe(2);
    expect([...gates.cooling.keys()]).toEqual([GLM]);
    expect(gates.halt.haltedAt).toBeNull();
    // One 60-second wait (GLM's resend), no 10-minute holds.
    expect(composed.callSleeps).toEqual([UNBILLED_RESEND_MS]);
    expect(composed.holdWaits).toEqual([]);
    // Other models were never cooled off and never refused.
    expect(gates.requests.filter((request) => request.model !== GLM).map((request) => request.answer)
      .filter((answer) => answer !== "OK")).toEqual([]);

    // Served, with a READY story; never a money reason, never CALL_BUDGET_EXHAUSTED.
    const { answer, story, workItem } = await servedAnswer(debate, result.answerId);
    expect(answer).not.toBeNull();
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(story).toMatchObject({ outcome: "READY", failureCode: null });
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    const records = answer!.condition_mark_records;
    const recordsText = JSON.stringify(records.map((record) => [record.mark, record.reason]));
    expect(recordsText).not.toContain("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(recordsText).not.toContain("CALL_BUDGET_EXHAUSTED");
    expect(answer!.condition_marks).not.toContain("ENVELOPE_EXHAUSTED");
    const revised = records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE" && record.reason.includes("RUN_PANEL_REVISED:"));
    expect(revised, `condition mark records: ${recordsText}`).toBeDefined();
    expect(revised!.reason, `condition mark records: ${recordsText}`).toMatch(GLM_SAT_OUT);
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => call.outcome === "OK" && PREVIEW_PROVIDER_REF_MODELS[call.actor_ref] === GLM)).toEqual([]);

    // The gate's cool-off is live: one more GLM call now is refused MODEL_COOLING before the vendor is asked, and the
    // app reads it as the busy model it is (PreviewModelCooling), not as money.
    const before = gates.requests.length;
    const refusal: unknown = await gates.deepinfraPort.execute({
      operationId: randomUUID(), requestBody: JSON.stringify({ model: GLM }), requestSha256: "0".repeat(64), reservedUsd: "0.010000000"
    }).then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(PreviewModelCooling);
    expect((refusal as PreviewModelCooling).retryAfterSeconds).toBe(STUB_COOL_OFF_RETRY_AFTER_SECONDS);
    expect(gates.requests.slice(before).map((request) => [request.model, request.answer])).toEqual([[GLM, "COOLING"]]);
  });

  it("gate v4: the halted DeepInfra gate says AUTHORITY_HALTED; the T1 replay is served the same, without asking /remaining", async () => {
    // T1's scenario with gate v4's own word for a halted gate: every DeepInfra /complete after the halt is refused
    // AUTHORITY_HALTED, which the app reads as an unavailable gate at once (no /remaining read, no resend).
    const debate = await admittedRun("incident-halted", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({}, { unbilled: [GLM, QWEN], deepInfraHaltAt: 4, deepInfraHaltedAnswer: "AUTHORITY_HALTED" });
    const composed = previewRunner(gates, "resend", RUN_RESILIENCE);
    const result = await completedRun(composed, debate, gates);

    expect(gates.halt.unbilledReleases).toBe(4);
    expect(gates.halt.firstStoppedAt).not.toBeNull();
    expect(gates.requests[gates.halt.firstStoppedAt!]!.answer).toBe("HALTED");
    expect(gates.requests.filter((request) => request.answer === "STOPPED")).toEqual([]);
    // Zero DeepInfra requests after the first AUTHORITY_HALTED, and no /remaining read was needed to tell.
    expect(gates.requests.slice(gates.halt.firstStoppedAt! + 1).filter((request) => request.provider === "deepinfra")
      .map((request) => `${request.model} ${request.kind} ${request.answer}`)).toEqual([]);
    expect(gates.remainingReads.filter((read) => read.provider === "deepinfra")).toEqual([]);

    const { answer, story, workItem } = await servedAnswer(debate, result.answerId);
    expect(answer).not.toBeNull();
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(story).toMatchObject({ outcome: "READY", failureCode: null });
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    const records = answer!.condition_mark_records;
    const recordsText = JSON.stringify(records.map((record) => [record.mark, record.reason]));
    expect(recordsText).not.toContain("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(recordsText).not.toContain("CALL_BUDGET_EXHAUSTED");
    expect(answer!.condition_marks).not.toContain("ENVELOPE_EXHAUSTED");
    // The same disclosure as T1, to the byte: GLM and Qwen busy, the other DeepInfra members behind an unavailable gate.
    const revised = records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE" && record.reason.includes("RUN_PANEL_REVISED:"));
    expect(revised?.reason, `condition mark records: ${recordsText}`).toBe("RUN_PANEL_REVISED:preview:fixture-a=PROVIDER_BUSY,"
      + "preview:deepseek-v4-1-flash=PROVIDER_GATE_UNAVAILABLE,preview:mimo-v2-6-pro=PROVIDER_GATE_UNAVAILABLE,preview:qwen-3-8-flash=PROVIDER_BUSY");
    const calls = await modelCalls(debate.runId);
    const okActors = (key: string) => calls.filter((call) => call.call_site_key === key && call.outcome === "OK").map((call) => call.actor_ref);
    expect(okActors(WRITER_KEY)).toEqual([HAIKU_REF]);
    expect(okActors(CHECKER_KEY)).toEqual([HAIKU_REF]);
    expect(composed.holdWaits).toEqual([]);
  });

  /**
   * Spec (d): "Serve must accept a gap in the middle of the root set. Prove it." The incident's GLM is the LAST root, so
   * T2 drops root 4; here GLM sits in the middle of the position order and its root 2 is the gap. Everything around it
   * is argued in full: the other four roots, their second-round legs, the cross-root exchanges among them, and the
   * answer is served from the four.
   */
  it("a gap in the middle of the root set: GLM busy as root 2, the other four roots argued and the answer served", async () => {
    const pin: RotatedRoles = Object.freeze({ ...INCIDENT_PIN, eligibleModelIds: Object.freeze([DEEPSEEK, MIMO, GLM, QWEN, HAIKU]) });
    const debate = await admittedRun("gap", { panelRefs: FIVE_MAKER_REFS, pin });
    const gates = await startGates({}, { unbilled: [GLM] });
    const composed = previewRunner(gates, "resend", RUN_RESILIENCE);
    const result = await completedRun(composed, debate, gates);

    const { answer, story, workItem } = await servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(story).toMatchObject({ outcome: "READY", failureCode: null });
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    expect(composed.holdWaits).toEqual([]);
    const calls = await modelCalls(debate.runId);
    const ok = (key: string) => calls.filter((call) => call.call_site_key === key && call.outcome === "OK");
    // Roots 0, 1, 3 and 4 written; root 2 (GLM's) never asked.
    for (const key of ["JUDGE", "JUDGE:root:secondary", "JUDGE:root:3", "JUDGE:root:4"]) expect(ok(key), key).toHaveLength(1);
    expect(calls.filter((call) => call.call_site_key === "JUDGE:root:2")).toEqual([]);
    // Nothing planned beneath the gap. The legs GLM's seat would author elsewhere (seat (root + round) % 5 = 2: root
    // 0's round 2, root 1's round 1 and so its round 2) take the existing EXPANSION_HALTED path (spec (d)) without a
    // call; every other leg is argued, depth 2 included.
    const argued = (root: number, round: number) => calls.some((call) => call.outcome === "OK"
      && new RegExp(`^JUDGE:(?:defender|critic):root${String(root)}:r${String(round)}:`, "u").test(call.call_site_key));
    for (const [root, round] of [[0, 1], [3, 1], [3, 2], [4, 1], [4, 2]] as const) {
      expect(argued(root, round), `root ${String(root)} round ${String(round)}`).toBe(true);
    }
    expect(calls.filter((call) => /^JUDGE:(?:defender|critic):root2:/u.test(call.call_site_key))).toEqual([]);
    expect(gates.requests.filter((request) => request.model === GLM && request.kind !== "PROBE")).toHaveLength(2);
    expect(answer!.condition_marks).toContain("UNAUTHORED-BRANCH-HALTED");
    // The cross-root exchanges among the four, none to or from the gap.
    expect(calls.filter((call) => /^JUDGE:cross-root:(?:2->|\d+->2$)/u.test(call.call_site_key))).toEqual([]);
    expect(ok("JUDGE:cross-root:0->1")).toHaveLength(1);
    expect(ok("JUDGE:cross-root:4->3")).toHaveLength(1);
    const records = answer!.condition_mark_records;
    const recordsText = JSON.stringify(records.map((record) => [record.mark, record.reason]));
    expect(records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE")?.reason, recordsText).toMatch(GLM_SAT_OUT);
    // Four positions authored, so the answer names the unserved ones (no single-lineage step-down).
    expect(answer!.condition_marks).toContain("UNSERVED-MAKER-POSITION");
    expect(answer!.condition_marks).not.toContain("SINGLE-LINEAGE");
  });

  it("a busy opener: GLM opens and is refused; the next member opens root 0 at once, and GLM's seat becomes the dropped root", async () => {
    const pin: RotatedRoles = Object.freeze({
      ...INCIDENT_PIN, opener: rotationPick(SEALED_WRITER_REF), eligibleModelIds: Object.freeze([GLM, DEEPSEEK, MIMO, QWEN, HAIKU])
    });
    const debate = await admittedRun("opener", { panelRefs: FIVE_MAKER_REFS, pin });
    const gates = await startGates({}, { unbilled: [GLM] });
    const composed = previewRunner(gates, "resend", RUN_RESILIENCE);
    const result = await completedRun(composed, debate, gates);

    // GLM's one call is root 0 itself (POST + its one resend); no ten-minute hold before DeepSeek opens.
    expect(gates.requests.filter((request) => request.model === GLM && request.kind !== "PROBE")
      .map((request) => [request.kind, request.answer])).toEqual([["JUDGE", "UNBILLED"], ["JUDGE", "UNBILLED"]]);
    expect(composed.callSleeps).toEqual([UNBILLED_RESEND_MS]);
    expect(composed.holdWaits).toEqual([]);
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => call.call_site_key === "JUDGE").map((call) => [call.actor_ref, call.outcome])).toEqual([
      [SEALED_WRITER_REF, "REFUSED"], [SEALED_WRITER_REF, "REFUSED"], ["preview:deepseek-v4-1-flash", "OK"]
    ]);
    // The seats traded roots: root 1 (where GLM's seat went) is the gap; MiMo, Qwen and Haiku keep roots 2-4.
    expect(calls.filter((call) => call.call_site_key === "JUDGE:root:secondary")).toEqual([]);
    for (const key of ["JUDGE:root:2", "JUDGE:root:3", "JUDGE:root:4"]) {
      expect(calls.filter((call) => call.call_site_key === key && call.outcome === "OK"), key).toHaveLength(1);
    }
    const { answer, workItem } = await servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    expect(answer!.condition_mark_records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE")?.reason).toMatch(GLM_SAT_OUT);
  });
  /**
   * Review amendment R-d (orchestrator, 2026-10-12): only a VENDOR's gate-proven unbilled refusal makes a model sit
   * out. The gate's own unbilled refusals — its slots were full (CONCURRENCY_LIMIT_REACHED), or it never reached the
   * vendor (PROVIDER_NOT_REACHED) — are still REFUSED rows, never counted, with the one 60-second resend; but the
   * model is not busy, so it never sits out and the runner keeps today's ten-minute hold and final retry.
   */
  it.each(["CONCURRENCY_LIMIT_REACHED", "PROVIDER_NOT_REACHED"] as const)(
    "R-d: GLM's own root refused twice by the gate itself (%s): no sit-out, the hold happens, the final retry is sent and authors it",
    async (code) => {
      const debate = await admittedRun(`gate-own-${code}`, { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
      // GLM's first JUDGE request is its own root (root 4; its earlier asks are panel seats, PANEL): the call and its
      // one resend are refused by the gate itself; everything after is answered.
      let refused = 0;
      const gates = await startGates({}, { unbilled: [] }, (request) => {
        if (request.model !== GLM || request.kind !== "JUDGE" || refused >= 2) return null;
        refused += 1;
        return { gateRefuses: code };
      });
      const composed = previewRunner(gates, "resend", RUN_RESILIENCE);
      const result = await completedRun(composed, debate, gates);

      expect(gates.requests.filter((request) => request.model === GLM && request.kind === "JUDGE").slice(0, 3)
        .map((request) => request.answer)).toEqual(["GATE_REFUSED", "GATE_REFUSED", "OK"]);
      // The one 60-second resend inside the call, then the runner's ten-minute hold, then its final retry.
      expect(composed.callSleeps).toEqual([UNBILLED_RESEND_MS]);
      expect(composed.holdWaits).toEqual([DEVELOPMENT_RUN_DEATH_POLICY.cooldown_ms]);
      const calls = await modelCalls(debate.runId);
      expect(calls.filter((call) => call.call_site_key === GLM_ROOT_KEY).map((call) => [call.actor_ref, call.outcome]))
        .toEqual([[SEALED_WRITER_REF, "REFUSED"], [SEALED_WRITER_REF, "REFUSED"], [SEALED_WRITER_REF, "OK"]]);
      // GLM never sat out: it keeps writing (the pinned writer) and nothing discloses a run-time panel revision.
      expect(calls.filter((call) => call.call_site_key === WRITER_KEY && call.outcome === "OK").map((call) => call.actor_ref))
        .toEqual([SEALED_WRITER_REF]);
      const { answer, workItem } = await servedAnswer(debate, result.answerId);
      expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
      expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
      expect(JSON.stringify(answer!.condition_mark_records)).not.toContain("RUN_PANEL_REVISED");
      expect(gates.halt.unbilledReleases).toBe(0);
    }
  );

  /**
   * Review 2026-10-12, test gap (e): the merged CRITIQUE-UNAVAILABLE record (R-b). With nobody sitting out, its reason
   * is today's to the byte — the claim-time revision alone; with a member that sat out too, the two join with "|".
   * MiMo is absent at claim (its probe and the probe's one resend refused unbilled), so the panel shrinks to four.
   */
  it("nobody sat out: the CRITIQUE-UNAVAILABLE reason is the claim-time revision alone, byte for byte", async () => {
    const debate = await admittedRun("claim-only", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({ [MIMO]: ["UNBILLED", "UNBILLED"] }, { unbilled: [] });
    const composed = previewRunner(gates, "resend", RUN_RESILIENCE);
    const result = await completedRun(composed, debate, gates);
    const { answer } = await servedAnswer(debate, result.answerId);
    const critique = answer!.condition_mark_records.filter((record) => record.mark === "CRITIQUE-UNAVAILABLE");
    expect(critique.map((record) => record.reason)).toEqual(["CLAIM_PANEL_REVISED:preview:mimo-v2-6-pro=PROVIDER_PROBE_UNBILLED_REFUSAL"]);
    expect(composed.holdWaits).toEqual([]);
  });

  it("a claim-time revision and a member that sat out: one record, CLAIM_PANEL_REVISED|RUN_PANEL_REVISED", async () => {
    const debate = await admittedRun("claim-and-run", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({ [MIMO]: ["UNBILLED", "UNBILLED"] }, { unbilled: [GLM] });
    const composed = previewRunner(gates, "resend", RUN_RESILIENCE);
    const result = await completedRun(composed, debate, gates);
    const { answer } = await servedAnswer(debate, result.answerId);
    const critique = answer!.condition_mark_records.filter((record) => record.mark === "CRITIQUE-UNAVAILABLE");
    expect(critique.map((record) => record.reason)).toEqual([
      "CLAIM_PANEL_REVISED:preview:mimo-v2-6-pro=PROVIDER_PROBE_UNBILLED_REFUSAL|RUN_PANEL_REVISED:preview:fixture-a=PROVIDER_BUSY"
    ]);
    expect(answer!.condition_marks.filter((mark) => mark === "CRITIQUE-UNAVAILABLE")).toHaveLength(1);
  });

  /**
   * Review 2026-10-12, test gap (c): the runner's re-claim check reads each maker's own attempts on the preview
   * (fix (b), `byActor`). Before the run is claimed, root 2's site (Qwen's, key JUDGE:root:2) already holds the judge
   * contract's whole allowance — the sealed bound plus the final retry — in FAILED rows, but written by two OTHER
   * makers, two each, as fallback hops would leave them. Read per site (hosted and local) that site is spent at claim;
   * read per maker nobody is, so Qwen is asked and authors root 2.
   */
  it("fix (b): the re-claim check counts per maker, so other makers' FAILED rows at a root's site never spend it", async () => {
    const debate = await admittedRun("reclaim-per-maker", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const allowance = POLICY.bounds.JUDGE.maxAttempts + DEVELOPMENT_RUN_DEATH_POLICY.final_retry_attempts;
    const others = ["preview:mimo-v2-6-pro", HAIKU_REF];
    const ledger = new LedgerRepository(database.pool);
    for (let index = 0; index < allowance; index += 1) {
      await ledger.append({
        runId: debate.runId, attemptId: randomUUID(), actionKind: "MODEL_CALL", callSiteKey: "JUDGE:root:2",
        subjectItemId: debate.workItemId, stanceAtAction: "UNASSIGNED", outcome: "FAILED", actorRef: others[index % 2]!,
        inputHash: "input:preview-reclaim-per-maker", contractHash: fixtureSettings().judgeContractHash, rawArtifactRef: null,
        startedAt: new Date(), finishedAt: new Date()
      });
    }
    // The site holds the whole allowance across makers, and less than it for any one maker.
    expect(await ledger.findExhaustedModelAttempt({
      runId: debate.runId, workItemId: debate.workItemId, contractHash: fixtureSettings().judgeContractHash, maxAttempts: allowance
    })).toMatchObject({ callSiteKey: "JUDGE:root:2", outcome: "FAILED" });
    const gates = await startGates({}, { unbilled: [] });
    const composed = previewRunner(gates, "resend", RUN_RESILIENCE);
    const result = await completedRun(composed, debate, gates);
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => call.call_site_key === "JUDGE:root:2" && call.outcome === "OK").map((call) => call.actor_ref))
      .toEqual(["preview:qwen-3-8-flash"]);
    const { workItem } = await servedAnswer(debate, result.answerId);
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    expect(composed.holdWaits).toEqual([]);
  });
});
