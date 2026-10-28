import type { Answer, AnswerStory } from "@debateai/contract";
import { STORY_FIXTURE_ANSWER, storyFixture, storyFixtureEdge, storyFixtureNode } from "./storyFixture.js";

/**
 * Charts (design 2026-10-28): an English sample debate whose points cite two measures for the same things, the price
 * and the test score of five AI models, so the chart call plans a scatter (cost against score, cost on a log scale),
 * the shape of the owner's example. The models and their numbers are made up for the sample. The sample PDF prints it
 * (`story:sample-pdf <path> scatter`); the render tests draw it.
 */
export const STORY_CHARTS_SAMPLE_QUESTION = "Which AI model should our support team use to summarise tickets?";
export const STORY_CHARTS_SAMPLE_LANGUAGE = Object.freeze({ tag: "en", name: "English" });

function sampleNodes(): Answer["nodes"] {
  return [
    storyFixtureNode({
      id: "m-pro", claim: "Atlas Pro is the best choice: at $1.40 per task it scores 54 on the reasoning index.",
      way: "LOOKED_UP", base: 0.71, final: 0.66, maker: "Anthropic",
      review: { outcome: "agree", by: "OpenAI", reason: "The price and the score match the provider's published table." },
      locator: "provider price list, October 2026", marks: []
    }),
    storyFixtureNode({
      id: "m-max", claim: "Corvus Max is worth its price: it scores 58 on the reasoning index, at $10 per task.",
      way: "LOOKED_UP", base: 0.62, final: 0.49, maker: "OpenAI",
      review: { outcome: "agree", by: "xAI", reason: "Both figures are in the benchmark's own results." },
      locator: "benchmark results, October 2026", marks: []
    }),
    storyFixtureNode({
      id: "m-mini", claim: "Atlas Mini is the cheapest that still works: about $0.15 per task, for a score of 28.",
      way: "LOOKED_UP", base: 0.58, final: 0.41, maker: "xAI",
      review: { outcome: "agree", by: "Anthropic", reason: "The figures are right, but a score of 28 is low for long tickets." },
      locator: "provider price list, October 2026", marks: []
    }),
    storyFixtureNode({
      id: "m-lite", claim: "Corvus Lite is a fair middle ground: $0.45 per task for a score of 36.",
      way: "LOOKED_UP", base: 0.55, final: 0.44, maker: "Anthropic",
      review: { outcome: "agree", by: "OpenAI", reason: "The figures match the benchmark's table." },
      locator: "benchmark results, October 2026", marks: []
    }),
    storyFixtureNode({
      id: "m-nimbus", claim: "Nimbus 4 scores 52 at $3.80 per task, so Atlas Pro beats it on both price and score.",
      way: "LOOKED_UP", base: 0.67, final: 0.67, maker: "OpenAI",
      review: { outcome: "agree", by: "Anthropic", reason: "Correct on both figures." },
      locator: "benchmark results, October 2026", marks: []
    })
  ];
}

export const STORY_CHARTS_SAMPLE_ANSWER: Answer = {
  ...STORY_FIXTURE_ANSWER,
  answer_id: "3b0f2a52-6a7e-4d9e-9d43-1d6a2f0c8e11",
  question_line: STORY_CHARTS_SAMPLE_QUESTION,
  verdict_state: "CONTESTED",
  composed_text: [{
    segment_id: "seg:1",
    text: "Use Atlas Pro: it gives the most for the money. Corvus Max scores a little higher, at about seven times the price.",
    load_bearing: true,
    served_number_refs: []
  }],
  nodes: sampleNodes(),
  edges: [storyFixtureEdge({ from: "m-nimbus", to: "m-pro", relation: "support", strength: 0.67 })],
  residual_objections: ["Corvus Max scores higher."],
  reversal_point: "A cheaper model that scores as well as Atlas Pro."
};

const SAMPLE_POINT_NUMBERS: Readonly<Record<string, string>> = Object.freeze({
  "m-pro": "P1", "m-max": "P2", "m-lite": "P3", "m-mini": "P4", "m-nimbus": "P5"
});

const ALL = ["m-pro", "m-max", "m-mini", "m-lite", "m-nimbus"];

