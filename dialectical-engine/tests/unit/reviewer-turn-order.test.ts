import { describe, expect, it, vi } from "vitest";
import { ProviderCallFailedError } from "@debateai/providers";
import {
  reviewerTurnOrder,
  runReviewCatchUp,
  selectDifferentMakerReviewer,
  type ReviewCatchUpDependencies
} from "@debateai/runner";

/**
 * Owner ruling 2026-10-10 — "shuffled per debate, then taken in turn". The old
 * rule took the other makers in panel order and alternated against the
 * author's latest reviewer, so only the FIRST TWO other makers ever reviewed:
 * in the five-AI roster (GLM ×2 refs, DeepSeek, MiMo, Qwen, Haiku) Qwen and
 * Haiku never reviewed anything.
 */
const panel = Object.freeze([
  { maker: "Z.AI", providerRef: "preview:fixture-a" },
  { maker: "Z.AI", providerRef: "preview:fixture-b" },
  { maker: "DeepSeek", providerRef: "preview:deepseek" },
  { maker: "Xiaomi", providerRef: "preview:mimo" },
  { maker: "Alibaba", providerRef: "preview:qwen" },
  { maker: "Anthropic", providerRef: "preview:haiku" }
] as const);
const makers = ["Z.AI", "DeepSeek", "Xiaomi", "Alibaba", "Anthropic"] as const;
const runIds = Array.from({ length: 200 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);

/** One debate: `nodesPerAuthor` nodes per maker, authored in turn, each reviewed as it lands. */
function simulate(runId: string, nodesPerAuthor: number) {
  const latest = new Map<string, string>();
  const counts = new Map<string, Map<string, number>>();
  const choices: string[] = [];
  for (let round = 0; round < nodesPerAuthor; round += 1) {
    for (const author of makers) {
      const reviewer = selectDifferentMakerReviewer(runId, author, panel, latest.get(author) ?? null);
      latest.set(author, reviewer.maker);
      const perAuthor = counts.get(author) ?? new Map<string, number>();
      perAuthor.set(reviewer.maker, (perAuthor.get(reviewer.maker) ?? 0) + 1);
      counts.set(author, perAuthor);
      choices.push(`${author}->${reviewer.providerRef}`);
    }
  }
  return { counts, choices };
}

describe("seeded reviewer turn order (shuffled per debate, then taken in turn)", () => {
  it("lets every maker of a five-maker panel review, Qwen and Haiku included, in every one of 200 debates", () => {
    const everReviewed = new Set<string>();
    for (const runId of runIds) {
      const reviewedHere = new Set<string>();
      // One node per author is enough: the first reviews go round the circle.
      for (const perAuthor of simulate(runId, 1).counts.values()) {
        for (const maker of perAuthor.keys()) reviewedHere.add(maker);
      }
      expect([...reviewedHere].sort()).toEqual([...makers].sort());
      for (const maker of reviewedHere) everReviewed.add(maker);
    }
    expect(everReviewed.has("Alibaba")).toBe(true);
    expect(everReviewed.has("Anthropic")).toBe(true);
  });

  it("balances one author's reviews across the other makers to within one review, at every node count", () => {
    for (const runId of runIds.slice(0, 40)) {
      for (const nodesPerAuthor of [1, 2, 3, 4, 5, 7, 9]) {
        const { counts } = simulate(runId, nodesPerAuthor);
        for (const author of makers) {
          const perAuthor = counts.get(author)!;
          const tallies = makers.filter((maker) => maker !== author).map((maker) => perAuthor.get(maker) ?? 0);
          expect(Math.max(...tallies) - Math.min(...tallies)).toBeLessThanOrEqual(1);
          expect(tallies.reduce((sum, tally) => sum + tally, 0)).toBe(nodesPerAuthor);
        }
      }
    }
  });

  it("gives the same debate the same choices, and different debates different orders", () => {
    for (const runId of runIds.slice(0, 20)) {
      expect(simulate(runId, 6).choices).toEqual(simulate(runId, 6).choices);
    }
    const orders = new Set(runIds.map((runId) => reviewerTurnOrder(runId, makers).join(",")));
    // 5 makers have 120 orders; 200 seeded debates must land on many of them.
    expect(orders.size).toBeGreaterThanOrEqual(40);
    expect(new Set(runIds.map((runId) => simulate(runId, 3).choices.join("|"))).size).toBeGreaterThan(1);
  });

  it("does not depend on the order the panel lists its makers in", () => {
    const reversed = [...panel].reverse();
    for (const runId of runIds.slice(0, 30)) {
      expect(reviewerTurnOrder(runId, [...makers].reverse())).toEqual(reviewerTurnOrder(runId, makers));
      for (const author of makers) {
        for (const latest of [null, ...makers]) {
          expect(selectDifferentMakerReviewer(runId, author, reversed, latest).maker)
            .toBe(selectDifferentMakerReviewer(runId, author, panel, latest).maker);
        }
      }
    }
  });

  it("never picks the author's own maker, whatever the latest reviewer was", () => {
    for (const runId of runIds.slice(0, 50)) {
      for (const author of makers) {
        for (const latest of [null, "a maker no longer on the panel", ...makers]) {
          expect(selectDifferentMakerReviewer(runId, author, panel, latest).maker).not.toBe(author);
        }
      }
    }
  });

  it("takes the first listed ref of the chosen maker, so the two GLM refs keep today's ref choice", () => {
    for (const runId of runIds.slice(0, 50)) {
      for (const author of makers) {
        const reviewer = selectDifferentMakerReviewer(runId, author, panel, null);
        if (reviewer.maker === "Z.AI") expect(reviewer.providerRef).toBe("preview:fixture-a");
      }
    }
  });

  it("keeps a two-maker panel on its only lawful reviewer and refuses a one-maker panel", () => {
    const pair = [panel[0], panel[2]];
    expect(selectDifferentMakerReviewer("run:x", "Z.AI", pair, null)).toBe(panel[2]);
    expect(selectDifferentMakerReviewer("run:x", "Z.AI", pair, "DeepSeek")).toBe(panel[2]);
    expect(() => selectDifferentMakerReviewer("run:x", "Z.AI", [panel[0], panel[1]], null)).toThrowError(
      expect.objectContaining({ code: "DIFFERENT_MAKER_REVIEWER_UNAVAILABLE" })
    );
  });

  it("chooses the same reviewer for a node again until a review for that author lands", () => {
    for (const runId of runIds.slice(0, 20)) {
      for (const author of makers) {
        const first = selectDifferentMakerReviewer(runId, author, panel, "DeepSeek");
        expect(selectDifferentMakerReviewer(runId, author, panel, "DeepSeek")).toBe(first);
      }
    }
  });
});

describe("the catch-up lane takes reviewers in the debate's turn order", () => {
  const runId = runIds[7]!;
  const node = Object.freeze({
    nodeId: "node:qwen-1",
    statement: "A claim",
    authorMaker: "Alibaba",
    authorRawArtifactRef: "artifact:author",
    sourcedEdges: Object.freeze([])
  });
  const reviewOk = () => ({
    outcome: "agree" as const, reasons: ["reviewed"],
    provenanceRef: "artifact:review", providerLedgerRef: "ledger:review",
    parseStrategy: "RAW" as const, edgeMeasurements: []
  });

  function dependencies(reviewers: ReturnType<typeof reviewerDoubles>, overrides: Partial<ReviewCatchUpDependencies> = {}): ReviewCatchUpDependencies {
    return {
      withContentLease: async (_runId, use) => use(),
      readPinnedReviewers: vi.fn(async () => null),
      probePinnedPanel: vi.fn(async () => reviewers),
      recordReviewWithMeasurements: vi.fn(async () => "review:1"),
      readUnreviewedNodes: vi.fn(async () => [node]),
      readDisclosedNodeIds: vi.fn(async () => [node.nodeId]),
      readLatestReviewerMaker: vi.fn(async () => null),
      countRunModelAttempts: vi.fn(async () => 0),
      readPinnedMaximumAttempts: vi.fn(async () => 10),
      prepareVersion: vi.fn(async () => ({
        terminalBefore: "SERVED" as const, terminalAfter: "SERVED" as const,
        numberBefore: 0.7, numberAfter: 0.7, floorBefore: null, floorAfter: null,
        nowVisible: 1, stillSetAside: 0,
        persist: vi.fn(async () => ({ answerVersion: 2 }))
      })),
      ...overrides
    };
  }

  function reviewerDoubles(failFirst: boolean) {
    return panel.map((member) => {
      let calls = 0;
      return {
        ...member,
        review: vi.fn(async () => {
          calls += 1;
          if (failFirst && calls === 1) {
            throw new ProviderCallFailedError(new Error("down"), 3, "FAILED", "ledger:failed");
          }
          return reviewOk();
        })
      };
    });
  }

  const catchUp = (deps: ReviewCatchUpDependencies) => runReviewCatchUp({
    runId, answerId: "answer:1", fromVersion: 1,
    workItemId: "work:original", questionLine: "Question?",
    invocationId: "catch:1", pinnedPanel: panel,
    judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
    judgeContractHash: "contract:judge",
    runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
    hold: { countCooldownHolds: async () => 0, record: async () => undefined, wait: async () => undefined },
    dependencies: deps
  });

  it("asks the maker that follows the author in this debate's order, not the panel's first other maker", async () => {
    const reviewers = reviewerDoubles(false);
    await catchUp(dependencies(reviewers));
    const expected = selectDifferentMakerReviewer(runId, "Alibaba", panel, null);
    // The old rule took the panel's first other maker (Z.AI); this debate's turn differs.
    expect(expected.maker).not.toBe("Z.AI");
    const called = reviewers.filter((reviewer) => reviewer.review.mock.calls.length > 0);
    expect(called.map((reviewer) => reviewer.providerRef)).toEqual([expected.providerRef]);
  });

  it("retries a failed review on the SAME reviewer after the cooldown", async () => {
    const reviewers = reviewerDoubles(true);
    const report = await catchUp(dependencies(reviewers, {
      readLatestReviewerMaker: vi.fn(async () => "Anthropic")
    }));
    const expected = selectDifferentMakerReviewer(runId, "Alibaba", panel, "Anthropic");
    expect(expected.maker).not.toBe("Z.AI");
    const called = reviewers.filter((reviewer) => reviewer.review.mock.calls.length > 0);
    expect(called.map((reviewer) => reviewer.providerRef)).toEqual([expected.providerRef]);
    expect(called[0]!.review).toHaveBeenCalledTimes(2);
    expect(report.reviewed).toBe(1);
  });
});
