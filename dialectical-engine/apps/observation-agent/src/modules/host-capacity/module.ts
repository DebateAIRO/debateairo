import type {
  Module,
  ModuleConfigurationObject,
  ModuleStatusProjection,
  SampleIntent,
  SignalIntent,
  StatusUnit
} from "../../core/types.js";
import { readHostCapacity, type HostCapacitySnapshot } from "./commands.js";
import { createHostCapacityTracker, type HostCapacityThresholds } from "./tracker.js";

export type HostCapacityModuleDependencies = Readonly<{
  readSnapshot(observedAt: Date, timeoutMs: number): Promise<HostCapacitySnapshot>;
}>;

const productionDependencies: HostCapacityModuleDependencies = Object.freeze({
  readSnapshot: (observedAt, timeoutMs) => readHostCapacity(observedAt, undefined, timeoutMs)
});

function numeric(configuration: ModuleConfigurationObject, key: string, fallback: number): number {
  const value = configuration[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function thresholds(configuration: ModuleConfigurationObject): HostCapacityThresholds {
  return Object.freeze({
    diskDegradedFreePercent: numeric(configuration, "disk_degraded_free_percent", 15),
    diskFatalFreePercent: numeric(configuration, "disk_fatal_free_percent", 5),
    memorySevereAvailablePercent: numeric(configuration, "memory_severe_available_percent", 10),
    loadPerCoreMultiplier: numeric(configuration, "load_per_core_multiplier", 2),
    loadSustainedSamples: numeric(configuration, "load_sustained_samples", 10),
    clearSamples: numeric(configuration, "clear_samples", 2)
  });
}

function projection(key: string, value: number, unit: StatusUnit, at: Date): ModuleStatusProjection {
  return Object.freeze({ kind: "metric", key, value, unit, observedAt: at, view: "capacity" });
}

function values(snapshot: HostCapacitySnapshot): readonly [string, number, StatusUnit][] {
  const fixed: [string, number, StatusUnit][] = [
    ["host.disk.total_bytes", snapshot.diskTotalBytes, "BYTES"],
    ["host.disk.free_bytes", snapshot.diskFreeBytes, "BYTES"],
    ["host.disk.free_percent", snapshot.diskFreePercent, "PERCENT"],
    ["docker.disk_bytes", snapshot.dockerDiskBytes, "BYTES"],
    ["host.memory.total_bytes", snapshot.memoryTotalBytes, "BYTES"],
    ["host.memory.available_bytes", snapshot.memoryAvailableBytes, "BYTES"],
    ["host.memory.available_percent", snapshot.memoryAvailablePercent, "PERCENT"],
    ["host.load.one_minute", snapshot.loadOneMinute, "COUNT"],
    ["host.logical_cores", snapshot.logicalCores, "COUNT"]
  ];
  for (const container of snapshot.containers) {
    fixed.push(
      [`container.${container.name}.cpu_percent`, container.cpuPercent, "PERCENT"],
      [`container.${container.name}.memory_used_bytes`, container.memoryUsedBytes, "BYTES"],
      [`container.${container.name}.memory_limit_bytes`, container.memoryLimitBytes, "BYTES"],
      [`container.${container.name}.memory_percent`, container.memoryPercent, "PERCENT"]
    );
  }
  return Object.freeze(fixed);
}

export function createHostCapacityModule(dependencies: Partial<HostCapacityModuleDependencies> = {}): Module {
  const resolved = Object.freeze({ ...productionDependencies, ...dependencies });
  const tracker = createHostCapacityTracker();
  let pendingSamples: readonly SampleIntent[] = Object.freeze([]);
  let pendingSignals: readonly SignalIntent[] = Object.freeze([]);
  return Object.freeze({
    name: "host-capacity",
    cadence: Object.freeze({ intervalMs: 30_000, timeoutMs: 2_000 }),
    lifecycle: Object.freeze({
      legacyCorrelationKey: tracker.legacyCorrelationKey,
      restore: tracker.restore
    }),
    async probe(ctx) {
      let snapshot: HostCapacitySnapshot;
      try {
        snapshot = await resolved.readSnapshot(ctx.now, ctx.timeoutMs);
      } catch {
        pendingSamples = Object.freeze([]);
        pendingSignals = Object.freeze([]);
        return Object.freeze([Object.freeze({
          component: "host", ok: false, class: "CAPACITY",
          probe: "host_capacity", lastStatus: "UNKNOWN", observedAt: ctx.now,
          management: "module", statusState: "UNKNOWN",
          status: Object.freeze([Object.freeze({
            kind: "state" as const, key: "host.capacity", state: "UNKNOWN" as const,
            observedAt: ctx.now, view: "capacity" as const
          })])
        })]);
      }
      const cycle = tracker.observe({ snapshot, thresholds: thresholds(ctx.thresholds) });
      const measured = values(snapshot);
      pendingSamples = Object.freeze(measured.map(([key, value]) => Object.freeze({
        metricKey: `capacity.${key}`, value, observedAt: snapshot.observedAt
      })));
      pendingSignals = cycle.intents;
      return Object.freeze([Object.freeze({
        component: "host", ok: cycle.band === "NORMAL", class: "CAPACITY",
        probe: "host_capacity", lastStatus: cycle.band, observedAt: snapshot.observedAt,
        management: "module", statusState: cycle.band,
        status: Object.freeze([
          ...measured.map(([key, value, unit]) => projection(key, value, unit, snapshot.observedAt)),
          ...cycle.projections
        ])
      })]);
    },
    samples() {
      const current = pendingSamples;
      pendingSamples = Object.freeze([]);
      return current;
    },
    signals() {
      const current = pendingSignals;
      pendingSignals = Object.freeze([]);
      return current;
    }
  });
}

export default createHostCapacityModule();
