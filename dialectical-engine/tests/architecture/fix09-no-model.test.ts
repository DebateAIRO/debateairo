import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import {
  createDaemon,
  type ClientFactory,
} from "../../tools/obs-listener/src/daemon/main.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

vi.mock("@debateai/kernel", async () => import("../../packages/kernel/src/index.js"));
vi.mock("@debateai/crypto", async () => import("../../packages/crypto/src/index.js"));
vi.mock("@debateai/db", async () => import("../../packages/db/src/index.js"));
vi.mock("@debateai/register", async () => import("../../packages/register/src/index.js"));

const ROOT = process.cwd();
const DAEMON_ROOT = resolve(ROOT, "tools/obs-listener/src/daemon");
const WRITER_PASSWORD = "fix09-c3-writer-test";
const LISTENER_PASSWORD = "fix09-c3-listener-test";
let database: TestDatabase;

function roleUrl(role: string, password: string): string {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return url.toString();
}

function realClientFactory(): ClientFactory {
  return (databaseUrl) => new pg.Client({ connectionString: databaseUrl });
}

function daemonResolveTrace(): readonly Readonly<{ specifier: string; url: string }>[] {
  const scratch = mkdtempSync(join(tmpdir(), "fix09-c3-resolve-"));
  const loaderPath = join(scratch, "daemon-resolve-loader.mjs");
  const tracePath = join(scratch, "daemon-resolve-trace.ndjson");
  const entryUrl = pathToFileURL(resolve(DAEMON_ROOT, "main.ts")).href;
  writeFileSync(loaderPath, `
import { appendFileSync } from "node:fs";
const entryUrl = ${JSON.stringify(entryUrl)};
const reached = new Set();
export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  if (resolved.url === entryUrl || (context.parentURL && reached.has(context.parentURL))) {
    reached.add(resolved.url);
    appendFileSync(${JSON.stringify(tracePath)}, JSON.stringify({ specifier, url: resolved.url }) + "\\n");
  }
  return resolved;
}
`, "utf8");
  const result = spawnSync(process.execPath, [
    "--import",
    "tsx",
    "--experimental-loader",
    pathToFileURL(loaderPath).href,
    "--input-type=module",
    "--eval",
    `await import(${JSON.stringify(entryUrl)});`,
  ], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
    timeout: 10_000,
  });
  try {
    expect(
      result.status,
      `stdout=${result.stdout}\nstderr=${result.stderr}`,
    ).toBe(0);
    const trace = readFileSync(tracePath, "utf8").trim();
    return trace.length === 0
      ? []
      : trace.split("\n").map((line) => JSON.parse(line) as { specifier: string; url: string });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function daemonSources(): string {
  return readdirSync(DAEMON_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => readFileSync(resolve(DAEMON_ROOT, entry.name), "utf8"))
    .join("\n");
}

beforeAll(async () => {
  database = await startTestDatabase();
  await database.pool.query(
    "SELECT set_config('debateai.obs_writer_password', $1, false)",
    [WRITER_PASSWORD],
  );
  await database.pool.query(
    "SELECT set_config('debateai.obs_listener_password', $1, false)",
    [LISTENER_PASSWORD],
  );
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("FIX-09 C3 zero-model daemon", () => {
  it("loads main through a real resolve trace with no model, CLI, provider, child-process, or db-package edge", () => {
    const trace = daemonResolveTrace();
    expect(trace.map((entry) => entry.url)).toEqual(expect.arrayContaining([
      expect.stringContaining("/tools/obs-listener/src/daemon/main.ts"),
      expect.stringContaining("/tools/obs-listener/src/daemon/fold.ts"),
      expect.stringContaining("/tools/obs-listener/src/daemon/tier-gate.ts"),
    ]));
    const graphText = JSON.stringify(trace).toLowerCase();
    expect(graphText).not.toMatch(/node:child_process|@debateai\/db|@debateai\/providers|packages\/providers|codex|claude|grok/u);

    const source = daemonSources();
    expect(source).not.toMatch(/from\s+["'](?:node:child_process|@debateai\/db|@debateai\/providers)(?:\/[^"']*)?["']/u);
    expect(source).not.toMatch(/\b(?:spawn|spawnSync|exec|execFile|fork)\s*\(/u);
  });

  it("runs the real daemon, persists its closed policy result, and writes zero budget rows", async () => {
    const daemon = createDaemon({
      databaseUrl: roleUrl("debateai_obs_listener", LISTENER_PASSWORD),
      pollIntervalMs: 40,
      consumer: "fixagent-daemon",
    }, realClientFactory());
    await daemon.start();
    const occurrenceId = randomUUID();
    try {
      await database.pool.query(`
        INSERT INTO obs.occurrence (
          occurrence_id, occurred_at, environment, build_ref, build_dirty, runtime,
          component, capture_point, code, taxonomy_class, severity, disposition,
          fingerprint, fingerprint_version, redaction_policy_version, allowlist_set_id,
          capture_status, run_ref, work_item_ref, node_ref, attempt_ref, ledger_ref,
          parent_occurrence_ref, at_seq_watermark, frames, safe_template_id, source,
          source_event_ref, zone_context, writer_identity
        ) VALUES (
          $1, now(), 'test', 'build:fix09-c3', false, 'listener',
          '{"process":"listener","package":"@debateai/listener"}'::jsonb,
          'self', 'CAPTURE_SELF_TEST', 'CAPTURE_SELF', 'INFO', 'RECORDED',
          $2, 1, 'redaction:test', 'allowlist:test', 'PERSISTED',
          'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NOT_APPLICABLE',
          'NOT_APPLICABLE', 'NO_CAUSE', 'NOT_APPLICABLE', '[]'::jsonb,
          'tpl.CAPTURE_SELF_TEST', 'first_party', $3, false, 'writer:test'
        )
      `, [occurrenceId, `fix09:c3:${occurrenceId}`, `fix09:c3:event:${occurrenceId}`]);

      await vi.waitFor(async () => {
        const result = await database.pool.query<{ count: number }>(`
          SELECT count(*)::int AS count FROM obs.policy_decision WHERE occurrence_id=$1
        `, [occurrenceId]);
        expect(result.rows).toEqual([{ count: 1 }]);
      }, { timeout: 2_000 });

      const decisions = await database.pool.query<{
        policy_ref: string;
        input_hash: string;
        decision: string;
      }>(`
        SELECT policy_ref,input_hash,decision
        FROM obs.policy_decision WHERE occurrence_id=$1
      `, [occurrenceId]);
      expect(decisions.rows).toEqual([{
        policy_ref: "fixagent-policy-v1",
        input_hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
        decision: "ESCALATE|FLOOR_DENIED",
      }]);
      expect((await database.pool.query(
        "SELECT count(*)::int AS count FROM obs.budget_usage",
      )).rows).toEqual([{ count: 0 }]);
    } finally {
      await daemon.stop();
    }
  });
});
