import { readFile } from 'node:fs/promises';
import { authBranchMigrationsBefore } from '../support/authBranchLineage.js';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createPool, migrate, type Pool } from '@debateai/db';
import { ownerCandidate, ownerNativeReceipts } from '../support/ownerRecoveryFixtures.js';
import { digest } from '../support/staffWebAuthnFixtures.js';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
import { runStaffSecurityJourney } from '../support/staffSecurityJourney.js';

async function isolated(run:(database:TestDatabase,runtime:Pool)=>Promise<void>) {
 const database=await startTestDatabase();let runtime:Pool|undefined;
 try {
  await migrate(database.pool);
  // Signup's legal acceptance runs as debateai_billing_runtime since 0094 (legal writes API-only), as in staff-security-acceptance.
  await database.pool.query("CREATE ROLE task9_acceptance_runtime LOGIN PASSWORD 'step6c1-private-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  const url=new URL(database.connectionString);url.username='task9_acceptance_runtime';url.password='step6c1-private-only';runtime=createPool(url.toString());
  await run(database,runtime);
 } finally {await runtime?.end();await database.stop();}
}

it('prepares a fixed one-key Owner command against actual SQL without a second enrolled key',async()=>{
 await isolated(async(database)=>{
  const target=await ownerCandidate(database.pool);await database.pool.query('DELETE FROM identity.mfa_factor WHERE mfa_factor_id=$1',[target.keys[1]!.id]);
  await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery PASSWORD 'step6c1-jit-only' VALID UNTIL '${new Date(Date.now()+240000).toISOString()}'`);
  const url=new URL(database.connectionString);url.username='debateai_prod_staff_recovery';url.password='step6c1-jit-only';const jit=createPool(url.toString());
  try {
   const generation=randomUUID(),verifier=digest('step6c1-offline-proof'),commandId=randomUUID();await jit.query('SELECT staff.install_owner_recovery_generation($1,$2,$3)',[generation,verifier,randomUUID()]);
   const result=await jit.query('SELECT staff.prepare_owner_command_v2($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11) AS value',[commandId,'BOOTSTRAP',target.userId,null,null,false,[target.credentialIds[0]],randomUUID(),digest('step6c1-nonce'),generation,verifier]);
   expect(result.rows[0].value.credentialIds).toEqual([target.credentialIds[0]]);
   const optional=await ownerCandidate(database.pool),optionalCommand=randomUUID();
   const oneOfTwo=await jit.query('SELECT staff.prepare_owner_command_v2($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11) AS value',[optionalCommand,'BOOTSTRAP',optional.userId,null,null,false,[optional.credentialIds[0]],randomUUID(),digest('optional-key-nonce'),generation,verifier]);
   expect(oneOfTwo.rows[0].value.credentialIds).toEqual([optional.credentialIds[0]]);
   expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.owner_designation WHERE active')).rows[0].n).toBe(0);
  }finally{await jit.end();}
 });
},120000);

it('bootstraps, elevates, acts and independently recovers an Owner with one key through genuine signup/MFA and CLI custody',async()=>{
 await isolated(async(database,runtime)=>runStaffSecurityJourney(database,runtime,1));
},120000);


it('rejects malformed fixed credential arrays and unverified, synced, held or unrelated candidate keys in SQL',async()=>{
 await isolated(async(database)=>{
  const target=await ownerCandidate(database.pool),other=await ownerCandidate(database.pool),generation=randomUUID(),verifier=digest('negative-offline-proof');
  await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery PASSWORD 'step6c1-jit-only' VALID UNTIL '${new Date(Date.now()+240000).toISOString()}'`);
  const url=new URL(database.connectionString);url.username='debateai_prod_staff_recovery';url.password='step6c1-jit-only';const jit=createPool(url.toString());
  try {
   await jit.query('SELECT staff.install_owner_recovery_generation($1,$2,$3)',[generation,verifier,randomUUID()]);
   const prepare=(credentials:unknown)=>jit.query('SELECT staff.prepare_owner_command_v2($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11)',[randomUUID(),'BOOTSTRAP',target.userId,null,null,false,credentials,randomUUID(),digest('negative-nonce'),generation,verifier]);
   for(const credentials of [[],[null],[target.credentialIds[0],null],[target.credentialIds[0],target.credentialIds[0]],[target.credentialIds[0],target.credentialIds[1],'extra'],[[target.credentialIds[0]]],`[0:0]={${target.credentialIds[0]}}`])await expect(prepare(credentials)).rejects.toThrow('STAFF_OWNER_COMMAND_INVALID');
   for(const credentials of [[other.credentialIds[0]],['unregistered-key']])await expect(prepare(credentials)).rejects.toThrow('STAFF_OWNER_CREDENTIALS_INVALID');
   const original=(await database.pool.query('SELECT to_jsonb(f) AS value FROM identity.mfa_factor f WHERE mfa_factor_id=$1',[target.keys[0]!.id])).rows[0].value;
   for(const patch of [{verified_at:null},{user_verification_required:false},{backup_eligible:true},{backup_eligible:true,backup_state:true},{state:'revoked',revoked_at:new Date().toISOString()}]){
    const factorId=randomUUID(),credentialId='key_'+factorId.replaceAll('-',''),factor={...original,mfa_factor_id:factorId,credential_id:credentialId,...patch,device_label_ciphertext:{...original.device_label_ciphertext,keyId:`passkey-label:${factorId}:v1`}};
    // Invalid candidates are inserted with their initial immutable binding; no guard is disabled.
    await database.pool.query('INSERT INTO identity.mfa_factor SELECT * FROM jsonb_populate_record(NULL::identity.mfa_factor,$1::jsonb)',[factor]);
    await expect(prepare([credentialId])).rejects.toThrow('STAFF_OWNER_CREDENTIALS_INVALID');
   }
   await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held) VALUES($1,true)',[target.userId]);await expect(prepare([target.credentialIds[0]])).rejects.toThrow('STAFF_OWNER_CREDENTIALS_INVALID');
   // CHECKs cannot accept SQL NULL or non-canonical dimensions on privileged direct insertion either.
   for(const credentials of [[null],[],[[target.credentialIds[0]]],`[0:0]={${target.credentialIds[0]}}`])await expect(database.pool.query("INSERT INTO staff.owner_command(operation_id,purpose,target_user_id,target_account_security_epoch,credential_ids,nonce_sha256) VALUES($1,'BOOTSTRAP',$2,0,$3::text[],$4)",[randomUUID(),target.userId,credentials,digest('constraint-nonce')])).rejects.toMatchObject({code:'23514'});
   expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.owner_command')).rows[0].n).toBe(0);
  }finally{await jit.end();}
 });
},120000);

