"use client";
import { useEffect, useRef, useState } from 'react';
import type { AuthenticationResponse, ContractClient, TotpEnrollmentResponse } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { createConsumerWebAuthnBrowser, type ConsumerWebAuthnBrowser } from '@/lib/consumerWebAuthn';
import { createCodeAttempt } from '@/lib/authCodeAttempt';
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
export function SecurityEnrollment({ authority, client = contractClient, catalog = authEnglish, browser: provided, onAuthenticated, onEnrolled, onExpired, offerRecoveryCodes = false, availableMethods }: {
    authority: EnrollmentAuthority;
    client?: EnrollmentClient;
    catalog?: MessageCatalog;
    browser?: ConsumerWebAuthnBrowser;
    onAuthenticated?: (result: AuthenticationResponse) => void;
    onEnrolled?: () => void;
    onExpired?: () => void;
    offerRecoveryCodes?: boolean;
    availableMethods?: readonly ('passkey' | 'totp')[];
}) {
    const browser = useRef(provided ?? createConsumerWebAuthnBrowser()).current;
    const sequence = useRef(0);
    const flight = useRef(false);
    const attempt = useRef(createCodeAttempt());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [expired, setExpired] = useState(false);
    const [authenticatedResult, setAuthenticatedResult] = useState<AuthenticationResponse | null>(null);
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
        setBusy(false);
        setTotp(null);
        setCode('');
        setShowKey(false);
        attempt.current.edited();
    }
    useEffect(() => {
        clearCeremony();
        setExpired(false);
        setEnrolled(false);
        setAuthenticatedResult(null);
        return () => {
            sequence.current++;
            browser.cancel();
            flight.current = false;
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
            if (offerRecoveryCodes && authority.kind === 'pending')
                setAuthenticatedResult(result);
            else
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
            const result = authority.kind === 'recovery' ? await client.completeRecoveryEnrollment({ recovery_capability: authority.token, challenge_handle: options.challenge_handle, credential }) : await client.completePasskeyEnrollment({ challenge_handle: options.challenge_handle, credential });
            if (owner === sequence.current)
                finish(result);
        }
        catch {
            if (owner === sequence.current)
                setError(t(catalog, "auth.passkey.cancelled"));
        }
        finally {
            if (owner === sequence.current) {
                flight.current = false;
                setBusy(false);
            }
        }
    }
    async function beginTotp() {
        if (expired)
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
        catch {
            if (owner === sequence.current)
                setError(t(catalog, "auth.enroll.totpUnavailable"));
        }
        finally {
            if (owner === sequence.current) {
                flight.current = false;
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
            const result = authority.kind === 'recovery' ? await client.completeRecoveryEnrollment({ recovery_capability: authority.token, challenge_handle: totp.token, code: value }) : await client.completeTotpEnrollment({ enrollment_token: totp.token, code: value });
            if (owner === sequence.current)
                finish(result);
        }
        catch {
            if (owner === sequence.current)
                setError(t(catalog, "auth.login.authenticationCodeRejected"));
        }
        finally {
            if (owner === sequence.current) {
                flight.current = false;
                setBusy(false);
            }
        }
    }
    const matrix = totp ? totpQrMatrix(totp.uri) : null;
    if (authenticatedResult)
        return <section><p role="status">{t(catalog, "auth.enroll.methodAdded")}</p><a href="/settings/security">{t(catalog, "auth.enroll.recoveryCodesSettings")}</a><button type="button" className="authPrimary" onClick={() => {
            const result = authenticatedResult;
            setAuthenticatedResult(null);
            onAuthenticated?.(result);
        }}>{t(catalog, "auth.continue")}</button></section>;
    if (expired)
        return <p role="alert">{t(catalog, "auth.enroll.expired")}</p>;
    if (enrolled)
        return <p role="status">{t(catalog, "auth.enroll.methodAdded")}</p>;
    return <section aria-label={t(catalog, "auth.enroll.securityTitle")}>
    {error ? <p role="alert">{error}</p> : null}
    <p>{t(catalog, "auth.enroll.passkeyPreferred")}</p>
    {allowed.includes('passkey') ? <button type="button" className="authPrimary" disabled={busy} onClick={() => void passkey()}>{t(catalog, "auth.passkey.create")}</button> : null}
    {allowed.includes('totp') ? <button type="button" className="authTextButton" onClick={() => void beginTotp()}>{t(catalog, "auth.enroll.useAuthenticator")}</button> : null}
    {authority.kind === 'recovery' && authority.totpUnavailableReason === 'PASSWORD_UNAVAILABLE' ? <p>{t(catalog, "auth.recovery.passwordUnavailable")}</p> : null}
    {totp ? <div>
      {matrix ? <svg width="180" height="180" viewBox={`0 0 ${matrix.length + 8} ${matrix.length + 8}`} role="img" aria-label={t(catalog, "auth.enroll.scanQr")}><rect width="100%" height="100%" fill="white"/><path fill="black" d={matrix.flatMap((row, y) => row.flatMap((v, x) => v ? [`M${x + 4} ${y + 4}h1v1h-1z`] : [])).join('')}/></svg> : null}
      <button type="button" onClick={() => setShowKey(!showKey)}>{t(catalog, "auth.enroll.useSetupKey")}</button>
      {showKey ? <div><code>{totp.secret}</code><button type="button" onClick={() => void navigator.clipboard.writeText(totp.secret)}>{t(catalog, "auth.enroll.copySetupKey")}</button></div> : null}
      <form method="post" action="/enroll-mfa" noValidate onSubmit={e => {
                e.preventDefault();
                void submitCode(code);
            }}>
        <label htmlFor="enrollment-code">{t(catalog, "auth.enroll.currentSixDigitCode")}</label>
        <input id="enrollment-code" name="code" value={code} autoComplete="one-time-code" inputMode="numeric" maxLength={6} disabled={busy} onChange={e => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                if (value !== code)
                    attempt.current.edited();
                setCode(value);
                if (value.length === 6)
                    void submitCode(value);
            }}/>
        <button type="submit" disabled={busy || code.length !== 6}>{t(catalog, "auth.continue")}</button>
      </form>
    </div> : null}
  </section>;
}
