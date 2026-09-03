import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let stateDir: string;

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
    const { OsaScriptNotifier } = await import(
      "../../apps/observation-agent/src/notify/osascript.js"
    );
    const journal = new ObservationJournal(stateDir);
    const notifier = new OsaScriptNotifier({
      journal,
      mirror: {
        async mirrorDelivery(delivery) {
          const lines = (await readFile(
            join(stateDir, "journal", "deliveries-2026-09-03.jsonl"), "utf8"
          )).trim().split("\n").map((line) => JSON.parse(line));
          expect(lines.at(-1)).toEqual({ kind: "RESULT", delivery });
          mirrorOutcomes.push(delivery.outcome);
        }
      },
      execute: async (file, args) => {
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
      }
    });
    const open = signal({ seq: 1, id: "10000000-0000-4000-8000-000000000001" });
    await expect(notifier.deliver(open, {
      now: new Date("2026-09-03T07:00:06.000Z"),
      muted: false,
      rateLimitMs: 600_000,
      timeoutMs: 2_000
    })).resolves.toMatchObject({ outcome: "DELIVERED" });
    expect(invocations).toEqual([[
      "-e",
      "display notification \"Hatchet is down: asks are accepted but no debate work is dispatched or run.\" with title \"dialectical-engine: hatchet FATAL\" subtitle \"INFRA_DOWN\""
    ]]);

    await expect(notifier.deliver(open, {
      now: new Date("2026-09-03T07:01:00.000Z"),
      muted: false,
      rateLimitMs: 600_000,
      timeoutMs: 2_000
    })).resolves.toMatchObject({ outcome: "RATE_LIMITED" });
    expect(invocations).toHaveLength(1);
    failExecution = true;
    await expect(notifier.deliver(open, {
      now: new Date("2026-09-03T07:11:00.000Z"),
      muted: false,
      rateLimitMs: 600_000,
      timeoutMs: 2_000
    })).resolves.toMatchObject({ outcome: "FAILED", delivered_at: null });
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
    const { OsaScriptNotifier } = await import(
      "../../apps/observation-agent/src/notify/osascript.js"
    );
    const journal = new ObservationJournal(stateDir);
    const mirror = new PostgresMirror(database.pool);
    const severe = signal({
      seq: 2, id: "10000000-0000-4000-8000-000000000002", severity: "SEVERE"
    });
    await persistSignal({ signal: severe, journal, mirror });
    const notifier = new OsaScriptNotifier({
      journal,
      mirror,
      execute: async () => { invocationCount += 1; }
    });
    await expect(notifier.deliver(severe, {
      now: new Date("2026-09-03T07:02:00.000Z"), muted: true,
      rateLimitMs: 600_000, timeoutMs: 2_000
    })).resolves.toMatchObject({ outcome: "MUTED" });
    expect(invocationCount).toBe(0);

    const cleared = signal({
      seq: 3,
      id: "10000000-0000-4000-8000-000000000003",
      state: "CLEARED",
      clears: severe.signal_id as string,
      severity: "SEVERE"
    });
    await persistSignal({ signal: cleared, journal, mirror });
    await expect(notifier.deliver(cleared, {
      now: new Date("2026-09-03T07:02:01.000Z"), muted: true,
      rateLimitMs: 600_000, timeoutMs: 2_000
    })).resolves.toMatchObject({ outcome: "DELIVERED" });
    expect(invocationCount).toBe(1);
  });

  it("runs every hook of a discovered module and durably correlates its intents", async () => {
    const moduleRoot = await mkdtemp(join(tmpdir(), "obs-01-module-runtime-"));
    const moduleStateDir = await mkdtemp(join(tmpdir(), "obs-01-module-state-"));
    try {
      const syntheticRoot = join(moduleRoot, "synthetic");
      await mkdir(syntheticRoot);
      await writeFile(join(syntheticRoot, "module.ts"), `
        let cycle = 0;
        let firstFailedAt;
        export default {
          name: "synthetic",
          cadence: { intervalMs: 5000, timeoutMs: 2000 },
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
      const { discoverObservationModules } = await import(
        "../../apps/observation-agent/src/core/modules.js"
      );
      const { ObservationModuleRuntime } = await import(
        "../../apps/observation-agent/src/core/runtime.js"
      );
      const { ObservationJournal } = await import(
        "../../apps/observation-agent/src/journal/journal.js"
      );
      const { OsaScriptNotifier } = await import(
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
      expect(catalog.modules.map((module) => module.name)).toEqual(["synthetic"]);
      const journal = new ObservationJournal(moduleStateDir);
      const mirror = new PostgresMirror(database.pool);
      let notifications = 0;
      const notifier = new OsaScriptNotifier({
        journal,
        mirror,
        execute: async () => { notifications += 1; }
      });
      const ids = [
        "50000000-0000-4000-8000-000000000001",
        "50000000-0000-4000-8000-000000000002"
      ];
      let sequence = 500;
      const runtime = new ObservationModuleRuntime({
        nextSequence: () => { sequence += 1; return sequence; },
        nextSignalId: () => ids.shift() ?? "50000000-0000-4000-8000-000000000099",
        sampleStore: new SampleRingStore(database.pool),
        emitSignal: async (emitted, now) => {
          await persistSignal({ signal: emitted, journal, mirror });
          await notifier.deliver(emitted, {
            now, muted: false, rateLimitMs: 600_000, timeoutMs: 2_000
          });
        }
      });
      for (const second of [0, 5, 10]) {
        await runtime.run({
          modules: catalog.modules,
          now: new Date(`2026-09-03T07:20:${String(second).padStart(2, "0")}.000Z`),
          timeoutMs: 2_000,
          databaseUrl: database.connectionString,
          stateDir: moduleStateDir,
          targets: [],
          thresholdVersion: 1
        });
      }
      expect((await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM observation.sample_ring WHERE metric_key='synthetic.health'"
      )).rows[0]?.count).toBe("3");
      const durableSignals = (await readFile(
        join(moduleStateDir, "journal", "signals-2026-09-03.jsonl"), "utf8"
      )).trim().split("\n").map((line) => JSON.parse(line));
      expect(durableSignals.map((row) => [row.state, row.signal_id, row.clears_signal_id]))
        .toEqual([
          ["OPEN", "50000000-0000-4000-8000-000000000001", null],
          ["CLEARED", "50000000-0000-4000-8000-000000000002",
            "50000000-0000-4000-8000-000000000001"]
        ]);
      expect(notifications).toBe(2);
      expect((await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM observation.delivery WHERE signal_id = ANY($1::uuid[])",
        [durableSignals.map((row) => row.signal_id)]
      )).rows[0]?.count).toBe("2");
    } finally {
      await rm(moduleRoot, { recursive: true, force: true });
      await rm(moduleStateDir, { recursive: true, force: true });
    }
  });
});
