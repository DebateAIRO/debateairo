/**
 * V-28 (finding DL4-F2) — THE SPENDING CEILING, IN MONEY.
 *
 * Everything in this file is pure arithmetic and pure decision. It holds no
 * pool, opens no socket and knows nothing about a deployment mode, so the
 * provider gateway can be given a SEAM (`assertCallAllowed` / `recordCall`)
 * without `@debateai/providers` taking a dependency on the ledger, and so every
 * rule below is testable without a database.
 *
 * MONEY IS AN INTEGER, ALWAYS. The unit is one USD micro-unit — 1e-6 of a US
 * dollar — chosen because it is small enough that a per-token price is a whole
 * number for every vendor quoted in dollars per million tokens, and because an
 * integer sum is exact at any length. A float would drift, and a drifting
 * ceiling is not a ceiling. `x_cost_usd`, the OpenAI-compatible extension some
 * vendors return, IS a float: it is deliberately not the charge here. It stays
 * on the raw artifact's metadata for reconciliation, and the charge is the one
 * V-28 rules — vendor-reported TOKENS times the price configured with the
 * target.
 *
 * Every division rounds UP. A rounding error can then only ever make the run
 * stop EARLIER than the truth, never later, which is the direction a spending
 * ceiling must fail in.
 */
import { TypedDomainError } from "@debateai/kernel";

/** The fixed small unit: 1 USD = 1 000 000 micro-units. */
export const COST_MICROS_PER_USD = 1_000_000 as const;

/**
 * One currency, named once. V-28's envelopes are quoted in money and every
 * vendor this deployment reaches quotes in US dollars; a second currency is a
 * conversion rate, which is a rate nobody has sealed. A row naming anything
 * else is refused rather than converted.
 */
export const COST_ENVELOPE_CURRENCY = "USD" as const;

/** The refusal a gateway call gets when its own run's money envelope is spent. */
export const RUN_COST_ENVELOPE_MONEY_REACHED = "RUN_COST_ENVELOPE_MONEY_REACHED" as const;

/** The refusal a NEW run gets when the application's day is spent. */
export const DAILY_COST_ENVELOPE_REACHED = "DAILY_COST_ENVELOPE_REACHED" as const;

/**
 * A hosted vendor that returned an answer with no usage figures. Its cost
 * cannot be bounded, so the answer is refused rather than charged as zero.
 *
 * Deliberately NOT task 12's `SUPPORT_MODEL_COST_UNREPORTED`: that code belongs
 * to the support chat's own accounting on `support` rows, and the two surfaces
 * refuse separately so an operator reading a log can tell which one spoke.
 */
export const PROVIDER_USAGE_UNREPORTED = "PROVIDER_USAGE_UNREPORTED" as const;

/**
 * How many bytes of a serialised request packet are assumed to be ONE token
 * when a call's maximum charge is projected BEFORE it is made.
 *
 * Vendor usage is only known after the response, so "refuse the call that WOULD
 * cross" is decided on the sum so far plus this call's configured maximum. Real
 * tokenizers average about 3.5-4 bytes per token for English and about 2.5 for
 * Romanian written with its diacritics; two is below both, so the projection is
 * a deliberate OVER-estimate and the envelope can only refuse early.
 */
export const PROJECTED_INPUT_BYTES_PER_TOKEN = 2 as const;

/**
 * A provider target's price, as configured with the target itself (V-28: "each
 * provider target carries its price for input and output tokens"). Integers, in
 * micro-units per MILLION tokens — the unit every vendor publishes.
 */
export interface ProviderTargetPrice {
  readonly inputMicrosPerMillionTokens: number;
  readonly outputMicrosPerMillionTokens: number;
}

/** Vendor-reported token counts, already separated into the two priced sides. */
export interface ReportedUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

const TOKENS_PER_MILLION = 1_000_000n;

function assertCountedInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError(code);
  }
  return value;
}

/**
 * `ceil(count * pricePerMillion / 1e6)`, computed in BigInt and only then
 * narrowed. The plain-number product of a bounded usage counter (2^31-1) and a
 * high price passes 2^53, where a `number` silently stops being exact; the
 * BigInt path keeps every digit and the narrowing REFUSES rather than rounds if
 * the result could not be represented.
 */
