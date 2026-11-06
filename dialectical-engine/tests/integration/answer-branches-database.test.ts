// tests/integration/answer-branches-database.test.ts
// V4 start step, Task 58 (spec 2026-11-03 §2 items 7 and 8, §4.3; items map-d2, journey-f1, wait-d1): a path debate's paths as the run read
// and the served answer give them, on real PostgreSQL. The chosen paths (0158), each path's root and answer so far (0159) are written
// through the runner's own login and stores, the web step's rows through the runner's own store and key; the reads go through
// ServeRepository on the API's login. Pinned: before any root the run read names every path LOOKING with its title; the served answer
// names each path's state from its outcome (ARGUED, FAILED, FAILED) and its web path by its path id ("b1"), also inside a caller's lease
// (the publication's read); an R22 debate has no paths and its answer no `branches` key; a stranger reads none. Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnswerBranchesSchema, AnswerSchema, type Answer } from "@debateai/contract";
import {
  PostgresPathResultsRepository, PostgresStartPathsStore, RunRepository, WEB_EVIDENCE_CARRIERS, configureContentEncryption, contentCipherFor,
  createPool, migrate, withRunContentLease, type Pool, type StoredStartPath
} from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { LedgerRepository } from "@debateai/ledger";
import {
  DEBATE_SHAPE_V2_FORMULA_VERSION, debateShapePolicyStartValues, debateShapeReceiptV2, debateShapeSiteCountsV2, resolveDebateShapeV2
} from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import { postgresWebPlanStatusRecorder, postgresWebStepPorts, webStepRowId } from "../../apps/runner/src/web-step.js";
import { outcomeFixture } from "../support/branchesFixture.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";
import { provisionRlsLogins, type RlsLogins } from "../support/rls-logins.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let logins: RlsLogins | undefined;
let runner: Pool;
let api: Pool;
let owner: StoryEncryptedOwner;

const QUESTION = "Should Harbour Town build a second ferry pier?";
const PATHS: readonly StoredStartPath[] = [
  { pathId: "b1", pathNo: 1, author: "AI_SUGGESTION", title: "The queues", question: "Would a second pier cut the queues?",
    viewpoints: [{ viewpointId: null, pickNo: null, title: "The queues", question: "Would a second pier cut the queues?", own: false }], ownWords: [] },
  { pathId: "b2", pathNo: 2, author: "AI_SUGGESTION", title: "Winter", question: "Does winter ridership fall?",
    viewpoints: [{ viewpointId: null, pickNo: null, title: "Winter", question: "Does winter ridership fall?", own: false }], ownWords: [] },
  { pathId: "b3", pathNo: 3, author: "AI_SUGGESTION", title: "The harbour floor", question: "Who pays for the dredging?",
    viewpoints: [{ viewpointId: null, pickNo: null, title: "The harbour floor", question: "Who pays for the dredging?", own: false }], ownWords: [] }
];
const FACTS = { facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"], reversalPoint: "none",
  buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null } as const;
const OWNER = () => ({ ownerRef: owner.ownerRef, legacyAskerId: null });
const STRANGER = () => ({ ownerRef: randomUUID(), legacyAskerId: null });

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

