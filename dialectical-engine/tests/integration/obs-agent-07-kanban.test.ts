import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signalSchema } from "../../apps/observation-agent/src/core/signals.js";
import {
  createKanbanDeliveryExecutor,
  parseKanbanList
} from "../../apps/observation-agent/src/modules/channels-kanban/kanban.js";
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
  const path = await mkdtemp(join(tmpdir(), "obs-07-kanban-"));
  scratchDirectories.push(path);
  return path;
}

function signal(state: "OPEN" | "CLEARED" = "OPEN") {
  const at = state === "OPEN" ? "2026-09-05T09:00:00.000Z" : "2026-09-05T09:01:00.000Z";
  return signalSchema.parse({
    seq: state === "OPEN" ? 711 : 712,
    signal_id: state === "OPEN"
      ? "70000000-0000-4000-8000-000000000711"
      : "70000000-0000-4000-8000-000000000712",
    state, class: "INFRA_DOWN", component: "hatchet", severity: "FATAL",
    impact_code: state === "OPEN" ? "IMPACT_HATCHET_DOWN" : "IMPACT_CLEARED",
    first_failed_probe_at: "2026-09-05T09:00:00.000Z", detected_at: at,
    evidence: state === "OPEN"
      ? { probe: "http_get", last_status: "FAILED" }
      : { probe: "http_get", last_status: "READY", duration_seconds: 60 },
    suspected_defect: false, defect_kind: null, run_ref: null, work_item_ref: null,
    threshold_version: 7,
    clears_signal_id: state === "OPEN" ? null : "70000000-0000-4000-8000-000000000711",
    recorded_at: at
  });
}

