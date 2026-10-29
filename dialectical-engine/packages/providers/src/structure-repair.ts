/**
 * LG-A (spec docs/superpowers/specs/2026-10-15-length-guidance-design.md, L32; INTERFACE §2.4) — THE STRUCTURE-REPAIR CALL.
 *
 * Plain words: when an AI's answer is right in content but its JSON form is broken in a way code cannot repair, the AI is
 * NOT asked to write it again. One cheap, fast model (on the preview, Claude Haiku 5.5 at its `slip_fix` thinking level)
 * copies the answer word for word into the form. Code then checks that the copy changed no word, no number and no
 * true/false value, and the step's own checks must accept it; otherwise the call ends exactly as it would have.
 *
 * Who wrote what stays true: an answer accepted after a structure repair keeps the original AI as its author (its
 * artifact, its maker, its model). The repair call is its own ledger row and artifact (reply_form STRUCTURE), billed to the
 * repair model through that model's own gateway and gate.
 *
 * Refused-repair salvage (2026-10-16, A1): before that call, the wrapper hands the gateway the step's own A1
 * (`structureSalvageFor`). On a routed call's first reply of class STRUCTURE, code reads the reply with no call and leaves
 * out only values the step never asked for (a sentence with no key, a repeat, an echo, a stray note); when the words are
 * all kept and the step's own check accepts the result, the reply is accepted as the original AI's own OK row: no
 * structure-repair call, no REPAIR:STRUCTURE row, its artifact PARSED with A1's drops among its repairs. Otherwise the
 * call goes on exactly as above.
 *
 * Refused-repair salvage (2026-10-16, B; spec §6 option iii): when the repair call does not do (its copy refused, the repair
 * model unavailable, its gate halted, a transport death), its failure never leaves the wrapper. The ORIGINAL AI gets one
 * short follow-up (`structureFollowUpFor`), the same call's second POST on its own gateway: PATCH asks only the members the
 * step still refuses on A1's object; FULL asks the answer writer or checker, whose reply could not be read at all, for the
 * whole answer again. With no follow-up to send, or when it does not do, the call ends as today's refusal. Only the run's
 * own stops (money, the lane stopped, root 0's room kept) pass through from the repair call, and then B is not sent.
 *
 * The contract is code-owned and test-pinned (tests/unit/prompt-text-pins.test.ts), never register-sealed; its instruction
 * is the owners' wording, shown to them at plan review.
 *
 * Module note: this file imports values from ./index.js, which re-exports it; it only uses them inside functions, so the
 * import cycle is safe (ESM live bindings).
 */
import { createHash } from "node:crypto";
import { RUN_LEVEL_SPEND_STOP_CODES, STRUCTURE_REPAIR_CALL_SITE_PREFIX, TypedDomainError, lengthCallStepOf } from "@debateai/kernel";
import {
  STRUCTURE_SALVAGE_REPAIRS, contentRepairsOf, decodeModelJson, modelJsonFenceBody, parsedWithRepairs,
  type ModelReplyFacts, type StructureSalvageRepair
} from "./model-json.js";
import {
  appendFramedRejection, buildFramedPrompt, framedAnswerForm, promptContractFingerprintText, schemaFailureLocator, type PromptContract
} from "./prompt-frame.js";
import { CONTENT_FOLLOW_UP_SENTENCES, contentFollowUpSentence } from "./content-follow-up.js";
import { planPatchFollowUp, type PatchFollowUpPlan } from "./patch-follow-up.js";
import {
  PROVIDER_COST_ENVELOPE_REFUSAL_CODES, ProviderContentUnacceptedError, ProviderStructureUnrepairedError,
  type ContentClassification, type PromptPacket, type ProviderCallRequest, type ProviderCallResult, type ProviderGateway,
  type RejectedProviderContent, type StructureFirstReply, type StructureFollowUp, type StructureSalvaged
} from "./index.js";

export const STRUCTURE_REPAIR_CONTRACT_ID = "repair.structure.v1" as const;
/**
 * The repair call's key prefix. The one copy of the literal lives in `@debateai/kernel`
 * (length-guidance.ts, which `lengthCallStepOf` reads); it is re-exported here under the same name for the providers'
 * readers, never written a second time.
 */
export { STRUCTURE_REPAIR_CALL_SITE_PREFIX };

/** The owners' instruction text (owner-editable wording; a change is a new contract id). */
export const STRUCTURE_REPAIR_INSTRUCTION = [
  "You put another AI's answer back into its required JSON form. You do not answer any question yourself.",
  "The answer_form field gives that form. The broken_reply field holds the other AI's own answer: its content is what counts, but its JSON form is broken, for example a missing bracket or comma, a part in the wrong place or under the wrong wrapper, or fields the form does not have.",
  "Copy every text, number and true or false value of broken_reply into the form exactly as written, word for word: move, wrap or close what is needed, and leave out any field the form does not have. Never add, change, shorten, translate, correct or summarise a word, and never invent a value that broken_reply does not give.",
  "machine_rejection_code and machine_rejection_path say where the engine found the form broken."
].join("\n");

/** The required answer form (code's half). */
export const STRUCTURE_REPAIR_ANSWER_FORM = "Return only one JSON object in exactly the form the answer_form field describes, with no text before or after it and no code fence. Every text, number and true or false value in it is copied exactly from broken_reply.";

export const STRUCTURE_REPAIR_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: STRUCTURE_REPAIR_CONTRACT_ID,
  instruction: STRUCTURE_REPAIR_INSTRUCTION,
  answerForm: STRUCTURE_REPAIR_ANSWER_FORM
});

/** The contract's fingerprint, recorded as the repair call's contract_hash (never a register value). */
export const STRUCTURE_REPAIR_CONTRACT_HASH = createHash("sha256")
  .update(promptContractFingerprintText(STRUCTURE_REPAIR_PROMPT_CONTRACT)).digest("hex");

export function structureRepairCallSiteKey(callSiteKey: string): string {
  return `${STRUCTURE_REPAIR_CALL_SITE_PREFIX}${callSiteKey}`;
}

/** The key a repair call repairs (the key itself for any other call). */
export function structureRepairOriginalKey(callSiteKey: string): string {
  return callSiteKey.startsWith(STRUCTURE_REPAIR_CALL_SITE_PREFIX) ? callSiteKey.slice(STRUCTURE_REPAIR_CALL_SITE_PREFIX.length) : callSiteKey;
}

/** Who repairs (contract deviation 2): the repair model's own gateway, its ref, and the bound of its one call. */
export type StructureRepairRoute = Readonly<{
  providerRef: string;
  gateway: ProviderGateway;
  bound: Readonly<{ tokenCeiling: number; deadlineMs: number }>;
}>;

const JSON_ESCAPES: Readonly<Record<string, string>> = Object.freeze({ "\"": "\"", "\\": "\\", "/": "/", b: " ", f: " ", n: "\n", r: "\r", t: "\t" });
/** A JSON number, true or false written as a value (never a word inside a text, never the digits of an id). */
const SCALAR_TOKEN = /true|false|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/uy;
/** What may stand right before and right after a scalar written as a JSON value. */
const SCALAR_BEFORE = /[\s:,[{]/u;
const SCALAR_AFTER = /[\s,}\]]/u;
/** What may follow the quote that closes a text in a broken reply (anything else: the quote sits inside the text). */
const TEXT_CLOSERS = ":}]\"";
/**
 * After `",` the quote closes the text only when JSON goes on after the comma (Task 12 review round 2): a key or text, a
 * number, an object, a list, true, false or null. Otherwise (`„evident corectă", ci …`, a Romanian or Polish quote closed
 * with a straight one) the quote and the comma are the text's own.
 */
const JSON_GOES_ON = /["\d\-{[tfn]/u;
/**
 * R22 (R21 practice 2026-10-23, GLM-5.3-Flash on a panel vote: `“steelman”: {`, `“evidence": {`): the typographic double
 * quotes a broken reply may write in place of a straight one to OPEN a key or a text. Read so only where a text may begin
 * (`TEXT_MAY_OPEN`: right after `{` `[` `,` or `:`, blanks between, inside the reply's object); anywhere else, and inside a
 * straight-quoted text, they are words.
 */
const TYPOGRAPHIC_OPENERS = "\u201C\u201D\u201E";
const TEXT_MAY_OPEN = "{[,:";
/**
 * What may close a text opened with a typographic quote: a straight or a typographic double quote, only where a straight
 * quote would close a text (`:` `}` `]` or a quote after it, or a comma and then more JSON, a typographic opener included).
 */
const TYPOGRAPHIC_CLOSERS = "\"\u201C\u201D";
/** A broken reply on the structure route finished normally (a cut reply takes the length retry instead). */
const FINISHED = Object.freeze({ finishReason: "stop" });
/** The names an answer form states: its quoted keys (`"summary":`, enum labels with them) and its `{a,b,c}` lists. */
const FORM_QUOTED_NAME = /"([A-Za-z_][A-Za-z0-9_]*)"/gu;
const FORM_BRACE_LIST = /\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)+)\s*\}/gu;
/** Fixer repairs that drop, cut or rename a value the repair reply gave: the step would then accept other words (L32). */
const VALUE_CHANGING_REPAIRS: ReadonlySet<string> = new Set(["UNASKED_KEYS", "INNER_UNASKED_KEYS", "MAP_TEXT_TRIMMED",
  "MAP_IDS_DROPPED", "MAP_IDS_NORMALISED"]);

