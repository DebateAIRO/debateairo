/**
 * V4 start step, Task 57 (spec 2026-11-03 §2 item 7; items wait-d1, journey-f1, wait-f16): each path's progress as the run read serves
 * it, built by one pure function from what the runner wrote down (0159's steps and marks) and the paths' outcomes (0158). A path still at
 * work shows its newest step and at most 6 quiet dots, one per point put forward, each being checked or checked; nothing unchecked is
 * ever readable. Once its outcome is stored it shows its findings instead: the points found, each in its own words and with its trust
 * word. Only those points' words are opened. An R22 debate has no progress at all; a path debate whose AIs are still choosing its paths
 * has none to show yet. Made-up words only.
 */
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { RunPathProgressSchema, type PathId, type PathOutcome, type TrustWord } from "@debateai/contract";
import type { PathPointMark, PathPointMarkRow, PathProgressRead, PathStep } from "@debateai/db";
import {
  DEBATE_SHAPE_V2_FORMULA_VERSION, debateShapePolicyStartValues, debateShapeReceiptV2, debateShapeSiteCountsV2, resolveDebateShapeV2
} from "@debateai/register";
import { postgresPathProgressReadPorts, readRunPathProgress, runPathProgressOf, type PathProgressReadPorts } from "@debateai/serve";
import { outcomeFixture } from "../support/branchesFixture.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const IDS: readonly PathId[] = ["b1", "b2", "b3"];
const READY = outcomeFixture("READY");
const FAILED = outcomeFixture("FAILED");

let clock = 0;
const mark = (pathId: PathId, nodeId: string, kind: PathPointMark, trust: TrustWord | null = null): PathPointMarkRow =>
  Object.freeze({ pathId, nodeId, mark: kind, trust, at: new Date(Date.UTC(2026, 10, 4, 12, 0, clock++)) });
const readOf = (steps: readonly (readonly [PathId, PathStep])[], marks: readonly PathPointMarkRow[]): PathProgressRead =>
  Object.freeze({ steps: new Map(steps), marks: Object.freeze([...marks]) });
const NO_OUTCOMES: ReadonlyMap<string, PathOutcome> = new Map();
const CLAIMS: ReadonlyMap<string, string> = new Map([["n-31", "Storage adds about a third to the cost."],
  ["n-32", "Grid upgrades come on top of the plant."]]);
const progressOf = (input: Partial<Parameters<typeof runPathProgressOf>[0]>) =>
  runPathProgressOf({ pathIds: IDS, outcomes: NO_OUTCOMES, read: readOf([], []), claims: new Map(), ...input });
const everyParses = (progress: readonly unknown[]) => {
  for (const entry of progress) expect(RunPathProgressSchema.safeParse(entry).success, JSON.stringify(entry)).toBe(true);
};

describe("a path still at work", () => {
  it("shows at most 6 dots, one per point put forward, in the order they were put forward", () => {
    const marks = Array.from({ length: 8 }, (_, index) => mark("b1", `n-1${index}`, "PUT_FORWARD"));
    const progress = progressOf({ read: readOf([["b1", "ARGUING"]], marks) });
    expect(progress[0]).toEqual({ path_id: "b1", step: "ARGUING", points: Array(6).fill("PUT_FORWARD"), findings: [] });
    everyParses(progress);
  });

  it("closes a dot's ring while its point is being checked and inks it once checked", () => {
    const marks = [mark("b2", "n-21", "PUT_FORWARD"), mark("b2", "n-22", "PUT_FORWARD"), mark("b2", "n-23", "PUT_FORWARD"),
      mark("b2", "n-22", "CHECKING"), mark("b2", "n-23", "CHECKING"), mark("b2", "n-23", "CHECKED")];
    const progress = progressOf({ read: readOf([["b2", "CHECKING"]], marks) });
    expect(progress[1]).toEqual({ path_id: "b2", step: "CHECKING", points: ["PUT_FORWARD", "BEING_CHECKED", "CHECKED"], findings: [] });
    expect(progress[0]).toEqual({ path_id: "b1", step: null, points: [], findings: [] });
    everyParses(progress);
  });

  it("shows its newest step, and none before it has one", async () => {
    const progress = progressOf({ read: readOf([["b1", "ARGUING"]], []) });
    expect(progress.map((entry) => entry.step)).toEqual(["ARGUING", null, null]);
    // On Postgres the store keeps the newest of the steps 0159 lists oldest first.
    const { pool } = poolOf({ steps: [{ path_id: "b1", step: "FINDING_SOURCES", recorded_at: "2026-11-04T12:00:00Z" },
      { path_id: "b1", step: "ARGUING", recorded_at: "2026-11-04T12:00:05Z" }] });
    const served = await readRunPathProgress(postgresPathProgressReadPorts(pool), RUN_ID);
    expect(served?.map((entry) => entry.step)).toEqual(["ARGUING", null, null]);
  });
});

