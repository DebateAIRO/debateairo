import { createHmac, randomBytes, randomUUID, hkdfSync } from 'node:crypto';
import { SocialLoginStatusRequestSchema, SocialLoginStatusResponseSchema, type SocialLoginStatusResponse, BeginSocialStepUpRequestSchema, BeginSocialLoginRequestSchema, BeginSocialLinkRequestSchema, SocialSignupStatusRequestSchema, CompleteSocialSignupRequestSchema, UnlinkSocialProviderRequestSchema, SocialLinksResponseSchema, type AuthProvidersResponse, type SocialSignupStatusResponse, type SocialLinksResponse } from '@debateai/contract';
import { createEmailBlindIndex, hashToken } from '@debateai/crypto';
import type { AuthSourceContext, PostgresSocialIdentityRepository, PostgresConsumerSecurityRepository } from '@debateai/db';
import type { AuthPolicy } from '@debateai/register';
import { consumerPasswordUsable, consumerSecuritySession, parseConsumerSecurityInput } from './consumer-security.js';
import { AuthFlowError, type AuthSourceAdmission, type RegistrationService, type RegistrationSource, type SocialRegistrationResult } from './registration.js';
import type { AuthenticatedSession, ConsumerSessionProducer } from './sessions.js';
import { SocialProviders, socialAuthorizationUrl, type SocialProvider, type SocialProviderConfiguration } from './social-providers/provider.js';
import { socialName } from './social-providers/oidc.js';
import { dobFromIso, meetsMinimumAge } from '@debateai/kernel';
import { socialHash } from './social-providers/hashes.js';
export const SOCIAL_BROWSER_COOKIE = '__Host-debateai-social-browser';
export const SOCIAL_FLOW_COOKIE = '__Host-debateai-social-flow';
export const SOCIAL_APPLE_FLOW_COOKIE = '__Host-debateai-social-apple';
const random = () => randomBytes(32).toString('base64url');
export class SocialAuthError extends Error {
    readonly statusCode: 400 | 503;
    constructor(readonly code: 'SOCIAL_PROOF_INVALID' | 'SOCIAL_PROVIDER_UNAVAILABLE') { super(code); this.statusCode = code === 'SOCIAL_PROVIDER_UNAVAILABLE' ? 503 : 400; }
}
export interface SocialAuthApplication {
    authProviders(): Promise<AuthProvidersResponse>;
    begin(provider: SocialProvider, input: unknown, source: AuthSourceContext, session?: AuthenticatedSession): Promise<{
        authorization_url: string;
        flowCookie: string;
        expiresAt: string;
    }>;
    beginStepUp(provider: SocialProvider, input: unknown, source: AuthSourceContext, session: AuthenticatedSession): Promise<{
        authorization_url: string;
        flowCookie: string;
        expiresAt: string;
    }>;
    callback(provider: SocialProvider, input: unknown, flowCookie: string | null, source: AuthSourceContext): Promise<{
        status: 'linked' | 'mfa_required' | 'signup_required' | 'provider_step_up_required';
        token: string;
        browserCookie: string;
        next: string;
        expiresAt: string;
    }>;
    loginStatus(input: unknown, source: AuthSourceContext): Promise<SocialLoginStatusResponse>;
    signupStatus(input: unknown, source: AuthSourceContext): Promise<SocialSignupStatusResponse>;
    completeSignup(input: unknown, source: RegistrationSource, admission: AuthSourceAdmission): Promise<SocialRegistrationResult>;
    linked(session: AuthenticatedSession): Promise<SocialLinksResponse>;
    unlink(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<void>;
}
export class SocialAuthService implements SocialAuthApplication {
    private readonly flowKey: Buffer;
    private readonly prefill = new Map<string, {
        email: string | null;
        name: string | null;
        until: number;
        timeout: ReturnType<typeof setTimeout>;
    }>();
    constructor(private readonly repository: PostgresSocialIdentityRepository, private readonly providers: SocialProviders, private readonly sessions: ConsumerSessionProducer, private readonly dependencies: Readonly<{
        registration: RegistrationService;
        security: PostgresConsumerSecurityRepository;
        authPolicy: AuthPolicy;
        blindIndexKey: Uint8Array;
        clock?: () => Date;
    }>) {
        this.flowKey = Buffer.from(hkdfSync('sha256', dependencies.blindIndexKey, Buffer.from('debateai:social:v1'), Buffer.from('state-derived-nonce-and-pkce'), 32));
    }
    private now() { return this.dependencies.clock?.() ?? new Date(); }
    private derived(purpose: 'nonce' | 'pkce', state: string) { return createHmac('sha256', this.flowKey).update(purpose + '\0' + state).digest('base64url'); }
    private async configured(provider: SocialProvider): Promise<SocialProviderConfiguration> { const config = (await this.providers.available()).find(p => p.provider === provider); if (!config)
        throw new SocialAuthError('SOCIAL_PROVIDER_UNAVAILABLE'); return config; }
    async authProviders(): Promise<AuthProvidersResponse> { const names = { google: 'Google', apple: 'Apple', facebook: 'Facebook', x: 'X' } as const; return { providers: (await this.providers.available()).map(p => ({ id: p.provider, name: names[p.provider] })) }; }
    async beginStepUp(provider: SocialProvider, input: unknown, source: AuthSourceContext, session: AuthenticatedSession) { return this.beginFlow(provider, input, source, session, true); }
    async begin(provider: SocialProvider, input: unknown, source: AuthSourceContext, session?: AuthenticatedSession) { return this.beginFlow(provider, input, source, session, false); }
    private async beginFlow(provider: SocialProvider, input: unknown, source: AuthSourceContext, session: AuthenticatedSession | undefined, stepUp: boolean) {
        const parsed = stepUp ? parseConsumerSecurityInput(BeginSocialStepUpRequestSchema, input) : session ? parseConsumerSecurityInput(BeginSocialLinkRequestSchema, input) : parseConsumerSecurityInput(BeginSocialLoginRequestSchema, input);
        const admission = await this.sessions.admit('SOCIAL_BEGIN', session?.userId ?? 'discoverable', source), config = await this.configured(provider);
        const state = random(), flowCookie = random(), nonce = this.derived('nonce', state), verifier = this.derived('pkce', state);
        const authorization_url = socialAuthorizationUrl(config, state, nonce, verifier);
        const result = await this.repository.begin({ ...admission, stateHash: socialHash('state', state), cookieHash: socialHash('flow-cookie', flowCookie), bindingHash: this.sessions.bindingHash(source), nonceHash: socialHash('nonce', nonce), provider, configuration: config.configuration, purpose: stepUp ? 'PROVIDER_STEP_UP' : session ? 'LINK' : 'LOGIN', next: parsed.next ?? (session ? '/settings/security' : '/new'), ...(stepUp && session && 'authorization' in parsed ? { ...consumerSecuritySession(session), authorization: parsed.authorization as Readonly<Record<string, string>> } : {}), ...(session && 'step_up_grant' in parsed && typeof parsed.step_up_grant === 'string' ? { ...consumerSecuritySession(session), grantHash: hashToken('step-up-grant', parsed.step_up_grant) } : {}) }).catch(error=>{if(error instanceof Error&&error.message==='CONSUMER_CHALLENGE_CAPACITY')throw new AuthFlowError('MFA_RATE_LIMITED');throw error;});
        return { authorization_url, flowCookie, expiresAt: new Date(result.expiresAt).toISOString() };
    }
    async callback(provider: SocialProvider, input: unknown, flowCookie: string | null, source: AuthSourceContext) {
        if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new SocialAuthError('SOCIAL_PROOF_INVALID');
        const p = input as Record<string, unknown>;
        // Response metadata is display/protocol context only. Mailbox trust
        // always comes from the independently verified signed token.
        const allowedFields=['state','code','error','error_description',...(provider==='google'?['scope','authuser','prompt','hd']:provider==='apple'?['user']:[])];
        if (typeof p.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(p.state) || !flowCookie || !/^[A-Za-z0-9_-]{43}$/.test(flowCookie)
            || Object.keys(p).some(k => !allowedFields.includes(k)) || JSON.stringify(p).length > 8192)
            throw new SocialAuthError('SOCIAL_PROOF_INVALID');
        await this.sessions.admit('SOCIAL_CALLBACK', p.state, source);
        const config = await this.configured(provider);
        const lookup = { stateHash: socialHash('state', p.state), cookieHash: socialHash('flow-cookie', flowCookie), bindingHash: this.sessions.bindingHash(source), provider, configuration: config.configuration };
        const claim = await this.repository.claim(lookup), nonce = this.derived('nonce', p.state), verifier = this.derived('pkce', p.state);
        if (!claim || claim.nonceHash !== socialHash('nonce', nonce) || p.error !== undefined || typeof p.code !== 'string' || p.code.length < 1 || p.code.length > 4096)
            throw new SocialAuthError('SOCIAL_PROOF_INVALID');
        let assertion;
        try {
            assertion = await this.providers.verify(config, p.code, nonce, verifier);
        }
        catch {
            throw new SocialAuthError('SOCIAL_PROOF_INVALID');
        }
        if (provider === 'apple' && typeof p.user === 'string' && p.user.length <= 2048) {
            try {
                const first = JSON.parse(p.user) as {
                    name?: {
                        firstName?: unknown;
                        lastName?: unknown;
                    };
                };
                const parts = [first.name?.firstName, first.name?.lastName].filter((x): x is string => typeof x === 'string');
                assertion = { ...assertion, name: socialName(parts.join(' ')) };
            }
            catch { /* unsigned optional display only */ }
        }
        const token = random(), browserCookie = random(), proofHash = socialHash(claim.purpose === 'PROVIDER_STEP_UP' ? 'step-up' : 'signup', token);
        const outcome = await this.repository.callback({ ...lookup, claimId: claim.claimId, issuer: assertion.issuer, appScope: config.appScope, subject: assertion.subject,
            assertedEmailIndex: assertion.emailTrust === 'local' || assertion.email === null ? null : createEmailBlindIndex(this.dependencies.blindIndexKey, assertion.email).toString('hex'),
            admittedProviders: (await this.providers.available()).map(p => p.configuration), proofHash, continuationCookieHash: socialHash('browser', browserCookie), challengeId: randomUUID(), challengeHash: hashToken('login-challenge', token) }, source);
        for (const [key, entry] of this.prefill)
            if (entry.until <= this.now().getTime()) {
                clearTimeout(entry.timeout);
                this.prefill.delete(key);
            }
        if (outcome.status === 'signup_required' && this.prefill.size < 8192) {
            const until = new Date(claim.expiresAt).getTime(), timeout = setTimeout(() => this.prefill.delete(proofHash), Math.max(0, until - this.now().getTime()));
            timeout.unref();
            this.prefill.set(proofHash, { email: assertion.email, name: assertion.name, until, timeout });
        }
        return { status: outcome.status, token, browserCookie, next: outcome.next, expiresAt: new Date(claim.expiresAt).toISOString() };
    }
    private async authority(token: string, source: AuthSourceContext) { if (!source.socialBrowserHash)
        throw new SocialAuthError('SOCIAL_PROOF_INVALID'); return { proofHash: socialHash('signup', token), browserHash: source.socialBrowserHash, bindingHash: this.sessions.bindingHash(source), admittedProviders: (await this.providers.available()).map(p => p.configuration) }; }
    async loginStatus(input: unknown, source: AuthSourceContext): Promise<SocialLoginStatusResponse> {
        const p=parseConsumerSecurityInput(SocialLoginStatusRequestSchema,input);
        if (!source.socialBrowserHash) throw new SocialAuthError('SOCIAL_PROOF_INVALID');
        await this.sessions.admit('SOCIAL_SIGNUP',p.continuation_token,source);
        const record=await this.repository.loginStatus({challengeHash:hashToken('login-challenge',p.continuation_token),browserHash:source.socialBrowserHash,bindingHash:this.sessions.bindingHash(source),admittedProviders:(await this.providers.available()).map(p=>p.configuration)});
        if (!record) throw new SocialAuthError('SOCIAL_PROOF_INVALID');
        return SocialLoginStatusResponseSchema.parse({expires_at:new Date(record.expiresAt).toISOString(),available_methods:record.availableMethods});
    }
    async signupStatus(input: unknown, source: AuthSourceContext): Promise<SocialSignupStatusResponse> {
        const p = parseConsumerSecurityInput(SocialSignupStatusRequestSchema, input);
        await this.sessions.admit('SOCIAL_SIGNUP', p.continuation_token, source);
        const authority = await this.authority(p.continuation_token, source), record = await this.repository.signup(authority);
        if (!record)
            throw new SocialAuthError('SOCIAL_PROOF_INVALID');
        const prefill = this.prefill.get(authority.proofHash);
        return { provider: record.provider as SocialProvider, email: prefill?.email ?? null, name: prefill?.name ?? null, expires_at: new Date(record.expiresAt).toISOString() };
    }
    async completeSignup(input: unknown, source: RegistrationSource, admission: AuthSourceAdmission): Promise<SocialRegistrationResult> {
        const p = parseConsumerSecurityInput(CompleteSocialSignupRequestSchema, input);
        const birth = dobFromIso(p.date_of_birth);
        if (!admission || !birth || !meetsMinimumAge(birth))
            throw new AuthFlowError('AUTH_INPUT_INVALID');
        try {
            const authority = await this.authority(p.continuation_token, source);
            if (!await this.repository.signup(authority))
                throw new SocialAuthError('SOCIAL_PROOF_INVALID');
            const result = await this.dependencies.registration.registerSocial({ email: p.email, phone: p.phone ?? null, adultAffirmed: true }, source, authority, admission);
            const retained = this.prefill.get(authority.proofHash);
            if (retained)
                clearTimeout(retained.timeout);
            this.prefill.delete(authority.proofHash);
            return result;
        }
        finally {
            admission.release();
        }
    }
    private async password(session: AuthenticatedSession) { const passwordHashSnapshot = await this.dependencies.security.readPasswordState(consumerSecuritySession(session)); return { passwordHashSnapshot, passwordUsable: consumerPasswordUsable(passwordHashSnapshot, this.dependencies.authPolicy) }; }
    async linked(session: AuthenticatedSession): Promise<SocialLinksResponse> { const result = await this.repository.linked(consumerSecuritySession(session), await this.password(session), (await this.providers.available()).map(p => p.configuration)) as SocialLinksResponse; return SocialLinksResponseSchema.parse({ providers: result.providers.map(p => ({ ...p, linked_at: new Date(p.linked_at).toISOString() })) }); }
    async unlink(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<void> { const p = parseConsumerSecurityInput(UnlinkSocialProviderRequestSchema, input); await this.repository.unlink(consumerSecuritySession(session), p.provider, hashToken('step-up-grant', p.step_up_grant), await this.password(session), (await this.providers.available()).map(p => p.configuration), source); }
}
