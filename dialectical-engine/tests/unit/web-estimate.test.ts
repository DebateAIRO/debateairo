import { describe, expect, it } from "vitest";
import {
  RecentRunsCostEstimator,
  WEB_CALL_ALLOWANCES,
  estimateWebPartMicros,
  parseCostEnvelopeBasis,
  settingsClassKey,
  webCallTokens,
  type ProviderTargetPrice,
  type RunSettingsClass,
  type WebRolePrices
} from "@debateai/budget";
import { previewModelRow, previewVendorPrices } from "@debateai/providers";
import {
  WEB_HAIKU_PROMPT_TOKEN_LINE,
  WEB_READER_BATCH_TOKENS,
  WEB_SEARCH_PAGE_TOKEN_CAP,
  WEB_SEARCH_REQUEST_TOKEN_CAP,
  computeStructuralCeilingBasis,
  webModelCalls,
  webReaderOneCalls,
  webReceipt,
  webSitesOf
} from "@debateai/register";
import {
  estimatePreviewGateNeeds,
  estimateUnfinishedRunHolds,
  previewWebGateShares,
  previewWebRolePrices,
  previewWebSearchNeed
} from "../../apps/api/src/preview-budget-estimate.js";

/**
 * Web search (plan 2026-10-30, task W2-2) — THE WEB PART OF THE START ESTIMATE, AT THE CAPS.
 *
 * Owner points: 4 searches per web path on a Quick look (up to 20 at 5 paths), Thorough twice that and its top 5;
 * reader 1 reads every page whole, readers 2 and 3 the top pages; Haiku $0.10 in / $0.50 out under 100,000 tokens;
 * thinking low on the web steps; the start estimate never under-counts, and a started debate always finishes.
 * So the web part is priced at the most it can do: every search the cap allows, every page those searches can bring
 * back (the request's own token caps), read in as many batches as the worst page sizes need.
 *
 * R22 prices (packages/providers/src/preview-models.ts): Haiku 0.10 / 0.50 (5-minute write 0.125); DeepSeek 0.20 / 0.60;
 * GLM 0.15 / 0.50; Qwen 0.113 / 0.382. The design's "5 paths about 50 cents, 3 about 33" were TYPICAL whole debates
 * with 2 searches a path; at the owner's caps (4 a path) the web part alone is 90.5 cents at 5 paths, 54.5 at 3.
 */

const price = (input: number, output: number): ProviderTargetPrice => Object.freeze({ inputMicrosPerMillionTokens: input, outputMicrosPerMillionTokens: output });
const HAIKU_ROW = previewModelRow("claude-haiku-5-5")!;
const HAIKU = Object.freeze({ ...price(100_000, 500_000), vendorPrices: previewVendorPrices(HAIKU_ROW)! });
const DEEPSEEK = price(200_000, 600_000);
/** The hosted site's priced targets at R22 (the leaner line-up: GLM, DeepSeek, Qwen, Haiku). */
const SITE_PRICES = new Map<string, ProviderTargetPrice>([
  ["preview:fixture-a", price(150_000, 500_000)],
  ["preview:deepseek-v4-1-flash", DEEPSEEK],
  ["preview:qwen-3-8-flash", price(113_000, 382_000)],
  ["preview:claude-haiku-5-5", price(100_000, 500_000)]
]);
const ROLES: WebRolePrices = Object.freeze({ readerOne: HAIKU, pick: HAIKU, topReaders: DEEPSEEK, planner: DEEPSEEK, pack: DEEPSEEK });

