import { describe, expect, it, vi } from "vitest";
import {
  countMeasuredEdges,
  decideBranchFreezes,
  decideRoundBoundary,
  decideRoundContinuation,
  evaluate,
  resolveLeverage,
  type EvaluationSnapshot,
  type OperatorResolution,
  type SnapshotArrow,
  type SnapshotNode
} from "@debateai/propagation";

/**
 * T7 — adaptive stopping (goal-v4 169-186; rulings S3-2, S5-1; mission J3).
 *
 * Every δ and ε below is a THRESHOLD CHOSEN BY THIS TEST so the arithmetic can
 * be stated exactly. The product's δ/ε are T16's sealed register rows, read
 * through `readAdaptiveStoppingControls`; no code constant carries either, and
 * nothing here re-declares one.
 *
 * All numbers are dyadic rationals, so `toBe` is exact — never `toBeCloseTo`.
 */

const node = (nodeId: string, baseStrength: number | null): SnapshotNode => ({ nodeId, baseStrength });

const support = (
  arrowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  strength: number | null,
  magnitudeStatus: "MEASURED" | "UNKNOWN" = "MEASURED"
): SnapshotArrow => ({
  arrowId,
  sourceNodeId,
  targetKind: "NODE",
  targetNodeId,
  targetEdgeId: null,
  polarity: "support",
  kind: null,
  strength,
  magnitudeStatus,
  strengthSource: "REVIEWER"
});

const resolution = (parentNodeId: string): OperatorResolution =>
  ({ parentNodeId, operator: "accumulate", suppliedBy: "deployment" });

const snapshot = (
  nodes: readonly SnapshotNode[],
  arrows: readonly SnapshotArrow[],
  operatorResolutions: readonly OperatorResolution[]
): EvaluationSnapshot => ({
  nodes,
  arrows,
  arrowOrder: arrows.map((item) => item.arrowId),
  operatorResolutions,
  clusterRecords: []
});

/**
 * The root-scope discriminator graph.
 *
 *   heavy --support 0.5 MEASURED--> root:A
 *   mid   --support   UNKNOWN  --> root:A
 *   light --support 0.5 MEASURED--> mid
 *
 * `light` moves a NON-root node and no root. Under the all-nodes reading its
 * leverage is 0.125 and it would never freeze; under J3's root-scoped reading
 * (b) it is 0, and it freezes. `heavy` moves the root by exactly 0.125.
 */
const discriminator = snapshot(
  [node("root:A", 0.5), node("heavy", 0.5), node("mid", 0.5), node("light", 0.5)],
  [
    support("e:heavy->A", "heavy", "root:A", 0.5),
    support("e:mid->A", "mid", "root:A", null, "UNKNOWN"),
    support("e:light->mid", "light", "mid", 0.5)
  ],
  [resolution("root:A"), resolution("mid")]
);

const ROOTS = ["root:A"] as const;

const leverageOf = (carryingNodeId: string, rootNodeIds: readonly string[] = ROOTS): number =>
  resolveLeverage({
    completedRounds: 1,
    carryingNodeId,
    sensitivityRecords: evaluate(discriminator).sensitivityRecords,
    rootNodeIds
  }).leverage;

/** Round 2 of a two-root debate: root:A carries one measured supporter. */
const roundTwo = snapshot(
  [node("root:A", 0.5), node("root:B", 0.5), node("heavy", 0.5)],
  [support("e:heavy->A", "heavy", "root:A", 0.5)],
  [resolution("root:A")]
);

/** Round 3, converged: the new voice is worth 1/64 and moves root:A by 3/1024. */
const roundThreeConverged = snapshot(
  [node("root:A", 0.5), node("root:B", 0.5), node("heavy", 0.5), node("whisper", 0.5)],
  [
    support("e:heavy->A", "heavy", "root:A", 0.5),
    support("e:whisper->A", "whisper", "root:A", 0.015625)
  ],
  [resolution("root:A")]
);

/** Round 3, still moving: the new voice is worth 0.25 and moves root:A by 3/64. */
const roundThreeMoved = snapshot(
  [node("root:A", 0.5), node("root:B", 0.5), node("heavy", 0.5), node("loud", 0.5)],
  [
    support("e:heavy->A", "heavy", "root:A", 0.5),
    support("e:loud->A", "loud", "root:A", 0.25)
  ],
  [resolution("root:A")]
);

/**
 * The next representable binary64 above a positive finite value: increment the
 * bit pattern by one. For positives the IEEE-754 encoding is monotonic in the
 * unsigned integer reading, so +1 is exactly one ULP up. (codex r2 N2)
 */
const nextUpBinary64 = (value: number): number => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) + 1n);
  return view.getFloat64(0);
};

const TWO_ROOTS = ["root:A", "root:B"] as const;

describe("T7 / S3-2 + S5-1 — the graph the sensitivity is read from", () => {
  it("scores the discriminator graph to the exact numbers every case below quotes", () => {
    const values = new Map(evaluate(discriminator).strengths.map((row) => [row.nodeId, row.strength]));

    expect(values.get("heavy")).toBe(0.5);
    expect(values.get("light")).toBe(0.5);
    // 0.5 * 0.5 = 0.25 support on a tau of 0.5 -> 0.5 + 0.5*0.25
    expect(values.get("mid")).toBe(0.625);
    // The UNKNOWN mid->A edge contributes nothing, so root:A rests on `heavy` alone.
    expect(values.get("root:A")).toBe(0.625);
  });
});

describe("T7 / J3 — leverage is ROOT-SCOPED (mission DECISIONS.md J3, reading (b))", () => {
  it("restricts the recorded fragility rows to the caller-supplied roots", () => {
    const outcome = evaluate(discriminator);
    const lightRecord = outcome.sensitivityRecords.find((row) => row.removedNodeId === "light")!;

    // The recorded all-nodes field stays recorded, and stays UNCONSUMED by the rule.
    expect(lightRecord.leverage).toBe(0.125);
    expect(lightRecord.fragility.find((row) => row.nodeId === "mid")!.difference).toBe(0.125);
    expect(lightRecord.fragility.find((row) => row.nodeId === "root:A")!.difference).toBe(0);

    // J3: the freeze quantity is the ROOT-restricted maximum — 0, not 0.125.
    expect(leverageOf("light")).toBe(0);
    expect(leverageOf("heavy")).toBe(0.125);
  });

  it("gives an UNKNOWN-edged branch zero leverage, so UNKNOWN can never unfreeze it", () => {
    const midRecord = evaluate(discriminator).sensitivityRecords.find((row) => row.removedNodeId === "mid")!;

    expect(midRecord.leverage).toBe(0);
    expect(leverageOf("mid")).toBe(0);
  });

  it("names the roots it was restricted to and refuses an empty root scope", () => {
    const resolved = resolveLeverage({
      completedRounds: 1,
      carryingNodeId: "heavy",
      sensitivityRecords: evaluate(discriminator).sensitivityRecords,
      rootNodeIds: ROOTS
    });

    expect(resolved).toEqual({
      kind: "LEVERAGE_RESOLVED",
      carryingNodeId: "heavy",
      leverage: 0.125,
      rootNodeIds: ["root:A"]
    });
    expect(Object.isFrozen(resolved)).toBe(true);

    // An empty root scope would silently make every branch leverage 0 and freeze
    // the whole debate. It is a typed loud stop, never a quiet freeze.
    expect(() => resolveLeverage({
      completedRounds: 1,
      carryingNodeId: "heavy",
      sensitivityRecords: evaluate(discriminator).sensitivityRecords,
      rootNodeIds: []
    })).toThrowError(expect.objectContaining({ code: "LEVERAGE_ROOT_SCOPE_EMPTY" }));
  });

  it("keeps the round-1 floor at the leverage door and refuses an unrecorded subtree root", () => {
    expect(() => resolveLeverage({
      completedRounds: 0,
      carryingNodeId: "heavy",
      sensitivityRecords: evaluate(discriminator).sensitivityRecords,
      rootNodeIds: ROOTS
    })).toThrowError(expect.objectContaining({ code: "LEVERAGE_ROUND_INCOMPLETE" }));

    expect(() => resolveLeverage({
      completedRounds: 1,
      carryingNodeId: "node:never-scored",
      sensitivityRecords: evaluate(discriminator).sensitivityRecords,
      rootNodeIds: ROOTS
    })).toThrowError(expect.objectContaining({ code: "LEVERAGE_SUBTREE_ROOT_UNRECORDED" }));
  });
});

