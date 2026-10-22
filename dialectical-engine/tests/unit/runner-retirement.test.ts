import { describe, expect, it } from "vitest";
import type { ProviderCallRequest, ProviderCallResult } from "@debateai/providers";
import {
  countModelCalls,
  createModelCallCounter,
  createRunnerRetirementSignal,
  createTaskExecutionCounter,
  honourStandingRetireRequest,
  RUNNER_RETIRED_PROCESS_EVENT,
  RUNNER_RETIREMENT_TIMING,
  startRunnerRetirement,
  type ModelCallCounter,
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

  it("knows which work items its tasks run: two copies of one item count twice, and each forgets once (R2)", () => {
    const executions = createTaskExecutionCounter();
    expect(executions.isWorkingOn("work-1")).toBe(false);
    const forgetFirst = executions.workingOn("work-1");
    const forgetSecond = executions.workingOn("work-1");
    executions.workingOn("work-2");
    expect(executions.isWorkingOn("work-1")).toBe(true);
    forgetFirst();
    forgetFirst();
    expect(executions.isWorkingOn("work-1")).toBe(true);
    forgetSecond();
    expect(executions.isWorkingOn("work-1")).toBe(false);
    expect(executions.isWorkingOn("work-2")).toBe(true);
    // Naming a work item is not a second task: the count is the tasks entered.
    expect(executions.count()).toBe(0);
  });

  it("counts each model call from the ask until it settles, answered, failed or thrown at once (R1)", async () => {
    const calls = createModelCallCounter();
    const settlers: Array<Readonly<{ answer(): void; fail(error: Error): void }>> = [];
    const gateway = countModelCalls({
      call: () => new Promise<ProviderCallResult>((resolve, reject) => {
        settlers.push({ answer: () => resolve({} as ProviderCallResult), fail: reject });
      })
    }, calls);
    expect(calls.count()).toBe(0);
    const answered = gateway.call({} as ProviderCallRequest);
    const failed = gateway.call({} as ProviderCallRequest);
    expect(calls.count()).toBe(2);
    settlers[0]!.answer();
    await answered;
    expect(calls.count()).toBe(1);
    const failure = new Error("vendor refused");
    settlers[1]!.fail(failure);
    await expect(failed).rejects.toBe(failure);
    expect(calls.count()).toBe(0);
    const thrown = new TypeError("PROVIDER_RUN_REQUIRED");
    const throwing = countModelCalls({ call: () => { throw thrown; } }, calls);
    await expect(throwing.call({} as ProviderCallRequest)).rejects.toBe(thrown);
    expect(calls.count()).toBe(0);
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
  /** The backstop's set-aside: `setAside(n)` answers the n-th call (1-based). */
  setAside?: (call: number) => Promise<number>;
  /** This process's model calls in flight (R1); none unless a case says so. */
  calls?: Pick<ModelCallCounter, "count">;
}>) {
  const time = fakeClock();
  const signal = createRunnerRetirementSignal();
  const reads: Array<Readonly<{ key: string; at: number }>> = [];
  const order: string[] = [];
  const lines: Array<Readonly<Record<string, string | number>>> = [];
  const announced: Array<Readonly<{ line: string; claimsStopped: boolean }>> = [];
  const emitted: Array<Readonly<{ releaseKey: string }>> = [];
  const setAsides: Array<Readonly<{ key: string; reason: string; at: number }>> = [];
  let outcome: string | undefined;
  const retirement = startRunnerRetirement({
    releaseKey: KEY,
    store: {
      readFacts: (releaseKey) => {
        reads.push({ key: releaseKey, at: time.now() });
        return options.facts(reads.length);
      },
      setAsideOpenWork: (releaseKey, reason) => {
        setAsides.push({ key: releaseKey, reason, at: time.now() });
        order.push("setAside");
        return (options.setAside ?? (async () => 0))(setAsides.length);
      }
    },
    executions: { count: () => (options.running ?? (() => 0))(reads.length) },
    calls: options.calls ?? { count: () => 0 },
    signal,
    stopWorker: async () => { order.push("stopWorker"); },
    log: (line) => { lines.push(line); },
    announce: (line) => { order.push("announce"); announced.push({ line, claimsStopped: signal.claimsStopped() }); },
    emit: (payload) => { order.push("emit"); emitted.push(payload); },
    clock: time.clock
  });
  void retirement.retired.then((how) => { outcome = how; });
  return { time, signal, retirement, reads, order, lines, announced, emitted, setAsides, outcome: () => outcome };
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
      store: { readFacts: async () => { reads.push(time.now()); return drained(); }, setAsideOpenWork: async () => 0 },
      executions: { count: () => 0 },
      calls: { count: () => 0 },
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
      store: { readFacts: async () => drained(), setAsideOpenWork: async () => 0 },
      executions: { count: () => 0 },
      calls: { count: () => 0 },
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
        },
        setAsideOpenWork: async () => 0
      },
      executions: { count: () => 0 },
      calls: { count: () => 0 },
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

