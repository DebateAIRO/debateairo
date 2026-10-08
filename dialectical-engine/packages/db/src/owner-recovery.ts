import type { Pool } from 'pg';
import type { OwnerCommand, OwnerCredentialSet, OwnerPossessionReceipt, SecurityReceipt } from '@debateai/kernel';
import type { StaffAlertIntent, StaffAlertKeyMapping, StaffAlertReadinessBinding } from './staff-access.js';
import { guardedAuthorityQuery } from './staff-access.js';
export type OwnerCommandPurpose = OwnerCommand['purpose'];
export type OwnerPredecessor = Readonly<{
    lineageId: string;
}> & (Readonly<{
    kind: 'LIVE';
    userId: string;
}> | Readonly<{
    kind: 'ERASED';
}>);
export type OwnerCommandInput = Readonly<{
    commandId: string;
    operationId: string;
    targetUserId: string;
    credentialIds: OwnerCredentialSet;
}> & (Readonly<{
    purpose: 'BOOTSTRAP';
    predecessor?: never;
}> | Readonly<{
    purpose: 'RECOVER_OWNER';
    predecessor: OwnerPredecessor;
}>);
export type OwnerRecoveryProofBinding = Readonly<{
    generation: string;
    verifier: string;
}>;
export type OwnerRecoveryRotation = OwnerRecoveryProofBinding & Readonly<{
    nextGeneration: string;
    nextVerifier: string;
    nextLineageId: string;
}>;
export type PreparedOwnerCommand = OwnerCommand & Readonly<{
    operationId: string;
    generation: string;
    previousOwnerLineageId?: string;
    previousErased: boolean;
    createdAt: Date;
    state: 'PENDING' | 'COMMITTED' | 'CANCELLED';
}>;
export type StoredOwnerPossessionReceipt = OwnerPossessionReceipt & Readonly<{
    consumedAt: Date | null;
}>;
export type OwnerCommitInput = Readonly<{
    commandId: string;
    receiptIds: OwnerCredentialSet;
    operationId: string;
    purpose: OwnerCommandPurpose;
}>;
export type OwnerAlertMetadata = Readonly<{
    commandId: string;
    operationId: string;
    targetUserId: string;
    keyRef: string;
    event: OwnerCommandPurpose;
    actorStaffId: null;
    subjectStaffId: null;
    reason: Readonly<{
        code: 'BOOTSTRAP' | 'RECOVERY';
    }>;
}>;
export interface OwnerCommandRepository {
    install(input: OwnerRecoveryProofBinding & Readonly<{
        operationId: string;
    }>): Promise<SecurityReceipt>;
    prepare(input: OwnerCommandInput & OwnerRecoveryProofBinding, nonceHash: string): Promise<Readonly<{
        commandId: string;
        expiresAt: Date;
    }>>;
    read(commandId: string): Promise<PreparedOwnerCommand | null>;
    readReceipts(commandId: string, receiptIds: OwnerCredentialSet): Promise<readonly StoredOwnerPossessionReceipt[]>;
    commit(input: OwnerCommitInput, rotation: OwnerRecoveryRotation, alertIntent: StaffAlertIntent): Promise<SecurityReceipt>;
    readCommitted(input: OwnerCommitInput, rotation: Omit<OwnerRecoveryRotation, 'verifier'>): Promise<SecurityReceipt | null>;
    readAlertMetadata(commandId: string, operationId: string): Promise<OwnerAlertMetadata | null>;
    authorizeAlert(commandId: string, operationId: string, binding: StaffAlertReadinessBinding): Promise<boolean>;
}
const date = (v: unknown): Date => {
    const d = new Date(v as string);
    if (!Number.isFinite(d.getTime()))
        throw new Error('OWNER_DATABASE_RESULT_INVALID');
    return d;
};
const securityReceipt = (v: SecurityReceipt): SecurityReceipt => Object.freeze({
    ...v, 
    recordedAt: date(v.recordedAt)
});
/** Existing independently opened five-minute principal only. Never accepts uploaded authority JSON. */
export class PostgresOwnerCommandRepository implements OwnerCommandRepository {
    constructor(private readonly pool: Pool) {
    }
    private async value<T>(sql: string, values: readonly unknown[]): Promise<T> {
        const result = await guardedAuthorityQuery<{
            value: T;
        }>(this.pool, sql, values);
        if (!result.rows[0])
            throw new Error('OWNER_DATABASE_RESULT_MISSING');
        return result.rows[0].value;
    }
    async install(input: Parameters<OwnerCommandRepository['install']>[0]): Promise<SecurityReceipt> {
        return securityReceipt(await this.value('SELECT staff.install_owner_recovery_generation($1,$2,$3) AS value', [input.generation, input.verifier, input.operationId]));
    }
    async prepare(input: Parameters<OwnerCommandRepository['prepare']>[0], nonceHash: string): ReturnType<OwnerCommandRepository['prepare']> {
        const previous = input.purpose === 'RECOVER_OWNER' ? input.predecessor : null;
        const value = await this.value<PreparedOwnerCommand>('SELECT staff.prepare_owner_command_v2($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11) AS value', [input.commandId, input.purpose, input.targetUserId, previous?.lineageId ?? null, previous?.kind === 'LIVE' ? previous.userId : null, previous?.kind === 'ERASED', input.credentialIds, input.operationId, nonceHash, input.generation, input.verifier]);
        return Object.freeze({
            commandId: value.commandId, 
            expiresAt: date(value.expiresAt)
        });
    }
    async read(commandId: string): Promise<PreparedOwnerCommand | null> {
        const value = await this.value<PreparedOwnerCommand | null>('SELECT staff.read_owner_command($1) AS value', [commandId]);
        return value === null ? null : Object.freeze({
            ...value, 
            credentialIds: Object.freeze([...value.credentialIds]) as OwnerCredentialSet,
            createdAt: date(value.createdAt), 
            expiresAt: date(value.expiresAt)
        });
    }
    async readReceipts(commandId: string, receiptIds: OwnerCredentialSet): Promise<readonly StoredOwnerPossessionReceipt[]> {
        const values = await this.value<readonly StoredOwnerPossessionReceipt[]>('SELECT staff.read_owner_receipts($1,$2::uuid[]) AS value', [commandId, receiptIds]);
        return Object.freeze(values.map(v => Object.freeze({
            ...v, 
            verifiedAt: date(v.verifiedAt), 
            expiresAt: date(v.expiresAt), 
            consumedAt: v.consumedAt === null ? null : date(v.consumedAt)
        })));
    }
    async commit(input: OwnerCommitInput, rotation: OwnerRecoveryRotation, alertIntent: StaffAlertIntent): Promise<SecurityReceipt> {
        return securityReceipt(await this.value('SELECT staff.commit_owner_command($1,$2::uuid[],$3,$4,$5,$6,$7,$8,$9,$10::jsonb) AS value', [input.commandId, input.receiptIds, input.operationId, input.purpose, rotation.generation, rotation.verifier, rotation.nextGeneration, rotation.nextVerifier, rotation.nextLineageId, alertIntent]));
    }
    async readCommitted(input: OwnerCommitInput, rotation: Omit<OwnerRecoveryRotation, 'verifier'>): Promise<SecurityReceipt | null> {
        const value = await this.value<SecurityReceipt | null>('SELECT staff.read_committed_owner_operation($1,$2::uuid[],$3,$4,$5,$6,$7,$8) AS value', [input.commandId, input.receiptIds, input.operationId, input.purpose, rotation.generation, rotation.nextGeneration, rotation.nextVerifier, rotation.nextLineageId]);
        return value === null ? null : securityReceipt(value);
    }
    readAlertMetadata(commandId: string, operationId: string): Promise<OwnerAlertMetadata | null> {
        return this.value('SELECT staff.read_owner_alert_metadata($1,$2) AS value', [commandId, operationId]);
    }
    authorizeAlert(commandId: string, operationId: string, binding: StaffAlertReadinessBinding): Promise<boolean> {
        return this.value('SELECT staff.authorize_owner_alert_operation($1,$2,$3,$4) AS value', [commandId, operationId, binding.configSha256, binding.generation]);
    }
}
/** A Task5 factory mapping adapter scoped to exactly one independently owned prepared command. */
export class OwnerCommandAlertKeyMappings {
    constructor(private readonly repository: Pick<OwnerCommandRepository, 'readAlertMetadata'>, private readonly commandId: string, private readonly operationId: string) {
    }
    async resolveUser(userId: string): Promise<StaffAlertKeyMapping | null> {
        const value = await this.repository.readAlertMetadata(this.commandId, this.operationId);
        return value !== null 
            && value.commandId === this.commandId 
            && value.operationId === this.operationId 
            && value.targetUserId === userId ? Object.freeze({
            userId, 
            keyRef: value.keyRef
        }) : null;
    }
}
