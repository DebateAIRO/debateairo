// diag-privs.ts — orchestrator diagnostic (read-only): what the API's role debateai_dev_runtime may read of the three relations
// readDeployment() queries (apps/api/src/index.ts), then the same SELECTs run under SET ROLE to reproduce the exact SQLSTATE.
import { readFileSync } from "node:fs"; import pg from "pg";
const url = /LOCAL_MIGRATOR_DATABASE_URL =\s*"([^"]+)"/u.exec(readFileSync(`${process.cwd()}/apps/runner/src/dev-auth-data-plane.ts`, "utf8"))?.[1]!;
const p = new pg.Pool({ connectionString: url, max: 1 }); const role = "debateai_dev_runtime";
try {
  const m = await p.query(`SELECT r.rolname AS member_of FROM pg_auth_members am JOIN pg_roles r ON r.oid = am.roleid JOIN pg_roles u ON u.oid = am.member WHERE u.rolname = $1`, [role]);
  console.log(`${role} member of:`, m.rows.map((r) => r.member_of).join(", ") || "(none)");
  for (const s of ["register", "scorecard", "identity", "core"]) { const r = await p.query(`SELECT has_schema_privilege($1, $2, 'USAGE') AS ok`, [role, s]); console.log(`  schema ${s} USAGE:`, r.rows[0].ok); }
  for (const t of ["register.register_row", "register.register_version", "scorecard.scorecard_cell", "scorecard.session_assignment", "identity.run_execution_binding"]) {
    const r = await p.query(`SELECT has_table_privilege($1, $2, 'SELECT') AS ok`, [role, t]); console.log(`  table ${t} SELECT:`, r.rows[0].ok);
  }
  const c = await p.connect();
  try {
    await c.query(`SET ROLE ${role}`);
    for (const [name, sql] of [
      ["register_row v10", `SELECT row_key FROM register.register_row WHERE register_version = 10 LIMIT 1`],
      ["scorecard_cell", `SELECT 1 FROM scorecard.scorecard_cell LIMIT 1`],
      ["session_assignment", `SELECT 1 FROM scorecard.session_assignment LIMIT 1`],
      ["run_execution_binding", `SELECT 1 FROM identity.run_execution_binding LIMIT 1`],
    ] as const) {
      try { const r = await c.query(sql); console.log(`  AS ${role}: ${name} → ok (${r.rowCount} row)`); }
      catch (e: any) { console.log(`  AS ${role}: ${name} → ${e.code} ${String(e.message).slice(0, 120)}`); }
    }
    await c.query(`RESET ROLE`);
  } finally { c.release(); }
} finally { await p.end(); }
