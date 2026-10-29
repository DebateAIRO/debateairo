import { createHash } from "node:crypto";
import {
  LENGTH_FIELD,
  READER_SENTENCE_STORY_CHECKER,
  READER_SENTENCE_WRITING,
  STORY_WORD_TARGET_FIELDS,
  argumentLanguageDirective,
  lengthGuidanceText,
  questionLanguageSentence,
  type CharactersPerWord,
  type QuestionLanguage,
  type ReadingLevel,
  type StoryWordTargetField
} from "@debateai/kernel";
import { promptContractFingerprintText, type PromptContract } from "@debateai/providers";
import { assembleStoryCheckerInstruction, assembleStorytellerInstruction, type StoryPack, type StoryV4Options } from "./pack.js";

/**
 * THE TWO STORY CONTRACTS (spec §5.2). The instruction half is the owners'
 * pack; the answer forms below are CODE'S, ride inside the safety frame, and
 * no pack edit can reach them. Both forms are pinned byte for byte in
 * `tests/unit/prompt-text-pins.test.ts`: once a story has shipped, changing one
 * is a new contract id. The shipped storyteller v1 and v2 forms and the checker's
 * v1 form stay below as history; v2 added compact writing targets without
 * changing the hard limits, and storyteller v3 and checker v2 (story format
 * robustness, 2026-10-12) add how to quote, and for the checker that the
 * criteria are always required, after real preview replies broke the JSON with
 * a straight quote or left the criteria out. Checker v3 (R15 practice debate, 2026-10-13) raises the
 * objection's limit from 2000 to 4000 characters: since the story wording of 2026-10-12 the checker lists
 * every problem in one objection, one short sentence each, and a real verdict of 2,739 characters was refused
 * for its length alone. v2 stays below as history.
 * Story v4 (engine redesign spec 2026-10-15 §7.2, R1d; absorbs length guidance LG-D): storyteller v4 and checker v4
 * are the forms of an engine-2 debate. They state no character number (a `length` field names each target); the
 * storyteller's has no shape_id (code fills it), puts the long version last after an empty template of the exact
 * nesting, and says how to revise in round 2; the checker's adds misleading. v3 stays the form of every other debate.
 */

export const STORYTELLER_V1_CONTRACT_ID = "story.storyteller.v1" as const;
export const STORYTELLER_V2_CONTRACT_ID = "story.storyteller.v2" as const;
export const STORYTELLER_CONTRACT_ID = "story.storyteller.v3" as const;
export const STORY_CHECKER_V1_CONTRACT_ID = "story.checker.v1" as const;
export const STORY_CHECKER_V2_CONTRACT_ID = "story.checker.v2" as const;
export const STORY_CHECKER_CONTRACT_ID = "story.checker.v3" as const;
export const STORYTELLER_V4_CONTRACT_ID = "story.storyteller.v4" as const;
export const STORY_CHECKER_V4_CONTRACT_ID = "story.checker.v4" as const;

/**
 * Both current forms end with this sentence. A straight double quote inside a JSON text ends that text; a
 * Romanian checker wrote „…" with a straight closing quote and its whole verdict was lost (2026-10-12).
 */
const STORY_QUOTE_SENTENCE = "No text contains a straight double quote (\"): to quote words, use typographic quotes such as „ ” or « », or escape the straight quote as \\\".";

