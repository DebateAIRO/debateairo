// tests/unit/web-search-month-pause.test.ts
// W4-2 (the money rule, owner 31 Oct 2026, point 5; W3-8's durable pause): at the month wall a debate's planned SEARCHES
// pause like its AI calls, for first debates and digs alike. The search refused at the wall records the pause once (a
// search, the run's body room left as the planned work), is never sent, never stored and never charged, and the step
// ends with the planned stop RUN_MONTH_PAUSED (the runner then releases the claim). A paused debate sends no further
// search. After Continue, the next copy sends the searches the pause held. The runner's web settings wrap every search
// seam with the process's month pause (main.ts and the practice runner hand it in).
import { describe, expect, it } from "vitest";
import { MonthWallReachedError, type WebSearchCostSeam } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import { MonthPause, RUN_MONTH_PAUSED, type MonthPauseStore, withMonthPauseSearch } from "../../apps/runner/src/month-pause.js";
import { runnerWebSearchSettings } from "../../apps/runner/src/run-settings.js";
import { runWebStep } from "../../apps/runner/src/web-step.js";
import { RUN_ID, membersOf, memoryStore, perplexity, stepInput, team } from "../support/web-step-world.js";

const RESET = new Date("2026-11-01T00:00:00Z");

/** 0134's pause events in memory: the first PAUSED is recorded, later ones find it ALREADY_PAUSED; Continue resumes. */
function pauseStore() {
  const recorded: Parameters<MonthPauseStore["recordPause"]>[0][] = [];
  let state: "NONE" | "PAUSED" | "RESUMED" = "NONE";
  let reads = 0;
  const store: MonthPauseStore = {
    recordPause: async (input) => {
      if (state === "PAUSED") return "ALREADY_PAUSED";
      recorded.push(input);
      state = "PAUSED";
      return "RECORDED";
    },
    readPause: async () => { reads += 1; return { state }; }
  };
  return { store, recorded, reads: () => reads, resume: () => { state = "RESUMED"; } };
}

/** A search seam whose month has no room (the shared wall's refusal), or room again; it counts what it admitted and charged. */
function monthSeam(walled: () => boolean) {
  const charged: string[] = [];
  let admitted = 0;
  let released = 0;
  const seam = (): WebSearchCostSeam => ({
    assertSearchAllowed: async () => {
      if (walled()) throw new MonthWallReachedError(RESET);
      admitted += 1;
      return undefined;
    },
    recordSearch: async ({ outcome }) => { charged.push(outcome); },
    releaseInFlight: () => { released += 1; }
  });
  return { seam, charged, admitted: () => admitted, released: () => released };
}

const DIG = Object.freeze({ picks: [{ pickNo: 1, text: "Rent in Munich eats most of the pay difference." }], reuse: null });
const DIG_PLAN = JSON.stringify({ searches: [{ pick_id: "k1", pace: "normal", query: "Munich one-bedroom rent average report" }] });

