import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  allocateSequence,
  decryptPreparedContentForRun,
  prepareContentEncryptionForRun,
  type CryptoEnvelope,
  type PreparedRunContentCipher,
  withWriteTransaction
} from "@debateai/db";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  type CallBound,
  type ProviderGateway
} from "@debateai/providers";
import { createBlindEvaluationSample } from "./blind-sample.js";
import { HARVEST_PIPELINE_VERSION } from "./harvest-constants.js";

export * from "./blind-sample.js";
export * from "./consumer.js";
export * from "./consumer-postgres.js";
export * from "./dev-menu.js";
export * from "./dispatch-binding.js";
export * from "./harvest-constants.js";

export const EVALUATOR_PROVIDER_FAMILY_ROW_KEY = "evaluatorProviderFamily" as const;
export const EVALUATOR_JUDGE_ADDON_POLICY_ROW_KEY = "evaluatorJudgeAddonPolicy" as const;
export const EVALUATOR_SEAT_SHARE_POLICY_ROW_KEY = "evaluatorSeatSharePolicy" as const;
export const EVALUATOR_PROVIDER_REF = "provider:evaluator-vllm" as const;
export const EVALUATOR_MAKER = "maker:evaluator-local-vllm" as const;
export const EVALUATOR_ADAPTER_KIND = "vllm-openai-compatible-http" as const;

const providerFamilyValueSchema = z.object({
  kind: z.literal("EVALUATOR_PROVIDER_FAMILY"),
  providerRef: z.literal(EVALUATOR_PROVIDER_REF),
  adapterKind: z.literal(EVALUATOR_ADAPTER_KIND),
  maker: z.literal(EVALUATOR_MAKER),
  chatBaseUrl: z.string().url(),
  modelsPath: z.string().startsWith("/"),
  deadlineMs: z.number().int().positive(),
  source: z.literal("LOCAL_CONTAINER_NO_AUTH")
}).strict();

export type EvaluatorProviderFamilyValue = z.infer<typeof providerFamilyValueSchema>;

export interface EvaluatorProviderFamilyRow {
  readonly rowKey: typeof EVALUATOR_PROVIDER_FAMILY_ROW_KEY;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly value: EvaluatorProviderFamilyValue;
}

function assertPositiveRegisterVersion(registerVersion: number): void {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("EVALUATOR_REGISTER_VERSION_INVALID");
  }
}

function assertLocalEndpoint(value: EvaluatorProviderFamilyValue): void {
  const endpoint = new URL(value.chatBaseUrl);
  const localHosts = new Set(["vllm", "localhost", "127.0.0.1", "[::1]"]);
  if (endpoint.protocol !== "http:" || !localHosts.has(endpoint.hostname)) {
    throw new TypedDomainError(
      "EVALUATOR_PROVIDER_ENDPOINT_FORBIDDEN",
      "Evaluator vLLM must use an allowlisted local HTTP endpoint"
    );
  }
}

export async function readEvaluatorProviderFamily(
  pool: Pool,
  registerVersion: number
): Promise<EvaluatorProviderFamilyRow> {
  assertPositiveRegisterVersion(registerVersion);
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json, source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, EVALUATOR_PROVIDER_FAMILY_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError(
      "EVALUATOR_PROVIDER_FAMILY_UNRESOLVED",
      `${EVALUATOR_PROVIDER_FAMILY_ROW_KEY}@${registerVersion}`
    );
  }
  const parsed = providerFamilyValueSchema.safeParse(row.value_json);
  if (!parsed.success || row.source_ref.trim() === "") {
    throw new TypedDomainError(
      "EVALUATOR_PROVIDER_FAMILY_INVALID",
      `${EVALUATOR_PROVIDER_FAMILY_ROW_KEY}@${registerVersion}`
    );
  }
  assertLocalEndpoint(parsed.data);
  return Object.freeze({
    rowKey: EVALUATOR_PROVIDER_FAMILY_ROW_KEY,
    registerVersion,
    sourceRef: row.source_ref,
    value: Object.freeze(parsed.data)
  });
}

export function assertEvaluatorProviderIsolation(
  family: EvaluatorProviderFamilyRow,
  deployment: {
    readonly configuredProviders: readonly {
      readonly providerRef: string;
      readonly maker: string;
    }[];
  }
): void {
  if (deployment.configuredProviders.some((row) => row.providerRef === family.value.providerRef)) {
    throw new TypedDomainError(
      "EVALUATOR_PROVIDER_PANEL_COLLISION",
      `${family.value.providerRef} must not enter configuredProviderSet`
    );
  }
  if (deployment.configuredProviders.some((row) => row.maker === family.value.maker)) {
    throw new TypedDomainError(
      "EVALUATOR_MAKER_PANEL_COLLISION",
      `${family.value.maker} must not enter configured panel makers`
    );
  }
}

export interface EvaluatorCatalogModel {
  readonly modelId: string;
  readonly metadataJson: Readonly<Record<string, unknown>>;
}

export type EvaluatorVllmCatalogProbe =
  | {
      readonly state: "AVAILABLE";
      readonly failureCode: null;
      readonly startedAt: Date;
      readonly finishedAt: Date;
      readonly models: readonly EvaluatorCatalogModel[];
    }
  | {
      readonly state: "UNAVAILABLE";
      readonly failureCode: string;
      readonly startedAt: Date;
      readonly finishedAt: Date;
      readonly models: readonly [];
    };

const catalogSchema = z.object({
  data: z.array(z.object({ id: z.string().trim().min(1) }).passthrough())
}).passthrough();

export async function probeEvaluatorVllmCatalog(
  family: EvaluatorProviderFamilyRow,
  fetchImplementation: typeof fetch = fetch,
  clock: () => Date = () => new Date()
): Promise<EvaluatorVllmCatalogProbe> {
  const startedAt = clock();
  try {
    const response = await fetchImplementation(
      `${family.value.chatBaseUrl.replace(/\/$/, "")}${family.value.modelsPath}`,
      { method: "GET", signal: AbortSignal.timeout(family.value.deadlineMs) }
    );
    if (!response.ok) throw new Error(`EVALUATOR_VLLM_HTTP_${response.status}`);
    const parsed = catalogSchema.parse(await response.json());
    const models = parsed.data
      .map((entry) => Object.freeze({
        modelId: entry.id,
        metadataJson: Object.freeze({ ...entry })
      }))
      .sort((left, right) => left.modelId < right.modelId ? -1 : left.modelId > right.modelId ? 1 : 0);
    return Object.freeze({
      state: "AVAILABLE",
      failureCode: null,
      startedAt,
      finishedAt: clock(),
      models: Object.freeze(models)
    });
  } catch (error) {
    const failureCode = error instanceof DOMException && error.name === "TimeoutError"
      ? "EVALUATOR_VLLM_TIMEOUT"
      : error instanceof Error && error.message.startsWith("EVALUATOR_VLLM_HTTP_")
        ? error.message
        : error instanceof z.ZodError
          ? "EVALUATOR_VLLM_CATALOG_INVALID"
          : "EVALUATOR_VLLM_UNAVAILABLE";
    return Object.freeze({
      state: "UNAVAILABLE",
      failureCode,
      startedAt,
      finishedAt: clock(),
      models: Object.freeze([]) as readonly []
    });
  }
}

export class EvaluatorCatalogRepository {
  constructor(private readonly pool: Pool) {}

  async record(
    family: EvaluatorProviderFamilyRow,
    probe: EvaluatorVllmCatalogProbe
  ): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const probeSequence = await allocateSequence(client);
      const inserted = await client.query<{ vllm_probe_id: string }>(`
        INSERT INTO evaluator.vllm_probe (
          provider_ref, state, failure_code, started_at, finished_at, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING vllm_probe_id
      `, [
        family.value.providerRef,
        probe.state,
        probe.failureCode,
        probe.startedAt,
        probe.finishedAt,
        probeSequence
      ]);
      const probeId = inserted.rows[0]!.vllm_probe_id;
      for (const model of probe.models) {
        const modelSequence = await allocateSequence(client);
        await client.query(`
          INSERT INTO evaluator.vllm_catalog_model (
            vllm_probe_id, model_id, metadata_json, at_seq
          ) VALUES ($1,$2,$3::jsonb,$4)
        `, [probeId, model.modelId, JSON.stringify(model.metadataJson), modelSequence]);
      }
      return probeId;
    });
  }
}

export const ADDON_PIPELINE_VERSION = 1 as const;
export const ADDON_METRIC = "judging.blind-grade.v1" as const;
export const ADDON_MAX_PROVIDER_ATTEMPTS = 2 as const;
export const ADDON_MAX_RUN_ATTEMPTS = 3 as const;

const judgeAddonPolicyValueSchema = z.object({
  kind: z.literal("EVALUATOR_JUDGE_ADDON_POLICY"),
  collectionState: z.literal("COLLECT_ONLY"),
  everyNthRun: z.number().int().min(1).max(10_000),
  maxAttempts: z.number().int().min(1).max(ADDON_MAX_PROVIDER_ATTEMPTS),
  tokenCeiling: z.number().int().positive(),
  deadlineMs: z.number().int().positive(),
  derivationVersion: z.number().int().positive()
}).strict();

export interface EvaluatorJudgeAddonPolicy {
  readonly rowKey: typeof EVALUATOR_JUDGE_ADDON_POLICY_ROW_KEY;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly value: z.infer<typeof judgeAddonPolicyValueSchema>;
}

export async function readEvaluatorJudgeAddonPolicy(
  pool: Pool,
  registerVersion: number
): Promise<EvaluatorJudgeAddonPolicy | null> {
  assertPositiveRegisterVersion(registerVersion);
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json, source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, EVALUATOR_JUDGE_ADDON_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  const parsed = judgeAddonPolicyValueSchema.safeParse(row.value_json);
  if (!parsed.success || row.source_ref.trim() === "") {
    throw new TypedDomainError(
      "EVALUATOR_ADDON_POLICY_INVALID",
      `${EVALUATOR_JUDGE_ADDON_POLICY_ROW_KEY}@${registerVersion}`
    );
  }
  return Object.freeze({
    rowKey: EVALUATOR_JUDGE_ADDON_POLICY_ROW_KEY,
    registerVersion,
    sourceRef: row.source_ref,
    value: Object.freeze(parsed.data)
  });
}

export function shouldSampleEvaluatorAddon(runOrdinal: number, everyNthRun: number): boolean {
  if (!Number.isInteger(runOrdinal) || runOrdinal < 1) {
    throw new TypeError("EVALUATOR_ADDON_RUN_ORDINAL_INVALID");
  }
  if (!Number.isInteger(everyNthRun) || everyNthRun < 1) {
    throw new TypeError("EVALUATOR_ADDON_SAMPLE_INTERVAL_INVALID");
  }
  return runOrdinal % everyNthRun === 0;
}

export interface EvaluatorAddonCandidate {
  readonly runId: string;
  readonly runOrdinal: number;
  readonly domainId: string | null;
  readonly reducedJudgementId: string;
  readonly gradedRawArtifactRef: string;
  readonly gradedProvider: string;
  readonly gradedModelId: string;
  readonly gradedModelVersion: string;
  readonly gradedMaker: string;
  readonly questionExcerpt: string;
  readonly taskExcerpt: string;
  readonly grade: string;
  readonly reasons: readonly string[];
}

export type EvaluatorAddonCandidateResult = EvaluatorAddonCandidate
  | "ALREADY_GRADED"
  | "RETRY_LIMIT_REACHED"
  | "HARVEST_REQUIRED"
  | "NO_JUDGEMENT";

export interface AddonPipelineEventInput {
  readonly runId: string;
  readonly attemptId: string;
  readonly state: "STARTED" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  readonly reason: string;
  readonly inputHash: string;
}

export interface EvaluatorAddonObservationInput {
  readonly runId: string;
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly domainId: string | null;
  readonly step: "JUDGING";
  readonly metric: typeof ADDON_METRIC;
  readonly value: number;
  readonly outcomeJson: Readonly<{ verdict: string; reasons: readonly string[] }>;
  readonly truthBasis: "BLIND_ADDON";
  readonly sourceKind: "BLIND_JUDGE_GRADE";
  readonly sourceRef: string;
  readonly sourceRawArtifactRef: string;
  readonly gradedRawArtifactRef: string;
  readonly graderRawArtifactRef: string;
  readonly gradedMaker: string;
  readonly graderMaker: string;
  readonly derivationVersion: number;
  readonly provenanceJson: Readonly<Record<string, unknown>>;
  readonly observedAt: Date;
}

export interface EvaluatorAddonRepository {
  withRunLock<T>(
    runId: string,
    work: (
      client?: PoolClient,
      preparedContent?: PreparedRunContentCipher | null
    ) => Promise<T>
  ): Promise<{ readonly acquired: true; readonly value: T } | { readonly acquired: false }>;
  loadCandidate(
    runId: string,
    client?: PoolClient,
    preparedContent?: PreparedRunContentCipher | null
  ): Promise<EvaluatorAddonCandidateResult>;
  recordPipelineEvent(input: AddonPipelineEventInput, client?: PoolClient): Promise<string>;
  insertObservation(input: EvaluatorAddonObservationInput, client?: PoolClient): Promise<string>;
}

const addonGradeSchema = z.object({
  score: z.number().min(0).max(1),
  verdict: z.enum(["UPHOLD", "REVISE", "UNASSESSABLE"]),
  reasons: z.array(z.string().trim().min(1)).min(1)
}).strict();

function parseAddonGrade(content: string): z.infer<typeof addonGradeSchema> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch {
    throw new TypedDomainError("EVALUATOR_ADDON_OUTPUT_INVALID", "Add-on output is not JSON");
  }
  const parsed = addonGradeSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new TypedDomainError("EVALUATOR_ADDON_OUTPUT_INVALID", "Add-on output violates its contract");
  }
  return parsed.data;
}

function addonInputHash(
  runId: string,
  candidate: EvaluatorAddonCandidate | null,
  policy: EvaluatorJudgeAddonPolicy | null
): string {
  return createHash("sha256").update(JSON.stringify({
    run_id: runId,
    reduced_judgement_id: candidate?.reducedJudgementId ?? null,
    policy: policy === null ? null : {
      register_version: policy.registerVersion,
      source_ref: policy.sourceRef,
      value: policy.value
    }
  })).digest("hex");
}

export type EvaluatorJudgeAddonResult =
  | { readonly state: "GRADED"; readonly observationId: string }
  | {
      readonly state: "SKIPPED";
      readonly reason: "ADDON_POLICY_UNAVAILABLE" | "ADDON_POLICY_INVALID"
        | "ADDON_ALREADY_GRADED" | "ADDON_RETRY_LIMIT_REACHED"
        | "ADDON_HARVEST_REQUIRED" | "ADDON_NO_JUDGEMENT"
        | "ADDON_NOT_SAMPLED" | "ADDON_DIFFERENT_MAKER_UNAVAILABLE"
        | "ADDON_PROVIDER_ISOLATION_FAILED" | "ADDON_FAMILY_REGISTER_VERSION_MISMATCH"
        | "ADDON_PASS_IN_FLIGHT";
    }
  | {
      readonly state: "FAILED";
      readonly reason: "ADDON_PREFLIGHT_FAILED" | "ADDON_PROVIDER_FAILED"
        | "ADDON_PROVIDER_TIMED_OUT" | "ADDON_CONTENT_REFUSED" | "ADDON_EXECUTION_FAILED";
    };

