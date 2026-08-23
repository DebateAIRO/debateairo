import { createHash } from "node:crypto";
import type { Pool } from "pg";
import {
  CONTENT_CIPHERTEXT_SENTINEL,
  allocateSequence,
  decryptContentForRun,
  encryptContentForRun,
  type CryptoEnvelope,
  withWriteTransaction
} from "@debateai/db";
import {
  TypedDomainError,
  classifyLedgerActionKind,
  type LedgerOutcome,
  type OperatorSupplyingLevel,
  type ScoringOperator,
  type StanceAtAction
} from "@debateai/kernel";

export interface AppendLedgerInput {
  readonly runId: string | null;
  readonly attemptId?: string;
  readonly actionKind: string;
  readonly callSiteKey?: string;
  readonly subjectItemId: string;
  readonly stanceAtAction: StanceAtAction;
  readonly outcome: LedgerOutcome;
  readonly actorRef: string;
  readonly inputHash: string;
  readonly contractHash: string;
  readonly rawArtifactRef?: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date;
}

export interface LedgerEntryRecord {
  readonly ledgerEntryId: string;
  readonly sequence: number;
  readonly subjectItemId: string;
  readonly stanceAtAction: StanceAtAction;
  readonly outcome: LedgerOutcome;
}

export interface AppendRawArtifactInput {
  readonly artifactId: string;
  readonly attemptId: string;
  readonly runId: string | null;
  readonly providerRef: string;
  readonly provider: string;
  readonly model: string;
  readonly maker: string;
  readonly modelVersion: string | null;
  readonly rawText: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly parseStatus: "PARSED" | "UNPARSED" | "PARSE_FAILED" | "SCHEMA_FAILED";
  readonly parseError?: string | null;
  readonly inputHash: string;
  readonly contractHash: string;
  readonly contentHash: string;
}

interface ScheduledArtifactRow {
  readonly subject_item_id: string;
  readonly raw_artifact_id: string | null;
  readonly raw_text: string | null;
  readonly content_ciphertext: CryptoEnvelope | null;
  readonly parse_status: "PARSED" | "UNPARSED" | "PARSE_FAILED" | "SCHEMA_FAILED" | null;
}

export interface DecisionReplayIdentity {
  readonly signals: readonly unknown[];
  readonly pathState: Readonly<Record<string, unknown>>;
  readonly action: string;
  readonly firingReasons: readonly string[];
  readonly blockers: readonly string[];
  readonly nextPathState?: Readonly<Record<string, unknown>>;
}

export interface RecordDecisionInput {
  readonly runId: string;
  readonly parentNodeId: string;
  readonly idempotencyKey: string;
  readonly replayIdentity: DecisionReplayIdentity;
  readonly classification: "categorical" | "scalar";
  readonly spawnCount: number;
}

export interface DecisionRecord {
  readonly decisionRecordId: string;
  readonly replayIdentityHash: string;
  readonly classification: "categorical" | "scalar";
  readonly spawnCount: number;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypedDomainError("DECISION_IDENTITY_UNSERIALIZABLE", "Replay identity contains an unserializable value");
  return encoded;
}

export class LedgerRepository {
  constructor(private readonly pool: Pool) {}

