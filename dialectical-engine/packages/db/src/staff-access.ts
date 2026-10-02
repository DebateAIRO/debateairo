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
