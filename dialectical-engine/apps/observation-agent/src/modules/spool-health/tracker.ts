import type { ModuleStatusProjection, SignalIntent } from "../../core/types.js";
import type { SpoolReceiptSnapshot } from "./queries.js";
import type { SpoolFileMetadata, SpoolScan } from "./scan.js";

type OpenSpool = Readonly<{
  file: SpoolFileMetadata;
  openedAt: Date;
  firstFailedProbeAt: Date;
}>;

function openIntent(
  file: SpoolFileMetadata,
  now: Date,
  thresholdSeconds: number
): SignalIntent {
  return Object.freeze({
    correlationKey: `spool:${file.runtime}:${file.spoolRef}`,
    component: "spool",
    class: "SPOOL_STRANDED",
    state: "OPEN",
    severity: "DEGRADED",
    impactCode: "IMPACT_SPOOL_STRANDED",
    firstFailedProbeAt: new Date(file.mtime.getTime() + thresholdSeconds * 1_000),
    detectedAt: now,
    evidence: Object.freeze({
      runtime: file.runtime,
      spool_ref: file.spoolRef,
      spool_age_s: file.ageSeconds,
      threshold_s: thresholdSeconds,
      receipt_present: false,
      count: 1
    }),
    suspectedDefect: false,
    defectKind: null,
    runRef: null,
    workItemRef: null
  });
}

function clearIntent(open: OpenSpool, now: Date): SignalIntent {
  return Object.freeze({
    ...openIntent(open.file, now, 1),
    state: "CLEARED",
    impactCode: "IMPACT_CLEARED",
    firstFailedProbeAt: open.firstFailedProbeAt,
    evidence: Object.freeze({
      duration_seconds: Math.max(0, (now.getTime() - open.openedAt.getTime()) / 1_000)
    })
  });
}

export function createSpoolHealthTracker(): Readonly<{
  observe(input: Readonly<{
    scan: SpoolScan;
    receipts: SpoolReceiptSnapshot;
    now: Date;
    thresholdSeconds: number;
  }>): Readonly<{
    state: "UNKNOWN" | "CURRENT" | "STRANDED";
    intents: readonly SignalIntent[];
    projections: readonly ModuleStatusProjection[];
  }>;
}> {
  const opened = new Map<string, OpenSpool>();
  return Object.freeze({
    observe(input) {
      if (input.scan.state === "UNKNOWN" || input.receipts.state === "UNKNOWN") {
        return Object.freeze({
          state: "UNKNOWN" as const,
          intents: Object.freeze([]),
          projections: Object.freeze([Object.freeze({
            kind: "state" as const,
            key: "spool",
            state: "UNKNOWN" as const,
            observedAt: input.now
          })])
        });
      }
      const receipts = new Set(input.receipts.refs);
      const candidates = new Map(input.scan.files
        .filter((file) => !receipts.has(file.spoolRef))
        .map((file) => [file.spoolRef, file]));
      const intents: SignalIntent[] = [];
      for (const [spoolRef, open] of opened) {
        if (!candidates.has(spoolRef)) {
          intents.push(clearIntent(open, input.now));
          opened.delete(spoolRef);
        }
      }
      for (const [spoolRef, file] of candidates) {
        if (opened.has(spoolRef)) continue;
        const firstFailedProbeAt = new Date(
          file.mtime.getTime() + input.thresholdSeconds * 1_000
        );
        opened.set(spoolRef, Object.freeze({
          file,
          openedAt: input.now,
          firstFailedProbeAt
        }));
        intents.push(openIntent(file, input.now, input.thresholdSeconds));
      }
      const runtimes = new Set([
        ...input.scan.files.map((file) => file.runtime),
        ...[...opened.values()].map((open) => open.file.runtime)
      ]);
      const projections: ModuleStatusProjection[] = [];
      for (const runtime of [...runtimes].sort()) {
        projections.push(Object.freeze({
          kind: "metric",
          key: `${runtime}.spool_stranded`,
          value: [...opened.values()].filter((open) => open.file.runtime === runtime).length,
          unit: "COUNT",
          observedAt: input.now
        }));
      }
      projections.push(Object.freeze({
        kind: "metric",
        key: "spool.threshold",
        value: input.thresholdSeconds / 60,
        unit: "MINUTES",
        observedAt: input.now
      }));
      return Object.freeze({
        state: opened.size > 0 ? "STRANDED" as const : "CURRENT" as const,
        intents: Object.freeze(intents),
        projections: Object.freeze(projections)
      });
    }
  });
}
