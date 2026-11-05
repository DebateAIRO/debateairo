// tests/integration/v2-paths-run.test.ts — part I (V4 start step, Task 53; spec 2026-11-03 §4.2-§4.3, items wait-d1, chat-first-round,
// journey-f1, read-d3). A path debate end to end: the REAL runner composed as main.ts composes it on the preview, scripted gates,
// a migrated embedded PostgreSQL, one encrypted owner (tests/support/paths-run-harness.ts). Each chosen path is argued as its own
// branch (root i argues b<i+1>), with no map, no cross-reply and no comparing judge; its web step and gap round run before root 0;
// its progress marks are written as it moves on, best effort. Integration suites are skipped by the CI gate: run this file by
// hand, alone. Every name, question and page is made up.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresPathResultsRepository, PostgresStartPathsStore, migrate, type PathProgressStore, type Pool } from "@debateai/db";
import { mapPromptContractHash } from "@debateai/map";
import {
  engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, resolveLengthGuidance
} from "@debateai/register";
import { selectDifferentMakerReviewer } from "@debateai/runner";
import { ROLE_ROTATION_RULE, type RotatedRoles } from "@debateai/scorecard";
import { LivenessRepository, ServeRepository, verdictDerivationOfPaths } from "@debateai/serve";
// Part II (Task 54): the paths' answers so far, the main answer, the story, and the run's money.
import { WEB_CONTRACT_LIMITS, mainAnswerTrustWordOf, trustOfPoint, type PathOutcome, type PurposeLines } from "@debateai/contract";
import { CostEnvelopeGuard, PostgresModelSpendStore, attemptCeilingForPhase, parseCostEnvelopeBasis } from "@debateai/budget";
import type { ProviderCostEnvelopeSeam } from "@debateai/providers";
import { REPORT_ANSWER_V4_PROMPT_CONTRACT, StoryRepository } from "@debateai/story";
import { createRunInFlight } from "../../apps/runner/src/run-in-flight.js";
import { postgresPurposeLines } from "../../apps/api/src/purpose-lines.js";
import { requestedReviewEdges, reviewArtifact, withRequestDerivedBearings } from "../support/reviewBearings.js";
import {
  DEEPSEEK, FIVE_MAKER_REFS, GLM, HAIKU, MIMO, OWNER_CALL_CONCURRENCY, PANEL_REFS, QWEN, TARGETS, previewDebateHarness, rotationPick,
  type PreviewRunnerMoney
} from "../support/preview-debate-harness.js";
import {
  FINAL_WRITER_ROOM, PATHS_SETTINGS, admittedPathsRun, materialOf, pathTitleOf, pathsShapeOf, refusedPathsRun, runPathsDebate, storedPathsOf
} from "../support/paths-run-harness.js";
import { scriptedShapeAnswers, shapeForTest } from "../support/debate-shape-harness.js";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { wirePacket } from "../support/framed-packet.js";
import { provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { stubChatBody, type GateOverride, type GateRecord, type GateRequest } from "../support/preview-gate-stubs.js";
// Part II, Task 54c: the path story's web quotes and its backup storyteller.
import { WEB_WRITER_SENTENCES } from "@debateai/kernel";
import { STORY_BACKUP_USED } from "@debateai/story";
import { stubJudgement } from "../support/preview-gate-stubs.js";

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
    // Task 54: a point with a trust word then gets its FOUND mark, last.
    for (const [, seen] of byNode) expect(seen.filter((mark) => mark !== "FOUND")).toEqual(["PUT_FORWARD", "CHECKING", "CHECKED"]);
    for (const [, seen] of byNode) if (seen.includes("FOUND")) expect(seen.at(-1)).toBe("FOUND");
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
    // Review of Task 55b (owner F14): Free keeps what code finds on each path. The web part names its paths b<n>, which name no node, so
    // serve reads the points under each path's root in force; every stand-in point rests on reasoning alone, so each path offers some,
    // each hanging under its own path and made of one of that path's own points.
    const answer = await new ServeRepository(database.pool).readAnswerProjection(run.result.answerId, { ownerRef: own().ownerRef, legacyAskerId: null });
    expect(answer?.web?.paths.map((path) => path.position_ref)).toEqual(["b1", "b2", "b3"]);
    const pointsUnder = async (pathId: string): Promise<Set<string>> => new Set((await q(database.pool, `WITH RECURSIVE under AS (
        SELECT root.root_node_id AS node_id FROM core.path_root AS root WHERE root.run_id = $1 AND root.path_id = '${pathId}'
        UNION SELECT edge.source_node_id FROM core.edge AS edge JOIN under ON edge.target_node_id = under.node_id WHERE edge.run_id = $1)
      SELECT under.node_id::text AS node_id FROM under EXCEPT SELECT root.root_node_id::text FROM core.path_root AS root
        WHERE root.run_id = $1 AND root.path_id = '${pathId}'`, runId)).map((row) => String(row.node_id).toLowerCase()));
    for (const path of answer!.web!.paths) {
      const own = await pointsUnder(path.position_ref);
      const claims = new Set(answer!.nodes.filter((node) => own.has(node.node_id.toLowerCase()))
        .map((node) => node.claim.trim().slice(0, WEB_CONTRACT_LIMITS.suggestionTextMaxChars)));
      const found = path.suggestions.filter((suggestion) => suggestion.kind === "CONTRADICTING" || suggestion.kind === "UNDOCUMENTED");
      expect(found.length).toBeGreaterThan(0);
      for (const suggestion of found) {
        expect(suggestion.places).toEqual([`path:${path.position_ref}`]);
        expect(claims.has(suggestion.text)).toBe(true);
      }
    }
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

/**
 * V4 start step, Task 53b (the coordinator's ruling of 5 Nov on the wave-6 review; spec §4.3, the owner's "First round" answer: each
 * path fills in as soon as its own arguing and checks end, and "does not wait for the other paths"). On a path run each path saves in
 * its own order, so a slow path no longer holds back another path's CHECKING; and whichever path ends first, the paths store the same
 * nodes in the same per-path order and the same answer is served. The stand-ins answer every author, grading and review call from
 * what was asked alone (the request's messages, never the vendor body that names its model), so two runs of one question differ only
 * in timing and in what each run's own id draws (its ids, times and reviewer seats: a reviewer is drawn by the run id, and a run id,
 * even one the harness fixes, is held once per database, so the two runs have two).
 */
describe("each path saves in its own order (Task 53b)", () => {
  /** The question both runs ask (a plain label: the fixture composition map rates only the `unknown` claim type). */
  const QUESTION = "preview-paths-save-order-5303";
  /** How long the slow path's calls are held: far longer than a path's own arguing when every call is answered at once. */
  const SLOW_MS = 4_000;
  const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
  const TIMES = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/gu;
  /** What was asked, whoever was asked: the request's messages alone. */
  const askedOnly = (chat: string): string =>
    JSON.stringify({ messages: wirePacket(chat).messages.map((message) => ({ role: message.role, content: message.content })) });
  const rootTitleOf = (request: GateRequest): string | undefined =>
    request.kind === "JUDGE" && materialOf(request).contractId.startsWith("judge.path-root.")
      ? materialOf(request).fields.find((field) => field.name === "path_title")?.content : undefined;
  /**
   * One path debate of QUESTION in which the path titled `slow` is slow: once its root is written, every author call that answers
   * that root (its legs) and the root's own review are held SLOW_MS.
   */
  const runWithSlowPath = async (label: string, slow: string) => {
    const { debate } = await admittedPathsRun(harness, database.pool, { label, owner: own(), question: QUESTION });
    const scripted = scriptedShapeAnswers(debate.question);
    const slowRoot: { statement: string | null } = { statement: null };
    const answer = (request: GateRequest, chat: string): GateOverride | null => {
      // Who answers is left out of the reply: the two runs' seats differ, and their answers must not because of it.
      const debated = request.kind === "JUDGE" || request.kind === "PANEL" || request.kind === "REVIEW";
      const reply = debated ? scripted({ ...request, model: "one-model" }, askedOnly(chat)) : scripted(request, chat);
      if (slowRoot.statement === null && reply !== null && "content" in reply && rootTitleOf(request) === slow) {
        slowRoot.statement = (JSON.parse(reply.content) as { statement: string }).statement;
      }
      return reply;
    };
    const held = (request: GateRequest): number => slowRoot.statement !== null && (request.kind === "JUDGE" || request.kind === "REVIEW")
      && JSON.stringify(request.body).includes(slowRoot.statement) ? SLOW_MS : 0;
    const gates = await harness.startGates({}, undefined, answer, held);
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY,
      debateShape: { mapContractHash: mapPromptContractHash() }, engine: { engineContractHash: engineContractHash() } });
    const result = await harness.completedRun(composed, debate, gates);
    expect(slowRoot.statement).not.toBeNull();
    return { debate, result };
  };
  /** When each path's CHECKING was recorded. */
  const checkingAt = async (runId: string): Promise<Map<string, number>> => new Map((await q(database.pool,
    `SELECT path_id, recorded_at FROM core.path_step WHERE run_id=$1 AND step='CHECKING'`, runId))
    .map((row) => [String(row.path_id), new Date(row.recorded_at as string).getTime()] as const));
  /** Each path's nodes (its root, then everything under it), in the order they were saved: their place in the tree and strength. */
  const pathNodesOf = (runId: string) => q(database.pool, `WITH RECURSIVE tree AS (
      SELECT root.path_id, root.root_node_id AS node_id FROM core.path_root AS root WHERE root.run_id = $1
      UNION ALL
      SELECT tree.path_id, child.node_id FROM tree JOIN core.node AS child ON child.parent_node_id = tree.node_id)
    SELECT tree.path_id, node.materialized_path, node.child_kind, node.sibling_ordinal,
      (SELECT judgement.tau::text FROM ledger.reduced_judgement AS judgement WHERE judgement.node_id = node.node_id
        ORDER BY judgement.at_seq DESC LIMIT 1) AS tau
    FROM tree JOIN core.node AS node ON node.node_id = tree.node_id
    ORDER BY tree.path_id, node.created_at_seq`, runId);
  /** Each path's reviews in the order they were recorded: the maker of the node, and the maker that reviewed it. */
  const pathReviewsOf = (runId: string) => q(database.pool, `WITH RECURSIVE tree AS (
      SELECT root.path_id, root.root_node_id AS node_id FROM core.path_root AS root WHERE root.run_id = $1
      UNION ALL
      SELECT tree.path_id, child.node_id FROM tree JOIN core.node AS child ON child.parent_node_id = tree.node_id)
    SELECT tree.path_id, author.maker AS author_maker, reviewer.maker AS reviewer_maker
    FROM tree JOIN ledger.node_review AS review ON review.node_id = tree.node_id
    JOIN ledger.raw_artifact AS author ON author.raw_artifact_id = review.author_raw_artifact_ref
    JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
    ORDER BY tree.path_id, review.at_seq`, runId);
  /** The path of the last node saved in the whole run. */
  const lastSavedPathOf = async (runId: string): Promise<string> => String((await q(database.pool, `WITH RECURSIVE tree AS (
      SELECT root.path_id, root.root_node_id AS node_id FROM core.path_root AS root WHERE root.run_id = $1
      UNION ALL
      SELECT tree.path_id, child.node_id FROM tree JOIN core.node AS child ON child.parent_node_id = tree.node_id)
    SELECT tree.path_id FROM tree JOIN core.node AS node ON node.node_id = tree.node_id ORDER BY node.created_at_seq DESC LIMIT 1`, runId))[0]!.path_id);
  /**
   * The answer served to the run's owner, as two runs of one question can share it: each node named by its claim instead of its id,
   * the run's own ids and times masked, and each review's reviewer seat left out (drawn by the run id). Task 58b: serve lists a path
   * debate's nodes path by path and its edges after their source nodes, so the nodes and the edges keep serve's own order here (Task
   * 53b sorted both, when serve listed them in the order they were saved, which across paths followed the paths' timing).
   */
  const servedOf = async (answerId: string): Promise<string> => {
    const answer = await new ServeRepository(database.pool).readAnswerProjection(answerId, { ownerRef: own().ownerRef, legacyAskerId: null });
    expect(answer).not.toBeNull();
    let text = JSON.stringify(answer);
    for (const node of answer!.nodes) text = text.split(node.node_id).join(`node:${node.claim}`);
    const served = JSON.parse(text.replace(UUIDS, "<id>").replace(TIMES, "<at>")) as {
      nodes: { claim: string; review?: Record<string, unknown> | null }[]; edges: unknown[];
      condition_mark_records: { affected_node_ids: string[] }[] };
    for (const node of served.nodes) if (node.review !== null && node.review !== undefined) delete node.review.reviewer_lineage;
    // Serve lists a record's nodes by their ids, which each run draws afresh.
    for (const record of served.condition_mark_records) record.affected_node_ids.sort();
    return JSON.stringify(served);
  };
  /**
   * Task 58b: each live node's plan position (its path and its place in that path's tree, core.node.materialized_path) by node id: what
   * two runs of one question share whichever path finished first (never the ids, which each run draws afresh).
   */
  const planPositionsOf = async (runId: string): Promise<Map<string, string>> => new Map((await q(database.pool, `WITH RECURSIVE tree AS (
      SELECT root.path_id, root.root_node_id AS node_id FROM core.path_root AS root WHERE root.run_id = $1
      UNION ALL
      SELECT tree.path_id, child.node_id FROM tree JOIN core.node AS child ON child.parent_node_id = tree.node_id)
    SELECT tree.path_id, tree.node_id::text AS node_id, node.materialized_path FROM tree JOIN core.node AS node ON node.node_id = tree.node_id`, runId))
    .map((row) => [String(row.node_id), `${String(row.path_id)}:${String(row.materialized_path)}`] as const));
  /** Task 58b: the served nodes and edges in serve's order, each node named by its plan position, each edge by its source's and target's. */
  const servedPositionsOf = async (runId: string, answerId: string) => {
    const answer = await new ServeRepository(database.pool).readAnswerProjection(answerId, { ownerRef: own().ownerRef, legacyAskerId: null });
    expect(answer).not.toBeNull();
    const positions = await planPositionsOf(runId);
    const positionOf = (nodeId: string): string => positions.get(nodeId) ?? `outside-every-path:${nodeId}`;
    return {
      nodes: answer!.nodes.map((node) => positionOf(node.node_id)),
      edges: answer!.edges.map((edge) => [positionOf(edge.from_node_ref), edge.relation,
        edge.target_kind === "NODE" ? positionOf(edge.target_ref) : "an-edge"].join(" "))
    };
  };

  it("b1 slow: b2's and b3's CHECKING come before b1's; b3 slow instead: the same nodes per path in the same order, and the same answer", async () => {
    const b1Slow = await runWithSlowPath("paths-save-order-b1", "T1");
    const first = await checkingAt(b1Slow.debate.runId);
    expect([...first.keys()].sort()).toEqual(["b1", "b2", "b3"]);
    expect(first.get("b2")!).toBeLessThan(first.get("b1")!);
    expect(first.get("b3")!).toBeLessThan(first.get("b1")!);
    expect(await lastSavedPathOf(b1Slow.debate.runId)).toBe("b1");
    // Each path's reviewer turn reads that path's own reviews only (b1's were recorded after b2's and b3's): today's turn rule,
    // path by path, never moved on by another path's reviews.
    const reviews = await pathReviewsOf(b1Slow.debate.runId);
    expect(reviews.length).toBeGreaterThan(3);
    const makers = [...new Set(reviews.flatMap((row) => [String(row.author_maker), String(row.reviewer_maker)]))].map((maker) => ({ maker }));
    for (const pathId of ["b1", "b2", "b3"]) {
      const latest = new Map<string, string>();
      for (const row of reviews.filter((entry) => entry.path_id === pathId)) {
        const author = String(row.author_maker);
        expect(String(row.reviewer_maker)).toBe(selectDifferentMakerReviewer(b1Slow.debate.runId, author, makers, latest.get(author) ?? null).maker);
        latest.set(author, String(row.reviewer_maker));
      }
    }
    const b3Slow = await runWithSlowPath("paths-save-order-b3", "T3");
    const second = await checkingAt(b3Slow.debate.runId);
    expect(second.get("b1")!).toBeLessThan(second.get("b3")!);
    expect(second.get("b2")!).toBeLessThan(second.get("b3")!);
    expect(await lastSavedPathOf(b3Slow.debate.runId)).toBe("b3");
    // Whichever path ended first: each path's nodes saved in the same order, and the same answer served.
    const firstNodes = await pathNodesOf(b1Slow.debate.runId);
    expect(firstNodes.length).toBeGreaterThan(3);
    expect(await pathNodesOf(b3Slow.debate.runId)).toEqual(firstNodes);
    expect(await servedOf(b3Slow.result.answerId)).toBe(await servedOf(b1Slow.result.answerId));
  }, 900_000);

  it("Task 58b: b2 saves before b1, then b1 before b2: both answers list every b1 node, then every b2 node, then b3's, each path in its saved order, the edges after their source nodes", async () => {
    const b1Slow = await runWithSlowPath("paths-served-order-b1", "T1");
    const first = await checkingAt(b1Slow.debate.runId);
    expect(first.get("b2")!).toBeLessThan(first.get("b1")!);
    // Saved last, b1's legs come after b2's and b3's in created_at_seq (the order serve listed before).
    expect(await lastSavedPathOf(b1Slow.debate.runId)).toBe("b1");
    const served = await servedPositionsOf(b1Slow.debate.runId, b1Slow.result.answerId);
    // Path by path in plan order, each path's nodes in their saved order (pathNodesOf: by path, then created_at_seq), none outside a path.
    expect(served.nodes.length).toBeGreaterThan(3);
    expect(served.nodes).toEqual((await pathNodesOf(b1Slow.debate.runId)).map((row) => `${String(row.path_id)}:${String(row.materialized_path)}`));
    // Each edge comes after the edges of the nodes served before its source node.
    const sources = served.edges.map((edge) => served.nodes.indexOf(edge.split(" ")[0]!));
    expect(sources.length).toBeGreaterThan(0);
    expect(sources).not.toContain(-1);
    expect(sources).toEqual([...sources].sort((left, right) => left - right));
    // b2 slow instead: b1 saves before b2, and the same plan positions are served in the same order.
    const b2Slow = await runWithSlowPath("paths-served-order-b2", "T2");
    const second = await checkingAt(b2Slow.debate.runId);
    expect(second.get("b1")!).toBeLessThan(second.get("b2")!);
    expect(await lastSavedPathOf(b2Slow.debate.runId)).toBe("b2");
    expect(await servedPositionsOf(b2Slow.debate.runId, b2Slow.result.answerId)).toEqual(served);
  }, 900_000);

  it("Task 58b: an R22 debate (receipt v1, no paths) serves its nodes and edges in the order they were saved", async () => {
    const settings = PATHS_SETTINGS;
    const length = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "pro", answerLength: settings.answerLength });
    const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers: PANEL_REFS.length, mapOpening: true });
    const debate = await harness.admittedRun("paths-r22-served-order", { panelRefs: PANEL_REFS, pin: HAIKU_TELLS, depth: 1,
      shape: shapeForTest({ plan: "pro", makers: PANEL_REFS.length, settings }), settings, length, engine });
    const gates = await harness.startGates({}, undefined, scriptedShapeAnswers(debate.question));
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY,
      debateShape: { mapContractHash: mapPromptContractHash() }, engine: { engineContractHash: engineContractHash() },
      gateRemaining: { anthropic: async () => FINAL_WRITER_ROOM } });
    const result = await harness.completedRun(composed, debate, gates);
    const { answer } = await harness.servedAnswer(debate, result.answerId);
    expect(answer?.branches).toBeUndefined();
    const savedNodes = (await q(database.pool, `SELECT node_id::text AS id FROM core.node WHERE run_id=$1 AND generation_status <> 'stale'
      ORDER BY created_at_seq`, debate.runId)).map((row) => String(row.id));
    const servedNodes = answer!.nodes.map((node) => node.node_id);
    expect(servedNodes.length).toBeGreaterThan(1);
    expect(servedNodes).toEqual(savedNodes.filter((id) => servedNodes.includes(id)));
    const savedEdges = (await q(database.pool, `SELECT edge_id::text AS id FROM core.edge WHERE run_id=$1 ORDER BY created_at_seq`, debate.runId))
      .map((row) => String(row.id));
    const servedEdges = answer!.edges.map((edge) => edge.edge_id);
    expect(servedEdges.length).toBeGreaterThan(0);
    expect(servedEdges).toEqual(savedEdges.filter((id) => servedEdges.includes(id)));
  }, 900_000);
});

