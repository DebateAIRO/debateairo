// V4 start step, Task 57e (the owner's 6 Nov rule: "re-use what we already paid for"; confirmed plan, card "Build this (Recommended)"):
// A QUESTION THAT FAILS ON OUR SIDE IS RETRIED ONCE BY THE SERVER, A FEW MINUTES LATER, FROM WHERE IT STOPPED. The Hatchet task's catch
// parks a debate that stopped on our side (a provider out, a time limit, a fault of ours) instead of failing it: its claim is kept until
// the delay passes and the work item's one retry is recorded (0165's core.work_item_retry, through the work repository's parkForRetry).
// The lapsed re-send then hands it to a runner again, which resumes it from what it saved (0119's true resume: every answered call is
// replayed, never bought again). A second stop is not retried: the debate is FAILED as today. A stop the person caused (a debate they
// deleted while it ran), the month wall and a spending wall are never retried. Without the port (fixtures, an older wiring) today's
// behaviour stands. Every id here is made up.
import { describe, expect, it, vi } from "vitest";
import { RUN_PATH_SET_REFUSALS } from "@debateai/battery";
import { TypedDomainError } from "@debateai/kernel";
import { ProviderCallFailedError } from "@debateai/providers";
import { declareHatchetWalkingSkeletonTask, runFailureRetriesOnce, type RunnerExecutionResult } from "@debateai/runner";

const DISPATCH = Object.freeze({ runId: "11111111-1111-4111-8111-111111111111", workItemId: "22222222-2222-4222-8222-222222222222" });
const OUTAGE = (): Error => new ProviderCallFailedError(new Error("vendor unreachable"), 3, "FAILED", "33333333-3333-4333-8333-333333333333");
type Park = "PARKED" | "RETRIED" | "NOT_HELD";
type Step = Readonly<{ throws: unknown } | { result: RunnerExecutionResult }>;

/** The task as main.ts declares it, over a runner whose dispatches answer `steps` in turn and a work store that keeps one retry per item. */
function taskOver(steps: readonly Step[], options: Readonly<{ port?: false; park?: (call: number) => Promise<Park> }> = {}) {
  let taskFn: ((dispatch: typeof DISPATCH) => Promise<unknown>) | undefined;
  const client = { task: vi.fn((definition: { fn: typeof taskFn }) => { taskFn = definition.fn; return {}; }) };
  let dispatched = 0;
  const runner = {
    executeWorkItem: vi.fn(async (): Promise<RunnerExecutionResult> => {
      const step = steps[dispatched++]!;
      if ("throws" in step) throw step.throws;
      return step.result;
    })
  };
  const retried = new Set<string>();
  const parks: unknown[] = [];
  const recordTerminalFailure = vi.fn(async () => true);
  const parkForRetry = vi.fn(async (input: Readonly<{ runId: string; workItemId: string }>): Promise<Park> => {
    parks.push(input);
    if (options.park !== undefined) return options.park(parks.length);
    if (retried.has(input.workItemId)) return "RETRIED";
    retried.add(input.workItemId);
    return "PARKED";
  });
  declareHatchetWalkingSkeletonTask({
    client: client as never,
    runner: runner as never,
    failures: options.port === false ? { recordTerminalFailure } : { recordTerminalFailure, parkForRetry },
    workflowName: "runner:test",
    engineRetries: 0
  } as never);
  const dispatch = (): Promise<unknown> => taskFn!(DISPATCH);
  const outcome = (): Promise<Readonly<{ ok: unknown } | { error: Error & { code?: string } }>> =>
    dispatch().then((ok) => ({ ok }), (error: Error & { code?: string }) => ({ error }));
  return { dispatch, outcome, recordTerminalFailure, parkForRetry, parks };
}

