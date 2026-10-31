/**
 * The private preview's reviewed DeepInfra model rows (contract A §1, 2026-10-10).
 *
 * Plain words: the preview may call exactly these models, each at its own list price, with its
 * own largest answer size ("output bound"), its own reviewed thinking-level menu and its own
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
 * row sends and both the app's guarded fetch and the gate require exactly. Qwen and (since the owner's approval of
 * 2026-10-12) MiMo have one; a later row's is one more `sampling` entry here, in the gate's row and in the parity file.
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

/**
 * Spec 2026-10-12 §4.1: the thinking-level words, the same in the owner's setting, the app, the gate and the records.
 * "default" sends no effort member at all (the vendor's own default); "none" asks DeepInfra to switch thinking off;
 * "low" / "medium" / "high" are DeepInfra's `reasoning_effort` or Anthropic's `output_config.effort`.
 */
export const PREVIEW_EFFORT_WORDS = Object.freeze(["default", "none", "low", "medium", "high"] as const);
/** Spec 2026-10-12 §4.1: one thinking-level word (see PREVIEW_EFFORT_WORDS). */
export type PreviewEffort = typeof PREVIEW_EFFORT_WORDS[number];

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
  /**
   * A STANDARD call's largest max_tokens (every debate step, the map, health checks, LG-A's structure-repair call) and
   * the output side of its reservation. LG-B (L26, L29): a final-writer call, only when the row's gate offers that tier,
   * may ask up to `finalWriterOutputBound`, and the gate reserves it at that bound (Task 5).
   */
  outputBound: number;
  /**
   * Length guidance L26: the model's own maximum output, as its vendor documents it: the largest max_tokens a final-writer
   * call may send and the output side of its reservation. At least `outputBound`, at most 1,048,576 (the gate's
   * MAX_OUTPUT_BOUND). A change is a reviewed row change here, in the gate's row and in the parity file's `final_writer`.
   */
  finalWriterOutputBound: number;
  /**
   * The max_tokens the preview's storyteller asks for on its first attempt (previewStorytellerTokenCeiling) when its
   * gate offers the final-writer tier. Length guidance L26 / owner answer 7 (2026-10-15): a fast row asks its own
   * maximum (`finalWriterOutputBound`, so above `outputBound`); a slow row keeps 16,384, and its length retry stays held
   * to `outputBound` (previewStorytellerOutputCap). When the gate does not offer the tier, the storyteller is a STANDARD
   * call: it asks this, held to `outputBound`. Never below the generation floor (8,192). Final review (2026-10-16,
   * Important 3, provisional owner ruling): it also names the slow row (at most `outputBound`, deviation 8), whose
   * answer writer, answer checker and story checker ask this same first ceiling, their retry held to `outputBound`.
   * Slow answer (owner ruling 2026-10-12): 16,384 on the slower rows (MiMo, Qwen, GLM), whose story at 17 tokens a
   * second could otherwise run past the gate's 1,200 s. App only: the gate checks a STANDARD max_tokens against
   * `outputBound` and a final writer's against its final-writer bound (Task 5), so the parity files do not carry it.
   */
  storytellerTokenCeiling: number;
  /**
   * The max_tokens the preview's story checker asks for at least (previewStoryCheckerTokenCeiling): the generation
   * floor (8,192) unless the row says more; its length retry asks twice it, held to `outputBound` on a STANDARD call
   * and to `finalWriterOutputBound` when the gate offers the final-writer tier (LG-B, L26). Story wording
   * (practice debate 2, 2026-10-12): at 8,192 MiMo's thinking stopped at exactly 4,916 reasoning tokens on both of its
   * story checks, and on the second its unfinished thinking ran on in the answer after the JSON verdict until
   * max_tokens; at 16,384 (its length retry) it finished. App only, like `storytellerTokenCeiling`.
   */
  storyCheckerTokenCeiling: number;
  /**
   * Spec 2026-10-12 §4.1: the reviewed thinking-level menu, only levels the model's maker documents (GLM has no
   * "medium": an unknown word runs its maximum). The first entry is `defaultEffort`. The gate holds the same menu.
   */
  efforts: readonly PreviewEffort[];
  /** The level this row runs at when the owner's setting names none: exactly today's request. */
  defaultEffort: PreviewEffort;
  /**
   * Length guidance L25 (spec 2026-10-15 §3.3): the same levels as `efforts`, strongest first, as each maker documents
   * them ("default" is the maker's own default: GLM's high, MiMo's thinking on, Qwen's xhigh). A retry after thinking ate
   * the answer's room runs one place lower (previewThinkingLevelBelow). App only: the gate checks a level's menu, not its order.
   */
  effortsByStrength: readonly PreviewEffort[];
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
 * A STANDARD call's request body cap (contract A §2). Owner ruling 2026-10-10 (evening): a HARD cap of 256 KiB,
 * because a story request at the "high" story size reaches about 236 KiB (the largest ordinary request seen was about
 * 51 KB). LG-B (L29): every call but the four final writers keeps it (the gateway refuses a larger body before anything
 * is sent); a final writer, only when its gate offers that tier, may send up to 1 MiB
 * (PREVIEW_CALL_TIER_LIMITS.FINAL_WRITER), reserved by the gate at the tier's bound (Task 5).
 */
