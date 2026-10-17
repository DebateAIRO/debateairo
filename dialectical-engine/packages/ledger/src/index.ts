import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  CONTENT_CIPHERTEXT_SENTINEL,
  allocateSequence,
  decryptContentForRun,
  encryptAttestedContentForRun,
  type CryptoEnvelope,
  withRunContentLease,
  withWriteTransaction
} from "@debateai/db";
import {
  STRUCTURE_REPAIR_CALL_SITE_PREFIX,
  TypedDomainError,
  classifyLedgerActionKind,
  type DebateRole,
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
  /**
   * Model scorecard §2.1–§2.3 (migration 0090): the debate job, the scorecard
   * candidate, the scorecard version and the thinking level of a MODEL_CALL
   * attempt. Absent means NULL: every other writer (settlement, evaluator,
   * budget) is unchanged, and the database refuses them on any other action.
   */
  readonly modelRole?: DebateRole | null;
  readonly candidateId?: string | null;
  readonly scorecardVersion?: number | null;
  readonly thinkingLevel?: string | null;
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
  /** Model scorecard §2.3 (migration 0090): the vendor-reported thinking tokens; null when not reported. */
  readonly thinkingTokens?: number | null;
  /** Reply measures (migration 0120, length guidance): repair codes in order; null when none. */
  readonly replyRepairs?: readonly string[] | null;
  /** 0120: STRUCTURE, CONTENT, CUT_OFF or EMPTY for a refused reply; null otherwise. */
  readonly replyFailureClass?: string | null;
  /** 0120: ORIGINAL, PATCH, FULL, STRUCTURE or LENGTH_RETRY. */
  readonly replyForm?: string | null;
  readonly cachedInputTokens?: number | null;
  readonly guidedWords?: number | null;
  readonly actualWords?: number | null;
}

/**
 * The value written to 0120's `reply_repairs`, whose CHECK holds one to sixteen codes. A refused INSERT would lose a reply
 * the vendor already billed, so the list is made to fit: no repair is written as null, a code named twice is kept once
 * (its first place), and a longer list keeps its first sixteen codes, in order.
 */
function replyRepairsColumn(repairs: readonly string[] | null | undefined): string[] | null {
  if (repairs === undefined || repairs === null) return null;
  const distinct = [...new Set(repairs)].slice(0, 16);
  return distinct.length === 0 ? null : distinct;
}

/**
 * LG-A (final review C-1): the SQL condition "this FAILED try was answered by its structure repair", over the
 * `ledger.ledger_entry` row aliased `entry` (a plain SQL identifier). A routed call whose reply had a structure the code
 * could not mend keeps the ORIGINAL try's artifact and ledger row, and that row stays FAILED (one OK row per call, so the
 * terminal facts count the call once); the repair model's own row is the OK one, under
 * `REPAIR:STRUCTURE:<original key>` (contract deviation 7). A reader that requires an OK row for a step's
 * (call site, artifact) reads such a pair as answered with this condition: the try is FAILED, and a later OK MODEL_CALL row
 * of the same run and subject sits at `REPAIR:STRUCTURE:` + its key with no other try at its key in between (the repair
 * follows the try it repairs at once; a later try at the key was answered by nothing earlier). A FAILED row without such
 * a repair is refused exactly as before; the repair row itself is never read as the step's.
 */
