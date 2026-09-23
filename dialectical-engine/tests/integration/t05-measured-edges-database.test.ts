import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { JudgementRepository, Judge } from "@debateai/judgement";
import { recordReviewWithMeasurements } from "@debateai/runner";
import { measureEdgesAlone, recordNodeReviewAlone } from "../support/unsafeReviewWrites.js";
import { LedgerRepository } from "@debateai/ledger";
import { evaluate } from "@debateai/propagation";
import type { ProviderGateway } from "@debateai/providers";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * T5 (goal 144-159; rulings S3-1, S4-1) — the graph goes numerically live.
 *
 * The walking skeleton wrote every arrow UNKNOWN, so `σ(τ, agg([]), agg([]))`
 * returned τ unchanged and the tree could move no number. Here the cross-maker
 * reviewer measures the edges sourced by the node it is already reviewing, the
 * runner writes those magnitudes through the graph's measured-update path, and
 * propagation over the post-run graph lands somewhere other than τ.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 240_000);

afterAll(async () => {
  await database?.stop();
});

async function createRun(label: string): Promise<string> {
  const result = await database.pool.query<{ run_id: string }>(`
    INSERT INTO core.run (
      question_line, asker_id, session_id, caller_scope, as_of,
      asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
      composition_budget_tier, depth_params, agent_count, discovered_panel,
      stranger_sample_rate, envelope_basis, register_version,
      battery_version, created_at_seq
    ) VALUES (
      $1, $2, $3, 'ASKER', '2026-08-08T00:00:00.000Z',
      'casual', 'casual', 'ASKER', $4,
      'low', '{}', 1,
      '[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',
      1, '{}', 1, 's02', ledger.allocate_sequence()
    ) RETURNING run_id
  `, [label, `asker:${label}`, `session:${label}`, `asker-declaration:${label}`]);
  return result.rows[0]!.run_id;
}

/**
 * A gateway that records exactly what the production gateway records — one raw
 * artifact and one MODEL_CALL ledger entry per call — over a scripted response.
 * No provider is contacted; the ledger rows it writes are real, which is what
 * the single-call assertion reads.
 */
function ledgerBackedGateway(scripted: (callSiteKey: string) => string): ProviderGateway {
  const ledger = new LedgerRepository(database.pool);
  return {
    async call(request: { runId: string | null; subjectItemId: string; callSiteKey: string; contractHash: string; providerRef: string }) {
      const attemptId = randomUUID();
      const artifactId = randomUUID();
      const rawText = scripted(request.callSiteKey);
      const startedAt = new Date();
      await ledger.appendRawArtifact({
        artifactId,
        attemptId,
        runId: request.runId,
        providerRef: request.providerRef,
        provider: "test-layer",
        model: "model-b",
        maker: "house-b",
        modelVersion: "model-b",
        rawText,
        metadata: {},
        parseStatus: "PARSED",
        inputHash: "a".repeat(64),
        contractHash: request.contractHash,
        contentHash: "c".repeat(64)
      });
      const entry = await ledger.append({
        runId: request.runId,
        attemptId,
        actionKind: "MODEL_CALL",
        callSiteKey: request.callSiteKey,
        subjectItemId: request.subjectItemId,
        stanceAtAction: "NEUTRAL",
        outcome: "OK",
        actorRef: "test-layer:reviewer",
        inputHash: "a".repeat(64),
        contractHash: request.contractHash,
        rawArtifactRef: artifactId,
        startedAt,
        finishedAt: new Date()
      });
      return {
        rawArtifactRef: artifactId,
        ledgerEntryRef: entry.ledgerEntryId,
        content: rawText,
        provider: "test-layer",
        model: "model-b",
        maker: "house-b",
        modelVersion: "model-b"
      };
    }
  } as unknown as ProviderGateway;
}

interface ConstructedRun {
  readonly runId: string;
  readonly rootId: string;
  readonly rootTau: number;
  readonly reviewed: readonly { readonly nodeId: string; readonly edgeId: string; readonly tau: number; readonly authorRef: string | null }[];
}

