import type {
  Module, ModuleConfigurationObject, SampleIntent, SignalIntent
} from "../../core/types.js";
import { readCertificateCapacity, type CertificateCapacitySnapshot } from "./reader.js";
import { createCertificateCapacityTracker } from "./tracker.js";

export type CertificateCapacityModuleDependencies = Readonly<{
  readSnapshot(
    targetFragment: Parameters<typeof readCertificateCapacity>[0],
    at: Date,
    repoRoot: string
  ): Promise<CertificateCapacitySnapshot>;
}>;

const productionDependencies: CertificateCapacityModuleDependencies = Object.freeze({
  readSnapshot: (targetFragment, at, repoRoot) =>
    readCertificateCapacity(targetFragment, at, undefined, repoRoot)
});

function numeric(configuration: ModuleConfigurationObject, key: string, fallback: number): number {
  const value = configuration[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function createCertificateCapacityModule(
  dependencies: Partial<CertificateCapacityModuleDependencies> = {}
): Module {
  const resolved = Object.freeze({ ...productionDependencies, ...dependencies });
  const tracker = createCertificateCapacityTracker();
  let pendingSamples: readonly SampleIntent[] = Object.freeze([]);
  let pendingSignals: readonly SignalIntent[] = Object.freeze([]);
  return Object.freeze({
    name: "certificate-capacity",
    cadence: Object.freeze({ intervalMs: 86_400_000, timeoutMs: 2_000 }),
    targetFragmentBasename: "OBS-05.json",
    async probe(ctx) {
      const snapshot = await resolved.readSnapshot(ctx.targetFragment, ctx.now, ctx.repoRoot);
      const cycle = tracker.observe({
        snapshot,
        thresholds: Object.freeze({
          degradedDays: numeric(ctx.thresholds, "expiry_degraded_days", 14),
          severeDays: numeric(ctx.thresholds, "expiry_severe_days", 3)
        })
      });
      pendingSamples = Object.freeze([Object.freeze({
        metricKey: "capacity.certificate.days", value: snapshot.days, observedAt: snapshot.observedAt
      })]);
      pendingSignals = cycle.intents;
      return Object.freeze([Object.freeze({
        component: "tls_front_door", ok: cycle.band === "VALID", class: "CERT_EXPIRY",
        probe: "certificate_expiry", lastStatus: cycle.band, observedAt: snapshot.observedAt,
        management: "module", statusState: cycle.band,
        status: Object.freeze([
          Object.freeze({
            kind: "metric", key: "certificate.days", value: snapshot.days,
            unit: "COUNT", observedAt: snapshot.observedAt, view: "capacity"
          }),
          ...cycle.projections
        ])
      })]);
    },
    samples() {
      const current = pendingSamples;
      pendingSamples = Object.freeze([]);
      return current;
    },
    signals() {
      const current = pendingSignals;
      pendingSignals = Object.freeze([]);
      return current;
    }
  });
}

export default createCertificateCapacityModule();
