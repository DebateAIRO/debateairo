import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  ObservationDatabasePort,
  ObservationQueryClient
} from "../../apps/observation-agent/src/core/database.js";
import { ObservationModuleRuntime } from "../../apps/observation-agent/src/core/runtime.js";
import type { ObservationSignal } from "../../apps/observation-agent/src/core/signals.js";
import { createStallDetectorsModule } from "../../apps/observation-agent/src/modules/stall-detectors/module.js";

const detectorPath = "apps/observation-agent/src/modules/stall-detectors/detectors.ts";
const lifecyclePath = "apps/observation-agent/src/modules/stall-detectors/lifecycle.ts";

async function modules() {
  if (!existsSync(detectorPath) || !existsSync(lifecyclePath)) return null;
  return {
    detectors: await import("../../apps/observation-agent/src/modules/stall-detectors/detectors.js"),
    lifecycle: await import("../../apps/observation-agent/src/modules/stall-detectors/lifecycle.js")
  };
}

const runRef = "32000000-0000-4000-8000-000000000001";
const workItemRef = "32000000-0000-4000-8000-000000000002";
const origin = 1_800_100_000_000;
const at = (seconds: number) => new Date(origin + seconds * 1_000);
const healthy = { runner: "FRESH" as const, postgres: "UP" as const, hatchet: "UP" as const };

function input(now: Date) {
  return {
    now, stallRows: [], readyRows: [], progressRows: [], suspiciousRows: [],
    thresholds: { claimGraceSeconds: 15, readyAgeSeconds: 120, noProgressSeconds: 300 }
  };
}

function clocks(input: Readonly<{
  ready?: readonly (readonly [string, Date])[];
  progress?: readonly (readonly [string, Readonly<{ sequence: number; at: Date }>])[];
  exhausted?: readonly ("READY" | "PROGRESS")[];
}> = {}) {
  return {
    readyFirstObserved: new Map(input.ready ?? []),
    progressLastChanged: new Map(input.progress ?? []),
    exhausted: new Set(input.exhausted ?? [])
  };
}

const clockKeys = Object.freeze({
  ready: "runner.ready_identity",
  progressIdentity: "runner.progress_identity",
  progressSequence: "runner.progress_sequence"
});

function encodedUuid(uuid: string): string {
  return BigInt(`0x${uuid.replaceAll("-", "")}`).toString(10);
}

