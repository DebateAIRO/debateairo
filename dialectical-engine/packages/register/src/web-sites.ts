import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";

/**
 * Web search (plan 2026-10-30, task W2-2): THE WEB PART OF ONE DEBATE, counted at admission and frozen on its receipt
 * (`envelope_basis.web`), so the attempt ceiling, the money estimate and the running wall all know it before the debate
 * starts. Pure numbers: no row is read here, and nothing is sent anywhere.
 *
 * Plain words: before a paid debate with web search starts, the code counts the most it can do on the web: how many
 * searches, how many pages they can bring back, how many reading calls the first reader (Haiku) needs to read every
 * page whole in batches of at most 80,000 tokens, one call to pick the top pages, and the two other readers reading the
 * top pages whole. The estimate prices exactly these counts, so it never counts less than the debate can spend.
 *
 * Where each start number comes from (owner answers, docs/research/2026-10-28-v4-initial/OWNER-ANSWERS-2026-10-29.md):
 *  - 4 searches per web path on a Quick look (2 English, for and against; 2 in the question's language and country,
 *    for and against, when the planner says local information helps), so up to 20 at 5 paths; Thorough doubles the cap
 *    (8 per path) ("Search cap vs 4 per path", "Thorough", Q10);
 *  - 10 results per search at a debate's start, 5 for a dig, one search per chosen dig suggestion (plan W2-1, Q9);
 *  - reader 1 reads every page whole, in batches of at most 80,000 tokens, every Haiku call under 100,000 (plan W2-4);
 *  - the top 3 pages per path (Thorough: 5) are read whole by readers 2 and 3 ("Thorough's top 5 vs the approved 3");
 *  - one planner call per debate or dig (plan W2-3, W4-2).
 * The page sizes are the search request's own caps (`max_tokens_per_page`, `max_tokens`, task W2-1), so a search can
 * never bring back more text than is counted here: WEB_SEARCH_PAGE_TOKEN_CAP and WEB_SEARCH_REQUEST_TOKEN_CAP must be
 * exactly what the adapter sends (W2-1 reads them from here). The thinking of every web step is set low (owner rule);
 * the output allowances below are the max_tokens each web step asks for.
 */

/** Plan §1.6: a whole page is at most about 16,000 words, about 21,000 tokens; the adapter's `max_tokens_per_page`. */
export const WEB_SEARCH_PAGE_TOKEN_CAP = 21_000 as const;
/**
 * The adapter's `max_tokens` for one search: the most page text one search can bring back in all (W1-1's bound allows
 * up to 327,680). 100,000 is the measured size of one 10-result search (design §4.2: about 16 whole pages, about
 * 160,000 tokens, from 2 searches). An owner value: a larger cap reads more and raises every web estimate.
 */
export const WEB_SEARCH_REQUEST_TOKEN_CAP = 100_000 as const;
/** Plan W2-4: one reader-1 batch holds at most this many tokens of pages (every Haiku call stays under 100,000). */
export const WEB_READER_BATCH_TOKENS = 80_000 as const;
/** Haiku's lower price line (pricing page, "for prompts up to 100,000 tokens"): no web Haiku call may pass it. */
export const WEB_HAIKU_PROMPT_TOKEN_LINE = 100_000 as const;

/** The owner's start values, in one frozen place so the counting and its tests cannot drift. */
export const WEB_SITES_START = Object.freeze({
  searchesPerPath: Object.freeze({ QUICK: 4, THOROUGH: 8 }),
  resultsPerSearch: Object.freeze({ START: 10, DIG: 5 }),
  topCount: Object.freeze({ QUICK: 3, THOROUGH: 5 }),
  /** Readers 2 and 3: two AIs from two other companies. */
  topReaders: 2,
  /** One planner call per debate (or per dig). */
  plannerCalls: 1,
  /** One pick call per pack (per path at the start, per dig). */
  pickCallsPerPack: 1
});

/** The largest debate the receipt accepts (five paths today; ten gives room) and the most searches a dig may ask. */
export const WEB_SITES_LIMITS = Object.freeze({ webPathsMax: 10, digSearchesMax: 10 });

export type WebDepth = "QUICK" | "THOROUGH";
export type WebKind = "START" | "DIG";

/** What admission knows about the web part: a debate's start (one pack per path) or a dig (one shared pack). */
export type WebSiteInput = Readonly<{
  kind: WebKind;
  depth: WebDepth;
  /** START: the paths the debate weighs, every one of which may search (the planner may plan fewer, never more). */
  paths?: number;
  /** DIG: one search per chosen dig suggestion (owner Q9). */
  digSearches?: number;
}>;

