export type ObsctlVerb = "kill" | "arm" | "status" | "chain-keyring-install" |
  "chain-activation-snapshot" | "chain-bootstrap" | "chain-rotate-row" |
  "chain-rotate-witness" | "chain-recover-row" | "chain-recover-witness";

export interface CliResult { readonly exitCode: number; readonly stdout: string; readonly stderr: string }