describe("T7 DoD (b) — one branch is frozen while its sibling continues", () => {
  it("freezes `light` at leverage 0 and lets `heavy` at 0.125 keep expanding, with epsilon 0.01", () => {
    const decisions = decideBranchFreezes({
      completedRounds: 1,
      sensitivityRecords: evaluate(discriminator).sensitivityRecords,
      branchCarryingNodeIds: ["heavy", "light"],
      rootNodeIds: ROOTS,
      epsilon: 0.01
    });

    expect(decisions).toEqual([
      { carryingNodeId: "heavy", leverage: 0.125, verdict: "CONTINUES" },
      { carryingNodeId: "light", leverage: 0, verdict: "FROZEN" }
    ]);
  });

  it("would freeze NEITHER under the all-nodes reading J3 overrode", () => {
    const outcome = evaluate(discriminator);
    const allNodes = ["heavy", "light"].map((nodeId) =>
      outcome.sensitivityRecords.find((row) => row.removedNodeId === nodeId)!.leverage);

    // Reading (a) cannot tell the two branches apart at all — both read 0.125.
    expect(allNodes).toEqual([0.125, 0.125]);
    // Reading (b) does, and that difference is the whole freeze rule.
    expect(["heavy", "light"].map((nodeId) => leverageOf(nodeId))).toEqual([0.125, 0]);
  });
});

describe("T7 DoD (d) — EQUALITY AT ε CONTINUES (it is not frozen)", () => {
  it("continues a branch whose root-scoped leverage is exactly epsilon", () => {
    const decisions = decideBranchFreezes({
      completedRounds: 1,
      sensitivityRecords: evaluate(discriminator).sensitivityRecords,
      branchCarryingNodeIds: ["heavy", "light"],
      rootNodeIds: ROOTS,
      // epsilon set to the EXACT leverage of `heavy`.
      epsilon: 0.125
    });

    expect(decisions).toEqual([
      // 0.125 < 0.125 is false — the freeze is STRICTLY less-than.
      { carryingNodeId: "heavy", leverage: 0.125, verdict: "CONTINUES" },
      { carryingNodeId: "light", leverage: 0, verdict: "FROZEN" }
    ]);
  });

  it("freezes the same branch the moment epsilon rises ONE REPRESENTABLE STEP above it", () => {
    // codex r2 N2: `0.126` is above 1/8 but it is NOT the next binary64 value,
    // and in a lane contracted to exact threshold arithmetic the claim has to be
    // exact. 1/8 = 2^-3, so the spacing immediately above it is 2^(-3-52) =
    // 2^-55 and the true successor is 1/8 + 2^-55. Two independent derivations
    // agree below: a bit-pattern increment, and the closed form.
    const epsilon = nextUpBinary64(0.125);

    expect(epsilon).not.toBe(0.125);
    expect(epsilon).toBe(0.125 + 2 ** -55);           // closed form, exactly representable
    expect(epsilon).toBeLessThan(0.126);              // strictly below the old literal
    expect((epsilon - 0.125) / 2 ** -55).toBe(1);     // exactly ONE step, not two

    const decisions = decideBranchFreezes({
      completedRounds: 1,
      sensitivityRecords: evaluate(discriminator).sensitivityRecords,
      branchCarryingNodeIds: ["heavy"],
      rootNodeIds: ROOTS,
      epsilon
    });

    // The smallest epsilon in binary64 that can freeze a leverage of exactly 1/8.
    expect(decisions).toEqual([{ carryingNodeId: "heavy", leverage: 0.125, verdict: "FROZEN" }]);
  });
});

describe("T7 DoD (a) — the global δ stop fires BEFORE the depth ceiling", () => {
  const rootStrengths = (input: EvaluationSnapshot): ReadonlyMap<string, number> =>
    new Map(evaluate(input).strengths.map((row) => [row.nodeId, row.strength]));

  it("stops at round 2 of a ceiling of 5 when no root moved more than delta", () => {
    const before = rootStrengths(roundTwo);
    const after = rootStrengths(roundThreeConverged);

    expect(before.get("root:A")).toBe(0.625);
    expect(after.get("root:A")).toBe(0.6279296875);
    expect(before.get("root:B")).toBe(0.5);
    expect(after.get("root:B")).toBe(0.5);

    const decision = decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 2,
      previousStrengths: evaluate(roundTwo).strengths,
      currentStrengths: evaluate(roundThreeConverged).strengths,
      measuredEdgeCount: countMeasuredEdges(roundThreeConverged),
      delta: 0.01
    });

    expect(decision).toEqual({
      kind: "STOP",
      reason: "GLOBAL_DELTA_CONVERGED",
      maxRootMovement: 0.0029296875,
      movedRootNodeIds: [],
      measuredEdgeCount: 2,
      comparedRootNodeIds: ["root:A", "root:B"],
      uncomparedRootNodeIds: [],
      expectedRootCount: 2
    });
  });

  it("keeps going at the same round when one root moved more than delta", () => {
    const decision = decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 2,
      previousStrengths: evaluate(roundTwo).strengths,
      currentStrengths: evaluate(roundThreeMoved).strengths,
      measuredEdgeCount: countMeasuredEdges(roundThreeMoved),
      delta: 0.01
    });

    expect(decision).toEqual({
      kind: "CONTINUE",
      reason: "ROOT_MOVED",
      maxRootMovement: 0.046875,
      movedRootNodeIds: ["root:A"],
      measuredEdgeCount: 2,
      comparedRootNodeIds: ["root:A", "root:B"],
      uncomparedRootNodeIds: [],
      expectedRootCount: 2
    });
  });

  it("stops at EXACTLY delta, the mirror image of epsilon's equality rule", () => {
    // The two thresholds are deliberately opposite, and that is easy to get
    // wrong in one place: the stop is "no root moved > δ", so movement equal to
    // δ STOPS; the freeze is "leverage < ε", so leverage equal to ε CONTINUES.
    const atDelta = decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 2,
      previousStrengths: evaluate(roundTwo).strengths,
      currentStrengths: evaluate(roundThreeMoved).strengths,
      measuredEdgeCount: countMeasuredEdges(roundThreeMoved),
      delta: 0.046875
    });
    expect(atDelta).toEqual({
      kind: "STOP",
      reason: "GLOBAL_DELTA_CONVERGED",
      maxRootMovement: 0.046875,
      movedRootNodeIds: [],
      measuredEdgeCount: 2,
      comparedRootNodeIds: ["root:A", "root:B"],
      uncomparedRootNodeIds: [],
      expectedRootCount: 2
    });

    const justBelowDelta = decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 2,
      previousStrengths: evaluate(roundTwo).strengths,
      currentStrengths: evaluate(roundThreeMoved).strengths,
      measuredEdgeCount: countMeasuredEdges(roundThreeMoved),
      delta: 0.0468749
    });
    expect(justBelowDelta.kind).toBe("CONTINUE");
    expect(justBelowDelta.movedRootNodeIds).toEqual(["root:A"]);
  });

  it("stops on the ceiling even while a root is still moving", () => {
    const decision = decideRoundContinuation({
      completedRounds: 5,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 2,
      previousStrengths: evaluate(roundTwo).strengths,
      currentStrengths: evaluate(roundThreeMoved).strengths,
      measuredEdgeCount: countMeasuredEdges(roundThreeMoved),
      delta: 0.01
    });

    expect(decision.kind).toBe("STOP");
    expect(decision.reason).toBe("DEPTH_CEILING");
  });

  it("refuses to compare a root that one of the two rounds never scored", () => {
    expect(() => decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: ["root:A", "root:missing"],
      expectedRootCount: 2,
      previousStrengths: evaluate(roundTwo).strengths,
      currentStrengths: evaluate(roundThreeConverged).strengths,
      measuredEdgeCount: countMeasuredEdges(roundThreeConverged),
      delta: 0.01
    })).toThrowError(expect.objectContaining({ code: "STOPPING_ROOT_STRENGTH_UNRESOLVED" }));
  });
});

