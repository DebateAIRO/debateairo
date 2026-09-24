import { describe, expect, it } from "vitest";
import type { EvaluationSnapshot } from "@debateai/propagation";
import {
  assertRequiredConditionMarkRecords,
  buildFactBundle,
  createEnvelopeExhaustedResult,
  SERVE_CRASH_CLASSES,
  type CompositionBudgetResolution,
  type ConditionMarkRecord
} from "@debateai/serve";
import {
  ENVELOPE_STOP_REASONS,
  decideMakerPositionServe,
  projectJudgedStanding
} from "../../apps/runner/src/index.js";

/**
 * ROUND 4 (V-28, rulings R-A / R-B) — THE PATH ITSELF, DRIVEN WITH THE STATE THE
 * REFUSAL LEAVES BEHIND.
 *
 * Three rounds fixed the joint where a spend stop was raised and moved the death
 * one statement downstream each time: `MAKER_POSITION_UNAVAILABLE`, then
 * `UNSERVED_MAKER_POSITION_UNRESOLVED`, then
 * `NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW`. The mechanism was the same every
 * time. At M = 2 with root 1 refused, the review guard (correctly) reviews
 * nothing, `readReviewedNodeIds` answers `[]`, `projectJudgedStanding` seeds
 * standing from the reviewed set only, so root 0 is HIDDEN, the propagation is
 * over zero nodes, no authored root is servable, and the run throws — root 0,
 * minted, panelled and paid for, is lost.
 *
 * The round-3 RED drove `buildMakerPositionDisclosure` alone, which is the LAST
 * statement on the path; its five cases pass whether or not the runner reaches
 * it. This file drives the decision the runner now takes ONCE, from the state
 * the stop leaves to the served root and the disclosure, and carries the result
 * through the terminal the answer actually reaches. The pin that the runner
 * CALLS this decision, at both sites, is `tests/architecture/v28-serve-decision-wiring.test.ts`.
 */
const ROOT_0 = Object.freeze({ nodeId: "node:root-0", maker: "maker-a" });
const ROOT_1 = Object.freeze({ nodeId: "node:root-1", maker: "maker-b" });
const CHILD_0A = "node:root-0:support";
const CHILD_0B = "node:root-0:attack";
const MONO_MARKS = Object.freeze(["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"] as const);
const monoRecords = (servedRoot: { readonly nodeId: string }): readonly ConditionMarkRecord[] =>
  Object.freeze(MONO_MARKS.map((mark) => Object.freeze({
    mark,
    scope: "answer" as const,
    subjectRef: servedRoot.nodeId,
    reason: "MONO_MAKER_RUN",
    liftPath: "RUN_DIFFERENT_MAKER_CRITIQUE",
    servedRootRule: null,
    affectedNodeIds: Object.freeze([servedRoot.nodeId])
  })));

/** Root 0 alone, exactly as the graph holds it when root 1 was never afforded. */
const ROOT_0_ONLY: EvaluationSnapshot = {
  nodes: [{ nodeId: ROOT_0.nodeId, baseStrength: 0.7, parentNodeId: null }],
  arrows: [],
  arrowOrder: [],
  operatorResolutions: [],
  clusterRecords: []
};

/** Two roots, no expansion: the M >= 3 run stopped on root 2, or M = 2 stopped on the first review. */
const TWO_ROOTS: EvaluationSnapshot = {
  nodes: [
    { nodeId: ROOT_0.nodeId, baseStrength: 0.6, parentNodeId: null },
    { nodeId: ROOT_1.nodeId, baseStrength: 0.8, parentNodeId: null }
  ],
  arrows: [],
  arrowOrder: [],
  operatorResolutions: [],
  clusterRecords: []
};

