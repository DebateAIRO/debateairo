import { createHash, randomBytes } from 'node:crypto';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { CompleteSocialStepUpRequestSchema, SocialStepUpStatusRequestSchema, SocialStepUpStatusResponseSchema, PasskeyAuthenticationOptionsResponseSchema, StepUpResponseSchema, type SocialStepUpStatusResponse, type PasskeyAuthenticationOptionsResponse, type StepUpResponse } from '@debateai/contract';
import { decrypt, matchTotpStep, hashToken, normalizeRecoveryCode, recoveryCodeSlot, verifyRecoveryCode, generateRecoveryCode, hashRecoveryCode, type Argon2Executor, type ReadableUserDekStore } from '@debateai/crypto';
import type { AuthSourceContext, PostgresSocialIdentityRepository } from '@debateai/db';
import type { MfaPolicy } from '@debateai/register';
import { consumerSecuritySession, parseConsumerSecurityInput } from './consumer-security.js';
import { storedArgon2EnvelopeNotOverPolicy } from './registration.js';
import type { AuthenticatedSession, ConsumerSessionProducer } from './sessions.js';
import { SocialAuthError } from './social-auth.js';
import { SocialProviders } from './social-providers/provider.js';
import { socialHash } from './social-providers/hashes.js';
import { verifyConsumerAuthentication } from './consumer-webauthn-verifier.js';
const random = () => randomBytes(32).toString('base64url');
export interface SocialStepUpApplication {
    status(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<SocialStepUpStatusResponse>;
    beginPasskey(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<PasskeyAuthenticationOptionsResponse>;
    complete(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<{
        sessionToken: string;
        response: StepUpResponse;
    }>;
}
export class SocialStepUpService implements SocialStepUpApplication {
    private readonly origin: string;
    private readonly rpId: string;
    constructor(private readonly repository: PostgresSocialIdentityRepository, private readonly providers: SocialProviders, private readonly sessions: ConsumerSessionProducer, private readonly dependencies: {
        publicAppUrl: string;
        users: ReadableUserDekStore;
        argon2: Argon2Executor;
        mfaPolicy: MfaPolicy;
    }) {
        const url = new URL(dependencies.publicAppUrl);
        if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
            throw new Error('SOCIAL_CONFIGURATION_INVALID');
        this.origin = url.origin;
        this.rpId = url.hostname;
    }
    private async authority(token: string, session: AuthenticatedSession, source: AuthSourceContext) { if (!source.socialBrowserHash)
        throw new SocialAuthError('SOCIAL_PROOF_INVALID'); return { ...consumerSecuritySession(session), proofHash: socialHash('step-up', token), browserHash: source.socialBrowserHash, bindingHash: this.sessions.bindingHash(source), admittedProviders: (await this.providers.available()).map(p => p.configuration) }; }
    async status(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<SocialStepUpStatusResponse> {
        const p = parseConsumerSecurityInput(SocialStepUpStatusRequestSchema, input);
        await this.sessions.admit('STEP_UP_BEGIN', p.continuation_token, source);
        const r = await this.repository.readStepUp(await this.authority(p.continuation_token, session, source));
        return SocialStepUpStatusResponseSchema.parse({ authorization: r.authorization, expires_at: new Date(r.expiresAt).toISOString(), available_methods: r.availableMethods });
    }
    async beginPasskey(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<PasskeyAuthenticationOptionsResponse> {
        const p = parseConsumerSecurityInput(SocialStepUpStatusRequestSchema, input);
        await this.sessions.admit('STEP_UP_BEGIN', p.continuation_token, source);
        const a = await this.authority(p.continuation_token, session, source), handle = random(), challenge = random();
        const { extensions: _extensions, ...options } = await generateAuthenticationOptions({ rpID: this.rpId, challenge: new Uint8Array(Buffer.from(challenge, 'base64url')), timeout: 300000, userVerification: 'required' });
        PasskeyAuthenticationOptionsResponseSchema.parse({ challenge_handle: handle, expires_at: new Date().toISOString(), options });
        const r = await this.repository.beginStepUpPasskey({ ...a, handleHash: socialHash('step-up-passkey', handle), challengeHash: 'sha256:' + createHash('sha256').update(challenge).digest('hex'), rpId: this.rpId, origin: this.origin });
        return PasskeyAuthenticationOptionsResponseSchema.parse({ challenge_handle: handle, expires_at: new Date(r.expiresAt).toISOString(), options });
    }
    async complete(input: unknown, session: AuthenticatedSession, source: AuthSourceContext): Promise<{
        sessionToken: string;
        response: StepUpResponse;
    }> {
        const p = parseConsumerSecurityInput(CompleteSocialStepUpRequestSchema, input);
        await this.sessions.admit('STEP_UP_COMPLETE', p.continuation_token, source);
        const authority = await this.authority(p.continuation_token, session, source);
        let normalized = '';
        if ('code' in p && !/^\d{6}$/.test(p.code)) {
            try {
                normalized = normalizeRecoveryCode(p.code);
            }
            catch {
                throw new SocialAuthError('SOCIAL_PROOF_INVALID');
            }
        }
        const lookup = { ...authority, ...('credential' in p ? { credentialId: p.credential.id } : {}), ...(normalized ? { recoverySlot: recoveryCodeSlot(normalized) } : {}) };
        const r = await this.repository.readStepUp(lookup);
        let proof: Record<string, unknown>;
        let replacement: string | undefined;
        if ('credential' in p) {
            if (!r.credentialId || !r.userHandle || r.counter === null || r.deviceType === null || r.backedUp === null || !r.publicKey || !r.challengeHash || r.handleHash !== socialHash('step-up-passkey', p.challenge_handle) || r.origin !== this.origin || r.rpId !== this.rpId)
                throw new SocialAuthError('SOCIAL_PROOF_INVALID');
            const verified = await verifyConsumerAuthentication(p.credential, { credentialId: r.credentialId, publicKey: r.publicKey, counter: r.counter, deviceType: r.deviceType, backedUp: r.backedUp, userHandle: r.userHandle }, { challengeHash: r.challengeHash, rpId: this.rpId, origin: this.origin });
            proof = { ...verified, credentialId: r.credentialId, publicKey: r.publicKey, deviceType: r.deviceType, userHandle: r.userHandle, challengeHash: r.challengeHash, method: 'passkey', handleHash: socialHash('step-up-passkey', p.challenge_handle) };
        }
        else if (normalized) {
            if (r.codeSlot === null || !r.recoveryCodeId || !r.codeHash || !storedArgon2EnvelopeNotOverPolicy(r.codeHash, this.dependencies.mfaPolicy.recoveryCodes.argon2id, 'recovery-code') || !await verifyRecoveryCode(this.dependencies.argon2, r.codeHash, normalized))
                throw new SocialAuthError('SOCIAL_PROOF_INVALID');
            replacement = generateRecoveryCode(r.codeSlot);
            proof = { method: 'recovery_code', recoverySlot: r.codeSlot, recoveryCodeId: r.recoveryCodeId, codeHash: r.codeHash, replacementHash: await hashRecoveryCode(this.dependencies.argon2, replacement, this.dependencies.mfaPolicy.recoveryCodes.argon2id) };
        }
        else {
            if (!r.factorId || !r.secretCiphertext)
                throw new SocialAuthError('SOCIAL_PROOF_INVALID');
            let dek: Buffer | undefined, secret: Buffer | undefined;
            try {
                dek = await this.dependencies.users.load(session.userId);
                secret = decrypt(dek, r.secretCiphertext, ['identity', 'mfa_factor.secret_ciphertext', r.factorId, 'run:none', session.userId, `user-dek:${session.userId}`, '1']);
                const match = matchTotpStep(secret, p.code, Math.floor(Date.now() / 30000), r.lastAcceptedStep);
                if (match.status !== 'accepted')
                    throw new SocialAuthError('SOCIAL_PROOF_INVALID');
                proof = { method: 'totp', factorId: r.factorId, secretCiphertext: r.secretCiphertext, acceptedStep: match.step };
            }
            finally {
                secret?.fill(0);
                dek?.fill(0);
            }
        }
        const material = this.sessions.prepare(source), grant = random();
        const result = await this.repository.completeStepUp({ ...lookup, ...proof, replacementTokenHash: material.sessionTokenHash, replacementCsrfHash: material.csrfTokenHash, grantHash: hashToken('step-up-grant', grant) }, source);
        return { sessionToken: material.sessionToken, response: StepUpResponseSchema.parse({ status: 'step_up_complete', csrf_token: material.csrfToken, step_up_grant: { ...result.authorization, token: grant, expires_at: new Date(result.expiresAt).toISOString() }, ...(replacement ? { replacement_recovery_code: replacement } : {}) }) };
    }
}
