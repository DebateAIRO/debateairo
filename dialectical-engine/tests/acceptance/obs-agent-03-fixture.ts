import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { migrate } from "../../packages/db/src/index.js";
import { signalSchema, type ObservationSignal } from "../../apps/observation-agent/src/core/signals.js";
import type {
  Module,
  ProbeContext,
  ProbeObservation,
  SignalIntent
} from "../../apps/observation-agent/src/core/types.js";
import { ObservationJournal } from "../../apps/observation-agent/src/journal/journal.js";
import { createStallDetectorsModule } from "../../apps/observation-agent/src/modules/stall-detectors/module.js";
import { readDefectInputs } from "../../apps/observation-agent/src/modules/defect-interface/queries.js";
import { persistSignal } from "../../apps/observation-agent/src/store/pipeline.js";
import { PostgresMirror } from "../../apps/observation-agent/src/store/postgres.js";
import { writeStatusSnapshot } from "../../apps/observation-agent/src/store/status.js";

export const OBS_03_FIXTURE_MODES = Object.freeze([
  "open-defects", "recover-defects", "query-budget"
] as const);

type FixtureMode = typeof OBS_03_FIXTURE_MODES[number];

export function parseFixtureArguments(args: readonly string[]):
  | Readonly<{ ok: true; mode: FixtureMode; envFile: string }>
  | Readonly<{ ok: false; code: "OBS_ACCEPTANCE_ARGUMENTS_INVALID" }> {
  const mode = args[0];
  if (!OBS_03_FIXTURE_MODES.includes(mode as FixtureMode)
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
  const databaseName = `debateai_obs03_${input.nonce}`;
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

function migrationDatabaseUrl(): string {
  const value = process.env.MIGRATION_DATABASE_URL;
  if (value === undefined) throw new TypeError("MIGRATION_DATABASE_URL_REQUIRED");
  return value;
}

async function createIsolatedDatabase(adminDatabaseUrl: string, databaseName: string): Promise<void> {
  if (!/^debateai_obs03_[a-z0-9]+$/u.test(databaseName)) {
    throw new TypeError("OBS_ACCEPTANCE_DATABASE_INVALID");
  }
  const pool = new pg.Pool({ connectionString: adminDatabaseUrl, max: 1 });
  try {
    await pool.query(`CREATE DATABASE ${databaseName}`);
  } finally {
    await pool.end();
  }
}

async function seedRun(pool: pg.Pool, input: Readonly<{
  runId: string;
  sequence: number;
}>): Promise<void> {
  await pool.query(`
    INSERT INTO core.run(
      run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,
      risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,depth_params,
      agent_count,stranger_sample_rate,envelope_basis,register_version,battery_version,
      created_at_seq,discovered_panel
    ) VALUES (
      $1,'OBS-03 isolated fixture','asker:obs03','session:obs03','ASKER',
      '2026-09-03T08:00:00.000Z','casual','casual','ASKER','fixture','low','{}',
      1,0,'{}',1,'test-v1',$2,'[{}]'
    )
  `, [input.runId, input.sequence]);
  await pool.query(`
    INSERT INTO core.run_progress_event(run_id,at_seq,kind,value_json)
    VALUES ($1,$2,'PHASE','{}')
  `, [input.runId, input.sequence]);
}

async function seedOpenInputs(pool: pg.Pool, origin: Date): Promise<Readonly<{
  runIds: readonly string[];
  workItemIds: readonly string[];
  stallRunId: string;
  readyRunId: string;
}>> {
  const runIds = Object.freeze([randomUUID(), randomUUID(), randomUUID(), randomUUID()]);
  const workItemIds = Object.freeze([randomUUID(), randomUUID(), randomUUID(), randomUUID()]);
  for (const [index, runId] of runIds.entries()) {
    await seedRun(pool, { runId, sequence: index + 1 });
  }
  await pool.query(`
    INSERT INTO core.work_item(
      work_item_id,run_id,battery_row_id,node_set,command_key,state,
      claimed_by,claim_deadline,created_at_seq
    ) VALUES ($1,$2,'Q1','[]',$5,'CLAIMED','runner-fixture',$3,$4)
  `, [
    workItemIds[0], runIds[0], new Date(origin.getTime() + 284_000), 101,
    `obs-03-stall-${workItemIds[0]}`
  ]);
  return Object.freeze({
    runIds,
    workItemIds,
    stallRunId: runIds[0]!,
    readyRunId: runIds[2]!
  });
}

async function addReadyInput(
  pool: pg.Pool,
  fixture: Awaited<ReturnType<typeof seedOpenInputs>>
): Promise<void> {
  await pool.query(`
    INSERT INTO core.work_item(
      work_item_id,run_id,battery_row_id,node_set,command_key,state,created_at_seq
    ) VALUES ($1,$2,'Q1','[]',$3,'READY',104)
  `, [fixture.workItemIds[2], fixture.readyRunId,
    `obs-03-ready-${fixture.workItemIds[2]}`]);
}

async function armFinalInputs(
  pool: pg.Pool,
  fixture: Awaited<ReturnType<typeof seedOpenInputs>>
): Promise<void> {
  await pool.query(`
    INSERT INTO core.work_item(
      work_item_id,run_id,battery_row_id,node_set,command_key,state,created_at_seq
    ) VALUES ($1,$2,'Q1','[]',$3,'DONE',103)
  `, [fixture.workItemIds[3], fixture.runIds[3],
    `obs-03-success-${fixture.workItemIds[3]}`]);
}

function moduleContext(now: Date, databaseUrl: string, stateDir: string, targetsPath: string) {
  return Object.freeze({
    now,
    timeoutMs: 2_000,
    databaseUrl,
    stateDir,
    targets: Object.freeze([]),
    targetFragment: Object.freeze({
      basename: "OBS-03.json", targets: Object.freeze([]), configuration: Object.freeze({})
    }),
    configuration: Object.freeze({}),
    thresholds: Object.freeze({
      claim_grace_s: 15,
      ready_age_s: 120,
      no_progress_s: 300,
      heartbeat_age_s: 30,
      worker_ref: "debateai-dev-runner",
      worker_list_url: "http://127.0.0.1:8888/api/v1/tenants/main/worker",
      targets_path: targetsPath
    })
  });
}

function fixedHeartbeat(now: Date) {
  return Object.freeze({
    state: "FRESH" as const,
    workerRef: "debateai-dev-runner",
    heartbeatAgeSeconds: 1,
    heartbeatThresholdSeconds: 30,
    lastHeartbeatAt: new Date(now.getTime() - 1_000),
    observedAt: now,
    evidence: Object.freeze({ health: "FRESH" as const })
  });
}

export async function runOpenDetectorTimeline(input: Readonly<{
  manifest: Module;
  origin: Date;
  contextAt(now: Date): ProbeContext;
  prime(): Promise<void>;
  armFinal(): Promise<void>;
}>): Promise<Readonly<{
  observations: readonly ProbeObservation[];
  intents: readonly SignalIntent[];
}>> {
  const firstContext = input.contextAt(input.origin);
  const first = await input.manifest.probe(firstContext);
  input.manifest.signals(first, { ...firstContext, thresholdVersion: 1 });

  await input.prime();
  const primedContext = input.contextAt(new Date(input.origin.getTime() + 180_000));
  const primed = await input.manifest.probe(primedContext);
  input.manifest.signals(primed, { ...primedContext, thresholdVersion: 1 });

  await input.armFinal();
  const detectedContext = input.contextAt(new Date(input.origin.getTime() + 300_000));
  const observations = await input.manifest.probe(detectedContext);
  const intents = input.manifest.signals(
    observations,
    { ...detectedContext, thresholdVersion: 1 }
  );
  return Object.freeze({ observations, intents });
}

function toSignal(intent: SignalIntent, seq: number, clearsSignalId: string | null): ObservationSignal {
  const timestamp = intent.detectedAt.toISOString();
  return signalSchema.parse({
    seq,
    signal_id: randomUUID(),
    state: intent.state,
    class: intent.class,
    component: intent.component,
    severity: intent.severity,
    impact_code: intent.impactCode,
    first_failed_probe_at: intent.firstFailedProbeAt?.toISOString() ?? null,
    detected_at: timestamp,
    evidence: intent.evidence,
    suspected_defect: intent.suspectedDefect,
    defect_kind: intent.defectKind,
    run_ref: intent.runRef,
    work_item_ref: intent.workItemRef,
    threshold_version: 1,
    clears_signal_id: clearsSignalId,
    recorded_at: timestamp
  });
}

async function persistSignals(input: Readonly<{
  intents: readonly SignalIntent[];
  firstSeq: number;
  databaseUrl: string;
  stateDir: string;
  clearsByCorrelation?: Readonly<Record<string, string>>;
}>): Promise<readonly ObservationSignal[]> {
  const pool = new pg.Pool({ connectionString: input.databaseUrl, max: 1 });
  try {
    const journal = new ObservationJournal(input.stateDir);
    const mirror = new PostgresMirror(pool);
    const signals: ObservationSignal[] = [];
    for (const [index, intent] of input.intents.entries()) {
      const signal = toSignal(
        intent,
        input.firstSeq + index,
        input.clearsByCorrelation?.[intent.correlationKey] ?? null
      );
      await persistSignal({ signal, journal, mirror });
      signals.push(signal);
    }
    return Object.freeze(signals);
  } finally {
    await pool.end();
  }
}

function storedProjections(observations: readonly ProbeObservation[]) {
  return observations.flatMap((observation) => observation.status ?? []).map((projection) => {
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
  });
}

async function writeFixtureStatus(input: Readonly<{
  stateDir: string;
  observations: readonly ProbeObservation[];
  openSignalIds: readonly string[];
}>): Promise<void> {
  await writeStatusSnapshot(input.stateDir, {
    pid: process.pid,
    version: "OBS-03-fixture",
    thresholds_version: 1,
    mute: null,
    components: {
      runner: {
        state: "FRESH",
        last_probe_at: "2026-09-03T08:05:00.000Z",
        last_ok_at: "2026-09-03T08:05:00.000Z",
        open_signal_ids: input.openSignalIds
      }
    },
    modules: { "stall-detectors": storedProjections(input.observations) }
  });
}

async function runOpenFixture(plan: ReturnType<typeof planAcceptanceFixture>): Promise<void> {
  await createIsolatedDatabase(migrationDatabaseUrl(), plan.databaseName);
  const pool = new pg.Pool({ connectionString: plan.databaseUrl, max: 1 });
  const origin = new Date("2026-09-03T08:00:00.000Z");
  try {
    await migrate(pool);
    const fixture = await seedOpenInputs(pool, origin);
    const module = createStallDetectorsModule({
      tokenPath: () => "/fixture/no-secret-read",
      readHeartbeat: async (input) => fixedHeartbeat(input.now),
      readDefectInputs
    });
    const timeline = await runOpenDetectorTimeline({
      manifest: module,
      origin,
      contextAt: (now) => moduleContext(
        now, plan.databaseUrl, plan.stateDir, plan.targetsPath
      ),
      prime: () => addReadyInput(pool, fixture),
      armFinal: () => armFinalInputs(pool, fixture)
    });
    const { observations, intents } = timeline;
    const signals = await persistSignals({
      intents,
      firstSeq: plan.firstSeq,
      databaseUrl: plan.databaseUrl,
      stateDir: plan.stateDir
    });
    await writeFixtureStatus({
      stateDir: plan.stateDir,
      observations,
      openSignalIds: signals.map((signal) => signal.signal_id)
    });
    await writeFile(join(plan.stateDir, "fixture-input.json"), `${JSON.stringify({
      signals: signals.map((signal, index) => ({
        correlationKey: intents[index]!.correlationKey,
        signal
      })),
      workItemIds: fixture.workItemIds
    })}\n`, { mode: 0o600 });
  } finally {
    await pool.end();
  }
}

async function runRecoveryFixture(): Promise<void> {
  const databaseUrl = process.env.OBSERVATION_DATABASE_URL;
  const stateDir = process.env.OBSERVATION_STATE_DIR;
  if (databaseUrl === undefined || stateDir === undefined
    || new URL(databaseUrl).pathname === "/debateai") {
    throw new TypeError("OBS_ACCEPTANCE_ENV_INVALID");
  }
  const fixture = JSON.parse(await readFile(join(stateDir, "fixture-input.json"), "utf8")) as {
    signals: Array<{ correlationKey: string; signal: ObservationSignal }>;
    workItemIds: string[];
  };
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await pool.query(`
      UPDATE core.work_item
      SET state='DONE',claimed_by=NULL,claim_deadline=NULL,
          settled_attempt_id=gen_random_uuid(),settled_artifact_ref=gen_random_uuid()
      WHERE work_item_id=ANY($1::uuid[])
    `, [fixture.workItemIds]);
  } finally {
    await pool.end();
  }
  const recoveredAt = new Date("2026-09-03T08:05:15.000Z");
  const intents = fixture.signals.map(({ correlationKey, signal }): SignalIntent => Object.freeze({
    correlationKey,
    component: signal.component,
    class: signal.class,
    state: "CLEARED",
    severity: signal.severity,
    impactCode: "IMPACT_CLEARED",
    firstFailedProbeAt: signal.first_failed_probe_at === null
      ? null : new Date(signal.first_failed_probe_at),
    detectedAt: recoveredAt,
    evidence: Object.freeze({ duration_seconds: 15 }),
    suspectedDefect: true,
    defectKind: signal.defect_kind,
    runRef: signal.run_ref,
    workItemRef: signal.work_item_ref
  }));
  const firstSeq = Number(process.env.OBS_ACCEPTANCE_FIRST_SEQ ?? 1) + fixture.signals.length;
  await persistSignals({
    intents,
    firstSeq,
    databaseUrl,
    stateDir,
    clearsByCorrelation: Object.fromEntries(fixture.signals.map(({ correlationKey, signal }) =>
      [correlationKey, signal.signal_id]))
  });
  await writeFixtureStatus({ stateDir, observations: [], openSignalIds: [] });
}

async function seedBudgetFixture(pool: pg.Pool): Promise<void> {
  await pool.query(`
    INSERT INTO core.run(
      run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,
      risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,depth_params,
      agent_count,stranger_sample_rate,envelope_basis,register_version,battery_version,
      created_at_seq,discovered_panel
    )
    SELECT
      ('37000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      'OBS-03 isolated budget','asker:obs03','session:obs03','ASKER',
      '2026-09-03T08:00:00.000Z','casual','casual','ASKER','fixture','low','{}',
      1,0,'{}',1,'test-v1',n,'[{}]'
    FROM generate_series(1,220) AS n
  `);
  await pool.query(`
    INSERT INTO core.run_progress_event(run_id,at_seq,kind,value_json)
    SELECT ('37000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,n,'PHASE','{}'
    FROM generate_series(1,220) AS n
  `);
  await pool.query(`
    INSERT INTO core.work_item(
      work_item_id,run_id,battery_row_id,node_set,command_key,state,created_at_seq
    )
    SELECT
      ('38000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      ('37000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      'Q1','[]','obs-03-budget-' || n,'READY',1000+n
    FROM generate_series(1,210) AS n
  `);
}

async function runBudgetFixture(plan: ReturnType<typeof planAcceptanceFixture>): Promise<void> {
  await createIsolatedDatabase(migrationDatabaseUrl(), plan.databaseName);
  const pool = new pg.Pool({ connectionString: plan.databaseUrl, max: 1 });
  try {
    await migrate(pool);
    await seedBudgetFixture(pool);
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const parsed = parseFixtureArguments(process.argv.slice(2));
  if (!parsed.ok) throw new TypeError(parsed.code);
  if (parsed.mode === "recover-defects") {
    await runRecoveryFixture();
    process.stdout.write("OBS-03 FIXTURE RECOVERED\n");
    return;
  }
  const adminDatabaseUrl = migrationDatabaseUrl();
  const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
  const stateDir = await mkdtemp(join(tmpdir(), `obs-03-${nonce}-`));
  const repoRoot = resolve(import.meta.dirname, "../..");
  const firstSeq = Date.now() * 1_000;
  const day = "2026-09-03";
  const plan = planAcceptanceFixture({
    mode: parsed.mode,
    adminDatabaseUrl,
    nonce,
    stateDir,
    targetsPath: resolve(repoRoot, "deploy/observation-agent/targets.dev.d"),
    firstSeq,
    day
  });
  if (parsed.mode === "open-defects") await runOpenFixture(plan);
  else await runBudgetFixture(plan);
  await writeFile(parsed.envFile, plan.environmentFile, { mode: 0o600 });
  process.stdout.write(parsed.mode === "open-defects"
    ? "OBS-03 FIXTURE READY\n"
    : "OBS-03 QUERY BUDGET READY\n");
}

const entry = process.argv[1];
if (entry !== undefined && basename(entry) === "obs-agent-03-fixture.ts"
  && import.meta.url === pathToFileURL(entry).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "OBS_ACCEPTANCE_FAILED"}\n`);
    process.exitCode = 2;
  });
}
