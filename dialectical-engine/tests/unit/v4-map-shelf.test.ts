import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AnswerIndex, DigLinks } from "@debateai/contract";
import { describe, expect, it, vi } from "vitest";

import { digPicksOf, digQuestion } from "../../apps/ui/lib/v4/askText.js";
import { mergeShelfRows, readMapShelf, shelfExtrasOf, shelfPicksOf, type ShelfClient } from "../../apps/ui/lib/v4/mapShelf.js";
import type { DigTarget, V4Path } from "../../apps/ui/lib/v4/types.js";
import { usedUpLine } from "../../apps/ui/lib/v4/money.js";

/*
 * "Your maps" (owner pick ask-d5 B with ask-f10, wait-f13, map-f34 and dig-f30, 3 Nov 2026): the person's own questions,
 * digs left out of the cards by the account's dig link (never by a first line) and hung under their question in the
 * person's words, the list read further back until five real questions remain, one state word each, and what the server
 * may add (the start time, the bar, the "New" dot) read only when it is there.
 */

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;

type Item = Readonly<{ run: string; seq: number; line?: string; extra?: Record<string, unknown> }>;
type Open = Item & Readonly<{ state: "QUEUED" | "WAITING" | "CLAIMED" | "RUNNING" | "HOLDING" | "SETTLED" | "FAILED" }>;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** One page of GET /v1/answers: answers paged newest first by limit/offset, every open run on each page (as the API does). */
function pageOf(items: readonly Item[], open: readonly Open[], limit: number, offset: number): AnswerIndex {
  return {
    items: items.slice(offset, offset + limit).map((item) => ({
      run_ref: item.run, question_line: item.line ?? `Question ${item.run}?`, created_at_sequence: item.seq, ...item.extra
    })),
    open_runs: open.map((run) => ({
      run_ref: run.run, question_line: run.line ?? `Question ${run.run}?`, state: run.state,
      terminal_reason: run.state === "FAILED" ? "RUN_FAILED" : null, created_at_sequence: run.seq, ...run.extra
    })),
    limit, offset, total: items.length
  } as unknown as AnswerIndex;
}

/** A fake GET /v1/answers over `items` and `open`. */
function answerList(items: readonly Item[], open: readonly Open[] = []) {
  return vi.fn(async (limit: number, offset: number) => pageOf(items, open, limit, offset));
}

/** A fake GET /v1/runs/{id}/dig-links from child → parent pairs; `failing` runs throw. */
function digLinks(parents: Readonly<Record<string, string>>, failing: readonly string[] = []) {
  return vi.fn(async (runId: string): Promise<DigLinks> => {
    if (failing.includes(runId)) throw new Error("NOT_FOUND");
    const parent = parents[runId];
    return {
      parent: parent === undefined ? null : { parent_run_id: parent, child_run_id: runId, places: [], mode: "quick", created_at: "2026-11-03T10:00:00.000Z" },
      children: []
    };
  });
}

const client = (readAnswerIndex: ReturnType<typeof answerList>, readDigLinks: ReturnType<typeof digLinks>): ShelfClient =>
  ({ readAnswerIndex, readDigLinks }) as unknown as ShelfClient;

describe("what the server may add to a row", () => {
  it("reads the start time, the four-shade bar, the New dot and the dig link only when they are well formed", () => {
    expect(shelfExtrasOf({})).toEqual({ startedAt: null, bar: null, changed: false, dugFrom: undefined });
    expect(shelfExtrasOf({
      started_at: "2026-11-04T14:00:00.000Z", map_bar: { sure: 2, sure_for_case: 3, still_argued: 1, didnt_hold: 0 },
      changed_since_visit: true, dug_from: id(1)
    })).toEqual({
      startedAt: "2026-11-04T14:00:00.000Z", bar: { SURE: 2, SURE_FOR_CASE: 3, STILL_ARGUED: 1, DIDNT_HOLD: 0 }, changed: true, dugFrom: id(1)
    });
    expect(shelfExtrasOf({ dug_from: null }).dugFrom).toBeNull();
    // A broken field is left out, never guessed at.
    expect(shelfExtrasOf({ started_at: "today", map_bar: { sure: 2 }, changed_since_visit: "yes" }))
      .toEqual({ startedAt: null, bar: null, changed: false, dugFrom: undefined });
    expect(shelfExtrasOf({ map_bar: { sure: -1, sure_for_case: 0, still_argued: 0, didnt_hold: 0 } }).bar).toBeNull();
  });

  it("one row per debate: a served answer wins over its open run, and the state words follow the run", () => {
    const rows = mergeShelfRows([], pageOf([{ run: id(1), seq: 9 }], [
      { run: id(1), seq: 4, state: "SETTLED", extra: { started_at: "2026-11-04T09:00:00.000Z" } },
      { run: id(2), seq: 8, state: "RUNNING" },
      { run: id(3), seq: 7, state: "WAITING" },
      { run: id(4), seq: 6, state: "FAILED" },
      { run: id(5), seq: 5, state: "HOLDING" }
    ], 32, 0));
    expect(rows.map((row) => row.runId)).toEqual([id(1), id(2), id(3), id(4), id(5)]);
    const byRun = Object.fromEntries(rows.map((row) => [row.runId, row]));
    expect(byRun[id(1)]).toMatchObject({ state: "READY", firstSequence: 4, startedAt: "2026-11-04T09:00:00.000Z" });
    expect([id(2), id(3), id(4), id(5)].map((run) => byRun[run]!.state)).toEqual(["WORKING", "WAITING", "FAILED", "WORKING"]);
  });
});

