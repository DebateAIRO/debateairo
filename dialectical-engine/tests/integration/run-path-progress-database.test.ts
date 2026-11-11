// tests/integration/run-path-progress-database.test.ts
// V4 start step, Task 58 (spec 2026-11-03 §2 items 7 and 8; items wait-d1, journey-f1, wait-f16, r2-8; owner card "Carry-on", "Show it
// from the start"): the owner's run read of a path debate, on real PostgreSQL, through the API's own application on the API's login. No
// runner runs: the stores are written directly, as the runner's login writes them (0159's paths and carry-on marks, 0160's roots and
// answers so far, 0161's steps and point marks), the points through the graph store. Pinned: the run read's `path_progress` equals what the
// stores hold; a path fills in on its own (ARGUED with its findings) while another is still arguing and the debate runs; a debate whose
// paths are not named yet has none, and a ticked carry-on debate is on its answer from the first read; the carry-on part follows the debate
// to the digs, the report and the end, on the run read and on the answer alike; an R22 debate's read and a stranger's have none of it, and
// no run read carries `purpose_lines`; and the drift pin: the findings the run read gave while the debate ran are, node for node and word for
// word, the served answer's points under that path's root that have a trust word. Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAskApplication, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import {
  AnswerSchema, RunProjectionSchema, trustOfPoint, webRanOnFree, type Answer, type PathId, type RunPathFinding, type RunProjection, type Session,
  type TrustWord
} from "@debateai/contract";
import {
  PostgresInvestigationRepository, PostgresPathProgressRepository, PostgresPathResultsRepository, PostgresStartPathsStore, RunRepository,
  configureContentEncryption, contentCipherFor, createPool, migrate, withRunContentLease, type Pool, type StoredStartPath
} from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { JudgementRepository, insertPreparedNodeReview } from "@debateai/judgement";
import { LedgerRepository } from "@debateai/ledger";
import {
  DEBATE_SHAPE_V2_FORMULA_VERSION, debateShapePolicyStartValues, debateShapeReceiptV2, debateShapeSiteCountsV2, resolveDebateShapeV2
} from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import { outcomeFixture } from "../support/branchesFixture.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";
import { provisionRlsLogins, type RlsLogins } from "../support/rls-logins.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let logins: RlsLogins | undefined;
let runner: Pool;
let api: Pool;
let owner: StoryEncryptedOwner;

const QUESTION = "Should Harbour Town build a second ferry pier?";
const path = (no: 1 | 2 | 3, title: string, question: string): StoredStartPath => ({ pathId: `b${no}`, pathNo: no, author: "AI_SUGGESTION",
  title, question, viewpoints: [{ viewpointId: null, pickNo: null, title, question, own: false }], ownWords: [] });
const PATHS: readonly StoredStartPath[] = [
  path(1, "The queues", "Would a second pier cut the queues?"),
  path(2, "Winter", "Does winter ridership fall?"),
  path(3, "The harbour floor", "Who pays for the dredging?")
];
const FACTS = { facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"], reversalPoint: "none",
  buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null } as const;
const OWNER = () => ({ ownerRef: owner.ownerRef, legacyAskerId: null });
const STRANGER = () => ({ ownerRef: randomUUID(), legacyAskerId: null });
const SESSION = { session_id: "33333333-3333-4333-8333-333333333333" } as Session;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  logins = await provisionRlsLogins(database);
  runner = createPool(logins.url("RUNNER_DATABASE_URL"));
  configureContentEncryption(runner, contentCipherFor(database.pool)!);
  api = createPool(logins.url("API_SYSTEM_DATABASE_URL"));
  configureContentEncryption(api, contentCipherFor(database.pool)!);
}, 300_000);

afterAll(async () => {
  await Promise.all([runner?.end(), api?.end()]);
  await logins?.end();
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

/** The API's own application on the API's login (side-by-side-run-ref.test.ts's settings). */
function application(): PostgresAskApplication {
  const dispatcher: Dispatcher = { dispatch: async () => undefined };
  const settings: RunCreationSettings = {
    strangerSampleRate: 0, registerVersion: 1, releaseKey: TEST_RELEASE_KEY, batteryVersion: "t58:progress", settlementWatchHandle: "t58:progress",
    resolveDiscoveredPanel: async () => fixtureDiscoveredPanel(2),
    resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef })
  };
  return new PostgresAskApplication(api, dispatcher, settings, undefined, database.pool, createTestAskAdmissionPoolFacades(database.pool));
}

