import type { Pool, PoolClient } from "pg";
import { allocateSequence, withWriteTransaction } from "@debateai/db";
import {
  TypedDomainError,
  type ChildKind,
  type ClaimType,
  type EdgeKind,
  type EdgePolarity,
  type EdgeTargetKind,
  type ExplorationDecision,
  type GenerationStatus,
  type LabeledNumber,
  type MagnitudeStatus,
  type OperatorSupplyingLevel,
  type PathStatus,
  type ScoringOperator,
  type StrengthSource
} from "@debateai/kernel";

export interface MaterialisedSnapshotArrow {
  readonly arrowId: string;
  readonly sourceNodeId: string;
  readonly targetKind: EdgeTargetKind;
  readonly targetNodeId: string | null;
  readonly targetEdgeId: string | null;
  readonly polarity: EdgePolarity;
  readonly kind: EdgeKind | null;
  readonly strength: number | null;
  readonly magnitudeStatus: MagnitudeStatus;
  readonly strengthSource: StrengthSource;
  readonly clusterKey: {
    readonly evidenceProvenanceRef: string;
    readonly producingRunId: string;
    readonly modelFamily: string;
  } | null;
}

export interface MaterialisedGraphSnapshot {
  readonly nodes: readonly {
    readonly nodeId: string;
    readonly baseStrength: number | null;
    readonly parentNodeId: string | null;
    readonly generationStatus: GenerationStatus;
    readonly wayOfKnowing: "LOOKED_UP" | "RAN" | "REASONING";
    readonly provenanceRef: string | null;
    readonly positionLabel: string | null;
    readonly judgedBy: string | null;
    readonly isFolder: boolean;
  }[];
  readonly arrows: readonly MaterialisedSnapshotArrow[];
  readonly arrowOrder: readonly string[];
  readonly operatorResolutions: readonly {
    readonly parentNodeId: string;
    readonly operator: ScoringOperator;
    readonly suppliedBy: OperatorSupplyingLevel;
  }[];
  readonly clusterRecords: readonly unknown[];
}

export interface AddNodeInput {
  readonly runId: string;
  readonly statementText: string;
  readonly claimType: ClaimType;
  readonly parentNodeId: string | null;
  readonly childKind: ChildKind | null;
  readonly siblingOrdinal: number;
  readonly generationStatus: GenerationStatus;
  readonly pathStatus: PathStatus;
  readonly explorationDecision: ExplorationDecision;
  readonly provenanceRef: string | null;
  readonly wayOfKnowing: "LOOKED_UP" | "RAN" | "REASONING";
  readonly locator: string | null;
  readonly valueLaden: boolean;
  readonly positionLabel?: string | null;
  readonly isFolder?: boolean;
}

export interface AddEdgeInput {
  readonly runId: string;
  readonly sourceNodeId: string;
  readonly targetKind: EdgeTargetKind;
  readonly targetNodeId: string | null;
  readonly targetEdgeId: string | null;
  readonly targetEdgePolarity: EdgePolarity | null;
  readonly polarity: EdgePolarity;
  readonly kind: EdgeKind | null;
  readonly strength: number | null;
  readonly magnitudeStatus: MagnitudeStatus;
  readonly strengthSource: StrengthSource;
  readonly provenanceRef: string;
}

export interface SpawnPendingChildInput {
  readonly runId: string;
  readonly parentNodeId: string;
  readonly statementText: string;
  readonly claimType: ClaimType;
  readonly childKind: ChildKind;
  readonly siblingOrdinal: number;
  readonly explorationDecision: ExplorationDecision;
  readonly provenanceRef: string | null;
  readonly wayOfKnowing: "LOOKED_UP" | "RAN" | "REASONING";
  readonly locator: string | null;
  readonly valueLaden: boolean;
  readonly edgeProvenanceRef: string;
}

export interface SpawnedPendingChild {
  readonly nodeId: string;
  readonly placeholderEdgeId: string;
}

