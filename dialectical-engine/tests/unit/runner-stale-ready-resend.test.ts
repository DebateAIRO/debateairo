import { describe, expect, it, vi } from "vitest";
import type { ReadyWorkItem } from "@debateai/battery";
import { TypedDomainError } from "@debateai/kernel";
import { STALE_READY_RESEND, startStaleReadyResend } from "../../apps/runner/src/runner-lapsed-resend.js";
import { staleReadyDayAdmission, type RunnerVersionSettings } from "../../apps/runner/src/run-settings.js";
import { RUNNER_QUEUE_WAIT_LIMIT } from "../../apps/runner/src/index.js";

/**
 * NV-25 (security audit run 3): without the room nothing re-sent a READY job that Hatchet had given up after its
 * 30-minute queue wait, so it stayed READY until a runner restart. Each release's runner now re-sends its own READY
 * items once it has seen them READY (or last sent them) at least 35 minutes ago: first admitted again by the run's own
 * version's daily guard, at most the worker's free places per pass, never while it retires.
 */

type Timer = { at: number; callback: () => void };

/** A hand-driven clock: `advance` runs every due timer in time order and lets the promises they start settle. */
function fakeClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, Timer>();
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
  return {
    clock: Object.freeze({
      setTimeout(callback: () => void, ms: number): unknown {
        nextId += 1;
        timers.set(nextId, { at: now + ms, callback });
        return nextId;
      },
      clearTimeout(handle: unknown): void {
        timers.delete(handle as number);
      }
    }),
    now: () => now,
    async advance(ms: number): Promise<void> {
      const until = now + ms;
      for (;;) {
        await settle();
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= until)
          .sort(([leftId, left], [rightId, right]) => left.at - right.at || leftId - rightId)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = until;
      await settle();
    }
  };
}

const MINUTE = 60_000;
const KIND = "DEBATEAI_RUNNER_RESEND";

const item = (n: number): ReadyWorkItem => Object.freeze({ runId: `run-${n}`, workItemId: `work-${n}`, registerVersion: 1 });
const items = (count: number): readonly ReadyWorkItem[] => Array.from({ length: count }, (_, index) => item(index + 1));

function harness(options: Readonly<{
  list?: (limit: number) => Promise<readonly ReadyWorkItem[]>;
  admit?: (entry: ReadyWorkItem) => Promise<boolean>;
  capacity?: () => number;
  dispatch?: (entry: ReadyWorkItem) => Promise<void>;
  paused?: () => boolean;
  running?: (workItemId: string) => boolean;
  now?: () => number;
  time?: ReturnType<typeof fakeClock>;
}> = {}) {
  const time = options.time ?? fakeClock();
  const listCalls: Array<Readonly<{ limit: number; at: number }>> = [];
  const admitted: string[] = [];
  const dispatched: string[] = [];
  const lines: Array<Readonly<Record<string, string | number>>> = [];
  const resend = startStaleReadyResend({
    work: {
      listReady: async (limit: number) => {
        listCalls.push({ limit, at: time.now() });
        return options.list === undefined ? [] : options.list(limit);
      }
    },
    admit: async (entry: ReadyWorkItem) => {
      admitted.push(entry.workItemId);
      return options.admit === undefined ? true : options.admit(entry);
    },
    capacity: options.capacity ?? (() => 100),
    dispatch: async (entry: ReadyWorkItem) => {
      dispatched.push(entry.workItemId);
      if (options.dispatch !== undefined) await options.dispatch(entry);
    },
    paused: options.paused ?? (() => false),
    running: options.running ?? (() => false),
    log: (line: Readonly<Record<string, string | number>>) => { lines.push(line); },
    clock: time.clock,
    now: options.now ?? time.now
  });
  return { time, resend, listCalls, admitted, dispatched, lines };
}

