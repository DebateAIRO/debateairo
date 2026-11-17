import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresCostReadoutReader, WEB_SEARCH_PROVIDER_REF, type CostReadoutLine } from "@debateai/budget";
import { createPool, migrate } from "@debateai/db";
import { openCostReadoutReader, runCostReadoutCli } from "../../apps/runner/src/cost-readout-cli.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * The owner's cost read-out over a real database: the sums the report prints are the ledger's own, whatever shape the
 * rows around a charge have. The cases a money report must not get wrong are seeded on purpose: a call charged in two
 * rows, a call with two entries in the ledger, a charge with no call on record, a web search, a charge outside a
 * debate, and a charge on a day outside the span.
 */

let database: TestDatabase;
let reader: PostgresCostReadoutReader;
const query = (sql: string, values: unknown[] = []) => database.pool.query(sql, values);
const today = () => new Date().toISOString().slice(0, 10);
const LONG_AGO = "2020-01-01";

async function run(): Promise<string> {
  const runId = randomUUID();
  await query(`INSERT INTO core.run (run_id,question_line,asker_id,session_id,caller_scope,as_of,
      asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,depth_params,
      agent_count,discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,created_at_seq,plan_tier)
    VALUES ($1,'Question?','test-asker','test-session','ASKER',clock_timestamp(),
      'casual','casual','ASKER','test','low','{}'::jsonb,1,'[{}]'::jsonb,0,'{}'::jsonb,1,'test',ledger.allocate_sequence(),'premium')`,
    [runId]);
  return runId;
}

/**
 * One entry of the ledger for a call, with the call's stored reply unless `reply` is false. Returns the call's attempt id.
 * A later entry for the same attempt gets a higher sequence: the ledger numbers its entries in the order they are written.
 */
async function call(input: Readonly<{
  runId: string; callSiteKey: string; modelRole: string | null; providerRef: string; maker: string; modelId: string;
  cachedInputTokens: number | null; attemptId?: string; actionKind?: string; reply?: boolean;
}>): Promise<string> {
  const attemptId = input.attemptId ?? randomUUID();
  const artifactId = input.reply === false ? null : randomUUID();
  if (artifactId !== null) await query(`INSERT INTO ledger.raw_artifact (
      raw_artifact_id, attempt_id, run_id, provider_ref, provider, model_id, maker, model_version, raw_text, metadata_json,
      parse_status, parse_error, input_hash, contract_hash, content_hash, at_seq, input_hash_version, content_hash_version,
      cached_input_tokens
    ) VALUES ($1,$2,$3,$4,'openai-compatible-http',$5,$6,'v1','reply','{}'::jsonb,'PARSED',NULL,$7,$8,$9,
      ledger.allocate_sequence(),1,1,$10)`,
    [artifactId, attemptId, input.runId, input.providerRef, input.modelId, input.maker, "1".repeat(64), "2".repeat(64),
      "3".repeat(64), input.cachedInputTokens]);
  await query(`INSERT INTO ledger.ledger_entry (
      sequence, run_id, attempt_id, action_kind, call_site_key, subject_item_id, stance_at_action, outcome, actor_ref,
      input_hash, contract_hash, raw_artifact_ref, started_at, finished_at, model_role
    ) VALUES (ledger.allocate_sequence(),$1,$2,$3,$4,'subject','UNASSIGNED','OK',$5,'input','contract',$6,
      clock_timestamp(),clock_timestamp(),$7)`,
    [input.runId, attemptId, input.actionKind ?? "MODEL_CALL", input.callSiteKey, input.providerRef, artifactId, input.modelRole]);
  return attemptId;
}

async function charge(input: Readonly<{
  source: string; runId: string | null; providerRef: string; micros: number; inputTokens: number; outputTokens: number;
  attemptId?: string | null; day?: string;
}>): Promise<void> {
  await query(`INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,
      input_tokens,output_tokens,attempt_id) VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9)`,
    [randomUUID(), input.source, input.runId, input.providerRef, input.day ?? today(), input.micros, input.inputTokens,
      input.outputTokens, input.attemptId ?? null]);
}

const A = { providerRef: "provider:a", maker: "Maker A", modelId: "maker-a/model-1" } as const;
const C = { providerRef: "provider:c", maker: "Maker C", modelId: "maker-c/model-2" } as const;
let runA: string;
let runB: string;

