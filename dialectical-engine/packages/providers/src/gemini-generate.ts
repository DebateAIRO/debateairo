import { createHash, randomUUID } from "node:crypto";
import { THINKING_LEVEL_DEFAULT_ONLY, TypedDomainError } from "@debateai/kernel";
import { assertFramedPrompt } from "./prompt-frame.js";
import { scanPromptTripwires } from "./prompt-tripwire.js";
import {
  GOOGLE_GEMINI_BASE_URL,
  GOOGLE_GEMINI_HTTP_ADAPTER_KIND,
  MAX_PROVIDER_REQUEST_PACKET_BYTES,
  MAX_USAGE_COUNTER,
  PROVIDER_CONTENT_LENGTH_EXCEEDED,
  PROVIDER_CONTEXT_WINDOW_EXCEEDED,
  PROVIDER_COST_ENVELOPE_REFUSAL_CODES,
  PROVIDER_THINKING_LEVEL_CHANGED,
  PROVIDER_THINKING_LEVEL_UNSUPPORTED,
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  assertProviderCallRecord,
  contentParseStatus,
  estimateWindowTokens,
  isBoundedProviderModelId,
  isContextWindowTokens,
  lengthRetryTokenCeiling,
  providerBackoffMs,
  readBoundedResponseText,
  realSleep,
  recordableFinishReason,
  resolveThinkingLevel,
  type ContentClassification,
  type OpenAICompatibleGatewayOptions,
  type PromptPacket,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderContentRejectionStatus,
  type ProviderGateway
} from "./index.js";

/**
 * PR C (preview multi-model build, 2026-10-10) — THE NATIVE GOOGLE GEMINI
 * `generateContent` ADAPTER, adapter kind `google-gemini-http`.
 *
 * The wire is fixed by the lead's contract (scratchpad `contract-BC-wire.md`,
 * Google section) and the preview gate validates the very same shapes, so this
 * file sends EXACTLY those members and nothing else:
 *
 *   POST {base}/models/{model}:generateContent        — never a `?key=` query
 *   x-goog-api-key: <credential>                       — off-preview only
 *   { "contents": [...], "systemInstruction"?: {...},
 *     "generationConfig": { "maxOutputTokens": n, "thinkingConfig"?: { "thinkingLevel": "<level>" } } }
 *
 * IMPORTING NOTE: this module and `./index.js` import each other. Nothing at
 * the top level of either uses a binding of the other, so the two load in
 * either order; keep it that way (only use index bindings inside functions).
 *
 * THE ATTEMPT LOOP (`GeminiGenerateProviderGateway.call`) MIRRORS
 * `OpenAICompatibleProviderGateway.call` step for step — the frame door, the
 * thinking level, the attempt guard, the money seam before and after, the
 * artifact before the charge, the ledger row for every sent attempt, the
 * length-retry escalation, the repair path and the short-circuit list. Only
 * the request bytes, the URL and headers, and the reading of the reply differ.
 * A change to one loop must be weighed for the other.
 */

/** The model id goes into the URL PATH, so it is one plain token: never a `/`, `?`, `:` or `%`. */
export const GEMINI_MODEL_ID_PATTERN = /^[a-z0-9.-]{1,64}$/u;

/**
 * A Gemini answer the vendor stopped for its own reasons — a safety block, a
 * recitation stop, a blocked prompt, no candidate at all. Not a transport
 * failure and not a contract failure: the call was made (and is charged), and
 * asking again is expected to meet the same stop, so it is NOT retried. The
 * caller sees today's PROVIDER_CALL_FAILED with this as its `cause`, exactly
 * like the usage cap, so every caller that halts a member on a failed call
 * keeps doing so.
 */
export const PROVIDER_CONTENT_REFUSED = "PROVIDER_CONTENT_REFUSED" as const;

/**
 * The Gemini model's own output limit (gemini-3.8-flash: 65,536 tokens, per
 * Google's model page). No attempt ever asks for more: the length retry's
 * raised bound is capped here, and a retry that could not raise it is not sent.
 */
const GEMINI_MAX_OUTPUT_TOKENS = 65_536;

/**
 * What a BILLED reply (a 2xx) that reported no usage is charged: both sides
 * unreadable, so the money seam charges this attempt's projected maximum —
 * never zero (the budget's `chargeableUsage` fallback).
 */
const GEMINI_UNREPORTED_USAGE_CHARGE = Object.freeze({
  prompt_tokens: "MALFORMED", completion_tokens: "MALFORMED", total_tokens: "MALFORMED"
});

/** Gemini's own name for "cut off at maxOutputTokens" — the OpenAI wire's `length`. */
export const GEMINI_FINISH_REASON_MAX_TOKENS = "MAX_TOKENS" as const;
export const GEMINI_FINISH_REASON_STOP = "STOP" as const;

