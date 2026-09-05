import { rename, mkdir, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { join } from "node:path";
import pg from "pg";
import type { ObservationComponent, ProbeObservation } from "../../core/types.js";
import {
  observationTargetSchema,
  type HatchetTarget,
  type PostgresTarget
} from "../../core/targets.js";
import { runDocker, type DockerResult } from "../../docker/wrapper.js";

const USER_AGENT = "dialectical-engine-observation-agent";

export type ContainerState = Readonly<{
  status: string;
  restartPolicy: string;
  exitCode: number;
}>;

export type ProbeDependencies = Readonly<{
  timeoutMs: number;
  inspectContainer?: (container: string, timeoutMs: number) => Promise<ContainerState>;
  runDocker?: (command: "info", operands: readonly string[], timeoutMs: number) => Promise<DockerResult>;
  queryPostgres?: (
    target: PostgresTarget,
    databaseUrl: string,
    timeoutMs: number
  ) => Promise<void>;
}>;

async function tcpProbe(host: string, port: number, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => socket.end(() => resolve()));
    socket.once("timeout", () => socket.destroy(new Error("OBSERVATION_PROBE_TIMEOUT")));
    socket.once("error", reject);
  });
}

async function inspectContainer(container: string, timeoutMs: number): Promise<ContainerState> {
  const result = await runDocker(
    "inspect", ["--format", "{{json .}}", container], timeoutMs
  );
  if (result.exitCode !== 0) {
    return Object.freeze({ status: "UNKNOWN", restartPolicy: "UNKNOWN", exitCode: result.exitCode });
  }
  try {
    const decoded = JSON.parse(result.stdout) as {
      readonly State?: Readonly<{ Status?: unknown; ExitCode?: unknown }>;
      readonly HostConfig?: Readonly<{ RestartPolicy?: Readonly<{ Name?: unknown }> }>;
    };
    return Object.freeze({
      status: typeof decoded.State?.Status === "string" ? decoded.State.Status : "UNKNOWN",
      restartPolicy: typeof decoded.HostConfig?.RestartPolicy?.Name === "string"
        ? decoded.HostConfig.RestartPolicy.Name : "UNKNOWN",
      exitCode: typeof decoded.State?.ExitCode === "number" ? decoded.State.ExitCode : -1
    });
  } catch {
    return Object.freeze({ status: "UNKNOWN", restartPolicy: "UNKNOWN", exitCode: -1 });
  }
}

async function queryPostgres(
  target: PostgresTarget,
  databaseUrl: string,
  timeoutMs: number
): Promise<void> {
  await tcpProbe(target.host, target.port, timeoutMs);
  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query(`SET statement_timeout = ${Math.trunc(timeoutMs)}`);
    await client.query("SELECT 1");
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function probePostgres(
  target: PostgresTarget,
  databaseUrl: string,
  dependencies: ProbeDependencies
): Promise<ProbeObservation> {
  const inspect = dependencies.inspectContainer ?? inspectContainer;
  const query = dependencies.queryPostgres ?? queryPostgres;
  try {
    await query(target, databaseUrl, dependencies.timeoutMs);
    const container = await inspect(target.container, dependencies.timeoutMs);
    return Object.freeze({
      component: "postgres", ok: container.status === "running", class: "INFRA_DOWN",
      probe: "tcp+select1", target: `${target.host}:${target.port}`,
      lastStatus: container.status === "running" ? "READY" : container.status,
      containerStatus: container.status,
      restartPolicy: container.restartPolicy,
      exitCode: container.exitCode
    });
  } catch {
    return Object.freeze({
      component: "postgres", ok: false, class: "INFRA_DOWN", probe: "tcp+select1",
      target: `${target.host}:${target.port}`, lastStatus: "FAILED"
    });
  }
}

async function get(url: string, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    method: "GET",
    headers: { Connection: "close", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs)
  });
}