export async function runEvaluatorJudgeAddon(input: {
  readonly runId: string;
  readonly family: EvaluatorProviderFamilyRow;
  readonly deployment: {
    readonly configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[];
  };
  readonly policy: EvaluatorJudgeAddonPolicy | null;
  readonly provider: ProviderGateway;
  readonly repository: EvaluatorAddonRepository;
  readonly observedAt?: Date;
}): Promise<EvaluatorJudgeAddonResult> {
  const attemptId = randomUUID();
  const observedAt = input.observedAt ?? new Date();
  try {
    requireNonblank(input.runId, "EVALUATOR_ADDON_RUN_ID_INVALID");
    if (!Number.isFinite(observedAt.getTime())) throw new TypeError("EVALUATOR_ADDON_TIME_INVALID");
  } catch {
    return Object.freeze({ state: "FAILED", reason: "ADDON_PREFLIGHT_FAILED" });
  }

  let inputHash = addonInputHash(input.runId, null, input.policy);
  const recordTerminalEvent = async (
    state: "SUCCEEDED" | "FAILED" | "SKIPPED",
    reason: string,
    client?: PoolClient
  ): Promise<void> => {
    try {
      await input.repository.recordPipelineEvent({
        runId: input.runId, attemptId, state, reason, inputHash
      }, client);
    } catch {
      // Add-on receipts are best effort and never change product-run behavior.
    }
  };

  const parsedPolicy = input.policy === null
    ? null
    : judgeAddonPolicyValueSchema.safeParse(input.policy.value);
  if (input.policy !== null && (!parsedPolicy?.success || input.policy.sourceRef.trim() === "")) {
    await recordTerminalEvent("SKIPPED", "ADDON_POLICY_INVALID");
    return Object.freeze({ state: "SKIPPED", reason: "ADDON_POLICY_INVALID" });
  }
  if (input.policy === null) {
    await recordTerminalEvent("SKIPPED", "ADDON_POLICY_UNAVAILABLE");
    return Object.freeze({ state: "SKIPPED", reason: "ADDON_POLICY_UNAVAILABLE" });
  }
  const policy = input.policy;
  try {
    assertEvaluatorProviderIsolation(input.family, input.deployment);
  } catch {
    await recordTerminalEvent("SKIPPED", "ADDON_PROVIDER_ISOLATION_FAILED");
    return Object.freeze({ state: "SKIPPED", reason: "ADDON_PROVIDER_ISOLATION_FAILED" });
  }

  const lockedResult = await input.repository.withRunLock(input.runId, async (client, preparedContent) => {
  let candidateResult: EvaluatorAddonCandidateResult;
  try {
    candidateResult = await input.repository.loadCandidate(input.runId, client, preparedContent);
  } catch {
    await recordTerminalEvent("FAILED", "ADDON_PREFLIGHT_FAILED", client);
    return Object.freeze({ state: "FAILED", reason: "ADDON_PREFLIGHT_FAILED" });
  } finally {
    preparedContent?.close();
  }
  const candidate = typeof candidateResult === "string" ? null : candidateResult;
  inputHash = addonInputHash(input.runId, candidate, policy);
  if (candidateResult === "ALREADY_GRADED") {
    await recordTerminalEvent("SKIPPED", "ADDON_ALREADY_GRADED", client);
    return Object.freeze({ state: "SKIPPED", reason: "ADDON_ALREADY_GRADED" });
  }
  if (candidateResult === "RETRY_LIMIT_REACHED") {
    await recordTerminalEvent("SKIPPED", "ADDON_RETRY_LIMIT_REACHED", client);
    return Object.freeze({ state: "SKIPPED", reason: "ADDON_RETRY_LIMIT_REACHED" });
  }
  if (candidateResult === "HARVEST_REQUIRED") {
    await recordTerminalEvent("SKIPPED", "ADDON_HARVEST_REQUIRED", client);
    return Object.freeze({ state: "SKIPPED", reason: "ADDON_HARVEST_REQUIRED" });
  }
  if (candidateResult === "NO_JUDGEMENT") {
    await recordTerminalEvent("SKIPPED", "ADDON_NO_JUDGEMENT", client);
    return Object.freeze({ state: "SKIPPED", reason: "ADDON_NO_JUDGEMENT" });
  }
  if (!shouldSampleEvaluatorAddon(candidateResult.runOrdinal, policy.value.everyNthRun)) {
    await recordTerminalEvent("SKIPPED", "ADDON_NOT_SAMPLED", client);
    return Object.freeze({ state: "SKIPPED", reason: "ADDON_NOT_SAMPLED" });
  }
  if (candidateResult.gradedMaker === input.family.value.maker) {
    await recordTerminalEvent("SKIPPED", "ADDON_DIFFERENT_MAKER_UNAVAILABLE", client);
    return Object.freeze({ state: "SKIPPED", reason: "ADDON_DIFFERENT_MAKER_UNAVAILABLE" });
  }

  try {
    await input.repository.recordPipelineEvent({
      runId: input.runId, attemptId, state: "STARTED", reason: "BLIND_JUDGE_GRADE_STARTED", inputHash
    }, client);
  } catch {
    await recordTerminalEvent("FAILED", "ADDON_PREFLIGHT_FAILED", client);
    return Object.freeze({ state: "FAILED", reason: "ADDON_PREFLIGHT_FAILED" });
  }

  const blinded = createBlindEvaluationSample({
    sampleId: `opaque:${createHash("sha256").update(`${input.runId}:${candidateResult.reducedJudgementId}`)
      .digest("hex").slice(0, 24)}`,
    questionExcerpt: candidateResult.questionExcerpt,
    taskExcerpt: candidateResult.taskExcerpt,
    grade: candidateResult.grade,
    reasons: candidateResult.reasons
  });
  let stage: "PROVIDER_CALL" | "EXECUTION" = "PROVIDER_CALL";
  try {
    const packet = {
      messages: [
        {
          role: "system" as const,
          content: "Grade the supplied anonymous judge output. Return strict JSON only with score in [0,1], verdict UPHOLD, REVISE, or UNASSESSABLE, and one or more non-empty reasons. Do not infer authorship."
        },
        { role: "user" as const, content: JSON.stringify(blinded) }
      ]
    };
    const response = await input.provider.call({
      runId: null,
      subjectItemId: `evaluator:addon-attempt:${attemptId}`,
      callSiteKey: "evaluator.grade-judge-output.v1",
      role: "JUDGE",
      lane: "evaluator",
      bound: {
        maxAttempts: policy.value.maxAttempts,
        tokenCeiling: policy.value.tokenCeiling,
        deadlineMs: policy.value.deadlineMs
      },
      contractHash: createHash("sha256").update("evaluator-blind-judge-grade/v1").digest("hex"),
      providerRef: input.family.value.providerRef,
      packet,
      buildRepairPacket: ({ parseError }) => ({
        messages: [...packet.messages, {
          role: "user",
          content: `The response violated the anonymous grading JSON contract (${parseError}). Return corrected strict JSON only.`
        }]
      }),
      classifyContent: (content) => {
        const parsed = addonGradeSchema.safeParse((() => {
          try { return JSON.parse(content); } catch { return null; }
        })());
        return parsed.success
          ? { parseStatus: "PARSED", parseError: null }
          : { parseStatus: "SCHEMA_FAILED", parseError: "EVALUATOR_ADDON_OUTPUT_INVALID" };
      }
    });
    stage = "EXECUTION";
    if (response.maker !== input.family.value.maker
      || response.maker === candidateResult.gradedMaker) {
      await recordTerminalEvent("SKIPPED", "ADDON_DIFFERENT_MAKER_UNAVAILABLE", client);
      return Object.freeze({ state: "SKIPPED", reason: "ADDON_DIFFERENT_MAKER_UNAVAILABLE" });
    }
    const grade = parseAddonGrade(response.content);
    const observationId = await input.repository.insertObservation({
      runId: input.runId,
      provider: candidateResult.gradedProvider,
      modelId: candidateResult.gradedModelId,
      modelVersion: candidateResult.gradedModelVersion,
      domainId: candidateResult.domainId,
      step: "JUDGING",
      metric: ADDON_METRIC,
      value: grade.score,
      outcomeJson: Object.freeze({ verdict: grade.verdict, reasons: Object.freeze([...grade.reasons]) }),
      truthBasis: "BLIND_ADDON",
      sourceKind: "BLIND_JUDGE_GRADE",
      sourceRef: candidateResult.reducedJudgementId,
      sourceRawArtifactRef: candidateResult.gradedRawArtifactRef,
      gradedRawArtifactRef: candidateResult.gradedRawArtifactRef,
      graderRawArtifactRef: response.rawArtifactRef,
      gradedMaker: candidateResult.gradedMaker,
      graderMaker: response.maker,
      derivationVersion: policy.value.derivationVersion,
      provenanceJson: Object.freeze({
        source: "evaluator.blind_judge_grade",
        policy_row_key: policy.rowKey,
        policy_register_version: policy.registerVersion,
        policy_source_ref: policy.sourceRef,
        grader_ledger_entry_ref: response.ledgerEntryRef
      }),
      observedAt: new Date(observedAt)
    }, client);
    await recordTerminalEvent("SUCCEEDED", "BLIND_JUDGE_GRADE_SUCCEEDED", client);
    return Object.freeze({ state: "GRADED", observationId });
  } catch (error) {
    const reason: Extract<EvaluatorJudgeAddonResult, { state: "FAILED" }>["reason"] =
      error instanceof ProviderCallFailedError && error.lastOutcome === "TIMED_OUT"
        ? "ADDON_PROVIDER_TIMED_OUT"
        : error instanceof ProviderContentUnacceptedError
          || (error instanceof TypedDomainError && error.code === "EVALUATOR_ADDON_OUTPUT_INVALID")
          ? "ADDON_CONTENT_REFUSED"
          : stage === "PROVIDER_CALL" ? "ADDON_PROVIDER_FAILED" : "ADDON_EXECUTION_FAILED";
    await recordTerminalEvent("FAILED", reason, client);
    return Object.freeze({ state: "FAILED", reason });
  }
  });
  if (!lockedResult.acquired) {
    await recordTerminalEvent("SKIPPED", "ADDON_PASS_IN_FLIGHT");
    return Object.freeze({ state: "SKIPPED", reason: "ADDON_PASS_IN_FLIGHT" });
  }
  return lockedResult.value;
}

function extractBlindJudgementReasons(rawText: string): readonly string[] {
  let value: unknown;
  try {
    value = JSON.parse(rawText);
  } catch {
    return Object.freeze([]);
  }
  const parsed = z.object({
    restatement_text: z.string().trim().min(1).optional(),
    steelman: z.object({ summary: z.string().trim().min(1) }).passthrough().optional(),
    critic: z.object({ summary: z.string().trim().min(1) }).passthrough().optional()
  }).passthrough().safeParse(value);
  if (!parsed.success) return Object.freeze([]);
  return Object.freeze([
    parsed.data.restatement_text,
    parsed.data.steelman?.summary,
    parsed.data.critic?.summary
  ].filter((reason): reason is string => reason !== undefined));
}

export class PostgresEvaluatorAddonRepository implements EvaluatorAddonRepository {
  constructor(private readonly pool: Pool) {}

  async withRunLock<T>(
    runId: string,
    work: (
      client?: PoolClient,
      preparedContent?: PreparedRunContentCipher | null
    ) => Promise<T>
  ): Promise<{ readonly acquired: true; readonly value: T } | { readonly acquired: false }> {
    const preparedContent = await prepareContentEncryptionForRun(this.pool, runId);
    let client: PoolClient | undefined;
    const lockKey = `evaluator-addon:${runId}`;
    let acquired = false;
    try {
      client = await this.pool.connect();
      const lock = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
        [lockKey]
      );
      acquired = lock.rows[0]?.acquired === true;
      if (!acquired) return Object.freeze({ acquired: false as const });
      return Object.freeze({
        acquired: true as const,
        value: await work(client, preparedContent)
      });
    } finally {
      try {
        if (client !== undefined) {
          if (!acquired) {
            client.release();
          } else {
            try {
              const unlock = await client.query<{ unlocked: boolean }>(
                "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked",
                [lockKey]
              );
              if (unlock.rows[0]?.unlocked !== true) {
                throw new Error("EVALUATOR_ADDON_ADVISORY_UNLOCK_FAILED");
              }
              client.release();
            } catch (error) {
              client.release(error instanceof Error
                ? error
                : new Error("EVALUATOR_ADDON_ADVISORY_UNLOCK_FAILED"));
              throw error;
            }
          }
        }
      } finally {
        preparedContent?.close();
      }
    }
  }

  async loadCandidate(
    runId: string,
    client?: PoolClient,
    preparedContent?: PreparedRunContentCipher | null
  ): Promise<EvaluatorAddonCandidateResult> {
    const ownsPreparedContent = client === undefined && preparedContent === undefined;
    const activePreparedContent = ownsPreparedContent
      ? await prepareContentEncryptionForRun(this.pool, runId)
      : preparedContent ?? null;
    try {
      return await this.#loadCandidate(runId, client ?? this.pool, activePreparedContent);
    } finally {
      if (ownsPreparedContent) activePreparedContent?.close();
    }
  }

  async #loadCandidate(
    runId: string,
    database: Pool | PoolClient,
    preparedContent: PreparedRunContentCipher | null
  ): Promise<EvaluatorAddonCandidateResult> {
    const existing = await database.query(`
      SELECT 1 FROM evaluator.observation
      WHERE run_id=$1 AND source_kind='BLIND_JUDGE_GRADE' LIMIT 1
    `, [runId]);
    if (existing.rowCount !== 0) return "ALREADY_GRADED";
    const attempts = await database.query<{ attempt_count: string }>(`
      SELECT count(DISTINCT attempt_id)::text AS attempt_count
      FROM evaluator.pipeline_event
      WHERE run_id=$1 AND pipeline='ADDON' AND pipeline_version=$2 AND state='STARTED'
    `, [runId, ADDON_PIPELINE_VERSION]);
    if (Number(attempts.rows[0]?.attempt_count ?? 0) >= ADDON_MAX_RUN_ATTEMPTS) {
      return "RETRY_LIMIT_REACHED";
    }
    const harvested = await database.query(`
      SELECT 1 FROM evaluator.pipeline_event
      WHERE run_id=$1 AND pipeline='HARVEST' AND state='SUCCEEDED' LIMIT 1
    `, [runId]);
    if (harvested.rowCount === 0) return "HARVEST_REQUIRED";
    const result = await database.query<{
      run_id: string; run_ordinal: number; domain_id: string | null;
      reduced_judgement_id: string; node_id: string; raw_artifact_ref: string; provider: string;
      model_id: string; model_version: string; maker: string; question_line: string;
      claim_text: string; tau: number; number_kind: string; raw_text: string;
      run_content_ciphertext: CryptoEnvelope | null;
      node_content_ciphertext: CryptoEnvelope | null;
      artifact_content_ciphertext: CryptoEnvelope | null;
    }>(`
      SELECT run.run_id,
        (SELECT count(*)::int FROM core.run AS preceding
         WHERE preceding.created_at_seq <= run.created_at_seq) AS run_ordinal,
        domain.domain_id, judgement.reduced_judgement_id, node.node_id,
        judgement.raw_artifact_ref,
        artifact.provider, artifact.model_id, artifact.model_version, artifact.maker,
        run.question_line, run.content_ciphertext AS run_content_ciphertext,
        node.claim_text, node.content_ciphertext AS node_content_ciphertext,
        judgement.tau, judgement.number_kind,
        artifact.raw_text, artifact.content_ciphertext AS artifact_content_ciphertext
      FROM core.run AS run
      JOIN ledger.reduced_judgement AS judgement ON judgement.run_id=run.run_id
      JOIN core.node AS node ON node.node_id=judgement.node_id AND node.run_id=run.run_id
      JOIN ledger.raw_artifact AS artifact
        ON artifact.raw_artifact_id=judgement.raw_artifact_ref AND artifact.run_id=run.run_id
      LEFT JOIN evaluator.question_domain AS domain ON domain.run_id=run.run_id
      WHERE run.run_id=$1 AND artifact.model_version IS NOT NULL
        AND length(btrim(artifact.model_version)) > 0
      ORDER BY judgement.at_seq, judgement.reduced_judgement_id
      LIMIT 1
    `, [runId]);
    const row = result.rows[0];
    if (row === undefined) return "NO_JUDGEMENT";
    const [runContent, nodeContent, artifactContent] = [
      decryptPreparedContentForRun<{ questionLine: string }>(
        preparedContent, "core.run", row.run_id, row.run_content_ciphertext,
        { questionLine: row.question_line }
      ),
      decryptPreparedContentForRun<{ claimText: string }>(
        preparedContent, "core.node", row.node_id,
        row.node_content_ciphertext, { claimText: row.claim_text }
      ),
      decryptPreparedContentForRun<{ rawText: string }>(
        preparedContent, "ledger.raw_artifact", row.raw_artifact_ref,
        row.artifact_content_ciphertext, { rawText: row.raw_text }
      )
    ];
    return Object.freeze({
      runId: row.run_id,
      runOrdinal: Number(row.run_ordinal),
      domainId: row.domain_id,
      reducedJudgementId: row.reduced_judgement_id,
      gradedRawArtifactRef: row.raw_artifact_ref,
      gradedProvider: row.provider,
      gradedModelId: row.model_id,
      gradedModelVersion: row.model_version,
      gradedMaker: row.maker,
      questionExcerpt: runContent.questionLine,
      taskExcerpt: nodeContent.claimText,
      grade: `${Number(row.tau)} (${row.number_kind})`,
      reasons: extractBlindJudgementReasons(artifactContent.rawText)
    });
  }

  async recordPipelineEvent(input: AddonPipelineEventInput, client?: PoolClient): Promise<string> {
    const insert = async (writeClient: PoolClient): Promise<string> => {
      const result = await writeClient.query<{ pipeline_event_id: string }>(`
        INSERT INTO evaluator.pipeline_event (
          run_id, pipeline, pipeline_version, attempt_id, state, reason, input_hash, at_seq
        ) VALUES ($1,'ADDON',$2,$3,$4,$5,$6,$7) RETURNING pipeline_event_id
      `, [input.runId, ADDON_PIPELINE_VERSION, input.attemptId, input.state, input.reason,
        input.inputHash, await allocateSequence(writeClient)]);
      return result.rows[0]!.pipeline_event_id;
    };
    return client === undefined ? withWriteTransaction(this.pool, insert) : insert(client);
  }

  async insertObservation(input: EvaluatorAddonObservationInput, client?: PoolClient): Promise<string> {
    if (input.gradedMaker === input.graderMaker) {
      throw new TypedDomainError("PRODUCER_GRADING_FORBIDDEN", input.gradedMaker);
    }
    const insert = async (writeClient: PoolClient): Promise<string> => {
      const result = await writeClient.query<{ observation_id: string }>(`
        INSERT INTO evaluator.observation (
          run_id, provider, model_id, model_version, domain_id, step, metric,
          value, outcome_json, truth_basis, source_kind, source_ref,
          source_raw_artifact_ref, answer_outcome_id, graded_raw_artifact_ref,
          grader_raw_artifact_ref, derivation_version, supersedes_observation_id,
          provenance_json, observed_at, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,NULL,$14,$15,$16,NULL,$17::jsonb,$18,$19)
        ON CONFLICT DO NOTHING RETURNING observation_id
      `, [
        input.runId, input.provider, input.modelId, input.modelVersion, input.domainId,
        input.step, input.metric, input.value, JSON.stringify(input.outcomeJson), input.truthBasis,
        input.sourceKind, input.sourceRef, input.sourceRawArtifactRef, input.gradedRawArtifactRef,
        input.graderRawArtifactRef, input.derivationVersion, JSON.stringify(input.provenanceJson),
        input.observedAt, await allocateSequence(writeClient)
      ]);
      const observationId = result.rows[0]?.observation_id;
      if (observationId === undefined) {
        const existing = await writeClient.query<{ observation_id: string }>(`
          SELECT observation_id FROM evaluator.observation
          WHERE run_id=$1 AND source_kind='BLIND_JUDGE_GRADE' AND source_ref=$2
            AND derivation_version=$3 LIMIT 1
        `, [input.runId, input.sourceRef, input.derivationVersion]);
        if (existing.rows[0] === undefined) throw new Error("EVALUATOR_ADDON_OBSERVATION_CONFLICT");
        return existing.rows[0].observation_id;
      }
      return observationId;
    };
    return client === undefined ? withWriteTransaction(this.pool, insert) : insert(client);
  }
}

export const DOMAIN_GUARDRAIL_VERSION = 1 as const;
export const DOMAIN_NAME_MAX_LENGTH = 80 as const;
export const DOMAIN_NAME_MAX_WORDS = 6 as const;
export const DOMAIN_NEAR_DUPLICATE_THRESHOLD = 0.8 as const;

export interface EvaluatorDomain {
  readonly domainId: string;
  readonly canonicalName: string;
  readonly normalizedName: string;
  readonly origin: "STARTER" | "GROWN";
  readonly guardrailVersion: number;
  readonly provenanceRef: string;
}

export interface DomainSimilarityCandidate {
  readonly domainId: string;
  readonly normalizedName: string;
  readonly similarity: number;
}

export type DomainProposalEvaluation = {
  readonly decision: "ADMITTED_NEW" | "MATCHED_EXISTING" | "REJECTED_NEAR_DUPLICATE" | "REJECTED_INVALID" | "REFUSED";
  readonly normalizedName: string;
  readonly domainId: string | null;
  readonly candidates: readonly DomainSimilarityCandidate[];
  readonly reason: string;
};

function canonicalizeDomainName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeDomainName(value: string): string {
  return canonicalizeDomainName(value).toLocaleLowerCase("en-US");
}

