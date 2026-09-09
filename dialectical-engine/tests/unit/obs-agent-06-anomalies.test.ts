import { describe, expect, it } from "vitest";
import { classifyRunFailureWindow } from "../../apps/observation-agent/src/modules/throughput/anomalies.js";
import { classifyProviderWindow } from "../../apps/observation-agent/src/modules/provider-health/anomalies.js";

describe("OBS-06 anomaly bands", () => {
  it("requires four terminal runs and opens at the inclusive 50 percent boundary", () => {
    expect(classifyRunFailureWindow({ failed: 1, total: 3 }, { minimum: 4, ratio: 0.5 }))
      .toEqual({ state: "INSUFFICIENT_SAMPLE", ratio: 1 / 3 });
    expect(classifyRunFailureWindow({ failed: 2, total: 4 }, { minimum: 4, ratio: 0.5 }))
      .toEqual({ state: "OPEN", ratio: 0.5 });
    expect(classifyRunFailureWindow({ failed: 1, total: 4 }, { minimum: 4, ratio: 0.5 }))
      .toEqual({ state: "QUALIFIED_NORMAL", ratio: 0.25 });
  });

  it("requires ten provider calls and treats only PARSED as success", () => {
    expect(classifyProviderWindow(
      ["PARSED", "PARSE_FAILED", "SCHEMA_FAILED"],
      { minimum: 10, ratio: 0.5 }
    )).toEqual({ state: "INSUFFICIENT_SAMPLE", total: 3, failed: 2, ratio: 2 / 3 });
    expect(classifyProviderWindow(
      ["PARSED", "PARSED", "PARSED", "PARSED", "PARSED",
        "PARSE_FAILED", "PARSE_FAILED", "SCHEMA_FAILED", "UNPARSED", "UNPARSED"],
      { minimum: 10, ratio: 0.5 }
    )).toEqual({ state: "OPEN", total: 10, failed: 5, ratio: 0.5 });
  });

  it("rejects inconsistent or non-finite counters instead of fabricating health", () => {
    expect(() => classifyRunFailureWindow({ failed: 5, total: 4 }, { minimum: 4, ratio: 0.5 }))
      .toThrow("OBSERVATION_THROUGHPUT_WINDOW_INVALID");
    expect(() => classifyProviderWindow(["UNKNOWN"], { minimum: 1, ratio: 0.5 }))
      .toThrow("OBSERVATION_PROVIDER_STATUS_INVALID");
  });
});
