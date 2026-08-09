import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  applyCorrelatedErrorDiscount,
  applyDeclaredDisagreement,
  classifyClaimText,
  createUnmeasuredDisagreement,
  createTypedNonAnswer,
  measureDispersion,
  PanelMemberFailure,
  parseJudgeAssessment,
  reduceAssessment,
  runJudgePanel,
  selectReducedJudgement,
  type JudgeAssessment
} from "@debateai/judgement";
import { CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY } from "@debateai/register";

const assessment = (counterargumentStrength = 0.2): JudgeAssessment => ({
  steelman: { summary: "The strongest test-layer version.", fidelity: 0.8 },
  critic: {
    summary: "The strongest supplied test-layer objection.",
    counterargumentStrength,
    basis: "REAL_ATTACK"
  },
  evidence: { quality: 0.7, relevance: 0.9 },
  context: { fit: 0.75, ambiguityFlags: [] },
  fallacy: { severity: 0.1, fatalFlags: [] }
});

const compositionRow = {
  rowKey: CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY,
  registerVersion: 41,
  sourceRef: "test-layer:VG-02-placeholder-shape-only",
  value: {
    kind: "CLAIM_TYPE_COMPOSITION_MAP" as const,
    entries: {
      empirical: {
        branch: "EVIDENCE_AWARE" as const,
        clarityDecayPerAmbiguity: 0.1,
        terms: [
          { metric: "steelman_fidelity" as const, coefficient: 0.2 },
          { metric: "counter_resilience" as const, coefficient: 0.2 },
          { metric: "evidence_quality" as const, coefficient: 0.2 },
          { metric: "evidence_relevance" as const, coefficient: 0.2 },
          { metric: "context_fit" as const, coefficient: 0.1 },
          { metric: "clarity" as const, coefficient: 0.1 }
        ],
        caps: [{ whenFatalType: "UNSUPPORTED", to: 0.3, why: "test-layer fatal cap", by: "test-layer:cap-row" }],
        uncertaintyLadder: [
          { atMost: 0.2, label: "LOW" },
          { atMost: 0.6, label: "MEDIUM" },
          { atMost: 1, label: "HIGH" }
        ]
      }
    }
  }
};

describe("S04 / DR-062 — code-first closed claim typing", () => {
  it("uses the model leg only for unknown and keeps hedges classification-inert", () => {
    expect(classifyClaimText("It might be the case that rainfall causes erosion.").claimType).toBe("causal");
    expect(classifyClaimText("Rainfall causes erosion.").claimType).toBe("causal");
    expect(classifyClaimText("We ought to define safety as bounded risk.").claimType).toBe("mixed");
    expect(classifyClaimText("An opaque sentence with no class signal.")).toMatchObject({
      claimType: "unknown",
      substance: "code",
      enforcement: "closed-claim-type-set"
    });
  });
});

