import { randomBytes, randomUUID } from "node:crypto";
import { Pool as PgPool } from "pg";
import { ContentCipher, type PreparedRunContentCipher, type RunContentKeyStore } from "@debateai/crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, withRunContentLease } from "@debateai/db";
import { assertAccountErasureDatabaseRole } from "../../packages/db/src/account-erasure.js";
import {
  PostgresSynthesisCheckErasureRepository, SynthesisCheckErasureCoordinator
} from "../../packages/db/src/synthesis-check-erasure.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let erasurePool: PgPool;
let erasureRole: string;
let repository: PostgresSynthesisCheckErasureRepository;
const query = (sql: string, args: unknown[] = []) => database.pool.query(sql,args);
type Fixture = Readonly<{ runId: string; ownerRef: string; userId: string; requestId: string; resultId: string; keys: RunContentKeyStore }>;

async function account(): Promise<{ userId: string; ownerRef: string }> {
  const userId = randomUUID(), ownerRef = randomUUID();
  await query(`INSERT INTO identity."user"
    (user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,owner_ref,state,adult_affirmed_at)
    VALUES ($1,$2,'{}'::jsonb,'fixture-password-hash',$3,$4,'active',clock_timestamp())`,
    [userId,randomBytes(32),`synthesis-erasure-${userId}`,ownerRef]);
  return { userId,ownerRef };
}

