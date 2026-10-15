"use client";
import { useEffect, useRef, useState } from 'react';
import type { ContractClient, ConsumerRecoveryProofResponse } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { takeFragmentToken } from '@/lib/mfaEnrollment';
import { safeReturnPath } from '@/lib/returnPath';
import { signInEmailShape } from '@/lib/authFormValidation';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import type { LocaleCode } from '@/lib/i18n/locales';
import { KnownPasswordRecoveryLink } from '../KnownPasswordRecoveryLink';
import resetEn from '@/messages/en/password-reset.json';
import resetRo from '@/messages/ro/password-reset.json';
import { AuthShell } from '../AuthShell';
import { OnboardingEvidence } from './OnboardingEvidence';
import { SecurityEnrollment } from './SecurityEnrollment';
import { clearStoredSupportConversation } from '../support/conversation';
import { useFormAnnouncer } from './InlineFieldMessage';
import { useDeadlineWarning, useStepFocus } from './timedStep';
export function RecoveryFlow({ catalog, locale, client = contractClient, onAuthenticated = () => window.location.assign(safeReturnPath(new URLSearchParams(window.location.search).get('next'))) }: {
    catalog: MessageCatalog;
    locale: LocaleCode;
    client?: ContractClient;
    onAuthenticated?: () => void;
}) {
    const started = useRef(false);
    const flight = useRef(false);
    const [token, setToken] = useState('');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [proof, setProof] = useState<ConsumerRecoveryProofResponse | null>(null);
    const [ready, setReady] = useState(false);
    const [expired, setExpired] = useState(false);
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // The field the error belongs to, which then points at it (aria-invalid + aria-describedby).
    const [errorField, setErrorField] = useState<'email' | 'code' | null>(null);
    const expiredMessage = useRef<HTMLDivElement>(null);
    // Set when the proof runs out, so that step change lands on the expiry message (the email form, which
    // restarts recovery, follows it) instead of the headline.
    const expiryFocus = useRef(false);
    const announcer = useFormAnnouncer();
    // Each step replaces the controls that held focus: focus moves to the headline, or to the expiry message.
    const step = proof ? (ready ? 'enroll' : 'evidence') : token ? 'code' : sent ? 'sent' : 'email';
    const moved = useStepFocus(step, () => {
        if (!expiryFocus.current)
            return null;
        expiryFocus.current = false;
        return expiredMessage.current;
    });
    // About a minute before the proof's server deadline (WCAG 2.2.1). Once the set-up shows, SecurityEnrollment
    // warns about the same deadline itself.
    const warning = useDeadlineWarning(proof && !ready ? proof.expires_at : null, announcer.announce, t(catalog, 'auth.security.expiresSoon'));
    useEffect(() => {
        if (started.current)
            return;
        started.current = true;
        const hadToken = /token|%74oken/i.test(window.location.hash + window.location.search);
        const bearer = takeFragmentToken(window.location, window.history);
        if (bearer)
            setToken(bearer);
        else if (hadToken)
            setError(t(catalog, "auth.enroll.invalidLink"));
    }, []);
    useEffect(() => {
        if (!proof)
            return;
        const timer = setTimeout(() => {
            setProof(null);
            setReady(false);
            setToken('');
            setCode('');
            expiryFocus.current = true;
            setExpired(true);
        }, Math.max(0, new Date(proof.expires_at).getTime() - Date.now()));
        return () => clearTimeout(timer);
    }, [proof]);
    async function start(form: HTMLFormElement) {
        if (flight.current)
            return;
        const address = String(new FormData(form).get('email') ?? '').trim();
        setEmail(address);
        if (!signInEmailShape(address)) {
            setErrorField('email');
            setError(t(catalog, "auth.invalidEmail"));
            form.querySelector<HTMLElement>('[name=email]')?.focus();
            return;
        }
        flight.current = true;
        setBusy(true);
        setError(null);
        try {
            await client.startRecovery(address);
            setSent(true);
        }
        catch {
            setErrorField(null);
            setError(t(catalog, "auth.login.verificationFailed"));
        }
        finally {
            flight.current = false;
            setBusy(false);
        }
    }
    async function prove(form: HTMLFormElement) {
        if (flight.current || !token)
            return;
        const savedCode = String(new FormData(form).get('code') ?? '').trim();
        setCode(savedCode);
        if (!savedCode) {
            setErrorField('code');
            setError(t(catalog, "auth.login.recoveryCodeRejected"));
            form.querySelector<HTMLElement>('[name=code]')?.focus();
            return;
        }
        flight.current = true;
        setBusy(true);
        setError(null);
        try {
            const result = await client.recoveryProve({ token, recovery_code: savedCode, method: 'passkey' });
            setToken('');
            setCode('');
            // Since 2026-10-09 a used code is never refilled: the proof carries no replacement code (the contract refuses one).
            setProof(result);
            clearStoredSupportConversation();
            window.dispatchEvent(new Event('debateai:staff-session-ended'));
        }
        catch {
            setErrorField('code');
            setError(t(catalog, "auth.login.recoveryCodeRejected"));
        }
        finally {
            flight.current = false;
            setBusy(false);
        }
    }
    const invalid = (field: 'email' | 'code') => error !== null && errorField === field;
    return <AuthShell eyebrow={t(catalog, "auth.login.recoveryAccess")} title={t(catalog, "auth.recovery.title")} description={t(catalog, "auth.recovery.description")} focusTitle={moved} footer={!proof&&!token?<p><a href="/reset-password">{t(locale==='ro'?resetRo:resetEn,"request.title")}</a> · <KnownPasswordRecoveryLink/></p>:null}>
 {announcer.region}
 {error ? <div className="authAlert" id="recover-error" role="alert">{error}</div> : null}
 {/* Always mounted, so the expiry is announced as a change; focus lands here when the proof runs out. */}
 <div ref={expiredMessage} tabIndex={-1} className={expired ? 'authAlert' : 'srOnly'} role="alert">{expired ? t(catalog, "auth.recovery.restart") : null}</div>
 {warning ? <p className="authFinePrint">{t(catalog, 'auth.security.expiresSoon')}</p> : null}
 {proof ? ready ? <SecurityEnrollment catalog={catalog} client={client} authority={{ kind: 'recovery', token: proof.recovery_capability, expiresAt: proof.expires_at, availableMethods: proof.available_methods, totpUnavailableReason: proof.totp_unavailable_reason }} onAuthenticated={() => {
                setProof(null);
                onAuthenticated();
            }} onExpired={() => {
                setProof(null);
                setReady(false);
                expiryFocus.current = true;
                setExpired(true);
            }}/> : <OnboardingEvidence catalog={catalog} locale={locale} client={client} authority={{ kind: 'recovery', token: proof.recovery_capability }} onReady={() => setReady(true)}/> : token ? <form className="authForm" method="post" action="/recover" noValidate onSubmit={e => {
                e.preventDefault();
                void prove(e.currentTarget);
            }}><div className="authField"><label htmlFor="recover-code">{t(catalog, "auth.login.recoveryCodeLabel")}</label><input className="authRecoveryInput" id="recover-code" name="code" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} disabled={busy} aria-invalid={invalid('code') || undefined} aria-describedby={invalid('code') ? 'recover-error' : undefined}/></div><button type="submit" className="authPrimary" disabled={busy}>{t(catalog, "auth.continue")}</button></form> : sent ? <p className="authFinePrint" role="status">{t(catalog, "auth.recovery.sent")}</p> : <form className="authForm" method="post" action="/recover" noValidate onSubmit={e => {
                e.preventDefault();
                void start(e.currentTarget);
            }}><div className="authField"><label htmlFor="recover-email">{t(catalog, "auth.email")}</label><input id="recover-email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} aria-invalid={invalid('email') || undefined} aria-describedby={invalid('email') ? 'recover-error' : undefined}/></div><button type="submit" className="authPrimary" disabled={busy}>{t(catalog, "auth.continue")}</button></form>}
 </AuthShell>;
}
