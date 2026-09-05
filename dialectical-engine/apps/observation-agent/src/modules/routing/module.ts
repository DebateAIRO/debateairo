import { homedir } from "node:os";
import { join } from "node:path";
import { observationRepoRoot } from "../../core/paths.js";
import type { RouterBootstrapInput } from "../../core/routing.js";
import type { ObservationModuleManifest } from "../../core/types.js";
import { createKanbanDeliveryExecutor } from "../channels-kanban/kanban.js";
import { recordSendmailResult } from "../channels-sendmail/failures.js";
import { createSendmailDeliveryExecutor } from "../channels-sendmail/sendmail.js";
import { createObservationSignalRouter } from "./router.js";
import { createStormSummaryExecutor } from "./storm.js";

const manifest: ObservationModuleManifest = Object.freeze({
  name: "routing",
  cadence: Object.freeze({ intervalMs: 5_000, timeoutMs: 2_000 }),
  targetFragmentBasename: "OBS-07.json",
  router: Object.freeze({
    create(input: RouterBootstrapInput) {
      const board = typeof input.thresholds.board === "string" ? input.thresholds.board : "ops-alerts";
      return createObservationSignalRouter({
        stateDir: input.stateDir,
        delivery: input.delivery,
        executors: Object.freeze({
          osascript: (signal, now) => input.osascript(signal, now, 2_000),
          sendmail: createSendmailDeliveryExecutor({
            repoRoot: input.repoRoot ?? observationRepoRoot(),
            stateDir: input.stateDir,
            configuration: input.configuration
          }),
          kanban: createKanbanDeliveryExecutor({
            board,
            hermesPath: join(homedir(), ".local", "bin", "hermes")
          })
        }),
        configuration: input.configuration,
        thresholds: input.thresholds,
        thresholdVersion: input.thresholdVersion,
        stormSummary: createStormSummaryExecutor(undefined, input.thresholds.summary_timeout_ms === undefined
          ? 2_000
          : Number(input.thresholds.summary_timeout_ms)),
        onChannelResult(channel, outcome, at) {
          if (channel === "sendmail") recordSendmailResult(outcome, at);
        }
      });
    }
  }),
  async probe() { return Object.freeze([]); },
  samples() { return Object.freeze([]); },
  signals() { return Object.freeze([]); }
});

export default manifest;