/** Two reviewed roots and two children of root 0, the run stopped during expansion. */
const EXPANDED: EvaluationSnapshot = {
  nodes: [
    { nodeId: ROOT_0.nodeId, baseStrength: 0.6, parentNodeId: null },
    { nodeId: ROOT_1.nodeId, baseStrength: 0.5, parentNodeId: null },
    { nodeId: CHILD_0A, baseStrength: 0.9, parentNodeId: ROOT_0.nodeId },
    { nodeId: CHILD_0B, baseStrength: 0.4, parentNodeId: ROOT_0.nodeId }
  ],
  arrows: [
    { arrowId: "a:0a", sourceNodeId: CHILD_0A, targetKind: "NODE", targetNodeId: ROOT_0.nodeId, targetEdgeId: null, polarity: "support", kind: null, strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "REVIEWER" },
    { arrowId: "a:0b", sourceNodeId: CHILD_0B, targetKind: "NODE", targetNodeId: ROOT_0.nodeId, targetEdgeId: null, polarity: "attack", kind: "rebutting", strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "REVIEWER" }
  ],
  arrowOrder: ["a:0a", "a:0b"],
  operatorResolutions: [{ parentNodeId: ROOT_0.nodeId, operator: "accumulate", suppliedBy: "deployment" }],
  clusterRecords: []
};

const nodeIds = (snapshot: EvaluationSnapshot): readonly string[] => snapshot.nodes.map((node) => node.nodeId);

const COMPOSITION_BUDGET: CompositionBudgetResolution = Object.freeze({
  tier: "low",
  bound: 100_000,
  registerRowKey: "compositionBundleBudget.low",
  registerVersion: 91,
  sourceRef: "test-layer:V-28"
});

describe("R-A — the mechanism that killed the run, stated once so it stays visible", () => {
  it("an empty reviewed seed hides the only root — which is why the seed is the decision", () => {
    // `projectJudgedStanding` is unchanged and still does this: with nothing
    // reviewed, nothing has a basis. The fix is upstream, in WHAT seeds it.
    const standing = projectJudgedStanding(ROOT_0_ONLY, []);
    expect(standing.hiddenNodeIds).toEqual([ROOT_0.nodeId]);
    expect(standing.snapshot.nodes).toEqual([]);
  });
});

describe("R-A / R-B — M = 2, the second root's first call refused", () => {
  const decide = (stop: "MONEY" | "USAGE") => decideMakerPositionServe({
    effectiveMakerCount: 2,
    runBodyBudgetStop: stop,
    authoredMakerPositions: [ROOT_0],
    snapshot: ROOT_0_ONLY,
    materialisedNodeIds: nodeIds(ROOT_0_ONLY),
    reviewedNodeIds: [],
    unjudgedReviewNodeIds: [],
    monoMakerConditionMarks: MONO_MARKS,
    monoMakerRecords: monoRecords
  });

  it("serves root 0 on the single-maker footing instead of hiding it", () => {
    const decision = decide("MONEY");

    expect(decision.footing).toBe("SPEND_STOPPED");
    expect(decision.judgedStandingSeed).toEqual([ROOT_0.nodeId]);
    expect(decision.standing.hiddenNodeIds).toEqual([]);
    expect(decision.servableMakerPositions).toEqual([ROOT_0]);
    expect(decision.servedRoot).toBe(ROOT_0);
    expect(decision.servedRootSelection.margin).toEqual({ kind: "ABSENT", reason: "SINGLE_SERVABLE_ROOT" });
  });

  it("says the answer rests on ONE lineage, and names the spend stop as the reason", () => {
    for (const stop of ["MONEY", "USAGE"] as const) {
      const decision = decide(stop);

      expect(decision.disclosure.conditionMarks).toEqual(["SINGLE-LINEAGE"]);
      expect(decision.disclosure.records).toHaveLength(1);
      expect(decision.disclosure.records[0]).toMatchObject({
        mark: "SINGLE-LINEAGE",
        scope: "answer",
        subjectRef: ROOT_0.nodeId,
        reason: ENVELOPE_STOP_REASONS[stop],
        affectedNodeIds: [ROOT_0.nodeId]
      });
      // Never the mono-maker reason: this was a two-maker run that could not pay
      // for its second maker, which is a different fact.
      expect(decision.disclosure.records[0]!.reason).not.toBe("MONO_MAKER_RUN");
      expect(decision.disclosure.records[0]!.liftPath).toEqual(expect.any(String));
    }
  });

  it("reaches the envelope terminal with root 0 kept, and every mark has its record", () => {
    const decision = decide("MONEY");
    const factBundle = buildFactBundle({
      facts: Object.freeze(["root 0's statement"]),
      residualObjections: Object.freeze([]),
      badges: Object.freeze([]),
      conditionMarks: decision.disclosure.conditionMarks,
      reversalPoint: "No reversal point was reached before the envelope stopped the run",
      buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    });
    const result = createEnvelopeExhaustedResult({
      factBundle,
      compositionBudget: COMPOSITION_BUDGET,
      verifiedNodeIds: [decision.servedRoot.nodeId],
      skippedEnrichmentRows: [],
      protectedCoreRestatement: "PASS",
      servedStatementExists: false
    });
    const envelopeRecord: ConditionMarkRecord = Object.freeze({
      mark: "ENVELOPE_EXHAUSTED",
      scope: "answer",
      subjectRef: "run:test",
      reason: ENVELOPE_STOP_REASONS.MONEY,
      liftPath: null,
      servedRootRule: null,
      affectedNodeIds: Object.freeze([decision.servedRoot.nodeId])
    });

    expect(result.terminal).toBe(SERVE_CRASH_CLASSES.ENVELOPE_EXHAUSTED.terminal);
    expect(result.conditionMarks).toEqual(expect.arrayContaining(["SINGLE-LINEAGE", "ENVELOPE_EXHAUSTED"]));
    expect(result.conditionMarks).not.toContain("UNSERVED-MAKER-POSITION");
    // The persistence contract the runner meets at `ServeRepository.persist`.
    expect(() => assertRequiredConditionMarkRecords(
      result.conditionMarks,
      [...decision.disclosure.records, envelopeRecord]
    )).not.toThrow();
  });
});

