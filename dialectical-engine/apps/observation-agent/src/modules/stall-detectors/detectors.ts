import type { ModuleStatusProjection } from "../../core/types.js";
import type { DefectCandidate } from "./lifecycle.js";

export type ClaimedWorkItem = Readonly<{
  workItemId: string;
  runId: string;
  state: "CLAIMED";
  claimDeadline: Date;
}>;

export type ReadyWorkItem = Readonly<{
  workItemId: string;
  runId: string;
  state: "READY";
}>;

export type InFlightRunProgress = Readonly<{
  runId: string;
  latestProgressSeq: number;
}>;

export type SuspiciousWorkItem = Readonly<{
  workItemId: string;
  runId: string;
  state: "DONE";
  settledArtifactPresent: false;
}>;

export type DefectDetectorInput = Readonly<{
  now: Date;
  stallRows: readonly ClaimedWorkItem[];
  readyRows: readonly ReadyWorkItem[];
  progressRows: readonly InFlightRunProgress[];
  suspiciousRows: readonly SuspiciousWorkItem[];
  thresholds: Readonly<{
    claimGraceSeconds: number;
    readyAgeSeconds: number;
    noProgressSeconds: number;
  }>;
}>;

export type DefectDetectorStatus = Readonly<{
  state: "HEALTHY" | "OPEN";
  projections: readonly ModuleStatusProjection[];
}>;

export type DefectDetectorCycle = Readonly<{
  candidates: readonly DefectCandidate[];
  status: DefectDetectorStatus;
}>;

type ProgressMemory = Readonly<{ sequence: number; lastChangedAt: Date }>;

function stallCandidate(row: ClaimedWorkItem, input: DefectDetectorInput): DefectCandidate | null {
  if (row.state !== "CLAIMED") return null;
  const failedAt = new Date(
    row.claimDeadline.getTime() + input.thresholds.claimGraceSeconds * 1_000
  );
  if (input.now.getTime() <= failedAt.getTime()) return null;
  return Object.freeze({
    correlationKey: `STALL:${row.workItemId}`,
    component: "runner",
    class: "STALL",
    severity: "SEVERE",
    impactCode: "IMPACT_STALL",
    firstFailedProbeAt: failedAt,
    detectedAt: input.now,
    evidence: Object.freeze({
      count: 1,
      state: "CLAIMED",
      claim_deadline: row.claimDeadline.toISOString(),
      grace_s: input.thresholds.claimGraceSeconds,
      health: "HEALTHY"
    }),
    suspectedDefect: true,
    defectKind: "STALL_DETECTED",
    runRef: row.runId,
    workItemRef: row.workItemId
  });
}

function queueCandidate(
  row: ReadyWorkItem,
  firstObservedAt: Date,
  input: DefectDetectorInput
): DefectCandidate | null {
  if (row.state !== "READY") return null;
  const ageSeconds = Math.max(0, (input.now.getTime() - firstObservedAt.getTime()) / 1_000);
  if (ageSeconds < input.thresholds.readyAgeSeconds) return null;
  return Object.freeze({
    correlationKey: `QUEUE_NOT_DRAINING:${row.workItemId}`,
    component: "runner",
    class: "QUEUE_NOT_DRAINING",
    severity: "SEVERE",
    impactCode: "IMPACT_QUEUE",
    firstFailedProbeAt: firstObservedAt,
    detectedAt: input.now,
    evidence: Object.freeze({
      state: "READY",
      ready_age_s: ageSeconds,
      ready_threshold_s: input.thresholds.readyAgeSeconds,
      health: "HEALTHY"
    }),
    suspectedDefect: true,
    defectKind: "STALL_DETECTED",
    runRef: row.runId,
    workItemRef: row.workItemId
  });
}

function progressCandidate(
  row: InFlightRunProgress,
  memory: ProgressMemory,
  input: DefectDetectorInput
): DefectCandidate | null {
  const silenceSeconds = Math.max(
    0,
    (input.now.getTime() - memory.lastChangedAt.getTime()) / 1_000
  );
  if (silenceSeconds < input.thresholds.noProgressSeconds) return null;
  return Object.freeze({
    correlationKey: `NO_PROGRESS:${row.runId}`,
    component: "runner",
    class: "NO_PROGRESS",
    severity: "SEVERE",
    impactCode: "IMPACT_NO_PROGRESS",
    firstFailedProbeAt: memory.lastChangedAt,
    detectedAt: input.now,
    evidence: Object.freeze({
      count: 1,
      last_progress_seq: row.latestProgressSeq,
      silence_s: silenceSeconds,
      silence_threshold_s: input.thresholds.noProgressSeconds,
      health: "HEALTHY"
    }),
    suspectedDefect: true,
    defectKind: "SILENT_NOOP",
    runRef: row.runId,
    workItemRef: null
  });
}

