import type { Pool } from "pg";
import { z } from "zod";
import { allocateSequence, withWriteTransaction } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";

type EvaluatorStep = "AUTHORING" | "JUDGING" | "REVIEWING";

type EvaluatorDispatchBinding = Readonly<{
  state: "UNBOUND";
  reason: "ROW_ABSENT" | "ROW_INVALID" | "EXPLICIT_UNBOUND";
  registerVersion: number;
  sourceRef: string | null;
}>;

async function readDispatchBinding(pool: Pool, registerVersion: number): Promise<EvaluatorDispatchBinding> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(`
    SELECT value_json,source_ref FROM register.register_row
    WHERE register_version=$1 AND row_key='evaluatorDispatchBinding'
  `, [registerVersion]);
  const row = result.rows[0];
  if (row === undefined) {
    return Object.freeze({ state: "UNBOUND", reason: "ROW_ABSENT", registerVersion, sourceRef: null });
  }
  const parsed = z.object({
    kind: z.literal("EVALUATOR_DISPATCH_BINDING"),
    state: z.literal("UNBOUND")
  }).strict().safeParse(row.value_json);
  return parsed.success && row.source_ref.trim() !== ""
    ? Object.freeze({ state: "UNBOUND", reason: "EXPLICIT_UNBOUND", registerVersion, sourceRef: row.source_ref })
    : Object.freeze({
        state: "UNBOUND",
        reason: "ROW_INVALID",
        registerVersion,
        sourceRef: row.source_ref.trim() === "" ? null : row.source_ref
      });
}

export interface EvaluatorDevMenuView {
  readonly catalog: {
    readonly state: "AVAILABLE" | "UNAVAILABLE";
    readonly probeId: string | null;
    readonly failureCode: string | null;
    readonly models: readonly { readonly modelId: string }[];
  };
  readonly selectedConsumer: {
    readonly consumerSelectionId: string;
    readonly modelId: string;
    readonly selectedAt: Date;
  } | null;
  readonly dispatchBinding: EvaluatorDispatchBinding;
  readonly harvestedRows: number;
  readonly domains: readonly {
    readonly domainId: string;
    readonly canonicalName: string;
    readonly origin: "STARTER" | "GROWN";
    readonly provenanceRef: string;
    readonly admittedAt: Date;
  }[];
  readonly profiles: readonly {
    readonly provider: string;
    readonly modelId: string;
    readonly modelVersion: string;
    readonly domainId: string | null;
    readonly domainName: string | null;
    readonly step: EvaluatorStep;
    readonly metric: string;
    readonly value: number | null;
    readonly n: number;
    readonly intervalLower: number | null;
    readonly intervalUpper: number | null;
    readonly derivationVersion: number;
    readonly rank: number | null;
  }[];
  readonly parkedRuns: readonly {
    readonly runId: string;
    readonly consecutiveFailures: number;
    readonly receipts: readonly {
      readonly state: "FAILED";
      readonly reason: string;
      readonly attemptId: string;
      readonly atSequence: number;
    }[];
  }[];
}

export interface EvaluatorConsumerSelectionResult {
  readonly consumerSelectionId: string;
  readonly modelId: string;
  readonly selectedAt: Date;
}

export class PostgresEvaluatorDevMenuRepository {
  constructor(private readonly pool: Pool) {}

