// REV-MERGE-DEV charge 3 — independent re-derivation of the two migration apply orders.
// Written against merge head df06aedf. Root from $WORKTREE or argv[2].
// Order A: fresh migrate() over the merged migrations directory (sorted-name interleave).
// Order B: apply every migration EXCEPT dev's 11 by executing the files directly (no ledger
//          faking), then call the product migrate() so the 11 dev files land LAST.
// Comparison: (1) pg_dump --schema-only text diff, (2) an independent catalogue query set.
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";

const ROOT = process.env.WORKTREE ?? process.argv[2];
if (!ROOT) throw new Error("set WORKTREE=<repo root> or pass it as argv[2]");

const db = await import(`${ROOT}/packages/db/src/index.js`);
const support = await import(`${ROOT}/tests/support/testDatabase.js`);

const DEV_ONLY = [
  "0050_t16_algorithm_register_rows.sql",
  "0051_t8_remove_strict_and.sql",
  "0052_t5_reviewer_measured_edges.sql",
  "0053_t06_review_outcome_disclosure.sql",
  "0054_tint1_reject_edge_mutation_public_revoke.sql",
  "0055_t10_served_root_selection.sql",
  "0057_t09_synthesis_round.sql",
  "0061_algorithm_publication_profiles.sql",
  "0062_obs_view_owner_column_floor.sql",
  "0063_serve_answer_content_carrier.sql",
  "0064_synthesis_role_cost_rows.sql"
];

const MIGRATIONS_DIR = `${ROOT}/migrations`;

// --- my own catalogue queries (deliberately not the author's set) --------------
const Q: Record<string, string> = {
  functions: `SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig,
                     pg_get_function_result(p.oid) AS result, p.prosecdef, p.provolatile,
                     pg_get_userbyid(p.proowner) AS owner, coalesce(p.proacl::text,'<default>') AS acl,
                     coalesce(p.proconfig::text,'') AS cfg, md5(p.prosrc) AS body_md5
              FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'
              ORDER BY 1`,
  tables: `SELECT table_schema||'.'||table_name||'.'||column_name AS col, data_type, is_nullable,
                  coalesce(column_default,'') AS dflt, coalesce(character_maximum_length::text,'') AS len,
                  ordinal_position
           FROM information_schema.columns
           WHERE table_schema NOT IN ('pg_catalog','information_schema')
           ORDER BY 1`,
  relations: `SELECT n.nspname||'.'||c.relname AS rel, c.relkind, pg_get_userbyid(c.relowner) AS owner,
                     c.relrowsecurity, c.relforcerowsecurity, coalesce(c.relacl::text,'<default>') AS acl
              FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'
                AND c.relkind IN ('r','p','v','m','S','f','i')
              ORDER BY 1`,
  views: `SELECT n.nspname||'.'||c.relname AS rel, pg_get_viewdef(c.oid, true) AS def
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE c.relkind IN ('v','m') AND n.nspname NOT IN ('pg_catalog','information_schema')
          ORDER BY 1`,
  triggers: `SELECT n.nspname||'.'||c.relname||'.'||t.tgname AS trg, pg_get_triggerdef(t.oid,true) AS def,
                    t.tgenabled
             FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog','information_schema')
             ORDER BY 1`,
  constraints: `SELECT n.nspname||'.'||c.relname||'.'||x.conname AS con, x.contype,
                       pg_get_constraintdef(x.oid,true) AS def, x.convalidated
                FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1`,
  indexes: `SELECT schemaname||'.'||indexname AS idx, indexdef FROM pg_indexes
            WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1`,
  policies: `SELECT schemaname||'.'||tablename||'.'||policyname AS pol, permissive, roles::text, cmd,
                    coalesce(qual,'') AS qual, coalesce(with_check,'') AS wc
             FROM pg_policies WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1`,
  tableGrants: `SELECT grantee||'|'||table_schema||'.'||table_name||'|'||privilege_type||'|'||is_grantable AS g
                FROM information_schema.role_table_grants
                WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1`,
  columnGrants: `SELECT grantee||'|'||table_schema||'.'||table_name||'.'||column_name||'|'||privilege_type AS g
                 FROM information_schema.column_privileges
                 WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1`,
  routineGrants: `SELECT grantee||'|'||specific_schema||'.'||routine_name||'|'||privilege_type AS g
                  FROM information_schema.role_routine_grants
                  WHERE specific_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1`,
  usageGrants: `SELECT grantee||'|'||object_schema||'.'||object_name||'|'||object_type||'|'||privilege_type AS g
                FROM information_schema.usage_privileges
                WHERE object_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1`,
  schemas: `SELECT n.nspname, pg_get_userbyid(n.nspowner) AS owner, coalesce(n.nspacl::text,'<default>') AS acl
            FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
            ORDER BY 1`,
  types: `SELECT n.nspname||'.'||t.typname AS ty, t.typtype,
                 coalesce((SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),'') AS labels,
                 coalesce(t.typacl::text,'<default>') AS acl
          FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
          WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
            AND (t.typtype IN ('d','e') OR (t.typtype='c' AND t.typrelid=0)) ORDER BY 1`,
  roles: `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls,
                 coalesce(rolconfig::text,'') AS cfg
          FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%' ORDER BY 1`,
  roleMembers: `SELECT p.rolname||' <- '||c.rolname AS m, x.admin_option
                FROM pg_auth_members x JOIN pg_roles p ON p.oid=x.roleid JOIN pg_roles c ON c.oid=x.member
                WHERE p.rolname NOT LIKE 'pg\\_%' ORDER BY 1`,
  defaultAcl: `SELECT coalesce(n.nspname,'-')||'|'||pg_get_userbyid(d.defaclrole)||'|'||d.defaclobjtype::text AS k,
                      coalesce(d.defaclacl::text,'') AS acl
               FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY 1`,
  ledger: `SELECT name FROM public.debateai_schema_migration ORDER BY 1`
};