describe("T7 DoD (c) — the round-1 floor", () => {
  it("continues before round 1 completes even though the roots have moved exactly 0", () => {
    const decision = decideRoundContinuation({
      completedRounds: 0,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 2,
      // The identical graph on both sides: movement is exactly 0, which is well
      // inside delta. Only the floor keeps the debate alive.
      previousStrengths: evaluate(roundTwo).strengths,
      currentStrengths: evaluate(roundTwo).strengths,
      measuredEdgeCount: countMeasuredEdges(roundTwo),
      delta: 0.01
    });

    expect(decision).toEqual({
      kind: "CONTINUE",
      reason: "ROUND_1_FLOOR",
      maxRootMovement: 0,
      movedRootNodeIds: [],
      measuredEdgeCount: 1,
      comparedRootNodeIds: ["root:A", "root:B"],
      uncomparedRootNodeIds: [],
      expectedRootCount: 2
    });
  });

  it("walks the LAWFUL three-state live sequence on that same exact-zero movement", () => {
    // Codex N1: the live caller necessarily holds `previousRoundStrengths ===
    // null` at the round-1 boundary, so a `completedRounds: 1` STOP fed a
    // non-null previous round is not a state this engine can be in. The three
    // states below are the ones it CAN be in, in order, on identical graphs
    // whose movement is exactly 0 — the arithmetic is unchanged, only the
    // construction is now reachable.
    const at = (completedRounds: number, previous: boolean) => decideRoundContinuation({
      completedRounds,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 2,
      previousStrengths: previous ? evaluate(roundTwo).strengths : null,
      currentStrengths: evaluate(roundTwo).strengths,
      measuredEdgeCount: countMeasuredEdges(roundTwo),
      delta: 0.01
    });

    // Round 0 — the floor, and it does not consult movement at all. NOTHING was
    // compared here, and the record says so: a decision that never looked at a
    // root may not list it as compared (J15 ADDENDUM-2 — records must be TRUE).
    expect(at(0, false)).toEqual({
      kind: "CONTINUE",
      reason: "ROUND_1_FLOOR",
      maxRootMovement: null,
      movedRootNodeIds: [],
      measuredEdgeCount: 1,
      comparedRootNodeIds: [],
      uncomparedRootNodeIds: ["root:A", "root:B"],
      expectedRootCount: 2
    });
    // Round 1 — J15(c): the pre-expansion graph is a baseline, not a round.
    expect(at(1, false)).toEqual({
      kind: "CONTINUE",
      reason: "NO_PREVIOUS_ROUND",
      maxRootMovement: null,
      movedRootNodeIds: [],
      measuredEdgeCount: 1,
      comparedRootNodeIds: [],
      uncomparedRootNodeIds: ["root:A", "root:B"],
      expectedRootCount: 2
    });
    // Round 2 — the first round with a real predecessor. NOW zero movement over
    // measured evidence is convergence, and the debate stops.
    expect(at(2, true)).toEqual({
      kind: "STOP",
      reason: "GLOBAL_DELTA_CONVERGED",
      maxRootMovement: 0,
      movedRootNodeIds: [],
      measuredEdgeCount: 1,
      comparedRootNodeIds: ["root:A", "root:B"],
      uncomparedRootNodeIds: [],
      expectedRootCount: 2
    });
  });

  it("continues with no previous round at all, and refuses a missing previous from round 2 on", () => {
    expect(decideRoundContinuation({
      completedRounds: 0,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 2,
      previousStrengths: null,
      currentStrengths: evaluate(roundTwo).strengths,
      measuredEdgeCount: countMeasuredEdges(roundTwo),
      delta: 0.01
    })).toEqual({
      kind: "CONTINUE",
      reason: "ROUND_1_FLOOR",
      maxRootMovement: null,
      movedRootNodeIds: [],
      measuredEdgeCount: 1,
      comparedRootNodeIds: [],
      uncomparedRootNodeIds: ["root:A", "root:B"],
      expectedRootCount: 2
    });

    // Ruling J15(c): the pre-expansion graph is a BASELINE, not a round, so
    // after round 1 there is no previous ROUND and the δ stop cannot fire yet.
    expect(decideRoundContinuation({
      completedRounds: 1,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 2,
      previousStrengths: null,
      currentStrengths: evaluate(roundTwo).strengths,
      measuredEdgeCount: countMeasuredEdges(roundTwo),
      delta: 0.01
    })).toEqual({
      kind: "CONTINUE",
      reason: "NO_PREVIOUS_ROUND",
      maxRootMovement: null,
      movedRootNodeIds: [],
      measuredEdgeCount: 1,
      comparedRootNodeIds: [],
      uncomparedRootNodeIds: ["root:A", "root:B"],
      expectedRootCount: 2
    });

    // From round 2 on a previous round exists; its absence is a caller defect.
    expect(() => decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 2,
      previousStrengths: null,
      currentStrengths: evaluate(roundTwo).strengths,
      measuredEdgeCount: countMeasuredEdges(roundTwo),
      delta: 0.01
    })).toThrowError(expect.objectContaining({ code: "STOPPING_PREVIOUS_ROUND_MISSING" }));
  });

  it("stops on the ceiling even at round 1, where movement cannot be consulted", () => {
    expect(decideRoundContinuation({
      completedRounds: 1,
      depthCeiling: 1,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 2,
      previousStrengths: null,
      currentStrengths: evaluate(roundTwo).strengths,
      measuredEdgeCount: countMeasuredEdges(roundTwo),
      delta: 0.01
    })).toEqual({
      kind: "STOP",
      reason: "DEPTH_CEILING",
      maxRootMovement: null,
      movedRootNodeIds: [],
      measuredEdgeCount: 1,
      comparedRootNodeIds: [],
      uncomparedRootNodeIds: ["root:A", "root:B"],
      expectedRootCount: 2
    });
  });
});

describe("T7 — BRANCH-FROZEN-LOW-LEVERAGE is minted in the ONE canonical vocabulary", () => {
  it("mints the mark mid-list so the positionally-read DR-176 tail survives", async () => {
    const [kernel, contract, runner] = await Promise.all([
      import("@debateai/kernel"),
      import("@debateai/contract"),
      import("@debateai/runner")
    ]);

    expect(kernel.CONDITION_MARKS).toContain(runner.BRANCH_FROZEN_LOW_LEVERAGE_MARK);
    expect(runner.BRANCH_FROZEN_LOW_LEVERAGE_MARK).toBe("BRANCH-FROZEN-LOW-LEVERAGE");
    expect(contract.ConditionMarkSchema.parse("BRANCH-FROZEN-LOW-LEVERAGE"))
      .toBe("BRANCH-FROZEN-LOW-LEVERAGE");
    expect(kernel.CONDITION_MARKS.slice(-4)).toEqual([
      "HIDDEN-UNJUDGEABLE", "DERIVED-STANDING-UNREVIEWED", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"
    ]);
  });

  it("builds a typed record naming the branch, its leverage, epsilon and epsilon's provenance", async () => {
    const runner = await import("@debateai/runner");

    const record = runner.buildBranchFrozenRecord({
      carryingNodeId: "light",
      leverage: 0,
      epsilon: 0.01,
      epsilonSourceRef: "register:v5:branchFreezeEpsilon",
      rootNodeIds: ["root:A"],
      frozenSubtreeNodeIds: ["light", "light:child"]
    });

    expect(record.mark).toBe("BRANCH-FROZEN-LOW-LEVERAGE");
    expect(record.scope).toBe("node");
    expect(record.subjectRef).toBe("light");
    expect(record.affectedNodeIds).toEqual(["light", "light:child"]);
    expect(record.reason).toContain("0");
    expect(record.reason).toContain("0.01");
    expect(record.reason).toContain("register:v5:branchFreezeEpsilon");
    expect(record.liftPath).not.toBeNull();
    expect(Object.isFrozen(record)).toBe(true);
  });
});

