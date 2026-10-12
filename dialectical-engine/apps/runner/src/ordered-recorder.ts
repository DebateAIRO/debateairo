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
  /** Marks a position as having nothing to write (a skipped or failed chain). */
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

  const claim = (position: number): void => {
    if (!Number.isInteger(position) || position < 0 || position >= size) {
      throw new TypeError("ORDERED_RECORDER_POSITION_OUT_OF_RANGE");
    }
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
      claim(position);
      skipped.add(position);
      advance();
    },
    done(): Promise<void> {
      return finished;
    }
  };
}
