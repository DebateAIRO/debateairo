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
import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  ACTIVE_SETTINGS_VERSION_CACHE,
  createActiveSettingsVersionReader
} from "../../apps/api/src/active-settings-version.js";

const SITE_VERSION = 17;
const SQL = "SELECT register.read_active_settings_version() AS version";

/**
 * A fake pool whose answers are queued; each call records its SQL and the per-query client timeout it was sent with.
 * Every config goes through pg's own Query constructor first, as pg-pool hands it to the client (normalizeQueryConfig
 * writes the callback onto the config object), so a frozen or shared config fails here exactly as against a database.
 */
function fakePool(...answers: ReadonlyArray<unknown | (() => Promise<unknown>)>) {
  const queue = [...answers];
  const sql: string[] = [];
  const timeouts: unknown[] = [];
  const query = vi.fn(async (config: string | Readonly<{ text: string; query_timeout?: number }>) => {
    new pg.Query(config as never, undefined, () => undefined);
    sql.push(typeof config === "string" ? config : config.text);
    timeouts.push(typeof config === "string" ? undefined : config.query_timeout);
    const next = queue.shift();
    if (typeof next === "function") return { rows: [{ version: await (next as () => Promise<unknown>)() }] };
    if (next instanceof Error) throw next;
    return { rows: [{ version: next }] };
  });
  return { pool: { query } as never, query, sql, timeouts };
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
    const { pool, sql, timeouts } = fakePool(null);
    await createActiveSettingsVersionReader({ pool, siteVersion: SITE_VERSION, clock: clock().read }).current();
    expect(sql).toEqual([SQL]);
    // The driver's own per-query timeout: pg ends the query and the pool destroys its connection, so a dead peer
    // never holds a connection (or the one-query gate below) for ever.
    expect(timeouts).toEqual([ACTIVE_SETTINGS_VERSION_CACHE.queryTimeoutMs]);
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

  it("while an abandoned read is still open, no second query starts (one main-pool connection at most)", async () => {
    vi.useFakeTimers();
    const time = clock();
    const lines: Readonly<Record<string, unknown>>[] = [];
    let answer!: (value: unknown) => void;
    const hanging = () => new Promise<unknown>((resolve) => { answer = resolve; });
    const { pool, query } = fakePool(18, hanging, 20);
    const reader = createActiveSettingsVersionReader({ pool, siteVersion: SITE_VERSION, clock: time.read,
      log: (line) => lines.push(line) });
    expect(await reader.current()).toBe(18);
    time.advance(1000);
    const late = reader.current();
    await vi.advanceTimersByTimeAsync(ACTIVE_SETTINGS_VERSION_CACHE.refreshDeadlineMs);
    expect(await late).toBe(18);
    expect(query).toHaveBeenCalledTimes(2);
    // The database still has not answered: every later refresh (within the query timeout) keeps the last good value and
    // sends nothing.
    for (let second = 0; second < 3; second += 1) {
      time.advance(1000);
      expect(await reader.current()).toBe(18);
    }
    expect(query).toHaveBeenCalledTimes(2);
    expect(lines.every((line) => line.code === "ACTIVE_SETTINGS_READ_FAILED" && line.cause === "ACTIVE_SETTINGS_READ_DEADLINE")).toBe(true);
    // Once the abandoned read settles (its late answer is dropped), the next refresh queries again.
    answer(19);
    await vi.advanceTimersByTimeAsync(0);
    time.advance(1000);
    expect(await reader.current()).toBe(20);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("an abandoned read that never settles holds the gate only until the query timeout: then one replacement query goes out", async () => {
    vi.useFakeTimers();
    const time = clock();
    const never = () => new Promise<unknown>(() => undefined);
    let answerFirst!: (value: unknown) => void;
    const first = () => new Promise<unknown>((resolve) => { answerFirst = resolve; });
    const { pool, query, timeouts } = fakePool(18, first, never, 21);
    const reader = createActiveSettingsVersionReader({ pool, siteVersion: SITE_VERSION, clock: time.read });
    expect(await reader.current()).toBe(18);
    time.advance(1000);
    const late = reader.current();
    await vi.advanceTimersByTimeAsync(ACTIVE_SETTINGS_VERSION_CACHE.refreshDeadlineMs);
    expect(await late).toBe(18);
    expect(query).toHaveBeenCalledTimes(2);
    // Within the query timeout of the abandoned read: nothing is sent.
    time.advance(ACTIVE_SETTINGS_VERSION_CACHE.queryTimeoutMs - 2000);
    expect(await reader.current()).toBe(18);
    expect(query).toHaveBeenCalledTimes(2);
    // Past it: the gate opens and ONE replacement query goes out (it hangs too).
    time.advance(2000);
    const replacement = reader.current();
    await vi.advanceTimersByTimeAsync(ACTIVE_SETTINGS_VERSION_CACHE.refreshDeadlineMs);
    expect(await replacement).toBe(18);
    expect(query).toHaveBeenCalledTimes(3);
    // Two unanswered: nothing more, however long (the driver's query_timeout is what ends them for real).
    for (const wait of [1000, ACTIVE_SETTINGS_VERSION_CACHE.queryTimeoutMs, ACTIVE_SETTINGS_VERSION_CACHE.queryTimeoutMs]) {
      time.advance(wait);
      expect(await reader.current()).toBe(18);
    }
    expect(query).toHaveBeenCalledTimes(3);
    // One of them settles: the next refresh sends again, and the database answers this time.
    answerFirst(19);
    await vi.advanceTimersByTimeAsync(0);
    time.advance(1000);
    expect(await reader.current()).toBe(21);
    expect(query).toHaveBeenCalledTimes(4);
    // Every query carried the driver's timeout.
    expect(timeouts).toEqual(Array(4).fill(ACTIVE_SETTINGS_VERSION_CACHE.queryTimeoutMs));
  });

  it("under a clock that goes backwards, never more than two queries are in flight", async () => {
    vi.useFakeTimers();
    const time = clock(10000);
    const never = () => new Promise<unknown>(() => undefined);
    const { pool, query } = fakePool(18, never, never, never, never);
    const reader = createActiveSettingsVersionReader({ pool, siteVersion: SITE_VERSION, clock: time.read });
    expect(await reader.current()).toBe(18);
    for (const at of [11000, 500, 200, 100, 50, 20]) {
      time.set(at);
      const pending = reader.current();
      await vi.advanceTimersByTimeAsync(ACTIVE_SETTINGS_VERSION_CACHE.refreshDeadlineMs);
      expect(await pending).toBe(18);
    }
    // The first read, the abandoned one, and at most one replacement.
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("its two refusal codes are in both KNOWN_DOMAIN_CODES lists, sorted (so the error sweeps see them)", async () => {
    for (const file of ["apps/api/src/index.ts", "apps/runner/src/index.ts"]) {
      const source = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
      const declaration = source.slice(source.indexOf("const KNOWN_DOMAIN_CODES"));
      const codes = [...declaration.slice(declaration.indexOf("["), declaration.indexOf("]);")).matchAll(/"([A-Z][A-Z0-9_]*)"/gu)]
        .map((match) => match[1]!);
      expect(codes, file).toEqual(expect.arrayContaining(["ACTIVE_SETTINGS_READ_DEADLINE", "ACTIVE_SETTINGS_VERSION_INVALID"]));
      expect(codes, file).toEqual([...codes].sort());
    }
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

  it("the bounds: one second each to serve and to wait, five seconds for the driver to end a query", () => {
    expect(ACTIVE_SETTINGS_VERSION_CACHE).toEqual({ maxAgeMs: 1000, refreshDeadlineMs: 1000, queryTimeoutMs: 5000 });
    expect(Object.isFrozen(ACTIVE_SETTINGS_VERSION_CACHE)).toBe(true);
  });
});
