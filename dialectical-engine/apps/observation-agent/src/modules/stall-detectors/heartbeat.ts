import { z } from "zod";
import { readCustodiedSecretFile } from "../../core/custody.js";
import { assertLoopbackUrl } from "../../core/loopback.js";
import type { ObservationSignal } from "../../core/signals.js";
import type {
  ModuleStatusProjection,
  ProbeObservation,
  RestoredOpenSignal,
  SignalIntent
} from "../../core/types.js";

const workerSchema = z.object({
  name: z.string().min(1).max(128),
  lastHeartbeatAt: z.iso.datetime()
}).passthrough();

const workerListSchema = z.object({
  rows: z.array(workerSchema)
}).passthrough();

export type WorkerHeartbeatSnapshot = Readonly<{
  state: "UNKNOWN" | "FRESH" | "STALE";
  workerRef: string;
  heartbeatAgeSeconds: number | null;
  heartbeatThresholdSeconds: number;
  lastHeartbeatAt: Date | null;
  observedAt: Date;
  evidence: Readonly<{
    health: "UNKNOWN" | "FRESH" | "STALE";
    reason?: "HATCHET_READ_UNAVAILABLE";
  }>;
}>;

type ReadWorkerHeartbeatInput = Readonly<{
  workerListUrl: string;
  workerRef: string;
  tokenPath: string | undefined;
  now: Date;
  timeoutMs: number;
  heartbeatThresholdSeconds?: number;
  readToken?: (path: string) => Promise<string>;
  fetch?: typeof globalThis.fetch;
}>;

function unknown(input: ReadWorkerHeartbeatInput, threshold: number): WorkerHeartbeatSnapshot {
  return Object.freeze({
    state: "UNKNOWN",
    workerRef: input.workerRef,
    heartbeatAgeSeconds: null,
    heartbeatThresholdSeconds: threshold,
    lastHeartbeatAt: null,
    observedAt: input.now,
    evidence: Object.freeze({
      health: "UNKNOWN",
      reason: "HATCHET_READ_UNAVAILABLE"
    })
  });
}

export async function readWorkerHeartbeat(
  input: ReadWorkerHeartbeatInput
): Promise<WorkerHeartbeatSnapshot> {
  const threshold = input.heartbeatThresholdSeconds ?? 30;
  // DL7-F1: the pin is checked before the token is read and before any request
  // is attempted, and it is NOT swallowed into UNKNOWN below — a policy that
  // names another host is a refusal to act on, not an unavailable probe.
  assertLoopbackUrl(input.workerListUrl);
  if (input.tokenPath === undefined) return unknown(input, threshold);
  try {
    const token = (await (input.readToken ?? readCustodiedSecretFile)(input.tokenPath)).trim();
    if (token.length === 0) return unknown(input, threshold);
    const response = await (input.fetch ?? globalThis.fetch)(input.workerListUrl, {
      method: "GET",
      headers: Object.freeze({
        authorization: `Bearer ${token}`,
        accept: "application/json",
        connection: "close",
        "user-agent": "dialectical-engine-observation-agent"
      }),
      signal: AbortSignal.timeout(Math.min(2_000, Math.max(1, input.timeoutMs)))
    });
    if (!response.ok) return unknown(input, threshold);
    const workers = workerListSchema.parse(await response.json()).rows;
    const worker = workers.find((candidate) => candidate.name === input.workerRef);
    if (worker === undefined) return unknown(input, threshold);
    const lastHeartbeatAt = new Date(worker.lastHeartbeatAt);
    const heartbeatAgeSeconds = Math.max(
      0,
      (input.now.getTime() - lastHeartbeatAt.getTime()) / 1_000
    );
    const state = heartbeatAgeSeconds > threshold ? "STALE" : "FRESH";
    return Object.freeze({
      state,
      workerRef: input.workerRef,
      heartbeatAgeSeconds,
      heartbeatThresholdSeconds: threshold,
      lastHeartbeatAt,
      observedAt: input.now,
      evidence: Object.freeze({ health: state })
    });
  } catch {
    return unknown(input, threshold);
  }
}

export function projectWorkerHeartbeat(snapshot: WorkerHeartbeatSnapshot): ProbeObservation {
  const firstFailedProbeAt = snapshot.state === "STALE" && snapshot.lastHeartbeatAt !== null
    ? new Date(snapshot.lastHeartbeatAt.getTime() + snapshot.heartbeatThresholdSeconds * 1_000)
    : null;
  const status: ModuleStatusProjection[] = [Object.freeze({
    kind: "state",
    key: "runner.heartbeat",
    state: snapshot.state,
    observedAt: snapshot.observedAt
  })];
  if (snapshot.heartbeatAgeSeconds !== null) {
    status.push(Object.freeze({
      kind: "metric",
      key: "runner.heartbeat_age",
      value: snapshot.heartbeatAgeSeconds,
      unit: "SECONDS",
      observedAt: snapshot.observedAt
    }));
  }
  status.push(Object.freeze({
    kind: "timestamp",
    key: "runner.first_failed_probe_at",
    value: firstFailedProbeAt
  }));
  status.push(Object.freeze({
    kind: "timestamp",
    key: "runner.detected_at",
    value: snapshot.state === "STALE" ? snapshot.observedAt : null
  }));
  return Object.freeze({
    component: "runner",
    ok: snapshot.state === "FRESH",
    class: "WORKER_LOST",
    probe: "hatchet_worker_list",
    lastStatus: snapshot.state === "UNKNOWN"
      ? snapshot.evidence.reason ?? "UNKNOWN"
      : snapshot.state,
    observedAt: snapshot.observedAt,
    management: "module",
    statusState: snapshot.state,
    status: Object.freeze(status)
  });
}

