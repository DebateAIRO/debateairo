"use client";
import { useEffect, useId, useRef, useState } from 'react';
import type { ContractClient, StepUpAuthorizationRequest } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { matchingSecurityGrant, type ConfirmedSecurityAction } from '@/lib/securityConfirmation';
import { lockoutNeed, type LockoutNeed } from '@/lib/lockoutRisk';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { SecurityConfirmation, type SecurityConfirmationClient } from './SecurityConfirmation';
import { SecurityEnrollment, type EnrollmentClient } from './SecurityEnrollment';
import { EphemeralCodes } from './EphemeralCodes';
import { useFormAnnouncer } from './InlineFieldMessage';
import { focusIsLost } from '@/lib/focusGuard';
export type LockoutPromptClient = Pick<ContractClient, 'authMethods' | 'regenerateRecoveryCodes'> & Partial<Pick<ContractClient, 'readAccountEmail'>> & EnrollmentClient & SecurityConfirmationClient;
type Choice = 'REGENERATE_RECOVERY_CODES' | 'ADD_PASSKEY' | 'ADD_TOTP';
/** The account check may take this long; after it the card is skipped and the person moves on. */
const CHECK_TIMEOUT_MS = 5000;
/**
 * "Don't get locked out": shown once, right after the sign-up's security set-up, while the account could still be
 * locked out by losing one sign-in step (see `lockoutNeed`). Every action reuses the Settings flows (fresh proof, then
 * new recovery codes or a new sign-in step). Nothing is stored: the card belongs to the set-up moment, and
 * Settings → Security keeps a reminder line under the same rule.
 *
 * Two forms:
 * - authenticator app only: save recovery codes, add a passkey, or Later;
 * - passkey only: the recovery codes are the one way back if the passkey is lost, so the card has no Later. It
 *   shows the codes, and Continue works only once "I saved these codes" is ticked; adding an authenticator app is
 *   then offered as an optional extra.
 *
 * A pending check says so and is skipped after five seconds. Focus moves to the card's heading at each step, and a
 * polite live region says each step once.
 */
