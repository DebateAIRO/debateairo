// The debate shape (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md §3.3), end to end: the REAL
// WalkingSkeletonRunner composed as main.ts composes it on the preview (tests/support/preview-debate-harness.ts), booted
// with the shape settings, argues a run admitted with the sizes P2a freezes on its receipt, against scripted gates
// (tests/support/debate-shape-harness.ts), on a migrated embedded PostgreSQL. Integration suites are skipped by the CI
// gate: run this file by hand, alone.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CostEnvelopeGuard,
  projectedCallCeilingMicros,
  type CostEnvelopePhase,
  type ModelSpendEntry,
  type ModelSpendStore
} from "@debateai/budget";
import type { DebateShapeSettings } from "@debateai/contract";
import { createPool, migrate, type Pool } from "@debateai/db";
import { MAP_CONTRACT_IDS, mapPromptContractHash } from "@debateai/map";
import { PREVIEW_REQUEST_BODY_MAX_BYTES, type ProviderCostEnvelopeSeam } from "@debateai/providers";
import { debateShapeSiteCounts, type DebateShapeCeilingInput } from "@debateai/register";
import { readFramedMaterial, wirePacket, type FramedMaterial } from "../support/framed-packet.js";
import {
  OWNER_CALL_CONCURRENCY,
  PANEL_REFS,
  POLICY,
  TARGETS,
  previewDebateHarness,
  type AdmittedRun,
  type PreviewRunnerMoney
} from "../support/preview-debate-harness.js";
import { stubChatBody, type GateOverride, type GateRequest } from "../support/preview-gate-stubs.js";
import { runShapeDebate, scriptedShapeAnswers, shapeForTest, type ShapeDebateOptions, type ShapeScriptOptions } from "../support/debate-shape-harness.js";
import { copyDatabase, dropDatabase, savedDebate, type SavedDebate } from "../support/saved-debate.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { createRunInFlight } from "../../apps/runner/src/run-in-flight.js";
import { rootZeroKeepRoomMicros, rootZeroRoomAttempts } from "../../apps/runner/src/map-stage.js";
import { argumentLanguageDirective, questionLanguageFromRun } from "@debateai/kernel";

let database: TestDatabase;
/** A connection to the cluster's maintenance database, for making and dropping the per-run copies. */
let admin: Pool;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });
const SHAPE_SETTINGS = { debateShape: { mapContractHash: mapPromptContractHash() } } as const;
const STANDARD = { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const;
const DEEP = { depthMode: "adaptive", scrutiny: "deep", answerLength: "standard" } as const;
/** The migrated database every per-run copy is made from (nothing but the migrations in it). */
const MIGRATED_COPY = "debate_shape_migrated";
const databaseUrl = (name: string): string => database.connectionString.replace(/\/[^/?]+(?=\?|$)/u, `/${name}`);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  admin = createPool(databaseUrl("postgres"), { max: 1 });
  // As parallel-calls-debate.test.ts: the template is copied before any case admits a run into debateai_s00.
  await copyDatabase(admin, "debateai_s00", MIGRATED_COPY);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await admin?.end(); await database?.stop(); });

const q = (pool: Pool, sql: string, id: string) => pool.query(sql, [id]).then((result) => result.rows);
const argue = (label: string, plan: "free" | "pro", settings: DebateShapeSettings, depth: number,
  script: ShapeScriptOptions = {}, concurrency = true, more: ShapeDebateOptions = {}) =>
  runShapeDebate(harness, { label, plan, settings, depth, script, concurrency, ...more });

/** The framed material a gate request carried (Haiku's system text put back in front of its turns). */
const materialOf = (request: GateRequest): FramedMaterial => readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body)));
const fieldOf = (material: FramedMaterial, name: string): string | undefined => material.fields.find((entry) => entry.name === name)?.content;
/** A planned deeper leg or a scrutiny leg: a reply or a defence with no chosen point (round 1 points carry one). */
const isExchangeLeg = (material: FramedMaterial): boolean =>
  fieldOf(material, "position_under_debate") !== undefined && fieldOf(material, "consideration") === undefined;
/** The round of a shape leg key (`JUDGE:<defender|critic>:root<r>:r<k>:p<n>`), or null for any other key. */
const roundOf = (key: string): number | null => {
  const match = /^JUDGE:(?:defender|critic):root[0-9]+:r([0-9]+):/u.exec(key);
  return match === null ? null : Number(match[1]);
};
/** The key of a scrutiny leg at `depth`: rounds depth+1 … depth+R (plan Task 14: R = the receipt's scrutinyRoundsPerPoint). */
const scrutinyKey = (shape: DebateShapeCeilingInput, depth: number): RegExp => new RegExp(
  `^JUDGE:(defender|critic):root[0-9]+:r(${Array.from({ length: shape.scrutinyRoundsPerPoint }, (_unused, step) => String(depth + 1 + step)).join("|")}):`, "u");
/** Who wrote each node of the run: the author maker its reduced judgement records. */
const authorMakers = async (pool: Pool, runId: string): Promise<Map<string, string>> => new Map((await q(pool,
  `SELECT DISTINCT node_id::text AS id, disagreement->'panel'->>'authorMaker' AS maker FROM ledger.reduced_judgement WHERE run_id=$1`, runId))
  .map((row) => [String(row.id), String(row.maker)]));

