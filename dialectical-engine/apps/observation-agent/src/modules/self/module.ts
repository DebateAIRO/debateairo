import type { Module } from "../../core/types.js";

const selfModule: Module = Object.freeze({
  name: "self",
  cadence: Object.freeze({ intervalMs: 5_000, timeoutMs: 2_000 }),
  async probe() { return Object.freeze([]); },
  samples() { return Object.freeze([]); },
  signals() { return Object.freeze([]); }
});

export default selfModule;
