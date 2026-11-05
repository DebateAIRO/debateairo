// tests/integration/v2-paths-run.test.ts — part I (V4 start step, Task 53; spec 2026-11-03 §4.2-§4.3, items wait-d1, chat-first-round,
// journey-f1, read-d3). A path debate end to end: the REAL runner composed as main.ts composes it on the preview, scripted gates,
// a migrated embedded PostgreSQL, one encrypted owner (tests/support/paths-run-harness.ts). Each chosen path is argued as its own
// branch (root i argues b<i+1>), with no map, no cross-reply and no comparing judge; its web step and gap round run before root 0;
// its progress marks are written as it moves on, best effort. Integration suites are skipped by the CI gate: run this file by
// hand, alone. Every name, question and page is made up.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresStartPathsStore, migrate, type PathProgressStore, type Pool } from "@debateai/db";
import { mapPromptContractHash } from "@debateai/map";
import {
  engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, resolveLengthGuidance
} from "@debateai/register";
import { ROLE_ROTATION_RULE, type RotatedRoles } from "@debateai/scorecard";
import {
  DEEPSEEK, HAIKU, MIMO, OWNER_CALL_CONCURRENCY, PANEL_REFS, QWEN, TARGETS, previewDebateHarness, rotationPick
} from "../support/preview-debate-harness.js";
import {
  FINAL_WRITER_ROOM, PATHS_SETTINGS, admittedPathsRun, materialOf, pathTitleOf, refusedPathsRun, runPathsDebate, storedPathsOf
} from "../support/paths-run-harness.js";
import { scriptedShapeAnswers, shapeForTest } from "../support/debate-shape-harness.js";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import type { GateOverride, GateRecord, GateRequest } from "../support/preview-gate-stubs.js";

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, database: () => database, stubClosers });
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); vi.restoreAllMocks(); });
afterAll(async () => {
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
  await database?.stop();
});

const q = (pool: Pool, sql: string, id: string) => pool.query(sql, [id]).then((result) => result.rows);
const pathRootRequests = (requests: readonly GateRecord[]) => requests.filter((request) => request.kind === "JUDGE"
  && materialOf(request).contractId.startsWith("judge.path-root."));
const fieldOf = (request: GateRecord, name: string): string | undefined =>
  materialOf(request).fields.find((field) => field.name === name)?.content;
/** Who wrote each node of the run: the author maker its reduced judgement records. */
const authorMakers = async (runId: string): Promise<Map<string, string>> => new Map((await q(database.pool,
  `SELECT DISTINCT node_id::text AS id, disagreement->'panel'->>'authorMaker' AS maker FROM ledger.reduced_judgement WHERE run_id=$1`, runId))
  .map((row) => [String(row.id), String(row.maker)]));
const steps = (runId: string) => q(database.pool,
  `SELECT path_id, step FROM core.path_step WHERE run_id=$1 ORDER BY recorded_at, path_id, step`, runId);
const marks = (runId: string) => q(database.pool,
  `SELECT path_id, node_id::text AS node_id, mark FROM core.path_point_mark WHERE run_id=$1 ORDER BY recorded_at, mark`, runId);
const own = (): StoryEncryptedOwner => owner!;
/**
 * Review of Task 53: a rotation pin whose storyteller is Haiku (DeepSeek opens and checks, Qwen writes the answer). Without a pin the
 * admission picks the roles from the question, so a "storyteller on Haiku" case would hold in some runs only.
 */
const HAIKU_TELLS: RotatedRoles = Object.freeze({
  rule: ROLE_ROTATION_RULE,
  answerWriter: rotationPick("preview:qwen-3-8-flash"), answerChecker: rotationPick("preview:deepseek-v4-1-flash"),
  storyteller: rotationPick("preview:claude-haiku-5-5"), storyChecker: rotationPick("preview:deepseek-v4-1-flash"),
  opener: rotationPick("preview:deepseek-v4-1-flash"), eligibleModelIds: Object.freeze([DEEPSEEK, MIMO, QWEN, HAIKU])
});

