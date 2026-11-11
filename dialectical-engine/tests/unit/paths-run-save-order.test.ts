// tests/unit/paths-run-save-order.test.ts — V4 start step, Task 53b (spec 2026-11-03 §4.3, the owner's "First round" answer: each
// path fills in as soon as its own arguing and checks end, and "does not wait for the other paths"; the coordinator's ruling of
// 5 Nov). On a path debate each path saves in its own order: one ordered recorder PER PATH over that path's own plan positions
// (`createPartedOrderedRecorder`), so a slow path never holds back another path's saves, reviews or "over" signals, and each path's
// saves keep that path's plan order. A run with no paths keeps the one plan order (`createOrderedRecorder`, whose own tests in
// tests/unit/ordered-recorder.test.ts are unedited). Scripted recorders: every call is a promise the test settles.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createOrderedRecorder, createPartedOrderedRecorder, type OrderedRecorder } from "../../apps/runner/src/ordered-recorder.js";

const flush = async (): Promise<void> => { for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

/** A promise whose settlement the test controls. */
const deferred = <T = void>() => {
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

/**
 * A path debate's round-1 plan as buildShapePlan lays it out (apps/runner/src/shape-plan.ts): the roots first (root i argues
 * b<i+1>), then each root's legs together, root by root. Three paths, two legs each: b1 = 0, 3, 4; b2 = 1, 5, 6; b3 = 2, 7, 8.
 */
const PATHS = 3;
const LEGS = 2;
const SIZE = PATHS + PATHS * LEGS;
const pathOf = (position: number): number => position < PATHS ? position : Math.floor((position - PATHS) / LEGS);
const positionsOf = (path: number): readonly number[] => [path, ...Array.from({ length: LEGS }, (_, leg) => PATHS + path * LEGS + leg)];
const nameOf = (path: number): string => `b${String(path + 1)}`;

/**
 * The runner's three recorders over one scripted debate: every position's author call, then its node saved (the node recorder),
 * then its review call, then its review recorded (the review recorder). A path's arguing is over once every node of its own is
 * saved; its checks once every review of its own is recorded. `events` keeps, in the order they happened, each save, each review
 * and each path's two "over" signals.
 */
function scriptedDebate(recorderOf: (size: number) => OrderedRecorder) {
  const nodes = recorderOf(SIZE);
  const reviews = recorderOf(SIZE);
  const authored = Array.from({ length: SIZE }, () => deferred());
  const reviewed = Array.from({ length: SIZE }, () => deferred());
  const events: string[] = [];
  const saved = Array.from({ length: SIZE }, () => deferred());
  const recorded = Array.from({ length: SIZE }, () => deferred());
  for (let position = 0; position < SIZE; position += 1) {
    void (async () => {
      await authored[position]!.promise;
      await nodes.commit(position, async () => { events.push(`save ${String(position)}`); });
      saved[position]!.resolve();
      await reviewed[position]!.promise;
      await reviews.commit(position, async () => { events.push(`review ${String(position)}`); });
      recorded[position]!.resolve();
    })();
  }
  for (let path = 0; path < PATHS; path += 1) {
    void Promise.all(positionsOf(path).map((position) => saved[position]!.promise)).then(() => { events.push(`arguing over ${nameOf(path)}`); });
    void Promise.all(positionsOf(path).map((position) => recorded[position]!.promise)).then(() => { events.push(`checks over ${nameOf(path)}`); });
  }
  /** Answers the author and review calls of these positions, in the order given. */
  const answer = (positions: readonly number[]): void => {
    for (const position of positions) {
      authored[position]!.resolve();
      reviewed[position]!.resolve();
    }
  };
  /** The saves of one path, in the order they ran. */
  const savesOf = (path: number): number[] => events.flatMap((event) => {
    const match = /^save (\d+)$/u.exec(event);
    return match !== null && pathOf(Number(match[1])) === path ? [Number(match[1])] : [];
  });
  return { events, answer, savesOf, nodes, reviews };
}

const parted = (size: number): OrderedRecorder => createPartedOrderedRecorder(size, pathOf);

describe("on a path debate each path saves in its own order (Task 53b)", () => {
  it("b1's legs slower than b2's and b3's: b2 and b3 reach 'arguing over' and 'checks over' before b1 does", async () => {
    const debate = scriptedDebate(parted);
    // The roots return (root 0 first, as the runner asks it alone), then every leg but b1's.
    debate.answer([0, 1, 2, 5, 6, 7, 8]);
    await flush();
    expect(debate.events).toEqual(expect.arrayContaining(["arguing over b2", "arguing over b3", "checks over b2", "checks over b3"]));
    expect(debate.events).not.toContain("arguing over b1");
    expect(debate.events).not.toContain("checks over b1");
    // b1's slow legs land last: then b1 is over too, after the other two.
    debate.answer([3, 4]);
    await flush();
    const at = (event: string): number => debate.events.indexOf(event);
    expect(at("arguing over b1")).toBeGreaterThan(Math.max(at("arguing over b2"), at("arguing over b3")));
    expect(at("checks over b1")).toBeGreaterThan(Math.max(at("checks over b2"), at("checks over b3")));
    await expect(Promise.all([debate.nodes.done(), debate.reviews.done()])).resolves.toBeDefined();
  });

  it("the one plan order (a run with no paths) holds b2 and b3 back behind b1's slow legs: why a path debate has a recorder per path", async () => {
    const debate = scriptedDebate(createOrderedRecorder);
    debate.answer([0, 1, 2, 5, 6, 7, 8]);
    await flush();
    expect(debate.events.filter((event) => event.includes("over"))).toEqual([]);
    debate.answer([3, 4]);
    await flush();
    expect(debate.events.filter((event) => event.startsWith("save "))).toEqual(
      ["save 0", "save 1", "save 2", "save 3", "save 4", "save 5", "save 6", "save 7", "save 8"]);
  });

  it("each path's own saves stay in that path's plan order, whichever of its calls returns first", async () => {
    const debate = scriptedDebate(parted);
    // The paths in reverse, each path's calls last leg first.
    for (const path of [2, 1, 0]) {
      debate.answer([...positionsOf(path)].reverse());
      await flush();
    }
    for (let path = 0; path < PATHS; path += 1) expect(debate.savesOf(path)).toEqual([...positionsOf(path)]);
    // The paths themselves saved side by side, b3 first: no one plan order across them.
    expect(debate.events.filter((event) => event.startsWith("save "))).toEqual(
      ["save 2", "save 7", "save 8", "save 1", "save 5", "save 6", "save 0", "save 3", "save 4"]);
  });

  it("two runs of the same plan with different path timing store each path's nodes in the same order", async () => {
    const run = async (pathOrder: readonly number[]) => {
      const debate = scriptedDebate(parted);
      for (const path of pathOrder) {
        debate.answer(positionsOf(path));
        await flush();
      }
      return debate;
    };
    // b1 slow in the first run, b3 slow in the second.
    const first = await run([1, 2, 0]);
    const second = await run([0, 1, 2]);
    for (let path = 0; path < PATHS; path += 1) expect(first.savesOf(path)).toEqual(second.savesOf(path));
    // Across paths the saves came in a different order.
    expect(first.events.filter((event) => event.startsWith("save "))).not.toEqual(second.events.filter((event) => event.startsWith("save ")));
  });
});

describe("createPartedOrderedRecorder (Task 53b)", () => {
  it("with every position in one part it writes in plan order, as createOrderedRecorder does", async () => {
    const recorder = createPartedOrderedRecorder(3, () => 0);
    const ran: number[] = [];
    const write = (position: number) => async () => { ran.push(position); return `saved ${String(position)}`; };
    const second = recorder.commit(2, write(2));
    const zero = recorder.commit(0, write(0));
    const first = recorder.commit(1, write(1));
    expect(await zero).toBe("saved 0");
    expect(await first).toBe("saved 1");
    expect(await second).toBe("saved 2");
    expect(ran).toEqual([0, 1, 2]);
  });

  it("never starts a write of a part while an earlier write of that part runs; another part's write goes on", async () => {
    // Parts: 0 = {0, 2}, 1 = {1, 3}.
    const recorder = createPartedOrderedRecorder(4, (position) => position % 2);
    const gate = deferred();
    const events: string[] = [];
    const slow = recorder.commit(0, async () => { events.push("start 0"); await gate.promise; events.push("end 0"); });
    const sameNext = recorder.commit(2, async () => { events.push("start 2"); });
    const other = recorder.commit(1, async () => { events.push("start 1"); });
    const otherNext = recorder.commit(3, async () => { events.push("start 3"); });
    await flush();
    expect(events).toEqual(["start 0", "start 1", "start 3"]);
    gate.resolve();
    await Promise.all([slow, sameNext, other, otherNext]);
    expect(events).toEqual(["start 0", "start 1", "start 3", "end 0", "start 2"]);
  });

  it("a skip unblocks only its own part's later positions", async () => {
    const recorder = createPartedOrderedRecorder(4, (position) => position % 2);
    const ran: number[] = [];
    const later = recorder.commit(2, async () => { ran.push(2); });
    const otherLater = recorder.commit(3, async () => { ran.push(3); });
    await flush();
    expect(ran).toEqual([]);
    recorder.skip(0);
    await later;
    await flush();
    expect(ran).toEqual([2]);
    recorder.skip(1);
    await otherLater;
    expect(ran).toEqual([2, 3]);
    await expect(recorder.done()).resolves.toBeUndefined();
  });

  it("a write that rejects (or throws) rejects only its own caller and the next position of its part still runs", async () => {
    const recorder = createPartedOrderedRecorder(4, (position) => position % 2);
    const failing = recorder.commit(0, () => Promise.reject(new Error("boom")));
    const throwing = recorder.commit(1, () => { throw new Error("sync boom"); });
    const caught = failing.then(() => "resolved", (error: Error) => error.message);
    const thrown = throwing.then(() => "resolved", (error: Error) => error.message);
    const after = recorder.commit(2, async () => "next");
    const otherAfter = recorder.commit(3, async () => "other next");
    expect(await caught).toBe("boom");
    expect(await thrown).toBe("sync boom");
    expect(await after).toBe("next");
    expect(await otherAfter).toBe("other next");
  });

  it("a position whose part is null orders with nothing", async () => {
    const recorder = createPartedOrderedRecorder(3, (position) => position === 2 ? null : 0);
    const ran: number[] = [];
    const loose = recorder.commit(2, async () => { ran.push(2); });
    await loose;
    expect(ran).toEqual([2]);
    recorder.skip(0);
    recorder.skip(1);
    await expect(recorder.done()).resolves.toBeUndefined();
  });

  it("asks a position's part only when that position or a later one is committed (a scrutiny slot's path is known late)", async () => {
    // Positions 3 and 4 are a later phase's slots: their part is known only once that phase chose (here: after the planned saves).
    let chosen = false;
    const asked: number[] = [];
    const recorder = createPartedOrderedRecorder(5, (position) => {
      asked.push(position);
      if (position >= 3 && !chosen) throw new Error("test: a late slot's part was asked before it was known");
      return position >= 3 ? position - 3 : position % 2;
    });
    await Promise.all([recorder.commit(0, async () => undefined), recorder.commit(1, async () => undefined), recorder.commit(2, async () => undefined)]);
    expect(asked.every((position) => position < 3)).toBe(true);
    chosen = true;
    // Slot 4 is part 1's, slot 3 part 0's: slot 4 is written while slot 3 is not yet claimed.
    await recorder.commit(4, async () => undefined);
    await recorder.commit(3, async () => undefined);
    await expect(recorder.done()).resolves.toBeUndefined();
  });

  it("done() resolves only once every position of every part is committed or skipped", async () => {
    const recorder = createPartedOrderedRecorder(2, (position) => position);
    let finished = false;
    void recorder.done().then(() => { finished = true; });
    await recorder.commit(1, async () => undefined);
    await flush();
    expect(finished).toBe(false);
    recorder.skip(0);
    await flush();
    expect(finished).toBe(true);
    await expect(createPartedOrderedRecorder(0, () => 0).done()).resolves.toBeUndefined();
  });

  it("refuses a reused position, a position out of range and a bad size as createOrderedRecorder does", () => {
    const recorder = createPartedOrderedRecorder(2, () => 0);
    void recorder.commit(0, async () => undefined);
    expect((thrownBy(() => recorder.commit(0, async () => undefined)) as Error).message).toBe("ORDERED_RECORDER_POSITION_REUSED");
    expect((thrownBy(() => recorder.skip(0)) as Error).message).toBe("ORDERED_RECORDER_POSITION_REUSED");
    recorder.skip(1);
    expect(() => recorder.skip(1)).not.toThrow();
    for (const position of [-1, 2, 1.5, Number.NaN]) {
      expect(thrownBy(() => recorder.commit(position, async () => undefined))).toBeInstanceOf(TypeError);
      expect((thrownBy(() => recorder.skip(position)) as Error).message).toBe("ORDERED_RECORDER_POSITION_OUT_OF_RANGE");
    }
    for (const size of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect((thrownBy(() => createPartedOrderedRecorder(size, () => 0)) as Error).message).toBe("ORDERED_RECORDER_SIZE_INVALID");
    }
  });
});

describe("the runner's wiring (Task 53b), read off its source", () => {
  it("only a path debate gets a recorder per path; every other run keeps the one plan-order recorder", async () => {
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    expect(source).toContain("const recorder: OrderedRecorder = partOf === null ? createOrderedRecorder(size) : createPartedOrderedRecorder(size, partOf);");
    expect(source.match(/createPartedOrderedRecorder\(/gu)).toHaveLength(1);
    expect(source).toContain("const pathPartOf = pathsRunPaths === null || shapePlan === null ? null");
    expect(source).toContain("const nodeRecorder = positionRecorder(totalPlannedNodes, pathPartOf);");
    expect(source).toContain("const reviewChoices = positionRecorder(totalPlannedNodes, pathPartOf);");
    expect(source).toContain("const reviewRecorder = positionRecorder(totalPlannedNodes, pathPartOf);");
    // A given-back pass is one path's own (or, with no paths, today's), in the plain plan order.
    expect(source).toContain("const choices = positionRecorder(pending.length);");
    expect(source).toContain("const reviews = positionRecorder(pending.length);");
  });
});
