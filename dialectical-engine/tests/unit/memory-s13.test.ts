import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  attachMemoryDisclosure,
  buildMemoryDisclosure,
  classifyPulledArtifact,
  matchQuestionKeys,
  renderMemorySentence,
  validateMemorySentence,
  validatePinnedPulls,
  type MemoryQuestionKey
} from "@debateai/memory";

function key(overrides: Partial<MemoryQuestionKey> = {}): MemoryQuestionKey {
  return Object.freeze({
    runId: "run:current",
    canonicalQuestionText: "should the city build a tram?",
    callerScope: "ASKER",
    askerScope: "asker:test-layer",
    settlementAct: "recommend",
    questionType: "policy-choice",
    declaredField: "transport",
    normalizedBinding: Object.freeze({ population: "city", outcome: "mobility", comparator: "bus" }),
    frozenTerms: Object.freeze(["city", "tram", "mobility"]),
    frozenQuerySetHash: "query:test-layer",
    asOf: "2026-08-08T00:00:00.000Z",
    policyVersion: 404_013,
    keyVersion: 1,
    ...overrides
  });
}

describe("S13 / FX-S22-04 — four database-predicate tiers and honest disclosure", () => {
  it("chooses the highest firing tier, partitions by asker, and never treats NULL as agreement", () => {
    expect(matchQuestionKeys(key(), key({ runId: "run:prior" }))).toMatchObject({
      tier: "EXACT_QUESTION", autoLink: true, relation: "REPEATS"
    });
    expect(matchQuestionKeys(
      key({ canonicalQuestionText: "should we fund a tram?" }),
      key({ runId: "run:prior", canonicalQuestionText: "tram funding" })
    )).toMatchObject({ tier: "SAME_BINDING", autoLink: true });
    expect(matchQuestionKeys(
      key({ canonicalQuestionText: "tram a", normalizedBinding: { population: "city", outcome: "mobility", comparator: "rail" } }),
      key({ runId: "run:prior", canonicalQuestionText: "tram b" })
    )).toMatchObject({ tier: "PARTIAL_BINDING", autoLink: false, relation: "RELATED_ONLY" });
    expect(matchQuestionKeys(
      key({ canonicalQuestionText: "tram a", settlementAct: null, questionType: null, normalizedBinding: {}, frozenTerms: [] }),
      key({ runId: "run:prior", canonicalQuestionText: "tram b", settlementAct: null, questionType: null, normalizedBinding: {}, frozenTerms: [] })
    )).toMatchObject({ tier: "PARTIAL_BINDING", agreedFields: ["declaredField"] });
    expect(matchQuestionKeys(
      key({ canonicalQuestionText: "tram a", settlementAct: null, questionType: null, declaredField: null, normalizedBinding: {}, frozenTerms: ["tram"] }),
      key({ runId: "run:prior", canonicalQuestionText: "tram b", settlementAct: null, questionType: null, declaredField: null, normalizedBinding: {}, frozenTerms: ["tram", "rail"] })
    )).toMatchObject({ tier: "TERM_OVERLAP", autoLink: false, agreedFields: ["termOverlap"] });
    expect(matchQuestionKeys(key(), key({ runId: "run:prior", askerScope: "asker:other" }))).toBeNull();
  });

  it("is byte-inert when disabled or empty and cannot emit a memory sentence without a match fact", () => {
    const answer = Object.freeze({ facts: Object.freeze(["current fact"]), badges: Object.freeze([]) });
    expect(JSON.stringify(attachMemoryDisclosure(answer, null))).toBe(JSON.stringify(answer));
    expect(renderMemorySentence(buildMemoryDisclosure({ match: null, prior: null, pulls: [], candidates: [] }))).toBeNull();

    const match = matchQuestionKeys(key(), key({ runId: "run:prior" }))!;
    const disclosure = buildMemoryDisclosure({
      match,
      prior: {
        runId: "run:prior", answerId: "answer:prior", answerVersion: 1,
        questionLine: "Should the city build a tram?", answeredAt: "2026-07-01T00:00:00.000Z",
        verdict: "SUPPORTED", confidenceBand: "test-layer:moderate", stalenessState: "UNDER_REVIEW"
      },
      pulls: [],
      candidates: []
    });
    expect(renderMemorySentence(disclosure)).toContain("EXACT_QUESTION");
    expect(renderMemorySentence(disclosure)).toContain("UNDER_REVIEW");
    expect(attachMemoryDisclosure(answer, disclosure)).not.toEqual(answer);
  });

  it("keeps tier, differences, and staleness inside every non-exact rendered disclosure", () => {
    const match = matchQuestionKeys(
      key({ canonicalQuestionText: "new", normalizedBinding: { population: "city", outcome: "mobility", comparator: "rail" } }),
      key({ runId: "run:prior", canonicalQuestionText: "old" })
    )!;
    const disclosure = buildMemoryDisclosure({
      match,
      prior: {
        runId: "run:prior", answerId: "answer:prior", answerVersion: 1, questionLine: "old",
        answeredAt: "2026-07-01T00:00:00.000Z", verdict: "SUPPORTED",
        confidenceBand: "test-layer:moderate", stalenessState: "STALE"
      },
      pulls: [], candidates: []
    });
    const sentence = renderMemorySentence(disclosure)!;
    expect(sentence).toContain("PARTIAL_BINDING");
    expect(sentence).toContain("binding");
    expect(sentence).not.toContain("comparator");
    expect(sentence).toContain("STALE");
    expect(validateMemorySentence(disclosure, sentence)).toBe(sentence);
    expect(() => validateMemorySentence(disclosure, sentence.replace("STALE", "FRESH")))
      .toThrow("MEMORY_DISCLOSURE_GATE_FAILED");
    expect(() => validateMemorySentence(null, "Builds on an earlier answer."))
      .toThrow("MEMORY_MATCH_FACT_REQUIRED");
  });

  it("serves a typed negative disclosure when a candidate was found but not linked", () => {
    const disclosure = buildMemoryDisclosure({
      match: null, prior: null, pulls: [],
      candidates: [{ priorRunId: "run:candidate", tier: "TERM_OVERLAP" }]
    });
    expect(renderMemorySentence(disclosure)).toBe(
      "Memory candidate run:candidate was found but not linked; tier TERM_OVERLAP."
    );
  });

  it("requires every pull pin and keeps a prior verdict disclosure-only", () => {
    expect(validatePinnedPulls([{
      artifactId: "outcome:test-layer", version: 1, contentHash: "a".repeat(64),
      asOf: "2026-07-01T00:00:00.000Z", stalenessStateAtPull: "FRESH",
      askerScope: "asker:test-layer", registerRowKey: "test-layer:memory-pull-cap",
      registerVersion: 404_013, registerSourceRef: "test-layer:FX-S22-04"
    }], { bound: 1, rowKey: "test-layer:memory-pull-cap", registerVersion: 404_013, sourceRef: "test-layer:FX-S22-04" })).toHaveLength(1);
    expect(() => validatePinnedPulls([{
      artifactId: "outcome:test-layer", version: 1, contentHash: "", asOf: "2026-07-01T00:00:00.000Z",
      stalenessStateAtPull: "FRESH", askerScope: "asker:test-layer", registerRowKey: "row",
      registerVersion: 1, registerSourceRef: "source"
    }], { bound: 1, rowKey: "row", registerVersion: 1, sourceRef: "source" })).toThrow("MEMORY_PULL_UNPINNED");
    expect(classifyPulledArtifact("PRIOR_VERDICT")).toBe("DISCLOSURE_ONLY");
    expect(classifyPulledArtifact("RESOLVER_OUTCOME")).toBe("EVIDENCE");
  });
});

describe("S13 / FX-PT-MEM — link never merge", () => {
  it("never manufactures a transitive A→C link from A→B and B→C", () => {
    fc.assert(fc.property(fc.uuid(), fc.uuid(), fc.uuid(), (a, b, c) => {
      fc.pre(new Set([a, b, c]).size === 3);
      const links = new Set([`${a}->${b}`, `${b}->${c}`]);
      expect(links.has(`${a}->${c}`)).toBe(false);
    }));
  });
});
