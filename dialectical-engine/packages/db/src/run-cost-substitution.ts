import type { Pool, PoolClient } from "pg";

/**
 * Budget spec §2.9 ("Owner record") and paid-plans spec §2.6 item 7 — A MODEL
 * CHOSEN FOR COST, for the owner and the operator (`core.run_cost_substitution`,
 * migration 0083, task B3). Ruling R-2: this is the table's ONE writer. B8
 * records the interim roster swap (reason PERSON); B9c records the runner's
 * cheaper-model calls while arguing.
 *
 * CONTENT-FREE: the run, the call site, the two provider refs and the reason,
 * never debate or model text. Insert-only: the table refuses UPDATE and DELETE.
 * It is never shown in the verdict text, the story, the PDF or any public page
 * (owner decision, budget spec §2.9); the operator report prints it
 * (`pnpm ops:serve-disclosure`).
 *
 * The reason is WHY the planned model could not be paid: the run's own money
 * while arguing, the run's own money on the first position's call, the site's
 * day at its finish edge, or the run owner's allowance (at a window's finish
 * edge while running, or the interim coarse fit at admission).
 */
export const RUN_COST_SUBSTITUTION_REASONS = Object.freeze(["RUN_ARGUING", "RUN_FIRST_CALL", "SITE_DAY", "PERSON"] as const);
export type RunCostSubstitutionReason = typeof RUN_COST_SUBSTITUTION_REASONS[number];

export type RunCostSubstitutionInput = Readonly<{
  runId: string;
  callSiteKey: string;
  plannedProviderRef: string;
  usedProviderRef: string;
  reason: RunCostSubstitutionReason;
  recordedAt: Date;
}>;

export type RunCostSubstitution = RunCostSubstitutionInput & Readonly<{ substitutionId: string }>;

/** A ref or key as the engine mints it: non-blank, already trimmed, at most 256 characters. */
function engineText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value === value.trim() && value.length <= 256;
}

export class RunCostSubstitutionRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * One substitution, once. A record that is not a substitution is refused
   * before the INSERT. `executor` is the transaction to write it in: B8 writes
   * the interim roster swap with the room decision's `tx`, so the record commits
   * with the run's hold or not at all. Absent, the row is written on the pool
   * (B9c's runner calls, and B8's path without a room).
   */
  async record(input: RunCostSubstitutionInput, executor: Pick<Pool, "query"> | PoolClient = this.pool): Promise<string> {
    if (!engineText(input?.runId) || !engineText(input.callSiteKey)
      || !engineText(input.plannedProviderRef) || !engineText(input.usedProviderRef)
      || input.plannedProviderRef === input.usedProviderRef
      || !(RUN_COST_SUBSTITUTION_REASONS as readonly string[]).includes(input.reason)
      || !(input.recordedAt instanceof Date) || Number.isNaN(input.recordedAt.getTime())) {
      throw new TypeError("RUN_COST_SUBSTITUTION_INVALID");
    }
    const inserted = await executor.query<{ substitution_id: string }>(
      `INSERT INTO core.run_cost_substitution (
         substitution_id, run_id, call_site_key, planned_provider_ref, used_provider_ref, reason, recorded_at
       ) VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6)
       RETURNING substitution_id::text AS substitution_id`,
      [input.runId, input.callSiteKey, input.plannedProviderRef, input.usedProviderRef, input.reason, input.recordedAt]
    );
    const substitutionId = inserted.rows[0]?.substitution_id;
    if (substitutionId === undefined) throw new TypeError("RUN_COST_SUBSTITUTION_NOT_RECORDED");
    return substitutionId;
  }

  /** A run's substitutions, in the order they happened (the operator report, B9c). */
  async listForRun(runId: string): Promise<readonly RunCostSubstitution[]> {
    const rows = await this.pool.query<{
      substitution_id: string; run_id: string; call_site_key: string; planned_provider_ref: string;
      used_provider_ref: string; reason: RunCostSubstitutionReason; recorded_at: Date;
    }>(
      `SELECT substitution_id::text AS substitution_id, run_id::text AS run_id, call_site_key,
              planned_provider_ref, used_provider_ref, reason, recorded_at
         FROM core.run_cost_substitution
        WHERE run_id = $1::uuid
        ORDER BY recorded_at, substitution_id`,
      [runId]
    );
    return Object.freeze(rows.rows.map((row) => Object.freeze({
      substitutionId: row.substitution_id,
      runId: row.run_id,
      callSiteKey: row.call_site_key,
      plannedProviderRef: row.planned_provider_ref,
      usedProviderRef: row.used_provider_ref,
      reason: row.reason,
      recordedAt: row.recorded_at
    })));
  }
}
