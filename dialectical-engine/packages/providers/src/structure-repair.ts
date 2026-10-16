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
import { STRUCTURE_REPAIR_CALL_SITE_PREFIX, TypedDomainError } from "@debateai/kernel";
import { decodeModelJson } from "./model-json.js";
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

const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
const NUMBER_TOKEN = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/gu;
/** Between two texts in one run list, so no run can span two texts. */
const RUN_SEPARATOR = "\u0000";
const JSON_ESCAPES: Readonly<Record<string, string>> = Object.freeze({ "\"": "\"", "\\": "\\", "/": "/", b: " ", f: " ", n: "\n", r: "\r", t: "\t" });

const wordsOf = (text: string): string[] => text.normalize("NFC").match(WORD) ?? [];
/** Prose: three or more words, or six or more Han, Kana or Thai characters (the measure_lengths.py rule). */
const isProse = (text: string): boolean => wordsOf(text).length >= 3 || [...text].filter((character) => WIDE.test(character)).length >= 6;
function unescapeJsonText(text: string): string {
  return text.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/gu, (_match, escape: string) =>
    escape.startsWith("u") ? String.fromCharCode(Number.parseInt(escape.slice(1), 16)) : JSON_ESCAPES[escape]!);
}
/** True when `needle` occurs in `haystack` as one unbroken run of words. */
function containsRun(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0) return true;
  for (let start = haystack.indexOf(needle[0]!); start >= 0; start = haystack.indexOf(needle[0]!, start + 1)) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true;
  }
  return false;
}
/** Every leaf of a decoded value with the key it sits under (a list's entries under the list's key); `keys` collects every key. */
function walkLeaves(value: unknown, visit: (leaf: string | number | boolean) => void, keys: Set<string>): void {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") { visit(value); return; }
  if (Array.isArray(value)) { for (const entry of value) walkLeaves(entry, visit, keys); return; }
  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) { keys.add(key); walkLeaves(entry, visit, keys); }
  }
}
/** The string VALUES of a JSON-like text, each with the key it sits under, read tolerantly (the text may not parse). */
function brokenTexts(text: string): readonly Readonly<{ key: string | null; text: string }>[] {
  type Frame = { object: boolean; key: string | null; expectKey: boolean };
  const stack: Frame[] = [];
  const found: { key: string | null; text: string }[] = [];
  let index = 0;
  while (index < text.length) {
    const character = text[index]!;
    const top = stack.at(-1);
    if (character === "\"") {
      let body = "";
      let escaped = false;
      let cursor = index + 1;
      for (; cursor < text.length; cursor += 1) {
        const inner = text[cursor]!;
        if (escaped) { escaped = false; body += `\\${inner}`; continue; }
        if (inner === "\\") { escaped = true; continue; }
        if (inner === "\"") break;
        body += inner;
      }
      const value = unescapeJsonText(body);
      if (top !== undefined && top.object && top.expectKey) { top.key = value; top.expectKey = false; }
      else found.push({ key: top?.key ?? null, text: value });
      index = cursor + 1;
      continue;
    }
    if (character === "{") stack.push({ object: true, key: null, expectKey: true });
    else if (character === "[") stack.push({ object: false, key: top?.key ?? null, expectKey: false });
    else if (character === "}" || character === "]") stack.pop();
    else if (character === "," && top?.object === true) top.expectKey = true;
    index += 1;
  }
  return found;
}

/**
 * The word-for-word check (INTERFACE §2.4, stricter by contract deviation 4). TRUE only when:
 *  · every prose text of `repaired` (each paragraph of it, split at blank lines) occurs in `brokenReply` as one unbroken
 *    run of words (JSON escapes read, whitespace and punctuation between words not counted);
 *  · every other non-empty text of `repaired` (an id, an enum value, a short phrase) occurs in `brokenReply` as written,
 *    and its words as whole words (an invented label "low" is not found inside "below");
 *  · every number of `repaired` occurs in `brokenReply` as a number, and `repaired` holds no more true and no more false
 *    values than `brokenReply` (a structure call must never invent a score or a verdict);
 *  · every prose text of `brokenReply` under a key that `repaired` keeps occurs in `repaired` (nothing asked was lost;
 *    texts under keys the form does not have are dropped with their keys).
 */
