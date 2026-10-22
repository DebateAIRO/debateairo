import { describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { declareHatchetWalkingSkeletonTask, type RunnerExecutionResult } from "@debateai/runner";

describe("LOAD-01 production Hatchet terminal recording", () => {
  it("records a typed terminal before rethrowing a mid-review failure", async () => {
    let taskFn: ((dispatch: { runId: string; workItemId: string }) => Promise<unknown>) | undefined;
    const client = {
      task: vi.fn((definition: { fn: typeof taskFn }) => {
        taskFn = definition.fn;
        return {};
      })
    };
    const runner = {
      executeWorkItem: vi.fn<() => Promise<RunnerExecutionResult>>().mockRejectedValue(
        new TypedDomainError("NODE_REVIEW_UNAVAILABLE", "private provider diagnostic")
      )
    };
    const recordTerminalFailure = vi.fn().mockResolvedValue(true);

    declareHatchetWalkingSkeletonTask({
      client: client as never,
      runner: runner as never,
      failures: { recordTerminalFailure },
      workflowName: "runner:test",
      engineRetries: 0
    } as never);

    await expect(taskFn?.({ runId: "11111111-1111-4111-8111-111111111111", workItemId: "22222222-2222-4222-8222-222222222222" })).rejects.toMatchObject({
      code: "NODE_REVIEW_UNAVAILABLE"
    });
    expect(recordTerminalFailure).toHaveBeenCalledWith({
      runId: "11111111-1111-4111-8111-111111111111",
      workItemId: "22222222-2222-4222-8222-222222222222",
      reason: "RUNNER_EXECUTION_FAILED:NODE_REVIEW_UNAVAILABLE"
    });
  });
});
