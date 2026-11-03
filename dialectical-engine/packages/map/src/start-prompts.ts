import { START_STEP_LIMITS } from "@debateai/kernel";
import type { PromptContract } from "@debateai/providers";
import { MAP_STRICT_SENTENCE } from "./prompts.js";

/**
 * The step before Start (V4 start step, spec 2026-11-03 §2, §4): its five prompt contracts. Several AIs each write a short list of paths
 * worth looking into from the angles they are given; one merge turns the lists into the menu the person shapes (repeats marked, clear
 * overlaps put together, most useful first, the "Another way to see it" cards and the "Combine?" and "fits path N" suggestions); a late
 * merge places lists that arrive after the menu was made; the combine writes one question for points the person put together; the fit says
 * whether the person's own point of view fits inside one of their chosen paths.
 *
 * Each INSTRUCTION is the owners' editable text; each ANSWER FORM is code's, and starts with the map's strict sentence. The forms show no
 * example id a model could copy (an id in a prompt's example is copied back: 35 of 42 objection rounds did it, 2026-10-21). No draft names a
 * field in its instruction, and none ends with the reader sentence: with a reading level the spec adds it after a blank line (Calls item 2's
 * rule). These five are not sealed yet: Task 92 seals them in START_STEP_CONTRACT_NAMES order.
 */
export const START_WORD_TARGETS = Object.freeze({ title: 6, question: 20, why: 15, cardSentence: 30, reason: 15 });

export const START_LIST_CONTRACT_ID = "start.list.v1";
export const START_MERGE_CONTRACT_ID = "start.merge.v1";
export const START_MERGE_LATE_CONTRACT_ID = "start.merge-late.v1";
export const START_COMBINE_CONTRACT_ID = "start.combine.v1";
export const START_FIT_CONTRACT_ID = "start.fit.v1";

export type StartContractName = "list" | "merge" | "mergeLate" | "combine" | "fit";
/** The seal order (Task 92), as MAP_ENGINE_CONTRACT_NAMES. */
export const START_STEP_CONTRACT_NAMES = Object.freeze(["list", "merge", "mergeLate", "combine", "fit"] as const);

/** How many paths a list writer is asked for at least (the most is START_STEP_LIMITS.viewpointsPerListMax). */
const START_FORM_COUNTS = Object.freeze({ listPathsMin: 3 });

const L = START_STEP_LIMITS;
const W = START_WORD_TARGETS;
const TITLE = `<about ${String(W.title)} words>`;
const QUESTION = `<one question of about ${String(W.question)} words>`;

// OWNER WORDING — approve before switch-on
const LIST_INSTRUCTION = "Suggest what is worth looking into before this question is investigated. You are given one to four angles to look from. "
  + "For each angle, suggest paths that someone looking from that angle would think of and others might miss. A path is a short title and "
  + "one question that, once looked into, helps answer the main question from its angle, with one short line on why it matters. Suggest "
  + "three to six paths in all, each clearly different from the others. Do not answer the main question and do not repeat it in other words.";

// OWNER WORDING — approve before switch-on
const MERGE_INSTRUCTION = "Several people suggested what is worth looking into for this question; you are given their suggestions, each with an "
  + "id, and never who wrote which. First, mark every suggestion that says the same as another in other words as a repeat of it. Then make "
  + "the list of paths: put suggestions that clearly belong together into one path of at most four, with a short title and one question that "
  + "covers them and names only what they add, without repeating the main question; keep suggestions that say different things apart, and "
  + "when in doubt keep them apart. Order the paths most useful first for answering the main question, using what the asker already said "
  + "about it. Then pick up to three other ways to read the question that the suggestions show and the asker may not have weighed, each with "
  + "one sentence saying what kind of surprise it is and a path that would look into it. Last, suggest up to nine changes: two paths that ask "
  + "the same thing and could be combined, with a short reason, or a path that fits inside another.";

// OWNER WORDING — approve before switch-on
const MERGE_LATE_INSTRUCTION = "More suggestions arrived for this question after its list of paths was made. You are given the list so far, and "
  + "the new suggestions, each with an id. Never change, reorder or remove a path of the list so far. Mark every new suggestion that says the "
  + "same as a suggestion already listed, or as another new one, as a repeat of it. Put the other new suggestions into new paths: suggestions "
  + "that clearly belong together go into one path of at most four, with a short title and one question that covers them and names only what "
  + "they add, without repeating the main question. When a new path fits inside a path of the list so far, say which.";

// OWNER WORDING — approve before switch-on
const COMBINE_INSTRUCTION = "The asker wants to look into several points together, as one path of their main question. The main question is "
  + "given only so you know what the path is for: do not repeat it and do not reword it. Write one short title and one question that cover "
  + "all the points together and name only what this path adds.";

// OWNER WORDING — approve before switch-on
const FIT_INSTRUCTION = "The asker wrote their own point of view and wants it looked into. You are given the paths they have chosen, each with "
  + "a key. Say which one path it fits inside, so it needs no path of its own, or that it fits none. Do not judge whether the point of view is "
  + "right.";

