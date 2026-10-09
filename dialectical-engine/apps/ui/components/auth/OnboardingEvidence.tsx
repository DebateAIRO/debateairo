"use client";
import { useEffect, useRef, useState } from 'react';
import { ContractHttpError, type ContractClient, type OnboardingRequirementsResponse } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { catalogLocale, type LocaleCode } from '@/lib/i18n/locales';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { DateOfBirthField, EMPTY_DOB } from '@/components/DateOfBirthField';
import { resolveDobLocale } from '@/lib/dob/dobLocale';
import { checkDob, dobToIso, meetsMinimumAge, type DobParts, type DobErrorCode } from '@debateai/kernel';
import { loadClientLegalDocument } from '@/components/consent/useLegalDocument';
import { LegalDocumentModal } from '@/components/consent/LegalDocumentModal';
import type { LegalDocument } from '@/lib/legalDocument';
export type EvidenceAuthority = {
    kind: 'pending' | 'recovery';
    token: string;
};
type EvidenceClient = Pick<ContractClient, 'pendingOnboardingStatus' | 'completePendingOnboarding' | 'recoveryEnrollmentStatus' | 'completeRecoveryEvidence'>;
export function OnboardingEvidence({ authority, client = contractClient, locale, catalog, onReady }: {
    authority: EvidenceAuthority;
    client?: EvidenceClient;
    locale: LocaleCode;
    catalog: MessageCatalog;
    onReady: () => void;
}) {
    const [requirements, setRequirements] = useState<OnboardingRequirementsResponse | null>(null);
    const [documents, setDocuments] = useState<{
        terms: LegalDocument;
        privacy: LegalDocument;
    } | null>(null);
    const [open, setOpen] = useState<'terms' | 'privacy' | null>(null);
    const [accepted, setAccepted] = useState({ terms: false, privacy: false });
    const [birth, setBirth] = useState<DobParts>(EMPTY_DOB);
    const [birthError, setBirthError] = useState<DobErrorCode | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);
    const flight = useRef(false);
    const ready = useRef(onReady);
    ready.current = onReady;
    useEffect(() => {
        let active = true;
        setAccepted({ terms: false, privacy: false });
        setDocuments(null);
        setRequirements(null);
        setError(null);
        void (async () => {
            try {
                const requested = { locale: catalogLocale(locale) };
                const r = authority.kind === 'pending' ? await client.pendingOnboardingStatus({ ...requested, enrollment_token: authority.token }) : await client.recoveryEnrollmentStatus({ ...requested, recovery_capability: authority.token });
                if (!active)
                    return;
                if (r.status !== (authority.kind === 'pending' ? 'pending_mfa' : 'RECOVERY_ENROLL_ONLY'))
                    throw new Error('EVIDENCE_AUTHORITY_INVALID');
                setRequirements(r);
                if (!r.age_confirmation_required && !r.legal_acceptance_required) {
                    ready.current();
                    return;
                }
                const [terms, privacy] = await Promise.all([loadClientLegalDocument(r.terms.locale, 'terms'), loadClientLegalDocument(r.privacy.locale, 'privacy')]);
                if (!active)
                    return;
                if (r.terms.locale !== r.privacy.locale || terms.version !== r.terms.version || terms.sha256 !== r.terms.sha256 || privacy.version !== r.privacy.version || privacy.sha256 !== r.privacy.sha256)
                    throw new Error('LEGAL_DOCUMENT_STALE');
                setDocuments({ terms, privacy });
            }
            catch (failure) {
                // Only a document that changed since it was shown is "updated while you were reading".
                if (active)
                    setError(t(catalog, failure instanceof Error && failure.message === 'LEGAL_DOCUMENT_STALE' ? "auth.signUp.documentsUpdated" : "auth.onboarding.loadFailed"));
            }
        })();
        return () => {
            active = false;
        };
    }, [authority.token, authority.kind, locale, client, catalog, reload]);
    async function submit(form: HTMLFormElement) {
        if (!requirements || !documents || flight.current)
            return;
        if (requirements.age_confirmation_required) {
            const check = checkDob(birth);
            setBirthError(check.code === 'ok' ? null : check.code);
            if (check.code !== 'ok' || !meetsMinimumAge(birth)) {
                form.querySelector<HTMLElement>('[name=dob-d]')?.focus();
                return;
            }
        }
        if (requirements.legal_acceptance_required && (!accepted.terms || !accepted.privacy)) {
            setError(t(catalog, "auth.signUp.termsRequired"));
            form.querySelector<HTMLElement>('button[data-document]')?.focus();
            return;
        }
        flight.current = true;
        setBusy(true);
        setError(null);
        try {
            const evidence = { locale: requirements.terms.locale, terms: { version: documents.terms.version, sha256: documents.terms.sha256 }, privacy: { version: documents.privacy.version, sha256: documents.privacy.sha256 }, terms_accepted: true as const, privacy_acknowledged: true as const, adult_affirmed: true as const, ...(requirements.age_confirmation_required ? { date_of_birth: dobToIso(birth) } : {}) };
            if (authority.kind === 'pending')
                await client.completePendingOnboarding({ ...evidence, enrollment_token: authority.token });
            else
                await client.completeRecoveryEvidence({ ...evidence, recovery_capability: authority.token });
            setBirth(EMPTY_DOB);
            ready.current();
        }
        catch (failure) {
            const stale = failure instanceof ContractHttpError && failure.serverCode === 'LEGAL_DOCUMENT_STALE';
            if (stale)
                setAccepted({ terms: false, privacy: false });
            setError(t(catalog, stale ? "auth.signUp.documentsUpdated" : "auth.onboarding.saveFailed"));
        }
        finally {
            flight.current = false;
            setBusy(false);
        }
    }
    return <section>{error ? <div><p className="authFieldError" role="alert">{error}</p><button type="button" className="authSecondary" onClick={() => setReload(n => n + 1)}>{t(catalog, "auth.onboarding.tryAgain")}</button></div> : null}
 {!requirements || !documents ? <p role="status">{t(catalog, "auth.enroll.verifyingEmail")}</p> : <form method="post" action="/enroll-mfa" noValidate onSubmit={e => {
                e.preventDefault();
                void submit(e.currentTarget);
            }}>
 {requirements.age_confirmation_required ? <DateOfBirthField catalog={catalog} locale={resolveDobLocale(locale)} value={birth} onChange={value => {
                    setBirth(value);
                    setBirthError(null);
                }} error={birthError} minimumAgeMessage={t(catalog, "auth.dob.underAge")} disabled={busy}/> : null}
 {requirements.legal_acceptance_required ? <div><button type="button" data-document="privacy" onClick={() => setOpen('privacy')}>{t(catalog, "auth.signUp.privacyPolicy")}</button><input type="checkbox" readOnly checked={accepted.privacy} aria-label={t(catalog, "auth.signUp.privacyPolicy")}/><button type="button" data-document="terms" onClick={() => setOpen('terms')}>{t(catalog, "auth.signUp.termsOfService")}</button><input type="checkbox" readOnly checked={accepted.terms} aria-label={t(catalog, "auth.signUp.termsOfService")}/></div> : null}
 <button type="submit" disabled={busy}>{t(catalog, "auth.continue")}</button></form>}
 {open && documents ? <LegalDocumentModal document={documents[open]} open mode="consent" onClose={() => setOpen(null)} onAcknowledge={() => {
                setAccepted(x => ({ ...x, [open]: true }));
                setOpen(null);
            }}/> : null}
 </section>;
}