export interface NodeLifecycleEvent {
  readonly eventId: string;
  readonly eventType: "node.spawned" | "node.generating" | "node.being_judged" | "node.scored";
  readonly runRef: string;
  readonly subjectRef: string;
  readonly atSequence: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ConstructionEdge {
  readonly edgeId: string;
  readonly sourceNodeId: string;
  readonly targetKind: EdgeTargetKind;
  readonly targetNodeId: string | null;
  readonly targetEdgeId: string | null;
  readonly polarity: EdgePolarity;
  readonly kind: EdgeKind | null;
}

function reachesNode(
  edges: readonly ConstructionEdge[],
  startNodeId: string,
  soughtNodeId: string
): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.targetKind !== "NODE" || edge.targetNodeId === null) continue;
    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
  }
  const pending = [startNodeId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === soughtNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(outgoing.get(current) ?? []));
  }
  return false;
}

export function constructEdge(input: {
  readonly existingEdges: readonly ConstructionEdge[];
  readonly proposedEdge: ConstructionEdge;
}):
  | { readonly kind: "ACCEPTED"; readonly edge: ConstructionEdge }
  | {
      readonly kind: "CYCLE_REFUSED";
      readonly code: "CIRCULAR_DEPENDENCY_FOUND";
      readonly redirect: {
        readonly childKind: "shared-crux sub-claim";
        readonly sourceNodeId: string;
        readonly targetNodeId: string;
      };
    } {
  const targetNodeId = input.proposedEdge.targetNodeId;
  if (
    input.proposedEdge.targetKind === "NODE"
    && targetNodeId !== null
    && reachesNode(input.existingEdges, targetNodeId, input.proposedEdge.sourceNodeId)
  ) {
    return Object.freeze({
      kind: "CYCLE_REFUSED",
      code: "CIRCULAR_DEPENDENCY_FOUND",
      redirect: Object.freeze({
        childKind: "shared-crux sub-claim",
        sourceNodeId: input.proposedEdge.sourceNodeId,
        targetNodeId
      })
    });
  }
  return Object.freeze({ kind: "ACCEPTED", edge: input.proposedEdge });
}

function sameEdgePayload(
  row: {
    readonly strength: number | null;
    readonly magnitude_status: MagnitudeStatus;
    readonly strength_source: StrengthSource;
    readonly kind: EdgeKind | null;
  },
  input: AddEdgeInput
): boolean {
  return Object.is(row.strength === null ? null : Number(row.strength), input.strength)
    && row.magnitude_status === input.magnitudeStatus
    && row.strength_source === input.strengthSource
    && row.kind === input.kind;
}

export class GraphWriter {
  constructor(private readonly client: PoolClient, private readonly runId: string) {}

  async addNode(input: AddNodeInput): Promise<string> {
    if (input.runId !== this.runId) throw new TypedDomainError("GRAPH_RUN_MISMATCH", "Node belongs to another graph");
    let depth = 0;
    let materializedPath = "0";
    if (input.parentNodeId === null) {
      if (input.childKind !== null || input.siblingOrdinal !== 0) {
        throw new TypedDomainError("GRAPH_ROOT_STRUCTURE_INVALID", "A root has no child kind and ordinal zero");
      }
    } else {
      if (input.childKind === null || input.siblingOrdinal <= 0) {
        throw new TypedDomainError("GRAPH_CHILD_STRUCTURE_INVALID", "A child requires a kind and positive sibling ordinal");
      }
      const parent = await this.client.query<{ depth: number; materialized_path: string }>(
        "SELECT depth, materialized_path FROM core.node WHERE run_id=$1 AND node_id=$2",
        [this.runId, input.parentNodeId]
      );
      const parentRow = parent.rows[0];
      if (parentRow === undefined) throw new TypedDomainError("GRAPH_PARENT_NOT_FOUND", "The structural parent is absent from this graph");
      depth = Number(parentRow.depth) + 1;
      materializedPath = `${parentRow.materialized_path}/${input.siblingOrdinal}`;
    }
    const inserted = await this.client.query<{ node_id: string }>(
      `INSERT INTO core.node (
        run_id, claim_text, claim_type, parent_node_id, child_kind, depth, sibling_ordinal,
        materialized_path, generation_status, path_status, exploration_decision,
        provenance_ref, way_of_knowing, locator, value_laden, position_label, is_folder, created_at_seq
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING node_id`,
      [
        input.runId,
        input.statementText,
        input.claimType,
        input.parentNodeId,
        input.childKind,
        depth,
        input.siblingOrdinal,
        materializedPath,
        input.generationStatus,
        input.pathStatus,
        input.explorationDecision,
        input.provenanceRef,
        input.wayOfKnowing,
        input.locator,
        input.valueLaden,
        input.positionLabel ?? null,
        input.isFolder ?? false,
        await allocateSequence(this.client)
      ]
    );
    return inserted.rows[0]!.node_id;
  }

