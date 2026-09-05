import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RouterCurrentContext } from "../../apps/observation-agent/src/core/routing.js";
import { migrate } from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let stateDir: string;
const EMPTY_ROUTER_MODULE = Object.freeze({
  thresholdVersion: 1,
  thresholds: Object.freeze({})
});

function signal(input: Readonly<{
  seq: number;
  id: string;
  state?: "OPEN" | "CLEARED";
  clears?: string | null;
  severity?: "SEVERE" | "FATAL";
}>): Record<string, unknown> {
  const state = input.state ?? "OPEN";
  return {
    seq: input.seq,
    signal_id: input.id,
    state,
    class: "INFRA_DOWN",
    component: "hatchet",
    severity: input.severity ?? "FATAL",
    impact_code: state === "CLEARED" ? "IMPACT_CLEARED" : "IMPACT_HATCHET_DOWN",
    first_failed_probe_at: "2026-09-03T07:00:00.000Z",
    detected_at: `2026-09-03T07:00:${String(input.seq).padStart(2, "0")}.000Z`,
    evidence: state === "CLEARED" ? {
      probe: "http_get", target: "http://127.0.0.1:8888/api/live",
      consecutive_failures: 0, threshold: 2, last_status: 200,
      container_status: "running", restart_policy: "no", exit_code: 0
    } : {
      probe: "http_get", target: "http://127.0.0.1:8888/api/live",
      consecutive_failures: 2, threshold: 2, last_status: 0,
      container_status: "exited", restart_policy: "no", exit_code: 0
    },
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: 1,
    clears_signal_id: input.clears ?? null,
    recorded_at: `2026-09-03T07:00:${String(input.seq).padStart(2, "0")}.000Z`
  };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  stateDir = await mkdtemp(join(tmpdir(), "obs-01-delivery-"));
}, 120_000);

afterAll(async () => {
  await database.stop();
  await rm(stateDir, { recursive: true, force: true });
});