describe("W2-2 · the web part's counts at the owner's caps", () => {
  it("Quick, 5 paths: 20 searches, 7 reader-1 batches a path (400,000 tokens of pages), 5 picks, 10 top reads, 1 planner", () => {
    const sites = webSitesOf({ kind: "START", depth: "QUICK", paths: 5 });
    expect(sites).toMatchObject({ packs: 5, searchesPerPack: 4, searches: 20, resultsPerSearch: 10, pageTokensPerPack: 400_000,
      readerOneCallsPerPack: 7, readerOneCalls: 35, pickCalls: 5, topReaderCalls: 10, plannerCalls: 1, topCount: 3 });
    expect(webModelCalls(sites)).toBe(51);
  });

  it("Thorough doubles the searches (8 a path, 40 at 5 paths) and reads the top 5", () => {
    expect(webSitesOf({ kind: "START", depth: "THOROUGH", paths: 5 })).toMatchObject({ searches: 40, pageTokensPerPack: 800_000,
      readerOneCallsPerPack: 14, topCount: 5 });
  });

  it("a dig: one search per chosen suggestion, 5 results each, one shared pack", () => {
    expect(webSitesOf({ kind: "DIG", depth: "QUICK", digSearches: 3 })).toMatchObject({ packs: 1, searches: 3, resultsPerSearch: 5,
      pageTokensPerPack: 300_000, readerOneCalls: 6, pickCalls: 1, topReaderCalls: 2, plannerCalls: 1 });
    const refused = expect.objectContaining({ code: "WEB_SITES_INVALID" });
    expect(() => webSitesOf({ kind: "DIG", depth: "QUICK", digSearches: 0 })).toThrow(refused);
    expect(() => webSitesOf({ kind: "START", depth: "QUICK", paths: 11 })).toThrow(refused);
    expect(() => webSitesOf({ kind: "START", depth: "DEEP" as never, paths: 2 })).toThrow(refused);
  });

  it("reader 1's batch count holds for every arrangement of pages (each at most the page cap), packed in turn", () => {
    let seed = 7;
    const next = () => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed; };
    for (let trial = 0; trial < 2_000; trial += 1) {
      const total = 400_000;
      const pages: number[] = [];
      let left = total;
      while (left > 0 && pages.length < 40) {
        const size = Math.min(left, 1 + (next() % (trial % 3 === 0 ? WEB_SEARCH_PAGE_TOKEN_CAP : 2_000 + (next() % 19_000))));
        pages.push(size);
        left -= size;
      }
      let batches = 1;
      let filled = 0;
      for (const page of pages) {
        if (filled + page > WEB_READER_BATCH_TOKENS) { batches += 1; filled = 0; }
        filled += page;
      }
      expect(batches, `trial ${String(trial)}`).toBeLessThanOrEqual(webReaderOneCalls(total, WEB_SEARCH_PAGE_TOKEN_CAP, WEB_READER_BATCH_TOKENS));
    }
    // The worst arrangement (pages just over a quarter of a batch) needs all 7.
    const quarter = 20_001;
    let batches = 1; let filled = 0;
    for (let page = 0; page < 19; page += 1) { if (filled + quarter > WEB_READER_BATCH_TOKENS) { batches += 1; filled = 0; } filled += quarter; }
    expect(batches).toBe(7);
  });

  it("every web Haiku call stays under the 100,000-token price line", () => {
    for (const depth of ["QUICK", "THOROUGH"] as const) {
      for (const paths of [1, 3, 5, 10]) {
        const tokens = webCallTokens(webSitesOf({ kind: "START", depth, paths }));
        expect(tokens.readerOne.inputTokens).toBeLessThanOrEqual(WEB_HAIKU_PROMPT_TOKEN_LINE);
        expect(tokens.pick.inputTokens).toBeLessThanOrEqual(WEB_HAIKU_PROMPT_TOKEN_LINE);
      }
    }
    expect(WEB_READER_BATCH_TOKENS + WEB_CALL_ALLOWANCES.instructionTokens).toBe(84_000);
    expect(WEB_SEARCH_REQUEST_TOKEN_CAP).toBe(100_000);
  });
});