/**
 * The runner's own shape: a root and three children, every edge minted UNKNOWN
 * exactly as `apps/runner/src/index.ts` mints them, and a τ recorded for each
 * node so the snapshot carries a base strength.
 */
async function constructRun(label: string, taus: {
  readonly root: number; readonly attacker: number; readonly supporter: number; readonly unassessable: number;
}, options: { readonly bindAuthorArtifacts?: boolean } = {}): Promise<ConstructedRun> {
  const runId = await createRun(label);
  const graph = new GraphRepository(database.pool);
  const ledger = new LedgerRepository(database.pool);

  const recordTau = async (nodeId: string, tau: number): Promise<void> => {
    const artifactId = randomUUID();
    await ledger.appendRawArtifact({
      artifactId, attemptId: randomUUID(), runId, providerRef: "provider:raw",
      provider: "test-layer", model: "model-a", maker: "house-a", modelVersion: "model-a",
      rawText: `{"tau":${tau}}`, metadata: {}, parseStatus: "PARSED",
      inputHash: "a".repeat(64), contractHash: "b".repeat(64), contentHash: "c".repeat(64)
    });
    await database.pool.query(`
      INSERT INTO ledger.reduced_judgement (
        run_id, node_id, raw_artifact_ref, tau, number_kind, source_ref,
        producer, replay_handle, way_of_knowing, at_seq
      ) VALUES ($1,$2,$3::uuid,$4,'confidence',$5,'house-a',$6,'REASONING',ledger.allocate_sequence())
    `, [runId, nodeId, artifactId, tau, `artifact:${artifactId}`, `judgement:${randomUUID()}`]);
  };

  const authorRefs = new Map<number, string>();
  if (options.bindAuthorArtifacts === true) {
    for (const ordinal of [1, 2, 3]) authorRefs.set(ordinal, await artifact(runId, "house-a"));
  }
  const built = await graph.withGraphWrite(runId, async (writer) => {
    const base = {
      runId, claimType: "unknown" as const, generationStatus: "complete" as const,
      pathStatus: "active" as const, explorationDecision: "continue" as const,
      wayOfKnowing: "REASONING" as const, locator: null, valueLaden: false
    };
    const rootId = await writer.addNode({
      ...base, statementText: "The proposal should stand.",
      parentNodeId: null, childKind: null, siblingOrdinal: 0, provenanceRef: null
    });
    const child = async (statement: string, childKind: "support" | "defeater", ordinal: number): Promise<string> =>
      writer.addNode({
        ...base, statementText: statement, parentNodeId: rootId,
        childKind, siblingOrdinal: ordinal,
        // core.node is append-only, so the review lineage the trigger checks has
        // to be bound at creation. Opt-in: a non-null provenance_ref gives the
        // arrow a clusterKey, which the propagation fixtures must not acquire.
        provenanceRef: options.bindAuthorArtifacts === true ? authorRefs.get(ordinal)! : null
      });
    const attackerId = await child("The proposal rests on an unmeasured premise.", "defeater", 1);
    const supporterId = await child("The proposal is carried by its record.", "support", 2);
    const unassessableId = await child("The proposal touches an unresolved question.", "support", 3);

    // Exactly the runner's mint (apps/runner/src/index.ts): UNKNOWN, no strength.
    const mint = async (sourceNodeId: string, polarity: "support" | "attack"): Promise<string> =>
      writer.addEdge({
        runId, sourceNodeId, targetKind: "NODE", targetNodeId: rootId,
        targetEdgeId: null, targetEdgePolarity: null, polarity,
        kind: polarity === "attack" ? "rebutting" : null,
        strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "REVIEWER",
        provenanceRef: `provenance:${label}:${sourceNodeId}`
      });
    const attackEdgeId = await mint(attackerId, "attack");
    const supportEdgeId = await mint(supporterId, "support");
    const unassessableEdgeId = await mint(unassessableId, "support");

    return Object.freeze({
      runId, rootId, rootTau: taus.root,
      reviewed: Object.freeze([
        Object.freeze({ nodeId: attackerId, edgeId: attackEdgeId, tau: taus.attacker, authorRef: authorRefs.get(1) ?? null }),
        Object.freeze({ nodeId: supporterId, edgeId: supportEdgeId, tau: taus.supporter, authorRef: authorRefs.get(2) ?? null }),
        Object.freeze({ nodeId: unassessableId, edgeId: unassessableEdgeId, tau: taus.unassessable, authorRef: authorRefs.get(3) ?? null })
      ])
    });
  });

  await recordTau(built.rootId, taus.root);
  for (const node of built.reviewed) await recordTau(node.nodeId, node.tau);
  return built;
}

