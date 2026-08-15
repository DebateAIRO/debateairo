import { createHash } from "node:crypto";
import type { Pool } from "pg";
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
