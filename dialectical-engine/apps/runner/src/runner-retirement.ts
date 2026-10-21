import type { Pool } from "pg";
import { WorkItemRepository, type WorkItemFence } from "@debateai/battery";
import { readReleaseState, type ReleaseLifecycleState } from "@debateai/db";

/**
 * Side-by-side spec §4 (D1): how a release retires inside its own process. A retiring release "stops claiming; it lets
 * calls in flight settle". This file holds the two in-process pieces the hand-over reads, part 1 (part 2, the monitor
 * that reads them, is below):
 *
 *  · the task counter: how many Hatchet tasks of this runner are running now. A task is counted for its WHOLE handler,
 *    the verdict story included (the story runs inside the task after the work item is DONE), so "no task running"
 *    means no call of this release can still be made or awaited;
 *  · the retirement signal: two stops that start off and never go back. `stopClaims` makes `execute` answer NO_WORK
 *    before anything else (RUNNER_RETIRING); `stopCalls` makes the keep-alive refuse every further model call before it
 *    is sent (RUNNER_RETIRING, handled like RUNNER_CLAIM_LOST). Either way the work item is left as is for this
 *    release's backstop, which sets it aside FAILED with the waiver (spec §4 step 3); the §3 fence keeps every other
 *    release off it.
 *
 * Both are plain in-memory state of one process: nothing here reads a clock, a database or the network.
 */

export interface TaskExecutionCounter {
  /** A task started; the returned `leave` ends it. Calling `leave` more than once counts once. */
  enter(): () => void;
  /** The tasks running now. */
  count(): number;
}

export function createTaskExecutionCounter(): TaskExecutionCounter {
  let running = 0;
  return Object.freeze({
    enter() {
      running += 1;
      let left = false;
      return () => {
        if (left) return;
        left = true;
        running -= 1;
      };
    },
    count: () => running
  });
}

export interface RunnerRetirementSignal {
  /** True once this release stopped claiming: `execute` answers NO_WORK before any claim, probe or call. */
  claimsStopped(): boolean;
  /** True once this release stopped its model calls: the next call of every running debate is refused unsent. */
  callsStopped(): boolean;
  /** Stops claiming. Idempotent; never undone. */
  stopClaims(): void;
  /** Stops new model calls (calls already sent settle). Idempotent; never undone. */
  stopCalls(): void;
}

export function createRunnerRetirementSignal(): RunnerRetirementSignal {
  let claims = false;
  let calls = false;
  return Object.freeze({
    claimsStopped: () => claims,
    callsStopped: () => calls,
    stopClaims() { claims = true; },
    stopCalls() { calls = true; }
  });
}

