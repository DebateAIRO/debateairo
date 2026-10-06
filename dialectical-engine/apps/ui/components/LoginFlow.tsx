"use client";
import Link from 'next/link';
import { clearStoredSupportConversation } from '@/components/support/conversation';
import { announceSessionChange } from '@/components/support/sessionChange';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ContractHttpError, type ContractClient, type LoginContinuationResponse, type AuthenticationResponse } from '@debateai/contract';
import { AuthShell } from '@/components/AuthShell';
import { SocialProviderButtons } from '@/components/auth/SocialProviderButtons';
import { InlineFieldMessage } from '@/components/auth/InlineFieldMessage';
import { EphemeralCodes } from '@/components/auth/EphemeralCodes';
import { ageConfirmationHref, ageConfirmationRequired } from '@/lib/ageConfirmation';
import { contractClient } from '@/lib/api';
import { createConsumerWebAuthnBrowser, type ConsumerWebAuthnBrowser } from '@/lib/consumerWebAuthn';
import { createCodeAttempt } from '@/lib/authCodeAttempt';
import { emailShape } from '@/lib/authFormValidation';
import { setRecoveryAcknowledgementPending } from '@/lib/authNavigationGuard';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { safeReturnPath } from '@/lib/returnPath';
import authEnglish from '@/messages/en/auth.json';
type LoginClient = Pick<ContractClient, 'beginLogin' | 'completeLogin'> & Partial<Pick<ContractClient, 'authProviders' | 'beginSocialLogin' | 'beginPasskeyLogin' | 'completePasskeyLogin'>>;
async function navigateHome() {
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.assign(await ageConfirmationRequired() ? ageConfirmationHref(next) : safeReturnPath(next));
}
export function LoginFlow({ catalog = authEnglish, client = contractClient, onAuthenticated = navigateHome, browser: provided }: {
    catalog?: MessageCatalog;
    client?: LoginClient;
    onAuthenticated?: () => void | Promise<void>;
    browser?: ConsumerWebAuthnBrowser;
}) {
    const browser = useRef(provided ?? createConsumerWebAuthnBrowser()).current;
    const flight = useRef(false);
    const dispatched = useRef(false);
    const [completing, setCompleting] = useState(false);
    const sequence = useRef(0);
    const conditional = useRef<AbortController | null>(null);
    const conditionalOptions = useRef<Promise<unknown> | null>(null);
    const attempt = useRef(createCodeAttempt());
    const [continuation, setContinuation] = useState<LoginContinuationResponse | null>(null);
    const [method, setMethod] = useState<'totp' | 'recovery_code'>('totp');
    const [replacement, setReplacement] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [signUpHref, setSignUpHref] = useState('/sign-up');
    function cancelConditional() {
        sequence.current++;
        conditional.current?.abort();
        conditional.current = null;
        browser.cancel();
    }
    async function waitForConditionalPreparation(owner: number) {
        const pending = conditionalOptions.current;
        if (pending) {
            try {
                await pending;
            }
            catch {
                // Conditional discovery is only an ordering barrier. Its failure cannot poison an explicit method.
            }
        }
        return owner === sequence.current;
    }
    function finish(result: AuthenticationResponse) {
        if (result.status !== 'authenticated')
            return;
        clearStoredSupportConversation();
        announceSessionChange();
        cancelConditional();
        flight.current = false;
        dispatched.current = false;
        setCompleting(false);
        setBusy(false);
        setContinuation(null);
        setPassword('');
        setCode('');
        if (result.replacement_recovery_code) {
            setRecoveryAcknowledgementPending(true);
            setReplacement(result.replacement_recovery_code);
        }
        else
            void onAuthenticated();
    }
    useEffect(() => {
        const next = new URLSearchParams(window.location.search).get('next');
        if (next !== null)
            setSignUpHref(`/sign-up?next=${encodeURIComponent(next)}`);
        const owner = sequence.current;
        const abort = new AbortController();
        conditional.current = abort;
        void (async () => {
            try {
                if (!client.beginPasskeyLogin || !client.completePasskeyLogin || !await browser.supportsConditional() || abort.signal.aborted || owner !== sequence.current)
                    return;
                const pending = client.beginPasskeyLogin();
                conditionalOptions.current = pending;
                let options;
                try {
                    options = await pending;
                }
                finally {
                    if (conditionalOptions.current === pending)
                        conditionalOptions.current = null;
                }
                if (abort.signal.aborted || owner !== sequence.current)
                    return;
                const credential = await browser.authenticate(options.options, { mediation: 'conditional', signal: abort.signal });
                if (abort.signal.aborted || owner !== sequence.current || flight.current)
                    return;
                flight.current = true;
                dispatched.current = true;
                setCompleting(true);
                setBusy(true);
                const result = await client.completePasskeyLogin({ challenge_handle: options.challenge_handle, credential });
                if (owner === sequence.current && !abort.signal.aborted)
                    finish(result);
            }
            catch (failure) {
                if (dispatched.current && !(failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500)) clearStoredSupportConversation();
            }
            finally {
                if (owner === sequence.current) {
                    flight.current = false;
                    dispatched.current = false;
                    setCompleting(false);
                    setBusy(false);
                }
            }
        })();
        return () => {
            cancelConditional();
            setRecoveryAcknowledgementPending(false);
        };
    }, [browser, client]);
    async function passkey() {
        if (flight.current || !client.beginPasskeyLogin || !client.completePasskeyLogin)
            return;
        cancelConditional();
        const owner = sequence.current;
        flight.current = true;
        setBusy(true);
        setError(null);
        try {
            if (!await waitForConditionalPreparation(owner))
                return;
            const options = await client.beginPasskeyLogin(continuation ? { continuation_token: continuation.challenge_token } : undefined);
            if (owner !== sequence.current)
                return;
            const credential = await browser.authenticate(options.options);
            if (owner !== sequence.current)
                return;
            dispatched.current = true;
            setCompleting(true);
            const result = await client.completePasskeyLogin({ challenge_handle: options.challenge_handle, credential });
            if (owner === sequence.current)
                finish(result);
        }
        catch (failure) {
            if (dispatched.current && !(failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500)) clearStoredSupportConversation();
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
    async function submitCredentials(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (flight.current)
            return;
        cancelConditional();
        const form = event.currentTarget;
        const data = new FormData(form);
        const address = String(data.get('email') ?? '').trim();
        const secret = String(data.get('password') ?? '');
        setEmail(address);
        setPassword(secret);
        setEmailError(emailShape(address) ? null : t(catalog, "auth.invalidEmail"));
        setPasswordError(secret ? null : t(catalog, "auth.password.required"));
        if (!emailShape(address) || !secret) {
            form.querySelector<HTMLElement>(!emailShape(address) ? '[name=email]' : '[name=password]')?.focus();
            return;
        }
        flight.current = true;
        setBusy(true);
        setError(null);
        const owner = sequence.current;
        try {
            if (!await waitForConditionalPreparation(owner))
                return;
            const result = await client.beginLogin(address, secret);
            if (owner !== sequence.current)
                return;
            setPassword('');
            setContinuation(result);
            setMethod(result.available_methods.includes('totp') ? 'totp' : 'recovery_code');
            setCode('');
            attempt.current.edited();
        }
        catch {
            if (owner === sequence.current)
                setError(t(catalog, "auth.login.signInFailed"));
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
        if (!continuation || flight.current)
            return;
        if (method === 'totp' && !attempt.current.claim(continuation.challenge_token, value))
            return;
        if (method === 'recovery_code' && !value.trim())
            return;
        flight.current = true;
        setBusy(true);
        setError(null);
        const owner = sequence.current;
        try {
            dispatched.current = true;
            setCompleting(true);
            const result = await client.completeLogin(continuation.challenge_token, value.trim());
            if (owner === sequence.current)
                finish(result);
        }
        catch (failure) {
            if (!(failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500)) clearStoredSupportConversation();
            if (owner === sequence.current) setError(failure instanceof ContractHttpError && failure.status === 429 ? t(catalog, "auth.login.tooManyAttempts") : method === 'recovery_code' ? t(catalog, "auth.login.recoveryCodeRejected") : t(catalog, "auth.login.authenticationCodeRejected"));
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
    const offered = continuation?.available_methods ?? [];
    return <AuthShell eyebrow={t(catalog, "auth.login.welcomeBack")} title={replacement ? t(catalog, "auth.login.replacementTitle") : continuation ? t(catalog, "auth.login.twoStepVerification") : t(catalog, "auth.login.backToGraph")} description={t(catalog, "auth.login.securityPolicy")} footer={null}>
 {error ? <div className="authAlert" role="alert">{error}</div> : null}
 {replacement ? <div><EphemeralCodes codes={[replacement]} catalog={catalog}/><button type="button" className="authPrimary" onClick={() => {
                setRecoveryAcknowledgementPending(false);
                setReplacement(null);
                void onAuthenticated();
            }}>{t(catalog, "auth.continue")}</button></div> : continuation ? <div>
 {offered.includes('passkey') ? <button type="button" disabled={busy} onClick={() => void passkey()}>{t(catalog, "auth.passkey.signIn")}</button> : null}
 {offered.includes('totp') || offered.includes('recovery_code') ? <>
 <form className="authForm authMfaForm" noValidate method="post" action="/login" onSubmit={e => {
                    e.preventDefault();
                    void submitCode(code);
                }} aria-busy={busy}>
 <label htmlFor="login-code">{method === 'totp' ? t(catalog, "auth.login.authenticationCodeLabel") : t(catalog, "auth.login.recoveryCodeLabel")}</label>
 <p id="login-code-help" hidden={method !== 'totp'}>{t(catalog, "auth.login.authenticatorInstruction")}</p>
 <input aria-describedby={method === 'totp' ? 'login-code-help' : undefined} id="login-code" name="code" value={code} autoComplete="one-time-code" inputMode={method === 'totp' ? 'numeric' : 'text'} maxLength={method === 'totp' ? 6 : 128} disabled={busy} autoFocus onChange={e => {
                    const value = method === 'totp' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value;
                    if (value !== code)
                        attempt.current.edited();
                    setCode(value);
                    if (method === 'totp' && value.length === 6)
                        void submitCode(value);
                }}/>
 <button className="authPrimary" type="submit" disabled={busy}>{t(catalog, "auth.continue")}</button>
 </form>
 {offered.includes('recovery_code') && method !== 'recovery_code' ? <button type="button" disabled={completing} onClick={() => {
                        if (dispatched.current) return;
                        cancelConditional();
                        flight.current = false;
                        setBusy(false);
                        setMethod('recovery_code');
                        setCode('');
                        attempt.current.edited();
                    }}>{t(catalog, "auth.login.useRecoveryCode")}</button> : null}
 {offered.includes('totp') && method !== 'totp' ? <button type="button" disabled={completing} onClick={() => {
                        if (dispatched.current) return;
                        cancelConditional();
                        flight.current = false;
                        setBusy(false);
                        setMethod('totp');
                        setCode('');
                        attempt.current.edited();
                    }}>{t(catalog, "auth.login.useAuthenticatorCode")}</button> : null}
 </> : null}
 <button type="button" disabled={busy} onClick={() => {
                cancelConditional();
                setContinuation(null);
                setCode('');
                setError(null);
            }}>{t(catalog, "auth.login.backToSignIn")}</button>
 </div> : <>
 <button type="button" className="authPrimary" disabled={busy} onClick={() => void passkey()}>{t(catalog, "auth.passkey.signIn")}</button>
 <SocialProviderButtons disabled={completing} client={client} catalog={catalog} onBegin={cancelConditional}/>
 <form className="authForm" noValidate method="post" action="/login" onSubmit={submitCredentials} aria-busy={busy}>
 <label htmlFor="login-email">{t(catalog, "auth.email")}</label><input id="login-email" name="email" type="email" autoComplete="username webauthn" placeholder={t(catalog, "auth.emailPlaceholder")} value={email} onChange={e => {
                cancelConditional();
                setEmail(e.target.value);
                setEmailError(null);
            }} required aria-invalid={!!emailError || undefined} aria-describedby={emailError ? 'login-email-error' : undefined} disabled={busy}/><InlineFieldMessage id="login-email-error" message={emailError}/>
 <label htmlFor="login-password">{t(catalog, "auth.password")}</label><input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={e => {
                cancelConditional();
                setPassword(e.target.value);
                setPasswordError(null);
            }} required aria-invalid={!!passwordError || undefined} aria-describedby={passwordError ? 'login-password-error' : undefined} disabled={busy}/><InlineFieldMessage id="login-password-error" message={passwordError}/>
 <button type="submit" className="authPrimary" disabled={busy}>{busy ? t(catalog, "auth.login.checking") : t(catalog, "auth.continue")}</button>
 </form><Link href="/recover">{t(catalog, "auth.login.recoveryAccess")}</Link><p>{t(catalog, "auth.login.noAccountYet")} <Link href={signUpHref}>{t(catalog, "auth.login.createOne")}</Link></p>
 </>}
 </AuthShell>;
}
