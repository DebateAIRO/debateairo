import { describe, expect, it } from "vitest";
import { createOrderedRecorder } from "../../apps/runner/src/ordered-recorder.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A promise whose settlement the test controls. */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

/** The value a synchronous call throws, or a failure if it did not throw. */
const thrownBy = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
};

describe("ordered recorder", () => {
  it("runs writes in position order even when they are requested out of order", async () => {
    const recorder = createOrderedRecorder(3);
    const ran: number[] = [];
    const write = (position: number) => async () => {
      ran.push(position);
      return `saved ${position}`;
    };

    const second = recorder.commit(2, write(2));
    const zero = recorder.commit(0, write(0));
    const first = recorder.commit(1, write(1));

    expect(await zero).toBe("saved 0");
    expect(await first).toBe("saved 1");
    expect(await second).toBe("saved 2");
    expect(ran).toEqual([0, 1, 2]);
  });

  it("never starts a write while an earlier write is still running", async () => {
    const recorder = createOrderedRecorder(2);
    const gate = deferred<void>();
    const events: string[] = [];

    const slow = recorder.commit(0, async () => {
      events.push("start 0");
      await gate.promise;
      events.push("end 0");
    });
    const next = recorder.commit(1, async () => {
      events.push("start 1");
    });

    await flush();
    expect(events).toEqual(["start 0"]);

    gate.resolve();
    await slow;
    await next;
    expect(events).toEqual(["start 0", "end 0", "start 1"]);
  });

  it("a skip unblocks the next position", async () => {
    const recorder = createOrderedRecorder(3);
    const ran: number[] = [];

    const second = recorder.commit(2, async () => { ran.push(2); });
    const first = recorder.commit(1, async () => { ran.push(1); });

    await flush();
    expect(ran).toEqual([]);

    recorder.skip(0);
    await first;
    await second;
    expect(ran).toEqual([1, 2]);
  });

  it("a write that rejects rejects only its own caller and the next position still runs", async () => {
    const recorder = createOrderedRecorder(2);

    const failing = recorder.commit(0, () => Promise.reject(new Error("boom")));
    const caught = failing.then(() => "resolved", (error: Error) => error.message);
    const after = recorder.commit(1, async () => "next");

    expect(await caught).toBe("boom");
    expect(await after).toBe("next");
  });

  it("a write that throws synchronously rejects only its own caller", async () => {
    const recorder = createOrderedRecorder(2);

    const failing = recorder.commit(0, () => {
      throw new Error("sync boom");
    });
    const caught = failing.then(() => "resolved", (error: Error) => error.message);
    const after = recorder.commit(1, async () => "next");

    expect(await caught).toBe("sync boom");
    expect(await after).toBe("next");
  });

  it("done() resolves only after the last position is committed", async () => {
    const recorder = createOrderedRecorder(2);
    let finished = false;
    void recorder.done().then(() => { finished = true; });

    const last = recorder.commit(1, async () => undefined);
    await flush();
    expect(finished).toBe(false);

    await recorder.commit(0, async () => undefined);
    await last;
    await flush();
    expect(finished).toBe(true);
  });

  it("done() also resolves when the last position is skipped", async () => {
    const recorder = createOrderedRecorder(2);
    const first = recorder.commit(0, async () => undefined);

    recorder.skip(1);
    await first;
    await expect(recorder.done()).resolves.toBeUndefined();
  });

  it("createOrderedRecorder(0).done() resolves at once", async () => {
    await expect(createOrderedRecorder(0).done()).resolves.toBeUndefined();
  });

  it("reusing a position throws a TypeError", () => {
    const recorder = createOrderedRecorder(2);
    void recorder.commit(0, async () => undefined);

    const error = thrownBy(() => recorder.commit(0, async () => undefined));
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe("ORDERED_RECORDER_POSITION_REUSED");
  });

  it("skipping a position that was already committed throws a TypeError", () => {
    const recorder = createOrderedRecorder(2);
    void recorder.commit(0, async () => undefined);

    const error = thrownBy(() => recorder.skip(0));
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe("ORDERED_RECORDER_POSITION_REUSED");
  });

  it("skipping a position twice throws a TypeError", () => {
    const recorder = createOrderedRecorder(2);
    recorder.skip(0);

    const error = thrownBy(() => recorder.skip(0));
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe("ORDERED_RECORDER_POSITION_REUSED");
  });

  it("a position outside [0, size) throws a TypeError", () => {
    const recorder = createOrderedRecorder(3);

    for (const position of [-1, 3, 1.5, Number.NaN]) {
      const commitError = thrownBy(() => recorder.commit(position, async () => undefined));
      expect(commitError).toBeInstanceOf(TypeError);
      expect((commitError as Error).message).toBe("ORDERED_RECORDER_POSITION_OUT_OF_RANGE");

      const skipError = thrownBy(() => recorder.skip(position));
      expect(skipError).toBeInstanceOf(TypeError);
      expect((skipError as Error).message).toBe("ORDERED_RECORDER_POSITION_OUT_OF_RANGE");
    }
  });

  it("a size that is not a non-negative integer throws a TypeError", () => {
    for (const size of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const error = thrownBy(() => createOrderedRecorder(size));
      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toBe("ORDERED_RECORDER_SIZE_INVALID");
    }
  });
});
