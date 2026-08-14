import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
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
import { RunRepository, migrate } from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { JudgementRepository } from "@debateai/judgement";
import {
  CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY,
  assertBootstrapEquality,
  loadBootstrapRegister,
  persistBootstrapRegister,
  readClaimTypeCompositionMap
} from "@debateai/register";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import {
  createPostgresProviderGateway,
  excludeHiddenSubtrees,
  WalkingSkeletonRunner,
  type HoldProgressEvent,
  type WalkingSkeletonSettings
} from "@debateai/runner";
import { evaluate } from "@debateai/propagation";
import { ServeRepository } from "@debateai/serve";
import { LivenessRepository } from "@debateai/liveness";
import { buildApi, PostgresAskApplication, type AskApplication } from "@debateai/api";
import { HOME_PAGE_SIZE } from "../../apps/v2-ui/lib/serverApi.js";

let database: TestDatabase;
const batteryRows = createInitialBatteryRows({ settlementWatchHandle: "settlement-watch:test-layer" });

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
    questionLine, askerId, sessionId: `session:${questionLine}`, callerScope: "ASKER",
    asOf: new Date("2026-08-07T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker-declaration:${questionLine}`, compositionBudgetTier: "low",
    depthParams: { depth }, agentCount, strangerSampleRate: 1,
    envelopeBasis: {
      max_model_attempts: maxModelAttempts,
      register_row_key: "runCostEnvelope",
      register_version: 1,
      source_ref: "test-layer:run-cost-envelope",
      derived_from: { depth_params: { depth }, risk_tier: "casual" }
    },
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

function reviewDouble(outcome: "agree" | "dispute" | "cannot-assess", reason: string): string {
  return JSON.stringify({ outcome, reasons: [reason] });
}

async function createRunnerWork(questionLine: string): Promise<{ runId: string; workItemId: string }> {
  const runId = await createRun(questionLine);
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `runner-test:${questionLine}`
  });
  return { runId, workItemId };
}

type ProviderDoubleResponse = string | Readonly<{ status: number; body?: string }>;

