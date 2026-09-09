import { describe, expect, it } from "vitest";
import { createContainerWitness } from "../../apps/observation-agent/src/modules/witness/state.js";

const started = new Date("2026-09-03T08:00:00.000Z");
const inspection = (input: Partial<{
  status: string; startedAt: Date | null; finishedAt: Date | null; restartCount: number;
  restartPolicy: string; exitCode: number;
}> = {}) => ({
  component: "hatchet" as const,
  container: "debateai-v3-hatchet-lite-1",
  status: input.status ?? "running",
  startedAt: input.startedAt === undefined ? new Date("2026-09-03T08:00:01.000Z") : input.startedAt,
  finishedAt: input.finishedAt ?? null,
  restartCount: input.restartCount ?? 0,
  restartPolicy: input.restartPolicy ?? "no",
  exitCode: input.exitCode ?? 0
});

describe("OBS-02 container restart and never-start witnesses", () => {
  it("opens-and-clears one restart receipt with old and new Docker timestamps", () => {
    const witness = createContainerWitness({ agentStartedAt: started, absentAfterMs: 60_000 });
    expect(witness.observe([inspection()], new Date("2026-09-03T08:00:05.000Z")).intents).toEqual([]);
    const changed = witness.observe([inspection({
      startedAt: new Date("2026-09-03T08:00:20.000Z"), restartCount: 1
    })], new Date("2026-09-03T08:00:25.000Z"));
    expect(changed.intents).toEqual([
      expect.objectContaining({
        component: "hatchet", class: "RESTART_WITNESSED", state: "OPEN",
        severity: "INFO", impactCode: "IMPACT_RESTART",
        evidence: {
          old_started_at: "2026-09-03T08:00:01.000Z",
          new_started_at: "2026-09-03T08:00:20.000Z",
          restart_count: 1, restart_policy: "no", exit_code: 0
        }
      }),
      expect.objectContaining({
        component: "hatchet", class: "RESTART_WITNESSED", state: "CLEARED",
        severity: "INFO", impactCode: "IMPACT_CLEARED"
      })
    ]);
    expect(witness.observe([inspection({
      startedAt: new Date("2026-09-03T08:00:20.000Z"), restartCount: 1
    })], new Date("2026-09-03T08:00:30.000Z")).intents).toEqual([]);
  });

  it("opens EXPECTED_ABSENT at 60 seconds without first-seen and clears on appearance", () => {
    const witness = createContainerWitness({ agentStartedAt: started, absentAfterMs: 60_000 });
    const absent = inspection({ status: "exited", startedAt: null, exitCode: 137 });
    expect(witness.observe([absent], new Date("2026-09-03T08:00:59.999Z")).intents).toEqual([]);
    expect(witness.observe([absent], new Date("2026-09-03T08:01:00.000Z")).intents)
      .toEqual([expect.objectContaining({
        correlationKey: "expected:hatchet", component: "hatchet", class: "EXPECTED_ABSENT",
        state: "OPEN", severity: "SEVERE", impactCode: "IMPACT_EXPECTED_ABSENT",
        evidence: { expected: "always", absent_for_s: 60, first_observed_at: "2026-09-03T08:00:00.000Z" }
      })]);
    expect(witness.observe([inspection()], new Date("2026-09-03T08:01:05.000Z")).intents)
      .toEqual([expect.objectContaining({
        correlationKey: "expected:hatchet", component: "hatchet", class: "EXPECTED_ABSENT",
        state: "CLEARED", impactCode: "IMPACT_CLEARED"
      })]);
  });
});