  async recordDecision(input: RecordDecisionInput): Promise<DecisionRecord> {
    if (input.classification === "scalar" && input.spawnCount !== 0) {
      throw new TypedDomainError("SCALAR_DECISION_CANNOT_SPAWN", "Only a categorically-grounded decision may spawn work");
    }
    if (!Number.isInteger(input.spawnCount) || input.spawnCount < 0) {
      throw new TypedDomainError("DECISION_SPAWN_COUNT_INVALID", "Decision spawn count must be a non-negative integer");
    }
    const replayIdentityHash = createHash("sha256")
      .update(canonicalJson(input.replayIdentity))
      .digest("hex");
    return withWriteTransaction(this.pool, async (client) => {
      const sequence = await allocateSequence(client);
      const inserted = await client.query<{
        decision_record_id: string;
        replay_identity_hash: string;
        classification: "categorical" | "scalar";
        spawn_count: number;
      }>(
        `INSERT INTO ledger.decision_record (
          run_id, parent_node_id, idempotency_key, signals_json, path_state_json,
          firing_reasons, blockers, action, classification, spawn_count,
          replay_identity_hash, at_seq
        ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12)
        ON CONFLICT (run_id, idempotency_key) DO NOTHING
        RETURNING decision_record_id, replay_identity_hash, classification, spawn_count`,
        [
          input.runId,
          input.parentNodeId,
          input.idempotencyKey,
          JSON.stringify(input.replayIdentity.signals),
          JSON.stringify(input.replayIdentity.pathState),
          JSON.stringify(input.replayIdentity.firingReasons),
          JSON.stringify(input.replayIdentity.blockers),
          input.replayIdentity.action,
          input.classification,
          input.spawnCount,
          replayIdentityHash,
          sequence
        ]
      );
      let row = inserted.rows[0];
      if (row === undefined) {
        const replay = await client.query<{
          decision_record_id: string;
          replay_identity_hash: string;
          classification: "categorical" | "scalar";
          spawn_count: number;
        }>(
          `SELECT decision_record_id, replay_identity_hash, classification, spawn_count
           FROM ledger.decision_record WHERE run_id=$1 AND idempotency_key=$2`,
          [input.runId, input.idempotencyKey]
        );
        row = replay.rows[0];
        if (row === undefined || row.replay_identity_hash !== replayIdentityHash) {
          throw new TypedDomainError(
            "DECISION_IDEMPOTENCY_CONFLICT",
            "A different decision content already uses this idempotency key"
          );
        }
      }
      return Object.freeze({
        decisionRecordId: row.decision_record_id,
        replayIdentityHash: row.replay_identity_hash,
        classification: row.classification,
        spawnCount: Number(row.spawn_count)
      });
    });
  }

  async append(input: AppendLedgerInput): Promise<LedgerEntryRecord> {
    return withWriteTransaction(this.pool, async (client) => {
      const sequence = await allocateSequence(client);
      const actionKind = classifyLedgerActionKind(input.actionKind);
      const callSiteKey = actionKind === "UNCLASSIFIED_ACTION"
        ? input.callSiteKey ?? input.actionKind
        : input.callSiteKey ?? null;
      const result = await client.query<{
        ledger_entry_id: string;
        subject_item_id: string;
        stance_at_action: StanceAtAction;
        outcome: LedgerOutcome;
      }>(
        `INSERT INTO ledger.ledger_entry (
          sequence, run_id, attempt_id, action_kind, call_site_key, subject_item_id,
          stance_at_action, outcome, actor_ref, input_hash, contract_hash,
          raw_artifact_ref, started_at, finished_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING ledger_entry_id, subject_item_id, stance_at_action, outcome`,
        [
          sequence, input.runId, input.attemptId ?? null, actionKind, callSiteKey,
          input.subjectItemId, input.stanceAtAction, input.outcome, input.actorRef, input.inputHash,
          input.contractHash, input.rawArtifactRef ?? null, input.startedAt, input.finishedAt
        ]
      );
      const row = result.rows[0]!;
      return {
        ledgerEntryId: row.ledger_entry_id,
        sequence,
        subjectItemId: row.subject_item_id,
        stanceAtAction: row.stance_at_action,
        outcome: row.outcome
      };
    });
  }

