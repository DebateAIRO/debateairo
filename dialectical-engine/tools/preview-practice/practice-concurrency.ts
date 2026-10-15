/**
 * Preview practice: how many calls go at once (formats mode).
 *
 * Plain words: in formats mode the models work at the same time, each on its own list of jobs, so a slow model no
 * longer holds the others back. Three limits keep it polite:
 *  - one call at a time per model: a model's jobs go one after another (a job's call and its one 60-second resend are
 *    that model's single slot), with a small, slightly random gap between them;
 *  - at most so many calls at once per gate (the gate's own max_concurrent_calls when root's status names it, else 4
 *    for DeepInfra and 1 for Anthropic);
 *  - at most so many calls at once in all (the relay on the server accepts only so many connections).
 * `--sequential` keeps the old order: one call at a time, the models taking turns.
 */
import type { PreviewBudgetExecution, PreviewBudgetPort } from "@debateai/providers";

/** A counting semaphore: at most `limit` holders at once, served in arrival order. */
export class PracticeSemaphore {
  readonly #limit: number;
  readonly #queue: (() => void)[] = [];
  #held = 0;
  #most = 0;

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("PRACTICE_SEMAPHORE_LIMIT_INVALID");
    this.#limit = limit;
  }

  get limit(): number { return this.#limit; }
  /** Holders right now. */
  get held(): number { return this.#held; }
  /** The most holders there ever were at once. */
  get most(): number { return this.#most; }

  /** Waits for a place; the returned function gives it back (once). An abort while waiting gives up the wait. */
  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted === true) throw signal.reason ?? new Error("PRACTICE_CALL_ABORTED");
    if (this.#held < this.#limit && this.#queue.length === 0) {
      this.#take();
    } else {
      await new Promise<void>((resolve, reject) => {
        const turn = () => { signal?.removeEventListener("abort", aborted); this.#take(); resolve(); };
        const aborted = () => {
          const at = this.#queue.indexOf(turn);
          if (at >= 0) this.#queue.splice(at, 1);
          reject(signal?.reason ?? new Error("PRACTICE_CALL_ABORTED"));
        };
        this.#queue.push(turn);
        signal?.addEventListener("abort", aborted, { once: true });
      });
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#held -= 1;
      this.#queue.shift()?.();
    };
  }

  #take(): void {
    this.#held += 1;
    this.#most = Math.max(this.#most, this.#held);
  }
}

/**
 * The same port, but each call first takes a place in every semaphore given (in the order given, always the same
 * order, so two calls can never wait on each other) and gives them back when it settles.
 */
export function limitPort(port: PreviewBudgetPort, semaphores: readonly PracticeSemaphore[]): PreviewBudgetPort {
  return Object.freeze({
    execute: async (input: PreviewBudgetExecution, signal?: AbortSignal) => {
      const releases: (() => void)[] = [];
      try {
        for (const semaphore of semaphores) releases.push(await semaphore.acquire(signal));
        return await port.execute(input, signal);
      } finally {
        for (const release of releases.reverse()) release();
      }
    }
  });
}

/** A gap of about `gapMs`: between 75% and 125% of it, so the models' calls do not line up. */
export function jitteredGap(gapMs: number, random: () => number = Math.random): number {
  if (gapMs <= 0) return 0;
  return Math.round(gapMs * (0.75 + 0.5 * Math.min(1, Math.max(0, random()))));
}

/** A job that ended with its model busy: try the SAME job again after this wait (the model is parked meanwhile). */
export type PracticeJobRetry = Readonly<{ retryAfterMs: number }>;

/**
 * What a job turns into: null when it was skipped (and already recorded), or the call to make, which may ask for the
 * same job to be tried again after a wait. `prepare` runs right before the job's turn (and again before each retry),
 * so it sees every stop and busy mark made so far.
 */
export type PracticePreparedJob = (() => Promise<PracticeJobRetry | void>) | null;

/** Waits `milliseconds`, or less when the signal aborts (an interrupt cancels a wait at once). */
export async function abortableWait(sleep: (milliseconds: number) => Promise<void>, milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal === undefined) { await sleep(milliseconds); return; }
  if (signal.aborted) return;
  let onAbort = () => undefined as void;
  const aborted = new Promise<void>((resolve) => { onAbort = () => resolve(); signal.addEventListener("abort", onAbort, { once: true }); });
  try {
    await Promise.race([sleep(milliseconds), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Runs each model's jobs.
 *  - sequential: one at a time, the models taking turns, each its next job (the old order), a fixed gap before every
 *    call but the first;
 *  - parallel: every model at once, each model's jobs one after another (one call in flight per model), a jittered gap
 *    before each of a model's calls but its first.
 * A skipped job costs no gap. A job that asks to be retried parks its model for the wait it names, then the same job is
 * prepared again; the other models go on meanwhile (sequential: the parked model gives up its turns until its wait is
 * over; when every model left is parked, the run waits for the first one). The signal (the operator's interrupt) cuts
 * every wait short.
 */
export async function runModelQueues<T, J>(input: Readonly<{
  models: readonly T[];
  jobs: readonly J[];
  parallel: boolean;
  gapMs: number;
  prepare: (model: T, job: J) => PracticePreparedJob;
  sleep: (milliseconds: number) => Promise<void>;
  random?: () => number;
  /** Cuts the busy waits short. */
  signal?: AbortSignal;
  /** The clock the sequential mode parks a model by (test seam). */
  now?: () => number;
}>): Promise<void> {
  if (!input.parallel) {
    const now = input.now ?? (() => Date.now());
    const position = input.models.map(() => 0);
    const parkedUntil = new Map<number, number>();
    let turn = 0;
    let first = true;
    const left = () => input.models.some((_model, index) => position[index]! < input.jobs.length);
    while (left()) {
      let picked: number | null = null;
      for (let step = 0; step < input.models.length; step += 1) {
        const index = (turn + step) % input.models.length;
        const until = parkedUntil.get(index);
        if (position[index]! < input.jobs.length && (until === undefined || now() >= until)) { picked = index; break; }
      }
      if (picked === null) {
        // Every model left is parked: wait for the first, which then goes whatever the clock says.
        const [index, until] = [...parkedUntil.entries()].sort(([, a], [, b]) => a - b)[0]!;
        await abortableWait(input.sleep, Math.max(0, until - now()), input.signal);
        parkedUntil.delete(index);
        continue;
      }
      turn = (picked + 1) % input.models.length;
      parkedUntil.delete(picked);
      const send = input.prepare(input.models[picked]!, input.jobs[position[picked]!]!);
      if (send === null) { position[picked] = position[picked]! + 1; continue; }
      if (!first && input.gapMs > 0) await input.sleep(input.gapMs);
      first = false;
      const retry = await send();
      if (typeof retry !== "object") position[picked] = position[picked]! + 1;
      else parkedUntil.set(picked, now() + retry.retryAfterMs);
    }
    return;
  }
  await Promise.all(input.models.map(async (model) => {
    let sent = false;
    for (const job of input.jobs) {
      for (;;) {
        // The gap comes first, so the job is prepared after it and sees a stop made meanwhile.
        if (sent) {
          const gap = jitteredGap(input.gapMs, input.random);
          if (gap > 0) await input.sleep(gap);
          sent = false;
        }
        const send = input.prepare(model, job);
        if (send === null) break;
        const retry = await send();
        sent = true;
        if (typeof retry !== "object") break;
        // Parked: the same job again after the wait (no gap on top of it).
        await abortableWait(input.sleep, retry.retryAfterMs, input.signal);
        sent = false;
      }
    }
  }));
}
