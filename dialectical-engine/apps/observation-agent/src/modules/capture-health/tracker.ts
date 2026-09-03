import type { ModuleStatusProjection, SignalIntent } from "../../core/types.js";
import type { CaptureSnapshot } from "./queries.js";
import type { RuntimeLiveness } from "./liveness.js";

type RuntimeState = {
  notWiredOpen: boolean;
  notWiredOpenedAt: Date | null;
  lastDigestDay: string | null;
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
    observe(input) {
      if (input.snapshot.state === "UNKNOWN") {
        return Object.freeze({
          state: "UNKNOWN" as const,
          intents: Object.freeze([]),
          projections: Object.freeze([Object.freeze({
            kind: "state" as const,
            key: "obs_capture",
            state: "UNKNOWN" as const,
            observedAt: input.now
          })]),
          dailyNotWiredRuntimes: Object.freeze([])
        });
      }
      const day = input.now.toISOString().slice(0, 10);
      const intents: SignalIntent[] = [];
      const dailyNotWiredRuntimes: string[] = [];
      const projections: ModuleStatusProjection[] = [];
      let missing = 0;
      for (const runtime of input.expectedRuntimes) {
        const state = states.get(runtime) ?? {
          notWiredOpen: false,
          notWiredOpenedAt: null,
          lastDigestDay: null,
          blindOpen: false,
          blindOpenedAt: null
        };
        states.set(runtime, state);
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
            state.lastDigestDay = day;
            intents.push(notWiredIntent(runtime, "OPEN", input.now, input.now));
          } else if (state.lastDigestDay !== day) {
            state.lastDigestDay = day;
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
