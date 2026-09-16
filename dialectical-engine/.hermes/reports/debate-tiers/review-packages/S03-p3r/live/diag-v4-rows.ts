// diag-v4-rows.ts — orchestrator diagnostic: READ-ONLY listing of the sealed register version 4 in the dev database
// (row keys, source refs, per-row value sha256, the version row's metadata). Prints no value text and no URL.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
const root = process.cwd();
const source = readFileSync(`${root}/apps/runner/src/dev-auth-data-plane.ts`, "utf8");
const url = /LOCAL_MIGRATOR_DATABASE_URL =\s*"([^"]+)"/u.exec(source)?.[1];
if (url === undefined) { console.error("MIGRATOR_URL_NOT_FOUND"); process.exit(2); }
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const v = await pool.query(`SELECT register_version, row_count, sealed, base_register_version, publication_kind, snapshot_sha256, recorded_at FROM register.register_version ORDER BY register_version`);
  console.log("versions:"); for (const r of v.rows) console.log("  ", JSON.stringify(r));
  const rows = await pool.query(`SELECT row_key, register.canonical_json_text(value_json::text) AS v, source_ref FROM register.register_row WHERE register_version = 4 ORDER BY row_key`);
  console.log(`v4 rows: ${rows.rowCount}`);
  for (const r of rows.rows) console.log(`  ${r.row_key.padEnd(44)} sha=${createHash("sha256").update(r.v).digest("hex").slice(0, 12)} len=${String(r.v.length).padStart(5)} src=${r.source_ref}`);
} finally { await pool.end(); }
