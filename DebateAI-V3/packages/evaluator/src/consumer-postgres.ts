import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { allocateSequence, withWriteTransaction } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { createBlindEvaluationSample } from "./blind-sample.js";
import {
  CONSUMER_PROMPT_VERSION,
  type EvaluatorConsumerClaim,
  type EvaluatorConsumerJob,
  type EvaluatorConsumerReceiptInput,
  type EvaluatorConsumerRefreshTrigger,
  type EvaluatorConsumerRepository
} from "./consumer.js";

type Step = "AUTHORING" | "JUDGING" | "REVIEWING";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function jobKey(job: EvaluatorConsumerJob, aggregateSnapshotHash: string): string {
  return JSON.stringify([
    job.consumerSelectionId,
    job.target.provider,
    job.target.modelId,
    job.target.modelVersion,
    job.domain?.domainId ?? null,
    CONSUMER_PROMPT_VERSION,
    aggregateSnapshotHash
  ]);
}

function modelKey(input: { readonly provider: string; readonly modelId: string; readonly modelVersion: string }): string {
  return JSON.stringify([input.provider, input.modelId, input.modelVersion]);
}

function modelDomainKey(input: {
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly domainId: string | null;
}): string {
  return JSON.stringify([input.provider, input.modelId, input.modelVersion, input.domainId]);
}

export class PostgresEvaluatorConsumerRepository implements EvaluatorConsumerRepository {
  constructor(private readonly pool: Pool) {}