describe("W2-2 · the web part's money at R22 prices (never under the caps)", () => {
  it("Quick, 5 paths: 904,986 micro-units (about 90.5 cents), part by part", () => {
    const estimate = estimateWebPartMicros(webSitesOf({ kind: "START", depth: "QUICK", paths: 5 }), ROLES);
    // One reader-1 call: 4,000 instruction tokens at the 5-minute write 0.125 (500) + 80,000 at 0.10 (8,000) + 16,384 out at 0.50.
    expect(estimate.readerOneMicros).toBe(35 * (500 + 8_000 + 8_192));
    // One pick: 40 pages x 200 + 4,000 = 12,000 in (500 + 800) + 4,096 out (2,048).
    expect(estimate.pickMicros).toBe(5 * 3_348);
    // One top read: 3 x 21,000 + 4,000 = 67,000 in at 0.20 (13,400) + 16,384 out at 0.60 (9,831, rounded up).
    expect(estimate.topReaderMicros).toBe(10 * 23_231);
    // The planner: 5 x 6,000 + 4,000 = 34,000 in (6,800) + 8,192 out (4,916).
    expect(estimate.plannerMicros).toBe(11_716);
    expect(estimate.packMicros).toBe(5 * 8_000);
    expect(estimate.searchMicros).toBe(20 * 1_000);
    expect(estimate.totalMicros).toBe(904_986);
    expect(estimate.modelCalls).toBe(51);
  });

  it("Quick, 3 paths: 545,278 micro-units (about 54.5 cents); Thorough, 5 paths: 1,597,206 (about $1.60)", () => {
    expect(estimateWebPartMicros(webSitesOf({ kind: "START", depth: "QUICK", paths: 3 }), ROLES).totalMicros).toBe(545_278);
    expect(estimateWebPartMicros(webSitesOf({ kind: "START", depth: "THOROUGH", paths: 5 }), ROLES).totalMicros).toBe(1_597_206);
  });

  it("is never under a web part that fills every cap with the worst page sizes", () => {
    for (const paths of [1, 2, 3, 4, 5]) {
      const sites = webSitesOf({ kind: "START", depth: "QUICK", paths });
      // Worst case by hand: each reader-1 call at its full batch, each top read at its full pages, each output at max_tokens.
      const ceil = (tokens: number, perMillion: number) => Math.ceil(tokens * perMillion / 1_000_000);
      const readerCall = ceil(4_000, 125_000) + ceil(80_000, 100_000) + ceil(16_384, 500_000);
      const worst = sites.searches * 1_000 + sites.readerOneCalls * readerCall
        + sites.pickCalls * (ceil(4_000, 125_000) + ceil(40 * 200, 100_000) + ceil(4_096, 500_000))
        + sites.topReaderCalls * (ceil(3 * 21_000 + 4_000, 200_000) + ceil(16_384, 600_000))
        + (ceil(paths * 6_000 + 4_000, 200_000) + ceil(8_192, 600_000)) + paths * ceil(40_000, 200_000);
      expect(estimateWebPartMicros(sites, ROLES).totalMicros).toBeGreaterThanOrEqual(worst);
    }
  });

  it("prices each role at the dearest of its candidates (the hosted site's priced targets)", () => {
    const roles = previewWebRolePrices(SITE_PRICES)!;
    expect(roles.readerOne).toEqual({ ...price(100_000, 500_000), vendorPrices: previewVendorPrices(HAIKU_ROW) });
    expect(roles.topReaders).toEqual(DEEPSEEK);
    expect(roles.planner).toEqual(DEEPSEEK);
    expect(roles.pack).toEqual(DEEPSEEK);
    expect(estimateWebPartMicros(webSitesOf({ kind: "START", depth: "QUICK", paths: 5 }), roles).totalMicros).toBe(904_986);
    // No Haiku priced: reader 1 cannot run, nothing to price the web part with.
    expect(previewWebRolePrices(new Map([...SITE_PRICES].filter(([ref]) => ref !== "preview:claude-haiku-5-5")))).toBeNull();
  });
});