describe("FX-LG-16 / P12 — contract parsing and deterministic reduction", () => {
  it("tries raw, one fence, then the first brace-balanced object and distinguishes schema failure", () => {
    const wire = JSON.stringify(assessment());
    expect(parseJudgeAssessment(wire)).toMatchObject({ kind: "PARSED", strategy: "RAW" });
    expect(parseJudgeAssessment(`\`\`\`json\n${wire}\n\`\`\``)).toMatchObject({ kind: "PARSED", strategy: "ONE_FENCE" });
    expect(parseJudgeAssessment(`preface ${wire} suffix`)).toMatchObject({ kind: "PARSED", strategy: "BRACE_BALANCED" });
    expect(parseJudgeAssessment("not-json")).toMatchObject({ kind: "PARSE_FAILURE" });
    expect(parseJudgeAssessment(JSON.stringify({ steelman: {} }))).toMatchObject({ kind: "SCHEMA_FAILURE" });
  });

  it("reads the composition from a register-row shape and emits branch, ordered caps, drivers and typed holes", () => {
    const withFatal: JudgeAssessment = {
      ...assessment(),
      context: { fit: 0.75, ambiguityFlags: ["scope", "time"] },
      fallacy: {
        severity: 0.1,
        fatalFlags: [{ type: "UNSUPPORTED", severity: 0.9, description: "test-layer unsupported leap" }]
      }
    };
    const reduced = reduceAssessment({
      claimType: "empirical",
      assessment: withFatal,
      compositionRow,
      reducerVersion: "test-layer:reducer-v1"
    });
    expect(reduced.kind).toBe("REDUCED");
    if (reduced.kind !== "REDUCED") return;
    expect(reduced.branch).toBe("EVIDENCE_AWARE");
    expect(reduced.tau).toBe(0.3);
    expect(reduced.caps).toEqual([{
      what: "tau", toWhat: 0.3, why: "test-layer fatal cap", byWhat: "test-layer:cap-row"
    }]);
    expect(reduced.drivers.map((driver) => driver.kind)).toEqual([
      "FATAL_FLAG", "AMBIGUITY", "AMBIGUITY"
    ]);
    expect(reduced.holes).toEqual([expect.objectContaining({ kind: "FATAL_ASSESSMENT_HOLE" })]);
    expect(reduced.compositionProvenance).toEqual({
      rowKey: compositionRow.rowKey,
      registerVersion: 41,
      sourceRef: compositionRow.sourceRef
    });
  });

  it("does not manufacture tau when the V-pending composition cell is absent", () => {
    expect(reduceAssessment({
      claimType: "normative",
      assessment: assessment(),
      compositionRow,
      reducerVersion: "test-layer:reducer-v1"
    })).toEqual({
      kind: "UNAVAILABLE",
      reason: "COMPOSITION_UNRESOLVED",
      claimType: "normative",
      compositionProvenance: {
        rowKey: compositionRow.rowKey,
        registerVersion: 41,
        sourceRef: compositionRow.sourceRef
      }
    });
  });
});