describe("readMapShelf", () => {
  it("leaves digs out by the account's dig link and reads further back until five real questions remain", async () => {
    // Thirty digs of the newest question come first, so the first page holds only two real questions.
    const digs: Item[] = Array.from({ length: 30 }, (_, at) => ({ run: id(100 + at), seq: 200 - at, line: `Could storage cover week ${at}?` }));
    const questions: Item[] = Array.from({ length: 8 }, (_, at) => ({ run: id(at + 1), seq: 100 - at, line: `Real question ${at + 1}?` }));
    const readAnswerIndex = answerList([...digs, ...questions]);
    const readDigLinks = digLinks(Object.fromEntries(digs.map((dig) => [dig.run, id(1)])));
    const shelf = await readMapShelf(5, CATALOG, { client: client(readAnswerIndex, readDigLinks) });
    expect(shelf.maps.map((map) => map.question)).toEqual(["Real question 1?", "Real question 2?", "Real question 3?", "Real question 4?", "Real question 5?"]);
    expect(readAnswerIndex).toHaveBeenCalledTimes(2);
    expect(readAnswerIndex.mock.calls[1]).toEqual([32, 32]);
    expect(shelf.maps.every((map) => map.state === "READY")).toBe(true);
    // Every dig hangs under the question it came from, newest first, in the person's words.
    expect(shelf.maps[0]!.digs).toHaveLength(30);
    expect(shelf.maps[0]!.digs[0]).toEqual({ runId: id(100), pick: "Could storage cover week 0?", more: false, state: "READY", pause: null });
    expect(shelf.maps.slice(1).every((map) => map.digs.length === 0)).toBe(true);
    expect(shelf.more).toBe(true);
    expect(shelf.anyRows).toBe(true);
  });

  it("a dig of a dig hangs under the first question; the site's framing comes off and several picks read 'and more'", async () => {
    const readAnswerIndex = answerList([
      { run: id(3), seq: 30, line: `${CATALOG["v4.digText.together"]}\n1. Is storage cheap enough for a two-week lull?\n2. What about the grid?` },
      { run: id(2), seq: 20, line: "Does this hold up, and when? Batteries can cover multi-day lulls." },
      { run: id(1), seq: 10, line: "Should Romania build new nuclear plants?\n\nThis is about Romania." }
    ]);
    const shelf = await readMapShelf(5, CATALOG, { client: client(readAnswerIndex, digLinks({ [id(3)]: id(2), [id(2)]: id(1) })) });
    expect(shelf.maps).toHaveLength(1);
    expect(shelf.maps[0]!.question).toBe("Should Romania build new nuclear plants?");
    expect(shelf.maps[0]!.digs).toEqual([
      { runId: id(3), pick: "Is storage cheap enough for a two-week lull?", more: true, state: "READY", pause: null },
      { runId: id(2), pick: "Batteries can cover multi-day lulls.", more: false, state: "READY", pause: null }
    ]);
    expect(shelf.more).toBe(false);
  });

  it("a dig with no recorded link is still known by its context line, never by its first line", async () => {
    const parent = "Should my town close the centre to cars?";
    const textDig = `Look deeper into this part of the answer: Shops lose trade.\n\nThis follows from an earlier question: “${parent}”`;
    const readAnswerIndex = answerList([
      { run: id(3), seq: 30, line: textDig },
      // Its first line reads like a dig's, but nothing links it and it carries no context line: a question of its own.
      { run: id(2), seq: 20, line: "Look deeper into this part of the answer: a question I typed myself" },
      { run: id(1), seq: 10, line: parent }
    ]);
    const shelf = await readMapShelf(5, CATALOG, { client: client(readAnswerIndex, digLinks({}, [id(3)])) });
    expect(shelf.maps.map((map) => map.runId)).toEqual([id(2), id(1)]);
    expect(shelf.maps[1]!.digs).toEqual([{ runId: id(3), pick: "Shops lose trade.", more: false, state: "READY", pause: null }]);
  });

  it("the open runs say their state; a failed dig-link read leaves the row a question", async () => {
    const readAnswerIndex = answerList([{ run: id(1), seq: 10 }], [
      { run: id(2), seq: 40, state: "RUNNING", extra: { started_at: "2026-11-04T14:00:00.000Z" } },
      { run: id(3), seq: 30, state: "WAITING" },
      { run: id(4), seq: 20, state: "FAILED" }
    ]);
    const shelf = await readMapShelf(5, CATALOG, { client: client(readAnswerIndex, digLinks({}, [id(4)])) });
    expect(shelf.maps.map((map) => [map.runId, map.state, map.startedAt])).toEqual([
      [id(2), "WORKING", "2026-11-04T14:00:00.000Z"], [id(3), "WAITING", null], [id(4), "FAILED", null], [id(1), "READY", null]
    ]);
  });

  it("a question the list calls running but is paused at the month wall reads paused, from its own run read (journey-f22)", async () => {
    const readAnswerIndex = answerList([{ run: id(1), seq: 10 }], [
      { run: id(2), seq: 40, state: "RUNNING" },
      { run: id(3), seq: 30, state: "RUNNING" },
      { run: id(4), seq: 20, state: "RUNNING" }
    ]);
    const readRun = vi.fn(async (runId: string) => {
      if (runId === id(4)) throw new Error("UNREACHABLE");
      return {
        run_ref: runId, question_line: "Q?", state: "RUNNING", terminal_reason: null, hold_until: null,
        ...(runId === id(2) ? { month_pause: { until: "2026-12-01T00:00:00.000Z", can_continue: false } } : {})
      };
    });
    const shelf = await readMapShelf(5, CATALOG, {
      client: { ...client(readAnswerIndex, digLinks({})), readRun } as unknown as ShelfClient
    });
    // Only what shows as being looked into is read again; a failed read keeps "Looking into it".
    expect(readRun.mock.calls.map(([runId]) => runId).sort()).toEqual([id(2), id(3), id(4)]);
    expect(shelf.maps.map((map) => [map.runId, map.state, map.pause])).toEqual([
      [id(2), "PAUSED", { until: "2026-12-01T00:00:00.000Z", canContinue: false }],
      [id(3), "WORKING", null], [id(4), "WORKING", null], [id(1), "READY", null]
    ]);
  });

  it("when the server says the dig link on the row, no dig-link read is needed; the bar and the New dot pass through", async () => {
    const bar = { sure: 1, sure_for_case: 2, still_argued: 1, didnt_hold: 1 };
    const readAnswerIndex = answerList([
      { run: id(2), seq: 20, extra: { dug_from: id(1) } },
      { run: id(1), seq: 10, extra: { dug_from: null, map_bar: bar, changed_since_visit: true } }
    ]);
    const readDigLinks = digLinks({});
    const shelf = await readMapShelf(5, CATALOG, { client: client(readAnswerIndex, readDigLinks) });
    expect(readDigLinks).not.toHaveBeenCalled();
    expect(shelf.maps).toHaveLength(1);
    expect(shelf.maps[0]).toMatchObject({ bar: { SURE: 1, SURE_FOR_CASE: 2, STILL_ARGUED: 1, DIDNT_HOLD: 1 }, changed: true });
    expect(shelf.maps[0]!.digs.map((dig) => dig.runId)).toEqual([id(2)]);
  });

  it("a dig is named by its picks: never by the path line a dig of picks names first, a whole path by its short label", () => {
    const parent = "Should countries build new nuclear power?";
    const path = { id: "n-nuclear", line: "Nuclear first: did not hold. Recent reactors in Europe ran years late." } as unknown as V4Path;
    const whole: DigTarget = { kind: "path", path };
    expect(shelfPicksOf(digQuestion(whole, parent, CATALOG, "en"), CATALOG)).toEqual(["Nuclear first"]);
    const picks: DigTarget = {
      kind: "picks", path,
      picks: [
        { kind: "OWN_VIEW", key: "own:n-nuclear:1", group: "n-nuclear", text: "Small reactors could be built faster." },
        { kind: "OWN_VIEW", key: "own:n-nuclear:2", group: "n-nuclear", text: "Costs fall with each reactor built." }
      ]
    };
    expect(shelfPicksOf(digQuestion(picks, parent, CATALOG, "en"), CATALOG))
      .toEqual(["Small reactors could be built faster.", "Costs fall with each reactor built."]);
  });

  it("an account with no debate at all is a first visit; the dig links read once are kept for the next read", async () => {
    const empty = await readMapShelf(5, CATALOG, { client: client(answerList([]), digLinks({})) });
    expect(empty).toEqual({ maps: [], more: false, anyRows: false });
    const cache = new Map();
    const readDigLinks = digLinks({});
    const readAnswerIndex = answerList([{ run: id(2), seq: 20 }, { run: id(1), seq: 10 }]);
    await readMapShelf(5, CATALOG, { client: client(readAnswerIndex, readDigLinks), cache });
    await readMapShelf(20, CATALOG, { client: client(readAnswerIndex, readDigLinks), cache });
    expect(readDigLinks).toHaveBeenCalledTimes(2);
  });

  it("a failed answer-list read is the page's to handle", async () => {
    const failing = vi.fn(async () => { throw new Error("SERVER_FAILURE"); });
    await expect(readMapShelf(5, CATALOG, { client: { readAnswerIndex: failing, readDigLinks: digLinks({}) } as unknown as ShelfClient })).rejects.toThrow();
  });
});