/** The web part's counts, camelCase (the estimate and the runner read these). */
export type WebSites = Readonly<{
  kind: WebKind;
  depth: WebDepth;
  /** Packs: one per path at a debate's start, one for a dig. */
  packs: number;
  searchesPerPack: number;
  searches: number;
  resultsPerSearch: number;
  pageTokenCap: number;
  searchTokenCap: number;
  readerBatchTokens: number;
  /** The most page text one pack can hold: its searches x min(their token cap, results x the page cap). */
  pageTokensPerPack: number;
  /** Reader 1's calls per pack: enough batches for every page, read whole. */
  readerOneCallsPerPack: number;
  topCount: number;
  plannerCalls: number;
  readerOneCalls: number;
  pickCalls: number;
  /** Readers 2 and 3, each reading the pack's top pages whole: one call each per pack. */
  topReaderCalls: number;
}>;

const invalid = (message: string): never => {
  throw new TypedDomainError("WEB_SITES_INVALID", message);
};
const whole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;

/**
 * Reader 1's calls for `tokens` of pages, each page at most `pageCap`, in batches of at most `batch`: pages go into a
 * batch in turn and a page that does not fit starts the next one, so every closed batch holds more than
 * `batch - pageCap` tokens, and ceil(tokens / (batch - pageCap)) batches always suffice (never fewer than one).
 * W2-4 must pack this way (or tighter) for the count to hold.
 */
export function webReaderOneCalls(tokens: number, pageCap: number, batch: number): number {
  if (!whole(tokens, 0, Number.MAX_SAFE_INTEGER) || !whole(pageCap, 1, Number.MAX_SAFE_INTEGER)
    || !whole(batch, pageCap + 1, Number.MAX_SAFE_INTEGER)) {
    return invalid("Reader 1's batches need whole token counts and a page cap below the batch size");
  }
  if (tokens <= batch) return 1;
  return Math.ceil(tokens / (batch - pageCap));
}

/** The web part's counts for one debate start or one dig, at the owner's start values. */
export function webSitesOf(input: WebSiteInput): WebSites {
  if (input?.depth !== "QUICK" && input?.depth !== "THOROUGH") return invalid("The web depth is QUICK or THOROUGH");
  const start = WEB_SITES_START;
  let packs: number;
  let searchesPerPack: number;
  let resultsPerSearch: number;
  if (input.kind === "START") {
    if (!whole(input.paths, 1, WEB_SITES_LIMITS.webPathsMax) || input.digSearches !== undefined) {
      return invalid("A debate's web part needs its paths (1 to 10) and no dig searches");
    }
    packs = input.paths;
    searchesPerPack = start.searchesPerPath[input.depth];
    resultsPerSearch = start.resultsPerSearch.START;
  } else if (input.kind === "DIG") {
    if (!whole(input.digSearches, 1, WEB_SITES_LIMITS.digSearchesMax) || input.paths !== undefined) {
      return invalid("A dig's web part needs its searches (1 to 10, one per chosen suggestion) and no paths");
    }
    packs = 1;
    searchesPerPack = input.digSearches;
    resultsPerSearch = start.resultsPerSearch.DIG;
  } else {
    return invalid("The web part is a debate's START or a DIG");
  }
  const perSearch = Math.min(WEB_SEARCH_REQUEST_TOKEN_CAP, resultsPerSearch * WEB_SEARCH_PAGE_TOKEN_CAP);
  const pageTokensPerPack = searchesPerPack * perSearch;
  const readerOneCallsPerPack = webReaderOneCalls(pageTokensPerPack, WEB_SEARCH_PAGE_TOKEN_CAP, WEB_READER_BATCH_TOKENS);
  return Object.freeze({
    kind: input.kind,
    depth: input.depth,
    packs,
    searchesPerPack,
    searches: packs * searchesPerPack,
    resultsPerSearch,
    pageTokenCap: WEB_SEARCH_PAGE_TOKEN_CAP,
    searchTokenCap: WEB_SEARCH_REQUEST_TOKEN_CAP,
    readerBatchTokens: WEB_READER_BATCH_TOKENS,
    pageTokensPerPack,
    readerOneCallsPerPack,
    topCount: start.topCount[input.depth],
    plannerCalls: start.plannerCalls,
    readerOneCalls: packs * readerOneCallsPerPack,
    pickCalls: packs * start.pickCallsPerPack,
    topReaderCalls: packs * start.topReaders
  });
}

/** The web part's model calls (searches are not model calls: they pass no gateway attempt). */
export function webModelCalls(sites: WebSites): number {
  return sites.plannerCalls + sites.readerOneCalls + sites.pickCalls + sites.topReaderCalls;
}

const count = (min: number, max: number) => z.number().int().min(min).max(max);

