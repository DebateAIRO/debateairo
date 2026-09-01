import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { JudgementRepository } from "@debateai/judgement";
import { LedgerRepository } from "@debateai/ledger";
import { projectJudgedStanding } from "@debateai/runner";
import { recordNodeReviewAlone } from "../support/unsafeReviewWrites.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * T6 (goal 160-168; ruling S4-2) — review outcomes get teeth.
 *
 * `ledger.node_review` is the authoritative judged-basis source (DR-184), and
 * until now every stored row seeded that basis regardless of what the reviewer
 * actually said. A `cannot-assess` row therefore bought a node the same
 * standing as a real judgement: the reviewer looked, said it could not honestly
 * judge, and the node was counted as judged anyway.
 *
 * The property these tests pin is about the BASIS SEED, not about the node:
 * a `cannot-assess` review contributes nothing to the judged-standing basis,
 * while `agree` and `dispute` both do. A node whose ONLY review is
 * `cannot-assess` and that has no judged argument behind it is therefore class
 * H — HIDDEN-UNJUDGEABLE. One that DOES have a judged argument behind it still
 * stands, on that argument's authority (class D), exactly as it would if its
 * own review had never landed.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 240_000);

afterAll(async () => {
  await database?.stop();
});

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

/** A raw artifact attributable to one maker, for the review lineage trigger. */
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

interface SeedRow {
  readonly key: string;
  /** null = the review never landed at all (the pre-existing class-H route). */
  readonly outcome: "agree" | "dispute" | "cannot-assess" | null;
  readonly parent?: string;
}

/**
 * Builds a run whose nodes carry a real author lineage and, where the plan says
 * so, ONE stored `ledger.node_review` row with the named outcome.
 *
 * `recordNodeReviewAlone` is the test-layer seeder (case 1 of its contract: a
 * node with no edges in play); production still has exactly one review writer.
 */
async function seedRun(label: string, plan: readonly SeedRow[]): Promise<{
  readonly runId: string;
  readonly ids: ReadonlyMap<string, string>;
}> {
  const runId = await createRun(`${label}-${randomUUID()}`);
  const authorRefs = new Map<string, string>();
  for (const row of plan) authorRefs.set(row.key, await artifact(runId, "house-a"));

  const ids = await new GraphRepository(database.pool).withGraphWrite(runId, async (writer) => {
    const created = new Map<string, string>();
    for (const row of plan) {
      const parentNodeId = row.parent === undefined ? null : created.get(row.parent)!;
      created.set(row.key, await writer.addNode({
        runId,
        claimType: "unknown",
        generationStatus: "complete",
        pathStatus: "active",
        explorationDecision: "continue",
        wayOfKnowing: "REASONING",
        locator: null,
        valueLaden: false,
        statementText: `${label}: ${row.key}`,
        parentNodeId,
        childKind: parentNodeId === null ? null : "support",
        siblingOrdinal: parentNodeId === null ? 0 : 1,
        provenanceRef: authorRefs.get(row.key)!
      }));
    }
    return created;
  });

  for (const nodeId of ids.values()) await recordTau(runId, nodeId, 0.5);
  for (const row of plan) {
    if (row.outcome === null) continue;
    await recordNodeReviewAlone(database.pool, {
      runId,
      nodeId: ids.get(row.key)!,
      authorRawArtifactRef: authorRefs.get(row.key)!,
      reviewRawArtifactRef: await artifact(runId, "house-b"),
      outcome: row.outcome,
      reasons: [`${label}: ${row.key} review`]
    });
  }
  return { runId, ids };
}

async function standingOf(runId: string): Promise<{
  readonly reviewedNodeIds: readonly string[];
  readonly standing: ReturnType<typeof projectJudgedStanding>;
}> {
  const reviewedNodeIds = await new JudgementRepository(database.pool).readReviewedNodeIds(runId);
  const snapshot = await new GraphRepository(database.pool).materialiseSnapshot(runId);
  return { reviewedNodeIds, standing: projectJudgedStanding(snapshot, reviewedNodeIds) };
}

