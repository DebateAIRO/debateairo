import type { ObservationSignal } from "../../core/signals.js";
import type { ModuleStatusProjection, RestoredOpenSignal, SignalIntent } from "../../core/types.js";
import { classifyProviderWindow } from "./anomalies.js";

type ProviderWindow = Readonly<{ providerRef: string; statuses: readonly string[] }>;
type OpenProvider = Readonly<{ openedAt: Date }>;

function safeKey(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized.length === 0 ? "unknown" : normalized.slice(0, 64);
}

export function createProviderHealthTracker(): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
  observe(windows: readonly ProviderWindow[], input: Readonly<{
    minimum: number;
    ratio: number;
    windowMinutes: number;
    windowStartedAt: Date;
    windowEndedAt: Date;
  }>): Readonly<{ intents: readonly SignalIntent[]; projections: readonly ModuleStatusProjection[] }>;
}> {
  const open = new Map<string, OpenProvider>();
  return Object.freeze({
    legacyCorrelationKey(signal): string | null {
      const evidence = signal.evidence as Readonly<Record<string, unknown>>;
      const providerRef = evidence.provider_ref;
      const startedAt = typeof evidence.window_started_at === "string"
        ? new Date(evidence.window_started_at).getTime() : Number.NaN;
      const endedAt = typeof evidence.window_ended_at === "string"
        ? new Date(evidence.window_ended_at).getTime() : Number.NaN;
      return signal.state === "OPEN"
        && signal.component === "provider_panel"
        && signal.class === "PROVIDER_DEGRADED"
        && signal.severity === "SEVERE"
        && signal.impact_code === "IMPACT_PROVIDER"
        && signal.first_failed_probe_at !== null
        && signal.suspected_defect === false
        && signal.defect_kind === null
        && signal.run_ref === null
        && signal.work_item_ref === null
        && typeof providerRef === "string"
        && /^[A-Za-z0-9_.:@/-]{1,128}$/u.test(providerRef)
        && Object.keys(evidence).sort().join(":")
          === "failed:percent:provider_ref:ratio:source:total:window_ended_at:window_minutes:window_started_at"
        && Number.isInteger(evidence.failed) && (evidence.failed as number) >= 0
        && Number.isInteger(evidence.total) && (evidence.total as number) > 0
        && (evidence.failed as number) <= (evidence.total as number)
        && typeof evidence.ratio === "number" && Number.isFinite(evidence.ratio)
        && Math.abs(evidence.ratio - (evidence.failed as number) / (evidence.total as number)) < 1e-9
        && typeof evidence.percent === "number" && Number.isFinite(evidence.percent)
        && Math.abs(evidence.percent - evidence.ratio * 100) < 1e-9
        && typeof evidence.window_minutes === "number" && Number.isFinite(evidence.window_minutes)
        && evidence.window_minutes > 0
        && Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt
        && evidence.source === "SAFE_VIEW"
        ? `provider:${providerRef}`
        : null;
    },
    restore(openSignals): void {
      for (const restored of openSignals) {
        const providerRef = (restored.signal.evidence as Readonly<Record<string, unknown>>).provider_ref;
        if (typeof providerRef !== "string"
          || !/^[A-Za-z0-9_.:@/-]{1,128}$/u.test(providerRef)
          || this.legacyCorrelationKey(restored.signal) !== restored.correlationKey
          || restored.correlationKey !== `provider:${providerRef}`
          || open.has(providerRef)) {
          throw new TypeError("OBSERVATION_PROVIDER_RESTORE_INVALID");
        }
        open.set(providerRef, Object.freeze({ openedAt: new Date(restored.signal.detected_at) }));
      }
    },
    observe(windows, input) {
      const intents: SignalIntent[] = [];
      const projections: ModuleStatusProjection[] = [Object.freeze({
        kind: "template", key: "provider_latency",
        template: "PROVIDER_LATENCY_NOT_OBSERVABLE", view: "throughput"
      }), Object.freeze({
        kind: "template", key: "provider.threshold",
        template: "PERCENT_MINIMUM_THRESHOLD", percent: input.ratio * 100,
        minimum: input.minimum, view: "throughput"
      })];
      for (const window of windows) {
        if (!/^[A-Za-z0-9_.:@/-]{1,128}$/u.test(window.providerRef)) {
          throw new TypeError("OBSERVATION_PROVIDER_REF_INVALID");
        }
        const band = classifyProviderWindow(window.statuses, input);
        const key = safeKey(window.providerRef);
        projections.push(
          Object.freeze({ kind: "state", key: `provider.${key}.health`, state: band.state, view: "throughput" }),
          Object.freeze({ kind: "metric", key: `provider.${key}.calls`, value: band.total, unit: "COUNT", view: "throughput" }),
          Object.freeze({ kind: "metric", key: `provider.${key}.failures`, value: band.failed, unit: "COUNT", view: "throughput" }),
          Object.freeze({ kind: "metric", key: `provider.${key}.ratio`, value: band.ratio * 100, unit: "PERCENT", view: "throughput" })
        );
        const active = open.get(window.providerRef);
        if (band.state === "OPEN" && active === undefined) {
          open.set(window.providerRef, Object.freeze({ openedAt: input.windowEndedAt }));
          intents.push(Object.freeze({
            correlationKey: `provider:${window.providerRef}`,
            component: "provider_panel",
            class: "PROVIDER_DEGRADED",
            state: "OPEN",
            severity: "SEVERE",
            impactCode: "IMPACT_PROVIDER",
            firstFailedProbeAt: input.windowStartedAt,
            detectedAt: input.windowEndedAt,
            evidence: Object.freeze({
              provider_ref: window.providerRef,
              failed: band.failed,
              total: band.total,
              ratio: band.ratio,
              percent: band.ratio * 100,
              window_minutes: input.windowMinutes,
              window_started_at: input.windowStartedAt.toISOString(),
              window_ended_at: input.windowEndedAt.toISOString(),
              source: "SAFE_VIEW"
            }),
            suspectedDefect: false,
            defectKind: null,
            runRef: null,
            workItemRef: null
          }));
        } else if (band.state === "QUALIFIED_NORMAL" && active !== undefined) {
          intents.push(Object.freeze({
            correlationKey: `provider:${window.providerRef}`,
            component: "provider_panel",
            class: "PROVIDER_DEGRADED",
            state: "CLEARED",
            severity: "SEVERE",
            impactCode: "IMPACT_CLEARED",
            firstFailedProbeAt: active.openedAt,
            detectedAt: input.windowEndedAt,
            evidence: Object.freeze({
              duration_seconds: Math.max(0, (input.windowEndedAt.getTime() - active.openedAt.getTime()) / 1_000)
            }),
            suspectedDefect: false,
            defectKind: null,
            runRef: null,
            workItemRef: null
          }));
          open.delete(window.providerRef);
        }
      }
      return Object.freeze({ intents: Object.freeze(intents), projections: Object.freeze(projections) });
    }
  });
}
