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
 * The contract is code-owned and test-pinned (tests/unit/prompt-text-pins.test.ts), never register-sealed; its instruction
 * is the owners' wording, shown to them at plan review.
 *
 * Module note: this file imports values from ./index.js, which re-exports it; it only uses them inside functions, so the
 * import cycle is safe (ESM live bindings).
 */
import { createHash } from "node:crypto";
import { RUN_LEVEL_SPEND_STOP_CODES, STRUCTURE_REPAIR_CALL_SITE_PREFIX, TypedDomainError } from "@debateai/kernel";
import { contentRepairsOf, decodeModelJson } from "./model-json.js";
import { buildFramedPrompt, framedAnswerForm, promptContractFingerprintText, schemaFailureLocator, type PromptContract } from "./prompt-frame.js";
import {
  PROVIDER_COST_ENVELOPE_REFUSAL_CODES, ProviderContentUnacceptedError, ProviderStructureUnrepairedError,
  type ContentClassification, type PromptPacket, type ProviderCallRequest, type ProviderCallResult, type ProviderGateway
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
/** A broken reply on the structure route finished normally (a cut reply takes the length retry instead). */
const FINISHED = Object.freeze({ finishReason: "stop" });
/** The names an answer form states: its quoted keys (`"summary":`, enum labels with them) and its `{a,b,c}` lists. */
const FORM_QUOTED_NAME = /"([A-Za-z_][A-Za-z0-9_]*)"/gu;
const FORM_BRACE_LIST = /\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)+)\s*\}/gu;
/** Fixer repairs that drop, cut or rename a value the repair reply gave: the step would then accept other words (L32). */
const VALUE_CHANGING_REPAIRS: ReadonlySet<string> = new Set(["UNASKED_KEYS", "INNER_UNASKED_KEYS", "MAP_TEXT_TRIMMED",
  "MAP_IDS_DROPPED", "MAP_IDS_NORMALISED"]);

/** One value of a reply with the key names above it (list positions left out; a dotted key read as its parts). */
type ReplyValue = Readonly<{ path: readonly string[]; value: string | number | boolean }>;
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
 */
