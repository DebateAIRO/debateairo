import { parseConsumerSecurityInput, consumerPasswordUsable } from "./consumer-security.js";
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { ConsumerRecoveryProveRequestSchema, RecoveryEnrollmentBeginRequestSchema, RecoveryEnrollmentCompleteRequestSchema, RecoveryEnrollmentOptionsResponseSchema, type ConsumerRecoveryProofResponse, type RecoveryEnrollmentOptionsResponse } from '@debateai/contract';
import { createEmailBlindIndex, normalizeEmailForBlindIndex, hashToken, normalizeRecoveryCode, recoveryCodeSlot, verifyRecoveryCode, decrypt, encrypt, generateTotpSecret, encodeBase32, matchTotpStep, totpProvisioningUri, type Argon2Executor, type ReadableUserDekStore } from '@debateai/crypto';
import { currentDocument, legalManifestLocales } from '@debateai/legal-manifest';
import { AGE_RULE_VERSION, MIN_AGE } from '@debateai/kernel';
import type { PostgresConsumerRecoveryRepository, AuthSourceContext, ConsumerLegalPair } from '@debateai/db';
import type { MfaPolicy, AuthPolicy, ConsumerRecoveryPolicy } from '@debateai/register';
import { consumerRecoveryPolicyFromValue } from '@debateai/register';
import type { ConsumerSessionProducer, LoginResult } from './sessions.js';
import { AuthFlowError, storedArgon2EnvelopeNotOverPolicy, type RecoveryMailWork } from './registration.js';
import { verifyConsumerRegistration } from './consumer-webauthn-verifier.js';
import { isSingleDeliverableRecipient } from './mail-channel.js';
export interface ConsumerRecoveryMailSender {
    sendRecovery(mail: Readonly<{
        recipient: string;
        token: string;
        expiresAt: Date;
    }>): Promise<void>;
}
export interface ConsumerRecoveryApplication {
    prove(input: unknown, source: AuthSourceContext): Promise<ConsumerRecoveryProofResponse>;
    beginEnrollment(input: unknown, source: AuthSourceContext): Promise<RecoveryEnrollmentOptionsResponse>;
    completeEnrollment(input: unknown, source: AuthSourceContext): Promise<LoginResult>;
}
const random = () => randomBytes(32).toString('base64url'), digest = (s: string) => 'sha256:' + createHash('sha256').update(s).digest('hex'), handleHash = (s: string) => digest('consumer-passkey:RECOVERY_ENROLL_ONLY\0' + s);
const totpAad = (u: string, f: string) => ['identity', 'mfa_factor.secret_ciphertext', f, 'run:none', u, `user-dek:${u}`, '1'] as const;
export class ConsumerRecoveryService implements ConsumerRecoveryApplication {
    private readonly origin: string;
    private readonly rpId: string;
    private readonly legal: readonly ConsumerLegalPair[];
    constructor(private readonly repository: PostgresConsumerRecoveryRepository, private readonly sessions: ConsumerSessionProducer, private readonly d: Readonly<{
        publicAppUrl: string;
        users: ReadableUserDekStore;
        argon2: Argon2Executor;
        mfaPolicy: MfaPolicy;
        authPolicy: AuthPolicy;
        policy: ConsumerRecoveryPolicy;
        blindIndexKey: Uint8Array;
        mail: ConsumerRecoveryMailSender;
        onMailFailure: () => void;
    }>) {
        const { sourceRef, ...value } = d.policy;
        consumerRecoveryPolicyFromValue(value, sourceRef);
        const u = new URL(d.publicAppUrl);
        if (u.protocol !== 'https:' || u.pathname !== '/' || u.username || u.password || u.hash || u.search)
            throw new TypeError('CONSUMER_WEBAUTHN_CONFIGURATION_INVALID');
        this.origin = u.origin;
        this.rpId = u.hostname;
        this.legal = (['TERMS', 'PRIVACY'] as const).flatMap(kind => legalManifestLocales(kind).map(locale => ({ kind, locale, ...currentDocument(kind, locale)! })));
    }
    async prepareStart(input: Readonly<{
        email: string;
    }>, source: AuthSourceContext): Promise<RecoveryMailWork | null> {
        const token = random(), tokenHash = hashToken('consumer-recovery-channel', token), index = createEmailBlindIndex(this.d.blindIndexKey, normalizeEmailForBlindIndex(input.email));
        const reserved = await this.repository.start(index, tokenHash, source);
        if (reserved === null)
            return null;
        return async () => { try {
            await this.repository.withDeliveryLease(reserved.userId, tokenHash, async (record) => { let dek: Buffer | undefined, plain: Buffer | undefined; try {
                dek = await this.d.users.load(record.userId);
                plain = decrypt(dek, record.addressCiphertext, ['identity', record.channelType === 'email' ? 'user.email_ciphertext' : 'user.recovery_email_ciphertext', record.userId, 'run:none', record.userId, `user-dek:${record.userId}`, '1']);
                const recipient = plain.toString('utf8');
                if (!isSingleDeliverableRecipient(recipient))
                    throw new Error('MAIL_INPUT_INVALID');
                await this.d.mail.sendRecovery({ recipient, token, expiresAt: new Date(record.expiresAt) });
            }
            finally {
                plain?.fill(0);
                dek?.fill(0);
            } });
        }
        catch {
            this.d.onMailFailure();
        } };
    }
    async prove(input: unknown, source: AuthSourceContext): Promise<ConsumerRecoveryProofResponse> {
        const p = parseConsumerSecurityInput(ConsumerRecoveryProveRequestSchema, input);
        await this.sessions.admit('RECOVERY_PROVE', p.token, source);
        let code: string;
        try {
            code = normalizeRecoveryCode(p.recovery_code);
        }
        catch {
            throw new AuthFlowError('AUTH_CREDENTIALS_INVALID');
        }
        const tokenHash = hashToken('consumer-recovery-channel', p.token), record = await this.repository.readProof(tokenHash, recoveryCodeSlot(code));
        if (record === null || !storedArgon2EnvelopeNotOverPolicy(record.codeHash, this.d.mfaPolicy.recoveryCodes.argon2id, 'recovery-code') || !await verifyRecoveryCode(this.d.argon2, record.codeHash, code))
            throw new AuthFlowError('AUTH_CREDENTIALS_INVALID');
        // Design note 2026-10-09 item 3: the used code is consumed and never refilled.
        const cap = random();
        const committed = await this.repository.prove({ tokenHash, codeId: record.codeId, codeHash: record.codeHash, capHash: hashToken('consumer-recovery-enroll', cap), method: p.method }, source);
        const passwordUsable = consumerPasswordUsable(record.passwordHash, this.d.authPolicy);
        return { status: 'RECOVERY_ENROLL_ONLY', available_methods: passwordUsable ? ['passkey', 'totp'] : ['passkey'], totp_unavailable_reason: passwordUsable ? null : 'PASSWORD_UNAVAILABLE', recovery_capability: cap, expires_at: new Date(committed.expiresAt).toISOString() };
    }
    async beginEnrollment(input: unknown, source: AuthSourceContext): Promise<RecoveryEnrollmentOptionsResponse> {
        const p = parseConsumerSecurityInput(RecoveryEnrollmentBeginRequestSchema, input);
        await this.sessions.admit('RECOVERY_BEGIN', p.recovery_capability, source);
        const capHash = hashToken('consumer-recovery-enroll', p.recovery_capability), identity = await this.repository.prepareEnrollment(capHash), handle = random(), challenge = random(), factorId = randomUUID(), seed = { capHash, userId: identity.userId, method: p.method, factorId, handleHash: handleHash(handle), bindingHash: this.sessions.bindingHash(source) };
        if (p.method === 'passkey') {
            const begun = await this.repository.beginEnrollment({ ...seed, challengeHash: digest(challenge), rpId: this.rpId, origin: this.origin, userHandle: random() }, source);
            if (begun.userHandle === null)
                throw new Error('CONSUMER_RECOVERY_INVALID');
            const { extensions: _extensions, ...options } = await generateRegistrationOptions({ rpName: 'Dialectical Engine', rpID: this.rpId, challenge: new Uint8Array(Buffer.from(challenge, 'base64url')), userID: new Uint8Array(Buffer.from(begun.userHandle, 'base64url')), userName: begun.userHandle, userDisplayName: 'Dialectical Engine account', timeout: 300000, attestationType: 'none', supportedAlgorithmIDs: [-7, -257], authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' } });
            return RecoveryEnrollmentOptionsResponseSchema.parse({ method: 'passkey', challenge_handle: handle, expires_at: new Date(begun.expiresAt).toISOString(), options });
        }
        const passwordUsable = consumerPasswordUsable(identity.passwordHash, this.d.authPolicy);
        if (!passwordUsable)
            throw new AuthFlowError('MFA_ENROLLMENT_STATE_INVALID');
        const secret = generateTotpSecret();
        let dek: Buffer | undefined;
        try {
            dek = await this.d.users.load(identity.userId);
            const secretCiphertext = encrypt(dek, secret, totpAad(identity.userId, factorId));
            const begun = await this.repository.beginEnrollment({ ...seed, secretCiphertext, passwordHashSnapshot: identity.passwordHash, passwordUsable }, source);
            return RecoveryEnrollmentOptionsResponseSchema.parse({ method: 'totp', challenge_handle: handle, secret: encodeBase32(secret), otpauthUri: totpProvisioningUri(secret, { issuer: this.d.mfaPolicy.issuer, accountLabel: identity.pseudonym }), expires_at: new Date(begun.expiresAt).toISOString() });
        }
        finally {
            secret.fill(0);
            dek?.fill(0);
        }
    }
    async completeEnrollment(input: unknown, source: AuthSourceContext): Promise<LoginResult> {
        const p = parseConsumerSecurityInput(RecoveryEnrollmentCompleteRequestSchema, input);
        await this.sessions.admit('RECOVERY_COMPLETE', p.recovery_capability, source);
        const lookup = { capHash: hashToken('consumer-recovery-enroll', p.recovery_capability), handleHash: handleHash(p.challenge_handle), bindingHash: this.sessions.bindingHash(source) }, record = await this.repository.readEnrollment(lookup);
        let verified: Readonly<Record<string, unknown>>;
        if (record.method === 'passkey') {
            if (!('credential' in p) || record.rpId !== this.rpId || record.origin !== this.origin || record.challengeHash === null)
                throw new AuthFlowError('AUTH_CREDENTIALS_INVALID');
            verified = { ...await verifyConsumerRegistration(p.credential, { rpId: this.rpId, origin: this.origin, challengeHash: record.challengeHash }), challengeHash: record.challengeHash, ...(p.label === undefined ? {} : { label: p.label }) };
        }
        else {
            if (!('code' in p) || record.secretCiphertext === null)
                throw new AuthFlowError('AUTH_CREDENTIALS_INVALID');
            let dek: Buffer | undefined, secret: Buffer | undefined;
            try {
                dek = await this.d.users.load(record.userId);
                secret = decrypt(dek, record.secretCiphertext, totpAad(record.userId, record.factorId));
                const match = matchTotpStep(secret, p.code, Math.floor(Date.now() / (this.d.mfaPolicy.totp.periodSeconds * 1000)), null);
                if (match.status !== 'accepted')
                    throw new AuthFlowError('AUTH_CREDENTIALS_INVALID');
                verified = { secretCiphertext: record.secretCiphertext, acceptedStep: match.step, passwordUsable: consumerPasswordUsable(record.passwordHashSnapshot, this.d.authPolicy) };
            }
            finally {
                secret?.fill(0);
                dek?.fill(0);
            }
        }
        const material = this.sessions.prepare(source), persistence = { sessionId: material.sessionId, sessionTokenHash: material.sessionTokenHash, csrfTokenHash: material.csrfTokenHash, sessionBindingContext: material.sessionBindingContext, idleExpiresAt: material.idleExpiresAt, absoluteExpiresAt: material.absoluteExpiresAt };
        const committed = await this.repository.completeEnrollment({ ...lookup, ...verified, userId: record.userId, factorId: record.factorId, method: record.method, minAge: MIN_AGE, ruleVersion: AGE_RULE_VERSION, countryCode: source.countryCode ?? null, material: persistence }, this.legal, source);
        if (committed.sessionId !== material.sessionId)
            throw new Error('CONSUMER_SESSION_INVALID');
        return this.sessions.committed(material, committed, source);
    }
}
