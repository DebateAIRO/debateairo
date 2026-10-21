import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { PostgresModelSpendStore } from "../../packages/budget/src/model-spend.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let spend: PostgresModelSpendStore;
const query = (sql: string, values: unknown[] = []) => database.pool.query(sql, values);
const windowEnd = () => new Date(Date.now() + 60_000);
const windowStart = (days: number) => new Date(Date.now() - days * 86_400_000);
const today = () => new Date().toISOString().slice(0, 10);

type Fixture = Readonly<{ runId: string; ownerRef: string; answerId: string; amount: number }>;

async function fixture(planTier: "premium" | "free" = "premium", amount = 4200): Promise<Fixture> {
  const runId = randomUUID();
  const ownerRef = randomUUID();
  const answerId = randomUUID();
  const userId = randomUUID();
  const workId = randomUUID();
  const bundleId = randomUUID();
  await query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,owner_ref,state,adult_affirmed_at)
    VALUES ($1,$2,$3::jsonb,'fixture-password-hash',$4,$5,'active',clock_timestamp())`,
    [userId, randomBytes(32), JSON.stringify({ ciphertext: true, v: 1 }), `synthesis-${userId}`, ownerRef]);
  await query(`INSERT INTO core.run (run_id,question_line,asker_id,session_id,caller_scope,as_of,
      asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,depth_params,
      agent_count,discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,created_at_seq,plan_tier)
    VALUES ($1,'Question?', 'test-asker','test-session','ASKER',clock_timestamp(),
      'casual','casual','ASKER','test','low','{}'::jsonb,1,'[{}]'::jsonb,0,'{}'::jsonb,1,'test',ledger.allocate_sequence(),$2)`,
    [runId, planTier]);
  await query(`INSERT INTO core.work_item (work_item_id,run_id,battery_row_id,node_set,command_key,state,created_at_seq)
    VALUES ($1,$2,'seed','[]'::jsonb,$3,'READY',ledger.allocate_sequence())`, [workId,runId,randomUUID()]);
  await query(`INSERT INTO serve.fact_bundle (fact_bundle_id,run_id,facts,residual_objections,content_hash,version)
    VALUES ($1,$2,'[]'::jsonb,'[]'::jsonb,'seed',1)`, [bundleId,runId]);
  await query(`INSERT INTO serve.answer (answer_id,answer_version,run_id,work_item_id,terminal,serve_state,
      verdict_state,answer_form,condition_marks,fact_bundle_id,sealed_at_seq)
    VALUES ($1,1,$2,$3,'SERVED','COMPOSED','CONTESTED','{}'::jsonb,'[]'::jsonb,$4,ledger.allocate_sequence())`,
    [answerId,runId,workId,bundleId]);
  await query(`INSERT INTO billing.run_charge_scope (run_id,owner_ref,plan_id,entitlement_event_id,admitted_at,funding_kind)
    VALUES ($1,$2,'PLUS',$3,clock_timestamp()-interval '1 day','SUBSCRIPTION')`,
    [runId,ownerRef,randomUUID()]);
  for (const [source, charge] of [["RUN",amount],["STORY",amount / 2]] as const) {
    await query(`INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,
      charge_micros,input_tokens,output_tokens) VALUES ($1,$2,$3,'test-provider',$4::date,$5,1,1)`,
      [randomUUID(),source,runId,today(),charge]);
  }
  await query(`INSERT INTO ledger.model_spend_hold (hold_id,run_id,held_micros,opened_at)
    VALUES ($1,$2,$3,clock_timestamp())`, [randomUUID(),runId,amount * 2]);
  return { runId,ownerRef,answerId,amount: amount + amount / 2 };
}

async function requestRemoval(row: Fixture): Promise<void> {
  const attemptId = randomUUID();
  const resultId = randomUUID();
  await query(`INSERT INTO serve.synthesis_check_attempt
    (attempt_id,run_id,answer_id,answer_version,origin,request_id)
    VALUES ($1,$2,$3,1,'PUBLISH',NULL)`, [attemptId,row.runId,row.answerId]);
  await query(`INSERT INTO serve.synthesis_check_result
    (result_id,attempt_id,run_id,answer_id,answer_version,synthesis_origin_version,final,
      failure_code,policy_version,content)
    VALUES ($1,$2,$3,$4,1,1,true,NULL,'synthesis.content-check.v1@0123456789abcdef',
      '{"verdict":"FLAGGED","categories":["SUICIDE_OR_HARM_TO_OTHERS"]}'::jsonb)`,
    [resultId,attemptId,row.runId,row.answerId]);
  await query(`INSERT INTO serve.synthesis_check_removal_request (request_id,result_id,run_id)
    VALUES ($1,$2,$3)`, [randomUUID(),resultId,row.runId]);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  spend = new PostgresModelSpendStore(database.pool);
}, 600_000);
afterAll(async () => { await database?.stop(); });

describe("a removed premium debate leaves the owner's subscription windows without changing the ledger", () => {
  it("a removal request makes readOwnerSpentMicros drop by exactly that run's RUN and STORY spend in the day, week and month windows", async () => {
    const row = await fixture();
    const windows = [1,7,31].map((days) => ({ from: windowStart(days), to: windowEnd() }));
    const before = await Promise.all(windows.map(({ from,to }) => spend.readOwnerSpentMicros(row.ownerRef,from,to)));
    expect(before).toEqual([row.amount,row.amount,row.amount]);
    await requestRemoval(row);
    for (const [index, { from,to }] of windows.entries()) {
      expect(await spend.readOwnerSpentMicros(row.ownerRef,from,to)).toBe(before[index]! - row.amount);
    }
  });

  it("after the erasure finalizes (request gone, binding consumed) the run still counts in none of them", async () => {
    const row = await fixture();
    await requestRemoval(row);
    await query("DELETE FROM serve.synthesis_check_removal_request WHERE run_id=$1", [row.runId]);
    await query(`INSERT INTO identity.synthesis_check_erasure_binding
      (request_ref,run_id,owner_ref,audit_id,audit_actor_ref,audit_target_ref,created_at,consumed_at)
      VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp(),clock_timestamp())`,
      [randomUUID(),row.runId,row.ownerRef,randomUUID(),randomUUID(),randomUUID()]);
    for (const days of [1,7,31]) {
      expect(await spend.readOwnerSpentMicros(row.ownerRef,windowStart(days),windowEnd())).toBe(0);
    }
  });

  it("its hold leaves readOwnerCountedHoldsMicros", async () => {
    const row = await fixture();
    expect(await spend.readOwnerCountedHoldsMicros(row.ownerRef)).toBe(row.amount / 3);
    await requestRemoval(row);
    expect(await spend.readOwnerCountedHoldsMicros(row.ownerRef)).toBe(0);
  });

  it("a Free run (plan_tier free) with a removal request does not drop", async () => {
    const row = await fixture("free");
    const from = windowStart(1), to = windowEnd();
    expect(await spend.readOwnerSpentMicros(row.ownerRef,from,to)).toBe(row.amount);
    await requestRemoval(row);
    expect(await spend.readOwnerSpentMicros(row.ownerRef,from,to)).toBe(row.amount);
    expect(await spend.readOwnerCountedHoldsMicros(row.ownerRef)).toBe(row.amount / 3);
  });

  it("no ledger.model_spend row was updated or deleted: the row count and the sum of charge_micros are unchanged, and the site's day pot reads the same", async () => {
    const row = await fixture();
    const before = (await query("SELECT count(*)::int n,sum(charge_micros)::text total FROM ledger.model_spend WHERE run_id=$1", [row.runId])).rows[0];
    const siteBefore = await spend.readDaySpentMicros(today());
    await requestRemoval(row);
    const after = (await query("SELECT count(*)::int n,sum(charge_micros)::text total FROM ledger.model_spend WHERE run_id=$1", [row.runId])).rows[0];
    expect(after).toEqual(before);
    expect(await spend.readDaySpentMicros(today())).toBe(siteBefore);
  });

  it("the withdrawal's read, readOwnerSpentMicros(owner, periodStart, withdrewAt) with no funding argument, drops by the same RUN and STORY spend", async () => {
    const row = await fixture();
    const periodStart = windowStart(31), withdrewAt = windowEnd();
    const before = await spend.readOwnerSpentMicros(row.ownerRef,periodStart,withdrewAt);
    await requestRemoval(row);
    expect(await spend.readOwnerSpentMicros(row.ownerRef,periodStart,withdrewAt)).toBe(before - row.amount);
  });
});
