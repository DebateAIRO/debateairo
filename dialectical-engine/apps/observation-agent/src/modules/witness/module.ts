import type { Module, SignalIntent } from "../../core/types.js";
import { inspectExpectedContainers } from "./inspect.js";
import { createContainerWitness } from "./state.js";

const startedAt = new Date();
const witness = createContainerWitness({ agentStartedAt: startedAt, absentAfterMs: 60_000 });
let pendingIntents: readonly SignalIntent[] = Object.freeze([]);

const witnessModule: Module = Object.freeze({
  name: "witness",
  cadence: Object.freeze({ intervalMs: 5_000, timeoutMs: 2_000 }),
  lifecycle: Object.freeze({
    legacyCorrelationKey: witness.legacyCorrelationKey,
    restore: witness.restore
  }),
  async probe(ctx) {
    const configured = ctx.thresholds.never_started_ms;
    witness.updatePolicy({
      absentAfterMs: typeof configured === "number" && configured > 0 ? configured : 60_000
    });
    const evaluation = witness.observe(await inspectExpectedContainers({
      now: ctx.now, timeoutMs: ctx.timeoutMs
    }), ctx.now);
    pendingIntents = evaluation.intents;
    return Object.freeze([Object.freeze({
      component: "observation_agent" as const,
      ok: true,
      class: "AGENT_SELF" as const,
      probe: "docker_inspect",
      lastStatus: "READY",
      observedAt: ctx.now,
      management: "module" as const,
      statusState: "UP" as const,
      status: evaluation.projections
    })]);
  },
  samples() { return Object.freeze([]); },
  signals() {
    const intents = pendingIntents;
    pendingIntents = Object.freeze([]);
    return intents;
  }
});

export default witnessModule;
