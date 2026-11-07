/*
 * The mock's one English debate: "Should countries build new nuclear power, or put the money into renewables and
 * storage?". It is built FROM the website's own story fixture (apps/ui/lib/v3/storyFixture.ts): the fixture's answer
 * and story are cloned, and only the ids, the text and the cases below are replaced, so every field the contract asks
 * for keeps the fixture's realistic shape.
 *
 * The answer exercises every case the V4 map shows (apps/ui/lib/v4/trust.ts and mapModel.ts):
 *   - four story paths, one per fate: HELD_UP, PARTLY_HELD, FELL, SET_ASIDE;
 *   - review agree + LOOKED_UP + FRESH   → "sure"              (n-renew-cost, n-mix-cost, n-nuclear-build, n-nuclear-clean)
 *   - review agree + REASONING           → "sure for this case" (n-mix, n-mix-firm, n-renew, n-renew-winter)
 *   - review agree + STALE               → "agreed but dated"   (n-renew-battery)
 *   - review dispute                     → "still argued"       (n-renew-storage)
 *   - review cannot-assess               → "could not check"    (n-smr-cost)
 *   - no review (null)                   → "not checked yet"    (n-mix-land, n-smr)
 *   - a "defeat" edge aimed at a node    → "did not hold"       (n-nuclear-build defeats n-nuclear)
 *   - two residual objections and a reversal point (the "what would change it" star).
 *
 * The contract and fixture modules are passed in (server.ts finds them in the repository at run time), so this file
 * holds no machine path.
 *
 * Perplexity plan W1-7 (2026-10-30): an answer may also carry the DRAFT web fields of one case (web-seed.ts): sources
 * and the "checked looked up" flag on each point (a checked point's locator becomes its extract id), and `web.paths`
 * (each path's search, other pages with "added to researched", dig suggestions). server.ts sends them only when the
 * contract already accepts them (web-draft.ts).
 */
import { webCase, type WebCase } from "./web-seed.js";

type Maker = "OpenAI" | "Anthropic" | "xAI";
type Way = "LOOKED_UP" | "RAN" | "REASONING";
type Outcome = "agree" | "dispute" | "cannot-assess";

interface NodeSpec {
  readonly id: string;
  readonly claim: string;
  readonly way: Way;
  readonly base: number;
  readonly final: number;
  readonly maker: Maker;
  readonly review: Readonly<{ outcome: Outcome; by: Maker; reason: string }> | null;
  readonly locator: string | null;
  readonly marks?: readonly string[];
  /** Set only on the dated point: the date it was true as of, and the node reads STALE. */
  readonly staleAsOf?: string;
  readonly defeaters?: readonly string[];
}