describe("T7 — the per-round propagation is PURE CODE: zero model calls in the ledger", () => {
  /** The round before the discriminator graph existed: root:A stood on tau alone. */
  const priorRound = evaluate(snapshot([node("root:A", 0.5)], [], [])).strengths;

  const stoppingControls = {
    registerVersion: 5,
    delta: 0.01,
    epsilon: 0.01,
    sourceRefs: {
      globalStopDelta: "register:v5:globalStopDelta",
      branchFreezeEpsilon: "register:v5:branchFreezeEpsilon"
    }
  };

  it("appends only PROPAGATION and never MODEL_CALL, and reaches no provider at all", async () => {
    const runner = await import("@debateai/runner");
    const appendLedger = vi.fn(async (_entry: { readonly actionKind: string }) => undefined);
    const provider = vi.fn(async () => {
      throw new Error("the stopping round must not reach a provider");
    });

    const outcome = await runner.runAdaptiveStoppingRound({
      runId: "run:t07",
      attemptId: "attempt:t07",
      completedRounds: 1,
      depthCeiling: 5,
      rootNodeIds: ROOTS,
      expectedRootCount: 1,
      branchCarryingNodeIds: ["heavy", "light"],
      // Both branches still have descendants to author, so a freeze on either
      // really would prevent one (J15 ADDENDUM-2).
      preventableCarryingNodeIds: ["heavy", "light"],
      previousStrengths: priorRound,
      snapshot: discriminator,
      controls: stoppingControls,
      propagationContractHash: "contract:propagation",
      propagationProducer: "producer:propagation"
    }, { appendLedger });

    // The spy is live: the step really does write to the ledger it was given.
    expect(appendLedger).toHaveBeenCalled();
    const kinds = appendLedger.mock.calls.map(([entry]) => entry.actionKind);
    expect(new Set(kinds)).toEqual(new Set(["PROPAGATION"]));
    expect(kinds.filter((kind) => kind === "MODEL_CALL")).toEqual([]);
    expect(provider).not.toHaveBeenCalled();

    // And it did the work: the frozen branch is named, with its typed record.
    expect(outcome.continuation.kind).toBe("CONTINUE");
    expect(outcome.freezes).toEqual([
      { carryingNodeId: "heavy", leverage: 0.125, verdict: "CONTINUES" },
      { carryingNodeId: "light", leverage: 0, verdict: "FROZEN" }
    ]);
    expect(outcome.frozenCarryingNodeIds).toEqual(["light"]);
    expect(outcome.conditionMarkRecords.map((record) => record.mark))
      .toEqual(["BRANCH-FROZEN-LOW-LEVERAGE"]);
    expect(outcome.propagation.strengths.find((row) => row.nodeId === "root:A")!.strength).toBe(0.625);
  });

  it("is deterministic across repeats, so a stopping decision is never a coin flip", async () => {
    const runner = await import("@debateai/runner");
    const run = async () => runner.runAdaptiveStoppingRound({
      runId: "run:t07",
      attemptId: "attempt:t07",
      completedRounds: 1,
      depthCeiling: 5,
      rootNodeIds: ROOTS,
      expectedRootCount: 1,
      branchCarryingNodeIds: ["heavy", "light"],
      // Both branches still have descendants to author, so a freeze on either
      // really would prevent one (J15 ADDENDUM-2).
      preventableCarryingNodeIds: ["heavy", "light"],
      previousStrengths: priorRound,
      snapshot: discriminator,
      controls: stoppingControls,
      propagationContractHash: "contract:propagation",
      propagationProducer: "producer:propagation"
    }, { appendLedger: async () => undefined });

    const [first, second, third] = await Promise.all([run(), run(), run()]);
    expect(second.freezes).toEqual(first.freezes);
    expect(third.freezes).toEqual(first.freezes);
    expect(second.continuation).toEqual(first.continuation);
    expect(third.continuation).toEqual(first.continuation);
  });
});

describe("T7 / J15(a) — the GLOBAL round boundary, derived from a ROOT-MAJOR plan", () => {
  /**
   * `buildMultiMakerExpansionPlan` emits legs rootIndex-OUTER, round-INNER. For
   * M=2, depth 2 the round sequence is 1,1,2,2,2,2 | 1,1,2,2,2,2 — it RESETS at
   * every root. Ruling J15(a): round k is complete when EVERY root's round-k
   * legs have completed, and the stop/freeze evaluation runs exactly there.
   */
  const plan = async () => (await import("@debateai/runner"))
    .buildMultiMakerExpansionPlan(2, 2);

  it("derives round completion at the LAST leg of each round across all roots", async () => {
    const runner = await import("@debateai/runner");
    const legs = await plan();

    expect(legs).toHaveLength(12);
    expect(legs.map((leg) => leg.round)).toEqual([1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2]);

    // leg 7 is root 1's second round-1 leg; leg 11 is the plan's last leg.
    expect(runner.deriveGlobalRoundCompletions(legs)).toEqual(new Map([[7, 1], [11, 2]]));
  });

  it("REFUTES the naive hook: a leg.round CHANGE is not a round completion", async () => {
    const runner = await import("@debateai/runner");
    const legs = await plan();

    // The hook this lane first shipped fired wherever leg.round changed.
    const naive = legs.flatMap((leg, index) =>
      index > 0 && leg.round !== legs[index - 1]!.round ? [index] : []);
    expect(naive).toEqual([2, 6, 8]);

    // Index 6 is the killer: the naive rule reports "round 2 completed" at the
    // transition from root 0's round 2 to root 1's round 1 — while root 1 has
    // authored NOTHING. Acting on it cut root 1 off entirely.
    expect(legs[5]!.round).toBe(2);
    expect(legs[6]!).toMatchObject({ rootIndex: 1, round: 1 });

    const derived = runner.deriveGlobalRoundCompletions(legs);
    expect(derived.has(2)).toBe(false);
    expect(derived.has(6)).toBe(false);
    expect(derived.has(8)).toBe(false);
  });

  it("guarantees every root finished round k at the boundary it derives for k", async () => {
    const runner = await import("@debateai/runner");
    for (const [makers, depth] of [[2, 2], [2, 3], [3, 2], [4, 5]] as const) {
      const legs = runner.buildMultiMakerExpansionPlan(depth, makers);
      const derived = runner.deriveGlobalRoundCompletions(legs);

      expect([...derived.values()]).toEqual(
        Array.from({ length: depth }, (_, index) => index + 1)
      );
      for (const [boundaryIndex, round] of derived) {
        const unfinished = legs.flatMap((leg, index) =>
          leg.round === round && index > boundaryIndex ? [index] : []);
        expect(unfinished).toEqual([]);
        const rootsAtRound = new Set(legs
          .filter((leg, index) => leg.round === round && index <= boundaryIndex)
          .map((leg) => leg.rootIndex));
        expect(rootsAtRound.size).toBe(makers);
      }
    }
  });
});

describe("T7 / J15(b) — a δ stop must be NON-VACUOUS", () => {
  /** Every edge UNKNOWN: nothing beneath a root carries a magnitude. */
  const allUnknown = snapshot(
    [node("root:A", 0.5), node("b1", 0.5), node("b2", 0.5)],
    [
      support("e:b1->A", "b1", "root:A", null, "UNKNOWN"),
      { ...support("e:b2->A", "b2", "root:A", null, "UNKNOWN"), polarity: "attack", kind: "rebutting" }
    ],
    [resolution("root:A")]
  );

  it("counts the measured edges it considered, and carries that count on the record", () => {
    expect(countMeasuredEdges(allUnknown)).toBe(0);
    expect(countMeasuredEdges(roundTwo)).toBe(1);
    expect(countMeasuredEdges(discriminator)).toBe(2);

    // An edge STAMPED measured but carrying no magnitude is not evidence:
    // `computeGraph` skips it exactly as it skips an UNKNOWN one, so counting it
    // would let a graph that moved nothing claim it had something to weigh.
    const measuredButEmpty = snapshot(
      [node("root:A", 0.5), node("b1", 0.5)],
      [support("e:b1->A", "b1", "root:A", null, "MEASURED")],
      [resolution("root:A")]
    );
    expect(countMeasuredEdges(measuredButEmpty)).toBe(0);
    expect(evaluate(measuredButEmpty).strengths.find((row) => row.nodeId === "root:A")!.strength)
      .toBe(0.5);

    const values = new Map(evaluate(allUnknown).strengths.map((row) => [row.nodeId, row.strength]));
    // Nothing moves anything: every node sits at its own tau.
    expect(values.get("root:A")).toBe(0.5);
    expect(values.get("b1")).toBe(0.5);
    expect(values.get("b2")).toBe(0.5);
  });

  it("REFUSES the stop when zero measured edges were considered, however still the roots are", () => {
    const decision = decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: ["root:A"],
      expectedRootCount: 1,
      // Movement is exactly 0 — under the literal rule this would converge.
      previousStrengths: evaluate(allUnknown).strengths,
      currentStrengths: evaluate(allUnknown).strengths,
      measuredEdgeCount: countMeasuredEdges(allUnknown),
      delta: 0.01
    });

    expect(decision).toEqual({
      kind: "CONTINUE",
      reason: "NO_MEASURED_EDGE",
      maxRootMovement: 0,
      movedRootNodeIds: [],
      measuredEdgeCount: 0,
      comparedRootNodeIds: ["root:A"],
      uncomparedRootNodeIds: [],
      expectedRootCount: 1
    });

    // One measured edge is enough to make the same zero movement a real stop.
    expect(decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: ["root:A"],
      expectedRootCount: 1,
      previousStrengths: evaluate(allUnknown).strengths,
      currentStrengths: evaluate(allUnknown).strengths,
      measuredEdgeCount: 1,
      delta: 0.01
    }).reason).toBe("GLOBAL_DELTA_CONVERGED");
  });

  it("ends an all-UNKNOWN debate by MARKED FREEZE exhaustion, never by fake convergence", () => {
    const decisions = decideBranchFreezes({
      completedRounds: 1,
      sensitivityRecords: evaluate(allUnknown).sensitivityRecords,
      branchCarryingNodeIds: ["b1", "b2"],
      rootNodeIds: ["root:A"],
      epsilon: 0.01
    });

    // Zero leverage everywhere, so EVERY branch freezes — and each freeze is a
    // disclosed mark, not a silent stop. That is the honest end of a debate
    // where nothing was ever measured.
    expect(decisions).toEqual([
      { carryingNodeId: "b1", leverage: 0, verdict: "FROZEN" },
      { carryingNodeId: "b2", leverage: 0, verdict: "FROZEN" }
    ]);
  });

  it("reaches expansion exhaustion through the runner's own boundary, with a mark per frozen branch", async () => {
    const runner = await import("@debateai/runner");

    const outcome = await runner.runAdaptiveStoppingRound({
      runId: "run:t07-unknown",
      attemptId: "attempt:t07-unknown",
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: ["root:A"],
      expectedRootCount: 1,
      branchCarryingNodeIds: ["b1", "b2"],
      preventableCarryingNodeIds: ["b1", "b2"],
      previousStrengths: evaluate(allUnknown).strengths,
      snapshot: allUnknown,
      controls: {
        registerVersion: 5,
        delta: 0.01,
        epsilon: 0.01,
        sourceRefs: {
          globalStopDelta: "register:v5:globalStopDelta",
          branchFreezeEpsilon: "register:v5:branchFreezeEpsilon"
        }
      },
      propagationContractHash: "contract:propagation",
      propagationProducer: "producer:propagation"
    }, { appendLedger: async () => undefined });

    expect(outcome.continuation.kind).toBe("CONTINUE");
    expect(outcome.continuation.reason).toBe("NO_MEASURED_EDGE");
    expect(outcome.continuation.measuredEdgeCount).toBe(0);
    expect(outcome.frozenCarryingNodeIds).toEqual(["b1", "b2"]);
    expect(outcome.conditionMarkRecords.map((record) => record.mark))
      .toEqual(["BRANCH-FROZEN-LOW-LEVERAGE", "BRANCH-FROZEN-LOW-LEVERAGE"]);
  });
});

