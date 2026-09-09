import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createObservationDatabasePort } from "../../apps/observation-agent/src/core/database.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const scratchDirectories: string[] = [];
const servers: Server[] = [];

beforeAll(async () => {
  database = await startTestDatabase();
}, 120_000);

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  })));
});

afterAll(async () => {
  await database.stop();
});

describe("OBS-01 four liveness probes and state transitions", () => {
  it("loads the exact four OBS-01 target contracts alongside additive slice targets", async () => {
    const { loadObservationTargets } = await import(
      "../../apps/observation-agent/src/core/targets.js"
    );
    const targetsDirectory = await mkdtemp(join(tmpdir(), "obs-01-targets-"));
    scratchDirectories.push(targetsDirectory);
    const obs01Fragment = await readFile("deploy/observation-agent/targets.dev.d/OBS-01.json");
    await writeFile(join(targetsDirectory, "OBS-01.json"), obs01Fragment);
    await writeFile(join(targetsDirectory, "OBS-99.json"), JSON.stringify({
      schema_version: 1,
      targets: [{
        component: "hatchet",
        kind: "hatchet_metrics",
        rest_url: "http://127.0.0.1:8888/api/v1/tenants/local/queue-metrics"
      }]
    }));
    const targets = await loadObservationTargets(targetsDirectory);
    expect(targets).toContainEqual({
      component: "hatchet",
      kind: "hatchet_metrics",
      rest_url: "http://127.0.0.1:8888/api/v1/tenants/local/queue-metrics"
    });
    const coreTargetIdentities = new Set([
      "docker:docker", "hatchet:hatchet", "observation_agent:self", "postgres:postgres"
    ]);
    const coreTargets = targets
      .filter((target) => coreTargetIdentities.has(`${target.component}:${target.kind}`))
      .sort((left, right) => left.component.localeCompare(right.component));
    expect(coreTargets).toEqual([
      { component: "docker", kind: "docker" },
      {
        component: "hatchet",
        kind: "hatchet",
        live_url: "http://127.0.0.1:8888/api/live",
        ready_url: "http://127.0.0.1:8888/api/ready",
        container: "debateai-v3-hatchet-lite-1"
      },
      { component: "observation_agent", kind: "self" },
      {
        component: "postgres",
        kind: "postgres",
        host: "127.0.0.1",
        port: 55_432,
        container: "debateai-v3-postgres-1"
      }
    ]);
  });

  it("probes Hatchet live and ready with fixed privacy-safe headers", async () => {
    const requests: Array<Readonly<{ url: string; connection?: string; userAgent?: string }>> = [];
    const server = createServer((request, response) => {
      requests.push({
        url: request.url ?? "",
        ...(request.headers.connection === undefined
          ? {} : { connection: request.headers.connection }),
        ...(request.headers["user-agent"] === undefined
          ? {} : { userAgent: request.headers["user-agent"] })
      });
      response.statusCode = request.url === "/api/live" || request.url === "/api/ready" ? 200 : 404;
      response.end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("TEST_HTTP_ADDRESS_UNRESOLVED");

    const { probeHatchet } = await import(
      "../../apps/observation-agent/src/modules/core-liveness/probes.js"
    );
    const observation = await probeHatchet({
      component: "hatchet",
      kind: "hatchet",
      live_url: `http://127.0.0.1:${address.port}/api/live`,
      ready_url: `http://127.0.0.1:${address.port}/api/ready`,
      container: "debateai-v3-hatchet-lite-1"
    }, {
      timeoutMs: 2_000,
      inspectContainer: async () => ({ status: "running", restartPolicy: "no", exitCode: 0 })
    });
    expect(observation).toMatchObject({ component: "hatchet", ok: true, class: "INFRA_DOWN" });
    expect(requests).toEqual([
      { url: "/api/live", connection: "close", userAgent: "dialectical-engine-observation-agent" },
      { url: "/api/ready", connection: "close", userAgent: "dialectical-engine-observation-agent" }
    ]);
  });

  it("classifies live-but-not-ready separately from down", async () => {
    const server = createServer((request, response) => {
      response.statusCode = request.url === "/api/live" ? 200 : 503;
      response.end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("TEST_HTTP_ADDRESS_UNRESOLVED");
    const { probeHatchet } = await import(
      "../../apps/observation-agent/src/modules/core-liveness/probes.js"
    );
    await expect(probeHatchet({
      component: "hatchet",
      kind: "hatchet",
      live_url: `http://127.0.0.1:${address.port}/api/live`,
      ready_url: `http://127.0.0.1:${address.port}/api/ready`,
      container: "debateai-v3-hatchet-lite-1"
    }, {
      timeoutMs: 2_000,
      inspectContainer: async () => ({ status: "running", restartPolicy: "no", exitCode: 0 })
    })).resolves.toMatchObject({ ok: false, class: "INFRA_NOT_READY", lastStatus: 503 });
  });

  it("uses a dedicated Postgres probe connection and probes Docker and self", async () => {
    const { probeDockerEngine, probeObservationAgent, probePostgres } = await import(
      "../../apps/observation-agent/src/modules/core-liveness/probes.js"
    );
    const databaseUrl = new URL(database.connectionString);
    const postgres = await probePostgres({
      component: "postgres",
      kind: "postgres",
      host: databaseUrl.hostname,
      port: Number(databaseUrl.port),
      container: "debateai-v3-postgres-1"
    }, createObservationDatabasePort(database.pool), {
      timeoutMs: 2_000,
      inspectContainer: async () => ({ status: "running", restartPolicy: "no", exitCode: 0 })
    });
    expect(postgres).toMatchObject({ component: "postgres", ok: true, probe: "tcp+select1" });

    await expect(probeDockerEngine({
      timeoutMs: 2_000,
      runDocker: async () => ({ stdout: "29.7.2\n", stderr: "", exitCode: 0 })
    })).resolves.toMatchObject({ component: "docker", ok: true });

    const stateDir = await mkdtemp(join(tmpdir(), "obs-01-self-"));
    scratchDirectories.push(stateDir);
    await expect(probeObservationAgent(stateDir, new Date("2026-09-03T07:00:00.000Z")))
      .resolves.toMatchObject({ component: "observation_agent", ok: true });
    expect(await readFile(join(stateDir, "heartbeat"), "utf8")).toBe("2026-09-03T07:00:00.000Z\n");
  });

  it("opens and clears only at policy thresholds while preserving the first failure", async () => {
    const { createLivenessTracker } = await import(
      "../../apps/observation-agent/src/modules/core-liveness/state.js"
    );
    const tracker = createLivenessTracker({ openAfterFailures: 3, clearAfterSuccesses: 2 });
    const at = [0, 5, 10, 15, 20].map((seconds) => new Date(1_780_000_000_000 + seconds * 1_000));
    expect(tracker.observe({ component: "hatchet", class: "INFRA_DOWN", ok: false, at: at[0]! }))
      .toMatchObject({ state: "SUSPECT", event: null });
    expect(tracker.observe({ component: "hatchet", class: "INFRA_DOWN", ok: false, at: at[1]! }))
      .toMatchObject({ state: "SUSPECT", event: null });
    expect(tracker.observe({ component: "hatchet", class: "INFRA_DOWN", ok: false, at: at[2]! }))
      .toMatchObject({
        state: "DOWN",
        event: { kind: "OPEN", firstFailedProbeAt: at[0] }
      });
    expect(tracker.observe({ component: "hatchet", class: "INFRA_DOWN", ok: true, at: at[3]! }))
      .toMatchObject({ state: "RECOVERING", event: null });
    expect(tracker.observe({ component: "hatchet", class: "INFRA_DOWN", ok: true, at: at[4]! }))
      .toMatchObject({ state: "UP", event: { kind: "CLEARED" } });

    const reloaded = createLivenessTracker({ openAfterFailures: 2, clearAfterSuccesses: 2 });
    reloaded.observe({ component: "postgres", class: "INFRA_DOWN", ok: false, at: at[0]! });
    reloaded.observe({ component: "postgres", class: "INFRA_DOWN", ok: false, at: at[1]! });
    reloaded.updatePolicy({ openAfterFailures: 2, clearAfterSuccesses: 1 });
    expect(reloaded.observe({ component: "postgres", class: "INFRA_DOWN", ok: true, at: at[2]! }))
      .toMatchObject({ state: "UP", event: { kind: "CLEARED" } });
  });

  it("maps container state to UNKNOWN while Docker is down", async () => {
    const { classifyContainerWhenDockerUnavailable } = await import(
      "../../apps/observation-agent/src/modules/core-liveness/probes.js"
    );
    expect(classifyContainerWhenDockerUnavailable("postgres")).toEqual({
      component: "postgres",
      ok: false,
      class: "INFRA_UNKNOWN",
      probe: "docker_inspect",
      lastStatus: "UNKNOWN",
      containerStatus: "UNKNOWN"
    });
  });

  it("turns an obsolete liveness class into a recovery observation", async () => {
    const { inactiveClassRecoveries } = await import(
      "../../apps/observation-agent/src/modules/core-liveness/state.js"
    );
    const current = {
      component: "hatchet",
      ok: false,
      class: "INFRA_DOWN",
      probe: "http_get",
      target: "http://127.0.0.1:8888/api/live",
      lastStatus: 0
    } as const;
    expect(inactiveClassRecoveries(current, ["INFRA_UNKNOWN", "INFRA_DOWN"]))
      .toEqual([{
        ...current,
        ok: true,
        class: "INFRA_UNKNOWN",
        lastStatus: "READY"
      }]);
  });
});