/**
 * Part 2, spec §4 "Retirement (drained)": a release retires when, "in one database transaction", its state is
 * DRAINING, its front pair has stopped and no READY or CLAIMED work item of its runs is left, and, "in the process: no
 * debate task is still executing" (the task counter above, the verdict story included). Then the runner stops
 * claiming, says so on stdout (`DEBATEAI_RUNNER_RETIRED {"releaseKey":…}`) and as the in-process event the preview
 * launcher listens for, and only THEN stops its worker: the launcher must know before main returns, or it would read
 * the end as a failure and email the owner.
 *
 *  · one read every `pollMs` (INTERFACE: 60 s), a `setTimeout` chain re-armed only after the read finished (never
 *    `setInterval`), so two reads never overlap however slow the database is; the timer never keeps the process alive;
 *  · a read that fails is logged with its SQLSTATE only and never retires anything; the next read still runs;
 *  · a release with no row (`legacy`, dev, tests) is never retired;
 *  · a retire request on a release that is not DRAINING is ignored (plan B D5) and said once.
 *
 * Part 3, spec §4 "the backstop is a request, not a kill": root records "retire now" for a DRAINING release (switch
 * plus 7.5 hours), and the runner honours it at the next read, a request standing since before this process started
 * included, whether or not its front pair is recorded stopped yet (root stops the old pair anyway):
 *   1. it stops claiming and stops new model calls (BACKSTOP_STARTED);
 *   2. it lets the calls in flight settle: every 5 s it reads the task counter, until no task runs or 1,200 s have
 *      passed (the gate's call deadline; BACKSTOP_SETTLE_EXPIRED). A call in flight is never killed;
 *   3. it records what is left FAILED as RUN_SET_ASIDE:BACKSTOP with each run's waiver in the same transaction
 *      (spec §9: no quota use; the site day keeps counting real spend), retried every 5 s on failure, never skipped
 *      (BACKSTOP_SET_ASIDE_FAILED, then BACKSTOP_SET_ASIDE with the count);
 *   4. it retires as above (announce, emit, then stop the worker) and `retired` resolves "BACKSTOP".
 * A pass that throws is logged (BACKSTOP_FAILED) and runs again at the next read; every step is safe to repeat.
 * `stop()` ends a backstop between steps: the process is ending on its own signal.
 *
 * Lines are content-free (`kind: "DEBATEAI_RUNNER_RETIREMENT"`): an event, a state, how it retired, counts, a
 * SQLSTATE. A failure on the way out (RETIREMENT_ANNOUNCE_FAILED, RETIREMENT_STOP_FAILED) is logged and rejects
 * `retired`.
 */
export const RUNNER_RETIRED_PROCESS_EVENT = "debateai:runner-retired" as const;
export const RUNNER_RETIREMENT_TIMING = Object.freeze({
  pollMs: 60 * 1_000,
  settleMs: 1_200 * 1_000,
  settleCheckMs: 5 * 1_000
});

export type ReleaseRetirementFacts = Readonly<{
  /** null: no release row for this key (dev, tests). */
  state: ReleaseLifecycleState | null;
  frontPairStopped: boolean;
  retireRequested: boolean;
  /** READY or CLAIMED work items of the runs stamped with this release key. */
  openWork: number;
}>;

export type RunnerRetirementStore = Readonly<{
  /** The release's facts, read in ONE `REPEATABLE READ READ ONLY` transaction. */
  readFacts(releaseKey: string): Promise<ReleaseRetirementFacts>;
  /**
   * The backstop's step 3: every open work item of this runner's release FAILED as RUN_SET_ASIDE:BACKSTOP, each page
   * with its runs' waivers in one write transaction; how many items it set aside.
   */
  setAsideOpenWork(releaseKey: string, reason: "BACKSTOP"): Promise<number>;
}>;

/** Items per set-aside transaction: the store pages while a full page comes back. */
const SET_ASIDE_PAGE_SIZE = 100;

/**
 * The facts in one snapshot: a FRONT_PAIR_STOPPED row is never seen without every admission committed before it (a
 * debate admitted a second before the pair stopped is counted as open work, never missed between two reads). Needs
 * EXECUTE on `core.read_release_state` and SELECT on `core.work_item` and `core.run` (the runner runtime login has all
 * three). `fence` is the runner's own work fence (spec §3): the backstop's set-aside writes only its release's work,
 * never under another worker's live claim, and refuses any other release key before it writes (O1). The set-aside
 * needs UPDATE on `core.work_item` and INSERT on `ledger.model_spend_waiver` (debateai_runtime has both).
 */
