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
import { CALL_LANE_HELD_BACK, CALL_LANE_STOPPED } from "../../apps/runner/src/call-scheduler.js";

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
    // Two stops: `runChain`'s, and (ruling R30, Task 12 fix round 1) the keep-alive hook's on the parallel path — each
    // right after marking the body failed. Debate shape (P2b Task 12): plus the map stage's own, when an abandon
    // leaves the map before root 0 (no arguing has started, so there is no body to mark failed).
    expect(source.match(/callLane\?\.stop\(\)/gu) ?? []).toHaveLength(3);
    expect(source).toMatch(/\} catch \(error\) \{\s*callLane\?\.stop\(\);\s*\/\/ Controller ruling T12-W/u);
    expect(source).toMatch(/if \(keepAliveStop\(error\)\) \{\s*bodyFailed = true;\s*callLane\?\.stop\(\);\s*keepAliveStopped\.resolve\(error\);/u);
    // Debate shape (plan Task 13): a root's turn also writes which answer it argued, after its node — never after a failure.
    expect(source).toMatch(/nodeRecorder\.commit\(0, async \(\) => \{\s*if \(bodyFailed\) return null;\s*const saved = await saveAuthored\(0,/u);
    expect(source).toMatch(/nodeRecorder\.commit\(rootIndex, async \(\) => \{\s*if \(bodyFailed\) return null;\s*const node = await saveAuthored\(rootIndex,/u);
    expect(source).toContain("if (outcome.kind === \"STOPPED\" || bodyFailed) return;");
    expect(source).toContain("!(error instanceof TypedDomainError && error.code === CALL_LANE_STOPPED)");
  });
});

// Task 12 (spec §2.3, O6; Task 10 review carry, ruled): once the arguing has stopped (a spend stop, too few members
// left), the lane HOLDS BACK every AUTHOR and REVIEW call it would start (CALL_LANE_HELD_BACK: never sent). The chain
// that asked ends there, as a chain that saw the stop before its call ends — its positions given up, never a failure —
// so the refusal must leave every catch on its way exactly as it arrived, and `runChain` must drop it. The guard exists
// only while the arguing runs together: today's serial engine (one call at a time, R23) never installs one.
describe("a call the lane held back leaves as it arrived, and ends its chain without a failure", () => {
  const heldBack = () => new TypedDomainError(CALL_LANE_HELD_BACK, "The arguing of debate d has stopped; the call was not sent");

  it("no catch on its way relabels it: no spend stop, no seat switch, no hold, the review catch rethrows it", async () => {
    expect(reviewFailureOutcome(heldBack())).toEqual({ kind: "RETHROW" });
    expect(expansionPhaseStop(heldBack())).toBeNull();
    expect(seatFailureCause(heldBack())).toBeNull();
    const refused = heldBack();
    const hold = { countCooldownHolds: vi.fn(async () => 0), record: vi.fn(async () => undefined), wait: vi.fn(async () => undefined) };
    for (const failureScope of ["MAKER_POSITION", "EXPANSION", "REVIEW"] as const) {
      await expect(withCooldownRetry({
        runId: "run:held-back", callSiteKey: "JUDGE:root:2", parentNodeId: null, plannedLegCount: 1, baseMaxAttempts: 3,
        failureScope, policy: { cooldownMs: 600_000, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 2 }, hold,
        attempt: async () => { throw refused; }
      })).rejects.toBe(refused);
    }
    expect(hold.record).not.toHaveBeenCalled();
    expect(hold.wait).not.toHaveBeenCalled();
  });

  it("the runner: runChain drops it before marking the body failed; the guard lives only while the arguing runs together", () => {
    const source = readFileSync(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    expect(source).toMatch(/\.catch\(\(error: unknown\) => \{\s*if \(callHeldBack\(error\)\) return;\s*bodyFailed = true;/u);
    // Installed and removed in one place, inside `if (chainsRun)` (calls run together, or a shaped run, whose chains
    // always run through the lane — plan Task 13), never on the serial engine's branch.
    const together = source.indexOf("    if (chainsRun) {\n");
    const serial = source.indexOf("    } else {\n", together);
    expect(together).toBeGreaterThan(0);
    const installs = [...source.matchAll(/callLane\?\.guardStarts\(/gu)].map((match) => match.index!);
    // Debate shape (P2b Task 12): the map stage installs its own guard while the map runs and removes it after, before
    // root 0 — so before the arguing's block; the arguing's two are inside it.
    const mapStage = source.indexOf("const runMap = async (): Promise<");
    expect(mapStage).toBeGreaterThan(0);
    expect(installs.filter((at) => at > mapStage && at < together)).toHaveLength(2);
    const arguing = installs.filter((at) => at > together);
    expect(arguing).toHaveLength(2);
    for (const at of arguing) expect(at > together && at < serial).toBe(true);
    const failedHooks = [...source.matchAll(/laneCallFailed = /gu)].map((match) => match.index);
    expect(failedHooks).toHaveLength(2);
    for (const at of failedHooks) expect(at > together && at < serial).toBe(true);
    // R30: the keep-alive hook is not behind the cheaper-model setting; only the spend mark is.
    expect(source).toContain("if (spendRefusalsCount && expansionPhaseStop(error) !== null) spendRefusalSeen = true;");
    // The keep-alive stop ends the arguing without awaiting the calls in flight, every promise left behind handled.
    expect(source).toContain("const keepAliveRefusal = await Promise.race([allSettled.then(() => null), keepAliveStopped.promise]);");
    expect(source).toContain("for (const abandoned of [allSettled, ...chains, everyBoundaryDecided, earlierBatches]) abandoned.catch(() => undefined);");
  });
});
