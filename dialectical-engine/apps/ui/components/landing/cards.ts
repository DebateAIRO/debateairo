import { t, type MessageCatalog } from "@/lib/i18n/translate";

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

export function exchangeCards(catalog?: MessageCatalog): readonly ExchangeCard[] {
  return [
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
    text: t(catalog, "home.card1Text")
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
    text: t(catalog, "home.card2Text")
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
    text: t(catalog, "home.card3Text")
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
    text: t(catalog, "home.card4Text")
  }
  ];
}

export const EXCHANGE_CARDS = exchangeCards();

export function methodSteps(catalog?: MessageCatalog) {
  return [
  {
    number: "01",
    title: t(catalog, "home.method1Title"),
    stance: "pro",
    body: t(catalog, "home.method1Body")
  },
  {
    number: "02",
    title: t(catalog, "home.method2Title"),
    stance: "reasoning",
    body: t(catalog, "home.method2Body")
  },
  {
    number: "03",
    title: t(catalog, "home.method3Title"),
    stance: "con",
    body: t(catalog, "home.method3Body")
  },
  {
    number: "04",
    title: t(catalog, "home.method4Title"),
    stance: "gold",
    body: t(catalog, "home.method4Body")
  }
] as const;
}

export const METHOD_STEPS = methodSteps();

export const resolution = (catalog?: MessageCatalog) => t(catalog, "home.resolution");
export const RESOLUTION = resolution();
