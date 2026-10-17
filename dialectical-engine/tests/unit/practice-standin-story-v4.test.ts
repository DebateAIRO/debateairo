import { describe, expect, it } from "vitest";
import {
  STORYTELLER_CONTRACT_ID,
  STORYTELLER_V4_CONTRACT_ID,
  STORY_CHECKER_CONTRACT_ID,
  STORY_CHECKER_V4_CONTRACT_ID,
  buildStoryMaterial,
  classifyStoryContent,
  loadStoryPack,
  parseCheckerVerdict,
  resolveStoryPackDir
} from "@debateai/story";
import {
  practiceCannedStory,
  practiceStandInStoryContent,
  practiceStoryPolicy,
  practiceStorySnapshot
} from "../../tools/preview-practice/practice-lanes.js";
import { PRACTICE_QUESTIONS } from "../../tools/preview-practice/practice-questions.js";

/**
 * Story v4 (engine redesign R1d, absorbing LG-D Task 8's stand-in change): the formats stand-in answers the OTHER story
 * job by either version of its contract, the checker in its own version's form, and every v3 answer keeps its bytes.
 */
const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
const Q = PRACTICE_QUESTIONS[0]!;
const TODAYS_CHECKER = JSON.stringify({ satisfied: true, objection: null, criteria: {
  faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
  citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
} });

describe("the formats stand-in answers story contracts v3 and v4 (R1d)", () => {
  it("v3: today's canned story and today's checker verdict, byte for byte; anything else gets {}", () => {
    expect(practiceStandInStoryContent(PACK, Q, STORYTELLER_CONTRACT_ID)).toBe(practiceCannedStory(PACK, Q));
    expect(practiceStandInStoryContent(PACK, Q, STORY_CHECKER_CONTRACT_ID)).toBe(TODAYS_CHECKER);
    expect(practiceStandInStoryContent(PACK, Q, "story.checker.v5")).toBe("{}");
    expect(practiceStandInStoryContent(PACK, Q, "serve.synthesizer.v4")).toBe("{}");
  });

  it("v4 checker: the satisfied verdict with misleading false, which the v4 schema accepts", () => {
    const content = practiceStandInStoryContent(PACK, Q, STORY_CHECKER_V4_CONTRACT_ID);
    expect(JSON.parse(content)).toEqual({ ...JSON.parse(TODAYS_CHECKER), misleading: false });
    expect(parseCheckerVerdict(content, undefined, true)).toMatchObject({ satisfied: true, misleading: false });
  });

  it("v4 storyteller: the canned story, accepted against the v4 material (code sets shape_id)", () => {
    const content = practiceStandInStoryContent(PACK, Q, STORYTELLER_V4_CONTRACT_ID);
    expect(content).toBe(practiceCannedStory(PACK, Q));
    const snapshot = practiceStorySnapshot({ question: Q, runId: "11111111-0000-4000-8000-000000000001",
      workItemId: "11111111-0000-4000-8000-000000000002" });
    const built = buildStoryMaterial({ snapshot: snapshot as never, enrichment: new Map(),
      budgetBytes: practiceStoryPolicy().materialBudget.high, shapeIds: new Set(PACK.shapes.map((shape) => shape.id)),
      v4: { shapeId: "general" } });
    if (built.kind !== "OK") throw new Error("material too large");
    expect(built.index.fixedShapeId).toBe("general");
    expect(classifyStoryContent(content, built.index)).toMatchObject({ parseStatus: "PARSED" });
  });
});