describe("T7 / J15(d) — the stopping consumer is LIVE in the expansion loop", () => {
  it("calls the derived boundary from the runner's own round loop", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("../../apps/runner/src/index.ts", import.meta.url),
      "utf8"
    );

    // F-T7-4 self-closes only if the loop really reaches the rule.
    expect(source).toMatch(/deriveGlobalRoundCompletions\(expansionPlan\)/);
    expect(source).toMatch(/await runAdaptiveStoppingRound\(/);
    expect(source).toMatch(/globalRoundCompletions\.get\(legIndex\)/);
  });

  /**
   * codex B1, the seam itself. This assertion is STRUCTURAL and says so: the
   * live boundary lives in a closure inside `executeWorkItem`, reachable only
   * from the embedded-postgres harness, and there every maker root carries
   * standing — so no behavioural fixture in this repo can tell a narrowed scope
   * from a whole one. What CAN be pinned is that the call site hands the scope
   * object's own two fields down untouched. Narrowing either of them is what
   * codex B1 was, and it is caught here; the `expectedRootCount` gate then makes
   * the narrowing harmless even if this pin is ever deleted.
   */
  it("hands the authoritative scope down UNNARROWED — neither field is filtered at the seam", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("../../apps/runner/src/index.ts", import.meta.url),
      "utf8"
    );

    const callIndex = source.indexOf("const boundary = await runAdaptiveStoppingRound({");
    expect(callIndex).toBeGreaterThan(-1);
    const call = source.slice(callIndex, source.indexOf("}, {", callIndex));

    expect(call).toContain("rootNodeIds: rootScope.rootNodeIds,");
    expect(call).toContain("expectedRootCount: rootScope.expectedRootCount,");
    // ...and the scope is built by the function that is blind to standing.
    expect(source).toMatch(/const rootScope = selectAuthoritativeRootScope\(\{/);
  });
});


describe("T7 / codex B1 — the live seam may never pre-filter a root out of the decision", () => {
  /**
   * Partial standing, M=2: `root:B` was authored but its cross-maker review
   * exhausted, so it carries no judged standing and never reaches the strength
   * record. `root:A` is stable AND measured — exactly the shape that made r2's
   * caller report convergence on a debate where one root was never compared.
   */
  const partialStanding = snapshot(
    [node("root:A", 0.5), node("root:B", null), node("heavy", 0.5)],
    [support("e:heavy->A", "heavy", "root:A", 0.5)],
    [resolution("root:A")]
  );

  const AUTHORITATIVE_ROOTS = ["root:A", "root:B"] as const;

  it("scores only the standing root, so the unscored one cannot be compared", () => {
    const outcome = evaluate(partialStanding);
    const scored = new Map(outcome.strengths.map((row) => [row.nodeId, row.strength]));

    expect(scored.get("root:A")).toBe(0.625);
    expect(scored.has("root:B")).toBe(false);
    expect(outcome.unjudgedNodeIds).toEqual(["root:B"]);
    // The surviving root is stable and its evidence is real: this is not a
    // vacuity case, and J15(b) will not rescue it.
    expect(countMeasuredEdges(partialStanding)).toBe(1);
  });

  it("REFUSES delta convergence at the live seam when an expected root is uncompared", async () => {
    const runner = await import("@debateai/runner");

    const outcome = await runner.runAdaptiveStoppingRound({
      runId: "run:t07-partial",
      attemptId: "attempt:t07-partial",
      completedRounds: 2,
      depthCeiling: 5,
      // The AUTHORITATIVE maker-root scope — both roots, unfiltered.
      rootNodeIds: AUTHORITATIVE_ROOTS,
      expectedRootCount: 2,
      branchCarryingNodeIds: [],
      preventableCarryingNodeIds: [],
      previousStrengths: evaluate(partialStanding).strengths,
      snapshot: partialStanding,
      controls: {
        registerVersion: 5,
        delta: 0.01,
        epsilon: 0.01,
        sourceRefs: {
          globalStopDelta: "register:v5:globalStopDelta",
          branchFreezeEpsilon: "register:v5:branchFreezeEpsilon"
        }
      },
      propagationContractHash: "contract:propagation",
      propagationProducer: "producer:propagation"
    }, { appendLedger: async () => undefined });

    // r2 answered GLOBAL_DELTA_CONVERGED here, having dropped root:B first.
    expect(outcome.continuation.reason).not.toBe("GLOBAL_DELTA_CONVERGED");
    expect(outcome.continuation.kind).toBe("CONTINUE");
    expect(outcome.continuation.reason).toBe("ROOT_SCOPE_INCOMPLETE");
    expect(outcome.continuation.comparedRootNodeIds).toEqual(["root:A"]);
    expect(outcome.continuation.uncomparedRootNodeIds).toEqual(["root:B"]);
  });

  it("keeps the callee's loud guard reachable — the seam refuses, it does not narrow", () => {
    // The pure decision's contract is unchanged and still strict: a caller that
    // asserts a root is comparable when it is not is a DEFECT, and stops loudly.
    expect(() => decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: AUTHORITATIVE_ROOTS,
      expectedRootCount: 2,
      previousStrengths: evaluate(partialStanding).strengths,
      currentStrengths: evaluate(partialStanding).strengths,
      measuredEdgeCount: countMeasuredEdges(partialStanding),
      delta: 0.01
    })).toThrowError(expect.objectContaining({ code: "STOPPING_ROOT_STRENGTH_UNRESOLVED" }));
  });

  it("converges normally once every expected root is compared", async () => {
    const runner = await import("@debateai/runner");
    const bothStanding = snapshot(
      [node("root:A", 0.5), node("root:B", 0.5), node("heavy", 0.5)],
      [support("e:heavy->A", "heavy", "root:A", 0.5)],
      [resolution("root:A")]
    );

    const outcome = await runner.runAdaptiveStoppingRound({
      runId: "run:t07-both",
      attemptId: "attempt:t07-both",
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: AUTHORITATIVE_ROOTS,
      expectedRootCount: 2,
      branchCarryingNodeIds: [],
      preventableCarryingNodeIds: [],
      previousStrengths: evaluate(bothStanding).strengths,
      snapshot: bothStanding,
      controls: {
        registerVersion: 5,
        delta: 0.01,
        epsilon: 0.01,
        sourceRefs: {
          globalStopDelta: "register:v5:globalStopDelta",
          branchFreezeEpsilon: "register:v5:branchFreezeEpsilon"
        }
      },
      propagationContractHash: "contract:propagation",
      propagationProducer: "producer:propagation"
    }, { appendLedger: async () => undefined });

    expect(outcome.continuation.reason).toBe("GLOBAL_DELTA_CONVERGED");
    expect(outcome.continuation.comparedRootNodeIds).toEqual(["root:A", "root:B"]);
    expect(outcome.continuation.uncomparedRootNodeIds).toEqual([]);
  });
});

