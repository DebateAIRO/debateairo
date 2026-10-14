import { TypedDomainError } from "@debateai/kernel";
import {
  ANTHROPIC_MESSAGES_BASE_URL, ANTHROPIC_MESSAGES_PATH, anthropicMessagesRequestBody, anthropicMessagesRequestHeaders,
  assertAnthropicCredentialShape, previewChargedInputTokens, readAnthropicMessagesReply
} from "@debateai/providers";
import type { QuestionLanguageFastCheck } from "@debateai/register";
import type { FastCheckTransport } from "./fast-check.js";

/**
 * What one fast check cost, in tokens. `projected`: true when the vendor named no usage, the reply could not be
 * read, or the call failed or was aborted after it was sent; the counts are then the projected maximum (pre-flight
 * PF-L16, the money law: never under-count).
 */
export type FastCheckUsage = Readonly<{ inputTokens: number; outputTokens: number; projected: boolean }>;

/** The largest reply body read (as the support chat's relay reads, support/model.ts); a fast reply is a few KB. */
const LIMITS = Object.freeze({ replyBytes: 256 * 1024 });

/** Every error this file raises: the message IS the code (pre-flight PF-L13); no question, rewrite or reply text. */
function failure(code: string): TypedDomainError {
  return new TypedDomainError(code, code);
}

/** The reply body, read up to the bound; past it the read is cancelled and the reply refused by code. */
async function readBoundedReply(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > LIMITS.replyBytes) throw failure("QUESTION_LANGUAGE_FAST_CHECK_REPLY_TOO_LARGE");
    return raw;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > LIMITS.replyBytes) {
        await reader.cancel("QUESTION_LANGUAGE_FAST_CHECK_REPLY_TOO_LARGE").catch(() => undefined);
        throw failure("QUESTION_LANGUAGE_FAST_CHECK_REPLY_TOO_LARGE");
      }
      chunks.push(Buffer.from(next.value));
    }
    return Buffer.concat(chunks, total).toString("utf8");
  } finally {
    reader.releaseLock();
    for (const chunk of chunks) chunk.fill(0);
  }
}

/**
 * One Anthropic Messages POST for the fast language check (ruling CR-6: the only two ways in).
 *  · Preview: `fetch` is the guarded fetch (`createPreviewGuardedFetch`) and `url` its Anthropic Messages URL. The
 *    Anthropic gate adds the key, reserves and settles the call in its daily pot (a site cost; the gate has no run
 *    concept). `credential` is undefined, and the guarded fetch refuses any key header. NEVER pass `onUsage` on the
 *    preview: the gate settles preview money, and a guarded-fetch refusal (nothing reserved, nothing sent) would
 *    otherwise be recorded as phantom spend.
 *  · Hosted: `credential` is the key of the support chat's Anthropic target that already exists, and `onUsage`
 *    records the site cost (Task 19). No new credential is read here or anywhere. A key of the wrong shape, or a key
 *    aimed anywhere but the Anthropic Messages URL, is refused here, at construction (boot), loudly.
 * The transport logs nothing. The reply text is returned as is; fast-check.ts reads it strictly.
 *
 * Money (pre-flight PF-L16): `onUsage` is told the vendor's counts when it names them, and the projected maximum
 * whenever the call may have been billed without readable counts: no usage in the reply, a 200 whose body cannot
 * be read (or is larger than the bound), a send that fails, or an abort after the send began. The projected input
 * is the gate's own reservation bound, `previewChargedInputTokens` (the body's UTF-8 bytes plus the template
 * allowance: a token is never smaller than a byte, ruling L-B64), never the bytes-per-token estimate, which is a
 * margin and not a bound. The projected output is the row's whole output bound. A billed reply the vendor refused
 * is recorded before the throw. A non-200 answer (a refused request costs nothing) and a call aborted before it was
 * sent record nothing.
 *
 * A failing `onUsage` never replaces the transport's own code: on a failure path that code is thrown; on a good
 * reply a recorder that throws makes the call fail as QUESTION_LANGUAGE_FAST_CHECK_USAGE_UNRECORDED (a spend that
 * could not be recorded is never silent; the fast check reads it as DOWN, which never blocks the person). No
 * deployment reaches that branch today: the preview passes no onUsage (the gate settles its money), and hosted's
 * recorder (boot.ts, recordSpend) never throws. It logs one code line, counts the failure, and latches the breaker
 * until restart after 42501, 42883 or 23514, or after three failures in a row (a success resets that count only).
 */
