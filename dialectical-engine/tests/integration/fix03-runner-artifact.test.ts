import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BoundedReferenceQueue,
  createCaptureEmitter,
  createCaptureGapCounter,
  createCaptureHealth,
  createSharedRedactor,
  installCaptureEmitter,
  type CaptureQueueEntry,
} from "@debateai/obs-capture";
import { TypedDomainError } from "@debateai/kernel";
import {
  declareHatchetWalkingSkeletonTask,
  type RunnerExecutionResult,
} from "@debateai/runner";

const RUN_ID = "550e8400-e29b-41d4-a716-446655440000";
const WORK_ITEM_ID = "550e8400-e29b-41d4-a716-446655440001";
const UNKNOWN = "UNKNOWN:DECLARED_KIND_REQUIRED";

type TaskFn = (
  dispatch: { runId: string; workItemId: string },
  context: { retryCount(): number },
) => Promise<unknown>;

function taskFor(input: {
  readonly executeWorkItem: () => Promise<RunnerExecutionResult>;
  readonly recordTerminalFailure?: (value: {
    readonly runId: string;
    readonly workItemId: string;
    readonly reason: string;
  }) => Promise<boolean>;
}): TaskFn {
  let taskFn: TaskFn | undefined;
  declareHatchetWalkingSkeletonTask({
    client: {
      task(definition: { fn: TaskFn }) {
        taskFn = definition.fn;
        return {};
      },
    } as never,
    runner: { executeWorkItem: input.executeWorkItem } as never,
    failures: {
      recordTerminalFailure: input.recordTerminalFailure ?? (async () => true),
    },
    workflowName: "runner:fix03:c2",
    engineRetries: 3,
  });
  if (taskFn === undefined) throw new Error("TASK_FN_NOT_DECLARED");
  return taskFn;
}

function installRecordingEmitter(order: string[] = []): CaptureQueueEntry[] {
  const captured: CaptureQueueEntry[] = [];
  const health = createCaptureHealth();
  installCaptureEmitter(createCaptureEmitter({
    queue: {
      offer(entry) {
        order.push("capture");
        captured.push(entry);
        return true;
      },
    },
    health,
    gaps: createCaptureGapCounter({ health }),
  }));
  return captured;
}

function resetEmitter(): void {
  const health = createCaptureHealth();
  installCaptureEmitter(createCaptureEmitter({
    queue: new BoundedReferenceQueue(1),
    health,
    gaps: createCaptureGapCounter({ health }),
  }));
}

afterEach(resetEmitter);

