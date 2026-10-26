import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { PostgresModelSpendStore } from "../../packages/budget/src/model-spend.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const query = (sql: string, args: unknown[] = []) => database.pool.query(sql,args);
const policy = "synthesis.content-check.v1@0123456789abcdef";
type Run = Readonly<{ runId: string; answerId: string; workId: string; bundleId: string }>;

async function seedRun(): Promise<Run> {
  const runId = randomUUID(), answerId = randomUUID(), workId = randomUUID(), bundleId = randomUUID();
  await query(`INSERT INTO core.run (run_id,question_line,asker_id,session_id,caller_scope,as_of,
    asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,depth_params,
    agent_count,discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,created_at_seq)
    VALUES ($1,'Question?','test-asker','test-session','ASKER',clock_timestamp(),'casual','casual',
      'ASKER','test','low','{}'::jsonb,1,'[{}]'::jsonb,0,'{}'::jsonb,1,'test',ledger.allocate_sequence())`, [runId]);
  await query(`INSERT INTO core.work_item (work_item_id,run_id,battery_row_id,node_set,command_key,state,created_at_seq)
    VALUES ($1,$2,'seed','[]'::jsonb,$3,'READY',ledger.allocate_sequence())`, [workId,runId,randomUUID()]);
  await query(`INSERT INTO serve.fact_bundle (fact_bundle_id,run_id,facts,residual_objections,content_hash,version)
    VALUES ($1,$2,'[]'::jsonb,'[]'::jsonb,'seed',1)`, [bundleId,runId]);
  await query(`INSERT INTO serve.answer (answer_id,answer_version,run_id,work_item_id,terminal,serve_state,
    verdict_state,answer_form,condition_marks,fact_bundle_id,sealed_at_seq)
    VALUES ($1,1,$2,$3,'SERVED','COMPOSED','CONTESTED','{}'::jsonb,'[]'::jsonb,$4,ledger.allocate_sequence())`,
    [answerId,runId,workId,bundleId]);
  return { runId,answerId,workId,bundleId };
}

async function secondVersion(run: Run): Promise<void> {
  await query(`INSERT INTO serve.answer (answer_id,answer_version,run_id,work_item_id,terminal,serve_state,
    verdict_state,answer_form,condition_marks,fact_bundle_id,sealed_at_seq)
    VALUES ($1,2,$2,$3,'SERVED','RECOMPOSED_ONCE','CONTESTED','{}'::jsonb,'[]'::jsonb,$4,ledger.allocate_sequence())`,
    [run.answerId,run.runId,run.workId,run.bundleId]);
}

