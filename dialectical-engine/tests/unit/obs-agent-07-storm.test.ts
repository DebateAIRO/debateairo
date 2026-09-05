import { describe, expect, it } from "vitest";
import { signalSchema, type ObservationSignal } from "../../apps/observation-agent/src/core/signals.js";
import {
  detectStorm,
  STORM_ROOT_ORDER
} from "../../apps/observation-agent/src/modules/routing/storm.js";

const components = ["ui", "api", "hatchet", "postgres", "tls_front_door"] as const;

function opened(component: typeof components[number], offsetSeconds: number, suffix: number): ObservationSignal {
  const detected = new Date(Date.parse("2026-09-05T10:00:00.000Z") + offsetSeconds * 1_000).toISOString();
  const impact = component === "postgres" ? "IMPACT_PG_DOWN"
    : component === "api" ? "IMPACT_API_DOWN"
      : component === "ui" ? "IMPACT_UI_DOWN"
        : component === "tls_front_door" ? "IMPACT_TLS_DOWN" : "IMPACT_HATCHET_DOWN";
  return signalSchema.parse({
    seq: 7_400 + suffix,
    signal_id: `70000000-0000-4000-8000-${String(7_400 + suffix).padStart(12, "0")}`,
    state: "OPEN", class: "INFRA_DOWN", component, severity: "FATAL", impact_code: impact,
    first_failed_probe_at: detected, detected_at: detected,
    evidence: { probe: "http_get", last_status: "FAILED" }, suspected_defect: false,
    defect_kind: null, run_ref: null, work_item_ref: null, threshold_version: 7,
    clears_signal_id: null, recorded_at: detected
  });
}

describe("OBS-07 storm detector", () => {
  it("forms only at five qualifying OPENs in a rolling 60-second window", () => {
    const signals = components.map((component, index) => opened(component, index * 10, index + 1));
    expect(detectStorm(signals.slice(0, 4), { count: 5, windowSeconds: 60 })).toBeNull();
    expect(detectStorm(signals, { count: 5, windowSeconds: 60 })).toMatchObject({
      rootComponent: "postgres",
      memberSignalIds: signals.map(({ signal_id }) => signal_id),
      fifthDetectedAt: "2026-09-05T10:00:40.000Z",
      windowStartedAt: "2026-09-05T10:00:00.000Z",
      windowEndsAt: "2026-09-05T10:01:00.000Z"
    });
    expect(detectStorm([
      opened("ui", 0, 11), opened("api", 10, 12), opened("hatchet", 20, 13),
      opened("postgres", 30, 14), opened("tls_front_door", 61, 15)
    ], { count: 5, windowSeconds: 60 })).toBeNull();
  });

  it("uses the frozen dependency-root priority", () => {
    expect(STORM_ROOT_ORDER).toEqual([
      "docker", "postgres", "hatchet", "api", "ui", "tls_front_door"
    ]);
    const signals = components.map((component, index) => opened(component, index, 20 + index));
    expect(detectStorm(signals, { count: 5, windowSeconds: 60 })?.rootComponent).toBe("postgres");
  });
});