/**
 * One value of a reply with the key names above it (list positions left out; a dotted key read as its parts). `keyed`
 * (Task 12b): false for a value written in an object with no key name of its own (`{"quality": 0.5, "a sentence", …}`,
 * invalid JSON the scan reads past): its path then names the key before it, which is not its own.
 */
type ReplyValue = Readonly<{ path: readonly string[]; value: string | number | boolean; keyed?: false; afterText?: true }>;
type ReplyReading = Readonly<{ values: readonly ReplyValue[]; keys: ReadonlySet<string> }>;

const normalText = (text: string): string => text.normalize("NFC").replace(/\s+/gu, " ").trim();
const keyParts = (key: string): string[] => key.split(".").filter((part) => part !== "");
function unescapeJsonText(text: string): string {
  return text.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/gu, (_match, escape: string) =>
    escape.startsWith("u") ? String.fromCharCode(Number.parseInt(escape.slice(1), 16)) : JSON_ESCAPES[escape]!);
}

/** The names `answerForm` states (`FORM_QUOTED_NAME`, `FORM_BRACE_LIST`). */
function formNames(answerForm: string): readonly string[] {
  return [...[...answerForm.matchAll(FORM_QUOTED_NAME)].map((match) => match[1]!),
    ...[...answerForm.matchAll(FORM_BRACE_LIST)].flatMap((match) => match[1]!.split(",").map((name) => name.trim()))];
}

/** A quoted form key: a name, then a colon after it. */
const FORM_KEY_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
/** Whitespace the form may put between a key and its colon (read by a plain loop: CodeQL #67, no regex on a run). */
const FORM_SPACE = /\s/u;

/**
 * The places a form states, and which of them hold a list (`"key": [` or `"key": … string[]`). Refused-repair salvage
 * (A1, pre-flight PF-S4): which hold a TEXT (`"key": non-empty string`, no list or object in its value) and which an enum
 * LABEL list (`"key": "REAL_ATTACK" | …`). `structureRepairKeepsWords` reads neither.
 */
type FormShape = Readonly<{ places: ReadonlySet<string>; lists: ReadonlySet<string>; texts: ReadonlySet<string>;
  labels: ReadonlySet<string> }>;
const NO_FORM_SHAPE: FormShape = Object.freeze({ places: new Set<string>(), lists: new Set<string>(), texts: new Set<string>(),
  labels: new Set<string>() });

/**
 * Task 12b: the PLACES `answerForm` states, read from its own nesting: each quoted key followed by `:`, with the quoted keys
 * of the objects around it (list brackets add nothing, as list positions add nothing to a value's path), dotted
 * (`fallacy.fatalFlags.description`). Prose around the form's skeleton holds no quoted key followed by `:`, and its
 * brackets (`number [0,1]`, `string[]`) close where they open. Task 12b round 2: a place holds a LIST when its value
 * opens with `[` or, before the next `,` `}` or line end, says `[]` (`"ambiguityFlags": non-empty string[]`). A1 (pre-flight
 * PF-S4): from that same value span, a place holds a TEXT when it says `string` with no `[` and no `{`, and an enum LABEL
 * list when it opens with `"`. Every loop moves forward only, so the reading is linear in the form's length.
 */
function formShape(answerForm: string): FormShape {
  type Frame = { object: boolean; key: string | null };
  const stack: Frame[] = [];
  const places = new Set<string>();
  const lists = new Set<string>();
  const texts = new Set<string>();
  const labels = new Set<string>();
  for (let index = 0; index < answerForm.length; index += 1) {
    const character = answerForm[index]!;
    if (character === "{" || character === "[") { stack.push({ object: character === "{", key: null }); continue; }
    if (character === "}" || character === "]") { stack.pop(); continue; }
    if (character !== "\"") continue;
    const end = answerForm.indexOf("\"", index + 1);
    if (end < 0) break;
    const name = answerForm.slice(index + 1, end);
    const top = stack.at(-1);
    let after = end + 1;
    while (after < answerForm.length && FORM_SPACE.test(answerForm[after]!)) after += 1;
    if (top?.object === true && answerForm[after] === ":" && FORM_KEY_NAME.test(name)) {
      top.key = name;
      const place = [...stack.flatMap((frame) => frame.object && frame.key !== null ? [frame.key] : [])].join(".");
      places.add(place);
      let value = after + 1;
      while (value < answerForm.length && FORM_SPACE.test(answerForm[value]!)) value += 1;
      let stop = value;
      while (stop < answerForm.length && !",}\n".includes(answerForm[stop]!)) stop += 1;
      const span = answerForm.slice(value, stop);
      if (answerForm[value] === "[" || span.includes("[]")) lists.add(place);
      if (span.includes("string") && !span.includes("[") && !span.includes("{")) texts.add(place);
      if (answerForm[value] === "\"") labels.add(place);
    }
    index = end;
  }
  return Object.freeze({ places, lists, texts, labels });
}

/**
 * Task 12b (controller ruling, practice 2026-10-16): where a broken text must be kept, as the step's own fixer keeps it.
 *  · "anywhere": the steps whose readers keep every declared text (`keepDeclaredTexts`: the answer writer and checker,
 *    the storyteller and the story checker, the map): a text under any name the form states must survive;
 *  · "place": the judgement package's steps (the judge legs, the panel, the reviews; their fixer drops an unknown key a
 *    name declared only elsewhere): a text must survive only where the form states that key at the same place.
 * The wrapper reads the step from the original call-site key with the kernel's step words (`lengthCallStepOf`), the one
 * vocabulary the thinking table and the length rows already use, so no step builder names it again (contract deviation
 * 1). Any other key (no step, a future step) keeps the stricter "anywhere".
 */
export type StructureRepairTextsKept = "anywhere" | "place";
const TEXTS_KEPT_AT_PLACE: ReadonlySet<string> = new Set(["opening", "pros_cons", "cross_exchange", "judge_panel", "reviewer"]);
export function structureRepairTextsKeptAt(callSiteKey: string, lane?: string): StructureRepairTextsKept {
  const step = lengthCallStepOf(structureRepairOriginalKey(callSiteKey), lane);
  return step !== null && TEXTS_KEPT_AT_PLACE.has(step) ? "place" : "anywhere";
}

/** Task 12b: every key path of a decoded value (dotted, list positions left out), a key holding null or {} included. */
function keyPlaces(value: unknown): ReadonlySet<string> {
  const places = new Set<string>();
  const walk = (node: unknown, path: readonly string[]): void => {
    if (Array.isArray(node)) { for (const entry of node) walk(entry, path); return; }
    if (typeof node !== "object" || node === null) return;
    for (const [key, entry] of Object.entries(node)) {
      const next = [...path, ...keyParts(key)];
      places.add(next.join("."));
      walk(entry, next);
    }
  };
  walk(value, []);
  return places;
}

/** Every text, number and true/false value of a decoded reply, with its key path, and every key name. */
function readValues(value: unknown): ReplyReading {
  const values: ReplyValue[] = [];
  const keys = new Set<string>();
  const walk = (node: unknown, path: readonly string[]): void => {
    if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") { values.push(Object.freeze({ path, value: node })); return; }
    if (Array.isArray(node)) { for (const entry of node) walk(entry, path); return; }
    if (typeof node === "object" && node !== null) {
      for (const [key, entry] of Object.entries(node)) {
        const parts = keyParts(key);
        for (const part of parts) keys.add(part);
        walk(entry, [...path, ...parts]);
      }
    }
  };
  walk(value, []);
  return Object.freeze({ values, keys });
}

/**
 * The broken reply's values, read the way the step read it (Task 12 review round 2): the tolerant decode
 * (`decodeModelJson`, JSON.parse's reading: a duplicate key's LAST value is the one) whenever the reply decodes;
 * otherwise `scanValues` on its raw text.
 */
