import type { ObservationDatabasePort } from "../../core/database.js";
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

function validJob(value: string | undefined): value is SchedulerJob {
  return value !== undefined && SCHEDULER_JOBS.includes(value as SchedulerJob);
}

export type LastJobCompletion = Readonly<{
  job: SchedulerJob;
  completedAt: Date;
  exitCode: number;
  reportOk: boolean;
}>;

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

export async function readLastJobCompletions(
  database: ObservationDatabasePort
): Promise<readonly LastJobCompletion[]> {
  return database.withClient(async (client) => {
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
  });
}
