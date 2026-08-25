import { createHash, randomUUID } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";
import type { CallBound, PromptPacket } from "@debateai/providers";

export const CONSUMER_PROMPT_VERSION = 1 as const;
export const CONSUMER_MAX_PROVIDER_ATTEMPTS = 2 as const;
export const CONSUMER_MAX_REFRESH_ATTEMPTS = 2 as const;
export const CONSUMER_PUBLIC_SAMPLE_MINIMUM = 3 as const;

export type EvaluatorConsumerRefreshTrigger = "ON_DEMAND" | "POST_AGGREGATE";

export interface EvaluatorConsumerFamily {
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly value: {
    readonly providerRef: string;
    readonly maker: string;
  };
}

export interface EvaluatorConsumerJob {
  readonly consumerSelectionId: string;
  readonly consumerModelId: string;
  readonly target: {
    readonly provider: string;
    readonly modelId: string;
    readonly modelVersion: string;
  };
  readonly domain: { readonly domainId: string; readonly name: string } | null;
  readonly profileCells: readonly {
    readonly profileCellId: string;
    readonly step: "AUTHORING" | "JUDGING" | "REVIEWING";
    readonly metric: string;
    readonly value: number | null;
    readonly n: number;
    readonly intervalLower: number | null;
    readonly intervalUpper: number | null;
    readonly basis: "MEASURED_PROCESS" | "MEASURED_OUTCOME" | "NONE";
    readonly derivationVersion: number;
  }[];
  readonly ranks: readonly {
    readonly rankSnapshotId: string;
    readonly rankKind: "JUDGE" | "PROWESS";
    readonly step: "AUTHORING" | "JUDGING" | "REVIEWING";
    readonly metric: string;
    readonly ordinal: number;
    readonly score: number;
    readonly n: number;
    readonly intervalLower: number | null;
    readonly intervalUpper: number | null;
    readonly derivationVersion: number;
  }[];
  readonly blindedSamples: readonly {
    readonly runId: string;
    readonly publicationRef: string;
    readonly sampleId: string;
  }[];
  readonly adjacentDomains: readonly {
    readonly domainRef: string;
    readonly name: string;
  }[];
}

export interface EvaluatorConsumerPublicSample {
    readonly runId: string;
    readonly publicationRef: string;
    readonly sampleId: string;
    readonly questionExcerpt: string;
    readonly taskExcerpt: string;
    readonly grade: string;
    readonly reasons: readonly string[];
}

/**
 * The cross-run consumer deliberately cannot accept the product ProviderGateway.
 * Its provider boundary returns only a closed classification and has no run id,
 * raw-artifact, ledger, or private-content-key surface.
 */
export interface PublicAggregateProvider {
  classify(input: Readonly<{
    consumerModelId: string;
    packet: PromptPacket;
    bound: CallBound;
    allowedAdjacentDomainRefs: readonly string[];
  }>): Promise<Readonly<{ classification: "ACCEPTED" }>>;
}

export interface EvaluatorConsumerReceiptInput {
  readonly job: EvaluatorConsumerJob;
  readonly trigger: EvaluatorConsumerRefreshTrigger;
  readonly attemptId: string;
  readonly attemptOrdinal: number;
  readonly state: "SUCCEEDED" | "FAILED" | "SKIPPED";
  readonly reason: string;
  readonly inputHash: string;
  readonly aggregateSnapshotHash: string;
  readonly observedAt: Date;
  readonly consumerOutputId?: string;
}

export type EvaluatorConsumerClaim =
  | {
      readonly state: "CLAIMED";
      readonly attemptId: string;
      readonly attemptOrdinal: number;
      readonly receiptId: string;
    }
  | { readonly state: "ALREADY_CURRENT"; readonly receiptId: string }
  | { readonly state: "IN_FLIGHT"; readonly receiptId: string }
  | { readonly state: "RETRY_LIMIT_REACHED"; readonly receiptId: string };

