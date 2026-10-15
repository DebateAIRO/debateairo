/**
 * READING A MODEL'S JSON ANSWER (story format robustness, 2026-10-12).
 *
 * Plain words: a model asked for one JSON object sometimes wraps it in a code fence, writes its thinking
 * before it, closes a quotation with a straight double quote inside a text, or leaves off the last brace.
 * `decodeModelJson` reads such an answer in a fixed order and names the one repair it needed, so callers
 * can count them. It never repairs anything else, it never repairs an answer that was cut off at its token
 * ceiling, and what it returns is only a decoded value: the caller still runs its full schema and content
 * checks on it, and the stored artifact stays the vendor's own bytes.
 *
 * The fence reader and the object scanner are shared with the judge's parsing strategies
 * (`packages/judgement/src/s04.ts` parseStructuredArtifact), which keep their own order and names; since all-steps
 * format robustness (2026-10-12) its last two strategies are this file's two late repairs (`modelJsonLateRepair`).
 */
import type { ContentClassification } from "./index.js";

/** How a reply ended, as the gateway observed it (`choices[0].finish_reason`; Anthropic's stop reason, normalised). */
export interface ModelReplyFacts {
  readonly finishReason: string | null;
}

/**
 * The repairs, in the order they are tried after strict JSON:
 *  · CODE_FENCE — the body of one code fence;
 *  · OUTERMOST_OBJECT — the one top-level object when prose stands before or after it;
 *  · INNER_QUOTE — a straight double quote inside a string value that cannot be that string's end, read as escaped;
 *  · STRAY_QUOTE — one straight double quote standing after the last complete value, with only closing brackets after
 *    it (MiMo-V2.6-Pro, 2026-10-12: `…}]}"}`), dropped;
 *  · CLOSING_BRACKETS — the brackets still open at the very end appended, only for a reply that finished normally;
 *  · TRAILING_OBJECT — (R15 practice debate, 2026-10-13) for a reply that finished normally and opens with prose (its
 *    reasoning written out), the ONE complete object that ends it, bare or inside the reply's one code fence, read
 *    strictly or with INNER_QUOTE or STRAY_QUOTE; made only when the caller asks for it and its check accepts the value
 *    (`ModelJsonDecodeOptions.trailingObjectAccepted`: the step's full schema), never otherwise.
 */
const MODEL_JSON_REPAIRS = Object.freeze(["CODE_FENCE", "OUTERMOST_OBJECT", "INNER_QUOTE", "STRAY_QUOTE", "CLOSING_BRACKETS", "TRAILING_OBJECT"] as const);
/**
 * The judge's SHAPE repairs (`packages/judgement/src/s04.ts`), each made only after a decoded object failed its step's
 * schema, and each accepted only when the repaired object then passes that full schema:
 *  · NESTED_FIELDS (judge nested fields, 2026-10-12, `nestedFieldsPlan`): a flattened member nested again;
 *  · RENAMED_MEMBER (MiMo salvage, 2026-10-12): the one missing object member found under one key the schema never
 *    asked for, whose value passes that member's own schema exactly ("critique" for "critic");
 *  · UNASKED_KEYS (MiMo salvage, 2026-10-12): root keys the schema never asked for dropped, every asked member present
 *    and valid ("way_of_kooking" beside "way_of_knowing");
 *  · EMPTY_LIST (MiMo salvage, 2026-10-12): a missing root list the schema pins to exactly 0 entries (a review of a node
 *    with no edges: `edge_bearings` can only be []) filled with the one value it admits.
 * `decodeModelJson` never makes them: it does not know any schema.
 */
const MODEL_JSON_SHAPE_REPAIRS = Object.freeze(["NESTED_FIELDS", "RENAMED_MEMBER", "UNASKED_KEYS", "EMPTY_LIST"] as const);
/**
 * The map's SALVAGE repairs (`packages/map/src/salvage.ts`, ruling MAP-SALVAGE 2026-10-14), each made by the map's own
 * reader before any follow-up call, on a decoded reply, and accepted only when the salvaged reply then passes the step's
 * full schema and content check:
 *  · MAP_TEXT_TRIMMED: a too long INTERNAL text (an angle's label or focus, a point's why_it_matters, a framing
 *    challenge) cut at its last word boundary within the limit; a text that can reach a reader is never cut;
 *  · MAP_LEANS_DEFAULTED: a point's missing or unknown `leans` read as "context";
 *  · MAP_IDS_DROPPED: a choose answer's key point ids that are unknown, repeated, or on both of its sides dropped.
 * `decodeModelJson` never makes them: it does not know any schema.
 */