describe("W2-2 · the receipt carries the web part (envelope_basis.web)", () => {
  const TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 2,
    finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
    synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
  const WEB = webSitesOf({ kind: "START", depth: "QUICK", paths: 3 });

  it("rides last, adds its model calls to the ceiling at a panel member's attempts, and changes no other byte", () => {
    const today = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 });
    const web = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, web: WEB });
    expect(Object.keys(web)).toEqual([...Object.keys(today), "web"]);
    const { web: member, max_model_attempts: webCeiling, ...rest } = web as Record<string, unknown>;
    const { max_model_attempts: todayCeiling, ...todayRest } = today as Record<string, unknown>;
    expect(JSON.stringify(rest)).toBe(JSON.stringify(todayRest));
    // 3 paths: 21 reader-1 + 3 picks + 6 top reads + 1 planner = 31 calls x 3 attempts = 93.
    expect(webCeiling).toBe((todayCeiling as number) + 93);
    expect(member).toEqual(webReceipt(WEB, 3));
    expect(member).toMatchObject({ version: 1, kind: "START", depth: "QUICK", packs: 3, searches: 12,
      sites: { planner: 1, reader_one: 21, pick: 3, top_readers: 6, added_model_attempts: 93 } });
  });

  it("parses back to the same counts, and a receipt whose counts disagree with the rule is refused", () => {
    const basis = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, web: WEB }) as Record<string, unknown>;
    expect(parseCostEnvelopeBasis(basis).web).toEqual(WEB);
    expect(Object.hasOwn(parseCostEnvelopeBasis(computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 })), "web")).toBe(false);
    const member = basis.web as Record<string, unknown>;
    for (const tampered of [{ ...member, searches: 4 }, { ...member, sites: { ...(member.sites as object), reader_one: 20 } },
      { ...member, page_token_cap: 10_000 }, { ...member, extra: 1 }]) {
      expect(() => parseCostEnvelopeBasis({ ...basis, web: tampered })).toThrow(expect.objectContaining({ code: "RUN_COST_ENVELOPE_UNRESOLVED" }));
    }
  });
});

describe("W2-2 · the hosted room's estimate of a web debate", () => {
  const BASE: RunSettingsClass = Object.freeze({ planTier: "premium", compositionBudgetTier: "high", makerCount: 4, depth: 1 });
  const WEB_CLASS: RunSettingsClass = Object.freeze({ ...BASE, web: { kind: "START" as const, depth: "QUICK" as const, paths: 5 } });
  const START = Object.freeze({ minSamples: 5, startMicrosByDepth: new Map([[1, 300_000]]) });
  const estimator = (webPrices: WebRolePrices | null, maximumMicros = 3_660_000) => new RecentRunsCostEstimator({
    source: { readRecentRunUsage: async () => [] }, prices: SITE_PRICES, maximumMicros, start: START, webPrices
  });

  it("a web class is its own class (a class without web keeps its key)", () => {
    expect(settingsClassKey(BASE)).toBe("premium|high|4|1");
    expect(settingsClassKey(WEB_CLASS)).toBe("premium|high|4|1|web:START:QUICK:5:20");
  });

  it("short of samples: the depth's start figure plus the web part at the caps, capped at the maximum", async () => {
    expect(await estimator(ROLES).estimateMicros(BASE)).toBe(300_000);
    expect(await estimator(ROLES).estimateMicros(WEB_CLASS)).toBe(300_000 + 904_986);
    expect(await estimator(ROLES, 1_000_000).estimateMicros(WEB_CLASS)).toBe(1_000_000);
    // No web prices: the careful side, the maximum.
    expect(await estimator(null).estimateMicros(WEB_CLASS)).toBe(3_660_000);
  });

  it("Free asks carry no web part: their class and estimate are today's", async () => {
    const free: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "low", makerCount: 4, depth: 1 });
    expect(settingsClassKey(free)).toBe("free|low|4|1");
    expect(await estimator(ROLES).estimateMicros(free)).toBe(300_000);
  });
});

