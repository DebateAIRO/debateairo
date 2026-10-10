/**
 * The private preview's Google row: its dated prices, reservation and request shape (PR C, 2026-10-10).
 *
 * Plain words: the preview may call one Google model, gemini-3.8-flash, through its own root gate
 * (the Google spending gate, on its own socket). Google's price for this model goes up on a known
 * date, so its prices are DATED. The gate reserves and settles each call at the higher of the prices
 * of its Europe/Bucharest day and of the next day. The app reserves a little more carefully still:
 * the highest price of today, tomorrow and the day after (the "lookahead"), so a call that crosses
 * midnight on its way to the gate is never held below the gate's own figure (the gate accepts a hold
 * at or above its own, up to the row's ceiling). The row's own (static) prices are the ceiling, the
 * last dated step: the engine's own cost envelope and the start-of-debate estimate use those.
 *
 * The root gate holds the same row in Python (packages/providers/ops/preview_budget_helper.py,
 * GoogleProfile, google_careful_prices); a parity test reads
 * tests/unit/fixtures/preview-google-row.json so the two copies cannot drift.
 */
import {
  PREVIEW_MODEL_ROWS_BY_PROVIDER, PREVIEW_RESERVATION_TEMPLATE_BYTES, type PreviewModelRow
} from "./preview-models.js";

/** The reviewed Google row (prices = the ceiling, $1.50 / $7.50 per million). */
export const PREVIEW_GOOGLE_MODEL_ROW: PreviewModelRow = PREVIEW_MODEL_ROWS_BY_PROVIDER.google[0]!;
/** The provider ref the preview register names the Google row by. */
export const PREVIEW_GOOGLE_PROVIDER_REF = "preview:gemini-3-8-flash" as const;
/** The day boundary the gate prices by. */
export const PREVIEW_GOOGLE_PRICE_ZONE = "Europe/Bucharest" as const;
/**
 * The largest framed request (`{"model":...,"request":<native body>}`) the guarded fetch sends the
 * Google gate: 256 KiB + 64. The engine never builds a native body over 256 KiB, and the frame adds
 * about 40 bytes, so this never refuses a call half-way through a debate. The gate has the same limit.
 */
export const PREVIEW_GOOGLE_REQUEST_BODY_MAX_BYTES = 256 * 1024 + 64;

export type PreviewGooglePrices = Readonly<{
  inputUsdPerM: string;
  outputUsdPerM: string;
  inputNanoUsdPerToken: bigint;
  outputNanoUsdPerToken: bigint;
}>;
/** One dated list price: in force from the start of `firstDay` (a Bucharest calendar day). */
export type PreviewGooglePriceStep = PreviewGooglePrices & Readonly<{ firstDay: string }>;

/** Google's list prices for gemini-3.8-flash, oldest first (read 2026-10-10). Prices only rise. */
export const PREVIEW_GOOGLE_PRICE_STEPS: readonly PreviewGooglePriceStep[] = Object.freeze([
  Object.freeze({ firstDay: "0001-01-01", inputUsdPerM: "0.75", outputUsdPerM: "3.75",
    inputNanoUsdPerToken: 750n, outputNanoUsdPerToken: 3750n }),
  Object.freeze({ firstDay: "2027-01-01", inputUsdPerM: "1.50", outputUsdPerM: "7.50",
    inputNanoUsdPerToken: 1500n, outputNanoUsdPerToken: 7500n })
]);

const BUCHAREST_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: PREVIEW_GOOGLE_PRICE_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
});

/** The Europe/Bucharest calendar day of a moment, as "YYYY-MM-DD". */
export function previewGoogleBucharestDay(moment: Date): string {
  if (!(moment instanceof Date) || !Number.isFinite(moment.getTime())) throw new TypeError("PREVIEW_GOOGLE_CLOCK_INVALID");
  const parts: Record<string, string> = {};
  for (const part of BUCHAREST_DAY.formatToParts(moment)) if (part.type !== "literal") parts[part.type] = part.value;
  const { year, month, day } = parts;
  if (year === undefined || month === undefined || day === undefined) throw new TypeError("PREVIEW_GOOGLE_CLOCK_INVALID");
  return `${year.padStart(4, "0")}-${month}-${day}`;
}

/** The calendar day `days` after "YYYY-MM-DD". */
function laterCalendarDay(day: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day);
  if (match === null) throw new TypeError("PREVIEW_GOOGLE_CLOCK_INVALID");
  const later = new Date(0);
  later.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  return later.toISOString().slice(0, 10);
}

/** The dated step in force on one calendar day. */
function pricesOn(day: string): PreviewGooglePriceStep {
  let found: PreviewGooglePriceStep | undefined;
  for (const step of PREVIEW_GOOGLE_PRICE_STEPS) if (day >= step.firstDay) found = step;
  if (found === undefined) throw new TypeError("PREVIEW_GOOGLE_CLOCK_INVALID");
  return found;
}