const MAP_REPLY_SALVAGE_REPAIRS = Object.freeze(["MAP_TEXT_TRIMMED", "MAP_LEANS_DEFAULTED", "MAP_IDS_DROPPED"] as const);
export type MapReplySalvageRepair = typeof MAP_REPLY_SALVAGE_REPAIRS[number];
/**
 * The repair codes a classification can name (`ContentClassification.jsonRepair`): this file's six decode repairs, the
 * judge's shape repairs (`MODEL_JSON_SHAPE_REPAIRS`) and the map's salvage repairs (`MAP_REPLY_SALVAGE_REPAIRS`).
 */
export type ModelJsonRepair = typeof MODEL_JSON_REPAIRS[number] | typeof MODEL_JSON_SHAPE_REPAIRS[number] | MapReplySalvageRepair;

export type ModelJsonDecoded =
  | { readonly ok: true; readonly value: unknown; readonly repair: typeof MODEL_JSON_REPAIRS[number] | null }
  | { readonly ok: false; readonly error: string };

/**
 * What a caller lets the decode do beyond its fixed repairs.
 *
 * `trailingObjectAccepted` (R15 practice debate, 2026-10-13): MiMo-V2.6-Pro, asked for the story check, wrote its whole
 * check out as prose and only then the verdict, in a ```json fence at the very end, with a straight quote closing a „…"
 * quotation inside the objection. No earlier repair reads that (the prose holds quotes of its own). (That verdict also
 * left out its criteria, so it is still refused, by the schema; a whole one is now read.) With this check given, the
 * decode's last resort is TRAILING_OBJECT, and its value is returned only
 * when the check accepts it, so a trailing object that fails the step's schema stays the PARSE_FAILED it was. Without
 * the check the repair is never made: every caller that does not ask reads every reply exactly as before.
 */
export interface ModelJsonDecodeOptions {
  readonly trailingObjectAccepted?: (value: unknown) => boolean;
}

/** The finish reasons that mean the model ended its answer itself (OpenAI-compatible "stop"; Anthropic's two). */
const NORMAL_FINISH_REASONS: ReadonlySet<string> = new Set(["stop", "end_turn", "stop_sequence"]);
/** The normalised truncation (`PROVIDER_FINISH_REASON_LENGTH`): never repaired. */
const TRUNCATED_FINISH_REASON = "length";

/** True only when the reply is known to have ended normally; an unknown ending is not normal. */
function modelReplyFinishedNormally(reply: ModelReplyFacts | undefined): boolean {
  return reply !== undefined && reply.finishReason !== null && NORMAL_FINISH_REASONS.has(reply.finishReason);
}

const FENCE = "```";

/**
 * CI-1b (CodeQL js/polynomial-redos, PR #8): the judge's ONE_FENCE strategy used to be
 * `/^\s*```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i`. Its adjacent `\s*`, `\n?`
 * and lazy body can split one run of blanks in quadratically many ways, and
 * `content` is model text — "```" and 100 000 newlines took about 4.6 s. This
 * returns the same capture in one linear pass, clause for clause:
 * - `^\s*` and `\s*$`: `trim()` strips exactly the `\s` set;
 * - the two fences: the trimmed text starts and ends with "```" and is at least
 *   six characters long, so no backtick belongs to both fences;
 * - `(?:json)?`: greedy, so a case-insensitive "json" right after the opening
 *   fence is always taken — the closing fence can never begin inside it;
 * - `\s*\n?`: greedy, so every blank after the tag goes (`trimStart()`);
 * - the lazy body and `\n?`: the body stops before one newline that sits
 *   against the closing fence, when the tag's blanks did not already take it.
 */
export function modelJsonFenceBody(content: string): string | null {
  const text = content.trim();
  if (text.length < 2 * FENCE.length || !text.startsWith(FENCE) || !text.endsWith(FENCE)) return null;
  const tagEnd = /^json$/i.test(text.slice(FENCE.length, FENCE.length + 4))
    ? FENCE.length + 4
    : FENCE.length;
  const body = text.slice(tagEnd, text.length - FENCE.length).trimStart();
  return body.endsWith("\n") ? body.slice(0, -1) : body;
}

/**
 * The balanced `{…}` spans of `text`, each from a brace found outside any span to its matching close,
 * reading strings as strings (an escaped quote stays inside its string, a brace inside a string is not
 * counted). Prose between spans is never read as JSON. A span that never closes ends the scan. Linear.
 */