export function postgresRunnerRetirementStore(
  pool: Pool,
  fence: WorkItemFence,
  options: Readonly<{ pageSize?: number }> = {}
): RunnerRetirementStore {
  const work = new WorkItemRepository(pool, fence);
  const pageSize = options.pageSize ?? SET_ASIDE_PAGE_SIZE;
  return Object.freeze({
    async setAsideOpenWork(releaseKey: string, reason: "BACKSTOP"): Promise<number> {
      if (releaseKey !== fence.releaseKey) throw new TypeError("RETIREMENT_RELEASE_KEY_MISMATCH");
      let count = 0;
      for (;;) {
        // Spec §4 steps 1-4 and §9 "the waiver": each page's FAILED rows and waivers commit together.
        const page = await work.setAsideOpenWork({ reason, limit: pageSize });
        count += page.length;
        if (page.length < pageSize) return count;
      }
    },
    async readFacts(releaseKey: string): Promise<ReleaseRetirementFacts> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const release = await readReleaseState(client, releaseKey);
        const open = await client.query<{ open_work: number }>(
          `SELECT count(*)::int AS open_work
             FROM core.work_item w
             JOIN core.run r ON r.run_id = w.run_id
            WHERE r.release_key = $1 AND w.state IN ('READY','CLAIMED')`,
          [releaseKey]
        );
        await client.query("COMMIT");
        return Object.freeze({
          state: release?.state ?? null,
          frontPairStopped: release?.frontPairStopped ?? false,
          retireRequested: release?.retireRequested ?? false,
          openWork: open.rows[0]?.open_work ?? 0
        });
      } catch (error) {
        // A failing ROLLBACK never replaces the read's own failure (and its SQLSTATE).
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
  });
}

type RetirementClock = Readonly<{
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}>;

const systemClock: RetirementClock = Object.freeze({
  now: () => Date.now(),
  setTimeout: (callback: () => void, ms: number) => {
    const timer = setTimeout(callback, ms);
    // The monitor never keeps a process alive on its own.
    timer.unref();
    return timer;
  },
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>)
});

const KIND = "DEBATEAI_RUNNER_RETIREMENT";

function sqlStateOf(error: unknown): Readonly<{ sqlState?: string }> {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^[0-9A-Z]{5}$/u.test(code) ? { sqlState: code } : {};
}

