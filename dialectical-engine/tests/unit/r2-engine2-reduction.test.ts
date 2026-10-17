// tests/unit/r2-engine2-reduction.test.ts
import { describe, expect, it } from "vitest";
import { honestSelectionRule, judgeAssessmentSchema, type JudgeAssessment } from "@debateai/judgement";
import { ENGINE_VERSION_POLICY_ROW_KEY, engineSettingsOf, engineVersionPolicyStartValues, type EngineSettings } from "@debateai/register";
import { PANEL_DEGRADED_SINGLE_VOICE_MARK, panelDegradationOf } from "@debateai/runner";
import { engineHonestSelectionRule, honestAuthorOnly, reduceHonest } from "../../apps/runner/src/engine-reduce.js";

/** Engine redesign R2 (spec 2026-10-15 §4.2 items 4, 5, 7; INTERFACE §6.2): what a node's panel reduces to under engine 2. */
const START = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 5, mapOpening: false });
/** Fidelity alone decides the grade here, so each voice's grade is the number it is written with. */
const FIDELITY_ONLY: EngineSettings = Object.freeze({
  ...START, scoring: Object.freeze({ ...START.scoring, terms: Object.freeze([Object.freeze({ metric: "steelman_fidelity" as const, coefficient: 1 })]) })
});
const assessment = (fidelity: number, fatal: readonly number[] = []): JudgeAssessment => judgeAssessmentSchema.parse({
  steelman: { summary: "The point, restated.", fidelity },
  critic: { summary: "The best counter.", counterargumentStrength: 0.2, basis: "REAL_ATTACK" },
  evidence: { quality: 0.6, relevance: 0.7 }, context: { fit: 0.8, ambiguityFlags: [] },
  fallacy: { severity: 0.1, fatalFlags: fatal.map((severity) => ({ type: "unsupported leap", severity, description: "The step is not shown." })) }
});
/** A voice as runJudgePanel hands it over (the author is the entry whose ref is the author's judgement). */
const voice = (judgementRef: string, maker: string, fidelity: number, fatal: readonly number[] = []) => ({
  judgementRef, assessment: assessment(fidelity, fatal), memberRole: maker, actorRef: `provider:${maker}`, contractHash: "judge-hash"
});
const PANEL = Object.freeze({
  registerVersion: 1, dispersionScale: 1, repeatedFamilyMultiplier: 0.5,
  providerFamilies: [{ familyRef: "family:a", providerRefs: ["provider:maker-a"] }],
  unmappedReason: "UNMAPPED_PROVIDER", sourceRefs: { dispersionScale: "test-layer:r2", repeatedFamilyMultiplier: "test-layer:r2" }
});
const RULE = honestSelectionRule({ rowKey: ENGINE_VERSION_POLICY_ROW_KEY, registerVersion: 7, sourceRef: "test-layer:r2" });
const reduce = (voices: readonly ReturnType<typeof voice>[], engine: EngineSettings = FIDELITY_ONLY) =>
  reduceHonest({ voices, authorJudgementRef: "author", engine, panel: PANEL, earnedWeight: 1, rule: RULE });

