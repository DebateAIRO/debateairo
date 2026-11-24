import { describe, expect, it } from "vitest";
import type { PublicDebate } from "@debateai/contract";
import type { PublicationCheckResult, PublicationContentCheck } from "../../apps/api/src/publication-check/check.js";
import { PUBLIC_PAGE_SWEEP_DEFAULTS, backedOffContentCheck, checksInTurn, freeSweepCursor, sweepFreePublications } from "../../apps/api/src/public-tree.js";
import { crisisWordsOf } from "../../apps/ui/lib/v4/askText.js";

const request = { runId: "11111111-1111-4111-8111-111111111111", snapshot: {} as PublicDebate };

describe("a judge that is down is no cost loop", () => {
  function world(answers: readonly PublicationCheckResult[]) {
    let clock = 0;
    let calls = 0;
    const real: PublicationContentCheck = { check: async () => answers[Math.min(calls++, answers.length - 1)]! };
    return { gated: backedOffContentCheck(real, { now: () => clock, firstWaitMs: 60_000, longestWaitMs: 240_000 }), calls: () => calls, pass: (ms: number) => { clock += ms; } };
  }
  const down: PublicationCheckResult = { outcome: "UNAVAILABLE", cause: "JUDGE_DEADLINE" };

  it("waits a minute, then two, then four, and never past the longest; a sweep every 15 seconds calls nothing in between", async () => {
    const { gated, calls, pass } = world([down]);
    expect((await gated.check(request)).outcome).toBe("UNAVAILABLE");
    expect(calls()).toBe(1);
    for (let tick = 0; tick < 3; tick += 1) { pass(15_000); expect((await gated.check(request)).outcome).toBe("UNAVAILABLE"); }
    expect(calls()).toBe(1);
    pass(15_000);
    await gated.check(request);
    expect(calls()).toBe(2);
    pass(119_000);
    await gated.check(request);
    expect(calls()).toBe(2);
    pass(1_000);
    await gated.check(request);
    expect(calls()).toBe(3);
    pass(240_000);
    await gated.check(request);
    expect(calls()).toBe(4);
    pass(240_000);
    await gated.check(request);
    expect(calls()).toBe(5);
  });

  it("the first real answer ends the wait; a refusal is an answer", async () => {
    const { gated, calls, pass } = world([down, { outcome: "ALLOW" }, { outcome: "ALLOW" }]);
    await gated.check(request);
    pass(60_000);
    expect((await gated.check(request)).outcome).toBe("ALLOW");
    expect((await gated.check(request)).outcome).toBe("ALLOW");
    expect(calls()).toBe(3);
  });

  it("a check that throws counts as down", async () => {
    let calls = 0;
    let clock = 0;
    const gated = backedOffContentCheck({ check: async () => { calls += 1; throw new Error("X"); } }, { now: () => clock });
    await expect(gated.check(request)).rejects.toThrow("X");
    expect((await gated.check(request)).outcome).toBe("UNAVAILABLE");
    expect(calls).toBe(1);
    clock += 60_000;
    await expect(gated.check(request)).rejects.toThrow("X");
  });
});

/**
 * The sweeps as main.ts runs them: every 15 seconds one pass, sweepPublicPage's lists (contributions, then AI-written reports)
 * and then the Free sweep, each list oldest first, every check through the one shared wait, and with `inTurn` through
 * checksInTurn as well. A row of sweepPublicPage's lists behaves as that sweep treats it: an answer settles it (it leaves the
 * list), an unavailable check keeps it until its give-up (6 h for a contribution, 24 h for a report). A Free debate is what
 * publishFreeDebate does with the answer: ALLOW publishes it, an unavailable check keeps it, with no give-up. An item is
 * named by its list's letter: c a contribution, r a report, f a Free debate.
 */
