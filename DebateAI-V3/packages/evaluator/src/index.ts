import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { allocateSequence, withWriteTransaction } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  type CallBound,
  type ProviderGateway
} from "@debateai/providers";

export const EVALUATOR_PROVIDER_FAMILY_ROW_KEY = "evaluatorProviderFamily" as const;
export const EVALUATOR_DISPATCH_BINDING_ROW_KEY = "evaluatorDispatchBinding" as const;
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

export interface EvaluatorDispatchBinding {
  readonly state: "UNBOUND";
  readonly reason: "ROW_ABSENT" | "ROW_INVALID" | "EXPLICIT_UNBOUND";
  readonly registerVersion: number;
  readonly sourceRef: string | null;
}

export async function readEvaluatorDispatchBinding(
  pool: Pool,
  registerVersion: number
): Promise<EvaluatorDispatchBinding> {
  assertPositiveRegisterVersion(registerVersion);
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json, source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, EVALUATOR_DISPATCH_BINDING_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    return Object.freeze({ state: "UNBOUND", reason: "ROW_ABSENT", registerVersion, sourceRef: null });
  }
  const parsed = z.object({
    kind: z.literal("EVALUATOR_DISPATCH_BINDING"),
    state: z.literal("UNBOUND")
  }).strict().safeParse(row.value_json);
  return parsed.success && row.source_ref.trim() !== ""
    ? Object.freeze({
        state: "UNBOUND" as const,
        reason: "EXPLICIT_UNBOUND" as const,
        registerVersion,
        sourceRef: row.source_ref
      })
    : Object.freeze({
        state: "UNBOUND" as const,
        reason: "ROW_INVALID" as const,
        registerVersion,
        sourceRef: row.source_ref.trim() === "" ? null : row.source_ref
      });
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

export interface BlindEvaluationSample {
  readonly sampleId: string;
  readonly questionExcerpt: string;
  readonly taskExcerpt: string;
  readonly grade: string;
  readonly reasons: readonly string[];
}

export function createBlindEvaluationSample(input: {
  readonly sampleId: string;
  readonly questionExcerpt: string;
  readonly taskExcerpt: string;
  readonly grade: string;
  readonly reasons: readonly string[];
  readonly [key: string]: unknown;
}): BlindEvaluationSample {
  for (const [field, value] of [
    ["sampleId", input.sampleId],
    ["questionExcerpt", input.questionExcerpt],
    ["taskExcerpt", input.taskExcerpt],
    ["grade", input.grade]
  ] as const) {
    if (value.trim() === "") throw new TypeError(`BLIND_SAMPLE_${field.toUpperCase()}_INVALID`);
  }
  if (!input.reasons.every((reason) => reason.trim() !== "")) {
    throw new TypeError("BLIND_SAMPLE_REASONS_INVALID");
  }
  return Object.freeze({
    sampleId: input.sampleId,
    questionExcerpt: input.questionExcerpt,
    taskExcerpt: input.taskExcerpt,
    grade: input.grade,
    reasons: Object.freeze([...input.reasons])
  });
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
      return inserted.rows[0]!.model_call_usage_id;
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
          ) RETURNING relative_cost_cell_id
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
        ids.push(inserted.rows[0]!.relative_cost_cell_id);
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