describe("OBS-01 journal mirror and osascript delivery", () => {
  it("mirrors signal rows idempotently after the journal line", async () => {
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
    );
    const { PostgresMirror } = await import(
      "../../apps/observation-agent/src/store/postgres.js"
    );
    const { persistSignal } = await import(
      "../../apps/observation-agent/src/store/pipeline.js"
    );
    const journal = new ObservationJournal(stateDir);
    const mirror = new PostgresMirror(database.pool);
    const open = signal({ seq: 1, id: "10000000-0000-4000-8000-000000000001" });
    await expect(persistSignal({ signal: open, journal, mirror })).resolves.toEqual({ mirrored: true });
    await expect(persistSignal({ signal: open, journal, mirror })).resolves.toEqual({ mirrored: true });
    expect((await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM observation.signal WHERE signal_id=$1",
      [open.signal_id]
    )).rows[0]?.count).toBe("1");
  });

  it("catches up a journaled signal after Postgres returns", async () => {
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
    );
    const { PostgresMirror } = await import(
      "../../apps/observation-agent/src/store/postgres.js"
    );
    const { persistSignal } = await import(
      "../../apps/observation-agent/src/store/pipeline.js"
    );
    const catchUpDir = await mkdtemp(join(tmpdir(), "obs-01-catchup-"));
    try {
      const pending = signal({ seq: 40, id: "10000000-0000-4000-8000-000000000040" });
      const journal = new ObservationJournal(catchUpDir);
      await persistSignal({
        signal: pending,
        journal,
        mirror: { async mirrorSignal() { throw new Error("postgres down"); } }
      });
      const attempt = {
        kind: "ATTEMPT" as const,
        delivery_id: "40000000-0000-4000-8000-000000000040",
        signal_id: pending.signal_id as string,
        channel: "osascript" as const,
        attempted_at: "2026-09-03T07:00:41.000Z"
      };
      await journal.appendDeliveryAttempt(attempt);
      await journal.appendDeliveryResult({
        kind: "RESULT",
        delivery: {
          delivery_id: attempt.delivery_id,
          signal_id: attempt.signal_id,
          channel: attempt.channel,
          attempted_at: attempt.attempted_at,
          delivered_at: "2026-09-03T07:00:41.100Z",
          outcome: "DELIVERED",
          external_ref: null
        }
      });
      const mirror = new PostgresMirror(database.pool);
      await expect(mirror.catchUp(catchUpDir)).resolves.toEqual({ signals: 1, deliveries: 1 });
      expect((await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM observation.signal WHERE signal_id=$1",
        [pending.signal_id]
      )).rows[0]?.count).toBe("1");
      expect((await database.pool.query<{ outcome: string }>(
        "SELECT outcome FROM observation.delivery WHERE delivery_id=$1",
        [attempt.delivery_id]
      )).rows[0]?.outcome).toBe("DELIVERED");
    } finally {
      await rm(catchUpDir, { recursive: true, force: true });
    }
  });

  it("delivers fixed osascript copy, rate-limits repeats, and journals every outcome", async () => {
    const invocations: Array<readonly string[]> = [];
    const mirrorOutcomes: string[] = [];
    let failExecution = false;
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
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
    const journal = new ObservationJournal(stateDir);
    const delivery = new DeliveryCoordinator({
      journal,
      mirror: {
        async mirrorDelivery(delivery) {
          const lines = (await readFile(
            join(stateDir, "journal", "deliveries-2026-09-03.jsonl"), "utf8"
          )).trim().split("\n").map((line) => JSON.parse(line));
          expect(lines.at(-1)).toEqual({ kind: "RESULT", delivery });
          mirrorOutcomes.push(delivery.outcome);
        }
      }
    });
    const osascript = createOsaScriptDeliveryExecutor(async (file, args) => {
        expect(file).toBe("/usr/bin/osascript");
        const lines = (await readFile(
          join(stateDir, "journal", "deliveries-2026-09-03.jsonl"), "utf8"
        )).trim().split("\n").map((line) => JSON.parse(line));
        expect(lines.at(-1)).toMatchObject({
          kind: "ATTEMPT",
          signal_id: "10000000-0000-4000-8000-000000000001",
          channel: "osascript"
        });
        expect(lines.at(-1)).not.toHaveProperty("outcome");
        invocations.push(args);
        if (failExecution) throw new Error("notification rejected");
    });
    const router = createLegacyOsaScriptRouter({ delivery, osascript });
    const open = signal({ seq: 1, id: "10000000-0000-4000-8000-000000000001" });
    await router.onSignal({ signal: open as never,
      now: new Date("2026-09-03T07:00:06.000Z"),
      mute: null,
      module: EMPTY_ROUTER_MODULE,
      policy: { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 }
    });
    expect(mirrorOutcomes).toEqual(["DELIVERED"]);
    expect(invocations).toEqual([[
      "-e",
      "display notification \"Hatchet is down: asks are accepted but no debate work is dispatched or run.\" with title \"dialectical-engine: hatchet FATAL\" subtitle \"INFRA_DOWN\""
    ]]);

    await router.onSignal({ signal: open as never,
      now: new Date("2026-09-03T07:01:00.000Z"),
      mute: null,
      module: EMPTY_ROUTER_MODULE,
      policy: { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 }
    });
    expect(mirrorOutcomes).toEqual(["DELIVERED", "RATE_LIMITED"]);
    expect(invocations).toHaveLength(1);
    failExecution = true;
    await router.onSignal({ signal: open as never,
      now: new Date("2026-09-03T07:11:00.000Z"),
      mute: null,
      module: EMPTY_ROUTER_MODULE,
      policy: { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 }
    });
    expect(mirrorOutcomes).toEqual(["DELIVERED", "RATE_LIMITED", "FAILED"]);
    expect(invocations).toHaveLength(2);
    const journalSource = await readFile(
      join(stateDir, "journal", "deliveries-2026-09-03.jsonl"), "utf8"
    );
    const envelopes = journalSource.trim().split("\n").map((line) => JSON.parse(line));
    expect(envelopes.map((envelope) => envelope.kind)).toEqual([
      "ATTEMPT", "RESULT", "ATTEMPT", "RESULT", "ATTEMPT", "RESULT"
    ]);
    expect(envelopes.filter((envelope) => envelope.kind === "RESULT")
      .map((envelope) => envelope.delivery.outcome))
      .toEqual(["DELIVERED", "RATE_LIMITED", "FAILED"]);
    expect(mirrorOutcomes).toEqual(["DELIVERED", "RATE_LIMITED", "FAILED"]);
  });

  it("records MUTED without executing and lets CLEARED bypass mute/rate limits", async () => {
    let invocationCount = 0;
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
    );
    const { PostgresMirror } = await import(
      "../../apps/observation-agent/src/store/postgres.js"
    );
    const { persistSignal } = await import(
      "../../apps/observation-agent/src/store/pipeline.js"
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
    const journal = new ObservationJournal(stateDir);
    const mirror = new PostgresMirror(database.pool);
    const severe = signal({
      seq: 2, id: "10000000-0000-4000-8000-000000000002", severity: "SEVERE"
    });
    await persistSignal({ signal: severe, journal, mirror });
    const router = createLegacyOsaScriptRouter({
      delivery: new DeliveryCoordinator({ journal, mirror }),
      osascript: createOsaScriptDeliveryExecutor(async () => { invocationCount += 1; })
    });
    await router.onSignal({ signal: severe as never,
      now: new Date("2026-09-03T07:02:00.000Z"), mute: {},
      module: EMPTY_ROUTER_MODULE,
      policy: { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 }
    });
    expect(invocationCount).toBe(0);

    const cleared = signal({
      seq: 3,
      id: "10000000-0000-4000-8000-000000000003",
      state: "CLEARED",
      clears: severe.signal_id as string,
      severity: "SEVERE"
    });
    await persistSignal({ signal: cleared, journal, mirror });
    await router.onSignal({ signal: cleared as never,
      now: new Date("2026-09-03T07:02:01.000Z"), mute: {},
      module: EMPTY_ROUTER_MODULE,
      policy: { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 }
    });
    expect(invocationCount).toBe(1);
  });

  it("runs every hook of a discovered module and durably correlates its intents", async () => {
    const moduleRoot = await mkdtemp(join(tmpdir(), "obs-01-module-runtime-"));
    const moduleStateDir = await mkdtemp(join(tmpdir(), "obs-01-module-state-"));
    try {
      const syntheticRoot = join(moduleRoot, "synthetic");
      await mkdir(syntheticRoot);
      await writeFile(join(syntheticRoot, "module.ts"), `
        import { readFile } from "node:fs/promises";
        let cycle = 0;
        let firstFailedAt;
        export default {
          name: "routing",
          cadence: { intervalMs: 5000, timeoutMs: 2000 },
          targetFragmentBasename: "OBS-07.json",
          router: {
            create(input) {
              globalThis.__obsRouterCreateInput = input;
              globalThis.__obsRouterEvents.push("create");
              return {
                async onSignal({ signal, module }) {
                  const rows = (await readFile(
                    input.stateDir + "/journal/signals-" + signal.detected_at.slice(0, 10) + ".jsonl",
                    "utf8"
                  )).trim().split("\\n").map((line) => JSON.parse(line));
                  globalThis.__obsRouterEvents.push("signal:" + signal.class);
                  globalThis.__obsPersistedRouterSignals.push({
                    signalId: signal.signal_id,
                    durableSignalId: rows.at(-1).signal_id,
                    thresholdVersion: module.thresholdVersion,
                    thresholds: module.thresholds
                  });
                },
                async onTick({ module }) {
                  globalThis.__obsRouterEvents.push("tick");
                  globalThis.__obsRouterTicks.push(module);
                },
                status() { return []; }
              };
            }
          },
          async probe() { cycle += 1; return []; },
          samples(_observations, ctx) {
            return [{ metricKey: "synthetic.health", value: cycle, observedAt: ctx.now }];
          },
          signals(_observations, ctx) {
            firstFailedAt ??= ctx.now;
            const cleared = cycle >= 3;
            return [{
              correlationKey: "health",
              component: "hatchet",
              class: "INFRA_DOWN",
              state: cleared ? "CLEARED" : "OPEN",
              severity: "SEVERE",
              impactCode: cleared ? "IMPACT_CLEARED" : "IMPACT_HATCHET_DOWN",
              firstFailedProbeAt: firstFailedAt,
              detectedAt: ctx.now,
              evidence: cleared
                ? { probe: "http_get", consecutive_failures: 0, threshold: 2,
                    last_status: "READY", duration_seconds: 10 }
                : { probe: "http_get", consecutive_failures: 2, threshold: 2,
                    last_status: "FAILED" },
              suspectedDefect: false,
              defectKind: null,
              runRef: null,
              workItemRef: null
            }];
          }
        };
      `, "utf8");
      const { createOwnedSignalRouter, discoverObservationModules } = await import(
        "../../apps/observation-agent/src/core/modules.js"
      );
      const { ObservationModuleRuntime } = await import(
        "../../apps/observation-agent/src/core/runtime.js"
      );
      const { ObservationJournal } = await import(
        "../../apps/observation-agent/src/journal/journal.js"
      );
      const { DeliveryCoordinator } = await import(
        "../../apps/observation-agent/src/notify/delivery.js"
      );
      const { createOsaScriptDeliveryExecutor } = await import(
        "../../apps/observation-agent/src/notify/osascript.js"
      );
      const { persistSignal } = await import(
        "../../apps/observation-agent/src/store/pipeline.js"
      );
      const { PostgresMirror } = await import(
        "../../apps/observation-agent/src/store/postgres.js"
      );
      const { SampleRingStore } = await import(
        "../../apps/observation-agent/src/store/samples.js"
      );
      const catalog = await discoverObservationModules(moduleRoot);
      expect(catalog.modules.map((module) => module.name)).toEqual(["routing"]);
      const journal = new ObservationJournal(moduleStateDir);
      const mirror = new PostgresMirror(database.pool);
      let notifications = 0;
      (globalThis as typeof globalThis & {
        __obsPersistedRouterSignals: Array<{
          signalId: string; durableSignalId: string; thresholdVersion: number;
          thresholds: Readonly<Record<string, unknown>>;
        }>;
      }).__obsPersistedRouterSignals = [];
      (globalThis as typeof globalThis & { __obsRouterEvents: string[] }).__obsRouterEvents = [];
      (globalThis as typeof globalThis & {
        __obsRouterTicks: Array<Readonly<Record<string, unknown>>>;
      }).__obsRouterTicks = [];
      const targetFragment = Object.freeze({
        basename: "OBS-07.json",
        targets: Object.freeze([]),
        configuration: Object.freeze({ notify: Object.freeze({ board: "ops-alerts" }) })
      });
      const initialThresholds = Object.freeze({ storm_count: 5, storm_window_seconds: 60 });
      const router = await createOwnedSignalRouter(catalog.routerContribution!, {
        stateDir: moduleStateDir,
        delivery: new DeliveryCoordinator({ journal, mirror }),
        osascript: createOsaScriptDeliveryExecutor(async () => { notifications += 1; }),
        moduleName: "routing",
        targetFragment,
        configuration: targetFragment.configuration,
        thresholds: initialThresholds,
        thresholdVersion: 7
      });
      const createInput = (globalThis as typeof globalThis & {
        __obsRouterCreateInput: Readonly<Record<string, unknown>>;
      }).__obsRouterCreateInput;
      expect(createInput).toMatchObject({
        moduleName: "routing", targetFragment,
        configuration: { notify: { board: "ops-alerts" } },
        thresholds: { storm_count: 5, storm_window_seconds: 60 }, thresholdVersion: 7
      });
      expect(Object.isFrozen(createInput)).toBe(true);
      expect(Object.isFrozen(createInput.configuration)).toBe(true);
      expect(Object.isFrozen(createInput.thresholds)).toBe(true);
      const ids = [
        "50000000-0000-4000-8000-000000000001",
        "50000000-0000-4000-8000-000000000002"
      ];
      let sequence = 500;
      let currentModule: RouterCurrentContext = Object.freeze({
        thresholdVersion: 7, thresholds: initialThresholds
      });
      const routingPolicy = Object.freeze({
        rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000
      });
      const route = async (
        emitted: Parameters<typeof router.onSignal>[0]["signal"],
        now: Date
      ) => {
        await persistSignal({ signal: emitted, journal, mirror });
        await router.onSignal({ signal: emitted, now, policy: routingPolicy, mute: null,
          module: currentModule });
      };
      const { makeSelfSignal } = await import(
        "../../apps/observation-agent/src/modules/self/signals.js"
      );
      const startAt = new Date("2026-09-03T07:19:55.000Z");
      await route(makeSelfSignal({
        seq: 500, signalId: "50000000-0000-4000-8000-000000000000",
        now: startAt, thresholdVersion: 7, event: "START"
      }), startAt);
      expect((globalThis as typeof globalThis & { __obsRouterEvents: string[] })
        .__obsRouterEvents.slice(0, 2)).toEqual(["create", "signal:AGENT_SELF"]);
      const runtime = new ObservationModuleRuntime({
        nextSequence: () => { sequence += 1; return sequence; },
        nextSignalId: () => ids.shift() ?? "50000000-0000-4000-8000-000000000099",
        sampleStore: new SampleRingStore(database.pool),
        emitSignal: route
      });
      for (const second of [0, 5, 10]) {
        await runtime.run({
          modules: catalog.modules,
          now: new Date(`2026-09-03T07:20:${String(second).padStart(2, "0")}.000Z`),
          timeoutMs: 2_000,
          databaseUrl: database.connectionString,
          stateDir: moduleStateDir,
          targets: [],
          moduleThresholds: { routing: currentModule.thresholds },
          thresholdVersion: currentModule.thresholdVersion
        });
        if (second === 0) {
          currentModule = Object.freeze({
            thresholdVersion: 8,
            thresholds: Object.freeze({ storm_count: 6, storm_window_seconds: 90 })
          });
        }
      }
      await router.onTick({
        now: new Date("2026-09-03T07:20:11.000Z"), policy: routingPolicy, mute: null,
        module: currentModule
      });
      expect((await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM observation.sample_ring WHERE metric_key='synthetic.health'"
      )).rows[0]?.count).toBe("3");
      const durableSignals = (await readFile(
        join(moduleStateDir, "journal", "signals-2026-09-03.jsonl"), "utf8"
      )).trim().split("\n").map((line) => JSON.parse(line));
      const moduleSignals = durableSignals.filter((row) => row.class !== "AGENT_SELF");
      expect(moduleSignals.map((row) => [row.state, row.signal_id, row.clears_signal_id]))
        .toEqual([
          ["OPEN", "50000000-0000-4000-8000-000000000001", null],
          ["CLEARED", "50000000-0000-4000-8000-000000000002",
            "50000000-0000-4000-8000-000000000001"]
        ]);
      expect((globalThis as typeof globalThis & {
        __obsPersistedRouterSignals: Array<{
          signalId: string; durableSignalId: string; thresholdVersion: number;
          thresholds: Readonly<Record<string, unknown>>;
        }>;
      }).__obsPersistedRouterSignals.map(({ signalId, durableSignalId }) => ({
        signalId, durableSignalId
      }))).toEqual(durableSignals.map((row) => ({ signalId: row.signal_id,
        durableSignalId: row.signal_id })));
      const routedContexts = (globalThis as typeof globalThis & {
        __obsPersistedRouterSignals: Array<{
          thresholdVersion: number; thresholds: Readonly<Record<string, unknown>>;
        }>;
      }).__obsPersistedRouterSignals;
      expect(routedContexts.map(({ thresholdVersion }) => thresholdVersion)).toEqual([7, 7, 8]);
      expect(routedContexts.at(-1)?.thresholds).toEqual({ storm_count: 6, storm_window_seconds: 90 });
      expect((globalThis as typeof globalThis & {
        __obsRouterTicks: Array<Readonly<Record<string, unknown>>>;
      }).__obsRouterTicks).toEqual([currentModule]);
      expect(notifications).toBe(0);
      expect((await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM observation.delivery WHERE signal_id = ANY($1::uuid[])",
        [durableSignals.map((row) => row.signal_id)]
      )).rows[0]?.count).toBe("0");
    } finally {
      await rm(moduleRoot, { recursive: true, force: true });
      await rm(moduleStateDir, { recursive: true, force: true });
    }
  });
});