/** The owner's run read as the route serves it; no run read ever carries purpose lines (owner answer Q17: they are in the question line). */
async function runRead(runId: string): Promise<RunProjection> {
  const run = await application().readRun(runId, SESSION, OWNER());
  expect(run).not.toBeNull();
  RunProjectionSchema.parse(run);
  expect(run).not.toHaveProperty("purpose_lines");
  return run!;
}

/** A path debate of the owner's: a sealed debate admitted with shape receipt v2, its paths built by the run, the box ticked or not. */
function pathDebate(carryOn = false): Promise<string> {
  const shape = resolveDebateShapeV2(debateShapePolicyStartValues(), "plus",
    { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard", paths: 3, pathsSource: "RUN_BUILT" }, 4);
  return new RunRepository(database.pool).startRun({
    questionLine: QUESTION,
    // Task 35's member, as admission writes it on receipt v2 when the box is ticked.
    askContract: { audience: "t58-progress", ...(carryOn ? { carry_on_to_report: true } : {}) },
    principal: { kind: "server", userId: owner.userId, ownerRef: owner.ownerRef }, sessionId: owner.sessionId, callerScope: "ASKER",
    asOf: new Date("2026-11-05T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER",
    tierProvenanceRef: "t58:progress", compositionBudgetTier: "low", depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1, registerVersion: 1, releaseKey: TEST_RELEASE_KEY, batteryVersion: "t58:progress", batteryRows: [],
    envelopeBasis: { ...fixtureStructuralCeiling(10), formula_version: DEBATE_SHAPE_V2_FORMULA_VERSION,
      shape: debateShapeReceiptV2(shape, debateShapeSiteCountsV2(shape, 1), 0) }
  });
}

/** The runner names the debate's three paths (0159, the runner's login). */
async function recordPaths(runId: string, carryOn = false): Promise<void> {
  expect(await new PostgresStartPathsStore(runner).recordStartPaths({ runId, source: "RUN_BUILT", width: 3, chosenBy: "AIS",
    carryOnToReport: carryOn, paths: PATHS, menu: null })).toBe("RECORDED");
}

/** The runner holds the debate's job: the run read says RUNNING (web-plan-serve-database.test.ts's claim). */
async function claimed(runId: string): Promise<string> {
  return (await database.pool.query<{ work_item_id: string }>(
    `INSERT INTO core.work_item (run_id, battery_row_id, node_set, command_key, state, claimed_by, claim_deadline, created_at_seq)
     VALUES ($1,'Q1','[]'::jsonb,$2,'CLAIMED','runner:t58',clock_timestamp() + interval '10 minutes',ledger.allocate_sequence())
     RETURNING work_item_id::text`, [runId, `t58:${randomUUID()}`])).rows[0]!.work_item_id;
}

const artifact = async (runId: string, maker: string): Promise<string> => {
  const artifactId = randomUUID();
  await new LedgerRepository(database.pool).appendRawArtifact({ artifactId, attemptId: randomUUID(), runId, providerRef: `provider:${maker}`,
    provider: "test-layer", model: `model:${maker}`, maker, modelVersion: `model:${maker}`, rawText: "{}", metadata: {}, parseStatus: "PARSED",
    inputHash: "a".repeat(64), contractHash: "b".repeat(64), contentHash: "c".repeat(64) });
  return artifactId;
};

/**
 * One point of the debate, with its judgement and its stranger restatement: a path's root (no parent), or a point arguing for it, with its
 * edge to the root and, when `review` is given, the second AI's review (another maker), the review its trust word is worked out from.
 */
async function point(runId: string, text: string, under: Readonly<{ root: string; ordinal: number; review: "agree" | "dispute" | null }> | null): Promise<string> {
  const author = await artifact(runId, "t58-house-a");
  const nodeId = await new GraphRepository(database.pool).withGraphWrite(runId, async (writer) => {
    const added = await writer.addNode({ runId, claimType: "unknown", generationStatus: "complete", pathStatus: "active",
      explorationDecision: "continue", wayOfKnowing: "REASONING", locator: null, valueLaden: false, statementText: text,
      parentNodeId: under?.root ?? null, childKind: under === null ? null : "support", siblingOrdinal: under?.ordinal ?? 0, provenanceRef: author });
    if (under !== null) {
      await writer.addEdge({ runId, sourceNodeId: added, targetKind: "NODE", targetNodeId: under.root, targetEdgeId: null, targetEdgePolarity: null,
        polarity: "support", kind: null, strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "REVIEWER", provenanceRef: `provenance:t58:${added}` });
    }
    await writer.addStrangerRestatement({ nodeId: added, text: `${text} (restated)`, checkStatus: "PASS" });
    return added;
  });
  await database.pool.query(`
    INSERT INTO ledger.reduced_judgement (run_id, node_id, raw_artifact_ref, tau, number_kind, source_ref, producer, replay_handle,
      way_of_knowing, at_seq)
    VALUES ($1,$2,$3::uuid,0.5,'confidence',$4,'t58-house-a',$5,'REASONING',ledger.allocate_sequence())`,
  [runId, nodeId, author, `artifact:${author}`, `judgement:${randomUUID()}`]);
  if (under?.review !== undefined && under.review !== null) {
    const reviewer = await artifact(runId, "t58-house-b");
    const prepared = await withRunContentLease(database.pool, [runId], () => new JudgementRepository(database.pool).prepareNodeReview({
      runId, nodeId, authorRawArtifactRef: author, reviewRawArtifactRef: reviewer, outcome: under.review!, reasons: [`T58 ${text} reviewed.`] }));
    const client = await database.pool.connect();
    try {
      await insertPreparedNodeReview(client, prepared);
    } finally {
      client.release();
    }
  }
  return nodeId;
}

const settle = async (runId: string, workItemId?: string): Promise<void> => {
  await persistTerminalRun({ pool: database.pool, runId, fixtureKey: `t58-${randomUUID()}`, factBundle: FACTS,
    ...(workItemId === undefined ? {} : { workItemId }) });
};

const progress = () => new PostgresPathProgressRepository(runner);
const results = () => new PostgresPathResultsRepository(runner);
const step = async (runId: string, pathId: PathId, at: "FINDING_SOURCES" | "ARGUING" | "CHECKING"): Promise<void> => {
  expect(await progress().recordPathStep({ runId, pathId, step: at })).toBe("RECORDED");
};
const mark = async (runId: string, pathId: PathId, nodeId: string, what: "PUT_FORWARD" | "CHECKING" | "CHECKED" | "FOUND",
  trust: TrustWord | null = null): Promise<void> => {
  expect(await progress().recordPathPointMark({ runId, pathId, nodeId, mark: what, trust })).toBe("RECORDED");
};
const findingsOf = (run: RunProjection, pathId: string): readonly RunPathFinding[] =>
  run.path_progress!.find((entry) => entry.path_id === pathId)!.findings;

/** The served answer's points under `root` (by their edges), each with the trust word code gives it (`trustOfPoint`), those with one only. */
function trustedUnder(answer: Answer, root: string): readonly (readonly [string, string, TrustWord])[] {
  const under = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of answer.edges) {
      if (edge.target_kind === "NODE" && (edge.target_ref === root || under.has(edge.target_ref)) && !under.has(edge.from_node_ref)) {
        under.add(edge.from_node_ref);
        grew = true;
      }
    }
  }
  const free = webRanOnFree(answer.web);
  return answer.nodes.filter((node) => under.has(node.node_id)).flatMap((node): (readonly [string, string, TrustWord])[] => {
    const placed = trustOfPoint(node, { free, fell: false });
    return placed.trust === null ? [] : [[node.node_id, node.claim, placed.trust]];
  }).sort((a, b) => a[0].localeCompare(b[0]));
}

describe("Task 58: the owner's run read of a path debate serves each path's progress", () => {
  it("carries what the stores hold, fills each path in on its own, and its findings are the answer's trusted points (the drift pin)", async () => {
    const runId = await pathDebate();
    await recordPaths(runId);
    const job = await claimed(runId);
    const [rootB1, rootB2] = [await point(runId, "A second pier halves the summer wait.", null), await point(runId, "Winter riders are few.", null)];
    expect(await results().writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: rootB1, maker: "t58-house-a" })).toBe("INSERTED");
    expect(await results().writePathRoot({ runId, pathId: "b2", rootIndex: 1, rootNodeId: rootB2, maker: "t58-house-a" })).toBe("INSERTED");
    const p11 = await point(runId, "The July queue runs to forty minutes.", { root: rootB1, ordinal: 1, review: "agree" });
    const p12 = await point(runId, "Two piers need two crews.", { root: rootB1, ordinal: 2, review: "dispute" });
    await point(runId, "The ferry office keeps no counts.", { root: rootB1, ordinal: 3, review: null });
    const p21 = await point(runId, "January carries a tenth of July.", { root: rootB2, ordinal: 1, review: "agree" });
    const p22 = await point(runId, "The school run fills one boat a day.", { root: rootB2, ordinal: 2, review: "agree" });

    // The first web search and arguing: b1 finds sources, b2 argues two points, one of them being checked; b3 has not begun.
    await step(runId, "b1", "FINDING_SOURCES");
    await step(runId, "b2", "FINDING_SOURCES");
    await step(runId, "b2", "ARGUING");
    await mark(runId, "b2", p21, "PUT_FORWARD");
    await mark(runId, "b2", p22, "PUT_FORWARD");
    await mark(runId, "b2", p22, "CHECKING");
    const first = await runRead(runId);
    expect(first.state).toBe("RUNNING");
    expect(first.path_progress).toEqual([
      { path_id: "b1", step: "FINDING_SOURCES", points: [], findings: [] },
      { path_id: "b2", step: "ARGUING", points: ["PUT_FORWARD", "BEING_CHECKED"], findings: [] },
      { path_id: "b3", step: null, points: [], findings: [] }
    ]);
    expect(first.branches!.paths.map((entry) => [entry.path_id, entry.state, entry.title])).toEqual([
      ["b1", "LOOKING", "The queues"], ["b2", "LOOKING", "Winter"], ["b3", "LOOKING", "The harbour floor"]]);
    expect(first).not.toHaveProperty("carry_on_part");

    // b1's checks end: its two trusted points are found and its answer so far is stored; b2 is still arguing, the debate still runs.
    await step(runId, "b1", "ARGUING");
    for (const nodeId of [p11, p12]) {
      await mark(runId, "b1", nodeId, "PUT_FORWARD");
      await mark(runId, "b1", nodeId, "CHECKED");
    }
    await mark(runId, "b1", p11, "FOUND", "SURE_FOR_CASE");
    await mark(runId, "b1", p12, "FOUND", "STILL_ARGUED");
    expect(await results().recordPathOutcome({ runId, pathId: "b1", outcome: outcomeFixture("READY") })).toBe("RECORDED");
    const second = await runRead(runId);
    expect(second.state).toBe("RUNNING");
    expect(second.branches!.paths.map((entry) => [entry.path_id, entry.state])).toEqual([["b1", "ARGUED"], ["b2", "LOOKING"], ["b3", "LOOKING"]]);
    expect(second.path_progress).toEqual([
      { path_id: "b1", step: null, points: [], findings: [
        { node_ref: p11, text: "The July queue runs to forty minutes.", trust: "SURE_FOR_CASE" },
        { node_ref: p12, text: "Two piers need two crews.", trust: "STILL_ARGUED" }] },
      { path_id: "b2", step: "ARGUING", points: ["PUT_FORWARD", "BEING_CHECKED"], findings: [] },
      { path_id: "b3", step: null, points: [], findings: [] }
    ]);

    // b2 fills in, b3 could not finish; the debate still runs until its main answer is served.
    await mark(runId, "b2", p22, "CHECKED");
    await mark(runId, "b2", p21, "FOUND", "SURE_FOR_CASE");
    await mark(runId, "b2", p22, "FOUND", "SURE_FOR_CASE");
    expect(await results().recordPathOutcome({ runId, pathId: "b2", outcome: outcomeFixture("READY") })).toBe("RECORDED");
    expect(await results().recordPathOutcome({ runId, pathId: "b3", outcome: outcomeFixture("FAILED") })).toBe("RECORDED");
    const last = await runRead(runId);
    expect(last.state).toBe("RUNNING");
    expect(last.branches!.paths.map((entry) => entry.state)).toEqual(["ARGUED", "ARGUED", "FAILED"]);
    expect(findingsOf(last, "b3")).toEqual([]);

    await settle(runId, job);
    const settled = await runRead(runId);
    expect(settled.state).toBe("SETTLED");
    expect(settled.path_progress!.map((entry) => entry.findings)).toEqual(last.path_progress!.map((entry) => entry.findings));

    // The drift pin: what the run read showed while it ran is what the served answer shows, node for node and word for word.
    const answer = (await application().readRunAnswer(runId, SESSION, OWNER()))!;
    AnswerSchema.parse(answer);
    expect(answer.branches!.paths.map((entry) => [entry.path_id, entry.root_node_id])).toEqual([["b1", rootB1], ["b2", rootB2], ["b3", null]]);
    for (const [pathId, root] of [["b1", rootB1], ["b2", rootB2]] as const) {
      const shown = findingsOf(last, pathId).map((finding) => [finding.node_ref, finding.text, finding.trust] as const)
        .sort((a, b) => a[0].localeCompare(b[0]));
      expect(shown, pathId).toEqual(trustedUnder(answer, root));
      expect(shown.length, pathId).toBeGreaterThan(0);
    }
    expect(answer).not.toHaveProperty("carry_on_part");
  });

  it("a path debate whose paths are not named yet: no paths, no progress to show, and no carry-on part without the box", async () => {
    const runId = await pathDebate(false);
    const run = await runRead(runId);
    expect(run.path_progress).toEqual([]);
    expect(run).not.toHaveProperty("branches");
    expect(run).not.toHaveProperty("carry_on_part");
  });

  it("asked with the box (Task 57b, \"Show it from the start\"): on its answer from the first read, while the AIs choose the paths", async () => {
    const runId = await pathDebate(true);
    const queued = await runRead(runId);
    expect(queued.state).toBe("QUEUED");
    expect(queued).toMatchObject({ path_progress: [], carry_on_part: "ANSWER" });
    expect(queued).not.toHaveProperty("branches");
    await claimed(runId);
    const running = await runRead(runId);
    expect(running.state).toBe("RUNNING");
    expect(running).toMatchObject({ path_progress: [], carry_on_part: "ANSWER" });
    expect(running).not.toHaveProperty("branches");
  });

  it("a ticked debate: its answer, then the digs on the run read and the answer alike, then the report while it is written", async () => {
    const runId = await pathDebate(true);
    await recordPaths(runId, true);
    const job = await claimed(runId);
    for (const [no, state] of [[1, "READY"], [2, "READY"], [3, "FAILED"]] as const) {
      expect(await results().recordPathOutcome({ runId, pathId: `b${no}`, outcome: outcomeFixture(state) })).toBe("RECORDED");
    }
    const running = await runRead(runId);
    expect(running.branches!.carry_on_to_report).toBe(true);
    expect(running.carry_on_part).toBe("ANSWER");

    await settle(runId, job);
    expect((await runRead(runId)).carry_on_part).toBe("DIGS");
    const answer = (await application().readRunAnswer(runId, SESSION, OWNER()))!;
    AnswerSchema.parse(answer);
    expect(answer.carry_on_part).toBe("DIGS");
    // The carry-on is due and begun (0159's marks, the runner's login): still the digs.
    const marks = new PostgresStartPathsStore(runner);
    expect(await marks.recordCarryOnDue(runId)).toBe("RECORDED");
    expect((await marks.claimCarryOnDue(10)).map((due) => due.runId)).toContain(runId);
    expect((await runRead(runId)).carry_on_part).toBe("DIGS");

    // "Write my report" closes the investigation: its first version is being written (0133's closing, the API's login).
    const investigations = new PostgresInvestigationRepository(api);
    const investigationId = await investigations.open(owner.ownerRef, runId);
    expect(investigationId).not.toBeNull();
    expect(await investigations.close(owner.ownerRef, investigationId!)).toMatchObject({ outcome: "CLOSED", reportVersion: 1 });
    expect((await runRead(runId)).carry_on_part).toBe("REPORT");
    expect((await application().readRunAnswer(runId, SESSION, OWNER()))!.carry_on_part).toBe("REPORT");
  });

  it("a ticked debate whose carry-on ended with nothing pressed: no part", async () => {
    const runId = await pathDebate(true);
    await recordPaths(runId, true);
    for (const [no, state] of [[1, "READY"], [2, "FAILED"], [3, "FAILED"]] as const) {
      expect(await results().recordPathOutcome({ runId, pathId: `b${no}`, outcome: outcomeFixture(state) })).toBe("RECORDED");
    }
    await settle(runId);
    const marks = new PostgresStartPathsStore(runner);
    expect(await marks.recordCarryOnDue(runId)).toBe("RECORDED");
    expect((await marks.claimCarryOnDue(10)).map((due) => due.runId)).toContain(runId);
    expect(await marks.recordCarryOnDone(runId)).toBe("RECORDED");
    const run = await runRead(runId);
    expect(run.branches!.carry_on_to_report).toBe(true);
    expect(run).not.toHaveProperty("carry_on_part");
    expect(await application().readRunAnswer(runId, SESSION, OWNER())).not.toHaveProperty("carry_on_part");
  });

  it("an R22 debate's read and a stranger's carry none of it", async () => {
    const runId = await createEncryptedStoryRun(database.pool, owner, QUESTION);
    const run = await runRead(runId);
    for (const key of ["branches", "path_progress", "carry_on_part"]) expect(run, key).not.toHaveProperty(key);
    await settle(runId);
    const settled = await runRead(runId);
    for (const key of ["branches", "path_progress", "carry_on_part"]) expect(settled, key).not.toHaveProperty(key);

    const theirs = await pathDebate(true);
    await recordPaths(theirs, true);
    expect(await application().readRun(theirs, SESSION, STRANGER())).toBeNull();
    expect(await new ServeRepository(api).readRunPathProgress(theirs, STRANGER())).toBeNull();
    expect(await new ServeRepository(api).readRunBranches(theirs, STRANGER())).toBeNull();
  });
});
