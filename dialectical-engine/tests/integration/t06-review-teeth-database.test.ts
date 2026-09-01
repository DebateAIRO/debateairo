import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { JudgementRepository } from "@debateai/judgement";
import { LedgerRepository } from "@debateai/ledger";
import { projectJudgedStanding } from "@debateai/runner";
import { assertUnjudgedReasonsAreTrue, type ConditionMarkRecord } from "@debateai/serve";
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
  readonly reviewIds: ReadonlyMap<string, string>;
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
  const reviewIds = new Map<string, string>();
  for (const row of plan) {
    if (row.outcome === null) continue;
    reviewIds.set(row.key, await recordNodeReviewAlone(database.pool, {
      runId,
      nodeId: ids.get(row.key)!,
      authorRawArtifactRef: authorRefs.get(row.key)!,
      reviewRawArtifactRef: await artifact(runId, "house-b"),
      outcome: row.outcome,
      reasons: [`${label}: ${row.key} review`]
    }));
  }
  return { runId, ids, reviewIds };
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

/**
 * T6 r3 / J14 ADDENDUM — the disclosure reason must be TRUE, not merely singular.
 *
 * The r2 XOR bound CARDINALITY: exactly one of `terminal_transport_outcome` and
 * `review_outcome` is set. Codex proved that leaves two writable lies, because
 * nothing tied the selected branch to the actual `ledger.node_review` row:
 *
 *   1. the review arm accepted `agree` / `dispute`, though BOTH seed judged
 *      standing and neither can be a reason a node is unjudged; and
 *   2. the transport arm ("the review never landed") was writable for a node
 *      whose review demonstrably HAD landed — r2's own DDL probe asserted that
 *      row was accepted, which is the fabrication the design claims to outlaw.
 *
 * `assertUnjudgedReasonsAreTrue` is the cross-table guard that closes both. It
 * runs at BOTH ends: the writer (`ServeRepository.persist`) refuses to seal a
 * false reason, and the review-catch-up reader refuses to propagate one it
 * finds. Cross-table truth is not expressible in a CHECK constraint, and J14's
 * addendum explicitly does not mandate a trigger, so this guard plus these
 * negative probes are the floor.
 */
describe("T6 r3 · the unjudged reason is truth-bound, not just single (J14 addendum)", () => {
  const record = (over: Partial<ConditionMarkRecord> & { readonly subjectRef: string }): ConditionMarkRecord => ({
    mark: "HIDDEN-UNJUDGEABLE",
    scope: "node",
    reason: "probe",
    liftPath: null,
    servedRootRule: null,
    affectedNodeIds: [over.subjectRef],
    callSiteKey: `JUDGE:review:${over.subjectRef}`,
    plannedLegCount: null,
    terminalTransportOutcome: null,
    reviewOutcome: null,
    reviewRef: null,
    hiddenStrength: null,
    hiddenScoreThreshold: null,
    hiddenScoreThresholdSourceRef: null,
    excludedFromServedNumber: true,
    judgedBasisCount: null,
    ...over
  });

  it("accepts a review arm that names the node's OWN cannot-assess review, and refuses every falsehood", async () => {
    const run = await seedRun("t06-truth", [
      { key: "unassessed", outcome: "cannot-assess" },
      { key: "agreed", outcome: "agree" },
      { key: "disputed", outcome: "dispute" },
      { key: "unreviewed", outcome: null }
    ]);
    const nodeOf = (key: string) => run.ids.get(key)!;
    const reviewOf = (key: string) => run.reviewIds.get(key)!;
    const check = (candidate: ConditionMarkRecord) =>
      assertUnjudgedReasonsAreTrue(database.pool, run.runId, [candidate]);

    // TRUE: the node's own review, and it really did come back cannot-assess.
    await expect(check(record({
      subjectRef: nodeOf("unassessed"),
      reviewOutcome: "cannot-assess",
      reviewRef: reviewOf("unassessed")
    }))).resolves.toBeUndefined();

    // LIE 1 — the review arm pointed at a review that REACHED a judgement.
    // `agree` and `dispute` both seed judged standing, so neither can ever be
    // the reason a node is unjudged.
    await expect(check(record({
      subjectRef: nodeOf("agreed"),
      reviewOutcome: "cannot-assess",
      reviewRef: reviewOf("agreed")
    }))).rejects.toMatchObject({ code: "CONDITION_MARK_REVIEW_REASON_UNTRUE" });
    await expect(check(record({
      subjectRef: nodeOf("disputed"),
      reviewOutcome: "cannot-assess",
      reviewRef: reviewOf("disputed")
    }))).rejects.toMatchObject({ code: "CONDITION_MARK_REVIEW_REASON_UNTRUE" });

    // LIE 2 — a real cannot-assess review, but ANOTHER node's. The FK is
    // satisfied and the CHECK is satisfied; only subject identity catches it.
    await expect(check(record({
      subjectRef: nodeOf("agreed"),
      reviewOutcome: "cannot-assess",
      reviewRef: reviewOf("unassessed")
    }))).rejects.toMatchObject({ code: "CONDITION_MARK_REVIEW_REASON_UNTRUE" });

    // LIE 3 — the fabrication r2's own probe affirmed: "the review never
    // landed" claimed for a node whose review is sitting in the ledger.
    await expect(check(record({
      subjectRef: nodeOf("unassessed"),
      terminalTransportOutcome: "FAILED"
    }))).rejects.toMatchObject({ code: "CONDITION_MARK_TRANSPORT_REASON_UNTRUE" });
    await expect(check(record({
      subjectRef: nodeOf("agreed"),
      terminalTransportOutcome: "TIMED_OUT"
    }))).rejects.toMatchObject({ code: "CONDITION_MARK_TRANSPORT_REASON_UNTRUE" });

    // TRUE: the transport arm for a node that genuinely has no review row.
    await expect(check(record({
      subjectRef: nodeOf("unreviewed"),
      terminalTransportOutcome: "FAILED"
    }))).resolves.toBeUndefined();

    // The class-D twin is bound by the same guard, on the same two arms.
    const derived = { mark: "DERIVED-STANDING-UNREVIEWED" as const, excludedFromServedNumber: false, judgedBasisCount: 1 };
    await expect(check(record({
      subjectRef: nodeOf("unassessed"), ...derived,
      reviewOutcome: "cannot-assess", reviewRef: reviewOf("unassessed")
    }))).resolves.toBeUndefined();
    await expect(check(record({
      subjectRef: nodeOf("agreed"), ...derived, terminalTransportOutcome: "FAILED"
    }))).rejects.toMatchObject({ code: "CONDITION_MARK_TRANSPORT_REASON_UNTRUE" });
  });

  it("leaves marks that carry no unjudged reason alone", async () => {
    const run = await seedRun("t06-truth-passthrough", [{ key: "agreed", outcome: "agree" }]);
    // A class-L record names a threshold, not a review; the guard must not
    // invent an obligation for marks outside class H/D.
    await expect(assertUnjudgedReasonsAreTrue(database.pool, run.runId, [record({
      mark: "HIDDEN-LOW-SCORE",
      subjectRef: run.ids.get("agreed")!,
      callSiteKey: null,
      excludedFromServedNumber: false,
      hiddenStrength: 0.1,
      hiddenScoreThreshold: 0.35,
      hiddenScoreThresholdSourceRef: "test-layer"
    })])).resolves.toBeUndefined();
  });
});
