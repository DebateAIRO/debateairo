// PROBE — REV(S01) pass 1, lens product-truth. Written against slice head db4758da.
// The one product claim only the database can answer: V's I-2, "leave them alone".
// Copy into <worktree>/tests/integration/ and run:
//   pnpm exec vitest run tests/integration/rev-s01-p1-product-truth-db.test.ts
// It starts the repo's own throwaway test database and stops it in afterAll.
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
      runId, `REV-S01-p1 product-truth ${runId}`, `rev-s01-pt-${runId}`, randomUUID(),
      new Date("2026-09-19T00:00:00.000Z"), "rev-s01-p1:product-truth",
      JSON.stringify(fixtureDiscoveredPanel(1)), "rev-s01-p1:product-truth", planTier
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

describe("REV(S01) p1 product-truth — I-2 'leave them alone', read under the product's role", () => {
  it("PTDB-1 binds only a Free run whose own row carries the rule, with no clock input", async () => {
    {
      const runtime = runtimePool;
      // the shape a run created BEFORE 0066 has: the column takes its default
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
      // a run id that exists nowhere is not bound either
      expect(await bound(runtime, randomUUID())).toBe(false);
    }
  }, 600_000);

  it("PTDB-2 leaves every row that existed before 0066 unbound by the column default", async () => {
    const applied = await database.pool.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_schema='core' AND table_name='run' AND column_name='free_public_rule'`
    );
    expect(applied.rows[0]?.column_default).toBe("false");
  }, 600_000);

  // V-2 asks: for how long does the owner's read say "publishing"? The work row
  // is re-armed at clock_timestamp() on every failure, so the answer is "for ever,
  // at every reconciler tick, with no backoff and no attempt cap".
  it("PTDB-4 re-arms a permanently failing auto-publish for immediate re-claim", async () => {
    const runId = await insertRun("free", true);
    const userId = randomUUID();
    const ownerRef = randomUUID();
    const upsert = () => database.pool.query(
      "SELECT core.upsert_free_public_auto_publish_work($1,$2,$3,'AUTO_PUBLISH_NULL_PSEUDONYM')",
      [runId, userId, ownerRef]
    );
    const claim = async () => (await database.pool.query<{ run_id: string }>(
      "SELECT run_id FROM core.claim_free_public_auto_publish_work(100)"
    )).rows.map((row) => row.run_id);
    await upsert();
    expect(await claim()).toContain(runId);
    // the claim holds a 5-minute lease, so a second claim inside it skips the row
    expect(await claim()).not.toContain(runId);
    // …but the next failure re-arms it for immediate re-claim, with no delay
    await upsert();
    expect(await claim()).toContain(runId);
    const state = await database.pool.query<{ attempt_count: number; due: boolean }>(
      `SELECT attempt_count, next_attempt_at<=clock_timestamp() AS due
       FROM core.free_public_auto_publish_work WHERE run_id=$1`, [runId]
    );
    expect(state.rows[0]?.attempt_count).toBe(2);
    expect(state.rows[0]?.due).toBe(true);
  }, 600_000);

  it("PTDB-3 records no visibility event for a run the rule did not bind", async () => {
    const preRuleFree = await insertRun("free", null);
    const events = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run_visibility_event WHERE run_id=$1",
      [preRuleFree]
    );
    expect(events.rows[0]?.count).toBe("0");
  }, 600_000);
});