export function createWorkerHeartbeatTracker(): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
  observe(snapshot: WorkerHeartbeatSnapshot): readonly SignalIntent[];
}> {
  let openedAt: Date | null = null;
  let firstFailedAt: Date | null = null;
  return Object.freeze({
    legacyCorrelationKey(signal): string | null {
      const evidence = signal.evidence as Readonly<Record<string, unknown>>;
      const workerRef = evidence.worker_ref;
      return signal.component === "runner"
        && signal.state === "OPEN"
        && signal.class === "WORKER_LOST"
        && signal.severity === "SEVERE"
        && signal.impact_code === "IMPACT_WORKER_LOST"
        && signal.first_failed_probe_at !== null
        && signal.suspected_defect === false
        && signal.defect_kind === null
        && signal.run_ref === null
        && signal.work_item_ref === null
        && typeof workerRef === "string"
        && workerRef.length > 0
        && Object.keys(evidence).sort().join(":")
          === "health:heartbeat_age_s:heartbeat_threshold_s:worker_ref"
        && typeof evidence.heartbeat_age_s === "number"
        && Number.isFinite(evidence.heartbeat_age_s)
        && typeof evidence.heartbeat_threshold_s === "number"
        && Number.isFinite(evidence.heartbeat_threshold_s)
        && evidence.heartbeat_threshold_s > 0
        && evidence.heartbeat_age_s >= evidence.heartbeat_threshold_s
        && evidence.health === "STALE"
        ? `worker:${workerRef}`
        : null;
    },
    restore(openSignals): void {
      if (openSignals.length > 1) throw new TypeError("OBSERVATION_HEARTBEAT_RESTORE_INVALID");
      const restored = openSignals[0];
      if (restored === undefined) return;
      if (this.legacyCorrelationKey(restored.signal) !== restored.correlationKey) {
        throw new TypeError("OBSERVATION_HEARTBEAT_RESTORE_INVALID");
      }
      openedAt = new Date(restored.signal.detected_at);
      firstFailedAt = restored.signal.first_failed_probe_at === null
        ? null
        : new Date(restored.signal.first_failed_probe_at);
    },
    observe(snapshot) {
      if (snapshot.state === "UNKNOWN") return Object.freeze([]);
      if (snapshot.state === "STALE") {
        if (openedAt !== null || snapshot.heartbeatAgeSeconds === null
          || snapshot.lastHeartbeatAt === null) return Object.freeze([]);
        openedAt = snapshot.observedAt;
        firstFailedAt = new Date(
          snapshot.lastHeartbeatAt.getTime() + snapshot.heartbeatThresholdSeconds * 1_000
        );
        return Object.freeze([Object.freeze({
          correlationKey: `worker:${snapshot.workerRef}`,
          component: "runner",
          class: "WORKER_LOST",
          state: "OPEN",
          severity: "SEVERE",
          impactCode: "IMPACT_WORKER_LOST",
          firstFailedProbeAt: firstFailedAt,
          detectedAt: snapshot.observedAt,
          evidence: Object.freeze({
            worker_ref: snapshot.workerRef,
            heartbeat_age_s: snapshot.heartbeatAgeSeconds,
            heartbeat_threshold_s: snapshot.heartbeatThresholdSeconds,
            health: "STALE"
          }),
          suspectedDefect: false,
          defectKind: null,
          runRef: null,
          workItemRef: null
        })]);
      }
      if (openedAt === null) return Object.freeze([]);
      const durationSeconds = Math.max(
        0,
        (snapshot.observedAt.getTime() - openedAt.getTime()) / 1_000
      );
      const intent: SignalIntent = Object.freeze({
        correlationKey: `worker:${snapshot.workerRef}`,
        component: "runner",
        class: "WORKER_LOST",
        state: "CLEARED",
        severity: "SEVERE",
        impactCode: "IMPACT_CLEARED",
        firstFailedProbeAt: firstFailedAt,
        detectedAt: snapshot.observedAt,
        evidence: Object.freeze({ duration_seconds: durationSeconds }),
        suspectedDefect: false,
        defectKind: null,
        runRef: null,
        workItemRef: null
      });
      openedAt = null;
      firstFailedAt = null;
      return Object.freeze([intent]);
    }
  });
}
