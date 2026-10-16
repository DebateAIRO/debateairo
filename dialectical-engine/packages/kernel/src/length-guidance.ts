// packages/kernel/src/length-guidance.ts
/**
 * LENGTH GUIDANCE AND REPAIR FIRST (spec docs/superpowers/specs/2026-10-15-length-guidance-design.md; INTERFACE §1.1):
 * the step words the length-guidance phases share. A step that has a word in the preview thinking table
 * (packages/providers/src/preview-thinking.ts, PREVIEW_THINKING_STEPS) uses that same word, so the owner reads one
 * vocabulary in the settings row, the practice report and the thinking table. Four keys are length-only and have no
 * word in that table: `map` (the map's calls have their own word parts, MAP_WORD_TARGET_PARTS), `comparing_judge` and
 * `investigator` (the engine phases run them at the judge_panel or the reviewer thinking level), and
 * `structure_repair` (a repair call runs at the slip_fix level once the table maps it).
 *
 * Plain words: every AI call that a length-guidance phase counts belongs to one step: an opening, a pro or con, a
 * cross-reply, a panel judgment, a review, the answer writer, the answer checker, the storyteller, the story checker, a
 * comparing judge, the investigator, a map step, or the structure-repair call that puts another AI's broken answer
 * back into its form. Health checks, the dormant evaluator lane and the STOPPING row have no step. `lengthCallStepOf`
 * reads which, from the call-site key.
 */
import { debateRoleFromCallSiteKey, type DebateRole } from "./debate-roles.js";

export const LENGTH_GUIDANCE_STEPS = Object.freeze([
  "opening", "pros_cons", "cross_exchange", "judge_panel", "reviewer",
  "answer_writer", "answer_checker", "story_checker",
  // Engine redesign (engine INTERFACE §4.1): the comparing judges and the investigator, added up front so the first
  // published length row already carries them.
  "comparing_judge", "investigator"
] as const);
export type LengthGuidanceStep = typeof LENGTH_GUIDANCE_STEPS[number];

/** Thinking-room keys: every step, plus the storyteller and the map steps. */
export const LENGTH_THINKING_ROOM_KEYS = Object.freeze([...LENGTH_GUIDANCE_STEPS, "story_writer", "map"] as const);
export type LengthThinkingRoomKey = typeof LENGTH_THINKING_ROOM_KEYS[number];

/** The four final writers (L26, L29). */
export const FINAL_WRITER_STEPS = Object.freeze(["answer_writer", "answer_checker", "story_writer", "story_checker"] as const);
export type FinalWriterStep = typeof FINAL_WRITER_STEPS[number];

export const STORY_WORD_TARGET_FIELDS = Object.freeze(
  ["headline", "summary", "confidence", "positionLine", "change", "whyReason"] as const);
export type StoryWordTargetField = typeof STORY_WORD_TARGET_FIELDS[number];

export const MAP_WORD_TARGET_PARTS = Object.freeze(
  ["claim", "whyItMatters", "candidateAnswer", "angleLabel", "angleFocus", "framingChallenge", "chosenAnswer",
    "checkReason"] as const);
export type MapWordTargetPart = typeof MAP_WORD_TARGET_PARTS[number];

/** A call's step: a length-guidance step, the storyteller, a map step, or the structure-repair call (LG-A). */
export type LengthCallStep = LengthGuidanceStep | "story_writer" | "map" | "structure_repair";

/**
 * The structure-repair call's key prefix. The one copy of this literal: the repair call's call-site keys are built from
 * it, and later tasks import it from here rather than writing it again.
 */
export const STRUCTURE_REPAIR_CALL_SITE_PREFIX = "REPAIR:STRUCTURE:" as const;
const STORYTELLER_KEY = /^STORY:STORYTELLER:[1-8]$/u;
const STORY_CHECKER_KEY = /^STORY:CHECKER:[1-8]$/u;
/** Engine redesign (engine INTERFACE §4.2): the comparing judges' and the investigator's call-site keys, seats 1-5. */
const COMPARING_JUDGE_KEY = /^VERDICT:judge:[1-5]$/u;
const INVESTIGATOR_KEY = /^VERDICT:investigate:[1-5]$/u;

