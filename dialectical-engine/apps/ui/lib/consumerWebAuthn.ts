import type { ConsumerAuthenticationCredential, ConsumerRegistrationCredential, ConsumerAuthenticationOptions, ConsumerRegistrationOptions } from '@debateai/contract';
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const encode = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function authenticateConsumerPasskey(options: ConsumerAuthenticationOptions): Promise<ConsumerAuthenticationCredential> {
    const credential = await navigator.credentials.get({ publicKey: { ...options, challenge: decode(options.challenge), ...(options.allowCredentials ? { allowCredentials: options.allowCredentials.map(c => ({ ...c, id: decode(c.id) })) } : {}) } as PublicKeyCredentialRequestOptions }) as PublicKeyCredential | null;
    if (!credential)
        throw new Error('PASSKEY_CANCELLED');
    const response = credential.response as AuthenticatorAssertionResponse;
    return { id: credential.id, rawId: encode(credential.rawId), type: 'public-key', response: { clientDataJSON: encode(response.clientDataJSON), authenticatorData: encode(response.authenticatorData), signature: encode(response.signature), ...(response.userHandle ? { userHandle: encode(response.userHandle) } : {}) }, clientExtensionResults: credential.getClientExtensionResults() };
}
export async function registerConsumerPasskey(options: ConsumerRegistrationOptions): Promise<ConsumerRegistrationCredential> {
    const credential = await navigator.credentials.create({ publicKey: { ...options, challenge: decode(options.challenge), user: { ...options.user, id: decode(options.user.id) }, ...(options.excludeCredentials ? { excludeCredentials: options.excludeCredentials.map(c => ({ ...c, id: decode(c.id) })) } : {}) } as PublicKeyCredentialCreationOptions }) as PublicKeyCredential | null;
    if (!credential)
        throw new Error('PASSKEY_CANCELLED');
    const response = credential.response as AuthenticatorAttestationResponse;
    return { id: credential.id, rawId: encode(credential.rawId), type: 'public-key', response: { clientDataJSON: encode(response.clientDataJSON), attestationObject: encode(response.attestationObject), transports: response.getTransports() as ('usb' | 'nfc' | 'ble' | 'smart-card' | 'hybrid' | 'internal')[] }, clientExtensionResults: credential.getClientExtensionResults() };
}
