import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { applyForwardChain, type ForwardStepPlan } from "../../packages/db/src/migration-forward-chain.js";
import { AUTH_DB_BATCH_MIGRATION } from "../../packages/db/src/migration-forward-auth-db-batch.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Forward-chain review (2026-10-09): a step's own security checks keep running after a later step is appended.
 * Before, only the LAST applied step's postcondition ran on replay, so once another step followed the auth DB batch
 * nothing re-checked the batch's promises (for example: no runtime may publish staff alert readiness).
 */
let db: TestDatabase;
beforeAll(async () => { db = await startTestDatabase(); await migrate(db.pool); }, 300_000);
afterAll(async () => { await db?.stop(); });

it("re-runs every applied step's own verifier on replay, not only the last step's", async () => {
  const plan = await loadMigrationPlan();
  const last = plan.forwardChain.at(-1)!;
  expect(plan.forwardChain.map((step) => step.name)).toContain(AUTH_DB_BATCH_MIGRATION);
  // A later step that changes nothing and checks nothing of its own (its postcondition is a constant).
  const probe: ForwardStepPlan = Object.freeze({
    name: "0199_replay_probe.sql", version: "replay-probe-v1", manifestSha256: "f".repeat(64), sourceSha256: "e".repeat(64), sql: "SELECT 1",
    previousName: last.name, previousManifestSha256: last.manifestSha256, previousVerifierSha256: last.verifierSha256,
    verifierPath: last.verifierPath, verifierSha256: last.verifierSha256, verifierSql: last.verifierSql,
    postconditionEvidence: async () => "d".repeat(64)
  });
  const extended = { ...plan, forwardChain: Object.freeze([...plan.forwardChain, probe]) };
  const ledger = async (): Promise<string[]> => (await db.pool.query<{ name: string }>("SELECT name FROM public.debateai_schema_migration")).rows.map((row) => row.name);
  const replay = async (): Promise<void> => {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await applyForwardChain(client, extended, new Set(await ledger()));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  };
  await replay();
  expect(await ledger()).toContain(probe.name);
  await replay();
  // A grant the batch forbids, made after the probe step became the last one.
  await db.pool.query("GRANT EXECUTE ON FUNCTION staff.publish_independent_alert_readiness(text,uuid,text,uuid,timestamptz) TO debateai_runtime");
  await expect(replay()).rejects.toThrow("MIGRATION_FORWARD_AUTH_DB_BATCH_RUNTIME_DRIFT debateai_runtime");
  await db.pool.query("REVOKE EXECUTE ON FUNCTION staff.publish_independent_alert_readiness(text,uuid,text,uuid,timestamptz) FROM debateai_runtime");
  await replay();
}, 300_000);
