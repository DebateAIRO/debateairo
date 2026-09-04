import type { Pool, QueryResult } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SUPPORT_CONFIGURATION_KEYS,
  createSupportConfigurationPort,
  type SupportConfigurationKey
} from "../../packages/register/src/support-config.js";

const VALUES: Readonly<Record<SupportConfigurationKey, string>> = Object.freeze({
  support_enabled: "true",
  support_model_ref: `"development:claude-cli"`,
  support_relay_concurrency: "2",
  support_daily_call_cap: "500",
  support_limit_anon_msgs_10m: "20",
  support_limit_anon_msgs_24h: "100",
  support_limit_anon_sessions_1h: "5",
  support_limit_session_msgs: "40",
  support_limit_msg_chars: "2000",
  support_limit_account_msgs_10m: "60",
  support_limit_account_msgs_24h: "300",
  support_queue_depth: "10",
  support_lock_after_injections: "3",
  support_ip_cooldown_minutes: "60",
  support_retention_policy: `"keep"`,
  support_retention_ratified_by: "null"
});

afterEach(() => {
  vi.useRealTimers();
});

function lp(value: string): Buffer {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  return Buffer.concat([length, bytes]);
}

async function sha(rows: readonly { row_key: string; value_json_text: string; source_ref: string }[]): Promise<string> {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  [...rows].sort((left, right) => Buffer.compare(Buffer.from(left.row_key), Buffer.from(right.row_key)))
    .flatMap((row) => [lp(row.row_key), lp(row.value_json_text), lp(row.source_ref)])
    .forEach((part) => hash.update(part));
  return hash.digest("hex");
}

async function statusRow(replacements: Partial<Record<SupportConfigurationKey, string>> = {}) {
  const configuration = SUPPORT_CONFIGURATION_KEYS.map((row_key) => ({
    row_key,
    value_json_text: replacements[row_key] ?? VALUES[row_key],
    source_ref: "src:support"
  }));
  return {
    support_register_version: "9007199254740993",
    schema_version: 1,
    base_register_version: "4",
    publication_id: "00000000-0000-4000-8000-000000000001",
    request_sha256: "a".repeat(64),
    snapshot_sha256: "b".repeat(64),
    support_snapshot_sha256: await sha(configuration),
    changed_keys: ["support_enabled"],
    source_ref: "src:support",
    recorded_at: new Date("2026-09-04T00:00:00.000Z"),
    configuration_text: JSON.stringify(configuration)
  };
}

function poolWith(query: () => Promise<{ rows: unknown[] }>) {
  let queryCount = 0;
  let endCount = 0;
  let releaseCount = 0;
  const runQuery = async (sql: string) => {
    queryCount += 1;
    expect(sql).toContain("register.read_support_configuration_status()");
    expect(sql).toContain("configuration::text AS configuration_text");
    return query() as Promise<QueryResult>;
  };
  const client = {
    query: runQuery,
    release: () => { releaseCount += 1; }
  };
  const pool = {
    query: runQuery,
    connect: async () => client,
    end: async () => { endCount += 1; }
  } as unknown as Pool;
  return {
    pool,
    queryCount: () => queryCount,
    endCount: () => endCount,
    releaseCount: () => releaseCount
  };
}

