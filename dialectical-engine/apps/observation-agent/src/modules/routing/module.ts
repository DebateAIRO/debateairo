import { homedir } from "node:os";
import { join } from "node:path";
import { observationRepoRoot } from "../../core/paths.js";
import { ObservationError } from "../../core/errors.js";
import type { RouterBootstrapInput } from "../../core/routing.js";
import type { ObservationModuleManifest, RestoredOpenSignal } from "../../core/types.js";
import { createKanbanDeliveryExecutor } from "../channels-kanban/kanban.js";
import { createSendmailDeliveryExecutor } from "../channels-sendmail/sendmail.js";
import {
  createDeliveryHealthTracker,
  deliveryHealthLegacyCorrelationKey
} from "./delivery-health.js";
import { createObservationSignalRouter } from "./router.js";
import { createStormSummaryExecutor } from "./storm.js";

export function createRoutingModule(): ObservationModuleManifest {
  let tracker: ReturnType<typeof createDeliveryHealthTracker> | null = null;
  let restoredOpens: readonly RestoredOpenSignal[] = Object.freeze([]);
  return Object.freeze({
    name: "routing",
    cadence: Object.freeze({ intervalMs: 5_000, timeoutMs: 2_000 }),
    lifecycle: Object.freeze({
      legacyCorrelationKey: deliveryHealthLegacyCorrelationKey,
      restore(opens: readonly RestoredOpenSignal[]) {
        restoredOpens = Object.freeze([...opens]);
        tracker?.restore(restoredOpens);
      }
    }),
    targetFragmentBasename: "OBS-07.json",
    router: Object.freeze({
      create(input: RouterBootstrapInput) {
        if (tracker !== null) throw new ObservationError("OBSERVATION_MODULE_INVALID");
        tracker = createDeliveryHealthTracker(input.deliveryResults ?? Object.freeze([]));
        tracker.restore(restoredOpens);
        const board = typeof input.thresholds.board === "string"
          ? input.thresholds.board
          : "ops-alerts";
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
          stormSummary: createStormSummaryExecutor(
            undefined,
            input.thresholds.summary_timeout_ms === undefined
              ? 2_000
              : Number(input.thresholds.summary_timeout_ms)
          ),
          onChannelResult(channel, outcome, at) {
            tracker!.record({ channel, outcome, at });
          }
        });
      }
    }),
    async probe() { return Object.freeze([]); },
    samples() { return Object.freeze([]); },
    signals() {
      return tracker?.drain() ?? Object.freeze([]);
    }
  });
}

const manifest = createRoutingModule();

export default manifest;
