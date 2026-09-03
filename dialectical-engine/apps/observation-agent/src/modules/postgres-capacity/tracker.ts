import type { Severity } from "../../core/signals.js";
import type { ModuleStatusProjection, SignalIntent } from "../../core/types.js";
import type { PostgresCapacitySnapshot } from "./query.js";

export type PostgresCapacityThresholds = Readonly<{
  connectionsSeverePercent: number;
  connectionsFatalPercent: number;
  lockWaiterCount: number;
  lockWaitSeconds: number;
  transactionAgeSeconds: number;
  idleInTransactionCount: number;
  idleInTransactionSeconds: number;
  clearSamples: number;
}>;

type OpenCondition = {
  openedAt: Date;
  severity: Severity;
  recoverySamples: number;
};

type Condition = Readonly<{
  key: string;
  failing: boolean;
  severity: Severity;
  impactCode: "IMPACT_PG_CAPACITY" | "IMPACT_PG_LOCKS" | "IMPACT_PG_LONG_XACT";
  evidence: Readonly<Record<string, unknown>>;
}>;

function intent(
  condition: Condition,
  state: "OPEN" | "CLEARED",
  now: Date,
  openedAt: Date
): SignalIntent {
  return Object.freeze({
    correlationKey: condition.key,
    component: "postgres",
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

function percent(used: number, maximum: number): number {
  return maximum <= 0 ? 0 : used / maximum * 100;
}

export function measuredConnectionEvidence(input: Readonly<{
  used: number;
  max: number;
  thresholdPercent: number;
  observedAt: Date;
}>): Readonly<Record<string, unknown>> {
  return Object.freeze({
    used: input.used,
    max: input.max,
    percent: percent(input.used, input.max),
    threshold_percent: input.thresholdPercent,
    unit: "connections",
    observed_at: input.observedAt.toISOString()
  });
}

function stateForConnectionPercent(value: number, thresholds: PostgresCapacityThresholds) {
  if (value >= thresholds.connectionsFatalPercent) return "FATAL" as const;
  if (value >= thresholds.connectionsSeverePercent) return "SEVERE" as const;
  return "NORMAL" as const;
}

export function createPostgresCapacityTracker(): Readonly<{
  observe(input: Readonly<{
    snapshot: PostgresCapacitySnapshot;
    thresholds: PostgresCapacityThresholds;
  }>): Readonly<{
    band: "NORMAL" | "DEGRADED" | "SEVERE" | "FATAL";
    intents: readonly SignalIntent[];
    projections: readonly ModuleStatusProjection[];
  }>;
}> {
  const open = new Map<string, OpenCondition>();
  return Object.freeze({
    observe({ snapshot, thresholds }) {
      const connectionPercent = percent(snapshot.usedConnections, snapshot.maxConnections);
      const connectionBand = stateForConnectionPercent(connectionPercent, thresholds);
      const conditions: readonly Condition[] = Object.freeze([
        Object.freeze({
          key: "postgres-connections",
          failing: connectionBand !== "NORMAL",
          severity: connectionBand === "FATAL" ? "FATAL" : "SEVERE",
          impactCode: "IMPACT_PG_CAPACITY",
          evidence: measuredConnectionEvidence({
            used: snapshot.usedConnections,
            max: snapshot.maxConnections,
            thresholdPercent: connectionBand === "FATAL"
              ? thresholds.connectionsFatalPercent : thresholds.connectionsSeverePercent,
            observedAt: snapshot.observedAt
          })
        }),
        Object.freeze({
          key: "postgres-lock-waiters",
          failing: snapshot.lockWaiters >= thresholds.lockWaiterCount
            && snapshot.longestLockWaitSeconds >= thresholds.lockWaitSeconds,
          severity: "SEVERE",
          impactCode: "IMPACT_PG_LOCKS",
          evidence: Object.freeze({
            count: snapshot.lockWaiters,
            duration_seconds: snapshot.longestLockWaitSeconds,
            threshold_seconds: thresholds.lockWaitSeconds,
            unit: "seconds",
            observed_at: snapshot.observedAt.toISOString()
          })
        }),
        Object.freeze({
          key: "postgres-long-transaction",
          failing: snapshot.longestTransactionAgeSeconds >= thresholds.transactionAgeSeconds,
          severity: "SEVERE",
          impactCode: "IMPACT_PG_LONG_XACT",
          evidence: Object.freeze({
            duration_seconds: snapshot.longestTransactionAgeSeconds,
            threshold_seconds: thresholds.transactionAgeSeconds,
            unit: "seconds",
            observed_at: snapshot.observedAt.toISOString()
          })
        }),
        Object.freeze({
          key: "postgres-idle-transaction",
          failing: snapshot.idleInTransactionCount >= thresholds.idleInTransactionCount
            && snapshot.idleInTransactionAgeSeconds >= thresholds.idleInTransactionSeconds,
          severity: "DEGRADED",
          impactCode: "IMPACT_PG_LONG_XACT",
          evidence: Object.freeze({
            count: snapshot.idleInTransactionCount,
            duration_seconds: snapshot.idleInTransactionAgeSeconds,
            threshold_seconds: thresholds.idleInTransactionSeconds,
            unit: "sessions",
            observed_at: snapshot.observedAt.toISOString()
          })
        })
      ]);
      const intents: SignalIntent[] = [];
      for (const condition of conditions) {
        const active = open.get(condition.key);
        if (condition.failing) {
          if (active === undefined) {
            open.set(condition.key, {
              openedAt: snapshot.observedAt,
              severity: condition.severity,
              recoverySamples: 0
            });
            intents.push(intent(condition, "OPEN", snapshot.observedAt, snapshot.observedAt));
          } else if (active.severity !== condition.severity) {
            intents.push(intent(condition, "CLEARED", snapshot.observedAt, active.openedAt));
            open.set(condition.key, {
              openedAt: snapshot.observedAt,
              severity: condition.severity,
              recoverySamples: 0
            });
            intents.push(intent(condition, "OPEN", snapshot.observedAt, snapshot.observedAt));
          } else {
            active.recoverySamples = 0;
          }
        } else if (active !== undefined) {
          active.recoverySamples += 1;
          if (active.recoverySamples >= thresholds.clearSamples) {
            intents.push(intent({ ...condition, severity: active.severity }, "CLEARED", snapshot.observedAt, active.openedAt));
            open.delete(condition.key);
          }
        }
      }
      const severities = [...open.values()].map(({ severity }) => severity);
      const band = severities.includes("FATAL") ? "FATAL"
        : severities.includes("SEVERE") ? "SEVERE"
          : severities.includes("DEGRADED") ? "DEGRADED" : "NORMAL";
      return Object.freeze({
        band,
        intents: Object.freeze(intents),
        projections: Object.freeze([Object.freeze({
          kind: "state",
          key: "postgres.capacity_band",
          state: band,
          observedAt: snapshot.observedAt,
          view: "capacity"
        })])
      });
    }
  });
}
