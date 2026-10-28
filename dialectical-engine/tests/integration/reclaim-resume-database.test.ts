import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { GraphRepository, type RetireClaimFence } from "@debateai/graph";
import { JudgementRepository } from "@debateai/judgement";
import { LedgerRepository } from "@debateai/ledger";
import { MapChoiceRepository, type MapResult } from "@debateai/map";
import { ServeRepository } from "@debateai/serve";
import { recordNodeReviewAlone } from "../support/unsafeReviewWrites.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun,
  createLegacyStoryRun,
  provisionStoryEncryptedOwner,
  releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Reclaim resume, the database layer (spec docs/superpowers/specs/2026-10-14-reclaim-resume-design.md, "The database
 * change"; migration 0119). A copy that takes a run over after a crash sets the dead copy's nodes aside
 * (generation_status 'stale') instead of deleting them, and moves each map answer's root from a stale root to its own.
 * Pinned here on real PostgreSQL: what the runtime role may and may not do to core.node and to the map's re-point
 * table, GraphRepository.retireNodes, MapChoiceRepository.writeMapPosition's REPOINTED, and that every reader of the
 * debate ignores a stale copy that shares its author reply (provenance_ref) with a live node.
 * Integration suites are skipped by the CI gate: run this file by hand, alone.
 */

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;

/**
 * The runner's own login (row-level security S01): debateai_runtime and the marker role debateai_rls_all_accounts, a
 * system twin as deploy/postgres/hardening.sql and the dev runner login grant it. The bare debateai_runtime role, with
 * no account context, sees no node of any run (its own cases below).
 */
const RUNNER_TWIN = "reclaim_runner";

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await createSystemTwin(database, RUNNER_TWIN, ["debateai_runtime"]);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 240_000);

afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

const marker = (): string => `RECLAIM${randomUUID().replaceAll("-", "")}`;
const legacyRun = (): Promise<string> => createLegacyStoryRun(database.pool, `reclaim resume ${marker()}`, `asker:${marker()}`);
function encryptedRun(): Promise<string> {
  if (owner === undefined) throw new Error("RECLAIM_TEST_OWNER_UNPROVISIONED");
  return createEncryptedStoryRun(database.pool, owner, `reclaim resume ${marker()}`);
}

const CLAIM_MS = 600_000;
const claims = new Map<string, RetireClaimFence>();
/**
 * A work item of the run, CLAIMED by a test worker for ten minutes — the claim a copy holds while it argues, and the
 * fence `retireNodes` checks (the same one for every call on the run, as one copy's would be).
 */
async function heldClaim(runId: string): Promise<RetireClaimFence> {
  const known = claims.get(runId);
  if (known !== undefined) return known;
  const row = (await database.pool.query<{ work_item_id: string; claim_deadline: Date }>(
    `INSERT INTO core.work_item (run_id, battery_row_id, node_set, command_key, state, claimed_by, claim_deadline, created_at_seq)
     VALUES ($1,'Q1','[]'::jsonb,$2,'CLAIMED','runner:reclaim-test',clock_timestamp() + make_interval(secs => $3),ledger.allocate_sequence())
     RETURNING work_item_id::text, claim_deadline`, [runId, `reclaim-test:${randomUUID()}`, CLAIM_MS / 1_000])).rows[0]!;
  const fence = Object.freeze({ workItemId: row.work_item_id, workerId: "runner:reclaim-test", heldUntil: row.claim_deadline, claimMs: CLAIM_MS });
  claims.set(runId, fence);
  return fence;
}

/** `sql` as the runner's own login (RUNNER_TWIN: debateai_runtime and the marker role), in its own transaction. */
const asRuntime = <T>(sql: string, values: readonly unknown[] = []) => asRole<T>(RUNNER_TWIN, sql, values);
/** `sql` as the bare debateai_runtime role, with no account context, in its own transaction. */
const asBareRuntime = <T>(sql: string, values: readonly unknown[] = []) => asRole<T>("debateai_runtime", sql, values);

