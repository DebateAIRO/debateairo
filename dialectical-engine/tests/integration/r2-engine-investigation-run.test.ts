// tests/integration/r2-engine-investigation-run.test.ts
/**
 * R2a final wave, Ruling W2 (whole-branch review Important 2): the runner's investigation step, for real. Whole engine-2
 * debates through the REAL WalkingSkeletonRunner as main.ts composes it on the preview (tests/support/preview-debate-
 * harness.ts, the R1d-1 / A1 machinery), over the two preview gates' unix-socket doubles, on a migrated embedded
 * PostgreSQL. Only the gates' answers are scripted: every judge, panel and review answer by WHAT it asked
 * (tests/support/scripted-answers.ts); the first non-root reviews say "cannot assess"; the investigator (contract
 * verdict.investigate.v1) answers holds, fails, a dead end, or something unusable. The investigation cap is 1, so each
 * debate has one investigated point and the rest over the cap.
 *
 * Why this harness and not the practice tool's (tests/integration/preview-practice-run.test.ts): the practice tool runs
 * the same runner but fixes its own runner settings, register and receipt; this harness hands the receipt (the engine's
 * cap) and the runner's engine settings in directly, runs an encrypted owner's debate, and leaves the pool open for the
 * review catch-up's own dependencies afterwards. The practice tool's two database readers (the investigations block and
 * the transcript engine graph) are called here on the same database.
 *
 * Covers (a) two or more cannot-assess points with cap 1: one answered row and the rest INVESTIGATION_CAPPED; (b) the
 * investigator through the scripted gate under the engine seal, of a maker neither the point's author's nor its
 * reviewer's, ledger key VERDICT:investigate:1, role REVIEWER; (c) HOLDS, FAILS and DEAD_END: the stored row, the dispute
 * weight on FAILS only, link weights 1 / 0.66 / 0.66, the reduced-weight record only where no investigation settled the
 * point; (d) an unusable reply: an INVESTIGATION_UNAVAILABLE row naming the planned maker, provider and model id, and one
 * content-free DEBATEAI_POINT_INVESTIGATION line; (e) an encrypted run's row sealed and read back; (f) a review catch-up
 * afterwards keeps the run's own selection rule and rebuilds the same reduced-weight records; (g) the practice
 * investigations block and the transcript engine graph count each investigation once. It also gives A12's
 * `readEngineReviews` SQL its first real-database run (the step reads it). Run alone.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CONTENT_JSON_SENTINEL, migrate } from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import {
  JudgementRepository, POINT_INVESTIGATION_CONTRACT_ID, PointInvestigationRepository, type PointInvestigationResult
} from "@debateai/judgement";
import {
  engineReceiptSchema, engineSettingsOf, engineSettingsOfReceipt, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues,
  resolveLengthGuidance, type EngineSettings
} from "@debateai/register";
import { PREVIEW_PROVIDER_REF_MODELS } from "@debateai/providers";
import { createPostgresReviewCatchUpDependencies } from "@debateai/runner";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { engineInvestigatedStatuses, investigatedStatusOf } from "../../apps/runner/src/engine-investigations.js";
import { engineLinkedGraph, engineOwnReplyEdgeIdsOf } from "../../apps/runner/src/engine-links.js";
import { readPracticeInvestigations } from "../../tools/preview-practice/practice-investigations.js";
import { buildTranscriptEngineGraph, readEngineGraphSource } from "../../tools/preview-practice/practice-engine-graph.js";
import { reproduceServedPropagation } from "../../tools/preview-practice/practice-rescore.js";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { PANEL_REFS, previewDebateHarness } from "../support/preview-debate-harness.js";
import { stubChatBody, type GateOverride, type GateRecord, type GateRequest } from "../support/preview-gate-stubs.js";
import { requestedReviewEdges, reviewArtifact, withRequestDerivedBearings } from "../support/reviewBearings.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import {
  provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // ONE encrypted owner: it configures the pool's content cipher, so the encrypted debate's rows are sealed.
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });
/** The owners' start values with the cap at 1 (the start value is 2): one point investigated, the rest over the cap. */
const ENGINE: EngineSettings = engineSettingsOf({ ...engineVersionPolicyStartValues(), investigate: { maxPerDebate: 1 } },
  { makers: PANEL_REFS.length, mapOpening: false });
