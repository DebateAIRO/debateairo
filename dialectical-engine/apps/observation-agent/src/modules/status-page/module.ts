import { ObservationError } from "../../core/errors.js";
import type {
  ModuleConfigurationObject,
  ObservationModuleManifest
} from "../../core/types.js";
import { startStatusPage, type StatusPageServer } from "./status-page.js";

type StartStatusPage = typeof startStatusPage;

function parseStatusPagePort(thresholds: ModuleConfigurationObject): number {
  const keys = Reflect.ownKeys(thresholds);
  if (keys.length === 0) return 9797;
  if (keys.length !== 1 || keys[0] !== "port" || thresholds.port !== 9797) {
    throw new ObservationError("OBSERVATION_STATUS_BIND_INVALID");
  }
  return 9797;
}

export function createStatusPageModule(
  dependencies: Readonly<{ start?: StartStatusPage }> = Object.freeze({})
): ObservationModuleManifest {
  let serverPromise: Promise<StatusPageServer> | null = null;
  const start = dependencies.start ?? startStatusPage;
  return Object.freeze({
    name: "status-page",
    cadence: Object.freeze({ intervalMs: 30_000, timeoutMs: 2_000 }),
    async probe(context) {
      const port = parseStatusPagePort(context.thresholds);
      serverPromise ??= start({ stateDir: context.stateDir, port });
      try {
        await serverPromise;
      } catch (error) {
        if (!(error instanceof ObservationError)
          || error.code !== "OBSERVATION_STATUS_BIND_FAILED") throw error;
        serverPromise = null;
        return Object.freeze([Object.freeze({
          component: "observation_agent" as const,
          ok: false,
          class: "AGENT_SELF" as const,
          probe: "loopback_status",
          lastStatus: "DEGRADED",
          observedAt: context.now,
          management: "module" as const,
          statusState: "UNKNOWN" as const,
          status: Object.freeze([
            Object.freeze({
              kind: "state" as const, key: "status.health", state: "DEGRADED" as const
            }),
            Object.freeze({
              kind: "loopback_endpoint" as const, key: "status", port: 9797, path: "/status"
            })
          ])
        })]);
      }
      return Object.freeze([Object.freeze({
        component: "observation_agent" as const,
        ok: true,
        class: "AGENT_SELF" as const,
        probe: "loopback_status",
        lastStatus: "READY",
        observedAt: context.now,
        management: "module" as const,
        statusState: "UP" as const,
        status: Object.freeze([Object.freeze({
          kind: "loopback_endpoint" as const,
          key: "status",
          port: 9797,
          path: "/status"
        })])
      })]);
    },
    samples() { return Object.freeze([]); },
    signals() { return Object.freeze([]); }
  });
}

const manifest = createStatusPageModule();

export default manifest;
