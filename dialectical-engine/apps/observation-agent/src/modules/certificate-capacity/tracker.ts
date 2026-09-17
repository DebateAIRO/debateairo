import type { ObservationSignal, Severity } from "../../core/signals.js";
import type {
  ModuleStatusProjection, RestoredOpenSignal, SignalIntent, StatusState
} from "../../core/types.js";
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

function restoredCertificateKey(signal: ObservationSignal): string | null {
  const evidence = signal.evidence as Readonly<Record<string, unknown>>;
  const days = evidence.days;
  const thresholdDays = evidence.threshold_days;
  const severityMatches = typeof days === "number"
    && Number.isFinite(days)
    && typeof thresholdDays === "number"
    && Number.isFinite(thresholdDays)
    && thresholdDays >= 0
    && (days < 0
      ? signal.severity === "FATAL" && thresholdDays === 0
      : days <= thresholdDays
        && (signal.severity === "DEGRADED" || signal.severity === "SEVERE"));
  return signal.state === "OPEN"
    && signal.component === "tls_front_door"
    && signal.class === "CERT_EXPIRY"
    && severityMatches
    && signal.impact_code === "IMPACT_CERT"
    && signal.first_failed_probe_at !== null
    && signal.suspected_defect === false
    && signal.defect_kind === null
    && signal.run_ref === null
    && signal.work_item_ref === null
    && Object.keys(evidence).sort().join(":") === "days:not_after:threshold_days:unit"
    && typeof evidence.not_after === "string"
    && Number.isFinite(new Date(evidence.not_after).getTime())
    && evidence.unit === "days"
    ? "tls-certificate-expiry"
    : null;
}

export function createCertificateCapacityTracker() {
  let active: OpenCertificate | undefined;
  return Object.freeze({
    legacyCorrelationKey: restoredCertificateKey,
    restore(openSignals: readonly RestoredOpenSignal[]): void {
      if (openSignals.length > 1) throw new TypeError("OBSERVATION_CERTIFICATE_RESTORE_INVALID");
      const restored = openSignals[0];
      if (restored === undefined) return;
      if (restoredCertificateKey(restored.signal) !== restored.correlationKey) {
        throw new TypeError("OBSERVATION_CERTIFICATE_RESTORE_INVALID");
      }
      active = {
        openedAt: new Date(restored.signal.detected_at),
        severity: restored.signal.severity
      };
    },
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
