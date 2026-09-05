import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverObservationModules } from "../../apps/observation-agent/src/core/modules.js";
import { loadObservationTargetCatalog } from "../../apps/observation-agent/src/core/targets.js";
import { loadMergedThresholdPolicy } from "../../apps/observation-agent/src/oactl/core/thresholds.js";

const fixturePath = "tests/acceptance/obs-agent-07-storm-fixture.ts";

describe("OBS-07 stimulus-only storm fixture", () => {
  it("discovers the owned modules, acknowledgement, target configuration, and exact defaults", async () => {
    const catalog = await discoverObservationModules(resolve("apps/observation-agent/src/modules"));
    expect(catalog.modules.map(({ name }) => name)).toEqual(expect.arrayContaining([
      "channels-sendmail", "channels-kanban", "routing", "status-page"
    ]));
    expect(catalog.verbs.map(({ verb }) => verb)).toContain("ack");
    expect(catalog.routerContribution).toMatchObject({
      moduleName: "routing", targetFragmentBasename: "OBS-07.json"
    });
    const targets = await loadObservationTargetCatalog(resolve("deploy/observation-agent/targets.dev.d"));
    expect(targets.fragments.find(({ basename }) => basename === "OBS-07.json"))
      .toMatchObject({ configuration: { notify: {
        sendmail_path: "deploy/dev-auth/sendmail-capture.mjs",
        dev_capture_dir: "dev-mail-capture",
        from: "observation-agent@localhost",
        to: "ops@localhost"
      } } });
    const policy = await loadMergedThresholdPolicy({
      defaultsDirectory: resolve("deploy/observation-agent/thresholds/defaults")
    });
    expect(policy.modules?.routing).toMatchObject({
      rate_limit_ms: 600_000, degraded_after_ms: 900_000,
      escalation_interval_ms: 1_800_000, fatal_resend_max: 3,
      storm_count: 5, storm_window_s: 60, board: "ops-alerts",
      routes: {
        FATAL: ["osascript", "sendmail", "kanban", "digest", "status"],
        SEVERE: ["osascript", "kanban", "digest", "status"],
        DEGRADED: ["digest", "status"], INFO: ["digest", "status"]
      }
    });
    expect(policy.modules?.["status-page"]).toEqual({ port: 9797 });
  });

  it("plans a unique database and supports only five/four/recovery stimulus modes", async () => {
    expect(existsSync(fixturePath)).toBe(true);
    const fixture = await import("../acceptance/obs-agent-07-storm-fixture.js");
    expect(fixture.OBS_07_FIXTURE_MODES).toEqual(["storm-five", "storm-four", "recover-five"]);
    const planned = fixture.planAcceptanceFixture({
      mode: "storm-five", adminDatabaseUrl: "postgresql://admin:test@127.0.0.1:55432/postgres",
      nonce: "abc123", stateDir: "/tmp/obs-07-state",
      targetsPath: resolve("deploy/observation-agent/targets.dev.d"), firstSeq: 70_700,
      day: "2026-09-05"
    });
    expect(planned.databaseName).toBe("debateai_obs07_abc123");
    expect(new URL(planned.databaseUrl).pathname).toBe("/debateai_obs07_abc123");
    expect(planned.environmentFile).toContain("export OBS_ACCEPTANCE_DATABASE='debateai_obs07_abc123'");
    expect(fixture.parseFixtureArguments(["assert-status", "--env-file", "/tmp/out.env"]))
      .toEqual({ ok: false, code: "OBS_ACCEPTANCE_ARGUMENTS_INVALID" });
    expect(() => fixture.planAcceptanceFixture({
      mode: "storm-four", adminDatabaseUrl: "postgresql://admin@127.0.0.1/debateai",
      nonce: "abc", stateDir: "/tmp/x", targetsPath: "/tmp/t", firstSeq: 1,
      day: "2026-09-05"
    })).toThrow("OBS_ACCEPTANCE_ADMIN_DATABASE_MUST_BE_POSTGRES");
  });

  it("constructs exactly the frozen typed offsets without observing outputs", async () => {
    const fixture = await import("../acceptance/obs-agent-07-storm-fixture.js");
    const signals = fixture.createStormInputs({
      count: 5, firstSeq: 70_800, firstDetectedAt: new Date("2026-09-05T13:00:00.000Z"),
      signalIds: [
        "70000000-0000-4000-8000-000000070801", "70000000-0000-4000-8000-000000070802",
        "70000000-0000-4000-8000-000000070803", "70000000-0000-4000-8000-000000070804",
        "70000000-0000-4000-8000-000000070805"
      ]
    });
    expect(signals.map(({ component }) => component)).toEqual([
      "ui", "api", "hatchet", "postgres", "tls_front_door"
    ]);
    expect(signals.map(({ detected_at }) => detected_at)).toEqual([
      "2026-09-05T13:00:00.000Z", "2026-09-05T13:00:10.000Z",
      "2026-09-05T13:00:20.000Z", "2026-09-05T13:00:30.000Z",
      "2026-09-05T13:00:40.000Z"
    ]);
  });
});