export const PREVIEW_REQUEST_BODY_MAX_BYTES = 256 * 1024;
/**
 * Length guidance L26/L29 (owner answers 4 and 7, 2026-10-15): the preview's two kinds of call. FINAL_WRITER is the
 * answer writer, the answer checker, the storyteller and the story checker: a request of up to 1 MiB, each model's own
 * maximum output (`finalWriterOutputBound`), and the gate's own per-call money cap ($0.75; $1.00 on the Anthropic gate,
 * whose one row is Claude Haiku). Every other call is STANDARD: 256 KiB, the row's `outputBound`, $0.25 — today's caps.
 * The gates hold the same caps (preview_budget_helper.py, final_writer_*); a change is a reviewed change on both sides.
 */
export type PreviewCallTier = "STANDARD" | "FINAL_WRITER";
export const PREVIEW_CALL_TIER_LIMITS = Object.freeze({
  STANDARD: Object.freeze({ requestBodyMaxBytes: PREVIEW_REQUEST_BODY_MAX_BYTES,
    perCallCapUsd: Object.freeze({ deepinfra: "0.25", anthropic: "0.25" }) }),
  FINAL_WRITER: Object.freeze({ requestBodyMaxBytes: 1024 * 1024,
    perCallCapUsd: Object.freeze({ deepinfra: "0.75", anthropic: "1.00" }) })
});
/**
 * Owner ruling 2026-10-10: every reviewed row's STANDARD answer cap (`outputBound`: a standard call's max_tokens ceiling
 * and the output side of its reservation). Debate calls and health checks ask for 8,192. LG-B (L26): the four final
 * writers, when the gate offers that tier, ask up to the row's own maximum (`finalWriterOutputBound`), reserved at that
 * bound; a slow row's storyteller asks PREVIEW_SLOW_STORY_TOKENS (slow answer, owner ruling 2026-10-12) and its retry is
 * held to this cap.
 */
const PREVIEW_ANSWER_CAP_TOKENS = 32_768;
/** Slow answer (owner ruling 2026-10-12): the slower rows' story allowance, half the answer cap. */
const PREVIEW_SLOW_STORY_TOKENS = 16_384;
/** The preview's generation floor (preview-test.ts PREVIEW_GLM_GENERATION_TOKEN_FLOOR): no story allowance below it. */
const PREVIEW_STORY_TOKENS_FLOOR = 8192;
/** Template allowance added to the body's bytes on the input side of a reservation (contract A §3). */
const PREVIEW_RESERVATION_TEMPLATE_BYTES = 2048;

