import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";

/**
 * FAIR-01 — the RUN-LEVEL fair-debate gate (DR-140(b), DR-143 clause 1).
 *
 * V's words are the requirement: a real acceptance debate must have "more than
 * one node" and "more than one model". DR-143 clause 1 rules that this is
 * run-level law enforced ON THE DEBATE ITSELF — the deployment admission floor
 * stays at 1 (DR-137 mono-model runs remain lawful elsewhere).
 *
 * Independence is proven from RECORDED per-artifact maker lineage: at least
 * one attack edge must join two nodes whose provenance artifacts carry
 * DIFFERENT makers — the counter genuinely comes from another maker. The S08
 * critique-packet/independence-receipt instrument is deliberately not
 * consulted here: DR-141(4) rules that a run carrying critique packets
 * REFUSES at terminal (Q42 `critic_agrees` has no recorded shape) until V
 * rules the recording migration, so the fair debate must not record packets.
 *
 * Pure core (evaluateFairDebate) + imperative shell (readFairDebateEvidence /
 * assertFairDebate) — P2. Every violation is a typed loud failure naming what
 * is missing; nothing here fabricates or defaults (DR-115; P18: an absent
 * lineage is a typed reason, never assumed independence).
 */

export interface FairDebateEvidence {
  /** Non-stale graph nodes with the maker/model of their provenance artifact. */
  readonly nodes: readonly {
    readonly nodeId: string;
    readonly childKind: string | null;
    readonly provenanceRef: string | null;
    readonly maker: string | null;
    readonly modelId: string | null;
  }[];
  /** Attack edges whose endpoints are graph nodes. */
  readonly attackEdges: readonly {
    readonly edgeId: string;
    readonly sourceNodeId: string;
    readonly targetNodeId: string | null;
  }[];
}

export interface FairDebateReport {
  readonly nodeCount: number;
  readonly attackEdgeCount: number;
  readonly distinctMakers: readonly string[];
  /** Attack edges joining nodes whose persisted artifact makers DIFFER. */
  readonly independentAttackEdgeCount: number;
}

export function evaluateFairDebate(evidence: FairDebateEvidence): FairDebateReport {
  if (evidence.nodes.length < 2) {
    throw new TypedDomainError(
      "FAIR_DEBATE_NODE_COUNT_UNSATISFIED",
      `DR-140(b): the answer graph carries ${evidence.nodes.length} node(s); a fair debate requires more than one`
    );
  }
  const unlineaged = evidence.nodes.filter((node) =>
    node.provenanceRef === null || node.maker === null || node.modelId === null
  );
  if (unlineaged.length > 0) {
    throw new TypedDomainError(
      "FAIR_DEBATE_LINEAGE_MISSING",
      `DR-115: node(s) without a persisted artifact lineage: ${unlineaged.map((node) => node.nodeId).join(", ")}`
    );
  }
  const distinctMakers = [...new Set(evidence.nodes.map((node) => node.maker!))]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (distinctMakers.length < 2) {
    throw new TypedDomainError(
      "FAIR_DEBATE_MAKER_COUNT_UNSATISFIED",
      `DR-140(b): the debate's nodes persist ${distinctMakers.length} distinct maker(s) (${distinctMakers.join(", ")}); a fair debate requires more than one`
    );
  }
  const makerByNode = new Map(evidence.nodes.map((node) => [node.nodeId, node.maker!] as const));
  const graphAttackEdges = evidence.attackEdges.filter((edge) =>
    makerByNode.has(edge.sourceNodeId) && edge.targetNodeId !== null && makerByNode.has(edge.targetNodeId)
  );
  if (graphAttackEdges.length < 1) {
    throw new TypedDomainError(
      "FAIR_DEBATE_COUNTER_EDGE_MISSING",
      "DR-140(b): no attack edge joins the counter-position to the position — a floating node is not a debate"
    );
  }
  const independentAttackEdges = graphAttackEdges.filter((edge) =>
    makerByNode.get(edge.sourceNodeId) !== makerByNode.get(edge.targetNodeId!)
  );
  if (independentAttackEdges.length < 1) {
    throw new TypedDomainError(
      "FAIR_DEBATE_COUNTER_NOT_INDEPENDENT",
      "DR-140(b): every attack edge joins nodes of the SAME persisted maker — the counter-position is not another maker's genuine counter"
    );
  }
  return Object.freeze({
    nodeCount: evidence.nodes.length,
    attackEdgeCount: graphAttackEdges.length,
    distinctMakers: Object.freeze(distinctMakers),
    independentAttackEdgeCount: independentAttackEdges.length
  });
}

export async function readFairDebateEvidence(pool: Pool, runId: string): Promise<FairDebateEvidence> {
  const [nodes, edges] = await Promise.all([
    pool.query<{
      node_id: string;
      child_kind: string | null;
      provenance_ref: string | null;
      maker: string | null;
      model_id: string | null;
    }>(
      `SELECT node.node_id, node.child_kind, node.provenance_ref::text,
              artifact.maker, artifact.model_id
       FROM core.node AS node
       LEFT JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = node.provenance_ref
       WHERE node.run_id = $1 AND node.generation_status <> 'stale'
       ORDER BY node.created_at_seq`,
      [runId]
    ),
    pool.query<{ edge_id: string; source_node_id: string; target_node_id: string | null }>(
      `SELECT edge_id, source_node_id, target_node_id
       FROM core.edge
       WHERE run_id = $1 AND polarity = 'attack' AND target_kind = 'NODE'
       ORDER BY created_at_seq`,
      [runId]
    )
  ]);
  return Object.freeze({
    nodes: Object.freeze(nodes.rows.map((row) => Object.freeze({
      nodeId: row.node_id,
      childKind: row.child_kind,
      provenanceRef: row.provenance_ref,
      maker: row.maker,
      modelId: row.model_id
    }))),
    attackEdges: Object.freeze(edges.rows.map((row) => Object.freeze({
      edgeId: row.edge_id,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id
    })))
  });
}

export async function assertFairDebate(pool: Pool, runId: string): Promise<FairDebateReport> {
  return evaluateFairDebate(await readFairDebateEvidence(pool, runId));
}
