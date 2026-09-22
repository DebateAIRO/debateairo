import { describe, expect, it } from "vitest";
import {
  RUN_LEVEL_SPEND_STOP_CODES,
  TypedDomainError,
  isRunLevelSpendStop
} from "@debateai/kernel";
import { PanelMemberFailure, runJudgePanel } from "@debateai/judgement";
import {
  envelopeStopKind,
  envelopeStopPendingAttempts,
  expansionPhaseStop,
  reviewFailureOutcome
} from "../../apps/runner/src/index.js";

/**
 * REVIEW ROUND 2, C1 — THE MONEY STOP MUST REACH THE RULED TERMINAL FROM
 * ANYWHERE IN THE RUN BODY, NOT ONLY FROM THE SERVE LEG.
 *
 * The first round wired `envelopeStopKind` into exactly one catch: the try
 * around `runServeGateChain`. Nothing catches between the expansion phase and
 * that try, so a money refusal raised while authoring, expanding, reviewing or
 * composing travelled all the way to the task boundary and became a FAILED work
 * item — nothing kept, nothing served. With the temporary ceiling at 0.25 USD
 * against a 114-call debate that is not an edge case: the ceiling is reached in
 * the first handful of calls, which is always deep in expansion.
 *
 * THE SHAPE OF THE FIX. The envelope terminal cannot be built during expansion —
 * it needs the propagation, the served root and the fact bundle, none of which
 * exist yet — so a money refusal there cannot be turned into a terminal ON THE
 * SPOT. What it must do instead is STOP THE PHASE gracefully and let the run
 * carry on to the point where the terminal CAN be built: the envelope evaluation
 * that already stands in front of the serve chain. The two decisions below are
 * that "stop the phase" rule, named so they can be tested rather than inferred
 * from the shape of a 5 600-line method.
 *
 * WHAT THIS FILE DOES NOT PROVE: that the three loops actually call them. That
 * is a run-through-the-whole-body property and belongs to the database-backed
 * suite; it is named as an open item in the report.
 */
describe("C1 — a money stop halts the phase instead of failing the run", () => {
  it("names a money refusal and a usage refusal as phase stops", () => {
    expect(expansionPhaseStop(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "x")))
      .toBe("MONEY");
    expect(expansionPhaseStop(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "x")))
      .toBe("USAGE");
  });

  it("leaves the ATTEMPT ceiling exactly as it was", () => {
    // Not this package's to change: the attempt ceiling has always propagated
    // from the expansion phase, and altering that would be a behaviour change
    // nobody ruled. It is named here so the omission is deliberate and visible.
    expect(expansionPhaseStop(new TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", "x")))
      .toBeNull();
  });

  it("lets every real failure travel", () => {
    expect(expansionPhaseStop(new TypedDomainError("PROVIDER_CALL_FAILED", "x"))).toBeNull();
    expect(expansionPhaseStop(new TypeError("boom"))).toBeNull();
    expect(expansionPhaseStop(undefined)).toBeNull();
  });
});

/**
 * C1, second half — the node-review catch REWROTE a money refusal.
 *
 * Its rethrow list carried `RUN_COST_ENVELOPE_EXHAUSTED` and
 * `CALL_BUDGET_EXHAUSTED` but not the money code, so a refusal raised during a
 * review came out as `NODE_REVIEW_UNAVAILABLE` — a diagnostic naming the wrong
 * cause, and one that no envelope path can recognise.
 */
describe("C1 — the node-review catch tells three outcomes apart", () => {
  it("stops the review phase on a money or usage refusal", () => {
    expect(reviewFailureOutcome(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "x")))
      .toEqual({ kind: "BUDGET_STOP", stop: "MONEY" });
    expect(reviewFailureOutcome(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "x")))
      .toEqual({ kind: "BUDGET_STOP", stop: "USAGE" });
  });

  it("rethrows what it always rethrew, untouched", () => {
    for (const code of [
      "RUN_COST_ENVELOPE_EXHAUSTED", "CALL_BUDGET_EXHAUSTED", "PRODUCER_GRADING_FORBIDDEN"
    ]) {
      expect(reviewFailureOutcome(new TypedDomainError(code, "x"))).toEqual({ kind: "RETHROW" });
    }
  });

  it("still reports a genuine review failure as review-unavailable", () => {
    expect(reviewFailureOutcome(new TypedDomainError("PROVIDER_CALL_FAILED", "x")))
      .toEqual({ kind: "UNAVAILABLE" });
    expect(reviewFailureOutcome(new TypeError("boom"))).toEqual({ kind: "UNAVAILABLE" });
  });
});

/**
 * RULING R2 — a hosted vendor that reports no usage is a VENDOR OR CONFIGURATION
 * fault, not the asker's. The run therefore ends the same clean way a money stop
 * ends: the components-only envelope terminal, keeping what it produced. The
 * typed code stays the diagnostic, so the condition-mark record still names the
 * real cause and the operator is not told they ran out of money when they did
 * not.
 */
