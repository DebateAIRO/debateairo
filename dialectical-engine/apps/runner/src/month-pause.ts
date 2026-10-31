import { MonthWallReachedError, isMonthWallReached, type WebSearchCostSeam } from "@debateai/budget";
import type { ProviderCostEnvelopeSeam } from "@debateai/providers";

/**
 * The money rule (owner, 31 Oct 2026, point 5; plan 2026-10-30 dig-model revision W3-2) — THE MONTH PAUSE, the
 * runner's half.
 *
 * At a billingPlans v4 month's wall the shared wall refuses a call while the debate is argued with
 * `MonthWallReachedError` (packages/budget, `decideMonthWall`). Everything runs in parallel, so the debate's other
 * planned calls and searches meet the same wall. Here, around each call's admission:
 *  - a refusal at the month wall records the pause once (0134's `record_run_pause`, reason MONTH_WALL, from the month's
 *    reset, with the planned work held at the wall: its calls and searches), and the call WAITS instead of being sent;
 *  - a debate whose newest pause event is PAUSED is not continued: every further call and search of it waits too;
 *  - when the person presses Continue (the API records RESUMED once the new month has room), each waiting call asks
 *    for its admission again and goes on. Nothing already done is redone, so nothing is paid twice (true resume).
 * A wait is bounded (`MONTH_PAUSE_HOLD_MS`, inside the debate's own time limit): past it the call ends with the month's
 * refusal, which stops the arguing as before (the answer is still written from what exists). Calls already in flight at
 * the wall are not stopped; they finish within the month's tolerance. Calls the wall never measures (the first
 * position's own call, the answer, the story, a dig's path rewrite) are never held here.
 */
export interface MonthPauseStore {
  recordPause(input: Readonly<{ runId: string; reason: "MONTH_WALL"; resumableAt: Date; plannedCalls: number;
    plannedSearches: number; plannedMicros: number }>): Promise<"RECORDED" | "ALREADY_PAUSED" | "NOT_LIVE">;
  readPause(runId: string): Promise<Readonly<{ state: "NONE" | "PAUSED" | "RESUMED" }> | null>;
}

/** How long one call waits at the month wall before the arguing stops as before: two hours, inside the run's own limit. */
const MONTH_PAUSE_HOLD_MS = 2 * 60 * 60 * 1000;
/** How often a waiting call reads the pause again, and how long a read is trusted by the next admission. */
const MONTH_PAUSE_POLL_MS = 15_000;

export type MonthPauseOptions = Readonly<{
  store: MonthPauseStore;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  holdMs?: number;
  pollMs?: number;
}>;

type Kind = "call" | "search";

export class MonthPause {
  readonly #store: MonthPauseStore;
  readonly #clock: () => Date;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #holdMs: number;
  readonly #pollMs: number;
  /** Per run: the calls and searches waiting at the wall right now. */
  readonly #waiting = new Map<string, { call: number; search: number }>();
  /** Per run: the last pause read and when it was made. */
  readonly #seen = new Map<string, Readonly<{ paused: boolean; at: number }>>();