describe("a path whose outcome is stored", () => {
  const found = [mark("b3", "n-30", "PUT_FORWARD"), mark("b3", "n-31", "FOUND", "SURE_FOR_CASE"), mark("b3", "n-32", "FOUND", "STILL_ARGUED")];

  it("shows no step and no dots, but its findings in the order they were found, each with its trust word", () => {
    const progress = progressOf({ outcomes: new Map([["b3", READY]]), read: readOf([["b3", "CHECKING"]], found), claims: CLAIMS });
    expect(progress[2]).toEqual({ path_id: "b3", step: null, points: [], findings: [
      { node_ref: "n-31", text: "Storage adds about a third to the cost.", trust: "SURE_FOR_CASE" },
      { node_ref: "n-32", text: "Grid upgrades come on top of the plant.", trust: "STILL_ARGUED" }] });
    everyParses(progress);
  });

  it("leaves out a point whose words cannot be read", () => {
    const progress = progressOf({ outcomes: new Map([["b3", READY]]), read: readOf([], found), claims: new Map([["n-32", "Grid upgrades come on top of the plant."]]) });
    expect(progress[2]!.findings.map((finding) => finding.node_ref)).toEqual(["n-32"]);
  });

  it("shows nothing found when it failed", () => {
    const progress = progressOf({ outcomes: new Map([["b3", FAILED]]), read: readOf([["b3", "CHECKING"]], found), claims: CLAIMS });
    expect(progress[2]).toEqual({ path_id: "b3", step: null, points: [], findings: [] });
    everyParses(progress);
  });

  it("shows its first 40 findings", () => {
    const marks = Array.from({ length: 41 }, (_, index) => mark("b1", `n-f${index}`, "FOUND", "SURE"));
    const claims = new Map(marks.map((entry) => [entry.nodeId, `Point ${entry.nodeId}.`] as const));
    const progress = progressOf({ outcomes: new Map([["b1", READY]]), read: readOf([], marks), claims });
    expect(progress[0]!.findings.map((finding) => finding.node_ref)).toEqual(marks.slice(0, 40).map((entry) => entry.nodeId));
    everyParses(progress);
  });
});

/** Ports that record every read: `pathRun` false is an R22 debate, `ids` null a path debate whose paths are not named yet. */
function portsOf(pathRun: boolean, ids: readonly PathId[] | null, read: PathProgressRead, outcomes: ReadonlyMap<PathId, PathOutcome> = new Map()) {
  const calls: string[] = [];
  const opened: (readonly string[])[] = [];
  const ports: PathProgressReadPorts = {
    isPathRun: async (runId) => { calls.push(`path run ${runId}`); return pathRun; },
    readStartPathIds: async (runId) => { calls.push(`ids ${runId}`); return ids; },
    readPathOutcomes: async (runId) => { calls.push(`outcomes ${runId}`); return outcomes; },
    readPathProgress: async (runId) => { calls.push(`progress ${runId}`); return read; },
    nodeClaimsOf: async (runId, nodeIds) => { calls.push(`claims ${runId}`); opened.push([...nodeIds]); return CLAIMS; }
  };
  return { ports, calls, opened };
}

