import { describe, expect, it } from "vitest";
import {
  buildFactBundle,
  createEnvelopeExhaustedResult,
  SERVE_CRASH_CLASSES,
  type CompositionBudgetResolution
} from "@debateai/serve";
import {
  ENVELOPE_STOP_REASONS,
  buildMakerPositionDisclosure,
  buildUnservedMakerPositionRecord
} from "../../apps/runner/src/index.js";

/**
 * RE-REVIEW 2(a), ROUND 3 — A RUN WHOSE SECOND MAKER WAS NEVER AFFORDED.
 *
 * The mechanical half of 2(a) landed: the spend stop is declared before the root
 * loops and both break cleanly. But the STATE that creates was fatal a few
 * hundred lines later, and only the code changed.
 *
 * At M = 2 with root 1 refused, `authoredMakerPositions` is `[root 0]` —
 * `effectiveMakerCount` is still 2 and is never recomputed — and the multi-maker
 * branch calls `buildUnservedMakerPositionRecord(authoredMakerPositions,
 * servedRoot)`, which THROWS `UNSERVED_MAKER_POSITION_UNRESOLVED` when nothing
 * is unserved. That throw is before the envelope evaluation with no catch
 * between, so root 0 — minted, panelled and reviewed, and PAID FOR — was still
 * discarded. Second order: the fact bundle asserts `UNSERVED-MAKER-POSITION`
 * whenever `effectiveMakerCount > 1`, which would claim a position that was
 * never authored.
 *
 * ROUND 4 (rulings R-B, R-C). Round 3 made this branch say NOTHING about maker
 * positions, on the ground that `SINGLE-LINEAGE` meant `MONO_MAKER_RUN`. The
 * ruling is that the answer must SAY it rests on one lineage, and that the
 * record's reason — a free string — names the spend stop instead. So the third
 * row of round 3's table changed from "none / none" to "SINGLE-LINEAGE / one
 * record whose reason is the run-level stop code", and the branch is reached
 * from the runner through `decideMakerPositionServe`
 * (`tests/unit/v28-spend-stopped-serve-decision.test.ts`). `monoMakerRecords`
 * is required now, so the marks and the records cannot diverge by omission.
 *
 * This file keeps the disclosure function's own table; the path is proven in
 * the round-4 file and pinned in `tests/architecture/v28-serve-decision-wiring.test.ts`.
 */
const ROOT_0 = Object.freeze({ nodeId: "node:root-0", maker: "maker-a" });
const ROOT_1 = Object.freeze({ nodeId: "node:root-1", maker: "maker-b" });
const MONO_MARKS = Object.freeze(["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"] as const);
/** The two records the runner mints for a genuine mono-maker run. */
const MONO_RECORDS = Object.freeze(MONO_MARKS.map((mark) => Object.freeze({
  mark,
  scope: "answer" as const,
  subjectRef: ROOT_0.nodeId,
  reason: "MONO_MAKER_RUN",
  liftPath: "RUN_DIFFERENT_MAKER_CRITIQUE",
  servedRootRule: null,
  affectedNodeIds: Object.freeze([ROOT_0.nodeId])
})));
const COMPOSITION_BUDGET: CompositionBudgetResolution = Object.freeze({
  tier: "low",
  bound: 100_000,
  registerRowKey: "compositionBundleBudget.low",
  registerVersion: 91,
  sourceRef: "test-layer:V-28"
});

