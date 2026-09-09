import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ObservationModuleRuntime } from "../../apps/observation-agent/src/core/runtime.js";
import type {
  Module,
  ModuleConfigurationObject,
  ModuleStatusProjection
} from "../../apps/observation-agent/src/core/types.js";
import { createStatusPageModule } from "../../apps/observation-agent/src/modules/status-page/module.js";
import { startStatusPage, type StatusPageServer } from "../../apps/observation-agent/src/modules/status-page/status-page.js";

const servers: Server[] = [];
const statusServers: StatusPageServer[] = [];

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.close((error) => error === undefined ? resolvePromise() : rejectPromise(error));
  });
}

afterEach(async () => {
  await Promise.all(statusServers.splice(0).map(async (server) => {
    await new Promise<void>((resolvePromise) => {
      try { server.close(); } finally { resolvePromise(); }
    });
  }));
  await Promise.all(servers.splice(0).map((server) => closeServer(server).catch(() => undefined)));
});

async function occupyStatusPort(): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(9797, "127.0.0.1", resolvePromise);
  });
  servers.push(server);
  return server;
}

function sentinel(runs: Date[]): Module {
  return Object.freeze({
    name: "sentinel",
    cadence: Object.freeze({ intervalMs: 30_000, timeoutMs: 2_000 }),
    async probe(context) { runs.push(context.now); return Object.freeze([]); },
    samples() { return Object.freeze([]); },
    signals() { return Object.freeze([]); }
  });
}

describe("OBS-07 status bind containment", () => {
  const probeContext = (thresholds: ModuleConfigurationObject) => ({
    now: new Date("2026-09-06T09:30:00.000Z"),
    timeoutMs: 2_000,
    database: {} as never,
    stateDir: "/tmp/obs-07-status-configuration",
    repoRoot: process.cwd(),
    targets: [],
    targetFragment: null,
    configuration: {},
    thresholds
  });

  it("contains an occupied loopback port, runs later modules, cleans up, and retries", async () => {
    const blocker = await occupyStatusPort();
    const starts: StatusPageServer[] = [];
    const statusModule = createStatusPageModule({
      async start(input) {
        const server = await startStatusPage(input);
        starts.push(server);
        statusServers.push(server);
        return server;
      }
    });
    const sentinelRuns: Date[] = [];
    const updates: Array<Readonly<{
      moduleName: string;
      projections: readonly ModuleStatusProjection[];
    }>> = [];
    const runtime = new ObservationModuleRuntime({
      modules: [statusModule, sentinel(sentinelRuns)],
      nextSequence: () => 1,
      nextSignalId: () => "77000000-0000-4000-8000-000000000801",
      sampleStore: { async write() {} },
      async emitSignal() {},
      updateModuleStatus(moduleName, update) {
        updates.push({ moduleName, projections: update.projections });
      }
    });
    const first = new Date("2026-09-06T09:00:00.000Z");
    const input = (now: Date, thresholds: ModuleConfigurationObject = { port: 9797 }) => ({
      modules: [statusModule, sentinel(sentinelRuns)], now, timeoutMs: 2_000,
      database: {} as never, stateDir: "/tmp/obs-07-status-recovery", repoRoot: process.cwd(),
      targets: [], moduleThresholds: { "status-page": thresholds }, thresholdVersion: 7
    });

    await expect(runtime.run(input(first))).resolves.toEqual([]);
    expect(sentinelRuns).toEqual([first]);
    expect(updates.find((update) => update.moduleName === "status-page")?.projections)
      .toEqual([
        { kind: "state", key: "status.health", state: "DEGRADED" },
        { kind: "loopback_endpoint", key: "status", port: 9797, path: "/status" }
      ]);
    expect(starts).toHaveLength(0);

    await closeServer(blocker);
    servers.splice(servers.indexOf(blocker), 1);
    const second = new Date(first.getTime() + 30_001);
    await expect(runtime.run(input(second))).resolves.toEqual([]);
    expect(sentinelRuns).toEqual([first, second]);
    expect(starts).toHaveLength(1);
    expect(updates.filter((update) => update.moduleName === "status-page").at(-1)?.projections)
      .toEqual([{ kind: "loopback_endpoint", key: "status", port: 9797, path: "/status" }]);
  });

  it.each([
    ["wrong numeric port", { port: 9798 }],
    ["numeric string port", { port: "9797" }],
    ["NaN port", { port: Number.NaN }],
    ["infinite port", { port: Number.POSITIVE_INFINITY }],
    ["fractional port", { port: 9797.5 }],
    ["null port", { port: null }],
    ["array port", { port: [9797] }],
    ["nested port", { port: { value: 9797 } }],
    ["boolean port", { port: true }],
    ["non-loopback host", { host: "0.0.0.0" }],
    ["unsupported fixed host", { host: "127.0.0.1" }],
    ["wrong path", { path: "/other" }],
    ["unsupported fixed path", { path: "/status" }],
    ["unknown key", { unexpected: true }]
  ])("rejects %s before creating the status server", async (_name, rawThresholds) => {
    let starts = 0;
    const invalid = createStatusPageModule({
      async start() {
        starts += 1;
        return {} as StatusPageServer;
      }
    });

    await expect(invalid.probe(probeContext(
      rawThresholds as unknown as ModuleConfigurationObject
    ))).rejects.toMatchObject({
      name: "ObservationError",
      code: "OBSERVATION_STATUS_BIND_INVALID"
    });
    expect(starts).toBe(0);
  });

  it.each([
    ["missing port", {}],
    ["the exact ratified port", { port: 9797 }]
  ])("starts the fixed endpoint for %s", async (_name, thresholds) => {
    let starts = 0;
    const valid = createStatusPageModule({
      async start(input) {
        starts += 1;
        expect(input).toEqual({
          stateDir: "/tmp/obs-07-status-configuration",
          port: 9797
        });
        return {} as StatusPageServer;
      }
    });

    await expect(valid.probe(probeContext(thresholds))).resolves.toHaveLength(1);
    expect(starts).toBe(1);
  });

  it("keeps unexpected startup errors fatal", async () => {

    const unexpected = createStatusPageModule({
      async start() { throw new Error("UNEXPECTED_STATUS_FAILURE"); }
    });
    await expect(unexpected.probe(probeContext({ port: 9797 })))
      .rejects.toThrow("UNEXPECTED_STATUS_FAILURE");
  });
});
