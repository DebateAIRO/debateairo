import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import { parseStructuredArtifact } from "@debateai/judgement";
import { declareHatchetWalkingSkeletonTask, type RunnerExecutionResult } from "@debateai/runner";

// DL4-F1 (delta audit): model output must never leave the AEAD boundary through an
// error. Two exits existed: the schema-failure message embedded the model's own JSON
// (unrecognised keys, received values), and the Hatchet task rethrew the original error,
// whose {message, stack} the SDK writes into Hatchet's own Postgres and to stderr.
const MODEL_TEXT = "SECRET-MODEL-TEXT-3f9a";

describe("DL4-F1 — failures carry codes and paths, never model text", () => {
  const schema = z.object({ verdict: z.enum(["FOR", "AGAINST"]), weight: z.number() }).strict();

  it("a schema failure names the issue codes and paths, not the received values or keys", () => {
    const result = parseStructuredArtifact(
      `{"verdict":"${MODEL_TEXT}","weight":"heavy","${MODEL_TEXT}-key":1}`,
      schema
    );
    expect(result.kind).toBe("SCHEMA_FAILURE");
    if (result.kind !== "SCHEMA_FAILURE") return;
    expect(result.message).not.toContain(MODEL_TEXT);
    expect(result.message).not.toContain("heavy");
    expect(result.message).toMatch(/invalid_value@verdict/);
    expect(result.message).toMatch(/invalid_type@weight/);
    expect(result.message).toMatch(/unrecognized_keys@\$/);
    expect(result.message.length).toBeLessThanOrEqual(512);
  });

  it("the Hatchet task rethrows a bounded code with no model text in message, stack or cause", async () => {
    let taskFn: ((dispatch: { runId: string; workItemId: string }) => Promise<unknown>) | undefined;
    const client = { task: vi.fn((definition: { fn: typeof taskFn }) => { taskFn = definition.fn; return {}; }) };
    const runner = {
      executeWorkItem: vi.fn<() => Promise<RunnerExecutionResult>>().mockRejectedValue(
        new TypedDomainError("JUDGE_SCHEMA_FAILURE", `unrecognized key ${MODEL_TEXT}`)
      )
    };
    declareHatchetWalkingSkeletonTask({
      client: client as never,
      runner: runner as never,
      failures: { recordTerminalFailure: vi.fn().mockResolvedValue(true) },
      workflowName: "runner:test",
      engineRetries: 0
    } as never);

    const failure = await taskFn!({ runId: "run:test", workItemId: "work:test" }).then(
      () => { throw new Error("EXPECTED_REJECTION"); },
      (error: unknown) => error as Error & { code?: string; cause?: unknown }
    );
    expect(failure.code).toBe("JUDGE_SCHEMA_FAILURE");
    expect(failure.message).toBe("JUDGE_SCHEMA_FAILURE");
    expect(String(failure.stack)).not.toContain(MODEL_TEXT);
    expect(failure.cause).toBeUndefined();
    expect(JSON.stringify({ message: failure.message, stack: failure.stack })).not.toContain(MODEL_TEXT);
  });

  it("a dependency failure with SQL text in its message leaves as the bounded diagnostic only", async () => {
    let taskFn: ((dispatch: { runId: string; workItemId: string }) => Promise<unknown>) | undefined;
    const client = { task: vi.fn((definition: { fn: typeof taskFn }) => { taskFn = definition.fn; return {}; }) };
    const sqlError = Object.assign(new Error(`invalid input syntax for type uuid: "${MODEL_TEXT}"`), { code: "22P02" });
    const runner = { executeWorkItem: vi.fn<() => Promise<RunnerExecutionResult>>().mockRejectedValue(sqlError) };
    declareHatchetWalkingSkeletonTask({
      client: client as never,
      runner: runner as never,
      failures: { recordTerminalFailure: vi.fn().mockResolvedValue(true) },
      workflowName: "runner:test",
      engineRetries: 0
    } as never);
    const failure = await taskFn!({ runId: "run:test", workItemId: "work:test" }).then(
      () => { throw new Error("EXPECTED_REJECTION"); },
      (error: unknown) => error as Error
    );
    expect(failure.message).toMatch(/^RUNNER_EXECUTION_FAILED:[A-Z0-9_]+$/);
    expect(String(failure.stack)).not.toContain(MODEL_TEXT);
  });
});