/** Refuses a model id that cannot be placed in the request path verbatim. */
export function assertGeminiModelId(model: unknown): string {
  if (typeof model !== "string" || !GEMINI_MODEL_ID_PATTERN.test(model)) {
    throw new TypedDomainError("PROVIDER_GEMINI_MODEL_INVALID", "The Gemini model id must be 1..64 of a-z 0-9 . -");
  }
  return model;
}

/**
 * `{base}/models/{model}:generateContent`, from the one base this adapter
 * accepts. The result never carries a query: the credential travels in a
 * header and nothing else is sent in the URL.
 */
export function geminiGenerateContentUrl(endpoint: string, model: string): string {
  if (endpoint !== GOOGLE_GEMINI_BASE_URL) {
    throw new TypedDomainError("PROVIDER_GEMINI_ENDPOINT_INVALID", "A Gemini target must use the one Gemini API base URL");
  }
  const url = `${endpoint}/models/${assertGeminiModelId(model)}:generateContent`;
  if (url.includes("?") || url.includes("#")) {
    throw new TypedDomainError("PROVIDER_GEMINI_ENDPOINT_INVALID", "A Gemini request URL never carries a query");
  }
  return url;
}

/**
 * The native body, in the contract's member order. System messages become ONE
 * `systemInstruction` (joined with a blank line, as the Anthropic adapter
 * does); every other message becomes one `contents` entry with exactly one
 * text part, `assistant` spoken as `model`. The first entry must be the user's.
 * `thinkingLevel` is the vendor's level token or undefined (nothing on the
 * wire: the model's own default).
 */
export function geminiGenerateContentBody(input: Readonly<{
  messages: PromptPacket["messages"];
  maxOutputTokens: number;
  thinkingLevel?: string;
}>): string {
  if (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 1
    || input.maxOutputTokens > GEMINI_MAX_OUTPUT_TOKENS) {
    throw new TypedDomainError(
      "PROVIDER_GEMINI_REQUEST_INVALID",
      "maxOutputTokens must be a positive whole number within the model's output limit"
    );
  }
  const system: string[] = [];
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const message of input.messages) {
    if (typeof message.content !== "string") {
      throw new TypedDomainError("PROVIDER_GEMINI_REQUEST_INVALID", "Every message must carry text");
    }
    if (message.role === "system") {
      system.push(message.content);
    } else if (message.role === "user" || message.role === "assistant") {
      contents.push({ role: message.role === "user" ? "user" : "model", parts: [{ text: message.content }] });
    } else {
      throw new TypedDomainError("PROVIDER_GEMINI_REQUEST_INVALID", "Unknown message role");
    }
  }
  if (contents.length < 1 || contents[0]!.role !== "user") {
    throw new TypedDomainError("PROVIDER_GEMINI_REQUEST_INVALID", "The first Gemini content must be the user's");
  }
  return JSON.stringify({
    contents,
    ...(system.length === 0 ? {} : { systemInstruction: { parts: [{ text: system.join("\n\n") }] } }),
    generationConfig: {
      maxOutputTokens: input.maxOutputTokens,
      ...(input.thinkingLevel === undefined ? {} : { thinkingConfig: { thinkingLevel: input.thinkingLevel } })
    }
  });
}

/**
 * The request headers. Off-preview the credential is the bare API key, sent as
 * `x-goog-api-key`; the preview's guarded fetch is handed no credential (the
 * gate adds it). Never a query parameter.
 */
export function geminiRequestHeaders(credential: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (credential !== undefined) {
    assertGeminiCredentialForm(credential);
    headers["x-goog-api-key"] = credential;
  }
  return headers;
}

/**
 * A Gemini credential is ONE printable token with no space: the bare key. The
 * header-line form the OpenAI targets use (`Bearer …`) is refused here, by
 * shape and never by echoing a byte of it, so a credential file written for
 * the other wire cannot be sent to Google as a malformed header.
 */
function assertGeminiCredentialForm(credential: unknown): void {
  if (typeof credential !== "string" || !/^[\x21-\x7e]+$/u.test(credential)) {
    throw new TypeError("PROVIDER_GEMINI_CREDENTIAL_FORM_INVALID");
  }
}

/**
 * The PREVIEW framing the guarded fetch sends the root gate:
 * `{"model": <id>, "request": <native body>}`, exactly those two keys. The
 * native body is spliced in as the very bytes the adapter built, so what the
 * gate prices and forwards is byte-identical to what the adapter would have
 * posted off-preview. Not wired yet (PR C's preview step uses it).
 */