function line(lines: readonly CostReadoutLine[], code: string): Omit<CostReadoutLine, "words"> | undefined {
  const found = lines.find((candidate) => candidate.code === code);
  if (found === undefined) return undefined;
  const { words: _words, ...sums } = found;
  return sums;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  reader = new PostgresCostReadoutReader(database.pool);
  runA = await run();
  runB = await run();

  // The panel's call has three entries in the ledger: an older model-call entry at another site, its own, and one
  // that is not a model call. Only its own, the newest model-call entry, is the call's record: the others may neither
  // double the money nor rename the step.
  const panel = randomUUID();
  await call({ runId: runA, callSiteKey: "JUDGE:root:9", modelRole: "POSITION", ...A, cachedInputTokens: null, attemptId: panel, reply: false });
  await call({ runId: runA, callSiteKey: "PANEL:root:provider:a", modelRole: "JUDGE", ...A, cachedInputTokens: 500, attemptId: panel });
  await call({ runId: runA, callSiteKey: "STOPPING:round:1", modelRole: null, ...A, cachedInputTokens: null, attemptId: panel, actionKind: "BUDGET_SKIP", reply: false });
  // The call is charged in two rows. Its reply reported 500 cached tokens: counted once, not once per row.
  await charge({ source: "RUN", runId: runA, providerRef: A.providerRef, micros: 1_000, inputTokens: 2_000, outputTokens: 100, attemptId: panel });
  await charge({ source: "RUN", runId: runA, providerRef: A.providerRef, micros: 500, inputTokens: 1_000, outputTokens: 50, attemptId: panel });

  // Two reviews of two points: one step, whatever point each reviewed. Their vendor reported no cached count.
  for (const micros of [700, 300]) {
    const review = await call({ runId: runA, callSiteKey: `JUDGE:review:${randomUUID()}`, modelRole: "REVIEWER", ...C, cachedInputTokens: null });
    await charge({ source: "RUN", runId: runA, providerRef: C.providerRef, micros, inputTokens: 400, outputTokens: 40, attemptId: review });
  }
  // Two web searches: a flat price, no tokens, no call.
  for (let search = 0; search < 2; search += 1) {
    await charge({ source: "RUN", runId: runA, providerRef: WEB_SEARCH_PROVIDER_REF, micros: 1_000, inputTokens: 0, outputTokens: 0 });
  }
  // The story, written after the debate: outside the debate's own steps. Its vendor reported zero cached tokens.
  const story = await call({ runId: runA, callSiteKey: "STORY:STORYTELLER:1", modelRole: null, ...A, cachedInputTokens: 0 });
  await charge({ source: "STORY", runId: runA, providerRef: A.providerRef, micros: 900, inputTokens: 5_000, outputTokens: 800, attemptId: story });
  // A charge inside the debate whose call the ledger does not hold.
  await charge({ source: "RUN", runId: runA, providerRef: A.providerRef, micros: 40, inputTokens: 10, outputTokens: 1, attemptId: randomUUID() });
  // The same run, long ago: outside any span that ends today, inside the run's own read-out.
  await charge({ source: "RUN", runId: runA, providerRef: A.providerRef, micros: 60_000, inputTokens: 7, outputTokens: 7, day: LONG_AGO });

  // A second, cheaper run: one position.
  const position = await call({ runId: runB, callSiteKey: "JUDGE:root:0", modelRole: "POSITION", ...C, cachedInputTokens: 30 });
  await charge({ source: "RUN", runId: runB, providerRef: C.providerRef, micros: 2_000, inputTokens: 600, outputTokens: 60, attemptId: position });
  // The help chat: no run at all.
  await charge({ source: "SUPPORT", runId: null, providerRef: "provider:support", micros: 250, inputTokens: 90, outputTokens: 9 });
}, 600_000);
afterAll(async () => { await database?.stop(); });

