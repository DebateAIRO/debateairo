import type { Answer, AnswerStory } from "@debateai/contract";
import { STORY_FIXTURE_ANSWER, storyFixture, storyFixtureEdge, storyFixtureNode } from "./storyFixture.js";

/**
 * Tables (data blocks, 2026-10-30): an English sample debate that picks among three named phones, the kind of question
 * whose report carries every block: a bar chart of the update years the claims state, a comparison table, a pros and
 * cons list, and the ranking of the three answers. The phones' figures are made up for the sample. The sample PDF prints
 * it (`story:sample-pdf <path> tables`); the report tests read it.
 */
export const STORY_TABLES_SAMPLE_QUESTION = "Which phone is the most secure: the iPhone 17, the Galaxy S24 or the Oppo Reno 12?";
export const STORY_TABLES_SAMPLE_LANGUAGE = Object.freeze({ tag: "en", name: "English" });

function sampleNodes(): Answer["nodes"] {
  return [
    storyFixtureNode({
      id: "p-iphone", claim: "The iPhone 17 is the most secure of the three: Apple promises at least 7 years of security updates, and every model has a dedicated security chip.",
      way: "LOOKED_UP", base: 0.72, final: 0.68, maker: "Anthropic",
      review: { outcome: "agree", by: "OpenAI", reason: "Apple's support pages state both." },
      locator: "manufacturer support pages, October 2026", marks: []
    }),
    storyFixtureNode({
      id: "p-s24", claim: "The Galaxy S24 is the most secure: Samsung promises 7 years of security updates, and Knox Vault isolates its keys in hardware.",
      way: "LOOKED_UP", base: 0.66, final: 0.63, maker: "OpenAI",
      review: { outcome: "agree", by: "xAI", reason: "Both are in Samsung's own announcement." },
      locator: "manufacturer announcement, January 2024", marks: []
    }),
    storyFixtureNode({
      id: "p-reno", claim: "The Oppo Reno 12 is secure enough: it gets 4 years of security patches and encrypts its storage by default.",
      way: "LOOKED_UP", base: 0.48, final: 0.39, maker: "xAI",
      review: { outcome: "agree", by: "Anthropic", reason: "The patch promise matches Oppo's policy page." },
      locator: "manufacturer policy page, 2026", marks: []
    }),
    storyFixtureNode({
      id: "pt-bounty", claim: "Apple pays up to $2,000,000 for a working iPhone exploit chain, so serious flaws are reported and fixed quickly.",
      way: "LOOKED_UP", base: 0.64, final: 0.61, maker: "OpenAI",
      review: { outcome: "agree", by: "Anthropic", reason: "The top reward is on Apple's bounty page." },
      locator: "bug bounty page, 2026", marks: []
    }),
    storyFixtureNode({
      id: "pt-second-hand", claim: "An iPhone 17 bought second-hand may have only 5 years of updates left.",
      way: "REASONING", base: 0.45, final: 0.42, maker: "xAI",
      review: { outcome: "agree", by: "OpenAI", reason: "It follows from the promise being counted from release." },
      locator: null, marks: []
    }),
    storyFixtureNode({
      id: "pt-monthly", claim: "Samsung ships security patches monthly for the S24, about 30 days after Google publishes them.",
      way: "LOOKED_UP", base: 0.6, final: 0.57, maker: "Anthropic",
      review: { outcome: "agree", by: "OpenAI", reason: "Samsung's security bulletins show the monthly cadence." },
      locator: "security bulletins, 2026", marks: []
    }),
    storyFixtureNode({
      id: "pt-modem", claim: "Some regional S24 models used a modem that had a critical flaw in 2024, fixed only after several months.",
      way: "LOOKED_UP", base: 0.5, final: 0.45, maker: "OpenAI",
      review: { outcome: "dispute", by: "xAI", reason: "The flaw was real, but it was patched within the year." },
      locator: "security advisory, 2024", marks: []
    }),
    storyFixtureNode({
      id: "pt-slow", claim: "Oppo's patches for the Reno line arrive about 2 months after Google publishes them.",
      way: "LOOKED_UP", base: 0.61, final: 0.58, maker: "Anthropic",
      review: { outcome: "agree", by: "OpenAI", reason: "The bulletin dates bear it out." },
      locator: "security bulletins, 2026", marks: []
    })
  ];
}

