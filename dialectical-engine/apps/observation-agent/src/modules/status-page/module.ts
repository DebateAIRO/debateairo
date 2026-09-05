import type { ObservationModuleManifest } from "../../core/types.js";
import { startStatusPage, type StatusPageServer } from "./status-page.js";

let serverPromise: Promise<StatusPageServer> | null = null;

const manifest: ObservationModuleManifest = Object.freeze({
  name: "status-page",
  cadence: Object.freeze({ intervalMs: 30_000, timeoutMs: 2_000 }),
  async probe(context) {
    const configuredPort = context.thresholds.port;
    const port = typeof configuredPort === "number" ? configuredPort : 9797;
    serverPromise ??= startStatusPage({ stateDir: context.stateDir, port });
    await serverPromise;
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

export default manifest;