async function withRuntime<T>(use: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE debateai_runtime");
    return await use(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function insertAttempt(run: Run, version = 1, origin: "PUBLISH" | "SETTLEMENT" = "PUBLISH") {
  const attemptId = randomUUID(), requestId = origin === "SETTLEMENT" ? randomUUID() : null;
  if (requestId) await query(`INSERT INTO serve.synthesis_check_request (request_id,run_id,answer_id,answer_version)
    VALUES ($1,$2,$3,$4)`, [requestId,run.runId,run.answerId,version]);
  await query(`INSERT INTO serve.synthesis_check_attempt
    (attempt_id,run_id,answer_id,answer_version,origin,request_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [attemptId,run.runId,run.answerId,version,origin,requestId]);
  return { attemptId,requestId };
}

async function insertResult(run: Run, attemptId: string, options: { final?: boolean; version?: number; originVersion?: number } = {}) {
  const resultId = randomUUID();
  const final = options.final ?? true;
  await query(`INSERT INTO serve.synthesis_check_result
    (result_id,attempt_id,run_id,answer_id,answer_version,synthesis_origin_version,final,
      failure_code,policy_version,content)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [resultId,attemptId,run.runId,run.answerId,options.version ?? 1,options.originVersion ?? 1,
      final,final ? null : "NOT_CONFIGURED",policy,JSON.stringify(final ? { verdict: "FLAGGED", categories: ["SUICIDE_OR_HARM_TO_OTHERS"] } : {})]);
  return resultId;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);
afterAll(async () => { await database?.stop(); });

describe("0123 synthesis check records and runtime boundaries", () => {
  it("the result writer refuses an attempt whose answer version differs from its parameters", async () => {
    const run = await seedRun();
    await secondVersion(run);
    const first = await insertAttempt(run, 1);
    await expect(withRuntime((client) => client.query(`SELECT serve.store_synthesis_check_result(
      $1,$2,$3,$4,2,1,true,NULL,$5,'{"verdict":"CLEAR","categories":[]}'::jsonb,NULL,NULL,false)`,
      [randomUUID(),first.attemptId,run.runId,run.answerId,policy]))).rejects.toMatchObject({
        code: "23503", message: "SYNTHESIS_CHECK_ATTEMPT_MISMATCH"
      });
  });

  it("the inheritance writer refuses an attempt whose answer version differs from its parameters", async () => {
    const run = await seedRun();
    await secondVersion(run);
    const first = await insertAttempt(run, 1);
    const finalId = await insertResult(run, first.attemptId);
    await expect(withRuntime((client) => client.query(`SELECT serve.record_synthesis_check_inheritance(
      $1,$2,$3,2,$4)`, [first.attemptId,run.runId,run.answerId,finalId]))).rejects.toMatchObject({
        code: "23503", message: "SYNTHESIS_CHECK_ATTEMPT_MISMATCH"
      });
  });

  it("an attempt cannot inherit its own result", async () => {
    const run = await seedRun();
    const attempt = await insertAttempt(run);
    const resultId = await insertResult(run, attempt.attemptId);
    await expect(query(`INSERT INTO serve.synthesis_check_inheritance
      (attempt_id,run_id,answer_id,answer_version,inherited_result_id) VALUES($1,$2,$3,1,$4)`,
      [attempt.attemptId,run.runId,run.answerId,resultId])).rejects.toMatchObject({
        code: "23514", message: "SYNTHESIS_CHECK_INHERITANCE_INVALID"
      });
  });

  it("runtime cannot insert a removal request", async () => {
    const run = await seedRun();
    const attempt = await insertAttempt(run);
    const resultId = await insertResult(run, attempt.attemptId);
    await expect(withRuntime((client) => client.query(`INSERT INTO serve.synthesis_check_removal_request
      (request_id,result_id,run_id) VALUES($1,$2,$3)`,
      [randomUUID(),resultId,run.runId]))).rejects.toMatchObject({ code: "42501" });
  });

  it("the runtime role inserts and selects a request and an attempt, and stores a sealed result only through the writer", async () => {
    const run = await seedRun();
    await withRuntime(async (client) => {
      const requestId = randomUUID(), attemptId = randomUUID(), resultId = randomUUID();
      await client.query("INSERT INTO serve.synthesis_check_request(request_id,run_id,answer_id,answer_version) VALUES($1,$2,$3,1)",
        [requestId,run.runId,run.answerId]);
      await client.query(`INSERT INTO serve.synthesis_check_attempt
        (attempt_id,run_id,answer_id,answer_version,origin,request_id) VALUES($1,$2,$3,1,'SETTLEMENT',$4)`,
        [attemptId,run.runId,run.answerId,requestId]);
      const stored = await client.query(`SELECT serve.store_synthesis_check_result(
        $1,$2,$3,$4,1,1,true,NULL,$5,'{"verdict":"CLEAR","categories":[]}'::jsonb,NULL,NULL,false) AS stored`,
        [resultId,attemptId,run.runId,run.answerId,policy]);
      expect(stored.rows[0]?.stored).toBe(true);
      for (const [table, id, key] of [
        ["synthesis_check_request",requestId,"request_id"], ["synthesis_check_attempt",attemptId,"attempt_id"],
        ["synthesis_check_result",resultId,"result_id"]
      ] as const) {
        expect((await client.query(`SELECT ${key} FROM serve.${table} WHERE ${key}=$1`, [id])).rows).toHaveLength(1);
      }
    });
  });

  it("the runtime role cannot insert a result row directly, so it cannot forge a second final past the writer's origin guard (REV-S01-p3 security N1)", async () => {
    const run = await seedRun();
    await secondVersion(run);
    const first = await insertAttempt(run, 1), second = await insertAttempt(run, 2);
    await insertResult(run, first.attemptId);
    await expect(withRuntime((client) => client.query(`INSERT INTO serve.synthesis_check_result
      (result_id,attempt_id,run_id,answer_id,answer_version,synthesis_origin_version,final,failure_code,policy_version,content)
      VALUES ($1,$2,$3,$4,2,2,true,NULL,$5,'{"verdict":"FLAGGED","categories":["HATE_SPEECH"]}'::jsonb)`,
      [randomUUID(),second.attemptId,run.runId,run.answerId,policy]))).rejects.toMatchObject({ code: "42501" });
    expect((await query("SELECT count(*)::int AS n FROM serve.synthesis_check_result WHERE answer_id=$1", [run.answerId])).rows[0]?.n).toBe(1);
  });

  it("a second final result for the same answer and synthesis origin is refused with 23505 on synthesis_check_result_one_final_per_synthesis, after the run-match and the three carrier guards accepted it", async () => {
    const run = await seedRun();
    const first = await insertAttempt(run), second = await insertAttempt(run);
    await insertResult(run,first.attemptId);
    await expect(insertResult(run,second.attemptId)).rejects.toMatchObject({ code: "23505", constraint: "synthesis_check_result_one_final_per_synthesis" });
  });

  it("UNAVAILABLE results repeat freely for one synthesis", async () => {
    const run = await seedRun();
    const first = await insertAttempt(run), second = await insertAttempt(run);
    await insertResult(run,first.attemptId,{ final: false });
    await insertResult(run,second.attemptId,{ final: false });
    expect((await query("SELECT count(*)::int n FROM serve.synthesis_check_result WHERE answer_id=$1", [run.answerId])).rows[0].n).toBe(2);
  });

  it("UPDATE and DELETE on each append-only table are refused with 42501 under the runtime role, and with 55000 from core.reject_mutation under the owner", async () => {
    const run = await seedRun();
    const { attemptId,requestId } = await insertAttempt(run,1,"SETTLEMENT");
    const resultId = await insertResult(run,attemptId);
    await secondVersion(run);
    const later = await insertAttempt(run,2);
    await query(`INSERT INTO serve.synthesis_check_inheritance
      (attempt_id,run_id,answer_id,answer_version,inherited_result_id) VALUES ($1,$2,$3,2,$4)`,
      [later.attemptId,run.runId,run.answerId,resultId]);
    for (const [table, key, id] of [
      ["synthesis_check_request","request_id",requestId], ["synthesis_check_attempt","attempt_id",attemptId],
      ["synthesis_check_result","result_id",resultId], ["synthesis_check_inheritance","attempt_id",later.attemptId]
    ] as const) {
      for (const verb of ["UPDATE","DELETE"] as const) {
        const sql = verb === "UPDATE" ? `UPDATE serve.${table} SET ${key}=${key} WHERE ${key}=$1`
          : `DELETE FROM serve.${table} WHERE ${key}=$1`;
        await expect(withRuntime((client) => client.query(sql,[id]))).rejects.toMatchObject({ code: "42501" });
        await expect(query(sql,[id])).rejects.toMatchObject({ code: "55000" });
      }
    }
  });

  it("TRUNCATE on each table is refused with 42501 under the runtime role and with 55000 TRUNCATE_REJECTED from core.reject_truncate under the owner", async () => {
    for (const table of ["synthesis_check_request","synthesis_check_attempt","synthesis_check_result",
      "synthesis_check_inheritance","synthesis_check_removal_request","synthesis_check_removal_notice"] as const) {
      await expect(withRuntime((client) => client.query(`TRUNCATE serve.${table} CASCADE`))).rejects.toMatchObject({ code: "42501" });
      await expect(query(`TRUNCATE serve.${table} CASCADE`)).rejects.toMatchObject({ code: "55000", message: expect.stringContaining("TRUNCATE_REJECTED") });
    }
    await expect(query("TRUNCATE identity.synthesis_check_erasure_binding")).rejects.toMatchObject({ code: "55000" });
  });

  it("a request, an attempt, a result or an inheritance naming another run's answer is refused with 23503 SYNTHESIS_CHECK_RUN_MISMATCH", async () => {
    const own = await seedRun(), other = await seedRun();
    const request = () => query(`INSERT INTO serve.synthesis_check_request(request_id,run_id,answer_id,answer_version)
      VALUES($1,$2,$3,1)`, [randomUUID(),other.runId,own.answerId]);
    await expect(request()).rejects.toMatchObject({ code: "23503", message: "SYNTHESIS_CHECK_RUN_MISMATCH" });
    await expect(query(`INSERT INTO serve.synthesis_check_attempt
      (attempt_id,run_id,answer_id,answer_version,origin) VALUES($1,$2,$3,1,'PUBLISH')`,
      [randomUUID(),other.runId,own.answerId])).rejects.toMatchObject({ code: "23503", message: "SYNTHESIS_CHECK_RUN_MISMATCH" });
    const attempt = await insertAttempt(own);
    await expect(query(`INSERT INTO serve.synthesis_check_result
      (result_id,attempt_id,run_id,answer_id,answer_version,synthesis_origin_version,final,policy_version,content)
      VALUES($1,$2,$3,$4,1,1,true,$5,'{}'::jsonb)`,
      [randomUUID(),attempt.attemptId,other.runId,own.answerId,policy])).rejects.toMatchObject({ code: "23503", message: "SYNTHESIS_CHECK_RUN_MISMATCH" });
    const resultId = await insertResult(own,attempt.attemptId);
    await secondVersion(own);
    const later = await insertAttempt(own,2);
    await expect(query(`INSERT INTO serve.synthesis_check_inheritance
      (attempt_id,run_id,answer_id,answer_version,inherited_result_id) VALUES($1,$2,$3,2,$4)`,
      [later.attemptId,other.runId,own.answerId,resultId])).rejects.toMatchObject({ code: "23503", message: "SYNTHESIS_CHECK_RUN_MISMATCH" });
  });

  it("a SYNTHESIS_CHECK spend row with no run or with an attempt is refused with 23514 on model_spend_synthesis_check_names_its_run, and one with a phase with 23514 on model_spend_phase_is_a_run_charge", async () => {
    const run = await seedRun();
    const charge = (runId: string | null, attemptId: string | null, phase: string | null) => query(`INSERT INTO ledger.model_spend
      (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens,spend_phase,attempt_id)
      VALUES($1,'SYNTHESIS_CHECK',$2,'test-provider',current_date,100,1,1,$3,$4)`,
      [randomUUID(),runId,phase,attemptId]);
    await expect(charge(null,null,null)).rejects.toMatchObject({ code: "23514", constraint: "model_spend_synthesis_check_names_its_run" });
    await expect(charge(run.runId,randomUUID(),null)).rejects.toMatchObject({ code: "23514", constraint: "model_spend_synthesis_check_names_its_run" });
    await expect(charge(run.runId,null,"BODY")).rejects.toMatchObject({ code: "23514", constraint: "model_spend_phase_is_a_run_charge" });
    await charge(run.runId,null,null);
  });

  it("readRunSpentMicros ignores SYNTHESIS_CHECK rows", async () => {
    const run = await seedRun();
    for (const [source, charge] of [["RUN",500],["SYNTHESIS_CHECK",300]] as const) {
      await query(`INSERT INTO ledger.model_spend
        (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
        VALUES($1,$2,$3,'test-provider',current_date,$4,1,1)`, [randomUUID(),source,run.runId,charge]);
    }
    expect(await new PostgresModelSpendStore(database.pool).readRunSpentMicros(run.runId)).toBe(500);
  });

  it("a removal request is refused with 23514 SYNTHESIS_CHECK_REMOVAL_RESULT_INVALID unless its result is final and of the same run, and the runtime cannot UPDATE or DELETE it (42501)", async () => {
    const run = await seedRun(), other = await seedRun();
    const unfinished = await insertAttempt(run), final = await insertAttempt(other);
    const unfinishedId = await insertResult(run,unfinished.attemptId,{ final: false });
    const otherId = await insertResult(other,final.attemptId);
    const removal = (resultId: string) => query("INSERT INTO serve.synthesis_check_removal_request(request_id,result_id,run_id) VALUES($1,$2,$3)",
      [randomUUID(),resultId,run.runId]);
    await expect(removal(unfinishedId)).rejects.toMatchObject({ code: "23514", message: "SYNTHESIS_CHECK_REMOVAL_RESULT_INVALID" });
    await expect(removal(otherId)).rejects.toMatchObject({ code: "23514", message: "SYNTHESIS_CHECK_REMOVAL_RESULT_INVALID" });
    const accepted = await insertAttempt(run);
    const resultId = await insertResult(run,accepted.attemptId);
    await removal(resultId);
    await expect(withRuntime((client) => client.query("UPDATE serve.synthesis_check_removal_request SET run_id=run_id WHERE run_id=$1", [run.runId]))).rejects.toMatchObject({ code: "42501" });
    await expect(withRuntime((client) => client.query("DELETE FROM serve.synthesis_check_removal_request WHERE run_id=$1", [run.runId]))).rejects.toMatchObject({ code: "42501" });
  });

  it("inheritance requires a final result of the same answer, at an earlier version or from a losing same-version attempt", async () => {
    const run = await seedRun(), other = await seedRun();
    await secondVersion(run);
    const unavailable = await insertAttempt(run), otherAttempt = await insertAttempt(other);
    const unavailableId = await insertResult(run,unavailable.attemptId,{ final: false });
    const otherId = await insertResult(other,otherAttempt.attemptId);
    const tryInherit = async (resultId: string) => {
      const current = await insertAttempt(run,2);
      return query(`INSERT INTO serve.synthesis_check_inheritance
        (attempt_id,run_id,answer_id,answer_version,inherited_result_id) VALUES($1,$2,$3,2,$4)`,
        [current.attemptId,run.runId,run.answerId,resultId]);
    };
    await expect(tryInherit(unavailableId)).rejects.toMatchObject({ code: "23514", message: "SYNTHESIS_CHECK_INHERITANCE_INVALID" });
    await expect(tryInherit(otherId)).rejects.toMatchObject({ code: "23514", message: "SYNTHESIS_CHECK_INHERITANCE_INVALID" });
    const earlier = await insertAttempt(run), earlierId = await insertResult(run,earlier.attemptId);
    await tryInherit(earlierId);
    const loser = await insertAttempt(run);
    await query(`INSERT INTO serve.synthesis_check_inheritance
      (attempt_id,run_id,answer_id,answer_version,inherited_result_id) VALUES($1,$2,$3,1,$4)`,
      [loser.attemptId,run.runId,run.answerId,earlierId]);
    expect((await query(`SELECT count(*)::int AS n FROM serve.synthesis_check_inheritance
      WHERE attempt_id=$1`, [loser.attemptId])).rows[0].n).toBe(1);
  });

  it("take answers true once and false after; an expired notice is neither taken nor existing and the purge deletes it; the runtime cannot SELECT the notice table (42501)", async () => {
    const ownerRef = randomUUID(), userId = randomUUID();
    await query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,owner_ref,state,adult_affirmed_at)
      VALUES ($1,$2,$3::jsonb,'fixture-password-hash',$4,$5,'active',clock_timestamp())`,
      [userId,randomBytes(32),JSON.stringify({ ciphertext: true, v: 1 }),`notice-${userId}`,ownerRef]);
    await query("INSERT INTO serve.synthesis_check_removal_notice(owner_ref) VALUES($1)", [ownerRef]);
    expect((await query("SELECT serve.take_synthesis_check_removal_notice($1) AS notice", [ownerRef])).rows[0].notice).toBe(true);
    expect((await query("SELECT serve.take_synthesis_check_removal_notice($1) AS notice", [ownerRef])).rows[0].notice).toBe(false);
    await query(`INSERT INTO serve.synthesis_check_removal_notice(owner_ref,removed_at)
      VALUES($1,clock_timestamp()-interval '90 days 1 second')`, [ownerRef]);
    expect((await query("SELECT serve.synthesis_check_removal_notice_exists($1) AS notice", [ownerRef])).rows[0].notice).toBe(false);
    expect((await query("SELECT serve.take_synthesis_check_removal_notice($1) AS notice", [ownerRef])).rows[0].notice).toBe(false);
    expect((await query("SELECT serve.purge_expired_synthesis_check_removal_notices() AS n")).rows[0].n).toBeGreaterThanOrEqual(1);
    await expect(withRuntime((client) => client.query("SELECT * FROM serve.synthesis_check_removal_notice"))).rejects.toMatchObject({ code: "42501" });
  });

  it("deleting the account's identity.user row deletes its notice and its binding", async () => {
    const run = await seedRun(), ownerRef = randomUUID(), userId = randomUUID();
    await query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,owner_ref,state,adult_affirmed_at)
      VALUES ($1,$2,$3::jsonb,'fixture-password-hash',$4,$5,'active',clock_timestamp())`,
      [userId,randomBytes(32),JSON.stringify({ ciphertext: true, v: 1 }),`cascade-${userId}`,ownerRef]);
    await query("INSERT INTO serve.synthesis_check_removal_notice(owner_ref) VALUES($1)", [ownerRef]);
    await query(`INSERT INTO identity.synthesis_check_erasure_binding
      (request_ref,run_id,owner_ref,audit_id,audit_actor_ref,audit_target_ref,created_at)
      VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())`,
      [randomUUID(),run.runId,ownerRef,randomUUID(),randomUUID(),randomUUID()]);
    await query('DELETE FROM identity."user" WHERE user_id=$1', [userId]);
    expect((await query("SELECT count(*)::int n FROM serve.synthesis_check_removal_notice WHERE owner_ref=$1", [ownerRef])).rows[0].n).toBe(0);
    expect((await query("SELECT count(*)::int n FROM identity.synthesis_check_erasure_binding WHERE owner_ref=$1", [ownerRef])).rows[0].n).toBe(0);
  });
});
