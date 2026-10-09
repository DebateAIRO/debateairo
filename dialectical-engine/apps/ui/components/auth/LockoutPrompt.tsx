"use client";
import { useEffect, useId, useRef, useState } from 'react';
import type { ContractClient, StepUpAuthorizationRequest } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { matchingSecurityGrant, type ConfirmedSecurityAction } from '@/lib/securityConfirmation';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { SecurityConfirmation, type SecurityConfirmationClient } from './SecurityConfirmation';
import { SecurityEnrollment, type EnrollmentClient } from './SecurityEnrollment';
import { EphemeralCodes } from './EphemeralCodes';
export type LockoutPromptClient = Pick<ContractClient, 'authMethods' | 'regenerateRecoveryCodes'> & EnrollmentClient & SecurityConfirmationClient;
type Choice = 'REGENERATE_RECOVERY_CODES' | 'ADD_PASSKEY';
/**
 * "Don't get locked out" (owner ruling 2026-10-09): shown once, right after MFA set-up, when the
 * account has neither recovery codes nor a passkey. Both actions reuse the Settings flows (fresh
 * proof, then regenerate codes or register a passkey). Nothing is stored: the card belongs to the
 * set-up moment, and Settings → Security keeps a reminder line while neither exists.
 */
export function LockoutPrompt({ catalog, client = contractClient, onDone }: {
    catalog: MessageCatalog;
    client?: LockoutPromptClient;
    onDone: () => void;
}) {
    const [needed, setNeeded] = useState(false);
    const [choice, setChoice] = useState<StepUpAuthorizationRequest | null>(null);
    const [codes, setCodes] = useState<string[] | null>(null);
    const [grant, setGrant] = useState<string | null>(null);
    const [added, setAdded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const flight = useRef(false);
    const done = useRef(onDone);
    done.current = onDone;
    const finished = useRef(false);
    const id = useId();
    function finish() {
        if (finished.current) return;
        finished.current = true;
        done.current();
    }
    useEffect(() => {
        let active = true;
        void client.authMethods().then(value => {
            if (!active) return;
            if (value.recovery_codes_remaining > 0 || value.methods.some(method => method.type === 'passkey')) finish();
            else setNeeded(true);
        }, () => { if (active) finish(); });
        return () => { active = false; };
    }, [client]);
    function choose(action: Choice) { setError(null); setGrant(null); setChoice({ action }); }
    function back() { setChoice(null); setGrant(null); setError(null); }
    async function confirmed(result: ConfirmedSecurityAction) {
        if (!choice || flight.current || !matchingSecurityGrant(result, choice)) return;
        if (choice.action === 'ADD_PASSKEY') { setGrant(result.step_up_grant.token); return; }
        flight.current = true; setBusy(true); setError(null);
        try { setCodes((await client.regenerateRecoveryCodes(result.step_up_grant.token)).codes); }
        catch { setError(t(catalog, 'auth.lockout.failed')); setChoice(null); }
        finally { flight.current = false; setBusy(false); }
    }
    if (!needed) return null;
    const complete = codes !== null || added;
    return <section className="authLockout" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>{t(catalog, 'auth.lockout.title')}</h2>
        <p>{t(catalog, 'auth.lockout.why')}</p>
        {error ? <p className="authFieldError" role="alert">{error}</p> : null}
        {codes ? <EphemeralCodes kind="new" catalog={catalog} codes={codes}/> : null}
        {choice && grant && !complete ? <SecurityEnrollment authority={{ kind: 'grant', token: grant }} availableMethods={['passkey']} catalog={catalog} client={client} onEnrolled={() => setAdded(true)} onExpired={back}/> : null}
        {added ? <p role="status">{t(catalog, 'auth.enroll.methodAdded')}</p> : null}
        {choice && !grant && !complete ? <SecurityConfirmation catalog={catalog} client={client} authorization={choice} disabled={busy} onConfirmed={confirmed} onCancel={back}/> : null}
        {complete ? <button type="button" className="authPrimary" onClick={finish}>{t(catalog, 'auth.continue')}</button> : null}
        {!choice && !complete ? <div className="authLockoutActions">
            <button type="button" className="authPrimary" onClick={() => choose('REGENERATE_RECOVERY_CODES')}>{t(catalog, 'auth.lockout.saveCodes')}</button>
            <button type="button" className="authSecondary" onClick={() => choose('ADD_PASSKEY')}>{t(catalog, 'auth.lockout.addPasskey')}</button>
            <button type="button" className="authTextButton" onClick={finish}>{t(catalog, 'auth.lockout.later')}</button>
        </div> : null}
    </section>;
}
