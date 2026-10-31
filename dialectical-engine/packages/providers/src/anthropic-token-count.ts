import { TypedDomainError } from "@debateai/kernel";
import { ANTHROPIC_COUNT_TOKENS_PATH, anthropicCountTokensRequestBody, anthropicMessagesRequestHeaders, isAnthropicHostPairing } from "./anthropic-messages.js";
import type { PromptPacket } from "./index.js";

/**
 * R22 decision 28: THE REAL TOKEN COUNT. Haiku's calls stay under 100,000 tokens, and bytes are only an estimate. This asks Anthropic's
 * free endpoint (POST /v1/messages/count_tokens) for a packet exactly as the call would send it. It is the gateway's way to Anthropic,
 * not a second one: the same base URL, the same key, the same fetch (on the preview, the guarded fetch to the Anthropic gate).
 * It never throws and never stops a call: a failed count is null, logged by code only, and the caller falls back to its byte guard.
 * It imports no value from ./index.ts, for the reason anthropic-messages.ts gives. Only the number is read.
 */
export type TokenCounter = (input: Readonly<{ packet: PromptPacket; sharedFirstFieldCount?: number }>) => Promise<number | null>;

export const ANTHROPIC_TOKEN_COUNT_TIMEOUT_MS = 15_000;
/** The line itself: Haiku's price steps up above it. */
export const ANTHROPIC_TOKEN_LINE = 100_000 as const;
/**
 * "Close to the line", on the byte guard's own estimate (bytes / 2): from 60,000. The estimate counts a token for every 2 bytes, and real
 * text runs well below that (Latin about 1 for 4, Chinese about 1 for 3), so it is more likely to be too high than too low. A call under
 * 60,000 would pass the line only at more than 0.83 tokens a byte, which no language reaches. Below it there is no extra step.
 */
export const ANTHROPIC_TOKEN_COUNT_FROM_ESTIMATE = 60_000 as const;

export function createAnthropicTokenCounter(options: Readonly<{
  endpoint: string;
  model: string;
  authorizationHeader?: string;
  fetchImplementation?: typeof fetch;
  log?: (event: string, detail: Record<string, unknown>) => void;
}>): TokenCounter {
  if (!isAnthropicHostPairing(true, options.endpoint)) throw new TypeError("PROVIDER_ADAPTER_HOST_MISMATCH");
  const fetcher = options.fetchImplementation ?? fetch;
  const failed = (reason: string): null => {
    options.log?.("ANTHROPIC_TOKEN_COUNT_FAILED", { reason });
    return null;
  };
  return async ({ packet, sharedFirstFieldCount }) => {
    try {
      const response = await fetcher(`${options.endpoint}${ANTHROPIC_COUNT_TOKENS_PATH}`, {
        method: "POST",
        headers: anthropicMessagesRequestHeaders(options.authorizationHeader),
        signal: AbortSignal.timeout(ANTHROPIC_TOKEN_COUNT_TIMEOUT_MS),
        body: anthropicCountTokensRequestBody({ model: options.model, messages: packet.messages,
          ...(sharedFirstFieldCount === undefined ? {} : { sharedFirstFieldCount }) })
      });
      if (!response.ok) return failed(`HTTP_${String(response.status)}`);
      const tokens = (await response.json() as Readonly<{ input_tokens?: unknown }>).input_tokens;
      return Number.isSafeInteger(tokens) && Number(tokens) >= 0 ? Number(tokens) : failed("NO_NUMBER");
    } catch (error) {
      return failed(error instanceof TypedDomainError ? error.code : error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(error.name) ? error.name : "UNTYPED");
    }
  };
}