type RowInput = Readonly<{
  model: string; maker: string; inputUsdPerM: string; outputUsdPerM: string;
  outputBound: number; finalWriterOutputBound: number; storytellerTokenCeiling: number; storyCheckerTokenCeiling?: number;
  efforts: readonly PreviewEffort[];
  effortsByStrength: readonly PreviewEffort[];
  jsonObject: boolean; contextWindowTokens?: number;
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
  const { upperStep, sampling, cacheWriteInputUsdPerM, efforts, effortsByStrength, ...plain } = input;
  // Spec 2026-10-12 §4.1: a non-empty menu of distinct level words; the Anthropic wire has no "default" or "none".
  if (efforts.length === 0 || new Set(efforts).size !== efforts.length
    || efforts.some(word => !(PREVIEW_EFFORT_WORDS as readonly string[]).includes(word))
    || (provider === "anthropic" && efforts.some(word => word === "default" || word === "none"))) {
    throw new TypeError("PREVIEW_MODEL_ROW_EFFORTS_INVALID");
  }
  // L25: the strength order holds exactly the menu's levels, each once.
  if (effortsByStrength.length !== efforts.length || new Set(effortsByStrength).size !== effortsByStrength.length
    || effortsByStrength.some(word => !efforts.includes(word))) {
    throw new TypeError("PREVIEW_MODEL_ROW_EFFORT_ORDER_INVALID");
  }
  // Length guidance L26: the model's own maximum, never below the row's standard bound, never above the gate's outer bound.
  if (!Number.isSafeInteger(input.finalWriterOutputBound) || input.finalWriterOutputBound < input.outputBound
    || input.finalWriterOutputBound > 1024 * 1024) {
    throw new TypeError("PREVIEW_MODEL_ROW_FINAL_WRITER_BOUND_INVALID");
  }
  // The storyteller's allowance is a whole number of tokens within the row's own maximum (a fast row asks it all, a slow
  // row keeps 16,384) and not below the generation floor every preview call keeps.
  if (!Number.isSafeInteger(input.storytellerTokenCeiling) || input.storytellerTokenCeiling > input.finalWriterOutputBound
    || input.storytellerTokenCeiling < PREVIEW_STORY_TOKENS_FLOOR) {
    throw new TypeError("PREVIEW_MODEL_ROW_STORYTELLER_CEILING_INVALID");
  }
  // The story checker's allowance obeys the same bounds; a row that names none keeps the generation floor.
  const storyCheckerTokenCeiling = input.storyCheckerTokenCeiling ?? PREVIEW_STORY_TOKENS_FLOOR;
  if (!Number.isSafeInteger(storyCheckerTokenCeiling) || storyCheckerTokenCeiling > input.outputBound
    || storyCheckerTokenCeiling < PREVIEW_STORY_TOKENS_FLOOR) {
    throw new TypeError("PREVIEW_MODEL_ROW_STORY_CHECKER_CEILING_INVALID");
  }
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
    efforts: Object.freeze([...efforts]),
    defaultEffort: efforts[0]!,
    effortsByStrength: Object.freeze([...effortsByStrength]),
    ...(sampling === undefined ? {} : { sampling: Object.freeze(Object.fromEntries(
      PREVIEW_SAMPLING_KEYS.filter(key => Object.hasOwn(sampling, key)).map(key => [key, sampling[key]!]))) as PreviewSampling }),
    ...(upperStep === undefined ? {} : { upperStep: Object.freeze({ ...upperStep,
      inputNanoUsdPerToken: nano(upperStep.inputUsdPerM), outputNanoUsdPerToken: nano(upperStep.outputUsdPerM),
      ...(upperStep.cacheWriteInputUsdPerM === undefined ? {} : { cacheWriteInputNanoUsdPerToken: nano(upperStep.cacheWriteInputUsdPerM) }) }) }),
    ...(cacheWriteInputUsdPerM === undefined ? {} : { cacheWriteInputUsdPerM, cacheWriteInputNanoUsdPerToken: nano(cacheWriteInputUsdPerM) }),
    storyCheckerTokenCeiling,
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
    // Thinking levels (spec 2026-10-12 §2): Z.AI documents low, high and max only, and thinking cannot be switched off.
    // L26: DeepInfra's max_output_tokens 131,072 (api.deepinfra.com/models/zai-org/GLM-5.3-Flash, read 2026-10-15).
    row("deepinfra", { model: "zai-org/GLM-5.3-Flash", maker: "Z.AI", inputUsdPerM: "0.15", outputUsdPerM: "0.50",
      outputBound: PREVIEW_ANSWER_CAP_TOKENS, finalWriterOutputBound: 128 * 1024, storytellerTokenCeiling: PREVIEW_SLOW_STORY_TOKENS, efforts: ["high", "low"],
      effortsByStrength: ["high", "low"], jsonObject: true }),
    // Thinking levels (spec 2026-10-12 §2): DeepSeek documents none, low, high and max ("medium" is treated as high).
    // L26: DeepInfra's max_output_tokens 131,072 (…/deepseek-ai/DeepSeek-V4.1-Flash, read 2026-10-15); a fast storyteller asks it all.
    row("deepinfra", { model: "deepseek-ai/DeepSeek-V4.1-Flash", maker: "DeepSeek", inputUsdPerM: "0.20", outputUsdPerM: "0.60",
      outputBound: PREVIEW_ANSWER_CAP_TOKENS, storytellerTokenCeiling: 128 * 1024, finalWriterOutputBound: 128 * 1024, efforts: ["high", "low", "none"],
      effortsByStrength: ["high", "low", "none"], jsonObject: false }),
    // Owner approval 2026-10-12: in a live practice run MiMo closed Romanian quotation marks („…) with a straight double
    // quote inside its JSON (nine times in one judging reply), then wrote a second JSON answer in the same reply. Its
    // DeepInfra page recommends temperature 1.0, top_p 0.95; owner ruling 2026-10-12 (reply language): temperature 0.7,
    // after MiMo wrote 10 of its 71 practice replies at 1.0 in another language than the question's. Every request
    // carries those two sampling members (no top_k).
    // JSON mode was tried the same day and withdrawn (owner, 2026-10-12): when MiMo closed a „ quote with a straight
    // double quote, DeepInfra's JSON constraint ended the string there and forced the rest into garbage (a 141-character
    // reply with 11 issues), while without JSON mode the engine's reader (INNER_QUOTE) repairs that exact slip with no call.
    // Thinking levels (spec 2026-10-12 §2): Xiaomi documents thinking on or off only, no levels.
    // L26: DeepInfra lists no max_output_tokens (null, …/XiaomiMiMo/MiMo-V2.6-Pro, read 2026-10-15); its max_new_tokens default is at most 65,536, the careful figure until Xiaomi's own page is read. A slow storyteller (owner answer 7).
    row("deepinfra", { model: "XiaomiMiMo/MiMo-V2.6-Pro", maker: "Xiaomi", inputUsdPerM: "0.43", outputUsdPerM: "0.87",
      outputBound: PREVIEW_ANSWER_CAP_TOKENS, finalWriterOutputBound: 64 * 1024, storytellerTokenCeiling: PREVIEW_SLOW_STORY_TOKENS,
      // Story wording (practice debate 2, 2026-10-12): room for its thinking as the story checker (see the field).
      storyCheckerTokenCeiling: PREVIEW_SLOW_STORY_TOKENS, efforts: ["default", "none"],
      effortsByStrength: ["default", "none"], jsonObject: false,
      sampling: { temperature: 0.7, top_p: 0.95 } }),
    // Owner swap 2026-10-10: Qwen3.8-Flash on DeepInfra (flat rate across its 1,000,000-token window).
    // Reviewed sampling 2026-10-12: at DeepInfra's defaults (temperature 1, top_p 1, top_k off) it slid mid-answer into
    // random multilingual tokens in a live practice run (2 of its first 4 calls unreadable). It thinks by default, so
    // it runs at its makers' thinking-mode settings: temperature 0.6, top_p 0.95, top_k 20.
    // Thinking levels (spec 2026-10-12 §2): Alibaba documents low, medium and xhigh (its default); "high" is not a Qwen value.
    // L26: DeepInfra's max_output_tokens 131,072 (…/Qwen/Qwen3.8-Flash, read 2026-10-15).
    row("deepinfra", { model: "Qwen/Qwen3.8-Flash", maker: "Alibaba", inputUsdPerM: "0.113", outputUsdPerM: "0.382",
      outputBound: PREVIEW_ANSWER_CAP_TOKENS, finalWriterOutputBound: 128 * 1024, storytellerTokenCeiling: PREVIEW_SLOW_STORY_TOKENS, efforts: ["default", "low", "medium", "none"],
      effortsByStrength: ["default", "medium", "low", "none"], jsonObject: false,
      contextWindowTokens: 1_000_000,
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
    // Thinking levels (spec 2026-10-12 §2): Anthropic documents low, medium, high, xhigh and max for Haiku 5.5.
    // L26: "Max output: 128K tokens" on the synchronous Messages API (platform.claude.com/docs/en/models/haiku-5-5/overview, read 2026-10-15). A full 1 MiB cached final-writer call holds (1,050,624 x 0.625 + 128,000 x 2.50) / 1e6 = $0.97664, under its gate's $1.00 (owner answer 4).
    row("anthropic", { model: "claude-haiku-5-5", maker: "Anthropic", inputUsdPerM: "0.10", outputUsdPerM: "0.50",
      outputBound: PREVIEW_ANSWER_CAP_TOKENS, storytellerTokenCeiling: 128 * 1000, finalWriterOutputBound: 128 * 1000, efforts: ["high", "medium", "low"],
      effortsByStrength: ["high", "medium", "low"], jsonObject: false,
      cacheWriteInputUsdPerM: "0.125",
      upperStep: { aboveChargedInputTokens: 100_000, inputUsdPerM: "0.50", outputUsdPerM: "2.50", cacheWriteInputUsdPerM: "0.625" } })
  ])
});
/**
 * Owner answer F4 (2026-10-30): the price steps Anthropic bills a Claude Haiku 5.5 call at, as the person's quota now
 * counts them: plain input, the 5-minute and 1-hour cache writes, the cache read, and the output, up to 100,000 prompt
 * tokens and above (the prompt counts every input token, cache reads and writes included). Verified 2026-10-30 against
 * platform.claude.com/docs/en/about-claude/pricing (model table: "Claude Haiku 5.5 (for prompts up to 100,000 tokens)
 * $0.10, $0.125, $0.20, $0.01, $0.50"; "(for prompts over 100,000 tokens) $0.50, $0.625, $1, $0.05, $2.50"; the
 * multipliers 1.25x, 2x, 0.1x; "A request's prompt length counts all of its input tokens, including cache reads and
 * cache writes") and .../build-with-claude/prompt-caching ("By default, the cache has a 5-minute lifetime. The cache is
 * refreshed for no additional cost each time the cached content is used"; measured from the start of the request).
 * The gate settles at the same steps (preview_budget_helper.py AnthropicProfile.settlement_steps), and the parity file
 * tests/unit/fixtures/preview-model-rows-anthropic.json (`settlement_steps`) holds them; a test keeps the three equal.
 */
