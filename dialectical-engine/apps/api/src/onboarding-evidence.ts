import { socialHash } from './social-providers/hashes.js';
import { parseConsumerSecurityInput } from "./consumer-security.js";
import { PendingOnboardingStatusRequestSchema, PendingOnboardingCompleteRequestSchema, RecoveryEvidenceStatusRequestSchema, RecoveryEvidenceCompleteRequestSchema, OnboardingRequirementsResponseSchema, type OnboardingRequirementsResponse } from '@debateai/contract';
import { hashToken } from '@debateai/crypto';
import { AGE_RULE_VERSION, MIN_AGE, dobFromIso, checkDob, meetsMinimumAge } from '@debateai/kernel';
import { currentDocument } from '@debateai/legal-manifest';
import type { AuthSourceContext, PostgresOnboardingEvidenceRepository, OnboardingAuthority, ConsumerLegalPair } from '@debateai/db';
import type { ConsumerSessionProducer } from './sessions.js';
import { resolveSignUpDocuments, signUpAcceptanceRows } from './legal.js';
import { AuthFlowError } from './registration.js';
export interface OnboardingEvidenceApplication {
    status(kind: 'PENDING' | 'RECOVERY', input: unknown, source: AuthSourceContext): Promise<OnboardingRequirementsResponse>;
    complete(kind: 'PENDING' | 'RECOVERY', input: unknown, source: AuthSourceContext): Promise<void>;
}
export class OnboardingEvidenceService implements OnboardingEvidenceApplication {
    constructor(private readonly repository: PostgresOnboardingEvidenceRepository, private readonly sessions: ConsumerSessionProducer, private readonly recordsKey: Buffer) { }
    private async authority(kind: 'PENDING' | 'RECOVERY', bearer: string, source: AuthSourceContext): Promise<OnboardingAuthority> { return { ...(kind==='PENDING'?{socialEnrollmentHash:socialHash('enrollment',bearer),bindingHash:this.sessions.bindingHash(source),...(source.socialBrowserHash===undefined?{}:{browserHash:source.socialBrowserHash}),admittedProviders:await this.sessions.socialBindings?.()??[]}:{}),kind, proofHash: hashToken(kind === 'PENDING' ? 'verification' : 'consumer-recovery-enroll', bearer), minAge: MIN_AGE, ruleVersion: AGE_RULE_VERSION, countryCode: source.countryCode ?? null }; }
    async status(kind: 'PENDING' | 'RECOVERY', input: unknown, source: AuthSourceContext): Promise<OnboardingRequirementsResponse> {
        const p = kind === 'PENDING' ? parseConsumerSecurityInput(PendingOnboardingStatusRequestSchema, input) : parseConsumerSecurityInput(RecoveryEvidenceStatusRequestSchema, input), bearer = 'enrollment_token' in p ? p.enrollment_token : p.recovery_capability;
        await this.sessions.admit('ONBOARDING_STATUS', bearer, source);
        const terms = currentDocument('TERMS', p.locale), privacy = currentDocument('PRIVACY', p.locale);
        if (!terms || !privacy)
            throw new AuthFlowError('AUTH_INPUT_INVALID');
        const docs: ConsumerLegalPair[] = [{ kind: 'TERMS', locale: p.locale, ...terms }, { kind: 'PRIVACY', locale: p.locale, ...privacy }];
        const req = await this.repository.requirements(await this.authority(kind, bearer, source), docs);
        return OnboardingRequirementsResponseSchema.parse({ status: kind === 'PENDING' ? 'pending_mfa' : 'RECOVERY_ENROLL_ONLY', country: req.countryCode, age_confirmation_required: req.ageRequired, legal_acceptance_required: req.legalRequired, terms: { ...terms, locale: p.locale, url: '/terms?lang=' + p.locale }, privacy: { ...privacy, locale: p.locale, url: '/privacy?lang=' + p.locale } });
    }
    async complete(kind: 'PENDING' | 'RECOVERY', input: unknown, source: AuthSourceContext): Promise<void> {
        const p = kind === 'PENDING' ? parseConsumerSecurityInput(PendingOnboardingCompleteRequestSchema, input) : parseConsumerSecurityInput(RecoveryEvidenceCompleteRequestSchema, input), bearer = 'enrollment_token' in p ? p.enrollment_token : p.recovery_capability;
        await this.sessions.admit('ONBOARDING_COMPLETE', bearer, source);
        const documents = resolveSignUpDocuments({ locale: p.locale, terms: p.terms, privacy: p.privacy });
        if (documents === null)
            throw new AuthFlowError('LEGAL_DOCUMENT_STALE');
        const docs: ConsumerLegalPair[] = [{ kind: 'TERMS', ...documents.terms }, { kind: 'PRIVACY', ...documents.privacy }], authority = await this.authority(kind, bearer, source), req = await this.repository.requirements(authority, docs);
        if (req.ageRequired) {
            const parts = p.date_of_birth === undefined ? null : dobFromIso(p.date_of_birth);
            if (parts === null || checkDob(parts).code !== 'ok' || !meetsMinimumAge(parts))
                throw new AuthFlowError('AUTH_INPUT_INVALID');
        }
        else if (p.date_of_birth !== undefined)
            throw new AuthFlowError('AUTH_INPUT_INVALID');
        await this.repository.complete({ ...authority, ageSnapshot: req.ageSnapshot, termsAccepted: true, privacyAcknowledged: true, adultAffirmed: true, ...(req.ageRequired ? { agePassed: true as const } : {}) }, docs, signUpAcceptanceRows({ recordsKey: this.recordsKey, documents, source }), source);
    }
}
