import { TypedDomainError } from "@debateai/kernel";
import {
  anthropicMessagesRequestBody, anthropicMessagesRequestHeaders, assertFramedPrompt, PREVIEW_ANTHROPIC_MESSAGES_URL, PREVIEW_GATE_SLOT_WAIT_MS,
  PREVIEW_REQUEST_BODY_MAX_BYTES, ProviderUnbilledRefusal, readAnthropicMessagesReply, scanPromptTripwires, type PromptFramePresence, type PromptPacket
} from "@debateai/providers";
import { letGoOnAbort } from "../question-language/transport.js";
import { PublicationJudgeFailure, type JudgeFailureCause, type PublicationJudgePort } from "./check.js";

/**
 * THE CONTENT CHECKS ON A SITE WITH THE PREVIEW GATE. The publication judge (a finished Free debate, an owner's Publish, the
 * Report button, contributions and AI-written reports on public pages) and the end-of-debate synthesis check go to Claude
 * Haiku 5.5 through the Anthropic gate, as the question check does. There the API holds no vendor key and its egress proxy
 * lets only the payment hosts through, so the support target (SUPPORT_MODEL_TARGET_JSON) could never reach the vendor: the
 * gate holds the key, and reserves, settles and caps every call in its own daily pot.
 *
 * The route, decided once at boot from the env's preview gate part:
 *   preview, the guarded fetch and the Anthropic gate's socket   GATE            the gate; no key, the support target never read
 *   preview without either                                       OFF             no judge: every check is unavailable
 *   no preview                                                   SUPPORT_TARGET  the support target when it is set
 * A preview never takes the support target: that would put a vendor key in the API, and its calls could not leave anyway.
 */
export type ContentCheckRoute = Readonly<{ kind: "GATE"; fetch: typeof fetch }> | Readonly<{ kind: "OFF" }> | Readonly<{ kind: "SUPPORT_TARGET" }>;

export function contentCheckRouteFor(preview: Readonly<{ fetch: typeof fetch | undefined; anthropicSocket: string | undefined }> | null): ContentCheckRoute {
  if (preview === null) return Object.freeze({ kind: "SUPPORT_TARGET" });
  return preview.fetch !== undefined && preview.anthropicSocket !== undefined
    ? Object.freeze({ kind: "GATE", fetch: preview.fetch })
    : Object.freeze({ kind: "OFF" });
}

/**
 * How long a check that runs in the background may take: the Free sweep, the contributions and AI-written reports on public
 * pages, and the end-of-debate synthesis check's worker. On the gate it also waits out the gate's slot queue
 * (PREVIEW_GATE_SLOT_WAIT_MS) on top of D: running debates can hold the gate's few slots, and nobody waits on these checks.
 * An owner's Publish keeps D, because the website's publish wait is sized for D (packages/register/src/publication-check-policy.ts),
 * and the Report button keeps its own limit: a check still queued then is simply unavailable, which nothing publishes or hides.
 */
export function contentCheckBackgroundDeadlineMs(route: ContentCheckRoute, deadlineMs: number): number {
  return route.kind === "GATE" ? deadlineMs + PREVIEW_GATE_SLOT_WAIT_MS : deadlineMs;
}

/** On the gate: one call at a time for a check nobody waits on, and two for an owner's Publish (see below). */
const CONTENT_CHECK_GATE_BACKGROUND_CALLS_AT_ONCE = 1;
const CONTENT_CHECK_GATE_PUBLISH_CALLS_AT_ONCE = 2;

/**
 * How many of one check's calls may be at the gate at the same time, as the check's `maxConcurrentCalls`. The gate runs
 * few calls at once (its GO's max_concurrent_calls, 2 in deploy/preview-gate/v3/README-anthropic.md), and those slots
 * also serve the runner's Claude Haiku calls and the question check. A call that finds them full waits in the gate's
 * queue, in turn, and is refused after the gate's slot wait. With the check's own bound (publication-check/check.ts) a
 * long debate's check would put a string of calls in that queue at once, ahead of a debate's call or a person's
 * question, which could then be refused. So on the gate a check that runs in the background (the sweeps, and the
 * end-of-debate check's worker, which then checks one finished debate at a time: synthesis-check/worker.ts) sends one call
 * at a time and never holds more than one slot; it has the slot wait on top of D for its calls one after another. An
 * owner's Publish, which a person waits for within D, sends two: as many as the GO runs at once, so its calls never
 * queue behind each other, and at most one of them is ahead of anyone else's. Other routes keep the check's own bound.
 */