describe("reading a debate's path progress", () => {
  it("has none for an R22 debate, and reads nothing else", async () => {
    const { ports, calls } = portsOf(false, IDS, readOf([], []));
    expect(await readRunPathProgress(ports, RUN_ID)).toBeNull();
    expect(calls).toEqual([`path run ${RUN_ID}`]);
  });

  it("has none to show while the AIs are still choosing a path debate's paths", async () => {
    const { ports, calls } = portsOf(true, null, readOf([], []));
    expect(await readRunPathProgress(ports, RUN_ID)).toEqual([]);
    expect(calls).toEqual([`path run ${RUN_ID}`, `ids ${RUN_ID}`]);
  });

  it("opens only the words of the points found on the paths that show findings", async () => {
    const read = readOf([["b1", "ARGUING"]], [mark("b1", "n-11", "PUT_FORWARD"), mark("b1", "n-12", "FOUND", "SURE"),
      mark("b2", "n-21", "FOUND", "DIDNT_HOLD"), mark("b3", "n-30", "PUT_FORWARD"), mark("b3", "n-30", "CHECKED"),
      mark("b3", "n-31", "FOUND", "SURE_FOR_CASE"), mark("b3", "n-32", "FOUND", "STILL_ARGUED")]);
    const { ports, opened } = portsOf(true, IDS, read, new Map<PathId, PathOutcome>([["b2", FAILED], ["b3", READY]]));
    const progress = await readRunPathProgress(ports, RUN_ID);
    expect(opened).toEqual([["n-31", "n-32"]]);
    expect(progress).toEqual([
      { path_id: "b1", step: "ARGUING", points: ["PUT_FORWARD"], findings: [] },
      { path_id: "b2", step: null, points: [], findings: [] },
      { path_id: "b3", step: null, points: [], findings: [
        { node_ref: "n-31", text: "Storage adds about a third to the cost.", trust: "SURE_FOR_CASE" },
        { node_ref: "n-32", text: "Grid upgrades come on top of the plant.", trust: "STILL_ARGUED" }] }
    ]);
    everyParses(progress ?? []);
  });

  it("opens no words when no path shows findings", async () => {
    const { ports, calls } = portsOf(true, IDS, readOf([["b1", "FINDING_SOURCES"]], [mark("b1", "n-11", "PUT_FORWARD")]));
    expect((await readRunPathProgress(ports, RUN_ID))?.map((entry) => entry.points)).toEqual([["PUT_FORWARD"], [], []]);
    expect(calls.some((call) => call.startsWith("claims"))).toBe(false);
  });
});

const V2_SHAPE = resolveDebateShapeV2(debateShapePolicyStartValues(), "plus", { depthMode: "adaptive", scrutiny: "standard",
  answerLength: "standard", paths: 3, pathsSource: "MENU" }, 4);
const V2_BASIS = { formula_version: DEBATE_SHAPE_V2_FORMULA_VERSION, shape: debateShapeReceiptV2(V2_SHAPE, debateShapeSiteCountsV2(V2_SHAPE, 1), 0) };

/** A pool that answers the four reads a run with three paths, no outcome and the given steps makes; the receipt is `basis`. */
function poolOf(input: Readonly<{ basis?: Readonly<Record<string, unknown>> | null; ids?: readonly string[] | null;
  steps?: readonly Readonly<{ path_id: string; step: string; recorded_at: string }>[] }>) {
  const sql: string[] = [];
  const pool = { query: async (text: string, values: readonly unknown[]) => {
    sql.push(text);
    expect(values[0]).toBe(RUN_ID);
    if (/FROM core\.run\b/u.test(text)) return { rows: input.basis === null ? [] : [{ envelope_basis: input.basis ?? V2_BASIS }] };
    if (text.includes("core.read_start_path_ids")) return { rows: [{ ids: input.ids === undefined ? IDS : input.ids }] };
    if (text.includes("core.read_path_outcomes")) return { rows: [{ outcomes: null }] };
    if (text.includes("core.read_path_progress")) return { rows: [{ progress: { steps: input.steps ?? [], marks: [] } }] };
    throw new Error(`unexpected query: ${text}`);
  } } as unknown as Pool;
  return { pool, sql };
}

describe("the Postgres ports", () => {
  it("call a debate a path debate when its receipt is shape v2, never when it is v1 or missing", async () => {
    expect(await postgresPathProgressReadPorts(poolOf({}).pool).isPathRun(RUN_ID)).toBe(true);
    expect(await postgresPathProgressReadPorts(poolOf({ basis: { formula_version: "DR-185-shape-v1", shape: V2_BASIS.shape } }).pool).isPathRun(RUN_ID)).toBe(false);
    expect(await postgresPathProgressReadPorts(poolOf({ basis: null }).pool).isPathRun(RUN_ID)).toBe(false);
  });

  it("read an R22 debate's receipt and nothing more", async () => {
    const { pool, sql } = poolOf({ basis: { formula_version: "DR-185-shape-v1" } });
    expect(await readRunPathProgress(postgresPathProgressReadPorts(pool), RUN_ID)).toBeNull();
    expect(sql).toHaveLength(1);
  });

  it("read a path debate without named paths as none to show yet", async () => {
    const { pool, sql } = poolOf({ ids: null });
    expect(await readRunPathProgress(postgresPathProgressReadPorts(pool), RUN_ID)).toEqual([]);
    expect(sql).toHaveLength(2);
  });

  it("open no node when asked for none", async () => {
    const { pool, sql } = poolOf({});
    expect([...await postgresPathProgressReadPorts(pool).nodeClaimsOf(RUN_ID, [])]).toEqual([]);
    expect(sql).toEqual([]);
  });
});
