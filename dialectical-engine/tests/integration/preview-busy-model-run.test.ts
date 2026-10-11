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
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createInitialBatteryRows, WorkItemRepository } from "@debateai/battery";
import { RunRepository, insertRunRoleRotation, migrate, type DiscoveredPanelMember } from "@debateai/db";
import { argumentLanguageDirective } from "@debateai/kernel";
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
  STORY_CHECKER_CONTRACT_ID,
  STORYTELLER_CONTRACT_ID,
  StoryRepository,
  StoryWriter,
  loadStoryPack,
  resolveStoryPackDir
} from "@debateai/story";
import { DEVELOPMENT_ORGAN_COST_BOUNDS, DEVELOPMENT_RUN_DEATH_POLICY } from "../../apps/runner/src/dev-deployment-register.js";
import { createRunnerProviderTopology } from "../../apps/runner/src/provider-topology.js";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { reviewArtifact, withRequestDerivedBearings } from "../support/reviewBearings.js";
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
const servers: Server[] = [];
const directories: string[] = [];

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
afterAll(async () => database?.stop());

/* ------------------------------------------------------------------ the doubles' answers */

const judgement = (statement: string): string => JSON.stringify({
  statement, way_of_knowing: "REASONING", locator: null, restatement_text: statement, restatement_status: "PASS",
  value_laden: false, claim_type: "unknown",
  steelman: { summary: statement, fidelity: 0.72 },
  critic: { summary: "Plausible counter.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.72, relevance: 0.72 }, context: { fit: 0.72, ambiguityFlags: [] },
  fallacy: { severity: 0.28, fatalFlags: [] }
});
/** A panel member's assessment at fidelity 0 (tau 0): it never displaces an author's voice (tests/integration/database.test.ts). */
const PANEL_ASSESSMENT = JSON.stringify({
  steelman: { summary: "Panel member assessment.", fidelity: 0 },
  critic: { summary: "Panel member counter.", counterargumentStrength: 1, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0, relevance: 0 }, context: { fit: 0, ambiguityFlags: [] }, fallacy: { severity: 1, fatalFlags: [] }
});
const COMPOSITION = JSON.stringify({ segments: [
  { segment_id: "segment:verdict", text: "Congestion pricing on central roads is worth trying.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
  { segment_id: "segment:research", text: "Check an independent source.", node_refs: [], served_number_refs: [] }
] });
const EVALUATOR_SATISFIED = JSON.stringify({ satisfied: true, objection: null, criteria: {
  fairness_to_losers: true, statement_label_agreement: true, no_overstatement: true, restatement: true, citation_tracing: true
} });
const STORY_CHECKER_SATISFIED = JSON.stringify({ satisfied: true, objection: null, criteria: {
  faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
  citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
} });
/** A story with one path per position of a four-debater debate (P1-P4: the story's models never see a node id). */
const fourPositionStory = (): string => {
  const paragraph = (text: string) => ({ text, node_refs: ["P1"] });
  return JSON.stringify({
    shape_id: PACK.defaultShape,
    short: {
      headline: "Four positions were argued, and they held up.",
      summary: "You asked whether to price congestion; four answers were weighed against their strongest objections.",
      confidence: "Fairly sure, until a sourced objection turns up.",
      paths: [1, 2, 3, 4].map((index) => ({
        position_ref: `P${String(index)}`, fate: "HELD_UP", line: "This position held up.", node_refs: [`P${String(index)}`]
      })),
      change: paragraph("A stronger, sourced objection would change the answer.")
    },
    why: { reasons: [paragraph("The first position held up against its strongest objection.")] },
    long: { sections: ["What you are deciding", "The verdict", "What would change it"].map((title) => ({
      title, paragraphs: [paragraph(`${title}, in the debate's own terms.`)]
    })) },
    reviewer_note: null
  });
};

/* ------------------------------------------------------------------ the gates */

type RequestKind = "PROBE" | "STORYTELLER" | "STORY_CHECKER" | "PANEL" | "REVIEW" | "JUDGE" | "EVALUATOR" | "COMPOSE";
type GateRequest = Readonly<{ provider: "deepinfra" | "anthropic"; model: string; kind: RequestKind | "UNKNOWN"; body: Readonly<Record<string, unknown>> }>;

/** The argument-language directive names the machine keys below, so it is removed before routing (as database.test.ts). */
const LANGUAGE_DIRECTIVE = new RegExp(argumentLanguageDirective("\u0000")
  .replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\u0000", "[^.]+?"), "gu");
const PROBE_QUESTION = "Reply exactly: OK";

/**
 * The OpenAI-shaped body the frame reader reads: an Anthropic Messages body carries the system text beside its
 * turns, so it is put back in front of them (the adapter only lifted it out).
 */
function chatBody(provider: "deepinfra" | "anthropic", body: Readonly<Record<string, unknown>>): string {
  if (provider === "deepinfra") return JSON.stringify(body);
  const turns = Array.isArray(body.messages) ? body.messages : [];
  return JSON.stringify({ messages: typeof body.system === "string" ? [{ role: "system", content: body.system }, ...turns] : turns });
}

/** Which contract a request is for: the probe by its question, the story by its contract id, the debate by structural keys. */
function classify(chat: string): RequestKind | "UNKNOWN" {
  const messages = wirePacket(chat).messages;
  if (messages.length === 1 && messages[0]!.role === "user" && messages[0]!.content.includes(PROBE_QUESTION)) return "PROBE";
  const contractId = readFramedMaterial(wirePacket(chat)).contractId;
  if (contractId === STORYTELLER_CONTRACT_ID) return "STORYTELLER";
  if (contractId === STORY_CHECKER_CONTRACT_ID) return "STORY_CHECKER";
  const instruction = (messages[0]?.content ?? "").replace(LANGUAGE_DIRECTIVE, "");
  // The panel's assessment is the judge's schema WITHOUT restatement_text (tests/unit/t03-judge-panel.test.ts).
  if (instruction.includes("fatalFlags") && !instruction.includes("restatement_text")) return "PANEL";
  if (instruction.includes("edge_bearings")) return "REVIEW";
  if (instruction.includes("restatement_text")) return "JUDGE";
  if (instruction.includes("fairness_to_losers")) return "EVALUATOR";
  if (instruction.includes("served_number_refs")) return "COMPOSE";
  return "UNKNOWN";
}

/** The vendor's own reply shape: an OpenAI chat completion (DeepInfra) or a Messages reply (Anthropic), with usage. */
function vendorReply(provider: "deepinfra" | "anthropic", model: string, content: string, id: string): string {
  return provider === "anthropic"
    ? JSON.stringify({ id: `msg_${id}`, type: "message", role: "assistant", model, content: [{ type: "text", text: content }],
      stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } })
    : JSON.stringify({ id, model, choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50 } });
}

/**
 * Both preview gates over real unix sockets, speaking the gate's RPC protocol. Every request that reaches a gate is
 * recorded. A GLM request is answered as a billed vendor 500 (and fails the test by the record); a probe takes the
 * next step of its model's script (OK once spent); every other request is answered by its contract.
 */
async function startGates(probeScripts: Readonly<Record<string, readonly ("OK" | "UNBILLED")[]>>) {
  const requests: GateRequest[] = [];
  const queues = new Map<string, ("OK" | "UNBILLED")[]>(Object.entries(probeScripts).map(([model, steps]) => [model, [...steps]]));
  let served = 0;
  const answerFor = (kind: RequestKind | "UNKNOWN", chat: string): string | null => {
    served += 1;
    switch (kind) {
      case "PROBE": return "OK";
      case "STORYTELLER": return fourPositionStory();
      case "STORY_CHECKER": return STORY_CHECKER_SATISFIED;
      case "PANEL": return PANEL_ASSESSMENT;
      case "REVIEW": return withRequestDerivedBearings(reviewArtifact("agree", [`Review ${String(served)} agrees.`]), chat);
      case "JUDGE": return judgement(`Busy-model debate point ${String(served)}.`);
      case "EVALUATOR": return EVALUATOR_SATISFIED;
      case "COMPOSE": return COMPOSITION;
      default: return null;
    }
  };
  const socketFor = async (provider: "deepinfra" | "anthropic"): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "pbr-"));
    directories.push(directory);
    const socket = join(directory, "gate.sock");
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const execution = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { requestBody: string };
        const body = JSON.parse(execution.requestBody) as Record<string, unknown>;
        const model = String(body.model);
        const chat = chatBody(provider, body);
        let kind: RequestKind | "UNKNOWN";
        try { kind = classify(chat); } catch { kind = "UNKNOWN"; }
        requests.push(Object.freeze({ provider, model, kind, body }));
        const reply = (status: number, vendorBody: string) => response.writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ status, body: vendorBody }));
        if (model === GLM) { reply(500, JSON.stringify({ error: { message: "GLM must never be called in this test" } })); return; }
        if (kind === "PROBE" && queues.get(model)?.shift() === "UNBILLED") {
          response.writeHead(409, { "content-type": "application/json" }).end(JSON.stringify({ error: "PROVIDER_REFUSED_UNBILLED" }));
          return;
        }
        const content = answerFor(kind, chat);
        if (content === null) { reply(500, JSON.stringify({ error: { message: "unexpected test request" } })); return; }
        reply(200, vendorReply(provider, model, content, `busy-model-${String(served)}`));
      });
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(socket, done));
    return socket;
  };
  const deepinfra = createPreviewBudgetRpcPort(PREVIEW, await socketFor("deepinfra"));
  const anthropic = createPreviewBudgetRpcPort(PREVIEW, await socketFor("anthropic"));
  return { requests, guardedFetch: createPreviewGuardedFetch({ deepinfra, anthropic }) };
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