export function contentCheckCallsAtOnce(route: ContentCheckRoute, who: "BACKGROUND" | "PUBLISH"): Readonly<{ maxConcurrentCalls?: number }> {
  if (route.kind !== "GATE") return Object.freeze({});
  return Object.freeze({ maxConcurrentCalls: who === "PUBLISH" ? CONTENT_CHECK_GATE_PUBLISH_CALLS_AT_ONCE : CONTENT_CHECK_GATE_BACKGROUND_CALLS_AT_ONCE });
}

/** The provider and model the checks' records name on the gate route (the question check's preview port names the same). */
export const CONTENT_CHECK_GATE_PROVIDER_REF = "anthropic";
export const CONTENT_CHECK_GATE_MODEL = "claude-haiku-5-5";
/** The lowest level on the gate's reviewed menu, as the question check asks: a check fills in a short answer form. */
const CONTENT_CHECK_GATE_EFFORT = "low";
/** The answer bound the hosted support adapter and the question check send; the gate reserves its whole bound either way. */
const CONTENT_CHECK_GATE_MAX_OUTPUT_TOKENS = 16_000;
/** The largest reply read, as the support adapter reads. */
const CONTENT_CHECK_GATE_REPLY_MAX_BYTES = 256 * 1024;

export type ContentCheckGateFailureKind =
  /** The packet is not a framed prompt: nothing left the process. */
  | "DOOR_REFUSED"
  /** The body could not be built, or would be larger than a standard call: nothing was sent. */
  | "NOT_SENT"
  /** The caller's time ran out. */
  | "DEADLINE"
  /** A refusal the app can tell reserved nothing: the guard's own, or the gate's busy, cooling, not served, the day used up. */
  | "REFUSED"
  /**
   * Anything else on the way, which may have been charged: the gate booked the call without an answer, its answer did not
   * come back, or it refused in a way the app cannot tell from a failure after a reservation (its opaque stop, a halted gate).
   */
  | "SEND_FAILED"
  /** The vendor's own status, passed on by the gate. */
  | "HTTP_STATUS"
  /** The answer was cut off at its bound. */
  | "TRUNCATED"
  /** A reply that is not one usable text answer. */
  | "UNUSABLE";

export class ContentCheckGateFailure extends Error {
  /** `billed`: the gate may have charged this call; false only for a failure that provably reserved nothing. */
  constructor(readonly kind: ContentCheckGateFailureKind, readonly billed: boolean) {
    super(kind);
    this.name = "ContentCheckGateFailure";
  }
}

/**
 * A refusal the app can tell reserved nothing: the guarded fetch's own refusal (a TypeError), the gate's busy, cooling,
 * not-served and never-reached answers (ProviderUnbilledRefusal), and a day whose pot or call count is used up. Not here,
 * so counted as possibly charged: the gate's opaque PREVIEW_TEST_AUTHORITY_STOPPED, which covers every failure after a
 * reservation as well as refusals before one (a caller its GO does not list, a request it finds invalid); a halted gate,
 * which the guarded fetch reads the same way whether the gate said AUTHORITY_HALTED before reserving or stopped a call it
 * had sent and then halted; and a line the gate closed without an answer.
 */
function reservedNothing(error: unknown): boolean {
  return error instanceof TypeError || error instanceof ProviderUnbilledRefusal
    || (error instanceof TypedDomainError && error.code === "DAILY_COST_ENVELOPE_REACHED");
}

export type ContentCheckGateAnswer = Readonly<{ text: string; usage?: Readonly<{ input_tokens: number; output_tokens: number }> }>;
export type ContentCheckGateCall = (input: Readonly<{ packet: PromptPacket; signal: AbortSignal }>) => Promise<ContentCheckGateAnswer>;

const counted = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/**
 * One check call through the Anthropic gate: Claude Haiku 5.5, the gate's lowest level, no key header, the exact Messages URL
 * the guarded fetch routes to that gate.
 *
 * `fetch` is the guarded fetch over gate ports that half-close on an abort (main.ts: previewLanguageCheckFetch). The caller's
 * signal goes to it, so a call still waiting in the gate's queue when the check's time runs out is cancelled before the gate
 * sends it (nothing paid), and a call the gate already sent is delivered and dropped, never cut off: a gate whose paid reply
 * cannot be delivered halts. The time limit is raced here too, so the check ends on time whatever the port does.
 *
 * The door is the support adapter's: a packet that is not a framed prompt never leaves the process, and an answer is scanned
 * for the frame's tripwires, which are reported by code only. A body larger than a standard call is refused here, so a check
 * never takes a final writer's slot or cap. Nothing is recorded as spend: the gate settles these calls. The vendor's token
 * counts are returned for the checks' own measures.
 */
