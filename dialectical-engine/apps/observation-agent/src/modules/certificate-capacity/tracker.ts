import type { Severity } from "../../core/signals.js";
import type { ModuleStatusProjection, SignalIntent, StatusState } from "../../core/types.js";
import type { CertificateCapacitySnapshot } from "./reader.js";

export type CertificateCapacityThresholds = Readonly<{
  degradedDays: number;
  severeDays: number;
}>;

type CertificateBand = "VALID" | "EXPIRING_14D" | "EXPIRING_3D" | "EXPIRED";
type OpenCertificate = { openedAt: Date; severity: Severity };

function band(days: number, thresholds: CertificateCapacityThresholds): CertificateBand {
  if (days < 0) return "EXPIRED";
  if (days <= thresholds.severeDays) return "EXPIRING_3D";
  if (days <= thresholds.degradedDays) return "EXPIRING_14D";
  return "VALID";
}

function severity(value: CertificateBand): Severity {
  if (value === "EXPIRED") return "FATAL";
  if (value === "EXPIRING_3D") return "SEVERE";
  return "DEGRADED";
}

function openSignal(
  snapshot: CertificateCapacitySnapshot,
  thresholds: CertificateCapacityThresholds,
  value: CertificateBand
): SignalIntent {
  const currentSeverity = severity(value);
  return Object.freeze({
    correlationKey: "tls-certificate-expiry", component: "tls_front_door", class: "CERT_EXPIRY",
    state: "OPEN", severity: currentSeverity, impactCode: "IMPACT_CERT",
    firstFailedProbeAt: snapshot.observedAt, detectedAt: snapshot.observedAt,
    evidence: Object.freeze({
      days: snapshot.days,
      threshold_days: value === "EXPIRING_14D" ? thresholds.degradedDays : value === "EXPIRING_3D" ? thresholds.severeDays : 0,
      not_after: snapshot.notAfter.toISOString(), unit: "days"
    }),
    suspectedDefect: false, defectKind: null, runRef: null, workItemRef: null
  });
}

function clearSignal(snapshot: CertificateCapacitySnapshot, active: OpenCertificate): SignalIntent {
  return Object.freeze({
    correlationKey: "tls-certificate-expiry", component: "tls_front_door", class: "CERT_EXPIRY",
    state: "CLEARED", severity: active.severity, impactCode: "IMPACT_CLEARED",
    firstFailedProbeAt: active.openedAt, detectedAt: snapshot.observedAt,
    evidence: Object.freeze({
      duration_seconds: Math.max(0, (snapshot.observedAt.getTime() - active.openedAt.getTime()) / 1_000)
    }),
    suspectedDefect: false, defectKind: null, runRef: null, workItemRef: null
  });
}

export function createCertificateCapacityTracker() {
  let active: OpenCertificate | undefined;
  return Object.freeze({
    observe(input: Readonly<{
      snapshot: CertificateCapacitySnapshot;
      thresholds: CertificateCapacityThresholds;
    }>): Readonly<{
      band: CertificateBand;
      intents: readonly SignalIntent[];
      projections: readonly ModuleStatusProjection[];
    }> {
      const value = band(input.snapshot.days, input.thresholds);
      const intents: SignalIntent[] = [];
      if (value === "VALID") {
        if (active !== undefined) intents.push(clearSignal(input.snapshot, active));
        active = undefined;
      } else {
        const currentSeverity = severity(value);
        if (active === undefined) {
          active = { openedAt: input.snapshot.observedAt, severity: currentSeverity };
          intents.push(openSignal(input.snapshot, input.thresholds, value));
        } else if (active.severity !== currentSeverity) {
          intents.push(clearSignal(input.snapshot, active));
          active = { openedAt: input.snapshot.observedAt, severity: currentSeverity };
          intents.push(openSignal(input.snapshot, input.thresholds, value));
        }
      }
      return Object.freeze({
        band: value,
        intents: Object.freeze(intents),
        projections: Object.freeze([Object.freeze({
          kind: "state", key: "certificate.state", state: value as StatusState,
          observedAt: input.snapshot.observedAt, view: "capacity"
        })])
      });
    }
  });
}
