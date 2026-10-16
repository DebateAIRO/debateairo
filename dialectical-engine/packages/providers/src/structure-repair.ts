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

/** Between two texts' paths in a lookup key. */
const PATH_JOIN = "\u0000";
const JSON_ESCAPES: Readonly<Record<string, string>> = Object.freeze({ "\"": "\"", "\\": "\\", "/": "/", b: " ", f: " ", n: "\n", r: "\r", t: "\t" });
/** A JSON number, true or false written as a value (never a word inside a text, never the digits of an id). */
const SCALAR_TOKEN = /true|false|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/uy;
/** What may stand right before and right after a scalar written as a JSON value. */
const SCALAR_BEFORE = /[\s:,[{]/u;
const SCALAR_AFTER = /[\s,}\]]/u;
/** What may follow the quote that closes a text in a broken reply (anything else: the quote sits inside the text). */
const TEXT_CLOSERS = ",:}]\"";
/** A name the answer form states: every identifier-like word of it (a superset of its keys, so more texts must survive). */
const FORM_NAME = /[A-Za-z_][A-Za-z0-9_]*/gu;
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
 * The same, read from the broken reply's text as it came (it may not decode, and the tolerant decode may read it another
 * way: its INNER_QUOTE reading can take a missing comma's quotes for a text's own): texts with the keys above them, and
 * numbers and true/false only where they stand as JSON values outside every text, inside the reply's object (prose or a
 * code fence around it is never a value). A missing comma does not matter; a straight quote inside a text (one not
 * followed by `,` `:` `}` `]` or another quote) is read as part of the text. On a reply that is valid JSON it reads
 * exactly what JSON.parse reads.
 */
function scanValues(text: string): ReplyReading {
  type Frame = { object: boolean; key: readonly string[] | null };
  const stack: Frame[] = [];
  const values: ReplyValue[] = [];
  const keys = new Set<string>();
  const pathNow = (): string[] => stack.flatMap((frame) => frame.object && frame.key !== null ? [...frame.key] : []);
  const nextMark = (from: number): string | undefined => {
    let at = from;
    while (at < text.length && /\s/u.test(text[at]!)) at += 1;
    return text[at];
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
        if (inner === "\"") {
          const after = nextMark(cursor + 1);
          if (after === undefined || TEXT_CLOSERS.includes(after)) break;
        }
        body += inner;
      }
      const value = unescapeJsonText(body);
      const top = stack.at(-1);
      if (top?.object === true && nextMark(cursor + 1) === ":") {
        top.key = keyParts(value);
        for (const part of top.key) keys.add(part);
      } else if (top !== undefined) {
        values.push(Object.freeze({ path: pathNow(), value }));
      }
      index = cursor + 1;
      continue;
    }
    if (character === "{" || character === "[") { stack.push({ object: character === "{", key: null }); index += 1; continue; }
    if (character === "}" || character === "]") { stack.pop(); index += 1; continue; }
    SCALAR_TOKEN.lastIndex = index;
    const scalar = SCALAR_TOKEN.exec(text);
    if (scalar !== null && (index === 0 || SCALAR_BEFORE.test(text[index - 1]!))) {
      const after = text[index + scalar[0].length];
      if (stack.length > 0 && (after === undefined || SCALAR_AFTER.test(after))) {
        values.push(Object.freeze({ path: pathNow(),
          value: scalar[0] === "true" ? true : scalar[0] === "false" ? false : Number(scalar[0]) }));
      }
      index += scalar[0].length;
      continue;
    }
    index += 1;
  }
  return Object.freeze({ values, keys });
}

/**
 * May a value the broken reply holds at `source` sit at `target` in the repair? Yes when the two paths share a key name and
 * the move only wraps, unwraps or lifts it: every key the source has BELOW the shared key is on the target or gone from the
 * repair (an unwrapped `{value: …}`), and the target has no key ABOVE the shared key that the broken reply already used
 * when the source had keys of its own above it (that would be a move from one existing parent to another: a swap). With
 * no shared key name, only when every key of the source is gone from the repair (a renamed or misplaced key).
 */
function mayComeFrom(source: readonly string[], target: readonly string[], repairedKeys: ReadonlySet<string>,
  brokenKeys: ReadonlySet<string>): boolean {
  const targetAt = target.findIndex((key) => source.includes(key));
  if (targetAt < 0) return source.every((key) => !repairedKeys.has(key));
  const sourceAt = source.indexOf(target[targetAt]!);
  if (source.slice(sourceAt + 1).some((key) => !target.includes(key) && repairedKeys.has(key))) return false;
  return sourceAt === 0 || !target.slice(0, targetAt).some((key) => brokenKeys.has(key));
}

/** True when `wanted` is `parts` (some of them, in any order, each whole) joined by single spaces. */
function joinedFrom(wanted: string, parts: readonly string[]): boolean {
  const reached = new Set<number>([0]);
  for (let at = 0; at < wanted.length; at += 1) {
    if (!reached.has(at)) continue;
    for (const part of parts) {
      if (part === "" || !wanted.startsWith(part, at)) continue;
      const end = at + part.length;
      if (end === wanted.length) return true;
      if (wanted[end] === " ") reached.add(end + 1);
    }
  }
  return false;
}