  async readView(registerVersion: number): Promise<EvaluatorDevMenuView> {
    if (!Number.isInteger(registerVersion) || registerVersion < 1) {
      throw new TypeError("EVALUATOR_REGISTER_VERSION_INVALID");
    }
    const [probe, selection, binding, observationCount, domains, profiles, parked, receipts] = await Promise.all([
      this.pool.query<{
        vllm_probe_id: string; state: "AVAILABLE" | "UNAVAILABLE"; failure_code: string | null;
      }>(`
        SELECT vllm_probe_id,state,failure_code
        FROM evaluator.vllm_probe ORDER BY at_seq DESC LIMIT 1
      `),
      this.pool.query<{
        consumer_selection_id: string; model_id: string; selected_at: Date;
      }>(`
        SELECT consumer_selection_id,model_id,selected_at
        FROM evaluator.consumer_selection ORDER BY at_seq DESC LIMIT 1
      `),
      readDispatchBinding(this.pool, registerVersion),
      this.pool.query<{ count: string }>("SELECT count(*)::text AS count FROM evaluator.observation"),
      this.pool.query<{
        domain_id: string; canonical_name: string; origin: "STARTER" | "GROWN";
        provenance_ref: string; admitted_at: Date;
      }>(`
        SELECT domain_id,canonical_name,origin,provenance_ref,admitted_at
        FROM evaluator.domain
        ORDER BY CASE origin WHEN 'STARTER' THEN 0 ELSE 1 END,normalized_name,domain_id
      `),
      this.pool.query<{
        provider: string; model_id: string; model_version: string; domain_id: string | null;
        domain_name: string | null; step: EvaluatorStep; metric: string; value: number | null;
        n: number; interval_lower: number | null; interval_upper: number | null;
        derivation_version: string; ordinal: number | null;
      }>(`
        WITH latest AS (
          SELECT DISTINCT ON (provider,model_id,model_version,domain_id,step,metric)
            profile_cell_id,provider,model_id,model_version,domain_id,step,metric,value,n,
            interval_lower,interval_upper,derivation_version,as_of,at_seq
          FROM evaluator.profile_cell
          ORDER BY provider,model_id,model_version,domain_id,step,metric,
            as_of DESC,derivation_version DESC,at_seq DESC
        )
        SELECT latest.provider,latest.model_id,latest.model_version,latest.domain_id,
          domain.canonical_name AS domain_name,latest.step,latest.metric,latest.value,latest.n,
          latest.interval_lower,latest.interval_upper,latest.derivation_version,rank.ordinal
        FROM latest
        LEFT JOIN evaluator.domain AS domain ON domain.domain_id=latest.domain_id
        LEFT JOIN LATERAL (
          SELECT ordinal FROM evaluator.rank_snapshot
          WHERE provider=latest.provider AND model_id=latest.model_id
            AND model_version=latest.model_version AND domain_id IS NOT DISTINCT FROM latest.domain_id
            AND step=latest.step AND metric=latest.metric
          ORDER BY as_of DESC,derivation_version DESC,at_seq DESC LIMIT 1
        ) AS rank ON true
        ORDER BY latest.provider,latest.model_id,latest.model_version,
          latest.domain_id NULLS FIRST,latest.step,latest.metric
        LIMIT 24
      `),
      this.pool.query<{ run_id: string; consecutive_failures: string }>(`
        SELECT failed.run_id,count(*)::text AS consecutive_failures
        FROM evaluator.pipeline_event AS failed
        WHERE failed.pipeline='HARVEST' AND failed.pipeline_version=1 AND failed.state='FAILED'
          AND failed.at_seq > COALESCE((
            SELECT max(completed.at_seq) FROM evaluator.pipeline_event AS completed
            WHERE completed.run_id=failed.run_id AND completed.pipeline='HARVEST'
              AND completed.pipeline_version=1 AND completed.state IN ('SUCCEEDED','SKIPPED')
          ),0)
        GROUP BY failed.run_id
        HAVING count(*) >= 3
        ORDER BY failed.run_id
      `),
      this.pool.query<{
        run_id: string; attempt_id: string; state: "FAILED"; reason: string; at_seq: string;
      }>(`
        SELECT failed.run_id,failed.attempt_id,failed.state,failed.reason,failed.at_seq
        FROM evaluator.pipeline_event AS failed
        WHERE failed.pipeline='HARVEST' AND failed.pipeline_version=1 AND failed.state='FAILED'
          AND failed.at_seq > COALESCE((
            SELECT max(completed.at_seq) FROM evaluator.pipeline_event AS completed
            WHERE completed.run_id=failed.run_id AND completed.pipeline='HARVEST'
              AND completed.pipeline_version=1 AND completed.state IN ('SUCCEEDED','SKIPPED')
          ),0)
        ORDER BY failed.run_id,failed.at_seq
      `)
    ]);

    const latestProbe = probe.rows[0];
    let models: readonly { readonly modelId: string }[] = Object.freeze([]);
    if (latestProbe?.state === "AVAILABLE") {
      const catalog = await this.pool.query<{ model_id: string }>(`
        SELECT model_id FROM evaluator.vllm_catalog_model
        WHERE vllm_probe_id=$1 ORDER BY model_id
      `, [latestProbe.vllm_probe_id]);
      models = Object.freeze(catalog.rows.map((row) => Object.freeze({ modelId: row.model_id })));
    }
    const selected = selection.rows[0];
    const receiptsByRun = new Map<string, EvaluatorDevMenuView["parkedRuns"][number]["receipts"]>();
    for (const receipt of receipts.rows) {
      const current = receiptsByRun.get(receipt.run_id) ?? Object.freeze([]);
      receiptsByRun.set(receipt.run_id, Object.freeze([...current, Object.freeze({
        state: receipt.state,
        reason: receipt.reason,
        attemptId: receipt.attempt_id,
        atSequence: Number(receipt.at_seq)
      })]));
    }

    return Object.freeze({
      catalog: Object.freeze({
        state: latestProbe?.state ?? "UNAVAILABLE",
        probeId: latestProbe?.vllm_probe_id ?? null,
        failureCode: latestProbe?.failure_code ?? (latestProbe === undefined ? "NO_CATALOG_PROBE" : null),
        models
      }),
      selectedConsumer: selected === undefined ? null : Object.freeze({
        consumerSelectionId: selected.consumer_selection_id,
        modelId: selected.model_id,
        selectedAt: selected.selected_at
      }),
      dispatchBinding: binding,
      harvestedRows: Number(observationCount.rows[0]?.count ?? 0),
      domains: Object.freeze(domains.rows.map((row) => Object.freeze({
        domainId: row.domain_id,
        canonicalName: row.canonical_name,
        origin: row.origin,
        provenanceRef: row.provenance_ref,
        admittedAt: row.admitted_at
      }))),
      profiles: Object.freeze(profiles.rows.map((row) => Object.freeze({
        provider: row.provider,
        modelId: row.model_id,
        modelVersion: row.model_version,
        domainId: row.domain_id,
        domainName: row.domain_name,
        step: row.step,
        metric: row.metric,
        value: row.value,
        n: row.n,
        intervalLower: row.interval_lower,
        intervalUpper: row.interval_upper,
        derivationVersion: Number(row.derivation_version),
        rank: row.ordinal
      }))),
      parkedRuns: Object.freeze(parked.rows.map((row) => Object.freeze({
        runId: row.run_id,
        consecutiveFailures: Number(row.consecutive_failures),
        receipts: receiptsByRun.get(row.run_id) ?? Object.freeze([])
      })))
    });
  }

