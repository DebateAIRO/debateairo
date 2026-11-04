/*
 * DRAFT play (owner's screen review, 3 Nov 2026, dig-f2): a change made three levels down climbs up to the first map, so the
 * click-through can see the first map notice it without a reload. The shapes are the contract's (packages/contract/src/
 * web.ts); every text here is MADE UP.
 *
 * The seeded dig trail (rewrite-seed.ts): 1111 → 8888 (dug 1111's n-renew) → d200 (dug 8888's n-renew) → d300 (dug d200's
 * n-nuclear), whose own rewrite is still WRITING. So the first map (1111) keeps reading its answer every 15 s: a dig below it
 * is still climbing. The switch climb=PLAY plays the rest, as the server's climb does it (apps/runner/src/path-climb.ts: each
 * level above is rewritten in turn, its row named by the dig that started the climb):
 *   +10 s  d300's own rewrite of d200's n-nuclear is done (it changed the path); 8888's n-renew takes its turn (WRITING);
 *   +20 s  8888's row is done (changed); 1111's n-renew takes its turn (WRITING);
 *   +30 s  1111's row is done (changed): the first map's n-renew now reads the climbed text, as news.
 * The main answer that would follow is not played (dig-f1's own play covers that). climb=SEED goes back to the seed.
 */
import type { AnswerPathRewrites, PathRewrite } from "../../packages/contract/src/web.js";
import { DIG_FINISHED_AT, DIG_RUNS, PATH_REWRITES } from "./rewrite-seed.js";

export const CLIMB_MODES = ["SEED", "PLAY"] as const;
export type ClimbMode = (typeof CLIMB_MODES)[number];
/** Each level of the played climb takes this long. */
export const CLIMB_STEP_MS = 10_000;

type ReadyRewrite = Extract<PathRewrite, { state: "READY" }>;

/** What the climb has changed by a given moment: d300's own rewrite and the rewrites of the three debates above it. */
export type ClimbParts = Readonly<{
  levelThreeRewrite: PathRewrite;
  levelTwoPaths: AnswerPathRewrites;
  levelOnePaths: AnswerPathRewrites;
  rootPaths: AnswerPathRewrites;
}>;

const iso = (ms: number): string => new Date(ms).toISOString();

const LEVEL_THREE_BASE = {
  rewrite_id: "rw-d300-n-nuclear", dig_run_id: DIG_RUNS.levelThree, dig_level: 3, dig_finished_at: DIG_FINISHED_AT.levelThree
} as const;

/** d300's own rewrite, done: the path it dug on d200's map changed (its fate moved: "Corrected"). */
function levelThreeDone(at: number): ReadyRewrite {
  return {
    ...LEVEL_THREE_BASE, state: "READY", rewritten_at: iso(at), changed: true,
    text: {
      line: "Firm plants are still needed where there are no mountains: partly held. Reactors were built faster in some Asian countries, but those build times were not repeated in Europe.",
      summary: "Faster builds happened elsewhere; repeating them here is not shown.",
      fate: "PARTLY_HELD"
    },
    what_changed: ["The dig found that reactors were built faster outside Europe and North America, but not that it could be repeated here."],
    fate_before: "HELD_UP", view: null,
    dig_paths: [
      { position_ref: "n-mix", line: "Build firm plants on the faster timetables seen abroad.", fate: "PARTLY_HELD" },
      { position_ref: "n-nuclear", line: "Asian build times can be repeated in Europe.", fate: "FELL" }
    ]
  };
}

/** A climbed row (cause CHILD_PATH): named by d300, the dig that started the climb, at its level and finish time. */
function climbRow(rewriteId: string): Extract<PathRewrite, { state: "WRITING" }> {
  return { rewrite_id: rewriteId, dig_run_id: DIG_RUNS.levelThree, dig_level: 3, dig_finished_at: DIG_FINISHED_AT.levelThree, cause: "CHILD_PATH", state: "WRITING" };
}

