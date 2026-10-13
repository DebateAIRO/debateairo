// The debate shape (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md §3.3), end to end: the REAL
// WalkingSkeletonRunner composed as main.ts composes it on the preview (tests/support/preview-debate-harness.ts), booted
// with the shape settings, argues a run admitted with the sizes P2a freezes on its receipt, against scripted gates
// (tests/support/debate-shape-harness.ts), on a migrated embedded PostgreSQL. Integration suites are skipped by the CI
// gate: run this file by hand, alone.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { DebateShapeSettings } from "@debateai/contract";
import { createPool, migrate, type Pool } from "@debateai/db";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { PANEL_REFS, previewDebateHarness } from "../support/preview-debate-harness.js";
import { stubChatBody } from "../support/preview-gate-stubs.js";
import { runShapeDebate, shapeForTest, type ShapeScriptOptions } from "../support/debate-shape-harness.js";
import { copyDatabase } from "../support/saved-debate.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
/** A connection to the cluster's maintenance database, for making and dropping the per-run copies. */
let admin: Pool;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });
const STANDARD = { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const;
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
  script: ShapeScriptOptions = {}, concurrency = true) =>
  runShapeDebate(harness, { label, plan, settings, depth, script, concurrency });

describe("the debate shape in the runner (spec §3.3)", () => {
  it("argues P assigned positions, K points each, one cross-reply each, adaptive exchanges, and serves an answer", async () => {
    const { debate, gates, shape, result, calls } = await argue("assigned", "free", STANDARD, 2);
    const okKeys = calls.filter((call) => call.outcome === "OK").map((call) => call.call_site_key);
    expect(okKeys.filter((key) => key.startsWith("MAP:"))).toEqual(expect.arrayContaining(["MAP:angles", "MAP:merge", "MAP:choose"]));
    const assigned = gates.requests.filter((request) => request.kind === "JUDGE"
      && readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body))).contractId.startsWith("judge.assigned-root."));
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
    const { result, calls } = await argue("money-stop", "free", STANDARD, 2, { stopAt: "MERGE" });
    expect(result.kind).toBe("COMPLETED");
    expect(calls.some((call) => call.call_site_key === "MAP:choose")).toBe(false);
    expect(calls.filter((call) => call.call_site_key.startsWith("JUDGE:root:"))).toEqual([]);
    const rows = await q(database.pool, `SELECT mark FROM serve.condition_mark WHERE answer_id=$1`, result.answerId);
    expect(rows.map((row) => row.mark)).toEqual(expect.arrayContaining(["ENVELOPE_EXHAUSTED", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK"]));
  }, 600_000);

  it("a close call gains graders: PANEL-CLOSE-CALL-EXTENDED on the node, with more voices than J", async () => {
    const { debate, result } = await argue("close-call", "free", STANDARD, 1, { panelSpread: true });
    const records = await q(database.pool, `SELECT subject_ref FROM serve.condition_mark WHERE answer_id=$1 AND mark='PANEL-CLOSE-CALL-EXTENDED'`, result.answerId);
    expect(records.length).toBeGreaterThan(0);
    const shape = shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD });
    const voices = await q(database.pool, `SELECT (disagreement->'panel'->>'voiceCount')::int AS n FROM ledger.reduced_judgement WHERE node_id = $1::uuid`, records[0]!.subject_ref);
    expect(voices[0]!.n).toBeGreaterThan(1 + shape.graders);
    expect(debate.runId).toBeTruthy();
  }, 600_000);

  // Pre-flight PF-B32 (BLOCKER, law: always an answer): Task 11's unit row proves the fold; this is the runner-level row.
  // One call at a time (no concurrency), so root 0's panel is the first one graded and its extension meets the stop.
  // Controller ruling T14-P: the extension is an extra — its stop never marks root 0's complete J panel PANEL-PARTIAL.
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

  it("Premium deep scrutiny adds exchanges to the needy nodes and marks each one SCRUTINY-EXTENDED", async () => {
    const deep = { depthMode: "adaptive", scrutiny: "deep", answerLength: "standard" } as const;
    const { result, shape, calls } = await argue("scrutiny", "pro", deep, 1, { reviews: "dispute" });
    const records = await q(database.pool, `SELECT subject_ref FROM serve.condition_mark WHERE answer_id=$1 AND mark='SCRUTINY-EXTENDED'`, result.answerId);
    expect(records.length).toBeGreaterThan(0);
    expect(records.length).toBeLessThanOrEqual(shape.scrutinyPointsPerDebate);
    const scrutinyKeys = calls.filter((call) => call.outcome === "OK" && /^JUDGE:critic:root[0-9]+:r(2|3):/u.test(call.call_site_key));
    expect(scrutinyKeys.length).toBeLessThanOrEqual(2 * shape.scrutinyRoundsPerPoint * shape.scrutinyPointsPerDebate);
  }, 600_000);

  it("the answer writer is asked for about N words under max(sealed, writerBound)", async () => {
    const detailed = { depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" } as const;
    const { gates, shape } = await argue("length", "free", detailed, 1);
    const writer = gates.requests.find((request) => request.kind === "COMPOSE")!;
    const frame = readFramedMaterial(wirePacket(stubChatBody(writer.provider, writer.body)));
    expect(frame.contractId).toBe("serve.synthesizer.length.v1");
    expect(frame.fields.at(-1)).toEqual({ name: "answer_length", content: `about ${String(shape.answerWords)} words` });
    expect(Number(writer.body.max_tokens)).toBeGreaterThanOrEqual(shape.writerBound);
  }, 600_000);
});
