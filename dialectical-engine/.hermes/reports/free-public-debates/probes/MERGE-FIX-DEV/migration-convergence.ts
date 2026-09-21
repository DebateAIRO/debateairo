import { createHash } from "node:crypto";
import { inspect } from "node:util";
import {
  migrate,
  type Pool
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/merge-dev-0921/dialectical-engine/packages/db/src/index.js";
import {
  startTestDatabase,
  type TestDatabase
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/merge-dev-0921/dialectical-engine/tests/support/testDatabase.js";
import { DEV_ONLY_MIGRATIONS, migrateOrderB } from "./migrate-order-b.js";

const CATALOGUE_QUERIES = Object.freeze({
  schemas: `
    SELECT n.nspname AS schema_name,
           pg_get_userbyid(n.nspowner) AS owner,
           coalesce(n.nspacl::text, '') AS acl
    FROM pg_namespace n
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
    ORDER BY 1`,
  relations: `
    SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind,
           pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity, c.relforcerowsecurity,
           coalesce(c.relacl::text, '') AS acl,
           CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid, true) ELSE '' END AS view_definition
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r','p','v','m','S','f')
    ORDER BY 1,2`,
  columns: `
    SELECT n.nspname AS schema_name, c.relname AS relation_name, a.attnum,
           a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,
           a.attnotnull, a.attidentity, a.attgenerated,
           coalesce(pg_get_expr(d.adbin,d.adrelid), '') AS default_expression,
           coalesce(a.attacl::text, '') AS acl
    FROM pg_attribute a
    JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND a.attnum > 0 AND NOT a.attisdropped
      AND c.relkind IN ('r','p','v','m','f')
    ORDER BY 1,2,3`,
  constraints: `
    SELECT n.nspname AS schema_name, c.relname AS relation_name, x.conname,
           x.contype, pg_get_constraintdef(x.oid, true) AS definition
    FROM pg_constraint x
    JOIN pg_class c ON c.oid=x.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
    ORDER BY 1,2,3`,
  indexes: `
    SELECT n.nspname AS schema_name, c.relname AS relation_name, i.relname AS index_name,
           pg_get_indexdef(i.oid) AS definition
    FROM pg_index x
    JOIN pg_class c ON c.oid=x.indrelid
    JOIN pg_class i ON i.oid=x.indexrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
    ORDER BY 1,2,3`,
  triggers: `
    SELECT n.nspname AS schema_name, c.relname AS relation_name, t.tgname,
           pg_get_triggerdef(t.oid, true) AS definition
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
    ORDER BY 1,2,3`,
  policies: `
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname !~ '^pg_' AND schemaname <> 'information_schema'
    ORDER BY 1,2,3`,
  functions: `
    SELECT n.nspname AS schema_name, p.proname,
           pg_get_function_identity_arguments(p.oid) AS identity_arguments,
           pg_get_function_result(p.oid) AS result_type,
           l.lanname AS language, p.provolatile, p.prosecdef,
           p.prosrc, coalesce(p.proconfig::text, '') AS config,
           coalesce(p.proacl::text, '') AS acl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
    ORDER BY 1,2,3`,
  types: `
    SELECT n.nspname AS schema_name, t.typname, t.typtype,
           coalesce(pg_get_userbyid(t.typowner), '') AS owner,
           coalesce(t.typacl::text, '') AS acl,
           coalesce(string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder), '') AS enum_values
    FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace
    LEFT JOIN pg_enum e ON e.enumtypid=t.oid
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND (t.typtype IN ('d','e') OR (t.typtype='c' AND t.typrelid=0))
    GROUP BY n.nspname,t.typname,t.typtype,t.typowner,t.typacl::text
    ORDER BY 1,2`,
  defaultPrivileges: `
    SELECT coalesce(n.nspname, '') AS schema_name,
           pg_get_userbyid(d.defaclrole) AS owner, d.defaclobjtype,
           coalesce(d.defaclacl::text, '') AS acl
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
    ORDER BY 1,2,3`,
  roleMemberships: `
    SELECT parent.rolname AS parent_role, child.rolname AS member_role,
           m.admin_option, pg_get_userbyid(m.grantor) AS grantor
    FROM pg_auth_members m
    JOIN pg_roles parent ON parent.oid=m.roleid
    JOIN pg_roles child ON child.oid=m.member
    WHERE parent.rolname LIKE 'debateai_%' OR child.rolname LIKE 'debateai_%'
    ORDER BY 1,2,3,4`
});

async function snapshot(pool: Pool): Promise<Record<string, readonly unknown[]>> {
  const result: Record<string, readonly unknown[]> = {};
  for (const [name, query] of Object.entries(CATALOGUE_QUERIES)) {
    result[name] = (await pool.query(query)).rows;
  }
  return result;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

let orderA: TestDatabase | undefined;
let orderB: TestDatabase | undefined;
try {
  orderA = await startTestDatabase();
  await migrate(orderA.pool);
  const snapshotA = await snapshot(orderA.pool);

  orderB = await startTestDatabase();
  await migrateOrderB(orderB.pool);
  const snapshotB = await snapshot(orderB.pool);

  const differences = Object.keys(CATALOGUE_QUERIES).filter(
    (name) => JSON.stringify(snapshotA[name]) !== JSON.stringify(snapshotB[name])
  );
  console.info(`ORDER_A_MIGRATIONS=${(await orderA.pool.query("SELECT count(*)::int AS count FROM public.debateai_schema_migration")).rows[0]?.count}`);
  console.info(`ORDER_B_MIGRATIONS=${(await orderB.pool.query("SELECT count(*)::int AS count FROM public.debateai_schema_migration")).rows[0]?.count}`);
  console.info(`ORDER_B_HELD_OUT=${DEV_ONLY_MIGRATIONS.length}`);
  console.info(`ORDER_A_CATALOGUE_SHA256=${digest(snapshotA)}`);
  console.info(`ORDER_B_CATALOGUE_SHA256=${digest(snapshotB)}`);
  console.info(`CATALOGUE_DIFF_SECTIONS=${differences.length}`);
  if (differences.length > 0) {
    for (const name of differences) {
      console.error(`DIFF ${name}\nA=${inspect(snapshotA[name], { depth: null })}\nB=${inspect(snapshotB[name], { depth: null })}`);
    }
    process.exitCode = 1;
  } else {
    console.info("MIGRATION_ORDER_CONVERGENCE=PASS");
  }
} finally {
  await orderB?.stop();
  await orderA?.stop();
}
