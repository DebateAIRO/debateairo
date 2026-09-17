import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  dockerArgv,
  runDocker,
  type DockerCommand,
  type DockerResult
} from "../../docker/wrapper.js";
import {
  parseDf,
  parseDockerStats,
  parseDockerSystemDf,
  parseLoadAverage,
  parseVmStat,
  type ContainerCapacity
} from "./parsers.js";

const CONTAINERS = Object.freeze([
  "debateai-v3-postgres-1", "debateai-v3-hatchet-lite-1"
] as const);

const SYSTEM_DF_ARGV = Object.freeze(["system", "df", "--format", "{{json .}}"]);
const STATS_ARGV = Object.freeze([
  "stats", "--no-stream", "--format", "{{json .}}", ...CONTAINERS
]);

export type HostCommand = "df" | "vm_stat" | "memory_total" | "load_average" | "logical_cores";

export type HostCapacitySnapshot = Readonly<{
  diskTotalBytes: number;
  diskFreeBytes: number;
  diskFreePercent: number;
  dockerDiskBytes: number;
  memoryTotalBytes: number;
  memoryAvailableBytes: number;
  memoryAvailablePercent: number;
  loadOneMinute: number;
  logicalCores: number;
  containers: readonly ContainerCapacity[];
  observedAt: Date;
}>;

export type HostCapacityDependencies = Readonly<{
  runHost(command: HostCommand, timeoutMs: number): Promise<string>;
  runDocker(command: DockerCommand, operands: readonly string[], timeoutMs: number): Promise<DockerResult>;
}>;

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function assertCapacityDockerArgv(argv: readonly string[]): readonly string[] {
  if (!same(argv, SYSTEM_DF_ARGV) && !same(argv, STATS_ARGV)) {
    throw new Error("OBSERVATION_CAPACITY_DOCKER_FORBIDDEN");
  }
  return Object.freeze([...argv]);
}

const execFileAsync = promisify(execFile);

async function runHost(command: HostCommand, timeoutMs: number): Promise<string> {
  const definitions: Readonly<Record<HostCommand, readonly [string, readonly string[]]>> = Object.freeze({
    df: ["/bin/df", ["-Pk", "/"]] as const,
    vm_stat: ["/usr/bin/vm_stat", []] as const,
    memory_total: ["/usr/sbin/sysctl", ["-n", "hw.memsize"]] as const,
    load_average: ["/usr/sbin/sysctl", ["-n", "vm.loadavg"]] as const,
    logical_cores: ["/usr/sbin/sysctl", ["-n", "hw.logicalcpu"]] as const,
  });
  const [file, args] = definitions[command];
  const result = await execFileAsync(file, [...args], { encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1_024 });
  return result.stdout;
}

const productionDependencies: HostCapacityDependencies = Object.freeze({ runHost, runDocker });

function positiveInteger(output: string, label: string): number {
  const value = Number(output.trim());
  if (!Number.isInteger(value) || value <= 0) throw new Error(`OBSERVATION_HOST_PARSE_INVALID:${label}`);
  return value;
}

export async function readHostCapacity(
  observedAt = new Date(),
  dependencies: HostCapacityDependencies = productionDependencies,
  timeoutMs = 2_000
): Promise<HostCapacitySnapshot> {
  const diskOutput = await dependencies.runHost("df", timeoutMs);
  const vmOutput = await dependencies.runHost("vm_stat", timeoutMs);
  const memoryTotalOutput = await dependencies.runHost("memory_total", timeoutMs);
  const loadOutput = await dependencies.runHost("load_average", timeoutMs);
  const coresOutput = await dependencies.runHost("logical_cores", timeoutMs);
  const systemDfOperands = Object.freeze(["--format", "{{json .}}"]);
  assertCapacityDockerArgv(dockerArgv("systemDf", systemDfOperands));
  const systemDf = await dependencies.runDocker("systemDf", systemDfOperands, timeoutMs);
  const statsOperands = Object.freeze(["--format", "{{json .}}", ...CONTAINERS]);
  assertCapacityDockerArgv(dockerArgv("stats", statsOperands));
  const stats = await dependencies.runDocker("stats", statsOperands, timeoutMs);
  if (systemDf.exitCode !== 0 || stats.exitCode !== 0) throw new Error("OBSERVATION_CAPACITY_DOCKER_FAILED");
  const disk = parseDf(diskOutput);
  const memory = parseVmStat(vmOutput, positiveInteger(memoryTotalOutput, "memory_total"));
  const containers = parseDockerStats(stats.stdout);
  if (!same(containers.map(({ name }) => name), CONTAINERS)) {
    throw new Error("OBSERVATION_CAPACITY_DOCKER_CONTAINER_MISMATCH");
  }
  return Object.freeze({
    diskTotalBytes: disk.totalBytes,
    diskFreeBytes: disk.freeBytes,
    diskFreePercent: disk.freePercent,
    dockerDiskBytes: parseDockerSystemDf(systemDf.stdout),
    memoryTotalBytes: memory.totalBytes,
    memoryAvailableBytes: memory.availableBytes,
    memoryAvailablePercent: memory.availablePercent,
    loadOneMinute: parseLoadAverage(loadOutput),
    logicalCores: positiveInteger(coresOutput, "logical_cores"),
    containers,
    observedAt
  });
}
