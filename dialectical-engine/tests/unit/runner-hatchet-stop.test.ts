import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  declareHatchetWalkingSkeletonTask,
  reviewFailureOutcome,
  type RunnerFailureRecorder,
  type WalkingSkeletonRunner
} from "@debateai/runner";
import type { RunnerTaskControl } from "../../apps/runner/src/run-keep-alive.js";

/**
 * L4-F9 repair, the Hatchet side (owner ruling 2026-10-11). The task used to
 * hand the debate nothing but a work item id, so Hatchet's cancel at the limit
 * never reached it: the SDK aborted a signal nobody read, waited a second and
 * forgot the task, while the debate went on spending — and the retry Hatchet
 * sends after a timeout started a second copy of it.
 *
 * Now the task hands the debate its stop signal, its "still working" call and
 * its limit, and the task's catch tells two stops apart: a copy whose claim was
 * taken leaves the work item to the copy that took it, and a debate stopped by
 * the limit is recorded as failed (the asker reads "stopped partway").
 */

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";

type TaskContext = Readonly<{
  retryCount?(): number;
  readonly abortController?: AbortController;
  refreshTimeout?(incrementBy: `${number}s`): Promise<void>;
}>;

function taskOver(input: {
  readonly execute: (workItemId: string, control?: RunnerTaskControl) => Promise<{ kind: string; answerId?: string }>;
  readonly recorded?: { runId: string; workItemId: string; reason: string }[];
  readonly previewExecutionTimeout?: "3600s";
}) {
  let declared: ((dispatch: unknown, context?: TaskContext) => Promise<unknown>) | null = null;
  declareHatchetWalkingSkeletonTask({
    client: { task: (definition: { fn: (dispatch: never) => Promise<unknown> }) => {
      declared = definition.fn as unknown as (dispatch: unknown, context?: TaskContext) => Promise<unknown>;
      return definition as never;
    } } as never,
    runner: { executeWorkItem: input.execute } as unknown as WalkingSkeletonRunner,
    failures: {
      recordTerminalFailure: async (entry: { runId: string; workItemId: string; reason: string }) => {
        input.recorded?.push(entry);
        return true;
      }
    } as unknown as RunnerFailureRecorder,
    workflowName: "walking-skeleton",
    engineRetries: 3,
    ...(input.previewExecutionTimeout === undefined ? {} : { previewExecutionTimeout: input.previewExecutionTimeout })
  });
  if (declared === null) throw new Error("the task declaration must register a function");
  return declared as (dispatch: unknown, context?: TaskContext) => Promise<unknown>;
}

describe("the debate hears Hatchet", () => {
  it("receives Hatchet's stop signal, its still-working call and the 60-minute limit", async () => {
    let received: RunnerTaskControl | undefined;
    const refreshed: string[] = [];
    const abortController = new AbortController();
    const task = taskOver({
      execute: async (_workItemId, control) => {
        received = control;
        await control?.refreshTimeout?.("90s");
        return { kind: "COMPLETED", answerId: "answer:1" };
      }
    });
    await expect(task({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, {
      abortController,
      refreshTimeout: async (incrementBy) => { refreshed.push(incrementBy); }
    })).resolves.toEqual({ kind: "COMPLETED", answerId: "answer:1" });
    expect(received?.signal).toBe(abortController.signal);
    expect(received?.executionLimitMs).toBe(3_600_000);
    expect(refreshed).toEqual(["90s"]);
  });

  it("gives the preview the same limit it registers", async () => {
    let received: RunnerTaskControl | undefined;
    const task = taskOver({
      previewExecutionTimeout: "3600s",
      execute: async (_workItemId, control) => { received = control; return { kind: "NO_WORK" }; }
    });
    await task({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, { abortController: new AbortController() });
    expect(received?.executionLimitMs).toBe(3_600_000);
  });

  it("starts the debate even when the context's accessors throw", async () => {
    let received: RunnerTaskControl | undefined;
    const context = {
      get abortController(): AbortController { throw new Error("accessor exploded"); }
    };
    const task = taskOver({
      execute: async (_workItemId, control) => { received = control; return { kind: "NO_WORK" }; }
    });
    await expect(task({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, context)).resolves.toEqual({ kind: "NO_WORK" });
    expect(received?.signal).toBeUndefined();
    expect(received?.executionLimitMs).toBe(3_600_000);
  });
});

describe("the task's catch tells the two stops apart", () => {
  it("leaves the work item alone when another copy holds the claim", async () => {
    const recorded: { runId: string; workItemId: string; reason: string }[] = [];
    const task = taskOver({
      recorded,
      execute: async () => { throw new TypedDomainError("RUNNER_CLAIM_LOST", "another copy holds the claim"); }
    });
    await expect(task({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, { abortController: new AbortController() }))
      .rejects.toMatchObject({ code: "RUNNER_CLAIM_LOST" });
    expect(recorded).toEqual([]);
  });

  it("records a debate stopped at the limit as failed, under its own code", async () => {
    const recorded: { runId: string; workItemId: string; reason: string }[] = [];
    const task = taskOver({
      recorded,
      execute: async () => { throw new TypedDomainError("RUNNER_TIME_LIMIT_REACHED", "the debate ran out of time"); }
    });
    await expect(task({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, { abortController: new AbortController() }))
      .rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
    expect(recorded).toEqual([{
      runId: RUN_ID,
      workItemId: WORK_ITEM_ID,
      reason: "RUNNER_EXECUTION_FAILED:RUNNER_TIME_LIMIT_REACHED"
    }]);
  });
});

describe("a stop is never mistaken for one unavailable review", () => {
  it.each(["RUNNER_CLAIM_LOST", "RUNNER_TIME_LIMIT_REACHED"])("rethrows %s from the review catch", (code) => {
    expect(reviewFailureOutcome(new TypedDomainError(code, code))).toEqual({ kind: "RETHROW" });
  });
});
