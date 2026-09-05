import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import pg from "pg";
import { ObservationError } from "../../core/errors.js";
import type { ObservationSignal } from "../../core/signals.js";
import type {
  ModuleConfigurationObject,
  ModuleConfigurationValue,
  ModuleStatusProjection, RestoredOpenSignal,
  SignalIntent
} from "../../core/types.js";

export const SCHEDULER_JOBS = Object.freeze([
  "liveness-sweep", "settlement-watch", "replay-self-test"
] as const);
export type SchedulerJob = typeof SCHEDULER_JOBS[number];

export type JobCompletionReceipt = Readonly<{
  job: SchedulerJob;
  startedAt: Date;
  completedAt: Date;
  exitCode: number;
  reportOk: boolean;
}>;

export type LastJobCompletion = Readonly<{
  job: SchedulerJob;
  completedAt: Date;
  exitCode: number;
  reportOk: boolean;
}>;

type ChildResult = Readonly<{ exitCode: number; stdout: string; stderr: string }>;
type WitnessDependencies = Readonly<{
  now(): Date;
  runChild(file: string, args: readonly string[]): Promise<ChildResult>;
  record(receipt: JobCompletionReceipt): Promise<void>;
  stdout(value: string): void;
  stderr(value: string): void;
}>;

function validJob(value: string | undefined): value is SchedulerJob {
  return value !== undefined && SCHEDULER_JOBS.includes(value as SchedulerJob);
}

function reportOk(stdout: string): boolean {
  try {
    const value: unknown = JSON.parse(stdout.trim());
    return value !== null && typeof value === "object" && !Array.isArray(value);
  } catch {
    return false;
  }
}