describe("the debate shape in the runner (spec §3.3)", () => {
  it("argues P assigned positions, K points each, one cross-reply each, adaptive exchanges, and serves an answer", async () => {
    const { debate, gates, shape, result, calls } = await argue("assigned", "free", STANDARD, 2);
    const okKeys = calls.filter((call) => call.outcome === "OK").map((call) => call.call_site_key);
    expect(okKeys.filter((key) => key.startsWith("MAP:"))).toEqual(expect.arrayContaining(["MAP:angles", "MAP:merge", "MAP:choose"]));
    const assigned = gates.requests.filter((request) => request.kind === "JUDGE"
      && materialOf(request).contractId.startsWith("judge.assigned-root."));
    expect(assigned).toHaveLength(shape.answers);
    expect(okKeys.filter((key) => key.startsWith("JUDGE:cross-root:"))).toHaveLength(shape.answers);
    const pointKeys = okKeys.filter((key) => /^JUDGE:(defender|critic):root[0-9]+:r1:/u.test(key));
    expect(pointKeys.length).toBeLessThanOrEqual(shape.answers * shape.pointsPerAnswer);
    expect(pointKeys.length).toBeGreaterThanOrEqual(shape.answers);
    const deeper = okKeys.filter((key) => /^JUDGE:critic:root[0-9]+:r2:/u.test(key));
    expect(deeper.length).toBeLessThanOrEqual(2 * shape.answers * shape.deeperTopPoints);
    const { answer } = await harness.servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    const positions = await q(database.pool, `SELECT answer_id, root_index FROM core.map_position WHERE run_id=$1 ORDER BY root_index`, debate.runId);
    expect(positions.map((row) => row.root_index)).toEqual(Array.from({ length: shape.answers }, (_unused, index) => index));
  }, 600_000);

  // P2L Task 17 (pre-flight PF-L52): a shaped run's every call — map, judge legs, panel, review, writer, checker and
  // story — carries the run's locked language (the named sentence and the question_language field, last), never today's
  // fallback directive; the locked Romanian replies are accepted, not refused. The language is set on startRun directly.
  it("question language: every captured prompt of a shape run carries the locked sentence and field, never the fallback form", async () => {
    const run = await runShapeDebate(harness, { label: "question-language", language: { tag: "ro", name: "Romanian" }, question: "Ar trebui sa renuntam la leu?" });
    const { prompts } = run;
    expect(prompts.length).toBeGreaterThan(0);
    // Review M14: every call kind the claim names really reached a gate (a kind that never ran proves nothing).
    expect([...new Set(run.gates.requests.map((request) => request.kind))]).toEqual(expect.arrayContaining(
      ["MAP", "JUDGE", "PANEL", "REVIEW", "COMPOSE", "EVALUATOR", "STORYTELLER", "STORY_CHECKER"]));
    for (const prompt of prompts) {
      expect(prompt.system).toContain("in Romanian, the language this debate was set to");
      expect(prompt.system).not.toContain("the same language as the question");
      // Review M14: never today's vague directive either (argumentLanguageDirective's own ", the language of the
      // question," — the bare phrase is also in the sealed story pack's owner text, which is not the directive), and the
      // field carries the lock itself.
      expect(prompt.system).not.toContain(", the language of the question,");
      expect(prompt.system).not.toContain(argumentLanguageDirective("Romanian"));
      expect(prompt.fields.at(-1)?.name).toBe("question_language");
      expect(JSON.parse(prompt.fields.at(-1)!.content)).toEqual({ code: "ro", name: "Romanian" });
    }
    expect(run.result.kind).toBe("COMPLETED");   // the locked Romanian replies are accepted, not refused (PF-L52)
  }, 600_000);

  // Amendment 2026-10-13 (final review note 6): the independent check of P2a's ceiling — what the run really made,
  // against what the receipt priced (`debateShapeSiteCounts`), at depth 2 with fixed rounds (every chain runs). Task 13
  // note: a neutral label ("measured" reads as an empirical claim, which the fixture composition map does not rate).
  it("never makes more nodes or map sites than the receipt priced (fixed rounds, on the ledger)", async () => {
    const fixed = { depthMode: "fixed", scrutiny: "standard", answerLength: "standard" } as const;
    // Final review I-3: the choose names four answers, so the run argues every position the receipt priced (P = 4).
    const { debate, shape, calls } = await argue("ceiling", "pro", fixed, 2, { chooseAnswers: 4 });
    const priced = debateShapeSiteCounts(shape, 2);
    const nodes = await q(database.pool, `SELECT count(*)::int AS n FROM core.node WHERE run_id=$1`, debate.runId);
    expect(nodes[0]!.n).toBeLessThanOrEqual(priced.nodes);
    const mapKeys = new Set(calls.filter((call) => call.call_site_key.startsWith("MAP:")).map((call) => call.call_site_key));
    expect(mapKeys.size).toBeLessThanOrEqual(priced.mapSites);
    const crossKeys = new Set(calls.filter((call) => call.call_site_key.startsWith("JUDGE:cross-root:")).map((call) => call.call_site_key));
    expect(crossKeys.size).toBeLessThanOrEqual(priced.crossNodes);
  }, 600_000);

  // Binding note 1 (Tasks 9/13, THE MONEY LAW): the plan builds all K chains, the price covers only the top X per
  // position in adaptive mode, so the deeper legs of the chains not kept must never be sent. Counted on the ledger, site
  // kind by site kind, against `debateShapeSiteCounts` — and the deeper legs that WERE kept did run.
  it("an adaptive Pro run stays within the priced sites, site kind by site kind, and its kept chains go deeper", async () => {
    const depth = 3;
    // Final review I-3: the choose names four answers, so all P = 4 priced positions are argued — no position's worth of
    // slack for a runner that kept every chain on one of them.
    const { debate, shape, calls } = await argue("adaptive-ceiling", "pro", STANDARD, depth, { chooseAnswers: 4 });
    const priced = debateShapeSiteCounts(shape, depth);
    const kinds = {
      map: (key: string) => key.startsWith("MAP:"),
      positions: (key: string) => key === "JUDGE" || key.startsWith("JUDGE:root:"),
      points: (key: string) => roundOf(key) === 1,
      cross: (key: string) => key.startsWith("JUDGE:cross-root:"),
      deeper: (key: string) => { const round = roundOf(key); return round !== null && round > 1 && round <= depth; },
      scrutiny: (key: string) => { const round = roundOf(key); return round !== null && round > depth; }
    };
    const sites = (kind: (key: string) => boolean) => new Set(calls.map((call) => call.call_site_key).filter(kind)).size;
    const rows = (kind: (key: string) => boolean) => calls.filter((call) => kind(call.call_site_key)).length;
    const measured = Object.fromEntries(Object.entries(kinds).map(([name, kind]) => [name, sites(kind)]));
    expect(measured.map).toBeLessThanOrEqual(priced.mapSites);
    expect(measured.positions).toBeLessThanOrEqual(priced.positionNodes);
    expect(measured.points).toBeLessThanOrEqual(priced.pointNodes);
    expect(measured.cross).toBeLessThanOrEqual(priced.crossNodes);
    expect(measured.deeper).toBeLessThanOrEqual(priced.deeperNodes);
    expect(measured.scrutiny).toBeLessThanOrEqual(priced.scrutinyNodes);
    // Every site's calls stay within its own allowance (the sealed judge attempts plus the one final retry).
    const allowance = POLICY.bounds.JUDGE.maxAttempts + 1;
    for (const [name, kind] of Object.entries(kinds)) {
      expect(rows(kind), name).toBeLessThanOrEqual(sites(kind) * allowance);
    }
    // The kept chains really went deeper: the price is not met by arguing nothing past round 1.
    expect(measured.deeper).toBeGreaterThan(0);
    // Every planned round ran, down to the depth (the δ case's control: δ = 0 never stops early).
    expect(calls.filter((call) => call.outcome === "OK" && roundOf(call.call_site_key) === depth).length).toBeGreaterThan(0);
    // At most `deeperTopPoints` chains per position reach round 2 (each chain one reply and one defence per round).
    expect(calls.filter((call) => call.outcome === "OK" && roundOf(call.call_site_key) === 2).length)
      .toBeLessThanOrEqual(2 * shape.answers * shape.deeperTopPoints);
    // Final review I-3, PER POSITION: every priced position was argued, and each kept at most `deeperTopPoints` chains
    // into round 2. A leg's key names its own plan position p<n>; the plan numbers the roots, then every round-1 point,
    // then the cross-replies, then each chain's round-2 reply and defence side by side — so the round-2 block starts at
    // s = roots + points + cross-replies, and the chain of a round-2 leg at n is floor((n − s) / 2).
    const okSites = (kind: (key: string) => boolean) => new Set(calls.filter((call) => call.outcome === "OK" && kind(call.call_site_key))
      .map((call) => call.call_site_key));
    expect(okSites(kinds.positions).size).toBe(shape.answers);
    const roundTwoStart = shape.answers + okSites(kinds.points).size + okSites(kinds.cross).size;
    const leg = (key: string) => { const match = /^JUDGE:(?:defender|critic):root([0-9]+):r[0-9]+:p([0-9]+)$/u.exec(key)!; return { root: Number(match[1]), at: Number(match[2]) }; };
    const chainsByRoot = new Map<number, Set<number>>();
    for (const key of okSites((key) => roundOf(key) === 2)) {
      const { root, at } = leg(key);
      expect(at, key).toBeGreaterThanOrEqual(roundTwoStart);
      chainsByRoot.set(root, new Set([...(chainsByRoot.get(root) ?? []), Math.floor((at - roundTwoStart) / 2)]));
    }
    expect(chainsByRoot.size).toBeGreaterThan(0);
    for (const [root, chains] of chainsByRoot) expect(chains.size, `root ${String(root)}`).toBeLessThanOrEqual(shape.deeperTopPoints);
    const nodes = await q(database.pool, `SELECT count(*)::int AS n FROM core.node WHERE run_id=$1`, debate.runId);
    expect(nodes[0]!.n).toBeLessThanOrEqual(priced.nodes);
  }, 600_000);

  it("keeps every invariant: roots alone servable, every counting node judged, reviewed by another maker and restated, an acyclic graph", async () => {
    const { debate, result } = await argue("invariants", "free", STANDARD, 2);
    const pool = database.pool;
    const roots = await q(pool, `SELECT node_id::text AS id FROM core.node WHERE run_id=$1 AND parent_node_id IS NULL`, debate.runId);
    // Pre-flight PF-B51: serve.answer has no served-node column; the served root is the UNSERVED-MAKER-POSITION
    // record's subject (buildUnservedMakerPositionRecord), on the answer's latest version.
    const served = await q(pool, `SELECT subject_ref AS id FROM serve.condition_mark WHERE answer_id=$1
      AND mark='UNSERVED-MAKER-POSITION' ORDER BY answer_version DESC LIMIT 1`, result.answerId);
    expect(served).toHaveLength(1);
    expect(roots.map((row) => row.id)).toContain(served[0]!.id);
    const unjudged = await q(pool, `SELECT node.node_id FROM core.node AS node WHERE node.run_id=$1
      AND (NOT EXISTS (SELECT 1 FROM ledger.reduced_judgement AS judgement WHERE judgement.node_id = node.node_id)
        OR NOT EXISTS (SELECT 1 FROM core.stranger_restatement AS restatement WHERE restatement.subject_kind='node' AND restatement.subject_id = node.node_id))`, debate.runId);
    expect(unjudged).toEqual([]);
    // Pre-flight PF-B51: the makers are on the two raw artifacts a review names (as database.test.ts reads them).
    const sameMakerReviews = await q(pool, `SELECT review.node_id FROM ledger.node_review AS review
      JOIN ledger.raw_artifact AS author ON author.raw_artifact_id = review.author_raw_artifact_ref
      JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
      WHERE review.run_id=$1 AND author.maker = reviewer.maker`, debate.runId);
    expect(sameMakerReviews).toEqual([]);
    const edges = await q(pool, `SELECT source_node_id::text AS source, target_node_id::text AS target FROM core.edge
      WHERE run_id=$1 AND target_kind='NODE'`, debate.runId);
    const next = new Map<string, string[]>();
    for (const edge of edges) next.set(edge.source, [...(next.get(edge.source) ?? []), edge.target]);
    const visiting = new Set<string>(); const done = new Set<string>();
    const cyclic = (node: string): boolean => {
      if (done.has(node)) return false; if (visiting.has(node)) return true;
      visiting.add(node); const found = (next.get(node) ?? []).some(cyclic); visiting.delete(node); done.add(node); return found;
    };
    expect([...next.keys()].some(cyclic)).toBe(false);
  }, 600_000);

  // Binding note 2 (Task 13's writer rule, spec §3.3 step 3): a point, reply or defence is written by a maker other than
  // the one it answers — read from what the run recorded of each node's author, never from the plan. A cross-reply is
  // its own position's answer to ANOTHER maker's: it defends its parent (the same maker, by design) and attacks a root
  // of another maker.
  it("a leg is never written by the maker it answers: on the saved graph, every leg's author differs from its parent's", async () => {
    const { debate } = await argue("writer-rule", "pro", STANDARD, 2);
    const makers = await authorMakers(database.pool, debate.runId);
    const edges = await q(database.pool, `SELECT source_node_id::text AS source, target_node_id::text AS target FROM core.edge
      WHERE run_id=$1 AND target_kind='NODE'`, debate.runId);
    const children = await q(database.pool, `SELECT node_id::text AS id, parent_node_id::text AS parent FROM core.node
      WHERE run_id=$1 AND parent_node_id IS NOT NULL`, debate.runId);
    expect(children.length).toBeGreaterThan(0);
    const legs = children.filter((child) => edges.every((edge) => edge.source !== child.id || edge.target === child.parent));
    const crossReplies = children.filter((child) => !legs.includes(child));
    expect(legs.length).toBeGreaterThan(crossReplies.length);
    expect([...legs, ...crossReplies].every((child) => makers.has(child.id) && makers.has(child.parent))).toBe(true);
    expect(legs.filter((child) => makers.get(child.id) === makers.get(child.parent))
      .map((child) => `${makers.get(child.id)!} answered ${makers.get(child.parent)!}`)).toEqual([]);
    expect(crossReplies.length).toBeGreaterThan(0);
    for (const reply of crossReplies) {
      expect(makers.get(reply.id)).toBe(makers.get(reply.parent));
      const attacked = edges.filter((edge) => edge.source === reply.id && edge.target !== reply.parent).map((edge) => makers.get(edge.target));
      expect(attacked.length).toBeGreaterThan(0);
      expect(attacked).not.toContain(makers.get(reply.id));
    }
  }, 600_000);

  it.each([
    ["the angle planner fails", new Set(["ANGLES"] as const), "MAP_ANGLES_FALLBACK"],
    ["the merge fails", new Set(["MERGE"] as const), "MAP_MERGE_FALLBACK"],
    ["the choose fails", new Set(["CHOOSE"] as const), "MAP_CHOOSE_FALLBACK"],
    ["the choose names one answer", new Set(["CHOOSE_ONE_ANSWER"] as const), "ANSWERS_FILLED"],
    ["only one list arrives", new Set(["LISTS_BUT_ONE"] as const), "MAP_UNAVAILABLE_TODAYS_OPENING"]
  ])("%s: the run still ends with an answer, and the mark rides it with its record", async (_label, fail, mark) => {
    const { debate, result } = await argue(`fallback-${mark}`, "free", STANDARD, 1, { fail });
    expect(result.kind).toBe("COMPLETED");
    const rows = await q(database.pool, `SELECT mark, scope, call_site_key FROM serve.condition_mark WHERE answer_id=$1`, result.answerId);
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ mark, scope: "answer", call_site_key: null })]));
    if (mark === "MAP_UNAVAILABLE_TODAYS_OPENING") {
      const roots = await q(database.pool, `SELECT count(*)::int AS n FROM core.node WHERE run_id=$1 AND parent_node_id IS NULL`, debate.runId);
      expect(roots[0]!.n).toBeLessThanOrEqual(shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD }).answers);
    }
  }, 600_000);

  it("a money stop mid-map ends with an answer: root 0 is argued, the stop is disclosed, nothing else is asked", async () => {
    const { debate, result, calls } = await argue("money-stop", "free", STANDARD, 2, { stopAt: "MERGE" });
    expect(result.kind).toBe("COMPLETED");
    expect(calls.some((call) => call.call_site_key === "MAP:choose")).toBe(false);
    expect(calls.filter((call) => call.call_site_key.startsWith("JUDGE:root:"))).toEqual([]);
    // Final review M-5: root 0 IS argued — one answered root-0 call — and it argues the answer the code's map chose.
    expect(calls.filter((call) => call.call_site_key === "JUDGE" && call.outcome === "OK")).toHaveLength(1);
    expect(await q(database.pool, `SELECT root_index FROM core.map_position WHERE run_id=$1`, debate.runId)).toEqual([{ root_index: 0 }]);
    const rows = await q(database.pool, `SELECT mark FROM serve.condition_mark WHERE answer_id=$1`, result.answerId);
    expect(rows.map((row) => row.mark)).toEqual(expect.arrayContaining(["ENVELOPE_EXHAUSTED", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK"]));
  }, 600_000);

  /**
   * Binding note 4 (controller rulings T12-R0, T12-R1, T12-R2): a HOSTED runner — every target priced, and the run's
   * money held by a REAL CostEnvelopeGuard seam (the BODY ceiling its policy row gives, with the answer's reserve held
   * back) — on the preview composition. One call at a time, so the seam's decisions follow the gate's order exactly.
   * A first run with room to spare measures what each call projects (`seamLog`); the second run's ceiling is cut from
   * those measurements.
   */
  describe("a hosted runner's money during the map (T12-R0)", () => {
    /** One micro-unit per token each way: a call projects ceil(bytes / 2) + max_tokens; the stub bills 100 + 50 tokens. */
    const CHEAP = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
    /** Four times dearer: the other makers when root 0's maker is the cheap one. */
    const DEAR = Object.freeze({ inputMicrosPerMillionTokens: 4_000_000, outputMicrosPerMillionTokens: 4_000_000 });
    type Price = Readonly<{ inputMicrosPerMillionTokens: number; outputMicrosPerMillionTokens: number }>;
    /** The answer's reserve (80%), so the BODY ceiling is a fifth of the run's and the answer has room to be written. */
    const RESERVE_BASIS_POINTS = 8_000;
    type SeamCall = { phase: CostEnvelopePhase; providerRef: string; projected: number; room: number; spent: number; outcome: string };

    function hostedMoney(bodyCeilingMicros: number, priceOf: (providerRef: string) => Price) {
      const charges: ModelSpendEntry[] = [];
      const spentOf = (runId: string) => charges.filter((entry) => entry.runId === runId && entry.spendSource === "RUN")
        .reduce((sum, entry) => sum + entry.chargeMicros, 0);
      const store: ModelSpendStore = {
        recordSpend: async (entry) => { charges.push(entry); },
        readRunSpentMicros: async (runId) => spentOf(runId),
        readRunStorySpentMicros: async () => 0,
        readDaySpentMicros: async () => 0,
        admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
      };
      // As main.ts: the guard counts each call's projection while it is in flight (`inFlight: moneyInFlight`).
      const guard = new CostEnvelopeGuard({ store, policy: {
        perRunCeilingMicros: bodyCeilingMicros * 5, dailyCeilingMicros: Number.MAX_SAFE_INTEGER,
        serveReserveBasisPoints: RESERVE_BASIS_POINTS, serveOverrunBasisPoints: 0
      }, inFlight: createRunInFlight() });
      const seamLog: SeamCall[] = [];
      /** The story spends its own envelope (spec §8): not what this case measures, so its seam admits every call. */
      const storySeam: ProviderCostEnvelopeSeam = {
        assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined
      };
      const money: PreviewRunnerMoney = {
        // As main.ts: each target's gateway gets a seam priced at THAT target's price.
        buildCostEnvelopeSeam: (providerRef) => (runId, phase, sharedWall) => {
          const price = priceOf(providerRef);
          const seam = guard.providerSeam({ runId, price, requireReportedUsage: true, phase, sharedWall });
          return Object.freeze({
            assertCallAllowed: async (projection: Parameters<ProviderCostEnvelopeSeam["assertCallAllowed"]>[0]) => {
              const entry: SeamCall = { phase, providerRef, projected: projectedCallCeilingMicros(price, projection),
                room: projection.keepRoomMicros ?? 0, spent: spentOf(runId), outcome: "ADMITTED" };
              seamLog.push(entry);
              try {
                return await seam.assertCallAllowed(projection);
              } catch (error) {
                entry.outcome = String((error as { code?: unknown }).code ?? (error as Error).message);
                throw error;
              }
            },
            recordCall: (observed: Parameters<ProviderCostEnvelopeSeam["recordCall"]>[0]) => seam.recordCall(observed),
            assertUsageReported: (observed: Parameters<ProviderCostEnvelopeSeam["assertUsageReported"]>[0]) => seam.assertUsageReported(observed),
            ...(seam.releaseInFlight === undefined ? {} : { releaseInFlight: () => seam.releaseInFlight!() })
          });
        },
        buildStoryCostEnvelopeSeam: () => () => storySeam,
        providerPrices: new Map(TARGETS.map((target) => [target.providerRef, priceOf(target.providerRef)]))
      };
      return { money, seamLog, charges };
    }

    /**
     * One run with money to spare, as the seam saw it: the map's calls (the only ones that name root 0's room) and root
     * 0's first call right after them. One call at a time, so the seam admits each call right before it is sent.
     */
    async function measured(label: string, question: string, priceOf: (providerRef: string) => Price) {
      const probe = hostedMoney(1_000_000_000, priceOf);
      const run = await argue(label, "free", STANDARD, 1, {}, false, { money: probe.money, question });
      const body = probe.seamLog.filter((entry) => entry.phase === "BODY");
      const mapCalls = body.filter((entry) => entry.room > 0);
      expect(mapCalls).toHaveLength(run.gates.requests.filter((request) => request.kind === "MAP").length);
      expect(mapCalls.length).toBeGreaterThan(3);
      const rootZero = body[body.indexOf(mapCalls.at(-1)!) + 1]!;
      expect(rootZero.room).toBe(0);
      // Root 0's first grader: the first panel request after root 0's author call (one call at a time).
      const rootZeroAsked = run.gates.requests.findIndex((request) => request.kind === "JUDGE" && materialOf(request).contractId.startsWith("judge.assigned-root."));
      const graderModel = run.gates.requests.slice(rootZeroAsked).find((request) => request.kind === "PANEL")!.model;
      const rootZeroGrader = TARGETS.find((target) => PANEL_REFS.includes(target.providerRef) && target.model === graderModel)!.providerRef;
      return { mapCalls, rootZero, rootZeroGrader };
    }
    /**
     * The first map call after the first one (mid-map) at which a ceiling exists that admits every earlier map call
     * with root 0's room kept and root 0 after them, and refuses this call as `refusal` says: `MONEY` — it crosses even
     * without the room; `ROOM` — it fits without the room, not with it.
     */
    function stopAt(mapCalls: readonly SeamCall[], rootZero: SeamCall, refusal: "MONEY" | "ROOM") {
      for (let index = 1; index < mapCalls.length; index += 1) {
        const call = mapCalls[index]!;
        const lowest = Math.max(...mapCalls.slice(0, index).map((entry) => entry.spent + entry.projected + entry.room),
          call.spent + rootZero.projected);
        const crossing = call.spent + call.projected;
        if (refusal === "MONEY" && lowest < crossing) return { index, ceiling: lowest + Math.floor((crossing - lowest) / 2) };
        // ROOM: any ceiling from max(lowest, crossing) up to (not including) crossing + room; the midpoint, never an edge.
        const fits = Math.max(lowest, crossing);
        if (refusal === "ROOM" && fits < crossing + call.room) return { index, ceiling: fits + Math.floor((crossing + call.room - 1 - fits) / 2) };
      }
      throw new Error(`test: no map call can be refused for ${refusal} mid-map`);
    }
    const outcomes = (log: readonly SeamCall[]) => log.filter((entry) => entry.phase === "BODY" && entry.room > 0).map((entry) => entry.outcome);

    it("a body ceiling below a map call's projection stops the map for money: root 0 is sent and charged, and the answer is written", async () => {
      const question = "debate-shape-hosted-money-1234567890";
      // Root 0's maker is priced cheap and the others dear, so a dear map call can cross a ceiling that root 0's room
      // (priced at root 0's own seat, T12-R2) and every earlier map call fit under. Root 0's first grader is cheap too:
      // it fits after the stop, so the only thing that holds every other root back is the run-wide stop at rank [].
      const first = await measured("hosted-money-who", question, () => CHEAP);
      const rootZeroRef = first.rootZero.providerRef;
      const cheapRefs = new Set([rootZeroRef, first.rootZeroGrader]);
      const priceOf = (providerRef: string) => cheapRefs.has(providerRef) ? CHEAP : DEAR;
      const { mapCalls, rootZero } = await measured("hosted-money-measure", question, priceOf);
      expect(rootZero.providerRef).toBe(rootZeroRef);
      const stop = stopAt(mapCalls, rootZero, "MONEY");
      const hosted = hostedMoney(stop.ceiling, priceOf);
      const { debate, gates, result, calls } = await argue("hosted-money-stop", "free", STANDARD, 1, {}, false, { money: hosted.money, question });
      expect(result.kind).toBe("COMPLETED");
      // The map call was refused before it was sent, as the run's real money stop; nothing of the map was asked after it.
      expect(outcomes(hosted.seamLog)).toEqual([...Array.from({ length: stop.index }, () => "ADMITTED"), "RUN_COST_ENVELOPE_MONEY_REACHED"]);
      expect(calls.filter((call) => call.call_site_key.startsWith("MAP:"))).toHaveLength(stop.index);
      expect(calls.some((call) => call.call_site_key === "MAP:choose")).toBe(false);
      // Run-wide MONEY at rank []: root 0 alone is argued — sent, answered and charged — and no other root is asked.
      const rootZeroCall = hosted.seamLog.find((entry) => entry.phase === "BODY" && entry.room === 0)!;
      expect(rootZeroCall).toMatchObject({ providerRef: rootZeroRef, outcome: "ADMITTED" });
      expect(calls.filter((call) => call.call_site_key === "JUDGE" && call.outcome === "OK")).toHaveLength(1);
      expect(calls.filter((call) => call.call_site_key.startsWith("JUDGE:root:"))).toEqual([]);
      expect(gates.requests.filter((request) => request.kind === "JUDGE")).toHaveLength(1);
      // Root 0's first grader was asked and answered after the stop (it fits): the stop, not the money left, held the rest.
      // The grader is read from THIS run's requests: which maker grades root 0 depends on the run id, so the measuring
      // run's first grader (priced cheap above) is not always on this run's panel (about one run in ten failed on that).
      const finalGraderModel = gates.requests.slice(gates.requests.findIndex((request) => request.kind === "JUDGE"))
        .find((request) => request.kind === "PANEL")!.model;
      const finalGrader = TARGETS.find((target) => PANEL_REFS.includes(target.providerRef) && target.model === finalGraderModel)!.providerRef;
      expect(hosted.seamLog.filter((entry) => entry.phase === "BODY" && entry.providerRef === finalGrader && entry.room === 0
        && entry.outcome === "ADMITTED").length).toBeGreaterThan(0);
      expect(hosted.charges.filter((entry) => entry.runId === debate.runId && entry.spendPhase === "BODY" && entry.providerRef === rootZeroRef).length)
        .toBeGreaterThan(0);
      const marks = await q(database.pool, `SELECT mark FROM serve.condition_mark WHERE answer_id=$1`, result.answerId);
      expect(marks.map((row) => row.mark)).toEqual(expect.arrayContaining(["ENVELOPE_EXHAUSTED"]));
      expect(marks.map((row) => row.mark).some((mark) => String(mark).startsWith("MAP_"))).toBe(true);
      // The stop is the run-wide MONEY stop raised during the map (at rank [], before everything): the body's stop.
      expect((await harness.bodyFactsOf(result.answerId))!.body_stop).toBe("MONEY");
      // The answer was written under the answer's own ceiling.
      expect(hosted.seamLog.some((entry) => entry.phase === "SERVE" && entry.outcome === "ADMITTED")).toBe(true);
    }, 600_000);

    it("a map call refused only to keep root 0's room stops the map, never the arguing (RUN_COST_ENVELOPE_ROOM_KEPT)", async () => {
      const question = "debate-shape-hosted-room-1234567890";
      const { mapCalls, rootZero } = await measured("hosted-room-measure", question, () => CHEAP);
      const stop = stopAt(mapCalls, rootZero, "ROOM");
      const hosted = hostedMoney(stop.ceiling, () => CHEAP);
      const { result, calls } = await argue("hosted-room-kept", "free", STANDARD, 1, {}, false, { money: hosted.money, question });
      expect(result.kind).toBe("COMPLETED");
      expect(outcomes(hosted.seamLog)).toEqual([...Array.from({ length: stop.index }, () => "ADMITTED"), "RUN_COST_ENVELOPE_ROOM_KEPT"]);
      expect(calls.filter((call) => call.call_site_key.startsWith("MAP:"))).toHaveLength(stop.index);
      // No run-wide stop: the other roots and the cross-replies are argued, and nothing was refused for money.
      expect(calls.filter((call) => call.call_site_key.startsWith("JUDGE:root:") && call.outcome === "OK").length).toBeGreaterThan(0);
      expect(calls.filter((call) => call.call_site_key.startsWith("JUDGE:cross-root:") && call.outcome === "OK").length).toBeGreaterThan(0);
      expect(hosted.seamLog.filter((entry) => entry.outcome === "RUN_COST_ENVELOPE_MONEY_REACHED")).toEqual([]);
      const marks = (await q(database.pool, `SELECT mark FROM serve.condition_mark WHERE answer_id=$1`, result.answerId)).map((row) => String(row.mark));
      expect(marks.some((mark) => mark.startsWith("MAP_"))).toBe(true);
      expect(marks).not.toContain("ENVELOPE_EXHAUSTED");
      expect((await harness.bodyFactsOf(result.answerId))!.body_stop).toBeNull();
    }, 600_000);

    /**
     * P2L Task 17, pre-flight PF-L38 (BLOCKER): root 0's room is sized in the runner from the run's LOCK — decided by its
     * shape receipt, the same lock its judge inputs carry — framed at the bound lock. With hosted prices, a shaped run
     * stored as ro/Romanian keeps a larger room than the same run stored as "und" (no lock, today's room).
     */
    it("root 0's room frames the run's lock: a locked shaped run keeps a larger room than the same run read as und (PF-L38)", async () => {
      const question = "debate-shape-hosted-lock-1234567890";
      const roomOf = async (label: string, language: Readonly<{ tag: string; name: string }>) => {
        const probe = hostedMoney(1_000_000_000, () => CHEAP);
        const run = await argue(label, "free", STANDARD, 1, {}, false, { money: probe.money, question, language });
        expect(run.result.kind).toBe("COMPLETED");
        const rooms = [...new Set(probe.seamLog.filter((entry) => entry.phase === "BODY" && entry.room > 0).map((entry) => entry.room))];
        expect(rooms).toHaveLength(1);
        const expected = rootZeroKeepRoomMicros({ prices: [CHEAP], ...rootZeroRoomAttempts({
          questionLine: question, argumentLanguageName: language.name, tokenCeiling: POLICY.bounds.JUDGE.tokenCeiling,
          questionLanguage: questionLanguageFromRun(language.tag, language.name) }) });
        expect(rooms[0]).toBe(expected);
        return rooms[0]!;
      };
      const locked = await roomOf("hosted-lock-ro", { tag: "ro", name: "Romanian" });
      const unlocked = await roomOf("hosted-lock-und", { tag: "und", name: "the same language as the question" });
      expect(locked).toBeGreaterThan(unlocked);
    }, 600_000);

    /**
     * LG-A (Task 14 carry): with the structure-repair route wired (main.ts passes `structureRepairCeiling`), root 0 may send
     * the repair call: the runner's room prices it at the repair target's price and at the most the seam can project for
     * it, and adds it to root 0's first attempt and its own retry (the sum; refused-repair salvage B is root 0's own second
     * POST after the repair call). Without it: today's room (the PF-L38 case above).
     */
    it("a routed run's room adds the structure-repair call to root 0's first attempt and retry (the sum), at the repair target's price (LG-A)", async () => {
      const question = "debate-shape-hosted-repair-1234567890";
      const language = { tag: "ro", name: "Romanian" };
      const repairCeiling = Object.freeze({ providerRef: "preview:claude-haiku-5-5", requestBytes: PREVIEW_REQUEST_BODY_MAX_BYTES,
        completionTokenCeiling: 32_768 });
      const probe = hostedMoney(1_000_000_000, () => CHEAP);
      const run = await argue("hosted-repair-room", "free", STANDARD, 1, {}, false,
        { money: { ...probe.money, structureRepairCeiling: repairCeiling }, question, language });
      expect(run.result.kind).toBe("COMPLETED");
      const rooms = [...new Set(probe.seamLog.filter((entry) => entry.phase === "BODY" && entry.room > 0).map((entry) => entry.room))];
      expect(rooms).toHaveLength(1);
      const attempts = rootZeroRoomAttempts({ questionLine: question, argumentLanguageName: language.name,
        tokenCeiling: POLICY.bounds.JUDGE.tokenCeiling, questionLanguage: questionLanguageFromRun(language.tag, language.name) });
      expect(rooms[0]).toBe(rootZeroKeepRoomMicros({ prices: [CHEAP], ...attempts,
        structureRepair: { price: CHEAP, attempt: repairCeiling } }));
      // At one micro-unit per token: ceil(262,144 / 2) + 32,768 = 163,840 for the repair, added to root 0's own two attempts.
      expect(rooms[0]).toBe(rootZeroKeepRoomMicros({ prices: [CHEAP], ...attempts }) + 163_840);
      expect(rooms[0]).toBeGreaterThan(rootZeroKeepRoomMicros({ prices: [CHEAP], ...attempts }));
    }, 600_000);

    /**
     * Final review I-3 (Review Focus #1, "a lost claim during the map abandons"): the run loses its claim while the map's
     * lists are being asked (the keep-alive refuses, as `keepAliveStop` reads a lost claim or the time limit). The run is
     * abandoned exactly as today — it rejects; nothing is argued, no map is stored, no answer is written — and the map
     * calls already sent settle before it leaves (ruling T12-W): each has its MODEL_CALL row and its charge. With the
     * owner's call concurrency, so lists are in flight together when the claim is lost.
     */
    it("a lost claim during the map abandons the run: no root asked, no map stored, no answer, every map call sent settled", async () => {
      const hosted = hostedMoney(1_000_000_000, () => CHEAP);
      const shape = shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD });
      const debate = await harness.admittedRun("lost-claim-map", { panelRefs: PANEL_REFS, depth: 1, shape, settings: STANDARD });
      const scripted = scriptedShapeAnswers(debate.question);
      const lists = new Set<string>([MAP_CONTRACT_IDS.listAngle, MAP_CONTRACT_IDS.listOpen, MAP_CONTRACT_IDS.listSnowball]);
      const lost = new AbortController();
      const gates = await harness.startGates({}, undefined, (request, chat) => {
        // The claim is lost as the first list call arrives; that call (and any sent beside it) is still answered.
        if (request.kind === "MAP" && lists.has(materialOf(request).contractId)) lost.abort();
        return scripted(request, chat);
      });
      const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY,
        debateShape: { mapContractHash: mapPromptContractHash() }, money: hosted.money });
      await expect(composed.runner.executeWorkItem(debate.workItemId, { executionLimitMs: 3_600_000, signal: lost.signal }))
        .rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
      expect(lost.signal.aborted).toBe(true);
      const mapRequests = gates.requests.filter((request) => request.kind === "MAP");
      expect(mapRequests.filter((request) => lists.has(materialOf(request).contractId)).length).toBeGreaterThan(0);
      // Nothing was argued: no root (no JUDGE request at all), no panel.
      expect(gates.requests.filter((request) => request.kind === "JUDGE" || request.kind === "PANEL")).toEqual([]);
      // No map stored, no position, no answer.
      for (const table of ["core.map_item", "core.map_choice", "core.map_position", "serve.answer"]) {
        expect(await q(database.pool, `SELECT 1 FROM ${table} WHERE run_id=$1`, debate.runId), table).toEqual([]);
      }
      // Every map call that was sent settled before the run left: a MODEL_CALL row and a charge for each, none after.
      const mapRows = (await harness.modelCalls(debate.runId)).filter((call) => call.call_site_key.startsWith("MAP:"));
      expect(mapRows).toHaveLength(mapRequests.length);
      expect((await harness.modelCalls(debate.runId)).filter((call) => !call.call_site_key.startsWith("MAP:"))).toEqual([]);
      expect(hosted.charges.filter((entry) => entry.runId === debate.runId)).toHaveLength(mapRequests.length);
    }, 600_000);
  });

  // Binding notes 5 and 6 (Tasks 11/14): the extension's wiring at runner level — the extra seats are makers not yet
  // heard at the node, the node is reduced again with them, its record is filled, and the record's count is the REDUCED
  // extras (ruling T14-P: the voices the node gained, never the extras merely asked).
  it("a close call gains graders: PANEL-CLOSE-CALL-EXTENDED on the node, with more voices than J, of new makers", async () => {
    const { result } = await argue("close-call", "free", STANDARD, 1, { panelSpread: true });
    const records = await q(database.pool, `SELECT subject_ref, reason FROM serve.condition_mark WHERE answer_id=$1 AND mark='PANEL-CLOSE-CALL-EXTENDED'`, result.answerId);
    expect(records.length).toBeGreaterThan(0);
    const shape = shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD });
    const graders = Math.min(shape.graders, PANEL_REFS.length - 1);
    for (const record of records) {
      const panel = (await q(database.pool, `SELECT disagreement->'panel' AS panel FROM ledger.reduced_judgement WHERE node_id = $1::uuid`, record.subject_ref))[0]!.panel as {
        voiceCount: number; authorMaker: string; members: { memberRole: string }[]; spendStop?: string };
      expect(panel.voiceCount).toBeGreaterThan(1 + graders);
      const added = panel.voiceCount - 1 - graders;
      expect(added).toBeLessThanOrEqual(shape.closeCallExtraGraders);
      expect(record.reason).toBe(`PANEL_CLOSE_CALL_EXTENDED:${String(added)}`);
      // The extras are makers neither the author's nor already heard at the node: every voice is a different maker.
      const roles = panel.members.map((member) => member.memberRole);
      expect(new Set(roles).size).toBe(roles.length);
      expect(roles.filter((role) => role === panel.authorMaker)).toHaveLength(1);
      expect(panel.spendStop).toBeUndefined();
    }
  }, 600_000);

  // Pre-flight PF-B32 (BLOCKER, law: always an answer): Task 11's unit row proves the fold; this is the runner-level row.
  // One call at a time (no concurrency), so root 0's panel is the first one graded and its extension meets the stop.
  // Controller ruling T14-P: the extension is an extra — its stop never marks root 0's complete J panel PANEL-PARTIAL.
  // Binding note 5: root 0's panel is AUTHOR_ONLY, so its extension's stop comes back with what was heard (RETURN_HEARD).
  it("a money stop on root 0's close-call extension still saves root 0 and the run answers", async () => {
    const shape = shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD });
    const { debate, result } = await argue("close-call-stop", "free", STANDARD, 1,
      { panelSpread: true, stopCloseCallAfter: shape.graders }, false);
    expect(result.kind).toBe("COMPLETED");
    const marks = await q(database.pool, `SELECT mark FROM serve.condition_mark WHERE answer_id=$1`, result.answerId);
    expect(marks.map((row) => row.mark)).toContain("ENVELOPE_EXHAUSTED");
    const rootZero = await q(database.pool, `SELECT root_node_id::text AS id FROM core.map_position WHERE run_id=$1 AND root_index=0`, debate.runId);
    expect(rootZero).toHaveLength(1);
    const stop = await q(database.pool, `SELECT disagreement->'panel'->>'spendStop' AS stop, disagreement->'marks' AS marks
      FROM ledger.reduced_judgement WHERE node_id = $1::uuid`, rootZero[0]!.id);
    expect(stop[0]!.stop).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(stop[0]!.marks).toEqual([]);
  }, 600_000);

  // Binding note 5 (Task 11, the TRAVEL route): any other node's panel lets a stop met by its extension travel
  // (RETHROW): the node is paid and dropped, never saved with a part-heard extension, and the run stops for money and
  // still answers. Root 0's extension is graded in full (`stopCloseCallSkip: 1`); the next extension meets the stop.
  it("a money stop on a later node's close-call extension travels: that node is dropped, the run stops and answers", async () => {
    const shape = shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD });
    const { debate, gates, result } = await argue("close-call-travel", "free", STANDARD, 1,
      { panelSpread: true, stopCloseCallAfter: shape.graders, stopCloseCallSkip: 1 }, false);
    expect(result.kind).toBe("COMPLETED");
    // The stop was met: a grading request of an extension was refused.
    expect(gates.requests.filter((request) => request.kind === "PANEL" && request.answer === "STOPPED").length).toBeGreaterThan(0);
    const marks = (await q(database.pool, `SELECT mark FROM serve.condition_mark WHERE answer_id=$1`, result.answerId)).map((row) => row.mark);
    expect(marks).toContain("ENVELOPE_EXHAUSTED");
    // Root 0's extension alone was heard in full; no node was saved carrying a stop its extension met (RETURN_HEARD is
    // root 0's route only), and every saved node has its reduced judgement.
    expect(marks.filter((mark) => mark === "PANEL-CLOSE-CALL-EXTENDED")).toHaveLength(1);
    const stopped = await q(database.pool, `SELECT node_id FROM ledger.reduced_judgement WHERE run_id=$1 AND disagreement->'panel' ? 'spendStop'`, debate.runId);
    expect(stopped).toEqual([]);
    const unjudged = await q(database.pool, `SELECT node.node_id FROM core.node AS node WHERE node.run_id=$1
      AND NOT EXISTS (SELECT 1 FROM ledger.reduced_judgement AS judgement WHERE judgement.node_id = node.node_id)`, debate.runId);
    expect(unjudged).toEqual([]);
  }, 600_000);

  it("Premium deep scrutiny adds exchanges to the needy nodes and marks each one SCRUTINY-EXTENDED", async () => {
    const depth = 1;
    const { result, shape, calls } = await argue("scrutiny", "pro", DEEP, depth, { reviews: "dispute" });
    const records = await q(database.pool, `SELECT subject_ref FROM serve.condition_mark WHERE answer_id=$1 AND mark='SCRUTINY-EXTENDED'`, result.answerId);
    expect(records.length).toBeGreaterThan(0);
    expect(records.length).toBeLessThanOrEqual(shape.scrutinyPointsPerDebate);
    // Task 14 minor: the scrutiny keys are the rounds after the planned ones, 1 + R of them counted from the depth.
    const scrutinyKeys = calls.filter((call) => call.outcome === "OK" && scrutinyKey(shape, depth).test(call.call_site_key));
    expect(scrutinyKeys.length).toBeGreaterThan(0);
    expect(scrutinyKeys.length).toBeLessThanOrEqual(2 * shape.scrutinyRoundsPerPoint * shape.scrutinyPointsPerDebate);
  }, 600_000);

  // Task 14 minor (pre-flight PF-B48): the adaptive (δ) stop judges the PLANNED rounds converged — it ends them — but
  // never the needy nodes: scrutiny still runs after it, in the rounds after the depth.
  // The δ rule compares a boundary with the one before it, so the earliest it can stop is the round-2 boundary: at depth
  // 3 it ends round 3 (planned) and scrutiny still argues rounds 4 and 5.
  it("a δ stop ends the planned rounds but not scrutiny: no round-3 leg, scrutiny legs after the depth, SCRUTINY-EXTENDED", async () => {
    const depth = 3;
    const { result, shape, calls } = await argue("delta-scrutiny", "pro", DEEP, depth, { reviews: "dispute" }, true,
      { stoppingPolicy: { delta: 1, epsilon: 0 } });
    const ok = calls.filter((call) => call.outcome === "OK").map((call) => call.call_site_key);
    expect(ok.filter((key) => roundOf(key) === 2).length).toBeGreaterThan(0);
    expect(ok.filter((key) => roundOf(key) === depth)).toEqual([]);
    expect(ok.filter((key) => roundOf(key) === depth + 1).length).toBeGreaterThan(0);
    expect(ok.filter((key) => scrutinyKey(shape, depth).test(key)).length).toBeGreaterThan(0);
    const records = await q(database.pool, `SELECT subject_ref FROM serve.condition_mark WHERE answer_id=$1 AND mark='SCRUTINY-EXTENDED'`, result.answerId);
    expect(records.length).toBeGreaterThan(0);
  }, 600_000);

  // Task 14 minor: a halted scrutiny leg's record counts the legs planned beneath it — the scrutiny legs too, which
  // the halt's subtree walk must reach (they are planned after the plan's own legs, in the reserved slots).
  it("a halted scrutiny reply records every scrutiny leg planned beneath it", async () => {
    const depth = 1;
    let failing: string | null = null;
    const before = (request: GateRequest): GateOverride | null => {
      if (request.kind !== "JUDGE") return null;
      const material = materialOf(request);
      if (!isExchangeLeg(material)) return null;
      // The first exchange leg asked is a scrutiny reply (at depth 1 every planned leg is a point or a cross-reply):
      // every try of it, by every member, fails as a billed vendor error, so the leg halts.
      const asked = fieldOf(material, "position_under_debate")!;
      failing ??= asked;
      return asked === failing ? { vendorStatus: 500 } : null;
    };
    const { result, shape } = await argue("scrutiny-halt", "pro", DEEP, depth, { reviews: "dispute" }, false, { before });
    expect(failing).not.toBeNull();
    const halts = await q(database.pool, `SELECT call_site_key, planned_leg_count FROM serve.condition_mark
      WHERE answer_id=$1 AND mark='UNAUTHORED-BRANCH-HALTED'`, result.answerId);
    const scrutinyHalts = halts.filter((row) => scrutinyKey(shape, depth).test(String(row.call_site_key)));
    expect(scrutinyHalts).toHaveLength(1);
    // The reply and its defence in each of the R scrutiny rounds of that node.
    expect(scrutinyHalts[0]!.planned_leg_count).toBe(2 * shape.scrutinyRoundsPerPoint);
  }, 600_000);

  it("the answer writer is asked for about N words under max(sealed, writerBound), on every writer request", async () => {
    const detailed = { depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" } as const;
    const { gates, shape } = await argue("length", "free", detailed, 1);
    const writers = gates.requests.filter((request) => request.kind === "COMPOSE");
    expect(writers.length).toBeGreaterThan(0);
    for (const writer of writers) {
      const frame = materialOf(writer);
      // Answer writer v4 (owner-approved wording, 2026-10-15): the length variant of v4; length.v1 (v3's) is history.
      // Owner 17 Oct #5 (2026-10-29): length.v3, the sentence naming "the length"; length.v2 is history too.
      expect(frame.contractId).toBe("serve.synthesizer.length.v3");
      // Pre-flight PF-L40 (P2L Task 17): the run is locked (the harness's English), so the language field rides LAST and
      // the length field just before it.
      expect(frame.fields.at(-2)).toEqual({ name: "answer_length", content: `about ${String(shape.answerWords)} words` });
      expect(frame.fields.at(-1)?.name).toBe("question_language");
      // Final review M-5: exactly max(sealed, writerBound), as the title says — never only "at least the writer bound".
      expect(Number(writer.body.max_tokens)).toBe(Math.max(POLICY.bounds.COMPOSER.tokenCeiling, shape.writerBound));
    }
  }, 600_000);

  /**
   * Binding note 3 (spec §3.3 step 2, pre-flight PF-B41): a position whose maker sits out before the position's first
   * call is handed over — to a maker no position uses (SWAP), else shared with one that argues already (SHARE). Root 0's
   * maker is made busy on its first call (the vendor's unbilled refusal and its one resend): root 0 opens with the next
   * seat (fix (d)), and the busy maker's seat, now root 1's, sits out before root 1's first call.
   */
  const busyOnRootZero = () => {
    let busy: string | null = null;
    return {
      busy: () => busy,
      before: (request: GateRequest): GateOverride | null => {
        if (request.kind === "PROBE") return null;
        if (busy === null && request.kind === "JUDGE" && materialOf(request).contractId.startsWith("judge.assigned-root.")) busy = request.model;
        return busy !== null && request.model === busy ? { unbilled: true } : null;
      }
    };
  };
  const rootMakers = async (runId: string): Promise<string[]> => {
    const makers = await authorMakers(database.pool, runId);
    const roots = await q(database.pool, `SELECT root_index, root_node_id::text AS id FROM core.map_position WHERE run_id=$1 ORDER BY root_index`, runId);
    return roots.map((row) => makers.get(String(row.id))!);
  };

  it("a position whose maker sits out before its first call goes to a maker no position uses (SWAP)", async () => {
    const busy = busyOnRootZero();
    const { debate, shape, calls } = await argue("hand-over-swap", "free", STANDARD, 1, {}, false, { resilience: true, before: busy.before });
    expect(busy.busy()).not.toBeNull();
    // Free argues 3 of the 4 makers' answers: the fourth maker's seat takes the busy one's position.
    const makers = await rootMakers(debate.runId);
    expect(makers).toHaveLength(shape.answers);
    expect(new Set(makers).size).toBe(shape.answers);
    const busyMaker = TARGETS.find((target) => target.model === busy.busy())!.maker;
    expect(makers).not.toContain(busyMaker);
    // Every position was argued: its points and its one cross-reply.
    expect(new Set(calls.filter((call) => call.outcome === "OK" && call.call_site_key.startsWith("JUDGE:cross-root:")).map((call) => call.call_site_key)).size)
      .toBe(shape.answers);
  }, 600_000);

  it("a position whose maker sits out with no maker free is shared with one that argues already (SHARE), and the arguing keeps two makers", async () => {
    const busy = busyOnRootZero();
    // The choose names all four answers, so Pro argues four positions on four makers.
    const { debate, shape, calls } = await argue("hand-over-share", "pro", STANDARD, 1, { chooseAnswers: 4 }, false, { resilience: true, before: busy.before });
    // Pro argues all 4 makers' answers, so no maker is free: one maker argues two positions.
    const makers = await rootMakers(debate.runId);
    expect(makers).toHaveLength(shape.answers);
    expect(new Set(makers).size).toBe(shape.answers - 1);
    const busyMaker = TARGETS.find((target) => target.model === busy.busy())!.maker;
    expect(makers).not.toContain(busyMaker);
    // The arguing went on with at least two distinct makers: round-1 points written by two makers or more, every
    // review by another maker.
    const makerOfRef = (providerRef: string) => TARGETS.find((target) => target.providerRef === providerRef)!.maker;
    const pointAuthors = calls.filter((call) => call.outcome === "OK" && roundOf(call.call_site_key) === 1).map((call) => makerOfRef(call.actor_ref));
    expect(pointAuthors.length).toBeGreaterThan(0);
    expect(new Set(pointAuthors).size).toBeGreaterThanOrEqual(2);
    // Controller ruling T15-S: a maker never replies to itself — the cross-reply between the two positions one maker
    // holds is skipped (never sent); every other position still gets its one cross-reply.
    const crossPairs = calls.filter((call) => call.call_site_key.startsWith("JUDGE:cross-root:")).map((call) => {
      const [from, to] = call.call_site_key.slice("JUDGE:cross-root:".length).split("->").map(Number);
      return `${makers[from!]!} -> ${makers[to!]!}`;
    });
    expect(crossPairs.length).toBeGreaterThan(0);
    expect(crossPairs.filter((pair) => pair.split(" -> ")[0] === pair.split(" -> ")[1])).toEqual([]);
    const sameMakerReviews = await q(database.pool, `SELECT review.node_id FROM ledger.node_review AS review
      JOIN ledger.raw_artifact AS author ON author.raw_artifact_id = review.author_raw_artifact_ref
      JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
      WHERE review.run_id=$1 AND author.maker = reviewer.maker`, debate.runId);
    expect(sameMakerReviews).toEqual([]);
  }, 600_000);

  // Binding note 3 (Task 13 note: `tooFewLeftToArgue` counts a SHARED seat twice): once a share leaves one maker on two
  // positions and every other maker sits out, the arguing must end — fewer than two MAKERS are left (fix (d)), however
  // many positions that one maker holds. Nothing more is written by that last maker alone.
  it("after a SHARE, when one maker is left on two positions the arguing ends: no leg is written by it alone", async () => {
    const busy = busyOnRootZero();
    const PRO_POSITIONS = shapeForTest({ plan: "pro", makers: PANEL_REFS.length, settings: STANDARD }).answers;
    const assignedBy = new Map<string, number>();
    let lastMaker: string | null = null;
    const before = (request: GateRequest): GateOverride | null => {
      const early = busy.before(request);
      if (early !== null || request.kind === "PROBE") return early;
      if (request.kind === "JUDGE") {
        const material = materialOf(request);
        if (material.contractId.startsWith("judge.assigned-root.")) assignedBy.set(request.model, (assignedBy.get(request.model) ?? 0) + 1);
        // Every position's author call was answered (one call at a time) and round 1 has begun: the maker that holds two
        // positions stays; every other maker is busy from its next call on.
        const positionsAsked = [...assignedBy.values()].reduce((sum, count) => sum + count, 0);
        if (lastMaker === null && positionsAsked === PRO_POSITIONS && fieldOf(material, "consideration") !== undefined) {
          lastMaker = [...assignedBy].find(([, count]) => count === 2)?.[0] ?? null;
        }
      }
      return lastMaker !== null && request.model !== lastMaker ? { unbilled: true } : null;
    };
    const { debate, gates, result } = await argue("share-last-maker", "pro", STANDARD, 1, { chooseAnswers: 4 }, false, { resilience: true, before });
    expect(result.kind).toBe("COMPLETED");
    expect(lastMaker).not.toBeNull();
    expect(new Set(await rootMakers(debate.runId)).size).toBe(3);
    // The moment the last other maker sat out: its call and its one resend both refused as busy.
    const others = [...new Set(gates.requests.filter((request) => request.kind !== "PROBE" && request.model !== lastMaker && request.model !== busy.busy())
      .map((request) => request.model))];
    expect(others).toHaveLength(2);
    const satOutAt = Math.max(...others.map((model) => gates.requests.map((request, index) => ({ request, index }))
      .filter(({ request }) => request.model === model && request.answer === "UNBILLED").at(-1)?.index ?? Number.POSITIVE_INFINITY));
    expect(Number.isFinite(satOutAt)).toBe(true);
    const writtenAfter = gates.requests.slice(satOutAt + 1).filter((request) => request.kind === "JUDGE" && request.answer === "OK");
    expect(writtenAfter.map((request) => materialOf(request).contractId)).toEqual([]);
  }, 600_000);

  /**
   * Binding note 7 (re-claim, Task 12 + Task 14 minor): a shaped run whose copy loses the debate mid-arguing (here the
   * keep-alive's time limit: the same abandon as a lost claim, `keepAliveStop`) is claimed again: the second copy argues
   * the STORED map — no map call is asked or charged again — and the scrutiny slots (keys bound to slot positions)
   * serve the same nodes as an uninterrupted run of the same admitted debate.
   *
   * OWED COVERAGE (blocked): a re-claim AFTER a node was saved — scrutiny slot keys reused for re-ranked nodes, and
   * core.map_position.root_node_id left pointing at the first pass's root — cannot be tested yet: every run re-claimed
   * after a saved node fails with STRENGTH_LINEAGE_UNRESOLVED (a pre-existing engine bug on dev since 2026-08-11,
   * shaped or not; its own task). This case therefore loses the debate before any node is saved.
   */
  it("a re-claimed shaped run, lost before any node is saved, argues its stored map, never asks or charges the map again, and its scrutiny slots serve the same nodes", async () => {
    const shape = shapeForTest({ plan: "pro", makers: PANEL_REFS.length, settings: DEEP });
    const seedName = "debate_shape_reclaim_seed";
    await copyDatabase(admin, MIGRATED_COPY, seedName);
    const seedPool = createPool(databaseUrl(seedName));
    let seed: AdmittedRun;
    try {
      seed = await previewDebateHarness({ pool: () => seedPool, stubClosers })
        .admittedRun("reclaim", { panelRefs: PANEL_REFS, depth: 1, shape, settings: DEEP });
    } finally {
      await seedPool.end();
    }
    const script = () => scriptedShapeAnswers(seed.question, { reviews: "dispute" });
    /** What the scrutiny argued: each scrutiny key's statement(s), and the statements of the nodes scrutiny extended. */
    const scrutinyFacts = async (pool: Pool, answerId: string) => {
      const keys = await pool.query<{ key: string; text: string }>(`SELECT entry.call_site_key AS key, artifact.raw_text AS text
        FROM ledger.ledger_entry AS entry JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = entry.raw_artifact_ref
        WHERE entry.run_id=$1 AND entry.action_kind='MODEL_CALL' AND entry.outcome='OK'`, [seed.runId]);
      const byKey = new Map<string, Set<string>>();
      for (const row of keys.rows.filter((entry) => scrutinyKey(shape, 1).test(entry.key))) {
        const statement = /Point [0-9a-f]{12}\./u.exec(row.text)?.[0] ?? "<none>";
        byKey.set(row.key, new Set([...(byKey.get(row.key) ?? []), statement]));
      }
      const extended = await pool.query<{ text: string }>(`SELECT node.claim_text AS text FROM serve.condition_mark AS mark
        JOIN core.node AS node ON node.node_id::text = mark.subject_ref
        WHERE mark.answer_id=$1 AND mark.mark='SCRUTINY-EXTENDED' ORDER BY node.claim_text`, [answerId]);
      return { byKey, extended: extended.rows.map((row) => row.text) };
    };
    const inCopy = async <T,>(name: string, body: (pool: Pool) => Promise<T>): Promise<T> => {
      await copyDatabase(admin, seedName, name);
      const pool = createPool(databaseUrl(name));
      try {
        return await body(pool);
      } finally {
        await pool.end();
        await dropDatabase(admin, name);
      }
    };
    const reference = await inCopy("debate_shape_reclaim_reference", async (pool) => {
      const variant = previewDebateHarness({ pool: () => pool, stubClosers });
      const gates = await variant.startGates({}, undefined, script());
      const result = await variant.completedRun(await variant.previewRunner(gates, "resend", SHAPE_SETTINGS), seed, gates);
      return scrutinyFacts(pool, result.answerId);
    });
    expect(reference.extended.length).toBeGreaterThan(0);
    expect(reference.byKey.size).toBeGreaterThan(0);
    const reclaimed = await inCopy("debate_shape_reclaim_twice", async (pool) => {
      const variant = previewDebateHarness({ pool: () => pool, stubClosers });
      const scripted = script();
      const abort = new AbortController();
      // The copy loses the debate as the arguing starts — right after root 0's author call, before any node is saved:
      // the next call is refused by the keep-alive. (A pass re-claimed after nodes were saved cannot finish on today's
      // engine, shaped or not: its propagation meets the first pass's nodes, STRENGTH_LINEAGE_UNRESOLVED — reported.)
      const gates = await variant.startGates({}, undefined, (request, chat) => {
        if (request.kind === "JUDGE" && materialOf(request).contractId.startsWith("judge.assigned-root.")) abort.abort();
        return scripted(request, chat);
      });
      const first = await variant.previewRunner(gates, "resend", SHAPE_SETTINGS);
      await expect(first.runner.executeWorkItem(seed.workItemId, { executionLimitMs: 3_600_000, signal: abort.signal }))
        .rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
      const mapAsked = gates.requests.filter((request) => request.kind === "MAP").length;
      const mapRows = (await pool.query(`SELECT count(*)::int AS n FROM ledger.ledger_entry WHERE run_id=$1 AND call_site_key LIKE 'MAP:%'`, [seed.runId])).rows[0]!.n as number;
      expect(mapAsked).toBeGreaterThan(0);
      // The claim lapses; a second copy claims the work item and argues it to its answer.
      await pool.query(`UPDATE core.work_item SET claim_deadline = clock_timestamp() - interval '1 second' WHERE work_item_id = $1`, [seed.workItemId]);
      const asked = gates.requests.length;
      const result = await variant.completedRun(await variant.previewRunner(gates, "resend", SHAPE_SETTINGS), seed, gates);
      expect(gates.requests.slice(asked).filter((request) => request.kind === "MAP")).toEqual([]);
      expect((await pool.query(`SELECT count(*)::int AS n FROM ledger.ledger_entry WHERE run_id=$1 AND call_site_key LIKE 'MAP:%'`, [seed.runId])).rows[0]!.n)
        .toBe(mapRows);
      return scrutinyFacts(pool, result.answerId);
    });
    await dropDatabase(admin, seedName);
    // Each scrutiny slot served one node across both copies' calls, the reference's node.
    expect([...reclaimed.byKey].filter(([, statements]) => statements.size !== 1).map(([key]) => key)).toEqual([]);
    expect(Object.fromEntries([...reclaimed.byKey].map(([key, statements]) => [key, [...statements]])))
      .toEqual(Object.fromEntries([...reference.byKey].map(([key, statements]) => [key, [...statements]])));
    expect(reclaimed.extended).toEqual(reference.extended);
  }, 900_000);

  it("same answers, any finish order, and the one-call-at-a-time lane: the same debate and the same map", async () => {
    const shape = shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD });
    // Pre-flight PF-B54, as `savedAcrossVariants` in parallel-calls-debate.test.ts: admit ONCE into a seed copy of the
    // migrated template (the reviewer turn is hashed off the run id, so every copy must share it), copy the seed per
    // variant, and drop every copy and the seed.
    const seedName = "debate_shape_finish_seed";
    await copyDatabase(admin, MIGRATED_COPY, seedName);
    const seedPool = createPool(databaseUrl(seedName));
    let seed: AdmittedRun;
    try {
      seed = await previewDebateHarness({ pool: () => seedPool, stubClosers })
        .admittedRun("finish-order", { panelRefs: PANEL_REFS, depth: 2, shape, settings: STANDARD });
    } finally {
      await seedPool.end();
    }
    const saved: SavedDebate[] = [];
    for (const [name, concurrency, holdSeed] of [["p1", true, 11], ["p2", true, 22], ["serial", false, 33]] as const) {
      const copy = `debate_shape_finish_${name}`;
      await copyDatabase(admin, seedName, copy);
      const pool = createPool(databaseUrl(copy));
      try {
        const variant = previewDebateHarness({ pool: () => pool, stubClosers });
        let state = holdSeed;
        const random = () => { state = (state * 48271) % 2147483647; return state / 2147483647; };
        const gates = await variant.startGates({}, undefined, scriptedShapeAnswers(seed.question), (request) => request.kind === "PROBE" ? 0 : 5 + Math.floor(random() * 195));
        const composed = await variant.previewRunner(gates, "resend", { ...(concurrency ? { callConcurrency: OWNER_CALL_CONCURRENCY } : {}), ...SHAPE_SETTINGS });
        const result = await variant.completedRun(composed, seed, gates);
        saved.push(await savedDebate(pool, seed.runId, result.answerId));
      } finally {
        await pool.end();
      }
      await dropDatabase(admin, copy);
    }
    await dropDatabase(admin, seedName);
    expect(saved[0]!.mapItems.length).toBeGreaterThan(0);
    expect(saved[1]).toEqual(saved[0]);
    expect(saved[2]).toEqual(saved[0]);
  }, 900_000);
});
