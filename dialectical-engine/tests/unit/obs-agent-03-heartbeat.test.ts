import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const heartbeatPath = "apps/observation-agent/src/modules/stall-detectors/heartbeat.ts";

async function heartbeatModule() {
  if (!existsSync(heartbeatPath)) return null;
  return import("../../apps/observation-agent/src/modules/stall-detectors/heartbeat.js");
}

describe("OBS-03 Hatchet worker heartbeat", () => {
  it("uses the REST worker heartbeat timestamp and opens only after age exceeds 30 seconds", async () => {
    const heartbeat = await heartbeatModule();
    expect(heartbeat).not.toBeNull();
    const calls: Array<Readonly<{ url: string; init: RequestInit }>> = [];
    const snapshot = await heartbeat!.readWorkerHeartbeat({
      workerListUrl: "http://127.0.0.1:8888/api/v1/tenants/test/worker",
      workerRef: "debateai-dev-runner",
      tokenPath: "/fake/hatchet.token",
      now: new Date("2026-09-03T08:00:30.001Z"),
      timeoutMs: 2_000,
      readToken: async () => "read-token\n",
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ rows: [{
          name: "debateai-dev-runner",
          lastHeartbeatAt: "2026-09-03T08:00:00.000Z"
        }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
    });
    expect(snapshot).toEqual({
      state: "STALE",
      workerRef: "debateai-dev-runner",
      heartbeatAgeSeconds: 30.001,
      heartbeatThresholdSeconds: 30,
      lastHeartbeatAt: new Date("2026-09-03T08:00:00.000Z"),
      observedAt: new Date("2026-09-03T08:00:30.001Z"),
      evidence: { health: "STALE" }
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://127.0.0.1:8888/api/v1/tenants/test/worker");
    expect(calls[0]!.init.method).toBe("GET");
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe("Bearer read-token");
    expect(calls[0]!.init.body).toBeUndefined();
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);

    const tracker = heartbeat!.createWorkerHeartbeatTracker();
    expect(tracker.observe(snapshot)).toEqual([expect.objectContaining({
      correlationKey: "worker:debateai-dev-runner",
      component: "runner",
      class: "WORKER_LOST",
      state: "OPEN",
      severity: "SEVERE",
      impactCode: "IMPACT_WORKER_LOST",
      firstFailedProbeAt: new Date("2026-09-03T08:00:30.000Z"),
      detectedAt: new Date("2026-09-03T08:00:30.001Z"),
      evidence: {
        worker_ref: "debateai-dev-runner",
        heartbeat_age_s: 30.001,
        heartbeat_threshold_s: 30,
        health: "STALE"
      },
      suspectedDefect: false,
      defectKind: null,
      runRef: null,
      workItemRef: null
    })]);
    expect(tracker.observe(snapshot)).toEqual([]);
  });

  it("keeps the exact threshold fresh and clears a prior WORKER_LOST immutably", async () => {
    const heartbeat = await heartbeatModule();
    expect(heartbeat).not.toBeNull();
    const tracker = heartbeat!.createWorkerHeartbeatTracker();
    const stale = {
      state: "STALE" as const,
      workerRef: "debateai-dev-runner",
      heartbeatAgeSeconds: 31,
      heartbeatThresholdSeconds: 30,
      lastHeartbeatAt: new Date("2026-09-03T08:00:00.000Z"),
      observedAt: new Date("2026-09-03T08:00:31.000Z"),
      evidence: { health: "STALE" as const }
    };
    expect(tracker.observe(stale)).toHaveLength(1);
    const fresh = { ...stale, state: "FRESH" as const, heartbeatAgeSeconds: 30,
      observedAt: new Date("2026-09-03T08:00:45.000Z"), evidence: { health: "FRESH" as const } };
    expect(tracker.observe(fresh)).toEqual([expect.objectContaining({
      correlationKey: "worker:debateai-dev-runner",
      state: "CLEARED",
      class: "WORKER_LOST",
      impactCode: "IMPACT_CLEARED",
      evidence: { duration_seconds: 14 }
    })]);
    expect(tracker.observe(fresh)).toEqual([]);
  });

  it("reports UNKNOWN with a closed reason when the token or worker facts cannot be read", async () => {
    const heartbeat = await heartbeatModule();
    expect(heartbeat).not.toBeNull();
    const fetchCalls: string[] = [];
    const unknown = await heartbeat!.readWorkerHeartbeat({
      workerListUrl: "http://127.0.0.1:8888/api/v1/tenants/test/worker",
      workerRef: "debateai-dev-runner",
      tokenPath: "/missing/hatchet.token",
      now: new Date("2026-09-03T08:00:00.000Z"),
      timeoutMs: 9_000,
      readToken: async () => { throw new Error("unreadable secret detail"); },
      fetch: async (url: string | URL | Request) => {
        fetchCalls.push(String(url));
        throw new Error("must not run");
      }
    });
    expect(unknown).toEqual({
      state: "UNKNOWN",
      workerRef: "debateai-dev-runner",
      heartbeatAgeSeconds: null,
      heartbeatThresholdSeconds: 30,
      lastHeartbeatAt: null,
      observedAt: new Date("2026-09-03T08:00:00.000Z"),
      evidence: { health: "UNKNOWN", reason: "HATCHET_READ_UNAVAILABLE" }
    });
    expect(fetchCalls).toEqual([]);
    expect(heartbeat!.createWorkerHeartbeatTracker().observe(unknown)).toEqual([]);
  });

  it("projects freshness, heartbeat age, first failure, and detection timestamps for status", async () => {
    const heartbeat = await heartbeatModule();
    expect(heartbeat).not.toBeNull();
    expect(heartbeat!.projectWorkerHeartbeat({
      state: "STALE",
      workerRef: "debateai-dev-runner",
      heartbeatAgeSeconds: 42,
      heartbeatThresholdSeconds: 30,
      lastHeartbeatAt: new Date("2026-09-03T08:00:00.000Z"),
      observedAt: new Date("2026-09-03T08:00:42.000Z"),
      evidence: { health: "STALE" }
    })).toEqual({
      component: "runner",
      ok: false,
      class: "WORKER_LOST",
      probe: "hatchet_worker_list",
      lastStatus: "STALE",
      observedAt: new Date("2026-09-03T08:00:42.000Z"),
      management: "module",
      statusState: "STALE",
      status: [
        { kind: "state", key: "runner.heartbeat", state: "STALE",
          observedAt: new Date("2026-09-03T08:00:42.000Z") },
        { kind: "metric", key: "runner.heartbeat_age", value: 42, unit: "SECONDS",
          observedAt: new Date("2026-09-03T08:00:42.000Z") },
        { kind: "timestamp", key: "runner.first_failed_probe_at",
          value: new Date("2026-09-03T08:00:30.000Z") },
        { kind: "timestamp", key: "runner.detected_at",
          value: new Date("2026-09-03T08:00:42.000Z") }
      ]
    });
  });
});