/** The nodes, roots first (one per story path), then each root's points in tree order. */
const NODE_SPECS: readonly NodeSpec[] = [
  // Path 1 — HELD_UP
  {
    id: "n-mix",
    claim: "Do both, in proportion: put most new money into wind, solar, grids and storage, and let countries with a strong grid and an experienced regulator also build some new nuclear for firm, clean power.",
    way: "REASONING", base: 0.72, final: 0.76, maker: "Anthropic",
    review: { outcome: "agree", by: "OpenAI", reason: "The balance follows from the cost and firm-power points beneath it; it fits the evidence the debate cited." },
    locator: null
  },
  // Path 2 — PARTLY_HELD
  {
    id: "n-renew",
    claim: "Put the money into renewables and storage: they are cheaper per unit of energy and can be built far faster than new reactors.",
    way: "REASONING", base: 0.69, final: 0.61, maker: "OpenAI",
    review: { outcome: "agree", by: "Anthropic", reason: "Cheapest and fastest is well supported; relying on renewables alone is the weak part." },
    locator: null
  },
  // Path 3 — FELL (defeated)
  {
    id: "n-nuclear",
    claim: "Build new nuclear first: it is the only proven way to get round-the-clock clean power at scale.",
    way: "REASONING", base: 0.63, final: 0.22, maker: "xAI",
    review: { outcome: "dispute", by: "Anthropic", reason: "Round-the-clock output is real, but the argument ignores cost and build time." },
    locator: null,
    defeaters: ["n-nuclear-build"]
  },
  // Path 4 — SET_ASIDE
  {
    id: "n-smr",
    claim: "Wait for small modular reactors: factory-built units will make nuclear cheap and quick to build within a decade.",
    way: "REASONING", base: 0.40, final: 0.30, maker: "xAI",
    review: null, locator: null, marks: ["BRANCH-FROZEN-LOW-LEVERAGE"]
  },
  // Points under path 1
  {
    id: "n-mix-firm",
    claim: "A grid that runs mostly on wind and sun still needs firm power for long, windless winter weeks, and nuclear is one of the few low-carbon sources that can supply it.",
    way: "REASONING", base: 0.70, final: 0.70, maker: "Anthropic",
    review: { outcome: "agree", by: "xAI", reason: "Correct: long winter lulls are the hardest hours for a grid built on wind and sun." },
    locator: null
  },
  {
    id: "n-mix-cost",
    claim: "Studies of near-zero-carbon grids find that the cheapest systems pair a large share of renewables with a smaller share of firm clean power, rather than relying on either one alone.",
    way: "LOOKED_UP", base: 0.74, final: 0.74, maker: "OpenAI",
    review: { outcome: "agree", by: "Anthropic", reason: "Matches the system studies cited, which agree on the direction if not on the exact share." },
    locator: "IEA, Net Zero Roadmap, 2023 update"
  },
  {
    id: "n-mix-land",
    claim: "Nuclear plants need far less land per unit of energy than solar or wind farms, which matters in crowded countries.",
    way: "REASONING", base: 0.58, final: 0.58, maker: "xAI",
    review: null, locator: null
  },
  // Points under path 2
  {
    id: "n-renew-cost",
    claim: "Utility-scale solar and onshore wind now give the lowest cost of new electricity in most markets.",
    way: "LOOKED_UP", base: 0.81, final: 0.81, maker: "Anthropic",
    review: { outcome: "agree", by: "OpenAI", reason: "Matches the 2025 cost surveys cited." },
    locator: "Lazard, Levelized Cost of Energy+, June 2025"
  },
  {
    id: "n-renew-battery",
    claim: "Lithium-ion battery pack prices fell by about 90% between 2010 and 2023.",
    way: "LOOKED_UP", base: 0.77, final: 0.77, maker: "xAI",
    review: { outcome: "agree", by: "Anthropic", reason: "The figure is right for the period it covers, but the data stop at the end of 2023." },
    locator: "BloombergNEF battery price survey, December 2023",
    staleAsOf: "2023-12-31T00:00:00.000Z"
  },
  {
    id: "n-renew-storage",
    claim: "Batteries and long-distance power lines can already cover multi-day lulls in wind and sun at an acceptable cost.",
    way: "REASONING", base: 0.55, final: 0.38, maker: "OpenAI",
    review: { outcome: "dispute", by: "Anthropic", reason: "Today's batteries mostly cover hours, not days; storage that lasts several days is still at pilot scale." },
    locator: null
  },
  {
    id: "n-renew-winter",
    claim: "In northern countries, winter demand peaks when solar output is lowest, so renewables alone would need very large seasonal storage.",
    way: "REASONING", base: 0.66, final: 0.66, maker: "xAI",
    review: { outcome: "agree", by: "OpenAI", reason: "Correct for northern and central Europe, where demand peaks in the darkest months." },
    locator: null
  },
  // Points under path 3
  {
    id: "n-nuclear-build",
    claim: "Recent reactor projects in Western Europe and the US took 12 to 17 years and cost two to three times their budgets (Flamanville 3, Hinkley Point C, Vogtle 3 and 4).",
    way: "LOOKED_UP", base: 0.79, final: 0.79, maker: "Anthropic",
    review: { outcome: "agree", by: "xAI", reason: "The dates and overruns match the public project records cited." },
    locator: "Public project records: Flamanville 3, Hinkley Point C, Vogtle 3 and 4"
  },
  {
    id: "n-nuclear-clean",
    claim: "Over its whole life cycle, nuclear power emits about as little CO2 per unit of electricity as wind power.",
    way: "LOOKED_UP", base: 0.83, final: 0.83, maker: "OpenAI",
    review: { outcome: "agree", by: "Anthropic", reason: "Consistent with the IPCC life-cycle figures for both sources." },
    locator: "IPCC AR5 Working Group III, Annex III"
  },
  // Point under path 4
  {
    id: "n-smr-cost",
    claim: "The first small modular reactors will produce power for under $60 per megawatt-hour by the early 2030s.",
    way: "REASONING", base: 0.35, final: 0.35, maker: "xAI",
    review: { outcome: "cannot-assess", by: "OpenAI", reason: "No commercial small modular reactor has run long enough to check a cost figure." },
    locator: null
  }
];

