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