function isValidDomainName(canonicalName: string): boolean {
  const normalizedName = normalizeDomainName(canonicalName);
  if (normalizedName.length < 2 || normalizedName.length > DOMAIN_NAME_MAX_LENGTH) return false;
  if (normalizedName.split(" ").length > DOMAIN_NAME_MAX_WORDS) return false;
  return /^[\p{L}\p{N}]+(?:(?: +| *& *| *- *|['’])[\p{L}\p{N}]+)*$/u.test(normalizedName);
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        substitution
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

function domainNameSimilarity(left: string, right: string): number {
  const maximumLength = Math.max(left.length, right.length);
  if (maximumLength === 0) return 1;
  const editSimilarity = 1 - levenshteinDistance(left, right) / maximumLength;
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const tokenSimilarity = union === 0 ? 1 : intersection / union;
  return Math.round(Math.max(editSimilarity, tokenSimilarity) * 1_000_000) / 1_000_000;
}

export function evaluateDomainProposal(
  proposedName: string,
  existingDomains: readonly Pick<EvaluatorDomain, "domainId" | "canonicalName" | "normalizedName">[]
): DomainProposalEvaluation {
  const canonicalName = canonicalizeDomainName(proposedName);
  const normalizedName = normalizeDomainName(canonicalName);
  if (!isValidDomainName(canonicalName)) {
    return Object.freeze({
      decision: "REJECTED_INVALID",
      normalizedName,
      domainId: null,
      candidates: Object.freeze([]),
      reason: `Domain names must contain 2-${DOMAIN_NAME_MAX_LENGTH} allowed characters and at most ${DOMAIN_NAME_MAX_WORDS} words`
    });
  }
  const ordered = [...existingDomains].sort((left, right) =>
    left.normalizedName.localeCompare(right.normalizedName, "en-US") || left.domainId.localeCompare(right.domainId, "en-US")
  );
  const exact = ordered.find((domain) => domain.normalizedName === normalizedName);
  if (exact !== undefined) {
    return Object.freeze({
      decision: "MATCHED_EXISTING",
      normalizedName,
      domainId: exact.domainId,
      candidates: Object.freeze([{ domainId: exact.domainId, normalizedName: exact.normalizedName, similarity: 1 }]),
      reason: "The normalized name exactly matches an existing domain"
    });
  }
  const candidates = ordered
    .map((domain) => Object.freeze({
      domainId: domain.domainId,
      normalizedName: domain.normalizedName,
      similarity: domainNameSimilarity(normalizedName, domain.normalizedName)
    }))
    .filter((candidate) => candidate.similarity >= DOMAIN_NEAR_DUPLICATE_THRESHOLD)
    .sort((left, right) => right.similarity - left.similarity
      || left.normalizedName.localeCompare(right.normalizedName, "en-US")
      || left.domainId.localeCompare(right.domainId, "en-US"));
  if (candidates.length > 0) {
    return Object.freeze({
      decision: "REJECTED_NEAR_DUPLICATE",
      normalizedName,
      domainId: null,
      candidates: Object.freeze(candidates),
      reason: `Proposal is too similar to ${candidates.length} existing domain(s) at threshold ${DOMAIN_NEAR_DUPLICATE_THRESHOLD}`
    });
  }
  return Object.freeze({
    decision: "ADMITTED_NEW",
    normalizedName,
    domainId: null,
    candidates: Object.freeze([]),
    reason: "Proposal passes the deterministic new-domain guardrails"
  });
}

export interface AdmitDomainProposalInput {
  readonly runId: string;
  readonly proposedName: string;
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly rawArtifactRef: string | null;
  readonly provenanceRef: string;
}

export interface AdmitExistingDomainSelectionInput extends Omit<AdmitDomainProposalInput, "proposedName"> {
  readonly domainId: string;
}

export interface RecordDomainRefusalInput extends AdmitDomainProposalInput {
  readonly reason: string;
}

export interface DomainAdmissionResult extends DomainProposalEvaluation {
  readonly domainAdmissionId: string;
}

function requireNonblank(value: string, code: string): void {
  if (value.trim() === "") throw new TypedDomainError(code, `${code}: value must be nonblank`);
}

function validateAdmissionIdentity(input: Omit<AdmitDomainProposalInput, "proposedName">): void {
  for (const [value, code] of [
    [input.runId, "EVALUATOR_DOMAIN_RUN_ID_INVALID"],
    [input.provider, "EVALUATOR_DOMAIN_PROVIDER_INVALID"],
    [input.modelId, "EVALUATOR_DOMAIN_MODEL_ID_INVALID"],
    [input.modelVersion, "EVALUATOR_DOMAIN_MODEL_VERSION_INVALID"],
    [input.provenanceRef, "EVALUATOR_DOMAIN_PROVENANCE_INVALID"]
  ] as const) requireNonblank(value, code);
}

async function assertAdmissionArtifact(
  client: PoolClient,
  input: Omit<AdmitDomainProposalInput, "proposedName" | "provenanceRef">
): Promise<void> {
  if (input.rawArtifactRef === null) return;
  const artifact = await client.query<{
    run_id: string | null;
    provider_ref: string;
    provider: string;
    model_id: string;
    model_version: string | null;
  }>(`
    SELECT run_id, provider_ref, provider, model_id, model_version
    FROM ledger.raw_artifact WHERE raw_artifact_id=$1
  `, [input.rawArtifactRef]);
  const artifactRow = artifact.rows[0];
  const expectedRunId = artifactRow?.provider_ref === EVALUATOR_PROVIDER_REF ? null : input.runId;
  if (artifactRow === undefined || artifactRow.run_id !== expectedRunId
    || artifactRow.provider !== input.provider || artifactRow.model_id !== input.modelId
    || artifactRow.model_version !== input.modelVersion) {
    throw new TypedDomainError(
      "EVALUATOR_DOMAIN_PROPOSAL_ARTIFACT_MISMATCH",
      "Domain proposal identity must match its evaluator scope and raw artifact"
    );
  }
}

async function insertDomainAdmission(
  client: PoolClient,
  input: {
    readonly runId: string;
    readonly proposedName: string;
    readonly normalizedName: string;
    readonly decision: DomainProposalEvaluation["decision"];
    readonly domainId: string | null;
    readonly candidates: readonly DomainSimilarityCandidate[];
    readonly rawArtifactRef: string | null;
    readonly reason: string;
  }
): Promise<string> {
  const admission = await client.query<{ domain_admission_id: string }>(`
    INSERT INTO evaluator.domain_admission (
      run_id, proposed_name, normalized_name, decision, domain_id,
      candidate_similarities, guardrail_version, tagger_raw_artifact_ref,
      reason, at_seq
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
    RETURNING domain_admission_id
  `, [
    input.runId, input.proposedName, input.normalizedName, input.decision,
    input.domainId, JSON.stringify(input.candidates), DOMAIN_GUARDRAIL_VERSION,
    input.rawArtifactRef, input.reason, await allocateSequence(client)
  ]);
  return admission.rows[0]!.domain_admission_id;
}

async function readDomains(client: Pool | PoolClient): Promise<readonly EvaluatorDomain[]> {
  const result = await client.query<{
    domain_id: string;
    canonical_name: string;
    normalized_name: string;
    origin: "STARTER" | "GROWN";
    guardrail_version: string;
    provenance_ref: string;
  }>(`
    SELECT domain_id, canonical_name, normalized_name, origin,
           guardrail_version, provenance_ref
    FROM evaluator.domain
    ORDER BY normalized_name, domain_id
  `);
  return Object.freeze(result.rows.map((row) => Object.freeze({
    domainId: row.domain_id,
    canonicalName: row.canonical_name,
    normalizedName: row.normalized_name,
    origin: row.origin,
    guardrailVersion: Number(row.guardrail_version),
    provenanceRef: row.provenance_ref
  })));
}

export class DomainRegistryRepository {
  constructor(private readonly pool: Pool) {}

  async listDomains(): Promise<readonly EvaluatorDomain[]> {
    return readDomains(this.pool);
  }

  async admitProposal(input: AdmitDomainProposalInput): Promise<DomainAdmissionResult> {
    validateAdmissionIdentity(input);
    const canonicalName = canonicalizeDomainName(input.proposedName);
    const normalizedName = normalizeDomainName(canonicalName);
    return withWriteTransaction(this.pool, async (client) => {
      if (canonicalName === "") {
        await assertAdmissionArtifact(client, input);
        const reason = "EVALUATOR_DOMAIN_PROPOSAL_BLANK";
        const domainAdmissionId = await insertDomainAdmission(client, {
          runId: input.runId,
          proposedName: input.proposedName,
          normalizedName,
          decision: "REFUSED",
          domainId: null,
          candidates: Object.freeze([]),
          rawArtifactRef: input.rawArtifactRef,
          reason
        });
        return Object.freeze({
          decision: "REFUSED" as const,
          normalizedName,
          domainId: null,
          candidates: Object.freeze([]),
          reason,
          domainAdmissionId
        });
      }
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        ["evaluator-domain-registry"]
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`evaluator-domain:${normalizedName}`]
      );
      await assertAdmissionArtifact(client, input);
      const evaluation = evaluateDomainProposal(canonicalName, await readDomains(client));
      let domainId = evaluation.domainId;
      if (evaluation.decision === "ADMITTED_NEW") {
        if (input.rawArtifactRef === null) {
          throw new TypedDomainError(
            "EVALUATOR_GROWN_DOMAIN_PROVENANCE_REQUIRED",
            "A grown domain requires the tagger raw artifact"
          );
        }
        const inserted = await client.query<{ domain_id: string }>(`
          INSERT INTO evaluator.domain (
            canonical_name, normalized_name, origin, proposed_by_provider,
            proposed_by_model_id, proposed_by_model_version,
            proposal_raw_artifact_ref, source_run_id, guardrail_version,
            provenance_ref, admitted_at, at_seq
          ) VALUES ($1,$2,'GROWN',$3,$4,$5,$6,$7,$8,$9,statement_timestamp(),$10)
          RETURNING domain_id
        `, [
          canonicalName, evaluation.normalizedName, input.provider, input.modelId,
          input.modelVersion, input.rawArtifactRef, input.runId,
          DOMAIN_GUARDRAIL_VERSION, input.provenanceRef, await allocateSequence(client)
        ]);
        domainId = inserted.rows[0]!.domain_id;
      }
      const domainAdmissionId = await insertDomainAdmission(client, {
        runId: input.runId,
        proposedName: input.proposedName,
        normalizedName: evaluation.normalizedName,
        decision: evaluation.decision,
        domainId,
        candidates: evaluation.candidates,
        rawArtifactRef: input.rawArtifactRef,
        reason: evaluation.reason
      });
      return Object.freeze({
        ...evaluation,
        domainId,
        domainAdmissionId
      });
    });
  }

  async admitExistingDomainSelection(input: AdmitExistingDomainSelectionInput): Promise<DomainAdmissionResult> {
    validateAdmissionIdentity(input);
    requireNonblank(input.domainId, "EVALUATOR_DOMAIN_ID_INVALID");
    return withWriteTransaction(this.pool, async (client) => {
      await assertAdmissionArtifact(client, input);
      const selected = await client.query<{
        domain_id: string;
        canonical_name: string;
        normalized_name: string;
      }>(`
        SELECT domain_id, canonical_name, normalized_name
        FROM evaluator.domain WHERE domain_id=$1
      `, [input.domainId]);
      const row = selected.rows[0];
      if (row === undefined) {
        const reason = `EVALUATOR_DOMAIN_SELECTION_UNRESOLVED:${input.domainId}`;
        const domainAdmissionId = await insertDomainAdmission(client, {
          runId: input.runId,
          proposedName: input.domainId,
          normalizedName: normalizeDomainName(input.domainId),
          decision: "REFUSED",
          domainId: null,
          candidates: Object.freeze([]),
          rawArtifactRef: input.rawArtifactRef,
          reason
        });
        return Object.freeze({
          decision: "REFUSED" as const,
          normalizedName: normalizeDomainName(input.domainId),
          domainId: null,
          candidates: Object.freeze([]),
          reason,
          domainAdmissionId
        });
      }
      const candidates = Object.freeze([Object.freeze({
        domainId: row.domain_id,
        normalizedName: row.normalized_name,
        similarity: 1
      })]);
      const reason = "The tagger selected an existing domain id";
      const domainAdmissionId = await insertDomainAdmission(client, {
        runId: input.runId,
        proposedName: row.canonical_name,
        normalizedName: row.normalized_name,
        decision: "MATCHED_EXISTING",
        domainId: row.domain_id,
        candidates,
        rawArtifactRef: input.rawArtifactRef,
        reason
      });
      return Object.freeze({
        decision: "MATCHED_EXISTING" as const,
        normalizedName: row.normalized_name,
        domainId: row.domain_id,
        candidates,
        reason,
        domainAdmissionId
      });
    });
  }

  async recordRefusal(input: RecordDomainRefusalInput): Promise<DomainAdmissionResult> {
    validateAdmissionIdentity(input);
    requireNonblank(input.reason, "EVALUATOR_DOMAIN_REFUSAL_REASON_INVALID");
    return withWriteTransaction(this.pool, async (client) => {
      await assertAdmissionArtifact(client, input);
      const normalizedName = normalizeDomainName(input.proposedName);
      const domainAdmissionId = await insertDomainAdmission(client, {
        runId: input.runId,
        proposedName: input.proposedName,
        normalizedName,
        decision: "REFUSED",
        domainId: null,
        candidates: Object.freeze([]),
        rawArtifactRef: input.rawArtifactRef,
        reason: input.reason
      });
      return Object.freeze({
        decision: "REFUSED" as const,
        normalizedName,
        domainId: null,
        candidates: Object.freeze([]),
        reason: input.reason,
        domainAdmissionId
      });
    });
  }

  async assignQuestionDomain(input: {
    readonly runId: string;
    readonly domainId: string;
    readonly domainAdmissionId: string;
    readonly basis: "TAGGER" | "BACKFILL";
    readonly rawArtifactRef: string | null;
  }): Promise<string> {
    if (input.basis === "TAGGER" && input.rawArtifactRef === null) {
      throw new TypedDomainError(
        "EVALUATOR_TAGGER_ARTIFACT_REQUIRED",
        "TAGGER assignments require the tagger raw artifact"
      );
    }
    return withWriteTransaction(this.pool, async (client) => {
      const admission = await client.query<{
        decision: string;
        domain_id: string | null;
        tagger_raw_artifact_ref: string | null;
      }>(`
        SELECT decision, domain_id, tagger_raw_artifact_ref
        FROM evaluator.domain_admission
        WHERE domain_admission_id=$1 AND run_id=$2
      `, [input.domainAdmissionId, input.runId]);
      const row = admission.rows[0];
      if (row === undefined || !["ADMITTED_NEW", "MATCHED_EXISTING"].includes(row.decision)
        || row.domain_id !== input.domainId
        || (input.basis === "TAGGER" && row.tagger_raw_artifact_ref !== input.rawArtifactRef)) {
        throw new TypedDomainError(
          "EVALUATOR_DOMAIN_ASSIGNMENT_ADMISSION_MISMATCH",
          "Question-domain assignment must reference its successful admission"
        );
      }
      const inserted = await client.query<{ question_domain_id: string }>(`
        INSERT INTO evaluator.question_domain (
          run_id, domain_id, assignment_basis, domain_admission_id,
          tagger_raw_artifact_ref, assigned_at, at_seq
        ) VALUES ($1,$2,$3,$4,$5,statement_timestamp(),$6)
        RETURNING question_domain_id
      `, [
        input.runId, input.domainId, input.basis, input.domainAdmissionId,
        input.rawArtifactRef, await allocateSequence(client)
      ]);
      return inserted.rows[0]!.question_domain_id;
    });
  }

  async readQuestionDomain(runId: string): Promise<{
    readonly runId: string;
    readonly domainId: string;
    readonly assignmentBasis: "TAGGER" | "BACKFILL";
    readonly domainAdmissionId: string;
  } | null> {
    const result = await this.pool.query<{
      run_id: string;
      domain_id: string;
      assignment_basis: "TAGGER" | "BACKFILL";
      domain_admission_id: string;
    }>(`
      SELECT run_id, domain_id, assignment_basis, domain_admission_id
      FROM evaluator.question_domain WHERE run_id=$1
    `, [runId]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      runId: row.run_id,
      domainId: row.domain_id,
      assignmentBasis: row.assignment_basis,
      domainAdmissionId: row.domain_admission_id
    });
  }

  async recordTagPipelineEvent(input: TagPipelineEventInput): Promise<string> {
    requireNonblank(input.runId, "EVALUATOR_TAG_RUN_ID_INVALID");
    requireNonblank(input.reason, "EVALUATOR_TAG_EVENT_REASON_INVALID");
    requireNonblank(input.inputHash, "EVALUATOR_TAG_INPUT_HASH_INVALID");
    return withWriteTransaction(this.pool, async (client) => {
      const inserted = await client.query<{ pipeline_event_id: string }>(`
        INSERT INTO evaluator.pipeline_event (
          run_id, pipeline, pipeline_version, attempt_id, state,
          reason, input_hash, at_seq
        ) VALUES ($1,'TAG',$2,$3,$4,$5,$6,$7)
        RETURNING pipeline_event_id
      `, [
        input.runId, TAGGER_PIPELINE_VERSION, input.attemptId, input.state,
        input.reason, input.inputHash, await allocateSequence(client)
      ]);
      return inserted.rows[0]!.pipeline_event_id;
    });
  }
}

export const TAGGER_PIPELINE_VERSION = 1 as const;

export interface TagPipelineEventInput {
  readonly runId: string;
  readonly attemptId: string;
  readonly state: "STARTED" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  readonly reason: string;
  readonly inputHash: string;
}

export interface EvaluatorTagRepository {
  listDomains(): Promise<readonly EvaluatorDomain[]>;
  readQuestionDomain(runId: string): Promise<{
    readonly runId: string;
    readonly domainId: string;
    readonly assignmentBasis: "TAGGER" | "BACKFILL";
    readonly domainAdmissionId: string;
  } | null>;
  admitProposal(input: AdmitDomainProposalInput): Promise<DomainAdmissionResult>;
  admitExistingDomainSelection(input: AdmitExistingDomainSelectionInput): Promise<DomainAdmissionResult>;
  recordRefusal(input: RecordDomainRefusalInput): Promise<DomainAdmissionResult>;
  assignQuestionDomain(input: {
    readonly runId: string;
    readonly domainId: string;
    readonly domainAdmissionId: string;
    readonly basis: "TAGGER" | "BACKFILL";
    readonly rawArtifactRef: string | null;
  }): Promise<string>;
  recordTagPipelineEvent(input: TagPipelineEventInput): Promise<string>;
}

const taggerDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("SELECT_EXISTING"),
    domain_id: z.string().trim().min(1)
  }).strict(),
  z.object({
    decision: z.literal("PROPOSE_NEW"),
    proposed_name: z.string()
  }).strict(),
  z.object({
    decision: z.literal("REFUSED"),
    reason: z.string().trim().min(1)
  }).strict()
]);

function parseTaggerDecision(content: string): z.infer<typeof taggerDecisionSchema> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch {
    throw new TypedDomainError("EVALUATOR_TAGGER_OUTPUT_INVALID", "Tagger output is not JSON");
  }
  const parsed = taggerDecisionSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new TypedDomainError("EVALUATOR_TAGGER_OUTPUT_INVALID", "Tagger output violates its contract");
  }
  return parsed.data;
}

function taggerInputHash(runId: string, rawQuestion: string, domains: readonly EvaluatorDomain[]): string {
  return createHash("sha256").update(JSON.stringify({
    runId,
    rawQuestion,
    domains: domains.map(({ domainId, canonicalName }) => ({ domainId, canonicalName }))
  })).digest("hex");
}

export type EvaluatorQuestionTagResult =
  | {
      readonly state: "TAGGED";
      readonly domainId: string;
      readonly domainAdmissionId: string;
      readonly questionDomainId: string;
    }
  | {
      readonly state: "UNTAGGED";
      readonly reason: "TAGGER_REFUSED" | "TAGGER_ADMISSION_REFUSED"
        | "TAGGER_PROVIDER_FAILED" | "TAGGER_PROVIDER_TIMED_OUT"
        | "TAGGER_CONTENT_REFUSED" | "TAGGER_PROVIDER_ISOLATION_FAILED"
        | "TAGGER_EXECUTION_FAILED" | "TAGGER_INPUT_INVALID"
        | "TAGGER_PREFLIGHT_FAILED" | "TAGGER_ALREADY_TAGGED"
        | "TAGGER_RUN_UNRESOLVED";
    };

