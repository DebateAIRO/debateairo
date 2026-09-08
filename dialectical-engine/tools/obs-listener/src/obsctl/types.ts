export type Fix12ObsctlVerb = "arm-dispatch" | "approve" | "deny" | "reveal-drift";

export type ObsctlVerb = "kill" | "arm" | "status" | Fix12ObsctlVerb | "chain-keyring-install" |
  "chain-activation-snapshot" | "chain-bootstrap" | "chain-rotate-row" |
  "chain-rotate-witness" | "chain-recover-row" | "chain-recover-witness";

export interface CliResult { readonly exitCode: number; readonly stdout: string; readonly stderr: string }