function suspiciousCandidate(
  row: SuspiciousWorkItem,
  input: DefectDetectorInput
): DefectCandidate | null {
  if (row.state !== "DONE" || row.settledArtifactPresent !== false) return null;
  return Object.freeze({
    correlationKey: `SUSPICIOUS_SUCCESS:${row.workItemId}`,
    component: "runner",
    class: "SUSPICIOUS_SUCCESS",
    severity: "SEVERE",
    impactCode: "IMPACT_SUSPICIOUS_SUCCESS",
    firstFailedProbeAt: input.now,
    detectedAt: input.now,
    evidence: Object.freeze({
      count: 1,
      state: "DONE",
      artifact_present: false,
      health: "HEALTHY"
    }),
    suspectedDefect: true,
    defectKind: "SUSPICIOUS_SUCCESS",
    runRef: row.runId,
    workItemRef: row.workItemId
  });
}

export function createDefectDetectorTracker(): Readonly<{
  observe(input: DefectDetectorInput): DefectDetectorCycle;
}> {
  const readyFirstObserved = new Map<string, Date>();
  const progressMemory = new Map<string, ProgressMemory>();
  return Object.freeze({
    observe(input) {
      const readyIds = new Set(input.readyRows.map((row) => row.workItemId));
      for (const workItemId of readyFirstObserved.keys()) {
        if (!readyIds.has(workItemId)) readyFirstObserved.delete(workItemId);
      }
      for (const row of input.readyRows) {
        if (row.state === "READY" && !readyFirstObserved.has(row.workItemId)) {
          readyFirstObserved.set(row.workItemId, input.now);
        }
      }

      const progressRunIds = new Set(input.progressRows.map((row) => row.runId));
      for (const runId of progressMemory.keys()) {
        if (!progressRunIds.has(runId)) progressMemory.delete(runId);
      }
      for (const row of input.progressRows) {
        const previous = progressMemory.get(row.runId);
        if (previous === undefined || row.latestProgressSeq > previous.sequence) {
          progressMemory.set(row.runId, Object.freeze({
            sequence: row.latestProgressSeq,
            lastChangedAt: input.now
          }));
        }
      }

      const candidates = Object.freeze([
        ...input.stallRows.flatMap((row) => {
          const candidate = stallCandidate(row, input);
          return candidate === null ? [] : [candidate];
        }),
        ...input.readyRows.flatMap((row) => {
          const firstObservedAt = readyFirstObserved.get(row.workItemId);
          const candidate = firstObservedAt === undefined
            ? null
            : queueCandidate(row, firstObservedAt, input);
          return candidate === null ? [] : [candidate];
        }),
        ...input.progressRows.flatMap((row) => {
          const memory = progressMemory.get(row.runId);
          const candidate = memory === undefined ? null : progressCandidate(row, memory, input);
          return candidate === null ? [] : [candidate];
        }),
        ...input.suspiciousRows.flatMap((row) => {
          const candidate = suspiciousCandidate(row, input);
          return candidate === null ? [] : [candidate];
        })
      ]);

      const readyAges = [...readyFirstObserved.values()].map((firstObservedAt) =>
        Math.max(0, (input.now.getTime() - firstObservedAt.getTime()) / 1_000));
      const count = (signalClass: DefectCandidate["class"]) =>
        candidates.filter((candidate) => candidate.class === signalClass).length;
      const projections: ModuleStatusProjection[] = [
        Object.freeze({
          kind: "metric", key: "runner.oldest_ready",
          value: readyAges.length === 0 ? 0 : Math.max(...readyAges),
          unit: "SECONDS", observedAt: input.now
        }),
        Object.freeze({
          kind: "metric", key: "runner.stalled_items", value: count("STALL"),
          unit: "COUNT", observedAt: input.now
        }),
        Object.freeze({
          kind: "metric", key: "runner.no_progress_runs", value: count("NO_PROGRESS"),
          unit: "COUNT", observedAt: input.now
        }),
        Object.freeze({
          kind: "metric", key: "runner.suspicious_success", value: count("SUSPICIOUS_SUCCESS"),
          unit: "COUNT", observedAt: input.now
        })
      ];
      return Object.freeze({
        candidates,
        status: Object.freeze({
          state: candidates.length === 0 ? "HEALTHY" : "OPEN",
          projections: Object.freeze(projections)
        })
      });
    }
  });
}
