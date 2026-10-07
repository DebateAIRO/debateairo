import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PostgresStaffRepository, type Pool } from '@debateai/db';
import { StaffWebAuthnService } from '../../apps/api/src/staff/webauthn.js';
import { b64, digest, fixture, key, origin, rpId } from './staffWebAuthnFixtures.js';

/** Disposable fixture only: real native signatures and persisted factor rotation, never hardware. */
export async function ownerCandidate(admin:Pool) {
 const userId=randomUUID(),ordinarySessionId=randomUUID(),factorId=randomUUID();
 await admin.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1,$2,'{}','{}','task6-synthetic-password',$3,'active',now())`,[userId,createHash('sha256').update(userId).digest(),userId]);
 await admin.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`,[userId]);
 await admin.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step) VALUES($1,$2,'totp','{}','active',now(),now(),1)`,[factorId,userId]);
 await admin.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at) VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`,[ordinarySessionId,userId,digest(ordinarySessionId),digest('csrf'+ordinarySessionId)]);
 const keys=[];
 for(let i=0;i<2;i++) {
  const k=key(),f=fixture(k,1,randomBytes(32)),id=randomUUID();
  await admin.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter) VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),$5,$6,true,false,false,$7,0)`,[id,userId,f.expected.credentialId,{format:'COSE_KEY_BASE64URL_V1',value:b64(k.wire)},rpId,origin,{v:1,keyId:`passkey-label:${id}:v1`,nonce:'AAAAAAAAAAAAAAAA',tag:'AAAAAAAAAAAAAAAAAAAAAA==',ct:'YQ=='}]);
  await admin.query(`INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256,transports) VALUES($1,$2,$3,ARRAY['usb'])`,[id,userId,digest(f.handle)]);keys.push({f,id});
 }
 const ownerRef=(await admin.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1',[userId])).rows[0].owner_ref as string;
 return {userId,ordinarySessionId,factorId,ownerRef,keys,credentialIds:[keys[0]!.f.expected.credentialId,keys[1]!.f.expected.credentialId] as readonly [string,string]};
}
export type OwnerCandidate=Awaited<ReturnType<typeof ownerCandidate>>;
export async function ownerNativeReceipts(runtime:Pool,a:OwnerCandidate,commandId:string,nonce:string) {
 const handle=b64(randomBytes(32)),replacement=digest(randomBytes(32));
 await runtime.query('SELECT staff.step_up_prerequisite($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15)',[a.userId,a.ownerRef,'task6-synthetic-password',a.factorId,2,a.ordinarySessionId,digest(a.ordinarySessionId),replacement,digest(randomBytes(32)),{}, {ipArgon2id:'argon2id-audit:v1:'+'0'.repeat(64),userAgentArgon2id:'argon2id-audit:v1:'+'1'.repeat(64)},digest(handle),'OWNER_POSSESSION',commandId,digest(nonce)]);
 const repository=new PostgresStaffRepository(runtime),service=new StaffWebAuthnService(repository,{publicAppUrl:origin});
 const context=await repository.readOwnerPossessionContext({...a,commandId,nonceHash:digest(nonce),credentialId:a.credentialIds[0],prerequisiteHandleHash:digest(handle)});
 if(context===null)throw new Error('SYNTHETIC_OWNER_CONTEXT_MISSING');
 const receipts=[];
 for(const selected of a.keys) {
  const selection={commandNonce:nonce,credentialId:selected.f.expected.credentialId,prerequisiteHandle:handle};
  const options=await service.beginOwnerPossession(context,selection);
  const assertion=selected.f.assertion({client:Buffer.from(JSON.stringify({type:'webauthn.get',challenge:options.options.challenge,origin})),auth:selected.f.auth(5,1)});
  receipts.push(await service.finishOwnerPossession(a,{challenge_handle:options.challenge_handle,credential:assertion,command_id:commandId,command_nonce:nonce,credential_id:selection.credentialId}));
 }
 return [receipts[0]!.receiptId,receipts[1]!.receiptId] as readonly [string,string];
}
