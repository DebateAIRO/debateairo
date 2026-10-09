"use client";
import { useEffect, useRef, useState } from 'react';
import type { ContractClient, ConsumerRecoveryProofResponse } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { takeFragmentToken } from '@/lib/mfaEnrollment';
import { safeReturnPath } from '@/lib/returnPath';
import { emailShape } from '@/lib/authFormValidation';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import type { LocaleCode } from '@/lib/i18n/locales';
import { KnownPasswordRecoveryLink } from '../KnownPasswordRecoveryLink';
import resetEn from '@/messages/en/password-reset.json';
import resetRo from '@/messages/ro/password-reset.json';
import { AuthShell } from '../AuthShell';
import { OnboardingEvidence } from './OnboardingEvidence';
import { SecurityEnrollment } from './SecurityEnrollment';
import { clearStoredSupportConversation } from '../support/conversation';
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
            setExpired(true);
        }, Math.max(0, new Date(proof.expires_at).getTime() - Date.now()));
        return () => clearTimeout(timer);
    }, [proof]);
    async function start(form: HTMLFormElement) {
        if (flight.current)
            return;
        const address = String(new FormData(form).get('email') ?? '').trim();
        setEmail(address);
        if (!emailShape(address)) {
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
            setError(t(catalog, "auth.login.recoveryCodeRejected"));
        }
        finally {
            flight.current = false;
            setBusy(false);
        }
    }
    return <AuthShell eyebrow={t(catalog, "auth.login.recoveryAccess")} title={t(catalog, "auth.recovery.title")} description={t(catalog, "auth.recovery.description")} footer={!proof&&!token?<p><a href="/reset-password">{t(locale==='ro'?resetRo:resetEn,"request.title")}</a> · <KnownPasswordRecoveryLink/></p>:null}>
 {error ? <div className="authAlert" role="alert">{error}</div> : null}
 {expired ? <div className="authAlert" role="alert">{t(catalog, "auth.recovery.restart")}</div> : null}
 {proof ? ready ? <SecurityEnrollment catalog={catalog} client={client} authority={{ kind: 'recovery', token: proof.recovery_capability, expiresAt: proof.expires_at, availableMethods: proof.available_methods, totpUnavailableReason: proof.totp_unavailable_reason }} onAuthenticated={() => {
                setProof(null);
                onAuthenticated();
            }} onExpired={() => {
                setProof(null);
                setReady(false);
                setExpired(true);
            }}/> : <OnboardingEvidence catalog={catalog} locale={locale} client={client} authority={{ kind: 'recovery', token: proof.recovery_capability }} onReady={() => setReady(true)}/> : token ? <form className="authForm" method="post" action="/recover" noValidate onSubmit={e => {
                e.preventDefault();
                void prove(e.currentTarget);
            }}><div className="authField"><label htmlFor="recover-code">{t(catalog, "auth.login.recoveryCodeLabel")}</label><input className="authRecoveryInput" id="recover-code" name="code" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} disabled={busy}/></div><button type="submit" className="authPrimary" disabled={busy}>{t(catalog, "auth.continue")}</button></form> : sent ? <p className="authFinePrint" role="status">{t(catalog, "auth.recovery.sent")}</p> : <form className="authForm" method="post" action="/recover" noValidate onSubmit={e => {
                e.preventDefault();
                void start(e.currentTarget);
            }}><div className="authField"><label htmlFor="recover-email">{t(catalog, "auth.email")}</label><input id="recover-email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></div><button type="submit" className="authPrimary" disabled={busy}>{t(catalog, "auth.continue")}</button></form>}
 </AuthShell>;
}
