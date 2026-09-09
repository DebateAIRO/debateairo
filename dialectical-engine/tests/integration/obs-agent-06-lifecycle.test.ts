import { describe, expect, it } from "vitest";
import { createRunFailureTracker } from "../../apps/observation-agent/src/modules/throughput/tracker.js";
import { createProviderHealthTracker } from "../../apps/observation-agent/src/modules/provider-health/tracker.js";

const start = new Date("2026-09-04T10:00:00.000Z");
const end = new Date("2026-09-04T11:00:00.000Z");

describe("OBS-06 anomaly lifecycle", () => {
  it("deduplicates run failure, ignores an insufficient recovery, and appends an immutable clear", () => {
    const tracker = createRunFailureTracker();
    const failing = { failed: 3, total: 4, windowStartedAt: start, windowEndedAt: end };
    const opened = tracker.observe(failing, { minimum: 4, ratio: 0.5, windowMinutes: 60 });
    expect(opened.intents).toHaveLength(1);
    expect(opened.intents[0]).toMatchObject({
      correlationKey: "run-failure", state: "OPEN", class: "THROUGHPUT_ANOMALY",
      component: "runner", severity: "SEVERE", impactCode: "IMPACT_RUN_FAILURE",
      suspectedDefect: false, defectKind: null, runRef: null, workItemRef: null
    });
    expect(tracker.observe(failing, { minimum: 4, ratio: 0.5, windowMinutes: 60 }).intents).toEqual([]);
    expect(tracker.observe(
      { failed: 1, total: 3, windowStartedAt: end, windowEndedAt: new Date(end.getTime() + 3_600_000) },
      { minimum: 4, ratio: 0.5, windowMinutes: 60 }
    ).intents).toEqual([]);
    const cleared = tracker.observe(
      { failed: 1, total: 4, windowStartedAt: end, windowEndedAt: new Date(end.getTime() + 3_600_000) },
      { minimum: 4, ratio: 0.5, windowMinutes: 60 }
    );
    expect(cleared.intents).toHaveLength(1);
    expect(cleared.intents[0]).toMatchObject({ state: "CLEARED", impactCode: "IMPACT_CLEARED" });
  });

  it("deduplicates and clears each provider independently", () => {
    const tracker = createProviderHealthTracker();
    const statuses = ["PARSED", "PARSED", "PARSED", "PARSED", "PARSED",
      "PARSE_FAILED", "PARSE_FAILED", "SCHEMA_FAILED", "UNPARSED", "UNPARSED"];
    const opened = tracker.observe([{ providerRef: "provider:alpha", statuses }], {
      minimum: 10, ratio: 0.5, windowMinutes: 5, windowStartedAt: start, windowEndedAt: end
    });
    expect(opened.intents[0]).toMatchObject({
      correlationKey: "provider:provider:alpha", state: "OPEN", class: "PROVIDER_DEGRADED",
      component: "provider_panel", severity: "SEVERE", impactCode: "IMPACT_PROVIDER",
      suspectedDefect: false, defectKind: null
    });
    const cleared = tracker.observe([{ providerRef: "provider:alpha", statuses: Array(10).fill("PARSED") }], {
      minimum: 10, ratio: 0.5, windowMinutes: 5, windowStartedAt: end,
      windowEndedAt: new Date(end.getTime() + 300_000)
    });
    expect(cleared.intents).toHaveLength(1);
    expect(cleared.intents[0]).toMatchObject({ state: "CLEARED", impactCode: "IMPACT_CLEARED" });
  });
});
