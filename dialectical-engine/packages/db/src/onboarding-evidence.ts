import type { Pool } from 'pg';
import type { AuditContextHasher } from '@debateai/crypto';
import type { AuthSourceContext } from './identity.js';
import type { ConsumerLegalPair } from './consumer-auth.js';
import type { SignUpAcceptanceRow } from './legal-acceptance.js';
import { ProfileTransactions } from './account-profile.js';
export type OnboardingAuthority = Readonly<{
    kind: 'PENDING' | 'RECOVERY';
    proofHash: string;
    minAge: 18;
    ruleVersion: string;
    countryCode: string | null;
}>;
export type OnboardingRequirements = Readonly<{
    userId: string;
    ageRequired: boolean;
    legalRequired: boolean;
    countryCode: string | null;
    ageSnapshot: Readonly<Record<string, unknown>> | null;
}>;
export class PostgresOnboardingEvidenceRepository {
    private readonly tx: ProfileTransactions;
    constructor(private readonly pool: Pool, audit: AuditContextHasher) { this.tx = new ProfileTransactions(pool, audit); }
    async requirements(input: OnboardingAuthority, legal: readonly ConsumerLegalPair[]): Promise<OnboardingRequirements> { return (await this.pool.query('SELECT identity.read_onboarding_requirements($1,$2) value', [input, JSON.stringify(legal)])).rows[0].value; }
    async complete(input: OnboardingAuthority & Readonly<{
        ageSnapshot: OnboardingRequirements['ageSnapshot'];
        termsAccepted: true;
        privacyAcknowledged: true;
        adultAffirmed: true;
        agePassed?: true;
    }>, legal: readonly ConsumerLegalPair[], rows: readonly SignUpAcceptanceRow[], source: AuthSourceContext): Promise<void> {
        await this.tx.audited(source, async (c, context) => { await c.query('SELECT identity.complete_onboarding_evidence($1,$2,$3,$4)', [input, JSON.stringify(legal), JSON.stringify(rows.map(r => ({ acceptance_id: r.acceptanceId, kind: r.kind, document_version: r.documentVersion, document_sha256: r.documentSha256, locale: r.locale, evidence_ciphertext: r.evidenceCiphertext.toString('base64'), key_id: r.keyId }))), context]); });
    }
}
