import { describe, expect, it } from "vitest";
import { INTERLEAVING_DISPOSITIONS, assertClaimCoversCall } from "@debateai/battery";

describe("ADR-0017 clause 3 — six-case Hatchet composition", () => {
  it("transcribes A–F with only the ruled zombie-overlap residual permitting a second call", () => {
    expect(INTERLEAVING_DISPOSITIONS).toEqual([
      { case: "A", terminal: "NO_OP_LIVE_CLAIM", secondRealCall: false },
      { case: "B", terminal: "NO_OP_LIVE_CLAIM", secondRealCall: false },
      { case: "C", terminal: "REAP_THEN_RECLAIM", secondRealCall: false },
      { case: "D", terminal: "ZOMBIE_OVERLAP_RESIDUAL", secondRealCall: true },
      { case: "E", terminal: "NO_OP_SETTLED", secondRealCall: false },
      { case: "F", terminal: "COMPLETE_EXISTING_SETTLEMENT", secondRealCall: false }
    ]);
  });

  it("refuses a claim duration that does not cover the call deadline plus configured margin", () => {
    expect(() => assertClaimCoversCall({ claimMs: 5_999, deadlineMs: 5_000, marginMs: 1_000 })).toThrow("CLAIM_BOUND_MISMATCH");
    expect(() => assertClaimCoversCall({ claimMs: 6_000, deadlineMs: 5_000, marginMs: 1_000 })).not.toThrow();
    expect(() => assertClaimCoversCall({
      claimMs: 1_215_999,
      deadlineMs: 5_000,
      marginMs: 1_000,
      cooldownMs: 600_000,
      maxCooldownHoldsPerRun: 2
    })).toThrow("CLAIM_BOUND_MISMATCH");
    expect(() => assertClaimCoversCall({
      claimMs: 1_216_000,
      deadlineMs: 5_000,
      marginMs: 1_000,
      cooldownMs: 600_000,
      maxCooldownHoldsPerRun: 2
    })).not.toThrow(); // MUT-RESIL01-T14: omit a hold/deadline term -> RED.
  });
});
