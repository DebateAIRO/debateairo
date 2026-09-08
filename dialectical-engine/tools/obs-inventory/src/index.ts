import { resolve } from "node:path";
import {
  DEFAULT_INVENTORY_GATE_MS,
  InventoryGateError,
  runInventoryGate,
} from "./gate.js";

function snapshotRequested(arguments_: readonly string[]): boolean {
  if (arguments_.length === 0) return false;
  if (arguments_.length === 1 && arguments_[0] === "--snapshot") return true;
  throw new InventoryGateError("OBS_INVENTORY_ARGUMENT_INVALID", "expected no arguments or --snapshot");
}

async function main(): Promise<0 | 1> {
  const rootDirectory = process.cwd();
  return runInventoryGate({
    rootDirectory,
    baselinePath: resolve(rootDirectory, "tools/obs-inventory/baseline.json"),
    snapshot: snapshotRequested(process.argv.slice(2)),
    gateMs: DEFAULT_INVENTORY_GATE_MS,
  });
}

try {
  process.exitCode = await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "OBS_INVENTORY_UNKNOWN_ERROR";
  process.stdout.write(`ERROR ${message}\n`);
  process.exitCode = 1;
}
