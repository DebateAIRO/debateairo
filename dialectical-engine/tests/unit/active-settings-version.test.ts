/**
 * Side-by-side spec §13 (plan D1, D8): the activation pointer's ONE runtime reader
 * (apps/api/src/active-settings-version.ts), over a fake `query` and a hand-driven monotonic clock.
 *
 * - NULL (no activation) is the site version; a number (or node-postgres's bigint text) is that version;
 * - a value under one second old is answered without a read; concurrent callers share one read;
 * - the SQL is exactly the reader's call, written once in the module;
 * - a failed later read keeps the last good value and logs ACTIVE_SETTINGS_READ_FAILED at most once a minute (codes
 *   only); a failed FIRST read rejects (the boot refuses); a read past the deadline counts as failed;
 * - a clock that goes backwards makes the value stale (read again), never fresh.
 */
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  ACTIVE_SETTINGS_VERSION_CACHE,
  createActiveSettingsVersionReader
} from "../../apps/api/src/active-settings-version.js";

const SITE_VERSION = 17;
const SQL = "SELECT register.read_active_settings_version() AS version";

/** A fake pool whose answers are queued; each call records its SQL. */
function fakePool(...answers: ReadonlyArray<unknown | (() => Promise<unknown>)>) {
  const queue = [...answers];
  const sql: string[] = [];
  const query = vi.fn(async (text: string) => {
    sql.push(text);
    const next = queue.shift();
    if (typeof next === "function") return { rows: [{ version: await (next as () => Promise<unknown>)() }] };
    if (next instanceof Error) throw next;
    return { rows: [{ version: next }] };
  });
  return { pool: { query } as never, query, sql };
}

function clock(start = 1000) {
  let now = start;
  return { read: () => now, set: (value: number) => { now = value; }, advance: (ms: number) => { now += ms; } };
}

afterEach(() => { vi.useRealTimers(); });