describe("a path debate argues one branch per stored path (part I)", () => {
  it("three stored paths on Plus: roots b1..b3, no map but the gap round, no comparing judge, no leg by its parent's maker, the web read per path, and its progress", async () => {
    // The storyteller is pinned to Haiku (review of Task 53: unpinned, the rotation chose it in some runs only).
    const run = await runPathsDebate(harness, database.pool, { label: "paths-three", owner: own(), web: { webPlan: "PLUS", planSearch: true },
      finalWriterTier: true, pin: HAIKU_TELLS });
    const runId = run.debate.runId;
    const roots = await q(database.pool, `SELECT path_id, root_index, maker FROM core.path_root WHERE run_id=$1 ORDER BY root_index`, runId);
    expect(roots.map((row) => [row.path_id, row.root_index])).toEqual([["b1", 0], ["b2", 1], ["b3", 2]]);
    const okKeys = run.calls.filter((call) => call.outcome === "OK").map((call) => call.call_site_key);
    // No map: its paths were chosen at Start. The gap round is the only map-shaped call.
    expect(okKeys.filter((key) => key.startsWith("MAP:") && !key.startsWith("MAP:gap-paths:"))).toEqual([]);
    expect(okKeys.some((key) => key.startsWith("MAP:gap-paths:"))).toBe(true);
    expect(okKeys.filter((key) => key.startsWith("JUDGE:cross-root:"))).toEqual([]);
    expect(run.gates.requests.filter((request) => request.kind === "VERDICT_JUDGE")).toEqual([]);
    // Each root writes its own path: its title and question, the run's question line.
    const rootRequests = pathRootRequests(run.gates.requests.filter((request) => request.answer === "OK"));
    expect(rootRequests.map((request) => fieldOf(request, "path_title")).sort()).toEqual(["T1", "T2", "T3"]);
    // A leg is never written by the maker it answers.
    const makers = await authorMakers(runId);
    const children = await q(database.pool, `SELECT node_id::text AS id, parent_node_id::text AS parent FROM core.node
      WHERE run_id=$1 AND parent_node_id IS NOT NULL`, runId);
    expect(children.length).toBeGreaterThan(0);
    expect(children.filter((child) => makers.get(child.id) === makers.get(child.parent)).map((child) => child.id)).toEqual([]);
    // The gap round is kept (Plus), and the web step planned each path's search, b1..b3, each root reading every path's pack.
    expect(await q(database.pool, `SELECT run_id FROM core.path_gap_round WHERE run_id=$1`, runId)).toHaveLength(1);
    const planned = await q(database.pool, `SELECT path_ref, status FROM identity.web_plan_path WHERE run_id=$1 ORDER BY path_ref`, runId);
    expect(planned.map((row) => [row.path_ref, row.status])).toEqual([["b1", "PLANNED"], ["b2", "PLANNED"], ["b3", "PLANNED"]]);
    const searched = await q(database.pool, `SELECT DISTINCT path_ref FROM identity.web_search WHERE run_id=$1 ORDER BY path_ref`, runId);
    expect(searched.map((row) => row.path_ref)).toEqual(["b1", "b2", "b3"]);
    for (const request of rootRequests) {
      const sources = fieldOf(request, "sources") ?? "";
      expect([1, 2, 3].filter((pathNo) => sources.includes(pathTitleOf(pathNo))).map(pathTitleOf)).toEqual(["T1", "T2", "T3"]);
    }
    // Item wait-d1: each path FINDING_SOURCES, then ARGUING, then CHECKING, in the order they were recorded.
    const rows = await steps(runId);
    for (const pathId of ["b1", "b2", "b3"]) {
      expect(rows.filter((row) => row.path_id === pathId).map((row) => row.step)).toEqual(["FINDING_SOURCES", "ARGUING", "CHECKING"]);
    }
    // Every CHECKING row is recorded after that path's last JUDGE request was sent (the run's ledger order).
    const checking = await q(database.pool, `SELECT path_id, recorded_at FROM core.path_step WHERE run_id=$1 AND step='CHECKING'`, runId);
    const judged = await q(database.pool, `SELECT call_site_key, started_at FROM ledger.ledger_entry WHERE run_id=$1
      AND action_kind='MODEL_CALL' AND call_site_key LIKE 'JUDGE:%'`, runId);
    expect(checking).toHaveLength(3);
    for (const row of checking) {
      const rootIndex = Number(String(row.path_id).slice(1)) - 1;
      const own = judged.filter((entry) => new RegExp(`^JUDGE:(defender|critic):root${String(rootIndex)}:`, "u").test(String(entry.call_site_key)));
      expect(own.length).toBeGreaterThan(0);
      const last = Math.max(...own.map((entry) => new Date(entry.started_at as string).getTime()));
      expect(new Date(row.recorded_at as string).getTime()).toBeGreaterThanOrEqual(last);
    }
    // Every point under a path's root: PUT_FORWARD, CHECKING, CHECKED, in that order.
    const pointMarks = await marks(runId);
    expect(pointMarks.length).toBeGreaterThan(0);
    const byNode = new Map<string, string[]>();
    for (const row of pointMarks) byNode.set(String(row.node_id), [...(byNode.get(String(row.node_id)) ?? []), String(row.mark)]);
    for (const [, seen] of byNode) expect(seen).toEqual(["PUT_FORWARD", "CHECKING", "CHECKED"]);
    // Review Focus 2: a v2 storyteller on Haiku asks for 81,920 output tokens.
    const story = run.gates.requests.filter((request) => request.provider === "anthropic"
      && (request.kind === "STORYTELLER" || request.kind === "STORY_PATHS"));
    expect(story.length).toBeGreaterThan(0);
    for (const request of story) expect(request.body.max_tokens).toBe(81_920);
  }, 900_000);

  it("a Free path debate makes no web call, writes no FINDING_SOURCES row and has no gap round", async () => {
    const run = await runPathsDebate(harness, database.pool, { label: "paths-free", owner: own(), plan: "free", web: { webPlan: "FREE", planSearch: true } });
    const runId = run.debate.runId;
    expect(run.calls.filter((call) => call.call_site_key.startsWith("WEB:"))).toEqual([]);
    expect(run.queries).toEqual([]);
    const planned = await q(database.pool, `SELECT path_ref, status FROM identity.web_plan_path WHERE run_id=$1 ORDER BY path_ref`, runId);
    expect(planned.map((row) => [row.path_ref, row.status])).toEqual([["b1", "NOT_ON_PLAN"], ["b2", "NOT_ON_PLAN"], ["b3", "NOT_ON_PLAN"]]);
    expect((await steps(runId)).filter((row) => row.step === "FINDING_SOURCES")).toEqual([]);
    expect(await q(database.pool, `SELECT run_id FROM core.path_gap_round WHERE run_id=$1`, runId)).toEqual([]);
    expect(run.calls.some((call) => call.call_site_key.startsWith("MAP:"))).toBe(false);
  }, 900_000);

  it("a path whose planner plans no search has no FINDING_SOURCES row", async () => {
    const run = await runPathsDebate(harness, database.pool, { label: "paths-no-search", owner: own(), web: { webPlan: "PLUS" } });
    const planned = await q(database.pool, `SELECT path_ref, status FROM identity.web_plan_path WHERE run_id=$1 ORDER BY path_ref`, run.debate.runId);
    expect(planned.map((row) => row.status)).toEqual(["NO_SEARCH_PLANNED", "NO_SEARCH_PLANNED", "NO_SEARCH_PLANNED"]);
    const rows = await steps(run.debate.runId);
    expect(rows.filter((row) => row.step === "FINDING_SOURCES")).toEqual([]);
    for (const pathId of ["b1", "b2", "b3"]) expect(rows.filter((row) => row.path_id === pathId).map((row) => row.step)).toEqual(["ARGUING", "CHECKING"]);
  }, 900_000);

  it("one path: one root, b1, cross-reviewed by its makers", async () => {
    const run = await runPathsDebate(harness, database.pool, { label: "paths-one", owner: own(), paths: 1 });
    const roots = await q(database.pool, `SELECT path_id FROM core.path_root WHERE run_id=$1`, run.debate.runId);
    expect(roots.map((row) => row.path_id)).toEqual(["b1"]);
    expect(pathRootRequests(run.gates.requests.filter((request) => request.answer === "OK"))).toHaveLength(1);
  }, 900_000);

  it("seven paths on four makers: roots by A, B, C, D, A, B, C, and no leg by its parent's maker", async () => {
    const run = await runPathsDebate(harness, database.pool, { label: "paths-seven", owner: own(), paths: 7, plan: "max" });
    const roots = await q(database.pool, `SELECT path_id, maker FROM core.path_root WHERE run_id=$1 ORDER BY root_index`, run.debate.runId);
    expect(roots.map((row) => row.path_id)).toEqual(["b1", "b2", "b3", "b4", "b5", "b6", "b7"]);
    const first = roots.slice(0, 4).map((row) => row.maker);
    expect(new Set(first).size).toBe(4);
    expect(roots.slice(4).map((row) => row.maker)).toEqual(first.slice(0, 3));
    const makers = await authorMakers(run.debate.runId);
    const children = await q(database.pool, `SELECT node_id::text AS id, parent_node_id::text AS parent FROM core.node
      WHERE run_id=$1 AND parent_node_id IS NOT NULL`, run.debate.runId);
    expect(children.filter((child) => makers.get(child.id) === makers.get(child.parent)).map((child) => child.id)).toEqual([]);
  }, 900_000);

  it("a run that builds its own list: the start steps before the first root, the set sealed by the AIs; a set sealed before makes none", async () => {
    const run = await runPathsDebate(harness, database.pool, { label: "paths-run-built", owner: own(), source: "RUN_BUILT" });
    const keys = run.calls.filter((call) => call.outcome === "OK").map((call) => call.call_site_key);
    const firstJudge = keys.findIndex((key) => key.startsWith("JUDGE:"));
    const before = keys.slice(0, firstJudge);
    expect(before).toEqual(expect.arrayContaining(["START:angles", "START:list:1", "START:list:4", "START:merge"]));
    const set = await new PostgresStartPathsStore(database.pool).readStartPaths(run.debate.runId);
    expect(set?.source).toBe("RUN_BUILT");
    expect(set?.chosenBy).toBe("AIS");
    // No reading level was asked: neither the start steps nor the roots carry a reader field.
    for (const request of run.gates.requests.filter((entry) => entry.answer === "OK" && (entry.kind === "START_LIST" || entry.kind === "START_MERGE"
      || (entry.kind === "JUDGE" && materialOf(entry).contractId.startsWith("judge.path-root."))))) {
      expect(fieldOf(request, "reader")).toBeUndefined();
    }
    // A copy that finds the set already sealed (a re-claim before the roots) asks no start step again.
    const { debate } = await admittedPathsRun(harness, database.pool, { label: "paths-run-built-again", owner: own(), source: "RUN_BUILT" });
    expect(await new PostgresStartPathsStore(database.pool).recordStartPaths({ ...storedPathsOf(debate.runId, 3), source: "RUN_BUILT",
      chosenBy: "AIS" })).toBe("RECORDED");
    const again = await runPathsDebate(harness, database.pool, { label: "paths-run-built-again", owner: own(), source: "RUN_BUILT", debate });
    expect(again.calls.filter((call) => call.call_site_key.startsWith("START:"))).toEqual([]);
  }, 900_000);

  it("the run's step-2 lines: the place said once in every WEB:plan: question and in every judge's question line", async () => {
    // A plain label (the fixture composition map rates only the `unknown` claim type), then the place the question says itself.
    const question = "preview-paths-purpose-417 In the north.";
    const run = await runPathsDebate(harness, database.pool, { label: "paths-purpose", owner: own(), question,
      purposeLines: { place: "The north quay", answers: [{ question: "Where?", answer: "The north" }] },
      web: { webPlan: "PLUS", planSearch: true } });
    const planners = run.gates.requests.filter((request) => request.kind === "WEB_DIG_PLAN");
    expect(planners).toHaveLength(3);
    for (const request of planners) expect(fieldOf(request, "question")).toContain("The north quay");
    const rootRequests = pathRootRequests(run.gates.requests);
    expect(rootRequests.length).toBeGreaterThanOrEqual(3);
    for (const request of rootRequests) {
      const line = fieldOf(request, "question_line") ?? "";
      expect(line).toContain("The north quay");
      expect(line.split("The north quay")).toHaveLength(2);
      // Read-d3: the answers count as said; the question's own "In the north." is the place, once.
      expect(line).not.toContain("Where? The north.");
      expect(line.split("In the north.")).toHaveLength(2);
    }
  }, 900_000);

  it("a progress store that refuses every write: the run completes, one content-free line per refusal", async () => {
    const lines: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((line: unknown) => { lines.push(String(line)); });
    let refusals = 0;
    const refusing: PathProgressStore = Object.freeze({
      recordPathStep: async () => { refusals += 1; return "RUN_ERASED" as const; },
      recordPathPointMark: async () => { refusals += 1; return "RUN_ERASED" as const; },
      readPathProgress: async () => { throw new Error("test: never read by the runner"); },
      readCarryOnMark: async () => { throw new Error("test: never read by the runner"); }
    });
    const run = await runPathsDebate(harness, database.pool, { label: "paths-refusing", owner: own(), pathProgress: refusing });
    warn.mockRestore();
    expect(run.result.kind).toBe("COMPLETED");
    const progressLines = lines.filter((line) => line.includes("DEBATEAI_PATH_PROGRESS"));
    expect(refusals).toBeGreaterThan(0);
    expect(progressLines).toHaveLength(refusals);
    for (const line of progressLines) expect(JSON.parse(line)).toEqual({ kind: "DEBATEAI_PATH_PROGRESS", code: "RUN_ERASED" });
    expect(await steps(run.debate.runId)).toEqual([]);
  }, 900_000);
});

