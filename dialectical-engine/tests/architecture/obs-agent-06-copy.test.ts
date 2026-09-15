import { describe, expect, it } from "vitest";
import { createProviderHealthModule } from "../../apps/observation-agent/src/modules/provider-health/module.js";

const database = Object.freeze({
  async withClient<T>(): Promise<T> { throw new Error("UNUSED_DATABASE_PORT"); }
});

describe("OBS-06 copy and latency boundary", () => {
  it("publishes only the fixed NOT OBSERVABLE provider-latency projection", async () => {
    const module = createProviderHealthModule({ readCalls: async () => [] });
    const observations = await module.probe({
      now: new Date("2026-09-04T11:00:00.000Z"), timeoutMs: 2_000,
      database, stateDir: "/tmp/unused", targets: [],
      targetFragment: null, configuration: {}, thresholds: {}
    });
    const status = observations[0]?.status ?? [];
    expect(status).toContainEqual({
      kind: "template", key: "provider_latency",
      template: "PROVIDER_LATENCY_NOT_OBSERVABLE", view: "throughput"
    });
    expect(status.filter((projection) => projection.key.includes("latency")))
      .toHaveLength(1);
  });
});
