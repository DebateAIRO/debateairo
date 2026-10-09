"use client";
import { useEffect, useRef, useState } from 'react';
import { ContractHttpError, type PublicationRefusalStatement } from '@debateai/contract';
import { PublicationStatement } from '../PublicationControl';
import type { ContractClient, StepUpAuthorizationRequest, StepUpResponse } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { takeSocialStepUp } from '@/lib/socialStepUpHandoff';
import { matchingSecurityGrant, type ConfirmedSecurityAction } from '@/lib/securityConfirmation';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { confirmationPhraseMatches } from '../AccountErasureControls';
import type { LocaleCode } from '@/lib/i18n/locales';
import { SecurityConfirmation } from './SecurityConfirmation';
import { EphemeralCodes } from './EphemeralCodes';
import { emailShape } from '@/lib/authFormValidation';
export type SecurityResumeHandler = (authorization: StepUpAuthorizationRequest, initialProof: ConfirmedSecurityAction) => void | Promise<void>;
/** Task12 consumes onResume for its profile/method/provider panels; proof remains one-use and exact. */
export function SecurityActionResume({ catalog, settingsCatalog, publicCatalog, locale, client = contractClient, takeProof = takeSocialStepUp, onResume }: {
    catalog: MessageCatalog;
    settingsCatalog: MessageCatalog;
    publicCatalog: MessageCatalog;
    locale: LocaleCode;
    client?: ContractClient;
    takeProof?: () => StepUpResponse | null;
    onResume?: SecurityResumeHandler;
}) {
    const started = useRef(false);
    const consumed = useRef(false);
    const active = useRef(true);
    const [proof, setProof] = useState<ConfirmedSecurityAction | null>(null);
    const [backup, setBackup] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [phrase, setPhrase] = useState('');
    const [acknowledged, setAcknowledged] = useState(false);
    const [statement, setStatement] = useState<PublicationRefusalStatement | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [cancellation, setCancellation] = useState<string | null>(null);
    useEffect(() => {
        active.current = true;
        if (!started.current) {
            started.current = true;
            const value = takeProof();
            if (value?.step_up_grant) {
                const { token, expires_at, ...authorization } = value.step_up_grant;
                if (matchingSecurityGrant(value, authorization)) {
                    setProof(value);
                    setBackup(value.replacement_recovery_code ?? null);
                }
            }
        }
        return () => {
            active.current = false;
        };
    }, [takeProof]);
    useEffect(() => {
        if (!proof)
            return;
        const timer = setTimeout(() => {
            setProof(null);
            setStatus(t(catalog, "auth.security.expired"));
        }, Math.max(0, Date.parse(proof.step_up_grant.expires_at) - Date.now()));
        return () => clearTimeout(timer);
    }, [proof, catalog]);
    if (!proof)
        return <section>{statement ? <PublicationStatement statement={statement} catalog={publicCatalog}/> : null}{status ? <p role="status">{status}</p> : <p>{t(catalog, "auth.security.resumeEmpty")}</p>}{backup ? <EphemeralCodes catalog={catalog} codes={[backup]}/> : null}{cancellation ? <button type="button" onClick={async () => {
                    try {
                        await client.cancelAccountErasure(cancellation);
                        setCancellation(null);
                        setStatus(t(settingsCatalog, "settings.erasure.cancelled"));
                    }
                    catch {
                        setStatus(t(settingsCatalog, "settings.erasure.cancelFailed"));
                    }
                }}>{t(settingsCatalog, "settings.erasure.cancel")}</button> : null}<a href="/settings">{t(catalog, "auth.security.return")}</a></section>;
    const grant = proof.step_up_grant;
    const { token, expires_at, ...authorization } = grant;
    const action = grant.action;
    const isRun = 'target_run_id' in grant;
    const warning = action === 'PUBLISH' ? t(publicCatalog, "public.publication.publishWarning") : action === 'UNPUBLISH' ? t(publicCatalog, "public.publication.unpublishWarning") : action === 'DELETE_PRIVATE_DEBATE' ? t(publicCatalog, "public.publication.deleteExplanation") : action === 'DELETE_ACCOUNT' ? t(settingsCatalog, "settings.erasure.dataWarning") : t(catalog, "auth.security.providerProof");
    const destructive = action === 'PUBLISH' || action === 'UNPUBLISH' || action === 'DELETE_PRIVATE_DEBATE';
    const allowed = destructive ? acknowledged : action === 'DELETE_ACCOUNT' ? confirmationPhraseMatches(phrase, t(settingsCatalog, "settings.erasure.confirmationPhrase"), locale) : action === 'CHANGE_EMAIL' ? emailShape(email) : true;
    async function confirm(result: ConfirmedSecurityAction) {
        if (consumed.current || !active.current || !matchingSecurityGrant(result, authorization) || !allowed)
            return;
        consumed.current = true;
        try {
            let message = t(catalog, "auth.security.complete");
            if (action === 'PUBLISH' && 'target_run_id' in grant) {
                await client.publishRun(grant.target_run_id, result.step_up_grant.token);
                message = t(publicCatalog, "public.publication.publishedSuccess");
            }
            else if (action === 'UNPUBLISH' && 'target_run_id' in grant) {
                await client.unpublishRun(grant.target_run_id, result.step_up_grant.token);
                message = t(publicCatalog, "public.publication.unpublishedSuccess");
            }
            else if (action === 'DELETE_PRIVATE_DEBATE' && 'target_run_id' in grant) {
                const response = await client.deletePrivateDebate(grant.target_run_id, result.step_up_grant.token);
                message = t(publicCatalog, response.status === 'CLEANED' ? 'public.publication.deletedCleaned' : 'public.publication.deletionPending');
            }
            else if (action === 'DELETE_ACCOUNT') {
                const response = await client.scheduleAccountErasure(result.step_up_grant.token);
                if (active.current)
                    setCancellation(response.cancellation_ref);
                message = t(settingsCatalog, "settings.erasure.scheduled");
            }
            else if (action === 'CHANGE_EMAIL') {
                await client.requestEmailChange(email.trim(), result.step_up_grant.token);
                message = t(settingsCatalog, "settings.email.requested");
            }
            else if (onResume) {
                await onResume(authorization, result);
            }
            else
                message = t(catalog, "auth.security.resumeEmpty");
            if (active.current) {
                setProof(null);
                setStatus(message);
            }
        }
        catch (failure) {
            if (active.current) {
                setProof(null);
                if ((action === 'PUBLISH' || action === 'UNPUBLISH') && failure instanceof ContractHttpError && failure.statement) {
                    setStatement(failure.statement);
                    setStatus(null);
                }
                else if (action === 'PUBLISH' || action === 'UNPUBLISH')
                    setStatus(t(publicCatalog, failure instanceof ContractHttpError && failure.serverCode === 'PUBLICATION_CHECK_UNAVAILABLE' ? 'public.publication.contentCheck.unavailable' : failure instanceof ContractHttpError && failure.status < 500 ? 'public.publication.changeUnauthorized' : 'public.publication.statusUnavailable'));
                else if (action === 'DELETE_PRIVATE_DEBATE')
                    setStatus(t(publicCatalog, failure instanceof ContractHttpError && failure.serverCode === 'DEBATE_MUST_BE_PRIVATE' ? 'public.publication.mustBePrivate' : failure instanceof ContractHttpError && failure.serverCode === 'LEGACY_CONTENT_RETAINED' ? 'public.publication.legacyRetained' : 'public.publication.deletionUnauthorized'));
                else if (action === 'DELETE_ACCOUNT')
                    setStatus(t(settingsCatalog, failure instanceof ContractHttpError && failure.serverCode === 'ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED' ? 'settings.erasure.notificationChannelRequired' : 'settings.erasure.notAuthorized'));
                else if (action === 'CHANGE_EMAIL')
                    setStatus(t(settingsCatalog, 'settings.emailChange.failed'));
                else
                    setStatus(t(catalog, 'auth.security.unavailable'));
            }
        }
    }
    return <section className="authSecurityConfirmation"><p>{warning}</p>{isRun ? <a href={`/debate/${grant.target_run_id}`}>{t(catalog, "auth.security.returnToDebate")}</a> : null}
 {destructive ? <label className="authCheck"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}/>{t(publicCatalog, action === 'PUBLISH' ? 'public.publication.acknowledgePublish' : action === 'UNPUBLISH' ? 'public.publication.acknowledgeUnpublish' : 'public.publication.deleteAcknowledgement')}</label> : null}
 {action === 'DELETE_ACCOUNT' ? <div className="authField"><label htmlFor="resume-erasure-phrase">{t(settingsCatalog, "settings.erasure.typeConfirmation", { confirmation: t(settingsCatalog, "settings.erasure.confirmationPhrase") })}</label><input id="resume-erasure-phrase" value={phrase} onChange={e => setPhrase(e.target.value)} autoComplete="off"/></div> : null}
 {action === 'CHANGE_EMAIL' ? <div className="authField"><label htmlFor="resume-new-email">{t(settingsCatalog, "settings.emailChange.newLabel")}</label><input id="resume-new-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"/></div> : null}
 {backup ? <EphemeralCodes catalog={catalog} codes={[backup]}/> : null}
 <SecurityConfirmation catalog={catalog} client={client} authorization={authorization} initialProof={proof} disabled={!allowed} onConfirmed={confirm} onCancel={() => {
            consumed.current = true;
            setProof(null);
            setBackup(null);
        }}/>
 </section>;
}