export function* modelJsonObjectSpans(text: string): Generator<string> {
  let from = 0;
  for (;;) {
    const start = text.indexOf("{", from);
    if (start < 0) return;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index]!;
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === "\"") inString = false;
        continue;
      }
      if (character === "\"") inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) { end = index; break; }
      }
    }
    if (end < 0) return;
    yield text.slice(start, end + 1);
    from = end + 1;
  }
}

const isPlainObject = (value: unknown): boolean =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parsed(text: string): { readonly value: unknown } | null {
  try { return { value: JSON.parse(text) }; } catch { return null; }
}

/**
 * (iii) The one object the reply holds. A reply that itself opens with an object keeps that object (only the
 * prose after it is dropped): a member object further on is never taken in its place. A reply that opens with
 * prose gives the LAST complete top-level object that decodes as an object.
 */
function outermostObject(content: string): { readonly value: unknown } | null {
  const text = content.trim();
  if (text.startsWith("{")) {
    const first = modelJsonObjectSpans(text).next();
    if (first.done === true) return null;
    const own = parsed(first.value);
    return own !== null && isPlainObject(own.value) ? own : null;
  }
  let last: { readonly value: unknown } | null = null;
  for (const span of modelJsonObjectSpans(text)) {
    const candidate = parsed(span);
    if (candidate !== null && isPlainObject(candidate.value)) last = candidate;
  }
  return last;
}

const isBlank = (character: string | undefined): boolean =>
  character === " " || character === "\t" || character === "\n" || character === "\r";

function nextSignificant(text: string, from: number): number {
  let index = from;
  while (index < text.length && isBlank(text[index])) index += 1;
  return index;
}

/**
 * (iv) Inside a string VALUE, a straight double quote is the string's end only where JSON can go on after a
 * value: the end of the text, `}` or `]`, or a `,` followed by the next member's opening quote (an array may
 * also go on with any other value). Any other straight quote there is the model's own quotation mark, written
 * unescaped, and is escaped. Keys are read strictly. Returns null when nothing needed escaping.
 */
function escapeInnerQuotes(text: string): string | null {
  type Container = { kind: "object" | "array"; expectKey: boolean };
  const stack: Container[] = [];
  let out = "";
  let changed = false;
  let index = 0;
  while (index < text.length) {
    const character = text[index]!;
    if (character !== "\"") {
      out += character;
      const top = stack.at(-1);
      if (character === "{") stack.push({ kind: "object", expectKey: true });
      else if (character === "[") stack.push({ kind: "array", expectKey: false });
      else if (character === "}" || character === "]") stack.pop();
      else if (character === ":" && top?.kind === "object") top.expectKey = false;
      else if (character === "," && top?.kind === "object") top.expectKey = true;
      index += 1;
      continue;
    }
    const top = stack.at(-1);
    const isKey = top?.kind === "object" && top.expectKey;
    out += "\"";
    index += 1;
    let escaped = false;
    for (; index < text.length; index += 1) {
      const inner = text[index]!;
      if (escaped) { escaped = false; out += inner; continue; }
      if (inner === "\\") { escaped = true; out += inner; continue; }
      if (inner !== "\"") { out += inner; continue; }
      if (isKey || closesValue(text, index + 1, top?.kind ?? null)) break;
      out += "\\\"";
      changed = true;
    }
    if (index < text.length) { out += "\""; index += 1; }
  }
  return changed ? out : null;
}

/** Whether JSON can go on after a value that a quote just before `from` would end, inside `container`. */
function closesValue(text: string, from: number, container: "object" | "array" | null): boolean {
  const next = nextSignificant(text, from);
  if (next >= text.length) return true;
  const character = text[next]!;
  if (character === "}" || character === "]") return true;
  if (character !== ",") return false;
  const at = nextSignificant(text, next + 1);
  const after = text[at];
  if (after === "\"") return true;
  return container === "array" && after !== undefined
    && (after === "{" || after === "[" || after === "-" || (after >= "0" && after <= "9") || /^(?:true|false|null)\b/u.test(text.slice(at, at + 6)));
}

/**
 * (v) The brackets still open at the very end, closed in order. Null when nothing is open, when the text
 * ends inside a string, or when a closer does not match its opener: those are not this repair.
 */
function closeOpenBrackets(text: string): string | null {
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") inString = true;
    else if (character === "{") open.push("}");
    else if (character === "[") open.push("]");
    else if (character === "}" || character === "]") {
      if (open.pop() !== character) return null;
    }
  }
  if (inString || open.length === 0) return null;
  return `${text.trimEnd()}${open.reverse().join("")}`;
}