const REPEAT_FORM = `{ "id": <the id of a suggestion that says the same as another>, "same_as": <the id of that other suggestion> }`;
const PATH_FORM = `{ "ids": [<a suggestion id>, ...], "title": ${TITLE} | null, "question": ${QUESTION} | null }`;
/** The four kinds of "Another way to see it" card, each with its plain gloss (START_CARD_KINDS' order). */
const CARD_KIND_FORM = `"CHOICE_NOT_WEIGHED" (a choice the asker may not have weighed) | "EITHER_OR" (an either-or the question takes for granted) `
  + `| "WHAT_WOULD_CHANGE_IT" (what would change the answer) | "OTHER_READING" (another way to read the question)`;
const CARD_FORM = `{ "kind": ${CARD_KIND_FORM}, "sentence": <one sentence of about ${String(W.cardSentence)} words>, "title": ${TITLE}, `
  + `"question": ${QUESTION}, "fits_path": <path number counting from 1> | null, "as_question": <the main question asked this way> | null }`;
const SUGGESTION_FORM = `{ "kind": "COMBINE", "paths": [<path number>, <path number>], "reason": <one sentence of about ${String(W.reason)} words> } `
  + `| { "kind": "FITS", "path": <path number>, "into": <path number> }`;

const LIST_FORM = `${MAP_STRICT_SENTENCE}\n{ "paths": [{ "angle_id": <one angle_id from the angles given>, "title": ${TITLE}, "question": ${QUESTION}, `
  + `"why": <one sentence of about ${String(W.why)} words> }, ...] }\npaths has ${String(START_FORM_COUNTS.listPathsMin)} to `
  + `${String(L.viewpointsPerListMax)} entries.`;
const MERGE_FORM = `${MAP_STRICT_SENTENCE}\n{ "repeats": [${REPEAT_FORM}, ...], "paths": [${PATH_FORM}, ...], "cards": [${CARD_FORM}, ...], `
  + `"suggestions": [${SUGGESTION_FORM}, ...] }\nEvery id that is not in repeats appears in exactly one path; a path has 1 to `
  + `${String(L.viewpointsPerPathMax)} ids, and its title and question are null only when it has one id; paths are in order, most useful `
  + `first; cards has 0 to ${String(L.cardsMax)} entries; suggestions has 0 to ${String(L.suggestionsMax)} entries.`;
const MERGE_LATE_FORM = `${MAP_STRICT_SENTENCE}\n{ "repeats": [${REPEAT_FORM}, ...], "paths": [${PATH_FORM}, ...], "fits": [{ "path": <number in paths>, `
  + `"into": <the path_ref of a path you were given> }, ...] }\nEvery new id that is not in repeats appears in exactly one path; a path has 1 `
  + `to ${String(L.viewpointsPerPathMax)} ids; fits has at most one entry per path.`;
const COMBINE_FORM = `${MAP_STRICT_SENTENCE}\n{ "title": ${TITLE}, "question": ${QUESTION} }`;
const FIT_FORM = `${MAP_STRICT_SENTENCE}\n{ "fits": <the key of one path you were given> | null }`;

const contract = (contractId: string, instruction: string, answerForm: string): PromptContract =>
  Object.freeze({ contractId, instruction, answerForm });

/** The five drafts, as code ships them. */
export const START_STEP_DRAFT_CONTRACTS: Readonly<Record<StartContractName, PromptContract>> = Object.freeze({
  list: contract(START_LIST_CONTRACT_ID, LIST_INSTRUCTION, LIST_FORM),
  merge: contract(START_MERGE_CONTRACT_ID, MERGE_INSTRUCTION, MERGE_FORM),
  mergeLate: contract(START_MERGE_LATE_CONTRACT_ID, MERGE_LATE_INSTRUCTION, MERGE_LATE_FORM),
  combine: contract(START_COMBINE_CONTRACT_ID, COMBINE_INSTRUCTION, COMBINE_FORM),
  fit: contract(START_FIT_CONTRACT_ID, FIT_INSTRUCTION, FIT_FORM)
});

/** Every material field a start-step packet names that is two or more words joined by underscores. */
const START_MATERIAL_FIELD_NAMES = Object.freeze(["question_line", "angle_id", "paths_so_far", "path_ref", "new_suggestions", "same_as",
  "fits_path", "as_question", "main_question", "own_view", "question_language"]);
const SNAKE_NAME = /[A-Za-z]+(?:_[A-Za-z]+)+/gu;

/**
 * The start step's internal words, built as MAP_ENGINE_INTERNAL_FIELD_NAMES is (internal-words.ts): the five drafts' multi-word field
 * names (their instructions and forms) and the material's, lower case, once each, sorted. A text that names one is about the engine, so the
 * readers leave it out.
 */
export const START_INTERNAL_FIELD_NAMES: readonly string[] = Object.freeze([...new Set(
  [...START_STEP_CONTRACT_NAMES.flatMap((name) => [START_STEP_DRAFT_CONTRACTS[name].instruction, START_STEP_DRAFT_CONTRACTS[name].answerForm]),
    START_MATERIAL_FIELD_NAMES.join(" ")]
    .flatMap((text) => text.match(SNAKE_NAME) ?? [])
    .map((name) => name.toLowerCase())
)].sort());
