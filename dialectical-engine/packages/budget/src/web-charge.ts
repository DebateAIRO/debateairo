/**
 * Web search (plan 2026-10-30, task W2-2) — WHAT ONE SEARCH COSTS, AND HOW IT IS WRITTEN.
 *
 * Plain words: Perplexity bills a flat 0.1 cent per search, whatever it returns, and never by tokens. So a successful
 * search is written to the same spend ledger as an AI call (`ledger.model_spend`, a RUN row of its debate, phase BODY),
 * with 0 tokens and its 1,000 micro-units, and every reader of a window (the day, the week, the month, the person's
 * room) counts it without any change. A search that failed costs nothing and writes nothing.
 *
 * The price is the gate's reviewed row (tests/unit/fixtures/preview-search-rows.json, task W1-1: request_usd 0.001,
 * request_nano_usd 1,000,000); a test keeps this constant equal to it.
 */
import { TypedDomainError } from "@debateai/kernel";

/** $0.001 per search, fast mode (W1-1's fixture), in USD micro-units. */
export const WEB_SEARCH_REQUEST_MICROS = 1_000 as const;

/** The reviewed search row's model id (W1-1's fixture `rows[0].model`). */
export const WEB_SEARCH_MODEL = "perplexity-search-fast" as const;

/**
 * A search's ledger `provider_ref`: `search:<the row's model>`. The prefix marks a per-request charge, so the recent-runs
 * estimate prices the row per search and never by its (zero) tokens. W2-1's adapter names its searches with it.
 */
export const WEB_SEARCH_PROVIDER_REF_PREFIX = "search:" as const;
export const WEB_SEARCH_PROVIDER_REF = `${WEB_SEARCH_PROVIDER_REF_PREFIX}${WEB_SEARCH_MODEL}` as const;

export function isWebSearchProviderRef(providerRef: unknown): providerRef is string {
  return typeof providerRef === "string" && providerRef.startsWith(WEB_SEARCH_PROVIDER_REF_PREFIX)
    && providerRef.length > WEB_SEARCH_PROVIDER_REF_PREFIX.length;
}

/**
 * How a search ended, as the adapter reports it (W2-1's typed result): only SUCCEEDED is charged. Every other end —
 * the gate down, halted, slow past its time limit, refusing, an empty or unreadable reply — costs nothing, because the
 * gate charges only a search Perplexity answered (an unbilled refusal costs nothing there either).
 */
export type WebSearchOutcome = "SUCCEEDED" | "FAILED";

/** The charge of one search with this outcome: its price when it succeeded, else 0. */
export function webSearchChargeMicros(outcome: WebSearchOutcome, requestMicros: number = WEB_SEARCH_REQUEST_MICROS): number {
  if (!Number.isSafeInteger(requestMicros) || requestMicros < 1) {
    throw new TypedDomainError("WEB_SEARCH_PRICE_INVALID", "A search's price must be a whole number of micro-units, at least one");
  }
  if (outcome === "SUCCEEDED") return requestMicros;
  if (outcome === "FAILED") return 0;
  throw new TypedDomainError("WEB_SEARCH_OUTCOME_INVALID", "A search ends SUCCEEDED or FAILED");
}
