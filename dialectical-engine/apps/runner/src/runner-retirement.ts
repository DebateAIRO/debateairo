/**
 * Side-by-side spec §4 (D1): how a release retires inside its own process. A retiring release "stops claiming; it lets
 * calls in flight settle". This file holds the two in-process pieces the hand-over reads, part 1:
 *
 *  · the task counter: how many Hatchet tasks of this runner are running now. A task is counted for its WHOLE handler,
 *    the verdict story included (the story runs inside the task after the work item is DONE), so "no task running"
 *    means no call of this release can still be made or awaited;
 *  · the retirement signal: two stops that start off and never go back. `stopClaims` makes `execute` answer NO_WORK
 *    before anything else (RUNNER_RETIRING); `stopCalls` makes the keep-alive refuse every further model call before it
 *    is sent (RUNNER_RETIRING, handled like RUNNER_CLAIM_LOST: the work item is left CLAIMED, and once its claim lapses
 *    the release taking over picks it up — the backstop).
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