/**
 * Side-by-side spec §4, "the backstop is a request, not a kill": root records "retire now" for the draining release,
 * and the runner honours it — it stops claiming and stops new calls, lets calls in flight settle (at most 1,200 s,
 * checked every 5 s), sets what is left aside FAILED with the waiver (§9: no quota use), and retires. The set-aside
 * is retried every 5 s until it is written, never skipped.
 */
describe("the backstop is a request the runner honours (side-by-side §4)", () => {
  const requested = (overrides: Partial<ReleaseRetirementFacts> = {}) =>
    drained({ retireRequested: true, openWork: 2, ...overrides });
  const line = (event: string, extra: Readonly<Record<string, string | number>> = {}) =>
    ({ kind: "DEBATEAI_RUNNER_RETIREMENT", event, ...extra });

  it("stops claims and calls at once, waits for the call in flight, sets the rest aside, then retires", async () => {
    let executing = 1;
    const run = monitor({ facts: async () => requested(), running: () => executing, setAside: async () => 2 });
    await run.time.advance(60_000);
    expect(run.signal.claimsStopped()).toBe(true);
    expect(run.signal.callsStopped()).toBe(true);
    expect(run.lines).toEqual([line("BACKSTOP_STARTED", { executing: 1, openWork: 2 })]);
    for (let step = 0; step < 3; step += 1) await run.time.advance(5_000);
    expect(run.setAsides).toEqual([]);
    expect(run.order).toEqual([]);

    executing = 0;
    await run.time.advance(5_000);
    expect(run.setAsides).toEqual([{ key: "r1-aaaaaaaaaaaa", reason: "BACKSTOP", at: 80_000 }]);
    expect(run.order).toEqual(["setAside", "announce", "emit", "stopWorker"]);
    expect(run.lines).toEqual([
      line("BACKSTOP_STARTED", { executing: 1, openWork: 2 }),
      line("BACKSTOP_SET_ASIDE", { count: 2 }),
      line("RETIRING", { how: "BACKSTOP" })
    ]);
    expect(run.announced).toEqual([{ line: 'DEBATEAI_RUNNER_RETIRED {"releaseKey":"r1-aaaaaaaaaaaa"}\n', claimsStopped: true }]);
    await expect(run.retirement.retired).resolves.toBe("BACKSTOP");
    // The poll chain ended with the request: no read and no second set-aside after it.
    await run.time.advance(300_000);
    expect(run.reads).toHaveLength(1);
    expect(run.setAsides).toHaveLength(1);
  });

  it("waits at most 1,200 s for a task still running with no model call in flight, then sets the rest aside and retires", async () => {
    const run = monitor({ facts: async () => requested(), running: () => 1, setAside: async () => 2 });
    await run.time.advance(60_000);
    await run.time.advance(1_199_999);
    expect(run.setAsides).toEqual([]);
    expect(run.lines).toEqual([line("BACKSTOP_STARTED", { executing: 1, openWork: 2 })]);
    await run.time.advance(1);
    expect(run.setAsides).toEqual([{ key: "r1-aaaaaaaaaaaa", reason: "BACKSTOP", at: 1_260_000 }]);
    expect(run.lines).toEqual([
      line("BACKSTOP_STARTED", { executing: 1, openWork: 2 }),
      line("BACKSTOP_SETTLE_EXPIRED", { executing: 1 }),
      line("BACKSTOP_SET_ASIDE", { count: 2 }),
      line("RETIRING", { how: "BACKSTOP" })
    ]);
    expect(run.order).toEqual(["setAside", "announce", "emit", "stopWorker"]);
    await expect(run.retirement.retired).resolves.toBe("BACKSTOP");
  });

  // R1 (final review): a preview call may take 1,260 s plus a 60 s unbilled resend, longer than the 1,200 s settle. A
  // runner that retired then would end its process under a call the gate holds open, and the gate both releases share
  // halts. The count is the runner's own model-call accounting (`countModelCalls` around every gateway), not the tasks.
  it("a model call still in flight after 1,200 s: the rest is set aside with its waivers, but it never retires (R1)", async () => {
    const calls = createModelCallCounter();
    let answer: (result: ProviderCallResult) => void = () => undefined;
    const gateway = countModelCalls({ call: () => new Promise<ProviderCallResult>((resolve) => { answer = resolve; }) }, calls);
    const run = monitor({ facts: async () => requested(), running: () => 1, setAside: async () => 2, calls });
    const sent = gateway.call({} as ProviderCallRequest);
    expect(calls.count()).toBe(1);
    await run.time.advance(60_000);
    await run.time.advance(1_200_000);
    expect(run.setAsides).toEqual([{ key: "r1-aaaaaaaaaaaa", reason: "BACKSTOP", at: 1_260_000 }]);
    expect(run.lines).toEqual([
      line("BACKSTOP_STARTED", { executing: 1, openWork: 2 }),
      line("BACKSTOP_SETTLE_EXPIRED", { executing: 1 }),
      line("BACKSTOP_SET_ASIDE", { count: 2 }),
      line("RUNNER_BACKSTOP_CALL_IN_FLIGHT", { calls: 1 })
    ]);
    expect(run.order).toEqual(["setAside"]);
    expect(run.announced).toEqual([]);
    expect(run.emitted).toEqual([]);
    // The end is root's 25-minute forced stop: the call settling later retires nothing and reads nothing more.
    answer({} as ProviderCallResult);
    await sent;
    expect(calls.count()).toBe(0);
    await run.time.advance(600_000);
    expect(run.reads).toHaveLength(1);
    expect(run.order).toEqual(["setAside"]);
    expect(run.outcome()).toBeUndefined();
  });

  it("a call that settles during the set-aside is not in flight: the backstop retires (R1)", async () => {
    let inFlight = 1;
    const run = monitor({
      facts: async () => requested(), running: () => 1, calls: { count: () => inFlight },
      setAside: async () => { inFlight = 0; return 2; }
    });
    await run.time.advance(1_260_000);
    expect(run.order).toEqual(["setAside", "announce", "emit", "stopWorker"]);
    await expect(run.retirement.retired).resolves.toBe("BACKSTOP");
  });

  it("a set-aside that fails is retried every 5 s and never skipped; the worker stops only after it is written", async () => {
    const refused = () => Object.assign(new Error("could not serialize access"), { code: "40001" });
    const run = monitor({
      facts: async () => requested(),
      setAside: async (call) => { if (call <= 2) throw refused(); return 2; }
    });
    await run.time.advance(60_000);
    expect(run.setAsides.map((call) => call.at)).toEqual([60_000]);
    expect(run.order).toEqual(["setAside"]);
    await run.time.advance(5_000);
    expect(run.setAsides.map((call) => call.at)).toEqual([60_000, 65_000]);
    await run.time.advance(4_999);
    expect(run.order).toEqual(["setAside", "setAside"]);
    await run.time.advance(1);
    expect(run.setAsides.map((call) => call.at)).toEqual([60_000, 65_000, 70_000]);
    expect(run.order).toEqual(["setAside", "setAside", "setAside", "announce", "emit", "stopWorker"]);
    expect(run.lines).toEqual([
      line("BACKSTOP_STARTED", { executing: 0, openWork: 2 }),
      line("BACKSTOP_SET_ASIDE_FAILED", { sqlState: "40001" }),
      line("BACKSTOP_SET_ASIDE_FAILED", { sqlState: "40001" }),
      line("BACKSTOP_SET_ASIDE", { count: 2 }),
      line("RETIRING", { how: "BACKSTOP" })
    ]);
    await expect(run.retirement.retired).resolves.toBe("BACKSTOP");
  });

  it("a backstop pass that throws is logged and retried at the next 60 s read: set aside, then retired", async () => {
    const run = monitor({
      facts: async () => requested(),
      // The first pass throws on its first count (inside BACKSTOP_STARTED); the second pass counts 0.
      running: (read) => { if (read === 1) throw new Error("count failed"); return 0; },
      setAside: async () => 2
    });
    await run.time.advance(60_000);
    expect(run.signal.claimsStopped()).toBe(true);
    expect(run.signal.callsStopped()).toBe(true);
    expect(run.setAsides).toEqual([]);
    expect(run.lines).toEqual([line("BACKSTOP_FAILED")]);
    expect(run.outcome()).toBeUndefined();

    await run.time.advance(59_999);
    expect(run.reads).toHaveLength(1);
    await run.time.advance(1);
    expect(run.reads).toHaveLength(2);
    expect(run.setAsides).toEqual([{ key: "r1-aaaaaaaaaaaa", reason: "BACKSTOP", at: 120_000 }]);
    expect(run.order).toEqual(["setAside", "announce", "emit", "stopWorker"]);
    expect(run.lines).toEqual([
      line("BACKSTOP_FAILED"),
      line("BACKSTOP_STARTED", { executing: 0, openWork: 2 }),
      line("BACKSTOP_SET_ASIDE", { count: 2 }),
      line("RETIRING", { how: "BACKSTOP" })
    ]);
    await expect(run.retirement.retired).resolves.toBe("BACKSTOP");
    await run.time.advance(300_000);
    expect(run.reads).toHaveLength(2);
  });

  it.each([
    ["RETIREMENT_ANNOUNCE_FAILED", "announce"],
    ["RETIREMENT_STOP_FAILED", "stopWorker"]
  ] as const)(
    "a log sink that throws on %s still rejects retired once, and the next read announces nothing again",
    async (failedEvent, failingStep) => {
      const time = fakeClock();
      const order: string[] = [];
      const reads: number[] = [];
      const failure = new Error("way out failed");
      const retirement = startRunnerRetirement({
        releaseKey: KEY,
        store: {
          readFacts: async () => { reads.push(time.now()); return requested(); },
          setAsideOpenWork: async () => { order.push("setAside"); return 2; }
        },
        executions: { count: () => 0 },
        calls: { count: () => 0 },
        signal: createRunnerRetirementSignal(),
        stopWorker: async () => { order.push("stopWorker"); if (failingStep === "stopWorker") throw failure; },
        log: (entry) => { if (entry.event === failedEvent) throw new Error("log sink closed"); },
        announce: () => { order.push("announce"); if (failingStep === "announce") throw failure; },
        emit: () => { order.push("emit"); },
        clock: time.clock
      });
      let rejections = 0;
      void retirement.retired.catch(() => { rejections += 1; });
      await time.advance(60_000);
      await expect(retirement.retired).rejects.toBe(failure);
      const firstPass = [...order];
      // The tick's catch never saw a throw: `retiring` stays set, so no further read, set-aside or announcement.
      await time.advance(300_000);
      expect(reads).toEqual([60_000]);
      expect(order).toEqual(firstPass);
      expect(order.filter((step) => step === "announce")).toHaveLength(1);
      expect(rejections).toBe(1);
    }
  );

  it("a front pair not yet recorded stopped does not delay it (root asked; the old pair is stopped anyway)", async () => {
    const run = monitor({ facts: async () => requested({ frontPairStopped: false, openWork: 1 }), setAside: async () => 1 });
    await run.time.advance(60_000);
    expect(run.order).toEqual(["setAside", "announce", "emit", "stopWorker"]);
    await expect(run.retirement.retired).resolves.toBe("BACKSTOP");
  });

  it("stop() during the wait ends it: nothing is set aside and the worker is left to its signal", async () => {
    const run = monitor({ facts: async () => requested(), running: () => 1, setAside: async () => 2 });
    await run.time.advance(60_000);
    run.retirement.stop();
    await run.time.advance(1_500_000);
    expect(run.setAsides).toEqual([]);
    expect(run.order).toEqual([]);
    expect(run.outcome()).toBeUndefined();
  });
});

