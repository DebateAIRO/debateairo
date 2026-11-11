// Perplexity plan 2026-10-30, task W2-1: the app's search adapter equals the reviewed search row of the preview's
// spending gate (W1-1), field for field, through the one shared file both sides read
// (tests/unit/fixtures/preview-search-rows.json). A price or bound change is a reviewed change to the gate, to the
// adapter and to that file together; this test turns red on any one of them alone.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PERPLEXITY_REPLY_FIELDS,
  PERPLEXITY_REQUEST_FIELDS,
  PERPLEXITY_SEARCH_BOUNDS,
  PERPLEXITY_SEARCH_CHARGE_MICROS,
  PERPLEXITY_SEARCH_HOST,
  PERPLEXITY_SEARCH_KEY_PREFIX,
  PERPLEXITY_SEARCH_MAKER,
  PERPLEXITY_SEARCH_MODEL,
  PERPLEXITY_SEARCH_PATH,
  PERPLEXITY_SEARCH_REQUEST_MAX_BYTES,
  PERPLEXITY_SEARCH_REQUEST_NANO_USD,
  PERPLEXITY_SEARCH_TYPE,
  PERPLEXITY_SEARCH_URL,
  PERPLEXITY_SEARCH_VENDOR,
  PERPLEXITY_UNBILLED_REFUSALS,
  previewNanoUsdText
} from "@debateai/providers";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/preview-search-rows.json", import.meta.url), "utf8")) as {
  schema: string; provider: string; host: string; path: string; key_prefix: string; per_call_cap_usd: string;
  max_request_bytes: number;
  rows: Array<{ model: string; maker: string; request_usd: string; request_nano_usd: number; search_type: string;
    worst_case_reservation_usd: string }>;
  request_fields: { required: string[]; optional: string[] };
  bounds: { query_chars: [number, number]; max_results: [number, number]; max_tokens_per_page: [number, number];
    max_tokens: [number, number]; search_language_filter_items: number };
  reply_fields: { top_level: string[]; required_top_level: string[]; result: string[]; required_result: string[];
    max_results: number };
  unbilled_refusals: { busy: number[]; not_busy: number[] };
};
const helper = readFileSync(new URL("../../packages/providers/ops/preview_budget_helper.py", import.meta.url), "utf8");

describe("the search adapter equals the gate's reviewed search row (W1-1 fixture)", () => {
  it("names the same file schema, vendor, host, path and key shape", () => {
    expect(fixture.schema).toBe("preview-search-rows-v1");
    expect(fixture.provider).toBe(PERPLEXITY_SEARCH_VENDOR);
    expect(fixture.host).toBe(PERPLEXITY_SEARCH_HOST);
    expect(fixture.path).toBe(PERPLEXITY_SEARCH_PATH);
    expect(PERPLEXITY_SEARCH_URL).toBe(`https://${fixture.host}${fixture.path}`);
    expect(fixture.key_prefix).toBe(PERPLEXITY_SEARCH_KEY_PREFIX);
  });

  it("holds exactly one row: the fast search at $0.001 a request, the per-call cap one search", () => {
    expect(fixture.rows).toHaveLength(1);
    const [row] = fixture.rows;
    expect(row!.model).toBe(PERPLEXITY_SEARCH_MODEL);
    expect(row!.maker).toBe(PERPLEXITY_SEARCH_MAKER);
    expect(row!.search_type).toBe(PERPLEXITY_SEARCH_TYPE);
    expect(BigInt(row!.request_nano_usd)).toBe(PERPLEXITY_SEARCH_REQUEST_NANO_USD);
    // The hold the app sends is the gate's request_usd to the digit (the bridge compares them as decimals).
    expect(Number(previewNanoUsdText(PERPLEXITY_SEARCH_REQUEST_NANO_USD))).toBe(Number(row!.request_usd));
    expect(Number(row!.worst_case_reservation_usd)).toBe(Number(row!.request_usd));
    expect(Number(fixture.per_call_cap_usd)).toBe(Number(row!.request_usd));
    // The ledger counts micros: 1,000,000 nano-USD is 1,000 micros (0.1 cent).
    expect(BigInt(PERPLEXITY_SEARCH_CHARGE_MICROS) * 1000n).toBe(PERPLEXITY_SEARCH_REQUEST_NANO_USD);
  });

  it("sends only the reviewed request members, within the reviewed bounds", () => {
    expect([...PERPLEXITY_REQUEST_FIELDS.required]).toEqual(fixture.request_fields.required);
    expect([...PERPLEXITY_REQUEST_FIELDS.optional]).toEqual(fixture.request_fields.optional);
    expect(PERPLEXITY_SEARCH_BOUNDS).toEqual({
      queryChars: fixture.bounds.query_chars, maxResults: fixture.bounds.max_results,
      maxTokensPerPage: fixture.bounds.max_tokens_per_page, maxTokens: fixture.bounds.max_tokens,
      languageItems: fixture.bounds.search_language_filter_items
    });
    expect(PERPLEXITY_SEARCH_REQUEST_MAX_BYTES).toBe(fixture.max_request_bytes);
  });

  it("reads the same closed reply members, and the same unbilled refusals", () => {
    expect([...PERPLEXITY_REPLY_FIELDS.topLevel]).toEqual(fixture.reply_fields.top_level);
    expect([...PERPLEXITY_REPLY_FIELDS.requiredTopLevel]).toEqual(fixture.reply_fields.required_top_level);
    expect([...PERPLEXITY_REPLY_FIELDS.result]).toEqual(fixture.reply_fields.result);
    expect([...PERPLEXITY_REPLY_FIELDS.requiredResult]).toEqual(fixture.reply_fields.required_result);
    expect(PERPLEXITY_REPLY_FIELDS.maxResults).toBe(fixture.reply_fields.max_results);
    expect([...PERPLEXITY_UNBILLED_REFUSALS.busy]).toEqual(fixture.unbilled_refusals.busy);
    expect([...PERPLEXITY_UNBILLED_REFUSALS.notBusy]).toEqual(fixture.unbilled_refusals.not_busy);
  });

  it("the gate's own profile still says the same (its Python source)", () => {
    expect(helper).toContain(`SEARCH_MODEL = '${PERPLEXITY_SEARCH_MODEL}'`);
    expect(helper).toContain(`SEARCH_TYPE = '${PERPLEXITY_SEARCH_TYPE}'`);
    expect(helper).toContain(`host = '${PERPLEXITY_SEARCH_HOST}'`);
    expect(helper).toContain(`path = '${PERPLEXITY_SEARCH_PATH}'`);
    expect(helper).toContain("request_usd=Decimal('0.001')");
    expect(helper).toContain(`REQUIRED_FIELDS = (${PERPLEXITY_REQUEST_FIELDS.required.map((name) => `'${name}'`).join(", ")})`);
    expect(helper).toContain(`OPTIONAL_FIELDS = (${PERPLEXITY_REQUEST_FIELDS.optional.map((name) => `'${name}'`).join(", ")})`);
    expect(helper).toContain(`max_request_bytes = 16 * 1024`);
  });
});