describe("a dig in the person's own words (dig-f30)", () => {
  it("takes the site's framing off, with or without the context line", () => {
    expect(digPicksOf("Would this change the answer? Cheap gas for twenty years.", CATALOG)).toEqual(["Cheap gas for twenty years."]);
    expect(digPicksOf("Could pumped hydro carry a windless week?", CATALOG)).toEqual(["Could pumped hydro carry a windless week?"]);
    expect(digPicksOf(`${CATALOG["v4.digText.together"]}\n1. First?\n2. Second?\n\nThis follows from an earlier question: “Q?”`, CATALOG))
      .toEqual(["First?", "Second?"]);
  });
});

describe("the used-up line above the box (ask-f18, ask-d4 C)", () => {
  const room = (scope: string, resets: string) => ({
    room: "FULL", scope, resets_at: resets, waiting_run_ref: null, plan_id: "PLUS", new_starts: "BLOCKED_UNTIL_RESET"
  }) as never;

  it("names today's quota with a clock time, this month's (Free) with a date", () => {
    const day = usedUpLine(room("PERSON_DAY", "2026-11-05T08:00:00.000Z"), "en");
    expect(day?.key).toBe("v4.ask.usedUp.PERSON_DAY");
    expect(String(day?.values.time)).toMatch(/^\d{2}:\d{2}$/u);
    const month = usedUpLine(room("PERSON_MONTH", "2026-12-01T12:00:00.000Z"), "en");
    expect(month).toEqual({ key: "v4.ask.usedUp.PERSON_MONTH", values: { date: "1 December" } }); // day first (question 5)
    expect(CATALOG["v4.ask.usedUp.PERSON_DAY"]).toBe("You've used today's quota. New questions start after {time}.");
    expect(CATALOG["v4.ask.usedUp.PERSON_MONTH"]).toBe("You've used this month's quota. New questions start on {date}.");
  });

  it("says nothing while new questions can start", () => {
    expect(usedUpLine(null, "en")).toBeNull();
    expect(usedUpLine({ room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS" } as never, "en")).toBeNull();
    // Only the person's own running debates fill the window: no reset to name, nothing used up.
    expect(usedUpLine({
      room: "FULL", scope: "PERSON_DAY", resets_at: "2026-11-05T08:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS", waits_for: "OWN_DEBATES"
    } as never, "en")).toBeNull();
    expect(usedUpLine({ room: "FULL", scope: "SITE_DAY", resets_at: "2026-11-05T08:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS" } as never, "en")).toBeNull();
  });

  it("public-f24 (owner's screen review): a full person window reads the same line under the older server switch", () => {
    const full = { room: "FULL", scope: "PERSON_DAY", resets_at: "2026-11-05T08:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS" };
    expect(usedUpLine(full as never, "en")).toEqual(usedUpLine({ ...full, new_starts: "BLOCKED_UNTIL_RESET" } as never, "en"));
    expect(usedUpLine(full as never, "en")?.key).toBe("v4.ask.usedUp.PERSON_DAY");
  });
});