function readBroken(brokenReply: string): ReplyReading {
  const decoded = decodeModelJson(brokenReply, FINISHED);
  return decoded.ok && typeof decoded.value === "object" && decoded.value !== null ? readValues(decoded.value) : scanValues(brokenReply);
}

/**
 * The same, read from a reply that does not decode, from its text as it came: texts with the keys above them, and
 * numbers and true/false only where they stand as JSON values outside every text, inside the reply's object (prose or
 * a code fence around it is never a value). A missing comma does not matter. A straight quote closes a text only when
 * `:` `}` `]` or another quote follows it, or a comma and then more JSON (`JSON_GOES_ON`); any other straight quote is
 * the text's own. A key written twice in one object keeps its last value, as JSON.parse does.
 *
 * R22: a key or text may also open with a typographic quote (“ ” „) where a text may begin (`TYPOGRAPHIC_OPENERS`); it then
 * closes at the first straight or typographic double quote placed as a closing quote (`TYPOGRAPHIC_CLOSERS`), so its
 * words are read exactly as written, any other typographic quote inside them included. A text opened with a straight quote
 * reads as before: only a straight quote closes it.
 */
function scanValues(text: string): ReplyReading {
  /** `owned`: the values read under each key of this object so far, so a key written again drops them (JSON.parse's reading). */
  /**
   * `fresh`: an object's last key has no value yet; `keyed`: a list was written under a key of its own (its entries are
   * that key's). A value in an object whose last key already has one has no key of its own (Task 12b).
   */
  /**
   * Task 12b round 3: `bareText`, the object's last key took a bare text as its value (not a list, an object or a number),
   * so a keyless value after it may be that key's list written without its `[`; after a closed `]` it may not.
   */
  type Frame = { object: boolean; key: readonly string[] | null; owned: Map<string, number[]>; fresh: boolean; keyed: boolean;
    bareText: boolean };
  const stack: Frame[] = [];
  const values: ReplyValue[] = [];
  const dropped = new Set<number>();
  const keys = new Set<string>();
  /** Whether the next value at the top of the stack has a key of its own; it uses that key up. */
  /** Whether the next value (`text`: a bare text) has a key of its own; it uses that key up. */
  const takeKey = (text: boolean): boolean => {
    const top = stack.at(-1);
    if (top === undefined) return true;
    if (!top.object) return top.keyed;
    const own = top.fresh && top.key !== null;
    if (own) top.bareText = text;
    top.fresh = false;
    return own;
  };
  /** A keyless value right after a key whose own value was a bare text (a list that may have lost its `[`). */
  const keyless = (path: readonly string[], value: string | number | boolean): ReplyValue =>
    stack.at(-1)?.bareText === true ? { path, value, keyed: false, afterText: true } : { path, value, keyed: false };
  const record = (value: ReplyValue): void => {
    for (const frame of stack) {
      if (!frame.object || frame.key === null) continue;
      const name = frame.key.join(".");
      frame.owned.set(name, [...(frame.owned.get(name) ?? []), values.length]);
    }
    values.push(Object.freeze(value));
  };
  const pathNow = (): string[] => stack.flatMap((frame) => frame.object && frame.key !== null ? [...frame.key] : []);
  const markAt = (from: number): number => {
    let at = from;
    while (at < text.length && /\s/u.test(text[at]!)) at += 1;
    return at;
  };
  const closes = (quoteAt: number, typographic: boolean): boolean => {
    const at = markAt(quoteAt + 1);
    const after = text[at];
    if (after === undefined || TEXT_CLOSERS.includes(after)) return true;
    if (after !== ",") return false;
    const next = text[markAt(at + 1)];
    return next === undefined || JSON_GOES_ON.test(next) || (typographic && TYPOGRAPHIC_OPENERS.includes(next));
  };
  /** R22: the last character outside every text that is not a blank (where a typographic opener may stand). */
  let lastMark: string | null = null;
  let index = 0;
  while (index < text.length) {
    const character = text[index]!;
    const typographic = TYPOGRAPHIC_OPENERS.includes(character) && stack.length > 0 && lastMark !== null
      && TEXT_MAY_OPEN.includes(lastMark);
    if (character === "\"" || typographic) {
      let body = "";
      let cursor = index + 1;
      for (; cursor < text.length; cursor += 1) {
        const inner = text[cursor]!;
        if (inner === "\\") { body += `${inner}${text[cursor + 1] ?? ""}`; cursor += 1; continue; }
        if ((typographic ? TYPOGRAPHIC_CLOSERS.includes(inner) : inner === "\"") && closes(cursor, typographic)) break;
        body += inner;
      }
      const value = unescapeJsonText(body);
      const top = stack.at(-1);
      if (top?.object === true && text[markAt(cursor + 1)] === ":") {
        top.key = keyParts(value);
        top.fresh = true;
        for (const part of top.key) keys.add(part);
        const name = top.key.join(".");
        for (const earlier of top.owned.get(name) ?? []) dropped.add(earlier);
        top.owned.delete(name);
      } else if (top !== undefined) {
        record(takeKey(true) ? { path: pathNow(), value } : keyless(pathNow(), value));
      }
      lastMark = "\"";
      index = cursor + 1;
      continue;
    }
    if (!/\s/u.test(character)) lastMark = character;
    if (character === "{" || character === "[") {
      const keyed = takeKey(false);
      stack.push({ object: character === "{", key: null, owned: new Map(), fresh: false, keyed, bareText: false });
      index += 1;
      continue;
    }
    if (character === "}" || character === "]") { stack.pop(); index += 1; continue; }
    SCALAR_TOKEN.lastIndex = index;
    const scalar = SCALAR_TOKEN.exec(text);
    if (scalar !== null && (index === 0 || SCALAR_BEFORE.test(text[index - 1]!))) {
      const after = text[index + scalar[0].length];
      if (stack.length > 0 && (after === undefined || SCALAR_AFTER.test(after))) {
        const parsed = scalar[0] === "true" ? true : scalar[0] === "false" ? false : Number(scalar[0]);
        record(takeKey(false) ? { path: pathNow(), value: parsed } : keyless(pathNow(), parsed));
      }
      index += scalar[0].length;
      continue;
    }
    index += 1;
  }
  return Object.freeze({ values: values.filter((_value, at) => !dropped.has(at)), keys });
}

/**
 * May a value the broken reply holds at `source` sit at `target` in the repair? Yes when the two paths share a key name and
 * the move only wraps, unwraps or lifts it: every key the source has BELOW the shared key is on the target or gone from the
 * repair (an unwrapped `{value: …}`), and the target has no key ABOVE the shared key that the broken reply already used
 * when the source had keys of its own above it (that would be a move from one existing parent to another: a swap). With
 * no shared key name, only when every key of the source is gone from the repair (a renamed or misplaced key). In every
 * case (Task 12 review round 2): a value whose parent keys are still in the repair, one of them off the target's path,
 * may not land under a parent key the source never had (a reviewer note moved into a missing `short.change`); lifting it
 * out of a wrong parent (`long.reviewer_note` → `reviewer_note`) and wrapping it in new parents keep it.
 */
function mayComeFrom(source: readonly string[], target: readonly string[], repairedKeys: ReadonlySet<string>,
  brokenKeys: ReadonlySet<string>): boolean {
  const sourceParents = source.slice(0, -1);
  const targetParents = target.slice(0, -1);
  if (sourceParents.some((key) => repairedKeys.has(key) && !target.includes(key))
    && targetParents.some((key) => !source.includes(key))) return false;
  const targetAt = target.findIndex((key) => source.includes(key));
  if (targetAt < 0) return source.every((key) => !repairedKeys.has(key));
  const sourceAt = source.indexOf(target[targetAt]!);
  if (source.slice(sourceAt + 1).some((key) => !target.includes(key) && repairedKeys.has(key))) return false;
  return sourceAt === 0 || !target.slice(0, targetAt).some((key) => brokenKeys.has(key));
}

/**
 * The broken texts (indices into `texts`) that, each whole, in their own order, joined by single spaces, make `wanted`;
 * null when none do. Every candidate sat under the same keys (a list's paragraphs).
 *
 * Fix round 3: the search remembers each (place in `wanted`, next candidate) it has already found hopeless, so it visits
 * each pair once: at most (length of `wanted`) × (candidates) states, each trying every candidate once. Without it, many
 * equal entries (a story's repeated node refs, which all sit under one path) made the search exponential, and it runs
 * inside the repair's classifier on the runner's event loop.
 */
