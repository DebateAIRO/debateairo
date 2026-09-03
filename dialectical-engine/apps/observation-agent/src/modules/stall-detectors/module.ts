import { loadObservationAgentEnvironment } from "../../../../../packages/register/src/runtime-environment.js";
import type {
  Module,
  ModuleConfigurationObject,
  ProbeObservation,
  SignalIntent
} from "../../core/types.js";
import {
  readDefectInputs,
  type DefectQueryInputs
} from "../defect-interface/queries.js";
import { createDefectDetectorTracker } from "./detectors.js";
import {
  createWorkerHeartbeatTracker,
  projectWorkerHeartbeat,
  readWorkerHeartbeat,
  type WorkerHeartbeatSnapshot
} from "./heartbeat.js";
import { createDefectLifecycle } from "./lifecycle.js";

type HeartbeatInput = Parameters<typeof readWorkerHeartbeat>[0];

export type StallDetectorDependencies = Readonly<{
  tokenPath(): string | undefined;
  readHeartbeat(input: HeartbeatInput): Promise<WorkerHeartbeatSnapshot>;
  readDefectInputs(databaseUrl: string): Promise<DefectQueryInputs>;
}>;

const productionDependencies: StallDetectorDependencies = Object.freeze({
  tokenPath: () => loadObservationAgentEnvironment().OBSERVATION_HATCHET_TOKEN_PATH,
  readHeartbeat: readWorkerHeartbeat,
  readDefectInputs
});

function positiveNumber(input: ModuleConfigurationObject, key: string, fallback: number): number {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function stringValue(input: ModuleConfigurationObject, key: string, fallback: string): string {
  const value = input[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function detectorObservation(input: Readonly<{
  now: Date;
  eligible: boolean;
  status: ReturnType<ReturnType<typeof createDefectDetectorTracker>["observe"]>["status"];
}>): ProbeObservation {
  const state = input.eligible ? input.status.state : "INELIGIBLE";
  return Object.freeze({
    component: "runner",
    ok: input.eligible && input.status.state === "HEALTHY",
    class: "STALL",
    probe: "safe_view_detector",
    lastStatus: state,
    observedAt: input.now,
    management: "module",
    statusState: state,
    status: input.status.projections
  });
}

export function createStallDetectorsModule(
  dependencies: StallDetectorDependencies = productionDependencies
): Module {
  const heartbeatTracker = createWorkerHeartbeatTracker();
  const defectDetector = createDefectDetectorTracker();
  const defectLifecycle = createDefectLifecycle();
  let lastDetectorAt: number | null = null;
  let pendingIntents: readonly SignalIntent[] = Object.freeze([]);

  return Object.freeze({
    name: "stall-detectors",
    cadence: Object.freeze({ intervalMs: 10_000, timeoutMs: 2_000 }),
    targetFragmentBasename: "OBS-03.json",
    async probe(ctx) {
      const heartbeatThresholdSeconds = positiveNumber(ctx.thresholds, "heartbeat_age_s", 30);
      const snapshot = await dependencies.readHeartbeat({
        workerListUrl: stringValue(
          ctx.thresholds,
          "worker_list_url",
          "http://127.0.0.1:8888/api/v1/tenants/main/worker"
        ),
        workerRef: stringValue(ctx.thresholds, "worker_ref", "debateai-dev-runner"),
        tokenPath: dependencies.tokenPath(),
        now: ctx.now,
        timeoutMs: Math.min(2_000, ctx.timeoutMs),
        heartbeatThresholdSeconds
      });
      const heartbeatIntents = heartbeatTracker.observe(snapshot);
      const detectorIntervalMs = positiveNumber(ctx.thresholds, "detector_interval_ms", 15_000);
      if (lastDetectorAt !== null && ctx.now.getTime() - lastDetectorAt < detectorIntervalMs) {
        pendingIntents = heartbeatIntents;
        return Object.freeze([projectWorkerHeartbeat(snapshot)]);
      }
      lastDetectorAt = ctx.now.getTime();

      let queryInputs: DefectQueryInputs = Object.freeze({
        stallRows: Object.freeze([]),
        readyRows: Object.freeze([]),
        progressRows: Object.freeze([]),
        suspiciousRows: Object.freeze([])
      });
      let postgres: "UP" | "UNKNOWN" = "UP";
      try {
        queryInputs = await dependencies.readDefectInputs(ctx.databaseUrl);
      } catch {
        postgres = "UNKNOWN";
      }
      const detected = defectDetector.observe({
        now: ctx.now,
        ...queryInputs,
        thresholds: Object.freeze({
          claimGraceSeconds: positiveNumber(ctx.thresholds, "claim_grace_s", 15),
          readyAgeSeconds: positiveNumber(ctx.thresholds, "ready_age_s", 120),
          noProgressSeconds: positiveNumber(ctx.thresholds, "no_progress_s", 300)
        })
      });
      const health = Object.freeze({
        runner: snapshot.state,
        postgres,
        hatchet: snapshot.state === "UNKNOWN" ? "UNKNOWN" as const : "UP" as const
      });
      const eligible = health.runner === "FRESH"
        && health.postgres === "UP"
        && health.hatchet === "UP";
      const defectIntents = defectLifecycle.reconcile(detected.candidates, health, ctx.now);
      pendingIntents = Object.freeze([...defectIntents, ...heartbeatIntents]);
      return Object.freeze([
        projectWorkerHeartbeat(snapshot),
        detectorObservation({ now: ctx.now, eligible, status: detected.status })
      ]);
    },
    samples(observations, ctx) {
      return Object.freeze(observations.flatMap((observation) =>
        (observation.status ?? []).flatMap((projection) =>
          projection.kind === "metric"
            ? [Object.freeze({
                metricKey: projection.key,
                value: projection.value,
                observedAt: ctx.now
              })]
            : [])));
    },
    signals() {
      const intents = pendingIntents;
      pendingIntents = Object.freeze([]);
      return intents;
    }
  });
}

export default createStallDetectorsModule();
