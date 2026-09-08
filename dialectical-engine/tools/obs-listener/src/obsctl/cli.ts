import type { CliResult, Fix12ObsctlVerb, ObsctlVerb } from "./types.js";

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
  lifecycle(verb: Exclude<ObsctlVerb, "kill" | "arm" | "status" | Fix12ObsctlVerb>, args: readonly string[]): Promise<CliResult>;
  fix12(verb: Fix12ObsctlVerb, args: readonly string[]): Promise<CliResult>;
}

export function parseObsctl(argv: readonly string[]): Readonly<{ verb: ObsctlVerb; args: readonly string[] }> {
  const [command, subcommand, ...args] = argv;
  if (command === "arm" && subcommand === "--dispatch" && args.length === 0) {
    return Object.freeze({ verb: "arm-dispatch", args: Object.freeze([]) });
  }
  if (command === "approve" && subcommand !== undefined && args.length === 0 && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(subcommand)) {
    return Object.freeze({ verb: "approve", args: Object.freeze([subcommand]) });
  }
  if (command === "deny" && subcommand !== undefined && args.length <= 1
      && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(subcommand)
      && (args[0] === undefined || /^[A-Z][A-Z0-9_]{0,63}$/u.test(args[0]))) {
    return Object.freeze({ verb: "deny", args: Object.freeze([subcommand, ...args]) });
  }
  if (command === "reveal-drift" && subcommand === undefined) {
    return Object.freeze({ verb: "reveal-drift", args: Object.freeze([]) });
  }
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
  if (parsed.verb === "arm-dispatch" || parsed.verb === "approve"
      || parsed.verb === "deny" || parsed.verb === "reveal-drift") {
    return target.fix12(parsed.verb, parsed.args);
  }
  return target.lifecycle(parsed.verb, parsed.args);
}

async function defaultDispatch(): Promise<CliDispatch> {
  // Parsing is deliberately complete before dynamic imports; verb-specific entry
  // modules retain the authority's DB-free kill/arm import boundary.
  return Object.freeze({
    async kill() { const module = await import("./kill.js"); return module.runKillEntry(); },
    async arm() { const module = await import("./arm.js"); return module.runArmEntry(); },
    async status() { const module = await import("./status-entry.js"); return module.runStatusEntry(); },
    async lifecycle(verb: Exclude<ObsctlVerb, "kill" | "arm" | "status" | Fix12ObsctlVerb>, args: readonly string[]) {
      const module = await import("./lifecycle-entry.js"); return module.runLifecycleEntry(verb, args);
    },
    async fix12(verb: Fix12ObsctlVerb, args: readonly string[]) {
      const module = await import("./fix12-entry.js"); return module.runFix12Entry(verb, args);
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
