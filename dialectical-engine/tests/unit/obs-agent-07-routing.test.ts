import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signalSchema, type ObservationSignal } from "../../apps/observation-agent/src/core/signals.js";
import {
  createObservationSignalRouter,
  routedChannels
} from "../../apps/observation-agent/src/modules/routing/router.js";

const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-07-routing-"));
  scratchDirectories.push(path);
  return path;
}

function signal(input: Readonly<{
  id: string;
  at: string;
  severity: "INFO" | "DEGRADED" | "SEVERE" | "FATAL";
  state?: "OPEN" | "CLEARED";
  clears?: string | null;
}>): ObservationSignal {
  const state = input.state ?? "OPEN";
  return signalSchema.parse({
    seq: Number(input.id.slice(-4)),
    signal_id: input.id,
    state,
    class: "INFRA_DOWN",
    component: "hatchet",
    severity: input.severity,
    impact_code: state === "CLEARED" ? "IMPACT_CLEARED" : "IMPACT_HATCHET_DOWN",
    first_failed_probe_at: input.at,
    detected_at: input.at,
    evidence: state === "CLEARED"
      ? { probe: "http_get", last_status: "READY", duration_seconds: 20 }
      : { probe: "http_get", last_status: "FAILED" },
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: 7,
    clears_signal_id: input.clears ?? null,
    recorded_at: input.at
  });
}

function context(now: string, mute: null | Readonly<{ component?: "hatchet" }> = null) {
  return Object.freeze({
    now: new Date(now),
    mute,
    policy: Object.freeze({ rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 }),
    module: Object.freeze({ thresholdVersion: 7, thresholds: Object.freeze({}) })
  });
}

