import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-01-routing-"));
  scratchDirectories.push(path);
  return path;
}

function signal(input: Readonly<{
  seq: number;
  id: string;
  at: string;
  component?: "postgres" | "docker" | "hatchet" | "host";
  severity?: "INFO" | "DEGRADED" | "SEVERE" | "FATAL";
  state?: "OPEN" | "CLEARED";
  clears?: string | null;
}>): Record<string, unknown> {
  const state = input.state ?? "OPEN";
  const component = input.component ?? "hatchet";
  const impact = component === "postgres" ? "IMPACT_PG_DOWN"
    : component === "docker" ? "IMPACT_DOCKER_DOWN"
      : "IMPACT_HATCHET_DOWN";
  return {
    seq: input.seq,
    signal_id: input.id,
    state,
    class: "INFRA_DOWN",
    component,
    severity: input.severity ?? "SEVERE",
    impact_code: state === "CLEARED" ? "IMPACT_CLEARED" : impact,
    first_failed_probe_at: input.at,
    detected_at: input.at,
    evidence: state === "CLEARED"
      ? { probe: "http_get", last_status: "READY", duration_seconds: 5 }
      : { probe: component === "docker" ? "docker_info" : "http_get", last_status: "FAILED" },
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: 1,
    clears_signal_id: input.clears ?? null,
    recorded_at: input.at
  };
}