export const PREVIEW_ANTHROPIC_SETTLEMENT_STEPS = Object.freeze([
  Object.freeze({ promptTokensUpTo: 100_000 as number | null, inputUsdPerM: "0.10", cacheWrite5mUsdPerM: "0.125",
    cacheWrite1hUsdPerM: "0.20", cacheReadUsdPerM: "0.01", outputUsdPerM: "0.50" }),
  Object.freeze({ promptTokensUpTo: null as number | null, inputUsdPerM: "0.50", cacheWrite5mUsdPerM: "0.625",
    cacheWrite1hUsdPerM: "1.00", cacheReadUsdPerM: "0.05", outputUsdPerM: "2.50" })
]);

/** USD per million with two or three decimals, in micro-units per million tokens (0.125 -> 125,000). */
function microsPerMillion(usdPerM: string): number {
  const match = /^(\d+)\.(\d{2,3})$/u.exec(usdPerM);
  if (match === null) throw new TypeError("PREVIEW_MODEL_ROW_PRICE_INVALID");
  return (Number(match[1]) * 1000 + Number(match[2]!.padEnd(3, "0"))) * 1000;
}

/**
 * F4: the real prices the quota charges a reviewed row's calls at (the shape of `@debateai/budget`'s
 * `ProviderTargetPrice.vendorPrices`, structurally: this file imports nothing), or undefined for a row whose vendor
 * bills every prompt token alike (DeepInfra: its cached tokens are charged at the full input price, never less).
 */