export async function probeHatchet(
  target: HatchetTarget,
  dependencies: ProbeDependencies
): Promise<ProbeObservation> {
  const inspect = dependencies.inspectContainer ?? inspectContainer;
  try {
    const live = await get(target.live_url, dependencies.timeoutMs);
    if (live.status !== 200) {
      return Object.freeze({
        component: "hatchet", ok: false, class: "INFRA_DOWN", probe: "http_get",
        target: target.live_url, lastStatus: live.status
      });
    }
    const ready = await get(target.ready_url, dependencies.timeoutMs);
    const container = await inspect(target.container, dependencies.timeoutMs);
    const readyAndRunning = ready.status === 200 && container.status === "running";
    return Object.freeze({
      component: "hatchet",
      ok: readyAndRunning,
      class: ready.status === 200 ? "INFRA_DOWN" : "INFRA_NOT_READY",
      probe: "http_get",
      target: ready.status === 200 ? target.live_url : target.ready_url,
      lastStatus: ready.status,
      containerStatus: container.status,
      restartPolicy: container.restartPolicy,
      exitCode: container.exitCode
    });
  } catch {
    return Object.freeze({
      component: "hatchet", ok: false, class: "INFRA_DOWN", probe: "http_get",
      target: target.live_url, lastStatus: 0
    });
  }
}

export async function probeDockerEngine(dependencies: ProbeDependencies): Promise<ProbeObservation> {
  const execute = dependencies.runDocker ?? ((command, operands, timeoutMs) =>
    runDocker(command, operands, timeoutMs));
  const result = await execute(
    "info", ["--format", "{{.ServerVersion}}"], dependencies.timeoutMs
  );
  return Object.freeze({
    component: "docker",
    ok: result.exitCode === 0 && result.stdout.trim().length > 0,
    class: "INFRA_DOWN",
    probe: "docker_info",
    target: "docker-engine",
    lastStatus: result.exitCode === 0 ? result.stdout.trim() : "FAILED",
    exitCode: result.exitCode
  });
}

export async function probeObservationAgent(
  stateDir: string,
  at: Date = new Date()
): Promise<ProbeObservation> {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const temporary = join(stateDir, `.heartbeat-${process.pid}.tmp`);
  await writeFile(temporary, `${at.toISOString()}\n`, { mode: 0o600 });
  await rename(temporary, join(stateDir, "heartbeat"));
  return Object.freeze({
    component: "observation_agent", ok: true, class: "AGENT_SELF",
    probe: "heartbeat_write", target: join(stateDir, "heartbeat"), lastStatus: "WRITTEN"
  });
}

export function classifyContainerWhenDockerUnavailable(
  component: Extract<ObservationComponent, "postgres" | "hatchet">
): ProbeObservation {
  return Object.freeze({
    component,
    ok: false,
    class: "INFRA_UNKNOWN",
    probe: "docker_inspect",
    lastStatus: "UNKNOWN",
    containerStatus: "UNKNOWN"
  });
}

export async function runCoreLivenessProbes(input: Readonly<{
  now: Date;
  timeoutMs: number;
  databaseUrl: string;
  stateDir: string;
  targets: readonly unknown[];
}>): Promise<readonly ProbeObservation[]> {
  const targets = input.targets.map((target) => observationTargetSchema.parse(target));
  const dockerTarget = targets.find((target) => target.kind === "docker");
  if (dockerTarget === undefined) throw new TypeError("OBSERVATION_TARGETS_INVALID");
  const docker = await probeDockerEngine({ timeoutMs: input.timeoutMs });
  const observations: ProbeObservation[] = [docker];
  for (const target of targets) {
    if (target.kind === "docker") continue;
    if (target.kind === "postgres") {
      observations.push(docker.ok
        ? await probePostgres(target, input.databaseUrl, { timeoutMs: input.timeoutMs })
        : classifyContainerWhenDockerUnavailable("postgres"));
    } else if (target.kind === "hatchet") {
      observations.push(docker.ok
        ? await probeHatchet(target, { timeoutMs: input.timeoutMs })
        : classifyContainerWhenDockerUnavailable("hatchet"));
    } else if (target.kind === "self") {
      observations.push(await probeObservationAgent(input.stateDir, input.now));
    }
  }
  return Object.freeze(observations);
}
