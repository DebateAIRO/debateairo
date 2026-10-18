/**
 * THE ENGINE'S SHARED VOCABULARY (engine redesign spec 2026-10-15 §4.3, §7.2 item 2; INTERFACE §9.1).
 *
 * Plain TypeScript, no zod: judgement, serve, story and the runner all read it. R1d creates the file with the
 * question kinds, because the story's one shape is chosen from them (`storyShapeOf` in packages/story/src/pack.ts);
 * R2 appends the rest of INTERFACE §9.1 (answer letters, call keys) here.
 *
 * The kinds equal the story pack's shape ids (tests/unit/story-pack.test.ts holds them equal).
 */
export const ENGINE_QUESTION_KINDS = Object.freeze(["general", "factual", "health", "legal", "money-decision", "personal-choice"] as const);
export type EngineQuestionKind = typeof ENGINE_QUESTION_KINDS[number];

/** Spec §4.2: the reducer version engine 2's reduced judgements record (`ledger.reduced_judgement.reducer_version`). */
export const ENGINE2_REDUCER_VERSION = "engine2:honest-median:v1" as const;

/** INTERFACE §9.1: answer letters, fixed per debate (A = root index 0, B = root 1, ...); never fewer than the roots. */
export const ENGINE_ANSWER_LETTERS = Object.freeze(["A", "B", "C", "D", "E", "F", "G", "H"] as const);
export type EngineAnswerLetter = typeof ENGINE_ANSWER_LETTERS[number];

/** The numbers a comparing judge's seat and a point investigation's place run through (judges.count, investigate.maxPerDebate). */
export const ENGINE_CALL_SITE_INDEX = Object.freeze({ min: 1, max: 5 });

function engineCallSiteKey(prefix: string, index: number): string {
  if (!Number.isInteger(index) || index < ENGINE_CALL_SITE_INDEX.min || index > ENGINE_CALL_SITE_INDEX.max) {
    throw new RangeError(`ENGINE_CALL_SITE_INDEX_INVALID:${String(index)}`);
  }
  return `${prefix}${String(index)}`;
}

/** Spec §4.9: one comparing judge's call key, `VERDICT:judge:<seat>`; debate role JUDGE, thinking `judge_panel`. */
export function comparingJudgeCallSiteKey(seat: number): string {
  return engineCallSiteKey("VERDICT:judge:", seat);
}

/** Spec §4.9: one point investigation's call key, `VERDICT:investigate:<n>` in investigation order; role REVIEWER. */
export function pointInvestigationCallSiteKey(n: number): string {
  return engineCallSiteKey("VERDICT:investigate:", n);
}

/** INTERFACE §9.1: the map's answer check (R3); a `MAP:` key, so it is the map's step and the `opening` thinking level. */
export const MAP_CHECK_CALL_SITE_KEY = "MAP:check" as const;
