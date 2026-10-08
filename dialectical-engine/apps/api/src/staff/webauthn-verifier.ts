/** SPDX-License-Identifier: MIT
 * Adapted layout/encoding/schema portions: Copyright (c) 2020 Matthew Miller;
 * Full retained notices and symbol provenance: third_party/webauthn/ADAPTATIONS.md.
 */
import { constants, createHash, createPublicKey, timingSafeEqual, verify, type KeyObject } from 'node:crypto';
import { WebAuthnRegistrationCredentialSchema, WebAuthnAuthenticationCredentialSchema } from '@debateai/contract';
import { decodeBase64url, encodeBase64url, decodeCbor, parseClientData, parseAuthenticatorData, invalid } from './webauthn-codec.js';
export type CeremonyExpectation = Readonly<{
    challengeSha256: string;
    origin: string;
    rpId: string;
}>;
export type StoredCredential = Readonly<{
    credentialId: string;
    publicKey: string;
    counter: number;
    userHandleSha256: string;
}>;
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest();
const hash = (bytes: Uint8Array | string) => 'sha256:' + sha(bytes).toString('hex');
function bodyBound(value: unknown): void { try {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 32768)
        invalid();
}
catch {
    return invalid();
} }
function client(bytes: Uint8Array, expected: CeremonyExpectation, type: 'webauthn.create' | 'webauthn.get'): void {
    const data = parseClientData(bytes);
    if (data.type !== type || data.origin !== expected.origin || typeof data.challenge !== 'string' || hash(data.challenge) !== expected.challengeSha256 || ('crossOrigin' in data && data.crossOrigin !== false) || 'topOrigin' in data)
        invalid();
    if (decodeBase64url(data.challenge, 32).byteLength !== 32)
        invalid();
    if ('tokenBinding' in data) {
        const binding = data.tokenBinding;
        if (binding === null || typeof binding !== 'object' || Array.isArray(binding))
            invalid();
        const b = binding as Record<string, unknown>;
        if (!['supported', 'present'].includes(b.status as string) || Object.keys(b).some(k => !['status', 'id'].includes(k)) || (b.status === 'present' && (typeof b.id !== 'string' || b.id.length === 0)) || ('id' in b && typeof b.id !== 'string'))
            invalid();
    }
}
function rp(bytes: Uint8Array, expected: CeremonyExpectation): void { let url: URL; try {
    url = new URL(expected.origin);
}
catch {
    return invalid();
} if (url.origin !== expected.origin || url.protocol !== 'https:' || url.hostname !== expected.rpId || !timingSafeEqual(Buffer.from(bytes), sha(expected.rpId)))
    invalid(); }