/** A raw artifact attributable to one maker, for the review lineage trigger. */
async function artifact(runId: string, maker: string): Promise<string> {
  const artifactId = randomUUID();
  await new LedgerRepository(database.pool).appendRawArtifact({
    artifactId, attemptId: randomUUID(), runId, providerRef: `provider:${maker}`,
    provider: "test-layer", model: `model:${maker}`, maker, modelVersion: `model:${maker}`,
    rawText: "{}", metadata: {}, parseStatus: "PARSED",
    inputHash: "a".repeat(64), contractHash: "b".repeat(64), contentHash: "c".repeat(64)
  });
  return artifactId;
}

/** Bearings by review order: attacker 0.5, supporter 0.25, unassessable cannot-assess. */
const SCRIPTED_BEARINGS: readonly (number | null)[] = Object.freeze([0.5, 0.25, null]);

/**
 * Reviews each authored node through the real `Judge.review`, then writes back
 * whatever that ONE call measured. This is the runner's loop, not a shortcut:
 * nothing else calls the provider, and nothing invents a magnitude.
 */
async function reviewAndMeasure(run: ConstructedRun): Promise<void> {
  const graph = new GraphRepository(database.pool);
  for (const [index, node] of run.reviewed.entries()) {
    const bearing = SCRIPTED_BEARINGS[index]!;
    const judge = new Judge(ledgerBackedGateway(() => JSON.stringify({
      outcome: bearing === null ? "cannot-assess" : "agree",
      reasons: ["Scripted review for the constructed run."],
      edge_bearings: [bearing]
    })));
    const reviewed = await judge.review({
      runId: run.runId,
      subjectItemId: `work:${run.runId}`,
      callSiteKey: `JUDGE:review:${node.nodeId}`,
      questionLine: "Should the proposal stand?",
      statement: "A position authored by another maker.",
      authorMaker: "house-a",
      providerRef: "provider:b",
      contractHash: "b".repeat(64),
      bound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 },
      edges: [{ edgeId: node.edgeId, targetStatement: "The proposal should stand.", polarity: "attack" }]
    });
    await measureEdgesAlone(database.pool, run.runId, reviewed.edgeMeasurements);
  }
}

