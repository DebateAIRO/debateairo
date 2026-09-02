import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { persistTerminalRun } from "../support/settledRun.js";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import {
  BATTERY_EXECUTION_CONTRACTS,
  createInitialBatteryRows,
  readTerminalRecordedFacts,
  SplitStageRunner,
  WorkItemRepository
} from "@debateai/battery";
import { LedgerRepository } from "@debateai/ledger";
import { BudgetRepository } from "@debateai/budget";
import { ProviderProbeRepository, RunRepository, migrate } from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { JudgementRepository } from "@debateai/judgement";
import {
  CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY,
  assertBootstrapEquality,
  loadBootstrapRegister,
  persistBootstrapRegister,
  readClaimTypeCompositionMap
} from "@debateai/register";
import {
  createTestAskAdmissionPoolFacades,startTestDatabase,type TestDatabase
} from "../support/testDatabase.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import {
  createPostgresProviderGateway,
  createPostgresReviewCatchUpDependencies,
  projectJudgedStanding,
  reviewCatchUpCallSiteKey,
  WalkingSkeletonRunner,
  type HoldProgressEvent,
  type WalkingSkeletonSettings
} from "@debateai/runner";
import { evaluate } from "@debateai/propagation";
import { agg, σ } from "@debateai/published-arithmetic";
import { recordNodeReviewAlone } from "../support/unsafeReviewWrites.js";
import {
  ServeRepository,
  type ConditionMarkRecord,
  type PreservedConditionMarkRecord,
  type ServeGateResult
} from "@debateai/serve";
import { AnswerSchema } from "@debateai/contract";
import type { ServedRootRuleHistory } from "@debateai/kernel";
import { LivenessRepository } from "@debateai/liveness";
import {
  buildApi,
  PostgresAskApplication,
  type AskApplication
} from "@debateai/api";
import { HOME_PAGE_SIZE } from "../../apps/ui/lib/serverApi.js";
import { projectCanvasCensus } from "../../apps/ui/lib/v3/census.js";
import {
  TEST_APP_ORIGIN,testHttpIdentity,testSessionApplication,testSessionHeaders,
  type TestHttpIdentity
} from "../support/httpSession.js";

let database: TestDatabase;
const batteryRows = createInitialBatteryRows({ settlementWatchHandle: "settlement-watch:test-layer" });

async function persistHttpIdentity(identity:TestHttpIdentity,label:string):Promise<void> {
  await database.pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,$3,$4,$5,$6,'active',now(),now())
  `,[
    identity.authenticated.userId,
    createHash("sha256").update(`database-http-identity:${label}:${identity.authenticated.userId}`).digest(),
    "integration-password-not-login-capable",
    `database-http-${label}-${identity.authenticated.userId}`,
    randomUUID(),identity.authenticated.ownerRef
  ]);
}

/**
 * T9: the EVALUATOR's wire shape. One EVALUATOR call replaced BOTH retired
 * serve-path organs — per-segment CONFORMANCE and post-compose R9 — so the two
 * conformance responses plus the r9 response that every served-run fixture used
 * to script are now ONE satisfied verdict, and a satisfied evaluator ends the
 * loop in round 1. Fixture provisioning only: no fixture's own subject
 * assertions change.
 */
const evaluatorSatisfied = (): string => JSON.stringify({
  satisfied: true,
  objection: null,
  criteria: {
    fairness_to_losers: true,
    statement_label_agreement: true,
    no_overstatement: true,
    restatement: true,
    citation_tracing: true
  }
});

const runnerSettings = (): WalkingSkeletonSettings => ({
  workerId: "runner:test-layer", claimMs: 10_000, claimMarginMs: 1_000,
  judgeBound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
  composerBound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
  conformanceBound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
  providerRef: "provider:test-layer", maker: "test-layer", judgeContractHash: "contract:judge:test-layer",
  composerContractHash: "contract:composer:test-layer", conformanceContractHash: "contract:conformance:test-layer",
  propagationContractHash: "contract:propagation:test-layer", serveContractHash: "contract:serve:test-layer",
  maxRecompose: 2, factBundleVersion: 1, judgementNumberKind: "base-probability",
  judgementProducer: "judgement:test-layer", propagationNumberKind: "propagated-probability",
  propagationProducer: "propagation:test-layer",
  compositionRow: {
    rowKey: CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY, registerVersion: 1, sourceRef: "test-layer:S04",
    value: { kind: "CLAIM_TYPE_COMPOSITION_MAP", entries: {
      unknown: {
        branch: "EVIDENCE_AWARE", clarityDecayPerAmbiguity: 0.1,
        terms: [{ metric: "steelman_fidelity", coefficient: 1 }], caps: [],
        uncertaintyLadder: [{ atMost: 1, label: "TEST_LAYER" }]
      }
    } }
  },
  servePolicy: {
    compositionBudgets: {
      low: { tier: "low", bound: 10_000, registerRowKey: "compositionBundleBudget.low", registerVersion: 1, sourceRef: "test-layer:DR-078" },
      medium: { tier: "medium", bound: 20_000, registerRowKey: "compositionBundleBudget.medium", registerVersion: 1, sourceRef: "test-layer:DR-078" },
      high: { tier: "high", bound: 30_000, registerRowKey: "compositionBundleBudget.high", registerVersion: 1, sourceRef: "test-layer:DR-078" }
    },
    candidateConfidenceBand: "TEST_TOP_BAND",
    bandCeiling: {
      rowKey: "wayOfKnowingCeiling",
      registerVersion: 1,
      sourceRef: "test-layer:DR-086",
      value: {
        bandOrder: ["TEST_CAPPED_BAND", "TEST_TOP_BAND"],
        ceilingLabels: ["TEST_DEFAULT_CEILING", "TEST_LOOKED_UP_CEILING"],
        defaultCeiling: {
          label: "TEST_DEFAULT_CEILING", ceilingBand: "TEST_TOP_BAND",
          liftPath: "test-layer:retain-band"
        },
        cuts: [{
          minimumShares: { LOOKED_UP: 0.5 },
          label: "TEST_LOOKED_UP_CEILING", ceilingBand: "TEST_CAPPED_BAND",
          liftPath: "test-layer:improve-way-of-knowing"
        }]
      }
    }
  },
  judgementPolicy: {
    selectionRule: {
      kind: "MAXIMIZE_WEIGHTED_TAU", rowKey: "test-layer:selection-rule",
      registerVersion: 1, sourceRef: "test-layer:DR-077"
    },
    earnedWeight: 1,
    judgeWeightVersion: "test-layer:weight-v1",
    reducerVersion: "test-layer:reducer-v1"
  },
  // J12 coherence consequence (J5/J10a class): every M>=2 fixture below now needs the
  // sealed panel inputs, because an unsealed multi-maker run stops loudly. Provisioning
  // only — no fixture's own subject assertions change. The band map is stated over THIS
  // fixture's own band vocabulary (servePolicy.bandCeiling above), not the deployment's.
  panelPolicy: {
    registerVersion: 1,
    dispersionScale: 1,
    repeatedFamilyMultiplier: 0.5,
    disagreementThreshold: 0.25,
    oneStepDown: { TEST_CAPPED_BAND: "TEST_CAPPED_BAND", TEST_TOP_BAND: "TEST_CAPPED_BAND" },
    providerFamilies: [
      { familyRef: "test-layer:family:primary", providerRefs: ["provider:test-layer"] },
      { familyRef: "test-layer:family:secondary", providerRefs: ["provider:test-layer:secondary"] }
    ],
    unmappedReason: "PROVIDER_FAMILY_UNMAPPED",
    sourceRefs: {
      dispersionScale: "test-layer:J1",
      repeatedFamilyMultiplier: "test-layer:J1",
      disagreementThreshold: "test-layer:J1",
      downgradeBands: "test-layer:J1",
      providerFamilyMap: "test-layer:J1"
    }
  },
  // T11 coherence consequence: every served answer now carries a code-derived
  // three-state label, so every fixture that reaches a served answer needs the
  // sealed verdict-label family. Provisioning only — no fixture's own subject
  // assertions change. These are the fixture's controls, not the deployment's.
  verdictLabelPolicy: {
    registerVersion: 1,
    gamma: 0.05,
    highCut: 0.7,
    lowCut: 0.35,
    disagreementThreshold: 0.25,
    sourceRefs: {
      verdictMarginGamma: "test-layer:goal-v4:80-96",
      verdictHighCut: "test-layer:goal-v4:80-96",
      verdictLowCut: "test-layer:goal-v4:80-96",
      disagreementThreshold: "test-layer:J1",
      disagreementQuantity: "test-layer:goal-v4:80-96"
    }
  },
  // T9 coherence consequence: every served statement now comes out of the
  // synthesizer/evaluator loop, so every fixture that reaches a served answer
  // needs the sealed synthesis-role family. Both refs name THIS fixture's one
  // configured provider — the fixture has a single maker, so the loop's two
  // roles are held by the same identity, which stays lawful (goal 84-85) and is
  // exactly the case T16's identical-refs warning describes. Provisioning only:
  // no fixture's own subject assertions change.
  synthesisRolePolicy: {
    registerVersion: 1,
    synthesizerRoleRef: "provider:test-layer",
    evaluatorRoleRef: "provider:test-layer",
    evaluatorLoopMaxRounds: 3,
    identicalRoleRefs: true,
    sourceRefs: {
      synthesizerRoleRef: "test-layer:J8",
      evaluatorRoleRef: "test-layer:J8",
      evaluatorLoopMaxRounds: "test-layer:goal-v4:80-96"
    }
  },
  resolveTerminalActivations: async ({ waitingRows }) => waitingRows.map((batteryRowId) => ({
    batteryRowId,
    state: "INACTIVE" as const,
    predicateInputs: {
      kind: "PRESENT", values: { fixture: "S07", predicateResult: false, terminalEvaluation: true }
    },
    skipEvidence: {
      kind: "PRESENT", evidenceType: "TEST_LAYER_TERMINAL_PREDICATE_RESULT", result: "FALSE_AT_COMPLETION"
    }
  }))
});

async function createRun(
  questionLine: string,
  maxModelAttempts = 10,
  agentCount = 1,
  depth = 1,
  askerId = `asker:${questionLine}`
): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine, principal: { kind: "legacy", legacyAskerId: askerId },
    sessionId: `session:${questionLine}`, callerScope: "ASKER",
    asOf: new Date("2026-08-07T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker-declaration:${questionLine}`, compositionBudgetTier: "low",
    depthParams: { depth }, discoveredPanel: fixtureDiscoveredPanel(agentCount), strangerSampleRate: 1,
    envelopeBasis: fixtureStructuralCeiling(maxModelAttempts, agentCount, Math.min(depth, 5)),
    registerVersion: 1, batteryVersion: "s00", batteryRows
  });
}

function judgementDouble(statement: string, fidelity = 0.72): string {
  return JSON.stringify({
    statement,
    way_of_knowing: "REASONING",
    locator: null,
    restatement_text: statement,
    restatement_status: "PASS",
    value_laden: false,
    claim_type: "unknown",
    steelman: { summary: statement, fidelity },
    critic: { summary: "Plausible counter.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: 0.72, relevance: 0.72 },
    context: { fit: 0.72, ambiguityFlags: [] },
    fallacy: { severity: 0.28, fatalFlags: [] }
  });
}

/**
 * S2-3 / T4: a judge artifact that CLAIMS a lookup it cannot pin. Normalization
 * must resolve it to REASONING and disclose the downgrade.
 */
function unpinnedLookupJudgementDouble(statement: string): string {
  return JSON.stringify({
    ...JSON.parse(judgementDouble(statement)),
    way_of_knowing: "LOOKED_UP",
    locator: null
  });
}

/**
 * T5 / S3-1 — the review artifact now also carries one bearing per edge the
 * reviewed node sources, and the count is pinned to the edges the CALL actually
 * offered. A scripted string cannot know that count, so a fixture declares a
 * POLICY here and `startProviderDouble` turns it into an array whose cardinality
 * and per-edge polarity come from the real request.
 *
 * The default is `cannot-assess`: this double does not assess bearings, and it
 * says so in the goal's own vocabulary rather than claiming to have measured
 * zero edges. Those edges stay UNKNOWN, contribute nothing to propagation, and
 * every fixture below keeps the numbers it had before T5. A fixture that wants
 * the graph to go numerically live passes explicit per-polarity bearings.
 */
type ReviewBearingPolicy = "cannot-assess" | { readonly support: number; readonly attack: number };

function reviewDouble(
  outcome: "agree" | "dispute" | "cannot-assess",
  reason: string,
  bearings: ReviewBearingPolicy = "cannot-assess"
): string {
  return JSON.stringify({ outcome, reasons: [reason], edge_bearings: { __policy: bearings } });
}

interface RequestedReviewEdge {
  readonly ordinal: number;
  readonly relation: "support" | "attack";
  readonly target_statement: string;
}

/** The edges THIS review call offered, read off the wire, never assumed. */
function requestedReviewEdges(body: string): readonly RequestedReviewEdge[] {
  let request: { messages?: readonly { role: string; content: string }[] };
  try {
    request = JSON.parse(body) as typeof request;
  } catch {
    return [];
  }
  for (const message of request.messages ?? []) {
    if (message.role !== "user") continue;
    try {
      const envelope = JSON.parse(message.content) as {
        fields?: readonly { name: string; content: string }[];
      };
      const field = (envelope.fields ?? []).find((entry) => entry.name === "edges_sourced_by_this_node");
      if (field !== undefined) return JSON.parse(field.content) as readonly RequestedReviewEdge[];
    } catch { /* a non-envelope user message is not the one carrying the edges */ }
  }
  return [];
}

function withRequestDerivedBearings(content: string, edges: readonly RequestedReviewEdge[]): string {
  let value: { edge_bearings?: { __policy?: ReviewBearingPolicy } | unknown };
  try {
    value = JSON.parse(content) as typeof value;
  } catch {
    return content;
  }
  const declared = value.edge_bearings as { __policy?: ReviewBearingPolicy } | undefined;
  const policy = declared?.__policy;
  // A fixture that scripted a literal array means it; only a policy is expanded.
  if (policy === undefined) return content;
  return JSON.stringify({
    ...value,
    edge_bearings: edges.map((edge) => policy === "cannot-assess" ? null : policy[edge.relation])
  });
}

async function createRunnerWork(questionLine: string): Promise<{ runId: string; workItemId: string }> {
  const runId = await createRun(questionLine);
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `runner-test:${questionLine}`
  });
  return { runId, workItemId };
}

type ProviderDoubleResponse = string | Readonly<{ status: number; body?: string }>;

/**
 * T3/S2-2: the content this double returns for a PANEL assessment call. The default
 * scores fidelity 0 (tau 0), which can never displace an author's voice under the
 * strictly-greater selection, so every pre-existing fixture keeps its own tau. A test
 * that is ABOUT the panel passes its own content — including non-JSON prose, which the
 * panel must classify as a typed PARSE_FAILURE.
 */
const DEFAULT_PANEL_ASSESSMENT = JSON.stringify({
  steelman: { summary: "Panel member assessment.", fidelity: 0 },
  critic: { summary: "Panel member counter.", counterargumentStrength: 1, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0, relevance: 0 },
  context: { fit: 0, ambiguityFlags: [] },
  fallacy: { severity: 1, fatalFlags: [] }
});

function panelAssessmentDouble(fidelity: number): string {
  return JSON.stringify({
    steelman: { summary: "Panel member assessment.", fidelity },
    critic: { summary: "Panel member counter.", counterargumentStrength: 0, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: fidelity, relevance: fidelity },
    context: { fit: fidelity, ambiguityFlags: [] },
    fallacy: { severity: 0, fatalFlags: [] }
  });
}

async function startProviderDouble(
  contents: readonly ProviderDoubleResponse[],
  panelAssessment: string = DEFAULT_PANEL_ASSESSMENT
): Promise<{
  endpoint: string; calls(): number; stop(): Promise<void>;
}> {
  // T9: the EVALUATOR is a class of its own. The retired CONFORMANCE and R9
  // classes stay in the vocabulary so a fixture that still scripts one is
  // dispatched rather than silently served a judgement.
  type ResponseClass = "JUDGE" | "REVIEW" | "COMPOSE" | "CONFORMANCE" | "R9" | "EVALUATOR" | "GENERAL";
  const classifyContent = (content: ProviderDoubleResponse): ResponseClass => {
    if (typeof content !== "string") return "GENERAL";
    try {
      const value = JSON.parse(content) as Record<string, unknown>;
      if ("statement" in value) return "JUDGE";
      if ("outcome" in value) return "REVIEW";
      if ("segments" in value) return "COMPOSE";
      if ("satisfied" in value) return "EVALUATOR";
      if ("conforms" in value) return "CONFORMANCE";
      if ("pass" in value) return "R9";
    } catch { /* malformed fixtures retain FIFO semantics */ }
    return "GENERAL";
  };
  const classified = contents.map((content, index) => {
    let kind = classifyContent(content);
    if (kind === "GENERAL" && typeof content !== "string") {
      for (let cursor = index + 1; cursor < contents.length && kind === "GENERAL"; cursor += 1) {
        kind = classifyContent(contents[cursor]!);
      }
      if (kind === "GENERAL" && index > 0) kind = classifyContent(contents[index - 1]!);
    }
    return { content, kind };
  });
  const pending = [...classified];
  let calls = 0;
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      // J12 coherence (T3/S2-2): every M>=2 fixture below now runs a judge panel, so
      // each authored node draws one assess call per non-author maker. Those legs are
      // answered FROM THE CONTRACT and never consume `pending`, so every fixture's
      // scripted queue keeps its exact positions and its own assertions stand unchanged.
      // The member scores fidelity 0, i.e. tau 0: selection is strictly greater-than, so
      // a panel voice can never displace the author's and no fixture's tau moves.
      if (body.includes("Assess an existing debate node authored by another maker")) {
        calls += 1;
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
          id: `panel-assess-${calls}`,
          model: "model:test-layer",
          choices: [{ message: { content: panelAssessment } }]
        }));
        return;
      }
      // T3 N4 (same defect as acceptance/ceremony.test.ts): the JUDGE discriminator must
      // be ESCAPE-SAFE — the packet reaches the wire JSON-encoded, so `"statement":`
      // arrives as \"statement\" and the old check never matched.
      // T9: `fairness_to_losers` appears in the EVALUATOR system prompt and
      // nowhere else, and it is checked BEFORE the composer discriminator
      // because an evaluator request carries the candidate statement, not the
      // segment contract. Without this the evaluator was handed whatever sat at
      // the head of the queue — a judgement — and failed its own schema.
      const requestKind: ResponseClass = body.includes("Review an existing debate node") ? "REVIEW"
        : body.includes("restatement_text") ? "JUDGE"
          : body.includes("fairness_to_losers") ? "EVALUATOR"
            : body.includes("conforms,findings") ? "CONFORMANCE"
              : body.includes("{pass}") ? "R9"
                : body.includes("served_number_refs") ? "COMPOSE" : "GENERAL";
      const matching = requestKind === "GENERAL" ? -1 : pending.findIndex((entry) => entry.kind === requestKind);
      const selected = pending.splice(matching < 0 ? 0 : matching, 1)[0];
      // T5/S3-1: a review response must measure exactly the edges THIS call
      // offered, so the declared policy is resolved against the live request.
      const content = selected !== undefined && requestKind === "REVIEW" && typeof selected.content === "string"
        ? withRequestDerivedBearings(selected.content, requestedReviewEdges(body))
        : selected?.content;
      calls += 1;
      if (content === undefined) {
        response.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "unexpected test call" }));
        return;
      }
      if (typeof content !== "string") {
        response.writeHead(content.status, { "content-type": "application/json" })
          .end(content.body ?? JSON.stringify({ error: "test-layer transport failure" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        id: `completion-test-${calls}`, model: "test-layer/model",
        choices: [{ message: { content } }]
      }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("TEST_PROVIDER_ADDRESS_FAILED");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    calls: () => calls,
    async stop() { server.close(); await once(server, "close"); }
  };
}

const resil01Composition = JSON.stringify({ segments: [
  { segment_id: "segment:verdict", text: "The judged position survives.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
  { segment_id: "segment:research", text: "Check an independent source.", node_refs: [], served_number_refs: [] }
] });

async function executeResil01Scenario(input: {
  readonly label: string;
  readonly primary: readonly ProviderDoubleResponse[];
  readonly secondary: readonly ProviderDoubleResponse[];
  readonly depth?: number;
  readonly beforeExecute?: (context: { runId: string; workItemId: string }) => Promise<void>;
}) {
  const primary = await startProviderDouble(input.primary);
  const secondary = await startProviderDouble(input.secondary);
  try {
    const question = `${input.label}-${randomUUID()}`;
    const runId = await createRun(question, 100, 2, input.depth ?? 1);
    const workItemId = await new WorkItemRepository(database.pool).enqueue({
      runId, batteryRowId: "Q1", nodeSet: [], commandKey: `${input.label}:${runId}`
    });
    await input.beforeExecute?.({ runId, workItemId });
    const runRepository = new RunRepository(database.pool);
    const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
      endpoint: primary.endpoint, model: "test-layer/primary-model", maker: "Primary test maker"
    }), {
      ...runnerSettings(),
      claimMs: 1_204_000,
      runDeathPolicy: { cooldownMs: 600_000, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 2 },
      hiddenNodeScoreThreshold: { value: 0.35, sourceRef: "acceptance:DR-176:V-approved" },
      holdRecorder: {
        countCooldownHolds: (candidateRunId) => runRepository.countCooldownHolds(candidateRunId),
        record: (event) => runRepository.recordRunLifecycleEvent({
          runId: event.runId,
          kind: event.kind,
          value: {
            state: event.state, call_site_key: event.callSiteKey, parent_node_ref: event.parentNodeId,
            hold_ms: event.holdMs, hold_until: event.holdUntil, attempts_spent: event.attemptsSpent,
            transport_outcome: event.transportOutcome, planned_leg_count: event.plannedLegCount
          }
        }),
        wait: async () => undefined
      },
      critique: {
        provider: createPostgresProviderGateway(database.pool, {
          endpoint: secondary.endpoint, model: "test-layer/secondary-model", maker: "Secondary test maker"
        }),
        providerRef: "provider:test-layer:secondary",
        maker: "Secondary test maker"
      },
      scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" }
    });
    let result: Awaited<ReturnType<WalkingSkeletonRunner["executeWorkItem"]>> | null = null;
    let error: unknown = null;
    try {
      result = await runner.executeWorkItem(workItemId);
    } catch (candidate) {
      error = candidate;
    }
    const answer = result?.kind === "COMPLETED"
      ? await new ServeRepository(database.pool).readAnswerProjection(result.answerId, `asker:${question}`)
      : null;
    const lifecycle = await database.pool.query<{
      kind: string;
      state: string;
      call_site_key: string;
      attempts_spent: number;
      planned_leg_count: number;
    }>(
      `SELECT kind, value_json->>'state' AS state,
              value_json->>'call_site_key' AS call_site_key,
              (value_json->>'attempts_spent')::integer AS attempts_spent,
              (value_json->>'planned_leg_count')::integer AS planned_leg_count
       FROM core.run_progress_event
       WHERE run_id=$1 AND kind IN ('node.retrying', 'ledger.could_not_do')
       ORDER BY at_seq`,
      [runId]
    );
    return {
      runId, workItemId, result, error, answer, lifecycle: lifecycle.rows,
      snapshot: await new GraphRepository(database.pool).materialiseSnapshot(runId),
      primaryCalls: primary.calls(), secondaryCalls: secondary.calls()
    };
  } finally {
    await secondary.stop();
    await primary.stop();
  }
}

function runnerWithEndpoint(endpoint: string, settings = runnerSettings()): WalkingSkeletonRunner {
  return new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
    endpoint, model: "test-layer/model", maker: "test-layer"
  }), settings);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});

afterAll(async () => {
  await database?.stop();
});

describe("BUG-01 content-rejection retry accounting", () => {
  it("DR-184 C-2 crosses the real provider boundary after the in-run review key is exhausted", async () => {
    const question = `dr184-c2-real-boundary-${randomUUID()}`;
    const { runId, workItemId } = await createRunnerWork(question);
    const contractHash = "contract:dr184-c2-real-boundary";
    const nodeId = "node:dr184-c2-real-boundary";
    const invocationId = "invocation:dr184-c2-real-boundary";
    const inRunKey = `JUDGE:review:${nodeId}`;
    const expectedCatchUpKey = `JUDGE:review:catch-up:${invocationId}:${nodeId}`;
    const provider = await startProviderDouble([
      { status: 503 }, { status: 503 }, { status: 503 },
      reviewDouble("agree", "The catch-up crossed the real relay boundary.")
    ]);
    try {
      const gateway = createPostgresProviderGateway(database.pool, {
        endpoint: provider.endpoint, model: "test-layer/model", maker: "test-layer:reviewer"
      });
      const request = {
        runId, subjectItemId: workItemId, role: "JUDGE" as const, lane: "served" as const,
        bound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 5_000 },
        contractHash, providerRef: "provider:test-layer:reviewer",
        packet: { messages: [{ role: "user" as const, content: "Review an existing debate node" }] }
      };

      await expect(gateway.call({ ...request, callSiteKey: inRunKey }))
        .rejects.toMatchObject({ attempts: 3 });
      expect(provider.calls()).toBe(3);
      await expect(gateway.call({ ...request, callSiteKey: inRunKey }))
        .rejects.toMatchObject({ code: "CALL_BUDGET_EXHAUSTED" });
      expect(provider.calls()).toBe(3);

      const catchUpKey = reviewCatchUpCallSiteKey(invocationId, nodeId);
      await expect(gateway.call({ ...request, callSiteKey: catchUpKey })).resolves.toMatchObject({
        content: expect.stringContaining("catch-up crossed")
      });
      expect(provider.calls()).toBe(4);
      expect(await new LedgerRepository(database.pool).countModelAttempts({
        runId, workItemId, contractHash, callSiteKey: inRunKey
      })).toBe(3);
      expect(await new LedgerRepository(database.pool).countModelAttempts({
        runId, workItemId, contractHash, callSiteKey: expectedCatchUpKey
      })).toBe(1);
      expect(await new BudgetRepository(database.pool).countRunModelAttempts(runId)).toBe(4);
    } finally {
      await provider.stop();
      await new WorkItemRepository(database.pool).recordTerminalFailure({
        runId, workItemId, reason: "TEST_LAYER:DR184_C2_COMPLETE"
      });
    }

    const ceilingQuestion = `dr184-c2-pinned-ceiling-${randomUUID()}`;
    const ceilingRunId = await createRun(ceilingQuestion, 2);
    const ceilingWorkItemId = await new WorkItemRepository(database.pool).enqueue({
      runId: ceilingRunId, batteryRowId: "Q1", nodeSet: [], commandKey: `runner-test:${ceilingQuestion}`
    });
    const ceilingProvider = await startProviderDouble([{ status: 503 }, { status: 503 }]);
    try {
      const ceilingGateway = createPostgresProviderGateway(database.pool, {
        endpoint: ceilingProvider.endpoint, model: "test-layer/model", maker: "test-layer:reviewer"
      });
      const ceilingRequest = {
        runId: ceilingRunId, subjectItemId: ceilingWorkItemId,
        callSiteKey: "JUDGE:review:ceiling-seed", role: "JUDGE" as const, lane: "served" as const,
        bound: { maxAttempts: 2, tokenCeiling: 256, deadlineMs: 5_000 },
        contractHash, providerRef: "provider:test-layer:reviewer",
        packet: { messages: [{ role: "user" as const, content: "Review an existing debate node" }] }
      };
      await expect(ceilingGateway.call(ceilingRequest)).rejects.toMatchObject({ attempts: 2 });
      expect(ceilingProvider.calls()).toBe(2);
      await expect(ceilingGateway.call({
        ...ceilingRequest,
        callSiteKey: `JUDGE:review:catch-up:${invocationId}:ceiling-node`
      })).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_EXHAUSTED" });
      expect(ceilingProvider.calls()).toBe(2);
    } finally {
      await ceilingProvider.stop();
      await new WorkItemRepository(database.pool).recordTerminalFailure({
        runId: ceilingRunId, workItemId: ceilingWorkItemId, reason: "TEST_LAYER:DR184_C2_CEILING_COMPLETE"
      });
    }
  });

  it("T11/T13 charges every rejected attempt while terminal execution counts only the accepted attempt", async () => {
    const question = `bug01-accounting-${randomUUID()}`;
    const { runId, workItemId } = await createRunnerWork(question);
    const provider = await startProviderDouble(["rejected-one", "rejected-two", "accepted-three"]);
    try {
      const gateway = createPostgresProviderGateway(database.pool, {
        endpoint: provider.endpoint, model: "test-layer/model", maker: "test-layer"
      });
      const result = await gateway.call({
        runId, subjectItemId: workItemId, callSiteKey: "JUDGE", role: "JUDGE", lane: "served",
        bound: { maxAttempts: 3, tokenCeiling: 64, deadlineMs: 5_000 },
        contractHash: "contract:bug01-accounting", providerRef: "provider:test-layer",
        packet: { messages: [{ role: "user", content: "test-layer accounting fixture" }] },
        classifyContent: (content) => content === "accepted-three"
          ? { parseStatus: "PARSED", parseError: null }
          : { parseStatus: "SCHEMA_FAILED", parseError: `schema:${content}` }
      });
      expect(result.content).toBe("accepted-three");
      expect(await new BudgetRepository(database.pool).countRunModelAttempts(runId)).toBe(3);
      expect(await new LedgerRepository(database.pool).countModelAttempts({
        runId, workItemId, contractHash: "contract:bug01-accounting", callSiteKey: "JUDGE"
      })).toBe(3);
      const facts = await readTerminalRecordedFacts(database.pool, runId);
      expect(facts.ledger.judgeCallCount).toBe(1);
      const outcomes = await database.pool.query<{ outcome: string; parse_status: string }>(
        `SELECT entry.outcome, artifact.parse_status
         FROM ledger.ledger_entry AS entry
         JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = entry.raw_artifact_ref
         WHERE entry.run_id = $1 AND entry.call_site_key = 'JUDGE'
         ORDER BY entry.sequence`,
        [runId]
      );
      expect(outcomes.rows).toEqual([
        { outcome: "FAILED", parse_status: "SCHEMA_FAILED" },
        { outcome: "FAILED", parse_status: "SCHEMA_FAILED" },
        { outcome: "OK", parse_status: "PARSED" }
      ]);
    } finally {
      await provider.stop();
      await new WorkItemRepository(database.pool).recordTerminalFailure({
        runId, workItemId, reason: "TEST_LAYER:BUG01_ACCOUNTING_COMPLETE"
      });
    }
  });

  it("T12 exposes the last rejected artifact to the redelivery exhaustion check", async () => {
    const question = `bug01-exhaustion-${randomUUID()}`;
    const { runId, workItemId } = await createRunnerWork(question);
    const provider = await startProviderDouble(["rejected-one", "rejected-two", "rejected-three"]);
    const ledger = new LedgerRepository(database.pool);
    try {
      const gateway = createPostgresProviderGateway(database.pool, {
        endpoint: provider.endpoint, model: "test-layer/model", maker: "test-layer"
      });
      await expect(gateway.call({
        runId, subjectItemId: workItemId, callSiteKey: "JUDGE:retry", role: "JUDGE", lane: "served",
        bound: { maxAttempts: 3, tokenCeiling: 64, deadlineMs: 5_000 },
        contractHash: "contract:bug01-exhaustion", providerRef: "provider:test-layer",
        packet: { messages: [{ role: "user", content: "test-layer exhaustion fixture" }] },
        classifyContent: (content) => ({ parseStatus: "SCHEMA_FAILED", parseError: `schema:${content}` })
      })).rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 3 });
      const exhausted = await ledger.findExhaustedModelAttempt({
        runId, workItemId, contractHash: "contract:bug01-exhaustion", maxAttempts: 3
      });
      expect(exhausted).toEqual(expect.objectContaining({ artifactRef: expect.any(String) }));
      const last = await database.pool.query<{ raw_artifact_ref: string }>(
        `SELECT raw_artifact_ref FROM ledger.ledger_entry
         WHERE run_id = $1 AND subject_item_id = $2 AND call_site_key = 'JUDGE:retry'
         ORDER BY sequence DESC LIMIT 1`,
        [runId, workItemId]
      );
      expect(exhausted?.artifactRef).toBe(last.rows[0]!.raw_artifact_ref);
    } finally {
      await provider.stop();
      await new WorkItemRepository(database.pool).recordTerminalFailure({
        runId, workItemId, reason: "TEST_LAYER:BUG01_EXHAUSTION_COMPLETE"
      });
    }
  });
});