describe("R-A — not confined to M = 2", () => {
  it("M = 3 stopped on root 2: both existing roots are served on the footing, the other is disclosed as unserved", () => {
    const decision = decideMakerPositionServe({
      effectiveMakerCount: 3,
      runBodyBudgetStop: "MONEY",
      authoredMakerPositions: [ROOT_0, ROOT_1],
      snapshot: TWO_ROOTS,
      materialisedNodeIds: nodeIds(TWO_ROOTS),
      reviewedNodeIds: [],
      unjudgedReviewNodeIds: [],
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: monoRecords
    });

    expect(decision.footing).toBe("SPEND_STOPPED");
    expect(decision.standing.hiddenNodeIds).toEqual([]);
    expect(decision.servableMakerPositions).toEqual([ROOT_0, ROOT_1]);
    expect(decision.servedRoot).toBe(ROOT_1);
    // Two lineages exist, so SINGLE-LINEAGE would be a falsehood here.
    expect(decision.disclosure.conditionMarks).toEqual(["UNSERVED-MAKER-POSITION"]);
    expect(decision.disclosure.records[0]!.reason).toContain(ROOT_0.nodeId);
  });

  it("M = 2 stopped on the FIRST review call: no review landed, both roots still serve", () => {
    // The round-3 re-review's "a review has landed by then" holds from the
    // second review onward; the first review's refusal left the same empty seed.
    const decision = decideMakerPositionServe({
      effectiveMakerCount: 2,
      runBodyBudgetStop: "USAGE",
      authoredMakerPositions: [ROOT_0, ROOT_1],
      snapshot: TWO_ROOTS,
      materialisedNodeIds: nodeIds(TWO_ROOTS),
      reviewedNodeIds: [],
      unjudgedReviewNodeIds: [],
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: monoRecords
    });

    expect(decision.standing.hiddenNodeIds).toEqual([]);
    expect(decision.servedRoot).toBe(ROOT_1);
    expect(decision.disclosure.conditionMarks).toEqual(["UNSERVED-MAKER-POSITION"]);
  });
});

