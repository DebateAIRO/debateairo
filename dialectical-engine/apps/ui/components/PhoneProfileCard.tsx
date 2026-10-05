"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { AccountPhoneProfile, ContractClient, StepUpAuthorizationRequest } from '@debateai/contract';
import { normalizeManualPhone } from '@debateai/kernel/manualPhone';
import { contractClient } from '@/lib/api';
import { matchingSecurityGrant, type ConfirmedSecurityAction } from '@/lib/securityConfirmation';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { SecurityConfirmation, type SecurityConfirmationClient } from './auth/SecurityConfirmation';
import { PhoneField } from './auth/PhoneField';
export type SecurityResume = { authorization: StepUpAuthorizationRequest; initialProof: ConfirmedSecurityAction };
export type PhoneProfileClient = Pick<ContractClient, 'phoneProfile' | 'revealPhoneProfile' | 'updatePhoneProfile'> & SecurityConfirmationClient;
export function PhoneProfileCard({ client = contractClient, catalog, authCatalog, resume, completion = false, onUpdated, onCancel, onBeforeProviderRedirect }: {
    client?: PhoneProfileClient;
    catalog: MessageCatalog;
    authCatalog: MessageCatalog;
    resume?: SecurityResume | null;
    completion?: boolean;
    onUpdated?: () => void | Promise<void>;
    onCancel?: () => void;
    onBeforeProviderRedirect?: (context: {authorization: StepUpAuthorizationRequest; isCurrent: () => boolean}) => void | boolean | Promise<void | boolean>;
}) {
    const [profile, setProfile] = useState<AccountPhoneProfile | null>(null);
    const [full, setFull] = useState<string | null>(null);
    const [revealUntil, setRevealUntil] = useState<number | null>(null);
    const [phone, setPhone] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [phoneError, setPhoneError] = useState<string | undefined>();
    const [action, setAction] = useState<StepUpAuthorizationRequest | null>(completion ? { action: 'CHANGE_PHONE_PROFILE' } : null);
    const [held, setHeld] = useState<ConfirmedSecurityAction | null>(null);
    const [busy, setBusy] = useState(false);
    const sequence = useRef(0);
    const revealSequence = useRef(0);
    const metadataSequence = useRef(0);
    const flight = useRef(false);
    const active = useRef(true);
    const seen = useRef<string | null>(null);
    const id = useId();
    const pathname = usePathname();
    useEffect(() => {
        active.current = true;
        const generation = ++metadataSequence.current;
        void client.phoneProfile().then(value => { if (active.current && metadataSequence.current === generation) setProfile(value); }, () => { if (active.current && metadataSequence.current === generation) setError(t(catalog, 'settings.email.unavailable')); });
        return () => { active.current = false; metadataSequence.current++; sequence.current++; };
    }, [client, catalog]);
    useEffect(() => {
        if (!resume || seen.current === resume.initialProof.step_up_grant.token) return;
        seen.current = resume.initialProof.step_up_grant.token;
        if (!['READ_PHONE_PROFILE', 'CHANGE_PHONE_PROFILE'].includes(resume.authorization.action) || !matchingSecurityGrant(resume.initialProof, resume.authorization)) return;
        setAction(resume.authorization); setHeld(resume.initialProof); setFull(null); setError(null);
    }, [resume]);
    useEffect(() => {
        setFull(null);
        const ended = (event: Event) => {
            revealSequence.current++;
            setFull(null);
            if (event instanceof CustomEvent && event.detail?.ended === true) { metadataSequence.current++; sequence.current++; setPhone(''); setHeld(null); setAction(null); }
        };
        window.addEventListener('debateai:staff-session-ended', ended);
        return () => { sequence.current++; window.removeEventListener('debateai:staff-session-ended', ended); };
    }, [pathname]);
    useEffect(() => {
        if (!full) return;
        const timer = setTimeout(() => setFull(null), Math.max(0, Math.min(60_000, (revealUntil ?? Date.now()) - Date.now())));
        return () => clearTimeout(timer);
    }, [full, revealUntil]);
    useEffect(() => {
        if (!held) return;
        const timer = setTimeout(() => { setHeld(null); setAction(null); setFull(null); setError(t(authCatalog, 'auth.enroll.expired')); }, Math.max(0, Date.parse(held.step_up_grant.expires_at) - Date.now()));
        return () => clearTimeout(timer);
    }, [held, authCatalog]);
    function cancel() { sequence.current++; flight.current = false; setBusy(false); setFull(null); setPhone(''); setHeld(null); setAction(null); setError(null); setPhoneError(undefined); onCancel?.(); }
    function choose(value: 'READ_PHONE_PROFILE' | 'CHANGE_PHONE_PROFILE') { sequence.current++; setFull(null); setError(null); setPhoneError(undefined); setHeld(null); setAction({ action: value }); }
    let normalized: string | null = null;
    if (action?.action === 'CHANGE_PHONE_PROFILE') { try { normalized = normalizeManualPhone(phone); } catch {} }
    async function execute(result: ConfirmedSecurityAction) {
        if (!action || flight.current || !active.current || !matchingSecurityGrant(result, action)) return;
        if (action.action === 'CHANGE_PHONE_PROFILE' && !normalized) { setPhoneError(t(authCatalog, 'auth.phone.invalid')); document.getElementById(`${id}-phone`)?.focus(); return; }
        const authorization = action;
        const generation = ++sequence.current;
        flight.current = true; setBusy(true); setError(null); setHeld(null);
        try {
            if (authorization.action === 'READ_PHONE_PROFILE') {
                const revealOwner = ++revealSequence.current;
                const value = await client.revealPhoneProfile(result.step_up_grant.token);
                if (active.current && generation === sequence.current && revealOwner === revealSequence.current && matchingSecurityGrant(result, authorization)) { setRevealUntil(Date.parse(result.step_up_grant.expires_at)); setFull(value.phone); }
            } else if (authorization.action === 'CHANGE_PHONE_PROFILE') {
                const value = await client.updatePhoneProfile({ phone: normalized!, grantToken: result.step_up_grant.token });
                if (active.current && generation === sequence.current) { metadataSequence.current++; setProfile(value); setPhone(''); setAction(null); await onUpdated?.(); }
            }
            if (active.current && generation === sequence.current) setAction(null);
        } catch { if (active.current && generation === sequence.current) { setError(t(catalog, 'settings.email.actionFailed')); setAction(null); } }
        finally { if (active.current && generation === sequence.current) { flight.current = false; setBusy(false); } }
    }
    return <section className="setList" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>{t(authCatalog, 'auth.phone.label')}</h2>
        <p>{t(authCatalog, 'auth.phone.hint')}</p>
        {completion ? <p role="status">{t(catalog, 'settings.phone.required')}</p> : null}
        <p>{full ?? profile?.phone_masked ?? '—'}</p>
        {full ? <button type="button" onClick={() => setFull(null)}>{t(authCatalog, 'auth.password.hide')}</button> : null}
        {error ? <p role="alert">{error}</p> : null}
        {!action ? <div className="setListActions">
            {profile?.phone_present ? <button type="button" disabled={busy} onClick={() => choose('READ_PHONE_PROFILE')}>{t(catalog, 'settings.phone.reveal')}</button> : null}
            <button type="button" disabled={busy} onClick={() => choose('CHANGE_PHONE_PROFILE')}>{t(catalog, 'settings.phone.change')}</button>
        </div> : <>
            {action.action === 'CHANGE_PHONE_PROFILE' ? <PhoneField id={`${id}-phone`} value={phone} onChange={value => { setPhone(value); setPhoneError(undefined); }} catalog={authCatalog} error={phoneError} disabled={busy}/> : null}
            {held ? <><button type="button" data-resumed-confirm disabled={busy} onClick={() => void execute(held)}>{t(authCatalog, 'auth.security.confirm')}</button><button type="button" onClick={cancel}>{t(authCatalog, 'auth.security.cancel')}</button></> : <SecurityConfirmation catalog={authCatalog} client={client} authorization={action} onBeforeProviderRedirect={onBeforeProviderRedirect} disabled={busy || (action.action === 'CHANGE_PHONE_PROFILE' && !normalized)} onConfirmed={execute} onCancel={cancel}/>}
        </>}
    </section>;
}
