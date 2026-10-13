// The debate shape (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md §3.3), end to end: the REAL
// WalkingSkeletonRunner composed as main.ts composes it on the preview (tests/support/preview-debate-harness.ts), booted
// with the shape settings, argues a run admitted with the sizes P2a freezes on its receipt, against scripted gates
// (tests/support/debate-shape-harness.ts), on a migrated embedded PostgreSQL. Integration suites are skipped by the CI
// gate: run this file by hand, alone.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { DebateShapeSettings } from "@debateai/contract";
import { createPool, migrate, type Pool } from "@debateai/db";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { previewDebateHarness } from "../support/preview-debate-harness.js";
import { stubChatBody } from "../support/preview-gate-stubs.js";
import { runShapeDebate, type ShapeScriptOptions } from "../support/debate-shape-harness.js";
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
});
