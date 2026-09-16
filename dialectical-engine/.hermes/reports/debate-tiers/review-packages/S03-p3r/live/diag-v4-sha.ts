import { readFileSync } from "node:fs"; import pg from "pg";
const url = /LOCAL_MIGRATOR_DATABASE_URL =\s*"([^"]+)"/u.exec(readFileSync(`${process.cwd()}/apps/runner/src/dev-auth-data-plane.ts`, "utf8"))?.[1]!;
const pool = new pg.Pool({ connectionString: url, max: 1 });
try { for (const v of [4, 5, 9]) console.log(`v${v} snapshot=${(await pool.query(`SELECT register._snapshot_sha256($1) AS s`, [v])).rows[0].s}`); } finally { await pool.end(); }