function scanValues(text: string): ReplyReading {
  /** `owned`: the values read under each key of this object so far, so a key written again drops them (JSON.parse's reading). */
  type Frame = { object: boolean; key: readonly string[] | null; owned: Map<string, number[]> };
  const stack: Frame[] = [];
  const values: ReplyValue[] = [];
  const dropped = new Set<number>();
  const keys = new Set<string>();
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
  const closes = (quoteAt: number): boolean => {
    const at = markAt(quoteAt + 1);
    const after = text[at];
    if (after === undefined || TEXT_CLOSERS.includes(after)) return true;
    if (after !== ",") return false;
    const next = text[markAt(at + 1)];
    return next === undefined || JSON_GOES_ON.test(next);
  };
  let index = 0;
  while (index < text.length) {
    const character = text[index]!;
    if (character === "\"") {
      let body = "";
      let cursor = index + 1;
      for (; cursor < text.length; cursor += 1) {
        const inner = text[cursor]!;
        if (inner === "\\") { body += `${inner}${text[cursor + 1] ?? ""}`; cursor += 1; continue; }
        if (inner === "\"" && closes(cursor)) break;
        body += inner;
      }
      const value = unescapeJsonText(body);
      const top = stack.at(-1);
      if (top?.object === true && text[markAt(cursor + 1)] === ":") {
        top.key = keyParts(value);
        for (const part of top.key) keys.add(part);
        const name = top.key.join(".");
        for (const earlier of top.owned.get(name) ?? []) dropped.add(earlier);
        top.owned.delete(name);
      } else if (top !== undefined) {
        record({ path: pathNow(), value });
      }
      index = cursor + 1;
      continue;
    }
    if (character === "{" || character === "[") { stack.push({ object: character === "{", key: null, owned: new Map() }); index += 1; continue; }
    if (character === "}" || character === "]") { stack.pop(); index += 1; continue; }
    SCALAR_TOKEN.lastIndex = index;
    const scalar = SCALAR_TOKEN.exec(text);
    if (scalar !== null && (index === 0 || SCALAR_BEFORE.test(text[index - 1]!))) {
      const after = text[index + scalar[0].length];
      if (stack.length > 0 && (after === undefined || SCALAR_AFTER.test(after))) {
        record({ path: pathNow(), value: scalar[0] === "true" ? true : scalar[0] === "false" ? false : Number(scalar[0]) });
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
 *  · nothing asked was lost: every non-empty text of the broken reply under a name the step's answer form states
 *    (`answerForm`: its quoted keys and its `{a,b,c}` lists; without it, a key the repair keeps) is, whole, in a text of
 *    the repair. Texts under names the form never states may be dropped, as the step's own fixer drops them.
 * Null and empty texts are never checked: they carry no words (a lost text is caught by the last rule).
 */
export function structureRepairKeepsWords(brokenReply: string, repaired: unknown, answerForm?: string): boolean {
  const broken = readBroken(brokenReply);
  const repair = readValues(repaired);
  const fits = (source: ReplyValue, target: ReplyValue): boolean => mayComeFrom(source.path, target.path, repair.keys, broken.keys);
  const samePath = (source: ReplyValue, target: ReplyValue): boolean =>
    source.path.length === target.path.length && source.path.every((key, at) => key === target.path[at]);
  const normal = broken.values.map((entry) => typeof entry.value === "string" ? normalText(entry.value) : "");
  const used = new Set<number>();
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
  const keptTexts = repair.values.flatMap((leaf) => typeof leaf.value === "string" ? [` ${normalText(leaf.value)} `] : []);
  return broken.values.every((entry, index) => {
    const name = entry.path.at(-1);
    const text = normal[index]!;
    return typeof entry.value !== "string" || name === undefined || !stated.has(name) || text === ""
      || keptTexts.some((kept) => kept.includes(` ${text} `));
  });
}

/** A request the wrapper routes: a structured step with its own check and a readable frame, not the evaluator lane, not routed yet. */
function routable(request: ProviderCallRequest): boolean {
  if (request.classifyContent === undefined || request.lane === "evaluator" || request.structureRepairRouted !== undefined
    || request.callSiteKey.startsWith(STRUCTURE_REPAIR_CALL_SITE_PREFIX)) return false;
  try { return framedAnswerForm(request.packet).trim() !== ""; } catch { return false; }
}

/**
 * Task 13 review, finding 1: the two stops of the run's own machinery a repair call can meet besides the money stops,
 * which keep their names as they do: the debate's call lane stopped while the repair waited for a slot
 * (`CALL_LANE_STOPPED`, apps/runner/src/call-scheduler.ts) and the money seam's room-only refusal for root 0
 * (`RUN_COST_ENVELOPE_ROOM_KEPT`, @debateai/budget; the repair carries the call's `keepRoomMicros`). Turned into a content
 * refusal, a sent and billed call would be filed as the AI's failure, and the map would record FAILED instead of
 * STOPPED. Written here because neither package is this one's dependency; tests/unit/lg-a-repair-wiring.test.ts pins
 * both against their owners' constants.
 */
export const STRUCTURE_REPAIR_PASSED_STOPS = Object.freeze(["CALL_LANE_STOPPED", "RUN_COST_ENVELOPE_ROOM_KEPT"] as const);

/** The repair reply's refusal when it changed what the AI wrote (STRUCTURE_REPAIR_NOT_VERBATIM, INTERFACE §9). */
const NOT_VERBATIM = JSON.stringify([{ code: "custom", path: [], message: "STRUCTURE_REPAIR_NOT_VERBATIM" }]);

async function repairStructure(request: ProviderCallRequest, unrepaired: ProviderStructureUnrepairedError,
  route: StructureRepairRoute): Promise<ProviderCallResult> {
  const unaccepted = (): ProviderContentUnacceptedError => new ProviderContentUnacceptedError(unrepaired.attempts,
    unrepaired.rejected.parseStatus, unrepaired.rejected.parseError, unrepaired.lastRawArtifactRef, unrepaired.lastLedgerEntryRef);
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
        return decoded.ok && structureRepairKeepsWords(broken, decoded.value, answerForm)
          ? classified : { parseStatus: "SCHEMA_FAILED", parseError: NOT_VERBATIM };
      }
    });
  } catch (error) {
    // A money stop is the run's own and keeps its name: the cost-envelope refusals, and the run's spend stops
    // (`@debateai/kernel` RUN_LEVEL_SPEND_STOP_CODES), among them (ruling R9, pre-flight PF-A48) the run's attempt ceiling,
    // which the repair gateway's `assertAttemptAllowed` raises unwrapped before it sends; and so does a stop of the run's
    // own machinery (STRUCTURE_REPAIR_PASSED_STOPS: the lane stopped, root 0's room kept). Every other
    // way the repair did not do leaves today's refusal. (The list is read here, inside the function: ./index.js re-exports
    // this file, so a module-level copy would read it before index.js has run.)
    if (error instanceof TypedDomainError && ((RUN_LEVEL_SPEND_STOP_CODES as readonly string[]).includes(error.code)
      || (PROVIDER_COST_ENVELOPE_REFUSAL_CODES as readonly string[]).includes(error.code)
      || (STRUCTURE_REPAIR_PASSED_STOPS as readonly string[]).includes(error.code))) throw error;
    throw unaccepted();
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
 * unrepaired reply is neither a transport failure nor a money stop. Wrapped there, a call ends as today's
 * ProviderContentUnacceptedError (or a money stop, unchanged) whenever the repair does not do. The route's own gateway
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
      try {
        return await gateway.call({ ...request, structureRepairRouted: true });
      } catch (error) {
        if (!(error instanceof ProviderStructureUnrepairedError)) throw error;
        return repairStructure(request, error, route);
      }
    }
  });
}
