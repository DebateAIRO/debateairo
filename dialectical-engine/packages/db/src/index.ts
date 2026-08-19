import { readFile, readdir } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";
import pg from "pg";
import { TypedDomainError, type ActivationState, type CompositionBudgetTier, type RiskTier, type TierSource } from "@debateai/kernel";

const { Pool: PgPool } = pg;
const writeTransaction = new AsyncLocalStorage<boolean>();
const DATABASE_POOL_FAILED = "DATABASE_POOL_FAILED";
const wrappedPoolClients = new WeakSet<PoolClient>();

type UntypedMethod = (...args: unknown[]) => unknown;

function typedPoolFailure(error: unknown): TypedDomainError {
  if (error instanceof TypedDomainError && error.code === DATABASE_POOL_FAILED) return error;
  const detail = error instanceof Error ? error.message : String(error);
  return new TypedDomainError(DATABASE_POOL_FAILED, `PostgreSQL pool operation failed: ${detail}`);
}

function typedQueryFailure(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return error;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = error instanceof Error ? error.message : "";
  const connectionFailure = code.startsWith("08")
    || ["57P01", "57P02", "57P03", "ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT"].includes(code)
    || /connection (?:terminated|reset)|server closed the connection|terminating connection due to administrator command/i.test(message);
  return connectionFailure ? typedPoolFailure(error) : error;
}

function rejectKnownFailure(args: readonly unknown[], failure: TypedDomainError): unknown {
  const callback = args.at(-1);
  if (typeof callback === "function") {
    queueMicrotask(() => callback(failure));
    return undefined;
  }
  return Promise.reject(failure);
}

function wrapClientQueries(client: PoolClient): PoolClient {
  if (wrappedPoolClients.has(client)) return client;
  const mutableClient = client as unknown as { query: UntypedMethod };
  const query = mutableClient.query.bind(client);
  mutableClient.query = (...args: unknown[]): unknown => {
    const callback = args.at(-1);
    if (typeof callback === "function") {
      const wrappedArgs = [...args];
      wrappedArgs[wrappedArgs.length - 1] = (error: unknown, ...values: unknown[]) => {
        callback(error === undefined || error === null ? error : typedQueryFailure(error), ...values);
      };
      return query(...wrappedArgs);
    }
    try {
      const result = query(...args);
      return result instanceof Promise
        ? result.catch((error: unknown) => Promise.reject(typedQueryFailure(error)))
        : result;
    } catch (error) {
      throw typedQueryFailure(error);
    }
  };
  wrappedPoolClients.add(client);
  return client;
}

export function createPool(connectionString: string): Pool {
  const pool = new PgPool({ connectionString });
  let terminalFailure: TypedDomainError | undefined;

  pool.on("error", (error: Error) => {
    terminalFailure ??= typedPoolFailure(error);
    console.error(`[${DATABASE_POOL_FAILED}] ${terminalFailure.message}`);
  });

  const mutablePool = pool as unknown as { query: UntypedMethod; connect: UntypedMethod };
  const query = mutablePool.query.bind(pool);
  mutablePool.query = (...args: unknown[]): unknown => {
    if (terminalFailure !== undefined) return rejectKnownFailure(args, terminalFailure);
    const callback = args.at(-1);
    if (typeof callback === "function") {
      const wrappedArgs = [...args];
      wrappedArgs[wrappedArgs.length - 1] = (error: unknown, ...values: unknown[]) => {
        callback(error === undefined || error === null ? error : typedQueryFailure(error), ...values);
      };
      return query(...wrappedArgs);
    }
    try {
      const result = query(...args);
      return result instanceof Promise
        ? result.catch((error: unknown) => Promise.reject(typedQueryFailure(error)))
        : result;
    } catch (error) {
      throw typedQueryFailure(error);
    }
  };

  const connect = mutablePool.connect.bind(pool);
  mutablePool.connect = (...args: unknown[]): unknown => {
    if (terminalFailure !== undefined) return rejectKnownFailure(args, terminalFailure);
    const callback = args.at(-1);
    if (typeof callback === "function") {
      return connect((error: unknown, client: PoolClient | undefined, release: unknown) => {
        callback(
          error === undefined || error === null ? error : typedPoolFailure(error),
          client === undefined ? undefined : wrapClientQueries(client),
          release
        );
      });
    }
    try {
      const result = connect();
      return result instanceof Promise
        ? result.then((client: PoolClient) => wrapClientQueries(client))
          .catch((error: unknown) => Promise.reject(typedPoolFailure(error)))
        : result;
    } catch (error) {
      throw typedPoolFailure(error);
    }
  };

  return pool;
}

