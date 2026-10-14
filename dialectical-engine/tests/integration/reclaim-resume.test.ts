// A debate claimed again AFTER its first copy saved nodes (docs/reviews/2026-10-14-reclaim-strength-lineage/REPORT.md):
// a runner crash, restart, time limit or lost claim lets the work item's claim lapse, and the next copy that claims it
// must RESUME the debate (owner ruling 2026-10-14, the true resume; design docs/superpowers/specs/
// 2026-10-14-reclaim-resume-design.md): every call the first copy got answered is replayed from the record, never
// asked or paid again, the first copy's nodes are set aside (stale), and the debate is argued to the same answer as a
// copy that was never interrupted. Before this fix the second copy re-authored every site at full price and failed at
// propagation with STRENGTH_LINEAGE_UNRESOLVED.
//
// Each case admits ONE run into a seed copy of the migrated template (the reviewer turn is hashed off the run id, so the
// reference and the re-claimed copy must share it), argues it straight through in one copy (the reference), and in
// another loses the first copy partway (the keep-alive's time limit: `task.signal` aborted, the same abandon as a lost
// claim), lapses the claim and lets a second copy finish it. Integration suites are skipped by the CI gate: run this
// file by hand, alone.
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
import type { CallConcurrencyPolicy } from "@debateai/register";
import {
  OWNER_CALL_CONCURRENCY,
  PANEL_REFS,
  QWEN,
  RUN_RESILIENCE,
  previewDebateHarness,
  type AdmittedRun
} from "../support/preview-debate-harness.js";
import type { GateOverride, GateRequest } from "../support/preview-gate-stubs.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import { scriptedShapeAnswers, shapeForTest } from "../support/debate-shape-harness.js";
import { copyDatabase, dropDatabase } from "../support/saved-debate.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { MapChoiceRepository, mapPromptContractHash } from "@debateai/map";
import type { DebateShapeCeilingInput } from "@debateai/register";
import type { DebateShapeSettings } from "@debateai/contract";

let database: TestDatabase;
let admin: Pool;
const stubClosers: (() => Promise<void>)[] = [];
const MIGRATED_COPY = "reclaim_resume_migrated";
const databaseUrl = (name: string): string => database.connectionString.replace(/\/[^/?]+(?=\?|$)/u, `/${name}`);
const SHAPE_SETTINGS = { debateShape: { mapContractHash: mapPromptContractHash() } } as const;
const STANDARD: DebateShapeSettings = { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" };

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  admin = createPool(databaseUrl("postgres"), { max: 1 });
  await copyDatabase(admin, "debateai_s00", MIGRATED_COPY);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await admin?.end(); await database?.stop(); });

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const VOLATILE_KEYS = new Set([
  "created_at_seq", "at_seq", "sealed_at_seq", "relevant_as_of", "content_hash", "replay_handle", "input_hash", "recorded_at"
]);
type LiveDebate = Readonly<Record<string, unknown>>;

/**
 * What a run's LIVE debate holds (tests/support/saved-debate.ts's `savedDebate`, without what was set aside): its nodes
 * that are not stale, their edges, judgements and reviews, the answer, its fact bundle and composed text, and the map's
 * positions — every random id named by its place (`node#k` in save order). A stale node is named as the live node
 * saved from the same author reply, so a recorded call site naming it reads as the live node's.
 */
const rowsOf = async (pool: Pool, sql: string, values: readonly unknown[]): Promise<Record<string, unknown>[]> =>
  (await pool.query<{ row: Record<string, unknown> }>(sql, [...values])).rows.map((entry) => entry.row);
const LIVE_NODE_IDS = `SELECT node_id FROM core.node WHERE run_id=$1 AND generation_status <> 'stale'`;

/**
 * The run's random ids by their place: a live node as `node#k` (save order), a live edge as `edge#k`, and a stale node
 * as the live node saved from the same author reply, so a recorded call site naming it reads as the live node's.
 */