async function startProviderDouble(contents: readonly ProviderDoubleResponse[]): Promise<{
  endpoint: string; calls(): number; stop(): Promise<void>;
}> {
  let calls = 0;
  const server: Server = createServer((request, response) => {
    request.resume();
    const content = contents[calls++];
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
    const ownerToken = `resil01-owner-${randomUUID()}`;
    const askerId = `asker:${createHash("sha256").update(ownerToken).digest("hex")}`;
    const runId = await createRun(`resil01-holding-${randomUUID()}`, 10, 1, 1, askerId);
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
    await expect(repository.readLoadingProjection(runId, askerId)).resolves.toMatchObject({
      state: "HOLDING", holdUntil: new Date(future)
    });

    const application = new PostgresAskApplication(database.pool, {} as never, {} as never);
    const api = buildApi({ application });
    try {
      const response = await api.inject({
        method: "GET", url: `/v1/runs/${encodeURIComponent(runId)}/events`,
        headers: { "x-user-dev-token": ownerToken }
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
    await expect(repository.readLoadingProjection(runId, askerId)).resolves.toMatchObject({
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
    const ownerToken = "load01-owner-token";
    const ownerAskerId = `asker:${createHash("sha256").update(ownerToken).digest("hex")}`;
    const runId = await createRun("load01-owned-loading-run", 10, 1, 1, ownerAskerId);
    const workItemId = await new WorkItemRepository(database.pool).enqueue({
      runId,
      batteryRowId: "Q1",
      nodeSet: [],
      commandKey: `load01:${runId}:Q1`
    });
    const repository = new RunRepository(database.pool);
    const readRun: AskApplication["readRun"] = async (candidateRunId, session) => {
      const run = await repository.readLoadingProjection(candidateRunId, session.asker_id);
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
    const api = buildApi({ application });
    try {
      const anonymous = await api.inject({ method: "GET", url: `/v1/runs/${encodeURIComponent(runId)}` });
      expect(anonymous.statusCode).toBe(401);

      const foreign = await api.inject({
        method: "GET",
        url: `/v1/runs/${encodeURIComponent(runId)}`,
        headers: { "x-user-dev-token": "load01-foreign-token" }
      });
      expect(foreign.statusCode).toBe(404);

      const owner = await api.inject({
        method: "GET",
        url: `/v1/runs/${encodeURIComponent(runId)}`,
        headers: { "x-user-dev-token": ownerToken }
      });
      expect(owner.statusCode).toBe(200);
      expect(owner.json()).toMatchObject({ run_ref: runId, state: "QUEUED" });
    } finally {
      await new WorkItemRepository(database.pool).recordTerminalFailure({
        runId,
        workItemId,
        reason: "TEST_FIXTURE_CLEANUP"
      });
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
      JSON.stringify({ conforms: true, findings: [] }),
      JSON.stringify({ conforms: true, findings: [] }),
      JSON.stringify({ pass: true })
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
      questionLine: "s07-wait-drain", askerId: "asker:s07-wait-drain", sessionId: "session:s07-wait-drain",
      callerScope: "ASKER", asOf: new Date("2026-08-08T00:00:00.000Z"), askerRiskTier: "casual",
      effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker-declaration:s07-wait-drain",
      compositionBudgetTier: "low", depthParams: { depth: 1 }, agentCount: 1, strangerSampleRate: 1,
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
      askerId: "asker:test",
      sessionId: "session:test",
      callerScope: "ASKER",
      asOf: new Date("2026-08-07T00:00:00.000Z"),
      askerRiskTier: "casual",
      effectiveRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "asker-declaration:test",
      compositionBudgetTier: "low",
      depthParams: { depth: 1 },
      agentCount: 1,
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

  it("returns a typed error instead of defaulting an empty progress stream", async () => {
    const result = await database.pool.query<{ run_id: string }>(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES (
        'raw fixture', 'asker:raw', 'session:raw', 'ASKER', now(),
        'casual', 'casual', 'ASKER', 'asker-declaration:raw',
        'low', '{}', 1, 1, '{}', 1, 's00', 9999
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

  it("round-trips ASK ER and policy-raise carriers and rejects a policy lowering", async () => {
    const asker = await database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('a','a','s','ASKER',now(),'casual','casual','ASKER','asker:a','low','{}',1,1,'{}',1,'s00',10001)
      RETURNING tier_source, tier_provenance_ref
    `);
    expect(asker.rows[0]).toEqual({ tier_source: "ASKER", tier_provenance_ref: "asker:a" });
    const machineDefault = await database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('machine','machine','s','ASKER',now(),'standard','standard','MACHINE_DEFAULT','machine:deployment-floor','low','{}',1,1,'{}',1,'s00',10005)
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
        composition_budget_tier, depth_params, agent_count,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('asker-raised','asker-raised','s','ASKER',now(),'casual','high-stakes','ASKER','asker:raised','low','{}',1,1,'{}',1,'s00',10006)
    `)).rejects.toThrow();
    await expect(database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('machine-raised','machine-raised','s','ASKER',now(),'casual','high-stakes','MACHINE_DEFAULT','machine:deployment-floor','low','{}',1,1,'{}',1,'s00',10007)
    `)).rejects.toThrow();
    await expect(database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('machine-lowered','machine-lowered','s','ASKER',now(),'high-stakes','casual','MACHINE_DEFAULT','machine:deployment-floor','low','{}',1,1,'{}',1,'s00',10008)
    `)).rejects.toThrow();
    const raised = await database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('b','b','s','ASKER',now(),'casual','standard','DEPLOYMENT_POLICY','asker:b','low','{}',1,1,'{}',1,'s00',10002)
      RETURNING tier_source, tier_provenance_ref
    `);
    expect(raised.rows[0]).toEqual({ tier_source: "DEPLOYMENT_POLICY", tier_provenance_ref: "asker:b" });
    await expect(database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('c','c','s','ASKER',now(),'standard','casual','DEPLOYMENT_POLICY','asker:c','low','{}',1,1,'{}',1,'s00',10003)
    `)).rejects.toThrow();
    await expect(database.pool.query(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count,
        stranger_sample_rate, envelope_basis, register_version,
        battery_version, created_at_seq
      ) VALUES ('d','d','s','ASKER',now(),'casual','standard','DERIVED','asker:d','low','{}',1,1,'{}',1,'s00',10004)
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
      askerId: "asker:graph",
      sessionId: "session:graph",
      callerScope: "ASKER",
      asOf: new Date("2026-08-07T00:00:00.000Z"),
      askerRiskTier: "casual",
      effectiveRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "asker-declaration:graph",
      compositionBudgetTier: "low",
      depthParams: { depth: 1 },
      agentCount: 1,
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
    const artifactId = randomUUID();
    const supersedingArtifactId = randomUUID();
    await new LedgerRepository(database.pool).appendRawArtifact({
      artifactId, attemptId: randomUUID(), runId: null, providerRef: "provider:test",
      provider: "test-layer-http", model: "fixture/model", maker: "fixture", modelVersion: null,
      rawText: "labeled test-layer artifact", metadata: {}, parseStatus: "UNPARSED",
      inputHash: "a".repeat(64), contractHash: "b".repeat(64), contentHash: "c".repeat(64)
    });
    await new LedgerRepository(database.pool).appendRawArtifact({
      artifactId: supersedingArtifactId, attemptId: randomUUID(), runId: null, providerRef: "provider:test",
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
  it.each([
    [3, "RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE"],
    [2, "RUN_MAKER_CONFIGURATION_MISMATCH"]
  ])("refuses agent_count %i with %s before any model call", async (agentCount, code) => {
    const provider = await startProviderDouble([]);
    try {
      const runId = await createRun(`maker-guard-${agentCount}`, 10, agentCount);
      const workItemId = await new WorkItemRepository(database.pool).enqueue({
        runId,
        batteryRowId: "Q1",
        nodeSet: [],
        commandKey: `runner-test:maker-guard-${agentCount}`
      });

      await expect(runnerWithEndpoint(provider.endpoint).executeWorkItem(workItemId)).rejects.toMatchObject({ code });
      expect(provider.calls()).toBe(0);
      const calls = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL'",
        [runId]
      );
      expect(calls.rows[0]?.count).toBe("0");
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
    const primary = await startProviderDouble(
      [
        ...Array.from({ length: 8 }, (_, index) => judgementDouble(`Primary maker position ${index + 1}`)),
        ...Array.from({ length: 8 }, (_, index) => reviewDouble("agree", `Primary review ${index + 1}`))
      ]
    );
    const secondary = await startProviderDouble(
      [
        ...Array.from({ length: 8 }, (_, index) => judgementDouble(`Secondary maker position ${index + 1}`)),
        ...Array.from({ length: 8 }, (_, index) => reviewDouble("dispute", `Secondary review ${index + 1}`))
      ]
    );
    try {
      // Sixteen authored calls plus one cross-maker review per authored node
      // exactly fill this test-layer envelope.
      // The serve gate therefore takes its real envelope-terminal path with
      // zero composer/conformance calls and zero external model calls.
      const runId = await createRun("hyg-01-depth-2-two-maker", 32, 2, 2);
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
      expect(primary.calls()).toBe(16);
      expect(secondary.calls()).toBe(16);

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

      const firstNode = await database.pool.query<{ node_id: string; provenance_ref: string }>(
        `SELECT node_id, provenance_ref::text FROM core.node WHERE run_id=$1 ORDER BY created_at_seq LIMIT 1`,
        [runId]
      );
      await expect(new JudgementRepository(database.pool).recordNodeReview({
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
      expect(unservedRecord).toMatchObject({
        served_root_rule: "first-configured-provider"
      });
      expect(unservedRecord?.reason).toContain("test-layer");
      expect(unservedRecord?.reason).toContain("Secondary test maker");
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
      ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary hidden-frame position ${index + 1}`)),
      reviewDouble("agree", "Primary review 1"),
      { status: 503 }, { status: 503 },
      reviewDouble("agree", "Primary review 3"), reviewDouble("agree", "Primary review 4"),
      composition,
      JSON.stringify({ conforms: true, findings: [] }),
      JSON.stringify({ conforms: true, findings: [] }),
      JSON.stringify({ pass: true })
    ]);
    const secondary = await startProviderDouble([
      ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary hidden-frame position ${index + 1}`)),
      ...Array.from({ length: 4 }, (_, index) => reviewDouble("dispute", `Secondary review ${index + 1}`))
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
      const storedNodes = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM core.node WHERE run_id=$1", [runId]
      );
      expect(storedNodes.rows[0]?.count).toBe("8");
      const storedSnapshot = await new GraphRepository(database.pool).materialiseSnapshot(runId);
      const targetNodeIds = [...new Set(storedSnapshot.arrows
        .filter((arrow) => arrow.targetKind === "NODE")
        .map((arrow) => arrow.targetNodeId!))];
      const judged = evaluate(excludeHiddenSubtrees({
        ...storedSnapshot,
        operatorResolutions: targetNodeIds.map((parentNodeId) => ({
          parentNodeId, operator: "accumulate" as const, suppliedBy: "deployment" as const
        }))
      }, [hiddenNodeId]));
      const servedNode = answer?.nodes.find((node) => node.node_id !== hiddenNodeId && node.final_strength !== null);
      expect(servedNode?.final_strength?.value).toBe(
        judged.strengths.find((row) => row.nodeId === servedNode?.node_id)?.strength
      );
    } finally {
      await secondary.stop();
      await primary.stop();
    }
  });

  it("RESIL-01 rev2 R1 serves the surviving maker when the preferred root's cross-maker review dies", async () => {
    const scenario = await executeResil01Scenario({
      label: "resil01-r1-served-review-dead",
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary R1 position ${index + 1}`)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary R1 review ${index + 1}`)),
        resil01Composition,
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ pass: true })
      ],
      secondary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary R1 position ${index + 1}`)),
        { status: 503 }, { status: 503 },
        ...Array.from({ length: 3 }, (_, index) => reviewDouble("dispute", `Secondary R1 review ${index + 2}`))
      ]
    });

    expect(scenario.error).toBeNull();
    expect(scenario.result?.kind).toBe("COMPLETED");
    const hidden = scenario.answer?.condition_mark_records.find((record) => record.mark === "HIDDEN-UNJUDGEABLE");
    const selection = scenario.answer?.condition_mark_records.find((record) => record.mark === "UNSERVED-MAKER-POSITION");
    expect(hidden?.affected_node_ids).toHaveLength(1);
    expect(selection?.subject_ref).not.toBe(hidden?.affected_node_ids[0]);
    expect(scenario.answer?.nodes.find((node) => node.node_id === selection?.subject_ref)?.final_strength)
      .not.toBeNull();
  });

  it("RESIL-01 rev2 R1 reports the review cause when every maker root is class H", async () => {
    const scenario = await executeResil01Scenario({
      label: "resil01-r1-no-served-root",
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary no-root position ${index + 1}`)),
        { status: 503 }, { status: 503 },
        ...Array.from({ length: 3 }, (_, index) => reviewDouble("agree", `Primary no-root review ${index + 2}`)),
        resil01Composition,
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ pass: true })
      ],
      secondary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Secondary no-root position ${index + 1}`)),
        { status: 503 }, { status: 503 },
        ...Array.from({ length: 3 }, (_, index) => reviewDouble("dispute", `Secondary no-root review ${index + 2}`))
      ]
    });

    expect(scenario.result).toBeNull();
    expect(scenario.error).toMatchObject({ code: "NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW" });
    expect(scenario.error).not.toMatchObject({ code: "EMPTY_PROPAGATION" });
  });

  it("RESIL-01 rev2 R2 keeps a healthy tau-0.30 graph servable and makes class L presentation-only", async () => {
    const scenario = await executeResil01Scenario({
      label: "resil01-r2-tau-030",
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary low position ${index + 1}`, 0.30)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary low review ${index + 1}`)),
        resil01Composition,
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ pass: true })
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
  });

  it("RESIL-01 rev2 R2 keeps a hidden low-scoring attack in the served-number evaluation", async () => {
    const scenario = await executeResil01Scenario({
      label: "resil01-r2-low-attack",
      primary: [
        ...Array.from({ length: 4 }, (_, index) => judgementDouble(`Primary attack-control ${index + 1}`)),
        ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `Primary attack review ${index + 1}`)),
        resil01Composition,
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ pass: true })
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
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ pass: true })
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
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ pass: true })
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
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ conforms: true, findings: [] }),
        JSON.stringify({ pass: true })
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
      JSON.stringify({ conforms: true, findings: [] }),
      JSON.stringify({ conforms: true, findings: [] }),
      JSON.stringify({ pass: true })
    ]);
    try {
      const work = await createRunnerWork("happy-path");
      const result = await runnerWithEndpoint(provider.endpoint).executeWorkItem(work.workItemId);
      expect(result.kind).toBe("COMPLETED");
      expect(provider.calls()).toBe(5);
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
        confidence_band: "TEST_TOP_BAND",
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
          reason: "DIFFERENT_MAKER_REVIEWER_UNAVAILABLE",
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
      JSON.stringify({ conforms: true, findings: [] }),
      JSON.stringify({ conforms: true, findings: [] }),
      JSON.stringify({ pass: true })
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
      expect(provider.calls()).toBe(5);
    } finally { await provider.stop(); }
  });

  it("persists and settles a pre-compose R9 block as components-only + DEFECT", async () => {
    const provider = await startProviderDouble([JSON.stringify({
      statement: "A blocked answer.", way_of_knowing: "REASONING", locator: null,
      restatement_text: "Different meaning.", restatement_status: "FAIL", value_laden: false,
      steelman: { summary: "A blocked answer.", fidelity: 0.4 }, critic: { summary: "Plausible counter.", counterargumentStrength: 0.6, basis: "PLAUSIBLE_COUNTER" },
      evidence: { quality: 0.4, relevance: 0.4 }, context: { fit: 0.4, ambiguityFlags: [] }, fallacy: { severity: 0.6, fatalFlags: [] }
    })]);
    try {
      const work = await createRunnerWork("pre-compose-block");
      const result = await runnerWithEndpoint(provider.endpoint).executeWorkItem(work.workItemId);
      expect(result.kind).toBe("COMPLETED");
      const row = await database.pool.query<{ state: string; terminal: string; serve_state: string; composed_text_id: string | null }>(
        `SELECT work.state, answer.terminal, answer.serve_state, answer.composed_text_id
         FROM core.work_item AS work JOIN serve.answer AS answer ON answer.answer_id = work.settled_artifact_ref
         WHERE work.work_item_id = $1`, [work.workItemId]
      );
      expect(row.rows[0]).toEqual({
        state: "DONE", terminal: "COMPONENTS_ONLY", serve_state: "COMPONENTS_ONLY", composed_text_id: null
      });
      if (result.kind !== "COMPLETED") throw new Error("TEST_EXPECTED_COMPLETION");
      const projection = await new ServeRepository(database.pool).readAnswerProjection(result.answerId, "asker:pre-compose-block");
      expect(projection?.conformance_outcome).toBe("NOT_RUN");
      expect(projection).toMatchObject({
        terminal: "COMPONENTS_ONLY",
        serve_state: "COMPONENTS_ONLY",
        condition_marks: ["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE", "DEFECT"],
        verdict_state: null,
        verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_DEFECT" },
        confidence_band: null,
        band_ceiling: null
      });
      expect(provider.calls()).toBe(1);
      const terminal = await database.pool.query("SELECT 1 FROM core.run_progress_event WHERE run_id=$1 AND kind='TERMINAL'", [work.runId]);
      expect(terminal.rowCount).toBe(1);
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
            register_row_key: "runCostEnvelope",
            source_ref: "test-layer:run-cost-envelope"
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

  it("persists and settles the pre-compose composition-budget terminal as components-only", async () => {
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
        condition_marks: ["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE", "DEFECT"],
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
        verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_DEFECT" },
        confidence_band: null, band_ceiling: null,
        composed_text: [],
        condition_marks: ["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE", "DEFECT"],
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
      JSON.stringify({ conforms: true, findings: [] }), JSON.stringify({ conforms: true, findings: [] }),
      JSON.stringify({ pass: true })
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
      expect(provider.calls()).toBe(5);
    } finally { await provider.stop(); }
  });

  it("completes redelivery from a pre-compose components-only artifact without another provider call", async () => {
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
      await database.pool.query(
        "UPDATE core.work_item SET state='READY', settled_attempt_id=NULL, settled_artifact_ref=NULL WHERE work_item_id=$1",
        [work.workItemId]
      );
      const redelivery = await runner.executeWorkItem(work.workItemId);
      expect(redelivery).toEqual({ kind: "COMPLETED", answerId: first.answerId });
      expect(provider.calls()).toBe(1);
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
    "When the supplied nodes rest on reasoning alone",
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
        } else if (system.includes("{conforms,findings}")) {
          content = JSON.stringify({ conforms: true, findings: [] });
        } else {
          content = JSON.stringify({ pass: true });
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