/** The first non-root reviews answered "cannot assess" (non-root: the review offers the node's own sourced edges). */
const CANNOT_ASSESS_REVIEWS = 3;
/** The engine seal the investigator's calls carry (A13's pin; the code computes it, the prefix ties it to the brief). */
const ENGINE_SEAL_PREFIX = "bb9e93c3";
const INVESTIGATE_KEY = /^VERDICT:investigate:1(?::.+)?$/u;

type Outcome = "holds" | "fails" | "dead_end" | "unusable";
const WORDS = Object.freeze({
  missing: "The number of riders the route carries in the busiest hour.",
  found: "Comparable routes carry about two thousand riders in the busiest hour.",
  reason: "With that figure known, the point can be decided as written."
});
function investigatorReply(outcome: Outcome): string {
  if (outcome === "unusable") return "I am not able to answer this in the requested form.";
  return JSON.stringify({
    missing: WORDS.missing,
    found: outcome === "dead_end" ? "" : WORDS.found,
    basis: outcome === "dead_end" ? "none" : outcome === "fails" ? "assumption" : "established",
    outcome,
    reason: WORDS.reason
  });
}
const RESULT_OF: Readonly<Record<Exclude<Outcome, "unusable">, PointInvestigationResult>> =
  Object.freeze({ holds: "HOLDS", fails: "FAILS", dead_end: "DEAD_END" });

const contractOf = (chat: string): string | null => {
  try { return readFramedMaterial(wirePacket(chat)).contractId; } catch { return null; }
};
const recordContractOf = (request: GateRecord): string | null => contractOf(stubChatBody(request.provider, request.body));

/** The scripted answers, with the first non-root reviews "cannot assess" and every investigator answering `outcome`. */
function engineGates(question: string, outcome: Outcome): (request: GateRequest, chat: string) => GateOverride | null {
  const scripted = scriptedAnswers(question);
  let cannotAssessGiven = 0;
  return (request, chat) => {
    if (contractOf(chat) === POINT_INVESTIGATION_CONTRACT_ID) return { content: investigatorReply(outcome) };
    if (request.kind === "REVIEW" && requestedReviewEdges(chat).length > 0 && cannotAssessGiven < CANNOT_ASSESS_REVIEWS) {
      cannotAssessGiven += 1;
      return { content: withRequestDerivedBearings(reviewArtifact("cannot-assess",
        ["The point rests on a ridership figure the debate does not give."]), chat) };
    }
    return scripted(request, chat);
  };
}

type InvestigationRow = Readonly<{ node_id: string; investigation_order: number; result: string; basis: string | null;
  maker: string | null; provider_ref: string | null; model_id: string | null; raw_artifact_ref: string | null;
  standings_moved: boolean | null; content: unknown; sealed: boolean; attested: boolean }>;

async function investigationRows(runId: string): Promise<readonly InvestigationRow[]> {
  return (await database.pool.query<InvestigationRow>(
    `SELECT node_id::text AS node_id, investigation_order, result, basis, maker, provider_ref, model_id,
            raw_artifact_ref::text AS raw_artifact_ref, standings_moved, content,
            content_ciphertext IS NOT NULL AS sealed, content_attestation IS NOT NULL AS attested
       FROM ledger.point_investigation WHERE run_id=$1 ORDER BY investigation_order`, [runId])).rows;
}

/** Each node's author maker and the maker of its cross-maker review, from the ledger. */
async function makersOf(runId: string, nodeId: string): Promise<Readonly<{ author: string; reviewer: string; outcome: string }>> {
  const row = (await database.pool.query<{ author: string; reviewer: string; outcome: string }>(
    `SELECT author.maker AS author, reviewer.maker AS reviewer, review.outcome
       FROM ledger.node_review AS review
       JOIN core.node AS node ON node.run_id = review.run_id AND node.node_id = review.node_id
       JOIN ledger.raw_artifact AS author ON author.raw_artifact_id = node.provenance_ref
       JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
      WHERE review.run_id=$1 AND review.node_id=$2`, [runId, nodeId])).rows[0];
  if (row === undefined) throw new Error(`W2 test: no review for ${nodeId}`);
  return row;
}