export function anthropicFastCheckTransport(deps: Readonly<{
  fetch: typeof fetch; url: string; credential: string | undefined; settings: QuestionLanguageFastCheck;
  onUsage?: (usage: FastCheckUsage) => Promise<void> | void;
  /**
   * Fix round 2 (hosted only): asked before anything is sent. A code means "do not send": the call throws that code
   * (the fast check reads it as DOWN, the person gets the fallback lock) and nothing is sent or recorded. Null: send.
   * A gate that throws is a refusal too (QUESTION_LANGUAGE_FAST_CHECK_GATE_FAILED): never send what cannot be checked.
   */
  beforeSend?: () => Promise<string | null>;
}>): FastCheckTransport {
  if (deps.credential !== undefined) {
    assertAnthropicCredentialShape(deps.credential);
    if (deps.url !== `${ANTHROPIC_MESSAGES_BASE_URL}${ANTHROPIC_MESSAGES_PATH}`) throw failure("QUESTION_LANGUAGE_FAST_CHECK_URL_INVALID");
  }
  /** true when recorded (or nothing to record to); false when the recorder failed. Never throws. */
  const record = async (usage: FastCheckUsage): Promise<boolean> => {
    if (deps.onUsage === undefined) return true;
    try {
      await deps.onUsage(usage);
      return true;
    } catch {
      return false;
    }
  };
  return async ({ packet, signal }) => {
    const body = anthropicMessagesRequestBody({ model: deps.settings.model, maxTokens: deps.settings.maxOutputTokens,
      thinkingLevel: deps.settings.effort, messages: packet.messages });
    // The real framed request (the ~5 KB system frame included) is what is measured, never an estimate of it.
    const projectedMaximum: FastCheckUsage = Object.freeze({
      inputTokens: Number(previewChargedInputTokens(Buffer.byteLength(body, "utf8"))),
      outputTokens: deps.settings.maxOutputTokens,
      projected: true
    });
    // Aborted before anything left the app: nothing was sent, so nothing is recorded.
    if (signal.aborted) throw failure("QUESTION_LANGUAGE_FAST_CHECK_ABORTED");
    if (deps.beforeSend !== undefined) {
      let skip: string | null;
      try {
        skip = await deps.beforeSend();
      } catch {
        skip = "QUESTION_LANGUAGE_FAST_CHECK_GATE_FAILED";
      }
      if (skip !== null) throw failure(skip);
    }
    // M1: the gate's read may have outlasted the time limit. Aborted before the send: nothing is sent, nothing recorded.
    if (signal.aborted) throw failure("QUESTION_LANGUAGE_FAST_CHECK_ABORTED");
    let response: Response;
    try {
      response = await deps.fetch(deps.url, { method: "POST", headers: anthropicMessagesRequestHeaders(deps.credential), body, signal });
    } catch {
      // The send began and may have been billed (an abort after sending, a connection lost mid-call): never under-count.
      await record(projectedMaximum);
      throw failure(signal.aborted ? "QUESTION_LANGUAGE_FAST_CHECK_ABORTED" : "QUESTION_LANGUAGE_FAST_CHECK_SEND_FAILED");
    }
    if (response.status !== 200) {
      // A refused request costs nothing: no record. The message is the code (pre-flight PF-L13).
      await response.body?.cancel().catch(() => undefined);
      throw failure(`QUESTION_LANGUAGE_FAST_CHECK_HTTP_${String(response.status)}`);
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(await readBoundedReply(response));
    } catch (error) {
      await record(projectedMaximum);
      throw failure(signal.aborted ? "QUESTION_LANGUAGE_FAST_CHECK_ABORTED"
        : error instanceof TypedDomainError ? error.code : "QUESTION_LANGUAGE_FAST_CHECK_REPLY_UNREADABLE");
    }
    const reply = readAnthropicMessagesReply(decoded);
    const normalized = reply.normalized as { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null;
    const inputTokens = normalized?.usage?.prompt_tokens;
    const outputTokens = normalized?.usage?.completion_tokens;
    // anthropicUsageAsEngineUsage passes a missing or malformed counter on as -1: that is the projected maximum.
    const counted = typeof inputTokens === "number" && Number.isSafeInteger(inputTokens) && inputTokens >= 0
      && typeof outputTokens === "number" && Number.isSafeInteger(outputTokens) && outputTokens >= 0;
    const recorded = await record(counted ? Object.freeze({ inputTokens, outputTokens, projected: false }) : projectedMaximum);
    // A refusal or an unusable reply: thrown only AFTER the billed call is recorded. Its message holds no reply text.
    if (reply.failure !== null) throw reply.failure;
    const content = normalized?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw failure("QUESTION_LANGUAGE_FAST_CHECK_REPLY_EMPTY");
    if (!recorded) throw failure("QUESTION_LANGUAGE_FAST_CHECK_USAGE_UNRECORDED");
    return content;
  };
}
