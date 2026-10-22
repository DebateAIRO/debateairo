import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import { TypedDomainError } from "@debateai/kernel";
import { AcceptanceDispatcher, acceptanceFailureRecorder } from "../../acceptance/main.js";
import { ACCEPTANCE_RELEASE_KEY } from "../../acceptance/seed-register.js";

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

  it("source text: acceptance/main.ts hands the dispatcher acceptanceFailureRecorder (a WorkItemRepository) and names ACCEPTANCE_WORKER_ID (side-by-side D2)", () => {
    // The fence refuses a failure write under a live claim of a worker it was not told about, and the acceptance
    // runner records its failures while holding its own claim. That the recorder writes under the worker id is proven
    // against a database in tests/integration/release-fences.test.ts; this checks only the wiring in the source.
    expect(acceptanceFailureRecorder({} as Pool)).toBeInstanceOf(WorkItemRepository);
    const source = readFileSync(new URL("../../acceptance/main.ts", import.meta.url), "utf8");
    expect(source).toContain("new AcceptanceDispatcher(runner, acceptanceFailureRecorder(input.pool))");
    expect(source).toContain("workerId: ACCEPTANCE_WORKER_ID,");
    expect(source).not.toMatch(/new AcceptanceDispatcher\(runner, new WorkItemRepository\(/u);
  });

  // Side-by-side spec §1, §3 (B16): the acceptance ask stamps every run with one key, and the acceptance runner and its
  // failure recorder claim and write under that same key, so the §3 fence never sets an acceptance debate apart.
  it("acceptance runs and claims under one release key", () => {
    expect(ACCEPTANCE_RELEASE_KEY).toBe("r4-000000000000");
    const source = readFileSync(new URL("../../acceptance/main.ts", import.meta.url), "utf8");
    // Exactly three sites: the runner's settings (its claims), the failure recorder's fence (its writes under that
    // claim) and the ask application's settings (the stamp on each new run).
    expect(source.match(/releaseKey: ACCEPTANCE_RELEASE_KEY\b/gu)).toHaveLength(3);
    expect(source).toContain("new WorkItemRepository(pool, { releaseKey: ACCEPTANCE_RELEASE_KEY, workerId: ACCEPTANCE_WORKER_ID })");
    expect(source).toMatch(
      /new WalkingSkeletonRunner\(input\.pool, provider, \{\n {4}workerId: ACCEPTANCE_WORKER_ID,\n(?: {4}\/\/[^\n]*\n)* {4}releaseKey: ACCEPTANCE_RELEASE_KEY,/u
    );
    expect(source).toMatch(/new PostgresAskApplication\(input\.pool, dispatcher, \{[^}]*releaseKey: ACCEPTANCE_RELEASE_KEY,/u);
    // No second key anywhere: neither `legacy` nor a key built in place.
    expect(source).not.toMatch(/LEGACY_RELEASE_KEY|developmentReleaseKey\(/u);
  });
});