describe("T5 · the reviewer's magnitudes reach the post-run graph (S3-1)", () => {
  it("stamps the measured edges REVIEWER and leaves a cannot-assess edge UNKNOWN", async () => {
    const run = await constructRun("t05-magnitudes", { root: 0.5, attacker: 0.5, supporter: 0.5, unassessable: 0.5 });
    await reviewAndMeasure(run);

    const rows = await database.pool.query<{
      edge_id: string; strength: number | null; magnitude_status: string; strength_source: string;
    }>(
      `SELECT edge_id, strength, magnitude_status, strength_source FROM core.edge
       WHERE run_id=$1 ORDER BY created_at_seq`,
      [run.runId]
    );
    expect(rows.rows.map((row) => ({
      strength: row.strength === null ? null : Number(row.strength),
      magnitudeStatus: row.magnitude_status,
      strengthSource: row.strength_source
    }))).toEqual([
      { strength: 0.5, magnitudeStatus: "MEASURED", strengthSource: "REVIEWER" },
      { strength: 0.25, magnitudeStatus: "MEASURED", strengthSource: "REVIEWER" },
      { strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "REVIEWER" }
    ]);
  });

  it("FINAL ≠ τ — propagation over the measured graph leaves the root's own tau", async () => {
    const run = await constructRun("t05-final-not-tau", { root: 0.5, attacker: 0.5, supporter: 0.5, unassessable: 0.5 });
    const graph = new GraphRepository(database.pool);

    // The walking skeleton, stated as a fact rather than assumed: with every
    // arrow UNKNOWN the root cannot move off its own tau.
    // `materialiseSnapshot` carries the graph; the operator resolution is
    // supplied by the register at the deployment level, and `accumulate` is
    // the single pinned member since T8/S5-2.
    const rootStrength = (snapshot: Awaited<ReturnType<GraphRepository["materialiseSnapshot"]>>): number =>
      evaluate({
        ...snapshot,
        operatorResolutions: [{ parentNodeId: run.rootId, operator: "accumulate", suppliedBy: "deployment" }]
      }).strengths.find((record) => record.nodeId === run.rootId)!.strength;

    const beforeSnapshot = await graph.materialiseSnapshot(run.runId);
    expect(beforeSnapshot.arrows.every((arrow) => arrow.magnitudeStatus === "UNKNOWN")).toBe(true);
    expect(rootStrength(beforeSnapshot)).toBe(run.rootTau);

    await reviewAndMeasure(run);

    const afterSnapshot = await graph.materialiseSnapshot(run.runId);
    expect(afterSnapshot.arrows.filter((arrow) => arrow.magnitudeStatus === "MEASURED")).toHaveLength(2);
    const final = rootStrength(afterSnapshot);

    // attack  = 0.5 (bearing) × 0.5 (attacker tau)  = 0.25
    // support = 0.25 (bearing) × 0.5 (supporter tau) = 0.125
    // the cannot-assess edge stays UNKNOWN and contributes nothing
    // σ(0.5, 0.25, 0.125) = 0.5 − 0.5 × (0.25 − 0.125) = 0.4375
    expect(final).toBeCloseTo(0.4375, 12);
    expect(final).not.toBe(run.rootTau);
  });

  it("LEDGER — one model call per reviewed node carries the review AND its measurements", async () => {
    const run = await constructRun("t05-ledger", { root: 0.5, attacker: 0.5, supporter: 0.5, unassessable: 0.5 });
    await reviewAndMeasure(run);

    const calls = await database.pool.query<{ call_site_key: string; attempts: string }>(
      `SELECT call_site_key, count(*)::text AS attempts FROM ledger.ledger_entry
       WHERE run_id=$1 AND action_kind='MODEL_CALL'
       GROUP BY call_site_key ORDER BY call_site_key`,
      [run.runId]
    );
    // Exactly one call per reviewed node, and nothing else spent a model call:
    // no measurement-only call site exists (S3-1, zero extra calls).
    expect(calls.rows.map((row) => Number(row.attempts))).toEqual([1, 1, 1]);
    expect(new Set(calls.rows.map((row) => row.call_site_key))).toEqual(
      new Set(run.reviewed.map((node) => `JUDGE:review:${node.nodeId}`))
    );
  });
});

/**
 * T5 r3 / codex r2 B1 — the review and the bearings it returned are ONE fact.
 *
 * `ledger.node_review` is append-only, carries `UNIQUE (node_id)`, and
 * `readUnreviewedNodes` filters on `review.node_id IS NULL`. So a review that
 * commits on its own is IRREVERSIBLE and REMOVES the node from all future work:
 * if the magnitude write then fails, the edge stays UNKNOWN and nothing —
 * neither a retry nor catch-up — can ever repair it. The bearing the model
 * already produced and was already paid for is lost permanently.
 *
 * The failure is injected without mocks, using the ratchet the schema already
 * enforces: measure the edge first, then compose a review whose bearing targets
 * that now-MEASURED edge. The second write refuses, exactly as codex's scenario
 * describes ("E no longer satisfies magnitude_status='UNKNOWN'").
 */
