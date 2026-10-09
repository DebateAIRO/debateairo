"use client";
import { useEffect, useId, useRef, useState } from 'react';
import type { ContractClient, StepUpAuthorizationRequest } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { matchingSecurityGrant, type ConfirmedSecurityAction } from '@/lib/securityConfirmation';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { SecurityConfirmation, type SecurityConfirmationClient } from './SecurityConfirmation';
import { SecurityEnrollment, type EnrollmentClient } from './SecurityEnrollment';
import { EphemeralCodes } from './EphemeralCodes';
import { useFormAnnouncer } from './InlineFieldMessage';
export type LockoutPromptClient = Pick<ContractClient, 'authMethods' | 'regenerateRecoveryCodes'> & EnrollmentClient & SecurityConfirmationClient;
type Choice = 'REGENERATE_RECOVERY_CODES' | 'ADD_PASSKEY';
/** The account check may take this long; after it the card is skipped and the person moves on (review fix, 2026-10-09). */
const CHECK_TIMEOUT_MS = 5000;
/**
 * "Don't get locked out" (owner ruling 2026-10-09): shown once, right after MFA set-up, when the
 * account has neither recovery codes nor a passkey. Both actions reuse the Settings flows (fresh
 * proof, then regenerate codes or register a passkey). Nothing is stored: the card belongs to the
 * set-up moment, and Settings → Security keeps a reminder line while neither exists.
 *
 * Review fixes (2026-10-09): a pending check says so and is skipped after five seconds; the passkey
 * set-up keeps Back and Later, and returns to the choices when its fresh proof expires; focus moves to
 * the card's heading, and a polite live region says each step once.
 */
export function LockoutPrompt({ catalog, client = contractClient, onDone }: {
    catalog: MessageCatalog;
    client?: LockoutPromptClient;
    onDone: () => void;
}) {
    const [check, setCheck] = useState<'pending' | 'needed' | 'skipped'>('pending');
    const [choice, setChoice] = useState<StepUpAuthorizationRequest | null>(null);
    const [codes, setCodes] = useState<string[] | null>(null);
    const [grant, setGrant] = useState<{ token: string; expiresAt: string } | null>(null);
    const [added, setAdded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const flight = useRef(false);
    const done = useRef(onDone);
    done.current = onDone;
    const finished = useRef(false);
    const heading = useRef<HTMLHeadingElement>(null);
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
            if (value.recovery_codes_remaining > 0 || value.methods.some(method => method.type === 'passkey')) skip();
            else { active = false; clearTimeout(timer); setCheck('needed'); }
        }, () => { if (active) skip(); });
        return () => { active = false; clearTimeout(timer); };
    }, [client]);
    function choose(action: Choice) { setError(null); setGrant(null); setChoice({ action }); }
    function back() { setChoice(null); setGrant(null); setError(null); }
    function expired() { back(); setError(t(catalog, 'auth.lockout.expired')); }
    async function confirmed(result: ConfirmedSecurityAction) {
        if (!choice || flight.current || !matchingSecurityGrant(result, choice)) return;
        if (choice.action === 'ADD_PASSKEY') { setGrant({ token: result.step_up_grant.token, expiresAt: result.step_up_grant.expires_at }); return; }
        flight.current = true; setBusy(true); setError(null);
        try { setCodes((await client.regenerateRecoveryCodes(result.step_up_grant.token)).codes); }
        catch { setError(t(catalog, 'auth.lockout.failed')); setChoice(null); }
        finally { flight.current = false; setBusy(false); }
    }
    const complete = codes !== null || added;
    // The passkey set-up spends its fresh proof only when a passkey is created; once the proof expires,
    // creating one would fail, so the card goes back to its choices and says why.
    useEffect(() => {
        if (!grant || added) return;
        const timer = setTimeout(expired, Math.max(0, Date.parse(grant.expiresAt) - Date.now()));
        return () => clearTimeout(timer);
    }, [grant, added]);
    const step = check !== 'needed' ? null : complete ? 'done' : !choice ? 'choices' : grant ? 'passkey' : `confirm:${choice.action}`;
    const stepLabel = t(catalog, !choice ? 'auth.lockout.title' : choice.action === 'ADD_PASSKEY' ? 'auth.lockout.addPasskey' : 'auth.lockout.saveCodes');
    // The card replaces a set-up form that held focus, and each step replaces the controls of the last.
    useEffect(() => {
        if (step === null) return;
        heading.current?.focus();
        announcer.announce(stepLabel);
    }, [step, stepLabel, announcer.announce]);
    if (check === 'pending') return <p role="status">{t(catalog, 'auth.lockout.checking')}</p>;
    if (check === 'skipped') return null;
    return <section className="authLockout" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{t(catalog, 'auth.lockout.title')}</h2>
        <p>{t(catalog, 'auth.lockout.why')}</p>
        {error ? <p className="authFieldError" role="alert">{error}</p> : null}
        {codes ? <EphemeralCodes kind="new" catalog={catalog} codes={codes}/> : null}
        {choice && grant && !complete ? <>
            <SecurityEnrollment authority={{ kind: 'grant', token: grant.token }} availableMethods={['passkey']} catalog={catalog} client={client} onEnrolled={() => setAdded(true)} onExpired={expired}/>
            <div className="authLockoutActions">
                <button type="button" className="authSecondary" onClick={back}>{t(catalog, 'auth.lockout.back')}</button>
                <button type="button" className="authTextButton" onClick={finish}>{t(catalog, 'auth.lockout.later')}</button>
            </div>
        </> : null}
        {added ? <p role="status">{t(catalog, 'auth.enroll.methodAdded')}</p> : null}
        {choice && !grant && !complete ? <SecurityConfirmation catalog={catalog} client={client} authorization={choice} disabled={busy} onConfirmed={confirmed} onCancel={back}/> : null}
        {complete ? <button type="button" className="authPrimary" onClick={finish}>{t(catalog, 'auth.continue')}</button> : null}
        {!choice && !complete ? <div className="authLockoutActions">
            <button type="button" className="authPrimary" onClick={() => choose('REGENERATE_RECOVERY_CODES')}>{t(catalog, 'auth.lockout.saveCodes')}</button>
            <button type="button" className="authSecondary" onClick={() => choose('ADD_PASSKEY')}>{t(catalog, 'auth.lockout.addPasskey')}</button>
            <button type="button" className="authTextButton" onClick={finish}>{t(catalog, 'auth.lockout.later')}</button>
        </div> : null}
        {announcer.region}
    </section>;
}