describe("engine 2 reduces a node's panel by the honest median", () => {
  it("scores the point by the other makers' median, keeps the author on record, names the rule and the median voice", () => {
    const reduced = reduce([voice("author", "maker-0", 0.9), voice("a", "maker-a", 0.8), voice("b", "maker-b", 0.6), voice("c", "maker-c", 0.4)]);
    expect(reduced.selection).toEqual({ kind: "SELECTED", selectedJudgementRef: "b", tau: 0.6, selectionScore: 0.6,
      rule: { kind: "ENGINE2_HONEST_MEDIAN", rowKey: "engineVersionPolicy", registerVersion: 7, sourceRef: "test-layer:r2" } });
    expect(reduced.reducedMembers.map((entry) => [entry.judgementRef, entry.tau])).toEqual([["author", 0.9], ["a", 0.8], ["b", 0.6], ["c", 0.4]]);
    expect(reduced.honest).toEqual({
      voices: [{ memberRole: "maker-0", grade: 0.9, weighted: 0.9, caps: [] }, { memberRole: "maker-a", grade: 0.8, weighted: 0.8, caps: [] },
        { memberRole: "maker-b", grade: 0.6, weighted: 0.6, caps: [] }, { memberRole: "maker-c", grade: 0.4, weighted: 0.4, caps: [] }],
      median: 0.6, source: "OTHER_MAKERS"
    });
  });

  it("with two other voices, scores their mean and selects the lower one", () => {
    const reduced = reduce([voice("author", "maker-0", 0.9), voice("a", "maker-a", 0.8), voice("b", "maker-b", 0.6)]);
    expect(reduced.selection.tau).toBeCloseTo(0.7, 12);
    expect(reduced.selection.selectedJudgementRef).toBe("b");
  });

  it("measures the spread over the honest grades of every voice heard, the author's included (as today)", () => {
    const reduced = reduce([voice("author", "maker-0", 0.9), voice("a", "maker-a", 0.8), voice("c", "maker-c", 0.4)]);
    expect(reduced.dispersion.kind).toBe("MEASURED");
    expect(reduced.dispersion.kind === "MEASURED" ? reduced.dispersion.value : null).toBeCloseTo(0.5, 12);
  });

  it("lets the close-call extension's extra graders LOWER the score (they enter the median)", () => {
    const base = reduce([voice("author", "maker-0", 0.9), voice("a", "maker-a", 0.8), voice("b", "maker-b", 0.6)]);
    const extended = reduce([voice("author", "maker-0", 0.9), voice("a", "maker-a", 0.8), voice("b", "maker-b", 0.6),
      voice("d", "maker-d", 0.2), voice("e", "maker-e", 0.3)]);
    expect(extended.selection.tau).toBeCloseTo(0.45, 12);
    expect(extended.selection.tau).toBeLessThan(base.selection.tau);
    expect(extended.selection.selectedJudgementRef).toBe("e");
  });

  it("falls back to the author only when no other maker graded, and that is exactly the single-voice mark", () => {
    const alone = reduce([voice("author", "maker-0", 0.9)]);
    expect(alone.honest.source).toBe("AUTHOR_LAST_RESORT");
    expect(alone.selection).toMatchObject({ selectedJudgementRef: "author", tau: 0.9 });
    expect(alone.dispersion.kind).toBe("ABSENT");
    expect(panelDegradationOf(alone.reducedMembers.length - 1, []).marks).toEqual([PANEL_DEGRADED_SINGLE_VOICE_MARK]);
    const heard = reduce([voice("author", "maker-0", 0.9), voice("a", "maker-a", 0.8)]);
    expect(heard.honest.source).toBe("OTHER_MAKERS");
    expect(panelDegradationOf(heard.reducedMembers.length - 1, []).marks).toEqual([]);
  });

  it("records a fatal cap on the voice it lowered (the start values: equal weights)", () => {
    const reduced = reduce([voice("author", "maker-0", 0.9), voice("a", "maker-a", 0.8, [0.6]), voice("b", "maker-b", 0.8)], START);
    expect(reduced.honest.voices[1]).toMatchObject({ memberRole: "maker-a", grade: 0.3, caps: ["FATAL"] });
    expect(reduced.honest.voices[1]!.weighted).toBeCloseTo(5.6 * 0.142857, 12);
    expect(reduced.honest.voices[2]!.caps).toEqual([]);
  });

  it("keeps today's family record, one entry per voice heard", () => {
    const reduced = reduce([voice("author", "maker-0", 0.9), voice("a", "maker-a", 0.8), voice("b", "maker-b", 0.6)]);
    expect(reduced.weighted.map((entry) => entry.family)).toEqual([
      { kind: "UNKNOWN", reason: "UNMAPPED_PROVIDER" }, { kind: "KNOWN", familyRef: "family:a" }, { kind: "UNKNOWN", reason: "UNMAPPED_PROVIDER" }]);
  });

  it("rests a one-maker debate on its author's honest grade (the last resort)", () => {
    const author = honestAuthorOnly({ authorJudgementRef: "author", authorMaker: "maker-0", authorAssessment: assessment(0.9),
      engine: FIDELITY_ONLY, rule: RULE });
    expect(author).toMatchObject({ selectedJudgementRef: "author", tau: 0.9, selectionScore: 0.9, rule: RULE });
    // R2a final wave B2 (Task A4 review 3): the whole record, so an extra member (a number) on it turns this red.
    expect(author.honest).toEqual({ voices: [{ memberRole: "maker-0", grade: 0.9, weighted: 0.9, caps: [] }],
      median: 0.9, source: "AUTHOR_LAST_RESORT" });
  });

  it("refuses a panel with no voice at all", () => {
    expect(() => reduce([])).toThrowError(expect.objectContaining({ code: "NO_USABLE_JUDGEMENTS" }));
  });

  it("names the engine row on the runner's own rule provenance, so the runner's index.ts never names the row", () => {
    expect(engineHonestSelectionRule({ registerVersion: 7, sourceRef: "test-layer:r2" })).toEqual(RULE);
  });

  // A3 review carry (Minor 1; spec §4.2's producer law): a voice of the author's own maker is not another maker's grade.
  it("never counts a voice of the author's own maker as another maker's grade", () => {
    const mixed = reduce([voice("author", "maker-0", 0.9), voice("same", "maker-0", 0.2), voice("a", "maker-a", 0.8)]);
    expect(mixed.selection).toMatchObject({ selectedJudgementRef: "a", tau: 0.8 });
    expect(mixed.honest).toMatchObject({ median: 0.8, source: "OTHER_MAKERS" });
    // Still on record, as every voice heard is.
    expect(mixed.honest.voices.map((entry) => entry.memberRole)).toEqual(["maker-0", "maker-0", "maker-a"]);
    const ownOnly = reduce([voice("author", "maker-0", 0.9), voice("same", "maker-0", 0.2)]);
    expect(ownOnly.selection).toMatchObject({ selectedJudgementRef: "author", tau: 0.9 });
    expect(ownOnly.honest.source).toBe("AUTHOR_LAST_RESORT");
  });

  // A3 review carry (Minor 2): a combine other than the median is refused by name, never silently read as the median.
  it("refuses a scoring combine other than the median, on a panel and on a one-maker debate", () => {
    const other = Object.freeze({
      ...FIDELITY_ONLY, scoring: Object.freeze({ ...FIDELITY_ONLY.scoring, combine: "MAX" as unknown as "MEDIAN" })
    }) satisfies EngineSettings;
    expect(() => reduce([voice("author", "maker-0", 0.9), voice("a", "maker-a", 0.8)], other))
      .toThrowError(expect.objectContaining({ code: "ENGINE_SCORING_COMBINE_UNSUPPORTED" }));
    expect(() => honestAuthorOnly({ authorJudgementRef: "author", authorMaker: "maker-0", authorAssessment: assessment(0.9),
      engine: other, rule: RULE })).toThrowError(expect.objectContaining({ code: "ENGINE_SCORING_COMBINE_UNSUPPORTED" }));
  });
});
