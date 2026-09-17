import { runDocker, type DockerResult } from "../../docker/wrapper.js";

export type WitnessedComponent = "postgres" | "hatchet";
export type ContainerInspection = Readonly<{
  component: WitnessedComponent;
  container: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  restartCount: number;
  restartPolicy: string;
  exitCode: number;
}>;

const EXPECTED_CONTAINERS = Object.freeze([
  Object.freeze({ component: "postgres" as const, container: "debateai-v3-postgres-1" }),
  Object.freeze({ component: "hatchet" as const, container: "debateai-v3-hatchet-lite-1" })
]);

function timestamp(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("0001-01-01")) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function decode(
  component: WitnessedComponent,
  container: string,
  result: DockerResult
): ContainerInspection {
  if (result.exitCode !== 0) {
    return Object.freeze({
      component, container, status: "UNKNOWN", startedAt: null, finishedAt: null,
      restartCount: 0, restartPolicy: "UNKNOWN", exitCode: result.exitCode
    });
  }
  try {
    const value = JSON.parse(result.stdout) as Readonly<{
      State?: Readonly<{
        Status?: unknown; StartedAt?: unknown; FinishedAt?: unknown; ExitCode?: unknown;
      }>;
      RestartCount?: unknown;
      HostConfig?: Readonly<{ RestartPolicy?: Readonly<{ Name?: unknown }> }>;
    }>;
    return Object.freeze({
      component,
      container,
      status: typeof value.State?.Status === "string" ? value.State.Status : "UNKNOWN",
      startedAt: timestamp(value.State?.StartedAt),
      finishedAt: timestamp(value.State?.FinishedAt),
      restartCount: typeof value.RestartCount === "number" && Number.isInteger(value.RestartCount)
        && value.RestartCount >= 0 ? value.RestartCount : 0,
      restartPolicy: typeof value.HostConfig?.RestartPolicy?.Name === "string"
        && value.HostConfig.RestartPolicy.Name.length > 0
        ? value.HostConfig.RestartPolicy.Name : "UNKNOWN",
      exitCode: typeof value.State?.ExitCode === "number" && Number.isInteger(value.State.ExitCode)
        ? value.State.ExitCode : -1
    });
  } catch {
    return Object.freeze({
      component, container, status: "UNKNOWN", startedAt: null, finishedAt: null,
      restartCount: 0, restartPolicy: "UNKNOWN", exitCode: -1
    });
  }
}

export async function inspectExpectedContainers(input: Readonly<{
  now: Date;
  timeoutMs: number;
  runDocker?: (
    command: "inspect", operands: readonly string[], timeoutMs: number
  ) => Promise<DockerResult>;
}>): Promise<readonly ContainerInspection[]> {
  const execute = input.runDocker ?? ((command, operands, timeoutMs) =>
    runDocker(command, operands, timeoutMs));
  const inspections: ContainerInspection[] = [];
  for (const target of EXPECTED_CONTAINERS) {
    const result = await execute(
      "inspect", ["--format", "{{json .}}", target.container], input.timeoutMs
    );
    inspections.push(decode(target.component, target.container, result));
  }
  return Object.freeze(inspections);
}