export async function migrate(pool: Pool): Promise<void> {
  const directory = new URL("../../../migrations/", import.meta.url);
  const migrations = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('debateai:schema-migrations', 0))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.debateai_schema_migration (
        name text PRIMARY KEY CHECK (length(btrim(name)) > 0),
        applied_at timestamptz NOT NULL
      )
    `);
    for (const name of migrations) {
      const applied = await client.query("SELECT 1 FROM public.debateai_schema_migration WHERE name=$1", [name]);
      if (applied.rowCount !== 0) continue;
      await client.query(await readFile(new URL(name, directory), "utf8"));
      await client.query(
        "INSERT INTO public.debateai_schema_migration (name, applied_at) VALUES ($1, statement_timestamp())",
        [name]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withWriteTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await writeTransaction.run(true, () => operation(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function assertNoOpenWriteTransaction(): void {
  if (writeTransaction.getStore() === true) {
    throw new TypedDomainError("PROVIDER_CALL_INSIDE_TRANSACTION", "A provider call cannot run inside a write transaction");
  }
}

export async function allocateSequence(client: PoolClient): Promise<number> {
  const result = await client.query<{ sequence: string }>("SELECT ledger.allocate_sequence() AS sequence");
  const value = result.rows[0]?.sequence;
  if (value === undefined) throw new TypedDomainError("SEQUENCE_ALLOCATION_FAILED", "No sequence was allocated");
  return Number(value);
}

export interface InitialBatteryRow {
  readonly batteryRowId: string;
  readonly predicateRef: string;
  readonly openingState: ActivationState;
  readonly predicateInputs: Readonly<Record<string, unknown>>;
  readonly skipEvidence: Readonly<Record<string, unknown>> | null;
}

export interface StartRunInput {
  readonly questionLine: string;
  readonly askerId: string;
  readonly sessionId: string;
  readonly callerScope: "ASKER" | "OPERATOR";
  readonly asOf: Date;
  readonly askerRiskTier: RiskTier;
  readonly effectiveRiskTier: RiskTier;
  readonly tierSource: TierSource;
  readonly tierProvenanceRef: string;
  readonly compositionBudgetTier: CompositionBudgetTier;
  readonly depthParams: Readonly<Record<string, unknown>>;
  readonly discoveredPanel: readonly DiscoveredPanelMember[];
  readonly strangerSampleRate: number;
  readonly envelopeBasis: Readonly<Record<string, unknown>>;
  readonly registerVersion: number;
  readonly batteryVersion: string;
  readonly batteryRows: readonly InitialBatteryRow[];
  readonly askContract?: Readonly<Record<string, unknown>>;
}

export interface DiscoveredPanelMember {
  readonly provider_ref: string;
  readonly maker: string;
  readonly model_id: string;
  readonly probe_evidence_ref: string;
  readonly probed_at: string;
}

export interface ProviderProbeRecord {
  readonly probeEvidenceRef: string;
  readonly providerRef: string;
  readonly maker: string;
  readonly state: "HEALTHY" | "ABSENT";
  readonly modelId: string | null;
  readonly failureCode: string | null;
  readonly probedAt: Date;
}

export class ProviderProbeRepository {
  constructor(private readonly pool: Pool) {}

  async record(input: ProviderProbeRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO core.provider_probe (
         probe_id, provider_ref, maker, state, model_id, failure_code, probed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.probeEvidenceRef, input.providerRef, input.maker, input.state,
        input.modelId, input.failureCode, input.probedAt]
    );
  }

  async readLatest(providerRefs: readonly string[]): Promise<readonly ProviderProbeRecord[]> {
    if (providerRefs.length === 0) return Object.freeze([]);
    const result = await this.pool.query<{
      probe_id: string;
      provider_ref: string;
      maker: string;
      state: "HEALTHY" | "ABSENT";
      model_id: string | null;
      failure_code: string | null;
      probed_at: Date;
    }>(
      `SELECT DISTINCT ON (provider_ref)
         probe_id, provider_ref, maker, state, model_id, failure_code, probed_at
       FROM core.provider_probe
       WHERE provider_ref=ANY($1::text[])
       ORDER BY provider_ref, probed_at DESC, probe_id DESC`,
      [providerRefs]
    );
    return Object.freeze(result.rows.map((row) => Object.freeze({
      probeEvidenceRef: row.probe_id,
      providerRef: row.provider_ref,
      maker: row.maker,
      state: row.state,
      modelId: row.model_id,
      failureCode: row.failure_code,
      probedAt: row.probed_at
    })));
  }
}

export interface CurrentRunState {
  readonly phase: "EMPIRICAL" | "VALUE";
  readonly envelopeState: "WITHIN" | "ENRICHMENT_SKIPPED" | "EXHAUSTED";
  readonly envelopeConsumed: number;
  readonly activations: readonly {
    readonly batteryRowId: string;
    readonly state: ActivationState;
    readonly atSeq: number;
  }[];
}

export interface RunLoadingProjection {
  readonly runRef: string;
  readonly questionLine: string;
  readonly state: "QUEUED" | "CLAIMED" | "RUNNING" | "HOLDING" | "SETTLED" | "FAILED";
  readonly terminalReason: string | null;
  readonly holdUntil: Date | null;
}

export interface RunLifecycleEventValue {
  readonly state: "COOLDOWN_HOLD" | "COOLDOWN_RETRY" | "MAKER_POSITION_HALTED" | "EXPANSION_HALTED" | "REVIEW_HALTED";
  readonly call_site_key: string;
  readonly parent_node_ref: string | null;
  readonly hold_ms: number;
  readonly hold_until: string | null;
  readonly attempts_spent: number;
  readonly transport_outcome: "TIMED_OUT" | "FAILED";
  readonly planned_leg_count: number;
}

export interface CompletionActivationResolution {
  readonly batteryRowId: string;
  readonly state: Exclude<ActivationState, "WAIT">;
  readonly predicateInputs: Readonly<Record<string, unknown>>;
  readonly skipEvidence: Readonly<Record<string, unknown>> | null;
}

export class RunRepository {
  constructor(private readonly pool: Pool) {}

  async countCooldownHolds(runId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM core.run_progress_event
       WHERE run_id=$1 AND kind='node.retrying'
         AND value_json->>'state'='COOLDOWN_HOLD'`,
      [runId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async recordRunLifecycleEvent(input: {
    readonly runId: string;
    readonly kind: "node.retrying" | "ledger.could_not_do";
    readonly value: RunLifecycleEventValue;
  }): Promise<void> {
    await withWriteTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
         VALUES ($1,$2,$3,$4::jsonb)`,
        [input.runId, await allocateSequence(client), input.kind, JSON.stringify(input.value)]
      );
    });
  }

  async startRun(input: StartRunInput): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const createdAtSeq = await allocateSequence(client);
      const inserted = await client.query<{ run_id: string }>(
        `INSERT INTO core.run (
          question_line, asker_id, session_id, caller_scope, as_of,
          asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
          composition_budget_tier, depth_params, agent_count, discovered_panel,
          stranger_sample_rate, envelope_basis, register_version,
          battery_version, ask_contract, created_at_seq
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11::jsonb, jsonb_array_length($12::jsonb), $12::jsonb, $13, $14::jsonb, $15, $16, $17::jsonb, $18
        ) RETURNING run_id`,
        [
          input.questionLine, input.askerId, input.sessionId, input.callerScope, input.asOf,
          input.askerRiskTier, input.effectiveRiskTier, input.tierSource, input.tierProvenanceRef,
          input.compositionBudgetTier, JSON.stringify(input.depthParams), JSON.stringify(input.discoveredPanel),
          input.strangerSampleRate, JSON.stringify(input.envelopeBasis), input.registerVersion,
          input.batteryVersion, JSON.stringify(input.askContract ?? {}), createdAtSeq
        ]
      );
      const runId = inserted.rows[0]!.run_id;

      await client.query(
        `INSERT INTO core.question_liveness_event (run_id, kind, occurred_at, at_seq)
         VALUES ($1,'QUERY',clock_timestamp(),$2)`,
        [runId, await allocateSequence(client)]
      );

      for (const [kind, value] of [
        ["PHASE", "EMPIRICAL"],
        ["ENVELOPE_STATE", "WITHIN"],
        ["ENVELOPE_CONSUMED", 0]
      ] as const) {
        await client.query(
          `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [runId, await allocateSequence(client), kind, JSON.stringify(value)]
        );
      }

      for (const row of input.batteryRows) {
        await client.query(
          `INSERT INTO core.run_row_activation (run_id, battery_row_id, predicate_ref)
           VALUES ($1, $2, $3)`,
          [runId, row.batteryRowId, row.predicateRef]
        );
        await client.query(
          `INSERT INTO core.run_row_activation_event (
            run_id, battery_row_id, at_seq, state, predicate_inputs, skip_evidence
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
          [
            runId, row.batteryRowId, await allocateSequence(client), row.openingState,
            JSON.stringify(row.predicateInputs),
            row.skipEvidence === null ? null : JSON.stringify(row.skipEvidence)
          ]
        );
      }
      await client.query("COMMIT");
      return runId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async readLoadingProjection(runId: string, askerId: string): Promise<RunLoadingProjection | null> {
    const result = await this.pool.query<{
      run_id: string;
      question_line: string;
      state: RunLoadingProjection["state"];
      terminal_reason: string | null;
      hold_until: Date | null;
    }>(
      `SELECT run.run_id, run.question_line,
         CASE
           WHEN count(work.work_item_id) = 0 THEN 'QUEUED'
           WHEN bool_or(work.state = 'FAILED') THEN 'FAILED'
           WHEN bool_or(work.state = 'CLAIMED') AND COALESCE((
             SELECT event.value_json->>'state' = 'COOLDOWN_HOLD'
               AND (event.value_json->>'hold_until')::timestamptz > clock_timestamp()
             FROM core.run_progress_event AS event
             WHERE event.run_id=run.run_id AND event.kind='node.retrying'
             ORDER BY event.at_seq DESC LIMIT 1
           ), false) THEN 'HOLDING'
           WHEN bool_or(work.state = 'CLAIMED') THEN 'RUNNING'
           WHEN bool_or(work.state = 'READY') THEN 'QUEUED'
           ELSE 'SETTLED'
         END AS state,
         (array_agg(work.terminal_reason ORDER BY work.created_at_seq DESC)
           FILTER (WHERE work.state = 'FAILED'))[1] AS terminal_reason,
         (SELECT CASE WHEN event.value_json->>'state' = 'COOLDOWN_HOLD'
                           AND (event.value_json->>'hold_until')::timestamptz > clock_timestamp()
                      THEN (event.value_json->>'hold_until')::timestamptz ELSE NULL END
          FROM core.run_progress_event AS event
          WHERE event.run_id=run.run_id AND event.kind='node.retrying'
          ORDER BY event.at_seq DESC LIMIT 1) AS hold_until
       FROM core.run AS run
       LEFT JOIN core.work_item AS work ON work.run_id = run.run_id
       WHERE run.run_id = $1 AND run.asker_id = $2
       GROUP BY run.run_id, run.question_line`,
      [runId, askerId]
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    return Object.freeze({
      runRef: row.run_id,
      questionLine: row.question_line,
      state: row.state,
      terminalReason: row.terminal_reason,
      holdUntil: row.hold_until
    });
  }

  async readCurrentState(runId: string): Promise<CurrentRunState> {
    const progress = await this.pool.query<{ kind: string; value_json: unknown }>(
      `SELECT DISTINCT ON (kind) kind, value_json
       FROM core.run_progress_event WHERE run_id = $1
       ORDER BY kind, at_seq DESC`,
      [runId]
    );
    const values = new Map(progress.rows.map((row) => [row.kind, row.value_json]));
    if (!["PHASE", "ENVELOPE_STATE", "ENVELOPE_CONSUMED"].every((kind) => values.has(kind))) {
      throw new TypedDomainError("EMPTY_EVENT_STREAM", `Run ${runId} has no complete initial progress stream`);
    }
    const activations = await this.pool.query<{ battery_row_id: string; state: ActivationState; at_seq: string }>(
      `SELECT DISTINCT ON (battery_row_id) battery_row_id, state, at_seq
       FROM core.run_row_activation_event WHERE run_id = $1
       ORDER BY battery_row_id, at_seq DESC`,
      [runId]
    );
    const expected = await this.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run_row_activation WHERE run_id = $1",
      [runId]
    );
    if (activations.rows.length !== Number(expected.rows[0]?.count ?? -1)) {
      throw new TypedDomainError("EMPTY_EVENT_STREAM", `Run ${runId} has an activation row without an event`);
    }
    return {
      phase: values.get("PHASE") as CurrentRunState["phase"],
      envelopeState: values.get("ENVELOPE_STATE") as CurrentRunState["envelopeState"],
      envelopeConsumed: values.get("ENVELOPE_CONSUMED") as number,
      activations: activations.rows.map((row) => ({
        batteryRowId: row.battery_row_id,
        state: row.state,
        atSeq: Number(row.at_seq)
      }))
    };
  }

  async drainWaitsForCompletion(
    runId: string,
    resolutions: readonly CompletionActivationResolution[]
  ): Promise<number> {
    return withWriteTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`run-terminal:${runId}`]);
      const waiting = await client.query<{ battery_row_id: string; predicate_ref: string }>(
        `SELECT latest.battery_row_id, activation.predicate_ref
         FROM (
           SELECT DISTINCT ON (battery_row_id) battery_row_id, state
           FROM core.run_row_activation_event
           WHERE run_id=$1
           ORDER BY battery_row_id, at_seq DESC
         ) AS latest
         JOIN core.run_row_activation AS activation
           ON activation.run_id=$1 AND activation.battery_row_id=latest.battery_row_id
         WHERE latest.state='WAIT'
         ORDER BY latest.battery_row_id`,
        [runId]
      );
      const byRow = new Map(resolutions.map((resolution) => [resolution.batteryRowId, resolution]));
      if (byRow.size !== resolutions.length || waiting.rows.some((row) => !byRow.has(row.battery_row_id))) {
        throw new TypedDomainError(
          "WAIT_RESOLUTION_INCOMPLETE",
          "Run completion requires one explicit evaluated transition for every latest WAIT"
        );
      }
      const unexpected = resolutions.find((resolution) => !waiting.rows.some((row) => row.battery_row_id === resolution.batteryRowId));
      if (unexpected !== undefined) {
        throw new TypedDomainError("WAIT_RESOLUTION_NOT_CURRENT", `${unexpected.batteryRowId} is not currently waiting`);
      }
      for (const row of waiting.rows) {
        const resolution = byRow.get(row.battery_row_id)!;
        await client.query(
          `INSERT INTO core.run_row_activation_event (
             run_id, battery_row_id, at_seq, state, predicate_inputs, skip_evidence
           ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
          [
            runId,
            row.battery_row_id,
            await allocateSequence(client),
            resolution.state,
            JSON.stringify(resolution.predicateInputs),
            resolution.skipEvidence === null ? null : JSON.stringify(resolution.skipEvidence)
          ]
        );
      }
      return waiting.rows.length;
    });
  }

  async readFrozenHead(runId: string): Promise<{
    readonly runId: string;
    readonly questionLine: string;
    readonly agentCount: number;
    readonly discoveredPanel: readonly DiscoveredPanelMember[];
    readonly depthParams: Readonly<Record<string, unknown>>;
    readonly compositionBudgetTier: CompositionBudgetTier;
    readonly strangerSampleRate: number;
    readonly envelopeBasis: Readonly<Record<string, unknown>>;
  }> {
    const result = await this.pool.query<{
      run_id: string;
      question_line: string;
      agent_count: number;
      discovered_panel: DiscoveredPanelMember[];
      depth_params: Readonly<Record<string, unknown>>;
      composition_budget_tier: CompositionBudgetTier;
      stranger_sample_rate: number;
      envelope_basis: Readonly<Record<string, unknown>>;
    }>(
      `SELECT run_id, question_line, agent_count, discovered_panel, depth_params,
              composition_budget_tier, stranger_sample_rate, envelope_basis
       FROM core.run WHERE run_id = $1`,
      [runId]
    );
    const row = result.rows[0];
    if (row === undefined) throw new TypedDomainError("RUN_NOT_FOUND", `Run ${runId} does not exist`);
    return {
      runId: row.run_id,
      questionLine: row.question_line,
      agentCount: Number(row.agent_count),
      discoveredPanel: Object.freeze(row.discovered_panel.map((member) => Object.freeze({ ...member }))),
      depthParams: Object.freeze({ ...row.depth_params }),
      compositionBudgetTier: row.composition_budget_tier,
      strangerSampleRate: Number(row.stranger_sample_rate),
      envelopeBasis: Object.freeze({ ...row.envelope_basis })
    };
  }
}

export type { Pool } from "pg";
export {
  auditEvent,
  channelBinding,
  identity,
  identitySession,
  identityUser,
  mfaFactor,
  recoveryCode
} from "./schema.js";

export {
  PostgresIdentityRepository,
  type AuthSourceContext,
  type PendingAccountInput,
  type PendingAccountResult,
  type ResendPreparation
} from "./identity.js";