describe("one automatic retry from where it stopped (Task 57e)", () => {
  it("a run failing on a provider outage is parked for its one retry, and the next dispatch after the delay finishes it", async () => {
    const task = taskOver([{ throws: OUTAGE() }, { result: { kind: "COMPLETED", answerId: "44444444-4444-4444-8444-444444444444" } }]);
    expect(await task.dispatch()).toEqual({ kind: "RETRY_PARKED" });
    expect(task.parks).toEqual([{ runId: DISPATCH.runId, workItemId: DISPATCH.workItemId }]);
    expect(task.recordTerminalFailure).not.toHaveBeenCalled();
    // The lapsed re-send, once the delay passed: the same work item, claimed again, resumes and finishes.
    expect(await task.dispatch()).toEqual({ kind: "COMPLETED", answerId: "44444444-4444-4444-8444-444444444444" });
    expect(task.recordTerminalFailure).not.toHaveBeenCalled();
  });

  it("a second failure is not retried again: the debate is FAILED with its reason, as today", async () => {
    const task = taskOver([{ throws: OUTAGE() }, { throws: OUTAGE() }]);
    expect(await task.dispatch()).toEqual({ kind: "RETRY_PARKED" });
    const second = await task.outcome();
    expect("error" in second && second.error.code).toBe("PROVIDER_CALL_FAILED");
    expect(task.parkForRetry).toHaveBeenCalledTimes(2);
    expect(task.recordTerminalFailure).toHaveBeenCalledTimes(1);
    expect(task.recordTerminalFailure).toHaveBeenCalledWith({ ...DISPATCH, reason: expect.stringMatching(/^RUNNER_EXECUTION_FAILED:[A-Z0-9_]+$/u) });
  });

  it("a refusal the person caused, the month wall and a spending wall are never retried", async () => {
    // Task 57h: nor the debate's own call budget used up (RUN_COST_ENVELOPE_EXHAUSTED, its attempt ceiling): a retry would meet it again.
    for (const code of ["PRIVATE_CONTENT_ERASED", "RUN_CEILING_BELOW_FIRST_CALL", "PERSON_ALLOWANCE_REACHED", "DAILY_COST_ENVELOPE_REACHED",
      "RUN_COST_ENVELOPE_MONEY_REACHED", "INTERNAL_FUNDING_UNAVAILABLE", "CALL_BUDGET_EXHAUSTED", "RUN_COST_ENVELOPE_EXHAUSTED"]) {
      const task = taskOver([{ throws: new TypedDomainError(code, code) }]);
      const outcome = await task.outcome();
      expect("error" in outcome && outcome.error.code, code).toBe(code);
      expect(task.parkForRetry, code).not.toHaveBeenCalled();
      expect(task.recordTerminalFailure, code).toHaveBeenCalledTimes(1);
      expect(runFailureRetriesOnce(new TypedDomainError(code, code)), code).toBe(false);
    }
    // The month wall's planned stop and a claim another copy took are left alone, as today: nothing parked, nothing recorded.
    for (const code of ["RUN_MONTH_PAUSED", "RUNNER_CLAIM_LOST", "RUNNER_RETIRING", "RUNNER_RELEASE_MISMATCH", "SETTINGS_VERSION_UNSUPPORTED"]) {
      const task = taskOver([{ throws: new TypedDomainError(code, code) }]);
      await task.outcome();
      expect(task.parkForRetry, code).not.toHaveBeenCalled();
      expect(task.recordTerminalFailure, code).not.toHaveBeenCalled();
      expect(runFailureRetriesOnce(new TypedDomainError(code, code)), code).toBe(false);
    }
  });

  // Review of Task 57h: a path debate's claim-time refusal that its stored set makes final is recorded FAILED by the run itself, with its plain
  // code, before it throws (refusedForGood). The park then finds the item FAILED (NOT_HELD), and the task's catch re-writes an already FAILED
  // item's reason (WorkItemRepository.recordTerminalFailure, D2). It writes the same plain code, never the wrapped diagnostic (the three codes
  // are outside the alphabet: UNRECOGNIZED_DOMAIN_ERROR), or Continue would offer the debate and 0165 would keep its path-list charge.
  it("a path set refused for good keeps its plain code through the task's catch", async () => {
    for (const code of RUN_PATH_SET_REFUSALS) {
      const task = taskOver([{ throws: new TypedDomainError(code, code) }], { park: async () => "NOT_HELD" });
      const outcome = await task.outcome();
      expect("error" in outcome && outcome.error.code, code).toBe(code);
      expect(task.recordTerminalFailure, code).toHaveBeenCalledTimes(1);
      expect(task.recordTerminalFailure, code).toHaveBeenCalledWith({ ...DISPATCH, reason: code });
    }
  });

  it("our side's stops are retried: a provider out, an AI's unreadable reply, a time limit, a fault in our code or our database", () => {
    expect(runFailureRetriesOnce(OUTAGE())).toBe(true);
    for (const code of ["PROVIDER_CONTENT_UNACCEPTED", "RUNNER_TIME_LIMIT_REACHED", "STRENGTH_LINEAGE_UNRESOLVED", "RUNNER_DISCLOSURE_PIPELINE_FAILED"]) {
      expect(runFailureRetriesOnce(new TypedDomainError(code, code)), code).toBe(true);
    }
    expect(runFailureRetriesOnce(new TypeError("Cannot read properties of undefined"))).toBe(true);
    expect(runFailureRetriesOnce(Object.assign(new Error("connection reset"), { code: "08006" }))).toBe(true);
  });

  it("a park that does not hold the claim, or that fails, records FAILED as today", async () => {
    for (const park of [async (): Promise<Park> => "NOT_HELD", async (): Promise<Park> => { throw Object.assign(new Error("database down"), { code: "57P01" }); }]) {
      const task = taskOver([{ throws: OUTAGE() }], { park });
      const outcome = await task.outcome();
      expect("error" in outcome && outcome.error.code).toBe("PROVIDER_CALL_FAILED");
      expect(task.parkForRetry).toHaveBeenCalledTimes(1);
      expect(task.recordTerminalFailure).toHaveBeenCalledTimes(1);
    }
  });

  it("without the port (fixtures, an older wiring): today's behaviour, FAILED at once", async () => {
    const task = taskOver([{ throws: OUTAGE() }], { port: false });
    const outcome = await task.outcome();
    expect("error" in outcome && outcome.error.code).toBe("PROVIDER_CALL_FAILED");
    expect(task.recordTerminalFailure).toHaveBeenCalledTimes(1);
  });
});
