import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CostEnvelopeGuard,
  chargeMicrosForUsage,
  chargeableUsage,
  projectedCallCeilingMicros,
  type ModelSpendEntry,
  type ModelSpendStore
} from "@debateai/budget";
import {
  PREVIEW_ANTHROPIC_SETTLEMENT_STEPS,
  anthropicUsageAsEngineUsage,
  previewModelRow,
  previewTargetChargePrice,
  previewVendorPrices
} from "@debateai/providers";

/**
 * Owner answer F4 (2026-10-30), task W2-2 — CACHED READS IN THE PERSON'S QUOTA, AT THE REAL PRICE.
 *
 * Before: the quota counted every Claude Haiku input token at $0.10 per million, so a cache read ($0.01) was counted
 * ten times too dear and a 5-minute cache write ($0.125) a quarter too cheap. Now the quota charges what Anthropic bills.
 *
 * The prices, as verified on 2026-10-30 (and the gate's own settlement table, which already charged them):
 *  | Haiku 5.5, per million tokens | input | 5-min write | 1-hour write | cache read | output |
 *  | prompt up to 100,000 tokens   | 0.10  | 0.125       | 0.20         | 0.01       | 0.50   |
 *  | prompt over 100,000 tokens    | 0.50  | 0.625       | 1.00         | 0.05       | 2.50   |
 * Source: platform.claude.com/docs/en/about-claude/pricing (model table; multipliers 1.25x, 2x, 0.1x; "A request's
 * prompt length counts all of its input tokens, including cache reads and cache writes"). The lifetime: "By default,
 * the cache has a 5-minute lifetime. The cache is refreshed for no additional cost each time the cached content is
 * used", measured from the start of the request (platform.claude.com/docs/en/build-with-claude/prompt-caching).
 */

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/preview-model-rows-anthropic.json", import.meta.url), "utf8")) as {
  settlement_steps: readonly Readonly<Record<string, string | number | null>>[];
};
const GATE = readFileSync(new URL("../../packages/providers/ops/preview_budget_helper.py", import.meta.url), "utf8");
const ADAPTER = readFileSync(new URL("../../packages/providers/src/anthropic-messages.ts", import.meta.url), "utf8");
const HAIKU = previewModelRow("claude-haiku-5-5")!;
const PLAIN = Object.freeze({ inputMicrosPerMillionTokens: 100_000, outputMicrosPerMillionTokens: 500_000 });
const REAL = previewTargetChargePrice(true, { baseUrl: "https://api.anthropic.com/v1", model: "claude-haiku-5-5" }, PLAIN)!;
const NOW = new Date("2026-10-30T11:00:00.000Z");

/** The gate's settlement (preview_budget_helper.py AnthropicProfile.account), exactly, in nano-USD. */
function gateNanoUsd(counts: Readonly<{ input: number; write: number; hour: number; read: number; output: number }>): bigint {
  const prompt = counts.input + counts.write + counts.read;
  const step = PREVIEW_ANTHROPIC_SETTLEMENT_STEPS[prompt <= PREVIEW_ANTHROPIC_SETTLEMENT_STEPS[0]!.promptTokensUpTo! ? 0 : 1]!;
  const nano = (usdPerM: string): bigint => BigInt(Math.round(Number(usdPerM) * 1000));
  return BigInt(counts.input) * nano(step.inputUsdPerM) + BigInt(counts.write - counts.hour) * nano(step.cacheWrite5mUsdPerM)
    + BigInt(counts.hour) * nano(step.cacheWrite1hUsdPerM) + BigInt(counts.read) * nano(step.cacheReadUsdPerM)
    + BigInt(counts.output) * nano(step.outputUsdPerM);
}

/** The vendor's reply usage, folded the way the gateway hands it to the charge, then charged at the real prices. */
function quotaMicros(vendor: Readonly<Record<string, unknown>>): number {
  const usage = chargeableUsage(anthropicUsageAsEngineUsage(vendor), { requestBytes: 1_000, completionTokenCeiling: 1_000 })!;
  return chargeMicrosForUsage(REAL, usage);
}

