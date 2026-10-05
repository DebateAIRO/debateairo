import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@debateai/db';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
let database: TestDatabase;
beforeAll(async()=>{database=await startTestDatabase();await migrate(database.pool);},120000);
afterAll(async()=>{await database?.stop();});
describe('account-flow forward migration boundary',()=>{
  it('preserves checksum-bound externally installed recovery103 source exactly',async()=>{
    expect(createHash('sha256').update(await readFile('migrations/0103_password_recovery_t2.sql')).digest('hex')).toBe('d90e9eaef8ffd4e21f86e99f2f9c669e0cb61897f89da4a8f15f1f1c857e082f');
    expect((await database.pool.query("SELECT name FROM debateai_schema_migration WHERE name='0103_password_recovery_t2.sql'")).rows).toEqual([{name:'0103_password_recovery_t2.sql'}]);
  });
  it('retires the legacy recovery mutator from its runtime and ordinary direct or inherited callers',async()=>{
    const functions=(await database.pool.query("SELECT p.oid::regprocedure::text signature,has_function_privilege('debateai_password_recovery_runtime',p.oid,'EXECUTE') executable FROM pg_proc p WHERE p.pronamespace='identity'::regnamespace AND (p.proname LIKE 'password_recovery_%' OR p.proname='expire_password_recovery') ORDER BY 1")).rows;
    expect(functions.map(row=>row.signature)).toEqual(["identity.expire_password_recovery(integer)", "identity.password_recovery_accept_code(text,uuid,text,jsonb)", "identity.password_recovery_ack_code(text,integer,text,jsonb)", "identity.password_recovery_admit(jsonb,bigint)", "identity.password_recovery_audit(uuid,text,jsonb,boolean)", "identity.password_recovery_cancel(text,jsonb)", "identity.password_recovery_cancel_own(uuid,uuid,text,jsonb)", "identity.password_recovery_cancel_session(text,jsonb)", "identity.password_recovery_claim_notice(integer)", "identity.password_recovery_close(uuid,text)", "identity.password_recovery_complete(text,jsonb)", "identity.password_recovery_current(text)", "identity.password_recovery_eligible(uuid)", "identity.password_recovery_exchange(text,text,text,jsonb)", "identity.password_recovery_failure(text,jsonb)", "identity.password_recovery_finish_notice(uuid,uuid,boolean,integer,integer)", "identity.password_recovery_notice_event(uuid,text)", "identity.password_recovery_prepare(bytea)", "identity.password_recovery_read(text)", "identity.password_recovery_read_code(text,integer,boolean)", "identity.password_recovery_read_feed(uuid,uuid,text)", "identity.password_recovery_rules(bigint)", "identity.password_recovery_stage_codes(text,jsonb,jsonb)", "identity.password_recovery_stage_factor(text,uuid,jsonb,text,jsonb)", "identity.password_recovery_start(bytea,uuid,uuid[],jsonb,text,text,jsonb,jsonb,bigint)", "identity.password_recovery_started_scope(text)", "identity.password_recovery_verify_factor(text,uuid,bigint,jsonb)"] );
    expect(functions.filter(row=>row.executable)).toEqual([]);
  });
});

