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
import { acceptanceServiceRequestHeaders, createAcceptanceRuntime } from "./main.js";
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
  type ResponseClass = "JUDGE" | "REVIEW" | "COMPOSE" | "CONFORMANCE" | "R9" | "GENERAL";
  const classifyContent = (content: string): ResponseClass => {
    try {
      const value = JSON.parse(content) as Record<string, unknown>;
      if ("statement" in value) return "JUDGE";
      if ("outcome" in value) return "REVIEW";
      if ("segments" in value) return "COMPOSE";
      if ("conforms" in value) return "CONFORMANCE";
      if ("pass" in value) return "R9";
    } catch { /* health-probe fixtures retain FIFO semantics */ }
    return "GENERAL";
  };
  const pending = contents.map((content) => ({ content, kind: classifyContent(content) }));
  let calls = 0;
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const requestKind: ResponseClass = body.includes("Review an existing debate node") ? "REVIEW"
        : body.includes("\"statement\": non-empty string") ? "JUDGE"
          : body.includes("{conforms,findings}") ? "CONFORMANCE"
            : body.includes("{pass}") ? "R9"
              : body.includes("segments") && body.includes("served_number_refs") ? "COMPOSE" : "GENERAL";
      const matching = requestKind === "GENERAL" ? -1 : pending.findIndex((entry) => entry.kind === requestKind);
      const content = pending.splice(matching < 0 ? 0 : matching, 1)[0]?.content;
      calls += 1;
      if (content === undefined) {
        response.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "UNEXPECTED_TEST_CALL" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        id: `acceptance-test-${calls}`,
        model: "test-layer/model",
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
    async stop() {
      server.close();
      await once(server, "close");
    }
  };
}