describe("W2-2 · the preview's gate check counts the web calls on their own gates", () => {
  const GLM = "zai-org/GLM-5.3-Flash";
  const DS = "deepseek-ai/DeepSeek-V4.1-Flash";
  const PANEL = Object.freeze([{ provider_ref: "preview:fixture-a", model_id: GLM }, { provider_ref: "preview:deepseek-v4-1-flash", model_id: DS }]);
  const OUTPUT = Object.freeze({ debate: 8192, storyteller: 32_768, storytellerRetry: 65_536, storyChecker: 8192 });
  const SETTINGS = { roleModels: Object.freeze({ answerWriter: GLM, answerChecker: GLM, storyteller: GLM, storyChecker: GLM }),
    roleProviderRefs: ["preview:fixture-a", "preview:fixture-b"], storyRounds: 2, callOutputTokens: OUTPUT, maxCooldownHoldsPerRun: 2 };
  const BASIS = Object.freeze({ kind: "COMPUTED_STRUCTURAL_CEILING", panel_size: 2, depth: 1, max_model_attempts: 120, hold_cap: 2,
    call_sites: { author: 8, panel: 8, reviewer: 8, serve: 6 }, serve_leg: { synthesis_loop_sites: 6, selected: "SYNTHESIS_LOOP" } });
  const SITES = webSitesOf({ kind: "START", depth: "QUICK", paths: 5 });
  const WITH_WEB = Object.freeze({ ...BASIS, web: webReceipt(SITES, 3) });

  it("Haiku's reading on the Anthropic gate, the top reads, planner and pack on DeepInfra, each with the 15% margin", () => {
    const shares = previewWebGateShares(SITES, [previewModelRow(GLM)!, previewModelRow(DS)!]);
    // 35 reader-1 calls x 16,692,000 nano + 5 picks x 3,348,000 + the planner as Haiku 7,596,000, then x 1.15 rounded up.
    expect(shares.get("anthropic")).toEqual({ calls: 48, nanoUsd: 699_839_400n });
    // 10 top reads at DeepSeek x 23,230,400 + the planner as DeepSeek 11,715,200 + 5 packs x 40,000 x 200, x 1.15.
    expect(shares.get("deepinfra")).toEqual({ calls: 13, nanoUsd: 326_622_080n });
    expect(previewWebSearchNeed(SITES)).toEqual({ searches: 20, nanoUsd: 20_000_000n });
  });

  it("adds exactly those shares to a new debate's needs, and nothing to a debate without web", () => {
    const plain = estimatePreviewGateNeeds({ basis: BASIS, panel: PANEL, ...SETTINGS });
    const web = estimatePreviewGateNeeds({ basis: WITH_WEB, panel: PANEL, ...SETTINGS });
    const deepinfra = (needs: typeof plain) => needs.find((need) => need.gate === "deepinfra")!;
    expect(plain.map((need) => need.gate)).toEqual(["deepinfra"]);
    expect(deepinfra(web).callsNanoUsd - deepinfra(plain).callsNanoUsd).toBe(326_622_080n);
    expect(deepinfra(web).callsWithMargin - deepinfra(plain).callsWithMargin).toBe(13);
    expect(deepinfra(web).modelIds).toEqual(deepinfra(plain).modelIds);
    // The Anthropic gate gets its own need, requiring no model (a web call it cannot serve fails the web step only).
    expect(web.find((need) => need.gate === "anthropic")).toEqual({ gate: "anthropic", modelIds: [], expectedCalls: 48,
      callsWithMargin: 48, callsNanoUsd: 699_839_400n });
  });

  it("holds an unfinished debate's web part while it debates, and nothing once it only writes its story", () => {
    const debating = estimateUnfinishedRunHolds({ registerVersion: 5, basis: WITH_WEB, panel: PANEL }, SETTINGS);
    const story = estimateUnfinishedRunHolds({ registerVersion: 5, basis: WITH_WEB, panel: PANEL, phase: "STORY" }, SETTINGS);
    const storyPlain = estimateUnfinishedRunHolds({ registerVersion: 5, basis: BASIS, panel: PANEL, phase: "STORY" }, SETTINGS);
    expect(debating.some((need) => need.gate === "anthropic")).toBe(true);
    expect(story).toEqual(storyPlain);
  });
});