it('upgrades populated installed103 in place, refuses active work, and retires already-connected inherited/direct callers',async()=>{
  const {readdir,mkdtemp,writeFile,rm}=await import('node:fs/promises');
  const {join}=await import('node:path');const {tmpdir}=await import('node:os');
  const {randomBytes,randomUUID}=await import('node:crypto');const {createPool}=await import('@debateai/db');
  const old=await startTestDatabase();let legacy:ReturnType<typeof createPool>|undefined,direct:ReturnType<typeof createPool>|undefined;
  let held:import('pg').PoolClient|undefined,directHeld:import('pg').PoolClient|undefined;
  const keyRoot=await mkdtemp(join(tmpdir(),'task13-upgrade-keys-'));
  const crypto=await import('@debateai/crypto');const rules=await import('@debateai/register');
  const argon=new crypto.Argon2WorkerPool();await argon.ready();
  const authPolicy=rules.authPolicyFromRegisterRows(rules.AUTH_POLICY_REGISTER_ROWS),mfaPolicy=rules.mfaPolicyFromValue(rules.MFA_POLICY_REGISTER_ROW.value);
  const keys=new crypto.FileUserDekStore(keyRoot,crypto.loadKek(randomBytes(32))),blindIndexKey=randomBytes(32),password='synthetic-local-upgrade-test-password';
  const passwordHash=await crypto.hashPassword(argon,password,authPolicy.password.argon2id);
  let current:ReturnType<typeof createPool>|undefined;
  try {
    const names=(await readdir('migrations')).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
    const historical=names.filter(name=>Number(name.split('_')[0])<=94||name==='0103_password_recovery_t2.sql');expect(historical).toHaveLength(103);
    await old.pool.query('CREATE TABLE debateai_schema_migration(name text PRIMARY KEY,applied_at timestamptz NOT NULL)');
    for(const name of historical){await old.pool.query(await readFile('migrations/'+name,'utf8'));await old.pool.query('INSERT INTO debateai_schema_migration VALUES($1,clock_timestamp())',[name]);}
    const originalLedger=(await old.pool.query('SELECT name,applied_at FROM debateai_schema_migration ORDER BY name')).rows;
    const user=randomUUID(),channel=randomUUID(),factor=randomUUID(),request=randomUUID(),email='upgrade-'+user+'@example.test';
    const dek=crypto.generateDek(),totpSecret=crypto.generateTotpSecret();await keys.store(user,dek);
    const env=crypto.encrypt(dek,Buffer.from(email),['identity','user.email_ciphertext',user,'run:none',user,`user-dek:${user}`,'1']);
    const factorEnvelope=crypto.encrypt(dek,totpSecret,['identity','mfa_factor.secret_ciphertext',factor,'run:none',user,`user-dek:${user}`,'1']);dek.fill(0);
    const keyPath=join(keyRoot,'users',user,'dek.v1.json');
    const {importHistoricalRegisterFixture,publishReplacementRegisterFixture,registerFixtureRow}=await import('../support/registerFixtures.js');
    const {parseRegisterVersionText}=await import('@debateai/register');
    await importHistoricalRegisterFixture(old.pool,1,[registerFixtureRow('riskTier','casual','synthetic-installed:1')]);
    let version=parseRegisterVersionText('1');
    while(Number(version)<7) {const receipt=await publishReplacementRegisterFixture(old.pool,version,[registerFixtureRow('riskTier','casual','synthetic-installed:'+version)],'task13-synthetic-publication');version=receipt.registerVersion;}
    expect(version).toBe('7');
    const readPublishedHistory=async()=> (await old.pool.query("SELECT jsonb_build_object('versions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY register_version) FROM register.register_version v),'rows',(SELECT jsonb_agg(to_jsonb(r) ORDER BY register_version,row_key) FROM register.register_row r)) history")).rows[0].history;
    const originalPublishedHistory=await readPublishedHistory();
    await old.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1::uuid,$2,$3,$3,$4,$1::text,'active',clock_timestamp())`,[user,crypto.createEmailBlindIndex(blindIndexKey,email),env,passwordHash]);
    await old.pool.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,$2,'email',$3,'verified',clock_timestamp()-interval '1 second',clock_timestamp())`,[channel,user,env]);
    await old.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp',$3,'active',clock_timestamp()-interval '1 second',clock_timestamp())`,[factor,user,factorEnvelope]);
    await old.pool.query('INSERT INTO identity.account_recovery_request(recovery_request_id,channel_refs_ciphertext) VALUES($1,$2)',[request,env]);
    await old.pool.query(`INSERT INTO identity.account_recovery_state_event(recovery_request_id,state) VALUES($1,'COMPLETED_FULL')`,[request]);
    await old.pool.query(`INSERT INTO identity.password_recovery_control(recovery_request_id,user_id,register_version,policy,password_snapshot,security_epoch,channel_id,channel_snapshot,original_factor_id,factor_snapshot,link_hash,cancel_hash,expires_at,stage) VALUES($1,$2,7,'{}',$8,0,$3,$5,$4,$9,$6,$7,clock_timestamp()+interval '5 minutes','COMPLETED')`,[request,user,channel,factor,env,'sha256:'+'ab'.repeat(32),'sha256:'+'cd'.repeat(32),passwordHash,factorEnvelope]);
    const keyBytes=await readFile(keyPath);
    await old.pool.query("CREATE ROLE task13_legacy LOGIN PASSWORD 'synthetic-test-only' IN ROLE debateai_password_recovery_runtime; CREATE ROLE task13_direct LOGIN PASSWORD 'synthetic-test-only'");
    await old.pool.query('GRANT USAGE ON SCHEMA identity TO task13_direct; GRANT EXECUTE ON FUNCTION identity.password_recovery_read(text) TO task13_direct');
    const url=new URL(old.connectionString);url.username='task13_legacy';url.password='synthetic-test-only';legacy=createPool(url.toString());url.username='task13_direct';direct=createPool(url.toString());
    held=await legacy.connect();directHeld=await direct.connect();
    await held.query('PREPARE old_read(text) AS SELECT identity.password_recovery_read($1)');
    const barrier=await old.pool.connect();
    let oldCall:Promise<unknown>|undefined;
    try {
      await barrier.query('BEGIN');await barrier.query('LOCK TABLE identity.password_recovery_control IN ACCESS EXCLUSIVE MODE');
      const pid=Number((await held.query('SELECT pg_backend_pid() pid')).rows[0].pid);
      oldCall=held.query("SELECT identity.password_recovery_failure('sha256:'||repeat('a',64),$1)",[{ipArgon2id:'argon2id-audit:v1:'+'ab'.repeat(32),userAgentArgon2id:'argon2id-audit:v1:'+'cd'.repeat(32)}]);
      let blocked=false;
      for(let attempt=0;attempt<100;attempt++) {blocked=(await old.pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event_type==='Lock';if(blocked)break;await new Promise(resolve=>setTimeout(resolve,10));}
      expect(blocked).toBe(true);
      await expect(migrate(old.pool)).rejects.toThrow('LEGACY_RECOVERY_QUIESCENCE_REQUIRED');
    } finally {await barrier.query('ROLLBACK');barrier.release();await oldCall;}
    await held.query('BEGIN');
    await expect(migrate(old.pool)).rejects.toThrow('LEGACY_RECOVERY_QUIESCENCE_REQUIRED');await held.query('ROLLBACK');
    await directHeld.query('BEGIN');
    await expect(migrate(old.pool)).rejects.toThrow('LEGACY_RECOVERY_QUIESCENCE_REQUIRED');await directHeld.query('ROLLBACK');
    await old.pool.query('GRANT debateai_password_recovery_owner TO task13_direct');
    await expect(migrate(old.pool)).rejects.toThrow('LEGACY_RECOVERY_OWNER_MEMBERSHIP_REFUSED');
    await old.pool.query('REVOKE debateai_password_recovery_owner FROM task13_direct');
    await old.pool.query("UPDATE identity.password_recovery_control SET stage='EMAIL_REQUIRED' WHERE recovery_request_id=$1",[request]);
    await expect(migrate(old.pool)).rejects.toThrow('LEGACY_RECOVERY_ACTIVE_CONTROL');
    expect((await old.pool.query('SELECT stage FROM identity.password_recovery_control WHERE recovery_request_id=$1',[request])).rows[0].stage).toBe('EMAIL_REQUIRED');
    await old.pool.query("UPDATE identity.password_recovery_control SET stage='COMPLETED' WHERE recovery_request_id=$1",[request]);
    const notice=(await old.pool.query("INSERT INTO identity.password_recovery_notice(recovery_request_id,user_id,channel_id,event_kind,payload_ciphertext) VALUES($1,$2,$3,'COMPLETED',$4) RETURNING notice_id",[request,user,channel,env])).rows[0].notice_id;
    await expect(migrate(old.pool)).rejects.toThrow('LEGACY_RECOVERY_PENDING_NOTICE');
    await old.pool.query('UPDATE identity.password_recovery_notice SET sent_at=clock_timestamp() WHERE notice_id=$1',[notice]);
    const snapshot=async()=> (await old.pool.query(`SELECT jsonb_build_object('control',(SELECT to_jsonb(c) FROM identity.password_recovery_control c WHERE recovery_request_id=$1),'request',(SELECT to_jsonb(r) FROM identity.account_recovery_request r WHERE recovery_request_id=$1),'history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY event_sequence) FROM identity.account_recovery_state_event h WHERE recovery_request_id=$1),'notice',(SELECT to_jsonb(n) FROM identity.password_recovery_notice n WHERE notice_id=$2),'factor',(SELECT to_jsonb(f) FROM identity.mfa_factor f WHERE mfa_factor_id=$3)) state`,[request,notice,factor])).rows[0].state;
    const before=await snapshot();await migrate(old.pool);expect(await snapshot()).toEqual(before);expect(await readFile(keyPath)).toEqual(keyBytes);
    expect((await old.pool.query('SELECT name,applied_at FROM debateai_schema_migration WHERE name=ANY($1::text[]) ORDER BY name',[historical])).rows).toEqual(originalLedger);
    expect(await readPublishedHistory()).toEqual(originalPublishedHistory);
    for(const client of [held,directHeld])await expect(client.query("SELECT identity.password_recovery_read('sha256:'||repeat('a',64))")).rejects.toMatchObject({code:'42501'});
    await expect(held.query("EXECUTE old_read('sha256:'||repeat('a',64))")).rejects.toMatchObject({code:'42501'});
    for(const role of ['task13_legacy','task13_direct','debateai_runtime','debateai_authorization_runtime','debateai_password_recovery_runtime'])expect((await old.pool.query("SELECT p.oid::regprocedure::text signature FROM pg_proc p WHERE p.pronamespace='identity'::regnamespace AND (p.proname LIKE 'password_recovery_%' OR p.proname='expire_password_recovery') AND has_function_privilege($1,p.oid,'EXECUTE')",[role])).rows).toEqual([]);
    expect((await old.pool.query("SELECT member FROM pg_auth_members WHERE roleid='debateai_password_recovery_owner'::regrole")).rows).toEqual([]);
    await expect(held.query('SET ROLE debateai_password_recovery_owner')).rejects.toMatchObject({code:'42501'});
    held.release();held=undefined;directHeld.release();directHeld=undefined;await migrate(old.pool);expect(await snapshot()).toEqual(before);
    await old.pool.query("CREATE ROLE task13_current LOGIN PASSWORD 'synthetic-test-only' IN ROLE debateai_runtime,debateai_authorization_runtime");
    url.username='task13_current';current=createPool(url.toString());
    const {PostgresSessionRepository}=await import('@debateai/db');const {SessionService}=await import('../../apps/api/src/sessions.js');
    const sessions=await SessionService.create({repository:new PostgresSessionRepository(current,new crypto.AuditContextHasher(argon,randomBytes(32),authPolicy.auditSourceIpKdf)),riskSignals:{recordForSession:async()=>null} as never,onRiskSignalFailure:()=>{},dekStore:keys,argon2:argon,authPolicy,mfaPolicy,sessionPolicy:rules.sessionPolicyFromValue(rules.SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.value,rules.SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef),blindIndexKey,dummyPasswordHash:passwordHash});
    const source={ip:'192.0.2.113',userAgent:'task13-existing-totp',requestId:'task13-upgrade'};
    const challenge=await sessions.beginLogin({email,password},source);
    expect((await sessions.completeLogin({challengeToken:challenge.challengeToken,code:crypto.totpCodeAtStep(totpSecret,Math.floor(Date.now()/30000))},source)).status).toBe('authenticated');
    totpSecret.fill(0);

  } finally {if(held){await held.query('ROLLBACK').catch(()=>{});held.release();}if(directHeld){await directHeld.query('ROLLBACK').catch(()=>{});directHeld.release();}await legacy?.end();await direct?.end();await current?.end();await argon.close();await old.stop();await rm(keyRoot,{recursive:true,force:true});}
},120000);

