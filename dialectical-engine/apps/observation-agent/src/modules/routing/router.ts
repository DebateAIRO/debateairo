import type { DeliveryAction, DeliveryExecutionResult } from "../../notify/delivery.js";
import type { ObservationDelivery, ObservationSignal, Severity } from "../../core/signals.js";
import { signalSchema } from "../../core/signals.js";
import type {
  PersistedSignalRoutingInput,
  RouterCurrentContext,
  SignalRouter,
  SignalRoutingMute,
  SignalRoutingPolicy
} from "../../core/routing.js";
import type { ModuleConfigurationObject, ModuleStatusProjection } from "../../core/types.js";
import { readAcknowledgements } from "./acknowledgements.js";
import { appendStormDigest } from "./storm-digest.js";
import {
  detectStorm,
  isStormComponent,
  type StormSummaryExecutor
} from "./storm.js";
import {
  emptyRoutingState,
  readRoutingState,
  writeRoutingState,
  type RoutingAttempt,
  type RoutingOpen,
  type RoutingState
} from "./state.js";

export type RoutedChannel = "osascript" | "sendmail" | "kanban";

export type ChannelExecutionContext = Readonly<{
  ordinal: number;
  openExternalRef: string | null;
}>;

export type RoutedChannelExecutor = (
  signal: ObservationSignal,
  now: Date,
  context: ChannelExecutionContext
) => Promise<DeliveryExecutionResult>;

export type RoutingDeliveryPort = Readonly<{
  attempt(action: DeliveryAction): Promise<ObservationDelivery>;
}>;

export type RoutingExecutors = Readonly<Record<RoutedChannel, RoutedChannelExecutor>>;

const SEVERITY_RANK: Readonly<Record<Severity, number>> = Object.freeze({
  INFO: 0, DEGRADED: 1, SEVERE: 2, FATAL: 3
});

export function routedChannels(severity: Severity): readonly RoutedChannel[] {
  if (severity === "FATAL") return Object.freeze(["osascript", "sendmail", "kanban"]);
  if (severity === "SEVERE") return Object.freeze(["osascript", "kanban"]);
  return Object.freeze([]);
}