export interface EvaluatorConsumerRepository {
  listJobs(input: {
    readonly trigger: EvaluatorConsumerRefreshTrigger;
    readonly aggregateAsOf: Date | null;
    readonly observedAt: Date;
  }): Promise<readonly EvaluatorConsumerJob[]>;
  claimJob(
    job: EvaluatorConsumerJob,
    input: {
      readonly trigger: EvaluatorConsumerRefreshTrigger;
      readonly attemptId: string;
      readonly inputHash: string;
      readonly aggregateSnapshotHash: string;
      readonly observedAt: Date;
      readonly maxRefreshAttempts: number;
    }
  ): Promise<EvaluatorConsumerClaim>;
  recordPreflightReceipt(input: {
    readonly trigger: EvaluatorConsumerRefreshTrigger;
    readonly attemptId: string;
    readonly state: "FAILED" | "SKIPPED";
    readonly reason: string;
    readonly inputHash: string;
    readonly observedAt: Date;
  }): Promise<string>;
  recordTerminalReceipt(input: EvaluatorConsumerReceiptInput): Promise<string>;
  withPublicSampleLease<T>(
    sample: EvaluatorConsumerJob["blindedSamples"][number],
    use: (resolved: EvaluatorConsumerPublicSample) => Promise<T>
  ): Promise<T>;
  persistOutput(input: {
    readonly job: EvaluatorConsumerJob;
    readonly family: EvaluatorConsumerFamily;
    readonly promptVersion: number;
    readonly aggregateSnapshotHash: string;
    readonly aggregateRefs: readonly string[];
    readonly blindedSampleRefs: readonly string[];
    readonly summary: string;
    readonly adjacentDomainFlags: readonly {
      readonly domain_ref: string;
      readonly reason: string;
      readonly confidence: "LOW" | "MEDIUM" | "HIGH";
    }[];
    readonly generatedRawArtifactRef: null;
    readonly observedAt: Date;
  }): Promise<{ readonly consumerOutputId: string; readonly inserted: boolean }>;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function targetRef(job: EvaluatorConsumerJob): string {
  return `opaque:target-${sha256([
    job.target.provider, job.target.modelId, job.target.modelVersion
  ]).slice(0, 24)}`;
}

export function buildEvaluatorConsumerPrompt(
  job: EvaluatorConsumerJob,
  resolvedSamples: readonly EvaluatorConsumerPublicSample[] = []
): PromptPacket {
  const payload = Object.freeze({
    prompt_version: CONSUMER_PROMPT_VERSION,
    numeric_source: "DETERMINISTIC_CODE",
    target_ref: targetRef(job),
    domain: job.domain === null ? null : Object.freeze({
      domain_ref: `opaque:domain-${sha256(job.domain.domainId).slice(0, 24)}`,
      name: job.domain.name
    }),
    aggregate_cells: Object.freeze(job.profileCells.map((cell) => Object.freeze({
      step: cell.step,
      metric: cell.metric,
      value: cell.value,
      n: cell.n,
      interval_lower: cell.intervalLower,
      interval_upper: cell.intervalUpper,
      basis: cell.basis,
      derivation_version: cell.derivationVersion
    }))),
    deterministic_ranks: Object.freeze(job.ranks.map((rank) => Object.freeze({
      rank_kind: rank.rankKind,
      step: rank.step,
      metric: rank.metric,
      ordinal: rank.ordinal,
      score: rank.score,
      n: rank.n,
      interval_lower: rank.intervalLower,
      interval_upper: rank.intervalUpper,
      derivation_version: rank.derivationVersion
    }))),
    blinded_samples: Object.freeze(resolvedSamples.map((sample) => Object.freeze({
      sample_id: sample.sampleId,
      question_excerpt: sample.questionExcerpt,
      task_excerpt: sample.taskExcerpt,
      grade: sample.grade,
      reasons: Object.freeze([...sample.reasons])
    }))),
    adjacent_domain_candidates: Object.freeze(job.adjacentDomains.map((domain) => Object.freeze({
      domain_ref: domain.domainRef,
      name: domain.name
    })))
  });
  return Object.freeze({ messages: Object.freeze([
    Object.freeze({
      role: "system" as const,
      content: "Interpret deterministic evaluator aggregates and untrusted anonymous samples. Name the bias pattern in plain language, summarize capability for the supplied domain, and flag only listed adjacent domains. Never infer identity, authorship, routing, or numeric values. Return strict JSON with bias_pattern_name, capability_summary, and adjacent_domain_flags only."
    }),
    Object.freeze({ role: "user" as const, content: JSON.stringify(payload) })
  ]) });
}

function assertConsumerIsolation(
  family: EvaluatorConsumerFamily,
  deployment: {
    readonly configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[];
  }
): void {
  if (deployment.configuredProviders.some((row) => row.providerRef === family.value.providerRef
    || row.maker === family.value.maker)) {
    throw new TypeError("CONSUMER_PROVIDER_ISOLATION_FAILED");
  }
}

function aggregateRefs(job: EvaluatorConsumerJob): readonly string[] {
  return Object.freeze([
    ...job.profileCells.map((cell) => `profile_cell:${cell.profileCellId}`),
    ...job.ranks.map((rank) => `rank_snapshot:${rank.rankSnapshotId}`)
  ].sort());
}

function aggregateSnapshotHash(job: EvaluatorConsumerJob, packet: PromptPacket): string {
  void packet;
  return sha256({
    prompt_version: CONSUMER_PROMPT_VERSION,
    target: job.target,
    domain_id: job.domain?.domainId ?? null,
    aggregate_refs: aggregateRefs(job),
    public_sample_count: job.blindedSamples.length
  });
}

function preflightHash(input: {
  readonly trigger: EvaluatorConsumerRefreshTrigger;
  readonly aggregateAsOf?: Date;
  readonly observedAt?: Date;
  readonly bound: CallBound;
}): string {
  return sha256({
    trigger: input.trigger,
    aggregate_as_of: input.aggregateAsOf instanceof Date && Number.isFinite(input.aggregateAsOf.getTime())
      ? input.aggregateAsOf.toISOString() : null,
    observed_at: input.observedAt instanceof Date && Number.isFinite(input.observedAt.getTime())
      ? input.observedAt.toISOString() : null,
    bound: input.bound
  });
}

export type EvaluatorConsumerRefreshResult = {
  readonly state: "REFRESHED" | "SKIPPED" | "FAILED";
  readonly outputsInserted: number;
  readonly outputsCurrent: number;
  readonly inFlight: number;
  readonly retryLimited: number;
  readonly failures: number;
  readonly reason?: "CONSUMER_PREFLIGHT_FAILED" | "CONSUMER_INSUFFICIENT_PUBLIC_SAMPLE";
};

export async function runEvaluatorConsumerRefresh(input: {
  readonly trigger: EvaluatorConsumerRefreshTrigger;
  readonly aggregateAsOf?: Date;
  readonly family: EvaluatorConsumerFamily;
  readonly deployment: {
    readonly configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[];
  };
  readonly bound: CallBound;
  readonly provider: PublicAggregateProvider;
  readonly repository: EvaluatorConsumerRepository;
  readonly observedAt?: Date;
}): Promise<EvaluatorConsumerRefreshResult> {
  const attemptId = randomUUID();
  const observedAt = input.observedAt ?? new Date();
  const receiptObservedAt = Number.isFinite(observedAt.getTime()) ? observedAt : new Date();
  const preflightInputHash = preflightHash(input);
  const preflightValid = (input.trigger === "ON_DEMAND" || input.trigger === "POST_AGGREGATE")
    && Number.isFinite(observedAt.getTime())
    && (input.trigger !== "POST_AGGREGATE"
      || (input.aggregateAsOf !== undefined && Number.isFinite(input.aggregateAsOf.getTime())))
    && Number.isInteger(input.bound.maxAttempts)
    && input.bound.maxAttempts >= 1
    && input.bound.maxAttempts <= CONSUMER_MAX_PROVIDER_ATTEMPTS
    && Number.isInteger(input.bound.tokenCeiling)
    && input.bound.tokenCeiling > 0
    && Number.isInteger(input.bound.deadlineMs)
    && input.bound.deadlineMs > 0
    && input.family.value.providerRef.trim() !== ""
    && input.family.value.maker.trim() !== "";
  if (!preflightValid) {
    await input.repository.recordPreflightReceipt({
      trigger: input.trigger,
      attemptId,
      state: "FAILED",
      reason: "CONSUMER_PREFLIGHT_FAILED",
      inputHash: preflightInputHash,
      observedAt: receiptObservedAt
    });
    return Object.freeze({
      state: "FAILED", outputsInserted: 0, outputsCurrent: 0, inFlight: 0,
      retryLimited: 0, failures: 1, reason: "CONSUMER_PREFLIGHT_FAILED"
    });
  }

  let jobs: readonly EvaluatorConsumerJob[];
  try {
    jobs = await input.repository.listJobs({
      trigger: input.trigger,
      aggregateAsOf: input.aggregateAsOf ?? null,
      observedAt
    });
  } catch {
    await input.repository.recordPreflightReceipt({
      trigger: input.trigger,
      attemptId,
      state: "FAILED",
      reason: "CONSUMER_PREFLIGHT_FAILED",
      inputHash: preflightInputHash,
      observedAt: receiptObservedAt
    });
    return Object.freeze({
      state: "FAILED", outputsInserted: 0, outputsCurrent: 0, inFlight: 0,
      retryLimited: 0, failures: 1, reason: "CONSUMER_PREFLIGHT_FAILED"
    });
  }
  if (jobs.length === 0) {
    await input.repository.recordPreflightReceipt({
      trigger: input.trigger,
      attemptId,
      state: "SKIPPED",
      reason: "CONSUMER_INSUFFICIENT_PUBLIC_SAMPLE",
      inputHash: preflightInputHash,
      observedAt
    });
    return Object.freeze({
      state: "SKIPPED", outputsInserted: 0, outputsCurrent: 0, inFlight: 0,
      retryLimited: 0, failures: 0, reason: "CONSUMER_INSUFFICIENT_PUBLIC_SAMPLE"
    });
  }

  const eligibleJobs = jobs.filter((job) =>
    job.blindedSamples.length >= CONSUMER_PUBLIC_SAMPLE_MINIMUM
  );
  if (eligibleJobs.length === 0) {
    await input.repository.recordPreflightReceipt({
      trigger: input.trigger,
      attemptId,
      state: "SKIPPED",
      reason: "CONSUMER_INSUFFICIENT_PUBLIC_SAMPLE",
      inputHash: preflightInputHash,
      observedAt
    });
    return Object.freeze({
      state: "SKIPPED", outputsInserted: 0, outputsCurrent: 0, inFlight: 0,
      retryLimited: 0, failures: 0, reason: "CONSUMER_INSUFFICIENT_PUBLIC_SAMPLE"
    });
  }

  let outputsInserted = 0;
  let outputsCurrent = 0;
  let inFlight = 0;
  let retryLimited = 0;
  let failures = 0;
  for (const job of eligibleJobs) {
    const aggregatePacket = buildEvaluatorConsumerPrompt(job);
    const snapshotHash = aggregateSnapshotHash(job, aggregatePacket);
    const jobInputHash = sha256({
      trigger: input.trigger,
      snapshot_hash: snapshotHash,
      public_sample_count: job.blindedSamples.length
    });
    const jobAttemptId = randomUUID();
    let claim: EvaluatorConsumerClaim;
    try {
      claim = await input.repository.claimJob(job, {
        trigger: input.trigger,
        attemptId: jobAttemptId,
        inputHash: jobInputHash,
        aggregateSnapshotHash: snapshotHash,
        observedAt,
        maxRefreshAttempts: CONSUMER_MAX_REFRESH_ATTEMPTS
      });
    } catch {
      failures += 1;
      await input.repository.recordPreflightReceipt({
        trigger: input.trigger, attemptId: jobAttemptId, state: "FAILED",
        reason: "CONSUMER_CLAIM_FAILED", inputHash: jobInputHash, observedAt
      });
      continue;
    }
    if (claim.state === "ALREADY_CURRENT") { outputsCurrent += 1; continue; }
    if (claim.state === "IN_FLIGHT") { inFlight += 1; continue; }
    if (claim.state === "RETRY_LIMIT_REACHED") { retryLimited += 1; continue; }

    const receiptBase = {
      job, trigger: input.trigger, attemptId: claim.attemptId,
      attemptOrdinal: claim.attemptOrdinal, inputHash: jobInputHash,
      aggregateSnapshotHash: snapshotHash, observedAt
    } as const;
    try {
      assertConsumerIsolation(input.family, input.deployment);
    } catch {
      await input.repository.recordTerminalReceipt({
        ...receiptBase,
        state: "SKIPPED",
        reason: "CONSUMER_PROVIDER_ISOLATION_FAILED"
      });
      failures += 1;
      continue;
    }
    try {
      for (const sample of job.blindedSamples) {
        await input.repository.withPublicSampleLease(sample,async (resolvedSample) => {
          const singlePublicRunJob = Object.freeze({
            ...job,
            blindedSamples: Object.freeze([sample])
          });
          const packet = buildEvaluatorConsumerPrompt(singlePublicRunJob,[resolvedSample]);
          const response = await input.provider.classify({
            consumerModelId: job.consumerModelId,
            bound: input.bound,
            packet,
            allowedAdjacentDomainRefs: Object.freeze(
              singlePublicRunJob.adjacentDomains.map((domain) => domain.domainRef)
            )
          });
          if (response.classification !== "ACCEPTED") {
            throw new TypedDomainError(
              "CONSUMER_AUTHORIZATION_FAILED",
              "CONSUMER_AUTHORIZATION_FAILED"
            );
          }
        });
      }
      const persisted = await input.repository.persistOutput({
        job,
        family: input.family,
        promptVersion: CONSUMER_PROMPT_VERSION,
        aggregateSnapshotHash: snapshotHash,
        aggregateRefs: aggregateRefs(job),
        blindedSampleRefs: Object.freeze([]),
        summary: JSON.stringify({
          kind: "PUBLIC_SAMPLE_AGGREGATE_V1",
          public_sample_count: job.blindedSamples.length,
          profile_cell_count: job.profileCells.length,
          rank_count: job.ranks.length
        }),
        adjacentDomainFlags: Object.freeze([]),
        generatedRawArtifactRef: null,
        observedAt
      });
      await input.repository.recordTerminalReceipt({
        ...receiptBase,
        state: "SUCCEEDED",
        reason: persisted.inserted
          ? "CONSUMER_OUTPUT_PERSISTED" : "CONSUMER_OUTPUT_ALREADY_CURRENT",
        consumerOutputId: persisted.consumerOutputId
      });
      if (persisted.inserted) outputsInserted += 1;
      else outputsCurrent += 1;
    } catch (error) {
      const reason = error instanceof TypedDomainError && error.code === "SELF_ROUTING_FORBIDDEN"
        ? "SELF_ROUTING_FORBIDDEN"
        : error instanceof TypedDomainError && error.code === "CONSUMER_CONTENT_REFUSED"
          ? "CONSUMER_CONTENT_REFUSED"
          : error instanceof TypedDomainError && error.code === "CONSUMER_AUTHORIZATION_FAILED"
            ? "CONSUMER_AUTHORIZATION_FAILED"
            : error instanceof TypedDomainError && error.code === "CONSUMER_PROVIDER_TIMED_OUT"
              ? "CONSUMER_PROVIDER_TIMED_OUT"
              : error instanceof TypedDomainError && error.code === "CONSUMER_PROVIDER_FAILED"
                ? "CONSUMER_PROVIDER_FAILED" : "CONSUMER_EXECUTION_FAILED";
      await input.repository.recordTerminalReceipt({
        ...receiptBase, state: "FAILED", reason
      });
      failures += 1;
    }
  }

  const state = failures > 0
    ? "FAILED" as const
    : outputsInserted + outputsCurrent === 0
      ? "SKIPPED" as const : "REFRESHED" as const;
  return Object.freeze({
    state, outputsInserted, outputsCurrent, inFlight, retryLimited, failures
  });
}
