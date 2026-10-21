import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PostgresReleaseStateReader,
  RELEASE_WATCH_POLL_MS,
  RELEASE_WATCH_STALE_MS,
  ReleaseWatcher,
  type ReleaseStateReader
} from "../../apps/api/src/release-state.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4, §6 (plan C task C3): the API's release watcher reads which release is current
 * every second and answers, from its last read, whether this process's release is current, whether it is draining, and
 * why it is not ready (the reasons /readyz will carry, in their fixed order). A read older than five seconds counts as
 * "the database is unreachable": the watcher then never claims to be current. With no release recorded, a local API is
 * current (today's single-release world); a hosted one is not (fail closed).
 */
// The code parts are kept apart from the key names, so no line pairs a *_KEY name with a literal (gitleaks).
const OWN = ["r17", "0123456789ab"].join("-");
const NEXT = ["r18", "0123456789ab"].join("-");
const START = 1_800_000_000_000;

type Current = Readonly<{ releaseKey: string; takeTrafficFrom: Date | null }> | null;

let now = START;
let current: Current = null;
let failing = false;
let reads = 0;
let lines: string[] = [];

const reader: ReleaseStateReader = {
  async readCurrent() {
    reads += 1;
    if (failing) throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
    return current;
  },
  async readState() {
    return null;
  }
};

function watcher(hosted = false): ReleaseWatcher {
  return new ReleaseWatcher({ releaseKey: OWN, hosted, reader, clock: () => now, log: (line) => lines.push(line) });
}

/** Moves the fake clock and the fake timers together, letting every poll that falls due run. */
async function advance(ms: number): Promise<void> {
  for (let left = ms; left > 0;) {
    const step = Math.min(left, 100);
    now += step;
    left -= step;
    await vi.advanceTimersByTimeAsync(step);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  now = START;
  current = null;
  failing = false;
  reads = 0;
  lines = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("side-by-side C3: the API's release watcher", () => {
  it("polls every second and counts a read older than five seconds as stale", () => {
    expect(RELEASE_WATCH_POLL_MS).toBe(1_000);
    expect(RELEASE_WATCH_STALE_MS).toBe(5_000);
  });

  it("with no release recorded a local API is current and not draining", async () => {
    const w = watcher(false);
    await w.start();
    w.markBooted();
    expect(w.ownIsCurrent()).toBe(true);
    expect(w.draining()).toBe(false);
    expect(w.readiness()).toEqual({ ready: true, releaseKey: OWN, reasons: [] });
    w.stop();
  });

  it("with no release recorded a hosted API is not current (fail closed)", async () => {
    const w = watcher(true);
    await w.start();
    w.markBooted();
    expect(w.ownIsCurrent()).toBe(false);
    expect(w.readiness().ready).toBe(false);
    expect(w.readiness().reasons).toContain("NOT_CURRENT");
    w.stop();
  });

  it("is not ready while booting or before the take-traffic-from instant, and ready after both", async () => {
    current = { releaseKey: OWN, takeTrafficFrom: new Date(START + 3_000) };
    const w = watcher(true);
    await w.start();
    expect(w.ownIsCurrent()).toBe(true);
    const before = w.readiness();
    expect(before).toEqual({ ready: false, releaseKey: OWN, reasons: ["BOOTING", "BEFORE_TAKE_TRAFFIC_FROM"] });
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.reasons)).toBe(true);
    w.markBooted();
    await advance(3_000);
    expect(w.readiness()).toEqual({ ready: true, releaseKey: OWN, reasons: [] });
    w.stop();
  });

  it("a database that fails every read for over five seconds makes it not current, and draining keeps its last value", async () => {
    current = { releaseKey: OWN, takeTrafficFrom: new Date(START - 60_000) };
    const w = watcher(true);
    await w.start();
    w.markBooted();
    failing = true;
    await advance(5_000);
    expect(w.ownIsCurrent()).toBe(true); // the last read is exactly five seconds old: still fresh
    await advance(1);
    expect(w.readiness().reasons).toContain("DATABASE_UNREACHABLE");
    expect(w.ownIsCurrent()).toBe(false);
    expect(w.draining()).toBe(false);
    // One content-free line per failing streak: the code, never the error's text.
    expect(lines.filter((line) => line.includes("READ_FAILED"))).toHaveLength(1);
    expect(lines.join("\n")).not.toContain("127.0.0.1");
    failing = false;
    await advance(RELEASE_WATCH_POLL_MS);
    expect(w.ownIsCurrent()).toBe(true);
    expect(w.readiness()).toEqual({ ready: true, releaseKey: OWN, reasons: [] });
    w.stop();
  });

  it("a switch to another release makes it not current and draining within one poll", async () => {
    current = { releaseKey: OWN, takeTrafficFrom: new Date(START - 60_000) };
    const w = watcher(true);
    await w.start();
    w.markBooted();
    expect(w.ownIsCurrent()).toBe(true);
    current = { releaseKey: NEXT, takeTrafficFrom: new Date(START) };
    await advance(RELEASE_WATCH_POLL_MS);
    expect(w.ownIsCurrent()).toBe(false);
    expect(w.draining()).toBe(true);
    expect(w.readiness().reasons).toContain("NOT_CURRENT");
    w.stop();
  });

  it("a staged release that is not yet current reports only NOT_CURRENT", async () => {
    current = { releaseKey: NEXT, takeTrafficFrom: new Date(START - 60_000) };
    const w = watcher(true);
    await w.start();
    w.markBooted();
    expect(w.readiness()).toEqual({ ready: false, releaseKey: OWN, reasons: ["NOT_CURRENT"] });
    w.stop();
  });

  it("beginDrain makes it draining even while current, and stays so", async () => {
    current = { releaseKey: OWN, takeTrafficFrom: new Date(START - 60_000) };
    const w = watcher(true);
    await w.start();
    w.markBooted();
    w.beginDrain();
    expect(w.ownIsCurrent()).toBe(true);
    expect(w.draining()).toBe(true);
    expect(w.readiness().reasons).toEqual(["DRAINING"]);
    await advance(3 * RELEASE_WATCH_POLL_MS);
    expect(w.draining()).toBe(true);
    w.stop();
  });

  it("lists every reason in the fixed order", async () => {
    current = { releaseKey: NEXT, takeTrafficFrom: null };
    const w = watcher(true);
    await w.start();
    w.beginDrain();
    failing = true;
    await advance(RELEASE_WATCH_STALE_MS + 1);
    expect(w.readiness().reasons).toEqual(["BOOTING", "DATABASE_UNREACHABLE", "DRAINING", "NOT_CURRENT"]);
    w.stop();
  });

  it("onBecameCurrent fires at start when current, again after not-current then current, never twice without a change", async () => {
    current = { releaseKey: OWN, takeTrafficFrom: new Date(START - 60_000) };
    const w = watcher(true);
    let fired = 0;
    const off = w.onBecameCurrent(() => { fired += 1; });
    await w.start();
    expect(fired).toBe(1);
    await advance(3 * RELEASE_WATCH_POLL_MS);
    expect(fired).toBe(1);
    current = { releaseKey: NEXT, takeTrafficFrom: new Date(START) };
    await advance(RELEASE_WATCH_POLL_MS);
    expect(fired).toBe(1);
    current = { releaseKey: OWN, takeTrafficFrom: new Date(START) };
    await advance(RELEASE_WATCH_POLL_MS);
    expect(fired).toBe(2);
    await advance(3 * RELEASE_WATCH_POLL_MS);
    expect(fired).toBe(2);
    off();
    current = { releaseKey: NEXT, takeTrafficFrom: new Date(START) };
    await advance(RELEASE_WATCH_POLL_MS);
    current = { releaseKey: OWN, takeTrafficFrom: new Date(START) };
    await advance(RELEASE_WATCH_POLL_MS);
    expect(fired).toBe(2);
    w.stop();
  });

  it("a listener registered after start while current fires once at once, and later polls do not fire it again", async () => {
    current = { releaseKey: OWN, takeTrafficFrom: new Date(START - 60_000) };
    const w = watcher(true);
    await w.start();
    let fired = 0;
    w.onBecameCurrent(() => { fired += 1; });
    expect(fired).toBe(1);
    await advance(3 * RELEASE_WATCH_POLL_MS);
    expect(fired).toBe(1);
    w.stop();
  });

  it("a listener registered while not current does not fire until the release becomes current", async () => {
    current = { releaseKey: NEXT, takeTrafficFrom: new Date(START - 60_000) };
    const w = watcher(true);
    await w.start();
    let fired = 0;
    w.onBecameCurrent(() => { fired += 1; });
    expect(fired).toBe(0);
    current = { releaseKey: OWN, takeTrafficFrom: new Date(START) };
    await advance(RELEASE_WATCH_POLL_MS);
    expect(fired).toBe(1);
    w.stop();
  });

  it("a wall clock stepped back before the last read counts that read as stale (fail closed)", async () => {
    const w = watcher(false);
    await w.start();
    expect(w.ownIsCurrent()).toBe(true);
    now -= 1;
    expect(w.ownIsCurrent()).toBe(false);
    expect(w.readiness().reasons).toContain("DATABASE_UNREACHABLE");
    // Stale, not forgotten: the last successful answer (this release) still says "not draining".
    expect(w.draining()).toBe(false);
    expect(w.readiness().reasons).not.toContain("NOT_CURRENT");
    w.stop();
  });

  it("a wall clock stepped back keeps the last successful answer for draining and NOT_CURRENT while freshness stays false", async () => {
    current = { releaseKey: NEXT, takeTrafficFrom: new Date(START - 60_000) };
    const w = watcher(true);
    await w.start();
    w.markBooted();
    expect(w.draining()).toBe(true);
    now -= 1;
    expect(w.ownIsCurrent()).toBe(false);
    expect(w.draining()).toBe(true);
    expect(w.readiness().reasons).toEqual(["DATABASE_UNREACHABLE", "NOT_CURRENT"]);
    w.stop();
  });

  it("a read that never returns is a failed read after staleMs, and the chain goes on to recover", async () => {
    let hang = true;
    let calls = 0;
    const stuck: ReleaseStateReader = {
      async readCurrent() {
        calls += 1;
        if (hang) return new Promise<never>(() => undefined);
        return null;
      },
      async readState() { return null; }
    };
    const w = new ReleaseWatcher({ releaseKey: OWN, hosted: false, reader: stuck, clock: () => now, log: (line) => lines.push(line) });
    const started = w.start();
    await advance(RELEASE_WATCH_STALE_MS);
    await started;
    expect(w.ownIsCurrent()).toBe(false);
    expect(lines.filter((line) => line.includes("READ_FAILED"))).toHaveLength(1);
    expect(lines.some((line) => line.includes("RELEASE_READ_TIMEOUT"))).toBe(true);
    hang = false;
    await advance(RELEASE_WATCH_STALE_MS + RELEASE_WATCH_POLL_MS);
    expect(calls).toBeGreaterThan(1);
    expect(w.ownIsCurrent()).toBe(true);
    w.stop();
  });

  it("a read that fails after stop prints no READ_FAILED", async () => {
    let reject: ((error: Error) => void) | undefined;
    const late: ReleaseStateReader = {
      async readCurrent() {
        if (reject === undefined) return null;
        return new Promise<never>((_, fail) => { reject = fail; });
      },
      async readState() { return null; }
    };
    const w = new ReleaseWatcher({ releaseKey: OWN, hosted: false, reader: late, clock: () => now, log: (line) => lines.push(line) });
    await w.start();
    reject = () => undefined;
    await advance(RELEASE_WATCH_POLL_MS);
    w.stop();
    reject(Object.assign(new Error("pool ended"), { code: "ECONNRESET" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(lines.some((line) => line.includes("READ_FAILED"))).toBe(false);
  });

  it("a timed-out read gives its client back destroyed, so hung reads never hold more than one connection", async () => {
    let out = 0;
    let most = 0;
    let destroyed = 0;
    let hang = true;
    const bounds: unknown[] = [];
    const pool = {
      async connect() {
        out += 1;
        most = Math.max(most, out);
        let released = false;
        const pending: ((error: Error) => void)[] = [];
        return {
          async query(text: string, values?: unknown[]) {
            if (released) throw new Error("client released");
            if (text.includes("set_config('statement_timeout'")) bounds.push(values?.[0]);
            if (text.includes("read_current_release") && hang) return new Promise<never>((_, reject) => { pending.push(reject); });
            return { rows: [] };
          },
          release(error?: Error) {
            if (released) return;
            released = true;
            out -= 1;
            if (error !== undefined) {
              destroyed += 1;
              for (const reject of pending) reject(error);
            }
          }
        };
      }
    };
    const w = new ReleaseWatcher({
      releaseKey: OWN, hosted: false, reader: new PostgresReleaseStateReader(pool as never), clock: () => now, log: (line) => lines.push(line)
    });
    const started = w.start();
    await advance(RELEASE_WATCH_STALE_MS);
    await started;
    await advance(3 * (RELEASE_WATCH_STALE_MS + RELEASE_WATCH_POLL_MS));
    expect(destroyed).toBeGreaterThanOrEqual(3);
    expect(most).toBe(1);
    expect(w.ownIsCurrent()).toBe(false);
    expect(bounds.length).toBeGreaterThanOrEqual(3);
    expect(bounds.every((bound) => bound === String(RELEASE_WATCH_STALE_MS))).toBe(true);
    hang = false;
    await advance(RELEASE_WATCH_STALE_MS + RELEASE_WATCH_POLL_MS);
    expect(w.ownIsCurrent()).toBe(true);
    expect(out).toBe(0);
    expect(most).toBe(1);
    w.stop();
  });

  it("a listener registered after stop never fires", async () => {
    const w = watcher(false);
    await w.start();
    w.stop();
    let fired = 0;
    w.onBecameCurrent(() => { fired += 1; });
    expect(fired).toBe(0);
  });

  it("a listener registered while the last read is stale fires on the next fresh current read", async () => {
    current = { releaseKey: OWN, takeTrafficFrom: new Date(START - 60_000) };
    const w = watcher(true);
    let early = 0;
    w.onBecameCurrent(() => { early += 1; });
    await w.start();
    failing = true;
    await advance(RELEASE_WATCH_STALE_MS + 1);
    let late = 0;
    w.onBecameCurrent(() => { late += 1; });
    expect(late).toBe(0);
    failing = false;
    await advance(RELEASE_WATCH_POLL_MS);
    expect(w.ownIsCurrent()).toBe(true);
    expect(late).toBe(1);
    expect(early).toBe(1);
    await advance(3 * RELEASE_WATCH_POLL_MS);
    expect(late).toBe(1);
    w.stop();
  });

  it("a stale read stepped back under staleMs by the clock stays stale until a new read", async () => {
    current = { releaseKey: OWN, takeTrafficFrom: new Date(START - 60_000) };
    const w = watcher(true);
    await w.start();
    failing = true;
    await advance(RELEASE_WATCH_STALE_MS + RELEASE_WATCH_POLL_MS);
    expect(w.ownIsCurrent()).toBe(false);
    now -= RELEASE_WATCH_STALE_MS; // the read's age drops back under staleMs
    expect(w.ownIsCurrent()).toBe(false);
    expect(w.readiness().reasons).toContain("DATABASE_UNREACHABLE");
    failing = false;
    await advance(RELEASE_WATCH_POLL_MS);
    expect(w.ownIsCurrent()).toBe(true);
    w.stop();
  });

  it("a listener that throws is logged by code and never stops the watcher or the other listeners", async () => {
    const w = watcher(false);
    let other = 0;
    w.onBecameCurrent(() => { throw new Error("private detail"); });
    w.onBecameCurrent(() => { other += 1; });
    await w.start();
    expect(other).toBe(1);
    expect(lines.some((line) => line.includes("LISTENER_FAILED"))).toBe(true);
    expect(lines.join("\n")).not.toContain("private detail");
    w.stop();
  });

  it("a first read that fails is recorded, never thrown", async () => {
    failing = true;
    const w = watcher(false);
    await expect(w.start()).resolves.toBeUndefined();
    expect(w.ownIsCurrent()).toBe(false);
    expect(w.draining()).toBe(false);
    expect(w.readiness().reasons).toEqual(["BOOTING", "DATABASE_UNREACHABLE"]);
    w.stop();
  });

  it("stop clears the timer: the reader sees no further call for ten polls", async () => {
    const w = watcher(false);
    await w.start();
    await advance(2 * RELEASE_WATCH_POLL_MS);
    w.stop();
    const seen = reads;
    await advance(10 * RELEASE_WATCH_POLL_MS);
    expect(reads).toBe(seen);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("polls never overlap: a slow read delays the next poll instead of starting a second one", async () => {
    let inFlight = 0;
    let most = 0;
    const slow: ReleaseStateReader = {
      async readCurrent() {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2_500));
        inFlight -= 1;
        return null;
      },
      async readState() { return null; }
    };
    const w = new ReleaseWatcher({ releaseKey: OWN, hosted: false, reader: slow, clock: () => now, log: () => undefined });
    const started = w.start();
    await advance(2_500);
    await started;
    await advance(10_000);
    expect(most).toBe(1);
    w.stop();
  });

  it("main.ts builds it on the runtime pool, starts it before the first background pass, stops it first and marks boot last", () => {
    const source = readFileSync(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    expect(source).toContain("reader: new PostgresReleaseStateReader(pool)");
    expect(source).toContain('hosted: environment.DEPLOYMENT_MODE === "hosted"');
    expect(source).toContain("releaseKey: environment.RELEASE_KEY,");
    const start = source.indexOf('await boot.run("release-watcher", () => releaseWatcher.start());');
    expect(start).toBeGreaterThan(source.indexOf("const releaseWatcher = new ReleaseWatcher("));
    expect(start).toBeLessThan(source.indexOf('await boot.run("publication-key-cleanup"'));
    const pools = source.indexOf("databasePools: [", source.indexOf("installStartupResourceOwner({"));
    const stop = source.indexOf("{ end: async () => { releaseWatcher.stop(); } },", pools);
    expect(stop).toBeGreaterThan(pools);
    expect(stop).toBeLessThan(source.indexOf("    pool,", pools));
    expect(source.trimEnd().endsWith("releaseWatcher.markBooted();")).toBe(true);
    expect(source.indexOf("releaseWatcher.markBooted();")).toBeGreaterThan(source.indexOf("triggerEmailRecoveryReconciliation?.();"));
  });

  it("main.ts hands the watcher's drain to the shutdown lifecycle (plan C6)", () => {
    const source = readFileSync(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    const owner = source.indexOf("installStartupResourceOwner({");
    const drain = source.indexOf("drain: { begin: () => releaseWatcher.beginDrain() },", owner);
    expect(drain).toBeGreaterThan(owner);
    expect(drain).toBeLessThan(source.indexOf("databasePools: [", owner));
  });
});
