import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdir } from "node:fs/promises";
import { GraphRepository } from "@debateai/graph";
import { migrate } from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";
import { deriveTransmissionReductions, evaluate } from "@debateai/propagation";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

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

async function rawNode(input: {
  runId: string;
  claimText: string | null;
  parentNodeId?: string;
  childKind?: "support" | "attack" | "defeater";
  siblingOrdinal?: number;
}): Promise<string> {
  const parent = input.parentNodeId === undefined
    ? null
    : await database.pool.query<{ depth: number; materialized_path: string }>(
      "SELECT depth, materialized_path FROM core.node WHERE run_id=$1 AND node_id=$2",
      [input.runId, input.parentNodeId]
    );
  const siblingOrdinal = input.siblingOrdinal ?? 0;
  const depth = parent === null ? 0 : Number(parent.rows[0]!.depth) + 1;
  const path = parent === null ? "0" : `${parent.rows[0]!.materialized_path}/${siblingOrdinal}`;
  const result = await database.pool.query<{ node_id: string }>(`
    INSERT INTO core.node (
      run_id, claim_text, claim_type, parent_node_id, child_kind, depth, sibling_ordinal,
      materialized_path, generation_status, path_status, exploration_decision,
      way_of_knowing, provenance_ref, locator, value_laden, created_at_seq
    ) VALUES ($1,$2,'unknown',$3,$4,$5,$6,$7,'complete','active','continue','REASONING',NULL,NULL,false,ledger.allocate_sequence())
    RETURNING node_id
  `, [input.runId, input.claimText, input.parentNodeId ?? null, input.childKind ?? null, depth, siblingOrdinal, path]);
  return result.rows[0]!.node_id;
}

async function rawEdge(input: {
  runId: string;
  sourceNodeId: string;
  targetKind: "NODE" | "EDGE";
  targetNodeId?: string;
  targetEdgeId?: string;
  targetEdgePolarity?: "support" | "attack";
  polarity: "support" | "attack";
  kind: null | "rebutting" | "undercutting";
  strength: number | null;
  magnitudeStatus: "MEASURED" | "UNKNOWN";
  strengthSource: "EVIDENCE_VERIFIER" | "CLUSTER_COLLAPSE" | "UNDERCUT_TRANSMISSION";
}): Promise<string> {
  const result = await database.pool.query<{ edge_id: string }>(`
    INSERT INTO core.edge (
      run_id, source_node_id, target_kind, target_node_id, target_edge_id,
      target_edge_polarity, polarity, kind, strength, magnitude_status,
      strength_source, provenance_ref, created_at_seq
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'fixture:S02',ledger.allocate_sequence())
    RETURNING edge_id
  `, [
    input.runId, input.sourceNodeId, input.targetKind, input.targetNodeId ?? null,
    input.targetEdgeId ?? null, input.targetEdgePolarity ?? null, input.polarity,
    input.kind, input.strength, input.magnitudeStatus, input.strengthSource
  ]);
  return result.rows[0]!.edge_id;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});

afterAll(async () => {
  await database?.stop();
});

