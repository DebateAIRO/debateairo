import type { WindowBand } from "../throughput/anomalies.js";

const STATUSES = Object.freeze(["PARSED", "UNPARSED", "PARSE_FAILED", "SCHEMA_FAILED"] as const);
export type ProviderParseStatus = typeof STATUSES[number];

export function classifyProviderWindow(
  statuses: readonly string[],
  threshold: Readonly<{ minimum: number; ratio: number }>
): Readonly<{ state: WindowBand; total: number; failed: number; ratio: number }> {
  if (!Number.isSafeInteger(threshold.minimum) || threshold.minimum < 1
    || !Number.isFinite(threshold.ratio) || threshold.ratio < 0 || threshold.ratio > 1
    || statuses.some((status) => !STATUSES.includes(status as ProviderParseStatus))) {
    throw new TypeError("OBSERVATION_PROVIDER_STATUS_INVALID");
  }
  const total = statuses.length;
  const failed = statuses.filter((status) => status !== "PARSED").length;
  const ratio = total === 0 ? 0 : failed / total;
  return Object.freeze({
    state: total < threshold.minimum
      ? "INSUFFICIENT_SAMPLE"
      : ratio >= threshold.ratio ? "OPEN" : "QUALIFIED_NORMAL",
    total,
    failed,
    ratio
  });
}
