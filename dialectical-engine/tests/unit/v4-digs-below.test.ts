import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  belowBusy, belowSettled, belowStateOf, CLIMB_WATCH_MS, climbAnswersNeeded, climbRowOf, digsBelowOf, recordsToRead, type BelowDig, type BelowTreeInput
} from "../../apps/ui/lib/v4/digsBelow.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import { DIG_LEVEL_MAX, type Answer, type DigLinkRecord, type DigLinks, type PathRewrite } from "../../packages/contract/src/index.js";

/*
 * Owner's screen review, 3 Nov 2026 (dig-f2): "While any dig below this map is still working or still climbing, check every
 * 15 seconds. Stop checking once nothing is running." Which digs are below a map, and whether one of them can still change it.
 */

const catalog = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const ROOT = "a0000000-0000-4000-8000-000000000000";
const id = (n: number): string => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = Date.parse("2026-11-04T12:00:00.000Z");

const link = (child: string, parent: string): DigLink => ({
  parentRunId: parent, childRunId: child, openQuestionIds: ["path:n-mix"], questions: [], mode: "quick", startedAt: "2026-11-04T11:00:00.000Z"
});
const record = (child: string, parent: string): DigLinkRecord =>
  ({ parent_run_id: parent, child_run_id: child, places: ["path:n-mix"], mode: "quick", created_at: "2026-11-04T11:00:00.000Z" });
const records = (entries: Record<string, readonly string[]>): Map<string, DigLinks | null> =>
  new Map(Object.entries(entries).map(([parent, children]) => [parent, { parent: null, children: children.map((child) => record(child, parent)) }]));
const tree = (extra: Partial<BelowTreeInput> = {}): BelowTreeInput =>
  ({ rootRunId: ROOT, direct: [link(id(1), ROOT)], records: new Map(), index: [], visit: [], catalog, ...extra });

const view = (child: string, state: DigView["state"], extra: Partial<DigView> = {}): DigView =>
  ({ link: link(child, ROOT), state, headline: null, counts: null, ...extra });
const base = (dig: string, level: number) => ({ rewrite_id: `rw-${dig}`, dig_run_id: dig, dig_level: level, dig_finished_at: "2026-11-04T11:30:00.000Z" });
const writing = (dig: string, level = 2): PathRewrite => ({ ...base(dig, level), state: "WRITING" });
const failed = (dig: string, level = 2): PathRewrite => ({ ...base(dig, level), state: "FAILED", failed_at: "2026-11-04T11:40:00.000Z" });
const done = (dig: string, changed: boolean, rewrittenAt = "2026-11-04T11:45:00.000Z", level = 2): PathRewrite => ({
  ...base(dig, level), state: "READY", rewritten_at: rewrittenAt, changed,
  text: { line: "A line.", summary: "A summary.", fate: "HELD_UP" }, what_changed: ["Something."], fate_before: "HELD_UP", view: null, dig_paths: []
});
const answerWith = (...rows: PathRewrite[]): Answer => ({
  path_rewrites: { paths: [{ position_ref: "n-mix", current: null, history: rows }], changed_since: { count: 0, since_report_version: null } }
}) as unknown as Answer;