/**
 * Part II — V4 start step, Task 54 (spec 2026-11-03 §4.3, the owner's "First round" answer; items chat-first-round, journey-f1, wait-d1,
 * map-d2): each chosen path gets its answer so far as soon as its own arguing and checks end, beside the other paths' arguing; the main
 * answer is written once the last path is done, by the approved overall writer (Haiku writes, GLM checks, at the first debate's own
 * answer keys); the label is code's, from the paths' trust words; the story is v5, one entry per path. The five-company runs put GLM
 * on the panel by its writer ref (the gates answer it), so the final steps sit in Haiku and GLM.
 */
describe("each path's answer so far as soon as its own checks end, then the main answer and the story (part II, Task 54)", () => {
  /** The final steps' bodies stay under the 100K line (R22's owner rulings of 29 and 30 Oct). */
  const LINE = 195_904;
  const SLOW_MS = 5_000;
  const outcomesOf = (runId: string) => new PostgresPathResultsRepository(database.pool).readPathOutcomes(runId);
  type Called = Readonly<{ key: string; actor: string; outcome: string; at: number }>;
  const calledOf = async (runId: string): Promise<readonly Called[]> => (await q(database.pool, `SELECT call_site_key, actor_ref, outcome, started_at
    FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL' ORDER BY sequence`, runId))
    .map((row) => Object.freeze({ key: String(row.call_site_key), actor: String(row.actor_ref), outcome: String(row.outcome),
      at: new Date(row.started_at as string).getTime() }));
  const firstAt = (called: readonly Called[], test: (key: string) => boolean): number =>
    Math.min(...called.filter((call) => test(call.key)).map((call) => call.at));
  const lastAt = (called: readonly Called[], test: (key: string) => boolean): number =>
    Math.max(...called.filter((call) => test(call.key)).map((call) => call.at));
  /** Each path's nodes in the order they were saved: its root first, then everything under it. */
  const treeOf = async (runId: string): Promise<Map<string, string[]>> => {
    const rows = await q(database.pool, `WITH RECURSIVE tree AS (
        SELECT root.path_id, root.root_node_id AS node_id FROM core.path_root AS root WHERE root.run_id = $1
        UNION ALL
        SELECT tree.path_id, child.node_id FROM tree JOIN core.node AS child ON child.parent_node_id = tree.node_id)
      SELECT tree.path_id, tree.node_id::text AS node_id FROM tree JOIN core.node AS node ON node.node_id = tree.node_id
      ORDER BY tree.path_id, node.created_at_seq`, runId);
    const tree = new Map<string, string[]>();
    for (const row of rows) tree.set(String(row.path_id), [...(tree.get(String(row.path_id)) ?? []), String(row.node_id)]);
    return tree;
  };
  /** b<n>'s author calls (its root's legs, never a cross-root exchange) and the reviews of its nodes. */
  const pathJudgedBy = (tree: ReadonlyMap<string, readonly string[]>, pathNo: number) => (key: string): boolean =>
    new RegExp(`^(PANEL:)?JUDGE:(?!review:|cross-root:)[^:]+:root${String(pathNo - 1)}:`, "u").test(key)
    || (key.startsWith("JUDGE:review:") && (tree.get(`b${String(pathNo)}`) ?? []).includes(key.slice("JUDGE:review:".length).split(":")[0]!));
  /** Each request's body size as it left for the vendor. */
  const bodyBytes = (request: GateRequest): number => Buffer.byteLength(JSON.stringify(request.body), "utf8");
  /** The ids of the paths whose answer so far is stored now (the rows alone: nothing is opened). */
  const storedPathIds = async (runId: string): Promise<string[]> =>
    (await q(database.pool, `SELECT path_id FROM core.path_outcome WHERE run_id=$1 ORDER BY path_id`, runId)).map((row) => String(row.path_id));
  const FINAL_KINDS: ReadonlySet<string> = new Set(["PATH_OUTCOME_WRITER", "PATH_OUTCOME_CHECKER", "REPORT_ANSWER", "REPORT_ANSWER_CHECK",
    "STORY_PATHS", "STORY_PATHS_CHECK"]);

  /**
   * One path debate on the five companies (GLM by its writer ref beside the four), its set sealed at Start, the run's step-2 lines when
   * given; the path titled `slow` is slow (once its root is written, every author call answering it and every review of its nodes is held
   * SLOW_MS); `before` is asked first for every request; `money`, a hosted runner's.
   */
  const runFive = async (label: string, options: Readonly<{ plan?: "plus" | "free"; paths?: number; depth?: number; question?: string;
    purposeLines?: PurposeLines; slow?: string; before?: (request: GateRequest, chat: string) => GateOverride | null; money?: PreviewRunnerMoney;
    stored?: (runId: string) => Promise<void>; watch?: (debate: Readonly<{ runId: string; workItemId: string }>, finished: () => boolean) => Promise<void> }> = {}) => {
    const plan = options.plan ?? "plus";
    const count = options.paths ?? 3;
    const shape = pathsShapeOf(plan, count, "MENU", FIVE_MAKER_REFS.length);
    const length = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan, answerLength: PATHS_SETTINGS.answerLength });
    const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers: FIVE_MAKER_REFS.length, mapOpening: false });
    const debate = await harness.admittedRun(label, { panelRefs: FIVE_MAKER_REFS, depth: options.depth ?? 1, shapeV2: shape, settings: PATHS_SETTINGS,
      length, engine, owner: own(), ...(options.question === undefined ? {} : { question: options.question }) });
    expect(await new PostgresStartPathsStore(database.pool).recordStartPaths(storedPathsOf(debate.runId, count))).toBe("RECORDED");
    if (options.purposeLines !== undefined) {
      expect(await postgresPurposeLines(database.pool).record(own().ownerRef, debate.runId, options.purposeLines)).toBe("RECORDED");
    }
    await options.stored?.(debate.runId);
    const scripted = scriptedShapeAnswers(debate.question);
    const slowRoot: { statement: string | null } = { statement: null };
    const answer = (request: GateRequest, chat: string): GateOverride | null => {
      const reply = options.before?.(request, chat) ?? scripted(request, chat);
      if (options.slow !== undefined && slowRoot.statement === null && reply !== null && "content" in reply && request.kind === "JUDGE"
        && materialOf(request).contractId.startsWith("judge.path-root.")
        && materialOf(request).fields.find((field) => field.name === "path_title")?.content === options.slow) {
        slowRoot.statement = (JSON.parse(reply.content) as { statement: string }).statement;
      }
      return reply;
    };
    const held = (request: GateRequest): number => slowRoot.statement !== null && (request.kind === "JUDGE" || request.kind === "REVIEW")
      && JSON.stringify(request.body).includes(slowRoot.statement) ? SLOW_MS : 0;
    // GLM answers (a debate script names no unbilled model), so the final steps sit in Haiku and GLM.
    const gates = await harness.startGates({}, { unbilled: [] }, answer, held);
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY,
      debateShape: { mapContractHash: mapPromptContractHash() }, engine: { engineContractHash: engineContractHash() },
      ...(options.money === undefined ? {} : { money: options.money }) });
    let finished = false;
    const watching = options.watch?.(debate, () => finished) ?? Promise.resolve();
    const result = await harness.completedRun(composed, debate, gates).finally(() => { finished = true; });
    await watching;
    if (options.slow !== undefined) expect(slowRoot.statement).not.toBeNull();
    return { debate, gates, result, called: await calledOf(debate.runId) };
  };

  it("b3 slow: b1's and b2's answers so far come before b3's last check and are stored while the run runs; the main answer after b3's; Haiku and GLM; the label, the story, the bodies, the FOUND marks, the place and the care sentence", async () => {
    const question = "preview-paths-early-5401 What I care about is: keeping bills low.";
    // While the run runs: the first moment b1's and b2's answers so far are both stored, the work item's state and what was stored then.
    const seen: { state: string; stored: string[] }[] = [];
    const run = await runFive("paths-early-b3-slow", { question, purposeLines: { place: "The north quay" }, slow: "T3",
      watch: async (debate, finished) => {
        while (!finished() && seen.length === 0) {
          const stored = await storedPathIds(debate.runId);
          if (stored.includes("b1") && stored.includes("b2")) {
            const state = String((await q(database.pool, `SELECT state FROM core.work_item WHERE work_item_id=$1`, debate.workItemId))[0]!.state);
            seen.push({ state, stored });
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } });
    const runId = run.debate.runId;
    const outcomes = await outcomesOf(runId);
    expect([...outcomes.entries()].map(([pathId, outcome]) => [pathId, outcome.state])).toEqual([["b1", "READY"], ["b2", "READY"], ["b3", "READY"]]);
    // b1's and b2's answers so far were asked before b3's arguing and checks ended (its last author call or review).
    const tree = await treeOf(runId);
    const b3Last = lastAt(run.called, pathJudgedBy(tree, 3));
    expect(firstAt(run.called, (key) => key === "PATH_OUTCOME:WRITER:1:1")).toBeLessThan(b3Last);
    expect(firstAt(run.called, (key) => key === "PATH_OUTCOME:WRITER:2:1")).toBeLessThan(b3Last);
    // ... and stored while the run was still running (its work item still claimed), b3's not yet.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.state).toBe("CLAIMED");
    expect(seen[0]!.stored).not.toContain("b3");
    // The main answer is asked once the last path is done.
    expect(firstAt(run.called, (key) => key === "COMPOSER:SYNTHESIZER:INITIAL:1"))
      .toBeGreaterThan(lastAt(run.called, (key) => key.startsWith("PATH_OUTCOME:") && key.split(":")[2] === "3"));
    // Each path's CHECKING comes before its first answer-so-far request.
    const checking = new Map((await q(database.pool, `SELECT path_id, recorded_at FROM core.path_step WHERE run_id=$1 AND step='CHECKING'`, runId))
      .map((row) => [String(row.path_id), new Date(row.recorded_at as string).getTime()] as const));
    for (const pathNo of [1, 2, 3]) {
      expect(checking.get(`b${String(pathNo)}`)!).toBeLessThanOrEqual(firstAt(run.called, (key) => key === `PATH_OUTCOME:WRITER:${String(pathNo)}:1`));
    }
    // Haiku writes and GLM checks: every answer so far and the main answer; no serve.synthesizer.v4 is ever sent.
    const okByKey = run.called.filter((call) => call.outcome === "OK");
    const writers = okByKey.filter((entry) => /^(PATH_OUTCOME:WRITER|COMPOSER):/u.test(entry.key));
    const checkers = okByKey.filter((entry) => /^(PATH_OUTCOME:CHECKER|POST_COMPOSE_R9):/u.test(entry.key));
    expect([writers.length > 0, checkers.length > 0]).toEqual([true, true]);
    for (const call of writers) expect([call.key, call.actor]).toEqual([call.key, expect.stringMatching(/haiku/iu)]);
    for (const call of checkers) expect([call.key, call.actor]).toEqual([call.key, expect.stringMatching(/fixture-a|glm/iu)]);
    // ... as the gates saw them: the main answer written on Anthropic, checked on DeepInfra's GLM.
    expect(run.gates.requests.filter((request) => request.kind === "REPORT_ANSWER").map((request) => request.model)).toEqual([HAIKU]);
    expect(new Set(run.gates.requests.filter((request) => request.kind === "REPORT_ANSWER_CHECK").map((request) => request.model))).toEqual(new Set([GLM]));
    expect(okByKey.filter((call) => call.key.startsWith("COMPOSER:")).map((call) => call.key)).toEqual(["COMPOSER:SYNTHESIZER:INITIAL:1"]);
    expect(run.gates.requests.filter((request) => request.kind === "COMPOSE" || request.kind === "EVALUATOR")).toEqual([]);
    const writer = run.gates.requests.filter((request) => request.kind === "REPORT_ANSWER" && request.answer === "OK");
    expect(writer).toHaveLength(1);
    expect(materialOf(writer[0]!).contractId).toBe(REPORT_ANSWER_V4_PROMPT_CONTRACT.contractId);
    expect(wirePacket(stubChatBody(writer[0]!.provider, writer[0]!.body)).messages[0]!.content).toContain(REPORT_ANSWER_V4_PROMPT_CONTRACT.instruction);
    // The care sentence is the question's, once, in the main answer's question; the place reaches an answer so far, the main answer and
    // the story (Task 53's (a) and (b)).
    expect((materialOf(writer[0]!).fields.find((field) => field.name === "question")?.content ?? "").split("What I care about is: keeping bills low.")).toHaveLength(2);
    const carries = (kind: string) => run.gates.requests.filter((request) => request.kind === kind && JSON.stringify(request.body).includes("The north quay"));
    expect(carries("PATH_OUTCOME_WRITER").length).toBeGreaterThan(0);
    expect(carries("REPORT_ANSWER").length).toBeGreaterThan(0);
    expect(carries("STORY_PATHS").length).toBeGreaterThan(0);
    // Every final body under the line.
    const finals = run.gates.requests.filter((request) => FINAL_KINDS.has(request.kind));
    expect(finals.length).toBeGreaterThan(0);
    for (const request of finals) expect(bodyBytes(request)).toBeLessThanOrEqual(LINE);
    // The served answer: its segments, and the label by the rule (the weakest word its paths hold, in path order).
    const answer = await new ServeRepository(database.pool).readAnswerProjection(run.result.answerId, { ownerRef: own().ownerRef, legacyAskerId: null });
    expect(answer!.composed_text.length).toBeGreaterThan(0);
    const trusts = ["b1", "b2", "b3"].map((pathId) => [...outcomes].find(([stored]) => stored === pathId)?.[1].trust ?? null);
    expect(answer!.verdict_state).toBe(verdictDerivationOfPaths(mainAnswerTrustWordOf(trusts)).label);
    // The story is v5, one entry per path.
    expect(run.gates.requests.some((request) => request.kind === "STORY_PATHS" && request.answer === "OK")).toBe(true);
    const story = await new StoryRepository(database.pool).readForAnswer({ answerId: run.result.answerId, answerVersion: null,
      ownership: { ownerRef: own().ownerRef } });
    const storyPaths = (story?.body as { short?: { paths?: { position_ref: string }[] } } | null | undefined)?.short?.paths;
    expect(storyPaths?.map((path) => path.position_ref)).toEqual(["b1", "b2", "b3"]);
    // Every point of b1 with a trust word has one FOUND row with that word; none without one.
    const b1Points = (tree.get("b1") ?? []).slice(1);
    const facts = await q(database.pool, `SELECT node.node_id::text AS node_id, node.way_of_knowing, node.relevant_as_of, review.outcome FROM core.node AS node
      LEFT JOIN LATERAL (SELECT outcome FROM ledger.node_review WHERE node_id = node.node_id ORDER BY at_seq DESC LIMIT 1) AS review ON true
      WHERE node.run_id = $1`, runId);
    const liveness = new LivenessRepository(database.pool);
    const expected = new Map<string, string>();
    for (const row of facts.filter((entry) => b1Points.includes(String(entry.node_id)))) {
      const staleness = await liveness.readSubjectStaleness({ runId, subjectKind: "NODE", subjectRef: String(row.node_id), relevantAsOf: row.relevant_as_of as Date });
      const word = trustOfPoint({ review: row.outcome === null ? null : { outcome: String(row.outcome) }, staleness_state: staleness.state,
        way_of_knowing: String(row.way_of_knowing), looked_up_checked: false }, { free: false, fell: false }).trust;
      if (word !== null) expected.set(String(row.node_id), word);
    }
    expect(b1Points.length).toBeGreaterThan(0);
    expect(expected.size).toBeGreaterThan(0);
    const found = await q(database.pool, `SELECT node_id::text AS node_id, trust FROM core.path_point_mark WHERE run_id=$1 AND path_id='b1' AND mark='FOUND'`, runId);
    expect(new Map(found.map((row) => [String(row.node_id), String(row.trust)]))).toEqual(expected);
  }, 900_000);

  it("investigations: each path's own cannot-assess points, its share of the debate's investigations, before its own answer so far; the settle step asks none", async () => {
    // Every point's review (a point sources an edge; a root none) cannot assess it.
    const run = await runFive("paths-investigate", { question: "preview-paths-investigate-5402", before: (request, chat) =>
      request.kind === "REVIEW" && requestedReviewEdges(chat).length > 0
        ? { content: withRequestDerivedBearings(reviewArtifact("cannot-assess", ["The reviewer could not tell whether this point holds."]), chat) }
        : null });
    const runId = run.debate.runId;
    const tree = await treeOf(runId);
    const investigations = run.called.filter((call) => call.key.startsWith("VERDICT:investigate:"));
    // The debate's cap (2) shared by path in the person's order: b1 takes VERDICT:investigate:1, b2 :2, b3 none.
    expect(investigations.map((call) => call.key).sort()).toEqual(["VERDICT:investigate:1", "VERDICT:investigate:2"]);
    const rows = await q(database.pool, `SELECT node_id::text AS node_id, investigation_order, result FROM ledger.point_investigation WHERE run_id=$1
      ORDER BY investigation_order`, runId);
    const pathOfNode = (nodeId: string): string => [...tree].find(([, nodes]) => nodes.includes(nodeId))?.[0] ?? "none";
    // Each investigated point is under its own path's root (never a root), the rows in path order.
    expect(rows.length).toBeGreaterThan(0);
    const rowPaths = rows.map((row) => pathOfNode(String(row.node_id)));
    expect(rowPaths).toEqual([...rowPaths].sort());
    for (const row of rows) expect([...tree.values()].some((nodes) => nodes[0] === String(row.node_id))).toBe(false);
    const called = rows.filter((row) => row.result !== "INVESTIGATION_CAPPED");
    expect(called.map((row) => pathOfNode(String(row.node_id)))).toEqual(["b1", "b2"]);
    expect(rows.filter((row) => pathOfNode(String(row.node_id)) === "b3").map((row) => row.result))
      .toEqual(rows.filter((row) => pathOfNode(String(row.node_id)) === "b3").map(() => "INVESTIGATION_CAPPED"));
    // Each investigation is asked in its own path's chain, before that path's answer so far; none after the arguing.
    expect(lastAt(run.called, (key) => key === "VERDICT:investigate:1")).toBeLessThan(firstAt(run.called, (key) => key === "PATH_OUTCOME:WRITER:1:1"));
    expect(lastAt(run.called, (key) => key === "VERDICT:investigate:2")).toBeLessThan(firstAt(run.called, (key) => key === "PATH_OUTCOME:WRITER:2:1"));
    expect(lastAt(run.called, (key) => key.startsWith("VERDICT:investigate:")))
      .toBeLessThan(lastAt(run.called, (key) => key.startsWith("PATH_OUTCOME:")));
    expect(lastAt(run.called, (key) => key.startsWith("VERDICT:investigate:")))
      .toBeLessThan(firstAt(run.called, (key) => key.startsWith("COMPOSER:")));
    expect(run.gates.requests.filter((request) => request.kind === "INVESTIGATE")).toHaveLength(2);
    expect(run.result.kind).toBe("COMPLETED");
  }, 900_000);

  it("depth 2 on Plus: every path's answer so far is stored before the first main-answer request", async () => {
    const run = await runFive("paths-early-depth-two", { depth: 2 });
    const stored = await q(database.pool, `SELECT path_id, state, recorded_at FROM core.path_outcome WHERE run_id=$1 ORDER BY path_id`, run.debate.runId);
    expect(stored.map((row) => [row.path_id, row.state])).toEqual([["b1", "READY"], ["b2", "READY"], ["b3", "READY"]]);
    const composer = firstAt(run.called, (key) => key.startsWith("COMPOSER:"));
    for (const row of stored) expect(new Date(row.recorded_at as string).getTime()).toBeLessThanOrEqual(composer);
  }, 900_000);

  it("a re-claimed run whose paths already have their answers so far makes no answer-so-far call, writes their FOUND marks again and answers from them", async () => {
    const kept: PathOutcome = Object.freeze({ state: "READY", text: { line: "Kept before the copy stopped.", summary: "It was kept before the copy stopped.",
      fate: "HELD_UP" }, what_changed: ["It held."], view: null, trust: "SURE_FOR_CASE", rests_on: [] }) as PathOutcome;
    const run = await runFive("paths-early-reclaim", { stored: async (runId) => {
      const store = new PostgresPathResultsRepository(database.pool);
      for (const pathId of ["b1", "b2", "b3"] as const) expect(await store.recordPathOutcome({ runId, pathId, outcome: kept })).toBe("RECORDED");
    } });
    expect(run.called.filter((call) => call.key.startsWith("PATH_OUTCOME:"))).toEqual([]);
    expect([...(await outcomesOf(run.debate.runId)).values()]).toEqual([kept, kept, kept]);
    expect((await q(database.pool, `SELECT path_id FROM core.path_point_mark WHERE run_id=$1 AND mark='FOUND'`, run.debate.runId)).length).toBeGreaterThan(0);
    expect(run.called.some((call) => call.key === "COMPOSER:SYNTHESIZER:INITIAL:1" && call.outcome === "OK")).toBe(true);
  }, 900_000);

  it("the reserve (decision 2): Plus, five paths, every call charged through the run's guard: SERVE rows are the main answer's, the answers so far are the debate's attempts, inside its ceiling", async () => {
    // One micro-unit per token each way; a run ceiling far above the run, so nothing stops for money; the answer's reserve held (80%).
    const price = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
    const guard = new CostEnvelopeGuard({ store: new PostgresModelSpendStore(database.pool), policy: { perRunCeilingMicros: 1_000_000_000,
      dailyCeilingMicros: Number.MAX_SAFE_INTEGER, serveReserveBasisPoints: 8_000, serveOverrunBasisPoints: 0 }, inFlight: createRunInFlight() });
    const admitAll: ProviderCostEnvelopeSeam = { assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined };
    const money: PreviewRunnerMoney = {
      buildCostEnvelopeSeam: () => (runId, phase, sharedWall) => guard.providerSeam({ runId, price, requireReportedUsage: true, phase, sharedWall }),
      buildStoryCostEnvelopeSeam: () => () => admitAll,
      providerPrices: new Map(TARGETS.map((target) => [target.providerRef, price]))
    };
    const run = await runFive("paths-early-reserve", { paths: 5, money });
    const runId = run.debate.runId;
    const answered = run.called.filter((call) => call.outcome === "OK");
    const mainAnswer = answered.filter((call) => /^(COMPOSER|POST_COMPOSE_R9):/u.test(call.key));
    expect(mainAnswer.length).toBeGreaterThan(0);
    const serveRows = await q(database.pool, `SELECT spend_phase FROM ledger.model_spend WHERE run_id=$1 AND spend_phase='SERVE'`, runId);
    expect(serveRows).toHaveLength(mainAnswer.length);
    // The debate's (BODY) attempts, counted as the attempt ceiling counts them, less the main answer's.
    const counted = await q(database.pool, `SELECT call_site_key FROM ledger.ledger_entry
      WHERE run_id = $1 AND action_kind = 'MODEL_CALL' AND outcome <> 'REFUSED'
        AND call_site_key NOT LIKE 'STORY:%' AND call_site_key NOT LIKE 'REPAIR:STRUCTURE:STORY:%'
        AND NOT evaluator.ledger_entry_is_authenticated_scope(ledger_entry_id)`, runId);
    const body = counted.map((row) => String(row.call_site_key)).filter((key) => !key.startsWith("COMPOSER:") && !key.startsWith("POST_COMPOSE_R9:"));
    const basis = parseCostEnvelopeBasis((await q(database.pool, `SELECT envelope_basis FROM core.run WHERE run_id=$1`, runId))[0]!.envelope_basis);
    expect(body.length).toBeLessThanOrEqual(attemptCeilingForPhase(basis, "BODY"));
    const outcomeCalls = answered.filter((call) => call.key.startsWith("PATH_OUTCOME:")).map((call) => call.key);
    expect(outcomeCalls.length).toBeGreaterThanOrEqual(10);
    for (const key of outcomeCalls) expect(body).toContain(key);
    // No main-answer call was refused for the run's attempts.
    expect(run.called.filter((call) => /^(COMPOSER|POST_COMPOSE_R9):/u.test(call.key) && call.outcome !== "OK")).toEqual([]);
    expect([...(await outcomesOf(runId)).keys()]).toEqual(["b1", "b2", "b3", "b4", "b5"]);
  }, 900_000);

  // Review of Task 54: the brief's "writer FAILED → one segment per outcome line on its root" had no test, and a fallback the sealed
  // persist refused would cost the whole debate its answer.
  it("the main answer's writer fails: each path's own line is served, in path order, on its root, and the debate still answers", async () => {
    // The gate does not serve the writer's model for the main answer (refused before anything is sent; no repair, no resend).
    const run = await runFive("paths-main-answer-failed", { question: "preview-paths-main-failed-5403",
      before: (request) => request.kind === "REPORT_ANSWER" ? { gateRefuses: "MODEL_NOT_ALLOWED" } : null });
    expect(run.result.kind).toBe("COMPLETED");
    expect(run.gates.requests.some((request) => request.kind === "REPORT_ANSWER")).toBe(true);
    const outcomes = new Map([...(await outcomesOf(run.debate.runId))].map(([pathId, outcome]) => [String(pathId), outcome] as const));
    expect([...outcomes.values()].map((outcome) => outcome.state)).toEqual(["READY", "READY", "READY"]);
    const answer = await new ServeRepository(database.pool).readAnswerProjection(run.result.answerId, { ownerRef: own().ownerRef, legacyAskerId: null });
    expect(answer!.composed_text.map((segment) => [segment.segment_id, segment.text, segment.load_bearing])).toEqual(
      ["b1", "b2", "b3"].map((pathId, at) => [`s${String(at + 1)}`, outcomes.get(pathId)!.text!.line, at === 0]));
    const trusts = ["b1", "b2", "b3"].map((pathId) => outcomes.get(pathId)?.trust ?? null);
    expect(answer!.verdict_state).toBe(verdictDerivationOfPaths(mainAnswerTrustWordOf(trusts)).label);
    // Each line rests on its own path's root: the band is read from the three roots the lines cite, one each.
    const roots = await q(database.pool, `SELECT path_id, root_node_id::text AS root_node_id FROM core.path_root WHERE run_id=$1 ORDER BY path_id`,
      run.debate.runId);
    expect(roots.map((row) => String(row.path_id))).toEqual(["b1", "b2", "b3"]);
    const basis = answer!.band_ceiling!.basis;
    expect(basis.LOOKED_UP + basis.RAN + basis.REASONING).toBe(roots.length);
  }, 900_000);

  /*
   * Task 54c (owner, 4 Nov, "Keep all three"): a path debate's story keeps v4's web quotes (W1-5) and its backup storyteller (R1d),
   * through the runner as main.ts composes it. The third feature, the charts and tables call, is proven on the writer
   * (tests/unit/story-paths-v5.test.ts): this file's runner composes its story writer without it, as it always has.
   */
  const systemOf = (request: GateRecord): string => wirePacket(stubChatBody(request.provider, request.body)).messages[0]!.content;
  const storyPointsOf = (request: GateRecord) => JSON.parse(materialOf(request).fields.find((field) => field.name === "points")?.content ?? "[]") as
    { ref: string; extract?: { id: string; quote: string; site: string } }[];

  it("Task 54c: a Plus path debate that read the web tells its story with each looked-up root's extract and the two source sentences; a Free one with neither", async () => {
    /** Each path's root answers as looked up, its locator the first extract of the packs it was shown (one of this debate's). */
    const cited: string[] = [];
    const lookedUp = (request: GateRequest): GateOverride | null => {
      if (request.kind !== "JUDGE" || !materialOf(request).contractId.startsWith("judge.path-root.")) return null;
      const sources = JSON.parse(materialOf(request).fields.find((field) => field.name === "sources")?.content ?? "[]") as { extracts?: { id: string }[] }[];
      const id = sources.flatMap((pack) => pack.extracts ?? [])[0]?.id;
      if (id === undefined) return null;
      cited.push(id);
      const statement = `The pier queues fell by a third, reading ${String(cited.length)}.`;
      return { content: JSON.stringify({ ...(JSON.parse(stubJudgement(statement)) as object), way_of_knowing: "LOOKED_UP", locator: id }) };
    };
    const paid = await runPathsDebate(harness, database.pool, { label: "paths-story-web", owner: own(), web: { webPlan: "PLUS", planSearch: true },
      before: lookedUp });
    expect(cited.length).toBeGreaterThan(0);
    const tellers = paid.gates.requests.filter((request) => request.kind === "STORY_PATHS" && request.answer === "OK");
    expect(tellers.length).toBeGreaterThan(0);
    for (const teller of tellers) {
      const quoted = storyPointsOf(teller).filter((point) => point.extract !== undefined);
      expect(quoted.length).toBeGreaterThan(0);
      for (const point of quoted) expect(cited).toContain(point.extract!.id);
      expect(systemOf(teller)).toContain(WEB_WRITER_SENTENCES);
    }
    const checks = paid.gates.requests.filter((request) => request.kind === "STORY_PATHS_CHECK" && request.answer === "OK");
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) expect(systemOf(check)).not.toContain(WEB_WRITER_SENTENCES);
    const story = await new StoryRepository(database.pool).readForAnswer({ answerId: paid.result.answerId, answerVersion: null,
      ownership: { ownerRef: own().ownerRef } });
    expect(story?.outcome).toBe("READY");
    // Free: no web search, so no point carries an extract and nothing tells the storyteller to cite one.
    const free = await runPathsDebate(harness, database.pool, { label: "paths-story-free", owner: own(), plan: "free",
      web: { webPlan: "FREE", planSearch: true }, before: lookedUp });
    const freeTellers = free.gates.requests.filter((request) => request.kind === "STORY_PATHS" && request.answer === "OK");
    expect(freeTellers.length).toBeGreaterThan(0);
    for (const teller of freeTellers) {
      expect(storyPointsOf(teller).filter((point) => point.extract !== undefined)).toEqual([]);
      expect(systemOf(teller)).not.toContain(WEB_WRITER_SENTENCES);
    }
  }, 900_000);

  it("Task 54c: Haiku's path story that cannot be reached goes to one backup storyteller of another company, which writes it on STORY:STORYTELLER:3, under the line", async () => {
    // The gate cannot reach Haiku's vendor for the story (unbilled, nothing sent): the first storyteller cannot be reached. (An
    // unusable reply would make the call's repair packet, which this file's gate stand-in cannot read back on a cache-split
    // story: its request would never be answered.)
    const run = await runFive("paths-story-backup", { question: "preview-paths-story-backup-5404",
      before: (request) => request.kind === "STORY_PATHS" && request.model === HAIKU ? { gateRefuses: "PROVIDER_NOT_REACHED" } : null });
    const tellers = run.gates.requests.filter((request) => request.kind === "STORY_PATHS");
    expect(tellers.filter((request) => request.model === HAIKU).length).toBeGreaterThan(0);
    const backups = tellers.filter((request) => request.model !== HAIKU && request.answer === "OK");
    expect(backups.length).toBeGreaterThan(0);
    for (const request of backups) expect([HAIKU, GLM]).not.toContain(request.model);
    expect(run.called.filter((call) => call.key === "STORY:STORYTELLER:3" && call.outcome === "OK").map((call) => call.actor))
      .toEqual([expect.not.stringMatching(/haiku|glm|fixture-a/iu)]);
    for (const request of [...tellers, ...run.gates.requests.filter((entry) => entry.kind === "STORY_PATHS_CHECK")]) {
      expect(bodyBytes(request)).toBeLessThanOrEqual(LINE);
    }
    const story = await new StoryRepository(database.pool).readForAnswer({ answerId: run.result.answerId, answerVersion: null,
      ownership: { ownerRef: own().ownerRef } });
    expect(story).toMatchObject({ outcome: "READY", backup: { code: STORY_BACKUP_USED, signal: "UNREACHABLE" } });
    expect(story!.backup!.firstModel).toMatch(/haiku/iu);
    expect(story!.storytellerLineage!.provider_ref).not.toMatch(/haiku|glm|fixture-a/iu);
    expect((story?.body as { short?: { paths?: { position_ref: string }[] } } | null | undefined)?.short?.paths?.map((path) => path.position_ref))
      .toEqual(["b1", "b2", "b3"]);
  }, 900_000);
});
