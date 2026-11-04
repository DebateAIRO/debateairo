import { LENGTH_SENTENCE_WRITING, READER_SENTENCE_WRITING, type ReadingLevel } from "@debateai/kernel";
import type { PromptContract } from "@debateai/providers";
import { JUDGE_ANSWER_FORM, JUDGE_CLAIM_TYPE_INSTRUCTIONS, JUDGE_INSTRUCTIONS } from "./prompts.js";
import { JUDGE_INSTRUCTIONS_WITH_SOURCES } from "./web-prompts.js";

/**
 * V4 start step, Task 46 (spec 2026-11-03 §4.3, §6 item 5) — THE PATH ROOT WRITER: on a path debate each chosen path is
 * its own root, and one AI writes what the path's angle shows about the person's question and where it comes out; other
 * companies' AIs then argue for and against it with today's legs. Four NEW contracts, one per claim branch, with and
 * without the path's sources (the sources variant takes item 5's sentence in place of the locator sentence, as every
 * arguing leg that reads a pack does). Drafts: they await the owners' wording and are sealed only at Task 92 (engine
 * seal, never the judge seal), so `engineSealedContracts()` does not hold them yet. Always lengthed.
 *
 * The root claim is text the person reads on the map, so it is written at their reading level by the story's rule
 * (`storyContractForReader`, packages/story/src/contracts.ts): with a level, code adds the writers' reader sentence
 * after a blank line and the `reader` field after `length`; without one, neither. The language line stays last.
 */
// OWNER WORDING — approve before switch-on (draft of 2026-11-04; no reader sentence: code adds it with a level).
export const JUDGE_PATH_ROOT_DIRECTIVE = "Write one claim on what this angle shows about the person's question, and where it "
  + "comes out. Argue it with the views and the points you were given, where they help. Words the person wrote are theirs: "
  + "weigh them, but never present them as a finding. When the claim needs a fact the question does not give, say plainly "
  + "that it is an assumption. Never mention the material you were given or how the debate works, and never restate the "
  + "main question.";

/** The closed material tables: the question, the path's title and question, its viewpoints, the points raised for it, (its sources,) the length, the reader. */
export const JUDGE_PATH_ROOT_MATERIAL_FIELDS = Object.freeze(
  ["question_line", "path_title", "path_question", "viewpoints", "points_raised", "length", "reader"] as const);
export const JUDGE_PATH_ROOT_SOURCES_MATERIAL_FIELDS = Object.freeze(
  ["question_line", "path_title", "path_question", "viewpoints", "points_raised", "sources", "length", "reader"] as const);

export function judgePathRootPromptContract(claim: keyof typeof JUDGE_CLAIM_TYPE_INSTRUCTIONS): PromptContract {
  return Object.freeze({
    contractId: `judge.path-root.${claim}.v1`,
    instruction: [JUDGE_PATH_ROOT_DIRECTIVE, JUDGE_INSTRUCTIONS, JUDGE_CLAIM_TYPE_INSTRUCTIONS[claim], LENGTH_SENTENCE_WRITING].join(" "),
    answerForm: JUDGE_ANSWER_FORM
  });
}

export function judgePathRootSourcesPromptContract(claim: keyof typeof JUDGE_CLAIM_TYPE_INSTRUCTIONS): PromptContract {
  return Object.freeze({
    contractId: `judge.path-root.${claim}.sources.v1`,
    instruction: [JUDGE_PATH_ROOT_DIRECTIVE, JUDGE_INSTRUCTIONS_WITH_SOURCES, JUDGE_CLAIM_TYPE_INSTRUCTIONS[claim],
      LENGTH_SENTENCE_WRITING].join(" "),
    answerForm: JUDGE_ANSWER_FORM
  });
}

/** The four drafts, in seal order (Task 92 appends them to `engineSealedContracts()` once approved). */
export const PATH_ROOT_DRAFT_CONTRACTS: readonly PromptContract[] = Object.freeze([
  judgePathRootPromptContract("unknown"), judgePathRootPromptContract("resolved"),
  judgePathRootSourcesPromptContract("unknown"), judgePathRootSourcesPromptContract("resolved")
]);

/**
 * The reader sentence, the storyteller's rule mirrored exactly: no level (null), the same contract; a level, the writers'
 * sentence (READER_SENTENCE_WRITING) after a blank line, the id unchanged. Code's sentence, never sealed with the draft.
 * Call it before the language step, so the language line stays last.
 */
export function judgePathRootContractForReader(contract: PromptContract, readingLevel: ReadingLevel | null): PromptContract {
  if (readingLevel === null) return contract;
  return Object.freeze({ ...contract, instruction: `${contract.instruction}\n\n${READER_SENTENCE_WRITING}` });
}