  constructor(options: MonthPauseOptions) {
    this.#store = options.store;
    this.#clock = options.clock ?? (() => new Date());
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref(); }));
    this.#holdMs = options.holdMs ?? MONTH_PAUSE_HOLD_MS;
    this.#pollMs = options.pollMs ?? MONTH_PAUSE_POLL_MS;
    for (const value of [this.#holdMs, this.#pollMs]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("MONTH_PAUSE_OPTIONS_INVALID");
    }
  }

  /** The planned work held at the wall now, for the run read and the pause record. */
  waitingOf(runId: string): Readonly<{ calls: number; searches: number }> {
    const waiting = this.#waiting.get(runId);
    return Object.freeze({ calls: waiting?.call ?? 0, searches: waiting?.search ?? 0 });
  }

  /**
   * One admission under the month pause: wait while the debate is paused, then admit; at the wall, record the pause
   * and wait for Continue, then admit again. Any other refusal passes through untouched.
   */
  async admit<T>(runId: string, kind: Kind, admitOnce: () => Promise<T>): Promise<T> {
    const deadline = this.#clock().getTime() + this.#holdMs;
    let wall: unknown = null;
    for (;;) {
      if (await this.#paused(runId, false)) {
        // Held past the deadline: the month's own refusal, so the arguing stops exactly as at the wall.
        if (!(await this.#waitWhilePaused(runId, kind, deadline))) throw wall ?? new MonthWallReachedError(this.#clock());
      }
      try {
        return await admitOnce();
      } catch (error) {
        if (!isMonthWallReached(error)) throw error;
        wall = error;
        const waiting = this.waitingOf(runId);
        await this.#store.recordPause({ runId, reason: "MONTH_WALL", resumableAt: error.resumableAt,
          plannedCalls: waiting.calls + (kind === "call" ? 1 : 0), plannedSearches: waiting.searches + (kind === "search" ? 1 : 0),
          plannedMicros: 0 });
        this.#seen.set(runId, Object.freeze({ paused: true, at: this.#clock().getTime() }));
        if (!(await this.#waitWhilePaused(runId, kind, deadline))) throw error;
      }
    }
  }

  /** Whether the run's newest pause event is PAUSED; a read younger than the poll interval is trusted. */
  async #paused(runId: string, fresh: boolean): Promise<boolean> {
    const now = this.#clock().getTime();
    const seen = this.#seen.get(runId);
    if (!fresh && seen !== undefined && now - seen.at < this.#pollMs) return seen.paused;
    const paused = (await this.#store.readPause(runId))?.state === "PAUSED";
    this.#seen.set(runId, Object.freeze({ paused, at: now }));
    return paused;
  }

  /** Waits, counted as planned work held at the wall, until the pause ends (true) or the hold's deadline passes (false). */
  async #waitWhilePaused(runId: string, kind: Kind, deadline: number): Promise<boolean> {
    const waiting = this.#waiting.get(runId) ?? { call: 0, search: 0 };
    waiting[kind] += 1;
    this.#waiting.set(runId, waiting);
    try {
      for (;;) {
        if (this.#clock().getTime() >= deadline) return false;
        await this.#sleep(this.#pollMs);
        if (!(await this.#paused(runId, true))) return true;
      }
    } finally {
      waiting[kind] -= 1;
      if (waiting.call === 0 && waiting.search === 0) this.#waiting.delete(runId);
    }
  }
}

/**
 * The composition's hook (main.ts and the practice runner, the same statement): a call the month wall measures — one
 * made while arguing (BODY) and walled (APPLY, not the first position's own call) — is held under the month pause; every
 * other seam (an answer-writing call, the first position's) is returned as it is, so it never waits.
 */
export function monthPaused<S extends ProviderCostEnvelopeSeam>(seam: S, call: Readonly<{ runId: string; phase: "BODY" | "SERVE";
  sharedWall: "APPLY" | "EXEMPT"; pause: MonthPause }>): S {
  return call.phase === "BODY" && call.sharedWall === "APPLY" ? withMonthPause(seam, call.runId, call.pause) : seam;
}

/** A provider call's money seam under the month pause: only its admission is wrapped; charging never waits. */
export function withMonthPause<S extends ProviderCostEnvelopeSeam>(seam: S, runId: string, pause: MonthPause): S {
  return Object.freeze({
    ...seam,
    assertCallAllowed: (projection: Parameters<ProviderCostEnvelopeSeam["assertCallAllowed"]>[0]) =>
      pause.admit(runId, "call", async () => seam.assertCallAllowed(projection))
  });
}

/** A web search's money seam under the month pause (for the web step's search seam, W3-1). */
export function withMonthPauseSearch(seam: WebSearchCostSeam, runId: string, pause: MonthPause): WebSearchCostSeam {
  return Object.freeze({
    ...seam,
    assertSearchAllowed: (options?: Parameters<WebSearchCostSeam["assertSearchAllowed"]>[0]) =>
      pause.admit(runId, "search", () => seam.assertSearchAllowed(options))
  });
}