async function idNames(pool: Pool, runId: string) {
  const nodes = await rowsOf(pool, `SELECT to_jsonb(node) AS row FROM core.node AS node
    WHERE run_id=$1 AND generation_status <> 'stale' ORDER BY created_at_seq`, [runId]);
  const edges = await rowsOf(pool, `SELECT to_jsonb(edge) AS row FROM core.edge AS edge
    WHERE run_id=$1 AND source_node_id IN (${LIVE_NODE_IDS}) ORDER BY created_at_seq`, [runId]);
  const names = new Map<string, string>();
  nodes.forEach((node, index) => names.set(String(node.node_id), `node#${String(index)}`));
  edges.forEach((edge, index) => names.set(String(edge.edge_id), `edge#${String(index)}`));
  const stale = await pool.query<{ node_id: string; provenance_ref: string }>(
    `SELECT node_id::text, provenance_ref::text FROM core.node WHERE run_id=$1 AND generation_status = 'stale'`, [runId]);
  for (const node of stale.rows) {
    const same = nodes.find((entry) => String(entry.provenance_ref) === node.provenance_ref);
    names.set(node.node_id, same === undefined ? "stale-node" : names.get(String(same.node_id))!);
  }
  const nameIds = (text: string): string => text.replace(UUID, (id) => names.get(id.toLowerCase()) ?? "<id>");
  return { nodes, edges, names, nameIds };
}

async function liveDebate(pool: Pool, runId: string, answerId: string): Promise<LiveDebate> {
  const rows = (sql: string, values: readonly unknown[]) => rowsOf(pool, sql, values);
  const live = LIVE_NODE_IDS;
  const { nodes, edges, names, nameIds } = await idNames(pool, runId);
  const artifacts = await pool.query<{ raw_artifact_ref: string; call_site_key: string; actor_ref: string }>(
    `SELECT raw_artifact_ref::text, call_site_key, actor_ref FROM ledger.ledger_entry
      WHERE run_id=$1 AND raw_artifact_ref IS NOT NULL AND call_site_key IS NOT NULL ORDER BY sequence`, [runId]);
  for (const artifact of artifacts.rows) {
    names.set(artifact.raw_artifact_ref, `answer(${nameIds(artifact.call_site_key)} @ ${artifact.actor_ref})`);
  }
  const named = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, field: unknown) =>
    VOLATILE_KEYS.has(key) ? undefined : typeof field === "string" ? nameIds(field) : field));
  return Object.freeze({
    nodes: named(nodes),
    edges: named(edges),
    reduced: named(await rows(`SELECT to_jsonb(reduced) AS row FROM ledger.reduced_judgement AS reduced
      WHERE run_id=$1 AND node_id IN (${live}) ORDER BY at_seq`, [runId])),
    reviews: named(await rows(`SELECT to_jsonb(review) AS row FROM ledger.node_review AS review
      WHERE run_id=$1 AND node_id IN (${live}) ORDER BY at_seq`, [runId])),
    answer: named(await rows(`SELECT to_jsonb(answer) AS row FROM serve.answer AS answer WHERE answer_id=$1 ORDER BY answer_version`, [answerId])),
    factBundle: named(await rows(`SELECT to_jsonb(bundle) AS row FROM serve.fact_bundle AS bundle WHERE run_id=$1 ORDER BY version`, [runId])),
    composed: named(await rows(`SELECT to_jsonb(composed) AS row FROM serve.composed_text AS composed
      JOIN serve.fact_bundle AS bundle ON bundle.fact_bundle_id = composed.fact_bundle_id WHERE bundle.run_id=$1 ORDER BY composed.attempt`, [runId])),
    mapPositions: named(await rows(`SELECT to_jsonb(position) AS row FROM core.map_position AS position WHERE run_id=$1 ORDER BY root_index`, [runId]))
  });
}

type Answers = (request: GateRequest, chat: string) => GateOverride | null;
/** When the first copy is lost: handed each /complete request (and how many of its kind came before), true to lose it. */
type LoseAt = (request: GateRequest, seenOfKind: number) => boolean;

interface Variant {
  readonly label: string;
  readonly depth: number;
  readonly callConcurrency?: CallConcurrencyPolicy;
  readonly shape?: Readonly<{ shape: DebateShapeCeilingInput; settings: DebateShapeSettings }>;
  readonly answers: (question: string) => Answers;
  readonly loseAt: LoseAt;
  /** Run resilience (the preview's sit-out book) on both copies. */
  readonly resilience?: boolean;
  /** Asked first for every request the SECOND copy sends (the world changed while the run was lost); null: scripted. */
  readonly secondCopy?: (request: GateRequest) => GateOverride | null;
}