export async function runEvaluatorQuestionTagger(input: {
  readonly runId: string;
  readonly rawQuestion: string;
  readonly family: EvaluatorProviderFamilyRow;
  readonly deployment: {
    readonly configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[];
  };
  readonly provider: ProviderGateway;
  readonly repository: EvaluatorTagRepository;
  readonly bound: CallBound;
  readonly basis: "TAGGER" | "BACKFILL";
  readonly provenanceRef: string;
}): Promise<EvaluatorQuestionTagResult> {
  const attemptId = randomUUID();
  try {
    requireNonblank(input.runId, "EVALUATOR_TAG_RUN_ID_INVALID");
    requireNonblank(input.rawQuestion, "EVALUATOR_TAG_QUESTION_INVALID");
    requireNonblank(input.provenanceRef, "EVALUATOR_TAG_PROVENANCE_INVALID");
  } catch {
    return Object.freeze({ state: "UNTAGGED", reason: "TAGGER_INPUT_INVALID" });
  }
  let domains: readonly EvaluatorDomain[];
  let inputHash: string;
  try {
    domains = await input.repository.listDomains();
    inputHash = taggerInputHash(input.runId, input.rawQuestion, domains);
    const existing = await input.repository.readQuestionDomain(input.runId);
    if (existing !== null) {
      await input.repository.recordTagPipelineEvent({
        runId: input.runId, attemptId, state: "SKIPPED",
        reason: "TAGGER_ALREADY_TAGGED", inputHash
      });
      return Object.freeze({ state: "UNTAGGED", reason: "TAGGER_ALREADY_TAGGED" });
    }
    await input.repository.recordTagPipelineEvent({
      runId: input.runId,
      attemptId,
      state: "STARTED",
      reason: input.basis === "TAGGER" ? "ASK_TIME_TAG_STARTED" : "TAG_RECONCILIATION_STARTED",
      inputHash
    });
  } catch {
    return Object.freeze({ state: "UNTAGGED", reason: "TAGGER_PREFLIGHT_FAILED" });
  }
  const recordTerminalEvent = async (
    state: "SUCCEEDED" | "FAILED" | "SKIPPED",
    reason: string
  ): Promise<void> => {
    try {
      await input.repository.recordTagPipelineEvent({
        runId: input.runId, attemptId, state, reason, inputHash
      });
    } catch {
      // A receipt outage cannot turn evaluator enrichment into a product-path failure.
    }
  };
  try {
    assertEvaluatorProviderIsolation(input.family, input.deployment);
  } catch {
    await recordTerminalEvent("FAILED", "TAGGER_PROVIDER_ISOLATION_FAILED");
    return Object.freeze({ state: "UNTAGGED", reason: "TAGGER_PROVIDER_ISOLATION_FAILED" });
  }

  let stage: "PROVIDER_CALL" | "EXECUTION" = "PROVIDER_CALL";
  try {
    const response = await input.provider.call({
      runId: null,
      subjectItemId: `evaluator:tag-attempt:${attemptId}`,
      callSiteKey: "evaluator.tag-question.v1",
      role: "CLASSIFIER",
      lane: "evaluator",
      bound: input.bound,
      contractHash: createHash("sha256").update("evaluator-domain-tagger/v1").digest("hex"),
      providerRef: input.family.value.providerRef,
      packet: {
        messages: [
          {
            role: "system",
            content: "Classify the raw question. Return strict JSON only: SELECT_EXISTING with domain_id, PROPOSE_NEW with proposed_name, or REFUSED with reason. Never invent an existing domain id."
          },
          {
            role: "user",
            content: JSON.stringify({
              raw_question: input.rawQuestion,
              domains: domains.map(({ domainId, canonicalName }) => ({
                domain_id: domainId,
                canonical_name: canonicalName
              }))
            })
          }
        ]
      },
      classifyContent: (content) => {
        const parsed = taggerDecisionSchema.safeParse((() => {
          try { return JSON.parse(content); } catch { return null; }
        })());
        return parsed.success
          ? { parseStatus: "PARSED", parseError: null }
          : { parseStatus: "SCHEMA_FAILED", parseError: "EVALUATOR_TAGGER_OUTPUT_INVALID" };
      }
    });
    stage = "EXECUTION";
    if (response.maker !== input.family.value.maker) {
      throw new TypedDomainError("EVALUATOR_TAGGER_MAKER_MISMATCH", response.maker);
    }
    const decision = parseTaggerDecision(response.content);
    const identity = {
      runId: input.runId,
      provider: response.provider,
      modelId: response.model,
      modelVersion: response.modelVersion,
      rawArtifactRef: response.rawArtifactRef,
      provenanceRef: input.provenanceRef
    };
    if (decision.decision === "REFUSED") {
      await input.repository.recordRefusal({ ...identity, proposedName: "", reason: decision.reason });
      await recordTerminalEvent("SKIPPED", "TAGGER_REFUSED");
      return Object.freeze({ state: "UNTAGGED", reason: "TAGGER_REFUSED" });
    }
    const admission = decision.decision === "SELECT_EXISTING"
      ? await input.repository.admitExistingDomainSelection({ ...identity, domainId: decision.domain_id })
      : await input.repository.admitProposal({ ...identity, proposedName: decision.proposed_name });
    if (admission.domainId === null
      || !["ADMITTED_NEW", "MATCHED_EXISTING"].includes(admission.decision)) {
      await recordTerminalEvent("SKIPPED", `TAGGER_ADMISSION_${admission.decision}`);
      return Object.freeze({ state: "UNTAGGED", reason: "TAGGER_ADMISSION_REFUSED" });
    }
    const questionDomainId = await input.repository.assignQuestionDomain({
      runId: input.runId,
      domainId: admission.domainId,
      domainAdmissionId: admission.domainAdmissionId,
      basis: input.basis,
      rawArtifactRef: response.rawArtifactRef
    });
    await recordTerminalEvent("SUCCEEDED", "TAGGER_DOMAIN_ASSIGNED");
    return Object.freeze({
      state: "TAGGED",
      domainId: admission.domainId,
      domainAdmissionId: admission.domainAdmissionId,
      questionDomainId
    });
  } catch (error) {
    const reason: Extract<EvaluatorQuestionTagResult, { state: "UNTAGGED" }>["reason"] =
      error instanceof ProviderCallFailedError && error.lastOutcome === "TIMED_OUT"
        ? "TAGGER_PROVIDER_TIMED_OUT"
        : error instanceof ProviderContentUnacceptedError
          || (error instanceof TypedDomainError && error.code === "EVALUATOR_TAGGER_OUTPUT_INVALID")
          ? "TAGGER_CONTENT_REFUSED"
          : stage === "PROVIDER_CALL" ? "TAGGER_PROVIDER_FAILED" : "TAGGER_EXECUTION_FAILED";
    await recordTerminalEvent("FAILED", reason);
    return Object.freeze({ state: "UNTAGGED", reason });
  }
}

export const HARVEST_DERIVATION_VERSION = 1 as const;

export interface EvaluatorHarvestArtifact {
  readonly rawArtifactId: string;
  readonly attemptId: string;
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string | null;
}

export interface EvaluatorHarvestSnapshot {
  readonly runId: string;
  readonly domainId: string | null;
  readonly observedAt: Date;
  readonly rawArtifacts: readonly EvaluatorHarvestArtifact[];
  readonly modelCalls: readonly { readonly attemptId: string; readonly callSiteKey: string }[];
  readonly authoredNodes: readonly {
    readonly nodeId: string;
    readonly rawArtifactRef: string;
    readonly generationStatus: string;
    readonly pathStatus: string;
    readonly claimType: string;
  }[];
  readonly reviews: readonly {
    readonly nodeReviewId: string;
    readonly authorRawArtifactRef: string;
    readonly reviewRawArtifactRef: string;
    readonly outcome: string;
    readonly reasons: unknown;
  }[];
  readonly judgements: readonly {
    readonly reducedJudgementId: string;
    readonly rawArtifactRef: string;
    readonly tau: number;
    readonly numberKind: string;
    readonly producer: string;
  }[];
  readonly strengths: readonly {
    readonly propagationRunId: string;
    readonly nodeId: string;
    readonly strength: number;
    readonly numberKind: string;
    readonly producer: string;
  }[];
  readonly settlements: readonly {
    readonly answerOutcomeId: string;
    readonly provider: string;
    readonly modelId: string;
    readonly modelVersion: string;
    readonly resolvedOutcome: boolean;
    readonly resolvedAt: Date;
  }[];
  readonly priorConsensusOutcomes: readonly {
    readonly observationId: string;
    readonly provider: string;
    readonly modelId: string;
    readonly modelVersion: string;
    readonly domainId: string | null;
    readonly metric: string;
    readonly observedAt: Date;
  }[];
}

export interface EvaluatorObservationCandidate {
  readonly runId: string;
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly domainId: string | null;
  readonly step: "AUTHORING" | "JUDGING" | "REVIEWING";
  readonly metric: string;
  readonly value: number | null;
  readonly outcomeJson: Readonly<Record<string, unknown>> | null;
  readonly truthBasis: "CONSENSUS" | "SETTLEMENT";
  readonly sourceKind: "AUTHORED_NODE" | "REDUCED_JUDGEMENT" | "NODE_REVIEW"
    | "NODE_STRENGTH" | "EXTERNAL_ANSWER_OUTCOME";
  readonly sourceRef: string;
  readonly sourceRawArtifactRef: string | null;
  readonly answerOutcomeId: string | null;
  readonly supersedesObservationId: string | null;
  readonly provenanceJson: Readonly<Record<string, unknown>>;
  readonly observedAt: Date;
}