/** The debate role of a call (its call-site key) → its step: one lookup, no branch to forget. */
const STEP_OF_ROLE: Readonly<Record<DebateRole, LengthGuidanceStep>> = Object.freeze({
  POSITION: "opening",
  SUPPORT_ATTACK: "pros_cons",
  CROSS_EXCHANGE: "cross_exchange",
  JUDGE: "judge_panel",
  REVIEWER: "reviewer",
  ANSWER_WRITER: "answer_writer",
  ANSWER_CHECKER: "answer_checker"
});

/**
 * The step a call belongs to, from its call-site key and, for the two story sites, its lane. The `:seat:main|runnerUp`
 * suffix is ignored for a role key (as `debateRoleFromCallSiteKey` does); the story and verdict keys match only without
 * it, and the map and repair keys match by prefix. A story key on another lane is no story call, and an omitted lane
 * reads as the story lane. Null for every other call (health checks, the dormant evaluator lane, the STOPPING row).
 */
export function lengthCallStepOf(callSiteKey: string, lane?: string): LengthCallStep | null {
  if (callSiteKey.startsWith(STRUCTURE_REPAIR_CALL_SITE_PREFIX)) return "structure_repair";
  const storyLane = lane === undefined || lane === "story";
  if (STORYTELLER_KEY.test(callSiteKey)) return storyLane ? "story_writer" : null;
  if (STORY_CHECKER_KEY.test(callSiteKey)) return storyLane ? "story_checker" : null;
  if (callSiteKey.startsWith("MAP:")) return "map";
  if (COMPARING_JUDGE_KEY.test(callSiteKey)) return "comparing_judge";
  if (INVESTIGATOR_KEY.test(callSiteKey)) return "investigator";
  const role = debateRoleFromCallSiteKey(callSiteKey);
  return role === null ? null : STEP_OF_ROLE[role];
}

/**
 * Spec §7 Standard words, as the engine INTERFACE §4.1 amends them; LG-C's lengthGuidancePolicyStartValues() is built from
 * these, so they cannot drift.
 */
export const LENGTH_GUIDANCE_START = Object.freeze({
  standardWords: Object.freeze({
    opening: 300, pros_cons: 250, cross_exchange: 250, judge_panel: 200, reviewer: 120, answer_writer: 350,
    answer_checker: 150, story_checker: 250, comparing_judge: 80, investigator: 60
  }) satisfies Readonly<Record<LengthGuidanceStep, number>>,
  shortFactor: 0.6, detailedFactor: 1.5,
  /** Owner G5 (engine INTERFACE §4.1): the answer writer's Short / Standard / Detailed words. */
  answerWriterWords: Object.freeze({ short: 200, standard: 350, detailed: 1000 }),
  sameAtEveryLevel: Object.freeze(["answer_checker", "story_checker", "comparing_judge", "investigator"] as const),
  story: Object.freeze({ headline: 15, summary: 120, confidence: 30, positionLine: 35, change: 60, whyReason: 100 }),
  map: Object.freeze({ claim: 35, whyItMatters: 35, candidateAnswer: 25, angleLabel: 8, angleFocus: 35,
    framingChallenge: 35, chosenAnswer: 35, checkReason: 40 }) satisfies Readonly<Record<MapWordTargetPart, number>>,
  thinkingRoom: Object.freeze({ opening: 4096, pros_cons: 6144, cross_exchange: 6144, judge_panel: 4096, reviewer: 2048,
    answer_writer: 16384, answer_checker: 2048, story_checker: 12288, comparing_judge: 4096, investigator: 2048,
    story_writer: 16384, map: 8192 }) satisfies Readonly<Record<LengthThinkingRoomKey, number>>,
  runawayMultiplier: 4, tokensPerWord: 3, storyLongReferenceWords: 3000,
  charactersPerWord: Object.freeze({ zh: 1.6, ja: 2.0, th: 5.0 }),
  /** The short story's counts (contract STORY_BODY_LIMITS: at most 8 position lines, at most 3 why-reasons). */
  storyCounts: Object.freeze({ positionLines: 8, whyReasons: 3 })
});