async function snap(pool: any) {
  const out: Record<string, unknown[]> = {};
  for (const [k, q] of Object.entries(Q)) out[k] = (await pool.query(q)).rows;
  return out;
}

// The embedded-postgres package ships initdb/pg_ctl/postgres only — no pg_dump — so the
// catalogue query set above IS the comparison; it is dumped to disk for eyeballing.
async function dumpSnapshot(s: Record<string, unknown[]>, out: string) {
  await writeFile(out, JSON.stringify(s, null, 1), "utf8");
}

async function applyDirect(pool: any, files: string[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE IF NOT EXISTS public.debateai_schema_migration (
      name text PRIMARY KEY CHECK (length(btrim(name)) > 0), applied_at timestamptz NOT NULL)`);
    for (const name of files) {
      await client.query(await readFile(`${MIGRATIONS_DIR}/${name}`, "utf8"));
      await client.query(
        "INSERT INTO public.debateai_schema_migration (name, applied_at) VALUES ($1, statement_timestamp())",
        [name]
      );
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}

const all = (await readdir(MIGRATIONS_DIR)).filter((n) => /^\d+.*\.sql$/.test(n)).sort();
const oursOnly = all.filter((n) => !DEV_ONLY.includes(n));
console.info(`MERGED_MIGRATION_FILES=${all.length}`);
console.info(`DEV_ONLY_HELD_OUT=${DEV_ONLY.filter((n) => all.includes(n)).length}/${DEV_ONLY.length}`);
console.info(`ORDER_B_PASS1_FILES=${oursOnly.length}`);

const SCRATCH = process.env.SCRATCH ?? "/tmp";
let a: any, b: any;
try {
  a = await support.startTestDatabase();
  await db.migrate(a.pool);
  const snapA = await snap(a.pool);
  await dumpSnapshot(snapA, `${SCRATCH}/catalogue-order-a.json`);

  b = await support.startTestDatabase();
  await applyDirect(b.pool, oursOnly);
  const midCount = (await b.pool.query("SELECT count(*)::int c FROM public.debateai_schema_migration")).rows[0].c;
  await db.migrate(b.pool);
  const snapB = await snap(b.pool);
  await dumpSnapshot(snapB, `${SCRATCH}/catalogue-order-b.json`);

  console.info(`ORDER_B_AFTER_PASS1=${midCount}`);
  console.info(`ORDER_A_APPLIED=${(snapA.ledger as any[]).length}`);
  console.info(`ORDER_B_APPLIED=${(snapB.ledger as any[]).length}`);

  const diffs: string[] = [];
  for (const k of Object.keys(Q)) {
    if (k === "ledger") continue;
    const sa = JSON.stringify(snapA[k]); const sb = JSON.stringify(snapB[k]);
    if (sa !== sb) {
      diffs.push(k);
      const A = new Set((snapA[k] as any[]).map((r) => JSON.stringify(r)));
      const B = new Set((snapB[k] as any[]).map((r) => JSON.stringify(r)));
      for (const r of A) if (!B.has(r)) console.error(`DIFF ${k} ONLY_IN_A ${r}`);
      for (const r of B) if (!A.has(r)) console.error(`DIFF ${k} ONLY_IN_B ${r}`);
    }
  }
  console.info(`ORDER_A_CATALOGUE_SHA256=${createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(snapA).filter(([k]) => k !== "ledger")))).digest("hex")}`);
  console.info(`ORDER_B_CATALOGUE_SHA256=${createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(snapB).filter(([k]) => k !== "ledger")))).digest("hex")}`);
  console.info(`CATALOGUE_DIFF_SECTIONS=${diffs.length}${diffs.length ? " -> " + diffs.join(",") : ""}`);
  console.info(`REV_MIGRATION_ORDER_CONVERGENCE=${diffs.length === 0 ? "PASS" : "FAIL"}`);
  if (diffs.length !== 0) process.exitCode = 1;
} finally {
  await b?.stop(); await a?.stop();
}
