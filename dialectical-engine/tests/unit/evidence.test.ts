import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EvidenceRepository,
  assessAdmissibility,
  certifyInstrument,
  classifyCitationAttempt,
  createEvidenceBaseScore,
  createQueryAmendment,
  deriveProvenanceClusterKey,
  evaluateEvidenceGate,
  evaluateFreshness,
  freezeQuerySet
} from "../../packages/evidence/src/index.js";
import { CITATION_ROUTES } from "@debateai/kernel";

describe("S06 frozen inquiry and evidence-domain rules", () => {
  it("freezes, deduplicates and hashes only question-derived queries with an opposition term", () => {
    const frozen = freezeQuerySet([
      { text: "Does A cause B?", polarity: "SUPPORTING", derivedFromQuestion: true },
      { text: "Evidence against A causing B", polarity: "DISCONFIRMING", derivedFromQuestion: true },
      { text: "Does A cause B?", polarity: "SUPPORTING", derivedFromQuestion: true }
    ]);
    expect(frozen.queries).toHaveLength(2);
    expect(frozen.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(frozen.queries)).toBe(true);
    expect(() => freezeQuerySet([
      { text: "topic guess", polarity: "SUPPORTING", derivedFromQuestion: false },
      { text: "opposition", polarity: "DISCONFIRMING", derivedFromQuestion: true }
    ])).toThrowError(expect.objectContaining({ code: "OFF_PLAN_QUERY_REFUSED" }));
  });

  it("keeps amendments append-only and distinguishes their confirmation power", () => {
    expect(createQueryAmendment({ querySetRef: "query-set:1", kind: "MECHANICAL_REPAIR", amendedQuery: "canonical alias", reason: "canonical spelling" }))
      .toMatchObject({ confirmationPower: "FULL" });
    expect(createQueryAmendment({ querySetRef: "query-set:1", kind: "SEMANTIC_REAIM", amendedQuery: "new scope", reason: "new concept" }))
      .toMatchObject({ confirmationPower: "EXPLORATION_ONLY" });
  });

  it("implements DR-009's only three admissibility outcomes without a numeric threshold", () => {
    expect(assessAdmissibility({ relevance: "ON_SUBJECT" })).toEqual({ outcome: "ADMITTED", scoreAllowed: true, visibleDowngrade: null });
    expect(assessAdmissibility({ relevance: "OFF_SUBJECT", offSubjectShare: "the population does not match" }))
      .toMatchObject({ outcome: "REJECTED", scoreAllowed: false });
    expect(assessAdmissibility({ relevance: "PARTLY_RELEVANT", offSubjectShare: "the comparator is out of scope" }))
      .toMatchObject({ outcome: "ADMITTED_DOWNGRADED", scoreAllowed: true, visibleDowngrade: "the comparator is out of scope" });
  });

  it("derives cluster keys from provenance + run/model family and isolates unresolved nodes", () => {
    expect(deriveProvenanceClusterKey({ studyOrDatasetIdentity: "dataset:1", sourceDomain: null, publisher: null, producingRunId: "run:1", modelFamily: "maker:a", nodeId: "node:1" }))
      .toBe("dataset:1|run:1|maker:a");
    expect(deriveProvenanceClusterKey({ studyOrDatasetIdentity: null, sourceDomain: null, publisher: null, producingRunId: "run:1", modelFamily: "maker:a", nodeId: "node:1" }))
      .toBe("singleton:node:1");
  });

  it("computes freshness against as_of on every call and applies the ruled fast/slow consequence", () => {
    const stale = { newestRetrievedAt: new Date("2026-08-01T00:00:00Z"), asOf: new Date("2026-08-08T00:00:00Z"), maxAgeMs: 1, registerRowRef: "register:test-layer" } as const;
    expect(evaluateFreshness({ ...stale, pace: "FAST_MOVING" })).toMatchObject({ state: "STALE", consequence: "REFUSE" });
    expect(evaluateFreshness({ ...stale, pace: "SLOW_OR_STATIC" })).toMatchObject({ state: "STALE", consequence: "SERVE_WITH_STALENESS" });
  });

  it("requires evidence-pipeline provenance for leaf base scores", () => {
    expect(createEvidenceBaseScore({ value: 0.7, producer: "EVIDENCE_PIPELINE", sourceRef: "source:1", evidenceItemRef: "item:1", replayHandle: "evidence:item:1" }))
      .toMatchObject({ producer: "evidence:pipeline", kind: "base-probability" });
    expect(() => createEvidenceBaseScore({ value: 0.7, producer: "MODEL_ASSERTION", sourceRef: "source:1", evidenceItemRef: "item:1", replayHandle: "model:1" }))
      .toThrowError(expect.objectContaining({ code: "MODEL_ASSERTED_EVIDENCE_SCORE_REFUSED" }));
  });

  it("refuses a scored REJECTED item before attempting persistence", async () => {
    const repository = new EvidenceRepository({} as never);
    await expect(repository.recordEvidenceItem({
      runId: "run:test-layer", nodeId: "node:test-layer", sourceRef: "source:test-layer",
      excerpt: "Wholly off-subject test-layer excerpt", excerptTruncated: false,
      truncationAtWordBoundary: false, relevance: "OFF_SUBJECT",
      offSubjectShare: "the cited population is wholly unrelated", score: 0.7,
      scoreProducer: "EVIDENCE_PIPELINE", replayHandle: "evidence:test-layer",
      studyOrDatasetIdentity: "dataset:test-layer", sourceDomain: null, publisher: null,
      producingRunId: "run:test-layer", modelFamily: "maker:test-layer",
      archivedSourceVersion: "version:test-layer", retrievedAt: new Date("2026-08-07T00:00:00Z")
    })).rejects.toMatchObject({ code: "SCORED_REJECTED_EVIDENCE_REFUSED" });
  });
});