async function investigatorCalls(runId: string) {
  return (await database.pool.query<{ call_site_key: string; outcome: string; contract_hash: string; model_role: string | null;
    raw_artifact_ref: string | null; maker: string | null; provider_ref: string | null; model: string | null }>(
    `SELECT entry.call_site_key, entry.outcome, entry.contract_hash, entry.model_role, entry.raw_artifact_ref::text AS raw_artifact_ref,
            artifact.maker, artifact.provider_ref, artifact.model_id AS model
       FROM ledger.ledger_entry AS entry
       LEFT JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = entry.raw_artifact_ref
      WHERE entry.run_id=$1 AND entry.action_kind='MODEL_CALL' AND entry.call_site_key LIKE 'VERDICT:investigate:%'
      ORDER BY entry.sequence`, [runId])).rows;
}

async function unassessedSubjects(answerId: string, answerVersion: number): Promise<readonly string[]> {
  return (await database.pool.query<{ subject_ref: string }>(
    `SELECT subject_ref FROM serve.condition_mark WHERE answer_id=$1 AND answer_version=$2 AND mark='UNASSESSED-AT-REDUCED-WEIGHT'
      ORDER BY subject_ref`, [answerId, answerVersion])).rows.map((row) => row.subject_ref);
}

/** One whole engine-2 debate whose investigator answers `outcome`; console.warn's JSON lines kept. */
async function investigationDebate(label: string, outcome: Outcome, encrypted = false) {
  const debate = await harness.admittedRun(label, { panelRefs: PANEL_REFS, depth: 1, length: GUIDANCE, engine: ENGINE,
    ...(encrypted ? { owner: owner! } : {}) });
  const gates = await harness.startGates({}, undefined, engineGates(debate.question, outcome));
  const composed = await harness.previewRunner(gates, "resend", { engine: { engineContractHash: engineContractHash() } });
  const warnings: string[] = [];
  const warn = vi.spyOn(console, "warn").mockImplementation((line: unknown) => { warnings.push(String(line)); });
  let result: Awaited<ReturnType<typeof harness.completedRun>>;
  try {
    result = await harness.completedRun(composed, debate, gates);
  } finally {
    warn.mockRestore();
  }
  const lines = warnings.flatMap((line) => {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      return parsed.kind === "DEBATEAI_POINT_INVESTIGATION" ? [Object.freeze({ line, parsed })] : [];
    } catch { return []; }
  });
  return { debate, gates, result, rows: await investigationRows(debate.runId), lines };
}

/** The link rules on the run's own graph, read back from the ledger as the review catch-up reads them. */
async function linkedFromLedger(runId: string, settings: EngineSettings) {
  const judgements = new JudgementRepository(database.pool);
  const snapshot = await new GraphRepository(database.pool).materialiseSnapshot(runId);
  const linked = engineLinkedGraph({
    engine: settings, snapshot,
    reviewedNodeIds: await judgements.readReviewedNodeIds(runId),
    disputedNodeIds: await judgements.readDisputedNodeIds(runId),
    cannotAssessNodeIds: await judgements.readCannotAssessNodeIds(runId),
    ownReplyEdgeIds: engineOwnReplyEdgeIdsOf(snapshot),
    investigated: engineInvestigatedStatuses(await new PointInvestigationRepository(database.pool).readPointInvestigationResultsForRun(runId))
  });
  if (linked === null) throw new Error("W2 test: engine 2 expected");
  return { snapshot, linked };
}

/** The run's receipt engine settings, as the runner and the catch-up read them. */
async function receiptSettings(runId: string): Promise<EngineSettings> {
  const basis = (await database.pool.query<{ envelope_basis: { engine?: unknown } }>(
    "SELECT envelope_basis FROM core.run WHERE run_id=$1", [runId])).rows[0]!.envelope_basis;
  return engineSettingsOfReceipt(engineReceiptSchema.parse(basis.engine));
}

/**
 * (a), (b), (c): one investigated point (order 1) and every other qualifying point over the cap; the investigator's call
 * under the seal, of a third maker, as a REVIEWER call; the stored row; the weights; the reduced-weight records.
 */
