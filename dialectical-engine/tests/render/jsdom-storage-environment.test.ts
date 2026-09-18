// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

/**
 * NODE-26 — the jsdom environment, not Node, owns `localStorage`.
 *
 * Node 25 and later define `localStorage` as an own ACCESSOR property of
 * `globalThis` that returns `undefined` and emits an ExperimentalWarning saying
 * localStorage is not available because the `--localstorage-file` flag was not
 * provided. vitest 4's jsdom environment copies a jsdom window key that already
 * exists on the global only when that key is in its own KEYS list, and 4.1.10's
 * list carries `Storage` but neither `localStorage` nor `sessionStorage` — so
 * under Node 26 every jsdom test file received Node's stub and died on its first
 * `localStorage.clear()`. vitest 5.0.1 lists both keys, so jsdom's `Storage`
 * instance wins and the warning is never reached.
 *
 * This file is the regression pin for that arrangement: it fails on any runner
 * that hands the test something other than jsdom's storage.
 *
 * KNOWN LIMIT of the last assertion, stated rather than hidden. Node emits that
 * ExperimentalWarning once per process and vitest reuses a worker across files,
 * so inside a whole-suite run this line is a per-file guard that an earlier file
 * may already have satisfied by consuming the single emission; on its own it
 * cannot prove the warning is gone from the run. The evidence for that is the
 * whole-run count instead: the four-count log `full-31f6e25b.log`, taken on
 * vitest 4.1.10, contains the string `--localstorage-file` 8 times, and
 * `full-53a09658.log`, taken on vitest 5.0.1, contains it 0 times.
 */

const KEY = "node26-jsdom-storage-environment";

describe("NODE-26 jsdom storage environment", () => {
  it("gives the test jsdom's Storage, round-trips a value, empties it, and reaches no --localstorage-file warning", async () => {
    const warnings: string[] = [];
    const record = (warning: Error): void => { warnings.push(`${warning.name}: ${warning.message}`); };
    process.on("warning", record);
    try {
      expect(globalThis.localStorage).toBeInstanceOf(Storage);

      localStorage.setItem(KEY, "round-trip");
      expect(localStorage.getItem(KEY)).toBe("round-trip");

      localStorage.clear();
      expect(localStorage.length).toBe(0);

      // Node schedules `emitWarning` on the microtask/next-tick queue, so a
      // macrotask hop is what makes an emitted warning observable here.
      await new Promise((resolve) => { setTimeout(resolve, 0); });
    } finally {
      process.off("warning", record);
    }
    expect(warnings.filter((line) => line.includes("--localstorage-file"))).toEqual([]);
  });
});