  async selectConsumerModel(input: {
    readonly modelId: string;
    readonly selectedBy: string;
    readonly orderRef: string;
    readonly selectedAt: Date;
  }): Promise<EvaluatorConsumerSelectionResult> {
    if (input.modelId.trim() === "" || input.selectedBy.trim() === "" || input.orderRef.trim() === "") {
      throw new TypeError("EVALUATOR_CONSUMER_SELECTION_INVALID");
    }
    if (!Number.isFinite(input.selectedAt.getTime())) throw new TypeError("EVALUATOR_CONSUMER_SELECTION_TIME_INVALID");
    return withWriteTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('evaluator:consumer-selection',0))");
      const probe = await client.query<{ vllm_probe_id: string; state: "AVAILABLE" | "UNAVAILABLE" }>(`
        SELECT vllm_probe_id,state FROM evaluator.vllm_probe ORDER BY at_seq DESC LIMIT 1
      `);
      const latest = probe.rows[0];
      if (latest === undefined || latest.state !== "AVAILABLE") {
        throw new TypedDomainError("EVALUATOR_CATALOG_UNAVAILABLE", "The latest vLLM catalog probe is unavailable");
      }
      const model = await client.query(`
        SELECT 1 FROM evaluator.vllm_catalog_model WHERE vllm_probe_id=$1 AND model_id=$2
      `, [latest.vllm_probe_id, input.modelId]);
      if (model.rows[0] === undefined) {
        throw new TypedDomainError(
          "EVALUATOR_CONSUMER_MODEL_NOT_ENUMERATED",
          "The consumer model must belong to the latest successful vLLM catalog probe"
        );
      }
      const current = await client.query<{ consumer_selection_id: string }>(`
        SELECT consumer_selection_id FROM evaluator.consumer_selection ORDER BY at_seq DESC LIMIT 1
      `);
      const inserted = await client.query<{ consumer_selection_id: string; selected_at: Date }>(`
        INSERT INTO evaluator.consumer_selection (
          vllm_probe_id,model_id,selected_by,order_ref,supersedes_selection_id,selected_at,at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING consumer_selection_id,selected_at
      `, [
        latest.vllm_probe_id,input.modelId,input.selectedBy,input.orderRef,
        current.rows[0]?.consumer_selection_id ?? null,input.selectedAt,await allocateSequence(client)
      ]);
      return Object.freeze({
        consumerSelectionId: inserted.rows[0]!.consumer_selection_id,
        modelId: input.modelId,
        selectedAt: inserted.rows[0]!.selected_at
      });
    });
  }
}