function publicKey(wire: Uint8Array): {
    key: KeyObject;
    algorithm: -7 | -257;
    signatureBytes: number;
} {
    const value = decodeCbor(wire).value;
    if (!(value instanceof Map))
        invalid();
    const kty = value.get(1), alg = value.get(3);
    let jwk: JsonWebKey;
    let signatureBytes: number;
    if (kty === 2 && alg === -7) {
        if (value.size !== 5 || ![1, 3, -1, -2, -3].every(k => value.has(k)) || value.get(-1) !== 1)
            invalid();
        const x = value.get(-2), y = value.get(-3);
        if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.byteLength !== 32 || y.byteLength !== 32)
            invalid();
        jwk = { kty: 'EC', crv: 'P-256', x: encodeBase64url(x), y: encodeBase64url(y) };
        signatureBytes = 72;
    }
    else if (kty === 3 && alg === -257) {
        if (value.size !== 4 || ![1, 3, -1, -2].every(k => value.has(k)))
            invalid();
        const n = value.get(-1), e = value.get(-2);
        if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array) || n.byteLength < 256 || n.byteLength > 512 || n[0] === 0 || e.byteLength === 0 || e.byteLength > 4 || e[0] === 0)
            invalid();
        const bits = (n.byteLength - 1) * 8 + (32 - Math.clz32(n[0]!));
        let exponent = 0;
        for (const byte of e)
            exponent = exponent * 256 + byte;
        if (bits < 2048 || bits > 4096 || exponent < 3 || exponent % 2 !== 1)
            invalid();
        jwk = { kty: 'RSA', n: encodeBase64url(n), e: encodeBase64url(e) };
        signatureBytes = n.byteLength;
    }
    else
        return invalid();
    let key: KeyObject;
    try {
        key = createPublicKey({ key: jwk, format: 'jwk' });
    }
    catch {
        return invalid();
    }
    if ((alg === -7 && (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')) || (alg === -257 && (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength! < 2048 || key.asymmetricKeyDetails?.modulusLength! > 4096)))
        invalid();
    return { key, algorithm: alg, signatureBytes };
}
/** Structural DER framing only. No integer conversion, arithmetic, unwrap or ASN.1 dependency. */
function der(signature: Uint8Array): void {
    if (signature.byteLength < 8 || signature.byteLength > 72 || signature[0] !== 0x30 || signature[1] !== signature.byteLength - 2)
        invalid();
    let offset = 2;
    for (let i = 0; i < 2; i++) {
        if (signature[offset++] !== 2)
            invalid();
        const size = signature[offset++];
        if (size === undefined || size < 1 || size > 33 || offset + size > signature.length || (signature[offset]! & 0x80) !== 0 || (size > 1 && signature[offset] === 0 && (signature[offset + 1]! & 0x80) === 0))
            invalid();
        offset += size;
    }
    if (offset !== signature.length)
        invalid();
}
export function verifyRegistration(input: unknown, expected: CeremonyExpectation): Readonly<{
    credentialId: string;
    publicKey: string;
    counter: number;
    algorithm: -7 | -257;
}> {
    bodyBound(input);
    const parsed = WebAuthnRegistrationCredentialSchema.safeParse(input);
    if (!parsed.success)
        invalid();
    const c = parsed.data;
    const id = decodeBase64url(c.rawId, 768);
    if (c.id !== c.rawId)
        invalid();
    const decoded = [decodeBase64url(c.response.clientDataJSON, 4096), decodeBase64url(c.response.attestationObject, 16384)];
    let aggregate = id.byteLength + decoded.reduce((n, x) => n + x.byteLength, 0);
    for (const value of [c.response.publicKey, c.response.authenticatorData])
        if (value !== undefined)
            aggregate += decodeBase64url(value, 8192).byteLength;
    if (aggregate > 24576)
        invalid();
    client(decoded[0]!, expected, 'webauthn.create');
    const att = decodeCbor(decoded[1]!).value;
    if (!(att instanceof Map) || att.size !== 3 || att.get('fmt') !== 'none' || !(att.get('attStmt') instanceof Map) || (att.get('attStmt') as Map<unknown, unknown>).size !== 0 || !(att.get('authData') instanceof Uint8Array))
        invalid();
    const auth = parseAuthenticatorData(att.get('authData') as Uint8Array, true);
    rp(auth.rpIdHash, expected);
    if (!auth.credentialId || !auth.coseKey || id.byteLength !== auth.credentialId.byteLength || !timingSafeEqual(Buffer.from(id), Buffer.from(auth.credentialId)))
        invalid();
    const key = publicKey(auth.coseKey);
    return Object.freeze({ credentialId: c.id, publicKey: encodeBase64url(auth.coseKey), counter: auth.counter, algorithm: key.algorithm });
}
export function verifyAssertion(input: unknown, stored: StoredCredential, expected: CeremonyExpectation): Readonly<{
    credentialId: string;
    counter: number;
}> {
    bodyBound(input);
    const parsed = WebAuthnAuthenticationCredentialSchema.safeParse(input);
    if (!parsed.success)
        invalid();
    const c = parsed.data;
    if (c.id !== c.rawId || c.id !== stored.credentialId)
        invalid();
    const id = decodeBase64url(c.rawId, 768), clientBytes = decodeBase64url(c.response.clientDataJSON, 4096), authBytes = decodeBase64url(c.response.authenticatorData, 8192), signature = decodeBase64url(c.response.signature, 512);
    let aggregate = id.byteLength + clientBytes.byteLength + authBytes.byteLength + signature.byteLength;
    if (c.response.userHandle != null) {
        const handle = decodeBase64url(c.response.userHandle, 32);
        if (handle.byteLength !== 32 || hash(handle) !== stored.userHandleSha256)
            invalid();
        aggregate += handle.byteLength;
    }
    if (aggregate > 24576)
        invalid();
    client(clientBytes, expected, 'webauthn.get');
    const auth = parseAuthenticatorData(authBytes, false);
    rp(auth.rpIdHash, expected);
    if (!Number.isInteger(stored.counter) || stored.counter < 0 || stored.counter > 4294967295 || (stored.counter > 0 && auth.counter <= stored.counter))
        invalid();
    const key = publicKey(decodeBase64url(stored.publicKey, 8192));
    if (key.algorithm === -7)
        der(signature);
    else if (signature.byteLength !== key.signatureBytes)
        invalid();
    const payload = Buffer.concat([authBytes, sha(clientBytes)]);
    let accepted = false;
    try {
        accepted = verify('sha256', payload, key.algorithm === -7 ? { key: key.key, dsaEncoding: 'der' } : { key: key.key, padding: constants.RSA_PKCS1_PADDING }, signature);
    }
    catch {
        return invalid();
    }
    if (!accepted)
        invalid();
    return Object.freeze({ credentialId: c.id, counter: auth.counter });
}
