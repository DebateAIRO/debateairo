import type { ObservationModuleManifest } from "../../core/types.js";
import {
  consumeSendmailFailure,
  sendmailFailureObservation,
  sendmailFailureSignal
} from "./failures.js";

const manifest: ObservationModuleManifest = Object.freeze({
  name: "channels-sendmail",
  cadence: Object.freeze({ intervalMs: 5_000, timeoutMs: 2_000 }),
  async probe() {
    const failure = consumeSendmailFailure();
    return failure === null
      ? Object.freeze([])
      : Object.freeze([sendmailFailureObservation(failure)]);
  },
  samples() { return Object.freeze([]); },
  signals(observations) {
    return Object.freeze(observations
      .filter((observation) => observation.probe === "sendmail_delivery" && !observation.ok)
      .map(sendmailFailureSignal));
  }
});

export default manifest;
