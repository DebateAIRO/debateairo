import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { InvitationContext,InvitationProof,OwnerPossessionContext,Reason,SecurityReceipt,StaffCapability,StaffContext,StaffProof } from '@debateai/kernel';
import type { CryptoEnvelope } from '@debateai/crypto';

/** Internal encrypted intent: constructed by the trusted alert application, never a browser DTO. */
export type StaffAlertIntent=Readonly<{schema:'staff-alert-v1';event:'INVITE'|'ACCEPT'|'GRANT'|'DISABLE'|'BOOTSTRAP'|'RECOVER_OWNER'|'KEY_CHANGE';operationId:string;envelope:CryptoEnvelope}>;
export type StaffInvitationDeliveryIntent=Readonly<{schema:'staff-invitation-delivery-v1';operationId:string;envelope:CryptoEnvelope}>;
export type StaffMutation=Readonly<{actor:StaffContext;proof:StaffProof;operationId:string;reason:Reason;alertIntent:StaffAlertIntent}>;
export type InvitationAcceptCommand=Readonly<{context:InvitationContext;proof:InvitationProof;operationId:string;reason:Reason;alertIntent:StaffAlertIntent}>;
export type StaffAuthenticationRecord = Readonly<{ context:StaffContext; csrfTokenHash:string; expiresAt:Date }>;
/** Only narrow authority reads use this deadline; no pool/global database setting changes.
 * Abort destroys this dedicated connection, including a blocked query. A late acquired
 * connection is released without running SQL, so a cancelled poll cannot admit work. */