function compareObservation(left: EvaluatorObservationCandidate, right: EvaluatorObservationCandidate): number {
  const leftKey = JSON.stringify([left.step, left.sourceKind, left.sourceRef, left.provider,
    left.modelId, left.modelVersion]);
  const rightKey = JSON.stringify([right.step, right.sourceKind, right.sourceRef, right.provider,
    right.modelId, right.modelVersion]);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

export function projectEvaluatorObservations(
  snapshot: EvaluatorHarvestSnapshot
): readonly EvaluatorObservationCandidate[] {
  const excludedAttempts = new Set(snapshot.modelCalls
    .filter((call) => call.callSiteKey.startsWith("evaluator."))
    .map((call) => call.attemptId));
  const artifacts = new Map(snapshot.rawArtifacts
    .filter((artifact) => !excludedAttempts.has(artifact.attemptId))
    .filter((artifact): artifact is EvaluatorHarvestArtifact & { readonly modelVersion: string } =>
      artifact.modelVersion !== null && artifact.modelVersion.trim() !== "")
    .map((artifact) => [artifact.rawArtifactId, artifact]));
  const nodes = new Map(snapshot.authoredNodes.map((node) => [node.nodeId, node]));
  const rows: EvaluatorObservationCandidate[] = [];
  const base = (artifact: EvaluatorHarvestArtifact & { readonly modelVersion: string }) => ({
    runId: snapshot.runId,
    provider: artifact.provider,
    modelId: artifact.modelId,
    modelVersion: artifact.modelVersion,
    domainId: snapshot.domainId,
    truthBasis: "CONSENSUS" as const,
    answerOutcomeId: null,
    supersedesObservationId: null,
    observedAt: new Date(snapshot.observedAt)
  });

  for (const node of snapshot.authoredNodes) {
    const artifact = artifacts.get(node.rawArtifactRef);
    if (artifact === undefined) continue;
    rows.push(Object.freeze({
      ...base(artifact), step: "AUTHORING", metric: "authoring.artifact.v1", value: null,
      outcomeJson: Object.freeze({
        generation_status: node.generationStatus,
        path_status: node.pathStatus,
        claim_type: node.claimType
      }),
      sourceKind: "AUTHORED_NODE", sourceRef: node.nodeId,
      sourceRawArtifactRef: artifact.rawArtifactId,
      provenanceJson: Object.freeze({ source: "core.node", node_id: node.nodeId })
    }));
  }
  for (const strength of snapshot.strengths) {
    const node = nodes.get(strength.nodeId);
    const artifact = node === undefined ? undefined : artifacts.get(node.rawArtifactRef);
    if (artifact === undefined) continue;
    rows.push(Object.freeze({
      ...base(artifact), step: "AUTHORING", metric: "prowess.outcome.v1",
      value: strength.strength,
      outcomeJson: Object.freeze({ number_kind: strength.numberKind, producer: strength.producer }),
      sourceKind: "NODE_STRENGTH",
      sourceRef: `${strength.propagationRunId}:${strength.nodeId}`,
      sourceRawArtifactRef: artifact.rawArtifactId,
      provenanceJson: Object.freeze({
        source: "ledger.node_strength_record",
        propagation_run_id: strength.propagationRunId,
        node_id: strength.nodeId
      })
    }));
  }
  for (const judgement of snapshot.judgements) {
    const artifact = artifacts.get(judgement.rawArtifactRef);
    if (artifact === undefined) continue;
    rows.push(Object.freeze({
      ...base(artifact), step: "JUDGING", metric: "judging.tau.v1", value: judgement.tau,
      outcomeJson: Object.freeze({ number_kind: judgement.numberKind, producer: judgement.producer }),
      sourceKind: "REDUCED_JUDGEMENT", sourceRef: judgement.reducedJudgementId,
      sourceRawArtifactRef: artifact.rawArtifactId,
      provenanceJson: Object.freeze({
        source: "ledger.reduced_judgement",
        reduced_judgement_id: judgement.reducedJudgementId
      })
    }));
  }
  for (const review of snapshot.reviews) {
    const artifact = artifacts.get(review.reviewRawArtifactRef);
    if (artifact === undefined) continue;
    rows.push(Object.freeze({
      ...base(artifact), step: "REVIEWING", metric: "reviewing.outcome.v1", value: null,
      outcomeJson: Object.freeze({ outcome: review.outcome, reasons: review.reasons }),
      sourceKind: "NODE_REVIEW", sourceRef: review.nodeReviewId,
      sourceRawArtifactRef: artifact.rawArtifactId,
      provenanceJson: Object.freeze({
        source: "ledger.node_review",
        node_review_id: review.nodeReviewId,
        author_raw_artifact_ref: review.authorRawArtifactRef
      })
    }));
  }
  const availableConsensus = [...snapshot.priorConsensusOutcomes];
  for (const settlement of snapshot.settlements) {
    const priorIndex = availableConsensus.findIndex((prior) =>
      prior.provider === settlement.provider
      && prior.modelId === settlement.modelId
      && prior.modelVersion === settlement.modelVersion
      && prior.domainId === snapshot.domainId
      && prior.metric === "prowess.outcome.v1");
    const prior = priorIndex < 0 ? undefined : availableConsensus.splice(priorIndex, 1)[0];
    const settlementObservedAt = new Date(Math.max(
      snapshot.observedAt.getTime(),
      prior?.observedAt.getTime() ?? Number.NEGATIVE_INFINITY
    ));
    const resolvedAt = settlement.resolvedAt.toISOString();
    rows.push(Object.freeze({
      runId: snapshot.runId,
      provider: settlement.provider,
      modelId: settlement.modelId,
      modelVersion: settlement.modelVersion,
      domainId: snapshot.domainId,
      step: "AUTHORING",
      metric: "prowess.outcome.v1",
      value: settlement.resolvedOutcome ? 1 : 0,
      outcomeJson: Object.freeze({
        resolved_outcome: settlement.resolvedOutcome,
        resolved_at: resolvedAt
      }),
      truthBasis: "SETTLEMENT",
      sourceKind: "EXTERNAL_ANSWER_OUTCOME",
      sourceRef: settlement.answerOutcomeId,
      sourceRawArtifactRef: null,
      answerOutcomeId: settlement.answerOutcomeId,
      supersedesObservationId: prior?.observationId ?? null,
      provenanceJson: Object.freeze({
        source: "scorecard.answer_outcome",
        answer_outcome_id: settlement.answerOutcomeId,
        resolved_at: resolvedAt
      }),
      observedAt: settlementObservedAt
    }));
  }
  return Object.freeze(rows.sort(compareObservation));
}

export type EvaluatorHarvestResult =
  | { readonly state: "HARVESTED"; readonly runId: string; readonly observationsInserted: number }
  | { readonly state: "SETTLEMENTS_RECONCILED"; readonly runId: string; readonly observationsInserted: number }
  | { readonly state: "ALREADY_HARVESTED"; readonly runId: string }
  | { readonly state: "NOT_TERMINAL"; readonly runId: string };

function harvestInputHash(snapshot: EvaluatorHarvestSnapshot): string {
  const candidates = projectEvaluatorObservations(snapshot);
  return createHash("sha256").update(JSON.stringify({
    run_id: snapshot.runId,
    domain_id: snapshot.domainId,
    observations: candidates.map((row) => ({
      provider: row.provider, model_id: row.modelId, model_version: row.modelVersion,
      step: row.step, metric: row.metric, source_kind: row.sourceKind,
      source_ref: row.sourceRef, truth_basis: row.truthBasis,
      supersedes_observation_id: row.supersedesObservationId,
      value: row.value,
      outcome_json: row.outcomeJson,
      provenance_json: row.provenanceJson,
      observed_at: row.observedAt.toISOString()
    }))
  })).digest("hex");
}

export class EvaluatorHarvestRepository {
  constructor(private readonly pool: Pool) {}

  async harvestTerminalRun(runId: string, observedAt: Date = new Date()): Promise<EvaluatorHarvestResult> {
    const attemptId = randomUUID();
    let inputHash: string | undefined;
    try {
      requireNonblank(runId, "EVALUATOR_HARVEST_RUN_ID_INVALID");
      if (!Number.isFinite(observedAt.getTime())) throw new TypeError("EVALUATOR_HARVEST_TIME_INVALID");
      const preparedContent = await prepareContentEncryptionForRun(this.pool, runId);
      const prepared = await (async () => {
        try {
          return await withWriteTransaction(this.pool, async (client) => {
            await client.query(
              "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
              [`evaluator-harvest:${runId}`]
            );
            const terminal = await client.query(
              "SELECT 1 FROM core.run_progress_event WHERE run_id=$1 AND kind='TERMINAL' LIMIT 1",
              [runId]
            );
            if (terminal.rowCount === 0) {
              return Object.freeze({ state: "NOT_TERMINAL" as const, runId });
            }
            const snapshot = await this.readSnapshot(
              client, runId, observedAt, preparedContent
            );
            inputHash = harvestInputHash(snapshot);
            await this.recordPipelineEvent(
              client, runId, attemptId, "STARTED", "TERMINAL_HARVEST_STARTED", inputHash
            );
            return Object.freeze({ state: "PREPARED" as const, inputHash, snapshot });
          });
        } finally {
          preparedContent?.close();
        }
      })();
      if (prepared.state === "NOT_TERMINAL") return prepared;

      return await withWriteTransaction(this.pool, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`evaluator-harvest:${runId}`]);
        const prior = await client.query(
          `SELECT 1 FROM evaluator.pipeline_event
           WHERE run_id=$1 AND pipeline='HARVEST' AND pipeline_version=$2 AND state='SUCCEEDED'
           LIMIT 1`,
          [runId, HARVEST_PIPELINE_VERSION]
        );
        const alreadyHarvested = prior.rowCount !== 0;
        const snapshot = prepared.snapshot;
        const candidates = projectEvaluatorObservations(snapshot)
          .filter((row) => !alreadyHarvested || row.truthBasis === "SETTLEMENT");

        if (!alreadyHarvested) {
          const excludedAttempts = new Set(snapshot.modelCalls
            .filter((call) => call.callSiteKey.startsWith("evaluator."))
            .map((call) => call.attemptId));
          for (const artifact of snapshot.rawArtifacts) {
            if (!excludedAttempts.has(artifact.attemptId)
              && (artifact.modelVersion === null || artifact.modelVersion.trim() === "")) {
              await this.recordPipelineEvent(
                client, runId, attemptId, "SKIPPED",
                `MODEL_IDENTITY_INCOMPLETE:${artifact.rawArtifactId}`, prepared.inputHash
              );
            }
          }
        }

        let inserted = 0;
        const orderedCandidates = [
          ...candidates.filter((row) => row.truthBasis !== "SETTLEMENT"),
          ...candidates.filter((row) => row.truthBasis === "SETTLEMENT")
        ];
        for (const row of orderedCandidates) {
          let supersedesObservationId = row.supersedesObservationId;
          let observationTime = new Date(row.observedAt);
          let priorObservedAt: Date | undefined;
          let supersessionSkipRecorded = false;
          if (row.truthBasis === "SETTLEMENT" && supersedesObservationId !== null) {
            const stillAvailable = await client.query<{ observation_id: string; observed_at: Date }>(`
              SELECT prior.observation_id,prior.observed_at
              FROM evaluator.observation AS prior
              WHERE prior.observation_id=$1
                AND NOT EXISTS (
                  SELECT 1 FROM evaluator.observation AS successor
                  WHERE successor.supersedes_observation_id=prior.observation_id
                )
            `, [supersedesObservationId]);
            if (stillAvailable.rows[0] === undefined) {
              supersedesObservationId = null;
            } else {
              priorObservedAt = stillAvailable.rows[0].observed_at;
            }
          }
          if (row.truthBasis === "SETTLEMENT" && supersedesObservationId === null) {
            const availablePrior = await client.query<{ observation_id: string; observed_at: Date }>(`
              SELECT prior.observation_id,prior.observed_at
              FROM evaluator.observation AS prior
              WHERE prior.run_id=$1 AND prior.provider=$2 AND prior.model_id=$3
                AND prior.model_version=$4 AND prior.domain_id IS NOT DISTINCT FROM $5
                AND prior.step='AUTHORING' AND prior.metric=$6
                AND prior.truth_basis='CONSENSUS' AND prior.source_kind='NODE_STRENGTH'
                AND NOT EXISTS (
                  SELECT 1 FROM evaluator.observation AS successor
                  WHERE successor.supersedes_observation_id=prior.observation_id
                )
              ORDER BY prior.observation_id LIMIT 1
            `, [row.runId, row.provider, row.modelId, row.modelVersion, row.domainId, row.metric]);
            supersedesObservationId = availablePrior.rows[0]?.observation_id ?? null;
            priorObservedAt = availablePrior.rows[0]?.observed_at;
          }
          if (row.truthBasis === "SETTLEMENT" && supersedesObservationId === null) {
            const unavailablePrior = await client.query(`
              SELECT 1 FROM evaluator.observation AS prior
              WHERE prior.run_id=$1 AND prior.provider=$2 AND prior.model_id=$3
                AND prior.model_version=$4 AND prior.domain_id IS NOT DISTINCT FROM $5
                AND prior.step='AUTHORING' AND prior.metric=$6
                AND prior.truth_basis='CONSENSUS' AND prior.source_kind='NODE_STRENGTH'
              LIMIT 1
            `, [row.runId, row.provider, row.modelId, row.modelVersion, row.domainId, row.metric]);
            if (unavailablePrior.rowCount !== 0 && row.answerOutcomeId !== null) {
              await this.recordPipelineEvent(
                client, runId, attemptId, "SKIPPED",
                `SUPERSESSION_PRIOR_UNAVAILABLE:${row.answerOutcomeId}`, prepared.inputHash
              );
              supersessionSkipRecorded = true;
            }
          }
          if (row.truthBasis === "SETTLEMENT" && supersedesObservationId !== null
            && priorObservedAt !== undefined) {
            const safeTime = Math.max(observationTime.getTime(), priorObservedAt.getTime());
            if (!Number.isFinite(safeTime) || safeTime < priorObservedAt.getTime()) {
              supersedesObservationId = null;
              if (row.answerOutcomeId !== null) {
                await this.recordPipelineEvent(
                  client, runId, attemptId, "SKIPPED",
                  `SUPERSESSION_ORDER_INVALID:${row.answerOutcomeId}`, prepared.inputHash
                );
                supersessionSkipRecorded = true;
              }
            } else {
              observationTime = new Date(safeTime);
            }
          }
          if (row.truthBasis === "SETTLEMENT" && supersedesObservationId === null
            && !supersessionSkipRecorded && row.answerOutcomeId !== null) {
            const matchingPrior = await client.query(`
              SELECT 1 FROM evaluator.observation AS prior
              WHERE prior.run_id=$1 AND prior.provider=$2 AND prior.model_id=$3
                AND prior.model_version=$4 AND prior.domain_id IS NOT DISTINCT FROM $5
                AND prior.step='AUTHORING' AND prior.metric=$6
                AND prior.truth_basis='CONSENSUS' AND prior.source_kind='NODE_STRENGTH'
              LIMIT 1
            `, [row.runId, row.provider, row.modelId, row.modelVersion, row.domainId, row.metric]);
            if (matchingPrior.rowCount !== 0) {
              await this.recordPipelineEvent(
                client, runId, attemptId, "SKIPPED",
                `SUPERSESSION_PRIOR_UNAVAILABLE:${row.answerOutcomeId}`, prepared.inputHash
              );
            }
          }
          const result = await client.query(`
            INSERT INTO evaluator.observation (
              run_id, provider, model_id, model_version, domain_id, step, metric,
              value, outcome_json, truth_basis, source_kind, source_ref,
              source_raw_artifact_ref, answer_outcome_id, derivation_version,
              supersedes_observation_id, provenance_json, observed_at, at_seq
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19)
            ON CONFLICT DO NOTHING
          `, [
            row.runId, row.provider, row.modelId, row.modelVersion, row.domainId, row.step,
            row.metric, row.value, row.outcomeJson === null ? null : JSON.stringify(row.outcomeJson),
            row.truthBasis, row.sourceKind, row.sourceRef, row.sourceRawArtifactRef,
            row.answerOutcomeId, HARVEST_DERIVATION_VERSION, supersedesObservationId,
            JSON.stringify(row.provenanceJson), observationTime, await allocateSequence(client)
          ]);
          inserted += result.rowCount ?? 0;
        }
        if (alreadyHarvested) {
          await this.recordPipelineEvent(
            client, runId, attemptId, "SKIPPED",
            inserted > 0 ? "SETTLEMENT_RECONCILIATION_SUCCEEDED" : "NO_NEW_SETTLEMENTS",
            prepared.inputHash
          );
          return inserted > 0
            ? Object.freeze({ state: "SETTLEMENTS_RECONCILED" as const, runId, observationsInserted: inserted })
            : Object.freeze({ state: "ALREADY_HARVESTED" as const, runId });
        }
        await this.recordPipelineEvent(
          client, runId, attemptId, "SUCCEEDED", "TERMINAL_HARVEST_SUCCEEDED", prepared.inputHash
        );
        return Object.freeze({ state: "HARVESTED" as const, runId, observationsInserted: inserted });
      });
    } catch (error) {
      const failureInputHash = inputHash ?? createHash("sha256").update(JSON.stringify({
        run_id: runId,
        observed_at: observedAt instanceof Date && Number.isFinite(observedAt.getTime())
          ? observedAt.toISOString()
          : null,
        failure_phase: "PREPARE"
      })).digest("hex");
      try {
        await withWriteTransaction(this.pool, async (client) => {
          await this.recordPipelineEvent(
            client, runId, attemptId, "FAILED", "TERMINAL_HARVEST_FAILED", failureInputHash
          );
        });
      } catch {
        // Preserve the harvesting failure; receipt persistence is best-effort if the database itself is unavailable.
      }
      throw error;
    }
  }

  private async recordPipelineEvent(
    client: PoolClient,
    runId: string,
    attemptId: string,
    state: "STARTED" | "SUCCEEDED" | "FAILED" | "SKIPPED",
    reason: string,
    inputHash: string
  ): Promise<void> {
    await client.query(`
      INSERT INTO evaluator.pipeline_event (
        run_id, pipeline, pipeline_version, attempt_id, state, reason, input_hash, at_seq
      ) VALUES ($1,'HARVEST',$2,$3,$4,$5,$6,$7)
    `, [runId, HARVEST_PIPELINE_VERSION, attemptId, state, reason, inputHash, await allocateSequence(client)]);
  }

  private async readSnapshot(
    client: PoolClient,
    runId: string,
    observedAt: Date,
    preparedContent: PreparedRunContentCipher | null
  ): Promise<EvaluatorHarvestSnapshot> {
    const domain = await client.query<{ domain_id: string }>(
      "SELECT domain_id FROM evaluator.question_domain WHERE run_id=$1",
      [runId]
    );
    const artifacts = await client.query<{
      raw_artifact_id: string; attempt_id: string; provider: string;
      model_id: string; model_version: string | null;
    }>(`
      WITH refs AS (
        SELECT provenance_ref AS raw_artifact_id FROM core.node WHERE run_id=$1 AND provenance_ref IS NOT NULL
        UNION SELECT author_raw_artifact_ref FROM ledger.node_review WHERE run_id=$1
        UNION SELECT review_raw_artifact_ref FROM ledger.node_review WHERE run_id=$1
        UNION SELECT raw_artifact_ref FROM ledger.reduced_judgement WHERE run_id=$1
      )
      SELECT artifact.raw_artifact_id, artifact.attempt_id, artifact.provider,
             artifact.model_id, artifact.model_version
      FROM refs JOIN ledger.raw_artifact AS artifact USING (raw_artifact_id)
      ORDER BY artifact.raw_artifact_id
    `, [runId]);
    const attemptIds = artifacts.rows.map((row) => row.attempt_id);
    const modelCalls = attemptIds.length === 0 ? { rows: [] as { attempt_id: string; call_site_key: string }[] }
      : await client.query<{ attempt_id: string; call_site_key: string }>(`
          SELECT DISTINCT attempt_id, call_site_key FROM ledger.ledger_entry
          WHERE attempt_id = ANY($1::uuid[]) AND call_site_key IS NOT NULL
          ORDER BY attempt_id, call_site_key
        `, [attemptIds]);
    const nodes = await client.query<{
      node_id: string; raw_artifact_ref: string; generation_status: string;
      path_status: string; claim_type: string;
    }>(`
      SELECT node_id, provenance_ref AS raw_artifact_ref, generation_status, path_status, claim_type
      FROM core.node WHERE run_id=$1 AND provenance_ref IS NOT NULL ORDER BY node_id
    `, [runId]);
    const reviews = await client.query<{
      node_review_id: string; author_raw_artifact_ref: string; review_raw_artifact_ref: string;
      outcome: string; reasons: unknown;
      content_ciphertext: CryptoEnvelope | null;
    }>(`
      SELECT node_review_id,author_raw_artifact_ref,review_raw_artifact_ref,outcome,reasons,
             content_ciphertext
      FROM ledger.node_review WHERE run_id=$1 ORDER BY node_review_id
    `, [runId]);
    const decryptedReviews = reviews.rows.map((row) => {
      const content = decryptPreparedContentForRun<{ reasons: unknown }>(
        preparedContent, "ledger.node_review", row.node_review_id,
        row.content_ciphertext, { reasons: row.reasons }
      );
      return { ...row, reasons: content.reasons };
    });
    const judgements = await client.query<{
      reduced_judgement_id: string; raw_artifact_ref: string; tau: number;
      number_kind: string; producer: string;
    }>(`
      SELECT reduced_judgement_id, raw_artifact_ref, tau, number_kind, producer
      FROM ledger.reduced_judgement WHERE run_id=$1 ORDER BY reduced_judgement_id
    `, [runId]);
    const strengths = await client.query<{
      propagation_run_id: string; node_id: string; strength: number;
      number_kind: string; producer: string;
    }>(`
      SELECT strength.propagation_run_id, strength.node_id, strength.strength,
             strength.number_kind, strength.producer
      FROM ledger.node_strength_record AS strength
      JOIN ledger.propagation_run AS propagation USING (propagation_run_id)
      WHERE propagation.run_id=$1 ORDER BY strength.propagation_run_id, strength.node_id
    `, [runId]);
    const settlements = await client.query<{
      answer_outcome_id: string; provider: string; model_id: string; model_version: string;
      resolved_outcome: boolean; resolved_at: Date;
    }>(`
      SELECT answer_outcome_id, provider, model_id, model_version, resolved_outcome, resolved_at
      FROM scorecard.answer_outcome WHERE run_id=$1 AND accepted ORDER BY answer_outcome_id
    `, [runId]);
    const priorConsensus = await client.query<{
      observation_id: string; provider: string; model_id: string; model_version: string;
      domain_id: string | null; metric: string; observed_at: Date;
    }>(`
      SELECT observation_id,provider,model_id,model_version,domain_id,metric,observed_at
      FROM evaluator.observation AS prior
      WHERE prior.run_id=$1 AND prior.step='AUTHORING' AND prior.truth_basis='CONSENSUS'
        AND prior.source_kind='NODE_STRENGTH' AND prior.metric='prowess.outcome.v1'
        AND NOT EXISTS (
          SELECT 1 FROM evaluator.observation AS successor
          WHERE successor.supersedes_observation_id=prior.observation_id
        )
      ORDER BY provider,model_id,model_version,domain_id,observation_id
    `, [runId]);
    return Object.freeze({
      runId,
      domainId: domain.rows[0]?.domain_id ?? null,
      observedAt: new Date(observedAt),
      rawArtifacts: Object.freeze(artifacts.rows.map((row) => Object.freeze({
        rawArtifactId: row.raw_artifact_id, attemptId: row.attempt_id, provider: row.provider,
        modelId: row.model_id, modelVersion: row.model_version
      }))),
      modelCalls: Object.freeze(modelCalls.rows.map((row) => Object.freeze({
        attemptId: row.attempt_id, callSiteKey: row.call_site_key
      }))),
      authoredNodes: Object.freeze(nodes.rows.map((row) => Object.freeze({
        nodeId: row.node_id, rawArtifactRef: row.raw_artifact_ref,
        generationStatus: row.generation_status, pathStatus: row.path_status, claimType: row.claim_type
      }))),
      reviews: Object.freeze(decryptedReviews.map((row) => Object.freeze({
        nodeReviewId: row.node_review_id, authorRawArtifactRef: row.author_raw_artifact_ref,
        reviewRawArtifactRef: row.review_raw_artifact_ref, outcome: row.outcome, reasons: row.reasons
      }))),
      judgements: Object.freeze(judgements.rows.map((row) => Object.freeze({
        reducedJudgementId: row.reduced_judgement_id, rawArtifactRef: row.raw_artifact_ref,
        tau: Number(row.tau), numberKind: row.number_kind, producer: row.producer
      }))),
      strengths: Object.freeze(strengths.rows.map((row) => Object.freeze({
        propagationRunId: row.propagation_run_id, nodeId: row.node_id,
        strength: Number(row.strength), numberKind: row.number_kind, producer: row.producer
      }))),
      settlements: Object.freeze(settlements.rows.map((row) => Object.freeze({
        answerOutcomeId: row.answer_outcome_id, provider: row.provider, modelId: row.model_id,
        modelVersion: row.model_version, resolvedOutcome: row.resolved_outcome,
        resolvedAt: new Date(row.resolved_at)
      }))),
      priorConsensusOutcomes: Object.freeze(priorConsensus.rows.map((row) => Object.freeze({
        observationId: row.observation_id, provider: row.provider, modelId: row.model_id,
        modelVersion: row.model_version, domainId: row.domain_id, metric: row.metric,
        observedAt: new Date(row.observed_at)
      })))
    });
  }
}

export const PROFILE_DERIVATION_VERSION = 1 as const;
export const BIAS_LENIENCY_METRIC = "bias.leniency.v1" as const;
export const BIAS_SETTLEMENT_CONTRADICTION_METRIC = "bias.settlement_contradiction.v1" as const;
export const BIAS_LINEAGE_FAVORITISM_METRIC = "bias.lineage_favoritism_residue.v1" as const;
export const BIAS_ADDON_GRADE_QUALITY_METRIC = "bias.addon_grade_quality.v1" as const;

export interface EvaluatorProfileObservation {
  readonly observationId: string;
  readonly runId: string;
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly domainId: string | null;
  readonly step: "AUTHORING" | "JUDGING" | "REVIEWING";
  readonly metric: string;
  readonly value: number | null;
  readonly outcome: string | null;
  readonly truthBasis: "CONSENSUS" | "SETTLEMENT" | "BLIND_ADDON";
  readonly sourceKind: "AUTHORED_NODE" | "REDUCED_JUDGEMENT" | "NODE_REVIEW"
    | "NODE_STRENGTH" | "EXTERNAL_ANSWER_OUTCOME" | "BLIND_JUDGE_GRADE";
  readonly sourceRef: string;
  readonly supersedesObservationId: string | null;
  readonly itemKey: string | null;
  readonly subjectMaker: string | null;
  readonly authorMaker: string | null;
  readonly observedAt: Date;
  readonly atSequence: number;
}

export interface EvaluatorDerivedProfileCell {
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly domainId: string | null;
  readonly step: "AUTHORING" | "JUDGING" | "REVIEWING";
  readonly metric: string;
  readonly asOf: Date;
  readonly value: number | null;
  readonly n: number;
  readonly intervalLower: number | null;
  readonly intervalUpper: number | null;
  readonly consensusCount: number;
  readonly settlementCount: number;
  readonly addonCount: number;
  readonly basis: "MEASURED_PROCESS" | "MEASURED_OUTCOME" | "NONE";
  readonly derivationVersion: number;
  readonly derivationInput: readonly string[];
  readonly derivationHash: string;
}

export interface EvaluatorDerivedRank {
  readonly rankKind: "JUDGE" | "PROWESS";
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly domainId: string | null;
  readonly step: "AUTHORING" | "JUDGING" | "REVIEWING";
  readonly metric: string;
  readonly ordinal: number;
  readonly score: number;
  readonly n: number;
  readonly intervalLower: number | null;
  readonly intervalUpper: number | null;
  readonly sourceCellKeys: readonly string[];
  readonly derivationVersion: number;
  readonly asOf: Date;
}

export interface EvaluatorProfileDerivation {
  readonly biasCells: readonly EvaluatorDerivedProfileCell[];
  readonly prowessCells: readonly EvaluatorDerivedProfileCell[];
  readonly judgeRanks: readonly EvaluatorDerivedRank[];
  readonly prowessRanks: readonly EvaluatorDerivedRank[];
  readonly phaseOrder: readonly ["BIAS", "JUDGE_RANK", "PROWESS", "PROWESS_RANK"];
}

export interface ProfileIdentity {
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string;
}

function profileIdentityKey(identity: ProfileIdentity): string {
  return JSON.stringify([identity.provider, identity.modelId, identity.modelVersion]);
}

function profileCellKey(cell: Pick<EvaluatorDerivedProfileCell,
  "provider" | "modelId" | "modelVersion" | "domainId" | "step" | "metric">): string {
  return JSON.stringify([
    cell.provider, cell.modelId, cell.modelVersion, cell.domainId, cell.step, cell.metric
  ]);
}

