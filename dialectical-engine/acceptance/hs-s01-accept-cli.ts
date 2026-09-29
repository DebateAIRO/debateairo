import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { AskAcceptedSchema, AskRequestSchema } from "@debateai/contract";
import { decodeBase32, TOTP_PROFILE, totpCodeAtStep } from "@debateai/crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { runHsS01, type HsS01Ports } from "./hs-s01-accept.js";

const origin = "https://localhost:3000";
const base = `${origin}/api`;
const cookies = new Map<string, string>();
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

async function request(path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { origin };
  if (cookies.size > 0) headers.cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    headers["x-csrf-token"] = cookies.get("__Host-debateai-csrf") ?? "";
  }
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    throw new TypeError("HS_S01_HTTP_REQUEST_FAILED");
  }
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";", 1)[0]!;
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    if (name === "__Host-debateai-session" || name === "__Host-debateai-csrf") cookies.set(name, pair.slice(separator + 1));
  }
  return response;
}

async function json(response: Response, expected = 200): Promise<unknown> {
  if (response.status !== expected) throw new TypeError(`HS_S01_HTTP_${response.status}`);
  try { return await response.json(); } catch { throw new TypeError("HS_S01_RESPONSE_INVALID"); }
}
const runPath = (runRef: string) => `/v1/runs/${encodeURIComponent(runRef)}`;

const ports: HsS01Ports = {
  async login() {
    const email = process.env.HS_ACCEPT_EMAIL;
    const password = process.env.HS_ACCEPT_PASSWORD;
    const secret = process.env.HS_ACCEPT_TOTP_SECRET;
    if (!email || !password || !secret) throw new TypeError("HS_S01_CREDENTIALS_MISSING");
    const challenge = await json(await request("/v1/auth/login", { email, password }), 202) as { challenge_token?: unknown } | null;
    if (typeof challenge?.challenge_token !== "string") throw new TypeError("HS_S01_LOGIN_CHALLENGE_INVALID");
    const code = totpCodeAtStep(decodeBase32(secret), Math.floor(Date.now() / 1000 / TOTP_PROFILE.periodSeconds));
    await json(await request("/v1/auth/login", { challenge_token: challenge.challenge_token, code }));
    if (!cookies.get("__Host-debateai-session") || !cookies.get("__Host-debateai-csrf")) {
      throw new TypeError("HS_S01_LOGIN_COOKIES_MISSING");
    }
  },
  async ask(questionLine) {
    const body = AskRequestSchema.parse({ question_line: questionLine, plan_tier: "free", risk_tier: "standard",
      tier_source: "MACHINE_DEFAULT", tier_provenance_ref: "machine:plan-tier-free", composition_budget_tier: "low",
      depth_params: { depth: 2 }, decision_scope: "personal", as_of: new Date().toISOString(),
      steering_presets: [], steering_annotations: [] });
    return AskAcceptedSchema.parse(await json(await request("/v1/asks", body), 202)).run_ref;
  },
  async waitForTerminal(runRef) {
    const minutes = Number(process.env.HS_ACCEPT_TIMEOUT_MINUTES ?? "60");
    if (!Number.isFinite(minutes) || minutes <= 0) throw new TypeError("HS_S01_TIMEOUT_INVALID");
    const deadline = Date.now() + minutes * 60_000;
    let run: unknown = null;
    while (Date.now() < deadline) {
      run = await json(await request(runPath(runRef)));
      const state = (run as { state?: unknown } | null)?.state;
      if (state === "SETTLED" || state === "FAILED") return { state, run };
      await delay(Math.min(10_000, Math.max(0, deadline - Date.now())));
    }
    return { state: "TIMEOUT", run };
  },
  async readAnswer(runRef) {
    const response = await request(`${runPath(runRef)}/answer`);
    return response.status === 200 ? json(response) : null;
  },
  async readEvents(runRef) { return json(await request(`${runPath(runRef)}/events`)); },
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
