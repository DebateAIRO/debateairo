import type { Pool, PoolClient } from "pg";

/**
 * Budget spec 2026-09-28 §2.7 (migration 0083) — THE WAITING LINE.
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

/** Where one page of the waker's read ended, in the line's own order: (waiting_since, run_id). */
export type WaitingRunCursor = Readonly<{ waitingSince: Date; runId: string }>;

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

/**
 * Budget spec §2.3 rule 1 — A PERSON REASON THAT MAY BE STALE: its recheck
 * instant has passed, or an entitlement event the room did not measure the run
 * with is now in force (recorded after the reason — both database clocks — or
 * taking effect after the instant it was measured at — both process clocks).
 * `line` is `core.run_waiting_v`, `$1` is now. B7b's waker reads the same words.
 */
const PERSON_BLOCK_MAY_HAVE_LIFTED = `(line.person_recheck_at <= $1
  OR EXISTS (
    SELECT 1 FROM billing.entitlement_event AS event
    WHERE event.owner_ref = line.owner_ref
      AND event.effective_at <= $1
      AND (event.recorded_at > line.reason_recorded_at OR event.effective_at > line.reason_at)
  ))`;

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

  /**
   * Budget spec §2.3 rule 1 (B6a) — DOES ANY WAITING RUN HOLD A NEW QUESTION
   * BACK? One statement, whatever the line's length. Yes for a run that waits for
   * the site (or has no reason yet: the careful side), and for a run recorded as
   * waiting for its own person whose block may have lifted, until the waker
   * measures it again. A run whose own person is still full holds nobody back.
   */
  async siteLineBlocking(now: Date): Promise<boolean> {
    const result = await this.pool.query<{ blocking: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM core.run_waiting_v AS line
         WHERE line.waits_for IS DISTINCT FROM 'PERSON' OR ${PERSON_BLOCK_MAY_HAVE_LIFTED}
       ) AS blocking`,
      [now]
    );
    return result.rows[0]?.blocking === true;
  }

  /**
   * Budget spec §2.7 / §2.3 rule 1 (B7b) — THE RUNS WORTH TRYING THIS TICK,
   * oldest first, after `after` (a keyset cursor, never a fixed window): every
   * run waiting for the site (or with no reason yet), and a run recorded as
   * waiting for its own person only when that block may have lifted (the shared
   * predicate), when its reason is over an hour old — the backstop for a change
   * no event marks, such as a paid plan lapsing past its paid-through instant —
   * or while the process has not yet swept the whole line once (`everyPerson`:
   * a new register version arrives as a restart). A run whose own person is still
   * full is never read, however many wait.
   */
  async wakeCandidates(input: Readonly<{
    now: Date;
    after: WaitingRunCursor | null;
    limit: number;
    everyPerson: boolean;
  }>): Promise<ReadonlyArray<WaitingRun>> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1_000) {
      throw new TypeError("RUN_WAIT_LIMIT_INVALID");
    }
    const result = await this.pool.query<WaitingRow>(
      `SELECT ${WAITING_COLUMNS} FROM core.run_waiting_v AS line
       WHERE ($2::timestamptz IS NULL OR (line.waiting_since, line.run_id) > ($2::timestamptz, $3::uuid))
         AND (line.waits_for IS DISTINCT FROM 'PERSON'
           OR $4::boolean
           OR line.reason_at <= $1::timestamptz - interval '1 hour'
           OR ${PERSON_BLOCK_MAY_HAVE_LIFTED})
       ORDER BY line.waiting_since, line.run_id
       LIMIT $5`,
      [input.now, input.after?.waitingSince ?? null, input.after?.runId ?? null, input.everyPerson, input.limit]
    );
    return Object.freeze(result.rows.map(waitingRun));
  }
}
