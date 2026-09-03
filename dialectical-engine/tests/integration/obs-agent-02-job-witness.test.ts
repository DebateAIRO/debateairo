import { describe, expect, it } from "vitest";
import {
  createScheduleTracker,
  projectJobWitnessStatus,
  runWitnessCommand
} from "../../apps/observation-agent/src/modules/job-witness/witness.js";

describe("OBS-02 scheduler completion witness", () => {
  it("records one parsed JSON receipt and preserves the child's exact exit code", async () => {
    const receipts: unknown[] = [];
    const invocations: unknown[] = [];
    const output: string[] = [];
    const code = await runWitnessCommand(
      ["--job", "replay-self-test", "--", "pnpm", "job:replay-self-test"],
      {
        now: (() => {
          const values = [
            new Date("2026-09-03T08:00:00.000Z"),
            new Date("2026-09-03T08:00:02.000Z")
          ];
          return () => values.shift()!;
        })(),
        runChild: async (file, args) => {
          invocations.push({ file, args });
          return { exitCode: 7, stdout: '{"checked":1}\n', stderr: "job warning\n" };
        },
        record: async (receipt) => { receipts.push(receipt); },
        stdout: (value) => output.push(`out:${value}`),
        stderr: (value) => output.push(`err:${value}`)
      }
    );
    expect(code).toBe(7);
    expect(invocations).toEqual([{ file: "pnpm", args: ["job:replay-self-test"] }]);
    expect(receipts).toEqual([{
      job: "replay-self-test", startedAt: new Date("2026-09-03T08:00:00.000Z"),
      completedAt: new Date("2026-09-03T08:00:02.000Z"), exitCode: 7, reportOk: true
    }]);
    expect(output).toEqual(["out:{\"checked\":1}\n", "err:job warning\n"]);
  });

  it("records report_ok false for polluted or missing JSON without creating a product signal", async () => {
    const receipts: Array<Readonly<{ reportOk: boolean }>> = [];
    for (const stdout of ["", "title\n{}\n"]) {
      expect(await runWitnessCommand(
        ["--job", "settlement-watch", "--", "pnpm", "job:settlement-watch"],
        {
          now: () => new Date("2026-09-03T08:00:00.000Z"),
          runChild: async () => ({ exitCode: 0, stdout, stderr: "" }),
          record: async (receipt) => { receipts.push(receipt); }, stdout() {}, stderr() {}
        }
      )).toBe(0);
    }
    expect(receipts).toEqual([
      expect.objectContaining({ reportOk: false }),
      expect.objectContaining({ reportOk: false })
    ]);
    expect(projectJobWitnessStatus([], {})).toMatchObject({ intents: [] });
  });

  it("rejects a polluted job name through typed oactl output", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const { runOactl } = await import(
      "../../apps/observation-agent/src/oactl/core/commands.js"
    );
    expect(await runOactl(
      ["witness", "--job", "replay-self-test;rm", "--", "echo", "{}"],
      { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) }
    )).toBe(2);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["OBSERVATION_ARGUMENTS_INVALID"]);
  });

  it("opens only after a ruled cadence plus grace and clears on a fresh completion", () => {
    const tracker = createScheduleTracker(new Date("2026-09-03T08:00:00.000Z"));
    const thresholds = {
      schedule: { "replay-self-test": { cadence_s: 60, grace_s: 15 } }
    } as const;
    expect(tracker.observe([], thresholds, new Date("2026-09-03T08:01:14.999Z"))).toEqual([]);
    expect(tracker.observe([], thresholds, new Date("2026-09-03T08:01:15.000Z")))
      .toEqual([expect.objectContaining({
        component: "scheduler.replay-self-test", class: "SCHEDULE_MISSED",
        state: "OPEN", severity: "SEVERE", impactCode: "IMPACT_SCHEDULE_MISSED"
      })]);
    expect(tracker.observe([{
      job: "replay-self-test", completedAt: new Date("2026-09-03T08:01:16.000Z"),
      exitCode: 0, reportOk: true
    }], thresholds, new Date("2026-09-03T08:01:16.000Z")))
      .toEqual([expect.objectContaining({
        component: "scheduler.replay-self-test", state: "CLEARED", impactCode: "IMPACT_CLEARED"
      })]);
  });

  it("prints NO SCHEDULE RULED projections plus the last completion receipt", () => {
    const projected = projectJobWitnessStatus([{
      job: "replay-self-test", completedAt: new Date("2026-09-03T08:00:02.000Z"),
      exitCode: 7, reportOk: true
    }], {});
    expect(projected.projections).toContainEqual({
      kind: "template", key: "scheduler.replay-self-test", template: "NO_SCHEDULE_RULED"
    });
    expect(projected.projections).toContainEqual({
      kind: "timestamp", key: "scheduler.replay-self-test.last_completion",
      value: new Date("2026-09-03T08:00:02.000Z")
    });
    expect(projected.projections).toContainEqual({
      kind: "metric", key: "scheduler.replay-self-test.exit_code", value: 7, unit: "COUNT"
    });
  });
});
