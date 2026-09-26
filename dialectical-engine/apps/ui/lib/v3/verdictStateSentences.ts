import type { LiveVerdictState } from "../types.js";

/**
 * V's ruling D77 of 2026-09-18: one sentence per verdict state, true of EVERY
 * way the engine can reach that state. The full reasoning is the comment above
 * STATE_SENTENCES in components/VerdictBanner.tsx, which now reads this record,
 * so the banner and the verdict story can never word a state differently.
 */
export const VERDICT_STATE_SENTENCES: Readonly<Record<LiveVerdictState, string | null>> = Object.freeze({
  supported: null,
  contested:
    "The run did not settle this either way: the positions were too close, the judges disagreed, the leading position was not strong enough, or part of the comparison was missing.",
  unsupported:
    "Even the leading position here came out weak once the arguments were weighed against each other — a weak case, not a disproved one."
});

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
