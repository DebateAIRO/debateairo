import { describe, expect, it, vi } from "vitest";
import { readCertificateCapacity } from "../../apps/observation-agent/src/modules/certificate-capacity/reader.js";
import { createCertificateCapacityModule } from "../../apps/observation-agent/src/modules/certificate-capacity/module.js";
import { createCertificateCapacityTracker } from "../../apps/observation-agent/src/modules/certificate-capacity/tracker.js";

const now = new Date("2026-09-03T12:00:00.000Z");
const targetFragment = Object.freeze({
  basename: "OBS-05.json",
  targets: Object.freeze([Object.freeze({
    component: "tls_front_door", kind: "certificate",
    path: ".local/dev-auth/tls/localhost.pem"
  })]),
  configuration: Object.freeze({})
});

describe("OBS-05 certificate capacity", () => {
  it("reads only the declared public leaf and records whole expiry days at boot/daily", async () => {
    const read = vi.fn(async () => Buffer.from("public certificate fixture"));
    const snapshot = await readCertificateCapacity(targetFragment, now, {
      read,
      notAfter: () => new Date("2026-09-18T23:59:59.000Z")
    });
    expect(read).toHaveBeenCalledExactlyOnceWith(".local/dev-auth/tls/localhost.pem");
    expect(snapshot).toEqual({ days: 15, notAfter: new Date("2026-09-18T23:59:59.000Z"), observedAt: now });

    const module = createCertificateCapacityModule({ readSnapshot: async () => snapshot });
    expect(module.cadence).toEqual({ intervalMs: 86_400_000, timeoutMs: 2_000 });
    expect(module.targetFragmentBasename).toBe("OBS-05.json");
    const observations = await module.probe({
      now, timeoutMs: 2_000, databaseUrl: "unused", stateDir: "unused", targets: [],
      targetFragment, configuration: {}, thresholds: {}
    });
    expect(module.samples(observations, { now })).toEqual([
      { metricKey: "capacity.certificate.days", value: 15, observedAt: now }
    ]);
  });

  it("moves through 14d, 3d and expired bands, then clears on a later certificate", () => {
    const tracker = createCertificateCapacityTracker();
    const thresholds = Object.freeze({ degradedDays: 14, severeDays: 3 });
    const observe = (days: number, notAfter: Date) => tracker.observe({
      snapshot: Object.freeze({ days, notAfter, observedAt: now }), thresholds
    });
    expect(observe(15, new Date("2026-09-19T00:00:00.000Z")).intents).toEqual([]);
    expect(observe(14, new Date("2026-09-17T12:00:00.000Z")).intents)
      .toMatchObject([{ state: "OPEN", severity: "DEGRADED", impactCode: "IMPACT_CERT" }]);
    expect(observe(3, new Date("2026-09-06T12:00:00.000Z")).intents)
      .toMatchObject([{ state: "CLEARED" }, { state: "OPEN", severity: "SEVERE" }]);
    expect(observe(-1, new Date("2026-09-02T12:00:00.000Z")).intents)
      .toMatchObject([{ state: "CLEARED" }, { state: "OPEN", severity: "FATAL" }]);
    expect(observe(365, new Date("2027-09-03T12:00:00.000Z")).intents)
      .toMatchObject([{ state: "CLEARED", severity: "FATAL", impactCode: "IMPACT_CLEARED" }]);
  });
});