async function expectInvestigated(run: Awaited<ReturnType<typeof investigationDebate>>, outcome: Exclude<Outcome, "unusable">) {
  const { debate, rows, gates, result } = run;
  // (a) Two or more cannot-assess points qualified; cap 1: the first answered, the rest capped, in order.
  expect(rows.length).toBeGreaterThanOrEqual(2);
  expect(rows.map((row) => row.investigation_order)).toEqual(rows.map((_row, index) => index + 1));
  expect(rows.map((row) => row.result)).toEqual([RESULT_OF[outcome], ...rows.slice(1).map(() => "INVESTIGATION_CAPPED")]);
  for (const row of rows) expect((await makersOf(debate.runId, row.node_id)).outcome).toBe("cannot-assess");
  const [answered] = rows;
  // (b) One investigator call, through the scripted gate, under the engine seal, as a REVIEWER call at VERDICT:investigate:1.
  const calls = await investigatorCalls(debate.runId);
  expect(calls).toHaveLength(1);
  const call = calls[0]!;
  expect(call.call_site_key).toMatch(INVESTIGATE_KEY);
  expect(call.outcome).toBe("OK");
  expect(call.contract_hash).toBe(engineContractHash());
  expect(call.contract_hash.startsWith(ENGINE_SEAL_PREFIX)).toBe(true);
  expect(call.model_role).toBe("REVIEWER");
  expect(gates.requests.filter((request) => recordContractOf(request) === POINT_INVESTIGATION_CONTRACT_ID)
    .map((request) => request.answer)).toEqual(["OK"]);
  const makers = await makersOf(debate.runId, answered!.node_id);
  expect(call.maker).not.toBe(makers.author);
  expect(call.maker).not.toBe(makers.reviewer);
  // The stored row: the call's own maker, provider, model and reply; its words; its standings.
  expect(answered).toMatchObject({
    basis: outcome === "dead_end" ? "none" : outcome === "fails" ? "assumption" : "established",
    maker: call.maker, provider_ref: call.provider_ref, model_id: call.model, raw_artifact_ref: call.raw_artifact_ref
  });
  expect(answered!.standings_moved).not.toBeNull();
  const stored = await new PointInvestigationRepository(database.pool).readPointInvestigationsForRun(debate.runId);
  expect(stored[0]!.content).toEqual({ missing: WORDS.missing, found: outcome === "dead_end" ? "" : WORDS.found, reason: WORDS.reason });
  for (const row of stored.slice(1)) expect(row).toMatchObject({ investigator: null, content: null, standings: null, rawArtifactRef: null });
  // (c) The weights, on the run's own graph: the dispute weight on the FAILS point's score only; its links, and a dead
  // end's and a capped point's, at the cannot-assess weight; a held point's at full weight.
  const settings = await receiptSettings(debate.runId);
  expect(settings.investigate.maxPerDebate).toBe(1);
  expect(settings.links.cannotAssessWeight).toBe(0.66);
  const { snapshot, linked } = await linkedFromLedger(debate.runId, settings);
  const baseOf = (graph: Readonly<{ nodes: readonly Readonly<{ nodeId: string; baseStrength: number | null }>[] }>, nodeId: string) =>
    graph.nodes.find((node) => node.nodeId === nodeId)!.baseStrength;
  for (const row of rows) {
    const settled = investigatedStatusOf(row.result);
    const factor = baseOf(linked.snapshot, row.node_id)! / baseOf(snapshot, row.node_id)!;
    expect(factor, `${row.result} base`).toBeCloseTo(settled === "DISPUTE" ? settings.scoring.disputedWeight : 1, 12);
    const weight = settled === "AGREE" ? 1 : 0.66;
    const sourced = snapshot.arrows.filter((arrow) => arrow.sourceNodeId === row.node_id);
    expect(sourced.length, `${row.result} links`).toBeGreaterThan(0);
    for (const arrow of sourced) {
      const bearing = arrow.magnitudeStatus === "MEASURED" && arrow.strength !== null ? arrow.strength : 1;
      expect(linked.snapshot.arrows.find((each) => each.arrowId === arrow.arrowId)!.strength, `${row.result} link`)
        .toBeCloseTo(weight * bearing, 12);
    }
  }
  // The transcript graph's own reading agrees: the dispute factor on the FAILS point alone among the investigated ones,
  // and the runner's served final strengths are exactly these link rules' propagation.
  const graph = buildTranscriptEngineGraph(await readEngineGraphSource(database.pool, debate.runId, PANEL_REFS))!;
  expect(graph.engine).toBe(2);
  const investigatedIds = new Set(rows.map((row) => row.node_id));
  expect(graph.nodes.filter((node) => investigatedIds.has(node.nodeId) && node.disputeFactorApplied).map((node) => node.nodeId))
    .toEqual(outcome === "fails" ? [answered!.node_id] : []);
  expect(reproduceServedPropagation(graph)).toMatchObject({ ok: true });
  // The reduced-weight records: one per point no investigation settled (a dead end, a capped point), none for HOLDS / FAILS.
  const unsettled = rows.filter((row) => investigatedStatusOf(row.result) === null).map((row) => row.node_id).sort();
  expect(unsettled).toEqual(outcome === "dead_end" ? rows.map((row) => row.node_id).sort() : rows.slice(1).map((row) => row.node_id).sort());
  expect(await unassessedSubjects(result.answerId, 1)).toEqual(unsettled);
  return { graph, settings };
}

