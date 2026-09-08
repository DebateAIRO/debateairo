import type { ObsAcceptanceCase, ObsCaseContext } from "../index.js";

export function percentileMicroseconds(_samples: readonly bigint[], _percentile: number): number | undefined {
  if (_samples.length === 0 || !Number.isFinite(_percentile) || _percentile <= 0 || _percentile > 100) {
    return undefined;
  }
  const samples = [..._samples].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const index = Math.max(0, Math.ceil(samples.length * (_percentile / 100)) - 1);
  const nanoseconds = samples[index];
  return nanoseconds === undefined ? undefined : Number(nanoseconds / 1_000n);
}

const OVERHEAD_SUBJECT = "acceptance/obs/subjects/overhead.ts";

export const overheadCase: ObsAcceptanceCase = Object.freeze({
  name: "overhead",
  subjectPaths: Object.freeze(["packages/obs-capture/src/emit.ts", OVERHEAD_SUBJECT]),
  async run(context: ObsCaseContext) {
    const receipt = await context.spawn({
      command: process.execPath,
      arguments: ["--import", "tsx", OVERHEAD_SUBJECT],
      timeoutMs: 10_000,
    });
    const line = receipt.stdout.trim().split("\n").find((entry: string) => entry.startsWith("FIX08_OVERHEAD "));
    let metrics: Readonly<Record<string, number>> | undefined;
    try {
      const parsed = JSON.parse(line?.slice("FIX08_OVERHEAD ".length) ?? "null") as unknown;
      if (typeof parsed === "object" && parsed !== null) {
        const values = parsed as Record<string, unknown>;
        if (["calls", "capacity", "depth", "lost", "p99_us"].every((key) => Number.isSafeInteger(values[key]))) {
          metrics = Object.freeze({
            calls: values.calls as number,
            capacity: values.capacity as number,
            depth: values.depth as number,
            lost: values.lost as number,
            p99_us: values.p99_us as number,
          });
        }
      }
    } catch {
      metrics = undefined;
    }
    if (receipt.exitCode !== 0 || receipt.stderr !== "" || metrics === undefined) {
      return context.fail("OVERHEAD_SUBJECT_FAILED", { failures: 1 });
    }
    const rawCeiling = process.env.OBS_EMIT_P99_CEILING_MS?.trim();
    if (rawCeiling === undefined || rawCeiling === "") {
      return context.skipMissing("OBS_EMIT_P99_CEILING_MS", metrics);
    }
    const ceilingMs = Number(rawCeiling);
    if (!Number.isFinite(ceilingMs) || ceilingMs <= 0) {
      return context.fail("OVERHEAD_CEILING_INVALID", { failures: 1 });
    }
    const ceilingUs = Math.floor(ceilingMs * 1_000);
    if ((metrics.p99_us ?? Number.MAX_SAFE_INTEGER) > ceilingUs) {
      return context.fail("OVERHEAD_P99_EXCEEDED", {
        ceiling_us: ceilingUs,
        p99_us: metrics.p99_us ?? Number.MAX_SAFE_INTEGER,
      });
    }
    return context.passProcess(receipt, { ...metrics, ceiling_us: ceilingUs });
  },
});