export function LockoutPrompt({ catalog, client = contractClient, onDone }: {
    catalog: MessageCatalog;
    client?: LockoutPromptClient;
    onDone: () => void;
}) {
    const [check, setCheck] = useState<'pending' | 'needed' | 'skipped'>('pending');
    const [need, setNeed] = useState<LockoutNeed>('none');
    const [choice, setChoice] = useState<StepUpAuthorizationRequest | null>(null);
    const [codes, setCodes] = useState<string[] | null>(null);
    const [grant, setGrant] = useState<{ token: string; expiresAt: string } | null>(null);
    const [added, setAdded] = useState(false);
    const [saved, setSaved] = useState(false);
    // Set by a press on Continue before "I saved these codes" is ticked: the reason is then shown as an error.
    const [savedMissing, setSavedMissing] = useState(false);
    const [accountEmail, setAccountEmail] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const flight = useRef(false);
    const done = useRef(onDone);
    done.current = onDone;
    const finished = useRef(false);
    const heading = useRef<HTMLHeadingElement>(null);
    const card = useRef<HTMLElement>(null);
    const savedBox = useRef<HTMLInputElement>(null);
    // An expiry moves focus only when it was in the card or nowhere; read before the step goes.
    const expiryStays = useRef(false);
    const announcer = useFormAnnouncer();
    const id = useId();
    function finish() {
        if (finished.current) return;
        finished.current = true;
        done.current();
    }
    useEffect(() => {
        let active = true;
        const skip = () => { active = false; clearTimeout(timer); setCheck('skipped'); finish(); };
        // A check that never answers must not hold the person on a blank card.
        const timer = setTimeout(() => { if (active) skip(); }, CHECK_TIMEOUT_MS);
        void client.authMethods().then(value => {
            if (!active) return;
            const needed = lockoutNeed(value);
            if (needed === 'none') skip();
            else { active = false; clearTimeout(timer); setNeed(needed); setCheck('needed'); }
        }, () => { if (active) skip(); });
        return () => { active = false; clearTimeout(timer); };
    }, [client]);
    // The account's email names a passkey added here in the browser's password manager. Without it the passkey is
    // still made, and named right after instead.
    useEffect(() => {
        if (check !== 'needed' || need !== 'codes-or-passkey' || !client.readAccountEmail) return;
        let current = true;
        void Promise.resolve().then(() => client.readAccountEmail!()).then(value => { if (current) setAccountEmail(value.email); }).catch(() => { /* Named after it is made. */ });
        return () => { current = false; };
    }, [check, need, client]);
    const mustSave = need === 'codes';
    function choose(action: Choice) { setError(null); setGrant(null); setChoice({ action }); }
    function back() { setChoice(null); setGrant(null); setError(null); }
    function expired() {
        expiryStays.current = !(card.current?.contains(document.activeElement) || focusIsLost());
        back(); setError(t(catalog, 'auth.lockout.expired'));
    }
    async function confirmed(result: ConfirmedSecurityAction) {
        if (!choice || flight.current || !matchingSecurityGrant(result, choice)) return;
        if (choice.action === 'ADD_PASSKEY' || choice.action === 'ADD_TOTP') { setGrant({ token: result.step_up_grant.token, expiresAt: result.step_up_grant.expires_at }); return; }
        flight.current = true; setBusy(true); setError(null);
        try { setCodes((await client.regenerateRecoveryCodes(result.step_up_grant.token)).codes); setChoice(null); }
        catch { setError(t(catalog, 'auth.lockout.failed')); setChoice(null); }
        finally { flight.current = false; setBusy(false); }
    }
    function continueAfterCodes() {
        if (saved) { finish(); return; }
        // Continue stays in the Tab order (aria-disabled): a press says why and goes to the box.
        setSavedMissing(true);
        savedBox.current?.focus();
        announcer.announce(t(catalog, 'auth.lockout.savedCodesHint'));
    }
    // Authenticator app only: new codes or a new passkey end the card. Passkey only: only Continue after the codes
    // are saved ends it, and an authenticator app added after them comes back to a plain Continue.
    const complete = mustSave ? added : codes !== null || added;
    const codesShown = codes !== null && !complete && !choice;
    // A set-up started from the card spends its fresh proof only when the new sign-in step is created; once the proof
    // expires, creating one would fail, so the card goes back a step and says why.
    useEffect(() => {
        if (!grant || added) return;
        const timer = setTimeout(expired, Math.max(0, Date.parse(grant.expiresAt) - Date.now()));
        return () => clearTimeout(timer);
    }, [grant, added]);
    const step = check !== 'needed' ? null : complete ? 'done' : codesShown ? 'codes' : !choice ? 'choices' : grant ? `setup:${choice.action}` : `confirm:${choice.action}`;
    const title = mustSave ? 'auth.lockout.passkeyTitle' : 'auth.lockout.title';
    const stepLabel = t(catalog, choice?.action === 'ADD_PASSKEY' ? 'auth.lockout.addPasskey' : choice?.action === 'ADD_TOTP' ? 'auth.lockout.addAuthenticator'
        : choice || codes ? 'auth.lockout.saveCodes' : title);
    // The card replaces a set-up form that held focus, and each step replaces the controls of the last.
    useEffect(() => {
        if (step === null) return;
        if (expiryStays.current) expiryStays.current = false;
        else heading.current?.focus();
        announcer.announce(stepLabel);
    }, [step, stepLabel, announcer.announce]);
    if (check === 'pending') return <p role="status">{t(catalog, 'auth.lockout.checking')}</p>;
    if (check === 'skipped') return null;
    const setup = choice && grant && !complete && (choice.action === 'ADD_PASSKEY' || choice.action === 'ADD_TOTP') ? choice.action : null;
    const savedHint = `${id}-saved-hint`;
    return <section className="authLockout" ref={card} aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{t(catalog, title)}</h2>
        <p>{t(catalog, mustSave ? 'auth.lockout.passkeyWhy' : 'auth.lockout.why')}</p>
        {error ? <p className="authFieldError" role="alert">{error}</p> : null}
        {codes && (!mustSave || codesShown) ? <EphemeralCodes catalog={catalog} codes={codes}/> : null}
        {codesShown && mustSave ? <>
            <label className="authCheck"><input ref={savedBox} type="checkbox" checked={saved} aria-invalid={savedMissing && !saved} aria-describedby={saved ? undefined : savedHint} onChange={event => { setSaved(event.target.checked); setSavedMissing(false); }}/>{t(catalog, 'auth.lockout.savedCodes')}</label>
            <div className="authLockoutActions">
                <button type="button" className="authPrimary" aria-disabled={!saved || undefined} aria-describedby={saved ? undefined : savedHint} onClick={continueAfterCodes}>{t(catalog, 'auth.continue')}</button>
                {saved ? <>
                    <p>{t(catalog, 'auth.lockout.authenticatorOptional')}</p>
                    <button type="button" className="authSecondary" onClick={() => choose('ADD_TOTP')}>{t(catalog, 'auth.lockout.addAuthenticator')}</button>
                </> : null}
            </div>
            {saved ? null : <p id={savedHint} className={savedMissing ? 'authFieldError' : 'authFieldHint'}>{t(catalog, 'auth.lockout.savedCodesHint')}</p>}
        </> : null}
        {setup ? <>
            <SecurityEnrollment authority={{ kind: 'grant', token: grant!.token }} deadline={grant!.expiresAt} availableMethods={setup === 'ADD_TOTP' ? ['totp'] : ['passkey']} catalog={catalog} client={client} accountLabel={setup === 'ADD_PASSKEY' ? accountEmail : undefined} onEnrolled={() => setAdded(true)} onExpired={expired}/>
            <div className="authLockoutActions">
                <button type="button" className="authSecondary" onClick={back}>{t(catalog, 'auth.lockout.back')}</button>
                <button type="button" className="authTextButton" onClick={finish}>{t(catalog, 'auth.lockout.later')}</button>
            </div>
        </> : null}
        {added ? <p role="status">{t(catalog, 'auth.enroll.methodAdded')}</p> : null}
        {choice && !grant && !complete ? <SecurityConfirmation catalog={catalog} client={client} authorization={choice} disabled={busy} onConfirmed={confirmed} onCancel={back}/> : null}
        {complete ? <button type="button" className="authPrimary" onClick={finish}>{t(catalog, 'auth.continue')}</button> : null}
        {!choice && !complete && !codesShown ? <div className="authLockoutActions">
            <button type="button" className="authPrimary" onClick={() => choose('REGENERATE_RECOVERY_CODES')}>{t(catalog, 'auth.lockout.saveCodes')}</button>
            {mustSave ? null : <>
                <button type="button" className="authSecondary" onClick={() => choose('ADD_PASSKEY')}>{t(catalog, 'auth.lockout.addPasskey')}</button>
                <button type="button" className="authTextButton" onClick={finish}>{t(catalog, 'auth.lockout.later')}</button>
            </>}
        </div> : null}
        {announcer.region}
    </section>;
}