interface Outcome {
  readonly saved: LiveDebate;
  /** The run's nodes set aside (stale) at the end. */
  readonly staleNodes: number;
  /**
   * Debate shape: each argued answer's root as the map's reader serves it (the root in force), named, with whether that
   * node is stale; empty on a run without a map.
   */
  readonly mapRoots: readonly Readonly<{ answerId: string; root: string; stale: boolean }>[];
  /** Every call site answered OK (node ids named), in ledger order, with the copy that asked it (1 or 2; the reference is copy 1). */
  readonly okCalls: readonly Readonly<{ key: string; copy: 1 | 2 }>[];
  /** The first copy's saved node count when it was lost (the reference: 0). */
  readonly nodesWhenLost: number;
  /** Calls the first copy had sent and not yet seen answered when it was lost (their results may be lost with it). */
  readonly inFlightWhenLost: number;
  /** The second copy's answered review calls whose site names a node set aside (the earliest copy's id for that node). */
  readonly reviewsAtEarlierSites: number;
}

/** Runs one debate to its answer in a copy of the seed; `lose` loses its first copy partway and lets a second finish. */
async function argueInCopy(seedName: string, copy: string, seed: AdmittedRun, variant: Variant, lose: boolean): Promise<Outcome> {
  await copyDatabase(admin, seedName, copy);
  const pool = createPool(databaseUrl(copy));
  try {
    const harness = previewDebateHarness({ pool: () => pool, stubClosers });
    const scripted = variant.answers(seed.question);
    const abort = new AbortController();
    const seen = new Map<string, number>();
    let inFlightWhenLost = 0;
    let gatesRef: Awaited<ReturnType<typeof harness.startGates>> | null = null;
    const gates = await harness.startGates({}, undefined, (request, chat) => {
      if (lose && abort.signal.aborted && request.kind !== "PROBE") {
        const changed = variant.secondCopy?.(request) ?? null;
        if (changed !== null) return changed;
      }
      if (lose && !abort.signal.aborted && request.kind !== "PROBE") {
        const count = seen.get(request.kind) ?? 0;
        seen.set(request.kind, count + 1);
        if (variant.loseAt(request, count)) {
          // This call is answered (the vendor already has it); the keep-alive refuses the copy's NEXT call.
          inFlightWhenLost = (gatesRef?.arrivals ?? []).filter((arrival) => arrival.kind !== "PROBE" && arrival.answeredAt === null).length;
          abort.abort();
        }
      }
      return scripted(request, chat);
    });
    gatesRef = gates;
    const runnerOptions = {
      ...(variant.resilience === true ? { resilience: RUN_RESILIENCE } : {}),
      ...(variant.callConcurrency === undefined ? {} : { callConcurrency: variant.callConcurrency }),
      ...(variant.shape === undefined ? {} : SHAPE_SETTINGS)
    };
    let nodesWhenLost = 0;
    let lostAtSequence = 0;
    if (lose) {
      const first = await harness.previewRunner(gates, "resend", runnerOptions);
      await expect(first.runner.executeWorkItem(seed.workItemId, { executionLimitMs: 3_600_000, signal: abort.signal }))
        .rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
      nodesWhenLost = (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM core.node WHERE run_id=$1`, [seed.runId])).rows[0]!.n;
      lostAtSequence = Number((await pool.query<{ s: string }>(
        `SELECT coalesce(max(sequence), 0)::text AS s FROM ledger.ledger_entry WHERE run_id=$1`, [seed.runId])).rows[0]!.s);
      // The claim lapses (a crashed copy renews it no more); the next dispatch claims the work item again.
      await pool.query(`UPDATE core.work_item SET claim_deadline = clock_timestamp() - interval '1 second' WHERE work_item_id = $1`, [seed.workItemId]);
    }
    const result = await harness.completedRun(await harness.previewRunner(gates, "resend", runnerOptions), seed, gates);
    const calls = await pool.query<{ key: string; sequence: string }>(
      `SELECT call_site_key AS key, sequence::text FROM ledger.ledger_entry
        WHERE run_id=$1 AND action_kind='MODEL_CALL' AND outcome='OK' ORDER BY sequence`, [seed.runId]);
    const { nameIds } = await idNames(pool, seed.runId);
    const staleNodeIds = new Set((await pool.query<{ node_id: string }>(
      `SELECT node_id::text FROM core.node WHERE run_id=$1 AND generation_status='stale'`, [seed.runId])).rows.map((row) => row.node_id));
    const reviewsAtEarlierSites = calls.rows.filter((row) => lose && Number(row.sequence) > lostAtSequence
      && [...row.key.matchAll(UUID)].some(([id]) => row.key.startsWith("JUDGE:review:") && staleNodeIds.has(id.toLowerCase()))).length;
    const choice = await new MapChoiceRepository(pool).readMapChoiceForRun(seed.runId);
    const staleIds = new Set((await pool.query<{ node_id: string }>(
      `SELECT node_id::text FROM core.node WHERE run_id=$1 AND generation_status='stale'`, [seed.runId])).rows.map((row) => row.node_id));
    const mapRoots = (choice?.answers ?? []).flatMap((answer) => answer.rootNodeId === null ? []
      : [{ answerId: answer.answerId, root: nameIds(answer.rootNodeId), stale: staleIds.has(answer.rootNodeId) }]);
    return {
      mapRoots,
      saved: await liveDebate(pool, seed.runId, result.answerId),
      staleNodes: (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM core.node WHERE run_id=$1 AND generation_status='stale'`,
        [seed.runId])).rows[0]!.n,
      okCalls: calls.rows.map((row) => ({ key: nameIds(row.key), copy: lose && Number(row.sequence) > lostAtSequence ? 2 : 1 })),
      nodesWhenLost,
      inFlightWhenLost,
      reviewsAtEarlierSites
    };
  } finally {
    await pool.end();
    await dropDatabase(admin, copy);
  }
}