describe("digsBelowOf: the digs below a map's own digs", () => {
  it("goes down the dig records level by level, each dig once, with the debates above it nearest first", () => {
    const below = digsBelowOf(tree({ records: records({ [id(1)]: [id(2)], [id(2)]: [id(3), id(4)] }) }));
    expect(below.map((dig) => [dig.link.childRunId, dig.depth, dig.above])).toEqual([
      [id(2), 2, [id(1), ROOT]],
      [id(3), 3, [id(2), id(1), ROOT]],
      [id(4), 3, [id(2), id(1), ROOT]]
    ]);
    // The map's own digs are not below it; a record naming the map or one of them again is taken once.
    expect(digsBelowOf(tree({ records: records({ [id(1)]: [id(1), ROOT, id(2)], [id(2)]: [id(1)] }) })).map((dig) => dig.link.childRunId)).toEqual([id(2)]);
  });

  it("adds the digs started in this visit under a dig it knows, and nothing without a dig of its own", () => {
    const below = digsBelowOf(tree({ visit: [link(id(5), id(1)), link(id(6), id(5)), link(id(7), "a0000000-0000-4000-8000-0000000000ff")] }));
    expect(below.map((dig) => [dig.link.childRunId, dig.depth])).toEqual([[id(5), 2], [id(6), 3]]);
    expect(digsBelowOf(tree({ direct: [], visit: [link(id(5), id(1))] }))).toEqual([]);
  });

  it("goes no deeper than the deepest level a dig can be", () => {
    const chain = Object.fromEntries(Array.from({ length: DIG_LEVEL_MAX + 3 }, (_, at) => [id(at + 1), [id(at + 2)]]));
    const below = digsBelowOf(tree({ records: records(chain) }));
    expect(Math.max(...below.map((dig) => dig.depth))).toBe(DIG_LEVEL_MAX);
  });

  it("says which debates' records are still to read: the map's own digs first, then each level found", () => {
    const first = tree();
    expect(recordsToRead(first, digsBelowOf(first))).toEqual([id(1)]);
    const second = tree({ records: records({ [id(1)]: [id(2)] }) });
    expect(recordsToRead(second, digsBelowOf(second))).toEqual([id(2)]);
    const unreadable = tree({ records: new Map([[id(1), null]]) });
    expect(recordsToRead(unreadable, digsBelowOf(unreadable))).toEqual([]);
  });
});

