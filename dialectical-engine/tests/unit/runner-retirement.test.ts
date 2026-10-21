import { describe, expect, it } from "vitest";
import {
  createRunnerRetirementSignal,
  createTaskExecutionCounter,
  RUNNER_RETIRED_PROCESS_EVENT,
  RUNNER_RETIREMENT_TIMING,
  startRunnerRetirement,
  type ReleaseRetirementFacts
} from "../../apps/runner/src/runner-retirement.js";

/**
 * Side-by-side spec §4: a retiring release stops claiming and lets the calls in flight settle, and the hand-over waits
 * until no task of it is running. The counter counts the running tasks (each whole task handler, the verdict story
 * included); the signal carries the two stops, which start off and never go back.
 */
describe("the task counter and the retirement signal (side-by-side §4)", () => {
  it("counts each entered task until it leaves, and a second leave of the same task changes nothing", () => {
    const executions = createTaskExecutionCounter();
    expect(executions.count()).toBe(0);
    const leaveFirst = executions.enter();
    executions.enter();
    expect(executions.count()).toBe(2);
    leaveFirst();
    expect(executions.count()).toBe(1);
    leaveFirst();
    expect(executions.count()).toBe(1);
  });

  it("starts with claims and calls allowed, and each stop turns on only its own half", () => {
    const signal = createRunnerRetirementSignal();
    expect(signal.claimsStopped()).toBe(false);
    expect(signal.callsStopped()).toBe(false);
    signal.stopClaims();
    expect(signal.claimsStopped()).toBe(true);
    expect(signal.callsStopped()).toBe(false);
    signal.stopCalls();
    expect(signal.callsStopped()).toBe(true);
    expect(signal.claimsStopped()).toBe(true);
  });

  it("never goes back: stopping again keeps both stops on", () => {
    const signal = createRunnerRetirementSignal();
    signal.stopCalls();
    signal.stopClaims();
    signal.stopCalls();
    signal.stopClaims();
    expect(signal.claimsStopped()).toBe(true);
    expect(signal.callsStopped()).toBe(true);
  });
});

type Timer = { at: number; callback: () => void };

