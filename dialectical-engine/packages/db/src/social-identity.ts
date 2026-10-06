import type { Pool } from 'pg';
import type { AuditContextHasher, CryptoEnvelope } from '@debateai/crypto';
import type { AuthSourceContext, PendingAccountInput } from './identity.js';
import { ProfileTransactions, type ProfileSession } from './account-profile.js';
export interface SocialSignupAuthority {
    readonly proofHash: string;
    readonly browserHash: string;
    readonly bindingHash: string;
    readonly admittedProviders: readonly string[];
}
export interface SocialFlowSeed {
    readonly stateHash: string;
    readonly cookieHash: string;
    readonly bindingHash: string;
    readonly nonceHash: string;
    readonly retentionKey: string;
    readonly provider: string;
    readonly configuration: string;
    readonly purpose: 'LOGIN' | 'LINK' | 'PROVIDER_STEP_UP';
    readonly authorization?: Readonly<Record<string, string>>;
    readonly next: string;
    readonly challengeCapacity: number;
    readonly challengesPerScope: number;
    readonly userId?: string;
    readonly sessionId?: string;
    readonly tokenHash?: string;
    readonly grantHash?: string;
}
export interface SocialFlowClaim {
    readonly claimId: string;
    readonly nonceHash: string;
    readonly purpose: 'LOGIN' | 'LINK' | 'PROVIDER_STEP_UP';
    readonly next: string;
    readonly expiresAt: string;
}
export interface SocialCallbackResult {
    readonly status: 'linked' | 'mfa_required' | 'signup_required' | 'provider_step_up_required';
    readonly next: string;
    readonly expiresAt: string;
    readonly availableMethods?: readonly ('passkey' | 'totp' | 'recovery_code')[];
}
export type SocialAccountResult = Readonly<{
    status: 'created' | 'enrollment';
    userId: string;
    channelBindingId: string;
    reservationId: string;
    verificationExpiresAt: Date;
}> | Readonly<{
    status: 'collision';
}> | Readonly<{
    status: 'pseudonym_collision';
}>;
export interface SocialStepUpRecord {
    readonly authorization: Readonly<Record<string, string>>;
    readonly expiresAt: string;
    readonly availableMethods: readonly ('passkey' | 'totp' | 'recovery_code')[];
    readonly factorId: string | null;
    readonly secretCiphertext: CryptoEnvelope | null;
    readonly lastAcceptedStep: number | null;
    readonly challengeHash: string | null;
    readonly handleHash: string | null;
    readonly rpId: string | null;
    readonly origin: string | null;
    readonly credentialId: string | null;
    readonly publicKey: string | null;
    readonly counter: number | null;
    readonly deviceType: 'singleDevice' | 'multiDevice' | null;
    readonly backedUp: boolean | null;
    readonly userHandle: string | null;
    readonly recoveryCodeId: string | null;
    readonly codeHash: string | null;
    readonly codeSlot: number | null;
}
export class PostgresSocialIdentityRepository {
    private readonly tx: ProfileTransactions;
    constructor(private readonly pool: Pool, audit: AuditContextHasher) { this.tx = new ProfileTransactions(pool, audit); }
    async begin(input: SocialFlowSeed): Promise<{
        expiresAt: string;
    }> {
        await this.pool.query('SELECT identity.prune_social_flows()');
        return (await this.pool.query('SELECT identity.begin_social_flow($1) value', [input])).rows[0].value;
    }
    async claim(input: Pick<SocialFlowSeed, 'stateHash' | 'cookieHash' | 'bindingHash' | 'provider' | 'configuration'>): Promise<SocialFlowClaim | null> { return (await this.pool.query('SELECT identity.claim_social_flow($1) value', [input])).rows[0].value; }
    async callback(input: Readonly<Record<string, unknown>>, source: AuthSourceContext): Promise<SocialCallbackResult> { return this.tx.audited(source, async (c, audit) => (await c.query('SELECT identity.finish_social_callback($1,$2) value', [input, audit])).rows[0].value); }
    async loginStatus(input: Readonly<{ challengeHash:string; browserHash:string; bindingHash:string; admittedProviders:readonly string[] }>): Promise<{expiresAt:string;availableMethods:readonly ('passkey'|'totp'|'recovery_code')[]}|null> {
        return (await this.pool.query('SELECT identity.read_social_login_status($1) value',[input])).rows[0].value;
    }
    async signup(input: SocialSignupAuthority): Promise<{
        provider: string;
        configuration: string;
        expiresAt: string;
    } | null> { return (await this.pool.query('SELECT identity.read_social_signup($1) value', [input])).rows[0].value; }
    async createAccount(input: Omit<PendingAccountInput, 'passwordHash'> & SocialSignupAuthority & Readonly<{
        socialEnrollmentHash: string;
    }>, beforeCommit: () => Promise<void>): Promise<SocialAccountResult> {
        return this.tx.audited(input.source, async (c, audit) => {
            const p = { proofHash: input.proofHash, browserHash: input.browserHash, bindingHash: input.bindingHash, admittedProviders: input.admittedProviders,
                userId: input.userId, emailBlindIndex: input.emailBlindIndex.toString('hex'), emailCiphertext: input.emailCiphertext, phoneCiphertext: input.phoneCiphertext,
                pseudonym: input.pseudonym, occurredAt: input.occurredAt, verificationTokenHash: input.verificationTokenHash, verificationTokenTtlMs: input.verificationTokenTtlMs,
                socialEnrollmentHash: input.socialEnrollmentHash, minAgeApplied: input.ageCheck.minAgeApplied, countryCode: input.ageCheck.countryCode, ruleVersion: input.ageCheck.ruleVersion,
                acceptances: input.acceptances?.map(r => ({ acceptance_id: r.acceptanceId, kind: r.kind, document_version: r.documentVersion, document_sha256: r.documentSha256, locale: r.locale, evidence_ciphertext: r.evidenceCiphertext.toString('base64'), key_id: r.keyId })) };
            const result = (await c.query('SELECT identity.create_social_account($1,$2) value', [p, audit])).rows[0].value;
            if (result.status === 'created' || result.status === 'enrollment') {
                await beforeCommit();
                return { ...result, verificationExpiresAt: new Date(result.verificationExpiresAt) };
            }
            return result;
        });
    }
    async readStepUp(input: Readonly<Record<string, unknown>>): Promise<SocialStepUpRecord> { return (await this.pool.query('SELECT identity.read_social_step_up($1) value', [input])).rows[0].value; }
    async beginStepUpPasskey(input: Readonly<Record<string, unknown>>): Promise<{
        expiresAt: string;
    }> { return (await this.pool.query('SELECT identity.begin_social_step_up_passkey($1) value', [input])).rows[0].value; }
    async completeStepUp(input: Readonly<Record<string, unknown>>, source: AuthSourceContext): Promise<{
        authorization: Record<string, string>;
        expiresAt: string;
    }> { return this.tx.audited(source, async (c, audit) => (await c.query('SELECT identity.complete_social_step_up($1,$2) value', [input, audit])).rows[0].value); }
    async linked(session: ProfileSession, password: unknown, admittedProviders: readonly string[]): Promise<unknown> { return (await this.pool.query('SELECT identity.read_social_links($1) value', [{ ...session, ...(password as object), admittedProviders }])).rows[0].value; }
    async unlink(session: ProfileSession, provider: string, grantHash: string, password: unknown, admittedProviders: readonly string[], source: AuthSourceContext): Promise<void> { await this.tx.audited(source, async (c, audit) => { await c.query('SELECT identity.unlink_social_identity($1,$2)', [{ ...session, provider, grantHash, ...(password as object), admittedProviders }, audit]); }); }
}