it('protects all six retained103 tables from owner and ordinary TRUNCATE while preserving the feed UPDATE guard',async()=>{
  const tables=['password_recovery_control','password_recovery_staged_code','password_recovery_retry_lock','password_recovery_source_window','password_recovery_notice','password_recovery_feed'];
  for(const table of tables){
    const relation='identity.'+table;
    const row=(await database.pool.query("SELECT has_table_privilege('debateai_password_recovery_owner',$1,'TRUNCATE') owner_truncate,has_table_privilege('debateai_password_recovery_runtime',$1,'TRUNCATE') runtime_truncate,EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal AND tgname='reject_truncate' AND (tgtype&32)<>0 AND (tgtype&2)<>0 AND (tgtype&1)=0 AND tgenabled IN('O','A')) guarded",[relation])).rows[0];
    expect(row).toEqual({owner_truncate:false,runtime_truncate:false,guarded:true});
    for(const role of ['debateai_password_recovery_owner','debateai_password_recovery_runtime']) {
      const c=await database.pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE '+role);await expect(c.query('TRUNCATE '+relation+' CASCADE')).rejects.toMatchObject({code:'42501'});}finally{await c.query('ROLLBACK');c.release();}
    }
    const c=await database.pool.connect();try{await c.query('BEGIN');await expect(c.query('TRUNCATE '+relation+' CASCADE')).rejects.toMatchObject({code:'55000'});}finally{await c.query('ROLLBACK');c.release();}
  }
  expect((await database.pool.query("SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='identity.password_recovery_feed'::regclass AND tgname='reject_mutation' AND (tgtype&16)<>0 AND tgenabled IN('O','A')) guarded")).rows[0].guarded).toBe(true);
});