  async addEdge(input: AddEdgeInput): Promise<string> {
    if (input.runId !== this.runId) throw new TypedDomainError("GRAPH_RUN_MISMATCH", "Edge belongs to another graph");
    const targetId = input.targetNodeId ?? input.targetEdgeId;
    if (targetId === null) throw new TypedDomainError("EDGE_TARGET_MISSING", "An edge requires exactly one target");
    const existing = await this.client.query<{
      edge_id: string;
      strength: number | null;
      magnitude_status: MagnitudeStatus;
      strength_source: StrengthSource;
      kind: EdgeKind | null;
    }>(
      `SELECT edge_id, strength, magnitude_status, strength_source, kind
       FROM core.edge
       WHERE run_id=$1 AND source_node_id=$2 AND target_kind=$3
         AND coalesce(target_node_id, target_edge_id)=$4 AND polarity=$5`,
      [this.runId, input.sourceNodeId, input.targetKind, targetId, input.polarity]
    );
    const existingRow = existing.rows[0];
    if (existingRow !== undefined) {
      if (sameEdgePayload(existingRow, input)) return existingRow.edge_id;
      throw new TypedDomainError(
        "EDGE_IDENTITY_CONFLICT",
        "One edge identity cannot carry differing strength, magnitude status, strength source, or kind"
      );
    }

    if (input.targetKind === "NODE" && input.targetNodeId !== null) {
      const cycle = await this.client.query(
        `WITH RECURSIVE reachable(node_id) AS (
           SELECT $2::uuid
           UNION
           SELECT edge.target_node_id
           FROM reachable
           JOIN core.edge AS edge
             ON edge.run_id=$1 AND edge.source_node_id=reachable.node_id
            AND edge.target_kind='NODE'
         )
         SELECT 1 FROM reachable WHERE node_id=$3::uuid LIMIT 1`,
        [this.runId, input.targetNodeId, input.sourceNodeId]
      );
      if (cycle.rowCount !== 0) {
        throw new TypedDomainError("GRAPH_CYCLE_WRITE_REJECTED", "The edge would close a graph cycle");
      }
    }

    try {
      const inserted = await this.client.query<{ edge_id: string }>(
        `INSERT INTO core.edge (
          run_id, source_node_id, target_kind, target_node_id, target_edge_id,
          target_edge_polarity, polarity, kind, strength, magnitude_status,
          strength_source, provenance_ref, created_at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING edge_id`,
        [
          this.runId,
          input.sourceNodeId,
          input.targetKind,
          input.targetNodeId,
          input.targetEdgeId,
          input.targetEdgePolarity,
          input.polarity,
          input.kind,
          input.strength,
          input.magnitudeStatus,
          input.strengthSource,
          input.provenanceRef,
          await allocateSequence(this.client)
        ]
      );
      return inserted.rows[0]!.edge_id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TypedDomainError("EDGE_INTEGRITY_ERROR", message);
    }
  }

