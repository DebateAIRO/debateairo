"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ContractHttpError, createRecoveryPermitClient, type ContractClient, type RecoveryPermitClient, type RecoveryPermitOpened, type StepUpAuthorizationRequest } from '@debateai/contract';
import { API_BASE, contractClient, createRecoveryFetch } from '@/lib/api';
import { signInEmailShape } from '@/lib/authFormValidation';
import { matchingSecurityGrant, type ConfirmedSecurityAction } from '@/lib/securityConfirmation';
import { formatDateAndTime, t, type MessageCatalog } from '@/lib/i18n/translate';
import type { LocaleCode } from '@/lib/i18n/locales';
import { AuthShell } from '../AuthShell';
import { OnboardingEvidence } from './OnboardingEvidence';
import { SecurityEnrollment } from './SecurityEnrollment';
import { SecurityConfirmation } from './SecurityConfirmation';
import { EphemeralCodes } from './EphemeralCodes';
import { clearStoredSupportConversation } from '../support/conversation';
import { useFormAnnouncer } from './InlineFieldMessage';
import { useDeadlineWarning, useStepFocus } from './timedStep';

const browserClient = createRecoveryPermitClient(createRecoveryFetch(API_BASE), API_BASE);
/** The fresh proof the new recovery codes need, as on Settings and in the "Don't get locked out" card. */
const REGENERATE: StepUpAuthorizationRequest = { action: 'REGENERATE_RECOVERY_CODES' };

/**
 * start → sent: the address is typed and the answer is the same for every address.
 * request → requested: the emailed link plus the account password put the request before the Owner.
 * cancelling → cancelled: the cancel link in the notice stops the request as soon as the page opens.
 * finishCheck → finishWait | finishReady: the finish link says whether the 72 hours are over; nothing is spent by asking.
 * finishReady → evidence → enroll → codes: the password opens the same set-up a saved recovery code opens on /recover,
 * and once a new sign-in method has signed the person in, the page offers new recovery codes before they leave.
 * expired: the 5 minutes for the set-up ran out. invalid: a link the server no longer takes, said in one sentence.
 */
type Phase = 'start' | 'sent' | 'request' | 'requested' | 'cancelling' | 'cancelled' | 'finishCheck' | 'finishWait' | 'finishReady' | 'evidence' | 'enroll' | 'codes' | 'expired' | 'invalid';
type Field = 'email' | 'password';
const HEADINGS: Readonly<Record<Phase, readonly [string, string]>> = {
    start: ['auth.recoveryHelp.start.title', 'auth.recoveryHelp.start.description'],
    sent: ['auth.recoveryHelp.sent.title', 'auth.recoveryHelp.sent.description'],
    request: ['auth.recoveryHelp.request.title', 'auth.recoveryHelp.request.description'],
    requested: ['auth.recoveryHelp.requested.title', 'auth.recoveryHelp.requested.description'],
    cancelling: ['auth.recoveryHelp.cancelling.title', 'auth.recoveryHelp.moment'],
    cancelled: ['auth.recoveryHelp.cancelled.title', 'auth.recoveryHelp.cancelled.description'],
    finishCheck: ['auth.recoveryHelp.finishCheck.title', 'auth.recoveryHelp.moment'],
    finishWait: ['auth.recoveryHelp.finishWait.title', 'auth.recoveryHelp.finishWait.description'],
    finishReady: ['auth.recoveryHelp.finish.title', 'auth.recoveryHelp.finishReady.description'],
    evidence: ['auth.recoveryHelp.finish.title', 'auth.recoveryHelp.enroll.description'],
    enroll: ['auth.recoveryHelp.finish.title', 'auth.recoveryHelp.enroll.description'],
    codes: ['auth.recoveryHelp.codes.title', 'auth.recoveryHelp.codes.description'],
    expired: ['auth.recoveryHelp.expired.title', 'auth.recoveryHelp.expired.description'],
    invalid: ['auth.recoveryHelp.invalid.title', 'auth.recoveryHelp.invalid.description']
};
const FIELD_ID: Readonly<Record<Field, string>> = { email: 'recover-help-email', password: 'recover-help-password' };
const ERROR_ID = 'recover-help-error';