  async listJobs(input: {
    readonly trigger: EvaluatorConsumerRefreshTrigger;
    readonly aggregateAsOf: Date | null;
    readonly observedAt: Date;
  }): Promise<readonly EvaluatorConsumerJob[]> {
    const selection = await this.pool.query<{
      consumer_selection_id: string;
      model_id: string;
    }>(`
      SELECT selection.consumer_selection_id,selection.model_id
      FROM evaluator.consumer_selection AS selection
      JOIN evaluator.vllm_probe AS probe ON probe.vllm_probe_id=selection.vllm_probe_id
      WHERE probe.state='AVAILABLE'
      ORDER BY selection.at_seq DESC
      LIMIT 1
    `);
    const selected = selection.rows[0];
    if (selected === undefined) return Object.freeze([]);

    const cells = await this.pool.query<{
      profile_cell_id: string;
      provider: string;
      model_id: string;
      model_version: string;
      domain_id: string | null;
      step: Step;
      metric: string;
      value: number | null;
      n: number;
      interval_lower: number | null;
      interval_upper: number | null;
      basis: "MEASURED_PROCESS" | "MEASURED_OUTCOME" | "NONE";
      derivation_version: string;
    }>(`
      SELECT DISTINCT ON (
        provider,model_id,model_version,domain_id,step,metric
      ) profile_cell_id,provider,model_id,model_version,domain_id,step,metric,
        value,n,interval_lower,interval_upper,basis,derivation_version
      FROM evaluator.profile_cell
      WHERE ($1::timestamptz IS NULL OR as_of <= $1)
      ORDER BY provider,model_id,model_version,domain_id,step,metric,
        as_of DESC,derivation_version DESC,at_seq DESC
    `, [input.aggregateAsOf]);
    if (cells.rows.length === 0) return Object.freeze([]);

    const ranks = await this.pool.query<{
      rank_snapshot_id: string;
      rank_kind: "JUDGE" | "PROWESS";
      provider: string;
      model_id: string;
      model_version: string;
      domain_id: string | null;
      step: Step;
      metric: string;
      ordinal: number;
      score: number;
      n: number;
      interval_lower: number | null;
      interval_upper: number | null;
      derivation_version: string;
    }>(`
      SELECT DISTINCT ON (
        rank_kind,provider,model_id,model_version,domain_id,step,metric
      ) rank_snapshot_id,rank_kind,provider,model_id,model_version,domain_id,
        step,metric,ordinal,score,n,interval_lower,interval_upper,derivation_version
      FROM evaluator.rank_snapshot
      WHERE ($1::timestamptz IS NULL OR as_of <= $1)
      ORDER BY rank_kind,provider,model_id,model_version,domain_id,step,metric,
        as_of DESC,derivation_version DESC,at_seq DESC
    `, [input.aggregateAsOf]);
    const domains = await this.pool.query<{ domain_id: string; canonical_name: string }>(`
      SELECT domain_id,canonical_name FROM evaluator.domain ORDER BY normalized_name,domain_id
    `);
    const domainNames = new Map(domains.rows.map((row) => [row.domain_id, row.canonical_name]));
    const adjacentDomains = domains.rows.map((row) => Object.freeze({
      domainId: row.domain_id,
      domainRef: `opaque:domain-${sha256(row.domain_id).slice(0, 24)}`,
      name: row.canonical_name
    }));

    const samples = await this.pool.query<{
      observation_id: string;
      provider: string;
      model_id: string;
      model_version: string;
      domain_id: string | null;
      question_line: string;
      claim_text: string;
      tau: number;
      number_kind: string;
    }>(`
      SELECT observation.observation_id,observation.provider,observation.model_id,
        observation.model_version,observation.domain_id,run.question_line,node.claim_text,
        judgement.tau,judgement.number_kind
      FROM evaluator.observation AS observation
      JOIN ledger.reduced_judgement AS judgement
        ON judgement.reduced_judgement_id::text=observation.source_ref
      JOIN core.node AS node ON node.node_id=judgement.node_id
      JOIN core.run AS run ON run.run_id=observation.run_id
      WHERE observation.source_kind='REDUCED_JUDGEMENT'
        AND ($1::timestamptz IS NULL OR observation.observed_at <= $1)
      ORDER BY observation.at_seq DESC,observation.observation_id
    `, [input.aggregateAsOf]);
    const samplesByModelDomain = new Map<string, EvaluatorConsumerJob["blindedSamples"]>();
    for (const row of samples.rows) {
      const key = modelDomainKey({
        provider: row.provider,
        modelId: row.model_id,
        modelVersion: row.model_version,
        domainId: row.domain_id
      });
      const current = samplesByModelDomain.get(key) ?? [];
      if (current.length >= 3) continue;
      samplesByModelDomain.set(key, Object.freeze([...current, createBlindEvaluationSample({
        sampleId: `opaque:sample-${sha256(row.observation_id).slice(0, 24)}`,
        questionExcerpt: row.question_line,
        taskExcerpt: row.claim_text,
        grade: `${row.tau} (${row.number_kind})`,
        reasons: Object.freeze([])
      })]));
    }

    const identities = new Map<string, {
      readonly provider: string;
      readonly modelId: string;
      readonly modelVersion: string;
      readonly domainIds: Set<string | null>;
    }>();
    for (const row of cells.rows) {
      const identity = {
        provider: row.provider,
        modelId: row.model_id,
        modelVersion: row.model_version
      };
      const key = modelKey(identity);
      const current = identities.get(key) ?? { ...identity, domainIds: new Set<string | null>() };
      current.domainIds.add(row.domain_id);
      identities.set(key, current);
    }

    const jobs: EvaluatorConsumerJob[] = [];
    for (const identity of identities.values()) {
      const domainIds = identity.domainIds.size === 0 ? [null] : [...identity.domainIds].sort();
      for (const domainId of domainIds) {
        const matchingCells = cells.rows.filter((row) => modelKey({
          provider: row.provider, modelId: row.model_id, modelVersion: row.model_version
        }) === modelKey(identity) && (row.domain_id === domainId
          || (domainId !== null && row.domain_id === null && row.metric.startsWith("bias."))));
        const matchingRanks = ranks.rows.filter((row) => modelKey({
          provider: row.provider, modelId: row.model_id, modelVersion: row.model_version
        }) === modelKey(identity) && (row.domain_id === domainId
          || (domainId !== null && row.domain_id === null && row.rank_kind === "JUDGE")));
        jobs.push(Object.freeze({
          consumerSelectionId: selected.consumer_selection_id,
          consumerModelId: selected.model_id,
          target: Object.freeze(identity),
          domain: domainId === null ? null : Object.freeze({
            domainId,
            name: domainNames.get(domainId) ?? "Unknown domain"
          }),
          profileCells: Object.freeze(matchingCells.map((row) => Object.freeze({
            profileCellId: row.profile_cell_id,
            step: row.step,
            metric: row.metric,
            value: row.value,
            n: row.n,
            intervalLower: row.interval_lower,
            intervalUpper: row.interval_upper,
            basis: row.basis,
            derivationVersion: Number(row.derivation_version)
          }))),
          ranks: Object.freeze(matchingRanks.map((row) => Object.freeze({
            rankSnapshotId: row.rank_snapshot_id,
            rankKind: row.rank_kind,
            step: row.step,
            metric: row.metric,
            ordinal: row.ordinal,
            score: row.score,
            n: row.n,
            intervalLower: row.interval_lower,
            intervalUpper: row.interval_upper,
            derivationVersion: Number(row.derivation_version)
          }))),
          blindedSamples: samplesByModelDomain.get(modelDomainKey({ ...identity, domainId })) ?? Object.freeze([]),
          adjacentDomains: Object.freeze(adjacentDomains
            .filter((domain) => domain.domainId !== domainId)
            .map(({ domainRef, name }) => Object.freeze({ domainRef, name })))
        }));
      }
    }
    return Object.freeze(jobs.sort((left, right) => JSON.stringify([
      left.target.provider,left.target.modelId,left.target.modelVersion,left.domain?.domainId ?? null
    ]).localeCompare(JSON.stringify([
      right.target.provider,right.target.modelId,right.target.modelVersion,right.domain?.domainId ?? null
    ]))));
  }

