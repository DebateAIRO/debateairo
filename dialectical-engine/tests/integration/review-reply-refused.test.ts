// A reviewer whose reply stays unreadable after every repair: the point it was reviewing is offered to another reviewer,
// as a point whose reviewer sat out already is, and the debate goes on to its answer and its story. Only when no other
// reviewer can take the point does the review end as it always has (NODE_REVIEW_UNAVAILABLE).
//
// The REAL WalkingSkeletonRunner, composed as apps/runner/src/main.ts composes it on the preview WITH the structure-repair
// route (tests/support/preview-debate-harness.ts, `structureRepair: true`), argues a four-maker debate over the two preview
// gates' unix-socket doubles (tests/support/preview-gate-stubs.ts) on a migrated embedded PostgreSQL. The chosen makers'
// review replies have their first key's colon doubled (no reader and no code repair reads them), and every structure
// repair is answered with words the reviewer never wrote, so the repair is refused too. One case writes a list closed one
// key too late and nothing else wrong: code moves the `]` itself, no repair is asked, and the review is the reviewer's
// own. One more writes that slip beside that doubled colon: code does not mend it, and the repair model's copy that moves
// the `]` is refused by the word check, which reads the key's name as a text of the still-open list. Integration suites
// are skipped by the CI gate: run this file by hand.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { STRUCTURE_REPAIR_CONTRACT_ID } from "@debateai/providers";
import {
  DEEPSEEK, HAIKU, MIMO, OWNER_CALL_CONCURRENCY, PANEL_REFS, QWEN, configured, previewDebateHarness, type AdmittedRun
} from "../support/preview-debate-harness.js";
import type { GateOverride, GateRequest } from "../support/preview-gate-stubs.js";
import { readFramedMaterial, wirePacket, type FramedMaterial } from "../support/framed-packet.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, database: () => database, stubClosers });

beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); }, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await database?.stop(); });

const MIMO_REF = PANEL_REFS.find((ref) => ref.includes("mimo"))!;
const MAKER_OF_REF = new Map(PANEL_REFS.map((ref) => [ref, configured(ref).maker]));

/**
 * The gate override: every REVIEW request of `models` is answered with a reply no reader reads (its first key's colon
 * doubled), and every structure repair with other words than the reviewer's, which the word check refuses.
 */
function unreadableReviews(models: ReadonlySet<string>) {
  const seen = { broken: 0, repairs: 0 };
  const override = (request: GateRequest, chat: string): GateOverride | null => {
    let contractId: string | null = null;
    try { contractId = readFramedMaterial(wirePacket(chat)).contractId; } catch { contractId = null; }
    if (contractId === STRUCTURE_REPAIR_CONTRACT_ID) {
      seen.repairs += 1;
      return { content: JSON.stringify({ outcome: "agree", reasons: ["Words the reviewer never wrote."], edge_bearings: [] }) };
    }
    if (request.kind !== "REVIEW" || !models.has(request.model)) return null;
    seen.broken += 1;
    return { content: "{\"outcome\"::\"agree\",\"reasons\":[\"The point holds on the material given.\"],\"edge_bearings\":[]}" };
  };
  return { seen, override };
}

/**
 * The gate override for a list closed one key too late: every REVIEW request of `models` is answered with its `reasons`
 * list left open around `edge_bearings` (one bearing for each edge the request names), its `]` written at the end, and
 * its first key's colon written as `colon` (`::` is a second fault, which code does not mend). Every structure repair is
 * answered with the reviewer's own words: the broken reply with its colon mended and its `]` moved to right before
 * `edge_bearings`, nothing else changed.
 */
function closedLateReviews(models: ReadonlySet<string>, colon: ":" | "::") {
  const seen = { broken: 0, repairs: 0, copies: [] as string[] };
  const override = (request: GateRequest, chat: string): GateOverride | null => {
    let material: FramedMaterial | null = null;
    try { material = readFramedMaterial(wirePacket(chat)); } catch { material = null; }
    const field = (name: string): string | undefined => material?.fields.find((entry) => entry.name === name)?.content;
    if (material?.contractId === STRUCTURE_REPAIR_CONTRACT_ID) {
      seen.repairs += 1;
      const broken = field("broken_reply") ?? "";
      const copy = broken.replace("\"outcome\"::", "\"outcome\":").replace("\",\"edge_bearings\":", "\"],\"edge_bearings\":")
        .replace(/\]\]\}$/u, "]}");
      seen.copies.push(copy);
      return { content: copy };
    }
    if (request.kind !== "REVIEW" || !models.has(request.model)) return null;
    seen.broken += 1;
    const edges = (JSON.parse(field("edges_sourced_by_this_node") ?? "[]") as unknown[]).length;
    const bearings = Array.from({ length: edges }, () => "0.5").join(",");
    return { content: `{"outcome"${colon}"agree","reasons":["The point holds on the material given.","edge_bearings":[${bearings}]]}` };
  };
  return { seen, override };
}