describe("LOAD-01 run projection ownership boundary", () => {
  it("projects a freshly accepted zero-work-item run as QUEUED", async () => {
    const askerId = `asker:bug02-zero:${randomUUID()}`;
    const runId = await createRun("bug02-zero-work-items", 10, 1, 1, askerId);
    await expect(new RunRepository(database.pool).readLoadingProjection(runId, askerId)).resolves.toMatchObject({
      state: "QUEUED"
    }); // MUT-BUG02-B8-ZERO-WORK-ELSE: report a fresh run as RUNNING -> RED.
  });

  it("projects a claimed work item as RUNNING and an all-DONE run as SETTLED", async () => {
    const askerId = `asker:bug02:${randomUUID()}`;
    const runId = await createRun("bug02-honest-loading-state", 10, 1, 1, askerId);
    const workItemId = await new WorkItemRepository(database.pool).enqueue({
      runId,
      batteryRowId: "Q1",
      nodeSet: [],
      commandKey: `bug02:${runId}:Q1`
    });
    const repository = new RunRepository(database.pool);

    await database.pool.query(
      `UPDATE core.work_item
       SET state = 'CLAIMED', claimed_by = 'worker:bug02', claim_deadline = clock_timestamp() + interval '1 hour'
       WHERE work_item_id = $1`,
      [workItemId]
    );
    await expect(repository.readLoadingProjection(runId, askerId)).resolves.toMatchObject({
      state: "RUNNING"
    }); // MUT-BUG02-CLAIMED-CASE: return CLAIMED for an executing item -> RED.

    await database.pool.query(
      `UPDATE core.work_item
       SET state = 'DONE', claimed_by = NULL, claim_deadline = NULL
       WHERE work_item_id = $1`,
      [workItemId]
    );
    await expect(repository.readLoadingProjection(runId, askerId)).resolves.toMatchObject({
      state: "SETTLED"
    }); // MUT-BUG02-SETTLED-INTEGRATION: fall through to eternal RUNNING -> RED.
  });

  it("T17/T18 persists typed hold events in order and self-expires HOLDING on real PostgreSQL", async () => {
    const identity=testHttpIdentity(`resil01-${randomUUID()}`);
    await persistHttpIdentity(identity,"resil01");
    const askerId = `asker:historical:${randomUUID()}`;
    const runId = await createRun(`resil01-holding-${randomUUID()}`, 10, 1, 1, askerId);
    await database.pool.query("SELECT core.append_run_ownership_event($1,$2)",[
      runId,identity.authenticated.ownerRef
    ]);
    const workItemId = await new WorkItemRepository(database.pool).enqueue({
      runId, batteryRowId: "Q1", nodeSet: [], commandKey: `resil01:${runId}:Q1`
    });
    await database.pool.query(
      `UPDATE core.work_item SET state='CLAIMED', claimed_by='worker:resil01',
       claim_deadline=clock_timestamp() + interval '1 hour' WHERE work_item_id=$1`,
      [workItemId]
    );
    const repository = new RunRepository(database.pool);
    const future = new Date(Date.now() + 600_000).toISOString();
    const common = {
      call_site_key: "JUDGE:critic:root0:r1:p0", parent_node_ref: randomUUID(), hold_ms: 600_000,
      attempts_spent: 3, transport_outcome: "FAILED", planned_leg_count: 3
    } as const;
    await repository.recordRunLifecycleEvent({
      runId, kind: "node.retrying", value: { ...common, state: "COOLDOWN_HOLD", hold_until: future }
    });
    await expect(repository.readLoadingProjection(runId, {
      ownerRef:identity.authenticated.ownerRef,legacyAskerId:null
    })).resolves.toMatchObject({
      state: "HOLDING", holdUntil: new Date(future)
    });

    const application = new PostgresAskApplication(
      database.pool,{} as never,{} as never,undefined,database.pool,
      createTestAskAdmissionPoolFacades(database.pool)
    );
    const api = buildApi({
      application,
      sessions:testSessionApplication([identity]),allowedOrigin:TEST_APP_ORIGIN
    });
    try {
      const response = await api.inject({
        method: "GET", url: `/v1/runs/${encodeURIComponent(runId)}/events`,
        headers:testSessionHeaders(identity)
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("event: node.retrying");
      expect(response.body).toContain('"state":"COOLDOWN_HOLD"');
      expect(response.body).toContain(`"hold_until":"${future}"`);
    } finally {
      await api.close();
    }

    await repository.recordRunLifecycleEvent({
      runId, kind: "node.retrying", value: {
        ...common, state: "COOLDOWN_HOLD", hold_until: new Date(Date.now() - 1_000).toISOString()
      }
    });
    await expect(repository.readLoadingProjection(runId, {
      ownerRef:identity.authenticated.ownerRef,legacyAskerId:null
    })).resolves.toMatchObject({
      state: "RUNNING", holdUntil: null
    });
    expect(await repository.countCooldownHolds(runId)).toBe(2);
  });

  it("prioritizes FAILED, CLAIMED and READY behavior before the all-DONE terminal arm", async () => {
    const askerId = `asker:bug02-priority:${randomUUID()}`;
    const runId = await createRun("bug02-projection-priority", 10, 1, 1, askerId);
    const work = new WorkItemRepository(database.pool);
    const first = await work.enqueue({
      runId,
      batteryRowId: "Q1",
      nodeSet: [],
      commandKey: `bug02:${runId}:priority:1`
    });
    const second = await work.enqueue({
      runId,
      batteryRowId: "Q2",
      nodeSet: [],
      commandKey: `bug02:${runId}:priority:2`
    });
    const repository = new RunRepository(database.pool);

    await expect(repository.readLoadingProjection(runId, askerId)).resolves.toMatchObject({ state: "QUEUED" });
    await database.pool.query(
      `UPDATE core.work_item
       SET state = 'CLAIMED', claimed_by = 'worker:bug02', claim_deadline = clock_timestamp() + interval '1 hour'
       WHERE work_item_id = $1`,
      [first]
    );
    await expect(repository.readLoadingProjection(runId, askerId)).resolves.toMatchObject({ state: "RUNNING" });
    await work.recordTerminalFailure({ runId, workItemId: second, reason: "TEST_LAYER:BUG02_FAILED_PRIORITY" });
    await expect(repository.readLoadingProjection(runId, askerId)).resolves.toMatchObject({ state: "FAILED" });
    // MUT-BUG02-PROJECTION-ARM-ORDER: weaken any earlier arm or settle mixed states -> RED.
  });

  it("returns 401 to anonymous callers and 404 to a foreign asker", async () => {
    const ownerIdentity=testHttpIdentity(`load01-owner-${randomUUID()}`);
    const foreignIdentity=testHttpIdentity(`load01-foreign-${randomUUID()}`);
    await persistHttpIdentity(ownerIdentity,"load01-owner");
    await persistHttpIdentity(foreignIdentity,"load01-foreign");
    const ownerAskerId = `asker:historical:${randomUUID()}`;
    const runId = await createRun("load01-owned-loading-run", 10, 1, 1, ownerAskerId);
    await database.pool.query("SELECT core.append_run_ownership_event($1,$2)",[
      runId,ownerIdentity.authenticated.ownerRef
    ]);
    const workItemId = await new WorkItemRepository(database.pool).enqueue({
      runId,
      batteryRowId: "Q1",
      nodeSet: [],
      commandKey: `load01:${runId}:Q1`
    });
    const repository = new RunRepository(database.pool);
    const readRun: AskApplication["readRun"] = async (candidateRunId, _session, ownership) => {
      const run = await repository.readLoadingProjection(candidateRunId, ownership);
      return run === null ? null : {
        run_ref: run.runRef,
        question_line: run.questionLine,
        state: run.state,
        terminal_reason: run.terminalReason,
        hold_until: run.holdUntil?.toISOString() ?? null
      };
    };
    const application = {
      readRun
    } as unknown as AskApplication;
    const api = buildApi({
      application,
      sessions:testSessionApplication([ownerIdentity]),allowedOrigin:TEST_APP_ORIGIN
    });
    const foreignApi = buildApi({
      application,
      sessions:testSessionApplication([foreignIdentity]),allowedOrigin:TEST_APP_ORIGIN
    });
    try {
      const anonymous = await api.inject({ method: "GET", url: `/v1/runs/${encodeURIComponent(runId)}` });
      expect(anonymous.statusCode).toBe(401);

      const foreign = await foreignApi.inject({
        method: "GET",
        url: `/v1/runs/${encodeURIComponent(runId)}`,
        headers:testSessionHeaders(foreignIdentity)
      });
      expect(foreign.statusCode).toBe(404);

      const owner = await api.inject({
        method: "GET",
        url: `/v1/runs/${encodeURIComponent(runId)}`,
        headers:testSessionHeaders(ownerIdentity)
      });
      expect(owner.statusCode).toBe(200);
      expect(owner.json()).toMatchObject({ run_ref: runId, state: "QUEUED" });
    } finally {
      await new WorkItemRepository(database.pool).recordTerminalFailure({
        runId,
        workItemId,
        reason: "TEST_FIXTURE_CLEANUP"
      });
      await foreignApi.close();
      await api.close();
    }
  });
});

describe("BUG-03 asker-scoped debates index", () => {
  it("lists open owner runs honestly and excludes foreign or already-served runs", async () => {
    const servedQuestion = `bug03-served-${randomUUID()}`;
    const ownerAskerId = `asker:${servedQuestion}`;
    const servedWork = await createRunnerWork(servedQuestion);
    const provider = await startProviderDouble([
      JSON.stringify({ statement: "A served test-layer answer.", way_of_knowing: "REASONING",
        locator: null, restatement_text: "A served test-layer answer.", restatement_status: "PASS", value_laden: false,
        steelman: { summary: "A served test-layer answer.", fidelity: 0.72 }, critic: { summary: "A test-layer counter.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
        evidence: { quality: 0.72, relevance: 0.72 }, context: { fit: 0.72, ambiguityFlags: [] }, fallacy: { severity: 0.28, fatalFlags: [] } }),
      JSON.stringify({ segments: [
        { segment_id: "segment:verdict", text: "A served test-layer answer.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
        { segment_id: "segment:research", text: "Check a test-layer source.", node_refs: [], served_number_refs: [] }
      ] }),
      evaluatorSatisfied()
    ]);
    try {
      const served = await runnerWithEndpoint(provider.endpoint).executeWorkItem(servedWork.workItemId);
      if (served.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");

      const runningRunId = await createRun(`bug03-running-${randomUUID()}`, 10, 1, 1, ownerAskerId);
      const runningWorkItemId = await new WorkItemRepository(database.pool).enqueue({
        runId: runningRunId,
        batteryRowId: "Q1",
        nodeSet: [],
        commandKey: `bug03:${runningRunId}:running`
      });
      await database.pool.query(
        `UPDATE core.work_item
         SET state = 'CLAIMED', claimed_by = 'worker:bug03', claim_deadline = clock_timestamp() + interval '1 hour'
         WHERE work_item_id = $1`,
        [runningWorkItemId]
      );

      const failedRunId = await createRun(`bug03-failed-${randomUUID()}`, 10, 1, 1, ownerAskerId);
      const failedWork = new WorkItemRepository(database.pool);
      const failedWorkItemId = await failedWork.enqueue({
        runId: failedRunId,
        batteryRowId: "Q1",
        nodeSet: [],
        commandKey: `bug03:${failedRunId}:failed`
      });
      await failedWork.recordTerminalFailure({
        runId: failedRunId,
        workItemId: failedWorkItemId,
        reason: "TEST_LAYER:BUG03_TERMINAL_FAILURE"
      });

      const foreignRunId = await createRun(`bug03-foreign-${randomUUID()}`, 10, 1, 1, `asker:foreign:${randomUUID()}`);
      const index = await new ServeRepository(database.pool).readAnswerIndex(ownerAskerId, 10, 0);

      expect(index.total).toBe(3);
      expect(index.items).toEqual([
        expect.objectContaining({ answer_id: served.answerId, run_ref: servedWork.runId })
      ]);
      expect(index.open_runs).toEqual([
        expect.objectContaining({
          run_ref: failedRunId,
          state: "FAILED",
          terminal_reason: "TEST_LAYER:BUG03_TERMINAL_FAILURE"
        }),
        expect.objectContaining({ run_ref: runningRunId, state: "RUNNING", terminal_reason: null })
      ]);
      expect(index.open_runs.map((run) => run.run_ref)).not.toContain(foreignRunId);
      expect(index.open_runs.map((run) => run.run_ref)).not.toContain(servedWork.runId);
      expect(index.items.length + index.open_runs.length).toBeLessThanOrEqual(index.limit);
      // MUT-BUG03-DROP-OPEN-READ: remove the open-run projection -> RED.
      // MUT-BUG03-FOREIGN-LEAK-BOTH-GUARDS: remove both asker guards -> RED.
      // MUT-BUG03-SERVED-DUPLICATE: remove NOT EXISTS serve.answer -> RED.
      // MUT-BUG03-FAILED-REASON: erase terminal_reason -> RED.
    } finally {
      await provider.stop();
    }
  });

  it("keeps a newer in-flight run on page one when served answers exceed HOME_PAGE_SIZE", async () => {
    const ownerAskerId = `asker:bug04-ordering:${randomUUID()}`;
    const servedFixtureCount = HOME_PAGE_SIZE + 1;

    for (let fixtureIndex = 0; fixtureIndex < servedFixtureCount; fixtureIndex += 1) {
      const label = `bug04-served-${fixtureIndex}-${randomUUID()}`;
      const runId = await createRun(label, 10, 1, 1, ownerAskerId);
      const carriers = await database.pool.query<{ work_item_id: string; fact_bundle_id: string }>(
        `WITH work AS (
           INSERT INTO core.work_item (
             run_id, battery_row_id, node_set, command_key, state, created_at_seq
           ) VALUES ($1,'Q1','[]'::jsonb,$2,'READY',ledger.allocate_sequence())
           RETURNING work_item_id
         ), bundle AS (
           INSERT INTO serve.fact_bundle (run_id, facts, residual_objections, content_hash, version)
           VALUES ($1,'[]'::jsonb,'[]'::jsonb,$3,1)
           RETURNING fact_bundle_id
         ) SELECT work_item_id, fact_bundle_id FROM work CROSS JOIN bundle`,
        [runId, `bug04:${label}`, `hash:${label}`]
      );
      const answer = await database.pool.query<{ answer_id: string }>(
        `INSERT INTO serve.answer (
           answer_version, run_id, work_item_id, terminal, serve_state, verdict_state,
           answer_form, condition_marks, fact_bundle_id, sealed_at_seq,
           reversal_point, builds_on_previous, badges
         ) VALUES (
           1,$1,$2,'SERVED','COMPOSED','SUPPORTED','{}'::jsonb,'[]'::jsonb,$3,
           ledger.allocate_sequence(),$4,'{"value":false,"answer_ref":null}'::jsonb,'[]'::jsonb
         ) RETURNING answer_id`,
        [runId, carriers.rows[0]!.work_item_id, carriers.rows[0]!.fact_bundle_id, `test-layer:${label}`]
      );
      await database.pool.query(
        `UPDATE core.work_item
         SET state='DONE', settled_attempt_id=gen_random_uuid(), settled_artifact_ref=$2
         WHERE work_item_id=$1`,
        [carriers.rows[0]!.work_item_id, answer.rows[0]!.answer_id]
      );
    }

    const runningRunId = await createRun(`bug04-running-${randomUUID()}`, 10, 1, 1, ownerAskerId);
    const runningWorkItemId = await new WorkItemRepository(database.pool).enqueue({
      runId: runningRunId,
      batteryRowId: "Q1",
      nodeSet: [],
      commandKey: `bug04:${runningRunId}:running`
    });
    await database.pool.query(
      `UPDATE core.work_item
       SET state = 'CLAIMED', claimed_by = 'worker:bug04', claim_deadline = clock_timestamp() + interval '1 hour'
       WHERE work_item_id = $1`,
      [runningWorkItemId]
    );

    const firstPage = await new ServeRepository(database.pool)
      .readAnswerIndex(ownerAskerId, HOME_PAGE_SIZE, 0);

    expect(firstPage.total).toBe(servedFixtureCount + 1);
    expect(firstPage.open_runs).toEqual([
      expect.objectContaining({ run_ref: runningRunId, state: "RUNNING" })
    ]);
    expect(firstPage.items).toHaveLength(HOME_PAGE_SIZE - 1);
    // MUT-BUG04-SERVED-FIRST: order ANSWER rows before OPEN_RUN rows -> RED.
  });
});

describe("S07 / FX-LED-06 / FX-LG-17 / FX-LG-18 — SPLIT persistence and terminality", () => {
  it("records replay identity exclusions and only lets a categorical decision spawn an atomic placeholder", async () => {
    const runId = await createRun("s07-categorical-spawn");
    const graph = new GraphRepository(database.pool);
    const parentNodeId = await graph.withGraphWrite(runId, (writer) => writer.addNode({
      runId, statementText: "Parent claim", claimType: "empirical", parentNodeId: null,
      childKind: null, siblingOrdinal: 0, generationStatus: "complete", pathStatus: "active",
      explorationDecision: "continue", provenanceRef: null, wayOfKnowing: "REASONING",
      locator: null, valueLaden: false
    }));
    const signals = [{
      kind: "score" as const, availability: "PRESENT" as const, freshness: "FRESH" as const,
      scoreInputHash: "score-input:s07", scoringContractHash: "score-contract:s07",
      scoreRecordId: "score-record:s07", scoreRunId: runId, scoreRunSequence: 1,
      reasonCodes: [],
      firingReasons: [{ code: "fatal contradiction", action: "challenge" as const, grounding: "categorical" as const }],
      blockers: []
    }, {
      kind: "evidence" as const, availability: "PRESENT" as const, freshness: "FRESH" as const,
      evidenceSnapshotId: "evidence-snapshot:s07", reasonCodes: [], firingReasons: [], blockers: []
    }] as const;
    const stage = new SplitStageRunner(database.pool);
    const spawned = await stage.execute({
      runId, parentNodeId, idempotencyKey: "decision:s07:categorical",
      decisionInput: { signals, pathState: { status: "ACTIVE", priorAction: "continue", stoppingStatus: "active" } },
      child: {
        statementText: "Pending defeater", claimType: "empirical", childKind: "defeater",
        siblingOrdinal: 1, provenanceRef: null, wayOfKnowing: "REASONING", locator: null,
        valueLaden: false, edgeProvenanceRef: "decision:s07:categorical"
      }
    });
    expect(spawned.decision).toMatchObject({ classification: "categorical", spawnCount: 1 });
    expect(spawned.spawn).toMatchObject({ nodeId: expect.any(String), placeholderEdgeId: expect.any(String) });

    const graphRows = await database.pool.query(
      `SELECT node.generation_status, edge.target_node_id
       FROM core.node AS node JOIN core.edge AS edge ON edge.source_node_id=node.node_id
       WHERE node.node_id=$1`, [spawned.spawn?.nodeId]
    );
    expect(graphRows.rows[0]).toMatchObject({ generation_status: "pending", target_node_id: parentNodeId });

    const ledger = new LedgerRepository(database.pool);
    const attemptId = randomUUID();
    const rawArtifactRef = randomUUID();
    await ledger.append({
      runId, attemptId, actionKind: "JUDGEMENT_SCHEDULED", subjectItemId: spawned.spawn!.nodeId,
      stanceAtAction: "ATTACKS", outcome: "OK", actorRef: "runner:s07-test",
      inputHash: "input:s07-judgement", contractHash: "contract:s07-judgement",
      startedAt: new Date("2026-08-08T00:00:00.000Z"), finishedAt: new Date("2026-08-08T00:00:01.000Z")
    });
    await ledger.appendRawArtifact({
      artifactId: rawArtifactRef, attemptId, runId, providerRef: "provider:s07-test",
      provider: "test", model: "model:s07-test", maker: "maker:s07-test", modelVersion: "v1",
      rawText: "test-layer judgement", metadata: { fixture: "S07" }, parseStatus: "PARSED",
      inputHash: "a".repeat(64), contractHash: "b".repeat(64), contentHash: "c".repeat(64)
    });
    await ledger.append({
      runId, attemptId, actionKind: "MODEL_CALL", callSiteKey: "S07_DEFEATER_JUDGE",
      subjectItemId: spawned.spawn!.nodeId, stanceAtAction: "ATTACKS", outcome: "OK",
      actorRef: "provider:s07-test", inputHash: "input:s07-judgement",
      contractHash: "contract:s07-judgement", rawArtifactRef,
      startedAt: new Date("2026-08-08T00:00:01.000Z"), finishedAt: new Date("2026-08-08T00:00:02.000Z")
    });
    await ledger.recordPropagation({
      runId, inputHash: "input:s07-propagation", contractHash: "contract:s07-propagation",
      graphFingerprint: "graph:s07", arrowOrder: [spawned.spawn!.placeholderEdgeId],
      clusterRecords: [], operatorResolutions: [], transmissionReductions: [], liftRecords: [],
      judgementSelectionRule: {
        kind: "MAXIMIZE_WEIGHTED_TAU", rowKey: "judgementSelectionRule",
        registerVersion: 1, sourceRef: "test-layer:S07"
      },
      strengths: [{
        nodeId: spawned.spawn!.nodeId, strength: 0.4, numberKind: "propagated-probability",
        sourceRef: "S07 test", producer: "propagation:test", replayHandle: "replay:s07",
        wayOfKnowing: "REASONING"
      }]
    });
    const events = await graph.readNodeLifecycleEvents(runId);
    expect(events.map((event) => event.eventType)).toEqual([
      "node.spawned", "node.generating", "node.being_judged", "node.scored"
    ]);
    expect(events[0]?.payload).toEqual({
      node_ref: spawned.spawn!.nodeId, parent_ref: parentNodeId,
      placeholder_edge_ref: spawned.spawn!.placeholderEdgeId
    });
    expect(events.every((event) => event.subjectRef === spawned.spawn!.nodeId)).toBe(true);

    const sameIdentity = {
      signals, pathState: { status: "ACTIVE", priorAction: "continue", stoppingStatus: "active" },
      action: "challenge", firingReasons: ["FATAL_CONTRADICTION"], blockers: [],
      nextPathState: { status: "ACTIVE", stoppingStatus: "active" }
    };
    const first = await ledger.recordDecision({
      runId, parentNodeId, idempotencyKey: "hash-exclusion:a", replayIdentity: sameIdentity,
      classification: "categorical", spawnCount: 1
    });
    const second = await ledger.recordDecision({
      runId, parentNodeId, idempotencyKey: "hash-exclusion:b", replayIdentity: sameIdentity,
      classification: "scalar", spawnCount: 0
    });
    expect(second.replayIdentityHash).toBe(first.replayIdentityHash);
  });

  it("rejects TERMINAL over a latest WAIT, then accepts it after real ledgered drain transitions", async () => {
    const runId = await new RunRepository(database.pool).startRun({
      questionLine: "s07-wait-drain", principal: { kind: "legacy", legacyAskerId: "asker:s07-wait-drain" },
      sessionId: "session:s07-wait-drain",
      callerScope: "ASKER", asOf: new Date("2026-08-08T00:00:00.000Z"), askerRiskTier: "casual",
      effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker-declaration:s07-wait-drain",
      compositionBudgetTier: "low", depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1), strangerSampleRate: 1,
      envelopeBasis: { source: "test-layer" }, registerVersion: 1, batteryVersion: "s07",
      batteryRows: [{
        batteryRowId: "Q30", predicateRef: "docs/architecture/10-row-contracts.md §6.6 Q30",
        openingState: "WAIT", predicateInputs: {
          kind: "PARTIAL", values: { "Q10.split": true },
          absentInputs: ["Q45_operator", "child_values"]
        }, skipEvidence: null
      }]
    });
    await expect(database.pool.query(
      `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
       VALUES ($1, ledger.allocate_sequence(), 'TERMINAL', '"SERVED"'::jsonb)`, [runId]
    )).rejects.toThrow(/WAIT_DRAIN_REQUIRED/);

    const before = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run_row_activation_event WHERE run_id=$1", [runId]
    );
    await new RunRepository(database.pool).drainWaitsForCompletion(
      runId,
      [{
        batteryRowId: "Q30",
        state: "ACTIVE",
        predicateInputs: {
          kind: "PRESENT",
          values: {
            "Q10.split": true,
            Q45_operator: { operator: "accumulate", sourceRef: "register:operator:s07" },
            child_values: [{ nodeRef: "child:s07", strengthRef: "strength:s07" }]
          }
        },
        skipEvidence: null
      }]
    );
    await expect(database.pool.query(
      `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
       VALUES ($1, ledger.allocate_sequence(), 'TERMINAL', '"SERVED"'::jsonb)`, [runId]
    )).resolves.toMatchObject({ rowCount: 1 });
    const after = await database.pool.query<{ count: string; waiting: string }>(
      `SELECT count(*)::text AS count,
        count(*) FILTER (WHERE latest.state='WAIT')::text AS waiting
       FROM (
         SELECT DISTINCT ON (battery_row_id) battery_row_id, state
         FROM core.run_row_activation_event WHERE run_id=$1
         ORDER BY battery_row_id, at_seq DESC
       ) AS latest`, [runId]
    );
    expect(Number(after.rows[0]!.count)).toBe(1);
    expect(after.rows[0]!.waiting).toBe("0");
    const transitionCount = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run_row_activation_event WHERE run_id=$1", [runId]
    );
    expect(Number(transitionCount.rows[0]!.count)).toBeGreaterThan(Number(before.rows[0]!.count));
  });
});

describe("NQ-2 — real PostgreSQL provisioning seam", () => {
  it("runs real embedded PostgreSQL and records Testcontainers as deferred by DR-121", async () => {
    const result = await database.pool.query<{ server_version: string }>("show server_version");
    expect(result.rows[0]?.server_version.split(".")[0]).toBe(database.expectedPostgresMajor);
    expect(database.mechanism).toBe("embedded-postgres");
    expect(database.testcontainersStatus).toBe("DEFERRED BY DR-121");
  });
});

describe("P5 / FX-DB-02 / FX-DB-07 — run initialization is atomic and event-derived", () => {
  it("transcribes the execution labels and proves every MACHINE row allows zero model calls", () => {
    expect(BATTERY_EXECUTION_CONTRACTS.filter((row) => row.executionKind === "MACHINE")).toHaveLength(13);
    expect(BATTERY_EXECUTION_CONTRACTS.filter((row) => row.executionKind === "MACHINE").every((row) => row.modelCallsAllowed === 0)).toBe(true);
    expect(BATTERY_EXECUTION_CONTRACTS.find((row) => row.batteryRowId === "Q27")?.executionKind).toBe("LLM");
  });

  it("writes the frozen head, three progress events, 71 activation rows, and 71 opening events in one transaction", async () => {
    const repository = new RunRepository(database.pool);
    const runId = await repository.startRun({
      questionLine: "Test-layer question",
      principal: { kind: "legacy", legacyAskerId: "asker:test" },
      sessionId: "session:test",
      callerScope: "ASKER",
      asOf: new Date("2026-08-07T00:00:00.000Z"),
      askerRiskTier: "casual",
      effectiveRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "asker-declaration:test",
      compositionBudgetTier: "low",
      depthParams: { depth: 1 },
      discoveredPanel: fixtureDiscoveredPanel(1),
      strangerSampleRate: 1,
      envelopeBasis: { key: "test-envelope" },
      registerVersion: 1,
      batteryVersion: "s00",
      batteryRows
    });
    const state = await repository.readCurrentState(runId);
    expect(state.phase).toBe("EMPIRICAL");
    expect(state.envelopeState).toBe("WITHIN");
    expect(state.envelopeConsumed).toBe(0);
    expect(state.activations).toHaveLength(71);
    expect(state.activations.find((row) => row.batteryRowId === "Q1")?.state).toBe("ACTIVE");
    expect(state.activations.find((row) => row.batteryRowId === "Q14")?.state).toBe("POLICY_BLOCKED");
    expect(state.activations.find((row) => row.batteryRowId === "Q61")?.state).toBe("INACTIVE");
    expect(state.activations.find((row) => row.batteryRowId === "Q2")?.state).toBe("WAIT");
  });

  it("DR-181 T4 derives agent_count from the frozen panel and enforces append-only probe evidence", async () => {
    const runId = await createRun("dr181-panel-identity", 10, 3);
    const head = await database.pool.query<{ agent_count: number; panel_count: number }>(
      `SELECT agent_count, jsonb_array_length(discovered_panel) AS panel_count
       FROM core.run WHERE run_id=$1`, [runId]
    );
    expect(head.rows[0]).toEqual({ agent_count: 3, panel_count: 3 });

    await expect(database.pool.query(
      `INSERT INTO core.run (
         question_line, asker_id, session_id, caller_scope, as_of,
         asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
         composition_budget_tier, depth_params, agent_count, discovered_panel,
         stranger_sample_rate, envelope_basis, register_version,
         battery_version, created_at_seq
       ) VALUES (
         'bad panel identity', 'asker:bad-panel', 'session:bad-panel', 'ASKER', now(),
         'casual', 'casual', 'ASKER', 'asker-declaration:bad-panel',
         'low', '{"depth":1}', 2, '[]', 1, '{}', 1, 's00', ledger.allocate_sequence()
       )`
    )).rejects.toThrow(/run_panel_count_identity/);

    const probeId = randomUUID();
    const probes = new ProviderProbeRepository(database.pool);
    await probes.record({
      probeEvidenceRef: probeId,
      providerRef: "provider:dr181",
      maker: "maker:dr181",
      state: "HEALTHY",
      modelId: "model:dr181",
      failureCode: null,
      probedAt: new Date()
    });
    await expect(database.pool.query(
      "UPDATE core.provider_probe SET model_id='model:mutated' WHERE probe_id=$1", [probeId]
    )).rejects.toThrow();
    await expect(database.pool.query(
      `INSERT INTO core.provider_probe
         (probe_id, provider_ref, maker, state, model_id, failure_code, probed_at)
       VALUES ($1, 'provider:bad', 'maker:bad', 'ABSENT', 'forbidden-model', NULL, now())`,
      [randomUUID()]
    )).rejects.toThrow();
  });

  it("returns a typed error instead of defaulting an empty progress stream", async () => {
    const result = await database.pool.query<{ run_id: string }>(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count, discovered_panel,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES (
        'raw fixture', 'asker:raw', 'session:raw', 'ASKER', now(),
        'casual', 'casual', 'ASKER', 'asker-declaration:raw',
        'low', '{}', 1,
        '[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',
        1, '{}', 1, 's00', 9999
      ) RETURNING run_id
    `);
    const repository = new RunRepository(database.pool);
    await expect(repository.readCurrentState(result.rows[0]!.run_id)).rejects.toMatchObject({
      code: "EMPTY_EVENT_STREAM"
    });
  });

  it("FX-DB-01a/01b rejects UPDATE and DELETE against the frozen run head", async () => {
    const runId = await createRun("immutable-run-head");
    await expect(database.pool.query(
      "UPDATE core.run SET battery_version='mutated' WHERE run_id=$1", [runId]
    )).rejects.toThrow();
    await expect(database.pool.query(
      "DELETE FROM core.run WHERE run_id=$1", [runId]
    )).rejects.toThrow();
  });

  /**
   * T6 r3 · F-T6-6 — these rows once hard-coded `created_at_seq` in the 10 000s.
   * `ledger.allocate_sequence()` is a monotonic counter shared by the whole
   * file, so those literals were a LANDMINE: the moment the file's own
   * allocations reached 10 001, every later `startRun` in this file died on
   * `run_created_at_seq_key`, at setup, in a test that had nothing to do with
   * this one. The headroom was small enough that adding a single production
   * scenario tripped it (23 tests, all at setup). Nothing here asserts on the
   * numbers — they only had to be unique — so they now come from the allocator
   * like every other row, and the cliff is gone rather than moved.
   */
  it("round-trips ASK ER and policy-raise carriers and rejects a policy lowering", async () => {
    const asker = await database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count, discovered_panel,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('a','a','s','ASKER',now(),'casual','casual','ASKER','asker:a','low','{}',1,'[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',1,'{}',1,'s00',ledger.allocate_sequence())
      RETURNING tier_source, tier_provenance_ref
    `);
    expect(asker.rows[0]).toEqual({ tier_source: "ASKER", tier_provenance_ref: "asker:a" });
    const machineDefault = await database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count, discovered_panel,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('machine','machine','s','ASKER',now(),'standard','standard','MACHINE_DEFAULT','machine:deployment-floor','low','{}',1,'[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',1,'{}',1,'s00',ledger.allocate_sequence())
      RETURNING tier_source, tier_provenance_ref
    `);
    expect(machineDefault.rows[0]).toEqual({
      tier_source: "MACHINE_DEFAULT",
      tier_provenance_ref: "machine:deployment-floor"
    });
    await expect(database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count, discovered_panel,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('asker-raised','asker-raised','s','ASKER',now(),'casual','high-stakes','ASKER','asker:raised','low','{}',1,'[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',1,'{}',1,'s00',ledger.allocate_sequence())
    `)).rejects.toThrow();
    await expect(database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count, discovered_panel,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('machine-raised','machine-raised','s','ASKER',now(),'casual','high-stakes','MACHINE_DEFAULT','machine:deployment-floor','low','{}',1,'[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',1,'{}',1,'s00',ledger.allocate_sequence())
    `)).rejects.toThrow();
    await expect(database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count, discovered_panel,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('machine-lowered','machine-lowered','s','ASKER',now(),'high-stakes','casual','MACHINE_DEFAULT','machine:deployment-floor','low','{}',1,'[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',1,'{}',1,'s00',ledger.allocate_sequence())
    `)).rejects.toThrow();
    const raised = await database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count, discovered_panel,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('b','b','s','ASKER',now(),'casual','standard','DEPLOYMENT_POLICY','asker:b','low','{}',1,'[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',1,'{}',1,'s00',ledger.allocate_sequence())
      RETURNING tier_source, tier_provenance_ref
    `);
    expect(raised.rows[0]).toEqual({ tier_source: "DEPLOYMENT_POLICY", tier_provenance_ref: "asker:b" });
    await expect(database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count, discovered_panel,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('c','c','s','ASKER',now(),'standard','casual','DEPLOYMENT_POLICY','asker:c','low','{}',1,'[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',1,'{}',1,'s00',ledger.allocate_sequence())
    `)).rejects.toThrow();
    await expect(database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count, discovered_panel,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('d','d','s','ASKER',now(),'casual','standard','DERIVED','asker:d','low','{}',1,'[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',1,'{}',1,'s00',ledger.allocate_sequence())
    `)).rejects.toThrow();
  });
});

describe("P11 / ADR-0017 — claim discipline", () => {
  it("commits a SKIP LOCKED claim before the provider callback", async () => {
    const work = new WorkItemRepository(database.pool);
    const itemId = await work.enqueue({
      runId: null,
      batteryRowId: "Q1",
      nodeSet: ["node:test"],
      commandKey: "command:test"
    });
    const claimed = await work.claimNext({ workerId: "worker:test", claimSeconds: 30 });
    expect(claimed?.workItemId).toBe(itemId);
    const visibleFromAnotherConnection = await database.pool.query<{ state: string }>(
      "SELECT state FROM core.work_item WHERE work_item_id = $1",
      [itemId]
    );
    expect(visibleFromAnotherConnection.rows[0]?.state).toBe("CLAIMED");
  });
});

describe("P7 — graph aggregate write seam", () => {
  it("serializes graph writes with an advisory lock and materialises an immutable one-node snapshot", async () => {
    const run = new RunRepository(database.pool);
    const runId = await run.startRun({
      questionLine: "Graph aggregate fixture",
      principal: { kind: "legacy", legacyAskerId: "asker:graph" },
      sessionId: "session:graph",
      callerScope: "ASKER",
      asOf: new Date("2026-08-07T00:00:00.000Z"),
      askerRiskTier: "casual",
      effectiveRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "asker-declaration:graph",
      compositionBudgetTier: "low",
      depthParams: { depth: 1 },
      discoveredPanel: fixtureDiscoveredPanel(1),
      strangerSampleRate: 1,
      envelopeBasis: { key: "graph-envelope" },
      registerVersion: 1,
      batteryVersion: "s00",
      batteryRows
    });
    const graph = new GraphRepository(database.pool);
    await new LedgerRepository(database.pool).appendRawArtifact({
      artifactId: "00000000-0000-4000-8000-000000000001",
      attemptId: "00000000-0000-4000-8000-000000000002",
      runId,
      providerRef: "provider:test",
      provider: "test-layer-http",
      model: "fixture/model",
      maker: "fixture",
      modelVersion: "fixture-version",
      rawText: "test-layer artifact",
      metadata: {},
      parseStatus: "UNPARSED",
      inputHash: "1".repeat(64),
      contractHash: "2".repeat(64),
      contentHash: "0".repeat(64)
    });
    const nodeId = await graph.withGraphWrite(runId, (writer) => writer.addNode({
      runId,
      statementText: "One judged statement",
      claimType: "unknown",
      parentNodeId: null,
      childKind: null,
      siblingOrdinal: 0,
      generationStatus: "complete",
      pathStatus: "active",
      explorationDecision: "continue",
      provenanceRef: "00000000-0000-4000-8000-000000000001",
      wayOfKnowing: "REASONING",
      locator: null,
      valueLaden: false
    }));
    await new JudgementRepository(database.pool).record({
      runId,
      nodeId,
      rawArtifactRef: "00000000-0000-4000-8000-000000000001",
      tau: 0.72,
      numberKind: "probability",
      producer: "judgement:test-layer",
      wayOfKnowing: "REASONING"
    });
    const snapshot = await graph.materialiseSnapshot(runId);
    expect(snapshot.nodes).toEqual([expect.objectContaining({ nodeId, baseStrength: 0.72 })]);
    expect(snapshot.arrows).toEqual([]);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});

describe("FX-LG-02 / FX-LED-04 — append-only ordered ledger", () => {
  it("allocates a database total order and carries both action stamps", async () => {
    const ledger = new LedgerRepository(database.pool);
    const first = await ledger.append({
      runId: null,
      actionKind: "MODEL_CALL",
      callSiteKey: "TEST:LEDGER",
      subjectItemId: "node:test",
      stanceAtAction: "UNASSIGNED",
      outcome: "OK",
      actorRef: "provider:test",
      inputHash: "input:test",
      contractHash: "contract:test",
      startedAt: new Date("2026-08-07T00:00:00.000Z"),
      finishedAt: new Date("2026-08-07T00:00:01.000Z")
    });
    const second = await ledger.append({
      runId: null,
      actionKind: "PROPAGATION",
      subjectItemId: "node:test",
      stanceAtAction: "NEUTRAL",
      outcome: "OK",
      actorRef: "propagation",
      inputHash: "input:propagation",
      contractHash: "contract:propagation",
      startedAt: new Date("2026-08-07T00:00:01.000Z"),
      finishedAt: new Date("2026-08-07T00:00:02.000Z")
    });
    expect(second.sequence).toBeGreaterThan(first.sequence);
    expect(first).toMatchObject({ subjectItemId: "node:test", stanceAtAction: "UNASSIGNED" });
    await expect(database.pool.query("UPDATE ledger.ledger_entry SET outcome = 'FAILED' WHERE sequence = $1", [first.sequence])).rejects.toThrow();
    await expect(database.pool.query("DELETE FROM ledger.ledger_entry WHERE sequence = $1", [first.sequence])).rejects.toThrow();
    const correction = await ledger.append({
      runId: null,
      actionKind: "MODEL_CALL",
      callSiteKey: "TEST:LEDGER:CORRECTION",
      subjectItemId: "node:test",
      stanceAtAction: "UNASSIGNED",
      outcome: "FAILED",
      actorRef: "provider:test",
      inputHash: "input:test",
      contractHash: "contract:test",
      startedAt: new Date("2026-08-07T00:00:02.000Z"),
      finishedAt: new Date("2026-08-07T00:00:03.000Z")
    });
    const outcomes = await database.pool.query<{ sequence: string; outcome: string }>(
      `SELECT sequence::text, outcome FROM ledger.ledger_entry
       WHERE sequence = ANY($1::bigint[]) ORDER BY sequence`,
      [[first.sequence, correction.sequence]]
    );
    expect(outcomes.rows).toEqual([
      { sequence: String(first.sequence), outcome: "OK" },
      { sequence: String(correction.sequence), outcome: "FAILED" }
    ]);
    expect(correction.sequence).toBeGreaterThan(first.sequence);
  });

  it("FX-LED-04 carries both stamps across the full S01 action vocabulary", async () => {
    const ledger = new LedgerRepository(database.pool);
    for (const [index, actionKind] of [
      "MODEL_CALL", "JUDGEMENT_SCHEDULED", "PROPAGATION", "SERVE", "provider-specific-check"
    ].entries()) {
      const now = new Date();
      const row = await ledger.append({
        runId: null, actionKind, ...(actionKind === "MODEL_CALL" ? { callSiteKey: `TEST:${index}` } : {}),
        subjectItemId: `item:${index}`, stanceAtAction: "UNASSIGNED", outcome: "OK",
        actorRef: "fixture:S01", inputHash: `input:${index}`, contractHash: `contract:${index}`,
        startedAt: now, finishedAt: now
      });
      expect(row).toMatchObject({ subjectItemId: `item:${index}`, stanceAtAction: "UNASSIGNED" });
    }
    const unclassified = await database.pool.query<{ action_kind: string; call_site_key: string }>(
      "SELECT action_kind, call_site_key FROM ledger.ledger_entry WHERE call_site_key='provider-specific-check'"
    );
    expect(unclassified.rows[0]).toEqual({
      action_kind: "UNCLASSIFIED_ACTION", call_site_key: "provider-specific-check"
    });
  });
});

describe("S01 ledger hardening", () => {
  it("FX-LED-05 persists the input/contract/content hash triple on a raw artifact", async () => {
    const runId = await createRun(`fx-led-05-${randomUUID()}`);
    const artifactId = randomUUID();
    const supersedingArtifactId = randomUUID();
    await new LedgerRepository(database.pool).appendRawArtifact({
      artifactId, attemptId: randomUUID(), runId, providerRef: "provider:test",
      provider: "test-layer-http", model: "fixture/model", maker: "fixture", modelVersion: null,
      rawText: "labeled test-layer artifact", metadata: {}, parseStatus: "UNPARSED",
      inputHash: "a".repeat(64), contractHash: "b".repeat(64), contentHash: "c".repeat(64)
    });
    await new LedgerRepository(database.pool).appendRawArtifact({
      artifactId: supersedingArtifactId, attemptId: randomUUID(), runId, providerRef: "provider:test",
      provider: "test-layer-http", model: "fixture/model", maker: "fixture", modelVersion: null,
      rawText: "labeled test-layer artifact", metadata: {}, parseStatus: "UNPARSED",
      inputHash: "a".repeat(64), contractHash: "d".repeat(64), contentHash: "c".repeat(64)
    });
    const result = await database.pool.query(
      `SELECT input_hash, contract_hash, content_hash FROM ledger.raw_artifact
       WHERE raw_artifact_id = ANY($1::uuid[]) ORDER BY contract_hash`,
      [[artifactId, supersedingArtifactId]]
    );
    expect(result.rows).toEqual([
      { input_hash: "a".repeat(64), contract_hash: "b".repeat(64), content_hash: "c".repeat(64) },
      { input_hash: "a".repeat(64), contract_hash: "d".repeat(64), content_hash: "c".repeat(64) }
    ]);
    await expect(database.pool.query(
      "UPDATE ledger.raw_artifact SET contract_hash=$2 WHERE raw_artifact_id=$1",
      [artifactId, "e".repeat(64)]
    )).rejects.toThrow();
    await expect(database.pool.query(
      "DELETE FROM ledger.raw_artifact WHERE raw_artifact_id=$1", [artifactId]
    )).rejects.toThrow();
  });

  it("FX-LED-01a refuses propagation for a scheduled item with no artifact", async () => {
    const work = await createRunnerWork("missing-required-artifact");
    const ledger = new LedgerRepository(database.pool);
    const now = new Date();
    await ledger.append({
      runId: work.runId, actionKind: "JUDGEMENT_SCHEDULED", subjectItemId: work.workItemId,
      stanceAtAction: "UNASSIGNED", outcome: "OK", actorRef: "runner:test",
      inputHash: "input:scheduled", contractHash: "contract:scheduled", startedAt: now, finishedAt: now
    });
    await expect(ledger.recordPropagation({
      runId: work.runId, inputHash: "input:propagation", contractHash: "contract:propagation",
      graphFingerprint: "graph:fingerprint", arrowOrder: [], clusterRecords: [], operatorResolutions: [],
      transmissionReductions: [], liftRecords: [], judgementSelectionRule: { kind: "ONLY_PERSISTED_JUDGEMENT" }, strengths: []
    })).rejects.toMatchObject({ code: "COMPLETENESS_GATE_FAILED" });
    const count = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM ledger.propagation_run WHERE run_id=$1", [work.runId]
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  it("FX-LED-01b accepts an unparseable-but-persisted artifact", async () => {
    const work = await createRunnerWork("unparseable-required-artifact");
    const ledger = new LedgerRepository(database.pool);
    const attemptId = randomUUID();
    const artifactId = randomUUID();
    await ledger.appendRawArtifact({
      artifactId, attemptId, runId: work.runId, providerRef: "provider:test", provider: "test-layer-http",
      model: "fixture/model", maker: "fixture", modelVersion: null, rawText: "not-json", metadata: {},
      parseStatus: "UNPARSED", inputHash: "d".repeat(64), contractHash: "e".repeat(64), contentHash: "f".repeat(64)
    });
    const now = new Date();
    await ledger.append({
      runId: work.runId, actionKind: "JUDGEMENT_SCHEDULED", subjectItemId: work.workItemId,
      stanceAtAction: "UNASSIGNED", outcome: "OK", actorRef: "runner:test",
      inputHash: "input:scheduled", contractHash: "contract:scheduled", startedAt: now, finishedAt: now
    });
    await ledger.append({
      runId: work.runId, attemptId, actionKind: "MODEL_CALL", callSiteKey: "JUDGE",
      subjectItemId: work.workItemId, stanceAtAction: "UNASSIGNED", outcome: "FAILED", actorRef: "provider:test",
      inputHash: "input:model", contractHash: "contract:model", rawArtifactRef: artifactId,
      startedAt: now, finishedAt: now
    });
    const propagationRunId = await ledger.recordPropagation({
      runId: work.runId, inputHash: "input:propagation", contractHash: "contract:propagation",
      graphFingerprint: "graph:fingerprint", arrowOrder: [], clusterRecords: [], operatorResolutions: [],
      transmissionReductions: [], liftRecords: [], judgementSelectionRule: { kind: "ONLY_PERSISTED_JUDGEMENT" }, strengths: []
    });
    expect(propagationRunId).toMatch(/[0-9a-f-]{36}/);
  });

  it("FX-LED-02 exposes four reconstruction paths and none invents a score", async () => {
    const work = await createRunnerWork("reconstruction-refusal");
    const ledger = new LedgerRepository(database.pool);
    const now = new Date();
    await ledger.append({
      runId: work.runId, actionKind: "JUDGEMENT_SCHEDULED", subjectItemId: work.workItemId,
      stanceAtAction: "UNASSIGNED", outcome: "OK", actorRef: "runner:test",
      inputHash: "input:scheduled", contractHash: "contract:scheduled", startedAt: now, finishedAt: now
    });
    await expect(ledger.rebuildFromArtifacts(work.runId)).rejects.toMatchObject({ code: "RECONSTRUCTION_INPUT_MISSING" });
    await expect(ledger.readStoredResultVerbatim(work.runId)).rejects.toMatchObject({ code: "STORED_RESULT_MISSING" });
    await expect(ledger.assertComplete(work.runId)).rejects.toMatchObject({ code: "COMPLETENESS_GATE_FAILED" });
    expect(await ledger.resumePartial(work.runId)).toEqual({ ready: [], missingSubjectItemIds: [work.workItemId] });
  });
});

describe("FX-REG-01 — database/file equality over all five pins", () => {
  it("loads the same five values from the bootstrap file and register version 1", async () => {
    const bootstrap = await loadBootstrapRegister();
    await persistBootstrapRegister(database.pool, bootstrap);
    await assertBootstrapEquality(database.pool, bootstrap);
  });
});

describe("FX-LG-16 / DR-128 — claim-type composition register carrier", () => {
  it("rejects the wrong member shape and reads a test-layer row through the canonical reader", async () => {
    const registerVersion = 404_128;
    await expect(database.pool.query(
      `INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [registerVersion, CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY, JSON.stringify({ kind: "CLAIM_TYPE_COMPOSITION_MAP", entries: { unknown: { branch: "EVIDENCE_AWARE" } } }), "test-layer:DR-128:invalid"]
    )).rejects.toThrow();

    const testLayerValue = runnerSettings().compositionRow!.value;
    await database.pool.query(
      `INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [registerVersion, CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY, JSON.stringify(testLayerValue), "test-layer:DR-128:valid"]
    );
    await expect(readClaimTypeCompositionMap(database.pool, registerVersion)).resolves.toMatchObject({
      rowKey: CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY,
      registerVersion,
      sourceRef: "test-layer:DR-128:valid",
      value: { kind: "CLAIM_TYPE_COMPOSITION_MAP" }
    });
  });
});

describe("apps/runner — legal command lifecycle", () => {
  it("uses the first healthy handshake when the first configured CLI is absent", async () => {
    const absentPrimary = await startProviderDouble([]);
    const healthySecondary = await startProviderDouble([
      judgementDouble("The surviving real CLI authors the primary position", 0.4),
      resil01Composition,
      evaluatorSatisfied()
    ]);
    try {
      const question = `claim-primary-reselection-${randomUUID()}`;
      const secondaryMember = fixtureDiscoveredPanel(2)[1]!;
      const runId = await new RunRepository(database.pool).startRun({
        questionLine: question,
        principal: { kind: "legacy", legacyAskerId: `asker:${question}` },
        sessionId: `session:${question}`,
        callerScope: "ASKER",
        asOf: new Date("2026-08-07T00:00:00.000Z"),
        askerRiskTier: "casual",
        effectiveRiskTier: "casual",
        tierSource: "ASKER",
        tierProvenanceRef: `asker-declaration:${question}`,
        compositionBudgetTier: "low",
        depthParams: { depth: 1 },
        discoveredPanel: [secondaryMember],
        strangerSampleRate: 1,
        envelopeBasis: fixtureStructuralCeiling(10, 1, 1),
        registerVersion: 1,
        batteryVersion: "s00",
        batteryRows
      });
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId,
        batteryRowId: "Q1",
        nodeSet: [],
        commandKey: `runner-test:${question}`
      });
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: absentPrimary.endpoint,
        model: "test-layer/primary-model",
        maker: "Primary test maker"
      }), {
        ...runnerSettings(),
        maker: "Primary test maker",
        critique: {
          provider: createPostgresProviderGateway(database.pool, {
            endpoint: healthySecondary.endpoint,
            model: "test-layer/secondary-model",
            maker: "Secondary test maker"
          }),
          providerRef: secondaryMember.provider_ref,
          maker: secondaryMember.maker
        },
        scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" },
        // T9/J8: the sealed role refs name a CONFIGURED PROVIDER IDENTITY and are
        // resolved by lookup, never by health — so on a deployment whose primary
        // is absent, the rows must name the provider that actually holds the
        // roles. Substituting a healthy provider for the sealed one is exactly
        // what the sealed row exists to prevent, so the fixture states the
        // identity rather than expecting the runner to guess it.
        synthesisRolePolicy: {
          ...runnerSettings().synthesisRolePolicy!,
          synthesizerRoleRef: secondaryMember.provider_ref,
          evaluatorRoleRef: secondaryMember.provider_ref
        }
      });

      await expect(runner.executeWorkItem(workItemId)).resolves.toMatchObject({ kind: "COMPLETED" });
      expect(absentPrimary.calls()).toBe(0);
      // T9: a served run makes THREE model calls now — judge, SYNTHESIZER,
      // EVALUATOR — where it used to make five (judge, composer, two
      // conformance segments, post-compose R9). The two retired organs are
      // one evaluator call, and a satisfied evaluator ends the loop in round 1.
      expect(healthySecondary.calls()).toBe(3);
    } finally {
      await healthySecondary.stop();
      await absentPrimary.stop();
    }
  });

  it("re-probes once at claim, records a missing pinned member, shrinks, discloses, and serves", async () => {
    const provider = await startProviderDouble([judgementDouble("Claim-time surviving position", 0.4)]);
    try {
      const runId = await createRun("claim-panel-revision", 1, 2);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId, batteryRowId: "Q1", nodeSet: [], commandKey: "runner-test:claim-panel-revision"
      });
      let claimProbeCalls = 0;
      const runner = runnerWithEndpoint(provider.endpoint, {
        ...runnerSettings(),
        claimTimeProbe: async (member) => {
          claimProbeCalls += 1;
          return { state: "HEALTHY", modelId: member.model_id, failureCode: null };
        }
      });

      const result = await runner.executeWorkItem(workItemId);
      expect(result.kind).toBe("COMPLETED");
      expect(claimProbeCalls).toBe(1);
      expect(provider.calls()).toBe(1);
      const absent = await database.pool.query<{ state: string; failure_code: string }>(
        `SELECT state, failure_code FROM core.provider_probe
         WHERE provider_ref='provider:test-layer:secondary' ORDER BY probed_at DESC LIMIT 1`
      );
      expect(absent.rows[0]).toEqual({ state: "ABSENT", failure_code: "CLAIM_GATEWAY_UNRESOLVED" });
      if (result.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");
      const projection = await new ServeRepository(database.pool).readAnswerProjection(
        result.answerId, "asker:claim-panel-revision"
      );
      expect(projection?.condition_mark_records).toContainEqual(expect.objectContaining({
        mark: "CRITIQUE-UNAVAILABLE",
        reason: expect.stringContaining("CLAIM_PANEL_REVISED:provider:test-layer:secondary=CLAIM_GATEWAY_UNRESOLVED")
      }));
      expect(projection?.condition_marks.filter((mark) => mark === "CRITIQUE-UNAVAILABLE")).toHaveLength(1);
    } finally { await provider.stop(); }
  });

  it("records a failed claim-time re-probe and stops loudly only when the effective panel is empty", async () => {
    const provider = await startProviderDouble([]);
    try {
      const runId = await createRun("claim-panel-empty", 10, 1);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId, batteryRowId: "Q1", nodeSet: [], commandKey: "runner-test:claim-panel-empty"
      });
      let claimProbeCalls = 0;
      const runner = runnerWithEndpoint(provider.endpoint, {
        ...runnerSettings(),
        claimTimeProbe: async () => {
          claimProbeCalls += 1;
          return { state: "ABSENT", modelId: null, failureCode: "CLAIM_PROBE_TRANSPORT_FAILED" };
        }
      });

      await expect(runner.executeWorkItem(workItemId)).rejects.toMatchObject({
        code: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM"
      });
      expect(claimProbeCalls).toBe(1);
      expect(provider.calls()).toBe(0);
      const absent = await database.pool.query<{ state: string; failure_code: string }>(
        `SELECT state, failure_code FROM core.provider_probe
         WHERE provider_ref='provider:test-layer' ORDER BY probed_at DESC LIMIT 1`
      );
      expect(absent.rows[0]).toEqual({ state: "ABSENT", failure_code: "CLAIM_PROBE_TRANSPORT_FAILED" });
    } finally { await provider.stop(); }
  });

  it("refuses beyond-max depth-6 M=2 with RUN_DEPTH_PARAMS_INVALID before persisting any model call", async () => {
    // DR-172 ratifies coverage for depths 1..5, so DR-157's depth bound is
    // now the first guard a beyond-table depth meets; the load-bearing
    // property stays: typed refusal, zero spend.
    const primary = await startProviderDouble([]);
    const secondary = await startProviderDouble([]);
    try {
      const runId = await createRun("xrev-01-depth-6-envelope-refusal", 204, 2, 6);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId,
        batteryRowId: "Q1",
        nodeSet: [],
        commandKey: "runner-test:xrev-01-depth-6-envelope-refusal"
      });
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: primary.endpoint,
        model: "test-layer/primary-model",
        maker: "Primary test maker"
      }), {
        ...runnerSettings(),
        maker: "Primary test maker",
        critique: {
          provider: createPostgresProviderGateway(database.pool, {
            endpoint: secondary.endpoint,
            model: "test-layer/secondary-model",
            maker: "Secondary test maker"
          }),
          providerRef: "provider:test-layer:secondary",
          maker: "Secondary test maker"
        },
        scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" }
      });

      await expect(runner.executeWorkItem(workItemId)).rejects.toMatchObject({
        code: "RUN_DEPTH_PARAMS_INVALID"
      });
      expect(primary.calls()).toBe(0);
      expect(secondary.calls()).toBe(0);
      const calls = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL'",
        [runId]
      );
      expect(calls.rows[0]?.count).toBe("0");
    } finally {
      await secondary.stop();
      await primary.stop();
    }
  });

  it("calls the depth guard for a mono-maker run before persisting any model call", async () => {
    const provider = await startProviderDouble([]);
    try {
      const runId = await createRun("xrev-01-depth-6-mono-envelope-refusal", 780, 1, 6);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId,
        batteryRowId: "Q1",
        nodeSet: [],
        commandKey: "runner-test:xrev-01-depth-6-mono-envelope-refusal"
      });

      await expect(runnerWithEndpoint(provider.endpoint).executeWorkItem(workItemId)).rejects.toMatchObject({
        code: "RUN_DEPTH_PARAMS_INVALID"
      });
      expect(provider.calls()).toBe(0);
      const calls = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL'",
        [runId]
      );
      expect(calls.rows[0]?.count).toBe("0");
    } finally {
      await provider.stop();
    }
  });

  it("runs a depth-2 two-maker tree and preserves the single-root disclosure at envelope terminal", async () => {
    // T10 / codex r2 B1: the provider double is CLASS-KEYED, so each queue's first
    // JUDGE entry is that maker's ROOT. The two roots MUST end up strictly
    // unequal, with the FIRST-CONFIGURED one WEAKER — otherwise the served-root
    // oracle below cannot tell the live max-strength selector from the retired
    // provider-order rule (a tied first root satisfies both), and the lawful
    // lexicographic tiebreak makes the winner depend on which random UUID sorts
    // first. Both defects were live in the r2 version of this fixture.
    const WEAK_FIRST_CONFIGURED_ROOT = 0.3;
    const STRONG_SECOND_CONFIGURED_ROOT = 0.9;
    const primary = await startProviderDouble(
      [
        judgementDouble("Primary maker position 1", WEAK_FIRST_CONFIGURED_ROOT),
        ...Array.from({ length: 7 }, (_, index) => judgementDouble(`Primary maker position ${index + 2}`)),
        ...Array.from({ length: 8 }, (_, index) => reviewDouble("agree", `Primary review ${index + 1}`))
      ]
    );
    const secondary = await startProviderDouble(
      [
        judgementDouble("Secondary maker position 1", STRONG_SECOND_CONFIGURED_ROOT),
        ...Array.from({ length: 7 }, (_, index) => judgementDouble(`Secondary maker position ${index + 2}`)),
        ...Array.from({ length: 8 }, (_, index) => reviewDouble("dispute", `Secondary review ${index + 1}`))
      ]
    );
    try {
      // Sixteen authored calls plus one cross-maker review per authored node
      // plus — since T3/S2-2 — one PANEL assessment per authored node from the
      // single non-author maker (M=2 ⇒ M−1 = 1) exactly fill this test-layer
      // envelope: 16 + 16 + 16 = 48.
      // The serve gate therefore takes its real envelope-terminal path with
      // zero composer/conformance calls and zero external model calls.
      // J12 coherence: the pinned ceiling is provisioning; every assertion in
      // this fixture — including ENVELOPE_EXHAUSTED — is unchanged.
      const runId = await createRun("hyg-01-depth-2-two-maker", 48, 2, 2);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId,
        batteryRowId: "Q1",
        nodeSet: [],
        commandKey: "runner-test:hyg-01-depth-2-two-maker"
      });
      const primaryGateway = createPostgresProviderGateway(database.pool, {
        endpoint: primary.endpoint,
        model: "test-layer/primary-model",
        maker: "Primary test maker"
      });
      const secondaryGateway = createPostgresProviderGateway(database.pool, {
        endpoint: secondary.endpoint,
        model: "test-layer/secondary-model",
        maker: "Secondary test maker"
      });
      const runner = new WalkingSkeletonRunner(database.pool, primaryGateway, {
        ...runnerSettings(),
        critique: {
          provider: secondaryGateway,
          providerRef: "provider:test-layer:secondary",
          maker: "Secondary test maker"
        },
        scoringOperator: {
          deploymentRowValue: "accumulate",
          registerRef: "test-layer:DR-144"
        }
      });

      const result = await runner.executeWorkItem(workItemId);
      expect(result.kind).toBe("COMPLETED");
      // T3/S2-2 + J12 — DISCLOSED DEVIATION from "assertions unchanged", and the only
      // one in this file. These two numbers are per-provider CALL COUNTS, and a new
      // lawful call class necessarily moves them: across 16 nodes split 8/8 between the
      // two makers, each provider now serves its 16 original legs plus 8 panel
      // assessments of the OTHER maker's nodes (M−1 = 1 per authored node) = 24.
      // The fixture's SUBJECT is untouched: still 16 nodes, still the real
      // envelope-terminal path, still the single-root disclosure — all asserted below.
      expect(primary.calls()).toBe(24);
      expect(secondary.calls()).toBe(24);

      const nodes = await database.pool.query<{ node_id: string }>(
        "SELECT node_id FROM core.node WHERE run_id=$1 ORDER BY created_at_seq",
        [runId]
      );
      // Kills both `if (leg.round > 1) break` and hard-coded depth 1: each
      // mutation leaves only eight nodes and removes every r2 call site.
      expect(nodes.rows).toHaveLength(16);
      const expansionCalls = await database.pool.query<{ call_site_key: string }>(
        `SELECT call_site_key FROM ledger.ledger_entry
         WHERE run_id=$1 AND action_kind='MODEL_CALL' AND call_site_key LIKE 'JUDGE:%:root%:r%'
         ORDER BY call_site_key`,
        [runId]
      );
      expect(expansionCalls.rows.filter((row) => row.call_site_key.includes(":r1:"))).toHaveLength(4);
      expect(expansionCalls.rows.filter((row) => row.call_site_key.includes(":r2:"))).toHaveLength(8);

      const reviews = await database.pool.query<{
        node_id: string;
        author_maker: string;
        reviewer_maker: string;
        outcome: string;
      }>(
        `SELECT review.node_id, author.maker AS author_maker,
                reviewer.maker AS reviewer_maker, review.outcome
         FROM ledger.node_review AS review
         JOIN ledger.raw_artifact AS author ON author.raw_artifact_id=review.author_raw_artifact_ref
         JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id=review.review_raw_artifact_ref
         WHERE review.run_id=$1 ORDER BY review.at_seq`,
        [runId]
      );
      // Kills removal of the review loop, hard-coded partial coverage, or a
      // selector mutation from `!==` to `===`.
      expect(reviews.rows).toHaveLength(16);
      expect(reviews.rows.every((row) => row.author_maker !== row.reviewer_maker)).toBe(true);
      expect(new Set(reviews.rows.map((row) => row.outcome))).toEqual(new Set(["agree", "dispute"]));
      expect(await new JudgementRepository(database.pool).readLatestReviewerMaker(
        runId,
        reviews.rows[0]!.author_maker
      )).toBe(reviews.rows.filter((row) => row.author_maker === reviews.rows[0]!.author_maker).at(-1)!.reviewer_maker);

      const firstNode = await database.pool.query<{ node_id: string; provenance_ref: string }>(
        `SELECT node_id, provenance_ref::text FROM core.node WHERE run_id=$1 ORDER BY created_at_seq LIMIT 1`,
        [runId]
      );
      await expect(recordNodeReviewAlone(database.pool, {
        runId,
        nodeId: firstNode.rows[0]!.node_id,
        authorRawArtifactRef: firstNode.rows[0]!.provenance_ref,
        reviewRawArtifactRef: firstNode.rows[0]!.provenance_ref,
        outcome: "agree",
        reasons: ["mutation probe"]
      })).rejects.toThrow(/PRODUCER_GRADING_FORBIDDEN/);

      if (result.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");
      const projection = await new ServeRepository(database.pool)
        .readAnswerProjection(result.answerId, "asker:hyg-01-depth-2-two-maker");
      // Kills the PANEL-01 call-site regression that replaces rather than
      // appends envelope-terminal records.
      expect(projection?.condition_marks).toEqual(expect.arrayContaining([
        "UNSERVED-MAKER-POSITION",
        "ENVELOPE_EXHAUSTED"
      ]));
      const unservedRecord = projection?.condition_mark_records.find(
        (record) => record.mark === "UNSERVED-MAKER-POSITION"
      );
      // T10 (codex r1 B2, corrected per codex r2 B1): the record carries the LIVE
      // rule AND its subject is the STRICTLY strongest root, read from the run's
      // own node_strength_record. Roots are ordered by creation, so the first row
      // is the FIRST-CONFIGURED maker's root.
      expect(unservedRecord).toMatchObject({
        served_root_rule: "max-propagated-strength-lexicographic-tiebreak"
      });
      const rootStrengthRows = await database.pool.query<{ node_id: string; strength: string }>(
        `SELECT strength.node_id, strength.strength::text
           FROM ledger.node_strength_record AS strength
           JOIN ledger.propagation_run AS propagation
             ON propagation.propagation_run_id = strength.propagation_run_id
           JOIN core.node AS node ON node.node_id = strength.node_id
          WHERE propagation.run_id = $1 AND node.parent_node_id IS NULL
          ORDER BY node.created_at_seq`,
        [runId]
      );
      expect(rootStrengthRows.rowCount).toBe(2);
      const firstConfiguredRoot = {
        nodeId: rootStrengthRows.rows[0]!.node_id,
        strength: Number(rootStrengthRows.rows[0]!.strength)
      };
      const secondConfiguredRoot = {
        nodeId: rootStrengthRows.rows[1]!.node_id,
        strength: Number(rootStrengthRows.rows[1]!.strength)
      };

      // (1) THE PIN, asserted BEFORE the winner assertion. If a fixture change
      //     ever re-ties the roots, this fails here — loudly — instead of
      //     silently disarming everything below it, which is exactly what the r2
      //     version of this oracle did.
      expect(secondConfiguredRoot.strength).toBeGreaterThan(firstConfiguredRoot.strength);

      // (2) The served root is the STRICT winner, which is NOT the first
      //     configured one. A selector that went back to provider order serves
      //     `firstConfiguredRoot` and fails here; the lexicographic tiebreak
      //     cannot decide this run, because there is no tie to break.
      expect(unservedRecord?.subject_ref).toBe(secondConfiguredRoot.nodeId);
      expect(unservedRecord?.subject_ref).not.toBe(firstConfiguredRoot.nodeId);

      // (3) The disclosure names BOTH roots by the ids the strengths gave us —
      //     never by a hard-coded maker name, which under the lawful tiebreak
      //     depended on which random UUID happened to sort first.
      expect(unservedRecord?.reason).toContain(secondConfiguredRoot.nodeId);
      expect(unservedRecord?.reason).toContain(firstConfiguredRoot.nodeId);
      expect(unservedRecord?.affected_node_ids).toEqual(
        expect.arrayContaining([firstConfiguredRoot.nodeId, secondConfiguredRoot.nodeId])
      );
      expect(projection?.nodes).toHaveLength(16);
      expect(projection?.nodes.every((node) => node.review !== null)).toBe(true);
      // If the shipped served-node set is widened to both roots, the same
      // fixture fails typed-loud at FIXED_SINGLE_ROOT_SERVE_VIOLATED.
      expect(projection?.number_slots.filter((slot) => slot.status === "PRESENT")).toHaveLength(0);
    } finally {
      await secondary.stop();
      await primary.stop();
    }
  });

  it("wires the latest persisted reviewer into three-maker rotation on real PostgreSQL", async () => {
    const makerA = await startProviderDouble([
      ...Array.from({ length: 5 }, (_, index) => judgementDouble(`Rotation A position ${index + 1}`)),
      ...Array.from({ length: 15 }, (_, index) => reviewDouble("agree", `Rotation A review ${index + 1}`))
    ]);
    const makerB = await startProviderDouble([
      ...Array.from({ length: 5 }, (_, index) => judgementDouble(`Rotation B position ${index + 1}`)),
      ...Array.from({ length: 15 }, (_, index) => reviewDouble("dispute", `Rotation B review ${index + 1}`))
    ]);
    const makerC = await startProviderDouble([
      ...Array.from({ length: 5 }, (_, index) => judgementDouble(`Rotation C position ${index + 1}`)),
      ...Array.from({ length: 15 }, (_, index) => reviewDouble("cannot-assess", `Rotation C review ${index + 1}`))
    ]);
    try {
      // J12 coherence: at M=3 each authored node draws two PANEL assessments
      // (M−1). The envelope is provisioning here, not this fixture's subject —
      // the subject is reviewer ROTATION — so the ceiling is raised to keep the
      // rotation reachable. Assertions unchanged.
      const runId = await createRun("grok-01-three-maker-review-rotation", 60, 3, 1);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId,
        batteryRowId: "Q1",
        nodeSet: [],
        commandKey: "runner-test:grok-01-three-maker-review-rotation"
      });
      const gatewayA = createPostgresProviderGateway(database.pool, {
        endpoint: makerA.endpoint, model: "test-layer/rotation-a", maker: "Rotation maker A"
      });
      const gatewayB = createPostgresProviderGateway(database.pool, {
        endpoint: makerB.endpoint, model: "test-layer/rotation-b", maker: "Rotation maker B"
      });
      const gatewayC = createPostgresProviderGateway(database.pool, {
        endpoint: makerC.endpoint, model: "test-layer/rotation-c", maker: "Rotation maker C"
      });
      const runner = new WalkingSkeletonRunner(database.pool, gatewayA, {
        ...runnerSettings(),
          providerRef: "provider:test-layer",
        maker: "Rotation maker A",
        critique: {
          provider: gatewayB,
          providerRef: "provider:test-layer:secondary",
          maker: "Rotation maker B"
        },
        additionalMakers: [{
          provider: gatewayC,
          providerRef: "provider:test-layer:third",
          maker: "Rotation maker C"
        }],
        scoringOperator: {
          deploymentRowValue: "accumulate",
          registerRef: "test-layer:DR-144"
        },
      });

      await expect(runner.executeWorkItem(workItemId)).resolves.toMatchObject({ kind: "COMPLETED" });
      const reviews = await database.pool.query<{ author_maker: string; reviewer_maker: string }>(
        `SELECT author.maker AS author_maker, reviewer.maker AS reviewer_maker
         FROM ledger.node_review AS review
         JOIN ledger.raw_artifact AS author ON author.raw_artifact_id=review.author_raw_artifact_ref
         JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id=review.review_raw_artifact_ref
         WHERE review.run_id=$1 ORDER BY review.at_seq`,
        [runId]
      );
      const reviewersFor = (author: string): readonly string[] => reviews.rows
        .filter((row) => row.author_maker === author)
        .map((row) => row.reviewer_maker);
      expect(reviewersFor("Rotation maker A")).toEqual([
        "Rotation maker B", "Rotation maker C", "Rotation maker B", "Rotation maker C", "Rotation maker B"
      ]);
      expect(reviewersFor("Rotation maker B")).toEqual([
        "Rotation maker A", "Rotation maker C", "Rotation maker A", "Rotation maker C", "Rotation maker A"
      ]);
      expect(reviewersFor("Rotation maker C")).toEqual([
        "Rotation maker A", "Rotation maker B", "Rotation maker A", "Rotation maker B", "Rotation maker A"
      ]);
    } finally {
      await makerC.stop();
      await makerB.stop();
      await makerA.stop();
    }
  });

  it("leaves a failed review honestly absent and makes the authored opinions unservable", async () => {
    const primary = await startProviderDouble([
      ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary depth-1 position ${index + 1}`)),
      ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary review ${index + 1}`))
    ]);
    const secondary = await startProviderDouble([
      ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary depth-1 position ${index + 1}`)),
      JSON.stringify({ outcome: "fabricated-pass", reasons: ["outside the closed vocabulary"] }),
      ...Array.from({ length: 3 }, (_, index) => reviewDouble("cannot-assess", `Secondary review ${index + 2}`))
    ]);
    try {
      const runId = await createRun("xrev-01-failed-review-absence", 16, 2, 1);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId,
        batteryRowId: "Q1",
        nodeSet: [],
        commandKey: "runner-test:xrev-01-failed-review-absence"
      });
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: primary.endpoint,
        model: "test-layer/primary-model",
        maker: "Primary test maker"
      }), {
        ...runnerSettings(),
        critique: {
          provider: createPostgresProviderGateway(database.pool, {
            endpoint: secondary.endpoint,
            model: "test-layer/secondary-model",
            maker: "Secondary test maker"
          }),
          providerRef: "provider:test-layer:secondary",
          maker: "Secondary test maker"
        },
        scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" }
      });

      await expect(runner.executeWorkItem(workItemId)).rejects.toMatchObject({
        code: "NODE_REVIEW_UNAVAILABLE"
      });
      const reviews = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM ledger.node_review WHERE run_id=$1",
        [runId]
      );
      const answers = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM serve.answer WHERE run_id=$1",
        [runId]
      );
      // Kills fabricating cannot-assess in the catch path and kills continuing
      // into a served answer with incomplete coverage.
      expect(reviews.rows[0]?.count).toBe("0");
      expect(answers.rows[0]?.count).toBe("0");
    } finally {
      await secondary.stop();
      await primary.stop();
    }
  });

  it("T33 serves over the judged graph while retaining a class-H subtree as disclosed unjudged material", async () => {
    const composition = JSON.stringify({ segments: [
      { segment_id: "segment:verdict", text: "The judged position survives.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
      { segment_id: "segment:research", text: "Check an independent source.", node_refs: [], served_number_refs: [] }
    ] });
    const primary = await startProviderDouble([
      judgementDouble("Primary hidden-frame position 1"),
      reviewDouble("agree", "Primary review 1"),
      judgementDouble("Primary hidden-frame position 2"),
      judgementDouble("Primary hidden-frame position 3"),
      { status: 503 }, { status: 503 },
      reviewDouble("agree", "Primary review 3"),
      judgementDouble("Primary hidden-frame position 4"),
      reviewDouble("agree", "Primary review 4"),
      composition,
      evaluatorSatisfied()
    ]);
    const secondary = await startProviderDouble([
      judgementDouble("Secondary hidden-frame position 1"),
      reviewDouble("dispute", "Secondary review 1"),
      judgementDouble("Secondary hidden-frame position 2"),
      judgementDouble("Secondary hidden-frame position 3"),
      reviewDouble("dispute", "Secondary review 2"),
      reviewDouble("dispute", "Secondary review 3"),
      judgementDouble("Secondary hidden-frame position 4"),
      reviewDouble("dispute", "Secondary review 4")
    ]);
    try {
      const question = `resil01-class-h-${randomUUID()}`;
      const runId = await createRun(question, 40, 2, 1);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId, batteryRowId: "Q1", nodeSet: [], commandKey: `resil01-class-h:${runId}`
      });
      const runRepository = new RunRepository(database.pool);
      const record = (event: HoldProgressEvent) => runRepository.recordRunLifecycleEvent({
        runId: event.runId,
        kind: event.kind,
        value: {
          state: event.state, call_site_key: event.callSiteKey, parent_node_ref: event.parentNodeId,
          hold_ms: event.holdMs, hold_until: event.holdUntil, attempts_spent: event.attemptsSpent,
          transport_outcome: event.transportOutcome, planned_leg_count: event.plannedLegCount
        }
      });
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: primary.endpoint, model: "test-layer/primary-model", maker: "Primary test maker"
      }), {
        ...runnerSettings(),
        claimMs: 1_204_000,
        runDeathPolicy: { cooldownMs: 600_000, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 2 },
        hiddenNodeScoreThreshold: { value: 0.35, sourceRef: "acceptance:DR-176:V-approved" },
        holdRecorder: {
          countCooldownHolds: (candidateRunId) => runRepository.countCooldownHolds(candidateRunId),
          record,
          wait: async () => undefined
        },
        critique: {
          provider: createPostgresProviderGateway(database.pool, {
            endpoint: secondary.endpoint, model: "test-layer/secondary-model", maker: "Secondary test maker"
          }),
          providerRef: "provider:test-layer:secondary",
          maker: "Secondary test maker"
        },
        scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" }
      });

      const result = await runner.executeWorkItem(workItemId);
      expect(result.kind).toBe("COMPLETED");
      if (result.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");
      const answer = await new ServeRepository(database.pool)
        .readAnswerProjection(result.answerId, `asker:${question}`);
      expect(answer?.condition_marks).toContain("HIDDEN-UNJUDGEABLE");
      const hiddenRecord = answer?.condition_mark_records.find((candidate) => candidate.mark === "HIDDEN-UNJUDGEABLE");
      expect(hiddenRecord).toMatchObject({
        call_site_key: expect.stringMatching(/^JUDGE:review:/),
        terminal_transport_outcome: "FAILED",
        excluded_from_served_number: true
      });
      const hiddenNodeId = hiddenRecord?.affected_node_ids[0];
      if (hiddenNodeId === undefined) throw new Error("TEST_EXPECTED_HIDDEN_NODE");
      expect(answer?.nodes.find((node) => node.node_id === hiddenNodeId)).toMatchObject({
        final_strength: null,
        condition_marks: expect.arrayContaining(["HIDDEN-UNJUDGEABLE"])
      });
      // DR-184 C-3/T16/T17: a superseding write keeps v1 byte-identical and
      // threads the computed version through answer, marks and served number.
      const serveRepository = new ServeRepository(database.pool);
      const source = await serveRepository.readReviewCatchUpSource(runId);
      const v1Before = await database.pool.query<{ payload: unknown }>(
        `SELECT jsonb_build_object(
           'answer', (SELECT to_jsonb(a) FROM serve.answer a WHERE a.answer_id=$1 AND a.answer_version=1),
           'marks', (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.at_seq),'[]'::jsonb)
                     FROM serve.condition_mark m WHERE m.answer_id=$1 AND m.answer_version=1),
           'numbers', (SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.served_number_id),'[]'::jsonb)
                       FROM serve.served_number n WHERE n.answer_id=$1 AND n.answer_version=1)
         ) AS payload`, [source.answerId]
      );
      const records = source.answer.condition_mark_records.map((record): PreservedConditionMarkRecord => ({
        mark: record.mark as ConditionMarkRecord["mark"], scope: record.scope, subjectRef: record.subject_ref,
        reason: record.reason, liftPath: record.lift_path, servedRootRule: record.served_root_rule,
        affectedNodeIds: record.affected_node_ids, callSiteKey: record.call_site_key,
        plannedLegCount: record.planned_leg_count,
        terminalTransportOutcome: record.terminal_transport_outcome,
        hiddenStrength: record.hidden_strength, hiddenScoreThreshold: record.hidden_score_threshold,
        hiddenScoreThresholdSourceRef: record.hidden_score_threshold_source_ref,
        excludedFromServedNumber: record.excluded_from_served_number,
        judgedBasisCount: record.judged_basis_count
      }));
      const v2 = await serveRepository.persist({
        runId, workItemId, factBundleVersion: source.factBundleVersion,
        factBundleContentHash: createHash("sha256").update(JSON.stringify(source.factBundle)).digest("hex"),
        factBundle: source.factBundle,
        result: {
          terminal: source.answer.terminal, answerForm: source.answer.answer_form,
          factBundle: source.factBundle, gateTrace: [], conditionMarks: source.answer.condition_marks,
          conformance: [], coverageMode: "NOT_RUN", segments: [],
          compositionBudget: { tier: "low", bound: 1, registerRowKey: "test", registerVersion: 1, sourceRef: "test" },
          confidenceBand: source.answer.confidence_band,
          bandCeiling: source.answer.band_ceiling === null ? null : {
            label: source.answer.band_ceiling.label, basis: source.answer.band_ceiling.basis,
            registerRowKey: source.answer.band_ceiling.register_row_key,
            registerVersion: source.answer.band_ceiling.register_version,
            sourceRef: source.answer.band_ceiling.source_ref,
            liftPath: source.answer.band_ceiling.lift_path
          },
          projections: { reversalPoint: source.answer.reversal_point,
            buildsOnPrevious: source.factBundle.buildsOnPrevious,
            memoryDisclosure: source.factBundle.memoryDisclosure }
        } as never,
        segments: source.answer.composed_text.map((segment) => ({
          segmentId: segment.segment_id, text: segment.text, loadBearing: segment.load_bearing,
          assertedNodeRefs: [], servedNumberRefs: segment.served_number_refs
        })),
        compositionRawArtifactRef: null, compositionAttempt: 0, conformanceRawArtifactRefs: [],
        conditionMarkRecords: records,
        servedNumber: source.servedNumber === null ? null : {
          numberRef: source.servedNumber.numberRef, value: source.servedNumber.value,
          numberKind: source.servedNumber.numberKind, sourceRef: source.servedNumber.sourceRef,
          producer: source.servedNumber.producer, replayHandle: source.servedNumber.replayHandle,
          propagationRunId: source.servedNumber.propagationRunId
        },
        supersedes: { answerId: source.answerId }
      });
      expect(v2).toMatchObject({ answerId: source.answerId, answerVersion: 2 });
      const versionRows = await database.pool.query<{ table_name: string; answer_version: number }>(
        `SELECT 'answer' AS table_name, answer_version FROM serve.answer WHERE answer_id=$1 AND answer_version=2
         UNION ALL SELECT 'mark', answer_version FROM serve.condition_mark WHERE answer_id=$1 AND answer_version=2
         UNION ALL SELECT 'number', answer_version FROM serve.served_number WHERE answer_id=$1 AND answer_version=2`,
        [source.answerId]
      );
      expect(new Set(versionRows.rows.map((row) => row.answer_version))).toEqual(new Set([2]));
      expect(new Set(versionRows.rows.map((row) => row.table_name))).toEqual(new Set(["answer", "mark", "number"]));
      const referencedRows = await database.pool.query<{
        answer_version: number; composed_text_id: string | null; conformance_record_id: string | null;
      }>(
        `SELECT answer_version, composed_text_id, conformance_record_id
         FROM serve.answer WHERE answer_id=$1 AND answer_version IN (1,2)
         ORDER BY answer_version`,
        [source.answerId]
      );
      expect(referencedRows.rows[1]?.composed_text_id).toBe(referencedRows.rows[0]?.composed_text_id);
      expect(referencedRows.rows[1]?.conformance_record_id).toBe(referencedRows.rows[0]?.conformance_record_id);
      const v1After = await database.pool.query<{ payload: unknown }>(
        `SELECT jsonb_build_object(
           'answer', (SELECT to_jsonb(a) FROM serve.answer a WHERE a.answer_id=$1 AND a.answer_version=1),
           'marks', (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.at_seq),'[]'::jsonb)
                     FROM serve.condition_mark m WHERE m.answer_id=$1 AND m.answer_version=1),
           'numbers', (SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.served_number_id),'[]'::jsonb)
                       FROM serve.served_number n WHERE n.answer_id=$1 AND n.answer_version=1)
         ) AS payload`, [source.answerId]
      );
      expect(v1After.rows[0]?.payload).toEqual(v1Before.rows[0]?.payload);
      expect((await serveRepository.readAnswerProjection(source.answerId, `asker:${question}`))?.answer_version).toBe(2);
      expect((await serveRepository.readAnswerProjection(source.answerId, `asker:${question}`, 1))?.answer_version).toBe(1);
      const ddlClient = await database.pool.connect();
      try {
        await ddlClient.query("BEGIN");
        await expect(ddlClient.query(
          `INSERT INTO serve.condition_mark (
             answer_id, answer_version, mark, scope, subject_ref, reason,
             call_site_key, terminal_transport_outcome, excluded_from_served_number,
             judged_basis_count, at_seq
           ) VALUES ($1,2,'DERIVED-STANDING-UNREVIEWED','node',$2,'ddl-positive',
             'JUDGE:review:test','FAILED',false,1,ledger.allocate_sequence())`,
          [source.answerId, hiddenNodeId]
        )).resolves.toBeDefined();
        await ddlClient.query("SAVEPOINT invalid_d_missing_count");
        await expect(ddlClient.query(
          `INSERT INTO serve.condition_mark (
             answer_id, answer_version, mark, scope, subject_ref, reason,
             call_site_key, terminal_transport_outcome, excluded_from_served_number,
             judged_basis_count, at_seq
           ) VALUES ($1,2,'DERIVED-STANDING-UNREVIEWED','node',$2,'ddl-negative',
             'JUDGE:review:test','FAILED',false,NULL,ledger.allocate_sequence())`,
          [source.answerId, hiddenNodeId]
        )).rejects.toThrow();
        await ddlClient.query("ROLLBACK TO SAVEPOINT invalid_d_missing_count");
        await ddlClient.query("SAVEPOINT invalid_non_d_count");
        await expect(ddlClient.query(
          `INSERT INTO serve.condition_mark (
             answer_id, answer_version, mark, scope, subject_ref, reason,
             judged_basis_count, at_seq
           ) VALUES ($1,2,'UNAUTHORED-BRANCH-HALTED','node',$2,'ddl-negative',
             1,ledger.allocate_sequence())`,
          [source.answerId, hiddenNodeId]
        )).rejects.toThrow();
        await ddlClient.query("ROLLBACK TO SAVEPOINT invalid_non_d_count");
      } finally {
        await ddlClient.query("ROLLBACK");
        ddlClient.release();
      }
      const storedNodes = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM core.node WHERE run_id=$1", [runId]
      );
      expect(storedNodes.rows[0]?.count).toBe("8");
      const storedSnapshot = await new GraphRepository(database.pool).materialiseSnapshot(runId);
      const targetNodeIds = [...new Set(storedSnapshot.arrows
        .filter((arrow) => arrow.targetKind === "NODE")
        .map((arrow) => arrow.targetNodeId!))];
      const reviewedNodeIds = await new JudgementRepository(database.pool).readReviewedNodeIds(runId);
      const judged = evaluate(projectJudgedStanding({
        ...storedSnapshot,
        operatorResolutions: targetNodeIds.map((parentNodeId) => ({
          parentNodeId, operator: "accumulate" as const, suppliedBy: "deployment" as const
        }))
      }, reviewedNodeIds).snapshot);
      const servedNode = answer?.nodes.find((node) => node.node_id !== hiddenNodeId && node.final_strength !== null);
      expect(servedNode?.final_strength?.value).toBe(
        judged.strengths.find((row) => row.nodeId === servedNode?.node_id)?.strength
      );
    } finally {
      await secondary.stop();
      await primary.stop();
    }
  });

  /**
   * T6 r2 / J14 — the SECOND route into hidden-unjudgeable gets its disclosure.
   *
   * This is T33's fixture with one byte-level change: the review that T33 kills
   * with transport failures (`{status:503}` twice) instead comes back as an
   * honest `cannot-assess`. The reviewer was reached, answered, and said it
   * could not judge. Under T6's outcome filter that node has no judged basis
   * and lands in exactly the same class — but the class-H record schema demands
   * a transport outcome that truthfully does not exist here, so before J14 the
   * node left the served graph with NO record and NO mark: a silent skip, which
   * goal 26 forbids.
   *
   * The two assertions are the two halves of the consequence: the answer
   * discloses the route (naming the review outcome instead of a transport
   * outcome), and the review-catch-up lane can still READ that disclosure —
   * `transportFields` threw CATCH_UP_DISCLOSURE_MISMATCH for any hidden node
   * whose record was missing, so the silent route did not merely under-disclose,
   * it stopped the catch-up lane on every run containing one.
   */
  const runCannotAssessClassHScenario = async () => {
    const composition = JSON.stringify({ segments: [
      { segment_id: "segment:verdict", text: "The judged position survives.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
      { segment_id: "segment:research", text: "Check an independent source.", node_refs: [], served_number_refs: [] }
    ] });
    const primary = await startProviderDouble([
      judgementDouble("Primary unassessable-frame position 1"),
      reviewDouble("agree", "Primary review 1"),
      judgementDouble("Primary unassessable-frame position 2"),
      judgementDouble("Primary unassessable-frame position 3"),
      reviewDouble("cannot-assess", "Primary cannot assess position 2"),
      reviewDouble("agree", "Primary review 3"),
      judgementDouble("Primary unassessable-frame position 4"),
      reviewDouble("agree", "Primary review 4"),
      composition,
      evaluatorSatisfied()
    ]);
    const secondary = await startProviderDouble([
      judgementDouble("Secondary unassessable-frame position 1"),
      reviewDouble("agree", "Secondary review 1"),
      judgementDouble("Secondary unassessable-frame position 2"),
      judgementDouble("Secondary unassessable-frame position 3"),
      reviewDouble("agree", "Secondary review 2"),
      reviewDouble("agree", "Secondary review 3"),
      judgementDouble("Secondary unassessable-frame position 4"),
      reviewDouble("agree", "Secondary review 4")
    ]);
    try {
      const question = `t06-cannot-assess-class-h-${randomUUID()}`;
      const runId = await createRun(question, 40, 2, 1);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId, batteryRowId: "Q1", nodeSet: [], commandKey: `t06-cannot-assess-class-h:${runId}`
      });
      const runRepository = new RunRepository(database.pool);
      const scoringOperator = { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" } as const;
      const settings = runnerSettings();
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: primary.endpoint, model: "test-layer/primary-model", maker: "Primary test maker"
      }), {
        ...settings,
        claimMs: 1_204_000,
        runDeathPolicy: { cooldownMs: 600_000, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 2 },
        hiddenNodeScoreThreshold: { value: 0.35, sourceRef: "acceptance:DR-176:V-approved" },
        holdRecorder: {
          countCooldownHolds: (candidateRunId) => runRepository.countCooldownHolds(candidateRunId),
          record: (event: HoldProgressEvent) => runRepository.recordRunLifecycleEvent({
            runId: event.runId,
            kind: event.kind,
            value: {
              state: event.state, call_site_key: event.callSiteKey, parent_node_ref: event.parentNodeId,
              hold_ms: event.holdMs, hold_until: event.holdUntil, attempts_spent: event.attemptsSpent,
              transport_outcome: event.transportOutcome, planned_leg_count: event.plannedLegCount
            }
          }),
          wait: async () => undefined
        },
        critique: {
          provider: createPostgresProviderGateway(database.pool, {
            endpoint: secondary.endpoint, model: "test-layer/secondary-model", maker: "Secondary test maker"
          }),
          providerRef: "provider:test-layer:secondary",
          maker: "Secondary test maker"
        },
        scoringOperator
      });

      const result = await runner.executeWorkItem(workItemId);
      if (result.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");

      // The run really did take the honest-cannot-assess route, not a transport
      // death: exactly one stored review says so, and no review call was lost.
      const outcomes = await database.pool.query<{ outcome: string; count: string }>(
        "SELECT outcome, count(*)::text AS count FROM ledger.node_review WHERE run_id=$1 GROUP BY outcome ORDER BY outcome",
        [runId]
      );
      expect(outcomes.rows).toEqual([
        { outcome: "agree", count: "7" },
        { outcome: "cannot-assess", count: "1" }
      ]);

      return {
        runId,
        settings,
        scoringOperator,
        answer: await new ServeRepository(database.pool)
          .readAnswerProjection(result.answerId, `asker:${question}`)
      };
    } finally {
      await secondary.stop();
      await primary.stop();
    }
  };

  it("T6/J14 discloses the cannot-assess hidden route with the review outcome in place of a transport outcome", async () => {
    const scenario = await runCannotAssessClassHScenario();

    // The mark is raised and its typed record names the REAL reason — the
    // review outcome — where the transport route names a transport outcome.
    // Neither route may name both, and neither may name none.
    expect(scenario.answer?.condition_marks).toContain("HIDDEN-UNJUDGEABLE");
    const hiddenRecord = scenario.answer?.condition_mark_records.find(
      (candidate) => candidate.mark === "HIDDEN-UNJUDGEABLE"
    );
    expect(hiddenRecord).toMatchObject({
      call_site_key: expect.stringMatching(/^JUDGE:review:/),
      terminal_transport_outcome: null,
      review_outcome: "cannot-assess",
      excluded_from_served_number: true
    });
    const hiddenNodeId = hiddenRecord?.affected_node_ids[0];
    if (hiddenNodeId === undefined) throw new Error("TEST_EXPECTED_HIDDEN_NODE");
    expect(scenario.answer?.nodes.find((node) => node.node_id === hiddenNodeId)).toMatchObject({
      final_strength: null,
      condition_marks: expect.arrayContaining(["HIDDEN-UNJUDGEABLE"])
    });

    const answerId = scenario.answer?.answer_id;
    const answerVersion = scenario.answer?.answer_version;
    if (answerId === undefined || answerVersion === undefined) throw new Error("TEST_EXPECTED_ANSWER");

    // T6 r3 / J14 ADDENDUM (2) — the stored row's PROVENANCE is the review row
    // itself. The writer did not take the caller's word for which review it
    // meant: it looked the node's own `cannot-assess` review up in the ledger,
    // and the answer row carries that `node_review_id` under a composite
    // foreign key. So the disclosure cannot drift from the fact it reports.
    const reviews = await database.pool.query<{ node_review_id: string; node_id: string; outcome: string }>(
      `SELECT node_review_id::text, node_id::text, outcome FROM ledger.node_review
        WHERE run_id=$1 ORDER BY outcome, at_seq`,
      [scenario.runId]
    );
    const unassessedReview = reviews.rows.find((row) => row.outcome === "cannot-assess")!;
    const agreedReview = reviews.rows.find((row) => row.outcome === "agree")!;
    expect(unassessedReview.node_id).toBe(hiddenNodeId);
    const storedHidden = await database.pool.query<{
      review_ref: string | null; review_node_ref: string | null; terminal_transport_outcome: string | null;
    }>(
      `SELECT review_ref::text AS review_ref, review_node_ref::text AS review_node_ref,
              terminal_transport_outcome
         FROM serve.condition_mark
        WHERE answer_id=$1 AND answer_version=$2 AND mark='HIDDEN-UNJUDGEABLE'`,
      [answerId, answerVersion]
    );
    expect(storedHidden.rows).toEqual([{
      review_ref: unassessedReview.node_review_id,
      review_node_ref: hiddenNodeId,
      terminal_transport_outcome: null
    }]);

    // What the DATABASE itself refuses, probed against the real constraints in
    // a rolled-back transaction and named one by one — a probe that only shows
    // "something threw" cannot tell a vocabulary rule from a foreign key.
    //
    // The one shape the DDL still ACCEPTS is called out rather than blessed:
    // a transport reason on a node whose review landed is cross-table truth,
    // which no CHECK can express and which J14's addendum (3) explicitly
    // declines to mandate a trigger for. That row is refused by the atomic
    // writer guard instead — proved in `t06-review-teeth-database.test.ts`.
    const ddlClient = await database.pool.connect();
    const probe = (input: {
      readonly transport?: "TIMED_OUT" | "FAILED";
      readonly review?: string;
      readonly reviewRef?: string;
      readonly reviewNodeRef?: string;
      readonly subject?: string;
    }) => ddlClient.query(
      `INSERT INTO serve.condition_mark (
         answer_id, answer_version, mark, scope, subject_ref, reason,
         call_site_key, terminal_transport_outcome, review_outcome,
         review_ref, review_node_ref, excluded_from_served_number, at_seq
       ) VALUES ($1,$2,'HIDDEN-UNJUDGEABLE','node',$3,'ddl-probe',
         'JUDGE:review:test',$4,$5,$6::uuid,$7::uuid,true,ledger.allocate_sequence())`,
      [answerId, answerVersion, input.subject ?? hiddenNodeId,
        input.transport ?? null, input.review ?? null,
        input.reviewRef ?? null, input.reviewNodeRef ?? null]
    );
    const rolledBack = async (name: string, run: () => Promise<unknown>) => {
      await ddlClient.query(`SAVEPOINT ${name}`);
      await run();
      await ddlClient.query(`ROLLBACK TO SAVEPOINT ${name}`);
    };
    try {
      await ddlClient.query("BEGIN");
      // ACCEPTED by DDL, refused by the writer: the transport arm for a node
      // whose review landed. Named as the DDL's honest limit, not as a
      // correct row.
      await rolledBack("transport_arm_ddl_limit", async () => {
        await expect(probe({ transport: "FAILED" })).resolves.toBeDefined();
      });
      // ACCEPTED, and true: the review arm naming this node's own review row.
      await rolledBack("review_arm_true", async () => {
        await expect(probe({
          review: "cannot-assess",
          reviewRef: unassessedReview.node_review_id,
          reviewNodeRef: hiddenNodeId
        })).resolves.toBeDefined();
      });
      // Cardinality (r2's rule, kept): never both, never neither.
      await rolledBack("both_reasons", async () => {
        await expect(probe({
          transport: "FAILED",
          review: "cannot-assess",
          reviewRef: unassessedReview.node_review_id,
          reviewNodeRef: hiddenNodeId
        })).rejects.toThrow(/condition_mark_unjudged_reason_check/);
      });
      await rolledBack("no_reason", async () => {
        await expect(probe({})).rejects.toThrow(/condition_mark_unjudged_reason_check/);
      });
      // J14 addendum (1) at the SQL layer: `agree` and `dispute` both SEED
      // judged standing, so the review arm admits neither.
      for (const [name, outcome] of [["agree_arm", "agree"], ["dispute_arm", "dispute"]] as const) {
        await rolledBack(name, async () => {
          await expect(probe({
            review: outcome,
            reviewRef: agreedReview.node_review_id,
            reviewNodeRef: agreedReview.node_id,
            subject: agreedReview.node_id
          })).rejects.toThrow(/condition_mark_review_outcome_check/);
        });
      }
      // J14 addendum (2) at the SQL layer: the review arm without provenance,
      // with provenance for the WRONG node, and with provenance for a review
      // that reached a judgement — codex's LIE 1 made unspellable.
      await rolledBack("review_arm_no_ref", async () => {
        await expect(probe({ review: "cannot-assess" }))
          .rejects.toThrow(/condition_mark_review_provenance_check/);
      });
      await rolledBack("review_arm_other_subject", async () => {
        await expect(probe({
          review: "cannot-assess",
          reviewRef: unassessedReview.node_review_id,
          reviewNodeRef: agreedReview.node_id
        })).rejects.toThrow(/condition_mark_review_subject_check/);
      });
      await rolledBack("review_arm_judged_row", async () => {
        await expect(probe({
          review: "cannot-assess",
          reviewRef: agreedReview.node_review_id,
          reviewNodeRef: agreedReview.node_id,
          subject: agreedReview.node_id
        })).rejects.toThrow(/condition_mark_review_row_fk/);
      });
    } finally {
      await ddlClient.query("ROLLBACK");
      ddlClient.release();
    }
  });

  /**
   * The consequence T6 r1 could only READ, executed. `prepareVersion` rebuilds
   * every class-H/class-D record from the PREVIOUS answer's records, and a
   * hidden node with no record there is a typed loud stop. So the silent route
   * did not merely under-disclose: it stopped the review-catch-up lane on every
   * run that contained a cannot-assess review, including runs where catch-up
   * had no work to do at all.
   */
  it("T6/J14 the review-catch-up lane reads the cannot-assess disclosure instead of stopping on it", async () => {
    const scenario = await runCannotAssessClassHScenario();
    const source = await new ServeRepository(database.pool).readReviewCatchUpSource(scenario.runId);
    const dependencies = createPostgresReviewCatchUpDependencies({
      pool: database.pool,
      reviewers: [],
      scoringOperator: scenario.scoringOperator,
      propagationContractHash: scenario.settings.propagationContractHash,
      propagationNumberKind: scenario.settings.propagationNumberKind,
      propagationProducer: scenario.settings.propagationProducer,
      judgementSelectionRule: { ...scenario.settings.judgementPolicy!.selectionRule },
      compositionBudget: scenario.settings.servePolicy!.compositionBudgets.low
    });

    const candidate = await dependencies.prepareVersion({
      runId: scenario.runId, answerId: source.answerId, fromVersion: source.answerVersion
    });
    // The set-aside node is still set aside — catch-up cannot repair it
    // (`UNIQUE (node_id)` refuses a second review) — but the lane now READS
    // that state instead of stopping on it.
    expect(candidate.stillSetAside).toBeGreaterThan(0);
  });

  /**
   * T6 r3 / codex r1 N1 — the class-D twin gets its own PRODUCTION arm.
   *
   * r2 proved the cannot-assess route at the production seam for class H only,
   * and proved class D for cannot-assess only at the standing projection. So a
   * mutant that filtered review-outcome disclosures out of `classDReviewRecords`
   * left every J14 production assertion green while restoring, for class D,
   * exactly the silence F-T6-4 says was fixed.
   *
   * This is DR-184 C-5's own fixture with one change: the review that C-5 kills
   * with two transport failures instead comes back as an honest
   * `cannot-assess`. The node keeps its judged arguments, so it still SERVES —
   * it is included in the served number, unlike the class-H route — and the
   * record must name the review outcome, carry the ledger review row, count a
   * positive judged basis, and stay readable by the catch-up lane.
   */
  it("T6/J14 discloses the cannot-assess class-D route, served and counted, with the review outcome as its reason", async () => {
    const scenario = await executeResil01Scenario({
      label: "t06-cannot-assess-class-d",
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary D position ${index + 1}`)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary D review ${index + 1}`)),
        resil01Composition,
        evaluatorSatisfied()
      ],
      secondary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary D position ${index + 1}`)),
        reviewDouble("cannot-assess", "Secondary D cannot assess review 1"),
        ...Array.from({ length: 3 }, (_, index) => reviewDouble("dispute", `Secondary D review ${index + 2}`))
      ]
    });

    expect(scenario.error).toBeNull();
    expect(scenario.result?.kind).toBe("COMPLETED");

    // The run really took the honest cannot-assess route: one stored review
    // says so, and no review call was lost to transport.
    const outcomes = await database.pool.query<{ outcome: string; count: string }>(
      `SELECT outcome, count(*)::text AS count FROM ledger.node_review
        WHERE run_id=$1 GROUP BY outcome ORDER BY outcome`,
      [scenario.runId]
    );
    expect(outcomes.rows.find((row) => row.outcome === "cannot-assess")).toEqual({
      outcome: "cannot-assess", count: "1"
    });

    // The class-D record names the REVIEW outcome, not a transport outcome,
    // and keeps class D's own presentation contract: a positive judged basis
    // and INCLUSION in the served number.
    expect(scenario.answer?.condition_marks).toContain("DERIVED-STANDING-UNREVIEWED");
    const derivedRecords = (scenario.answer?.condition_mark_records ?? [])
      .filter((record) => record.mark === "DERIVED-STANDING-UNREVIEWED");
    const unassessedDerived = derivedRecords.find((record) => record.review_outcome !== null);
    expect(unassessedDerived).toMatchObject({
      call_site_key: expect.stringMatching(/^JUDGE:review:/),
      terminal_transport_outcome: null,
      review_outcome: "cannot-assess",
      excluded_from_served_number: false
    });
    expect(unassessedDerived?.judged_basis_count ?? 0).toBeGreaterThan(0);
    const derivedNodeId = unassessedDerived?.subject_ref;
    if (derivedNodeId === undefined) throw new Error("TEST_EXPECTED_DERIVED_NODE");

    // The disclosure is bound to the ledger row it reports, and the node it
    // reports on is the node whose review actually came back cannot-assess.
    const unassessedReview = await database.pool.query<{ node_review_id: string; node_id: string }>(
      `SELECT node_review_id::text, node_id::text FROM ledger.node_review
        WHERE run_id=$1 AND outcome='cannot-assess'`,
      [scenario.runId]
    );
    expect(unassessedReview.rows[0]?.node_id).toBe(derivedNodeId);
    const storedDerived = await database.pool.query<{ review_ref: string; review_node_ref: string }>(
      `SELECT review_ref::text AS review_ref, review_node_ref::text AS review_node_ref
         FROM serve.condition_mark
        WHERE answer_id=$1 AND answer_version=$2
          AND mark='DERIVED-STANDING-UNREVIEWED' AND review_outcome='cannot-assess'`,
      [scenario.answer?.answer_id, scenario.answer?.answer_version]
    );
    expect(storedDerived.rows).toEqual([{
      review_ref: unassessedReview.rows[0]!.node_review_id,
      review_node_ref: derivedNodeId
    }]);

    // T6 r4 / codex r2 B1 — the node projection reports the LEDGER's own
    // review vocabulary, not the narrowed disclosure one. This run stores
    // `agree`, `dispute` AND `cannot-assess` reviews, so a served node must be
    // able to carry a live judged verdict. r3 typed that column as
    // `"cannot-assess" | null` at the serve boundary while runtime kept putting
    // `agree` through it; this asserts the value the type was lying about.
    const projectedReviewOutcomes = new Set(
      (scenario.answer?.nodes ?? [])
        .map((node) => node.review?.outcome)
        .filter((outcome): outcome is NonNullable<typeof outcome> => outcome !== undefined)
    );
    expect(projectedReviewOutcomes.size).toBeGreaterThan(0);
    for (const outcome of projectedReviewOutcomes) {
      expect(["agree", "dispute", "cannot-assess"]).toContain(outcome);
    }
    expect([...projectedReviewOutcomes].some((outcome) => outcome !== "cannot-assess")).toBe(true);

    // Class D SERVES — that is the whole difference from class H. The node
    // still carries a final strength and is not excluded from the number.
    expect(scenario.answer?.nodes.find((node) => node.node_id === derivedNodeId)?.final_strength)
      .not.toBeNull();

    // ... and the catch-up lane reads the disclosure instead of stopping on it.
    const source = await new ServeRepository(database.pool).readReviewCatchUpSource(scenario.runId);
    const settings = runnerSettings();
    const dependencies = createPostgresReviewCatchUpDependencies({
      pool: database.pool,
      reviewers: [],
      scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" },
      propagationContractHash: settings.propagationContractHash,
      propagationNumberKind: settings.propagationNumberKind,
      propagationProducer: settings.propagationProducer,
      judgementSelectionRule: { ...settings.judgementPolicy!.selectionRule },
      compositionBudget: settings.servePolicy!.compositionBudgets.low
    });
    await expect(dependencies.prepareVersion({
      runId: scenario.runId, answerId: source.answerId, fromVersion: source.answerVersion
    })).resolves.toBeDefined();
  });

  it("DR-184 C-5 serves a class-D root when its own review dies but judged arguments remain", async () => {
    const scenario = await executeResil01Scenario({
      label: "resil01-r1-served-review-dead",
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary R1 position ${index + 1}`)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary R1 review ${index + 1}`)),
        resil01Composition,
        evaluatorSatisfied()
      ],
      secondary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary R1 position ${index + 1}`)),
        { status: 503 }, { status: 503 },
        ...Array.from({ length: 3 }, (_, index) => reviewDouble("dispute", `Secondary R1 review ${index + 2}`))
      ]
    });

    expect(scenario.error).toBeNull();
    expect(scenario.result?.kind).toBe("COMPLETED");
    const derived = scenario.answer?.condition_mark_records.find((record) => record.mark === "DERIVED-STANDING-UNREVIEWED");
    const selection = scenario.answer?.condition_mark_records.find((record) => record.mark === "UNSERVED-MAKER-POSITION");
    expect(derived).toMatchObject({ excluded_from_served_number: false, judged_basis_count: expect.any(Number) });
    expect(derived?.affected_node_ids).toHaveLength(1);
    expect(scenario.answer?.nodes.find((node) => node.node_id === selection?.subject_ref)?.final_strength)
      .not.toBeNull();
    expect(scenario.answer?.condition_marks).toContain("DERIVED-STANDING-UNREVIEWED");
  });

  it("DR-184 C-5 replaces the old all-roots review death when both roots have judged arguments", async () => {
    const scenario = await executeResil01Scenario({
      label: "resil01-r1-no-served-root",
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary no-root position ${index + 1}`)),
        { status: 503 }, { status: 503 },
        ...Array.from({ length: 3 }, (_, index) => reviewDouble("agree", `Primary no-root review ${index + 2}`)),
        resil01Composition,
        evaluatorSatisfied()
      ],
      secondary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary no-root position ${index + 1}`)),
        { status: 503 }, { status: 503 },
        ...Array.from({ length: 3 }, (_, index) => reviewDouble("dispute", `Secondary no-root review ${index + 2}`))
      ]
    });

    expect(scenario.error).toBeNull();
    expect(scenario.result?.kind).toBe("COMPLETED");
    expect(scenario.answer?.condition_marks).toContain("DERIVED-STANDING-UNREVIEWED");
    expect(scenario.answer?.condition_mark_records.filter(
      (record) => record.mark === "DERIVED-STANDING-UNREVIEWED"
    ).length).toBeGreaterThanOrEqual(2);
  });

  /**
   * T5 / S3-1 — the PRODUCTION seam, not a hand-composed chain.
   *
   * This drives the real `WalkingSkeletonRunner` through
   * `executeResil01Scenario`, with doubles only at the provider boundary. It
   * therefore pins the two production wires a component-level test cannot see:
   * `edges: authoredNode.sourcedEdges` on the review call, and the runner's
   * `recordEdgeMeasurements` writeback. Removing either turns this RED.
   *
   * Every node is scored at fidelity 0.5, so every tau is 0.5 and the σ oracle
   * below is the same arithmetic as the constructed run in
   * `t05-measured-edges-database.test.ts` — 0.5 attack bearing and 0.25 support
   * bearing over tau-0.5 leaves, i.e. σ(0.5, 0.25, 0.125) = 0.4375 for a root
   * carrying one measured attack and one measured support from leaves.
   */
  it("T5 the production runner writes the reviewer's magnitudes and the graph goes numerically live", async () => {
    const bearings = { support: 0.25, attack: 0.5 } as const;
    const scenario = await executeResil01Scenario({
      label: "t05-production-seam",
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary T5 position ${index + 1}`, 0.5)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary T5 review ${index + 1}`, bearings)),
        resil01Composition,
        evaluatorSatisfied()
      ],
      secondary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary T5 position ${index + 1}`, 0.5)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Secondary T5 review ${index + 1}`, bearings))
      ]
    });

    expect(scenario.error).toBeNull();
    expect(scenario.result?.kind).toBe("COMPLETED");

    // (1) The post-run graph holds MEASURED magnitudes, stamped REVIEWER, and
    //     each one is the bearing scripted for THAT edge's own polarity — the
    //     transport carried the real relation, not a uniform label.
    const measured = await database.pool.query<{
      polarity: "support" | "attack"; strength: number; strength_source: string;
    }>(
      `SELECT polarity, strength, strength_source FROM core.edge
        WHERE run_id=$1 AND magnitude_status='MEASURED' ORDER BY created_at_seq`,
      [scenario.runId]
    );
    expect(measured.rowCount).toBeGreaterThan(0);
    for (const row of measured.rows) {
      expect(row.strength_source).toBe("REVIEWER");
      expect(Number(row.strength)).toBe(bearings[row.polarity]);
    }
    expect(new Set(measured.rows.map((row) => row.polarity))).toEqual(new Set(["support", "attack"]));

    // (2) The ledger: one model call per reviewed node, no measurement-only site.
    const reviewCalls = await database.pool.query<{ call_site_key: string; attempts: string }>(
      `SELECT call_site_key, count(*)::text AS attempts FROM ledger.ledger_entry
        WHERE run_id=$1 AND action_kind='MODEL_CALL' AND call_site_key LIKE 'JUDGE:review:%'
        GROUP BY call_site_key`,
      [scenario.runId]
    );
    expect(reviewCalls.rowCount).toBeGreaterThan(0);
    expect(reviewCalls.rows.every((row) => Number(row.attempts) === 1)).toBe(true);
    const anyMeasurementSite = await database.pool.query(
      `SELECT 1 FROM ledger.ledger_entry
        WHERE run_id=$1 AND action_kind='MODEL_CALL'
          AND (call_site_key ILIKE '%measur%' OR call_site_key ILIKE '%bearing%'
               OR call_site_key ILIKE '%magnitude%')`,
      [scenario.runId]
    );
    expect(anyMeasurementSite.rowCount).toBe(0);

    // (3) FINAL ≠ τ through the production graph, checked against an oracle
    //     computed from the run's OWN taus and bearings with the published
    //     arithmetic — never against propagation's own answer.
    const targetNodeIds = [...new Set(scenario.snapshot.arrows
      .filter((arrow) => arrow.targetKind === "NODE")
      .map((arrow) => arrow.targetNodeId!))];
    const propagated = evaluate({
      ...scenario.snapshot,
      operatorResolutions: targetNodeIds.map((parentNodeId) => ({
        parentNodeId, operator: "accumulate" as const, suppliedBy: "deployment" as const
      }))
    });
    const strengthOf = (nodeId: string): number =>
      propagated.strengths.find((record) => record.nodeId === nodeId)!.strength;
    const tauOf = (nodeId: string): number =>
      scenario.snapshot.nodes.find((candidate) => candidate.nodeId === nodeId)!.baseStrength!;

    // A parent all of whose measured incoming arrows come from LEAVES: its
    // children's values are their own taus, so σ can be recomputed by hand.
    const sourcesOf = (nodeId: string) => scenario.snapshot.arrows
      .filter((arrow) => arrow.targetKind === "NODE" && arrow.targetNodeId === nodeId);
    const isLeaf = (nodeId: string): boolean => sourcesOf(nodeId).length === 0;
    const subject = targetNodeIds.find((nodeId) =>
      sourcesOf(nodeId).some((arrow) => arrow.magnitudeStatus === "MEASURED")
      && sourcesOf(nodeId).every((arrow) => isLeaf(arrow.sourceNodeId)));
    if (subject === undefined) throw new Error("TEST_EXPECTED_A_MEASURED_LEAF_PARENT");

    const contributions = (polarity: "support" | "attack"): number[] => sourcesOf(subject)
      .filter((arrow) => arrow.polarity === polarity && arrow.magnitudeStatus === "MEASURED")
      .map((arrow) => arrow.strength! * tauOf(arrow.sourceNodeId));
    const attack = agg(contributions("attack"));
    const support = agg(contributions("support"));
    const oracle = σ(tauOf(subject), attack, support);

    expect(strengthOf(subject)).toBeCloseTo(oracle, 12);
    // The headline: the tree moved the number off tau.
    expect(strengthOf(subject)).not.toBe(tauOf(subject));
  });

  /**
   * T6 / S4-2 — the PRODUCTION seam for the second half of "review outcomes get
   * teeth": a `dispute` returned by the cross-maker reviewer feeds
   * `applyDeclaredDisagreement`, so the served answer's certainty band is the
   * SEALED one-step-down band rather than the candidate.
   *
   * The two arms differ in exactly one byte-level thing — the outcome string
   * the secondary maker returns on its reviews. Everything else (question
   * shape, judgement doubles, composition, conformance) is identical, so a band
   * difference between them can come from nothing but the review outcome.
   *
   * The expectation is DERIVED from the sealed rows the fixture itself seals
   * (`servePolicy.candidateConfidenceBand` and `panelPolicy.oneStepDown`),
   * never from a band literal: a downgrade that is computed here instead of
   * read from the register would be exactly the undeclared arithmetic S4-2
   * outlaws.
   */
  it("T6 a disputed cross-maker review steps the served band down and an all-agree run leaves it", async () => {
    const t06BandScenario = (label: string, secondaryOutcome: "agree" | "dispute") =>
      executeResil01Scenario({
        label,
        primary: [
          ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary T6 position ${index + 1}`)),
          ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary T6 review ${index + 1}`)),
          resil01Composition,
          evaluatorSatisfied()
        ],
        secondary: [
          ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary T6 position ${index + 1}`)),
          ...Array.from({ length: 4 }, (_, index) => reviewDouble(secondaryOutcome, `Secondary T6 review ${index + 1}`))
        ]
      });

    const settings = runnerSettings();
    const candidateBand = settings.servePolicy!.candidateConfidenceBand;
    const steppedDownBand = settings.panelPolicy!.oneStepDown[candidateBand]!;
    // Without this the fixture could pass while showing no step at all.
    expect(steppedDownBand).not.toBe(candidateBand);

    const agreed = await t06BandScenario("t06-band-agree", "agree");
    expect(agreed.error).toBeNull();
    expect(agreed.result?.kind).toBe("COMPLETED");

    const disputed = await t06BandScenario("t06-band-dispute", "dispute");
    expect(disputed.error).toBeNull();
    expect(disputed.result?.kind).toBe("COMPLETED");

    const outcomesOf = async (runId: string): Promise<ReadonlySet<string>> => new Set(
      (await database.pool.query<{ outcome: string }>(
        "SELECT DISTINCT outcome FROM ledger.node_review WHERE run_id=$1", [runId]
      )).rows.map((row) => row.outcome)
    );
    // The arms really are the two review populations they claim to be.
    expect(await outcomesOf(agreed.runId)).toEqual(new Set(["agree"]));
    expect(await outcomesOf(disputed.runId)).toEqual(new Set(["agree", "dispute"]));

    expect(agreed.answer?.confidence_band).toBe(candidateBand);
    expect(disputed.answer?.confidence_band).toBe(steppedDownBand);
  });

  it("RESIL-01 rev2 R2 keeps a healthy tau-0.30 graph servable and makes class L presentation-only", async () => {
    const scenario = await executeResil01Scenario({
      label: "resil01-r2-tau-030",
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary low position ${index + 1}`, 0.30)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary low review ${index + 1}`)),
        resil01Composition,
        evaluatorSatisfied()
      ],
      secondary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary low position ${index + 1}`, 0.30)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("dispute", `Secondary low review ${index + 1}`))
      ]
    });

    expect(scenario.error).toBeNull();
    expect(scenario.result?.kind).toBe("COMPLETED");
    const lowRecords = scenario.answer?.condition_mark_records.filter((record) => record.mark === "HIDDEN-LOW-SCORE") ?? [];
    expect(lowRecords.length).toBeGreaterThan(0);
    expect(lowRecords.every((record) => record.excluded_from_served_number === false)).toBe(true);
    expect(scenario.answer?.nodes.some((node) => node.final_strength !== null)).toBe(true);
    if (scenario.answer === null) throw new Error("TEST_EXPECTED_REAL_ANSWER_PROJECTION");
    const census = projectCanvasCensus(scenario.answer);
    expect(census).toEqual({ claims: 8, judged: 8, derivedStanding: 0, setAside: 0 });
    expect(census.judged + census.derivedStanding + census.setAside).toBe(census.claims);
  });

  it("RESIL-01 rev2 R2 keeps a hidden low-scoring attack in the served-number evaluation", async () => {
    const scenario = await executeResil01Scenario({
      label: "resil01-r2-low-attack",
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary attack-control ${index + 1}`)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary attack review ${index + 1}`)),
        resil01Composition,
        evaluatorSatisfied()
      ],
      secondary: [
        judgementDouble("Secondary attack-control root"),
        judgementDouble("Healthy support"),
        judgementDouble("Low scoring attack", 0.30),
        judgementDouble("Healthy cross-root response"),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("dispute", `Secondary attack review ${index + 1}`))
      ]
    });

    expect(scenario.error).toBeNull();
    expect(scenario.result?.kind).toBe("COMPLETED");
    const lowRecord = scenario.answer?.condition_mark_records.find((record) =>
      record.mark === "HIDDEN-LOW-SCORE" && record.hidden_strength === 0.30
    );
    expect(lowRecord).toMatchObject({ excluded_from_served_number: false });
    const selection = scenario.answer?.condition_mark_records.find((record) => record.mark === "UNSERVED-MAKER-POSITION");
    const servedNodeId = selection?.subject_ref;
    if (servedNodeId === undefined) throw new Error("TEST_EXPECTED_SERVED_ROOT");
    const targetNodeIds = [...new Set(scenario.snapshot.arrows
      .filter((arrow) => arrow.targetKind === "NODE")
      .map((arrow) => arrow.targetNodeId!))];
    const full = evaluate({
      ...scenario.snapshot,
      operatorResolutions: targetNodeIds.map((parentNodeId) => ({
        parentNodeId, operator: "accumulate" as const, suppliedBy: "deployment" as const
      }))
    });
    expect(scenario.answer?.nodes.find((node) => node.node_id === servedNodeId)?.final_strength?.value)
      .toBe(full.strengths.find((row) => row.nodeId === servedNodeId)?.strength);
  });

  it("RESIL-01 rev2 H6 classifies the exact <= 0.35 runner boundary as presentation-only class L", async () => {
    const scenario = await executeResil01Scenario({
      label: "resil01-h6-boundary",
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary boundary ${index + 1}`, 0.35)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary boundary review ${index + 1}`)),
        resil01Composition,
        evaluatorSatisfied()
      ],
      secondary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary boundary ${index + 1}`, 0.35)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("dispute", `Secondary boundary review ${index + 1}`))
      ]
    });

    expect(scenario.error).toBeNull();
    expect(scenario.result?.kind).toBe("COMPLETED");
    expect(scenario.answer?.condition_mark_records).toContainEqual(expect.objectContaining({
      mark: "HIDDEN-LOW-SCORE",
      hidden_strength: 0.35,
      hidden_score_threshold: 0.35,
      excluded_from_served_number: false
    }));
  });

  it("RESIL-01 rev2 H1 routes primary maker-position death through cooldown without an expansion event", async () => {
    const scenario = await executeResil01Scenario({
      label: "resil01-h1-primary-wrap",
      primary: [{ status: 503 }, { status: 503 }],
      secondary: []
    });
    expect(scenario.error).toMatchObject({ code: "MAKER_POSITION_UNAVAILABLE" });
    expect(scenario.lifecycle).toContainEqual(expect.objectContaining({
      kind: "node.retrying", state: "COOLDOWN_HOLD", call_site_key: "JUDGE"
    }));
    expect(scenario.lifecycle.some((event) => event.state === "EXPANSION_HALTED")).toBe(false);
  });

  it("RESIL-01 rev2 H2 routes secondary maker-position death through cooldown without an expansion event", async () => {
    const scenario = await executeResil01Scenario({
      label: "resil01-h2-secondary-wrap",
      primary: [judgementDouble("Healthy primary maker position")],
      secondary: [{ status: 503 }, { status: 503 }]
    });
    expect(scenario.error).toMatchObject({ code: "MAKER_POSITION_UNAVAILABLE" });
    expect(scenario.lifecycle).toContainEqual(expect.objectContaining({
      kind: "node.retrying", state: "COOLDOWN_HOLD", call_site_key: "JUDGE:root:secondary"
    }));
    expect(scenario.lifecycle.some((event) => event.state === "EXPANSION_HALTED")).toBe(false);
  });

  it("RESIL-01 rev2 H10 skips a halted expansion subtree and reports cumulative attempts spent", async () => {
    const scenario = await executeResil01Scenario({
      label: "resil01-h10-halted-expansion",
      depth: 2,
      primary: [
        ...Array.from({ length: 6 }, (_, index) => judgementDouble(`Primary depth-2 surviving ${index + 1}`)),
        ...Array.from({ length: 7 }, (_, index) => reviewDouble("agree", `Primary depth-2 review ${index + 1}`)),
        resil01Composition,
        evaluatorSatisfied()
      ],
      secondary: [
        judgementDouble("Secondary depth-2 root"),
        { status: 503 }, { status: 503 },
        ...Array.from({ length: 6 }, (_, index) => judgementDouble(`Secondary depth-2 surviving ${index + 1}`)),
        ...Array.from({ length: 6 }, (_, index) => reviewDouble("dispute", `Secondary depth-2 review ${index + 1}`))
      ]
    });

    expect(scenario.error).toBeNull();
    expect(scenario.result?.kind).toBe("COMPLETED");
    expect(scenario.lifecycle).toContainEqual(expect.objectContaining({
      kind: "ledger.could_not_do",
      state: "EXPANSION_HALTED",
      call_site_key: "JUDGE:defender:root0:r1:p0",
      attempts_spent: 2,
      planned_leg_count: 3
    }));
    const skippedDescendants = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ledger.ledger_entry
       WHERE run_id=$1 AND action_kind='MODEL_CALL'
         AND call_site_key IN ('JUDGE:defender:root0:r2:p2', 'JUDGE:critic:root0:r2:p2')`,
      [scenario.runId]
    );
    expect(skippedDescendants.rows[0]?.count).toBe("0");
    expect(scenario.answer?.condition_mark_records).toContainEqual(expect.objectContaining({
      mark: "UNAUTHORED-BRANCH-HALTED",
      planned_leg_count: 3
    }));
  });

  it("RESIL-01 rev2 T11 keeps an effective-bound site whose last attempt succeeded out of preflight terminal failure", async () => {
    const callSiteKey = "JUDGE:defender:root0:r1:p0";
    const scenario = await executeResil01Scenario({
      label: "resil01-t11-successful-last-attempt",
      primary: [judgementDouble("Primary T11 root")],
      secondary: [judgementDouble("Secondary T11 root")],
      beforeExecute: async ({ runId, workItemId }) => {
        const ledger = new LedgerRepository(database.pool);
        for (const outcome of ["FAILED", "OK"] as const) {
          const now = new Date();
          await ledger.append({
            runId, attemptId: randomUUID(), actionKind: "MODEL_CALL", callSiteKey,
            subjectItemId: workItemId, stanceAtAction: "UNASSIGNED", outcome,
            actorRef: "provider:test-layer:secondary", inputHash: `input:${outcome}`,
            contractHash: "contract:judge:test-layer", rawArtifactRef: null,
            startedAt: now, finishedAt: now
          });
        }
      }
    });

    expect(scenario.result).toBeNull();
    expect(scenario.error).toMatchObject({ code: "CALL_BUDGET_EXHAUSTED" });
    const state = await database.pool.query<{ state: string }>(
      "SELECT state FROM core.work_item WHERE work_item_id=$1", [scenario.workItemId]
    );
    expect(state.rows[0]?.state).toBe("CLAIMED");
  });

  it("RESIL-01 rev2 T12 hands an effective-bound failed non-root site to the halt path", async () => {
    const callSiteKey = "JUDGE:defender:root0:r1:p0";
    const scenario = await executeResil01Scenario({
      label: "resil01-t12-failed-site-pruned",
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary T12 ${index + 1}`)),
        ...Array.from({ length: 3 }, (_, index) => reviewDouble("agree", `Primary T12 review ${index + 1}`)),
        resil01Composition,
        evaluatorSatisfied()
      ],
      secondary: [
        ...Array.from({ length: 3 }, (_, index) => judgementDouble(`Secondary T12 ${index + 1}`)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("dispute", `Secondary T12 review ${index + 1}`))
      ],
      beforeExecute: async ({ runId, workItemId }) => {
        const ledger = new LedgerRepository(database.pool);
        for (let index = 0; index < 2; index += 1) {
          const now = new Date();
          await ledger.append({
            runId, attemptId: randomUUID(), actionKind: "MODEL_CALL", callSiteKey,
            subjectItemId: workItemId, stanceAtAction: "UNASSIGNED", outcome: "FAILED",
            actorRef: "provider:test-layer:secondary", inputHash: `input:failed:${index}`,
            contractHash: "contract:judge:test-layer", rawArtifactRef: null,
            startedAt: now, finishedAt: now
          });
        }
      }
    });

    expect(scenario.error).toBeNull();
    expect(scenario.result?.kind).toBe("COMPLETED");
    expect(scenario.lifecycle).toContainEqual(expect.objectContaining({
      state: "EXPANSION_HALTED", call_site_key: callSiteKey, attempts_spent: 2
    }));
    expect(scenario.answer?.condition_mark_records).toContainEqual(expect.objectContaining({
      mark: "UNAUTHORED-BRANCH-HALTED", call_site_key: callSiteKey
    }));
  });

  it("S2-3 T4 projects WAY-OF-KNOWING-DOWNGRADED on the real node when a judge claims a lookup it cannot pin", async () => {
    const downgraded = "Primary T4 position claiming a lookup it cannot pin";
    const scenario = await executeResil01Scenario({
      label: "t4-way-of-knowing-downgraded",
      primary: [
        unpinnedLookupJudgementDouble(downgraded),
        ...Array.from({ length: 3 }, (_, index) => judgementDouble(`Primary T4 position ${index + 2}`)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary T4 review ${index + 1}`)),
        resil01Composition,
        evaluatorSatisfied()
      ],
      secondary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary T4 position ${index + 1}`)),
        { status: 503 }, { status: 503 },
        ...Array.from({ length: 3 }, (_, index) => reviewDouble("dispute", `Secondary T4 review ${index + 2}`))
      ]
    });

    expect(scenario.error).toBeNull();
    expect(scenario.result?.kind).toBe("COMPLETED");

    // The node id comes from the REAL producer — the persisted, served graph —
    // never from a node-shaped literal handed in by the test (codex T4-r1 B2).
    expect(scenario.answer?.nodes.map((node) => node.claim)).toContain(downgraded);
    const producedNode = scenario.answer?.nodes.find((node) => node.claim === downgraded);
    expect(producedNode?.way_of_knowing).toBe("REASONING");
    expect(producedNode?.locator).toBeNull();

    // Projected on the affected NODE, which is what makes the mark visible.
    expect(producedNode?.condition_marks).toContain("WAY-OF-KNOWING-DOWNGRADED");
    expect(scenario.answer?.condition_marks).toContain("WAY-OF-KNOWING-DOWNGRADED");

    const record = scenario.answer?.condition_mark_records
      .find((candidate) => candidate.mark === "WAY-OF-KNOWING-DOWNGRADED");
    expect(record).toMatchObject({ scope: "node", subject_ref: producedNode?.node_id });
    // "naming node + claimed value" — the node is the subject_ref above, the
    // claimed value survives in the persisted reason.
    expect(record?.reason).toContain("LOOKED_UP");

    // A node that claimed nothing it could not keep carries no such mark.
    const honest = scenario.answer?.nodes.find((node) => node.claim === "Primary T4 position 2");
    expect(honest).toBeDefined();
    expect(honest?.condition_marks).not.toContain("WAY-OF-KNOWING-DOWNGRADED");
  });

  it("preserves the database producer-grading refusal instead of laundering it", async () => {
    const primary = await startProviderDouble(
      Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary shared-maker position ${index + 1}`))
    );
    const secondary = await startProviderDouble([
      ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary shared-maker position ${index + 1}`)),
      reviewDouble("agree", "The recorded maker is intentionally shared for this integrity probe.")
    ]);
    try {
      const runId = await createRun("xrev-01-producer-grading-preserved", 42, 2, 1);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId,
        batteryRowId: "Q1",
        nodeSet: [],
        commandKey: "runner-test:xrev-01-producer-grading-preserved"
      });
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: primary.endpoint,
        model: "test-layer/primary-model",
        maker: "Recorded shared maker"
      }), {
        ...runnerSettings(),
        maker: "Declared primary maker",
        critique: {
          provider: createPostgresProviderGateway(database.pool, {
            endpoint: secondary.endpoint,
            model: "test-layer/secondary-model",
            maker: "Recorded shared maker"
          }),
          providerRef: "provider:test-layer:secondary",
          maker: "Declared secondary maker"
        },
        scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" }
      });

      await expect(runner.executeWorkItem(workItemId)).rejects.toMatchObject({
        code: "PRODUCER_GRADING_FORBIDDEN"
      });
      const answers = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM serve.answer WHERE run_id=$1",
        [runId]
      );
      expect(answers.rows[0]?.count).toBe("0");
    } finally {
      await secondary.stop();
      await primary.stop();
    }
  });

  it("finding 14 — refuses unresolved judgement policy before claiming the work item", async () => {
    const provider = await startProviderDouble([]);
    try {
      const work = await createRunnerWork("policy-before-claim");
      const { judgementPolicy: _omitted, ...settingsWithoutPolicy } = runnerSettings();
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: provider.endpoint, model: "model:test-layer", maker: "maker:test-layer"
      }), settingsWithoutPolicy);

      await expect(runner.executeWorkItem(work.workItemId)).rejects.toMatchObject({
        code: "JUDGEMENT_POLICY_UNRESOLVED"
      });
      const state = await database.pool.query<{ state: string; claimed_by: string | null }>(
        "SELECT state, claimed_by FROM core.work_item WHERE work_item_id=$1",
        [work.workItemId]
      );
      expect(state.rows[0]).toEqual({ state: "READY", claimed_by: null });
      expect(provider.calls()).toBe(0);
    } finally { await provider.stop(); }
  });

  // J12 (T3 F6): an M>=2 run whose deployment never sealed the T16 panel rows STOPS
  // LOUDLY. Recording a reason and proceeding is the silent-degradation shape the goal
  // repeals; this follows the scoringOperator precedent exactly — the stop lands BEFORE
  // the work item is claimed and BEFORE a single token of model spend.
  it("J12 — refuses unsealed panel weighting on a multi-maker run before claiming or spending", async () => {
    const primary = await startProviderDouble([]);
    const secondary = await startProviderDouble([]);
    try {
      const work = await createRunnerWork("panel-policy-before-claim");
      const { panelPolicy: _omitted, ...settingsWithoutPanelPolicy } = runnerSettings();
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: primary.endpoint, model: "model:test-layer", maker: "maker:test-layer"
      }), {
        ...settingsWithoutPanelPolicy,
        critique: {
          provider: createPostgresProviderGateway(database.pool, {
            endpoint: secondary.endpoint, model: "model:test-layer:secondary", maker: "maker:test-layer:secondary"
          }),
          providerRef: "provider:test-layer:secondary",
          maker: "maker:test-layer:secondary"
        },
        // Supplied so the DR-074 multi-maker guard is satisfied and the PANEL guard is
        // demonstrably the one that fires.
        scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" }
      });

      await expect(runner.executeWorkItem(work.workItemId)).rejects.toMatchObject({
        code: "PANEL_WEIGHTING_UNRESOLVED"
      });
      const state = await database.pool.query<{ state: string; claimed_by: string | null }>(
        "SELECT state, claimed_by FROM core.work_item WHERE work_item_id=$1",
        [work.workItemId]
      );
      expect(state.rows[0]).toEqual({ state: "READY", claimed_by: null });
      // Zero model-call spend: the missing row can never become a degraded self-grade
      // paid for with real tokens.
      expect(primary.calls()).toBe(0);
      expect(secondary.calls()).toBe(0);
    } finally {
      await secondary.stop();
      await primary.stop();
    }
  });

  /**
   * T3 r2 · B4 + B5 — the repeated-family MULTIPLIER and the PARTIAL mark, on one
   * M=3 real-database fixture.
   *
   * Topology: makers A and B share ONE sealed provider family; C is its own. The
   * register's family map groups by maker, so two provider refs sharing a family is a
   * lawful deployment (two endpoints of one maker) — not a contrivance.
   *
   * On the node A authors:
   *   - B assesses successfully. B is the SECOND appearance of the shared family, so
   *     `applyCorrelatedErrorDiscount` gives it ordinal 2 and multiplies its weight.
   *   - C returns prose, so the panel records a typed PARSE_FAILURE and PROCEEDS on the
   *     voices that parsed — confirm-item 5's middle arm, marked PANEL-PARTIAL.
   *
   * The discount is made LOAD-BEARING FOR THE OUTCOME, not merely recorded: B scores a
   * HIGHER tau than A (0.9 vs 0.5). Undiscounted, B would win selection outright
   * (0.9 > 0.5). Discounted, B scores 0.9 × 0.5 = 0.45 and A's 0.5 survives. Asserting
   * the selected tau is therefore an assertion about the multiplier arithmetic itself.
   */
  it("B4/B5 — discounts a repeated provider family and marks a partial panel (M=3)", async () => {
    const authorFidelity = 0.5;
    const repeatedFamilyFidelity = 0.9;
    const makerA = await startProviderDouble([
      ...Array.from({ length: 6 }, (_, index) => judgementDouble(`Family A position ${index + 1}`, authorFidelity)),
      ...Array.from({ length: 12 }, (_, index) => reviewDouble("agree", `Family A review ${index + 1}`)),
      // The primary maker also carries the composer/conformance chain, so this run
      // reaches a real serve instead of an envelope terminal.
      JSON.stringify({ segments: [
        { segment_id: "segment:verdict", text: "Family A position 1", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
        { segment_id: "segment:research", text: "Check a test-layer source.", node_refs: [], served_number_refs: [] }
      ] }),
      evaluatorSatisfied()
    ]);
    // B parses, and scores ABOVE the author — only the discount keeps it from winning.
    const makerB = await startProviderDouble([
      ...Array.from({ length: 6 }, (_, index) => judgementDouble(`Family B position ${index + 1}`, authorFidelity)),
      ...Array.from({ length: 12 }, (_, index) => reviewDouble("agree", `Family B review ${index + 1}`))
    ], panelAssessmentDouble(repeatedFamilyFidelity));
    // C refuses in prose: a typed PARSE_FAILURE member, never a silent drop.
    const makerC = await startProviderDouble([
      ...Array.from({ length: 6 }, (_, index) => judgementDouble(`Family C position ${index + 1}`, authorFidelity)),
      ...Array.from({ length: 12 }, (_, index) => reviewDouble("agree", `Family C review ${index + 1}`))
    ], "I decline to assess another maker's node.");
    try {
      // Same envelope shape as the three-maker rotation fixture above: the run reaches
      // its envelope terminal and serves without a composer leg. The root A authors is
      // judged FIRST, so its panel receipt is persisted long before that terminal.
      const runId = await createRun("t3-repeated-family-and-partial", 90, 3, 1);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId, batteryRowId: "Q1", nodeSet: [],
        commandKey: "runner-test:t3-repeated-family-and-partial"
      });
      const settings = runnerSettings();
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: makerA.endpoint, model: "test-layer/family-a", maker: "Family maker A"
      }), {
        ...settings,
        providerRef: "provider:test-layer",
        maker: "Family maker A",
        critique: {
          provider: createPostgresProviderGateway(database.pool, {
            endpoint: makerB.endpoint, model: "test-layer/family-b", maker: "Family maker B"
          }),
          providerRef: "provider:test-layer:secondary",
          maker: "Family maker B"
        },
        additionalMakers: [{
          provider: createPostgresProviderGateway(database.pool, {
            endpoint: makerC.endpoint, model: "test-layer/family-c", maker: "Family maker C"
          }),
          providerRef: "provider:test-layer:third",
          maker: "Family maker C"
        }],
        panelPolicy: {
          ...settings.panelPolicy!,
          // A and B share one sealed family; C stands alone.
          providerFamilies: [
            {
              familyRef: "test-layer:family:shared",
              providerRefs: ["provider:test-layer", "provider:test-layer:secondary"]
            },
            { familyRef: "test-layer:family:solo", providerRefs: ["provider:test-layer:third"] }
          ]
        },
        scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" }
      });

      const result = await runner.executeWorkItem(workItemId);
      expect(result.kind).toBe("COMPLETED");
      if (result.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");

      const receipt = await database.pool.query<{
        tau: string;
        dispersion: number | null;
        disagreement: {
          readonly marks: readonly string[];
          readonly panel: {
            readonly authorProviderRef: string;
            readonly nonAuthorVoiceCount: number;
            readonly members: readonly {
              readonly memberRole: string;
              readonly familyRef: string | null;
              readonly familyOrdinal: number | null;
              readonly earnedWeight: number;
              readonly effectiveWeight: number;
            }[];
            readonly notes: readonly { readonly memberRole: string; readonly failureKind: string }[];
          };
        };
      }>(
        `SELECT tau::text AS tau, dispersion, disagreement FROM ledger.reduced_judgement
         WHERE run_id=$1 AND disagreement->'panel'->>'authorProviderRef' = 'provider:test-layer'
         ORDER BY at_seq LIMIT 1`,
        [runId]
      );
      const row = receipt.rows[0];
      if (row === undefined) throw new Error("T3_PANEL_RECEIPT_MISSING_FOR_AUTHOR");

      // B5 — confirm-item 5's middle arm: proceed on the parsed voices, and SAY SO.
      expect(row.disagreement.marks).toContain("PANEL-PARTIAL");
      expect(row.disagreement.marks).not.toContain("PANEL-DEGRADED-SINGLE-VOICE");
      expect(row.disagreement.panel.nonAuthorVoiceCount).toBe(1);
      // Two notes, and both matter: C's typed parse failure (the partial arm), and the
      // author's own refused seat — author != judge is enforced on THIS node, not
      // merely in the abstract.
      expect(row.disagreement.panel.notes).toEqual(expect.arrayContaining([
        expect.objectContaining({ memberRole: "Family maker C", failureKind: "PARSE_FAILURE" }),
        expect.objectContaining({ memberRole: "Family maker A", failureKind: "PRODUCER_GRADING_FORBIDDEN" })
      ]));
      expect(row.disagreement.panel.notes).toHaveLength(2);

      // B4 — the repeated family is DISCOUNTED, with the sealed multiplier.
      const members = row.disagreement.panel.members;
      expect(members).toHaveLength(2);
      const [first, second] = members;
      expect(first).toMatchObject({ familyRef: "test-layer:family:shared", familyOrdinal: 1 });
      expect(first!.effectiveWeight).toBe(first!.earnedWeight);
      expect(second).toMatchObject({ familyRef: "test-layer:family:shared", familyOrdinal: 2 });
      expect(second!.effectiveWeight)
        .toBe(second!.earnedWeight * settings.panelPolicy!.repeatedFamilyMultiplier);
      // Not merely recorded — DECISIVE. B's higher tau loses only because its repeated
      // family was discounted; drop the multiplier and the selected tau becomes 0.9.
      expect(Number(row.tau)).toBeCloseTo(authorFidelity, 10);
      expect(row.dispersion).toBeCloseTo(repeatedFamilyFidelity - authorFidelity, 10);

      // J13(b) / B6 — the disclosure must survive the CANONICAL machinery, not only the
      // untyped receipt JSON above. This reads the served answer back through
      // `ServeRepository.readAnswerProjection`, whose every mark goes through
      // `ConditionMarkSchema.parse` — a mark absent from the kernel vocabulary is
      // REJECTED there rather than disclosed, so this assertion is the production seam.
      const projection = await new ServeRepository(database.pool)
        .readAnswerProjection(result.answerId, "asker:t3-repeated-family-and-partial");
      expect(projection?.condition_marks).toEqual(expect.arrayContaining(["PANEL-PARTIAL"]));
      // Node scope, bound to the node whose panel was partial — the disclosure is
      // visible where the degradation happened, not only on the answer (T4 discipline).
      const partialRecord = projection?.condition_mark_records
        .find((record) => record.mark === "PANEL-PARTIAL");
      expect(partialRecord).toMatchObject({ scope: "node" });
      expect(partialRecord?.affected_node_ids ?? []).not.toHaveLength(0);
      expect(partialRecord?.reason).toContain("Family maker C");
    } finally {
      await makerC.stop();
      await makerB.stop();
      await makerA.stop();
    }
  });

  // J12 coherence: a MONO-maker run is untouched by the panel guard — the walking
  // skeleton keeps working on a deployment that never needed panel rows at all.
  it("J12 — leaves a single-maker run free of any panel-weighting requirement", async () => {
    const provider = await startProviderDouble([]);
    try {
      const work = await createRunnerWork("panel-policy-mono-exempt");
      const { panelPolicy: _omitted, ...settingsWithoutPanelPolicy } = runnerSettings();
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: provider.endpoint, model: "model:test-layer", maker: "maker:test-layer"
      }), settingsWithoutPanelPolicy);

      // It must NOT stop on panel weighting. It stops later, on the empty double.
      await expect(runner.executeWorkItem(work.workItemId)).rejects.not.toMatchObject({
        code: "PANEL_WEIGHTING_UNRESOLVED"
      });
    } finally { await provider.stop(); }
  });

  it("claims, judges through the HTTP gateway, propagates, serves, and settles", async () => {
    const provider = await startProviderDouble([
      JSON.stringify({ statement: "A provisional answer.", way_of_knowing: "REASONING",
        locator: null, restatement_text: "A provisional answer.", restatement_status: "PASS", value_laden: false,
        steelman: { summary: "A provisional answer.", fidelity: 0.72 }, critic: { summary: "Plausible counter.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
        evidence: { quality: 0.72, relevance: 0.72 }, context: { fit: 0.72, ambiguityFlags: [] }, fallacy: { severity: 0.28, fatalFlags: [] } }),
      JSON.stringify({ segments: [
        { segment_id: "segment:verdict", text: "A provisional answer.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
        { segment_id: "segment:research", text: "Check an independent source.", node_refs: [], served_number_refs: [] }
      ] }),
      evaluatorSatisfied()
    ]);
    try {
      const work = await createRunnerWork("happy-path");
      const result = await runnerWithEndpoint(provider.endpoint).executeWorkItem(work.workItemId);
      expect(result.kind).toBe("COMPLETED");
      // T9: a served run makes THREE model calls now — judge, SYNTHESIZER,
      // EVALUATOR — where it used to make five (judge, composer, two
      // conformance segments, post-compose R9). The two retired organs are
      // one evaluator call, and a satisfied evaluator ends the loop in round 1.
      expect(provider.calls()).toBe(3);
      const row = await database.pool.query<{ state: string; terminal: string; base_kind: string; final_kind: string; base_producer: string; final_producer: string; reduced_judgement_id: string; walked_reduced_judgement_ref: string; disagreement: unknown }>(
        `SELECT work.state, answer.terminal, judgement.number_kind AS base_kind, strength.number_kind AS final_kind,
                judgement.producer AS base_producer, strength.producer AS final_producer,
                judgement.reduced_judgement_id, strength.reduced_judgement_ref AS walked_reduced_judgement_ref,
                judgement.disagreement
         FROM core.work_item AS work JOIN serve.answer AS answer ON answer.answer_id = work.settled_artifact_ref
         JOIN core.node AS node ON node.run_id = work.run_id
         JOIN ledger.node_strength_record AS strength ON strength.node_id = node.node_id
         JOIN ledger.reduced_judgement AS judgement
           ON judgement.reduced_judgement_id = strength.reduced_judgement_ref
         WHERE work.work_item_id = $1`, [work.workItemId]
      );
      expect(row.rows[0]).toMatchObject({ state: "DONE", terminal: "DOWNGRADED",
        base_kind: "base-probability", final_kind: "propagated-probability",
        base_producer: "judgement:test-layer", final_producer: "propagation:test-layer" });
      expect(row.rows[0]?.walked_reduced_judgement_ref).toBe(row.rows[0]?.reduced_judgement_id);
      expect(row.rows[0]?.disagreement).toEqual({
        kind: "NOT_MEASURED",
        reason: "SINGLE_JUDGE_WALKING_SKELETON",
        predicateRef: null,
        observationRef: null,
        certaintyEffect: "UNCHANGED",
        abstention: false
      });
      if (result.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");
      const projection = await new ServeRepository(database.pool).readAnswerProjection(result.answerId, "asker:happy-path");
      expect(projection).toMatchObject({
        verdict_state: "SUPPORTED",
        verdict_unavailable: null,
        confidence_band: "TEST_CAPPED_BAND",
        band_ceiling: { label: "TEST_DEFAULT_CEILING" },
        condition_marks: ["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"]
      });
      expect(projection?.condition_mark_records).toEqual(expect.arrayContaining([
        expect.objectContaining({
          mark: "SINGLE-LINEAGE",
          reason: "MONO_MAKER_RUN",
          lift_path: "RUN_DIFFERENT_MAKER_CRITIQUE"
        }),
        expect.objectContaining({
          mark: "CRITIQUE-UNAVAILABLE",
          reason: "MONO_LINEAGE_DEPTH_NOT_EXPANDED:requested_depth=1",
          lift_path: "RUN_DIFFERENT_MAKER_CRITIQUE"
        })
      ]));
      expect(projection?.nodes[0]?.base_score).toMatchObject({
        kind: "base-probability", producer: "judgement:test-layer"
      });
      expect(projection?.nodes[0]?.base_score.replay_handle).toMatch(/^judgement:/);
      expect(projection?.nodes[0]?.final_strength).toMatchObject({
        kind: "propagated-probability", producer: "propagation:test-layer"
      });
      expect(projection?.nodes[0]?.maker_lineage).toEqual({
        maker: "test-layer",
        model_id: "test-layer/model",
        transport: "openai-compatible-http",
        provider_ref: "provider:test-layer"
      });

      const nodeId = projection?.nodes[0]?.node_id;
      if (nodeId === undefined) throw new Error("TEST_EXPECTED_NODE");
      expect(projection).toMatchObject({ staleness_state: "FRESH" });
      expect(projection?.relevant_as_of).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      const liveness = new LivenessRepository(database.pool);
      await liveness.recordTriggerFired({
        runId: work.runId,
        triggerKey: "test-layer:q58-condition",
        triggerKind: "WATCHED_CONDITION",
        affectedSubjects: [
          { kind: "ANSWER", ref: result.answerId },
          { kind: "NODE", ref: nodeId }
        ],
        reason: "TEST_LAYER_RECORDED_CONDITION_CHANGED"
      });
      const staleFirstRead = await new ServeRepository(database.pool)
        .readAnswerProjection(result.answerId, "asker:happy-path");
      const staleSecondRead = await new ServeRepository(database.pool)
        .readAnswerProjection(result.answerId, "asker:happy-path");
      expect(staleFirstRead).toMatchObject({ staleness_state: "STALE" });
      expect(staleFirstRead?.badges).toContain("STALE");
      expect(staleSecondRead).toMatchObject({ staleness_state: "STALE" });
      const streamEvent = await database.pool.query<{ kind: string; value_json: unknown }>(
        `SELECT kind, value_json FROM core.run_progress_event
         WHERE run_id=$1 AND kind='honesty.staleness_trigger_fired' ORDER BY at_seq DESC LIMIT 1`,
        [work.runId]
      );
      expect(streamEvent.rows[0]).toMatchObject({
        kind: "honesty.staleness_trigger_fired",
        value_json: { trigger_key: "test-layer:q58-condition" }
      });

      await liveness.resolveRevisionTrigger(work.runId, "test-layer:q58-condition", "TEST_LAYER_REVIEW_COMPLETE");
      const graphCountBefore = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM core.node WHERE run_id=$1",
        [work.runId]
      );
      const archivedRuns = await liveness.sweep(new Date("2030-01-01T00:00:00Z"), {
        rowKey: "livenessPolicy",
        registerVersion: 1,
        sourceRef: "test-layer:DR-015-016",
        questionClass: "standard",
        reviewAfterMs: 86_400_000,
        retireAfterMs: 180 * 86_400_000
      });
      expect(archivedRuns).toContain(work.runId);
      await liveness.recordQuery("happy-path", "asker:happy-path", new Date("2030-01-02T00:00:00Z"));
      const revived = await new ServeRepository(database.pool)
        .readAnswerProjection(result.answerId, "asker:happy-path");
      expect(revived).toMatchObject({ staleness_state: "ARCHIVED_REVIVED" });
      expect(revived?.badges).toContain("UNDER-REVIEW");
      const graphCountAfter = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM core.node WHERE run_id=$1",
        [work.runId]
      );
      expect(graphCountAfter.rows[0]?.count).toBe(graphCountBefore.rows[0]?.count);
      await expect(database.pool.query(
        "DELETE FROM core.staleness_state WHERE run_id=$1",
        [work.runId]
      )).rejects.toThrow();

      const frozenConformanceBefore = await database.pool.query<{ segment_results: unknown }>(
        `SELECT conformance.segment_results
         FROM serve.answer AS answer
         JOIN serve.conformance_record AS conformance
           ON conformance.conformance_record_id = answer.conformance_record_id
         WHERE answer.answer_id=$1 AND answer.answer_version=1`,
        [result.answerId]
      );
      const servedNumber = await database.pool.query<{ served_number_id: string }>(
        "SELECT served_number_id FROM serve.served_number WHERE answer_id=$1 AND answer_version=1",
        [result.answerId]
      );
      await new ServeRepository(database.pool).recordReplayEviction(servedNumber.rows[0]!.served_number_id);

      const currentProjection = await new ServeRepository(database.pool)
        .readAnswerProjection(result.answerId, "asker:happy-path");
      const sealedProjection = await new ServeRepository(database.pool)
        .readAnswerProjection(result.answerId, "asker:happy-path", 1);
      expect(currentProjection).toMatchObject({
        terminal: "COMPONENTS_ONLY",
        serve_state: "COMPONENTS_ONLY",
        composed_text: [],
        number_slots: [{ status: "EVICTED", mark: "MISSING-NUMBER" }]
      });
      expect(currentProjection?.condition_marks).toContain("DEFECT");
      expect(sealedProjection).toMatchObject({
        terminal: "DOWNGRADED",
        serve_state: "COMPOSED",
        number_slots: [{ status: "PRESENT" }]
      });
      expect(sealedProjection?.composed_text).toHaveLength(2);
      const frozenConformanceAfter = await database.pool.query<{ segment_results: unknown }>(
        `SELECT conformance.segment_results
         FROM serve.answer AS answer
         JOIN serve.conformance_record AS conformance
           ON conformance.conformance_record_id = answer.conformance_record_id
         WHERE answer.answer_id=$1 AND answer.answer_version=1`,
        [result.answerId]
      );
      expect(frozenConformanceAfter.rows[0]?.segment_results)
        .toEqual(frozenConformanceBefore.rows[0]?.segment_results);
      const suppression = await database.pool.query<{ segment_id: string }>(
        "SELECT segment_id FROM serve.segment_suppression WHERE answer_id=$1 AND answer_version=1",
        [result.answerId]
      );
      expect(suppression.rows.map((row) => row.segment_id)).toEqual(["segment:verdict"]);
      await expect(new ServeRepository(database.pool).readInspectionProjection(
        result.answerId, "asker:happy-path", 1
      ))
        .resolves.toMatchObject({
          answer_id: result.answerId,
          answer_version: 1,
          conformance: { outcome: "PASS", coverage_mode: "EXHAUSTIVE" },
          segment_suppressions: [{
            segment_id: "segment:verdict",
            evicted_number_ref: "number:final-strength"
          }]
        });
      await expect(new ServeRepository(database.pool).readInspectionProjection(
        result.answerId, "asker:not-owner", 1
      )).resolves.toBeNull();
    } finally { await provider.stop(); }
  });

  it("derives and persists a firing WOK band ceiling from the register cut matrix", async () => {
    const provider = await startProviderDouble([
      JSON.stringify({ statement: "A looked-up answer.", way_of_knowing: "LOOKED_UP",
        locator: "https://example.invalid/test-layer", restatement_text: "A looked-up answer.", restatement_status: "PASS", value_laden: false,
        steelman: { summary: "A looked-up answer.", fidelity: 0.72 }, critic: { summary: "Plausible counter.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
        evidence: { quality: 0.72, relevance: 0.72 }, context: { fit: 0.72, ambiguityFlags: [] }, fallacy: { severity: 0.28, fatalFlags: [] } }),
      JSON.stringify({ segments: [
        { segment_id: "segment:verdict", text: "A looked-up answer.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
        { segment_id: "segment:research", text: "Check another source.", node_refs: [], served_number_refs: [] }
      ] }),
      evaluatorSatisfied()
    ]);
    try {
      const work = await createRunnerWork("band-ceiling-capped");
      const result = await runnerWithEndpoint(provider.endpoint).executeWorkItem(work.workItemId);
      if (result.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");
      await expect(new ServeRepository(database.pool).readAnswerProjection(
        result.answerId, "asker:band-ceiling-capped"
      )).resolves.toMatchObject({
        terminal: "SERVED",
        confidence_band: "TEST_CAPPED_BAND",
        band_ceiling: {
          label: "TEST_LOOKED_UP_CEILING",
          basis: { LOOKED_UP: 1, RAN: 0, REASONING: 0 },
          register_row_key: "wayOfKnowingCeiling"
        }
      });
      // T9: a served run makes THREE model calls now — judge, SYNTHESIZER,
      // EVALUATOR — where it used to make five (judge, composer, two
      // conformance segments, post-compose R9). The two retired organs are
      // one evaluator call, and a satisfied evaluator ends the loop in round 1.
      expect(provider.calls()).toBe(3);
    } finally { await provider.stop(); }
  });

  /**
   * T9 (goal 248-251), at RUN level. This fixture used to prove the pre-compose
   * R9 GATE: a load-bearing node whose restatement FAILED ended the run in
   * COMPONENTS_ONLY + DEFECT after exactly one model call. That gate is retired
   * — R9 is an EVALUATOR OBJECTION CRITERION now — so the same input must reach
   * the synthesizer, earn the objection, and SERVE on the round that answers it.
   */
  it("serves a failed-restatement run through the evaluator instead of blocking it (former pre-compose R9 gate)", async () => {
    const objection = "A stranger could not restate this claim from the digest alone.";
    const reasoningSegments = JSON.stringify({ segments: [
      { segment_id: "segment:hypothesis", text: "Hypothesis: the answer holds provisionally.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
      { segment_id: "segment:research", text: "Research plan: find a source a stranger could restate.", node_refs: [], served_number_refs: [] }
    ] });
    const provider = await startProviderDouble([
      JSON.stringify({
        statement: "A blocked answer.", way_of_knowing: "REASONING", locator: null,
        restatement_text: "Different meaning.", restatement_status: "FAIL", value_laden: false,
        steelman: { summary: "A blocked answer.", fidelity: 0.4 }, critic: { summary: "Plausible counter.", counterargumentStrength: 0.6, basis: "PLAUSIBLE_COUNTER" },
        evidence: { quality: 0.4, relevance: 0.4 }, context: { fit: 0.4, ambiguityFlags: [] }, fallacy: { severity: 0.6, fatalFlags: [] }
      }),
      // round 1: the synthesizer writes, the evaluator objects ON RESTATEMENT —
      // the very predicate the retired gate used to terminate on.
      reasoningSegments,
      JSON.stringify({
        satisfied: false,
        objection,
        criteria: {
          fairness_to_losers: true, statement_label_agreement: true,
          no_overstatement: true, restatement: false, citation_tracing: true
        }
      }),
      // round 2: the feedback is answered and the run serves.
      reasoningSegments,
      evaluatorSatisfied()
    ]);
    try {
      const work = await createRunnerWork("pre-compose-block");
      const result = await runnerWithEndpoint(provider.endpoint).executeWorkItem(work.workItemId);
      expect(result.kind).toBe("COMPLETED");
      const row = await database.pool.query<{ state: string; terminal: string; serve_state: string; composed_text_id: string | null }>(
        `SELECT work.state, answer.terminal, answer.serve_state, answer.composed_text_id
         FROM core.work_item AS work JOIN serve.answer AS answer ON answer.answer_id = work.settled_artifact_ref
         WHERE work.work_item_id = $1`, [work.workItemId]
      );
      // NOT components-only, and the second round is recorded as the recompose.
      expect(row.rows[0]).toMatchObject({
        state: "DONE", terminal: "DOWNGRADED", serve_state: "RECOMPOSED_ONCE"
      });
      expect(row.rows[0]?.composed_text_id).not.toBeNull();
      if (result.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");
      const projection = await new ServeRepository(database.pool).readAnswerProjection(result.answerId, "asker:pre-compose-block");
      expect(projection).toMatchObject({
        terminal: "DOWNGRADED",
        serve_state: "RECOMPOSED_ONCE",
        verdict_unavailable: null
      });
      expect(projection?.condition_marks).not.toContain("DEFECT");
      // judge + (synthesizer, evaluator) x 2 rounds.
      expect(provider.calls()).toBe(5);

      // ---- J25 + J29 (+ ADDENDUM): the ROUNDS, read back and RESOLVED ----
      // The verbatim-objection claim is asserted on the RECORDED REQUEST at the
      // provider seam (tests/unit/t09-synthesis.test.ts), which is where the
      // frozen SPEC puts it. This table holds no request body: the same
      // in-memory object fed the packet and the row, so a stored copy could
      // never have evidenced "as sent".
      const rounds = await new ServeRepository(database.pool).readSynthesisRounds(
        result.answerId, "asker:pre-compose-block", 1
      );
      expect(rounds.map((round) => round.round)).toEqual([1, 2]);
      expect(rounds.map((round) => round.synthesizerStage)).toEqual(["INITIAL", "RETRY"]);
      expect(rounds.map((round) => round.evaluatorSatisfied)).toEqual([false, true]);
      const [first, second] = rounds;
      // Each round names its OWN producer call sites, round number included.
      expect(first!.candidateCallSiteKey).toBe("COMPOSER:SYNTHESIZER:INITIAL:1");
      expect(second!.candidateCallSiteKey).toBe("COMPOSER:SYNTHESIZER:RETRY:2");
      expect(first!.evaluatorCallSiteKey).toBe("POST_COMPOSE_R9:EVALUATOR:1");
      expect(second!.evaluatorCallSiteKey).toBe("POST_COMPOSE_R9:EVALUATOR:2");
      expect(first!.candidateArtifactRef).not.toBe(second!.candidateArtifactRef);

      // codex r3 B2: resolve each reference through the LEDGER ENTRY that
      // recorded it — this run, this work item, a successful MODEL_CALL, at the
      // stored call site. "Belongs to the run" was not a producer binding.
      const bound = await database.pool.query<{ round: number; role: string }>(
        `SELECT synthesis_round.round,
                CASE WHEN entry.raw_artifact_ref = synthesis_round.candidate_artifact_ref
                     THEN 'SYNTHESIZER' ELSE 'EVALUATOR' END AS role
           FROM serve.synthesis_round AS synthesis_round
           JOIN serve.answer AS answer
             ON answer.answer_id = synthesis_round.answer_id
            AND answer.answer_version = synthesis_round.answer_version
           JOIN ledger.ledger_entry AS entry
             ON entry.run_id = answer.run_id
            AND entry.subject_item_id = $2
            AND entry.action_kind = 'MODEL_CALL'
            AND entry.outcome = 'OK'
            AND ((entry.raw_artifact_ref = synthesis_round.candidate_artifact_ref
                  AND entry.call_site_key = synthesis_round.candidate_call_site_key)
              OR (entry.raw_artifact_ref = synthesis_round.evaluator_artifact_ref
                  AND entry.call_site_key = synthesis_round.evaluator_call_site_key))
          WHERE synthesis_round.answer_id=$1 AND synthesis_round.answer_version=1
          ORDER BY synthesis_round.round, role`,
        [result.answerId, work.workItemId]
      );
      // Two rounds x two producers, each resolving to the call the ledger recorded.
      expect(bound.rows.map((row) => `${String(row.round)}:${row.role}`))
        .toEqual(["1:EVALUATOR", "1:SYNTHESIZER", "2:EVALUATOR", "2:SYNTHESIZER"]);

      // A reader who is not the owner gets nothing.
      await expect(new ServeRepository(database.pool).readSynthesisRounds(
        result.answerId, "asker:someone-else", 1
      )).resolves.toEqual([]);

      // No content column exists on this table at all.
      const columns = await database.pool.query<{ columns: string[] }>(
        `SELECT array_agg(column_name::text) AS columns
           FROM information_schema.columns
          WHERE table_schema='serve' AND table_name='synthesis_round'`
      );
      for (const banned of ["synthesizer_request", "candidate_statement", "evaluator_request",
        "evaluator_verdict", "round_objection", "content_ciphertext", "content_attestation"]) {
        expect(columns.rows[0]?.columns).not.toContain(banned);
      }

      const terminal = await database.pool.query("SELECT 1 FROM core.run_progress_event WHERE run_id=$1 AND kind='TERMINAL'", [work.runId]);
      expect(terminal.rowCount).toBe(1);
    } finally { await provider.stop(); }
  });

  /**
   * F4 / codex r1 B3 / J25 — the RETIRED GUARD's disclosure, through persistence.
   *
   * Before T9 this run could not exist: the envelope terminal threw
   * `PROTECTED_CORE_NOT_VERIFIED` whenever the served root's restatement had
   * failed, because the guard was keyed on R9's gate-hood. R9 is an evaluator
   * criterion now, so the terminal fires anyway — and the failing status must
   * still reach a READER. The first filing put it in the gate trace, which
   * persistence discards except for its last token, so nobody could see it.
   */
  it("F4 persists the retired-guard disclosure as a visible mark when the envelope stops a FAILED restatement", async () => {
    const provider = await startProviderDouble([JSON.stringify({
      statement: "A budget-bounded component.", way_of_knowing: "REASONING", locator: null,
      restatement_text: "A different meaning.", restatement_status: "FAIL", value_laden: false,
      steelman: { summary: "A budget-bounded component.", fidelity: 0.6 },
      critic: { summary: "Plausible counter.", counterargumentStrength: 0.4, basis: "PLAUSIBLE_COUNTER" },
      evidence: { quality: 0.6, relevance: 0.6 }, context: { fit: 0.6, ambiguityFlags: [] },
      fallacy: { severity: 0.4, fatalFlags: [] }
    })]);
    try {
      const runId = await createRun("cost-envelope-retired-guard", 1);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId, batteryRowId: "Q1", nodeSet: [], commandKey: "runner-test:cost-envelope-retired-guard"
      });
      const result = await runnerWithEndpoint(provider.endpoint).executeWorkItem(workItemId);
      expect(result.kind).toBe("COMPLETED");
      if (result.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");

      // The mark is on the SERVED ANSWER a reader projects, not in a returned array.
      const projection = await new ServeRepository(database.pool)
        .readAnswerProjection(result.answerId, "asker:cost-envelope-retired-guard");
      expect(projection?.terminal).toBe("COMPONENTS_ONLY");
      expect(projection?.condition_marks).toContain("PROTECTED-CORE-GUARD-RETIRED");
      expect(projection?.condition_marks).toContain("ENVELOPE_EXHAUSTED");

      // ...and it has a paired RECORD naming the node and saying what happened.
      const record = projection?.condition_mark_records
        .find((entry) => entry.mark === "PROTECTED-CORE-GUARD-RETIRED");
      expect(record).toBeDefined();
      expect(record?.reason).toContain("FAIL");
      expect(record?.reason).toContain("no longer decides");

      // The row itself carries it, so this is not a projection-only artifact.
      const stored = await database.pool.query<{ condition_marks: string[] }>(
        "SELECT condition_marks FROM serve.answer WHERE answer_id=$1 AND answer_version=1",
        [result.answerId]
      );
      expect(stored.rows[0]?.condition_marks).toContain("PROTECTED-CORE-GUARD-RETIRED");
    } finally { await provider.stop(); }
  });

  it("FX-C52-06/07 · FX-LG-05 · FX-SRV-16 hard-stops visibly after typed enrichment skips", async () => {
    const provider = await startProviderDouble([JSON.stringify({
      statement: "A verified budget-bounded component.", way_of_knowing: "REASONING", locator: null,
      restatement_text: "A verified budget-bounded component.", restatement_status: "PASS", value_laden: false,
      steelman: { summary: "A verified budget-bounded component.", fidelity: 0.6 },
      critic: { summary: "Plausible counter.", counterargumentStrength: 0.4, basis: "PLAUSIBLE_COUNTER" },
      evidence: { quality: 0.6, relevance: 0.6 }, context: { fit: 0.6, ambiguityFlags: [] },
      fallacy: { severity: 0.4, fatalFlags: [] }
    })]);
    try {
      const runId = await createRun("cost-envelope-hard-stop", 1);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId, batteryRowId: "Q1", nodeSet: [], commandKey: "runner-test:cost-envelope-hard-stop"
      });
      const result = await runnerWithEndpoint(provider.endpoint).executeWorkItem(workItemId);
      expect(result.kind).toBe("COMPLETED");
      expect(provider.calls()).toBe(1);
      if (result.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");

      const projection = await new ServeRepository(database.pool)
        .readAnswerProjection(result.answerId, "asker:cost-envelope-hard-stop");
      expect(projection).toMatchObject({
        terminal: "COMPONENTS_ONLY",
        serve_state: "COMPONENTS_ONLY",
        condition_marks: [
          "SINGLE-LINEAGE",
          "CRITIQUE-UNAVAILABLE",
          "SKIPPED-BY-BUDGET",
          "ENVELOPE_EXHAUSTED"
        ],
        verdict_state: null,
        verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_ENVELOPE" },
        risk_tier: "casual",
        tier_source: "ASKER",
        tier_provenance_ref: "asker-declaration:cost-envelope-hard-stop",
        cost_envelope: {
          state: "EXHAUSTED",
          consumed_model_attempts: 1,
          protected_core: "NEVER_SKIPPABLE",
          basis: {
            max_model_attempts: 1,
            kind: "COMPUTED_STRUCTURAL_CEILING",
            formula_version: "test-v1",
            bounds_source_ref: "test:engine+register"
          }
        }
      });
      expect(projection?.condition_marks).not.toContain("DEFECT");
      expect(projection?.nodes).toHaveLength(1);
      expect(projection?.nodes[0]?.condition_marks).toEqual([
        "SINGLE-LINEAGE",
        "CRITIQUE-UNAVAILABLE",
        "SKIPPED-BY-BUDGET",
        "ENVELOPE_EXHAUSTED"
      ]);

      const budgetActions = await database.pool.query<{ action_kind: string; outcome: string; input_hash: string; sequence: string }>(
        `SELECT action_kind, outcome, input_hash, sequence::text
         FROM ledger.ledger_entry
         WHERE run_id=$1 AND action_kind='BUDGET_SKIP'
         ORDER BY sequence`,
        [runId]
      );
      expect(budgetActions.rows.map(({ action_kind, outcome }) => ({ action_kind, outcome })))
        .toEqual([
          { action_kind: "BUDGET_SKIP", outcome: "SKIPPED_BY_BUDGET" },
          { action_kind: "BUDGET_SKIP", outcome: "SKIPPED_BY_BUDGET" },
          { action_kind: "BUDGET_SKIP", outcome: "REFUSED" }
        ]);
      expect(budgetActions.rows.every((row) => /^[a-f0-9]{64}$/.test(row.input_hash))).toBe(true);
      const states = await database.pool.query<{ value_json: string; at_seq: string }>(
        `SELECT value_json #>> '{}' AS value_json, at_seq::text
         FROM core.run_progress_event
         WHERE run_id=$1 AND kind='ENVELOPE_STATE'
         ORDER BY at_seq`,
        [runId]
      );
      expect(states.rows.map((row) => row.value_json)).toEqual([
        "WITHIN", "ENRICHMENT_SKIPPED", "EXHAUSTED"
      ]);
    } finally { await provider.stop(); }
  });

  /**
   * T9 (goal 252-254, 263-266): the composition byte budget stopped being a
   * quality GATE and became a code PRECONDITION on the digest. A bound of 1 is
   * below the digest's size at MAXIMUM compression, so no digest can exist —
   * the DIGEST_CANNOT_EXIST crash class, which carries its OWN named mark
   * rather than the generic DEFECT, and never a silently truncated node set.
   */
  it("persists and settles the digest-cannot-exist crash class as components-only with its own mark", async () => {
    const provider = await startProviderDouble([JSON.stringify({
      statement: "A budget-bounded answer.", way_of_knowing: "REASONING", locator: null,
      restatement_text: "A budget-bounded answer.", restatement_status: "PASS", value_laden: false,
      steelman: { summary: "A budget-bounded answer.", fidelity: 0.6 }, critic: { summary: "Plausible counter.", counterargumentStrength: 0.4, basis: "PLAUSIBLE_COUNTER" },
      evidence: { quality: 0.6, relevance: 0.6 }, context: { fit: 0.6, ambiguityFlags: [] }, fallacy: { severity: 0.4, fatalFlags: [] }
    })]);
    const settings = runnerSettings();
    const servePolicy = settings.servePolicy!;
    const lowBudgetSettings: WalkingSkeletonSettings = {
      ...settings,
      servePolicy: {
        ...servePolicy,
        compositionBudgets: {
          ...servePolicy.compositionBudgets,
          low: { ...servePolicy.compositionBudgets.low, bound: 1 }
        }
      }
    };
    try {
      const work = await createRunnerWork("composition-budget-components-only");
      const result = await runnerWithEndpoint(provider.endpoint, lowBudgetSettings).executeWorkItem(work.workItemId);
      expect(result.kind).toBe("COMPLETED");
      const row = await database.pool.query<{
        state: string; settled_artifact_ref: string; terminal: string; serve_state: string;
        composed_text_id: string | null; conformance_record_id: string | null;
        condition_marks: string[]; fact_bundle_id: string;
      }>(
        `SELECT work.state, work.settled_artifact_ref, answer.terminal, answer.serve_state,
                answer.composed_text_id, answer.conformance_record_id, answer.condition_marks,
                answer.fact_bundle_id
         FROM core.work_item AS work JOIN serve.answer AS answer ON answer.answer_id = work.settled_artifact_ref
         WHERE work.work_item_id = $1`, [work.workItemId]
      );
      expect(row.rows[0]).toMatchObject({
        state: "DONE", terminal: "COMPONENTS_ONLY", serve_state: "COMPONENTS_ONLY",
        composed_text_id: null, conformance_record_id: null,
        condition_marks: ["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE", "DIGEST-CANNOT-EXIST"],
        fact_bundle_id: expect.any(String)
      });
      expect(row.rows[0]?.settled_artifact_ref).toBe(result.kind === "COMPLETED" ? result.answerId : null);
      expect(provider.calls()).toBe(1);
      const projection = result.kind === "COMPLETED"
        ? await new ServeRepository(database.pool).readAnswerProjection(result.answerId, "asker:composition-budget-components-only")
        : null;
      expect(projection).toMatchObject({
        terminal: "COMPONENTS_ONLY", serve_state: "COMPONENTS_ONLY",
        verdict_state: null,
        verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_DIGEST" },
        confidence_band: null, band_ceiling: null,
        composed_text: [],
        condition_marks: ["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE", "DIGEST-CANNOT-EXIST"],
        conformance_outcome: "NOT_RUN"
      });
      const terminal = await database.pool.query(
        "SELECT 1 FROM core.run_progress_event WHERE run_id=$1 AND kind='TERMINAL'", [work.runId]
      );
      expect(terminal.rowCount).toBe(1);
    } finally { await provider.stop(); }
  });

  it("completes redelivery from an existing serve artifact without another provider call", async () => {
    const provider = await startProviderDouble([
      JSON.stringify({ statement: "Replayable answer.", way_of_knowing: "REASONING", locator: null,
        restatement_text: "Replayable answer.", restatement_status: "PASS", value_laden: false,
        steelman: { summary: "Replayable answer.", fidelity: 0.6 }, critic: { summary: "Plausible counter.", counterargumentStrength: 0.4, basis: "PLAUSIBLE_COUNTER" },
        evidence: { quality: 0.6, relevance: 0.6 }, context: { fit: 0.6, ambiguityFlags: [] }, fallacy: { severity: 0.4, fatalFlags: [] } }),
      JSON.stringify({ segments: [
        { segment_id: "segment:verdict", text: "Replayable answer.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
        { segment_id: "segment:research", text: "Verify it independently.", node_refs: [], served_number_refs: [] }
      ] }),
      evaluatorSatisfied()
    ]);
    try {
      const work = await createRunnerWork("redelivery-completion");
      const runner = runnerWithEndpoint(provider.endpoint);
      const first = await runner.executeWorkItem(work.workItemId);
      if (first.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");
      await database.pool.query(
        "UPDATE core.work_item SET state='READY', settled_attempt_id=NULL, settled_artifact_ref=NULL WHERE work_item_id=$1",
        [work.workItemId]
      );
      const redelivery = await runner.executeWorkItem(work.workItemId);
      expect(redelivery).toEqual({ kind: "COMPLETED", answerId: first.answerId });
      // T9: a served run makes THREE model calls now — judge, SYNTHESIZER,
      // EVALUATOR — where it used to make five (judge, composer, two
      // conformance segments, post-compose R9). The two retired organs are
      // one evaluator call, and a satisfied evaluator ends the loop in round 1.
      expect(provider.calls()).toBe(3);
    } finally { await provider.stop(); }
  });

  /**
   * T9: the artifact this fixture redelivers from is no longer a pre-compose
   * GATE block — that gate is retired. The scripted double answers the judge and
   * nothing else, so the SYNTHESIZER's transport dies, which is one of the four
   * enumerated crash classes (TRANSPORT_DEATH) and lands components-only + DEFECT.
   * The fixture's SUBJECT is unchanged and is what the counts pin: redelivery
   * reuses the sealed artifact and makes NO further provider call.
   */
  it("completes redelivery from a components-only artifact without another provider call", async () => {
    const provider = await startProviderDouble([JSON.stringify({
      statement: "Durably blocked answer.", way_of_knowing: "REASONING", locator: null,
      restatement_text: "Different meaning.", restatement_status: "FAIL", value_laden: false,
      steelman: { summary: "Durably blocked answer.", fidelity: 0.4 }, critic: { summary: "Plausible counter.", counterargumentStrength: 0.6, basis: "PLAUSIBLE_COUNTER" },
      evidence: { quality: 0.4, relevance: 0.4 }, context: { fit: 0.4, ambiguityFlags: [] }, fallacy: { severity: 0.6, fatalFlags: [] }
    })]);
    try {
      const work = await createRunnerWork("blocked-redelivery-completion");
      const runner = runnerWithEndpoint(provider.endpoint);
      const first = await runner.executeWorkItem(work.workItemId);
      if (first.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");
      // judge + the synthesizer call whose transport died.
      const callsAfterFirstRun = provider.calls();
      expect(callsAfterFirstRun).toBe(2);
      const sealed = await new ServeRepository(database.pool)
        .readAnswerProjection(first.answerId, "asker:blocked-redelivery-completion");
      expect(sealed).toMatchObject({
        terminal: "COMPONENTS_ONLY",
        verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_DEFECT" }
      });
      await database.pool.query(
        "UPDATE core.work_item SET state='READY', settled_attempt_id=NULL, settled_artifact_ref=NULL WHERE work_item_id=$1",
        [work.workItemId]
      );
      const redelivery = await runner.executeWorkItem(work.workItemId);
      expect(redelivery).toEqual({ kind: "COMPLETED", answerId: first.answerId });
      // THE SUBJECT: redelivery added nothing.
      expect(provider.calls()).toBe(callsAfterFirstRun);
    } finally { await provider.stop(); }
  });

  it("fails an exhausted attempt without reaching the provider", async () => {
    const provider = await startProviderDouble([]);
    try {
      const work = await createRunnerWork("exhausted-attempt");
      const now = new Date();
      await new LedgerRepository(database.pool).append({
        runId: work.runId, attemptId: randomUUID(), actionKind: "MODEL_CALL", callSiteKey: "JUDGE",
        subjectItemId: work.workItemId, stanceAtAction: "UNASSIGNED", outcome: "FAILED",
        actorRef: "provider:test-layer", inputHash: "input:test-layer", contractHash: runnerSettings().judgeContractHash,
        startedAt: now, finishedAt: now
      });
      const result = await runnerWithEndpoint(provider.endpoint).executeWorkItem(work.workItemId);
      expect(result.kind).toBe("TERMINAL_FAILED");
      expect(provider.calls()).toBe(0);
      const state = await database.pool.query<{ state: string; terminal_reason: string }>(
        "SELECT state, terminal_reason FROM core.work_item WHERE work_item_id=$1", [work.workItemId]
      );
      expect(state.rows[0]).toEqual({ state: "FAILED", terminal_reason: "CALL_BUDGET_EXHAUSTED" });
    } finally { await provider.stop(); }
  });
});

describe("TERM-01 micro-round — run-scoped instrument-certification facts (Grok advisory 1)", () => {
  it("never attributes another run's instrument certifications to the completing run", async () => {
    const targetRunId = await createRun("term01-instrument-scope-target");
    const leakSourceRunId = await createRun("term01-instrument-scope-leak-source");
    const ledger = new LedgerRepository(database.pool);
    await ledger.appendRawArtifact({
      artifactId: "00000000-0000-4000-8000-0000000000a1",
      attemptId: "00000000-0000-4000-8000-0000000000a2",
      runId: leakSourceRunId,
      providerRef: "provider:test",
      provider: "test-layer-http",
      model: "fixture/model",
      maker: "fixture",
      modelVersion: "fixture-version",
      rawText: "instrument fixture artifact",
      metadata: {},
      parseStatus: "UNPARSED",
      inputHash: "1".repeat(64),
      contractHash: "2".repeat(64),
      contentHash: "3".repeat(64)
    });
    const nodeId = await new GraphRepository(database.pool).withGraphWrite(leakSourceRunId, (writer) => writer.addNode({
      runId: leakSourceRunId,
      statementText: "An instrumented statement",
      claimType: "unknown",
      parentNodeId: null,
      childKind: null,
      siblingOrdinal: 0,
      generationStatus: "complete",
      pathStatus: "active",
      explorationDecision: "continue",
      provenanceRef: "00000000-0000-4000-8000-0000000000a1",
      wayOfKnowing: "RAN",
      locator: null,
      valueLaden: false
    }));
    const gateway = await ledger.append({
      runId: leakSourceRunId,
      attemptId: "00000000-0000-4000-8000-0000000000a3",
      actionKind: "MODEL_CALL",
      callSiteKey: "INSTRUMENT:fixture",
      subjectItemId: nodeId,
      stanceAtAction: "UNASSIGNED",
      outcome: "OK",
      actorRef: "test-layer:instrument",
      inputHash: "4".repeat(64),
      contractHash: "5".repeat(64),
      rawArtifactRef: "00000000-0000-4000-8000-0000000000a1",
      startedAt: new Date(),
      finishedAt: new Date()
    });
    const probeIds = {
      positive: "00000000-0000-4000-8000-0000000000b1",
      negative: "00000000-0000-4000-8000-0000000000b2"
    } as const;
    for (const [polarity, observed, probeId] of [
      ["POSITIVE", "POSITIVE", probeIds.positive],
      ["NEGATIVE", "NEGATIVE", probeIds.negative]
    ] as const) {
      await database.pool.query(
        `INSERT INTO evidence.probe_capture (
           probe_capture_id, run_id, node_id, gateway_ledger_entry_ref, raw_artifact_ref,
           instrument_ref, expected_polarity, observed_outcome, observation, at_seq
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, ledger.allocate_sequence())`,
        [
          probeId, leakSourceRunId, nodeId, gateway.ledgerEntryId,
          "00000000-0000-4000-8000-0000000000a1", "fixture:instrument",
          polarity, observed, JSON.stringify({ fixture: true })
        ]
      );
    }
    await database.pool.query(
      `INSERT INTO evidence.instrument_certification (
         run_id, instrument_ref, positive_probe_capture_ref, negative_probe_capture_ref, outcome, at_seq
       ) VALUES ($1,$2,$3,$4,'CERTIFIED', ledger.allocate_sequence())`,
      [leakSourceRunId, "fixture:instrument", probeIds.positive, probeIds.negative]
    );
    const leakSourceFacts = await readTerminalRecordedFacts(database.pool, leakSourceRunId);
    expect(leakSourceFacts.research.instrumentCertificationCount).toBe(1);
    const targetFacts = await readTerminalRecordedFacts(database.pool, targetRunId);
    expect(targetFacts.research.instrumentCertificationCount).toBe(0);
  });
});

describe("TERM-01 rework 2 — the composer organ is told the ruled reasoning-answer segment contract", () => {
  // The S04 judge-prompt defect class on the COMPOSER organ (live ceremony 4):
  // the serve gate (packages/serve/src/index.ts:502) is byte-strict — a
  // reasoning-only answer MUST arrive as segments[0]=hypothesis and
  // segments[1]=research plan — but the composer system prompt never declared
  // that contract, so the live model returned fewer segments. The double below
  // behaves exactly like the live model: it returns the observed
  // under-segmented shape UNLESS the system prompt declares the contract.
  const reasoningContractFragments = [
    // T9/J23: the prompt now names the DIGEST nodes a segment cites, because
    // the citable set follows the digest. The fragment tracks the stable
    // clause so the test keeps proving that the contract is DECLARED.
    "rest on reasoning alone",
    "at least two segments",
    "first segment states the provisional answer as a hypothesis",
    "second segment states the research plan"
  ] as const;

  async function startContractAwareProviderDouble(): Promise<{
    readonly endpoint: string;
    composerSystemPrompt(): string;
    composerCalls(): number;
    stop(): Promise<void>;
  }> {
    let composerSystemPrompt = "";
    let composerCalls = 0;
    const server: Server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          messages: readonly { role: string; content: string }[];
        };
        const system = body.messages.find((message) => message.role === "system")?.content ?? "";
        let content: string;
        if (system.startsWith("Return only one JSON object")) {
          content = JSON.stringify({
            statement: "A reasoning-only provisional answer.", way_of_knowing: "REASONING",
            locator: null, restatement_text: "A reasoning-only provisional answer.",
            restatement_status: "PASS", value_laden: false,
            steelman: { summary: "Strongest version.", fidelity: 0.72 },
            critic: { summary: "Plausible counter.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
            evidence: { quality: 0.72, relevance: 0.72 },
            context: { fit: 0.72, ambiguityFlags: [] },
            fallacy: { severity: 0.28, fatalFlags: [] }
          });
        } else if (system.startsWith("Return only JSON with a segments array")) {
          composerSystemPrompt = system;
          const contractDeclared = reasoningContractFragments.every((fragment) => system.includes(fragment));
          composerCalls += 1;
          content = composerCalls === 1
            ? JSON.stringify({ segments: "test-layer schema rejection" })
            : contractDeclared
            ? JSON.stringify({ segments: [
                { segment_id: "segment:hypothesis", text: "Hypothesis: the reasoning answer holds provisionally.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
                { segment_id: "segment:research-plan", text: "Research plan: gather independent evidence that could lift or defeat the hypothesis.", node_refs: [], served_number_refs: [] }
              ] })
            // The live ceremony-4 observation: one verdict segment only.
            : JSON.stringify({ segments: [
                { segment_id: "segment:verdict", text: "A reasoning-only provisional answer.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] }
              ] });
        } else {
          // T9: the CONFORMANCE and post-compose-R9 prompts no longer exist on
          // the serve path; the EVALUATOR's is the only non-composer prompt a
          // served run can produce, and it is matched by its own text rather
          // than by falling through to a retired organ's shape.
          content = evaluatorSatisfied();
        }
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
          id: "composer-contract-double", model: "test-layer/model",
          choices: [{ message: { content } }]
        }));
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("TEST_PROVIDER_ADDRESS_FAILED");
    return {
      endpoint: `http://127.0.0.1:${address.port}`,
      composerSystemPrompt: () => composerSystemPrompt,
      composerCalls: () => composerCalls,
      async stop() {
        server.close();
        await once(server, "close");
      }
    };
  }

  it("declares the reasoning-only segment contract and settles the answer as hypothesis + research plan", async () => {
    const provider = await startContractAwareProviderDouble();
    try {
      const work = await createRunnerWork("term01-composer-reasoning-contract");
      const settings = runnerSettings();
      const result = await runnerWithEndpoint(provider.endpoint, {
        ...settings,
        composerBound: { ...settings.composerBound, maxAttempts: 2 }
      }).executeWorkItem(work.workItemId);
      expect(result.kind).toBe("COMPLETED");
      expect(provider.composerCalls()).toBe(2);
      expect(reasoningContractFragments.every((fragment) => provider.composerSystemPrompt().includes(fragment)))
        .toBe(true);
      const answer = await database.pool.query<{ terminal: string; answer_form: { kind: string; hypothesis: string; researchPlan: string } }>(
        `SELECT answer.terminal, answer.answer_form
         FROM serve.answer AS answer
         JOIN core.work_item AS work ON work.settled_artifact_ref = answer.answer_id
         WHERE work.work_item_id = $1`,
        [work.workItemId]
      );
      expect(answer.rows[0]?.terminal).toBe("DOWNGRADED");
      expect(answer.rows[0]?.answer_form).toEqual({
        kind: "HYPOTHESIS_WITH_RESEARCH_PLAN",
        hypothesis: "Hypothesis: the reasoning answer holds provisionally.",
        researchPlan: "Research plan: gather independent evidence that could lift or defeat the hypothesis."
      });
      const composerAttempts = await database.pool.query<{ outcome: string; parse_status: string }>(
        `SELECT entry.outcome, artifact.parse_status
         FROM ledger.ledger_entry AS entry
         JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = entry.raw_artifact_ref
         WHERE entry.run_id = $1 AND entry.call_site_key LIKE 'COMPOSER:%'
         ORDER BY entry.sequence`,
        [work.runId]
      );
      expect(composerAttempts.rows).toEqual([
        { outcome: "FAILED", parse_status: "SCHEMA_FAILED" },
        { outcome: "OK", parse_status: "PARSED" }
      ]);
    } finally { await provider.stop(); }
  });
});