describe("W4-2 the month pause reaches the web step's searches", () => {
  for (const scene of ["a first debate", "a dig"] as const) {
    it(`${scene}: the search at the wall records the pause, is never sent, stored or charged, and the step stops paused`, async () => {
      const pause = pauseStore();
      const month = monthSeam(() => true);
      const ais = team(scene === "a dig" ? { haiku: { planner: DIG_PLAN } } : {});
      const search = perplexity();
      const store = memoryStore();
      const monthPause = new MonthPause({ store: pause.store, log: () => undefined });
      const input = stepInput({ members: membersOf(ais.all), search: search.port, prepare: store.prepare,
        searchSeam: () => withMonthPauseSearch(month.seam(), RUN_ID, monthPause, async () => 42_000),
        ...(scene === "a dig" ? { dig: DIG } : {}) });
      const stop = await runWebStep(input).catch((error: unknown) => error);
      expect(stop).toBeInstanceOf(TypedDomainError);
      expect((stop as TypedDomainError).code).toBe(RUN_MONTH_PAUSED);
      // Recorded once: a search, from the month's reset, with the run's planned work left.
      expect(pause.recorded).toEqual([{ runId: RUN_ID, reason: "MONTH_WALL", resumableAt: RESET, plannedCalls: 0, plannedSearches: 1,
        plannedMicros: 42_000 }]);
      // Never sent, never stored, never charged; every seam's hold released; no reader called.
      expect(search.queries).toEqual([]);
      expect(store.searches.size).toBe(0);
      expect(month.charged).toEqual([]);
      expect(month.released()).toBeGreaterThanOrEqual(scene === "a dig" ? 1 : 4);
      expect(ais.deepseek.bodies.length + ais.glm.bodies.length).toBe(0);
    });
  }

  it("a debate already paused sends no further search, and after Continue the next copy sends what the pause held", async () => {
    const pause = pauseStore();
    let walled = true;
    const month = monthSeam(() => walled);
    const store = memoryStore();
    const monthPause = new MonthPause({ store: pause.store, log: () => undefined });
    const seam = () => withMonthPauseSearch(month.seam(), RUN_ID, monthPause);
    const first = perplexity();
    await expect(runWebStep(stepInput({ members: membersOf(team().all), search: first.port, prepare: store.prepare, searchSeam: seam })))
      .rejects.toMatchObject({ code: RUN_MONTH_PAUSED });
    // Still paused (no Continue yet), even with room: a copy that ran now would send nothing.
    walled = false;
    const early = perplexity();
    await expect(runWebStep(stepInput({ members: membersOf(team().all), search: early.port, prepare: store.prepare, searchSeam: seam })))
      .rejects.toMatchObject({ code: RUN_MONTH_PAUSED });
    expect(early.queries).toEqual([]);
    expect(month.admitted()).toBe(0);
    // Continue in the new month: the next copy sends every search the pause held, charged once each.
    pause.resume();
    const resumed = perplexity();
    const result = await runWebStep(stepInput({ members: membersOf(team().all), search: resumed.port, prepare: store.prepare, searchSeam: seam }));
    expect(result.paths.map((path) => path.status)).toEqual(["SEARCHED", "SEARCHED"]);
    expect(resumed.queries).toHaveLength(4);
    expect(month.charged).toEqual(["SUCCEEDED", "SUCCEEDED", "SUCCEEDED", "SUCCEEDED"]);
    expect(pause.recorded).toHaveLength(1);
  });

  it("another money refusal is not a pause: the search is skipped and the debate goes on", async () => {
    const pause = pauseStore();
    const refusing = (): WebSearchCostSeam => ({
      assertSearchAllowed: async () => { throw new TypedDomainError("COST_ENVELOPE_EXHAUSTED", "no room in the run"); },
      recordSearch: async () => undefined, releaseInFlight: () => undefined
    });
    const monthPause = new MonthPause({ store: pause.store, log: () => undefined });
    const result = await runWebStep(stepInput({ members: membersOf(team().all), search: perplexity().port, prepare: memoryStore().prepare,
      searchSeam: () => withMonthPauseSearch(refusing(), RUN_ID, monthPause) }));
    expect(result.paths.map((path) => [path.status, path.code])).toEqual([["FAILED", "COST_ENVELOPE_EXHAUSTED"], ["FAILED", "COST_ENVELOPE_EXHAUSTED"]]);
    expect(pause.recorded).toEqual([]);
  });

  it("the runner's web settings wrap every search seam with the process's month pause, the body room as the planned work", async () => {
    const pause = pauseStore();
    const month = monthSeam(() => true);
    const guard = { searchSeam: () => month.seam(), bodyMicrosLeft: async () => 77_000 };
    const settings = runnerWebSearchSettings({ pool: { query: async () => ({ rows: [] }) } as never, previewGate: undefined,
      fetch: (async () => new Response("{}")) as typeof fetch, guardOf: () => guard as never,
      pause: new MonthPause({ store: pause.store, log: () => undefined }) });
    await expect(settings.searchSeamOf!(RUN_ID).assertSearchAllowed()).rejects.toMatchObject({ code: RUN_MONTH_PAUSED });
    expect(pause.recorded.map((entry) => [entry.plannedSearches, entry.plannedMicros])).toEqual([[1, 77_000]]);
    // Without the pause (a composition that hands none in), the wall's own refusal comes back as it is.
    const bare = runnerWebSearchSettings({ pool: { query: async () => ({ rows: [] }) } as never, previewGate: undefined,
      fetch: (async () => new Response("{}")) as typeof fetch, guardOf: () => guard as never });
    await expect(bare.searchSeamOf!(RUN_ID).assertSearchAllowed()).rejects.toBeInstanceOf(MonthWallReachedError);
  });
});
