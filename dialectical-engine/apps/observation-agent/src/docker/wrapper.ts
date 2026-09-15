import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ObservationError } from "../core/errors.js";

export const DOCKER_ARGV_PREFIXES = Object.freeze({
  ps: Object.freeze(["ps"]),
  inspect: Object.freeze(["inspect"]),
  stats: Object.freeze(["stats", "--no-stream"]),
  events: Object.freeze(["events"]),
  info: Object.freeze(["info"]),
  version: Object.freeze(["version"]),
  systemDf: Object.freeze(["system", "df"])
} as const);

export type DockerCommand = keyof typeof DOCKER_ARGV_PREFIXES;
export type DockerResult = Readonly<{ stdout: string; stderr: string; exitCode: number }>;

export function dockerArgv(command: DockerCommand, operands: readonly string[] = []): readonly string[] {
  const prefix = DOCKER_ARGV_PREFIXES[command];
  if (prefix === undefined) throw new ObservationError("OBSERVATION_DOCKER_COMMAND_FORBIDDEN");
  if (operands.some((operand) => operand.includes("\0"))) {
    throw new ObservationError("OBSERVATION_DOCKER_ARGUMENT_INVALID");
  }
  return Object.freeze([...prefix, ...operands]);
}

const execFileAsync = promisify(execFile);

export async function runDocker(
  command: DockerCommand,
  operands: readonly string[],
  timeoutMs: number
): Promise<DockerResult> {
  const argv = dockerArgv(command, operands);
  try {
    const result = await execFileAsync("docker", argv, {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 64 * 1024
    });
    return Object.freeze({ stdout: result.stdout, stderr: result.stderr, exitCode: 0 });
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      readonly stdout?: string;
      readonly stderr?: string;
      readonly code?: string | number;
    };
    return Object.freeze({
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      exitCode: typeof failure.code === "number" ? failure.code : -1
    });
  }
}
