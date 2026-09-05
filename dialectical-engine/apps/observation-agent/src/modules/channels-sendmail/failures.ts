import type { ObservationSignal } from "../../core/signals.js";
import type {
  ProbeObservation,
  RestoredOpenSignal,
  SignalIntent
} from "../../core/types.js";

export type SendmailDeliveryOutcome = "FAILED" | "DELIVERED";

let pendingResult: Readonly<{ outcome: SendmailDeliveryOutcome; at: Date }> | null = null;

export function recordSendmailFailure(at: Date): void {
  recordSendmailResult("FAILED", at);
}

export function recordSendmailResult(outcome: SendmailDeliveryOutcome, at: Date): void {
  pendingResult = Object.freeze({ outcome, at: new Date(at) });
}

export function consumeSendmailResult(): Readonly<{
  outcome: SendmailDeliveryOutcome;
  at: Date;
}> | null {
  const result = pendingResult;
  pendingResult = null;
  return result;
}

export function sendmailFailureObservation(at: Date): ProbeObservation {
  return sendmailDeliveryObservation("FAILED", at);
}

export function sendmailDeliveryObservation(
  outcome: SendmailDeliveryOutcome,
  at: Date
): ProbeObservation {
  return Object.freeze({
    component: "observation_agent",
    ok: outcome === "DELIVERED",
    class: "AGENT_SELF",
    probe: "sendmail_delivery",
    lastStatus: outcome,
    observedAt: at,
    management: "module",
    statusState: outcome === "DELIVERED" ? "UP" : "FAILED",
    status: Object.freeze([Object.freeze({
      kind: "state", key: "channel.sendmail.health",
      state: outcome === "DELIVERED" ? "UP" : "FAILED"
    })])
  });
}

export function sendmailFailureSignal(observation: ProbeObservation): SignalIntent {
  const at = observation.observedAt ?? new Date();
  return Object.freeze({
    correlationKey: "sendmail-failure",
    component: "observation_agent",
    class: "AGENT_SELF",
    state: "OPEN",
    severity: "DEGRADED",
    impactCode: "IMPACT_AGENT_DELIVERY",
    firstFailedProbeAt: at,
    detectedAt: at,
    evidence: Object.freeze({ reason: "DELIVERY_FAILURE", channel: "sendmail" }),
    suspectedDefect: false,
    defectKind: null,
    runRef: null,
    workItemRef: null
  });
}

function exactSendmailOpen(signal: ObservationSignal): boolean {
  const evidence = signal.evidence as Readonly<Record<string, unknown>>;
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
    && evidence.channel === "sendmail";
}

export function createSendmailFailureTracker(): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(opens: readonly RestoredOpenSignal[]): void;
  observe(observation: ProbeObservation): readonly SignalIntent[];
}> {
  let openedAt: Date | null = null;
  return Object.freeze({
    legacyCorrelationKey(signal): string | null {
      return exactSendmailOpen(signal) ? "sendmail-failure" : null;
    },
    restore(opens): void {
      if (opens.length > 1) throw new TypeError("OBSERVATION_SENDMAIL_RESTORE_INVALID");
      for (const restored of opens) {
        if (restored.correlationKey !== "sendmail-failure"
          || !exactSendmailOpen(restored.signal)
          || openedAt !== null) {
          throw new TypeError("OBSERVATION_SENDMAIL_RESTORE_INVALID");
        }
        openedAt = new Date(restored.signal.first_failed_probe_at!);
      }
    },
    observe(observation): readonly SignalIntent[] {
      if (observation.probe !== "sendmail_delivery"
        || observation.observedAt === undefined
        || (observation.lastStatus !== "FAILED" && observation.lastStatus !== "DELIVERED")) {
        return Object.freeze([]);
      }
      if (observation.lastStatus === "FAILED") {
        if (openedAt !== null) return Object.freeze([]);
        openedAt = new Date(observation.observedAt);
        return Object.freeze([sendmailFailureSignal(observation)]);
      }
      if (openedAt === null) return Object.freeze([]);
      const firstFailedAt = openedAt;
      openedAt = null;
      return Object.freeze([Object.freeze({
        correlationKey: "sendmail-failure",
        component: "observation_agent",
        class: "AGENT_SELF",
        state: "CLEARED",
        severity: "DEGRADED",
        impactCode: "IMPACT_CLEARED",
        firstFailedProbeAt: firstFailedAt,
        detectedAt: observation.observedAt,
        evidence: Object.freeze({
          duration_seconds: Math.max(0,
            (observation.observedAt.getTime() - firstFailedAt.getTime()) / 1_000)
        }),
        suspectedDefect: false,
        defectKind: null,
        runRef: null,
        workItemRef: null
      })]);
    }
  });
}
