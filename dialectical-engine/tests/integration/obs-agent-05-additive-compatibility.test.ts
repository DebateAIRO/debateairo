import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderImpact, signalSchema } from "../../apps/observation-agent/src/core/signals.js";
import { loadObservationTargetCatalog } from "../../apps/observation-agent/src/core/targets.js";
import { runOactl } from "../../apps/observation-agent/src/oactl/core/commands.js";
import { writeStatusSnapshot } from "../../apps/observation-agent/src/store/status.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("OBS-05 additive-slice compatibility", () => {
  it("loads the required certificate target beside OBS-02's TLS HTTP target", async () => {
    const directory = await mkdtemp(join(tmpdir(), "obs-05-targets-"));
    temporaryDirectories.push(directory);
    for (const basename of ["OBS-01.json", "OBS-02.json", "OBS-03.json", "OBS-04.json"]) {
      await cp(resolve("deploy/observation-agent/targets.dev.d", basename), join(directory, basename));
    }
    await writeFile(join(directory, "OBS-05.json"), `${JSON.stringify({
      schema_version: 1,
      targets: [{
        component: "tls_front_door",
        kind: "certificate",
        path: ".local/dev-auth/tls/localhost.pem"
      }]
    }, null, 2)}\n`, "utf8");

    await expect(loadObservationTargetCatalog(directory)).resolves.toMatchObject({
      fragments: expect.arrayContaining([
        expect.objectContaining({ basename: "OBS-05.json" })
      ])
    });
  });

  it("accepts the SPEC-mandated oactl status --capacity projection", async () => {
    const home = await mkdtemp(join(tmpdir(), "obs-05-status-home-"));
    temporaryDirectories.push(home);
    const stateDir = join(home, ".local", "state", "dialectical-engine", "observation-agent");
    await mkdir(stateDir, { recursive: true });
    await writeStatusSnapshot(stateDir, {
      pid: 123,
      version: "OBS-05-compatibility",
      thresholds_version: 1,
      mute: null,
      components: {},
      modules: {
        compatibility: [{ kind: "metric", key: "capacity.compatibility", value: 1, unit: "COUNT", view: "capacity" }]
      }
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runOactl(["status", "--capacity"], {
      stdout(value) { stdout.push(value); },
      stderr(value) { stderr.push(value); }
    }, {
      repoRoot: resolve("."),
      home,
      uid: 501,
      execute: async () => undefined
    });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain("capacity.compatibility");
  });

  it("accepts and renders the V-queryable measured used/max evidence keys", () => {
    const signal = signalSchema.parse({
      seq: 1,
      signal_id: "50000000-0000-4000-8000-000000000001",
      state: "OPEN",
      class: "CAPACITY",
      component: "postgres",
      severity: "SEVERE",
      impact_code: "IMPACT_PG_CAPACITY",
      first_failed_probe_at: "2026-09-03T08:00:00.000Z",
      detected_at: "2026-09-03T08:00:30.000Z",
      evidence: {
        used: 31,
        max: 100,
        percent: 31,
        threshold_percent: 20,
        unit: "connections",
        observed_at: "2026-09-03T08:00:30.000Z"
      },
      suspected_defect: false,
      defect_kind: null,
      run_ref: null,
      work_item_ref: null,
      threshold_version: 2,
      clears_signal_id: null,
      recorded_at: "2026-09-03T08:00:30.000Z"
    });

    expect(renderImpact(signal)).toBe(
      "Postgres is at 31/100 connections: new requests fail when the limit is reached."
    );
  });
});
