import type { ProbeObservation, SignalIntent } from "../../core/types.js";

let pendingFailure: Date | null = null;

export function recordSendmailFailure(at: Date): void {
  pendingFailure = new Date(at);
}

export function consumeSendmailFailure(): Date | null {
  const failure = pendingFailure;
  pendingFailure = null;
  return failure;
}

export function sendmailFailureObservation(at: Date): ProbeObservation {
  return Object.freeze({
    component: "observation_agent",
    ok: false,
    class: "AGENT_SELF",
    probe: "sendmail_delivery",
    lastStatus: "FAILED",
    observedAt: at,
    management: "module",
    statusState: "FAILED",
    status: Object.freeze([Object.freeze({
      kind: "state", key: "channel.sendmail.health", state: "FAILED"
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
