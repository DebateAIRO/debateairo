import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { evaluate, type EvaluationSnapshot } from "@debateai/propagation";
import {
  buildValueOverlay,
  createWeightSource,
  serveMixedAnswer
} from "@debateai/valuation";

const snapshot: EvaluationSnapshot = Object.freeze({
  nodes: Object.freeze([
    Object.freeze({ nodeId: "node:train", baseStrength: 0.7 }),
    Object.freeze({ nodeId: "node:bus", baseStrength: 0.6 })
  ]),
  arrows: Object.freeze([]),
  arrowOrder: Object.freeze([]),
  operatorResolutions: Object.freeze([]),
  clusterRecords: Object.freeze([])
});

const criteria = Object.freeze([
  Object.freeze({
    criterionId: "speed",
    label: "Travel speed",
    source: "MODEL_PROPOSED" as const,
    evidenceRefs: Object.freeze(["evidence:speed"])
  }),
  Object.freeze({
    criterionId: "cost",
    label: "Travel cost",
    source: "MODEL_PROPOSED" as const,
    evidenceRefs: Object.freeze(["evidence:cost"])
  })
]);

const options = Object.freeze([
  Object.freeze({ optionId: "train", label: "Train", criteria: Object.freeze({ speed: 0.9, cost: 0.2 }) }),
  Object.freeze({ optionId: "bus", label: "Bus", criteria: Object.freeze({ speed: 0.4, cost: 0.8 }) })
]);

describe("S10 / DR-017 / FX-LG-07 — the value overlay stays detached", () => {
  it("computes a real Pareto hinge while detached recomputation stays byte-identical", () => {
    const recorded = evaluate(snapshot);
    const overlay = buildValueOverlay({
      snapshot,
      recordedStrengths: recorded.strengths,
      criterionCandidates: criteria,
      actualEvidenceRefs: ["evidence:speed", "evidence:cost"],
      options,
      weightSource: createWeightSource({ source: "none" })
    });

    expect(overlay.detachmentProof).toMatchObject({
      recordedArrowOrder: [],
      byteIdentical: true
    });
    expect(overlay.detachmentProof.detachedStrengths).toEqual(recorded.strengths);
    expect(overlay.paretoOptionIds).toEqual(["train", "bus"]);
    expect(overlay.valueHinges).toHaveLength(1);
    expect(overlay.valueHinges[0]?.reversalBoundary).toEqual({
      coefficients: { speed: 0.5, cost: -0.6000000000000001 },
      constant: 0
    });
    expect(overlay.flows.flowA.kind).toBe("CONDITIONAL");
    expect(overlay.flows.flowB.swingQuestions).toHaveLength(1);
    expect(overlay.flows.flowC).toEqual({ kind: "NOT_OPTED_IN" });
    expect(overlay.recommendation).toBeNull();
    expect("vector" in overlay.weightSource).toBe(false);
  });

  it("does not fire value elicitation when one option dominates on every criterion", () => {
    const recorded = evaluate(snapshot);
    const overlay = buildValueOverlay({
      snapshot,
      recordedStrengths: recorded.strengths,
      criterionCandidates: criteria,
      actualEvidenceRefs: ["evidence:speed", "evidence:cost"],
      options: [
        { optionId: "train", label: "Train", criteria: { speed: 0.9, cost: 0.8 } },
        { optionId: "bus", label: "Bus", criteria: { speed: 0.4, cost: 0.2 } }
      ],
      weightSource: createWeightSource({ source: "none" })
    });

    expect(overlay.paretoOptionIds).toEqual(["train"]);
    expect(overlay.valueHinges).toEqual([]);
    expect(overlay.flows.flowA).toMatchObject({ kind: "UNCONDITIONAL", dominantOptionId: "train" });
    expect(overlay.flows.flowB.swingQuestions).toEqual([]);
  });

  it("keeps every graph strength byte-identical across arbitrary supplied weights", () => {
    const recorded = evaluate(snapshot);
    fc.assert(fc.property(
      fc.double({ min: 0.01, max: 1, noNaN: true }),
      fc.double({ min: 0.01, max: 1, noNaN: true }),
      (speed, cost) => {
        const overlay = buildValueOverlay({
          snapshot,
          recordedStrengths: recorded.strengths,
          criterionCandidates: criteria,
          actualEvidenceRefs: ["evidence:speed", "evidence:cost"],
          options,
          weightSource: createWeightSource({
            source: "owner_elicited",
            owner: "asker:test-layer",
            vector: { speed, cost }
          })
        });
        expect(JSON.stringify(overlay.detachmentProof.detachedStrengths))
          .toBe(JSON.stringify(recorded.strengths));
      }
    ));
  });
});