/**
 * The receipt member `envelope_basis.web`, version 1, strict, with every count tied to the others by the same rule that
 * minted it (`webSitesOf`), so a receipt can never bill a web part its own numbers do not support.
 * `added_model_attempts` is the web calls at the per-site attempts the caller passes (a panel member's allowance).
 */
export const webReceiptSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["START", "DIG"]),
  depth: z.enum(["QUICK", "THOROUGH"]),
  packs: count(1, WEB_SITES_LIMITS.webPathsMax),
  searches_per_pack: count(1, 64),
  searches: count(1, 640),
  results_per_search: count(1, 10),
  page_token_cap: count(1, 1_048_576),
  search_token_cap: count(1, 1_048_576),
  reader_batch_tokens: count(1, WEB_HAIKU_PROMPT_TOKEN_LINE),
  top_count: count(1, 10),
  sites: z.object({
    planner: count(0, 1),
    reader_one: count(1, 10_000),
    pick: count(1, 64),
    top_readers: count(1, 64),
    added_model_attempts: z.number().int().min(0)
  }).strict()
}).strict().superRefine((receipt, ctx) => {
  let expected: WebSites | null = null;
  try {
    expected = webSitesOf(receipt.kind === "START"
      ? { kind: "START", depth: receipt.depth, paths: receipt.packs }
      : { kind: "DIG", depth: receipt.depth, digSearches: receipt.searches });
  } catch (error) {
    ctx.addIssue({ code: "custom", path: ["packs"], message: `the web part cannot be counted (${error instanceof Error ? error.message : String(error)})` });
  }
  if (expected === null) return;
  const disclosed = {
    packs: receipt.packs, searches_per_pack: receipt.searches_per_pack, searches: receipt.searches,
    results_per_search: receipt.results_per_search, page_token_cap: receipt.page_token_cap,
    search_token_cap: receipt.search_token_cap, reader_batch_tokens: receipt.reader_batch_tokens, top_count: receipt.top_count,
    planner: receipt.sites.planner, reader_one: receipt.sites.reader_one, pick: receipt.sites.pick, top_readers: receipt.sites.top_readers
  };
  const minted = {
    packs: expected.packs, searches_per_pack: expected.searchesPerPack, searches: expected.searches,
    results_per_search: expected.resultsPerSearch, page_token_cap: expected.pageTokenCap,
    search_token_cap: expected.searchTokenCap, reader_batch_tokens: expected.readerBatchTokens, top_count: expected.topCount,
    planner: expected.plannerCalls, reader_one: expected.readerOneCalls, pick: expected.pickCalls, top_readers: expected.topReaderCalls
  };
  for (const key of Object.keys(minted) as (keyof typeof minted)[]) {
    if (disclosed[key] !== minted[key]) {
      ctx.addIssue({ code: "custom", path: [key], message: `web ${key} ${disclosed[key]} disagrees with the counting rule's ${minted[key]}` });
    }
  }
});
export type WebReceipt = z.infer<typeof webReceiptSchema>;

/** The member, parsed with its own schema before it is handed back: a receipt the parser would refuse is never minted. */
export function webReceipt(sites: WebSites, perSiteAttempts: number): WebReceipt {
  if (!whole(perSiteAttempts, 1, 1_000)) return invalid(`The web calls need a whole number of attempts per site, not ${String(perSiteAttempts)}`);
  const receipt: WebReceipt = Object.freeze({
    version: 1 as const,
    kind: sites.kind,
    depth: sites.depth,
    packs: sites.packs,
    searches_per_pack: sites.searchesPerPack,
    searches: sites.searches,
    results_per_search: sites.resultsPerSearch,
    page_token_cap: sites.pageTokenCap,
    search_token_cap: sites.searchTokenCap,
    reader_batch_tokens: sites.readerBatchTokens,
    top_count: sites.topCount,
    sites: Object.freeze({
      planner: sites.plannerCalls,
      reader_one: sites.readerOneCalls,
      pick: sites.pickCalls,
      top_readers: sites.topReaderCalls,
      added_model_attempts: webModelCalls(sites) * perSiteAttempts
    })
  });
  const parsed = webReceiptSchema.safeParse(receipt);
  if (!parsed.success) {
    return invalid("The web receipt does not parse: " + parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }
  return receipt;
}

/** The web part a run was admitted with, read back from its receipt (the runner and the estimate never recount it). */
export function webSitesOfReceipt(receipt: WebReceipt): WebSites {
  return receipt.kind === "START"
    ? webSitesOf({ kind: "START", depth: receipt.depth, paths: receipt.packs })
    : webSitesOf({ kind: "DIG", depth: receipt.depth, digSearches: receipt.searches });
}
