import type { CliResult, Fix12ObsctlVerb } from "./types.js";

export async function runFix12Entry(
  verb: Fix12ObsctlVerb,
  _args: readonly string[],
): Promise<CliResult> {
  // The daemon-owned executor supplies the proposal store, custodian token,
  // ticket adapter, and manifest hashes. A standalone obsctl process cannot
  // manufacture any of those capabilities.
  return Object.freeze({ exitCode: 1, stdout: "", stderr: `FIX12_EXECUTOR_REQUIRED:${verb}\n` });
}
