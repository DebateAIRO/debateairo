import { createHash } from "node:crypto";
import { promptContractFingerprintText, type PromptContract } from "@debateai/providers";
import { assembleStorytellerInstruction, type StoryPack } from "./pack.js";

/**
 * THE TWO STORY CONTRACTS (spec §5.2). The instruction half is the owners'
 * pack; the answer forms below are CODE'S, ride inside the safety frame, and
 * no pack edit can reach them. Both forms are pinned byte for byte in
 * `tests/unit/prompt-text-pins.test.ts`: changing one is a new contract id.
 */

export const STORYTELLER_CONTRACT_ID = "story.storyteller.v1" as const;
export const STORY_CHECKER_CONTRACT_ID = "story.checker.v1" as const;

/** Mirrors `StoryBodySchema` and the checks in `validate.ts`: every member, kind and limit. */
export const STORYTELLER_ANSWER_FORM = `Return only one JSON object with exactly the following schema and no additional keys, with no text before or after it and no code fence. Every string is plain text: no Markdown, no HTML, no links, no control characters other than line feed and tab, and no bidirectional embedding, override or isolate characters (U+202A to U+202E and U+2066 to U+2069).
{
  "shape_id": the id of one shape offered in the instruction,
  "short": {
    "headline": non-empty string of at most 160 characters,
    "summary": non-empty string of at most 900 characters, one paragraph,
    "paths": [{ "position_ref": id of a position, "fate": "HELD_UP" | "PARTLY_HELD" | "FELL" | "SET_ASIDE", "line": non-empty string of at most 240 characters, "node_refs": [id, ...] }, ...],
    "change": { "text": non-empty string of at most 400 characters, "node_refs": [id, ...] }
  },
  "long": {
    "sections": [{ "title": non-empty string of at most 80 characters, "paragraphs": [{ "text": non-empty string of at most 2000 characters, "node_refs": [id, ...] }, ...] }, ...]
  },
  "reviewer_note": null | { "text": non-empty string of at most 1200 characters, "node_refs": [id, ...] }
}
short.paths has one entry per position in the positions field, each position exactly once, and at most 8 entries: when there are more than 8 positions it has exactly 8, for the first 8 positions listed. long.sections has 3 to 12 entries and each has 1 to 12 paragraphs. Every node_refs array has at most 40 entries, each copied exactly from an id in the points field, and each position_ref is copied exactly from an id in the positions field. A text may name a point by its id, such as P3, but sparingly, and every point a text rests on must be listed in that entry's node_refs. The texts of short (the headline, the summary, each path line and the change text) and the text of reviewer_note never mention a point number such as P3: they are shown on the site, where there is no appendix.`;

/** Mirrors `StoryCheckerVerdictSchema` in `validate.ts`. */
export const STORY_CHECKER_ANSWER_FORM = `Return only one JSON object with exactly the following schema and no additional keys, with no text before or after it and no code fence:
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
    "goal_marked_as_reading": boolean
  }
}
When satisfied is true, every criterion must be true. When satisfied is false, objection must be a non-empty string. In the objection, refer to points by their ids, such as P7.`;

export function buildStorytellerContract(pack: StoryPack): PromptContract {
  return Object.freeze({
    contractId: STORYTELLER_CONTRACT_ID,
    instruction: assembleStorytellerInstruction(pack),
    answerForm: STORYTELLER_ANSWER_FORM
  });
}

export function buildStoryCheckerContract(pack: StoryPack): PromptContract {
  return Object.freeze({
    contractId: STORY_CHECKER_CONTRACT_ID,
    instruction: pack.checker,
    answerForm: STORY_CHECKER_ANSWER_FORM
  });
}

/**
 * The full hash of the contract actually sent: frame version, id, the pack's
 * instruction and the code's answer form. Every story call records it, so a
 * story traces to the exact pack bytes that wrote it.
 */
export function storyContractHash(contract: PromptContract): string {
  return createHash("sha256").update(promptContractFingerprintText(contract), "utf8").digest("hex");
}
