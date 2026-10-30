/**
 * Web search (plan 2026-10-30, task W2-2) — THE WEB PART OF THE START-OF-DEBATE ESTIMATE.
 *
 * Plain words: before a paid debate with web search starts, its web part is priced at the most it can do, never at a
 * hopeful average (owner rule: the start estimate never under-counts, and a started debate always finishes). The
 * counts come from the receipt (`envelope_basis.web`, `webSitesOf`): every search the cap allows, every page those
 * searches can bring back read whole by reader 1, one pick per pack, readers 2 and 3 on the top pages, the planner,
 * and the pack read again inside the arguing. Each call is priced like a real one: its input at its row's input price
 * (a cached instruction part at the 5-minute cache-write price, the dearest way it can be billed), its output at the
 * full max_tokens it asks for. Searches are 0.1 cent each.
 *
 * Nothing here knows a model: the caller hands in each role's price (the dearest of the role's candidates), so the
 * same arithmetic serves the hosted room and the preview's gate check.
 */
import {
  WEB_HAIKU_PROMPT_TOKEN_LINE,
  type WebSites
} from "@debateai/register";
import { chargeMicrosForUsage, type ProviderTargetPrice } from "./cost-envelope.js";
import { WEB_SEARCH_REQUEST_MICROS } from "./web-charge.js";

/**
 * The tokens around the material of each web call and the max_tokens each web step asks for (thinking set low on
 * every web step, owner rule). Start values in one frozen place; a web step that asks for more must raise its figure
 * here first (the estimate test pins each one), or the estimate would under-count it.
 *  - instructionTokens: the instruction, the fence and the answer form of one call (the approved web wording is short:
 *    design §7.1 items 1-4; 4,000 tokens is room to spare). Priced as a 5-minute cache write.
 *  - readerOneOutputTokens / topReaderOutputTokens: grades, one line and verbatim extracts per page; 16,384, the
 *    preview's slow-story allowance.
 *  - pickInputTokensPerPage: a page's title, site, grade and one line as the pick reads them.
 *  - plannerInputTokensPerPack: a path, its points for and against and what they rest on (design §2: about 6,000).
 *  - packReadTokensPerPack: a path's pack read across its arguing calls (design §4.2: about 40,000 tokens).
 */
export const WEB_CALL_ALLOWANCES = Object.freeze({
  instructionTokens: 4_000,
  readerOneOutputTokens: 16_384,
  pickInputTokensPerPage: 200,
  pickOutputTokens: 4_096,
  topReaderOutputTokens: 16_384,
  plannerInputTokensPerPack: 6_000,
  plannerOutputTokens: 8_192,
  packReadTokensPerPack: 40_000
});

/** Each web role's price: the dearest of the models that may take it. */
export type WebRolePrices = Readonly<{
  /** Reader 1, reading every page whole (Claude Haiku). */
  readerOne: ProviderTargetPrice;
  /** The top-pages pick (Claude Haiku). */
  pick: ProviderTargetPrice;
  /** Readers 2 and 3 (two other companies: DeepSeek, GLM, Qwen as the other choice): the dearest of them. */
  topReaders: ProviderTargetPrice;
  /** The planner (open owner choice Q11: Haiku, DeepSeek or Qwen): the dearest of them. */
  planner: ProviderTargetPrice;
  /** The arguing calls that read the packs: the dearest debater's price. */
  pack: ProviderTargetPrice;
}>;

export type WebPartEstimate = Readonly<{
  searches: number;
  modelCalls: number;
  searchMicros: number;
  readerOneMicros: number;
  pickMicros: number;
  topReaderMicros: number;
  plannerMicros: number;
  packMicros: number;
  totalMicros: number;
}>;