export function structureRepairAnsweredSql(entry: string): string {
  if (!/^[a-z_][a-z0-9_]*$/u.test(entry)) throw new TypeError("STRUCTURE_REPAIR_ANSWERED_ALIAS_INVALID");
  return `(${entry}.outcome = 'FAILED' AND EXISTS (
    SELECT 1 FROM ledger.ledger_entry AS repair_answer
     WHERE repair_answer.run_id = ${entry}.run_id AND repair_answer.subject_item_id = ${entry}.subject_item_id
       AND repair_answer.action_kind = 'MODEL_CALL' AND repair_answer.outcome = 'OK'
       AND repair_answer.call_site_key = '${STRUCTURE_REPAIR_CALL_SITE_PREFIX}' || ${entry}.call_site_key
       AND repair_answer.sequence > ${entry}.sequence
       AND NOT EXISTS (
         SELECT 1 FROM ledger.ledger_entry AS between_try
          WHERE between_try.run_id = ${entry}.run_id AND between_try.subject_item_id = ${entry}.subject_item_id
            AND between_try.action_kind = 'MODEL_CALL' AND between_try.call_site_key = ${entry}.call_site_key
            AND between_try.sequence > ${entry}.sequence AND between_try.sequence < repair_answer.sequence)))`;
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
    const perform = async (): Promise<LedgerEntryRecord> => {
    const ledgerEntryId = randomUUID();
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
          ledger_entry_id, sequence, run_id, attempt_id, action_kind, call_site_key, subject_item_id,
          stance_at_action, outcome, actor_ref, input_hash, contract_hash,
          input_hash_version, raw_artifact_ref, started_at, finished_at,
          model_role, candidate_id, scorecard_version, thinking_level
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING ledger_entry_id, subject_item_id, stance_at_action, outcome`,
        [
          ledgerEntryId, sequence, input.runId, input.attemptId ?? null, actionKind, callSiteKey,
          input.subjectItemId, input.stanceAtAction, input.outcome, input.actorRef,input.inputHash,
          input.contractHash,1,input.rawArtifactRef ?? null,
          input.startedAt, input.finishedAt,
          input.modelRole ?? null, input.candidateId ?? null,
          input.scorecardVersion ?? null, input.thinkingLevel ?? null
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
    };
    return input.runId === null
      ? perform()
      : withRunContentLease(this.pool,[input.runId],async () => perform());
  }

  async appendRawArtifact(input: AppendRawArtifactInput): Promise<string> {
    if (input.runId === null) {
      throw new TypedDomainError(
        "RAW_ARTIFACT_RUN_REQUIRED",
        "Provider artifacts must be bound to exactly one run"
      );
    }
    const runId = input.runId;
    return withRunContentLease(this.pool,[runId],async () => {
    const content = await encryptAttestedContentForRun(
      this.pool, runId, "ledger.raw_artifact", input.artifactId,
      { rawText: input.rawText, parseErrorDetail: input.parseError ?? null }
    );
    const parseErrorCode = input.parseStatus === "PARSE_FAILED"
      ? "CONTENT_PARSE_FAILED"
      : input.parseStatus === "SCHEMA_FAILED" ? "CONTENT_SCHEMA_FAILED" : null;
    return withWriteTransaction(this.pool, async (client) => {
      const sequence = await allocateSequence(client);
      const result = await client.query<{ raw_artifact_id: string }>(
        `INSERT INTO ledger.raw_artifact (
          raw_artifact_id, attempt_id, run_id, provider_ref, provider,
          model_id, maker, model_version, raw_text, metadata_json,
          parse_status, parse_error, input_hash, contract_hash, content_hash, at_seq,
          input_hash_version,content_hash_version,
          content_ciphertext,content_attestation,thinking_tokens,reply_repairs,reply_failure_class,reply_form,cached_input_tokens,guided_words,actual_words
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22::text[],$23,$24,$25,$26,$27)
        RETURNING raw_artifact_id`,
        [
          input.artifactId, input.attemptId, input.runId, input.providerRef, input.provider,
          input.model, input.maker, input.modelVersion,
          content === null ? input.rawText : CONTENT_CIPHERTEXT_SENTINEL,
          JSON.stringify(input.metadata), input.parseStatus, parseErrorCode,
          content === null ? input.inputHash : null,input.contractHash,
          content === null ? input.contentHash : null,sequence,
          content === null ? 1 : 2,content === null ? 1 : 2,
          content === null ? null : JSON.stringify(content.envelope),content?.attestation ?? null,
          input.thinkingTokens ?? null,
          replyRepairsColumn(input.replyRepairs),
          input.replyFailureClass ?? null, input.replyForm ?? null,
          input.cachedInputTokens ?? null, input.guidedWords ?? null, input.actualWords ?? null
        ]
      );
      return result.rows[0]!.raw_artifact_id;
    });
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
    /**
     * T10 (goal 188-195): the served-root decision — which root won, on what
     * rule, by what MARGIN over the runner-up, and whether the documented
     * tiebreak was applied. `null` on the DR-184 review catch-up path, which
     * re-propagates without re-selecting a root. Under the comparing judges'
     * rule (engine 2, `comparing-judges-votes-honest-strength-tiebreak`) the
     * judges' votes chose the root: `runnerUp`, `margin` and `tiebreak` then
     * describe the honest final strengths (the strongest other root, the served
     * root's strength minus its, which may be negative, and whether the two were
     * equal), never the vote.
     */
    readonly servedRootSelection?: Readonly<Record<string, unknown>> | null;
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
      readonly reducedJudgementRef?: string | null;
    }[];
  }): Promise<string> {
    return withRunContentLease(this.pool,[input.runId],async () => {
    const propagationRunId = randomUUID();
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
          propagation_run_id,run_id,input_hash,contract_hash,graph_fingerprint,
          input_hash_version,graph_fingerprint_version,
          arrow_order, cluster_records, operator_by_parent, transmission_reductions,
          lift_records, judgement_selection_rule,
          judgement_selection_rule_key, judgement_selection_rule_register_version,
          judgement_selection_rule_source_ref, served_root_selection, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,$17::jsonb,$18)
        RETURNING propagation_run_id`,
        [
          propagationRunId,
          input.runId,
          input.inputHash,
          input.contractHash,
          input.graphFingerprint,
          1,
          1,
          JSON.stringify(input.arrowOrder),
          JSON.stringify(input.clusterRecords),
          JSON.stringify(input.operatorResolutions),
          JSON.stringify(input.transmissionReductions),
          JSON.stringify(input.liftRecords),
          JSON.stringify(input.judgementSelectionRule),
          typeof input.judgementSelectionRule.rowKey === "string" ? input.judgementSelectionRule.rowKey : null,
          typeof input.judgementSelectionRule.registerVersion === "number" ? input.judgementSelectionRule.registerVersion : null,
          typeof input.judgementSelectionRule.sourceRef === "string" ? input.judgementSelectionRule.sourceRef : null,
          input.servedRootSelection == null ? null : JSON.stringify(input.servedRootSelection),
          propagationSequence
        ]
      );
      const storedPropagationRunId = propagation.rows[0]!.propagation_run_id;
      for (const strength of input.strengths) {
        await client.query(
          `INSERT INTO ledger.node_strength_record (
            propagation_run_id, node_id, strength, number_kind,
            source_ref, producer, replay_handle, way_of_knowing,
            tau_source, cluster_id, judged_by, abstained, supported_by,
            attacked_by, operator_used, operator_level, position_label,
            lift_marker, reduced_judgement_ref
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17,$18::jsonb,$19)`,
          [
            storedPropagationRunId,
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
            storedPropagationRunId,
            sensitivity.removedNodeId,
            sensitivity.leverage,
            JSON.stringify(sensitivity.fragility),
            sensitivitySequence
          ]
        );
      }
      return storedPropagationRunId;
    });
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
    await withRunContentLease(this.pool,[runId],async () => {
    const rows = await this.scheduledArtifacts(runId);
    const missing = rows.filter((row) => row.raw_artifact_id === null).map((row) => row.subject_item_id);
    if (missing.length > 0) {
      throw new TypedDomainError("COMPLETENESS_GATE_FAILED", `Required items have no persisted artifact: ${missing.join(",")}`);
    }
    });
  }

  async rebuildFromArtifacts(runId: string): Promise<readonly {
    readonly subjectItemId: string;
    readonly rawArtifactId: string;
    readonly rawText: string;
    readonly parseStatus: "PARSED" | "UNPARSED" | "PARSE_FAILED" | "SCHEMA_FAILED";
  }[]> {
    return withRunContentLease(this.pool,[runId],async () => {
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
    });
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

  /**
   * R2 A8 (OVERVIEW §4 item 1: the review catch-up keeps the receipt's engine): the judgement-selection rule the run's
   * latest propagation version recorded, or null when the run has none. The review catch-up reads it before it writes
   * the next version, so an engine-2 debate's later versions carry the run's own rule, never the catch-up's boot rule.
   * Only the run and the catch-up write `ledger.propagation_run`, so the latest one is the previous version's.
   */
  async readLatestJudgementSelectionRule(runId: string): Promise<Readonly<Record<string, unknown>> | null> {
    const result = await this.pool.query<{ judgement_selection_rule: Record<string, unknown> }>(
      `SELECT propagation.judgement_selection_rule
       FROM ledger.propagation_run AS propagation
       WHERE propagation.run_id = $1
       ORDER BY propagation.at_seq DESC
       LIMIT 1`,
      [runId]
    );
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({ ...row.judgement_selection_rule });
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

  /**
   * The re-claim check: the latest billed row of a call site whose billed attempts reached `maxAttempts`.
   * Preview retry fix, option B (spec 2026-10-11 §1.2 (d)): REFUSED rows (provably unbilled refusals) are
   * neither counted nor picked, so a site holding only free refusals never reads as used up, and a
   * REFUSED row never reaches `failFromExhaustedAttempt`.
   *
   * Run resilience (spec 2026-10-12, fix (b)): with `byActor`, the preview's allowance is each MAKER's own, so the
   * rows are grouped by call site AND by the maker that made them (`actor_ref`): three makers that each failed once
   * at one site, as the serve fallback's hops do, never read as that site used up. Absent (hosted and local), the
   * rows are grouped by call site alone, as before.
   *
   * LG-A (final review C-1): a last try that its structure repair answered (`structureRepairAnsweredSql`) reads OK, as
   * the PATCH or FULL row that answered it before LG-A did, so a reclaim never ends an answered site. Without a
   * structure-repair row (hosted and local never route one) every row reads as written.
   */
  async findExhaustedModelAttempt(input: {
    readonly runId: string;
    readonly workItemId: string;
    readonly contractHash: string;
    readonly maxAttempts: number;
    readonly byActor?: boolean;
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
              CASE WHEN ${structureRepairAnsweredSql("entry")} THEN 'OK' ELSE entry.outcome END AS outcome, grouped.attempt_count
       FROM ledger.ledger_entry AS entry
       JOIN (
         SELECT call_site_key, count(*)::text AS attempt_count, max(sequence) AS last_sequence
         FROM ledger.ledger_entry
         WHERE run_id = $1 AND subject_item_id = $2
           AND action_kind = 'MODEL_CALL' AND contract_hash = $3 AND outcome <> 'REFUSED'
         GROUP BY ${input.byActor === true ? "call_site_key, actor_ref" : "call_site_key"} HAVING count(*) >= $4
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

  /**
   * Model scorecard A15 — the seat-marked MODEL_CALL rows of one work item
   * (`…:seat:main` / `…:seat:runnerUp`, A15a), in ledger order. A RESUMED pass
   * re-authors every site, so it reads what earlier passes recorded here to
   * seat each root and each cross-exchange exactly as they were seated: who
   * answered a root, and which marker a cross-exchange site already holds
   * (controller ruling A14 — DR-184-v5 is exact only if both hold across
   * restarts). A run without a pinned assignment records no such key.
   *
   * Preview retry fix, option B (spec 2026-10-11 §1.2 (d)): REFUSED rows are left out, as from every
   * attempt count. A free refusal spent nothing of a seat key, and a halt may cite only a TIMED_OUT or
   * FAILED row (`migrations/0021_dr174_cooldown_prune.sql:34-38`).
   *
   * LG-A (final review C-1): a try its structure repair answered (`structureRepairAnsweredSql`) reads OK, with its own
   * artifact (the one the step kept): the seat that answered a root is restored on a resumed pass, and the writer and
   * checker that answered are found by their artifacts (A16c). The repair's own row is the repair contract's, never read
   * here. Every other row reads as written.
   */
  async readSeatMarkedModelCalls(input: {
    readonly runId: string;
    readonly workItemId: string;
    readonly contractHash: string;
  }): Promise<readonly {
    readonly callSiteKey: string;
    readonly outcome: "OK" | "FAILED" | "TIMED_OUT";
    /**
     * Model scorecard A16a: the row itself, so a resumed pass that finds a
     * site's every seat key spent can halt it, or fail the work item, citing
     * the ledger's own record (as the preflight does for an exhausted key).
     */
    readonly ledgerEntryRef: string;
    readonly attemptId: string | null;
    readonly artifactRef: string | null;
    /**
     * Model scorecard A16c (controller carry 14a): WHO answered — the route and
     * the candidate on the row. A site's `:seat:` marker is the KEY it is
     * counted under, and a cross-exchange keeps the one key it already holds
     * even when its root's writer changed, so the marker is never read as the
     * answerer.
     */
    readonly actorRef: string;
    readonly candidateId: string | null;
  }[]> {
    const result = await this.pool.query<{
      call_site_key: string;
      outcome: "OK" | "FAILED" | "TIMED_OUT";
      ledger_entry_id: string;
      attempt_id: string | null;
      raw_artifact_ref: string | null;
      actor_ref: string;
      candidate_id: string | null;
    }>(
      `SELECT entry.call_site_key,
              CASE WHEN ${structureRepairAnsweredSql("entry")} THEN 'OK' ELSE entry.outcome END AS outcome,
              entry.ledger_entry_id, entry.attempt_id, entry.raw_artifact_ref, entry.actor_ref, entry.candidate_id
       FROM ledger.ledger_entry AS entry
       WHERE entry.run_id = $1 AND entry.subject_item_id = $2
         AND entry.action_kind = 'MODEL_CALL' AND entry.contract_hash = $3 AND entry.outcome <> 'REFUSED'
         AND (entry.call_site_key LIKE '%:seat:main' OR entry.call_site_key LIKE '%:seat:runnerUp')
       ORDER BY entry.sequence`,
      [input.runId, input.workItemId, input.contractHash]
    );
    return Object.freeze(result.rows.map((row) => Object.freeze({
      callSiteKey: row.call_site_key,
      outcome: row.outcome,
      ledgerEntryRef: row.ledger_entry_id,
      attemptId: row.attempt_id,
      artifactRef: row.raw_artifact_ref,
      actorRef: row.actor_ref,
      candidateId: row.candidate_id
    })));
  }

  /**
   * The step's spent allowance: its MODEL_CALL rows under one call-site key. Preview retry fix, option B
   * (spec 2026-10-11 §1.2 (d), owner ruling R1): a REFUSED row (a provably unbilled refusal) is not an
   * attempt spent, so a free refusal never uses up a step.
   *
   * Run resilience (spec 2026-10-12, fix (b)): with `actorRef`, only that maker's rows are counted, so a step's
   * allowance on the preview is each maker's own and a fallback hop never spends the next maker's. Absent (hosted and
   * local), the query is today's, byte for byte. The run-wide ceiling (`countRunModelAttempts`) is untouched.
   */
  async countModelAttempts(input: {
    readonly runId: string | null;
    readonly workItemId: string;
    readonly contractHash: string;
    readonly callSiteKey: string;
    readonly actorRef?: string;
  }): Promise<number> {
    if (input.runId === null) return 0;
    if (input.actorRef !== undefined) {
      const mine = await this.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ledger.ledger_entry
         WHERE run_id = $1 AND subject_item_id = $2
           AND action_kind = 'MODEL_CALL' AND contract_hash = $3 AND call_site_key = $4
           AND outcome <> 'REFUSED' AND actor_ref = $5`,
        [input.runId, input.workItemId, input.contractHash, input.callSiteKey, input.actorRef]
      );
      return Number(mine.rows[0]?.count ?? 0);
    }
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ledger.ledger_entry
       WHERE run_id = $1 AND subject_item_id = $2
         AND action_kind = 'MODEL_CALL' AND contract_hash = $3 AND call_site_key = $4
         AND outcome <> 'REFUSED'`,
      [input.runId, input.workItemId, input.contractHash, input.callSiteKey]
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
