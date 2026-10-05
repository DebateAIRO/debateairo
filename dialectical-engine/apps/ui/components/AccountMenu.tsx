"use client";
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';
import type { ContractClient } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { endSession, type EndSessionClient } from '@/lib/endSession';
import { useChromeI18n } from '@/lib/i18n/I18nProvider';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
export function AccountMenu({ authenticated, catalog: provided, client = contractClient, redirectTo = '/login' }: {
    authenticated?: boolean;
    catalog?: MessageCatalog;
    client?: EndSessionClient & Partial<Pick<ContractClient, 'readSession'>>;
    redirectTo?: string | null;
}) {
    const { catalog: context } = useChromeI18n();
    const catalog = provided ?? context;
    const [signedIn, setSignedIn] = useState(authenticated ?? false);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const flight = useRef(false);
    const root = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 12, width: 240 });
    const trigger = useRef<HTMLButtonElement>(null);
    const id = useId();
    useEffect(() => {
        let active = true;
        if (authenticated !== undefined) { setSignedIn(authenticated); return; }
        const check = () => { void (client.readSession ?? contractClient.readSession)().then(() => { if (active) setSignedIn(true); }, () => { if (active) { setSignedIn(false); setOpen(false); } }); };
        check();
        const ended = (event: Event) => {
            if (event instanceof CustomEvent && event.detail?.ended === true) { setSignedIn(false); setOpen(false); }
            else check(); // A proof can rotate the session without ending it.
        };
        window.addEventListener('debateai:staff-session-ended', ended);
        return () => { active = false; window.removeEventListener('debateai:staff-session-ended', ended); };
    }, [authenticated, client]);
    function close(restore = true) { setOpen(false); if (restore) queueMicrotask(() => trigger.current?.focus()); }
    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) close(false); };
        const place = () => { const rect = trigger.current?.getBoundingClientRect(); if (!rect) return; const width = Math.min(240, window.innerWidth - 24); const height = panel.current?.offsetHeight ?? 160; setPosition({ top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - height - 12)), left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), width }); };
        place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
        document.addEventListener('pointerdown', outside);
        panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    }, [open]);
    async function logout() {
        if (flight.current) return;
        flight.current = true; setBusy(true); setError(false);
        try { await endSession(client, { redirectTo }); close(false); setSignedIn(false); }
        catch { setError(true); }
        finally { flight.current = false; setBusy(false); }
    }
    if (!signedIn) return null;
    return <div className="accountMenu" ref={root} onBlur={event => { if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && !panel.current?.contains(event.relatedTarget as Node)) close(false); }} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        if (!open) { setOpen(true); return; }
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
    }}>
        <button ref={trigger} type="button" className="btn" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => { if (open) close(); else setOpen(true); }}>{t(catalog, 'chrome.account')}</button>
        {open ? createPortal(<div ref={panel} style={{position: 'fixed', top: position.top, left: position.left, right: 'auto', bottom: 'auto', width: position.width}} id={id} role="menu" aria-label={t(catalog, 'chrome.account')} className="accountMenuPanel">
            <Link role="menuitem" href="/settings" onClick={() => close(false)}>{t(catalog, 'chrome.account')}</Link>
            <Link role="menuitem" href="/settings/security" onClick={() => close(false)}>{t(catalog, 'chrome.security')}</Link>
            <button role="menuitem" type="button" data-account-logout disabled={busy} onClick={() => void logout()}>{t(catalog, 'chrome.logout')}</button>
            {error ? <p role="alert">{t(catalog, 'chrome.accountError')}</p> : null}
        </div>, document.body) : null}
    </div>;
}
