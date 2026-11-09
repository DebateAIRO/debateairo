/**
 * Parallel AI calls (docs/superpowers/specs/2026-10-12-parallel-calls-design.md §2.1) —
 * the ordered recorder.
 *
 * Calls finish in any order, but what they save (nodes, edges, reductions, reviews)
 * must land in one fixed plan order, so each position's write runs only once every
 * earlier position has been committed or skipped. Writes never overlap. A write that
 * rejects settles only the `commit` call that requested it; the cursor still moves on,
 * so later positions cannot deadlock behind a failed save.
 */

export interface OrderedRecorder {
  /** Runs `write` once every position below `position` has committed or been skipped. Resolves/rejects with write's result. */
  commit<T>(position: number, write: () => Promise<T>): Promise<T>;
  /** Marks a position as having nothing to write (a skipped or failed chain). Idempotent. */
  skip(position: number): void;
  /** Resolves when every position in [0, size) is committed or skipped. */
  done(): Promise<void>;
}

interface WaitingWrite {
  write: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export function createOrderedRecorder(size: number): OrderedRecorder {
  if (!Number.isInteger(size) || size < 0) {
    throw new TypeError("ORDERED_RECORDER_SIZE_INVALID");
  }

  const claimed = new Set<number>();
  const skipped = new Set<number>();
  const waiting = new Map<number, WaitingWrite>();
  let cursor = 0;
  let running = false;
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const checkRange = (position: number): void => {
    if (!Number.isInteger(position) || position < 0 || position >= size) {
      throw new TypeError("ORDERED_RECORDER_POSITION_OUT_OF_RANGE");
    }
  };

  // A position is claimed by its first commit or skip. Claiming it again throws,
  // except that a repeated skip of a skipped position is a no-op (see skip below).
  const claim = (position: number): void => {
    checkRange(position);
    if (claimed.has(position)) {
      throw new TypeError("ORDERED_RECORDER_POSITION_REUSED");
    }
    claimed.add(position);
  };

  // Starts the write at the cursor. `running` is set first, so a write that calls
  // back into the recorder synchronously cannot start a second write.
  const launch = (position: number, waitingWrite: WaitingWrite): void => {
    running = true;
    new Promise<unknown>((resolve) => resolve(waitingWrite.write()))
      .then(waitingWrite.resolve, waitingWrite.reject)
      .then(() => {
        running = false;
        cursor = position + 1;
        advance();
      });
  };

  const advance = (): void => {
    while (!running) {
      if (cursor >= size) {
        finish();
        return;
      }
      if (skipped.has(cursor)) {
        cursor += 1;
        continue;
      }
      const next = waiting.get(cursor);
      if (next === undefined) return;
      waiting.delete(cursor);
      launch(cursor, next);
    }
  };

  advance();

  return {
    commit<T>(position: number, write: () => Promise<T>): Promise<T> {
      claim(position);
      return new Promise<T>((resolve, reject) => {
        waiting.set(position, {
          write: () => write(),
          resolve: (value) => resolve(value as T),
          reject
        });
        advance();
      });
    },
    skip(position: number): void {
      checkRange(position);
      // Idempotent: a second skip of an already-skipped position changes nothing.
      // Skipping a committed or commit-pending position still throws (claim).
      if (skipped.has(position)) return;
      claim(position);
      skipped.add(position);
      advance();
    },
    done(): Promise<void> {
      return finished;
    }
  };
}

/**
 * V4 start step, Task 53b (spec 2026-11-03 §4.3, the owner's "First round" answer: each path fills in as soon as its own arguing
 * and checks end, and "does not wait for the other paths") — ONE ORDERED RECORDER PER PART. The positions [0, size) fall into
 * parts (`partOf`; on a path debate, the path a plan position argues under). Each part's positions are written in their plan
 * order, as `createOrderedRecorder` writes all of them: a write runs once every EARLIER position OF ITS PART has been committed
 * (its write settled) or skipped, so the writes of one part never overlap. No part waits on another, and two parts' writes may
 * run side by side. A position whose part is null orders with nothing. `partOf` is asked only when a position is committed, for
 * that position and the ones below it, so a part may be known late (a scrutiny slot's path, once scrutiny chose its node); it
 * must not change once asked. A write that rejects settles only the `commit` call that requested it, as there. With one part
 * for every position, this writes in plan order.
 */
export function createPartedOrderedRecorder(size: number, partOf: (position: number) => number | null): OrderedRecorder {
  if (!Number.isInteger(size) || size < 0) {
    throw new TypeError("ORDERED_RECORDER_SIZE_INVALID");
  }

  const claimed = new Set<number>();
  const skipped = new Set<number>();
  /** Each position's turn, over: its write has settled, or it was skipped. */
  const settled = Array.from({ length: size }, () => {
    let resolve!: () => void;
    const promise = new Promise<void>((settle) => { resolve = settle; });
    return { promise, resolve };
  });

  const checkRange = (position: number): void => {
    if (!Number.isInteger(position) || position < 0 || position >= size) {
      throw new TypeError("ORDERED_RECORDER_POSITION_OUT_OF_RANGE");
    }
  };

  // As createOrderedRecorder: a position is claimed by its first commit or skip, and claiming it again throws, except that a
  // repeated skip of a skipped position is a no-op.
  const claim = (position: number): void => {
    checkRange(position);
    if (claimed.has(position)) {
      throw new TypeError("ORDERED_RECORDER_POSITION_REUSED");
    }
    claimed.add(position);
  };

  return {
    commit<T>(position: number, write: () => Promise<T>): Promise<T> {
      claim(position);
      const part = partOf(position);
      const earlier = part === null ? [] : settled.slice(0, position).filter((_turn, below) => partOf(below) === part);
      const written = Promise.all(earlier.map((turn) => turn.promise)).then(() => write());
      written.then(() => settled[position]!.resolve(), () => settled[position]!.resolve());
      return written;
    },
    skip(position: number): void {
      checkRange(position);
      if (skipped.has(position)) return;
      claim(position);
      skipped.add(position);
      settled[position]!.resolve();
    },
    done(): Promise<void> {
      return Promise.all(settled.map((turn) => turn.promise)).then(() => undefined);
    }
  };
}