describe("OBS-07 severity routing", () => {
  it("maps OPEN severities and CLEARED to the exact closed channel matrix", () => {
    expect(routedChannels("FATAL")).toEqual(["osascript", "sendmail", "kanban"]);
    expect(routedChannels("SEVERE")).toEqual(["osascript", "kanban"]);
    expect(routedChannels("DEGRADED")).toEqual([]);
    expect(routedChannels("INFO")).toEqual([]);
  });

  it("records mute and ten-minute per-key rate limits while escalation bypasses the limit", async () => {
    const stateDir = await scratch();
    const attempts: Array<Readonly<{ channel: string; disposition: string; signal: ObservationSignal }>> = [];
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: {
        async attempt(action) {
          attempts.push(action);
          return Object.freeze({
            delivery_id: crypto.randomUUID(),
            signal_id: action.signal.signal_id,
            channel: action.channel,
            attempted_at: action.now.toISOString(),
            delivered_at: action.disposition === "EXECUTE" ? action.now.toISOString() : null,
            outcome: action.disposition === "EXECUTE" ? "DELIVERED" : action.disposition,
            external_ref: action.channel === "kanban" && action.disposition === "EXECUTE" ? "ticket-1" : null
          });
        }
      },
      executors: {
        osascript: async (value, now) => ({ deliveredAt: now, externalRef: null }),
        sendmail: async (value, now) => ({ deliveredAt: now, externalRef: null }),
        kanban: async (value, now) => ({ deliveredAt: now, externalRef: "ticket-1" })
      },
      configuration: Object.freeze({}),
      thresholds: Object.freeze({}),
      thresholdVersion: 7
    });
    const first = signal({
      id: "70000000-0000-4000-8000-000000000001",
      at: "2026-09-05T10:00:00.000Z",
      severity: "SEVERE"
    });
    await router.onSignal({ signal: first, ...context("2026-09-05T10:00:00.000Z") });
    const repeated = signal({
      id: "70000000-0000-4000-8000-000000000002",
      at: "2026-09-05T10:01:00.000Z",
      severity: "SEVERE"
    });
    await router.onSignal({ signal: repeated, ...context("2026-09-05T10:01:00.000Z") });
    const escalated = signal({
      id: "70000000-0000-4000-8000-000000000003",
      at: "2026-09-05T10:02:00.000Z",
      severity: "FATAL"
    });
    await router.onSignal({ signal: escalated, ...context("2026-09-05T10:02:00.000Z") });
    const muted = signal({
      id: "70000000-0000-4000-8000-000000000004",
      at: "2026-09-05T10:20:00.000Z",
      severity: "FATAL"
    });
    await router.onSignal({ signal: muted, ...context("2026-09-05T10:20:00.000Z", {}) });

    expect(attempts.map(({ channel, disposition }) => [channel, disposition])).toEqual([
      ["osascript", "EXECUTE"], ["kanban", "EXECUTE"],
      ["osascript", "RATE_LIMITED"], ["kanban", "RATE_LIMITED"],
      ["osascript", "EXECUTE"], ["sendmail", "EXECUTE"], ["kanban", "EXECUTE"],
      ["osascript", "MUTED"], ["sendmail", "MUTED"], ["kanban", "MUTED"]
    ]);
  });

  it("delays DEGRADED osascript for fifteen continuous minutes and clears only used channels", async () => {
    const stateDir = await scratch();
    const attempts: Array<Readonly<{ channel: string; disposition: string; signal: ObservationSignal }>> = [];
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: {
        async attempt(action) {
          attempts.push(action);
          return Object.freeze({
            delivery_id: crypto.randomUUID(), signal_id: action.signal.signal_id,
            channel: action.channel, attempted_at: action.now.toISOString(),
            delivered_at: action.disposition === "EXECUTE" ? action.now.toISOString() : null,
            outcome: action.disposition === "EXECUTE" ? "DELIVERED" : action.disposition,
            external_ref: action.channel === "kanban" && action.disposition === "EXECUTE" ? "ticket-2" : null
          });
        }
      },
      executors: {
        osascript: async (value, now) => ({ deliveredAt: now, externalRef: null }),
        sendmail: async (value, now) => ({ deliveredAt: now, externalRef: null }),
        kanban: async (value, now) => ({ deliveredAt: now, externalRef: "ticket-2" })
      },
      configuration: Object.freeze({}), thresholds: Object.freeze({}), thresholdVersion: 7
    });
    const degraded = signal({
      id: "70000000-0000-4000-8000-000000000011",
      at: "2026-09-05T11:00:00.000Z", severity: "DEGRADED"
    });
    await router.onSignal({ signal: degraded, ...context("2026-09-05T11:00:00.000Z") });
    await router.onTick(context("2026-09-05T11:14:59.999Z"));
    expect(attempts).toEqual([]);
    await router.onTick(context("2026-09-05T11:15:00.000Z"));
    expect(attempts.map(({ channel }) => channel)).toEqual(["osascript"]);
    const clear = signal({
      id: "70000000-0000-4000-8000-000000000012",
      at: "2026-09-05T11:16:00.000Z", severity: "DEGRADED", state: "CLEARED",
      clears: degraded.signal_id
    });
    await router.onSignal({ signal: clear, ...context("2026-09-05T11:16:00.000Z") });
    expect(attempts.map(({ channel }) => channel)).toEqual(["osascript", "osascript"]);

    const info = signal({
      id: "70000000-0000-4000-8000-000000000013",
      at: "2026-09-05T12:00:00.000Z", severity: "INFO"
    });
    await router.onSignal({ signal: info, ...context("2026-09-05T12:00:00.000Z") });
    const infoClear = signal({
      id: "70000000-0000-4000-8000-000000000014",
      at: "2026-09-05T12:01:00.000Z", severity: "INFO", state: "CLEARED",
      clears: info.signal_id
    });
    await router.onSignal({ signal: infoClear, ...context("2026-09-05T12:01:00.000Z") });
    expect(attempts.map(({ channel }) => channel)).toEqual(["osascript", "osascript"]);
  });

  it("projects the latest onSignal and onTick thresholds instead of bootstrap thresholds", async () => {
    const stateDir = await scratch();
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: { async attempt(action) {
        return Object.freeze({
          delivery_id: crypto.randomUUID(), signal_id: action.signal.signal_id,
          channel: action.channel, attempted_at: action.now.toISOString(), delivered_at: null,
          outcome: action.disposition === "EXECUTE" ? "DELIVERED" : action.disposition,
          external_ref: null
        });
      } },
      executors: {
        osascript: async () => { throw new Error("muted route must not execute"); },
        sendmail: async () => { throw new Error("muted route must not execute"); },
        kanban: async () => { throw new Error("muted route must not execute"); }
      },
      configuration: {},
      thresholds: { board: "boot-board", storm_count: 5, storm_window_s: 60 },
      thresholdVersion: 7
    });
    const fatal = signal({
      id: "70000000-0000-4000-8000-000000000021",
      at: "2026-09-05T13:00:00.000Z", severity: "FATAL"
    });
    await router.onSignal({
      signal: fatal,
      now: new Date(fatal.detected_at),
      mute: {},
      policy: { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 },
      module: { thresholdVersion: 8,
        thresholds: { board: "signal-board", storm_count: 6, storm_window_s: 70 } }
    });
    expect(router.status()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "identifier", key: "board", value: "signal-board" }),
      expect.objectContaining({ kind: "template", key: "storm.threshold",
        count: 6, windowSeconds: 70 })
    ]));

    await router.onTick({
      now: new Date("2026-09-05T13:00:01.000Z"),
      mute: null,
      policy: { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 },
      module: { thresholdVersion: 9,
        thresholds: { board: "tick-board", storm_count: 7, storm_window_s: 80 } }
    });
    expect(router.status()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "identifier", key: "board", value: "tick-board" }),
      expect.objectContaining({ kind: "template", key: "storm.threshold",
        count: 7, windowSeconds: 80 })
    ]));
  });

  it("projects current mute state and conditional CLEARED routes explicitly", async () => {
    const stateDir = await scratch();
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: { async attempt(action) {
        return Object.freeze({
          delivery_id: crypto.randomUUID(), signal_id: action.signal.signal_id,
          channel: action.channel, attempted_at: action.now.toISOString(), delivered_at: null,
          outcome: action.disposition === "EXECUTE" ? "DELIVERED" : action.disposition,
          external_ref: null
        });
      } },
      executors: {
        osascript: async () => { throw new Error("muted route must not execute"); },
        sendmail: async () => { throw new Error("muted route must not execute"); },
        kanban: async () => { throw new Error("muted route must not execute"); }
      },
      configuration: {}, thresholds: {}, thresholdVersion: 7
    });
    const fatal = signal({
      id: "70000000-0000-4000-8000-000000000022",
      at: "2026-09-05T14:00:00.000Z", severity: "FATAL"
    });
    await router.onSignal({ signal: fatal, ...context(fatal.detected_at, {}) });
    expect(router.status()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "state", key: "routing.mute", state: "MUTED" }),
      expect.objectContaining({ kind: "channels", key: "route.cleared.always",
        channels: ["digest", "status"] }),
      expect.objectContaining({ kind: "channels", key: "route.cleared.if-routed",
        channels: ["osascript"] }),
      expect.objectContaining({ kind: "channels", key: "route.cleared.if-ticketed",
        channels: ["kanban"] })
    ]));
    expect(router.status()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "channels", key: "route.cleared" })
    ]));

    await router.onTick(context("2026-09-05T14:00:01.000Z", null));
    expect(router.status()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "state", key: "routing.mute", state: "OPEN" })
    ]));
  });
});
