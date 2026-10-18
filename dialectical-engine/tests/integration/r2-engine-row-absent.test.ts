// Engine redesign R2, plan Task B12 (spec §15 "engine row absent = today's bytes"): a run admitted WITHOUT the receipt's
// engine member is today's run, whether the runner was booted without the engine row or with it (and its seal). One
// debate is admitted once into a seed copy of the migrated database, then argued on per-variant copies (as
// tests/integration/debate-shape-row-absent.test.ts, whose helpers below are copied from its lines 117-179 (R1c part 2);
// pre-flight PF-R2b7.4).
// Both variants must save the same debate, write the same ledger rows, send the gates the same prompts, carry the same
// marks and the same public answer; neither asks a VERDICT: call, writes a vote or an investigation row, records the
// judges' rule or the engine-1 ladder's record, or serves SPLIT. Run this file by hand, alone.
import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
import { SERVED_ROOT_SELECTION_RULE } from "@debateai/kernel";
import { readPromptFrame, type PromptPacket } from "@debateai/providers";
import { ServeRepository } from "@debateai/serve";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { wirePacket } from "../support/framed-packet.js";
import { OWNER_CALL_CONCURRENCY, PANEL_REFS, previewDebateHarness, type AdmittedRun } from "../support/preview-debate-harness.js";
import type { GateOverride, GateRequest } from "../support/preview-gate-stubs.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import { copyDatabase, dropDatabase, savedDebate, type SavedDebate } from "../support/saved-debate.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let admin: Pool;
const stubClosers: (() => Promise<void>)[] = [];
const MIGRATED_COPY = "r2_engine_absent_migrated";
const databaseUrl = (name: string): string => database.connectionString.replace(/\/[^/?]+(?=\?|$)/u, `/${name}`);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
type Variant = "NO_ENGINE_ROW" | "ENGINE_ROW";
const VARIANTS: readonly Variant[] = ["NO_ENGINE_ROW", "ENGINE_ROW"];

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  admin = createPool(databaseUrl("postgres"), { max: 1 });
  await copyDatabase(admin, "debateai_s00", MIGRATED_COPY);
}, 10 * 60 * 1000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await admin?.end(); await database?.stop(); });