/** The reference and the re-claimed run of one admitted debate. */
async function referenceAndResumed(variant: Variant): Promise<{ reference: Outcome; resumed: Outcome }> {
  const seedName = `reclaim_${variant.label}_seed`;
  await copyDatabase(admin, MIGRATED_COPY, seedName);
  const seedPool = createPool(databaseUrl(seedName));
  let seed: AdmittedRun;
  try {
    seed = await previewDebateHarness({ pool: () => seedPool, stubClosers }).admittedRun(variant.label, {
      panelRefs: PANEL_REFS, depth: variant.depth,
      ...(variant.shape === undefined ? {} : { shape: variant.shape.shape, settings: variant.shape.settings })
    });
  } finally {
    await seedPool.end();
  }
  try {
    const reference = await argueInCopy(seedName, `reclaim_${variant.label}_reference`, seed, variant, false);
    const resumed = await argueInCopy(seedName, `reclaim_${variant.label}_resumed`, seed, variant, true);
    return { reference, resumed };
  } finally {
    await dropDatabase(admin, seedName);
  }
}

/**
 * The resume law: the re-claimed run's live debate is exactly the uninterrupted run's (the same nodes in the same plan
 * order, edges, judgements, reviews, answer, fact bundle and map positions), every node the first copy saved is set
 * aside, and a call the first copy got answered is asked again only when its result was lost with that copy (it was
 * still in flight).
 */
function expectResumed(reference: Outcome, resumed: Outcome, serial: boolean): void {
  expect(resumed.nodesWhenLost).toBeGreaterThan(0);
  expect(reference.staleNodes).toBe(0);
  expect(resumed.staleNodes).toBe(resumed.nodesWhenLost);
  expect(resumed.saved).toEqual(reference.saved);
  const firstCopy = new Set(resumed.okCalls.filter((call) => call.copy === 1).map((call) => call.key));
  const askedAgain = resumed.okCalls.filter((call) => call.copy === 2 && firstCopy.has(call.key)).map((call) => call.key);
  expect(askedAgain.length).toBeLessThanOrEqual(resumed.inFlightWhenLost);
  // One call at a time: the call in flight when the copy was lost was answered and recorded too, so nothing at all.
  if (serial) expect(askedAgain).toEqual([]);
  // Nothing the reference never asked, and every site the reference answered was answered once across both copies,
  // apart from the in-flight ones.
  expect(new Set(resumed.okCalls.map((call) => call.key))).toEqual(new Set(reference.okCalls.map((call) => call.key)));
  expect(resumed.okCalls.length - askedAgain.length).toBe(reference.okCalls.length);
}

