import type { DeliveryResultEnvelope, ObservationSignal } from "../../core/signals.js";
import type { RestoredOpenSignal, SignalIntent } from "../../core/types.js";

export type RoutedChannelResult = Readonly<{
  channel: "osascript" | "sendmail" | "kanban";
  outcome: "DELIVERED" | "FAILED" | "RATE_LIMITED" | "MUTED";
  at: Date;
}>;

type DeliveryChannel = RoutedChannelResult["channel"];
type OpenHealth = Readonly<{ failedAt: Date }>;

const CHANNELS = ["osascript", "sendmail", "kanban"] as const;

function exactDeliveryHealthOpen(signal: ObservationSignal): DeliveryChannel | null {
  const evidence = signal.evidence as Readonly<Record<string, unknown>>;
  const channel = evidence.channel;
  return signal.state === "OPEN"
    && signal.component === "observation_agent"
    && signal.class === "AGENT_SELF"
    && signal.severity === "DEGRADED"
    && signal.impact_code === "IMPACT_AGENT_DELIVERY"
    && signal.first_failed_probe_at !== null
    && signal.suspected_defect === false
    && signal.defect_kind === null
    && signal.run_ref === null
    && signal.work_item_ref === null
    && Object.keys(evidence).length === 2
    && evidence.reason === "DELIVERY_FAILURE"
    && typeof channel === "string"
    && CHANNELS.includes(channel as DeliveryChannel)
    ? channel as DeliveryChannel
    : null;
}

export function deliveryHealthLegacyCorrelationKey(signal: ObservationSignal): string | null {
  const channel = exactDeliveryHealthOpen(signal);
  return channel === null ? null : `delivery:${channel}`;
}

function openIntent(channel: DeliveryChannel, at: Date): SignalIntent {
  return Object.freeze({
    correlationKey: `delivery:${channel}`,
    component: "observation_agent",
    class: "AGENT_SELF",
    state: "OPEN",
    severity: "DEGRADED",
    impactCode: "IMPACT_AGENT_DELIVERY",
    firstFailedProbeAt: new Date(at),
    detectedAt: new Date(at),
    evidence: Object.freeze({ reason: "DELIVERY_FAILURE", channel }),
    suspectedDefect: false,
    defectKind: null,
    runRef: null,
    workItemRef: null
  });
}

function clearIntent(channel: DeliveryChannel, opened: OpenHealth, at: Date): SignalIntent {
  return Object.freeze({
    correlationKey: `delivery:${channel}`,
    component: "observation_agent",
    class: "AGENT_SELF",
    state: "CLEARED",
    severity: "DEGRADED",
    impactCode: "IMPACT_CLEARED",
    firstFailedProbeAt: new Date(opened.failedAt),
    detectedAt: new Date(at),
    evidence: Object.freeze({
      duration_seconds: Math.max(0, (at.getTime() - opened.failedAt.getTime()) / 1_000)
    }),
    suspectedDefect: false,
    defectKind: null,
    runRef: null,
    workItemRef: null
  });
}

function resultFromEnvelope(envelope: DeliveryResultEnvelope): RoutedChannelResult {
  const completedAt = envelope.delivery.delivered_at ?? envelope.delivery.attempted_at;
  return Object.freeze({
    channel: envelope.delivery.channel,
    outcome: envelope.delivery.outcome,
    at: new Date(completedAt)
  });
}

export function createDeliveryHealthTracker(
  restoredResults: readonly DeliveryResultEnvelope[]
): Readonly<{
  record(result: RoutedChannelResult): void;
  restore(opens: readonly RestoredOpenSignal[]): void;
  drain(): readonly SignalIntent[];
}> {
  const latestResult = new Map<DeliveryChannel, RoutedChannelResult>();
  for (const envelope of restoredResults) {
    const result = resultFromEnvelope(envelope);
    if (result.outcome === "FAILED" || result.outcome === "DELIVERED") {
      latestResult.set(result.channel, result);
    }
  }
  const open = new Map<DeliveryChannel, OpenHealth>();
  let pending: SignalIntent[] = [];
  let restored = false;

  function apply(result: RoutedChannelResult): void {
    if (!(result.at instanceof Date) || !Number.isFinite(result.at.getTime())
      || !CHANNELS.includes(result.channel)
      || !["DELIVERED", "FAILED", "RATE_LIMITED", "MUTED"].includes(result.outcome)) {
      throw new TypeError("OBSERVATION_DELIVERY_HEALTH_RESULT_INVALID");
    }
    if (result.outcome === "RATE_LIMITED" || result.outcome === "MUTED") return;
    const opened = open.get(result.channel);
    if (result.outcome === "FAILED") {
      if (opened !== undefined) return;
      const health = Object.freeze({ failedAt: new Date(result.at) });
      open.set(result.channel, health);
      pending.push(openIntent(result.channel, result.at));
      return;
    }
    if (opened === undefined) return;
    open.delete(result.channel);
    pending.push(clearIntent(result.channel, opened, result.at));
  }

  return Object.freeze({
    record(result): void {
      if (!restored) throw new TypeError("OBSERVATION_DELIVERY_HEALTH_NOT_RESTORED");
      apply(result);
    },
    restore(opens): void {
      if (restored) throw new TypeError("OBSERVATION_DELIVERY_HEALTH_RESTORE_INVALID");
      restored = true;
      const seen = new Set<DeliveryChannel>();
      for (const restoredOpen of opens) {
        const channel = exactDeliveryHealthOpen(restoredOpen.signal);
        if (channel === null
          || restoredOpen.correlationKey !== `delivery:${channel}`
          || seen.has(channel)) {
          throw new TypeError("OBSERVATION_DELIVERY_HEALTH_RESTORE_INVALID");
        }
        seen.add(channel);
        open.set(channel, Object.freeze({
          failedAt: new Date(restoredOpen.signal.first_failed_probe_at!)
        }));
      }
      for (const channel of CHANNELS) {
        const result = latestResult.get(channel);
        if (result !== undefined) apply(result);
      }
    },
    drain(): readonly SignalIntent[] {
      const intents = Object.freeze(pending);
      pending = [];
      return intents;
    }
  });
}