/** A hand-driven clock: `advance` runs every due timer in time order and lets the promises they start settle. */
function fakeClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, Timer>();
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
  return {
    clock: Object.freeze({
      now: () => now,
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

const KEY = ["r1", "aaaaaaaaaaaa"].join("-");
const drained = (overrides: Partial<ReleaseRetirementFacts> = {}): ReleaseRetirementFacts => Object.freeze({
  state: "DRAINING", frontPairStopped: true, retireRequested: false, openWork: 0, ...overrides
});

/**
 * The monitor over a scripted store: `facts(n)` answers the n-th read (1-based), `running(n)` is the task count at
 * that read. Every outside effect is recorded in one list, in the order it happened.
 */
function monitor(options: Readonly<{
  facts: (read: number) => Promise<ReleaseRetirementFacts>;
  running?: (read: number) => number;
}>) {
  const time = fakeClock();
  const signal = createRunnerRetirementSignal();
  const reads: Array<Readonly<{ key: string; at: number }>> = [];
  const order: string[] = [];
  const lines: Array<Readonly<Record<string, string | number>>> = [];
  const announced: Array<Readonly<{ line: string; claimsStopped: boolean }>> = [];
  const emitted: Array<Readonly<{ releaseKey: string }>> = [];
  let outcome: string | undefined;
  const retirement = startRunnerRetirement({
    releaseKey: KEY,
    store: {
      readFacts: (releaseKey) => {
        reads.push({ key: releaseKey, at: time.now() });
        return options.facts(reads.length);
      }
    },
    executions: { count: () => (options.running ?? (() => 0))(reads.length) },
    signal,
    stopWorker: async () => { order.push("stopWorker"); },
    log: (line) => { lines.push(line); },
    announce: (line) => { order.push("announce"); announced.push({ line, claimsStopped: signal.claimsStopped() }); },
    emit: (payload) => { order.push("emit"); emitted.push(payload); },
    clock: time.clock
  });
  void retirement.retired.then((how) => { outcome = how; });
  return { time, signal, retirement, reads, order, lines, announced, emitted, outcome: () => outcome };
}

describe("a draining release's runner retires by itself (side-by-side §4)", () => {
  it("names the event and the timing exactly (INTERFACE: retirement poll 60 s, settle 1,200 s)", () => {
    expect(RUNNER_RETIRED_PROCESS_EVENT).toBe("debateai:runner-retired");
    expect(RUNNER_RETIREMENT_TIMING).toEqual({ pollMs: 60_000, settleMs: 1_200_000, settleCheckMs: 5_000 });
    expect(Object.isFrozen(RUNNER_RETIREMENT_TIMING)).toBe(true);
  });

  it("a CURRENT release with no work and nothing running is never retired", async () => {
    const run = monitor({ facts: async () => drained({ state: "CURRENT" }) });
    await run.time.advance(180_000);
    expect(run.reads).toEqual([{ key: KEY, at: 60_000 }, { key: KEY, at: 120_000 }, { key: KEY, at: 180_000 }]);
    expect(run.order).toEqual([]);
    expect(run.lines).toEqual([]);
    expect(run.signal.claimsStopped()).toBe(false);
    expect(run.outcome()).toBeUndefined();
  });

  it("a DRAINING release whose front pair still runs is never retired", async () => {
    const run = monitor({ facts: async () => drained({ frontPairStopped: false }) });
    await run.time.advance(180_000);
    expect(run.reads).toHaveLength(3);
    expect(run.order).toEqual([]);
    expect(run.signal.claimsStopped()).toBe(false);
  });

  it("waits for a debate admitted a second before the pair stopped: open work 1, then 0 at the next tick", async () => {
    const run = monitor({ facts: async (read) => drained({ openWork: read === 1 ? 1 : 0 }) });
    await run.time.advance(60_000);
    expect(run.order).toEqual([]);
    expect(run.signal.claimsStopped()).toBe(false);
    await run.time.advance(60_000);
    expect(run.order).toEqual(["announce", "emit", "stopWorker"]);
    expect(run.outcome()).toBe("DRAINED");
  });

  it("waits for a task still running (a story after DONE): count 1, then 0 at the next tick", async () => {
    const run = monitor({ facts: async () => drained(), running: (read) => read === 1 ? 1 : 0 });
    await run.time.advance(60_000);
    expect(run.order).toEqual([]);
    await run.time.advance(60_000);
    expect(run.order).toEqual(["announce", "emit", "stopWorker"]);
    expect(run.outcome()).toBe("DRAINED");
  });

  it("on retiring: stops claims, prints the line, emits the event, and only then stops the worker; no tick after", async () => {
    const run = monitor({ facts: async () => drained() });
    await run.time.advance(60_000);
    expect(run.order).toEqual(["announce", "emit", "stopWorker"]);
    expect(run.announced).toEqual([{ line: 'DEBATEAI_RUNNER_RETIRED {"releaseKey":"r1-aaaaaaaaaaaa"}\n', claimsStopped: true }]);
    expect(run.emitted).toEqual([{ releaseKey: "r1-aaaaaaaaaaaa" }]);
    expect(run.signal.claimsStopped()).toBe(true);
    expect(run.lines).toEqual([{ kind: "DEBATEAI_RUNNER_RETIREMENT", event: "RETIRING", how: "DRAINED" }]);
    await expect(run.retirement.retired).resolves.toBe("DRAINED");
    await run.time.advance(300_000);
    expect(run.reads).toHaveLength(1);
    expect(run.order).toEqual(["announce", "emit", "stopWorker"]);
  });

  it("a worker that fails to stop rejects retired with that failure, after the line and the event; no tick after", async () => {
    const time = fakeClock();
    const order: string[] = [];
    const reads: number[] = [];
    const failure = new Error("worker stop failed");
    const lines: Array<Readonly<Record<string, string | number>>> = [];
    const retirement = startRunnerRetirement({
      releaseKey: KEY,
      store: { readFacts: async () => { reads.push(time.now()); return drained(); } },
      executions: { count: () => 0 },
      signal: createRunnerRetirementSignal(),
      stopWorker: async () => { order.push("stopWorker"); throw failure; },
      log: (line) => { lines.push(line); },
      announce: () => { order.push("announce"); },
      emit: () => { order.push("emit"); },
      clock: time.clock
    });
    await time.advance(60_000);
    await expect(retirement.retired).rejects.toBe(failure);
    expect(order).toEqual(["announce", "emit", "stopWorker"]);
    expect(lines).toEqual([
      { kind: "DEBATEAI_RUNNER_RETIREMENT", event: "RETIRING", how: "DRAINED" },
      { kind: "DEBATEAI_RUNNER_RETIREMENT", event: "RETIREMENT_STOP_FAILED" }
    ]);
    await time.advance(300_000);
    expect(reads).toEqual([60_000]);
  });

  it("an announcement that throws is logged, rejects retired with that failure, and stops no worker", async () => {
    const time = fakeClock();
    const order: string[] = [];
    const lines: Array<Readonly<Record<string, string | number>>> = [];
    const failure = new Error("stdout closed");
    const retirement = startRunnerRetirement({
      releaseKey: KEY,
      store: { readFacts: async () => drained() },
      executions: { count: () => 0 },
      signal: createRunnerRetirementSignal(),
      stopWorker: async () => { order.push("stopWorker"); },
      log: (line) => { lines.push(line); },
      announce: () => { order.push("announce"); throw failure; },
      emit: () => { order.push("emit"); },
      clock: time.clock
    });
    await time.advance(60_000);
    await expect(retirement.retired).rejects.toBe(failure);
    expect(order).toEqual(["announce"]);
    expect(lines).toEqual([
      { kind: "DEBATEAI_RUNNER_RETIREMENT", event: "RETIRING", how: "DRAINED" },
      { kind: "DEBATEAI_RUNNER_RETIREMENT", event: "RETIREMENT_ANNOUNCE_FAILED" }
    ]);
  });

  it("a release with no row (dev, tests) is never retired and writes no line", async () => {
    const run = monitor({
      facts: async () => Object.freeze({ state: null, frontPairStopped: false, retireRequested: false, openWork: 0 })
    });
    await run.time.advance(180_000);
    expect(run.reads).toHaveLength(3);
    expect(run.order).toEqual([]);
    expect(run.lines).toEqual([]);
  });

  it("a failed read is logged with its SQLSTATE only, never retires, and the next tick reads again", async () => {
    const run = monitor({
      facts: async (read) => {
        if (read === 1) throw Object.assign(new Error("terminating connection"), { code: "57P01" });
        return drained({ state: "CURRENT" });
      }
    });
    await run.time.advance(60_000);
    expect(run.lines).toEqual([{ kind: "DEBATEAI_RUNNER_RETIREMENT", event: "RETIREMENT_READ_FAILED", sqlState: "57P01" }]);
    expect(run.order).toEqual([]);
    await run.time.advance(60_000);
    expect(run.reads.map((read) => read.at)).toEqual([60_000, 120_000]);
    expect(run.order).toEqual([]);
    expect(run.signal.claimsStopped()).toBe(false);
  });

  it("a failed read without a SQLSTATE is logged without one", async () => {
    const run = monitor({ facts: async () => { throw new TypeError("RELEASE_STATE_ROW_INVALID"); } });
    await run.time.advance(60_000);
    expect(run.lines).toEqual([{ kind: "DEBATEAI_RUNNER_RETIREMENT", event: "RETIREMENT_READ_FAILED" }]);
  });

  it("a retire request on a CURRENT release is ignored, said once over three ticks, nothing stopped (D5)", async () => {
    const run = monitor({ facts: async () => drained({ state: "CURRENT", retireRequested: true }) });
    await run.time.advance(180_000);
    expect(run.reads).toHaveLength(3);
    expect(run.lines).toEqual([{ kind: "DEBATEAI_RUNNER_RETIREMENT", event: "RETIRE_REQUEST_IGNORED", state: "CURRENT" }]);
    expect(run.order).toEqual([]);
    expect(run.signal.claimsStopped()).toBe(false);
    expect(run.signal.callsStopped()).toBe(false);
  });

  it("reads every 60 s and never overlaps: a read that takes 90 s is followed by the next 60 s after it finished", async () => {
    const time = fakeClock();
    const reads: number[] = [];
    startRunnerRetirement({
      releaseKey: KEY,
      store: {
        readFacts: () => {
          reads.push(time.now());
          const facts = drained({ state: "CURRENT" });
          if (reads.length > 1) return Promise.resolve(facts);
          return new Promise((resolve) => { time.clock.setTimeout(() => resolve(facts), 90_000); });
        }
      },
      executions: { count: () => 0 },
      signal: createRunnerRetirementSignal(),
      stopWorker: async () => undefined,
      log: () => undefined,
      announce: () => undefined,
      emit: () => undefined,
      clock: time.clock
    });
    await time.advance(209_999);
    expect(reads).toEqual([60_000]);
    await time.advance(1);
    expect(reads).toEqual([60_000, 210_000]);
    await time.advance(60_000);
    expect(reads).toEqual([60_000, 210_000, 270_000]);
  });

  it("stop() ends the monitor: no further read, and stop during a read keeps it from retiring or arming another", async () => {
    let finish: (facts: ReleaseRetirementFacts) => void = () => undefined;
    const run = monitor({
      facts: (read) => read === 1 ? Promise.resolve(drained({ state: "CURRENT" })) : new Promise((resolve) => { finish = resolve; })
    });
    await run.time.advance(120_000);
    run.retirement.stop();
    finish(drained());
    await run.time.advance(300_000);
    expect(run.reads.map((read) => read.at)).toEqual([60_000, 120_000]);
    expect(run.order).toEqual([]);
    expect(run.signal.claimsStopped()).toBe(false);
  });
});
