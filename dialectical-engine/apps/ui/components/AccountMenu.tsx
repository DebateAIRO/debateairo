"use client";
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ContractClient } from '@debateai/contract';
import { contractClient } from '@/lib/api';
import { endSession, type EndSessionClient } from '@/lib/endSession';
import { useChromeI18n } from '@/lib/i18n/I18nProvider';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
/**
 * V4 screen review (ask-d6 A, 3 Nov 2026): the V4 header keeps this one menu (its keyboard, focus and sign-out rules) with
 * its own trigger, items and words. Every part left out is the site's own: the "Account" button, Account and Security, "Log out".
 */
export type AccountMenuLook = Readonly<{
    /** The trigger's class, its name for screen readers (also the menu's name) and what it shows. */
    trigger?: Readonly<{ className: string; label: string; content: ReactNode }>;
    /** The menu's items before the sign-out, each `role="menuitem"`; `close(false)` closes it without moving focus. */
    items?: (close: (restoreFocus?: boolean) => void) => ReactNode;
    /** The sign-out item's words, and the signed-out link's. */
    logoutLabel?: string;
    signInLabel?: string;
}>;
export function AccountMenu({ authenticated, catalog: provided, client = contractClient, redirectTo = '/login', signInHref, signInClassName = 'btn', look }: {
    authenticated?: boolean;
    catalog?: MessageCatalog;
    client?: EndSessionClient & Partial<Pick<ContractClient, 'readSession'>>;
    redirectTo?: string | null;
    /** When set, a visitor known to be signed out sees a "Log in" link here instead of nothing. */
    signInHref?: string;
    signInClassName?: string;
    look?: AccountMenuLook;
}) {
    const { catalog: context } = useChromeI18n();
    const catalog = provided ?? context;
    // null = the session check has not answered yet: show nothing, so a signed-in visitor never sees "Log in" flash.
    const [signedIn, setSignedIn] = useState<boolean | null>(authenticated ?? null);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const flight = useRef(false);
    const root = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 12, width: 240 });
    const trigger = useRef<HTMLButtonElement>(null);
    // A pointer press is under way: the blur it causes is the person's own click, never a focus loss to repair.
    const pressed = useRef(false);
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
        pressed.current = false;
        const outside = (event: PointerEvent) => { pressed.current = true; if (!root.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) close(false); };
        const release = () => { pressed.current = false; };
        // Focus fell to <body> with the menu open (a press on the panel's padding, the logout button disabling
        // itself): the key no longer reaches the menu, so Escape is caught here and still closes it onto the trigger.
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && event.target === document.body) { event.preventDefault(); close(); } };
        const place = () => { const rect = trigger.current?.getBoundingClientRect(); if (!rect) return; const width = Math.min(240, window.innerWidth - 24); const height = panel.current?.offsetHeight ?? 160; setPosition({ top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - height - 12)), left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), width }); };
        place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
        document.addEventListener('pointerdown', outside); document.addEventListener('pointerup', release); document.addEventListener('pointercancel', release); document.addEventListener('keydown', escape);
        panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('pointerup', release); document.removeEventListener('pointercancel', release); document.removeEventListener('keydown', escape); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    }, [open]);
    async function logout() {
        if (flight.current) return;
        flight.current = true; setBusy(true); setError(false);
        try { await endSession(client, { redirectTo }); close(false); setSignedIn(false); }
        catch { setError(true); }
        finally { flight.current = false; setBusy(false); }
    }
    if (signedIn !== true) return signedIn === false && signInHref ? <a className={signInClassName} href={signInHref}>{look?.signInLabel ?? t(catalog, 'chrome.logIn')}</a> : null;
    const menuLabel = look?.trigger?.label ?? t(catalog, 'chrome.account');
    // Focus that leaves for another control closes the menu and stays there; focus that leaves for nowhere (no
    // relatedTarget: it would land on <body>) closes it onto the trigger, unless a press or the logout in flight caused it.
    return <div className="accountMenu" ref={root} onBlur={event => {
        if (!open) return;
        const next = event.relatedTarget as Node | null;
        if (next === null) { if (!pressed.current && !flight.current) close(); }
        else if (!event.currentTarget.contains(next) && !panel.current?.contains(next)) close(false);
    }} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key === 'Tab' && open) {
            // The panel sits at the end of <body>, so Tab past its last item (Shift+Tab before its first) would leave
            // the page: the menu closes and the step starts from the trigger instead (Tab then moves on past it).
            const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []).filter(item => !item.matches(':disabled'));
            if (document.activeElement !== (event.shiftKey ? items[0] : items.at(-1))) return;
            close(false); trigger.current?.focus();
            if (event.shiftKey) event.preventDefault();
            return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        if (!open) { setOpen(true); return; }
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
    }}>
        <button ref={trigger} type="button" className={look?.trigger?.className ?? 'btn'} aria-label={look?.trigger === undefined ? undefined : menuLabel} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => { if (open) close(); else setOpen(true); }}>{look?.trigger?.content ?? t(catalog, 'chrome.account')}</button>
        {open ? createPortal(<div ref={panel} style={{position: 'fixed', top: position.top, left: position.left, right: 'auto', bottom: 'auto', width: position.width}} id={id} role="menu" aria-label={menuLabel} className="accountMenuPanel">
            {look?.items === undefined ? <>
                <a role="menuitem" href="/settings" onClick={() => close(false)}>{t(catalog, 'chrome.account')}</a>
                <a role="menuitem" href="/settings/security" onClick={() => close(false)}>{t(catalog, 'chrome.security')}</a>
            </> : look.items(close)}
            <button role="menuitem" type="button" data-account-logout disabled={busy} onClick={() => void logout()}>{look?.logoutLabel ?? t(catalog, 'chrome.logout')}</button>
            {error ? <p role="alert">{t(catalog, 'chrome.accountError')}</p> : null}
        </div>, document.body) : null}
    </div>;
}
