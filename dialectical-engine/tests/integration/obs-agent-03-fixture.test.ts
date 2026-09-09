import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ObservationQueryClient } from "../../apps/observation-agent/src/core/database.js";

const fixturePath = "tests/acceptance/obs-agent-03-fixture.ts";
const clockRows = new Map<string, {
  metric_key: string;
  bucket: number;
  observed_at: Date;
  value: string;
}>();
const database = Object.freeze({
  async withClient<T>(operation: (client: ObservationQueryClient) => Promise<T>): Promise<T> {
    const query = (async (text: string, values?: readonly unknown[]) => {
      if (text.includes("SELECT metric_key,bucket,observed_at,value::text AS value")) {
        return { rows: [...clockRows.values()] };
      }
      if (text.includes("INSERT INTO observation.sample_ring")) {
        const metricKey = /SELECT '([^']+)'/u.exec(text)?.[1];
        if (metricKey === undefined) throw new Error("TEST_CLOCK_KEY_MISSING");
        const [buckets, times, encoded] = values as [number[], Date[], string[]];
        for (let index = 0; index < buckets.length; index += 1) {
          const bucket = buckets[index]!;
          clockRows.set(`${metricKey}:${bucket}`, {
            metric_key: metricKey,
            bucket,
            observed_at: times[index]!,
            value: encoded[index]!
          });
        }
      }
      return { rows: [] };
    }) as ObservationQueryClient["query"];
    return operation(Object.freeze({ query }));
  }
});

async function fixtureModule() {
  if (!existsSync(fixturePath)) return null;
  return import("../acceptance/obs-agent-03-fixture.js");
}

describe("OBS-03 stimulus-only acceptance fixture", () => {
  it("derives a unique isolated database and shell-quoted V environment", async () => {
    const fixture = await fixtureModule();
    expect(fixture).not.toBeNull();
    const planned = fixture!.planAcceptanceFixture({
      mode: "open-defects",
      adminDatabaseUrl: "postgresql://admin:secret@127.0.0.1:55432/postgres",
      nonce: "abc123",
      stateDir: "/tmp/obs-03-state",
      targetsPath: resolve("deploy/observation-agent/targets.dev.d"),
      firstSeq: 9001,
      day: "2026-09-03"
    });
    expect(planned.databaseName).toBe("debateai_obs03_abc123");
    expect(new URL(planned.databaseUrl).pathname).toBe("/debateai_obs03_abc123");
    expect(planned.stateDir).toBe("/tmp/obs-03-state");
    expect(planned.targetsPath).toBe(resolve("deploy/observation-agent/targets.dev.d"));
    expect(planned.firstSeq).toBe(9001);
    expect(planned.environmentFile).toContain("export OBS_ACCEPTANCE_DATABASE='debateai_obs03_abc123'");
    expect(planned.environmentFile).toContain("export OBS_ACCEPTANCE_FIRST_SEQ='9001'");
    expect(planned.environmentFile).toContain("export OBS_ACCEPTANCE_DAY='2026-09-03'");
    expect(planned.environmentFile).not.toContain("/debateai'");
  });

  it("rejects the product database as the admin or isolated target", async () => {
    const fixture = await fixtureModule();
    expect(fixture).not.toBeNull();
    expect(() => fixture!.planAcceptanceFixture({
      mode: "query-budget",
      adminDatabaseUrl: "postgresql://admin:secret@127.0.0.1:55432/debateai",
      nonce: "abc123",
      stateDir: "/tmp/obs-03-state",
      targetsPath: "/tmp/targets",
      firstSeq: 1,
      day: "2026-09-03"
    })).toThrow("OBS_ACCEPTANCE_ADMIN_DATABASE_MUST_BE_POSTGRES");
  });

  it("defines only the three stimulus modes and never accepts an observation assertion mode", async () => {
    const fixture = await fixtureModule();
    expect(fixture).not.toBeNull();
    expect(fixture!.OBS_03_FIXTURE_MODES).toEqual([
      "open-defects", "recover-defects", "query-budget"
    ]);
    expect(fixture!.parseFixtureArguments(["assert-signals", "--env-file", "/tmp/out.env"]))
      .toEqual({ ok: false, code: "OBS_ACCEPTANCE_ARGUMENTS_INVALID" });
  });

  it("runs heartbeat and all four detector inputs through the discovered module with deterministic dependencies", async () => {
    const fixture = await fixtureModule();
    expect(fixture).not.toBeNull();
    const module = await import(
      "../../apps/observation-agent/src/modules/stall-detectors/module.js"
    ).catch(() => null);
    expect(module).not.toBeNull();
    const runRef = "36000000-0000-4000-8000-000000000001";
    const workItemRef = "36000000-0000-4000-8000-000000000002";
    const origin = new Date("2026-09-03T08:00:00.000Z");
    let cycle = 0;
    let primed = false;
    let armed = false;
    const manifest = module!.createStallDetectorsModule({
      tokenPath: () => "/fake/token",
      readHeartbeat: async (input: { now: Date }) => ({
        state: "FRESH" as const,
        workerRef: "debateai-dev-runner",
        heartbeatAgeSeconds: 1,
        heartbeatThresholdSeconds: 30,
        lastHeartbeatAt: new Date(input.now.getTime() - 1_000),
        observedAt: input.now,
        evidence: { health: "FRESH" as const }
      }),
      readDefectInputs: async () => {
        cycle += 1;
        return {
          stallRows: armed ? [{ workItemId: workItemRef, runId: runRef,
            state: "CLAIMED" as const,
            claimDeadline: new Date(origin.getTime() + 284_000) }] : [],
          readyRows: primed
            ? [{ workItemId: workItemRef, runId: runRef, state: "READY" as const }]
            : [],
          progressRows: [{ runId: runRef, latestProgressSeq: 1 }],
          suspiciousRows: armed
            ? [{ workItemId: workItemRef, runId: runRef, state: "DONE" as const,
                settledArtifactPresent: false as const }]
            : []
        };
      }
    });
    const context = (now: Date) => ({
      now, timeoutMs: 2_000, database,
      stateDir: "/tmp/state", targets: [], targetFragment: null, configuration: {},
      thresholds: {
        claim_grace_s: 15, ready_age_s: 120, no_progress_s: 300,
        heartbeat_age_s: 30, worker_ref: "debateai-dev-runner",
        worker_list_url: "http://127.0.0.1:8888/api/v1/tenants/main/worker"
      }
    });
    const result = await fixture!.runOpenDetectorTimeline({
      manifest,
      origin,
      contextAt: context,
      prime: async () => { primed = true; },
      armFinal: async () => { armed = true; }
    });
    expect(cycle).toBe(3);
    expect(result.intents
      .map((intent: { class: string; state: string }) => `${intent.class}:${intent.state}`))
      .toEqual([
        "STALL:OPEN", "QUEUE_NOT_DRAINING:OPEN", "NO_PROGRESS:OPEN",
        "SUSPICIOUS_SUCCESS:OPEN"
      ]);
    expect(result.observations.flatMap((observation: { status?: readonly { key: string }[] }) =>
      observation.status ?? []).map((projection: { key: string }) => projection.key))
      .toEqual(expect.arrayContaining([
        "runner.heartbeat", "runner.heartbeat_age", "runner.oldest_ready",
        "runner.stalled_items", "runner.no_progress_runs", "runner.suspicious_success"
      ]));
  });
});