export function previewVendorPrices(row: PreviewModelRow): Readonly<{
  lower: Readonly<{ cacheWriteMicrosPerMillionTokens: number; cacheWriteOneHourMicrosPerMillionTokens: number; cacheReadMicrosPerMillionTokens: number }>;
  upper: Readonly<{ abovePromptTokens: number; inputMicrosPerMillionTokens: number; outputMicrosPerMillionTokens: number;
    cacheWriteMicrosPerMillionTokens: number; cacheWriteOneHourMicrosPerMillionTokens: number; cacheReadMicrosPerMillionTokens: number }>;
}> | undefined {
  if (row.provider !== "anthropic") return undefined;
  const [lower, upper] = PREVIEW_ANTHROPIC_SETTLEMENT_STEPS;
  // The row's own prices are the lower step's: a drift here is a reviewed change that must move both.
  if (lower!.inputUsdPerM !== row.inputUsdPerM || lower!.outputUsdPerM !== row.outputUsdPerM
    || lower!.cacheWrite5mUsdPerM !== row.cacheWriteInputUsdPerM || row.upperStep === undefined
    || lower!.promptTokensUpTo !== row.upperStep.aboveChargedInputTokens || upper!.inputUsdPerM !== row.upperStep.inputUsdPerM
    || upper!.outputUsdPerM !== row.upperStep.outputUsdPerM || upper!.cacheWrite5mUsdPerM !== row.upperStep.cacheWriteInputUsdPerM) {
    throw new TypeError("PREVIEW_SETTLEMENT_STEPS_DRIFT");
  }
  const cache = (step: typeof lower) => ({
    cacheWriteMicrosPerMillionTokens: microsPerMillion(step!.cacheWrite5mUsdPerM),
    cacheWriteOneHourMicrosPerMillionTokens: microsPerMillion(step!.cacheWrite1hUsdPerM),
    cacheReadMicrosPerMillionTokens: microsPerMillion(step!.cacheReadUsdPerM)
  });
  return Object.freeze({
    lower: Object.freeze(cache(lower)),
    upper: Object.freeze({ abovePromptTokens: lower!.promptTokensUpTo!, inputMicrosPerMillionTokens: microsPerMillion(upper!.inputUsdPerM),
      outputMicrosPerMillionTokens: microsPerMillion(upper!.outputUsdPerM), ...cache(upper) })
  });
}

