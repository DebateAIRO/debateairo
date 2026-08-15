import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { CallBound, PromptPacket, ProviderGateway } from "@debateai/providers";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError
} from "@debateai/providers";

export const CONSUMER_PROMPT_VERSION = 1 as const;
export const CONSUMER_MAX_PROVIDER_ATTEMPTS = 2 as const;
export const CONSUMER_MAX_REFRESH_ATTEMPTS = 2 as const;

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
    readonly sampleId: string;
    readonly questionExcerpt: string;
    readonly taskExcerpt: string;
    readonly grade: string;
    readonly reasons: readonly string[];
  }[];
  readonly adjacentDomains: readonly {
    readonly domainRef: string;
    readonly name: string;
  }[];
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
    readonly generatedRawArtifactRef: string;
    readonly observedAt: Date;
  }): Promise<{ readonly consumerOutputId: string; readonly inserted: boolean }>;
}

const consumerOutputSchema = z.object({
  bias_pattern_name: z.string().trim().min(1).max(200),
  capability_summary: z.string().trim().min(1).max(4_000),
  adjacent_domain_flags: z.array(z.object({
    domain_ref: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(1_000),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"])
  }).strict()).max(32)
}).strict();

type ConsumerOutput = z.infer<typeof consumerOutputSchema>;

const selfRoutingKey = /(?:^|_)(?:numeric|ordinal|rank|route|routing|score|weight)(?:_|$)/i;

function containsSelfRoutingField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSelfRoutingField);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => selfRoutingKey.test(key)
    || containsSelfRoutingField(nested));
}

function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function targetRef(job: EvaluatorConsumerJob): string {
  return `opaque:target-${sha256([
    job.target.provider, job.target.modelId, job.target.modelVersion
  ]).slice(0, 24)}`;
}

