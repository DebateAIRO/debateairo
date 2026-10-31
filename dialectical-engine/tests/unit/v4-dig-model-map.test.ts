import { describe, expect, it } from "vitest";
import { AnswerSchema, type Answer, type AnswerStory, type PathRewrite, type RunProjection } from "@debateai/contract";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import { diffSnapshots, rewriteNewsOf, selectionForChange, snapshotItems } from "../../apps/ui/lib/v4/changes.js";
import { loadAnswer, loadDigTrail, loadDigView, loadV4 } from "../../apps/ui/lib/v4/load.js";
import { buildV4Map, rewriteByDig, rewriteStateOf, rewriteWaiting } from "../../apps/ui/lib/v4/mapModel.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import { createSeed } from "../../tools/v4-mock-api/seed.js";
import { DIG_ANSWERS, DIG_RUNS, PATH_REWRITES } from "../../tools/v4-mock-api/rewrite-seed.js";

/*
 * Dig model revision W4-6 (owner answers of 30-31 Oct): the V4 map model of rewritten paths and nested digs, its reads and
 * its news. A dig keeps its points and its answer text and writes no story (Q-D13): its map is built from its rewrite's own
 * paths (Q-D2), or from the positions it argued, and no story is ever read for it. A rewritten path shows its newest
 * finished text, and its fate counts for Decision B. A finished rewrite is news at the path it rewrote.
 */

const seed = createSeed(fixture);
const story = seed.story("aaaa1111-1111-4111-8111-111111111111", "READY", "2026-10-27T15:41:00.000Z") as AnswerStory;

function answerOf(runId: string, extra: Partial<Answer> = {}): Answer {
  return AnswerSchema.parse({
    ...(seed.answer({
      answerId: "aaaa1111-1111-4111-8111-111111111111", runRef: runId, question: "Nuclear or renewables?",
      askedAt: "2026-10-27T15:12:00.000Z", servedAt: "2026-10-27T15:40:00.000Z", web: "PAID"
    }) as Answer),
    ...extra
  });
}

const trailAnswer = (runId: string): Answer => answerOf(runId, {
  ...(DIG_ANSWERS[runId] === undefined ? {} : { dig: DIG_ANSWERS[runId] }),
  ...(PATH_REWRITES[runId] === undefined ? {} : { path_rewrites: PATH_REWRITES[runId] })
});

function run(state: RunProjection["state"], extra: Partial<RunProjection> = {}): RunProjection {
  return { run_ref: "child", question_line: "Q", state, terminal_reason: null, hold_until: null, waits_until: null, ...extra };
}

const link: DigLink = { parentRunId: "parent", childRunId: DIG_RUNS.levelOne, openQuestionIds: ["path:n-renew"], questions: ["Q?"], mode: "quick", startedAt: null };

