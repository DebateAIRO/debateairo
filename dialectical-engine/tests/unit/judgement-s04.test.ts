import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  applyCorrelatedErrorDiscount,
  applyDeclaredDisagreement,
  classifyClaimText,
  createUnmeasuredDisagreement,
  createTypedNonAnswer,
  measureDispersion,
  PANEL_MEMBER_FAILURE_KINDS,
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

  it("rejects a localized fatal flag type before reduction can silently miss its cap", () => {
    const localized = {
      ...assessment(),
      fallacy: {
        severity: 0.9,
        fatalFlags: [{
          type: "NESUSȚINUT",
          severity: 0.9,
          description: "Saltul nu are sprijin."
        }]
      }
    };
    expect(parseJudgeAssessment(JSON.stringify(localized))).toMatchObject({ kind: "SCHEMA_FAILURE" });
  });

  it("preserves an ASCII hyphenated fatal flag and matches its register cap case-insensitively", () => {
    const parsed = parseJudgeAssessment(JSON.stringify({
      ...assessment(),
      fallacy: {
        severity: 0.9,
        fatalFlags: [{
          type: "UNSUPPORTED-LEAP",
          severity: 0.9,
          description: "The inference is unsupported."
        }]
      }
    }));
    expect(parsed).toMatchObject({
      kind: "PARSED",
      assessment: { fallacy: { fatalFlags: [{ type: "UNSUPPORTED-LEAP" }] } }
    });
    if (parsed.kind !== "PARSED") return;
    const reduced = reduceAssessment({
      claimType: "empirical",
      assessment: parsed.assessment,
      compositionRow: {
        ...compositionRow,
        value: {
          ...compositionRow.value,
          entries: {
            empirical: {
              ...compositionRow.value.entries.empirical,
              caps: [{
                whenFatalType: "unsupported-leap",
                to: 0.25,
                why: "test-layer lowercase hyphenated fatal cap",
                by: "test-layer:hyphenated-cap-row"
              }]
            }
          }
        }
      },
      reducerVersion: "test-layer:reducer-v1"
    });
    expect(reduced).toMatchObject({
      kind: "REDUCED",
      tau: 0.25,
      caps: [{ toWhat: 0.25, byWhat: "test-layer:hyphenated-cap-row" }]
    });
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

/**
 * F-DIAG-S04-PANEL-NOTE — the note's `reason` is drawn from a BOUNDED alphabet.
 *
 * The note is not a debug string: `apps/runner/src/index.ts:2695-2699` copies
 * `reason` into `disagreement.panel.notes[]`, which is persisted and read back
 * from a database row (`tests/integration/database.test.ts:3845`). A raw caught
 * message therefore lands in storage. Same class as F-RISK-IDENTITY-LOG.
 *
 * The expected alphabet below is written out HERE, independently, and is NOT
 * imported from `s04.ts` — a stored list re-exported by the thing under test is
 * not an independent derivation (codex's qualification on the landed pattern).
 * Its producer audit is in agent-reports/diag-class-a.md.
 */
const EXPECTED_PANEL_NOTE_REASONS = [
  // the closed PanelMemberFailure vocabulary, forwarded as the note's reason
  "CONSTRUCTION_ERROR", "TIMEOUT", "PROVIDER_ERROR", "PARSE_FAILURE",
  "SCHEMA_FAILURE", "UNCONFIGURED_FAMILY", "PRODUCER_GRADING_FORBIDDEN",
  // typed provider codes that can arrive un-converted on a caller-wired judge
  "PROVIDER_CALL_FAILED", "PROVIDER_CONTENT_UNACCEPTED",
  // the fixed fallback, and the pre-existing self-grading constant
  "UNCLASSIFIED_MEMBER_ERROR", "FX-HR-H6"
] as const;

describe("F-DIAG-S04-PANEL-NOTE — the panel note never carries a raw caught message", () => {
  // Synthetic only (D18): no value here is, or resembles, a real credential.
  const SYNTHETIC_SENSITIVE =
    "connect failed for postgres://asker:synthetic-pw-42@10.0.0.4:5432/debate (asker=synthetic.person@example.invalid)";

  const panelWith = (judge: () => Promise<{ judgementRef: string; assessment: JudgeAssessment }>) =>
    runJudgePanel({
      artifactProducerRef: "actor:producer",
      primary: { judgementRef: "judgement:primary", assessment: assessment(), memberRole: "primary" },
      members: [{ memberRole: "critic-a", actorRef: "actor:critic-a", contractHash: "contract:a", judge }]
    });

  it("bounds the reason when an untyped member error carries sensitive text", async () => {
    const result = await panelWith(async () => { throw new Error(SYNTHETIC_SENSITIVE); });

    const note = result.notes[0]!;
    expect(note.kind).toBe("MEMBER_FAILED");
    // The property: nothing DERIVED from the caught value reaches the note. Not a
    // redaction of known-bad substrings — a closed output alphabet.
    expect(EXPECTED_PANEL_NOTE_REASONS).toContain(note.reason);
    expect(note.reason).not.toContain("synthetic-pw-42");
    expect(note.reason).not.toContain("postgres://");
    expect(note.reason).not.toContain("example.invalid");
    expect(note.reason).toBe("UNCLASSIFIED_MEMBER_ERROR");
  });

  it("bounds the reason for a non-Error throw", async () => {
    const result = await panelWith(async () => { throw SYNTHETIC_SENSITIVE; });

    const note = result.notes[0]!;
    expect(EXPECTED_PANEL_NOTE_REASONS).toContain(note.reason);
    expect(note.reason).not.toContain("synthetic-pw-42");
  });

  it("control — a PanelMemberFailure still lands its kind, and the kind becomes the reason", async () => {
    for (const kind of ["TIMEOUT", "PARSE_FAILURE", "SCHEMA_FAILURE", "PROVIDER_ERROR"] as const) {
      const result = await panelWith(async () => {
        throw new PanelMemberFailure(kind, SYNTHETIC_SENSITIVE);
      });

      const note = result.notes[0]!;
      expect(note.failureKind).toBe(kind);
      expect(note.reason).toBe(kind);
      expect(note.reason).not.toContain("synthetic-pw-42");
    }
  });

  it("control — the producer's own refused seat keeps its existing bounded reason", async () => {
    const result = await runJudgePanel({
      artifactProducerRef: "actor:producer",
      primary: { judgementRef: "judgement:primary", assessment: assessment(), memberRole: "primary" },
      members: [{
        memberRole: "producer", actorRef: "actor:producer", contractHash: "contract:self",
        judge: async () => { throw new Error(SYNTHETIC_SENSITIVE); }
      }]
    });

    expect(result.notes[0]!).toMatchObject({
      kind: "PRODUCER_GRADING_FORBIDDEN",
      failureKind: "PRODUCER_GRADING_FORBIDDEN",
      reason: "FX-HR-H6"
    });
  });

  /**
   * codex r1 F1. `instanceof` establishes ANCESTRY, not membership.
   * `PanelMemberFailureKind` is a compile-time union and `readonly` is erased, so
   * a subclass or a mutated instance can carry any string in `failureKind` and the
   * old helper returned it verbatim. The declared list is a vocabulary; only a
   * runtime check makes it a guarantee.
   */
  it("refuses a runtime failureKind outside the declared vocabulary", async () => {
    const rogue = new PanelMemberFailure("TIMEOUT", "irrelevant");
    (rogue as unknown as { failureKind: string }).failureKind = SYNTHETIC_SENSITIVE;
    const result = await panelWith(async () => { throw rogue; });

    const note = result.notes[0]!;
    expect(note.reason).not.toContain("synthetic-pw-42");
    expect(note.reason).toBe("UNCLASSIFIED_MEMBER_ERROR");
    expect(EXPECTED_PANEL_NOTE_REASONS).toContain(note.reason);
  });

  it("refuses an out-of-domain kind carried by a subclass", async () => {
    class ForgedFailure extends PanelMemberFailure {
      constructor() {
        super("PARSE_FAILURE", "irrelevant");
        (this as unknown as { failureKind: string }).failureKind = "DEV_LEAKED_" + SYNTHETIC_SENSITIVE;
      }
    }
    const result = await panelWith(async () => { throw new ForgedFailure(); });

    const note = result.notes[0]!;
    expect(note.reason).not.toContain("synthetic-pw-42");
    expect(note.reason).toBe("UNCLASSIFIED_MEMBER_ERROR");
  });

  it("reads the kind ONCE, so an accessor that changes between reads cannot slip past the check", async () => {
    const shifty = new PanelMemberFailure("TIMEOUT", "irrelevant");
    let reads = 0;
    Object.defineProperty(shifty, "failureKind", {
      configurable: true,
      get: () => (reads++ === 0 ? "TIMEOUT" : SYNTHETIC_SENSITIVE)
    });
    const result = await panelWith(async () => { throw shifty; });

    const note = result.notes[0]!;
    expect(note.reason).not.toContain("synthetic-pw-42");
    expect(EXPECTED_PANEL_NOTE_REASONS).toContain(note.reason);
  });

  /**
   * codex r1b F1 remainder. `PANEL_MEMBER_FAILURE_KINDS` is EXPORTED and NOT frozen:
   * `as const` is a type-level assertion and `readonly string[]` aliases rather than
   * copies. A membership check that reads through the export closes the alphabet over
   * the array's CURRENT CONTENTS, not over the seven promised spellings — so a caller
   * that pushes into the export widens the reason alphabet. The helper must own its
   * vocabulary.
   */
  it("does not admit a kind pushed into the exported vocabulary at runtime", async () => {
    const exported = PANEL_MEMBER_FAILURE_KINDS as unknown as string[];
    const original = [...exported];
    // Synthetic only (D18); shaped like a kind so only the STORAGE decides the outcome.
    const INJECTED = "SYNTHETIC_INJECTED_KIND";
    let reason: string;
    try {
      exported.push(INJECTED);
      const failure = new PanelMemberFailure("TIMEOUT", "irrelevant");
      (failure as unknown as { failureKind: string }).failureKind = INJECTED;

      const result = await panelWith(async () => { throw failure; });
      reason = result.notes[0]!.reason;
    } finally {
      exported.length = 0;
      exported.push(...original);
    }

    expect(reason).toBe("UNCLASSIFIED_MEMBER_ERROR");
    expect(reason).not.toBe(INJECTED);
    // the export is restored, so no later test inherits a widened vocabulary
    expect([...(PANEL_MEMBER_FAILURE_KINDS as unknown as string[])]).toEqual(original);
    expect(original).toHaveLength(7);
  });

  /**
   * codex r1b: the round-1 accessor test only showed REFUSAL of an invalid helper input,
   * because the unchanged note construction reads `failureKind` FIRST for its own field
   * and the helper's read was therefore the second, invalid one. This drives the helper's
   * SUCCESSFUL-membership branch into a changing accessor instead, and observes the exact
   * reason: the helper must emit the value it validated, and must not read again.
   */
  it("emits exactly the kind it validated when every read returns something different", async () => {
    const failure = new PanelMemberFailure("TIMEOUT", "irrelevant");
    const reads: string[] = [];
    // read 1 -> the note's own failureKind field; read 2 -> the helper; any further read
    // would be a re-read and would surface the synthetic value.
    const sequence = ["PARSE_FAILURE", "TIMEOUT", SYNTHETIC_SENSITIVE];
    Object.defineProperty(failure, "failureKind", {
      configurable: true,
      get: () => {
        const value = sequence[Math.min(reads.length, sequence.length - 1)]!;
        reads.push(value);
        return value;
      }
    });

    const result = await panelWith(async () => { throw failure; });

    const note = result.notes[0]!;
    expect(note.failureKind).toBe("PARSE_FAILURE");
    expect(note.reason).toBe("TIMEOUT");
    expect(reads).toEqual(["PARSE_FAILURE", "TIMEOUT"]);
    expect(note.reason).not.toContain("synthetic-pw-42");
  });

  it("maps a typed provider code that reaches the catch un-converted", async () => {
    class ProviderCallFailedStub extends Error {
      readonly code = "PROVIDER_CALL_FAILED";
      constructor() { super(SYNTHETIC_SENSITIVE); this.name = "TypedDomainError"; }
    }
    const result = await panelWith(async () => { throw new ProviderCallFailedStub(); });

    const note = result.notes[0]!;
    expect(note.reason).toBe("PROVIDER_CALL_FAILED");
    expect(note.reason).not.toContain("synthetic-pw-42");
  });

  it("maps the second typed provider code too", async () => {
    class ProviderContentUnacceptedStub extends Error {
      readonly code = "PROVIDER_CONTENT_UNACCEPTED";
      constructor() { super(SYNTHETIC_SENSITIVE); this.name = "TypedDomainError"; }
    }
    const result = await panelWith(async () => { throw new ProviderContentUnacceptedStub(); });

    const note = result.notes[0]!;
    expect(note.reason).toBe("PROVIDER_CONTENT_UNACCEPTED");
    expect(note.reason).not.toContain("synthetic-pw-42");
  });

  it("refuses a code property that is not in the two-entry map", async () => {
    class UnknownCodeStub extends Error {
      readonly code = "SOME_OTHER_TYPED_CODE";
      constructor() { super(SYNTHETIC_SENSITIVE); this.name = "TypedDomainError"; }
    }
    const result = await panelWith(async () => { throw new UnknownCodeStub(); });

    expect(result.notes[0]!.reason).toBe("UNCLASSIFIED_MEMBER_ERROR");
  });
});