describe("F4 · the prices are the vendor's, the gate's and the parity file's, all equal", () => {
  it("the app's steps equal the parity file's settlement_steps, field by field", () => {
    expect(PREVIEW_ANTHROPIC_SETTLEMENT_STEPS.map((step) => ({
      prompt_tokens_up_to: step.promptTokensUpTo, input_usd_per_m: step.inputUsdPerM, cache_write_5m_usd_per_m: step.cacheWrite5mUsdPerM,
      cache_write_1h_usd_per_m: step.cacheWrite1hUsdPerM, cache_read_usd_per_m: step.cacheReadUsdPerM, output_usd_per_m: step.outputUsdPerM
    }))).toEqual(FIXTURE.settlement_steps);
  });

  it("the gate settles at the same two steps (its Python table, read as text)", () => {
    expect(GATE).toContain("PriceStep('up_to_100k', 100000, Decimal('0.10'), Decimal('0.125'), Decimal('0.20'), Decimal('0.01'), Decimal('0.50'))");
    expect(GATE).toContain("PriceStep('over_100k', None, Decimal('0.50'), Decimal('0.625'), Decimal('1.00'), Decimal('0.05'), Decimal('2.50'))");
  });

  it("the verified multipliers hold on both steps: write 1.25x, 1-hour write 2x, read 0.1x the step's input", () => {
    for (const step of PREVIEW_ANTHROPIC_SETTLEMENT_STEPS) {
      const input = Number(step.inputUsdPerM);
      expect(Number(step.cacheWrite5mUsdPerM)).toBeCloseTo(input * 1.25, 10);
      expect(Number(step.cacheWrite1hUsdPerM)).toBeCloseTo(input * 2, 10);
      expect(Number(step.cacheReadUsdPerM)).toBeCloseTo(input * 0.1, 10);
    }
  });

  it("the row's own prices are the lower step's, and the quota's vendor prices are the steps in micro-units", () => {
    expect(previewVendorPrices(HAIKU)).toEqual({
      lower: { cacheWriteMicrosPerMillionTokens: 125_000, cacheWriteOneHourMicrosPerMillionTokens: 200_000, cacheReadMicrosPerMillionTokens: 10_000 },
      upper: { abovePromptTokens: 100_000, inputMicrosPerMillionTokens: 500_000, outputMicrosPerMillionTokens: 2_500_000,
        cacheWriteMicrosPerMillionTokens: 625_000, cacheWriteOneHourMicrosPerMillionTokens: 1_000_000, cacheReadMicrosPerMillionTokens: 50_000 }
    });
    expect(REAL.inputMicrosPerMillionTokens).toBe(HAIKU.inputPriceMicrosPerMillion);
    // A DeepInfra row bills every prompt token alike: no vendor prices, today's charge.
    expect(previewVendorPrices(previewModelRow("zai-org/GLM-5.3-Flash")!)).toBeUndefined();
    expect(previewTargetChargePrice(true, { baseUrl: "https://api.deepinfra.com/v1/openai", model: "zai-org/GLM-5.3-Flash" }, PLAIN)).toBe(PLAIN);
    // Off the preview the declared price is kept as it is.
    expect(previewTargetChargePrice(false, { baseUrl: "https://api.anthropic.com/v1", model: "claude-haiku-5-5" }, PLAIN)).toBe(PLAIN);
  });

  it("every cache mark the app sends is the 5-minute kind (no ttl), as the gate requires", () => {
    expect(ADAPTER).toContain('const ANTHROPIC_CACHE_MARK = Object.freeze({ type: "ephemeral" } as const);');
    // No cache_control anywhere names a ttl (a 1-hour write would bill twice the input price).
    expect(ADAPTER).not.toMatch(/ttl\s*:/u);
    expect(ADAPTER).not.toMatch(/"1h"/u);
    expect(GATE).toContain("CACHE_MARK = {'type': 'ephemeral'}");
  });
});

