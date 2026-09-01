import { describe, expect, it, vi } from "vitest";
import {
  countMeasuredEdges,
  decideBranchFreezes,
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

  it("freezes the same branch the moment epsilon rises one representable step above it", () => {
    const decisions = decideBranchFreezes({
      completedRounds: 1,
      sensitivityRecords: evaluate(discriminator).sensitivityRecords,
      branchCarryingNodeIds: ["heavy"],
      rootNodeIds: ROOTS,
      epsilon: 0.126
    });

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
      measuredEdgeCount: 2
    });
  });

  it("keeps going at the same round when one root moved more than delta", () => {
    const decision = decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
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
      measuredEdgeCount: 2
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
      measuredEdgeCount: 2
    });

    const justBelowDelta = decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
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
      measuredEdgeCount: 1
    });
  });

  it("stops on that very same zero movement once round 1 has completed", () => {
    const decision = decideRoundContinuation({
      completedRounds: 1,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      previousStrengths: evaluate(roundTwo).strengths,
      currentStrengths: evaluate(roundTwo).strengths,
      measuredEdgeCount: countMeasuredEdges(roundTwo),
      delta: 0.01
    });

    expect(decision).toEqual({
      kind: "STOP",
      reason: "GLOBAL_DELTA_CONVERGED",
      maxRootMovement: 0,
      movedRootNodeIds: [],
      measuredEdgeCount: 1
    });
  });

  it("continues with no previous round at all, and refuses a missing previous from round 2 on", () => {
    expect(decideRoundContinuation({
      completedRounds: 0,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      previousStrengths: null,
      currentStrengths: evaluate(roundTwo).strengths,
      measuredEdgeCount: countMeasuredEdges(roundTwo),
      delta: 0.01
    })).toEqual({
      kind: "CONTINUE",
      reason: "ROUND_1_FLOOR",
      maxRootMovement: null,
      movedRootNodeIds: [],
      measuredEdgeCount: 1
    });

    // Ruling J15(c): the pre-expansion graph is a BASELINE, not a round, so
    // after round 1 there is no previous ROUND and the δ stop cannot fire yet.
    expect(decideRoundContinuation({
      completedRounds: 1,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
      previousStrengths: null,
      currentStrengths: evaluate(roundTwo).strengths,
      measuredEdgeCount: countMeasuredEdges(roundTwo),
      delta: 0.01
    })).toEqual({
      kind: "CONTINUE",
      reason: "NO_PREVIOUS_ROUND",
      maxRootMovement: null,
      movedRootNodeIds: [],
      measuredEdgeCount: 1
    });

    // From round 2 on a previous round exists; its absence is a caller defect.
    expect(() => decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: TWO_ROOTS,
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
      previousStrengths: null,
      currentStrengths: evaluate(roundTwo).strengths,
      measuredEdgeCount: countMeasuredEdges(roundTwo),
      delta: 0.01
    })).toEqual({
      kind: "STOP",
      reason: "DEPTH_CEILING",
      maxRootMovement: null,
      movedRootNodeIds: [],
      measuredEdgeCount: 1
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
      branchCarryingNodeIds: ["heavy", "light"],
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
      branchCarryingNodeIds: ["heavy", "light"],
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
      measuredEdgeCount: 0
    });

    // One measured edge is enough to make the same zero movement a real stop.
    expect(decideRoundContinuation({
      completedRounds: 2,
      depthCeiling: 5,
      rootNodeIds: ["root:A"],
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
      branchCarryingNodeIds: ["b1", "b2"],
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
});