describe("T7 / codex B2 — a freeze mark must be TRUE (J15 ADDENDUM-2)", () => {
  it("names only the branches whose expansion the decision can still prevent", async () => {
    const runner = await import("@debateai/runner");
    const plan = runner.buildMultiMakerExpansionPlan(2, 2);
    const boundaryLegIndex = 7;

    // Codex's enumeration, reproduced against the shipped plan: at the round-1
    // boundary root 0's carrying nodes 2 and 3 already have every depth-2
    // descendant authored (legs 2-5), so freezing them prevents NOTHING. Only
    // root 1's carrying nodes 8 and 9 still have future legs (8-9, 10-11).
    expect(runner.selectPreventableBranches({
      plan,
      boundaryLegIndex,
      carryingChildIndices: [2, 3, 8, 9]
    })).toEqual([8, 9]);
  });

  it("emits a BRANCH-FROZEN record ONLY for a preventable branch", async () => {
    const runner = await import("@debateai/runner");
    const controls = {
      registerVersion: 5,
      delta: 0.01,
      epsilon: 0.01,
      sourceRefs: {
        globalStopDelta: "register:v5:globalStopDelta",
        branchFreezeEpsilon: "register:v5:branchFreezeEpsilon"
      }
    };
    const base = {
      runId: "run:t07-b2",
      attemptId: "attempt:t07-b2",
      completedRounds: 1,
      depthCeiling: 5,
      rootNodeIds: ROOTS,
      expectedRootCount: 1,
      // `light` has zero root-scoped leverage, so it freezes either way.
      branchCarryingNodeIds: ["heavy", "light"],
      previousStrengths: null,
      snapshot: discriminator,
      controls,
      propagationContractHash: "contract:propagation",
      propagationProducer: "producer:propagation"
    } as const;

    const preventable = await runner.runAdaptiveStoppingRound(
      { ...base, preventableCarryingNodeIds: ["light"] },
      { appendLedger: async () => undefined }
    );
    const alreadyExpanded = await runner.runAdaptiveStoppingRound(
      { ...base, preventableCarryingNodeIds: [] },
      { appendLedger: async () => undefined }
    );

    // The freeze DECISION is identical in both — leverage does not depend on timing.
    expect(preventable.freezes).toEqual(alreadyExpanded.freezes);
    expect(preventable.frozenCarryingNodeIds).toEqual(["light"]);
    expect(alreadyExpanded.frozenCarryingNodeIds).toEqual(["light"]);

    // The RECORD differs, because only one of them prevented anything.
    expect(preventable.conditionMarkRecords.map((record) => record.mark))
      .toEqual(["BRANCH-FROZEN-LOW-LEVERAGE"]);
    expect(preventable.conditionMarkRecords[0]!.subjectRef).toBe("light");
    // A freeze decided after the branch fully expanded prevented nothing, so it
    // publishes NO mark claiming it did. Nothing was skipped, so nothing is owed.
    expect(alreadyExpanded.conditionMarkRecords).toEqual([]);
  });

  it("keeps the record's affected nodes to what the freeze actually cut", async () => {
    const runner = await import("@debateai/runner");
    const record = runner.buildBranchFrozenRecord({
      carryingNodeId: "light",
      leverage: 0,
      epsilon: 0.01,
      epsilonSourceRef: "register:v5:branchFreezeEpsilon",
      rootNodeIds: ["root:A"],
      frozenSubtreeNodeIds: ["light"]
    });

    // The prevented descendants were never authored, so the carrying node is
    // the whole truthful extent of the cut — and the reason may say so.
    expect(record.affectedNodeIds).toEqual(["light"]);
    expect(record.reason).toContain("nothing was expanded beneath it");
  });
});


/**
 * r3 · codex B1, the SEAM half — the half r3's first pass left unpinned.
 *
 * Preserving the scope at the one caller that exists today is a fix to that
 * caller, not to the law. Mutant MB1a (restore `scoredNodeIds.has(root)` in the
 * expansion loop) left the whole unit suite green, because every B1 assertion
 * handed the scope in by hand. The law has to live where no caller can get
 * around it: the decision is told how many roots the RUN has, and δ-convergence
 * is refused unless it compared that many. A caller that narrows the scope now
 * contradicts a count it does not own, and the stop it wanted is unreachable.
 */
describe("T7 / codex B1 — a SHORT root scope is never δ-convergence, whoever shortened it", () => {
  const stableAndMeasured = snapshot(
    [node("root:A", 0.5), node("heavy", 0.5)],
    [support("e:heavy->A", "heavy", "root:A", 0.5)],
    [resolution("root:A")]
  );
  const controls = {
    registerVersion: 5,
    delta: 0.01,
    epsilon: 0.01,
    sourceRefs: {
      globalStopDelta: "register:v5:globalStopDelta",
      branchFreezeEpsilon: "register:v5:branchFreezeEpsilon"
    }
  } as const;

  it("refuses convergence when the scope carries fewer roots than the run authored", async () => {
    const runner = await import("@debateai/runner");

    // EXACTLY what a caller that pre-filtered an unscored root hands down: one
    // root id, stable, measured, comparable in both rounds — from a run whose
    // maker count is two. Everything the δ rule needs is present; the only
    // thing missing is the root nobody looked at, and that is enough.
    const outcome = await runner.runAdaptiveStoppingRound({
      runId: "run:t07-short-scope",
      attemptId: "attempt:t07-short-scope",
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: ["root:A"],
      expectedRootCount: 2,
      branchCarryingNodeIds: [],
      preventableCarryingNodeIds: [],
      previousStrengths: evaluate(stableAndMeasured).strengths,
      snapshot: stableAndMeasured,
      controls,
      propagationContractHash: "contract:propagation",
      propagationProducer: "producer:propagation"
    }, { appendLedger: async () => undefined });

    expect(outcome.continuation.reason).not.toBe("GLOBAL_DELTA_CONVERGED");
    expect(outcome.continuation.kind).toBe("CONTINUE");
    expect(outcome.continuation.reason).toBe("ROOT_SCOPE_INCOMPLETE");
    // The record names what it did compare, and refuses on the arithmetic of
    // the count — one compared against two expected.
    expect(outcome.continuation.comparedRootNodeIds).toEqual(["root:A"]);
    expect(outcome.continuation.expectedRootCount).toBe(2);
  });

  it("converges on the identical graph the moment the count matches what it compared", async () => {
    const runner = await import("@debateai/runner");

    const outcome = await runner.runAdaptiveStoppingRound({
      runId: "run:t07-whole-scope",
      attemptId: "attempt:t07-whole-scope",
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: ["root:A"],
      expectedRootCount: 1,
      branchCarryingNodeIds: [],
      preventableCarryingNodeIds: [],
      previousStrengths: evaluate(stableAndMeasured).strengths,
      snapshot: stableAndMeasured,
      controls,
      propagationContractHash: "contract:propagation",
      propagationProducer: "producer:propagation"
    }, { appendLedger: async () => undefined });

    // Same graph, same movement, same evidence: ONLY the expected count moved.
    expect(outcome.continuation.reason).toBe("GLOBAL_DELTA_CONVERGED");
    expect(outcome.continuation.expectedRootCount).toBe(1);
  });

  it("refuses at the pure decision too, so no wrapper is the load-bearing guard", () => {
    expect(decideRoundBoundary({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: ["root:A"],
      expectedRootCount: 2,
      previousStrengths: evaluate(stableAndMeasured).strengths,
      currentStrengths: evaluate(stableAndMeasured).strengths,
      measuredEdgeCount: countMeasuredEdges(stableAndMeasured),
      delta: 0.01
    }).reason).toBe("ROOT_SCOPE_INCOMPLETE");
  });

  it("still stops on the ceiling with a short scope — the ceiling never consults movement", () => {
    const decision = decideRoundBoundary({
      completedRounds: 5,
      depthCeiling: 5,
      rootNodeIds: ["root:A"],
      expectedRootCount: 2,
      previousStrengths: evaluate(stableAndMeasured).strengths,
      currentStrengths: evaluate(stableAndMeasured).strengths,
      measuredEdgeCount: countMeasuredEdges(stableAndMeasured),
      delta: 0.01
    });

    expect(decision.kind).toBe("STOP");
    expect(decision.reason).toBe("DEPTH_CEILING");
  });
});

