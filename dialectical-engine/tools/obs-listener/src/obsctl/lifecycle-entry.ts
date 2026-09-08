import type { CliResult, Fix12ObsctlVerb, ObsctlVerb } from "./types.js";

export async function runLifecycleEntry(
  verb: Exclude<ObsctlVerb, "kill" | "arm" | "status" | Fix12ObsctlVerb>,
  _args: readonly string[],
): Promise<CliResult> {
  return Object.freeze({ exitCode: 1, stdout: "", stderr: `FIX10_V_EXECUTOR_REQUIRED:${verb}\n` });
}