/** The tokens of each web call, at the caps (the preview's gate check prices the same calls on each gate). */
export function webCallTokens(sites: WebSites): Readonly<{
  readerOne: Readonly<{ calls: number; inputTokens: number; outputTokens: number }>;
  pick: Readonly<{ calls: number; inputTokens: number; outputTokens: number }>;
  topReaders: Readonly<{ calls: number; inputTokens: number; outputTokens: number }>;
  planner: Readonly<{ calls: number; inputTokens: number; outputTokens: number }>;
  pack: Readonly<{ calls: number; inputTokens: number; outputTokens: number }>;
}> {
  const a = WEB_CALL_ALLOWANCES;
  const readerOneInput = Math.min(sites.readerBatchTokens, sites.pageTokensPerPack) + a.instructionTokens;
  // Every Haiku call stays under the 100,000-token price line (owner rule): a reader-1 batch that could pass it is a
  // counting defect, refused here before any estimate is made.
  if (readerOneInput > WEB_HAIKU_PROMPT_TOKEN_LINE) throw new TypeError("WEB_ESTIMATE_HAIKU_LINE_CROSSED");
  const pagesPerPack = sites.searchesPerPack * sites.resultsPerSearch;
  const pickInput = pagesPerPack * a.pickInputTokensPerPage + a.instructionTokens;
  if (pickInput > WEB_HAIKU_PROMPT_TOKEN_LINE) throw new TypeError("WEB_ESTIMATE_HAIKU_LINE_CROSSED");
  return Object.freeze({
    readerOne: Object.freeze({ calls: sites.readerOneCalls, inputTokens: readerOneInput, outputTokens: a.readerOneOutputTokens }),
    pick: Object.freeze({ calls: sites.pickCalls, inputTokens: pickInput, outputTokens: a.pickOutputTokens }),
    topReaders: Object.freeze({ calls: sites.topReaderCalls, inputTokens: sites.topCount * sites.pageTokenCap + a.instructionTokens,
      outputTokens: a.topReaderOutputTokens }),
    planner: Object.freeze({ calls: sites.plannerCalls, inputTokens: sites.packs * a.plannerInputTokensPerPack + a.instructionTokens,
      outputTokens: a.plannerOutputTokens }),
    // The pack's reading inside the arguing: input only (the arguing calls' own output is already in the debate's
    // estimate), one figure per pack.
    pack: Object.freeze({ calls: sites.packs, inputTokens: a.packReadTokensPerPack, outputTokens: 0 })
  });
}

/** One call's price: the instruction part as a 5-minute cache write (on a price that has one), the rest plain. */
function callMicros(price: ProviderTargetPrice, inputTokens: number, outputTokens: number, cachedInstruction: boolean): number {
  const write = cachedInstruction && price.vendorPrices !== undefined ? Math.min(WEB_CALL_ALLOWANCES.instructionTokens, inputTokens) : 0;
  return chargeMicrosForUsage(price, {
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    ...(write === 0 ? {} : { cacheWriteTokens: write, cacheWriteOneHourTokens: 0 })
  });
}

/** The web part at the caps, in USD micro-units, each part rounded up. */
export function estimateWebPartMicros(sites: WebSites, prices: WebRolePrices, searchMicros: number = WEB_SEARCH_REQUEST_MICROS): WebPartEstimate {
  if (!Number.isSafeInteger(searchMicros) || searchMicros < 1) throw new TypeError("WEB_ESTIMATE_SEARCH_PRICE_INVALID");
  const tokens = webCallTokens(sites);
  const part = (price: ProviderTargetPrice, call: Readonly<{ calls: number; inputTokens: number; outputTokens: number }>, cached: boolean) =>
    call.calls * callMicros(price, call.inputTokens, call.outputTokens, cached);
  const searchTotal = sites.searches * searchMicros;
  const readerOneMicros = part(prices.readerOne, tokens.readerOne, true);
  const pickMicros = part(prices.pick, tokens.pick, true);
  const topReaderMicros = part(prices.topReaders, tokens.topReaders, true);
  const plannerMicros = part(prices.planner, tokens.planner, true);
  const packMicros = part(prices.pack, tokens.pack, false);
  const totalMicros = searchTotal + readerOneMicros + pickMicros + topReaderMicros + plannerMicros + packMicros;
  if (!Number.isSafeInteger(totalMicros)) throw new TypeError("WEB_ESTIMATE_UNREPRESENTABLE");
  return Object.freeze({
    searches: sites.searches,
    modelCalls: tokens.readerOne.calls + tokens.pick.calls + tokens.topReaders.calls + tokens.planner.calls,
    searchMicros: searchTotal,
    readerOneMicros,
    pickMicros,
    topReaderMicros,
    plannerMicros,
    packMicros,
    totalMicros
  });
}
