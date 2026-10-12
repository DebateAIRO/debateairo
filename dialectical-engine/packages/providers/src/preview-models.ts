/**
 * The private preview's reviewed DeepInfra model rows (contract A §1, 2026-10-10).
 *
 * Plain words: the preview may call exactly these models, each at its own list price, with its
 * own largest answer size ("output bound"), its own "effort" thinking switch and its own
 * JSON-answer switch. Every prompt token is charged at the full input price, cached or not (the
 * cheaper cached-input price some vendors list is never used, so a reservation never undercounts).
 * The root gate holds the same table in Python; a parity test reads
 * tests/unit/fixtures/preview-model-rows.json so the two copies cannot drift. Changing a row is a
 * reviewed code change on both sides, never a configuration edit.
 *
 * Multi-model preview, PR B: the rows are kept per provider (`PREVIEW_MODEL_ROWS_BY_PROVIDER`), one
 * root gate per provider; each provider's rows have their own parity file
 * (tests/unit/fixtures/preview-model-rows.json for DeepInfra, preview-model-rows-anthropic.json for
 * Anthropic). A later provider is one more key there and one more parity file.
 *
 * Reviewed sampling (2026-10-12): a DeepInfra row may carry its own `sampling` settings, which every request for that
 * row sends and both the app's guarded fetch and the gate require exactly. Only Qwen has one today; a later row's is
 * one more `sampling` entry here, in the gate's row and in the parity file.
 *
 * No imports on purpose: index.ts, preview-test.ts and provider-probe.ts all read these rows.
 */
/** The providers the preview has a reviewed root gate for. */
export type PreviewProviderName = "deepinfra" | "anthropic";

/**
 * The sampling members a reviewed row may set, in the order a request body carries them (the gate's
 * DeepInfraProfile.sampling_keys holds the same three).
 */
export const PREVIEW_SAMPLING_KEYS = Object.freeze(["temperature", "top_p", "top_k"] as const);
export type PreviewSamplingKey = typeof PREVIEW_SAMPLING_KEYS[number];
/** A row's reviewed sampling: the exact members and values its every request carries. */
export type PreviewSampling = Readonly<Partial<Record<PreviewSamplingKey, number>>>;

export type PreviewModelRow = Readonly<{
  /** The provider (and so the root gate) this row's calls go through. */
  provider: PreviewProviderName;
  /** The target's base URL (`base_url`), exactly. */
  baseUrl: string;
  /** The register's adapter kind for this row's provider ref. */
  adapterKind: "openai-compatible-http" | "anthropic-messages-http";
  /** The context window the target declares (`context_window_tokens`). */
  contextWindowTokens: number;
  model: string;
  maker: string;
  /**
   * Vendor list price in USD per million tokens, as the decimal string the gate reads: the price
   * the estimate uses and every call reserves at (unless `upperStep` applies). For a vendor with
   * price steps (Anthropic) it is the lower step's; the gate settles at the real step and halts on
   * any overrun.
   */
  inputUsdPerM: string;
  outputUsdPerM: string;
  /**
   * A vendor's upper price step, if it has one (Anthropic: a prompt above 100,000 tokens). A call
   * whose charged input tokens (body bytes + 2048) are above `aboveChargedInputTokens` reserves at
   * these prices; at or below, its prompt cannot reach the upper step and it reserves at the row's
   * own (owner ruling 2026-10-10, evening). The gate applies the same rule (reservation_prices).
   */
  upperStep?: Readonly<{ aboveChargedInputTokens: number; inputUsdPerM: string; outputUsdPerM: string;
    inputNanoUsdPerToken: bigint; outputNanoUsdPerToken: bigint;
    /** The upper step's 5-minute cache-write price, on a row that may cache (Anthropic: 0.625). */
    cacheWriteInputUsdPerM?: string; cacheWriteInputNanoUsdPerToken?: bigint }>;
  /**
   * Prompt caching (owner approval 2026-10-12), Anthropic only: the vendor's 5-minute cache-write price for this
   * row's own (lower) step. A request that asks for a cache write (its system is the two-block form with the one
   * cache mark) reserves its WHOLE input at this price, or at its upper step's when it is above that step, exactly as
   * the gate does. The start-of-debate estimate keeps the plain input price (only the cached system prefix pays the
   * write premium, and reads cost a tenth); it sees the cached worst case through the gate's in-flight hold.
   * Absent: the row never caches.
   */
  cacheWriteInputUsdPerM?: string;
  cacheWriteInputNanoUsdPerToken?: bigint;
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
   * `reasoning_effort`, Anthropic `output_config.effort`); null: the body never carries it.
   */
  effort: "high" | null;
  /** Whether response_format {"type":"json_object"} may be sent. */
  jsonObject: boolean;
  /**
   * Reviewed sampling (2026-10-12), DeepInfra rows only: when present, every request for this row carries exactly
   * these members with exactly these values (after max_tokens and any effort member, before messages), and the
   * guarded fetch and the gate refuse a body that differs. Absent: the body carries none of PREVIEW_SAMPLING_KEYS and
   * the vendor's defaults apply.
   */
  sampling?: PreviewSampling;
}>;