  async appendRawArtifact(input: AppendRawArtifactInput): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const sequence = await allocateSequence(client);
      const content = input.runId === null ? null : await encryptContentForRun(
        this.pool, input.runId, "ledger.raw_artifact", input.artifactId,
        { rawText: input.rawText }
      );
      const result = await client.query<{ raw_artifact_id: string }>(
        `INSERT INTO ledger.raw_artifact (
          raw_artifact_id, attempt_id, run_id, provider_ref, provider,
          model_id, maker, model_version, raw_text, metadata_json,
          parse_status, parse_error, input_hash, contract_hash, content_hash, at_seq,
          content_ciphertext
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17::jsonb)
        RETURNING raw_artifact_id`,
        [
          input.artifactId, input.attemptId, input.runId, input.providerRef, input.provider,
          input.model, input.maker, input.modelVersion,
          content === null ? input.rawText : CONTENT_CIPHERTEXT_SENTINEL,
          JSON.stringify(input.metadata), input.parseStatus, input.parseError ?? null,
          input.inputHash, input.contractHash, input.contentHash, sequence,
          content === null ? null : JSON.stringify(content)
        ]
      );
      return result.rows[0]!.raw_artifact_id;
    });
  }


  async recordPropagation(input: {
    readonly runId: string;
    readonly inputHash: string;
    readonly contractHash: string;
    readonly graphFingerprint: string;
    readonly arrowOrder: readonly string[];
    readonly clusterRecords: readonly unknown[];
    readonly operatorResolutions: readonly unknown[];
    readonly transmissionReductions: readonly unknown[];
    readonly liftRecords: readonly unknown[];
    readonly judgementSelectionRule: Readonly<Record<string, unknown>>;
    readonly sensitivityRecords?: readonly {
      readonly removedNodeId: string;
      readonly leverage: number;
      readonly fragility: readonly unknown[];
    }[];
    readonly strengths: readonly {
      readonly nodeId: string;
      readonly strength: number;
      readonly numberKind: string;
      readonly sourceRef: string;
      readonly producer: string;
      readonly replayHandle: string;
      readonly wayOfKnowing: "LOOKED_UP" | "RAN" | "REASONING";
      readonly tauSource?: string | null;
      readonly clusterId?: string | null;
      readonly judgedBy?: string | null;
      readonly abstained?: boolean;
      readonly supportedBy?: readonly string[];
      readonly attackedBy?: readonly string[];
      readonly operatorUsed?: ScoringOperator | null;
      readonly operatorLevel?: OperatorSupplyingLevel | null;
      readonly positionLabel?: string | null;
      readonly liftMarker?: readonly unknown[];
      readonly rivalOperator?: ScoringOperator | null;
      readonly rivalStrength?: number | null;
      readonly reducedJudgementRef?: string | null;
    }[];
  }): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const propagationSequence = await allocateSequence(client);
      const missing = await client.query<{ subject_item_id: string }>(
        `SELECT DISTINCT scheduled.subject_item_id
         FROM ledger.ledger_entry AS scheduled
         WHERE scheduled.run_id = $1 AND scheduled.action_kind = 'JUDGEMENT_SCHEDULED'
           AND scheduled.sequence < $2
           AND NOT EXISTS (
             SELECT 1 FROM ledger.ledger_entry AS artifact_entry
             JOIN ledger.raw_artifact AS artifact
               ON artifact.raw_artifact_id = artifact_entry.raw_artifact_ref
             WHERE artifact_entry.run_id = scheduled.run_id
               AND artifact_entry.subject_item_id = scheduled.subject_item_id
               AND artifact.at_seq < $2
           )
         ORDER BY scheduled.subject_item_id`,
        [input.runId, propagationSequence]
      );
      if (missing.rows.length > 0) {
        throw new TypedDomainError(
          "COMPLETENESS_GATE_FAILED",
          `Required items have no persisted artifact: ${missing.rows.map((row) => row.subject_item_id).join(",")}`
        );
      }
      const propagation = await client.query<{ propagation_run_id: string }>(
        `INSERT INTO ledger.propagation_run (
          run_id, input_hash, contract_hash, graph_fingerprint,
          arrow_order, cluster_records, operator_by_parent, transmission_reductions,
          lift_records, judgement_selection_rule,
          judgement_selection_rule_key, judgement_selection_rule_register_version,
          judgement_selection_rule_source_ref, at_seq
        ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$14)
        RETURNING propagation_run_id`,
        [
          input.runId,
          input.inputHash,
          input.contractHash,
          input.graphFingerprint,
          JSON.stringify(input.arrowOrder),
          JSON.stringify(input.clusterRecords),
          JSON.stringify(input.operatorResolutions),
          JSON.stringify(input.transmissionReductions),
          JSON.stringify(input.liftRecords),
          JSON.stringify(input.judgementSelectionRule),
          typeof input.judgementSelectionRule.rowKey === "string" ? input.judgementSelectionRule.rowKey : null,
          typeof input.judgementSelectionRule.registerVersion === "number" ? input.judgementSelectionRule.registerVersion : null,
          typeof input.judgementSelectionRule.sourceRef === "string" ? input.judgementSelectionRule.sourceRef : null,
          propagationSequence
        ]
      );
      const propagationRunId = propagation.rows[0]!.propagation_run_id;
      for (const strength of input.strengths) {
        await client.query(
          `INSERT INTO ledger.node_strength_record (
            propagation_run_id, node_id, strength, number_kind,
            source_ref, producer, replay_handle, way_of_knowing,
            tau_source, cluster_id, judged_by, abstained, supported_by,
            attacked_by, operator_used, operator_level, position_label,
            lift_marker, rival_operator, rival_strength, reduced_judgement_ref
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17,$18::jsonb,$19,$20,$21)`,
          [
            propagationRunId,
            strength.nodeId,
            strength.strength,
            strength.numberKind,
            strength.sourceRef,
            strength.producer,
            strength.replayHandle,
            strength.wayOfKnowing,
            strength.tauSource ?? null,
            strength.clusterId ?? null,
            strength.judgedBy ?? null,
            strength.abstained ?? false,
            JSON.stringify(strength.supportedBy ?? []),
            JSON.stringify(strength.attackedBy ?? []),
            strength.operatorUsed ?? null,
            strength.operatorLevel ?? null,
            strength.positionLabel ?? null,
            JSON.stringify(strength.liftMarker ?? []),
            strength.rivalOperator ?? null,
            strength.rivalStrength ?? null,
            strength.reducedJudgementRef ?? null
          ]
        );
      }
      for (const sensitivity of input.sensitivityRecords ?? []) {
        const sensitivitySequence = await allocateSequence(client);
        await client.query(
          `INSERT INTO ledger.sensitivity_record (
            propagation_run_id, removed_node_id, leverage, fragility, at_seq
          ) VALUES ($1,$2,$3,$4::jsonb,$5)`,
          [
            propagationRunId,
            sensitivity.removedNodeId,
            sensitivity.leverage,
            JSON.stringify(sensitivity.fragility),
            sensitivitySequence
          ]
        );
      }
      return propagationRunId;
    });
  }

  private async scheduledArtifacts(runId: string): Promise<readonly ScheduledArtifactRow[]> {
    const result = await this.pool.query<ScheduledArtifactRow>(
      `SELECT required.subject_item_id, artifact.raw_artifact_id, artifact.raw_text,
              artifact.content_ciphertext, artifact.parse_status
       FROM (
         SELECT DISTINCT subject_item_id FROM ledger.ledger_entry
         WHERE run_id = $1 AND action_kind = 'JUDGEMENT_SCHEDULED'
       ) AS required
       LEFT JOIN LATERAL (
         SELECT raw.raw_artifact_id, raw.raw_text, raw.content_ciphertext, raw.parse_status
         FROM ledger.ledger_entry AS entry
         JOIN ledger.raw_artifact AS raw ON raw.raw_artifact_id = entry.raw_artifact_ref
         WHERE entry.run_id = $1 AND entry.subject_item_id = required.subject_item_id
         ORDER BY entry.sequence DESC LIMIT 1
       ) AS artifact ON true
       ORDER BY required.subject_item_id`,
      [runId]
    );
    return Promise.all(result.rows.map(async (row) => {
      if (row.raw_artifact_id === null) return row;
      const content = await decryptContentForRun<{ rawText: string }>(
        this.pool, runId, "ledger.raw_artifact", row.raw_artifact_id,
        row.content_ciphertext, { rawText: row.raw_text! }
      );
      return { ...row, raw_text: content.rawText };
    }));
  }

  async assertComplete(runId: string): Promise<void> {
    const rows = await this.scheduledArtifacts(runId);
    const missing = rows.filter((row) => row.raw_artifact_id === null).map((row) => row.subject_item_id);
    if (missing.length > 0) {
      throw new TypedDomainError("COMPLETENESS_GATE_FAILED", `Required items have no persisted artifact: ${missing.join(",")}`);
    }
  }

  async rebuildFromArtifacts(runId: string): Promise<readonly {
    readonly subjectItemId: string;
    readonly rawArtifactId: string;
    readonly rawText: string;
    readonly parseStatus: "PARSED" | "UNPARSED" | "PARSE_FAILED" | "SCHEMA_FAILED";
  }[]> {
    const rows = await this.scheduledArtifacts(runId);
    if (rows.some((row) => row.raw_artifact_id === null)) {
      throw new TypedDomainError("RECONSTRUCTION_INPUT_MISSING", `Run ${runId} has a required item without an artifact`);
    }
    return rows.map((row) => Object.freeze({
      subjectItemId: row.subject_item_id,
      rawArtifactId: row.raw_artifact_id!,
      rawText: row.raw_text!,
      parseStatus: row.parse_status!
    }));
  }

  async readStoredResultVerbatim(runId: string): Promise<readonly {
    readonly nodeId: string;
    readonly strength: number;
  }[]> {
    const result = await this.pool.query<{ node_id: string; strength: number }>(
      `SELECT strength.node_id, strength.strength
       FROM ledger.propagation_run AS propagation
       JOIN ledger.node_strength_record AS strength
         ON strength.propagation_run_id = propagation.propagation_run_id
       WHERE propagation.propagation_run_id = (
         SELECT latest.propagation_run_id FROM ledger.propagation_run AS latest
         WHERE latest.run_id = $1 ORDER BY latest.at_seq DESC LIMIT 1
       )
       ORDER BY strength.node_id`,
      [runId]
    );
    if (result.rows.length === 0) throw new TypedDomainError("STORED_RESULT_MISSING", `Run ${runId} has no stored propagation result`);
    return result.rows.map((row) => Object.freeze({ nodeId: row.node_id, strength: Number(row.strength) }));
  }

  async resumePartial(runId: string): Promise<{
    readonly ready: readonly { readonly subjectItemId: string; readonly rawArtifactId: string }[];
    readonly missingSubjectItemIds: readonly string[];
  }> {
    const rows = await this.scheduledArtifacts(runId);
    return Object.freeze({
      ready: Object.freeze(rows.filter((row) => row.raw_artifact_id !== null).map((row) => Object.freeze({
        subjectItemId: row.subject_item_id,
        rawArtifactId: row.raw_artifact_id!
      }))),
      missingSubjectItemIds: Object.freeze(rows.filter((row) => row.raw_artifact_id === null).map((row) => row.subject_item_id))
    });
  }


  async findSuccessfulCommandArtifact(input: {
    readonly runId: string;
    readonly workItemId: string;
  }): Promise<{ readonly attemptId: string; readonly artifactRef: string } | null> {
    const result = await this.pool.query<{ attempt_id: string; subject_item_id: string }>(
      `SELECT entry.attempt_id, entry.subject_item_id
       FROM ledger.ledger_entry AS entry
       JOIN serve.answer AS answer ON answer.answer_id::text = entry.subject_item_id
       WHERE entry.run_id = $1 AND entry.action_kind = 'SERVE'
         AND entry.outcome IN ('OK','BLOCKED') AND entry.attempt_id IS NOT NULL
         AND answer.work_item_id = $2
       ORDER BY entry.sequence DESC LIMIT 1`,
      [input.runId, input.workItemId]
    );
    const row = result.rows[0];
    return row === undefined ? null : { attemptId: row.attempt_id, artifactRef: row.subject_item_id };
  }

  async findExhaustedModelAttempt(input: {
    readonly runId: string;
    readonly workItemId: string;
    readonly contractHash: string;
    readonly maxAttempts: number;
  }): Promise<{
    readonly attemptId: string;
    readonly artifactRef: string | null;
    readonly ledgerEntryRef: string;
    readonly callSiteKey: string;
    readonly outcome: "OK" | "FAILED" | "TIMED_OUT";
  } | null> {
    const result = await this.pool.query<{
      attempt_id: string;
      raw_artifact_ref: string | null;
      ledger_entry_id: string;
      attempt_count: string;
      call_site_key: string;
      outcome: "OK" | "FAILED" | "TIMED_OUT";
    }>(
      `SELECT entry.attempt_id, entry.raw_artifact_ref, entry.ledger_entry_id, entry.call_site_key,
              entry.outcome, grouped.attempt_count
       FROM ledger.ledger_entry AS entry
       JOIN (
         SELECT call_site_key, count(*)::text AS attempt_count, max(sequence) AS last_sequence
         FROM ledger.ledger_entry
         WHERE run_id = $1 AND subject_item_id = $2
           AND action_kind = 'MODEL_CALL' AND contract_hash = $3
         GROUP BY call_site_key HAVING count(*) >= $4
       ) AS grouped ON grouped.last_sequence = entry.sequence
       WHERE entry.run_id = $1 AND entry.subject_item_id = $2
         AND entry.action_kind = 'MODEL_CALL' AND entry.contract_hash = $3
         AND entry.attempt_id IS NOT NULL
       ORDER BY entry.sequence DESC`,
      [input.runId, input.workItemId, input.contractHash, input.maxAttempts]
    );
    const row = result.rows[0];
    if (row === undefined || Number(row.attempt_count) < input.maxAttempts) return null;
    return {
      attemptId: row.attempt_id,
      artifactRef: row.raw_artifact_ref,
      ledgerEntryRef: row.ledger_entry_id,
      callSiteKey: row.call_site_key,
      outcome: row.outcome
    };
  }

  async countModelAttempts(input: {
    readonly runId: string | null;
    readonly workItemId: string;
    readonly contractHash: string;
    readonly callSiteKey: string;
  }): Promise<number> {
    if (input.runId === null) return 0;
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ledger.ledger_entry
       WHERE run_id = $1 AND subject_item_id = $2
         AND action_kind = 'MODEL_CALL' AND contract_hash = $3 AND call_site_key = $4`,
      [input.runId, input.workItemId, input.contractHash, input.callSiteKey]
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
