import { PROJECTED_INPUT_BYTES_PER_TOKEN } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import { anthropicMessagesRequestBody, anthropicMessagesRequestHeaders, readAnthropicMessagesReply } from "@debateai/providers";
import type { QuestionLanguageFastCheck } from "@debateai/register";
import type { FastCheckTransport } from "./fast-check.js";

/**
 * What one fast check cost, in tokens. `projected`: true when the vendor named no usage, the reply could not be
 * read, or the call failed or was aborted after it was sent; the counts are then the projected maximum (pre-flight
 * PF-L16, the money law: never under-count).
 */
export type FastCheckUsage = Readonly<{ inputTokens: number; outputTokens: number; projected: boolean }>;

/** Every error this file raises: the message IS the code (pre-flight PF-L13); no question, rewrite or reply text. */
function failure(code: string): TypedDomainError {
  return new TypedDomainError(code, code);
}

/**
 * One Anthropic Messages POST for the fast language check (ruling CR-6: the only two ways in).
 *  · Preview: `fetch` is the guarded fetch (`createPreviewGuardedFetch`) and `url` its Anthropic Messages URL. The
 *    Anthropic gate adds the key, reserves and settles the call in its daily pot (a site cost; the gate has no run
 *    concept). `credential` is undefined, and the guarded fetch refuses any key header.
 *  · Hosted: `credential` is the key of the support chat's Anthropic target that already exists, and `onUsage`
 *    records the site cost (Task 19). No new credential is read here or anywhere.
 * The transport logs nothing. The reply text is returned as is; fast-check.ts reads it strictly.
 *
 * Money (pre-flight PF-L16): `onUsage` is told the vendor's counts when it names them, and the projected maximum
 * (the request body's UTF-8 bytes by the money seam's own bytes-per-token rule, plus the row's whole output bound)
 * whenever the call may have been billed without readable counts: no usage in the reply, a 200 whose body cannot
 * be read, a send that fails, or an abort after the send began. A billed reply the vendor refused is recorded
 * before the throw. A non-200 answer (a refused request costs nothing) and a call aborted before it was sent record
 * nothing.
 */
export function anthropicFastCheckTransport(deps: Readonly<{
  fetch: typeof fetch; url: string; credential: string | undefined; settings: QuestionLanguageFastCheck;
  onUsage?: (usage: FastCheckUsage) => Promise<void> | void;
}>): FastCheckTransport {
  const record = async (usage: FastCheckUsage): Promise<void> => {
    if (deps.onUsage !== undefined) await deps.onUsage(usage);
  };
  return async ({ packet, signal }) => {
    const body = anthropicMessagesRequestBody({ model: deps.settings.model, maxTokens: deps.settings.maxOutputTokens,
      thinkingLevel: deps.settings.effort, messages: packet.messages });
    // The real framed request (the ~5 KB system frame included) is what is measured, never an estimate of it.
    const projectedMaximum: FastCheckUsage = Object.freeze({
      inputTokens: Math.ceil(Buffer.byteLength(body, "utf8") / PROJECTED_INPUT_BYTES_PER_TOKEN),
      outputTokens: deps.settings.maxOutputTokens,
      projected: true
    });
    // Aborted before anything left the app: nothing was sent, so nothing is recorded.
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
      throw failure(`QUESTION_LANGUAGE_FAST_CHECK_HTTP_${String(response.status)}`);
    }
    let decoded: unknown;
    try {
      decoded = await response.json();
    } catch {
      await record(projectedMaximum);
      throw failure(signal.aborted ? "QUESTION_LANGUAGE_FAST_CHECK_ABORTED" : "QUESTION_LANGUAGE_FAST_CHECK_REPLY_UNREADABLE");
    }
    const reply = readAnthropicMessagesReply(decoded);
    const normalized = reply.normalized as { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null;
    const inputTokens = normalized?.usage?.prompt_tokens;
    const outputTokens = normalized?.usage?.completion_tokens;
    // anthropicUsageAsEngineUsage passes a missing or malformed counter on as -1: that is the projected maximum.
    const counted = typeof inputTokens === "number" && Number.isSafeInteger(inputTokens) && inputTokens >= 0
      && typeof outputTokens === "number" && Number.isSafeInteger(outputTokens) && outputTokens >= 0;
    await record(counted ? Object.freeze({ inputTokens, outputTokens, projected: false }) : projectedMaximum);
    // A refusal or an unusable reply: thrown only AFTER the billed call is recorded. Its message holds no reply text.
    if (reply.failure !== null) throw reply.failure;
    const content = normalized?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw failure("QUESTION_LANGUAGE_FAST_CHECK_REPLY_EMPTY");
    return content;
  };
}
