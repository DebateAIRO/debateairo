import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderStatus } from "../../apps/observation-agent/src/oactl/core/status.js";
import { writeStatusSnapshot } from "../../apps/observation-agent/src/store/status.js";
import { renderImpact, signalSchema } from "../../apps/observation-agent/src/core/signals.js";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function openSignal(impactCode: "IMPACT_PG_CAPACITY" | "IMPACT_DISK" | "IMPACT_MEMORY" | "IMPACT_CERT", evidence: Record<string, unknown>) {
  return signalSchema.parse({
    seq: 1, signal_id: "50000000-0000-4000-8000-000000000001", state: "OPEN",
    class: impactCode === "IMPACT_CERT" ? "CERT_EXPIRY" : "CAPACITY",
    component: impactCode === "IMPACT_PG_CAPACITY" ? "postgres"
      : impactCode === "IMPACT_CERT" ? "tls_front_door" : "host",
    severity: "DEGRADED", impact_code: impactCode,
    first_failed_probe_at: "2026-09-03T12:00:00.000Z",
    detected_at: "2026-09-03T12:00:00.000Z", evidence,
    suspected_defect: false, defect_kind: null, run_ref: null, work_item_ref: null,
    threshold_version: 9, clears_signal_id: null, recorded_at: "2026-09-03T12:00:00.000Z"
  });
}

describe("OBS-05 capacity status and fixed copy", () => {
  it("renders every ruled numeric row and the exact slow-query honesty line", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-05-status-"));
    temporaryDirectories.push(stateDir);
    const metric = (key: string, value: number, unit: "COUNT" | "SECONDS" | "BYTES" | "PERCENT") =>
      ({ kind: "metric" as const, key, value, unit, view: "capacity" });
    await writeStatusSnapshot(stateDir, {
      pid: 123, version: "OBS-05-test", thresholds_version: 9, mute: null, components: {},
      modules: {
        "postgres-capacity": [
          metric("postgres.connections.used", 31, "COUNT"), metric("postgres.connections.max", 100, "COUNT"),
          metric("postgres.lock_waiters", 1, "COUNT"), metric("postgres.longest_transaction_age_s", 300, "SECONDS"),
          metric("postgres.active_query_age_s", 22, "SECONDS"), metric("postgres.idle_in_transaction", 5, "COUNT"),
          metric("postgres.database.debateai", 1000, "BYTES"), metric("postgres.database.hatchet", 2000, "BYTES"),
          { kind: "template", key: "slow_queries", template: "SLOW_QUERIES_NOT_OBSERVABLE", view: "capacity" },
          { kind: "state", key: "postgres.capacity_band", state: "SEVERE", view: "capacity" }
        ],
        "host-capacity": [
          metric("host.disk.free_percent", 14.5, "PERCENT"), metric("docker.disk_bytes", 3000, "BYTES"),
          metric("host.memory.available_percent", 9.5, "PERCENT"), metric("host.load.one_minute", 21, "COUNT"),
          metric("host.logical_cores", 10, "COUNT"),
          metric("container.debateai-v3-postgres-1.cpu_percent", 5, "PERCENT"),
          metric("container.debateai-v3-postgres-1.memory_used_bytes", 10, "BYTES"),
          metric("container.debateai-v3-postgres-1.memory_limit_bytes", 100, "BYTES"),
          metric("container.debateai-v3-postgres-1.memory_percent", 10, "PERCENT"),
          metric("container.debateai-v3-hatchet-lite-1.cpu_percent", 7, "PERCENT"),
          metric("container.debateai-v3-hatchet-lite-1.memory_used_bytes", 20, "BYTES"),
          metric("container.debateai-v3-hatchet-lite-1.memory_limit_bytes", 200, "BYTES"),
          metric("container.debateai-v3-hatchet-lite-1.memory_percent", 10, "PERCENT")
        ],
        "certificate-capacity": [metric("certificate.days", 14, "COUNT")]
      }
    });
    const output = await renderStatus(stateDir, "capacity");
    for (const value of [
      "thresholds v9", "postgres.connections.used", "postgres.connections.max", "postgres.lock_waiters",
      "postgres.longest_transaction_age_s", "postgres.idle_in_transaction", "postgres.database.debateai",
      "postgres.database.hatchet", "host.disk.free_percent", "docker.disk_bytes",
      "host.memory.available_percent", "host.load.one_minute", "host.logical_cores",
      "container.debateai-v3-postgres-1.cpu_percent", "container.debateai-v3-postgres-1.memory_used_bytes",
      "container.debateai-v3-hatchet-lite-1.cpu_percent", "container.debateai-v3-hatchet-lite-1.memory_used_bytes",
      "certificate.days", "slow_queries: NOT OBSERVABLE (pg_stat_statements disabled)"
    ]) expect(output).toContain(value);
  });

  it("renders only fixed impact templates from numeric closed evidence", () => {
    expect(renderImpact(openSignal("IMPACT_PG_CAPACITY", {
      used: 31, max: 100, percent: 31, threshold_percent: 20, unit: "connections",
      observed_at: "2026-09-03T12:00:00.000Z"
    }))).toBe("Postgres is at 31/100 connections: new requests fail when the limit is reached.");
    expect(renderImpact(openSignal("IMPACT_DISK", {
      percent: 14.5, threshold_percent: 15, free_bytes: 145, total_bytes: 1000,
      unit: "bytes", observed_at: "2026-09-03T12:00:00.000Z"
    }))).toBe("Disk free is 14.5%: Postgres and the spool stop accepting writes at 0.");
    expect(renderImpact(openSignal("IMPACT_MEMORY", {
      percent: 9.5, threshold_percent: 10, available_bytes: 95, total_bytes: 1000,
      unit: "bytes", observed_at: "2026-09-03T12:00:00.000Z"
    }))).toBe("Host memory pressure is high: processes may be killed.");
    expect(renderImpact(openSignal("IMPACT_CERT", {
      days: 14, threshold_days: 14, not_after: "2026-09-17T12:00:00.000Z", unit: "days"
    }))).toBe("The https certificate expires in 14 days: the front door refuses connections after that.");
  });
});