describe("S10 / DR-043 / FX-LG-11 — criteria guards and value ownership", () => {
  it("drops evidence-free model criteria, serves the rejection, and keeps asker steering", () => {
    const overlay = buildValueOverlay({
      snapshot,
      recordedStrengths: evaluate(snapshot).strengths,
      criterionCandidates: [
        ...criteria,
        { criterionId: "comfort", label: "Comfort", source: "MODEL_PROPOSED", evidenceRefs: ["evidence:missing"] },
        { criterionId: "accessibility", label: "Accessibility", source: "ASKER_STEERED", evidenceRefs: [] }
      ],
      actualEvidenceRefs: ["evidence:speed", "evidence:cost"],
      options: options.map((option) => ({
        ...option,
        criteria: { ...option.criteria, comfort: 0.5, accessibility: option.optionId === "train" ? 0.6 : 0.8 }
      })),
      weightSource: createWeightSource({ source: "none" })
    });

    expect(overlay.acceptedCriteria.map((criterion) => criterion.criterionId)).toEqual([
      "speed", "cost", "accessibility"
    ]);
    expect(overlay.rejectedCriteria).toEqual([{
      criterionId: "comfort",
      label: "Comfort",
      reason: "EVIDENCE_LINK_NOT_FOUND",
      evidenceRefs: ["evidence:missing"]
    }]);
  });

  it("personalises only from a named owner and visibly marks that owner", () => {
    const weightSource = createWeightSource({
      source: "owner_elicited",
      owner: "asker:test-layer",
      vector: { speed: 0.7, cost: 0.3 }
    });
    const overlay = buildValueOverlay({
      snapshot,
      recordedStrengths: evaluate(snapshot).strengths,
      criterionCandidates: criteria,
      actualEvidenceRefs: ["evidence:speed", "evidence:cost"],
      options,
      weightSource
    });

    expect(overlay.recommendation).toEqual({
      optionId: "train",
      optionLabel: "Train",
      weightMarker: { source: "owner_elicited", owner: "asker:test-layer" }
    });
    expect(() => createWeightSource({ source: "owner_elicited", owner: "   ", vector: { speed: 1 } }))
      .toThrowError(expect.objectContaining({ code: "EMPTY_OVERLAY_OWNER" }));
  });

  it("requires a signed, versioned profile for opt-in organization policy", () => {
    expect(() => createWeightSource({
      source: "org_policy",
      owner: "org:test-layer",
      vector: { speed: 0.7, cost: 0.3 },
      profileRef: "profile:test-layer",
      profileVersion: "",
      signatureRef: "signature:test-layer"
    })).toThrowError(expect.objectContaining({ code: "ORG_POLICY_PROFILE_INVALID" }));
  });
});

describe("S10 / DR-053 — one graph, two machine-ordered sections", () => {
  it("refuses phase 2 before empirical settlement and serves one typed dual act after it", () => {
    const overlay = buildValueOverlay({
      snapshot,
      recordedStrengths: evaluate(snapshot).strengths,
      criterionCandidates: criteria,
      actualEvidenceRefs: ["evidence:speed", "evidence:cost"],
      options,
      weightSource: createWeightSource({ source: "none" })
    });

    expect(() => serveMixedAnswer({
      phase: "EMPIRICAL",
      empiricalSettlementRef: null,
      findingFacts: ["test-layer:finding"],
      overlay
    })).toThrowError(expect.objectContaining({ code: "VALUE_PHASE_NOT_READY" }));

    const answer = serveMixedAnswer({
      phase: "VALUE",
      empiricalSettlementRef: "propagation:test-layer",
      findingFacts: ["test-layer:finding"],
      overlay
    });
    expect(answer.settlementAct).toBe("DUAL_ACT");
    expect(answer.empiricalSettlementRef).toBe("propagation:test-layer");
    expect(answer.sections.map((section) => section.label)).toEqual([
      "what is true",
      "what follows given your values"
    ]);
    expect(answer.sections[1]?.projection.recommendation).toBeNull();
    expect(answer.sections[1]?.projection.reversalPoints).toHaveLength(1);
  });
});
