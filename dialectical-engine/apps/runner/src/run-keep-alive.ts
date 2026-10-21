import { AsyncLocalStorage } from "node:async_hooks";
import type { ClaimRenewal } from "@debateai/battery";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderGateway } from "@debateai/providers";

/**
 * L4-F9 repair (owner ruling 2026-10-11, options 1 + 3) — what a RUNNING debate
 * does about the two windows it lives in.
 *
 * A debate is one work item, claimed once for a window sized to ONE model call
 * (`assertClaimCoversCall`), and one Hatchet task with a 60-minute limit. A
 * debate makes many calls, so the claim lapsed while it was still running, and
 * Hatchet's cancel at the limit reached a signal nobody read: the debate went
 * on, and the retry Hatchet sends after a timeout claimed the lapsed item and
 * ran the whole debate a second time.
 *
 *  · The claim is renewed while the debate runs, each renewal fenced on the
 *    deadline it last saw, so a second dispatch finds the item taken and stands
 *    down. A renewal that finds another copy's claim stops this copy.
 *  · After a model call finishes, Hatchet is told the debate is still working,
 *    so the limit means 60 minutes WITHOUT a finished call. After six hours of
 *    running it is told nothing more, so no debate outlives seven.
 *  · When Hatchet gives up (or its limit passes here without the cancel ever
 *    arriving), or the claim is somebody else's, every further model call is
 *    refused before anything is sent. Nothing more is spent, whatever catch the
 *    refusal travels through on its way out.
 *  · Side-by-side spec §4: the same once this release is retiring
 *    (RUNNER_RETIRING), and the calls already sent settle.
 */

/** Owner ruling 2026-10-11: no debate is reported "still working" after six hours. */
export const RUNNER_PROGRESS_CEILING_MS = 6 * 60 * 60 * 1_000;

/** Hatchet adds each report to its own deadline; reporting more than once a minute buys nothing. */
const PROGRESS_REPORT_MIN_GAP_MS = 60_000;

/** What the Hatchet task hands the debate it runs. */
export type RunnerTaskControl = Readonly<{
  /** The task's execution limit, as registered with Hatchet. */
  executionLimitMs: number;
  /** Aborted when Hatchet gives up on the task. */
  signal?: AbortSignal;
  /** Hatchet's own timeout extension: ADDS the increment to the task's deadline. */
  refreshTimeout?(incrementBy: `${number}s`): Promise<void>;
}>;

export interface RunKeepAlive {
  /**
   * Throws RUNNER_CLAIM_LOST, RUNNER_RETIRING (side-by-side spec §4: this release is retiring) or
   * RUNNER_TIME_LIMIT_REACHED, in that order, when the debate must make no further model call.
   */
  assertMayCall(): void;
  /** A model call finished, answered or failed. */
  progressed(): void;
  /**
   * The claim deadline this copy last set (at claim, then at each renewal). Reclaim resume: the runner's one write that
   * can change rows another copy saved (setting nodes aside) is fenced on it, as a renewal is.
   */
  heldUntil(): Date;
  stop(): void;
}

type KeepAliveClock = Readonly<{
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}>;

const systemClock: KeepAliveClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    // A renewal never keeps a process alive on its own.
    timer.unref();
    return timer;
  },
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/** A content-free log line: a fixed kind, and a five-character SQLSTATE when there is one. */
function logKeepAlive(line: Readonly<Record<string, string>>): void {
  console.warn(JSON.stringify(line));
}

function failureLine(kind: string, error: unknown): Readonly<Record<string, string>> {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return Object.freeze({
    kind,
    ...(typeof code === "string" && /^[0-9A-Z]{5}$/u.test(code) ? { sqlState: code } : {})
  });
}

