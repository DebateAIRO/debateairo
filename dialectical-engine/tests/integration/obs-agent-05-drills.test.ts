import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import {
  loadMergedThresholdPolicy,
  ThresholdRepository
} from "../../apps/observation-agent/src/oactl/core/thresholds.js";
import { loadObservationTargetCatalog } from "../../apps/observation-agent/src/core/targets.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const defaultsDirectory = resolve("deploy/observation-agent/thresholds/defaults");
let database: TestDatabase | undefined;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

function fixture(): TestDatabase {
  expect(database).toBeDefined();
  return database!;
}

describe("OBS-05 versioned capacity drills", () => {
  it("loads the exact certificate target and complete frozen defaults", async () => {
    const catalog = await loadObservationTargetCatalog(resolve("deploy/observation-agent/targets.dev.d"));
    expect(catalog.fragments.find(({ basename }) => basename === "OBS-05.json")?.targets).toEqual([{
      component: "tls_front_door", kind: "certificate", path: ".local/dev-auth/tls/localhost.pem"
    }]);
    const policy = await loadMergedThresholdPolicy({ defaultsDirectory });
    expect(policy.routing).toMatchObject({ CAPACITY: "DEGRADED", CERT_EXPIRY: "DEGRADED" });
    expect(policy.modules?.["postgres-capacity"]).toEqual({
      probe_interval_ms: 30_000, probe_timeout_ms: 2_000,
      connections_severe_percent: 80, connections_fatal_percent: 95,
      lock_waiter_count: 1, lock_wait_s: 60, transaction_age_s: 300,
      idle_in_transaction_count: 5, idle_in_transaction_s: 120, clear_samples: 2
    });
    expect(policy.modules?.["host-capacity"]).toEqual({
      probe_interval_ms: 30_000, probe_timeout_ms: 2_000,
      disk_degraded_free_percent: 15, disk_fatal_free_percent: 5,
      memory_severe_available_percent: 10, load_per_core_multiplier: 2,
      load_sustained_samples: 10, clear_samples: 2
    });
    expect(policy.modules?.["certificate-capacity"]).toEqual({
      probe_interval_ms: 86_400_000, probe_timeout_ms: 2_000,
      expiry_degraded_days: 14, expiry_severe_days: 3
    });
  });

  it("applies every drill and rollback as an append-only version", async () => {
    const repository = new ThresholdRepository(fixture().pool);
    const files = [
      undefined,
      resolve("deploy/observation-agent/thresholds/drill-connections-20pct.json"),
      resolve("deploy/observation-agent/thresholds/drill-disk-current-plus-one.json"),
      resolve("deploy/observation-agent/thresholds/drill-certificate-400d.json"),
      undefined
    ];
    for (const [index, overrideFile] of files.entries()) {
      const policy = await loadMergedThresholdPolicy({
        defaultsDirectory,
        ...(overrideFile === undefined ? {} : { overrideFile })
      });
      const applied = await repository.apply(policy, `OBS-05-${index + 1}`, "V");
      expect(applied.version).toBe(index + 1);
    }
    await expect(fixture().pool.query(
      "UPDATE observation.threshold_policy SET source_ref='overwrite' WHERE version=1"
    )).rejects.toThrow();
    await expect(fixture().pool.query(
      "SELECT version,source_ref FROM observation.threshold_policy ORDER BY version"
    )).resolves.toMatchObject({ rows: [
      { version: 1, source_ref: "OBS-05-1" },
      { version: 2, source_ref: "OBS-05-2" },
      { version: 3, source_ref: "OBS-05-3" },
      { version: 4, source_ref: "OBS-05-4" },
      { version: 5, source_ref: "OBS-05-5" }
    ] });
  });
});