const EDGE_SPECS: readonly Readonly<{ from: string; to: string; relation: "support" | "attack" | "defeat"; strength: number }>[] = [
  { from: "n-mix-firm", to: "n-mix", relation: "support", strength: 0.70 },
  { from: "n-mix-cost", to: "n-mix", relation: "support", strength: 0.74 },
  { from: "n-mix-land", to: "n-mix", relation: "support", strength: 0.58 },
  { from: "n-renew-cost", to: "n-renew", relation: "support", strength: 0.81 },
  { from: "n-renew-battery", to: "n-renew", relation: "support", strength: 0.77 },
  { from: "n-renew-storage", to: "n-renew", relation: "support", strength: 0.38 },
  { from: "n-renew-winter", to: "n-renew", relation: "attack", strength: 0.66 },
  { from: "n-nuclear-build", to: "n-nuclear", relation: "defeat", strength: 0.79 },
  { from: "n-nuclear-clean", to: "n-nuclear", relation: "support", strength: 0.83 },
  { from: "n-smr-cost", to: "n-smr", relation: "support", strength: 0.35 }
];

const PATH_MIX = ["n-mix", "n-mix-firm", "n-mix-cost", "n-mix-land"];
const PATH_RENEW = ["n-renew", "n-renew-cost", "n-renew-battery", "n-renew-storage", "n-renew-winter"];
const PATH_NUCLEAR = ["n-nuclear", "n-nuclear-build", "n-nuclear-clean"];
const PATH_SMR = ["n-smr", "n-smr-cost"];

/** Positions strongest first, then each position's points in tree order (the story material's numbering). */
const POINT_NUMBERS: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(
  ["n-mix", "n-renew", "n-nuclear", "n-smr", ...PATH_MIX.slice(1), ...PATH_RENEW.slice(1), ...PATH_NUCLEAR.slice(1), ...PATH_SMR.slice(1)]
    .map((id, index) => [id, `P${index + 1}`])
));

const RESIDUAL_OBJECTIONS = [
  "The cost comparison counts the price of producing electricity, but not all the extra grid lines and backup that a mostly renewable system needs.",
  "Nuclear waste storage and public acceptance were raised but not argued through; in some countries they could block new reactors whatever the cost."
];

const REVERSAL_POINT =
  "Cheap storage that can carry a grid through a whole windless winter week would remove the need for new nuclear.";

const COMPOSED_TEXT = [
  {
    segment_id: "seg:1",
    text: "Put most new money into wind, solar, grids and storage, because they are the cheapest and fastest way to add clean power. Countries that already have a strong grid and an experienced nuclear regulator should also build some new nuclear, for firm power during long windless spells.",
    load_bearing: true,
    served_number_refs: []
  },
  {
    segment_id: "seg:2",
    text: "Betting mainly on new nuclear did not hold up: recent Western reactors took more than a decade and ran far over budget.",
    load_bearing: false,
    served_number_refs: []
  },
  {
    segment_id: "seg:3",
    text: "Waiting for small modular reactors was set aside, because none is yet running commercially in Europe or North America.",
    load_bearing: false,
    served_number_refs: []
  }
];

