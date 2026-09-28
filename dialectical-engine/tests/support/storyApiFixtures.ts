import type { StoryBody, StoryVerdictBasis } from "@debateai/contract";
import type { StoredStory } from "../../packages/story/src/repository.js";

/** One answer id the story API tests share; the route validates it as a UUID. */
export const STORY_TEST_ANSWER_ID = "22222222-2222-4222-8222-222222222222";
export const STORY_TEST_RUN_ID = "11111111-1111-4111-8111-111111111111";

export const STORY_TEST_BODY: StoryBody = {
  shape_id: "money-decision",
  short: {
    headline: "Keep the plan, but check the rent first.",
    summary: "The debate weighed the plan against its main objection. The plan held up, but the rent question could still change it.",
    confidence: "Fairly sure, as long as the rent stays close to what you pay now.",
    paths: [{
      position_ref: "node:position",
      fate: "HELD_UP",
      line: "Keep the plan: it held up against the main objection.",
      node_refs: ["node:position"]
    }],
    change: { text: "A verified counter-example to the plan would change the answer.", node_refs: ["node:defeater"] }
  },
  why: {
    reasons: [{ text: "The plan's main objection was answered: the rent rise it feared is smaller than the pay rise.", node_refs: ["node:position", "node:defeater"] }]
  },
  long: {
    sections: [
      { title: "What you are really trying to decide", paragraphs: [{ text: "Whether the plan still makes sense.", node_refs: ["node:position"] }] },
      { title: "The verdict in one paragraph", paragraphs: [{ text: "The plan held up, narrowly.", node_refs: ["node:position", "node:defeater"] }] },
      { title: "The paths explored", paragraphs: [{ text: "One position and one objection were weighed.", node_refs: ["node:defeater"] }] }
    ]
  },
  reviewer_note: null
};

export const STORY_TEST_BASIS: StoryVerdictBasis = {
  label: "CONTESTED",
  rung: 4,
  trigger: "MID_BAND",
  winner_node_id: "node:position",
  winner_strength: 0.64,
  runner_up_node_id: "node:defeater",
  runner_up_strength: 0.58,
  margin: 0.06,
  disagreement: 0.12,
  thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
  confidence_band: null,
  marks: []
};

export function storedStoryRecord(overrides: Partial<StoredStory> = {}): StoredStory {
  return {
    storyId: "33333333-3333-4333-8333-333333333333",
    runId: STORY_TEST_RUN_ID,
    answerId: STORY_TEST_ANSWER_ID,
    answerVersion: 1,
    outcome: "READY",
    failureCode: null,
    shapeId: "money-decision",
    packVersion: "2026-09-26.1",
    packFingerprint: "e4a5f9d6b9cb4e6310c15b2cc06830fe09b7b477239e6e2229102c406f318c32",
    storytellerLineage: {
      maker: "OpenAI", model_id: "gpt-5.6-sol", transport: "openai-compatible-http", provider_ref: "provider:openai"
    },
    checkerLineage: {
      maker: "Anthropic", model_id: "claude-opus-5", transport: "openai-compatible-http", provider_ref: "provider:anthropic"
    },
    rounds: 1,
    artifactRefs: ["artifact:story:storyteller:1", "artifact:story:checker:1"],
    body: STORY_TEST_BODY,
    reservation: null,
    verdictBasis: STORY_TEST_BASIS,
    pointNumbers: { "node:position": "P1", "node:defeater": "P2" },
    languageTag: "en",
    createdAt: new Date("2026-09-26T10:04:00.000Z"),
    ...overrides
  };
}
