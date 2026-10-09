import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** README §14.8's own form of an owner command on the host, as the API's user with the API's EnvironmentFile. */
export const ON_HOST = "systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api"
  + " --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm";

/**
 * README §14.8's owner commands as the runbook runs them on the host: each line that runs `/usr/bin/pnpm billing:…`
 * under systemd-run, without the `read -r NAME && ` steps in front of it that read the values in.
 */
export function runbookBillingCommands(): readonly string[] {
  const runbook = readFileSync(fileURLToPath(new URL("../../deploy/vps/README.md", import.meta.url)), "utf8");
  return runbook.split("\n")
    .filter((line) => line.includes("/usr/bin/pnpm billing:"))
    .map((line) => line.replace(/^(?:read -r [A-Z_]+ && )+/u, ""));
}

/** A printed command with the runbook's read-in values in place of ours (`[ours, theirs]`, each replaced once). */
export function asRunbookLine(printed: string, values: ReadonlyArray<readonly [string, string]>): string {
  return values.reduce((line, [ours, theirs]) => line.replace(ours, theirs), printed);
}

/** The owner commands a text prints, each on its own line (after its indent), in the runbook's host form. */
export function printedHostCommands(text: string): readonly string[] {
  return text.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("systemd-run "));
}

/** A `pnpm billing:…` that is not the runbook's `/usr/bin/pnpm billing:…`: it fails in a root shell (no settings). */
export const BARE_BILLING_COMMAND = /(^|[^/])pnpm billing:/u;
