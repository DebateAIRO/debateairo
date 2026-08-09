import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { BATTERY_EXECUTION_CONTRACTS, createInitialBatteryRows, SplitStageRunner, WorkItemRepository } from "@debateai/battery";
import { LedgerRepository } from "@debateai/ledger";
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
import { createPostgresProviderGateway, WalkingSkeletonRunner, type WalkingSkeletonSettings } from "@debateai/runner";
import { ServeRepository } from "@debateai/serve";
import { LivenessRepository } from "@debateai/liveness";

let database: TestDatabase;
const batteryRows = createInitialBatteryRows({ settlementWatchHandle: "settlement-watch:test-layer" });

const runnerSettings = (): WalkingSkeletonSettings => ({
  workerId: "runner:test-layer", claimMs: 10_000, claimMarginMs: 1_000,
  judgeBound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
  composerBound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
  conformanceBound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
  providerRef: "provider:test-layer", judgeContractHash: "contract:judge:test-layer",
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

async function createRun(questionLine: string, maxModelAttempts = 10): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine, askerId: `asker:${questionLine}`, sessionId: `session:${questionLine}`, callerScope: "ASKER",
    asOf: new Date("2026-08-07T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker-declaration:${questionLine}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, agentCount: 1, strangerSampleRate: 1,
    envelopeBasis: {
      max_model_attempts: maxModelAttempts,
      register_row_key: "runCostEnvelope",
      register_version: 1,
      source_ref: "test-layer:run-cost-envelope",
      derived_from: { depth_params: { depth: 1 }, risk_tier: "casual" }
    },
    registerVersion: 1, batteryVersion: "s00", batteryRows
  });
}

async function createRunnerWork(questionLine: string): Promise<{ runId: string; workItemId: string }> {
  const runId = await createRun(questionLine);
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `runner-test:${questionLine}`
  });
  return { runId, workItemId };
}

async function startProviderDouble(contents: readonly string[]): Promise<{
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
        band_ceiling: { label: "TEST_DEFAULT_CEILING" }
      });
      expect(projection?.nodes[0]?.base_score).toMatchObject({
        kind: "base-probability", producer: "judgement:test-layer"
      });
      expect(projection?.nodes[0]?.base_score.replay_handle).toMatch(/^judgement:/);
      expect(projection?.nodes[0]?.final_strength).toMatchObject({
        kind: "propagated-probability", producer: "propagation:test-layer"
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
        condition_marks: ["DEFECT"],
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
        condition_marks: ["SKIPPED-BY-BUDGET", "ENVELOPE_EXHAUSTED"],
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
        composed_text_id: null, conformance_record_id: null, condition_marks: ["DEFECT"],
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
        composed_text: [], condition_marks: ["DEFECT"], conformance_outcome: "NOT_RUN"
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
