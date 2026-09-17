import type { ObservationSignal } from "../../core/signals.js";
import type { ModuleStatusProjection, RestoredOpenSignal, SignalIntent } from "../../core/types.js";
import type { CaptureSnapshot } from "./queries.js";
import type { RuntimeLiveness } from "./liveness.js";

type RuntimeState = {
  notWiredOpen: boolean;
  notWiredOpenedAt: Date | null;
  blindOpen: boolean;
  blindOpenedAt: Date | null;
};

export type CaptureTrackerCycle = Readonly<{
  state: "UNKNOWN" | "NOT_WIRED" | "WIRED_CURRENT" | "WIRED_SILENT";
  intents: readonly SignalIntent[];
  projections: readonly ModuleStatusProjection[];
  dailyNotWiredRuntimes: readonly string[];
}>;

const POSITIVE_STATES = new Set(["UP", "HEALTHY", "FRESH", "OK", "WIRED_CURRENT"]);

function exactKeys(evidence: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(evidence).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function restoredCaptureKey(signal: ObservationSignal): string | null {
  const evidence = signal.evidence as Readonly<Record<string, unknown>>;
  const runtime = evidence.runtime;
  if (signal.state !== "OPEN"
    || signal.component !== "obs_capture"
    || signal.first_failed_probe_at === null
    || signal.suspected_defect
    || signal.defect_kind !== null
    || signal.run_ref !== null
    || signal.work_item_ref !== null
    || typeof runtime !== "string"
    || !/^[A-Za-z0-9_.-]{1,64}$/u.test(runtime)) return null;
  if (signal.class === "CAPTURE_NOT_WIRED"
    && signal.severity === "INFO"
    && signal.impact_code === "IMPACT_CAPTURE_NOT_WIRED"
    && exactKeys(evidence, ["runtime", "flush_ok_count", "health"])
    && evidence.flush_ok_count === 0
    && evidence.health === "NOT_WIRED") return `not-wired:${runtime}`;
  if (signal.class === "BLIND_PERIOD"
    && signal.severity === "DEGRADED"
    && signal.impact_code === "IMPACT_BLIND"
    && exactKeys(evidence, ["runtime", "last_flush_ok_at", "silence_s", "threshold_s", "health"])
    && typeof evidence.last_flush_ok_at === "string"
    && Number.isFinite(new Date(evidence.last_flush_ok_at).getTime())
    && typeof evidence.silence_s === "number"
    && Number.isFinite(evidence.silence_s)
    && typeof evidence.threshold_s === "number"
    && Number.isFinite(evidence.threshold_s)
    && evidence.threshold_s > 0
    && evidence.silence_s >= evidence.threshold_s
    && Math.abs(evidence.silence_s - (
      new Date(signal.detected_at).getTime() - new Date(evidence.last_flush_ok_at).getTime()
    ) / 1_000) < 1e-9
    && evidence.health === "WIRED_SILENT") return `blind:${runtime}`;
  return null;
}

function positiveAuthority(snapshot: CaptureSnapshot, runtime: string) {
  return snapshot.health
    .filter((row) => row.runtime === runtime
      && row.detailCode === "FLUSH_OK"
      && POSITIVE_STATES.has(row.state))
    .sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())[0];
}

function notWiredIntent(
  runtime: string,
  state: "OPEN" | "CLEARED",
  now: Date,
  openedAt: Date | null
): SignalIntent {
  return Object.freeze({
    correlationKey: `not-wired:${runtime}`,
    component: "obs_capture",
    class: "CAPTURE_NOT_WIRED",
    state,
    severity: "INFO",
    impactCode: state === "OPEN" ? "IMPACT_CAPTURE_NOT_WIRED" : "IMPACT_CLEARED",
    firstFailedProbeAt: openedAt ?? now,
    detectedAt: now,
    evidence: state === "OPEN"
      ? Object.freeze({ runtime, flush_ok_count: 0, health: "NOT_WIRED" })
      : Object.freeze({
          duration_seconds: Math.max(0, (now.getTime() - (openedAt ?? now).getTime()) / 1_000)
        }),
    suspectedDefect: false,
    defectKind: null,
    runRef: null,
    workItemRef: null
  });
}

