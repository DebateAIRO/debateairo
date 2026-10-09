import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { identifyLineage, lineageEvidence, loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { applyForward108 } from "../../packages/db/src/migration-forward108.js";
import { applyForward110 } from "../../packages/db/src/migration-forward110.js";
import { applyForward111 } from "../../packages/db/src/migration-forward111.js";
import { seedInstalledAuth106 } from "../support/auth106.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const NAME = "0111_data_export.sql";
const ROTATE = "identity.rotate_session_after_step_up(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamp with time zone,uuid,text,text,uuid,timestamp with time zone)";
const VALID = "identity.valid_consumer_authorization_internal(jsonb)";
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const ledger = async (db: TestDatabase) => (await db.pool.query("SELECT * FROM public.debateai_schema_migration ORDER BY name")).rows;
const receipt = async (db: TestDatabase) => (await db.pool.query("SELECT * FROM public.debateai_schema_migration_forward111 ORDER BY source_name")).rows;

async function seed110(db: TestDatabase): Promise<void> {
  const plan = await loadMigrationPlan();
  await db.pool.query("CREATE TABLE public.debateai_schema_migration(name text PRIMARY KEY,applied_at timestamptz NOT NULL)");
  for (const name of plan.manifest.order) {
    await db.pool.query(plan.sources.get(name)!.sql);
    await db.pool.query("INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())", [name]);
  }
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(plan.effectiveCapabilityVerifierSql);
    await applyForward108(client, plan, "integrated-original", new Set(plan.manifest.order));
    await applyForward110(client, plan, "integrated-original-108", new Set([...plan.manifest.order, plan.forward108.name]));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

describe("data export forward111", () => {
  let db: TestDatabase;
  beforeAll(async () => { db = await startTestDatabase(); await migrate(db.pool); }, 180_000);
  afterAll(async () => { await db?.stop(); });

  it("F1 applies 0108, 0110 and 0111 once with the 110 manifest byte digest", async () => {
    const plan = await loadMigrationPlan();
    const names = (await db.pool.query("SELECT name FROM public.debateai_schema_migration WHERE name=ANY($1::text[]) ORDER BY name", [[plan.forward108.name, plan.forward110.name, NAME]])).rows.map(row => row.name);
    expect(names).toEqual([plan.forward108.name, plan.forward110.name, NAME].sort());
    expect(await receipt(db)).toHaveLength(1);
    expect((await receipt(db))[0]).toMatchObject({
      source_name: NAME,
      chain_manifest_sha256: sha(await readFile(new URL("../../migrations/lineage/auth-dev-preview-20261006-forward110.json", import.meta.url))),
      compat_prior_postcondition_digest: null,
      compat_postcondition_digest: null
    });
  });

  it("F2 replay changes no ledger or forward receipt", async () => {
    const before = [await ledger(db), await receipt(db)];
    await migrate(db.pool);
    expect([await ledger(db), await receipt(db)]).toEqual(before);
  });

  it("F3 refuses a 111 ledger without 110 and a missing 111 receipt", async () => {
    const row = (await db.pool.query("DELETE FROM public.debateai_schema_migration WHERE name='0110_account_erasure_public_debates.sql' RETURNING *")).rows[0];
    try { await expect(migrate(db.pool)).rejects.toThrow("MIGRATION_LINEAGE_REFUSED UNKNOWN_MIXED_LINEAGE"); }
    finally { await db.pool.query("INSERT INTO public.debateai_schema_migration VALUES($1,$2)", [row.name, row.applied_at]); }
    const old = (await receipt(db))[0];
    await db.pool.query("DELETE FROM public.debateai_schema_migration_forward111");
    try { await expect(migrate(db.pool)).rejects.toThrow("MIGRATION_FORWARD111_RECEIPT_BINDING_DRIFT"); }
    finally { await db.pool.query("INSERT INTO public.debateai_schema_migration_forward111 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", Object.values(old)); }
  });

  it("F4 distinguishes changed function body from receipt postcondition drift", async () => {
    const definition = (await db.pool.query<{ def: string }>("SELECT pg_get_functiondef(to_regprocedure($1)) def", [ROTATE])).rows[0]!.def;
    await db.pool.query(definition.replace("BEGIN", "BEGIN\n -- forward111 drift probe"));
    try { await expect(migrate(db.pool)).rejects.toThrow("MIGRATION_FORWARD111_FUNCTION_DRIFT"); }
    finally { await db.pool.query(definition); }
    await migrate(db.pool);
    const original = (await receipt(db))[0].postcondition_evidence_digest as string;
    await db.pool.query("UPDATE public.debateai_schema_migration_forward111 SET postcondition_evidence_digest=repeat('0',64)");
    try { await expect(migrate(db.pool)).rejects.toThrow("MIGRATION_FORWARD111_POSTCONDITION_DRIFT"); }
    finally { await db.pool.query("UPDATE public.debateai_schema_migration_forward111 SET postcondition_evidence_digest=$1", [original]); }
    await migrate(db.pool);
  });

  it("F5 checks the pinned 110 receipt inside applyForward111", async () => {
    const plan = await loadMigrationPlan();
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      const applied = (await client.query<{ name: string }>("SELECT name FROM public.debateai_schema_migration ORDER BY name")).rows.map(row => row.name);
      const resolved = (await client.query<{ logical_name: string }>("SELECT logical_name FROM public.debateai_schema_migration_resolution ORDER BY logical_name")).rows.map(row => row.logical_name);
      await client.query("UPDATE public.debateai_schema_migration_forward110 SET forward_manifest_sha256=repeat('0',64)");
      await expect(applyForward111(client, plan, identifyLineage(plan, applied, resolved), new Set([...applied, ...resolved]))).rejects.toThrow("MIGRATION_FORWARD111_CHAIN_BINDING_DRIFT");
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("F6 keeps the 111 receipt owner-only", async () => {
    const grants = await db.pool.query("SELECT count(*)::int n FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.debateai_schema_migration_forward111'::regclass AND a.grantee<>c.relowner");
    expect(grants.rows[0].n).toBe(0);
    expect((await db.pool.query("SELECT has_table_privilege('debateai_authorization_runtime','public.debateai_schema_migration_forward111','SELECT') readable")).rows[0].readable).toBe(false);
  });

  it("F7 applies to a 110 database and refuses drifted prior function without writing", async () => {
    const old = await startTestDatabase();
    try {
      await seed110(old);
      const definition = (await old.pool.query<{ def: string }>("SELECT pg_get_functiondef(to_regprocedure($1)) def", [VALID])).rows[0]!.def;
      await old.pool.query(definition.replace("SELECT COALESCE", "SELECT /* prior drift */ COALESCE"));
      const before = await ledger(old);
      await expect(migrate(old.pool)).rejects.toThrow("MIGRATION_FORWARD111_FUNCTION_DRIFT");
      expect(await ledger(old)).toEqual(before);
      expect((await old.pool.query("SELECT to_regclass('public.debateai_schema_migration_forward111') value")).rows[0].value).toBeNull();
      await old.pool.query(definition);
      await migrate(old.pool);
      expect(await receipt(old)).toHaveLength(1);
    } finally { await old.stop(); }
  }, 180_000);

  it("F8 refuses undeclared source and changed source, body or chain manifest in a bounded copy", async () => {
    const root = await mkdtemp(join(tmpdir(), "dx-forward111-"));
    try {
      await mkdir(join(root, "packages/db/src"), { recursive: true });
      for (const name of ["migration-lineage.ts", "migration-forward108.ts", "migration-forward110.ts", "migration-forward111.ts"]) await cp(new URL(`../../packages/db/src/${name}`, import.meta.url), join(root, "packages/db/src", name));
      await cp(new URL("../../migrations", import.meta.url), join(root, "migrations"), { recursive: true });
      const script = join(root, "probe.mts");
      await writeFile(script, "import {loadMigrationPlan} from './packages/db/src/migration-lineage.ts'; await loadMigrationPlan();");
      const run = () => promisify(execFile)(process.execPath, ["--import", "tsx", script], { cwd: process.cwd(), timeout: 30_000, maxBuffer: 100_000 });
      await run();
      const extra = join(root, "migrations/0112_undeclared_probe.sql");
      await writeFile(extra, "SELECT 1;\n");
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_LINEAGE_REFUSED SOURCE_INVENTORY") });
      await rm(extra);
      const sql = join(root, `migrations/${NAME}`), original = await readFile(sql, "utf8");
      await writeFile(sql, original + "\nSELECT 1;\n");
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_FORWARD111_SOURCE_DIGEST") });
      await writeFile(sql, original);
      const path = join(root, "migrations/lineage/auth-dev-preview-20261006-forward111.json"), json = await readFile(path, "utf8");
      const originalBody = JSON.parse(json).functions.find((entry: { originalBodySha256: string | null }) => entry.originalBodySha256 !== null).originalBodySha256 as string;
      await writeFile(path, json.replace(originalBody, "0".repeat(64)));
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_FORWARD111_BODY_DIGEST") });
      await writeFile(path, json.replace('"chainManifestSha256": "', '"chainManifestSha256": "0'));
      await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("MIGRATION_FORWARD111_MANIFEST") });
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 120_000);

  it("F9 updates and binds the integrated-compatibility resolution evidence", async () => {
    const compatible = await startTestDatabase();
    try {
      await seedInstalledAuth106(compatible.pool);
      await migrate(compatible.pool);
      const resolution = (await compatible.pool.query("SELECT postcondition_evidence_digest FROM public.debateai_schema_migration_resolution WHERE logical_name='0093_billing_runtime_role.sql'")).rows[0];
      const forward = (await receipt(compatible))[0];
      expect(resolution.postcondition_evidence_digest).toBe(await compatible.pool.connect().then(async client => { try { return await lineageEvidence(client); } finally { client.release(); } }));
      expect(forward.compat_postcondition_digest).toBe(resolution.postcondition_evidence_digest);
      expect(forward.compat_prior_postcondition_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(forward.compat_prior_postcondition_digest).not.toBe(forward.compat_postcondition_digest);
      await migrate(compatible.pool);
      expect((await receipt(compatible))[0]).toEqual(forward);
      await compatible.pool.query("UPDATE public.debateai_schema_migration_forward111 SET compat_postcondition_digest=repeat('0',64)");
      try { await expect(migrate(compatible.pool)).rejects.toThrow("MIGRATION_FORWARD111_RECEIPT_BINDING_DRIFT"); }
      finally { await compatible.pool.query("UPDATE public.debateai_schema_migration_forward111 SET compat_postcondition_digest=$1", [forward.compat_postcondition_digest]); }
    } finally { await compatible.stop(); }
  }, 180_000);
});