/**
 * Help for a locked-out account with no saved recovery code: the Owner's permit. Every link arrives in the URL fragment,
 * is read once and taken out of the address bar, and stays only in memory. The set-up after the finish link reuses the
 * /recover pieces unchanged, with the same short-lived authority they get after a saved code.
 */
export function RecoveryHelpFlow({ catalog, locale, client = browserClient, accountClient = contractClient, onDone = () => window.location.assign('/') }: {
    catalog: MessageCatalog;
    locale: LocaleCode;
    client?: RecoveryPermitClient;
    accountClient?: ContractClient;
    onDone?: () => void;
}) {
    const started = useRef(false);
    const mounted = useRef(true);
    const flight = useRef(false);
    // The emailed link of this visit (request, cancel or finish), held only here.
    const link = useRef<string | null>(null);
    const [phase, setPhase] = useState<Phase>('start');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [notBefore, setNotBefore] = useState<string | null>(null);
    const [proof, setProof] = useState<RecoveryPermitOpened | null>(null);
    const [codes, setCodes] = useState<string[] | null>(null);
    const [saved, setSaved] = useState(false);
    // Bumped when making the codes failed, so the fresh proof starts over.
    const [confirmRound, setConfirmRound] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorField, setErrorField] = useState<Field | null>(null);
    // The field to focus once the form is enabled again after a refusal.
    const refocus = useRef<Field | null>(null);
    const announcer = useFormAnnouncer();
    const text = (key: string, vars?: Record<string, string>) => t(catalog, key, vars);
    // Each step replaces the controls that held focus: focus moves to the headline.
    const moved = useStepFocus(phase);
    // About a minute before the set-up's deadline (WCAG 2.2.1). Once the set-up shows, SecurityEnrollment warns itself.
    const warning = useDeadlineWarning(proof && phase === 'evidence' ? proof.expires_at : null, announcer.announce, text('auth.security.expiresSoon'));

    function fail(field: Field | null, key: string) { setErrorField(field); setError(text(key)); refocus.current = field; }
    function forget() { link.current = null; setPassword(''); setProof(null); }
    async function perform(operation: () => Promise<void>, field: Field | null) {
        if (flight.current) return;
        flight.current = true; setBusy(true); setError(null); setErrorField(null);
        try { await operation(); }
        catch (failure) {
            if (!mounted.current) return;
            const server = failure instanceof ContractHttpError ? failure.serverCode : null;
            const status = failure instanceof ContractHttpError ? failure.status : 0;
            if (server === 'RECOVERY_PERMIT_PROOF_INVALID' && field === 'password') fail('password', 'auth.recoveryHelp.wrongPassword');
            else if (server === 'RECOVERY_PERMIT_INPUT_INVALID' && field === 'email') fail('email', 'auth.invalidEmail');
            // A link the server no longer takes, or a request it cannot take: one sentence, no reason.
            else if (server === 'RECOVERY_PERMIT_INVALID' || server === 'RECOVERY_PERMIT_INPUT_INVALID' || status === 410) { forget(); setPhase('invalid'); }
            else if (server === 'RECOVERY_PERMIT_RATE_LIMITED' || status === 429) fail(null, 'auth.recoveryHelp.rateLimited');
            else fail(null, field === 'email' ? 'auth.recoveryHelp.start.failed' : 'auth.recoveryHelp.failed');
        } finally {
            flight.current = false;
            if (mounted.current) { setPassword(''); setBusy(false); }
        }
    }
    function bearer(): string {
        if (!link.current) throw new Error('RECOVERY_HELP_LINK_MISSING');
        return link.current;
    }
    async function cancelNow() {
        await client.cancel(bearer());
        if (!mounted.current) return;
        forget(); setPhase('cancelled');
    }
    // Only reads the finish link (nothing is spent); the server says whether the 72 hours are over.
    async function loadFinish() {
        const state = await client.finishStatus(bearer());
        if (!mounted.current) return;
        if (state.status === 'waiting') { setNotBefore(state.not_before); setPhase('finishWait'); }
        else setPhase('finishReady');
    }
    async function finish() {
        let opened: RecoveryPermitOpened;
        try { opened = await client.finish(bearer(), password); }
        catch (failure) {
            if (failure instanceof ContractHttpError && failure.serverCode === 'RECOVERY_PERMIT_TOO_EARLY') { setPassword(''); await loadFinish(); return; }
            throw failure;
        }
        if (!mounted.current) return;
        forget();
        // As /recover does with its proof: the support chat and any team session of this browser end here.
        clearStoredSupportConversation();
        window.dispatchEvent(new Event('debateai:staff-session-ended'));
        setProof(opened);
        setPhase('evidence');
    }

    useEffect(() => {
        mounted.current = true;
        if (!started.current) {
            started.current = true;
            const hash = window.location.hash.slice(1);
            if (hash) {
                window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
                const entries = [...new URLSearchParams(hash).entries()];
                const [name, value] = entries.length === 1 ? entries[0]! : ['', ''];
                if (!/^[A-Za-z0-9_-]{43}$/.test(value)) setPhase('invalid');
                else if (name === 'token') { link.current = value; setPhase('request'); }
                else if (name === 'cancel') { link.current = value; setPhase('cancelling'); void perform(cancelNow, null); }
                else if (name === 'finish') { link.current = value; setPhase('finishCheck'); void perform(loadFinish, null); }
                else setPhase('invalid');
            }
        }
        return () => { mounted.current = false; };
    }, []);
    // The set-up's 5 minutes are the server's; when they run out nothing more can be made with them.
    useEffect(() => {
        if (!proof || (phase !== 'evidence' && phase !== 'enroll')) return;
        const timer = setTimeout(expire, Math.max(0, Date.parse(proof.expires_at) - Date.now()));
        return () => clearTimeout(timer);
    }, [proof, phase]);
    useEffect(() => {
        if (busy || refocus.current === null) return;
        document.getElementById(FIELD_ID[refocus.current])?.focus();
        refocus.current = null;
    });
    function expire() { setProof(null); setPhase('expired'); }

    async function confirmed(result: ConfirmedSecurityAction) {
        if (flight.current || !matchingSecurityGrant(result, REGENERATE)) return;
        flight.current = true; setBusy(true); setError(null);
        try {
            const made = await accountClient.regenerateRecoveryCodes(result.step_up_grant.token);
            if (mounted.current) setCodes(made.codes);
        } catch {
            if (mounted.current) { setError(text('auth.recoveryHelp.codes.failed')); setConfirmRound(round => round + 1); }
        } finally {
            flight.current = false;
            if (mounted.current) setBusy(false);
        }
    }
    // The codes stay on screen until the page goes; nothing of them is kept anywhere else.
    function leave() { onDone(); }

    const submit = (field: Field, operation: () => Promise<void>) => (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void perform(operation, field); };
    const invalid = (field: Field) => error !== null && errorField === field;
    const describedBy = (field: Field, hint: string) => [hint, invalid(field) ? ERROR_ID : null].filter(Boolean).join(' ');
    const [title, description] = HEADINGS[phase];
    const passwordForm = (operation: () => Promise<void>, button: string) => <form className="authForm" method="post" action="/recover/help" noValidate onSubmit={submit('password', async () => {
        if (!password) { fail('password', 'auth.recoveryHelp.passwordMissing'); return; }
        await operation();
    })}>
        <div className="authField"><label htmlFor={FIELD_ID.password}>{text('auth.password')}</label><input id={FIELD_ID.password} name="current-password" type="password" autoComplete="current-password" disabled={busy} value={password} onChange={event => setPassword(event.target.value)} aria-invalid={invalid('password')} aria-describedby={describedBy('password', 'recover-help-password-hint')}/><p id="recover-help-password-hint" className="authFieldHint">{text('auth.recoveryHelp.password.hint')}</p></div>
        <button type="submit" className="authPrimary" disabled={busy}>{busy ? text('auth.recoveryHelp.working') : button}</button>
    </form>;
    const footer = phase === 'evidence' || phase === 'enroll' || phase === 'codes' ? null : <p><a href="/login">{text('auth.recoveryHelp.signIn')}</a>{phase === 'start' ? <> · <a href="/recover">{text('auth.recoveryHelp.savedCode')}</a></> : null}</p>;

    return <AuthShell eyebrow={text('auth.recoveryHelp.eyebrow')} title={text(title)} description={text(description)} focusTitle={moved} footer={footer}>
        {announcer.region}
        {error ? <div className="authAlert" id={ERROR_ID} role="alert">{error}</div> : null}
        {warning ? <p className="authFinePrint">{text('auth.security.expiresSoon')}</p> : null}
        {phase === 'start' ? <form className="authForm" method="post" action="/recover/help" noValidate onSubmit={submit('email', async () => {
            const address = email.trim();
            if (!signInEmailShape(address)) { fail('email', 'auth.invalidEmail'); return; }
            await client.start(address);
            if (mounted.current) { setEmail(''); setPhase('sent'); }
        })}>
            <div className="authField"><label htmlFor={FIELD_ID.email}>{text('auth.email')}</label><input id={FIELD_ID.email} name="email" type="email" autoComplete="email" disabled={busy} value={email} onChange={event => setEmail(event.target.value)} aria-invalid={invalid('email')} aria-describedby={describedBy('email', 'recover-help-email-hint')}/><p id="recover-help-email-hint" className="authFieldHint">{text('auth.recoveryHelp.email.hint')}</p></div>
            <button type="submit" className="authPrimary" disabled={busy}>{busy ? text('auth.recoveryHelp.working') : text('auth.recoveryHelp.start.button')}</button>
        </form> : null}
        {phase === 'sent' ? <p className="authFinePrint" role="status">{text('auth.recoveryHelp.sent.status')}</p> : null}
        {phase === 'request' ? passwordForm(async () => {
            await client.request(bearer(), password);
            if (mounted.current) { forget(); setPhase('requested'); }
        }, text('auth.recoveryHelp.request.button')) : null}
        {phase === 'requested' ? <p className="authFinePrint" role="status">{text('auth.recoveryHelp.requested.next')}</p> : null}
        {phase === 'cancelling' && busy ? <p className="authFinePrint" role="status">{text('auth.recoveryHelp.moment')}</p> : null}
        {(phase === 'cancelling' || phase === 'finishCheck') && error && !busy ? <button type="button" className="authPrimary" onClick={() => void perform(phase === 'cancelling' ? cancelNow : loadFinish, null)}>{text('auth.recoveryHelp.retry')}</button> : null}
        {phase === 'cancelled' ? <p className="authFinePrint" role="status">{text('auth.recoveryHelp.cancelled.next')}</p> : null}
        {phase === 'finishWait' && notBefore ? <p className="authFinePrint" role="status">{text('auth.recoveryHelp.finishWait.when', { date: formatDateAndTime(locale, notBefore) })}</p> : null}
        {phase === 'finishReady' ? passwordForm(finish, text('auth.continue')) : null}
        {phase === 'evidence' && proof ? <OnboardingEvidence catalog={catalog} locale={locale} client={accountClient} authority={{ kind: 'recovery', token: proof.recovery_capability }} onReady={() => setPhase('enroll')}/> : null}
        {phase === 'enroll' && proof ? <SecurityEnrollment catalog={catalog} client={accountClient} authority={{ kind: 'recovery', token: proof.recovery_capability, expiresAt: proof.expires_at, availableMethods: proof.available_methods, totpUnavailableReason: proof.totp_unavailable_reason }} onAuthenticated={() => {
            setProof(null);
            setPhase('codes');
        }} onExpired={expire}/> : null}
        {phase === 'codes' ? codes ? <>
            <EphemeralCodes catalog={catalog} codes={codes}/>
            <label className="authCheck"><input type="checkbox" name="codes-saved" checked={saved} onChange={event => setSaved(event.target.checked)}/>{text('auth.recoveryHelp.codes.saved')}</label>
            <button type="button" className="authPrimary" disabled={!saved} onClick={leave}>{text('auth.continue')}</button>
        </> : <>
            <p className="authFinePrint">{text('auth.recoveryHelp.codes.confirmHint')}</p>
            <SecurityConfirmation key={confirmRound} catalog={catalog} client={accountClient} authorization={REGENERATE} disabled={busy} onConfirmed={confirmed}/>
            <p><button type="button" className="authTextButton" disabled={busy} onClick={leave}>{text('auth.recoveryHelp.codes.later')}</button></p>
            <p className="authFinePrint">{text('auth.recoveryHelp.codes.laterHint')}</p>
        </> : null}
        {phase === 'expired' ? <p className="authFinePrint" role="alert">{text('auth.recoveryHelp.expired.next')}</p> : null}
        {phase === 'invalid' ? <button type="button" className="authPrimary" onClick={() => { forget(); setError(null); setPhase('start'); }}>{text('auth.recoveryHelp.invalid.button')}</button> : null}
    </AuthShell>;
}
