import { PATH_RESULT_LIMITS } from "@debateai/kernel";
import type { PromptContract } from "@debateai/providers";
import { MAP_STRICT_SENTENCE } from "./prompts.js";

/**
 * The gap round after Start (V4 start step, spec 2026-11-03 §4.3): on paid plans, beside the web search, one or two AIs from the line-up
 * read the paths the person chose and name what is still missing, each point for the path it belongs to or for the question as a whole.
 *
 * The INSTRUCTION is the owners' editable text; the ANSWER FORM is code's and starts with the map's strict sentence. The form shows no
 * example id a model could copy (an id in a prompt's example is copied back: 35 of 42 objection rounds did it, 2026-10-21), the instruction
 * names no field, and it does not end with the reader sentence: with a reading level the code adds it after a blank line (Calls item 2's
 * rule). Not sealed yet: Task 92 seals it with the other drafts.
 */
export const PATH_GAP_CONTRACT_ID = "map.gap-paths.v1" as const;

/** A round's points at most, and the rounds at most (the debate's 40 points and their 400 characters are PATH_RESULT_LIMITS'). */
export const PATH_GAP_LIMITS = Object.freeze({ pointsPerRoundMax: 20, roundsMax: 2 });

// OWNER WORDING — approve before switch-on
const PATH_GAP_INSTRUCTION = "This question is being looked into along the paths the asker chose. You are given each path with its id and the "
  + "suggestions it was built from, and the points already raised. Name what is still missing: points that would help answer the question and "
  + "that no path and no point already raised covers. For each point, say which path it belongs to, or that it belongs to the question as a "
  + "whole. Do not repeat a point already raised, in the same or in other words, and do not answer the question.";

const PATH_GAP_FORM = `${MAP_STRICT_SENTENCE}\n{ "points": [{ "text": <one point that nobody raised yet, in one or two sentences>, `
  + `"path": <an id copied exactly from the paths given> | null }, ...] }\npoints has 0 to ${String(PATH_GAP_LIMITS.pointsPerRoundMax)} entries; `
  + `each text has at most ${String(PATH_RESULT_LIMITS.gapPointMaxChars)} characters.`;

/** The draft, as code ships it: one, in an array as the other path-step drafts are. */
export const PATH_GAP_DRAFT_CONTRACTS: readonly PromptContract[] = Object.freeze([
  Object.freeze({ contractId: PATH_GAP_CONTRACT_ID, instruction: PATH_GAP_INSTRUCTION, answerForm: PATH_GAP_FORM })
]);