export function startRunKeepAlive(input: Readonly<{
  claimDeadline: Date;
  renewEveryMs: number;
  renew: (heldUntil: Date) => Promise<ClaimRenewal>;
  task?: RunnerTaskControl;
  clock?: KeepAliveClock;
  log?: (line: Readonly<Record<string, string>>) => void;
  /**
   * Side-by-side spec §4 (D1): true once this release is retiring. A retiring release "lets calls in flight settle":
   * nothing already sent is cut off, and every further call is refused before it is sent (RUNNER_RETIRING).
   */
  stopCalls?: () => boolean;
}>): RunKeepAlive {
  if (!Number.isFinite(input.renewEveryMs) || input.renewEveryMs <= 0) {
    throw new TypeError("RUNNER_CLAIM_RENEWAL_INTERVAL_INVALID");
  }
  const clock = input.clock ?? systemClock;
  const log = input.log ?? logKeepAlive;
  const task = input.task;
  const startedAt = clock.now();
  let heldUntil = input.claimDeadline;
  let lost = false;
  let stopped = false;
  let timer: unknown;
  let reportedAt = startedAt;
  let limitAt = task === undefined ? Number.POSITIVE_INFINITY : startedAt + task.executionLimitMs;

  const beat = (): void => {
    timer = clock.setTimeout(() => {
      void input.renew(heldUntil).then((renewal) => {
        if (stopped) return;
        if (renewal.kind === "RENEWED") {
          heldUntil = renewal.claimDeadline;
          beat();
        } else if (renewal.kind === "LOST") {
          lost = true;
        }
        // FINISHED: the job is settled; no copy can claim it any more.
      }, (error: unknown) => {
        if (stopped) return;
        try { log(failureLine("RUNNER_CLAIM_RENEWAL_FAILED", error)); } catch { /* a log line never stops a debate */ }
        beat();
      });
    }, input.renewEveryMs);
  };
  beat();

  return {
    assertMayCall() {
      if (lost) {
        throw new TypedDomainError("RUNNER_CLAIM_LOST", "Another copy of this debate holds its work item");
      }
      // After the lost claim (another copy holds the debate, whatever this release does), before the time limit.
      if (input.stopCalls?.() === true) {
        throw new TypedDomainError("RUNNER_RETIRING", "This release is retiring; the debate makes no further model call");
      }
      if (task !== undefined && (task.signal?.aborted === true || clock.now() >= limitAt)) {
        throw new TypedDomainError("RUNNER_TIME_LIMIT_REACHED", "The debate reached its time limit");
      }
    },
    progressed() {
      if (task?.refreshTimeout === undefined) return;
      const now = clock.now();
      if (now - startedAt >= RUNNER_PROGRESS_CEILING_MS) return;
      const seconds = Math.floor((now - reportedAt) / 1_000);
      if (seconds * 1_000 < PROGRESS_REPORT_MIN_GAP_MS) return;
      reportedAt += seconds * 1_000;
      limitAt += seconds * 1_000;
      const reportFailed = (error: unknown) => {
        try { log(failureLine("RUNNER_TIMEOUT_REFRESH_FAILED", error)); } catch { /* never the debate's */ }
      };
      try {
        void task.refreshTimeout(`${seconds}s`).catch(reportFailed);
      } catch (error) {
        reportFailed(error);
      }
    },
    heldUntil() {
      return heldUntil;
    },
    stop() {
      stopped = true;
      clock.clearTimeout(timer);
    }
  };
}

/** The keep-alive of the debate running in this async context, if any. */
export const runKeepAliveScope = new AsyncLocalStorage<RunKeepAlive>();

/**
 * The runner's model gateways, seen through the keep-alive of the debate making
 * the call: refused before anything is sent once that debate must stop, and
 * reported as progress once the call has finished either way. Outside a debate
 * (no keep-alive in scope) a call passes straight through.
 */
export function keepAliveProviderGateway(provider: ProviderGateway): ProviderGateway {
  return {
    async call(request) {
      const keepAlive = runKeepAliveScope.getStore();
      if (keepAlive === undefined) return provider.call(request);
      keepAlive.assertMayCall();
      try {
        return await provider.call(request);
      } finally {
        keepAlive.progressed();
      }
    }
  };
}