  async spawnPendingChild(input: SpawnPendingChildInput): Promise<SpawnedPendingChild> {
    if (input.runId !== this.runId) {
      throw new TypedDomainError("GRAPH_RUN_MISMATCH", "Spawn belongs to another graph");
    }
    const existing = await this.client.query<{
      node_id: string;
      claim_text: string;
      child_kind: ChildKind;
      generation_status: GenerationStatus;
      edge_id: string | null;
    }>(
      `SELECT node.node_id, node.claim_text, node.child_kind, node.generation_status,
              edge.edge_id
       FROM core.node AS node
       LEFT JOIN core.edge AS edge
         ON edge.run_id=node.run_id AND edge.source_node_id=node.node_id
        AND edge.target_kind='NODE' AND edge.target_node_id=node.parent_node_id
       WHERE node.run_id=$1 AND node.parent_node_id=$2 AND node.sibling_ordinal=$3`,
      [this.runId, input.parentNodeId, input.siblingOrdinal]
    );
    const replay = existing.rows[0];
    if (replay !== undefined) {
      if (
        replay.claim_text !== input.statementText
        || replay.child_kind !== input.childKind
        || replay.generation_status !== "pending"
        || replay.edge_id === null
      ) {
        throw new TypedDomainError("SPAWN_SLOT_IDENTITY_CONFLICT", "A different child already occupies this parent slot");
      }
      return Object.freeze({ nodeId: replay.node_id, placeholderEdgeId: replay.edge_id });
    }

    const nodeId = await this.addNode({
      runId: input.runId,
      statementText: input.statementText,
      claimType: input.claimType,
      parentNodeId: input.parentNodeId,
      childKind: input.childKind,
      siblingOrdinal: input.siblingOrdinal,
      generationStatus: "pending",
      pathStatus: "active",
      explorationDecision: input.explorationDecision,
      provenanceRef: input.provenanceRef,
      wayOfKnowing: input.wayOfKnowing,
      locator: input.locator,
      valueLaden: input.valueLaden
    });
    const attacking = input.childKind === "attack" || input.childKind === "defeater";
    const placeholderEdgeId = await this.addEdge({
      runId: input.runId,
      sourceNodeId: nodeId,
      targetKind: "NODE",
      targetNodeId: input.parentNodeId,
      targetEdgeId: null,
      targetEdgePolarity: null,
      polarity: attacking ? "attack" : "support",
      kind: attacking ? "rebutting" : null,
      strength: null,
      magnitudeStatus: "UNKNOWN",
      strengthSource: "EVIDENCE_VERIFIER",
      provenanceRef: input.edgeProvenanceRef
    });
    return Object.freeze({ nodeId, placeholderEdgeId });
  }

  async addStrangerRestatement(input: {
    readonly nodeId: string;
    readonly text: string;
    readonly checkStatus: "PASS" | "FAIL" | "NOT_SAMPLED";
  }): Promise<void> {
    await this.client.query(
      `INSERT INTO core.stranger_restatement (
        run_id, subject_kind, subject_id, restatement_text, check_status, at_seq
      ) VALUES ($1,'node',$2,$3,$4,$5)`,
      [this.runId, input.nodeId, input.text, input.checkStatus, await allocateSequence(this.client)]
    );
  }
}

export class GraphRepository {
  constructor(private readonly pool: Pool) {}