describe("R2 — an unbillable vendor ends the run cleanly, under its own name", () => {
  it("is an envelope stop of its own kind", () => {
    expect(envelopeStopKind(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "x")))
      .toBe("USAGE");
  });

  it("keeps the other two kinds distinct", () => {
    expect(envelopeStopKind(new TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", "x")))
      .toBe("ATTEMPTS");
    expect(envelopeStopKind(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "x")))
      .toBe("MONEY");
  });

  it("still lets a real failure travel", () => {
    expect(envelopeStopKind(new TypedDomainError("PROVIDER_CALL_FAILED", "x"))).toBeNull();
  });
});

/**
 * RE-REVIEW C2(b) — THE PANEL PATH ERASED THE REFUSAL.
 *
 * `PanelJudge.assess` rewrites every non-Provider error into
 * `PanelMemberFailure("PROVIDER_ERROR")`, and `runJudgePanel` swallows that into
 * a MEMBER_FAILED note and carries on to the next member. So a money stop was
 * misattributed as a transport fault, the loop kept going, and a USAGE stop only
 * fired after another call had already been made and billed.
 *
 * A run-level spend stop is not a member's problem: it is the RUN's, and it must
 * travel untouched through both.
 */
describe("C2(b) — a run-level spend stop is never a panel member failure", () => {
  it("names the three run-level stops, and nothing else", () => {
    expect([...RUN_LEVEL_SPEND_STOP_CODES].sort()).toEqual([
      "DAILY_COST_ENVELOPE_REACHED",
      "PROVIDER_USAGE_UNREPORTED",
      "RUN_COST_ENVELOPE_MONEY_REACHED"
    ]);
    for (const code of RUN_LEVEL_SPEND_STOP_CODES) {
      expect(isRunLevelSpendStop(new TypedDomainError(code, "x"))).toBe(true);
    }
    // The ATTEMPT ceiling is a run-level bound too, but it is NOT in this set:
    // it has always been a panel member failure and this package does not
    // change what it does.
    expect(isRunLevelSpendStop(new TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", "x"))).toBe(false);
    expect(isRunLevelSpendStop(new TypedDomainError("PROVIDER_CALL_FAILED", "x"))).toBe(false);
    expect(isRunLevelSpendStop(new TypeError("boom"))).toBe(false);
  });

  it("rethrows a run-level stop out of runJudgePanel instead of noting it", async () => {
    const reached: string[] = [];
    await expect(runJudgePanel({
      artifactProducerRef: "actor:author",
      primary: { judgementRef: "j0", assessment: {} as never, memberRole: "primary" },
      members: [
        {
          memberRole: "panel-1", actorRef: "actor:one", contractHash: "c1",
          judge: async () => {
            reached.push("panel-1");
            throw new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "spent");
          }
        },
        {
          memberRole: "panel-2", actorRef: "actor:two", contractHash: "c2",
          judge: async () => { reached.push("panel-2"); return { judgementRef: "j2", assessment: {} as never }; }
        }
      ]
    })).rejects.toThrowError(
      expect.objectContaining({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" })
    );

    // And it stops the panel where it stood: the second member is never called,
    // which is the whole point — every further member is another billed call.
    expect(reached).toEqual(["panel-1"]);
  });

  it("still records an ordinary member failure as a note", async () => {
    const panel = await runJudgePanel({
      artifactProducerRef: "actor:author",
      primary: { judgementRef: "j0", assessment: {} as never, memberRole: "primary" },
      members: [{
        memberRole: "panel-1", actorRef: "actor:one", contractHash: "c1",
        judge: async () => { throw new PanelMemberFailure("TIMEOUT", "slow"); }
      }]
    });

    expect(panel.notes).toHaveLength(1);
    expect(panel.notes[0]).toMatchObject({ kind: "MEMBER_FAILED", failureKind: "TIMEOUT" });
  });
});

/**
 * RE-REVIEW C3 — THE SERVE LEG ASKED THE ATTEMPT QUESTION FOR A USAGE STOP.
 *
 * Round 2 branched on `stop === "MONEY"`, so a USAGE stop fell to
 * `evaluateEnvelope(1)` — "does one more ATTEMPT fit?" — which for a run with
 * attempts to spare answers WITHIN, and the catch then rethrew. R2's whole point
 * was that such a run ends cleanly keeping its work; it did not.
 *
 * Only the ATTEMPT stop asks the attempt question. Every other stop forces the
 * hard stop on its own footing, because a run can have dozens of attempts left
 * and still be unable to pay for, or bill, a single one.
 */
describe("C3 — which question each stop asks of the envelope", () => {
  it("asks the attempt question only for the attempt ceiling", () => {
    expect(envelopeStopPendingAttempts("ATTEMPTS"))
      .toEqual({ pendingModelAttempts: 1, forceHardStop: false });
  });

  it("forces the hard stop for money and for an unbillable vendor alike", () => {
    for (const stop of ["MONEY", "USAGE"] as const) {
      expect(envelopeStopPendingAttempts(stop))
        .toEqual({ pendingModelAttempts: 0, forceHardStop: true });
    }
  });
});
