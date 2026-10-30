import type { Pool } from 'pg';
import type { AuditContextHasher, CryptoEnvelope } from '@debateai/crypto';
import { recordSignupItalyApproval, type AuthSourceContext, type PendingAccountInput } from './identity.js';
import { ProfileTransactions, type ProfileSession } from './account-profile.js';
import { withMailLocale } from './mail-locale.js';
import { isDeclaredRegion } from '@debateai/kernel';
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
    private readonly signupTx: ProfileTransactions;
    constructor(private readonly pool: Pool, audit: AuditContextHasher, signupPool: Pool = pool) {
        this.tx = new ProfileTransactions(pool, audit);
        this.signupTx = new ProfileTransactions(signupPool, audit);
    }
    async begin(input: SocialFlowSeed, source: AuthSourceContext): Promise<{
        expiresAt: string;
    }> {
        // NV-41 (0131): the cleanup also gives up the heaviest source's oldest unclaimed LOGIN rows when the store is full.
        await this.pool.query('SELECT identity.prune_social_flows_evicting($1)', [input.challengeCapacity]);
        // C08.1 (R-09, D-58): every flow row records the request's mail language; the value is read only by the LINK callback (0116:24-31).
        return withMailLocale(this.pool, source.mailLocale ?? 'en', async (client) => (await client.query('SELECT identity.begin_social_flow($1) value', [input])).rows[0].value);
    }
    async claim(input: Pick<SocialFlowSeed, 'stateHash' | 'cookieHash' | 'bindingHash' | 'provider' | 'configuration'>): Promise<SocialFlowClaim | null> { return (await this.pool.query('SELECT identity.claim_social_flow($1) value', [input])).rows[0].value; }
    // K09/NV-42: admitted by SOCIAL_CALLBACK and run after a verified provider exchange, so it may use the login reserve.
    // NV-13: the v2 callback answers a link to a pending_verification account like no link (0131).
    async callback(input: Readonly<Record<string, unknown>>, source: AuthSourceContext): Promise<SocialCallbackResult> { return this.tx.audited(source, async (c, audit) => (await c.query('SELECT identity.finish_social_callback_v2($1,$2) value', [input, audit])).rows[0].value, 'login'); }
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
        const region=input.declaredRegion;
        if (!isDeclaredRegion(region)) throw new TypeError('SOCIAL_REGION_INVALID');
        return this.signupTx.audited(input.source, async (c, audit) => {
            const p = { proofHash: input.proofHash, browserHash: input.browserHash, bindingHash: input.bindingHash, admittedProviders: input.admittedProviders,
                declaredRegion: region,
                userId: input.userId, emailBlindIndex: input.emailBlindIndex.toString('hex'), emailCiphertext: input.emailCiphertext, phoneCiphertext: input.phoneCiphertext,
                pseudonym: input.pseudonym, occurredAt: input.occurredAt, verificationTokenHash: input.verificationTokenHash, verificationTokenTtlMs: input.verificationTokenTtlMs,
                socialEnrollmentHash: input.socialEnrollmentHash, minAgeApplied: input.ageCheck.minAgeApplied, countryCode: input.ageCheck.countryCode, ruleVersion: input.ageCheck.ruleVersion,
                acceptances: input.acceptances?.map(r => ({ acceptance_id: r.acceptanceId, kind: r.kind, document_version: r.documentVersion, document_sha256: r.documentSha256, locale: r.locale, evidence_ciphertext: r.evidenceCiphertext.toString('base64'), key_id: r.keyId })) };
            // NV-13: the v2 constructor links the provider only on the trusted arm (0131).
            const result = (await c.query('SELECT identity.create_social_account_v2($1,$2) value', [p, audit])).rows[0].value;
            if (result.status === 'created' || result.status === 'enrollment') {
                // The untrusted arm's pending account has no link, so it takes the pending-only helper password sign-up
                // uses (0095); the trusted arm's helper is bound to the link that arm makes (0107). Both then commit.
                if (result.status === 'created') await c.query('SELECT identity.record_registration_region($1,$2,$3)',[result.userId,region.country,region.usState]);
                else await c.query('SELECT identity.record_social_registration_region($1::uuid,$2::text,$3::text,$4::text,$5::text)',[
                    result.userId,region.country,region.usState,input.proofHash,input.socialEnrollmentHash
                ]);
                // Italy clause approval S01 (R12): the same writer as the email path, in this transaction.
                await recordSignupItalyApproval(c, result.userId, input);
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