function positiveNumber(
  configuration: ModuleConfigurationObject,
  key: string,
  fallback: number
): number {
  const value = configuration[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function configurationObject(value: unknown): ModuleConfigurationObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as ModuleConfigurationObject
    : null;
}

function severityEscalates(previous: Severity | undefined, current: Severity): boolean {
  return previous === undefined || SEVERITY_RANK[current] > SEVERITY_RANK[previous];
}

function isMuted(mute: SignalRoutingMute, signal: ObservationSignal): boolean {
  return mute !== null && (mute.component === undefined || mute.component === signal.component);
}

function notificationKey(signal: ObservationSignal): string {
  return `${signal.component}:${signal.class}`;
}

function attemptOrdinal(open: RoutingOpen, channel: RoutedChannel): number {
  return open.attempts.filter((attempt) => attempt.channel === channel).length;
}

function openExternalRef(open: RoutingOpen): string | null {
  return open.attempts.find((attempt) =>
    attempt.channel === "kanban" && attempt.state === "DELIVERED" && attempt.external_ref !== null
  )?.external_ref ?? null;
}

function routeDisposition(input: Readonly<{
  state: RoutingState;
  signal: ObservationSignal;
  now: Date;
  policy: SignalRoutingPolicy;
  mute: SignalRoutingMute;
  bypassRateLimit: boolean;
}>): "EXECUTE" | "MUTED" | "RATE_LIMITED" {
  if (isMuted(input.mute, input.signal)) return "MUTED";
  if (input.bypassRateLimit) return "EXECUTE";
  const previous = input.state.key_notifications[notificationKey(input.signal)];
  if (previous !== undefined
    && input.now.getTime() - Date.parse(previous.at) < input.policy.rateLimitMs
    && !severityEscalates(previous.severity, input.signal.severity)) {
    return "RATE_LIMITED";
  }
  return "EXECUTE";
}

export async function createObservationSignalRouter(input: Readonly<{
  stateDir: string;
  delivery: RoutingDeliveryPort;
  executors: RoutingExecutors;
  configuration: ModuleConfigurationObject;
  thresholds: ModuleConfigurationObject;
  thresholdVersion: number;
  stormSummary?: StormSummaryExecutor;
  onChannelFailure?: (channel: RoutedChannel, at: Date) => void;
  onChannelResult?: (
    channel: RoutedChannel,
    outcome: "DELIVERED" | "FAILED",
    at: Date
  ) => void;
}>): Promise<SignalRouter> {
  let state = await readRoutingState(input.stateDir);
  let currentModule: RouterCurrentContext = Object.freeze({
    thresholdVersion: input.thresholdVersion,
    thresholds: input.thresholds
  });
  let currentMute: SignalRoutingMute = null;
  let persistQueue: Promise<void> = Promise.resolve();

  async function persist(): Promise<void> {
    persistQueue = persistQueue.then(() => writeRoutingState(input.stateDir, state));
    await persistQueue;
  }

  async function refreshAcknowledgements(): Promise<void> {
    for (const acknowledgement of await readAcknowledgements(input.stateDir)) {
      const open = state.opens[acknowledgement.signal_id];
      if (open !== undefined && open.acknowledged_at === null) {
        open.acknowledged_at = acknowledgement.acknowledged_at;
        state.latest_ack_signal_id = acknowledgement.signal_id;
      }
    }
  }

  async function executeAttempt(
    open: RoutingOpen,
    signal: ObservationSignal,
    pending: RoutingAttempt,
    route: Readonly<{
      now: Date;
      policy: SignalRoutingPolicy;
      mute: SignalRoutingMute;
    }>
  ): Promise<void> {
    if (pending.state !== "PENDING") return;
    if (pending.disposition === "EXECUTE" && isMuted(route.mute, signal)) {
      pending.disposition = "MUTED";
      await persist();
    }
    const disposition = pending.disposition;
    const storm = pending.purpose === "STORM_SUMMARY" ? state.latest_storm : null;
    const action: DeliveryAction = {
      signal,
      channel: pending.channel,
      disposition,
      now: route.now,
      ...(disposition === "EXECUTE" ? {
        execute: pending.purpose === "STORM_SUMMARY"
          ? async () => {
              if (storm === null || input.stormSummary === undefined) {
                throw new TypeError("OBSERVATION_STORM_SUMMARY_UNAVAILABLE");
              }
              return input.stormSummary(storm.root_component, storm.summary_count, route.now);
            }
          : () => input.executors[pending.channel](signal, route.now, {
              ordinal: pending.ordinal,
              openExternalRef: openExternalRef(open)
            })
      } : {})
    };
    const result = await input.delivery.attempt(action);
    pending.state = result.outcome;
    pending.external_ref = result.external_ref;
    state.last_deliveries[pending.channel] = {
      channel: result.channel,
      attempted_at: result.attempted_at,
      delivered_at: result.delivered_at,
      outcome: result.outcome,
      external_ref: result.external_ref
    };
    if (disposition === "EXECUTE" && signal.state === "OPEN") {
      state.key_notifications[notificationKey(signal)] = {
        at: route.now.toISOString(), severity: signal.severity
      };
    }
    if (result.outcome === "FAILED") input.onChannelFailure?.(pending.channel, route.now);
    if (result.outcome === "FAILED" || result.outcome === "DELIVERED") {
      input.onChannelResult?.(pending.channel, result.outcome, route.now);
    }
    if (pending.purpose === "STORM_SUMMARY" && state.latest_storm !== null
      && state.latest_storm.summary_signal_id === signal.signal_id) {
      if (result.outcome === "DELIVERED" && result.delivered_at !== null) {
        state.latest_storm.summary_delivered_at = result.delivered_at;
        state.latest_storm.state = "STORM_SUMMARY_SENT";
      }
    }
    await persist();
  }

  async function attempt(
    open: RoutingOpen,
    signal: ObservationSignal,
    channel: RoutedChannel,
    route: Readonly<{
      now: Date;
      policy: SignalRoutingPolicy;
      mute: SignalRoutingMute;
    }>,
    bypassRateLimit: boolean,
    dispositionOverride?: "EXECUTE" | "MUTED" | "RATE_LIMITED",
    purpose?: "STORM_SUMMARY"
  ): Promise<void> {
    const ordinal = attemptOrdinal(open, channel);
    if (open.attempts.some((item) => item.channel === channel
      && item.ordinal === ordinal && item.state !== "PENDING")) return;
    const disposition = dispositionOverride ?? routeDisposition({
      state, signal, now: route.now, policy: route.policy, mute: route.mute, bypassRateLimit
    });
    const pending: RoutingAttempt = {
      channel,
      ordinal,
      ...(purpose === undefined ? {} : { purpose }),
      disposition,
      state: "PENDING" as const,
      attempted_at: route.now.toISOString(),
      external_ref: null
    };
    open.attempts.push(pending);
    await persist();
    await executeAttempt(open, signal, pending, route);
  }

  async function resumePending(
    open: RoutingOpen,
    route: Readonly<{
      now: Date;
      policy: SignalRoutingPolicy;
      mute: SignalRoutingMute;
    }>
  ): Promise<boolean> {
    const pending = open.attempts.filter((attempt) => attempt.state === "PENDING");
    if (pending.length === 0) return false;
    await Promise.all(pending.map((attempt) => executeAttempt(open, open.signal, attempt, route)));
    if (open.signal.severity === "FATAL") {
      open.fatal_resends = Math.max(open.fatal_resends, ...pending.map((attempt) => attempt.ordinal));
    }
    if (open.signal.severity === "SEVERE"
      && pending.some((attempt) => attempt.channel === "sendmail")) {
      open.severe_email_sent = true;
    }
    await persist();
    return true;
  }

  async function cancelPending(
    open: RoutingOpen,
    route: Readonly<{
      now: Date;
      policy: SignalRoutingPolicy;
      mute: SignalRoutingMute;
    }>
  ): Promise<void> {
    const pending = open.attempts.filter((attempt) => attempt.state === "PENDING");
    if (pending.length === 0) return;
    for (const attempt of pending) attempt.disposition = "MUTED";
    await persist();
    await Promise.all(pending.map((attempt) => executeAttempt(open, open.signal, attempt, route)));
  }

  function reconcileEscalationMarkers(open: RoutingOpen): boolean {
    if (open.signal.severity === "SEVERE") {
      const sent = open.attempts.some((attempt) =>
        attempt.channel === "sendmail" && attempt.state !== "PENDING");
      if (sent && !open.severe_email_sent) {
        open.severe_email_sent = true;
        return true;
      }
      return false;
    }
    if (open.signal.severity !== "FATAL") return false;
    let completedOrdinal = -1;
    for (let ordinal = 0; ; ordinal += 1) {
      const complete = routedChannels("FATAL").every((channel) => open.attempts.some((attempt) =>
        attempt.channel === channel && attempt.ordinal === ordinal && attempt.state !== "PENDING"));
      if (!complete) break;
      completedOrdinal = ordinal;
    }
    const completedResends = Math.max(0, completedOrdinal);
    if (completedResends <= open.fatal_resends) return false;
    open.fatal_resends = completedResends;
    return true;
  }

  function stormPolicy(thresholds: ModuleConfigurationObject): Readonly<{
    count: number;
    windowSeconds: number;
  }> {
    return Object.freeze({
      count: Math.trunc(positiveNumber(thresholds, "storm_count", 5)),
      windowSeconds: Math.trunc(positiveNumber(thresholds, "storm_window_s", 60))
    });
  }

  async function registerStorm(
    signal: ObservationSignal,
    route: PersistedSignalRoutingInput
  ): Promise<"NONE" | "FORMED" | "ACTIVE"> {
    if (!isStormComponent(signal.component)) return "NONE";
    const existing = state.latest_storm;
    if (existing !== null && existing.state !== "QUIET") {
      const detectedAt = Date.parse(signal.detected_at);
      if (detectedAt >= Date.parse(existing.window_started_at)
        && detectedAt <= Date.parse(existing.window_ends_at)) {
        if (!existing.member_signal_ids.includes(signal.signal_id)) {
          existing.member_signal_ids.push(signal.signal_id);
          await persist();
        }
        return "ACTIVE";
      }
      return "NONE";
    }
    const policy = stormPolicy(route.module.thresholds);
    const detected = detectStorm(
      Object.values(state.opens).filter((open) => !open.closed).map((open) => open.signal),
      policy
    );
    if (detected === null
      || detected.memberSignalIds[detected.memberSignalIds.length - 1] !== signal.signal_id) {
      return "NONE";
    }
    state.latest_storm = {
      root_component: detected.rootComponent,
      member_signal_ids: [...detected.memberSignalIds],
      summary_signal_id: signal.signal_id,
      summary_count: detected.memberSignalIds.length,
      window_started_at: detected.windowStartedAt,
      window_ends_at: detected.windowEndsAt,
      fifth_detected_at: detected.fifthDetectedAt,
      summary_delivered_at: null,
      digest_written: false,
      state: "COLLECTING"
    };
    await persist();
    return "FORMED";
  }

  async function ensureStormSummary(route: Readonly<{
    now: Date;
    policy: SignalRoutingPolicy;
    mute: SignalRoutingMute;
  }>): Promise<void> {
    const storm = state.latest_storm;
    if (storm === null || storm.state !== "COLLECTING") return;
    if (!storm.digest_written) {
      await appendStormDigest(input.stateDir, {
        root: storm.root_component,
        count: storm.summary_count,
        fifthDetectedAt: storm.fifth_detected_at,
        summarySignalId: storm.summary_signal_id
      });
      storm.digest_written = true;
      await persist();
    }
    const open = state.opens[storm.summary_signal_id];
    if (open === undefined || open.attempts.some((item) => item.purpose === "STORM_SUMMARY")) return;
    await attempt(
      open,
      open.signal,
      "osascript",
      route,
      true,
      open.closed || open.acknowledged_at !== null || isMuted(route.mute, open.signal)
        ? "MUTED"
        : "EXECUTE",
      "STORM_SUMMARY"
    );
  }

  async function refreshStormState(now: Date): Promise<void> {
    const storm = state.latest_storm;
    if (storm === null || storm.state === "QUIET"
      || now.getTime() < Date.parse(storm.window_ends_at)) return;
    const recovered = storm.member_signal_ids.every((signalId) => state.opens[signalId]?.closed === true);
    if (recovered) {
      storm.state = "QUIET";
      await persist();
    }
  }

  async function initialOpen(route: PersistedSignalRoutingInput): Promise<void> {
    const signal = signalSchema.parse(route.signal);
    let open = state.opens[signal.signal_id];
    if (open === undefined) {
      open = {
        signal,
        closed: false,
        attempts: [],
        fatal_resends: 0,
        severe_email_sent: false,
        acknowledged_at: null
      };
      state.opens[signal.signal_id] = open;
      await persist();
    }
    if (open.attempts.length > 0) return;
    const stormRelation = await registerStorm(signal, route);
    const channels = routedChannels(signal.severity);
    const disposition = routeDisposition({
      state, signal, now: route.now, policy: route.policy, mute: route.mute, bypassRateLimit: false
    });
    const ordinaryChannels = stormRelation === "FORMED"
      ? channels.filter((channel) => channel !== "osascript")
      : channels;
    await Promise.all([
      ...ordinaryChannels.map((channel) => attempt(
        open,
        signal,
        channel,
        route,
        false,
        stormRelation === "ACTIVE" && channel === "osascript"
          ? isMuted(route.mute, signal) ? "MUTED" : "RATE_LIMITED"
          : disposition
      )),
      ...(stormRelation === "FORMED" ? [ensureStormSummary(route)] : [])
    ]);
  }

  async function clear(route: PersistedSignalRoutingInput): Promise<void> {
    const signal = signalSchema.parse(route.signal);
    if (signal.clears_signal_id === null) return;
    const open = state.opens[signal.clears_signal_id];
    if (open === undefined || open.closed) return;
    open.closed = true;
    await cancelPending(open, route);
    const osascriptRouted = open.attempts.some((attempt) =>
      attempt.channel === "osascript" && attempt.purpose !== "STORM_SUMMARY"
      && attempt.disposition === "EXECUTE");
    const ticketRef = openExternalRef(open);
    if (osascriptRouted) await attempt(open, signal, "osascript", route, true);
    if (ticketRef !== null) await attempt(open, signal, "kanban", route, true);
    await refreshStormState(route.now);
    await persist();
  }

  async function tickOpen(
    open: RoutingOpen,
    route: Readonly<{
      now: Date;
      policy: SignalRoutingPolicy;
      mute: SignalRoutingMute;
      module: RouterCurrentContext;
    }>
  ): Promise<void> {
    if (open.closed || open.acknowledged_at !== null) {
      await cancelPending(open, route);
      return;
    }
    if (reconcileEscalationMarkers(open)) await persist();
    if (await resumePending(open, route)) return;
    const openedAt = Date.parse(open.signal.detected_at);
    const escalationIntervalMs = positiveNumber(
      route.module.thresholds, "escalation_interval_ms", 1_800_000
    );
    if (open.signal.severity === "DEGRADED") {
      if (route.now.getTime() - openedAt >= route.policy.degradedAfterMs
        && !open.attempts.some((attempt) => attempt.channel === "osascript")) {
        await attempt(open, open.signal, "osascript", route, false);
      }
      return;
    }
    if (open.signal.severity === "SEVERE") {
      if (!open.severe_email_sent && route.now.getTime() - openedAt >= escalationIntervalMs) {
        await attempt(open, open.signal, "sendmail", route, true);
        open.severe_email_sent = true;
        await persist();
      }
      return;
    }
    if (open.signal.severity !== "FATAL") return;
    const maximum = Math.trunc(positiveNumber(route.module.thresholds, "fatal_resend_max", 3));
    if (open.fatal_resends >= maximum) return;
    const dueAt = openedAt + (open.fatal_resends + 1) * escalationIntervalMs;
    if (route.now.getTime() < dueAt) return;
    await Promise.all(routedChannels("FATAL").map((channel) =>
      attempt(open, open.signal, channel, route, true)));
    open.fatal_resends += 1;
    await persist();
  }

  function status(): readonly ModuleStatusProjection[] {
    const latestAck = state.latest_ack_signal_id;
    const fatalResends = Math.max(0, ...Object.values(state.opens).map((open) => open.fatal_resends));
    const storm = state.latest_storm;
    const policy = stormPolicy(currentModule.thresholds);
    const notify = configurationObject(input.configuration.notify);
    const captureDirectory = typeof notify?.dev_capture_dir === "string"
      ? notify.dev_capture_dir
      : "dev-mail-capture";
    const board = typeof currentModule.thresholds.board === "string"
      ? currentModule.thresholds.board
      : "ops-alerts";
    const lastOutcomes = Object.values(state.last_deliveries).map((delivery) => delivery.outcome);
    const projections: ModuleStatusProjection[] = [
      Object.freeze({ kind: "channels", key: "route.fatal", channels: [
        "osascript", "sendmail", "kanban", "digest", "status"
      ] as const }),
      Object.freeze({ kind: "channels", key: "route.severe", channels: [
        "osascript", "kanban", "digest", "status"
      ] as const }),
      Object.freeze({ kind: "channels", key: "route.degraded", channels: ["digest", "status"] as const }),
      Object.freeze({ kind: "channels", key: "route.info", channels: ["digest", "status"] as const }),
      Object.freeze({ kind: "channels", key: "route.cleared.always",
        channels: ["digest", "status"] as const }),
      Object.freeze({ kind: "channels", key: "route.cleared.if-routed",
        channels: ["osascript"] as const }),
      Object.freeze({ kind: "channels", key: "route.cleared.if-ticketed",
        channels: ["kanban"] as const }),
      Object.freeze({ kind: "state", key: "ack.state", state: latestAck === null ? "OPEN_UNACKED" : "ACKED" }),
      Object.freeze({ kind: "uuid", key: "ack.signal", value: latestAck }),
      Object.freeze({ kind: "state", key: "routing.mute", state:
        currentMute === null ? "OPEN" : "MUTED" }),
      Object.freeze({ kind: "state", key: "routing.rate-limit", state:
        lastOutcomes.includes("RATE_LIMITED") ? "RATE_LIMITED" : "OPEN" }),
      Object.freeze({ kind: "metric", key: "escalation.fatal", value: fatalResends, unit: "COUNT" }),
      Object.freeze({ kind: "identifier", key: "board", identifierType: "board", value: board }),
      Object.freeze({ kind: "state_child_path", key: "sendmail.capture",
        segments: Object.freeze([captureDirectory]) }),
      Object.freeze({ kind: "template", key: "storm", template: "COUNT_SECONDS_THRESHOLD",
        count: policy.count, windowSeconds: policy.windowSeconds }),
      Object.freeze({ kind: "state", key: "storm.state", state: storm?.state ?? "QUIET" })
    ];
    if (storm !== null) {
      projections.push(
        Object.freeze({ kind: "component", key: "storm.root", component: storm.root_component }),
        Object.freeze({ kind: "metric", key: "storm.members",
          value: storm.member_signal_ids.length, unit: "COUNT" }),
        Object.freeze({ kind: "timestamp", key: "storm.fifth_detected_at",
          value: new Date(storm.fifth_detected_at) }),
        Object.freeze({ kind: "timestamp", key: "storm.summary_delivered_at",
          value: storm.summary_delivered_at === null ? null : new Date(storm.summary_delivered_at) })
      );
      if (storm.summary_delivered_at !== null) projections.push(Object.freeze({
        kind: "metric",
        key: "storm.summary_delay",
        value: (Date.parse(storm.summary_delivered_at) - Date.parse(storm.fifth_detected_at)) / 1_000,
        unit: "SECONDS"
      }));
      for (const [index, signalId] of storm.member_signal_ids.entries()) projections.push(Object.freeze({
        kind: "uuid", key: `storm.member.${index + 1}`, value: signalId
      }));
    }
    for (const channel of ["osascript", "sendmail", "kanban"] as const) {
      const delivery = state.last_deliveries[channel];
      if (delivery === undefined) continue;
      projections.push(Object.freeze({
        kind: "state", key: `channel.${channel}.outcome`, state: delivery.outcome
      }));
      projections.push(Object.freeze({
        kind: "timestamp", key: `channel.${channel}.last_attempt`,
        value: new Date(delivery.attempted_at)
      }));
      if (delivery.external_ref !== null) projections.push(Object.freeze({
        kind: "identifier", key: `channel.${channel}.external_ref`,
        identifierType: "external_ref", value: delivery.external_ref
      }));
    }
    return Object.freeze(projections);
  }

  return Object.freeze({
    async onSignal(route) {
      await refreshAcknowledgements();
      if (route.signal.state === "CLEARED") await clear(route);
      else await initialOpen(route);
      currentModule = route.module;
      currentMute = route.mute;
    },
    async onTick(route) {
      await refreshAcknowledgements();
      await ensureStormSummary(route);
      for (const open of Object.values(state.opens)) await tickOpen(open, route);
      await refreshStormState(route.now);
      await persist();
      currentModule = route.module;
      currentMute = route.mute;
    },
    status
  });
}