export function structureRepairKeepsWords(brokenReply: string, repaired: unknown): boolean {
  const broken = unescapeJsonText(brokenReply).normalize("NFC");
  const brokenWords = wordsOf(broken);
  const brokenNumbers = new Set((broken.match(NUMBER_TOKEN) ?? []).map(Number));
  const occurrences = (word: "true" | "false") => (broken.match(new RegExp(`\\b${word}\\b`, "gu")) ?? []).length;
  const keys = new Set<string>();
  const proseRuns: string[] = [];
  let trues = 0;
  let falses = 0;
  let faithful = true;
  walkLeaves(repaired, (leaf) => {
    if (typeof leaf === "number") { if (!brokenNumbers.has(leaf)) faithful = false; return; }
    if (typeof leaf === "boolean") { if (leaf) trues += 1; else falses += 1; return; }
    const text = leaf.normalize("NFC");
    if (isProse(text)) {
      for (const part of text.split(/\n\s*\n/u)) if (!containsRun(brokenWords, wordsOf(part))) faithful = false;
      proseRuns.push(...wordsOf(text), RUN_SEPARATOR);
    } else if (text !== "" && (!broken.includes(text) || !containsRun(brokenWords, wordsOf(text)))) {
      faithful = false;
    }
  }, keys);
  if (!faithful || trues > occurrences("true") || falses > occurrences("false")) return false;
  return brokenTexts(brokenReply).every((entry) => entry.key === null || !keys.has(entry.key) || !isProse(entry.text)
    || containsRun(proseRuns, wordsOf(entry.text)));
}

/** A request the wrapper routes: a structured step with its own check and a readable frame, not the evaluator lane, not routed yet. */
function routable(request: ProviderCallRequest): boolean {
  if (request.classifyContent === undefined || request.lane === "evaluator" || request.structureRepairRouted !== undefined
    || request.callSiteKey.startsWith(STRUCTURE_REPAIR_CALL_SITE_PREFIX)) return false;
  try { return framedAnswerForm(request.packet).trim() !== ""; } catch { return false; }
}

/**
 * The run's attempt ceiling (`@debateai/budget` assertModelAttemptAllowed; kernel RUN_LEVEL_SPEND_STOP_CODES): a run
 * stop, never a reason to retry the original AI (ruling R9, pre-flight PF-A48).
 */
const RUN_COST_ENVELOPE_EXHAUSTED = "RUN_COST_ENVELOPE_EXHAUSTED";

/** The repair reply's refusal when it changed what the AI wrote (STRUCTURE_REPAIR_NOT_VERBATIM, INTERFACE §9). */
const NOT_VERBATIM = JSON.stringify([{ code: "custom", path: [], message: "STRUCTURE_REPAIR_NOT_VERBATIM" }]);

async function repairStructure(request: ProviderCallRequest, unrepaired: ProviderStructureUnrepairedError,
  route: StructureRepairRoute): Promise<ProviderCallResult> {
  const unaccepted = (): ProviderContentUnacceptedError => new ProviderContentUnacceptedError(unrepaired.attempts,
    unrepaired.rejected.parseStatus, unrepaired.rejected.parseError, unrepaired.lastRawArtifactRef, unrepaired.lastLedgerEntryRef);
  const classify = request.classifyContent!;
  const broken = unrepaired.rejected.rawText;
  let packet: PromptPacket;
  try {
    const locator = schemaFailureLocator(unrepaired.rejected);
    packet = buildFramedPrompt({ contract: STRUCTURE_REPAIR_PROMPT_CONTRACT, material: [
      { name: "answer_form", content: framedAnswerForm(request.packet) },
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
        const decoded = decodeModelJson(content, reply);
        return decoded.ok && structureRepairKeepsWords(broken, decoded.value)
          ? classified : { parseStatus: "SCHEMA_FAILED", parseError: NOT_VERBATIM };
      }
    });
  } catch (error) {
    // A money stop is the run's own and keeps its name: the cost-envelope refusals, and (ruling R9, pre-flight PF-A48) the
    // run's attempt ceiling, which the repair gateway's `assertAttemptAllowed` raises unwrapped before it sends. Every other
    // way the repair did not do leaves today's refusal. (The list is read here, inside the function: ./index.js re-exports
    // this file, so a module-level copy would read it before index.js has run.)
    if (error instanceof TypedDomainError && (error.code === RUN_COST_ENVELOPE_EXHAUSTED
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
