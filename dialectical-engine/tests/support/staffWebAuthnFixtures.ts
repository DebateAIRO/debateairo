import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
export const origin = 'https://admin.example.test', rpId = 'admin.example.test';
export const b64 = (v: Uint8Array | string) => Buffer.from(v).toString('base64url');
export const digest = (v: Uint8Array | string) => 'sha256:' + createHash('sha256').update(v).digest('hex');
// Independent standards-derived test encoder; no adapted production parser is used.
function head(major: number, n: number): Buffer { if (n < 24)
    return Buffer.from([major * 32 + n]); if (n < 256)
    return Buffer.from([major * 32 + 24, n]); if (n < 65536) {
    const x = Buffer.alloc(3);
    x[0] = major * 32 + 25;
    x.writeUInt16BE(n, 1);
    return x;
} const x = Buffer.alloc(5); x[0] = major * 32 + 26; x.writeUInt32BE(n, 1); return x; }
export function cbor(v: unknown): Buffer { if (typeof v === 'number')
    return head(v < 0 ? 1 : 0, v < 0 ? -1 - v : v); if (typeof v === 'string') {
    const x = Buffer.from(v);
    return Buffer.concat([head(3, x.length), x]);
} if (v instanceof Uint8Array)
    return Buffer.concat([head(2, v.length), v]); if (v instanceof Map)
    return Buffer.concat([head(5, v.size), ...Array.from(v, ([k, x]) => Buffer.concat([cbor(k), cbor(x)]))]); throw new Error('FIXTURE_TYPE'); }
export function key(alg: -7 | -257 = -7, modulusLength = 2048) { const pair = alg === -7 ? generateKeyPairSync('ec', { namedCurve: 'prime256v1' }) : generateKeyPairSync('rsa', { modulusLength, publicExponent: 65537 }); const jwk = pair.publicKey.export({ format: 'jwk' }); const map = alg === -7 ? new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, 'base64url')], [-3, Buffer.from(jwk.y!, 'base64url')]]) : new Map<number, unknown>([[1, 3], [3, -257], [-1, Buffer.from(jwk.n!, 'base64url')], [-2, Buffer.from(jwk.e!, 'base64url')]]); return { ...pair, alg, map, wire: cbor(map) }; }
export type FixtureKey = ReturnType<typeof key>;
export function fixture(k = key(), counter = 1, id = Buffer.from('independent-hardware-credential')) { const handle = Buffer.alloc(32, 9), challenge = b64(Buffer.alloc(32, 4)); const expected = { origin, rpId, challengeSha256: digest(challenge), credentialId: b64(id), userHandleSha256: digest(handle), counter: 0 }; const client = (type: string) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false })); const auth = (flags: number, count = counter) => { const x = Buffer.alloc(37); createHash('sha256').update(rpId).digest().copy(x); x[32] = flags; x.writeUInt32BE(count, 33); return x; }; const idLength = Buffer.alloc(2); idLength.writeUInt16BE(id.length); const regAuth = Buffer.concat([auth(0x45), Buffer.alloc(16), idLength, id, k.wire]); const registration = { id: b64(id), rawId: b64(id), type: 'public-key' as const, response: { clientDataJSON: b64(client('webauthn.create')), attestationObject: b64(cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', regAuth]]))) }, clientExtensionResults: {} }; const assertion = (custom: Partial<{
    client: Buffer;
    auth: Buffer;
    privateKey: KeyObject;
    signature: Buffer;
}>) => { const clientBytes = custom.client ?? client('webauthn.get'), authBytes = custom.auth ?? auth(5); const signature = custom.signature ?? sign('sha256', Buffer.concat([authBytes, createHash('sha256').update(clientBytes).digest()]), custom.privateKey ?? k.privateKey); return { id: b64(id), rawId: b64(id), type: 'public-key' as const, response: { clientDataJSON: b64(clientBytes), authenticatorData: b64(authBytes), signature: b64(signature), userHandle: b64(handle) }, clientExtensionResults: {} }; }; return { k, id, handle, challenge, expected, client, auth, regAuth, registration, assertion }; }
