import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signalSchema, type ObservationSignal } from "../../apps/observation-agent/src/core/signals.js";
import { writeAcknowledgement } from "../../apps/observation-agent/src/modules/routing/acknowledgements.js";
import { createObservationSignalRouter } from "../../apps/observation-agent/src/modules/routing/router.js";
import {
  emptyRoutingState,
  readRoutingState,
  writeRoutingState
} from "../../apps/observation-agent/src/modules/routing/state.js";

const scratchDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-07-escalation-"));
  scratchDirectories.push(path);
  return path;
}

function open(id: string, severity: "SEVERE" | "FATAL", at: string): ObservationSignal {
  return signalSchema.parse({
    seq: Number(id.slice(-4)), signal_id: id, state: "OPEN", class: "INFRA_DOWN",
    component: "hatchet", severity, impact_code: "IMPACT_HATCHET_DOWN",
    first_failed_probe_at: at, detected_at: at,
    evidence: { probe: "http_get", last_status: "FAILED" }, suspected_defect: false,
    defect_kind: null, run_ref: null, work_item_ref: null, threshold_version: 7,
    clears_signal_id: null, recorded_at: at
  });
}

const policy = Object.freeze({ rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 });
const moduleContext = Object.freeze({ thresholdVersion: 7, thresholds: Object.freeze({
  escalation_interval_ms: 1_800_000,
  fatal_resend_max: 3
}) });