const VERDICT_BASIS = {
  label: "SUPPORTED",
  rung: 3,
  trigger: "AT_OR_ABOVE_HIGH_CUT",
  winner_node_id: "n-mix",
  winner_strength: 0.76,
  runner_up_node_id: "n-renew",
  runner_up_strength: 0.61,
  margin: 0.15,
  disagreement: 0.1,
  thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
  confidence_band: "CAPPED",
  marks: [] as string[]
};

/** The story in plain English, written the way the owners asked (no scores, no thresholds, no engine words). */
const STORY_BODY = {
  shape_id: "general",
  short: {
    headline: "Our answer: put most new money into renewables and storage, and let countries with the right conditions also build some new nuclear.",
    summary: "You asked whether new money for clean power should go to nuclear or to renewables and storage. Our answer is: mostly renewables and storage, with some new nuclear where a country already has the grid, the regulator and the patience for it. Wind and solar are now the cheapest new electricity in most places and can be built in a year or two, so they deliver the most clean power per euro, soonest. But a grid that runs mostly on wind and sun still needs firm power for long, windless winter weeks, and today's batteries cover hours, not weeks. A smaller share of nuclear fills that gap.",
    confidence: "How sure we are: fairly sure about the direction, less sure about the exact share of nuclear, because the cost of storing power for whole weeks is still unknown.",
    paths: [
      {
        position_ref: "n-mix", fate: "HELD_UP",
        line: "Mostly renewables, plus some nuclear: held up. The cheapest clean grids pair a lot of wind and sun with a smaller share of firm power, and nuclear is one of the few firm sources without emissions.",
        node_refs: PATH_MIX
      },
      {
        position_ref: "n-renew", fate: "PARTLY_HELD",
        line: "Only renewables and storage: partly held. It is the cheapest and fastest way to add clean power, but the claim that batteries can already cover lulls of several days was disputed.",
        node_refs: PATH_RENEW
      },
      {
        position_ref: "n-nuclear", fate: "FELL",
        line: "Nuclear first: did not hold. Recent reactors in Europe and the US took 12 to 17 years and two to three times their budgets, so betting mainly on nuclear delays cutting emissions.",
        node_refs: PATH_NUCLEAR
      },
      {
        position_ref: "n-smr", fate: "SET_ASIDE",
        line: "Wait for small modular reactors: set aside. None is running commercially in Europe or North America yet, so their cost could not be weighed.",
        node_refs: PATH_SMR
      }
    ],
    change: {
      text: "The answer would change if storing power for days or weeks became cheap enough to carry a grid through a windless winter week. Then renewables and storage alone would be enough, and new nuclear would not be needed.",
      node_refs: ["n-renew-storage", "n-mix-firm"]
    }
  },
  why: {
    reasons: [
      {
        text: "Wind and solar now give the cheapest new electricity in most markets, and they can be built in one to two years. Each euro spent on them cuts emissions sooner than a euro spent on a reactor that would open in the late 2030s.",
        node_refs: ["n-renew-cost", "n-nuclear-build"]
      },
      {
        text: "A grid running mostly on wind and sun still needs firm clean power for long windless spells in winter. Batteries cover hours today, not weeks, so some firm source is still needed, and nuclear is one of the few without emissions.",
        node_refs: ["n-mix-firm", "n-renew-storage", "n-renew-winter"]
      },
      {
        text: "Building nuclear well takes an experienced regulator, a trained workforce and a strong grid. Where those exist, a smaller nuclear share lowers the total cost of a clean grid; where they do not, the money does more in renewables.",
        node_refs: ["n-mix-cost", "n-nuclear-build"]
      }
    ]
  },
  long: {
    sections: [
      {
        title: "What you are really deciding",
        paragraphs: [{
          text: "As we understand it, the question is not nuclear or renewables in the abstract, but where the next euro of public and private money does the most to cut emissions while keeping the lights on. The answer can differ from one country to another, so read what follows as a guide to the trade-offs rather than a single rule for every country.",
          node_refs: ["n-mix", "n-renew"]
        }]
      },
      {
        title: "Our answer in short",
        paragraphs: [{
          text: "Put most new money into wind, solar, grids and storage now, because they are cheaper and faster. Countries that already run reactors, or have a strong regulator and grid, should also build some new nuclear for firm power. Betting mainly on nuclear did not hold up, and waiting for small modular reactors was set aside.",
          node_refs: ["n-mix", "n-renew", "n-nuclear", "n-smr"]
        }]
      },
      {
        title: "The options we weighed",
        paragraphs: [
          {
            text: "Mostly renewables, plus some nuclear. Studies of near-zero-carbon grids find the cheapest systems combine a large share of wind and sun with a smaller share of firm clean power. Nuclear is one of the few firm sources without emissions, and it needs little land. This option held up best.",
            node_refs: PATH_MIX
          },
          {
            text: "Only renewables and storage. Solar and onshore wind are now the cheapest new electricity in most markets, and battery prices fell about 90% between 2010 and 2023. The weak point is the long winter lull: the claim that batteries and power lines can already cover several days at an acceptable cost was disputed, so this option only partly held.",
            node_refs: PATH_RENEW
          },
          {
            text: "Nuclear first. Nuclear power is as clean as wind over its life cycle, but recent reactors in Western Europe and the US took 12 to 17 years and two to three times their budgets. That record answered the case for putting nuclear first: it did not hold.",
            node_refs: PATH_NUCLEAR
          },
          {
            text: "Waiting for small modular reactors. The promise is cheap, factory-built nuclear within a decade, but none is running commercially in Europe or North America yet, so the debate could not weigh its cost and set this option aside.",
            node_refs: PATH_SMR
          }
        ]
      },
      {
        title: "What the answer depends on",
        paragraphs: [{
          text: "Two things matter most: how cheap it becomes to store power for days or weeks, and whether a country can build reactors on time and on budget. If storage gets much cheaper, the case for new nuclear weakens; if a country shows it can build reactors quickly, the nuclear share can grow.",
          node_refs: ["n-renew-storage", "n-nuclear-build"]
        }]
      },
      {
        title: "What we could not find out",
        paragraphs: [
          {
            text: "We could not check the promised costs of small modular reactors, because none has run commercially long enough to prove a figure.",
            node_refs: ["n-smr-cost"]
          },
          {
            text: "The figure for falling battery prices comes from data up to the end of 2023, so it may be out of date. The point that nuclear needs much less land was not checked by a second AI.",
            node_refs: ["n-renew-battery", "n-mix-land"]
          }
        ]
      },
      {
        title: "What would change the answer and what to watch",
        paragraphs: [{
          text: "Watch the price of long-duration storage and the delivery record of the reactors under construction now. Cheap storage lasting several days would tip the answer towards renewables alone; reactors finished on time and on budget would justify a larger nuclear share.",
          node_refs: ["n-renew-storage", "n-nuclear-build"]
        }]
      }
    ]
  },
  reviewer_note: {
    text: "The debate compared the cost of producing electricity, but not the full cost of the extra grid lines and backup that a mostly renewable system needs. Counting those would narrow the cost gap between the options somewhat. This note does not change our answer.",
    node_refs: ["n-mix-cost", "n-renew-cost"]
  }
};