it('requires both distinct matching current proofs for a fixed two-key command and never consumes an incomplete set',async()=>{
 await isolated(async(database,runtime)=>{
  const target=await ownerCandidate(database.pool),generation=randomUUID(),verifier=digest('fixed-two-offline-proof'),commandId=randomUUID(),operationId=randomUUID(),nonce=Buffer.alloc(32,9).toString('base64url');
  await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery PASSWORD 'step6c1-jit-only' VALID UNTIL '${new Date(Date.now()+240000).toISOString()}'`);
  const url=new URL(database.connectionString);url.username='debateai_prod_staff_recovery';url.password='step6c1-jit-only';const jit=createPool(url.toString());
  try {
   await jit.query('SELECT staff.install_owner_recovery_generation($1,$2,$3)',[generation,verifier,randomUUID()]);
   await jit.query('SELECT staff.prepare_owner_command_v2($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11)',[commandId,'BOOTSTRAP',target.userId,null,null,false,target.credentialIds,operationId,digest(nonce),generation,verifier]);
   const receipts=await ownerNativeReceipts(runtime,target,commandId,nonce),next=randomUUID(),nextVerifier=digest('fixed-two-next'),lineage=randomUUID();
   const commit=(selection:unknown)=>jit.query('SELECT staff.commit_owner_command($1,$2::uuid[],$3,$4,$5,$6,$7,$8,$9,$10::jsonb)',[commandId,selection,operationId,'BOOTSTRAP',generation,verifier,next,nextVerifier,lineage,{schema:'staff-alert-v1',event:'BOOTSTRAP',operationId,envelope:{v:1,keyId:'fixture',nonce:'AAAAAAAAAAAAAAAA',tag:'AAAAAAAAAAAAAAAAAAAAAA==',ct:'YQ=='}}]);
   for(const selection of [[receipts[0]],[receipts[0],receipts[0]],[receipts[0],randomUUID()],[receipts[0],null],[[receipts[0],receipts[1]]],`[0:1]={${receipts.join(',')}}`])await expect(commit(selection)).rejects.toThrow('STAFF_OWNER_RECEIPTS_INVALID');
   await expect(jit.query('SELECT staff.read_owner_receipts($1,$2::uuid[])',[commandId,[receipts[0]]])).rejects.toThrow('STAFF_OWNER_RECEIPTS_INVALID');
   const original=(await database.pool.query('SELECT credential_id FROM staff.owner_possession_receipt WHERE receipt_id=$1',[receipts[1]])).rows[0].credential_id;
   await database.pool.query('UPDATE staff.owner_possession_receipt SET credential_id=$2 WHERE receipt_id=$1',[receipts[1],'unselected-key']);await expect(commit(receipts)).rejects.toThrow('STAFF_OWNER_RECEIPTS_INVALID');await database.pool.query('UPDATE staff.owner_possession_receipt SET credential_id=$2 WHERE receipt_id=$1',[receipts[1],original]);
   await database.pool.query("UPDATE identity.mfa_factor SET state='revoked' WHERE mfa_factor_id=$1",[target.keys[1]!.id]);await expect(commit(receipts)).rejects.toThrow('STAFF_OWNER_RECEIPTS_INVALID');await database.pool.query("UPDATE identity.mfa_factor SET state='active' WHERE mfa_factor_id=$1",[target.keys[1]!.id]);
   await database.pool.query("UPDATE staff.owner_possession_receipt SET expires_at=clock_timestamp()-interval '1 second' WHERE receipt_id=$1",[receipts[1]]);await expect(commit(receipts)).rejects.toThrow('STAFF_OWNER_RECEIPTS_INVALID');
   expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.owner_possession_receipt WHERE command_id=$1 AND consumed_at IS NOT NULL',[commandId])).rows[0].n).toBe(0);
   expect((await database.pool.query('SELECT state FROM staff.owner_command WHERE command_id=$1',[commandId])).rows[0].state).toBe('PENDING');
  }finally{await jit.end();}
 });
},120000);


it('upgrades all original migrations with a pending native two-key command without rewriting its evidence or truncating its proof requirement',async()=>{
 const database=await startTestDatabase();let jit:Pool|undefined,runtime:Pool|undefined;
 try {
  const historical=await authBranchMigrationsBefore('0094_owner_one_verified_key.sql');expect(historical).toHaveLength(101);
  for(const name of historical)await database.pool.query(await readFile('migrations/'+name,'utf8'));
  await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery PASSWORD 'step6c1-upgrade-jit' VALID UNTIL '${new Date(Date.now()+240000).toISOString()}'`);
  await database.pool.query("CREATE ROLE step6c1_upgrade_runtime LOGIN PASSWORD 'step6c1-upgrade-only' IN ROLE debateai_runtime");
  const url=new URL(database.connectionString);url.username='debateai_prod_staff_recovery';url.password='step6c1-upgrade-jit';jit=createPool(url.toString());url.username='step6c1_upgrade_runtime';url.password='step6c1-upgrade-only';runtime=createPool(url.toString());
  const target=await ownerCandidate(database.pool),generation=randomUUID(),verifier=digest('upgrade-offline-proof'),commandId=randomUUID(),operationId=randomUUID(),nonce=Buffer.alloc(32,12).toString('base64url');
  await jit.query('SELECT staff.install_owner_recovery_generation($1,$2,$3)',[generation,verifier,randomUUID()]);
  await jit.query('SELECT staff.prepare_owner_command_v2($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11)',[commandId,'BOOTSTRAP',target.userId,null,null,false,target.credentialIds,operationId,digest(nonce),generation,verifier]);
  const receipts=await ownerNativeReceipts(runtime,target,commandId,nonce);
  const evidence=async()=>({command:(await database.pool.query('SELECT * FROM staff.owner_command WHERE command_id=$1',[commandId])).rows,receipts:(await database.pool.query('SELECT * FROM staff.owner_possession_receipt WHERE command_id=$1 ORDER BY receipt_id',[commandId])).rows,prerequisites:(await database.pool.query('SELECT * FROM staff.prerequisite_receipt WHERE command_id=$1 ORDER BY receipt_id',[commandId])).rows});
  const before=await evidence(),ddl=await readFile('migrations/0094_owner_one_verified_key.sql','utf8');await database.pool.query(ddl);expect(await evidence()).toEqual(before);
  const next=randomUUID(),nextVerifier=digest('upgrade-next'),lineage=randomUUID(),alert={schema:'staff-alert-v1',event:'BOOTSTRAP',operationId,envelope:{v:1,keyId:'fixture',nonce:'AAAAAAAAAAAAAAAA',tag:'AAAAAAAAAAAAAAAAAAAAAA==',ct:'YQ=='}};
  const commit=(selected:readonly string[])=>jit!.query('SELECT staff.commit_owner_command($1,$2::uuid[],$3,$4,$5,$6,$7,$8,$9,$10::jsonb) AS value',[commandId,selected,operationId,'BOOTSTRAP',generation,verifier,next,nextVerifier,lineage,alert]);
  await expect(commit([receipts[0]])).rejects.toThrow('STAFF_OWNER_RECEIPTS_INVALID');expect(await evidence()).toEqual(before);
  const ready=randomUUID();await jit.query('SELECT staff.publish_independent_alert_readiness($1,$2,$3,$4,$5)',['f'.repeat(64),ready,'fixture-only',randomUUID(),new Date(Date.now()+60000)]);await jit.query('SELECT staff.authorize_owner_alert_operation($1,$2,$3,$4)',[commandId,operationId,'f'.repeat(64),ready]);
  expect((await commit(receipts)).rows[0].value).toMatchObject({operationId,outcome:'COMPLETED'});
  const after=await evidence();expect(after.receipts.filter(row=>row.consumed_at!==null)).toHaveLength(2);expect(after.command[0].credential_ids).toEqual(target.credentialIds);
  await database.pool.query(ddl);expect(await evidence()).toEqual(after);
 }finally{await jit?.end();await runtime?.end();await database.stop();}
},120000);
