import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { loadMigrationPlan, type MigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { applyForwardStep, effectiveForwardVerifierSql, pendingForwardSteps, replayForwardChain, type ChainStep } from "../../packages/db/src/migration-forward-chain.js";
import type { N1Declaration } from "../../packages/db/src/migration-n1.js";
import { AUTH_DB_BATCH_MIGRATION } from "../../packages/db/src/migration-forward-auth-db-batch.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Forward-chain review (2026-10-09): a step's own security checks keep running after a later step is appended, and a
 * step applied in this very run is checked against every earlier step's rules before the transaction commits.
 * Before, only the LAST applied step's postcondition ran on replay, so once another step followed the auth DB batch
 * nothing re-checked the batch's promises (for example: no runtime may publish staff alert readiness).
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await startTestDatabase(); await migrate(db.pool);
  // Every probe test below builds on the real chain plus a first probe step that changes and checks nothing.
  plan = await loadMigrationPlan();
  first = probe(plan.forwardChain.at(-1)!, "0199_replay_probe.sql");
}, 300_000);
const NETOPIA = "0111_billing_netopia.sql";
/** Part C's step, chained after the auth DB batch (spec 2026-10-05 §2.16.6); it keeps 0111's verifier in force too. */
const PART_C = "0113_billing_price_currencies.sql";
/** Role rotation's step, chained after Part C's (spec 2026-10-11 Part 3); it keeps 0111's verifier in force too. */
const ROLE_ROTATION = "0114_role_rotation.sql";
afterAll(async () => { await db?.stop(); });

