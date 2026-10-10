/**
 * The private preview's reviewed DeepInfra model rows (contract A §1, 2026-10-10).
 *
 * Plain words: the preview may call exactly these models, each at its own list price, with its
 * own largest answer size ("output bound"), its own "effort" thinking switch and its own
 * JSON-answer switch. The root gate holds the same table in Python; a parity test reads
 * tests/unit/fixtures/preview-model-rows.json so the two copies cannot drift. Changing a row is a
 * reviewed code change on both sides, never a configuration edit.
 *
 * Multi-model preview, PR B and PR C: the rows are kept per provider (`PREVIEW_MODEL_ROWS_BY_PROVIDER`),
 * one root gate per provider; each provider's rows have their own parity file
 * (tests/unit/fixtures/preview-model-rows.json for DeepInfra, preview-model-rows-anthropic.json for
 * Anthropic, preview-google-row.json for Google, whose dated prices live in preview-google.ts). A
 * later provider is one more key there and one more parity file.
 *
 * No imports on purpose: index.ts, preview-test.ts and provider-probe.ts all read these rows.
 */
/** The providers the preview has a reviewed root gate for. */
export type PreviewProviderName = "deepinfra" | "anthropic" | "google";

export type PreviewModelRow = Readonly<{
  /** The provider (and so the root gate) this row's calls go through. */
  provider: PreviewProviderName;
  /** The target's base URL (`base_url`), exactly. */
  baseUrl: string;
  /** The register's adapter kind for this row's provider ref. */
  adapterKind: "openai-compatible-http" | "anthropic-messages-http" | "google-gemini-http";
  /** The context window the target declares (`context_window_tokens`). */
  contextWindowTokens: number;
  model: string;
  maker: string;
  /**
   * Vendor list price in USD per million tokens, as the decimal string the gate reads: the price
   * every call reserves at and the estimate uses. For a vendor with price steps (Anthropic) it is
   * the dearest per-token price of the upper step; the gate settles at the real step. For a vendor
   * with dated prices (Google) it is the ceiling (the last dated step): the engine's own envelope uses
   * it, while each Google call reserves, and the estimate prices, at its dated price (preview-google.ts).
   */
  inputUsdPerM: string;
  outputUsdPerM: string;
  /** The same prices as whole nano-USD per token (USD per million x 1000), for BigInt arithmetic. */
  inputNanoUsdPerToken: bigint;
  outputNanoUsdPerToken: bigint;
  /** The same prices in the engine's target unit: USD micro-units per million tokens. */
  inputPriceMicrosPerMillion: number;
  outputPriceMicrosPerMillion: number;
  /** Largest max_tokens ever sent, and the output side of every reservation. */
  outputBound: number;
  /**
   * "high": the body carries exactly the provider's effort member with "high" (DeepInfra
   * `reasoning_effort`, Anthropic `output_config.effort`, Google
   * `generationConfig.thinkingConfig.thinkingLevel`); null: the body never carries it.
   */
  effort: "high" | null;
  /** Whether response_format {"type":"json_object"} may be sent. */
  jsonObject: boolean;
}>;

/** The DeepInfra connection's base URL and window, shared by every DeepInfra row. */
export const PREVIEW_DEEPINFRA_BASE_URL = "https://api.deepinfra.com/v1/openai" as const;
export const PREVIEW_CONTEXT_WINDOW_TOKENS = 1_048_576 as const;
/** The Anthropic Messages connection's base URL (the adapter's one lawful base) and its exact call URL. */
export const PREVIEW_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1" as const;
export const PREVIEW_ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages" as const;
/** Claude Haiku 5.5's window (1M tokens). */
export const PREVIEW_ANTHROPIC_CONTEXT_WINDOW_TOKENS = 1_000_000 as const;
/**
 * The Gemini API connection's base URL (the adapter's one lawful base; the same string as
 * GOOGLE_GEMINI_BASE_URL in index.ts, a test pins the two equal) and the Google row's exact call URL:
 * no query (the key never travels in a URL), no fragment.
 */
export const PREVIEW_GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta" as const;
export const PREVIEW_GOOGLE_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent" as const;
/** gemini-3.8-flash's window (1,048,576 tokens). */
export const PREVIEW_GOOGLE_CONTEXT_WINDOW_TOKENS = 1_048_576 as const;
/** Request bodies above this are refused before any reservation (contract A §2). */
export const PREVIEW_REQUEST_BODY_MAX_BYTES = 256 * 1024;
/** Template allowance added to the body's bytes on the input side of a reservation (contract A §3). */
export const PREVIEW_RESERVATION_TEMPLATE_BYTES = 2048;

