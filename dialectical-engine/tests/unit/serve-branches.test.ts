/**
 * V4 start step, Task 57 (spec 2026-11-03 §2 items 7 and 8, §4.3; items journey-f1, wait-d1, wait-f16): the paths of a path debate as the
 * answer and the run read serve them, read by one pure function from the stored paths (0158), their roots, outcomes and gap round (0159).
 * A path with an outcome is argued (or failed, with a FAILED outcome); while the debate runs a path without one is still being looked
 * into, so a path fills in the moment its own outcome is stored. "+ N more" is the menu's paths none of whose viewpoints was chosen; "also
 * raised" is the gap round's points no path took; the main trust word comes from the paths' words. A debate without chosen paths has no
 * branches, and then none of its content is opened. Made-up words only.
 */
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { AnswerBranchesSchema, type PathGapRound, type PathId, type PathOutcome, type StartMenu } from "@debateai/contract";
import type { PathRootInForce, StoredStartPathSet } from "@debateai/db";
import {
  answerBranchesOf, branchStateOf, postgresBranchReadPorts, readAnswerBranches, webPathRootsOfBranches, webPathsAtRoots,
  type BranchReadPorts
} from "@debateai/serve";
import { outcomeFixture } from "../support/branchesFixture.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const READY = outcomeFixture("READY", { trust: "SURE" });
const RESERVED = outcomeFixture("READY_WITH_RESERVATION", { trust: "STILL_ARGUED" });
const FAILED = outcomeFixture("FAILED");

const menuPath = (n: number) => ({ path_ref: `kp0${n}`, title: `Menu path ${n}`, question: `What does menu path ${n} ask?`,
  viewpoint_ids: [`pt1${n}`], put_together: false, is_new: n === 4 });
/** Four menu paths; the person chose the viewpoints of kp01 and kp03, so kp02 and kp04 (merged in late) are "+ 2 more". */
const MENU = {
  menu_id: "AAAAAAAAAAAAAAAAAAAAAA", revision: 1, language: { code: "en", name: "English" },
  angles: [{ angle_id: "g1", kind: "GENERAL", label: "The whole picture" }],
  viewpoints: [1, 2, 3, 4].map((n) => ({ viewpoint_id: `pt1${n}`, title: `Menu path ${n}`, question: `What does menu path ${n} ask?`,
    why: "It matters.", angle_id: "g1", repeat_ids: [] })),
  repeats: [], paths: [1, 2, 3, 4].map(menuPath), cards: [], suggestions: []
} as StartMenu;

const SET: StoredStartPathSet = {
  runId: RUN_ID, source: "MENU", width: 5, chosenBy: "PERSON", carryOnToReport: true, menu: { menu: MENU, lateLists: [] },
  paths: [
    { pathId: "b1", pathNo: 1, author: "AI_SUGGESTION", title: "Whole-system costs", question: "What do storage and the grid add to the cost?",
      viewpoints: [{ viewpointId: "pt11", pickNo: null, title: "Menu path 1", question: "What does menu path 1 ask?", own: false }], ownWords: [] },
    { pathId: "b2", pathNo: 2, author: "AI_COMBINED", title: "Safety and waste", question: "How safe is it, and where does the waste go?",
      viewpoints: [{ viewpointId: "pt13", pickNo: null, title: "Menu path 3", question: "What does menu path 3 ask?", own: false },
        { viewpointId: "pt21", pickNo: null, title: "A late idea", question: "Where does the waste go?", own: false }], ownWords: [] },
    { pathId: "b3", pathNo: 3, author: "PERSON_OWN_VIEW", title: "Cernavodă jobs", question: "What happens to the jobs in Cernavodă?",
      viewpoints: [{ viewpointId: null, pickNo: null, title: null, question: "What happens to the jobs in Cernavodă?", own: true }],
      ownWords: ["What happens to the jobs in Cernavodă?"] }
  ]
};
const ROOTS: readonly Pick<PathRootInForce, "pathId" | "rootNodeId">[] = [{ pathId: "b1", rootNodeId: "n-1" }, { pathId: "b2", rootNodeId: "n-2" }];
const outcomesOf = (entries: readonly (readonly [string, PathOutcome])[]): ReadonlyMap<string, PathOutcome> => new Map(entries);
const ANSWERED = outcomesOf([["b1", READY], ["b2", FAILED], ["b3", FAILED]]);

