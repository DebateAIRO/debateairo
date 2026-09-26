// REV-PES-S02-p1-security-data-safety — preload that records every module URL the process resolves
// (ESM and CJS, via node:module registerHooks) and, at exit, the beforeExit listener count and exitCode.
// Use: NODE_OPTIONS="--import=<abs path to this file>" REV_LOAD_LOG=<abs log> pnpm pes:accept-hosted
import { registerHooks } from "node:module";
import { appendFileSync } from "node:fs";
const log = process.env.REV_LOAD_LOG;
if (!log) throw new Error("REV_LOAD_LOG unset");
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    appendFileSync(log, `LOAD ${result.url}\n`);
    return result;
  }
});
process.on("exit", (code) => {
  appendFileSync(log, `EXIT code=${code} exitCode=${process.exitCode} beforeExitListeners=${process.listenerCount("beforeExit")}\n`);
});
