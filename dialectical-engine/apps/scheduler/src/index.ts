import type { Pool } from "pg";
import { evaluate, type OperatorResolution } from "@debateai/propagation";
import { decideReplayEviction, ServeRepository } from "@debateai/serve";
import { LivenessRepository } from "@debateai/liveness";
import { readLivenessPolicy } from "@debateai/register";
import {
  emit,
  getObsContext,
  notApplicable,
  runWithObsContext,
} from "@debateai/obs-capture";
import {
  SettlementRepository,
  type SettlementOutcomeInput,
  type SettlementPolicy,
  type SettlementResult
} from "@debateai/settlement";

export interface ReplaySelfTestReport {
  readonly checked: number;
  readonly evicted: readonly string[];
}

export interface LivenessSweepReport {
  readonly checked: number;
  readonly archived: readonly string[];
}

export const SCHEDULER_JOB_NAMES = Object.freeze([
  "replay-self-test",
  "liveness-sweep",
  "settlement-watch",
] as const);
export type SchedulerJobName = (typeof SCHEDULER_JOB_NAMES)[number];

export async function runReplaySelfTest(pool: Pool): Promise<ReplaySelfTestReport> {
  const records = await pool.query<{
    served_number_id: string;
    stored: number;
    node_id: string;
    tau: number;
    arrow_order: readonly string[];
    cluster_records: readonly unknown[];
    operator_by_parent: readonly OperatorResolution[];
  }>(
    `SELECT number.served_number_id, number.value AS stored,
            strength.node_id, judgement.tau, propagation.arrow_order,
            propagation.cluster_records, propagation.operator_by_parent
     FROM serve.served_number AS number
     JOIN serve.served_number_event AS latest
       ON latest.served_number_id = number.served_number_id
     JOIN ledger.propagation_run AS propagation
       ON propagation.propagation_run_id = number.provenance_ref
     JOIN ledger.node_strength_record AS strength
       ON strength.propagation_run_id = propagation.propagation_run_id
     JOIN LATERAL (
       SELECT tau FROM ledger.reduced_judgement
       WHERE node_id = strength.node_id ORDER BY at_seq DESC LIMIT 1
     ) AS judgement ON true
     WHERE latest.at_seq = (
       SELECT max(event.at_seq) FROM serve.served_number_event AS event
       WHERE event.served_number_id = number.served_number_id
     ) AND latest.status = 'PRESENT'
     ORDER BY number.served_number_id`
  );
  const evicted: string[] = [];
  const serve = new ServeRepository(pool);
  for (const row of records.rows) {
    if (row.arrow_order.length > 0) {
      throw new TypeError("CONTINUOUS_REPLAY_SHAPE_NOT_IMPLEMENTED");
    }
    const outcome = evaluate({
      nodes: [{ nodeId: row.node_id, baseStrength: Number(row.tau) }],
      arrows: [],
      arrowOrder: row.arrow_order,
      operatorResolutions: row.operator_by_parent,
      clusterRecords: row.cluster_records
    });
    const decision = decideReplayEviction({
      stored: Number(row.stored),
      recomputed: outcome.strengths[0]!.strength,
      servedNumberId: row.served_number_id
    });
    if (decision.kind === "EVICT") {
      await serve.recordReplayEviction(decision.servedNumberId);
      evicted.push(decision.servedNumberId);
    }
  }
  return { checked: records.rows.length, evicted };
}

export async function runLivenessSweep(
  pool: Pool,
  now = new Date(),
): Promise<LivenessSweepReport> {
  const versions = await pool.query<{ register_version: string }>(
    `SELECT DISTINCT register_version::text FROM core.run ORDER BY register_version`
  );
  const archived: string[] = [];
  const liveness = new LivenessRepository(pool);
  for (const row of versions.rows) {
    const policy = await readLivenessPolicy(pool, Number(row.register_version), "standard");
    archived.push(...await liveness.sweep(now, policy));
  }
  return Object.freeze({
    checked: versions.rows.length,
    archived: Object.freeze(archived),
  });
}

export async function runReaper(_pool: Pool): Promise<never> {
  throw new Error("S00_SCAFFOLD_ONLY: job:reaper implementation belongs to its later slice");
}

