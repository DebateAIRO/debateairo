import { STORY_BODY_LIMITS } from "@debateai/contract";
import {
  LENGTH_ALLOWANCE_LIMITS,
  answerRoomTokens,
  guidedAllowanceTokens,
  proseWordCount,
  storyShortWordsSum,
  storytellerAnswerRoomTokens,
  type CharactersPerWord,
  type StoryWordTargetField
} from "@debateai/kernel";
import { decodeModelJson, type CallBound } from "@debateai/providers";
import type { LengthGuidance } from "@debateai/register";

/**
 * LENGTH GUIDANCE FOR THE STORY (spec 2026-10-15 §3.3, §3.4, §3.6; INTERFACE §5.6; LG-D).
 *
 * With the length row, the storyteller's and the checker's calls are sized from the run's frozen table: the larger of
 * today's allowance and (thinking room + answer room), never past the storyteller's guided ceiling (the largest reviewed
 * row's own maximum) or, for the checker, LG-C's allowance cap (LENGTH_ALLOWANCE_LIMITS.capTokens, as the runner's
 * guidedCallBound). The storyteller's
 * answer room counts the short targets and the long version's reference words once each (no runaway factor: the
 * reference is the whole long story, INTERFACE §3.3); the checker's is the runaway factor × its words. Only the token
 * ceiling moves: tries (2, ruling L35) and the deadline stay the policy's. On the preview the wrapper's per-row story
 * ceilings still decide the storyteller's final allowance (spec §3.3).
 *
 * The words are information only (spec §3.6): nothing in the story reads them to decide anything.
 */
export const STORY_GUIDED_BOUND_LIMITS = Object.freeze({
  /**
   * The largest reviewed row's own maximum (`finalWriterOutputBound`); the gateway's per-target `maxOutputTokens` then
   * applies each model's own maximum (LG-C PF-C1.9); on the preview the wrapper's per-row story ceilings decide, so slow
   * rows keep 16,384 / 32,768. Not the register story bound's 64k schema ceiling: the storyteller's thinking room alone
   * is 64k at the start values (owner Q-C2), and thinking must leave room for the answer (R1d pre-flight PF-D4.2).
   */
  tokenCeiling: 128 * 1024
});

export type StoryLengthSite = "STORYTELLER" | "CHECKER";

/** One storyteller call's guided words (INTERFACE §5.6): each short target once, the path line 8 times, the reason 3 times. */
export function storyGuidedWords(targets: Readonly<Record<StoryWordTargetField, number>>): number {
  // LG-B's own sum (pre-flight PF-D4.8), with the contract's counts, so the story's and the preview's sums cannot drift.
  return storyShortWordsSum(targets, { positionLines: STORY_BODY_LIMITS.maxPaths, whyReasons: STORY_BODY_LIMITS.whyReasonsMax });
}

/** The story call's bound with the run's table; without one, the bound itself (the same object: today's request). */
export function storyGuidedBound(bound: CallBound, site: StoryLengthSite, guidance: LengthGuidance | null): CallBound {
  if (guidance === null) return bound;
  const thinkingRoomTokens = site === "STORYTELLER" ? guidance.thinkingRoom.story_writer : guidance.thinkingRoom.story_checker;
  const answerRoom = site === "STORYTELLER"
    ? storytellerAnswerRoomTokens(storyGuidedWords(guidance.story), guidance.storyLongReferenceWords, guidance.tokensPerWord)
    : answerRoomTokens(guidance.steps.story_checker, guidance.runawayMultiplier, guidance.tokensPerWord);
  const tokenCeiling = guidedAllowanceTokens({
    todayTokens: bound.tokenCeiling,
    thinkingRoomTokens,
    answerRoomTokens: answerRoom,
    // pre-flight PF-D4.2 / PF-D4.9: the storyteller's guided ceiling; the checker keeps LG-C's cap (guidedCallBound's).
    capTokens: site === "STORYTELLER" ? STORY_GUIDED_BOUND_LIMITS.tokenCeiling : LENGTH_ALLOWANCE_LIMITS.capTokens
  });
  return tokenCeiling === bound.tokenCeiling ? bound : Object.freeze({ ...bound, tokenCeiling });
}

/**
 * The words a storyteller reply wrote where it was given targets: its short version and its reasons (the texts its
 * guided words name; LG-D's contract deviation 1). Null when the reply does not decode; a decoded value with neither member
 * counts 0.
 */
export function storyActualWords(content: string, charactersPerWord: CharactersPerWord): number | null {
  const decoded = decodeModelJson(content);
  if (!decoded.ok || typeof decoded.value !== "object" || decoded.value === null) return null;
  const value = decoded.value as { readonly short?: unknown; readonly why?: unknown };
  return proseWordCount({ short: value.short ?? null, why: value.why ?? null }, charactersPerWord);
}
