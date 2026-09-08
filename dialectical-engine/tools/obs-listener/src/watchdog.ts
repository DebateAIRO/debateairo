import { fileURLToPath } from "node:url";

import { canonicalJson } from "@debateai/obs-capture/chain/verify";

import {
  WatchdogColdStartError,
  coldStartStderr,
  createWatchdog,
  readWatchdogConfig,
  type WatchdogPorts,
} from "./watchdog/main.js";

export async function runWatchdogOnce(
  environment: Readonly<Record<string, string | undefined>>,
  ports: WatchdogPorts = {},
): Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>> {
  let watchdog: ReturnType<typeof createWatchdog> | undefined;
  try {
    watchdog = createWatchdog(readWatchdogConfig(environment), ports);
    const report = await watchdog.cycle();
    return Object.freeze({ exitCode: 0, stdout: `${canonicalJson(report)}\n`, stderr: "" });
  } catch (error) {
    if (error instanceof WatchdogColdStartError) {
      return Object.freeze({ exitCode: 78, stdout: "", stderr: coldStartStderr(error.code) });
    }
    return Object.freeze({ exitCode: 78, stdout: "", stderr: coldStartStderr("WITNESS_JOURNAL_INVALID_NO_APPEND") });
  } finally {
    if (watchdog !== undefined) await watchdog.stop().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  try {
    const watchdog = createWatchdog(readWatchdogConfig(process.env), {
      report: (value) => process.stdout.write(`${canonicalJson(value)}\n`),
      fatal: () => {
        process.stderr.write(coldStartStderr("WITNESS_JOURNAL_INVALID_NO_APPEND"));
        process.exit(78);
      },
    });
    await watchdog.start();
    const stop = async () => { await watchdog.stop(); process.exitCode = 0; };
    process.once("SIGINT", () => { void stop(); });
    process.once("SIGTERM", () => { void stop(); });
  } catch (error) {
    const code = error instanceof WatchdogColdStartError ? error.code : "ACTIVATION_INVALID_NO_WITNESS";
    process.stderr.write(coldStartStderr(code));
    process.exitCode = 78;
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
