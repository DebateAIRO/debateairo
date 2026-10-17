// tests/integration/r2-engine-links-database.test.ts
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import { migrate } from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { JudgementRepository } from "@debateai/judgement";
import { LedgerRepository } from "@debateai/ledger";
import { engineSettingsOf, engineVersionPolicyStartValues } from "@debateai/register";
import { projectJudgedStanding } from "@debateai/runner";
import { ServeRepository, buildFactBundle, type ConditionMarkRecord, type ServeGateResult } from "@debateai/serve";
import { engineLinkedGraph, engineUnassessedRecords } from "../../apps/runner/src/engine-links.js";
import { recordNodeReviewAlone } from "../support/unsafeReviewWrites.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/** R2 A8: the ledger's three review reads feed engine 2's link rules; engine 1's projection is unchanged. */
let database: TestDatabase;
const ENGINE = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 3, mapOpening: true });

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 240_000);

afterAll(async () => {
  await database?.stop();
});

// The run, artifact and tau helpers are tests/integration/t06-review-teeth-database.test.ts's (:41-81 at 1bc8f549b).
async function createRun(label: string): Promise<string> {
  const result = await database.pool.query<{ run_id: string }>(`
    INSERT INTO core.run (
      question_line, asker_id, session_id, caller_scope, as_of,
      asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
      composition_budget_tier, depth_params, agent_count, discovered_panel,
      stranger_sample_rate, envelope_basis, register_version,
      battery_version, created_at_seq
    ) VALUES (
      $1, $2, $3, 'ASKER', '2026-08-08T00:00:00.000Z',
      'casual', 'casual', 'ASKER', $4,
      'low', '{}', 1,
      '[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',
      1, '{}', 1, 's02', ledger.allocate_sequence()
    ) RETURNING run_id
  `, [label, `asker:${label}`, `session:${label}`, `asker-declaration:${label}`]);
  return result.rows[0]!.run_id;
}

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

async function recordTau(runId: string, nodeId: string, tau: number): Promise<void> {
  const artifactId = await artifact(runId, "house-a");
  await database.pool.query(`
    INSERT INTO ledger.reduced_judgement (
      run_id, node_id, raw_artifact_ref, tau, number_kind, source_ref,
      producer, replay_handle, way_of_knowing, at_seq
    ) VALUES ($1,$2,$3::uuid,$4,'confidence',$5,'house-a',$6,'REASONING',ledger.allocate_sequence())
  `, [runId, nodeId, artifactId, tau, `artifact:${artifactId}`, `judgement:${randomUUID()}`]);
}

/** One answer with a disputed point and a cannot-assess point, each with its tau and its cross-maker review. */
async function seedReviewedGraph(runId: string): Promise<ReadonlyMap<string, string>> {
  // Pre-flight PF-R2a4.1: each child of one parent takes its own slot (unique index node_child_slot_unique,
  // migrations/0010_s07.sql:25-27, refuses two children in one slot).
  const plan = [
    { key: "root", outcome: "agree", parent: null, tau: 0.6, ordinal: 0 },
    { key: "disputed", outcome: "dispute", parent: "root", tau: 0.5, ordinal: 1 },
    { key: "unassessed", outcome: "cannot-assess", parent: "root", tau: 0.7, ordinal: 2 }
  ] as const;
  const authors = new Map<string, string>();
  for (const row of plan) authors.set(row.key, await artifact(runId, "house-a"));
  const ids = await new GraphRepository(database.pool).withGraphWrite(runId, async (writer) => {
    const created = new Map<string, string>();
    for (const row of plan) {
      const parentNodeId = row.parent === null ? null : created.get(row.parent)!;
      created.set(row.key, await writer.addNode({
        runId, claimType: "unknown", generationStatus: "complete", pathStatus: "active", explorationDecision: "continue",
        wayOfKnowing: "REASONING", locator: null, valueLaden: false, statementText: `r2-a8: ${row.key}`, parentNodeId,
        childKind: parentNodeId === null ? null : "support", siblingOrdinal: row.ordinal,
        provenanceRef: authors.get(row.key)!
      }));
    }
    return created;
  });
  for (const row of plan) await recordTau(runId, ids.get(row.key)!, row.tau);
  for (const row of plan) {
    await recordNodeReviewAlone(database.pool, {
      runId, nodeId: ids.get(row.key)!, authorRawArtifactRef: authors.get(row.key)!,
      reviewRawArtifactRef: await artifact(runId, "house-b"), outcome: row.outcome, reasons: [`r2-a8: ${row.key} review`]
    });
  }
  return ids;
}

