import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WalkingSkeletonRunner } from "@debateai/runner";
import type { StandingDatabase } from "./standing-db.js";
import { startStandingDatabase } from "./standing-db.js";
import { assertFairDebate } from "./fair-debate.js";
import { createAcceptanceRuntime } from "./main.js";
import { seedAcceptanceRegister } from "./seed-register.js";

let database: StandingDatabase;
let dataDirectory: string;
let provider: { readonly endpoint: string; stop(): Promise<void> };
let criticProvider: { readonly endpoint: string; stop(): Promise<void> };

async function reservePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("TEST_PORT_RESOLUTION_FAILED");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function startProviderDouble(contents: readonly string[]): Promise<{
  readonly endpoint: string;
  stop(): Promise<void>;
}> {
  let cursor = 0;
  const server: Server = createServer((request, response) => {
    request.resume();
    const content = contents[cursor++];
    if (content === undefined) {
      response.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "UNEXPECTED_TEST_CALL" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      id: `acceptance-test-${cursor}`,
      model: "test-layer/model",
      choices: [{ message: { content } }]
    }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("TEST_PROVIDER_ADDRESS_FAILED");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    async stop() {
      server.close();
      await once(server, "close");
    }
  };
}

beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), "debateai-acc-01-"));
  database = await startStandingDatabase({ port: await reservePort(), dataDirectory });
  provider = await startProviderDouble([
    JSON.stringify({
      statement: "A provisional acceptance answer.",
      way_of_knowing: "REASONING",
      locator: null,
      restatement_text: "A provisional acceptance answer.",
      restatement_status: "PASS",
      value_laden: false,
      claim_type: "unknown",
      steelman: { summary: "A provisional acceptance answer.", fidelity: 0.72 },
      critic: { summary: "Plausible counter.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
      evidence: { quality: 0.72, relevance: 0.72 },
      context: { fit: 0.72, ambiguityFlags: [] },
      fallacy: { severity: 0.28, fatalFlags: [] }
    }),
    JSON.stringify({ segments: [
      { segment_id: "segment:verdict", text: "A provisional acceptance answer.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
      { segment_id: "segment:next", text: "Verify the proposal independently.", node_refs: [], served_number_refs: [] }
    ] }),
    JSON.stringify({ conforms: true, findings: [] }),
    JSON.stringify({ conforms: true, findings: [] }),
    JSON.stringify({ pass: true })
  ]);
  // FAIR-01 (DR-140(b)): the SECOND maker's transport double — one real-shaped
  // judge artifact carrying the genuine counter-position.
  criticProvider = await startProviderDouble([
    JSON.stringify({
      statement: "The strongest genuine counter-position to the acceptance answer.",
      way_of_knowing: "REASONING",
      locator: null,
      restatement_text: "The strongest genuine counter-position to the acceptance answer.",
      restatement_status: "PASS",
      value_laden: false,
      claim_type: "unknown",
      steelman: { summary: "Steelmanned counter-position.", fidelity: 0.7 },
      critic: { summary: "Counter to the counter.", counterargumentStrength: 0.31, basis: "PLAUSIBLE_COUNTER" },
      evidence: { quality: 0.6, relevance: 0.8 },
      context: { fit: 0.7, ambiguityFlags: [] },
      fallacy: { severity: 0.15, fatalFlags: [] }
    })
  ]);
});

afterAll(async () => {
  await criticProvider?.stop();
  await provider?.stop();
  await database?.stop();
  await rm(dataDirectory, { recursive: true, force: true });
});

