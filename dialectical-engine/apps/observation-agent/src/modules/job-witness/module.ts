import type { Module, SignalIntent } from "../../core/types.js";
import {
  createScheduleTracker,
  projectJobWitnessStatus,
  readLastJobCompletions
} from "./witness.js";

const tracker = createScheduleTracker(new Date());
let pendingIntents: readonly SignalIntent[] = Object.freeze([]);

const jobWitnessModule: Module = Object.freeze({
  name: "job-witness",
  cadence: Object.freeze({ intervalMs: 15_000, timeoutMs: 2_000 }),
  lifecycle: Object.freeze({
    legacyCorrelationKey: tracker.legacyCorrelationKey,
    restore: tracker.restore
  }),
  async probe(ctx) {
    const completions = await readLastJobCompletions(ctx.databaseUrl).catch(() => Object.freeze([]));
    const projected = projectJobWitnessStatus(completions, ctx.thresholds);
    pendingIntents = tracker.observe(completions, ctx.thresholds, ctx.now);
    return Object.freeze([Object.freeze({
      component: "observation_agent" as const,
      ok: true,
      class: "AGENT_SELF" as const,
      probe: "heartbeat_write",
      lastStatus: "READY",
      observedAt: ctx.now,
      management: "module" as const,
      statusState: "UP" as const,
      status: projected.projections
    })]);
  },
  samples() { return Object.freeze([]); },
  signals() {
    const intents = pendingIntents;
    pendingIntents = Object.freeze([]);
    return intents;
  }
});

export default jobWitnessModule;