/** For input and for output separately, the highest step price over `days` calendar days from the moment's Bucharest day. */
function highestPricesOver(moment: Date, days: number): PreviewGooglePrices {
  const today = previewGoogleBucharestDay(moment);
  const steps = Array.from({ length: days }, (_unused, offset) => pricesOn(laterCalendarDay(today, offset)));
  const input = steps.reduce((best, step) => step.inputNanoUsdPerToken > best.inputNanoUsdPerToken ? step : best);
  const output = steps.reduce((best, step) => step.outputNanoUsdPerToken > best.outputNanoUsdPerToken ? step : best);
  return Object.freeze({
    inputUsdPerM: input.inputUsdPerM, outputUsdPerM: output.outputUsdPerM,
    inputNanoUsdPerToken: input.inputNanoUsdPerToken, outputNanoUsdPerToken: output.outputNanoUsdPerToken
  });
}

/**
 * The GATE's price for a call at `moment` (google_careful_prices): the higher of the prices of the
 * moment's Bucharest day and of the next day. On 2026-12-30 before 22:00 UTC that is $0.75 / $3.75;
 * from 22:00 UTC (midnight in Bucharest) $1.50 / $7.50.
 */
export function previewGoogleCarefulPrices(moment: Date): PreviewGooglePrices {
  return highestPricesOver(moment, 2);
}

/**
 * The APP's price for a call it sends at `moment`: the highest of today, tomorrow and the day after
 * (Bucharest days). Never below the gate's figure, even when the call reaches the gate a moment
 * after midnight; never above the row's ceiling.
 */
export function previewGoogleLookaheadPrices(moment: Date): PreviewGooglePrices {
  return highestPricesOver(moment, 3);
}

/**
 * One Google call's hold, in nano-USD: (framed request bytes + 2048) x input price + 16384 x
 * output price, at the prices given (the caller picks the moment and the rule).
 */
export function previewGoogleReservationNanoUsd(framedBytes: number, prices: PreviewGooglePrices): bigint {
  if (!Number.isSafeInteger(framedBytes) || framedBytes < 0) throw new TypeError("PREVIEW_BODY_BYTES_INVALID");
  return BigInt(framedBytes + PREVIEW_RESERVATION_TEMPLATE_BYTES) * prices.inputNanoUsdPerToken
    + BigInt(PREVIEW_GOOGLE_MODEL_ROW.outputBound) * prices.outputNanoUsdPerToken;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactlyKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
/** A lone UTF-16 surrogate cannot be sent as UTF-8; the gate refuses such a body before any reservation. */
function isSendableText(value: unknown): value is string {
  return typeof value === "string" && !/\p{Cs}/u.test(value);
}
/** Exactly one part, and that part is exactly {"text": <string>}. */
function isOneTextPart(parts: unknown): boolean {
  return Array.isArray(parts) && parts.length === 1 && isRecord(parts[0]) && hasExactlyKeys(parts[0], ["text"])
    && isSendableText(parts[0].text);
}

/**
 * The native generateContent body the Google gate accepts (GoogleProfile.body_valid), read from its
 * parsed JSON: `contents` (a non-empty list of turns, each exactly {role: "user"|"model", parts:
 * [one {text}]}, the first one the user's), an optional `systemInstruction` (exactly {parts: [one
 * {text}]}), and `generationConfig` with exactly `maxOutputTokens` (a whole number 1..16384) and
 * `thinkingConfig` exactly {thinkingLevel: "high"}. Nothing else anywhere: no tools, safety
 * settings, cache, labels, sampling, stop sequences, candidate count or JSON mode.
 */
export function previewGoogleNativeBodyValid(native: unknown): boolean {
  const row = PREVIEW_GOOGLE_MODEL_ROW;
  if (!isRecord(native) || !hasExactlyKeys(native, Object.hasOwn(native, "systemInstruction")
    ? ["contents", "generationConfig", "systemInstruction"] : ["contents", "generationConfig"])) return false;
  const contents = native.contents;
  if (!Array.isArray(contents) || contents.length < 1 || !contents.every(turn => isRecord(turn)
    && hasExactlyKeys(turn, ["role", "parts"]) && (turn.role === "user" || turn.role === "model") && isOneTextPart(turn.parts))
    || (contents[0] as Readonly<Record<string, unknown>>).role !== "user") return false;
  if (Object.hasOwn(native, "systemInstruction")) {
    const system = native.systemInstruction;
    if (!isRecord(system) || !hasExactlyKeys(system, ["parts"]) || !isOneTextPart(system.parts)) return false;
  }
  const config = native.generationConfig;
  if (!isRecord(config) || !hasExactlyKeys(config, row.effort === null ? ["maxOutputTokens"] : ["maxOutputTokens", "thinkingConfig"])) return false;
  if (row.effort !== null) {
    const thinking = config.thinkingConfig;
    if (!isRecord(thinking) || !hasExactlyKeys(thinking, ["thinkingLevel"]) || thinking.thinkingLevel !== row.effort) return false;
  }
  const max = config.maxOutputTokens;
  return typeof max === "number" && Number.isSafeInteger(max) && max >= 1 && max <= row.outputBound;
}