describe("T7 / codex B1 — the authoritative root scope is built from the MAKER COUNT", () => {
  it("names every authored maker root in maker order, and counts the makers, not the survivors", async () => {
    const runner = await import("@debateai/runner");

    expect(runner.selectAuthoritativeRootScope({
      effectiveMakerCount: 3,
      authoredRootNodeIdByMakerIndex: new Map([[0, "root:A"], [1, "root:B"], [2, "root:C"]])
    })).toEqual({ expectedRootCount: 3, rootNodeIds: ["root:A", "root:B", "root:C"] });
  });

  it("refuses a scope that claims MORE roots than the run has makers", () => {
    // Mutant MN2 removed this guard and the whole suite stayed green: a
    // defensive line nothing exercises is product code nobody has read.
    expect(() => decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 1,
      previousStrengths: evaluate(roundTwo).strengths,
      currentStrengths: evaluate(roundTwo).strengths,
      measuredEdgeCount: countMeasuredEdges(roundTwo),
      delta: 0.01
    })).toThrowError(expect.objectContaining({ code: "STOPPING_ROOT_SCOPE_OVERFULL" }));

    expect(() => decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      expectedRootCount: 1.5,
      previousStrengths: evaluate(roundTwo).strengths,
      currentStrengths: evaluate(roundTwo).strengths,
      measuredEdgeCount: countMeasuredEdges(roundTwo),
      delta: 0.01
    })).toThrowError(expect.objectContaining({ code: "STOPPING_EXPECTED_ROOT_COUNT_INVALID" }));
  });

  it("refuses to build a scope for a run with no makers", async () => {
    const runner = await import("@debateai/runner");

    expect(() => runner.selectAuthoritativeRootScope({
      effectiveMakerCount: 0,
      authoredRootNodeIdByMakerIndex: new Map()
    })).toThrowError(expect.objectContaining({ code: "STOPPING_ROOT_SCOPE_MAKER_COUNT_INVALID" }));
  });

  it("keeps the expected count at the maker count when a maker root is absent", async () => {
    const runner = await import("@debateai/runner");

    // A root the run never authored cannot be compared and cannot be invented.
    // The COUNT still says three, so the shortfall is visible to the decision
    // instead of being silently absorbed into a smaller scope.
    expect(runner.selectAuthoritativeRootScope({
      effectiveMakerCount: 3,
      authoredRootNodeIdByMakerIndex: new Map([[0, "root:A"], [2, "root:C"]])
    })).toEqual({ expectedRootCount: 3, rootNodeIds: ["root:A", "root:C"] });
  });
});

/**
 * r3 · codex B2, the GENERAL half. The single (M=2, d=2) enumeration pins
 * codex's own example. The property behind it is what the record's honesty
 * rests on: a branch may publish a freeze mark only if the decision can still
 * prevent its expansion, and such a branch has authored NOTHING yet — which is
 * exactly why `affectedNodeIds` may be the carrying node alone.
 */
describe("T7 / codex B2 — the freeze record's truth holds over every plan shape", () => {
  // `buildMultiMakerExpansionPlan(depth, effectiveMakerCount)` — DEPTH FIRST
  // (apps/runner/src/index.ts:1183-1186). Written the other way round, every
  // shape below still builds a legal plan and silently asserts about a
  // different one; only the symmetric (2,2) case is safe from the confusion.
  const SHAPES: readonly (readonly [depth: number, makerCount: number])[] =
    [[2, 2], [3, 2], [2, 3], [4, 3]];

  /** An oracle subtree walk, computed here and never borrowed from the product. */
  const subtreeOf = (
    plan: readonly { readonly parentIndex: number; readonly childIndex: number }[],
    childIndex: number
  ): Set<number> => {
    const indices = new Set([childIndex]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const leg of plan) {
        if (indices.has(leg.parentIndex) && !indices.has(leg.childIndex)) {
          indices.add(leg.childIndex);
          grew = true;
        }
      }
    }
    return indices;
  };

  it("gives every markable branch an EMPTY authored subtree, so the cut is the carrying node alone", async () => {
    const runner = await import("@debateai/runner");
    let markableBranchesSeen = 0;

    for (const [depth, makerCount] of SHAPES) {
      const plan = runner.buildMultiMakerExpansionPlan(depth, makerCount);
      for (const [boundaryLegIndex, round] of runner.deriveGlobalRoundCompletions(plan)) {
        const carrying = plan.filter((leg) => leg.round === round).map((leg) => leg.childIndex);
        const preventable = runner.selectPreventableBranches({ plan, boundaryLegIndex, carryingChildIndices: carrying });
        for (const childIndex of preventable) {
          markableBranchesSeen += 1;
          const subtree = subtreeOf(plan, childIndex);
          const alreadyAuthored = plan
            .map((leg, index) => ({ leg, index }))
            .filter(({ leg, index }) => index <= boundaryLegIndex && subtree.has(leg.parentIndex))
            .map(({ index }) => index);
          // If this were ever non-empty the mark would omit real descendants —
          // codex B2's false record, in the general case.
          expect({ makerCount, depth, round, childIndex, alreadyAuthored })
            .toEqual({ makerCount, depth, round, childIndex, alreadyAuthored: [] });
        }
      }
    }

    expect(markableBranchesSeen).toBeGreaterThan(0);
  });

  it("finds NO markable branch at the final round's boundary, where a freeze prevents nothing", async () => {
    const runner = await import("@debateai/runner");

    for (const [depth, makerCount] of SHAPES) {
      const plan = runner.buildMultiMakerExpansionPlan(depth, makerCount);
      const boundaries = [...runner.deriveGlobalRoundCompletions(plan)];
      const [lastBoundaryLegIndex, lastRound] = boundaries[boundaries.length - 1]!;

      expect(lastRound).toBe(depth);
      expect(runner.selectPreventableBranches({
        plan,
        boundaryLegIndex: lastBoundaryLegIndex,
        carryingChildIndices: plan.filter((leg) => leg.round === lastRound).map((leg) => leg.childIndex)
      })).toEqual([]);
    }
  });

  it("marks the LAST maker's branches and no earlier maker's, at every mid-plan boundary", async () => {
    const runner = await import("@debateai/runner");

    for (const [depth, makerCount] of SHAPES) {
      if (depth < 2) continue;
      const plan = runner.buildMultiMakerExpansionPlan(depth, makerCount);
      for (const [boundaryLegIndex, round] of runner.deriveGlobalRoundCompletions(plan)) {
        if (round === depth) continue;
        const carrying = plan.filter((leg) => leg.round === round);
        const preventable = new Set(runner.selectPreventableBranches({
          plan,
          boundaryLegIndex,
          carryingChildIndices: carrying.map((leg) => leg.childIndex)
        }));
        // The late boundary J15 ADDENDUM accepted, stated as a property: only
        // the last maker still has legs left when round k completes.
        expect([...preventable].sort((a, b) => a - b)).toEqual(
          carrying.filter((leg) => leg.rootIndex === makerCount - 1)
            .map((leg) => leg.childIndex).sort((a, b) => a - b)
        );
      }
    }
  });
});

/**
 * r4 · codex r2 B1 — the authoritative count must be REQUIRED at the law's own
 * API, not merely supplied by today's only caller.
 *
 * r3 made `expectedRootCount` optional on the exported strict decision with a
 * fallback to `rootNodeIds.length`. A direct caller that narrowed the roots and
 * omitted the count therefore got its own narrowed scope back as the standard to
 * measure against — `compared.length === expectedRootCount` — and bought
 * GLOBAL_DELTA_CONVERGED with the other maker root never compared. That is r1's
 * B1, resurrected at the public pure API.
 */
describe("T7 / codex r2 B1 — the expected root count is REQUIRED, with no fallback", () => {
  const stable = snapshot(
    [node("root:A", 0.5), node("root:B", null), node("heavy", 0.5)],
    [support("e:heavy->A", "heavy", "root:A", 0.5)],
    [resolution("root:A")]
  );
  const strictInput = {
    completedRounds: 2,
    depthCeiling: 5,
    rootNodeIds: ["root:A"],
    previousStrengths: evaluate(stable).strengths,
    currentStrengths: evaluate(stable).strengths,
    measuredEdgeCount: countMeasuredEdges(stable),
    delta: 0.01
  };

  it("REJECTS the omission at compile time, and refuses loudly if it is forced past the compiler", () => {
    // COMPILE-TIME NEGATIVE FIXTURE. If `expectedRootCount` ever becomes
    // optional again, this directive reports "unused" (TS2578) and `tsc` fails —
    // which is the only mechanical way to keep codex r2 B1 closed.
    // @ts-expect-error expectedRootCount is REQUIRED on the strict decision
    expect(() => decideRoundContinuation(strictInput)).toThrowError(
      expect.objectContaining({ code: "STOPPING_EXPECTED_ROOT_COUNT_INVALID" })
    );
  });

  it("refuses the shortened scope when the count IS stated — the run has two roots", () => {
    const decision = decideRoundContinuation({ ...strictInput, expectedRootCount: 2 });

    expect(decision.reason).toBe("ROOT_SCOPE_INCOMPLETE");
    expect(decision.kind).toBe("CONTINUE");
    expect(decision.comparedRootNodeIds).toEqual(["root:A"]);
    expect(decision.expectedRootCount).toBe(2);
  });

  it("converges on that identical graph only when the count matches the scope", () => {
    const decision = decideRoundContinuation({ ...strictInput, expectedRootCount: 1 });

    expect(decision.reason).toBe("GLOBAL_DELTA_CONVERGED");
    expect(decision.maxRootMovement).toBe(0);
  });
});