const READINESS_PUBLISH = "staff.publish_independent_alert_readiness(text,uuid,text,uuid,timestamptz)";
/** Every probe is an expand step that keeps the verifier (side-by-side §5's n1 header, migration-n1.ts). */
const EXPAND: N1Declaration = Object.freeze({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
/** A later step with constant digests; `checks` is its own replay verifier (like the batch's), if any. */
function probe(previous: ChainStep, name: string, sql = "SELECT 1", checks?: string): ChainStep {
  return Object.freeze({
    name, version: `${name}-v1`, manifestSha256: "f".repeat(64), sourceSha256: "e".repeat(64), sql,
    previousName: previous.name, previousManifestSha256: previous.manifestSha256, previousVerifierSha256: previous.verifierSha256,
    verifierPath: previous.verifierPath, verifierSha256: previous.verifierSha256, verifierSql: previous.verifierSql,
    postconditionEvidence: async () => "d".repeat(64), n1: EXPAND, ...(checks === undefined ? {} : { replayVerifierSql: checks })
  });
}
let plan: MigrationPlan;
let first: ChainStep;
const chainOf = (...steps: ChainStep[]): MigrationPlan => ({ ...plan, forwardChain: Object.freeze([...plan.forwardChain, ...steps]) });
const ledger = async (): Promise<string[]> => (await db.pool.query<{ name: string }>("SELECT name FROM public.debateai_schema_migration")).rows.map((row) => row.name);
/** The chain part of migrate() in one transaction: the replay of the applied prefix, then each pending step. */
async function run(extended: MigrationPlan): Promise<void> {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    let done = await replayForwardChain(client, extended, new Set(await ledger()));
    for (const step of pendingForwardSteps(extended, done)) {
      await applyForwardStep(client, extended, step, done);
      done = [...done, step];
    }
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
  // data-export S01 (V-41): the export (0115) follows role rotation and keeps the same effective verifier; so do the
  // mail locale (0116, S01-C05), after the export, the debate shape's map (0117), after the mail locale, the language
  // check's site cost (0118), after the map, the reclaim resume (0119), after the language check, the reply measures
  // (0120), after the reclaim resume (spec 2026-10-15), then the engine verdict (0121, spec 2026-10-15 engine redesign
  // R2), then the engine's map answer step (0122, spec 2026-10-15 engine redesign R3), then the side-by-side releases
  // (0123, spec 2026-10-21 side-by-side uploads), then the settings activation (0124, side-by-side spec §13), then the
  // Italy-specific approval (0125), then row-level security (0126), last (mission row-level-security, SPEC-v4 R26), which
  // supersedes 0111's verifier with its own (R34).
  expect(real.forwardChain.map((step) => step.name)).toEqual([NETOPIA, AUTH_DB_BATCH_MIGRATION, PART_C, ROLE_ROTATION, "0115_data_export.sql",
    "0116_mail_locale.sql", "0117_debate_shape_map.sql", "0118_language_check_spend.sql", "0119_reclaim_resume.sql",
    "0120_reply_measures.sql", "0121_engine_verdict.sql", "0122_engine_map_check.sql", "0123_side_by_side_releases.sql",
    "0124_settings_activation.sql", "0125_italy_specific_approval.sql", "0126_row_level_security.sql"]);
  const [netopia, batch, partC, rotation] = real.forwardChain;
  const applied = new Set(await ledger());
  expect(applied.has(NETOPIA) && applied.has(AUTH_DB_BATCH_MIGRATION) && applied.has(PART_C) && applied.has(ROLE_ROTATION)).toBe(true);
  // The batch, Part C's step, role rotation's, the export's, the map's, the language check's, the reclaim resume's, the
  // reply measures', the engine verdict's, the engine's map answer step's, the side-by-side releases', the settings
  // activation's and the Italy-specific approval's keep 0111's effective-capability verifier: with 0125 the last of them,
  // the verifier in force is 0111's, byte for byte. 0126's verifier supersedes it at the head: every check 0111's makes,
  // its row-security clause aside (SPEC-v4 R34).
  expect(batch!.verifierSha256).toBe(netopia!.verifierSha256);
  expect(real.forwardChain.at(-2)!.verifierSha256).toBe(netopia!.verifierSha256);
  expect(real.forwardChain.at(-1)!.verifierPath).toBe("lineage/verify-effective-capabilities-126.sql");
  expect(real.forwardChain.at(-1)!.verifierSha256).not.toBe(netopia!.verifierSha256);
  expect(partC!.verifierSha256).toBe(netopia!.verifierSha256);
  expect(rotation!.verifierSha256).toBe(netopia!.verifierSha256);
  expect(effectiveForwardVerifierSql(real, new Set([...applied].filter((name) => name !== "0126_row_level_security.sql")))).toBe(netopia!.verifierSql);
  expect(effectiveForwardVerifierSql(real, applied)).toBe(real.forwardChain.at(-1)!.verifierSql);
  // A drift only 0111's verifier knows (a NETOPIA table granted to a wrong role) is refused by migrate() with 0126 last.
  await db.pool.query("GRANT SELECT ON billing.card_token TO debateai_authorization_runtime");
  try {
    await expect(migrate(db.pool)).rejects.toThrow("BILLING_NETOPIA_111_TABLE_PRIVILEGE card_token");
  } finally {
    await db.pool.query("REVOKE SELECT ON billing.card_token FROM debateai_authorization_runtime");
  }
  await migrate(db.pool);
}, 300_000);

it("re-runs every applied step's own verifier on replay, not only the last step's", async () => {
  expect(plan.forwardChain.map((step) => step.name)).toContain(AUTH_DB_BATCH_MIGRATION);
  // A later step that changes nothing and checks nothing of its own (its postcondition is a constant).
  await run(chainOf(first));
  expect(await ledger()).toContain(first.name);
  await run(chainOf(first));
  // A grant the batch forbids, made after the probe step became the last one.
  await db.pool.query(`GRANT EXECUTE ON FUNCTION ${READINESS_PUBLISH} TO debateai_runtime`);
  try {
    await expect(run(chainOf(first))).rejects.toThrow("MIGRATION_FORWARD_AUTH_DB_BATCH_RUNTIME_DRIFT debateai_runtime");
  } finally {
    await db.pool.query(`REVOKE EXECUTE ON FUNCTION ${READINESS_PUBLISH} FROM debateai_runtime`);
  }
  expect(await runtimeMayPublish()).toBe(false);
  await run(chainOf(first));
}, 300_000);

it("refuses, before COMMIT, a step applied in this same run whose SQL breaks an earlier step's rules", async () => {
  // The grant comes only from the new step's own SQL, so the post-apply re-check (not the pre-apply replay) refuses it.
  expect(await runtimeMayPublish()).toBe(false);
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
  try {
    await expect(run(chainOf(first, probeA, probeB))).rejects.toThrow("REPLAY_PROBE_A_DRIFT");
  } finally {
    await db.pool.query("CREATE TABLE public.replay_probe_marker(x int)");
  }
  await run(chainOf(first, probeA, probeB));
}, 300_000);