export const STORY_TABLES_SAMPLE_ANSWER: Answer = {
  ...STORY_FIXTURE_ANSWER,
  answer_id: "7c2e9b14-3f5d-4a8e-b1c6-9d0e2f4a6b88",
  question_line: STORY_TABLES_SAMPLE_QUESTION,
  verdict_state: "CONTESTED",
  composed_text: [{
    segment_id: "seg:1",
    text: "The iPhone 17, narrowly: the Galaxy S24 promises as many years of updates, and the Oppo Reno 12 falls behind on both.",
    load_bearing: true,
    served_number_refs: []
  }],
  nodes: sampleNodes(),
  edges: [
    storyFixtureEdge({ from: "pt-bounty", to: "p-iphone", relation: "support", strength: 0.61 }),
    storyFixtureEdge({ from: "pt-second-hand", to: "p-iphone", relation: "attack", strength: 0.42 }),
    storyFixtureEdge({ from: "pt-monthly", to: "p-s24", relation: "support", strength: 0.57 }),
    storyFixtureEdge({ from: "pt-modem", to: "p-s24", relation: "attack", strength: 0.45 }),
    storyFixtureEdge({ from: "pt-slow", to: "p-reno", relation: "attack", strength: 0.58 })
  ],
  residual_objections: ["The Galaxy S24 promises as many years of updates."],
  reversal_point: "A Samsung record of faster fixes than Apple's for the same kind of flaw."
};

const SAMPLE_POINT_NUMBERS: Readonly<Record<string, string>> = Object.freeze({
  "p-iphone": "P1", "p-s24": "P2", "p-reno": "P3", "pt-bounty": "P4", "pt-second-hand": "P5",
  "pt-monthly": "P6", "pt-modem": "P7", "pt-slow": "P8"
});

const PHONES = ["p-iphone", "p-s24", "p-reno"];

const SAMPLE_BODY: NonNullable<AnswerStory["story"]> = {
  shape_id: "general",
  short: {
    headline: "Our answer: the iPhone 17, narrowly ahead of the Galaxy S24.",
    summary: "You asked which of three phones is the most secure. The iPhone 17 came out ahead: it promises at least seven years of updates, keeps its keys in a dedicated chip, and Apple pays well for the flaws people find. The Galaxy S24 was close behind with the same seven years, and the Oppo Reno 12 fell back on slower patches.",
    confidence: "How sure we are: fairly sure of the order, less sure of the gap between the first two, which was small.",
    paths: [
      { position_ref: "p-iphone", fate: "HELD_UP", line: "iPhone 17: the most secure, by a small margin.", node_refs: ["p-iphone", "pt-bounty"] },
      { position_ref: "p-s24", fate: "PARTLY_HELD", line: "Galaxy S24: as many years of updates, with an uneven record on fixes.", node_refs: ["p-s24", "pt-modem"] },
      { position_ref: "p-reno", fate: "FELL", line: "Oppo Reno 12: fewer years of patches, and they arrive later.", node_refs: ["p-reno", "pt-slow"] }
    ],
    change: { text: "The answer would change if Samsung showed it fixes serious flaws faster than Apple does.", node_refs: ["p-s24", "pt-monthly"] }
  },
  why: {
    reasons: [
      { text: "The iPhone 17 and the Galaxy S24 both promise seven years of updates, while the Oppo Reno 12 promises four.", node_refs: PHONES },
      { text: "What separated the first two was how quickly serious flaws get fixed: Apple's large rewards bring them in fast (P4), while one S24 modem flaw took months (P7).", node_refs: ["p-iphone", "p-s24", "pt-bounty", "pt-modem", "pt-monthly", "pt-second-hand", "p-reno", "pt-slow"] }
    ]
  },
  long: {
    sections: [
      { title: "What you are deciding", paragraphs: [{ text: "You want the phone least likely to leave you exposed over the years you will keep it.", node_refs: ["p-iphone"] }] },
      { title: "How the three phones compare", paragraphs: [{ text: "The debate compared how long each phone is updated, how it protects its keys, and how quickly patches arrive.", node_refs: [...PHONES, "pt-monthly", "pt-slow"] }] },
      { title: "What would change the answer", paragraphs: [{ text: "A record showing Samsung fixing serious flaws faster than Apple would put the Galaxy S24 first.", node_refs: ["p-s24"] }] }
    ]
  },
  reviewer_note: null
};

