import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { lineageEvidence, loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { seedInstalledAuth106 } from "../support/auth106.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const EXPORT = "0115_data_export.sql";
const MAIL_LOCALE = "0116_mail_locale.sql";
const NETOPIA = "0111_billing_netopia.sql";
const BATCH = "0112_auth_db_batch.sql";
const PART_C = "0113_billing_price_currencies.sql";
const ROLE_ROTATION = "0114_role_rotation.sql";
/** The debate shape's map, chained after the mail locale (spec 2026-10-12 §3.4). */
const MAP = "0117_debate_shape_map.sql";
/** The language check's site cost, chained after the map (question-language spec 2026-10-13). */
const LANGUAGE_CHECK = "0118_language_check_spend.sql";
/** The reclaim resume, chained after the language check (spec 2026-10-14-reclaim-resume-design). */
const RECLAIM = "0119_reclaim_resume.sql";
/** The reply measures, chained after the reclaim resume (length guidance LG-A, spec 2026-10-15). */
const REPLY_MEASURES = "0120_reply_measures.sql";
/** The engine verdict, chained after the reply measures (engine redesign R2, spec 2026-10-15). */
const ENGINE_VERDICT = "0121_engine_verdict.sql";
/** The engine's map answer step, chained after the engine verdict (engine redesign R3, spec 2026-10-15). */
const ENGINE_MAP_CHECK = "0122_engine_map_check.sql";
/** The side-by-side releases, chained after the engine's map answer step (side-by-side uploads, spec 2026-10-21). */
const SIDE_BY_SIDE = "0123_side_by_side_releases.sql";
/** The settings activation, chained after the side-by-side releases (side-by-side uploads spec §13). */
const SETTINGS_ACTIVATION = "0124_settings_activation.sql";
/** The Italy-specific approval, chained after the settings activation (mission italy-clause-approval). */
const ITALY_APPROVAL = "0125_italy_specific_approval.sql";
const SYNTHESIS_CHECK = "0126_synthesis_check.sql";
const PUBLICATION_REVIEW = "0127_publication_review.sql";
const THREAT_REPORT = "0128_threat_reports.sql";
const SUPPORT_ANSWER_SCOPE = "0129_support_answer_scope.sql";
/** Row-level security, chained after the support answer scope (mission row-level-security, SPEC-v4 R26). */
const RLS = "0130_row_level_security.sql";
/** The V4 account memory (owner rulings N7 and N11), chained after row-level security. */
const V4_ACCOUNT_MEMORY = "0131_v4_account_memory.sql";
/** The Perplexity plan's web evidence store and investigations (task W1-3), chained after the V4 account memory. */
const WEB_EVIDENCE = "0132_web_evidence.sql";
const INVESTIGATIONS = "0133_investigations.sql";
/** The dig model and the month pause (dig-model revision task W2-8), chained after the investigations. */
const DIG_MODEL = "0134_dig_model_and_month_pause.sql";
const ROTATE = "identity.rotate_session_after_step_up(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamp with time zone,uuid,text,text,uuid,timestamp with time zone)";
const rows = async (db: TestDatabase, table: string) => (await db.pool.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
const ledger = (db: TestDatabase) => rows(db, "public.debateai_schema_migration");
const receipts = (db: TestDatabase) => rows(db, "public.debateai_schema_migration_step");

// One database keeps each mutation's restore and replay visible to the next case.
describe("data export forward115", () => {
  let db: TestDatabase;
  beforeAll(async () => { db = await startTestDatabase(); await migrate(db.pool); }, 180_000);
  afterAll(async () => { await db?.stop(); });

  it("G1 applies 0110, NETOPIA 0111, the auth batch 0112, Part C 0113, role rotation 0114, export 0115, the mail locale 0116, the map 0117, the language check 0118 and the reclaim resume 0119 and the reply measures 0120, the engine verdict 0121, the engine's map answer step 0122, the side-by-side releases 0123, the settings activation 0124, the Italy-specific approval 0125, the synthesis check 0126, the publication review 0127, the threat reports 0128 and the support answer scope 0129 and the V4 account memory 0130 with linked receipts", async () => {
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.map(step => step.name)).toEqual([NETOPIA, BATCH, PART_C, ROLE_ROTATION, EXPORT, MAIL_LOCALE, MAP, LANGUAGE_CHECK, RECLAIM, REPLY_MEASURES, ENGINE_VERDICT, ENGINE_MAP_CHECK, SIDE_BY_SIDE, SETTINGS_ACTIVATION, ITALY_APPROVAL, SYNTHESIS_CHECK, PUBLICATION_REVIEW, THREAT_REPORT, SUPPORT_ANSWER_SCOPE, RLS, V4_ACCOUNT_MEMORY, WEB_EVIDENCE, INVESTIGATIONS, DIG_MODEL]);
    const names = (await ledger(db)).map(row => row.name).filter(name => /^01[123]/u.test(name));
    expect(names).toEqual(["0110_account_erasure_public_debates.sql", NETOPIA, BATCH, PART_C, ROLE_ROTATION, EXPORT, MAIL_LOCALE, MAP, LANGUAGE_CHECK, RECLAIM, REPLY_MEASURES, ENGINE_VERDICT, ENGINE_MAP_CHECK, SIDE_BY_SIDE, SETTINGS_ACTIVATION, ITALY_APPROVAL, SYNTHESIS_CHECK, PUBLICATION_REVIEW, THREAT_REPORT, SUPPORT_ANSWER_SCOPE, RLS, V4_ACCOUNT_MEMORY, WEB_EVIDENCE, INVESTIGATIONS, DIG_MODEL]);
    const steps = await receipts(db);
    expect(steps.map(step => step.source_name)).toEqual([NETOPIA, BATCH, PART_C, ROLE_ROTATION, EXPORT, MAIL_LOCALE, MAP, LANGUAGE_CHECK, RECLAIM, REPLY_MEASURES, ENGINE_VERDICT, ENGINE_MAP_CHECK, SIDE_BY_SIDE, SETTINGS_ACTIVATION, ITALY_APPROVAL, SYNTHESIS_CHECK, PUBLICATION_REVIEW, THREAT_REPORT, SUPPORT_ANSWER_SCOPE, RLS, V4_ACCOUNT_MEMORY, WEB_EVIDENCE, INVESTIGATIONS, DIG_MODEL]);
    expect(steps[4].previous_manifest_sha256).toBe(steps[3].forward_manifest_sha256);
    expect(steps[4].verifier_sha256).toBe(steps[3].verifier_sha256);
    expect(steps[5].previous_manifest_sha256).toBe(steps[4].forward_manifest_sha256);
    expect(steps[5].verifier_sha256).toBe(steps[4].verifier_sha256);
    expect((await db.pool.query("SELECT count(*)::int n FROM public.debateai_schema_migration_resolution WHERE logical_name='0093_billing_runtime_role.sql'")).rows[0].n).toBe(0);
  });

  it("G2 replays without changing a ledger row or step receipt", async () => {
    const before = [await ledger(db), await receipts(db)];
    await migrate(db.pool);
    expect([await ledger(db), await receipts(db)]).toEqual(before);
  });

  it("G3 refuses the 0115 SQL against already replaced 0107 bodies without writing", async () => {
    const plan = await loadMigrationPlan();
    const before = [await ledger(db), await receipts(db)];
    await expect(db.pool.query(plan.forwardChain[4]!.sql)).rejects.toMatchObject({ code: "P0001", message: "DATA_EXPORT_0115_REQUIRES_0107_BODIES" });
    expect([await ledger(db), await receipts(db)]).toEqual(before);
  });

  it("G4 binds function bodies, both role ACLs, worker USAGE and the grant CHECK", async () => {
    const definition = (await db.pool.query<{ def: string }>("SELECT pg_get_functiondef(to_regprocedure($1)) def", [ROTATE])).rows[0]!.def;
    const arms: Array<[string, string]> = [
      ["REVOKE USAGE ON SCHEMA identity FROM debateai_data_export_worker", "GRANT USAGE ON SCHEMA identity TO debateai_data_export_worker"],
      ["GRANT EXECUTE ON FUNCTION identity.request_data_export(uuid,uuid,text,uuid,text,jsonb) TO debateai_data_export_worker", "REVOKE EXECUTE ON FUNCTION identity.request_data_export(uuid,uuid,text,uuid,text,jsonb) FROM debateai_data_export_worker"],
      ["GRANT EXECUTE ON FUNCTION identity.claim_data_export(uuid,integer) TO debateai_authorization_runtime", "REVOKE EXECUTE ON FUNCTION identity.claim_data_export(uuid,integer) FROM debateai_authorization_runtime"]
    ];
    await db.pool.query(definition.replace("BEGIN", "BEGIN\n -- G4 body drift"));
    try { await expect(migrate(db.pool)).rejects.toThrow(`MIGRATION_FORWARD_CHAIN_POSTCONDITION_DRIFT ${EXPORT}`); }
    finally { await db.pool.query(definition); }
    await migrate(db.pool);
    for (const [mutate, restore] of arms) {
      await db.pool.query(mutate);
      try { await expect(migrate(db.pool), mutate).rejects.toThrow(`MIGRATION_FORWARD_CHAIN_POSTCONDITION_DRIFT ${EXPORT}`); }
      finally { await db.pool.query(restore); }
      await migrate(db.pool);
    }
    const check = (await db.pool.query("SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conname='step_up_grant_action_check' AND conrelid='identity.step_up_grant'::regclass")).rows[0].def;
    expect(check).toContain("EXPORT_DATA");
  }, 180_000);

  it("F10 accepts schema-neutral reindex on export indexes", async () => {
    for (const statement of [
      "REINDEX TABLE identity.data_export",
      "REINDEX INDEX CONCURRENTLY identity.data_export_pkey",
      "REINDEX TABLE CONCURRENTLY identity.data_export"
    ]) {
      await db.pool.query(statement);
      await expect(migrate(db.pool), statement).resolves.toEqual({ appliedSteps: [], extraSteps: [] });
    }
  }, 180_000);

  it("F10 refuses export catalog drift and accepts the restored catalog", async () => {
    const constraint = async (name: string) => (await db.pool.query<{ def: string }>(
      "SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='identity.data_export'::regclass AND conname=$1", [name]
    )).rows[0]!.def;
    const arms: Array<[string, () => Promise<[string, string]>]> = [
      ["column ACL", async () => ["GRANT SELECT(link_token_hash) ON identity.data_export TO debateai_runtime", "REVOKE SELECT(link_token_hash) ON identity.data_export FROM debateai_runtime"]],
      ["one PREPARING index", async () => ["DROP INDEX identity.data_export_one_preparing", (await db.pool.query<{ def: string }>("SELECT pg_get_indexdef('identity.data_export_one_preparing'::regclass) def")).rows[0]!.def]],
      ["token UNIQUE", async () => ["ALTER TABLE identity.data_export DROP CONSTRAINT data_export_link_token_hash_key", `ALTER TABLE identity.data_export ADD CONSTRAINT data_export_link_token_hash_key ${await constraint("data_export_link_token_hash_key")}`]],
      ["token CHECK", async () => ["ALTER TABLE identity.data_export DROP CONSTRAINT data_export_token_check", `ALTER TABLE identity.data_export ADD CONSTRAINT data_export_token_check ${await constraint("data_export_token_check")}`]],
      ["SENT CHECK", async () => ["ALTER TABLE identity.data_export DROP CONSTRAINT data_export_sent_check", `ALTER TABLE identity.data_export ADD CONSTRAINT data_export_sent_check ${await constraint("data_export_sent_check")}`]],
      ["user FK", async () => ["ALTER TABLE identity.data_export DROP CONSTRAINT data_export_user_id_fkey", `ALTER TABLE identity.data_export ADD CONSTRAINT data_export_user_id_fkey ${await constraint("data_export_user_id_fkey")}`]],
      ["user trigger", async () => ["ALTER TABLE identity.data_export DISABLE TRIGGER USER", "ALTER TABLE identity.data_export ENABLE TRIGGER USER"]]
    ];
    for (const [name, make] of arms) {
      const [mutate, restore] = await make();
      await db.pool.query(mutate);
      try { await expect(migrate(db.pool), name).rejects.toThrow(`MIGRATION_FORWARD_CHAIN_POSTCONDITION_DRIFT ${EXPORT}`); }
      finally { await db.pool.query(restore); }
      await migrate(db.pool);
    }
  }, 300_000);

  it("F11 refuses export role membership, rules, publication, persistence and forced RLS drift", async () => {
    const arms: Array<[string, string, string]> = [
      ["worker to authorization", "GRANT debateai_data_export_worker TO debateai_authorization_runtime", "REVOKE debateai_data_export_worker FROM debateai_authorization_runtime"],
      ["worker to runtime", "GRANT debateai_data_export_worker TO debateai_runtime", "REVOKE debateai_data_export_worker FROM debateai_runtime"],
      ["authorization to worker", "GRANT debateai_authorization_runtime TO debateai_data_export_worker", "REVOKE debateai_authorization_runtime FROM debateai_data_export_worker"],
      ["transitive bridge to worker", "CREATE ROLE dx_forward115_bridge NOLOGIN; GRANT debateai_data_export_worker TO dx_forward115_bridge; GRANT dx_forward115_bridge TO debateai_authorization_runtime", "REVOKE dx_forward115_bridge FROM debateai_authorization_runtime; REVOKE debateai_data_export_worker FROM dx_forward115_bridge; DROP ROLE dx_forward115_bridge"],
      ["rewrite rule", "CREATE RULE dx_forward115_probe AS ON UPDATE TO identity.data_export DO INSTEAD NOTHING", "DROP RULE dx_forward115_probe ON identity.data_export"],
      ["publication", "CREATE PUBLICATION dx_forward115_probe FOR TABLE identity.data_export", "DROP PUBLICATION dx_forward115_probe"],
      ["unlogged", "ALTER TABLE identity.data_export SET UNLOGGED", "ALTER TABLE identity.data_export SET LOGGED"],
      ["forced RLS", "ALTER TABLE identity.data_export FORCE ROW LEVEL SECURITY", "ALTER TABLE identity.data_export NO FORCE ROW LEVEL SECURITY"]
    ];
    for (const [name, mutate, restore] of arms) {
      await db.pool.query(mutate);
      try { await expect(migrate(db.pool), name).rejects.toThrow(`MIGRATION_FORWARD_CHAIN_POSTCONDITION_DRIFT ${EXPORT}`); }
      finally { await db.pool.query(restore); }
      await migrate(db.pool);
    }
  }, 300_000);

  it("G5 binds receipt presence, previous manifest and postcondition digest", async () => {
    const original = (await db.pool.query("SELECT * FROM public.debateai_schema_migration_step WHERE source_name=$1", [EXPORT])).rows[0];
    await db.pool.query("DELETE FROM public.debateai_schema_migration_step WHERE source_name=$1", [EXPORT]);
    try { await expect(migrate(db.pool)).rejects.toThrow("MIGRATION_FORWARD_CHAIN_RECEIPT_BINDING_DRIFT"); }
    finally { await db.pool.query("INSERT INTO public.debateai_schema_migration_step VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", Object.values(original)); }
    await migrate(db.pool);
    for (const [column, refusal] of [["previous_manifest_sha256", `MIGRATION_FORWARD_CHAIN_RECEIPT_BINDING_DRIFT ${EXPORT}`], ["postcondition_evidence_digest", `MIGRATION_FORWARD_CHAIN_POSTCONDITION_DRIFT ${EXPORT}`]] as const) {
      await db.pool.query(`UPDATE public.debateai_schema_migration_step SET ${column}=repeat('0',64) WHERE source_name=$1`, [EXPORT]);
      try { await expect(migrate(db.pool)).rejects.toThrow(refusal); }
      finally { await db.pool.query(`UPDATE public.debateai_schema_migration_step SET ${column}=$1 WHERE source_name=$2`, [original[column], EXPORT]); }
      await migrate(db.pool);
    }
  }, 180_000);

  it("G6 re-seals Auth-106 compatibility after 0115 and still refuses later drift", async () => {
    const auth = await startTestDatabase();
    try {
      await seedInstalledAuth106(auth.pool);
      await migrate(auth.pool);
      await migrate(auth.pool);
      await migrate(auth.pool);
      const client = await auth.pool.connect();
      let evidence: string;
      try { evidence = await lineageEvidence(client); } finally { client.release(); }
      const digest = (await auth.pool.query("SELECT postcondition_evidence_digest FROM public.debateai_schema_migration_resolution WHERE logical_name='0093_billing_runtime_role.sql'")).rows[0].postcondition_evidence_digest;
      expect(digest).toBe(evidence);
      await auth.pool.query("GRANT SELECT ON identity.mfa_recovery_legacy_cohort TO debateai_runtime");
      try { await expect(migrate(auth.pool)).rejects.toThrow("MIGRATION_RESOLUTION_BINDING_DRIFT"); }
      finally { await auth.pool.query("REVOKE SELECT ON identity.mfa_recovery_legacy_cohort FROM debateai_runtime"); }
      await migrate(auth.pool);
    } finally { await auth.stop(); }
  }, 180_000);

  it("G7 refuses source, manifest, verifier and inventory drift in a bounded copy", async () => {
    const root = await mkdtemp(join(tmpdir(), "dx-forward115-"));
    try {
      await mkdir(join(root, "packages/db/src"), { recursive: true });
      for (const name of await readdir(new URL("../../packages/db/src/", import.meta.url))) {
        if (name.startsWith("migration-") && name.endsWith(".ts")) await cp(new URL(`../../packages/db/src/${name}`, import.meta.url), join(root, "packages/db/src", name));
      }
      await cp(new URL("../../migrations", import.meta.url), join(root, "migrations"), { recursive: true });
      const script = join(root, "probe.mts");
      await writeFile(script, "import {loadMigrationPlan} from './packages/db/src/migration-lineage.ts'; await loadMigrationPlan();");
      const run = () => promisify(execFile)(process.execPath, ["--import", "tsx", script], { cwd: process.cwd(), timeout: 30_000, maxBuffer: 100_000 });
      await run();
      const sql = join(root, `migrations/${EXPORT}`), sqlBytes = await readFile(sql);
      await writeFile(sql, Buffer.concat([sqlBytes, Buffer.from(" ")]));
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_FORWARD115_SOURCE_DIGEST") });
      await writeFile(sql, sqlBytes);
      const manifest = join(root, "migrations/lineage/data-export-forward115.json"), manifestBytes = await readFile(manifest, "utf8");
      const json = JSON.parse(manifestBytes);
      json.previous.manifestSha256 = "0".repeat(64);
      await writeFile(manifest, JSON.stringify(json));
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_FORWARD115_MANIFEST") });
      json.previous.manifestSha256 = JSON.parse(manifestBytes).previous.manifestSha256;
      json.verifier.path = "lineage/verify-effective-capabilities-115.sql";
      await writeFile(manifest, JSON.stringify(json));
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_FORWARD115_MANIFEST") });
      // V-41: a manifest still chained on 0112 (Revision 14's previous) skips dev's 0113 and 0114 and is refused.
      json.verifier.path = JSON.parse(manifestBytes).verifier.path;
      json.previous.name = "0112_auth_db_batch.sql";
      await writeFile(manifest, JSON.stringify(json));
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_FORWARD115_MANIFEST") });
      await writeFile(manifest, manifestBytes);
      const extra = join(root, "migrations/0199_undeclared_probe.sql");
      await writeFile(extra, "SELECT 1;\n");
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_LINEAGE_REFUSED SOURCE_INVENTORY") });
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 180_000);
});
