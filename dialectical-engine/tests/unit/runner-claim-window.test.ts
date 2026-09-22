import { describe, expect, it } from "vitest";
import { DEVELOPMENT_ORGAN_COST_BOUNDS, DEVELOPMENT_RUN_DEATH_POLICY } from "../../apps/runner/src/dev-deployment-register.js";
import { developmentRunnerClaimMs } from "../../apps/runner/src/dev-runner-process.js";

/**
 * L4-F9 — GRADED "PLAUSIBLE" BY THE AUDIT; PROVED HERE, AND IT IS ARITHMETIC.
 *
 * The brief asked for a test that proves or disproves the finding before
 * anything is built on it. This is that test, and the answer is that the
 * finding holds: the claim window is sized for ONE model call plus the cooldown
 * holds, and a real run makes over a hundred sequential calls inside one claim.
 *
 * `developmentRunnerClaimMs` is
 *
 *     max_cooldown_holds * (cooldown_ms + longest_deadline) + longest_deadline + margin
 *
 * — a window for the worst SINGLE call and the holds around it. It contains no
 * term for how many calls a run makes. `assertClaimCoversCall`
 * (`apps/runner/src/index.ts`) checks exactly the same one-call property, so
 * nothing anywhere compares the window with the LENGTH OF THE RUN.
 *
 * WHAT THAT COSTS, and why the fix is not in this ticket: once
 * `claim_deadline` passes, `packages/battery/src/index.ts` allows a second
 * worker to re-claim the item while the first is still spending model calls
 * against it (a job-system retry, or `reconcileRunnerStartupWork` after a
 * runner restart). Settlement is idempotent, so the ANSWER is safe; the spend
 * and the graph writes are not bounded by it. The repair is a heartbeat that
 * extends `claim_deadline` while the run is in progress — deriving the window
 * from the ceiling instead would make it absurd, as the second case shows —
 * and its proof is a database-backed race between two runners on one item.
 * Both are recorded in the RUN1 report; this file exists so the finding can
 * never quietly regrade itself back to "plausible".
 */

const MEASURED_CALLS_IN_ONE_FULL_RUN = 114;

describe("L4-F9 — the claim window is sized for one call, not for a run", () => {
  it("covers fewer than ten calls at the sealed deadline", () => {
    const longestDeadlineMs = Math.max(
      ...Object.values(DEVELOPMENT_ORGAN_COST_BOUNDS.organs).map((organ) => organ.deadlineMs)
    );
    const claimMs = developmentRunnerClaimMs();
    const callsCovered = Math.floor(claimMs / longestDeadlineMs);

    // Known-good anchors, so a change to either sealed input is visible here.
    expect(longestDeadlineMs).toBe(180_000);
    expect(DEVELOPMENT_RUN_DEATH_POLICY.max_cooldown_holds_per_run).toBe(2);
    expect(claimMs).toBe(1_741_000);

    expect(callsCovered).toBeLessThan(10);
    // ...against a measured full three-maker run (2026-09-17, V-9's row: 114
    // model calls in 79 minutes). The window cannot cover it.
    expect(callsCovered).toBeLessThan(MEASURED_CALLS_IN_ONE_FULL_RUN);
  });

  it("shows why deriving the window from the attempt ceiling is not the repair", () => {
    // DL4-F2 measured the worst-case attempt ceiling at panel 3 / depth 5 as
    // 2 748 attempts. A window that had to cover all of them at the sealed
    // deadline would be longer than five days, which is not a claim — it is the
    // absence of one. The repair has to extend the window as the run proceeds.
    const worstCaseAttempts = 2_748;
    const longestDeadlineMs = 180_000;
    const derivedWindowDays = (worstCaseAttempts * longestDeadlineMs) / (24 * 60 * 60 * 1_000);
    expect(derivedWindowDays).toBeGreaterThan(5);
  });
});