function joinedFrom(wanted: string, candidates: readonly number[], texts: readonly string[]): readonly number[] | null {
  const hopeless = new Set<number>();
  const search = (at: number, from: number): readonly number[] | null => {
    const state = at * (candidates.length + 1) + from;
    if (hopeless.has(state)) return null;
    for (let next = from; next < candidates.length; next += 1) {
      const part = texts[candidates[next]!]!;
      if (part === "" || !wanted.startsWith(part, at)) continue;
      const end = at + part.length;
      if (end === wanted.length) return [candidates[next]!];
      if (wanted[end] !== " ") continue;
      const rest = search(end + 1, next + 1);
      if (rest !== null) return [candidates[next]!, ...rest];
    }
    hopeless.add(state);
    return null;
  };
  return search(0, 0);
}

/**
 * The word-for-word check (INTERFACE §2.4, stricter by contract deviation 4; Task 12 review fix rounds 1-2). It reads the
 * broken reply's values WITH the keys they sit under (`readBroken`), and the repair's decoded values the same way. TRUE
 * only when:
 *  · every non-empty text of `repaired` is one text of the broken reply, whole, or several texts that sat under the same
 *    keys (a list's paragraphs) joined in their own order, compared after whitespace is normalised: a changed, added or
 *    removed word or punctuation mark, a cut text, two fields' texts run together or paragraphs reordered is refused, and
 *    a key's NAME is never a text;
 *  · every number and every true/false value of `repaired` is a JSON value of the broken reply (never a digit of a text or
 *    an id, never the word "true" in prose);
 *  · each value of the broken reply is used once: a copy of a text, a score or a verdict into a second field is refused;
 *  · each value may come from where it sat (`mayComeFrom`): wrapping, unwrapping, nesting a flattened member, lifting a
 *    member written too deep and renaming a misspelt key keep it; moving it to another field (a swapped score, a
 *    criterion's verdict moved to its neighbour, steelman and critic swapped, a note moved into a missing field) is
 *    refused;
 *  · nothing asked was lost (Task 12b: as the step's own fixer keeps it, `textsKept`): every non-empty text of the broken
 *    reply WITH A KEY OF ITS OWN, under a key the step's answer form states — at the same place ("place": the judge legs,
 *    the panel, the reviews), or anywhere ("anywhere", the default: the steps that keep every declared text) — is,
 *    whole, in a text of the repair. A text written with no key name, and one under a name the form states only
 *    elsewhere on a "place" step (GLM's `fallacy.description`), may be dropped, as that step's fixer drops it. The names
 *    a form states are its quoted keys and its `{a,b,c}` lists, its places its quoted keys within its own nesting
 *    (`formShape`); the repair's own keys and places count too (all there is without `answerForm`). Texts under names the
 *    form never states may be dropped, as the step's own fixer drops them. Task 12b round 2: on a "place" step a path is
 *    read from its first root key (an outer wrapper is no new place), a flat item's stray keys that make up two or more
 *    keys of one listed item are asked, and on every step a keyless value right after a key the form states as a list is
 *    that list's own entry (a missing `[`): a source, and kept.
 * Null and empty texts are never checked: they carry no words (a lost text is caught by the last rule).
 */
export function structureRepairKeepsWords(brokenReply: string, repaired: unknown, answerForm?: string,
  options: Readonly<{ textsKept?: StructureRepairTextsKept }> = {}): boolean {
  const broken = readBroken(brokenReply);
  const repair = readValues(repaired);
  const shape = answerForm === undefined ? NO_FORM_SHAPE : formShape(answerForm);
  const repairPlaces = keyPlaces(repaired);
  // Task 12b round 2: a broken path read from its first ROOT key (a key the form or the repair has at the top), so an
  // outer wrapper (`response.context.ambiguityFlags`) is compared at the place it wraps (`context.ambiguityFlags`).
  const roots = new Set([...shape.places, ...repairPlaces].filter((place) => !place.includes(".")));
  const rooted = (path: readonly string[]): string => {
    const at = path.findIndex((key) => roots.has(key));
    return (at <= 0 ? path : path.slice(at)).join(".");
  };
  // Task 12b round 3: the path cut at EVERY root key (and whole), so a wrapper named like a root key (`context.…` around
  // the whole reply) is no new place either.
  const cuts = (path: readonly string[]): readonly string[] =>
    path.flatMap((key, at) => at === 0 || roots.has(key) ? [path.slice(at).join(".")] : []);
  const statedAt = (path: readonly string[], within: ReadonlySet<string>): boolean => cuts(path).some((cut) => within.has(cut));
  // Task 12b rounds 2-3: a keyless value right after a key the form states as a LIST, whose own value was a bare text, is
  // that list's next entry written without its `[` (`"ambiguityFlags": "a", "b"`): the AI's own, a source, kept. After a
  // list that WAS closed (`["a", "b"], "c"`) it stays keyless: droppable, never a source.
  const belongs = (entry: ReplyValue): boolean => entry.keyed !== false || (entry.afterText === true && statedAt(entry.path, shape.lists));
  const fits = (source: ReplyValue, target: ReplyValue): boolean => mayComeFrom(source.path, target.path, repair.keys, broken.keys);
  const samePath = (source: ReplyValue, target: ReplyValue): boolean =>
    source.path.length === target.path.length && source.path.every((key, at) => key === target.path[at]);
  const normal = broken.values.map((entry) => typeof entry.value === "string" ? normalText(entry.value) : "");
  // Task 12b: a value written with no key name of its own is never a source: placing it under a key is the repair's
  // guess, not the AI's words where it put them. It may only be left out.
  const used = new Set<number>(broken.values.flatMap((entry, index) => belongs(entry) ? [] : [index]));
  const free = (index: number): boolean => !used.has(index);
  const leaves = repair.values.filter((leaf) => typeof leaf.value !== "string" || normalText(leaf.value) !== "");
  const same = (entry: ReplyValue, index: number, leaf: ReplyValue): boolean => typeof leaf.value === "string"
    ? typeof entry.value === "string" && normal[index] === normalText(leaf.value) : entry.value === leaf.value;
  // Each value once: first every value that sits where it sat, then whole values from elsewhere, then joined paragraphs.
  const waiting = leaves.filter((leaf) => {
    const at = broken.values.findIndex((entry, index) => free(index) && same(entry, index, leaf) && samePath(entry, leaf));
    if (at >= 0) used.add(at);
    return at < 0;
  });
  const joins = waiting.filter((leaf) => {
    const at = broken.values.findIndex((entry, index) => free(index) && same(entry, index, leaf) && fits(entry, leaf));
    if (at >= 0) used.add(at);
    return at < 0;
  });
  for (const leaf of joins) {
    if (typeof leaf.value !== "string") return false;
    const byPath = new Map<string, number[]>();
    broken.values.forEach((entry, index) => {
      if (!free(index) || typeof entry.value !== "string" || !fits(entry, leaf)) return;
      const at = entry.path.join("\u0000");
      byPath.set(at, [...(byPath.get(at) ?? []), index]);
    });
    const wanted = normalText(leaf.value);
    const parts = [...byPath.values()].map((candidates) => joinedFrom(wanted, candidates, normal)).find((found) => found !== null);
    if (parts === undefined || parts === null) return false;
    for (const index of parts) used.add(index);
  }
  const stated = new Set<string>([...repair.keys, ...(answerForm === undefined ? [] : formNames(answerForm))]);
  const places = new Set<string>([...repairPlaces, ...shape.places]);
  // Task 12b round 2: on a "place" step a stray key is still asked when its stray siblings in the same object make up
  // two or more keys of one item the form states in a list (a fatal flag written flat in `fallacy`: `type` and
  // `description` of a `fatalFlags` item); a lone stray key (GLM's `fallacy.description`) is not.
  const itemKeys = [...shape.lists].map((list) => new Set([...shape.places].flatMap((place) =>
    place.startsWith(`${list}.`) && !place.slice(list.length + 1).includes(".") ? [place.slice(list.length + 1)] : [])));
  const strayAt = (entry: ReplyValue): boolean => {
    const path = rooted(entry.path).split(".");
    const parent = path.slice(0, -1).join(".");
    const strays = new Set(broken.values.flatMap((other) => {
      if (!belongs(other)) return [];
      const at = rooted(other.path).split(".");
      return at.length === path.length && at.slice(0, -1).join(".") === parent && !statedAt(other.path, places) ? [at.at(-1)!] : [];
    }));
    return itemKeys.some((keys) => keys.has(path.at(-1)!) && [...strays].filter((key) => keys.has(key)).length >= 2);
  };
  const asked = (entry: ReplyValue): boolean => options.textsKept === "place"
    ? statedAt(entry.path, places) || strayAt(entry) : stated.has(entry.path.at(-1)!);
  const keptTexts = repair.values.flatMap((leaf) => typeof leaf.value === "string" ? [` ${normalText(leaf.value)} `] : []);
  return broken.values.every((entry, index) => {
    const text = normal[index]!;
    return typeof entry.value !== "string" || !belongs(entry) || entry.path.length === 0 || !asked(entry) || text === ""
      || keptTexts.some((kept) => kept.includes(` ${text} `));
  });
}

