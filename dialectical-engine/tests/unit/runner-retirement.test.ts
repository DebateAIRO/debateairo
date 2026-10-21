import { describe, expect, it } from "vitest";
import { createRunnerRetirementSignal, createTaskExecutionCounter } from "../../apps/runner/src/runner-retirement.js";

/**
 * Side-by-side spec §4: a retiring release stops claiming and lets the calls in flight settle, and the hand-over waits
 * until no task of it is running. The counter counts the running tasks (each whole task handler, the verdict story
 * included); the signal carries the two stops, which start off and never go back.
 */
describe("the task counter and the retirement signal (side-by-side §4)", () => {
  it("counts each entered task until it leaves, and a second leave of the same task changes nothing", () => {
    const executions = createTaskExecutionCounter();
    expect(executions.count()).toBe(0);
    const leaveFirst = executions.enter();
    executions.enter();
    expect(executions.count()).toBe(2);
    leaveFirst();
    expect(executions.count()).toBe(1);
    leaveFirst();
    expect(executions.count()).toBe(1);
  });

  it("starts with claims and calls allowed, and each stop turns on only its own half", () => {
    const signal = createRunnerRetirementSignal();
    expect(signal.claimsStopped()).toBe(false);
    expect(signal.callsStopped()).toBe(false);
    signal.stopClaims();
    expect(signal.claimsStopped()).toBe(true);
    expect(signal.callsStopped()).toBe(false);
    signal.stopCalls();
    expect(signal.callsStopped()).toBe(true);
    expect(signal.claimsStopped()).toBe(true);
  });

  it("never goes back: stopping again keeps both stops on", () => {
    const signal = createRunnerRetirementSignal();
    signal.stopCalls();
    signal.stopClaims();
    signal.stopCalls();
    signal.stopClaims();
    expect(signal.claimsStopped()).toBe(true);
    expect(signal.callsStopped()).toBe(true);
  });
});
