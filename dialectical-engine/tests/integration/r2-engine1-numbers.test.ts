/**
 * Engine redesign R2, Task A1 (spec 2026-10-15 §15, "engine row absent = today's bytes"): an engine-1 debate's NUMBERS,
 * recorded at Task A1 on the code before any R2 change and compared by every later R2 task that edits the judge's
 * reduction or the runner (A3, A4, A8, B5): every reduced judgement (tau, reducer version, selected judgement,
 * dispersion, the whole `disagreement` record), every propagation run's selection rule and served-root record, and every
 * final strength. One debate, today's shape, four makers, depth 2, serial calls, answers scripted from WHAT each call asked
 * (tests/support/scripted-answers.ts), and a FIXED question (the role rotation is seeded by it, so a random question would
 * change who argues what). Ids are named by save order (`node#k`, `edge#k`) or by the call that produced them
 * (`answer(<call site> @ <member>)`), as tests/support/saved-debate.ts names them.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { migrate, type Pool } from "@debateai/db";
import { wirePacket } from "../support/framed-packet.js";
import { PANEL_REFS, previewDebateHarness } from "../support/preview-debate-harness.js";
import type { GateOverride, GateRequest } from "../support/preview-gate-stubs.js";
import { savedDebate } from "../support/saved-debate.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const stubClosers: (() => Promise<void>)[] = [];

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => database?.stop());

const GOLDEN = new URL("../fixtures/r2/engine1-numbers.json", import.meta.url);
const RECORD = process.env.R2_ENGINE1_PINS_WRITE === "1";
/** admittedRun's own question form (a plain label, then digits only), fixed. */
const QUESTION = "preview-busy-model-golden-20261015000000000000000000000000";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;

/**
 * `scriptedAnswers`, except that a review is answered from WHAT it asked, never from WHICH maker was asked. The reviewer
 * circle is seeded by the run id (apps/runner/src/index.ts `reviewerTurnOrder`), and every admitted run mints a fresh
 * one (`RunRepository.startRun`), so which maker reviews a node changes from run to run. Keyed by the reviewer's model
 * and its vendor's request body (the body's own `model`, `temperature`, `top_k`, `reasoning_effort`), a review's
 * bearings, and so every final strength, moved with the shuffle. A review is therefore answered from its packet's
 * messages alone (read through `wirePacket`, the same for every vendor) under one model name; every other call is
 * answered exactly as scripted.
 */
function answersOf(question: string): (request: GateRequest, chat: string) => GateOverride | null {
  const scripted = scriptedAnswers(question);
  return (request, chat) => request.kind !== "REVIEW" ? scripted(request, chat)
    : scripted({ ...request, model: "<reviewer>" }, JSON.stringify({ messages: wirePacket(chat).messages }));
}

/** Ids named as savedDebate names them: nodes and edges by save order, an artifact by its call and member; any other `<id>`. */
async function namer(pool: Pool, runId: string): Promise<(text: string) => string> {
  const names = new Map<string, string>();
  (await pool.query<{ id: string }>(`SELECT node_id::text AS id FROM core.node WHERE run_id=$1 ORDER BY created_at_seq`, [runId]))
    .rows.forEach((row, index) => names.set(row.id, `node#${String(index)}`));
  (await pool.query<{ id: string }>(`SELECT edge_id::text AS id FROM core.edge WHERE run_id=$1 ORDER BY created_at_seq`, [runId]))
    .rows.forEach((row, index) => names.set(row.id, `edge#${String(index)}`));
  const nameIds = (text: string): string => text.replace(UUID, (id) => names.get(id.toLowerCase()) ?? "<id>");
  const artifacts = await pool.query<{ ref: string; key: string; actor: string }>(
    `SELECT raw_artifact_ref::text AS ref, call_site_key AS key, actor_ref AS actor FROM ledger.ledger_entry
      WHERE run_id=$1 AND raw_artifact_ref IS NOT NULL AND call_site_key IS NOT NULL`, [runId]);
  for (const artifact of artifacts.rows) names.set(artifact.ref, `answer(${nameIds(artifact.key)} @ ${artifact.actor})`);
  return nameIds;
}

async function engineNumbers(pool: Pool, runId: string, answerId: string): Promise<Record<string, readonly unknown[]>> {
  const name = await namer(pool, runId);
  const named = (value: readonly unknown[]): readonly unknown[] => JSON.parse(name(JSON.stringify(value))) as unknown[];
  const propagation = await pool.query(
    `SELECT judgement_selection_rule AS rule, judgement_selection_rule_key AS rule_key,
            judgement_selection_rule_register_version::text AS rule_register_version,
            judgement_selection_rule_source_ref AS rule_source_ref, served_root_selection AS served
       FROM ledger.propagation_run WHERE run_id=$1 ORDER BY at_seq`, [runId]);
  const strengths = await pool.query(
    `SELECT record.node_id::text AS node_id, record.strength, record.abstained, record.operator_used,
            record.supported_by, record.attacked_by
       FROM ledger.node_strength_record AS record
       JOIN ledger.propagation_run AS propagation ON propagation.propagation_run_id = record.propagation_run_id
       JOIN core.node AS node ON node.node_id = record.node_id
      WHERE propagation.run_id=$1 ORDER BY propagation.at_seq, node.created_at_seq`, [runId]);
  return {
    reduced: (await savedDebate(pool, runId, answerId)).reduced,
    propagation: named(propagation.rows),
    strengths: named(strengths.rows)
  };
}

describe("an engine-1 debate's numbers stay as recorded at Task A1 (spec §15)", () => {
  it("today's shape, four makers, depth 2: reductions, selection rules and final strengths", async () => {
    const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });
    const debate = await harness.admittedRun("golden", { panelRefs: PANEL_REFS, depth: 2, question: QUESTION });
    const gates = await harness.startGates({}, undefined, answersOf(debate.question));
    const composed = await harness.previewRunner(gates, "resend");
    const result = await harness.completedRun(composed, debate, gates);
    const now = JSON.parse(JSON.stringify(await engineNumbers(database.pool, debate.runId, result.answerId))) as
      Record<string, unknown[]>;
    // Not vacuous: a whole debate (a reduced judgement per node, at least one propagation pass, a strength per node).
    expect(now.reduced!.length).toBeGreaterThan(4);
    expect(now.propagation!.length).toBeGreaterThan(0);
    expect(now.strengths!.length).toBeGreaterThan(4);
    if (RECORD) {
      await mkdir(new URL("../fixtures/r2/", import.meta.url), { recursive: true });
      await writeFile(GOLDEN, `${JSON.stringify(now, null, 2)}\n`, "utf8");
    }
    expect(now).toEqual(JSON.parse(await readFile(GOLDEN, "utf8")) as unknown);
  }, 900_000);
});
