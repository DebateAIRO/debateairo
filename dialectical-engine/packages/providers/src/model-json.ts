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
 *  · CLOSING_BRACKETS — the brackets still open at the very end appended, only for a reply that finished normally.
 */
const MODEL_JSON_REPAIRS = Object.freeze(["CODE_FENCE", "OUTERMOST_OBJECT", "INNER_QUOTE", "CLOSING_BRACKETS"] as const);
/**
 * The repair codes a classification can name (`ContentClassification.jsonRepair`): this file's four decode repairs and
 * NESTED_FIELDS, the judge's one SHAPE repair (judge nested fields, 2026-10-12: `packages/judgement/src/s04.ts`
 * `nestedFieldsPlan`), made only after a decoded object failed the judge artifact's or the panel assessment's schema. `decodeModelJson` never
 * makes NESTED_FIELDS: it does not know any schema.
 */
export type ModelJsonRepair = typeof MODEL_JSON_REPAIRS[number] | "NESTED_FIELDS";

export type ModelJsonDecoded =
  | { readonly ok: true; readonly value: unknown; readonly repair: typeof MODEL_JSON_REPAIRS[number] | null }
  | { readonly ok: false; readonly error: string };

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
 * The two late repairs, (iv) then (v), on one candidate text: the body of one code fence when there is one, else
 * the whole reply, trimmed. (v) is tried only when the reply finished normally. Null when neither decodes. Shared by
 * `decodeModelJson` and the judge's parsing strategies (`packages/judgement/src/s04.ts`, all-steps format
 * robustness, 2026-10-12), so every structured step gets exactly the same two repairs.
 */
export function modelJsonLateRepair(content: string, reply?: ModelReplyFacts):
  { readonly value: unknown; readonly repair: "INNER_QUOTE" | "CLOSING_BRACKETS" } | null {
  if (reply?.finishReason === TRUNCATED_FINISH_REASON) return null;
  const base = (modelJsonFenceBody(content) ?? content).trim();
  const quoted = escapeInnerQuotes(base);
  if (quoted !== null) {
    const repaired = parsed(quoted);
    if (repaired !== null) return Object.freeze({ value: repaired.value, repair: "INNER_QUOTE" as const });
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
 * THE TOLERANT DECODE. In order: (i) strict JSON; (ii) the body of one code fence; (iii) the outermost object
 * when prose stands around it; (iv) the straight quotes inside string values that cannot end them, escaped;
 * (v) only when the reply finished normally, the brackets still open at the very end, closed. (iv) and (v)
 * read the fence's body when there is one (`modelJsonLateRepair`). One repair at most; the first that decodes
 * wins. A reply cut off at its token ceiling (`length`) is decoded strictly or not at all. A failure carries the
 * strict parser's own error, as before this decode existed.
 */
export function decodeModelJson(content: string, reply?: ModelReplyFacts): ModelJsonDecoded {
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
  return late === null ? failed : accept(late.value, late.repair);
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