describe("the activation pointer's one reader (side-by-side spec §13)", () => {
  it("reads NULL as the site version and a number (or bigint text) as that version", async () => {
    const time = clock();
    const { pool } = fakePool(null, 18, "19");
    const reader = createActiveSettingsVersionReader({ pool, siteVersion: SITE_VERSION, clock: time.read });
    expect(reader.lastObserved()).toBeNull();
    expect(await reader.current()).toBe(SITE_VERSION);
    expect(reader.lastObserved()).toBe(SITE_VERSION);
    time.advance(ACTIVE_SETTINGS_VERSION_CACHE.maxAgeMs);
    expect(await reader.current()).toBe(18);
    time.advance(ACTIVE_SETTINGS_VERSION_CACHE.maxAgeMs);
    expect(await reader.current()).toBe(19);
    expect(reader.lastObserved()).toBe(19);
  });

  it("refuses a pointer that is not a positive whole number (never guessed)", async () => {
    for (const value of [0, -3, 1.5, "18x", "", true]) {
      const { pool } = fakePool(value);
      const reader = createActiveSettingsVersionReader({ pool, siteVersion: SITE_VERSION, clock: clock().read });
      await expect(reader.current(), String(value)).rejects.toMatchObject({ code: "ACTIVE_SETTINGS_VERSION_INVALID" });
    }
  });

  it("answers from the value under a second old, reads again at a second, and concurrent callers share one read", async () => {
    const time = clock();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const { pool, query } = fakePool(async () => { await held; return 18; }, 19);
    const reader = createActiveSettingsVersionReader({ pool, siteVersion: SITE_VERSION, clock: time.read });
    const first = [reader.current(), reader.current(), reader.current()];
    expect(query).toHaveBeenCalledTimes(1);
    release();
    expect(await Promise.all(first)).toEqual([18, 18, 18]);
    time.advance(ACTIVE_SETTINGS_VERSION_CACHE.maxAgeMs - 1);
    expect(await reader.current()).toBe(18);
    expect(query).toHaveBeenCalledTimes(1);
    time.advance(1);
    expect(await reader.current()).toBe(19);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("sends exactly the reader's call, and the module writes that SQL once, as one constant", async () => {
    const { pool, sql } = fakePool(null);
    await createActiveSettingsVersionReader({ pool, siteVersion: SITE_VERSION, clock: clock().read }).current();
    expect(sql).toEqual([SQL]);
    const source = await readFile(new URL("../../apps/api/src/active-settings-version.ts", import.meta.url), "utf8");
    expect(source.split(SQL)).toHaveLength(2);
    expect(source).toContain(`const ACTIVE_SETTINGS_VERSION_SQL = "${SQL}";`);
  });

  it("a failed later read keeps the last good value, waits a second before the next, and logs once a minute (codes only)", async () => {
    const time = clock();
    const lines: Readonly<Record<string, unknown>>[] = [];
    const refused = new TypedDomainError("DATABASE_POOL_FAILED", "a message that is never logged");
    const { pool, query } = fakePool(18, refused, new Error("connection reset by peer"), refused, 20);
    const reader = createActiveSettingsVersionReader({ pool, siteVersion: SITE_VERSION, clock: time.read,
      log: (line) => lines.push(line) });
    expect(await reader.current()).toBe(18);
    time.advance(1000);
    expect(await reader.current()).toBe(18);
    expect(lines).toEqual([{ kind: "DEBATEAI_ACTIVE_SETTINGS", code: "ACTIVE_SETTINGS_READ_FAILED", cause: "DATABASE_POOL_FAILED" }]);
    // The failure counts as a read: the next one waits its second.
    expect(await reader.current()).toBe(18);
    expect(query).toHaveBeenCalledTimes(2);
    time.advance(1000);
    expect(await reader.current()).toBe(18);
    expect(lines).toHaveLength(1);
    time.advance(60000);
    expect(await reader.current()).toBe(18);
    expect(lines).toEqual([
      { kind: "DEBATEAI_ACTIVE_SETTINGS", code: "ACTIVE_SETTINGS_READ_FAILED", cause: "DATABASE_POOL_FAILED" },
      { kind: "DEBATEAI_ACTIVE_SETTINGS", code: "ACTIVE_SETTINGS_READ_FAILED", cause: "DATABASE_POOL_FAILED" }
    ]);
    expect(JSON.stringify(lines)).not.toContain("never logged");
    time.advance(1000);
    expect(await reader.current()).toBe(20);
    expect(reader.lastObserved()).toBe(20);
  });

  it("a failed FIRST read rejects (the boot refuses), and the next call reads again", async () => {
    const missing = new Error("permission denied for function read_active_settings_version");
    const { pool, query } = fakePool(missing, null);
    const reader = createActiveSettingsVersionReader({ pool, siteVersion: SITE_VERSION, clock: clock().read });
    await expect(reader.current()).rejects.toBe(missing);
    expect(reader.lastObserved()).toBeNull();
    expect(await reader.current()).toBe(SITE_VERSION);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("a read past the deadline counts as failed: the last good value is kept", async () => {
    vi.useFakeTimers();
    const time = clock();
    const lines: Readonly<Record<string, unknown>>[] = [];
    const { pool } = fakePool(18, () => new Promise<unknown>(() => undefined));
    const reader = createActiveSettingsVersionReader({ pool, siteVersion: SITE_VERSION, clock: time.read,
      log: (line) => lines.push(line) });
    expect(await reader.current()).toBe(18);
    time.advance(1000);
    const late = reader.current();
    await vi.advanceTimersByTimeAsync(ACTIVE_SETTINGS_VERSION_CACHE.refreshDeadlineMs);
    expect(await late).toBe(18);
    expect(lines).toEqual([{ kind: "DEBATEAI_ACTIVE_SETTINGS", code: "ACTIVE_SETTINGS_READ_FAILED", cause: "ACTIVE_SETTINGS_READ_DEADLINE" }]);
  });

  it("a clock that goes backwards makes the value stale (read again), never fresh", async () => {
    const time = clock(5000);
    const { pool, query } = fakePool(18, 19);
    const reader = createActiveSettingsVersionReader({ pool, siteVersion: SITE_VERSION, clock: time.read });
    expect(await reader.current()).toBe(18);
    time.set(4000);
    expect(await reader.current()).toBe(19);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("the bounds are one second each", () => {
    expect(ACTIVE_SETTINGS_VERSION_CACHE).toEqual({ maxAgeMs: 1000, refreshDeadlineMs: 1000 });
    expect(Object.isFrozen(ACTIVE_SETTINGS_VERSION_CACHE)).toBe(true);
  });
});