function stableNumber(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

function arithmeticMean(values: readonly number[]): number {
  return stableNumber(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function boundedMeanInterval(
  value: number,
  n: number,
  lowerBound: number,
  upperBound: number
): readonly [number, number] {
  // Two-sided Hoeffding interval at alpha=0.05. The range multiplier is
  // material for signed metrics whose support is [-1,1], rather than [0,1].
  const radius = (upperBound - lowerBound) * Math.sqrt(Math.log(40) / (2 * n));
  return Object.freeze([
    stableNumber(Math.max(lowerBound, value - radius)),
    stableNumber(Math.min(upperBound, value + radius))
  ]);
}

function derivationHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compareProfileIdentity(left: ProfileIdentity, right: ProfileIdentity): number {
  const leftKey = profileIdentityKey(left);
  const rightKey = profileIdentityKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function compareCodePointStrings(left: string, right: string): number {
  const leftCodePoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightCodePoints = Array.from(right, (character) => character.codePointAt(0)!);
  const sharedLength = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftCodePoints[index]! - rightCodePoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftCodePoints.length - rightCodePoints.length;
}

function makeProfileCell(input: {
  readonly identity: ProfileIdentity;
  readonly domainId: string | null;
  readonly step: "AUTHORING" | "JUDGING" | "REVIEWING";
  readonly metric: string;
  readonly asOf: Date;
  readonly values: readonly number[];
  readonly counts: Readonly<{ consensus: number; settlement: number; addon: number }>;
  readonly basis: "MEASURED_PROCESS" | "MEASURED_OUTCOME";
  readonly derivationVersion: number;
  readonly derivationInput: readonly string[];
  readonly intervalBounds: readonly [number, number];
}): EvaluatorDerivedProfileCell {
  const orderedInput = Object.freeze([...input.derivationInput].sort());
  const value = input.values.length === 0 ? null : arithmeticMean(input.values);
  const interval = value === null ? null
    : boundedMeanInterval(value, input.values.length, input.intervalBounds[0], input.intervalBounds[1]);
  const body = {
    provider: input.identity.provider,
    model_id: input.identity.modelId,
    model_version: input.identity.modelVersion,
    domain_id: input.domainId,
    step: input.step,
    metric: input.metric,
    as_of: input.asOf.toISOString(),
    value,
    n: input.values.length,
    interval,
    counts: input.counts,
    derivation_version: input.derivationVersion,
    derivation_input: orderedInput
  };
  return Object.freeze({
    ...input.identity,
    domainId: input.domainId,
    step: input.step,
    metric: input.metric,
    asOf: new Date(input.asOf),
    value,
    n: input.values.length,
    intervalLower: interval?.[0] ?? null,
    intervalUpper: interval?.[1] ?? null,
    consensusCount: input.counts.consensus,
    settlementCount: input.counts.settlement,
    addonCount: input.counts.addon,
    basis: value === null ? "NONE" : input.basis,
    derivationVersion: input.derivationVersion,
    derivationInput: orderedInput,
    derivationHash: derivationHash(body)
  });
}

function activeProfileObservations(
  observations: readonly EvaluatorProfileObservation[],
  asOf: Date
): readonly EvaluatorProfileObservation[] {
  if (!Number.isFinite(asOf.getTime())) throw new TypeError("EVALUATOR_PROFILE_TIME_INVALID");
  const eligible = observations
    .filter((row) => row.observedAt.getTime() <= asOf.getTime())
    .sort((left, right) => left.atSequence - right.atSequence
      || left.observationId.localeCompare(right.observationId));
  const superseded = new Set(eligible.flatMap((row) =>
    row.supersedesObservationId === null ? [] : [row.supersedesObservationId]));
  return Object.freeze(eligible.filter((row) => !superseded.has(row.observationId)));
}

function metricForProwessObservation(row: EvaluatorProfileObservation): string | null {
  switch (row.sourceKind) {
    case "NODE_STRENGTH": return "prowess.consensus-strength.v1";
    case "EXTERNAL_ANSWER_OUTCOME": return "prowess.settlement-outcome.v1";
    case "REDUCED_JUDGEMENT": return "prowess.judging-tau.v1";
    case "BLIND_JUDGE_GRADE": return "prowess.blind-judge-grade.v1";
    case "NODE_REVIEW": return "prowess.review-outcome.v1";
    case "AUTHORED_NODE": return null;
    default: return exhaustive(row.sourceKind);
  }
}

function numericProwessValue(row: EvaluatorProfileObservation): number | null {
  if (row.sourceKind === "NODE_REVIEW") {
    return row.outcome === "agree" ? 1 : row.outcome === "dispute" ? 0 : null;
  }
  return row.value;
}

export function deriveEvaluatorProfiles(input: {
  readonly observations: readonly EvaluatorProfileObservation[];
  readonly asOf: Date;
  readonly derivationVersion?: number;
}): EvaluatorProfileDerivation {
  const derivationVersion = input.derivationVersion ?? PROFILE_DERIVATION_VERSION;
  if (!Number.isInteger(derivationVersion) || derivationVersion < 1) {
    throw new TypeError("EVALUATOR_PROFILE_DERIVATION_VERSION_INVALID");
  }
  const active = activeProfileObservations(input.observations, input.asOf);
  const judgements = active.filter((row) => row.sourceKind === "REDUCED_JUDGEMENT"
    && row.value !== null);
  const runJudgements = new Map<string, Map<string, EvaluatorProfileObservation[]>>();
  for (const row of judgements) {
    const identities = runJudgements.get(row.runId) ?? new Map<string, EvaluatorProfileObservation[]>();
    const key = profileIdentityKey(row);
    identities.set(key, [...(identities.get(key) ?? []), row]);
    runJudgements.set(row.runId, identities);
  }
  const settlements = active.filter((candidate) => candidate.sourceKind === "EXTERNAL_ANSWER_OUTCOME"
    && candidate.value !== null);
  const judgeIdentities = new Map<string, ProfileIdentity>();
  for (const row of active.filter((candidate) => candidate.sourceKind === "REDUCED_JUDGEMENT"
    || candidate.sourceKind === "BLIND_JUDGE_GRADE" || candidate.sourceKind === "NODE_REVIEW")) {
    judgeIdentities.set(profileIdentityKey(row), {
      provider: row.provider, modelId: row.modelId, modelVersion: row.modelVersion
    });
  }
  const biasCells: EvaluatorDerivedProfileCell[] = [];
  for (const identity of [...judgeIdentities.values()].sort(compareProfileIdentity)) {
    const identityJudgements = judgements.filter((row) => profileIdentityKey(row) === profileIdentityKey(identity));
    // The runner emits one reduced judgement per node. Leniency therefore uses
    // one independent sample per run: this identity's run mean minus the mean
    // of the other identities' run means. A one-identity run is uninformative.
    const identityRuns = new Set(identityJudgements.map((row) => row.runId));
    const leniencySamples = [...identityRuns].flatMap((runId) => {
      const byIdentity = runJudgements.get(runId)!;
      const own = byIdentity.get(profileIdentityKey(identity)) ?? [];
      const panelMeans = [...byIdentity.entries()]
        .filter(([key]) => key !== profileIdentityKey(identity))
        .map(([, rows]) => arithmeticMean(rows.map((row) => row.value!)));
      if (own.length === 0 || panelMeans.length === 0) return [];
      return [{
        value: stableNumber(arithmeticMean(own.map((row) => row.value!)) - arithmeticMean(panelMeans)),
        rows: [...own, ...[...byIdentity.entries()]
          .filter(([key]) => key !== profileIdentityKey(identity)).flatMap(([, rows]) => rows)]
      }];
    });
    const leniencyValues = leniencySamples.map((sample) => sample.value);
    biasCells.push(makeProfileCell({
      identity, domainId: null, step: "JUDGING", metric: BIAS_LENIENCY_METRIC,
      asOf: input.asOf, values: leniencyValues,
      counts: { consensus: leniencyValues.length, settlement: 0, addon: 0 },
      basis: "MEASURED_PROCESS", derivationVersion,
      derivationInput: [
        "formula:bias.leniency.v1=identity-run-mean-minus-other-identities-run-mean",
        ...leniencySamples.flatMap((sample) => sample.rows)
          .map((row) => `${row.observationId}@${row.atSequence}`)
      ],
      intervalBounds: [-1, 1]
    }));
    // Each settlement event is one denominator sample. It is linked only to
    // judgements from the same run and exact model identity. A mean tau of
    // exactly 0.5 is neutral and excluded; >0.5 is positive and <0.5 negative.
    const contradictionSamples = settlements.flatMap((settlement) => {
      if (profileIdentityKey(settlement) !== profileIdentityKey(identity)) return [];
      const rows = runJudgements.get(settlement.runId)?.get(profileIdentityKey(identity)) ?? [];
      if (rows.length === 0) return [];
      const judgementMean = arithmeticMean(rows.map((row) => row.value!));
      if (judgementMean === 0.5) return [];
      return [{
        value: Number((judgementMean > 0.5) !== (settlement.value! >= 0.5)),
        rows: [...rows, settlement]
      }];
    });
    const contradicted = contradictionSamples.map((sample) => sample.value);
    const contradictionInput = [
      "formula:bias.settlement_contradiction.v1=per-settlement-event;threshold:tau>0.5;neutral:tau=0.5",
      ...contradictionSamples.flatMap((sample) => sample.rows)
        .map((row) => `${row.observationId}@${row.atSequence}`)
    ];
    biasCells.push(makeProfileCell({
      identity, domainId: null, step: "JUDGING", metric: BIAS_SETTLEMENT_CONTRADICTION_METRIC,
      asOf: input.asOf, values: contradicted,
      counts: { consensus: 0, settlement: contradicted.length, addon: 0 },
      basis: "MEASURED_OUTCOME", derivationVersion, derivationInput: contradictionInput,
      intervalBounds: [0, 1]
    }));
    const identityReviews = active.filter((row) => row.sourceKind === "NODE_REVIEW"
      && profileIdentityKey(row) === profileIdentityKey(identity)
      && row.authorMaker !== null && numericProwessValue(row) !== null);
    const reviewByAuthorLineage = new Map<string, EvaluatorProfileObservation[]>();
    for (const review of identityReviews) {
      reviewByAuthorLineage.set(review.authorMaker!, [
        ...(reviewByAuthorLineage.get(review.authorMaker!) ?? []), review
      ]);
    }
    const lineageMeans = [...reviewByAuthorLineage.values()]
      .map((rows) => arithmeticMean(rows.map((row) => numericProwessValue(row)!)));
    const lineageValues = lineageMeans.length < 2 ? [] : lineageMeans.map((value, index) => {
      const otherMeans = lineageMeans.filter((_, otherIndex) => otherIndex !== index);
      return stableNumber(Math.abs(value - arithmeticMean(otherMeans)));
    });
    biasCells.push(makeProfileCell({
      identity, domainId: null, step: "JUDGING", metric: BIAS_LINEAGE_FAVORITISM_METRIC,
      asOf: input.asOf, values: lineageValues,
      counts: { consensus: lineageValues.length, settlement: 0, addon: 0 },
      basis: "MEASURED_PROCESS", derivationVersion,
      derivationInput: [
        "formula:bias.lineage_favoritism_residue.v1=mean-absolute-author-lineage-vs-other-lineages",
        ...identityReviews.map((row) => `${row.observationId}@${row.atSequence}`)
      ],
      intervalBounds: [0, 1]
    }));
    const addon = active.filter((row) => row.sourceKind === "BLIND_JUDGE_GRADE"
      && row.value !== null && profileIdentityKey(row) === profileIdentityKey(identity));
    if (addon.length > 0) {
      biasCells.push(makeProfileCell({
        identity, domainId: null, step: "JUDGING", metric: BIAS_ADDON_GRADE_QUALITY_METRIC,
        asOf: input.asOf, values: addon.map((row) => row.value!),
        counts: { consensus: 0, settlement: 0, addon: addon.length },
        basis: "MEASURED_PROCESS", derivationVersion,
        derivationInput: addon.map((row) => `${row.observationId}@${row.atSequence}`),
        intervalBounds: [0, 1]
      }));
    }
  }
  biasCells.sort((left, right) => profileCellKey(left).localeCompare(profileCellKey(right)));

  const judgeRankDrafts = [...judgeIdentities.values()].map((identity) => {
    const cells = biasCells.filter((cell) => profileIdentityKey(cell) === profileIdentityKey(identity)
      && cell.value !== null);
    const penalties = cells.map((cell) => cell.metric === BIAS_ADDON_GRADE_QUALITY_METRIC
      ? 1 - cell.value!
      : cell.metric === BIAS_SETTLEMENT_CONTRADICTION_METRIC ? cell.value! : Math.abs(cell.value!));
    return {
      identity,
      score: penalties.length === 0 ? 0 : stableNumber(Math.max(0, 1 - arithmeticMean(penalties))),
      n: cells.reduce((maximum, cell) => Math.max(maximum, cell.n), 0),
      sourceCellKeys: cells.map(profileCellKey).sort()
    };
  }).sort((left, right) => right.score - left.score || right.n - left.n
    || compareProfileIdentity(left.identity, right.identity));
  const judgeRanks: EvaluatorDerivedRank[] = judgeRankDrafts.map((rank, index) => Object.freeze({
    rankKind: "JUDGE" as const, ...rank.identity, domainId: null, step: "JUDGING" as const,
    metric: "bias.composite-rank.v1",
    ordinal: index + 1, score: rank.score, n: rank.n,
    intervalLower: null, intervalUpper: null,
    sourceCellKeys: Object.freeze(rank.sourceCellKeys), derivationVersion, asOf: new Date(input.asOf)
  }));
  const judgeRankByIdentity = new Map(judgeRanks.map((rank) => [profileIdentityKey(rank), rank]));

  const prowessGroups = new Map<string, { identity: ProfileIdentity; domainId: string | null;
    step: EvaluatorProfileObservation["step"]; metric: string; rows: EvaluatorProfileObservation[] }>();
  for (const row of active) {
    const metric = metricForProwessObservation(row);
    const value = numericProwessValue(row);
    if (metric === null || value === null) continue;
    const key = JSON.stringify([
      row.provider, row.modelId, row.modelVersion, row.domainId, row.step, metric
    ]);
    const group = prowessGroups.get(key) ?? {
      identity: { provider: row.provider, modelId: row.modelId, modelVersion: row.modelVersion },
      domainId: row.domainId, step: row.step, metric, rows: []
    };
    group.rows.push(row);
    prowessGroups.set(key, group);
  }
  const prowessCells = [...prowessGroups.values()].map((group) => {
    const rank = judgeRankByIdentity.get(profileIdentityKey(group.identity));
    const biasContext = rank === undefined || (group.step !== "JUDGING" && group.step !== "REVIEWING")
      ? [] : [`bias-rank:${rank.provider}/${rank.modelId}/${rank.modelVersion}@${rank.ordinal}`];
    return makeProfileCell({
      identity: group.identity, domainId: group.domainId, step: group.step, metric: group.metric,
      asOf: input.asOf, values: group.rows.map((row) => numericProwessValue(row)!),
      counts: {
        consensus: group.rows.filter((row) => row.truthBasis === "CONSENSUS").length,
        settlement: group.rows.filter((row) => row.truthBasis === "SETTLEMENT").length,
        addon: group.rows.filter((row) => row.truthBasis === "BLIND_ADDON").length
      },
      basis: group.rows.some((row) => row.truthBasis === "SETTLEMENT")
        ? "MEASURED_OUTCOME" : "MEASURED_PROCESS",
      derivationVersion,
      derivationInput: [
        ...group.rows.map((row) => `${row.observationId}@${row.atSequence}`), ...biasContext
      ],
      intervalBounds: [0, 1]
    });
  }).sort((left, right) => profileCellKey(left).localeCompare(profileCellKey(right)));

  const prowessRankGroups = new Map<string, EvaluatorDerivedProfileCell[]>();
  for (const cell of prowessCells.filter((candidate) => candidate.value !== null)) {
    const key = JSON.stringify([cell.domainId, cell.step, cell.metric]);
    const cells = prowessRankGroups.get(key) ?? [];
    cells.push(cell);
    prowessRankGroups.set(key, cells);
  }
  const prowessRanks: EvaluatorDerivedRank[] = [];
  for (const cells of prowessRankGroups.values()) {
    const selected = [...cells]
      .sort((left, right) => right.value! - left.value! || right.n - left.n
        || compareProfileIdentity(left, right));
    selected.forEach((cell, index) => prowessRanks.push(Object.freeze({
      rankKind: "PROWESS", provider: cell.provider, modelId: cell.modelId,
      modelVersion: cell.modelVersion, domainId: cell.domainId, step: cell.step, metric: cell.metric,
      ordinal: index + 1, score: cell.value!, n: cell.n,
      intervalLower: cell.intervalLower, intervalUpper: cell.intervalUpper,
      sourceCellKeys: Object.freeze([profileCellKey(cell)]), derivationVersion,
      asOf: new Date(input.asOf)
    })));
  }
  prowessRanks.sort((left, right) => JSON.stringify([left.domainId, left.step, left.metric, left.ordinal])
    .localeCompare(JSON.stringify([right.domainId, right.step, right.metric, right.ordinal])));
  return Object.freeze({
    biasCells: Object.freeze(biasCells), prowessCells: Object.freeze(prowessCells),
    judgeRanks: Object.freeze(judgeRanks), prowessRanks: Object.freeze(prowessRanks),
    phaseOrder: Object.freeze(["BIAS", "JUDGE_RANK", "PROWESS", "PROWESS_RANK"] as const)
  });
}

export interface EvaluatorJudgeCandidate extends ProfileIdentity {
  readonly maker: string;
  readonly healthy: boolean;
}

export function selectJudgesByBiasRank(input: {
  readonly seatCount: number;
  readonly candidates: readonly EvaluatorJudgeCandidate[];
  readonly ranks: readonly (ProfileIdentity & { readonly ordinal: number })[];
  readonly excludedMakers: readonly string[];
  readonly numericInputProducerIdentities: readonly ProfileIdentity[];
}): readonly EvaluatorJudgeCandidate[] {
  if (!Number.isInteger(input.seatCount) || input.seatCount < 0) {
    throw new TypeError("EVALUATOR_JUDGE_SEAT_COUNT_INVALID");
  }
  const producerKeys = new Set(input.numericInputProducerIdentities.map(profileIdentityKey));
  if (input.candidates.some((candidate) => producerKeys.has(profileIdentityKey(candidate)))) {
    throw new TypedDomainError(
      "SELF_ROUTING_FORBIDDEN",
      "SELF_ROUTING_FORBIDDEN: a judge candidate may not supply numeric inputs that select itself"
    );
  }
  const excludedMakers = new Set(input.excludedMakers);
  const rankByIdentity = new Map(input.ranks.map((rank) => {
    if (!Number.isInteger(rank.ordinal) || rank.ordinal < 1) {
      throw new TypeError("EVALUATOR_JUDGE_RANK_INVALID");
    }
    return [profileIdentityKey(rank), rank.ordinal] as const;
  }));
  return Object.freeze(input.candidates
    .filter((candidate) => candidate.healthy && !excludedMakers.has(candidate.maker))
    .sort((left, right) => (rankByIdentity.get(profileIdentityKey(left)) ?? Number.MAX_SAFE_INTEGER)
      - (rankByIdentity.get(profileIdentityKey(right)) ?? Number.MAX_SAFE_INTEGER)
      || compareProfileIdentity(left, right))
    .slice(0, input.seatCount)
    .map((candidate) => Object.freeze({ ...candidate })));
}

export const SEAT_SHARE_NOT_CONSUMED_REASON = "FR-8.0_PANEL_SHAPE_AND_V_BIND_REQUIRED" as const;

export interface EvaluatorSeatShareCandidate extends ProfileIdentity {
  readonly maker: string;
  readonly healthy: boolean;
  readonly prowessOrdinal: number;
  readonly relativeCost: number | null;
  readonly costComparability: "COMPARABLE" | "UNKNOWN";
}

export interface EvaluatorSeatShareVector {
  readonly best: number;
  readonly runnerUp: number;
  readonly residual: number;
}

export interface EvaluatorSeatSharePolicy {
  readonly rowKey: typeof EVALUATOR_SEAT_SHARE_POLICY_ROW_KEY;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly formulaVersion: number;
  readonly premiumMinimumDepth: number;
  readonly shares: Readonly<{
    premium: EvaluatorSeatShareVector;
    normal: EvaluatorSeatShareVector;
    bestAlsoCheaper: EvaluatorSeatShareVector;
  }>;
}

export interface EvaluatorSeatShareInput {
  readonly requestedSeatCount: number;
  readonly riskTier: "casual" | "standard" | "high-stakes";
  readonly depth: number;
  readonly candidates: readonly EvaluatorSeatShareCandidate[];
  readonly policy: EvaluatorSeatSharePolicy;
  readonly numericInputProducerIdentities: readonly ProfileIdentity[];
}

export interface EvaluatorSeatAllocation extends ProfileIdentity {
  readonly maker: string;
  readonly prowessOrdinal: number;
  readonly relativeCost: number | null;
  readonly costComparability: "COMPARABLE" | "UNKNOWN";
  readonly seatCount: number;
}

export interface EvaluatorSeatShareDecision {
  readonly formulaVersion: number;
  readonly selectedVector: "PREMIUM" | "NORMAL" | "BEST_ALSO_CHEAPER";
  readonly requestedSeatCount: number;
  readonly allocations: readonly EvaluatorSeatAllocation[];
}

function assertSeatShareVector(name: string, vector: EvaluatorSeatShareVector): void {
  const entries = [vector.best, vector.runnerUp, vector.residual];
  if (entries.some((share) => !Number.isFinite(share) || share < 0)
    || Math.abs(entries.reduce((sum, share) => sum + share, 0) - 1) > 1e-12) {
    throw new TypeError(`EVALUATOR_SEAT_SHARE_VECTOR_INVALID:${name}`);
  }
}

function compareSeatShareCandidate(
  left: EvaluatorSeatShareCandidate,
  right: EvaluatorSeatShareCandidate
): number {
  const rankDifference = left.prowessOrdinal - right.prowessOrdinal;
  if (rankDifference !== 0) return rankDifference;
  if (left.costComparability === "COMPARABLE" && right.costComparability === "COMPARABLE") {
    const costDifference = left.relativeCost! - right.relativeCost!;
    if (costDifference !== 0) return costDifference;
  }
  return compareProfileIdentity(left, right);
}

function largestRemainderSeats(
  seatCount: number,
  weights: readonly number[]
): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(totalWeight > 0)) throw new TypeError("EVALUATOR_SEAT_SHARE_WEIGHT_INVALID");
  const quotas = weights.map((weight) => seatCount * weight / totalWeight);
  const seats = quotas.map(Math.floor);
  const unallocated = seatCount - seats.reduce((sum, count) => sum + count, 0);
  const remainderOrder = quotas.map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < unallocated; index += 1) {
    const seatIndex = remainderOrder[index]!.index;
    seats[seatIndex] = seats[seatIndex]! + 1;
  }
  return seats;
}

function seatShareInputReceipt(input: EvaluatorSeatShareInput): Readonly<Record<string, unknown>> {
  return Object.freeze({
    requested_seat_count: input.requestedSeatCount,
    risk_tier: input.riskTier,
    depth: input.depth,
    candidates: Object.freeze(input.candidates.map((candidate) => Object.freeze({
      provider: candidate.provider,
      model_id: candidate.modelId,
      model_version: candidate.modelVersion,
      maker: candidate.maker,
      healthy: candidate.healthy,
      prowess_ordinal: candidate.prowessOrdinal,
      relative_cost: candidate.relativeCost,
      cost_comparability: candidate.costComparability
    })).sort((left, right) => compareCodePointStrings(JSON.stringify(left), JSON.stringify(right)))),
    policy: Object.freeze({
      row_key: input.policy.rowKey,
      register_version: input.policy.registerVersion,
      source_ref: input.policy.sourceRef,
      formula_version: input.policy.formulaVersion,
      premium_minimum_depth: input.policy.premiumMinimumDepth,
      shares: Object.freeze({
        premium: Object.freeze({ ...input.policy.shares.premium }),
        normal: Object.freeze({ ...input.policy.shares.normal }),
        best_also_cheaper: Object.freeze({ ...input.policy.shares.bestAlsoCheaper })
      })
    }),
    numeric_input_producer_identities: Object.freeze(input.numericInputProducerIdentities
      .map((identity) => Object.freeze({
        provider: identity.provider,
        model_id: identity.modelId,
        model_version: identity.modelVersion
      })).sort((left, right) => compareCodePointStrings(JSON.stringify(left), JSON.stringify(right))))
  });
}

export function allocateEvaluatorSeatShare(
  input: EvaluatorSeatShareInput
): EvaluatorSeatShareDecision {
  if (!Number.isInteger(input.requestedSeatCount) || input.requestedSeatCount < 1) {
    throw new TypeError("EVALUATOR_SEAT_COUNT_INVALID");
  }
  if (!Number.isInteger(input.depth) || input.depth < 0) {
    throw new TypeError("EVALUATOR_SEAT_SHARE_DEPTH_INVALID");
  }
  if (!Number.isInteger(input.policy.formulaVersion) || input.policy.formulaVersion < 1) {
    throw new TypeError("EVALUATOR_SEAT_SHARE_FORMULA_VERSION_INVALID");
  }
  assertPositiveRegisterVersion(input.policy.registerVersion);
  if (input.policy.rowKey !== EVALUATOR_SEAT_SHARE_POLICY_ROW_KEY
    || input.policy.sourceRef.trim() === "") {
    throw new TypeError("EVALUATOR_SEAT_SHARE_POLICY_RECEIPT_INVALID");
  }
  if (!Number.isInteger(input.policy.premiumMinimumDepth) || input.policy.premiumMinimumDepth < 0) {
    throw new TypeError("EVALUATOR_SEAT_SHARE_PREMIUM_DEPTH_INVALID");
  }
  assertSeatShareVector("premium", input.policy.shares.premium);
  assertSeatShareVector("normal", input.policy.shares.normal);
  assertSeatShareVector("bestAlsoCheaper", input.policy.shares.bestAlsoCheaper);
  const identities = new Set<string>();
  for (const candidate of input.candidates) {
    const identity = profileIdentityKey(candidate);
    if (identities.has(identity)) throw new TypeError("EVALUATOR_SEAT_SHARE_CANDIDATE_DUPLICATE");
    identities.add(identity);
    if (!Number.isInteger(candidate.prowessOrdinal) || candidate.prowessOrdinal < 1) {
      throw new TypeError("EVALUATOR_SEAT_SHARE_PROWESS_RANK_INVALID");
    }
    const comparable = candidate.costComparability === "COMPARABLE";
    if (comparable !== (candidate.relativeCost !== null)
      || (candidate.relativeCost !== null
        && (!Number.isFinite(candidate.relativeCost) || candidate.relativeCost < 0))) {
      throw new TypeError("EVALUATOR_SEAT_SHARE_RELATIVE_COST_INVALID");
    }
  }
  const producerKeys = new Set(input.numericInputProducerIdentities.map(profileIdentityKey));
  if (input.candidates.some((candidate) => producerKeys.has(profileIdentityKey(candidate)))) {
    throw new TypedDomainError(
      "SELF_ROUTING_FORBIDDEN",
      "SELF_ROUTING_FORBIDDEN: a seat candidate may not supply numeric inputs that allocate itself"
    );
  }
  const eligible = input.candidates.filter((candidate) => candidate.healthy)
    .sort(compareSeatShareCandidate);
  if (eligible.length === 0) throw new TypedDomainError("NO_ELIGIBLE_MODEL", "NO_ELIGIBLE_MODEL");
  if (eligible.length === 1) {
    const only = eligible[0]!;
    return Object.freeze({
      formulaVersion: input.policy.formulaVersion,
      selectedVector: "NORMAL",
      requestedSeatCount: input.requestedSeatCount,
      allocations: Object.freeze([Object.freeze({
        provider: only.provider,
        modelId: only.modelId,
        modelVersion: only.modelVersion,
        maker: only.maker,
        prowessOrdinal: only.prowessOrdinal,
        relativeCost: only.relativeCost,
        costComparability: only.costComparability,
        seatCount: input.requestedSeatCount
      })])
    });
  }
  const best = eligible[0]!;
  const runnerUp = eligible[1]!;
  const bestAlsoCheaper = best.costComparability === "COMPARABLE"
    && runnerUp.costComparability === "COMPARABLE"
    && best.relativeCost! < runnerUp.relativeCost!;
  const premium = input.riskTier === "high-stakes" && input.depth >= input.policy.premiumMinimumDepth;
  const selectedVector = bestAlsoCheaper ? "BEST_ALSO_CHEAPER" as const
    : premium ? "PREMIUM" as const : "NORMAL" as const;
  const vector = bestAlsoCheaper ? input.policy.shares.bestAlsoCheaper
    : premium ? input.policy.shares.premium : input.policy.shares.normal;
  const residualCandidates = eligible.slice(2);
  const residualDenominator = residualCandidates.reduce((sum, _candidate, index) => sum + 1 / (index + 3), 0);
  const weights = [
    vector.best,
    vector.runnerUp,
    ...residualCandidates.map((_candidate, index) =>
      residualDenominator === 0 ? 0 : vector.residual * (1 / (index + 3)) / residualDenominator)
  ];
  const seats = largestRemainderSeats(input.requestedSeatCount, weights);
  if (input.requestedSeatCount >= 2 && vector.runnerUp > 0 && seats[1] === 0) {
    const donor = seats.findIndex((count, index) => index !== 1 && count > 1);
    if (donor >= 0) {
      seats[donor] = seats[donor]! - 1;
      seats[1] = 1;
    }
  }
  const allocations = eligible.map((candidate, index) => Object.freeze({
    provider: candidate.provider,
    modelId: candidate.modelId,
    modelVersion: candidate.modelVersion,
    maker: candidate.maker,
    prowessOrdinal: candidate.prowessOrdinal,
    relativeCost: candidate.relativeCost,
    costComparability: candidate.costComparability,
    seatCount: seats[index]!
  }));
  return Object.freeze({
    formulaVersion: input.policy.formulaVersion,
    selectedVector,
    requestedSeatCount: input.requestedSeatCount,
    allocations: Object.freeze(allocations)
  });
}

export interface PersistedEvaluatorSeatShareDecision {
  readonly shadowDecisionId: string;
  readonly inserted: boolean;
  readonly inputReceipt: Readonly<Record<string, unknown>>;
  readonly decision: EvaluatorSeatShareDecision;
}

export class PostgresEvaluatorSeatShareRepository {
  constructor(private readonly pool: Pool) {}

  async computeAndPersistShadowDecision(input: {
    readonly runId: string;
    readonly input: EvaluatorSeatShareInput;
  }): Promise<PersistedEvaluatorSeatShareDecision> {
    const decision = allocateEvaluatorSeatShare(input.input);
    const inputReceipt = seatShareInputReceipt(input.input);
    const inputHash = createHash("sha256").update(JSON.stringify(inputReceipt)).digest("hex");
    return withWriteTransaction(this.pool, async (client) => {
      const inserted = await client.query<{ shadow_decision_id: string }>(`
        INSERT INTO evaluator.shadow_decision (
          run_id,kind,input_json,input_hash,output_json,binding_state,
          formula_version,not_consumed_reason,at_seq
        ) VALUES ($1,'SEAT_SHARE',$2::jsonb,$3,$4::jsonb,'UNBOUND',$5,$6,$7)
        ON CONFLICT (run_id,kind,input_hash,formula_version) DO NOTHING
        RETURNING shadow_decision_id
      `, [
        input.runId,
        JSON.stringify(inputReceipt),
        inputHash,
        JSON.stringify(decision),
        input.input.policy.formulaVersion,
        SEAT_SHARE_NOT_CONSUMED_REASON,
        await allocateSequence(client)
      ]);
      const insertedId = inserted.rows[0]?.shadow_decision_id;
      if (insertedId !== undefined) {
        return Object.freeze({ shadowDecisionId: insertedId, inserted: true, inputReceipt, decision });
      }
      const existing = await client.query<{ shadow_decision_id: string }>(`
        SELECT shadow_decision_id FROM evaluator.shadow_decision
        WHERE run_id=$1 AND kind='SEAT_SHARE' AND input_hash=$2 AND formula_version=$3
      `, [input.runId, inputHash, input.input.policy.formulaVersion]);
      const shadowDecisionId = existing.rows[0]?.shadow_decision_id;
      if (shadowDecisionId === undefined) throw new TypeError("EVALUATOR_SHADOW_DECISION_WRITE_FAILED");
      return Object.freeze({ shadowDecisionId, inserted: false, inputReceipt, decision });
    });
  }
}

export interface EvaluatorProfileStrategyReceipt {
  readonly rowKey: string;
  readonly registerVersion: number;
  readonly sourceRef: string;
}

export interface EvaluatorProfilePersistenceResult {
  readonly profileCellsInserted: number;
  readonly rankSnapshotsInserted: number;
  readonly derivation: EvaluatorProfileDerivation;
}

interface PersistedProfileCellRef {
  readonly profileCellId: string;
  readonly key: string;
}

export class PostgresEvaluatorProfileRepository {
  constructor(private readonly pool: Pool) {}

  async deriveAndPersist(input: {
    readonly asOf: Date;
    readonly derivationVersion?: number;
    readonly strategy: EvaluatorProfileStrategyReceipt;
  }): Promise<EvaluatorProfilePersistenceResult> {
    const derivationVersion = input.derivationVersion ?? PROFILE_DERIVATION_VERSION;
    requireNonblank(input.strategy.rowKey, "EVALUATOR_PROFILE_STRATEGY_ROW_KEY_INVALID");
    requireNonblank(input.strategy.sourceRef, "EVALUATOR_PROFILE_STRATEGY_SOURCE_REF_INVALID");
    assertPositiveRegisterVersion(input.strategy.registerVersion);
    if (!Number.isFinite(input.asOf.getTime())) throw new TypeError("EVALUATOR_PROFILE_TIME_INVALID");
    return withWriteTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `evaluator-profile:${input.asOf.toISOString()}:${derivationVersion}`
      ]);
      const observations = await this.readObservations(client, input.asOf);
      const derivation = deriveEvaluatorProfiles({
        observations, asOf: input.asOf, derivationVersion
      });
      let profileCellsInserted = 0;
      let rankSnapshotsInserted = 0;
      const persistedCells = new Map<string, string>();

      // Bias cells and their rank are durable before prowess begins. This ordering is
      // intentional: judge-dependent prowess derivation inputs cite the bias ordinal.
      for (const cell of derivation.biasCells) {
        const persisted = await this.insertProfileCell(client, cell, input.strategy);
        persistedCells.set(persisted.key, persisted.profileCellId);
        profileCellsInserted += persisted.inserted;
      }
      for (const rank of derivation.judgeRanks) {
        rankSnapshotsInserted += await this.insertRankSnapshot(client, rank, persistedCells);
      }
      for (const cell of derivation.prowessCells) {
        const persisted = await this.insertProfileCell(client, cell, input.strategy);
        persistedCells.set(persisted.key, persisted.profileCellId);
        profileCellsInserted += persisted.inserted;
      }
      for (const rank of derivation.prowessRanks) {
        rankSnapshotsInserted += await this.insertRankSnapshot(client, rank, persistedCells);
      }
      return Object.freeze({ profileCellsInserted, rankSnapshotsInserted, derivation });
    });
  }

  private async readObservations(
    client: PoolClient,
    asOf: Date
  ): Promise<readonly EvaluatorProfileObservation[]> {
    const result = await client.query<{
      observation_id: string; run_id: string; provider: string; model_id: string;
      model_version: string; domain_id: string | null; step: EvaluatorProfileObservation["step"];
      metric: string; value: number | null; outcome: string | null;
      truth_basis: EvaluatorProfileObservation["truthBasis"];
      source_kind: EvaluatorProfileObservation["sourceKind"]; source_ref: string;
      supersedes_observation_id: string | null; item_key: string | null;
      subject_maker: string | null; author_maker: string | null;
      observed_at: Date; at_seq: string;
    }>(`
      SELECT observation.observation_id,observation.run_id,observation.provider,
             observation.model_id,observation.model_version,observation.domain_id,
             observation.step,observation.metric,observation.value,
             observation.outcome_json->>'outcome' AS outcome,
             observation.truth_basis,observation.source_kind,observation.source_ref,
             observation.supersedes_observation_id,
             COALESCE(
               observation.provenance_json->>'item_key',judgement.node_id::text,review.node_id::text
             )
               AS item_key,
             COALESCE(observation.provenance_json->>'subject_maker',subject_artifact.maker)
               AS subject_maker,
             COALESCE(
               observation.provenance_json->>'author_maker',review_author_artifact.maker,
               judged_author_artifact.maker
             )
               AS author_maker,
             observation.observed_at,observation.at_seq::text AS at_seq
      FROM evaluator.observation AS observation
      LEFT JOIN ledger.reduced_judgement AS judgement
        ON observation.source_kind='REDUCED_JUDGEMENT'
       AND judgement.reduced_judgement_id::text=observation.source_ref
      LEFT JOIN core.node AS judged_node ON judged_node.node_id=judgement.node_id
      LEFT JOIN ledger.node_review AS review
        ON observation.source_kind='NODE_REVIEW'
       AND review.node_review_id::text=observation.source_ref
      LEFT JOIN ledger.raw_artifact AS subject_artifact
        ON subject_artifact.raw_artifact_id=observation.source_raw_artifact_ref
      LEFT JOIN ledger.raw_artifact AS judged_author_artifact
        ON judged_author_artifact.raw_artifact_id=judged_node.provenance_ref
      LEFT JOIN ledger.raw_artifact AS review_author_artifact
        ON review_author_artifact.raw_artifact_id=review.author_raw_artifact_ref
      WHERE observation.observed_at <= $1
      ORDER BY observation.at_seq,observation.observation_id
    `, [asOf]);
    return Object.freeze(result.rows.map((row) => Object.freeze({
      observationId: row.observation_id,
      runId: row.run_id,
      provider: row.provider,
      modelId: row.model_id,
      modelVersion: row.model_version,
      domainId: row.domain_id,
      step: row.step,
      metric: row.metric,
      value: row.value === null ? null : Number(row.value),
      outcome: row.outcome,
      truthBasis: row.truth_basis,
      sourceKind: row.source_kind,
      sourceRef: row.source_ref,
      supersedesObservationId: row.supersedes_observation_id,
      itemKey: row.item_key,
      subjectMaker: row.subject_maker,
      authorMaker: row.author_maker,
      observedAt: new Date(row.observed_at),
      atSequence: Number(row.at_seq)
    })));
  }

  private async insertProfileCell(
    client: PoolClient,
    cell: EvaluatorDerivedProfileCell,
    strategy: EvaluatorProfileStrategyReceipt
  ): Promise<PersistedProfileCellRef & { readonly inserted: number }> {
    const inserted = await client.query<{ profile_cell_id: string }>(`
      INSERT INTO evaluator.profile_cell (
        provider,model_id,model_version,domain_id,step,metric,as_of,value,n,
        interval_lower,interval_upper,consensus_count,settlement_count,addon_count,
        basis,derivation_version,derivation_input,derivation_hash,strategy_row_key,
        strategy_register_version,strategy_source_ref,at_seq
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,
        $19,$20,$21,$22
      ) ON CONFLICT DO NOTHING RETURNING profile_cell_id
    `, [
      cell.provider, cell.modelId, cell.modelVersion, cell.domainId, cell.step, cell.metric,
      cell.asOf, cell.value, cell.n, cell.intervalLower, cell.intervalUpper,
      cell.consensusCount, cell.settlementCount, cell.addonCount, cell.basis,
      cell.derivationVersion, JSON.stringify(cell.derivationInput), cell.derivationHash,
      strategy.rowKey, strategy.registerVersion, strategy.sourceRef,
      await allocateSequence(client)
    ]);
    let profileCellId = inserted.rows[0]?.profile_cell_id;
    if (profileCellId === undefined) {
      const existing = await client.query<{ profile_cell_id: string; derivation_hash: string }>(`
        SELECT profile_cell_id,derivation_hash FROM evaluator.profile_cell
        WHERE provider=$1 AND model_id=$2 AND model_version=$3
          AND domain_id IS NOT DISTINCT FROM $4 AND step=$5 AND metric=$6
          AND as_of=$7 AND derivation_version=$8
      `, [
        cell.provider, cell.modelId, cell.modelVersion, cell.domainId, cell.step,
        cell.metric, cell.asOf, cell.derivationVersion
      ]);
      const prior = existing.rows[0];
      if (prior === undefined) {
        throw new TypedDomainError(
          "EVALUATOR_PROFILE_DERIVATION_CONFLICT",
          "EVALUATOR_PROFILE_DERIVATION_CONFLICT: natural key collision was not resolvable"
        );
      }
      if (prior.derivation_hash !== cell.derivationHash) {
        throw new TypedDomainError(
          "EVALUATOR_PROFILE_DERIVATION_CONFLICT",
          `EVALUATOR_PROFILE_DERIVATION_CONFLICT: changed input for ${profileCellKey(cell)}`
        );
      }
      profileCellId = prior.profile_cell_id;
    }
    return Object.freeze({
      profileCellId,
      key: profileCellKey(cell),
      inserted: inserted.rowCount ?? 0
    });
  }

  private async insertRankSnapshot(
    client: PoolClient,
    rank: EvaluatorDerivedRank,
    persistedCells: ReadonlyMap<string, string>
  ): Promise<number> {
    const sourceProfileCellIds = rank.sourceCellKeys.map((key) => {
      const id = persistedCells.get(key);
      if (id === undefined) throw new Error(`EVALUATOR_PROFILE_CELL_REF_UNRESOLVED:${key}`);
      return id;
    }).sort();
    const sourceHash = derivationHash({
      source_profile_cell_ids: sourceProfileCellIds,
      derivation_version: rank.derivationVersion,
      rank_kind: rank.rankKind,
      provider: rank.provider,
      model_id: rank.modelId,
      model_version: rank.modelVersion,
      domain_id: rank.domainId,
      step: rank.step,
      metric: rank.metric,
      ordinal: rank.ordinal,
      score: rank.score,
      n: rank.n,
      interval_lower: rank.intervalLower,
      interval_upper: rank.intervalUpper
    });
    const result = await client.query<{ rank_snapshot_id: string }>(`
      INSERT INTO evaluator.rank_snapshot (
        rank_kind,provider,model_id,model_version,domain_id,step,metric,ordinal,score,n,
        interval_lower,interval_upper,source_profile_cell_ids,source_hash,
        derivation_version,as_of,at_seq
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17)
      ON CONFLICT DO NOTHING RETURNING rank_snapshot_id
    `, [
      rank.rankKind, rank.provider, rank.modelId, rank.modelVersion, rank.domainId,
      rank.step, rank.metric, rank.ordinal, rank.score, rank.n, rank.intervalLower, rank.intervalUpper,
      JSON.stringify(sourceProfileCellIds), sourceHash, rank.derivationVersion,
      rank.asOf, await allocateSequence(client)
    ]);
    if ((result.rowCount ?? 0) !== 0) return result.rowCount ?? 0;
    const existing = await client.query<{ source_hash: string }>(`
      SELECT source_hash FROM evaluator.rank_snapshot
      WHERE rank_kind=$1 AND domain_id IS NOT DISTINCT FROM $2 AND step=$3 AND metric=$4
        AND as_of=$5 AND derivation_version=$6
        AND (
          ordinal=$7 OR (
            provider=$8 AND model_id=$9 AND model_version=$10
          )
        )
      LIMIT 1
    `, [
      rank.rankKind, rank.domainId, rank.step, rank.metric, rank.asOf,
      rank.derivationVersion, rank.ordinal, rank.provider, rank.modelId, rank.modelVersion
    ]);
    if (existing.rows[0]?.source_hash !== sourceHash) {
      throw new TypedDomainError(
        "EVALUATOR_RANK_DERIVATION_CONFLICT",
        `EVALUATOR_RANK_DERIVATION_CONFLICT: changed rank input for ${rank.metric}`
      );
    }
    return 0;
  }
}

