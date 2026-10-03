import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import type { ReadableUserDekStore } from '@debateai/crypto';
import { OwnerCommandAlertKeyMappings, type OwnerCommandInput, type OwnerCommandRepository, type OwnerCommitInput, type OwnerRecoveryRotation, type PreparedOwnerCommand, type StaffIndependentReadinessPublisher, type StoredOwnerPossessionReceipt } from '@debateai/db';
import type { OwnerCredentialSet, SecurityReceipt } from '@debateai/kernel';
import { RootStaffAlertConfiguration, StaffAlertIntentProducer } from '../../api/src/staff/alerts.js';
import { OwnerRecoveryCustody, OwnerRecoveryError, ownerDigest, ownerExact, ownerJson, ownerUuid, type OwnerRecoveryLock } from './owner-recovery-custody.js';
import { ownerRecoveryVerifier, parseOwnerRecoveryBundle, prepareOwnerMaterial, readOwnerMaterial } from './owner-recovery-material.js';
export type OwnerPrivatePaths = Readonly<{
    materialFile: string;
    verifierFile: string;
    nonceFile: string;
    journalFile: string;
    nextMaterialFile: string;
    nextVerifierFile: string;
    lockFile: string;
}>;
export type OwnerPrivateInput = Readonly<{
    repository: OwnerCommandRepository;
    custody: OwnerRecoveryCustody;
    lock: OwnerRecoveryLock;
    paths: OwnerPrivatePaths;
    proof: Buffer;
    configuration: RootStaffAlertConfiguration;
    publisher: StaffIndependentReadinessPublisher;
    keys: Pick<ReadableUserDekStore, 'load'>;
}>;
export type OwnerCommandHandle = Readonly<{
    commandId: string;
    expiresAt: Date;
}>;
export type OwnerCommitSelection = Readonly<{
    commandId: string;
    receiptIds: OwnerCredentialSet;
    receiptFile: string;
}>;
type Handoff = Readonly<{
    schema: 'owner-command-handoff-v1';
    commandId: string;
    operationId: string;
    inputSha256: string;
    nonce: string;
}>;
type Journal = Readonly<{
    schema: 'owner-recovery-journal-v1';
    input: OwnerCommitInput;
    paths: OwnerPrivatePaths;
    receiptFile: string;
    rotation: OwnerRecoveryRotation;
    materialSha256: string;
    verifierSha256: string;
}>;
function paths(privateInput: OwnerPrivateInput, receiptFile?: string): void {
    const values = [...Object.values(privateInput.paths), ...(receiptFile === undefined ? [] : [receiptFile])];
    if (new Set(values).size !== values.length)
        throw new OwnerRecoveryError('OWNER_PRIVATE_PATH_INVALID');
    for (const path of values)
        privateInput.custody.path(path);
    if (dirname(privateInput.paths.materialFile) !== dirname(privateInput.paths.nextMaterialFile) 
        || dirname(privateInput.paths.verifierFile) !== dirname(privateInput.paths.nextVerifierFile))
        throw new OwnerRecoveryError('OWNER_PRIVATE_PATH_INVALID');
}
export function validateOwnerCommandInput(input: unknown): asserts input is OwnerCommandInput {
    if (!ownerExact(input, input !== null 
        && typeof input === 'object' 
        && 'purpose' in input 
        && input.purpose === 'RECOVER_OWNER' ? ['commandId', 'operationId', 'targetUserId', 'credentialIds', 'purpose', 'predecessor'] : ['commandId', 'operationId', 'targetUserId', 'credentialIds', 'purpose']) 
        || ![input.commandId, input.operationId, input.targetUserId].every(ownerUuid) 
        || !Array.isArray(input.credentialIds) 
        || ![1, 2].includes(input.credentialIds.length)
        || new Set(input.credentialIds).size !== input.credentialIds.length
        || !input.credentialIds.every(x => typeof x === 'string' 
        && /^[A-Za-z0-9_-]{1,1366}$/.test(x)))
        throw new OwnerRecoveryError('OWNER_COMMAND_INPUT_INVALID');
    if (input.purpose === 'RECOVER_OWNER') {
        const p = input.predecessor;
        if (!ownerExact(p, p !== null 
            && typeof p === 'object' 
            && 'kind' in p 
            && p.kind === 'LIVE' ? ['kind', 'lineageId', 'userId'] : ['kind', 'lineageId']) 
            || !ownerUuid(p.lineageId) 
            || !['LIVE', 'ERASED'].includes(p.kind as string) 
            || (p.kind === 'LIVE' 
            && (!ownerUuid(p.userId) 
            || p.userId === input.targetUserId)))
            throw new OwnerRecoveryError('OWNER_COMMAND_INPUT_INVALID');
    }
    else if (input.purpose !== 'BOOTSTRAP')
        throw new OwnerRecoveryError('OWNER_COMMAND_INPUT_INVALID');
}
async function handoff(privateInput: OwnerPrivateInput): Promise<Handoff> {
    const bytes = await privateInput.custody.read(privateInput.paths.nonceFile);
    try {
        const value = ownerJson(bytes);
        if (!ownerExact(value, ['schema', 'commandId', 'operationId', 'inputSha256', 'nonce']) 
            || value.schema !== 'owner-command-handoff-v1' 
            || !ownerUuid(value.commandId) 
            || !ownerUuid(value.operationId) 
            || typeof value.inputSha256 !== 'string' 
            || !/^[0-9a-f]{64}$/.test(value.inputSha256) 
            || typeof value.nonce !== 'string' 
            || !/^[A-Za-z0-9_-]{43}$/.test(value.nonce))
            throw new OwnerRecoveryError('OWNER_HANDOFF_INVALID');
        return value as Handoff;
    }
    finally {
        bytes.fill(0);
    }
}
export async function prepareOwnerCommand(input: OwnerCommandInput, privateInput: OwnerPrivateInput): Promise<OwnerCommandHandle> {
    validateOwnerCommandInput(input);
    paths(privateInput);
    return privateInput.lock.withLock(privateInput.paths.lockFile, async () => {
        if (await privateInput.custody.exists(privateInput.paths.journalFile))
            throw new OwnerRecoveryError('OWNER_JOURNAL_MISMATCH');
        const material = await readOwnerMaterial(privateInput.custody, privateInput.paths.materialFile, privateInput.paths.verifierFile, privateInput.proof), inputSha256 = ownerDigest(JSON.stringify(input));
        let value: Handoff;
        if (await privateInput.custody.exists(privateInput.paths.nonceFile)) {
            value = await handoff(privateInput);
            if (value.commandId !== input.commandId 
                || value.operationId !== input.operationId 
                || value.inputSha256 !== inputSha256)
                throw new OwnerRecoveryError('OWNER_HANDOFF_INVALID');
        }
        else {
            const nonce = randomBytes(32);
            try {
                value = {
                    schema: 'owner-command-handoff-v1', 
                    commandId: input.commandId, 
                    operationId: input.operationId, 
                    inputSha256, 
                    nonce: nonce.toString('base64url')
                };
            }
            finally {
                nonce.fill(0);
            }
            await privateInput.custody.writeExclusive(privateInput.paths.nonceFile, Buffer.from(JSON.stringify(value) + '\n'));
        }
        return privateInput.repository.prepare({
            ...input, 
            generation: material.bundle.generation, 
            verifier: material.verifier
        }, `sha256:${ownerDigest(value.nonce)}`);
    });
}
/** Independently checks every persisted command/receipt binding before requesting final SQL consumption. */
export function validateOwnerReceipts(command: PreparedOwnerCommand, selection: OwnerCommitInput, nonce: string, receipts: readonly StoredOwnerPossessionReceipt[], now: Date): void {
    const time = now.getTime();
    if (![time, command.createdAt.getTime(), command.expiresAt.getTime()].every(Number.isFinite) 
        || command.commandId !== selection.commandId 
        || command.operationId !== selection.operationId 
        || command.purpose !== selection.purpose 
        || command.state !== 'PENDING' 
        || command.nonceSha256 !== `sha256:${ownerDigest(nonce)}` 
        || command.expiresAt.getTime() <= time 
        || command.createdAt.getTime() > time 
        || command.expiresAt.getTime() > command.createdAt.getTime() + 300001 
        || !Number.isSafeInteger(command.targetAccountSecurityEpoch) 
        || ![1, 2].includes(command.credentialIds.length)
        || receipts.length !== command.credentialIds.length
        || selection.receiptIds.length !== command.credentialIds.length
        || new Set(selection.receiptIds).size !== command.credentialIds.length
        || new Set(command.credentialIds).size !== command.credentialIds.length)
        throw new OwnerRecoveryError('OWNER_POSSESSION_RECEIPTS_INVALID');
    let session: string | undefined;
    const keys = new Set<string>();
    for (let i = 0; i < command.credentialIds.length; i++) {
        const r = receipts[i]!;
        if (![r.verifiedAt.getTime(), r.expiresAt.getTime()].every(Number.isFinite) 
            || r.verifiedAt.getTime() < command.createdAt.getTime() 
            || r.receiptId !== selection.receiptIds[i] 
            || r.commandId !== command.commandId 
            || r.purpose !== command.purpose 
            || r.targetUserId !== command.targetUserId 
            || r.targetAccountSecurityEpoch !== command.targetAccountSecurityEpoch 
            || r.nonceSha256 !== command.nonceSha256 
            || !ownerUuid(r.ordinarySessionId) 
            || !command.credentialIds.includes(r.credentialId) 
            || r.consumedAt !== null 
            || r.verifiedAt.getTime() > time 
            || r.verifiedAt.getTime() < time - 300000 
            || r.expiresAt.getTime() <= time 
            || r.expiresAt.getTime() > r.verifiedAt.getTime() + 300000 
            || r.expiresAt.getTime() > command.expiresAt.getTime() 
            || (session !== undefined 
            && session !== r.ordinarySessionId))
            throw new OwnerRecoveryError('OWNER_POSSESSION_RECEIPTS_INVALID');
        session = r.ordinarySessionId;
        keys.add(r.credentialId);
    }
    if (keys.size !== command.credentialIds.length)
        throw new OwnerRecoveryError('OWNER_POSSESSION_RECEIPTS_INVALID');
}
function journal(value: unknown): Journal {
    if (!ownerExact(value, ['schema', 'input', 'paths', 'receiptFile', 'rotation', 'materialSha256', 'verifierSha256']) 
        || value.schema !== 'owner-recovery-journal-v1' 
        || !ownerExact(value.input, ['commandId', 'receiptIds', 'operationId', 'purpose']) 
        || ![value.input.commandId, value.input.operationId].every(ownerUuid) 
        || !Array.isArray(value.input.receiptIds) 
        || ![1, 2].includes(value.input.receiptIds.length)
        || !value.input.receiptIds.every(ownerUuid) 
        || new Set(value.input.receiptIds).size !== value.input.receiptIds.length
        || !['BOOTSTRAP', 'RECOVER_OWNER'].includes(value.input.purpose as string) 
        || !ownerExact(value.paths, ['materialFile', 'verifierFile', 'nonceFile', 'journalFile', 'nextMaterialFile', 'nextVerifierFile', 'lockFile']) 
        || !Object.values(value.paths).every(x => typeof x === 'string') 
        || typeof value.receiptFile !== 'string' 
        || !ownerExact(value.rotation, ['generation', 'verifier', 'nextGeneration', 'nextVerifier', 'nextLineageId']) 
        || ![value.rotation.generation, value.rotation.nextGeneration, value.rotation.nextLineageId].every(ownerUuid) 
        || ![value.rotation.verifier, value.rotation.nextVerifier].every(x => typeof x === 'string' 
        && /^sha256:[0-9a-f]{64}$/.test(x)) 
        || ![value.materialSha256, value.verifierSha256].every(x => typeof x === 'string' 
        && /^[0-9a-f]{64}$/.test(x)))
        throw new OwnerRecoveryError('OWNER_JOURNAL_MISMATCH');
    return value as Journal;
}
async function safeReceipt(privateInput: OwnerPrivateInput, path: string, receipt: SecurityReceipt): Promise<void> {
    if (!ownerUuid(receipt.operationId) 
        || receipt.outcome !== 'COMPLETED' 
        || !Number.isFinite(receipt.recordedAt.getTime()))
        throw new OwnerRecoveryError('OWNER_DATABASE_RESULT_INVALID');
    const bytes = Buffer.from(JSON.stringify({
        operationId: receipt.operationId, 
        outcome: receipt.outcome, 
        recordedAt: receipt.recordedAt.toISOString()
    }) + '\n');
    if (await privateInput.custody.exists(path)) {
        const previous = await privateInput.custody.read(path);
        try {
            if (!previous.equals(bytes))
                throw new OwnerRecoveryError('OWNER_RECEIPT_OUTPUT_CONFLICT');
            await privateInput.custody.syncFile(path);
        }
        finally {
            previous.fill(0);
        }
    }
    else
        await privateInput.custody.writeExclusive(path, bytes);
}
async function commitOwner(purpose: OwnerCommitInput['purpose'], selection: OwnerCommitSelection, privateInput: OwnerPrivateInput): Promise<SecurityReceipt> {
    if (!ownerExact(selection, ['commandId', 'receiptIds', 'receiptFile']) 
        || !ownerUuid(selection.commandId) 
        || !Array.isArray(selection.receiptIds) 
        || ![1, 2].includes(selection.receiptIds.length)
        || !selection.receiptIds.every(ownerUuid) 
        || new Set(selection.receiptIds).size !== selection.receiptIds.length)
        throw new OwnerRecoveryError('OWNER_COMMAND_INPUT_INVALID');
    paths(privateInput, selection.receiptFile);
    return privateInput.lock.withLock(privateInput.paths.lockFile, async () => {
        await privateInput.custody.parents(selection.receiptFile);
        let value: Journal;
        if (await privateInput.custody.exists(privateInput.paths.journalFile)) {
            const bytes = await privateInput.custody.read(privateInput.paths.journalFile);
            try {
                value = journal(ownerJson(bytes));
                await privateInput.custody.syncFile(privateInput.paths.journalFile);
            }
            finally {
                bytes.fill(0);
            }
            if (value.input.commandId !== selection.commandId 
                || value.input.purpose !== purpose 
                || JSON.stringify(value.input.receiptIds) !== JSON.stringify(selection.receiptIds) 
                || JSON.stringify(value.paths) !== JSON.stringify(privateInput.paths) 
                || value.receiptFile !== selection.receiptFile 
                || ownerRecoveryVerifier(value.rotation.generation, privateInput.proof) !== value.rotation.verifier)
                throw new OwnerRecoveryError('OWNER_JOURNAL_MISMATCH');
        }
        else {
            if (await privateInput.custody.exists(selection.receiptFile))
                throw new OwnerRecoveryError('OWNER_RECEIPT_OUTPUT_CONFLICT');
            const secret = await handoff(privateInput), command = await privateInput.repository.read(selection.commandId);
            if (command === null 
                || secret.commandId !== selection.commandId 
                || command.operationId !== secret.operationId)
                throw new OwnerRecoveryError('OWNER_HANDOFF_INVALID');
            const input: OwnerCommitInput = {
                commandId: selection.commandId, 
                receiptIds: selection.receiptIds, 
                operationId: secret.operationId, 
                purpose
            };
            const material = await readOwnerMaterial(privateInput.custody, privateInput.paths.materialFile, privateInput.paths.verifierFile, privateInput.proof);
            if (command.generation !== material.bundle.generation)
                throw new OwnerRecoveryError('OWNER_RECOVERY_PROOF_INVALID');
            validateOwnerReceipts(command, input, secret.nonce, await privateInput.repository.readReceipts(input.commandId, input.receiptIds), new Date());
            const next = await prepareOwnerMaterial(privateInput.custody, privateInput.paths.nextMaterialFile, privateInput.paths.nextVerifierFile, input);
            value = {
                schema: 'owner-recovery-journal-v1', 
                input, 
                paths: privateInput.paths, 
                receiptFile: selection.receiptFile, 
                rotation: {
                    generation: material.bundle.generation, 
                    verifier: material.verifier, 
                    nextGeneration: next.bundle.generation, 
                    nextVerifier: next.verifier, 
                    nextLineageId: next.bundle.receiptId
                }, 
                materialSha256: next.materialSha256, 
                verifierSha256: next.verifierSha256
            };
            await privateInput.custody.writeExclusive(privateInput.paths.journalFile, Buffer.from(JSON.stringify(value) + '\n'));
        }
        // Exact prepared next material must remain recoverable before any SQL retry or publication.
        for (const [prepared, published, hash] of [[value.paths.nextMaterialFile, value.paths.materialFile, value.materialSha256], [value.paths.nextVerifierFile, value.paths.verifierFile, value.verifierSha256]]) {
            const bytes = await privateInput.custody.read(await privateInput.custody.exists(prepared!) ? prepared! : published!);
            try {
                if (ownerDigest(bytes) !== hash)
                    throw new OwnerRecoveryError('OWNER_JOURNAL_MISMATCH');
                await privateInput.custody.syncFile(await privateInput.custody.exists(prepared!) ? prepared! : published!);
            }
            finally {
                bytes.fill(0);
            }
        }
        let receipt = await privateInput.repository.readCommitted(value.input, value.rotation);
        if (receipt === null) {
            const secret = await handoff(privateInput), command = await privateInput.repository.read(value.input.commandId);
            if (command === null)
                throw new OwnerRecoveryError('OWNER_HANDOFF_INVALID');
            validateOwnerReceipts(command, value.input, secret.nonce, await privateInput.repository.readReceipts(value.input.commandId, value.input.receiptIds), new Date());
            const trusted = await privateInput.configuration.read();
            if (trusted === null 
                || !await privateInput.publisher.publish({
                ...trusted.binding, 
                ackAdapterId: trusted.config.ackAdapterId, 
                rehearsalId: trusted.evidence.rehearsalId, 
                evidenceExpiresAt: trusted.evidence.expiresAt
            }))
                throw new OwnerRecoveryError('OWNER_ALERT_READINESS_UNAVAILABLE');
            const metadata = await privateInput.repository.readAlertMetadata(value.input.commandId, value.input.operationId);
            if (metadata === null 
                || metadata.event !== purpose 
                || metadata.targetUserId !== command.targetUserId)
                throw new OwnerRecoveryError('OWNER_ALERT_METADATA_INVALID');
            const producer = new StaffAlertIntentProducer({
                keys: privateInput.keys, 
                mappings: new OwnerCommandAlertKeyMappings(privateInput.repository, value.input.commandId, value.input.operationId), 
                readiness: {
                    require: async (operationId) => {
                        if (operationId !== value.input.operationId 
                            || !await privateInput.repository.authorizeAlert(value.input.commandId, operationId, trusted.binding))
                            throw new OwnerRecoveryError('OWNER_ALERT_READINESS_UNAVAILABLE');
                    }
                }
            });
            const alert = await producer.mutation({
                operationId: value.input.operationId, 
                event: metadata.event, 
                keyUserId: metadata.targetUserId, 
                actorStaffId: metadata.actorStaffId, 
                subjectStaffId: metadata.subjectStaffId, 
                reason: metadata.reason
            });
            receipt = await privateInput.repository.commit(value.input, value.rotation, alert);
        }
        await privateInput.custody.publish(value.paths.nextMaterialFile, value.paths.materialFile, value.materialSha256);
        await privateInput.custody.publish(value.paths.nextVerifierFile, value.paths.verifierFile, value.verifierSha256);
        await safeReceipt(privateInput, selection.receiptFile, receipt);
        await privateInput.custody.remove(value.paths.nonceFile);
        await privateInput.custody.remove(value.paths.journalFile);
        return receipt;
    });
}
export const bootstrapOwner = (input: OwnerCommitSelection, privateInput: OwnerPrivateInput): Promise<SecurityReceipt> => commitOwner('BOOTSTRAP', input, privateInput);
export const recoverOwner = (input: OwnerCommitSelection, privateInput: OwnerPrivateInput): Promise<SecurityReceipt> => commitOwner('RECOVER_OWNER', input, privateInput);
