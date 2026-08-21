import { describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { AcceptanceDispatcher } from "../../acceptance/main.js";

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
});