function ceilDivToMicros(count: number, pricePerMillion: number): number {
  const product = BigInt(count) * BigInt(pricePerMillion);
  const micros = (product + TOKENS_PER_MILLION - 1n) / TOKENS_PER_MILLION;
  const narrowed = Number(micros);
  if (!Number.isSafeInteger(narrowed)) throw new TypeError("COST_ENVELOPE_CHARGE_UNREPRESENTABLE");
  return narrowed;
}

function assertPrice(price: ProviderTargetPrice): void {
  assertCountedInteger(price?.inputMicrosPerMillionTokens, "COST_ENVELOPE_PRICE_INVALID");
  assertCountedInteger(price?.outputMicrosPerMillionTokens, "COST_ENVELOPE_PRICE_INVALID");
}

/**
 * What one COMPLETED call cost: vendor-reported tokens times the target's
 * configured price. This is the number that is added to the run's and the day's
 * running totals, and the only one that is.
 */
export function chargeMicrosForUsage(
  price: ProviderTargetPrice,
  usage: ReportedUsage
): number {
  assertPrice(price);
  const promptTokens = assertCountedInteger(usage?.promptTokens, "COST_ENVELOPE_USAGE_INVALID");
  const completionTokens = assertCountedInteger(
    usage?.completionTokens, "COST_ENVELOPE_USAGE_INVALID"
  );
  return ceilDivToMicros(promptTokens, price.inputMicrosPerMillionTokens)
    + ceilDivToMicros(completionTokens, price.outputMicrosPerMillionTokens);
}

/**
 * The MOST one call can cost, computed from what is known before it is sent:
 * the exact bytes of the request body, converted to tokens at the conservative
 * floor above, and the attempt's own `max_tokens` bound for the answer.
 *
 * A length retry raises `max_tokens` (W10/2), so the projection rises with it
 * and a retry that would cross is refused as readily as a first attempt.
 */
export function projectedCallCeilingMicros(
  price: ProviderTargetPrice,
  bound: Readonly<{ requestBytes: number; completionTokenCeiling: number }>
): number {
  assertPrice(price);
  const requestBytes = assertCountedInteger(bound?.requestBytes, "COST_ENVELOPE_PROJECTION_INVALID");
  const completionTokenCeiling = assertCountedInteger(
    bound?.completionTokenCeiling, "COST_ENVELOPE_PROJECTION_INVALID"
  );
  const projectedPromptTokens = Math.ceil(requestBytes / PROJECTED_INPUT_BYTES_PER_TOKEN);
  return ceilDivToMicros(projectedPromptTokens, price.inputMicrosPerMillionTokens)
    + ceilDivToMicros(completionTokenCeiling, price.outputMicrosPerMillionTokens);
}

export type RunCostEnvelopeDecision =
  | Readonly<{
      kind: "WITHIN";
      spentMicros: number;
      projectedMicros: number;
      ceilingMicros: number;
    }>
  | Readonly<{
      kind: "WOULD_CROSS";
      spentMicros: number;
      projectedMicros: number;
      ceilingMicros: number;
    }>;

/**
 * THE PER-RUN RULE, decided BEFORE the call: may this run spend up to
 * `projectedMicros` more?
 *
 * `<=` and not `<`: a run that lands exactly on its ceiling has spent what it
 * was allowed and nothing more, which is the same boundary J28 settled for the
 * attempt ceiling. The refusal belongs to the call that would take it PAST.
 */
export function decideRunCostEnvelope(input: Readonly<{
  spentMicros: number;
  projectedMicros: number;
  ceilingMicros: number;
}>): RunCostEnvelopeDecision {
  const spentMicros = assertCountedInteger(input?.spentMicros, "COST_ENVELOPE_SPEND_INVALID");
  const projectedMicros = assertCountedInteger(
    input?.projectedMicros, "COST_ENVELOPE_PROJECTION_INVALID"
  );
  const ceilingMicros = assertCountedInteger(input?.ceilingMicros, "COST_ENVELOPE_CEILING_INVALID");
  return Object.freeze({
    kind: spentMicros + projectedMicros <= ceilingMicros ? "WITHIN" : "WOULD_CROSS",
    spentMicros,
    projectedMicros,
    ceilingMicros
  });
}

export type DailyCostEnvelopeDecision =
  | Readonly<{ kind: "WITHIN"; spentMicrosToday: number; ceilingMicros: number }>
  | Readonly<{ kind: "REACHED"; spentMicrosToday: number; ceilingMicros: number }>;

