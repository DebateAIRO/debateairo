import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readHostCapacity } from "../../apps/observation-agent/src/modules/host-capacity/commands.js";
import { createHostCapacityModule } from "../../apps/observation-agent/src/modules/host-capacity/module.js";

const database = Object.freeze({
  async withClient<T>(): Promise<T> { throw new Error("UNUSED_DATABASE_PORT"); }
});

describe("OBS-05 Docker and host collection", () => {
  it("executes only frozen read-only requests and emits numeric container samples", async () => {
    const calls: string[] = [];
    const observedAt = new Date("2026-09-03T12:00:00.000Z");
    const snapshot = await readHostCapacity(observedAt, {
      runHost: async (command) => {
        calls.push(`host:${command}`);
        if (command === "df") return "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/root 1000 800 200 80% /\n";
        if (command === "vm_stat") return "Mach Virtual Memory Statistics: (page size of 4096 bytes)\nPages free: 100.\nPages inactive: 200.\nPages speculative: 10.\n";
        if (command === "memory_total") return "4096000\n";
        if (command === "load_average") return "{ 1.50 1.00 0.50 }\n";
        return "10\n";
      },
      runDocker: async (command, operands) => {
        calls.push(`docker:${command}:${operands.join("|")}`);
        if (command === "systemDf") return Object.freeze({
          stdout: '{"Type":"Images","Size":"1GB"}\n', stderr: "", exitCode: 0
        });
        return Object.freeze({
          stdout: [
            '{"Name":"debateai-v3-postgres-1","CPUPerc":"5%","MemUsage":"10MiB / 1GiB","MemPerc":"1%"}',
            '{"Name":"debateai-v3-hatchet-lite-1","CPUPerc":"7%","MemUsage":"20MiB / 2GiB","MemPerc":"1%"}'
          ].join("\n"), stderr: "", exitCode: 0
        });
      }
    });
    expect(calls).toEqual([
      "host:df", "host:vm_stat", "host:memory_total", "host:load_average", "host:logical_cores",
      "docker:systemDf:--format|{{json .}}",
      "docker:stats:--format|{{json .}}|debateai-v3-postgres-1|debateai-v3-hatchet-lite-1"
    ]);
    expect(snapshot.containers.map(({ name }) => name)).toEqual([
      "debateai-v3-postgres-1", "debateai-v3-hatchet-lite-1"
    ]);

    const module = createHostCapacityModule({ readSnapshot: async () => snapshot });
    const observations = await module.probe({
      now: observedAt, timeoutMs: 2_000, database, stateDir: "unused",
      targets: [], targetFragment: null, configuration: {}, thresholds: {}
    });
    const samples = module.samples(observations, { now: observedAt });
    expect(samples).toHaveLength(17);
    expect(samples.every(({ value }) => typeof value === "number" && Number.isFinite(value))).toBe(true);
    expect(samples.map(({ metricKey }) => metricKey)).toEqual(expect.arrayContaining([
      "capacity.host.disk.free_percent",
      "capacity.docker.disk_bytes",
      "capacity.container.debateai-v3-postgres-1.cpu_percent",
      "capacity.container.debateai-v3-postgres-1.memory_used_bytes",
      "capacity.container.debateai-v3-postgres-1.memory_limit_bytes",
      "capacity.container.debateai-v3-hatchet-lite-1.memory_percent"
    ]));
    expect(observations[0]?.status?.map(({ key }) => key)).toEqual(expect.arrayContaining([
      "host.disk.free_percent", "docker.disk_bytes", "host.memory.available_percent",
      "host.load.one_minute", "host.logical_cores",
      "container.debateai-v3-postgres-1.cpu_percent",
      "container.debateai-v3-hatchet-lite-1.memory_percent"
    ]));
  });

  it("contains a bounded Docker collection timeout as UNKNOWN and retries on the next cadence", async () => {
    const observedAt = new Date("2026-09-03T12:00:00.000Z");
    let attempts = 0;
    const module = createHostCapacityModule({
      async readSnapshot() {
        attempts += 1;
        throw new Error("OBSERVATION_CAPACITY_DOCKER_FAILED");
      }
    });
    const context = {
      now: observedAt, timeoutMs: 2_000, database, stateDir: "unused",
      repoRoot: resolve("."),
      targets: [], targetFragment: null, configuration: {}, thresholds: {}
    } as const;

    await expect(module.probe(context)).resolves.toEqual([expect.objectContaining({
      component: "host",
      management: "module",
      ok: false,
      lastStatus: "UNKNOWN",
      statusState: "UNKNOWN",
      status: [expect.objectContaining({ key: "host.capacity", state: "UNKNOWN" })]
    })]);
    expect(module.samples([], { now: observedAt })).toEqual([]);
    expect(module.signals([], {
      now: observedAt,
      thresholdVersion: 7,
      targetFragment: null,
      configuration: {},
      thresholds: {}
    })).toEqual([]);

    await expect(module.probe({ ...context, now: new Date(observedAt.getTime() + 30_000) }))
      .resolves.toHaveLength(1);
    expect(attempts).toBe(2);
  });
});
