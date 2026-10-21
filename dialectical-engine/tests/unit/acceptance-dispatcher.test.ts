import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import { TypedDomainError } from "@debateai/kernel";
import { AcceptanceDispatcher, acceptanceFailureRecorder } from "../../acceptance/main.js";

describe("AcceptanceDispatcher", () => {
  it("returns before the runner settles and executes the queued work asynchronously", async () => {
    let complete: ((value: { readonly kind: "COMPLETED"; readonly answerId: string }) => void) | undefined;
    const executeWorkItem = vi.fn(() => new Promise<{ readonly kind: "COMPLETED"; readonly answerId: string }>((resolve) => {
      complete = resolve;
    }));
    const recordTerminalFailure = vi.fn();
    const dispatcher = new AcceptanceDispatcher({ executeWorkItem }, { recordTerminalFailure });

    await dispatcher.dispatch({ runId: "run:test", workItemId: "work:test" });

    expect(executeWorkItem).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(executeWorkItem).toHaveBeenCalledWith("work:test"));
    complete?.({ kind: "COMPLETED", answerId: "answer:test" });
    expect(recordTerminalFailure).not.toHaveBeenCalled();
  });

  it("records a typed terminal state when asynchronous execution rejects", async () => {
    const executeWorkItem = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const recordTerminalFailure = vi.fn().mockResolvedValue(true);
    const dispatcher = new AcceptanceDispatcher({ executeWorkItem }, { recordTerminalFailure });

    await dispatcher.dispatch({ runId: "run:test", workItemId: "work:test" });

    await vi.waitFor(() => expect(recordTerminalFailure).toHaveBeenCalledWith({
      runId: "run:test",
      workItemId: "work:test",
      reason: "ACCEPTANCE_EXECUTION_FAILED:UNEXPECTED_ERROR"
    }));
  });

  it("preserves the underlying typed domain code in the terminal failure reason", async () => {
    const executeWorkItem = vi.fn().mockRejectedValue(new TypedDomainError(
      "COMPOSITION_UNRESOLVED",
      "sensitive diagnostic must not become the persisted reason"
    ));
    const recordTerminalFailure = vi.fn().mockResolvedValue(true);
    const dispatcher = new AcceptanceDispatcher({ executeWorkItem }, { recordTerminalFailure });

    await dispatcher.dispatch({ runId: "run:typed", workItemId: "work:typed" });

    await vi.waitFor(() => expect(recordTerminalFailure).toHaveBeenCalledWith({
      runId: "run:typed",
      workItemId: "work:typed",
      reason: "ACCEPTANCE_EXECUTION_FAILED:COMPOSITION_UNRESOLVED"
    }));
  });

  it("records failures through the recorder that knows the acceptance runner's worker id (side-by-side D2)", () => {
    // The fence refuses a failure write under a live claim of a worker it was not told about, and the acceptance
    // runner records its failures while holding its own claim (tests/integration/release-fences.test.ts proves the
    // write); the dispatcher must be wired to that recorder, not to an unfenced repository.
    expect(acceptanceFailureRecorder({} as Pool)).toBeInstanceOf(WorkItemRepository);
    const source = readFileSync(new URL("../../acceptance/main.ts", import.meta.url), "utf8");
    expect(source).toContain("new AcceptanceDispatcher(runner, acceptanceFailureRecorder(input.pool))");
    expect(source).toContain("workerId: ACCEPTANCE_WORKER_ID,");
    expect(source).not.toMatch(/new AcceptanceDispatcher\(runner, new WorkItemRepository\(/u);
  });
});