export function geminiPreviewRequestBody(model: string, nativeBody: string): string {
  assertGeminiModelId(model);
  let decoded: unknown;
  try {
    decoded = JSON.parse(nativeBody);
  } catch {
    throw new TypedDomainError("PROVIDER_GEMINI_REQUEST_INVALID", "The native Gemini body is not JSON");
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)
    || !Array.isArray((decoded as Readonly<Record<string, unknown>>).contents)
    || nativeBody !== nativeBody.trim()) {
    throw new TypedDomainError("PROVIDER_GEMINI_REQUEST_INVALID", "The native Gemini body must be one generateContent object");
  }
  return `{"model":${JSON.stringify(model)},"request":${nativeBody}}`;
}

/* ------------------------------------------------------------------ reply */

export type GeminiReplyVerdict = "STOP" | "MAX_TOKENS" | "REFUSED" | "MALFORMED";

export type GeminiReplyReading = Readonly<{
  /** `modelVersion` as it arrived, when it is a string; the identity check compares it exactly. */
  modelVersion: string | null;
  responseId: string | null;
  /** The non-thought text parts of candidate 0, joined in order; null when there is none to read. */
  content: string | null;
  /** `candidates[0].finishReason` as it arrived. */
  finishReason: string | null;
  /** `promptFeedback.blockReason`, when the prompt itself was blocked. */
  blockReason: string | null;
  /** The finish reason the artifact records (a code token after `recordableFinishReason`). */
  recordedFinishReason: string | null;
  verdict: GeminiReplyVerdict;
}>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads one `generateContent` reply LENIENTLY: it never throws, so the
 * artifact and the charge are recorded before any decision is taken on it.
 *
 *  · `promptFeedback.blockReason`, or no candidate at all → REFUSED.
 *  · a finish reason other than STOP / MAX_TOKENS (SAFETY, RECITATION,
 *    BLOCKLIST, PROHIBITED_CONTENT, SPII, OTHER, LANGUAGE, the tool and image
 *    reasons, an unspecified one…) → REFUSED. Fail closed: an unknown reason
 *    is never read as a clean stop.
 *  · a part that is neither text nor a thought (a function call: no tool was
 *    offered), or no finish reason at all → MALFORMED.
 *  · STOP with text → STOP; MAX_TOKENS → MAX_TOKENS (the text may be partial
 *    or absent: thinking can spend the whole bound).
 *
 * Parts marked `thought: true` are thought summaries and are never part of
 * the answer.
 */
export function readGeminiReply(decoded: unknown): GeminiReplyReading {
  if (!isRecord(decoded)) {
    return Object.freeze({
      modelVersion: null, responseId: null, content: null, finishReason: null,
      blockReason: null, recordedFinishReason: null, verdict: "MALFORMED"
    });
  }
  const modelVersion = typeof decoded.modelVersion === "string" ? decoded.modelVersion : null;
  const responseId = typeof decoded.responseId === "string" ? decoded.responseId : null;
  const feedback = decoded.promptFeedback;
  const blockReason = isRecord(feedback) && typeof feedback.blockReason === "string" && feedback.blockReason !== ""
    ? feedback.blockReason
    : null;
  const base = { modelVersion, responseId, blockReason };
  if (blockReason !== null) {
    return Object.freeze({
      ...base, content: null, finishReason: null,
      recordedFinishReason: recordableFinishReason(`PROMPT_BLOCKED:${blockReason}`), verdict: "REFUSED" as const
    });
  }
  const candidates = decoded.candidates;
  if (!Array.isArray(candidates) || candidates.length < 1) {
    return Object.freeze({
      ...base, content: null, finishReason: null, recordedFinishReason: "NO_CANDIDATE", verdict: "REFUSED" as const
    });
  }
  const first: unknown = candidates[0];
  if (!isRecord(first)) {
    return Object.freeze({
      ...base, content: null, finishReason: null, recordedFinishReason: null, verdict: "MALFORMED" as const
    });
  }
  const finishReason = typeof first.finishReason === "string" ? first.finishReason : null;
  const recordedFinishReason = recordableFinishReason(finishReason);
  let content: string | null = null;
  let partsMalformed = false;
  if (first.content !== undefined) {
    const parts = isRecord(first.content) ? first.content.parts : undefined;
    if (parts === undefined) {
      content = null;
    } else if (!Array.isArray(parts)) {
      partsMalformed = true;
    } else {
      const texts: string[] = [];
      for (const part of parts) {
        if (!isRecord(part)) { partsMalformed = true; break; }
        if (part.thought === true) continue;
        if (typeof part.text !== "string") { partsMalformed = true; break; }
        texts.push(part.text);
      }
      // No answer text at all (a reply of thoughts only) is no answer: null,
      // never an empty string that could pass as one.
      if (!partsMalformed && texts.length > 0) content = texts.join("");
    }
  }
  const reading = { ...base, finishReason, recordedFinishReason };
  if (finishReason !== null && finishReason !== GEMINI_FINISH_REASON_STOP
    && finishReason !== GEMINI_FINISH_REASON_MAX_TOKENS) {
    return Object.freeze({ ...reading, content: partsMalformed ? null : content, verdict: "REFUSED" as const });
  }
  if (partsMalformed || finishReason === null) {
    return Object.freeze({ ...reading, content: null, verdict: "MALFORMED" as const });
  }
  if (finishReason === GEMINI_FINISH_REASON_MAX_TOKENS) {
    return Object.freeze({ ...reading, content, verdict: "MAX_TOKENS" as const });
  }
  return Object.freeze({ ...reading, content, verdict: content === null ? "MALFORMED" as const : "STOP" as const });
}