/** A path debate of the owner's: a sealed debate admitted with shape receipt v2 (3 paths, built by the run), as admission writes it. */
function pathDebate(): Promise<string> {
  const shape = resolveDebateShapeV2(debateShapePolicyStartValues(), "plus",
    { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard", paths: 3, pathsSource: "RUN_BUILT" }, 4);
  return new RunRepository(database.pool).startRun({
    questionLine: QUESTION, askContract: { audience: "t58-branches" },
    principal: { kind: "server", userId: owner.userId, ownerRef: owner.ownerRef }, sessionId: owner.sessionId, callerScope: "ASKER",
    asOf: new Date("2026-11-05T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER",
    tierProvenanceRef: "t58:branches", compositionBudgetTier: "low", depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1, registerVersion: 1, releaseKey: TEST_RELEASE_KEY, batteryVersion: "t58:branches", batteryRows: [],
    envelopeBasis: { ...fixtureStructuralCeiling(10), formula_version: DEBATE_SHAPE_V2_FORMULA_VERSION,
      shape: debateShapeReceiptV2(shape, debateShapeSiteCountsV2(shape, 1), 0) }
  });
}

/** The runner names the debate's three paths (0158, the runner's login). */
async function recordPaths(runId: string): Promise<void> {
  expect(await new PostgresStartPathsStore(runner).recordStartPaths({ runId, source: "RUN_BUILT", width: 3, chosenBy: "AIS",
    carryOnToReport: false, paths: PATHS, menu: null })).toBe("RECORDED");
}

/** One root the debate argued, with its judgement and its stranger restatement (web-plan-serve-database.test.ts's copy). */
async function root(runId: string, label: string): Promise<string> {
  const artifactId = randomUUID();
  await new LedgerRepository(database.pool).appendRawArtifact({
    artifactId, attemptId: randomUUID(), runId, providerRef: "provider:house-a", provider: "test-layer", model: "model:house-a",
    maker: "house-a", modelVersion: "model:house-a", rawText: "{}", metadata: {}, parseStatus: "PARSED",
    inputHash: "a".repeat(64), contractHash: "b".repeat(64), contentHash: "c".repeat(64)
  });
  const nodeId = await new GraphRepository(database.pool).withGraphWrite(runId, async (writer) => {
    const added = await writer.addNode({
      runId, claimType: "unknown", generationStatus: "complete", pathStatus: "active", explorationDecision: "continue",
      wayOfKnowing: "REASONING", locator: null, valueLaden: false, statementText: `${label} root`, parentNodeId: null,
      childKind: null, siblingOrdinal: 0, provenanceRef: artifactId
    });
    await writer.addStrangerRestatement({ nodeId: added, text: `${label} restated`, checkStatus: "PASS" });
    return added;
  });
  await database.pool.query(`
    INSERT INTO ledger.reduced_judgement (run_id, node_id, raw_artifact_ref, tau, number_kind, source_ref, producer, replay_handle,
      way_of_knowing, at_seq)
    VALUES ($1,$2,$3::uuid,0.5,'confidence',$4,'house-a',$5,'REASONING',ledger.allocate_sequence())`,
  [runId, nodeId, artifactId, `artifact:${artifactId}`, `judgement:${randomUUID()}`]);
  return nodeId;
}

/** b1's web step as a path debate stores it, under its path id: the planner's decision and one FOUND search with its page. */
async function searchedB1(runId: string): Promise<void> {
  const ports = await postgresWebStepPorts(database.pool, runId);
  try {
    const { store, cipher } = ports;
    await postgresWebPlanStatusRecorder(database.pool)(runId, [{ pathId: "b1", status: "PLANNED", reason: null, searchesToSend: 1 }], cipher);
    const searchId = webStepRowId(runId, "search", "b1", "for");
    expect(await store.recordSearch({ runId, searchId, pathRef: "b1", side: "for", languageKind: "english", language: "en",
      country: null, lookBack: "3y", outcome: "FOUND", chargeMicros: 1_000, resultCount: 1,
      words: cipher.seal(WEB_EVIDENCE_CARRIERS.search, searchId, { query: "harbour town ferry queues" }) })).toBe("RECORDED");
    const pageId = webStepRowId(runId, "page", "b1");
    expect(await store.recordPage({ runId, pageId, searchId, rank: 1, readDepth: "whole", text: null,
      about: cipher.seal(WEB_EVIDENCE_CARRIERS.page, pageId, { url: "https://news.example.org/t58-queues", site: "news.example.org",
        title: "Ferry queues", date: "2026-10-30" }) })).toBe("RECORDED");
  } finally {
    await ports.close();
  }
}

const settle = async (runId: string): Promise<void> => {
  await persistTerminalRun({ pool: database.pool, runId, fixtureKey: `t58-${randomUUID()}`, factBundle: FACTS });
};

const servedAnswer = async (runId: string): Promise<Answer> => {
  const answer = await new ServeRepository(api).readRunAnswerProjection(runId, OWNER());
  expect(answer).not.toBeNull();
  AnswerSchema.parse(answer);
  return answer!;
};

describe("Task 58: a path debate's paths in the run read and the served answer", () => {
  it("the run read before any root: every path LOOKING, with its title, in the person's order", async () => {
    const runId = await pathDebate();
    await recordPaths(runId);
    const branches = await new ServeRepository(api).readRunBranches(runId, OWNER());
    expect(branches).not.toBeNull();
    AnswerBranchesSchema.parse(branches);
    expect(branches!.paths.map((path) => [path.path_id, path.order, path.state, path.title, path.root_node_id, path.outcome])).toEqual([
      ["b1", 1, "LOOKING", "The queues", null, null],
      ["b2", 2, "LOOKING", "Winter", null, null],
      ["b3", 3, "LOOKING", "The harbour floor", null, null]
    ]);
    expect(branches).toMatchObject({ source: "RUN_BUILT", width: 3, more: [], also_raised: [], main_trust: null, carry_on_to_report: false });
  });

  it("the served answer: each path's state from its outcome, its root, and its web path named by its path id", async () => {
    const runId = await pathDebate();
    await recordPaths(runId);
    const results = new PostgresPathResultsRepository(runner);
    const [rootB1, rootB2] = [await root(runId, "b1"), await root(runId, "b2")];
    expect(await results.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: rootB1, maker: "house-a" })).toBe("INSERTED");
    expect(await results.writePathRoot({ runId, pathId: "b2", rootIndex: 1, rootNodeId: rootB2, maker: "house-a" })).toBe("INSERTED");
    expect(await results.recordPathOutcome({ runId, pathId: "b1", outcome: outcomeFixture("READY") })).toBe("RECORDED");
    expect(await results.recordPathOutcome({ runId, pathId: "b2", outcome: outcomeFixture("FAILED") })).toBe("RECORDED");
    expect(await results.recordPathOutcome({ runId, pathId: "b3", outcome: outcomeFixture("FAILED") })).toBe("RECORDED");
    await searchedB1(runId);
    // While it runs, the run read says the same of each path: its outcome is stored.
    expect((await new ServeRepository(api).readRunBranches(runId, OWNER()))!.paths.map((path) => path.state)).toEqual(["ARGUED", "FAILED", "FAILED"]);
    await settle(runId);

    const answer = await servedAnswer(runId);
    expect(answer.branches!.paths.map((path) => [path.path_id, path.state, path.root_node_id])).toEqual([
      ["b1", "ARGUED", rootB1], ["b2", "FAILED", rootB2], ["b3", "FAILED", null]]);
    expect(answer.branches!.paths[0]!.outcome).toEqual(outcomeFixture("READY"));
    expect(answer.web!.paths.map((path) => [path.position_ref, path.search.status])).toEqual([["b1", "SEARCHED"]]);
    // The answer spreads its paths after the dig model's members: the last key of an answer no dig touched.
    expect(Object.keys(answer).at(-1)).toBe("branches");

    // The publication reads the owner's answer inside its own lease on the debate: the paths are still there (Task 63 publishes them).
    const leased = await withRunContentLease(api, [runId], () => new ServeRepository(api).readRunAnswerProjection(runId, OWNER()));
    expect(leased!.branches).toEqual(answer.branches);
    expect(leased!.web!.paths.map((path) => path.position_ref)).toEqual(["b1"]);
  });

  it("an R22 debate: no paths in its run read, and no branches key on its answer", async () => {
    const runId = await createEncryptedStoryRun(database.pool, owner, QUESTION);
    expect(await new ServeRepository(api).readRunBranches(runId, OWNER())).toBeNull();
    expect(await new ServeRepository(api).readRunPathProgress(runId, OWNER())).toBeNull();
    await settle(runId);
    const answer = await servedAnswer(runId);
    expect(answer).not.toHaveProperty("branches");
    expect(answer).not.toHaveProperty("carry_on_part");
  });

  it("a stranger reads none of another person's paths", async () => {
    const runId = await pathDebate();
    await recordPaths(runId);
    const serve = new ServeRepository(api);
    expect(await serve.readRunBranches(runId, OWNER())).not.toBeNull();
    expect(await serve.readRunBranches(runId, STRANGER())).toBeNull();
    expect(await serve.readRunPathProgress(runId, OWNER())).not.toBeNull();
    expect(await serve.readRunPathProgress(runId, STRANGER())).toBeNull();
    await settle(runId);
    expect(await serve.readRunAnswerProjection(runId, STRANGER())).toBeNull();
  });
});
