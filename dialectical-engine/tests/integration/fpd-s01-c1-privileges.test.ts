import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let runtimePool: Pool;
let erasurePool: Pool;
let unprivilegedPool: Pool;

async function insertBoundFreeRun(): Promise<string> {
  const runId = randomUUID();
  await database.pool.query(
    `INSERT INTO core.run (
       run_id,question_line,asker_id,session_id,caller_scope,as_of,
       asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
       composition_budget_tier,plan_tier,free_public_rule,
       depth_params,agent_count,discovered_panel,stranger_sample_rate,
       envelope_basis,register_version,battery_version,ask_contract,created_at_seq
     ) VALUES (
       $1,$2,$3,$4,'ASKER',now(),'casual','casual','ASKER',$5,
       'low','free',true,'{}'::jsonb,1,$7::jsonb,1,
       '{}'::jsonb,1,$6,'{}'::jsonb,ledger.allocate_sequence()
     )`,
    [
      runId,
      `FPD privilege ${runId}`,
      `fpd-privilege-${runId}`,
      randomUUID(),
      "fpd-s01-c1:privilege",
      "fpd-s01-c1:privilege",
      JSON.stringify(fixtureDiscoveredPanel(1))
    ]
  );
  return runId;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE debateai_fpd_s01_nobody NOLOGIN NOINHERIT");
  await database.pool.query("GRANT USAGE ON SCHEMA core TO debateai_fpd_s01_nobody");

  runtimePool = createPool(database.connectionString, { max: 1 });
  erasurePool = createPool(database.connectionString, { max: 1 });
  unprivilegedPool = createPool(database.connectionString, { max: 1 });
  await runtimePool.query("SET ROLE debateai_runtime");
  await erasurePool.query("SET ROLE debateai_erasure_runtime");
  await unprivilegedPool.query("SET ROLE debateai_fpd_s01_nobody");
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await erasurePool?.end();
  await unprivilegedPool?.end();
  await database?.stop();
});

describe("S01 C1 bound-predicate privileges", () => {
  it("debateai_runtime can read the bound predicate", async () => {
    const runId = await insertBoundFreeRun();
    const result = await runtimePool.query<{ bound: boolean }>(
      "SELECT core.run_is_free_public_bound($1::uuid) AS bound",
      [runId]
    );
    const preservedGrant = await database.pool.query<{
      content_provision_allowed: boolean;
      unprivileged_allowed: boolean;
    }>(
      `SELECT has_function_privilege(
         'debateai_content_provision',
         'core.create_encrypted_run(jsonb,uuid,uuid,jsonb)',
         'execute'
       ) AS content_provision_allowed,
       has_function_privilege(
         'debateai_fpd_s01_nobody',
         'core.create_encrypted_run(jsonb,uuid,uuid,jsonb)',
         'execute'
       ) AS unprivileged_allowed`
    );

    expect({
      bound: result.rows[0]?.bound,
      contentProvisionExecute: preservedGrant.rows[0]?.content_provision_allowed,
      unprivilegedContentProvisionExecute: preservedGrant.rows[0]?.unprivileged_allowed
    }).toEqual({
      bound: true,
      contentProvisionExecute: true,
      unprivilegedContentProvisionExecute: false
    });
  });

  it("debateai_erasure_runtime cannot read the bound predicate directly", async () => {
    const runId = await insertBoundFreeRun();

    await expect(
      erasurePool.query("SELECT core.run_is_free_public_bound($1::uuid) AS bound", [runId])
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("a role without a grant cannot read the bound predicate", async () => {
    const runId = await insertBoundFreeRun();

    await expect(
      unprivilegedPool.query("SELECT core.run_is_free_public_bound($1::uuid) AS bound", [runId])
    ).rejects.toMatchObject({ code: "42501" });
  });
});
