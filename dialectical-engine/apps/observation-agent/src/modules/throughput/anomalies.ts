export type WindowBand = "INSUFFICIENT_SAMPLE" | "QUALIFIED_NORMAL" | "OPEN";

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function classifyRunFailureWindow(
  window: Readonly<{ failed: number; total: number }>,
  threshold: Readonly<{ minimum: number; ratio: number }>
): Readonly<{ state: WindowBand; ratio: number }> {
  if (!validCount(window.failed) || !validCount(window.total)
    || window.failed > window.total
    || !Number.isSafeInteger(threshold.minimum) || threshold.minimum < 1
    || !Number.isFinite(threshold.ratio) || threshold.ratio < 0 || threshold.ratio > 1) {
    throw new TypeError("OBSERVATION_THROUGHPUT_WINDOW_INVALID");
  }
  const ratio = window.total === 0 ? 0 : window.failed / window.total;
  return Object.freeze({
    state: window.total < threshold.minimum
      ? "INSUFFICIENT_SAMPLE"
      : ratio >= threshold.ratio ? "OPEN" : "QUALIFIED_NORMAL",
    ratio
  });
}