function fixtureUuid(value: number): string {
  return `3a000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

function capacityClockDatabase(family: "READY" | "PROGRESS") {
  let unavailable = false;
  const identities = [family === "READY" ? workItemRef : runRef];
  for (let value = 1; value < 8_640; value += 1) identities.push(fixtureUuid(value));
  const rows = new Map<string, {
    metric_key: string;
    bucket: number;
    observed_at: Date;
    value: string;
  }>();
  for (const [bucket, identity] of identities.entries()) {
    if (family === "READY") {
      rows.set(`${clockKeys.ready}:${bucket}`, {
        metric_key: clockKeys.ready, bucket, observed_at: at(0), value: encodedUuid(identity)
      });
    } else {
      rows.set(`${clockKeys.progressIdentity}:${bucket}`, {
        metric_key: clockKeys.progressIdentity,
        bucket,
        observed_at: at(0),
        value: encodedUuid(identity)
      });
      rows.set(`${clockKeys.progressSequence}:${bucket}`, {
        metric_key: clockKeys.progressSequence, bucket, observed_at: at(0), value: "0"
      });
    }
  }
  const database: ObservationDatabasePort = Object.freeze({
    async withClient<T>(operation: (client: ObservationQueryClient) => Promise<T>): Promise<T> {
      if (unavailable) throw new Error("TEST_DATABASE_UNAVAILABLE");
      const query = (async (text: string, values?: readonly unknown[]) => {
        if (text.includes("SELECT metric_key,bucket,observed_at,value::text AS value")) {
          return { rows: [...rows.values()] };
        }
        if (text.includes("INSERT INTO observation.sample_ring")) {
          const metricKey = /SELECT '([^']+)'/u.exec(text)?.[1];
          if (metricKey === undefined) throw new Error("TEST_CLOCK_KEY_MISSING");
          const [buckets, times, encoded] = values as [number[], Date[], string[]];
          for (let index = 0; index < buckets.length; index += 1) {
            const bucket = buckets[index]!;
            rows.set(`${metricKey}:${bucket}`, {
              metric_key: metricKey,
              bucket,
              observed_at: times[index]!,
              value: encoded[index]!
            });
          }
        }
        return { rows: [] };
      }) as ObservationQueryClient["query"];
      return operation(Object.freeze({ query }));
    }
  });
  return Object.freeze({
    database,
    identities,
    newIdentity: fixtureUuid(8_640),
    fail: () => { unavailable = true; }
  });
}

async function runExhaustedFamilyLifecycle(family: "READY" | "PROGRESS") {
  const fixture = capacityClockDatabase(family);
  let phase: "OPEN" | "EXHAUSTED" | "PERSISTING" | "RECOVERED" = "OPEN";
  const suspiciousWorkItem = "32000000-0000-4000-8000-000000000099";
  const module = createStallDetectorsModule({
    tokenPath: () => "/test/token",
    readHeartbeat: async ({ now }) => Object.freeze({
      state: "FRESH" as const,
      workerRef: "debateai-dev-runner",
      heartbeatAgeSeconds: 1,
      heartbeatThresholdSeconds: 30,
      lastHeartbeatAt: new Date(now.getTime() - 1_000),
      observedAt: now,
      evidence: Object.freeze({ health: "FRESH" as const })
    }),
    readDefectInputs: async () => Object.freeze({
      stallRows: Object.freeze([]),
      readyRows: family !== "READY" ? Object.freeze([]) : phase === "OPEN" || phase === "PERSISTING"
        ? Object.freeze([{ workItemId: workItemRef, runId: runRef, state: "READY" as const }])
        : phase === "EXHAUSTED"
          ? Object.freeze([...fixture.identities, fixture.newIdentity].map((workItemId) =>
              Object.freeze({ workItemId, runId: runRef, state: "READY" as const })))
          : Object.freeze([]),
      progressRows: family !== "PROGRESS" ? Object.freeze([]) : phase === "OPEN"
        || phase === "PERSISTING"
        ? Object.freeze([{ runId: runRef, latestProgressSeq: 0 }])
        : phase === "EXHAUSTED"
          ? Object.freeze([...fixture.identities, fixture.newIdentity].map((runId) =>
              Object.freeze({ runId, latestProgressSeq: 0 })))
          : Object.freeze([{ runId: runRef, latestProgressSeq: 1 }]),
      suspiciousRows: phase === "EXHAUSTED" && family === "READY"
        ? Object.freeze([{
            workItemId: suspiciousWorkItem,
            runId: runRef,
            state: "DONE" as const,
            settledArtifactPresent: false as const
          }])
        : Object.freeze([])
    })
  });
  const emitted: ObservationSignal[] = [];
  let sequence = 0;
  let signalId = 0;
  const runtime = new ObservationModuleRuntime({
    nextSequence: () => ++sequence,
    nextSignalId: () => `3b000000-0000-4000-8000-${String(++signalId).padStart(12, "0")}`,
    sampleStore: Object.freeze({ async write() {} }),
    emitSignal: async (signal) => { emitted.push(signal); },
    modules: Object.freeze([module])
  });
  const run = (seconds: number) => runtime.run(Object.freeze({
    modules: Object.freeze([module]),
    now: at(seconds),
    timeoutMs: 2_000,
    database: fixture.database,
    stateDir: "/tmp/obs-03-family-hold",
    repoRoot: "/tmp/obs-03-family-hold-repo",
    targets: Object.freeze([]),
    thresholdVersion: 4,
    moduleThresholds: Object.freeze({
      "stall-detectors": Object.freeze({
        detector_interval_ms: 1,
        ready_age_s: 120,
        no_progress_s: 300
      })
    })
  }));
  const openAt = family === "READY" ? 120 : 300;
  const signalClass = family === "READY" ? "QUEUE_NOT_DRAINING" : "NO_PROGRESS";

  await run(openAt);
  const original = emitted.find((signal) => signal.class === signalClass)!;
  expect(original).toMatchObject({ state: "OPEN", suspected_defect: true });

  phase = "EXHAUSTED";
  await run(openAt + 10);
  expect(emitted.filter((signal) => signal.class === signalClass)).toEqual([original]);
  if (family === "READY") {
    expect(emitted).toContainEqual(expect.objectContaining({
      class: "SUSPICIOUS_SUCCESS", state: "OPEN"
    }));
  }

  phase = "PERSISTING";
  await run(openAt + 20);
  expect(emitted.filter((signal) => signal.class === signalClass)).toEqual([original]);

  phase = "RECOVERED";
  await run(openAt + 30);
  expect(emitted.filter((signal) => signal.class === signalClass)).toEqual([
    original,
    expect.objectContaining({
      state: "CLEARED",
      suspected_defect: true,
      clears_signal_id: original.signal_id
    })
  ]);
}

async function runInfrastructureFailureLifecycle(family: "READY" | "PROGRESS") {
  const fixture = capacityClockDatabase(family);
  const module = createStallDetectorsModule({
    tokenPath: () => "/test/token",
    readHeartbeat: async ({ now }) => Object.freeze({
      state: "FRESH" as const,
      workerRef: "debateai-dev-runner",
      heartbeatAgeSeconds: 1,
      heartbeatThresholdSeconds: 30,
      lastHeartbeatAt: new Date(now.getTime() - 1_000),
      observedAt: now,
      evidence: Object.freeze({ health: "FRESH" as const })
    }),
    readDefectInputs: async () => Object.freeze({
      stallRows: Object.freeze([]),
      readyRows: family === "READY"
        ? Object.freeze([{ workItemId: workItemRef, runId: runRef, state: "READY" as const }])
        : Object.freeze([]),
      progressRows: family === "PROGRESS"
        ? Object.freeze([{ runId: runRef, latestProgressSeq: 0 }])
        : Object.freeze([]),
      suspiciousRows: Object.freeze([])
    })
  });
  const emitted: ObservationSignal[] = [];
  const statusUpdates: unknown[] = [];
  let sequence = 0;
  let signalId = 0;
  const runtime = new ObservationModuleRuntime({
    nextSequence: () => ++sequence,
    nextSignalId: () => `3c000000-0000-4000-8000-${String(++signalId).padStart(12, "0")}`,
    sampleStore: Object.freeze({ async write() {} }),
    emitSignal: async (signal) => { emitted.push(signal); },
    updateModuleStatus: (_name, update) => { statusUpdates.push(update); },
    modules: Object.freeze([module])
  });
  const run = (seconds: number) => runtime.run(Object.freeze({
    modules: Object.freeze([module]),
    now: at(seconds),
    timeoutMs: 2_000,
    database: fixture.database,
    stateDir: "/tmp/obs-03-infrastructure-clear",
    repoRoot: "/tmp/obs-03-infrastructure-clear-repo",
    targets: Object.freeze([]),
    thresholdVersion: 4,
    moduleThresholds: Object.freeze({
      "stall-detectors": Object.freeze({
        detector_interval_ms: 1,
        ready_age_s: 120,
        no_progress_s: 300
      })
    })
  }));
  const openAt = family === "READY" ? 120 : 300;
  const signalClass = family === "READY" ? "QUEUE_NOT_DRAINING" : "NO_PROGRESS";

  await run(openAt);
  const original = emitted.find((signal) => signal.class === signalClass)!;
  expect(original).toMatchObject({ state: "OPEN", suspected_defect: true });

  fixture.fail();
  await run(openAt + 10);

  expect(emitted).toEqual([
    original,
    expect.objectContaining({
      class: signalClass,
      state: "CLEARED",
      suspected_defect: true,
      clears_signal_id: original.signal_id
    })
  ]);
  expect(emitted.filter((signal) => signal.state === "OPEN")).toEqual([original]);
  expect(statusUpdates.at(-1)).toMatchObject({
    observations: expect.arrayContaining([
      expect.objectContaining({ probe: "safe_view_detector", ok: false, lastStatus: "INELIGIBLE" })
    ])
  });
}

describe("OBS-03 healthy-infrastructure defect recovery", () => {
  it.each([
    {
      name: "STALL",
      prime: input(at(16)),
      open: { ...input(at(16)), stallRows: [{
        workItemId: workItemRef, runId: runRef, state: "CLAIMED" as const,
        claimDeadline: at(0)
      }] },
      recover: input(at(31))
    },
    {
      name: "QUEUE_NOT_DRAINING",
      prime: { ...input(at(0)), readyRows: [{
        workItemId: workItemRef, runId: runRef, state: "READY" as const
      }] },
      open: { ...input(at(120)), readyRows: [{
        workItemId: workItemRef, runId: runRef, state: "READY" as const
      }] },
      recover: input(at(135))
    },
    {
      name: "NO_PROGRESS",
      prime: { ...input(at(0)), progressRows: [{ runId: runRef, latestProgressSeq: 4 }] },
      open: { ...input(at(300)), progressRows: [{ runId: runRef, latestProgressSeq: 4 }] },
      recover: { ...input(at(315)), progressRows: [{ runId: runRef, latestProgressSeq: 5 }] }
    },
    {
      name: "SUSPICIOUS_SUCCESS",
      prime: input(at(0)),
      open: { ...input(at(0)), suspiciousRows: [{
        workItemId: workItemRef, runId: runRef, state: "DONE" as const,
        settledArtifactPresent: false as const
      }] },
      recover: input(at(15))
    }
  ])("opens and clears $name using isolated healthy inputs", async ({ name, prime, open, recover }) => {
    const loaded = await modules();
    expect(loaded).not.toBeNull();
    const detector = loaded!.detectors.createDefectDetectorTracker();
    const lifecycle = loaded!.lifecycle.createDefectLifecycle();
    detector.observe(prime, clocks());
    const candidateCycle = detector.observe(open, name === "QUEUE_NOT_DRAINING"
      ? clocks({ ready: [[workItemRef, at(0)]] })
      : name === "NO_PROGRESS"
        ? clocks({ progress: [[runRef, { sequence: 4, at: at(0) }]] })
        : clocks());
    const opened = lifecycle.reconcile(candidateCycle.candidates, healthy, open.now);
    expect(opened).toEqual([expect.objectContaining({
      class: name,
      state: "OPEN",
      severity: "SEVERE",
      suspectedDefect: true
    })]);
    const recoveredCycle = detector.observe(recover, name === "NO_PROGRESS"
      ? clocks({ progress: [[runRef, { sequence: 5, at: at(315) }]] })
      : clocks());
    expect(lifecycle.reconcile(recoveredCycle.candidates, healthy, recover.now))
      .toEqual([expect.objectContaining({
        class: name,
        state: "CLEARED",
        impactCode: "IMPACT_CLEARED",
        suspectedDefect: true
      })]);
  });

  it("emits no defect intent when READY clock capacity is exhausted", async () => {
    const loaded = await modules();
    expect(loaded).not.toBeNull();
    const detector = loaded!.detectors.createDefectDetectorTracker();
    const lifecycle = loaded!.lifecycle.createDefectLifecycle();
    const cycle = detector.observe({
      ...input(at(500)),
      readyRows: [{ workItemId: workItemRef, runId: runRef, state: "READY" as const }]
    }, clocks({ ready: [[workItemRef, at(0)]], exhausted: ["READY"] }));
    expect(cycle.status.state).toBe("INELIGIBLE");
    expect(lifecycle.reconcile(cycle.candidates, healthy, at(500))).toEqual([]);
  });

  it.each(["READY", "PROGRESS"] as const)(
    "holds an existing %s-family defect and its UUID while exhausted",
    async (family) => runExhaustedFamilyLifecycle(family)
  );

  it.each(["READY", "PROGRESS"] as const)(
    "clears an existing %s-family defect by original UUID when the database becomes unavailable",
    async (family) => runInfrastructureFailureLifecycle(family)
  );
});