/** Shipped v1 history: every byte mirrors the original `StoryBodySchema` and deterministic-check contract. */
export const STORYTELLER_V1_ANSWER_FORM = `Return only one JSON object with exactly the following schema and no additional keys, with no text before or after it and no code fence. Every string is plain text: no Markdown, no HTML, no links, no control characters other than line feed and tab, and no bidirectional embedding, override or isolate characters (U+202A to U+202E and U+2066 to U+2069).
{
  "shape_id": the id of one shape offered in the instruction,
  "short": {
    "headline": non-empty string of at most 160 characters,
    "summary": non-empty string of at most 900 characters, one paragraph,
    "confidence": non-empty string of at most 300 characters, one sentence,
    "paths": [{ "position_ref": id of a position, "fate": "HELD_UP" | "PARTLY_HELD" | "FELL" | "SET_ASIDE", "line": non-empty string of at most 240 characters, "node_refs": [id, ...] }, ...],
    "change": { "text": non-empty string of at most 400 characters, "node_refs": [id, ...] }
  },
  "why": {
    "reasons": [{ "text": non-empty string of at most 700 characters, "node_refs": [id, ...] }, ...]
  },
  "long": {
    "sections": [{ "title": non-empty string of at most 80 characters, "paragraphs": [{ "text": non-empty string of at most 2000 characters, "node_refs": [id, ...] }, ...] }, ...]
  },
  "reviewer_note": null | { "text": non-empty string of at most 1200 characters, "node_refs": [id, ...] }
}
short.paths has one entry per position in the positions field, each position exactly once, and at most 8 entries: when there are more than 8 positions it has exactly 8, for the first 8 positions listed. why.reasons has 1 to 3 entries. long.sections has 3 to 12 entries and each has 1 to 12 paragraphs. Every node_refs array has at most 40 entries, each copied exactly from an id in the points field, and each position_ref is copied exactly from an id in the positions field. A text of long or why may name a point by its id, such as P3, but sparingly, and every point a text rests on must be listed in that entry's node_refs. The texts of short (the headline, the summary, the confidence sentence, each path line and the change text) and the text of reviewer_note never mention a point number such as P3: they are shown on the site, where there is no appendix.
Every text speaks to the person about their question, never about how the debate was run: no internal ids and no engine words such as judge, evaluator, checker, reviewer, runner-up, margin, band or rung. No text contains a score or a threshold from the material, in any form such as 0.64, 0,64 or 0,7: say in words what it means. The headline and the summary always state the best answer to the question plainly, even when it is a close call or rests on weak evidence, and never say that the debate did not settle it. short.confidence is one sentence saying how sure we are and what that rests on in this debate, never surer than the label and the confidence band allow.`;

/** Shipped v2 history: v1's full hard contract plus soft targets that leave room below the caps. */
export const STORYTELLER_V2_ANSWER_FORM = `${STORYTELLER_V1_ANSWER_FORM}

Write the short version compactly. Aim for about 500 characters in short.summary and about 200 characters in short.change.text, including spaces and punctuation. These are writing targets, not new limits: every hard limit and rule above still applies. Keep the headline, confidence sentence and each path line concise. Put supporting detail in why and long.`;

/** Current form: v2 plus how to quote. */
export const STORYTELLER_ANSWER_FORM = `${STORYTELLER_V2_ANSWER_FORM}
${STORY_QUOTE_SENTENCE}`;

/** Shipped v1 history. Mirrors `StoryCheckerVerdictSchema` in `validate.ts`. */
export const STORY_CHECKER_V1_ANSWER_FORM = `Return only one JSON object with exactly the following schema and no additional keys, with no text before or after it and no code fence:
{
  "satisfied": boolean,
  "objection": null | non-empty string of at most 2000 characters,
  "criteria": {
    "faithful_to_material": boolean,
    "agrees_with_label": boolean,
    "fair_to_losing_paths": boolean,
    "no_overstatement": boolean,
    "citations_correct": boolean,
    "reviewer_note_separate": boolean,
    "goal_marked_as_reading": boolean,
    "speaks_to_the_person": boolean
  }
}
When satisfied is true, every criterion must be true. When satisfied is false, objection must be a non-empty string. In the objection, refer to points by their ids, such as P7.`;

/** The criteria rule two real verdicts broke (checker v2 onward). */
const STORY_CHECKER_CRITERIA_SENTENCE = "The criteria object is always required, with all eight booleans, whether satisfied is true or false.";

/** Shipped v2 history: v1 plus the criteria rule two real verdicts broke, and how to quote. */
export const STORY_CHECKER_V2_ANSWER_FORM = `${STORY_CHECKER_V1_ANSWER_FORM}
${STORY_CHECKER_CRITERIA_SENTENCE} ${STORY_QUOTE_SENTENCE}`;

/** The objection's limit in v1 and v2, and since v3 (`StoryCheckerVerdictSchema` in `validate.ts` mirrors it). */
const STORY_CHECKER_V1_OBJECTION_LIMIT = "\"objection\": null | non-empty string of at most 2000 characters,";
// R15 into dev (2026-10-13): a frozen limits object, as STORY_PACK_LIMITS and @debateai/contract's STORY_BODY_LIMITS,
// because the source-purity law (tools/orphan-audit, J10(b)) refuses an exported bare number. The value and every
// byte of the checker v3 form it is written into are unchanged.
export const STORY_CHECKER_LIMITS = Object.freeze({ maxObjectionChars: 4000 });

/**
 * LG-A (spec 2026-10-15 §3.4, L28): the checker objection's runaway guard, read by StoryCheckerVerdictSchema
 * (validate.ts). The v3 form keeps stating STORY_CHECKER_LIMITS' 4000, so its bytes and hash do not move.
 */
export const STORY_CHECKER_RUNAWAY_LIMITS = Object.freeze({ maxObjectionChars: 30000 });