describe("2(a) — the disclosure of maker positions a run could not afford", () => {
  it("still discloses the unserved root when BOTH were authored", () => {
    const disclosure = buildMakerPositionDisclosure({
      effectiveMakerCount: 2,
      runBodyBudgetStop: null,
      authoredMakerPositions: [ROOT_0, ROOT_1],
      servedRoot: ROOT_0,
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: MONO_RECORDS
    });

    expect(disclosure.conditionMarks).toEqual(["UNSERVED-MAKER-POSITION"]);
    expect(disclosure.records).toHaveLength(1);
    expect(disclosure.records[0]).toMatchObject({
      mark: "UNSERVED-MAKER-POSITION",
      subjectRef: ROOT_0.nodeId
    });
    expect(disclosure.records[0]!.reason).toContain(ROOT_1.nodeId);
  });

  it("discloses the unserved root even when the run was stopped later, because two lineages exist", () => {
    const disclosure = buildMakerPositionDisclosure({
      effectiveMakerCount: 2,
      runBodyBudgetStop: "MONEY",
      authoredMakerPositions: [ROOT_0, ROOT_1],
      servedRoot: ROOT_1,
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: MONO_RECORDS
    });

    expect(disclosure.conditionMarks).toEqual(["UNSERVED-MAKER-POSITION"]);
    expect(disclosure.records[0]!.reason).toContain(ROOT_0.nodeId);
  });

  it("says the answer rests on ONE lineage when the second maker was never afforded (R-B)", () => {
    // The state a spend stop on root 1 leaves behind. There is no second
    // position to name, so `UNSERVED-MAKER-POSITION` would be a falsehood —
    // and silence (round 3) left the answer with no lineage statement at all.
    for (const stop of ["MONEY", "USAGE"] as const) {
      const disclosure = buildMakerPositionDisclosure({
        effectiveMakerCount: 2,
        runBodyBudgetStop: stop,
        authoredMakerPositions: [ROOT_0],
        servedRoot: ROOT_0,
        monoMakerConditionMarks: MONO_MARKS,
        monoMakerRecords: MONO_RECORDS
      });

      expect(disclosure.conditionMarks).toEqual(["SINGLE-LINEAGE"]);
      expect(disclosure.records).toHaveLength(1);
      expect(disclosure.records[0]).toMatchObject({
        mark: "SINGLE-LINEAGE",
        scope: "answer",
        subjectRef: ROOT_0.nodeId,
        reason: ENVELOPE_STOP_REASONS[stop],
        servedRootRule: null,
        affectedNodeIds: [ROOT_0.nodeId]
      });
    }
  });

  it("never borrows the MONO-MAKER reason for a multi-maker run that was cut short", () => {
    // `MONO_MAKER_RUN` means one maker was configured. This run configured two
    // and could not pay for the second, which is a different fact, and the
    // operator's lift differs with it.
    const disclosure = buildMakerPositionDisclosure({
      effectiveMakerCount: 2,
      runBodyBudgetStop: "MONEY",
      authoredMakerPositions: [ROOT_0],
      servedRoot: ROOT_0,
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: MONO_RECORDS
    });

    expect(disclosure.records.map((record) => record.reason)).not.toContain("MONO_MAKER_RUN");
    expect(disclosure.records.map((record) => record.liftPath)).not.toContain("RUN_DIFFERENT_MAKER_CRITIQUE");
    expect(disclosure.conditionMarks).not.toContain("CRITIQUE-UNAVAILABLE");
  });

  it("refuses one root at M > 1 with no spend stop, rather than minting a mark with no reason", () => {
    expect(() => buildMakerPositionDisclosure({
      effectiveMakerCount: 2,
      runBodyBudgetStop: null,
      authoredMakerPositions: [ROOT_0],
      servedRoot: ROOT_0,
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: MONO_RECORDS
    })).toThrowError(expect.objectContaining({ code: "MAKER_POSITION_DISCLOSURE_UNRESOLVED" }));
  });

  it("leaves the genuine mono-maker run exactly as it was", () => {
    const disclosure = buildMakerPositionDisclosure({
      effectiveMakerCount: 1,
      runBodyBudgetStop: null,
      authoredMakerPositions: [ROOT_0],
      servedRoot: ROOT_0,
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: MONO_RECORDS
    });

    expect(disclosure.conditionMarks).toEqual([...MONO_MARKS]);
    expect(disclosure.records.map((record) => record.mark))
      .toEqual(["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"]);
    expect(disclosure.records.map((record) => record.reason)).toEqual(["MONO_MAKER_RUN", "MONO_MAKER_RUN"]);
  });

  it("keeps the guard sharp where it belongs", () => {
    // The function itself still refuses to mint a disclosure that names nobody:
    // a multi-maker run that served one of two authored roots MUST name the
    // other, and that is what the throw has always been for.
    expect(() => buildUnservedMakerPositionRecord([ROOT_0], ROOT_0))
      .toThrowError(expect.objectContaining({ code: "UNSERVED_MAKER_POSITION_UNRESOLVED" }));
  });
});

describe("2(a) — the cut-short run reaches the terminal with its root kept", () => {
  it("serves root 0 through the envelope terminal, saying it rests on one lineage", () => {
    const disclosure = buildMakerPositionDisclosure({
      effectiveMakerCount: 2,
      runBodyBudgetStop: "MONEY",
      authoredMakerPositions: [ROOT_0],
      servedRoot: ROOT_0,
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: MONO_RECORDS
    });
    const factBundle = buildFactBundle({
      facts: Object.freeze(["root 0's statement"]),
      residualObjections: Object.freeze([]),
      badges: Object.freeze([]),
      conditionMarks: disclosure.conditionMarks,
      reversalPoint: "No reversal point was reached before the envelope stopped the run",
      buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    });

    const result = createEnvelopeExhaustedResult({
      factBundle,
      compositionBudget: COMPOSITION_BUDGET,
      verifiedNodeIds: [ROOT_0.nodeId],
      skippedEnrichmentRows: [],
      protectedCoreRestatement: "PASS",
      servedStatementExists: false
    });

    // The run ENDS, in its own terminal state, and keeps what it produced.
    expect(result.terminal).toBe(SERVE_CRASH_CLASSES.ENVELOPE_EXHAUSTED.terminal);
    expect(result.conditionMarks).toContain("ENVELOPE_EXHAUSTED");
    expect(result.conditionMarks).toContain("SINGLE-LINEAGE");
    // And it says nothing about a maker position nobody ever wrote.
    expect(result.conditionMarks).not.toContain("UNSERVED-MAKER-POSITION");
  });
});