function judgementDouble(statement: string): string {
  return JSON.stringify({
    statement,
    way_of_knowing: "REASONING",
    locator: null,
    restatement_text: statement,
    restatement_status: "PASS",
    value_laden: false,
    claim_type: "unknown",
    steelman: { summary: statement, fidelity: 0.72 },
    critic: { summary: "Plausible counter.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: 0.72, relevance: 0.72 },
    context: { fit: 0.72, ambiguityFlags: [] },
    fallacy: { severity: 0.28, fatalFlags: [] }
  });
}

function reviewDouble(outcome: "agree" | "dispute" | "cannot-assess", reason: string): string {
  return JSON.stringify({ outcome, reasons: [reason] });
}

beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), "debateai-acc-01-"));
  database = await startStandingDatabase({ port: await reservePort(), dataDirectory });
  provider = await startProviderDouble([
    "claim-health-probe",
    judgementDouble("A provisional acceptance answer."),
    judgementDouble("A primary-maker defence of the second root."),
    judgementDouble("A primary-maker attack on the second root."),
    judgementDouble("The primary maker directly defends its root and attacks the other root."),
    ...Array.from({ length: 4 }, (_, index) => reviewDouble("agree", `OpenAI review ${index + 1}`)),
    JSON.stringify({ segments: [
      { segment_id: "segment:verdict", text: "A provisional acceptance answer.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
      { segment_id: "segment:next", text: "Verify the proposal independently.", node_refs: [], served_number_refs: [] }
    ] }),
    JSON.stringify({ conforms: true, findings: [] }),
    JSON.stringify({ conforms: true, findings: [] }),
    JSON.stringify({ pass: true })
  ]);
  // PANEL-01: the second maker independently authors a root, grows both
  // primary-root children, and authors its ordered cross-root response.
  criticProvider = await startProviderDouble([
    "claim-health-probe",
    judgementDouble("An independent Anthropic position on the question."),
    judgementDouble("A genuine supporting case for the acceptance answer."),
    judgementDouble("The strongest genuine counter-position to the acceptance answer."),
    judgementDouble("The second maker directly defends its root and attacks the primary root."),
    ...Array.from({ length: 4 }, (_, index) => reviewDouble("dispute", `Anthropic review ${index + 1}`))
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
      maker: "OpenAI",
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
      critique: { provider: refusingProvider, providerRef: "acceptance:claude-cli", maker: "Anthropic" }
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
      serviceCredential:"a".repeat(43),
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
      makerRelays: [
        {
          providerRef: "acceptance:codex-cli",baseUrl: provider.endpoint,model: "test-layer/model",
          authorizationHeader: "Bearer test-primary-relay"
        },
        {
          providerRef: "acceptance:claude-cli",baseUrl: criticProvider.endpoint,model: "test-layer/model",
          authorizationHeader: "Bearer test-critic-relay"
        },
      ]
    });
    try {
    const origin = "http://127.0.0.1:8000";
    const ask = await runtime.api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: acceptanceServiceRequestHeaders(runtime.serviceSession, origin, true),
      payload: {
        question_line: "What is the strongest case for adopting this proposal?",
        risk_tier: "standard",
        tier_source: "ASKER",
        tier_provenance_ref: "acceptance:test-layer:asker",
        composition_budget_tier: "low",
        depth_params: { depth: 1 },
        decision_scope: "acceptance-test",
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
      if (workState?.state === "FAILED") throw new Error(`ACCEPTANCE_WORK_FAILED:${workState.terminal_reason}`);
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
      headers: acceptanceServiceRequestHeaders(runtime.serviceSession, origin, false)
    });
    expect(owned.statusCode).toBe(200);
    expect(owned.json()).toMatchObject({ run_ref: runId, question_line: "What is the strongest case for adopting this proposal?" });
    // DR-139(4): the served answer names each owed-but-unexecuted check.
    const answerPayload = owned.json() as {
      condition_marks: string[];
      condition_mark_records: {
        mark: string;
        subject_ref: string;
        reason: string;
        served_root_rule: string | null;
      }[];
    };
    // PANEL-01 rev2 / DR-161: removing the multi-maker mark (the exact []
    // mutation that survived rev1) or its typed record must fail this ceremony.
    expect(answerPayload.condition_marks).toContain("UNSERVED-MAKER-POSITION");
    expect(answerPayload.condition_marks).not.toContain("UNCOVERED-SCOPE");
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

    // PRO-01 (DR-149/DR-159): depth 1 means one expansion round — the neutral
    // question remains synthetic, while the graph carries a position plus a
    // real PRO and a real CON child.
    const graphPayload = owned.json() as {
      nodes: {
        node_id: string;
        claim: string;
        provenance_ref: string;
        defeater_refs: string[];
        base_score: { value: number };
        final_strength: { value: number; source: string };
        maker_lineage: { maker: string };
        review: null | {
          outcome: "agree" | "dispute" | "cannot-assess";
          reasons: string[];
          reviewer_lineage: { maker: string };
        };
      }[];
      edges: { edge_id: string; from_node_ref: string; target_ref: string; relation: string; placeholder: boolean }[];
      number_slots: ({ status: "PRESENT"; number: { value: number } } | { status: string })[];
    };
    expect(graphPayload.nodes).toHaveLength(8);
    expect(graphPayload.edges).toHaveLength(8);
    const positionNode = graphPayload.nodes[0]!;
    const secondRootNode = graphPayload.nodes[1]!;
    const defenderNode = graphPayload.nodes[2]!;
    const counterNode = graphPayload.nodes[3]!;
    expect(positionNode.claim).toBe("A provisional acceptance answer.");
    expect(secondRootNode.claim).toBe("An independent Anthropic position on the question.");
    expect(defenderNode.claim).toBe("A genuine supporting case for the acceptance answer.");
    expect(counterNode.claim).toBe("The strongest genuine counter-position to the acceptance answer.");
    expect(graphPayload.edges).toEqual(expect.arrayContaining([expect.objectContaining({
      from_node_ref: defenderNode.node_id,
      target_ref: positionNode.node_id,
      relation: "support",
      placeholder: true
    }), expect.objectContaining({
      from_node_ref: counterNode.node_id,
      target_ref: positionNode.node_id,
      relation: "attack",
      placeholder: true
    })]));
    expect(positionNode.defeater_refs).toEqual([counterNode.node_id]);

    // Honest per-node lineage: each node's provenance artifact carries its own
    // maker; both children were actually authored by the configured secondary
    // maker, never relabelled from the primary position (DR-149, DR-115).
    const nodeMakers = await database.pool.query<{ node_id: string; maker: string }>(
      `SELECT node.node_id, artifact.maker
       FROM core.node AS node
       JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = node.provenance_ref
       WHERE node.run_id = $1 ORDER BY node.created_at_seq`,
      [runId]
    );
    expect(nodeMakers.rows.map((row) => row.maker)).toEqual([
      "OpenAI", "Anthropic", "Anthropic", "Anthropic", "OpenAI", "OpenAI", "OpenAI", "Anthropic"
    ]);
    expect(graphPayload.nodes.every((node) => node.review !== null)).toBe(true);
    expect(graphPayload.nodes.every(
      (node) => node.review!.reviewer_lineage.maker !== node.maker_lineage.maker
    )).toBe(true);
    expect(new Set(graphPayload.nodes.map((node) => node.review!.outcome))).toEqual(
      new Set(["agree", "dispute"])
    );
    const unservedMakerRecord = answerPayload.condition_mark_records.find(
      (record) => record.mark === "UNSERVED-MAKER-POSITION"
    );
    expect(unservedMakerRecord).toEqual(expect.objectContaining({
      subject_ref: positionNode.node_id,
      served_root_rule: "first-configured-provider"
    }));
    expect(unservedMakerRecord?.reason).toContain("OpenAI");
    expect(unservedMakerRecord?.reason).toContain("Anthropic");
    expect(unservedMakerRecord?.reason).toContain(positionNode.node_id);
    expect(unservedMakerRecord?.reason).toContain(secondRootNode.node_id);
    expect(unservedMakerRecord?.reason).not.toContain("first-configured-provider");
    // The carried rule outcome must match served reality, not merely name a
    // policy: the served number belongs to the record's subject root.
    expect(unservedMakerRecord?.subject_ref).toBe(positionNode.node_id);

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
    expect(strengthLineage.rows).toHaveLength(8);
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

    // Both expansion legs are first-class model calls at distinct call sites.
    const expansionCalls = await database.pool.query<{ call_site_key: string }>(
      `SELECT call_site_key FROM ledger.ledger_entry
       WHERE run_id = $1 AND action_kind = 'MODEL_CALL'
         AND (call_site_key LIKE 'JUDGE:%:root%:r1:p%' OR call_site_key LIKE 'JUDGE:cross-root:%')
       ORDER BY call_site_key`,
      [runId]
    );
    expect(expansionCalls.rows.map((row) => row.call_site_key)).toEqual([
      "JUDGE:critic:root0:r1:p0",
      "JUDGE:critic:root1:r1:p1",
      "JUDGE:cross-root:0->1",
      "JUDGE:cross-root:1->0",
      "JUDGE:defender:root0:r1:p0",
      "JUDGE:defender:root1:r1:p1"
    ]);

    // The RUN-LEVEL fair-debate gate (DR-143 clause 1) passes on this run.
    await expect(assertFairDebate(database.pool, runId)).resolves.toEqual({
      nodeCount: 8,
      attackEdgeCount: 4,
      distinctMakers: ["Anthropic", "OpenAI"],
      independentAttackEdgeCount: 4
    });

    const foreign = await runtime.api.inject({
      method: "GET",
      url: `/v1/runs/${runId}/answer`,
      headers: {
        cookie: `__Host-debateai-session=${"f".repeat(43)}`,
        "user-agent": runtime.serviceSession.userAgent
      }
    });
    // An unrecognised cookie never materialises a synthetic foreign identity.
    expect(foreign.statusCode).toBe(401);
    } finally {
      await runtime.api.close();
    }
  });
});
