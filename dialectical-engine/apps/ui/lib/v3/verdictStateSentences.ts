import { t, type MessageCatalog } from "../i18n/translate.js";
import type { LiveVerdictState } from "../types.js";

/**
 * V's ruling D77 of 2026-09-18: one sentence per verdict state, true of EVERY
 * way the engine can reach that state. The full reasoning is the comment above
 * STATE_SENTENCE_KEYS in components/VerdictBanner.tsx. The banner reads those
 * catalogue keys; the story reads the SAME keys here, so the banner and the
 * verdict story cannot word a state differently.
 */
export const VERDICT_STATE_SENTENCE_KEYS: Readonly<Record<LiveVerdictState, string | null>> = Object.freeze({
  supported: null,
  contested: "debateDrawers.verdict.contestedExplanation",
  unsupported: "debateDrawers.verdict.unsupportedExplanation"
});

/** The D77 sentence for a verdict state, from the `debateDrawers` catalogue handed in; null for "supported". */
export function verdictStateSentence(state: LiveVerdictState, catalog: MessageCatalog): string | null {
  const key = VERDICT_STATE_SENTENCE_KEYS[state];
  return key === null ? null : t(catalog, key);
}

/**
 * D77 gives "supported" no sentence because the banner's band label already
 * says it. The story panel always shows a sentence under its label, so it uses
 * this one, in plain words. It is true of the only rung that yields SUPPORTED
 * (packages/serve deriveVerdictLabel rung 3): the winner reached the high cut
 * ("came out strong"), its margin was above the tie margin gamma ("stayed ahead
 * of the other positions by more than the tie margin", with the tie margin said
 * in plain words; a margin just above it is not "clearly" ahead), and the
 * judges' disagreement was below the threshold ("the judges broadly agreed").
 */
export const STORY_SUPPORTED_SENTENCE =
  "The leading position came out strong, stayed ahead of the other positions by more than the tie margin (a smaller lead counts as a tie), and the judges broadly agreed.";