describe("FIX-03 C2 artifact", () => {
  it("captures before the terminal write with only real run and work-item declarations", async () => {
    const failure = new TypedDomainError(
      "JUDGEMENT_POLICY_UNRESOLVED",
      "private runner detail",
    );
    const order: string[] = [];
    const captured = installRecordingEmitter(order);
    const terminalInput: unknown[] = [];
    const task = taskFor({
      executeWorkItem: vi.fn<() => Promise<RunnerExecutionResult>>().mockRejectedValue(failure),
      recordTerminalFailure: async (value) => {
        order.push("terminal");
        terminalInput.push(value);
        return true;
      },
    });

    await expect(task(
      { runId: RUN_ID, workItemId: WORK_ITEM_ID },
      { retryCount: () => 2 },
    )).rejects.toBe(failure);

    expect(order).toEqual(["capture", "terminal"]);
    expect(terminalInput).toEqual([{
      runId: RUN_ID,
      workItemId: WORK_ITEM_ID,
      reason: "RUNNER_EXECUTION_FAILED:JUDGEMENT_POLICY_UNRESOLVED",
    }]);
    expect(captured).toHaveLength(1);
    const entry = captured[0]!;
    expect(entry).toMatchObject({
      kind: "envelope",
      payload_ref: {
        code: "JUDGEMENT_POLICY_UNRESOLVED",
        error: failure,
        taxonomy_class: "JOB_FAILURE",
        capture_point: "job",
        disposition: "THROWN",
        source: "hatchet",
        attempt_index: 2,
      },
      ambient_context_ref: {
        run_ref: { kind: "run", value: RUN_ID },
        work_item_ref: { kind: "work_item", value: WORK_ITEM_ID },
      },
    });
    expect(Object.keys(entry.ambient_context_ref ?? {}).sort()).toEqual([
      "run_ref",
      "work_item_ref",
    ]);
    expect(entry.payload_ref).not.toHaveProperty("attempt_ref");

    const redactor = createSharedRedactor({
      environment: "test",
      build_ref: "UNTRACKED-DEV:fix03-c2",
      build_dirty: true,
      runtime: "runner",
      component: { process: "runner", package: "@debateai/runner" },
      writer_identity: "fix03-c2-test",
      redaction_policy_version: "g0",
      allowlist_set_id: "g0-empty-parameters",
    });
    expect(redactor.redact(entry)).toMatchObject({
      run_ref: RUN_ID,
      work_item_ref: WORK_ITEM_ID,
      node_ref: UNKNOWN,
      attempt_ref: UNKNOWN,
      ledger_ref: UNKNOWN,
      at_seq_watermark: UNKNOWN,
      attempt_index: 2,
      zone_context: false,
    });
    expect(redactor.redact({
      ...entry,
      ambient_context_ref: Object.freeze({
        ...entry.ambient_context_ref,
        zone_context: true,
      }),
    })).toMatchObject({
      run_ref: UNKNOWN,
      work_item_ref: UNKNOWN,
      node_ref: UNKNOWN,
      attempt_ref: UNKNOWN,
      ledger_ref: UNKNOWN,
      at_seq_watermark: UNKNOWN,
      zone_context: true,
    });
  });

  it("keeps product failure behavior when retry lookup and the capture emitter throw", async () => {
    const productFailure = new Error("private product failure");
    const captureFailure = new Error("capture transport failed");
    const order: string[] = [];
    let envelope: unknown;
    installCaptureEmitter(Object.freeze({
      emit(value: unknown) {
        order.push("capture");
        envelope = value;
        throw captureFailure;
      },
      captureHandled() {},
    }));
    const recordTerminalFailure = vi.fn(async () => {
      order.push("terminal");
      return true;
    });
    const task = taskFor({
      executeWorkItem: vi.fn<() => Promise<RunnerExecutionResult>>().mockRejectedValue(productFailure),
      recordTerminalFailure,
    });

    await expect(task(
      { runId: RUN_ID, workItemId: WORK_ITEM_ID },
      { retryCount: () => { throw new Error("retry metadata unavailable"); } },
    )).rejects.toBe(productFailure);

    expect(order).toEqual(["capture", "terminal"]);
    expect(recordTerminalFailure).toHaveBeenCalledOnce();
    expect(envelope).toMatchObject({
      code: "OBS_CAPTURE_SELF",
      error: productFailure,
      attempt_index: 0,
    });
    expect(envelope).not.toHaveProperty("attempt_ref");
  });

  it("keeps the terminal write and original error identity with capture off", async () => {
    installCaptureEmitter(Object.freeze({ emit() {}, captureHandled() {} }));
    const productFailure = new TypedDomainError(
      "JUDGEMENT_POLICY_UNRESOLVED",
      "private off-mode failure",
    );
    const recordTerminalFailure = vi.fn(async () => false);
    const task = taskFor({
      executeWorkItem: vi.fn<() => Promise<RunnerExecutionResult>>().mockRejectedValue(productFailure),
      recordTerminalFailure,
    });

    await expect(task(
      { runId: RUN_ID, workItemId: WORK_ITEM_ID },
      { retryCount: () => 1 },
    )).rejects.toBe(productFailure);

    expect(recordTerminalFailure).toHaveBeenCalledOnce();
    expect(recordTerminalFailure).toHaveBeenCalledWith({
      runId: RUN_ID,
      workItemId: WORK_ITEM_ID,
      reason: "RUNNER_EXECUTION_FAILED:JUDGEMENT_POLICY_UNRESOLVED",
    });
  });

  it("returns the same Hatchet success payload with capture on and off", async () => {
    const result: RunnerExecutionResult = Object.freeze({
      kind: "COMPLETED",
      answerId: "answer:fix03",
    });
    const onExecute = vi.fn<() => Promise<RunnerExecutionResult>>().mockResolvedValue(result);
    const onTerminal = vi.fn(async () => true);
    const captured = installRecordingEmitter();
    const onTask = taskFor({ executeWorkItem: onExecute, recordTerminalFailure: onTerminal });
    const captureOn = await onTask(
      { runId: RUN_ID, workItemId: WORK_ITEM_ID },
      { retryCount: () => 1 },
    );

    installCaptureEmitter(Object.freeze({ emit() {}, captureHandled() {} }));
    const offExecute = vi.fn<() => Promise<RunnerExecutionResult>>().mockResolvedValue(result);
    const offTerminal = vi.fn(async () => true);
    const offTask = taskFor({ executeWorkItem: offExecute, recordTerminalFailure: offTerminal });
    const captureOff = await offTask(
      { runId: RUN_ID, workItemId: WORK_ITEM_ID },
      { retryCount: () => 1 },
    );

    expect(captureOn).toEqual({ kind: "COMPLETED", answerId: "answer:fix03" });
    expect(captureOff).toEqual(captureOn);
    expect(captured).toHaveLength(0);
    expect(onExecute).toHaveBeenCalledOnce();
    expect(offExecute).toHaveBeenCalledOnce();
    expect(onTerminal).not.toHaveBeenCalled();
    expect(offTerminal).not.toHaveBeenCalled();
  });
});
