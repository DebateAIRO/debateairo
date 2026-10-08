import { createHash, timingSafeEqual } from 'node:crypto';
import { decodeAttestationObject } from '@simplewebauthn/server/helpers';
import { verifyRegistrationResponse, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { ConsumerRegistrationCredentialSchema, ConsumerAuthenticationCredentialSchema } from '@debateai/contract';
type ExpectedCeremony = Readonly<{
    origin: string;
    rpId: string;
    challengeHash: string;
}>;
export type ConsumerStoredCredential = Readonly<{
    credentialId: string;
    publicKey: string;
    counter: number;
    deviceType: 'singleDevice' | 'multiDevice';
    backedUp: boolean;
    userHandle: string;
}>;
export type VerifiedConsumerCredential = Readonly<{
    credentialId: string;
    publicKey: string;
    counter: number;
    deviceType: 'singleDevice' | 'multiDevice';
    backedUp: boolean;
    transports: readonly string[];
}>;
function canonical(value: string): Buffer {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length === 0 || bytes.toString('base64url') !== value)
        throw new Error('CONSUMER_WEBAUTHN_INVALID');
    return bytes;
}
function challengeMatches(challenge: string, expected: string): boolean {
    const actual = 'sha256:' + createHash('sha256').update(challenge).digest('hex');
    return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
function identifiers(id: string, rawId: string): void {
    canonical(id);
    canonical(rawId);
    if (id !== rawId)
        throw new Error('CONSUMER_WEBAUTHN_INVALID');
}
function clientContext(value: string): void {
    const client = JSON.parse(canonical(value).toString('utf8')) as Record<string, unknown>;
    if ((client.crossOrigin !== undefined && client.crossOrigin !== false) || client.topOrigin !== undefined)
        throw new Error('CONSUMER_WEBAUTHN_INVALID');
}
/** Pinned SimpleWebAuthn verifies the original signed bytes; browser convenience fields confer no authority. */
export async function verifyConsumerRegistration(input: unknown, expected: ExpectedCeremony): Promise<VerifiedConsumerCredential> {
    try {
        const response = ConsumerRegistrationCredentialSchema.parse(input);
        identifiers(response.id, response.rawId);
        clientContext(response.response.clientDataJSON);
        // Refuse other attestation formats before library verification can take certificate/network branches.
        const attestation = decodeAttestationObject(new Uint8Array(canonical(response.response.attestationObject)));
        if (attestation.get('fmt') !== 'none' || attestation.get('attStmt').size !== 0)
            throw new Error('attestation');
        const result = await verifyRegistrationResponse({ response: { id: response.id, rawId: response.rawId, type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: response.response.clientDataJSON, attestationObject: response.response.attestationObject } }, expectedOrigin: expected.origin, expectedRPID: expected.rpId,
            expectedChallenge: challenge => challengeMatches(challenge, expected.challengeHash), requireUserVerification: true, requireUserPresence: true, supportedAlgorithmIDs: [-7, -257] });
        if (!result.verified || !result.registrationInfo?.userVerified)
            throw new Error('unverified');
        const info = result.registrationInfo;
        if (info.fmt !== 'none' || info.credential.id !== response.id || (info.credentialBackedUp && info.credentialDeviceType !== 'multiDevice'))
            throw new Error('inconsistent');
        return Object.freeze({ credentialId: info.credential.id, publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
            counter: info.credential.counter, deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp, transports: response.response.transports ?? [] });
    }
    catch {
        throw new Error('CONSUMER_WEBAUTHN_INVALID');
    }
}
export async function verifyConsumerAuthentication(input: unknown, stored: ConsumerStoredCredential, expected: ExpectedCeremony): Promise<Readonly<{
    counter: number;
    deviceType: 'singleDevice' | 'multiDevice';
    backedUp: boolean;
}>> {
    try {
        const response = ConsumerAuthenticationCredentialSchema.parse(input);
        identifiers(response.id, response.rawId);
        clientContext(response.response.clientDataJSON);
        if (response.id !== stored.credentialId || (response.response.userHandle !== undefined && response.response.userHandle !== stored.userHandle))
            throw new Error('owner');
        if (response.response.userHandle !== undefined)
            canonical(response.response.userHandle);
        const result = await verifyAuthenticationResponse({ response: { id: response.id, rawId: response.rawId, type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: response.response.clientDataJSON, authenticatorData: response.response.authenticatorData, signature: response.response.signature, ...(response.response.userHandle === undefined ? {} : { userHandle: response.response.userHandle }) } }, expectedOrigin: expected.origin, expectedRPID: expected.rpId,
            expectedChallenge: challenge => challengeMatches(challenge, expected.challengeHash), requireUserVerification: true,
            credential: { id: stored.credentialId, publicKey: new Uint8Array(canonical(stored.publicKey)), counter: stored.deviceType === 'multiDevice' ? 0 : stored.counter } });
        const info = result.authenticationInfo;
        if (!result.verified || !info.userVerified || info.credentialDeviceType !== stored.deviceType
            || (info.credentialBackedUp && info.credentialDeviceType !== 'multiDevice'))
            throw new Error('inconsistent');
        return Object.freeze({ counter: info.newCounter, deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp });
    }
    catch {
        throw new Error('CONSUMER_WEBAUTHN_INVALID');
    }
}