type RowInput = Readonly<{
  model: string; maker: string; inputUsdPerM: string; outputUsdPerM: string;
  outputBound: number; effort: "high" | null; jsonObject: boolean;
}>;
const PROVIDER_CONNECTIONS = Object.freeze({
  deepinfra: Object.freeze({ provider: "deepinfra", baseUrl: PREVIEW_DEEPINFRA_BASE_URL,
    adapterKind: "openai-compatible-http", contextWindowTokens: PREVIEW_CONTEXT_WINDOW_TOKENS }),
  anthropic: Object.freeze({ provider: "anthropic", baseUrl: PREVIEW_ANTHROPIC_BASE_URL,
    adapterKind: "anthropic-messages-http", contextWindowTokens: PREVIEW_ANTHROPIC_CONTEXT_WINDOW_TOKENS }),
  google: Object.freeze({ provider: "google", baseUrl: PREVIEW_GOOGLE_BASE_URL,
    adapterKind: "google-gemini-http", contextWindowTokens: PREVIEW_GOOGLE_CONTEXT_WINDOW_TOKENS })
} as const);
function row(provider: PreviewProviderName, input: RowInput): PreviewModelRow {
  // USD per million with two or three decimals ("0.15", "0.625") as whole nano-USD per token.
  const nano = (usdPerM: string): bigint => {
    const match = /^(\d+)\.(\d{2,3})$/u.exec(usdPerM);
    if (match === null) throw new TypeError("PREVIEW_MODEL_ROW_PRICE_INVALID");
    return BigInt(match[1]!) * 1000n + BigInt(match[2]!.padEnd(3, "0"));
  };
  const inputNanoUsdPerToken = nano(input.inputUsdPerM);
  const outputNanoUsdPerToken = nano(input.outputUsdPerM);
  return Object.freeze({
    ...PROVIDER_CONNECTIONS[provider],
    ...input,
    inputNanoUsdPerToken,
    outputNanoUsdPerToken,
    inputPriceMicrosPerMillion: Number(inputNanoUsdPerToken) * 1000,
    outputPriceMicrosPerMillion: Number(outputNanoUsdPerToken) * 1000
  });
}

/**
 * The reviewed rows, per provider (each provider's gate holds the same rows in Python). A provider
 * is an addition here: its own key, its own parity file, its own gate and socket.
 */
export const PREVIEW_MODEL_ROWS_BY_PROVIDER: Readonly<Record<PreviewProviderName, readonly PreviewModelRow[]>> = Object.freeze({
  deepinfra: Object.freeze([
    row("deepinfra", { model: "zai-org/GLM-5.3-Flash", maker: "Z.AI", inputUsdPerM: "0.15", outputUsdPerM: "0.50",
      outputBound: 163_840, effort: "high", jsonObject: true }),
    row("deepinfra", { model: "deepseek-ai/DeepSeek-V4.1-Flash", maker: "DeepSeek", inputUsdPerM: "0.20", outputUsdPerM: "0.60",
      outputBound: 131_072, effort: "high", jsonObject: false }),
    row("deepinfra", { model: "XiaomiMiMo/MiMo-V2.6-Pro", maker: "Xiaomi", inputUsdPerM: "0.43", outputUsdPerM: "0.87",
      outputBound: 131_072, effort: null, jsonObject: false })
  ]),
  // PR B (lead, 2026-10-10). Reserve and estimate at the dearest per-input-token price of the upper
  // step (5-minute cache write $0.625) and the upper output price ($2.50): a 256 KiB call holds at
  // most $0.24704. The gate settles at the real step (list prices, read 2026-10-10).
  anthropic: Object.freeze([
    row("anthropic", { model: "claude-haiku-5-5", maker: "Anthropic", inputUsdPerM: "0.625", outputUsdPerM: "2.50",
      outputBound: 32_768, effort: "high", jsonObject: false })
  ]),
  // PR C (lead, 2026-10-10). The row's prices are the CEILING, the last dated step ($1.50 / $7.50):
  // the engine's envelope uses them. Each call reserves, and the estimate prices, at its dated price
  // (preview-google.ts, $0.75 / $3.75 until the step), which the gate settles at.
  google: Object.freeze([
    row("google", { model: "gemini-3.8-flash", maker: "Google", inputUsdPerM: "1.50", outputUsdPerM: "7.50",
      outputBound: 16_384, effort: "high", jsonObject: false })
  ])
});
/** Every reviewed row, providers in the order above. */
export const PREVIEW_MODEL_ROWS: readonly PreviewModelRow[] = Object.freeze(
  (Object.keys(PREVIEW_MODEL_ROWS_BY_PROVIDER) as PreviewProviderName[]).flatMap((provider) => PREVIEW_MODEL_ROWS_BY_PROVIDER[provider])
);
/** The preview's providers, in register order. */
export const PREVIEW_PROVIDER_NAMES: readonly PreviewProviderName[] = Object.freeze(
  Object.keys(PREVIEW_MODEL_ROWS_BY_PROVIDER) as PreviewProviderName[]
);

/** The reviewed row for an exact model id, or undefined. */
export function previewModelRow(model: unknown): PreviewModelRow | undefined {
  return typeof model === "string" ? PREVIEW_MODEL_ROWS.find((candidate) => candidate.model === model) : undefined;
}

/** The largest output bound of any reviewed row (the probe's outer limit off a known row). */
export const PREVIEW_MAX_OUTPUT_BOUND = Math.max(...PREVIEW_MODEL_ROWS.map((candidate) => candidate.outputBound));