/** The DeepInfra connection's base URL and window, shared by every DeepInfra row. */
export const PREVIEW_DEEPINFRA_BASE_URL = "https://api.deepinfra.com/v1/openai" as const;
/** The window of every DeepInfra row that does not state its own (GLM, DeepSeek, MiMo). */
export const PREVIEW_CONTEXT_WINDOW_TOKENS = 1_048_576 as const;
/** The Anthropic Messages connection's base URL (the adapter's one lawful base) and its exact call URL. */
export const PREVIEW_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1" as const;
export const PREVIEW_ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages" as const;
/** Claude Haiku 5.5's window (1M tokens). */
export const PREVIEW_ANTHROPIC_CONTEXT_WINDOW_TOKENS = 1_000_000 as const;
/**
 * Request bodies above this are refused before any reservation (contract A §2). Owner ruling
 * 2026-10-10 (evening): a HARD cap of 256 KiB for every row, because a story request at the "high"
 * story size reaches about 236 KiB (the largest ordinary request seen was about 51 KB).
 */
export const PREVIEW_REQUEST_BODY_MAX_BYTES = 256 * 1024;
/**
 * Owner ruling 2026-10-10: every reviewed row's answer cap (its max_tokens ceiling and the output side
 * of every reservation). Debate calls and health checks ask for 8,192; the storyteller asks for this whole
 * cap (story format robustness, 2026-10-12: its thinking counts toward max_tokens), and its retry is held to it.
 */
const PREVIEW_ANSWER_CAP_TOKENS = 32_768;
/** Template allowance added to the body's bytes on the input side of a reservation (contract A §3). */
const PREVIEW_RESERVATION_TEMPLATE_BYTES = 2048;