it("one call at a time: a run lost at its first review (every opening position saved) resumes and argues to the same answer", async () => {
  const { reference, resumed } = await referenceAndResumed({
    label: "serial_first_review", depth: 1, answers: (question) => scriptedAnswers(question),
    loseAt: (request, seen) => request.kind === "REVIEW" && seen === 0
  });
  expectResumed(reference, resumed, true);
}, 900_000);

it("one call at a time: a run lost mid-arguing (replies saved, some reviewed) resumes and argues to the same answer", async () => {
  const { reference, resumed } = await referenceAndResumed({
    label: "serial_mid_arguing", depth: 2, answers: (question) => scriptedAnswers(question),
    loseAt: (request, seen) => request.kind === "REVIEW" && seen === 6
  });
  expectResumed(reference, resumed, true);
  // Nodes the first copy saved but never got reviewed are reviewed by this copy at the first copy's own site.
  expect(resumed.reviewsAtEarlierSites).toBeGreaterThan(0);
  expect(reference.reviewsAtEarlierSites).toBe(0);
}, 900_000);

it("calls together: a run lost mid-arguing resumes and argues to the same answer", async () => {
  const { reference, resumed } = await referenceAndResumed({
    label: "together_mid_arguing", depth: 2, callConcurrency: OWNER_CALL_CONCURRENCY,
    answers: (question) => scriptedAnswers(question),
    loseAt: (request, seen) => request.kind === "REVIEW" && seen === 6
  });
  expectResumed(reference, resumed, false);
}, 900_000);

it("a shaped run lost after its positions were saved resumes on its stored map and argues to the same answer", async () => {
  const shape = shapeForTest({ plan: "pro", makers: PANEL_REFS.length, settings: STANDARD });
  const { reference, resumed } = await referenceAndResumed({
    label: "shaped", depth: 1, shape: { shape, settings: STANDARD },
    answers: (question) => scriptedShapeAnswers(question),
    loseAt: (request, seen) => request.kind === "REVIEW" && seen === 2
  });
  expectResumed(reference, resumed, true);
  // The map's reader (the debate page, the publication copy) serves each argued answer's LIVE root, the reference's.
  expect(reference.mapRoots.length).toBeGreaterThan(1);
  expect(resumed.mapRoots.filter((entry) => entry.stale)).toEqual([]);
  expect(resumed.mapRoots).toEqual(reference.mapRoots);
}, 900_000);

it("a member busy on the second copy changes the rest of the debate: what was recorded is still never bought again, and the answer stands on one live tree", async () => {
  const { reference, resumed } = await referenceAndResumed({
    label: "busy_on_second_copy", depth: 1, resilience: true, answers: (question) => scriptedAnswers(question),
    loseAt: (request, seen) => request.kind === "REVIEW" && seen === 0,
    secondCopy: (request) => request.model === QWEN ? { unbilled: true } : null
  });
  expect(resumed.nodesWhenLost).toBeGreaterThan(0);
  // Every node the first copy saved is set aside; the answer stands on this copy's nodes alone (none of them stale).
  expect(resumed.staleNodes).toBe(resumed.nodesWhenLost);
  expect((resumed.saved.nodes as readonly Readonly<Record<string, unknown>>[]).every((node) => node.generation_status !== "stale")).toBe(true);
  // The opening positions the first copy got answered were replayed, never asked again.
  const opening = /^JUDGE(?::root:(?:secondary|[0-9]+))?(?::seat:[A-Za-z]+)?$/u;
  const openedBefore = resumed.okCalls.filter((call) => call.copy === 1 && opening.test(call.key)).map((call) => call.key);
  expect(openedBefore.length).toBeGreaterThan(0);
  expect(resumed.okCalls.filter((call) => call.copy === 2 && openedBefore.includes(call.key))).toEqual([]);
  // The busy member changed the debate: it is not the uninterrupted one.
  expect(resumed.saved).not.toEqual(reference.saved);
}, 900_000);
