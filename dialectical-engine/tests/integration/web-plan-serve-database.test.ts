import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnswerSchema } from "@debateai/contract";
import { PostgresWebEvidenceRepository, WEB_EVIDENCE_CARRIERS, migrate, readMapRootsInForce } from "@debateai/db";
import { GraphRepository, type RetireClaimFence } from "@debateai/graph";
import { LedgerRepository } from "@debateai/ledger";
import { MapChoiceRepository } from "@debateai/map";
import { ServeRepository, webPathRefOfPosition, webPathRootsOf } from "@debateai/serve";
import {
  postgresWebPlanStatusRecorder, postgresWebStepPorts, webPlanPathRecords, webStepRowId
} from "../../apps/runner/src/web-step.js";
import type { WebPlanPathStatus } from "../../apps/runner/src/web-planner.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * W3-6 on real PostgreSQL (Perplexity plan 2026-10-30): the web step's rows (0132) and the planner's per-path decision
 * (0134) reach the served answer. One encrypted debate of four map answers: a1 searched, its root re-pointed after a
 * take-over (0119); a2 planned no search, with a reason; a3 switched off; a4 not on the plan and never rooted. Every row
 * goes through the real repositories and the runner's own store and key (postgresWebStepPorts), the answer through
 * ServeRepository. Pinned: each path is named by its root node id in force, never the answer id; NO_SEARCH_PLANNED comes
 * with its reason opened (kept sealed in the row); SWITCHED_OFF reaches the page; an unrooted path is left out; a second
 * plan write answers ALREADY and changes nothing. Pages are made up.
 */
let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;

const REASON = "W36_DISTINCTIVE_REASON only what the town values is weighed here.";

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 240_000);

afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

/** A claim the runner holds on the run: the fence `retireNodes` checks (tests/integration/reclaim-resume-database.test.ts). */
async function heldClaim(runId: string): Promise<RetireClaimFence> {
  const row = (await database.pool.query<{ work_item_id: string; claim_deadline: Date }>(
    `INSERT INTO core.work_item (run_id, battery_row_id, node_set, command_key, state, claimed_by, claim_deadline, created_at_seq)
     VALUES ($1,'Q1','[]'::jsonb,$2,'CLAIMED','runner:w36-test',clock_timestamp() + interval '10 minutes',ledger.allocate_sequence())
     RETURNING work_item_id::text, claim_deadline`, [runId, `w36-test:${randomUUID()}`])).rows[0]!;
  return Object.freeze({ workItemId: row.work_item_id, workerId: "runner:w36-test", heldUntil: row.claim_deadline, claimMs: 600_000 });
}

/** One root the debate argued for an answer, with its reply and its judgement (reclaim-resume-database.test.ts's copy). */
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

/** a1's web step as W3-1 stores it, sealed under the run's key: one FOUND search, its top page and one other page. */
async function searchedPath(runId: string): Promise<void> {
  const ports = await postgresWebStepPorts(database.pool, runId);
  try {
    const { store, cipher } = ports;
    const searchId = webStepRowId(runId, "search", "a1", "for");
    expect(await store.recordSearch({ runId, searchId, pathRef: "a1", side: "for", languageKind: "english", language: "en",
      country: null, lookBack: "3y", outcome: "FOUND", chargeMicros: 1_000, resultCount: 2,
      words: cipher.seal(WEB_EVIDENCE_CARRIERS.search, searchId, { query: "harbour town ferry riders" }) })).toBe("RECORDED");
    const pages = ["top", "other"].map((kind) => webStepRowId(runId, "page", kind));
    for (const [rank, pageId] of pages.entries()) {
      expect(await store.recordPage({ runId, pageId, searchId, rank: rank + 1, readDepth: "whole", text: null,
        about: cipher.seal(WEB_EVIDENCE_CARRIERS.page, pageId, { url: `https://news.example.org/ferry-${String(rank + 1)}`,
          site: "news.example.org", title: `Ferry riders ${String(rank + 1)}`, date: "2026-09-30" }) })).toBe("RECORDED");
    }
    expect(await store.recordPicks(runId, "a1", [pages[0]!])).toBe("RECORDED");
  } finally {
    await ports.close();
  }
}

/** The planner's decision, through the runner's own store and the step's key (one lease, closed after). */
async function recordPlan(runId: string, statuses: readonly WebPlanPathStatus[]): Promise<void> {
  const ports = await postgresWebStepPorts(database.pool, runId);
  try {
    await postgresWebPlanStatusRecorder(database.pool)(runId, statuses, ports.cipher);
  } finally {
    await ports.close();
  }
}

const PLAN: readonly WebPlanPathStatus[] = Object.freeze([
  { pathId: "a1", status: "PLANNED", reason: null, searchesToSend: 1 },
  { pathId: "a2", status: "NO_SEARCH_PLANNED", reason: REASON, searchesToSend: 0 },
  { pathId: "a3", status: "SWITCHED_OFF", reason: null, searchesToSend: 0 },
  { pathId: "a4", status: "NOT_ON_PLAN", reason: null, searchesToSend: 0 }
]);