describe("READY work Hatchet gave up is re-sent by its own release, admitted by the day (NV-25)", () => {
  it("passes every five minutes, sends after 35 minutes, at most 100 per pass", () => {
    expect(STALE_READY_RESEND).toEqual({ everyMs: 300_000, staleAfterMs: 2_100_000, limit: 100 });
    expect(Object.isFrozen(STALE_READY_RESEND)).toBe(true);
  });

  it("waits Hatchet's queue-wait limit plus one pass", () => {
    expect(RUNNER_QUEUE_WAIT_LIMIT.endsWith("m")).toBe(true);
    expect(Number(RUNNER_QUEUE_WAIT_LIMIT.slice(0, -1)) * MINUTE + STALE_READY_RESEND.everyMs)
      .toBe(STALE_READY_RESEND.staleAfterMs);
  });

  it("first sees an item at 5 minutes, admits and sends it once at 40, and not again until 75", async () => {
    const { time, listCalls, admitted, dispatched, lines } = harness({ list: async () => [item(1)] });
    await time.advance(5 * MINUTE);
    expect(listCalls).toEqual([{ limit: 101, at: 5 * MINUTE }]);
    await time.advance(30 * MINUTE);
    expect(listCalls.map((call) => call.at)).toEqual([5, 10, 15, 20, 25, 30, 35].map((at) => at * MINUTE));
    expect(admitted).toEqual([]);
    expect(dispatched).toEqual([]);
    expect(lines).toEqual([]);
    await time.advance(5 * MINUTE);
    expect(admitted).toEqual(["work-1"]);
    expect(dispatched).toEqual(["work-1"]);
    expect(lines).toEqual([{ kind: KIND, event: "STALE_READY_RESENT", count: 1 }]);
    await time.advance(30 * MINUTE);
    expect(dispatched).toEqual(["work-1"]);
    await time.advance(5 * MINUTE);
    expect(admitted).toEqual(["work-1", "work-1"]);
    expect(dispatched).toEqual(["work-1", "work-1"]);
  });

  it("a list of 101 says each pass was saturated; at 40 minutes exactly the oldest 100 go, in order", async () => {
    const ready = items(101);
    const { time, listCalls, admitted, dispatched, lines } = harness({ list: async () => ready });
    await time.advance(5 * MINUTE);
    expect(listCalls).toEqual([{ limit: 101, at: 5 * MINUTE }]);
    expect(lines).toEqual([{ kind: KIND, event: "STALE_READY_RESEND_SATURATED", listed: 101 }]);
    await time.advance(35 * MINUTE);
    expect(lines.filter((line) => line.event === "STALE_READY_RESEND_SATURATED")).toHaveLength(8);
    const oldest = ready.slice(0, 100).map((entry) => entry.workItemId);
    expect(admitted).toEqual(oldest);
    expect(dispatched).toEqual(oldest);
    expect(admitted).not.toContain("work-101");
    expect(dispatched).not.toContain("work-101");
    expect(lines.at(-1)).toEqual({ kind: KIND, event: "STALE_READY_RESENT", count: 100 });
  });

  it("sends at most the worker's free places per pass; the rest go at the next pass with no further wait", async () => {
    const { time, admitted, dispatched, lines } = harness({ list: async () => items(5), capacity: () => 3 });
    await time.advance(40 * MINUTE);
    expect(admitted).toEqual(["work-1", "work-2", "work-3"]);
    expect(dispatched).toEqual(["work-1", "work-2", "work-3"]);
    expect(lines).toEqual([
      { kind: KIND, event: "STALE_READY_RESEND_DEFERRED", count: 2 },
      { kind: KIND, event: "STALE_READY_RESENT", count: 3 }
    ]);
    await time.advance(5 * MINUTE);
    expect(dispatched).toEqual(["work-1", "work-2", "work-3", "work-4", "work-5"]);
    expect(lines.at(-1)).toEqual({ kind: KIND, event: "STALE_READY_RESENT", count: 2 });
  });

  it("with no free place nothing is admitted", async () => {
    const { time, admitted, dispatched, lines } = harness({ list: async () => items(5), capacity: () => 0 });
    await time.advance(40 * MINUTE);
    expect(admitted).toEqual([]);
    expect(dispatched).toEqual([]);
    expect(lines).toEqual([{ kind: KIND, event: "STALE_READY_RESEND_DEFERRED", count: 5 }]);
  });

  it("a capacity that throws or is not a number gives no free place", async () => {
    const throwing = harness({ list: async () => items(2), capacity: () => { throw new Error("counter"); } });
    await throwing.time.advance(40 * MINUTE);
    expect(throwing.admitted).toEqual([]);
    const notANumber = harness({ list: async () => items(2), capacity: () => Number.NaN });
    await notANumber.time.advance(40 * MINUTE);
    expect(notANumber.admitted).toEqual([]);
  });

  it("a day that is reached sends nothing and stops the pass; the item goes at once when the day admits again", async () => {
    let open = false;
    const { time, admitted, dispatched, lines } = harness({ list: async () => items(2), admit: async () => open });
    await time.advance(40 * MINUTE);
    expect(admitted).toEqual(["work-1"]);
    expect(dispatched).toEqual([]);
    expect(lines).toEqual([{ kind: KIND, event: "STALE_READY_RESEND_NOT_ADMITTED", workItemId: "work-1" }]);
    open = true;
    await time.advance(5 * MINUTE);
    expect(admitted).toEqual(["work-1", "work-1", "work-2"]);
    expect(dispatched).toEqual(["work-1", "work-2"]);
    expect(lines.at(-1)).toEqual({ kind: KIND, event: "STALE_READY_RESENT", count: 2 });
  });

  it("an admission that fails is logged with its SQLSTATE only, and nothing is sent", async () => {
    const { time, admitted, dispatched, lines } = harness({
      list: async () => items(2),
      admit: async () => { throw Object.assign(new Error("terminating connection"), { code: "57P01" }); }
    });
    await time.advance(40 * MINUTE);
    expect(admitted).toEqual(["work-1"]);
    expect(dispatched).toEqual([]);
    expect(lines).toEqual([{ kind: KIND, event: "STALE_READY_RESEND_ADMIT_FAILED", sqlState: "57P01" }]);
  });

  it("an item that leaves the listing and comes back is first seen again", async () => {
    let pass = 0;
    const { time, dispatched } = harness({
      list: async () => {
        pass += 1;
        return pass === 2 ? [] : [item(1)];
      }
    });
    await time.advance(45 * MINUTE);
    expect(dispatched).toEqual([]);
    await time.advance(5 * MINUTE);
    expect(dispatched).toEqual(["work-1"]);
  });

  it("never admits or sends an item a task of this process is running, and counts the skip", async () => {
    const { time, admitted, dispatched, lines } = harness({
      list: async () => [item(1)],
      running: (workItemId: string) => workItemId === "work-1"
    });
    await time.advance(40 * MINUTE);
    expect(admitted).toEqual([]);
    expect(dispatched).toEqual([]);
    expect(lines).toHaveLength(8);
    expect(new Set(lines.map((line) => JSON.stringify(line))))
      .toEqual(new Set([JSON.stringify({ kind: KIND, event: "STALE_READY_RESEND_SKIPPED_RUNNING", count: 1 })]));
  });

  it("lists nothing while this release retires", async () => {
    const { time, listCalls, dispatched } = harness({ list: async () => [item(1)], paused: () => true });
    await time.advance(45 * MINUTE);
    expect(listCalls).toEqual([]);
    expect(dispatched).toEqual([]);
  });

  it("stop() ends the re-send: no further pass", async () => {
    const { time, resend, listCalls } = harness({ list: async () => [item(1)] });
    await time.advance(5 * MINUTE);
    resend.stop();
    await time.advance(60 * MINUTE);
    expect(listCalls.map((call) => call.at)).toEqual([5 * MINUTE]);
  });

  it("a list that fails is logged with its SQLSTATE only, and the next pass still runs", async () => {
    let calls = 0;
    const { time, listCalls, lines } = harness({
      list: async () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("terminating connection"), { code: "57P01" });
        return [];
      }
    });
    await time.advance(5 * MINUTE);
    expect(lines).toEqual([{ kind: KIND, event: "STALE_READY_RESEND_READ_FAILED", sqlState: "57P01" }]);
    await time.advance(5 * MINUTE);
    expect(listCalls.map((call) => call.at)).toEqual([5 * MINUTE, 10 * MINUTE]);
  });

  it("a send that fails stops the pass; that item waits another 35 minutes, the next goes at the next pass", async () => {
    const { time, admitted, dispatched, lines } = harness({
      list: async () => items(2),
      dispatch: async (entry: ReadyWorkItem) => {
        if (entry.workItemId === "work-1" && dispatched.length === 1) throw new Error("hatchet refused");
      }
    });
    await time.advance(40 * MINUTE);
    expect(admitted).toEqual(["work-1"]);
    expect(dispatched).toEqual(["work-1"]);
    expect(lines).toEqual([{ kind: KIND, event: "STALE_READY_RESEND_FAILED", workItemId: "work-1" }]);
    await time.advance(5 * MINUTE);
    expect(admitted).toEqual(["work-1", "work-2"]);
    expect(dispatched).toEqual(["work-1", "work-2"]);
    await time.advance(25 * MINUTE);
    expect(admitted).toEqual(["work-1", "work-2"]);
    await time.advance(5 * MINUTE);
    expect(admitted).toEqual(["work-1", "work-2", "work-1"]);
    expect(dispatched).toEqual(["work-1", "work-2", "work-1"]);
  });

  it("a send that never settles is given up after five minutes and stops the pass the same way", async () => {
    const { time, admitted, dispatched, lines } = harness({
      list: async () => items(2),
      dispatch: (entry: ReadyWorkItem) => entry.workItemId === "work-1" ? new Promise<void>(() => undefined) : Promise.resolve()
    });
    await time.advance(40 * MINUTE);
    expect(admitted).toEqual(["work-1"]);
    expect(lines).toEqual([]);
    await time.advance(5 * MINUTE);
    expect(admitted).toEqual(["work-1"]);
    expect(lines).toEqual([{ kind: KIND, event: "STALE_READY_RESEND_FAILED", workItemId: "work-1" }]);
    await time.advance(5 * MINUTE);
    expect(admitted).toEqual(["work-1", "work-2"]);
    expect(dispatched).toEqual(["work-1", "work-2"]);
  });

  it("reads the instant for each item at its attempt, after its admission and before its send", async () => {
    const time = fakeClock();
    const order: Array<readonly [string, string | number]> = [];
    let recording = false;
    harness({
      time,
      list: async () => items(2),
      now: () => {
        if (recording) order.push(["now", time.now()]);
        return time.now();
      },
      admit: async (entry: ReadyWorkItem) => {
        if (recording) order.push(["admit", entry.workItemId]);
        return true;
      },
      dispatch: (entry: ReadyWorkItem) => {
        if (recording) order.push(["dispatch", entry.workItemId]);
        return entry.workItemId === "work-1"
          ? new Promise<void>((resolve) => { time.clock.setTimeout(resolve, 4 * MINUTE); })
          : Promise.resolve();
      }
    });
    await time.advance(35 * MINUTE);
    recording = true;
    await time.advance(9 * MINUTE);
    expect(order).toEqual([
      ["now", 40 * MINUTE], ["admit", "work-1"], ["now", 40 * MINUTE], ["dispatch", "work-1"],
      ["now", 44 * MINUTE], ["admit", "work-2"], ["now", 44 * MINUTE], ["dispatch", "work-2"]
    ]);
  });
});

