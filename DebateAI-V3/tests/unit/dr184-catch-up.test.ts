import { describe, expect, it, vi } from "vitest";
import {
  runReviewCatchUp,
  type ReviewCatchUpDependencies
} from "@debateai/runner";

const node = Object.freeze({
  nodeId: "node:1",
  statement: "A claim",
  authorMaker: "maker:a",
  authorRawArtifactRef: "artifact:author"
});

function dependencies(overrides: Partial<ReviewCatchUpDependencies> = {}): ReviewCatchUpDependencies {
  return {
    probePinnedPanel: vi.fn(async () => [{
      maker: "maker:b", providerRef: "provider:b",
      review: vi.fn(async (input) => ({
        outcome: "agree" as const, reasons: ["reviewed"],
        provenanceRef: "artifact:review", providerLedgerRef: "ledger:review",
        parseStrategy: "RAW" as const,
        observed: input
      }))
    }]),
    readUnreviewedNodes: vi.fn(async () => [node]),
    readDisclosedNodeIds: vi.fn(async () => [node.nodeId]),
    readLatestReviewerMaker: vi.fn(async () => null),
    recordNodeReview: vi.fn(async () => "review:1"),
    countRunModelAttempts: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(4),
    readPinnedMaximumAttempts: vi.fn(async () => 10),
    prepareVersion: vi.fn(async () => ({
      terminalBefore: "SERVED" as const, terminalAfter: "SERVED" as const,
      numberBefore: 0.7, numberAfter: 0.7,
      nowVisible: 1, stillSetAside: 0,
      persist: vi.fn(async () => ({ answerVersion: 2 }))
    })),
    ...overrides
  };
}

describe("DR-184 catch-up", () => {
  it("C-2 uses a fresh invocation-scoped key while retaining the original work item and ruled bound", async () => {
    const deps = dependencies();
    const report = await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1,
      workItemId: "work:original", questionLine: "Question?",
      invocationId: "catch:1", pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge", runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 2, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    const reviewer = (await (deps.probePinnedPanel as ReturnType<typeof vi.fn>).mock.results[0]!.value)[0]!;
    expect(reviewer.review).toHaveBeenCalledWith(expect.objectContaining({
      subjectItemId: "work:original",
      callSiteKey: "JUDGE:review:catch-up:catch:1:node:1",
      bound: expect.objectContaining({ maxAttempts: 3 })
    }));
    expect(report).toMatchObject({ reviewed: 1, toVersion: 2, refusal: null });
  });

  it("probes first and refuses a disclosure mismatch before model spend", async () => {
    const order: string[] = [];
    const deps = dependencies({
      probePinnedPanel: vi.fn(async () => { order.push("probe"); return []; }),
      readUnreviewedNodes: vi.fn(async () => { order.push("work"); return [node]; }),
      readDisclosedNodeIds: vi.fn(async () => [])
    });
    const report = await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1, workItemId: "work:1",
      questionLine: "Question?", invocationId: "catch:1",
      pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge", runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 0, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    expect(order).toEqual(["probe", "work"]);
    expect(report.refusal).toBe("CATCH_UP_DISCLOSURE_MISMATCH");
    expect(deps.prepareVersion).not.toHaveBeenCalled();
  });

  it("refuses a number move and does not persist the candidate version", async () => {
    const persist = vi.fn(async () => ({ answerVersion: 2 }));
    const deps = dependencies({ prepareVersion: vi.fn(async () => ({
      terminalBefore: "SERVED" as const, terminalAfter: "SERVED" as const, numberBefore: 0.7, numberAfter: 0.6,
      nowVisible: 1, stillSetAside: 0, persist
    })) });
    const report = await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1, workItemId: "work:1",
      questionLine: "Question?", invocationId: "catch:1",
      pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge", runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 0, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    expect(report.refusal).toBe("CATCH_UP_NUMBER_WOULD_MOVE");
    expect(persist).not.toHaveBeenCalled();
  });

  it("does not mint another version when a resumed invocation finds no work", async () => {
    const deps = dependencies({
      readUnreviewedNodes: vi.fn(async () => []),
      readDisclosedNodeIds: vi.fn(async () => [])
    });
    const report = await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 2, workItemId: "work:1",
      questionLine: "Question?", invocationId: "catch:2",
      pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge", runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 0, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    expect(report).toMatchObject({ examined: 0, reviewed: 0, toVersion: null, refusal: null });
    expect(deps.prepareVersion).not.toHaveBeenCalled();
  });

  it("refuses a worse terminal before persisting", async () => {
    const persist = vi.fn(async () => ({ answerVersion: 2 }));
    const deps = dependencies({ prepareVersion: vi.fn(async () => ({
      terminalBefore: "SERVED" as const, terminalAfter: "COMPONENTS_ONLY" as const,
      numberBefore: 0.7, numberAfter: 0.7, nowVisible: 1, stillSetAside: 0, persist
    })) });
    const report = await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1, workItemId: "work:1",
      questionLine: "Question?", invocationId: "catch:1",
      pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge", runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 0, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    expect(report.refusal).toBe("CATCH_UP_WOULD_DOWNGRADE");
    expect(persist).not.toHaveBeenCalled();
  });
});