describe("OBS-07 Kanban channel", () => {
  it("parses Hermes list as a top-level array and rejects object wrappers", () => {
    expect(parseKanbanList('[{"id":"ticket-7","title":"safe"}]')).toEqual([
      { id: "ticket-7", title: "safe" }
    ]);
    expect(() => parseKanbanList('{"tasks":[]}')).toThrow("OBSERVATION_KANBAN_LIST_INVALID");
  });

  it("creates once with exact argv/idempotency and comments by ticket id on CLEARED", async () => {
    const calls: Array<Readonly<{ file: string; args: readonly string[] }>> = [];
    const executor = createKanbanDeliveryExecutor({
      board: "ops-alerts",
      hermesPath: "/Users/test/.local/bin/hermes",
      async execute(file, args) {
        calls.push({ file, args });
        return { stdout: args.includes("create") ? '{"id":"ticket-7"}' : "", stderr: "" };
      }
    });
    const opened = signal("OPEN");
    await expect(executor(opened, new Date(opened.detected_at), { ordinal: 0, openExternalRef: null }))
      .resolves.toMatchObject({ externalRef: "ticket-7" });
    const cleared = signal("CLEARED");
    await expect(executor(cleared, new Date(cleared.detected_at), {
      ordinal: 0, openExternalRef: "ticket-7"
    })).resolves.toMatchObject({ externalRef: "ticket-7" });
    expect(calls).toEqual([
      {
        file: "/Users/test/.local/bin/hermes",
        args: ["kanban", "--board", "ops-alerts", "create",
          "dialectical-engine FATAL hatchet INFRA_DOWN", "--body",
          "Hatchet is down: asks are accepted but no debate work is dispatched or run.",
          "--created-by", "observation-agent", "--idempotency-key",
          "hatchet:INFRA_DOWN:70000000-0000-4000-8000-000000000711"]
      },
      {
        file: "/Users/test/.local/bin/hermes",
        args: ["kanban", "--board", "ops-alerts", "comment", "ticket-7",
          "hatchet: INFRA_DOWN cleared after 60 seconds.", "--author", "observation-agent"]
      }
    ]);
  });

  it("accepts only anchored Hermes human create output while retaining JSON compatibility", async () => {
    const opened = signal("OPEN");
    const humanExecutor = createKanbanDeliveryExecutor({
      board: "ops-alerts",
      hermesPath: "/Users/test/.local/bin/hermes",
      async execute() {
        return { stdout: "Created t_obs07  (running, assignee=-)\n", stderr: "" };
      }
    });
    await expect(humanExecutor(opened, new Date(opened.detected_at), {
      ordinal: 0, openExternalRef: null
    })).resolves.toMatchObject({ externalRef: "t_obs07" });

    const trailingOutputExecutor = createKanbanDeliveryExecutor({
      board: "ops-alerts",
      hermesPath: "/Users/test/.local/bin/hermes",
      async execute() {
        return {
          stdout: "Created t_obs07  (running, assignee=-)\nUNTRUSTED TRAILING OUTPUT\n",
          stderr: ""
        };
      }
    });
    await expect(trailingOutputExecutor(opened, new Date(opened.detected_at), {
      ordinal: 0, openExternalRef: null
    })).rejects.toThrow("OBSERVATION_KANBAN_RESPONSE_INVALID");
  });

  it("persists attempt identity before execution and reuses one ticket across duplicate delivery", async () => {
    const stateDir = await scratch();
    let creates = 0;
    const opened = signal("OPEN");
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: { async attempt(action) {
        const stored = JSON.parse(await readFile(join(stateDir, "routing-state.json"), "utf8"));
        expect(stored.opens[opened.signal_id].attempts.find(
          (attempt: Readonly<{ channel: string }>) => attempt.channel === action.channel
        )).toMatchObject({
          channel: action.channel, state: "PENDING"
        });
        const result = action.disposition === "EXECUTE" ? await action.execute!() : null;
        return Object.freeze({
          delivery_id: crypto.randomUUID(), signal_id: action.signal.signal_id,
          channel: action.channel, attempted_at: action.now.toISOString(),
          delivered_at: result?.deliveredAt.toISOString() ?? null,
          outcome: action.disposition === "EXECUTE" ? "DELIVERED" : action.disposition,
          external_ref: result?.externalRef ?? null
        });
      } },
      executors: {
        osascript: async (value, now) => ({ deliveredAt: now, externalRef: null }),
        sendmail: async (value, now) => ({ deliveredAt: now, externalRef: null }),
        kanban: async (value, now) => {
          creates += 1;
          return { deliveredAt: now, externalRef: "ticket-7" };
        }
      },
      configuration: {}, thresholds: {}, thresholdVersion: 7
    });
    const context = {
      signal: opened, now: new Date(opened.detected_at), mute: null,
      policy: { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 },
      module: { thresholdVersion: 7, thresholds: {} }
    } as const;
    await router.onSignal(context);
    await router.onSignal(context);
    expect(creates).toBe(1);
  });

  it("starts independent channels without waiting for sendmail and reports isolated failure", async () => {
    const stateDir = await scratch();
    const started: string[] = [];
    let releaseSendmail!: () => void;
    const sendmailGate = new Promise<void>((resolvePromise) => { releaseSendmail = resolvePromise; });
    let allStarted!: () => void;
    const channelsStarted = new Promise<void>((resolvePromise) => { allStarted = resolvePromise; });
    const failures: string[] = [];
    const opened = signal("OPEN");
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: { async attempt(action) {
        try {
          const result = action.disposition === "EXECUTE" ? await action.execute!() : null;
          return Object.freeze({
            delivery_id: crypto.randomUUID(), signal_id: action.signal.signal_id,
            channel: action.channel, attempted_at: action.now.toISOString(),
            delivered_at: result?.deliveredAt.toISOString() ?? null,
            outcome: action.disposition === "EXECUTE" ? "DELIVERED" : action.disposition,
            external_ref: result?.externalRef ?? null
          });
        } catch {
          return Object.freeze({
            delivery_id: crypto.randomUUID(), signal_id: action.signal.signal_id,
            channel: action.channel, attempted_at: action.now.toISOString(), delivered_at: null,
            outcome: "FAILED", external_ref: null
          });
        }
      } },
      executors: {
        osascript: async (value, now) => {
          started.push("osascript");
          if (started.length === 3) allStarted();
          return { deliveredAt: now, externalRef: null };
        },
        sendmail: async () => {
          started.push("sendmail");
          if (started.length === 3) allStarted();
          await sendmailGate;
          throw new Error("sendmail failed");
        },
        kanban: async (value, now) => {
          started.push("kanban");
          if (started.length === 3) allStarted();
          return { deliveredAt: now, externalRef: "ticket-7" };
        }
      },
      configuration: {}, thresholds: {}, thresholdVersion: 7,
      onChannelFailure(channel) { failures.push(channel); }
    });
    const routing = router.onSignal({
      signal: opened, now: new Date(opened.detected_at), mute: null,
      policy: { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 },
      module: { thresholdVersion: 7, thresholds: {} }
    });
    await channelsStarted;
    expect(started).toEqual(expect.arrayContaining(["osascript", "sendmail", "kanban"]));
    releaseSendmail();
    await routing;
    expect(failures).toEqual(["sendmail"]);
  });

  it("resumes the same pending signal/channel/ordinal after restart", async () => {
    const stateDir = await scratch();
    const opened = signal("OPEN");
    const state = emptyRoutingState();
    state.opens[opened.signal_id] = {
      signal: opened,
      closed: false,
      attempts: [{
        channel: "kanban", ordinal: 0, disposition: "EXECUTE", state: "PENDING",
        attempted_at: opened.detected_at, external_ref: null
      }],
      fatal_resends: 0,
      severe_email_sent: false,
      acknowledged_at: null
    };
    await writeRoutingState(stateDir, state);
    const ordinals: number[] = [];
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: { async attempt(action) {
        const result = await action.execute!();
        return Object.freeze({
          delivery_id: crypto.randomUUID(), signal_id: action.signal.signal_id,
          channel: action.channel, attempted_at: action.now.toISOString(),
          delivered_at: result.deliveredAt.toISOString(), outcome: "DELIVERED",
          external_ref: result.externalRef
        });
      } },
      executors: {
        osascript: async (value, now) => ({ deliveredAt: now, externalRef: null }),
        sendmail: async (value, now) => ({ deliveredAt: now, externalRef: null }),
        kanban: async (value, now, context) => {
          ordinals.push(context.ordinal);
          return { deliveredAt: now, externalRef: "ticket-7" };
        }
      },
      configuration: {}, thresholds: {}, thresholdVersion: 7
    });
    await router.onTick({
      now: new Date("2026-09-05T09:00:01.000Z"), mute: null,
      policy: { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 },
      module: { thresholdVersion: 7, thresholds: {} }
    });
    expect(ordinals).toEqual([0]);
    expect((await readRoutingState(stateDir)).opens[opened.signal_id]?.attempts).toEqual([
      expect.objectContaining({ channel: "kanban", ordinal: 0, state: "DELIVERED", external_ref: "ticket-7" })
    ]);
  });
});