describe("DEMO (codex r2 B1) — the OLD two-transaction shape strands a half-write", () => {
  it("records the review, loses the bearing, and removes the node from all future work", async () => {
    const run = await constructRun(
      "t05-old-shape-strands", { root: 0.5, attacker: 0.5, supporter: 0.5, unassessable: 0.5 },
      { bindAuthorArtifacts: true }
    );
    const node = run.reviewed[0]!;
    const judgements = new JudgementRepository(database.pool);
    const graph = new GraphRepository(database.pool);
    const reviewerRef = await artifact(run.runId, "house-b");

    // Burn the edge's one lawful transition so the SECOND write will refuse.
    await measureEdgesAlone(database.pool, run.runId, [{ edgeId: node.edgeId, bearing: 0.25 }]);

    // THE OLD SHAPE, exactly as r2 shipped it: two awaited writes, two transactions.
    await recordNodeReviewAlone(database.pool, {
      runId: run.runId, nodeId: node.nodeId,
      authorRawArtifactRef: node.authorRef!, reviewRawArtifactRef: reviewerRef,
      outcome: "agree", reasons: ["The bearing this review returned is about to be lost."]
    });
    let second: unknown = null;
    try {
      await measureEdgesAlone(database.pool, run.runId, [{ edgeId: node.edgeId, bearing: 0.75 }]);
    } catch (error) { second = error; }

    const reviews = await database.pool.query("SELECT 1 FROM ledger.node_review WHERE node_id=$1", [node.nodeId]);
    const edge = await database.pool.query<{ strength: number; magnitude_status: string }>(
      "SELECT strength, magnitude_status FROM core.edge WHERE edge_id=$1", [node.edgeId]);
    const unreviewed = await judgements.readUnreviewedNodes(run.runId);
    console.info("[B1 DEMO] second write threw:", (second as { code?: string } | null)?.code);
    console.info("[B1 DEMO] review rows for node:", reviews.rowCount);
    console.info("[B1 DEMO] edge after:", JSON.stringify(edge.rows[0]));
    console.info("[B1 DEMO] node still selectable by catch-up:",
      unreviewed.some((candidate) => candidate.nodeId === node.nodeId));

    // The stranded half-state, asserted so the demo cannot pass by accident.
    expect(reviews.rowCount).toBe(1);                                   // review committed
    expect(edge.rows[0]!.magnitude_status).toBe("MEASURED");
    expect(Number(edge.rows[0]!.strength)).toBe(0.25);                  // the 0.75 bearing is GONE
    expect(unreviewed.some((c) => c.nodeId === node.nodeId)).toBe(false); // catch-up is blind
    await expect(recordNodeReviewAlone(database.pool, {
      runId: run.runId, nodeId: node.nodeId,
      authorRawArtifactRef: node.authorRef!, reviewRawArtifactRef: reviewerRef,
      outcome: "agree", reasons: ["A second review cannot exist."]
    })).rejects.toThrow();                                              // UNIQUE(node_id): unrepairable
  });

  it("is why no production site may write a review on its own", async () => {
    // ADVISORY ONLY. This reads the runner source and is deliberately NOT the
    // law: codex r3 showed a regex cannot be one — `recordNodeReview ({...})`
    // with a space is valid syntax that `/\brecordNodeReview\(/` does not
    // match, and a `.bind()` alias or computed access evades any token rule.
    //
    // THE LAW IS THE COMPILER: `tests/architecture/t05-half-write-seal.test.ts`
    // type-checks the reviewer's own evasions and asserts they DO NOT COMPILE,
    // because neither unsafe surface exists any more. This line survives only
    // as a fast, human-readable signpost to that test.
    const runner = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    expect(runner).toMatch(/recordReviewWithMeasurements\(/);
  });
});

describe("T5 · a review and its bearings commit atomically or not at all", () => {
  const reviewedRun = async (label: string): Promise<{
    readonly run: ConstructedRun; readonly authorRef: string; readonly reviewerRef: string;
  }> => {
    const run = await constructRun(
      label, { root: 0.5, attacker: 0.5, supporter: 0.5, unassessable: 0.5 }, { bindAuthorArtifacts: true }
    );
    return { run, authorRef: run.reviewed[0]!.authorRef!, reviewerRef: await artifact(run.runId, "house-b") };
  };

  it("leaves NEITHER fact behind when the magnitude write refuses", async () => {
    const { run, authorRef, reviewerRef } = await reviewedRun("t05-atomic-refusal");
    const node = run.reviewed[0]!;
    const judgements = new JudgementRepository(database.pool);
    const graph = new GraphRepository(database.pool);

    // Burn the edge's one lawful transition, so the measurement below refuses.
    await measureEdgesAlone(database.pool, run.runId, [{ edgeId: node.edgeId, bearing: 0.25 }]);

    await expect(recordReviewWithMeasurements(database.pool, {
      runId: run.runId,
      nodeId: node.nodeId,
      authorRawArtifactRef: authorRef,
      reviewRawArtifactRef: reviewerRef,
      outcome: "agree",
      reasons: ["Scripted review whose magnitude cannot land."],
      measurements: [{ edgeId: node.edgeId, bearing: 0.75 }]
    })).rejects.toThrowError(expect.objectContaining({ code: "EDGE_MEASUREMENT_REFUSED" }));

    // The review must NOT have survived on its own: an orphan review row is
    // unrepairable, because the table refuses UPDATE, DELETE and a second INSERT.
    const reviews = await database.pool.query(
      "SELECT 1 FROM ledger.node_review WHERE node_id=$1", [node.nodeId]
    );
    expect(reviews.rowCount).toBe(0);

    // And the node is still selectable, so a retry or catch-up can repair it.
    const unreviewed = await judgements.readUnreviewedNodes(run.runId);
    expect(unreviewed.map((candidate) => candidate.nodeId)).toContain(node.nodeId);

    // The edge keeps the magnitude it lawfully had; nothing was half-written.
    const edge = await database.pool.query<{ strength: number; magnitude_status: string }>(
      "SELECT strength, magnitude_status FROM core.edge WHERE edge_id=$1", [node.edgeId]
    );
    expect(edge.rows[0]).toEqual({ strength: 0.25, magnitude_status: "MEASURED" });
  });

  it("lands BOTH facts on success, and the repaired retry then succeeds", async () => {
    const { run, authorRef, reviewerRef } = await reviewedRun("t05-atomic-success");
    const node = run.reviewed[0]!;
    const judgements = new JudgementRepository(database.pool);

    await expect(recordReviewWithMeasurements(database.pool, {
      runId: run.runId,
      nodeId: node.nodeId,
      authorRawArtifactRef: authorRef,
      reviewRawArtifactRef: reviewerRef,
      outcome: "agree",
      reasons: ["Both facts land together."],
      measurements: [{ edgeId: node.edgeId, bearing: 0.75 }]
    })).resolves.toBeDefined();

    const edge = await database.pool.query<{ strength: number; magnitude_status: string; strength_source: string }>(
      "SELECT strength, magnitude_status, strength_source FROM core.edge WHERE edge_id=$1", [node.edgeId]
    );
    expect(edge.rows[0]).toEqual({ strength: 0.75, magnitude_status: "MEASURED", strength_source: "REVIEWER" });
    const reviews = await database.pool.query(
      "SELECT 1 FROM ledger.node_review WHERE node_id=$1", [node.nodeId]
    );
    expect(reviews.rowCount).toBe(1);
    const unreviewed = await judgements.readUnreviewedNodes(run.runId);
    expect(unreviewed.map((candidate) => candidate.nodeId)).not.toContain(node.nodeId);
  });

  it("a cannot-assess review lands alone, leaving its edge honestly UNKNOWN", async () => {
    const { run, authorRef, reviewerRef } = await reviewedRun("t05-atomic-cannot-assess");
    const node = run.reviewed[0]!;

    await recordReviewWithMeasurements(database.pool, {
      runId: run.runId,
      nodeId: node.nodeId,
      authorRawArtifactRef: authorRef,
      reviewRawArtifactRef: reviewerRef,
      outcome: "cannot-assess",
      reasons: ["Looked, and could not say."],
      measurements: [{ edgeId: node.edgeId, bearing: null }]
    });

    const edge = await database.pool.query<{ magnitude_status: string }>(
      "SELECT magnitude_status FROM core.edge WHERE edge_id=$1", [node.edgeId]
    );
    expect(edge.rows[0]!.magnitude_status).toBe("UNKNOWN");
    const reviews = await database.pool.query(
      "SELECT 1 FROM ledger.node_review WHERE node_id=$1", [node.nodeId]
    );
    expect(reviews.rowCount).toBe(1);
  });
});

describe("T5 · the measured-update path refuses loudly rather than losing a measurement", () => {
  it("refuses a second measurement instead of silently updating nothing", async () => {
    const run = await constructRun("t05-loud-refusal", { root: 0.5, attacker: 0.5, supporter: 0.5, unassessable: 0.5 });
    const measure = (): Promise<readonly string[]> => measureEdgesAlone(
      database.pool, run.runId, [{ edgeId: run.reviewed[0]!.edgeId, bearing: 0.5 }]
    );

    await expect(measure()).resolves.toEqual([run.reviewed[0]!.edgeId]);
    // A no-op UPDATE would leave the caller believing a magnitude landed.
    await expect(measure()).rejects.toThrowError(
      expect.objectContaining({ code: "EDGE_MEASUREMENT_REFUSED" })
    );
  });

  it("refuses a bearing outside the unit interval before it reaches the column check", async () => {
    const run = await constructRun("t05-bearing-range", { root: 0.5, attacker: 0.5, supporter: 0.5, unassessable: 0.5 });
    await expect(measureEdgesAlone(
      database.pool, run.runId, [{ edgeId: run.reviewed[0]!.edgeId, bearing: 1.5 }]
    )).rejects.toThrowError(expect.objectContaining({ code: "EDGE_BEARING_OUT_OF_RANGE" }));
  });
});

describe("T5 · schema — the magnitude update is the ONLY lawful edge mutation", () => {
  const measured = async (label: string): Promise<{ runId: string; edgeId: string }> => {
    const run = await constructRun(label, { root: 0.5, attacker: 0.5, supporter: 0.5, unassessable: 0.5 });
    await reviewAndMeasure(run);
    return { runId: run.runId, edgeId: run.reviewed[0]!.edgeId };
  };

  it("refuses a second measurement of an already measured edge", async () => {
    const { edgeId } = await measured("t05-ratchet");
    await expect(database.pool.query(
      "UPDATE core.edge SET strength=0.9 WHERE edge_id=$1", [edgeId]
    )).rejects.toThrow();
  });

  it("refuses an update that changes anything other than the magnitude triple", async () => {
    const run = await constructRun("t05-immutable-columns", { root: 0.5, attacker: 0.5, supporter: 0.5, unassessable: 0.5 });
    const edgeId = run.reviewed[0]!.edgeId;
    await expect(database.pool.query(
      `UPDATE core.edge SET strength=0.5, magnitude_status='MEASURED', strength_source='REVIEWER',
              provenance_ref='provenance:rewritten' WHERE edge_id=$1`,
      [edgeId]
    )).rejects.toThrow();
  });

  it("refuses an update that leaves the edge unmeasured", async () => {
    const run = await constructRun("t05-no-op-update", { root: 0.5, attacker: 0.5, supporter: 0.5, unassessable: 0.5 });
    await expect(database.pool.query(
      "UPDATE core.edge SET strength_source='CLUSTER_COLLAPSE' WHERE edge_id=$1",
      [run.reviewed[0]!.edgeId]
    )).rejects.toThrow();
  });

  it("still refuses a DELETE", async () => {
    const run = await constructRun("t05-delete", { root: 0.5, attacker: 0.5, supporter: 0.5, unassessable: 0.5 });
    await expect(database.pool.query(
      "DELETE FROM core.edge WHERE edge_id=$1", [run.reviewed[0]!.edgeId]
    )).rejects.toThrow();
  });

  it("retires the evidence-verifier stamp from the edge vocabulary", async () => {
    const run = await constructRun("t05-vocabulary", { root: 0.5, attacker: 0.5, supporter: 0.5, unassessable: 0.5 });
    await expect(database.pool.query(
      `INSERT INTO core.edge (
        run_id, source_node_id, target_kind, target_node_id, polarity, kind,
        strength, magnitude_status, strength_source, provenance_ref, created_at_seq
      ) SELECT run_id, source_node_id, 'NODE', target_node_id, polarity, kind,
               NULL, 'UNKNOWN', 'EVIDENCE_VERIFIER', 'provenance:legacy', ledger.allocate_sequence()
        FROM core.edge WHERE edge_id=$1`,
      [run.reviewed[0]!.edgeId]
    )).rejects.toThrow();
  });
});