function climbDone(rewriteId: string, at: number, fateBefore: ReadyRewrite["fate_before"], text: ReadyRewrite["text"], changed: string): ReadyRewrite {
  return {
    ...climbRow(rewriteId), state: "READY", rewritten_at: iso(at), changed: true, text, what_changed: [changed], fate_before: fateBefore, view: null,
    dig_paths: [{ position_ref: "n-nuclear", line: "Firm plants are still needed where there are no mountains, built on timetables seen abroad.", fate: "PARTLY_HELD" }]
  };
}

const LEVEL_ONE_TEXT: ReadyRewrite["text"] = {
  line: "Batteries and power lines alone can already cover several windless days: did not hold. Where there are no mountains for pumped hydro, firm plants are still needed, and how fast they can be built here is open.",
  summary: "Batteries cover hours; without mountains, firm plants are still needed.",
  fate: "FELL"
};
const ROOT_TEXT: ReadyRewrite["text"] = {
  line: "Only renewables and storage: partly held. It is the cheapest and fastest way to add clean power, but a windless winter week still needs firm plants where there are no mountains, and how fast those can be built here is open.",
  summary: "Cheapest and fastest to build; firm plants are still needed for windless weeks.",
  fate: "PARTLY_HELD"
};

/** The parts as the climb has left them at `nowMs`, played from `playedAt` (null: the seed, d300 still rewriting). */
export function climbAt(nowMs: number, playedAt: number | null): ClimbParts {
  const seed: ClimbParts = {
    levelThreeRewrite: { ...LEVEL_THREE_BASE, state: "WRITING" },
    levelTwoPaths: PATH_REWRITES[DIG_RUNS.levelTwo]!,
    levelOnePaths: PATH_REWRITES[DIG_RUNS.levelOne]!,
    rootPaths: PATH_REWRITES[DIG_RUNS.root]!
  };
  if (playedAt === null) return seed;
  const step = Math.floor(Math.max(0, nowMs - playedAt) / CLIMB_STEP_MS);
  if (step < 1) return seed;
  const own = levelThreeDone(playedAt + CLIMB_STEP_MS);
  const levelTwoPaths: AnswerPathRewrites = {
    paths: [{ position_ref: "n-nuclear", current: own.text, history: [own] }],
    changed_since: { count: 1, since_report_version: null }
  };
  const levelOneBase = PATH_REWRITES[DIG_RUNS.levelOne]!.paths[0]!;
  const levelOneRow = step < 2 ? climbRow("rw-d300-climb-8888-n-renew")
    : climbDone("rw-d300-climb-8888-n-renew", playedAt + 2 * CLIMB_STEP_MS, levelOneBase.current!.fate, LEVEL_ONE_TEXT,
      "A dig further down found that firm plants are still needed where there are no mountains for pumped hydro.");
  const levelOnePaths: AnswerPathRewrites = {
    paths: [{
      position_ref: levelOneBase.position_ref,
      current: levelOneRow.state === "READY" ? levelOneRow.text : levelOneBase.current,
      history: [...levelOneBase.history, levelOneRow]
    }],
    changed_since: { count: 1, since_report_version: null }
  };
  const rootSeed = PATH_REWRITES[DIG_RUNS.root]!;
  const rootPaths: AnswerPathRewrites = step < 2 ? rootSeed : {
    ...rootSeed,
    paths: rootSeed.paths.map((path) => {
      if (path.position_ref !== "n-renew") return path;
      const row = step < 3 ? climbRow("rw-d300-climb-1111-n-renew")
        : climbDone("rw-d300-climb-1111-n-renew", playedAt + 3 * CLIMB_STEP_MS, path.current!.fate, ROOT_TEXT,
          "A dig two levels further down found that a windless winter week still needs firm plants where there are no mountains.");
      return { ...path, current: row.state === "READY" ? row.text : path.current, history: [...path.history, row] };
    })
  };
  return { levelThreeRewrite: own, levelTwoPaths, levelOnePaths, rootPaths };
}
