import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  declareHatchetWalkingSkeletonTask,
  type RunnerFailureRecorder,
  type WalkingSkeletonRunner
} from "@debateai/runner";

/**
 * One Hatchet task is one whole debate. A task declared without an execution
 * limit is registered by @hatchet-dev/typescript-sdk 1.28.1 with '60s', so
 * until 2026-10-10 every debate outside the private preview was given up after
 * one minute (found by the database connection budget audit, section 6 item 1).
 * Owner ruling 2026-10-10: 60 minutes for every deployment, fixed in code.
 */

// The SDK's own resolver, the function that turns the task options into the
// timeout Hatchet registers. Loaded from the runner, the package that depends
// on the SDK; an SDK upgrade that moves or changes it fails here, loudly.
const sdk = createRequire(new URL("../../apps/runner/package.json", import.meta.url))(
  "@hatchet-dev/typescript-sdk/v1/client/worker/worker-internal"
) as { resolveExecutionTimeout(task: object, workflowDefaults: undefined): string };

function declaredOptions(input: { readonly previewExecutionTimeout?: "3600s" } = {}) {
  let declared: { executionTimeout?: unknown; retries?: unknown } | undefined;
  declareHatchetWalkingSkeletonTask({
    client: { task: (options: typeof declared) => {
      declared = options;
      return options as never;
    } } as never,
    runner: {} as WalkingSkeletonRunner,
    failures: {} as RunnerFailureRecorder,
    workflowName: "walking-skeleton",
    engineRetries: 3,
    ...input
  });
  if (declared === undefined) throw new Error("the task declaration must register options");
  return declared;
}

describe("a debate may run for 60 minutes in every deployment", () => {
  it("the SDK gives a task without a limit one minute (why the limit must always be set)", () => {
    expect(sdk.resolveExecutionTimeout({}, undefined)).toBe("60s");
  });

  it("outside the preview the task is registered with 60 minutes", () => {
    const options = declaredOptions();
    expect(options.executionTimeout).toBe("3600s");
    expect(sdk.resolveExecutionTimeout(options, undefined)).toBe("3600s");
  });

  it("the preview keeps its 60 minutes", () => {
    expect(sdk.resolveExecutionTimeout(declaredOptions({ previewExecutionTimeout: "3600s" }), undefined)).toBe("3600s");
  });
});
