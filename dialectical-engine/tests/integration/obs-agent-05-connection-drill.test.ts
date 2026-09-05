import { describe, expect, it } from "vitest";
import { ObservationModuleRuntime } from "../../apps/observation-agent/src/core/runtime.js";
import { renderImpact, type ObservationSignal } from "../../apps/observation-agent/src/core/signals.js";
import { createPostgresCapacityModule } from "../../apps/observation-agent/src/modules/postgres-capacity/module.js";
import { measuredConnectionEvidence } from "../../apps/observation-agent/src/modules/postgres-capacity/tracker.js";

describe("OBS-05 measured connection drill", () => {
  it("binds B+25 acceptance, evidence and copy to measured U within the 35-second budget", async () => {
    const baseline = 4;
    const additionalClients = 25;
    const measuredUsed = 31;
    const measuredMax = 100;
    const observedAt = new Date("2026-09-03T12:00:30.000Z");
    const emitted: ObservationSignal[] = [];
    const samples: Array<{ metricKey: string; value: number }> = [];
    const module = createPostgresCapacityModule({
      readSnapshot: async () => Object.freeze({
        usedConnections: measuredUsed, maxConnections: measuredMax,
        lockWaiters: 0, longestLockWaitSeconds: 0, longestTransactionAgeSeconds: 0,
        activeQueryAgeSeconds: 1, idleInTransactionCount: 0, idleInTransactionAgeSeconds: 0,
        debateaiDatabaseBytes: 1000, hatchetDatabaseBytes: 2000, observedAt
      })
    });
    expect(measuredConnectionEvidence({ used: measuredUsed, max: measuredMax, thresholdPercent: 20, observedAt }))
      .toEqual({
        used: 31, max: 100, percent: 31, threshold_percent: 20,
        unit: "connections", observed_at: observedAt.toISOString()
      });
    const runtime = new ObservationModuleRuntime({
      modules: Object.freeze([module]),
      nextSequence: () => 1,
      nextSignalId: () => "50000000-0000-4000-8000-000000000001",
      sampleStore: { async write(sample) { samples.push(sample); } },
      async emitSignal(signal) { emitted.push(signal); }
    });
    await runtime.run({
      modules: [module], now: observedAt, timeoutMs: 2_000, databaseUrl: "unused",
      stateDir: "unused", targets: [], thresholdVersion: 2,
      moduleThresholds: { "postgres-capacity": { connections_severe_percent: 20 } }
    });
    expect(measuredUsed).toBeGreaterThanOrEqual(baseline + additionalClients);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.evidence).toMatchObject({ used: measuredUsed, max: measuredMax });
    const copy = renderImpact(emitted[0]);
    expect(copy).toBe(`Postgres is at ${measuredUsed}/${measuredMax} connections: new requests fail when the limit is reached.`);
    expect(copy).not.toContain(`at ${additionalClients}/${measuredMax}`);
    expect(samples.find(({ metricKey }) => metricKey === "capacity.postgres.connections.used")?.value)
      .toBe(measuredUsed);
    expect(module.cadence.intervalMs + 3_000).toBeLessThanOrEqual(35_000);
  });
});
