/** SPDX-License-Identifier: MIT
 * Adapted layout/encoding/schema portions: Copyright (c) 2020 Matthew Miller;
 * Full retained notices and symbol provenance: third_party/webauthn/ADAPTATIONS.md.
 */
/** Native browser encoding/cancellation patterns adapted under MIT.
 * Symbol provenance and retained notices: third_party/webauthn/ADAPTATIONS.md. */
import { StaffRegistrationOptionsResponseSchema, StaffAuthenticationOptionsResponseSchema, WebAuthnRegistrationCredentialSchema, WebAuthnAuthenticationCredentialSchema } from '@debateai/contract';
import type { z } from 'zod';
type CreationOptions = z.infer<typeof StaffRegistrationOptionsResponseSchema>;
type RequestOptions = z.infer<typeof StaffAuthenticationOptionsResponseSchema>;
function invalid(): never { throw new Error('STAFF_WEBAUTHN_INVALID'); }
export function staffEncodeBase64url(input: ArrayBuffer | ArrayBufferView, maxBytes: number): string {
    const bytes = ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes)
        invalid();
    let binary = '';
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=/gu, '');
}
export function staffDecodeBase64url(value: string, maxBytes: number): ArrayBuffer {
    if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maxBytes * 4 / 3) || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/u.test(value))
        invalid();
    let binary: string;
    try {
        binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/'));
    }
    catch {
        return invalid();
    }
    if (binary.length > maxBytes)
        invalid();
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i);
    if (staffEncodeBase64url(bytes, maxBytes) !== value)
        invalid();
    return bytes.buffer;
}
function bounded(value: unknown): void { try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 32768)
        invalid();
}
catch {
    return invalid();
} }
function descriptors(values: CreationOptions['options']['excludeCredentials']): PublicKeyCredentialDescriptor[] { return values.map(value => ({ type: 'public-key', id: staffDecodeBase64url(value.id, 768), ...(value.transports === undefined ? {} : { transports: value.transports as AuthenticatorTransport[] }) })); }
function raw(value: Credential | null): PublicKeyCredential {
    if (value === null || value.type !== 'public-key' || !('response' in value) || !('rawId' in value))
        invalid();
    return value as PublicKeyCredential;
}
/** One active ceremony per instance. Cancellation grants no server authority. */
export function createStaffWebAuthnBrowser() {
    let active: AbortController | null = null;
    const cancel = () => { active?.abort(); active = null; };
    const start = () => { if (typeof navigator === 'undefined' || typeof PublicKeyCredential === 'undefined' || !navigator.credentials || typeof navigator.credentials.create !== 'function' || typeof navigator.credentials.get !== 'function')
        throw new Error('STAFF_WEBAUTHN_UNSUPPORTED'); cancel(); const controller = new AbortController(); active = controller; return controller; };
    const complete = (controller: AbortController) => { if (controller.signal.aborted)
        throw new Error('STAFF_WEBAUTHN_CANCELLED'); };
    const nativeFailure = (controller: AbortController): never => { if (controller.signal.aborted)
        throw new Error('STAFF_WEBAUTHN_CANCELLED'); throw new Error('STAFF_WEBAUTHN_FAILED'); };
    return Object.freeze({ cancel,
        async register(input: CreationOptions): Promise<z.infer<typeof WebAuthnRegistrationCredentialSchema>> {
            bounded(input);
            const parsed = StaffRegistrationOptionsResponseSchema.safeParse(input);
            if (!parsed.success)
                invalid();
            const o = parsed.data.options;
            staffDecodeBase64url(parsed.data.challenge_handle, 32);
            const challenge = staffDecodeBase64url(o.challenge, 32), userId = staffDecodeBase64url(o.user.id, 32);
            if (challenge.byteLength !== 32 || userId.byteLength !== 32)
                invalid();
            const publicKey: PublicKeyCredentialCreationOptions = { ...o, challenge, user: { ...o.user, id: userId }, pubKeyCredParams: o.pubKeyCredParams, excludeCredentials: descriptors(o.excludeCredentials) };
            const controller = start();
            try {
                let result: Credential | null;
                try {
                    result = await navigator.credentials.create({ publicKey, signal: controller.signal });
                }
                catch {
                    return nativeFailure(controller);
                }
                complete(controller);
                const c = raw(result), response = c.response as AuthenticatorAttestationResponse;
                const serialized = { id: c.id, rawId: staffEncodeBase64url(c.rawId, 768), type: 'public-key' as const, response: { clientDataJSON: staffEncodeBase64url(response.clientDataJSON, 4096), attestationObject: staffEncodeBase64url(response.attestationObject, 16384), ...(typeof response.getTransports === 'function' ? { transports: response.getTransports() } : {}) }, clientExtensionResults: c.getClientExtensionResults() };
                bounded(serialized);
                const checked = WebAuthnRegistrationCredentialSchema.safeParse(serialized);
                if (!checked.success || checked.data.id !== checked.data.rawId)
                    invalid();
                if (staffDecodeBase64url(serialized.response.clientDataJSON, 4096).byteLength + staffDecodeBase64url(serialized.response.attestationObject, 16384).byteLength + staffDecodeBase64url(serialized.rawId, 768).byteLength > 24576)
                    invalid();
                return checked.data;
            }
            finally {
                if (active === controller)
                    active = null;
            }
        },
        async authenticate(input: RequestOptions): Promise<z.infer<typeof WebAuthnAuthenticationCredentialSchema>> {
            bounded(input);
            const parsed = StaffAuthenticationOptionsResponseSchema.safeParse(input);
            if (!parsed.success)
                invalid();
            const o = parsed.data.options;
            staffDecodeBase64url(parsed.data.challenge_handle, 32);
            const challenge = staffDecodeBase64url(o.challenge, 32);
            if (challenge.byteLength !== 32)
                invalid();
            const publicKey: PublicKeyCredentialRequestOptions = { ...o, challenge, allowCredentials: descriptors(o.allowCredentials) };
            const controller = start();
            try {
                let result: Credential | null;
                try {
                    result = await navigator.credentials.get({ publicKey, signal: controller.signal });
                }
                catch {
                    return nativeFailure(controller);
                }
                complete(controller);
                const c = raw(result), response = c.response as AuthenticatorAssertionResponse;
                const serialized = { id: c.id, rawId: staffEncodeBase64url(c.rawId, 768), type: 'public-key' as const, response: { clientDataJSON: staffEncodeBase64url(response.clientDataJSON, 4096), authenticatorData: staffEncodeBase64url(response.authenticatorData, 8192), signature: staffEncodeBase64url(response.signature, 512), userHandle: response.userHandle === null ? null : staffEncodeBase64url(response.userHandle, 32) }, clientExtensionResults: c.getClientExtensionResults() };
                bounded(serialized);
                const checked = WebAuthnAuthenticationCredentialSchema.safeParse(serialized);
                if (!checked.success || checked.data.id !== checked.data.rawId)
                    invalid();
                if (serialized.response.userHandle !== null && staffDecodeBase64url(serialized.response.userHandle, 32).byteLength !== 32)
                    invalid();
                const sizes = staffDecodeBase64url(serialized.rawId, 768).byteLength + staffDecodeBase64url(serialized.response.clientDataJSON, 4096).byteLength + staffDecodeBase64url(serialized.response.authenticatorData, 8192).byteLength + staffDecodeBase64url(serialized.response.signature, 512).byteLength + (serialized.response.userHandle === null ? 0 : 32);
                if (sizes > 24576)
                    invalid();
                return checked.data;
            }
            finally {
                if (active === controller)
                    active = null;
            }
        }
    });
}
