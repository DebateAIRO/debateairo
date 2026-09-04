import type { Severity } from "../../core/signals.js";
import type { ModuleStatusProjection, SignalIntent } from "../../core/types.js";
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

export function createHostCapacityTracker() {
  const open = new Map<string, OpenCondition>();
  let highLoadSamples = 0;
  return Object.freeze({
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
