import { describe, expect, it } from "vitest";
import type { DispatchableWorkItem } from "@debateai/battery";
import { LAPSED_RESEND, startLapsedClaimResend } from "../../apps/runner/src/runner-lapsed-resend.js";

/**
 * Side-by-side spec §2 (INTERFACE constants, plan B D4): today only a fresh runner start re-sends lapsed claims, so a
 * debate whose copy died stays stuck until the next restart. Each release's runner now re-sends its own lapsed CLAIMED
 * items every five minutes, at most 100 per pass, under its own task name, and not while it retires.
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

const item = (n: number): DispatchableWorkItem => Object.freeze({
  runId: `run-${n}`,
  workItemId: `work-${n}`
});

function harness(options: Readonly<{
  list?: () => Promise<readonly DispatchableWorkItem[]>;
  dispatch?: (entry: DispatchableWorkItem) => Promise<void>;
  paused?: () => boolean;
}> = {}) {
  const time = fakeClock();
  const listCalls: Array<Readonly<{ limit: number; at: number }>> = [];
  const dispatched: string[] = [];
  const lines: Array<Readonly<Record<string, string | number>>> = [];
  const resend = startLapsedClaimResend({
    work: {
      listLapsedClaimed: async (limit) => {
        listCalls.push({ limit, at: time.now() });
        return options.list === undefined ? [] : options.list();
      }
    },
    dispatch: async (entry) => {
      dispatched.push(entry.workItemId);
      if (options.dispatch !== undefined) await options.dispatch(entry);
    },
    paused: options.paused ?? (() => false),
    log: (line) => { lines.push(line); },
    clock: time.clock
  });
  return { time, resend, listCalls, dispatched, lines };
}

describe("lapsed claims are re-sent by their own release every five minutes (side-by-side §2, INTERFACE constants)", () => {
  it("re-sends every five minutes, at most 100 per pass", () => {
    expect(LAPSED_RESEND).toEqual({ everyMs: 300_000, limit: 100 });
    expect(Object.isFrozen(LAPSED_RESEND)).toBe(true);
  });

  it("lists nothing before the first five minutes are up", async () => {
    const { time, listCalls } = harness();
    await time.advance(299_999);
    expect(listCalls).toEqual([]);
  });

  it("at five minutes lists one more than the limit and re-sends what it gets, in order, with one count line", async () => {
    const { time, listCalls, dispatched, lines } = harness({ list: async () => [item(1), item(2)] });
    await time.advance(300_000);
    expect(listCalls).toEqual([{ limit: 101, at: 300_000 }]);
    expect(dispatched).toEqual(["work-1", "work-2"]);
    expect(lines).toEqual([{ kind: "DEBATEAI_RUNNER_RESEND", event: "LAPSED_RESENT", count: 2 }]);
  });

  it("writes no line when nothing has lapsed", async () => {
    const { time, listCalls, lines } = harness();
    await time.advance(300_000);
    expect(listCalls).toHaveLength(1);
    expect(lines).toEqual([]);
  });

  it("a list of 101 re-sends the first 100 and says the pass was saturated", async () => {
    const lapsed = Array.from({ length: 101 }, (_, index) => item(index + 1));
    const { time, dispatched, lines } = harness({ list: async () => lapsed });
    await time.advance(300_000);
    expect(dispatched).toEqual(lapsed.slice(0, 100).map((entry) => entry.workItemId));
    expect(lines).toContainEqual({ kind: "DEBATEAI_RUNNER_RESEND", event: "LAPSED_RESEND_SATURATED", listed: 101 });
    expect(lines).toContainEqual({ kind: "DEBATEAI_RUNNER_RESEND", event: "LAPSED_RESENT", count: 100 });
  });

  it("a re-send that fails is logged by its work item, and the next items are still sent", async () => {
    const { time, dispatched, lines } = harness({
      list: async () => [item(1), item(2), item(3)],
      dispatch: async (entry) => {
        if (entry.workItemId === "work-1") throw new Error("hatchet refused");
      }
    });
    await time.advance(300_000);
    expect(dispatched).toEqual(["work-1", "work-2", "work-3"]);
    expect(lines).toEqual([
      { kind: "DEBATEAI_RUNNER_RESEND", event: "LAPSED_RESEND_FAILED", workItemId: "work-1" },
      { kind: "DEBATEAI_RUNNER_RESEND", event: "LAPSED_RESENT", count: 2 }
    ]);
  });

  it("lists nothing while this release retires, and lists again at the next tick once it is not paused", async () => {
    let paused = true;
    const { time, listCalls } = harness({ paused: () => paused });
    await time.advance(300_000);
    expect(listCalls).toEqual([]);
    paused = false;
    await time.advance(300_000);
    expect(listCalls).toEqual([{ limit: 101, at: 600_000 }]);
  });

  it("a list that fails is logged with its SQLSTATE only, and the next tick still runs", async () => {
    let calls = 0;
    const { time, listCalls, lines } = harness({
      list: async () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("terminating connection"), { code: "57P01" });
        return [];
      }
    });
    await time.advance(300_000);
    expect(lines).toEqual([{ kind: "DEBATEAI_RUNNER_RESEND", event: "LAPSED_RESEND_READ_FAILED", sqlState: "57P01" }]);
    await time.advance(300_000);
    expect(listCalls.map((call) => call.at)).toEqual([300_000, 600_000]);
  });

  it("a list that fails without a SQLSTATE is logged without one", async () => {
    const { time, lines } = harness({ list: async () => { throw new Error("pool closed"); } });
    await time.advance(300_000);
    expect(lines).toEqual([{ kind: "DEBATEAI_RUNNER_RESEND", event: "LAPSED_RESEND_READ_FAILED" }]);
  });

  it("ticks never overlap: a list that takes 400 s is followed by the next five minutes after it finished", async () => {
    const time = fakeClock();
    const listStarts: number[] = [];
    const limits: number[] = [];
    startLapsedClaimResend({
      work: {
        listLapsedClaimed: (limit) => {
          listStarts.push(time.now());
          limits.push(limit);
          if (listStarts.length > 1) return Promise.resolve([]);
          return new Promise((resolve) => { time.clock.setTimeout(() => resolve([]), 400_000); });
        }
      },
      dispatch: async () => undefined,
      paused: () => false,
      log: () => undefined,
      clock: time.clock
    });
    await time.advance(999_999);
    expect(listStarts).toEqual([300_000]);
    await time.advance(1);
    expect(listStarts).toEqual([300_000, 1_000_000]);
    expect(limits).toEqual([101, 101]);
  });

  it("a re-send that never settles is given up after five minutes: logged, the next item sent, the timer goes on", async () => {
    let calls = 0;
    const { time, listCalls, dispatched, lines } = harness({
      list: async () => {
        calls += 1;
        return calls === 1 ? [item(1), item(2)] : [];
      },
      dispatch: (entry) => entry.workItemId === "work-1" ? new Promise<void>(() => undefined) : Promise.resolve()
    });
    await time.advance(300_000);
    expect(dispatched).toEqual(["work-1"]);
    expect(lines).toEqual([]);
    await time.advance(299_999);
    expect(dispatched).toEqual(["work-1"]);
    await time.advance(1);
    expect(dispatched).toEqual(["work-1", "work-2"]);
    expect(lines).toEqual([
      { kind: "DEBATEAI_RUNNER_RESEND", event: "LAPSED_RESEND_FAILED", workItemId: "work-1" },
      { kind: "DEBATEAI_RUNNER_RESEND", event: "LAPSED_RESENT", count: 1 }
    ]);
    await time.advance(300_000);
    expect(listCalls.map((call) => call.at)).toEqual([300_000, 900_000]);
  });

  it("stop() ends the re-send: no further list", async () => {
    const { time, resend, listCalls } = harness();
    await time.advance(300_000);
    resend.stop();
    await time.advance(900_000);
    expect(listCalls.map((call) => call.at)).toEqual([300_000]);
  });

  it("stop() during a pass keeps the pass from arming another", async () => {
    let finish: (rows: readonly DispatchableWorkItem[]) => void = () => undefined;
    const { time, resend, listCalls } = harness({
      list: () => new Promise((resolve) => { finish = resolve; })
    });
    await time.advance(300_000);
    resend.stop();
    finish([]);
    await time.advance(900_000);
    expect(listCalls.map((call) => call.at)).toEqual([300_000]);
  });
});
