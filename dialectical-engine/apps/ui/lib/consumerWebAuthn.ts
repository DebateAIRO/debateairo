import { ConsumerAuthenticationCredentialSchema, ConsumerRegistrationCredentialSchema, ConsumerAuthenticationOptionsSchema, ConsumerRegistrationOptionsSchema, type ConsumerAuthenticationCredential, type ConsumerRegistrationCredential, type ConsumerAuthenticationOptions, type ConsumerRegistrationOptions } from '@debateai/contract';
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
function encode(value: ArrayBuffer): string {
    const bytes = new Uint8Array(value);
    if (bytes.byteLength > 32768)
        throw new TypeError('PASSKEY_RESPONSE_TOO_LARGE');
    let binary = '';
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export interface ConsumerWebAuthnBrowser {
    register(options: ConsumerRegistrationOptions, signal?: AbortSignal): Promise<ConsumerRegistrationCredential>;
    authenticate(options: ConsumerAuthenticationOptions, request?: {
        mediation?: 'conditional' | 'optional' | 'required';
        signal?: AbortSignal;
    }): Promise<ConsumerAuthenticationCredential>;
    supportsConditional(): Promise<boolean>;
    cancel(): void;
}
/** Each owner gets a cancellable adapter; raw browser output is bounded by the shared contracts. */
export function createConsumerWebAuthnBrowser(): ConsumerWebAuthnBrowser {
    let current: AbortController | null = null;
    function signal(external?: AbortSignal): AbortSignal {
        current?.abort();
        current = new AbortController();
        const owner = current;
        if (external?.aborted)
            owner.abort();
        else
            external?.addEventListener('abort', () => owner.abort(), { once: true, signal: owner.signal });
        return owner.signal;
    }
    return {
        cancel() {
            current?.abort();
            current = null;
        },
        async supportsConditional() {
            try {
                return typeof PublicKeyCredential !== 'undefined' && typeof PublicKeyCredential.isConditionalMediationAvailable === 'function' && await PublicKeyCredential.isConditionalMediationAvailable();
            }
            catch {
                return false;
            }
        },
        async authenticate(input, request = {}) {
            const options = ConsumerAuthenticationOptionsSchema.parse(input);
            const credential = await navigator.credentials.get({
                ...(request.mediation ? { mediation: request.mediation } : {}), signal: signal(request.signal),
                publicKey: { ...options, challenge: decode(options.challenge), ...(options.allowCredentials ? { allowCredentials: options.allowCredentials.map(c => ({ ...c, id: decode(c.id) })) } : {}) } as PublicKeyCredentialRequestOptions
            }) as PublicKeyCredential | null;
            if (!credential)
                throw new DOMException('PASSKEY_CANCELLED', 'NotAllowedError');
            const response = credential.response as AuthenticatorAssertionResponse;
            return ConsumerAuthenticationCredentialSchema.parse({ id: credential.id, rawId: encode(credential.rawId), type: 'public-key', response: { clientDataJSON: encode(response.clientDataJSON), authenticatorData: encode(response.authenticatorData), signature: encode(response.signature), ...(response.userHandle ? { userHandle: encode(response.userHandle) } : {}) }, clientExtensionResults: credential.getClientExtensionResults(), ...(credential.authenticatorAttachment ? { authenticatorAttachment: credential.authenticatorAttachment } : {}) });
        },
        async register(input, external) {
            const options = ConsumerRegistrationOptionsSchema.parse(input);
            const credential = await navigator.credentials.create({ signal: signal(external), publicKey: { ...options, challenge: decode(options.challenge), user: { ...options.user, id: decode(options.user.id) }, ...(options.excludeCredentials ? { excludeCredentials: options.excludeCredentials.map(c => ({ ...c, id: decode(c.id) })) } : {}) } as PublicKeyCredentialCreationOptions }) as PublicKeyCredential | null;
            if (!credential)
                throw new DOMException('PASSKEY_CANCELLED', 'NotAllowedError');
            const response = credential.response as AuthenticatorAttestationResponse;
            return ConsumerRegistrationCredentialSchema.parse({ id: credential.id, rawId: encode(credential.rawId), type: 'public-key', response: { clientDataJSON: encode(response.clientDataJSON), attestationObject: encode(response.attestationObject), ...(typeof response.getTransports === 'function' ? { transports: response.getTransports() } : {}) }, clientExtensionResults: credential.getClientExtensionResults(), ...(credential.authenticatorAttachment ? { authenticatorAttachment: credential.authenticatorAttachment } : {}) });
        }
    };
}
// Kept for the shipped social consumers; all serialization and UV checks have one owner.
export const authenticateConsumerPasskey = (options: ConsumerAuthenticationOptions) => createConsumerWebAuthnBrowser().authenticate(options);
export const registerConsumerPasskey = (options: ConsumerRegistrationOptions) => createConsumerWebAuthnBrowser().register(options);