describe("the map of a first debate whose paths digs rewrote", () => {
  const map = buildV4Map({ runId: DIG_RUNS.root, answer: trailAnswer(DIG_RUNS.root), story });

  it("shows each rewritten path's newest text and fate, keeps what it said before, and marks the path changed below", () => {
    const mix = map.paths.find((path) => path.id === "n-mix")!;
    expect(mix.line).toBe(PATH_REWRITES[DIG_RUNS.root]!.paths[0]!.current!.line);
    expect(mix.rewrites!.original.line).toBe(story.story!.short.paths[0]!.line);
    expect(mix.positionRef).toBe("n-mix");
    expect(map.paths.find((path) => path.id === "n-renew")!.rewrites!.changedBelow).toBe(true);
    // A failed rewrite and one that changed nothing leave the path's text as the story wrote it.
    expect(map.paths.find((path) => path.id === "n-nuclear")!.line).toBe(story.story!.short.paths[2]!.line);
    expect(rewriteStateOf(map.paths.find((path) => path.id === "n-nuclear")!.rewrites!.history.at(-1))).toBe("FAILED");
    expect(map.paths.find((path) => path.id === "n-smr")!.line).toBe(story.story!.short.paths[3]!.line);
    expect(rewriteStateOf(map.paths.find((path) => path.id === "n-smr")!.rewrites!.history.at(-1))).toBe("NO_CHANGE");
    // A path no dig touched carries no rewrites.
    const untouched = buildV4Map({ runId: "r", answer: answerOf("r"), story });
    expect(untouched.paths.every((path) => path.rewrites === undefined)).toBe(true);
    expect(map.changedSince).toEqual({ count: 2, since_report_version: 1 });
    expect(map.storyState).toBe("READY");
    expect(map.dig).toBeNull();
  });

  it("a rewrite that makes a path fall makes its position not hold (Decision B), and one that lifts it undoes that", () => {
    const fell: PathRewrite = {
      rewrite_id: "rw-x", dig_run_id: "d9000000-0000-4000-8000-000000000001", dig_level: 1, dig_finished_at: "2026-10-31T09:00:00.000Z",
      state: "READY", rewritten_at: "2026-10-31T09:01:00.000Z", changed: true, text: { line: "Fell now.", summary: "Fell.", fate: "FELL" },
      what_changed: ["It fell."], fate_before: "HELD_UP", view: null, dig_paths: []
    };
    const lifted: PathRewrite = { ...fell, rewrite_id: "rw-y", text: { line: "Stands now.", summary: "Stands.", fate: "PARTLY_HELD" }, fate_before: "FELL" };
    const rewrites = (position: string, rewrite: PathRewrite) => ({
      paths: [{ position_ref: position, current: (rewrite as Extract<PathRewrite, { state: "READY" }>).text, history: [rewrite] }],
      changed_since: { count: 1, since_report_version: null }
    });
    const down = buildV4Map({ runId: "r", answer: answerOf("r", { path_rewrites: rewrites("n-mix", fell) }), story });
    expect(down.points.find((point) => point.id === "n-mix")!.trust).toBe("DIDNT_HOLD");
    const up = buildV4Map({ runId: "r", answer: answerOf("r", { path_rewrites: rewrites("n-nuclear", lifted) }), story });
    expect(up.points.find((point) => point.id === "n-nuclear")!.basis).not.toBe("FELL");
  });

  it("W4-8 (Q-D3): a rewritten path counts the words the server worked out; a path no dig rewrote keeps its own counts", () => {
    const plain = buildV4Map({ runId: "r", answer: answerOf("r"), story });
    const mixBefore = plain.paths.find((path) => path.id === "n-mix")!;
    // The server's words: the path's own points as the page places them, plus two dig points the rewrite rests on.
    const own = mixBefore.points.map((point) => ({ node_id: point.id, word: point.trust }));
    const unworded: PathRewrite = {
      rewrite_id: "rw-t", dig_run_id: "d9000000-0000-4000-8000-000000000001", dig_level: 1, dig_finished_at: "2026-10-31T09:00:00.000Z",
      state: "READY", rewritten_at: "2026-10-31T09:01:00.000Z", changed: true, text: { line: "Partly now.", summary: "Partly.", fate: "HELD_UP" },
      what_changed: ["It changed."], fate_before: "HELD_UP", view: null, dig_paths: [], rests_on: ["n-dig-a", "n-dig-b"]
    };
    const rewrite: PathRewrite = { ...unworded, trust: [...own, { node_id: "n-dig-a", word: "SURE" }, { node_id: "n-dig-b", word: null }] } as PathRewrite;
    const answer = answerOf("r", { path_rewrites: { paths: [{ position_ref: "n-mix", current: { line: "Partly now.", summary: "Partly.", fate: "HELD_UP" },
      history: [rewrite] }], changed_since: { count: 1, since_report_version: null } } });
    const after = buildV4Map({ runId: "r", answer, story });
    const mix = after.paths.find((path) => path.id === "n-mix")!;
    expect(mix.counts).toEqual({ ...mixBefore.counts, SURE: mixBefore.counts.SURE + 1 });
    expect(mix.unchecked).toBe(mixBefore.unchecked + 1);
    // The points listed under the path stay its own; the other paths keep today's counts.
    expect(mix.points).toEqual(mixBefore.points);
    for (const path of after.paths.filter((candidate) => candidate.id !== "n-mix")) {
      expect(path.counts, path.id).toEqual(plain.paths.find((candidate) => candidate.id === path.id)!.counts);
    }
    // A rewrite served without words (before W4-8) leaves the path's own counts.
    const old = buildV4Map({ runId: "r", answer: answerOf("r", { path_rewrites: { paths: [{ position_ref: "n-mix",
      current: { line: "Partly now.", summary: "Partly.", fate: "HELD_UP" }, history: [unworded] }], changed_since: { count: 1, since_report_version: null } } }), story });
    expect(old.paths.find((path) => path.id === "n-mix")!.counts).toEqual(mixBefore.counts);
  });

  it("names the four rewrite states, and says when something is still being rewritten", () => {
    expect(rewriteStateOf(null)).toBeNull();
    const history = PATH_REWRITES[DIG_RUNS.levelTwo]!.paths[0]!.history;
    expect(rewriteStateOf(history[0])).toBe("REWRITING");
    expect(rewriteStateOf(PATH_REWRITES[DIG_RUNS.root]!.paths[0]!.history[0])).toBe("REWRITTEN");
    expect(rewriteWaiting(map)).toBe(false);
    expect(rewriteWaiting(buildV4Map({ runId: DIG_RUNS.levelTwo, answer: trailAnswer(DIG_RUNS.levelTwo), story: null }))).toBe(true);
    expect(rewriteByDig(map, DIG_RUNS.ownView)?.path.id).toBe("n-mix");
    expect(rewriteByDig(map, "nobody")).toBeNull();
  });
});