/**
 * Each provider ref the preview register may name, and its row. `preview:fixture-a` (writer) and
 * `preview:fixture-b` stay GLM so runs pinned to the sealed two-GLM register keep resolving; each
 * new model has one ref of its own.
 */
export const PREVIEW_PROVIDER_REF_MODELS: Readonly<Record<string, string>> = Object.freeze({
  "preview:fixture-a": "zai-org/GLM-5.3-Flash",
  "preview:fixture-b": "zai-org/GLM-5.3-Flash",
  "preview:deepseek-v4-1-flash": "deepseek-ai/DeepSeek-V4.1-Flash",
  "preview:mimo-v2-6-pro": "XiaomiMiMo/MiMo-V2.6-Pro",
  "preview:claude-haiku-5-5": "claude-haiku-5-5",
  "preview:gemini-3-8-flash": "gemini-3.8-flash"
});
/** The reviewed provider set, in register order. */
export const PREVIEW_REVIEWED_PROVIDER_REFS = Object.freeze(Object.keys(PREVIEW_PROVIDER_REF_MODELS));
/**
 * The reviewed ref sets a preview register may name, besides the sealed two-GLM pair: the DeepInfra
 * refs, plus the refs of any other reviewed providers, always in register order. So a register
 * published before a provider's gate existed keeps booting after that provider's rows are added.
 */
export function previewRefsAreReviewedSet(refs: readonly string[]): boolean {
  const providerOf = (ref: string) => previewModelRowForRef(ref)?.provider;
  if (refs.some((ref) => providerOf(ref) === undefined) || new Set(refs).size !== refs.length) return false;
  const providers = new Set(refs.map((ref) => providerOf(ref)!));
  if (!providers.has("deepinfra")) return false;
  const expected = PREVIEW_REVIEWED_PROVIDER_REFS.filter((ref) => providers.has(providerOf(ref)!));
  return expected.length === refs.length && expected.every((ref, index) => ref === refs[index]);
}

/** The row a provider ref is reviewed for, or undefined. */
export function previewModelRowForRef(providerRef: unknown): PreviewModelRow | undefined {
  return typeof providerRef === "string" && Object.hasOwn(PREVIEW_PROVIDER_REF_MODELS, providerRef)
    ? previewModelRow(PREVIEW_PROVIDER_REF_MODELS[providerRef]) : undefined;
}

/** The discovery target JSON row (PROVIDER_DISCOVERY_TARGETS_JSON element) a reviewed ref must be declared as. */
export function previewTargetJsonRow(providerRef: string): Readonly<Record<string, unknown>> {
  const reviewed = previewModelRowForRef(providerRef);
  if (reviewed === undefined) throw new TypeError("PREVIEW_PROVIDER_REF_UNREVIEWED");
  return Object.freeze({
    provider_ref: providerRef, base_url: reviewed.baseUrl, model: reviewed.model,
    input_price_micros_per_million: reviewed.inputPriceMicrosPerMillion,
    output_price_micros_per_million: reviewed.outputPriceMicrosPerMillion,
    ...(reviewed.effort === null ? {} : { thinking_parameter: "reasoning_effort", thinking_levels: Object.freeze([reviewed.effort]) }),
    context_window_tokens: reviewed.contextWindowTokens
  });
}

/** nano-USD as the gate's 9-decimal string ("0.121548800"). */
export function previewNanoUsdText(value: bigint): string {
  if (value < 0n) throw new TypeError("PREVIEW_NANO_USD_NEGATIVE");
  const source = value.toString().padStart(10, "0");
  return `${source.slice(0, -9)}.${source.slice(-9)}`;
}

/** Contract A §3: ((body bytes + 2048) x input + output_bound x output), in nano-USD. */
export function previewReservationNanoUsd(reviewed: PreviewModelRow, bodyBytes: number): bigint {
  if (!Number.isSafeInteger(bodyBytes) || bodyBytes < 0) throw new TypeError("PREVIEW_BODY_BYTES_INVALID");
  return BigInt(bodyBytes + PREVIEW_RESERVATION_TEMPLATE_BYTES) * reviewed.inputNanoUsdPerToken
    + BigInt(reviewed.outputBound) * reviewed.outputNanoUsdPerToken;
}

/** The reviewed row for a target's own base URL and model name, if any (any provider). */
export function previewModelRowForEndpoint(baseUrl: string, model: string): PreviewModelRow | undefined {
  const reviewed = previewModelRow(model);
  return reviewed !== undefined && reviewed.baseUrl === baseUrl ? reviewed : undefined;
}

/** The two-maker rule (contract A §6/§7): with two or more makers in the union, each roster names two or more. */
export function previewRostersHonourMakerRule(free: readonly string[], premium: readonly string[]): boolean {
  const makers = (ids: readonly string[]) => new Set(ids.map((id) => previewModelRow(id)?.maker));
  return makers([...free, ...premium]).size < 2 || (makers(free).size >= 2 && makers(premium).size >= 2);
}