describe("closed schema-1 support catalogue", () => {
  it("contains exactly the 16 V-ratified keys and excludes the marker", () => {
    expect(SUPPORT_CONFIGURATION_KEYS).toEqual([
      "support_enabled", "support_model_ref", "support_relay_concurrency",
      "support_daily_call_cap", "support_limit_anon_msgs_10m",
      "support_limit_anon_msgs_24h", "support_limit_anon_sessions_1h",
      "support_limit_session_msgs", "support_limit_msg_chars",
      "support_limit_account_msgs_10m", "support_limit_account_msgs_24h",
      "support_queue_depth", "support_lock_after_injections",
      "support_ip_cooldown_minutes", "support_retention_policy",
      "support_retention_ratified_by"
    ]);
    expect(SUPPORT_CONFIGURATION_KEYS).toHaveLength(16);
    expect(SUPPORT_CONFIGURATION_KEYS).not.toContain("supportActivation");
  });

  it.each([
    ["support_enabled", ["true", "false"], ["null", "0", `"true"`]],
    ["support_model_ref", [`"x"`, `"development:none"`, `"${"x".repeat(128)}"`], [`""`, `"https://example.test/model"`, `"ftp://example.test/model"`, `"bad ref"`, `" bad"`, `"bad?ref"`, `"${"x".repeat(129)}"`]],
    ["support_relay_concurrency", ["1", "16"], ["0", "17", "1.5"]],
    ["support_daily_call_cap", ["1", "1000000"], ["0", "1000001"]],
    ["support_limit_anon_msgs_10m", ["1", "100000"], ["0", "100001"]],
    ["support_limit_anon_msgs_24h", ["1", "1000000"], ["0", "1000001"]],
    ["support_limit_anon_sessions_1h", ["1", "100000"], ["0", "100001"]],
    ["support_limit_session_msgs", ["1", "100000"], ["0", "100001"]],
    ["support_limit_msg_chars", ["1", "100000"], ["0", "100001"]],
    ["support_limit_account_msgs_10m", ["1", "100000"], ["0", "100001"]],
    ["support_limit_account_msgs_24h", ["1", "1000000"], ["0", "1000001"]],
    ["support_queue_depth", ["0", "1000"], ["-1", "1001"]],
    ["support_lock_after_injections", ["1", "100"], ["0", "101"]],
    ["support_ip_cooldown_minutes", ["1", "10080"], ["0", "10081"]],
    ["support_retention_policy", [`"keep"`, `"shred-after-days:1"`, `"shred-after-days:3650"`], [`"shred-after-days:0"`, `"shred-after-days:3651"`, `"shred-after-days:01"`]],
    ["support_retention_ratified_by", ["null", `"V"`], [`"v"`, `"V "`, `"other"`]]
  ] as const)("enforces both boundaries for %s", async (key, accepted, rejected) => {
    for (const value of accepted) {
      const fixture = poolWith(async () => ({ rows: [await statusRow({ [key]: value })] }));
      await expect(createSupportConfigurationPort(fixture.pool).current()).resolves.toMatchObject({ kind: "AVAILABLE" });
    }
    for (const value of rejected) {
      const fixture = poolWith(async () => ({ rows: [await statusRow({ [key]: value })] }));
      await expect(createSupportConfigurationPort(fixture.pool).current()).resolves.toEqual({
        kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID"
      });
    }
  });

  it("rejects an unknown support prefix key and any missing/duplicate key", async () => {
    for (const mutate of [
      (rows: Array<Record<string, unknown>>) => rows.push({ row_key: "support_unknown", value_json_text: "1", source_ref: "src" }),
      (rows: Array<Record<string, unknown>>) => rows.pop(),
      (rows: Array<Record<string, unknown>>) => rows.push({ ...rows[0] })
    ]) {
      const row = await statusRow();
      const parsed = JSON.parse(row.configuration_text) as Array<Record<string, unknown>>;
      mutate(parsed);
      const fixture = poolWith(async () => ({ rows: [{ ...row, configuration_text: JSON.stringify(parsed) }] }));
      await expect(createSupportConfigurationPort(fixture.pool).current()).resolves.toEqual({
        kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID"
      });
    }
  });
});

