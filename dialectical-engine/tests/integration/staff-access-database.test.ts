import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileUserDekStore, generateDek, loadKek, destroyKek, encrypt, decrypt, type AeadAad, type AuditContextHasher } from "@debateai/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresStaffRepository, PostgresSessionRepository, type Pool } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let runtime: Pool;
const hash = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`;
const envelope = { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" };
const alertFor = (operationId:string,event:string) => ({schema:"staff-alert-v1",event,operationId,envelope});
async function account() {
  const userId=randomUUID(), sessionId=randomUUID(), factorId=randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`,[userId,createHash("sha256").update(userId).digest(),userId]);
  await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step) VALUES ($1,$2,'totp','{}','active',now(),now(),1)`,[factorId,userId]);
  await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at) VALUES ($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`,[sessionId,userId,hash(sessionId),hash('csrf'+sessionId)]);
  await database.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`,[userId]);
  const ownerRef=(await database.pool.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1',[userId])).rows[0].owner_ref as string;
  return { userId,sessionId,factorId,ownerRef };
}
async function staff(owner=false) {
  const a=await account(), staffId=randomUUID(), privilegeSessionId=randomUUID(), tokenHash=hash(privilegeSessionId);
  const capabilities=owner ? ['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE'] : ['TEAM_READ'];
  await database.pool.query(`INSERT INTO staff.subject(staff_id,user_id,state,capabilities) VALUES ($1,$2,'ACTIVE',$3)`,[staffId,a.userId,capabilities]);
  if(owner) await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE active');
  if(owner) await database.pool.query(`INSERT INTO staff.owner_designation(staff_id) VALUES ($1)`,[staffId]);
  await database.pool.query(`INSERT INTO staff.privilege_session(privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,$4,$5,0,0,0,now()+interval '15 minutes',now()+interval '8 hours')`,[privilegeSessionId,staffId,a.userId,a.sessionId,tokenHash]);
  const context={staffId,userId:a.userId,ordinarySessionId:a.sessionId,privilegeSessionId,designation:owner?'OWNER':'DELEGATED',securityEpoch:0,accountSecurityEpoch:0,grantRevision:0,capabilities};
  return {...a,staffId,tokenHash,context};
}
async function proof(actor:Awaited<ReturnType<typeof staff>>, action:string,targetId:string, expectedRevision=0) {
  const operationId=randomUUID(), proofId=randomUUID(), binding={action,targetId,expectedRevision,operationId,bodySha256:hash(operationId).slice(7)};
  await database.pool.query(`INSERT INTO staff.action_proof(proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,account_security_epoch,grant_revision,binding,credential_id,expires_at) VALUES($1,$2,$3,$4,$5,0,0,0,$6,'fixture-verified-key',now()+interval '5 minutes')`,[proofId,actor.staffId,actor.userId,actor.sessionId,actor.context.privilegeSessionId,binding]);
  return {proofId,operationId,binding};
}
async function invite(actor:Awaited<ReturnType<typeof staff>>,target:Awaited<ReturnType<typeof account>>) {
  const p=await proof(actor,'TEAM_INVITE',target.userId), tokenHash=hash(p.operationId);
  const result=await runtime.query(`SELECT staff.invite($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8,$9::jsonb,$10::jsonb) AS receipt`,[actor.context,p.proofId,p.binding,target.userId,['TEAM_READ'],p.operationId,{code:'TEAM_ONBOARDING'},tokenHash,alertFor(p.operationId,'INVITE'),{schema:'staff-invitation-delivery-v1',operationId:p.operationId,envelope}]);
  const invitationId=(await database.pool.query(`SELECT invitation_id FROM staff.invitation WHERE operation_id=$1`,[p.operationId])).rows[0].invitation_id;
  return {invitationId,tokenHash,receipt:result.rows[0].receipt};
}
async function invitationProof(invitationId:string,target:Awaited<ReturnType<typeof account>>) {
  const proofId=randomUUID();
  await database.pool.query(`INSERT INTO staff.invitation_proof(proof_id,invitation_id,user_id,ordinary_session_id,issuer_security_epoch,target_account_security_epoch,invitation_revision,credential_id,expires_at) SELECT $1,invitation_id,$2,$3,issuer_security_epoch,target_account_security_epoch,revision,'fixture-verified-key',now()+interval '5 minutes' FROM staff.invitation WHERE invitation_id=$4`,[proofId,target.userId,target.sessionId,invitationId]);
  return proofId;
}
async function passkey(a:Awaited<ReturnType<typeof account>>,credentialId:string) {
  const factorId=randomUUID();
  await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter) VALUES($4,$1,'passkey',$2,'{"format":"COSE_KEY_BASE64URL_V1","value":"YQ"}','active',now(),now(),'localhost','https://localhost',true,false,false,$3,0)`,[a.userId,credentialId,{...envelope,keyId:`passkey-label:${factorId}:v1`},factorId]);
}
async function prerequisite(a:Awaited<ReturnType<typeof account>>,purpose='KEY_PREREGISTRATION',commandId:string|null=null,nonce:string|null=null,step=2) {
  const handle=hash(randomUUID()),replacement=hash(randomUUID());
  const value=(await runtime.query('SELECT staff.step_up_prerequisite($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15) AS value',[a.userId,a.ownerRef,'fixture-password',a.factorId,step,a.sessionId,hash(a.sessionId),replacement,hash('new-csrf'+replacement),{}, {ipArgon2id:'argon2id-audit:v1:'+'0'.repeat(64),userAgentArgon2id:'argon2id-audit:v1:'+'1'.repeat(64)},handle,purpose,commandId,nonce])).rows[0].value;
  return {handle,replacement,value};
}
async function pending(operation:Promise<unknown>) {
  expect(await Promise.race([operation.then(()=>false,()=>false),new Promise<boolean>(resolve=>setTimeout(()=>resolve(true),50))])).toBe(true);
}
beforeAll(async()=>{
  database=await startTestDatabase();
  // Apply the historical chain once on this private fixture and retain exact owner/ACL witnesses.
  const files=(await readdir('migrations')).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
  const historical=files.filter(name=>name<'0085_staff_access_foundation.sql');expect(historical).toHaveLength(92);
  const client=await database.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TABLE public.debateai_schema_migration(name text PRIMARY KEY CHECK(length(btrim(name))>0),applied_at timestamptz NOT NULL)');
    for(const name of historical){const sql=await readFile('migrations/'+name,'utf8');try{await client.query(sql);}catch(error){console.error('[STAFF_MIGRATION_ORIGINAL_FAILURE]',{name,sql,error});throw error;}await client.query('INSERT INTO public.debateai_schema_migration VALUES($1,statement_timestamp())',[name]);}
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK');throw error;} finally {client.release();}
  const guardedFunctions=["identity.lock_account_t9_internal", "identity.lock_mfa_enrollment_bearer_internal", "identity.record_verification_delivery_with_audit", "identity.prepare_account_erasure", "identity.finalize_account_erasure", "core.append_run_ownership_event", "identity.audit_publication_preflight_denial", "core.transition_run_publication", "core.prepare_run_key_provision", "core.lock_run_key_provision_for_commit", "serve.prepare_publication_key_provision", "serve.abandon_publication_key_provision", "identity.create_pending_account_with_audit", "identity.consume_verification_with_audit", "identity.prepare_verification_resend_with_audit", "identity.reserve_publication_event_refs", "core.prepare_private_run_erasure", "core.resume_private_run_erasure", "core.finalize_private_run_erasure", "identity.schedule_account_erasure", "identity.cancel_current_account_erasure", "core.claim_legacy_runs"];
  const identityWitness=async()=>(await database.pool.query(`SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition_sha256 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname=ANY($1::text[]) ORDER BY signature`,[guardedFunctions])).rows;
  const before=await identityWitness();expect(before).toHaveLength(22);await migrate(database.pool);const after=await identityWitness();
  expect(after.map(({signature,owner})=>({signature,owner}))).toEqual(before.map(({signature,owner})=>({signature,owner})));
  for(let i=0;i<before.length;i++)if(!before[i]!.signature.startsWith('identity.lock_account_t9_internal('))expect(after[i]!.acl).toBe(before[i]!.acl);
  console.info('[STAFF_IDENTITY_OWNER_ACL]',JSON.stringify({before,after}));
  await database.pool.query(`CREATE ROLE staff_test_runtime LOGIN PASSWORD 'staff-test-only-password' IN ROLE debateai_runtime`);
  const url=new URL(database.connectionString);url.username='staff_test_runtime';url.password='staff-test-only-password';runtime=createPool(url.toString());
},120000);
afterAll(async()=>{await runtime?.end();await database?.stop();});
describe('persistent staff authority on disposable PostgreSQL',()=>{
  it('denies direct staff tables and receipt forgery under the actual runtime principal',async()=>{
    for(const sql of ['SELECT * FROM staff.subject',`UPDATE staff.subject SET state='DISABLED'`,'DELETE FROM staff.audit_event','TRUNCATE staff.alert_outbox',`SELECT staff.prepare_owner_command('BOOTSTRAP',gen_random_uuid(),NULL,ARRAY['a','b'],gen_random_uuid(),'${hash('nonce')}')`]) await expect(runtime.query(sql)).rejects.toMatchObject({code:'42501'});
  });
  it('reads only live persisted authority and never invitation authority',async()=>{
    const actor=await staff();
    expect((await runtime.query('SELECT staff.read_context($1,$2,$3) AS context',[actor.userId,actor.sessionId,actor.tokenHash])).rows[0].context.staffId).toBe(actor.staffId);
    await database.pool.query('UPDATE identity.session SET revoked_at=now() WHERE session_id=$1',[actor.sessionId]);
    expect((await runtime.query('SELECT staff.read_context($1,$2,$3) AS context',[actor.userId,actor.sessionId,actor.tokenHash])).rows[0].context).toBeNull();
  });
  it('binds invitation target, issuer epoch, TTL and one-use proof; acceptance issues no staff session',async()=>{
    const owner=await staff(true), target=await account(), other=await account(), inv=await invite(owner,target);
    expect((await runtime.query('SELECT staff.read_invitation_context($1,$2,$3) AS context',[other.userId,other.sessionId,inv.tokenHash])).rows[0].context).toBeNull();
    const p=await invitationProof(inv.invitationId,target), op=randomUUID();
    await expect(runtime.query('SELECT staff.accept($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[inv.invitationId,target.userId,target.sessionId,p, {operationId:op,reason:{code:'TEAM_ONBOARDING'}},alertFor(op,'ACCEPT')])).resolves.toBeDefined();
    expect((await database.pool.query('SELECT count(*)::int AS count FROM staff.privilege_session WHERE user_id=$1',[target.userId])).rows[0].count).toBe(0);
    await expect(runtime.query('SELECT staff.accept($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[inv.invitationId,target.userId,target.sessionId,p,{operationId:randomUUID(),reason:{code:'TEAM_ONBOARDING'}},{}])).rejects.toThrow('STAFF_INVITATION_INVALID');
    await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE staff_id=$1',[owner.staffId]);
  });
  it('rejects stale invitation acceptance after issuer disable or target hold',async()=>{
    const owner=await staff(true),target=await account(),inv=await invite(owner,target),p=await invitationProof(inv.invitationId,target);
    await database.pool.query('UPDATE staff.subject SET security_epoch=1 WHERE staff_id=$1',[owner.staffId]);
    await expect(runtime.query('SELECT staff.accept($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[inv.invitationId,target.userId,target.sessionId,p,{operationId:randomUUID(),reason:{code:'TEAM_ONBOARDING'}},{}])).rejects.toThrow('STAFF_INVITATION_INVALID');
    await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE staff_id=$1',[owner.staffId]);
  });
  it('refuses reserved capabilities, stale revisions and forged binding bodies',async()=>{
    const owner=await staff(true),target=await staff(),p=await proof(owner,'TEAM_GRANT',target.staffId);
    await expect(runtime.query('SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb)',[owner.context,p.proofId,p.binding,target.staffId,['ALLOWANCE_WRITE'],p.operationId,{code:'GRANT_CHANGE'},alertFor(p.operationId,'GRANT')])).rejects.toThrow('STAFF_CAPABILITIES_INVALID');
    await expect(runtime.query('SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb)',[owner.context,p.proofId,{...p.binding,bodySha256:'0'.repeat(64)},target.staffId,['TEAM_READ'],p.operationId,{code:'GRANT_CHANGE'},alertFor(p.operationId,'GRANT')])).rejects.toThrow('STAFF_PROOF_INVALID');
    await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE staff_id=$1',[owner.staffId]);
  });
  it('rolls back grant, consumed proof and audit when encrypted outbox persistence fails',async()=>{
    const owner=await staff(true),target=await staff(),p=await proof(owner,'TEAM_GRANT',target.staffId);
    await expect(runtime.query('SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb)',[owner.context,p.proofId,p.binding,target.staffId,['AUDIT_READ'],p.operationId,{code:'GRANT_CHANGE'},{plaintext:'forbidden'}])).rejects.toThrow('STAFF_ALERT_INVALID');
    expect((await database.pool.query('SELECT grant_revision FROM staff.subject WHERE staff_id=$1',[target.staffId])).rows[0].grant_revision).toBe('0');
    expect((await database.pool.query('SELECT consumed_at FROM staff.action_proof WHERE proof_id=$1',[p.proofId])).rows[0].consumed_at).toBeNull();
    expect((await database.pool.query('SELECT count(*)::int AS count FROM staff.audit_event WHERE operation_id=$1',[p.operationId])).rows[0].count).toBe(0);
    await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE staff_id=$1',[owner.staffId]);
  });
  it('linearizes grant after committed disable using a two-connection subject barrier',async()=>{
    const owner=await staff(true),target=await staff(),p=await proof(owner,'TEAM_GRANT',target.staffId),barrier=await database.pool.connect();
    await barrier.query('BEGIN');await barrier.query('SELECT identity.lock_security_subjects($1::uuid[])',[[owner.userId,target.userId]]);
    const operation=runtime.query('SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb)',[owner.context,p.proofId,p.binding,target.staffId,['TEAM_READ'],p.operationId,{code:'GRANT_CHANGE'},alertFor(p.operationId,'GRANT')]);
    const rejected=expect(operation).rejects.toThrow('STAFF_TARGET_INVALID');await pending(operation);
    const disabled=await proof(owner,'TEAM_DISABLE',target.staffId);
    await barrier.query('SELECT staff.disable($1::jsonb,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8::jsonb)',[owner.context,disabled.proofId,disabled.binding,target.staffId,'OFFBOARD',disabled.operationId,{code:'OFFBOARDING'},alertFor(disabled.operationId,'DISABLE')]);await barrier.query('COMMIT');barrier.release();await rejected;
    await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE staff_id=$1',[owner.staffId]);
  });
  it('singleton Owner marker serializes competing first inserts on two connections',async()=>{
    const a=await database.pool.connect(),b=await database.pool.connect(),op=randomUUID();
    try {
      await a.query('BEGIN');await a.query('INSERT INTO staff.bootstrap_marker(singleton,operation_id) VALUES(true,$1)',[op]);
      const operation=b.query('INSERT INTO staff.bootstrap_marker(singleton,operation_id) VALUES(true,$1)',[randomUUID()]);const rejected=expect(operation).rejects.toMatchObject({code:'23505'});
      await pending(operation);await a.query('COMMIT');await rejected;
      expect((await database.pool.query('SELECT count(*)::int AS count FROM staff.bootstrap_marker')).rows[0].count).toBe(1);
    } finally {await a.query('ROLLBACK');a.release();b.release();}
  });
  it('severs staff mapping on account erasure and retains the irreversible bootstrap marker',async()=>{
    const actor=await staff();const op=(await database.pool.query('SELECT operation_id FROM staff.bootstrap_marker')).rows[0].operation_id;
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1',[actor.userId]);
    const row=(await database.pool.query('SELECT user_id,state FROM staff.subject WHERE staff_id=$1',[actor.staffId])).rows[0];expect(row.user_id).toBeNull();expect(row.state).toBe('ERASED');
    expect((await database.pool.query('SELECT operation_id FROM staff.bootstrap_marker')).rows[0].operation_id).toBe(op);
    await expect(database.pool.query('DELETE FROM staff.bootstrap_marker')).rejects.toMatchObject({code:'55000'});
  });
  it('holds prevent ordinary account lock, refresh and login challenge issuance',async()=>{
    const a=await account();await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,1)',[a.userId]);
    expect((await runtime.query('SELECT identity.read_account_security_hold($1) AS held',[a.userId])).rows[0].held).toBe(true);
    expect((await database.pool.query('SELECT * FROM identity.lock_account_t9_internal($1,true)',[a.userId])).rowCount).toBe(0);
    expect((await database.pool.query(`SELECT * FROM identity.authenticate_session_t9($1,$2,now(),now()+interval '1 hour')`,[hash(a.sessionId),hash('binding')])).rowCount).toBe(0);
  });
  it('keeps audit and outbox immutable even under their definer owner',async()=>{
    const owner=await staff(true),target=await staff(),p=await proof(owner,'TEAM_GRANT',target.staffId);
    await runtime.query('SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb)',[owner.context,p.proofId,p.binding,target.staffId,['AUDIT_READ'],p.operationId,{code:'GRANT_CHANGE'},alertFor(p.operationId,'GRANT')]);
    for(const sql of [`UPDATE staff.audit_event SET event_type='DISABLE'`,'DELETE FROM staff.alert_outbox','TRUNCATE staff.audit_event CASCADE'])await expect(database.pool.query(sql)).rejects.toMatchObject({code:'55000'});
    await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE staff_id=$1',[owner.staffId]);
  });

  it('blocks accept after a target disable wins the subject barrier, issuing no new staff session',async()=>{
    const owner=await staff(true),target=await account(),inv=await invite(owner,target),p=await invitationProof(inv.invitationId,target),op=randomUUID(),barrier=await database.pool.connect();
    await barrier.query('BEGIN');await barrier.query('SELECT identity.lock_security_subjects($1::uuid[])',[[target.userId,owner.userId]]);
    const operation=runtime.query('SELECT staff.accept($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[inv.invitationId,target.userId,target.sessionId,p,{operationId:op,reason:{code:'TEAM_ONBOARDING'}},alertFor(op,'ACCEPT')]);
    const rejected=expect(operation).rejects.toThrow('STAFF_INVITATION_INVALID');await pending(operation);
    const targetStaff=randomUUID();await barrier.query("INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,'{TEAM_READ}')",[targetStaff,target.userId]);
    const disabled=await proof(owner,'EMERGENCY_DISABLE',targetStaff);await barrier.query('SELECT staff.disable($1::jsonb,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8::jsonb)',[owner.context,disabled.proofId,disabled.binding,targetStaff,'COMPROMISE',disabled.operationId,{code:'SECURITY_RESPONSE'},alertFor(disabled.operationId,'DISABLE')]);await barrier.query('COMMIT');barrier.release();await rejected;
    expect((await database.pool.query("SELECT count(*)::int AS count FROM staff.subject WHERE user_id=$1 AND state='ACTIVE'",[target.userId])).rows[0].count).toBe(0);
  });
  it('compromise disable durably revokes ordinary credentials and invalidates persistent staff authority',async()=>{
    const owner=await staff(true),target=await staff(),p=await proof(owner,'EMERGENCY_DISABLE',target.staffId);
    await runtime.query('SELECT staff.disable($1::jsonb,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8::jsonb)',[owner.context,p.proofId,p.binding,target.staffId,'COMPROMISE',p.operationId,{code:'SECURITY_RESPONSE'},alertFor(p.operationId,'DISABLE')]);
    expect((await runtime.query('SELECT identity.read_account_security_hold($1) AS held',[target.userId])).rows[0].held).toBe(true);
    expect((await runtime.query('SELECT staff.read_context($1,$2,$3) AS context',[target.userId,target.sessionId,target.tokenHash])).rows[0].context).toBeNull();
    expect((await database.pool.query('SELECT state FROM identity.mfa_factor WHERE mfa_factor_id=$1',[target.factorId])).rows[0].state).toBe('revoked');
    expect((await database.pool.query('SELECT count(*)::int AS count FROM staff.alert_outbox o JOIN staff.audit_event a USING(event_id) WHERE a.operation_id=$1',[p.operationId])).rows[0].count).toBe(1);
  });
  it('audit failure rolls back compromise hold and revocation as well as grant mutation',async()=>{
    const owner=await staff(true),target=await staff(),p=await proof(owner,'EMERGENCY_DISABLE',target.staffId);
    await database.pool.query(`CREATE FUNCTION public.staff_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture-audit-failure'; END $$; CREATE TRIGGER staff_test_audit_failure BEFORE INSERT ON staff.audit_event FOR EACH ROW EXECUTE FUNCTION public.staff_test_audit_failure()`);
    try {
      await expect(runtime.query('SELECT staff.disable($1::jsonb,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8::jsonb)',[owner.context,p.proofId,p.binding,target.staffId,'COMPROMISE',p.operationId,{code:'SECURITY_RESPONSE'},alertFor(p.operationId,'DISABLE')])).rejects.toThrow('fixture-audit-failure');
      expect((await database.pool.query('SELECT state FROM staff.subject WHERE staff_id=$1',[target.staffId])).rows[0].state).toBe('ACTIVE');
      expect((await runtime.query('SELECT identity.read_account_security_hold($1) AS held',[target.userId])).rows[0].held).toBe(false);
      expect((await database.pool.query('SELECT revoked_at FROM identity.session WHERE session_id=$1',[target.sessionId])).rows[0].revoked_at).toBeNull();
    } finally {await database.pool.query('DROP TRIGGER staff_test_audit_failure ON staff.audit_event;DROP FUNCTION public.staff_test_audit_failure()');}
  });
  it('does not authorize an invitation projection as a TEAM, AUDIT or elevation context',async()=>{
    const owner=await staff(true),target=await account(),inv=await invite(owner,target),context=(await runtime.query('SELECT staff.read_invitation_context($1,$2,$3) AS context',[target.userId,target.sessionId,inv.tokenHash])).rows[0].context;
    for(const cap of ['TEAM_READ','AUDIT_READ','TEAM_GRANT'])expect((await runtime.query('SELECT staff.authorize_action($1::jsonb,$2) AS valid',[context,cap])).rows[0].valid).toBe(false);
    const p=await invitationProof(inv.invitationId,target),different=await invite(owner,await account());
    await expect(runtime.query('SELECT staff.accept($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[different.invitationId,target.userId,target.sessionId,p,{operationId:randomUUID(),reason:{code:'TEAM_ONBOARDING'}},{}])).rejects.toThrow('STAFF_INVITATION_INVALID');
  });
});

describe('scoped rotation, JIT and trusted ceremony persistence',()=>{
 it('persists a real factor/session rotation receipt and consumes KEY once',async()=>{
  const a=await account(),r=await prerequisite(a);
  const row=(await database.pool.query('SELECT r.*,p.factor_receipt_id FROM staff.password_totp_rotation_receipt r JOIN staff.prerequisite_receipt p ON p.factor_receipt_id=r.receipt_id WHERE p.receipt_id=$1',[r.value.receiptId])).rows[0];
  expect(row.factor_id).toBe(a.factorId);expect(row.accepted_step).toBe('2');expect(row.rotated_token_hash).toBe(r.replacement);
  await expect(runtime.query('SELECT staff.begin_registration_challenge($1,$2,$3,$4)',[a.userId,a.sessionId,hash('unbacked'),hash(randomUUID())])).rejects.toThrow('STAFF_PREREQUISITE_INVALID');
  const challenge=(await runtime.query('SELECT staff.begin_registration_challenge($1,$2,$3,$4) AS id',[a.userId,a.sessionId,r.handle,hash(randomUUID())])).rows[0].id;
  expect(challenge).toBeTypeOf('string');
  await expect(runtime.query('SELECT staff.begin_registration_challenge($1,$2,$3,$4)',[a.userId,a.sessionId,r.handle,hash(randomUUID())])).rejects.toThrow('STAFF_PREREQUISITE_INVALID');
 });
 it('rejects normal login timestamps, stale factor steps and later session rotation',async()=>{
  const a=await account();await expect(prerequisite(a,'KEY_PREREGISTRATION',null,null,1)).rejects.toThrow('STAFF_PREREQUISITE_INVALID');
  expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.password_totp_rotation_receipt WHERE user_id=$1',[a.userId])).rows[0].n).toBe(0);
  const r=await prerequisite(a);await database.pool.query('UPDATE identity.session SET token_hash=$1 WHERE session_id=$2',[hash('later-rotation'),a.sessionId]);
  await expect(runtime.query('SELECT staff.begin_registration_challenge($1,$2,$3,$4)',[a.userId,a.sessionId,r.handle,hash(randomUUID())])).rejects.toThrow('STAFF_PREREQUISITE_INVALID');
 });
 it('keeps every new function PUBLIC closed and grants exact runtime/recovery overloads',async()=>{
  const rows=(await database.pool.query(`SELECT n.nspname,p.proname,p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,
    EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public,
    has_function_privilege('debateai_runtime',p.oid,'EXECUTE') AS runtime,has_function_privilege('debateai_staff_recovery',p.oid,'EXECUTE') AS recovery
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='staff' OR (n.nspname='identity' AND p.proname IN('lock_security_subjects','read_account_security_hold','staff_rotation_binding_current')) ORDER BY signature`)).rows;
  const runtimeNames=new Set(['read_context','authorize_action','invite','read_invitation_context','accept','grant','disable','step_up_prerequisite','read_owner_possession_context','begin_invitation_challenge','begin_owner_possession_challenge','complete_invitation_proof','complete_owner_possession','begin_registration_challenge','read_account_security_hold']);
  for(const row of rows){expect(row.public,row.signature).toBe(false);expect(row.runtime,row.signature).toBe(runtimeNames.has(row.proname));expect(row.recovery,row.signature).toBe(row.proname==='prepare_owner_command');if(row.nspname==='staff')expect(row.owner).toBe('debateai_staff_security_owner');}
  console.info('[STAFF_FUNCTION_ACL]',JSON.stringify(rows));
  const denied=[['user','password_hash'],['user','email_ciphertext'],['session','token_hash'],['mfa_factor','secret_ciphertext'],['mfa_factor','public_key']];
  for(const [table,column] of denied)expect((await database.pool.query(`SELECT has_column_privilege('debateai_staff_security_owner',$1,$2,'SELECT') AS allowed`,['identity.'+(table==='user'?'"user"':table),column])).rows[0].allowed).toBe(false);
  expect((await database.pool.query(`SELECT has_table_privilege('debateai_staff_security_owner','identity.account_security_hold','DELETE') AS allowed`)).rows[0].allowed).toBe(false);
 });
 it('persists invitation verification only from a stored challenge with a live key and monotonic counter',async()=>{
  const owner=await staff(true),target=await account(),inv=await invite(owner,target),credential='fixture_'+randomUUID().replaceAll('-','');await passkey(target,credential);
  const challenge=(await runtime.query('SELECT staff.begin_invitation_challenge($1,$2,$3,$4,$5) AS id',[target.userId,target.sessionId,inv.tokenHash,hash(randomUUID()),credential])).rows[0].id;
  await expect(runtime.query('SELECT staff.complete_invitation_proof($1,$2,$3,$4,$5,$6,$7)',[challenge,target.userId,target.sessionId,credential,null,'localhost','https://localhost'])).rejects.toThrow('STAFF_CREDENTIAL_INVALID');
  const context=(await new PostgresStaffRepository(runtime).readInvitationContext({targetUserId:target.userId,ordinarySessionId:target.sessionId,invitationTokenHash:inv.tokenHash}))!;
  const proof=await new PostgresStaffRepository(runtime).storeInvitationProof({context,challengeId:challenge,credentialId:credential,newCounter:1,rpId:'localhost',origin:'https://localhost'});
  expect(proof.context.invitationId).toBe(inv.invitationId);expect(proof.verifiedAt).toBeInstanceOf(Date);
  await expect(runtime.query('SELECT staff.complete_invitation_proof($1,$2,$3,$4,$5,$6,$7)',[challenge,target.userId,target.sessionId,credential,2,'localhost','https://localhost'])).rejects.toThrow('STAFF_CEREMONY_INVALID');
  const again=(await runtime.query('SELECT staff.begin_invitation_challenge($1,$2,$3,$4,$5) AS id',[target.userId,target.sessionId,inv.tokenHash,hash(randomUUID()),credential])).rows[0].id;
  await expect(runtime.query('SELECT staff.complete_invitation_proof($1,$2,$3,$4,$5,$6,$7)',[again,target.userId,target.sessionId,credential,1,'localhost','https://localhost'])).rejects.toThrow('STAFF_CREDENTIAL_INVALID');
 });
 it('permits only live JIT prepare and two fixed Owner keys, without designation',async()=>{
  const owner=await staff(true),target=await account(),keys=['fixed_'+randomUUID().replaceAll('-',''),'fixed_'+randomUUID().replaceAll('-','')];for(const key of keys)await passkey(target,key);
  const url=new URL(database.connectionString);url.username='debateai_prod_staff_recovery';url.password='fixture-recovery-only';
  await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery PASSWORD 'fixture-recovery-only' VALID UNTIL '-infinity'`);const recovery=createPool(url.toString());
  const op=randomUUID(),nonce=hash(op);
  try {
   await expect(recovery.query('SELECT staff.prepare_owner_command($1,$2,$3,$4,$5,$6)',['RECOVER_OWNER',target.userId,owner.userId,keys,op,nonce])).rejects.toThrow('password authentication failed');
   await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery VALID UNTIL '${new Date(Date.now()+240000).toISOString()}'`);
   const connected=await recovery.connect();
   try {
    await database.pool.query("ALTER ROLE debateai_prod_staff_recovery VALID UNTIL '-infinity'");
    await expect(connected.query('SELECT staff.prepare_owner_command($1,$2,$3,$4,$5,$6)',['RECOVER_OWNER',target.userId,owner.userId,keys,op,nonce])).rejects.toThrow('STAFF_RECOVERY_JIT_REQUIRED');
    await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery VALID UNTIL '${new Date(Date.now()+240000).toISOString()}'`);
   } finally {connected.release();}
   await expect(recovery.query('SELECT * FROM staff.owner_command')).rejects.toMatchObject({code:'42501'});
   const barrier=await database.pool.connect();
   try {
    await barrier.query('BEGIN');await barrier.query('SELECT identity.lock_security_subjects($1::uuid[])',[[target.userId,owner.userId]]);
    await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery VALID UNTIL '${new Date(Date.now()+300).toISOString()}'`);
    const delayed=recovery.query('SELECT staff.prepare_owner_command($1,$2,$3,$4,$5,$6)',['RECOVER_OWNER',target.userId,owner.userId,keys,randomUUID(),hash(randomUUID())]);
    const rejected=expect(delayed).rejects.toThrow('STAFF_RECOVERY_JIT_REQUIRED');await pending(delayed);await new Promise(resolve=>setTimeout(resolve,400));
    await barrier.query('COMMIT');await rejected;
   } finally {await barrier.query('ROLLBACK');barrier.release();}
   await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery VALID UNTIL '${new Date(Date.now()+240000).toISOString()}'`);
   const command=(await recovery.query('SELECT staff.prepare_owner_command($1,$2,$3,$4,$5,$6) AS value',['RECOVER_OWNER',target.userId,owner.userId,keys,op,nonce])).rows[0].value;
   const r=await prerequisite(target,'OWNER_POSSESSION',command.commandId,nonce);
   await expect(runtime.query('SELECT staff.begin_registration_challenge($1,$2,$3,$4)',[target.userId,target.sessionId,r.handle,hash(randomUUID())])).rejects.toThrow('STAFF_PREREQUISITE_INVALID');
   for(const key of keys){
    const challenge=(await runtime.query('SELECT staff.begin_owner_possession_challenge($1,$2,$3,$4,$5,$6,$7) AS id',[target.userId,target.sessionId,command.commandId,nonce,key,r.handle,hash(randomUUID())])).rows[0].id;
    await runtime.query('SELECT staff.complete_owner_possession($1,$2,$3,$4,$5,$6,$7)',[challenge,target.userId,target.sessionId,key,1,'localhost','https://localhost']);
    await expect(runtime.query('SELECT staff.begin_owner_possession_challenge($1,$2,$3,$4,$5,$6,$7)',[target.userId,target.sessionId,command.commandId,nonce,key,r.handle,hash(randomUUID())])).rejects.toMatchObject({code:'23505'});
   }
   expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.owner_possession_receipt WHERE command_id=$1',[command.commandId])).rows[0].n).toBe(2);
   expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.owner_designation d JOIN staff.subject s USING(staff_id) WHERE s.user_id=$1',[target.userId])).rows[0].n).toBe(0);
   await expect(runtime.query('SELECT staff.prepare_owner_command($1::jsonb)',[{verified:true,command,receipts:keys}])).rejects.toMatchObject({code:'42883'});
  } finally {await recovery.end();await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery PASSWORD NULL VALID UNTIL '-infinity'`);}
 });
});

it('returns the original grant receipt for identical operation retry and rejects changed retries',async()=>{
 const owner=await staff(true),target=await staff(),p=await proof(owner,'TEAM_GRANT',target.staffId);
 const sql='SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb) AS value';
 const values=[owner.context,p.proofId,p.binding,target.staffId,['AUDIT_READ'],p.operationId,{code:'GRANT_CHANGE'},alertFor(p.operationId,'GRANT')];
 const first=(await runtime.query(sql,values)).rows[0].value;expect((await runtime.query(sql,values)).rows[0].value).toEqual(first);
 await expect(runtime.query(sql,[...values.slice(0,4),['TEAM_READ'],...values.slice(5)])).rejects.toThrow('STAFF_OPERATION_CONFLICT');
 expect((await database.pool.query('SELECT grant_revision FROM staff.subject WHERE staff_id=$1',[target.staffId])).rows[0].grant_revision).toBe('1');
});
it('verification lock order allows a subject owner to enter T9 while a verification callback waits',async()=>{
 const a=await account(),token=hash(randomUUID());
 await database.pool.query(`INSERT INTO identity.verification_token_credential(token_hash,channel_binding_id,issued_at,expires_at) SELECT $1,channel_binding_id,now(),now()+interval '1 hour' FROM identity.channel_binding WHERE user_id=$2 AND channel_type='email'`,[token,a.userId]);
 const subject=await database.pool.connect(),verification=await database.pool.connect();
 const source={ipArgon2id:'argon2id-audit:v1:'+'0'.repeat(64),userAgentArgon2id:'argon2id-audit:v1:'+'1'.repeat(64)};
 try {
  await subject.query('BEGIN');await subject.query("SET LOCAL deadlock_timeout='100ms'");await subject.query('SELECT identity.lock_security_subjects($1::uuid[])',[[a.userId]]);
  await verification.query('BEGIN');await verification.query("SET LOCAL deadlock_timeout='100ms'");await verification.query('SELECT identity.begin_runtime_audit_attempt()');
  const pid=(await verification.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const waiting=verification.query('SELECT identity.consume_verification_with_audit($1,clock_timestamp(),$2::jsonb)',[token,source]).then(result=>({result,error:null}),error=>({result:null,error}));
  let barrier=false;
  for(let attempt=0;attempt<200;attempt++){
   barrier=(await database.pool.query(`SELECT wait_event='advisory' AND cardinality(pg_blocking_pids(pid))>0 AS waiting FROM pg_stat_activity WHERE pid=$1`,[pid])).rows[0]?.waiting===true;
   if(barrier)break;await new Promise(resolve=>setTimeout(resolve,10));
  }
  expect(barrier).toBe(true);
  const entered=await subject.query('SELECT * FROM identity.lock_account_t9_internal($1,true)',[a.userId]).then(result=>({result,error:null}),error=>({result:null,error}));
  await subject.query(entered.error?'ROLLBACK':'COMMIT');
  const completed=await waiting;
  console.info('[STAFF_VERIFICATION_LOCK_ORDER]',JSON.stringify({subjectError:entered.error?.code,verificationError:completed.error?.code}));
  expect(entered.error).toBeNull();expect(completed.error).toBeNull();
  await verification.query('COMMIT');
 } finally {await subject.query('ROLLBACK');await verification.query('ROLLBACK');subject.release();verification.release();}
});

it('rechecks prerequisite SQL expiry after waiting on a subject barrier',async()=>{
 const target=await account(),r=await prerequisite(target),barrier=await database.pool.connect();
 try {
  await barrier.query('BEGIN');await barrier.query('SELECT identity.lock_security_subjects($1::uuid[])',[[target.userId]]);
  await database.pool.query("UPDATE staff.prerequisite_receipt SET expires_at=clock_timestamp()+interval '100 milliseconds' WHERE receipt_id=$1",[r.value.receiptId]);
  const operation=runtime.query('SELECT staff.begin_registration_challenge($1,$2,$3,$4)',[target.userId,target.sessionId,r.handle,hash(randomUUID())]);const rejected=expect(operation).rejects.toThrow('STAFF_PREREQUISITE_INVALID');
  await pending(operation);await new Promise(resolve=>setTimeout(resolve,120));await barrier.query('COMMIT');await rejected;
 } finally {await barrier.query('ROLLBACK');barrier.release();}
});
it('rolls back invitation and acceptance state on actual audit insert failure',async()=>{
 const owner=await staff(true),target=await account(),inv=await invite(owner,target),p=await invitationProof(inv.invitationId,target),another=await account(),inviteProof=await proof(owner,'TEAM_INVITE',another.userId),acceptOp=randomUUID();
 await database.pool.query(`CREATE FUNCTION public.staff_audit_insert_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture-audit-insert-failure'; END $$; CREATE TRIGGER staff_audit_insert_fail BEFORE INSERT ON staff.audit_event FOR EACH ROW EXECUTE FUNCTION public.staff_audit_insert_fail()`);
 try {
  await expect(runtime.query('SELECT staff.invite($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8,$9::jsonb,$10::jsonb)',[owner.context,inviteProof.proofId,inviteProof.binding,another.userId,['TEAM_READ'],inviteProof.operationId,{code:'TEAM_ONBOARDING'},hash(randomUUID()),alertFor(inviteProof.operationId,'INVITE'),{schema:'staff-invitation-delivery-v1',operationId:inviteProof.operationId,envelope}])).rejects.toThrow('fixture-audit-insert-failure');
  await expect(runtime.query('SELECT staff.accept($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[inv.invitationId,target.userId,target.sessionId,p,{operationId:acceptOp,reason:{code:'TEAM_ONBOARDING'}},alertFor(acceptOp,'ACCEPT')])).rejects.toThrow('fixture-audit-insert-failure');
  expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.invitation WHERE operation_id=$1',[inviteProof.operationId])).rows[0].n).toBe(0);
  expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.subject WHERE user_id=$1',[target.userId])).rows[0].n).toBe(0);
  expect((await database.pool.query('SELECT consumed_at FROM staff.invitation WHERE invitation_id=$1',[inv.invitationId])).rows[0].consumed_at).toBeNull();
  expect((await database.pool.query('SELECT consumed_at FROM staff.invitation_proof WHERE proof_id=$1',[p])).rows[0].consumed_at).toBeNull();
 } finally {await database.pool.query('DROP TRIGGER staff_audit_insert_fail ON staff.audit_event;DROP FUNCTION public.staff_audit_insert_fail()');}
});
it('rolls back an already-inserted audit event when the database outbox insert fails',async()=>{
 const owner=await staff(true),target=await staff(),p=await proof(owner,'TEAM_GRANT',target.staffId);
 await database.pool.query(`CREATE FUNCTION public.staff_outbox_insert_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture-outbox-insert-failure'; END $$; CREATE TRIGGER staff_outbox_insert_fail BEFORE INSERT ON staff.alert_outbox FOR EACH ROW EXECUTE FUNCTION public.staff_outbox_insert_fail()`);
 try {
  await expect(runtime.query('SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb)',[owner.context,p.proofId,p.binding,target.staffId,['AUDIT_READ'],p.operationId,{code:'GRANT_CHANGE'},alertFor(p.operationId,'GRANT')])).rejects.toThrow('fixture-outbox-insert-failure');
  expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.audit_event WHERE operation_id=$1',[p.operationId])).rows[0].n).toBe(0);
  expect((await database.pool.query('SELECT grant_revision FROM staff.subject WHERE staff_id=$1',[target.staffId])).rows[0].grant_revision).toBe('0');
  expect((await database.pool.query('SELECT consumed_at FROM staff.action_proof WHERE proof_id=$1',[p.proofId])).rows[0].consumed_at).toBeNull();
 } finally {await database.pool.query('DROP TRIGGER staff_outbox_insert_fail ON staff.alert_outbox;DROP FUNCTION public.staff_outbox_insert_fail()');}
});
it('governed erasure cascades invitations and severs mapping while fixture alert ciphertext becomes keyless',async()=>{
 const owner=await staff(true),target=await account(),inv=await invite(owner,target),proofId=await invitationProof(inv.invitationId,target),op=randomUUID();
 const root=await mkdtemp(join(tmpdir(),'staff-erasure-fixture-')),kek=loadKek(generateDek()),users=new FileUserDekStore(root,kek),dek=generateDek();
 const auditToken=(await database.pool.query('SELECT audit_token FROM identity."user" WHERE user_id=$1',[target.userId])).rows[0].audit_token as string;
 const aad:AeadAad=['staff','alert_outbox.encrypted_payload',op,'run:none',auditToken,'staff-alert-dek:'+auditToken,'1'];
 try {
  await users.store(target.userId,dek);const encrypted=encrypt(dek,Buffer.from('fixture metadata alert'),aad);dek.fill(0);
  await runtime.query('SELECT staff.accept($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[inv.invitationId,target.userId,target.sessionId,proofId,{operationId:op,reason:{code:'TEAM_ONBOARDING'}},{schema:'staff-alert-v1',event:'ACCEPT',operationId:op,envelope:encrypted}]);
  const stored=(await database.pool.query('SELECT o.key_ref,o.encrypted_payload FROM staff.alert_outbox o JOIN staff.audit_event a USING(event_id) WHERE a.operation_id=$1',[op])).rows[0];
  expect(stored.key_ref).toBe(auditToken);const readable=await users.load(target.userId);expect(decrypt(readable,stored.encrypted_payload,aad).toString()).toBe('fixture metadata alert');readable.fill(0);
  const erasure=randomUUID();await database.pool.query("INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at) VALUES($1,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')",[erasure,target.userId]);
  expect((await database.pool.query("SELECT identity.prepare_account_erasure($1,'{}','{}','{}') AS result",[erasure])).rows[0].result).toBe('PREPARED');
  const notifications=(await database.pool.query('SELECT * FROM identity.claim_account_erasure_notifications(10)')).rows;
  for(const notification of notifications){expect(notification.erasure_id).toBe(erasure);expect((await database.pool.query('SELECT identity.ack_account_erasure_notification($1,$2) AS done',[notification.message_id,notification.claim_token])).rows[0].done).toBe(true);}
  expect(await users.destroy(target.userId)).toBe('DESTROYED');const cleanup=(await database.pool.query('SELECT clock_timestamp() AS time')).rows[0].time;
  expect((await database.pool.query('SELECT identity.finalize_account_erasure($1,$2,clock_timestamp(),0,0,1,0) AS result',[erasure,cleanup])).rows[0].result).toBe('COMMITTED');
  await expect(users.load(target.userId)).rejects.toThrow();
  expect((await database.pool.query('SELECT user_id,state FROM staff.subject WHERE staff_id=(SELECT subject_staff_id FROM staff.audit_event WHERE operation_id=$1)',[op])).rows[0]).toEqual({user_id:null,state:'ERASED'});
  expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.invitation WHERE target_user_id=$1',[target.userId])).rows[0].n).toBe(0);
  expect((await database.pool.query('SELECT count(*)::int AS n FROM identity."user" WHERE audit_token=$1',[auditToken])).rows[0].n).toBe(0);
  const retained=(await database.pool.query('SELECT o.* FROM staff.alert_outbox o JOIN staff.audit_event a USING(event_id) WHERE a.operation_id=$1',[op])).rows[0];expect(JSON.stringify(retained)).not.toContain(target.userId);expect(retained.encrypted_payload).toEqual(encrypted);
 } finally {dek.fill(0);destroyKek(kek);await rm(root,{recursive:true,force:true});}
});
it('refuses compromise self-disable without consuming proof or holding the actor',async()=>{
 const owner=await staff(true),p=await proof(owner,'EMERGENCY_DISABLE',owner.staffId);
 await expect(runtime.query('SELECT staff.disable($1::jsonb,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8::jsonb)',[owner.context,p.proofId,p.binding,owner.staffId,'COMPROMISE',p.operationId,{code:'SECURITY_RESPONSE'},alertFor(p.operationId,'DISABLE')])).rejects.toThrow('STAFF_SELF_DISABLE_FORBIDDEN');
 expect((await database.pool.query('SELECT state FROM staff.subject WHERE staff_id=$1',[owner.staffId])).rows[0].state).toBe('ACTIVE');
 expect((await database.pool.query('SELECT consumed_at FROM staff.action_proof WHERE proof_id=$1',[p.proofId])).rows[0].consumed_at).toBeNull();
});
it('rejects null and string revisions even when a malformed persisted binding matches',async()=>{
 for(const revision of [null,'0']) {
  const owner=await staff(true),target=await staff(),p=await proof(owner,'TEAM_GRANT',target.staffId),binding={...p.binding,expectedRevision:revision};
  await database.pool.query('UPDATE staff.action_proof SET binding=$1 WHERE proof_id=$2',[binding,p.proofId]);
  await expect(runtime.query('SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb)',[owner.context,p.proofId,binding,target.staffId,['AUDIT_READ'],p.operationId,{code:'GRANT_CHANGE'},alertFor(p.operationId,'GRANT')])).rejects.toThrow('STAFF_REVISION_INVALID');
  expect((await database.pool.query('SELECT grant_revision FROM staff.subject WHERE staff_id=$1',[target.staffId])).rows[0].grant_revision).toBe('0');
 }
});
it('replays business operations with regenerated bearer, proof and real encrypted envelopes',async()=>{
 const owner=await staff(true),target=await account(),p=await proof(owner,'TEAM_INVITE',target.userId),dek=generateDek();
 const encryptIntent=(op:string)=>encrypt(dek,Buffer.from('fixture intent'),['staff','outbox',op,'run:none',owner.staffId,'fixture-alert-key','1']);
 const sql='SELECT staff.invite($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8,$9::jsonb,$10::jsonb) AS value';
 const values=[owner.context,p.proofId,p.binding,target.userId,['TEAM_READ'],p.operationId,{code:'TEAM_ONBOARDING'},hash(randomUUID()),{schema:'staff-alert-v1',event:'INVITE',operationId:p.operationId,envelope:encryptIntent(p.operationId)},{schema:'staff-invitation-delivery-v1',operationId:p.operationId,envelope:encryptIntent(p.operationId)}];
 try {
  const first=(await runtime.query(sql,values)).rows[0].value;
  const retry=[...values.slice(0,7),hash(randomUUID()),{schema:'staff-alert-v1',event:'INVITE',operationId:p.operationId,envelope:encryptIntent(p.operationId)},{schema:'staff-invitation-delivery-v1',operationId:p.operationId,envelope:encryptIntent(p.operationId)}];
  expect((await runtime.query(sql,retry)).rows[0].value).toEqual(first);
  expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.invitation WHERE operation_id=$1',[p.operationId])).rows[0].n).toBe(1);
  expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.alert_outbox o JOIN staff.audit_event a USING(event_id) WHERE a.operation_id=$1',[p.operationId])).rows[0].n).toBe(2);
  const delegated=await staff(),g=await proof(owner,'TEAM_GRANT',delegated.staffId),grantSql='SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb) AS value';
  const grantValues=[owner.context,g.proofId,g.binding,delegated.staffId,['AUDIT_READ'],g.operationId,{code:'GRANT_CHANGE'},{schema:'staff-alert-v1',event:'GRANT',operationId:g.operationId,envelope:encryptIntent(g.operationId)}];
  const granted=(await runtime.query(grantSql,grantValues)).rows[0].value,newProof=await proof(owner,'TEAM_GRANT',delegated.staffId);
  await database.pool.query('UPDATE staff.action_proof SET binding=$1 WHERE proof_id=$2',[g.binding,newProof.proofId]);
  expect((await runtime.query(grantSql,[owner.context,newProof.proofId,...grantValues.slice(2,7),{schema:'staff-alert-v1',event:'GRANT',operationId:g.operationId,envelope:encryptIntent(g.operationId)}])).rows[0].value).toEqual(granted);
 } finally {dek.fill(0);}
});

it('reads a security hold through the exported session adapter and fails closed for an erased account',async()=>{
 const a=await account(),reader=new PostgresSessionRepository(runtime,{hashSourceIp:async()=>'',hashUserAgent:async()=>''} as unknown as AuditContextHasher);
 expect(await reader.readAccountSecurityHold(a.userId)).toBe(false);await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held) VALUES($1,true)',[a.userId]);expect(await reader.readAccountSecurityHold(a.userId)).toBe(true);
 expect(await reader.readAccountSecurityHold(randomUUID())).toBe(true);
});
it('locks a known duplicate account before registration INSERT reaches any channel row lock',async()=>{
 const existing=await account(),proposed=randomUUID(),blind=createHash('sha256').update(existing.userId).digest(),first=await database.pool.connect(),second=await database.pool.connect();
 const source={ipArgon2id:'argon2id-audit:v1:'+'0'.repeat(64),userAgentArgon2id:'argon2id-audit:v1:'+'1'.repeat(64)};
 const sql="SELECT * FROM identity.create_pending_account_with_audit($1,$2,'{}','{}','fixture-password',$3,clock_timestamp(),clock_timestamp(),$4,clock_timestamp()+interval '1 hour',$5::jsonb)";
 try {
  await first.query('BEGIN');await first.query('SELECT identity.lock_security_subjects($1::uuid[])',[[existing.userId]]);
  await second.query('BEGIN');await second.query('SELECT identity.begin_runtime_audit_attempt()');
  const pid=(await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const duplicate=second.query(sql,[proposed,blind,proposed,hash(proposed),source]);await pending(duplicate);
  expect((await database.pool.query("SELECT wait_event FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0].wait_event).toBe('advisory');
  await first.query('SELECT * FROM identity.lock_account_t9_internal($1,false)',[existing.userId]);await first.query('COMMIT');
  expect((await duplicate).rows[0].status).toBe('EMAIL_DUPLICATE');await second.query('COMMIT');
  expect((await database.pool.query('SELECT count(*)::int AS n FROM identity."user" WHERE user_id=$1',[proposed])).rows[0].n).toBe(0);
 } finally {await first.query('ROLLBACK');await second.query('ROLLBACK');first.release();second.release();}
});
it('serializes concurrent new registration through INSERT uniqueness without retaining a committed duplicate row lock',async()=>{
 const one=randomUUID(),two=randomUUID(),blind=createHash('sha256').update(randomUUID()).digest(),first=await database.pool.connect(),second=await database.pool.connect();
 const source={ipArgon2id:'argon2id-audit:v1:'+'0'.repeat(64),userAgentArgon2id:'argon2id-audit:v1:'+'1'.repeat(64)};
 const sql="SELECT * FROM identity.create_pending_account_with_audit($1,$2,'{}','{}','fixture-password',$3,clock_timestamp(),clock_timestamp(),$4,clock_timestamp()+interval '1 hour',$5::jsonb)";
 try {
  await first.query('BEGIN');await first.query('SELECT identity.begin_runtime_audit_attempt()');await first.query(sql,[one,blind,one,hash(one),source]);
  await second.query('BEGIN');await second.query('SELECT identity.begin_runtime_audit_attempt()');const pid=(await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const duplicate=second.query(sql,[two,blind,two,hash(two),source]);await pending(duplicate);
  expect((await database.pool.query('SELECT wait_event FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].wait_event).toBe('transactionid');
  await first.query('SELECT * FROM identity.lock_account_t9_internal($1,false)',[one]);await first.query('COMMIT');
  expect((await duplicate).rows[0].status).toBe('EMAIL_DUPLICATE');await second.query('COMMIT');
  expect((await database.pool.query('SELECT count(*)::int AS n FROM identity."user" WHERE email_blind_index=$1',[blind])).rows[0].n).toBe(1);
 } finally {await first.query('ROLLBACK');await second.query('ROLLBACK');first.release();second.release();}
});
it('requires live OWNER designation even for malformed delegated rows carrying Owner capabilities',async()=>{
 const actor=await staff(),capabilities=['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE'];
 await database.pool.query('UPDATE staff.subject SET capabilities=$1 WHERE staff_id=$2',[capabilities,actor.staffId]);const context={...actor.context,capabilities};
 for(const capability of ['TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE'])expect((await runtime.query('SELECT staff.authorize_action($1::jsonb,$2) AS allowed',[context,capability])).rows[0].allowed).toBe(false);
});
it('invalidates an invitation when its issuing Owner designation disappears without an epoch change',async()=>{
 const owner=await staff(true),target=await account(),inv=await invite(owner,target),p=await invitationProof(inv.invitationId,target),credential='issuer_'+randomUUID().replaceAll('-','');await passkey(target,credential);
 const challenge=(await runtime.query('SELECT staff.begin_invitation_challenge($1,$2,$3,$4,$5) AS id',[target.userId,target.sessionId,inv.tokenHash,hash(randomUUID()),credential])).rows[0].id;
 await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE staff_id=$1',[owner.staffId]);
 expect((await runtime.query('SELECT staff.read_invitation_context($1,$2,$3) AS context',[target.userId,target.sessionId,inv.tokenHash])).rows[0].context).toBeNull();
 await expect(runtime.query('SELECT staff.accept($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[inv.invitationId,target.userId,target.sessionId,p,{operationId:randomUUID(),reason:{code:'TEAM_ONBOARDING'}},{}])).rejects.toThrow('STAFF_INVITATION_INVALID');
 await expect(runtime.query('SELECT staff.complete_invitation_proof($1,$2,$3,$4,$5,$6,$7)',[challenge,target.userId,target.sessionId,credential,1,'localhost','https://localhost'])).rejects.toThrow('STAFF_INVITATION_INVALID');
 expect((await database.pool.query('SELECT signature_counter FROM identity.mfa_factor WHERE user_id=$1 AND credential_id=$2',[target.userId,credential])).rows[0].signature_counter).toBe('0');
});
it('persistent authority requires both verified email and an active verified TOTP factor',async()=>{
 const actor=await staff();await database.pool.query("UPDATE identity.mfa_factor SET state='revoked',revoked_at=clock_timestamp() WHERE mfa_factor_id=$1",[actor.factorId]);
 expect((await runtime.query('SELECT staff.read_context($1,$2,$3) AS context',[actor.userId,actor.sessionId,actor.tokenHash])).rows[0].context).toBeNull();
 const another=await staff();await database.pool.query("UPDATE identity.channel_binding SET state='revoked' WHERE user_id=$1 AND channel_type='email'",[another.userId]);
 expect((await runtime.query('SELECT staff.read_context($1,$2,$3) AS context',[another.userId,another.sessionId,another.tokenHash])).rows[0].context).toBeNull();
});

it('allows unrelated security subjects to progress independently',async()=>{
 const unrelated=await account(),owner=await staff(true),target=await staff(),p=await proof(owner,'TEAM_GRANT',target.staffId),barrier=await database.pool.connect();
 try {
  await barrier.query('BEGIN');await barrier.query('SELECT identity.lock_security_subjects($1::uuid[])',[[unrelated.userId]]);
  const operation=runtime.query('SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb)',[owner.context,p.proofId,p.binding,target.staffId,['AUDIT_READ'],p.operationId,{code:'GRANT_CHANGE'},alertFor(p.operationId,'GRANT')]);
  expect(await Promise.race([operation.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),500))])).toBe(true);
 } finally {await barrier.query('ROLLBACK');barrier.release();}
});
