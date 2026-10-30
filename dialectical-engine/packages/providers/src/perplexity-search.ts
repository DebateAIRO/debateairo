/**
 * THE WEB SEARCH ADAPTER (Perplexity plan 2026-10-30, task W2-1; design PERPLEXITY-DESIGN.md v2 §3.2 and §6; the
 * owner's answers of 2026-10-30).
 *
 * Web search is a search provider kind, NEVER a model: it is no declared target, has no model row, takes no seat and no
 * thinking level (a declared target becomes a debater, apps/runner/src/provider-topology.ts). One search is one request
 * to Perplexity's Search API (`POST https://api.perplexity.ai/search`), fast mode, $0.001 whatever its size.
 *
 * What this module does, in order:
 * 1. Builds the reviewed request: 10 results at a debate's start, 5 in a dig (owner); `max_tokens_per_page` for whole
 *    pages up to the page cap (about 16,000 words; the large-text test, plan W6-1, sets the final value); fast mode; the
 *    look-back date from W1-2's window. The country and language fields are sent only once the owner's 2-cent local test
 *    has run (`localFilters`, off by default). A search holding an email, phone, bank, card or ID number, or a web
 *    address with a query string, never leaves (kernel `findPersonalData`, the same scan W1-2's guard uses).
 * 2. Sends it through the given fetch: on the preview the guarded fetch, which routes this exact URL to the search
 *    gate's own socket (`perplexity_budget_socket`, preview-test.ts) and never carries a key; on a hosted server the
 *    plain fetch with the custody file's authorization header.
 * 3. Reads the answer against the closed member list the gate also holds (tests/unit/fixtures/preview-search-rows.json):
 *    any other member, a missing one, more results than asked, or an answer over 4 MiB is not read.
 * 4. Marks how much of each page was read (the contract's WHOLE, PREVIEW_ONLY, ABSTRACT_ONLY), drops pages with no
 *    usable address or no text, then applies the W1-2 page rules through `selectPages` (social and forum pages, the same
 *    address twice, one page per site, pages already read in the investigation reused). The rules live in
 *    `@debateai/evidence` (host-filter.ts), which depends on this package, so the caller hands them in.
 * 5. Answers every outcome as a value, never a throw: FOUND and EMPTY (answered: charged one search, 1,000 micros);
 *    FAILED (gate down or halted, busy, slow past its time limit, refusing, an answer it cannot read: costs nothing, and
 *    the debate goes on without web and says so, owner 2026-10-30); REFUSED (held before sending: costs nothing).
 *    The outcome words are 0132's (`identity.web_search.outcome`).
 *
 * The page text is returned to the web step only, which stores it in 0132's own encrypted page-text store before any
 * reader call and never in the AI call records (W1-3's notes, owner answer Q4).
 */
import { TypedDomainError, findPersonalData } from "@debateai/kernel";
import {
  PreviewChargeBookedMax, PreviewGateUnavailable, PreviewGateUnsent, PreviewModelNotServed, PreviewUnbilledRefusal,
  PreviewVendorRefusedUnbilled
} from "./preview-test.js";

