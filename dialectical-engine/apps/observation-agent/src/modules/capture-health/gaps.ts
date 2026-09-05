import type { ObservationSignal } from "../../core/signals.js";
import type { ModuleStatusProjection, RestoredOpenSignal, SignalIntent } from "../../core/types.js";
import type { CaptureGapFact, CaptureSnapshot } from "./queries.js";

type GapCandidate = Readonly<Omit<SignalIntent, "state">>;
type OpenGap = Readonly<{ candidate: GapCandidate; openedAt: Date }>;

export type CaptureGapCycle = Readonly<{
  intents: readonly SignalIntent[];
  projections: readonly ModuleStatusProjection[];
}>;

function identity(row: CaptureGapFact): string {
  return `${row.source}:${row.source}:${row.gapClass}`;
}

function candidate(
  rows: readonly CaptureGapFact[],
  now: Date,
  severeLostCount: number
): GapCandidate {
  const representative = [...rows].sort((left, right) =>
    left.openedAt.getTime() - right.openedAt.getTime())[0]!;
  const lostCount = rows.reduce((total, row) => total + row.lostCount, 0);
  const closedDates = rows.flatMap((row) => row.closedAt === null ? [] : [row.closedAt]);
  const firstFailedProbeAt = closedDates.length === 0
    ? now
    : new Date(Math.min(...closedDates.map((date) => date.getTime())));
  const closedAt = closedDates.length === rows.length
    ? new Date(Math.max(...closedDates.map((date) => date.getTime())))
    : null;
  return Object.freeze({
    correlationKey: `gap:${identity(representative)}`,
    component: "obs_capture",
    class: "CAPTURE_GAP",
    severity: lostCount >= severeLostCount ? "SEVERE" : "DEGRADED",
    impactCode: "IMPACT_CAPTURE_GAP",
    firstFailedProbeAt,
    detectedAt: now,
    evidence: Object.freeze({
      runtime: representative.source,
      source: representative.source,
      gap_class: representative.gapClass,
      lost_count: lostCount,
      opened_at: representative.openedAt.toISOString(),
      closed_at: closedAt?.toISOString() ?? null
    }),
    suspectedDefect: false,
    defectKind: null,
    runRef: null,
    workItemRef: null
  });
}

function clear(opened: OpenGap, now: Date): SignalIntent {
  return Object.freeze({
    ...opened.candidate,
    state: "CLEARED",
    impactCode: "IMPACT_CLEARED",
    detectedAt: now,
    evidence: Object.freeze({
      duration_seconds: Math.max(0, (now.getTime() - opened.openedAt.getTime()) / 1_000)
    })
  });
}

function restoredGapKey(signal: ObservationSignal): string | null {
  const evidence = signal.evidence as Readonly<Record<string, unknown>>;
  const runtime = evidence.runtime;
  const source = evidence.source;
  const gapClass = evidence.gap_class;
  return signal.state === "OPEN"
    && signal.component === "obs_capture"
    && signal.class === "CAPTURE_GAP"
    && (signal.severity === "DEGRADED" || signal.severity === "SEVERE")
    && signal.impact_code === "IMPACT_CAPTURE_GAP"
    && signal.first_failed_probe_at !== null
    && signal.suspected_defect === false
    && signal.defect_kind === null
    && signal.run_ref === null
    && signal.work_item_ref === null
    && Object.keys(evidence).sort().join(":")
      === "closed_at:gap_class:lost_count:opened_at:runtime:source"
    && typeof runtime === "string"
    && runtime === source
    && /^[A-Za-z0-9_.-]{1,64}$/u.test(runtime)
    && typeof gapClass === "string"
    && /^[A-Za-z0-9_.-]{1,64}$/u.test(gapClass)
    && Number.isInteger(evidence.lost_count)
    && (evidence.lost_count as number) >= 0
    && typeof evidence.opened_at === "string"
    && Number.isFinite(new Date(evidence.opened_at).getTime())
    && (evidence.closed_at === null
      || (typeof evidence.closed_at === "string"
        && Number.isFinite(new Date(evidence.closed_at).getTime())
        && new Date(evidence.closed_at).getTime() >= new Date(evidence.opened_at).getTime()))
    ? `gap:${source}:${source}:${gapClass}`
    : null;
}