/* ------------------------------------------------------------------ usage */

export type GeminiUsageReading = Readonly<{
  /**
   * What the money seam is handed, in the spelling `@debateai/budget` reads
   * (`prompt_tokens`, `completion_tokens`): input = promptTokenCount (plus any
   * tool-use prompt tokens), output = candidatesTokenCount + thoughtsTokenCount.
   * A side that cannot be trusted is handed as the string "MALFORMED", which
   * the budget reads as unreadable and charges at this attempt's projected
   * maximum. `undefined` = the reply carried no usageMetadata at all.
   */
  charge: unknown;
  /** The counters the engine vouches for (artifact metadata, hosted requirement); null unless clean. */
  reported: Readonly<{ prompt_tokens: number; completion_tokens: number; total_tokens: number }> | null;
  /** thoughtsTokenCount when reported, else null (never a guessed zero). */
  thoughtsTokens: number | null;
  /** Why the block cannot be vouched for; the gateway refuses it as PROVIDER_USAGE_INVALID. */
  problem: null | "MALFORMED" | "INCONSISTENT";
}>;

type CounterRead = number | "ABSENT" | "MALFORMED";

function counter(value: unknown): CounterRead {
  if (value === undefined) return "ABSENT";
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_USAGE_COUNTER
    ? value
    : "MALFORMED";
}

/**
 * `usageMetadata` → the engine's usage. Google's JSON leaves out a counter
 * whose value is zero, so inside a block that IS present an absent
 * candidates/thoughts/tool count is zero. An absent promptTokenCount in a
 * present block is not believable (every call has a prompt) and is charged at
 * the projection. Totals must add up (Google documents total = prompt +
 * thoughts + candidates); tool-use prompt tokens must be zero (no tool is ever
 * offered). Either inconsistency is charged at the HIGHER reading — unexplained
 * total tokens are charged as output, the dearer side — and then refused.
 */
export function readGeminiUsage(usageMetadata: unknown): GeminiUsageReading {
  if (usageMetadata === undefined || usageMetadata === null) {
    return Object.freeze({ charge: undefined, reported: null, thoughtsTokens: null, problem: null });
  }
  if (!isRecord(usageMetadata)) {
    return Object.freeze({
      charge: { prompt_tokens: "MALFORMED", completion_tokens: "MALFORMED", total_tokens: "MALFORMED" },
      reported: null, thoughtsTokens: null, problem: "MALFORMED"
    });
  }
  const prompt = counter(usageMetadata.promptTokenCount);
  const candidates = counter(usageMetadata.candidatesTokenCount);
  const thoughts = counter(usageMetadata.thoughtsTokenCount);
  const total = counter(usageMetadata.totalTokenCount);
  const toolPrompt = counter(usageMetadata.toolUsePromptTokenCount);
  const cached = counter(usageMetadata.cachedContentTokenCount);
  const thoughtsTokens = typeof thoughts === "number" ? thoughts : null;
  if ([prompt, candidates, thoughts, total, toolPrompt, cached].every((read) => read === "ABSENT")) {
    // A present but empty block: nothing billable was reported. Nothing is
    // charged, and hosted refuses the answer as PROVIDER_USAGE_UNREPORTED.
    return Object.freeze({ charge: {}, reported: null, thoughtsTokens, problem: null });
  }
  const zeroIfAbsent = (read: CounterRead): number | "MALFORMED" => (read === "ABSENT" ? 0 : read);
  const candidatesCount = zeroIfAbsent(candidates);
  const thoughtsCount = zeroIfAbsent(thoughts);
  const toolCount = zeroIfAbsent(toolPrompt);
  const outputSide: number | "MALFORMED" = candidatesCount === "MALFORMED" || thoughtsCount === "MALFORMED"
    ? "MALFORMED"
    : candidatesCount + thoughtsCount;
  const inputSide: number | "MALFORMED" = prompt === "ABSENT" || prompt === "MALFORMED" || toolCount === "MALFORMED"
    ? "MALFORMED"
    : prompt + toolCount;
  const malformed = [prompt, candidates, thoughts, total, toolPrompt, cached].includes("MALFORMED");
  if (malformed || inputSide === "MALFORMED" || outputSide === "MALFORMED") {
    return Object.freeze({
      charge: { prompt_tokens: inputSide, completion_tokens: outputSide, total_tokens: "MALFORMED" },
      reported: null, thoughtsTokens, problem: malformed ? "MALFORMED" as const : "INCONSISTENT" as const
    });
  }
  const promptCount = prompt as number;
  const toolTokens = toolCount as number;
  const expectedTotal = promptCount + outputSide;
  const totalCount = total === "ABSENT" ? expectedTotal : total as number;
  const inconsistent = toolTokens > 0 || totalCount !== expectedTotal;
  if (inconsistent) {
    const chargedOutput = Math.max(outputSide, totalCount - promptCount);
    return Object.freeze({
      charge: {
        prompt_tokens: inputSide,
        completion_tokens: chargedOutput,
        total_tokens: inputSide + chargedOutput
      },
      reported: null, thoughtsTokens, problem: "INCONSISTENT" as const
    });
  }
  const reported = Object.freeze({
    prompt_tokens: promptCount,
    completion_tokens: outputSide,
    total_tokens: promptCount + outputSide
  });
  return Object.freeze({ charge: reported, reported, thoughtsTokens, problem: null });
}