  async withGraphWrite<T>(runId: string, operation: (writer: GraphWriter) => Promise<T>): Promise<T> {
    return withWriteTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [runId]);
      return operation(new GraphWriter(client, runId));
    });
  }

  async spawnPendingChild(input: SpawnPendingChildInput): Promise<SpawnedPendingChild> {
    return this.withGraphWrite(input.runId, (writer) => writer.spawnPendingChild(input));
  }

  async readNodeLifecycleEvents(runId: string): Promise<readonly NodeLifecycleEvent[]> {
    const [spawned, judging, scored] = await Promise.all([
      this.pool.query<{
        node_id: string;
        parent_node_id: string;
        node_seq: string;
        edge_id: string;
        edge_seq: string;
      }>(
        `SELECT node.node_id, node.parent_node_id, node.created_at_seq AS node_seq,
                edge.edge_id, edge.created_at_seq AS edge_seq
         FROM core.node AS node
         JOIN core.edge AS edge
           ON edge.run_id=node.run_id AND edge.source_node_id=node.node_id
          AND edge.target_kind='NODE' AND edge.target_node_id=node.parent_node_id
         WHERE node.run_id=$1 AND node.parent_node_id IS NOT NULL
           AND node.generation_status='pending'`,
        [runId]
      ),
      this.pool.query<{ ledger_entry_id: string; sequence: string; subject_item_id: string }>(
        `SELECT entry.ledger_entry_id, entry.sequence, entry.subject_item_id
         FROM ledger.ledger_entry AS entry
         JOIN core.node AS node
           ON node.run_id=entry.run_id AND node.node_id::text=entry.subject_item_id
         WHERE entry.run_id=$1 AND entry.action_kind='JUDGEMENT_SCHEDULED'`,
        [runId]
      ),
      this.pool.query<{
        propagation_run_id: string;
        at_seq: string;
        node_id: string;
        strength: number;
        number_kind: string;
        source_ref: string;
        producer: string;
        replay_handle: string;
      }>(
        `SELECT propagation.propagation_run_id, propagation.at_seq, strength.node_id,
                strength.strength, strength.number_kind, strength.source_ref,
                strength.producer, strength.replay_handle
         FROM ledger.node_strength_record AS strength
         JOIN ledger.propagation_run AS propagation
           ON propagation.propagation_run_id=strength.propagation_run_id
         JOIN core.node AS node ON node.node_id=strength.node_id AND node.run_id=propagation.run_id
         WHERE propagation.run_id=$1`,
        [runId]
      )
    ]);
    const events: NodeLifecycleEvent[] = [];
    for (const row of spawned.rows) {
      events.push(Object.freeze({
        eventId: `node-spawned:${row.node_id}`,
        eventType: "node.spawned",
        runRef: runId,
        subjectRef: row.node_id,
        atSequence: Number(row.node_seq),
        payload: Object.freeze({
          node_ref: row.node_id,
          parent_ref: row.parent_node_id,
          placeholder_edge_ref: row.edge_id
        })
      }));
      events.push(Object.freeze({
        eventId: `node-generating:${row.node_id}`,
        eventType: "node.generating",
        runRef: runId,
        subjectRef: row.node_id,
        atSequence: Number(row.edge_seq),
        payload: Object.freeze({})
      }));
    }
    for (const row of judging.rows) {
      events.push(Object.freeze({
        eventId: `node-being-judged:${row.ledger_entry_id}`,
        eventType: "node.being_judged",
        runRef: runId,
        subjectRef: row.subject_item_id,
        atSequence: Number(row.sequence),
        payload: Object.freeze({})
      }));
    }
    for (const row of scored.rows) {
      const number: LabeledNumber = {
        value: Number(row.strength),
        kind: row.number_kind,
        source: row.source_ref,
        producer: row.producer,
        provenanceRef: row.propagation_run_id,
        replayHandle: row.replay_handle
      };
      events.push(Object.freeze({
        eventId: `node-scored:${row.propagation_run_id}:${row.node_id}`,
        eventType: "node.scored",
        runRef: runId,
        subjectRef: row.node_id,
        atSequence: Number(row.at_seq),
        payload: Object.freeze({
          value: number.value,
          provenance_ref: number.provenanceRef,
          replay_handle: number.replayHandle,
          kind: number.kind,
          source: number.source,
          producer: number.producer
        })
      }));
    }
    return Object.freeze(events.sort((left, right) => left.atSequence - right.atSequence));
  }

  async materialiseSnapshot(runId: string): Promise<MaterialisedGraphSnapshot> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const nodeResult = await client.query<{
        node_id: string;
        base_strength: number | null;
        parent_node_id: string | null;
        generation_status: GenerationStatus;
        way_of_knowing: "LOOKED_UP" | "RAN" | "REASONING";
        provenance_ref: string | null;
        position_label: string | null;
        judged_by: string | null;
        is_folder: boolean;
      }>(
        `SELECT node.node_id, judgement.tau AS base_strength,
                node.parent_node_id, node.generation_status, node.way_of_knowing,
                node.provenance_ref, node.position_label, judgement.producer AS judged_by,
                node.is_folder
         FROM core.node AS node
         LEFT JOIN LATERAL (
           SELECT tau, producer FROM ledger.reduced_judgement
           WHERE node_id = node.node_id ORDER BY at_seq DESC LIMIT 1
         ) AS judgement ON true
         WHERE node.run_id = $1 AND node.generation_status <> 'stale'
         ORDER BY node.created_at_seq`,
        [runId]
      );
      const edgeResult = await client.query<{
      edge_id: string;
      source_node_id: string;
      target_kind: EdgeTargetKind;
      target_node_id: string | null;
      target_edge_id: string | null;
      polarity: EdgePolarity;
      kind: EdgeKind | null;
      strength: number | null;
      magnitude_status: MagnitudeStatus;
      strength_source: StrengthSource;
      evidence_provenance_ref: string | null;
      producing_run_id: string | null;
      model_family: string | null;
      }>(
        `SELECT edge.edge_id, edge.source_node_id, edge.target_kind,
              edge.target_node_id, edge.target_edge_id, edge.polarity,
              edge.kind, edge.strength, edge.magnitude_status, edge.strength_source,
              CASE WHEN artifact.raw_artifact_id IS NULL THEN NULL ELSE edge.provenance_ref END
                AS evidence_provenance_ref,
              artifact.run_id AS producing_run_id,
              CASE WHEN artifact.raw_artifact_id IS NULL THEN NULL
                   ELSE artifact.maker || '/' || artifact.model_id END AS model_family
       FROM core.edge AS edge
       JOIN core.node AS source ON source.run_id=edge.run_id AND source.node_id=edge.source_node_id
       LEFT JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id=source.provenance_ref
       LEFT JOIN core.node AS target
         ON edge.target_kind='NODE' AND target.run_id=edge.run_id AND target.node_id=edge.target_node_id
       WHERE edge.run_id=$1 AND source.generation_status <> 'stale'
         AND (edge.target_kind <> 'NODE' OR target.generation_status <> 'stale')
       ORDER BY edge.target_kind, edge.polarity, edge.kind NULLS FIRST,
                source.materialized_path, source.sibling_ordinal, edge.created_at_seq`,
        [runId]
      );
      await client.query("COMMIT");
      const nodes = nodeResult.rows.map((row) => Object.freeze({
        nodeId: row.node_id,
        baseStrength: row.base_strength === null ? null : Number(row.base_strength),
        parentNodeId: row.parent_node_id,
        generationStatus: row.generation_status,
        wayOfKnowing: row.way_of_knowing,
        provenanceRef: row.provenance_ref,
        positionLabel: row.position_label,
        judgedBy: row.judged_by,
        isFolder: row.is_folder
      }));
      const arrows = edgeResult.rows.map((row) => Object.freeze({
      arrowId: row.edge_id,
      sourceNodeId: row.source_node_id,
      targetKind: row.target_kind,
      targetNodeId: row.target_node_id,
      targetEdgeId: row.target_edge_id,
      polarity: row.polarity,
      kind: row.kind,
      strength: row.strength === null ? null : Number(row.strength),
      magnitudeStatus: row.magnitude_status,
      strengthSource: row.strength_source,
      clusterKey: row.evidence_provenance_ref === null
        || row.producing_run_id === null
        || row.model_family === null
        ? null
        : Object.freeze({
          evidenceProvenanceRef: row.evidence_provenance_ref,
          producingRunId: row.producing_run_id,
          modelFamily: row.model_family
        })
      }));
      return Object.freeze({
        nodes: Object.freeze(nodes),
        arrows: Object.freeze(arrows),
        arrowOrder: Object.freeze(arrows.map((edge) => edge.arrowId)),
        operatorResolutions: Object.freeze([]),
        clusterRecords: Object.freeze([])
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
