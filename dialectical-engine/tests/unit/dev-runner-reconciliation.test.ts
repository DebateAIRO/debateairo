import { describe, expect, it, vi } from "vitest";
import {
  reconcileRunnerStartupWork,
  RunnerStartupReconciliationError
} from "../../apps/runner/src/runner-startup-reconciliation.js";
import { runnerTerminalFailureReason } from "../../apps/runner/src/index.js";
import { developmentRunnerClaimMs } from "../../apps/runner/src/dev-runner-process.js";

describe("development runner startup reconciliation", () => {
  it("redispatches every bounded ready or expired work item before readiness", async () => {
    const dispatch = vi.fn(async () => undefined);
    const items = Object.freeze([
      Object.freeze({ runId: "00000000-0000-4000-8000-000000000001", workItemId: "00000000-0000-4000-8000-000000000011" }),
      Object.freeze({ runId: "00000000-0000-4000-8000-000000000002", workItemId: "00000000-0000-4000-8000-000000000012" })
    ]);

    await expect(reconcileRunnerStartupWork({
      work: { listDispatchable: vi.fn(async () => items) },
      dispatcher: { dispatch }
    })).resolves.toEqual({ dispatched: 2 });
    expect(dispatch.mock.calls).toEqual(items.map((item) => [item]));
  });

  it("fails closed when the ready backlog reaches the startup cap", async () => {
    const items = Object.freeze(Array.from({ length: 101 }, (_, index) => Object.freeze({
      runId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      workItemId: `00000000-0000-4000-9000-${String(index).padStart(12, "0")}`
    })));
    await expect(reconcileRunnerStartupWork({
      work: { listDispatchable: vi.fn(async () => items) },
      dispatcher: { dispatch: vi.fn(async () => undefined) }
    })).rejects.toMatchObject({
      name: RunnerStartupReconciliationError.name,
      message: "RUNNER_STARTUP_BACKLOG_SATURATED"
    });
  });

  it("retains only bounded machine-readable dependency diagnostics", () => {
    expect(runnerTerminalFailureReason(Object.assign(new Error("sensitive detail"), { code: "42501" })))
      .toBe("RUNNER_EXECUTION_FAILED:DEPENDENCY_42501");
    expect(runnerTerminalFailureReason(new TypeError("CONTENT_ATTESTATION_INVALID")))
      .toBe("RUNNER_EXECUTION_FAILED:CONTENT_ATTESTATION_INVALID");
    expect(runnerTerminalFailureReason(new Error("raw private content must not escape")))
      .toBe("RUNNER_EXECUTION_FAILED:ERROR");
  });

  it("derives the claim lease from the sealed cooldown and longest call bound", () => {
    expect(developmentRunnerClaimMs()).toBe(1_741_000);
  });
});