export interface SettlementWatchReport {
  readonly checked: number;
  readonly settled: number;
  readonly superseded: number;
  readonly incomplete: number;
  readonly results: readonly SettlementResult[];
}

export interface SchedulerJobReportMap {
  readonly "replay-self-test": ReplaySelfTestReport;
  readonly "liveness-sweep": LivenessSweepReport;
  readonly "settlement-watch": SettlementWatchReport;
}

const LIFECYCLE_CONTEXT = Object.freeze({
  run_ref: notApplicable("run"),
  work_item_ref: notApplicable("work_item"),
  node_ref: notApplicable("node"),
  attempt_ref: notApplicable("attempt"),
  ledger_ref: notApplicable("ledger_entry"),
});
const ZONED_LIFECYCLE_CONTEXT = Object.freeze({
  ...LIFECYCLE_CONTEXT,
  zone_context: true,
});

function lifecycleContext():
  | typeof LIFECYCLE_CONTEXT
  | typeof ZONED_LIFECYCLE_CONTEXT {
  try {
    const outerContext = getObsContext();
    if (outerContext === undefined) return LIFECYCLE_CONTEXT;
    const descriptor = Object.getOwnPropertyDescriptor(
      outerContext,
      "zone_context",
    );
    if (descriptor === undefined) return LIFECYCLE_CONTEXT;
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      return ZONED_LIFECYCLE_CONTEXT;
    }
    return descriptor.value === false
      ? LIFECYCLE_CONTEXT
      : ZONED_LIFECYCLE_CONTEXT;
  } catch {
    return ZONED_LIFECYCLE_CONTEXT;
  }
}

function emitLifecycle(payload: Readonly<Record<string, unknown>>): void {
  runWithObsContext(lifecycleContext(), () => emit(payload));
}

function isPositiveReport<Name extends SchedulerJobName>(
  name: Name,
  report: SchedulerJobReportMap[Name],
): boolean {
  if (name === "replay-self-test") {
    return (report as ReplaySelfTestReport).evicted.length > 0;
  }
  if (name === "liveness-sweep") {
    return (report as LivenessSweepReport).archived.length > 0;
  }
  return (report as SettlementWatchReport).settled > 0;
}

export async function runJobWithLifecycle<Name extends SchedulerJobName>(
  name: Name,
  fn: () => Promise<SchedulerJobReportMap[Name]>,
): Promise<SchedulerJobReportMap[Name]> {
  emitLifecycle(Object.freeze({
    code: "OBS_SCHEDULER_JOB_STARTED",
    template_parameters: Object.freeze({ job: name }),
  }));
  try {
    const report = await fn();
    if (isPositiveReport(name, report)) {
      emitLifecycle(Object.freeze({
        code: "OBS_SCHEDULER_JOB_SUCCEEDED",
        template_parameters: Object.freeze({ job: name }),
      }));
    } else {
      emitLifecycle(Object.freeze({
        code: "OBS_SCHEDULER_JOB_NOOP",
        template_parameters: Object.freeze({ job: name, count: report.checked }),
      }));
    }
    return report;
  } catch (error) {
    emitLifecycle(Object.freeze({
      code: "OBS_SCHEDULER_JOB_FAILED",
      template_parameters: Object.freeze({ job: name }),
      error,
    }));
    throw error;
  }
}

// The resolver adapter supplies immutable outcome envelopes. Keeping that seam
// explicit prevents the scheduler from manufacturing an outcome or policy.
export async function runSettlementWatch(
  pool: Pool,
  outcomes: readonly SettlementOutcomeInput[] = [],
  policy?: SettlementPolicy
): Promise<SettlementWatchReport> {
  if (outcomes.length > 0 && policy === undefined) {
    throw new TypeError("SETTLEMENT_POLICY_REQUIRED: resolver outcomes require a registered scoring policy");
  }
  const repository = new SettlementRepository(pool);
  const results: SettlementResult[] = [];
  for (const outcome of outcomes) results.push(await repository.settle(outcome, policy!));
  return Object.freeze({
    checked: outcomes.length,
    settled: results.filter((result) => result.kind === "SETTLED").length,
    superseded: results.filter((result) => result.kind === "SUPERSEDED_ATTEMPT").length,
    incomplete: results.filter((result) => result.kind === "INCOMPLETE_RUN_SKIPPED").length,
    results: Object.freeze(results)
  });
}
