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
  INVESTIGATION_REPORT_POLICY,
  PATH_REWRITE_POLICY,
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
 *  - digPlannerInputTokens: one chosen path's planner on a dig: what is chosen and what the whole debate already investigated
 *    (apps/runner investigation-digest.ts cuts it at 32,000 bytes, 2 bytes a token).
 *  - digSuggest*: the suggestions on a dig's own paths (W4-3): one small call per path, at the most paths a map has, and one for the
 *    parent path it rewrote (Q-D8), reading the same digest and that path's points, on a paid plan only.
 */
export const WEB_CALL_ALLOWANCES = Object.freeze({
  instructionTokens: 4_000,
  readerOneOutputTokens: 16_384,
  pickInputTokensPerPage: 200,
  pickOutputTokens: 4_096,
  topReaderOutputTokens: 16_384,
  plannerInputTokensPerPack: 6_000,
  plannerOutputTokens: 8_192,
  packReadTokensPerPack: 40_000,
  digPlannerInputTokens: 18_000,
  digSuggestPaths: 6,
  digSuggestInputTokens: 22_000,
  digSuggestOutputTokens: 1_024
});

/** Each web role's price: the dearest of the models that may take it. */
export type WebRolePrices = Readonly<{
  /** Reader 1, reading every page whole (Claude Haiku). */
  readerOne: ProviderTargetPrice;
  /** The top-pages pick (Claude Haiku). */
  pick: ProviderTargetPrice;
  /** Readers 2 and 3 (two other companies: DeepSeek, GLM, Qwen as the other choice): the dearest of them. */
  topReaders: ProviderTargetPrice;
  /**
   * The planner (owner, 30 Oct: Claude Haiku first, Qwen the backup, then GLM, DeepSeek): the dearest of them. The
   * preview prices Haiku, DeepSeek and Qwen; GLM costs less than DeepSeek on both counts, so it is covered.
   */
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
  /** A dig's own-path suggestions (W4-3), at their most; 0 for a first debate. */
  suggestMicros: number;
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
    // A debate's one planner reads every path; a dig's planners read one chosen path each and the investigation's digest.
    planner: Object.freeze({ calls: sites.plannerCalls,
      inputTokens: (sites.kind === "DIG" ? a.digPlannerInputTokens : sites.packs * a.plannerInputTokensPerPack) + a.instructionTokens,
      outputTokens: a.plannerOutputTokens }),
    // The pack's reading inside the arguing: input only (the arguing calls' own output is already in the debate's
    // estimate), one figure per pack.
    // A dig's legs read all its picks' packs together, at most three packs' worth (apps/runner web-packs.ts `WEB_DIG_SOURCES_BYTES`).
    pack: Object.freeze({ calls: sites.kind === "DIG" ? Math.min(sites.packs, 3) : sites.packs, inputTokens: a.packReadTokensPerPack, outputTokens: 0 })
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
  const a = WEB_CALL_ALLOWANCES;
  const suggestMicros = sites.kind !== "DIG" ? 0 : a.digSuggestPaths
    * callMicros(prices.readerOne, a.digSuggestInputTokens + a.instructionTokens, a.digSuggestOutputTokens, true);
  const totalMicros = searchTotal + readerOneMicros + pickMicros + topReaderMicros + plannerMicros + packMicros + suggestMicros;
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
    suggestMicros,
    totalMicros
  });
}

/**
 * The owner's ruling (31 Oct): the share shown before a dig assumes the rewrites that follow it. The tokens of those calls: a rewrite reads a
 * path and a debate's paths with their points, an answer update the tree, and each writes short texts (the answer at most 600 words).
 * Allowances, not caps: a typical call with room to spare, so the line can read a bit high; every round the plan allows is counted, so it
 * doesn't read low when a checker objects. `instructionTokens` come on top.
 */
export const DIG_UPDATE_CALL_ALLOWANCES = Object.freeze({
  rewriteInputTokens: 8_000,
  rewriteWriterOutputTokens: 2_048,
  answerInputTokens: 20_000,
  answerWriterOutputTokens: 2_048,
  checkerOutputTokens: 512
});

/**
 * What follows a dig, for its share only (nothing is held or walled on it): its own rewrite, a climb's rewrite of every path above it, as if each
 * level really changed (`level - 1` of them: a dig at level 1 rewrites the first debate's own path), and the main answer's update. A paid dig
 * also works out each climbed path's suggestions again (its own parent path's are in `digSuggestPaths`). Free counts the same but for its
 * one round and no suggestions (owner: Free's answer updates work the same as paid). The writer is Claude Haiku, the checker another
 * company's, so priced as reader 1 and readers 2 and 3.
 */
export function estimateDigUpdatesMicros(dig: Readonly<{ level: number; free: boolean }>, prices: Pick<WebRolePrices, "readerOne" | "topReaders">): number {
  if (!Number.isSafeInteger(dig.level) || dig.level < 1) throw new TypeError("DIG_UPDATES_LEVEL_INVALID");
  const a = DIG_UPDATE_CALL_ALLOWANCES;
  const round = (inputTokens: number, writerOutputTokens: number): number => callMicros(prices.readerOne, inputTokens + WEB_CALL_ALLOWANCES.instructionTokens, writerOutputTokens, true)
    + callMicros(prices.topReaders, inputTokens + writerOutputTokens + WEB_CALL_ALLOWANCES.instructionTokens, a.checkerOutputTokens, false);
  const climbs = dig.level - 1;
  const rewrites = (1 + climbs) * (dig.free ? PATH_REWRITE_POLICY.freeMaxRounds : PATH_REWRITE_POLICY.maxRounds) * round(a.rewriteInputTokens, a.rewriteWriterOutputTokens);
  const answer = (dig.free ? INVESTIGATION_REPORT_POLICY.freeMaxRounds : INVESTIGATION_REPORT_POLICY.maxRounds) * round(a.answerInputTokens, a.answerWriterOutputTokens);
  const suggestions = dig.free ? 0
    : climbs * callMicros(prices.readerOne, WEB_CALL_ALLOWANCES.digSuggestInputTokens + WEB_CALL_ALLOWANCES.instructionTokens, WEB_CALL_ALLOWANCES.digSuggestOutputTokens, true);
  const total = rewrites + answer + suggestions;
  if (!Number.isSafeInteger(total)) throw new TypeError("WEB_ESTIMATE_UNREPRESENTABLE");
  return total;
}
