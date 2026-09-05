import type { ObservationModuleManifest } from "../../core/types.js";
import {
  consumeSendmailResult,
  createSendmailFailureTracker,
  sendmailDeliveryObservation
} from "./failures.js";

export function createChannelsSendmailModule(): ObservationModuleManifest {
  const tracker = createSendmailFailureTracker();
  return Object.freeze({
    name: "channels-sendmail",
    cadence: Object.freeze({ intervalMs: 5_000, timeoutMs: 2_000 }),
    lifecycle: Object.freeze({
      legacyCorrelationKey: tracker.legacyCorrelationKey,
      restore: tracker.restore
    }),
    async probe() {
      const result = consumeSendmailResult();
      return result === null
        ? Object.freeze([])
        : Object.freeze([sendmailDeliveryObservation(result.outcome, result.at)]);
    },
    samples() { return Object.freeze([]); },
    signals(observations) {
      return Object.freeze(observations.flatMap((observation) => tracker.observe(observation)));
    }
  });
}

const manifest = createChannelsSendmailModule();

export default manifest;