/**
 * Engine INTERFACE §4.2: the preview thinking-table step each length-only engine step runs at (R2 maps their roles; the
 * table itself is unchanged).
 */
export const LENGTH_STEP_THINKING_STEP = Object.freeze({ comparing_judge: "judge_panel", investigator: "reviewer" } as const);

/** Factors for languages written without spaces: characters per word. */
export type CharactersPerWord = Readonly<{ zh: number; ja: number; th: number }>;

function positive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError("LENGTH_ANSWER_ROOM_INVALID");
  return value;
}

/** L14: the room the answer itself may need: runaway factor x guided words x tokens per word, rounded up. */
export function answerRoomTokens(guidedWords: number, runawayMultiplier: number, tokensPerWord: number): number {
  return Math.ceil(positive(runawayMultiplier) * positive(guidedWords) * positive(tokensPerWord));
}

/** L14 for the storyteller: its short words plus the whole long story's reference words (no runaway factor). */
export function storytellerAnswerRoomTokens(shortWordsSum: number, longReferenceWords: number, tokensPerWord: number): number {
  return Math.ceil((positive(shortWordsSum) + positive(longReferenceWords)) * positive(tokensPerWord));
}

/** The short story's guided words added up: each line counted as often as the story may hold it. */
export function storyShortWordsSum(story: Readonly<Record<StoryWordTargetField, number>>,
  counts: Readonly<{ positionLines: number; whyReasons: number }> = LENGTH_GUIDANCE_START.storyCounts): number {
  return story.headline + story.summary + story.confidence + counts.positionLines * story.positionLine
    + story.change + counts.whyReasons * story.whyReason;
}

/**
 * The words a step is guided to with no length row (the start values at Standard): a map call counts one item's parts;
 * the storyteller (its own sum, `storyShortWordsSum`) and the structure-repair call have none.
 */
export function lengthStartWordsOf(step: LengthCallStep): number | null {
  if (step === "story_writer" || step === "structure_repair") return null;
  if (step === "map") return Object.values(LENGTH_GUIDANCE_START.map).reduce((sum, words) => sum + words, 0);
  return LENGTH_GUIDANCE_START.standardWords[step];
}

const HAN = /\p{Script=Han}/gu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const THAI = /\p{Script=Thai}/gu;
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/gu;

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** One string's words: 0 unless it is prose (3+ space-separated words, or 6+ Han/Kana/Thai characters). */
function stringWords(text: string, factors: CharactersPerWord): number {
  const han = countMatches(text, HAN);
  const kana = countMatches(text, KANA);
  const thai = countMatches(text, THAI);
  const spaced = text.replace(UNSPACED, " ").split(/\s+/u).filter((token) => token.length > 0).length;
  if (spaced < 3 && han + kana + thai < 6) return 0;
  const cjk = han + kana === 0 ? 0 : (han + kana) / (kana > 0 ? factors.ja : factors.zh);
  return spaced + cjk + thai / factors.th;
}

/**
 * Spec §3.6: the words of every prose value of a decoded reply, however deeply nested. Keys are never counted; ids, enum
 * values and short labels are not prose (fewer than three words). Chinese counts characters / zh (/ ja when the text holds
 * Kana), Thai characters / th; every other script counts space-separated words. Rounded to a whole number at the end.
 */
export function proseWordCount(value: unknown,
  charactersPerWord: CharactersPerWord = LENGTH_GUIDANCE_START.charactersPerWord): number {
  for (const factor of [charactersPerWord.zh, charactersPerWord.ja, charactersPerWord.th]) {
    if (!Number.isFinite(factor) || factor <= 0) throw new TypeError("LENGTH_CHARACTERS_PER_WORD_INVALID");
  }
  let total = 0;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const item = stack.pop();
    if (typeof item === "string") total += stringWords(item, charactersPerWord);
    else if (Array.isArray(item)) stack.push(...item);
    else if (typeof item === "object" && item !== null) stack.push(...Object.values(item));
  }
  return Math.round(total);
}
