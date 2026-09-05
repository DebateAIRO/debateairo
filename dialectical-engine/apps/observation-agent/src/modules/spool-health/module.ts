import type {
  Module,
  ModuleTargetFragment,
  ProbeObservation,
  SignalIntent
} from "../../core/types.js";
import {
  readSpoolReceipts,
  type SpoolReceiptSnapshot
} from "./queries.js";
import {
  scanSpoolMetadata,
  type SpoolScan,
  type SpoolTarget
} from "./scan.js";
import { createSpoolHealthTracker } from "./tracker.js";

export type SpoolHealthDependencies = Readonly<{
  scan(input: Readonly<{
    targets: readonly SpoolTarget[];
    now: Date;
    thresholdSeconds: number;
  }>): Promise<SpoolScan>;
  readReceipts(databaseUrl: string, refs: readonly string[]): Promise<SpoolReceiptSnapshot>;
}>;

const productionDependencies: SpoolHealthDependencies = Object.freeze({
  scan: scanSpoolMetadata,
  readReceipts: readSpoolReceipts
});

function spoolTargets(fragment: ModuleTargetFragment | null): readonly SpoolTarget[] {
  if (fragment === null) return Object.freeze([]);
  return Object.freeze(fragment.targets.filter((target): target is SpoolTarget => {
    if (target === null || typeof target !== "object") return false;
    const candidate = target as Partial<SpoolTarget>;
    return candidate.component === "spool"
      && candidate.kind === "spool_directory"
      && typeof candidate.path === "string";
  }));
}

export function createSpoolHealthModule(
  dependencies: Partial<SpoolHealthDependencies> = {}
): Module {
  const resolved: SpoolHealthDependencies = Object.freeze({
    ...productionDependencies,
    ...dependencies
  });
  const tracker = createSpoolHealthTracker();
  let pendingIntents: readonly SignalIntent[] = Object.freeze([]);
  return Object.freeze({
    name: "spool-health",
    cadence: Object.freeze({ intervalMs: 15_000, timeoutMs: 2_000 }),
    targetFragmentBasename: "OBS-04.json",
    lifecycle: Object.freeze({
      legacyCorrelationKey: tracker.legacyCorrelationKey,
      restore: tracker.restore
    }),
    async probe(ctx): Promise<readonly ProbeObservation[]> {
      const thresholdSeconds = typeof ctx.thresholds.spool_age_s === "number"
        ? ctx.thresholds.spool_age_s : 600;
      const scan = await resolved.scan({
        targets: spoolTargets(ctx.targetFragment),
        now: ctx.now,
        thresholdSeconds
      });
      const receipts = scan.state === "UNKNOWN"
        ? Object.freeze({ state: "UNKNOWN" as const, refs: Object.freeze([]) })
        : await resolved.readReceipts(
            ctx.databaseUrl,
            scan.files.map((file) => file.spoolRef)
          );
      const cycle = tracker.observe({ scan, receipts, now: ctx.now, thresholdSeconds });
      pendingIntents = cycle.intents;
      return Object.freeze([Object.freeze({
        component: "spool",
        ok: cycle.state === "CURRENT",
        class: "SPOOL_STRANDED",
        probe: "spool_metadata",
        lastStatus: cycle.state,
        observedAt: ctx.now,
        management: "module",
        statusState: cycle.state,
        status: cycle.projections
      })]);
    },
    samples() {
      return Object.freeze([]);
    },
    signals() {
      const intents = pendingIntents;
      pendingIntents = Object.freeze([]);
      return intents;
    }
  });
}

export default createSpoolHealthModule();
