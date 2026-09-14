import { readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";

const scratchDirectory = process.env.OBS_G1_SCRATCH_DIR;
if (scratchDirectory === undefined) throw new Error("FIX08_SCRATCH_MISSING");
process.env.OBS_SPOOL_DIR = scratchDirectory;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@debateai/db") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,throw%20new%20Error(%27FIX08_DB_IMPORT_THROW%27)",
      };
    }
    return nextResolve(specifier, context);
  },
});

await import("@debateai/obs-capture/install/scheduler");
process.on("exit", () => {
  let spooled = 0;
  for (const name of readdirSync(scratchDirectory).filter((entry) => entry.endsWith(".spool"))) {
    spooled += readFileSync(join(scratchDirectory, name), "utf8")
      .split("\n")
      .filter((line) => line.length > 0).length;
  }
  process.stdout.write(`FIX08_DB_FIXTURE ${JSON.stringify({ spooled })}\n`);
});

await import("@debateai/db");
