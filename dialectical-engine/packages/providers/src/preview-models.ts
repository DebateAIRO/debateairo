/**
 * The private preview's reviewed DeepInfra model rows (contract A §1, 2026-10-10).
 *
 * Plain words: the preview may call exactly these models, each at its own list price, with its
 * own largest answer size ("output bound"), its own thinking switch ("effort") and its own
 * JSON-answer switch. The root gate holds the same table in Python; a parity test reads
 * tests/unit/fixtures/preview-model-rows.json so the two copies cannot drift. Changing a row is a
 * reviewed code change on both sides, never a configuration edit.
 *
 * No imports on purpose: index.ts, preview-test.ts and provider-probe.ts all read these rows.
 */
export type PreviewModelRow = Readonly<{
  model: string;
  maker: string;
  /** Vendor list price in USD per million tokens, as the decimal string the gate reads. */
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
  /** "high": the body carries exactly reasoning_effort "high"; null: the body never carries it. */
  effort: "high" | null;
  /** Whether response_format {"type":"json_object"} may be sent. */
  jsonObject: boolean;
}>;

/** The preview connection's one base URL and window, shared by every row. */
export const PREVIEW_DEEPINFRA_BASE_URL = "https://api.deepinfra.com/v1/openai" as const;
export const PREVIEW_CONTEXT_WINDOW_TOKENS = 1_048_576 as const;
/** Request bodies above this are refused before any reservation (contract A §2). */
export const PREVIEW_REQUEST_BODY_MAX_BYTES = 256 * 1024;
/** Template allowance added to the body's bytes on the input side of a reservation (contract A §3). */
export const PREVIEW_RESERVATION_TEMPLATE_BYTES = 2048;

function row(input: Readonly<{
  model: string; maker: string; inputUsdPerM: string; outputUsdPerM: string;
  outputBound: number; effort: "high" | null; jsonObject: boolean;
}>): PreviewModelRow {
  const nano = (usdPerM: string): bigint => {
    const match = /^(\d+)\.(\d{2})$/u.exec(usdPerM);
    if (match === null) throw new TypeError("PREVIEW_MODEL_ROW_PRICE_INVALID");
    return BigInt(match[1]!) * 1000n + BigInt(match[2]!) * 10n;
  };
  const inputNanoUsdPerToken = nano(input.inputUsdPerM);
  const outputNanoUsdPerToken = nano(input.outputUsdPerM);
  return Object.freeze({
    ...input,
    inputNanoUsdPerToken,
    outputNanoUsdPerToken,
    inputPriceMicrosPerMillion: Number(inputNanoUsdPerToken) * 1000,
    outputPriceMicrosPerMillion: Number(outputNanoUsdPerToken) * 1000
  });
}

export const PREVIEW_MODEL_ROWS: readonly PreviewModelRow[] = Object.freeze([
  row({ model: "zai-org/GLM-5.3-Flash", maker: "Z.AI", inputUsdPerM: "0.15", outputUsdPerM: "0.50",
    outputBound: 163_840, effort: "high", jsonObject: true }),
  row({ model: "deepseek-ai/DeepSeek-V4.1-Flash", maker: "DeepSeek", inputUsdPerM: "0.20", outputUsdPerM: "0.60",
    outputBound: 131_072, effort: "high", jsonObject: false }),
  row({ model: "XiaomiMiMo/MiMo-V2.6-Pro", maker: "Xiaomi", inputUsdPerM: "0.43", outputUsdPerM: "0.87",
    outputBound: 131_072, effort: null, jsonObject: false })
]);

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
  "preview:mimo-v2-6-pro": "XiaomiMiMo/MiMo-V2.6-Pro"
});
/** The reviewed provider set, in register order. */
export const PREVIEW_REVIEWED_PROVIDER_REFS = Object.freeze(Object.keys(PREVIEW_PROVIDER_REF_MODELS));

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
    provider_ref: providerRef, base_url: PREVIEW_DEEPINFRA_BASE_URL, model: reviewed.model,
    input_price_micros_per_million: reviewed.inputPriceMicrosPerMillion,
    output_price_micros_per_million: reviewed.outputPriceMicrosPerMillion,
    ...(reviewed.effort === null ? {} : { thinking_parameter: "reasoning_effort", thinking_levels: Object.freeze([reviewed.effort]) }),
    context_window_tokens: PREVIEW_CONTEXT_WINDOW_TOKENS
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

/** The two-maker rule (contract A §6/§7): with two or more makers in the union, each roster names two or more. */
export function previewRostersHonourMakerRule(free: readonly string[], premium: readonly string[]): boolean {
  const makers = (ids: readonly string[]) => new Set(ids.map((id) => previewModelRow(id)?.maker));
  return makers([...free, ...premium]).size < 2 || (makers(free).size >= 2 && makers(premium).size >= 2);
}
