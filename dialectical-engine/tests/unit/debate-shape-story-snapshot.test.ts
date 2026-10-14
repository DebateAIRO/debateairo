import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProviderGateway } from "@debateai/providers";
import type { StoryCostFallback, StoryStepLease } from "@debateai/story";
import {
  buildStoryRunSnapshot, storyAlsoRaisedFrom, storyAnswersNoteFrom, type StorySnapshotSource
} from "../../apps/runner/src/story-snapshot.js";

/**
 * Debate shape P2c: the map's unchosen points reach the story snapshot, and so does the
 * owner's one-sentence note when the answers came from a map fallback; no map, no key.
 */

const ROOT = "11111111-1111-4111-8111-111111111111";
const provider: ProviderGateway = { call: async () => { throw new Error("unused"); } };
const stepLease: StoryStepLease = (use) => use();
const costFallback: StoryCostFallback = async ({ planned, request, call }) => ({
  result: await call(planned, request), servedBy: planned
});
const UUID_SHAPED = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

function source(overrides: Partial<StorySnapshotSource> = {}): StorySnapshotSource {
  return {
    runId: "run-1", workItemId: "work-1", answerId: "answer-1", answerVersion: 1, questionLine: "Should we?",
    argumentLanguage: { tag: "en", name: "English" }, compositionBudgetTier: "low",
    verdict: { label: "SUPPORTED", rung: 3, trigger: "AT_OR_ABOVE_HIGH_CUT" },
    servedRootNodeId: ROOT, servedStrength: 0.8, runnerUp: null,
    margin: { kind: "ABSENT", reason: "ONE_POSITION" }, disagreement: { kind: "MEASURED", value: 0.05 },
    thresholds: { gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 },
    confidenceBand: "FULL", answerMarks: [], servedSegments: [{ text: "Yes." }],
    authored: [{
      nodeId: ROOT, statement: "Yes.", provenanceRef: "artifact-root", wayOfKnowing: "REASONING",
      reversalPoint: "Unless not.", maker: "maker-a", panelDispersion: 0.05
    }],
    positionNodeIds: new Set([ROOT]),
    baseStrengths: [{ nodeId: ROOT, baseStrength: 0.8 }],
    finalStrengths: [{ nodeId: ROOT, strength: 0.8 }],
    arrows: [], arrowOrder: [], sensitivity: [], conditionMarkRecords: [],
    resolveProvider: () => ({ provider, providerRef: "provider:a" }),
    stepLease,
    costFallback,
    ...overrides
  };
}

const MAP = {
  keyPoints: [
    { keyPointId: "kp01", claim: "Chosen point.", makers: ["A", "B"] },
    { keyPointId: "kp02", claim: "Raised by three makers.", makers: ["A", "B", "C"] },
    { keyPointId: "kp03", claim: `A point quoting ${ROOT} by id.`, makers: ["C", "C"] }
  ],
  choice: { alsoRaised: ["kp02", "kp03", "kp99"] }
} as const;

