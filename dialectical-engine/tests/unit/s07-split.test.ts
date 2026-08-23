import { describe, expect, it } from "vitest";
import {
  certifyDefeaterCompleteness,
  decideSplitClassification,
  resolveRegeneration,
  selectRivalCarver,
  type DecisionInput
} from "@debateai/battery-decision";
import { resolveDeepeningReentry } from "@debateai/valuation";

function decisionInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    signals: [{
      kind: "score",
      availability: "PRESENT",
      freshness: "FRESH",
      scoreInputHash: "score-input:test",
      scoringContractHash: "score-contract:test",
      scoreRecordId: "score-record:test",
      scoreRunId: "run:test",
      scoreRunSequence: 7,
      reasonCodes: [],
      firingReasons: [{ code: "fatal contradiction", action: "challenge", grounding: "categorical" }],
      blockers: [{ code: "scalar-cost-blocker", grounding: "scalar" }]
    }, {
      kind: "evidence",
      availability: "PRESENT",
      freshness: "FRESH",
      evidenceSnapshotId: "evidence-snapshot:test",
      reasonCodes: [],
      firingReasons: [],
      blockers: []
    }],
    pathState: { status: "ACTIVE", priorAction: "continue", stoppingStatus: "active" },
    ...overrides
  };
}

describe("S07 / FX-LED-06 — pure categorical-only decision law", () => {
  it("uses fixed precedence and excludes scalar blockers from classification", () => {
    const base = decisionInput();
    const input = decisionInput({
      signals: [{
        ...base.signals[0],
        firingReasons: [
          ...base.signals[0].firingReasons,
          { code: "new evidence", action: "reopen", grounding: "categorical" },
          { code: "low score", action: "abandon", grounding: "scalar" }
        ]
      }, base.signals[1]]
    });

    expect(decideSplitClassification(input)).toEqual({
      grounded: true,
      classification: "categorical",
      action: "challenge",
      firingReasons: ["FATAL_CONTRADICTION", "NEW_EVIDENCE", "LOW_SCORE"],
      blockers: ["SCALAR_COST_BLOCKER"],
      spawnCount: 1,
      nextPathState: { status: "ACTIVE", stoppingStatus: "active" }
    });
  });

  it("fails unclassified input closed to scalar and preserves ungrounded paths with zero spawns", () => {
    const unclassified = decisionInput({
      signals: [{
        ...decisionInput().signals[0],
        firingReasons: [{ code: "opaque signal", action: "challenge", grounding: "unclassified" }]
      }, decisionInput().signals[1]]
    });
    expect(decideSplitClassification(unclassified)).toMatchObject({ classification: "scalar", spawnCount: 0 });

    const absentEvidence = decisionInput({
      signals: [decisionInput().signals[0], {
        ...decisionInput().signals[1], availability: "ABSENT", freshness: "UNKNOWN",
        evidenceSnapshotId: null, reasonCodes: ["evidence absent"]
      }]
    });
    expect(decideSplitClassification(absentEvidence)).toMatchObject({
      grounded: false, action: "continue", classification: "scalar", spawnCount: 0
    });
  });

  it("records blockers without letting them ground or authorize abandonment", () => {
    const base = decisionInput();
    const result = decideSplitClassification(decisionInput({
      signals: [{
        ...base.signals[0],
        firingReasons: [{ code: "low scalar", action: "abandon", grounding: "scalar" }],
        blockers: [{ code: "open objection", grounding: "categorical" }]
      }, base.signals[1]]
    }));
    expect(result).toMatchObject({
      action: "continue", classification: "scalar", blockers: ["OPEN_OBJECTION"],
      spawnCount: 0, nextPathState: { status: "ACTIVE", stoppingStatus: "active" }
    });
  });
});

describe("S07 / FX-LG-14 / FX-HR-H7 — defeaters, rotation, and cap", () => {
  it("requires a non-empty defeater set or an exhaustion mark before skeptic certification", () => {
    expect(certifyDefeaterCompleteness({ defeaterRefs: [], rotationExhausted: false, unaddressedAttackRefs: [] }))
      .toEqual({ kind: "INCOMPLETE", serves: false, mark: null });
    expect(certifyDefeaterCompleteness({
      defeaterRefs: [], rotationExhausted: true, unaddressedAttackRefs: []
    })).toEqual({ kind: "CERTIFIED", serves: true, mark: "UNFALSIFIED-AFTER-ROTATION" });
    expect(certifyDefeaterCompleteness({
      defeaterRefs: ["defeater:1"], rotationExhausted: false, unaddressedAttackRefs: ["attack:open"]
    })).toEqual({ kind: "SKEPTIC_REJECTED", serves: false, mark: null });
  });

  it("turns the configured 2-round / 3-attempt cap into a typed not-runnable abstention", () => {
    expect(resolveRegeneration({
      roundsCompleted: 2,
      attemptsCompleted: 3,
      policy: { maxRounds: 2, maxAttempts: 3, registerRef: "splitIterationLimit@1" },
      rejectionEvidence: ["reject:1", "reject:2", "reject:3"]
    })).toEqual({
      kind: "ABSTAIN",
      abstention: {
        kind: "not runnable",
        registerRef: "splitIterationLimit@1",
        rejectionEvidence: ["reject:1", "reject:2", "reject:3"]
      }
    });
  });

  it("selects a different maker alone and records behavioural difference unavailable", () => {
    expect(selectRivalCarver({
      currentMaker: "maker:a",
      candidates: [{ ref: "same", maker: "maker:a" }, { ref: "rival", maker: "maker:b" }]
    })).toEqual({
      selectedRef: "rival",
      diversity: "DIFFERENT_MAKER",
      measuredBehaviouralDifference: { status: "UNAVAILABLE" }
    });
  });
});

describe("S07 / DR-050 — scoped recomposition re-entry", () => {
  it("permits K=1 per parent/run, then halts visibly on the carrying piece", () => {
    expect(resolveDeepeningReentry({
      parentNodeId: "parent:1", roundsCompletedForParentInRun: 0, carryingPieceRef: "piece:1"
    })).toEqual({ kind: "REEXECUTE", round: 1, nodeSet: ["parent:1"] });
    expect(resolveDeepeningReentry({
      parentNodeId: "parent:1", roundsCompletedForParentInRun: 1, carryingPieceRef: "piece:1"
    })).toEqual({ kind: "HALT", conditionMark: "LEVERAGE_UNRESOLVED", carryingPieceRef: "piece:1" });
  });
});