/** The node a review call site names (`JUDGE:review:<node>`, with or without a seat marker). */
const reviewedNode = (callSiteKey: string): string => callSiteKey.slice("JUDGE:review:".length).replace(/:seat:.*$/u, "");

/** Every recorded review of the run: the node, who reviewed it (the review's own artifact), and the node's author. */
async function recordedReviews(runId: string) {
  return (await database.pool.query<{ node_id: string; reviewer_maker: string; reviewer_ref: string; author_maker: string }>(
    `SELECT review.node_id::text, reviewer.maker AS reviewer_maker, reviewer.provider_ref AS reviewer_ref, author.maker AS author_maker
       FROM ledger.node_review AS review
       JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
       JOIN ledger.raw_artifact AS author ON author.raw_artifact_id = review.author_raw_artifact_ref
      WHERE review.run_id = $1`, [runId])).rows;
}

/**
 * MiMo was asked for reviews and every one of its review calls ended refused; each of those points was reviewed by
 * another maker, never its author's, and the record names the one that answered; no review is recorded under MiMo, every
 * point of the debate has its review, and the debate finished with its answer and its story.
 */
async function expectReviewedByAnotherMaker(debate: AdmittedRun, answerId: string): Promise<void> {
  const calls = await harness.modelCalls(debate.runId);
  const mimoReviews = calls.filter((call) => call.actor_ref === MIMO_REF && call.call_site_key.startsWith("JUDGE:review:"));
  expect(mimoReviews.length).toBeGreaterThanOrEqual(1);
  expect(mimoReviews.every((call) => call.outcome === "FAILED")).toBe(true);
  const refusedNodes = [...new Set(mimoReviews.map((call) => reviewedNode(call.call_site_key)))];

  const reviews = await recordedReviews(debate.runId);
  const mimoMaker = MAKER_OF_REF.get(MIMO_REF)!;
  for (const nodeId of refusedNodes) {
    const review = reviews.filter((row) => row.node_id === nodeId);
    expect(review, nodeId).toHaveLength(1);
    expect(review[0]!.reviewer_maker).not.toBe(mimoMaker);
    expect(review[0]!.reviewer_maker).not.toBe(review[0]!.author_maker);
    const answered = calls.filter((call) => call.call_site_key.startsWith("JUDGE:review:") && reviewedNode(call.call_site_key) === nodeId
      && call.outcome === "OK");
    expect(answered.map((call) => call.actor_ref)).toEqual([review[0]!.reviewer_ref]);
    expect(MAKER_OF_REF.get(review[0]!.reviewer_ref)).toBe(review[0]!.reviewer_maker);
  }
  expect(reviews.filter((row) => row.reviewer_maker === mimoMaker)).toEqual([]);
  const nodes = await database.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM core.node WHERE run_id = $1 AND generation_status IS DISTINCT FROM 'stale'`, [debate.runId]);
  expect(reviews).toHaveLength(Number(nodes.rows[0]!.count));

  const { answer, story, workItem } = await harness.servedAnswer(debate, answerId);
  expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
  expect(story).toMatchObject({ outcome: "READY", failureCode: null });
  expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
}

describe("a review reply that stays unreadable after every repair", () => {
  // Both review passes: the chains (calls side by side, the register's concurrency row) and today's serial pass (no row).
  it.each([
    { calls: "side by side", callConcurrency: OWNER_CALL_CONCURRENCY },
    { calls: "one at a time", callConcurrency: undefined }
  ])("calls $calls: the point is reviewed by another maker, and the debate finishes with its answer and its story", async ({ callConcurrency }) => {
    const debate = await harness.admittedRun("review-reply-refused", { panelRefs: PANEL_REFS, depth: 1 });
    const { seen, override } = unreadableReviews(new Set([MIMO]));
    const gates = await harness.startGates({}, undefined, override);
    const composed = await harness.previewRunner(gates, "resend", { structureRepair: true,
      ...(callConcurrency === undefined ? {} : { callConcurrency }) });
    const result = await harness.completedRun(composed, debate, gates);
    expect(seen.broken).toBeGreaterThanOrEqual(1);
    expect(seen.repairs).toBeGreaterThanOrEqual(1);
    await expectReviewedByAnotherMaker(debate, result.answerId);
  }, 600_000);

  it("a list closed one key too late and nothing else wrong: code moves the `]`, no repair is asked, and the review is the reviewer's own", async () => {
    const debate = await harness.admittedRun("review-reply-closed-late-mended", { panelRefs: PANEL_REFS, depth: 1 });
    const { seen, override } = closedLateReviews(new Set([MIMO]), ":");
    const gates = await harness.startGates({}, undefined, override);
    const composed = await harness.previewRunner(gates, "resend", { structureRepair: true, callConcurrency: OWNER_CALL_CONCURRENCY });
    const result = await harness.completedRun(composed, debate, gates);
    expect(seen.broken).toBeGreaterThanOrEqual(1);
    expect(seen.repairs).toBe(0);
    // Every review MiMo was asked for landed as MiMo's own, its reply's artifact naming the bracket code moved.
    const mimoCalls = (await harness.modelCalls(debate.runId))
      .filter((call) => call.actor_ref === MIMO_REF && call.call_site_key.startsWith("JUDGE:review:"));
    expect(mimoCalls).toHaveLength(seen.broken);
    expect(mimoCalls.every((call) => call.outcome === "OK")).toBe(true);
    const mimoReviews = (await database.pool.query<{ reply_repairs: string[] | null }>(
      `SELECT artifact.reply_repairs
         FROM ledger.node_review AS review
         JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = review.review_raw_artifact_ref
        WHERE review.run_id = $1 AND artifact.provider_ref = $2`, [debate.runId, MIMO_REF])).rows;
    expect(mimoReviews).toHaveLength(seen.broken);
    for (const review of mimoReviews) expect(review.reply_repairs).toContain("LIST_CLOSER_MOVED");
    const { answer, story, workItem } = await harness.servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(story).toMatchObject({ outcome: "READY", failureCode: null });
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
  }, 600_000);

  it("a list closed one key too late with a second fault: the repair model's copy that moves the `]` is refused, and another maker reviews the point", async () => {
    const debate = await harness.admittedRun("review-reply-closed-late", { panelRefs: PANEL_REFS, depth: 1 });
    const { seen, override } = closedLateReviews(new Set([MIMO]), "::");
    const gates = await harness.startGates({}, undefined, override);
    const composed = await harness.previewRunner(gates, "resend", { structureRepair: true, callConcurrency: OWNER_CALL_CONCURRENCY });
    const result = await harness.completedRun(composed, debate, gates);
    expect(seen.broken).toBeGreaterThanOrEqual(1);
    expect(seen.repairs).toBeGreaterThanOrEqual(1);
    // Each repair copy is strict JSON with the reviewer's words where they belong.
    for (const copy of seen.copies) {
      expect(JSON.parse(copy)).toMatchObject({ outcome: "agree", reasons: ["The point holds on the material given."] });
    }
    await expectReviewedByAnotherMaker(debate, result.answerId);
  }, 600_000);

  it("with no other reviewer left, the review ends as before (NODE_REVIEW_UNAVAILABLE), after every other maker was asked", async () => {
    const debate = await harness.admittedRun("review-reply-refused-everywhere", { panelRefs: PANEL_REFS, depth: 1 });
    const { seen, override } = unreadableReviews(new Set([DEEPSEEK, MIMO, QWEN, HAIKU]));
    const gates = await harness.startGates({}, undefined, override);
    const composed = await harness.previewRunner(gates, "resend", { structureRepair: true });
    let failure: unknown = null;
    try {
      await composed.runner.executeWorkItem(debate.workItemId);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "NODE_REVIEW_UNAVAILABLE" });
    expect(seen.broken).toBeGreaterThanOrEqual(3);
    const nodeId = /for node (\S+)$/u.exec((failure as Error).message)?.[1];
    expect(nodeId).toBeDefined();
    // The point was offered to each of the three makers that did not write it, and each reply was refused.
    const calls = await harness.modelCalls(debate.runId);
    const asked = calls.filter((call) => call.call_site_key.startsWith("JUDGE:review:") && reviewedNode(call.call_site_key) === nodeId);
    expect(asked.every((call) => call.outcome === "FAILED")).toBe(true);
    const author = (await database.pool.query<{ maker: string }>(
      `SELECT artifact.maker FROM core.node AS node JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = node.provenance_ref
        WHERE node.node_id = $1::uuid`, [nodeId])).rows[0]!.maker;
    const askedMakers = new Set(asked.map((call) => MAKER_OF_REF.get(call.actor_ref)));
    expect(askedMakers).toEqual(new Set([...MAKER_OF_REF.values()].filter((maker) => maker !== author)));
    expect(await recordedReviews(debate.runId)).toEqual([]);
  }, 600_000);
});
