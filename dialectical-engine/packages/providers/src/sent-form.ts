// packages/providers/src/sent-form.ts
/**
 * THE SENT FORM (Perplexity plan 2026-10-30, task W3-0; the owner's privacy rows: a page's text is never copied into the
 * records of the AI calls, it lives only in its own encrypted store, migration 0132).
 *
 * Plain words: a call that carries web pages has two forms. The RECORDED form names each page by a reference
 * (`webPageTextRef`, packages/db/src/web-evidence.ts): it is what `ledger.call_prompt` keeps and what a resumed run
 * replays. The SENT form has the page texts filled in, and only the vendor ever gets it. The gateway (./index.ts) makes
 * the sent form from the recorded one just before each POST (`ProviderCallRequest.vendorPacketOf`), checks it here,
 * measures its guards on it, and then forgets it: it is never stored, logged or put in an error.
 *
 * The two rules every sent form follows:
 * - `packetWithPageTexts` fills the texts in. A reference stands in a material block as a whole JSON text (`"<ref>"`),
 *   at whatever escape level the material put it (a field's content is JSON inside the block's own JSON). Each one is
 *   replaced by its text written at that same level, so the block reads back as the same JSON with the texts in it. A
 *   reference anywhere else (the instructions, the AI's own earlier answer), or not standing as a whole text, is refused.
 * - `assertSentForm` holds the sent form to the recorded one: the same turns, the instructions and any answer turn byte
 *   for byte, and the door (`assertFramedPrompt`) passed again with the same fence, canary and contract, so a page text
 *   can never close or forge the frame it was put into.
 */
import { TypedDomainError } from "@debateai/kernel";
import type { PromptPacket } from "./index.js";
import { assertFramedPrompt } from "./prompt-frame.js";

/** A reference that does not stand as a whole JSON text inside a material block. */
export const PROVIDER_PAGE_TEXT_UNPLACED = "PROVIDER_PAGE_TEXT_UNPLACED" as const;
/** A sent form that is not the recorded packet with only its material filled in. */
export const PROVIDER_SENT_FORM_INVALID = "PROVIDER_SENT_FORM_INVALID" as const;
/** A sent form at or over the call's input line (`ProviderCallRequest.sentInputTokensBelow`). */
export const PROVIDER_SENT_INPUT_OVER_LIMIT = "PROVIDER_SENT_INPUT_OVER_LIMIT" as const;

/** One escape level more: how a JSON text's characters stand inside another JSON text. */
const escapedOnce = (text: string): string => JSON.stringify(text).slice(1, -1);
function escapedTimes(text: string, times: number): string {
  let escaped = text;
  for (let level = 0; level < times; level += 1) escaped = escapedOnce(escaped);
  return escaped;
}

const unplaced = (): TypedDomainError =>
  new TypedDomainError(PROVIDER_PAGE_TEXT_UNPLACED, "A page reference stands only as a whole text inside a material block");

/** `content` with every whole-text `ref` replaced by `text`, each written at the escape level its reference stood at. */
function withText(content: string, ref: string, text: string): string {
  let written = "";
  let from = 0;
  for (let at = content.indexOf(ref); at >= 0; at = content.indexOf(ref, from)) {
    // At level L a quote stands as 2^L - 1 backslashes and the quote; the reference needs the same before and after.
    const quoteAt = at - 1;
    if (content[quoteAt] !== "\"") throw unplaced();
    let slashes = 0;
    while (quoteAt - 1 - slashes >= 0 && content[quoteAt - 1 - slashes] === "\\") slashes += 1;
    const level = Math.log2(slashes + 1);
    const closing = `${"\\".repeat(slashes)}"`;
    const end = at + ref.length;
    if (!Number.isInteger(level) || content.slice(end, end + closing.length) !== closing) throw unplaced();
    written += content.slice(from, quoteAt - slashes) + escapedTimes(JSON.stringify(text), level);
    from = end + closing.length;
  }
  return written + content.slice(from);
}

/**
 * The packet with each reference in `texts` (reference to text) filled in. A reference the packet does not hold is
 * skipped; a packet holding none comes back as it is. A reference is plain characters only (no quote, backslash or
 * control character), so it reads the same at every escape level.
 */
export function packetWithPageTexts(packet: PromptPacket, texts: ReadonlyMap<string, string>): PromptPacket {
  for (const [ref, text] of texts) {
    if (typeof ref !== "string" || ref === "" || /["\\\u0000-\u001f]/u.test(ref) || typeof text !== "string") {
      throw new TypeError("PROVIDER_PAGE_TEXT_REF_INVALID");
    }
  }
  const held = [...texts.keys()].filter((ref) => packet.messages.some((message) => message.content.includes(ref)));
  if (held.length === 0) return packet;
  return Object.freeze({
    messages: Object.freeze(packet.messages.map((message) => {
      let content = message.content;
      for (const ref of held) {
        if (!content.includes(ref)) continue;
        if (message.role !== "user") throw unplaced();
        content = withText(content, ref, texts.get(ref)!);
      }
      return content === message.content ? message : Object.freeze({ role: message.role, content });
    }))
  });
}

/**
 * Refuses a sent form that is not `recorded` with only its material blocks changed: the same number of turns, each with
 * the same role, every non-user turn byte for byte, and the door passed again with the same fence, canary and contract
 * (the door's own refusal, such as PROMPT_FRAME_FENCE_FORGED, passes through). The refusal names no content.
 */
export function assertSentForm(recorded: PromptPacket, sent: PromptPacket): void {
  if (sent === recorded) return;
  const invalid = (): TypedDomainError => new TypedDomainError(PROVIDER_SENT_FORM_INVALID,
    "The packet as sent must be the recorded packet with only its material filled in");
  if (typeof sent !== "object" || sent === null || !Array.isArray(sent.messages)
    || sent.messages.length !== recorded.messages.length) throw invalid();
  for (const [index, message] of recorded.messages.entries()) {
    const other = sent.messages[index];
    if (other === undefined || other.role !== message.role || typeof other.content !== "string"
      || (message.role !== "user" && other.content !== message.content)) throw invalid();
  }
  const before = assertFramedPrompt(recorded);
  const after = assertFramedPrompt(sent);
  if (after.fence !== before.fence || after.canary !== before.canary || after.contractId !== before.contractId) throw invalid();
}
