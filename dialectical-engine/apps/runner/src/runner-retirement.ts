import type { Pool } from "pg";
import { WorkItemRepository, type WorkItemFence } from "@debateai/battery";
import { readReleaseState, type ReleaseLifecycleState } from "@debateai/db";
import type { ProviderCallRequest, ProviderCallResult, ProviderGateway } from "@debateai/providers";

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
  /**
   * R2 (final review): a counted task names the work item it runs, once its dispatch is valid; the returned function
   * forgets it (calling it more than once forgets once). Two copies of one item are named twice.
   */
  workingOn(workItemId: string): () => void;
  /** True while a task of this process runs `workItemId`: the five-minute re-send never hands it back here. */
  isWorkingOn(workItemId: string): boolean;
}

export function createTaskExecutionCounter(): TaskExecutionCounter {
  let running = 0;
  const items = new Map<string, number>();
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
    count: () => running,
    workingOn(workItemId: string) {
      items.set(workItemId, (items.get(workItemId) ?? 0) + 1);
      let forgotten = false;
      return () => {
        if (forgotten) return;
        forgotten = true;
        const left = (items.get(workItemId) ?? 0) - 1;
        if (left > 0) items.set(workItemId, left);
        else items.delete(workItemId);
      };
    },
    isWorkingOn: (workItemId: string) => items.has(workItemId)
  });
}

/**
 * R1 (final review): this process's model calls in flight, every one of them: the debate's, the verdict story's, a
 * structure repair, a claim-time probe. A call is counted from the moment its gateway is asked until its promise
 * settles, answered or failed, so on the preview the one 60-second unbilled resend inside the call is counted too. The
 * backstop reads it after its settle: a preview call may take 1,260 s plus that resend, longer than the 1,200 s settle,
 * and a process that ends under a call the gate still holds open halts the gate both releases share.
 */
export interface ModelCallCounter {
  /** A call started; the returned `leave` ends it. Calling `leave` more than once counts once. */
  enter(): () => void;
  /** The calls in flight now. */
  count(): number;
}

export function createModelCallCounter(): ModelCallCounter {
  let inFlight = 0;
  return Object.freeze({
    enter() {
      inFlight += 1;
      let left = false;
      return () => {
        if (left) return;
        left = true;
        inFlight -= 1;
      };
    },
    count: () => inFlight
  });
}

