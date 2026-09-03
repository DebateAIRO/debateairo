import type { Module } from "../../core/types.js";
import { runCoreLivenessProbes } from "./probes.js";

const coreLivenessModule: Module = Object.freeze({
  name: "core-liveness",
  cadence: Object.freeze({ intervalMs: 5_000, timeoutMs: 2_000 }),
  targetFragmentBasename: "OBS-01.json",
  async probe(ctx) {
    return runCoreLivenessProbes({
      now: ctx.now,
      timeoutMs: ctx.timeoutMs,
      databaseUrl: ctx.databaseUrl,
      stateDir: ctx.stateDir,
      targets: ctx.targets
    });
  },
  samples() { return Object.freeze([]); },
  signals() { return Object.freeze([]); }
});

export default coreLivenessModule;