describe("W3-6 the web plan and the web rows reach the served answer", () => {
  it("names each path by its root in force, opens NO_SEARCH_PLANNED's reason, serves SWITCHED_OFF, leaves out an unrooted path; a replay is ALREADY", async () => {
    const runId = await createEncryptedStoryRun(database.pool, owner!, `w36 web plan ${randomUUID()}`);
    const map = new MapChoiceRepository(database.pool);

    // The map's roots: a1's first root is set aside by a take-over and re-pointed to the new copy's; a4 never has one.
    const deadA1 = await root(runId, "a1 dead");
    expect(await map.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId: deadA1, maker: "maker-0" })).toBe("INSERTED");
    const liveA1 = await root(runId, "a1 live");
    const rootA2 = await root(runId, "a2");
    const rootA3 = await root(runId, "a3");
    expect(await new GraphRepository(database.pool).retireNodes(runId, [liveA1, rootA2, rootA3], await heldClaim(runId))).toBe(1);
    expect(await map.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId: liveA1, maker: "maker-1" })).toBe("REPOINTED");
    expect(await map.writeMapPosition({ runId, answerId: "a2", rootIndex: 1, rootNodeId: rootA2, maker: "maker-1" })).toBe("INSERTED");
    expect(await map.writeMapPosition({ runId, answerId: "a3", rootIndex: 2, rootNodeId: rootA3, maker: "maker-0" })).toBe("INSERTED");

    // The web step: the decision first (before any search), then a1's search and pages.
    await recordPlan(runId, PLAN);
    await searchedPath(runId);
    // The reason is kept sealed: the row holds an envelope, never the text.
    const rows = (await database.pool.query<{ path_ref: string; status: string; sealed: string | null }>(
      `SELECT path_ref, status, content_ciphertext::text AS sealed FROM identity.web_plan_path WHERE run_id=$1 ORDER BY path_ref`, [runId])).rows;
    expect(rows.map((row) => [row.path_ref, row.status, row.sealed !== null])).toEqual([
      ["a1", "PLANNED", false], ["a2", "NO_SEARCH_PLANNED", true], ["a3", "SWITCHED_OFF", false], ["a4", "NOT_ON_PLAN", false]]);
    expect(rows[1]!.sealed).not.toContain("W36_DISTINCTIVE_REASON");

    // A run claimed again writes the same decision again: ALREADY, and the first stays (even a different word changes nothing).
    const ports = await postgresWebStepPorts(database.pool, runId);
    try {
      const repository = new PostgresWebEvidenceRepository(database.pool);
      expect(await repository.recordPlanStatuses(runId, webPlanPathRecords(PLAN, ports.cipher))).toBe("ALREADY");
      expect(await repository.recordPlanStatuses(runId, webPlanPathRecords(PLAN.map((entry) =>
        ({ ...entry, status: "FAILED" as const, reason: null, searchesToSend: 0 })), null))).toBe("ALREADY");
      await expect(postgresWebPlanStatusRecorder(database.pool)(runId, PLAN, ports.cipher)).resolves.toBeUndefined();
    } finally {
      await ports.close();
    }
    expect((await new PostgresWebEvidenceRepository(database.pool).readPlanStatuses(runId))!.map((row) => [row.pathRef, row.status]))
      .toEqual([["a1", "PLANNED"], ["a2", "NO_SEARCH_PLANNED"], ["a3", "SWITCHED_OFF"], ["a4", "NOT_ON_PLAN"]]);

    const { answerId } = await persistTerminalRun({ pool: database.pool, runId, fixtureKey: `w36-${randomUUID()}`,
      factBundle: { facts: ["w36-fact"], residualObjections: [], badges: [], conditionMarks: ["DEFECT"], reversalPoint: "w36-reversal",
        buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null } });
    const answer = await new ServeRepository(database.pool).readAnswerProjection(answerId, { ownerRef: owner!.ownerRef, legacyAskerId: null });
    expect(answer).not.toBeNull();
    expect(answer!.web!.paths.map((path) => [path.position_ref, path.search])).toEqual([
      [liveA1, { status: "SEARCHED" }],
      [rootA2, { status: "NO_SEARCH_PLANNED", reason: REASON }],
      [rootA3, { status: "SWITCHED_OFF" }]
    ]);
    expect(answer!.web!.paths[0]!.other_pages.map((page) => [page.title, page.link]))
      .toEqual([["Ferry riders 2", "https://news.example.org/ferry-2"]]);
    // Never the answer id, never the set-aside root.
    expect(JSON.stringify(answer!.web)).not.toMatch(/"a[1-4]"/u);
    expect(JSON.stringify(answer!.web)).not.toContain(deadA1);
    AnswerSchema.parse(answer);

    // "Add to researched" (W4-4) goes back from the served root to the stored path.
    const roots = webPathRootsOf(await readMapRootsInForce(database.pool, runId));
    expect(answer!.web!.paths.map((path) => webPathRefOfPosition(path.position_ref, roots))).toEqual(["a1", "a2", "a3"]);
    expect(webPathRefOfPosition(deadA1, roots)).toBeNull();
  });
});