function sweepsWorld(input: Readonly<{ rows: readonly string[]; failing: (name: string) => boolean; inTurn: boolean }>) {
  let clock = 0;
  const asked: string[] = [];
  const done: string[] = [];
  const judge: PublicationContentCheck = { check: async ({ runId }) => {
    asked.push(runId);
    return input.failing(runId) ? { outcome: "UNAVAILABLE", cause: "JUDGE_DEADLINE" } : { outcome: "ALLOW" };
  } };
  const shared = backedOffContentCheck(judge, { now: () => clock });
  const turn = input.inTurn ? checksInTurn(shared, { now: () => clock }) : undefined;
  const check = turn?.check ?? shared;
  const waiting = [...input.rows];
  const listOf = (letter: string) => waiting.filter((name) => name.startsWith(letter));
  const leave = (name: string) => { waiting.splice(waiting.indexOf(name), 1); done.push(name); };
  /** One of sweepPublicPage's lists, as it treats a row's check. */
  const pageList = async (letter: string, giveUpMs: number) => {
    for (const name of listOf(letter)) {
      const result = await check.check({ runId: name, snapshot: {} as PublicDebate });
      if (result.outcome !== "UNAVAILABLE" || clock >= giveUpMs) leave(name);
    }
  };
  const sweeps = async () => {
    await pageList("c", PUBLIC_PAGE_SWEEP_DEFAULTS.giveUpMs);
    await pageList("r", PUBLIC_PAGE_SWEEP_DEFAULTS.reportGiveUpMs);
    await sweepFreePublications({
      cursor: freeSweepCursor(),
      contributions: { readFreeToPublishAfter: async () => listOf("f").map((name) => ({ run_id: name, owner_ref: "o", notice_at: "2026-11-24T08:00:00.000Z" })), refuseFree: async () => "REFUSED" as never },
      publishOne: async (row) => {
        const result = await check.check({ runId: row.run_id, snapshot: {} as PublicDebate });
        if (result.outcome !== "ALLOW") return "CHECK_UNAVAILABLE";
        leave(row.run_id);
        return "PUBLISHED";
      }
    });
  };
  /** One pass every 15 s up to `minutes` from the start, the first at once. */
  const runUntil = async (minutes: number) => {
    while (clock < minutes * 60_000) {
      await (turn === undefined ? sweeps() : turn.pass(sweeps));
      clock += PUBLIC_PAGE_SWEEP_DEFAULTS.everyMs;
    }
  };
  return { runUntil, asked, done, waiting };
}
const timesAsked = (asked: readonly string[], name: string) => asked.filter((entry) => entry === name).length;

