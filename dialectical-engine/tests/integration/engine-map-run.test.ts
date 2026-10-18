// Engine redesign R3 (spec 2026-10-15 §5, §14.2): an engine-2 debate in the new shape, end to end — the REAL runner composed
// as main.ts composes it on the preview, scripted gates, a migrated embedded PostgreSQL. Integration suites are skipped by
// the CI gate: run this file by hand, alone.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { migrate, type Pool } from "@debateai/db";
import { MAP_ENGINE_CONTRACT_IDS, MapChoiceRepository } from "@debateai/map";
import { debateShapeSiteCounts } from "@debateai/register";
import { readFramedMaterial, wirePacket, type FramedMaterial } from "../support/framed-packet.js";
import { previewDebateHarness } from "../support/preview-debate-harness.js";
import { stubChatBody, type GateRequest } from "../support/preview-gate-stubs.js";
import { runShapeDebate } from "../support/debate-shape-harness.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";

let database: TestDatabase;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });
beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); }, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await database?.stop(); });

const q = (pool: Pool, sql: string, id: string) => pool.query(sql, [id]).then((result) => result.rows);
const materialOf = (request: GateRequest): FramedMaterial => readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body)));
const ENGINE_IDS = new Set(Object.values(MAP_ENGINE_CONTRACT_IDS));
const RESERVE = "Only for the night lines, where riders are few.";

describe("engine 2's map answer step in the runner (spec §5)", () => {
  it("one MAP:check by another maker, the engine seal on every map call, a failing answer replaced, its words defended whole", async () => {
    const run = await runShapeDebate(harness, { label: "engine-map", engine: true, script: { engineMap: { failChecks: ["a2"] } } });
    const mapCalls = await q(database.pool, `SELECT call_site_key, contract_hash, actor_ref, outcome FROM ledger.ledger_entry
      WHERE run_id=$1 AND action_kind='MODEL_CALL' AND call_site_key LIKE 'MAP:%' ORDER BY sequence`, run.debate.runId);
    const ok = mapCalls.filter((row) => row.outcome === "OK");
    expect(ok.filter((row) => row.call_site_key === "MAP:check")).toHaveLength(1);
    for (const row of mapCalls) expect(row.contract_hash).toBe(engineContractHash());
    // The panel's four refs are four makers, one ref each: another ref is another maker.
    expect(ok.find((row) => row.call_site_key === "MAP:check")!.actor_ref).not.toBe(ok.find((row) => row.call_site_key === "MAP:choose")!.actor_ref);
    for (const request of run.gates.requests.filter((entry) => entry.kind === "MAP")) expect(ENGINE_IDS.has(materialOf(request).contractId)).toBe(true);

    const repository = new MapChoiceRepository(database.pool);
    const choice = await repository.readMapChoiceForRun(run.debate.runId);
    expect(choice?.answers[1]?.statement).toBe(RESERVE);
    expect((await repository.readMapAnswerCheckForRun(run.debate.runId))?.codes).toContain("a2:NOT_AN_ANSWER>c1");
    // (pre-flight consistency) the script exempts nothing, so the stored premise-exempt ids are none (0122's column written).
    expect((await repository.readMapAnswerCheckForRun(run.debate.runId))?.premiseExempt).toEqual([]);
    const restsOn = await q(database.pool, `SELECT count(*)::int AS n FROM core.map_item_rests_on WHERE run_id=$1`, run.debate.runId);
    expect(restsOn[0]!.n).toBeGreaterThan(0);
    const marks = await q(database.pool, `SELECT mark FROM serve.condition_mark WHERE answer_id=$1`, run.result.answerId);
    expect(marks.map((row) => row.mark)).toContain("MAP_ANSWER_REPLACED");

    const positions = run.gates.requests.filter((request) => request.kind === "JUDGE" && materialOf(request).contractId.startsWith("judge.assigned-root."));
    expect(positions.length).toBe(choice!.answers.length);
    for (const request of positions) expect(materialOf(request).contractId).toMatch(/^judge\.assigned-root\.(unknown|resolved)\.v2$/u);
    const assigned = positions.map((request) => materialOf(request).fields.find((field) => field.name === "assigned_answer")!.content);
    expect(assigned).toEqual(expect.arrayContaining(choice!.answers.map((answer) => answer.statement)));

    // Never under-count: the map's sites stay within what the receipt priced plus the one check the engine counted.
    expect(new Set(mapCalls.map((row) => row.call_site_key)).size).toBeLessThanOrEqual(debateShapeSiteCounts(run.shape, 1).mapSites + 1);

    // Controller ruling R3-T14.2 (binding): the scripted gate answered every request (none "unexpected", which would make
    // the map unavailable and argue today's opening), no map step fell back, choose v2 was answered, and the check ran once.
    expect(run.gates.requests.filter((request) => request.answer === "UNEXPECTED").map((request) => request.kind)).toEqual([]);
    expect(marks.map((row) => row.mark).filter((mark) => /^MAP_.*_FALLBACK$/u.test(mark))).toEqual([]);
    expect(run.gates.requests.filter((request) => request.kind === "MAP" && request.answer === "OK"
      && materialOf(request).contractId === MAP_ENGINE_CONTRACT_IDS.choose)).toHaveLength(1);
    expect(mapCalls.filter((row) => row.call_site_key === "MAP:check")).toHaveLength(1);
    expect(choice?.opening).toBe("MAP");
  }, 600_000);

  it("engine 1: no check, no new rows, today's map contracts (Review Focus 4)", async () => {
    const run = await runShapeDebate(harness, { label: "engine-one-map" });
    expect(run.calls.some((call) => call.call_site_key === "MAP:check")).toBe(false);
    for (const request of run.gates.requests.filter((entry) => entry.kind === "MAP")) expect(ENGINE_IDS.has(materialOf(request).contractId)).toBe(false);
    for (const table of ["map_item_rests_on", "map_answer_check"]) {
      expect((await q(database.pool, `SELECT count(*)::int AS n FROM core.${table} WHERE run_id=$1`, run.debate.runId))[0]!.n).toBe(0);
    }
    const positions = run.gates.requests.filter((request) => request.kind === "JUDGE" && materialOf(request).contractId.startsWith("judge.assigned-root."));
    for (const request of positions) expect(materialOf(request).contractId).not.toMatch(/\.v2$/u);
  }, 600_000);
});
