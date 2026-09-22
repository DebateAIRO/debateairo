import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { observationRepoRoot } from "../../apps/observation-agent/src/core/paths.js";
import { ObservationModuleRuntime } from "../../apps/observation-agent/src/core/runtime.js";
import type { ObservationSignal } from "../../apps/observation-agent/src/core/signals.js";
import { createPostgresCapacityModule } from "../../apps/observation-agent/src/modules/postgres-capacity/module.js";
import { createHostCapacityModule } from "../../apps/observation-agent/src/modules/host-capacity/module.js";
import { createCertificateCapacityModule } from "../../apps/observation-agent/src/modules/certificate-capacity/module.js";

const start = new Date("2026-09-03T12:00:00.000Z");
const database = Object.freeze({
  async withClient<T>(): Promise<T> { throw new Error("UNUSED_DATABASE_PORT"); }
});

describe("OBS-05 capacity lifecycle", () => {
  it("deduplicates every ruled capacity condition and emits schema-valid clears", async () => {
    const signals: ObservationSignal[] = [];
    const samples: Array<{ metricKey: string; value: number }> = [];
    let sequence = 0;
    const postgres = createPostgresCapacityModule({
      readSnapshot: async (_url, at) => Object.freeze({
        usedConnections: at < new Date(start.getTime() + 60_000) ? 96 : 10,
        maxConnections: 100,
        lockWaiters: at < new Date(start.getTime() + 60_000) ? 1 : 0,
        longestLockWaitSeconds: at < new Date(start.getTime() + 60_000) ? 60 : 0,
        longestTransactionAgeSeconds: at < new Date(start.getTime() + 60_000) ? 300 : 0,
        activeQueryAgeSeconds: 7,
        idleInTransactionCount: at < new Date(start.getTime() + 60_000) ? 5 : 0,
        idleInTransactionAgeSeconds: at < new Date(start.getTime() + 60_000) ? 120 : 0,
        debateaiDatabaseBytes: 1_000,
        hatchetDatabaseBytes: 2_000,
        observedAt: at
      })
    });
    const host = createHostCapacityModule({
      readSnapshot: async (at) => Object.freeze({
        diskTotalBytes: 1_000, diskFreeBytes: at < new Date(start.getTime() + 60_000) ? 40 : 200,
        diskFreePercent: at < new Date(start.getTime() + 60_000) ? 4 : 20,
        dockerDiskBytes: 3_000, memoryTotalBytes: 1_000,
        memoryAvailableBytes: at < new Date(start.getTime() + 60_000) ? 50 : 500,
        memoryAvailablePercent: at < new Date(start.getTime() + 60_000) ? 5 : 50,
        loadOneMinute: at < new Date(start.getTime() + 60_000) ? 21 : 1,
        logicalCores: 10,
        containers: Object.freeze([
          Object.freeze({ name: "debateai-v3-postgres-1", cpuPercent: 1, memoryUsedBytes: 2, memoryLimitBytes: 3, memoryPercent: 4 }),
          Object.freeze({ name: "debateai-v3-hatchet-lite-1", cpuPercent: 5, memoryUsedBytes: 6, memoryLimitBytes: 7, memoryPercent: 8 })
        ]),
        observedAt: at
      })
    });
    const certificateRepoRoots: string[] = [];
    const certificate = createCertificateCapacityModule({
      readSnapshot: async (_target, at, repoRoot) => {
        certificateRepoRoots.push(repoRoot);
        return Object.freeze({
          days: at < new Date(start.getTime() + 86_400_000) ? -1 : 365,
          notAfter: at < new Date(start.getTime() + 86_400_000)
            ? new Date("2026-09-02T12:00:00.000Z") : new Date("2027-09-03T12:00:00.000Z"),
          observedAt: at
        });
      }
    });
    const runtime = new ObservationModuleRuntime({
      modules: Object.freeze([postgres, host, certificate]),
      nextSequence: () => ++sequence,
      nextSignalId: () => `50000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
      sampleStore: { async write(sample) { samples.push(sample); } },
      async emitSignal(signal) { signals.push(signal); }
    });
    const input = (now: Date) => ({
      modules: [postgres, host, certificate], now, timeoutMs: 2_000,
      database, stateDir: "unused", repoRoot: observationRepoRoot(), targets: [], thresholdVersion: 5,
      targetFragments: [Object.freeze({ basename: "OBS-05.json", targets: Object.freeze([]), configuration: Object.freeze({}) })],
      moduleThresholds: {
        "postgres-capacity": { clear_samples: 2 },
        "host-capacity": { load_sustained_samples: 1, clear_samples: 2 },
        "certificate-capacity": {}
      }
    });

    await runtime.run(input(start));
    expect(signals).toHaveLength(8);
    expect(signals.every(({ state, suspected_defect }) => state === "OPEN" && !suspected_defect)).toBe(true);
    await runtime.run(input(new Date(start.getTime() + 30_000)));
    expect(signals).toHaveLength(8);
    await runtime.run(input(new Date(start.getTime() + 60_000)));
    expect(signals).toHaveLength(8);
    await runtime.run(input(new Date(start.getTime() + 90_000)));
    expect(signals).toHaveLength(15);
    await runtime.run(input(new Date(start.getTime() + 86_400_000)));
    expect(signals).toHaveLength(16);
    expect(signals.filter(({ state }) => state === "CLEARED")).toHaveLength(8);
    expect(samples).toHaveLength(132);
    expect(samples.every(({ value }) => typeof value === "number" && Number.isFinite(value))).toBe(true);
    expect(certificateRepoRoots).toEqual([observationRepoRoot(), observationRepoRoot()]);
    expect(existsSync(join(certificateRepoRoots[0]!, "apps/observation-agent/src/core/paths.ts")))
      .toBe(true);
  });
});