/**
 * r4 · codex r2 B2 — the partial-scope boundary erases no fact and skips no guard.
 *
 * r3's `decideRoundBoundary` partitioned BEFORE validating and then returned
 * literal records with `maxRootMovement: null` and `movedRootNodeIds: []` for
 * every partial scope — even when a comparable root had moved, and even when the
 * input was invalid. Two falsehoods in one arm: the interface says
 * `maxRootMovement` is null ONLY when there is no previous round, and
 * `comparedRootNodeIds` names roots the decision actually compared, while the
 * partial arm only checked map membership and never subtracted anything.
 */
describe("T7 / codex r2 B2 — a partial scope still computes, and still validates", () => {
  /** root:A at exactly 1/2 — one MEASURED edge carrying magnitude 0. */
  const before = snapshot(
    [node("root:A", 0.5), node("root:B", null), node("heavy", 0.5)],
    [support("e:heavy->A", "heavy", "root:A", 0)],
    [resolution("root:A")]
  );
  /** the same graph with the edge at full magnitude: root:A = 1/2 + (1/2)(1/2) = 3/4. */
  const after = snapshot(
    [node("root:A", 0.5), node("root:B", null), node("heavy", 0.5)],
    [support("e:heavy->A", "heavy", "root:A", 1)],
    [resolution("root:A")]
  );
  const boundaryInput = {
    completedRounds: 2,
    depthCeiling: 5,
    rootNodeIds: ["root:A", "root:B"],
    expectedRootCount: 2,
    previousStrengths: evaluate(before).strengths,
    currentStrengths: evaluate(after).strengths,
    measuredEdgeCount: countMeasuredEdges(after),
    delta: 0.01
  };

  it("scores codex's exact counterexample: A moves 1/2 -> 3/4 while B is uncomparable", () => {
    const scored = (s: EvaluationSnapshot) =>
      new Map(evaluate(s).strengths.map((row) => [row.nodeId, row.strength]));

    expect(scored(before).get("root:A")).toBe(0.5);
    expect(scored(after).get("root:A")).toBe(0.75);
    expect(scored(before).has("root:B")).toBe(false);
    expect(scored(after).has("root:B")).toBe(false);
    expect(countMeasuredEdges(after)).toBe(1);
  });

  it("records the exact movement of the comparable root instead of erasing it", () => {
    const decision = decideRoundBoundary(boundaryInput);

    // The dominant reason stays the coverage shortfall — that is the durable
    // fact that forbids convergence — but NO fact is erased.
    expect(decision.kind).toBe("CONTINUE");
    expect(decision.reason).toBe("ROOT_SCOPE_INCOMPLETE");
    expect(decision.maxRootMovement).toBe(0.25);        // |3/4 - 1/2| = 1/4, exactly
    expect(decision.movedRootNodeIds).toEqual(["root:A"]);
    expect(decision.comparedRootNodeIds).toEqual(["root:A"]);
    expect(decision.uncomparedRootNodeIds).toEqual(["root:B"]);
    expect(decision.expectedRootCount).toBe(2);
  });

  it("keeps maxRootMovement null ONLY when there is no previous round, as the interface says", () => {
    const decision = decideRoundBoundary({ ...boundaryInput, previousStrengths: null, completedRounds: 0 });

    expect(decision.maxRootMovement).toBeNull();
    expect(decision.reason).toBe("ROUND_1_FLOOR");
  });

  it("records the movement on the CEILING arm of a partial scope too", () => {
    const decision = decideRoundBoundary({ ...boundaryInput, completedRounds: 5, depthCeiling: 5 });

    expect(decision.kind).toBe("STOP");
    expect(decision.reason).toBe("DEPTH_CEILING");
    expect(decision.maxRootMovement).toBe(0.25);
    expect(decision.movedRootNodeIds).toEqual(["root:A"]);
  });

  it("never converges below full coverage, however small the movement", () => {
    const decision = decideRoundBoundary({
      ...boundaryInput,
      currentStrengths: evaluate(before).strengths,   // movement exactly 0
      measuredEdgeCount: countMeasuredEdges(before)
    });

    expect(decision.kind).toBe("CONTINUE");
    expect(decision.reason).toBe("ROOT_SCOPE_INCOMPLETE");
    expect(decision.maxRootMovement).toBe(0);
    expect(decision.movedRootNodeIds).toEqual([]);
  });

  it("holds the interface contract: maxRootMovement is null EXACTLY when nothing was compared", () => {
    // The doc used to say "null only when no previous round exists", which the
    // partial arm broke. The truthful contract is about `comparedRootNodeIds`,
    // and it is checkable on every arm this function can return.
    const arms = [
      decideRoundBoundary(boundaryInput),                                                   // partial, moved
      decideRoundBoundary({ ...boundaryInput, completedRounds: 0 }),                        // floor
      decideRoundBoundary({ ...boundaryInput, completedRounds: 5, depthCeiling: 5 }),       // ceiling
      decideRoundBoundary({ ...boundaryInput, measuredEdgeCount: 0 }),                      // no evidence
      decideRoundBoundary({ ...boundaryInput, previousStrengths: null, completedRounds: 1 }), // no previous round
      decideRoundBoundary({                                                                 // nothing comparable at all
        ...boundaryInput,
        previousStrengths: evaluate(before).strengths.filter((row) => row.nodeId !== "root:A"),
        currentStrengths: evaluate(after).strengths.filter((row) => row.nodeId !== "root:A")
      }),
      decideRoundContinuation({                                                             // full scope, converged
        completedRounds: 2,
        depthCeiling: 5,
        rootNodeIds: ["root:A"],
        expectedRootCount: 1,
        previousStrengths: evaluate(before).strengths,
        currentStrengths: evaluate(before).strengths,
        measuredEdgeCount: countMeasuredEdges(before),
        delta: 0.01
      })
    ];

    expect(arms.map((decision) => decision.maxRootMovement === null))
      .toEqual(arms.map((decision) => decision.comparedRootNodeIds.length === 0));
    // ...and the arms really do cover both sides of the biconditional.
    expect(new Set(arms.map((decision) => decision.maxRootMovement === null))).toEqual(new Set([true, false]));
  });

  it("runs the OVERFULL guard through the OUTER path, not only the strict helper", () => {
    expect(() => decideRoundBoundary({ ...boundaryInput, expectedRootCount: 1 }))
      .toThrowError(expect.objectContaining({ code: "STOPPING_ROOT_SCOPE_OVERFULL" }));
  });

  it("runs every input guard through the OUTER path while a root is uncomparable", () => {
    expect(() => decideRoundBoundary({ ...boundaryInput, delta: 1.5 }))
      .toThrowError();
    expect(() => decideRoundBoundary({ ...boundaryInput, measuredEdgeCount: -1 }))
      .toThrowError(expect.objectContaining({ code: "STOPPING_MEASURED_EDGE_COUNT_INVALID" }));
    expect(() => decideRoundBoundary({ ...boundaryInput, completedRounds: -1 }))
      .toThrowError(expect.objectContaining({ code: "STOPPING_ROUND_COUNT_INVALID" }));
    expect(() => decideRoundBoundary({ ...boundaryInput, depthCeiling: 0 }))
      .toThrowError(expect.objectContaining({ code: "STOPPING_DEPTH_CEILING_INVALID" }));
    expect(() => decideRoundBoundary({ ...boundaryInput, expectedRootCount: 2.5 }))
      .toThrowError(expect.objectContaining({ code: "STOPPING_EXPECTED_ROOT_COUNT_INVALID" }));
    expect(() => decideRoundBoundary({ ...boundaryInput, rootNodeIds: [], expectedRootCount: 0 }))
      .toThrowError(expect.objectContaining({ code: "STOPPING_ROOT_SCOPE_EMPTY" }));
  });
});
