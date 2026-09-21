// REV-MERGE-DEV charge 3 (second half) — the API's start-up role assertions under BOTH
// migration apply orders, against the real login principals. Written against merge head
// df06aedf. Root from $WORKTREE or argv[2]. Exceeds the author's harness by also running the
// support-attestation assertions of apps/api/src/main.ts:596-598, which the repo's
// fpd-s01-l1-boot-role-assertions.test.ts does not cover.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.env.WORKTREE ?? process.argv[2];
if (!ROOT) throw new Error("set WORKTREE=<repo root> or pass it as argv[2]");

const dbm: any = await import(`${ROOT}/packages/db/src/index.js`);
const support: any = await import(`${ROOT}/tests/support/testDatabase.js`);
const principals: any = await import(`${ROOT}/apps/runner/src/dev-database-principals.js`);

const DEV_ONLY = [
  "0050_t16_algorithm_register_rows.sql", "0051_t8_remove_strict_and.sql",
  "0052_t5_reviewer_measured_edges.sql", "0053_t06_review_outcome_disclosure.sql",
  "0054_tint1_reject_edge_mutation_public_revoke.sql", "0055_t10_served_root_selection.sql",
  "0057_t09_synthesis_round.sql", "0061_algorithm_publication_profiles.sql",
  "0062_obs_view_owner_column_floor.sql", "0063_serve_answer_content_carrier.sql",
  "0064_synthesis_role_cost_rows.sql"
];
const MIGRATIONS_DIR = `${ROOT}/migrations`;
const { readdir } = await import("node:fs/promises");

async function applyDirect(pool: any, files: string[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE IF NOT EXISTS public.debateai_schema_migration (
      name text PRIMARY KEY CHECK (length(btrim(name)) > 0), applied_at timestamptz NOT NULL)`);
    for (const name of files) {
      await client.query(await readFile(`${MIGRATIONS_DIR}/${name}`, "utf8"));
      await client.query("INSERT INTO public.debateai_schema_migration (name, applied_at) VALUES ($1, statement_timestamp())", [name]);
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}

function parseCredentials(source: string): Map<string, string> {
  return new Map(source.trim().split("\n").map((line) => {
    const i = line.indexOf("=");
    if (i < 1) throw new TypeError("CREDENTIAL_LINE_INVALID");
    return [line.slice(0, i), line.slice(i + 1)] as [string, string];
  }));
}

async function runOrder(label: string, orderB: boolean): Promise<number> {
  const database = await support.startTestDatabase();
  const secretRoot = await mkdtemp(join(tmpdir(), `rev-merge-boot-${label}-`));
  const pools: any[] = [];
  let failures = 0;
  try {
    if (orderB) {
      const all = (await readdir(MIGRATIONS_DIR)).filter((n: string) => /^\d+.*\.sql$/.test(n)).sort();
      await applyDirect(database.pool, all.filter((n: string) => !DEV_ONLY.includes(n)));
      await dbm.migrate(database.pool); // dev's 11 land LAST
    } else {
      await dbm.migrate(database.pool);
    }
    const applied = (await database.pool.query("SELECT count(*)::int c FROM public.debateai_schema_migration")).rows[0].c;
    const credentialFilePath = join(secretRoot, "database-principals.env");
    await principals.provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const c = parseCredentials(await readFile(credentialFilePath, "utf8"));
    const mk = (key: string) => {
      const url = c.get(key);
      if (url === undefined) throw new TypeError(`CREDENTIAL_MISSING:${key}`);
      const p = dbm.createPool(url, { max: 1 });
      pools.push(p);
      return p;
    };
    const runtimePool = mk("DATABASE_URL");
    const authorizationPool = mk("AUTHORIZATION_DATABASE_URL");
    const publicationCleanupPool = mk("PUBLICATION_CLEANUP_DATABASE_URL");
    const contentProvisionPool = mk("CONTENT_PROVISION_DATABASE_URL");
    const serverAskAdmissionPool = mk("CONTENT_PROVISION_DATABASE_URL");
    const legacyAskAdmissionPool = mk("DATABASE_URL");
    const erasurePool = mk("ERASURE_DATABASE_URL");
    const supportPool = mk("SUPPORT_DATABASE_URL");

    const checks: Array<[string, () => Promise<unknown>]> = [
      ["assertAccountErasureDatabaseRole(runtime,erasure)", () => dbm.assertAccountErasureDatabaseRole(runtimePool, erasurePool)],
      ["assertAccountErasureDatabaseRole(legacyAsk,erasure)", () => dbm.assertAccountErasureDatabaseRole(legacyAskAdmissionPool, erasurePool)],
      ["assertPublicationDatabaseRoleSeparation(runtime,authorization)", () => dbm.assertPublicationDatabaseRoleSeparation(runtimePool, authorizationPool)],
      ["assertPublicationCleanupDatabaseRole(publicationCleanup)", () => dbm.assertPublicationCleanupDatabaseRole(publicationCleanupPool)],
      ["assertContentProvisionDatabaseRole(runtime,contentProvision)", () => dbm.assertContentProvisionDatabaseRole(runtimePool, contentProvisionPool)],
      ["assertContentProvisionDatabaseRole(runtime,serverAskAdmission)", () => dbm.assertContentProvisionDatabaseRole(runtimePool, serverAskAdmissionPool)],
      ["assertSupportDatabaseRole(runtime,support)", () => dbm.assertSupportDatabaseRole(runtimePool, supportPool)],
      ["assertSupportKeyCoverage(support)", () => dbm.assertSupportKeyCoverage(supportPool)]
    ];
    console.info(`ORDER_${label}_APPLIED=${applied}`);
    for (const [name, fn] of checks) {
      try { await fn(); console.info(`ORDER_${label} OK   ${name}`); }
      catch (e: any) { failures += 1; console.error(`ORDER_${label} FAIL ${name} :: ${e?.message ?? e}`); }
    }
    console.info(`ORDER_${label}_CHECKS=${checks.length} FAILURES=${failures}`);
  } finally {
    for (const p of pools) { try { await p.end(); } catch { /* pool already closed */ } }
    await database?.stop();
    await rm(secretRoot, { recursive: true, force: true });
  }
  return failures;
}

const a = await runOrder("A", false);
const b = await runOrder("B", true);
console.info(`REV_BOOT_BOTH_ORDERS=${a === 0 && b === 0 ? "PASS" : "FAIL"} (A failures=${a}, B failures=${b})`);
if (a !== 0 || b !== 0) process.exitCode = 1;
