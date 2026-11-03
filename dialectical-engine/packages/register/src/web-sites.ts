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
 *  - 10 results per search at a debate's start, 5 for a dig (plan W2-1, Q9);
 *  - a dig (R22 decision 9 and the owner's 31 Oct answer): each chosen path is a pack of its own, as a first debate's path is: its
 *    own planner call, up to 4 searches within the debate's cap (Quick look 20, Thorough 40), its own reader-1 batches, its
 *    own pick, its own readers 2 and 3 on its top pages;
 *  - reader 1 reads every page whole, in batches of at most 80,000 tokens, every Haiku call under 100,000 (plan W2-4);
 *  - the top 3 pages per path (Thorough: 5) are read whole by readers 2 and 3 ("Thorough's top 5 vs the approved 3");
 *  - one planner call per debate (plan W2-3), one per chosen path of a dig (decision 9).
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
  /** One planner call per debate; a dig has one per chosen path (`digSearchesPerPick` beside it). */
  plannerCalls: 1,
  /** A dig's chosen path: up to 4 searches (R22 decision 9), under the debate's cap below. */
  digSearchesPerPick: 4,
  digSearchCap: Object.freeze({ QUICK: 20, THOROUGH: 40 }),
  /** One pick call per pack (per path at the start, per dig). */
  pickCallsPerPack: 1
});

/**
 * The largest debate the receipt accepts (five paths today; ten gives room) and the most paths one dig may choose (the contract's).
 * V4 start step, Task 8: a path debate has at most 8 paths (b1..b8), every one of which may search.
 */
export const WEB_SITES_LIMITS = Object.freeze({ webPathsMax: 10, digPicksMax: 16, pathsKindMax: 8 });

export type WebDepth = "QUICK" | "THOROUGH";
/**
 * START and DIG: a v1 receipt (R22). PATHS (V4 start step, Task 8): a v2 receipt, a path debate whose every chosen path
 * is a pack of its own, at a debate's start or for a dig (`origin`).
 */
export type WebKind = "START" | "DIG" | "PATHS";
export type WebOrigin = "START" | "DIG";
/** The most paths of a path debate (WEB_SITES_LIMITS.pathsKindMax), by the name the path debate's callers use. */
export const WEB_PATHS_KIND_MAX = WEB_SITES_LIMITS.pathsKindMax;

/** What admission knows about the web part: a debate's start or a dig, one pack per path or per chosen path. */
export type WebSiteInput = Readonly<{
  kind: WebKind;
  depth: WebDepth;
  /** START: the paths the debate weighs, every one of which may search (the planner may plan fewer, never more). PATHS: its chosen paths (1 to 8). */
  paths?: number;
  /** DIG: the paths the person chose (R22 decision 9): each has its own planner and up to 4 searches. */
  digPicks?: number;
  /** PATHS only: a debate's start (10 results per search) or a dig (5). */
  origin?: WebOrigin;
}>;