describe("R2 A8 · engine 2 reads the reviews from the ledger", () => {
  it("names the cannot-assess nodes, keeps them standing under engine 2, and engine 1 still hides them", async () => {
    const runId = await createRun(`r2-a8-${randomUUID()}`);
    const ids = await seedReviewedGraph(runId);
    const judgements = new JudgementRepository(database.pool);
    const snapshot = await new GraphRepository(database.pool).materialiseSnapshot(runId);
    const reviewedNodeIds = await judgements.readReviewedNodeIds(runId);
    const cannotAssessNodeIds = await judgements.readCannotAssessNodeIds(runId);
    expect(cannotAssessNodeIds).toEqual([ids.get("unassessed")]);
    // Engine 1 (today): the cannot-assess node has no judged basis and is hidden.
    expect(projectJudgedStanding(snapshot, reviewedNodeIds).hiddenNodeIds).toEqual([ids.get("unassessed")]);
    // Engine 2: it stands, the disputed node counts for less, nothing is hidden.
    const linked = engineLinkedGraph({ engine: ENGINE, snapshot, reviewedNodeIds, cannotAssessNodeIds,
      disputedNodeIds: await judgements.readDisputedNodeIds(runId), ownReplyEdgeIds: new Map() })!;
    const standing = projectJudgedStanding(linked.snapshot, linked.reviewedNodeIds);
    expect(standing.hiddenNodeIds).toEqual([]);
    expect(standing.snapshot.nodes.find((node) => node.nodeId === ids.get("disputed"))!.baseStrength).toBeCloseTo(0.35, 12);
    expect(linked.unassessedNodeIds).toEqual([ids.get("unassessed")]);
  });

  // Pre-flight PF-R2a2.3: the review catch-up reads the rule the previous propagation version recorded.
  it("reads the run's latest propagation version's judgement-selection rule, and null before the first", async () => {
    const runId = await createRun(`r2-a8-rule-${randomUUID()}`);
    const ledger = new LedgerRepository(database.pool);
    expect(await ledger.readLatestJudgementSelectionRule(runId)).toBeNull();
    const record = (judgementSelectionRule: Readonly<Record<string, unknown>>) => ledger.recordPropagation({
      runId, inputHash: "input:r2-a8", contractHash: "contract:r2-a8", graphFingerprint: "graph:r2-a8",
      arrowOrder: [], clusterRecords: [], operatorResolutions: [], transmissionReductions: [], liftRecords: [],
      judgementSelectionRule, strengths: []
    });
    await record({ kind: "MAXIMIZE_WEIGHTED_TAU", rowKey: "claimTypeCompositionMap", registerVersion: 1, sourceRef: "register:1" });
    await record({ kind: "ENGINE2_HONEST_MEDIAN", rowKey: "engineVersionPolicy", registerVersion: 2, sourceRef: "register:2" });
    expect(await ledger.readLatestJudgementSelectionRule(runId))
      .toEqual({ kind: "ENGINE2_HONEST_MEDIAN", rowKey: "engineVersionPolicy", registerVersion: 2, sourceRef: "register:2" });
  });

  // A9 report carry (controller ruling): 0053's other CHECKs bind the new mark too — review_ref and review_node_ref set,
  // subject_ref = review_node_ref, pointing at the node's own cannot-assess review row. Written through the real serve writer.
  it("persists an UNASSESSED-AT-REDUCED-WEIGHT record through the serve writer, bound to the point's own cannot-assess review", async () => {
    const runId = await createRun(`r2-a8-persist-${randomUUID()}`);
    const ids = await seedReviewedGraph(runId);
    const judgements = new JudgementRepository(database.pool);
    const linked = engineLinkedGraph({ engine: ENGINE, snapshot: await new GraphRepository(database.pool).materialiseSnapshot(runId),
      reviewedNodeIds: await judgements.readReviewedNodeIds(runId), cannotAssessNodeIds: await judgements.readCannotAssessNodeIds(runId),
      disputedNodeIds: await judgements.readDisputedNodeIds(runId), ownReplyEdgeIds: new Map() })!;
    const records = engineUnassessedRecords(linked);
    const unassessed = ids.get("unassessed")!;
    const disputed = ids.get("disputed")!;
    const work = new WorkItemRepository(database.pool);
    const persist = async (conditionMarkRecords: readonly ConditionMarkRecord[]) => {
      const workItemId = await work.enqueue({ runId, batteryRowId: "Q1", nodeSet: [], commandKey: `r2-a8:${randomUUID()}` });
      const compositionArtifactId = await artifact(runId, "house-c");
      const factBundle = buildFactBundle({
        facts: ["r2-a8 fact"], residualObjections: [], badges: [], conditionMarks: ["UNASSESSED-AT-REDUCED-WEIGHT"],
        reversalPoint: "r2-a8 reversal", buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
      });
      const segments = Object.freeze([{ segmentId: "s1", text: "r2-a8 segment", loadBearing: true, assertedNodeRefs: [], servedNumberRefs: [] }]);
      const result: ServeGateResult = Object.freeze({
        terminal: "SERVED", answerForm: { kind: "VERDICT" as const, text: "r2-a8 verdict" }, factBundle,
        gateTrace: Object.freeze(["GATE4_Q51_PASS", "POST_COMPOSE_R9_PASS", "SERVE"] as const),
        conditionMarks: Object.freeze(["UNASSESSED-AT-REDUCED-WEIGHT" as const]),
        conformance: Object.freeze([{ segmentId: "s1", state: "JUDGED" as const, conforms: true }]),
        coverageMode: "EXHAUSTIVE", segments,
        compositionBudget: Object.freeze({ tier: "low", bound: 1, registerRowKey: "r2-a8:composition-budget", registerVersion: 1, sourceRef: "r2-a8" }),
        confidenceBand: null, bandCeiling: null, digest: null, loopRounds: Object.freeze([]), standingObjection: null, crashClass: null,
        projections: Object.freeze({ reversalPoint: factBundle.reversalPoint, buildsOnPrevious: factBundle.buildsOnPrevious,
          memoryDisclosure: factBundle.memoryDisclosure })
      });
      return new ServeRepository(database.pool).persist({
        runId, workItemId, factBundleVersion: 1,
        factBundleContentHash: createHash("sha256").update(JSON.stringify(factBundle)).digest("hex"),
        factBundle, result, segments, compositionRawArtifactRef: compositionArtifactId, compositionAttempt: 1,
        conformanceRawArtifactRefs: [compositionArtifactId], conditionMarkRecords, servedNumber: null
      });
    };
    // A wrong one first (one answer per run): the writer refuses a record naming a point whose review was a dispute, not cannot-assess.
    await expect(persist([{ ...records[0]!, subjectRef: disputed, affectedNodeIds: [disputed] }]))
      .rejects.toMatchObject({ code: "CONDITION_MARK_REVIEW_REASON_UNTRUE" });
    const persisted = await persist(records);
    const review = await database.pool.query<{ node_review_id: string }>(
      "SELECT node_review_id::text FROM ledger.node_review WHERE run_id=$1 AND node_id=$2 AND outcome='cannot-assess'", [runId, unassessed]);
    const stored = await database.pool.query<{ subject_ref: string; review_outcome: string; review_ref: string; review_node_ref: string; reason: string }>(
      `SELECT subject_ref, review_outcome, review_ref::text AS review_ref, review_node_ref::text AS review_node_ref, reason
         FROM serve.condition_mark WHERE answer_id=$1 AND answer_version=$2 AND mark='UNASSESSED-AT-REDUCED-WEIGHT'`,
      [persisted.answerId, persisted.answerVersion]);
    expect(stored.rows).toEqual([{ subject_ref: unassessed, review_outcome: "cannot-assess",
      review_ref: review.rows[0]!.node_review_id, review_node_ref: unassessed, reason: "UNASSESSED_AT_REDUCED_WEIGHT:0.66" }]);
    // And the database itself refuses the new mark bound to another node's review (0053's subject check).
    await expect(database.pool.query(
      `INSERT INTO serve.condition_mark (answer_id, answer_version, mark, scope, subject_ref, reason, review_outcome,
         review_ref, review_node_ref, at_seq)
       VALUES ($1,$2,'UNASSESSED-AT-REDUCED-WEIGHT','node',$3,'ddl-probe','cannot-assess',$4::uuid,$5::uuid,ledger.allocate_sequence())`,
      [persisted.answerId, persisted.answerVersion, disputed, review.rows[0]!.node_review_id, unassessed]))
      .rejects.toThrow(/condition_mark_review_subject_check/);
  });
});