describe("OBS-07 acknowledgement and escalation", () => {
  it("cancels a durable pending attempt after acknowledgement without invoking its channel", async () => {
    const stateDir = await scratch();
    const fatal = open(
      "70000000-0000-4000-8000-000000000099", "FATAL", "2026-09-05T12:00:00.000Z"
    );
    const state = emptyRoutingState();
    state.opens[fatal.signal_id] = {
      signal: fatal,
      closed: false,
      attempts: [{
        channel: "sendmail", ordinal: 0, disposition: "EXECUTE", state: "PENDING",
        attempted_at: fatal.detected_at, external_ref: null
      }],
      fatal_resends: 0,
      severe_email_sent: false,
      acknowledged_at: null
    };
    await writeRoutingState(stateDir, state);
    await writeAcknowledgement({
      stateDir, signalId: fatal.signal_id,
      acknowledgedAt: new Date("2026-09-05T12:00:01.000Z")
    });
    const dispositions: string[] = [];
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: { async attempt(action) {
        dispositions.push(action.disposition);
        expect(action.execute).toBeUndefined();
        return Object.freeze({
          delivery_id: crypto.randomUUID(), signal_id: action.signal.signal_id,
          channel: action.channel, attempted_at: action.now.toISOString(), delivered_at: null,
          outcome: "MUTED", external_ref: null
        });
      } },
      executors: {
        osascript: async () => { throw new Error("must not execute"); },
        sendmail: async () => { throw new Error("must not execute"); },
        kanban: async () => { throw new Error("must not execute"); }
      },
      configuration: {}, thresholds: moduleContext.thresholds, thresholdVersion: 7
    });
    await router.onTick({
      now: new Date("2026-09-05T12:00:02.000Z"), policy, mute: null, module: moduleContext
    });
    expect(dispositions).toEqual(["MUTED"]);
    expect((await readRoutingState(stateDir)).opens[fatal.signal_id]?.attempts[0]).toMatchObject({
      disposition: "MUTED", state: "MUTED"
    });
  });

  it("re-notifies FATAL on all routed channels every 30m at most three times after initial", async () => {
    const stateDir = await scratch();
    const attempts: Array<Readonly<{ channel: string; signal: ObservationSignal; disposition: string }>> = [];
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: { async attempt(action) {
        attempts.push(action);
        return Object.freeze({
          delivery_id: crypto.randomUUID(), signal_id: action.signal.signal_id,
          channel: action.channel, attempted_at: action.now.toISOString(),
          delivered_at: action.disposition === "EXECUTE" ? action.now.toISOString() : null,
          outcome: action.disposition === "EXECUTE" ? "DELIVERED" : action.disposition,
          external_ref: action.channel === "kanban" ? "ticket-fatal" : null
        });
      } },
      executors: {
        osascript: async (value, now) => ({ deliveredAt: now, externalRef: null }),
        sendmail: async (value, now) => ({ deliveredAt: now, externalRef: null }),
        kanban: async (value, now) => ({ deliveredAt: now, externalRef: "ticket-fatal" })
      },
      configuration: Object.freeze({}), thresholds: moduleContext.thresholds, thresholdVersion: 7
    });
    const fatal = open(
      "70000000-0000-4000-8000-000000000101", "FATAL", "2026-09-05T13:00:00.000Z"
    );
    await router.onSignal({ signal: fatal, now: new Date(fatal.detected_at), policy, mute: null, module: moduleContext });
    for (const minute of [29, 30, 60, 90, 120]) {
      await router.onTick({
        now: new Date(Date.parse(fatal.detected_at) + minute * 60_000), policy, mute: null,
        module: moduleContext
      });
    }
    expect(attempts.filter(({ disposition }) => disposition === "EXECUTE")).toHaveLength(12);
    expect(attempts.map(({ channel }) => channel)).toEqual([
      "osascript", "sendmail", "kanban",
      "osascript", "sendmail", "kanban",
      "osascript", "sendmail", "kanban",
      "osascript", "sendmail", "kanban"
    ]);
    expect(router.status()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "metric", key: "escalation.fatal", value: 3, unit: "COUNT" })
    ]));
  });

  it("sends one SEVERE escalation email and acknowledgement suppresses pending escalation", async () => {
    const stateDir = await scratch();
    const attempts: Array<Readonly<{ channel: string; signal: ObservationSignal; disposition: string }>> = [];
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: { async attempt(action) {
        attempts.push(action);
        return Object.freeze({
          delivery_id: crypto.randomUUID(), signal_id: action.signal.signal_id,
          channel: action.channel, attempted_at: action.now.toISOString(),
          delivered_at: action.disposition === "EXECUTE" ? action.now.toISOString() : null,
          outcome: action.disposition === "EXECUTE" ? "DELIVERED" : action.disposition,
          external_ref: action.channel === "kanban" ? `ticket-${action.signal.signal_id}` : null
        });
      } },
      executors: {
        osascript: async (value, now) => ({ deliveredAt: now, externalRef: null }),
        sendmail: async (value, now) => ({ deliveredAt: now, externalRef: null }),
        kanban: async (value, now) => ({ deliveredAt: now, externalRef: "ticket-severe" })
      },
      configuration: Object.freeze({}), thresholds: moduleContext.thresholds, thresholdVersion: 7
    });
    const severe = open(
      "70000000-0000-4000-8000-000000000201", "SEVERE", "2026-09-05T14:00:00.000Z"
    );
    await router.onSignal({ signal: severe, now: new Date(severe.detected_at), policy, mute: null, module: moduleContext });
    await router.onTick({ now: new Date("2026-09-05T14:30:00.000Z"), policy, mute: null, module: moduleContext });
    await router.onTick({ now: new Date("2026-09-05T15:00:00.000Z"), policy, mute: null, module: moduleContext });
    expect(attempts.map(({ channel }) => channel)).toEqual(["osascript", "kanban", "sendmail"]);

    const acknowledged = open(
      "70000000-0000-4000-8000-000000000202", "FATAL", "2026-09-05T16:00:00.000Z"
    );
    await router.onSignal({
      signal: acknowledged, now: new Date(acknowledged.detected_at), policy, mute: null,
      module: moduleContext
    });
    await writeAcknowledgement({ stateDir, signalId: acknowledged.signal_id,
      acknowledgedAt: new Date("2026-09-05T16:05:00.000Z") });
    await router.onTick({ now: new Date("2026-09-05T17:31:00.000Z"), policy, mute: null, module: moduleContext });
    expect(attempts.filter(({ signal }) => signal.signal_id === acknowledged.signal_id)).toHaveLength(3);
    expect(router.status()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "uuid", key: "ack.signal", value: acknowledged.signal_id }),
      expect.objectContaining({ kind: "state", key: "ack.state", state: "ACKED" })
    ]));
  });

  it("reconciles a completed SEVERE escalation after a crash before its marker write", async () => {
    const stateDir = await scratch();
    const severe = open(
      "70000000-0000-4000-8000-000000000301", "SEVERE", "2026-09-05T18:00:00.000Z"
    );
    const state = emptyRoutingState();
    state.opens[severe.signal_id] = {
      signal: severe,
      closed: false,
      attempts: [
        { channel: "osascript", ordinal: 0, disposition: "EXECUTE", state: "DELIVERED",
          attempted_at: severe.detected_at, external_ref: null },
        { channel: "kanban", ordinal: 0, disposition: "EXECUTE", state: "DELIVERED",
          attempted_at: severe.detected_at, external_ref: "ticket-severe" },
        { channel: "sendmail", ordinal: 0, disposition: "EXECUTE", state: "DELIVERED",
          attempted_at: "2026-09-05T18:30:00.000Z", external_ref: null }
      ],
      fatal_resends: 0,
      severe_email_sent: false,
      acknowledged_at: null
    };
    await writeRoutingState(stateDir, state);
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: { async attempt() { throw new Error("must not duplicate completed escalation"); } },
      executors: {
        osascript: async () => { throw new Error("must not execute"); },
        sendmail: async () => { throw new Error("must not execute"); },
        kanban: async () => { throw new Error("must not execute"); }
      },
      configuration: {}, thresholds: moduleContext.thresholds, thresholdVersion: 7
    });
    await router.onTick({
      now: new Date("2026-09-05T19:00:00.000Z"), policy, mute: null, module: moduleContext
    });
    expect((await readRoutingState(stateDir)).opens[severe.signal_id]?.severe_email_sent).toBe(true);
  });

  it("reconciles three completed FATAL resend rounds after a crash before the counter write", async () => {
    const stateDir = await scratch();
    const fatal = open(
      "70000000-0000-4000-8000-000000000302", "FATAL", "2026-09-05T20:00:00.000Z"
    );
    const state = emptyRoutingState();
    state.opens[fatal.signal_id] = {
      signal: fatal,
      closed: false,
      attempts: (["osascript", "sendmail", "kanban"] as const).flatMap((channel) =>
        [0, 1, 2, 3].map((ordinal) => ({
          channel,
          ordinal,
          disposition: "EXECUTE" as const,
          state: "DELIVERED" as const,
          attempted_at: new Date(Date.parse(fatal.detected_at) + ordinal * 1_800_000).toISOString(),
          external_ref: channel === "kanban" ? "ticket-fatal" : null
        }))),
      fatal_resends: 0,
      severe_email_sent: false,
      acknowledged_at: null
    };
    await writeRoutingState(stateDir, state);
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: { async attempt() { throw new Error("must not exceed three completed resends"); } },
      executors: {
        osascript: async () => { throw new Error("must not execute"); },
        sendmail: async () => { throw new Error("must not execute"); },
        kanban: async () => { throw new Error("must not execute"); }
      },
      configuration: {}, thresholds: moduleContext.thresholds, thresholdVersion: 7
    });
    await router.onTick({
      now: new Date("2026-09-05T22:00:00.000Z"), policy, mute: null, module: moduleContext
    });
    const recovered = (await readRoutingState(stateDir)).opens[fatal.signal_id];
    expect(recovered?.fatal_resends).toBe(3);
    expect(recovered?.attempts).toHaveLength(12);
  });
});
