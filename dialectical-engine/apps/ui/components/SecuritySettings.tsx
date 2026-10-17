"use client";
import { useEffect, useRef, useState } from 'react';
import { ContractHttpError, type AuthMethodsResponse, type AuthProvidersResponse, type ContractClient, type MfaRecoveryPendingResponse, type RecoveryEmailSettings, type SocialLinksResponse, type StepUpAuthorizationRequest } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { ownedPhoneCompletionDraft, acknowledgePhoneDraftUpdate } from '@/lib/phoneCompletionDraft';
import { emailShape } from '@/lib/authFormValidation';
import { matchingSecurityGrant, type ConfirmedSecurityAction } from '@/lib/securityConfirmation';
import { formatDate, t, type MessageCatalog } from '@/lib/i18n/translate';
import type { LocaleCode } from '@/lib/i18n/locales';
import { PhoneProfileCard, type SecurityResume } from './PhoneProfileCard';
import { BackupEmailVerification } from './BackupEmailVerification';
import { SessionControls } from './SessionControls';
import { AuthGate } from './AuthGate';
import { SecurityConfirmation } from './auth/SecurityConfirmation';
import { SecurityActionResume } from './auth/SecurityActionResume';
import { SecurityEnrollment } from './auth/SecurityEnrollment';
import { EphemeralCodes } from './auth/EphemeralCodes';
import { useFormAnnouncer } from './auth/InlineFieldMessage';
import { useDeadlineWarning } from './auth/timedStep';
const providerName = (id: string) => id === 'google' ? 'Google' : id === 'apple' ? 'Apple' : id === 'facebook' ? 'Facebook' : 'X';
export function SecuritySettings({ catalog, authCatalog, publicCatalog, locale, client = contractClient, resume: provided }: {
    catalog: MessageCatalog; authCatalog: MessageCatalog; publicCatalog: MessageCatalog; locale: LocaleCode; client?: ContractClient; resume?: SecurityResume | null;
}) {
    const router = useRouter();
    const [returnToQuestion, setReturnToQuestion] = useState(false);
    const phoneReturnFlight = useRef(false);
    const [methods, setMethods] = useState<AuthMethodsResponse | null>(null);
    const [providers, setProviders] = useState<AuthProvidersResponse | null>(null);
    const [links, setLinks] = useState<SocialLinksResponse | null>(null);
    const [recovery, setRecovery] = useState<RecoveryEmailSettings | null>(null);
    const [phoneResume, setPhoneResume] = useState<SecurityResume | null>(null);
    const [selected, setSelected] = useState<StepUpAuthorizationRequest | null>(null);
    const [held, setHeld] = useState<ConfirmedSecurityAction | null>(null);
    const [enrollment, setEnrollment] = useState<{ token: string; expiresAt: string } | null>(null);
    const [codes, setCodes] = useState<string[] | null>(null);
    const [email, setEmail] = useState('');
    const [removeRecovery, setRemoveRecovery] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    // Owner ruling 2026-10-09: an authenticator recovery waiting its 24 hours, which any signed-in session can cancel.
    const [pendingRecovery, setPendingRecovery] = useState<MfaRecoveryPendingResponse['pending']>(null);
    const [recoveryCancelled, setRecoveryCancelled] = useState(false);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);
    const [recoveryBusy, setRecoveryBusy] = useState(false);
    const recoveryFlight = useRef(false);
    const generation = useRef(0);
    const metadataSequence = useRef(0);
    const active = useRef(true);
    const flight = useRef(false);
    const seen = useRef<string | null>(null);
    // Screen-reader fixes (2026-10-15): the confirm card opens far below its button, so focus moves to the card's
    // heading and returns to the button when the card closes; the step-up grant's deadline is warned about and,
    // when it passes, focus lands on the message with Try again (which keeps a typed recovery address) after it.
    const announcer = useFormAnnouncer();
    const pageTitle = useRef<HTMLHeadingElement>(null);
    const cardHeading = useRef<HTMLHeadingElement>(null);
    const errorMessage = useRef<HTMLParagraphElement>(null);
    const opener = useRef<HTMLElement | null>(null);
    const returnFocus = useRef(false);
    const [retry, setRetry] = useState<{ authorization: StepUpAuthorizationRequest; remove: boolean; email: string } | null>(null);
    const [expiredAt, setExpiredAt] = useState(0);
    const latest = useRef({ selected, removeRecovery, email });
    latest.current = { selected, removeRecovery, email };
    async function refresh() {
        const epoch = ++metadataSequence.current;
        // Partial metadata failure does not erase successfully loaded, safe account metadata.
        await Promise.all([
            client.authMethods().then(value => { if (active.current && epoch === metadataSequence.current) setMethods(value); }),
            client.authProviders().then(value => { if (active.current && epoch === metadataSequence.current) setProviders(value); }),
            client.linkedSocialProviders().then(value => { if (active.current && epoch === metadataSequence.current) setLinks(value); }),
            client.recoveryEmail().then(value => { if (active.current && epoch === metadataSequence.current) setRecovery(value); })
        ]);
    }
    useEffect(() => {
        active.current = true;
        const epoch = ++generation.current;
        void refresh().catch(() => { if (active.current && epoch === generation.current) setError(t(catalog, 'settings.email.unavailable')); });
        const ended = (event: Event) => { if (event instanceof CustomEvent && event.detail?.ended === true) { metadataSequence.current++; generation.current++; setHeld(null); setSelected(null); setEnrollment(null); setCodes(null); setEmail(''); } };
        window.addEventListener('debateai:staff-session-ended', ended);
        return () => { active.current = false; metadataSequence.current++; generation.current++; window.removeEventListener('debateai:staff-session-ended', ended); };
    }, [client, catalog]);
    useEffect(() => {
        if (!provided || seen.current === provided.initialProof.step_up_grant.token) return;
        seen.current = provided.initialProof.step_up_grant.token;
        receive(provided.authorization, provided.initialProof);
    }, [provided]);
    useEffect(() => {
        const deadline = held?.step_up_grant.expires_at ?? enrollment?.expiresAt;
        if (!deadline) return;
        const timer = setTimeout(() => expire('auth.security.expired'), Math.max(0, Date.parse(deadline) - Date.now()));
        return () => clearTimeout(timer);
    }, [held, enrollment, authCatalog]);
    // The grant behind a resumed confirmation (WCAG 2.2.1); a set-up warns about its grant itself (`deadline`).
    const warning = useDeadlineWarning(held?.step_up_grant.expires_at ?? null, announcer.announce, t(authCatalog, 'auth.security.expiresSoon'));
    useEffect(() => {
        if (expiredAt)
            errorMessage.current?.focus();
    }, [expiredAt]);
    useEffect(() => {
        if (selected)
            cardHeading.current?.focus();
    }, [selected, enrollment]);
    useEffect(() => {
        if (!returnFocus.current || busy)
            return;
        returnFocus.current = false;
        const back = opener.current;
        if (back && back !== document.body && back.isConnected && !(back instanceof HTMLButtonElement && back.disabled)) back.focus();
        else pageTitle.current?.focus();
    });
    useEffect(() => {
        let current = true;
        void Promise.resolve().then(() => client.pendingMfaRecovery()).then(value => { if (current) setPendingRecovery(value.pending); }).catch(() => { /* No banner when the state cannot be read; nothing is changed. */ });
        return () => { current = false; };
    }, [client]);
    async function cancelPendingRecovery() {
        if (recoveryFlight.current) return;
        recoveryFlight.current = true; setRecoveryBusy(true); setRecoveryError(null);
        const failed = t(catalog, 'settings.security.pendingRecovery.failed');
        try {
            await client.cancelPendingMfaRecovery();
            if (active.current) { setPendingRecovery(null); setRecoveryCancelled(true); }
        } catch (failure) {
            if (!active.current) return;
            // Nothing left to cancel: the recovery already ended (finished, cancelled elsewhere or expired). Read it again.
            if (failure instanceof ContractHttpError && failure.status === 409) {
                try { const value = await client.pendingMfaRecovery(); if (active.current) { setPendingRecovery(value.pending); if (value.pending) setRecoveryError(failed); } }
                catch { if (active.current) setRecoveryError(failed); }
            } else setRecoveryError(failed);
        } finally { recoveryFlight.current = false; if (active.current) setRecoveryBusy(false); }
    }
    function withTime(message: string, iso: string) {
        const time = <time dateTime={iso}>{formatDate(locale, iso, { dateStyle: 'medium', timeStyle: 'short' })}</time>, at = message.indexOf('{time}');
        return at < 0 ? <>{message} {time}</> : <>{message.slice(0, at)}{time}{message.slice(at + '{time}'.length)}</>;
    }
    useEffect(() => {
        let current = true;
        void ownedPhoneCompletionDraft(client, () => current).then(value => { if (current) setReturnToQuestion(!!value); });
        return () => { current = false; };
    }, [client]);
    async function phoneUpdated() {
        if (phoneReturnFlight.current) return;
        const epoch = generation.current;
        const value = await ownedPhoneCompletionDraft(client, () => active.current && epoch === generation.current);
        if (!value || !active.current || epoch !== generation.current || phoneReturnFlight.current) return;
        if (acknowledgePhoneDraftUpdate(value.id, value.owner)) { phoneReturnFlight.current = true; router.push('/new'); }
    }
    function receive(authorization: StepUpAuthorizationRequest, initialProof: ConfirmedSecurityAction) {
        if (!matchingSecurityGrant(initialProof, authorization)) return;
        if (authorization.action === 'READ_PHONE_PROFILE' || authorization.action === 'CHANGE_PHONE_PROFILE') setPhoneResume({ authorization, initialProof });
        else if (['REMOVE_AUTH_METHOD', 'ADD_PASSKEY', 'ADD_TOTP', 'REGENERATE_RECOVERY_CODES', 'CHANGE_RECOVERY_EMAIL', 'LINK_PROVIDER', 'UNLINK_PROVIDER'].includes(authorization.action)) { setSelected(authorization); setHeld(initialProof); setEmail(''); setRemoveRecovery(false); setCodes(null); }
    }
    function cancel() { generation.current++; flight.current = false; setBusy(false); setSelected(null); setHeld(null); setEnrollment(null); setEmail(''); setRemoveRecovery(false); setCodes(null); setRetry(null); }
    function choose(authorization: StepUpAuthorizationRequest, remove = false) {
        const focused = document.activeElement;
        opener.current = focused instanceof HTMLElement ? focused : null;
        cancel(); setNotice(null); setError(null); setSelected(authorization); setRemoveRecovery(remove);
    }
    /** Closes the card and gives focus back to the button that opened it (the page title when it is gone). */
    function dismiss() { cancel(); returnFocus.current = true; }
    // The step-up grant (or the set-up's own limit) ran out and the action was cancelled: say so, put focus on the
    // message, and keep what was chosen and typed for Try again.
    function expire(key: 'auth.security.expired' | 'auth.enroll.timedOut') {
        const { selected: action, removeRecovery: remove, email: typed } = latest.current;
        cancel();
        setNotice(null);
        setError(t(authCatalog, key));
        setRetry(action ? { authorization: action, remove, email: typed } : null);
        setExpiredAt(Date.now());
    }
    function enrollmentFinished() {
        cancel();
        returnFocus.current = true;
        const epoch = ++generation.current;
        setError(null);
        setNotice(t(authCatalog, 'auth.enroll.methodAdded'));
        void refresh().catch(() => {
            if (active.current && epoch === generation.current) setError(t(catalog, 'settings.security.refreshFailed'));
        });
    }
    const allowed = selected?.action === 'REMOVE_AUTH_METHOD' ? !!methods?.methods.find(value => value.factor_id === selected.target_factor_id && value.removable)
        : selected?.action === 'UNLINK_PROVIDER' ? !!links?.providers.find(value => value.provider === selected.target_provider && value.removable)
        : selected?.action === 'LINK_PROVIDER' ? !!providers?.providers.find(value => value.id === selected.target_provider) && !links?.providers.some(value => value.provider === selected.target_provider)
        : selected?.action === 'CHANGE_RECOVERY_EMAIL' ? (removeRecovery ? recovery?.state !== 'absent' : emailShape(email)) : true;
    async function execute(result: ConfirmedSecurityAction) {
        if (!selected || !allowed || flight.current || !active.current || !matchingSecurityGrant(result, selected)) return;
        const authorization = selected; const epoch = ++generation.current;
        flight.current = true; setBusy(true); setError(null); setHeld(null);
        try {
            const token = result.step_up_grant.token;
            if (authorization.action === 'ADD_PASSKEY' || authorization.action === 'ADD_TOTP') {
                setEnrollment({ token, expiresAt: result.step_up_grant.expires_at });
                return;
            }
            if (authorization.action === 'REMOVE_AUTH_METHOD') await client.removeAuthMethod(authorization.target_factor_id, token);
            else if (authorization.action === 'REGENERATE_RECOVERY_CODES') {
                const value = await client.regenerateRecoveryCodes(token);
                if (active.current && epoch === generation.current) setCodes(value.codes);
            } else if (authorization.action === 'CHANGE_RECOVERY_EMAIL') {
                if (removeRecovery) await client.removeRecoveryEmail({ grantToken: token });
                else await client.requestRecoveryEmail({ email: email.trim(), grantToken: token });
            } else if (authorization.action === 'UNLINK_PROVIDER') await client.unlinkSocialProvider(authorization.target_provider, token);
            else if (authorization.action === 'LINK_PROVIDER') {
                const value = await client.beginSocialLink(authorization.target_provider, token);
                if (active.current && epoch === generation.current) window.location.assign(value.authorization_url);
            }
            if (active.current && epoch === generation.current) { setSelected(null); setEmail(''); returnFocus.current = true; await refresh(); }
        } catch (failure) {
            if (active.current && epoch === generation.current) {
                setSelected(null); setEmail(''); returnFocus.current = true;
                // A recovery address the server refused (its domain takes no mail) says so; anything else stays generic.
                setError(authorization.action === 'CHANGE_RECOVERY_EMAIL' && failure instanceof ContractHttpError && failure.serverCode === 'EMAIL_INVALID'
                    ? t(authCatalog, 'auth.emailUndeliverable') : t(catalog, 'settings.email.actionFailed'));
            }
        } finally { if (active.current && epoch === generation.current) { flight.current = false; setBusy(false); } }
    }
    // Each Remove button is named for what it removes; the card's heading repeats the button's name.
    const removeMethodLabel = (method: AuthMethodsResponse['methods'][number]) => method.label ? t(catalog, 'settings.security.removeNamed', { method: method.label })
        : method.type === 'passkey' ? t(catalog, 'settings.security.removePasskey') : t(catalog, 'settings.security.removeAuthenticator');
    const recoveryAddress = recovery?.email ?? recovery?.pending?.email ?? t(authCatalog, 'auth.recovery.emailTitle');
    function cardTitle(authorization: StepUpAuthorizationRequest): string {
        switch (authorization.action) {
            case 'REMOVE_AUTH_METHOD': {
                const method = methods?.methods.find(value => value.factor_id === authorization.target_factor_id);
                return method ? removeMethodLabel(method) : t(authCatalog, 'auth.enroll.securityTitle');
            }
            case 'UNLINK_PROVIDER': return t(catalog, 'settings.security.removeNamed', { method: providerName(authorization.target_provider) });
            case 'LINK_PROVIDER': return t(authCatalog, 'auth.social.continue', { provider: providers?.providers.find(value => value.id === authorization.target_provider)?.name ?? providerName(authorization.target_provider) });
            case 'ADD_PASSKEY': return t(authCatalog, 'auth.passkey.create');
            case 'ADD_TOTP': return t(authCatalog, 'auth.enroll.useAuthenticator');
            case 'REGENERATE_RECOVERY_CODES': return t(catalog, 'settings.security.regenerate');
            case 'CHANGE_RECOVERY_EMAIL': return removeRecovery ? t(catalog, 'settings.security.removeNamed', { method: recoveryAddress }) : t(catalog, 'settings.email.change');
            default: return t(authCatalog, 'auth.security.title');
        }
    }
    return <div className="screen scroll setScreen"><div className="setBody"><div className="setInner">
        <h1 className="setTitle" ref={pageTitle} tabIndex={-1}>{t(catalog, 'settings.security.title')}</h1>
        {announcer.region}
        {pendingRecovery ? <section className="setCard" data-pending-recovery aria-label={t(catalog, 'settings.security.pendingRecovery.title')}>
            <p className="setCardTitle">{t(catalog, 'settings.security.pendingRecovery.title')}</p>
            {/* Review M2 2026-10-09: it never finishes by itself; say from when it can be finished, and "now" once that time has passed. */}
            <p className="setStatus">{Date.parse(pendingRecovery.not_before) <= Date.now() ? t(catalog, 'settings.security.pendingRecovery.bodyReady') : withTime(t(catalog, 'settings.security.pendingRecovery.body'), pendingRecovery.not_before)}</p>
            <p className="setStatus">{t(catalog, 'settings.security.pendingRecovery.keep')}</p>
            {recoveryError ? <p className="setError" role="alert">{recoveryError}</p> : null}
            <div className="setCardRow"><button type="button" className="setBtn setBtnRevoke" disabled={recoveryBusy} onClick={() => void cancelPendingRecovery()}>{t(catalog, 'settings.security.pendingRecovery.cancel')}</button></div>
        </section> : recoveryCancelled ? <p className="setStatus" role="status">{t(catalog, 'settings.security.pendingRecovery.cancelled')}</p> : null}
        <SecurityActionResume catalog={authCatalog} settingsCatalog={catalog} publicCatalog={publicCatalog} locale={locale} client={client} onResume={receive}/>
        {notice ? <p className="setStatus" role="status">{notice}</p> : null}
        {/* Always mounted, so a new error is announced as a change; focus lands here when the grant runs out. */}
        <p ref={errorMessage} tabIndex={-1} className={error ? 'setError' : 'srOnly'} role="alert">{error}</p>
        {error && retry ? <p className="setListActions"><button type="button" className="setBtn" onClick={() => {
            const again = retry, back = opener.current;
            choose(again.authorization, again.remove);
            setEmail(again.email);
            opener.current = back;
        }}>{t(authCatalog, 'auth.onboarding.tryAgain')}</button></p> : null}
        <PhoneProfileCard catalog={catalog} authCatalog={authCatalog} client={client} resume={phoneResume} onUpdated={phoneUpdated}/>
        {returnToQuestion ? <p className="setListActions"><a className="setBtn setBtnPrimary" href="/new">{t(authCatalog, 'auth.continue')}</a></p> : null}
        <div className="setSectionHead"><h2 className="setSectionTitle">{t(authCatalog, 'auth.enroll.securityTitle')}</h2></div>
        <section className="setList">
            {methods && methods.recovery_codes_remaining === 0 && !methods.methods.some(method => method.type === 'passkey') ? <p className="setStatus" data-lockout-reminder>{t(catalog, 'settings.security.lockoutReminder')}</p> : null}
            {(methods?.methods ?? []).map(method => <div key={method.factor_id} className="setSessionRow"><div className="setSessionMain"><span className="setSessionDevice">{method.label ?? t(authCatalog, method.type === 'passkey' ? 'auth.passkey.use' : 'auth.login.useAuthenticatorCode')}</span>{!method.removable ? <p className="setSessionSeen">{t(catalog, 'settings.security.lastPath')}</p> : null}</div><button type="button" className="setBtn setBtnRevoke" data-remove-factor aria-label={removeMethodLabel(method)} disabled={busy || !method.removable} onClick={() => choose({ action: 'REMOVE_AUTH_METHOD', target_factor_id: method.factor_id })}>{t(catalog, 'settings.security.remove')}</button></div>)}
            <div className="setListActions">
                <button type="button" className="setBtn" disabled={busy} onClick={() => choose({ action: 'ADD_PASSKEY' })}>{t(authCatalog, 'auth.passkey.create')}</button>
                <button type="button" className="setBtn" disabled={busy} onClick={() => choose({ action: 'ADD_TOTP' })}>{t(authCatalog, 'auth.enroll.useAuthenticator')}</button>
            </div>
            {methods ? <p className="setStatus">{t(catalog, 'settings.security.codesRemaining', { count: methods.recovery_codes_remaining })}</p> : null}
            <div className="setListActions"><button type="button" className="setBtn" disabled={busy || !methods} onClick={() => choose({ action: 'REGENERATE_RECOVERY_CODES' })}>{t(catalog, 'settings.security.regenerate')}</button></div>
            {codes ? <EphemeralCodes catalog={authCatalog} codes={codes}/> : null}
        </section>
        <div className="setSectionHead"><h2 className="setSectionTitle">{t(authCatalog, 'auth.recovery.emailTitle')}</h2></div>
        <section className="setList">
            <div className="setSessionRow"><div className="setSessionMain"><span className="setSessionDevice">{recovery?.email ?? '—'}</span>{recovery?.state === 'verified' ? <p className="setSessionSeen">{t(catalog, 'settings.email.verified')}</p> : null}{recovery?.pending ? <p className="setSessionSeen">{t(catalog, 'settings.email.pendingBadge')} · {recovery.pending.email}</p> : null}</div></div>
            <div className="setListActions">
                <button type="button" className="setBtn" disabled={busy} onClick={() => choose({ action: 'CHANGE_RECOVERY_EMAIL' })}>{t(catalog, 'settings.email.change')}</button>
                {recovery && recovery.state !== 'absent' ? <button type="button" className="setBtn setBtnRevoke" aria-label={t(catalog, 'settings.security.removeNamed', { method: recoveryAddress })} disabled={busy} onClick={() => choose({ action: 'CHANGE_RECOVERY_EMAIL' }, true)}>{t(catalog, 'settings.security.remove')}</button> : null}
            </div>
        </section>
        <BackupEmailVerification locale={locale}/>
        <div className="setSectionHead"><h2 className="setSectionTitle">{t(authCatalog, 'auth.social.methods')}</h2></div>
        <section className="setList">
            {(links?.providers ?? []).map(link => <div key={link.provider} className="setSessionRow"><div className="setSessionMain"><span className="setSessionDevice">{providerName(link.provider)}</span>{!link.removable ? <p className="setSessionSeen">{t(catalog, 'settings.security.lastPath')}</p> : null}</div><button type="button" className="setBtn setBtnRevoke" aria-label={t(catalog, 'settings.security.removeNamed', { method: providerName(link.provider) })} disabled={busy || !link.removable} onClick={() => choose({ action: 'UNLINK_PROVIDER', target_provider: link.provider })}>{t(catalog, 'settings.security.remove')}</button></div>)}
            <div className="setListActions">
                {(providers?.providers ?? []).filter(provider => !links?.providers.some(link => link.provider === provider.id)).map(provider => <button type="button" className="setBtn" key={provider.id} disabled={busy || !links} onClick={() => choose({ action: 'LINK_PROVIDER', target_provider: provider.id })}>{t(authCatalog, 'auth.social.continue', { provider: provider.name })}</button>)}
            </div>
        </section>
        {selected ? <section className="setCard" aria-labelledby="security-card-title">
            <h2 className="setCardTitle" id="security-card-title" ref={cardHeading} tabIndex={-1}>{cardTitle(selected)}</h2>
            {warning ? <p className="setStatus">{t(authCatalog, 'auth.security.expiresSoon')}</p> : null}
            {selected.action === 'CHANGE_RECOVERY_EMAIL' ? <>{removeRecovery ? null : <div className="authField"><label htmlFor="security-recovery-email">{t(authCatalog, 'auth.recovery.emailTitle')}</label><input id="security-recovery-email" type="email" value={email} autoComplete="email" onChange={event => setEmail(event.target.value)}/></div>}
                {held ? <button type="button" className="setBtn setBtnQuiet" onClick={() => setRemoveRecovery(!removeRecovery)}>{t(catalog, removeRecovery ? 'settings.email.change' : 'settings.security.remove')}</button> : null}</> : null}
            {enrollment ? <><SecurityEnrollment authority={{ kind: 'grant', token: enrollment.token }} deadline={enrollment.expiresAt} availableMethods={selected.action === 'ADD_TOTP' ? ['totp'] : ['passkey']} catalog={authCatalog} client={client} onEnrolled={enrollmentFinished} onExpired={() => expire('auth.enroll.timedOut')}/><div className="setCardRow"><button type="button" className="setBtn setBtnQuiet" onClick={dismiss}>{t(authCatalog, 'auth.security.cancel')}</button></div></>
                : held ? <div className="setCardRow"><button type="button" className="setBtn setBtnPrimary" data-resumed-confirm disabled={busy || !allowed} onClick={() => void execute(held)}>{t(authCatalog, 'auth.security.confirm')}</button><button type="button" className="setBtn setBtnQuiet" onClick={dismiss}>{t(authCatalog, 'auth.security.cancel')}</button></div>
                : <SecurityConfirmation catalog={authCatalog} client={client} authorization={selected} disabled={busy || !allowed} onConfirmed={execute} onCancel={dismiss}/>}
        </section> : null}
        <SessionControls catalog={catalog} locale={locale} client={client}/>
    </div></div></div>;
}

export function SecuritySettingsPageClient(props: {catalog: MessageCatalog; authCatalog: MessageCatalog; publicCatalog: MessageCatalog; newDebateCatalog: MessageCatalog; locale: LocaleCode}) {
    return <AuthGate catalog={props.newDebateCatalog} legalGate={false}>{() => <SecuritySettings {...props}/>}</AuthGate>;
}
