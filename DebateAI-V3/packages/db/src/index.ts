import { readFile, readdir } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";
import pg from "pg";
import { TypedDomainError, type ActivationState, type CompositionBudgetTier, type RiskTier, type TierSource } from "@debateai/kernel";

const { Pool: PgPool } = pg;
const writeTransaction = new AsyncLocalStorage<boolean>();

export function createPool(connectionString: string): Pool {
  return new PgPool({ connectionString });
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
  readonly agentCount: number;
  readonly strangerSampleRate: number;
  readonly envelopeBasis: Readonly<Record<string, unknown>>;
  readonly registerVersion: number;
  readonly batteryVersion: string;
  readonly batteryRows: readonly InitialBatteryRow[];
  readonly askContract?: Readonly<Record<string, unknown>>;
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

export interface CompletionActivationResolution {
  readonly batteryRowId: string;
  readonly state: Exclude<ActivationState, "WAIT">;
  readonly predicateInputs: Readonly<Record<string, unknown>>;
  readonly skipEvidence: Readonly<Record<string, unknown>> | null;
}

export class RunRepository {
  constructor(private readonly pool: Pool) {}

  async startRun(input: StartRunInput): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const createdAtSeq = await allocateSequence(client);
      const inserted = await client.query<{ run_id: string }>(
        `INSERT INTO core.run (
          question_line, asker_id, session_id, caller_scope, as_of,
          asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
          composition_budget_tier, depth_params, agent_count,
          stranger_sample_rate, envelope_basis, register_version,
          battery_version, ask_contract, created_at_seq
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11::jsonb, $12, $13, $14::jsonb, $15, $16, $17::jsonb, $18
        ) RETURNING run_id`,
        [
          input.questionLine, input.askerId, input.sessionId, input.callerScope, input.asOf,
          input.askerRiskTier, input.effectiveRiskTier, input.tierSource, input.tierProvenanceRef,
          input.compositionBudgetTier, JSON.stringify(input.depthParams), input.agentCount,
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
    readonly compositionBudgetTier: CompositionBudgetTier;
    readonly strangerSampleRate: number;
    readonly envelopeBasis: Readonly<Record<string, unknown>>;
  }> {
    const result = await this.pool.query<{
      run_id: string;
      question_line: string;
      composition_budget_tier: CompositionBudgetTier;
      stranger_sample_rate: number;
      envelope_basis: Readonly<Record<string, unknown>>;
    }>(
      `SELECT run_id, question_line, composition_budget_tier, stranger_sample_rate, envelope_basis
       FROM core.run WHERE run_id = $1`,
      [runId]
    );
    const row = result.rows[0];
    if (row === undefined) throw new TypedDomainError("RUN_NOT_FOUND", `Run ${runId} does not exist`);
    return {
      runId: row.run_id,
      questionLine: row.question_line,
      compositionBudgetTier: row.composition_budget_tier,
      strangerSampleRate: Number(row.stranger_sample_rate),
      envelopeBasis: Object.freeze({ ...row.envelope_basis })
    };
  }
}

export type { Pool } from "pg";