describe("FX-LG-15 / P15 — panel bulkhead, dispersion and correlation", () => {
  it("isolates a failed member, blocks self-grading before a call, and preserves the primary", async () => {
    let selfGradeCalls = 0;
    const result = await runJudgePanel({
      artifactProducerRef: "actor:producer",
      primary: { judgementRef: "judgement:primary", assessment: assessment(), memberRole: "primary" },
      members: [
        {
          memberRole: "critic-a", actorRef: "actor:critic-a", contractHash: "contract:a",
          judge: async () => { throw new PanelMemberFailure("TIMEOUT", "test-layer timeout"); }
        },
        {
          memberRole: "producer", actorRef: "actor:producer", contractHash: "contract:self",
          judge: async () => { selfGradeCalls += 1; return { judgementRef: "never", assessment: assessment() }; }
        }
      ]
    });
    expect(result.judgements.map((entry) => entry.judgementRef)).toEqual(["judgement:primary"]);
    expect(result.notes).toEqual([
      expect.objectContaining({ memberRole: "critic-a", kind: "MEMBER_FAILED", failureKind: "TIMEOUT" }),
      expect.objectContaining({ memberRole: "producer", kind: "PRODUCER_GRADING_FORBIDDEN", failureKind: "PRODUCER_GRADING_FORBIDDEN" })
    ]);
    expect(selfGradeCalls).toBe(0);
  });

  it("serves dispersion separately at two judgements and typed-absent below two", () => {
    expect(measureDispersion([{ judgementRef: "a", tau: 0.2 }], {
      scale: 1, rowKey: "test-layer:dispersion", registerVersion: 41, sourceRef: "test-layer"
    })).toEqual({ kind: "ABSENT", reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" });
    expect(measureDispersion([
      { judgementRef: "a", tau: 0.2 }, { judgementRef: "b", tau: 0.8 }
    ], { scale: 1, rowKey: "test-layer:dispersion", registerVersion: 41, sourceRef: "test-layer" }))
      .toMatchObject({ kind: "MEASURED", value: 0.6000000000000001, driver: { kind: "DISPERSION" } });
  });

  it("discounts repeated known families once in first-appearance order and never couples unknown families", () => {
    const records = applyCorrelatedErrorDiscount([
      { memberRole: "a", earnedWeight: 1, family: { kind: "KNOWN" as const, familyRef: "family:z" } },
      { memberRole: "b", earnedWeight: 0.8, family: { kind: "KNOWN" as const, familyRef: "family:z" } },
      { memberRole: "c", earnedWeight: 0.7, family: { kind: "KNOWN" as const, familyRef: "family:z" } },
      { memberRole: "d", earnedWeight: 0.6, family: { kind: "UNKNOWN" as const, reason: "LINEAGE_NOT_RECORDED" } },
      { memberRole: "e", earnedWeight: 0.5, family: { kind: "UNKNOWN" as const, reason: "LINEAGE_NOT_RECORDED" } }
    ], { repeatedFamilyMultiplier: 0.5, rowKey: "test-layer:correlation", registerVersion: 41, sourceRef: "test-layer" });
    expect(records.map((record) => record.effectiveWeight)).toEqual([1, 0.4, 0.35, 0.6, 0.5]);
    expect(records.map((record) => record.familyOrdinal)).toEqual([1, 2, 3, null, null]);
    expect(JSON.stringify(records)).not.toMatch(/provider|model/i);
  });
});

describe("DR-077 / FX-S22-01 / FX-PT-D1 — selection, disagreement and no default", () => {
  const selectionRule = {
    kind: "MAXIMIZE_WEIGHTED_TAU" as const,
    rowKey: "test-layer:judgement-selection-rule",
    registerVersion: 41,
    sourceRef: "test-layer:DR-077"
  };

  it("DR-077 named — earned weight moves which exact judgement tau is served, never an average", () => {
    const candidates = [
      { judgementRef: "high-tau", tau: 0.9, effectiveWeight: 0.2 },
      { judgementRef: "high-weight", tau: 0.7, effectiveWeight: 1 }
    ];
    expect(selectReducedJudgement(candidates, selectionRule)).toMatchObject({
      kind: "SELECTED", selectedJudgementRef: "high-weight", tau: 0.7, selectionScore: 0.7
    });
    expect(selectReducedJudgement([
      { ...candidates[0]!, effectiveWeight: 1 }, { ...candidates[1]!, effectiveWeight: 0.2 }
    ], selectionRule)).toMatchObject({
      kind: "SELECTED", selectedJudgementRef: "high-tau", tau: 0.9, selectionScore: 0.9
    });
  });

  it("FX-S22-01 named — a declared, provenance-bearing decision fires both ways without an invented threshold", () => {
    expect(applyDeclaredDisagreement({
      fires: true, predicateRef: "test-layer:observed-case:fire", observationRef: "artifact:spread-a",
      certaintyBand: "HIGH", downgradedBand: "MEDIUM"
    })).toEqual(expect.objectContaining({ flag: "DISAGREEMENT", certaintyBand: "MEDIUM", abstention: false }));
    expect(applyDeclaredDisagreement({
      fires: false, predicateRef: "test-layer:observed-case:no-fire", observationRef: "artifact:spread-b",
      certaintyBand: "HIGH", downgradedBand: "MEDIUM"
    })).toEqual(expect.objectContaining({ flag: "NO_DISAGREEMENT", certaintyBand: "HIGH", abstention: false }));
  });

  it("finding 11 — the single-judge shell records unmeasured disagreement without borrowing a dispersion reason", () => {
    expect(createUnmeasuredDisagreement()).toEqual({
      kind: "NOT_MEASURED",
      reason: "SINGLE_JUDGE_WALKING_SKELETON",
      predicateRef: null,
      observationRef: null,
      certaintyEffect: "UNCHANGED",
      abstention: false
    });
  });

  it("FX-PT-D1 named — arbitrary unusable panels never synthesize tau", () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        memberRole: fc.string({ minLength: 1 }),
        kind: fc.constantFrom("MEMBER_FAILED" as const, "PRODUCER_GRADING_FORBIDDEN" as const)
      }), { maxLength: 30 }),
      () => {
        expect(selectReducedJudgement([], selectionRule)).toEqual({
          kind: "UNAVAILABLE", reason: "NO_USABLE_JUDGEMENTS"
        });
        return true;
      }
    ), { seed: 404_077, numRuns: 200 });
  });

  it("DR-044/DR-051 enforces the model's typed non-answer against spec §12.3 without a numeric stand-in", () => {
    expect(createTypedNonAnswer({
      unknownRef: "unknown:test-layer", modelChoice: "measured and inconclusive",
      provenanceRef: "artifact:test-layer"
    })).toMatchObject({ kind: "ABSTENTION", abstentionKind: "measured and inconclusive", chosenBy: "MODEL" });
    expect(() => createTypedNonAnswer({
      unknownRef: "unknown:test-layer", modelChoice: "generic other", provenanceRef: "artifact:test-layer"
    })).toThrow("outside spec §12.3");
  });
});