const RESERVATION =
  "The summary presents the battery price fall (P9) as current, although its data stop at the end of 2023.";

export type SeedAnswerInput = Readonly<{
  answerId: string;
  runRef: string;
  question: string;
  askedAt: string;
  servedAt: string;
  /** The draft web case this answer carries (absent: today's answer, no web fields). */
  web?: WebCase;
}>;

export type StoryStatus = "WRITING" | "READY" | "READY_WITH_RESERVATION" | "UNAVAILABLE";

/** The node ids every path holds, for the README and the startup self-check. */
export const SEED_NODE_IDS: readonly string[] = NODE_SPECS.map((spec) => spec.id);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSeed(fixture: any) {
  function nodes(servedAt: string) {
    return NODE_SPECS.map((spec) => {
      const node = fixture.storyFixtureNode({
        id: spec.id,
        claim: spec.claim,
        way: spec.way,
        base: spec.base,
        final: spec.final,
        maker: spec.maker,
        review: spec.review,
        locator: spec.locator,
        marks: spec.marks ?? []
      });
      return {
        ...node,
        defeater_refs: [...(spec.defeaters ?? [])],
        staleness_state: spec.staleAsOf === undefined ? "FRESH" : "STALE",
        relevant_as_of: spec.staleAsOf ?? servedAt
      };
    });
  }

  function edges() {
    return EDGE_SPECS.map((spec) => {
      // The fixture's helper is typed for support/attack only; the defeat edge reuses its shape and swaps the relation.
      const edge = fixture.storyFixtureEdge({
        from: spec.from, to: spec.to, relation: spec.relation === "defeat" ? "attack" : spec.relation, strength: spec.strength
      });
      return { ...edge, relation: spec.relation };
    });
  }

  /** A served answer: the fixture's answer with this debate's ids, question, points and text. */
  function answer(input: SeedAnswerInput) {
    const base = structuredClone(fixture.STORY_FIXTURE_ANSWER);
    const served = {
      ...base,
      answer_id: input.answerId,
      answer_version: 1,
      run_ref: input.runRef,
      question_line: input.question,
      terminal: "SERVED",
      verdict_state: "SUPPORTED",
      verdict_unavailable: null,
      confidence_band: "CAPPED",
      band_ceiling: {
        ...base.band_ceiling,
        basis: { LOOKED_UP: 5, RAN: 0, REASONING: 9 },
        source_ref: "mock:v4-seed"
      },
      serve_state: "COMPOSED",
      composed_text: structuredClone(COMPOSED_TEXT),
      nodes: nodes(input.servedAt),
      edges: edges(),
      residual_objections: [...RESIDUAL_OBJECTIONS],
      reversal_point: REVERSAL_POINT,
      tier_provenance_ref: "mock:v4-seed",
      cost_envelope: { ...base.cost_envelope, consumed_model_attempts: 46 },
      ledger_digest_handle: `ledger:${input.answerId}`,
      inspection_handle: `inspection:${input.answerId}`,
      as_of: input.askedAt,
      staleness_state: "FRESH",
      relevant_as_of: input.servedAt
    };
    if (input.web === undefined) return served;
    const web = webCase(input.web, SEED_NODE_IDS);
    return {
      ...served,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodes: served.nodes.map((node: any) => ({ ...node, ...web.nodes[node.node_id] })),
      web: { paths: web.paths }
    };
  }

  /** The story read for an answer, in one of the four statuses. Only READY* carries the text. */
  function story(answerId: string, status: StoryStatus, writtenAt: string) {
    const read = fixture.storyFixture(status);
    read.answer_id = answerId;
    read.answer_version = 1;
    if (status === "READY" || status === "READY_WITH_RESERVATION") {
      read.shape = { id: "general", title: "General" };
      read.pack = { version: "2026-10-17.3", fingerprint: read.pack.fingerprint };
      read.written_at = writtenAt;
      read.language = "en";
      read.reservation = status === "READY_WITH_RESERVATION" ? RESERVATION : null;
      read.verdict_basis = structuredClone(VERDICT_BASIS);
      read.point_numbers = { ...POINT_NUMBERS };
      read.story = structuredClone(STORY_BODY);
    }
    return read;
  }

  /** The owner's record of the answer-writing step: the planned models wrote and checked it, nothing was cut short. */
  function disclosure(answerId: string) {
    return { ...fixture.storyFixtureDisclosure("served"), answer_id: answerId, answer_version: 1 };
  }

  return { answer, story, disclosure };
}
