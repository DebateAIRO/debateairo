// PROBE — REV(S01) pass 2 (scoped), lens product-truth. Written against slice head c358d494.
// Re-derived from probes/REV-S01-p1-product-truth/rev-s01-p1-product-truth-db.test.ts: PTDB-1…3 keep
// their pass-1 expectations (I-2 must not have moved); PTDB-4's expectation INVERTS — at db4758da a
// failed auto-publish was re-armed for IMMEDIATE re-claim, at c358d494 it must not be.
// Copy into <worktree>/tests/integration/ and run:
//   pnpm exec vitest run tests/integration/rev-s01-p2-product-truth-db.test.ts
// Reads under SET ROLE debateai_runtime, never a superuser pool.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let runtimePool: Pool;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  runtimePool = createPool(database.connectionString, { max: 1 });
  await runtimePool.query("SET ROLE debateai_runtime");
}, 600_000);

afterAll(async () => { await runtimePool?.end(); await database?.stop(); });

async function insertRun(
  planTier: "free" | "premium" | null,
  freePublicRule: boolean | null
): Promise<string> {
  const runId = randomUUID();
  const columns = freePublicRule === null
    ? "composition_budget_tier,plan_tier,"
    : "composition_budget_tier,plan_tier,free_public_rule,";
  const values = freePublicRule === null ? "'low',$9," : `'low',$9,${freePublicRule},`;
  await database.pool.query(
    `INSERT INTO core.run (
       run_id,question_line,asker_id,session_id,caller_scope,as_of,
       asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
       ${columns}
       depth_params,agent_count,discovered_panel,stranger_sample_rate,
       envelope_basis,register_version,battery_version,ask_contract,created_at_seq
     ) VALUES (
       $1,$2,$3,$4,'ASKER',$5,'casual','casual','ASKER',$6,
       ${values}'{}'::jsonb,1,$7::jsonb,1,
       '{}'::jsonb,1,$8,'{}'::jsonb,ledger.allocate_sequence()
     )`,
    [
      runId, `REV-S01-p2 product-truth ${runId}`, `rev-s01-p2-${runId}`, randomUUID(),
      new Date("2026-09-19T00:00:00.000Z"), "rev-s01-p2:product-truth",
      JSON.stringify(fixtureDiscoveredPanel(1)), "rev-s01-p2:product-truth", planTier
    ]
  );
  return runId;
}

async function bound(pool: Pick<Pool, "query">, runId: string): Promise<boolean> {
  const result = await pool.query<{ bound: boolean | null }>(
    "SELECT core.run_is_free_public_bound($1::uuid) AS bound", [runId]
  );
  return result.rows[0]?.bound === true;
}

describe("REV(S01) p2 product-truth — I-2 and V-2, re-measured at c358d494", () => {
  it("PTDB2-1 still binds only a Free run whose own row carries the rule", async () => {
    const runtime = runtimePool;
    const preRuleFree = await insertRun("free", null);
    const postRuleFree = await insertRun("free", true);
    const explicitlyUnruled = await insertRun("free", false);
    const premium = await insertRun("premium", true);
    const legacyNullTier = await insertRun(null, true);
    expect(await bound(runtime, preRuleFree)).toBe(false);
    expect(await bound(runtime, postRuleFree)).toBe(true);
    expect(await bound(runtime, explicitlyUnruled)).toBe(false);
    expect(await bound(runtime, premium)).toBe(false);
    expect(await bound(runtime, legacyNullTier)).toBe(false);
    expect(await bound(runtime, randomUUID())).toBe(false);
  }, 600_000);

  it("PTDB2-2 still leaves every pre-0066 row unbound by the column default", async () => {
    const applied = await database.pool.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_schema='core' AND table_name='run' AND column_name='free_public_rule'`
    );
    expect(applied.rows[0]?.column_default).toBe("false");
  }, 600_000);

  it("PTDB2-3 still records no visibility event for a run the rule did not bind", async () => {
    const preRuleFree = await insertRun("free", null);
    const events = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run_visibility_event WHERE run_id=$1",
      [preRuleFree]
    );
    expect(events.rows[0]?.count).toBe("0");
  }, 600_000);

  // P-N1. Pass-1 PTDB-4 proved a failed auto-publish was claimable again immediately.
  it("PTDB2-4 no longer re-arms a failed auto-publish for immediate re-claim", async () => {
    const runId = await insertRun("free", true);
    const userId = randomUUID();
    const ownerRef = randomUUID();
    const fail = () => database.pool.query(
      "SELECT core.upsert_free_public_auto_publish_work($1,$2,$3,'AUTO_PUBLISH_NULL_PSEUDONYM')",
      [runId, userId, ownerRef]
    );
    const claim = async () => (await database.pool.query<{ run_id: string }>(
      "SELECT run_id FROM core.claim_free_public_auto_publish_work(100)"
    )).rows.map((row) => row.run_id);
    const delaySeconds = async () => Number((await database.pool.query<{ s: string }>(
      `SELECT EXTRACT(EPOCH FROM (next_attempt_at-clock_timestamp()))::text AS s
       FROM core.free_public_auto_publish_work WHERE run_id=$1`, [runId]
    )).rows[0]?.s ?? "0");
    await fail();
    expect(await claim()).not.toContain(runId);
    const first = await delaySeconds();
    expect(first).toBeGreaterThan(20);
    await fail();
    const second = await delaySeconds();
    expect(second).toBeGreaterThan(first);
    // and the delay is capped, never unbounded
    for (let attempt = 0; attempt < 10; attempt += 1) await fail();
    expect(await delaySeconds()).toBeLessThanOrEqual(3600);
  }, 600_000);

  // The serve-time enqueue must be claimable at once, or a silent failure is never retried.
  it("PTDB2-5 makes a serve-time enqueue immediately claimable by the reconciler", async () => {
    const runId = await insertRun("free", true);
    const userId = randomUUID();
    const ownerRef = randomUUID();
    const ensured = await database.pool.query<{ ensured: boolean }>(
      "SELECT core.ensure_free_public_auto_publish_work($1,$2,$3) AS ensured",
      [runId, userId, ownerRef]
    );
    expect(ensured.rows[0]?.ensured).toBe(true);
    const claimed = (await database.pool.query<{ run_id: string }>(
      "SELECT run_id FROM core.claim_free_public_auto_publish_work(100)"
    )).rows.map((row) => row.run_id);
    expect(claimed).toContain(runId);
    // …and a second ensure while the row is already outstanding does not reset its backoff
    await database.pool.query(
      "SELECT core.upsert_free_public_auto_publish_work($1,$2,$3,'AUTO_PUBLISH_CIPHER_FAILED')",
      [runId, userId, ownerRef]
    );
    const before = (await database.pool.query<{ n: string; a: number }>(
      `SELECT next_attempt_at::text AS n, attempt_count AS a
       FROM core.free_public_auto_publish_work WHERE run_id=$1`, [runId]
    )).rows[0];
    await database.pool.query(
      "SELECT core.ensure_free_public_auto_publish_work($1,$2,$3)", [runId, userId, ownerRef]
    );
    const after = (await database.pool.query<{ n: string; a: number }>(
      `SELECT next_attempt_at::text AS n, attempt_count AS a
       FROM core.free_public_auto_publish_work WHERE run_id=$1`, [runId]
    )).rows[0];
    expect(after?.n).toBe(before?.n);
    expect(after?.a).toBe(before?.a);
  }, 600_000);
});
