import type { ObservationSignal, Severity } from "../../core/signals.js";
import type { ModuleStatusProjection, RestoredOpenSignal, SignalIntent } from "../../core/types.js";
import type { HostCapacitySnapshot } from "./commands.js";

export type HostCapacityThresholds = Readonly<{
  diskDegradedFreePercent: number;
  diskFatalFreePercent: number;
  memorySevereAvailablePercent: number;
  loadPerCoreMultiplier: number;
  loadSustainedSamples: number;
  clearSamples: number;
}>;

type OpenCondition = { openedAt: Date; severity: Severity; recoverySamples: number };
type Condition = Readonly<{
  key: string;
  failing: boolean;
  severity: Severity;
  impactCode: "IMPACT_DISK" | "IMPACT_MEMORY" | "IMPACT_LOAD";
  evidence: Readonly<Record<string, unknown>>;
}>;

function signal(condition: Condition, state: "OPEN" | "CLEARED", now: Date, openedAt: Date): SignalIntent {
  return Object.freeze({
    correlationKey: condition.key,
    component: "host",
    class: "CAPACITY",
    state,
    severity: condition.severity,
    impactCode: state === "OPEN" ? condition.impactCode : "IMPACT_CLEARED",
    firstFailedProbeAt: openedAt,
    detectedAt: now,
    evidence: state === "OPEN" ? condition.evidence : Object.freeze({
      duration_seconds: Math.max(0, (now.getTime() - openedAt.getTime()) / 1_000)
    }),
    suspectedDefect: false,
    defectKind: null,
    runRef: null,
    workItemRef: null
  });
}

function restoredHostKey(signal: ObservationSignal): string | null {
  if (signal.state !== "OPEN"
    || signal.component !== "host"
    || signal.class !== "CAPACITY"
    || signal.first_failed_probe_at === null
    || signal.suspected_defect
    || signal.defect_kind !== null
    || signal.run_ref !== null
    || signal.work_item_ref !== null) return null;
  const evidence = signal.evidence as Readonly<Record<string, unknown>>;
  const exactKeys = (keys: readonly string[]) => {
    const actual = Object.keys(evidence).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length
      && actual.every((key, index) => key === expected[index]);
  };
  const percentFailure = typeof evidence.percent === "number"
    && Number.isFinite(evidence.percent)
    && typeof evidence.threshold_percent === "number"
    && Number.isFinite(evidence.threshold_percent)
    && evidence.percent < evidence.threshold_percent
    && typeof evidence.total_bytes === "number"
    && Number.isFinite(evidence.total_bytes)
    && evidence.total_bytes > 0
    && evidence.unit === "bytes"
    && typeof evidence.observed_at === "string"
    && Number.isFinite(new Date(evidence.observed_at).getTime());
  if (signal.impact_code === "IMPACT_DISK"
    && (signal.severity === "DEGRADED" || signal.severity === "FATAL")
    && exactKeys(["percent", "threshold_percent", "free_bytes", "total_bytes", "unit", "observed_at"])
    && percentFailure
    && typeof evidence.free_bytes === "number"
    && Number.isFinite(evidence.free_bytes)
    && evidence.free_bytes >= 0) return "host-disk";
  if (signal.impact_code === "IMPACT_MEMORY"
    && signal.severity === "SEVERE"
    && exactKeys(["percent", "threshold_percent", "available_bytes", "total_bytes", "unit", "observed_at"])
    && percentFailure
    && typeof evidence.available_bytes === "number"
    && Number.isFinite(evidence.available_bytes)
    && evidence.available_bytes >= 0) return "host-memory";
  if (signal.impact_code === "IMPACT_LOAD"
    && signal.severity === "DEGRADED"
    && exactKeys(["load_one_minute", "logical_cores", "threshold_multiplier", "sustained_seconds", "observed_at"])
    && typeof evidence.load_one_minute === "number"
    && Number.isFinite(evidence.load_one_minute)
    && Number.isInteger(evidence.logical_cores)
    && (evidence.logical_cores as number) > 0
    && typeof evidence.threshold_multiplier === "number"
    && Number.isFinite(evidence.threshold_multiplier)
    && evidence.threshold_multiplier > 0
    && evidence.load_one_minute
      > evidence.threshold_multiplier * (evidence.logical_cores as number)
    && typeof evidence.sustained_seconds === "number"
    && Number.isFinite(evidence.sustained_seconds)
    && evidence.sustained_seconds >= 0
    && typeof evidence.observed_at === "string"
    && Number.isFinite(new Date(evidence.observed_at).getTime())) return "host-load";
  return null;
}

