import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ASK_HISTORY_KEY, ASK_STEP_PARAM, askHistoryOf, stepOneAddress, stepTwoAddress, withAskHistory
} from "../../apps/ui/lib/v4/askHistory.js";

/*
 * V4 start step, Task 76c (read-f2, choose-f2, choose-f21; owner answer Q3 A): the ask page keeps the words, and after Start
 * the debate's id, in this tab's history entry, one key beside the router's own; the address only says it is step 2. Every
 * text is made up.
 */
describe("the ask page's history entry (answer Q3)", () => {
  it("withAskHistory keeps every key already there (the router's) and sets only its own", () => {
    const routerState = { __NA: true, tree: [1] };
    const next = withAskHistory(routerState, { step: "read", words: "Q" });
    expect(next).toEqual({ __NA: true, tree: [1], v4ask: { step: "read", words: "Q" } });
    expect(ASK_HISTORY_KEY).toBe("v4ask");
    // The state handed in is left as it was.
    expect(routerState).toEqual({ __NA: true, tree: [1] });
    // No state yet (a fresh tab), or a state that is no object: only the page's own key.
    expect(withAskHistory(null, { step: "ask", words: "Q" })).toEqual({ v4ask: { step: "ask", words: "Q" } });
    expect(withAskHistory("x", { step: "started", runId: "run-1" })).toEqual({ v4ask: { step: "started", runId: "run-1" } });
    // A second write replaces the page's key only.
    expect(withAskHistory(next, { step: "started", runId: "run-1" })).toEqual({ __NA: true, tree: [1], v4ask: { step: "started", runId: "run-1" } });
  });

  it("askHistoryOf reads the three shapes back, and nothing more than they hold", () => {
    expect(askHistoryOf(withAskHistory({ __NA: true }, { step: "ask", words: "Q" }))).toEqual({ step: "ask", words: "Q" });
    expect(askHistoryOf(withAskHistory({ __NA: true }, { step: "read", words: "Q" }))).toEqual({ step: "read", words: "Q" });
    expect(askHistoryOf(withAskHistory({ __NA: true }, { step: "started", runId: "run-1" }))).toEqual({ step: "started", runId: "run-1" });
    expect(askHistoryOf({ v4ask: { step: "read", words: "Q", extra: 1 } })).toEqual({ step: "read", words: "Q" });
  });

  it("askHistoryOf refuses a foreign shape", () => {
    for (const state of [
      undefined, null, "v4ask", 7, [], {}, { __NA: true, tree: [1] }, { v4ask: null }, { v4ask: "read" }, { v4ask: ["read", "Q"] },
      { v4ask: { step: "read" } }, { v4ask: { step: "read", words: 5 } }, { v4ask: { step: "ask", words: "   " } },
      { v4ask: { step: "other", words: "Q" } }, { v4ask: { step: "started" } }, { v4ask: { step: "started", runId: 7 } },
      { v4ask: { step: "started", runId: "" } }, { v4ask: { step: "started", words: "Q" } }
    ]) {
      expect(askHistoryOf(state), JSON.stringify(state)).toBeNull();
    }
  });

  it("the address says step 2 and keeps ?level=, never the words; step 1's address drops only the step", () => {
    expect(ASK_STEP_PARAM).toBe("step");
    expect(stepTwoAddress("")).toBe("?step=2");
    expect(stepTwoAddress("?topic=Should+Romania+build&again=run-0")).toBe("?step=2");
    expect(stepTwoAddress("?level=expert&topic=Should+Romania+build")).toBe("?step=2&level=expert");
    expect(stepOneAddress("/v4", "?step=2")).toBe("/v4");
    expect(stepOneAddress("/v4", "?step=2&level=plain")).toBe("/v4?level=plain");
    expect(stepOneAddress("/v4", "")).toBe("/v4");
  });

  it("no storage call in askHistory.ts or V4AskClient.tsx: only this tab's history entry (the v4-storage guard's rule)", () => {
    for (const file of ["lib/v4/askHistory.ts", "components/v4/V4AskClient.tsx"]) {
      const source = readFileSync(resolve(import.meta.dirname, "../../apps/ui", file), "utf8");
      expect(source, file).not.toMatch(/\.setItem\(|localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
  });
});