type PromptSeen = Readonly<{ model: string; kind: string; contractId: string | null; fingerprint: string }>;
function promptSeen(request: GateRequest, chat: string): PromptSeen {
  let contractId: string | null = null;
  let masked = chat;
  try {
    const frame = readPromptFrame(wirePacket(chat) as PromptPacket);
    contractId = frame.contractId;
    masked = chat.split(frame.fence).join("#|<fence>|#").split(frame.canary).join("<canary>");
  } catch {
    // A claim probe is not framed: its text is compared whole.
  }
  return Object.freeze({ model: request.model, kind: request.kind, contractId,
    fingerprint: createHash("sha256").update(masked.replace(UUID, "<id>"), "utf8").digest("hex") });
}
const LEDGER_VOLATILE = ["ledger_entry_id", "sequence", "attempt_id", "raw_artifact_ref", "started_at", "finished_at", "input_hash"];
async function idNamer(pool: Pool, runId: string): Promise<(text: string) => string> {
  const names = new Map<string, string>();
  (await pool.query<{ node_id: string }>(`SELECT node_id::text FROM core.node WHERE run_id=$1 ORDER BY created_at_seq`, [runId]))
    .rows.forEach((row, index) => names.set(row.node_id, `node#${String(index)}`));
  (await pool.query<{ edge_id: string }>(`SELECT edge_id::text FROM core.edge WHERE run_id=$1 ORDER BY created_at_seq`, [runId]))
    .rows.forEach((row, index) => names.set(row.edge_id, `edge#${String(index)}`));
  return (text) => text.replace(UUID, (id) => names.get(id.toLowerCase()) ?? "<id>");
}
async function ledgerRows(pool: Pool, runId: string, name: (text: string) => string): Promise<readonly string[]> {
  const result = await pool.query<{ row: Record<string, unknown> }>(
    `SELECT to_jsonb(entry) AS row FROM ledger.ledger_entry AS entry WHERE run_id=$1 ORDER BY sequence`, [runId]);
  return result.rows.map(({ row }) => JSON.stringify(Object.fromEntries(Object.entries(row)
    .filter(([key]) => !LEDGER_VOLATILE.includes(key))
    .map(([key, value]) => [key, typeof value === "string" ? name(value) : value]))));
}
async function markRecords(pool: Pool, answerId: string, name: (text: string) => string): Promise<readonly unknown[]> {
  const result = await pool.query<{ row: Record<string, unknown>; affected: string[] }>(
    `SELECT to_jsonb(marked) - 'condition_mark_id' - 'answer_id' - 'at_seq' AS row,
            ARRAY(SELECT link.node_id::text FROM serve.condition_mark_node AS link
                  WHERE link.condition_mark_id = marked.condition_mark_id ORDER BY link.node_id) AS affected
       FROM serve.condition_mark AS marked WHERE answer_id=$1 ORDER BY at_seq`, [answerId]);
  return result.rows.map(({ row, affected }) => JSON.parse(JSON.stringify({ ...row, affected: affected.map(name).sort() },
    (_key, value: unknown) => typeof value === "string" ? name(value) : value)) as unknown);
}
function publicAnswerNamed(projection: unknown, name: (text: string) => string): unknown {
  return JSON.parse(name(JSON.stringify(projection)), (key, value: unknown) =>
    key === "relevant_as_of" ? undefined
      : key === "affected_node_ids" && Array.isArray(value) ? [...(value as string[])].sort() : value) as unknown;
}

type VariantResult = Readonly<{ saved: SavedDebate; ledger: readonly string[]; keys: readonly string[];
  prompts: readonly PromptSeen[]; marks: readonly unknown[]; publicAnswer: unknown; receipt: string }>;

