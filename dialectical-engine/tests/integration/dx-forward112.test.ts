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

const EXPORT = "0112_data_export.sql";
const NETOPIA = "0111_billing_netopia.sql";
const ROTATE = "identity.rotate_session_after_step_up(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamp with time zone,uuid,text,text,uuid,timestamp with time zone)";
const rows = async (db: TestDatabase, table: string) => (await db.pool.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
const ledger = (db: TestDatabase) => rows(db, "public.debateai_schema_migration");
const receipts = (db: TestDatabase) => rows(db, "public.debateai_schema_migration_step");

// One database keeps each mutation's restore and replay visible to the next case.
describe("data export forward112", () => {
  let db: TestDatabase;
  beforeAll(async () => { db = await startTestDatabase(); await migrate(db.pool); }, 180_000);
  afterAll(async () => { await db?.stop(); });

  it("G1 applies 0110, NETOPIA 0111 and export 0112 with linked receipts", async () => {
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.map(step => step.name)).toEqual([NETOPIA, EXPORT]);
    const names = (await ledger(db)).map(row => row.name).filter(name => name.startsWith("011"));
    expect(names).toEqual(["0110_account_erasure_public_debates.sql", NETOPIA, EXPORT]);
    const steps = await receipts(db);
    expect(steps.map(step => step.source_name)).toEqual([NETOPIA, EXPORT]);
    expect(steps[1].previous_manifest_sha256).toBe(steps[0].forward_manifest_sha256);
    expect(steps[1].verifier_sha256).toBe(steps[0].verifier_sha256);
    expect((await db.pool.query("SELECT count(*)::int n FROM public.debateai_schema_migration_resolution WHERE logical_name='0093_billing_runtime_role.sql'")).rows[0].n).toBe(0);
  });

  it("G2 replays without changing a ledger row or step receipt", async () => {
    const before = [await ledger(db), await receipts(db)];
    await migrate(db.pool);
    expect([await ledger(db), await receipts(db)]).toEqual(before);
  });

  it("G3 refuses the 0112 SQL against already replaced 0107 bodies without writing", async () => {
    const plan = await loadMigrationPlan();
    const before = [await ledger(db), await receipts(db)];
    await expect(db.pool.query(plan.forwardChain[1]!.sql)).rejects.toMatchObject({ code: "P0001", message: "DATA_EXPORT_0112_REQUIRES_0107_BODIES" });
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

  it("G6 re-seals Auth-106 compatibility after 0112 and still refuses later drift", async () => {
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
    const root = await mkdtemp(join(tmpdir(), "dx-forward112-"));
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
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_FORWARD112_SOURCE_DIGEST") });
      await writeFile(sql, sqlBytes);
      const manifest = join(root, "migrations/lineage/data-export-forward112.json"), manifestBytes = await readFile(manifest, "utf8");
      const json = JSON.parse(manifestBytes);
      json.previous.manifestSha256 = "0".repeat(64);
      await writeFile(manifest, JSON.stringify(json));
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_FORWARD112_MANIFEST") });
      json.previous.manifestSha256 = JSON.parse(manifestBytes).previous.manifestSha256;
      json.verifier.path = "lineage/verify-effective-capabilities-112.sql";
      await writeFile(manifest, JSON.stringify(json));
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_FORWARD112_MANIFEST") });
      await writeFile(manifest, manifestBytes);
      const extra = join(root, "migrations/0113_undeclared_probe.sql");
      await writeFile(extra, "SELECT 1;\n");
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_LINEAGE_REFUSED SOURCE_INVENTORY") });
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 180_000);
});