it('refuses wrong existing column, index and constraint shapes in the read-only release catalog probe',async()=>{
  const verifier=await readFile('docs/operations/account-flow-release-2026-10-05/verify-catalog-shape.sql','utf8');
  const verify=async()=>{const c=await database.pool.connect();try{await c.query('BEGIN READ ONLY');await c.query(verifier);}finally{await c.query('ROLLBACK');c.release();}};
  await verify();
  await database.pool.query('ALTER TABLE identity.consumer_passkey_subject ADD COLUMN task13_wrongshape text');
  try {await expect(verify()).rejects.toThrow('ACCOUNT_FLOW_CATALOG_DRIFT');}finally{await database.pool.query('ALTER TABLE identity.consumer_passkey_subject DROP COLUMN task13_wrongshape');}
  const index=(await database.pool.query("SELECT pg_get_indexdef('identity.consumer_passkey_user'::regclass) definition")).rows[0].definition;
  await database.pool.query('DROP INDEX identity.consumer_passkey_user');await database.pool.query('CREATE INDEX consumer_passkey_user ON identity.consumer_passkey_credential(signature_counter)');
  try {await expect(verify()).rejects.toThrow('ACCOUNT_FLOW_CATALOG_DRIFT');}finally{await database.pool.query('DROP INDEX identity.consumer_passkey_user');await database.pool.query(index);}
  const constraint=(await database.pool.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='identity.user'::regclass AND conname='identity_user_phone_profile_consistent'")).rows[0].definition;
  await database.pool.query('ALTER TABLE identity."user" DROP CONSTRAINT identity_user_phone_profile_consistent');await database.pool.query('ALTER TABLE identity."user" ADD CONSTRAINT identity_user_phone_profile_consistent CHECK(true)');
  try {await expect(verify()).rejects.toThrow('ACCOUNT_FLOW_CATALOG_DRIFT');}finally{await database.pool.query('ALTER TABLE identity."user" DROP CONSTRAINT identity_user_phone_profile_consistent');await database.pool.query('ALTER TABLE identity."user" ADD CONSTRAINT identity_user_phone_profile_consistent '+constraint);}
  await verify();
});
