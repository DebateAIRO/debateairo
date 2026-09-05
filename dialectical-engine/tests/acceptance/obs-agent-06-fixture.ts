import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg, { type Pool } from "pg";
import { migrate } from "../../packages/db/src/index.js";
import { ObservationModuleRuntime } from "../../apps/observation-agent/src/core/runtime.js";
import type { ModuleStatusProjection } from "../../apps/observation-agent/src/core/types.js";
import { ObservationJournal } from "../../apps/observation-agent/src/journal/journal.js";
import { createHatchetThroughputModule } from "../../apps/observation-agent/src/modules/hatchet-throughput/module.js";
import { createProviderHealthModule } from "../../apps/observation-agent/src/modules/provider-health/module.js";
import { createThroughputModule } from "../../apps/observation-agent/src/modules/throughput/module.js";
import { persistSignal } from "../../apps/observation-agent/src/store/pipeline.js";
import { PostgresMirror } from "../../apps/observation-agent/src/store/postgres.js";
import { SampleRingStore } from "../../apps/observation-agent/src/store/samples.js";
import {
  toStoredModuleStatusProjection,
  writeStatusSnapshot
} from "../../apps/observation-agent/src/store/status.js";

export const OBS_06_FIXTURE_MODES = Object.freeze(["open-anomalies", "query-budget"] as const);
type FixtureMode = typeof OBS_06_FIXTURE_MODES[number];