const SAMPLE_CHARTS: NonNullable<AnswerStory["charts"]> = [
  {
    after: "why.1",
    kind: "bar",
    title: "Years of security updates each phone is promised",
    x: null,
    y: { label: "Years of security updates", source: "figure", log: false },
    items: [
      { label: "iPhone 17", node_ref: "p-iphone", x: null, y: { value: 7, text: "7 years" } },
      { label: "Galaxy S24", node_ref: "p-s24", x: null, y: { value: 7, text: "7 years" } },
      { label: "Oppo Reno 12", node_ref: "p-reno", x: null, y: { value: 4, text: "4 years" } }
    ]
  }
];

const SAMPLE_TABLES: NonNullable<AnswerStory["tables"]> = [
  {
    kind: "ranking",
    placement: "why",
    rows: [
      { node_ref: "p-iphone", won: true, close: false },
      { node_ref: "p-s24", won: false, close: true },
      { node_ref: "p-reno", won: false, close: false }
    ]
  },
  {
    kind: "compare",
    after: "long.2.1",
    title: "The three phones side by side",
    columns: ["Security updates", "Key protection", "Patch speed"],
    rows: [
      { label: "iPhone 17", cells: [
        { text: "at least 7 years of security updates", node_ref: "p-iphone" },
        { text: "every model has a dedicated security chip", node_ref: "p-iphone" },
        null
      ] },
      { label: "Galaxy S24", cells: [
        { text: "7 years of security updates", node_ref: "p-s24" },
        { text: "Knox Vault isolates its keys in hardware", node_ref: "p-s24" },
        { text: "about 30 days after Google publishes them", node_ref: "pt-monthly" }
      ] },
      { label: "Oppo Reno 12", cells: [
        { text: "4 years of security patches", node_ref: "p-reno" },
        null,
        { text: "about 2 months after Google publishes them", node_ref: "pt-slow" }
      ] }
    ]
  },
  {
    kind: "pros_cons",
    after: "why.2",
    title: "What argued for and against each phone",
    options: [
      { label: "iPhone 17", position_ref: "p-iphone",
        pros: [{ text: "Apple pays up to $2,000,000 for a working iPhone exploit chain", node_ref: "pt-bounty" }],
        cons: [{ text: "An iPhone 17 bought second-hand may have only 5 years of updates left.", node_ref: "pt-second-hand" }] },
      { label: "Galaxy S24", position_ref: "p-s24",
        pros: [{ text: "Samsung ships security patches monthly for the S24", node_ref: "pt-monthly" }],
        cons: [{ text: "Some regional S24 models used a modem that had a critical flaw in 2024", node_ref: "pt-modem" }] },
      { label: "Oppo Reno 12", position_ref: "p-reno",
        pros: [],
        cons: [{ text: "Oppo's patches for the Reno line arrive about 2 months after Google publishes them.", node_ref: "pt-slow" }] }
    ]
  }
];

export function storyTablesSample(): AnswerStory {
  const base = storyFixture("READY");
  return {
    ...base,
    answer_id: STORY_TABLES_SAMPLE_ANSWER.answer_id,
    language: STORY_TABLES_SAMPLE_LANGUAGE.tag,
    verdict_basis: base.verdict_basis === null ? null : {
      ...base.verdict_basis, winner_node_id: "p-iphone", winner_strength: 0.68, runner_up_node_id: "p-s24", runner_up_strength: 0.63, margin: 0.05
    },
    point_numbers: { ...SAMPLE_POINT_NUMBERS },
    story: structuredClone(SAMPLE_BODY),
    charts: structuredClone(SAMPLE_CHARTS),
    tables: structuredClone(SAMPLE_TABLES)
  };
}
