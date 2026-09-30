import type { Pool, PoolClient } from "pg";

/**
 * Budget spec 2026-09-28 §2.7 (migration 0081) — THE WAITING LINE.
 *
 * `core.run_wait` / `core.run_wait_start` / `core.run_wait_reason` are
 * append-only and content-free; the line is read through `core.run_waiting_v`,
 * which derives "still waiting" (no start, no FAILED job, content still live,
 * owner's account still active), the run's owner (its latest ownership event)
 * and why it waits (its latest reason), so no owner is ever stored beside a wait.
 */
export type WaitingRunRef = Readonly<{ runId: string; waitingSince: Date }>;

/**
 * Why a run waits (budget spec §2.3 rule 1). SITE: the site's day, or the line
 * ahead of it. PERSON: its own person's window is full; `personRecheckAt` is the
 * earliest instant that block can lift by itself.
 */
export type WaitReason =
  | Readonly<{ waitsFor: "SITE"; personRecheckAt: null }>
  | Readonly<{ waitsFor: "PERSON"; personRecheckAt: Date }>;

export type WaitingRun = Readonly<{
  runId: string;
  waitingSince: Date;
  /** Exactly one of these is non-null: the owner for an account's run, the legacy asker id otherwise. */
  ownerRef: string | null;
  legacyAskerId: string | null;
  /** The settings class the run was asked with (its estimate at start). */
  planTier: "free" | "premium" | null;
  compositionBudgetTier: "low" | "medium" | "high";
  depth: number;
  /** The number of models on its panel (B2 counts models on both sides). */
  makerCount: number;
  /** Its latest reason; all three null only for a row written before any reason. */
  waitsFor: WaitReason["waitsFor"] | null;
  personRecheckAt: Date | null;
  reasonAt: Date | null;
}>;

type WaitingRow = {
  run_id: string;
  waiting_since: Date;
  owner_ref: string | null;
  legacy_asker_id: string | null;
  plan_tier: "free" | "premium" | null;
  composition_budget_tier: "low" | "medium" | "high";
  depth: number;
  maker_count: number;
  waits_for: WaitReason["waitsFor"] | null;
  person_recheck_at: Date | null;
  reason_at: Date | null;
};

const WAITING_COLUMNS = `run_id, waiting_since, owner_ref::text AS owner_ref, legacy_asker_id,
  plan_tier, composition_budget_tier, depth, maker_count, waits_for, person_recheck_at, reason_at`;

function waitingRun(row: WaitingRow): WaitingRun {
  return Object.freeze({
    runId: row.run_id,
    waitingSince: row.waiting_since,
    ownerRef: row.owner_ref,
    legacyAskerId: row.legacy_asker_id,
    planTier: row.plan_tier,
    compositionBudgetTier: row.composition_budget_tier,
    depth: row.depth,
    makerCount: row.maker_count,
    waitsFor: row.waits_for,
    personRecheckAt: row.person_recheck_at,
    reasonAt: row.reason_at
  });
}

function waitingRef(row: Readonly<{ run_id: string; waiting_since: Date }>): WaitingRunRef {
  return Object.freeze({ runId: row.run_id, waitingSince: row.waiting_since });
}

function validInstant(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export class RunWaitRepository {
  constructor(private readonly pool: Pool) {}

  /** The run takes its place in line, in the room decision's locked transaction. */
  async enterWait(client: Pick<PoolClient, "query">, runId: string, at: Date): Promise<void> {
    await client.query("INSERT INTO core.run_wait (run_id, waiting_since) VALUES ($1, $2)", [runId, at]);
  }

  /**
   * Why it waits, appended in the transaction that decided it (the ask's WAIT)
   * or found it changed (the waker). `at` is the instant the room measured at.
   */
  async recordReason(
    client: Pick<PoolClient, "query">,
    runId: string,
    reason: WaitReason & Readonly<{ at: Date }>
  ): Promise<void> {
    const person = reason?.waitsFor === "PERSON";
    if ((reason?.waitsFor !== "SITE" && !person) || !validInstant(reason.at)
      || (person ? !validInstant(reason.personRecheckAt) : reason.personRecheckAt !== null)) {
      throw new TypeError("RUN_WAIT_REASON_INVALID");
    }
    await client.query(
      `INSERT INTO core.run_wait_reason (reason_id, run_id, evaluated_at, waits_for, person_recheck_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [runId, reason.at, reason.waitsFor, reason.personRecheckAt]
    );
  }

  /** The waker started it, in the same locked transaction as its hold. */
  async markStarted(client: Pick<PoolClient, "query">, runId: string, at: Date): Promise<void> {
    await client.query("INSERT INTO core.run_wait_start (run_id, started_at) VALUES ($1, $2)", [runId, at]);
  }

  async isWaiting(executor: Pick<PoolClient, "query">, runId: string): Promise<boolean> {
    const result = await executor.query<{ waiting: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM core.run_waiting_v WHERE run_id = $1) AS waiting", [runId]
    );
    return result.rows[0]?.waiting === true;
  }

  async waitingForOwner(ownerRef: string): Promise<ReadonlyArray<WaitingRunRef>> {
    const result = await this.pool.query<{ run_id: string; waiting_since: Date }>(
      `SELECT run_id, waiting_since FROM core.run_waiting_v
       WHERE owner_ref = $1::uuid ORDER BY waiting_since, run_id`,
      [ownerRef]
    );
    return Object.freeze(result.rows.map(waitingRef));
  }

  async waitingForLegacyAsker(legacyAskerId: string): Promise<ReadonlyArray<WaitingRunRef>> {
    const result = await this.pool.query<{ run_id: string; waiting_since: Date }>(
      `SELECT run_id, waiting_since FROM core.run_waiting_v
       WHERE legacy_asker_id = $1 ORDER BY waiting_since, run_id`,
      [legacyAskerId]
    );
    return Object.freeze(result.rows.map(waitingRef));
  }

  async oldestWaiting(limit: number): Promise<ReadonlyArray<WaitingRun>> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) throw new TypeError("RUN_WAIT_LIMIT_INVALID");
    const result = await this.pool.query<WaitingRow>(
      `SELECT ${WAITING_COLUMNS} FROM core.run_waiting_v ORDER BY waiting_since, run_id LIMIT $1`, [limit]
    );
    return Object.freeze(result.rows.map(waitingRun));
  }

  async readWaiting(runId: string): Promise<WaitingRun | null> {
    const result = await this.pool.query<WaitingRow>(
      `SELECT ${WAITING_COLUMNS} FROM core.run_waiting_v WHERE run_id = $1`, [runId]
    );
    const row = result.rows[0];
    return row === undefined ? null : waitingRun(row);
  }

  /** How many runs wait (B6b's boot refuses a hosted register without the band while any does). */
  async countWaiting(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run_waiting_v"
    );
    return Number(result.rows[0]?.count ?? "0");
  }
}