/**
 * Review of Task 53 (plan Review Focus 3; the brief's Step 1 cases the build left unwritten): paths outnumber companies, a company
 * sits out or refuses a root. Roots go to another company or the path ends without a root; legs and reviews never come from the
 * maker they answer; the debate still answers. Also depth 2, the refusals before any call, and a v1 storyteller beside a v2 one.
 */
describe("a path debate when companies are busy or refuse, at depth 2, and its refusals (review of Task 53)", () => {
  /** Who wrote each path's root, in root order. */
  const rootMakersOf = async (runId: string): Promise<(readonly [string, string])[]> => (await q(database.pool,
    `SELECT path_id, maker FROM core.path_root WHERE run_id=$1 ORDER BY root_index`, runId)).map((row) => [String(row.path_id), String(row.maker)] as const);
  const makerOfModel = (model: string): string => TARGETS.find((target) => target.model === model)!.maker;
  /** Reviews written by the maker of the node they review: none may be. */
  const sameMakerReviews = (runId: string) => q(database.pool, `SELECT review.node_id FROM ledger.node_review AS review
    JOIN ledger.raw_artifact AS author ON author.raw_artifact_id = review.author_raw_artifact_ref
    JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
    WHERE review.run_id=$1 AND author.maker = reviewer.maker`, runId);
  /** Legs written by the maker of the node they answer: none may be. */
  const sameMakerLegs = async (runId: string): Promise<string[]> => {
    const makers = await authorMakers(runId);
    const children = await q(database.pool, `SELECT node_id::text AS id, parent_node_id::text AS parent FROM core.node
      WHERE run_id=$1 AND parent_node_id IS NOT NULL`, runId);
    expect(children.length).toBeGreaterThan(0);
    return children.filter((child) => makers.get(child.id) === makers.get(child.parent)).map((child) => String(child.id));
  };
  const isPathRoot = (request: GateRequest): boolean => request.kind === "JUDGE" && materialOf(request).contractId.startsWith("judge.path-root.");
  const pathTitleIn = (request: GateRequest): string | undefined => materialOf(request).fields.find((field) => field.name === "path_title")?.content;
  /** The model asked for the first path root (b1's, sent before any other root) is busy from then on: unbilled, its resend too. */
  const busyOnFirstRoot = () => {
    let busy: string | null = null;
    return {
      busy: () => busy,
      before: (request: GateRequest): GateOverride | null => {
        if (request.kind === "PROBE") return null;
        if (busy === null && isPathRoot(request)) busy = request.model;
        return busy !== null && request.model === busy ? { unbilled: true } : null;
      }
    };
  };

  it("a busy company's path roots go to other companies before their first call: a spare first, else one arguing another path", async () => {
    // Three paths on four companies: b1's company is busy; b1 opens with the next seat, and the busy seat's root goes to the spare.
    const three = busyOnFirstRoot();
    const run = await runPathsDebate(harness, database.pool, { label: "paths-busy-spare", owner: own(), resilience: true, before: three.before });
    expect(three.busy()).not.toBeNull();
    const roots = await rootMakersOf(run.debate.runId);
    expect(roots.map(([pathId]) => pathId)).toEqual(["b1", "b2", "b3"]);
    expect(roots.map(([, maker]) => maker)).not.toContain(makerOfModel(three.busy()!));
    expect(new Set(roots.map(([, maker]) => maker)).size).toBe(3);
    expect(await sameMakerLegs(run.debate.runId)).toEqual([]);
    expect(await sameMakerReviews(run.debate.runId)).toEqual([]);
    // Five paths on four companies (no spare): the busy company's roots are shared with companies already arguing another path.
    const five = busyOnFirstRoot();
    const more = await runPathsDebate(harness, database.pool, { label: "paths-busy-share", owner: own(), paths: 5, plan: "max", resilience: true,
      before: five.before });
    const fiveRoots = await rootMakersOf(more.debate.runId);
    expect(fiveRoots.map(([pathId]) => pathId)).toEqual(["b1", "b2", "b3", "b4", "b5"]);
    expect(fiveRoots.map(([, maker]) => maker)).not.toContain(makerOfModel(five.busy()!));
    expect(await sameMakerLegs(more.debate.runId)).toEqual([]);
    expect(await sameMakerReviews(more.debate.runId)).toEqual([]);
  }, 900_000);

  it("a path root refused after every repair goes to another company; refused by every company, the path ends without a root and the debate answers", async () => {
    // b2's first company answers its root with a reply that fails the schema, every time (original, repair, re-ask).
    let refuser: string | null = null;
    const once = await runPathsDebate(harness, database.pool, { label: "paths-refused-once", owner: own(), before: (request) => {
      if (!isPathRoot(request) || pathTitleIn(request) !== "T2") return null;
      refuser ??= request.model;
      return request.model === refuser ? { content: "{}" } : null;
    } });
    expect(refuser).not.toBeNull();
    const onceRoots = await rootMakersOf(once.debate.runId);
    expect(onceRoots.map(([pathId]) => pathId)).toEqual(["b1", "b2", "b3"]);
    expect(onceRoots.find(([pathId]) => pathId === "b2")![1]).not.toBe(makerOfModel(refuser!));
    expect(await sameMakerLegs(once.debate.runId)).toEqual([]);
    // Every company refuses b2's root: b2 has no root, b1 and b3 are argued, and the run completes. Three companies on one gate,
    // so every root seat is a path's and each refusal's repairs are scripted refusals too (no spare to take it).
    const every = await runPathsDebate(harness, database.pool, { label: "paths-refused-all", owner: own(), makers: 3, before: (request) =>
      isPathRoot(request) && pathTitleIn(request) === "T2" ? { content: "{}" } : null });
    expect(every.result.kind).toBe("COMPLETED");
    expect((await rootMakersOf(every.debate.runId)).map(([pathId]) => pathId)).toEqual(["b1", "b3"]);
    expect((await steps(every.debate.runId)).filter((row) => row.path_id === "b2").map((row) => row.step)).not.toContain("CHECKING");
  }, 900_000);

  it("depth 2: every path keeps a reply, and each path's CHECKING comes after its own last leg", async () => {
    const run = await runPathsDebate(harness, database.pool, { label: "paths-depth-two", owner: own(), depth: 2 });
    const ok = run.calls.filter((call) => call.outcome === "OK").map((call) => call.call_site_key);
    for (const rootIndex of [0, 1, 2]) {
      expect(ok.filter((key) => new RegExp(`^JUDGE:(defender|critic):root${String(rootIndex)}:r2:`, "u").test(key)).length).toBeGreaterThan(0);
    }
    const checking = await q(database.pool, `SELECT path_id, recorded_at FROM core.path_step WHERE run_id=$1 AND step='CHECKING'`, run.debate.runId);
    expect(checking.map((row) => row.path_id).sort()).toEqual(["b1", "b2", "b3"]);
    const judged = await q(database.pool, `SELECT call_site_key, started_at FROM ledger.ledger_entry WHERE run_id=$1
      AND action_kind='MODEL_CALL' AND call_site_key LIKE 'JUDGE:%'`, run.debate.runId);
    for (const row of checking) {
      const rootIndex = Number(String(row.path_id).slice(1)) - 1;
      const own = judged.filter((entry) => new RegExp(`^JUDGE:(defender|critic):root${String(rootIndex)}:`, "u").test(String(entry.call_site_key)));
      expect(Math.max(...own.map((entry) => new Date(entry.started_at as string).getTime()))).toBeLessThanOrEqual(new Date(row.recorded_at as string).getTime());
    }
    expect(await sameMakerLegs(run.debate.runId)).toEqual([]);
  }, 900_000);

  it("seven paths on four companies: no review by the maker of the node it reviews", async () => {
    const run = await runPathsDebate(harness, database.pool, { label: "paths-seven-reviews", owner: own(), paths: 7, plan: "max" });
    expect(await sameMakerReviews(run.debate.runId)).toEqual([]);
  }, 900_000);

  it("a menu's set Start never sealed, or a set over the receipt: refused for good before any call", async () => {
    const missing = await refusedPathsRun(harness, database.pool, { label: "paths-set-missing", owner: own(), sealSet: false });
    expect(missing).toMatchObject({ code: "PATHS_SET_MISSING", terminalReason: "PATHS_SET_MISSING" });
    expect(missing.calls.filter((call) => /^(START|MAP|WEB|JUDGE|PANEL):/u.test(call.call_site_key) || call.call_site_key === "JUDGE")).toEqual([]);
    // Priced for three paths, sealed with four.
    const { debate } = await admittedPathsRun(harness, database.pool, { label: "paths-over-receipt", owner: own(), sealSet: false });
    expect(await new PostgresStartPathsStore(database.pool).recordStartPaths(storedPathsOf(debate.runId, 4))).toBe("RECORDED");
    const over = await refusedPathsRun(harness, database.pool, { label: "paths-over-receipt", owner: own(), debate });
    expect(over).toMatchObject({ code: "PATHS_OVER_RECEIPT", terminalReason: "PATHS_OVER_RECEIPT" });
    expect(over.calls.filter((call) => /^(START|MAP|WEB|JUDGE|PANEL):/u.test(call.call_site_key) || call.call_site_key === "JUDGE")).toEqual([]);
  }, 900_000);

  it("Review Focus 2: a v1 debate's storyteller on Haiku asks 128,000 on the same runner composition (only a v2 run's terms are told)", async () => {
    const settings = PATHS_SETTINGS;
    const length = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "pro", answerLength: settings.answerLength });
    const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers: PANEL_REFS.length, mapOpening: true });
    const debate = await harness.admittedRun("paths-v1-storyteller", { panelRefs: PANEL_REFS, pin: HAIKU_TELLS, depth: 1,
      shape: shapeForTest({ plan: "pro", makers: PANEL_REFS.length, settings }), settings, length, engine });
    const gates = await harness.startGates({}, undefined, scriptedShapeAnswers(debate.question));
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY,
      debateShape: { mapContractHash: mapPromptContractHash() }, engine: { engineContractHash: engineContractHash() },
      gateRemaining: { anthropic: async () => FINAL_WRITER_ROOM } });
    await harness.completedRun(composed, debate, gates);
    const story = gates.requests.filter((request) => request.provider === "anthropic" && request.kind === "STORYTELLER");
    expect(story.length).toBeGreaterThan(0);
    for (const request of story) expect(request.body.max_tokens).toBe(128_000);
  }, 900_000);
});
