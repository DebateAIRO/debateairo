import type { SignalLifecycleIdentity } from "../../core/lifecycle.js";
import type { ObservationSignal, Severity } from "../../core/signals.js";
import type {
  ComponentState,
  ProbeObservation,
  SignalEmissionResult
} from "../../core/types.js";
import { materializeLivenessSignal } from "./signals.js";
import type { LivenessTransition } from "./state.js";

export type CoreLivenessOpenSignal = Readonly<{
  signal: ObservationSignal;
  openedAt: Date;
}>;

type LivenessTracker = Readonly<{
  observe(input: Readonly<{
    component: ProbeObservation["component"];
    class: ProbeObservation["class"];
    ok: boolean;
    at: Date;
  }>): LivenessTransition;
}>;

export function createCoreLivenessObservationCoordinator(input: Readonly<{
  tracker: LivenessTracker;
  openSignals: Map<string, CoreLivenessOpenSignal>;
  nextSequence(): number;
  nextSignalId(): string;
  emit(
    signal: ObservationSignal,
    now: Date,
    lifecycle: SignalLifecycleIdentity
  ): Promise<void | SignalEmissionResult>;
}>): Readonly<{
  observe(request: Readonly<{
    observation: ProbeObservation;
    now: Date;
    thresholdVersion: number;
    openAfterFailures: number;
    clearAfterSuccesses: number;
    severity: Severity;
    onTransition?(state: ComponentState): void;
    onOpened?(signal: ObservationSignal): void;
    onCleared?(signalId: string): void;
  }>): Promise<LivenessTransition>;
}> {
  const rejectedOpenFirstFailedAt = new Map<string, Date>();
  const commitEmission = (result: void | SignalEmissionResult): boolean =>
    result === undefined || result.journaled;

  return Object.freeze({
    async observe(request): Promise<LivenessTransition> {
      const { observation, now } = request;
      const key = `${observation.component}:${observation.class}`;
      const transition = input.tracker.observe({
        component: observation.component,
        class: observation.class,
        ok: observation.ok,
        at: now
      });
      request.onTransition?.(transition.state);
      const lifecycle = Object.freeze({ owner: "core-liveness", correlationKey: key });
      const retryRejectedOpen = transition.event === null
        && !observation.ok
        && transition.state === "DOWN"
        && !input.openSignals.has(key)
        && rejectedOpenFirstFailedAt.has(key);

      if ((transition.event?.kind === "OPEN" || retryRejectedOpen)
        && !input.openSignals.has(key)) {
        const firstFailedAt = transition.event?.firstFailedProbeAt
          ?? rejectedOpenFirstFailedAt.get(key)
          ?? now;
        const signal = materializeLivenessSignal({
          seq: input.nextSequence(),
          signalId: input.nextSignalId(),
          observation,
          kind: "OPEN",
          at: now,
          firstFailedAt,
          thresholdVersion: request.thresholdVersion,
          threshold: request.openAfterFailures,
          severity: request.severity
        });
        const emitted = await input.emit(signal, now, lifecycle);
        if (commitEmission(emitted)) {
          rejectedOpenFirstFailedAt.delete(key);
          input.openSignals.set(key, Object.freeze({ signal, openedAt: now }));
          request.onOpened?.(signal);
        } else {
          rejectedOpenFirstFailedAt.set(key, firstFailedAt);
        }
        return transition;
      }

      const retryRejectedClear = transition.event === null
        && observation.ok
        && transition.state === "UP"
        && input.openSignals.has(key);
      if (transition.event?.kind === "CLEARED" || retryRejectedClear) {
        const opened = input.openSignals.get(key);
        if (opened !== undefined) {
          const signal = materializeLivenessSignal({
            seq: input.nextSequence(),
            signalId: input.nextSignalId(),
            observation,
            kind: "CLEARED",
            at: now,
            thresholdVersion: request.thresholdVersion,
            threshold: request.clearAfterSuccesses,
            severity: request.severity,
            clearsSignalId: opened.signal.signal_id,
            ...(opened.signal.first_failed_probe_at === null ? {} : {
              firstFailedAt: new Date(opened.signal.first_failed_probe_at)
            }),
            openedAt: opened.openedAt
          });
          const emitted = await input.emit(signal, now, lifecycle);
          if (commitEmission(emitted)) {
            input.openSignals.delete(key);
            request.onCleared?.(opened.signal.signal_id);
          }
          return transition;
        }
      }
      if (observation.ok && transition.state === "UP") {
        rejectedOpenFirstFailedAt.delete(key);
      }
      return transition;
    }
  });
}