/** R1: `gateway`, each of its calls counted in `calls` from the ask until it settles (main.ts wraps them all). */
export function countModelCalls(gateway: ProviderGateway, calls: Pick<ModelCallCounter, "enter">): ProviderGateway {
  return Object.freeze({
    async call(request: ProviderCallRequest): Promise<ProviderCallResult> {
      const leave = calls.enter();
      try {
        return await gateway.call(request);
      } finally {
        leave();
      }
    }
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
 * debate task is still executing" (the task counter above, the verdict story included) and no model call of this
 * process is in flight (R1's call counter: integration M6, a keep-alive stop can end a task under its call). Then the
 * runner stops claiming, says so on stdout (`DEBATEAI_RUNNER_RETIRED {"releaseKey":…}`) and as the in-process event
 * the preview launcher listens for, and only THEN stops its worker: the launcher must know before main returns, or it
 * would read the end as a failure and email the owner.
 *
 *  · one read every `pollMs` (INTERFACE: 60 s), a `setTimeout` chain re-armed only after the read finished (never
 *    `setInterval`), so two reads never overlap however slow the database is; the timer never keeps the process alive;
 *  · a read that fails is logged with its SQLSTATE only and never retires anything; the next read still runs;
 *  · a release with no row (`legacy`, dev, tests) is never retired;
 *  · a retire request on a release that is not DRAINING is ignored (plan B D5) and said once.
 *
 * Part 3, spec §4 "the backstop is a request, not a kill": root records "retire now" for a DRAINING release (switch
 * plus 7.5 hours), and the runner honours it at the next read, a request standing since before this process started
 * included (X2: main.ts reads that one once before its worker starts, `honourStandingRetireRequest`, so both stops are
 * on before the first claim), whether or not its front pair is recorded stopped yet (root stops the old pair anyway):
 *   1. it stops claiming and stops new model calls (BACKSTOP_STARTED);
 *   2. it lets the calls in flight settle: every 5 s it reads the task counter, until no task runs or 1,200 s have
 *      passed (the gate's call deadline; BACKSTOP_SETTLE_EXPIRED). A call in flight is never killed;
 *   3. it records what is left FAILED as RUN_SET_ASIDE:BACKSTOP with each run's waiver in the same transaction
 *      (spec §9: no quota use; the site day keeps counting real spend), retried every 5 s on failure, never skipped
 *      (BACKSTOP_SET_ASIDE_FAILED, then BACKSTOP_SET_ASIDE with the count);
 *   4. it retires as above (announce, emit, then stop the worker) and `retired` resolves "BACKSTOP" — unless a model
 *      call of this process is still in flight (R1, the model-call counter, never the task counter): then it says
 *      RUNNER_BACKSTOP_CALL_IN_FLIGHT, does not retire, and leaves the end to root's forced stop. So when it does
 *      retire after BACKSTOP_SETTLE_EXPIRED, what still runs is a task's non-call wait, which the launcher's 30 s
 *      bound may cut.
 * A pass that throws is logged (BACKSTOP_FAILED) and runs again at the next read; every step is safe to repeat.
 * `stop()` ends a backstop between steps: the process is ending on its own signal.
 *
 * Lines are content-free (`kind: "DEBATEAI_RUNNER_RETIREMENT"`): an event, the release's lifecycle state (only on
 * RETIRE_REQUEST_IGNORED), how it retired, counts, a SQLSTATE. A failure on the way out (RETIREMENT_ANNOUNCE_FAILED,
 * RETIREMENT_STOP_FAILED) rejects `retired`, then is logged.
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

/**
 * X2 (final review): the one read main.ts makes BEFORE its worker starts. A runner (re)started under a standing retire
 * request (a reboot or a crash mid-drain, then `systemctl start`) would otherwise re-send and run its lapsed and READY
 * work, paid calls included, until its first retirement read 60 s later, and the backstop would then set those debates
 * aside. Under a request on a DRAINING release both stops go on before the first claim, so every claim answers NO_WORK
 * and the backstop's pass finds nothing executing; true tells main to skip the start-up re-send (it would only hand the
 * runner work to refuse). Any other state (a request on a release that is not DRAINING is ignored, D5) changes nothing.
 * A read that fails is thrown: the boot fails like every other boot read, loud, with nothing stopped.
 */
export async function honourStandingRetireRequest(input: Readonly<{
  releaseKey: string;
  store: Pick<RunnerRetirementStore, "readFacts">;
  signal: RunnerRetirementSignal;
  log(line: Readonly<Record<string, string | number>>): void;
}>): Promise<boolean> {
  const facts = await input.store.readFacts(input.releaseKey);
  if (facts.state !== "DRAINING" || !facts.retireRequested) return false;
  input.signal.stopClaims();
  input.signal.stopCalls();
  input.log(Object.freeze({ kind: KIND, event: "RETIRE_REQUEST_STANDING", openWork: facts.openWork }));
  return true;
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
  /** R1: this process's model calls in flight (main.ts: every gateway and claim probe, `countModelCalls`). */
  calls: Pick<ModelCallCounter, "count">;
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
  // main.ts never awaits `retired`, so a worker.stop() that rejects is seen only as the RETIREMENT_STOP_FAILED line:
  // the launcher already heard the event and ends PREVIEW_RUNNER_RETIRED, exit 0, once its 30 s settle bound passes
  // (exit 1 only if main itself rejects). The trade-off is deliberate: a worker that will not stop after a clean
  // retirement is a hang, not a failed release, so it is said loudly but emails no one. Never an unhandled rejection.
  retired.catch(() => undefined);
  /**
   * A way-out failure's line, written AFTER `retired` is rejected and never thrown: a throwing log sink can neither
   * leave `retired` pending nor reach the tick's catch, which would reset `retiring` and announce a second time.
   */
  const sayOnTheWayOut = (event: "RETIREMENT_ANNOUNCE_FAILED" | "RETIREMENT_STOP_FAILED"): void => {
    try {
      input.log(Object.freeze({ kind: KIND, event }));
    } catch {
      // `retired` already carries the failure; the line is best effort.
    }
  };

  const retire = async (how: "DRAINED" | "BACKSTOP"): Promise<void> => {
    retiring = true;
    input.log(Object.freeze({ kind: KIND, event: "RETIRING", how }));
    input.signal.stopClaims();
    try {
      input.announce(`DEBATEAI_RUNNER_RETIRED ${JSON.stringify({ releaseKey: input.releaseKey })}\n`);
      input.emit(Object.freeze({ releaseKey: input.releaseKey }));
    } catch (error) {
      // The launcher may not know: stopping the worker now would read as a failure. Loud, and the worker is left as is.
      refuse(error);
      sayOnTheWayOut("RETIREMENT_ANNOUNCE_FAILED");
      return;
    }
    try {
      await input.stopWorker();
    } catch (error) {
      refuse(error);
      sayOnTheWayOut("RETIREMENT_STOP_FAILED");
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
    // R1 (final review): read AFTER the set-aside, the latest word. A model call still in flight (only possible after
    // BACKSTOP_SETTLE_EXPIRED: a preview call may take 1,260 s plus its 60 s unbilled resend) is never cut by this
    // release ending itself: the launcher would end the process under it and halt the gate both releases share. The
    // debates are set aside with their waivers all the same; `retiring` stays set, so no further read, and the end is
    // root's 25-minute forced stop (which re-opens a gate it halted). A call that settled meanwhile retires as below.
    const callsInFlight = input.calls.count();
    if (callsInFlight > 0) {
      input.log(Object.freeze({ kind: KIND, event: "RUNNER_BACKSTOP_CALL_IN_FLIGHT", calls: callsInFlight }));
      return;
    }
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
    // Integration M6: no model call in flight either (R1's counter). A keep-alive stop can end a task while its call
    // (a preview call takes up to 1,260 s) is still open; retiring under it would let the launcher's 30 s bound cut the
    // call and halt the gate both releases share. The next read retires once it settled.
    if (drained && input.executions.count() === 0 && input.calls.count() === 0) {
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
