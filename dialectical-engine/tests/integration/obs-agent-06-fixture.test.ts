import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverObservationModules } from "../../apps/observation-agent/src/core/modules.js";
import { loadObservationTargetCatalog } from "../../apps/observation-agent/src/core/targets.js";
import { loadMergedThresholdPolicy } from "../../apps/observation-agent/src/oactl/core/thresholds.js";
import { migrate } from "../../packages/db/src/index.js";
import { startTestDatabase } from "../support/testDatabase.js";

const fixturePath = "tests/acceptance/obs-agent-06-fixture.ts";

describe("OBS-06 stimulus-only fixture and projections", () => {
  it("plans a unique isolated database and never accepts an output-assertion mode", async () => {
    expect(existsSync(fixturePath)).toBe(true);
    const fixture = await import("../acceptance/obs-agent-06-fixture.js");
    const planned = fixture.planAcceptanceFixture({
      mode: "query-budget", adminDatabaseUrl: "postgresql://admin:secret@127.0.0.1:55432/postgres",
      nonce: "abc123", stateDir: "/tmp/obs-06-state",
      targetsPath: resolve("deploy/observation-agent/targets.dev.d"), firstSeq: 9001,
      day: "2026-09-04"
    });
    expect(planned.databaseName).toBe("debateai_obs06_abc123");
    expect(new URL(planned.databaseUrl).pathname).toBe("/debateai_obs06_abc123");
    expect(planned.environmentFile).toContain("export OBS_ACCEPTANCE_DATABASE='debateai_obs06_abc123'");
    expect(fixture.OBS_06_FIXTURE_MODES).toEqual(["open-anomalies", "query-budget"]);
    expect(fixture.parseFixtureArguments(["assert-signals", "--env-file", "/tmp/out.env"]))
      .toEqual({ ok: false, code: "OBS_ACCEPTANCE_ARGUMENTS_INVALID" });
    expect(() => fixture.planAcceptanceFixture({
      mode: "query-budget", adminDatabaseUrl: "postgresql://admin@127.0.0.1/debateai",
      nonce: "abc123", stateDir: "/tmp/state", targetsPath: "/tmp/targets", firstSeq: 1,
      day: "2026-09-04"
    })).toThrow("OBS_ACCEPTANCE_ADMIN_DATABASE_MUST_BE_POSTGRES");
  });

  it("discovers all three OBS-06 modules, target and exact defaults", async () => {
    const catalog = await discoverObservationModules(resolve("apps/observation-agent/src/modules"));
    expect(catalog.modules.map(({ name }) => name)).toEqual(expect.arrayContaining([
      "throughput", "provider-health", "hatchet-throughput"
    ]));
    const targets = await loadObservationTargetCatalog(resolve("deploy/observation-agent/targets.dev.d"));
    expect(targets.fragments.find(({ basename }) => basename === "OBS-06.json"))
      .toMatchObject({ basename: "OBS-06.json", targets: [expect.objectContaining({
        component: "hatchet", kind: "hatchet_metrics"
      })] });
    const policy = await loadMergedThresholdPolicy({
      defaultsDirectory: resolve("deploy/observation-agent/thresholds/defaults")
    });
    expect(policy.routing).toMatchObject({ THROUGHPUT_ANOMALY: "SEVERE", PROVIDER_DEGRADED: "SEVERE" });
    expect(policy.modules?.throughput).toMatchObject({ sample_interval_ms: 30_000,
      window_minutes: 5, run_failure_window_minutes: 60, run_failure_minimum: 4,
      run_failure_ratio: 0.5 });
    expect(policy.modules?.["provider-health"]).toMatchObject({ window_minutes: 5,
      minimum_calls: 10, failure_ratio: 0.5 });
    expect(policy.modules?.["hatchet-throughput"]).toMatchObject({ queue_depth: 10,
      queue_sustained_s: 300, dispatch_p95_s: 30, failed_tasks: 3,
      failed_window_minutes: 15 });
  });

  it("runs the real open-anomaly detector cycle and persists its outputs", async () => {
    const fixture = await import("../acceptance/obs-agent-06-fixture.js");
    const runFixture = Reflect.get(fixture, "runOpenAnomalyFixture") as unknown;
    if (typeof runFixture !== "function") {
      expect(runFixture).toBeTypeOf("function");
      return;
    }
    const database = await startTestDatabase();
    const stateDir = await mkdtemp(join(tmpdir(), "obs-06-open-fixture-"));
    const now = new Date("2026-09-04T11:00:00.000Z");
    try {
      await migrate(database.pool);
      await runFixture({
        pool: database.pool, stateDir,
        firstSeq: 60_600, now
      });
      const signals = await database.pool.query<{
        impact_code: string; severity: string; suspected_defect: boolean;
      }>(`
        SELECT impact_code,severity,suspected_defect
        FROM observation.open_signal_v
        WHERE impact_code IN ('IMPACT_RUN_FAILURE','IMPACT_HATCHET_DISPATCH_SLOW')
        ORDER BY impact_code
      `);
      expect(signals.rows).toEqual([
        { impact_code: "IMPACT_HATCHET_DISPATCH_SLOW", severity: "DEGRADED", suspected_defect: false },
        { impact_code: "IMPACT_RUN_FAILURE", severity: "SEVERE", suspected_defect: false }
      ]);
      expect(await readFile(join(stateDir, "status.json"), "utf8"))
        .toContain('"template": "RATIO_WINDOW_STATE"');
      const digest = await readFile(join(stateDir, "digest", "2026-09-04.md"), "utf8");
      expect(digest).toContain("Hatchet dispatch p95 is 31 seconds over 5 minutes");
      expect(digest).toContain("3 of 4 terminal runs failed in the last 60 minutes");
    } finally {
      await database.stop();
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 120_000);
});