export const METERING_CAPTURE_VERSION = 1 as const;
export const RELATIVE_COST_DERIVATION_VERSION = 1 as const;
export const RELATIVE_COST_NORMALIZATION_BASIS = "relative-external-spend/v1" as const;

export interface ObservedModelCallUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
  readonly x_cost_usd?: number;
}

export interface ModelCallUsageInput {
  readonly ledgerEntryId: string;
  readonly rawArtifactId: string | null;
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly callSiteKey: string;
  readonly runtimeClass: "PAID_REMOTE" | "LOCAL_VLLM";
  readonly usage: ObservedModelCallUsage | null;
}

function assertObservedUsage(usage: ObservedModelCallUsage): void {
  const values = [usage.prompt_tokens, usage.completion_tokens, usage.total_tokens, usage.x_cost_usd];
  if (!values.some((value) => value !== undefined)) throw new TypeError("MODEL_CALL_USAGE_EMPTY");
  if (values.some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) {
    throw new TypeError("MODEL_CALL_USAGE_INVALID");
  }
  if ([usage.prompt_tokens, usage.completion_tokens, usage.total_tokens]
    .some((value) => value !== undefined && !Number.isInteger(value))) {
    throw new TypeError("MODEL_CALL_USAGE_TOKEN_INVALID");
  }
  if (usage.total_tokens !== undefined && usage.prompt_tokens !== undefined
    && usage.completion_tokens !== undefined
    && usage.total_tokens !== usage.prompt_tokens + usage.completion_tokens) {
    throw new TypeError("MODEL_CALL_USAGE_TOTAL_MISMATCH");
  }
}

