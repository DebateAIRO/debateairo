import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { migrate } from "../../packages/db/src/index.js";
import type { ModuleStatusProjection } from "../../apps/observation-agent/src/core/types.js";
import { ObservationModuleRuntime } from "../../apps/observation-agent/src/core/runtime.js";
import { ObservationJournal } from "../../apps/observation-agent/src/journal/journal.js";
import { createCaptureHealthModule } from "../../apps/observation-agent/src/modules/capture-health/module.js";
import {
  readCaptureSnapshot,
  type CaptureSnapshot
} from "../../apps/observation-agent/src/modules/capture-health/queries.js";
import { persistSignal } from "../../apps/observation-agent/src/store/pipeline.js";
import { PostgresMirror } from "../../apps/observation-agent/src/store/postgres.js";
import { writeStatusSnapshot } from "../../apps/observation-agent/src/store/status.js";

export const OBS_04_FIXTURE_MODES = Object.freeze(["open-gap", "close-gap"] as const);
type FixtureMode = typeof OBS_04_FIXTURE_MODES[number];

export function parseFixtureArguments(args: readonly string[]):
  | Readonly<{ ok: true; mode: FixtureMode; envFile: string }>
  | Readonly<{ ok: false; code: "OBS_ACCEPTANCE_ARGUMENTS_INVALID" }> {
  const mode = args[0];
  if (!OBS_04_FIXTURE_MODES.includes(mode as FixtureMode)
    || args[1] !== "--env-file"
    || args.length !== 3
    || args[2] === undefined
    || !args[2].startsWith("/")) {
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
}>): Readonly<{
  databaseName: string;
  databaseUrl: string;
  stateDir: string;
  targetsPath: string;
  firstSeq: number;
  environmentFile: string;
}> {
  const admin = new URL(input.adminDatabaseUrl);
  if (admin.pathname !== "/postgres") {
    throw new TypeError("OBS_ACCEPTANCE_ADMIN_DATABASE_MUST_BE_POSTGRES");
  }
  if (!/^[a-z0-9]+$/u.test(input.nonce)) {
    throw new TypeError("OBS_ACCEPTANCE_NONCE_INVALID");
  }
  const databaseName = `debateai_obs04_${input.nonce}`;
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

type QueryClient = Readonly<{
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<Readonly<{ rows: readonly Record<string, unknown>[] }>>;
}>;

export async function applyGapStimulus(client: QueryClient, input: Readonly<{
  gapId: string;
  source: string;
  gapClass: string;
  lostCount: number;
  openedAt: Date;
  closedAt: Date;
}>): Promise<void> {
  await client.query(`INSERT INTO obs.capture_gap(
    capture_gap_id,source,gap_class,lost_count,opened_at,closed_at
  ) VALUES ($1,$2,$3,$4,$5,$6)`, [
    input.gapId,
    input.source,
    input.gapClass,
    input.lostCount,
    input.openedAt,
    input.closedAt
  ]);
}

function migrationDatabaseUrl(): string {
  const value = process.env.MIGRATION_DATABASE_URL;
  if (value === undefined) throw new TypeError("MIGRATION_DATABASE_URL_REQUIRED");
  return value;
}

async function createIsolatedDatabase(adminDatabaseUrl: string, databaseName: string): Promise<void> {
  if (!/^debateai_obs04_[a-z0-9]+$/u.test(databaseName)) {
    throw new TypeError("OBS_ACCEPTANCE_DATABASE_INVALID");
  }
  const pool = new pg.Pool({ connectionString: adminDatabaseUrl, max: 1 });
  try {
    await pool.query(`CREATE DATABASE ${databaseName}`);
  } finally {
    await pool.end();
  }
}

function storedProjection(projection: ModuleStatusProjection): Readonly<Record<string, unknown>> {
  if (projection.kind === "state") return {
    kind: projection.kind, key: projection.key, state: projection.state,
    ...(projection.observedAt === undefined ? {} : { observed_at: projection.observedAt.toISOString() })
  };
  if (projection.kind === "metric") return {
    kind: projection.kind, key: projection.key, value: projection.value, unit: projection.unit,
    ...(projection.observedAt === undefined ? {} : { observed_at: projection.observedAt.toISOString() })
  };
  if (projection.kind === "timestamp") return {
    kind: projection.kind, key: projection.key, value: projection.value?.toISOString() ?? null
  };
  return projection;
}

function fixtureCaptureModule(
  authorityAt: Date,
  liveness: "UP" | "DOWN"
) {
  return createCaptureHealthModule({
    readSnapshot: async (databaseUrl): Promise<CaptureSnapshot> => {
      const snapshot = await readCaptureSnapshot(databaseUrl);
      if (snapshot.state === "UNKNOWN") return snapshot;
      return Object.freeze({
        ...snapshot,
        health: Object.freeze([...snapshot.health, Object.freeze({
          runtime: "runner",
          state: "HEALTHY",
          observedAt: authorityAt,
          detailCode: "FLUSH_OK"
        })])
      });
    },
    readRuntimeLiveness: async () => Object.freeze({ runner: liveness })
  });
}

async function runOpenFixture(plan: ReturnType<typeof planAcceptanceFixture>): Promise<void> {
  await createIsolatedDatabase(migrationDatabaseUrl(), plan.databaseName);
  const pool = new pg.Pool({ connectionString: plan.databaseUrl, max: 1 });
  const gapId = randomUUID();
  const closedAt = new Date();
  const detectedAt = new Date();
  const openedSignalId = randomUUID();
  let nextIdentifier = openedSignalId;
  let projections: readonly ModuleStatusProjection[] = Object.freeze([]);
  try {
    await migrate(pool);
    await applyGapStimulus(pool, {
      gapId,
      source: "obs04_acceptance",
      gapClass: "QUEUE_FULL",
      lostCount: 7,
      openedAt: closedAt,
      closedAt
    });
    const journal = new ObservationJournal(plan.stateDir);
    const mirror = new PostgresMirror(pool);
    let sequence = plan.firstSeq - 1;
    const runtime = new ObservationModuleRuntime({
      nextSequence: () => ++sequence,
      nextSignalId: () => {
        const identifier = nextIdentifier;
        nextIdentifier = randomUUID();
        return identifier;
      },
      sampleStore: { write: async () => undefined },
      emitSignal: async (signal, _now, lifecycle) =>
        persistSignal({ signal, lifecycle, journal, mirror }).then(() => undefined),
      updateModuleStatus(_moduleName, update) {
        projections = update.projections;
      }
    });
    await runtime.run({
      modules: [fixtureCaptureModule(detectedAt, "UP")],
      now: detectedAt, timeoutMs: 2_000, databaseUrl: plan.databaseUrl,
      stateDir: plan.stateDir, targets: Object.freeze([]), thresholdVersion: 1,
      moduleThresholds: Object.freeze({ "capture-health": Object.freeze({
        expected_runtimes: Object.freeze(["runner"]), detector_interval_ms: 15_000,
        blind_window_s: 120, gap_window_s: 300, gap_severe_lost_count: 100
      }) })
    });
    await writeStatusSnapshot(plan.stateDir, {
      pid: process.pid,
      version: "OBS-04-fixture",
      thresholds_version: 1,
      mute: null,
      components: {
        obs_capture: {
          state: "WIRED_CURRENT",
          last_probe_at: detectedAt.toISOString(),
          last_ok_at: detectedAt.toISOString(),
          open_signal_ids: [openedSignalId]
        }
      },
      modules: { "capture-health": projections.map(storedProjection) }
    });
    await writeFile(join(plan.stateDir, "fixture-input.json"), `${JSON.stringify({
      gapId,
      openedSignalId
    })}\n`, { mode: 0o600 });
  } finally {
    await pool.end();
  }
}

async function runCloseFixture(): Promise<void> {
  const databaseUrl = process.env.OBSERVATION_DATABASE_URL;
  const stateDir = process.env.OBSERVATION_STATE_DIR;
  const firstSeq = Number(process.env.OBS_ACCEPTANCE_FIRST_SEQ);
  if (databaseUrl === undefined || stateDir === undefined
    || new URL(databaseUrl).pathname === "/debateai"
    || !new URL(databaseUrl).pathname.startsWith("/debateai_obs04_")
    || !Number.isSafeInteger(firstSeq)) {
    throw new TypeError("OBS_ACCEPTANCE_ENV_INVALID");
  }
  const input = JSON.parse(await readFile(join(stateDir, "fixture-input.json"), "utf8")) as {
    openedSignalId: string;
  };
  const detectedAt = new Date();
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const journal = new ObservationJournal(stateDir);
    const mirror = new PostgresMirror(pool);
    let sequence = firstSeq - 1;
    let nextIdentifier = input.openedSignalId;
    let emittedCycles = 0;
    const runtime = new ObservationModuleRuntime({
      nextSequence: () => ++sequence,
      nextSignalId: () => {
        const identifier = nextIdentifier;
        nextIdentifier = randomUUID();
        return identifier;
      },
      sampleStore: { write: async () => undefined },
      emitSignal: async (signal, _now, lifecycle) => {
        emittedCycles += 1;
        if (emittedCycles > 1) {
          await persistSignal({ signal, lifecycle, journal, mirror });
        }
      }
    });
    const module = fixtureCaptureModule(detectedAt, "DOWN");
    const run = (now: Date) => runtime.run({
      modules: [module], now, timeoutMs: 2_000, databaseUrl,
      stateDir, targets: Object.freeze([]), thresholdVersion: 1,
      moduleThresholds: Object.freeze({ "capture-health": Object.freeze({
        expected_runtimes: Object.freeze(["runner"]), detector_interval_ms: 15_000,
        blind_window_s: 120, gap_window_s: 300, gap_severe_lost_count: 100
      }) })
    });
    await run(new Date(detectedAt.getTime() - 15_000));
    await run(detectedAt);
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const parsed = parseFixtureArguments(process.argv.slice(2));
  if (!parsed.ok) throw new TypeError(parsed.code);
  if (parsed.mode === "open-gap") {
    const adminDatabaseUrl = migrationDatabaseUrl();
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-acceptance-"));
    const now = new Date();
    const plan = planAcceptanceFixture({
      mode: parsed.mode,
      adminDatabaseUrl,
      nonce: randomUUID().replaceAll("-", ""),
      stateDir,
      targetsPath: resolve("deploy/observation-agent/targets.dev.d"),
      firstSeq: Date.now() * 1_000,
      day: now.toISOString().slice(0, 10)
    });
    await runOpenFixture(plan);
    await writeFile(parsed.envFile, plan.environmentFile, { mode: 0o600 });
    process.stdout.write("OBS-04 GAP INPUT READY\n");
    return;
  }
  await runCloseFixture();
  process.stdout.write("OBS-04 GAP INPUT CLOSED\n");
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "OBS_ACCEPTANCE_FAILED"}\n`);
    process.exitCode = 1;
  });
}