async function runChild(file: string, args: readonly string[]): Promise<ChildResult> {
  return new Promise<ChildResult>((resolvePromise, reject) => {
    const child = spawn(file, [...args], { shell: false, stdio: ["inherit", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolvePromise(Object.freeze({
      exitCode: code ?? 1,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8")
    })));
  });
}

function unquote(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("'\\''", "'");
  }
  return value;
}

async function databaseUrl(): Promise<string> {
  const repoRoot = resolve(import.meta.dirname, "../../../../..");
  const content = await readFile(join(repoRoot, ".local", "dev-auth", "observation-agent.env"), "utf8");
  for (const line of content.split("\n")) {
    if (line.startsWith("OBSERVATION_DATABASE_URL=")) {
      const value = unquote(line.slice("OBSERVATION_DATABASE_URL=".length));
      if (value.length > 0) return value;
    }
  }
  throw new ObservationError("OBSERVATION_ENV_FILE_INVALID");
}

async function record(receipt: JobCompletionReceipt): Promise<void> {
  const pool = new pg.Pool({ connectionString: await databaseUrl(), max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = 2000");
      await client.query(
        `INSERT INTO observation.job_completion(
           job_completion_id,job,started_at,completed_at,exit_code,report_ok
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), receipt.job, receipt.startedAt, receipt.completedAt, receipt.exitCode, receipt.reportOk]
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function productionDependencies(): WitnessDependencies {
  return Object.freeze({
    now: () => new Date(),
    runChild,
    record,
    stdout: (value) => { process.stdout.write(value); },
    stderr: (value) => { process.stderr.write(value); }
  });
}

export async function runWitnessCommand(
  args: readonly string[],
  dependencies: WitnessDependencies = productionDependencies()
): Promise<number> {
  const separator = args.indexOf("--");
  const job = args[0] === "--job" ? args[1] : undefined;
  if (!validJob(job) || separator !== 2 || args.length < 4) {
    throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
  }
  const file = args[separator + 1];
  if (file === undefined || file.length === 0 || file.includes("\0")) {
    throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
  }
  const childArgs = args.slice(separator + 2);
  if (childArgs.some((value) => value.includes("\0"))) {
    throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
  }
  const startedAt = dependencies.now();
  const child = await dependencies.runChild(file, childArgs);
  const completedAt = dependencies.now();
  dependencies.stdout(child.stdout);
  dependencies.stderr(child.stderr);
  await dependencies.record(Object.freeze({
    job,
    startedAt,
    completedAt,
    exitCode: child.exitCode,
    reportOk: reportOk(child.stdout)
  }));
  return child.exitCode;
}

type Schedule = Readonly<{ cadenceS: number; graceS: number }>;

function isConfigurationObject(
  value: ModuleConfigurationValue | undefined
): value is ModuleConfigurationObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function schedules(thresholds: ModuleConfigurationObject): Readonly<Partial<Record<SchedulerJob, Schedule>>> {
  const configured = thresholds.schedule;
  if (!isConfigurationObject(configured)) return Object.freeze({});
  const result: Partial<Record<SchedulerJob, Schedule>> = {};
  for (const job of SCHEDULER_JOBS) {
    const row = configured[job];
    if (!isConfigurationObject(row)) continue;
    const cadenceS = row.cadence_s;
    const graceS = row.grace_s;
    if (typeof cadenceS === "number" && cadenceS > 0
      && typeof graceS === "number" && graceS >= 0) {
      result[job] = Object.freeze({ cadenceS, graceS });
    }
  }
  return Object.freeze(result);
}

export function projectJobWitnessStatus(
  completions: readonly LastJobCompletion[],
  thresholds: ModuleConfigurationObject
): Readonly<{ projections: readonly ModuleStatusProjection[]; intents: readonly SignalIntent[] }> {
  const configured = schedules(thresholds);
  const byJob = new Map(completions.map((completion) => [completion.job, completion]));
  const projections: ModuleStatusProjection[] = [];
  for (const job of SCHEDULER_JOBS) {
    const key = `scheduler.${job}`;
    if (configured[job] === undefined) {
      projections.push(Object.freeze({ kind: "template", key, template: "NO_SCHEDULE_RULED" }));
    }
    const completion = byJob.get(job);
    if (completion !== undefined) {
      projections.push(
        Object.freeze({ kind: "timestamp", key: `${key}.last_completion`, value: completion.completedAt }),
        Object.freeze({ kind: "metric", key: `${key}.exit_code`, value: completion.exitCode, unit: "COUNT" }),
        Object.freeze({
          kind: "state", key: `${key}.report`, state: completion.reportOk ? "VALID" : "FAILED"
        })
      );
    }
  }
  return Object.freeze({ projections: Object.freeze(projections), intents: Object.freeze([]) });
}

export function createScheduleTracker(agentStartedAt: Date): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
  observe(
    completions: readonly LastJobCompletion[],
    thresholds: ModuleConfigurationObject,
    at: Date
  ): readonly SignalIntent[];
}> {
  const opened = new Map<SchedulerJob, Date>();
  return Object.freeze({
    legacyCorrelationKey(signal): string | null {
      const evidence = signal.evidence as Readonly<Record<string, unknown>>;
      const job = evidence.job;
      return signal.state === "OPEN"
        && signal.class === "SCHEDULE_MISSED"
        && signal.severity === "SEVERE"
        && signal.impact_code === "IMPACT_SCHEDULE_MISSED"
        && signal.first_failed_probe_at !== null
        && signal.suspected_defect === false
        && signal.defect_kind === null
        && signal.run_ref === null
        && signal.work_item_ref === null
        && typeof job === "string"
        && validJob(job)
        && signal.component === `scheduler.${job}`
        && Object.keys(evidence).sort().join(":")
          === "cadence_s:grace_s:job:last_completed_at"
        && typeof evidence.cadence_s === "number" && Number.isFinite(evidence.cadence_s)
        && evidence.cadence_s > 0
        && typeof evidence.grace_s === "number" && Number.isFinite(evidence.grace_s)
        && evidence.grace_s >= 0
        && (evidence.last_completed_at === null
          || (typeof evidence.last_completed_at === "string"
            && Number.isFinite(new Date(evidence.last_completed_at).getTime())))
        && new Date(signal.detected_at).getTime()
          >= new Date(signal.first_failed_probe_at).getTime()
        ? `schedule:${job}`
        : null;
    },
    restore(openSignals): void {
      for (const restored of openSignals) {
        const job = (restored.signal.evidence as Readonly<Record<string, unknown>>).job;
        if (typeof job !== "string"
          || !validJob(job)
          || this.legacyCorrelationKey(restored.signal) !== restored.correlationKey
          || restored.signal.component !== `scheduler.${job}`
          || restored.correlationKey !== `schedule:${job}`
          || opened.has(job)) {
          throw new TypeError("OBSERVATION_SCHEDULE_RESTORE_INVALID");
        }
        opened.set(job, new Date(restored.signal.detected_at));
      }
    },
    observe(completions, thresholds, at) {
      const configured = schedules(thresholds);
      const byJob = new Map(completions.map((completion) => [completion.job, completion]));
      const intents: SignalIntent[] = [];
      for (const job of SCHEDULER_JOBS) {
        const schedule = configured[job];
        if (schedule === undefined) continue;
        const completion = byJob.get(job);
        const reference = completion?.completedAt ?? agentStartedAt;
        const late = (opened.has(job) && completion === undefined)
          || at.getTime() - reference.getTime() >= (schedule.cadenceS + schedule.graceS) * 1_000;
        const evidence = Object.freeze({
          job,
          cadence_s: schedule.cadenceS,
          grace_s: schedule.graceS,
          last_completed_at: completion?.completedAt.toISOString() ?? null
        });
        if (late && !opened.has(job)) {
          opened.set(job, at);
          intents.push(Object.freeze({
            correlationKey: `schedule:${job}`,
            component: `scheduler.${job}` as const,
            class: "SCHEDULE_MISSED",
            state: "OPEN",
            severity: "SEVERE",
            impactCode: "IMPACT_SCHEDULE_MISSED",
            firstFailedProbeAt: new Date(reference.getTime() + (schedule.cadenceS + schedule.graceS) * 1_000),
            detectedAt: at,
            evidence,
            suspectedDefect: false,
            defectKind: null,
            runRef: null,
            workItemRef: null
          }));
        } else if (!late && opened.has(job)) {
          const openedAt = opened.get(job)!;
          opened.delete(job);
          intents.push(Object.freeze({
            correlationKey: `schedule:${job}`,
            component: `scheduler.${job}` as const,
            class: "SCHEDULE_MISSED",
            state: "CLEARED",
            severity: "SEVERE",
            impactCode: "IMPACT_CLEARED",
            firstFailedProbeAt: openedAt,
            detectedAt: at,
            evidence: Object.freeze({
              ...evidence,
              duration_seconds: Math.max(0, (at.getTime() - openedAt.getTime()) / 1_000)
            }),
            suspectedDefect: false,
            defectKind: null,
            runRef: null,
            workItemRef: null
          }));
        }
      }
      return Object.freeze(intents);
    }
  });
}

export async function readLastJobCompletions(databaseUrl: string): Promise<readonly LastJobCompletion[]> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = 2000");
      const result = await client.query<{
        job: string; completed_at: Date; exit_code: number; report_ok: boolean;
      }>(`SELECT DISTINCT ON (job) job,completed_at,exit_code,report_ok
          FROM observation.job_completion ORDER BY job,completed_at DESC`);
      return Object.freeze(result.rows.flatMap((row) => validJob(row.job)
        ? [Object.freeze({
            job: row.job,
            completedAt: row.completed_at,
            exitCode: row.exit_code,
            reportOk: row.report_ok
          })]
        : []));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
