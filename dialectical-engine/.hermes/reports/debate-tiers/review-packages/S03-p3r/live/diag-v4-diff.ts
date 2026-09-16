// diag-v4-diff.ts — orchestrator diagnostic: the merged code's HISTORICAL v4 row set (the FIX's builder) vs the sealed v4 in the dev
// database, row by row (read-only). Values are printed only for differing rows, redacted for header/token-like fields.
import { createHash } from "node:crypto"; import { readFileSync } from "node:fs"; import pg from "pg";
import { loadBootstrapRegister } from "@debateai/register";
import { buildDevelopmentDeploymentRegisterHistoricalPublicationRows } from "../../apps/runner/src/dev-deployment-register.js";
const url = /LOCAL_MIGRATOR_DATABASE_URL =\s*"([^"]+)"/u.exec(readFileSync(`${process.cwd()}/apps/runner/src/dev-auth-data-plane.ts`, "utf8"))?.[1]!;
const redact = (s: string) => s.replace(/("?(authorization[a-z_]*|access_token|token|secret|api_key)"?\s*:\s*")[^"]*"/giu, '$1<redacted>"').replace(/[A-Za-z0-9._-]{40,}/g, "<masked>");
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const built = await buildDevelopmentDeploymentRegisterHistoricalPublicationRows(await loadBootstrapRegister());
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const db = (await pool.query(`SELECT row_key, register.canonical_json_text(value_json::text) AS v, source_ref FROM register.register_row WHERE register_version = 4`)).rows as { row_key: string; v: string; source_ref: string }[];
  const dbMap = new Map(db.map((r) => [r.row_key, r])); const bMap = new Map(built.map((r) => [r.rowKey, r]));
  console.log(`built rows: ${built.length}  db v4 rows: ${db.length}`);
  for (const k of [...new Set([...dbMap.keys(), ...bMap.keys()])].sort()) {
    const d = dbMap.get(k), b = bMap.get(k);
    if (!d) { console.log(`ONLY-BUILDER ${k}`); continue; } if (!b) { console.log(`ONLY-DB      ${k}`); continue; }
    const vd = d.v === b.valueJsonText, sd = d.source_ref === b.sourceRef;
    if (vd && sd) continue;
    console.log(`DIFF ${k}: value ${vd ? "same" : `DIFFERS (db sha=${sha(d.v)} len=${d.v.length} · built sha=${sha(b.valueJsonText)} len=${b.valueJsonText.length})`} · source_ref ${sd ? "same" : "DIFFERS"}`);
    if (!vd) { console.log(`  db   : ${redact(d.v).slice(0, 700)}`); console.log(`  built: ${redact(b.valueJsonText).slice(0, 700)}`); }
    if (!sd) { console.log(`  db src   : ${d.source_ref}`); console.log(`  built src: ${b.sourceRef}`); }
  }
} finally { await pool.end(); }
