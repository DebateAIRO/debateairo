import { describe, expect, it } from "vitest";
import { createExpectedSetTracker } from "../../apps/observation-agent/src/modules/expectations/state.js";
import type { ProbeObservation } from "../../apps/observation-agent/src/core/types.js";

const at = (second: number) => new Date(`2026-09-03T08:${String(Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}.000Z`);
const members = ["api", "ui", "tls_front_door", "runner"] as const;

function cycle(ok: boolean): readonly ProbeObservation[] {
  return members.map((component) => ({
    component,
    ok,
    class: "INFRA_DOWN" as const,
    probe: component === "runner" ? "process_presence" : "http_get",
    target: component === "runner" ? "apps/runner/src/main.ts" : `${component}:/health`,
    lastStatus: ok ? (component === "runner" ? "PRESENT" : 200) : (component === "runner" ? "ABSENT" : 0)
  }));
}

describe("OBS-02 expected-set transitions", () => {
  it("emits one digest-only NOT_RUNNING INFO per cold down period and clears on RUNNING", () => {
    const tracker = createExpectedSetTracker({
      openAfterFailures: 2, clearAfterSuccesses: 2, groupMemoryMs: 600_000
    });

    expect(tracker.observe(cycle(false), at(0))).toMatchObject({ groupState: "PARTIAL", intents: [] });
    const down = tracker.observe(cycle(false), at(5));
    expect(down.groupState).toBe("NOT_RUNNING");
    expect(down.intents).toEqual([expect.objectContaining({
      correlationKey: "dev_stack:infra_down",
      component: "dev_stack",
      class: "INFRA_DOWN",
      state: "OPEN",
      severity: "INFO",
      impactCode: "IMPACT_DEV_STACK_NOT_RUNNING",
      evidence: {
        probe: "expected_set",
        members: ["api", "ui", "tls_front_door", "runner"],
        last_status: "NOT_RUNNING"
      }
    })]);
    expect(tracker.observe(cycle(false), at(10)).intents).toEqual([]);
    expect(tracker.observe(cycle(false), at(15)).intents).toEqual([]);

    expect(tracker.observe(cycle(true), at(20)).groupState).toBe("PARTIAL");
    const running = tracker.observe(cycle(true), at(25));
    expect(running.groupState).toBe("RUNNING");
    expect(running.intents).toEqual([expect.objectContaining({
      correlationKey: "dev_stack:infra_down", state: "CLEARED", impactCode: "IMPACT_CLEARED"
    })]);
  });
});