describe("DR-084 citation-route closed ladder", () => {
  const base = {
    citationNamesSource: true, completeRetrievalRecord: true, absenceRowRef: null,
    attemptAccessDepth: "OPENED_FULL" as const, sourceCurrent: true, spanCited: true,
    comparisonSupported: true, comparisonExecuted: true, comparisonOutcome: "OK" as const,
    comparisonResult: { present: true, exact: true }
  };

  it("mints exactly the eight ratified routes and no generic other", () => {
    expect(CITATION_ROUTES).toEqual([
      "NO_SOURCE_FOUND", "CITATION_UNBACKED", "SOURCE_UNREACHABLE", "PREVIEW_DEPTH_ONLY",
      "SOURCE_SUPERSEDED", "EXACT_COMPARE_UNAVAILABLE", "SPAN_NOT_FOUND", "SPAN_MISMATCH"
    ]);
    expect(CITATION_ROUTES).not.toContain("OTHER");
  });

  it.each([
    [{ ...base, citationNamesSource: false, completeRetrievalRecord: false, absenceRowRef: "absence:1", attemptAccessDepth: null }, "NO_SOURCE_FOUND"],
    [{ ...base, completeRetrievalRecord: false, attemptAccessDepth: null }, "CITATION_UNBACKED"],
    [{ ...base, attemptAccessDepth: "ACCESS_BLOCKED" }, "SOURCE_UNREACHABLE"],
    [{ ...base, attemptAccessDepth: "PREVIEW_ONLY" }, "PREVIEW_DEPTH_ONLY"],
    [{ ...base, sourceCurrent: false }, "SOURCE_SUPERSEDED"],
    [{ ...base, comparisonSupported: false }, "EXACT_COMPARE_UNAVAILABLE"],
    [{ ...base, comparisonResult: { present: false, exact: false } }, "SPAN_NOT_FOUND"],
    [{ ...base, comparisonResult: { present: true, exact: false } }, "SPAN_MISMATCH"]
  ] as const)("routes a constructible failure to %s", (facts, route) => {
    expect(classifyCitationAttempt(facts)).toMatchObject({ outcome: "ROUTED", route });
  });

  it.each([
    ["NO_SPAN_CITED", { ...base, spanCited: false }],
    ["MEDIUM_UNSUPPORTED", { ...base, comparisonSupported: false }],
    ["COMPARE_NOT_EXECUTED", { ...base, comparisonExecuted: false }],
    ["COMPARE_EXECUTION_NOT_OK", { ...base, comparisonOutcome: "FAILED" as const }],
    ["COMPARE_RESULT_MISSING", { ...base, comparisonResult: null }]
  ] as const)("fires the named R6 reason %s", (compareUnavailableReason, facts) => {
    expect(classifyCitationAttempt(facts)).toEqual({
      outcome: "ROUTED", route: "EXACT_COMPARE_UNAVAILABLE", compareUnavailableReason
    });
  });

  it("keeps VERIFIED in the separate outcome column", () => {
    expect(classifyCitationAttempt(base)).toEqual({ outcome: "VERIFIED", route: null, compareUnavailableReason: null });
  });

  it("is deterministic across generated boolean comparison results", () => {
    fc.assert(fc.property(fc.boolean(), fc.boolean(), (present, exact) => {
      const input = { ...base, comparisonResult: { present, exact } };
      expect(classifyCitationAttempt(input)).toEqual(classifyCitationAttempt(input));
    }), { seed: 20260808 });
  });
});

describe("DR-085/087 shadow gate and P18 certification", () => {
  it.each(["mixed", "unknown", "empirical", "causal", "prediction", "comparative"] as const)("fail-closes %s in tier-invariant shadow mode", (claimType) => {
    expect(evaluateEvidenceGate({ claimType, valueLaden: false, evidenceSatisfied: false, unsuppressedBand: "TEST_BAND", subjectRef: "node:1", unlockCondition: "supply admissible evidence" }))
      .toMatchObject({ publication: "UNSUPPRESSED_WITH_SHADOW", publishedBand: "TEST_BAND", shadowSuppression: { gate: "EVIDENCE_GATE", subjectRef: "node:1" } });
  });

  it("uses the exact evidence-free complement, with value-laden as a flag", () => {
    expect(evaluateEvidenceGate({ claimType: "normative", valueLaden: false, evidenceSatisfied: false, unsuppressedBand: "B", subjectRef: "n", unlockCondition: "none" }).publication).toBe("UNSUPPRESSED");
    expect(evaluateEvidenceGate({ claimType: "empirical", valueLaden: true, evidenceSatisfied: false, unsuppressedBand: "B", subjectRef: "n", unlockCondition: "none" }).publication).toBe("UNSUPPRESSED");
  });

  it("certifies only a known-positive and known-negative receipt pair", () => {
    const certified = certifyInstrument({ instrumentRef: "instrument:1", positive: { captureRef: "probe:+", expected: "POSITIVE", observed: "POSITIVE" }, negative: { captureRef: "probe:-", expected: "NEGATIVE", observed: "NEGATIVE" } });
    expect(certified).toMatchObject({ outcome: "CERTIFIED", positiveCaptureRef: "probe:+", negativeCaptureRef: "probe:-" });
    expect(certifyInstrument({ instrumentRef: "instrument:1", positive: { captureRef: "probe:+", expected: "POSITIVE", observed: "NEGATIVE" }, negative: { captureRef: "probe:-", expected: "NEGATIVE", observed: "NEGATIVE" } }).outcome)
      .toBe("UNINSTRUMENTED");
  });
});