describe("debate shape P2c — the story snapshot's also-raised points", () => {
  it("reads the choice's also-raised ids in order, with distinct makers, skipping unknown ids", () => {
    const items = storyAlsoRaisedFrom(MAP);
    expect(items?.map((item) => item.raisedBy)).toEqual([3, 1]);
    expect(items?.[0]?.claim).toBe("Raised by three makers.");
    // Node ids never reach the material (the snapshot's own rule for free text).
    expect(items?.[1]?.claim).not.toMatch(UUID_SHAPED);
  });

  it("has nothing to say without a map or without a choice", () => {
    expect(storyAlsoRaisedFrom(null)).toBeUndefined();
    expect(storyAlsoRaisedFrom({ keyPoints: MAP.keyPoints, choice: null })).toBeUndefined();
  });

  it("passes the points to the snapshot, and leaves the key out when there are none", () => {
    expect(buildStoryRunSnapshot(source({ alsoRaised: storyAlsoRaisedFrom(MAP) })).alsoRaised)
      .toEqual([{ claim: "Raised by three makers.", raisedBy: 3 }, { claim: "A point quoting (a point) by id.", raisedBy: 1 }]);
    expect("alsoRaised" in buildStoryRunSnapshot(source())).toBe(false);
    expect("alsoRaised" in buildStoryRunSnapshot(source({ alsoRaised: undefined }))).toBe(false);
  });

  // Owner ruling C-STORY (pre-flight PF-C6).
  it("owes the story a note only when the answers argued came from a map fallback", () => {
    expect(storyAnswersNoteFrom(null, false)).toBeUndefined();
    expect(storyAnswersNoteFrom({ kind: "MAP", marks: [] }, false)).toBeUndefined();
    // The map's other fallbacks change how the map was made, not which answers were argued.
    expect(storyAnswersNoteFrom({
      kind: "MAP", marks: [{ mark: "MAP_ANGLES_FALLBACK" }, { mark: "MAP_MERGE_FALLBACK" }, { mark: "MAP_CHOOSE_FALLBACK" }]
    }, false)).toBeUndefined();
    expect(storyAnswersNoteFrom({ kind: "UNAVAILABLE", marks: [{ mark: "MAP_UNAVAILABLE_TODAYS_OPENING" }] }, true))
      .toBe("MAP_UNAVAILABLE");
    expect(storyAnswersNoteFrom({ kind: "UNAVAILABLE", marks: [] }, false)).toBe("MAP_UNAVAILABLE");
    expect(storyAnswersNoteFrom({ kind: "MAP", marks: [{ mark: "ANSWERS_FILLED" }] }, false)).toBe("ANSWERS_FILLED");
    expect(storyAnswersNoteFrom({ kind: "MAP", marks: [{ mark: "CHOOSE_QUOTA_FILLED" }, { mark: "CHOOSE_QUOTA_FILLED" }] }, false))
      .toBe("ANSWERS_FILLED");
    // Today's opening argued after all (the map gave fewer than two positions): that sentence wins.
    expect(storyAnswersNoteFrom({ kind: "MAP", marks: [{ mark: "ANSWERS_FILLED" }] }, true)).toBe("MAP_UNAVAILABLE");
  });

  it("passes the note to the snapshot, leaves the key out without one, and still hands the story no shape mark", () => {
    const noted = buildStoryRunSnapshot(source({ answersNote: "ANSWERS_FILLED", answerMarks: ["ANSWERS_FILLED"] }));
    expect(noted.answersNote).toBe("ANSWERS_FILLED");
    // STORY_OMITTED_MARKS is unchanged: the code never reaches the story, only the note's meaning does.
    expect(noted.verdictBasis.marks).toEqual([]);
    expect("answersNote" in buildStoryRunSnapshot(source())).toBe(false);
    expect("answersNote" in buildStoryRunSnapshot(source({ answersNote: undefined }))).toBe(false);
  });

  it("is wired at the runner's one story snapshot", () => {
    const runner = readFileSync("apps/runner/src/index.ts", "utf8");
    const start = runner.indexOf("input: buildStoryRunSnapshot({");
    expect(start).toBeGreaterThan(0);
    // The call's own arguments: up to the next statement the hook makes after building the snapshot.
    const call = runner.slice(start, start + 8_000);
    expect(call).toContain("positionNodeIds: makerPositionNodeIds,");
    // Pre-flight PF-C11: also_raised only when the map's own answers were argued. Ruling C-TWO: that rule is the one
    // shared helper the debate page's map view also calls (mapAnswersArgued), never a second copy of the threshold.
    expect(runner).toContain(
      "const shapeMapArgued = shapeMapPositions !== null && mapAnswersArgued(shapeMapPositions.length);"
    );
    expect(call).toContain("alsoRaised: storyAlsoRaisedFrom(shapeMapArgued ? debateShapeMap : null),");
    expect(call.indexOf("alsoRaised: storyAlsoRaisedFrom(")).toBeGreaterThan(call.indexOf("positionNodeIds: makerPositionNodeIds,"));
    // Pre-flight PF-C6: the note reads the map's whole result, never debateShapeMap (null on a fallback).
    expect(call).toContain("answersNote: storyAnswersNoteFrom(shapeMapResult,");
    expect(call).toContain("shapeRun !== null && !shapeMapArgued)");
    expect(call).not.toContain("storyAnswersNoteFrom(debateShapeMap");
    expect(call.indexOf("answersNote: storyAnswersNoteFrom(")).toBeGreaterThan(call.indexOf("alsoRaised: storyAlsoRaisedFrom("));
  });
});