export function createCaptureGapTracker(): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
  observe(input: Readonly<{
    snapshot: CaptureSnapshot;
    now: Date;
    windowSeconds: number;
    severeLostCount: number;
  }>): CaptureGapCycle;
}> {
  const seenRows = new Set<string>();
  const opened = new Map<string, OpenGap>();
  return Object.freeze({
    legacyCorrelationKey(signal): string | null {
      return restoredGapKey(signal);
    },
    restore(openSignals): void {
      for (const restored of openSignals) {
        const signal = restored.signal;
        const evidence = signal.evidence as Readonly<Record<string, unknown>>;
        const correlationKey = restoredGapKey(signal);
        const nativeKey = correlationKey?.slice("gap:".length);
        if (correlationKey === null || nativeKey === undefined
          || restored.correlationKey !== correlationKey || opened.has(nativeKey)) {
          throw new TypeError("OBSERVATION_CAPTURE_GAP_RESTORE_INVALID");
        }
        const candidate: GapCandidate = Object.freeze({
          correlationKey,
          component: "obs_capture",
          class: "CAPTURE_GAP",
          severity: signal.severity,
          impactCode: "IMPACT_CAPTURE_GAP",
          firstFailedProbeAt: signal.first_failed_probe_at === null
            ? null : new Date(signal.first_failed_probe_at),
          detectedAt: new Date(signal.detected_at),
          evidence,
          suspectedDefect: false,
          defectKind: null,
          runRef: null,
          workItemRef: null
        });
        opened.set(nativeKey, Object.freeze({
          candidate,
          openedAt: new Date(signal.detected_at)
        }));
      }
    },
    observe(input) {
      if (input.snapshot.state === "UNKNOWN") {
        return Object.freeze({ intents: Object.freeze([]), projections: Object.freeze([
          Object.freeze({
            kind: "state" as const, key: "capture_gap", state: "UNKNOWN" as const,
            observedAt: input.now
          })
        ]) });
      }
      const windowStart = input.now.getTime() - input.windowSeconds * 1_000;
      const relevant = input.snapshot.gaps.filter((row) =>
        row.closedAt === null || row.openedAt.getTime() >= windowStart);
      const grouped = new Map<string, CaptureGapFact[]>();
      for (const row of relevant) {
        const key = identity(row);
        const rows = grouped.get(key) ?? [];
        rows.push(row);
        grouped.set(key, rows);
      }
      const intents: SignalIntent[] = [];
      for (const [key, open] of opened) {
        const rows = grouped.get(key) ?? [];
        const hasOpenInput = rows.some((row) => row.closedAt === null);
        const hasNewLoss = rows.some((row) => !seenRows.has(row.captureGapId));
        if (!hasOpenInput && !hasNewLoss) {
          intents.push(clear(open, input.now));
          opened.delete(key);
        }
      }
      for (const [key, rows] of grouped) {
        const newRows = rows.filter((row) => !seenRows.has(row.captureGapId));
        if (newRows.length === 0 || opened.has(key)) continue;
        const current = candidate(rows, input.now, input.severeLostCount);
        opened.set(key, Object.freeze({ candidate: current, openedAt: input.now }));
        intents.push(Object.freeze({ ...current, state: "OPEN" }));
      }
      for (const row of relevant) seenRows.add(row.captureGapId);

      const runtimes = new Set([
        ...relevant.map((row) => row.source),
        ...[...opened.values()].map((open) =>
          (open.candidate.evidence as Readonly<Record<string, unknown>>).runtime as string)
      ]);
      const projections: ModuleStatusProjection[] = [];
      for (const runtime of [...runtimes].sort()) {
        const runtimeRows = relevant.filter((row) => row.source === runtime);
        const lostCount = runtimeRows.reduce((total, row) => total + row.lostCount, 0);
        const openCount = [...opened.values()].filter((open) =>
          (open.candidate.evidence as Readonly<Record<string, unknown>>).runtime === runtime).length;
        projections.push(
          Object.freeze({
            kind: "metric", key: `${runtime}.capture_gap_open`, value: openCount,
            unit: "COUNT", observedAt: input.now
          }),
          Object.freeze({
            kind: "metric", key: `${runtime}.capture_gap_lost`, value: lostCount,
            unit: "COUNT", observedAt: input.now
          }),
          Object.freeze({
            kind: "state", key: `${runtime}.capture_gap_severity`,
            state: lostCount >= input.severeLostCount ? "SEVERE" : "DEGRADED",
            observedAt: input.now
          })
        );
      }
      return Object.freeze({
        intents: Object.freeze(intents),
        projections: Object.freeze(projections)
      });
    }
  });
}