/* ---------------------------------------------------------------- gateway */

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * The options are the OpenAI gateway's, read the Gemini way: `endpoint` must be
 * the one Gemini base, `authorizationHeader` carries the BARE key (sent as
 * `x-goog-api-key`), a declared thinking capability must use the vendor
 * spelling (`reasoning_effort`: an API vendor, which never echoes), and the
 * JSON-object response mode is refused (no Gemini row has it).
 */
function assertGeminiGatewayOptions(options: OpenAICompatibleGatewayOptions): void {
  if (options.endpoint !== GOOGLE_GEMINI_BASE_URL) throw new TypeError("PROVIDER_GEMINI_ENDPOINT_INVALID");
  if (typeof options.model !== "string" || !GEMINI_MODEL_ID_PATTERN.test(options.model)) {
    throw new TypeError("PROVIDER_GEMINI_MODEL_INVALID");
  }
  if (options.contextWindowTokens !== undefined && !isContextWindowTokens(options.contextWindowTokens)) {
    throw new TypeError("PROVIDER_GATEWAY_CONTEXT_WINDOW_INVALID");
  }
  if (options.supportsJsonObjectResponse !== undefined && options.supportsJsonObjectResponse !== false) {
    throw new TypedDomainError("PROVIDER_RESPONSE_FORMAT_CAPABILITY_INVALID", "Invalid JSON object response capability");
  }
  if (options.thinking !== undefined && options.thinking.parameter !== "reasoning_effort") {
    throw new TypeError("PROVIDER_GEMINI_THINKING_INVALID");
  }
  if (options.authorizationHeader !== undefined) assertGeminiCredentialForm(options.authorizationHeader);
}

export class GeminiGenerateProviderGateway implements ProviderGateway {
  readonly #options: OpenAICompatibleGatewayOptions;

  constructor(options: OpenAICompatibleGatewayOptions) {
    assertGeminiGatewayOptions(options);
    this.#options = options;
  }