/** The reviewed search row (W1-1's gate and parity file; owner 2026-10-30: fast mode, $0.001 a search). */
export const PERPLEXITY_SEARCH_VENDOR = "perplexity" as const;
export const PERPLEXITY_SEARCH_HOST = "api.perplexity.ai" as const;
export const PERPLEXITY_SEARCH_PATH = "/search" as const;
export const PERPLEXITY_SEARCH_URL = "https://api.perplexity.ai/search" as const;
export const PERPLEXITY_SEARCH_KEY_PREFIX = "pplx-" as const;
/** The gate's one row: what its records, its `/remaining` and the GO's enabled_models name. */
export const PERPLEXITY_SEARCH_MODEL = "perplexity-search-fast" as const;
export const PERPLEXITY_SEARCH_MAKER = "Perplexity" as const;
export const PERPLEXITY_SEARCH_TYPE = "fast" as const;
/** $0.001 per request, in nano-USD (the gate's hold and charge, to the digit). */
export const PERPLEXITY_SEARCH_REQUEST_NANO_USD = 1_000_000n;
/** The same price in the ledger's micros: what an answered search costs the person (0.1 cent). */
export const PERPLEXITY_SEARCH_CHARGE_MICROS = 1_000 as const;
/** The gate's request size cap. */
export const PERPLEXITY_SEARCH_REQUEST_MAX_BYTES = 16 * 1024;
export const PERPLEXITY_REQUEST_FIELDS = Object.freeze({
  required: Object.freeze(["query", "max_results", "max_tokens_per_page", "max_tokens", "search_type"] as const),
  optional: Object.freeze(["search_after_date_filter", "country", "search_language_filter"] as const)
});
export const PERPLEXITY_SEARCH_BOUNDS = Object.freeze({
  queryChars: Object.freeze([1, 500] as const),
  maxResults: Object.freeze([1, 10] as const),
  maxTokensPerPage: Object.freeze([1, 32_768] as const),
  maxTokens: Object.freeze([1, 327_680] as const),
  languageItems: 1
});
export const PERPLEXITY_REPLY_FIELDS = Object.freeze({
  topLevel: Object.freeze(["id", "results", "server_time"] as const),
  requiredTopLevel: Object.freeze(["id", "results"] as const),
  result: Object.freeze(["title", "url", "snippet", "date", "last_updated"] as const),
  requiredResult: Object.freeze(["title", "url", "snippet"] as const),
  maxResults: 10
});
/** Perplexity's own refusals that bill nothing (the gate turns them into its unbilled refusals). */
export const PERPLEXITY_UNBILLED_REFUSALS = Object.freeze({
  busy: Object.freeze([429] as const),
  notBusy: Object.freeze([400, 422] as const)
});

/** Owner (2026-10-30): 10 results per search at a debate's start, 5 per search in a dig. */
export type PerplexitySearchMode = "START" | "DIG";
export const PERPLEXITY_RESULTS_PER_SEARCH: Readonly<Record<PerplexitySearchMode, number>> = Object.freeze({ START: 10, DIG: 5 });
/**
 * The page cap in tokens: about 16,000 words a page (design §4: "at most about 21,000 tokens, a 16,000-word cap"). The
 * large-text test (plan W6-1, about 2 cents) measures Perplexity's real limit and may change it, inside the gate's bound.
 */
export const PERPLEXITY_PAGE_TOKEN_CAP = 21_000 as const;
/** The app's answer cap (the gateway's own MAX_PROVIDER_RESPONSE_BYTES): ten whole pages are about 1 MB. */
export const PERPLEXITY_REPLY_MAX_BYTES = 4 * 1024 * 1024;
/** How long one search may take. A fast search answers in about 0.8 s (sieve R/34); whole pages take longer (W6-1). */
export const PERPLEXITY_SEARCH_TIME_LIMIT_MS = 60_000 as const;
/** Owner (2026-10-30): the country and language fields only after the 2-cent local test. Off until then. */
export const PERPLEXITY_LOCAL_FILTERS_DEFAULT = false as const;
/** A page's text is never kept past this many characters per token of the page cap (it is then cut, PREVIEW_ONLY). */
const PAGE_TEXT_CHARS_PER_CAP_TOKEN = 8;
/** The web contract's limits (packages/contract/src/web.ts WEB_CONTRACT_LIMITS) for a link and a title. */
const LINK_MAX_CHARS = 2048;
const TITLE_MAX_CHARS = 500;
const DATE_MAX_CHARS = 64;

/** One search to send. `afterDate` is W1-2's ISO look-back date; language and country are the frozen search's. */
export type PerplexitySearchRequest = Readonly<{
  query: string;
  mode: PerplexitySearchMode;
  afterDate: string | null;
  language: string | null;
  country: string | null;
}>;
export type PerplexitySearchBody = Readonly<Record<string, unknown>>;
export type PerplexityBodyOptions = Readonly<{ localFilters?: boolean; maxTokensPerPage?: number }>;
export type PerplexityRequestRefusal = "REQUEST_INVALID" | "PERSONAL_DATA";