export function buildEvaluatorConsumerPrompt(job: EvaluatorConsumerJob): PromptPacket {
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
    blinded_samples: Object.freeze(job.blindedSamples.map((sample) => Object.freeze({
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

function parseConsumerOutput(content: string, job: EvaluatorConsumerJob): ConsumerOutput {
  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch {
    throw new TypedDomainError("CONSUMER_CONTENT_REFUSED", "CONSUMER_CONTENT_REFUSED: malformed JSON");
  }
  if (containsSelfRoutingField(decoded)) {
    throw new TypedDomainError(
      "SELF_ROUTING_FORBIDDEN",
      "SELF_ROUTING_FORBIDDEN: evaluator interpretation may not supply numeric or routing fields"
    );
  }
  const parsed = consumerOutputSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new TypedDomainError("CONSUMER_CONTENT_REFUSED", "CONSUMER_CONTENT_REFUSED: schema mismatch");
  }
  const allowed = new Set(job.adjacentDomains.map((domain) => domain.domainRef));
  if (parsed.data.adjacent_domain_flags.some((flag) => !allowed.has(flag.domain_ref))) {
    throw new TypedDomainError("CONSUMER_CONTENT_REFUSED", "CONSUMER_CONTENT_REFUSED: unknown domain");
  }
  const refs = parsed.data.adjacent_domain_flags.map((flag) => flag.domain_ref);
  if (new Set(refs).size !== refs.length) {
    throw new TypedDomainError("CONSUMER_CONTENT_REFUSED", "CONSUMER_CONTENT_REFUSED: duplicate domain");
  }
  return parsed.data;
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
  return sha256({
    prompt_version: CONSUMER_PROMPT_VERSION,
    target: job.target,
    domain_id: job.domain?.domainId ?? null,
    aggregate_refs: aggregateRefs(job),
    prompt: packet
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
  readonly reason?: "CONSUMER_PREFLIGHT_FAILED" | "CONSUMER_NO_AGGREGATES";
};

export async function runEvaluatorConsumerRefresh(input: {
  readonly trigger: EvaluatorConsumerRefreshTrigger;
  readonly aggregateAsOf?: Date;
  readonly family: EvaluatorConsumerFamily;
  readonly deployment: {
    readonly configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[];
  };
  readonly bound: CallBound;
  readonly provider: ProviderGateway;
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
      reason: "CONSUMER_NO_AGGREGATES",
      inputHash: preflightInputHash,
      observedAt
    });
    return Object.freeze({
      state: "SKIPPED", outputsInserted: 0, outputsCurrent: 0, inFlight: 0,
      retryLimited: 0, failures: 0, reason: "CONSUMER_NO_AGGREGATES"
    });
  }

  let outputsInserted = 0;
  let outputsCurrent = 0;
  let inFlight = 0;
  let retryLimited = 0;
  let failures = 0;
  for (const job of jobs) {
    const packet = buildEvaluatorConsumerPrompt(job);
    const snapshotHash = aggregateSnapshotHash(job, packet);
    const jobInputHash = sha256({ trigger: input.trigger, snapshot_hash: snapshotHash, packet });
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
        trigger: input.trigger,
        attemptId: jobAttemptId,
        state: "FAILED",
        reason: "CONSUMER_CLAIM_FAILED",
        inputHash: jobInputHash,
        observedAt
      });
      continue;
    }
    if (claim.state === "ALREADY_CURRENT") {
      outputsCurrent += 1;
      continue;
    }
    if (claim.state === "IN_FLIGHT") {
      inFlight += 1;
      continue;
    }
    if (claim.state === "RETRY_LIMIT_REACHED") {
      retryLimited += 1;
      continue;
    }

    const receiptBase = {
      job,
      trigger: input.trigger,
      attemptId: claim.attemptId,
      attemptOrdinal: claim.attemptOrdinal,
      inputHash: jobInputHash,
      aggregateSnapshotHash: snapshotHash,
      observedAt
    } as const;
    try {
      // This assertion intentionally occurs after the short claim transaction and
      // immediately before the call. No repository client or lock spans the call.
      assertConsumerIsolation(input.family, input.deployment);
    } catch {
      await input.repository.recordTerminalReceipt({
        ...receiptBase, state: "SKIPPED", reason: "CONSUMER_PROVIDER_ISOLATION_FAILED"
      });
      failures += 1;
      continue;
    }

    try {
      const response = await input.provider.call({
        runId: null,
        subjectItemId: `evaluator:consumer-attempt:${claim.attemptId}`,
        callSiteKey: "evaluator.refresh-consumer-output.v1",
        role: "CLASSIFIER",
        lane: "evaluator",
        bound: input.bound,
        contractHash: sha256("evaluator-consumer-interpretation/v1"),
        providerRef: input.family.value.providerRef,
        packet,
        classifyContent: (content) => {
          try {
            parseConsumerOutput(content, job);
            return { parseStatus: "PARSED", parseError: null };
          } catch (error) {
            return {
              parseStatus: "SCHEMA_FAILED",
              parseError: error instanceof TypedDomainError ? error.code : "CONSUMER_CONTENT_REFUSED"
            };
          }
        },
        buildRepairPacket: ({ parseError }) => Object.freeze({ messages: Object.freeze([
          ...packet.messages,
          Object.freeze({
            role: "user" as const,
            content: `The response violated the interpretation contract (${parseError}). Return corrected strict JSON only; do not add numeric or routing fields.`
          })
        ]) })
      });
      if (response.maker !== input.family.value.maker || response.model !== job.consumerModelId) {
        await input.repository.recordTerminalReceipt({
          ...receiptBase, state: "FAILED", reason: "CONSUMER_AUTHORIZATION_FAILED"
        });
        failures += 1;
        continue;
      }
      const interpretation = parseConsumerOutput(response.content, job);
      const persisted = await input.repository.persistOutput({
        job,
        family: input.family,
        promptVersion: CONSUMER_PROMPT_VERSION,
        aggregateSnapshotHash: snapshotHash,
        aggregateRefs: aggregateRefs(job),
        blindedSampleRefs: Object.freeze(job.blindedSamples.map((sample) => sample.sampleId).sort()),
        summary: JSON.stringify({
          bias_pattern_name: interpretation.bias_pattern_name,
          capability_summary: interpretation.capability_summary
        }),
        adjacentDomainFlags: Object.freeze(interpretation.adjacent_domain_flags.map((flag) => Object.freeze(flag))),
        generatedRawArtifactRef: response.rawArtifactRef,
        observedAt
      });
      await input.repository.recordTerminalReceipt({
        ...receiptBase,
        state: "SUCCEEDED",
        reason: persisted.inserted ? "CONSUMER_OUTPUT_PERSISTED" : "CONSUMER_OUTPUT_ALREADY_CURRENT",
        consumerOutputId: persisted.consumerOutputId
      });
      if (persisted.inserted) outputsInserted += 1;
      else outputsCurrent += 1;
    } catch (error) {
      const reason = (error instanceof ProviderContentUnacceptedError
          && error.lastParseError === "SELF_ROUTING_FORBIDDEN")
        || (error instanceof TypedDomainError && error.code === "SELF_ROUTING_FORBIDDEN")
        ? "SELF_ROUTING_FORBIDDEN"
        : error instanceof ProviderContentUnacceptedError
          || (error instanceof TypedDomainError && error.code === "CONSUMER_CONTENT_REFUSED")
          ? "CONSUMER_CONTENT_REFUSED"
          : error instanceof TypedDomainError && error.code === "CONSUMER_AUTHORIZATION_FAILED"
            ? "CONSUMER_AUTHORIZATION_FAILED"
        : error instanceof ProviderCallFailedError && error.lastOutcome === "TIMED_OUT"
          ? "CONSUMER_PROVIDER_TIMED_OUT"
          : error instanceof ProviderCallFailedError
            ? "CONSUMER_PROVIDER_FAILED"
            : "CONSUMER_EXECUTION_FAILED";
      await input.repository.recordTerminalReceipt({
        ...receiptBase, state: "FAILED", reason
      });
      failures += 1;
    }
  }

  const state = failures > 0
    ? "FAILED" as const
    : outputsInserted + outputsCurrent === 0
      ? "SKIPPED" as const
      : "REFRESHED" as const;
  return Object.freeze({
    state, outputsInserted, outputsCurrent, inFlight, retryLimited, failures
  });
}