describe("staleReadyDayAdmission asks the run's own version's daily guard (NV-25)", () => {
  const settingsOf = (version: unknown) => ({
    settingsFor: vi.fn(async (_version: number) => ({ kind: "SETTINGS" as const, version: version as RunnerVersionSettings }))
  });
  const guarded = (assertDailyEnvelopeAdmitsNewRun: () => Promise<void>) =>
    settingsOf({ costEnvelope: { policy: {}, guard: { assertDailyEnvelopeAdmitsNewRun } } });

  it("admits a version this release cannot run, without asking any guard", async () => {
    const settingsFor = vi.fn(async (_version: number) => ({ kind: "UNSUPPORTED" as const, code: "SETTINGS_VERSION_UNSUPPORTED" }));
    await expect(staleReadyDayAdmission({ cache: { settingsFor }, hosted: true })({ registerVersion: 7 })).resolves.toBe(true);
    expect(settingsFor.mock.calls).toEqual([[7]]);
  });

  it("admits a version without a guard in local mode only", async () => {
    const cache = settingsOf({ costEnvelope: null });
    await expect(staleReadyDayAdmission({ cache, hosted: false })({ registerVersion: 1 })).resolves.toBe(true);
    await expect(staleReadyDayAdmission({ cache, hosted: true })({ registerVersion: 1 })).resolves.toBe(false);
  });

  it("admits when the day admits a new run", async () => {
    const assert = vi.fn(async () => undefined);
    const cache = guarded(assert);
    await expect(staleReadyDayAdmission({ cache, hosted: true })({ registerVersion: 3 })).resolves.toBe(true);
    expect(assert).toHaveBeenCalledTimes(1);
    expect(cache.settingsFor.mock.calls).toEqual([[3]]);
  });

  it("refuses when the day is reached", async () => {
    const cache = guarded(async () => { throw new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "spent"); });
    await expect(staleReadyDayAdmission({ cache, hosted: true })({ registerVersion: 1 })).resolves.toBe(false);
  });

  it("passes any other failure on", async () => {
    const failure = Object.assign(new Error("terminating connection"), { code: "57P01" });
    const cache = guarded(async () => { throw failure; });
    await expect(staleReadyDayAdmission({ cache, hosted: true })({ registerVersion: 1 })).rejects.toBe(failure);
  });
});