describe("a run admitted without the engine member is today's run (spec §15)", () => {
  it("runners booted without and with the engine row save the same debate as today's and make no engine call", async () => {
    const seedName = "r2_engine_absent_seed";
    await copyDatabase(admin, MIGRATED_COPY, seedName);
    const seedPool = createPool(databaseUrl(seedName));
    let debate: AdmittedRun;
    try {
      debate = await previewDebateHarness({ pool: () => seedPool, stubClosers }).admittedRun("r2-engine-absent", { panelRefs: PANEL_REFS, depth: 2 });
    } finally {
      await seedPool.end();
    }
    const results = new Map<Variant, VariantResult>();
    for (const variant of VARIANTS) {
      const copy = `r2_engine_absent_${variant.toLowerCase()}`;
      await copyDatabase(admin, seedName, copy);
      const pool = createPool(databaseUrl(copy));
      try {
        const harness = previewDebateHarness({ pool: () => pool, stubClosers });
        const prompts: PromptSeen[] = [];
        const scripted = scriptedAnswers(debate.question);
        const answers = (request: GateRequest, chat: string): GateOverride | null => {
          prompts.push(promptSeen(request, chat));
          return scripted(request, chat);
        };
        const gates = await harness.startGates({}, undefined, answers);
        const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY,
          ...(variant === "ENGINE_ROW" ? { engine: { engineContractHash: engineContractHash() } } : {}) });
        const result = await harness.completedRun(composed, debate, gates);
        const calls = await harness.modelCalls(debate.runId);
        expect(calls.filter((call) => call.call_site_key.startsWith("VERDICT:")), variant).toEqual([]);
        expect(gates.requests.filter((request) => request.kind === "VERDICT_JUDGE" || request.kind === "INVESTIGATE"
          || request.kind === "UNKNOWN"), variant).toEqual([]);
        const engineRows = await pool.query<{ n: string }>(`SELECT ((SELECT count(*) FROM ledger.verdict_vote WHERE run_id=$1)
          + (SELECT count(*) FROM ledger.point_investigation WHERE run_id=$1))::text AS n`, [debate.runId]);
        expect(engineRows.rows[0]!.n, variant).toBe("0");
        const run = (await pool.query<{ envelope_basis: Record<string, unknown> }>(
          "SELECT envelope_basis FROM core.run WHERE run_id=$1", [debate.runId])).rows[0]!;
        expect(Object.hasOwn(run.envelope_basis, "engine"), variant).toBe(false);
        const selection = (await pool.query<{ served_root_selection: Record<string, unknown> & { verdictLabel: { rung: number } } }>(
          `SELECT served_root_selection FROM ledger.propagation_run WHERE run_id=$1 AND served_root_selection IS NOT NULL
            ORDER BY at_seq DESC LIMIT 1`, [debate.runId])).rows[0]!.served_root_selection;
        expect(selection.rule, variant).toBe(SERVED_ROOT_SELECTION_RULE);
        expect(Object.hasOwn(selection, "engine1Ladder"), variant).toBe(false);
        // pre-flight PF-R2b6.15, pre-flight consistency R2b: B11's second record-only member is engine 2's too.
        expect(Object.hasOwn(selection, "judgesGroups"), variant).toBe(false);
        expect(selection.verdictLabel.rung, variant).toBeLessThanOrEqual(4);
        const projection = await new ServeRepository(pool).readAnswerProjection(result.answerId, debate.askerId);
        expect(projection, variant).not.toBeNull();
        expect(Object.hasOwn(projection!, "judges_comparison"), variant).toBe(false);
        expect(projection!.verdict_state, variant).not.toBe("SPLIT");
        const name = await idNamer(pool, debate.runId);
        const ledger = await ledgerRows(pool, debate.runId, name);
        const keys = calls.map((call) => name(call.call_site_key));
        results.set(variant, Object.freeze({
          saved: await savedDebate(pool, debate.runId, result.answerId),
          // Parallel calls finish in any order: the ledger's and the gates' orders are compared as sorted lists.
          ledger: [...ledger].sort(), keys: [...keys].sort(),
          prompts: [...prompts].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
          marks: await markRecords(pool, result.answerId, name),
          publicAnswer: publicAnswerNamed(projection, name),
          receipt: JSON.stringify(run.envelope_basis)
        }));
      } finally {
        await pool.end();
      }
      await dropDatabase(admin, copy);
    }
    await dropDatabase(admin, seedName);
    const today = results.get("NO_ENGINE_ROW")!;
    // Not vacuous: today's run is a whole debate (the expectations of debate-shape-row-absent.test.ts:332-339 (R1c part 2);
    // pre-flight PF-R2b7.4).
    expect(today.saved.nodes.length).toBeGreaterThan(4);
    expect(today.keys).toEqual(expect.arrayContaining(["JUDGE", "JUDGE:cross-root:0->1", "COMPOSER:SYNTHESIZER:INITIAL:1"]));
    expect(today.keys.filter((key) => /^JUDGE:review:node#\d+$/u.test(key)).length).toBeGreaterThan(0);
    expect([...new Set(today.prompts.map((prompt) => prompt.kind))]).toEqual(expect.arrayContaining(["JUDGE", "PANEL", "REVIEW", "COMPOSE"]));
    const other = results.get("ENGINE_ROW")!;
    expect(other.keys, "call-site keys").toEqual(today.keys);
    expect(other.ledger, "ledger rows").toEqual(today.ledger);
    expect(other.prompts, "prompts").toEqual(today.prompts);
    expect(other.marks, "mark records").toEqual(today.marks);
    expect(other.saved, "saved debate").toEqual(today.saved);
    expect(other.publicAnswer, "public answer").toEqual(today.publicAnswer);
    expect(other.receipt, "receipt").toBe(today.receipt);
  }, 15 * 60 * 1000);
});
