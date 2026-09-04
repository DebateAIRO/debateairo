import type { ModuleStatusProjection, SignalIntent } from "../../core/types.js";
import { classifyProviderWindow } from "./anomalies.js";

type ProviderWindow = Readonly<{ providerRef: string; statuses: readonly string[] }>;
type OpenProvider = Readonly<{ openedAt: Date }>;

function safeKey(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized.length === 0 ? "unknown" : normalized.slice(0, 64);
}

export function createProviderHealthTracker(): Readonly<{
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