export function createContentCheckGateCall(options: Readonly<{ fetch: typeof fetch; reportDiagnostic?: (code: string) => void }>): ContentCheckGateCall {
  const report = (code: string): void => {
    try { options.reportDiagnostic?.(code); } catch { /* A failing log sink never fails a check. */ }
  };
  return async ({ packet, signal }) => {
    let frame: PromptFramePresence;
    try { frame = assertFramedPrompt(packet); } catch { throw new ContentCheckGateFailure("DOOR_REFUSED", false); }
    let body: string;
    try {
      body = anthropicMessagesRequestBody({ model: CONTENT_CHECK_GATE_MODEL, maxTokens: CONTENT_CHECK_GATE_MAX_OUTPUT_TOKENS,
        thinkingLevel: CONTENT_CHECK_GATE_EFFORT, messages: packet.messages });
    } catch {
      throw new ContentCheckGateFailure("NOT_SENT", false);
    }
    if (Buffer.byteLength(body, "utf8") > PREVIEW_REQUEST_BODY_MAX_BYTES) throw new ContentCheckGateFailure("NOT_SENT", false);
    if (signal.aborted) throw new ContentCheckGateFailure("DEADLINE", false);
    let response: Response;
    try {
      response = await letGoOnAbort(options.fetch(PREVIEW_ANTHROPIC_MESSAGES_URL, {
        method: "POST", headers: anthropicMessagesRequestHeaders(undefined), body, signal }), signal);
    } catch (error) {
      if (signal.aborted) throw new ContentCheckGateFailure("DEADLINE", true);
      throw reservedNothing(error) ? new ContentCheckGateFailure("REFUSED", false) : new ContentCheckGateFailure("SEND_FAILED", true);
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      throw new ContentCheckGateFailure("HTTP_STATUS", true);
    }
    let decoded: unknown;
    try {
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > CONTENT_CHECK_GATE_REPLY_MAX_BYTES) throw new RangeError("CONTENT_CHECK_GATE_REPLY_TOO_LARGE");
      decoded = JSON.parse(raw);
    } catch {
      throw new ContentCheckGateFailure("UNUSABLE", true);
    }
    const reply = readAnthropicMessagesReply(decoded);
    if (reply.failure !== null) throw new ContentCheckGateFailure("UNUSABLE", true);
    const normalized = reply.normalized as Readonly<{
      choices?: readonly Readonly<{ message?: Readonly<{ content?: unknown }>; finish_reason?: unknown }>[];
      usage?: Readonly<{ prompt_tokens?: unknown; completion_tokens?: unknown }>;
    }> | null;
    const choice = normalized?.choices?.[0];
    if (choice?.finish_reason === "length") throw new ContentCheckGateFailure("TRUNCATED", true);
    const content = choice?.message?.content;
    if (typeof content !== "string" || content.trim() === "") throw new ContentCheckGateFailure("UNUSABLE", true);
    const text = content.trim();
    for (const tripwire of scanPromptTripwires({ frame, contractId: frame.contractId, answer: text })) report(`PROMPT_TRIPWIRE:${tripwire.signal}`);
    const input = normalized?.usage?.prompt_tokens;
    const output = normalized?.usage?.completion_tokens;
    return counted(input) && counted(output) ? { text, usage: { input_tokens: input, output_tokens: output } } : { text };
  };
}

/** The judge's diagnostics carry the judge's name, as on the support target's route. */
const JUDGE_DIAGNOSTIC_PREFIX = "PUBLICATION_JUDGE:";

/**
 * The publication judge on the gate route. Every failure is a PublicationJudgeFailure, which the checks read as UNAVAILABLE:
 * nothing is published, nothing is hidden, a report goes to a person and the sweep tries again later.
 */
export function createPreviewPublicationJudgeTransport(options: Readonly<{
  fetch: typeof fetch;
  reportDiagnostic?: (diagnostic: Readonly<{ code: string }>) => void;
}>): PublicationJudgePort {
  const send = createContentCheckGateCall({ fetch: options.fetch,
    reportDiagnostic: (code) => options.reportDiagnostic?.({ code: `${JUDGE_DIAGNOSTIC_PREFIX}${code}` }) });
  return {
    providerRef: CONTENT_CHECK_GATE_PROVIDER_REF,
    modelId: CONTENT_CHECK_GATE_MODEL,
    async complete(input) {
      try {
        return await send(input);
      } catch (error) {
        const kind = error instanceof ContentCheckGateFailure ? error.kind : "SEND_FAILED";
        const cause: JudgeFailureCause = kind === "DOOR_REFUSED" ? "JUDGE_DOOR_REFUSED"
          : input.signal.aborted ? "JUDGE_DEADLINE"
          : kind === "TRUNCATED" ? "JUDGE_ANSWER_NOT_JSON"
          : kind === "HTTP_STATUS" ? "JUDGE_HTTP_STATUS"
          : "JUDGE_TRANSPORT_FAILED";
        throw new PublicationJudgeFailure(cause);
      }
    }
  };
}
