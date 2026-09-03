import type {
  Module,
  ModuleConfigurationObject,
  ProbeObservation,
  SignalIntent,
  StatusState
} from "../../core/types.js";
import { createAlwaysExpectedTracker } from "../expectations/always.js";
import { createExpectedSetTracker, DEV_STACK_MEMBERS } from "../expectations/state.js";
import { createProbeLatencyTracker } from "./latency.js";
import { runProductLivenessProbes } from "./probes.js";

const defaults = Object.freeze({
  openAfterFailures: 2,
  clearAfterSuccesses: 2,
  groupMemoryMs: 600_000,
  absentAfterMs: 60_000,
  kanbanProbeIntervalMs: 30_000,
  latencyWindowMs: 300_000,
  apiLatencyMs: 500,
  uiLatencyMs: 2_000,
  tlsLatencyMs: 2_500
});

function numberValue(input: ModuleConfigurationObject, key: string, fallback: number): number {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function metricValue(observation: ProbeObservation): number | null {
  const projection = observation.status?.find((item) =>
    item.kind === "metric" && item.key === `probe.${observation.component}.latency_ms`);
  return projection?.kind === "metric" ? projection.value : null;
}

const startedAt = new Date();
const expectedSet = createExpectedSetTracker({
  openAfterFailures: defaults.openAfterFailures,
  clearAfterSuccesses: defaults.clearAfterSuccesses,
  groupMemoryMs: defaults.groupMemoryMs
});
const kanbanExpectation = createAlwaysExpectedTracker({
  component: "kanban",
  agentStartedAt: startedAt,
  openAfterFailures: defaults.openAfterFailures,
  clearAfterSuccesses: defaults.clearAfterSuccesses,
  absentAfterMs: defaults.absentAfterMs
});
const latency = createProbeLatencyTracker({
  windowMs: defaults.latencyWindowMs,
  thresholdsMs: {
    api: defaults.apiLatencyMs, ui: defaults.uiLatencyMs, tls_front_door: defaults.tlsLatencyMs
  }
});
let lastKanbanProbeAt: number | null = null;
let pendingIntents: readonly SignalIntent[] = Object.freeze([]);

const productLivenessModule: Module = Object.freeze({
  name: "product-liveness",
  cadence: Object.freeze({ intervalMs: 5_000, timeoutMs: 2_000 }),
  targetFragmentBasename: "OBS-02.json",
  async probe(ctx) {
    const openAfterFailures = numberValue(ctx.thresholds, "open_after_failures", defaults.openAfterFailures);
    const clearAfterSuccesses = numberValue(ctx.thresholds, "clear_after_successes", defaults.clearAfterSuccesses);
    const groupMemoryMs = numberValue(ctx.thresholds, "group_memory_ms", defaults.groupMemoryMs);
    const absentAfterMs = numberValue(ctx.thresholds, "never_started_ms", defaults.absentAfterMs);
    const kanbanProbeIntervalMs = numberValue(
      ctx.thresholds, "kanban_probe_interval_ms", defaults.kanbanProbeIntervalMs
    );
    const latencyWindowMs = numberValue(ctx.thresholds, "latency_window_ms", defaults.latencyWindowMs);
    const apiLatencyMs = numberValue(ctx.thresholds, "api_latency_threshold_ms", defaults.apiLatencyMs);
    const uiLatencyMs = numberValue(ctx.thresholds, "ui_latency_threshold_ms", defaults.uiLatencyMs);
    const tlsLatencyMs = numberValue(
      ctx.thresholds, "tls_front_door_latency_threshold_ms", defaults.tlsLatencyMs
    );
    expectedSet.updatePolicy({ openAfterFailures, clearAfterSuccesses, groupMemoryMs });
    kanbanExpectation.updatePolicy({ openAfterFailures, clearAfterSuccesses, absentAfterMs });
    latency.updatePolicy({
      windowMs: latencyWindowMs,
      thresholdsMs: { api: apiLatencyMs, ui: uiLatencyMs, tls_front_door: tlsLatencyMs }
    });

    const dueTargets = ctx.targets.filter((candidate) => {
      const component = (candidate as Readonly<{ component?: unknown }>).component;
      return component !== "kanban" || lastKanbanProbeAt === null
        || ctx.now.getTime() - lastKanbanProbeAt >= kanbanProbeIntervalMs;
    });
    if (dueTargets.some((candidate) =>
      (candidate as Readonly<{ component?: unknown }>).component === "kanban")) {
      lastKanbanProbeAt = ctx.now.getTime();
    }
    const raw = await runProductLivenessProbes({ targets: dueTargets, timeoutMs: ctx.timeoutMs });
    const expected = expectedSet.observe(raw, ctx.now);
    const intents: SignalIntent[] = [...expected.intents];
    for (const observation of raw) {
      const latencyMs = metricValue(observation);
      if (latencyMs !== null && ["api", "ui", "tls_front_door", "runner", "kanban"]
        .includes(observation.component)) {
        intents.push(...latency.observe(
          observation.component as "api" | "ui" | "tls_front_door" | "runner" | "kanban",
          latencyMs,
          ctx.now
        ));
      }
    }
    const kanban = raw.find((observation) => observation.component === "kanban");
    const kanbanState = kanbanExpectation.observe(kanban, ctx.now);
    intents.push(...kanbanState.intents);
    pendingIntents = Object.freeze(intents);

    const managed = raw.map((observation): ProbeObservation => Object.freeze({
      ...observation,
      observedAt: ctx.now,
      management: "module",
      statusState: DEV_STACK_MEMBERS.includes(observation.component as never)
        ? expected.memberStates[observation.component as keyof typeof expected.memberStates]
        : observation.component === "kanban" ? kanbanState.state : (observation.ok ? "UP" : "DOWN")
    }));
    managed.push(Object.freeze({
      component: "dev_stack",
      ok: expected.groupState === "RUNNING",
      class: "INFRA_DOWN",
      probe: "expected_set",
      lastStatus: expected.groupState,
      observedAt: ctx.now,
      management: "module",
      statusState: expected.groupState,
      status: Object.freeze([
        Object.freeze({
          kind: "timestamp" as const,
          key: "dev_stack.last_member_up_at",
          value: expected.lastMemberUpAt
        }),
        Object.freeze({
          kind: "template" as const,
          key: "evaluator_worker",
          template: "EVALUATOR_UNBOUND_BY_REGISTER" as const
        })
      ])
    }));
    return Object.freeze(managed);
  },
  samples(observations, ctx) {
    return Object.freeze(observations.flatMap((observation) =>
      (observation.status ?? []).flatMap((projection) =>
        projection.kind === "metric" && projection.key.startsWith("probe.")
          ? [Object.freeze({ metricKey: projection.key, value: projection.value, observedAt: ctx.now })]
          : [])));
  },
  signals() {
    const intents = pendingIntents;
    pendingIntents = Object.freeze([]);
    return intents;
  }
});

export default productLivenessModule;
