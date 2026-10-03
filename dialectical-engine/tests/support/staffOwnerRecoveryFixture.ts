import { randomBytes, randomUUID } from 'node:crypto';
import { createPool, type Pool } from '@debateai/db';
import { ownerRecoveryVerifier } from '../../apps/runner/src/owner-recovery-material.js';
const fixtures=new WeakMap<Pool,Readonly<{generation:string;verifier:string}>>();
/** Establish independent synthetic generation BEFORE any fixture-only bootstrap marker. */
export async function initializeOwnerRecoveryFixture(admin:Pool,connectionString:string):Promise<void>{
 const generation=randomUUID(),proof=randomBytes(32),verifier=ownerRecoveryVerifier(generation,proof);proof.fill(0);
 const expiry=new Date(Date.now()+240000).toISOString();await admin.query(`ALTER ROLE debateai_prod_staff_recovery PASSWORD 'task6-initial-fixture-only' VALID UNTIL '${expiry}'`);
 const url=new URL(connectionString);url.username='debateai_prod_staff_recovery';url.password='task6-initial-fixture-only';const jit=createPool(url.toString());
 try{await jit.query('SELECT staff.install_owner_recovery_generation($1,$2,$3)',[generation,verifier,randomUUID()]);fixtures.set(admin,{generation,verifier});}
 finally{await jit.end();await admin.query("ALTER ROLE debateai_prod_staff_recovery PASSWORD NULL VALID UNTIL '-infinity'");}
}
/** Existing trusted Task2/3 fixture inputs, routed through genuine generation-gated prepare. */
export async function prepareOwnerRecoveryFixture(admin:Pool,jit:Pool,input:Readonly<{purpose:'BOOTSTRAP'|'RECOVER_OWNER';targetUserId:string;previousUserId:string|null;credentialIds:readonly string[];operationId:string;nonceHash:string}>):Promise<unknown>{
 const material=fixtures.get(admin);if(material===undefined)throw new Error('OWNER_RECOVERY_FIXTURE_NOT_INITIALIZED');let lineage:string|null=null;
 if(input.purpose==='RECOVER_OWNER'){
  const current=(await admin.query('SELECT s.staff_id FROM staff.subject s JOIN staff.owner_designation d USING(staff_id) WHERE s.user_id=$1 AND d.active',[input.previousUserId])).rows[0];if(!current)throw new Error('OWNER_CURRENT_FIXTURE_MISSING');
  lineage=randomUUID();await admin.query('INSERT INTO staff.owner_lineage(singleton,lineage_id,staff_id) VALUES(true,$1,$2) ON CONFLICT(singleton) DO UPDATE SET lineage_id=EXCLUDED.lineage_id,staff_id=EXCLUDED.staff_id',[lineage,current.staff_id]);
 }else{
  // These native-verifier tests create staff contexts directly, never commit an Owner.
  // Retire their prior designation fixtures before the separate first-Owner command.
  await admin.query('UPDATE staff.owner_designation SET active=false WHERE active');
 }
 return (await jit.query('SELECT staff.prepare_owner_command_v2($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11) AS value',[randomUUID(),input.purpose,input.targetUserId,lineage,input.previousUserId,false,input.credentialIds,input.operationId,input.nonceHash,material.generation,material.verifier])).rows[0].value;
}