describe("F4 · the quota charges each kind of input token at its own price", () => {
  it("a cache read is a tenth of plain input; a 5-minute write 1.25x; a 1-hour write 2x", () => {
    // 50,000 read + 1,000 written (5-minute) + 9,000 plain + 2,000 output, under the 100,000 line.
    const vendor = { input_tokens: 9_000, cache_creation_input_tokens: 1_000, cache_read_input_tokens: 50_000, output_tokens: 2_000,
      cache_creation: { ephemeral_5m_input_tokens: 1_000, ephemeral_1h_input_tokens: 0 } };
    // 9,000 x 0.10 + 1,000 x 0.125 + 50,000 x 0.01 + 2,000 x 0.50 = 900 + 125 + 500 + 1,000 micro-units.
    expect(quotaMicros(vendor)).toBe(2_525);
    // Before F4 the same call counted 60,000 x 0.10 + 2,000 x 0.50 = 7,000.
    expect(chargeMicrosForUsage(PLAIN, { promptTokens: 60_000, completionTokens: 2_000 })).toBe(7_000);
    expect(quotaMicros({ ...vendor, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1_000 } })).toBe(2_600);
  });

  it("a write reported without its 5-minute/1-hour split is charged at the 1-hour price (never under the bill)", () => {
    expect(quotaMicros({ input_tokens: 9_000, cache_creation_input_tokens: 1_000, output_tokens: 0 })).toBe(900 + 200);
  });

  it("the 100,000 line counts reads and writes too: a prompt of 95,000 reads + 6,000 plain pays the upper step on all", () => {
    const vendor = { input_tokens: 6_000, cache_read_input_tokens: 95_000, output_tokens: 1_000 };
    // 6,000 x 0.50 + 95,000 x 0.05 + 1,000 x 2.50 = 3,000 + 4,750 + 2,500.
    expect(quotaMicros(vendor)).toBe(10_250);
    // At exactly 100,000 the lower step still applies (the gate's `<=`).
    expect(quotaMicros({ input_tokens: 5_000, cache_read_input_tokens: 95_000, output_tokens: 1_000 })).toBe(500 + 950 + 500);
  });

  it("equals the gate's own settlement, rounded up by at most one micro-unit per kind of token", () => {
    const cases = [
      { input: 9_000, write: 1_000, hour: 0, read: 50_000, output: 2_000 },
      { input: 1, write: 3, hour: 1, read: 7, output: 11 },
      { input: 6_000, write: 0, hour: 0, read: 95_000, output: 1_000 },
      { input: 40_001, write: 59_999, hour: 0, read: 0, output: 16_384 },
      { input: 123, write: 4_567, hour: 4_567, read: 89_012, output: 32_768 }
    ];
    for (const counts of cases) {
      const vendor = { input_tokens: counts.input, cache_creation_input_tokens: counts.write, cache_read_input_tokens: counts.read,
        output_tokens: counts.output, cache_creation: { ephemeral_5m_input_tokens: counts.write - counts.hour, ephemeral_1h_input_tokens: counts.hour } };
      const quota = BigInt(quotaMicros(vendor)) * 1000n;
      const gate = gateNanoUsd(counts);
      expect(quota >= gate, JSON.stringify(counts)).toBe(true);
      expect(quota - gate < 5_000n, JSON.stringify(counts)).toBe(true);
    }
  });

  it("an unreadable or impossible split charges every prompt token at the dearest input price, never less", () => {
    const usage = chargeableUsage({ prompt_tokens: 1_000, completion_tokens: 0, cache_read_input_tokens: 2_000 }, { requestBytes: 1, completionTokenCeiling: 1 })!;
    expect(usage).toEqual({ promptTokens: 1_000, completionTokens: 0, cacheWriteTokens: 1_000, cacheWriteOneHourTokens: 1_000 });
    expect(chargeMicrosForUsage(REAL, usage)).toBe(200);
  });

  it("changes nothing for a price without vendor prices, nor for the projection a call is admitted against", () => {
    const usage = { promptTokens: 60_000, completionTokens: 2_000, cacheReadTokens: 50_000, cacheWriteTokens: 1_000 };
    expect(chargeMicrosForUsage(PLAIN, usage)).toBe(7_000);
    const projection = { requestBytes: 300_000, completionTokenCeiling: 32_768 };
    expect(projectedCallCeilingMicros(REAL, projection)).toBe(projectedCallCeilingMicros(PLAIN, projection));
  });
});

describe("F4 · end to end: a Haiku reply's cached reads reach the person's quota at their real price", () => {
  it("the run's seam, built with the runner's price, writes the vendor's bill to the ledger", async () => {
    const written: ModelSpendEntry[] = [];
    const store: ModelSpendStore = {
      recordSpend: async (entry) => { written.push(entry); },
      readRunSpentMicros: async () => 0,
      readRunStorySpentMicros: async () => 0,
      readDaySpentMicros: async () => 0,
      admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
    };
    const seam = new CostEnvelopeGuard({ store, policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000 }, clock: () => NOW })
      .providerSeam({ runId: "run-1", price: REAL, requireReportedUsage: true, phase: "BODY" });
    const projection = { requestBytes: 120_000, completionTokenCeiling: 16_384 };
    await seam.assertCallAllowed(projection);
    const vendor = { input_tokens: 9_000, cache_creation_input_tokens: 1_000, cache_read_input_tokens: 50_000, output_tokens: 2_000,
      cache_creation: { ephemeral_5m_input_tokens: 1_000, ephemeral_1h_input_tokens: 0 }, service_tier: "standard" };
    await seam.recordCall({ providerRef: "preview:claude-haiku-5-5", usage: anthropicUsageAsEngineUsage(vendor), projection });
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ chargeMicros: 2_525, inputTokens: 60_000, outputTokens: 2_000 });
  });
});
