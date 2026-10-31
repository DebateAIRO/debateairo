// apps/runner/src/answer-checker-sources.ts
/**
 * WEB SEARCH: THE ANSWER CHECKER READS THE EXTRACTS THE WRITER READ (Perplexity plan 2026-10-30, task W4-7; design
 * PERPLEXITY-DESIGN.md v2 §7.1 item 7).
 *
 * Plain words: on a debate that read web sources, the answer writer reads each looked-up point with the extract it rests
 * on and may name its source (serve.synthesizer.length[.reader].sources.v1, W1-5; wired by W4-1). The checker then needs
 * the same extracts, or it may object to a source it cannot see. These are its two VARIANTS for that debate: the checker's
 * length and length-reader contracts with a new id each, the instruction and the answer form unchanged byte for byte
 * (W1-5's precedent: the story checker reads the storyteller's material with its instruction unchanged). Only the
 * material differs: the digest keeps each node's `extract`, exactly as the writer was shown it.
 *
 * - Engine 2 is the only engine that reads packs, and it always tells the checker its length, so only the two length
 *   variants exist; an unlengthed checker with extracts is a defect (index.ts refuses it, as it refuses the writer's).
 * - Sealed by the ENGINE seal only (engine-contracts.ts, appended after W4-2's planner), never by the conformance or the
 *   composer seal, as the writer's sources variants are: engine 1's fingerprints never gain an engine-2 contract, and a
 *   debate with no packs sends serve.evaluator.length.v1 or .length.reader.v1, byte for byte.
 * - This file imports nothing of index.ts: the engine seal is worked out when engine-contracts.ts loads, and index.ts
 *   reaches engine-contracts.ts through its own imports. So the answer form is held here as its own constant, pinned
 *   equal to index.ts's EVALUATOR_CONTRACT_TEXT (tests/unit/answer-checker-sources.test.ts): one is never changed
 *   without the other, and a changed form is a new id here.
 */
import { LENGTH_SENTENCE_ANSWER_CHECKER, READER_SENTENCE_ANSWER_CHECKER } from "@debateai/kernel";
import type { PromptContract } from "@debateai/providers";
import { EVALUATOR_INSTRUCTIONS } from "@debateai/serve";

/** The checker's answer form, byte for byte index.ts's EVALUATOR_CONTRACT_TEXT (pinned equal by test). */
export const EVALUATOR_SOURCES_ANSWER_FORM =
  "Return only JSON {satisfied,objection,criteria} where criteria is {fairness_to_losers,statement_label_agreement,no_overstatement,restatement,citation_tracing}, each a boolean. Set satisfied true only when every criterion is true. When satisfied is false, objection must state the objection in full; when it is true, objection must be null.";

export const EVALUATOR_LENGTH_SOURCES_CONTRACT_ID = "serve.evaluator.length.sources.v1" as const;
export const EVALUATOR_LENGTH_READER_SOURCES_CONTRACT_ID = "serve.evaluator.length.reader.sources.v1" as const;

/** serve.evaluator.length.v1's instruction and form, under its own id: the digest carries the cited extracts. */
export const EVALUATOR_LENGTH_SOURCES_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: EVALUATOR_LENGTH_SOURCES_CONTRACT_ID,
  instruction: `${EVALUATOR_INSTRUCTIONS} ${LENGTH_SENTENCE_ANSWER_CHECKER}`,
  answerForm: EVALUATOR_SOURCES_ANSWER_FORM
});
/** serve.evaluator.length.reader.v1's instruction and form, under its own id: the digest carries the cited extracts. */
export const EVALUATOR_LENGTH_READER_SOURCES_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: EVALUATOR_LENGTH_READER_SOURCES_CONTRACT_ID,
  instruction: `${EVALUATOR_INSTRUCTIONS} ${LENGTH_SENTENCE_ANSWER_CHECKER} ${READER_SENTENCE_ANSWER_CHECKER}`,
  answerForm: EVALUATOR_SOURCES_ANSWER_FORM
});

/** The two, in the order the engine seal appends them (length, then length with the reader). */
export const EVALUATOR_SOURCES_SEALED_CONTRACTS: readonly PromptContract[] = Object.freeze([
  EVALUATOR_LENGTH_SOURCES_PROMPT_CONTRACT,
  EVALUATOR_LENGTH_READER_SOURCES_PROMPT_CONTRACT
]);
