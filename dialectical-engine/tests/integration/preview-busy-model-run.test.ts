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
// JSON mode (spec "Check the JSON-mode needs"): GLM is the only reviewed row with jsonObject true
// (packages/providers/src/preview-models.ts:130-131). The only step that asks for JSON mode is the storyteller
// (packages/story/src/writer.ts:262, preferredResponseFormat "json_object"). The gateway adds response_format only on
// the story lane AND for a gateway built with supportsJsonObjectResponse (packages/providers/src/index.ts:1615), which
// providerTargetGatewayControls sets only for a jsonObject row (index.ts:341); the guarded fetch refuses
// response_format on any other row (packages/providers/src/preview-test.ts:341-346, deepInfraBodyAccepted). So
// without GLM every story call goes out WITHOUT JSON mode, and the story's reader is a strict JSON.parse
// (packages/story/src/validate.ts:262-270),
// with the storyteller's one repair turn (story bound maxAttempts 2) as the only fallback. The doubles below answer
// bare JSON, so this file proves the plumbing, not that a real model answers bare JSON without JSON mode.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createInitialBatteryRows, WorkItemRepository } from "@debateai/battery";
import { RunRepository, insertRunRoleRotation, migrate, type DiscoveredPanelMember } from "@debateai/db";
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
  previewModelRow,
  previewProbeControls,
  previewRunnerPolicy,
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
import { pickRotatedRoles, roleRotationSeed, rotationPinFields, type RotatedRoles } from "@debateai/scorecard";
import { ServeRepository } from "@debateai/serve";
import {
  StoryRepository,
  StoryWriter,
  loadStoryPack,
  resolveStoryPackDir
} from "@debateai/story";
import { DEVELOPMENT_ORGAN_COST_BOUNDS, DEVELOPMENT_RUN_DEATH_POLICY } from "../../apps/runner/src/dev-deployment-register.js";
import { createRunnerProviderTopology } from "../../apps/runner/src/provider-topology.js";
import { startPreviewGateStubs } from "../support/preview-gate-stubs.js";
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
 * Both preview gates over real unix sockets (tests/support/preview-gate-stubs.ts), speaking the gate's RPC protocol.
 * Every request that reaches a gate is recorded. A GLM request is answered as a billed vendor 500 (and fails the test
 * by the record); a probe takes the next step of its model's script (OK once spent); every other request is answered
 * by its contract.
 */
async function startGates(probeScripts: Readonly<Record<string, readonly ("OK" | "UNBILLED")[]>>) {
  const stubs = await startPreviewGateStubs({ storyDefaultShape: PACK.defaultShape, probeScripts, refuseModels: [GLM] });
  stubClosers.push(stubs.close);
  const deepinfra = createPreviewBudgetRpcPort(PREVIEW, stubs.sockets.deepinfra);
  const anthropic = createPreviewBudgetRpcPort(PREVIEW, stubs.sockets.anthropic);
  return { requests: stubs.requests, guardedFetch: createPreviewGuardedFetch({ deepinfra, anthropic }) };
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

/** apps/runner/src/main.ts's preview runner, over these gates; the waits are recorded, never slept. */
function previewRunner(gates: Awaited<ReturnType<typeof startGates>>, claim: ClaimComposition) {
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

/** A depth-2 run on the four-member panel, with the rotation pin admission writes (counts empty: the first rotated debate). */
async function admittedRun(label: string): Promise<{ runId: string; workItemId: string; askerId: string; rotated: RotatedRoles }> {
  const asOf = "2026-10-11T19:30:00.000Z";
  // A plain label, not a "should" question: the fixture composition map rates only the `unknown` claim type.
  const question = `preview-busy-model-${label}-${randomUUID()}`;
  const askerId = `asker:${question}`;
  const panel = PANEL_REFS.map((ref) => panelMember(ref, asOf));
  const rotated = pickRotatedRoles({ panel, counts: {}, seed: roleRotationSeed({ as_of: asOf, question_line: question }) });
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

    // JSON mode (header comment): no request for a row without jsonObject ever carried response_format.
    expect(gates.requests.filter((request) => Object.hasOwn(request.body, "response_format"))).toEqual([]);
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
