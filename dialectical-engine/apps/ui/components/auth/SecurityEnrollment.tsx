"use client";
import {ContractHttpError} from "@debateai/contract";
import {clearStoredSupportConversation} from "../support/conversation";
import {announceSessionChange} from "../support/sessionChange";
import { useEffect, useRef, useState } from 'react';
import type { AuthenticationResponse, ContractClient, TotpEnrollmentResponse } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { createConsumerWebAuthnBrowser, type ConsumerWebAuthnBrowser } from '@/lib/consumerWebAuthn';
import { createCodeAttempt } from '@/lib/authCodeAttempt';
import { readSixDigitCode } from '@/lib/sixDigitCode';
import { InlineFieldMessage } from './InlineFieldMessage';
import { totpQrMatrix } from '@/lib/totpQr';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import authEnglish from '@/messages/en/auth.json';
export type EnrollmentAuthority = {
    kind: 'pending';
    token: string;
} | {
    kind: 'grant';
    token: string;
} | {
    kind: 'recovery';
    token: string;
    expiresAt: string;
    availableMethods: readonly ('passkey' | 'totp')[];
    totpUnavailableReason?: 'PASSWORD_UNAVAILABLE' | null;
};
export type EnrollmentClient = Pick<ContractClient, 'beginPasskeyEnrollment' | 'completePasskeyEnrollment' | 'beginTotpEnrollment' | 'completeTotpEnrollment' | 'beginRecoveryEnrollment' | 'completeRecoveryEnrollment'>;
export function SecurityEnrollment({ authority, client = contractClient, catalog = authEnglish, browser: provided, onAuthenticated, onEnrolled, onExpired, availableMethods }: {
    authority: EnrollmentAuthority;
    client?: EnrollmentClient;
    catalog?: MessageCatalog;
    browser?: ConsumerWebAuthnBrowser;
    onAuthenticated?: (result: AuthenticationResponse) => void;
    onEnrolled?: () => void;
    onExpired?: () => void;
    availableMethods?: readonly ('passkey' | 'totp')[];
}) {
    const browser = useRef(provided ?? createConsumerWebAuthnBrowser()).current;
    const sequence = useRef(0);
    const flight = useRef(false);
    const dispatched = useRef(false);
    const [completing, setCompleting] = useState(false);
    const attempt = useRef(createCodeAttempt());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [codeError, setCodeError] = useState<string | null>(null);
    const codeField = useRef<HTMLInputElement>(null);
    const [refocusCode, setRefocusCode] = useState(0);
    useEffect(() => {
        if (refocusCode)
            codeField.current?.focus();
    }, [refocusCode]);
    const [showKey, setShowKey] = useState(false);
    const [expired, setExpired] = useState(false);
    const [enrolled, setEnrolled] = useState(false);
    const [totp, setTotp] = useState<{
        secret: string;
        uri: string;
        token: string;
        expiresAt: string;
    } | null>(null);
    const allowed = authority.kind === 'recovery' ? authority.availableMethods : authority.kind === 'grant' ? availableMethods ?? ['passkey', 'totp'] : ['passkey', 'totp'];
    function clearCeremony() {
        sequence.current++;
        browser.cancel();
        flight.current = false;
        dispatched.current = false;
        setCompleting(false);
        setBusy(false);
        setTotp(null);
        setCode('');
        setCodeError(null);
        setShowKey(false);
        attempt.current.edited();
    }
    useEffect(() => {
        clearCeremony();
        setExpired(false);
        setEnrolled(false);
        return () => {
            sequence.current++;
            browser.cancel();
            flight.current = false;
            dispatched.current = false;
            setCompleting(false);
        };
    }, [authority.token, browser]);
    useEffect(() => {
        const expiresAt = authority.kind === 'recovery' ? authority.expiresAt : totp?.expiresAt;
        if (!expiresAt)
            return;
        const timer = setTimeout(() => {
            clearCeremony();
            setExpired(true);
            onExpired?.();
        }, Math.max(0, new Date(expiresAt).getTime() - Date.now()));
        return () => clearTimeout(timer);
    }, [authority.token, authority.kind === 'recovery' ? authority.expiresAt : totp?.expiresAt]);
    function finish(result: TotpEnrollmentResponse) {
        clearCeremony();
        if (result.status === 'authenticated') {
            clearStoredSupportConversation();
            announceSessionChange();
            onAuthenticated?.(result);
        }
        else {
            setEnrolled(true);
            onEnrolled?.();
        }
    }
    async function passkey() {
        if (flight.current || expired)
            return;
        clearCeremony();
        flight.current = true;
        setBusy(true);
        setError(null);
        const owner = sequence.current;
        try {
            const input = authority.kind === 'grant' ? { step_up_grant: authority.token } : { enrollment_token: authority.token };
            const options = authority.kind === 'recovery' ? await client.beginRecoveryEnrollment({ recovery_capability: authority.token, method: 'passkey' }) : await client.beginPasskeyEnrollment(input);
            if (owner !== sequence.current)
                return;
            if (!('options' in options))
                throw new Error('PASSKEY_OPTIONS_INVALID');
            const credential = await browser.register(options.options);
            if (owner !== sequence.current)
                return;
            dispatched.current = true;
            setCompleting(true);
            const result = authority.kind === 'recovery' ? await client.completeRecoveryEnrollment({ recovery_capability: authority.token, challenge_handle: options.challenge_handle, credential }) : await client.completePasskeyEnrollment({ challenge_handle: options.challenge_handle, credential });
            if (owner === sequence.current)
                finish(result);
        }
        catch (failure) {
            if (dispatched.current && authority.kind !== 'grant' && !(failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500)) clearStoredSupportConversation();
            if (owner === sequence.current)
                setError(t(catalog, "auth.passkey.cancelled"));
        }
        finally {
            if (owner === sequence.current) {
                flight.current = false;
                dispatched.current = false;
                setCompleting(false);
                setBusy(false);
            }
        }
    }
    async function beginTotp() {
        if (expired || dispatched.current)
            return;
        clearCeremony();
        flight.current = true;
        setBusy(true);
        setError(null);
        const owner = sequence.current;
        try {
            if (authority.kind === 'recovery') {
                const result = await client.beginRecoveryEnrollment({ recovery_capability: authority.token, method: 'totp' });
                if (result.method !== 'totp')
                    throw new Error('TOTP_OPTIONS_INVALID');
                if (owner === sequence.current)
                    setTotp({ secret: result.secret, uri: result.otpauthUri, token: result.challenge_handle, expiresAt: result.expires_at });
            }
            else {
                const result = await client.beginTotpEnrollment(authority.kind === 'grant' ? { step_up_grant: authority.token } : { enrollment_token: authority.token });
                if (owner === sequence.current)
                    setTotp({ secret: result.secret, uri: result.otpauthUri, token: result.enrollment_token, expiresAt: result.expires_at });
            }
        }
        catch (failure) {
            if (dispatched.current && authority.kind !== 'grant' && !(failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500)) clearStoredSupportConversation();
            if (owner === sequence.current)
                setError(t(catalog, "auth.enroll.totpUnavailable"));
        }
        finally {
            if (owner === sequence.current) {
                flight.current = false;
                dispatched.current = false;
                setCompleting(false);
                setBusy(false);
            }
        }
    }
    async function submitCode(value: string) {
        if (!totp || flight.current || expired || !attempt.current.claim(`${authority.token}:${totp.token}`, value))
            return;
        flight.current = true;
        setBusy(true);
        setError(null);
        const owner = sequence.current;
        try {
            dispatched.current = true;
            setCompleting(true);
            const result = authority.kind === 'recovery' ? await client.completeRecoveryEnrollment({ recovery_capability: authority.token, challenge_handle: totp.token, code: value }) : await client.completeTotpEnrollment({ enrollment_token: totp.token, code: value });
            if (owner === sequence.current)
                finish(result);
        }
        catch (failure) {
            if (dispatched.current && authority.kind !== 'grant' && !(failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500)) clearStoredSupportConversation();
            if (owner === sequence.current) {
                setError(t(catalog, "auth.login.authenticationCodeRejected"));
                setCode('');
                attempt.current.edited();
                setRefocusCode(n => n + 1);
            }
        }
        finally {
            if (owner === sequence.current) {
                flight.current = false;
                dispatched.current = false;
                setCompleting(false);
                setBusy(false);
            }
        }
    }
    const matrix = totp ? totpQrMatrix(totp.uri) : null;
    if (expired)
        // The setup's own time limit ran out (the link, if any, was used long before): say so and let the person start over.
        return <section className="authEnrollment" aria-label={t(catalog, "auth.enroll.securityTitle")}><p className="authFieldError" role="alert">{t(catalog, "auth.enroll.timedOut")}</p>{authority.kind === 'recovery' ? null : <button type="button" className="authPrimary" onClick={() => {
                clearCeremony();
                setError(null);
                setExpired(false);
            }}>{t(catalog, "auth.enroll.startAgain")}</button>}</section>;
    if (enrolled)
        return <p role="status">{t(catalog, "auth.enroll.methodAdded")}</p>;
    return <section className="authEnrollment" aria-label={t(catalog, "auth.enroll.securityTitle")}>
    {error ? <p className="authFieldError" role="alert">{error}</p> : null}
    <p>{t(catalog, "auth.enroll.passkeyPreferred")}</p>
    {allowed.includes('passkey') ? <p id="enrollment-passkey-help">{t(catalog, "auth.enroll.passkeyExplanation")}</p> : null}
    {allowed.includes('passkey') ? <button type="button" className="authPrimary" aria-describedby="enrollment-passkey-help" disabled={busy} onClick={() => void passkey()}>{t(catalog, "auth.passkey.create")}</button> : null}
    {allowed.includes('totp') ? <button type="button" className="authTextButton" disabled={completing} onClick={() => void beginTotp()}>{t(catalog, "auth.enroll.useAuthenticator")}</button> : null}
    {authority.kind === 'recovery' && authority.totpUnavailableReason === 'PASSWORD_UNAVAILABLE' ? <p>{t(catalog, "auth.recovery.passwordUnavailable")}</p> : null}
    {totp ? <div className="authEnrollment">
      {matrix ? <svg width="180" height="180" viewBox={`0 0 ${matrix.length + 8} ${matrix.length + 8}`} role="img" aria-label={t(catalog, "auth.enroll.scanQr")}><rect width="100%" height="100%" fill="white"/><path fill="black" d={matrix.flatMap((row, y) => row.flatMap((v, x) => v ? [`M${x + 4} ${y + 4}h1v1h-1z`] : [])).join('')}/></svg> : null}
      <button type="button" className="authTextButton" aria-expanded={showKey} onClick={() => setShowKey(!showKey)}>{t(catalog, "auth.enroll.useSetupKey")}</button>
      {showKey ? <div className="authSetupKey"><code>{totp.secret}</code><button type="button" className="authSecondary" onClick={() => void navigator.clipboard.writeText(totp.secret)}>{t(catalog, "auth.enroll.copySetupKey")}</button></div> : null}
      <form className="authForm" method="post" action="/enroll-mfa" noValidate onSubmit={e => {
                e.preventDefault();
                void submitCode(code);
            }}>
        <div className="authField"><label htmlFor="enrollment-code">{t(catalog, "auth.enroll.currentSixDigitCode")}</label>
        <input ref={codeField} id="enrollment-code" name="code" value={code} autoComplete="one-time-code" inputMode="numeric" disabled={busy} aria-invalid={!!codeError || undefined} aria-describedby={codeError ? 'enrollment-code-error' : undefined} onChange={e => {
                const typed = readSixDigitCode(e.target.value);
                const shown = typed.valid ? typed.digits : e.target.value;
                if (shown !== code)
                    attempt.current.edited();
                setCode(shown);
                setCodeError(typed.valid ? null : t(catalog, "auth.login.codeFormat"));
                if (typed.complete)
                    void submitCode(typed.digits);
            }}/><InlineFieldMessage id="enrollment-code-error" message={codeError}/></div>
        <button type="submit" className="authPrimary" disabled={busy || !readSixDigitCode(code).complete}>{t(catalog, "auth.continue")}</button>
      </form>
    </div> : null}
  </section>;
}