/**
 * T10 + T11 (goal 188-221; rulings S6-1, S6-3, S7-1 + confirm-items 4/6) — the
 * PRODUCTION seam, not a hand-composed chain.
 *
 * Both cases below drive the real `WalkingSkeletonRunner` with doubles only at
 * the provider boundary, so they pin the wires a component test cannot see: the
 * runner's served-root selection, the margin it writes to the propagation
 * receipt, the label it derives from those numbers before composition, and the
 * disclosure the served answer carries.
 */
describe("T10/T11 · the served root and its label, through the production runner", () => {
  const servedRunResponses = (statement: string, fidelity: number): readonly string[] => [
    judgementDouble(statement, fidelity),
    JSON.stringify({ segments: [
      { segment_id: "segment:verdict", text: statement, node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
      { segment_id: "segment:research", text: "Check an independent source.", node_refs: [], served_number_refs: [] }
    ] }),
    // T9: the two retired organs (per-segment CONFORMANCE, post-compose R9)
    // are one EVALUATOR call now, and a satisfied evaluator ends the loop in
    // round 1 — so the serve path is exactly two model calls, not four.
    JSON.stringify({
      satisfied: true,
      objection: null,
      criteria: {
        fairness_to_losers: true,
        statement_label_agreement: true,
        no_overstatement: true,
        restatement: true,
        citation_tracing: true
      }
    })
  ];

  /**
   * confirm-item 6, goal 200-203. A mono-maker run has ONE root, so no margin
   * exists, and its panel is a single voice, so no dispersion exists. The label
   * is CONTESTED and the answer SAYS SO — a solo voice can never print
   * SUPPORTED, however confident the judgement it produced.
   */
  it("T11 the mono-maker path serves CONTESTED with the LABEL-BASIS-INCOMPLETE disclosure", async () => {
    const question = `t11-mono-maker-label-${randomUUID()}`;
    const work = await createRunnerWork(question);
    // Fidelity 0.95 — the most confident judgement the double can give. If the
    // ladder consulted confidence instead of BASIS, this would print SUPPORTED.
    const provider = await startProviderDouble([...servedRunResponses("A solo maker's confident position.", 0.95)]);
    try {
      const result = await runnerWithEndpoint(provider.endpoint).executeWorkItem(work.workItemId);
      expect(result.kind).toBe("COMPLETED");
      if (result.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");

      const projection = await new ServeRepository(database.pool).readAnswerProjection(
        result.answerId, `asker:${question}`
      );
      // A served number exists — so a label was really derived, not skipped.
      expect(projection?.number_slots.some((slot) => slot.status === "PRESENT")).toBe(true);
      expect(projection?.verdict_state).toBe("CONTESTED");
      expect(projection?.verdict_unavailable).toBeNull();
      expect(projection?.condition_marks).toContain("LABEL-BASIS-INCOMPLETE");
      expect(projection?.condition_mark_records).toContainEqual(expect.objectContaining({
        mark: "LABEL-BASIS-INCOMPLETE",
        scope: "answer",
        served_root_rule: null
      }));
      const disclosure = projection?.condition_mark_records
        .find((record) => record.mark === "LABEL-BASIS-INCOMPLETE");
      // The disclosure names BOTH absent limbs: one root, one voice.
      expect(disclosure?.reason).toContain("no runner-up root exists");
      expect(disclosure?.reason).toContain("fewer than two parseable judgements");

      // The receipt carries the same decision the answer was labelled from.
      const receipt = await database.pool.query<{ served_root_selection: Record<string, unknown> | null }>(
        `SELECT propagation.served_root_selection
           FROM ledger.propagation_run AS propagation
          WHERE propagation.run_id = $1
          ORDER BY propagation.at_seq DESC
          LIMIT 1`,
        [work.runId]
      );
      const selection = receipt.rows[0]?.served_root_selection;
      expect(selection).toMatchObject({
        rule: "max-propagated-strength-lexicographic-tiebreak",
        runnerUp: null,
        margin: { kind: "ABSENT", reason: "SINGLE_SERVABLE_ROOT" },
        tiebreak: "NOT_APPLIED",
        candidateCount: 1,
        verdictLabel: { label: "CONTESTED", rung: 0, trigger: "BASIS_INCOMPLETE" }
      });
    } finally { await provider.stop(); }
  });

  /**
   * Global DoD, goal 39-40: "every new policy value lives in sealed register
   * rows; missing rows fail loudly". The label reads gamma, the two cuts and the
   * disagreement threshold from T16's rows, so a deployment that never sealed
   * the family must STOP — not fall back to a value this code chose. The stop is
   * BEFORE any answer is written, on the same footing as J12's panel stop.
   */
  it("T11 stops loudly instead of labelling when the sealed verdict-label family is missing", async () => {
    const question = `t11-unsealed-verdict-family-${randomUUID()}`;
    const work = await createRunnerWork(question);
    const provider = await startProviderDouble([...servedRunResponses("An unlabellable position.", 0.8)]);
    const { verdictLabelPolicy: _omitted, ...settingsWithoutVerdictLabelPolicy } = runnerSettings();
    try {
      await expect(
        runnerWithEndpoint(provider.endpoint, settingsWithoutVerdictLabelPolicy).executeWorkItem(work.workItemId)
      ).rejects.toMatchObject({ code: "VERDICT_LABEL_CONTROLS_UNRESOLVED" });

      // Nothing was served: the run refused rather than serving an unlabelled
      // or default-labelled answer.
      const answers = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM serve.answer WHERE run_id=$1", [work.runId]
      );
      expect(answers.rows[0]?.count).toBe("0");
      // S06 B1 (codex r1): the refusal must land BEFORE the run spends anything.
      // Stopping after judgement and propagation still refuses honestly, but it
      // bills a deployment for a run it was always going to reject — so the gate
      // sits at claim time, on the same footing as J12's panel-weighting stop.
      expect(provider.calls()).toBe(0);
      const modelCalls = await database.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ledger.ledger_entry
          WHERE run_id=$1 AND action_kind='MODEL_CALL'`, [work.runId]
      );
      expect(modelCalls.rows[0]?.count).toBe("0");
    } finally { await provider.stop(); }
  });

  /**
   * J24 discriminator (2) / codex r1 B1 — a sealed ref naming a provider this
   * deployment never configured is refused BEFORE the work item is claimed.
   * The family being syntactically present is not the same as its refs being
   * resolvable, and the r1 filing only checked the former.
   */
  it("T9/J24 refuses an unconfigured sealed role ref before claiming, and names the role", async () => {
    const question = `t09-role-ref-unconfigured-${randomUUID()}`;
    const work = await createRunnerWork(question);
    const provider = await startProviderDouble([...servedRunResponses("Never synthesized.", 0.8)]);
    const settings = runnerSettings();
    const unconfigured: WalkingSkeletonSettings = {
      ...settings,
      synthesisRolePolicy: {
        ...settings.synthesisRolePolicy!,
        evaluatorRoleRef: "provider:never-configured-on-this-deployment"
      }
    };
    try {
      await expect(
        runnerWithEndpoint(provider.endpoint, unconfigured).executeWorkItem(work.workItemId)
      ).rejects.toMatchObject({ code: "SYNTHESIS_ROLE_PROVIDER_UNRESOLVED" });

      // Nothing claimed, nothing spent: the work item is untouched.
      const state = await database.pool.query<{ state: string; settled_artifact_ref: string | null }>(
        "SELECT state, settled_artifact_ref FROM core.work_item WHERE work_item_id=$1", [work.workItemId]
      );
      expect(state.rows[0]).toMatchObject({ state: "READY", settled_artifact_ref: null });
      expect(provider.calls()).toBe(0);
      const answers = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM serve.answer WHERE run_id=$1", [work.runId]
      );
      expect(answers.rows[0]?.count).toBe("0");
    } finally { await provider.stop(); }
  });

  /**
   * J24 discriminator (3) / codex r1 B1 — the sealed ref IS configured, but
   * claim-time probing found its provider absent. The r1 filing dropped it from
   * the healthy set and then looked the role up in the UNFILTERED set, so the
   * run called an already-absent provider and recorded the result as an
   * ordinary transport death. It must refuse instead, without substituting the
   * still-healthy maker, and leave a durable event naming the ROLE (J25).
   */
  it("T9/J24 refuses when a configured sealed role provider is absent at claim, and never substitutes the healthy maker", async () => {
    const absentRolePrimary = await startProviderDouble([]);
    const healthySecondary = await startProviderDouble([
      judgementDouble("The healthy maker would have authored this", 0.4),
      resil01Composition,
      evaluatorSatisfied()
    ]);
    try {
      const question = `t09-role-absent-at-claim-${randomUUID()}`;
      const panel = fixtureDiscoveredPanel(2);
      const primaryMember = panel[0]!;
      const secondaryMember = panel[1]!;
      const runId = await new RunRepository(database.pool).startRun({
        questionLine: question,
        principal: { kind: "legacy", legacyAskerId: `asker:${question}` },
        sessionId: `session:${question}`,
        callerScope: "ASKER",
        asOf: new Date("2026-08-07T00:00:00.000Z"),
        askerRiskTier: "casual",
        effectiveRiskTier: "casual",
        tierSource: "ASKER",
        tierProvenanceRef: `asker-declaration:${question}`,
        compositionBudgetTier: "low",
        depthParams: { depth: 1 },
        discoveredPanel: panel,
        strangerSampleRate: 1,
        envelopeBasis: fixtureStructuralCeiling(10, 2, 1),
        registerVersion: 1,
        batteryVersion: "s00",
        batteryRows
      });
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId, batteryRowId: "Q1", nodeSet: [], commandKey: `runner-test:${question}`
      });
      const settings = runnerSettings();
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: absentRolePrimary.endpoint, model: "test-layer/primary-model", maker: "Primary test maker"
      }), {
        ...settings,
        maker: "Primary test maker",
        critique: {
          provider: createPostgresProviderGateway(database.pool, {
            endpoint: healthySecondary.endpoint,
            model: "test-layer/secondary-model",
            maker: "Secondary test maker"
          }),
          providerRef: secondaryMember.provider_ref,
          maker: secondaryMember.maker
        },
        scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" },
        // Only the ROLE's provider is absent; the other maker stays healthy, so
        // the run could have continued — which is exactly the substitution J24
        // forbids.
        claimTimeProbe: async (member) => member.provider_ref === primaryMember.provider_ref
          ? { state: "ABSENT", modelId: null, failureCode: "CLAIM_PROVIDER_ABSENT" }
          : { state: "HEALTHY", modelId: member.model_id, failureCode: null }
      });

      await expect(runner.executeWorkItem(workItemId))
        .rejects.toMatchObject({ code: "SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM" });

      // NO substitution: the healthy secondary was never asked to synthesize.
      expect(healthySecondary.calls()).toBe(0);
      expect(absentRolePrimary.calls()).toBe(0);
      const answers = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM serve.answer WHERE run_id=$1", [runId]
      );
      expect(answers.rows[0]?.count).toBe("0");

      // J25: the disclosure is DURABLE and names the role, so a reader of the
      // run sees why it stopped. Both live-event surfaces render this kind.
      const events = await database.pool.query<{ value_json: { state: string; call_site_key: string } }>(
        `SELECT value_json FROM core.run_progress_event
          WHERE run_id=$1 AND kind='ledger.could_not_do'`, [runId]
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0]?.value_json.state).toBe("SYNTHESIS_ROLE_PROVIDER_ABSENT");
      expect(events.rows[0]?.value_json.call_site_key)
        .toBe(`SYNTHESIZER:${primaryMember.provider_ref}`);
      // J26(c): the refusal's OWN shape. It states the role and why the provider
      // was not claim-eligible, and it states NO measurement it did not take —
      // there is no hold_ms/attempts_spent/planned_leg_count to read as zero.
      expect(events.rows[0]?.value_json).toEqual({
        state: "SYNTHESIS_ROLE_PROVIDER_ABSENT",
        call_site_key: `SYNTHESIZER:${primaryMember.provider_ref}`,
        role_ref: primaryMember.provider_ref,
        role: "SYNTHESIZER",
        absent_failure_code: "CLAIM_PROVIDER_ABSENT"
      });

      // J26(b) / J25: the PERSISTED terminal state, not the thrown error. The
      // item is never released or re-queued — only a deployment change can fix
      // a sealed identity that is absent.
      const item = await database.pool.query<{
        state: string; terminal_reason: string | null; claimed_by: string | null;
      }>(
        "SELECT state, terminal_reason, claimed_by FROM core.work_item WHERE work_item_id=$1",
        [workItemId]
      );
      expect(item.rows[0]).toEqual({
        state: "FAILED",
        terminal_reason: "SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:SYNTHESIZER",
        claimed_by: null
      });
    } finally {
      await healthySecondary.stop();
      await absentRolePrimary.stop();
    }
  });

  /**
   * codex r2 B2 / J29 — a round reference must RESOLVE, and resolve INSIDE THIS
   * RUN. The foreign key already refuses `artifact:ghost` (it resolves to
   * nothing); what a foreign key cannot see is a reference to a real artifact
   * belonging to a DIFFERENT run, which is why `persist` proves run membership
   * before the answer transaction commits.
   */
  it("T9/J29 refuses a round reference that is not the producer's artifact", async () => {
    // A run with a JUDGE artifact and NO answer yet, so the same-run
    // wrong-producer case can be persisted without colliding with an existing
    // answer. codex r3 B2: run identity alone let exactly this artifact through
    // as both the candidate and the verdict reference.
    const question = `t09-wrong-producer-${randomUUID()}`;
    const runId = await createRun(question, 90, 1, 1);
    const workItemId = await new WorkItemRepository(database.pool).enqueue({
      runId, batteryRowId: "Q1", nodeSet: [], commandKey: `runner-test:${question}`
    });
    const ledger = new LedgerRepository(database.pool);
    const judgeArtifactId = randomUUID();
    const attemptId = randomUUID();
    await ledger.appendRawArtifact({
      artifactId: judgeArtifactId, attemptId, runId,
      providerRef: "provider:test-layer", provider: "test", model: "model/test-layer",
      maker: "test-layer", modelVersion: "v1",
      rawText: JSON.stringify({ judge: question }), metadata: {}, parseStatus: "PARSED",
      inputHash: "8".repeat(64), contractHash: "9".repeat(64), contentHash: "a".repeat(64)
    });
    const now = new Date();
    await ledger.append({
      runId, attemptId, actionKind: "MODEL_CALL", callSiteKey: "JUDGE",
      subjectItemId: workItemId, stanceAtAction: "UNASSIGNED", outcome: "OK",
      actorRef: "provider:test-layer", inputHash: "input:test-layer",
      contractHash: "9".repeat(64), rawArtifactRef: judgeArtifactId,
      startedAt: now, finishedAt: now
    });

    const emptyDigest = { nodes: [], emphasis: { topSurvivingObjectionNodeIds: [], runnerUpPositionNodeIds: [] }, compressionLevel: 0, summaryCharacterCap: null, byteSize: 0 };
    const codeLabel = { verdictLabel: "CONTESTED", servedNodeId: "n", servedStrength: 0.5, margin: null, registerVersion: 1 };
    const round = {
      round: 1,
      synthesizerRequest: { role: "SYNTHESIZER", stage: "INITIAL", roleRef: "provider:test-layer", round: 1, instructions: "i", digest: emptyDigest, codeLabel },
      candidateRef: judgeArtifactId,
      candidateCallSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1",
      candidateStatement: "A statement.",
      evaluatorRequest: { role: "EVALUATOR", roleRef: "provider:test-layer", round: 1, instructions: "i", digest: emptyDigest, codeLabel, candidateStatement: "A statement." },
      verdict: { satisfied: true, objection: null, criteria: { fairnessToLosers: true, statementLabelAgreement: true, noOverstatement: true, restatement: true, citationTracing: true } },
      verdictRef: judgeArtifactId,
      verdictCallSiteKey: "POST_COMPOSE_R9:EVALUATOR:1"
    } as unknown as NonNullable<ServeGateResult["loopRounds"]>[number];
    const factBundle = {
      facts: ["A fact."], residualObjections: [], badges: [], conditionMarks: [],
      reversalPoint: "A contrary observation would reverse this.",
      buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
    };

    // SAME RUN, real artifact, WRONG PRODUCER: the judge's call site is not a
    // synthesis call site, so the ledger has no such pairing.
    await expect(persistTerminalRun({
      pool: database.pool, runId, fixtureKey: question, factBundle, loopRounds: [round]
    })).rejects.toMatchObject({ code: "SYNTHESIS_ROUND_ARTIFACT_UNRESOLVED" });

    // The whole answer rolled back with it.
    const rows = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM serve.synthesis_round WHERE run_id=$1", [runId]
    );
    expect(rows.rows[0]?.count).toBe("0");
    const answers = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM serve.answer WHERE run_id=$1", [runId]
    );
    expect(answers.rows[0]?.count).toBe("0");
  });

  /**
   * J26(b) — the ALL-ABSENT claim path. Every pinned provider is gone, so the
   * pre-existing empty-panel refusal fires BEFORE the role check (it stands
   * earlier in the same loop) and the role never gets to be the reason. What
   * this arm pins is that the ordering does not cost the work item its terminal
   * state: a claim-time refusal that only a deployment change can fix must not
   * be left CLAIMED for the reaper to retry.
   */
  it("T9/J26 drives the all-absent claim path to a persisted terminal state", async () => {
    const absentPrimary = await startProviderDouble([]);
    const absentSecondary = await startProviderDouble([]);
    try {
      const question = `t09-all-absent-at-claim-${randomUUID()}`;
      const panel = fixtureDiscoveredPanel(2);
      const secondaryMember = panel[1]!;
      const runId = await new RunRepository(database.pool).startRun({
        questionLine: question,
        principal: { kind: "legacy", legacyAskerId: `asker:${question}` },
        sessionId: `session:${question}`,
        callerScope: "ASKER",
        asOf: new Date("2026-08-07T00:00:00.000Z"),
        askerRiskTier: "casual",
        effectiveRiskTier: "casual",
        tierSource: "ASKER",
        tierProvenanceRef: `asker-declaration:${question}`,
        compositionBudgetTier: "low",
        depthParams: { depth: 1 },
        discoveredPanel: panel,
        strangerSampleRate: 1,
        envelopeBasis: fixtureStructuralCeiling(10, 2, 1),
        registerVersion: 1,
        batteryVersion: "s00",
        batteryRows
      });
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId, batteryRowId: "Q1", nodeSet: [], commandKey: `runner-test:${question}`
      });
      const settings = runnerSettings();
      const runner = new WalkingSkeletonRunner(database.pool, createPostgresProviderGateway(database.pool, {
        endpoint: absentPrimary.endpoint, model: "test-layer/primary-model", maker: "Primary test maker"
      }), {
        ...settings,
        maker: "Primary test maker",
        critique: {
          provider: createPostgresProviderGateway(database.pool, {
            endpoint: absentSecondary.endpoint,
            model: "test-layer/secondary-model",
            maker: "Secondary test maker"
          }),
          providerRef: secondaryMember.provider_ref,
          maker: secondaryMember.maker
        },
        scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" },
        claimTimeProbe: async () => ({ state: "ABSENT", modelId: null, failureCode: "CLAIM_PROVIDER_ABSENT" })
      });

      await expect(runner.executeWorkItem(workItemId))
        .rejects.toMatchObject({ code: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM" });

      // THE ASSERTION THAT MATTERS: the persisted terminal state, read back.
      const item = await database.pool.query<{
        state: string; terminal_reason: string | null; claimed_by: string | null;
      }>(
        "SELECT state, terminal_reason, claimed_by FROM core.work_item WHERE work_item_id=$1",
        [workItemId]
      );
      expect(item.rows[0]).toEqual({
        state: "FAILED",
        terminal_reason: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM",
        claimed_by: null
      });
      expect(absentPrimary.calls()).toBe(0);
      expect(absentSecondary.calls()).toBe(0);
    } finally {
      await absentSecondary.stop();
      await absentPrimary.stop();
    }
  });

  /**
   * T9 × board F33 × J12, at run level. The synthesis-role family binds at
   * EVERY maker count — every served statement is written by the synthesizer
   * and graded by the evaluator — so a deployment that never handed the runner
   * the sealed rows must refuse at claim time, before it spends anything, the
   * same way T11's label family and J12's panel rows do.
   */
  it("T9 stops loudly instead of synthesizing when the sealed synthesis-role family is missing", async () => {
    const question = `t09-unsealed-synthesis-family-${randomUUID()}`;
    const work = await createRunnerWork(question);
    const provider = await startProviderDouble([...servedRunResponses("An unsynthesizable position.", 0.8)]);
    const { synthesisRolePolicy: _omitted, ...settingsWithoutSynthesisRolePolicy } = runnerSettings();
    try {
      await expect(
        runnerWithEndpoint(provider.endpoint, settingsWithoutSynthesisRolePolicy).executeWorkItem(work.workItemId)
      ).rejects.toMatchObject({ code: "SYNTHESIS_ROLE_CONTROLS_UNRESOLVED" });

      const answers = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM serve.answer WHERE run_id=$1", [work.runId]
      );
      expect(answers.rows[0]?.count).toBe("0");
      expect(provider.calls()).toBe(0);
      const modelCalls = await database.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ledger.ledger_entry
          WHERE run_id=$1 AND action_kind='MODEL_CALL'`, [work.runId]
      );
      expect(modelCalls.rows[0]?.count).toBe("0");
    } finally { await provider.stop(); }
  });

  /**
   * THE T10 RED, at run level. The FIRST configured provider authors the WEAKER
   * root; the second authors the stronger one. The served number, the served
   * root's disclosure and the receipt must all name the STRONGER root — under
   * the retired first-configured-provider rule they would all name the weaker.
   */
  it("T10 the production runner serves the stronger root when the first-configured one is weaker", async () => {
    const weakerFirst = await executeResil01Scenario({
      label: "t10-reversed-config-order",
      primary: [
        // The provider double is CLASS-KEYED, so the first JUDGE entry in each
        // queue is that maker's ROOT. The FIRST-CONFIGURED maker authors the
        // WEAKER root: under the retired rule its root would still be served.
        judgementDouble("The first-configured maker's weaker position.", 0.3),
        ...Array.from({ length: 3 }, (_, index) => judgementDouble(`Primary child ${index + 1}`)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary review ${index + 1}`)),
        resil01Composition,
        evaluatorSatisfied()
      ],
      secondary: [
        // The SECOND-configured maker authors the STRONGER root.
        judgementDouble("The second-configured maker's stronger position.", 0.9),
        ...Array.from({ length: 3 }, (_, index) => judgementDouble(`Secondary child ${index + 1}`)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Secondary review ${index + 1}`))
      ]
    });

    expect(weakerFirst.error).toBeNull();
    expect(weakerFirst.result?.kind).toBe("COMPLETED");

    // (1) The run's OWN recorded root strengths — the oracle. Never the
    //     selection's own claim about itself.
    const strengths = await database.pool.query<{ node_id: string; strength: string }>(
      `SELECT strength.node_id, strength.strength::text
         FROM ledger.node_strength_record AS strength
         JOIN ledger.propagation_run AS propagation
           ON propagation.propagation_run_id = strength.propagation_run_id
        WHERE propagation.run_id = $1`,
      [weakerFirst.runId]
    );
    const rootIds = new Set(weakerFirst.snapshot.nodes
      .filter((node) => node.parentNodeId === null || node.parentNodeId === undefined)
      .map((node) => node.nodeId));
    const rootStrengths = strengths.rows
      .filter((row) => rootIds.has(row.node_id))
      .map((row) => ({ nodeId: row.node_id, strength: Number(row.strength) }));
    expect(rootStrengths.length).toBeGreaterThanOrEqual(2);
    const strongest = rootStrengths.reduce((best, row) => row.strength > best.strength ? row : best);
    const runnerUpStrength = rootStrengths
      .filter((row) => row.nodeId !== strongest.nodeId)
      .reduce((best, row) => row.strength > best.strength ? row : best).strength;
    // The fixture really did make the roots differ, so "strongest" is a choice.
    expect(strongest.strength).toBeGreaterThan(runnerUpStrength);

    // (2) THE RED. The served answer's own disclosure names the STRONGEST root
    //     as the one that was served, under the live rule. On the baseline this
    //     names the first-configured (weaker) root and the retired rule.
    const unserved = weakerFirst.answer?.condition_mark_records
      .find((record) => record.mark === "UNSERVED-MAKER-POSITION");
    expect(unserved).toEqual(expect.objectContaining({
      subject_ref: strongest.nodeId,
      served_root_rule: "max-propagated-strength-lexicographic-tiebreak"
    }));
    // The served NUMBER is the served root's strength, not the first root's.
    const servedNumberValue = weakerFirst.answer?.number_slots
      .find((slot) => slot.status === "PRESENT");
    expect(servedNumberValue).toBeDefined();

    // (3) The receipt carries the same decision and the margin to the runner-up.
    const receipt = await database.pool.query<{ served_root_selection: {
      servedNodeId: string;
      servedStrength: number;
      runnerUp: { nodeId: string; strength: number } | null;
      margin: { kind: string; value?: number };
      rule: string;
      tiebreak: string;
    } | null }>(
      `SELECT propagation.served_root_selection
         FROM ledger.propagation_run AS propagation
        WHERE propagation.run_id = $1
        ORDER BY propagation.at_seq DESC
        LIMIT 1`,
      [weakerFirst.runId]
    );
    const selection = receipt.rows[0]?.served_root_selection;
    expect(selection).not.toBeNull();
    expect(selection).not.toBeUndefined();
    expect(selection!.rule).toBe("max-propagated-strength-lexicographic-tiebreak");
    expect(selection!.servedNodeId).toBe(strongest.nodeId);
    expect(selection!.servedStrength).toBeCloseTo(strongest.strength, 12);
    expect(selection!.runnerUp).not.toBeNull();
    expect(selection!.margin.kind).toBe("MEASURED");
    expect(selection!.margin.value).toBeCloseTo(strongest.strength - runnerUpStrength, 12);
    expect(selection!.tiebreak).toBe("NOT_APPLIED");

    // (4) Two roots and a two-voice panel: the basis is complete, so the
    //     incomplete-basis disclosure must NOT ride this answer.
    expect(weakerFirst.answer?.condition_marks).not.toContain("LABEL-BASIS-INCOMPLETE");
    expect(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]).toContain(weakerFirst.answer?.verdict_state);
  });
});