  async claimJob(
    job: EvaluatorConsumerJob,
    input: {
      readonly trigger: EvaluatorConsumerRefreshTrigger;
      readonly attemptId: string;
      readonly inputHash: string;
      readonly aggregateSnapshotHash: string;
      readonly observedAt: Date;
      readonly maxRefreshAttempts: number;
    }
  ): Promise<EvaluatorConsumerClaim> {
    return withWriteTransaction(this.pool, async (client) => {
      const lock = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired",
        [`evaluator-consumer:${jobKey(job, input.aggregateSnapshotHash)}`]
      );
      if (lock.rows[0]?.acquired !== true) {
        const receiptId = await this.insertJobReceipt(client, job, {
          ...input,
          attemptOrdinal: 0,
          state: "SKIPPED",
          reason: "CONSUMER_REFRESH_IN_FLIGHT"
        });
        return Object.freeze({ state: "IN_FLIGHT" as const, receiptId });
      }
      const existing = await client.query<{ consumer_output_id: string }>(`
        SELECT consumer_output_id FROM evaluator.consumer_output
        WHERE consumer_selection_id=$1 AND target_provider=$2 AND target_model_id=$3
          AND target_model_version=$4 AND domain_id IS NOT DISTINCT FROM $5
          AND prompt_version=$6 AND aggregate_snapshot_hash=$7
        LIMIT 1
      `, [
        job.consumerSelectionId,job.target.provider,job.target.modelId,job.target.modelVersion,
        job.domain?.domainId ?? null,CONSUMER_PROMPT_VERSION,input.aggregateSnapshotHash
      ]);
      if (existing.rows[0] !== undefined) {
        const receiptId = await this.insertJobReceipt(client, job, {
          ...input,
          attemptOrdinal: 0,
          state: "SKIPPED",
          reason: "CONSUMER_OUTPUT_ALREADY_CURRENT"
        });
        return Object.freeze({ state: "ALREADY_CURRENT" as const, receiptId });
      }
      const attempts = await client.query<{
        attempt_id: string;
        attempt_ordinal: number;
        terminal_state: string | null;
      }>(`
        SELECT started.attempt_id,started.attempt_ordinal,terminal.state AS terminal_state
        FROM evaluator.consumer_refresh_receipt AS started
        LEFT JOIN evaluator.consumer_refresh_receipt AS terminal
          ON terminal.attempt_id=started.attempt_id
          AND terminal.state IN ('SUCCEEDED','FAILED','SKIPPED')
        WHERE started.consumer_selection_id=$1 AND started.target_provider=$2
          AND started.target_model_id=$3 AND started.target_model_version=$4
          AND started.domain_id IS NOT DISTINCT FROM $5 AND started.prompt_version=$6
          AND started.aggregate_snapshot_hash=$7 AND started.state='STARTED'
        ORDER BY started.attempt_ordinal,started.at_seq
      `, [
        job.consumerSelectionId,job.target.provider,job.target.modelId,job.target.modelVersion,
        job.domain?.domainId ?? null,CONSUMER_PROMPT_VERSION,input.aggregateSnapshotHash
      ]);
      const active = attempts.rows.find((row) => row.terminal_state === null);
      if (active !== undefined) {
        const receiptId = await this.insertJobReceipt(client, job, {
          ...input,
          attemptOrdinal: 0,
          state: "SKIPPED",
          reason: "CONSUMER_REFRESH_IN_FLIGHT"
        });
        return Object.freeze({ state: "IN_FLIGHT" as const, receiptId });
      }
      const failed = attempts.rows.filter((row) => row.terminal_state === "FAILED").length;
      if (failed >= input.maxRefreshAttempts) {
        const receiptId = await this.insertJobReceipt(client, job, {
          ...input,
          attemptOrdinal: 0,
          state: "SKIPPED",
          reason: "CONSUMER_RETRY_LIMIT_REACHED"
        });
        return Object.freeze({ state: "RETRY_LIMIT_REACHED" as const, receiptId });
      }
      const attemptOrdinal = Math.max(0, ...attempts.rows.map((row) => row.attempt_ordinal)) + 1;
      const receiptId = await this.insertJobReceipt(client, job, {
        ...input,
        attemptOrdinal,
        state: "STARTED",
        reason: "CONSUMER_REFRESH_STARTED"
      });
      return Object.freeze({
        state: "CLAIMED" as const,
        attemptId: input.attemptId,
        attemptOrdinal,
        receiptId
      });
    });
  }

  async recordPreflightReceipt(input: {
    readonly trigger: EvaluatorConsumerRefreshTrigger;
    readonly attemptId: string;
    readonly state: "FAILED" | "SKIPPED";
    readonly reason: string;
    readonly inputHash: string;
    readonly observedAt: Date;
  }): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const result = await client.query<{ consumer_refresh_receipt_id: string }>(`
        INSERT INTO evaluator.consumer_refresh_receipt (
          trigger,prompt_version,attempt_id,attempt_ordinal,state,reason,input_hash,
          observed_at,at_seq
        ) VALUES ($1,$2,$3,0,$4,$5,$6,$7,$8)
        RETURNING consumer_refresh_receipt_id
      `, [
        input.trigger,CONSUMER_PROMPT_VERSION,input.attemptId,input.state,input.reason,
        input.inputHash,input.observedAt,await allocateSequence(client)
      ]);
      return result.rows[0]!.consumer_refresh_receipt_id;
    });
  }

  async recordTerminalReceipt(input: EvaluatorConsumerReceiptInput): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => this.insertJobReceipt(client, input.job, input));
  }

  async persistOutput(input: Parameters<EvaluatorConsumerRepository["persistOutput"]>[0]): Promise<{
    readonly consumerOutputId: string;
    readonly inserted: boolean;
  }> {
    return withWriteTransaction(this.pool, async (client) => {
      const artifact = await client.query<{ raw_artifact_id: string }>(`
        SELECT raw_artifact_id FROM ledger.raw_artifact
        WHERE raw_artifact_id=$1 AND run_id IS NULL
          AND provider_ref=$2 AND maker=$3 AND model_id=$4
      `, [
        input.generatedRawArtifactRef,input.family.value.providerRef,
        input.family.value.maker,input.job.consumerModelId
      ]);
      if (artifact.rows[0] === undefined) {
        throw new TypedDomainError(
          "CONSUMER_AUTHORIZATION_FAILED",
          "CONSUMER_AUTHORIZATION_FAILED: generated artifact does not match the selected family"
        );
      }
      const inserted = await client.query<{ consumer_output_id: string }>(`
        INSERT INTO evaluator.consumer_output (
          consumer_selection_id,target_provider,target_model_id,target_model_version,
          domain_id,prompt_version,aggregate_snapshot_hash,aggregate_refs,
          blinded_sample_refs,summary,adjacent_domain_flags,generated_raw_artifact_ref,at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12,$13)
        ON CONFLICT DO NOTHING RETURNING consumer_output_id
      `, [
        input.job.consumerSelectionId,input.job.target.provider,input.job.target.modelId,
        input.job.target.modelVersion,input.job.domain?.domainId ?? null,input.promptVersion,
        input.aggregateSnapshotHash,JSON.stringify(input.aggregateRefs),
        JSON.stringify(input.blindedSampleRefs),input.summary,
        JSON.stringify(input.adjacentDomainFlags),input.generatedRawArtifactRef,
        await allocateSequence(client)
      ]);
      const insertedId = inserted.rows[0]?.consumer_output_id;
      if (insertedId !== undefined) return Object.freeze({ consumerOutputId: insertedId, inserted: true });
      const existing = await client.query<{ consumer_output_id: string }>(`
        SELECT consumer_output_id FROM evaluator.consumer_output
        WHERE consumer_selection_id=$1 AND target_provider=$2 AND target_model_id=$3
          AND target_model_version=$4 AND domain_id IS NOT DISTINCT FROM $5
          AND prompt_version=$6 AND aggregate_snapshot_hash=$7
      `, [
        input.job.consumerSelectionId,input.job.target.provider,input.job.target.modelId,
        input.job.target.modelVersion,input.job.domain?.domainId ?? null,input.promptVersion,
        input.aggregateSnapshotHash
      ]);
      const consumerOutputId = existing.rows[0]?.consumer_output_id;
      if (consumerOutputId === undefined) throw new TypeError("CONSUMER_OUTPUT_WRITE_FAILED");
      return Object.freeze({ consumerOutputId, inserted: false });
    });
  }

  private async insertJobReceipt(
    client: PoolClient,
    job: EvaluatorConsumerJob,
    input: {
      readonly trigger: EvaluatorConsumerRefreshTrigger;
      readonly attemptId: string;
      readonly attemptOrdinal: number;
      readonly state: "STARTED" | "SUCCEEDED" | "FAILED" | "SKIPPED";
      readonly reason: string;
      readonly inputHash: string;
      readonly aggregateSnapshotHash: string;
      readonly observedAt: Date;
      readonly consumerOutputId?: string;
    }
  ): Promise<string> {
    const result = await client.query<{ consumer_refresh_receipt_id: string }>(`
      INSERT INTO evaluator.consumer_refresh_receipt (
        consumer_selection_id,target_provider,target_model_id,target_model_version,
        domain_id,trigger,prompt_version,aggregate_snapshot_hash,attempt_id,
        attempt_ordinal,state,reason,input_hash,consumer_output_id,observed_at,at_seq
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING consumer_refresh_receipt_id
    `, [
      job.consumerSelectionId,job.target.provider,job.target.modelId,job.target.modelVersion,
      job.domain?.domainId ?? null,input.trigger,CONSUMER_PROMPT_VERSION,
      input.aggregateSnapshotHash,input.attemptId,input.attemptOrdinal,input.state,input.reason,
      input.inputHash,input.consumerOutputId ?? null,input.observedAt,await allocateSequence(client)
    ]);
    return result.rows[0]!.consumer_refresh_receipt_id;
  }
}