/** (g) The practice investigations block and the transcript engine graph count each investigation once. */
async function expectCountedOnce(runId: string, rows: readonly InvestigationRow[]) {
  const block = await readPracticeInvestigations(database.pool, runId, []);
  const answered = rows.filter((row) => row.result !== "INVESTIGATION_CAPPED" && row.result !== "INVESTIGATION_SKIPPED").length;
  expect(block).toMatchObject({
    run: answered, capped: rows.length - answered, skipped: 0,
    holds: rows.filter((row) => row.result === "HOLDS").length, fails: rows.filter((row) => row.result === "FAILS").length,
    deadEnd: rows.filter((row) => row.result === "DEAD_END").length,
    unavailable: rows.filter((row) => row.result === "INVESTIGATION_UNAVAILABLE").length
  });
  expect(block.cannotAssessReviews).toBeGreaterThanOrEqual(rows.length);
  const graph = buildTranscriptEngineGraph(await readEngineGraphSource(database.pool, runId, PANEL_REFS))!;
  expect(graph.investigations).toEqual(rows.map((row) => ({ nodeId: row.node_id, result: row.result })));
}

describe("R2a W2 — the runner's investigation step against a real database", () => {
  it("(a)(b)(c)(g) holds: one point investigated by a third maker under the seal, its links at full weight, the rest capped", async () => {
    const run = await investigationDebate("w2-holds", "holds");
    await expectInvestigated(run, "holds");
    // Legacy run: the words in the clear.
    expect(run.rows[0]).toMatchObject({ sealed: false, attested: false, content: { ...WORDS } });
    // No step failed, so no investigation line was written.
    expect(run.lines).toEqual([]);
    await expectCountedOnce(run.debate.runId, run.rows);
  }, 900_000);

  it("(c)(f)(g) fails: the dispute weight on its score, its links at the cannot-assess weight; a review catch-up keeps the run's rule and records", async () => {
    const run = await investigationDebate("w2-fails", "fails");
    await expectInvestigated(run, "fails");
    const runId = run.debate.runId;
    const rules = async () => (await database.pool.query<{ rule: unknown; rule_key: string | null }>(
      `SELECT judgement_selection_rule AS rule, judgement_selection_rule_key AS rule_key FROM ledger.propagation_run
        WHERE run_id=$1 ORDER BY at_seq`, [runId])).rows;
    const before = await rules();
    const runRule = before.at(-1)!;
    // (f) The catch-up's own dependencies, built with today's boot rule (MAXIMIZE_WEIGHTED_TAU) on purpose: engine 2 keeps
    // the run's own rule, read from its previous propagation version, never the boot rule.
    const fixture = harness.fixtureSettings();
    const bootRule = { ...fixture.judgementPolicy!.selectionRule };
    expect(runRule.rule).not.toEqual(bootRule);
    const dependencies = createPostgresReviewCatchUpDependencies({
      pool: database.pool, reviewers: [],
      scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test-layer:DR-144" },
      propagationContractHash: fixture.propagationContractHash, propagationNumberKind: fixture.propagationNumberKind,
      propagationProducer: fixture.propagationProducer, judgementSelectionRule: bootRule,
      compositionBudget: fixture.servePolicy!.compositionBudgets.high
    });
    const candidate = await dependencies.prepareVersion({ runId, answerId: run.result.answerId, fromVersion: 1 });
    const persisted = await candidate.persist();
    expect(persisted.answerVersion).toBe(2);
    const after = await rules();
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toEqual(runRule);
    expect(await unassessedSubjects(run.result.answerId, 2)).toEqual(await unassessedSubjects(run.result.answerId, 1));
    expect((await unassessedSubjects(run.result.answerId, 2)).length).toBeGreaterThan(0);
    // (g) After the catch-up's new version: still each investigation once.
    await expectCountedOnce(runId, run.rows);
  }, 900_000);

  it("(c)(e) dead end on an encrypted run: the row sealed under the point's own key and read back; every point at the reduced weight", async () => {
    const run = await investigationDebate("w2-dead-end", "dead_end", true);
    await expectInvestigated(run, "dead_end");
    // (e) Every row sealed: the sentinel in the clear column, the envelope and the attestation 0121's guard checked on
    // insert against the key it rebuilds (node_id::text), so a stored row proves the key.
    for (const row of run.rows) expect(row).toMatchObject({ content: CONTENT_JSON_SENTINEL, sealed: true, attested: true });
    const text = (await database.pool.query<{ row_text: string }>(
      `SELECT string_agg(to_jsonb(row_value)::text, ' ') AS row_text FROM ledger.point_investigation AS row_value WHERE run_id = $1`,
      [run.debate.runId])).rows[0]!.row_text;
    for (const secret of ["riders the route carries", "decided as written"]) expect(text).not.toContain(secret);
    await expectCountedOnce(run.debate.runId, run.rows);
  }, 900_000);

  it("(d) an unusable reply: INVESTIGATION_UNAVAILABLE naming the planned maker, provider and model id, and one code-only line", async () => {
    const run = await investigationDebate("w2-unusable", "unusable");
    const { debate, rows } = run;
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.map((row) => row.result)).toEqual(["INVESTIGATION_UNAVAILABLE", ...rows.slice(1).map(() => "INVESTIGATION_CAPPED")]);
    const unavailable = rows[0]!;
    // The planned investigator: its maker and provider, and the model id the run's discovered panel names for that
    // provider (`panelModelIds.get(providerRef) ?? providerRef`), stored past 0121's code-token CHECK.
    expect(unavailable.maker).not.toBeNull();
    expect(unavailable.provider_ref).not.toBeNull();
    expect(unavailable.model_id).toBe(PREVIEW_PROVIDER_REF_MODELS[unavailable.provider_ref!]);
    expect(unavailable).toMatchObject({ basis: null, raw_artifact_ref: null, standings_moved: null, content: {} });
    const makers = await makersOf(debate.runId, unavailable.node_id);
    expect(unavailable.maker).not.toBe(makers.author);
    expect(unavailable.maker).not.toBe(makers.reviewer);
    // The calls were made (and refused); none was accepted.
    const calls = await investigatorCalls(debate.runId);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call.call_site_key).toMatch(INVESTIGATE_KEY);
    expect(calls.some((call) => call.outcome === "OK")).toBe(false);
    // One content-free line: the runner's own JSON, codes and ids only, never the reply.
    expect(run.lines).toHaveLength(1);
    const { line, parsed } = run.lines[0]!;
    expect(Object.keys(parsed).sort()).toEqual(["callSiteKey", "code", "event", "kind", "runId"]);
    expect(parsed).toMatchObject({ kind: "DEBATEAI_POINT_INVESTIGATION", event: "INVESTIGATION_UNAVAILABLE", runId: debate.runId });
    expect(parsed.callSiteKey).toMatch(INVESTIGATE_KEY);
    expect(parsed.code).toMatch(/^[A-Z][A-Za-z0-9_]{0,63}$/u);
    expect(line).not.toContain("requested form");
    // The point stays at the reduced weight, as a capped one does.
    expect(await unassessedSubjects(run.result.answerId, 1)).toEqual(rows.map((row) => row.node_id).sort());
    await expectCountedOnce(debate.runId, rows);
  }, 900_000);
});
