import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { OwnerCommitInput } from '@debateai/db';
import { OwnerRecoveryCustody, OwnerRecoveryError, ownerDigest, ownerExact, ownerJson, ownerUuid, type OwnerRecoveryLock } from './owner-recovery-custody.js';
export type OwnerRecoveryBundle = Readonly<{
    schema: 'owner-recovery-bundle-v1';
    generation: string;
    proof: string;
    receiptId: string;
    binding: OwnerCommitInput | null;
}>;
export type OwnerRecoveryVerifier = Readonly<{
    schema: 'owner-recovery-verifier-v1';
    generation: string;
    verifier: string;
    receiptId: string;
    materialSha256: string;
}>;
export function ownerRecoveryVerifier(generation: string, proof: Buffer): string {
    if (!ownerUuid(generation) 
        || proof.length !== 32)
        throw new OwnerRecoveryError('OWNER_RECOVERY_MATERIAL_INVALID');
    const bytes = Buffer.concat([Buffer.from('debateai:owner-recovery-proof:v1\0' + generation + '\0'), proof]);
    try {
        return `sha256:${ownerDigest(bytes)}`;
    }
    finally {
        bytes.fill(0);
    }
}
export function parseOwnerRecoveryBundle(value: unknown): OwnerRecoveryBundle {
    if (!ownerExact(value, ['schema', 'generation', 'proof', 'receiptId', 'binding']) 
        || value.schema !== 'owner-recovery-bundle-v1' 
        || !ownerUuid(value.generation) 
        || !ownerUuid(value.receiptId) 
        || typeof value.proof !== 'string' 
        || !/^[A-Za-z0-9_-]{43}$/.test(value.proof) 
        || Buffer.from(value.proof, 'base64url').length !== 32)
        throw new OwnerRecoveryError('OWNER_RECOVERY_MATERIAL_INVALID');
    if (value.binding !== null 
        && (!ownerExact(value.binding, ['commandId', 'receiptIds', 'operationId', 'purpose']) 
        || !ownerUuid(value.binding.commandId) 
        || !ownerUuid(value.binding.operationId) 
        || !['BOOTSTRAP', 'RECOVER_OWNER'].includes(value.binding.purpose as string) 
        || !Array.isArray(value.binding.receiptIds) 
        || value.binding.receiptIds.length !== 2 
        || !value.binding.receiptIds.every(ownerUuid) 
        || value.binding.receiptIds[0] === value.binding.receiptIds[1]))
        throw new OwnerRecoveryError('OWNER_RECOVERY_MATERIAL_INVALID');
    return value as OwnerRecoveryBundle;
}
export function ownerBundleBytes(bundle: OwnerRecoveryBundle): Buffer {
    return Buffer.from(JSON.stringify(bundle) + '\n');
}
export function ownerVerifierBytes(bundle: OwnerRecoveryBundle, material: Buffer): Buffer {
    const proof = Buffer.from(bundle.proof, 'base64url');
    try {
        return Buffer.from(JSON.stringify({
            schema: 'owner-recovery-verifier-v1', 
            generation: bundle.generation, 
            verifier: ownerRecoveryVerifier(bundle.generation, proof), 
            receiptId: bundle.receiptId, 
            materialSha256: ownerDigest(material)
        }) + '\n');
    }
    finally {
        proof.fill(0);
    }
}
export async function readOwnerMaterial(custody: OwnerRecoveryCustody, materialFile: string, verifierFile: string, proof: Buffer): Promise<Readonly<{
    bundle: OwnerRecoveryBundle;
    verifier: string;
}>> {
    const bytes = await custody.read(materialFile), metadata = await custody.read(verifierFile);
    let expected: Buffer | undefined;
    try {
        const bundle = parseOwnerRecoveryBundle(ownerJson(bytes)), value = ownerJson(metadata);
        expected = Buffer.from(bundle.proof, 'base64url');
        if (proof.length !== 32 
            || !timingSafeEqual(proof, expected))
            throw new OwnerRecoveryError('OWNER_RECOVERY_PROOF_INVALID');
        const verifier = ownerRecoveryVerifier(bundle.generation, proof);
        if (!ownerExact(value, ['schema', 'generation', 'verifier', 'receiptId', 'materialSha256']) 
            || value.schema !== 'owner-recovery-verifier-v1' 
            || value.generation !== bundle.generation 
            || value.verifier !== verifier 
            || value.receiptId !== bundle.receiptId 
            || value.materialSha256 !== ownerDigest(bytes))
            throw new OwnerRecoveryError('OWNER_RECOVERY_MATERIAL_INVALID');
        return {
            bundle, 
            verifier
        };
    }
    finally {
        bytes.fill(0);
        metadata.fill(0);
        expected?.fill(0);
    }
}
export async function prepareOwnerMaterial(custody: OwnerRecoveryCustody, materialFile: string, verifierFile: string, binding: OwnerCommitInput | null): Promise<Readonly<{
    bundle: OwnerRecoveryBundle;
    verifier: string;
    materialSha256: string;
    verifierSha256: string;
}>> {
    let material: Buffer;
    if (await custody.exists(materialFile)) {
        material = await custody.read(materialFile);
        await custody.syncFile(materialFile);
    }
    else {
        const proof = randomBytes(32);
        try {
            material = ownerBundleBytes({
                schema: 'owner-recovery-bundle-v1', 
                generation: randomUUID(), 
                proof: proof.toString('base64url'), 
                receiptId: randomUUID(), 
                binding
            });
        }
        finally {
            proof.fill(0);
        }
        await custody.writeExclusive(materialFile, material);
    }
    try {
        const bundle = parseOwnerRecoveryBundle(ownerJson(material));
        if (JSON.stringify(bundle.binding) !== JSON.stringify(binding))
            throw new OwnerRecoveryError('OWNER_JOURNAL_MISMATCH');
        const verifierBytes = ownerVerifierBytes(bundle, material);
        try {
            if (await custody.exists(verifierFile)) {
                const previous = await custody.read(verifierFile);
                try {
                    if (!previous.equals(verifierBytes))
                        throw new OwnerRecoveryError('OWNER_JOURNAL_MISMATCH');
                    await custody.syncFile(verifierFile);
                }
                finally {
                    previous.fill(0);
                }
            }
            else
                await custody.writeExclusive(verifierFile, verifierBytes);
            const parsed = ownerJson(verifierBytes) as OwnerRecoveryVerifier;
            return {
                bundle, 
                verifier: parsed.verifier, 
                materialSha256: ownerDigest(material), 
                verifierSha256: ownerDigest(verifierBytes)
            };
        }
        finally {
            verifierBytes.fill(0);
        }
    }
    finally {
        material.fill(0);
    }
}
/** Root-private output only. Returned verifier is an internal installation input, never a CLI receipt. */
export async function createOwnerRecoveryMaterial(privateOutput: Readonly<{
    materialFile: string;
    verifierFile: string;
    lockFile: string;
    custody: OwnerRecoveryCustody;
    lock: OwnerRecoveryLock;
}>): Promise<Readonly<{
    verifier: string;
    receiptId: string;
}>> {
    if (new Set([privateOutput.materialFile, privateOutput.verifierFile, privateOutput.lockFile]).size !== 3)
        throw new OwnerRecoveryError('OWNER_PRIVATE_PATH_INVALID');
    return privateOutput.lock.withLock(privateOutput.lockFile, async () => {
        const value = await prepareOwnerMaterial(privateOutput.custody, privateOutput.materialFile, privateOutput.verifierFile, null);
        return Object.freeze({
            verifier: value.verifier, 
            receiptId: value.bundle.receiptId
        });
    });
}
