import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { createHttpPorts, runHsS01, type HsS01Ports } from "./hs-s01-accept.js";

let pool: Pool | undefined;
let client: PoolClient | undefined;

// Creation is inert: argument errors and missing credentials never read custody or connect.
async function database(): Promise<PoolClient> {
  if (client) return client;
  const [{ resolveDevCustodyRoot }, { readDevelopmentComposeSecret }, { developmentMigratorDatabaseUrl }, pg] = await Promise.all([
    import("../deploy/dev-auth/custody-root.mjs"),
    import("../deploy/dev-auth/compose-secrets.mjs"),
    import("../apps/runner/src/dev-auth-data-plane.js"),
    import("pg")
  ]);
  const custodyRoot = resolveDevCustodyRoot(process.cwd());
  const password = await readDevelopmentComposeSecret(custodyRoot, "POSTGRES_SUPERUSER_PASSWORD");
  pool = new pg.default.Pool({ connectionString: developmentMigratorDatabaseUrl(password), max: 1 });
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");
  return client;
}

async function query<T extends QueryResultRow>(sql: string, values: string[] = []): Promise<T[]> {
  try {
    return (await (await database()).query<T>(sql, values)).rows;
  } catch {
    // Driver errors may include connection strings or SQL details; only a fixed code escapes.
    throw new TypeError("HS_S01_DATABASE_READ_FAILED");
  }
}

// The HTTP ports live in the core so a test can drive them against each route's real wire shape.
const ports: HsS01Ports = {
  ...createHttpPorts({ fetch: (input, init) => fetch(input, init), env: process.env, origin: "https://localhost:3000", sleep: delay }),
  async readWorkItemReasons(runRef) {
    return (await query<{ terminal_reason: string | null }>("SELECT terminal_reason FROM core.work_item WHERE run_id = $1", [runRef])).map(row => row.terminal_reason);
  },
  async readJudgeLegRows(runRef) {
    const rows = await query<{ call_site_key: string; sequence: number; raw_artifact_ref: string | null; parse_status: string | null }>(
      "SELECT entry.call_site_key, entry.sequence, entry.raw_artifact_ref::text AS raw_artifact_ref, artifact.parse_status FROM ledger.ledger_entry AS entry LEFT JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = entry.raw_artifact_ref WHERE entry.run_id = $1 AND entry.action_kind = 'MODEL_CALL' AND entry.call_site_key ~ '^JUDGE(:|$)' ORDER BY entry.sequence", [runRef]);
    return rows.map(row => ({ callSiteKey: row.call_site_key, sequence: Number(row.sequence), rawArtifactRef: row.raw_artifact_ref, parseStatus: row.parse_status }));
  },
  async readNodeProvenance(runRef) {
    return (await query<{ node_id: string; provenance_ref: string }>("SELECT node_id::text, provenance_ref::text FROM core.node WHERE run_id = $1", [runRef]))
      .map(row => ({ nodeId: row.node_id, provenanceRef: row.provenance_ref }));
  },
  async readCensus() {
    const rows = await query<{ register_version: string; row_count: number; actual_rows: number; sealed: boolean }>(
      "SELECT version.register_version::text AS register_version, version.row_count, count(row.row_key)::int AS actual_rows, version.sealed FROM register.register_version AS version LEFT JOIN register.register_row AS row USING (register_version) GROUP BY version.register_version, version.row_count, version.sealed ORDER BY version.register_version");
    return rows.map(row => ({ registerVersion: row.register_version, rowCount: Number(row.row_count), actualRows: Number(row.actual_rows), sealed: row.sealed }));
  },
  async readReceiptVersion() {
    const { readDevelopmentDeploymentRegisterReceipt } = await import("../apps/runner/src/dev-deployment-register.js");
    try { return (await readDevelopmentDeploymentRegisterReceipt(process.cwd())).registerVersion; }
    catch (error) {
      if (error instanceof TypeError && error.message === "DEV_DEPLOYMENT_REGISTER_RECEIPT_REQUIRED") return null;
      throw new TypeError("HS_S01_RECEIPT_READ_FAILED");
    }
  },
  async readText(absolutePath) { return readFile(absolutePath, "utf8"); }
};

try {
  const { lines, exitCode } = await runHsS01(process.argv.slice(2), ports);
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
} finally {
  try { if (client) await client.query("ROLLBACK"); }
  finally { client?.release(); await pool?.end(); }
}