export class EvaluatorMeteringRepository {
  constructor(private readonly pool: Pool) {}

  async recordCall(input: ModelCallUsageInput): Promise<string> {
    if (input.usage !== null) assertObservedUsage(input.usage);
    return withWriteTransaction(this.pool, async (client) => {
      const sequence = await allocateSequence(client);
      const inserted = await client.query<{ model_call_usage_id: string }>(`
        INSERT INTO evaluator.model_call_usage (
          ledger_entry_id, raw_artifact_id, provider, model_id, model_version,
          call_site_key, runtime_class, metering_status, prompt_tokens,
          completion_tokens, total_tokens, reported_vendor_amount,
          reported_vendor_unit, raw_usage, capture_version, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)
        ON CONFLICT DO NOTHING
        RETURNING model_call_usage_id
      `, [
        input.ledgerEntryId,
        input.rawArtifactId,
        input.provider,
        input.modelId,
        input.modelVersion,
        input.callSiteKey,
        input.runtimeClass,
        input.usage === null ? "UNMETERED" : "METERED",
        input.usage?.prompt_tokens ?? null,
        input.usage?.completion_tokens ?? null,
        input.usage?.total_tokens ?? null,
        input.usage?.x_cost_usd ?? null,
        input.usage?.x_cost_usd === undefined ? null : "USD",
        input.usage === null ? null : JSON.stringify(input.usage),
        METERING_CAPTURE_VERSION,
        sequence
      ]);
      const insertedId = inserted.rows[0]?.model_call_usage_id;
      if (insertedId !== undefined) return insertedId;
      const existing = await client.query<{ model_call_usage_id: string }>(
        `SELECT model_call_usage_id FROM evaluator.model_call_usage
         WHERE ledger_entry_id=$1 OR raw_artifact_id=$2 LIMIT 1`,
        [input.ledgerEntryId, input.rawArtifactId]
      );
      const existingId = existing.rows[0]?.model_call_usage_id;
      if (existingId === undefined) throw new TypeError("MODEL_CALL_USAGE_WRITE_FAILED");
      return existingId;
    });
  }

  async recordRelativeCostCells(cells: readonly RelativeCostCellV1[]): Promise<readonly string[]> {
    return withWriteTransaction(this.pool, async (client) => {
      const ids: string[] = [];
      for (const cell of cells) {
        const sequence = await allocateSequence(client);
        const inserted = await client.query<{ relative_cost_cell_id: string }>(`
          INSERT INTO evaluator.relative_cost_cell (
            provider, model_id, model_version, window_start, window_end,
            relative_cost, comparability, metered_call_count, unmetered_call_count,
            source_unit_totals, normalization_basis, derivation_version,
            derivation_input, derivation_hash, as_of, at_seq
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb,$14,$15,$16
          ) ON CONFLICT (
            provider, model_id, model_version, window_start, window_end, derivation_version
          ) DO NOTHING RETURNING relative_cost_cell_id
        `, [
          cell.provider,
          cell.modelId,
          cell.modelVersion,
          cell.windowStart,
          cell.windowEnd,
          cell.relativeCost,
          cell.comparability,
          cell.meteredCallCount,
          cell.unmeteredCallCount,
          JSON.stringify(cell.sourceUnitTotals),
          cell.normalizationBasis,
          cell.derivationVersion,
          JSON.stringify(cell.derivationInput),
          cell.derivationHash,
          cell.asOf,
          sequence
        ]);
        const insertedId = inserted.rows[0]?.relative_cost_cell_id;
        if (insertedId !== undefined) ids.push(insertedId);
      }
      return Object.freeze(ids);
    });
  }
}

export interface RelativeCostUsageSample {
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly runtimeClass: "PAID_REMOTE" | "LOCAL_VLLM";
  readonly usage: ObservedModelCallUsage | null;
}

export interface RelativeCostCellV1 {
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly relativeCost: number | null;
  readonly comparability: "COMPARABLE" | "UNKNOWN";
  readonly meteredCallCount: number;
  readonly unmeteredCallCount: number;
  readonly sourceUnitTotals: Readonly<{ tokens: number; usd: number }>;
  readonly normalizationBasis: typeof RELATIVE_COST_NORMALIZATION_BASIS;
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly derivationVersion: typeof RELATIVE_COST_DERIVATION_VERSION;
  readonly derivationInput: readonly Readonly<Record<string, unknown>>[];
  readonly derivationHash: string;
  readonly asOf: Date;
}

export interface RelativeCostDerivationWindow {
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly asOf: Date;
}

function assertValidDerivationWindow(window: RelativeCostDerivationWindow): void {
  if (!Number.isFinite(window.windowStart.getTime()) || !Number.isFinite(window.windowEnd.getTime())
    || !Number.isFinite(window.asOf.getTime())) {
    throw new TypeError("RELATIVE_COST_WINDOW_INVALID");
  }
  if (window.windowEnd.getTime() <= window.windowStart.getTime()) {
    throw new TypeError("RELATIVE_COST_WINDOW_ORDER_INVALID");
  }
}

function canonicalDerivationInput(
  samples: readonly RelativeCostUsageSample[]
): readonly Readonly<Record<string, unknown>>[] {
  return Object.freeze(samples.map((sample) => Object.freeze({
    provider: sample.provider,
    model_id: sample.modelId,
    model_version: sample.modelVersion,
    runtime_class: sample.runtimeClass,
    usage: sample.usage === null ? null : Object.freeze({
      ...(sample.usage.prompt_tokens === undefined ? {} : { prompt_tokens: sample.usage.prompt_tokens }),
      ...(sample.usage.completion_tokens === undefined ? {} : { completion_tokens: sample.usage.completion_tokens }),
      ...(sample.usage.total_tokens === undefined ? {} : { total_tokens: sample.usage.total_tokens }),
      ...(sample.usage.x_cost_usd === undefined ? {} : { x_cost_usd: sample.usage.x_cost_usd })
    })
  })).sort((left, right) => {
    const leftBytes = JSON.stringify(left);
    const rightBytes = JSON.stringify(right);
    return leftBytes < rightBytes ? -1 : leftBytes > rightBytes ? 1 : 0;
  }));
}

export function deriveRelativeCostCellsV1(
  samples: readonly RelativeCostUsageSample[],
  window: RelativeCostDerivationWindow
): readonly RelativeCostCellV1[] {
  assertValidDerivationWindow(window);
  for (const sample of samples) {
    if (sample.usage !== null) assertObservedUsage(sample.usage);
  }
  const derivationInput = canonicalDerivationInput(samples);
  const derivationHash = createHash("sha256").update(JSON.stringify({
    normalization_basis: RELATIVE_COST_NORMALIZATION_BASIS,
    derivation_version: RELATIVE_COST_DERIVATION_VERSION,
    window_start: window.windowStart.toISOString(),
    window_end: window.windowEnd.toISOString(),
    derivation_input: derivationInput
  })).digest("hex");
  const groups = new Map<string, RelativeCostUsageSample[]>();
  for (const sample of samples) {
    const key = JSON.stringify([sample.provider, sample.modelId, sample.modelVersion]);
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  const summaries = [...groups.values()].map((calls) => {
    const first = calls[0]!;
    if (calls.some((call) => call.runtimeClass !== first.runtimeClass)) {
      throw new TypeError("RELATIVE_COST_RUNTIME_CLASS_MISMATCH");
    }
    const metered = calls.filter((call) => call.usage !== null);
    const paidAmounts = metered.flatMap((call) => call.usage?.x_cost_usd === undefined ? [] : [call.usage.x_cost_usd]);
    const hasCompletePaidSpend = first.runtimeClass === "PAID_REMOTE"
      && metered.length > 0
      && paidAmounts.length === metered.length;
    return {
      first,
      meteredCallCount: metered.length,
      unmeteredCallCount: calls.length - metered.length,
      tokens: metered.reduce((sum, call) => sum + (call.usage?.total_tokens
        ?? (call.usage?.prompt_tokens ?? 0) + (call.usage?.completion_tokens ?? 0)), 0),
      usd: paidAmounts.reduce((sum, amount) => sum + amount, 0),
      meanPaidUsd: hasCompletePaidSpend
        ? paidAmounts.reduce((sum, amount) => sum + amount, 0) / metered.length
        : null
    };
  });
  const maximumPositiveMean = Math.max(0, ...summaries.flatMap((summary) =>
    summary.first.runtimeClass === "PAID_REMOTE" && summary.meanPaidUsd !== null && summary.meanPaidUsd > 0
      ? [summary.meanPaidUsd]
      : []
  ));
  return Object.freeze(summaries.map((summary) => {
    const relativeCost = summary.first.runtimeClass === "LOCAL_VLLM"
      ? 0
      : summary.meanPaidUsd !== null && summary.meanPaidUsd > 0 && maximumPositiveMean > 0
        ? summary.meanPaidUsd / maximumPositiveMean
        : null;
    return Object.freeze({
      provider: summary.first.provider,
      modelId: summary.first.modelId,
      modelVersion: summary.first.modelVersion,
      relativeCost,
      comparability: relativeCost === null ? "UNKNOWN" as const : "COMPARABLE" as const,
      meteredCallCount: summary.meteredCallCount,
      unmeteredCallCount: summary.unmeteredCallCount,
      sourceUnitTotals: Object.freeze({ tokens: summary.tokens, usd: summary.usd }),
      normalizationBasis: RELATIVE_COST_NORMALIZATION_BASIS,
      windowStart: new Date(window.windowStart),
      windowEnd: new Date(window.windowEnd),
      derivationVersion: RELATIVE_COST_DERIVATION_VERSION,
      derivationInput,
      derivationHash,
      asOf: new Date(window.asOf)
    });
  }));
}

export interface EvaluatorMeteringReconciliationResult {
  readonly callsProjected: number;
  readonly callsFailed: number;
  readonly relativeCostCellsDerived: number;
  readonly failureReason?: "METERING_RECONCILIATION_FAILED";
}

function readObservedUsage(metadata: unknown): ObservedModelCallUsage | null {
  const parsed = z.object({ usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional(),
    x_cost_usd: z.number().nonnegative().optional()
  }).nullable().optional() }).passthrough().safeParse(metadata);
  if (!parsed.success || parsed.data.usage === undefined || parsed.data.usage === null) return null;
  const usage = parsed.data.usage;
  const observed = Object.freeze({
    ...(usage.prompt_tokens === undefined ? {} : { prompt_tokens: usage.prompt_tokens }),
    ...(usage.completion_tokens === undefined ? {} : { completion_tokens: usage.completion_tokens }),
    ...(usage.total_tokens === undefined ? {} : { total_tokens: usage.total_tokens }),
    ...(usage.x_cost_usd === undefined ? {} : { x_cost_usd: usage.x_cost_usd })
  });
  try {
    assertObservedUsage(observed);
    return observed;
  } catch {
    return null;
  }
}

export async function reconcileEvaluatorMetering(
  pool: Pool,
  window: RelativeCostDerivationWindow
): Promise<EvaluatorMeteringReconciliationResult> {
  assertValidDerivationWindow(window);
  const pending = await pool.query<{
    ledger_entry_id: string;
    raw_artifact_id: string;
    provider_ref: string;
    provider: string;
    model_id: string;
    model_version: string;
    call_site_key: string;
    metadata_json: unknown;
  }>(`
    SELECT entry.ledger_entry_id, artifact.raw_artifact_id, artifact.provider_ref,
           artifact.provider, artifact.model_id, artifact.model_version,
           entry.call_site_key, artifact.metadata_json
    FROM ledger.ledger_entry AS entry
    JOIN ledger.raw_artifact AS artifact ON artifact.attempt_id=entry.attempt_id
    LEFT JOIN evaluator.model_call_usage AS projected
      ON projected.ledger_entry_id=entry.ledger_entry_id
      OR projected.raw_artifact_id=artifact.raw_artifact_id
    WHERE entry.action_kind='MODEL_CALL' AND entry.outcome='OK'
      AND entry.call_site_key IS NOT NULL
      AND artifact.model_version IS NOT NULL AND length(btrim(artifact.model_version)) > 0
      AND projected.model_call_usage_id IS NULL
    ORDER BY entry.sequence, artifact.at_seq
  `);
  const repository = new EvaluatorMeteringRepository(pool);
  let callsProjected = 0;
  let callsFailed = 0;
  for (const row of pending.rows) {
    try {
      await repository.recordCall({
        ledgerEntryId: row.ledger_entry_id,
        rawArtifactId: row.raw_artifact_id,
        provider: row.provider,
        modelId: row.model_id,
        modelVersion: row.model_version,
        callSiteKey: row.call_site_key,
        // The evaluator provider is the only registered local runtime in this dark-launch slice.
        runtimeClass: row.provider_ref === EVALUATOR_PROVIDER_REF ? "LOCAL_VLLM" : "PAID_REMOTE",
        usage: readObservedUsage(row.metadata_json)
      });
      callsProjected += 1;
    } catch {
      callsFailed += 1;
    }
  }
  const usageRows = await pool.query<{
    provider: string;
    model_id: string;
    model_version: string;
    runtime_class: "PAID_REMOTE" | "LOCAL_VLLM";
    raw_usage: unknown;
  }>(`
    SELECT usage.provider, usage.model_id, usage.model_version,
           usage.runtime_class, usage.raw_usage
    FROM evaluator.model_call_usage AS usage
    JOIN ledger.ledger_entry AS entry ON entry.ledger_entry_id=usage.ledger_entry_id
    WHERE entry.finished_at >= $1 AND entry.finished_at < $2
    ORDER BY usage.provider, usage.model_id, usage.model_version, entry.sequence
  `, [window.windowStart, window.windowEnd]);
  const cells = deriveRelativeCostCellsV1(usageRows.rows.map((row) => ({
    provider: row.provider,
    modelId: row.model_id,
    modelVersion: row.model_version,
    runtimeClass: row.runtime_class,
    usage: row.raw_usage === null ? null : readObservedUsage({ usage: row.raw_usage })
  })), window);
  await repository.recordRelativeCostCells(cells);
  return Object.freeze({ callsProjected, callsFailed, relativeCostCellsDerived: cells.length });
}
