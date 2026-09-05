import { ObservationError } from "./errors.js";
import {
  signalSchema,
  type ObservationSignal,
  type Severity
} from "./signals.js";
import {
  OBSERVATION_COMPONENTS,
  type ModuleConfigurationObject,
  type ModuleStatusProjection,
  type ModuleTargetFragment,
  type ObservationComponent
} from "./types.js";
import type { DeliveryCoordinator } from "../notify/delivery.js";
import type { OsaScriptDeliveryExecutor } from "../notify/osascript.js";

export type SignalRoutingPolicy = Readonly<{
  rateLimitMs: number;
  degradedAfterMs: number;
  timeoutMs: number;
}>;

export type SignalRoutingMute = Readonly<{ component?: ObservationComponent }> | null;

export type RouterCurrentContext = Readonly<{
  thresholdVersion: number;
  thresholds: ModuleConfigurationObject;
}>;

export type RouterBootstrapInput = Readonly<{
  stateDir: string;
  delivery: DeliveryCoordinator;
  osascript: OsaScriptDeliveryExecutor;
  moduleName: string;
  targetFragment: ModuleTargetFragment;
  configuration: ModuleConfigurationObject;
  thresholds: ModuleConfigurationObject;
  thresholdVersion: number;
}>;

export type PersistedSignalRoutingInput = Readonly<{
  signal: ObservationSignal;
  now: Date;
  policy: SignalRoutingPolicy;
  mute: SignalRoutingMute;
  module: RouterCurrentContext;
}>;

export type SignalRouter = Readonly<{
  onSignal(input: PersistedSignalRoutingInput): Promise<void>;
  onTick(input: Readonly<{
    now: Date;
    policy: SignalRoutingPolicy;
    mute: SignalRoutingMute;
    module: RouterCurrentContext;
  }>): Promise<void>;
  status(): readonly ModuleStatusProjection[];
}>;

export type SignalRouterFactory = Readonly<{
  create(input: RouterBootstrapInput): Promise<SignalRouter> | SignalRouter;
}>;

const severityRank: Readonly<Record<Severity, number>> = Object.freeze({
  INFO: 0,
  DEGRADED: 1,
  SEVERE: 2,
  FATAL: 3
});

function validateContext(input: Readonly<{
  now: Date;
  policy: SignalRoutingPolicy;
  mute: SignalRoutingMute;
}>): void {
  if (!(input.now instanceof Date)
    || !Number.isFinite(input.now.getTime())
    || !Number.isFinite(input.policy.rateLimitMs)
    || input.policy.rateLimitMs < 0
    || !Number.isFinite(input.policy.degradedAfterMs)
    || input.policy.degradedAfterMs < 0
    || !Number.isFinite(input.policy.timeoutMs)
    || input.policy.timeoutMs <= 0
    || (input.mute !== null
      && input.mute.component !== undefined
      && !OBSERVATION_COMPONENTS.includes(input.mute.component))) {
    throw new ObservationError("OBSERVATION_ROUTING_INVALID");
  }
}

export function createLegacyOsaScriptRouter(input: Readonly<{
  delivery: DeliveryCoordinator;
  osascript: OsaScriptDeliveryExecutor;
}>): SignalRouter {
  const openDegraded = new Map<string, Readonly<{
    signal: ObservationSignal;
    openedAt: number;
  }>>();
  const lastAttempt = new Map<string, Readonly<{ at: number; severity: Severity }>>();

  async function deliver(route: PersistedSignalRoutingInput): Promise<void> {
    const signal = route.signal;
    const isClear = signal.state === "CLEARED";
    const key = `${signal.component}:${signal.class}`;
    const previous = lastAttempt.get(key);
    const muted = route.mute !== null
      && (route.mute.component === undefined || route.mute.component === signal.component);
    const disposition = !isClear && muted
      ? "MUTED" as const
      : !isClear && previous !== undefined
        && route.now.getTime() - previous.at < route.policy.rateLimitMs
        && severityRank[signal.severity] <= severityRank[previous.severity]
        ? "RATE_LIMITED" as const
        : "EXECUTE" as const;
    await input.delivery.attempt({
      signal,
      channel: "osascript",
      disposition,
      now: route.now,
      ...(disposition === "EXECUTE" ? {
        execute: () => input.osascript(signal, route.now, route.policy.timeoutMs)
      } : {})
    });
    if (disposition === "EXECUTE") {
      lastAttempt.set(key, Object.freeze({
        at: route.now.getTime(),
        severity: signal.severity
      }));
    }
  }

  return Object.freeze({
    async onSignal(route) {
      validateContext(route);
      const signal = signalSchema.parse(route.signal);
      const key = `${signal.component}:${signal.class}`;
      if (signal.state === "CLEARED") {
        openDegraded.delete(key);
        await deliver({ ...route, signal });
        return;
      }
      if (signal.severity === "DEGRADED") {
        openDegraded.set(key, Object.freeze({ signal, openedAt: route.now.getTime() }));
        return;
      }
      openDegraded.delete(key);
      if (severityRank[signal.severity] >= severityRank.SEVERE) {
        await deliver({ ...route, signal });
      }
    },
    async onTick(route) {
      validateContext(route);
      for (const opened of openDegraded.values()) {
        if (route.now.getTime() - opened.openedAt < route.policy.degradedAfterMs) continue;
        await deliver({
          ...route,
          signal: opened.signal
        });
      }
    },
    status: () => Object.freeze([])
  });
}
