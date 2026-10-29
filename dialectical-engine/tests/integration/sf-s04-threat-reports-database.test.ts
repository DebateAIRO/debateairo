import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import * as budget from "../../packages/budget/src/index.js";
import * as db from "../../packages/db/src/index.js";
import { encrypt } from "@debateai/crypto";
import { SUPPORT_RELAY_PROVIDER_REF } from "../../apps/api/src/support/model.js";
import { createQuestionCheckTransport } from "../../apps/api/src/question-check/transport.js";
import { threatReportEmailReader } from "../../apps/api/src/staff/threat-reports.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

async function asRole<T extends Record<string, unknown> = Record<string, unknown>>(
  role: string, statement: string, values: unknown[] = []
): Promise<T[]> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    const rows = (await client.query<T>(statement, values)).rows;
    await client.query("COMMIT");
    return rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function actor(capabilities: string[], owner = false) {
  const userId = randomUUID(), sessionId = randomUUID(), staffId = randomUUID();
  const privilegeSessionId = randomUUID(), tokenHash = hash(sessionId);
  await database.pool.query(`INSERT INTO identity."user"
    (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`,
    [userId, createHash("sha256").update(userId).digest(), userId]);
  await database.pool.query(`INSERT INTO identity.session
    (session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
    VALUES ($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`,
    [sessionId, userId, tokenHash, hash(`csrf:${sessionId}`)]);
  await database.pool.query(`INSERT INTO identity.mfa_factor
    (mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
    VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [randomUUID(),userId]);
  await database.pool.query(`INSERT INTO identity.channel_binding
    (user_id,channel_type,address_ciphertext,state,created_at,verified_at)
    VALUES($1,'email','{}','verified',now(),now())`, [userId]);
  await database.pool.query(`INSERT INTO staff.subject(staff_id,user_id,state,capabilities)
    VALUES($1,$2,'ACTIVE',$3)`, [staffId,userId,capabilities]);
  if (owner) await database.pool.query("INSERT INTO staff.owner_designation(staff_id) VALUES($1)", [staffId]);
  await database.pool.query(`INSERT INTO staff.privilege_session
    (privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,
     security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '8 hours')`,
    [privilegeSessionId,staffId,userId,sessionId,hash(`priv:${privilegeSessionId}`),hash(`csrf:priv:${privilegeSessionId}`)]);
  const context = { staffId,userId,ordinarySessionId:sessionId,privilegeSessionId,
    designation:owner ? "OWNER" : "DELEGATED",securityEpoch:0,accountSecurityEpoch:0,
    grantRevision:0,capabilities };
  return { userId,sessionId,staffId,tokenHash,context };
}

async function proof(holder: Awaited<ReturnType<typeof actor>>, action: string, targetId: string) {
  const proofId = randomUUID(), operationId = randomUUID();
  const binding = { action,targetId,expectedRevision:0,operationId,bodySha256:createHash("sha256").update(operationId).digest("hex") };
  await database.pool.query(`INSERT INTO staff.action_proof
    (proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,
     account_security_epoch,grant_revision,binding,credential_id,expires_at)
    VALUES($1,$2,$3,$4,$5,0,0,0,$6,'fixture-verified-key',now()+interval '5 minutes')`,
    [proofId,holder.staffId,holder.userId,holder.context.ordinarySessionId,
      holder.context.privilegeSessionId,binding]);
  return { proofId,binding };
}

async function keep(question: string, account: string | null = null): Promise<string> {
  return (await asRole<{ ref: string }>("debateai_runtime",
    "SELECT staff.keep_threat_report($1,$2) ref", [question,account]))[0]!.ref;
}

describe("0128 threat report database boundary", () => {
  it("exports a dedicated QUESTION_CHECK spend writer from the budget package", () => {
    // Property: call sites have one named writer and a boot probe for the new runless source.
    expect(budget).toHaveProperty("QUESTION_CHECK_SPEND_WRITER", "ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint)");
    expect(budget).toHaveProperty("questionCheckSpendWriterPresent", expect.any(Function));
    expect(budget).toHaveProperty("recordQuestionCheckSpend", expect.any(Function));
  });

  it("exports the threat report repository from the database package", () => {
    // Property: the API and worker use the database's named function adapter.
    expect(db).toHaveProperty("PostgresThreatReportRepository", expect.any(Function));
  });
});

describe("0128 applied database", () => {
  let owner: Awaited<ReturnType<typeof actor>>;
  let holder: Awaited<ReturnType<typeof actor>>;
  let noHolder: Awaited<ReturnType<typeof actor>>;
  beforeAll(async () => {
    database = await startTestDatabase();
    await db.migrate(database.pool);
    owner = await actor(["TEAM_READ","TEAM_INVITE","TEAM_GRANT","TEAM_DISABLE","AUDIT_READ","EMERGENCY_DISABLE","PUBLICATION_REVIEW","THREAT_REPORT"],true);
    holder = await actor(["THREAT_REPORT"]);
    noHolder = await actor(["TEAM_READ"]);
  }, 180_000);
  afterAll(async () => database?.stop());

  it("migrate runs twice through 0128 without a forward-chain drift", async () => {
    // A later slice's migration may follow 0128 in the merged chain (0129, S05); the second run must add no step.
    const steps = async () => (await database.pool.query<{ source_name: string }>(
      "SELECT source_name FROM public.debateai_schema_migration_step ORDER BY source_name"
    )).rows.map((row) => row.source_name);
    const before = await steps();
    await db.migrate(database.pool);
    expect(await steps()).toEqual(before);
    expect(before).toContain("0128_threat_reports.sql");
  }, 180_000);

  it("refuses runtime SELECT, INSERT, UPDATE and DELETE on each private table", async () => {
    for (const table of ["staff.threat_report","staff.threat_report_event","staff.threat_report_alert"]) {
      for (const verb of ["SELECT","INSERT","UPDATE","DELETE"]) {
        const allowed = (await database.pool.query<{ allowed: boolean }>(
          "SELECT has_table_privilege('debateai_runtime',$1,$2) allowed", [table,verb])).rows[0]!.allowed;
        expect(allowed, `${table}:${verb}`).toBe(false);
      }
    }
  });

  it("grants twelve staff functions to runtime and none to erasure runtime", async () => {
    for (const signature of ["keep_threat_report(text,uuid)","keep_threat_report_with_email(text,uuid,text)",
      "list_threat_reports(jsonb,text)",
      "count_unread_threat_reports(jsonb,text)","peek_threat_report_account(jsonb,text,uuid)",
      "read_threat_report(jsonb,text,uuid)","threat_report_recipient_user(uuid)",
      "decide_threat_report(jsonb,text,uuid,text,jsonb)","erase_due_threat_reports()",
      "hold_threat_report_email(uuid,text)","claim_threat_report_alerts(integer)",
      "complete_threat_report_alert(uuid,uuid,boolean)"]) {
      const rows = (await database.pool.query<{ runtime: boolean; erasure: boolean }>(
        "SELECT has_function_privilege('debateai_runtime',$1,'EXECUTE') runtime, has_function_privilege('debateai_erasure_runtime',$1,'EXECUTE') erasure",
        [`staff.${signature}`])).rows;
      expect(rows[0],signature).toEqual({runtime:true,erasure:false});
    }
  });

  it("keeps the question as UNREAD and alerts exactly the owner and invited holder", async () => {
    const ref = (await asRole<{ ref: string }>("debateai_runtime",
      "SELECT staff.keep_threat_report($1,$2) ref", ["Fixture threat question",noHolder.userId]))[0]!.ref;
    const report = (await database.pool.query("SELECT * FROM staff.threat_report WHERE report_ref=$1", [ref])).rows[0];
    expect(report).toMatchObject({report_ref:ref,question:"Fixture threat question",account_user_id:noHolder.userId,
      held_email:null,decision:"UNREAD",decided_at:null,decided_by_staff_id:null});
    expect(report.kept_at).toBeInstanceOf(Date);
    const alerts = (await database.pool.query("SELECT recipient_staff_id FROM staff.threat_report_alert ORDER BY recipient_staff_id")).rows;
    expect(alerts).toEqual([owner.staffId,holder.staffId].sort().map(recipient_staff_id => ({recipient_staff_id})));
  });

  it("stores exactly the eight named report columns", async () => {
    const rows = (await database.pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='staff' AND table_name='threat_report' ORDER BY ordinal_position"
    )).rows;
    expect(rows.map(row => row.column_name)).toEqual(["report_ref","question","account_user_id","held_email","kept_at","decision","decided_at","decided_by_staff_id"]);
  });

  it("requires THREAT_REPORT authority before list, count or read", async () => {
    for (const statement of ["SELECT * FROM staff.list_threat_reports($1::jsonb,$2)",
      "SELECT staff.count_unread_threat_reports($1::jsonb,$2)",
      "SELECT * FROM staff.read_threat_report($1::jsonb,$2,$3::uuid)"]) {
      await expect(asRole("debateai_runtime",statement,[noHolder.context,noHolder.tokenHash,randomUUID()].slice(0,
        statement.includes("staff.read_threat_report(") ? 3 : 2))).rejects.toMatchObject({ message: "STAFF_AUTHORITY_INVALID" });
    }
  });

  it("reads a report once for a different holder and refuses own or unknown records", async () => {
    const ref = await keep("Read boundary",holder.userId);
    await expect(asRole("debateai_runtime","SELECT * FROM staff.read_threat_report($1::jsonb,$2,$3::uuid)",
      [holder.context,holder.tokenHash,ref])).rejects.toMatchObject({message:"THREAT_REPORT_OWN",code:"42501"});
    await expect(asRole("debateai_runtime","SELECT * FROM staff.read_threat_report($1::jsonb,$2,$3::uuid)",
      [owner.context,owner.tokenHash,randomUUID()])).rejects.toMatchObject({message:"THREAT_REPORT_NOT_FOUND",code:"P0002"});
    const rows = await asRole<{question:string}>("debateai_runtime",
      "SELECT * FROM staff.read_threat_report($1::jsonb,$2,$3::uuid)", [owner.context,owner.tokenHash,ref]);
    expect(rows[0]?.question).toBe("Read boundary");
    expect((await database.pool.query("SELECT count(*)::int n FROM staff.threat_report_event WHERE report_ref=$1 AND action='READ'",[ref])).rows[0].n).toBe(1);
  });

  it("keeps a signed-out ask without an account and lets a holder open it once", async () => {
    // Property: the keep writer accepts the absent signed-in account and the audited holder read preserves that absence.
    // Mutant: require an account in keep_threat_report; changing alert order is a neighbour.
    const ref = await keep("Signed-out threat question", null);
    const runtime = { query: async (sql: string, values?: unknown[]) => ({ rows: await asRole("debateai_runtime", sql, values) }) };
    const repository = new db.PostgresThreatReportRepository(runtime as never);
    await expect(repository.peekAccount(holder.context, holder.tokenHash, ref)).resolves.toEqual({
      account_user_id: null, has_held_email: false
    });
    await expect(repository.read(holder.context, holder.tokenHash, ref)).resolves.toMatchObject({
      question: "Signed-out threat question", account_user_id: null, held_email: null
    });
    expect((await database.pool.query(
      "SELECT count(*)::int n FROM staff.threat_report_event WHERE report_ref=$1 AND action='READ'", [ref]
    )).rows[0].n).toBe(1);
  });

  it("checks account availability without reading the question or writing a READ event", async () => {
    // Property: the API can resolve the email before the audited question read.
    // Mutant: call the audited read during preflight; changing the decision action is a neighbour.
    const ref = await keep("Private preflight question", noHolder.userId);
    const runtime = { query: async (sql: string, values?: unknown[]) => ({ rows: await asRole("debateai_runtime", sql, values) }) };
    const repository = new db.PostgresThreatReportRepository(runtime as never);
    await expect(repository.peekAccount(owner.context, owner.tokenHash, ref)).resolves.toEqual({
      account_user_id: noHolder.userId, has_held_email: false
    });
    expect((await database.pool.query("SELECT count(*)::int n FROM staff.threat_report_event WHERE report_ref=$1 AND action='READ'", [ref])).rows[0].n).toBe(0);
    await repository.read(owner.context, owner.tokenHash, ref);
    expect((await database.pool.query("SELECT count(*)::int n FROM staff.threat_report_event WHERE report_ref=$1 AND action='READ'", [ref])).rows[0].n).toBe(1);
    const own = await keep("Private own preflight", holder.userId);
    await expect(repository.peekAccount(holder.context, holder.tokenHash, own))
      .rejects.toMatchObject({ code: "THREAT_REPORT_OWN" });
  });

  it("marks REPORTED once and refuses a second decision", async () => {
    const ref=await keep("Report decision",noHolder.userId);
    const p=await proof(holder,"THREAT_REPORT_REPORTED",ref);
    const result=await asRole<{decision:string}>("debateai_runtime",
      "SELECT staff.decide_threat_report($1::jsonb,$2,$3::uuid,$4,$5::jsonb) decision",
      [holder.context,holder.tokenHash,ref,"REPORTED",p]);
    expect(result[0]?.decision).toBe("REPORTED");
    expect((await database.pool.query("SELECT decision,decided_at,decided_by_staff_id FROM staff.threat_report WHERE report_ref=$1",[ref])).rows[0])
      .toMatchObject({decision:"REPORTED",decided_at:expect.any(Date),decided_by_staff_id:holder.staffId});
    await expect(asRole("debateai_runtime",
      "SELECT staff.decide_threat_report($1::jsonb,$2,$3::uuid,$4,$5::jsonb)",
      [holder.context,holder.tokenHash,ref,"REPORTED",p])).rejects.toMatchObject({message:"THREAT_REPORT_ALREADY_DECIDED"});
  });

  it("deletes NOT_REPORTED records and still refuses a second decision", async () => {
    const ref=await keep("Not reported decision",noHolder.userId);
    const p=await proof(holder,"THREAT_REPORT_NOT_REPORTED",ref);
    await asRole("debateai_runtime","SELECT staff.decide_threat_report($1::jsonb,$2,$3::uuid,$4,$5::jsonb)",
      [holder.context,holder.tokenHash,ref,"NOT_REPORTED",p]);
    expect((await database.pool.query("SELECT count(*)::int n FROM staff.threat_report WHERE report_ref=$1",[ref])).rows[0].n).toBe(0);
    await expect(asRole("debateai_runtime",
      "SELECT staff.decide_threat_report($1::jsonb,$2,$3::uuid,$4,$5::jsonb)",
      [holder.context,holder.tokenHash,ref,"NOT_REPORTED",p])).rejects.toMatchObject({message:"THREAT_REPORT_ALREADY_DECIDED"});
  });

  it("erases reports only after the two database retention boundaries", async () => {
    const refs=Array.from({length:4},()=>randomUUID());
    for (const [i,ref] of refs.entries()) {
      const reported=i>=2;
      await database.pool.query(`INSERT INTO staff.threat_report
        (report_ref,question,kept_at,decision,decided_at,decided_by_staff_id)
        VALUES($1,$2,clock_timestamp() - interval '30 days' + ($3::integer * interval '1 second'),
          $4,CASE WHEN $5 THEN clock_timestamp() - interval '6 months' + ($3::integer * interval '1 second') END,$6)`,
        [ref,`Retention ${i}`,i%2===0?-1:1,reported?"REPORTED":"UNREAD",reported,
          reported?holder.staffId:null]);
    }
    const erased=(await asRole<{erased:number}>("debateai_runtime","SELECT staff.erase_due_threat_reports() erased"))[0]!.erased;
    expect(erased).toBeGreaterThanOrEqual(2);
    const remaining=(await database.pool.query<{report_ref:string}>(
      "SELECT report_ref FROM staff.threat_report WHERE report_ref=ANY($1::uuid[]) ORDER BY report_ref",[refs])).rows.map(row=>row.report_ref);
    expect(remaining).toEqual([refs[1]!,refs[3]!].sort());
    for (const ref of [refs[0]!,refs[2]!]) expect((await database.pool.query(
      "SELECT question,account_user_id,held_email FROM staff.threat_report WHERE report_ref=$1",[ref])).rows).toEqual([]);
    for (const role of ["debateai_runtime","debateai_erasure_runtime","debateai_staff_recovery",
      "debateai_staff_security_owner","debateai_data_export_worker"]) {
      for (const ref of [refs[0]!,refs[2]!]) {
        try {
          expect(await asRole(role,"SELECT question,account_user_id,held_email FROM staff.threat_report WHERE report_ref=$1",[ref]))
            .toEqual([]);
        } catch (error) {
          expect(error).toMatchObject({code:"42501"});
        }
      }
    }
  });

  it("holds email only for a prepared, open account erasure", async () => {
    const ref = await keep("Prepared erasure", noHolder.userId);
    const unprepared = randomUUID();
    const prepared = randomUUID();
    await database.pool.query(`INSERT INTO identity.account_erasure_request
      (erasure_id,user_id,requested_at,execute_at) VALUES($1,$2,now(),now())`,
      [unprepared,noHolder.userId]);
    for (const erasureId of [randomUUID(),unprepared]) {
      await expect(asRole("debateai_runtime",
        "SELECT staff.hold_threat_report_email($1::uuid,$2::text)",
        [erasureId,"fixture@example.test"])).rejects.toMatchObject({message:"THREAT_REPORT_HOLD_NOT_ERASING",code:"42501"});
    }
    await database.pool.query("UPDATE identity.account_erasure_request SET cancelled_at=now() WHERE erasure_id=$1",[unprepared]);
    await expect(asRole("debateai_runtime",
      "SELECT staff.hold_threat_report_email($1::uuid,$2::text)",
      [unprepared,"fixture@example.test"])).rejects.toMatchObject({message:"THREAT_REPORT_HOLD_NOT_ERASING",code:"42501"});
    await database.pool.query(`INSERT INTO identity.account_erasure_request
      (erasure_id,user_id,requested_at,execute_at,prepared_at,prepared_run_ids,
       prepared_legacy_run_ids,prepared_published_run_ids,prepared_current_publication_refs,
       prepared_cleanup_publication_refs)
      VALUES($1,$2,now(),now(),now(),'{}','{}','{}','{}','{}')`,
      [prepared,noHolder.userId]);
    const rows = await asRole<{held:number}>("debateai_runtime",
      "SELECT staff.hold_threat_report_email($1::uuid,$2::text) held",
      [prepared,"fixture@example.test"]);
    expect(rows[0]!.held).toBeGreaterThanOrEqual(1);
    expect((await database.pool.query("SELECT account_user_id,held_email FROM staff.threat_report WHERE report_ref=$1",[ref])).rows[0])
      .toEqual({account_user_id:null,held_email:"fixture@example.test"});
    await database.pool.query("UPDATE identity.account_erasure_request SET committed_at=now() WHERE erasure_id=$1",[prepared]);
    await expect(asRole("debateai_runtime",
      "SELECT staff.hold_threat_report_email($1::uuid,$2::text)",
      [prepared,"fixture@example.test"])).rejects.toMatchObject({message:"THREAT_REPORT_HOLD_NOT_ERASING",code:"42501"});
  });

  it("retains the account email for a threat kept during prepared erasure", async () => {
    // Property: a prepared erasure needs the live email to keep the threat readable after the user key is destroyed.
    // Mutant: insert a null held_email; changing alert claim order is a neighbour.
    const asker = await actor(["TEAM_READ"]);
    const prepared = randomUUID();
    await database.pool.query(`INSERT INTO identity.account_erasure_request
      (erasure_id,user_id,requested_at,execute_at,prepared_at,prepared_run_ids,
       prepared_legacy_run_ids,prepared_published_run_ids,prepared_current_publication_refs,
       prepared_cleanup_publication_refs)
       VALUES($1,$2,now(),now(),now(),'{}','{}','{}','{}','{}')`, [prepared, asker.userId]);
    const question = `prepared-erasure-probe-${randomUUID()}`;
    await expect(keep(question, asker.userId)).rejects.toMatchObject({ message: "THREAT_REPORT_ACCOUNT_ERASING" });
    expect((await database.pool.query("SELECT count(*)::int n FROM staff.threat_report WHERE question=$1", [question])).rows[0].n).toBe(0);
    const email = "prepared-asker@example.test";
    const ref = (await asRole<{ ref: string }>("debateai_runtime",
      "SELECT staff.keep_threat_report_with_email($1::text,$2::uuid,$3::text) ref",
      [question, asker.userId, email]))[0]!.ref;
    expect((await database.pool.query("SELECT account_user_id,held_email FROM staff.threat_report WHERE report_ref=$1", [ref])).rows[0])
      .toEqual({ account_user_id: null, held_email: email });
    const runtime = { query: async (sql: string, values?: unknown[]) => ({ rows: await asRole("debateai_runtime", sql, values) }) };
    const repository = new db.PostgresThreatReportRepository(runtime as never);
    await expect(repository.peekAccount(owner.context, owner.tokenHash, ref)).resolves.toEqual({
      account_user_id: null, has_held_email: true
    });
    await expect(repository.read(owner.context, owner.tokenHash, ref)).resolves.toMatchObject({
      question, held_email: email
    });
  });

  it("places code-only threat events into the audit page", async () => {
    const ref=await keep("Audit must omit this question",noHolder.userId);
    await asRole("debateai_runtime","SELECT * FROM staff.list_threat_reports($1::jsonb,$2)",
      [holder.context,holder.tokenHash]);
    await asRole("debateai_runtime","SELECT * FROM staff.read_threat_report($1::jsonb,$2,$3::uuid)",
      [holder.context,holder.tokenHash,ref]);
    const p=await proof(holder,"THREAT_REPORT_REPORTED",ref);
    await asRole("debateai_runtime","SELECT staff.decide_threat_report($1::jsonb,$2,$3::uuid,$4,$5::jsonb)",
      [holder.context,holder.tokenHash,ref,"REPORTED",p]);
    const page=(await asRole<{value:{events:Record<string,unknown>[]}}>("debateai_runtime",
      "SELECT staff.read_audit_page($1::jsonb,$2,100,NULL,NULL) value",
      [owner.context,owner.tokenHash]))[0]!.value;
    const events=page.events.filter(row=>String(row.event).startsWith("THREAT_REPORT_"));
    expect(events.map(row=>row.event)).toEqual(expect.arrayContaining([
      "THREAT_REPORT_LIST","THREAT_REPORT_READ","THREAT_REPORT_REPORTED","THREAT_REPORT_NOT_REPORTED"]));
    for (const row of events) {
      expect(Object.keys(row).sort()).toEqual(["actor_staff_id","event","event_id","recorded_at","threat_report_ref"]);
      expect(JSON.stringify(row)).not.toMatch(/Audit must omit this question|fixture@example.test|delivery_state|reason/);
    }
  });

  it("writes QUESTION_CHECK spend through its writer and rejects direct or malformed writes", async () => {
    const spendId=randomUUID();
    const entry={spendId,providerRef:`question-check:${SUPPORT_RELAY_PROVIDER_REF}:claude-haiku-5-5`,
      chargedOn:new Date().toISOString().slice(0,10),chargeMicros:4,inputTokens:3,outputTokens:2};
    await budget.recordQuestionCheckSpend({query: (sql:string,values?:unknown[]) =>
      asRole("debateai_runtime",sql,values)} as unknown as Parameters<typeof budget.recordQuestionCheckSpend>[0],entry);
    expect((await database.pool.query("SELECT spend_source,run_id,spend_phase,attempt_id FROM ledger.model_spend WHERE spend_id=$1",[spendId])).rows[0])
      .toEqual({spend_source:"QUESTION_CHECK",run_id:null,spend_phase:null,attempt_id:null});
    await expect(asRole("debateai_runtime",`INSERT INTO ledger.model_spend
      (spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
      VALUES($1,'QUESTION_CHECK',$2,$3,4,3,2)`,
      [randomUUID(),entry.providerRef,entry.chargedOn])).rejects.toMatchObject({message:"QUESTION_CHECK_SPEND_WRITER_ONLY",code:"42501"});
    await expect(asRole("debateai_runtime",
      "SELECT ledger.record_question_check_spend($1,$2,$3,4,3,2)",
      [randomUUID(),"wrong-provider",entry.chargedOn])).rejects.toMatchObject({message:"QUESTION_CHECK_SPEND_INVALID",code:"23514"});
    await expect(asRole("debateai_runtime",
      "SELECT ledger.record_question_check_spend($1,$2,$3,NULL,3,2)",
      [randomUUID(),entry.providerRef,entry.chargedOn])).rejects.toMatchObject({message:"QUESTION_CHECK_SPEND_INVALID",code:"23514"});
    await expect(asRole("debateai_runtime",
      "SELECT ledger.record_question_check_spend($1,$2,$3,-1,3,2)",
      [randomUUID(),entry.providerRef,entry.chargedOn])).rejects.toMatchObject({message:"QUESTION_CHECK_SPEND_INVALID",code:"23514"});
    await expect(new budget.PostgresModelSpendStore(database.pool).recordSpend({
      ...entry,spendSource:"QUESTION_CHECK",runId:null
    })).rejects.toMatchObject({code:"MODEL_SPEND_QUESTION_CHECK_FUNCTION_ONLY"});
  });

  it("records spend for both provider references made by the deployed transport", async () => {
    // Property: each configured transport's provider identity is accepted by the real runtime writer.
    // Mutant: reject a colon in the provider reference; changing chargeMicros is a neighbour.
    for (const providerRef of [SUPPORT_RELAY_PROVIDER_REF, "vendor:anthropic"] as const) {
      const port = createQuestionCheckTransport({ providerRef, baseUrl: "http://127.0.0.1:1/v1",
        model: "claude-haiku-5-5", authorizationHeader: "Bearer synthetic-not-a-key" },
      { readAuthorizationHeader: () => "", deadlineMs: 1_000 });
      const spendId = randomUUID();
      await budget.recordQuestionCheckSpend({ query: (sql: string, values?: unknown[]) =>
        asRole("debateai_runtime", sql, values) } as unknown as Parameters<typeof budget.recordQuestionCheckSpend>[0], {
        spendId, providerRef: `question-check:${port.providerRef}:${port.modelId}`,
        chargedOn: new Date().toISOString().slice(0, 10), chargeMicros: 1, inputTokens: 1, outputTokens: 1
      });
      expect((await database.pool.query("SELECT provider_ref FROM ledger.model_spend WHERE spend_id=$1", [spendId])).rows)
        .toEqual([{ provider_ref: `question-check:${providerRef}:claude-haiku-5-5` }]);
    }
  });

  it("resolves an active THREAT_REPORT staff id to its user's email only while the capability remains active", async () => {
    // Property: queued staff ids resolve to the current holder's email, never to an unrelated user id.
    // Mutant: query identity.user directly by staff id; changing alert cadence is a neighbour.
    const recipient = await actor(["THREAT_REPORT"]);
    const key = Buffer.alloc(32, 7);
    const email = "active-holder@example.test";
    const aad = ["identity", "user.email_ciphertext", recipient.userId, "run:none", recipient.userId,
      `user-dek:${recipient.userId}`, "1"] as const;
    await database.pool.query('UPDATE identity."user" SET email_ciphertext=$1 WHERE user_id=$2',
      [JSON.stringify(encrypt(key, Buffer.from(email), aad)), recipient.userId]);
    // Row-level security X27: main.ts gives the reader crossAccountPool(pool, "X27"), the API's system login, whose
    // shape is the API's capability role plus the cross-account role (apps/runner/src/dev-database-principals.ts, D29).
    // That shape is built for this transaction only, so the role catalogue the last case reads gains no role.
    const system = await database.pool.connect();
    try {
      await system.query("BEGIN");
      await system.query("CREATE ROLE threat_report_x27_api_system NOLOGIN IN ROLE debateai_billing_runtime, debateai_rls_all_accounts");
      await system.query("SET LOCAL ROLE threat_report_x27_api_system");
      const reader = threatReportEmailReader(system as never, { load: async () => Buffer.from(key) } as never, "staff");
      expect(recipient.staffId).not.toBe(recipient.userId);
      await expect(reader(recipient.staffId)).resolves.toBe(email);
      await database.pool.query("UPDATE staff.subject SET capabilities=ARRAY['TEAM_READ']::text[] WHERE staff_id=$1", [recipient.staffId]);
      await expect(reader(recipient.staffId)).resolves.toBeNull();
      await database.pool.query("UPDATE staff.subject SET capabilities=ARRAY['THREAT_REPORT']::text[],state='DISABLED' WHERE staff_id=$1", [recipient.staffId]);
      await expect(reader(recipient.staffId)).resolves.toBeNull();
    } finally {
      await system.query("ROLLBACK").catch(() => undefined);
      system.release();
    }
  });

  it("backfills the active owner capability with a revision, epoch and session revoke", async () => {
    expect((await database.pool.query("SELECT staff.valid_capabilities(ARRAY['THREAT_REPORT']::text[]) valid")).rows[0].valid)
      .toBe(true);
    expect((await asRole<{allowed:boolean}>("debateai_runtime",
      "SELECT staff.authorize_action($1::jsonb,'THREAT_REPORT') allowed",[holder.context]))[0]!.allowed)
      .toBe(true);
    const client=await database.pool.connect();
    try {
      await client.query("BEGIN");
      const before=(await client.query("SELECT capabilities,grant_revision,security_epoch FROM staff.subject WHERE staff_id=$1",[owner.staffId])).rows[0];
      await client.query("UPDATE staff.subject SET capabilities=array_remove(capabilities,'THREAT_REPORT') WHERE staff_id=$1",[owner.staffId]);
      await client.query(`WITH owner AS (
        UPDATE staff.subject AS s SET capabilities=s.capabilities||ARRAY['THREAT_REPORT']::text[],
          grant_revision=s.grant_revision+1,security_epoch=s.security_epoch+1
        FROM staff.owner_designation AS d WHERE d.staff_id=s.staff_id AND d.active AND s.state='ACTIVE'
          AND NOT ('THREAT_REPORT'=ANY(s.capabilities)) RETURNING s.staff_id
      ) UPDATE staff.privilege_session SET revoked_at=clock_timestamp()
        WHERE revoked_at IS NULL AND staff_id IN (SELECT staff_id FROM owner)`);
      const after=(await client.query("SELECT capabilities,grant_revision,security_epoch FROM staff.subject WHERE staff_id=$1",[owner.staffId])).rows[0];
      expect(after.capabilities).toContain("THREAT_REPORT");
      expect(Number(after.grant_revision)).toBe(Number(before.grant_revision)+1);
      expect(Number(after.security_epoch)).toBe(Number(before.security_epoch)+1);
      expect((await client.query("SELECT revoked_at FROM staff.privilege_session WHERE staff_id=$1",[owner.staffId])).rows[0].revoked_at)
        .toBeInstanceOf(Date);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("reads export questions only for the worker holding a live lease", async () => {
    const ref=await keep("Exported question",noHolder.userId);
    const exportId=randomUUID(),worker=randomUUID();
    await database.pool.query(`INSERT INTO identity.data_export
      (export_id,user_id,session_id,locale,status,requested_at,lease_owner,lease_until)
      VALUES($1,$2,$3,'en','PREPARING',now(),$4,now()+interval '2 minutes')`,
      [exportId,noHolder.userId,noHolder.sessionId,worker]);
    const rows=await asRole<{value:{question:string;kept_at:string}[]}>("debateai_data_export_worker",
      "SELECT identity.read_data_export_threat_reports($1::uuid,$2::uuid) value",[exportId,worker]);
    expect(rows[0]!.value).toEqual(expect.arrayContaining([{question:"Exported question",kept_at:expect.any(String)}]));
    await expect(asRole("debateai_data_export_worker",
      "SELECT identity.read_data_export_threat_reports($1::uuid,$2::uuid)",
      [exportId,randomUUID()])).rejects.toMatchObject({message:"DATA_EXPORT_LEASE_INVALID"});
    await database.pool.query("UPDATE identity.data_export SET lease_until=now()-interval '1 second' WHERE export_id=$1",[exportId]);
    await expect(asRole("debateai_data_export_worker",
      "SELECT identity.read_data_export_threat_reports($1::uuid,$2::uuid)",
      [exportId,worker])).rejects.toMatchObject({message:"DATA_EXPORT_LEASE_INVALID"});
    const grants=(await database.pool.query<{rolname:string;reader:boolean;lease:boolean}>(`
      SELECT rolname,
        has_function_privilege(rolname,'identity.read_data_export_threat_reports(uuid,uuid)','EXECUTE') reader,
        has_function_privilege(rolname,'identity.data_export_lease_user(uuid,uuid)','EXECUTE') lease
      FROM pg_roles WHERE rolname LIKE 'debateai%' AND NOT rolsuper ORDER BY rolname`)).rows;
    expect(grants.filter(row=>row.reader).map(row=>row.rolname)).toEqual([
      "debateai_data_export_worker","debateai_staff_security_owner"]);
    expect(grants.filter(row=>row.lease).map(row=>row.rolname)).toEqual(["debateai_staff_security_owner"]);
    expect((await database.pool.query(`SELECT count(*)::int n FROM pg_attribute
      WHERE attrelid='identity.data_export'::regclass AND attnum>0 AND attacl IS NOT NULL`)).rows[0].n).toBe(0);
    expect((await database.pool.query("SELECT report_ref FROM staff.threat_report WHERE report_ref=$1",[ref])).rows).toHaveLength(1);
  });
});