/* ------------------------------------------------------------------------------------------------------------------------
 * Refused-repair salvage (2026-10-16, A1): THE VERIFIED SUBSET, read in code with no call, before the structure-repair call.
 *
 * Plain words: a reply broken only in its JSON form is often whole once a few values the step never asked for are left
 * out: a sentence written with no key, a key written twice with the same value, a copy of a value under a second name, a
 * stray note. A1 reads the reply as a tree, leaves out exactly those, and nothing else: it never moves, changes or fills a
 * value. Its result counts only when the word-for-word check (`structureRepairKeepsWords`) still holds and the step's own
 * check accepts it with no repair that changes a value. When the step still refuses it, the object A1 built is handed on
 * (PARTIAL) for the follow-up to the original AI to finish.
 * ---------------------------------------------------------------------------------------------------------------------- */

/** Why A1 left a reply as it was (each its own guard). */
export type StructureSalvageRefusal = "KEYLESS_KEPT" | "KEYLESS_LIST_ENTRY" | "DUPLICATE_DIFFERS" | "DOTTED_KEY" | "NOT_DROPPABLE"
  | "WORDS_NOT_KEPT" | "VALUE_CHANGING_REPAIR" | "NOTHING_TO_DROP";

/**
 * A1's result: ACCEPTED (the step accepts `content`, A1's drops named on `classification`), PARTIAL (A1 built an object the
 * step still refuses, with that refusal), REFUSED (A1 may not drop what the reply would need), NO_OBJECT (no object read).
 */
export type StructureSalvage =
  | Readonly<{ kind: "ACCEPTED"; content: string; classification: ContentClassification; repairs: readonly StructureSalvageRepair[] }>
  | Readonly<{ kind: "PARTIAL"; base: Readonly<Record<string, unknown>>;
      classification: Extract<ContentClassification, { parseStatus: "PARSE_FAILED" | "SCHEMA_FAILED" }> }>
  | Readonly<{ kind: "REFUSED"; reason: StructureSalvageRefusal }>
  | Readonly<{ kind: "NO_OBJECT" }>;

type ReplyTree =
  | Readonly<{ kind: "object"; members: readonly ReplyTreeMember[] }>
  | Readonly<{ kind: "list"; entries: readonly ReplyTree[] }>
  | Readonly<{ kind: "scalar"; value: string | number | boolean | null }>;
/** `key` null: a value written where `"key":` was expected (keyless); `afterText`: the member before it held a bare text. */
type ReplyTreeMember = Readonly<{ key: string | null; value: ReplyTree; afterText: boolean }>;

/** One JSON number token (read sticky at one position: no regex over a run). */
const JSON_NUMBER_TOKEN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/uy;
const JSON_BLANKS = " \t\n\r";
const JSON_WORDS: readonly (readonly [string, boolean | null])[] = Object.freeze([["true", true], ["false", false], ["null", null]]);

const isTextNode = (node: ReplyTree): boolean => node.kind === "scalar" && typeof node.value === "string";

/**
 * The reply as a tree: the text, trimmed, is one object, or one object inside one code fence; else null. Strict JSON
 * grammar (strings read by JSON.parse of their own token) with exactly two tolerances, which the tree keeps for A1 to
 * judge: a value inside an object where `"key":` was expected, followed by `,` or `}` (a member with no key), and a key
 * written again in one object (both members kept, in order). Forward-only: every position is read once.
 */
function readReplyTree(text: string): ReplyTree | null {
  const trimmed = text.trim();
  const body = (modelJsonFenceBody(trimmed) ?? trimmed).trim();
  if (!body.startsWith("{")) return null;
  let at = 0;
  const blank = (): void => { while (at < body.length && JSON_BLANKS.includes(body[at]!)) at += 1; };
  const readString = (): string | null => {
    let end = at + 1;
    while (end < body.length && body[end] !== "\"") end += body[end] === "\\" ? 2 : 1;
    if (end >= body.length) return null;
    try {
      const read: unknown = JSON.parse(body.slice(at, end + 1));
      at = end + 1;
      return typeof read === "string" ? read : null;
    } catch { return null; }
  };
  const scalar = (value: string | number | boolean | null): ReplyTree => Object.freeze({ kind: "scalar" as const, value });
  const readValue = (): ReplyTree | null => {
    blank();
    const character = body[at];
    if (character === "{") return readObject();
    if (character === "[") return readList();
    if (character === "\"") { const read = readString(); return read === null ? null : scalar(read); }
    const word = JSON_WORDS.find(([spelling]) => body.startsWith(spelling, at));
    if (word !== undefined) { at += word[0].length; return scalar(word[1]); }
    JSON_NUMBER_TOKEN.lastIndex = at;
    const number = JSON_NUMBER_TOKEN.exec(body);
    if (number === null) return null;
    at += number[0].length;
    return scalar(Number(number[0]));
  };
  const readObject = (): ReplyTree | null => {
    at += 1;
    const members: ReplyTreeMember[] = [];
    const done = (): ReplyTree => Object.freeze({ kind: "object" as const, members: Object.freeze(members) });
    blank();
    if (body[at] === "}") { at += 1; return done(); }
    for (;;) {
      blank();
      let key: string | null = null;
      let value: ReplyTree | null;
      if (body[at] === "\"") {
        const read = readString();
        if (read === null) return null;
        blank();
        if (body[at] === ":") { at += 1; key = read; value = readValue(); } else value = scalar(read);
      } else value = readValue();
      if (value === null) return null;
      const before = members.at(-1);
      members.push(Object.freeze({ key, value, afterText: key === null && before !== undefined && isTextNode(before.value) }));
      blank();
      if (body[at] === ",") { at += 1; continue; }
      if (body[at] === "}") { at += 1; return done(); }
      return null;
    }
  };
  const readList = (): ReplyTree | null => {
    at += 1;
    const entries: ReplyTree[] = [];
    const done = (): ReplyTree => Object.freeze({ kind: "list" as const, entries: Object.freeze(entries) });
    blank();
    if (body[at] === "]") { at += 1; return done(); }
    for (;;) {
      const entry = readValue();
      if (entry === null) return null;
      entries.push(entry);
      blank();
      if (body[at] === ",") { at += 1; continue; }
      if (body[at] === "]") { at += 1; return done(); }
      return null;
    }
  };
  try {
    const root = readObject();
    blank();
    return root !== null && at === body.length ? root : null;
  } catch {
    // A reply nested past the engine's call stack is no tree A1 reads.
    return null;
  }
}

/** Whether any key of the tree names a place by its parts (`"evidence.quality"`). */
function hasDottedKey(node: ReplyTree): boolean {
  if (node.kind === "list") return node.entries.some(hasDottedKey);
  if (node.kind === "scalar") return false;
  return node.members.some((member) => (member.key?.includes(".") ?? false) || hasDottedKey(member.value));
}