/** How much of a page was read: the contract's words (WEB_READ_DEPTHS). */
export type PerplexityReadDepth = "WHOLE" | "PREVIEW_ONLY" | "ABSTRACT_ONLY";
export type PerplexityPage = Readonly<{
  /** Perplexity's own order, from 1. */
  rank: number;
  url: string;
  title: string | null;
  date: string | null;
  lastUpdated: string | null;
  /** The page text as Perplexity gave it (cut only at the adapter's own limit). Data, never instructions. */
  text: string;
  textChars: number;
  readDepth: PerplexityReadDepth;
}>;
export type PerplexityDroppedPage = Readonly<{ rank: number; url: string; reason: string }>;
/** The W1-2 page rules (evidence host-filter `selectPathPages`, with the investigation's read set bound). */
export type PerplexityPageSelector = (pages: readonly PerplexityPage[]) => Readonly<{
  read: readonly PerplexityPage[];
  reuse: readonly PerplexityPage[];
  dropped: readonly Readonly<{ page: PerplexityPage; reason: string }>[];
}>;

/**
 * Why a search failed. None is charged to the person.
 * - NOT_CONFIGURED: the preview names no search gate socket. GATE_HALTED: the gate is halted or its window shut.
 *   GATE_UNREACHABLE: the gate's socket did not answer. GATE_UNSENT: the gate proved the search never reached Perplexity.
 * - BUSY: Perplexity or the gate is busy (a 429, a cool-off, every slot in flight). SPEND_LIMIT: the gate's pot is used.
 *   NOT_SERVED: the gate's GO does not serve this row or price (during an upload).
 * - TIMEOUT: past the time limit. CANCELED: the debate stopped it. STOPPED: the debate's lane closed before it started.
 * - REFUSED_BY_VENDOR: Perplexity refused the request (a 4xx). VENDOR_FAILED: Perplexity failed (a 5xx, or the gate
 *   booked a failed send). REPLY_INVALID / REPLY_TOO_LARGE: an answer this adapter does not read.
 * - REQUEST_INVALID: the guarded fetch refused the body. UNEXPECTED: anything else (a bug), still never a throw.
 */
export type PerplexitySearchFailure =
  | "NOT_CONFIGURED" | "GATE_HALTED" | "GATE_UNREACHABLE" | "GATE_UNSENT" | "BUSY" | "SPEND_LIMIT" | "NOT_SERVED"
  | "TIMEOUT" | "CANCELED" | "STOPPED" | "REFUSED_BY_VENDOR" | "VENDOR_FAILED" | "REPLY_INVALID" | "REPLY_TOO_LARGE"
  | "REQUEST_INVALID" | "UNEXPECTED";

type Answered<K extends "FOUND" | "EMPTY"> = Readonly<{
  outcome: K;
  chargeMicros: typeof PERPLEXITY_SEARCH_CHARGE_MICROS;
  /** How many results Perplexity returned, before any page was dropped. */
  resultCount: number;
  /** The pages to read. */
  pages: readonly PerplexityPage[];
  /** Pages already read in this investigation: reused, never read again. */
  reused: readonly PerplexityPage[];
  dropped: readonly PerplexityDroppedPage[];
}>;
export type PerplexitySearchOutcome =
  | Answered<"FOUND">
  | Answered<"EMPTY">
  | Readonly<{ outcome: "FAILED"; failure: PerplexitySearchFailure; chargeMicros: 0; resultCount: 0 }>
  | Readonly<{ outcome: "REFUSED"; refusal: PerplexityRequestRefusal; chargeMicros: 0; resultCount: 0 }>;

