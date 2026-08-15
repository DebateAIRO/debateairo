import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { allocateSequence, withWriteTransaction } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";

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
  readonly decision: "ADMITTED_NEW" | "MATCHED_EXISTING" | "REJECTED_NEAR_DUPLICATE" | "REJECTED_INVALID";
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

export interface DomainAdmissionResult extends DomainProposalEvaluation {
  readonly domainAdmissionId: string;
}

function requireNonblank(value: string, code: string): void {
  if (value.trim() === "") throw new TypedDomainError(code, `${code}: value must be nonblank`);
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
    for (const [value, code] of [
      [input.runId, "EVALUATOR_DOMAIN_RUN_ID_INVALID"],
      [input.provider, "EVALUATOR_DOMAIN_PROVIDER_INVALID"],
      [input.modelId, "EVALUATOR_DOMAIN_MODEL_ID_INVALID"],
      [input.modelVersion, "EVALUATOR_DOMAIN_MODEL_VERSION_INVALID"],
      [input.provenanceRef, "EVALUATOR_DOMAIN_PROVENANCE_INVALID"]
    ] as const) requireNonblank(value, code);
    const canonicalName = canonicalizeDomainName(input.proposedName);
    const normalizedName = normalizeDomainName(canonicalName);
    return withWriteTransaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        ["evaluator-domain-registry"]
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`evaluator-domain:${normalizedName}`]
      );
      if (input.rawArtifactRef !== null) {
        const artifact = await client.query<{
          run_id: string | null;
          provider: string;
          model_id: string;
          model_version: string | null;
        }>(`
          SELECT run_id, provider, model_id, model_version
          FROM ledger.raw_artifact WHERE raw_artifact_id=$1
        `, [input.rawArtifactRef]);
        const artifactRow = artifact.rows[0];
        if (artifactRow === undefined || artifactRow.run_id !== input.runId
          || artifactRow.provider !== input.provider || artifactRow.model_id !== input.modelId
          || artifactRow.model_version !== input.modelVersion) {
          throw new TypedDomainError(
            "EVALUATOR_DOMAIN_PROPOSAL_ARTIFACT_MISMATCH",
            "Domain proposal identity must match its source run and raw artifact"
          );
        }
      }
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
      const admission = await client.query<{ domain_admission_id: string }>(`
        INSERT INTO evaluator.domain_admission (
          run_id, proposed_name, normalized_name, decision, domain_id,
          candidate_similarities, guardrail_version, tagger_raw_artifact_ref,
          reason, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
        RETURNING domain_admission_id
      `, [
        input.runId, input.proposedName, evaluation.normalizedName, evaluation.decision,
        domainId, JSON.stringify(evaluation.candidates), DOMAIN_GUARDRAIL_VERSION,
        input.rawArtifactRef, evaluation.reason, await allocateSequence(client)
      ]);
      return Object.freeze({
        ...evaluation,
        domainId,
        domainAdmissionId: admission.rows[0]!.domain_admission_id
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
}