async function fixture(encrypted = true): Promise<Fixture> {
  const { userId,ownerRef } = await account();
  const runId=randomUUID(), answerId=randomUUID(), workId=randomUUID(), bundleId=randomUUID();
  const requestId=randomUUID(),attemptId=randomUUID(),resultId=randomUUID();
  const keys=keyStore(new Map([[runId,ownerRef]]));
  const cipher: PreparedRunContentCipher | null = encrypted
    ? await new ContentCipher(keys).prepareRun(runId) : null;
  if (encrypted && cipher !== null) {
    const sessionId=randomUUID(),executionRef=randomUUID();
    await query(`INSERT INTO identity.session
      (session_id,user_id,token_hash,csrf_token_hash,last_mfa_at,idle_expires_at,absolute_expires_at)
      VALUES($1,$2,$3,$4,clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 day')`,
      [sessionId,userId,`sha256:${randomBytes(32).toString("hex")}`,
        `sha256:${randomBytes(32).toString("hex")}`]);
    await query(`INSERT INTO identity.run_execution_binding
      (execution_ref,user_id,identity_session_id,run_id,created_at)
      VALUES($1,$2,$3,$4,clock_timestamp())`,[executionRef,userId,sessionId,runId]);
    await query(`INSERT INTO core.run_key_provision_intent
      (run_id,user_id,owner_ref,identity_session_id,execution_ref,requested_at,expires_at)
      VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 hour')`,
      [runId,userId,ownerRef,sessionId,executionRef]);
    const envelope=cipher.encrypt("core.run",runId,{ question_line:"Question?",ask_contract:{} });
    const attestation=cipher.attestEnvelope("core.run",runId,"content_ciphertext",envelope);
    const client=await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at)
        VALUES($1,$2,clock_timestamp())`,[runId,cipher.databaseAttestationSecret()]);
      await client.query(`INSERT INTO core.run (run_id,question_line,asker_id,session_id,caller_scope,as_of,
        asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,depth_params,
        agent_count,discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,
        created_at_seq,ask_contract,content_encryption_version,content_ciphertext,content_attestation)
        VALUES ($1,'⟦DEBATEAI:CIPHERTEXT:V1⟧',$2,$3,'ASKER',clock_timestamp(),'casual','casual',
          'ASKER','test','low','{}'::jsonb,1,'[{}]'::jsonb,0,'{}'::jsonb,1,'test',
          ledger.allocate_sequence(),'{"ciphertext":true,"v":1}'::jsonb,1,$4::jsonb,$5)`,
        [runId,`owner:${ownerRef}`,executionRef,JSON.stringify(envelope),attestation]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  } else {
    await query(`INSERT INTO core.run (run_id,question_line,asker_id,session_id,caller_scope,as_of,
      asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,depth_params,
      agent_count,discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,created_at_seq)
      VALUES ($1,'Question?','test-asker','test-session','ASKER',clock_timestamp(),'casual','casual',
        'ASKER','test','low','{}'::jsonb,1,'[{}]'::jsonb,0,'{}'::jsonb,1,'test',ledger.allocate_sequence())`,
      [runId]);
  }
  await query("SELECT core.append_run_ownership_event($1,$2)",[runId,ownerRef]);
  await query(`INSERT INTO core.work_item (work_item_id,run_id,battery_row_id,node_set,command_key,state,created_at_seq)
    VALUES ($1,$2,'seed','[]'::jsonb,$3,'READY',ledger.allocate_sequence())`, [workId,runId,randomUUID()]);
  const bundleEnvelope=cipher?.encrypt("serve.fact_bundle",bundleId,{ facts:[],residual_objections:[] });
  const bundleAttestation=bundleEnvelope === undefined ? null
    : cipher!.attestEnvelope("serve.fact_bundle",bundleId,"content_ciphertext",bundleEnvelope);
  await query(`INSERT INTO serve.fact_bundle
    (fact_bundle_id,run_id,facts,residual_objections,content_hash,version,content_ciphertext,content_attestation)
    VALUES ($1,$2,'[]'::jsonb,'[]'::jsonb,'seed',1,$3::jsonb,$4)`,
    [bundleId,runId,bundleEnvelope === undefined ? null : JSON.stringify(bundleEnvelope),bundleAttestation]);
  const answerEnvelope=cipher?.encrypt("serve.answer",`${answerId}:1`,{ answer_form:{},condition_marks:[] });
  const answerAttestation=answerEnvelope === undefined ? null
    : cipher!.attestEnvelope("serve.answer",`${answerId}:1`,"content_ciphertext",answerEnvelope);
  await query(`INSERT INTO serve.answer (answer_id,answer_version,run_id,work_item_id,terminal,serve_state,
    verdict_state,answer_form,condition_marks,fact_bundle_id,sealed_at_seq,content_ciphertext,content_attestation)
    VALUES ($1,1,$2,$3,'SERVED','COMPOSED','CONTESTED',$5::jsonb,'[]'::jsonb,$4,
      ledger.allocate_sequence(),$6::jsonb,$7)`,
    [answerId,runId,workId,bundleId,
      encrypted ? '{"ciphertext":true,"v":1}' : '{}',
      answerEnvelope === undefined ? null : JSON.stringify(answerEnvelope),answerAttestation]);
  await query(`INSERT INTO serve.synthesis_check_attempt
    (attempt_id,run_id,answer_id,answer_version,origin) VALUES ($1,$2,$3,1,'PUBLISH')`,
    [attemptId,runId,answerId]);
  const resultEnvelope=cipher?.encrypt("serve.synthesis_check_result",resultId,
    { verdict:"FLAGGED",categories:["SUICIDE_OR_HARM_TO_OTHERS"] });
  const resultAttestation=resultEnvelope === undefined ? null
    : cipher!.attestEnvelope("serve.synthesis_check_result",resultId,"content_ciphertext",resultEnvelope);
  await query(`INSERT INTO serve.synthesis_check_result
    (result_id,attempt_id,run_id,answer_id,answer_version,synthesis_origin_version,final,
      policy_version,content,content_ciphertext,content_attestation) VALUES ($1,$2,$3,$4,1,1,true,
      'synthesis.content-check.v1@0123456789abcdef',$5::jsonb,$6::jsonb,$7)`,
    [resultId,attemptId,runId,answerId,
      encrypted ? '{"ciphertext":true,"v":1}' : '{"verdict":"FLAGGED","categories":["SUICIDE_OR_HARM_TO_OTHERS"]}',
      resultEnvelope === undefined ? null : JSON.stringify(resultEnvelope),resultAttestation]);
  await query("INSERT INTO serve.synthesis_check_removal_request(request_id,result_id,run_id) VALUES($1,$2,$3)",
    [requestId,resultId,runId]);
  await query("INSERT INTO serve.synthesis_check_removal_notice(owner_ref) VALUES($1)",[ownerRef]);
  cipher?.close();
  return { runId,ownerRef,userId,requestId,resultId,keys };
}

function keyStore(owners: Map<string,string>): RunContentKeyStore {
  const records=new Map([...owners].map(([runId,ownerRef]) =>
    [runId,{ ownerRef,key:randomBytes(32) }] as const));
  return {
    async store() { throw new Error("fixture store is not used"); },
    async load(runId) {
      const record=records.get(runId);
      if (record === undefined) throw new Error("fixture run key is absent");
      return { runId,ownerRef:record.ownerRef,key:Buffer.from(record.key) };
    },
    async exists(runId) { return records.has(runId); },
    async ownerRef(runId) { return records.get(runId)?.ownerRef ?? ""; },
    async listByOwner(ownerRef) { return [...records].filter(([,record]) => record.ownerRef===ownerRef).map(([id]) => id); },
    async destroy(runId) {
      const record=records.get(runId),existed=records.delete(runId);
      record?.key.fill(0);
      return existed ? "DESTROYED" : "ALREADY_ABSENT";
    }
  };
}

async function namedRowCounts(row: Pick<Fixture,"runId"|"ownerRef"|"userId">): Promise<Map<string,number>> {
  const columns = (await database.pool.query<{ table_schema: string; table_name: string; column_name: string }>(`
    SELECT c.table_schema,c.table_name,c.column_name FROM information_schema.columns AS c
    JOIN information_schema.tables AS t USING (table_schema,table_name)
    WHERE t.table_type='BASE TABLE' AND c.table_schema IN ('core','serve','identity','ledger','billing')
      AND c.column_name IN ('run_id','owner_ref','user_id')
    ORDER BY c.table_schema,c.table_name,c.column_name`)).rows;
  const counts = new Map<string,number>();
  for (const column of columns) {
    const id = column.column_name === "run_id" ? row.runId
      : column.column_name === "owner_ref" ? row.ownerRef : row.userId;
    const key = `${column.table_schema}.${column.table_name}.${column.column_name}`;
    const result = await query(`SELECT count(*)::integer AS n FROM "${column.table_schema}"."${column.table_name}"
      WHERE "${column.column_name}"=$1`, [id]);
    counts.set(key, Number(result.rows[0]?.n ?? 0));
  }
  return counts;
}

beforeAll(async () => {
  database=await startTestDatabase();
  await migrate(database.pool);
  erasureRole=`synthesis_erasure_${randomBytes(5).toString("hex")}`;
  await query(`CREATE ROLE ${erasureRole} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'synthesis-test-only'; GRANT debateai_erasure_runtime TO ${erasureRole}`);
  const url=new URL(database.connectionString);
  url.username=erasureRole;
  url.password="synthesis-test-only";
  erasurePool=new PgPool({ connectionString:url.toString(),max:2 });
  repository=new PostgresSynthesisCheckErasureRepository(erasurePool);
},600_000);
afterAll(async () => {
  await erasurePool?.end();
  if (erasureRole) await query(`DROP ROLE ${erasureRole}`);
  await database?.stop();
});

describe("synthesis check system erasure over an isolated PostgreSQL database", () => {
  it("lists every run and account reference table after system deletion and leaves only declared additions", async () => {
    const row = await fixture();
    const before = await namedRowCounts(row);
    expect(await new SynthesisCheckErasureCoordinator(repository,row.keys).reconcile())
      .toContainEqual({ runId: row.runId, outcome: "CLEANED" });
    const after = await namedRowCounts(row);
    expect([...after.keys()]).toEqual([...before.keys()]);
    const added = [...after].filter(([key,count]) => count > (before.get(key) ?? 0))
      .map(([key]) => key).sort();
    expect(added).toEqual([
      "identity.synthesis_check_erasure_binding.owner_ref",
      "identity.synthesis_check_erasure_binding.run_id",
      "serve.private_run_erasure_tombstone.run_id"
    ]);
    expect(await row.keys.exists(row.runId)).toBe(false);
  });
  it("prepare turns a removal request into the four synthesis_check_erasure_* tombstone rows, the private cleanup intent and the binding, deletes the attestation secret and the request, leaves the one notice insertResult wrote, and every content lease of the run then refuses PRIVATE_CONTENT_ERASED", async () => {
    const row=await fixture();
    const prepared=await repository.prepareRequested(100);
    const erasureId=prepared.find((entry) => entry.outcome==="PREPARED")?.erasureId;
    expect(erasureId).toBeTruthy();
    const kinds=(await query(`SELECT ref_kind FROM core.publication_ref_tombstone
      WHERE ref IN (SELECT request_ref FROM identity.synthesis_check_erasure_binding WHERE run_id=$1)
        OR ref IN (SELECT audit_id FROM identity.synthesis_check_erasure_binding WHERE run_id=$1)
        OR ref IN (SELECT audit_actor_ref FROM identity.synthesis_check_erasure_binding WHERE run_id=$1)
        OR ref IN (SELECT audit_target_ref FROM identity.synthesis_check_erasure_binding WHERE run_id=$1)`,[row.runId])).rows.map((item) => item.ref_kind);
    expect(kinds.sort()).toEqual([
      "synthesis_check_erasure_request","synthesis_check_erasure_audit_id",
      "synthesis_check_erasure_audit_actor","synthesis_check_erasure_audit_target"
    ].sort());
    expect((await query("SELECT count(*)::int n FROM serve.private_run_key_cleanup_intent WHERE request_ref=$1",[erasureId])).rows[0].n).toBe(1);
    expect((await query("SELECT count(*)::int n FROM core.run_content_attestation_secret WHERE run_id=$1",[row.runId])).rows[0].n).toBe(0);
    expect((await query("SELECT count(*)::int n FROM serve.synthesis_check_removal_request WHERE run_id=$1",[row.runId])).rows[0].n).toBe(0);
    expect((await query("SELECT count(*)::int n FROM serve.synthesis_check_removal_notice WHERE owner_ref=$1",[row.ownerRef])).rows[0].n).toBe(1);
    expect((await query("SELECT core.run_private_content_is_live($1) AS live",[row.runId])).rows[0].live).toBe(false);
    await expect(withRunContentLease(database.pool,[row.runId],async () => true))
      .rejects.toMatchObject({ code:"PRIVATE_CONTENT_ERASED" });
  });

  it("the coordinator destroys the run key and finalizes: a tombstone, no intent, the binding consumed, and exactly one audit event debate.system.erased whose justification is RUN_KEY_DURABLY_DESTROYED and which names no category", async () => {
    const row=await fixture();
    const keys=row.keys;
    // R22 item 16: the V4 page memory (0130) of the removed debate goes in the finalize transaction too, and only its.
    const elsewhere=[randomUUID(),randomUUID()];
    await query(`INSERT INTO identity.debate_last_visit(owner_ref,run_id,items) VALUES ($1,$2,'{"point:n-1":"SURE"}'),($1,$3,'{}')`,
      [row.ownerRef,row.runId,elsewhere[0]]);
    await query(`INSERT INTO identity.dig_link(child_run_id,owner_ref,parent_run_id,places,mode)
      VALUES ($2,$1,$3,'{}','quick'),($3,$1,$4,'{}','quick'),($5,$1,$2,'{}','thorough')`,
      [row.ownerRef,randomUUID(),row.runId,elsewhere[1],elsewhere[0]]);
    const outcomes=await new SynthesisCheckErasureCoordinator(repository,keys).reconcile();
    expect(outcomes).toContainEqual({ runId: row.runId, outcome: "CLEANED" });
    expect((await query("SELECT count(*)::int n FROM identity.debate_last_visit WHERE owner_ref=$1 AND run_id=$2",[row.ownerRef,row.runId])).rows[0].n).toBe(0);
    expect((await query("SELECT count(*)::int n FROM identity.dig_link WHERE parent_run_id=$1 OR child_run_id=$1",[row.runId])).rows[0].n).toBe(0);
    expect((await query("SELECT count(*)::int n FROM identity.debate_last_visit WHERE owner_ref=$1",[row.ownerRef])).rows[0].n).toBe(1);
    expect((await query("SELECT count(*)::int n FROM identity.dig_link WHERE owner_ref=$1",[row.ownerRef])).rows[0].n).toBe(1);
    expect(await keys.exists(row.runId)).toBe(false);
    expect((await query("SELECT count(*)::int n FROM serve.private_run_erasure_tombstone WHERE run_id=$1",[row.runId])).rows[0].n).toBe(1);
    expect((await query("SELECT count(*)::int n FROM serve.private_run_key_cleanup_intent WHERE run_id=$1",[row.runId])).rows[0].n).toBe(0);
    const binding=(await query("SELECT audit_id,consumed_at FROM identity.synthesis_check_erasure_binding WHERE run_id=$1",[row.runId])).rows[0];
    expect(binding.consumed_at).not.toBeNull();
    const audit=(await query("SELECT event_type,justification,source_context FROM identity.audit_event WHERE audit_id=$1",[binding.audit_id])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].event_type).toBe("debate.system.erased");
    expect(audit[0].justification).toBe("RUN_KEY_DURABLY_DESTROYED");
    expect(JSON.stringify(audit[0])).not.toContain("SUICIDE_OR_HARM_TO_OTHERS");
  });

  it("a PUBLISHED run's request answers PUBLISHED, writes nothing and stays, and reconcile logs exactly one line [SYNTHESIS_CHECK_ERASURE_WAITING] PUBLISHED that names no run, answer or owner", async () => {
    const row=await fixture(),log=vi.fn(),publicationRef=randomUUID();
    await query(`INSERT INTO serve.publication_snapshot
      (publication_ref,run_id,format_version,content_ciphertext,created_at)
      VALUES ($1,$2,1,$3::jsonb,clock_timestamp())`,
      [publicationRef,row.runId,JSON.stringify({
        v:1,keyId:`publication-snapshot:${publicationRef}:v1`,nonce:"fixture",ct:"fixture",tag:"fixture"
      })]);
    const session=(await query("SELECT identity_session_id FROM identity.run_execution_binding WHERE run_id=$1",[row.runId])).rows[0].identity_session_id;
    const visibilityEventId=randomUUID(),visibilityActorRef=randomUUID();
    await query(`INSERT INTO identity.publication_event_binding
      (user_id,session_id,run_id,action,grant_id,grant_token_hash,visibility_event_id,
        visibility_actor_ref,audit_id,audit_actor_ref,audit_target_ref,
        denied_audit_id,denied_audit_actor_ref,denied_audit_target_ref,created_at,expires_at)
      VALUES ($1,$2,$3,'PUBLISH',$4,'fixture-token',$5,$6,$7,$8,$9,$10,$11,$12,
        clock_timestamp(),clock_timestamp()+interval '1 hour')`,
      [row.userId,session,row.runId,randomUUID(),visibilityEventId,visibilityActorRef,
        randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID()]);
    await query(`INSERT INTO core.run_visibility_event
      (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
        warning_version,occurred_at,at_seq,actor_ref_version)
      VALUES ($1,$2,$3,'PUBLISHED',$4,'PUBLIC_INDEXED_V1',clock_timestamp(),ledger.allocate_sequence(),2)`,
      [visibilityEventId,row.runId,publicationRef,visibilityActorRef]);
    expect(await repository.prepareRequested(100)).toContainEqual({
      outcome:"PUBLISHED",erasureId:null,runId:row.runId
    });
    expect(await new SynthesisCheckErasureCoordinator(repository,row.keys,undefined,log).reconcile())
      .toContainEqual({ outcome:"PUBLISHED",runId:row.runId });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[SYNTHESIS_CHECK_ERASURE_WAITING] PUBLISHED");
    expect((await query("SELECT count(*)::int n FROM serve.synthesis_check_removal_request WHERE run_id=$1",[row.runId])).rows[0].n).toBe(1);
    expect((await query("SELECT count(*)::int n FROM identity.synthesis_check_erasure_binding WHERE run_id=$1",[row.runId])).rows[0].n).toBe(0);
    expect((await query("SELECT count(*)::int n FROM serve.private_run_key_cleanup_intent WHERE run_id=$1",[row.runId])).rows[0].n).toBe(0);
    expect((await query("SELECT count(*)::int n FROM core.run_content_attestation_secret WHERE run_id=$1",[row.runId])).rows[0].n).toBe(1);
    // A waiting request is the assertion above; remove this fixture before the later waiting cases run.
    await query("DELETE FROM serve.synthesis_check_removal_request WHERE run_id=$1",[row.runId]);
  });

  it("a legacy plaintext run's request answers LEGACY_PLAINTEXT_RETAINED and stays, and reconcile logs one line [SYNTHESIS_CHECK_ERASURE_WAITING] LEGACY_PLAINTEXT_RETAINED", async () => {
    const row=await fixture(false),log=vi.fn();
    const results=await new SynthesisCheckErasureCoordinator(repository,keyStore(new Map()),undefined,log).reconcile();
    expect(results).toContainEqual({ outcome:"LEGACY_PLAINTEXT_RETAINED",runId:row.runId });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[SYNTHESIS_CHECK_ERASURE_WAITING] LEGACY_PLAINTEXT_RETAINED");
    expect((await query("SELECT count(*)::int n FROM serve.synthesis_check_removal_request WHERE run_id=$1",[row.runId])).rows[0].n).toBe(1);
    await query("DELETE FROM serve.synthesis_check_removal_request WHERE run_id=$1",[row.runId]);
  });

  it("a run already erased by its owner, or an account closed, deletes the request and writes nothing else", async () => {
    const erased=await fixture(),closed=await fixture();
    await query(`INSERT INTO serve.private_run_erasure_tombstone
      (run_id,completed_at,destroyed_key_count,already_absent_key_count)
      VALUES ($1,clock_timestamp(),1,0)`,[erased.runId]);
    await query('DELETE FROM identity."user" WHERE user_id=$1',[closed.userId]);
    const outcomes=await repository.prepareRequested(100);
    expect(outcomes.map((entry) => entry.outcome)).toEqual(expect.arrayContaining(["ERASED","ACCOUNT_CLOSED"]));
    for (const row of [erased,closed]) {
      expect((await query("SELECT count(*)::int n FROM serve.synthesis_check_removal_request WHERE run_id=$1",[row.runId])).rows[0].n).toBe(0);
      expect((await query("SELECT count(*)::int n FROM identity.synthesis_check_erasure_binding WHERE run_id=$1",[row.runId])).rows[0].n).toBe(0);
    }
  });

  it("the runtime role cannot execute the three erasure functions (42501), and assertAccountErasureDatabaseRole passes with the new list", async () => {
    const client=await database.pool.connect();
    try {
      for (const sql of [
        "SELECT * FROM core.prepare_synthesis_check_erasures(1)",
        "SELECT * FROM core.pending_synthesis_check_erasure_cleanup(1)",
        "SELECT core.finalize_synthesis_check_erasure($1,clock_timestamp(),clock_timestamp(),0,1)"
      ]) {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE debateai_runtime");
        await expect(client.query(sql,sql.includes("$1") ? [randomUUID()] : [])).rejects.toMatchObject({ code:"42501" });
        await client.query("ROLLBACK");
      }
    } finally { await client.query("ROLLBACK").catch(() => undefined); client.release(); }
    const suffix=randomBytes(5).toString("hex");
    const runtime=`synthesis_runtime_${suffix}`,erasure=`synthesis_erasure_${suffix}`;
    const password="synthesis-test-only";
    await query(`CREATE ROLE ${runtime} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
      CREATE ROLE ${erasure} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
      GRANT debateai_runtime TO ${runtime}; GRANT debateai_erasure_runtime TO ${erasure}`);
    const urlFor=(user:string) => { const url=new URL(database.connectionString); url.username=user; url.password=password; return url.toString(); };
    const runtimePool=new PgPool({ connectionString:urlFor(runtime),max:1 });
    const erasurePool=new PgPool({ connectionString:urlFor(erasure),max:1 });
    try { await expect(assertAccountErasureDatabaseRole(runtimePool,erasurePool)).resolves.toBeUndefined(); }
    finally { await runtimePool.end(); await erasurePool.end(); await query(`DROP ROLE ${runtime}; DROP ROLE ${erasure}`); }
  });

  it("a run key store whose destroy throws once leaves the intent pending, and the next reconcile commits", async () => {
    const row=await fixture();
    let failed=false;
    const keys:RunContentKeyStore={ ...row.keys,
      async destroy(runId) {
        if (!failed) { failed=true; throw new Error("transient key-store failure"); }
        return row.keys.destroy(runId);
      }
    };
    expect(await new SynthesisCheckErasureCoordinator(repository,keys).reconcile())
      .toContainEqual(expect.objectContaining({ outcome:"INVALID_EVIDENCE" }));
    expect((await query("SELECT count(*)::int n FROM serve.private_run_key_cleanup_intent WHERE run_id=$1",[row.runId])).rows[0].n).toBe(1);
    expect(await new SynthesisCheckErasureCoordinator(repository,keys).reconcile())
      .toContainEqual(expect.objectContaining({ outcome:"CLEANED" }));
  });

  it("an intent the PrivateRunErasureCoordinator reaches first: it destroys the key and answers NOT_FOUND, the intent stays, and the next system reconcile commits with RUN_KEY_DURABLY_CONFIRMED_ABSENT and one audit event", async () => {
    const row=await fixture(),keys=row.keys;
    const prepared=await repository.prepareRequested(100);
    const id=prepared.find((entry) => entry.outcome==="PREPARED")?.erasureId;
    expect(id).toBeTruthy();
    expect(await keys.destroy(row.runId)).toBe("DESTROYED");
    expect((await query("SELECT core.finalize_private_run_erasure($1,clock_timestamp(),clock_timestamp(),0,1) AS outcome",[id])).rows[0].outcome).toBe("NOT_FOUND");
    expect((await query("SELECT count(*)::int n FROM serve.private_run_key_cleanup_intent WHERE request_ref=$1",[id])).rows[0].n).toBe(1);
    await new SynthesisCheckErasureCoordinator(repository,keys).reconcile();
    const binding=(await query("SELECT audit_id FROM identity.synthesis_check_erasure_binding WHERE request_ref=$1",[id])).rows[0];
    const audit=(await query("SELECT justification FROM identity.audit_event WHERE audit_id=$1",[binding.audit_id])).rows;
    expect(audit).toEqual([{ justification:"RUN_KEY_DURABLY_CONFIRMED_ABSENT" }]);
  });

  it("a run whose ownership moved (a second core.run_ownership_event to another active account) answers OWNERSHIP_MOVED, writes nothing, keeps the request, and reconcile logs one line [SYNTHESIS_CHECK_ERASURE_WAITING] OWNERSHIP_MOVED", async () => {
    const row=await fixture(false),next=await account(),log=vi.fn();
    await query("SELECT core.append_run_ownership_event($1,$2)",[row.runId,next.ownerRef]);
    const outcomes=await new SynthesisCheckErasureCoordinator(repository,keyStore(new Map()),undefined,log).reconcile();
    expect(outcomes).toContainEqual({ outcome:"OWNERSHIP_MOVED",runId:row.runId });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[SYNTHESIS_CHECK_ERASURE_WAITING] OWNERSHIP_MOVED");
    expect((await query("SELECT count(*)::int n FROM serve.synthesis_check_removal_request WHERE run_id=$1",[row.runId])).rows[0].n).toBe(1);
    expect((await query("SELECT count(*)::int n FROM identity.synthesis_check_erasure_binding WHERE run_id=$1",[row.runId])).rows[0].n).toBe(0);
    await query("DELETE FROM serve.synthesis_check_removal_request WHERE run_id=$1",[row.runId]);
  });
});