/**
 * THE DAILY RULE, decided when a NEW run is asked for. V-28(2): "when reached,
 * no new run starts until the next day; running ones finish."
 *
 * `>=` and not `>`, unlike the per-run rule above, and the difference is the
 * ruling's own word REACHED: this gate is not asked "does one more call fit"
 * (nothing here knows what the next run will cost) but "has the day's ceiling
 * been reached". A run already under way is never consulted, so it finishes and
 * keeps everything it has paid for.
 */
export function decideDailyCostEnvelope(input: Readonly<{
  spentMicrosToday: number;
  ceilingMicros: number;
}>): DailyCostEnvelopeDecision {
  const spentMicrosToday = assertCountedInteger(
    input?.spentMicrosToday, "COST_ENVELOPE_SPEND_INVALID"
  );
  const ceilingMicros = assertCountedInteger(input?.ceilingMicros, "COST_ENVELOPE_CEILING_INVALID");
  return Object.freeze({
    kind: spentMicrosToday >= ceilingMicros ? "REACHED" : "WITHIN",
    spentMicrosToday,
    ceilingMicros
  });
}

/**
 * The vendor's usage block, reduced to the two figures a charge needs.
 *
 * `null` means THE VENDOR REPORTED NOTHING THIS CAN BILL — absent, null, empty,
 * or carrying only `total_tokens`. The last case is deliberate: input and output
 * are priced differently (typically 5x apart), so a single total cannot be
 * turned into money without inventing the split, and inventing it is exactly
 * the silent repair constraint 6 forbids.
 *
 * A block with one of the two sides present is BILLABLE, with the absent side
 * read as zero: a vendor that reports `prompt_tokens` and no completion count
 * has told the truth about part of the call, and charging the part it reported
 * is nearer the truth than charging nothing.
 */
export function readReportedUsage(usage: unknown): ReportedUsage | null {
  if (typeof usage !== "object" || usage === null || Array.isArray(usage)) return null;
  const row = usage as Readonly<Record<string, unknown>>;
  const prompt = row.prompt_tokens;
  const completion = row.completion_tokens;
  const promptReported = typeof prompt === "number" && Number.isInteger(prompt) && prompt >= 0;
  const completionReported = typeof completion === "number"
    && Number.isInteger(completion) && completion >= 0;
  if (!promptReported && !completionReported) return null;
  return Object.freeze({
    promptTokens: promptReported ? prompt as number : 0,
    completionTokens: completionReported ? completion as number : 0
  });
}

/** The refusal `assertCallAllowed` raises; it is short-circuited by the gateway, never retried. */
export function runCostEnvelopeReached(
  decision: Extract<RunCostEnvelopeDecision, { kind: "WOULD_CROSS" }>
): TypedDomainError {
  return new TypedDomainError(
    RUN_COST_ENVELOPE_MONEY_REACHED,
    `The run has spent ${decision.spentMicros} of ${decision.ceilingMicros} ${COST_ENVELOPE_CURRENCY} micro-units`
      + ` and the next call could cost ${decision.projectedMicros} more`
  );
}

/** The refusal a new ask gets once the application's day is spent. */
export function dailyCostEnvelopeReached(
  decision: Extract<DailyCostEnvelopeDecision, { kind: "REACHED" }>
): TypedDomainError {
  return new TypedDomainError(
    DAILY_COST_ENVELOPE_REACHED,
    `The application has spent ${decision.spentMicrosToday} of ${decision.ceilingMicros}`
      + ` ${COST_ENVELOPE_CURRENCY} micro-units today; new runs resume on the next UTC day`
  );
}

/** The refusal a hosted answer gets when its vendor reported no usage figures. */
export function providerUsageUnreported(providerRef: string): TypedDomainError {
  return new TypedDomainError(
    PROVIDER_USAGE_UNREPORTED,
    `${providerRef} returned no usage figures, so the call's cost cannot be bounded`
  );
}

/**
 * The UTC day a charge belongs to, as `YYYY-MM-DD`.
 *
 * UTC and not the host's zone: the ceiling is application-wide, the API and the
 * runner can sit in different zones, and a local midnight would reset the day
 * twice (or not at all) across a daylight-saving boundary.
 */
export function costEnvelopeDay(at: Date): string {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
    throw new TypeError("COST_ENVELOPE_DAY_INVALID");
  }
  return at.toISOString().slice(0, 10);
}