/**
 * T10 / codex r1 B3 — migration 0055 preserved the pre-0055 rule VALUES, but
 * every reader was rewritten as if only the live vocabulary could exist.
 *
 * The three failure cases below are the ones a real deployment hits the day it
 * upgrades: it already holds answers sealed under the retired DR-161 rule.
 * Reading one through the public contract must not throw, catching one up must
 * not relabel it, and the database must be able to hold its own history.
 */
describe("T10/B3 · a pre-0055 answer stays readable, parseable and catch-up-able", () => {
  const RETIRED_RULE = "first-configured-provider";

  /**
   * Produces a genuine pre-0055 answer: a real two-maker run, then a SUPERSEDING
   * version written through the PRODUCTION writer whose preserved unserved-maker
   * record carries the retired rule — which is exactly the row shape a database
   * sealed before this migration holds. `serve.condition_mark` is append-only,
   * so nothing is rewritten; the historical version is appended.
   *
   * The live CHECK is lifted for that one write and restored by RE-APPLYING THE
   * SHIPPED MIGRATION, never by re-typing its DDL here, so this helper cannot
   * drift away from whatever 0055 actually ships.
   */
  async function sealedBeforeMigration0055(label: string): Promise<{
    readonly runId: string;
    readonly answerId: string;
    readonly askerId: string;
    readonly subjectRef: string;
  }> {
    const scenario = await executeResil01Scenario({
      label,
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`B3 primary position ${index + 1}`)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `B3 primary review ${index + 1}`)),
        resil01Composition,
        evaluatorSatisfied()
      ],
      secondary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`B3 secondary position ${index + 1}`)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `B3 secondary review ${index + 1}`))
      ]
    });
    expect(scenario.error).toBeNull();
    if (scenario.result?.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");
    const answerId = scenario.result.answerId;
    const serve = new ServeRepository(database.pool);
    const source = await serve.readReviewCatchUpSource(scenario.runId);

    await database.pool.query(
      "ALTER TABLE serve.condition_mark DROP CONSTRAINT IF EXISTS condition_mark_served_root_rule_rule_check"
    );
    try {
      await serve.persist(supersedingInput(source, scenario.runId, answerId, source.answer.condition_mark_records.map(
        (record) => ({ ...preservedRecord(record), ...(record.mark === "UNSERVED-MAKER-POSITION"
          ? { servedRootRule: RETIRED_RULE as never } : {}) })
      )));
    } finally {
      await database.pool.query(await readFile("migrations/0055_t10_served_root_selection.sql", "utf8"));
    }
    const subject = source.answer.condition_mark_records
      .find((record) => record.mark === "UNSERVED-MAKER-POSITION")!.subject_ref;
    // The scenario derives its asker from a randomised question line, so read the
    // real one back rather than reconstructing it.
    const asker = await database.pool.query<{ asker_id: string }>(
      "SELECT asker_id FROM core.run WHERE run_id=$1", [scenario.runId]
    );
    return Object.freeze({
      runId: scenario.runId, answerId,
      askerId: asker.rows[0]!.asker_id, subjectRef: subject
    });
  }

  /** The record shape `prepareVersion` carries forward, field for field. */
  function preservedRecord(record: {
    mark: string; scope: "answer" | "node"; subject_ref: string; reason: string;
    lift_path: string | null; served_root_rule: string | null; affected_node_ids: readonly string[];
    call_site_key: string | null; planned_leg_count: number | null;
    terminal_transport_outcome: "TIMED_OUT" | "FAILED" | null; hidden_strength: number | null;
    hidden_score_threshold: number | null; hidden_score_threshold_source_ref: string | null;
    excluded_from_served_number: boolean | null; judged_basis_count: number | null;
  }): ConditionMarkRecord {
    return {
      mark: record.mark as ConditionMarkRecord["mark"], scope: record.scope,
      subjectRef: record.subject_ref, reason: record.reason, liftPath: record.lift_path,
      servedRootRule: record.served_root_rule as ConditionMarkRecord["servedRootRule"],
      affectedNodeIds: record.affected_node_ids, callSiteKey: record.call_site_key,
      plannedLegCount: record.planned_leg_count,
      terminalTransportOutcome: record.terminal_transport_outcome,
      hiddenStrength: record.hidden_strength,
      hiddenScoreThreshold: record.hidden_score_threshold,
      hiddenScoreThresholdSourceRef: record.hidden_score_threshold_source_ref,
      excludedFromServedNumber: record.excluded_from_served_number,
      judgedBasisCount: record.judged_basis_count
    };
  }

  /** A superseding persist over an existing answer — what catch-up performs. */
  function supersedingInput(
    source: Awaited<ReturnType<ServeRepository["readReviewCatchUpSource"]>>,
    runId: string,
    answerId: string,
    records: readonly ConditionMarkRecord[]
  ) {
    return {
      runId, workItemId: source.workItemId,
      factBundleVersion: source.factBundleVersion,
      factBundleContentHash: source.factBundleContentHash,
      factBundle: source.factBundle,
      result: {
        terminal: source.answer.terminal,
        answerForm: source.answer.answer_form as ServeGateResult["answerForm"],
        factBundle: source.factBundle, gateTrace: [],
        conditionMarks: source.answer.condition_marks, conformance: [],
        coverageMode: "NOT_RUN", segments: [],
        compositionBudget: {
          tier: "low" as const, bound: 10_000, registerRowKey: "compositionBundleBudget.low",
          registerVersion: 1, sourceRef: "test-layer:B3"
        },
        confidenceBand: source.answer.confidence_band,
        // The stored pair must stay paired (answer_band_ceiling_pair): carry the
        // source's ceiling forward exactly as the production catch-up path does.
        bandCeiling: source.answer.band_ceiling === null ? null : {
          label: source.answer.band_ceiling.label,
          basis: source.answer.band_ceiling.basis,
          registerRowKey: source.answer.band_ceiling.register_row_key,
          registerVersion: source.answer.band_ceiling.register_version,
          sourceRef: source.answer.band_ceiling.source_ref,
          liftPath: source.answer.band_ceiling.lift_path
        },
        projections: {
          reversalPoint: source.answer.reversal_point,
          buildsOnPrevious: source.factBundle.buildsOnPrevious,
          memoryDisclosure: source.factBundle.memoryDisclosure
        }
      } as unknown as ServeGateResult,
      segments: source.answer.composed_text.map((segment) => ({
        segmentId: segment.segment_id, text: segment.text,
        loadBearing: segment.load_bearing, assertedNodeRefs: [],
        servedNumberRefs: segment.served_number_refs
      })),
      compositionRawArtifactRef: null, compositionAttempt: 0,
      conformanceRawArtifactRefs: [], conditionMarkRecords: records,
      servedNumber: null, supersedes: { answerId }
    };
  }

  /** FAILURE CASE 3, at the DDL — the database must be able to hold its own history. */
  it("B3-a the shipped CHECK admits the declared rule history without being lifted", async () => {
    const legacy = await sealedBeforeMigration0055(`b3-check-${randomUUID()}`);
    const latest = await database.pool.query<{ answer_version: number }>(
      "SELECT max(answer_version) AS answer_version FROM serve.answer WHERE answer_id=$1",
      [legacy.answerId]
    );
    const answerVersion = latest.rows[0]!.answer_version;
    const insertRule = async (rule: string): Promise<void> => {
      const client = await database.pool.connect();
      try {
        // condition_mark is append-only, so the probe INSERTS (never updates) and
        // the transaction is rolled back: this measures the CONSTRAINT, and
        // leaves no row behind.
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO serve.condition_mark
             (answer_id, answer_version, mark, scope, subject_ref, reason, lift_path,
              served_root_rule, at_seq)
           VALUES ($1, $4, 'UNSERVED-MAKER-POSITION', 'answer', $2, 'B3 constraint probe',
                   NULL, $3, ledger.allocate_sequence())`,
          [legacy.answerId, legacy.subjectRef, rule, answerVersion]
        );
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    };

    // N3 (codex r2): the constraint is VALIDATED, read from the catalogue rather
    // than from the migration's text — `NOT VALID` can be reformatted across a
    // newline, and a string check would pass on an unvalidated constraint while
    // every historical row stayed permanently unchecked. This is the assertion
    // that catches a NOT VALID regression.
    const constraint = await database.pool.query<{ convalidated: boolean; condef: string }>(
      `SELECT c.convalidated, pg_get_constraintdef(c.oid) AS condef
         FROM pg_constraint AS c
         JOIN pg_class AS t ON t.oid = c.conrelid
         JOIN pg_namespace AS n ON n.oid = t.relnamespace
        WHERE n.nspname='serve' AND t.relname='condition_mark'
          AND c.conname='condition_mark_served_root_rule_rule_check'`
    );
    expect(constraint.rowCount).toBe(1);
    expect(constraint.rows[0]!.convalidated).toBe(true);
    // ...and it really is the DECLARED HISTORY, both members present.
    expect(constraint.rows[0]!.condef).toContain("max-propagated-strength-lexicographic-tiebreak");
    expect(constraint.rows[0]!.condef).toContain("first-configured-provider");

    // The live rule and the DECLARED retired rule are both storable — the second
    // is the write DR-184 catch-up performs when it carries an old record forward.
    await expect(insertRule("max-propagated-strength-lexicographic-tiebreak")).resolves.toBeUndefined();
    await expect(insertRule(RETIRED_RULE)).resolves.toBeUndefined();
    // ...and a value outside the declared history is still refused, so the
    // constraint admits HISTORY, not anything at all.
    await expect(insertRule("some-rule-nobody-ever-ruled")).rejects.toThrow(
      /condition_mark_served_root_rule_rule_check/u
    );
  });

  /** FAILURE CASES 1 and 2 — projection and both public API routes. */
  it("B3-b a pre-0055 answer projects and parses through the public contract and both routes", async () => {
    const legacy = await sealedBeforeMigration0055(`b3-read-${randomUUID()}`);
    const projection = await new ServeRepository(database.pool)
      .readAnswerProjection(legacy.answerId, legacy.askerId);

    expect(projection?.condition_mark_records).toContainEqual(expect.objectContaining({
      mark: "UNSERVED-MAKER-POSITION",
      served_root_rule: RETIRED_RULE
    }));
    // Compile-level pin on the PROJECTION type specifically (codex r1 B3 named
    // this read site): if it narrows back to the live rule alone, the projection
    // would again assert that a value it really returns cannot exist.
    const projectedRule: ServedRootRuleHistory | null | undefined = projection
      ?.condition_mark_records.find((record) => record.mark === "UNSERVED-MAKER-POSITION")
      ?.served_root_rule;
    expect(projectedRule).toBe(RETIRED_RULE);
    // The exact call both answer routes make. Today this throws, so a pre-0055
    // answer is a 500 rather than an answer.
    expect(() => AnswerSchema.parse(projection)).not.toThrow();

    const identity = testHttpIdentity(`b3-reader-${randomUUID()}`);
    await persistHttpIdentity(identity, "b3-reader");
    const api = buildApi({
      application: {
        readAnswer: async () => projection,
        readRunAnswer: async () => projection
      } as unknown as AskApplication,
      sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN
    });
    try {
      for (const url of [
        `/v1/answers/${encodeURIComponent(legacy.answerId)}`,
        `/v1/runs/${encodeURIComponent(legacy.runId)}/answer`
      ]) {
        const response = await api.inject({ method: "GET", url, headers: testSessionHeaders(identity) });
        expect({ url, statusCode: response.statusCode }).toEqual({ url, statusCode: 200 });
        const body = response.json() as { condition_mark_records: { served_root_rule: string | null }[] };
        // The route returns the PRESERVED value — it is not relabelled on the wire.
        expect(body.condition_mark_records.map((record) => record.served_root_rule))
          .toContain(RETIRED_RULE);
      }
    } finally { await api.close(); }
  });

  /** FAILURE CASE 3 — DR-184 catch-up re-persists the preserved record. */
  it("B3-c catch-up carries the historical rule forward without relabelling it", async () => {
    const legacy = await sealedBeforeMigration0055(`b3-catchup-${randomUUID()}`);
    const serve = new ServeRepository(database.pool);
    const source = await serve.readReviewCatchUpSource(legacy.runId);
    expect(source.answerId).toBe(legacy.answerId);

    // Exactly what prepareVersion(...).persist() does: a new immutable version
    // of the same answer, carrying the preserved records forward verbatim.
    const preserved = source.answer.condition_mark_records.map(preservedRecord);
    expect(preserved.some((record) => String(record.servedRootRule) === RETIRED_RULE)).toBe(true);

    await serve.persist(supersedingInput(source, legacy.runId, legacy.answerId, preserved));

    // Three versions now exist, and NO version was rewritten: the original
    // fresh selection still says the live rule, and every version sealed under
    // the retired rule still says the retired rule. Catch-up neither relabels
    // history forward nor rewrites it backward.
    const versions = await database.pool.query<{ answer_version: number; served_root_rule: string | null }>(
      `SELECT mark.answer_version, mark.served_root_rule
         FROM serve.condition_mark AS mark
        WHERE mark.answer_id=$1 AND mark.mark='UNSERVED-MAKER-POSITION'
        ORDER BY mark.answer_version`,
      [legacy.answerId]
    );
    expect(versions.rows.length).toBeGreaterThanOrEqual(3);
    expect(versions.rows[0]!.served_root_rule).toBe("max-propagated-strength-lexicographic-tiebreak");
    expect(versions.rows.at(-1)!.served_root_rule).toBe(RETIRED_RULE);
    expect(versions.rows.slice(1).every((row) => row.served_root_rule === RETIRED_RULE)).toBe(true);
  });

  /** The other half of the law: a FRESH selection may never record a retired rule. */
  it("B3-d refuses a retired rule on a fresh (non-superseding) answer", async () => {
    const legacy = await sealedBeforeMigration0055(`b3-fresh-${randomUUID()}`);
    const serve = new ServeRepository(database.pool);
    const source = await serve.readReviewCatchUpSource(legacy.runId);

    const work = new WorkItemRepository(database.pool);
    const freshWorkItemId = await work.enqueue({
      runId: legacy.runId, batteryRowId: "Q1", nodeSet: [],
      commandKey: `b3-fresh-selection:${randomUUID()}`
    });
    const freshInput = {
      runId: legacy.runId, workItemId: freshWorkItemId,
      // A distinct fact-bundle version: this is a FRESH answer for the run, not
      // another version of the existing one.
      factBundleVersion: source.factBundleVersion + 5,
      factBundleContentHash: source.factBundleContentHash,
      factBundle: source.factBundle,
      result: {
        terminal: "COMPONENTS_ONLY", answerForm: null, factBundle: source.factBundle,
        gateTrace: ["COMPONENTS_ONLY_DEFECT"], conditionMarks: ["UNSERVED-MAKER-POSITION"],
        conformance: [], coverageMode: "NOT_RUN", segments: [],
        compositionBudget: {
          tier: "low" as const, bound: 10_000, registerRowKey: "compositionBundleBudget.low",
          registerVersion: 1, sourceRef: "test-layer:B3"
        },
        confidenceBand: null, bandCeiling: null,
        projections: {
          reversalPoint: source.answer.reversal_point,
          buildsOnPrevious: source.factBundle.buildsOnPrevious,
          memoryDisclosure: source.factBundle.memoryDisclosure
        }
      } as unknown as ServeGateResult,
      segments: [], compositionRawArtifactRef: null, compositionAttempt: 0,
      conformanceRawArtifactRefs: [],
      conditionMarkRecords: [{
        mark: "UNSERVED-MAKER-POSITION" as const, scope: "answer" as const,
        subjectRef: legacy.subjectRef,
        reason: "a fresh selection trying to claim the retired rule",
        liftPath: null, servedRootRule: RETIRED_RULE as never,
        affectedNodeIds: [legacy.subjectRef]
      }],
      servedNumber: null
    };

    await expect(
      serve.persist(freshInput as Parameters<ServeRepository["persist"]>[0])
    ).rejects.toMatchObject({ code: "RETIRED_SERVED_ROOT_RULE_NOT_WRITABLE" });
  });
});