export function startRunnerRetirement(input: Readonly<{
  releaseKey: string;
  store: RunnerRetirementStore;
  executions: Pick<TaskExecutionCounter, "count">;
  signal: RunnerRetirementSignal;
  stopWorker(): Promise<void>;
  log(line: Readonly<Record<string, string | number>>): void;
  announce(line: string): void;
  emit(payload: Readonly<{ releaseKey: string }>): void;
  clock?: RetirementClock;
}>): Readonly<{ stop(): void; retired: Promise<"DRAINED" | "BACKSTOP"> }> {
  const clock = input.clock ?? systemClock;
  let stopped = false;
  let retiring = false;
  let ignoredSaid = false;
  let timer: unknown;
  let settle: (how: "DRAINED" | "BACKSTOP") => void = () => undefined;
  let refuse: (error: unknown) => void = () => undefined;
  const retired = new Promise<"DRAINED" | "BACKSTOP">((resolve, reject) => { settle = resolve; refuse = reject; });
  /** Resolves after `ms`, or never once `stop()` ran (it clears the timer): the backstop then ends where it waits. */
  const wait = (ms: number): Promise<void> => new Promise((resolve) => {
    if (stopped) return;
    timer = clock.setTimeout(() => { timer = undefined; resolve(); }, ms);
  });
  // main.ts never awaits `retired`: a worker that fails to stop is the launcher's to see, never an unhandled rejection.
  retired.catch(() => undefined);

  const retire = async (how: "DRAINED" | "BACKSTOP"): Promise<void> => {
    retiring = true;
    input.log(Object.freeze({ kind: KIND, event: "RETIRING", how }));
    input.signal.stopClaims();
    try {
      input.announce(`DEBATEAI_RUNNER_RETIRED ${JSON.stringify({ releaseKey: input.releaseKey })}\n`);
      input.emit(Object.freeze({ releaseKey: input.releaseKey }));
    } catch (error) {
      // The launcher may not know: stopping the worker now would read as a failure. Loud, and the worker is left as is.
      input.log(Object.freeze({ kind: KIND, event: "RETIREMENT_ANNOUNCE_FAILED" }));
      refuse(error);
      return;
    }
    try {
      await input.stopWorker();
    } catch (error) {
      input.log(Object.freeze({ kind: KIND, event: "RETIREMENT_STOP_FAILED" }));
      refuse(error);
      return;
    }
    settle(how);
  };

  /**
   * Part 3 (spec §4, the backstop): runs once; the poll chain is not re-armed after it (`retiring`), unless the pass
   * threw (BACKSTOP_FAILED): then the next read runs it again.
   */
  const backstop = async (facts: ReleaseRetirementFacts): Promise<void> => {
    retiring = true;
    input.signal.stopClaims();
    input.signal.stopCalls();
    const startedAt = clock.now();
    input.log(Object.freeze({
      kind: KIND, event: "BACKSTOP_STARTED", executing: input.executions.count(), openWork: facts.openWork
    }));
    for (;;) {
      const executing = input.executions.count();
      if (executing === 0) break;
      const left = RUNNER_RETIREMENT_TIMING.settleMs - (clock.now() - startedAt);
      if (left <= 0) {
        input.log(Object.freeze({ kind: KIND, event: "BACKSTOP_SETTLE_EXPIRED", executing }));
        break;
      }
      await wait(Math.min(RUNNER_RETIREMENT_TIMING.settleCheckMs, left));
    }
    let count: number;
    for (;;) {
      if (stopped) return;
      try {
        count = await input.store.setAsideOpenWork(input.releaseKey, "BACKSTOP");
        break;
      } catch (error) {
        input.log(Object.freeze({ kind: KIND, event: "BACKSTOP_SET_ASIDE_FAILED", ...sqlStateOf(error) }));
        await wait(RUNNER_RETIREMENT_TIMING.settleCheckMs);
      }
    }
    input.log(Object.freeze({ kind: KIND, event: "BACKSTOP_SET_ASIDE", count }));
    if (stopped) return;
    await retire("BACKSTOP");
  };

  const tick = async (): Promise<void> => {
    let facts: ReleaseRetirementFacts;
    try {
      facts = await input.store.readFacts(input.releaseKey);
    } catch (error) {
      input.log(Object.freeze({ kind: KIND, event: "RETIREMENT_READ_FAILED", ...sqlStateOf(error) }));
      return;
    }
    if (stopped) return;
    if (facts.retireRequested && facts.state !== "DRAINING" && facts.state !== null && !ignoredSaid) {
      ignoredSaid = true;
      input.log(Object.freeze({ kind: KIND, event: "RETIRE_REQUEST_IGNORED", state: facts.state }));
    }
    if (facts.state === "DRAINING" && facts.retireRequested) {
      // A pass that throws (a count or a log line) is retried at the next read: the backstop is level-triggered, and
      // stopping claims and calls, the set-aside and its waivers are safe to repeat. Swallowing it would leave claims
      // and calls stopped with nothing set aside and no waiver (spec §9: no quota use). retire()'s own failures are
      // caught inside it and keep `retiring` (B10).
      await backstop(facts).catch(() => {
        retiring = false;
        try {
          input.log(Object.freeze({ kind: KIND, event: "BACKSTOP_FAILED" }));
        } catch {
          // A throwing log sink never keeps the next read from being armed.
        }
      });
      return;
    }
    const drained = facts.state === "DRAINING" && facts.frontPairStopped && facts.openWork === 0;
    if (drained && input.executions.count() === 0) {
      await retire("DRAINED");
    }
  };

  const arm = (): void => {
    if (stopped || retiring) return;
    timer = clock.setTimeout(() => {
      timer = undefined;
      // A throwing count or log line never ends the chain: the next read is armed either way.
      void tick().catch(() => undefined).finally(arm);
    }, RUNNER_RETIREMENT_TIMING.pollMs);
  };

  arm();
  return Object.freeze({
    stop() {
      stopped = true;
      if (timer !== undefined) clock.clearTimeout(timer);
      timer = undefined;
    },
    retired
  });
}