/**
 * F4: the price a target's calls are CHARGED at — its declared price, plus, on the preview, the vendor's real prices of
 * its reviewed row (`previewVendorPrices`) when that vendor bills the cache and the prompt's size (Anthropic). The
 * runner and the practice runner both build their money seams' price with it, so the two cannot drift.
 */
export function previewTargetChargePrice<P extends Readonly<{ inputMicrosPerMillionTokens: number; outputMicrosPerMillionTokens: number }>>(
  previewOn: boolean,
  target: Readonly<{ baseUrl: string; model: string }>,
  price: P | null
): (P & Readonly<{ vendorPrices?: NonNullable<ReturnType<typeof previewVendorPrices>> }>) | null {
  if (price === null || !previewOn) return price;
  const reviewed = previewModelRowForEndpoint(target.baseUrl, target.model);
  const vendorPrices = reviewed === undefined ? undefined : previewVendorPrices(reviewed);
  return vendorPrices === undefined ? price : Object.freeze({ ...price, vendorPrices });
}

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
    ...(reviewed.defaultEffort === "default" ? {} : { thinking_parameter: "reasoning_effort", thinking_levels: Object.freeze([reviewed.defaultEffort]) }),
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
 * Contract A §3: ((body bytes + 2048) x input + output bound x output), in nano-USD, at the row's prices, or at its upper
 * step's when the charged input tokens are above that step's threshold. Prompt caching (2026-10-12): a request that asks
 * for a cache write prices its whole input at that step's 5-minute cache-write price instead, exactly as the gate's
 * AnthropicProfile.reservation_prices does. Length guidance L29 (LG-B): the output bound is the TIER's — the row's
 * `outputBound` for a standard call (today's figure), its `finalWriterOutputBound` for a final writer — never the
 * request's own max_tokens: a vendor may report thinking outside its output count, so the hold stays the whole bound.
 */
export function previewReservationNanoUsd(reviewed: PreviewModelRow, bodyBytes: number,
  options: Readonly<{ cacheWrite?: boolean; tier?: PreviewCallTier }> = {}): bigint {
  const tokens = previewChargedInputTokens(bodyBytes);
  const step = reviewed.upperStep !== undefined && tokens > BigInt(reviewed.upperStep.aboveChargedInputTokens)
    ? reviewed.upperStep : reviewed;
  const input = options.cacheWrite === true ? step.cacheWriteInputNanoUsdPerToken : step.inputNanoUsdPerToken;
  if (input === undefined) throw new TypeError("PREVIEW_MODEL_ROW_CANNOT_CACHE");
  return tokens * input + BigInt(previewTierOutputBound(reviewed, options.tier ?? "STANDARD")) * step.outputNanoUsdPerToken;
}

/** L26/L29: the output bound of a call of this tier on this row. */
export function previewTierOutputBound(row: PreviewModelRow, tier: PreviewCallTier): number {
  return tier === "FINAL_WRITER" ? row.finalWriterOutputBound : row.outputBound;
}

/** Owner answer 7: a slow storyteller's length retry stays held to `outputBound`; a fast one's to its own maximum. */
export function previewStorytellerOutputCap(row: PreviewModelRow): number {
  return row.storytellerTokenCeiling > row.outputBound ? row.finalWriterOutputBound : row.outputBound;
}

/**
 * LG-B deviation 2: the tier the guarded fetch declares for a body it can only read: FINAL_WRITER when the body is over a
 * standard call's caps (its bytes, or a whole-number max_tokens above the row's `outputBound`). Only the preview call
 * policy can make such a body (the gateway's packetByteCap/outputTokenCap), so no other call reaches this tier.
 */
export function previewCallTierOfBody(row: PreviewModelRow, bodyBytes: number, maxTokens: unknown): PreviewCallTier {
  return bodyBytes > PREVIEW_CALL_TIER_LIMITS.STANDARD.requestBodyMaxBytes
    || (typeof maxTokens === "number" && Number.isSafeInteger(maxTokens) && maxTokens > row.outputBound) ? "FINAL_WRITER" : "STANDARD";
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
