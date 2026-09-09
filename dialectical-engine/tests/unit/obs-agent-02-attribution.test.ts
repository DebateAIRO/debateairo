import { describe, expect, it } from "vitest";
import { createExpectedSetTracker } from "../../apps/observation-agent/src/modules/expectations/state.js";
import type { ProbeObservation } from "../../apps/observation-agent/src/core/types.js";

const members = ["api", "ui", "tls_front_door", "runner"] as const;
const at = (second: number) => new Date(1_788_422_400_000 + second * 1_000);

function observations(down: readonly (typeof members)[number][] = []): readonly ProbeObservation[] {
  return members.map((component) => ({
    component, ok: !down.includes(component), class: "INFRA_DOWN" as const,
    probe: component === "runner" ? "process_presence" : "http_get",
    target: component === "runner" ? "apps/runner/src/main.ts" : `${component}:/health`,
    lastStatus: down.includes(component) ? (component === "runner" ? "ABSENT" : 0) : (component === "runner" ? "PRESENT" : 200)
  }));
}

function tracker() {
  return createExpectedSetTracker({ openAfterFailures: 2, clearAfterSuccesses: 2, groupMemoryMs: 600_000 });
}

describe("OBS-02 dev-stack attribution", () => {
  it("collapses a recent whole-stack exit into one composite and clears after two healthy cycles", () => {
    const state = tracker();
    state.observe(observations(), at(0));
    state.observe(observations(), at(5));
    state.observe(observations(members), at(10));
    const exited = state.observe(observations(members), at(15));
    expect(exited.groupState).toBe("EXITED");
    expect(exited.intents).toEqual([expect.objectContaining({
      correlationKey: "dev_stack:infra_down", component: "dev_stack", class: "INFRA_DOWN",
      state: "OPEN", severity: "SEVERE", impactCode: "IMPACT_DEV_STACK_EXITED",
      evidence: {
        probe: "expected_set", members: ["api", "ui", "tls_front_door", "runner"],
        last_status: "ABSENT"
      }
    })]);
    expect(exited.intents.some((intent) => intent.component !== "dev_stack")).toBe(false);
    expect(state.observe(observations(["api"]), at(20))).toMatchObject({ groupState: "EXITED", intents: [] });
    expect(state.observe(observations(), at(25))).toMatchObject({ groupState: "EXITED", intents: [] });
    expect(state.observe(observations(), at(30)).intents).toEqual([expect.objectContaining({
      component: "dev_stack", state: "CLEARED", impactCode: "IMPACT_CLEARED"
    })]);
  });

  it("opens and clears only the failed member during a partial fault with component-owned copy", () => {
    const state = tracker();
    state.observe(observations(), at(0));
    state.observe(observations(), at(5));
    state.observe(observations(["api"]), at(10));
    const partial = state.observe(observations(["api"]), at(15));
    expect(partial.groupState).toBe("PARTIAL");
    expect(partial.intents).toEqual([expect.objectContaining({
      correlationKey: "member:api:infra_down", component: "api", severity: "SEVERE",
      impactCode: "IMPACT_API_DOWN", state: "OPEN"
    })]);
    state.observe(observations(), at(20));
    expect(state.observe(observations(), at(25)).intents).toEqual([expect.objectContaining({
      correlationKey: "member:api:infra_down", component: "api",
      impactCode: "IMPACT_CLEARED", state: "CLEARED"
    })]);
  });
});