describe("a dig's own map (no story, Q-D13)", () => {
  it("is built from its rewrite's own paths with their lines and fates, never from a story", () => {
    const map = buildV4Map({ runId: DIG_RUNS.levelOne, answer: trailAnswer(DIG_RUNS.levelOne), story });
    expect(map.storyState).toBe("NONE");
    expect(map.headline).toBeNull();
    expect(map.fallbackText).not.toBeNull();
    const own = (DIG_ANSWERS[DIG_RUNS.levelOne]!.rewrite as Extract<PathRewrite, { state: "READY" }>).dig_paths;
    expect(map.paths.map((path) => path.id)).toEqual(own.map((path) => path.position_ref));
    expect(map.paths[0]!.line).toBe(own[0]!.line);
    expect(map.paths[0]!.fate).toBe(own[0]!.fate);
    // Each path holds its position's points, through the answer's edges.
    expect(map.paths[1]!.points.map((point) => point.id)).toEqual(["n-renew", "n-renew-cost", "n-renew-battery", "n-renew-storage", "n-renew-winter"]);
    expect(map.dig?.level).toBe(1);
    expect(map.digLevel).toBe(1);
  });

  it("before its rewrite is written, shows the positions it argued with their own claims and no fate", () => {
    const map = buildV4Map({ runId: DIG_RUNS.levelThree, answer: trailAnswer(DIG_RUNS.levelThree), story });
    expect(map.paths.map((path) => path.id)).toEqual(["n-mix", "n-renew", "n-nuclear", "n-smr"]);
    expect(map.paths.every((path) => path.fate === null)).toBe(true);
    expect(map.paths[2]!.points.map((point) => point.id)).toEqual(["n-nuclear", "n-nuclear-build", "n-nuclear-clean"]);
    expect(map.paths[0]!.line).toContain("Do both, in proportion");
  });
});

describe("the reads", () => {
  const client = (answers: Record<string, Answer | Error>, runState: RunProjection = run("SETTLED")) => {
    const calls: string[] = [];
    const reply = (id: string): Promise<Answer> => {
      const answer = answers[id];
      return answer === undefined || answer instanceof Error ? Promise.reject(answer ?? new Error("none")) : Promise.resolve(answer);
    };
    return {
      calls,
      readRun: async (id: string) => { calls.push(`readRun:${id}`); return runState; },
      readRunAnswer: (id: string) => { calls.push(`readRunAnswer:${id}`); return reply(id); },
      readAnswer: (id: string) => { calls.push(`readAnswer:${id}`); return reply(id); },
      readAnswerStory: async (id: string) => { calls.push(`readAnswerStory:${id}`); return story; }
    };
  };

  it("loadV4 never reads a story for a dig", async () => {
    const reads = client({ [DIG_RUNS.levelOne]: trailAnswer(DIG_RUNS.levelOne) });
    const load = await loadV4(DIG_RUNS.levelOne, reads);
    expect(load).toMatchObject({ kind: "SERVED", story: null });
    expect(reads.calls.some((call) => call.startsWith("readAnswerStory"))).toBe(false);
  });

  it("a dig's view is its rewrite and its points, with no story read; a paused dig says until when", async () => {
    const reads = client({ [DIG_RUNS.levelOne]: trailAnswer(DIG_RUNS.levelOne) });
    const view = await loadDigView(link, reads);
    expect(view).toMatchObject({ state: "DONE", headline: null, rewrite: DIG_ANSWERS[DIG_RUNS.levelOne]!.rewrite });
    expect(view.points!.length).toBeGreaterThan(0);
    expect(reads.calls.some((call) => call.startsWith("readAnswerStory"))).toBe(false);
    const paused = await loadDigView(link, client({}, run("RUNNING", { month_pause: { until: "2026-11-01T00:00:00.000Z", can_continue: false } })));
    expect(paused).toEqual({ link, state: "RUNNING", headline: null, counts: null, pausedUntil: "2026-11-01T00:00:00.000Z" });
  });

  it("loadAnswer reads the run's answer again, and never throws", async () => {
    expect((await loadAnswer(DIG_RUNS.root, client({ [DIG_RUNS.root]: trailAnswer(DIG_RUNS.root) })))?.run_ref).toBe(DIG_RUNS.root);
    expect(await loadAnswer(DIG_RUNS.root, client({}))).toBeNull();
    expect(await loadAnswer(DIG_RUNS.root, { readRunAnswer: () => { throw new Error("at once"); } })).toBeNull();
  });

  it("loadDigTrail walks up to the main question, top first, and stops part-way when one cannot be read", async () => {
    const all = Object.fromEntries([DIG_RUNS.root, DIG_RUNS.levelOne, DIG_RUNS.levelTwo].map((id) => [id, trailAnswer(id)]));
    const trail = await loadDigTrail(DIG_ANSWERS[DIG_RUNS.levelThree]!, client(all));
    expect(trail.complete).toBe(true);
    expect(trail.steps.map((step) => [step.runId, step.pathRef])).toEqual([
      [DIG_RUNS.root, "n-renew"], [DIG_RUNS.levelOne, "n-renew"], [DIG_RUNS.levelTwo, "n-nuclear"]
    ]);
    const { [DIG_RUNS.root]: _gone, ...partial } = all;
    expect(await loadDigTrail(DIG_ANSWERS[DIG_RUNS.levelThree]!, client(partial))).toMatchObject({ complete: false });
  });
});