async function asRole<T>(role: string, sql: string, values: readonly unknown[]): Promise<{ rowCount: number; rows: T[] }> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    const result = await client.query(sql, [...values]);
    await client.query("COMMIT");
    return { rowCount: result.rowCount ?? 0, rows: result.rows as T[] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** A raw artifact attributable to one maker (tests/integration/t06-review-teeth-database.test.ts's fixture). */
async function artifact(runId: string, maker: string): Promise<string> {
  const artifactId = randomUUID();
  await new LedgerRepository(database.pool).appendRawArtifact({
    artifactId, attemptId: randomUUID(), runId, providerRef: `provider:${maker}`,
    provider: "test-layer", model: `model:${maker}`, maker, modelVersion: `model:${maker}`,
    rawText: "{}", metadata: {}, parseStatus: "PARSED",
    inputHash: "a".repeat(64), contractHash: "b".repeat(64), contentHash: "c".repeat(64)
  });
  return artifactId;
}

async function recordTau(runId: string, nodeId: string, rawArtifactRef: string, producer: string): Promise<void> {
  await database.pool.query(`
    INSERT INTO ledger.reduced_judgement (
      run_id, node_id, raw_artifact_ref, tau, number_kind, source_ref,
      producer, replay_handle, way_of_knowing, at_seq
    ) VALUES ($1,$2,$3::uuid,0.5,'confidence',$4,$5,$6,'REASONING',ledger.allocate_sequence())
  `, [runId, nodeId, rawArtifactRef, `artifact:${rawArtifactRef}`, producer, `judgement:${randomUUID()}`]);
}

type Copy = Readonly<{ root: string; child: string; edge: string }>;

/**
 * One copy of a small debate: a root and one supporting child, each with its judgement and stranger restatement, the
 * child's edge to the root. Both copies of a run are saved from the SAME author replies (`authors`), as a resumed copy
 * replays the dead copy's recorded answers.
 */
async function saveCopy(runId: string, authors: Readonly<{ root: string; child: string }>, label: string): Promise<Copy> {
  const graph = new GraphRepository(database.pool);
  const copy = await graph.withGraphWrite(runId, async (writer) => {
    const node = (parentNodeId: string | null, provenanceRef: string, text: string) => writer.addNode({
      runId, claimType: "unknown", generationStatus: "complete", pathStatus: "active", explorationDecision: "continue",
      wayOfKnowing: "REASONING", locator: null, valueLaden: false, statementText: text, parentNodeId,
      childKind: parentNodeId === null ? null : "support", siblingOrdinal: parentNodeId === null ? 0 : 1, provenanceRef
    });
    const root = await node(null, authors.root, `${label} root`);
    const child = await node(root, authors.child, `${label} child`);
    const edge = await writer.addEdge({
      runId, sourceNodeId: child, targetKind: "NODE", targetNodeId: root, targetEdgeId: null, targetEdgePolarity: null,
      polarity: "support", kind: null, strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "REVIEWER",
      provenanceRef: `provenance:${label}:${child}`
    });
    for (const nodeId of [root, child]) await writer.addStrangerRestatement({ nodeId, text: `${label} restated`, checkStatus: "PASS" });
    return { root, child, edge };
  });
  await recordTau(runId, copy.root, authors.root, "house-a");
  await recordTau(runId, copy.child, authors.child, "house-a");
  return copy;
}

const statuses = async (runId: string): Promise<Record<string, string>> => Object.fromEntries((await database.pool.query<{
  node_id: string; generation_status: string;
}>(`SELECT node_id::text, generation_status FROM core.node WHERE run_id=$1`, [runId])).rows.map((row) => [row.node_id, row.generation_status]));

describe("0119: the runtime role may set a node aside, and nothing else", () => {
  async function oneNode(runId: string): Promise<string> {
    return new GraphRepository(database.pool).withGraphWrite(runId, (writer) => writer.addNode({
      runId, claimType: "unknown", generationStatus: "complete", pathStatus: "active", explorationDecision: "continue",
      wayOfKnowing: "REASONING", locator: null, valueLaden: false, statementText: `node ${marker()}`, parentNodeId: null,
      childKind: null, siblingOrdinal: 0, provenanceRef: null
    }));
  }

  it("sets a node stale, once; the row is otherwise unchanged", async () => {
    const runId = await legacyRun();
    const nodeId = await oneNode(runId);
    const before = (await database.pool.query(`SELECT to_jsonb(node) - 'generation_status' AS row FROM core.node AS node WHERE node_id=$1`, [nodeId])).rows[0];
    expect((await asRuntime(`UPDATE core.node SET generation_status='stale' WHERE node_id=$1`, [nodeId])).rowCount).toBe(1);
    expect(await statuses(runId)).toEqual({ [nodeId]: "stale" });
    const after = (await database.pool.query(`SELECT to_jsonb(node) - 'generation_status' AS row FROM core.node AS node WHERE node_id=$1`, [nodeId])).rows[0];
    expect(after).toEqual(before);
  });

  it("cannot change any other column: refused by the column grant for the runtime, by the trigger for the owner", async () => {
    const runId = await legacyRun();
    const nodeId = await oneNode(runId);
    for (const assignment of ["claim_text='rewritten'", "path_status='abandoned'", "generation_status='stale', path_status='abandoned'"]) {
      await expect(asRuntime(`UPDATE core.node SET ${assignment} WHERE node_id=$1`, [nodeId])).rejects.toMatchObject({ code: "42501" });
    }
    for (const assignment of ["claim_text='rewritten'", "path_status='abandoned'", "generation_status='stale', exploration_decision='abandon'", "value_laden=true, generation_status='stale'"]) {
      await expect(database.pool.query(`UPDATE core.node SET ${assignment} WHERE node_id=$1`, [nodeId]))
        .rejects.toMatchObject({ code: "55000", message: "NODE_RETIRE_ONLY: a node update may change only generation_status" });
    }
    expect(await statuses(runId)).toEqual({ [nodeId]: "complete" });
  });

  it("only ever moves a node TO stale: a stale node never comes back, and no other status is written", async () => {
    const runId = await legacyRun();
    const nodeId = await oneNode(runId);
    await expect(asRuntime(`UPDATE core.node SET generation_status='failed' WHERE node_id=$1`, [nodeId]))
      .rejects.toMatchObject({ code: "55000", message: "NODE_RETIRE_ONE_WAY: generation_status may only become stale, once (was complete -> failed)" });
    await asRuntime(`UPDATE core.node SET generation_status='stale' WHERE node_id=$1`, [nodeId]);
    for (const status of ["complete", "pending", "stale"]) {
      await expect(asRuntime(`UPDATE core.node SET generation_status='${status}' WHERE node_id=$1`, [nodeId]))
        .rejects.toMatchObject({ code: "55000", message: `NODE_RETIRE_ONE_WAY: generation_status may only become stale, once (was stale -> ${status})` });
      await expect(database.pool.query(`UPDATE core.node SET generation_status='${status}' WHERE node_id=$1`, [nodeId]))
        .rejects.toMatchObject({ code: "55000" });
    }
    expect(await statuses(runId)).toEqual({ [nodeId]: "stale" });
  });

  it("cannot delete a node, stale or not, owner included; TRUNCATE stays guarded", async () => {
    const runId = await legacyRun();
    const live = await oneNode(runId);
    const stale = await oneNode(runId);
    await asRuntime(`UPDATE core.node SET generation_status='stale' WHERE node_id=$1`, [stale]);
    for (const nodeId of [live, stale]) {
      await expect(asRuntime(`DELETE FROM core.node WHERE node_id=$1`, [nodeId])).rejects.toMatchObject({ code: "42501" });
      await expect(database.pool.query(`DELETE FROM core.node WHERE node_id=$1`, [nodeId]))
        .rejects.toMatchObject({ code: "55000", message: "append-only or immutable table node rejects DELETE" });
    }
    await expect(database.pool.query(`TRUNCATE core.node CASCADE`)).rejects.toThrowError(/^TRUNCATE_REJECTED/u);
    expect(await statuses(runId)).toEqual({ [live]: "complete", [stale]: "stale" });
  });

  it("sets an ENCRYPTED run's node stale (sentinel text and ciphertext untouched), and refuses it once the run is erased", async () => {
    const runId = await encryptedRun();
    const first = await oneNode(runId);
    const second = await oneNode(runId);
    const sealed = (await database.pool.query<{ claim_text: string; sealed: boolean }>(
      `SELECT claim_text, content_ciphertext IS NOT NULL AS sealed FROM core.node WHERE node_id=$1`, [first])).rows[0];
    expect(sealed?.sealed).toBe(true);
    expect((await asRuntime(`UPDATE core.node SET generation_status='stale' WHERE node_id=$1`, [first])).rowCount).toBe(1);
    expect((await database.pool.query(`SELECT claim_text, content_ciphertext IS NOT NULL AS sealed FROM core.node WHERE node_id=$1`, [first])).rows[0])
      .toEqual(sealed);
    // 0040's key cleanup intent: the run's private content is no longer live.
    if (owner === undefined) throw new Error("RECLAIM_TEST_OWNER_UNPROVISIONED");
    await database.pool.query(
      `INSERT INTO serve.private_run_key_cleanup_intent (request_ref,user_id,run_id,requested_at,cleanup_publication_refs)
       VALUES ($1,$2,$3,now(),'{}')`, [randomUUID(), owner.userId, runId]);
    await expect(asRuntime(`UPDATE core.node SET generation_status='stale' WHERE node_id=$1`, [second]))
      .rejects.toMatchObject({ code: "55000", message: "PRIVATE_CONTENT_ERASED" });
    expect(await statuses(runId)).toEqual({ [first]: "stale", [second]: "complete" });
  });

  it("the bare runtime role, with no account context, sees no node and sets none aside (row-level security, 0126)", async () => {
    const runId = await legacyRun();
    const nodeId = await oneNode(runId);
    expect((await asBareRuntime<{ n: number }>(`SELECT count(*)::int AS n FROM core.node WHERE run_id=$1`, [runId])).rows).toEqual([{ n: 0 }]);
    expect((await asBareRuntime(`UPDATE core.node SET generation_status='stale' WHERE node_id=$1`, [nodeId])).rowCount).toBe(0);
    expect(await statuses(runId)).toEqual({ [nodeId]: "complete" });
    // Not vacuous: the runner's own login sets the same node aside.
    expect((await asRuntime(`UPDATE core.node SET generation_status='stale' WHERE node_id=$1`, [nodeId])).rowCount).toBe(1);
    expect(await statuses(runId)).toEqual({ [nodeId]: "stale" });
  });
});

describe("GraphRepository.retireNodes", () => {
  it("sets aside every node of the run but the kept ones, counts only those it changed, and touches no other run", async () => {
    const runId = await legacyRun();
    const other = await legacyRun();
    const authors = { root: await artifact(runId, "house-a"), child: await artifact(runId, "house-a") };
    const dead = await saveCopy(runId, authors, "dead");
    const live = await saveCopy(runId, authors, "live");
    const otherCopy = await saveCopy(other, { root: await artifact(other, "house-a"), child: await artifact(other, "house-a") }, "other");
    const graph = new GraphRepository(database.pool);
    expect(await graph.retireNodes(runId, [live.root, live.child], await heldClaim(runId))).toBe(2);
    expect(await statuses(runId)).toEqual({ [dead.root]: "stale", [dead.child]: "stale", [live.root]: "complete", [live.child]: "complete" });
    expect(await graph.retireNodes(runId, [live.root, live.child], await heldClaim(runId))).toBe(0);
    expect(await graph.retireNodes(runId, [live.root], await heldClaim(runId))).toBe(1);
    expect(await statuses(runId)).toEqual({ [dead.root]: "stale", [dead.child]: "stale", [live.root]: "complete", [live.child]: "stale" });
    expect(await graph.retireNodes(runId, [], await heldClaim(runId))).toBe(1);
    expect(Object.values(await statuses(runId))).toEqual(["stale", "stale", "stale", "stale"]);
    expect(await statuses(other)).toEqual({ [otherCopy.root]: "complete", [otherCopy.child]: "complete" });
  });

  it("is fenced on the copy's claim: a lapsed claim, another copy's claim or a settled item sets nothing aside (RUNNER_CLAIM_LOST)", async () => {
    const graph = new GraphRepository(database.pool);
    const lostClaim = async (fence: RetireClaimFence, runId: string): Promise<void> => {
      await expect(graph.retireNodes(runId, [], fence)).rejects.toMatchObject({ code: "RUNNER_CLAIM_LOST" });
      expect(Object.values(await statuses(runId)).every((status) => status === "complete")).toBe(true);
    };
    // Lapsed: the deadline this copy set has passed.
    const lapsedRun = await legacyRun();
    await saveCopy(lapsedRun, { root: await artifact(lapsedRun, "house-a"), child: await artifact(lapsedRun, "house-a") }, "dead");
    const lapsed = await heldClaim(lapsedRun);
    await database.pool.query(`UPDATE core.work_item SET claim_deadline = clock_timestamp() - interval '1 second' WHERE work_item_id=$1`, [lapsed.workItemId]);
    await lostClaim(lapsed, lapsedRun);
    // Taken: the claim lapsed and another copy (the same worker id, as a same-process retry) claimed the item since.
    const takenRun = await legacyRun();
    await saveCopy(takenRun, { root: await artifact(takenRun, "house-a"), child: await artifact(takenRun, "house-a") }, "dead");
    const mine = await heldClaim(takenRun);
    await database.pool.query(`UPDATE core.work_item SET claim_deadline = $2::timestamptz + make_interval(secs => $3) + interval '1 second' WHERE work_item_id=$1`,
      [mine.workItemId, mine.heldUntil, CLAIM_MS / 1_000]);
    await lostClaim(mine, takenRun);
    // ...while this copy's own renewal (a later deadline, within one claim of the one it set) keeps the fence.
    await database.pool.query(`UPDATE core.work_item SET claim_deadline = $2::timestamptz + interval '1 minute' WHERE work_item_id=$1`, [mine.workItemId, mine.heldUntil]);
    expect(await graph.retireNodes(takenRun, [], mine)).toBe(2);
    // Settled: the item is DONE.
    const doneRun = await legacyRun();
    await saveCopy(doneRun, { root: await artifact(doneRun, "house-a"), child: await artifact(doneRun, "house-a") }, "dead");
    const done = await heldClaim(doneRun);
    await database.pool.query(`UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1`, [done.workItemId]);
    await lostClaim(done, doneRun);
    // Another worker.
    const otherRun = await legacyRun();
    await saveCopy(otherRun, { root: await artifact(otherRun, "house-a"), child: await artifact(otherRun, "house-a") }, "dead");
    await lostClaim({ ...await heldClaim(otherRun), workerId: "runner:another" }, otherRun);
  });

  it("never sets a node aside once the run has served an answer, whoever asks (NODE_RETIRE_AFTER_ANSWER)", async () => {
    const runId = await legacyRun();
    const copy = await saveCopy(runId, { root: await artifact(runId, "house-a"), child: await artifact(runId, "house-a") }, "served");
    await persistTerminalRun({ pool: database.pool, runId, fixtureKey: `reclaim-${marker()}`,
      factBundle: { facts: ["reclaim-served-fact"], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
        reversalPoint: "reclaim-served-reversal", buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null } });
    await expect(asRuntime(`UPDATE core.node SET generation_status='stale' WHERE node_id=$1`, [copy.root]))
      .rejects.toThrow(/NODE_RETIRE_AFTER_ANSWER/u);
    await expect(database.pool.query(`UPDATE core.node SET generation_status='stale' WHERE node_id=$1`, [copy.root]))
      .rejects.toThrow(/NODE_RETIRE_AFTER_ANSWER/u);
    expect(await statuses(runId)).toEqual({ [copy.root]: "complete", [copy.child]: "complete" });
  });
});

describe("every reader of the debate ignores a stale copy that shares its author replies with the live one", () => {
  /**
   * The live copy is saved FIRST and the dead copy after it, so every stale row is the LATEST row of its kind: a reader
   * that forgot the filter would pick it (latest reviewer, latest judgement) or list it (reviewed, disputed, lineage).
   */
  async function resumedRun(): Promise<{ runId: string; live: Copy; dead: Copy; reviewers: Readonly<Record<string, string>> }> {
    const runId = await legacyRun();
    const authors = { root: await artifact(runId, "house-a"), child: await artifact(runId, "house-a") };
    const live = await saveCopy(runId, authors, "live");
    // The live copy's root is reviewed by house-b (agree); its child is not reviewed yet.
    await recordNodeReviewAlone(database.pool, { runId, nodeId: live.root, authorRawArtifactRef: authors.root,
      reviewRawArtifactRef: await artifact(runId, "house-b"), outcome: "agree", reasons: ["live agree"] });
    const dead = await saveCopy(runId, authors, "dead");
    // The dead copy got further: both nodes reviewed, by house-c, the child disputed.
    await recordNodeReviewAlone(database.pool, { runId, nodeId: dead.root, authorRawArtifactRef: authors.root,
      reviewRawArtifactRef: await artifact(runId, "house-c"), outcome: "dispute", reasons: ["dead dispute"] });
    await recordNodeReviewAlone(database.pool, { runId, nodeId: dead.child, authorRawArtifactRef: authors.child,
      reviewRawArtifactRef: await artifact(runId, "house-c"), outcome: "dispute", reasons: ["dead dispute"] });
    expect(await new GraphRepository(database.pool).retireNodes(runId, [live.root, live.child], await heldClaim(runId))).toBe(2);
    return { runId, live, dead, reviewers: { live: "house-b", dead: "house-c" } };
  }

  it("judgement: latest reviewer, reviewed, disputed, unreviewed and lineage read the live copy only", async () => {
    const { runId, live } = await resumedRun();
    const judgements = new JudgementRepository(database.pool);
    expect(await judgements.readLatestReviewerMaker(runId, "house-a")).toBe("house-b");
    expect(await judgements.readReviewedNodeIds(runId)).toEqual([live.root]);
    expect(await judgements.readDisputedNodeIds(runId)).toEqual([]);
    expect((await judgements.readUnreviewedNodes(runId)).map((node) => node.nodeId)).toEqual([live.child]);
    expect(Object.keys(await judgements.readJudgementLineage(runId)).sort()).toEqual([live.root, live.child].sort());
  });

  it("graph: the snapshot and the lifecycle events hold the live copy only", async () => {
    const { runId, live, dead } = await resumedRun();
    const graph = new GraphRepository(database.pool);
    const snapshot = await graph.materialiseSnapshot(runId);
    expect(snapshot.nodes.map((node) => node.nodeId)).toEqual([live.root, live.child]);
    expect(snapshot.arrows.map((arrow) => arrow.arrowId)).toEqual([live.edge]);
    const subjects = new Set((await graph.readNodeLifecycleEvents(runId)).map((event) => event.subjectRef));
    for (const nodeId of [dead.root, dead.child]) expect(subjects.has(nodeId)).toBe(false);
  });

  it("serve: the answer's nodes and edges are the live copy's only (one row per author reply)", async () => {
    const { runId, live } = await resumedRun();
    const serve = new ServeRepository(database.pool) as unknown as {
      readNodesForRun(runId: string): Promise<readonly { node_id: string; provenance_ref: string | null; review: { outcome: string } | null }[]>;
      readEdgesForRun(runId: string): Promise<readonly { edge_id: string }[]>;
    };
    const nodes = await serve.readNodesForRun(runId);
    expect(nodes.map((node) => node.node_id)).toEqual([live.root, live.child]);
    expect(nodes.map((node) => node.review?.outcome ?? null)).toEqual(["agree", null]);
    expect((await serve.readEdgesForRun(runId)).map((edge) => edge.edge_id)).toEqual([live.edge]);
  });
});

// The map's re-point (0119's core.map_position_repoint): a minimal two-answer map, as
// tests/integration/map-choice-repository.test.ts writes one.
const seat = (n: number) => ({ aiRef: `preview:ref-${String(n)}`, maker: `maker-${String(n)}` });
const MAP_RESULT = Object.freeze({
  arm: "C", kind: "MAP", stoppedBy: null, plannerLanguage: null,
  angles: [{ angleId: "g1", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against." }],
  items: [
    { itemId: "pt01", seat: seat(0), origin: "BLIND", angleId: "g1", angleKind: "OPPOSITE_CASE", listIndex: 0, kind: "POINT", claim: "It costs a lot.", whyItMatters: "Money.", leans: "against_some_answer" },
    { itemId: "pt02", seat: seat(1), origin: "BLIND", angleId: null, angleKind: null, listIndex: 1, kind: "POINT", claim: "It helps riders.", whyItMatters: "People.", leans: "for_some_answer" },
    { itemId: "ca01", seat: seat(0), origin: "BLIND", angleId: "g1", angleKind: "OPPOSITE_CASE", listIndex: 0, kind: "ANSWER", answer: "No." }
  ],
  keyPoints: [
    { keyPointId: "kp01", claim: "It costs a lot.", memberItemIds: ["pt01"], blindMakers: ["maker-0"], gapMakers: [], makers: ["maker-0"], fixedAngleKinds: ["OPPOSITE_CASE"], leansAgainst: true },
    { keyPointId: "kp02", claim: "It helps riders.", memberItemIds: ["pt02"], blindMakers: ["maker-1"], gapMakers: [], makers: ["maker-1"], fixedAngleKinds: [], leansAgainst: false }
  ],
  mergedAnswers: [{ answerId: "an01", answer: "No.", memberItemIds: ["ca01"], blindMakers: ["maker-0"], makers: ["maker-0"], fromOppositeCase: true }],
  framingChallenges: [],
  choice: { answers: [
    { answerId: "a1", statement: "Yes, with conditions.", forKeyPointIds: ["kp02"], againstKeyPointIds: ["kp01"], strongestRival: "a2", filled: false },
    { answerId: "a2", statement: "No.", forKeyPointIds: ["kp01"], againstKeyPointIds: [], strongestRival: "a1", filled: true }
  ], alsoRaised: [] },
  marks: [{ mark: "ANSWERS_FILLED", step: "CHOOSE", detail: "map" }],
  notes: [], calls: []
}) as MapResult;

describe("0119: an answer's map root moves only from a stale root to a live node of the same run", () => {
  async function mappedRun(encrypted = false): Promise<{ runId: string; dead: Copy; live: Copy; repository: MapChoiceRepository }> {
    const runId = encrypted ? await encryptedRun() : await legacyRun();
    const authors = { root: await artifact(runId, "house-a"), child: await artifact(runId, "house-a") };
    const dead = await saveCopy(runId, authors, "dead");
    const repository = new MapChoiceRepository(database.pool);
    expect(await repository.writeMapRun({ runId, result: MAP_RESULT, answerCount: 2 })).toBe("INSERTED");
    expect(await repository.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId: dead.root, maker: "maker-0" })).toBe("INSERTED");
    const live = await saveCopy(runId, authors, "live");
    return { runId, dead, live, repository };
  }
  const positionOf = async (repository: MapChoiceRepository, runId: string) =>
    (await repository.readMapChoiceForRun(runId))?.answers.find((answer) => answer.answerId === "a1");
  const repoint = (runId: string, from: string, to: string) => asRuntime(
    `INSERT INTO core.map_position_repoint (run_id, answer_id, from_root_node_id, root_node_id, maker) VALUES ($1,'a1',$2,$3,'maker-1')`,
    [runId, from, to]);

  it("writeMapPosition keeps a live root (ALREADY_PRESENT), and re-points a stale one (REPOINTED); the reader follows", async () => {
    const { runId, dead, live, repository } = await mappedRun();
    expect(await repository.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId: live.root, maker: "maker-1" })).toBe("ALREADY_PRESENT");
    expect(await positionOf(repository, runId)).toMatchObject({ rootNodeId: dead.root, maker: "maker-0" });
    await new GraphRepository(database.pool).retireNodes(runId, [live.root, live.child], await heldClaim(runId));
    expect(await repository.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId: live.root, maker: "maker-1" })).toBe("REPOINTED");
    expect(await positionOf(repository, runId)).toMatchObject({ rootNodeId: live.root, maker: "maker-1" });
    expect(await repository.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId: live.root, maker: "maker-1" })).toBe("ALREADY_PRESENT");
    // 0117's row is untouched: the move is its own row.
    expect((await database.pool.query(`SELECT root_node_id::text AS root, maker FROM core.map_position WHERE run_id=$1`, [runId])).rows)
      .toEqual([{ root: dead.root, maker: "maker-0" }]);
    // A second take-over moves it again, from the root now in force.
    const third = await saveCopy(runId, { root: await artifact(runId, "house-a"), child: await artifact(runId, "house-a") }, "third");
    await new GraphRepository(database.pool).retireNodes(runId, [third.root, third.child], await heldClaim(runId));
    expect(await repository.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId: third.root, maker: "maker-0" })).toBe("REPOINTED");
    expect(await positionOf(repository, runId)).toMatchObject({ rootNodeId: third.root, maker: "maker-0" });
  });

  it("the runtime's own INSERT is refused away from a live root, to a stale node, or from a root not in force", async () => {
    const { runId, dead, live } = await mappedRun();
    await expect(repoint(runId, dead.root, live.root))
      .rejects.toMatchObject({ code: "55000", message: "MAP_POSITION_REPOINT_ROOT_LIVE: only a stale root is moved away from" });
    await new GraphRepository(database.pool).retireNodes(runId, [live.root, live.child], await heldClaim(runId));
    await expect(repoint(runId, dead.root, dead.child))
      .rejects.toMatchObject({ code: "55000", message: "MAP_POSITION_REPOINT_TARGET_STALE: a root moves to a live node of the same run" });
    await expect(repoint(runId, dead.child, live.root))
      .rejects.toMatchObject({ code: "55000", message: "MAP_POSITION_REPOINT_NOT_IN_FORCE: a move starts from the root in force" });
    const elsewhere = await legacyRun();
    const foreign = await saveCopy(elsewhere, { root: await artifact(elsewhere, "house-a"), child: await artifact(elsewhere, "house-a") }, "foreign");
    await expect(repoint(runId, dead.root, foreign.root))
      .rejects.toMatchObject({ code: "55000", message: "MAP_POSITION_REPOINT_TARGET_STALE: a root moves to a live node of the same run" });
    await expect(asRuntime(`INSERT INTO core.map_position_repoint (run_id, answer_id, from_root_node_id, root_node_id, maker) VALUES ($1,'a1',$2,$3,'two words')`,
      [runId, dead.root, live.root])).rejects.toMatchObject({ code: "23514" });
    expect((await repoint(runId, dead.root, live.root)).rowCount).toBe(1);
    // The old root is in force no more: a second move from it is refused (the primary key, or the trigger).
    await expect(repoint(runId, dead.root, live.child)).rejects.toThrow();
  });

  it("the bare runtime role, with no account context, sees no map position and writes no re-point (row-level security, 0126)", async () => {
    const { runId, dead, live } = await mappedRun();
    await new GraphRepository(database.pool).retireNodes(runId, [live.root, live.child], await heldClaim(runId));
    await expect(asBareRuntime(`INSERT INTO core.map_position_repoint (run_id, answer_id, from_root_node_id, root_node_id, maker) VALUES ($1,'a1',$2,$3,'maker-1')`,
      [runId, dead.root, live.root])).rejects.toMatchObject({ code: "23503", message: "MAP_POSITION_REPOINT_NO_POSITION" });
    expect((await database.pool.query(`SELECT count(*)::int AS n FROM core.map_position_repoint WHERE run_id=$1`, [runId])).rows[0]).toEqual({ n: 0 });
    // Not vacuous: the runner's own login makes the same move.
    expect((await repoint(runId, dead.root, live.root)).rowCount).toBe(1);
  });

  it("the re-point table is append-only for every role: UPDATE, DELETE and TRUNCATE refused", async () => {
    const { runId, live } = await mappedRun();
    await new GraphRepository(database.pool).retireNodes(runId, [live.root, live.child], await heldClaim(runId));
    expect(await new MapChoiceRepository(database.pool).writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId: live.root, maker: "maker-1" })).toBe("REPOINTED");
    await expect(asRuntime(`UPDATE core.map_position_repoint SET maker='maker-0' WHERE run_id=$1`, [runId])).rejects.toMatchObject({ code: "42501" });
    await expect(database.pool.query(`UPDATE core.map_position_repoint SET maker = maker WHERE run_id=$1`, [runId]))
      .rejects.toThrowError(/^append-only or immutable table map_position_repoint rejects UPDATE$/u);
    await expect(database.pool.query(`DELETE FROM core.map_position_repoint WHERE run_id=$1`, [runId]))
      .rejects.toThrowError(/^append-only or immutable table map_position_repoint rejects DELETE$/u);
    await expect(database.pool.query(`TRUNCATE core.map_position_repoint`))
      .rejects.toThrowError(/^TRUNCATE_REJECTED: append-only or immutable table core\.map_position_repoint rejects TRUNCATE$/u);
    // 0117's own table is still append-only too.
    await expect(database.pool.query(`UPDATE core.map_position SET maker = maker WHERE run_id=$1`, [runId]))
      .rejects.toThrowError(/^append-only or immutable table map_position rejects UPDATE$/u);
  });

  it("an encrypted run re-points; once it is erased, writeMapPosition answers RUN_ERASED and nothing moves", async () => {
    const { runId, dead, live, repository } = await mappedRun(true);
    await new GraphRepository(database.pool).retireNodes(runId, [live.root, live.child], await heldClaim(runId));
    expect(await repository.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId: live.root, maker: "maker-1" })).toBe("REPOINTED");
    expect(await positionOf(repository, runId)).toMatchObject({ rootNodeId: live.root });

    const erased = await mappedRun(true);
    await new GraphRepository(database.pool).retireNodes(erased.runId, [erased.live.root, erased.live.child], await heldClaim(erased.runId));
    if (owner === undefined) throw new Error("RECLAIM_TEST_OWNER_UNPROVISIONED");
    await database.pool.query(
      `INSERT INTO serve.private_run_key_cleanup_intent (request_ref,user_id,run_id,requested_at,cleanup_publication_refs)
       VALUES ($1,$2,$3,now(),'{}')`, [randomUUID(), owner.userId, erased.runId]);
    expect(await repository.writeMapPosition({ runId: erased.runId, answerId: "a1", rootIndex: 0, rootNodeId: erased.live.root, maker: "maker-1" })).toBe("RUN_ERASED");
    await expect(repoint(erased.runId, erased.dead.root, erased.live.root)).rejects.toMatchObject({ code: "55000", message: "PRIVATE_CONTENT_ERASED" });
    expect((await database.pool.query(`SELECT count(*)::int AS n FROM core.map_position_repoint WHERE run_id=$1`, [erased.runId])).rows[0]).toEqual({ n: 0 });
    expect(dead.root).not.toBe(live.root);
  });
});

