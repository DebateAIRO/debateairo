import { describe, expect, it } from "vitest";
import { buildFactBundle, createEnvelopeExhaustedResult, SERVE_CRASH_CLASSES } from "@debateai/serve";
import {
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
 * WHY THIS IS A JOINT TEST AND NOT A DRIVEN RUN. `WalkingSkeletonRunner.execute`
 * needs a `Pool`, and no pool-free harness for it exists anywhere in the
 * repository — every `new WalkingSkeletonRunner` is in the integration or
 * acceptance trees. Faking the dozens of statements it issues would build
 * exactly the kind of private double that rots unseen, which this mission has
 * already paid for once. So the decision is EXTRACTED and driven directly, with
 * the state the refusal produces, all the way to the terminal the answer
 * reaches. The whole-run confirmation stays in the Docker spec.
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

describe("2(a) — the disclosure of maker positions a run could not afford", () => {
  it("still discloses the unserved root when BOTH were authored", () => {
    const disclosure = buildMakerPositionDisclosure({
      effectiveMakerCount: 2,
      authoredMakerPositions: [ROOT_0, ROOT_1],
      servedRoot: ROOT_0,
      monoMakerConditionMarks: MONO_MARKS
    });

    expect(disclosure.conditionMarks).toEqual(["UNSERVED-MAKER-POSITION"]);
    expect(disclosure.records).toHaveLength(1);
    expect(disclosure.records[0]).toMatchObject({
      mark: "UNSERVED-MAKER-POSITION",
      subjectRef: ROOT_0.nodeId
    });
    expect(disclosure.records[0]!.reason).toContain(ROOT_1.nodeId);
  });

  it("asserts NOTHING about a maker position that was never authored", () => {
    // The state a spend stop on root 1 leaves behind. There is no second
    // position to disclose, so claiming one would be a falsehood on the answer —
    // and demanding one, as the code did, throws away a root that was paid for.
    const disclosure = buildMakerPositionDisclosure({
      effectiveMakerCount: 2,
      authoredMakerPositions: [ROOT_0],
      servedRoot: ROOT_0,
      monoMakerConditionMarks: MONO_MARKS
    });

    expect(disclosure.conditionMarks).toEqual([]);
    expect(disclosure.records).toEqual([]);
  });

  it("does not borrow the MONO-MAKER marks for a multi-maker run that was cut short", () => {
    // `SINGLE-LINEAGE` carries the reason `MONO_MAKER_RUN`, and this run was not
    // one: it was a two-maker run that could not pay for its second maker. The
    // envelope terminal's own record names that, truthfully, below.
    const disclosure = buildMakerPositionDisclosure({
      effectiveMakerCount: 2,
      authoredMakerPositions: [ROOT_0],
      servedRoot: ROOT_0,
      monoMakerConditionMarks: MONO_MARKS
    });

    expect(disclosure.conditionMarks).not.toContain("SINGLE-LINEAGE");
    expect(disclosure.records.map((record) => record.mark)).not.toContain("SINGLE-LINEAGE");
  });

  it("leaves the genuine mono-maker run exactly as it was", () => {
    const disclosure = buildMakerPositionDisclosure({
      effectiveMakerCount: 1,
      authoredMakerPositions: [ROOT_0],
      servedRoot: ROOT_0,
      monoMakerConditionMarks: MONO_MARKS,
      monoMakerRecords: MONO_RECORDS
    });

    expect(disclosure.conditionMarks).toEqual([...MONO_MARKS]);
    expect(disclosure.records.map((record) => record.mark))
      .toEqual(["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"]);
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
  it("serves root 0 through the envelope terminal, with no invented position", () => {
    const disclosure = buildMakerPositionDisclosure({
      effectiveMakerCount: 2,
      authoredMakerPositions: [ROOT_0],
      servedRoot: ROOT_0,
      monoMakerConditionMarks: MONO_MARKS
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
      compositionBudget: { segments: 1, sourceRef: "test" } as never,
      verifiedNodeIds: [ROOT_0.nodeId],
      skippedEnrichmentRows: [],
      protectedCoreRestatement: "PASS",
      servedStatementExists: false
    });

    // The run ENDS, in its own terminal state, and keeps what it produced.
    expect(result.terminal).toBe(SERVE_CRASH_CLASSES.ENVELOPE_EXHAUSTED.terminal);
    expect(result.conditionMarks).toContain("ENVELOPE_EXHAUSTED");
    // And it says nothing about a maker position nobody ever wrote.
    expect(result.conditionMarks).not.toContain("UNSERVED-MAKER-POSITION");
  });
});