export function parseFixtureArguments(args: readonly string[]):
  | Readonly<{ ok: true; mode: FixtureMode; envFile: string }>
  | Readonly<{ ok: false; code: "OBS_ACCEPTANCE_ARGUMENTS_INVALID" }> {
  const mode = args[0];
  if (!OBS_06_FIXTURE_MODES.includes(mode as FixtureMode) || args[1] !== "--env-file"
    || args.length !== 3 || args[2] === undefined || !args[2].startsWith("/")) {
    return Object.freeze({ ok: false, code: "OBS_ACCEPTANCE_ARGUMENTS_INVALID" });
  }
  return Object.freeze({ ok: true, mode: mode as FixtureMode, envFile: args[2] });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function planAcceptanceFixture(input: Readonly<{
  mode: FixtureMode; adminDatabaseUrl: string; nonce: string; stateDir: string;
  targetsPath: string; firstSeq: number; day: string;
}>) {
  const admin = new URL(input.adminDatabaseUrl);
  if (admin.pathname !== "/postgres") throw new TypeError("OBS_ACCEPTANCE_ADMIN_DATABASE_MUST_BE_POSTGRES");
  if (!/^[a-z0-9]+$/u.test(input.nonce)) throw new TypeError("OBS_ACCEPTANCE_NONCE_INVALID");
  const databaseName = `debateai_obs06_${input.nonce}`;
  const databaseUrl = new URL(admin);
  databaseUrl.pathname = `/${databaseName}`;
  const values = {
    OBS_ACCEPTANCE_DATABASE: databaseName,
    OBSERVATION_DATABASE_URL: databaseUrl.toString(),
    OBSERVATION_STATE_DIR: input.stateDir,
    OBSERVATION_TARGETS_PATH: input.targetsPath,
    OBS_ACCEPTANCE_FIRST_SEQ: String(input.firstSeq),
    OBS_ACCEPTANCE_DAY: input.day
  };
  return Object.freeze({ databaseName, databaseUrl: databaseUrl.toString(), stateDir: input.stateDir,
    targetsPath: input.targetsPath, firstSeq: input.firstSeq,
    environmentFile: `${Object.entries(values).map(([key, value]) => `export ${key}=${shellQuote(value)}`).join("\n")}\n` });
}

export async function seedQueryBudget(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO core.run(
      run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,
      risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,depth_params,
      agent_count,stranger_sample_rate,envelope_basis,register_version,battery_version,
      created_at_seq,discovered_panel
    ) SELECT ('61000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      'OBS-06 isolated input ' || n,'asker:obs06','session:obs06','ASKER',now(),
      'casual','casual','ASKER','fixture','low','{}',1,0,'{}',1,'test-v1',n,'[{}]'
    FROM generate_series(1,220) AS n
  `);
  await pool.query(`
    INSERT INTO core.work_item(
      work_item_id,run_id,battery_row_id,node_set,command_key,state,terminal_reason,created_at_seq
    ) SELECT ('62000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      ('61000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      'Q1','[]','obs-06-budget-' || n,
      CASE WHEN n%4=0 THEN 'FAILED' WHEN n%4=1 THEN 'READY' ELSE 'DONE' END,
      CASE WHEN n%4=0 THEN 'FIXTURE_FAILURE' ELSE NULL END,1000+n
    FROM generate_series(1,210) AS n
  `);
  await pool.query(`
    INSERT INTO ledger.raw_artifact(
      raw_artifact_id,attempt_id,run_id,provider_ref,provider,model_id,maker,model_version,
      raw_text,metadata_json,parse_status,content_hash,input_hash,contract_hash,at_seq
    ) SELECT ('63000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      ('64000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      ('61000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      CASE WHEN n%2=0 THEN 'provider:alpha' ELSE 'provider:beta' END,
      'openai-compatible-http','model:fixture','maker:fixture','v1','fixture','{}',
      CASE WHEN n%3=0 THEN 'PARSE_FAILED' ELSE 'PARSED' END,
      repeat('a',64),'fixture-input','fixture-contract',2000+n
    FROM generate_series(1,210) AS n
  `);
}

async function seedOpenAnomalyInput(pool: Pool, now: Date): Promise<void> {
  await pool.query(`
    INSERT INTO core.run(
      run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,
      risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,depth_params,
      agent_count,stranger_sample_rate,envelope_basis,register_version,battery_version,
      created_at_seq,discovered_panel
    ) SELECT ('65000000-0000-4000-8000-00000000000' || n)::uuid,
      'OBS-06 isolated anomaly input ' || n,'asker:obs06','session:obs06','ASKER',now(),
      'casual','casual','ASKER','fixture','low','{}',1,0,'{}',1,'test-v1',n,'[{}]'
    FROM generate_series(1,4) AS n
  `);
  await pool.query(`
    INSERT INTO core.work_item(
      work_item_id,run_id,battery_row_id,node_set,command_key,state,terminal_reason,created_at_seq
    ) SELECT ('66000000-0000-4000-8000-00000000000' || n)::uuid,
      ('65000000-0000-4000-8000-00000000000' || n)::uuid,
      'Q1','[]','obs-06-anomaly-' || n,
      CASE WHEN n<=3 THEN 'FAILED' ELSE 'DONE' END,
      CASE WHEN n<=3 THEN 'FIXTURE_FAILURE' ELSE NULL END,n
    FROM generate_series(1,4) AS n
  `);
  const baselineAt = new Date(now.getTime() - 60 * 60_000);
  const keys = [
    "throughput.cursor.run_sequence", "throughput.cumulative.runs_started",
    "throughput.cumulative.terminal_runs", "throughput.cumulative.failed_runs",
    "throughput.cursor.work_item_sequence", "throughput.cumulative.work_items_done",
    "throughput.cumulative.work_items_failed"
  ];
  for (const key of keys) {
    await pool.query(`
      INSERT INTO observation.sample_ring(metric_key,bucket,observed_at,value)
      VALUES ($1,0,$2,0)
    `, [key, baselineAt]);
  }
}

export async function runOpenAnomalyFixture(input: Readonly<{
  pool: Pool;
  databaseUrl: string;
  stateDir: string;
  firstSeq: number;
  now: Date;
}>): Promise<void> {
  await seedOpenAnomalyInput(input.pool, input.now);
  const target = Object.freeze({
    component: "hatchet" as const,
    kind: "hatchet_metrics" as const,
    rest_url: "http://127.0.0.1:8888/api/v1/tenants/main/queue-metrics"
  });
  const modules = [
    createThroughputModule(),
    createProviderHealthModule(),
    createHatchetThroughputModule({
      tokenPath: () => "/tmp/obs-06-injected-token",
      readRest: async () => Object.freeze({
        queueDepth: 0,
        dispatchP95Seconds: 31,
        failedTasksTotal: 0,
        createdTasksTotal: 0
      }),
      readPrometheus: async () => { throw new TypeError("OBSERVATION_PROMETHEUS_DISABLED"); }
    })
  ];
  const projections = new Map<string, readonly ModuleStatusProjection[]>();
  const journal = new ObservationJournal(input.stateDir);
  const mirror = new PostgresMirror(input.pool);
  let sequence = input.firstSeq - 1;
  const runtime = new ObservationModuleRuntime({
    nextSequence: () => ++sequence,
    nextSignalId: randomUUID,
    sampleStore: new SampleRingStore(input.pool),
    emitSignal: async (signal, _now, lifecycle) =>
      persistSignal({ signal, lifecycle, journal, mirror }).then(() => undefined),
    modules,
    updateModuleStatus(moduleName, update) {
      projections.set(moduleName, update.projections);
    }
  });
  await runtime.run({
    modules,
    now: input.now,
    timeoutMs: 2_000,
    databaseUrl: input.databaseUrl,
    stateDir: input.stateDir,
    targets: Object.freeze([target]),
    targetFragments: Object.freeze([Object.freeze({
      basename: "OBS-06.json",
      targets: Object.freeze([target]),
      configuration: Object.freeze({})
    })]),
    moduleThresholds: Object.freeze({
      throughput: Object.freeze({
        window_minutes: 5, run_failure_window_minutes: 60,
        run_failure_minimum: 4, run_failure_ratio: 0.5
      }),
      "provider-health": Object.freeze({
        window_minutes: 5, minimum_calls: 10, failure_ratio: 0.5
      }),
      "hatchet-throughput": Object.freeze({
        queue_depth: 10, queue_sustained_s: 300, dispatch_p95_s: 30,
        failed_tasks: 3, failed_window_minutes: 15
      })
    }),
    thresholdVersion: 1
  });
  await writeStatusSnapshot(input.stateDir, {
    pid: process.pid,
    version: "OBS-06-fixture",
    thresholds_version: 1,
    mute: null,
    components: {},
    modules: Object.fromEntries([...projections].map(([name, values]) => [
      name,
      values.map(toStoredModuleStatusProjection)
    ]))
  });
}

async function createIsolated(adminUrl: string, databaseName: string): Promise<void> {
  if (!/^debateai_obs06_[a-z0-9]+$/u.test(databaseName)) throw new TypeError("OBS_ACCEPTANCE_DATABASE_INVALID");
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try { await pool.query(`CREATE DATABASE ${databaseName}`); } finally { await pool.end(); }
}

async function main(): Promise<void> {
  const parsed = parseFixtureArguments(process.argv.slice(2));
  if (!parsed.ok) throw new TypeError(parsed.code);
  const adminUrl = process.env.MIGRATION_DATABASE_URL;
  if (adminUrl === undefined) throw new TypeError("MIGRATION_DATABASE_URL_REQUIRED");
  const nonce = randomUUID().replaceAll("-", "");
  const stateDir = await mkdtemp(join(tmpdir(), "obs-06-acceptance-"));
  const plan = planAcceptanceFixture({ mode: parsed.mode, adminDatabaseUrl: adminUrl, nonce,
    stateDir, targetsPath: resolve("deploy/observation-agent/targets.dev.d"),
    firstSeq: Date.now() * 1_000, day: new Date().toISOString().slice(0, 10) });
  await createIsolated(adminUrl, plan.databaseName);
  const pool = new pg.Pool({ connectionString: plan.databaseUrl, max: 1 });
  try {
    await migrate(pool);
    if (parsed.mode === "open-anomalies") {
      await runOpenAnomalyFixture({
        pool, databaseUrl: plan.databaseUrl, stateDir: plan.stateDir,
        firstSeq: plan.firstSeq, now: new Date()
      });
    } else {
      await seedQueryBudget(pool);
    }
  } finally { await pool.end(); }
  await writeFile(parsed.envFile, plan.environmentFile, { mode: 0o600 });
  process.stdout.write(parsed.mode === "open-anomalies"
    ? "OBS-06 ANOMALY INPUT READY\n" : "OBS-06 QUERY INPUT READY\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