/**
 * Current form: v2 byte for byte except the objection's limit, 4000 characters instead of 2000 (R15 practice
 * debate, 2026-10-13: the checker now lists every problem, one short sentence each, and 2000 did not hold them).
 */
export const STORY_CHECKER_ANSWER_FORM = STORY_CHECKER_V2_ANSWER_FORM.replace(
  STORY_CHECKER_V1_OBJECTION_LIMIT,
  `"objection": null | non-empty string of at most ${STORY_CHECKER_LIMITS.maxObjectionChars} characters,`
);

/**
 * Story v4 (spec §7.2 item 8, design decision 3): how round 2 is asked. The round-2 call repeats the round-1 material,
 * then the storyteller's own accepted draft as its own turn, then ONE fenced block holding `revision_problems`. The
 * safety frame makes every fenced block evidence, never an instruction, so the instruction to revise is code's and
 * rides here, in the answer form. OWNER WORDING — approve before switch-on (option 1; ships behind the engine row).
 */
export const STORY_REVISION_FOLLOW_UP = "When a later block carries revision_problems right after your own earlier story, correct what those problems name, keep the rest of your story as it is, and return the whole corrected story in this form.";

/**
 * Story v4 (spec §7.2 items 2, 3, 8; rulings L10, L11, L35; absorbs LG-D): the storyteller's form for an engine-2 debate.
 * Every v3 count and reference rule is kept. Changes: no character number anywhere (the `length` field names a target
 * for each short text and each reason; the long version and the reviewer's note have none); NO shape_id member (code
 * sets it from the one shape it sent, INTERFACE §5.4); the members in the order short, why, reviewer_note, then long
 * LAST, so a reply broken or cut off late loses only the long version; an empty template of the exact nesting, because
 * the real slips of 2026-10-14 were nesting slips; node_refs may cite a position as well as a point, because the v4
 * material carries each position once, in `positions` only (Task 13); and the round-2 revision sentence. The schema's
 * runaway limits (STORY_RUNAWAY_LIMITS) are not stated: they only stop a runaway reply.
 * OWNER WORDING — approve before switch-on: every sentence new against v3 (Task 10 review 1) — the order sentence, the
 * reviewer_note placement sentence, "long holds only sections", the empty-template line, the "points field or the
 * positions field" clause, the length sentence and STORY_REVISION_FOLLOW_UP (option-1 drafts; LG-D's sentences among
 * them carried as LG-D wrote them).
 */
export const STORYTELLER_V4_ANSWER_FORM = `Return only one JSON object with exactly the following schema and no additional keys, with no text before or after it and no code fence. Every string is plain text: no Markdown, no HTML, no links, no control characters other than line feed and tab, and no bidirectional embedding, override or isolate characters (U+202A to U+202E and U+2066 to U+2069).
{
  "short": {
    "headline": non-empty string,
    "summary": non-empty string, one paragraph,
    "confidence": non-empty string, one sentence,
    "paths": [{ "position_ref": id of a position, "fate": "HELD_UP" | "PARTLY_HELD" | "FELL" | "SET_ASIDE", "line": non-empty string, "node_refs": [id, ...] }, ...],
    "change": { "text": non-empty string, "node_refs": [id, ...] }
  },
  "why": {
    "reasons": [{ "text": non-empty string, "node_refs": [id, ...] }, ...]
  },
  "reviewer_note": null | { "text": non-empty string, "node_refs": [id, ...] },
  "long": {
    "sections": [{ "title": non-empty string, "paragraphs": [{ "text": non-empty string, "node_refs": [id, ...] }, ...] }, ...]
  }
}
Write the members in this order: short, why, reviewer_note, and long last, with nothing after long but the object's closing brace. reviewer_note belongs to the object itself, beside short, why and long, never inside one of them, and it is null or one object with text and node_refs, never a string or a list. long holds only sections. The exact nesting, empty, with one entry in each list:
{"short": {"headline": "", "summary": "", "confidence": "", "paths": [{"position_ref": "", "fate": "", "line": "", "node_refs": []}], "change": {"text": "", "node_refs": []}}, "why": {"reasons": [{"text": "", "node_refs": []}]}, "reviewer_note": null, "long": {"sections": [{"title": "", "paragraphs": [{"text": "", "node_refs": []}]}]}}
short.paths has one entry per position in the positions field, each position exactly once, and at most 8 entries: when there are more than 8 positions it has exactly 8, for the first 8 positions listed. why.reasons has 1 to 3 entries. long.sections has 3 to 12 entries and each has 1 to 12 paragraphs. Every node_refs array has at most 40 entries, each copied exactly from an id in the points field or the positions field, and each position_ref is copied exactly from an id in the positions field. A text of long or why may name a point by its id, such as P3, but sparingly, and every point a text rests on must be listed in that entry's node_refs. The texts of short (the headline, the summary, the confidence sentence, each path line and the change text) and the text of reviewer_note never mention a point number such as P3: they are shown on the site, where there is no appendix.
Every text speaks to the person about their question, never about how the debate was run: no internal ids and no engine words such as judge, evaluator, checker, reviewer, runner-up, margin, band or rung. No text contains a score or a threshold from the material, in any form such as 0.64, 0,64 or 0,7: say in words what it means. The headline and the summary always state the best answer to the question plainly, even when it is a close call or rests on weak evidence, and never say that the debate did not settle it. short.confidence is one sentence saying how sure we are and what that rests on in this debate, never surer than the label and the confidence band allow.
The length field names a target length, never a limit, for each text of short and for each text of why.reasons; the texts of long and of reviewer_note have none.
${STORY_REVISION_FOLLOW_UP}
${STORY_QUOTE_SENTENCE}`;

