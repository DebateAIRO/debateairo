import { createHash, randomBytes } from 'node:crypto';
import { generateRegistrationOptions, generateAuthenticationOptions } from '@simplewebauthn/server';
import { BeginPasskeyEnrollmentRequestSchema, CompletePasskeyEnrollmentRequestSchema, BeginPasskeyLoginRequestSchema, CompletePasskeyLoginRequestSchema, PasskeyRegistrationOptionsResponseSchema, PasskeyAuthenticationOptionsResponseSchema, type PasskeyRegistrationOptionsResponse, type PasskeyAuthenticationOptionsResponse } from '@debateai/contract';
import { hashToken } from '@debateai/crypto';
import { currentDocument, legalManifestLocales } from '@debateai/legal-manifest';
import type { AuthSourceContext, PostgresConsumerAuthRepository, ConsumerLegalPair, ConsumerSessionPersistence } from '@debateai/db';
import { AuthFlowError } from './registration.js';
import type { AuthenticatedSession, ConsumerSessionMaterial, ConsumerSessionProducer, LoginResult } from './sessions.js';
import { verifyConsumerRegistration, verifyConsumerAuthentication } from './consumer-webauthn-verifier.js';
export interface ConsumerWebAuthnApplication {
    beginPasskeyEnrollment(input: unknown, source: AuthSourceContext, session?: AuthenticatedSession): Promise<PasskeyRegistrationOptionsResponse>;
    completePasskeyEnrollment(input: unknown, source: AuthSourceContext, session?: AuthenticatedSession): Promise<LoginResult | Readonly<{
        status: 'enrolled';
    }>>;
    beginPasskeyLogin(input: unknown, source: AuthSourceContext): Promise<PasskeyAuthenticationOptionsResponse>;
    completePasskeyLogin(input: unknown, source: AuthSourceContext): Promise<LoginResult>;
}
type Repository = Pick<PostgresConsumerAuthRepository, 'beginEnrollment' | 'beginLogin' | 'readChallenge' | 'readCredential' | 'completeEnrollment' | 'completeLogin'>;
const random = () => randomBytes(32).toString('base64url');
/** Handle namespaces prevent an opaque value from silently changing purpose. */
const handleHash = (kind: 'ENROLLMENT' | 'LOGIN', value: string) => 'sha256:' + createHash('sha256').update('consumer-passkey:' + kind + '\0').update(value).digest('hex');
const challengeHash = (value: string) => 'sha256:' + createHash('sha256').update(value).digest('hex');
function bounded(input: unknown): void {
    if (Buffer.byteLength(JSON.stringify(input) ?? '', 'utf8') > 32768)
        throw new AuthFlowError('AUTH_INPUT_INVALID');
}
/** Only this allowlist crosses to SQL: raw session and CSRF bearers remain inside SessionService/the cookie projection. */
function persistence(m: ConsumerSessionMaterial): ConsumerSessionPersistence {
    return { sessionId: m.sessionId, sessionTokenHash: m.sessionTokenHash, csrfTokenHash: m.csrfTokenHash, sessionBindingContext: m.sessionBindingContext, idleExpiresAt: m.idleExpiresAt, absoluteExpiresAt: m.absoluteExpiresAt };
}
export class ConsumerWebAuthnService implements ConsumerWebAuthnApplication {
    private readonly origin: string;
    private readonly rpId: string;
    private readonly legal: readonly ConsumerLegalPair[];
    constructor(private readonly repository: Repository, private readonly sessions: ConsumerSessionProducer, configuration: Readonly<{
        publicAppUrl: string;
        rpId?: string;
    }>) {
        const url = new URL(configuration.publicAppUrl);
        if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '')
            throw new TypeError('CONSUMER_WEBAUTHN_CONFIGURATION_INVALID');
        this.origin = url.origin;
        this.rpId = configuration.rpId ?? url.hostname;
        if (this.rpId !== url.hostname)
            throw new TypeError('CONSUMER_WEBAUTHN_CONFIGURATION_INVALID');
        this.legal = Object.freeze((['TERMS', 'PRIVACY'] as const).flatMap(kind => legalManifestLocales(kind).map(locale => ({ kind, locale, ...currentDocument(kind, locale)! }))));
    }
    private seed(kind: 'ENROLLMENT' | 'LOGIN', source: AuthSourceContext) {
        const handle = random(), challenge = random();
        return { handle, challenge, seed: { handleHash: handleHash(kind, handle), challengeHash: challengeHash(challenge), bindingHash: this.sessions.bindingHash(source), origin: this.origin, rpId: this.rpId } };
    }
    async beginPasskeyEnrollment(input: unknown, source: AuthSourceContext, session?: AuthenticatedSession): Promise<PasskeyRegistrationOptionsResponse> {
        bounded(input);
        const parsed = BeginPasskeyEnrollmentRequestSchema.parse(input), { handle, challenge, seed } = this.seed('ENROLLMENT', source);
        if ('step_up_grant' in parsed && session === undefined)
            throw new AuthFlowError('AUTH_CREDENTIALS_INVALID');
        try {
            const authority = 'enrollment_token' in parsed ? { enrollmentTokenHash: hashToken('verification', parsed.enrollment_token) }
                : { userId: session!.userId, sessionId: session!.session.session_id, tokenHash: session!.tokenHash, grantHash: hashToken('step-up-grant', parsed.step_up_grant) };
            const result = await this.repository.beginEnrollment({ ...seed, ...authority, userHandle: random() }, this.legal, source);
            const options = await generateRegistrationOptions({ rpName: 'Dialectical Engine', rpID: this.rpId, challenge: new Uint8Array(Buffer.from(challenge, 'base64url')), userID: new Uint8Array(Buffer.from(result.userHandle, 'base64url')),
                userName: result.userHandle, userDisplayName: 'Dialectical Engine account', timeout: 300000, attestationType: 'none', supportedAlgorithmIDs: [-7, -257],
                authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
                excludeCredentials: result.excludeCredentials.map(c => ({ id: c.id })), extensions: { credProps: true } });
            return PasskeyRegistrationOptionsResponseSchema.parse({ challenge_handle: handle, expires_at: new Date(result.expiresAt).toISOString(), options });
        }
        catch (error) {
            throw this.failure(error);
        }
    }
    async completePasskeyEnrollment(input: unknown, source: AuthSourceContext, session?: AuthenticatedSession): Promise<LoginResult | Readonly<{
        status: 'enrolled';
    }>> {
        bounded(input);
        const parsed = CompletePasskeyEnrollmentRequestSchema.parse(input), hash = handleHash('ENROLLMENT', parsed.challenge_handle), bindingHash = this.sessions.bindingHash(source);
        try {
            const c = await this.repository.readChallenge(hash, 'ENROLLMENT', bindingHash);
            if (c === null || c.origin !== this.origin || c.rpId !== this.rpId || (c.purpose === 'ADD_PASSKEY' && (session === undefined || session.userId !== c.userId)))
                throw new Error('CONSUMER_AUTH_INVALID');
            const verified = await verifyConsumerRegistration(parsed.credential, c);
            const material = c.purpose === 'INITIAL_ENROLLMENT' ? this.sessions.prepare(source) : undefined;
            const committed = await this.repository.completeEnrollment({ ...verified, handleHash: hash, challengeHash: c.challengeHash, bindingHash,
                ...(parsed.label === undefined ? {} : { label: parsed.label }), ...(material === undefined ? { sessionId: session!.session.session_id, tokenHash: session!.tokenHash } : { material: persistence(material) }) }, this.legal, source);
            if (material === undefined)
                return Object.freeze({ status: 'enrolled' });
            if (committed.sessionId !== material.sessionId)
                throw new Error('CONSUMER_SESSION_INVALID');
            return this.sessions.committed(material, committed, source);
        }
        catch (error) {
            throw this.failure(error);
        }
    }
    async beginPasskeyLogin(input: unknown = {}, source: AuthSourceContext): Promise<PasskeyAuthenticationOptionsResponse> {
        bounded(input);
        const parsed = BeginPasskeyLoginRequestSchema.parse(input), { handle, challenge, seed } = this.seed('LOGIN', source);
        try {
            const result = await this.repository.beginLogin({ ...seed, ...(parsed.continuation_token === undefined ? {} : { continuationHash: hashToken('login-challenge', parsed.continuation_token) }) });
            const { extensions: _extensions, ...options } = await generateAuthenticationOptions({ rpID: this.rpId, challenge: new Uint8Array(Buffer.from(challenge, 'base64url')), timeout: 300000, userVerification: 'required' });
            return PasskeyAuthenticationOptionsResponseSchema.parse({ challenge_handle: handle, expires_at: new Date(result.expiresAt).toISOString(), options });
        }
        catch (error) {
            throw this.failure(error);
        }
    }
    async completePasskeyLogin(input: unknown, source: AuthSourceContext): Promise<LoginResult> {
        bounded(input);
        const parsed = CompletePasskeyLoginRequestSchema.parse(input), hash = handleHash('LOGIN', parsed.challenge_handle), bindingHash = this.sessions.bindingHash(source);
        try {
            const c = await this.repository.readChallenge(hash, 'LOGIN', bindingHash);
            if (c === null || c.origin !== this.origin || c.rpId !== this.rpId)
                throw new Error('CONSUMER_AUTH_INVALID');
            const credential = await this.repository.readCredential(hash, parsed.credential.id, bindingHash);
            if (credential === null || (c.userId !== null && c.userId !== credential.userId))
                throw new Error('CONSUMER_AUTH_INVALID');
            const verified = await verifyConsumerAuthentication(parsed.credential, credential, c), material = this.sessions.prepare(source);
            const committed = await this.repository.completeLogin({ ...credential, ...verified, handleHash: hash, challengeHash: c.challengeHash, bindingHash, material: persistence(material) }, source);
            if (committed.sessionId !== material.sessionId)
                throw new Error('CONSUMER_SESSION_INVALID');
            return this.sessions.committed(material, committed, source);
        }
        catch (error) {
            throw this.failure(error);
        }
    }
    private failure(error: unknown): Error {
        // Expected proof/state refusals are generic. Operational/audit failures remain visible to server diagnostics.
        if (error instanceof Error && (/^CONSUMER_(AUTH|WEBAUTHN)_INVALID$/.test(error.message) || ('code' in error && error.code === '23505')))
            return new AuthFlowError('AUTH_CREDENTIALS_INVALID');
        return error instanceof Error ? error : new Error('CONSUMER_AUTH_UNAVAILABLE');
    }
}
