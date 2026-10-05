"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ContractHttpError } from '@debateai/contract';
import type { ContractClient, LocaleCode, CatalogLocaleCode, CompleteSocialSignupRequest, StepUpResponse } from '@debateai/contract';
import { dobFromIso, meetsMinimumAge } from '@debateai/kernel';
import { contractClient } from '@/lib/api';
import { authenticateConsumerPasskey, registerConsumerPasskey } from '@/lib/consumerWebAuthn';
import { retainSocialStepUp } from '@/lib/socialStepUpHandoff';
import type { TurnstilePublicConfig } from '@/lib/turnstile';
import { TurnstileChallenge } from './TurnstileChallenge';
import { EmailPendingScreen } from './EmailPendingScreen';
import { AuthShell } from '../AuthShell';
import authEnglish from '@/messages/en/auth.json';
import type { MessageCatalog } from '@/lib/i18n/translate';
import { PrivacyPolicyModal } from '../consent/PrivacyPolicyModal';
import { TermsOfServiceModal } from '../consent/TermsOfServiceModal';
import { useLegalDocument } from '../consent/useLegalDocument';
import { useChromeI18n } from '@/lib/i18n/I18nProvider';
import { catalogLocale } from '@/lib/i18n/locales';
import { totpQrMatrix } from '@/lib/totpQr';
export function SocialCompleteFlow({ client = contractClient, catalog = authEnglish, turnstile, locale = 'en', uiLocale = 'en', onAuthenticated, onStepUp }: {
    client?: ContractClient;
    catalog?: MessageCatalog;
    turnstile?: TurnstilePublicConfig;
    locale?: CatalogLocaleCode;
    uiLocale?: LocaleCode;
    onAuthenticated?: () => void;
    onStepUp?: (response: StepUpResponse) => void;
}) {
    const [returnPath,setReturnPath]=useState('/');
    const navigateAuthenticated=()=>{if(onAuthenticated)onAuthenticated();else window.location.assign(returnPath);};
    const [privacyAccepted,setPrivacyAccepted]=useState(false),[termsAccepted,setTermsAccepted]=useState(false),[policyOpen,setPolicyOpen]=useState(false),[termsOpen,setTermsOpen]=useState(false);
    const privacyDocument=useLegalDocument('privacy'),termsDocument=useLegalDocument('terms'),chrome=useChromeI18n();
    const router = useRouter(), started = useRef(false), [token, setToken] = useState(''), [kind, setKind] = useState<'signup' | 'login' | 'stepup' | 'enroll' | null>(null), [email, setEmail] = useState(''), [name, setName] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(true), [code, setCode] = useState(''), [proof, setProof] = useState<string | null>(null), [reset, setReset] = useState(0), [pending, setPending] = useState<string | null>(null), [totp, setTotp] = useState<{
        secret: string;
        uri: string;
    } | null>(null), [showKey, setShowKey] = useState(false), [backup, setBackup] = useState<string | null>(null), [stepUpResult, setStepUpResult] = useState<StepUpResponse | null>(null);
    useEffect(() => {
        if (started.current)
            return;
        started.current = true;
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        const value = fragment.get('token'), mode = fragment.get('kind'),next=fragment.get('next');
        setReturnPath(next==='/settings'||next==='/account'?next:'/');
        if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value) || !['signup', 'login', 'stepup'].includes(mode ?? '')) {
            setError('This sign-in link has expired. Start again.');
            setBusy(false);
            return;
        }
        setToken(value);
        setKind(mode as 'signup' | 'login' | 'stepup');
        void (async () => { try {
            if (mode === 'signup') {
                const p = await client.socialSignupStatus({ continuation_token: value });
                setEmail(p.email ?? '');
                setName(p.name);
            }
            else if (mode === 'stepup')
                await client.socialStepUpStatus(value);
        }
        catch {
            setError('This sign-in link has expired. Start again.');
            setToken('');
        }
        finally {
            setBusy(false);
        } })();
    }, [client]);
    function finish(result: {
        replacement_recovery_code?: string;
    }) { setToken(''); setCode(''); setTotp(null); if (result.replacement_recovery_code)
        setBackup(result.replacement_recovery_code);
    else
        navigateAuthenticated(); }
    function finishStepUp(result: StepUpResponse) { setToken(''); setCode(''); setStepUpResult(result); if (result.replacement_recovery_code)
        setBackup(result.replacement_recovery_code); }
    async function submitSignup(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy)
            return;
        const form = event.currentTarget, data = new FormData(form), birth = String(data.get('date_of_birth') ?? ''), parts = dobFromIso(birth);
        setError(null);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError('Enter a valid email address.');
            form.querySelector<HTMLInputElement>('[name=email]')?.focus();
            return;
        }
        if (!String(data.get('phone') ?? '').trim()) {
            setError('Enter your phone number with its country code.');
            form.querySelector<HTMLInputElement>('[name=phone]')?.focus();
            return;
        }
        if (!parts || !meetsMinimumAge(parts)) {
            setError('Enter a valid date of birth. You must be at least 18.');
            form.querySelector<HTMLInputElement>('[name=date_of_birth]')?.focus();
            return;
        }
        if (!termsAccepted || !privacyAccepted || data.get('terms') !== 'on' || data.get('privacy') !== 'on') {
            setError('Read and acknowledge the Privacy Policy and agree to the Terms of Service.');
            return;
        }
        if (!proof) {
            setError('Please complete the security check and try again.');
            return;
        }
        setBusy(true);
        try {
            const input: CompleteSocialSignupRequest = { continuation_token: token, email, phone: String(data.get('phone')), date_of_birth: birth, terms:{version:termsDocument.version,sha256:termsDocument.sha256}, privacy:{version:privacyDocument.version,sha256:privacyDocument.sha256}, locale:catalogLocale(chrome.locale), ui_locale:chrome.locale, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null, turnstile_token: proof };
            const response = await client.completeSocialSignup(input);
            if ('status' in response) {
                setKind('enroll');
                setToken(response.enrollment_token);
            }
            else {
                setPending(email);
                setToken('');
            }
        }
        catch {
            setError('Account setup could not be completed. Please try again.');
        }
        finally {
            setProof(null);
            setReset(x => x + 1);
            setBusy(false);
        }
    }
    async function passkey() {
        if (busy || !token)
            return;
        setBusy(true);
        setError(null);
        try {
            if (kind === 'enroll') {
                const o = await client.beginPasskeyEnrollment({ enrollment_token: token }), credential = await registerConsumerPasskey(o.options), r = await client.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential });
                if (r.status === 'authenticated')
                    finish(r);
            }
            else if (kind === 'stepup') {
                const o = await client.beginSocialStepUpPasskey(token), credential = await authenticateConsumerPasskey(o.options);
                finishStepUp(await client.completeSocialStepUp({ continuation_token: token, challenge_handle: o.challenge_handle, credential }));
            }
            else {
                const o = await client.beginPasskeyLogin({ continuation_token: token }), credential = await authenticateConsumerPasskey(o.options);
                finish(await client.completePasskeyLogin({ challenge_handle: o.challenge_handle, credential }));
            }
        }
        catch {
            setError('The passkey check was not completed. Try again or use an authenticator.');
        }
        finally {
            setBusy(false);
        }
    }
    async function beginTotp() { setBusy(true); setError(null); try {
        const r = await client.beginTotpEnrollment({ enrollment_token: token });
        setTotp({ secret: r.secret, uri: r.otpauthUri });
    }
    catch {
        setError('The authenticator could not be prepared. Please try again.');
    }
    finally {
        setBusy(false);
    } }
    async function submitCode(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (busy || !token || !code)
        return; setBusy(true); setError(null); try {
        if (kind === 'enroll') {
            const r = await client.completeTotpEnrollment({ enrollment_token: token, code });
            if (r.status === 'authenticated')
                finish(r);
        }
        else if (kind === 'stepup')
            finishStepUp(await client.completeSocialStepUp({ continuation_token: token, code }));
        else
            finish(await client.completeLogin(token, code));
    }
    catch (failure) {
        setError(failure instanceof ContractHttpError && failure.serverCode==='MFA_FIRST_STEP_UNAVAILABLE' ? 'Use a passkey to finish setting up your account.' : 'The code was not accepted. Please try again.');
    }
    finally {
        setCode('');
        setBusy(false);
    } }
    if (pending)
        return <EmailPendingScreen email={pending} retryAfterSeconds={60} client={client} catalog={catalog} locale={uiLocale} turnstile={turnstile} onDifferentEmail={() => window.location.assign('/sign-up')}/>;
    const matrix = totp ? totpQrMatrix(totp.uri) : null;
    return <AuthShell eyebrow="Dialectical Engine" title={kind === 'signup' ? 'Good questions deserve more than one answer.' : kind === 'enroll' ? 'Secure your account' : 'Complete your sign-in'} description={name && kind === 'signup' ? `Welcome, ${name}.` : ""} footer={null}>
    {error ? <p role="alert">{error}</p> : null}
    {backup ? <div><p>Save your replacement recovery code.</p><code>{backup}</code><button type="button" onClick={() => { void navigator.clipboard.writeText(backup); }}>Copy</button><button type="button" onClick={() => { setBackup(null); if (!stepUpResult)
        navigateAuthenticated(); }}>Continue</button></div> : null}
    {stepUpResult && !backup ? <div><p>Security check complete.</p><button type="button" onClick={() => { const result = stepUpResult; setStepUpResult(null); if (onStepUp)
        onStepUp(result);
    else {
        retainSocialStepUp(result);
        router.push('/settings');
    } }}>Return to settings</button></div> : null}
    {token && kind === 'signup' ? <form className="authForm" noValidate onSubmit={submitSignup} aria-busy={busy}>
      <label>Email<input name="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></label>
      <label>Phone<input name="phone" type="tel" required autoComplete="tel" placeholder="+40 712 345 678" disabled={busy}/></label>
      <label>Date of birth<input name="date_of_birth" type="date" required autoComplete="bday" disabled={busy}/></label>
      <div><input name="privacy" type="checkbox" required disabled={busy} checked={privacyAccepted} aria-labelledby="social-privacy-label" onChange={()=>privacyAccepted?setPrivacyAccepted(false):setPolicyOpen(true)}/><span id="social-privacy-label">I have read the <button type="button" disabled={busy} onClick={()=>setPolicyOpen(true)}>Privacy Policy</button>.</span></div>
      <div><input name="terms" type="checkbox" required disabled={busy} checked={termsAccepted} aria-labelledby="social-terms-label" onChange={()=>termsAccepted?setTermsAccepted(false):setTermsOpen(true)}/><span id="social-terms-label">I agree to the <button type="button" disabled={busy} onClick={()=>setTermsOpen(true)}>Terms of Service</button>.</span></div>
      {turnstile ? <TurnstileChallenge siteKey={turnstile.siteKey} nonce={turnstile.nonce} action="signup" locale={uiLocale} resetKey={reset} onToken={setProof} onError={() => setError('The security check is unavailable. Please try again.')}/> : null}
      <button type="submit" disabled={busy}>Continue</button>
    </form> : null}
    {token && kind && kind !== 'signup' ? <div><button type="button" disabled={busy} onClick={() => void passkey()}>{kind === 'enroll' ? 'Create a passkey' : 'Use a passkey'}</button>
      {kind === 'enroll' && !totp ? <button type="button" disabled={busy} onClick={() => void beginTotp()}>Use an authenticator app instead</button> : null}
      {totp && matrix ? <svg width="180" height="180" viewBox={`0 0 ${matrix.length + 8} ${matrix.length + 8}`} role="img" aria-label="Scan this QR code in your authenticator app"><rect width="100%" height="100%" fill="white"/><path fill="black" d={matrix.flatMap((row, y) => row.flatMap((v, x) => v ? [`M${x + 4} ${y + 4}h1v1h-1z`] : [])).join('')}/></svg> : null}
      {totp ? <><button type="button" onClick={() => setShowKey(!showKey)}>Use a setup key instead</button>{showKey ? <code>{totp.secret}</code> : null}</> : null}
      {kind !== 'enroll' || totp ? <form noValidate onSubmit={submitCode}><label>{kind === 'enroll' ? 'Authenticator code' : 'Authenticator or recovery code'}<input name="code" value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" inputMode={kind === 'enroll' ? 'numeric' : 'text'} disabled={busy}/></label><button type="submit" disabled={busy || !code}>Continue</button></form> : null}
    </div> : null}
    {!token && !stepUpResult && !backup && !busy ? <a href="/login">Start again</a> : null}
    {policyOpen?<PrivacyPolicyModal open mode="consent" onClose={()=>setPolicyOpen(false)} onAcknowledge={()=>{setPrivacyAccepted(true);setPolicyOpen(false);}}/>:null}
    {termsOpen?<TermsOfServiceModal open mode="consent" onClose={()=>setTermsOpen(false)} onAcknowledge={()=>{setTermsAccepted(true);setTermsOpen(false);}}/>:null}
  </AuthShell>;
}
