import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  allocateSequence,
  type CryptoEnvelope,
  withPublicationContentLease,
  withWriteTransaction
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { createBlindEvaluationSample } from "./blind-sample.js";
import {
  CONSUMER_PROMPT_VERSION,
  type EvaluatorConsumerClaim,
  type EvaluatorConsumerJob,
  type EvaluatorConsumerPublicSample,
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
  constructor(
    private readonly pool: Pool,
    private readonly readPublicPresentation?: (
      publicationRef: string,
      runId: string,
      envelope: CryptoEnvelope
    ) => Promise<Readonly<{
      question: string;
      answer: Readonly<{
        verdict: string | null;
        summary_segments: readonly Readonly<{ text: string }>[];
        residual_objections: readonly string[];
      }>;
    }>>
  ) {}

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

    // Phase 1 inventories only current public snapshot references here. It
    // does not decrypt any presentation until the provider operation holds
    // the publication-domain session lease for that exact reference.
    const currentPublicSnapshots = await this.pool.query<{
      publication_ref: string;
      run_id: string;
      observation_id: string;
      provider: string;
      model_id: string;
      model_version: string;
      domain_id: string | null;
    }>(`
      SELECT DISTINCT ON (
        observation.provider,observation.model_id,observation.model_version,
        observation.domain_id,snapshot.publication_ref
      ) snapshot.publication_ref,snapshot.run_id,
        observation.observation_id,observation.provider,observation.model_id,
        observation.model_version,observation.domain_id
      FROM serve.publication_snapshot AS snapshot
      JOIN LATERAL (
        SELECT event.state,event.publication_ref
        FROM core.run_visibility_event AS event
        WHERE event.run_id=snapshot.run_id
        ORDER BY event.at_seq DESC,event.run_visibility_event_id DESC
        LIMIT 1
      ) AS latest ON latest.state='PUBLISHED'
        AND latest.publication_ref=snapshot.publication_ref
      JOIN evaluator.observation AS observation ON observation.run_id=snapshot.run_id
      WHERE ($1::timestamptz IS NULL OR snapshot.created_at <= $1)
      ORDER BY observation.provider,observation.model_id,observation.model_version,
        observation.domain_id,snapshot.publication_ref,observation.observed_at DESC,
        observation.observation_id
      LIMIT 96
    `, [input.aggregateAsOf]);
    if (currentPublicSnapshots.rows.length === 0) return Object.freeze([]);
    const samplesByModelDomain = new Map<string, EvaluatorConsumerJob["blindedSamples"]>();
    if (this.readPublicPresentation !== undefined) {
      for (const row of currentPublicSnapshots.rows) {
        const key = modelDomainKey({
          provider: row.provider,
          modelId: row.model_id,
          modelVersion: row.model_version,
          domainId: row.domain_id
        });
        const current = samplesByModelDomain.get(key) ?? [];
        if (current.length >= 3) continue;
        samplesByModelDomain.set(key, Object.freeze([...current, {
          publicationRef:row.publication_ref,
          runId:row.run_id,
          sampleId:`opaque:sample-${sha256(row.publication_ref).slice(0,24)}`
        }]));
      }
    }

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
          blindedSamples: samplesByModelDomain.get(modelDomainKey({ ...identity, domainId }))
            ?? Object.freeze([]),
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

  async withPublicSampleLease<T>(
    sample: EvaluatorConsumerJob["blindedSamples"][number],
    use: (resolved: EvaluatorConsumerPublicSample) => Promise<T>
  ): Promise<T> {
    const readPublicPresentation = this.readPublicPresentation;
    if (readPublicPresentation === undefined) {
      throw new TypedDomainError(
        "CONSUMER_PUBLIC_CIPHER_UNAVAILABLE",
        "The public evaluator presentation reader is unavailable"
      );
    }
    return withPublicationContentLease(this.pool,[sample.publicationRef],async (lease) => {
      const snapshot = await lease.client.query<{
        content_ciphertext: CryptoEnvelope;
      }>(`
        SELECT snapshot.content_ciphertext
        FROM serve.publication_snapshot AS snapshot
        WHERE snapshot.publication_ref=$1 AND snapshot.run_id=$2
          AND core.run_is_published(snapshot.run_id,snapshot.publication_ref)
      `,[sample.publicationRef,sample.runId]);
      const stored = snapshot.rows[0];
      if (stored === undefined) {
        throw new TypedDomainError(
          "CONSUMER_PUBLIC_SAMPLE_UNAVAILABLE",
          "The current public evaluator sample is unavailable"
        );
      }
      const presentation = await readPublicPresentation(
        sample.publicationRef,sample.runId,stored.content_ciphertext
      );
      const taskExcerpt = presentation.answer.summary_segments[0]?.text
        ?? presentation.answer.residual_objections[0]
        ?? "Public presentation contains no textual summary.";
      const resolved = Object.freeze({
        ...sample,
        ...createBlindEvaluationSample({
          sampleId:sample.sampleId,
          questionExcerpt:presentation.question,
          taskExcerpt,
          grade:presentation.answer.verdict ?? "VERDICT_UNAVAILABLE",
          reasons:Object.freeze([])
        })
      });
      const result = await use(resolved);
      const live = await lease.client.query<{ live: boolean }>(
        "SELECT core.run_is_published($1,$2) AS live",
        [sample.runId,sample.publicationRef]
      );
      if (live.rows[0]?.live !== true) {
        throw new TypedDomainError(
          "CONSUMER_PUBLIC_SAMPLE_UNAVAILABLE",
          "The current public evaluator sample is unavailable"
        );
      }
      return result;
    });
  }

  async persistOutput(input: Parameters<EvaluatorConsumerRepository["persistOutput"]>[0]): Promise<{
    readonly consumerOutputId: string;
    readonly inserted: boolean;
  }> {
    return withWriteTransaction(this.pool, async (client) => {
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
        JSON.stringify(input.adjacentDomainFlags),null,
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
