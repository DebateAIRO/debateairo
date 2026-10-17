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