describe("the cost read-out over the spend ledger", () => {
  it("adds up a span: every charge of its days once, each under its step, its job and its model", async () => {
    const readout = await reader.readDays({ from: today(), to: today() });
    expect(readout.scope).toEqual({ kind: "DAYS", from: today(), to: today() });
    expect(readout.total).toEqual({
      charges: 10, chargeMicros: 1_500 + 1_000 + 2_000 + 900 + 40 + 2_000 + 250, inputTokens: 3_000 + 800 + 5_000 + 10 + 600 + 90,
      outputTokens: 150 + 80 + 800 + 1 + 60 + 9, cachedInputTokens: 530, cachedReportedCharges: 4
    });
    expect(line(readout.steps, "PANEL")).toEqual({ code: "PANEL", charges: 2, chargeMicros: 1_500, inputTokens: 3_000, outputTokens: 150, cachedInputTokens: 500, cachedReportedCharges: 2 });
    expect(line(readout.steps, "JUDGE:review")).toEqual({ code: "JUDGE:review", charges: 2, chargeMicros: 1_000, inputTokens: 800, outputTokens: 80, cachedInputTokens: 0, cachedReportedCharges: 0 });
    expect(line(readout.steps, "WEB_SEARCH")).toEqual({ code: "WEB_SEARCH", charges: 2, chargeMicros: 2_000, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cachedReportedCharges: 0 });
    expect(line(readout.steps, "STORY:STORYTELLER")).toEqual({ code: "STORY:STORYTELLER", charges: 1, chargeMicros: 900, inputTokens: 5_000, outputTokens: 800, cachedInputTokens: 0, cachedReportedCharges: 1 });
    expect(line(readout.steps, "RUN")).toEqual({ code: "RUN", charges: 1, chargeMicros: 40, inputTokens: 10, outputTokens: 1, cachedInputTokens: 0, cachedReportedCharges: 0 });
    expect(line(readout.steps, "JUDGE:root")).toEqual({ code: "JUDGE:root", charges: 1, chargeMicros: 2_000, inputTokens: 600, outputTokens: 60, cachedInputTokens: 30, cachedReportedCharges: 1 });
    expect(line(readout.steps, "SUPPORT")).toEqual({ code: "SUPPORT", charges: 1, chargeMicros: 250, inputTokens: 90, outputTokens: 9, cachedInputTokens: 0, cachedReportedCharges: 0 });
    // The entry that is not a model call named no step.
    expect(line(readout.steps, "STOPPING:round")).toBeUndefined();
    expect(readout.steps.map((step) => step.code).sort()).toEqual(["JUDGE:review", "JUDGE:root", "PANEL", "RUN", "STORY:STORYTELLER", "SUPPORT", "WEB_SEARCH"]);

    expect(readout.jobs.map((job) => [job.code, job.chargeMicros]).sort()).toEqual([
      ["JUDGE", 1_500], ["NO_JOB", 2_000 + 900 + 40 + 250], ["POSITION", 2_000], ["REVIEWER", 1_000]
    ]);
    expect(readout.models.map((model) => [model.code, model.words, model.chargeMicros]).sort()).toEqual([
      ["maker-a/model-1", "Maker A", 1_500 + 900], ["maker-c/model-2", "Maker C", 1_000 + 2_000],
      ["provider:a", null, 40], ["provider:support", null, 250], [WEB_SEARCH_PROVIDER_REF, null, 2_000]
    ]);
    for (const lines of [readout.steps, readout.jobs, readout.models]) {
      expect(lines.reduce((sum, each) => sum + each.chargeMicros, 0)).toBe(readout.total.chargeMicros);
      expect(lines.reduce((sum, each) => sum + each.charges, 0)).toBe(readout.total.charges);
    }
  });

  it("lists the span's runs: how many, what a usual and a dear one cost, and the dearest first", async () => {
    const { runs } = await reader.readDays({ from: today(), to: today() });
    const costA = 1_500 + 1_000 + 2_000 + 900 + 40;
    expect(runs).toEqual({
      count: 2, medianMicros: Math.round((costA + 2_000) / 2), ninetiethMicros: Math.round(2_000 + (costA - 2_000) * 0.9),
      dearest: [{ runId: runA, chargeMicros: costA, charges: 8 }, { runId: runB, chargeMicros: 2_000, charges: 1 }]
    });
  });

  it("counts a charge by its own day: a span reaches back only as far as it says", async () => {
    const wide = await reader.readDays({ from: LONG_AGO, to: LONG_AGO });
    expect(wide.total).toMatchObject({ charges: 1, chargeMicros: 60_000 });
    expect(wide.runs).toMatchObject({ count: 1, dearest: [{ runId: runA, chargeMicros: 60_000, charges: 1 }] });
    const empty = await reader.readDays({ from: "2019-01-01", to: "2019-01-31" });
    expect(empty.total.charges).toBe(0);
    expect(empty.runs).toEqual({ count: 0, medianMicros: null, ninetiethMicros: null, dearest: [] });
  });

  it("reads one run whole, on whatever day it was charged, and nothing of another run", async () => {
    const readout = await reader.readRun(runA.toUpperCase());
    expect(readout?.scope).toEqual({ kind: "RUN", runId: runA });
    expect(readout?.runs).toBeNull();
    expect(readout?.total).toMatchObject({ charges: 9, chargeMicros: 1_500 + 1_000 + 2_000 + 900 + 40 + 60_000, cachedInputTokens: 500 });
    expect(line(readout!.steps, "JUDGE:root")).toBeUndefined();
    expect(line(readout!.steps, "SUPPORT")).toBeUndefined();
    expect(await reader.readRun(randomUUID())).toBeNull();
    await expect(reader.readRun("not-an-id")).rejects.toMatchObject({ code: "COST_READOUT_RUN_INVALID" });
  });
});

