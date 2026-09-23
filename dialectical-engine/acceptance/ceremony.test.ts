import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AnswerSchema } from "@debateai/contract";
import { WalkingSkeletonRunner } from "@debateai/runner";
import { readDefinitionOfDoneFacts } from "./dod-facts.js";
import type { StandingDatabase } from "./standing-db.js";
import { startStandingDatabase } from "./standing-db.js";
import { assertFairDebate } from "./fair-debate.js";
import { acceptanceServiceRequestHeaders, createAcceptanceRuntime } from "./main.js";
import { ACCEPTANCE_REGISTER_VERSION, seedAcceptanceRegister } from "./seed-register.js";
import { withRequestDerivedBearings, type ReviewBearingPolicy } from "../tests/support/reviewBearings.js";
import { evaluatorSatisfied, isEvaluatorPacket } from "./test-fixtures/evaluator-double.js";

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
  type ResponseClass = "JUDGE" | "REVIEW" | "COMPOSE" | "EVALUATOR" | "GENERAL";
  const classifyContent = (content: string): ResponseClass => {
    try {
      const value = JSON.parse(content) as Record<string, unknown>;
      if ("statement" in value) return "JUDGE";
      if ("outcome" in value) return "REVIEW";
      if ("segments" in value) return "COMPOSE";
      // F-SEALEDROWS-B: T9 folded the retired `{conforms,findings}` and `{pass}`
      // organs into ONE evaluator verdict, so those two classes no longer exist
      // and a fixture scripting them scripts a call nobody makes.
      if ("satisfied" in value) return "EVALUATOR";
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
      // T3 / S2-2: the judge panel asks every NON-AUTHOR maker to assess each
      // authored node. That leg is answered straight from the contract rather
      // than from `pending`, so every authoring/review/compose fixture below
      // keeps its exact queue position — the panel adds calls, it does not
      // re-order the ceremony's scripted ones.
      // W7 / V-BLIND-CONTEXT: a STRUCTURAL key, never prose. The sentence this
      // replaces was prompt text that a ruling changed, and the branch went dead
      // — the panel leg was answered out of the scripted queue and the ceremony
      // came back with LABEL-BASIS-INCOMPLETE. Measured on the shipped prompts:
      // the assessment keys are in the JUDGE prompt too (judge embeds the whole
      // assessment schema), so the panel is the assessment WITHOUT the judge's
      // `restatement_text`, a negative pinned by
      // `tests/unit/t03-judge-panel.test.ts`. Bare identifiers survive the JSON
      // encoding that defeats a quoted fragment (T3 N4, below).
      if (body.includes("fatalFlags") && !body.includes("restatement_text")) {
        calls += 1;
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
          id: `acceptance-panel-${calls}`,
          model: "test-layer/model",
          choices: [{ message: { content: panelAssessmentDouble() } }]
        }));
        return;
      }
      // T3 N4: the JUDGE discriminator must be ESCAPE-SAFE. The rendered packet reaches
      // the wire JSON-encoded, so a quoted fragment like `"statement": non-empty string`
      // arrives as \"statement\" and never matches — the old check was dead, and only
      // the FIFO fallback below hid it.
      const requestKind: ResponseClass = body.includes("edge_bearings") ? "REVIEW"
        : body.includes("restatement_text") ? "JUDGE"
          // F-SEALEDROWS-B: the EVALUATOR discriminator is the SHIPPED prompt
          // itself (see `test-fixtures/evaluator-double.ts`), so it cannot go
          // stale against the runner the way the two retired ones did. Measured
          // before the repair: the evaluator call matched NONE of the four
          // discriminators here and fell through to GENERAL, where the FIFO
          // fallback answered it out of whatever queue it landed on.
          : isEvaluatorPacket(body) ? "EVALUATOR"
            : body.includes("served_number_refs") ? "COMPOSE" : "GENERAL";
      // T3 N4: never GUESS ACROSS CLASSES — in EITHER direction. A request of
      // any class, GENERAL included, consumes the first scripted response of
      // ITS OWN class and otherwise refuses by name; FIFO order survives WITHIN
      // a class, which is all the untyped health probes ever needed.
      //
      // This was one-directional until a mutant said so. Only RECOGNISED
      // requests were held to the rule; an UNRECOGNISED one still took the head
      // of the queue whatever class sat there — which is exactly how the
      // EVALUATOR call was answered out of a retired-conformance queue before
      // F-SEALEDROWS-B was repaired. It also made the repair untestable: with a
      // deliberately dead EVALUATOR discriminator the call fell through to
      // GENERAL, the fallback served the evaluator entry anyway, and this
      // ceremony stayed GREEN while classifying nothing
      // (`logs/demo-path/r1-mut-M3-dead-discriminator-ceremony.log`). A wrong
      // class must cost a refusal, never a lucky answer.
      const matching = pending.findIndex((entry) => entry.kind === requestKind);
      calls += 1;
      if (matching < 0) {
        response.writeHead(500, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "PROVIDER_DOUBLE_UNSCRIPTED_CLASS", requestKind }));
        return;
      }
      const scripted = pending.splice(matching, 1)[0]?.content;
      // T5/S3-1: a review response must measure exactly the edges THIS call
      // offered, so the declared policy is resolved against the live request.
      const content = scripted !== undefined && requestKind === "REVIEW"
        ? withRequestDerivedBearings(scripted, body)
        : scripted;
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

