import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { loadMigrationPlan, type MigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { applyForwardChain, effectiveForwardVerifierSql, type ForwardStepPlan } from "../../packages/db/src/migration-forward-chain.js";
import { AUTH_DB_BATCH_MIGRATION } from "../../packages/db/src/migration-forward-auth-db-batch.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Forward-chain review (2026-10-09): a step's own security checks keep running after a later step is appended, and a
 * step applied in this very run is checked against every earlier step's rules before the transaction commits.
 * Before, only the LAST applied step's postcondition ran on replay, so once another step followed the auth DB batch
 * nothing re-checked the batch's promises (for example: no runtime may publish staff alert readiness).
 */
let db: TestDatabase;
beforeAll(async () => { db = await startTestDatabase(); await migrate(db.pool); }, 300_000);
const NETOPIA = "0111_billing_netopia.sql";
afterAll(async () => { await db?.stop(); });

const READINESS_PUBLISH = "staff.publish_independent_alert_readiness(text,uuid,text,uuid,timestamptz)";
/** A later step with constant digests; `checks` is its own replay verifier (like the batch's), if any. */
function probe(previous: ForwardStepPlan, name: string, sql = "SELECT 1", checks?: string): ForwardStepPlan {
  return Object.freeze({
    name, version: `${name}-v1`, manifestSha256: "f".repeat(64), sourceSha256: "e".repeat(64), sql,
    previousName: previous.name, previousManifestSha256: previous.manifestSha256, previousVerifierSha256: previous.verifierSha256,
    verifierPath: previous.verifierPath, verifierSha256: previous.verifierSha256, verifierSql: previous.verifierSql,
    postconditionEvidence: async () => "d".repeat(64), ...(checks === undefined ? {} : { replayVerifierSql: checks })
  });
}
let plan: MigrationPlan;
let first: ForwardStepPlan;
const chainOf = (...steps: ForwardStepPlan[]): MigrationPlan => ({ ...plan, forwardChain: Object.freeze([...plan.forwardChain, ...steps]) });
const ledger = async (): Promise<string[]> => (await db.pool.query<{ name: string }>("SELECT name FROM public.debateai_schema_migration")).rows.map((row) => row.name);
async function run(extended: MigrationPlan): Promise<void> {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await applyForwardChain(client, extended, new Set(await ledger()));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
const runtimeMayPublish = async (): Promise<boolean> =>
  (await db.pool.query<{ allowed: boolean }>("SELECT has_function_privilege('debateai_runtime',$1,'EXECUTE') AS allowed", [READINESS_PUBLISH])).rows[0]!.allowed;

it("keeps NETOPIA's 0111 verifier in force and replaying once the auth DB batch (0112) is appended after it", async () => {
  // First in this file: the probe steps below add ledger rows that the real migrate() would refuse as unknown.
  const real = await loadMigrationPlan();
  expect(real.forwardChain.map((step) => step.name)).toEqual([NETOPIA, AUTH_DB_BATCH_MIGRATION]);
  const [netopia, batch] = real.forwardChain;
  const applied = new Set(await ledger());
  expect(applied.has(NETOPIA) && applied.has(AUTH_DB_BATCH_MIGRATION)).toBe(true);
  // The batch keeps 0111's effective-capability verifier: with 0112 last, the verifier in force is 0111's, byte for byte.
  expect(batch!.verifierSha256).toBe(netopia!.verifierSha256);
  expect(effectiveForwardVerifierSql(real, applied)).toBe(netopia!.verifierSql);
  // A drift only 0111's verifier knows (a NETOPIA table granted to a wrong role) is refused by migrate() with 0112 last.
  await db.pool.query("GRANT SELECT ON billing.card_token TO debateai_authorization_runtime");
  try {
    await expect(migrate(db.pool)).rejects.toThrow("BILLING_NETOPIA_111_TABLE_PRIVILEGE card_token");
  } finally {
    await db.pool.query("REVOKE SELECT ON billing.card_token FROM debateai_authorization_runtime");
  }
  await migrate(db.pool);
}, 300_000);

it("re-runs every applied step's own verifier on replay, not only the last step's", async () => {
  plan = await loadMigrationPlan();
  expect(plan.forwardChain.map((step) => step.name)).toContain(AUTH_DB_BATCH_MIGRATION);
  // A later step that changes nothing and checks nothing of its own (its postcondition is a constant).
  first = probe(plan.forwardChain.at(-1)!, "0199_replay_probe.sql");
  await run(chainOf(first));
  expect(await ledger()).toContain(first.name);
  await run(chainOf(first));
  // A grant the batch forbids, made after the probe step became the last one.
  await db.pool.query(`GRANT EXECUTE ON FUNCTION ${READINESS_PUBLISH} TO debateai_runtime`);
  await expect(run(chainOf(first))).rejects.toThrow("MIGRATION_FORWARD_AUTH_DB_BATCH_RUNTIME_DRIFT debateai_runtime");
  await db.pool.query(`REVOKE EXECUTE ON FUNCTION ${READINESS_PUBLISH} FROM debateai_runtime`);
  await run(chainOf(first));
}, 300_000);

it("refuses, before COMMIT, a step applied in this same run whose SQL breaks an earlier step's rules", async () => {
  const breaking = probe(first, "0200_breaking_probe.sql", `GRANT EXECUTE ON FUNCTION ${READINESS_PUBLISH} TO debateai_runtime`);
  await expect(run(chainOf(first, breaking))).rejects.toThrow("MIGRATION_FORWARD_AUTH_DB_BATCH_RUNTIME_DRIFT debateai_runtime");
  // Rolled back: no ledger row, no receipt, no grant.
  expect(await ledger()).not.toContain(breaking.name);
  expect((await db.pool.query("SELECT count(*)::int AS n FROM public.debateai_schema_migration_step WHERE source_name=$1", [breaking.name])).rows[0].n).toBe(0);
  expect(await runtimeMayPublish()).toBe(false);
}, 300_000);

it("keeps replaying an earlier step's own verifier after a later step is appended (a NETOPIA-style preceding step)", async () => {
  // probeA plays a preceding step with its own rule (a marker table must exist); probeB is appended after it.
  const probeA = probe(first, "0201_preceding_probe.sql", "CREATE TABLE public.replay_probe_marker(x int)",
    "DO $$BEGIN IF to_regclass('public.replay_probe_marker') IS NULL THEN RAISE EXCEPTION 'REPLAY_PROBE_A_DRIFT';END IF;END$$");
  const probeB = probe(probeA, "0202_following_probe.sql");
  await run(chainOf(first, probeA, probeB));
  expect(await ledger()).toEqual(expect.arrayContaining([probeA.name, probeB.name]));
  await run(chainOf(first, probeA, probeB));
  await db.pool.query("DROP TABLE public.replay_probe_marker");
  await expect(run(chainOf(first, probeA, probeB))).rejects.toThrow("REPLAY_PROBE_A_DRIFT");
}, 300_000);
