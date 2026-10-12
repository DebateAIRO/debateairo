// Parallel AI calls, Task 10 review (fix round 1): a call the debate's STOPPED lane refused (CALL_LANE_STOPPED: a chain
// failed, `runChain` stopped the lane, and this call was still waiting for a slot) is a consequence of that failure,
// never a failure of its own. It must leave every catch on its way exactly as it arrived, so `throwBodyFailure` (which
// sets CALL_LANE_STOPPED aside) throws the REAL failure, whatever its rank. Were a review's refusal relabelled
// NODE_REVIEW_UNAVAILABLE, a lower-ranked review waiting for a slot would outrank, say, a RUNNER_CLAIM_LOST, and the
// Hatchet handler would record a terminal FAILED on a debate another copy is still running (L4-F9).
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { runJudgePanel } from "@debateai/judgement";
import { expansionPhaseStop, reviewFailureOutcome, seatFailureCause, withCooldownRetry } from "@debateai/runner";
import { CALL_LANE_STOPPED } from "../../apps/runner/src/call-scheduler.js";

const laneStopped = () => new TypedDomainError(CALL_LANE_STOPPED, "The call lane of debate d is stopped; the call was not sent");

describe("a call refused by the stopped lane leaves as it arrived", () => {
  it("the review catch rethrows it untouched (never NODE_REVIEW_UNAVAILABLE)", () => {
    expect(reviewFailureOutcome(laneStopped())).toEqual({ kind: "RETHROW" });
  });

  it("the author path: no spend stop, no seat switch, and the cooldown wrapper neither holds nor halts on it", async () => {
    expect(expansionPhaseStop(laneStopped())).toBeNull();
    expect(seatFailureCause(laneStopped())).toBeNull();
    const refused = laneStopped();
    const hold = { countCooldownHolds: vi.fn(async () => 0), record: vi.fn(async () => undefined), wait: vi.fn(async () => undefined) };
    for (const failureScope of ["MAKER_POSITION", "EXPANSION", "REVIEW"] as const) {
      await expect(withCooldownRetry({
        runId: "run:lane-stopped", callSiteKey: "JUDGE:root:2", parentNodeId: null, plannedLegCount: 1, baseMaxAttempts: 3,
        failureScope, policy: { cooldownMs: 600_000, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 2 }, hold,
        attempt: async () => { throw refused; }
      })).rejects.toBe(refused);
    }
    // No HALTED record (so never MAKER_POSITION_UNAVAILABLE), no hold, no final retry.
    expect(hold.record).not.toHaveBeenCalled();
    expect(hold.wait).not.toHaveBeenCalled();
  });

  it("a panel member it refused is one failed member; the panel neither throws it nor stops on it", async () => {
    const panel = await runJudgePanel({
      artifactProducerRef: "provider:author",
      primary: { judgementRef: "judgement:author", assessment: {} as never, memberRole: "Author maker" },
      members: [{
        memberRole: "Other maker", actorRef: "provider:other", contractHash: "contract:judge",
        judge: async () => { throw laneStopped(); }
      }],
      onRunLevelSpendStop: "RETURN_HEARD"
    });
    expect(Object.hasOwn(panel, "stoppedBy")).toBe(false);
    expect(panel.notes).toEqual([expect.objectContaining({ kind: "MEMBER_FAILED", memberRole: "Other maker" })]);
  });

  /**
   * Why a panel's failed member cannot change the outcome: the lane is stopped only by a chain that failed, and
   * `runChain` marks the body failed BEFORE stopping it; after that no node is saved and no review recorded, and the
   * failure thrown is the first one in today's order that is not a stopped-lane refusal.
   */
  it("the runner stops the lane only after marking the body failed, saves nothing after, and sets the refusal aside", () => {
    const source = readFileSync(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    expect(source).toMatch(/bodyFailed = true;\s*bodyFailures\.push\(Object\.freeze\(\{ rank: stage\.rank, error \}\)\);\s*callLane\?\.stop\(\);/u);
    expect(source.match(/callLane\?\.stop\(\)/gu) ?? []).toHaveLength(1);
    expect(source).toContain("nodeRecorder.commit(0, async () => bodyFailed ? null : saveAuthored(");
    expect(source).toContain("nodeRecorder.commit(rootIndex, async () => bodyFailed ? null : saveAuthored(");
    expect(source).toContain("if (outcome.kind === \"STOPPED\" || bodyFailed) return;");
    expect(source).toContain("!(error instanceof TypedDomainError && error.code === CALL_LANE_STOPPED)");
  });
});