/**
 * T5/S3-1: the review artifact now also carries one bearing per edge the
 * reviewed node sources, and the count is pinned to the edges the CALL offered
 * — which a scripted string cannot know. The fixture declares a POLICY and the
 * double above expands it against the real request.
 *
 * The default is `cannot-assess`: this double does not assess bearings and says
 * so in the goal's own vocabulary rather than claiming to have measured zero
 * edges. Those edges stay UNKNOWN and contribute nothing, so the ceremony's
 * numbers are exactly what they were before T5 landed.
 */
function reviewDouble(
  outcome: "agree" | "dispute" | "cannot-assess",
  reason: string,
  bearings: ReviewBearingPolicy = "cannot-assess"
): string {
  return JSON.stringify({ outcome, reasons: [reason], edge_bearings: { __policy: bearings } });
}

/** T3 / S2-2: one panel member's assessment of a node another maker authored. */
function panelAssessmentDouble(): string {
  return JSON.stringify({
    steelman: { summary: "The strongest reading of the assessed node.", fidelity: 0.61 },
    critic: { summary: "A plausible counter to the assessed node.", counterargumentStrength: 0.34, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: 0.61, relevance: 0.61 },
    context: { fit: 0.61, ambiguityFlags: [] },
    fallacy: { severity: 0.34, fatalFlags: [] }
  });
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
    ] })
  ]);
  // PANEL-01: the second maker independently authors a root, grows both
  // primary-root children, and authors its ordered cross-root response.
  criticProvider = await startProviderDouble([
    "claim-health-probe",
    judgementDouble("An independent Anthropic position on the question."),
    judgementDouble("A genuine supporting case for the acceptance answer."),
    judgementDouble("The strongest genuine counter-position to the acceptance answer."),
    judgementDouble("The second maker directly defends its root and attacks the primary root."),
    ...Array.from({ length: 4 }, (_, index) => reviewDouble("dispute", `Anthropic review ${index + 1}`)),
    // T9 / F-SEALEDROWS-B: the sealed EVALUATOR identity is the SECOND
    // configured family's first provider — `acceptance:claude-cli`, this
    // double — while the SYNTHESIZER stays with `acceptance:codex-cli`. The
    // retired conformance and R9 responses sat on the primary provider and
    // were never consumed once T9 landed; the one call that IS made arrives
    // here. One entry, because a satisfied verdict ends the loop in round 1
    // and a second evaluator call would be a real change this fixture should
    // refuse by name rather than answer.
    evaluatorSatisfied()
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
      // T9 x board F33 — the class closure. `synthesisRolePolicy` is REQUIRED on
      // WalkingSkeletonSettings, so a deployment or fixture can no longer omit the
      // family the runner refuses over: omission is a compile error, not a claim-time
      // surprise. Provisioning only — this refusal fires on an EARLIER gate, and both
      // refs name this fixture's own configured provider (identical refs stay lawful,
      // goal 84-85), so no assertion here changes.
      synthesisRolePolicy: {
        registerVersion: 1,
        synthesizerRoleRef: "acceptance:codex-cli",
        evaluatorRoleRef: "acceptance:codex-cli",
        evaluatorLoopMaxRounds: 3,
        identicalRoleRefs: true,
        // W10/3: provisioning only. This fixture's provider REFUSES every call
        // (`TEST_PROVIDER_MUST_NOT_BE_CALLED`), so no synthesis bound is ever
        // spent here; the fixture reuses the same `bound` the organ pair above
        // uses so the claim guard sees nothing new.
        synthesizerBound: bound,
        evaluatorBound: bound,
        sourceRefs: {
          synthesizerRoleRef: "test-layer:J8",
          evaluatorRoleRef: "test-layer:J8",
          evaluatorLoopMaxRounds: "test-layer:goal-v4:80-96"
        }
      },
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
            ceilingLabels: ["DEFAULT_CEILING", "NO_VERIFIED_EVIDENCE_FLOOR"],
            defaultCeiling: { label: "DEFAULT_CEILING", ceilingBand: "FULL", liftPath: "retain-band" },
            cuts: [],
            // F-T9B-3 / codex r1 B2: the current fixture describes its own
            // floor, as every current sealed row now must.
            emptyBasisFloor: {
              label: "NO_VERIFIED_EVIDENCE_FLOOR",
              ceilingBand: "CAPPED",
              liftPath: "gather-any-verified-evidence-to-lift"
            }
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
      "SELECT count(*)::text AS count FROM register.register_row WHERE register_version=$1",
      [ACCEPTANCE_REGISTER_VERSION]
    );
    const secondSeed = await seedAcceptanceRegister(database.pool);
    const countAfter = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM register.register_row WHERE register_version=$1",
      [ACCEPTANCE_REGISTER_VERSION]
    );
    expect(secondSeed).toEqual(firstSeed);
    expect(countAfter.rows[0]?.count).toBe(countBefore.rows[0]?.count);

    // DR-144: the seed persists the ruled scoringOperator row byte-faithfully
    // with the ruling's own provenance (idempotent across the double seed).
    const scoringRow = await database.pool.query<{ value: string; source_ref: string }>(
      `SELECT value_json #>> '{}' AS value, source_ref FROM register.register_row
       WHERE register_version=$1 AND row_key='scoringOperator'`,
      [ACCEPTANCE_REGISTER_VERSION]
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
      // T11: the code-derived three-state label the served answer carries.
      verdict_state: string | null;
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
    // T10: the served root is the STRONGER of the two authored roots, whichever
    // maker configured first. The expectation is derived from the run's own
    // propagated numbers — asserting node[0] here would be re-asserting the
    // retired configuration-order rule under a new name.
    const rootsByStrength = [positionNode, secondRootNode]
      .slice()
      .sort((left, right) => right.final_strength.value - left.final_strength.value
        || (left.node_id < right.node_id ? -1 : left.node_id > right.node_id ? 1 : 0));
    const servedRootNode = rootsByStrength[0]!;
    const unservedRootNode = rootsByStrength[1]!;
    const unservedMakerRecord = answerPayload.condition_mark_records.find(
      (record) => record.mark === "UNSERVED-MAKER-POSITION"
    );
    expect(unservedMakerRecord).toEqual(expect.objectContaining({
      subject_ref: servedRootNode.node_id,
      served_root_rule: "max-propagated-strength-lexicographic-tiebreak"
    }));
    expect(unservedMakerRecord?.reason).toContain("OpenAI");
    expect(unservedMakerRecord?.reason).toContain("Anthropic");
    expect(unservedMakerRecord?.reason).toContain(positionNode.node_id);
    expect(unservedMakerRecord?.reason).toContain(secondRootNode.node_id);
    // A-r2-2 survives the rule change: the raw rule token stays off the human
    // reason and lives only on the typed field. Both the retired and the live
    // token are checked, so neither can leak back in.
    expect(unservedMakerRecord?.reason).not.toContain("first-configured-provider");
    expect(unservedMakerRecord?.reason).not.toContain("max-propagated-strength");
    // The carried rule outcome must match served reality, not merely name a
    // policy: the served number belongs to the record's subject root.
    expect(unservedMakerRecord?.subject_ref).toBe(servedRootNode.node_id);
    expect(unservedRootNode.node_id).not.toBe(servedRootNode.node_id);

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

    // T10: the served number is the SERVED root's final strength — the maximum
    // over the authored roots, not the first-configured one's.
    const presentSlot = graphPayload.number_slots.find((slot) => slot.status === "PRESENT") as
      | { status: "PRESENT"; number: { value: number } }
      | undefined;
    expect(presentSlot?.number.value).toBe(servedRootNode.final_strength.value);
    expect(presentSlot!.number.value).toBeGreaterThanOrEqual(unservedRootNode.final_strength.value);

    // T11: the served answer carries a code-derived three-state label. Two
    // parseable panel voices and two roots make the basis complete, so the
    // incomplete-basis disclosure must be ABSENT here.
    expect(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]).toContain(answerPayload.verdict_state);
    expect(answerPayload.condition_marks).not.toContain("LABEL-BASIS-INCOMPLETE");

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

    /* ------------------------------------------------------------------------
     * The Global definition of done, read off THIS settled run.
     *
     * WHAT EACH ASSERTION BELOW IS WORTH — stated exactly, because the previous
     * header claimed more than the block delivers (review M-4).
     *
     *   Sub-clauses (1), (2), (3), (5) and (6) are checked against INDEPENDENT
     *   SQL: hand-written joins over `ledger.reduced_judgement`, `core.edge`,
     *   `ledger.node_strength_record` + `ledger.propagation_run`, and
     *   `serve.synthesis_round`, written here and not shared with the reader. A
     *   reader that agreed with itself would prove nothing; a reader that agrees
     *   with these is reading the run.
     *
     *   Sub-clauses (7) and (8) are PASSTHROUGH RESTATEMENTS, not SQL: they
     *   compare `facts.*` against the same parsed `answer` the reader was
     *   handed. What they can catch is the reader dropping, hardcoding or
     *   mis-wiring a field — which is what mutants D5 and D6 exercise — not
     *   whether serve derived the label and the band correctly. That is serve's
     *   own suite's job, and re-deriving it here would be a second
     *   implementation of a rule.
     *
     *   Six assertions are DELIBERATE FIXTURE LITERALS, each labelled at its
     *   site: the edge counts, the "no root differs" pair, and the
     *   non-self-graded pin. They record what THIS fixture does, so a change in
     *   it is seen; they are not claims about the clause.
     * ---------------------------------------------------------------------- */
    const answer = AnswerSchema.parse(owned.json());

    // MEASUREMENT (the brief's step 1): does the OWNER read carry the panel
    // record, or must the facts come from the ledger row? Pinned here so the
    // day it changes, the reader's source of record is re-decided on evidence.
    const disagreementOnOwnerRead = answer.nodes.map((node) => node.disagreement);
    expect(disagreementOnOwnerRead.every((value) => value !== null && typeof value === "object")).toBe(true);
    expect(disagreementOnOwnerRead[0]).toHaveProperty("panel");

    const sealedBoundRow = await database.pool.query<{ max_rounds: number }>(
      `SELECT (value_json->>'maxRounds')::int AS max_rounds FROM register.register_row
       WHERE register_version=$1 AND row_key='evaluatorLoopMaxRounds'`,
      [ACCEPTANCE_REGISTER_VERSION]
    );
    const sealedEvaluatorLoopMaxRounds = sealedBoundRow.rows[0]?.max_rounds;
    expect(sealedEvaluatorLoopMaxRounds, "the acceptance register seals the loop bound").toBeGreaterThan(0);

    const facts = await readDefinitionOfDoneFacts(database.pool, {
      runId,
      answer,
      sealedEvaluatorLoopMaxRounds: sealedEvaluatorLoopMaxRounds!
    });

    // (1) panel-reduced tau, non-self-graded — the ledger's panel record.
    const judgementRows = await database.pool.query<{
      node_id: string; depth: number; tau: number; disagreement: Record<string, unknown> | null;
    }>(
      `SELECT node.node_id::text AS node_id, node.depth::int AS depth, judgement.tau, judgement.disagreement
       FROM core.node AS node
       JOIN LATERAL (
         SELECT tau, disagreement FROM ledger.reduced_judgement
         WHERE node_id = node.node_id ORDER BY at_seq DESC LIMIT 1
       ) AS judgement ON true
       WHERE node.run_id=$1 ORDER BY node.created_at_seq`,
      [runId]
    );
    const panelOf = (row: { disagreement: Record<string, unknown> | null }): {
      voiceCount: number; nonAuthorVoiceCount: number;
    } => {
      const panel = row.disagreement?.["panel"] as
        { voiceCount: number; nonAuthorVoiceCount: number } | undefined;
      return panel === undefined ? { voiceCount: 1, nonAuthorVoiceCount: 0 } : panel;
    };
    expect(facts.panelNodes).toEqual(judgementRows.rows.map((row) => ({
      nodeId: row.node_id,
      tau: Number(row.tau),
      voiceCount: panelOf(row).voiceCount,
      nonAuthorVoiceCount: panelOf(row).nonAuthorVoiceCount,
      singleVoicePanel: panelOf(row).nonAuthorVoiceCount === 0
    })));
    expect(facts.everyNodeHasNonAuthorVoice).toBe(
      judgementRows.rows.every((row) => panelOf(row).nonAuthorVoiceCount >= 1)
    );
    expect(facts.singleVoicePanelNodeIds).toEqual(
      judgementRows.rows.filter((row) => panelOf(row).nonAuthorVoiceCount === 0)
        .map((row) => row.node_id).sort()
    );
    // This two-maker run is genuinely panel-judged: the whole clause would be
    // vacuous on a run whose every node were self-graded.
    expect(facts.everyNodeHasNonAuthorVoice).toBe(true);

    // (2) measured edges — core.edge magnitudes, under BOTH counting rules the
    // log now carries: every edge of the run, and FAIR-01's attack population
    // (`acceptance/fair-debate.ts:122`), so the two lines can be reconciled.
    const edgeCounts = await database.pool.query<{
      edges: string; measured: string; fair_attacks: string; fair_measured: string;
    }>(
      `SELECT count(*)::text AS edges,
              count(*) FILTER (WHERE magnitude_status='MEASURED')::text AS measured,
              count(*) FILTER (WHERE polarity='attack' AND target_kind='NODE')::text AS fair_attacks,
              count(*) FILTER (
                WHERE polarity='attack' AND target_kind='NODE' AND magnitude_status='MEASURED'
              )::text AS fair_measured
       FROM core.edge WHERE run_id=$1`,
      [runId]
    );
    expect(facts.edgeCount).toBe(Number(edgeCounts.rows[0]?.edges));
    expect(facts.edgePresentMagnitudeCount).toBe(Number(edgeCounts.rows[0]?.measured));
    expect(facts.fairDebateAttackEdgeCount).toBe(Number(edgeCounts.rows[0]?.fair_attacks));
    expect(facts.fairDebateAttackEdgePresentMagnitudeCount).toBe(Number(edgeCounts.rows[0]?.fair_measured));
    // FIXTURE LITERALS, pinned so a change in them is seen: every arrow in the
    // dry run is a placeholder, so NO edge carries a present magnitude, and the
    // FAIR-01 population is the four attack edges `assertFairDebate` counted
    // twenty lines above — the two rules agree on this run, as they must until
    // something mints an EDGE-targeted arrow. The reader REPORTS all of it and
    // returns; an UNKNOWN magnitude is a definition-of-done outcome for the
    // closing run's judge to weigh, never a shape violation it may refuse.
    expect(facts.edgeCount).toBe(8);
    expect(facts.edgePresentMagnitudeCount).toBe(0);
    expect(facts.fairDebateAttackEdgeCount).toBe(4);
    expect(facts.fairDebateAttackEdgePresentMagnitudeCount).toBe(0);

    // (3) a root's final strength apart from its tau — depth 0 against the
    // latest propagation run, the LATERAL the served projection uses.
    const strengthRows = await database.pool.query<{ node_id: string; strength: number | null }>(
      `SELECT node.node_id::text AS node_id, strength.strength
       FROM core.node AS node
       LEFT JOIN LATERAL (
         SELECT record.strength FROM ledger.node_strength_record AS record
         JOIN ledger.propagation_run AS propagation
           ON propagation.propagation_run_id = record.propagation_run_id
         WHERE record.node_id = node.node_id ORDER BY propagation.at_seq DESC LIMIT 1
       ) AS strength ON true
       WHERE node.run_id=$1 AND node.depth=0 ORDER BY node.created_at_seq`,
      [runId]
    );
    const tauByNodeId = new Map(judgementRows.rows.map((row) => [row.node_id, Number(row.tau)]));
    expect(facts.roots).toEqual(strengthRows.rows.map((row) => ({
      nodeId: row.node_id,
      tau: tauByNodeId.get(row.node_id),
      finalStrength: row.strength === null ? null : Number(row.strength),
      finalDiffersFromTau: row.strength !== null && Number(row.strength) !== tauByNodeId.get(row.node_id)
    })));
    expect(facts.aRootFinalDiffersFromTau).toBe(facts.roots.some((root) => root.finalDiffersFromTau));
    expect(facts.rootFinalDiffersWitnessNodeId).toBe(
      facts.roots.filter((root) => root.finalDiffersFromTau)
        .map((root) => root.nodeId).sort()[0] ?? null
    );
    // THIS FIXTURE'S OUTCOME, and the O3 boundary proven on real data: with no
    // measured magnitude on any arrow, propagation leaves both roots on their
    // own tau, so NO root differs. The reader returned these facts rather than
    // throwing — reaching this line at all is the proof.
    expect(facts.aRootFinalDiffersFromTau).toBe(false);
    expect(facts.rootFinalDiffersWitnessNodeId).toBeNull();

    // (5) the strongest surviving objection — attacks something AND still
    // carries a propagated number (apps/runner/src/index.ts:3925-3928).
    const survivorRows = await database.pool.query<{ node_id: string; strength: number }>(
      `SELECT DISTINCT ON (node.node_id) node.node_id::text AS node_id, strength.strength
       FROM core.node AS node
       JOIN core.edge AS attack ON attack.source_node_id = node.node_id AND attack.polarity='attack'
       JOIN LATERAL (
         SELECT record.strength FROM ledger.node_strength_record AS record
         JOIN ledger.propagation_run AS propagation
           ON propagation.propagation_run_id = record.propagation_run_id
         WHERE record.node_id = node.node_id ORDER BY propagation.at_seq DESC LIMIT 1
       ) AS strength ON true
       WHERE node.run_id=$1 ORDER BY node.node_id`,
      [runId]
    );
    const strongestBySql = survivorRows.rows
      .map((row) => ({ nodeId: row.node_id, finalStrength: Number(row.strength) }))
      .sort((left, right) => right.finalStrength - left.finalStrength
        || left.nodeId.localeCompare(right.nodeId))[0] ?? null;
    expect(facts.strongestSurvivingObjection).toEqual(strongestBySql);
    // The dry run DOES carry a surviving objection: an attacker that still has
    // a propagated number. The independent SQL above is the same definition.
    expect(facts.strongestSurvivingObjection).not.toBeNull();

    // (5/6) the evaluator loop record, and its bound read from this database.
    const roundRows = await database.pool.query<{
      round: number; synthesizer_stage: "INITIAL" | "RETRY"; evaluator_satisfied: boolean;
    }>(
      `SELECT round, synthesizer_stage, evaluator_satisfied FROM serve.synthesis_round
       WHERE answer_id=$1 AND answer_version=$2 ORDER BY round`,
      [answer.answer_id, answer.answer_version]
    );
    expect(facts.loopRounds).toEqual(roundRows.rows.map((row) => ({
      round: row.round,
      synthesizerStage: row.synthesizer_stage,
      evaluatorSatisfied: row.evaluator_satisfied
    })));
    expect(facts.loopRoundCount).toBe(roundRows.rowCount);
    expect(facts.loopRoundCount).toBeGreaterThan(0);
    expect(facts.loopRoundCount).toBeLessThanOrEqual(sealedEvaluatorLoopMaxRounds!);
    expect(facts.sealedEvaluatorLoopMaxRounds).toBe(sealedEvaluatorLoopMaxRounds);
    expect(facts.finalRoundSatisfied).toBe(roundRows.rows.at(-1)?.evaluator_satisfied ?? false);
    expect(facts.objectionStandingMarkPresent).toBe(
      answer.condition_marks.includes("SYNTHESIS-OBJECTION-STANDING")
    );

    // (7) the code-derived three-state label, off the parsed answer.
    expect(facts.verdictState).toBe(answer.verdict_state);
    expect(facts.verdictUnavailableReasonRef).toBe(answer.verdict_unavailable?.reason_ref ?? null);
    expect(facts.terminal).toBe(answer.terminal);
    expect(facts.serveState).toBe(answer.serve_state);

    // (8) the band counted over the CITED nodes, with its ceiling's row key.
    expect(facts.confidenceBand).toBe(answer.confidence_band);
    expect(facts.bandBasis).toEqual(answer.band_ceiling?.basis ?? null);
    expect(facts.bandCeilingRegisterRowKey).toBe(answer.band_ceiling?.register_row_key ?? null);

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
