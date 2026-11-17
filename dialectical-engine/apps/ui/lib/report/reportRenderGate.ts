/**
 * How many PDF reports the UI process makes at once, and who waits for one.
 *
 * Making a report (renderReportPdf) builds the whole React-PDF document and its
 * bytes in memory, in the UI process's one report worker thread
 * (reportRenderWorker.ts, NV-27): off the event loop that serves every page, but
 * in the same process, with its CPU and memory. Without a
 * bound, one signed-in owner firing many downloads at once could take that
 * process's CPU and memory from everyone else. So:
 *  - at most `concurrent` reports are made at once, in the whole process;
 *  - at most `waiting` more wait for a turn, each for at most `waitMs`;
 *  - one signed-in owner, whichever of their sessions asks, holds at most one
 *    place (making or waiting), so a second download from the same owner, while
 *    its first is still being made, is refused at once rather than queued.
 * A request beyond that is refused at once, with `retryAfterSeconds` as its
 * Retry-After. Nothing is cached: every report is made fresh, as before.
 */
export type ReportRenderLimits = Readonly<{
  concurrent: number;
  waiting: number;
  waitMs: number;
  retryAfterSeconds: number;
}>;

/**
 * The process's limits.
 *  - concurrent 2: the layout is CPU work on the one report worker
 *    thread, so a third report at once would not finish any sooner, it would
 *    only add a third document's memory (a CJK report holds its large fonts and
 *    page tree). Two lets one report's waits (font reads) overlap another's
 *    layout, and one slow report never blocks every other owner outright.
 *  - waiting 8: a burst of different owners (a class downloading together) is
 *    queued, not refused; since an owner holds one place, eight places means
 *    eight different owners are already waiting (the key is the owner, never
 *    the session: NV-26).
 *  - waitMs 20 s: a queued request never holds its connection for long; well
 *    under the server's 300 s request limit (apps/ui/server.mjs).
 *  - retryAfterSeconds 5: about one report's making time, so a retry usually
 *    finds the place free.
 */
export const REPORT_RENDER_LIMITS: ReportRenderLimits = Object.freeze({
  concurrent: 2,
  waiting: 8,
  waitMs: 20_000,
  retryAfterSeconds: 5
});

/**
 * The gate's answer: `admitted` with the one `release` the caller must call in
 * a `finally`; `busy` when this owner already has a report in progress (429);
 * `full` when the queue is full, the wait ran out, or the download was
 * abandoned while it waited (503, which no one then reads).
 */
export type ReportRenderAdmission =
  | Readonly<{ kind: "admitted"; release: () => void }>
  | Readonly<{ kind: "busy" | "full" }>;

const BUSY: ReportRenderAdmission = Object.freeze({ kind: "busy" as const });
const FULL: ReportRenderAdmission = Object.freeze({ kind: "full" as const });

export class ReportRenderGate {
  private active = 0;
  private readonly queue: Array<() => void> = [];
  /** The owners holding a place, making or waiting; held only while their request is in flight. */
  private readonly holders = new Set<string>();

  /** The seconds a refusal's Retry-After names. */
  readonly retryAfterSeconds: number;

  constructor(private readonly limits: ReportRenderLimits) {
    this.retryAfterSeconds = limits.retryAfterSeconds;
  }

  /**
   * A place for `owner`, at once or after a wait. `signal` is the request's
   * own: a download abandoned while it waits leaves the queue at once, freeing
   * its waiting place and its owner's. One abandoned after it was admitted is
   * the caller's to skip (it still releases in `finally`).
   */
  async admit(owner: string, signal?: AbortSignal): Promise<ReportRenderAdmission> {
    if (this.holders.has(owner)) return BUSY;
    if (this.active < this.limits.concurrent) {
      this.holders.add(owner);
      this.active += 1;
      return this.admitted(owner);
    }
    if (this.queue.length >= this.limits.waiting || signal?.aborted === true) return FULL;
    this.holders.add(owner);
    return new Promise<ReportRenderAdmission>((resolve) => {
      const settle = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", leave);
      };
      const turn = (): void => {
        settle();
        resolve(this.admitted(owner));
      };
      const leave = (): void => {
        settle();
        const index = this.queue.indexOf(turn);
        if (index >= 0) this.queue.splice(index, 1);
        this.holders.delete(owner);
        resolve(FULL);
      };
      const timer = setTimeout(leave, this.limits.waitMs);
      timer.unref();
      signal?.addEventListener("abort", leave, { once: true });
      this.queue.push(turn);
    });
  }

  /** The place, with a release that frees it once, however many times it is called. */
  private admitted(owner: string): ReportRenderAdmission {
    let released = false;
    return Object.freeze({
      kind: "admitted" as const,
      release: () => {
        if (released) return;
        released = true;
        this.holders.delete(owner);
        const next = this.queue.shift();
        // A waiting request takes the freed place directly: `active` is unchanged.
        if (next === undefined) this.active -= 1;
        else next();
      }
    });
  }
}