/**
 * X2 (final review): a runner (re)started under a standing retire request would re-send and run its lapsed and READY work
 * (paid calls) for up to 60 s before its first retirement read, and the backstop would then set those debates aside. So
 * main.ts reads the release's facts ONCE before its worker starts: under a standing request on a DRAINING release both
 * stops are on before the first claim (every claim answers NO_WORK, the backstop finds nothing executing) and main skips
 * the start-up re-send.
 */
describe("a standing retire request is honoured before the worker starts (X2)", () => {
  const boot = (facts: () => Promise<ReleaseRetirementFacts>) => {
    const signal = createRunnerRetirementSignal();
    const reads: string[] = [];
    const lines: Array<Readonly<Record<string, string | number>>> = [];
    const standing = honourStandingRetireRequest({
      releaseKey: KEY,
      store: { readFacts: (releaseKey) => { reads.push(releaseKey); return facts(); } },
      signal,
      log: (line) => { lines.push(line); }
    });
    return { signal, reads, lines, standing };
  };

  it("DRAINING with retire requested: both stops on before any claim, one line, and the start-up re-send is skipped", async () => {
    const run = boot(async () => drained({ retireRequested: true, frontPairStopped: false, openWork: 3 }));
    await expect(run.standing).resolves.toBe(true);
    expect(run.reads).toEqual([KEY]);
    expect(run.signal.claimsStopped()).toBe(true);
    expect(run.signal.callsStopped()).toBe(true);
    expect(run.lines).toEqual([{ kind: "DEBATEAI_RUNNER_RETIREMENT", event: "RETIRE_REQUEST_STANDING", openWork: 3 }]);
  });

  it.each([
    ["DRAINING with no request", drained()],
    ["a request on a CURRENT release (ignored, D5)", drained({ state: "CURRENT", retireRequested: true })],
    ["a request on a STAGED release", drained({ state: "STAGED", retireRequested: true })],
    ["no release row (dev, tests)", Object.freeze({ state: null, frontPairStopped: false, retireRequested: true, openWork: 0 })]
  ] as const)("%s: nothing is stopped, no line, and the start-up re-send runs", async (_case, facts) => {
    const run = boot(async () => facts as ReleaseRetirementFacts);
    await expect(run.standing).resolves.toBe(false);
    expect(run.signal.claimsStopped()).toBe(false);
    expect(run.signal.callsStopped()).toBe(false);
    expect(run.lines).toEqual([]);
  });

  it("a read that fails fails the boot like every other boot read, and stops nothing", async () => {
    const failure = Object.assign(new Error("terminating connection"), { code: "57P01" });
    const run = boot(async () => { throw failure; });
    await expect(run.standing).rejects.toBe(failure);
    expect(run.signal.claimsStopped()).toBe(false);
    expect(run.lines).toEqual([]);
  });
});