/** Two members written the same way (order, keys and values), so one of them is a plain repeat. */
function sameTree(left: ReplyTree, right: ReplyTree): boolean {
  if (left.kind === "scalar" || right.kind === "scalar") return left.kind === "scalar" && right.kind === "scalar" && left.value === right.value;
  if (left.kind === "list" || right.kind === "list") {
    return left.kind === "list" && right.kind === "list" && left.entries.length === right.entries.length
      && left.entries.every((entry, at) => sameTree(entry, right.entries[at]!));
  }
  return left.members.length === right.members.length && left.members.every((member, at) => {
    const other = right.members[at]!;
    return member.key === other.key && sameTree(member.value, other.value);
  });
}

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Deep equality of decoded JSON values (an object's key order does not count). */
function sameJson(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((entry, at) => sameJson(entry, right[at]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
  }
  return left === right;
}

/** The value kept at a dotted place of `base` (none when the path is missing or passes through a list). */
const NOT_KEPT = Symbol("NOT_KEPT");
function keptAt(base: unknown, place: string): unknown {
  let node: unknown = base;
  for (const key of place.split(".")) {
    if (!isPlainObject(node) || !Object.hasOwn(node, key)) return NOT_KEPT;
    node = node[key];
  }
  return node;
}

/**
 * An echo matches the value kept at its stated place: equal (a scalar, a list), or an object whose every member equals the
 * kept object's member of the same name.
 */
function echoMatches(echo: unknown, kept: unknown): boolean {
  if (kept === NOT_KEPT) return false;
  if (isPlainObject(echo) && isPlainObject(kept)) return Object.keys(echo).every((key) => Object.hasOwn(kept, key) && sameJson(echo[key], kept[key]));
  return sameJson(echo, kept);
}

type SalvageEvent = Readonly<{ refusal: StructureSalvageRefusal }> | { readonly place: string; value: unknown };

/**
 * A1's shaping of a tree against the step's answer form (`formShape`, `formNames`): each member, from the root down, read
 * at its place (its key path from the root; list positions add nothing), in document order. It records every drop and,
 * in document order, every refusal and every echo to check once the whole base is built (an echo may sit inside the
 * very object whose value it echoes).
 */
function shapeReplyTree(tree: ReplyTree & { kind: "object" }, answerForm: string, textsKept: StructureRepairTextsKept): Readonly<{
  base: Record<string, unknown>; drops: ReadonlySet<StructureSalvageRepair>; events: readonly SalvageEvent[] }> {
  const form = formShape(answerForm);
  const names = new Set(formNames(answerForm));
  const drops = new Set<StructureSalvageRepair>();
  const events: SalvageEvent[] = [];
  const refuse = (refusal: StructureSalvageRefusal): void => { events.push(Object.freeze({ refusal })); };
  const placeOf = (parent: string | null, key: string): string => parent === null ? key : `${parent}.${key}`;
  const lastName = (place: string): string => place.slice(place.lastIndexOf(".") + 1);
  const statedBelow = (place: string): boolean => [...form.places].some((stated) => stated.startsWith(`${place}.`));
  // Pre-flight PF-S4: a name the form states as a text somewhere and nowhere as an enum label list.
  const statedAsText = (name: string): boolean =>
    [...form.texts].some((place) => lastName(place) === name) && ![...form.labels].some((place) => lastName(place) === name);
  const textDroppable = (name: string): boolean => !names.has(name) || (textsKept === "place" && statedAsText(name));
  const emptyValue = (node: ReplyTree): boolean => (node.kind === "scalar" && node.value === null)
    || (node.kind === "object" && node.members.length === 0) || (node.kind === "list" && node.entries.length === 0);

  /** A value kept exactly as written; only the two tolerances are judged inside it (pre-flight PF-S1). */
  const keep = (node: ReplyTree, place: string): unknown => node.kind === "object" ? shapeObject(node, place, true)
    : node.kind === "list" ? node.entries.map((entry) => keep(entry, place)) : node.value;
  /** A value at a place the form states: walked into only when the form states a place below it. */
  const stated = (node: ReplyTree, place: string): unknown => {
    if (!statedBelow(place)) return keep(node, place);
    if (node.kind === "object") return shapeObject(node, place, false);
    if (node.kind === "list") return node.entries.map((entry) => entry.kind === "object" ? shapeObject(entry, place, false) : keep(entry, place));
    return node.value;
  };
  const echo = (node: ReplyTree, name: string): void => {
    const targets = [...form.places].filter((place) => lastName(place) === name);
    if (targets.length !== 1) { refuse("NOT_DROPPABLE"); return; }
    const event = { place: targets[0]!, value: undefined as unknown };
    const at = events.push(event) - 1;
    event.value = stated(node, event.place);
    // Fix round 1: an object every member of which was dropped echoes nothing; its drops were each allowed, so it is an
    // unasked value left out (any refusal inside it is still an event of its own). Final review: it is left out by the
    // rule a `{}` written there meets — on a step that keeps every text, a name the form states refuses.
    if (isPlainObject(event.value) && Object.keys(event.value).length === 0) {
      events.splice(at, 1);
      if (textsKept === "place" || !names.has(name)) drops.add("UNASKED_VALUE_DROPPED"); else refuse("NOT_DROPPABLE");
      return;
    }
    drops.add("ECHO_DROPPED");
  };
  function shapeObject(node: ReplyTree & { kind: "object" }, parent: string | null, asWritten: boolean): Record<string, unknown> {
    const kept = new Map<string, unknown>();
    const seen = new Map<string, ReplyTree>();
    let lastKey: string | null = null;
    for (const member of node.members) {
      if (member.key === null) {
        // Fix round 1 (owner answer 3): only a keyless TEXT may be dropped; a keyless score, verdict, object or list may
        // be a second answer, so it refuses.
        if (!isTextNode(member.value)) refuse("NOT_DROPPABLE");
        else if (textsKept === "anywhere") refuse("KEYLESS_KEPT");
        else if (member.afterText && lastKey !== null && form.lists.has(placeOf(parent, lastKey))) refuse("KEYLESS_LIST_ENTRY");
        else drops.add("KEYLESS_VALUE_DROPPED");
        continue;
      }
      const key = member.key;
      lastKey = key;
      const earlier = seen.get(key);
      if (earlier !== undefined) {
        if (sameTree(earlier, member.value)) drops.add("DUPLICATE_KEY_DROPPED"); else refuse("DUPLICATE_DIFFERS");
        continue;
      }
      seen.set(key, member.value);
      const place = placeOf(parent, key);
      if (asWritten) { kept.set(key, keep(member.value, place)); continue; }
      if (form.places.has(place)) { kept.set(key, stated(member.value, place)); continue; }
      if (isTextNode(member.value)) {
        if (textDroppable(key)) drops.add("UNASKED_VALUE_DROPPED"); else refuse("NOT_DROPPABLE");
        continue;
      }
      if (emptyValue(member.value)) {
        if (textsKept === "place" || !names.has(key)) drops.add("UNASKED_VALUE_DROPPED"); else refuse("NOT_DROPPABLE");
        continue;
      }
      echo(member.value, key);
    }
    return Object.fromEntries(kept);
  }
  const base = shapeObject(tree, null, false);
  return Object.freeze({ base, drops, events });
}

/**
 * A1 (refused-repair salvage, 2026-10-16): the verified subset of a STRUCTURE reply, read in code with no call. It DROPS
 * only: a TEXT written with no key (only where `textsKept` is "place", the judge steps; and never right after a text
 * under a key the form states as a list, where it is a list's lost `[`); a repeat of a key with the SAME value; a text,
 * null, `{}` or `[]` under a name not stated at its place, as the step's own fixer drops it (on a "place" step a text only
 * under a name the form never states or states as a text, never under a number, true/false or enum label list name); and
 * an exact echo of the value kept at the one stated place of that name (an object left with no member is no echo). A keyless
 * number, true/false, null, object or list refuses. A value at a place the form states as a scalar is
 * kept exactly as written, a wrapper and all. A dotted key, any other drop and a key written twice with two values refuse.
 *
 * With no tree, an object the tolerant decode reads is the base, with no drop. The base counts only when
 * `structureRepairKeepsWords` holds and then the step's own `classify` (run LAST, on the exact string returned) accepts it
 * with no value-changing repair: ACCEPTED, its drops named after the step's own repairs, the first drop the headline. A
 * step refusal hands the base on (PARTIAL) with that refusal; nothing readable is NO_OBJECT.
 */
export function salvageStructureReply(input: Readonly<{ content: string; reply: ModelReplyFacts | undefined; answerForm: string;
  textsKept: StructureRepairTextsKept; classify: (content: string, reply?: ModelReplyFacts) => ContentClassification }>): StructureSalvage {
  const refused = (reason: StructureSalvageRefusal): StructureSalvage => Object.freeze({ kind: "REFUSED", reason });
  const tree = readReplyTree(input.content);
  let base: Readonly<Record<string, unknown>>;
  let drops: readonly StructureSalvageRepair[] = [];
  if (tree === null || tree.kind !== "object") {
    const decoded = decodeModelJson(input.content, input.reply);
    if (!decoded.ok || !isPlainObject(decoded.value)) return Object.freeze({ kind: "NO_OBJECT" });
    base = decoded.value;
  } else {
    if (hasDottedKey(tree)) return refused("DOTTED_KEY");
    const shaped = shapeReplyTree(tree, input.answerForm, input.textsKept);
    for (const event of shaped.events) {
      if ("refusal" in event) return refused(event.refusal);
      if (!echoMatches(event.value, keptAt(shaped.base, event.place))) return refused("NOT_DROPPABLE");
    }
    base = shaped.base;
    drops = STRUCTURE_SALVAGE_REPAIRS.filter((repair) => shaped.drops.has(repair));
  }
  if (!structureRepairKeepsWords(input.content, base, input.answerForm, { textsKept: input.textsKept })) return refused("WORDS_NOT_KEPT");
  const content = JSON.stringify(base);
  const classification = input.classify(content, input.reply);
  if (classification.parseStatus !== "PARSED") return Object.freeze({ kind: "PARTIAL", base, classification });
  const stepRepairs = contentRepairsOf(classification);
  if (stepRepairs.some((repair) => VALUE_CHANGING_REPAIRS.has(repair))) return refused("VALUE_CHANGING_REPAIR");
  if (drops.length === 0) return refused("NOTHING_TO_DROP");
  return Object.freeze({ kind: "ACCEPTED", content, classification: parsedWithRepairs([...stepRepairs, ...drops], drops[0]!),
    repairs: Object.freeze(drops) });
}

/** A structured step with its own check and a readable frame, not the evaluator lane, not a structure-repair call. */
function structuredStep(request: ProviderCallRequest): boolean {
  if (request.classifyContent === undefined || request.lane === "evaluator"
    || request.callSiteKey.startsWith(STRUCTURE_REPAIR_CALL_SITE_PREFIX)) return false;
  try { return framedAnswerForm(request.packet).trim() !== ""; } catch { return false; }
}

/** A request the wrapper routes: a structured step (`structuredStep`), not routed yet. */
function routable(request: ProviderCallRequest): boolean {
  return request.structureRepairRouted === undefined && structuredStep(request);
}

/**
 * Refused-repair salvage (2026-10-16, A1): the step's own A1, which the wrapper hands the gateway
 * (`ProviderCallRequest.structureSalvage`): `salvageStructureReply` with the step's answer form, where it keeps texts and
 * its own check, returning the content and classification only when A1 ACCEPTED the reply (else null). Null for a request
 * the wrapper does not route (the routed test aside).
 */
export function structureSalvageFor(request: ProviderCallRequest):
  ((content: string, reply: ModelReplyFacts | undefined) => StructureSalvaged | null) | null {
  if (!structuredStep(request)) return null;
  const answerForm = framedAnswerForm(request.packet);
  const textsKept = structureRepairTextsKeptAt(request.callSiteKey, request.lane);
  const classify = request.classifyContent!;
  return (content, reply) => {
    const salvage = salvageStructureReply({ content, reply, answerForm, textsKept, classify });
    return salvage.kind === "ACCEPTED" ? Object.freeze({ content: salvage.content, classification: salvage.classification }) : null;
  };
}

/** Refused-repair salvage (B, owner answer 2): the only steps whose unreadable reply gets the whole answer asked again. */
const FULL_FOLLOW_UP_STEPS: ReadonlySet<string> = new Set(["answer_writer", "answer_checker"]);

/**
 * Refused-repair salvage (2026-10-16, B; spec §6 option iii): the one follow-up to the ORIGINAL AI after the structure-repair
 * call did not do, planned from its first reply (`first`). A1 reads that reply again (`salvageStructureReply`, the step's
 * answer form, where it keeps texts and its own check): when A1 built an object the step still refuses at 1-8 settable
 * members (PARTIAL), PATCH asks only those members, on A1's object; when no object could be read at all, the answer writer
 * and the answer checker (and only they, with a full re-ask of their own) get FULL, the whole answer again. Anything else is
 * null: no follow-up, the call ends as today's refusal. It may throw (the step's classifier, `framedAnswerForm`); its one
 * caller treats a throw as null.
 */
export function structureFollowUpFor(request: ProviderCallRequest, first: StructureFirstReply): StructureFollowUp | null {
  const classify = request.classifyContent;
  if (classify === undefined) return null;
  const salvage = salvageStructureReply({ content: first.rejected.rawText, reply: FINISHED, answerForm: framedAnswerForm(request.packet),
    textsKept: structureRepairTextsKeptAt(request.callSiteKey, request.lane), classify });
  if (salvage.kind === "PARTIAL") {
    const planned = planPatchFollowUp({ content: JSON.stringify(salvage.base), reply: FINISHED,
      parseStatus: salvage.classification.parseStatus, parseError: salvage.classification.parseError });
    if (planned === null) return null;
    const plan = Object.freeze({ ...planned, locator: Object.freeze({ ...planned.locator,
      reason: contentFollowUpSentence(planned.locator.code, "STRUCTURE") }) });
    return Object.freeze({ form: "PATCH" as const, plan, first });
  }
  const step = lengthCallStepOf(request.callSiteKey, request.lane);
  if (salvage.kind === "NO_OBJECT" && step !== null && FULL_FOLLOW_UP_STEPS.has(step) && request.buildRepairPacket !== undefined) {
    return Object.freeze({ form: "FULL" as const, first });
  }
  return null;
}

/**
 * Refused-repair salvage (2026-10-16): the two readers a reclaim's replay hands `rebuildRecordedCallContent` so a call the
 * first copy's gateway rescued (A1) or followed up (B's PATCH) is rebuilt from its recorded rows exactly as that gateway
 * accepted it, with no POST. `structureSalvage` is A1 (`structureSalvageFor`); `structureFollowUpPlan` is B's patch plan,
 * built from A's base (`structureFollowUpFor`): null for an accepted reply, a FULL or no follow-up, or a throw. As in the
 * gateway, a throw is no rescue and no plan (null): the call is rebuilt from its OK reply alone, or made again. Null for a
 * request the wrapper does not route. The runner passes them only on a run whose structure-repair route is wired.
 */
export function structureReplayReaders(request: ProviderCallRequest): Readonly<{
  structureSalvage: (content: string, reply: ModelReplyFacts) => StructureSalvaged | null;
  structureFollowUpPlan: (content: string, reply: ModelReplyFacts) => PatchFollowUpPlan | null;
}> | null {
  const salvage = structureSalvageFor(request);
  if (salvage === null) return null;
  const classify = request.classifyContent!;
  const structureSalvage = (content: string, reply: ModelReplyFacts): StructureSalvaged | null => {
    try {
      return salvage(content, reply);
    } catch {
      return null;
    }
  };
  const structureFollowUpPlan = (content: string, reply: ModelReplyFacts): PatchFollowUpPlan | null => {
    try {
      const classified = classify(content, reply);
      if (classified.parseStatus === "PARSED") return null;
      const planned = structureFollowUpFor(request, { rejected: { rawText: content, parseStatus: classified.parseStatus,
        parseError: classified.parseError, failureClass: "STRUCTURE" }, rawArtifactRef: "", ledgerEntryRef: "", materialMarked: false });
      return planned !== null && planned.form === "PATCH" ? planned.plan : null;
    } catch {
      return null;
    }
  };
  return Object.freeze({ structureSalvage, structureFollowUpPlan });
}

/**
 * B's FULL re-ask (controller ruling on Task 3): the step's own packet, then its rejection block (the step's own builder
 * appends the same block to the same packet), whose plain-word reason is the owner's sentence for an unreadable reply,
 * named here by its constant; no code or class selects it.
 */
function unreadableReplyRepairPacket(packet: PromptPacket): (rejected: RejectedProviderContent) => PromptPacket {
  return (rejected) => appendFramedRejection(packet, { ...schemaFailureLocator({ parseStatus: rejected.parseStatus,
    parseError: rejected.parseError }), reason: CONTENT_FOLLOW_UP_SENTENCES.STRUCTURE_UNREAD });
}

/**
 * Task 13 review, finding 1: the two stops of the run's own machinery a repair call can meet besides the money stops,
 * which keep their names as they do: the debate's call lane stopped while the repair waited for a slot
 * (`CALL_LANE_STOPPED`, apps/runner/src/call-scheduler.ts) and the money seam's room-only refusal for root 0
 * (`RUN_COST_ENVELOPE_ROOM_KEPT`, @debateai/budget; the repair carries the call's `keepRoomMicros`).
 * Engine redesign R1d (pre-flight PF-D6.1): and the story's own money stop (`STORY_COST_ENVELOPE_REACHED`,
 * @debateai/budget): a story's repair call spends the story's envelope, so its refusal is a money stop like the run's,
 * never "the reply stayed unusable" — otherwise the story would start a backup storyteller for money (G7).
 * Turned into a content refusal, a sent and billed call would be filed as the AI's failure, and the map would record
 * FAILED instead of STOPPED. Written here because neither package is this one's dependency;
 * tests/unit/lg-a-repair-wiring.test.ts pins all three against their owners' constants.
 */
export const STRUCTURE_REPAIR_PASSED_STOPS = Object.freeze(
  ["CALL_LANE_STOPPED", "RUN_COST_ENVELOPE_ROOM_KEPT", "STORY_COST_ENVELOPE_REACHED"] as const
);

/** The repair reply's refusal when it changed what the AI wrote (STRUCTURE_REPAIR_NOT_VERBATIM, INTERFACE §9). */
const NOT_VERBATIM = JSON.stringify([{ code: "custom", path: [], message: "STRUCTURE_REPAIR_NOT_VERBATIM" }]);

async function repairStructure(gateway: ProviderGateway, request: ProviderCallRequest, unrepaired: ProviderStructureUnrepairedError,
  route: StructureRepairRoute): Promise<ProviderCallResult> {
  const unaccepted = (): ProviderContentUnacceptedError => new ProviderContentUnacceptedError(unrepaired.attempts,
    unrepaired.rejected.parseStatus, unrepaired.rejected.parseError, unrepaired.lastRawArtifactRef, unrepaired.lastLedgerEntryRef);
  /**
   * Refused-repair salvage (B, spec §6 option iii): the structure-repair call did not do, so the ORIGINAL AI gets its one
   * short follow-up, the same call's second POST on its own gateway (`structureFollowUp`). No follow-up planned: today's
   * refusal. Every error of that POST is the original AI's own and passes through unchanged.
   */
  const followUp = async (): Promise<ProviderCallResult> => {
    let planned: StructureFollowUp | null;
    try {
      planned = structureFollowUpFor(request, { rejected: unrepaired.rejected, rawArtifactRef: unrepaired.lastRawArtifactRef,
        ledgerEntryRef: unrepaired.lastLedgerEntryRef, materialMarked: unrepaired.materialMarked });
    } catch {
      planned = null; // a throw while planning is no B, never a lost refusal (as Task 2's hook; pre-flight PF-S9)
    }
    if (planned === null) throw unaccepted();
    return gateway.call({ ...request, structureRepairRouted: true, structureFollowUp: planned,
      ...(planned.form === "FULL" ? { buildRepairPacket: unreadableReplyRepairPacket(request.packet) } : {}) });
  };
  const classify = request.classifyContent!;
  const broken = unrepaired.rejected.rawText;
  let packet: PromptPacket;
  let answerForm: string;
  try {
    const locator = schemaFailureLocator(unrepaired.rejected);
    answerForm = framedAnswerForm(request.packet);
    packet = buildFramedPrompt({ contract: STRUCTURE_REPAIR_PROMPT_CONTRACT, material: [
      { name: "answer_form", content: answerForm },
      { name: "broken_reply", content: broken },
      { name: "machine_rejection_code", content: locator.code },
      { name: "machine_rejection_path", content: locator.path }
    ] }).packet;
  } catch {
    throw unaccepted();
  }
  let repaired: ProviderCallResult;
  try {
    repaired = await route.gateway.call({
      runId: request.runId,
      subjectItemId: request.subjectItemId,
      callSiteKey: structureRepairCallSiteKey(request.callSiteKey),
      role: request.role,
      lane: request.lane,
      bound: Object.freeze({ maxAttempts: request.bound.maxAttempts, tokenCeiling: route.bound.tokenCeiling, deadlineMs: route.bound.deadlineMs }),
      // Final review M-1: ONE POST by construction (L32 "one cheap structure-only call"), whatever gateway the route names;
      // the preview's call policy sets the same, and the request carries no repair packet to spend a second on.
      maxAttemptsThisCall: 1,
      contractHash: STRUCTURE_REPAIR_CONTRACT_HASH,
      providerRef: route.providerRef,
      packet,
      ...(request.keepRoomMicros === undefined ? {} : { keepRoomMicros: request.keepRoomMicros }),
      classifyContent: (content, reply): ContentClassification => {
        const classified = classify(content, reply);
        if (classified.parseStatus !== "PARSED") return classified;
        // Task 12 review (a, b): the step's own classifier does not hand back the value it accepts, so the check reads the
        // repair's decoded value and refuses every reply the step's fixer would have had to drop, cut or rename a value
        // of (a key the form does not have, a trimmed or renamed id): what the step accepts is then exactly that value,
        // plus at most a value the step's own schema allows in one form only (ONLY_VALUE_FILLED, EMPTY_LIST,
        // MAP_LEANS_DEFAULTED), which code fills, never the repair model.
        if (contentRepairsOf(classified).some((repair) => VALUE_CHANGING_REPAIRS.has(repair))) {
          return { parseStatus: "SCHEMA_FAILED", parseError: NOT_VERBATIM };
        }
        const decoded = decodeModelJson(content, reply);
        return decoded.ok && structureRepairKeepsWords(broken, decoded.value, answerForm,
          { textsKept: structureRepairTextsKeptAt(request.callSiteKey, request.lane) })
          ? classified : { parseStatus: "SCHEMA_FAILED", parseError: NOT_VERBATIM };
      }
    });
  } catch (error) {
    // A money stop is the run's own and keeps its name: the cost-envelope refusals, and the run's spend stops
    // (`@debateai/kernel` RUN_LEVEL_SPEND_STOP_CODES), among them (ruling R9, pre-flight PF-A48) the run's attempt ceiling,
    // which the repair gateway's `assertAttemptAllowed` raises unwrapped before it sends; and so does a stop of the run's
    // own machinery (STRUCTURE_REPAIR_PASSED_STOPS: the lane stopped, root 0's room kept; R1d: the story's money). Every other
    // way the repair did not do (refused, unavailable, cut off, a transport death) never leaves the wrapper: it goes on to
    // the original AI's follow-up B. (The list is read here, inside the function: ./index.js re-exports this file, so a
    // module-level copy would read it before index.js has run.)
    if (error instanceof TypedDomainError && ((RUN_LEVEL_SPEND_STOP_CODES as readonly string[]).includes(error.code)
      || (PROVIDER_COST_ENVELOPE_REFUSAL_CODES as readonly string[]).includes(error.code)
      || (STRUCTURE_REPAIR_PASSED_STOPS as readonly string[]).includes(error.code))) throw error;
    return followUp();
  }
  return Object.freeze({
    ...unrepaired.reply,
    rawArtifactRef: unrepaired.lastRawArtifactRef,
    ledgerEntryRef: unrepaired.lastLedgerEntryRef,
    content: repaired.content,
    repairAttempts: 1,
    repairForm: "STRUCTURE" as const
  });
}

/**
 * THE WRAPPER (INTERFACE §2.4, deviations 1, 2, 7). With `route` null it is `gateway` itself: hosted production (no
 * preview provider config), local, every unit double. The route is wired whenever the preview provider config is
 * present, whatever the deployment mode (ruling R10, pre-flight PF-A51). Otherwise it marks each routable request `structureRepairRouted`
 * (the gateway then follows L32/L33), catches ProviderStructureUnrepairedError and sends the ONE structure-repair call.
 *
 * WHERE IT SITS (wired by the runner, LG-A Task 13): directly around each target's own gateway (the preview-wrapped
 * one), INSIDE every wrapper the runner adds per run — the candidate stamp, the sit-out book, the call lane, the
 * keep-alive, the cheaper-model fallback and the seat caller's backup. ProviderStructureUnrepairedError must never reach
 * those: the seat caller's switching rule (`seatFailureCause`, A16) and the fallbacks read typed codes, and an
 * unrepaired reply is neither a transport failure nor a money stop. Wrapped there, the repair call's own failure never
 * leaves the wrapper (only the run's own stops pass through as themselves): the original AI's follow-up B is sent instead,
 * as that AI's own second POST, and its outcome is the call's (an accepted answer, today's
 * ProviderContentUnacceptedError, or the original AI's own transport failure or stop, unchanged). The route's own gateway
 * is never wrapped in a route: a repair call is never routed again (`routable`).
 */
export function withStructureRepair(gateway: ProviderGateway, route: StructureRepairRoute | null): ProviderGateway {
  if (route === null) return gateway;
  if (typeof route.providerRef !== "string" || route.providerRef.trim() === "" || typeof route.gateway?.call !== "function"
    || !Number.isSafeInteger(route.bound.tokenCeiling) || route.bound.tokenCeiling < 1
    || !Number.isSafeInteger(route.bound.deadlineMs) || route.bound.deadlineMs < 1) {
    throw new TypeError("STRUCTURE_REPAIR_ROUTE_INVALID");
  }
  return Object.freeze({
    async call(request: ProviderCallRequest): Promise<ProviderCallResult> {
      if (!routable(request)) return gateway.call(request);
      const salvage = structureSalvageFor(request);
      try {
        return await gateway.call({ ...request, structureRepairRouted: true, ...(salvage === null ? {} : { structureSalvage: salvage }) });
      } catch (error) {
        if (!(error instanceof ProviderStructureUnrepairedError)) throw error;
        return repairStructure(gateway, request, error, route);
      }
    }
  });
}
