import type { ObservationModuleManifest } from "../../core/types.js";

const manifest: ObservationModuleManifest = Object.freeze({
  name: "channels-kanban",
  cadence: Object.freeze({ intervalMs: 30_000, timeoutMs: 2_000 }),
  async probe() { return Object.freeze([]); },
  samples() { return Object.freeze([]); },
  signals() { return Object.freeze([]); }
});

export default manifest;