export function createHostCapacityTracker(): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
  observe(input: Readonly<{ snapshot: HostCapacitySnapshot; thresholds: HostCapacityThresholds }>): Readonly<{
    band: "NORMAL" | "DEGRADED" | "SEVERE" | "FATAL";
    intents: readonly SignalIntent[];
    projections: readonly ModuleStatusProjection[];
  }>;
}> {
  const open = new Map<string, OpenCondition>();
  let highLoadSamples = 0;
  return Object.freeze({
    legacyCorrelationKey: restoredHostKey,
    restore(openSignals): void {
      for (const restored of openSignals) {
        const key = restoredHostKey(restored.signal);
        if (key === null || key !== restored.correlationKey || open.has(key)) {
          throw new TypeError("OBSERVATION_HOST_CAPACITY_RESTORE_INVALID");
        }
        open.set(key, {
          openedAt: new Date(restored.signal.detected_at),
          severity: restored.signal.severity,
          recoverySamples: 0
        });
        if (key === "host-load") highLoadSamples = 1;
      }
    },
    observe(input: Readonly<{ snapshot: HostCapacitySnapshot; thresholds: HostCapacityThresholds }>): Readonly<{
      band: "NORMAL" | "DEGRADED" | "SEVERE" | "FATAL";
      intents: readonly SignalIntent[];
      projections: readonly ModuleStatusProjection[];
    }> {
      const { snapshot, thresholds } = input;
      const loadHigh = snapshot.loadOneMinute > thresholds.loadPerCoreMultiplier * snapshot.logicalCores;
      highLoadSamples = loadHigh ? highLoadSamples + 1 : 0;
      const diskBand = snapshot.diskFreePercent < thresholds.diskFatalFreePercent ? "FATAL"
        : snapshot.diskFreePercent < thresholds.diskDegradedFreePercent ? "DEGRADED" : "NORMAL";
      const conditions: readonly Condition[] = Object.freeze([
        Object.freeze({
          key: "host-disk",
          failing: diskBand !== "NORMAL",
          severity: diskBand === "FATAL" ? "FATAL" : "DEGRADED",
          impactCode: "IMPACT_DISK",
          evidence: Object.freeze({
            percent: snapshot.diskFreePercent,
            threshold_percent: diskBand === "FATAL" ? thresholds.diskFatalFreePercent : thresholds.diskDegradedFreePercent,
            free_bytes: snapshot.diskFreeBytes,
            total_bytes: snapshot.diskTotalBytes,
            unit: "bytes",
            observed_at: snapshot.observedAt.toISOString()
          })
        }),
        Object.freeze({
          key: "host-memory",
          failing: snapshot.memoryAvailablePercent < thresholds.memorySevereAvailablePercent,
          severity: "SEVERE",
          impactCode: "IMPACT_MEMORY",
          evidence: Object.freeze({
            percent: snapshot.memoryAvailablePercent,
            threshold_percent: thresholds.memorySevereAvailablePercent,
            available_bytes: snapshot.memoryAvailableBytes,
            total_bytes: snapshot.memoryTotalBytes,
            unit: "bytes",
            observed_at: snapshot.observedAt.toISOString()
          })
        }),
        Object.freeze({
          key: "host-load",
          failing: loadHigh && (highLoadSamples >= thresholds.loadSustainedSamples || open.has("host-load")),
          severity: "DEGRADED",
          impactCode: "IMPACT_LOAD",
          evidence: Object.freeze({
            load_one_minute: snapshot.loadOneMinute,
            logical_cores: snapshot.logicalCores,
            threshold_multiplier: thresholds.loadPerCoreMultiplier,
            sustained_seconds: thresholds.loadSustainedSamples * 30,
            observed_at: snapshot.observedAt.toISOString()
          })
        })
      ]);
      const intents: SignalIntent[] = [];
      for (const condition of conditions) {
        const active = open.get(condition.key);
        if (condition.failing) {
          if (active === undefined) {
            open.set(condition.key, { openedAt: snapshot.observedAt, severity: condition.severity, recoverySamples: 0 });
            intents.push(signal(condition, "OPEN", snapshot.observedAt, snapshot.observedAt));
          } else if (active.severity !== condition.severity) {
            intents.push(signal({ ...condition, severity: active.severity }, "CLEARED", snapshot.observedAt, active.openedAt));
            open.set(condition.key, { openedAt: snapshot.observedAt, severity: condition.severity, recoverySamples: 0 });
            intents.push(signal(condition, "OPEN", snapshot.observedAt, snapshot.observedAt));
          } else active.recoverySamples = 0;
        } else if (active !== undefined) {
          active.recoverySamples += 1;
          if (active.recoverySamples >= thresholds.clearSamples) {
            intents.push(signal({ ...condition, severity: active.severity }, "CLEARED", snapshot.observedAt, active.openedAt));
            open.delete(condition.key);
          }
        }
      }
      const severities = [...open.values()].map(({ severity }) => severity);
      const band = severities.includes("FATAL") ? "FATAL" : severities.includes("SEVERE") ? "SEVERE"
        : severities.includes("DEGRADED") ? "DEGRADED" : "NORMAL";
      return Object.freeze({
        band,
        intents: Object.freeze(intents),
        projections: Object.freeze([Object.freeze({
          kind: "state", key: "host.capacity_band", state: band,
          observedAt: snapshot.observedAt, view: "capacity"
        })])
      });
    }
  });
}