/**
 * Story v4 (spec §7.2 item 7, E5; INTERFACE §5.3): the checker's form for an engine-2 debate: v2's schema with
 * `misleading` after `satisfied`, no number on the objection (the `length` field names its target; the schema keeps a
 * runaway limit only), and the rule tying misleading to an objection, which `StoryCheckerV4VerdictSchema` (Task 12)
 * enforces. Only a misleading problem starts round 2. OWNER WORDING — approve before switch-on: the misleading member and the
 * two rule sentences (option-1 drafts).
 */
export const STORY_CHECKER_V4_ANSWER_FORM = `Return only one JSON object with exactly the following schema and no additional keys, with no text before or after it and no code fence:
{
  "satisfied": boolean,
  "misleading": boolean,
  "objection": null | non-empty string,
  "criteria": {
    "faithful_to_material": boolean,
    "agrees_with_label": boolean,
    "fair_to_losing_paths": boolean,
    "no_overstatement": boolean,
    "citations_correct": boolean,
    "reviewer_note_separate": boolean,
    "goal_marked_as_reading": boolean,
    "speaks_to_the_person": boolean
  }
}
When satisfied is true, misleading is false and every criterion must be true. When satisfied is false, objection must be a non-empty string, and misleading says whether at least one problem in it would mislead the person. In the objection, refer to points by their ids, such as P7.
${STORY_CHECKER_CRITERIA_SENTENCE} ${STORY_QUOTE_SENTENCE}`;

/**
 * Debate shape (whole-branch review I-1, ruling W-STORY): `mapFields` is true only when the material sent carries
 * `also_raised` or `answers_note` (`storyMaterialHasMapFields`); then the pack's map passages ride in the instruction.
 * Story v4 (R1d): `v4` is set only for an engine-2 debate (the receipt's `engine` member); then the contract is v4,
 * with the pack's v4 passages and the ONE shape it names. `v4` null: the contract every story got before, byte for
 * byte (same id, same hash).
 */
export function buildStorytellerContract(pack: StoryPack, mapFields = false, v4: StoryV4Options | null = null): PromptContract {
  return Object.freeze({
    contractId: v4 === null ? STORYTELLER_CONTRACT_ID : STORYTELLER_V4_CONTRACT_ID,
    instruction: assembleStorytellerInstruction(pack, mapFields, v4),
    answerForm: v4 === null ? STORYTELLER_ANSWER_FORM : STORYTELLER_V4_ANSWER_FORM
  });
}

export function buildStoryCheckerContract(pack: StoryPack, mapFields = false, v4: StoryV4Options | null = null): PromptContract {
  return Object.freeze({
    contractId: v4 === null ? STORY_CHECKER_CONTRACT_ID : STORY_CHECKER_V4_CONTRACT_ID,
    instruction: assembleStoryCheckerInstruction(pack, mapFields, v4),
    answerForm: v4 === null ? STORY_CHECKER_ANSWER_FORM : STORY_CHECKER_V4_ANSWER_FORM
  });
}

/** Length guidance (LG-D): how each short target is named in the `length` field, as the v4 form names the texts. */
const STORY_LENGTH_FIELD_LABELS: Readonly<Record<StoryWordTargetField, string>> = Object.freeze({
  headline: "short.headline",
  summary: "short.summary",
  confidence: "short.confidence",
  positionLine: "each short.paths line",
  change: "short.change.text",
  whyReason: "each why.reasons text"
});

