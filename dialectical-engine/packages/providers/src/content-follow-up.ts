/**
 * LG-A (spec docs/superpowers/specs/2026-10-15-length-guidance-design.md, L33; INTERFACE §9): the plain sentence a routed
 * call's follow-up carries (`machine_rejection_reason`), so the AI is told in words what is missing, never machine paths
 * alone. Each sentence DESCRIBES the earlier answer; the frame's own fixed sentences already say what to return, so no
 * sentence here is an instruction. Code-owned: the door (prompt-frame.ts) admits exactly these texts, so a block can never
 * carry prose under this name. The wording is the owners' (shown at plan review); a change is a code release, not a
 * register change, and changes no first request and no sealed hash.
 */
import type { ReplyFailureClass } from "./reply-fixer.js";

export const CONTENT_FOLLOW_UP_SENTENCES = Object.freeze({
  EMPTY: "The earlier answer arrived empty: no answer text was received.",
  CUT_OFF: "The earlier answer stopped before it was finished, so its end is missing.",
  SCHEMA_FAILED: "The earlier answer left out a value the answer form requires, or gave a value the form does not allow, at the listed place.",
  // Used only by the full re-ask of an unreadable reply, which names it directly; no code or class selects it.
  STRUCTURE_UNREAD: "The earlier answer could not be read as one JSON object in the answer form, so none of it could be used.",
  TEXT_NOT_IN_QUESTION_LANGUAGE: "Part of the earlier answer was written in a different language from the question.",
  COMPOSED_TEXT_NAMES_A_NODE: "The earlier answer's text names an internal point id, which a reader cannot use.",
  COMPOSED_REF_NOT_IN_DIGEST: "The earlier answer cites a point that is not in the material.",
  STORY_UNKNOWN_NODE_REF: "The earlier answer cites a point that is not in the material.",
  // Pre-flight PF-A32: the map's content codes (packages/map/src/replies.ts), which a routed patch carries as its code.
  MAP_WRONG_LANGUAGE: "Part of the earlier answer was written in a different language from the question.",
  MAP_ANSWER_NAMES_FIELD: "The earlier answer's statement names a field of the answer form or an internal item id instead of speaking about the question, which a reader cannot use.",
  MAP_ANSWER_NO_WORDS: "The earlier answer's statement has no words in it, only signs.",
  MAP_UNKNOWN_ITEM_ID: "The earlier answer lists an item id that is not in the material.",
  MAP_UNKNOWN_KEY_POINT_ID: "The earlier answer cites a key point id that is not in the material.",
  MAP_UNKNOWN_RIVAL: "The earlier answer names as its strongest rival an answer that is not one of its other answers.",
  // R3: the engine-2 map's five
  // OWNER WORDING — approve before switch-on (W10).
  MAP_ID_FORM: "The earlier answer gives an id the form does not allow: an id is 1 to 24 characters, lowercase letters, digits and hyphens.",
  MAP_CHECK_UNKNOWN_ID: "The earlier answer checks an answer id that was not shown.",
  MAP_CHECK_ID_REPEATED: "The earlier answer checks the same answer id more than once.",
  MAP_CHECK_ID_MISSING: "The earlier answer leaves out an answer that was shown, so not every answer was checked.",
  MAP_CHECK_REASON_MISSING: "The earlier answer says an answer fails a check but gives no reason for it.",
  DEFAULT: "The earlier answer did not meet the answer form at the listed place."
});
type ContentFollowUpCode = keyof typeof CONTENT_FOLLOW_UP_SENTENCES;
const SENTENCES: ReadonlySet<string> = new Set(Object.values(CONTENT_FOLLOW_UP_SENTENCES));
// Sentences never selected by a code (a class, the fallback, or the full re-ask names them).
const CLASS_ONLY: ReadonlySet<string> = new Set(["EMPTY", "CUT_OFF", "DEFAULT", "STRUCTURE_UNREAD"]);

/** The sentence for a refusal: the class's own for EMPTY and CUT_OFF, else the code's, else DEFAULT. */
export function contentFollowUpSentence(code: string, failureClass?: ReplyFailureClass): string {
  if (failureClass === "EMPTY" || failureClass === "CUT_OFF") return CONTENT_FOLLOW_UP_SENTENCES[failureClass];
  return Object.hasOwn(CONTENT_FOLLOW_UP_SENTENCES, code) && !CLASS_ONLY.has(code)
    ? CONTENT_FOLLOW_UP_SENTENCES[code as ContentFollowUpCode]
    : CONTENT_FOLLOW_UP_SENTENCES.DEFAULT;
}

/** True only for one of the sentences above, byte for byte (the door's check). */
export function isContentFollowUpSentence(text: string): boolean {
  return SENTENCES.has(text);
}