describe("ACC-01 dry-run ceremony", () => {
  it("refuses the fair debate loudly when composed without the DR-074 scoringOperator row (AC-76: never invented)", async () => {
    // DR-144 seeds the ruled row, so a seeded acceptance register can no
    // longer produce the unruled state (register_row is append-only). The
    // typed guard survives as composition defence: a runner wired for the
    // fair debate WITHOUT the ruled row stops BEFORE any claim or model call.
    const bound = { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 1_000 };
    const refusingProvider = {
      call: async (): Promise<never> => { throw new Error("TEST_PROVIDER_MUST_NOT_BE_CALLED"); }
    };
    const runner = new WalkingSkeletonRunner(database.pool, refusingProvider, {
      workerId: "acceptance:test-layer:unruled-operator",
      claimMs: 10_000,
      claimMarginMs: 0,
      judgeBound: bound,
      composerBound: bound,
      conformanceBound: bound,
      providerRef: "acceptance:codex-cli",
      judgeContractHash: "a".repeat(64),
      composerContractHash: "b".repeat(64),
      conformanceContractHash: "c".repeat(64),
      propagationContractHash: "d".repeat(64),
      serveContractHash: "e".repeat(64),
      maxRecompose: 2,
      factBundleVersion: 1,
      judgementNumberKind: "base-probability",
      judgementProducer: "judgement:test-layer",
      propagationNumberKind: "propagated-probability",
      propagationProducer: "propagation:test-layer",
      compositionRow: {
        rowKey: "claimTypeCompositionMap",
        registerVersion: 1,
        sourceRef: "acceptance:test-layer",
        value: { kind: "CLAIM_TYPE_COMPOSITION_MAP", entries: {} }
      },
      servePolicy: {
        compositionBudgets: {
          low: { tier: "low", bound: 10_000, registerRowKey: "compositionBundleBudget", registerVersion: 1, sourceRef: "acceptance:test-layer" },
          medium: { tier: "medium", bound: 20_000, registerRowKey: "compositionBundleBudget", registerVersion: 1, sourceRef: "acceptance:test-layer" },
          high: { tier: "high", bound: 30_000, registerRowKey: "compositionBundleBudget", registerVersion: 1, sourceRef: "acceptance:test-layer" }
        },
        candidateConfidenceBand: "FULL",
        bandCeiling: {
          rowKey: "wayOfKnowingCeiling",
          registerVersion: 1,
          sourceRef: "acceptance:test-layer",
          value: {
            bandOrder: ["CAPPED", "FULL"],
            ceilingLabels: ["DEFAULT_CEILING"],
            defaultCeiling: { label: "DEFAULT_CEILING", ceilingBand: "FULL", liftPath: "retain-band" },
            cuts: []
          }
        }
      },
      judgementPolicy: {
        selectionRule: {
          kind: "MAXIMIZE_WEIGHTED_TAU",
          rowKey: "claimTypeCompositionMap",
          registerVersion: 1,
          sourceRef: "acceptance:test-layer"
        },
        earnedWeight: 1,
        judgeWeightVersion: "acceptance:test-layer",
        reducerVersion: "acceptance:test-layer"
      },
      critique: { provider: refusingProvider, providerRef: "acceptance:claude-cli" }
      // scoringOperator deliberately omitted — the unruled composition.
    });
    await expect(runner.executeNext()).rejects.toMatchObject({ code: "SCORING_OPERATOR_UNRESOLVED" });
  });

  it("seeds idempotently, submits through the real API root, settles, and reads through the same token", async () => {
    const firstSeed = await seedAcceptanceRegister(database.pool);
    const countBefore = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM register.register_row WHERE register_version=1"
    );
    const secondSeed = await seedAcceptanceRegister(database.pool);
    const countAfter = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM register.register_row WHERE register_version=1"
    );
    expect(secondSeed).toEqual(firstSeed);
    expect(countAfter.rows[0]?.count).toBe(countBefore.rows[0]?.count);

    // DR-144: the seed persists the ruled scoringOperator row byte-faithfully
    // with the ruling's own provenance (idempotent across the double seed).
    const scoringRow = await database.pool.query<{ value: string; source_ref: string }>(
      `SELECT value_json #>> '{}' AS value, source_ref FROM register.register_row
       WHERE register_version=1 AND row_key='scoringOperator'`
    );
    expect(scoringRow.rows).toEqual([{ value: "accumulate", source_ref: "acceptance:DR-144:V-approved" }]);

    // TERM-01: no test-only evaluator — the dry ceremony now runs the REAL
    // DR-139 terminal activation evaluator wired by createAcceptanceRuntime.
    const runtime = await createAcceptanceRuntime({
      pool: database.pool,
      environment: {
        DATABASE_URL: database.connectionString,
        API_HOST: "127.0.0.1",
        API_PORT: 8_000,
        STRANGER_SAMPLE_RATE: 1,
        BATTERY_VERSION: "acceptance:test-layer",
        SETTLEMENT_WATCH_HANDLE: "acceptance:test-layer:settlement-watch",
        MODEL_BASE_URL: provider.endpoint
      },
      // FAIR-01: the second maker's relay endpoint plus its honestly-reported
      // model id (live: the claude CLI handshake reports it; here: the double).
      criticRelay: { baseUrl: criticProvider.endpoint, model: "test-layer/critic-model" }
    });
    const token = "acc-01-owner-token";
    const ask = await runtime.api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: { "x-user-dev-token": token },
      payload: {
        question_line: "What is the strongest case for adopting this proposal?",
        risk_tier: "standard",
        tier_source: "ASKER",
        tier_provenance_ref: "acceptance:test-layer:asker",
        composition_budget_tier: "low",
        depth_params: { depth: 1 },
        agent_count: 1,
        decision_owner: "acceptance-test-owner",
        action_owner: "acceptance-test-owner",
        decision_scope: "acceptance-test",
        caller_scope: "ASKER",
        as_of: "2026-08-09T00:00:00.000Z",
        steering_presets: [],
        steering_annotations: []
      }
    });
    if (ask.statusCode !== 202) {
      throw new Error(`ACCEPTANCE_TEST_ASK_REJECTED:${ask.statusCode}:${ask.body}`);
    }
    const runId = (ask.json() as { run_ref: string }).run_ref;
    let workState: { state: string; terminal_reason: string | null } | undefined;
    await vi.waitFor(async () => {
      const work = await database.pool.query<{ state: string; terminal_reason: string | null }>(
        "SELECT state, terminal_reason FROM core.work_item WHERE run_id=$1",
        [runId]
      );
      workState = work.rows[0];
      expect(workState?.state).toBe("DONE");
    });
    expect(workState).toEqual({ state: "DONE", terminal_reason: null });

    // The DR-135 64-row refusal is replaced by honest per-row transitions:
    // no WAIT survives, and each drained row carries its computed inputs.
    const latestStates = await database.pool.query<{ state: string; count: string }>(
      `SELECT latest.state, count(*)::text AS count FROM (
         SELECT DISTINCT ON (battery_row_id) battery_row_id, state
         FROM core.run_row_activation_event WHERE run_id = $1
         ORDER BY battery_row_id, at_seq DESC
       ) AS latest GROUP BY latest.state ORDER BY latest.state`,
      [runId]
    );
    // FAIR-01: the two-node debate honestly flips eight recorded-fact rows
    // from INACTIVE to ACTIVE (24→32): Q9 (live_answer_count 2), Q26–Q31
    // (the split into rival positions with one spawned child and one
    // survivor), and Q45 (multiple components to compose) — each drained
    // filing carries its recorded predicate inputs.
    expect(Object.fromEntries(latestStates.rows.map((row) => [row.state, Number(row.count)]))).toEqual({
      ACTIVE: 32,
      INACTIVE: 36,
      POLICY_BLOCKED: 3
    });
    const drainedEvidence = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM core.run_row_activation_event
       WHERE run_id = $1 AND predicate_inputs->>'evaluator' = 'battery:terminal-activation-evaluator:DR-139:v1'`,
      [runId]
    );
    expect(Number(drainedEvidence.rows[0]?.count)).toBe(64);

    const owned = await runtime.api.inject({
      method: "GET",
      url: `/v1/runs/${runId}/answer`,
      headers: { "x-user-dev-token": token }
    });
    expect(owned.statusCode).toBe(200);
    expect(owned.json()).toMatchObject({ run_ref: runId, question_line: "What is the strongest case for adopting this proposal?" });
    // DR-139(4): the served answer names each owed-but-unexecuted check.
    const answerPayload = owned.json() as {
      condition_marks: string[];
      condition_mark_records: { mark: string; subject_ref: string }[];
    };
    expect(answerPayload.condition_marks).toContain("OWED-CHECK-UNEXECUTED");
    const owedRows = answerPayload.condition_mark_records
      .filter((record) => record.mark === "OWED-CHECK-UNEXECUTED")
      .map((record) => record.subject_ref)
      .sort();
    // FAIR-01: the eight newly ACTIVE rows join the DR-139(4) owed-check
    // record — ACTIVE at completion with no recorded executed check rides the
    // served answer loudly, never silently.
    expect(owedRows).toEqual([
      "Q10", "Q18", "Q2", "Q26", "Q27", "Q28", "Q29", "Q3", "Q30", "Q31",
      "Q33", "Q36", "Q38", "Q4", "Q43", "Q45", "Q5", "Q52", "Q53", "Q54",
      "Q57", "Q59", "Q6", "Q7", "Q8", "Q9", "R2", "R7"
    ]);
    // DR-141(2): the DR-021 knob-10 type-resolution fallback label rides the
    // served answer whenever the fallback was consulted (Q37 and Q50 here).
    expect(answerPayload.condition_marks).toContain("UNRESOLVED-TYPE-FALLBACK");
    const typeFallbackRows = answerPayload.condition_mark_records
      .filter((record) => record.mark === "UNRESOLVED-TYPE-FALLBACK")
      .map((record) => record.subject_ref)
      .sort();
    expect(typeFallbackRows).toEqual(["Q37", "Q50"]);

    // FAIR-01 (DR-140(b)): the settled debate's answer graph carries MORE THAN
    // ONE NODE — the position AND the genuine counter-position — joined by a
    // real attack edge, each node with its own maker's artifact lineage.
    const graphPayload = owned.json() as {
      nodes: {
        node_id: string;
        claim: string;
        provenance_ref: string;
        defeater_refs: string[];
        base_score: { value: number };
        final_strength: { value: number; source: string };
      }[];
      edges: { edge_id: string; from_node_ref: string; target_ref: string; relation: string; placeholder: boolean }[];
      number_slots: ({ status: "PRESENT"; number: { value: number } } | { status: string })[];
    };
    expect(graphPayload.nodes).toHaveLength(2);
    expect(graphPayload.edges).toHaveLength(1);
    const positionNode = graphPayload.nodes[0]!;
    const counterNode = graphPayload.nodes[1]!;
    expect(positionNode.claim).toBe("A provisional acceptance answer.");
    expect(counterNode.claim).toBe("The strongest genuine counter-position to the acceptance answer.");
    expect(graphPayload.edges[0]).toMatchObject({
      from_node_ref: counterNode.node_id,
      target_ref: positionNode.node_id,
      relation: "attack",
      placeholder: true
    });
    expect(positionNode.defeater_refs).toEqual([counterNode.node_id]);

    // Honest per-node lineage: each node's provenance artifact carries its own
    // maker; the debate persisted TWO distinct makers (DR-140(b), DR-115).
    const nodeMakers = await database.pool.query<{ node_id: string; maker: string }>(
      `SELECT node.node_id, artifact.maker
       FROM core.node AS node
       JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = node.provenance_ref
       WHERE node.run_id = $1 ORDER BY node.created_at_seq`,
      [runId]
    );
    expect(nodeMakers.rows.map((row) => row.maker)).toEqual(["OpenAI", "Anthropic"]);

    // Honest per-node strength lineage: each recorded strength cites ITS node's
    // artifact, never the position's artifact stamped onto the counter.
    const strengthLineage = await database.pool.query<{ node_id: string; source_ref: string; provenance_ref: string }>(
      `SELECT strength.node_id, strength.source_ref, node.provenance_ref::text
       FROM ledger.node_strength_record AS strength
       JOIN core.node AS node ON node.node_id = strength.node_id
       JOIN ledger.propagation_run AS propagation
         ON propagation.propagation_run_id = strength.propagation_run_id
       WHERE propagation.run_id = $1`,
      [runId]
    );
    expect(strengthLineage.rows).toHaveLength(2);
    for (const row of strengthLineage.rows) {
      expect(row.source_ref).toBe(row.provenance_ref);
    }

    // The served number remains the POSITION's final strength.
    const presentSlot = graphPayload.number_slots.find((slot) => slot.status === "PRESENT") as
      | { status: "PRESENT"; number: { value: number } }
      | undefined;
    expect(presentSlot?.number.value).toBe(positionNode.final_strength.value);

    // DR-141(4): a run carrying critique packets REFUSES at terminal (Q42) —
    // the fair debate therefore records NO packet; the counter's independence
    // is carried by recorded per-artifact maker lineage instead.
    const packetCount = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.critique_packet WHERE run_id=$1",
      [runId]
    );
    expect(packetCount.rows[0]?.count).toBe("0");

    // The critic's model call is a recorded first-class MODEL_CALL at its own
    // call site, budgeted within the DR-138 run total.
    const criticCalls = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ledger.ledger_entry
       WHERE run_id = $1 AND action_kind = 'MODEL_CALL' AND call_site_key = 'JUDGE:critic'`,
      [runId]
    );
    expect(criticCalls.rows[0]?.count).toBe("1");

    // The RUN-LEVEL fair-debate gate (DR-143 clause 1) passes on this run.
    await expect(assertFairDebate(database.pool, runId)).resolves.toEqual({
      nodeCount: 2,
      attackEdgeCount: 1,
      distinctMakers: ["Anthropic", "OpenAI"],
      independentAttackEdgeCount: 1
    });

    const foreign = await runtime.api.inject({
      method: "GET",
      url: `/v1/runs/${runId}/answer`,
      headers: { "x-user-dev-token": "different-owner-token" }
    });
    expect(foreign.statusCode).toBe(404);
    await runtime.api.close();
  });
});
