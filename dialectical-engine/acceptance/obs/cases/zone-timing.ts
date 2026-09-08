import type { ObsAcceptanceCase, ObsCaseContext, SpawnReceipt } from "../index.js";

export function mannWhitneyU(
  captureOn: readonly number[],
  captureOff: readonly number[],
): Readonly<{ uOn: number; uOff: number; u: number }> {
  const ranked = [
    ...captureOn.map((value) => ({ group: "on" as const, value })),
    ...captureOff.map((value) => ({ group: "off" as const, value })),
  ].sort((left, right) => left.value - right.value);
  let rankSumOn = 0;
  for (let start = 0; start < ranked.length;) {
    let end = start + 1;
    while (end < ranked.length && ranked[end]?.value === ranked[start]?.value) end += 1;
    const averageRank = ((start + 1) + end) / 2;
    for (let index = start; index < end; index += 1) {
      if (ranked[index]?.group === "on") rankSumOn += averageRank;
    }
    start = end;
  }
  const uOn = rankSumOn - captureOn.length * (captureOn.length + 1) / 2;
  const uOff = captureOn.length * captureOff.length - uOn;
  return Object.freeze({ uOn, uOff, u: Math.min(uOn, uOff) });
}

const ZONE_TIMING_SUBJECT = "acceptance/obs/subjects/zone-timing.ts";

function nearestRank(values: readonly number[], percentile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)] ?? 0);
}

export const zoneTimingCase: ObsAcceptanceCase = Object.freeze({
  name: "zone-timing",
  subjectPaths: Object.freeze([ZONE_TIMING_SUBJECT]),
  async run(context: ObsCaseContext) {
    const onUrl = process.env.OBS_G1_ZONE_ON_HTTPS_URL?.trim();
    if (!onUrl) return context.skipMissing("OBS_G1_ZONE_ON_HTTPS_URL");
    const offUrl = process.env.OBS_G1_ZONE_OFF_HTTPS_URL?.trim();
    if (!offUrl) return context.skipMissing("OBS_G1_ZONE_OFF_HTTPS_URL");
    const sampleText = process.env.OBS_G1_ZONE_SAMPLE_SIZE?.trim();
    if (!sampleText) return context.skipMissing("OBS_G1_ZONE_SAMPLE_SIZE");
    const sampleSize = Number(sampleText);
    if (!Number.isSafeInteger(sampleSize) || sampleSize < 20 || sampleSize > 200) {
      return context.fail("ZONE_SAMPLE_SIZE_INVALID", { failures: 1 });
    }
    let receipt: SpawnReceipt;
    try {
      receipt = await context.spawn({
        command: process.execPath,
        arguments: ["--import", "tsx", ZONE_TIMING_SUBJECT],
        environment: {
          OBS_G1_ZONE_ON_HTTPS_URL: onUrl,
          OBS_G1_ZONE_OFF_HTTPS_URL: offUrl,
          OBS_G1_ZONE_SAMPLE_SIZE: String(sampleSize),
        },
        timeoutMs: Math.min(1_210_000, sampleSize * 6_100),
      });
    } catch {
      return context.fail("ZONE_HTTP_PROBE_FAILED", { failures: 1 });
    }
    const line = receipt.stdout.trim().split("\n").find((entry: string) => entry.startsWith("FIX08_ZONE_TIMING "));
    let on: readonly number[] = [];
    let off: readonly number[] = [];
    try {
      const parsed = JSON.parse(line?.slice("FIX08_ZONE_TIMING ".length) ?? "null") as Readonly<Record<string, unknown>>;
      if (Array.isArray(parsed.on) && parsed.on.every(Number.isFinite)) on = parsed.on as number[];
      if (Array.isArray(parsed.off) && parsed.off.every(Number.isFinite)) off = parsed.off as number[];
    } catch {
      on = [];
      off = [];
    }
    if (receipt.exitCode !== 0 || receipt.stderr !== "" || on.length !== sampleSize || off.length !== sampleSize) {
      return context.fail("ZONE_HTTP_PROBE_INVALID", { failures: 1 });
    }
    const statistic = mannWhitneyU(on, off);
    const mean = sampleSize * sampleSize / 2;
    const deviation = Math.sqrt(sampleSize * sampleSize * (sampleSize * 2 + 1) / 12);
    const zMilli = Math.round(Math.abs((statistic.u - mean) / deviation) * 1_000);
    const metrics = {
      n: sampleSize,
      off_p50_us: nearestRank(off, 0.5),
      off_p99_us: nearestRank(off, 0.99),
      on_p50_us: nearestRank(on, 0.5),
      on_p99_us: nearestRank(on, 0.99),
      u_milli: Math.round(statistic.u * 1_000),
      z_milli: zMilli,
    };
    if (zMilli >= 1_960) return context.fail("ZONE_DELTA_RESOLVED", metrics);
    return context.passProcess(receipt, metrics);
  },
});