/**
 * (v) MiMo salvage (2026-10-12, debate 2 seq 437): a reply that is one complete object except for ONE straight double
 * quote standing right after a closed object or list, with nothing but closing brackets (and blanks) after it to the
 * very end — `…"description":"…instead."}]}"}`. Outside a string, a quote right after a value can only start a key,
 * and a key needs a comma before it and a colon after it: here there is neither, so it can be nothing but a stray
 * character. The text without it is returned; the caller accepts it only if it then decodes in full as one object.
 * Null when the end does not have exactly that form. Linear, from the end (model text is untrusted, CI-1b).
 */
function dropStrayClosingQuote(text: string): string | null {
  let index = text.length - 1;
  let closers = 0;
  while (index >= 0 && (isBlank(text[index]) || text[index] === "}" || text[index] === "]")) {
    if (!isBlank(text[index])) closers += 1;
    index -= 1;
  }
  if (closers === 0 || index < 0 || text[index] !== "\"") return null;
  const quote = index;
  index -= 1;
  while (index >= 0 && isBlank(text[index])) index -= 1;
  if (index < 0 || (text[index] !== "}" && text[index] !== "]")) return null;
  return `${text.slice(0, quote)}${text.slice(quote + 1)}`;
}

/**
 * The three late repairs, (iv), (v) then (vi), on one candidate text: the body of one code fence when there is one,
 * else the whole reply, trimmed. (vi) is tried only when the reply finished normally. Null when none decodes. Shared by
 * `decodeModelJson` and the judge's parsing strategies (`packages/judgement/src/s04.ts`, all-steps format
 * robustness, 2026-10-12), so every structured step gets exactly the same late repairs.
 */
export function modelJsonLateRepair(content: string, reply?: ModelReplyFacts):
  { readonly value: unknown; readonly repair: "INNER_QUOTE" | "STRAY_QUOTE" | "CLOSING_BRACKETS" } | null {
  if (reply?.finishReason === TRUNCATED_FINISH_REASON) return null;
  const base = (modelJsonFenceBody(content) ?? content).trim();
  const quoted = escapeInnerQuotes(base);
  if (quoted !== null) {
    const repaired = parsed(quoted);
    if (repaired !== null) return Object.freeze({ value: repaired.value, repair: "INNER_QUOTE" as const });
  }
  const unstrayed = dropStrayClosingQuote(base);
  if (unstrayed !== null) {
    const repaired = parsed(unstrayed);
    if (repaired !== null && isPlainObject(repaired.value)) return Object.freeze({ value: repaired.value, repair: "STRAY_QUOTE" as const });
  }
  if (modelReplyFinishedNormally(reply)) {
    const closed = closeOpenBrackets(base);
    if (closed !== null) {
      const repaired = parsed(closed);
      if (repaired !== null) return Object.freeze({ value: repaired.value, repair: "CLOSING_BRACKETS" as const });
    }
  }
  return null;
}

/**
 * (vii) The text of the one object that ENDS a reply opening with prose, or null when the reply does not have exactly
 * that form. Two forms, read from the trimmed reply:
 *  · fenced: the reply ends with "```" and holds exactly two fence markers; the object is the fence's body (after an
 *    optional "json" tag), which must start with "{" and end with "}";
 *  · bare: the reply holds no fence marker and ends with "}"; the object runs from the reply's first "{" to its end.
 * Either way the prose before the object must be non-empty and hold no brace at all, so a reply with an earlier object
 * (a draft it later disowned, or several candidates) is never read this way, and a reply whose object is followed by
 * more prose does not end with the object. Linear: indexOf and slices only (model text is untrusted, CI-1b).
 */
function trailingObjectText(content: string): string | null {
  const text = content.trim();
  let prose: string;
  let body: string;
  if (text.endsWith(FENCE)) {
    const open = text.indexOf(FENCE);
    const close = text.length - FENCE.length;
    if (open + FENCE.length > close || text.indexOf(FENCE, open + FENCE.length) !== close) return null;
    prose = text.slice(0, open);
    const tagged = text.slice(open + FENCE.length, close);
    body = (/^json/i.test(tagged) ? tagged.slice(4) : tagged).trim();
  } else {
    if (text.includes(FENCE)) return null;
    const start = text.indexOf("{");
    if (start < 0) return null;
    prose = text.slice(0, start);
    body = text.slice(start);
  }
  if (prose.trim() === "" || prose.includes("{") || prose.includes("}")) return null;
  return body.startsWith("{") && body.endsWith("}") ? body : null;
}