describe("a path's state", () => {
  it("follows its outcome, and without one: looking while the debate runs, else argued with a root and failed without", () => {
    const table = [
      [READY, "n-1", "ANSWER", "ARGUED"],
      [RESERVED, "n-1", "RUN", "ARGUED"],
      [FAILED, "n-1", "RUN", "FAILED"],
      [null, "n-1", "RUN", "LOOKING"],
      [null, "n-1", "ANSWER", "ARGUED"],
      [null, null, "ANSWER", "FAILED"]
    ] as const;
    for (const [outcome, root, phase, state] of table) {
      expect(branchStateOf(outcome, root, phase), `${outcome?.state ?? "none"} ${root ?? "no root"} ${phase}`).toBe(state);
    }
  });
});

describe("the paths of a path debate", () => {
  it("names each path by its id, in order, with its state and root, and the contract takes it back unchanged", () => {
    const branches = answerBranchesOf({ set: SET, roots: ROOTS, outcomes: ANSWERED, gap: null, phase: "ANSWER" });
    expect(branches.paths.map((path) => [path.path_id, path.state, path.root_node_id])).toEqual([["b1", "ARGUED", "n-1"], ["b2", "FAILED", "n-2"],
      ["b3", "FAILED", null]]);
    expect(branches.paths.map((path) => [path.order, path.title, path.author])).toEqual([[1, "Whole-system costs", "AI_SUGGESTION"],
      [2, "Safety and waste", "AI_COMBINED"], [3, "Cernavodă jobs", "PERSON_OWN_VIEW"]]);
    expect(branches.paths.map((path) => path.outcome)).toEqual([READY, FAILED, FAILED]);
    expect([branches.source, branches.width, branches.carry_on_to_report]).toEqual(["MENU", 5, true]);
    expect(AnswerBranchesSchema.parse(branches)).toEqual(branches);
  });

  it("while the debate runs, fills in a path the moment its outcome is stored; the others are still being looked into", () => {
    const branches = answerBranchesOf({ set: SET, roots: ROOTS, outcomes: outcomesOf([["b1", READY]]), gap: null, phase: "RUN" });
    expect(branches.paths.map((path) => path.state)).toEqual(["ARGUED", "LOOKING", "LOOKING"]);
    expect(branches.paths.map((path) => path.outcome)).toEqual([READY, null, null]);
    expect(AnswerBranchesSchema.safeParse(branches).success).toBe(true);
  });

  it("lists as '+ N more' the menu paths none of whose viewpoints was chosen, and none without a menu", () => {
    const branches = answerBranchesOf({ set: SET, roots: ROOTS, outcomes: ANSWERED, gap: null, phase: "ANSWER" });
    expect(branches.more.map((item) => [item.more_id, item.is_new])).toEqual([["more-kp02", false], ["more-kp04", true]]);
    expect(branches.more[0]).toEqual({ more_id: "more-kp02", title: "Menu path 2", question: "What does menu path 2 ask?", is_new: false });
    expect(answerBranchesOf({ set: { ...SET, menu: null }, roots: ROOTS, outcomes: ANSWERED, gap: null, phase: "ANSWER" }).more).toEqual([]);
  });

  it("lists as 'also raised' the gap round's first 40 points that no path took", () => {
    const points: PathGapRound["points"] = Array.from({ length: 45 }, (_, index) => ({ text: `Loose ${index}.`, path_id: null }));
    points.splice(3, 0, { text: "A point for path 2.", path_id: "b2" });
    const branches = answerBranchesOf({ set: SET, roots: ROOTS, outcomes: ANSWERED, gap: { points }, phase: "ANSWER" });
    expect(branches.also_raised).toEqual(Array.from({ length: 40 }, (_, index) => `Loose ${index}.`));
    expect(answerBranchesOf({ set: SET, roots: ROOTS, outcomes: ANSWERED, gap: null, phase: "ANSWER" }).also_raised).toEqual([]);
  });

  it("sets the main trust word from the paths' words, and none when no path has one", () => {
    const words = outcomesOf([["b1", READY], ["b2", RESERVED], ["b3", FAILED]]);
    expect(answerBranchesOf({ set: SET, roots: ROOTS, outcomes: words, gap: null, phase: "ANSWER" }).main_trust).toBe("STILL_ARGUED");
    expect(answerBranchesOf({ set: SET, roots: ROOTS, outcomes: outcomesOf([["b1", FAILED], ["b2", FAILED], ["b3", FAILED]]), gap: null,
      phase: "ANSWER" }).main_trust).toBeNull();
  });

  it("shows each viewpoint as its title, its question and whether it is the person's own words", () => {
    const branches = answerBranchesOf({ set: SET, roots: ROOTS, outcomes: ANSWERED, gap: null, phase: "ANSWER" });
    expect(branches.paths[1]!.viewpoints).toEqual([{ title: "Menu path 3", question: "What does menu path 3 ask?", own: false },
      { title: "A late idea", question: "Where does the waste go?", own: false }]);
    expect(branches.paths[2]!.viewpoints).toEqual([{ title: null, question: "What happens to the jobs in Cernavodă?", own: true }]);
    expect(branches.paths.flatMap((path) => path.viewpoints.map((viewpoint) => Object.keys(viewpoint))))
      .toEqual(Array(4).fill(["title", "question", "own"]));
  });
});