function storyTargetLines(targets: Readonly<Record<StoryWordTargetField, number>>, languageCode: string | null,
  charactersPerWord: CharactersPerWord): string[] {
  return STORY_WORD_TARGET_FIELDS.map((field) =>
    `${STORY_LENGTH_FIELD_LABELS[field]}: ${lengthGuidanceText(targets[field], languageCode, charactersPerWord)}`);
}

/**
 * Length guidance (spec 2026-10-15 length §3.2, LG-D): the storyteller's `length` material field, one line per short
 * target in the order of STORY_WORD_TARGET_FIELDS ("short.headline: about 15 words"; "about N characters" for zh, ja
 * and th). The long version has no line: it has no target (L10).
 */
export function storyLengthField(targets: Readonly<Record<StoryWordTargetField, number>>, languageCode: string | null,
  charactersPerWord: CharactersPerWord): Readonly<{ name: typeof LENGTH_FIELD; content: string }> {
  return Object.freeze({ name: LENGTH_FIELD, content: storyTargetLines(targets, languageCode, charactersPerWord).join("\n") });
}

/** The checker's `length` field: the storyteller's targets, then its own objection's ("objection: about 250 words"). */
export function storyCheckerLengthField(targets: Readonly<Record<StoryWordTargetField, number>>, objectionWords: number,
  languageCode: string | null, charactersPerWord: CharactersPerWord): Readonly<{ name: typeof LENGTH_FIELD; content: string }> {
  return Object.freeze({
    name: LENGTH_FIELD,
    content: [...storyTargetLines(targets, languageCode, charactersPerWord),
      `objection: ${lengthGuidanceText(objectionWords, languageCode, charactersPerWord)}`].join("\n")
  });
}

/**
 * V4 reading level (owner ruling N6, 2026-10-29): with the run's level, the storyteller's instruction gains the writers'
 * reader sentence (READER_SENTENCE_WRITING) and the checker's the story checker's (READER_SENTENCE_STORY_CHECKER), after a
 * blank line, as the language line is added; the level itself rides as the material field `reader`. Call it BEFORE
 * `storyContractInArgumentLanguage`, so the language line stays last. Code's sentences, never the pack's: they enter the
 * per-call `storyContractHash`, as the language line does. No level (null): the same contract, today's bytes.
 * OWNER WORDING — pending approval.
 */
export function storyContractForReader(
  contract: PromptContract,
  readingLevel: ReadingLevel | null,
  role: "STORYTELLER" | "CHECKER"
): PromptContract {
  if (readingLevel === null) return contract;
  const sentence = role === "STORYTELLER" ? READER_SENTENCE_WRITING : READER_SENTENCE_STORY_CHECKER;
  return Object.freeze({ ...contract, instruction: `${contract.instruction}\n\n${sentence}` });
}

/**
 * The contract in the question's language (spec §14.1): dev's argument-language
 * directive appended to the instruction, as the runner appends it to the
 * synthesizer's and the evaluator's (`promptContractInArgumentLanguage`). It is
 * code's sentence, never part of the owners' pack, and it rides in the one
 * system message with the rest of the instruction. A blank line sets it apart:
 * the storyteller's instruction ends inside the last shape's guidance, and the
 * directive must not read as part of that shape. A run with no language on
 * record gets the directive's own fallback, "the same language as the question".
 *
 * Question-language spec 2026-10-13: on a shape run the caller (the writer, told by the runner's shape receipt)
 * passes the run's locked language, and the ONE named sentence (`questionLanguageSentence`) takes the directive's
 * place, after the same blank line. Without a lock (null or absent) this is today's contract, byte for byte. The
 * sentence is code, never sealed text: it enters the per-call `storyContractHash`, as today's directive does.
 */
export function storyContractInArgumentLanguage(
  contract: PromptContract,
  argumentLanguageName: string | null,
  questionLanguage?: QuestionLanguage | null
): PromptContract {
  const languageLine = questionLanguage === null || questionLanguage === undefined
    ? argumentLanguageDirective(argumentLanguageName ?? "")
    : questionLanguageSentence(questionLanguage);
  return Object.freeze({
    ...contract,
    instruction: `${contract.instruction}\n\n${languageLine}`
  });
}

/**
 * The full hash of the contract actually sent: frame version, id, the pack's
 * instruction with the language directive, and the code's answer form. Every
 * story call records it, so a story traces to the exact pack bytes that wrote it.
 */
export function storyContractHash(contract: PromptContract): string {
  return createHash("sha256").update(promptContractFingerprintText(contract), "utf8").digest("hex");
}