describe("belowStateOf: can a dig below still change this map?", () => {
  const two: BelowDig = { link: link(id(2), id(1)), depth: 2, above: [id(1), ROOT] };
  const three: BelowDig = { link: link(id(3), id(2)), depth: 3, above: [id(2), id(1), ROOT] };
  const none = () => undefined;

  it("a dig not read yet, waiting or running is working; one at the month wall or failed is not", () => {
    expect(belowStateOf(two, null, none, NOW)).toBe("WORKING");
    expect(belowStateOf(two, view(id(2), "WAITING"), none, NOW)).toBe("WORKING");
    expect(belowStateOf(two, view(id(2), "RUNNING"), none, NOW)).toBe("WORKING");
    expect(belowStateOf(two, view(id(2), "RUNNING", { pausedUntil: "2026-12-01T00:00:00.000Z" }), none, NOW)).toBe("QUIET");
    expect(belowStateOf(two, view(id(2), "FAILED"), none, NOW)).toBe("QUIET");
  });

  it("a finished dig climbs while its own rewrite is written; it is quiet once it changed nothing, failed or rewrote no path", () => {
    expect(belowStateOf(two, view(id(2), "DONE", { rewrite: writing(id(2)) }), none, NOW)).toBe("CLIMBING");
    expect(belowStateOf(two, view(id(2), "DONE", { rewrite: done(id(2), false) }), none, NOW)).toBe("QUIET");
    expect(belowStateOf(two, view(id(2), "DONE", { rewrite: failed(id(2)) }), none, NOW)).toBe("QUIET");
    expect(belowStateOf(two, view(id(2), "DONE", { rewrite: null }), none, NOW)).toBe("QUIET");
    expect(belowStateOf(two, view(id(2), "DONE"), none, NOW)).toBe("QUIET");
  });

  it("a change follows its climb up to this map's own answer: still on its way until that row is done there", () => {
    const changed = view(id(2), "DONE", { rewrite: done(id(2), true) });
    const rootIs = (answer: Answer | undefined) => (runId: string) => (runId === ROOT ? answer : undefined);
    expect(climbAnswersNeeded(two)).toEqual([ROOT]);
    expect(belowStateOf(two, changed, rootIs(undefined), NOW)).toBe("CLIMBING");
    expect(belowStateOf(two, changed, rootIs(answerWith()), NOW)).toBe("CLIMBING");
    expect(belowStateOf(two, changed, rootIs(answerWith(writing(id(2)))), NOW)).toBe("CLIMBING");
    expect(belowStateOf(two, changed, rootIs(answerWith(done(id(2), true))), NOW)).toBe("QUIET");
    expect(belowStateOf(two, changed, rootIs(answerWith(done(id(2), false))), NOW)).toBe("QUIET");
    expect(belowStateOf(two, changed, rootIs(answerWith(failed(id(2)))), NOW)).toBe("QUIET");
  });

  it("three levels down, the climb passes the debate in between first, and stops there when that level came out unchanged", () => {
    const changed = view(id(3), "DONE", { rewrite: done(id(3), true, undefined, 3) });
    const answers = (between: Answer | undefined, root: Answer | undefined) => (runId: string) => (runId === id(1) ? between : runId === ROOT ? root : undefined);
    expect(climbAnswersNeeded(three)).toEqual([id(1), ROOT]);
    expect(belowStateOf(three, changed, answers(answerWith(writing(id(3), 3)), undefined), NOW)).toBe("CLIMBING");
    expect(belowStateOf(three, changed, answers(answerWith(done(id(3), false, undefined, 3)), undefined), NOW)).toBe("QUIET");
    expect(belowStateOf(three, changed, answers(answerWith(done(id(3), true, undefined, 3)), answerWith()), NOW)).toBe("CLIMBING");
    expect(belowStateOf(three, changed, answers(answerWith(done(id(3), true, undefined, 3)), answerWith(done(id(3), true, undefined, 3))), NOW)).toBe("QUIET");
  });

  it("stops waiting for a level's row once its own rewrite is older than CLIMB_WATCH_MS (a left-out row never keeps the page asking)", () => {
    const at = NOW - CLIMB_WATCH_MS - 1;
    const old = view(id(2), "DONE", { rewrite: done(id(2), true, new Date(at).toISOString()) });
    expect(belowStateOf(two, old, () => answerWith(), NOW)).toBe("QUIET");
    expect(belowStateOf(two, old, () => answerWith(), at + CLIMB_WATCH_MS)).toBe("CLIMBING");
    // A row that is there and still being written is waited for, however long it takes.
    expect(belowStateOf(two, old, () => answerWith(writing(id(2))), NOW)).toBe("CLIMBING");
  });

  it("finds a climb's row in any path, by the dig that started it", () => {
    const answer = {
      path_rewrites: {
        paths: [
          { position_ref: "n-mix", current: null, history: [writing(id(9))] },
          { position_ref: "n-renew", current: null, history: [writing(id(2).toUpperCase())] }
        ],
        changed_since: { count: 0, since_report_version: null }
      }
    } as unknown as Answer;
    expect(climbRowOf(answer, id(2))?.dig_run_id).toBe(id(2).toUpperCase());
    expect(climbRowOf(answer, id(3))).toBeNull();
    expect(climbRowOf(null, id(2))).toBeNull();
  });
});

describe("belowBusy and belowSettled", () => {
  it("is busy while one dig below works or climbs, and stops once all are quiet", () => {
    expect(belowBusy(["QUIET", "CLIMBING"])).toBe(true);
    expect(belowBusy(["WORKING"])).toBe(true);
    expect(belowBusy(["QUIET", "QUIET"])).toBe(false);
    expect(belowBusy([])).toBe(false);
  });

  it("reads again a dig that may still move; never one that failed or whose change has settled", () => {
    expect(belowSettled(view(id(2), "FAILED"), "QUIET")).toBe(true);
    expect(belowSettled(view(id(2), "DONE"), "QUIET")).toBe(true);
    expect(belowSettled(view(id(2), "DONE"), "CLIMBING")).toBe(false);
    expect(belowSettled(view(id(2), "RUNNING", { pausedUntil: "2026-12-01T00:00:00.000Z" }), "QUIET")).toBe(false);
    expect(belowSettled(null, "QUIET")).toBe(false);
  });
});