  async call(request: ProviderCallRequest): Promise<ProviderCallResult> {
    this.#options.assertNoOpenWriteTransaction();
    if (request.preferredResponseFormat !== undefined && request.preferredResponseFormat !== "json_object") {
      throw new TypedDomainError("PROVIDER_RESPONSE_FORMAT_INVALID", "Unsupported preferred response format");
    }
    if (!Number.isInteger(request.bound.maxAttempts) || request.bound.maxAttempts < 1) {
      throw new TypeError("CallBound.maxAttempts must be a positive integer");
    }
    // V-11 addendum, layer 1 — the same door every hand-off passes.
    const frame = assertFramedPrompt(request.packet);
    // Model scorecard §2.2 — decided once, before the first byte leaves.
    const thinking = resolveThinkingLevel(request.thinkingLevel, this.#options.thinking, request.providerRef);
    const wireThinkingLevel = thinking.sent === THINKING_LEVEL_DEFAULT_ONLY ? undefined : thinking.sent;
    assertProviderCallRecord(request);
    const url = geminiGenerateContentUrl(this.#options.endpoint, this.#options.model);
    const callFacts = Object.freeze({
      modelRole: request.modelRole ?? null,
      candidateId: request.candidateId ?? null,
      scorecardVersion: request.scorecardVersion ?? null
    });
    const fetcher = this.#options.fetchImplementation ?? fetch;
    const sleep = this.#options.sleepImplementation ?? realSleep;
    let attemptsMade = 0;
    let packetRefused = false;
    let lastError: unknown;
    let lastOutcome: "TIMED_OUT" | "FAILED" = "FAILED";
    let lastLedgerEntryRef = "PROVIDER_LEDGER_ENTRY_UNRESOLVED";
    let attemptPacket = request.packet;
    let lengthFailures = 0;
    let lastContentRejection: {
      attempts: number;
      parseStatus: ProviderContentRejectionStatus;
      parseError: string;
      rawArtifactRef: string;
      ledgerEntryRef: string;
    } | null = null;
    const contextWindowTokens = this.#options.contextWindowTokens;
    const fitsContextWindow = (packet: PromptPacket, tokenCeiling: number): boolean =>
      contextWindowTokens === undefined
        || estimateWindowTokens(packet.messages) + tokenCeiling <= contextWindowTokens;

    for (let attempt = 1; attempt <= request.bound.maxAttempts; attempt += 1) {
      // Capped at the model's output limit: a retry never asks for more.
      const attemptTokenCeiling = Math.min(
        lengthRetryTokenCeiling(request.bound.tokenCeiling, lengthFailures), GEMINI_MAX_OUTPUT_TOKENS
      );
      if (attempt > 1 && !fitsContextWindow(attemptPacket, attemptTokenCeiling)) break;
      if (attempt > 1) await sleep(providerBackoffMs(attempt));
      await request.assertAttemptAllowed?.();
      // The native body. Built before the money decision so the seam is given
      // the exact bytes that will be sent.
      const body = geminiGenerateContentBody({
        messages: attemptPacket.messages,
        maxOutputTokens: attemptTokenCeiling,
        ...(wireThinkingLevel === undefined ? {} : { thinkingLevel: wireThinkingLevel })
      });
      const costAdmission = await request.costEnvelope?.assertCallAllowed({
        requestBytes: Buffer.byteLength(body, "utf8"),
        completionTokenCeiling: attemptTokenCeiling
      });
      attemptsMade = attempt;
      const inputHash = digest(JSON.stringify(attemptPacket));
      const attemptId = randomUUID();
      const startedAt = new Date();
      let rawArtifactRef: string | null = null;
      let ledgerRecorded = false;
      const attemptThinkingLevel: string = thinking.sent;
      let promptRecordFailed = false;
      try {
        const headers = geminiRequestHeaders(this.#options.authorizationHeader);
        if (Buffer.byteLength(body, "utf8") > MAX_PROVIDER_REQUEST_PACKET_BYTES) {
          packetRefused = true;
          throw new TypedDomainError(
            "PROVIDER_PACKET_TOO_LARGE",
            `Provider request packet exceeded ${MAX_PROVIDER_REQUEST_PACKET_BYTES} bytes`
          );
        }
        if (!fitsContextWindow(attemptPacket, attemptTokenCeiling)) {
          throw new TypedDomainError(
            PROVIDER_CONTEXT_WINDOW_EXCEEDED,
            `${request.providerRef} declares a ${contextWindowTokens}-token context window and this attempt would not fit`
          );
        }
        if (request.runId !== null && this.#options.persistCallPrompt !== undefined) {
          try {
            await this.#options.persistCallPrompt({
              runId: request.runId,
              attemptId,
              promptText: JSON.stringify(attemptPacket.messages),
              messages: attemptPacket.messages
            });
          } catch (promptError) {
            promptRecordFailed = true;
            throw promptError;
          }
        }
        const response = await fetcher(url, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(request.bound.deadlineMs),
          body
        });
        const rawText = await readBoundedResponseText(response);
        let decoded: unknown;
        try {
          decoded = JSON.parse(rawText);
        } catch {
          decoded = null;
        }
        const reading = readGeminiReply(decoded);
        const usage = readGeminiUsage(isRecord(decoded) ? decoded.usageMetadata : undefined);
        const modelVersionBounded = reading.modelVersion !== null && isBoundedProviderModelId(reading.modelVersion);
        const content = reading.content;
        let classifiedContent: ContentClassification | {
          readonly parseStatus: "UNPARSED";
          readonly parseError: null;
        };
        try {
          classifiedContent = content === null
            ? { parseStatus: "UNPARSED", parseError: null }
            : request.classifyContent?.(content) ?? {
                parseStatus: contentParseStatus(content),
                parseError: null
              };
        } catch (error) {
          classifiedContent = {
            parseStatus: "SCHEMA_FAILED",
            parseError: error instanceof Error ? error.message : String(error)
          };
        }
        const tripwires = scanPromptTripwires({
          frame,
          contractId: frame.contractId,
          answer: content ?? rawText
        });
        rawArtifactRef = await this.#options.persistRawArtifact({
          artifactId: randomUUID(),
          attemptId,
          runId: request.runId,
          providerRef: request.providerRef,
          provider: GOOGLE_GEMINI_HTTP_ADAPTER_KIND,
          model: modelVersionBounded ? reading.modelVersion! : this.#options.model,
          maker: this.#options.maker,
          modelVersion: modelVersionBounded ? reading.modelVersion : null,
          rawText,
          metadata: {
            status: response.status,
            attempt,
            ...(tripwires.length === 0 ? {} : { prompt_tripwires: tripwires }),
            usage: usage.reported,
            finish_reason: reading.recordedFinishReason,
            token_ceiling: attemptTokenCeiling
          },
          parseStatus: classifiedContent.parseStatus,
          parseError: classifiedContent.parseError,
          inputHash,
          contractHash: request.contractHash,
          contentHash: digest(rawText),
          thinkingTokens: usage.thoughtsTokens
        });
        // V-28 / I4 — the charge, before any decision about the body.
        // A 2xx was billed. If it reported nothing billable (no usageMetadata,
        // or an empty one), it is charged the projected maximum, never zero.
        // An error status is not billed and keeps the OpenAI gateway's rule.
        const billedWithoutUsage = response.ok && usage.reported === null && usage.problem === null;
        await request.costEnvelope?.recordCall({
          providerRef: request.providerRef,
          usage: billedWithoutUsage ? GEMINI_UNREPORTED_USAGE_CHARGE : usage.charge,
          ...(costAdmission === undefined ? {} : { admission: costAdmission }),
          projection: {
            requestBytes: Buffer.byteLength(body, "utf8"),
            completionTokenCeiling: attemptTokenCeiling
          },
          attemptId
        });
        // Google's error body (`{"error":{code,status,message}}`) is never
        // quoted: the status alone names the failure, exactly as on the
        // OpenAI wire, and it is retried as a transport failure.
        if (!response.ok) throw new Error(`PROVIDER_HTTP_STATUS_${response.status}`);
        if (reading.modelVersion !== null && !modelVersionBounded) {
          throw new TypedDomainError(
            "PROVIDER_MODEL_INVALID",
            "Provider model id must be 1..256 characters"
          );
        }
        if (usage.problem !== null) {
          throw new TypedDomainError(
            "PROVIDER_USAGE_INVALID",
            "Provider usage counters must be non-negative integers within the bounded range that add up"
          );
        }
        await request.costEnvelope?.assertUsageReported({
          providerRef: request.providerRef,
          usage: usage.reported
        });
        if (reading.verdict === "REFUSED") {
          throw new TypedDomainError(
            PROVIDER_CONTENT_REFUSED,
            `${request.providerRef} stopped the answer for its own reasons`
          );
        }
        const truncated = reading.verdict === "MAX_TOKENS";
        const strictReadable = (reading.verdict === "STOP" || reading.verdict === "MAX_TOKENS")
          && content !== null && reading.modelVersion !== null;
        const contentRejection: {
          readonly parseStatus: ProviderContentRejectionStatus;
          readonly parseError: string;
        } | null =
          classifiedContent.parseStatus === "PARSE_FAILED" || classifiedContent.parseStatus === "SCHEMA_FAILED"
            ? {
                parseStatus: truncated ? PROVIDER_CONTENT_LENGTH_EXCEEDED : classifiedContent.parseStatus,
                parseError: classifiedContent.parseError
              }
            : truncated && !strictReadable
              ? {
                  parseStatus: PROVIDER_CONTENT_LENGTH_EXCEEDED,
                  parseError: "The completion was cut off at the token bound before a parseable response body"
                }
              : null;
        if (request.classifyContent !== undefined && contentRejection !== null) {
          const ledgerEntryRef = await this.#options.appendLedgerEntry({
            attemptId,
            runId: request.runId,
            actionKind: "MODEL_CALL",
            callSiteKey: request.callSiteKey,
            subjectItemId: request.subjectItemId,
            stanceAtAction: "UNASSIGNED",
            outcome: "FAILED",
            ...callFacts,
            thinkingLevel: attemptThinkingLevel,
            inputHash,
            contractHash: request.contractHash,
            actorRef: request.providerRef,
            rawArtifactRef,
            startedAt,
            finishedAt: new Date()
          });
          ledgerRecorded = true;
          lastContentRejection = {
            attempts: attempt,
            parseStatus: contentRejection.parseStatus,
            parseError: contentRejection.parseError,
            rawArtifactRef,
            ledgerEntryRef
          };
          if (contentRejection.parseStatus === PROVIDER_CONTENT_LENGTH_EXCEEDED) {
            lengthFailures += 1;
            attemptPacket = request.packet;
            // At the output limit already: the retry would be the same request
            // under the same bound, so it is not sent.
            if (Math.min(lengthRetryTokenCeiling(request.bound.tokenCeiling, lengthFailures), GEMINI_MAX_OUTPUT_TOKENS)
              <= attemptTokenCeiling) break;
          } else if (attempt < request.bound.maxAttempts && request.buildRepairPacket !== undefined) {
            const repair = request.buildRepairPacket({
              rawText: content ?? rawText,
              parseStatus: contentRejection.parseStatus,
              parseError: contentRejection.parseError
            });
            assertFramedPrompt(repair);
            attemptPacket = repair;
          }
          continue;
        }
        lastContentRejection = null;
        if (!strictReadable) {
          throw new TypedDomainError("PROVIDER_RESPONSE_INVALID", "The Gemini reply carried no readable answer");
        }
        // L4-F10 — the model the vendor SAYS answered must be the pinned one,
        // exactly. The echoed form for every Gemini model is not yet measured
        // (it may carry a suffix): until it is, this fails closed.
        if (reading.modelVersion !== this.#options.model) {
          throw new TypedDomainError(
            "PROVIDER_MODEL_IDENTITY_CHANGED",
            `${request.providerRef} is pinned to ${this.#options.model} and the response asserted a different model`
          );
        }
        const ledgerEntryRef = await this.#options.appendLedgerEntry({
          attemptId,
          runId: request.runId,
          actionKind: "MODEL_CALL",
          callSiteKey: request.callSiteKey,
          subjectItemId: request.subjectItemId,
          stanceAtAction: "UNASSIGNED",
          outcome: "OK",
          ...callFacts,
          thinkingLevel: attemptThinkingLevel,
          inputHash,
          contractHash: request.contractHash,
          actorRef: request.providerRef,
          rawArtifactRef,
          startedAt,
          finishedAt: new Date()
        });
        ledgerRecorded = true;
        return {
          rawArtifactRef,
          ledgerEntryRef,
          content: content!,
          provider: GOOGLE_GEMINI_HTTP_ADAPTER_KIND,
          model: reading.modelVersion,
          maker: this.#options.maker,
          modelVersion: reading.modelVersion,
          thinkingLevel: attemptThinkingLevel,
          reasoningTokens: usage.thoughtsTokens
        };
      } catch (error) {
        if (promptRecordFailed) throw error;
        const shortCircuit = error instanceof TypedDomainError
          && (error.code.startsWith("PROMPT_FRAME_")
            || error.code === "PROVIDER_MODEL_IDENTITY_CHANGED"
            || error.code === "PROVIDER_USAGE_INVALID"
            || error.code === PROVIDER_THINKING_LEVEL_CHANGED
            || error.code === PROVIDER_THINKING_LEVEL_UNSUPPORTED
            || error.code === PROVIDER_CONTEXT_WINDOW_EXCEEDED
            || (PROVIDER_COST_ENVELOPE_REFUSAL_CODES as readonly string[]).includes(error.code));
        lastContentRejection = null;
        lastError = error;
        if (!ledgerRecorded) {
          lastOutcome = error instanceof DOMException && error.name === "TimeoutError" ? "TIMED_OUT" : "FAILED";
          lastLedgerEntryRef = await this.#options.appendLedgerEntry({
            attemptId,
            runId: request.runId,
            actionKind: "MODEL_CALL",
            callSiteKey: request.callSiteKey,
            subjectItemId: request.subjectItemId,
            stanceAtAction: "UNASSIGNED",
            outcome: lastOutcome,
            ...callFacts,
            thinkingLevel: attemptThinkingLevel,
            inputHash,
            contractHash: request.contractHash,
            actorRef: request.providerRef,
            rawArtifactRef,
            startedAt,
            finishedAt: new Date()
          });
        }
        if (shortCircuit) throw error;
        // A vendor stop is the same one backoff later: one billed call, one
        // FAILED row, then PROVIDER_CALL_FAILED with the stop as its cause.
        if (error instanceof TypedDomainError && error.code === PROVIDER_CONTENT_REFUSED) break;
      }
      if (packetRefused) break;
    }
    if (lastContentRejection !== null) {
      throw new ProviderContentUnacceptedError(
        lastContentRejection.attempts,
        lastContentRejection.parseStatus,
        lastContentRejection.parseError,
        lastContentRejection.rawArtifactRef,
        lastContentRejection.ledgerEntryRef
      );
    }
    throw new ProviderCallFailedError(lastError, attemptsMade, lastOutcome, lastLedgerEntryRef);
  }
}