/**
 * The word-for-word check (INTERFACE §2.4, stricter by contract deviation 4; Task 12 review fix round 1). It reads the
 * broken reply's values WITH the keys they sit under (`scanValues`), and the repair's decoded values the same way. TRUE only when:
 *  · every non-empty text of `repaired` is one text of the broken reply, whole, or several texts that sat under the same
 *    keys (a list's paragraphs) joined, compared after whitespace is normalised: a changed, added or removed word or
 *    punctuation mark, a cut text, or two fields' texts run together is refused, and a key's NAME is never a text;
 *  · every number and every true/false value of `repaired` is a JSON value of the broken reply (never a digit of a text or
 *    an id, never the word "true" in prose), each used once;
 *  · each of those values may come from where it sat (`mayComeFrom`): wrapping, unwrapping, nesting a flattened member,
 *    lifting a member written too deep and renaming a misspelt key keep it; moving it to another field (a swapped score,
 *    a criterion's verdict moved to its neighbour, steelman and critic swapped) is refused;
 *  · nothing asked was lost: every non-empty text of the broken reply under a name the step's answer form states
 *    (`answerForm`; without it, a key the repair keeps) is, whole, in a text of the repair. Texts under names the form
 *    never states may be dropped, as the step's own fixer drops them.
 * Null and empty texts are never checked: they carry no words (a lost text is caught by the last rule).
 */
export function structureRepairKeepsWords(brokenReply: string, repaired: unknown, answerForm?: string): boolean {
  const broken = scanValues(brokenReply);
  const repair = readValues(repaired);
  const fits = (source: ReplyValue, target: ReplyValue): boolean => mayComeFrom(source.path, target.path, repair.keys, broken.keys);
  const brokenTexts = broken.values.filter((entry): entry is ReplyValue & { value: string } => typeof entry.value === "string");
  for (const leaf of repair.values) {
    if (typeof leaf.value !== "string") continue;
    const wanted = normalText(leaf.value);
    if (wanted === "") continue;
    const sources = brokenTexts.filter((entry) => fits(entry, leaf));
    if (sources.some((entry) => normalText(entry.value) === wanted)) continue;
    const byPath = new Map<string, string[]>();
    for (const entry of sources) {
      const at = entry.path.join(PATH_JOIN);
      byPath.set(at, [...(byPath.get(at) ?? []), normalText(entry.value)]);
    }
    if (![...byPath.values()].some((parts) => joinedFrom(wanted, parts))) return false;
  }
  const used = new Set<number>();
  const scalars = repair.values.filter((leaf) => typeof leaf.value !== "string");
  const samePath = (source: ReplyValue, target: ReplyValue): boolean => source.path.join(PATH_JOIN) === target.path.join(PATH_JOIN);
  const unmatched = scalars.filter((leaf) => {
    const at = broken.values.findIndex((entry, index) => !used.has(index) && entry.value === leaf.value && samePath(entry, leaf));
    if (at >= 0) used.add(at);
    return at < 0;
  });
  for (const leaf of unmatched) {
    const at = broken.values.findIndex((entry, index) => !used.has(index) && entry.value === leaf.value && fits(entry, leaf));
    if (at < 0) return false;
    used.add(at);
  }
  const stated = new Set<string>([...repair.keys, ...(answerForm?.match(FORM_NAME) ?? [])]);
  const keptTexts = repair.values.flatMap((leaf) => typeof leaf.value === "string" ? [` ${normalText(leaf.value)} `] : []);
  return brokenTexts.every((entry) => {
    const name = entry.path.at(-1);
    const text = normalText(entry.value);
    return name === undefined || !stated.has(name) || text === "" || keptTexts.some((kept) => kept.includes(` ${text} `));
  });
}

/** A request the wrapper routes: a structured step with its own check and a readable frame, not the evaluator lane, not routed yet. */
function routable(request: ProviderCallRequest): boolean {
  if (request.classifyContent === undefined || request.lane === "evaluator" || request.structureRepairRouted !== undefined
    || request.callSiteKey.startsWith(STRUCTURE_REPAIR_CALL_SITE_PREFIX)) return false;
  try { return framedAnswerForm(request.packet).trim() !== ""; } catch { return false; }
}

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
    // which the repair gateway's `assertAttemptAllowed` raises unwrapped before it sends. Every other
    // way the repair did not do leaves today's refusal. (The list is read here, inside the function: ./index.js re-exports
    // this file, so a module-level copy would read it before index.js has run.)
    if (error instanceof TypedDomainError && ((RUN_LEVEL_SPEND_STOP_CODES as readonly string[]).includes(error.code)
      || (PROVIDER_COST_ENVELOPE_REFUSAL_CODES as readonly string[]).includes(error.code))) throw error;
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