/** Ports that record every read; `ids` null is a debate without chosen paths. */
function portsOf(ids: readonly PathId[] | null, extra: Partial<Readonly<{ roots: readonly PathRootInForce[]; outcomes: ReadonlyMap<PathId, PathOutcome> }>> = {}) {
  const calls: string[] = [];
  const ports: BranchReadPorts = {
    readStartPathIds: async (runId) => { calls.push(`ids ${runId}`); return ids; },
    readStartPaths: async (runId) => { calls.push(`paths ${runId}`); return SET; },
    readPathRoots: async (runId) => { calls.push(`roots ${runId}`); return extra.roots ?? []; },
    readPathOutcomes: async (runId) => { calls.push(`outcomes ${runId}`); return extra.outcomes ?? new Map(); },
    readPathGapRound: async (runId) => { calls.push(`gap ${runId}`); return { roundCount: 1, round: { points: [{ text: "Loose 0.", path_id: null }] } }; }
  };
  return { ports, calls };
}

describe("reading a debate's paths", () => {
  it("reads the path ids first: a debate without chosen paths has none, and none of its content is opened", async () => {
    const { ports, calls } = portsOf(null);
    expect(await readAnswerBranches(ports, RUN_ID, "RUN")).toBeNull();
    expect(calls).toEqual([`ids ${RUN_ID}`]);
  });

  it("reads the stored paths, roots in force, outcomes and gap round, as the pure function builds them", async () => {
    const roots: readonly PathRootInForce[] = [{ pathId: "b1", rootIndex: 0, rootNodeId: "n-1", maker: "maker-a", stale: false },
      { pathId: "b2", rootIndex: 1, rootNodeId: "n-2", maker: "maker-b", stale: false }];
    const outcomes = new Map<PathId, PathOutcome>([["b1", READY]]);
    const { ports, calls } = portsOf(["b1", "b2", "b3"], { roots, outcomes });
    const branches = await readAnswerBranches(ports, RUN_ID, "RUN");
    expect(branches).toEqual(answerBranchesOf({ set: SET, roots, outcomes, gap: { points: [{ text: "Loose 0.", path_id: null }] }, phase: "RUN" }));
    expect(branches?.paths.map((path) => path.state)).toEqual(["ARGUED", "LOOKING", "LOOKING"]);
    expect(calls.slice(0, 2)).toEqual([`ids ${RUN_ID}`, `paths ${RUN_ID}`]);
    expect([...calls].sort()).toEqual([`gap ${RUN_ID}`, `ids ${RUN_ID}`, `outcomes ${RUN_ID}`, `paths ${RUN_ID}`, `roots ${RUN_ID}`]);
  });

  it("names no root a reclaim set aside: the answer never points at a node it does not serve", async () => {
    const roots: readonly PathRootInForce[] = [{ pathId: "b1", rootIndex: 0, rootNodeId: "n-1", maker: "maker-a", stale: true }];
    const { ports } = portsOf(["b1", "b2", "b3"], { roots, outcomes: new Map<PathId, PathOutcome>([["b1", READY]]) });
    expect((await readAnswerBranches(ports, RUN_ID, "RUN"))?.paths[0]).toMatchObject({ path_id: "b1", state: "ARGUED", root_node_id: null });
  });

  it("on Postgres, asks 0158's id reader first and opens nothing when the debate keeps no paths", async () => {
    const sql: string[] = [];
    const pool = { query: async (text: string) => { sql.push(text); return { rows: [{ ids: null }] }; } } as unknown as Pool;
    expect(await readAnswerBranches(postgresBranchReadPorts(pool), RUN_ID, "ANSWER")).toBeNull();
    expect(sql).toEqual(["SELECT core.read_start_path_ids($1) AS ids"]);
  });
});

describe("a path debate's web paths", () => {
  it("are named by their path ids: the path id is the position everywhere on a path debate", () => {
    const roots = webPathRootsOfBranches(["b1", "b2"]);
    expect([...roots]).toEqual([["b1", "b1"], ["b2", "b2"]]);
    const served = { web: { paths: [{ position_ref: "b2" }, { position_ref: "b3" }] }, sources: new Map() } as unknown as Parameters<typeof webPathsAtRoots>[0];
    expect(webPathsAtRoots(served, roots)?.web.paths.map((path) => path.position_ref)).toEqual(["b2"]);
  });
});