describe("news of a finished rewrite", () => {
  const before = buildV4Map({ runId: DIG_RUNS.levelTwo, answer: trailAnswer(DIG_RUNS.levelTwo), story: null });
  const ready: PathRewrite = {
    ...PATH_REWRITES[DIG_RUNS.levelTwo]!.paths[0]!.history[0]!, state: "READY", rewritten_at: "2026-10-30T15:45:00.000Z", changed: true,
    text: { line: "Firm plants were built faster elsewhere: partly held.", summary: "Faster elsewhere.", fate: "PARTLY_HELD" },
    what_changed: ["It found faster builds elsewhere."], fate_before: "HELD_UP", view: null, dig_paths: []
  } as PathRewrite;
  const after = buildV4Map({
    runId: DIG_RUNS.levelTwo,
    answer: answerOf(DIG_RUNS.levelTwo, {
      dig: DIG_ANSWERS[DIG_RUNS.levelTwo],
      path_rewrites: { paths: [{ position_ref: "n-nuclear", current: (ready as Extract<PathRewrite, { state: "READY" }>).text, history: [ready] }], changed_since: { count: 1, since_report_version: null } }
    }),
    story: null
  });
  const dig = (rewrite: PathRewrite): DigView => ({
    link: { ...link, childRunId: DIG_RUNS.levelThree }, state: "DONE", headline: null, counts: null, rewrite
  });

  it("a dig's word becomes what became of its rewrite, and the news is told at the path it rewrote", () => {
    const was = snapshotItems(before, [dig(PATH_REWRITES[DIG_RUNS.levelTwo]!.paths[0]!.history[0]!)]);
    expect(was[`dig:${DIG_RUNS.levelThree}`]).toBe("REWRITING");
    const now = snapshotItems(after, [dig(ready)]);
    expect(now[`dig:${DIG_RUNS.levelThree}`]).toBe("CHANGED");
    const changes = diffSnapshots({ at: "", items: was }, now);
    const news = changes.find((change) => change.id === `dig:${DIG_RUNS.levelThree}`)!;
    expect(news).toMatchObject({ kind: "CHANGED", before: "REWRITING", now: "CHANGED" });
    expect(selectionForChange(after, news)).toBe("path:n-nuclear");
    expect(rewriteNewsOf(after, changes)).toEqual([{ path: after.paths.find((path) => path.id === "n-nuclear"), changed: true }]);
    // A rewrite whose dig the page does not list is an item of its own (so a visit from elsewhere still tells it).
    expect(snapshotItems(after, [])[`dig:${DIG_RUNS.levelThree}`]).toBe("CHANGED");
    // A dig still running keeps its state word; a dig from before R22 (no rewrite) stays "DONE".
    expect(snapshotItems(after, [{ ...dig(ready), state: "RUNNING" }])[`dig:${DIG_RUNS.levelThree}`]).toBe("RUNNING");
    const old: DigView = { link: { ...link, childRunId: "old" }, state: "DONE", headline: "H", counts: null };
    expect(snapshotItems(after, [old])["dig:old"]).toBe("DONE");
  });

  it("every word fits the account's last-visit shape", () => {
    for (const word of Object.values(snapshotItems(after, [dig(ready)]))) expect(word).toMatch(/^[A-Za-z_]{1,32}$/u);
  });
});