type RowInput = Readonly<{
  model: string; maker: string; inputUsdPerM: string; outputUsdPerM: string;
  outputBound: number; effort: "high" | null; jsonObject: boolean; contextWindowTokens?: number;
  upperStep?: Readonly<{ aboveChargedInputTokens: number; inputUsdPerM: string; outputUsdPerM: string; cacheWriteInputUsdPerM?: string }>;
  sampling?: PreviewSampling;
  cacheWriteInputUsdPerM?: string;
}>;
const PROVIDER_CONNECTIONS = Object.freeze({
  deepinfra: Object.freeze({ provider: "deepinfra", baseUrl: PREVIEW_DEEPINFRA_BASE_URL,
    adapterKind: "openai-compatible-http", contextWindowTokens: PREVIEW_CONTEXT_WINDOW_TOKENS }),
  anthropic: Object.freeze({ provider: "anthropic", baseUrl: PREVIEW_ANTHROPIC_BASE_URL,
    adapterKind: "anthropic-messages-http", contextWindowTokens: PREVIEW_ANTHROPIC_CONTEXT_WINDOW_TOKENS })
} as const);
function row(provider: PreviewProviderName, input: RowInput): PreviewModelRow {
  // USD per million with two or three decimals ("0.15", "0.113") is a whole nano-USD per token.
  const nano = (usdPerM: string): bigint => {
    const match = /^(\d+)\.(\d{2,3})$/u.exec(usdPerM);
    if (match === null) throw new TypeError("PREVIEW_MODEL_ROW_PRICE_INVALID");
    return BigInt(match[1]!) * 1000n + BigInt(match[2]!.padEnd(3, "0"));
  };
  const inputNanoUsdPerToken = nano(input.inputUsdPerM);
  const outputNanoUsdPerToken = nano(input.outputUsdPerM);
  const { upperStep, sampling, cacheWriteInputUsdPerM, ...plain } = input;
  // Only the Anthropic wire (and its gate) can carry a cache mark; a row that caches has the price on every step.
  if (cacheWriteInputUsdPerM !== undefined ? provider !== "anthropic" || (upperStep !== undefined && upperStep.cacheWriteInputUsdPerM === undefined)
    : upperStep?.cacheWriteInputUsdPerM !== undefined) {
    throw new TypeError("PREVIEW_MODEL_ROW_CACHE_INVALID");
  }
  // Only the DeepInfra wire (and its gate) knows sampling; each member is a reviewed key with a finite number, kept
  // in PREVIEW_SAMPLING_KEYS order so every body says them the same way.
  if (sampling !== undefined && (provider !== "deepinfra" || Object.keys(sampling).length === 0
    || Object.keys(sampling).some(key => !(PREVIEW_SAMPLING_KEYS as readonly string[]).includes(key))
    || Object.values(sampling).some(value => typeof value !== "number" || !Number.isFinite(value)))) {
    throw new TypeError("PREVIEW_MODEL_ROW_SAMPLING_INVALID");
  }
  return Object.freeze({
    ...PROVIDER_CONNECTIONS[provider],
    ...plain,
    ...(sampling === undefined ? {} : { sampling: Object.freeze(Object.fromEntries(
      PREVIEW_SAMPLING_KEYS.filter(key => Object.hasOwn(sampling, key)).map(key => [key, sampling[key]!]))) as PreviewSampling }),
    ...(upperStep === undefined ? {} : { upperStep: Object.freeze({ ...upperStep,
      inputNanoUsdPerToken: nano(upperStep.inputUsdPerM), outputNanoUsdPerToken: nano(upperStep.outputUsdPerM),
      ...(upperStep.cacheWriteInputUsdPerM === undefined ? {} : { cacheWriteInputNanoUsdPerToken: nano(upperStep.cacheWriteInputUsdPerM) }) }) }),
    ...(cacheWriteInputUsdPerM === undefined ? {} : { cacheWriteInputUsdPerM, cacheWriteInputNanoUsdPerToken: nano(cacheWriteInputUsdPerM) }),
    contextWindowTokens: input.contextWindowTokens ?? PROVIDER_CONNECTIONS[provider].contextWindowTokens,
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
      outputBound: PREVIEW_ANSWER_CAP_TOKENS, effort: "high", jsonObject: true }),
    row("deepinfra", { model: "deepseek-ai/DeepSeek-V4.1-Flash", maker: "DeepSeek", inputUsdPerM: "0.20", outputUsdPerM: "0.60",
      outputBound: PREVIEW_ANSWER_CAP_TOKENS, effort: "high", jsonObject: false }),
    row("deepinfra", { model: "XiaomiMiMo/MiMo-V2.6-Pro", maker: "Xiaomi", inputUsdPerM: "0.43", outputUsdPerM: "0.87",
      outputBound: PREVIEW_ANSWER_CAP_TOKENS, effort: null, jsonObject: false }),
    // Owner swap 2026-10-10: Qwen3.8-Flash on DeepInfra (flat rate across its 1,000,000-token window).
    // Reviewed sampling 2026-10-12: at DeepInfra's defaults (temperature 1, top_p 1, top_k off) it slid mid-answer into
    // random multilingual tokens in a live practice run (2 of its first 4 calls unreadable). It thinks by default, so
    // it runs at its makers' thinking-mode settings: temperature 0.6, top_p 0.95, top_k 20.
    row("deepinfra", { model: "Qwen/Qwen3.8-Flash", maker: "Alibaba", inputUsdPerM: "0.113", outputUsdPerM: "0.382",
      outputBound: PREVIEW_ANSWER_CAP_TOKENS, effort: null, jsonObject: false, contextWindowTokens: 1_000_000,
      sampling: { temperature: 0.6, top_p: 0.95, top_k: 20 } })
  ]),
  // PR B, owner ruling 2026-10-10 (evening). Estimate and reserve at the lower step ($0.10 / $0.50);
  // a call whose bytes + 2048 are above 100,000 reserves at the upper step ($0.50 / $2.50), so an
  // uncached 256 KiB call holds at most (264,192 x 0.50 + 32,768 x 2.50) / 1e6 = $0.214016.
  // Prompt caching (owner approval 2026-10-12): a request carrying the one cache mark reserves its
  // whole input at the step's 5-minute cache-write price ($0.125 / $0.625), so a cached 256 KiB call
  // holds at most (264,192 x 0.625 + 32,768 x 2.50) / 1e6 = $0.24704, under the gate's $0.25 cap.
  // The gate settles at the real step and halts on an overrun (charge_overrun).
  anthropic: Object.freeze([
    row("anthropic", { model: "claude-haiku-5-5", maker: "Anthropic", inputUsdPerM: "0.10", outputUsdPerM: "0.50",
      outputBound: PREVIEW_ANSWER_CAP_TOKENS, effort: "high", jsonObject: false, cacheWriteInputUsdPerM: "0.125",
      upperStep: { aboveChargedInputTokens: 100_000, inputUsdPerM: "0.50", outputUsdPerM: "2.50", cacheWriteInputUsdPerM: "0.625" } })
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
  "preview:qwen-3-8-flash": "Qwen/Qwen3.8-Flash",
  "preview:claude-haiku-5-5": "claude-haiku-5-5"
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

/**
 * Role rotation, Task 11 (orchestrator ruling 2026-10-11): on the preview, may the sealed answer-role ref `roleRef`
 * stand in for a rotated debate's pinned member that is unavailable at claim? Only when the debate's estimate already
 * covers it: a rotated debate's estimate prices only its panel's members, each on its own gate at that gate's dearest
 * panel member, and admission refused the debate unless every one of them was switched on at its gate (spec
 * 2026-10-11 Part 5). Task 12: the ref must itself be one of the panel's REFS, recorded with its reviewed model — a
 * second ref of a panel model (fixture-b beside fixture-a, both GLM) is a route the panel never health-checked and
 * the estimate never counted, so it is not covered. A ref the preview never reviewed is never covered.
 */
export function previewSealedRoleFallbackCovered(
  roleRef: string,
  panel: readonly Readonly<{ provider_ref: string; model_id: string }>[]
): boolean {
  const reviewed = previewModelRowForRef(roleRef);
  return reviewed !== undefined && panel.some((member) => member.provider_ref === roleRef && member.model_id === reviewed.model);
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

/** The input tokens the gate reserves for a body of `bodyBytes`: the bytes plus its 2048-token template allowance. */
export function previewChargedInputTokens(bodyBytes: number): bigint {
  if (!Number.isSafeInteger(bodyBytes) || bodyBytes < 0) throw new TypeError("PREVIEW_BODY_BYTES_INVALID");
  return BigInt(bodyBytes + PREVIEW_RESERVATION_TEMPLATE_BYTES);
}

/**
 * Contract A §3: ((body bytes + 2048) x input + output_bound x output), in nano-USD, at the row's
 * prices, or at its upper step's when the charged input tokens are above that step's threshold.
 * Prompt caching (2026-10-12): a request that asks for a cache write (`cacheWrite`, only ever on a row
 * that may cache) prices its whole input at that step's 5-minute cache-write price instead, exactly as
 * the gate's AnthropicProfile.reservation_prices does (tests/unit/fixtures/anthropic-cache-bodies.json).
 */
export function previewReservationNanoUsd(reviewed: PreviewModelRow, bodyBytes: number,
  options: Readonly<{ cacheWrite?: boolean }> = {}): bigint {
  const tokens = previewChargedInputTokens(bodyBytes);
  const step = reviewed.upperStep !== undefined && tokens > BigInt(reviewed.upperStep.aboveChargedInputTokens)
    ? reviewed.upperStep : reviewed;
  const input = options.cacheWrite === true ? step.cacheWriteInputNanoUsdPerToken : step.inputNanoUsdPerToken;
  if (input === undefined) throw new TypeError("PREVIEW_MODEL_ROW_CANNOT_CACHE");
  return tokens * input + BigInt(reviewed.outputBound) * step.outputNanoUsdPerToken;
}

/** The reviewed row for a target's own base URL and model name, if any (any provider). */
export function previewModelRowForEndpoint(baseUrl: string, model: string): PreviewModelRow | undefined {
  const reviewed = previewModelRow(model);
  return reviewed !== undefined && reviewed.baseUrl === baseUrl ? reviewed : undefined;
}

/**
 * Reviewed sampling (2026-10-12): the sampling members an OpenAI-compatible request to this exact base URL and model
 * carries — the reviewed row's `sampling`, else none (an empty object, so every other body stays byte for byte what
 * it was). Row-driven like JSON mode: it follows the endpoint and model, on the preview or off it.
 */
export function previewSamplingMembers(baseUrl: string, model: string): PreviewSampling {
  return previewModelRowForEndpoint(baseUrl, model)?.sampling ?? Object.freeze({});
}

/** The two-maker rule (contract A §6/§7): with two or more makers in the union, each roster names two or more. */
export function previewRostersHonourMakerRule(free: readonly string[], premium: readonly string[]): boolean {
  const makers = (ids: readonly string[]) => new Set(ids.map((id) => previewModelRow(id)?.maker));
  return makers([...free, ...premium]).size < 2 || (makers(free).size >= 2 && makers(premium).size >= 2);
}