describe("OBS-01 shared impact and persisted signal routing", () => {
  it("keeps the daemon signal journal ahead of router effects", async () => {
    const source = await readFile("apps/observation-agent/src/main.ts", "utf8");
    const emitStart = source.indexOf("async function emit(");
    const emitEnd = source.indexOf("const moduleRuntime", emitStart);
    const emitSource = source.slice(emitStart, emitEnd);
    expect(emitStart).toBeGreaterThanOrEqual(0);
    expect(emitSource.indexOf("await persistSignal(")).toBeGreaterThanOrEqual(0);
    expect(emitSource.indexOf("await router.onSignal(")).toBeGreaterThan(
      emitSource.indexOf("await persistSignal(")
    );
  });

  it("accepts only the fixed IMPACT_LOAD evidence and renders CPU contention", async () => {
    const { renderImpact, signalSchema } = await import(
      "../../apps/observation-agent/src/core/signals.js"
    );
    const load = signalSchema.parse({
      seq: 1,
      signal_id: "10000000-0000-4000-8000-000000000001",
      state: "OPEN",
      class: "CAPACITY",
      component: "host",
      severity: "DEGRADED",
      impact_code: "IMPACT_LOAD",
      first_failed_probe_at: "2026-09-03T12:00:00.000Z",
      detected_at: "2026-09-03T12:04:30.000Z",
      evidence: {
        load_one_minute: 20.1,
        logical_cores: 10,
        threshold_multiplier: 2,
        sustained_seconds: 300,
        observed_at: "2026-09-03T12:04:30.000Z"
      },
      suspected_defect: false,
      defect_kind: null,
      run_ref: null,
      work_item_ref: null,
      threshold_version: 1,
      clears_signal_id: null,
      recorded_at: "2026-09-03T12:04:30.000Z"
    });
    expect(renderImpact(load)).toBe(
      "Host load is 20.1 across 10 logical cores for 300 seconds: processes are contending for CPU."
    );
    const evidence = load.evidence as Readonly<Record<string, unknown>>;
    for (const extra of [
      { total_bytes: 10 },
      { percent: 50 },
      { unit: "bytes" }
    ]) {
      expect(() => signalSchema.parse({
        ...load,
        evidence: { ...evidence, ...extra }
      })).toThrow("OBSERVATION_EVIDENCE_INVALID");
    }
  });

  it("coordinates ATTEMPT, execution, RESULT and mirror in durable order", async () => {
    const events: string[] = [];
    const stateDir = await scratch();
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
    );
    const { DeliveryCoordinator } = await import(
      "../../apps/observation-agent/src/notify/delivery.js"
    );
    class TrackingJournal extends ObservationJournal {
      override async appendDeliveryAttempt(input: unknown) {
        const result = await super.appendDeliveryAttempt(input);
        events.push("delivery-attempt-fsynced");
        return result;
      }

      override async appendDeliveryResult(input: unknown) {
        const result = await super.appendDeliveryResult(input);
        events.push("delivery-result-fsynced");
        return result;
      }
    }
    const coordinator = new DeliveryCoordinator({
      journal: new TrackingJournal(stateDir),
      mirror: {
        async mirrorDelivery(delivery) {
          const rows = (await readFile(
            join(stateDir, "journal", "deliveries-2026-09-03.jsonl"), "utf8"
          )).trim().split("\n").map((row) => JSON.parse(row));
          expect(rows.at(-1)).toEqual({ kind: "RESULT", delivery });
          events.push("delivery-mirror");
        }
      }
    });
    const parsed = (await import("../../apps/observation-agent/src/core/signals.js"))
      .signalSchema.parse(signal({
        seq: 2,
        id: "10000000-0000-4000-8000-000000000002",
        at: "2026-09-03T12:05:00.000Z"
      }));
    await expect(coordinator.attempt({
      signal: parsed,
      channel: "osascript",
      disposition: "EXECUTE",
      now: new Date("2026-09-03T12:05:01.000Z"),
      execute: async () => {
        events.push("executor");
        return { deliveredAt: new Date("2026-09-03T12:05:01.000Z"), externalRef: null };
      }
    })).resolves.toMatchObject({ outcome: "DELIVERED" });
    expect(events).toEqual([
      "delivery-attempt-fsynced",
      "executor",
      "delivery-result-fsynced",
      "delivery-mirror"
    ]);
  });

  it("journals failures and suppressions while isolating independent actions", async () => {
    const stateDir = await scratch();
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
    );
    const { DeliveryCoordinator } = await import(
      "../../apps/observation-agent/src/notify/delivery.js"
    );
    const { signalSchema } = await import(
      "../../apps/observation-agent/src/core/signals.js"
    );
    const mirrored: string[] = [];
    let executions = 0;
    const coordinator = new DeliveryCoordinator({
      journal: new ObservationJournal(stateDir),
      mirror: { async mirrorDelivery(delivery) { mirrored.push(delivery.outcome); } }
    });
    const parsed = signalSchema.parse(signal({
      seq: 3,
      id: "10000000-0000-4000-8000-000000000003",
      at: "2026-09-03T12:06:00.000Z"
    }));
    await expect(coordinator.attempt({
      signal: parsed,
      channel: "osascript",
      disposition: "EXECUTE",
      now: new Date("2026-09-03T12:06:01.000Z"),
      execute: async () => { executions += 1; throw new Error("channel failed"); }
    })).resolves.toMatchObject({ outcome: "FAILED", delivered_at: null });
    await expect(coordinator.attempt({
      signal: parsed,
      channel: "sendmail",
      disposition: "EXECUTE",
      now: new Date("2026-09-03T12:06:02.000Z"),
      execute: async () => {
        executions += 1;
        return { deliveredAt: new Date("2026-09-03T12:06:02.000Z"), externalRef: "mail-1" };
      }
    })).resolves.toMatchObject({ outcome: "DELIVERED", external_ref: "mail-1" });
    for (const disposition of ["MUTED", "RATE_LIMITED"] as const) {
      await expect(coordinator.attempt({
        signal: parsed,
        channel: "kanban",
        disposition,
        now: new Date("2026-09-03T12:06:03.000Z")
      })).resolves.toMatchObject({ outcome: disposition, delivered_at: null });
    }
    expect(executions).toBe(2);
    expect(mirrored).toEqual(["FAILED", "DELIVERED", "MUTED", "RATE_LIMITED"]);
    const rows = (await readFile(
      join(stateDir, "journal", "deliveries-2026-09-03.jsonl"), "utf8"
    )).trim().split("\n").map((row) => JSON.parse(row));
    expect(rows.map((row) => row.kind)).toEqual([
      "ATTEMPT", "RESULT", "ATTEMPT", "RESULT",
      "ATTEMPT", "RESULT", "ATTEMPT", "RESULT"
    ]);
  });

  it("rejects contradictory delivery actions before any effect", async () => {
    const stateDir = await scratch();
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
    );
    const { DeliveryCoordinator } = await import(
      "../../apps/observation-agent/src/notify/delivery.js"
    );
    const { signalSchema } = await import(
      "../../apps/observation-agent/src/core/signals.js"
    );
    let effects = 0;
    const coordinator = new DeliveryCoordinator({
      journal: new ObservationJournal(stateDir),
      mirror: { async mirrorDelivery() { effects += 1; } }
    });
    const parsed = signalSchema.parse(signal({
      seq: 4,
      id: "10000000-0000-4000-8000-000000000004",
      at: "2026-09-03T12:07:00.000Z"
    }));
    await expect(coordinator.attempt({
      signal: parsed,
      channel: "osascript",
      disposition: "EXECUTE",
      now: new Date("2026-09-03T12:07:01.000Z")
    })).rejects.toThrow("OBSERVATION_DELIVERY_ACTION_INVALID");
    await expect(coordinator.attempt({
      signal: parsed,
      channel: "osascript",
      disposition: "MUTED",
      now: new Date("2026-09-03T12:07:02.000Z"),
      execute: async () => {
        effects += 1;
        return { deliveredAt: new Date(), externalRef: null };
      }
    })).rejects.toThrow("OBSERVATION_DELIVERY_ACTION_INVALID");
    await expect(coordinator.attempt({
      signal: parsed,
      channel: "osascript",
      disposition: "EXECUTE",
      now: new Date("2026-09-03T12:07:03.000Z"),
      execute: "not-an-executor" as never
    })).rejects.toThrow("OBSERVATION_DELIVERY_ACTION_INVALID");
    expect(effects).toBe(0);
    await expect(readFile(join(stateDir, "journal", "deliveries-2026-09-03.jsonl"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves legacy osascript routing when no module contributes a router", async () => {
    const stateDir = await scratch();
    const invocations: Array<readonly string[]> = [];
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
    );
    const { signalSchema } = await import(
      "../../apps/observation-agent/src/core/signals.js"
    );
    const { DeliveryCoordinator } = await import(
      "../../apps/observation-agent/src/notify/delivery.js"
    );
    const { createOsaScriptDeliveryExecutor } = await import(
      "../../apps/observation-agent/src/notify/osascript.js"
    );
    const { createLegacyOsaScriptRouter } = await import(
      "../../apps/observation-agent/src/core/routing.js"
    );
    const delivery = new DeliveryCoordinator({
      journal: new ObservationJournal(stateDir),
      mirror: { async mirrorDelivery() { return undefined; } }
    });
    const osascript = createOsaScriptDeliveryExecutor(async (file, args) => {
      expect(file).toBe("/usr/bin/osascript");
      invocations.push(args);
    });
    const router = createLegacyOsaScriptRouter({ delivery, osascript });
    const policy = { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 };
    const module = Object.freeze({ thresholdVersion: 7, thresholds: Object.freeze({}) });
    const severe = signalSchema.parse(signal({
      seq: 10, id: "10000000-0000-4000-8000-000000000010",
      at: "2026-09-03T13:00:00.000Z", severity: "SEVERE"
    }));
    const fatal = signalSchema.parse(signal({
      seq: 11, id: "10000000-0000-4000-8000-000000000011",
      at: "2026-09-03T13:00:01.000Z", severity: "FATAL"
    }));
    const degraded = signalSchema.parse(signal({
      seq: 12, id: "10000000-0000-4000-8000-000000000012",
      at: "2026-09-03T13:00:02.000Z", component: "docker", severity: "DEGRADED"
    }));
    const info = signalSchema.parse(signal({
      seq: 13, id: "10000000-0000-4000-8000-000000000013",
      at: "2026-09-03T13:00:03.000Z", component: "postgres", severity: "INFO"
    }));
    const cleared = signalSchema.parse(signal({
      seq: 14, id: "10000000-0000-4000-8000-000000000014",
      at: "2026-09-03T13:00:04.000Z", component: "postgres", severity: "INFO",
      state: "CLEARED", clears: info.signal_id
    }));

    await router.onSignal({ signal: severe, now: new Date(severe.detected_at), policy, mute: null, module });
    await router.onSignal({ signal: fatal, now: new Date(fatal.detected_at), policy, mute: null, module });
    await router.onSignal({ signal: degraded, now: new Date(degraded.detected_at), policy, mute: null, module });
    await router.onSignal({ signal: info, now: new Date(info.detected_at), policy, mute: null, module });
    expect(invocations).toHaveLength(2);
    await router.onTick({
      now: new Date("2026-09-03T13:15:02.000Z"), policy, mute: null, module
    });
    expect(invocations).toHaveLength(3);
    await router.onSignal({ signal: cleared, now: new Date(cleared.detected_at), policy, mute: null, module });
    expect(invocations).toHaveLength(4);
    expect(invocations[0]).toEqual([
      "-e",
      "display notification \"Hatchet is down: asks are accepted but no debate work is dispatched or run.\" with title \"dialectical-engine: hatchet SEVERE\" subtitle \"INFRA_DOWN\""
    ]);
    expect(router.status()).toEqual([]);
    expect(Object.isFrozen(router.status())).toBe(true);
  });
});
