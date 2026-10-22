import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  declareHatchetWalkingSkeletonTask,
  reviewFailureOutcome,
  type RunnerFailureRecorder,
  type WalkingSkeletonRunner
} from "@debateai/runner";
import type { RunnerTaskControl } from "../../apps/runner/src/run-keep-alive.js";
import { createTaskExecutionCounter, type TaskExecutionCounter } from "../../apps/runner/src/runner-retirement.js";

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
  readonly recorded?: { runId: string; workItemId: string; reason: string; heldUntil?: Date | null }[];
  readonly previewExecutionTimeout?: "3600s";
  readonly executions?: TaskExecutionCounter;
}) {
  let declared: ((dispatch: unknown, context?: TaskContext) => Promise<unknown>) | null = null;
  declareHatchetWalkingSkeletonTask({
    client: { task: (definition: { fn: (dispatch: never) => Promise<unknown> }) => {
      declared = definition.fn as unknown as (dispatch: unknown, context?: TaskContext) => Promise<unknown>;
      return definition as never;
    } } as never,
    runner: { executeWorkItem: input.execute } as unknown as WalkingSkeletonRunner,
    failures: {
      recordTerminalFailure: async (entry: { runId: string; workItemId: string; reason: string; heldUntil?: Date | null }) => {
        input.recorded?.push(entry);
        return true;
      }
    } as unknown as RunnerFailureRecorder,
    workflowName: "walking-skeleton",
    engineRetries: 3,
    ...(input.previewExecutionTimeout === undefined ? {} : { previewExecutionTimeout: input.previewExecutionTimeout }),
    ...(input.executions === undefined ? {} : { executions: input.executions })
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
    const recorded: { runId: string; workItemId: string; reason: string; heldUntil?: Date | null }[] = [];
    const task = taskOver({
      recorded,
      execute: async () => { throw new TypedDomainError("RUNNER_CLAIM_LOST", "another copy holds the claim"); }
    });
    await expect(task({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, { abortController: new AbortController() }))
      .rejects.toMatchObject({ code: "RUNNER_CLAIM_LOST" });
    expect(recorded).toEqual([]);
  });

  it("leaves the work item alone when it belongs to another release", async () => {
    // Side-by-side spec §3: another release's debate is that release's to finish or fail, never this runner's.
    const recorded: { runId: string; workItemId: string; reason: string; heldUntil?: Date | null }[] = [];
    const task = taskOver({
      recorded,
      execute: async () => { throw new TypedDomainError("RUNNER_RELEASE_MISMATCH", "the debate belongs to another release"); }
    });
    await expect(task({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, { abortController: new AbortController() }))
      .rejects.toMatchObject({ code: "RUNNER_RELEASE_MISMATCH" });
    expect(recorded).toEqual([]);
  });

  it("leaves the work item alone when its release is retiring", async () => {
    // Side-by-side spec §4: the retiring release stops; the item is left as is for this release's backstop, which sets
    // it aside FAILED with the waiver (spec §4 step 3); the §3 fence keeps every other release off it.
    const recorded: { runId: string; workItemId: string; reason: string; heldUntil?: Date | null }[] = [];
    const task = taskOver({
      recorded,
      execute: async () => { throw new TypedDomainError("RUNNER_RETIRING", "this release is retiring"); }
    });
    await expect(task({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, { abortController: new AbortController() }))
      .rejects.toMatchObject({ code: "RUNNER_RETIRING" });
    expect(recorded).toEqual([]);
  });

  it("records a debate stopped at the limit as failed, under its own code", async () => {
    const recorded: { runId: string; workItemId: string; reason: string; heldUntil?: Date | null }[] = [];
    const task = taskOver({
      recorded,
      execute: async () => { throw new TypedDomainError("RUNNER_TIME_LIMIT_REACHED", "the debate ran out of time"); }
    });
    await expect(task({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, { abortController: new AbortController() }))
      .rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
    expect(recorded).toEqual([{
      runId: RUN_ID,
      workItemId: WORK_ITEM_ID,
      reason: "RUNNER_EXECUTION_FAILED:RUNNER_TIME_LIMIT_REACHED",
      // R7: this debate never told the task it claimed the item.
      heldUntil: null
    }]);
  });
});

/**
 * R7 (final review): two copies of one item can run in one process under the same worker id (a Hatchet retry, a second
 * dispatch). One that throws before its own claim must not FAIL the claim its sibling holds; so the task's failure
 * write names the copy's claim: none (null) when the debate never claimed, else the deadline this copy last set, read
 * when it fails (renewals move it), and battery fences on it as renewClaim does.
 */
describe("R7: the task's failure write is fenced on the copy's own claim", () => {
  it("names no claim when the debate threw before claiming, and its latest deadline once it claimed", async () => {
    const recorded: { runId: string; workItemId: string; reason: string; heldUntil?: Date | null }[] = [];
    const beforeClaim = taskOver({
      recorded,
      execute: async () => { throw new TypedDomainError("SCORING_OPERATOR_UNRESOLVED", "no scoring operator row"); }
    });
    await expect(beforeClaim({ runId: RUN_ID, workItemId: WORK_ITEM_ID })).rejects.toMatchObject({ code: "SCORING_OPERATOR_UNRESOLVED" });
    expect(recorded).toEqual([{ runId: RUN_ID, workItemId: WORK_ITEM_ID, reason: expect.any(String), heldUntil: null }]);

    recorded.length = 0;
    let deadline = new Date("2026-10-22T10:00:00.000Z");
    const renewed = new Date("2026-10-22T10:00:40.000Z");
    const afterClaim = taskOver({
      recorded,
      execute: async (_workItemId, control) => {
        control?.claimed?.(() => deadline);
        // A renewal after the claim: the write reads the deadline at failure time.
        deadline = renewed;
        throw new TypedDomainError("RUNNER_TIME_LIMIT_REACHED", "the debate ran out of time");
      }
    });
    await expect(afterClaim({ runId: RUN_ID, workItemId: WORK_ITEM_ID })).rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
    expect(recorded).toEqual([{
      runId: RUN_ID, workItemId: WORK_ITEM_ID, reason: "RUNNER_EXECUTION_FAILED:RUNNER_TIME_LIMIT_REACHED", heldUntil: renewed
    }]);
  });

  it("the runner tells the task its claim as soon as it holds it, then reads the keep-alive's deadline once that starts", () => {
    const source = readFileSync(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    const nothing = source.indexOf('if (claimed === null) return { kind: "NO_WORK" };');
    const told = source.indexOf("task?.claimed?.(() => claimHeldUntil());");
    const keepAlive = source.indexOf("const keepAlive = startRunKeepAlive({");
    const moved = source.indexOf("claimHeldUntil = () => keepAlive.heldUntil();");
    expect(nothing).toBeGreaterThan(0);
    expect(source.slice(nothing, told)).toContain("let claimHeldUntil = (): Date => claimed.claimDeadline;");
    expect(told).toBeLessThan(keepAlive);
    expect(moved).toBeGreaterThan(keepAlive);
    // No await between the claim and the first word, nor between the keep-alive and the second.
    expect(source.slice(nothing, told)).not.toContain("await ");
    expect(source.slice(keepAlive, moved)).not.toContain("await ");
    expect(source.split("task?.claimed?.(").length - 1).toBe(1);
  });
});

describe("side-by-side spec §4: the task counter covers the whole task", () => {
  it("counts the task while it runs, and after it ends or fails", async () => {
    const executions = createTaskExecutionCounter();
    let finish!: (result: { kind: string; answerId?: string }) => void;
    let started!: () => void;
    const running = new Promise<void>((resolve) => { started = resolve; });
    const task = taskOver({
      executions,
      execute: () => {
        started();
        return new Promise((resolve) => { finish = resolve; });
      }
    });
    const ended = task({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, { abortController: new AbortController() });
    await running;
    expect(executions.count()).toBe(1);
    finish({ kind: "COMPLETED", answerId: "answer:1" });
    await expect(ended).resolves.toEqual({ kind: "COMPLETED", answerId: "answer:1" });
    expect(executions.count()).toBe(0);

    const failing = taskOver({
      executions,
      execute: async () => { throw new TypedDomainError("RUNNER_TIME_LIMIT_REACHED", "the debate ran out of time"); }
    });
    await expect(failing({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, { abortController: new AbortController() }))
      .rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
    expect(executions.count()).toBe(0);
  });
});

describe("R2: the task names its work item while it runs", () => {
  it("is working on the dispatched item from the valid dispatch until the task ends or fails, never on a malformed one", async () => {
    const executions = createTaskExecutionCounter();
    let finish!: (result: { kind: string; answerId?: string }) => void;
    let started!: () => void;
    const running = new Promise<void>((resolve) => { started = resolve; });
    const task = taskOver({
      executions,
      execute: () => {
        started();
        return new Promise((resolve) => { finish = resolve; });
      }
    });
    const ended = task({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, { abortController: new AbortController() });
    await running;
    expect(executions.isWorkingOn(WORK_ITEM_ID)).toBe(true);
    finish({ kind: "NO_WORK" });
    await ended;
    expect(executions.isWorkingOn(WORK_ITEM_ID)).toBe(false);

    const failing = taskOver({
      executions,
      execute: async () => {
        expect(executions.isWorkingOn(WORK_ITEM_ID)).toBe(true);
        throw new TypedDomainError("RUNNER_TIME_LIMIT_REACHED", "the debate ran out of time");
      }
    });
    await expect(failing({ runId: RUN_ID, workItemId: WORK_ITEM_ID }, { abortController: new AbortController() }))
      .rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
    expect(executions.isWorkingOn(WORK_ITEM_ID)).toBe(false);

    await expect(failing({ runId: RUN_ID, workItemId: "not-a-uuid" })).rejects.toMatchObject({ code: "RUNNER_WORKFLOW_INPUT_INVALID" });
    expect(executions.isWorkingOn("not-a-uuid")).toBe(false);
    expect(executions.count()).toBe(0);
  });
});

describe("a stop is never mistaken for one unavailable review", () => {
  it.each(["RUNNER_CLAIM_LOST", "RUNNER_TIME_LIMIT_REACHED", "RUNNER_RETIRING"])("rethrows %s from the review catch", (code) => {
    expect(reviewFailureOutcome(new TypedDomainError(code, code))).toEqual({ kind: "RETHROW" });
  });
});
