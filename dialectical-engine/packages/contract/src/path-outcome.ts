import { z } from "zod";
import { PATH_RESULT_LIMITS } from "@debateai/kernel";
import { PathIdSchema, type StartMenu } from "./start-paths.js";
import { DIG_MODEL_LIMITS, PathTextSchema, PointOfViewVerdictSchema, TrustWordSchema, type TrustWord } from "./web.js";

/**
 * V4 start step, Task 15 (spec 2026-11-03 §2.7, §4.3): a path debate's results per path. Every chosen path has its
 * answer so far (`PathOutcome`): ready, ready with a reservation, or failed (then it has nothing: no text, no changes,
 * no point-of-view line, no trust word, no evidence). The gap round lists points nobody raised yet, each for a path or
 * for the question as a whole. The trust word comes from the evidence, never from the AI: the same rule for a path
 * (from its points' words) and the main answer (from its paths' words).
 */
export { PATH_RESULT_LIMITS } from "@debateai/kernel";
export { PathIdSchema } from "./start-paths.js";

export const PATH_OUTCOME_STATES = Object.freeze(["READY", "READY_WITH_RESERVATION", "FAILED"] as const);
export type PathOutcomeState = typeof PATH_OUTCOME_STATES[number];

export const PathOutcomeSchema = z.object({
  state: z.enum(PATH_OUTCOME_STATES),
  text: PathTextSchema.nullable(),
  what_changed: z.array(z.string().trim().min(1).max(DIG_MODEL_LIMITS.sentenceMaxChars)).max(PATH_RESULT_LIMITS.whatChangedMax),
  view: PointOfViewVerdictSchema.nullable(),
  trust: TrustWordSchema.nullable(),
  rests_on: z.array(z.string().min(1).max(160)).max(PATH_RESULT_LIMITS.restsOnMax)
}).strict().superRefine((outcome, context) => {
  if (outcome.state === "FAILED") {
    if (outcome.text !== null || outcome.what_changed.length > 0 || outcome.view !== null || outcome.trust !== null || outcome.rests_on.length > 0) {
      context.addIssue({ code: "custom", message: "a failed path has no text, no changes, no view, no trust word and no evidence" });
    }
  } else if (outcome.text === null) {
    context.addIssue({ code: "custom", path: ["text"], message: "a ready path has its text" });
  }
});
export type PathOutcome = z.infer<typeof PathOutcomeSchema>;

export const PathGapRoundSchema = z.object({
  points: z.array(z.object({
    text: z.string().trim().min(1).max(PATH_RESULT_LIMITS.gapPointMaxChars),
    path_id: PathIdSchema.nullable()
  }).strict()).max(PATH_RESULT_LIMITS.gapPointsMax)
}).strict();
export type PathGapRound = z.infer<typeof PathGapRoundSchema>;

/** Strongest first: the weakest of these that a path's (or the answer's) evidence holds is its word. */
const HELD_ORDER: readonly TrustWord[] = Object.freeze(["SURE", "SURE_FOR_CASE", "STILL_ARGUED"]);
function trustWordOf(words: readonly (TrustWord | null)[]): TrustWord | null {
  const given = words.filter((word): word is TrustWord => word !== null);
  if (given.length === 0) return null;
  const held = given.filter((word) => word !== "DIDNT_HOLD");
  if (held.length === 0) return "DIDNT_HOLD";
  return held.reduce((weakest, word) => HELD_ORDER.indexOf(word) > HELD_ORDER.indexOf(weakest) ? word : weakest);
}
/** A path's word from its points' words: none → none; nothing held → DIDNT_HOLD; else the weakest that held. */
export function pathTrustWordOf(pointWords: readonly (TrustWord | null)[]): TrustWord | null {
  return trustWordOf(pointWords);
}
/** The main answer's word from its paths' words, by the same rule. */
export function mainAnswerTrustWordOf(pathWords: readonly (TrustWord | null)[]): TrustWord | null {
  return trustWordOf(pathWords);
}

/** One "+ N more to explore" item: a menu path the person did not choose. */
export type StartMoreItem = Readonly<{ more_id: string; title: string; question: string; is_new: boolean }>;
/** THE "+ N more" builder: the menu paths none of whose viewpoints was chosen, in menu order (`more-<path_ref>`). */
export function startMoreOf(menu: StartMenu, chosenViewpointIds: ReadonlySet<string>): readonly StartMoreItem[] {
  return Object.freeze(menu.paths
    .filter((path) => !path.viewpoint_ids.some((id) => chosenViewpointIds.has(id)))
    .map((path) => Object.freeze({ more_id: `more-${path.path_ref}`, title: path.title, question: path.question, is_new: path.is_new })));
}