/** The web part's counts, camelCase (the estimate and the runner read these). */
export type WebSites = Readonly<{
  kind: WebKind;
  depth: WebDepth;
  /** Packs: one per path at a debate's start, one per chosen path of a dig. */
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
  /** PATHS only (V4 start step, Task 8): a debate's start or a dig. */
  origin?: WebOrigin;
  /** PATHS only: the packs every path's arguing call reads (every chosen path's pages, labelled; owner 31 Oct) = packs. */
  packReadsPerCall?: number;
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

/**
 * V4 start step, Task 8 (owner 30 Oct: every web path gets all its searches): a path debate's search cap, its paths
 * x 4 on a Quick look, x 8 on a Thorough one, for 1 to 8 paths.
 */
export function webSearchCapForPaths(paths: number, depth: WebDepth): number {
  if (!whole(paths, 1, WEB_PATHS_KIND_MAX)) return invalid(`A path debate has 1 to ${WEB_PATHS_KIND_MAX} paths, not ${String(paths)}`);
  if (depth !== "QUICK" && depth !== "THOROUGH") return invalid("The web depth is QUICK or THOROUGH");
  return paths * WEB_SITES_START.searchesPerPath[depth];
}

/** The web part's counts for one debate start, one dig, or one path debate's paths, at the owner's start values. */
export function webSitesOf(input: WebSiteInput): WebSites {
  if (input?.depth !== "QUICK" && input?.depth !== "THOROUGH") return invalid("The web depth is QUICK or THOROUGH");
  const start = WEB_SITES_START;
  let packs: number;
  let searchesPerPack: number;
  let resultsPerSearch: number;
  let plannerCalls: number = start.plannerCalls;
  if (input.kind !== "PATHS" && input.origin !== undefined) return invalid("Only a path debate's web part has an origin");
  if (input.kind === "PATHS") {
    // V4 start step, Task 8: every chosen path is a pack, counted as a debate's start counts one path, with its own planner.
    if (input.origin !== "START" && input.origin !== "DIG") return invalid("A path debate's web part names its origin, START or DIG");
    if (!whole(input.paths, 1, WEB_PATHS_KIND_MAX) || input.digPicks !== undefined) {
      return invalid(`A path debate's web part needs its paths (1 to ${WEB_PATHS_KIND_MAX}) and no dig picks`);
    }
    packs = input.paths;
    searchesPerPack = start.searchesPerPath[input.depth];
    resultsPerSearch = start.resultsPerSearch[input.origin];
    plannerCalls = input.paths;
  } else if (input.kind === "START") {
    if (!whole(input.paths, 1, WEB_SITES_LIMITS.webPathsMax) || input.digPicks !== undefined) {
      return invalid("A debate's web part needs its paths (1 to 10) and no dig picks");
    }
    packs = input.paths;
    searchesPerPack = start.searchesPerPath[input.depth];
    resultsPerSearch = start.resultsPerSearch.START;
  } else if (input.kind === "DIG") {
    if (!whole(input.digPicks, 1, WEB_SITES_LIMITS.digPicksMax) || input.paths !== undefined) {
      return invalid("A dig's web part needs its chosen paths (1 to 16) and no debate paths");
    }
    packs = input.digPicks;
    // The cap is shared out by whole pairs: a dig of many picks may send fewer than 4 for each.
    const fairShare = Math.ceil(start.digSearchCap[input.depth] / input.digPicks / 2) * 2;
    searchesPerPack = Math.min(start.digSearchesPerPick, fairShare);
    resultsPerSearch = start.resultsPerSearch.DIG;
    plannerCalls = input.digPicks;
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
    searches: input.kind === "DIG" ? Math.min(packs * searchesPerPack, start.digSearchCap[input.depth])
      : input.kind === "PATHS" ? webSearchCapForPaths(packs, input.depth) : packs * searchesPerPack,
    resultsPerSearch,
    pageTokenCap: WEB_SEARCH_PAGE_TOKEN_CAP,
    searchTokenCap: WEB_SEARCH_REQUEST_TOKEN_CAP,
    readerBatchTokens: WEB_READER_BATCH_TOKENS,
    pageTokensPerPack,
    readerOneCallsPerPack,
    topCount: start.topCount[input.depth],
    plannerCalls,
    readerOneCalls: packs * readerOneCallsPerPack,
    pickCalls: packs * start.pickCallsPerPack,
    topReaderCalls: packs * start.topReaders,
    ...(input.kind === "PATHS" ? { origin: input.origin!, packReadsPerCall: packs } : {})
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
  packs: count(1, WEB_SITES_LIMITS.digPicksMax),
  searches_per_pack: count(1, 64),
  searches: count(1, 640),
  results_per_search: count(1, 10),
  page_token_cap: count(1, 1_048_576),
  search_token_cap: count(1, 1_048_576),
  reader_batch_tokens: count(1, WEB_HAIKU_PROMPT_TOKEN_LINE),
  top_count: count(1, 10),
  sites: z.object({
    planner: count(0, WEB_SITES_LIMITS.digPicksMax),
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
      : { kind: "DIG", depth: receipt.depth, digPicks: receipt.sites.planner });
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

/**
 * V4 start step, Task 8: the receipt member `envelope_basis.web`, version 2, kind PATHS: a path debate's web part, every
 * count tied to the others by `webSitesOf` exactly as version 1 is, plus its origin and the packs every path's arguing
 * reads. Version 1 (above) is untouched, so an R22 runner's strict v1 parse refuses a v2 receipt.
 */
export const webReceiptV2Schema = z.object({
  version: z.literal(2),
  kind: z.literal("PATHS"),
  origin: z.enum(["START", "DIG"]),
  depth: z.enum(["QUICK", "THOROUGH"]),
  packs: count(1, WEB_PATHS_KIND_MAX),
  searches_per_pack: count(1, 64),
  searches: count(1, 640),
  results_per_search: count(1, 10),
  page_token_cap: count(1, 1_048_576),
  search_token_cap: count(1, 1_048_576),
  reader_batch_tokens: count(1, WEB_HAIKU_PROMPT_TOKEN_LINE),
  top_count: count(1, 10),
  pack_reads_per_call: count(1, WEB_PATHS_KIND_MAX),
  sites: z.object({
    planner: count(1, WEB_PATHS_KIND_MAX),
    reader_one: count(1, 10_000),
    pick: count(1, 64),
    top_readers: count(1, 64),
    added_model_attempts: z.number().int().min(0)
  }).strict()
}).strict().superRefine((receipt, ctx) => {
  let expected: WebSites | null = null;
  try {
    expected = webSitesOf({ kind: "PATHS", depth: receipt.depth, paths: receipt.packs, origin: receipt.origin });
  } catch (error) {
    ctx.addIssue({ code: "custom", path: ["packs"], message: `the web part cannot be counted (${error instanceof Error ? error.message : String(error)})` });
  }
  if (expected === null) return;
  const disclosed = {
    searches_per_pack: receipt.searches_per_pack, searches: receipt.searches, results_per_search: receipt.results_per_search,
    page_token_cap: receipt.page_token_cap, search_token_cap: receipt.search_token_cap, reader_batch_tokens: receipt.reader_batch_tokens,
    top_count: receipt.top_count, pack_reads_per_call: receipt.pack_reads_per_call, planner: receipt.sites.planner,
    reader_one: receipt.sites.reader_one, pick: receipt.sites.pick, top_readers: receipt.sites.top_readers
  };
  const minted = {
    searches_per_pack: expected.searchesPerPack, searches: expected.searches, results_per_search: expected.resultsPerSearch,
    page_token_cap: expected.pageTokenCap, search_token_cap: expected.searchTokenCap, reader_batch_tokens: expected.readerBatchTokens,
    top_count: expected.topCount, pack_reads_per_call: expected.packReadsPerCall, planner: expected.plannerCalls,
    reader_one: expected.readerOneCalls, pick: expected.pickCalls, top_readers: expected.topReaderCalls
  };
  for (const key of Object.keys(minted) as (keyof typeof minted)[]) {
    if (disclosed[key] !== minted[key]) {
      ctx.addIssue({ code: "custom", path: [key], message: `web ${key} ${disclosed[key]} disagrees with the counting rule's ${minted[key]}` });
    }
  }
});
export type WebReceiptV2 = z.infer<typeof webReceiptV2Schema>;
/** Either version, by its own strict schema. */
export const webReceiptAnySchema = z.discriminatedUnion("version", [webReceiptSchema, webReceiptV2Schema]);

/**
 * The member, parsed with its own schema before it is handed back: a receipt the parser would refuse is never minted.
 * START and DIG mint version 1, byte for byte as before; PATHS mints version 2.
 */
export function webReceipt(sites: WebSites, perSiteAttempts: number): WebReceipt | WebReceiptV2 {
  if (!whole(perSiteAttempts, 1, 1_000)) return invalid(`The web calls need a whole number of attempts per site, not ${String(perSiteAttempts)}`);
  if (sites.kind === "PATHS") return webReceiptV2(sites, perSiteAttempts);
  const receipt: WebReceipt = Object.freeze({
    version: 1 as const,
    kind: sites.kind as "START" | "DIG",
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

/** V4 start step, Task 8: a path debate's version 2 member, parsed with its own schema before it is handed back. */
function webReceiptV2(sites: WebSites, perSiteAttempts: number): WebReceiptV2 {
  if (sites.origin === undefined || sites.packReadsPerCall === undefined) return invalid("A path debate's web part names its origin and its pack reads");
  const receipt: WebReceiptV2 = Object.freeze({
    version: 2 as const,
    kind: "PATHS" as const,
    origin: sites.origin,
    depth: sites.depth,
    packs: sites.packs,
    searches_per_pack: sites.searchesPerPack,
    searches: sites.searches,
    results_per_search: sites.resultsPerSearch,
    page_token_cap: sites.pageTokenCap,
    search_token_cap: sites.searchTokenCap,
    reader_batch_tokens: sites.readerBatchTokens,
    top_count: sites.topCount,
    pack_reads_per_call: sites.packReadsPerCall,
    sites: Object.freeze({
      planner: sites.plannerCalls,
      reader_one: sites.readerOneCalls,
      pick: sites.pickCalls,
      top_readers: sites.topReaderCalls,
      added_model_attempts: webModelCalls(sites) * perSiteAttempts
    })
  });
  const parsed = webReceiptV2Schema.safeParse(receipt);
  if (!parsed.success) {
    return invalid("The web receipt does not parse: " + parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }
  return receipt;
}

/** The web part a run was admitted with, read back from its receipt (the runner and the estimate never recount it). */
export function webSitesOfReceipt(receipt: WebReceipt | WebReceiptV2): WebSites {
  if (receipt.version === 2) return webSitesOf({ kind: "PATHS", depth: receipt.depth, paths: receipt.packs, origin: receipt.origin });
  return receipt.kind === "START"
    ? webSitesOf({ kind: "START", depth: receipt.depth, paths: receipt.packs })
    : webSitesOf({ kind: "DIG", depth: receipt.depth, digPicks: receipt.sites.planner });
}