export async function guardedAuthorityQuery<T extends QueryResultRow>(pool:Pool, sql:string, values:readonly unknown[], signal?:AbortSignal):Promise<QueryResult<T>> {
 let client:PoolClient|undefined; let released=false; let stopped=false;
 let refuse:(error:Error)=>void=()=>{};
 const cancelled=new Promise<never>((_resolve,reject)=>{refuse=reject;});
 const abort=()=>{if(stopped)return;stopped=true;if(client!==undefined&&!released){released=true;client.release(true);}refuse(new Error('AUTHORITY_CHECK_UNAVAILABLE'));};
 const timer=setTimeout(abort,750);
 signal?.addEventListener('abort',abort,{once:true});
 if(signal?.aborted)abort();
 const work=(async()=>{
  const acquired=await pool.connect();client=acquired;
  if(stopped){if(!released){released=true;acquired.release(true);}throw new Error('AUTHORITY_CHECK_UNAVAILABLE');}
  try {
   await acquired.query('BEGIN');
   await acquired.query("SET LOCAL statement_timeout='700ms'");
   const result=await acquired.query<T>(sql,[...values]);
   await acquired.query('COMMIT');return result;
  } catch(error) { if(!released)await acquired.query('ROLLBACK').catch(()=>undefined);throw error; }
  finally {if(!released){released=true;acquired.release();}}
 })();
 try {return await Promise.race([work,cancelled]);}
 finally {stopped=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export interface StaffRepository {
 readAuthentication(input:Readonly<{userId:string;ordinarySessionId:string;ordinaryTokenHash:string;staffTokenHash:string}>,signal?:AbortSignal):Promise<StaffAuthenticationRecord|null>;
 readCurrentContext(input:Readonly<{context:StaffContext;ordinaryTokenHash:string}>,signal?:AbortSignal):Promise<StaffAuthenticationRecord|null>;
 readActionProof(input:Readonly<{context:StaffContext;ordinaryTokenHash:string;proofHandleHash:string;binding:import('@debateai/kernel').ActionBinding}>,signal?:AbortSignal):Promise<StaffProof|null>;
 subscribeRevocations?(listener:()=>void):()=>void;
 readContext(input:Readonly<{userId:string;ordinarySessionId:string;staffTokenHash:string}>):Promise<StaffContext|null>;
 /** Capability-only persistent authority check; mutations validate and consume action proof separately. */
 authorize(input:Readonly<{context:StaffContext;capability:StaffCapability}>):Promise<boolean>;
 invite(input:StaffMutation&Readonly<{targetUserId:string;capabilities:readonly StaffCapability[];invitationTokenHash:string;deliveryIntent:StaffInvitationDeliveryIntent}>):Promise<SecurityReceipt>;
 readInvitationContext(input:Readonly<{targetUserId:string;ordinarySessionId:string;invitationTokenHash:string}>):Promise<InvitationContext|null>;
 accept(input:InvitationAcceptCommand):Promise<SecurityReceipt>;
 storeInvitationProof(input:Readonly<{context:InvitationContext;challengeId:string;credentialId:string;newCounter:number;rpId:string;origin:string}>):Promise<InvitationProof>;
 readOwnerPossessionContext(input:Readonly<{userId:string;ordinarySessionId:string;commandId:string;nonceHash:string;credentialId:string;prerequisiteHandleHash:string}>):Promise<OwnerPossessionContext|null>;
 storeOwnerPossessionReceipt(input:Readonly<{context:OwnerPossessionContext;challengeId:string;credentialId:string;newCounter:number;rpId:string;origin:string}>):Promise<Readonly<{receiptId:string}>>;
 grant(input:StaffMutation&Readonly<{targetStaffId:string;capabilities:readonly StaffCapability[]}>):Promise<SecurityReceipt>;
 disable(input:StaffMutation&Readonly<{targetStaffId:string;mode:'OFFBOARD'|'COMPROMISE'}>):Promise<SecurityReceipt>;
}
export type StaffCredentialTransport = 'usb' | 'nfc' | 'ble' | 'internal' | 'hybrid' | 'cable' | 'smart-card';

export type StaffOrdinarySession = Readonly<{
    userId: string;
    ordinarySessionId: string;
}>;

export type StaffCeremonyPurpose = 'REGISTRATION' | 'ELEVATION' | 'ACTION' | 'INVITATION_ACCEPT' | 'OWNER_POSSESSION';

export type StaffCeremonyScope = Readonly<Record<string, never>> | Readonly<{
    kind: 'PREREQUISITE';
    prerequisiteHandleHash: string;
}> | Readonly<{
    kind: 'STAFF_PROOF';
    proofHandleHash: string;
}> | Readonly<{
    invitationTokenHash: string;
}> | Readonly<{
    commandId: string;
    nonceHash: string;
    credentialId: string;
    prerequisiteHandleHash: string;
}> | Readonly<{
    commandId: string;
    nonceHash: string;
    credentialId: string;
}>;

export type StaffCeremonyContext = StaffContext | InvitationContext | OwnerPossessionContext;

export type StaffCeremonyRead = StaffOrdinarySession & Readonly<{
    purpose: StaffCeremonyPurpose;
    handleHash: string;
    context: StaffCeremonyContext | null;
    binding: import('@debateai/kernel').ActionBinding | null;
    scope: StaffCeremonyScope | null;
}>;

export type StaffCeremonyChallenge = Readonly<{
    challengeId: string;
    challengeSha256: string;
    expiresAt: Date;
    rpId: string;
    origin: string;
    operationId: string | null;
    scope: StaffCeremonyScope;
    allowedCredentialIds: readonly string[];
}>;

export type StaffCeremonyBegin = Omit<StaffCeremonyRead, 'handleHash'> & Readonly<{
    challengeHash: string;
    handleHash: string;
    rpId: string;
    origin: string;
    userHandleHash: string | null;
    operationId: string | null;
    scope: StaffCeremonyScope;
}>;

export type StaffOwnedCredential = Readonly<{
    credentialId: string;
    publicKey: string;
    counter: number;
    userHandleSha256: string;
}>;

export type StaffEnrollmentIntentBinding = StaffOrdinarySession & Readonly<{
    operationId: string;
    factorId: string;
    credentialId: string;
}>;

export type StaffEnrollmentIntentFactory = (binding: StaffEnrollmentIntentBinding) => Promise<StaffEnrollmentIntent>;

export type StaffEnrollmentIntent = Readonly<{
    operationId: string;
    factorId: string;
    deviceLabelEnvelope: CryptoEnvelope;
    alertIntent: StaffAlertIntent;
}>;

export type StaffAssertionCompletion = StaffOrdinarySession & Readonly<{
    challengeId: string;
    credentialId: string;
    newCounter: number;
    rpId: string;
    origin: string;
    purpose: Exclude<StaffCeremonyPurpose, 'REGISTRATION'>;
    context: StaffCeremonyContext | null;
    binding: import('@debateai/kernel').ActionBinding | null;
    scope: StaffCeremonyScope;
    tokenHash: string | null;
    csrfHash: string | null;
}>;

/** Narrow trusted verifier seam; no uploaded verified flag or proof JSON is accepted. */
export interface StaffWebAuthnRepository {
    beginWebAuthn(input: StaffCeremonyBegin): Promise<Readonly<{
        challengeId: string;
        expiresAt: Date;
        credentials: readonly Readonly<{
            id: string;
            type: 'public-key';
            transports: readonly StaffCredentialTransport[];
        }>[];
    }>>;
    readWebAuthnChallenge(input: StaffCeremonyRead): Promise<StaffCeremonyChallenge | null>;
    readWebAuthnCredential(input: StaffOrdinarySession & Readonly<{
        challengeId: string;
        credentialId: string;
    }>): Promise<StaffOwnedCredential | null>;
    failWebAuthn(input: StaffOrdinarySession & Readonly<{
        challengeId: string;
    }>): Promise<void>;
    completeWebAuthnRegistration(input: StaffOrdinarySession & StaffEnrollmentIntent & Readonly<{
        challengeId: string;
        credentialId: string;
        publicKey: string;
        newCounter: number;
        transports: readonly StaffCredentialTransport[];
    }>): Promise<Readonly<{
        receipt: SecurityReceipt;
        credentialId: string;
    }>>;
    completeWebAuthnAssertion(input: StaffAssertionCompletion): Promise<Readonly<{
        context: StaffContext;
        expiresAt: Date;
    }> | StaffProof | InvitationProof | Readonly<{
        receiptId: string;
        expiresAt: Date;
    }>>;
}


function date(value:unknown):Date {
 const result=new Date(value as string);if(!Number.isFinite(result.getTime()))throw new Error('STAFF_DATABASE_TIMESTAMP_INVALID');return result;
}
function receipt(value:SecurityReceipt):SecurityReceipt {return Object.freeze({...value,recordedAt:date(value.recordedAt)});}
function invitation(value:InvitationContext):InvitationContext {return Object.freeze({...value,expiresAt:date(value.expiresAt)});}
/** This adapter accepts trusted server-domain inputs; SQL owns all security clocks/state. */
export class PostgresStaffRepository implements StaffRepository,StaffWebAuthnRepository {
 constructor(private readonly pool:Pool) {}
 private async guarded<T>(sql:string,values:readonly unknown[],signal?:AbortSignal):Promise<T> {
  const result=await guardedAuthorityQuery<{value:T}>(this.pool,sql,values,signal);
  if(result.rows[0]===undefined)throw new Error('STAFF_DATABASE_RESULT_MISSING');return result.rows[0].value;
 }
 private authentication(value:StaffAuthenticationRecord|null):StaffAuthenticationRecord|null {
  return value===null?null:Object.freeze({...value,context:Object.freeze({...value.context,capabilities:Object.freeze([...value.context.capabilities])}),expiresAt:date(value.expiresAt)});
 }
 async readAuthentication(input:Parameters<StaffRepository['readAuthentication']>[0],signal?:AbortSignal):Promise<StaffAuthenticationRecord|null> {
  return this.authentication(await this.guarded('SELECT staff.read_authentication($1,$2,$3,$4) AS value',[input.userId,input.ordinarySessionId,input.ordinaryTokenHash,input.staffTokenHash],signal));
 }
 async readCurrentContext(input:Parameters<StaffRepository['readCurrentContext']>[0],signal?:AbortSignal):Promise<StaffAuthenticationRecord|null> {
  return this.authentication(await this.guarded('SELECT staff.read_current_context($1::jsonb,$2) AS value',[input.context,input.ordinaryTokenHash],signal));
 }
 async readActionProof(input:Parameters<StaffRepository['readActionProof']>[0],signal?:AbortSignal):Promise<StaffProof|null> {
  const value=await this.guarded<StaffProof|null>('SELECT staff.read_action_proof($1::jsonb,$2,$3,$4::jsonb) AS value',[input.context,input.ordinaryTokenHash,input.proofHandleHash,input.binding],signal);
  return value===null?null:Object.freeze({...value,verifiedAt:date(value.verifiedAt),expiresAt:date(value.expiresAt)});
 }
 subscribeRevocations(listener:()=>void):()=>void {
  let disposed=false;let client:PoolClient|undefined;
  const notify=(message:Readonly<{channel:string;payload?:string|undefined}>)=>{if(!disposed&&message.channel==='staff_authority_changed'&&message.payload==='changed')listener();};
  const failed=()=>{if(!disposed)listener();};
  void this.pool.connect().then(async acquired=>{
   if(disposed){acquired.release();return;}client=acquired;
   acquired.on('notification',notify);acquired.on('error',failed);
   try {await acquired.query('LISTEN staff_authority_changed');}
   catch {failed();dispose();}
  }).catch(failed);
  const dispose=()=>{if(disposed)return;disposed=true;if(client!==undefined){client.removeListener('notification',notify);client.removeListener('error',failed);client.release(true);client=undefined;}};
  return dispose;
 }

 private async call<T>(sql:string,values:readonly unknown[]):Promise<T> {
  const result=await this.pool.query<{value:T}>(sql,[...values]);
  if(result.rows[0]===undefined)throw new Error('STAFF_DATABASE_RESULT_MISSING');return result.rows[0].value;
 }
 async readContext(input:Parameters<StaffRepository['readContext']>[0]):Promise<StaffContext|null> {
  const value=await this.call<StaffContext|null>('SELECT staff.read_context($1,$2,$3) AS value',[input.userId,input.ordinarySessionId,input.staffTokenHash]);
  return value===null?null:Object.freeze({...value,capabilities:Object.freeze([...value.capabilities])});
 }
 authorize(input:Parameters<StaffRepository['authorize']>[0]):Promise<boolean> {
  return this.call('SELECT staff.authorize_action($1::jsonb,$2) AS value',[input.context,input.capability]);
 }
 async invite(input:Parameters<StaffRepository['invite']>[0]):Promise<SecurityReceipt> {
  return receipt(await this.call('SELECT staff.invite($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8,$9::jsonb,$10::jsonb) AS value',[input.actor,input.proof.proofId,input.proof.binding,input.targetUserId,input.capabilities,input.operationId,input.reason,input.invitationTokenHash,input.alertIntent,input.deliveryIntent]));
 }
 async readInvitationContext(input:Parameters<StaffRepository['readInvitationContext']>[0]):Promise<InvitationContext|null> {
  const value=await this.call<InvitationContext|null>('SELECT staff.read_invitation_context($1,$2,$3) AS value',[input.targetUserId,input.ordinarySessionId,input.invitationTokenHash]);return value===null?null:invitation(value);
 }
 async accept(input:InvitationAcceptCommand):Promise<SecurityReceipt> {
  return receipt(await this.call('SELECT staff.accept($1,$2,$3,$4,$5::jsonb,$6::jsonb) AS value',[input.context.invitationId,input.context.targetUserId,input.context.ordinarySessionId,input.proof.proofId,{operationId:input.operationId,reason:input.reason},input.alertIntent]));
 }
 async storeInvitationProof(input:Parameters<StaffRepository['storeInvitationProof']>[0]):Promise<InvitationProof> {
  const value=await this.call<InvitationProof>('SELECT staff.complete_invitation_proof($1,$2,$3,$4,$5::bigint,$6,$7) AS value',[input.challengeId,input.context.targetUserId,input.context.ordinarySessionId,input.credentialId,input.newCounter,input.rpId,input.origin]);
  return Object.freeze({...value,context:invitation(value.context),verifiedAt:date(value.verifiedAt),expiresAt:date(value.expiresAt)});
 }
 async readOwnerPossessionContext(input:Parameters<StaffRepository['readOwnerPossessionContext']>[0]):Promise<OwnerPossessionContext|null> {
  const value=await this.call<OwnerPossessionContext|null>('SELECT staff.read_owner_possession_context($1,$2,$3,$4,$5,$6) AS value',[input.userId,input.ordinarySessionId,input.commandId,input.nonceHash,input.credentialId,input.prerequisiteHandleHash]);
  return value===null?null:Object.freeze({...value,command:Object.freeze({...value.command,credentialIds:Object.freeze([...value.command.credentialIds]) as readonly [string,string],expiresAt:date(value.command.expiresAt)})});
 }
 storeOwnerPossessionReceipt(input:Parameters<StaffRepository['storeOwnerPossessionReceipt']>[0]):Promise<Readonly<{receiptId:string}>> {
  return this.call('SELECT staff.complete_owner_possession($1,$2,$3,$4,$5::bigint,$6,$7) AS value',[input.challengeId,input.context.command.targetUserId,input.context.ordinarySessionId,input.credentialId,input.newCounter,input.rpId,input.origin]);
 }
async beginWebAuthn(input: StaffCeremonyBegin): ReturnType<StaffWebAuthnRepository['beginWebAuthn']> {
    const value = await this.call<Awaited<ReturnType<StaffWebAuthnRepository['beginWebAuthn']>>>('SELECT staff.begin_owned_webauthn($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb) AS value', [input.userId, input.ordinarySessionId, input.purpose, input.challengeHash, input.handleHash, input.rpId, input.origin, input.userHandleHash, input.operationId, input.context, input.binding, input.scope]);
    return Object.freeze({ ...value, expiresAt: date(value.expiresAt) });
}

async readWebAuthnChallenge(input: StaffCeremonyRead): Promise<StaffCeremonyChallenge | null> {
    const value = await this.call<StaffCeremonyChallenge | null>('SELECT staff.read_owned_webauthn_challenge($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) AS value', [input.userId, input.ordinarySessionId, input.handleHash, input.purpose, input.context, input.binding, input.scope]);
    return value === null ? null : Object.freeze({ ...value, expiresAt: date(value.expiresAt) });
}

readWebAuthnCredential(input: StaffOrdinarySession & Readonly<{
    challengeId: string;
    credentialId: string;
}>): Promise<StaffOwnedCredential | null> { return this.call('SELECT identity.staff_read_owned_webauthn_key($1,$2,$3,$4) AS value', [input.userId, input.ordinarySessionId, input.challengeId, input.credentialId]); }

async failWebAuthn(input: StaffOrdinarySession & Readonly<{
    challengeId: string;
}>): Promise<void> { await this.call('SELECT staff.fail_owned_webauthn($1,$2,$3) AS value', [input.userId, input.ordinarySessionId, input.challengeId]); }

async completeWebAuthnRegistration(input: Parameters<StaffWebAuthnRepository['completeWebAuthnRegistration']>[0]): ReturnType<StaffWebAuthnRepository['completeWebAuthnRegistration']> {
    const value = await this.call<Awaited<ReturnType<StaffWebAuthnRepository['completeWebAuthnRegistration']>>>('SELECT staff.complete_owned_webauthn_registration($1,$2,$3,$4,$5,$6,$7,$8::bigint,$9::jsonb,$10::text[],$11::jsonb) AS value', [input.userId, input.ordinarySessionId, input.challengeId, input.operationId, input.factorId, input.credentialId, input.publicKey, input.newCounter, input.deviceLabelEnvelope, input.transports, input.alertIntent]);
    return Object.freeze({ ...value, receipt: receipt(value.receipt) });
}

async completeWebAuthnAssertion(input: StaffAssertionCompletion): ReturnType<StaffWebAuthnRepository['completeWebAuthnAssertion']> {
    const value = await this.call<Awaited<ReturnType<StaffWebAuthnRepository['completeWebAuthnAssertion']>>>('SELECT staff.complete_owned_webauthn_assertion($1,$2,$3,$4,$5::bigint,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13) AS value', [input.userId, input.ordinarySessionId, input.challengeId, input.credentialId, input.newCounter, input.rpId, input.origin, input.purpose, input.context, input.binding, input.scope, input.tokenHash, input.csrfHash]);
    const hydrated = { ...value, expiresAt: date(value.expiresAt) };
    if ('verifiedAt' in value)
        return Object.freeze({ ...hydrated, verifiedAt: date(value.verifiedAt), ...('purpose' in value ? { context: invitation(value.context) } : {}) }) as StaffProof | InvitationProof;
    return Object.freeze(hydrated);
}

 async grant(input:Parameters<StaffRepository['grant']>[0]):Promise<SecurityReceipt> {
  return receipt(await this.call('SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb) AS value',[input.actor,input.proof.proofId,input.proof.binding,input.targetStaffId,input.capabilities,input.operationId,input.reason,input.alertIntent]));
 }
 async disable(input:Parameters<StaffRepository['disable']>[0]):Promise<SecurityReceipt> {
  return receipt(await this.call('SELECT staff.disable($1::jsonb,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8::jsonb) AS value',[input.actor,input.proof.proofId,input.proof.binding,input.targetStaffId,input.mode,input.operationId,input.reason,input.alertIntent]));
 }
}

export type StaffAlertPurpose = 'INDEPENDENT_METADATA_ALERT' | 'TARGET_INVITATION';
export type StaffAlertFailureCode = 'TRANSPORT_UNAVAILABLE' | 'TIMEOUT' | 'DESTINATION_REJECTED' | 'ACK_UNAVAILABLE' | 'PAYLOAD_INVALID' | 'KEY_UNAVAILABLE';
export type StaffAlertKeyMapping = Readonly<{userId:string;keyRef:string}>;
export type StaffAlertReadinessBinding = Readonly<{configSha256:string;generation:string}>;
export type StaffAlertClaim = Readonly<{outboxId:string;eventId:string;operationId:string;event:StaffAlertIntent['event'];purpose:StaffAlertPurpose;keyRef:string;envelope:CryptoEnvelope;claimToken:string;attempt:number}>;
export type StaffClaimKeyState = Readonly<{state:'CURRENT';mapping:StaffAlertKeyMapping}> | Readonly<{state:'SEVERED'|'UNAVAILABLE'}>;
export interface StaffAlertKeyMappings {resolveUser(userId:string):Promise<StaffAlertKeyMapping|null>}
export interface StaffAlertRepository extends StaffAlertKeyMappings {
 authorizeOperation(operationId:string,binding:StaffAlertReadinessBinding):Promise<boolean>;
 readIndependentAlertReadiness(binding:StaffAlertReadinessBinding):Promise<'READY'|'UNAVAILABLE'>;
 claim(limit:number):Promise<readonly StaffAlertClaim[]>;
 resolveClaim(claim:StaffAlertClaim):Promise<StaffClaimKeyState>;
 settle(claim:StaffAlertClaim,outcome:'DELIVERED'|'FAILED'|'SEVERED',failure:StaffAlertFailureCode|'SEVERED'|null):Promise<boolean>;
 status():Promise<Readonly<{pending:number;acked:number;severed:number;exhausted:number}>>;
}
/** Enumerated definer calls only. Caller cannot upload an outbox payload or receipt body. */
export class PostgresStaffAlertRepository implements StaffAlertRepository {
 constructor(private readonly pool:Pool){}
 private async value<T>(sql:string,values:readonly unknown[]=[]):Promise<T>{const r=await guardedAuthorityQuery<{value:T}>(this.pool,sql,values);if(!r.rows[0])throw new Error('STAFF_ALERT_DATABASE_UNAVAILABLE');return r.rows[0].value;}
 resolveUser(userId:string):Promise<StaffAlertKeyMapping|null>{return this.value('SELECT staff.read_alert_user_mapping($1) AS value',[userId]);}
 authorizeOperation(operationId:string,binding:StaffAlertReadinessBinding):Promise<boolean>{return this.value('SELECT staff.authorize_alert_operation($1,$2,$3) AS value',[operationId,binding.configSha256,binding.generation]);}
 readIndependentAlertReadiness(binding:StaffAlertReadinessBinding):Promise<'READY'|'UNAVAILABLE'>{return this.value('SELECT staff.read_independent_alert_readiness($1,$2) AS value',[binding.configSha256,binding.generation]);}
 claim(limit:number):Promise<readonly StaffAlertClaim[]>{return this.value('SELECT staff.claim_alert_delivery($1) AS value',[limit]);}
 resolveClaim(claim:StaffAlertClaim):Promise<StaffClaimKeyState>{return this.value('SELECT staff.read_alert_key_mapping($1,$2) AS value',[claim.outboxId,claim.claimToken]);}
 settle(claim:StaffAlertClaim,outcome:'DELIVERED'|'FAILED'|'SEVERED',failure:StaffAlertFailureCode|'SEVERED'|null):Promise<boolean>{return this.value('SELECT staff.settle_alert_delivery($1,$2,$3,$4) AS value',[claim.outboxId,claim.claimToken,outcome,failure]);}
 status():ReturnType<StaffAlertRepository['status']>{return this.value('SELECT staff.read_alert_delivery_status() AS value');}
}

export interface StaffIndependentReadinessPublisher {
 publish(input:StaffAlertReadinessBinding&Readonly<{ackAdapterId:string;rehearsalId:string;evidenceExpiresAt:Date}>):Promise<boolean>;
 revoke(generation:string):Promise<boolean>;
}
/** Instantiate only with the independently opened existing closed JIT principal. */
export class PostgresStaffIndependentReadinessPublisher implements StaffIndependentReadinessPublisher {
 constructor(private readonly pool:Pool){}
 async publish(input:Parameters<StaffIndependentReadinessPublisher['publish']>[0]):Promise<boolean>{const result=await guardedAuthorityQuery<{value:boolean}>(this.pool,'SELECT staff.publish_independent_alert_readiness($1,$2,$3,$4,$5) AS value',[input.configSha256,input.generation,input.ackAdapterId,input.rehearsalId,input.evidenceExpiresAt]);return result.rows[0]?.value===true;}
 async revoke(generation:string):Promise<boolean>{const result=await guardedAuthorityQuery<{value:boolean}>(this.pool,'SELECT staff.revoke_independent_alert_readiness($1) AS value',[generation]);return result.rows[0]?.value===true;}
}
