import type { CliResult, ObsctlVerb } from "./types.js";

const CHAIN_SUBCOMMANDS = Object.freeze({
  "keyring-install": "chain-keyring-install",
  "activation-snapshot": "chain-activation-snapshot",
  bootstrap: "chain-bootstrap",
  "rotate-row": "chain-rotate-row",
  "rotate-witness": "chain-rotate-witness",
  "recover-row": "chain-recover-row",
  "recover-witness": "chain-recover-witness",
} as const satisfies Readonly<Record<string, ObsctlVerb>>);

export interface CliDispatch {
  kill(): Promise<CliResult>;
  arm(): Promise<CliResult>;
  status(): Promise<CliResult>;
  lifecycle(verb: Exclude<ObsctlVerb, "kill" | "arm" | "status">, args: readonly string[]): Promise<CliResult>;
}

export function parseObsctl(argv: readonly string[]): Readonly<{ verb: ObsctlVerb; args: readonly string[] }> {
  const [command, subcommand, ...args] = argv;
  if (command === "kill" || command === "arm" || command === "status") {
    if (subcommand !== undefined) throw new TypeError("FIX10_CLI_USAGE");
    return Object.freeze({ verb: command, args: Object.freeze([]) });
  }
  if (command !== "chain" || subcommand === undefined || !Object.hasOwn(CHAIN_SUBCOMMANDS, subcommand)) {
    throw new TypeError("FIX10_CLI_USAGE");
  }
  const verb = CHAIN_SUBCOMMANDS[subcommand as keyof typeof CHAIN_SUBCOMMANDS];
  const needsWriter = verb === "chain-rotate-row" || verb === "chain-recover-row";
  if ((needsWriter && (args.length !== 1 || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(args[0]!))) ||
      (!needsWriter && args.length !== 0)) throw new TypeError("FIX10_CLI_USAGE");
  return Object.freeze({ verb, args: Object.freeze(args) });
}

export async function runObsctl(argv: readonly string[], dispatch?: CliDispatch): Promise<CliResult> {
  const parsed = parseObsctl(argv);
  const target = dispatch ?? await defaultDispatch();
  if (parsed.verb === "kill") return target.kill();
  if (parsed.verb === "arm") return target.arm();
  if (parsed.verb === "status") return target.status();
  return target.lifecycle(parsed.verb, parsed.args);
}

async function defaultDispatch(): Promise<CliDispatch> {
  // Parsing is deliberately complete before dynamic imports; verb-specific entry
  // modules retain the authority's DB-free kill/arm import boundary.
  return Object.freeze({
    async kill() { const module = await import("./kill.js"); return module.runKillEntry(); },
    async arm() { const module = await import("./arm.js"); return module.runArmEntry(); },
    async status() { const module = await import("./status-entry.js"); return module.runStatusEntry(); },
    async lifecycle(verb: Exclude<ObsctlVerb, "kill" | "arm" | "status">, args: readonly string[]) {
      const module = await import("./lifecycle-entry.js"); return module.runLifecycleEntry(verb, args);
    },
  });
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    const result = await runObsctl(argv);
    if (result.stdout.length > 0) process.stdout.write(result.stdout);
    if (result.stderr.length > 0) process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "FIX10_UNKNOWN"}\n`);
    process.exitCode = 1;
  }
}
