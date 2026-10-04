import { createHash, randomBytes, sign, type KeyObject } from 'node:crypto';
import { b64, cbor, key } from './staffWebAuthnFixtures.js';
export { b64, key };
export const origin = 'https://app.example.test', rpId = 'app.example.test';
/** Independent CBOR/COSE fixtures and actual authenticator signatures. No production codec. */
export function consumerFixture(k = key(), id = randomBytes(32)) {
    const handle = b64(randomBytes(32));
    const auth = (flags = 0x1d, counter = 0, relyingParty = rpId) => {
        const bytes = Buffer.alloc(37);
        createHash('sha256').update(relyingParty).digest().copy(bytes);
        bytes[32] = flags;
        bytes.writeUInt32BE(counter, 33);
        return bytes;
    };
    const client = (type: string, challenge: string, extra: Record<string, unknown> = {}) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false, ...extra }));
    const registration = (challenge: string, flags = 0x5d, counter = 0) => {
        const length = Buffer.alloc(2);
        length.writeUInt16BE(id.length);
        const data = Buffer.concat([auth(flags, counter), Buffer.alloc(16), length, id, k.wire]);
        return { id: b64(id), rawId: b64(id), type: 'public-key' as const,
            response: { clientDataJSON: b64(client('webauthn.create', challenge)), attestationObject: b64(cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', data]]))) }, clientExtensionResults: {} };
    };
    const assertion = (challenge: string, custom: Partial<{
        flags: number;
        counter: number;
        rpId: string;
        client: Buffer;
        privateKey: KeyObject;
        signature: Buffer;
        userHandle: string;
    }> = {}) => {
        const data = auth(custom.flags, custom.counter, custom.rpId);
        const clientBytes = custom.client ?? client('webauthn.get', challenge);
        const signature = custom.signature ?? sign('sha256', Buffer.concat([data, createHash('sha256').update(clientBytes).digest()]), custom.privateKey ?? k.privateKey);
        return { id: b64(id), rawId: b64(id), type: 'public-key' as const, response: {
                clientDataJSON: b64(clientBytes), authenticatorData: b64(data), signature: b64(signature), userHandle: custom.userHandle ?? handle
            }, clientExtensionResults: {} };
    };
    return { k, handle, auth, client, registration, assertion, credentialId: b64(id) };
}