describe("bounded fail-closed support configuration reader", () => {
  it("validates a complete text-cast snapshot and preserves the bigint version", async () => {
    const fixture = poolWith(async () => ({ rows: [await statusRow()] }));
    const state = await createSupportConfigurationPort(fixture.pool).current();
    expect(state).toMatchObject({
      kind: "AVAILABLE",
      snapshot: {
        supportRegisterVersion: "9007199254740993",
        schemaVersion: 1,
        supportSnapshotSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        fullSnapshotSha256: "b".repeat(64),
        values: {
          supportEnabled: true,
          supportModelRef: "development:claude-cli",
          supportRelayConcurrency: 2,
          supportRetentionPolicy: "keep",
          supportRetentionRatifiedBy: null
        }
      }
    });
  });

  it("returns malformed cardinality, unsupported-schema, and invalid snapshots as named disabled states", async () => {
    const empty = poolWith(async () => ({ rows: [] }));
    await expect(createSupportConfigurationPort(empty.pool).current()).resolves.toEqual({
      kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID"
    });
    const future = poolWith(async () => ({ rows: [{ ...(await statusRow()), schema_version: 2 }] }));
    await expect(createSupportConfigurationPort(future.pool).current()).resolves.toEqual({
      kind: "DISABLED", code: "SUPPORT_CONFIG_SCHEMA_UNSUPPORTED"
    });
    const corrupt = poolWith(async () => ({ rows: [{ ...(await statusRow()), support_snapshot_sha256: "0".repeat(64) }] }));
    await expect(createSupportConfigurationPort(corrupt.pool).current()).resolves.toEqual({
      kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID"
    });
  });

  it("runs bounded raw duplicate-key validation before JSON.parse semantics can erase evidence", async () => {
    const row = await statusRow();
    const duplicateEnvelope = row.configuration_text.replace(
      `"row_key":"support_enabled"`,
      `"row_key":"support_unknown","row_key":"support_enabled"`
    );
    const fixture = poolWith(async () => ({ rows: [{ ...row, configuration_text: duplicateEnvelope }] }));
    await expect(createSupportConfigurationPort(fixture.pool).current()).resolves.toEqual({
      kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID"
    });
  });

  it("uses a strictly-younger-than-1000ms cache and one public refresh flight", async () => {
    let now = 0;
    let resolveQuery!: (value: { rows: unknown[] }) => void;
    const fixture = poolWith(() => new Promise((resolve) => { resolveQuery = resolve; }));
    const port = createSupportConfigurationPort(fixture.pool, { monotonicNow: () => now });
    const first = port.current();
    const same = port.current();
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.queryCount()).toBe(1);
    resolveQuery({ rows: [await statusRow()] });
    await expect(Promise.all([first, same])).resolves.toHaveLength(2);
    now = 999;
    await port.current();
    expect(fixture.queryCount()).toBe(1);
    now = 1000;
    const next = port.current();
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.queryCount()).toBe(2);
    resolveQuery({ rows: [await statusRow()] });
    await expect(next).resolves.toMatchObject({
      kind: "AVAILABLE", snapshot: { supportRegisterVersion: "9007199254740993" }
    });
  });

  it("rework B2 rejects a lower due generation and caches the disabled result only until its own due boundary", async () => {
    let now = 0;
    let invocation = 0;
    const fixture = poolWith(async () => {
      invocation += 1;
      const version = invocation === 1 ? "10" : invocation === 2 ? "9" : "11";
      return { rows: [{ ...(await statusRow()), support_register_version: version }] };
    });
    const port = createSupportConfigurationPort(fixture.pool, { monotonicNow: () => now });

    await expect(port.current()).resolves.toMatchObject({
      kind: "AVAILABLE", snapshot: { supportRegisterVersion: "10" }
    });
    now = 1000;
    await expect(port.current()).resolves.toEqual({
      kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID"
    });
    expect(fixture.queryCount()).toBe(2);
    now = 1999;
    await expect(port.current()).resolves.toEqual({
      kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID"
    });
    expect(fixture.queryCount()).toBe(2);
    now = 2000;
    await expect(port.current()).resolves.toMatchObject({
      kind: "AVAILABLE", snapshot: { supportRegisterVersion: "11" }
    });
    expect(fixture.queryCount()).toBe(3);
  });

  it("rework round 2 does not reuse a settled AVAILABLE flight at the exact due boundary", async () => {
    let now = 0;
    let invocation = 0;
    const fixture = poolWith(async () => {
      invocation += 1;
      const version = invocation === 1 ? "10" : "9";
      return { rows: [{ ...(await statusRow()), support_register_version: version }] };
    });
    const port = createSupportConfigurationPort(fixture.pool, { monotonicNow: () => now });

    const firstPromise = port.current();
    const first = await firstPromise;
    now = 1000;
    const duePromise = port.current();
    const samePromise = duePromise === firstPromise;
    const atDue = { queries: fixture.queryCount(), releases: fixture.releaseCount() };
    const due = await duePromise;
    const postCleanup = await port.current();

    expect({
      first: first.kind === "AVAILABLE" ? first.snapshot.supportRegisterVersion : first,
      due: due.kind === "AVAILABLE" ? due.snapshot.supportRegisterVersion : due,
      samePromise,
      atDue,
      postCleanup,
      final: { queries: fixture.queryCount(), releases: fixture.releaseCount() }
    }).toEqual({
      first: "10",
      due: { kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID" },
      samePromise: false,
      atDue: { queries: 1, releases: 1 },
      postCleanup: { kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID" },
      final: { queries: 2, releases: 2 }
    });
  });

  it("rework B3 applies the deadline after 1100ms of synchronous transfer and validation", async () => {
    let now = 0;
    const row = await statusRow();
    const delayedRow = new Proxy(row, {
      get(target, property, receiver) {
        if (property === "configuration_text") now = 1100;
        return Reflect.get(target, property, receiver);
      }
    });
    const fixture = poolWith(async () => ({ rows: [delayedRow] }));
    const port = createSupportConfigurationPort(fixture.pool, { monotonicNow: () => now });

    await expect(port.current()).resolves.toEqual({
      kind: "DISABLED", code: "SUPPORT_CONFIG_REFRESH_DEADLINE"
    });
  });

  it("rework B3 retains a timed-out underlying flight through re-entry and clears it only after late settlement", async () => {
    vi.useFakeTimers();
    let invocation = 0;
    let settleFirst!: (value: { rows: unknown[] }) => void;
    const fixture = poolWith(async () => {
      invocation += 1;
      if (invocation === 1) return new Promise((resolve) => { settleFirst = resolve; });
      return { rows: [{ ...(await statusRow()), support_register_version: "11" }] };
    });
    const port = createSupportConfigurationPort(fixture.pool, { monotonicNow: () => Date.now() });

    const first = port.current();
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.queryCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(first).resolves.toEqual({ kind: "DISABLED", code: "SUPPORT_CONFIG_REFRESH_DEADLINE" });
    vi.advanceTimersByTime(1000);
    await expect(port.current()).resolves.toEqual({
      kind: "DISABLED", code: "SUPPORT_CONFIG_REFRESH_DEADLINE"
    });
    expect(fixture.queryCount()).toBe(1);

    settleFirst({ rows: [{ ...(await statusRow()), support_register_version: "10" }] });
    await vi.advanceTimersByTimeAsync(0);
    await expect(port.current()).resolves.toMatchObject({
      kind: "AVAILABLE", snapshot: { supportRegisterVersion: "11" }
    });
    expect(fixture.queryCount()).toBe(2);
  });

  it("rework B3 coordinates close with the live attempt and ends the pool exactly once", async () => {
    let settle!: (value: { rows: unknown[] }) => void;
    const fixture = poolWith(() => new Promise((resolve) => { settle = resolve; }));
    const port = createSupportConfigurationPort(fixture.pool);
    const current = port.current();
    const firstClose = port.close();
    const secondClose = port.close();
    let closeSettled = false;
    void firstClose.then(() => { closeSettled = true; });

    expect(firstClose).toBe(secondClose);
    await Promise.resolve();
    await Promise.resolve();
    expect(closeSettled).toBe(false);
    expect(fixture.endCount()).toBe(1);
    await expect(port.current()).resolves.toEqual({
      kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID"
    });

    settle({ rows: [await statusRow()] });
    await expect(current).resolves.toEqual({ kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID" });
    await firstClose;
    await secondClose;
    expect(fixture.queryCount()).toBe(1);
    expect(fixture.endCount()).toBe(1);
  });

  it("fails closed at the acquisition-through-validation deadline and never serves expired enabled", async () => {
    vi.useFakeTimers();
    let invocation = 0;
    const fixture = poolWith(async () => {
      invocation += 1;
      if (invocation === 1) return { rows: [await statusRow()] };
      return new Promise<{ rows: unknown[] }>(() => undefined);
    });
    const port = createSupportConfigurationPort(fixture.pool, { monotonicNow: () => Date.now() });
    await expect(port.current()).resolves.toMatchObject({ kind: "AVAILABLE" });
    vi.advanceTimersByTime(1000);
    const due = port.current();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(due).resolves.toEqual({ kind: "DISABLED", code: "SUPPORT_CONFIG_REFRESH_DEADLINE" });
  });

  it("treats query/validation exceptions as invalid and closes owned resources idempotently", async () => {
    const fixture = poolWith(async () => { throw new Error("database unavailable"); });
    const port = createSupportConfigurationPort(fixture.pool);
    await expect(port.current()).resolves.toEqual({ kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID" });
    await port.close();
    await port.close();
    expect(fixture.endCount()).toBe(1);
    await expect(port.current()).resolves.toEqual({ kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID" });
    expect(fixture.queryCount()).toBe(1);
  });
});