/** One search, answered as a value. It never throws and never rejects. */
export interface PerplexitySearchPort {
  search(request: PerplexitySearchRequest, signal?: AbortSignal): Promise<PerplexitySearchOutcome>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const isWholeIn = (value: unknown, [low, high]: readonly [number, number]): boolean =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= low && value <= high;
/** The JavaScript whitespace the gate strips (JS_WHITESPACE) is what String.prototype.trim strips. */
const hasWords = (value: string): boolean => value.trim().length > 0;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const SEARCH_DAY = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/([0-9]{4})$/u;
function realDay(year: number, month: number, day: number): boolean {
  if (year < 1900) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
/** W1-2's ISO look-back date as Perplexity's MM/DD/YYYY (evidence window.ts perplexityAfterDateFilter), or null. */
function searchAfterDate(afterDate: string): string | null {
  const parts = ISO_DAY.exec(afterDate);
  if (parts === null || !realDay(Number(parts[1]), Number(parts[2]), Number(parts[3]))) return null;
  return `${parts[2]}/${parts[3]}/${parts[1]}`;
}

/**
 * The request body for one search, exactly the gate's reviewed members in order, or why it is not sent. The words are
 * trimmed; a search with personal data in it is PERSONAL_DATA, and one outside the reviewed bounds REQUEST_INVALID.
 */
export function perplexitySearchBody(request: PerplexitySearchRequest, options: PerplexityBodyOptions = {}):
  Readonly<{ ok: true; body: PerplexitySearchBody }> | Readonly<{ ok: false; refusal: PerplexityRequestRefusal }> {
  const refuse = (refusal: PerplexityRequestRefusal) => Object.freeze({ ok: false as const, refusal });
  if (!isPlainObject(request) || typeof request.query !== "string") return refuse("REQUEST_INVALID");
  const query = request.query.trim();
  const [low, high] = PERPLEXITY_SEARCH_BOUNDS.queryChars;
  if (query.length < low || query.length > high) return refuse("REQUEST_INVALID");
  if (findPersonalData(query).length > 0) return refuse("PERSONAL_DATA");
  const maxResults = Object.hasOwn(PERPLEXITY_RESULTS_PER_SEARCH, request.mode) ? PERPLEXITY_RESULTS_PER_SEARCH[request.mode] : undefined;
  const perPage = options.maxTokensPerPage ?? PERPLEXITY_PAGE_TOKEN_CAP;
  if (maxResults === undefined || !isWholeIn(perPage, PERPLEXITY_SEARCH_BOUNDS.maxTokensPerPage)
    || !isWholeIn(maxResults * perPage, PERPLEXITY_SEARCH_BOUNDS.maxTokens)) return refuse("REQUEST_INVALID");
  const body: Record<string, unknown> = {
    query, max_results: maxResults, max_tokens_per_page: perPage, max_tokens: maxResults * perPage, search_type: PERPLEXITY_SEARCH_TYPE
  };
  if (request.afterDate !== null) {
    const filter = typeof request.afterDate === "string" ? searchAfterDate(request.afterDate) : null;
    if (filter === null) return refuse("REQUEST_INVALID");
    body.search_after_date_filter = filter;
  }
  if (options.localFilters ?? PERPLEXITY_LOCAL_FILTERS_DEFAULT) {
    // ISO 3166-1 alpha-2 and ISO 639-1 only (the gate's patterns); a tag's script or region is dropped ("sr-Latn": "sr").
    const country = typeof request.country === "string" ? request.country.toUpperCase() : "";
    const language = typeof request.language === "string" ? (request.language.split("-")[0] ?? "").toLowerCase() : "";
    if (/^[A-Z]{2}$/u.test(country)) body.country = country;
    if (/^[a-z]{2}$/u.test(language)) body.search_language_filter = [language];
  }
  return Object.freeze({ ok: true as const, body: Object.freeze(body) });
}

/**
 * Exactly the gate's body check (preview_budget_helper.py PerplexityProfile.body_valid): the guarded fetch sends only a
 * body this accepts, so the gate never meets a body it refuses.
 */
export function perplexitySearchBodyAccepted(body: unknown): boolean {
  if (!isPlainObject(body)) return false;
  const keys = Object.keys(body);
  const required: readonly string[] = PERPLEXITY_REQUEST_FIELDS.required;
  const optional: readonly string[] = PERPLEXITY_REQUEST_FIELDS.optional;
  if (!required.every((key) => keys.includes(key)) || !keys.every((key) => required.includes(key) || optional.includes(key))) return false;
  const query = body.query;
  const [low, high] = PERPLEXITY_SEARCH_BOUNDS.queryChars;
  if (typeof query !== "string" || query.length < low || query.length > high || !hasWords(query)) return false;
  if (!isWholeIn(body.max_results, PERPLEXITY_SEARCH_BOUNDS.maxResults)
    || !isWholeIn(body.max_tokens_per_page, PERPLEXITY_SEARCH_BOUNDS.maxTokensPerPage)
    || !isWholeIn(body.max_tokens, PERPLEXITY_SEARCH_BOUNDS.maxTokens) || body.search_type !== PERPLEXITY_SEARCH_TYPE) return false;
  if (Object.hasOwn(body, "search_after_date_filter")) {
    const parts = typeof body.search_after_date_filter === "string" ? SEARCH_DAY.exec(body.search_after_date_filter) : null;
    if (parts === null || !realDay(Number(parts[3]), Number(parts[1]), Number(parts[2]))) return false;
  }
  if (Object.hasOwn(body, "country") && !(typeof body.country === "string" && /^[A-Z]{2}$/u.test(body.country))) return false;
  if (Object.hasOwn(body, "search_language_filter")) {
    const languages = body.search_language_filter;
    if (!Array.isArray(languages) || languages.length !== PERPLEXITY_SEARCH_BOUNDS.languageItems
      || !languages.every((code) => typeof code === "string" && /^[a-z]{2}$/u.test(code))) return false;
  }
  return true;
}

type ReadResult = Readonly<{ title: string; url: string; snippet: string; date: string | null; last_updated: string | null }>;
/** The answer's results, read against the closed member list; undefined for anything else (or more than asked). */
function readSearchReply(value: unknown, askedFor: number): readonly ReadResult[] | undefined {
  if (!isPlainObject(value)) return undefined;
  const top: readonly string[] = PERPLEXITY_REPLY_FIELDS.topLevel;
  const keys = Object.keys(value);
  if (!keys.every((key) => top.includes(key)) || !PERPLEXITY_REPLY_FIELDS.requiredTopLevel.every((key) => keys.includes(key))) return undefined;
  if (typeof value.id !== "string" || !(value.server_time === undefined || value.server_time === null || typeof value.server_time === "string")) return undefined;
  const results = value.results;
  if (!Array.isArray(results) || results.length > Math.min(askedFor, PERPLEXITY_REPLY_FIELDS.maxResults)) return undefined;
  const members: readonly string[] = PERPLEXITY_REPLY_FIELDS.result;
  const read: ReadResult[] = [];
  for (const item of results) {
    if (!isPlainObject(item) || !Object.keys(item).every((key) => members.includes(key))) return undefined;
    if (!PERPLEXITY_REPLY_FIELDS.requiredResult.every((key) => typeof item[key] === "string")) return undefined;
    const dates = [item.date, item.last_updated];
    if (!dates.every((date) => date === undefined || date === null || typeof date === "string")) return undefined;
    read.push({ title: item.title as string, url: item.url as string, snippet: item.snippet as string,
      date: (item.date as string | null | undefined) ?? null, last_updated: (item.last_updated as string | null | undefined) ?? null });
  }
  return read;
}

/**
 * Abstract landing pages of scholarly sites: Perplexity's text of them is the abstract, not the paper (sieve R/36: "on
 * arXiv it returns the abstract page"). A code-owned list, by host and path.
 */
const ABSTRACT_PAGES: readonly Readonly<{ host: RegExp; path: RegExp; query?: RegExp }>[] = Object.freeze([
  { host: /^(?:export\.)?arxiv\.org$/u, path: /^\/abs\//u },
  { host: /^pubmed\.ncbi\.nlm\.nih\.gov$/u, path: /^\/\d+\/?$/u },
  { host: /^papers\.ssrn\.com$/u, path: /^\/sol3\/papers\.cfm$/u, query: /(?:^|&)abstract_id=\d+/u },
  { host: /^(?:www\.)?semanticscholar\.org$/u, path: /^\/paper\//u },
  { host: /^(?:www\.)?europepmc\.org$/u, path: /^\/abstract\//u }
]);
function isAbstractPage(url: string): boolean {
  let address: URL;
  try { address = new URL(url); } catch { return false; }
  const host = address.hostname.toLowerCase().replace(/^www\./u, "");
  return ABSTRACT_PAGES.some((rule) => (rule.host.test(host) || rule.host.test(`www.${host}`)) && rule.path.test(address.pathname)
    && (rule.query === undefined || rule.query.test(address.search.slice(1))));
}

/**
 * How much of a page was read. ABSTRACT_ONLY: an abstract landing page. PREVIEW_ONLY: the text reaches 80% of the page
 * cap at about four characters a token, so Perplexity probably cut it there (a conservative reading: a page this long is
 * shown as partial rather than whole; the large-text test, W6-1, may tune it). Otherwise WHOLE.
 */
export function perplexityReadDepth(url: string, text: string, maxTokensPerPage: number): PerplexityReadDepth {
  if (isAbstractPage(url)) return "ABSTRACT_ONLY";
  return text.length * 5 >= maxTokensPerPage * 16 ? "PREVIEW_ONLY" : "WHOLE";
}

function webLink(url: string): boolean {
  if (url.length > LINK_MAX_CHARS) return false;
  try {
    const address = new URL(url);
    return (address.protocol === "http:" || address.protocol === "https:") && address.hostname !== "";
  } catch {
    return false;
  }
}
const shortText = (value: string | null, max: number): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, max);
};

/** The answer's results as pages, with the pages no reader could use dropped (no web address, no text). */
function pagesOf(results: readonly ReadResult[], maxTokensPerPage: number): Readonly<{ pages: PerplexityPage[]; dropped: PerplexityDroppedPage[] }> {
  const pages: PerplexityPage[] = [];
  const dropped: PerplexityDroppedPage[] = [];
  const textLimit = maxTokensPerPage * PAGE_TEXT_CHARS_PER_CAP_TOKEN;
  results.forEach((item, index) => {
    const rank = index + 1;
    if (!webLink(item.url)) { dropped.push(Object.freeze({ rank, url: item.url, reason: "INVALID_ADDRESS" })); return; }
    if (!hasWords(item.snippet)) { dropped.push(Object.freeze({ rank, url: item.url, reason: "NO_TEXT" })); return; }
    const cut = item.snippet.length > textLimit;
    const text = cut ? item.snippet.slice(0, textLimit) : item.snippet;
    pages.push(Object.freeze({
      rank, url: item.url, title: shortText(item.title, TITLE_MAX_CHARS), date: shortText(item.date, DATE_MAX_CHARS),
      lastUpdated: shortText(item.last_updated, DATE_MAX_CHARS), text, textChars: text.length,
      readDepth: cut ? "PREVIEW_ONLY" : perplexityReadDepth(item.url, text, maxTokensPerPage)
    }));
  });
  return { pages, dropped };
}

const failed = (failure: PerplexitySearchFailure): PerplexitySearchOutcome =>
  Object.freeze({ outcome: "FAILED", failure, chargeMicros: 0, resultCount: 0 });

/** A failure the transport threw, as the search's failure word. */
export function perplexitySearchFailureOf(error: unknown): PerplexitySearchFailure {
  if (error instanceof PreviewGateUnavailable) return "GATE_HALTED";
  if (error instanceof PreviewModelNotServed) return "NOT_SERVED";
  if (error instanceof PreviewGateUnsent) return "GATE_UNSENT";
  if (error instanceof PreviewVendorRefusedUnbilled || error instanceof PreviewUnbilledRefusal) return "BUSY";
  if (error instanceof PreviewChargeBookedMax) return "VENDOR_FAILED";
  if (error instanceof TypedDomainError) {
    if (error.code === "DAILY_COST_ENVELOPE_REACHED" || error.code === "RUN_COST_ENVELOPE_MONEY_REACHED") return "SPEND_LIMIT";
    if (error.code === "PROVIDER_USAGE_UNREPORTED") return "GATE_UNREACHABLE";
    // The guarded fetch's refusal for a provider with no gate port (nothing reserved or sent).
    if (error.code === "PROVIDER_CALL_FAILED" && error.message.includes("not configured")) return "NOT_CONFIGURED";
  }
  if (error instanceof TypeError && error.message === "PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID") return "REQUEST_INVALID";
  return "UNEXPECTED";
}
function statusFailure(status: number): PerplexitySearchFailure {
  if ((PERPLEXITY_UNBILLED_REFUSALS.busy as readonly number[]).includes(status)) return "BUSY";
  return status >= 500 ? "VENDOR_FAILED" : "REFUSED_BY_VENDOR";
}

class ReplyTooLarge extends Error {}
/** The answer's text, read up to the byte cap (a larger answer is cancelled, never read whole). */
async function boundedText(response: Response, maxBytes: number): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) { await reader.cancel().catch(() => undefined); throw new ReplyTooLarge(); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The search port. `fetch` is the guarded fetch on the preview (and no authorization), the plain fetch on a hosted server
 * (with the custody file's `authorizationHeader`). `selectPages` is the W1-2 page rules with the investigation's read
 * set bound. `localFilters` turns on the country and language fields (after the local test); `maxTokensPerPage` and
 * `timeLimitMs` default to the page cap and the time limit above.
 */
export function createPerplexitySearchPort(input: Readonly<{
  fetch: typeof fetch;
  selectPages: PerplexityPageSelector;
  authorizationHeader?: string;
  localFilters?: boolean;
  maxTokensPerPage?: number;
  timeLimitMs?: number;
}>): PerplexitySearchPort {
  const authorization = input.authorizationHeader;
  if (authorization !== undefined && (typeof authorization !== "string" || !hasWords(authorization) || /[\r\n]/u.test(authorization))) {
    throw new TypeError("PERPLEXITY_SEARCH_AUTHORIZATION_INVALID");
  }
  const maxTokensPerPage = input.maxTokensPerPage ?? PERPLEXITY_PAGE_TOKEN_CAP;
  const timeLimitMs = input.timeLimitMs ?? PERPLEXITY_SEARCH_TIME_LIMIT_MS;
  const bodyOptions = { localFilters: input.localFilters ?? PERPLEXITY_LOCAL_FILTERS_DEFAULT, maxTokensPerPage };
  const headers = Object.freeze({ "content-type": "application/json", ...(authorization === undefined ? {} : { authorization }) });

  async function send(request: PerplexitySearchRequest, signal: AbortSignal | undefined): Promise<PerplexitySearchOutcome> {
    const built = perplexitySearchBody(request, bodyOptions);
    if (!built.ok) return Object.freeze({ outcome: "REFUSED", refusal: built.refusal, chargeMicros: 0, resultCount: 0 });
    if (signal?.aborted) return failed("CANCELED");
    const timer = new AbortController();
    const timeout = setTimeout(() => { timer.abort(); }, timeLimitMs);
    const combined = signal === undefined ? timer.signal : AbortSignal.any([signal, timer.signal]);
    const ended = (): PerplexitySearchFailure | undefined => timer.signal.aborted ? "TIMEOUT" : signal?.aborted ? "CANCELED" : undefined;
    try {
      let text: string;
      let status: number;
      try {
        const response = await input.fetch(PERPLEXITY_SEARCH_URL, { method: "POST", headers, body: JSON.stringify(built.body), signal: combined });
        status = response.status;
        if (status !== 200) { await response.body?.cancel().catch(() => undefined); return failed(statusFailure(status)); }
        text = await boundedText(response, PERPLEXITY_REPLY_MAX_BYTES);
      } catch (error) {
        if (error instanceof ReplyTooLarge) return failed("REPLY_TOO_LARGE");
        return failed(ended() ?? perplexitySearchFailureOf(error));
      }
      let value: unknown;
      try { value = JSON.parse(text); } catch { return failed("REPLY_INVALID"); }
      const results = readSearchReply(value, built.body.max_results as number);
      if (results === undefined) return failed("REPLY_INVALID");
      const { pages, dropped } = pagesOf(results, maxTokensPerPage);
      const selected = input.selectPages(pages);
      const allDropped = [...dropped, ...selected.dropped.map(({ page, reason }) => Object.freeze({ rank: page.rank, url: page.url, reason }))]
        .sort((left, right) => left.rank - right.rank);
      const outcome = selected.read.length + selected.reuse.length === 0 ? "EMPTY" as const : "FOUND" as const;
      return Object.freeze({ outcome, chargeMicros: PERPLEXITY_SEARCH_CHARGE_MICROS, resultCount: results.length,
        pages: Object.freeze([...selected.read]), reused: Object.freeze([...selected.reuse]), dropped: Object.freeze(allDropped) });
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({
    async search(request: PerplexitySearchRequest, signal?: AbortSignal): Promise<PerplexitySearchOutcome> {
      try {
        return await send(request, signal);
      } catch {
        return failed("UNEXPECTED");
      }
    }
  });
}
