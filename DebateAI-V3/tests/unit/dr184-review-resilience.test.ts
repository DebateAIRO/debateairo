import { describe, expect, it, vi } from "vitest";
import { ProviderCallFailedError } from "@debateai/providers";
import {
  withCooldownRetry,
  type HoldProgressEvent
} from "@debateai/runner";
import { computeStructuralCeilingBasis } from "@debateai/register";

const policy = Object.freeze({
  cooldownMs: 600_000,
  finalRetryAttempts: 1,
  maxCooldownHoldsPerRun: 2
});

const failure = (attempts = 3) => new ProviderCallFailedError(
  new Error("test-layer transport failure"),
  attempts,
  "FAILED",
  `ledger:test:${attempts}`
);

function recorder(holds: number) {
  const events: HoldProgressEvent[] = [];
  return {
    events,
    countCooldownHolds: vi.fn(async () => holds),
    record: vi.fn(async (event: HoldProgressEvent) => { events.push(event); }),
    wait: vi.fn(async () => undefined)
  };
}

describe("DR-184 review resilience mutation ledger", () => {
  it("T2 gives a review the final same-key attempt after the run hold cap, without waiting", async () => {
    const hold = recorder(2);
    const attempt = vi.fn()
      .mockRejectedValueOnce(failure(3))
      .mockResolvedValueOnce("reviewed");

    await expect(withCooldownRetry({
      runId: "run:test",
      callSiteKey: "JUDGE:review:node:test",
      parentNodeId: "node:test",
      plannedLegCount: 1,
      baseMaxAttempts: 3,
      failureScope: "REVIEW",
      policy,
      hold,
      attempt
    })).resolves.toEqual({ kind: "AUTHORED", value: "reviewed" });

    expect(attempt.mock.calls).toEqual([[3], [4]]);
    expect(hold.wait).not.toHaveBeenCalled();
  });

  it("T3 gives reviews zero in-run holds and does not consume the authoring hold pool", async () => {
    const hold = recorder(0);
    const attempt = vi.fn()
      .mockRejectedValueOnce(failure(3))
      .mockResolvedValueOnce("reviewed");

    await withCooldownRetry({
      runId: "run:test",
      callSiteKey: "JUDGE:review:node:test",
      parentNodeId: "node:test",
      plannedLegCount: 1,
      baseMaxAttempts: 3,
      failureScope: "REVIEW",
      policy,
      hold,
      attempt
    });

    expect(hold.countCooldownHolds).not.toHaveBeenCalled();
    expect(hold.wait).not.toHaveBeenCalled();
    expect(hold.events).toEqual([]);
  });

  it.each([
    ["MAKER_POSITION", "MAKER_POSITION_HALTED"],
    ["EXPANSION", "EXPANSION_HALTED"],
    ["REVIEW", "REVIEW_HALTED"]
  ] as const)("T4 records a typed halt for %s", async (failureScope, state) => {
    const hold = recorder(2);
    const attempt = vi.fn()
      .mockRejectedValueOnce(failure(3))
      .mockRejectedValueOnce(failure(1));

    await expect(withCooldownRetry({
      runId: "run:test",
      callSiteKey: `JUDGE:${failureScope}`,
      parentNodeId: "node:test",
      plannedLegCount: 1,
      baseMaxAttempts: 3,
      failureScope,
      policy,
      hold,
      attempt
    })).resolves.toMatchObject({ kind: "HALTED" });

    expect(attempt.mock.calls).toEqual([[3], [4]]);
    expect(hold.events.at(-1)).toMatchObject({
      kind: "ledger.could_not_do",
      state,
      attemptsSpent: 4
    });
  });

  it("T5 pins the corrected per-site final-retry ceiling and formula version", () => {
    const expected = [
      [28, 28, 28, 28, 28],
      [88, 152, 280, 536, 1048],
      [144, 240, 432, 816, 1584],
      [216, 344, 600, 1112, 2136]
    ];
    for (let panelSize = 1; panelSize <= 4; panelSize += 1) {
      for (let depth = 1; depth <= 5; depth += 1) {
        const basis = computeStructuralCeilingBasis({
          panelSize,
          depth,
          judgeMaxAttempts: 3,
          organMaxAttempts: 3,
          maxRecompose: 2,
          maxCooldownHoldsPerRun: 2,
          finalRetryAttempts: 1,
          branchingFactor: 2,
          compositionSegmentCap: 2,
          fixedOrgansPerComposition: 4
        });
        expect(basis.max_model_attempts).toBe(expected[panelSize - 1]![depth - 1]);
        expect(basis.formula_version).toBe("DR-184-v2");
      }
    }
  });
});
