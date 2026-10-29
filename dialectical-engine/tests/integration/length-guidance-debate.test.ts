// Length guidance, plan LG-C Task 17 (spec 2026-10-15 §6 "Integration"): a whole debate admitted with the length row tells
// every debate AI its target (its `.length.v1` contract and the `length` field; the answer writer its current length
// variant `serve.synthesizer.length.v3`) and records the guided words on every such attempt; the same debate admitted
// without it sends today's contracts and records none. Scripted gates, embedded Postgres.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, resolveLengthGuidance } from "@debateai/register";
import { SYNTHESIZER_LENGTH_CONTRACT_ID } from "@debateai/serve";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { OWNER_CALL_CONCURRENCY, PANEL_REFS, previewDebateHarness } from "../support/preview-debate-harness.js";
import { stubChatBody, type GateRecord } from "../support/preview-gate-stubs.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import { runShapeDebate } from "../support/debate-shape-harness.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });
const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });

beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); }, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await database?.stop(); });

const contractOf = (request: GateRecord): string => readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body))).contractId;
const fieldsOf = (request: GateRecord) => readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body))).fields;
const DEBATE_KINDS = new Set(["JUDGE", "PANEL", "REVIEW", "COMPOSE", "EVALUATOR"]);
// pre-flight PF-C6.1: every told debate step's variant ends `.length.v1`; the answer writer's current length variant is
// `serve.synthesizer.length.v3` (owner 17 Oct #5, 2026-10-29; `.length.v2` is v4's and `.length.v1` v3's shipped history).
const LENGTHED = /\.length\.v1$/u;
const WRITER_LENGTHED = SYNTHESIZER_LENGTH_CONTRACT_ID;
const ANY_LENGTHED = /\.length\.v\d+$/u;

async function guidedByKey(runId: string): Promise<readonly { key: string; guided: number | null }[]> {
  return (await database.pool.query<{ key: string; guided: number | null }>(
    `SELECT entry.call_site_key AS key, artifact.guided_words AS guided FROM ledger.ledger_entry AS entry
       JOIN ledger.raw_artifact AS artifact ON entry.raw_artifact_ref = artifact.raw_artifact_id
      WHERE entry.run_id=$1 AND entry.action_kind='MODEL_CALL' ORDER BY entry.sequence`, [runId])).rows;
}

describe("a debate with the length row (spec 2026-10-15 §6)", () => {
  it("today's shape: every debate AI is told its target and its guided words are recorded", async () => {
    const debate = await harness.admittedRun("length-today", { panelRefs: PANEL_REFS, depth: 1, length: GUIDANCE });
    const gates = await harness.startGates({}, undefined, scriptedAnswers(debate.question));
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY });
    await harness.completedRun(composed, debate, gates);
    const debateRequests = gates.requests.filter((request) => DEBATE_KINDS.has(request.kind) && request.answer === "OK");
    expect(debateRequests.length).toBeGreaterThan(0);
    for (const request of debateRequests) {
      if (request.kind === "COMPOSE") expect(contractOf(request), request.kind).toBe(WRITER_LENGTHED);
      else expect(contractOf(request), request.kind).toMatch(LENGTHED);
      expect(fieldsOf(request).some((field) => field.name === "length" || field.name === "answer_length"), request.kind).toBe(true);
    }
    const rows = await guidedByKey(debate.runId);
    const told = rows.filter((row) => !row.key.startsWith("STORY:") && !row.key.startsWith("REPAIR:STRUCTURE:"));
    expect(told.length).toBeGreaterThan(0);
    for (const row of told) expect(row.guided, row.key).not.toBeNull();
    // pre-flight PF-C6.2: OVERVIEW C-1, the writer's Standard words are 350 (`standardWords.answer_writer`).
    expect(rows.find((row) => row.key.startsWith("COMPOSER:SYNTHESIZER:"))?.guided).toBe(350);
    expect(rows.find((row) => row.key.startsWith("POST_COMPOSE_R9:EVALUATOR:"))?.guided).toBe(150);
    // The story is LG-D's (now R1d's): it is not told a target yet, so it records none. R1d flips this assertion
    // (Cross-phase notes, R1d) (pre-flight PF-C6.8).
    for (const row of rows.filter((entry) => entry.key.startsWith("STORY:"))) expect(row.guided, row.key).toBeNull();
  }, 900_000);

  // Engine redesign R1d, Task 5 review 2 (final wave B3): an engine-2 receipt on a runner composed without the engine's
  // settings (no sealed engine contracts) is refused before any AI is asked.
  it("an engine-2 receipt on a runner without engine settings ends ENGINE_RUNNER_UNCONFIGURED with zero gateway calls", async () => {
    const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers: PANEL_REFS.length, mapOpening: false });
    const debate = await harness.admittedRun("engine-unconfigured", { panelRefs: PANEL_REFS, depth: 1, length: GUIDANCE, engine });
    const gates = await harness.startGates({}, undefined, scriptedAnswers(debate.question));
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY });
    const outcome = await composed.runner.executeWorkItem(debate.workItemId)
      .then((result) => ({ result, code: null as string | null }), (error: unknown) => ({ result: null, code: String((error as { code?: unknown }).code) }));
    const workItem = (await database.pool.query<{ terminal_reason: string | null }>(
      "SELECT terminal_reason FROM core.work_item WHERE work_item_id=$1", [debate.workItemId])).rows[0];
    expect([outcome.code, workItem?.terminal_reason ?? null]).toContain("ENGINE_RUNNER_UNCONFIGURED");
    expect(outcome.result?.kind).not.toBe("COMPLETED");
    expect(gates.requests).toEqual([]);
    expect(await guidedByKey(debate.runId)).toEqual([]);
  }, 900_000);

  it("the same debate without the row: today's contracts, no length field, no guided words", async () => {
    const debate = await harness.admittedRun("length-absent", { panelRefs: PANEL_REFS, depth: 1 });
    const gates = await harness.startGates({}, undefined, scriptedAnswers(debate.question));
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY });
    await harness.completedRun(composed, debate, gates);
    for (const request of gates.requests.filter((entry) => DEBATE_KINDS.has(entry.kind))) {
      // pre-flight PF-C6.1: no length variant of any version (catches a writer wrongly sent `.length.v2` without the row).
      expect(contractOf(request), request.kind).not.toMatch(ANY_LENGTHED);
      expect(fieldsOf(request).some((field) => field.name === "length"), request.kind).toBe(false);
    }
    for (const row of await guidedByKey(debate.runId)) expect(row.guided, row.key).toBeNull();
  }, 900_000);

  it("the new shape: the map is told its parts, never trims, and the debate ends with an answer", async () => {
    const run = await runShapeDebate(harness, { label: "length-shape", length: GUIDANCE });
    const mapRequests = run.gates.requests.filter((request) => request.kind === "MAP" && request.answer === "OK");
    expect(mapRequests.length).toBeGreaterThan(0);
    for (const request of mapRequests) expect(contractOf(request)).toMatch(/^map\..*\.length\.v1$/u);
    expect(run.result.kind).toBe("COMPLETED");
    const marks = await database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ledger.raw_artifact AS artifact JOIN ledger.ledger_entry AS entry
          ON entry.raw_artifact_ref = artifact.raw_artifact_id
        WHERE entry.run_id=$1 AND 'MAP_TEXT_TRIMMED' = ANY(coalesce(artifact.reply_repairs, '{}'))`, [run.debate.runId]);
    expect(marks.rows[0]!.n).toBe(0);
  }, 900_000);
});
