import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg, { type Pool } from "pg";
import { migrate } from "../../packages/db/src/index.js";
import { signalSchema, type ObservationSignal } from "../../apps/observation-agent/src/core/signals.js";
import { ObservationJournal } from "../../apps/observation-agent/src/journal/journal.js";
import { createObservationSignalRouter } from "../../apps/observation-agent/src/modules/routing/router.js";
import { DeliveryCoordinator } from "../../apps/observation-agent/src/notify/delivery.js";
import { persistSignal } from "../../apps/observation-agent/src/store/pipeline.js";
import { PostgresMirror } from "../../apps/observation-agent/src/store/postgres.js";
import {
  toStoredModuleStatusProjection,
  writeStatusSnapshot
} from "../../apps/observation-agent/src/store/status.js";

export const OBS_07_FIXTURE_MODES = Object.freeze([
  "storm-five", "storm-four", "recover-five"
] as const);
type FixtureMode = typeof OBS_07_FIXTURE_MODES[number];

export function parseFixtureArguments(args: readonly string[]):
  | Readonly<{ ok: true; mode: FixtureMode; envFile: string }>
  | Readonly<{ ok: false; code: "OBS_ACCEPTANCE_ARGUMENTS_INVALID" }> {
  const mode = args[0];
  if (!OBS_07_FIXTURE_MODES.includes(mode as FixtureMode) || args[1] !== "--env-file"
    || args.length !== 3 || args[2] === undefined || !args[2].startsWith("/")) {
    return Object.freeze({ ok: false, code: "OBS_ACCEPTANCE_ARGUMENTS_INVALID" });
  }
  return Object.freeze({ ok: true, mode: mode as FixtureMode, envFile: args[2] });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function planAcceptanceFixture(input: Readonly<{
  mode: FixtureMode;
  adminDatabaseUrl: string;
  nonce: string;
  stateDir: string;
  targetsPath: string;
  firstSeq: number;
  day: string;
}>) {
  const admin = new URL(input.adminDatabaseUrl);
  if (admin.pathname !== "/postgres") throw new TypeError("OBS_ACCEPTANCE_ADMIN_DATABASE_MUST_BE_POSTGRES");
  if (!/^[a-z0-9]+$/u.test(input.nonce)) throw new TypeError("OBS_ACCEPTANCE_NONCE_INVALID");
  const databaseName = `debateai_obs07_${input.nonce}`;
  const isolated = new URL(admin);
  isolated.pathname = `/${databaseName}`;
  const values = {
    OBS_ACCEPTANCE_DATABASE: databaseName,
    OBSERVATION_DATABASE_URL: isolated.toString(),
    OBSERVATION_STATE_DIR: input.stateDir,
    OBSERVATION_TARGETS_PATH: input.targetsPath,
    OBS_ACCEPTANCE_FIRST_SEQ: String(input.firstSeq),
    OBS_ACCEPTANCE_DAY: input.day
  };
  return Object.freeze({
    databaseName,
    databaseUrl: isolated.toString(),
    stateDir: input.stateDir,
    targetsPath: input.targetsPath,
    firstSeq: input.firstSeq,
    environmentFile: `${Object.entries(values)
      .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
      .join("\n")}\n`
  });
}

const STORM_COMPONENTS = Object.freeze([
  "ui", "api", "hatchet", "postgres", "tls_front_door"
] as const);

function impactFor(component: typeof STORM_COMPONENTS[number]): ObservationSignal["impact_code"] {
  if (component === "postgres") return "IMPACT_PG_DOWN";
  if (component === "api") return "IMPACT_API_DOWN";
  if (component === "ui") return "IMPACT_UI_DOWN";
  if (component === "tls_front_door") return "IMPACT_TLS_DOWN";
  return "IMPACT_HATCHET_DOWN";
}

export function createStormInputs(input: Readonly<{
  count: 4 | 5;
  firstSeq: number;
  firstDetectedAt: Date;
  signalIds: readonly string[];
}>): readonly ObservationSignal[] {
  if (input.signalIds.length !== input.count
    || !Number.isSafeInteger(input.firstSeq) || input.firstSeq <= 0
    || !Number.isFinite(input.firstDetectedAt.getTime())) {
    throw new TypeError("OBS_ACCEPTANCE_INPUT_INVALID");
  }
  return Object.freeze(STORM_COMPONENTS.slice(0, input.count).map((component, index) => {
    const at = new Date(input.firstDetectedAt.getTime() + index * 10_000).toISOString();
    return Object.freeze(signalSchema.parse({
      seq: input.firstSeq + index,
      signal_id: input.signalIds[index],
      state: "OPEN",
      class: "INFRA_DOWN",
      component,
      severity: "FATAL",
      impact_code: impactFor(component),
      first_failed_probe_at: at,
      detected_at: at,
      evidence: { probe: "http_get", last_status: "FAILED" },
      suspected_defect: false,
      defect_kind: null,
      run_ref: null,
      work_item_ref: null,
      threshold_version: 1,
      clears_signal_id: null,
      recorded_at: at
    }));
  }));
}

const routingPolicy = Object.freeze({
  rateLimitMs: 600_000,
  degradedAfterMs: 900_000,
  timeoutMs: 2_000
});
const moduleContext = Object.freeze({
  thresholdVersion: 1,
  thresholds: Object.freeze({
    escalation_interval_ms: 1_800_000,
    fatal_resend_max: 3,
    storm_count: 5,
    storm_window_s: 60,
    board: "ops-alerts"
  })
});

function lifecycleFor(signal: ObservationSignal) {
  if (signal.component === "api" || signal.component === "ui"
    || signal.component === "tls_front_door") {
    return Object.freeze({
      owner: "product-liveness",
      correlationKey: `member:${signal.component}:infra_down`
    });
  }
  return Object.freeze({
    owner: "core-liveness",
    correlationKey: `${signal.component}:${signal.class}`
  });
}

async function fixtureRouter(pool: Pool, stateDir: string) {
  const journal = new ObservationJournal(stateDir);
  const mirror = new PostgresMirror(pool);
  return Object.freeze({
    journal,
    mirror,
    router: await createObservationSignalRouter({
      stateDir,
      delivery: new DeliveryCoordinator({ journal, mirror }),
      executors: Object.freeze({
        osascript: async (_signal, now) => Object.freeze({ deliveredAt: now, externalRef: null }),
        sendmail: async (_signal, now) => Object.freeze({ deliveredAt: now, externalRef: null }),
        kanban: async (signal, now) => Object.freeze({
          deliveredAt: now,
          externalRef: `obs07-${signal.signal_id.slice(-12)}`
        })
      }),
      stormSummary: async (_root, _count, now) => Object.freeze({
        deliveredAt: now,
        externalRef: null
      }),
      configuration: Object.freeze({
        notify: Object.freeze({ dev_capture_dir: "dev-mail-capture" })
      }),
      thresholds: moduleContext.thresholds,
      thresholdVersion: 1
    })
  });
}

async function writeFixtureStatus(
  stateDir: string,
  signals: readonly ObservationSignal[],
  router: Awaited<ReturnType<typeof fixtureRouter>>["router"],
  recovered: boolean
): Promise<void> {
  const byComponent = new Map(signals.map((signal) => [signal.component, signal]));
  await writeStatusSnapshot(stateDir, {
    pid: process.pid,
    version: "OBS-07-fixture",
    thresholds_version: 1,
    mute: null,
    components: Object.fromEntries([...byComponent].map(([component, signal]) => [component, {
      state: recovered ? "UP" : "DOWN",
      last_probe_at: signal.detected_at,
      last_ok_at: recovered ? signal.detected_at : null,
      open_signal_ids: recovered ? [] : [signal.signal_id]
    }])),
    modules: { routing: router.status().map(toStoredModuleStatusProjection) }
  });
}

export async function runStormSequence(input: Readonly<{
  pool: Pool;
  stateDir: string;
  firstSeq: number;
  count: 4 | 5;
  firstDetectedAt: Date;
  signalIds: readonly string[];
}>): Promise<readonly ObservationSignal[]> {
  const signals = createStormInputs(input);
  const runtime = await fixtureRouter(input.pool, input.stateDir);
  for (const signal of signals) {
    await persistSignal({
      signal,
      lifecycle: lifecycleFor(signal),
      journal: runtime.journal,
      mirror: runtime.mirror
    });
    await runtime.router.onSignal({
      signal,
      now: new Date(signal.detected_at),
      policy: routingPolicy,
      mute: null,
      module: moduleContext
    });
  }
  await writeFixtureStatus(input.stateDir, signals, runtime.router, false);
  await writeFile(join(input.stateDir, "fixture-input.json"), `${JSON.stringify({ signals })}\n`, {
    mode: 0o600
  });
  return signals;
}

export async function recoverStormSequence(input: Readonly<{
  pool: Pool;
  stateDir: string;
  firstSeq: number;
  now: Date;
}>): Promise<void> {
  const stored = JSON.parse(await readFile(join(input.stateDir, "fixture-input.json"), "utf8")) as {
    signals?: unknown;
  };
  const opens = Array.isArray(stored.signals)
    ? stored.signals.map((signal) => signalSchema.parse(signal))
    : [];
  if (opens.length !== 5) throw new TypeError("OBS_ACCEPTANCE_RECOVERY_INPUT_INVALID");
  const runtime = await fixtureRouter(input.pool, input.stateDir);
  for (const [index, openSignal] of opens.entries()) {
    const at = new Date(input.now.getTime() + index * 1_000);
    const cleared = signalSchema.parse({
      seq: input.firstSeq + 100 + index,
      signal_id: randomUUID(),
      state: "CLEARED",
      class: openSignal.class,
      component: openSignal.component,
      severity: openSignal.severity,
      impact_code: "IMPACT_CLEARED",
      first_failed_probe_at: openSignal.first_failed_probe_at,
      detected_at: at.toISOString(),
      evidence: { duration_seconds: Math.max(0,
        (at.getTime() - Date.parse(openSignal.detected_at)) / 1_000) },
      suspected_defect: false,
      defect_kind: null,
      run_ref: null,
      work_item_ref: null,
      threshold_version: 1,
      clears_signal_id: openSignal.signal_id,
      recorded_at: at.toISOString()
    });
    await persistSignal({
      signal: cleared,
      lifecycle: lifecycleFor(openSignal),
      journal: runtime.journal,
      mirror: runtime.mirror
    });
    await runtime.router.onSignal({
      signal: cleared,
      now: at,
      policy: routingPolicy,
      mute: null,
      module: moduleContext
    });
  }
  await runtime.router.onTick({ now: input.now, policy: routingPolicy, mute: null, module: moduleContext });
  await writeFixtureStatus(input.stateDir, opens, runtime.router, true);
}

async function createIsolatedDatabase(adminDatabaseUrl: string, databaseName: string): Promise<void> {
  if (!/^debateai_obs07_[a-z0-9]+$/u.test(databaseName)) {
    throw new TypeError("OBS_ACCEPTANCE_DATABASE_INVALID");
  }
  const pool = new pg.Pool({ connectionString: adminDatabaseUrl, max: 1 });
  try {
    await pool.query(`CREATE DATABASE ${databaseName}`);
  } finally {
    await pool.end();
  }
}

async function runInitial(mode: "storm-five" | "storm-four", envFile: string): Promise<void> {
  const adminDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (adminDatabaseUrl === undefined) throw new TypeError("MIGRATION_DATABASE_URL_REQUIRED");
  const nonce = randomUUID().replaceAll("-", "");
  const stateDir = await mkdtemp(join(tmpdir(), "obs-07-acceptance-"));
  const firstDetectedAt = new Date(Date.now() - (mode === "storm-five" ? 40_000 : 30_000));
  const plan = planAcceptanceFixture({
    mode,
    adminDatabaseUrl,
    nonce,
    stateDir,
    targetsPath: resolve("deploy/observation-agent/targets.dev.d"),
    firstSeq: Date.now() * 1_000,
    day: firstDetectedAt.toISOString().slice(0, 10)
  });
  await createIsolatedDatabase(adminDatabaseUrl, plan.databaseName);
  const pool = new pg.Pool({ connectionString: plan.databaseUrl, max: 2 });
  try {
    await migrate(pool);
    const count = mode === "storm-five" ? 5 : 4;
    await runStormSequence({
      pool,
      stateDir,
      firstSeq: plan.firstSeq,
      count,
      firstDetectedAt,
      signalIds: Array.from({ length: count }, () => randomUUID())
    });
  } finally {
    await pool.end();
  }
  await writeFile(envFile, plan.environmentFile, { mode: 0o600 });
  process.stdout.write(mode === "storm-five"
    ? "OBS-07 FIVE INPUTS READY\n"
    : "OBS-07 FOUR INPUTS READY\n");
}

async function runRecovery(): Promise<void> {
  const databaseUrl = process.env.OBSERVATION_DATABASE_URL;
  const stateDir = process.env.OBSERVATION_STATE_DIR;
  const firstSeq = Number(process.env.OBS_ACCEPTANCE_FIRST_SEQ);
  if (databaseUrl === undefined || stateDir === undefined || !Number.isSafeInteger(firstSeq)
    || !new URL(databaseUrl).pathname.startsWith("/debateai_obs07_")) {
    throw new TypeError("OBS_ACCEPTANCE_ENV_INVALID");
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await recoverStormSequence({ pool, stateDir, firstSeq, now: new Date() });
  } finally {
    await pool.end();
  }
  process.stdout.write("OBS-07 FIVE INPUTS RECOVERED\n");
}

async function main(): Promise<void> {
  const parsed = parseFixtureArguments(process.argv.slice(2));
  if (!parsed.ok) throw new TypeError(parsed.code);
  if (parsed.mode === "recover-five") await runRecovery();
  else await runInitial(parsed.mode, parsed.envFile);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
