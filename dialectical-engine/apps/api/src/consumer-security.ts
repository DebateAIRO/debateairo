import { createHash, randomBytes } from 'node:crypto';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { AuthMethodsResponseSchema, MfaRecoveryPendingCancelRequestSchema, MfaRecoveryPendingResponseSchema, type MfaRecoveryPendingResponse, BeginPasskeyStepUpRequestSchema, CompletePasskeyStepUpRequestSchema, PasskeyAuthenticationOptionsResponseSchema, RemoveAuthMethodRequestSchema, RegenerateRecoveryCodesRequestSchema, StepUpAuthorizationRequestSchema, type AuthMethodsResponse, type PasskeyAuthenticationOptionsResponse, type StepUpResponse } from '@debateai/contract';
import { generateRecoveryCodes, hashRecoveryCode, hashToken, type Argon2Executor } from '@debateai/crypto';
import type { AuthSourceContext, PostgresConsumerSecurityRepository, ProfileSession } from '@debateai/db';
import type { MfaPolicy, AuthPolicy } from '@debateai/register';
import type { AuthenticatedSession, ConsumerSessionProducer } from './sessions.js';
import { verifyConsumerAuthentication } from './consumer-webauthn-verifier.js';
import { AuthFlowError, consumerPasswordUsable } from './registration.js';
export { consumerPasswordUsable } from './registration.js';
export function parseConsumerSecurityInput<T>(schema: {
    safeParse(input: unknown): {
        success: true;
        data: T;
    } | {
        success: false;
    };
}, input: unknown): T {
    if (Buffer.byteLength(JSON.stringify(input) ?? '', 'utf8') > 32768)
        throw new AuthFlowError('AUTH_INPUT_INVALID');
    const result = schema.safeParse(input);
    if (!result.success)
        throw new AuthFlowError('AUTH_INPUT_INVALID');
    return result.data;
}
const random = () => randomBytes(32).toString('base64url');
const digest = (value: string) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const handleHash = (value: string) => digest('consumer-passkey:STEP_UP\0' + value);
export const consumerSecuritySession = (session: AuthenticatedSession): ProfileSession => ({ userId: session.userId, sessionId: session.session.session_id, tokenHash: session.tokenHash });
export interface ConsumerSecurityApplication {
    authMethods(session: AuthenticatedSession): Promise<AuthMethodsResponse>;
    pendingMfaRecovery(session: AuthenticatedSession): Promise<MfaRecoveryPendingResponse>;
    cancelPendingMfaRecovery(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<{ status: 'cancelled' }>;
    beginPasskeyStepUp(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<PasskeyAuthenticationOptionsResponse>;
    completePasskeyStepUp(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<Readonly<{
        sessionToken: string;
        response: StepUpResponse;
    }>>;
    removeAuthMethod(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<void>;
    regenerateRecoveryCodes(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<{
        codes: readonly string[];
    }>;
}
export class ConsumerSecurityService implements ConsumerSecurityApplication {
    private readonly origin: string;
    private readonly rpId: string;
    constructor(private readonly repository: PostgresConsumerSecurityRepository, private readonly sessions: ConsumerSessionProducer, private readonly dependencies: Readonly<{
        publicAppUrl: string;
        argon2: Argon2Executor;
        mfaPolicy: MfaPolicy;
        authPolicy: AuthPolicy;
    }>) {
        const u = new URL(dependencies.publicAppUrl);
        if (u.protocol !== 'https:' || u.pathname !== '/' || u.username || u.password || u.hash || u.search)
            throw new TypeError('CONSUMER_WEBAUTHN_CONFIGURATION_INVALID');
        this.origin = u.origin;
        this.rpId = u.hostname;
    }
    private async passwordPath(session: AuthenticatedSession) { const passwordHashSnapshot = await this.repository.readPasswordState(consumerSecuritySession(session)); return { admittedProviders:await this.sessions.socialBindings?.()??[],passwordHashSnapshot, passwordUsable: consumerPasswordUsable(passwordHashSnapshot, this.dependencies.authPolicy) }; }
    async authMethods(session: AuthenticatedSession): Promise<AuthMethodsResponse> { const record = await this.repository.authMethods(consumerSecuritySession(session), await this.passwordPath(session)) as AuthMethodsResponse; return AuthMethodsResponseSchema.parse({ ...record, methods: record.methods.map(method => ({ ...method, created_at: new Date(method.created_at).toISOString(), last_used_at: method.last_used_at === null ? null : new Date(method.last_used_at).toISOString() })) }); }
    /** Owner ruling 2026-10-09: any signed-in session sees an authenticator recovery that is waiting its 24 hours, and can cancel it. */
    async pendingMfaRecovery(session: AuthenticatedSession): Promise<MfaRecoveryPendingResponse> { const record = await this.repository.pendingMfaRecovery(consumerSecuritySession(session)); return MfaRecoveryPendingResponseSchema.parse({ pending: record === null ? null : { not_before: new Date(record.notBefore).toISOString(), started_at: new Date(record.waitingAt).toISOString() } }); }
    async cancelPendingMfaRecovery(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<{ status: 'cancelled' }> { parseConsumerSecurityInput(MfaRecoveryPendingCancelRequestSchema, input); if (await this.repository.cancelPendingMfaRecovery(consumerSecuritySession(session), source) !== 'CANCELLED') throw new AuthFlowError('MFA_ENROLLMENT_STATE_INVALID'); return { status: 'cancelled' }; }
    async beginPasskeyStepUp(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<PasskeyAuthenticationOptionsResponse> {
        const parsed = parseConsumerSecurityInput(BeginPasskeyStepUpRequestSchema, input), admission = await this.sessions.admit('STEP_UP_BEGIN', session.userId, source), handle = random(), challenge = random();
        const result = await this.repository.beginStepUp({ ...admission, ...consumerSecuritySession(session), handleHash: handleHash(handle), challengeHash: digest(challenge), bindingHash: this.sessions.bindingHash(source), rpId: this.rpId, origin: this.origin, authorization: parsed.authorization });
        const { extensions: _extensions, ...options } = await generateAuthenticationOptions({ rpID: this.rpId, challenge: new Uint8Array(Buffer.from(challenge, 'base64url')), timeout: 300000, userVerification: 'required' });
        return PasskeyAuthenticationOptionsResponseSchema.parse({ challenge_handle: handle, expires_at: new Date(result.expiresAt).toISOString(), options });
    }
    async completePasskeyStepUp(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<{
        sessionToken: string;
        response: StepUpResponse;
    }> {
        const parsed = parseConsumerSecurityInput(CompletePasskeyStepUpRequestSchema, input);
        await this.sessions.admit('STEP_UP_COMPLETE', parsed.challenge_handle, source);
        const lookup = { ...consumerSecuritySession(session), handleHash: handleHash(parsed.challenge_handle), bindingHash: this.sessions.bindingHash(source), credentialId: parsed.credential.id };
        const record = await this.repository.readStepUp(lookup);
        if (record === null || record.origin !== this.origin || record.rpId !== this.rpId)
            throw new AuthFlowError('AUTH_CREDENTIALS_INVALID');
        const verified = await verifyConsumerAuthentication(parsed.credential, record, record), sessionToken = random(), csrfToken = random(), grantToken = random();
        const committed = await this.repository.completeStepUp({ ...record, ...verified, ...lookup, replacementTokenHash: hashToken('session', sessionToken), replacementCsrfHash: hashToken('csrf', csrfToken), grantHash: hashToken('step-up-grant', grantToken) }, source);
        const authorization = StepUpAuthorizationRequestSchema.parse(committed.authorization);
        return { sessionToken, response: { status: 'step_up_complete', csrf_token: csrfToken, step_up_grant: { ...authorization, token: grantToken, expires_at: new Date(committed.expiresAt).toISOString() } } };
    }
    async removeAuthMethod(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<void> { const p = parseConsumerSecurityInput(RemoveAuthMethodRequestSchema, input); await this.sessions.admit('AUTH_METHOD_REMOVE', session.userId, source); await this.repository.removeAuthMethod(consumerSecuritySession(session), p.factor_id, hashToken('step-up-grant', p.step_up_grant), await this.passwordPath(session), source); }
    async regenerateRecoveryCodes(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<{
        codes: readonly string[];
    }> {
        const p = parseConsumerSecurityInput(RegenerateRecoveryCodesRequestSchema, input);
        await this.sessions.admit('SECURITY_CODES', session.userId, source);
        const codes = generateRecoveryCodes(), hashes: string[] = [];
        for (const code of codes)
            hashes.push(await hashRecoveryCode(this.dependencies.argon2, code, this.dependencies.mfaPolicy.recoveryCodes.argon2id));
        await this.repository.regenerateRecoveryCodes(consumerSecuritySession(session), hashToken('step-up-grant', p.step_up_grant), hashes, source);
        return { codes };
    }
}