const SAMPLE_BODY: NonNullable<AnswerStory["story"]> = {
  shape_id: "personal-choice",
  short: {
    headline: "Our answer: use Atlas Pro to summarise your support tickets.",
    summary: "You asked which AI model your support team should use to summarise tickets. Atlas Pro gives the most for the money: it scores well on the reasoning tests the debate looked up, at a price per task your volume can carry. Corvus Max scores a little higher, but costs about seven times as much per task.",
    confidence: "How sure we are: fairly sure, because the prices and scores were looked up, but they were measured on tests, not on your tickets.",
    paths: [
      { position_ref: "m-pro", fate: "HELD_UP", line: "Atlas Pro: the best value, a strong score at a moderate price.", node_refs: ["m-pro", "m-nimbus"] },
      { position_ref: "m-max", fate: "PARTLY_HELD", line: "Corvus Max: the highest score, but the price is hard to justify for summaries.", node_refs: ["m-max"] },
      { position_ref: "m-lite", fate: "PARTLY_HELD", line: "Corvus Lite: cheap and fair, but noticeably weaker.", node_refs: ["m-lite"] },
      { position_ref: "m-mini", fate: "FELL", line: "Atlas Mini: the cheapest, but its score is too low for long tickets.", node_refs: ["m-mini"] }
    ],
    change: { text: "The answer would change if a cheaper model matched Atlas Pro's score on your own tickets.", node_refs: ["m-pro"] }
  },
  why: {
    reasons: [
      {
        text: "Atlas Pro gives the most for the money. It scores nearly twice what Atlas Mini scores, and it costs a fraction of what Corvus Max costs; Nimbus 4 costs more and scores less (P5).",
        node_refs: ALL
      },
      { text: "Corvus Max scores a little higher, but its price per task is about seven times Atlas Pro's.", node_refs: ["m-max", "m-pro"] }
    ]
  },
  long: {
    sections: [
      { title: "What you are deciding", paragraphs: [{ text: "You want summaries good enough for your agents to trust, at a price that holds up at your volume of tickets.", node_refs: ["m-pro"] }] },
      { title: "How the models compare", paragraphs: [{ text: "The debate weighed four models against each other. Atlas Pro came out strongest; Corvus Max and Corvus Lite held up in part, and Atlas Mini did not.", node_refs: ["m-pro", "m-max", "m-lite", "m-mini"] }] },
      { title: "What would change the answer", paragraphs: [{ text: "Try Atlas Pro and Corvus Lite on a week of your own tickets. If Corvus Lite's summaries are good enough, its lower price wins.", node_refs: ["m-pro", "m-lite"] }] }
    ]
  },
  reviewer_note: null
};

/** The charts the chart call plans for this story: cost against score, and how strong each model's case turned out. */
const SAMPLE_CHARTS: NonNullable<AnswerStory["charts"]> = [
  {
    after: "why.1",
    kind: "scatter",
    title: "Reasoning score against cost per task",
    x: { label: "Cost per task (USD, log scale)", source: "figure", log: true },
    y: { label: "Reasoning index score", source: "figure", log: false },
    items: [
      { label: "Atlas Pro", node_ref: "m-pro", x: { value: 1.4, text: "$1.40" }, y: { value: 54, text: "54" } },
      { label: "Corvus Max", node_ref: "m-max", x: { value: 10, text: "$10" }, y: { value: 58, text: "58" } },
      { label: "Atlas Mini", node_ref: "m-mini", x: { value: 0.15, text: "$0.15" }, y: { value: 28, text: "28" } },
      { label: "Corvus Lite", node_ref: "m-lite", x: { value: 0.45, text: "$0.45" }, y: { value: 36, text: "36" } },
      { label: "Nimbus 4", node_ref: "m-nimbus", x: { value: 3.8, text: "$3.80" }, y: { value: 52, text: "52" } }
    ]
  },
  {
    after: "long.2.1",
    kind: "bar",
    title: "How strong each model's case turned out",
    x: null,
    y: { label: "Strength", source: "strength", log: false },
    items: [
      { label: "Atlas Pro", node_ref: "m-pro", x: null, y: null },
      { label: "Corvus Max", node_ref: "m-max", x: null, y: null },
      { label: "Corvus Lite", node_ref: "m-lite", x: null, y: null },
      { label: "Atlas Mini", node_ref: "m-mini", x: null, y: null }
    ]
  }
];

export function storyChartsSample(): AnswerStory {
  const base = storyFixture("READY");
  return {
    ...base,
    answer_id: STORY_CHARTS_SAMPLE_ANSWER.answer_id,
    language: STORY_CHARTS_SAMPLE_LANGUAGE.tag,
    verdict_basis: base.verdict_basis === null ? null : {
      ...base.verdict_basis, winner_node_id: "m-pro", winner_strength: 0.66, runner_up_node_id: "m-max", runner_up_strength: 0.49, margin: 0.17
    },
    point_numbers: { ...SAMPLE_POINT_NUMBERS },
    story: structuredClone(SAMPLE_BODY),
    charts: structuredClone(SAMPLE_CHARTS)
  };
}
