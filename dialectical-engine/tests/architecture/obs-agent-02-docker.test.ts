import { describe, expect, it } from "vitest";
import { inspectExpectedContainers } from "../../apps/observation-agent/src/modules/witness/inspect.js";

describe("OBS-02 Docker witness argv boundary", () => {
  it("uses only read-only inspect with the exact two ruled container names", async () => {
    const calls: unknown[] = [];
    const result = await inspectExpectedContainers({
      now: new Date("2026-09-03T08:00:00.000Z"),
      timeoutMs: 2_000,
      runDocker: async (command, operands, timeoutMs) => {
        calls.push({ command, operands, timeoutMs });
        return {
          exitCode: 0, stderr: "", stdout: JSON.stringify({
            State: {
              Status: "exited", StartedAt: "2026-09-03T07:00:00.000Z",
              FinishedAt: "2026-09-03T07:30:00.000Z", ExitCode: 7
            },
            RestartCount: 2,
            HostConfig: { RestartPolicy: { Name: "no" } }
          })
        };
      }
    });
    expect(calls).toEqual([
      {
        command: "inspect", operands: ["--format", "{{json .}}", "debateai-v3-postgres-1"],
        timeoutMs: 2_000
      },
      {
        command: "inspect", operands: ["--format", "{{json .}}", "debateai-v3-hatchet-lite-1"],
        timeoutMs: 2_000
      }
    ]);
    expect(result).toEqual([
      expect.objectContaining({ component: "postgres", status: "exited", restartPolicy: "no", exitCode: 7 }),
      expect.objectContaining({ component: "hatchet", status: "exited", restartPolicy: "no", exitCode: 7 })
    ]);
  });
});
