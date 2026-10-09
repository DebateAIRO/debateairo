"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { ContractHttpError, type AuthMethodsResponse, type ContractClient, type StepUpAuthorizationRequest, type StepUpResponse } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { createConsumerWebAuthnBrowser, type ConsumerWebAuthnBrowser } from '@/lib/consumerWebAuthn';
import { matchingSecurityGrant, type ConfirmedSecurityAction } from '@/lib/securityConfirmation';
import { createCodeAttempt } from '@/lib/authCodeAttempt';
import { readSixDigitCode } from '@/lib/sixDigitCode';
import { InlineFieldMessage } from './InlineFieldMessage';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { EphemeralCodes } from './EphemeralCodes';
export type SecurityConfirmationClient = Partial<Pick<ContractClient, 'authMethods' | 'beginPasskeyStepUp' | 'completePasskeyStepUp' | 'stepUp' | 'beginSocialStepUp'>>;
export interface SecurityConfirmationProps {
    authorization: StepUpAuthorizationRequest;
    catalog: MessageCatalog;
    client?: SecurityConfirmationClient;
    browser?: ConsumerWebAuthnBrowser;
    initialProof?: StepUpResponse;
    disabled?: boolean;
    onConfirmed: (result: ConfirmedSecurityAction) => void | Promise<void>;
    onCancel?: () => void;
    onError?: (failure: unknown) => void;
    onBeforeProviderRedirect?: (context: {authorization: StepUpAuthorizationRequest; isCurrent: () => boolean}) => void | boolean | Promise<void | boolean>;
}
/** Exact action/target proof. Callback executes with the current rotated cookie/CSRF pair. */
export function SecurityConfirmation({ authorization, catalog, client = contractClient, browser: provided, initialProof, disabled = false, onConfirmed, onCancel, onError, onBeforeProviderRedirect }: SecurityConfirmationProps) {
    const enabled = useRef(!disabled);
    enabled.current = !disabled;
    const usedInitial = useRef<string | null>(null);
    const id = useId();
    const browser = useRef(provided ?? createConsumerWebAuthnBrowser()).current;
    const flight = useRef(false);
    const sequence = useRef(0);
    const attempt = useRef(createCodeAttempt());
    const key = JSON.stringify(authorization);
    const authorizationKey = useRef(key);
    authorizationKey.current = key;
    const [methods, setMethods] = useState<AuthMethodsResponse | null>(null);
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [codeError, setCodeError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [backup, setBackup] = useState<string | null>(null);
    const [held, setHeld] = useState<ConfirmedSecurityAction | null>(null);
    const [passwordMode, setPasswordMode] = useState(false);
    useEffect(() => {
        sequence.current++;
        browser.cancel();
        flight.current = false;
        setBusy(false);
        let active = true;
        void (client.authMethods ?? contractClient.authMethods)().then(value => {
            if (active)
                setMethods(value);
        }, () => {
            if (active)
                setError(t(catalog, "auth.security.unavailable"));
        });
        return () => {
            active = false;
            sequence.current++;
            browser.cancel();
            flight.current = false;
        };
    }, [key, client, browser, catalog, disabled]);
    async function finish(result: StepUpResponse) {
        if (!enabled.current || !matchingSecurityGrant(result, authorization))
            throw new Error('STEP_UP_TARGET_MISMATCH');
        setPassword('');
        setCode('');
        window.dispatchEvent(new Event('debateai:staff-session-ended'));
        if (result.replacement_recovery_code) {
            setBackup(result.replacement_recovery_code);
            setHeld(result);
        }
        else
            await onConfirmed(result);
    }
    async function passkey() {
        if (flight.current || disabled)
            return;
        flight.current = true;
        setBusy(true);
        setError(null);
        const owner = sequence.current;
        browser.cancel();
        try {
            const options = await (client.beginPasskeyStepUp ?? contractClient.beginPasskeyStepUp)(authorization);
            if (owner !== sequence.current)
                return;
            const credential = await browser.authenticate(options.options);
            if (owner !== sequence.current)
                return;
            const result = await (client.completePasskeyStepUp ?? contractClient.completePasskeyStepUp)({ challenge_handle: options.challenge_handle, credential });
            if (owner === sequence.current)
                await finish(result);
        }
        catch (failure) {
            if (owner === sequence.current) {
                if (onError)
                    onError(failure);
                else
                    setError(t(catalog, "auth.passkey.cancelled"));
            }
        }
        finally {
            if (owner === sequence.current) {
                flight.current = false;
                setBusy(false);
            }
        }
    }
    async function passwordProof(value: string, secret = password) {
        if (flight.current || disabled || !secret)
            return;
        if (!attempt.current.claim(key, value))
            return;
        flight.current = true;
        setBusy(true);
        setError(null);
        const owner = sequence.current;
        try {
            const result = await (client.stepUp ?? contractClient.stepUp)(secret, value, authorization);
            if (owner === sequence.current)
                await finish(result);
        }
        catch (failure) {
            if (owner === sequence.current) {
                if (onError)
                    onError(failure);
                else
                    // The server answers 401 for a wrong password or code (it never says which) and 429 while rate-limited.
                    setError(t(catalog, failure instanceof ContractHttpError && failure.status === 401 ? "auth.security.wrongPassword"
                        : failure instanceof ContractHttpError && failure.status === 429 ? "auth.security.tooManyAttempts" : "auth.security.unavailable"));
            }
        }
        finally {
            if (owner === sequence.current) {
                flight.current = false;
                setBusy(false);
            }
        }
    }
    async function provider(provider: 'google' | 'apple' | 'facebook' | 'x') {
        if (flight.current || disabled)
            return;
        const owner = sequence.current;
        const requestedAuthorization = key;
        flight.current = true;
        browser.cancel();
        setBusy(true);
        setError(null);
        try {
            const isCurrent = () => owner === sequence.current && requestedAuthorization === authorizationKey.current && enabled.current;
            const prepared = onBeforeProviderRedirect ? await onBeforeProviderRedirect({authorization, isCurrent}) : undefined;
            if (prepared === false) {
                if (isCurrent()) { flight.current = false; setBusy(false); setError(t(catalog, 'auth.social.unavailable')); }
                return;
            }
            if (!isCurrent()) return;
            const result = await (client.beginSocialStepUp ?? contractClient.beginSocialStepUp)(provider, authorization);
            if (owner !== sequence.current || requestedAuthorization !== authorizationKey.current || !enabled.current)
                return;
            window.location.assign(result.authorization_url);
        }
        catch {
            if (owner !== sequence.current || requestedAuthorization !== authorizationKey.current || !enabled.current)
                return;
            flight.current = false;
            setBusy(false);
            setError(t(catalog, "auth.social.unavailable"));
        }
    }
    return <section className="authSecurityConfirmation" aria-label={t(catalog, "auth.security.title")}>
 {error ? <p className="authFieldError" role="alert">{error}</p> : null}
 {backup ? <EphemeralCodes codes={[backup]} catalog={catalog}/> : null}
 {held || initialProof ? <button type="button" className="setBtn setBtnPrimary" disabled={busy || disabled} onClick={async () => {
                const result = held ?? initialProof!;
                if (!matchingSecurityGrant(result, authorization)) {
                    setHeld(null);
                    setError(t(catalog, "auth.security.unavailable"));
                    return;
                }
                if (flight.current || usedInitial.current === result.step_up_grant.token)
                    return;
                usedInitial.current = result.step_up_grant.token;
                flight.current = true;
                setBusy(true);
                try {
                    setBackup(null);
                    setHeld(null);
                    window.dispatchEvent(new Event("debateai:staff-session-ended"));
                    await onConfirmed(result);
                }
                catch {
                    setError(t(catalog, "auth.security.unavailable"));
                }
                finally {
                    flight.current = false;
                    setBusy(false);
                }
            }}>{t(catalog, "auth.security.confirm")}</button> : <>
 <div className="authSecurityActions">
 {methods?.available_step_up_methods.includes('passkey') ? <button type="button" className="setBtn" disabled={busy || disabled} onClick={() => void passkey()}>{t(catalog, "auth.passkey.use")}</button> : null}
 {methods?.available_step_up_methods.includes('password_totp') ? <button type="button" className="setBtn" aria-expanded={passwordMode} disabled={busy || disabled} onClick={() => {
                    browser.cancel();
                    setPasswordMode(!passwordMode);
                }}>{t(catalog, "auth.security.passwordMethod")}</button> : null}
 </div>
 {methods?.available_step_up_methods.includes('provider') ? <div className="authSecurityActions"><p>{t(catalog, "auth.security.providerProof")}</p>{methods.step_up_providers.map(providerId => <button type="button" className="setBtn" key={providerId} disabled={busy || disabled} onClick={() => void provider(providerId)}>{t(catalog, "auth.social.continue", { provider: providerId === 'google' ? 'Google' : providerId === 'apple' ? 'Apple' : providerId === 'facebook' ? 'Facebook' : 'X' })}</button>)}</div> : null}
 {methods?.available_step_up_methods.includes('password_totp') && passwordMode ? <form className="authForm" method="post" action="/settings/security" noValidate onSubmit={e => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        void passwordProof(readSixDigitCode(String(data.get('security-code') ?? '')).digits, String(data.get('security-password') ?? ''));
                    }}>
 <div className="authField"><label htmlFor={`${id}-password`}>{t(catalog, "auth.password")}</label><input id={`${id}-password`} name="security-password" type="password" autoComplete="current-password" value={password} disabled={busy || disabled} onChange={e => {
                        setPassword(e.target.value);
                        attempt.current.edited();
                    }}/></div>
 <div className="authField"><label htmlFor={`${id}-code`}>{t(catalog, "auth.login.authenticationCodeLabel")}</label><input id={`${id}-code`} name="security-code" autoComplete="one-time-code" inputMode="numeric" value={code} disabled={busy || disabled} aria-invalid={!!codeError || undefined} aria-describedby={codeError ? `${id}-code-error` : undefined} onChange={e => {
                        const typed = readSixDigitCode(e.target.value);
                        const shown = typed.valid ? typed.digits : e.target.value;
                        if (shown !== code)
                            attempt.current.edited();
                        setCode(shown);
                        setCodeError(typed.valid ? null : t(catalog, "auth.login.codeFormat"));
                        if (typed.complete)
                            void passwordProof(typed.digits, String(e.currentTarget.form ? new FormData(e.currentTarget.form).get('security-password') ?? '' : password));
                    }}/><InlineFieldMessage id={`${id}-code-error`} message={codeError}/></div>
 <button type="submit" className="authPrimary" disabled={busy || disabled || !password || !readSixDigitCode(code).complete}>{t(catalog, "auth.security.confirm")}</button>
 </form> : null}
 {!methods && !error ? <p role="status">{t(catalog, "auth.login.checking")}</p> : null}
 </>}
 {onCancel ? <button type="button" className="setBtn setBtnQuiet" onClick={() => {
                sequence.current++;
                browser.cancel();
                flight.current = false;
                setBusy(false);
                setError(null);
                setPassword('');
                setCode('');
                setBackup(null);
                setHeld(null);
                onCancel();
            }}>{t(catalog, "auth.security.cancel")}</button> : null}
 </section>;
}