describe("S02 migrated graph invariants", () => {
  it("S01 finding 5 — migrate is idempotent through an applied-migrations ledger", async () => {
    await expect(migrate(database.pool)).resolves.toBeUndefined();
    const expectedMigrationLedger = (await readdir(new URL("../../migrations/", import.meta.url)))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();
    const applied = await database.pool.query<{ name: string }>(
      "SELECT name FROM public.debateai_schema_migration ORDER BY name"
    );
    expect(applied.rows.map((row) => row.name)).toEqual(expectedMigrationLedger);
  });

  it.each([null, "", "   "])("FX-DB-03a rejects non-claims (%j) through raw SQL", async (claimText) => {
    const runId = await createRun(`blank-${String(claimText)}`);
    await expect(rawNode({ runId, claimText })).rejects.toThrow();
  });

  it("FX-DB-03b accepts a non-blank claim and carries all three lifecycles plus the materialized path", async () => {
    const runId = await createRun("node-shape");
    const rootId = await rawNode({ runId, claimText: "Root claim" });
    const childId = await rawNode({ runId, claimText: "Child claim", parentNodeId: rootId, childKind: "support", siblingOrdinal: 1 });
    const row = await database.pool.query(
      "SELECT generation_status, path_status, exploration_decision, depth, materialized_path FROM core.node WHERE node_id=$1",
      [childId]
    );
    expect(row.rows[0]).toEqual({ generation_status: "complete", path_status: "active", exploration_decision: "continue", depth: 1, materialized_path: "0/1" });
  });

  it("FX-DB-04a/04b accepts an undercut of support and rejects an undercut of attack", async () => {
    const runId = await createRun("undercut-target");
    const source = await rawNode({ runId, claimText: "Source" });
    const target = await rawNode({ runId, claimText: "Target" });
    const supportId = await rawEdge({ runId, sourceNodeId: source, targetKind: "NODE", targetNodeId: target, polarity: "support", kind: null, strength: 0.7, magnitudeStatus: "MEASURED", strengthSource: "EVIDENCE_VERIFIER" });
    const attackId = await rawEdge({ runId, sourceNodeId: source, targetKind: "NODE", targetNodeId: target, polarity: "attack", kind: "rebutting", strength: 0.3, magnitudeStatus: "MEASURED", strengthSource: "EVIDENCE_VERIFIER" });
    await expect(rawEdge({ runId, sourceNodeId: target, targetKind: "EDGE", targetEdgeId: supportId, targetEdgePolarity: "support", polarity: "attack", kind: "undercutting", strength: 0.2, magnitudeStatus: "MEASURED", strengthSource: "UNDERCUT_TRANSMISSION" })).resolves.toMatch(/[0-9a-f-]{36}/);
    await expect(rawEdge({ runId, sourceNodeId: target, targetKind: "EDGE", targetEdgeId: attackId, targetEdgePolarity: "attack", polarity: "attack", kind: "undercutting", strength: 0.2, magnitudeStatus: "MEASURED", strengthSource: "UNDERCUT_TRANSMISSION" })).rejects.toThrow();
  });

  it("FX-DB-05a/05b collapses an identical edge and raises a typed conflict for differing strength_source", async () => {
    const runId = await createRun("upsert");
    const graph = new GraphRepository(database.pool);
    const [sourceNodeId, targetNodeId] = await graph.withGraphWrite(runId, async (writer) => [
      await writer.addNode({ runId, statementText: "Source", claimType: "unknown", parentNodeId: null, childKind: null, siblingOrdinal: 0, generationStatus: "complete", pathStatus: "active", explorationDecision: "continue", provenanceRef: null, wayOfKnowing: "REASONING", locator: null, valueLaden: false }),
      await writer.addNode({ runId, statementText: "Target", claimType: "unknown", parentNodeId: null, childKind: null, siblingOrdinal: 0, generationStatus: "complete", pathStatus: "active", explorationDecision: "continue", provenanceRef: null, wayOfKnowing: "REASONING", locator: null, valueLaden: false })
    ] as const);
    const edge = { runId, sourceNodeId, targetKind: "NODE" as const, targetNodeId, targetEdgeId: null, targetEdgePolarity: null, polarity: "support" as const, kind: null, strength: 0.5, magnitudeStatus: "MEASURED" as const, strengthSource: "EVIDENCE_VERIFIER" as const, provenanceRef: "fixture:S02" };
    const first = await graph.withGraphWrite(runId, (writer) => writer.addEdge(edge));
    const duplicate = await graph.withGraphWrite(runId, (writer) => writer.addEdge(edge));
    expect(duplicate).toBe(first);
    await expect(graph.withGraphWrite(runId, (writer) => writer.addEdge({ ...edge, strengthSource: "CLUSTER_COLLAPSE" }))).rejects.toMatchObject({ code: "EDGE_IDENTITY_CONFLICT" });
  });

  it("FX-DB-06a/06b rejects all cross-run endpoint shapes and accepts their in-run complements", async () => {
    const runA = await createRun("cross-a");
    const runB = await createRun("cross-b");
    const a1 = await rawNode({ runId: runA, claimText: "A1" });
    const a2 = await rawNode({ runId: runA, claimText: "A2" });
    const b1 = await rawNode({ runId: runB, claimText: "B1" });
    const b2 = await rawNode({ runId: runB, claimText: "B2" });
    const supportA = await rawEdge({ runId: runA, sourceNodeId: a1, targetKind: "NODE", targetNodeId: a2, polarity: "support", kind: null, strength: 0.5, magnitudeStatus: "MEASURED", strengthSource: "EVIDENCE_VERIFIER" });
    const supportB = await rawEdge({ runId: runB, sourceNodeId: b1, targetKind: "NODE", targetNodeId: b2, polarity: "support", kind: null, strength: 0.5, magnitudeStatus: "MEASURED", strengthSource: "EVIDENCE_VERIFIER" });
    await expect(rawEdge({ runId: runA, sourceNodeId: b1, targetKind: "NODE", targetNodeId: a2, polarity: "support", kind: null, strength: 0.5, magnitudeStatus: "MEASURED", strengthSource: "EVIDENCE_VERIFIER" })).rejects.toThrow();
    await expect(rawEdge({ runId: runA, sourceNodeId: a1, targetKind: "NODE", targetNodeId: b2, polarity: "support", kind: null, strength: 0.5, magnitudeStatus: "MEASURED", strengthSource: "EVIDENCE_VERIFIER" })).rejects.toThrow();
    await expect(rawEdge({ runId: runA, sourceNodeId: a2, targetKind: "EDGE", targetEdgeId: supportB, targetEdgePolarity: "support", polarity: "attack", kind: "undercutting", strength: 0.2, magnitudeStatus: "MEASURED", strengthSource: "UNDERCUT_TRANSMISSION" })).rejects.toThrow();
    await expect(rawEdge({ runId: runA, sourceNodeId: a2, targetKind: "EDGE", targetEdgeId: supportA, targetEdgePolarity: "support", polarity: "attack", kind: "undercutting", strength: 0.2, magnitudeStatus: "MEASURED", strengthSource: "UNDERCUT_TRANSMISSION" })).resolves.toMatch(/[0-9a-f-]{36}/);
  });

  it("FX-DB-08 rejects malformed target, magnitude, self-edge, kind, and producer placement through raw SQL", async () => {
    const runId = await createRun("remaining-invariants");
    const source = await rawNode({ runId, claimText: "Source" });
    const target = await rawNode({ runId, claimText: "Target" });
    const base = { runId, sourceNodeId: source, targetKind: "NODE" as const, targetNodeId: target, polarity: "support" as const, kind: null, strength: 0.4, magnitudeStatus: "MEASURED" as const, strengthSource: "EVIDENCE_VERIFIER" as const };
    await expect(rawEdge({ ...base, targetEdgeId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow();
    await expect(rawEdge({ ...base, strength: null })).rejects.toThrow();
    await expect(rawEdge({ ...base, targetNodeId: source })).rejects.toThrow();
    await expect(rawEdge({ ...base, polarity: "attack", kind: null })).rejects.toThrow();
    await expect(rawEdge({ ...base, strengthSource: "UNDERCUT_TRANSMISSION" })).rejects.toThrow();
  });

  it("FX-C52-10 layer 2 rejects a cycle under the graph write lock", async () => {
    const runId = await createRun("write-cycle");
    const graph = new GraphRepository(database.pool);
    const a = await rawNode({ runId, claimText: "A" });
    const b = await rawNode({ runId, claimText: "B" });
    const edge = (sourceNodeId: string, targetNodeId: string) => ({ runId, sourceNodeId, targetKind: "NODE" as const, targetNodeId, targetEdgeId: null, targetEdgePolarity: null, polarity: "support" as const, kind: null, strength: 0.5, magnitudeStatus: "MEASURED" as const, strengthSource: "EVIDENCE_VERIFIER" as const, provenanceRef: "fixture:S02" });
    await graph.withGraphWrite(runId, (writer) => writer.addEdge(edge(a, b)));
    await expect(graph.withGraphWrite(runId, (writer) => writer.addEdge(edge(b, a)))).rejects.toMatchObject({ code: "GRAPH_CYCLE_WRITE_REJECTED" });
  });

  it("FX-PT-ORD derives the same explicit NULLS FIRST arrow order twice", async () => {
    const runId = await createRun("stable-order");
    const source = await rawNode({ runId, claimText: "Source" });
    const target = await rawNode({ runId, claimText: "Target" });
    const support = await rawEdge({ runId, sourceNodeId: source, targetKind: "NODE", targetNodeId: target, polarity: "support", kind: null, strength: 0.5, magnitudeStatus: "MEASURED", strengthSource: "EVIDENCE_VERIFIER" });
    await rawEdge({ runId, sourceNodeId: target, targetKind: "EDGE", targetEdgeId: support, targetEdgePolarity: "support", polarity: "attack", kind: "undercutting", strength: 0.2, magnitudeStatus: "MEASURED", strengthSource: "UNDERCUT_TRANSMISSION" });
    const graph = new GraphRepository(database.pool);
    const first = await graph.materialiseSnapshot(runId);
    const second = await graph.materialiseSnapshot(runId);
    expect(first.arrowOrder).toEqual(second.arrowOrder);
    expect(first.arrowOrder).toEqual(first.arrows.map((edge) => edge.arrowId));
  });

  it("S03 entry preserves a judgement-less live node and its arrow in one materialised snapshot", async () => {
    const runId = await createRun("pending-snapshot");
    const pending = await rawNode({ runId, claimText: "Pending child" });
    const target = await rawNode({ runId, claimText: "Judged parent" });
    await rawEdge({
      runId,
      sourceNodeId: pending,
      targetKind: "NODE",
      targetNodeId: target,
      polarity: "support",
      kind: null,
      strength: 0.5,
      magnitudeStatus: "MEASURED",
      strengthSource: "EVIDENCE_VERIFIER"
    });
    const materialised = await new GraphRepository(database.pool).materialiseSnapshot(runId);
    expect(materialised.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: pending, baseStrength: null }),
      expect.objectContaining({ nodeId: target, baseStrength: null })
    ]));
    expect(materialised.arrows).toHaveLength(1);
  });

  it("S03 records operator, cluster, lift, rival, and removal-sensitivity receipts", async () => {
    const runId = await createRun("s03-receipts");
    const root = await rawNode({ runId, claimText: "Receipt root" });
    const supporter = await rawNode({ runId, claimText: "Receipt supporter" });
    const support = await rawEdge({
      runId,
      sourceNodeId: supporter,
      targetKind: "NODE",
      targetNodeId: root,
      polarity: "support",
      kind: null,
      strength: 1,
      magnitudeStatus: "MEASURED",
      strengthSource: "EVIDENCE_VERIFIER"
    });
    const outcome = evaluate({
      nodes: [
        { nodeId: root, baseStrength: 0.5, positionLabel: "supports" },
        { nodeId: supporter, baseStrength: 0.5 }
      ],
      arrows: [{
        arrowId: support,
        sourceNodeId: supporter,
        targetKind: "NODE",
        targetNodeId: root,
        targetEdgeId: null,
        polarity: "support",
        kind: null,
        strength: 1,
        magnitudeStatus: "MEASURED",
        strengthSource: "EVIDENCE_VERIFIER"
      }],
      arrowOrder: [support],
      operatorResolutions: [{ parentNodeId: root, operator: "accumulate", suppliedBy: "deployment" }],
      clusterRecords: []
    });
    const propagationRunId = await new LedgerRepository(database.pool).recordPropagation({
      runId,
      inputHash: "input:s03",
      contractHash: "contract:s03",
      graphFingerprint: "graph:s03",
      arrowOrder: outcome.arrowOrder,
      clusterRecords: outcome.clusterRecords,
      operatorResolutions: outcome.operatorResolutions,
      transmissionReductions: outcome.transmissionReductions,
      liftRecords: outcome.liftRecords,
      judgementSelectionRule: { kind: "TEST_LAYER_ONLY" },
      sensitivityRecords: outcome.sensitivityRecords,
      strengths: outcome.strengths.map((strength) => ({
        ...strength,
        numberKind: "fixture:s03",
        sourceRef: "fixture:s03",
        producer: "fixture:s03",
        replayHandle: "fixture:s03",
        wayOfKnowing: "REASONING" as const
      }))
    });
    const receipt = await database.pool.query(
      `SELECT strength.operator_used, strength.operator_level, strength.rival_operator,
              strength.rival_strength, strength.supported_by, strength.position_label,
              propagation.cluster_records, propagation.operator_by_parent,
              count(sensitivity.removed_node_id)::int AS sensitivity_count
       FROM ledger.propagation_run AS propagation
       JOIN ledger.node_strength_record AS strength
         ON strength.propagation_run_id=propagation.propagation_run_id AND strength.node_id=$2
       JOIN ledger.sensitivity_record AS sensitivity
         ON sensitivity.propagation_run_id=propagation.propagation_run_id
       WHERE propagation.propagation_run_id=$1
       GROUP BY strength.operator_used, strength.operator_level, strength.rival_operator,
                strength.rival_strength, strength.supported_by, strength.position_label,
                propagation.cluster_records, propagation.operator_by_parent`,
      [propagationRunId, root]
    );
    expect(receipt.rows[0]).toMatchObject({
      operator_used: "accumulate",
      operator_level: "deployment",
      rival_operator: "strict-and",
      rival_strength: 0.75,
      supported_by: [support],
      position_label: "supports",
      sensitivity_count: 2
    });
  });

  it("DR-071 records a real undercut's pure-core reduction and the derived order end to end", async () => {
    const runId = await createRun("recorded-undercut");
    const source = await rawNode({ runId, claimText: "Source" });
    const target = await rawNode({ runId, claimText: "Target" });
    const support = await rawEdge({ runId, sourceNodeId: source, targetKind: "NODE", targetNodeId: target, polarity: "support", kind: null, strength: 0.5, magnitudeStatus: "MEASURED", strengthSource: "EVIDENCE_VERIFIER" });
    const undercut = await rawEdge({ runId, sourceNodeId: target, targetKind: "EDGE", targetEdgeId: support, targetEdgePolarity: "support", polarity: "attack", kind: "undercutting", strength: 0.2, magnitudeStatus: "MEASURED", strengthSource: "UNDERCUT_TRANSMISSION" });
    const snapshot = await new GraphRepository(database.pool).materialiseSnapshot(runId);
    const reductions = deriveTransmissionReductions(snapshot);
    const propagationRunId = await new LedgerRepository(database.pool).recordPropagation({
      runId,
      inputHash: "input:s02",
      contractHash: "contract:s02",
      graphFingerprint: "graph:s02",
      arrowOrder: snapshot.arrowOrder,
      clusterRecords: [],
      operatorResolutions: [],
      transmissionReductions: reductions,
      liftRecords: [],
      judgementSelectionRule: { kind: "ONLY_PERSISTED_JUDGEMENT" },
      strengths: []
    });
    const recorded = await database.pool.query<{ arrow_order: string[]; transmission_reductions: unknown }>(
      "SELECT arrow_order, transmission_reductions FROM ledger.propagation_run WHERE propagation_run_id=$1",
      [propagationRunId]
    );
    expect(recorded.rows[0]).toEqual({
      arrow_order: snapshot.arrowOrder,
      transmission_reductions: [{
        targetEdgeId: support,
        undercutEdgeId: undercut,
        reduction: 0.2,
        magnitudeStatus: "MEASURED"
      }]
    });
  });
});