describe("T6 · cannot-assess stops seeding the judged-standing basis (S4-2)", () => {
  it("hides a node whose ONLY review is cannot-assess, and keeps BOTH agree and dispute as seeds", async () => {
    const run = await seedRun("t06-basis", [
      { key: "agreed", outcome: "agree" },
      { key: "disputed", outcome: "dispute" },
      { key: "unassessed", outcome: "cannot-assess" }
    ]);
    const agreed = run.ids.get("agreed")!;
    const disputed = run.ids.get("disputed")!;
    const unassessed = run.ids.get("unassessed")!;

    const { reviewedNodeIds, standing } = await standingOf(run.runId);

    // The seed set is set-equality, not a count: it names WHICH outcomes seed.
    // `agree` only would drop `disputed`; `<> agree` would drop `agreed`;
    // no predicate at all — the state at base — would admit `unassessed`.
    expect(new Set(reviewedNodeIds)).toEqual(new Set([agreed, disputed]));

    // The DoD headline: reviewed ONLY by cannot-assess, nothing judged behind
    // it, so it carries no basis and is class H — HIDDEN-UNJUDGEABLE.
    expect(new Set(standing.hiddenNodeIds)).toEqual(new Set([unassessed]));
    expect(new Set(standing.snapshot.nodes.map((node) => node.nodeId)))
      .toEqual(new Set([agreed, disputed]));
    // Agree path unchanged, and dispute rides with it: neither is hidden and
    // neither is derived — each stands on its own review.
    expect(standing.derivedStandingNodeIds).toEqual([]);
  });

  it("leaves a cannot-assess node standing when a judged argument is behind it — the SEED is removed, not the node", async () => {
    const run = await seedRun("t06-derived", [
      { key: "unassessed", outcome: "cannot-assess" },
      { key: "agreedChild", outcome: "agree", parent: "unassessed" }
    ]);
    const unassessed = run.ids.get("unassessed")!;
    const agreedChild = run.ids.get("agreedChild")!;

    const { reviewedNodeIds, standing } = await standingOf(run.runId);

    expect(new Set(reviewedNodeIds)).toEqual(new Set([agreedChild]));
    // Not hidden: the basis reaches it through the judged child, exactly as it
    // would if its own review had never landed. An implementation that hid
    // every cannot-assess node instead of dropping it from the seed set turns
    // this RED.
    expect(standing.hiddenNodeIds).toEqual([]);
    expect(standing.derivedStandingNodeIds).toEqual([unassessed]);
    expect(standing.judgedBasisCounts[unassessed]).toBe(1);
  });

  it("agree-path unchanged — an all-agree run hides nothing and derives nothing", async () => {
    const run = await seedRun("t06-agree-path", [
      { key: "first", outcome: "agree" },
      { key: "second", outcome: "agree" }
    ]);

    const { reviewedNodeIds, standing } = await standingOf(run.runId);

    expect(new Set(reviewedNodeIds)).toEqual(new Set([...run.ids.values()]));
    expect(standing.hiddenNodeIds).toEqual([]);
    expect(standing.derivedStandingNodeIds).toEqual([]);
  });

  it("an absent review and a cannot-assess review reach the SAME standing outcome", async () => {
    const unreviewed = await seedRun("t06-absent", [{ key: "solo", outcome: null }]);
    const unassessed = await seedRun("t06-unassessed", [{ key: "solo", outcome: "cannot-assess" }]);

    const absent = await standingOf(unreviewed.runId);
    const assessed = await standingOf(unassessed.runId);

    expect(absent.reviewedNodeIds).toEqual([]);
    expect(assessed.reviewedNodeIds).toEqual([]);
    expect(absent.standing.hiddenNodeIds).toEqual([unreviewed.ids.get("solo")!]);
    expect(assessed.standing.hiddenNodeIds).toEqual([unassessed.ids.get("solo")!]);
  });
});