describe("one item whose check always fails holds back no other, in any of the sweeps' lists", () => {
  it.each([
    ["a contribution", "c-bad"],
    ["an AI-written report", "r-bad"],
    ["a Free debate", "f-bad"]
  ] as const)("%s: with the shared wait alone nothing behind it is checked for 6 hours; in turn, all of it a minute after its first failure", async (_name, bad) => {
    const rows = ["c-bad", "c-ok", "r-bad", "r-ok", "f-bad", "f-ok", "f-ok2"].filter((name) => !name.endsWith("-bad") || name === bad);
    const behind = rows.slice(rows.indexOf(bad) + 1);
    const failing = (name: string) => name === bad;
    const before = sweepsWorld({ rows, failing, inTurn: false });
    await before.runUntil(6 * 60);
    for (const name of behind) expect(timesAsked(before.asked, name), name).toBe(0);
    expect(before.waiting).toEqual([bad, ...behind]);
    const after = sweepsWorld({ rows, failing, inTurn: true });
    await after.runUntil(1.25);
    expect(after.waiting).toEqual([bad]);
    // The failing item is still tried, after its own wait, and never more often than the shared wait alone would try it.
    await after.runUntil(6 * 60);
    expect(after.waiting).toEqual([bad]);
    expect(timesAsked(after.asked, bad)).toBeGreaterThan(5);
    expect(timesAsked(after.asked, bad)).toBeLessThanOrEqual(timesAsked(before.asked, bad));
  });

  it("when the wait ends the call goes first to an item that never failed, then to the oldest failure", async () => {
    const world = sweepsWorld({ rows: ["c-bad", "f-new"], failing: (name) => name === "c-bad", inTurn: true });
    await world.runUntil(1.5);
    // At 0 the contribution failed and the Free debate waited; at 1:00 the Free debate went first; at 1:15 the
    // contribution's turn came.
    expect(world.asked).toEqual(["c-bad", "f-new", "c-bad"]);
    expect(world.done).toEqual(["f-new"]);
  });

  it("a judge that is down is still no endless loop of calls: one call per wait, the items in turn instead of the oldest each time", async () => {
    const rows = ["c-1", "r-1", "f-1"];
    const before = sweepsWorld({ rows, failing: () => true, inTurn: false });
    await before.runUntil(10);
    const after = sweepsWorld({ rows, failing: () => true, inTurn: true });
    await after.runUntil(10);
    // Waits of 1, 2, 4 and 8 minutes: calls at 0, 1, 3 and 7 minutes, with the turn or without it.
    expect(before.asked).toEqual(["c-1", "c-1", "c-1", "c-1"]);
    expect(after.asked).toEqual(["c-1", "r-1", "f-1", "c-1"]);
    expect(after.done).toEqual([]);
  });

  it("once the judge answers again, the item whose turn it is goes first and every other one in the next pass", async () => {
    let down = true;
    const world = sweepsWorld({ rows: ["c-1", "r-1", "f-1", "f-2"], failing: () => down, inTurn: true });
    await world.runUntil(4);
    expect(world.asked).toEqual(["c-1", "r-1", "f-1"]);
    down = false;
    // The wait that began at 3 minutes ends at 7:00, when f-2, which never failed, has the turn; the rest follow at 7:15.
    await world.runUntil(7.25);
    expect(world.done).toEqual(["f-2"]);
    await world.runUntil(7.5);
    expect(world.done).toEqual(["f-2", "c-1", "r-1", "f-1"]);
  });

  it("two page updates of one dig take their own turns: the older one always failing holds back no newer one, though both checks name the dig", async () => {
    /** Page updates as sweepPublicPage asks them: each check names the dig's run, and its turn key is the update's own. */
    const run = async (byRow: boolean, hours: number) => {
      let clock = 0;
      const asked: string[] = [];
      const runIds = new Set<string>();
      const judge: PublicationContentCheck = { check: async ({ runId, snapshot }) => {
        const update = (snapshot as unknown as { update: string }).update;
        asked.push(update);
        runIds.add(runId);
        return update === "older" ? { outcome: "UNAVAILABLE", cause: "JUDGE_ANSWER_NOT_JSON" } : { outcome: "ALLOW" };
      } };
      const turn = checksInTurn(backedOffContentCheck(judge, { now: () => clock }), { now: () => clock });
      const waiting = ["older", "newer"];
      const settled: Record<string, number> = {};
      while (clock < hours * 60 * 60_000) {
        await turn.pass(async () => {
          for (const update of [...waiting]) {
            const result = await turn.check.check({ runId: "dig-1", snapshot: { update } as unknown as PublicDebate, ...(byRow ? { turnKey: `page:${update}` } : {}) });
            if (result.outcome === "ALLOW" || clock >= PUBLIC_PAGE_SWEEP_DEFAULTS.giveUpMs) {
              waiting.splice(waiting.indexOf(update), 1);
              settled[update] = clock;
            }
          }
        });
        clock += PUBLIC_PAGE_SWEEP_DEFAULTS.everyMs;
      }
      return { asked, runIds, settled };
    };
    // Keyed by the dig's run alone, the newer update is never asked: it gives up with the older one at 6 hours.
    const shared = await run(false, 7);
    expect(timesAsked(shared.asked, "newer")).toBe(0);
    expect(shared.settled.newer).toBe(PUBLIC_PAGE_SWEEP_DEFAULTS.giveUpMs);
    // Keyed by the row, it is asked when the shared wait after the older one's failure ends, and goes on the page.
    const own = await run(true, 7);
    expect(timesAsked(own.asked, "newer")).toBe(1);
    expect(own.settled.newer).toBeLessThanOrEqual(75_000);
    expect(timesAsked(own.asked, "older")).toBeLessThanOrEqual(timesAsked(shared.asked, "older"));
    expect([...own.runIds]).toEqual(["dig-1"]);
  });

  it("a check skipped while the judge rests calls nothing and sets no wait of the item's own; an item a pass did not ask is forgotten", async () => {
    let clock = 0;
    let failing = new Set(["a", "b"]);
    const calls: string[] = [];
    const shared = backedOffContentCheck({ check: async ({ runId }) => {
      calls.push(runId);
      return failing.has(runId) ? { outcome: "UNAVAILABLE", cause: "JUDGE_DEADLINE" } : { outcome: "ALLOW" };
    } }, { now: () => clock });
    const turn = checksInTurn(shared, { now: () => clock });
    const pass = (...names: string[]) => turn.pass(async () => { for (const runId of names) await turn.check.check({ runId, snapshot: {} as PublicDebate }); });
    await pass("a", "b");
    expect(calls).toEqual(["a"]);
    clock += 60_000;
    failing = new Set(["a"]);
    // b was skipped while the judge rested, so it is due with no wait of its own, and its turn comes before a's.
    await pass("a", "b");
    expect(calls).toEqual(["a", "b"]);
    await pass("a");
    expect(calls).toEqual(["a", "b", "a"]);
    // The shared wait (back to a minute after b's answer) is over, but a's own wait, now two minutes, is not.
    clock += 60_000;
    await pass("a");
    expect(calls).toEqual(["a", "b", "a"]);
    // a leaves the lists for a pass: forgotten, its own wait with it.
    await pass();
    failing = new Set();
    await pass("a");
    expect(calls).toEqual(["a", "b", "a", "a"]);
  });

  /**
   * The Free debates' sweep as main.ts composes it, over `waiting` in list order: a decision of the end-of-debate check
   * already stored (`stored`) is read at once; with none, the gate's own check runs in the debate's turn (`ownCheck`), then
   * the publication check. `everyMs` apart, until `untilMs`.
   */
  async function freeSweepWorld(input: Readonly<{
    waiting: string[]; stored: ReadonlySet<string>; ownCheck: (runId: string) => "PROCEED" | "UNAVAILABLE";
    judgeDown: ReadonlySet<string>; ownCheckMs?: number; untilMs: number;
  }>) {
    let clock = 0;
    const endAsked: [string, number][] = [];
    const judged: [string, number][] = [];
    const published: [string, number][] = [];
    const shared = backedOffContentCheck({ check: async ({ runId }) => {
      judged.push([runId, clock]);
      return input.judgeDown.has(runId) ? { outcome: "UNAVAILABLE", cause: "JUDGE_DEADLINE" } : { outcome: "ALLOW" };
    } }, { now: () => clock });
    const turn = checksInTurn(shared, { now: () => clock });
    const pass = () => turn.pass(() => sweepFreePublications({
      cursor: freeSweepCursor(),
      contributions: { readFreeToPublishAfter: async () => input.waiting.map((name) => ({ run_id: name, owner_ref: "o", notice_at: "2026-11-24T08:00:00.000Z" })), refuseFree: async () => "REFUSED" as never },
      publishOne: async (row) => {
        const decision = input.stored.has(row.run_id) ? "PROCEED" : await turn.checkBefore(row.run_id, async () => {
          endAsked.push([row.run_id, clock]);
          clock += input.ownCheckMs ?? 0;
          return input.ownCheck(row.run_id);
        }, (answer) => answer === "UNAVAILABLE") ?? "UNAVAILABLE";
        if (decision !== "PROCEED") return "CHECK_UNAVAILABLE";
        if ((await turn.check.check({ runId: row.run_id, snapshot: {} as PublicDebate })).outcome !== "ALLOW") return "CHECK_UNAVAILABLE";
        input.waiting.splice(input.waiting.indexOf(row.run_id), 1);
        published.push([row.run_id, clock]);
        return "PUBLISHED";
      }
    }));
    const passes: number[] = [];
    while (clock < input.untilMs) {
      passes.push(clock);
      await pass();
      clock += PUBLIC_PAGE_SWEEP_DEFAULTS.everyMs;
    }
    const at = (entries: readonly [string, number][], name: string) => entries.filter(([entry]) => entry === name).map(([, time]) => time);
    return { endAsked: (name: string) => at(endAsked, name), judged: (name: string) => at(judged, name), published, passes };
  }

  it("a Free debate's end-of-debate check takes the debate's turn: one it cannot answer waits its own doubling time and holds back no other; its other answers never end the publication check's wait", async () => {
    const world = await freeSweepWorld({
      waiting: ["f-end-down", "f-judge-down", "f-ok"], stored: new Set(["f-ok"]),
      ownCheck: (runId) => runId === "f-end-down" ? "UNAVAILABLE" : "PROCEED", judgeDown: new Set(["f-judge-down"]), untilMs: 10 * 60_000
    });
    // The debate whose verdict is stored needs no call of the end-of-debate check: it goes public in the first pass, behind
    // both failing ones.
    expect(world.published).toEqual([["f-ok", 0]]);
    // The end-of-debate check that cannot answer is asked again after its own wait of 1, 2 and 4 minutes, each time once
    // the publication check's shared wait has ended too; its debate never reaches the publication check.
    expect(world.endAsked("f-end-down")).toEqual([0, 75_000, 210_000, 465_000]);
    expect(world.judged("f-end-down")).toEqual([]);
    // The end-of-debate check allows the other failing one each time, and that never shortens the doubling of its own
    // publication check's wait: 1, 2 and then 4 minutes. It is never asked in a pass where the other one's check failed.
    expect(world.judged("f-judge-down")).toEqual([15_000, 90_000, 225_000, 480_000]);
    expect(world.endAsked("f-judge-down")).toEqual([15_000, 90_000, 225_000, 480_000]);
  });

  it("a pass waits for at most one end-of-debate check that fails: each may take the whole background time, so the others are asked on the next passes, and a debate whose verdict is stored still goes public at once", async () => {
    const world = await freeSweepWorld({
      waiting: ["f-down-1", "f-down-2", "f-down-3", "f-stored"], stored: new Set(["f-stored"]),
      ownCheck: () => "UNAVAILABLE", ownCheckMs: 2 * 60_000, judgeDown: new Set(), untilMs: 5 * 60_000
    });
    // Each pass asks one of them, which fails after two minutes; the next pass asks the next one.
    expect(world.passes).toEqual([0, 135_000, 270_000]);
    expect(world.endAsked("f-down-1")).toEqual([0]);
    expect(world.endAsked("f-down-2")).toEqual([135_000]);
    expect(world.endAsked("f-down-3")).toEqual([270_000]);
    expect(world.published).toEqual([["f-stored", 120_000]]);
  });
});

describe("the crisis pop-up reads a person's own words everywhere", () => {
  const pick = (kind: string, text: string) => ({ kind, text });
  it("in a dig, on the map or on a public page, their own views and never the AI's suggestions or the dig's written question", () => {
    const parent = { picks: [pick("OWN_VIEW", "my words"), pick("NEEDS_MORE_WEB", "the AI's words")] };
    expect(crisisWordsOf("dig", "the dig's AI-written question", parent)).toEqual(["my words"]);
    expect(crisisWordsOf("dig", "the dig's AI-written question", null)).toEqual([]);
    expect(crisisWordsOf("ask", "the typed question", null)).toEqual(["the typed question"]);
  });
});