/**
 * (vii) TRAILING_OBJECT: the object `trailingObjectText` finds, decoded in full as one object strictly, else with (iv)
 * the straight quotes inside its texts escaped, else with (v) one stray quote before its closing brackets dropped.
 * Never (vi): the object must be complete. Null when it does not decode.
 */
function trailingObject(content: string): { readonly value: unknown } | null {
  const body = trailingObjectText(content);
  if (body === null) return null;
  for (const candidate of [body, escapeInnerQuotes(body), dropStrayClosingQuote(body)]) {
    if (candidate === null) continue;
    const decoded = parsed(candidate);
    if (decoded !== null && isPlainObject(decoded.value)) return decoded;
  }
  return null;
}

/**
 * THE TOLERANT DECODE. In order: (i) strict JSON; (ii) the body of one code fence; (iii) the outermost object
 * when prose stands around it; (iv) the straight quotes inside string values that cannot end them, escaped;
 * (v) one stray straight quote before the final closing brackets, dropped; (vi) only when the reply finished
 * normally, the brackets still open at the very end, closed. (iv) to (vi) read the fence's body when there is one
 * (`modelJsonLateRepair`). (vii) Last, only when the caller hands `options.trailingObjectAccepted` and the reply
 * finished normally, the one object that ends a reply opening with prose (`trailingObject`), returned only when that
 * check accepts it. Being last, it never changes how a reply any earlier step decodes is read. One repair at most; the
 * first that decodes wins. A reply cut off at its token ceiling (`length`) is decoded strictly or not at all. A
 * failure carries the strict parser's own error, as before this decode existed.
 */
export function decodeModelJson(content: string, reply?: ModelReplyFacts, options?: ModelJsonDecodeOptions): ModelJsonDecoded {
  let strictError: string;
  try {
    return Object.freeze({ ok: true, value: JSON.parse(content), repair: null });
  } catch (error) {
    strictError = error instanceof Error ? error.message : String(error);
  }
  const failed: ModelJsonDecoded = Object.freeze({ ok: false, error: strictError });
  if (reply?.finishReason === TRUNCATED_FINISH_REASON) return failed;
  const accept = (value: unknown, repair: typeof MODEL_JSON_REPAIRS[number]): ModelJsonDecoded => Object.freeze({ ok: true, value, repair });
  const fenced = modelJsonFenceBody(content);
  if (fenced !== null) {
    const body = parsed(fenced);
    if (body !== null) return accept(body.value, "CODE_FENCE");
  }
  const outermost = outermostObject(content);
  if (outermost !== null) return accept(outermost.value, "OUTERMOST_OBJECT");
  const late = modelJsonLateRepair(content, reply);
  if (late !== null) return accept(late.value, late.repair);
  const accepts = options?.trailingObjectAccepted;
  if (accepts === undefined || !modelReplyFinishedNormally(reply)) return failed;
  const trailing = trailingObject(content);
  return trailing !== null && accepts(trailing.value) ? accept(trailing.value, "TRAILING_OBJECT") : failed;
}

/**
 * Story format robustness (2026-10-12), shared by every structured step since all-steps format robustness
 * (2026-10-12): the classifier a call hands the gateway, remembering how the reply it accepted ended and which
 * repair the tolerant decode needed (`jsonRepair` on its classification). The caller then reads the accepted
 * content exactly as the classifier read it (the last repair depends on how the reply ended). A gateway that never
 * classifies leaves nothing remembered: the content is then read with the ending unknown, so the last repair is
 * never made for it.
 */
export function rememberingAcceptedReply(classify: (content: string, reply: ModelReplyFacts | undefined) => ContentClassification) {
  let accepted: Readonly<{ content: string; reply: ModelReplyFacts | undefined; repair: ModelJsonRepair | null }> | null = null;
  return Object.freeze({
    classifyContent: (content: string, reply?: ModelReplyFacts): ContentClassification => {
      const classified = classify(content, reply);
      if (classified.parseStatus === "PARSED") accepted = Object.freeze({ content, reply, repair: classified.jsonRepair ?? null });
      return classified;
    },
    acceptedAs: (content: string): Readonly<{ reply: ModelReplyFacts | undefined; repair: ModelJsonRepair | null }> =>
      accepted !== null && accepted.content === content ? accepted : Object.freeze({ reply: undefined, repair: null })
  });
}
