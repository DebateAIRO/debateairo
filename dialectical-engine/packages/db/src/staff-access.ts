import type { Pool } from 'pg';
import type { InvitationContext,InvitationProof,OwnerPossessionContext,Reason,SecurityReceipt,StaffCapability,StaffContext,StaffProof } from '@debateai/kernel';
import type { CryptoEnvelope } from '@debateai/crypto';

/** Internal encrypted intent: constructed by the trusted alert application, never a browser DTO. */
export type StaffAlertIntent=Readonly<{schema:'staff-alert-v1';event:'INVITE'|'ACCEPT'|'GRANT'|'DISABLE'|'BOOTSTRAP'|'RECOVER_OWNER'|'KEY_CHANGE';operationId:string;envelope:CryptoEnvelope}>;
export type StaffInvitationDeliveryIntent=Readonly<{schema:'staff-invitation-delivery-v1';operationId:string;envelope:CryptoEnvelope}>;
export type StaffMutation=Readonly<{actor:StaffContext;proof:StaffProof;operationId:string;reason:Reason;alertIntent:StaffAlertIntent}>;
export type InvitationAcceptCommand=Readonly<{context:InvitationContext;proof:InvitationProof;operationId:string;reason:Reason;alertIntent:StaffAlertIntent}>;
export interface StaffRepository {
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
function date(value:unknown):Date {
 const result=new Date(value as string);if(!Number.isFinite(result.getTime()))throw new Error('STAFF_DATABASE_TIMESTAMP_INVALID');return result;
}
function receipt(value:SecurityReceipt):SecurityReceipt {return Object.freeze({...value,recordedAt:date(value.recordedAt)});}
function invitation(value:InvitationContext):InvitationContext {return Object.freeze({...value,expiresAt:date(value.expiresAt)});}
/** This adapter accepts trusted server-domain inputs; SQL owns all security clocks/state. */
export class PostgresStaffRepository implements StaffRepository {
 constructor(private readonly pool:Pool) {}
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
 async grant(input:Parameters<StaffRepository['grant']>[0]):Promise<SecurityReceipt> {
  return receipt(await this.call('SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb) AS value',[input.actor,input.proof.proofId,input.proof.binding,input.targetStaffId,input.capabilities,input.operationId,input.reason,input.alertIntent]));
 }
 async disable(input:Parameters<StaffRepository['disable']>[0]):Promise<SecurityReceipt> {
  return receipt(await this.call('SELECT staff.disable($1::jsonb,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8::jsonb) AS value',[input.actor,input.proof.proofId,input.proof.binding,input.targetStaffId,input.mode,input.operationId,input.reason,input.alertIntent]));
 }
}
