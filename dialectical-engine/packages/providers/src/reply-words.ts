/**
 * Length guidance L27 (spec 2026-10-15 §3.6): the words a reply wrote, counted the way the research measured them
 * (`proseWordCount`) on the reply as the engine's tolerant decode reads it. Information only. Null when the reply does not
 * decode (a reply cut off at its token ceiling is decoded strictly or not at all).
 */
import { proseWordCount, type CharactersPerWord } from "@debateai/kernel";
import { decodeModelJson, type ModelReplyFacts } from "./model-json.js";

export function replyWordCount(content: string, reply?: ModelReplyFacts, charactersPerWord?: CharactersPerWord): number | null {
  const decoded = decodeModelJson(content, reply);
  return decoded.ok ? proseWordCount(decoded.value, charactersPerWord) : null;
}
