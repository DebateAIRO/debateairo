import type { SignalLifecycleIdentity } from "../../core/lifecycle.js";
import type { ObservationSignal, Severity } from "../../core/signals.js";
import type { ComponentState, ProbeObservation } from "../../core/types.js";
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
  ): Promise<void>;
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

      if (transition.event?.kind === "OPEN") {
        const signal = materializeLivenessSignal({
          seq: input.nextSequence(),
          signalId: input.nextSignalId(),
          observation,
          kind: "OPEN",
          at: now,
          ...(transition.event.firstFailedProbeAt === undefined ? {} : {
            firstFailedAt: transition.event.firstFailedProbeAt
          }),
          thresholdVersion: request.thresholdVersion,
          threshold: request.openAfterFailures,
          severity: request.severity
        });
        input.openSignals.set(key, Object.freeze({ signal, openedAt: now }));
        request.onOpened?.(signal);
        await input.emit(
          signal,
          now,
          Object.freeze({ owner: "core-liveness", correlationKey: key })
        );
      } else if (transition.event?.kind === "CLEARED") {
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
          input.openSignals.delete(key);
          request.onCleared?.(opened.signal.signal_id);
          await input.emit(
            signal,
            now,
            Object.freeze({ owner: "core-liveness", correlationKey: key })
          );
        }
      }
      return transition;
    }
  });
}
