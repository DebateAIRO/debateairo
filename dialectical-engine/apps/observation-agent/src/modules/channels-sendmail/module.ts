import type { ObservationModuleManifest } from "../../core/types.js";

export function createChannelsSendmailModule(): ObservationModuleManifest {
  return Object.freeze({
    name: "channels-sendmail",
    cadence: Object.freeze({ intervalMs: 5_000, timeoutMs: 2_000 }),
    async probe() { return Object.freeze([]); },
    samples() { return Object.freeze([]); },
    signals() { return Object.freeze([]); }
  });
}

const manifest = createChannelsSendmailModule();

export default manifest;
