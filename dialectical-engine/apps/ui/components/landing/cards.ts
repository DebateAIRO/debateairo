/* The four-turn exchange the design document puts on the landing page.
   Content, scores, turn order and the cascade geometry (rotation, x-offset,
   negative top margin) are the document's own values. */

export type ExchangeCard = {
  role: "REASONING" | "PRO" | "CON";
  arrow: string;
  /** Stance key into the token contract: --pro-*, --con-*, --reasoning-*. */
  stance: "pro" | "con" | "reasoning";
  base: number;
  final: number;
  turn: string;
  /** Cascade geometry — degrees, px, px. */
  rot: number;
  dx: number;
  mt: number;
  author: string;
  authorKey: ModelKey;
  reviewer: string;
  reviewerKey: ModelKey;
  review: "AGREED" | "DISPUTED";
  text: string;
};

export type ModelKey = "claude" | "gpt" | "gemini";

const A_CLAUDE = "Anthropic · Claude · claude-opus-5";
const A_GPT = "OpenAI · GPT · gpt-5.6-sol";
const A_GEMINI = "Google · Gemini · gemini-3-ultra";

export const EXCHANGE_CARDS: readonly ExchangeCard[] = [
  {
    role: "REASONING",
    arrow: "◆",
    stance: "reasoning",
    base: 94,
    final: 94,
    turn: "01",
    rot: -1.7,
    dx: -26,
    mt: 0,
    author: A_GPT,
    authorKey: "gpt",
    reviewer: A_CLAUDE,
    reviewerKey: "claude",
    review: "AGREED",
    text: "Remote-first companies should generally use location-independent salary bands for engineers performing equivalent work, while allowing transparent adjustments for legally required costs, scarce skills, and role scope."
  },
  {
    role: "PRO",
    arrow: "↑",
    stance: "pro",
    base: 95,
    final: 95,
    turn: "02",
    rot: 1.3,
    dx: 20,
    mt: -54,
    author: A_CLAUDE,
    authorKey: "claude",
    reviewer: A_GPT,
    reviewerKey: "gpt",
    review: "DISPUTED",
    text: "Remote-first companies should pay a single global rate for a given role and level, because compensation is owed for the work delivered rather than for the worker’s postal code: two engineers at the same level producing comparable value contribute equally to the firm’s output."
  },
  {
    role: "CON",
    arrow: "↓",
    stance: "con",
    base: 85,
    final: 85,
    turn: "03",
    rot: -1.1,
    dx: -14,
    mt: -48,
    author: A_CLAUDE,
    authorKey: "claude",
    reviewer: A_GPT,
    reviewerKey: "gpt",
    review: "AGREED",
    text: "Remote-first companies should generally set engineering pay against the local labor market an employee can actually access — geo-tiered bands with transparent, published multipliers — because wages are priced against a worker’s realistic alternatives, not against a global abstraction."
  },
  {
    role: "CON",
    arrow: "↓",
    stance: "con",
    base: 72,
    final: 68,
    turn: "04",
    rot: 1.6,
    dx: 24,
    mt: -50,
    author: A_GEMINI,
    authorKey: "gemini",
    reviewer: A_GPT,
    reviewerKey: "gpt",
    review: "AGREED",
    text: "A single global rate anchors to the lowest defensible number: when payroll cannot flex by market, firms quietly lower the level everywhere or slow hiring in expensive markets."
  }
];

export const METHOD_STEPS = [
  {
    number: "01",
    title: "Models argue",
    stance: "pro",
    body: "Five frontier models build the tree — pro, con, and the reasoning that binds them."
  },
  {
    number: "02",
    title: "They review each other",
    stance: "reasoning",
    body: "Every claim is cross-reviewed by a rival model: agree or dispute, on the record."
  },
  {
    number: "03",
    title: "You challenge",
    stance: "con",
    body: "Flag any sentence; the bench spawns a focused rebuttal where you pointed."
  },
  {
    number: "04",
    title: "Verdict with receipts",
    stance: "gold",
    body: "Scores, condition marks, and replay handles — every number traces to its source."
  }
] as const;

export const RESOLUTION =
  "Should remote-first companies pay engineers the same salary regardless of where they live?";