function blindIntent(
  runtime: string,
  state: "OPEN" | "CLEARED",
  now: Date,
  openedAt: Date,
  authorityAt: Date,
  thresholdSeconds: number
): SignalIntent {
  const silenceSeconds = Math.max(0, (now.getTime() - authorityAt.getTime()) / 1_000);
  return Object.freeze({
    correlationKey: `blind:${runtime}`,
    component: "obs_capture",
    class: "BLIND_PERIOD",
    state,
    severity: "DEGRADED",
    impactCode: state === "OPEN" ? "IMPACT_BLIND" : "IMPACT_CLEARED",
    firstFailedProbeAt: openedAt,
    detectedAt: now,
    evidence: state === "OPEN"
      ? Object.freeze({
          runtime,
          last_flush_ok_at: authorityAt.toISOString(),
          silence_s: silenceSeconds,
          threshold_s: thresholdSeconds,
          health: "WIRED_SILENT"
        })
      : Object.freeze({
          duration_seconds: Math.max(0, (now.getTime() - openedAt.getTime()) / 1_000)
        }),
    suspectedDefect: false,
    defectKind: null,
    runRef: null,
    workItemRef: null
  });
}

export function createCaptureHealthTracker(): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
  reconcile(openSignals: readonly RestoredOpenSignal[]): void;
  observe(input: Readonly<{
    snapshot: CaptureSnapshot;
    runtimeLiveness: Readonly<Record<string, RuntimeLiveness>>;
    expectedRuntimes: readonly string[];
    now: Date;
    blindWindowSeconds: number;
  }>): CaptureTrackerCycle;
}> {
  const states = new Map<string, RuntimeState>();
  return Object.freeze({
    legacyCorrelationKey(signal): string | null {
      return restoredCaptureKey(signal);
    },
    restore(openSignals): void {
      for (const restored of openSignals) {
        const runtime = (restored.signal.evidence as Readonly<Record<string, unknown>>).runtime;
        if (typeof runtime !== "string"
          || restoredCaptureKey(restored.signal) !== restored.correlationKey) {
          throw new TypeError("OBSERVATION_CAPTURE_RESTORE_INVALID");
        }
        const state = states.get(runtime) ?? {
          notWiredOpen: false, notWiredOpenedAt: null,
          blindOpen: false, blindOpenedAt: null
        };
        states.set(runtime, state);
        if (restored.signal.component === "obs_capture"
          && restored.signal.class === "CAPTURE_NOT_WIRED"
          && restored.signal.impact_code === "IMPACT_CAPTURE_NOT_WIRED"
          && restored.correlationKey === `not-wired:${runtime}`
          && !state.notWiredOpen) {
          state.notWiredOpen = true;
          state.notWiredOpenedAt = new Date(restored.signal.detected_at);
        } else if (restored.signal.component === "obs_capture"
          && restored.signal.class === "BLIND_PERIOD"
          && restored.signal.impact_code === "IMPACT_BLIND"
          && restored.correlationKey === `blind:${runtime}`
          && !state.blindOpen) {
          state.blindOpen = true;
          state.blindOpenedAt = restored.signal.first_failed_probe_at === null
            ? new Date(restored.signal.detected_at)
            : new Date(restored.signal.first_failed_probe_at);
        } else {
          throw new TypeError("OBSERVATION_CAPTURE_RESTORE_INVALID");
        }
      }
    },
    reconcile(openSignals): void {
      for (const state of states.values()) {
        state.notWiredOpen = false;
        state.notWiredOpenedAt = null;
        state.blindOpen = false;
        state.blindOpenedAt = null;
      }
      for (const open of openSignals) {
        const runtime = (open.signal.evidence as Readonly<Record<string, unknown>>).runtime;
        if (typeof runtime !== "string" || restoredCaptureKey(open.signal) !== open.correlationKey) {
          throw new TypeError("OBSERVATION_CAPTURE_RESTORE_INVALID");
        }
        const state = states.get(runtime) ?? {
          notWiredOpen: false, notWiredOpenedAt: null,
          blindOpen: false, blindOpenedAt: null
        };
        states.set(runtime, state);
        if (open.correlationKey === `not-wired:${runtime}` && !state.notWiredOpen) {
          state.notWiredOpen = true;
          state.notWiredOpenedAt = new Date(open.signal.detected_at);
        } else if (open.correlationKey === `blind:${runtime}` && !state.blindOpen) {
          state.blindOpen = true;
          state.blindOpenedAt = open.signal.first_failed_probe_at === null
            ? new Date(open.signal.detected_at)
            : new Date(open.signal.first_failed_probe_at);
        } else {
          throw new TypeError("OBSERVATION_CAPTURE_RESTORE_INVALID");
        }
      }
    },
    observe(input) {
      if (input.snapshot.state === "UNKNOWN") {
        const intents: SignalIntent[] = [];
        for (const runtime of input.expectedRuntimes) {
          const state = states.get(runtime);
          if (state?.blindOpen && input.runtimeLiveness[runtime] === "DOWN") {
            intents.push(blindIntent(
              runtime,
              "CLEARED",
              input.now,
              state.blindOpenedAt ?? input.now,
              state.blindOpenedAt ?? input.now,
              input.blindWindowSeconds
            ));
            state.blindOpen = false;
            state.blindOpenedAt = null;
          }
        }
        return Object.freeze({
          state: "UNKNOWN" as const,
          intents: Object.freeze(intents),
          projections: Object.freeze([Object.freeze({
            kind: "state" as const,
            key: "obs_capture",
            state: "UNKNOWN" as const,
            observedAt: input.now
          })]),
          dailyNotWiredRuntimes: Object.freeze([])
        });
      }
      const intents: SignalIntent[] = [];
      const dailyNotWiredRuntimes: string[] = [];
      const projections: ModuleStatusProjection[] = [];
      let missing = 0;
      for (const runtime of input.expectedRuntimes) {
        const state = states.get(runtime) ?? {
          notWiredOpen: false,
          notWiredOpenedAt: null,
          blindOpen: false,
          blindOpenedAt: null
        };
        states.set(runtime, state);
        if (state.blindOpen && input.runtimeLiveness[runtime] === "DOWN") {
          intents.push(blindIntent(
            runtime,
            "CLEARED",
            input.now,
            state.blindOpenedAt ?? input.now,
            state.blindOpenedAt ?? input.now,
            input.blindWindowSeconds
          ));
          state.blindOpen = false;
          state.blindOpenedAt = null;
        }
        const authority = positiveAuthority(input.snapshot, runtime);
        if (authority === undefined) {
          missing += 1;
          projections.push(Object.freeze({
            kind: "state", key: `${runtime}.capture`, state: "NOT_WIRED",
            observedAt: input.now
          }));
          if (!state.notWiredOpen) {
            state.notWiredOpen = true;
            state.notWiredOpenedAt = input.now;
            intents.push(notWiredIntent(runtime, "OPEN", input.now, input.now));
          } else {
            dailyNotWiredRuntimes.push(runtime);
          }
          continue;
        }
        const silenceSeconds = Math.max(
          0,
          (input.now.getTime() - authority.observedAt.getTime()) / 1_000
        );
        const runtimeUp = input.runtimeLiveness[runtime] === "UP";
        const blind = silenceSeconds >= input.blindWindowSeconds && runtimeUp;
        if (blind && !state.blindOpen) {
          const firstFailedAt = new Date(
            authority.observedAt.getTime() + input.blindWindowSeconds * 1_000
          );
          state.blindOpen = true;
          state.blindOpenedAt = firstFailedAt;
          intents.push(blindIntent(
            runtime,
            "OPEN",
            input.now,
            firstFailedAt,
            authority.observedAt,
            input.blindWindowSeconds
          ));
        } else if (state.blindOpen && silenceSeconds < input.blindWindowSeconds) {
          intents.push(blindIntent(
            runtime,
            "CLEARED",
            input.now,
            state.blindOpenedAt ?? input.now,
            authority.observedAt,
            input.blindWindowSeconds
          ));
          state.blindOpen = false;
          state.blindOpenedAt = null;
        }
        const runtimeCaptureState = state.blindOpen ? "WIRED_SILENT" : "WIRED_CURRENT";
        projections.push(
          Object.freeze({
            kind: "state", key: `${runtime}.capture`, state: runtimeCaptureState,
            observedAt: input.now
          }),
          Object.freeze({
            kind: "timestamp", key: `${runtime}.last_flush_ok`, value: authority.observedAt
          }),
          Object.freeze({
            kind: "metric", key: `${runtime}.flush_ok_age`,
            value: silenceSeconds,
            unit: "SECONDS", observedAt: input.now
          })
        );
        if (state.notWiredOpen) {
          intents.push(notWiredIntent(
            runtime,
            "CLEARED",
            input.now,
            state.notWiredOpenedAt
          ));
          state.notWiredOpen = false;
          state.notWiredOpenedAt = null;
        }
      }
      const positiveCount = input.snapshot.health.filter((row) =>
        row.detailCode === "FLUSH_OK" && POSITIVE_STATES.has(row.state)).length;
      if (positiveCount === 0) {
        projections.unshift(Object.freeze({
          kind: "template", key: "obs_capture", template: "CAPTURE_NOT_WIRED",
          count: 0
        }));
      }
      return Object.freeze({
        state: missing > 0
          ? "NOT_WIRED"
          : [...states.values()].some((state) => state.blindOpen)
            ? "WIRED_SILENT"
            : "WIRED_CURRENT",
        intents: Object.freeze(intents),
        projections: Object.freeze(projections),
        dailyNotWiredRuntimes: Object.freeze(dailyNotWiredRuntimes)
      });
    }
  });
}