describe("the cost read-out command's connection", () => {
  it("reads through a connection that can only read, and prints the span", async () => {
    const stdout: string[] = [], stderr: string[] = [];
    const exit = await runCostReadoutCli(["--days", "1"], { stdout: (text) => { stdout.push(text); }, stderr: (text) => { stderr.push(text); } },
      () => openCostReadoutReader(database.connectionString, false));
    expect(stderr).toEqual([]);
    expect(exit).toBe(0);
    expect(stdout.join("")).toContain(`cost read-out: ${today()} to ${today()}, by the UTC day of each charge`);
    expect(stdout.join("")).toContain("grading the points (the panel) [PANEL]");
    // The same opening, with its pool in hand, refuses a write.
    const pool = createPool(database.connectionString, { max: 1 });
    pool.on("connect", (client) => { client.query("SET default_transaction_read_only = on").catch(() => undefined); });
    try {
      await expect(pool.query("CREATE TEMP TABLE cost_readout_write_probe (x int)")).rejects.toMatchObject({ code: "25006" });
    } finally {
      await pool.end();
    }
  });

  it("refuses, in production, a connection that is not the runner's principal", async () => {
    await expect(openCostReadoutReader(database.connectionString, true)).rejects.toThrowError(/^COST_READOUT_PRINCIPAL_INVALID$/u);
  });

  /**
   * Row-level security. The runner's login is the runtime role plus the cross-account marker, so it reads every
   * account's charges. A login with the runtime role alone is a signed-in request's: with no account in hand it
   * owns no run, so the same read-out shows it nothing of anyone's money.
   */
  it("reads every account's charges as a login built like the runner's, and none as a request's login", async () => {
    const password = randomUUID();
    await query(`CREATE ROLE cost_readout_runner LOGIN PASSWORD '${password}' IN ROLE debateai_runtime, debateai_rls_all_accounts`);
    await query(`CREATE ROLE cost_readout_request LOGIN PASSWORD '${password}' IN ROLE debateai_runtime`);
    const as = (role: string): string => {
      const url = new URL(database.connectionString);
      url.username = role;
      url.password = password;
      return url.toString();
    };
    const whole = await reader.readDays({ from: today(), to: today() });
    const runner = await openCostReadoutReader(as("cost_readout_runner"), false);
    try {
      const seen = await runner.readDays({ from: today(), to: today() });
      expect(seen.total).toEqual(whole.total);
      expect(seen.steps).toEqual(whole.steps);
      expect(seen.runs).toEqual(whole.runs);
      expect((await runner.readRun(runA))?.total.charges).toBe(9);
    } finally {
      await runner.close();
    }
    const request = await openCostReadoutReader(as("cost_readout_request"), false);
    try {
      for (const day of [today(), LONG_AGO]) {
        const seen = await request.readDays({ from: day, to: day });
        expect(seen.total.charges).toBe(0);
        expect(seen.runs).toEqual({ count: 0, medianMicros: null, ninetiethMicros: null, dearest: [] });
      }
      expect(await request.readRun(runA)).toBeNull();
    } finally {
      await request.close();
    }
  });
});