describe("R-A — a stop after reviews have landed keeps every review's outcome", () => {
  it("seeds the nodes the stop denied a review; a landed cannot-assess stays hidden with its record", () => {
    const decision = decideMakerPositionServe({
      effectiveMakerCount: 2,
      runBodyBudgetStop: "MONEY",
      authoredMakerPositions: [ROOT_0, ROOT_1],
      snapshot: EXPANDED,
      materialisedNodeIds: nodeIds(EXPANDED),
      reviewedNodeIds: [ROOT_0.nodeId, ROOT_1.nodeId],
      // CHILD_0B's review LANDED and said cannot-assess (or its transport died):
      // a reviewer looked and found no basis. The stop did not deny it anything.
      unjudgedReviewNodeIds: [CHILD_0B],
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: monoRecords
    });

    expect(decision.footing).toBe("SPEND_STOPPED");
    expect([...decision.judgedStandingSeed].sort()).toEqual([ROOT_0.nodeId, ROOT_1.nodeId, CHILD_0A].sort());
    expect(decision.standing.hiddenNodeIds).toEqual([CHILD_0B]);
    expect(decision.standing.snapshot.nodes.map((node) => node.nodeId)).toContain(CHILD_0A);
    expect(decision.servableMakerPositions).toEqual([ROOT_0, ROOT_1]);
  });

  it("changes nothing for a run that was never stopped", () => {
    const decision = decideMakerPositionServe({
      effectiveMakerCount: 2,
      runBodyBudgetStop: null,
      authoredMakerPositions: [ROOT_0, ROOT_1],
      snapshot: EXPANDED,
      materialisedNodeIds: nodeIds(EXPANDED),
      reviewedNodeIds: [ROOT_0.nodeId, ROOT_1.nodeId],
      unjudgedReviewNodeIds: [CHILD_0B],
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: monoRecords
    });

    expect(decision.footing).toBe("CROSS_REVIEWED");
    expect(decision.judgedStandingSeed).toEqual([ROOT_0.nodeId, ROOT_1.nodeId]);
    expect([...decision.standing.hiddenNodeIds].sort()).toEqual([CHILD_0A, CHILD_0B].sort());
    expect(decision.disclosure.conditionMarks).toEqual(["UNSERVED-MAKER-POSITION"]);
  });
});

describe("the two footings that already existed are exactly as they were", () => {
  it("a mono-maker run seeds every materialised node and keeps its two marks and records", () => {
    const decision = decideMakerPositionServe({
      effectiveMakerCount: 1,
      runBodyBudgetStop: null,
      authoredMakerPositions: [ROOT_0],
      snapshot: EXPANDED,
      materialisedNodeIds: nodeIds(EXPANDED),
      reviewedNodeIds: [],
      unjudgedReviewNodeIds: [],
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: monoRecords
    });

    expect(decision.footing).toBe("MONO_MAKER");
    expect(decision.judgedStandingSeed).toEqual(nodeIds(EXPANDED));
    expect(decision.standing.hiddenNodeIds).toEqual([]);
    expect(decision.disclosure.conditionMarks).toEqual([...MONO_MARKS]);
    expect(decision.disclosure.records.map((record) => record.reason)).toEqual(["MONO_MAKER_RUN", "MONO_MAKER_RUN"]);
  });

  it("a multi-maker run with every root excluded after review still refuses, under its own code", () => {
    // Every root's review landed cannot-assess: that is what
    // NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW has always been for, and a spend
    // stop must not be the only way to reach the decision's refusal.
    expect(() => decideMakerPositionServe({
      effectiveMakerCount: 2,
      runBodyBudgetStop: null,
      authoredMakerPositions: [ROOT_0, ROOT_1],
      snapshot: TWO_ROOTS,
      materialisedNodeIds: nodeIds(TWO_ROOTS),
      reviewedNodeIds: [],
      unjudgedReviewNodeIds: [ROOT_0.nodeId, ROOT_1.nodeId],
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: monoRecords
    })).toThrowError(expect.objectContaining({ code: "NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW" }));
  });

  it("refuses to mint SINGLE-LINEAGE for one root at M > 1 when nothing stopped the run", () => {
    // The run body cannot produce this state (a halted root 1 throws
    // MAKER_POSITION_UNAVAILABLE first); if it ever does, a mark with no reason
    // is not the answer — a typed refusal is.
    expect(() => decideMakerPositionServe({
      effectiveMakerCount: 2,
      runBodyBudgetStop: null,
      authoredMakerPositions: [ROOT_0],
      snapshot: ROOT_0_ONLY,
      materialisedNodeIds: nodeIds(ROOT_0_ONLY),
      reviewedNodeIds: [ROOT_0.nodeId],
      unjudgedReviewNodeIds: [],
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: monoRecords
    })).toThrowError(expect.objectContaining({ code: "MAKER_POSITION_DISCLOSURE_UNRESOLVED" }));
  });
});
