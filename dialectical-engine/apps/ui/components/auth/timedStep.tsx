"use client";
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';

/*
 * Timed steps and step changes for screen-reader users (a11y fix 2026-10-15; WCAG 2.2.1 Timing
 * Adjustable, 4.1.3 Status Messages, 2.4.3 Focus Order). The server sets every time limit used here and
 * the browser never changes one: the person is told about a minute before it runs out, and when it does,
 * an alert says so and focus lands on what replaced the step.
 */

/** How long before a server deadline the person is warned. */
export const DEADLINE_WARNING_MS = 60_000;
/** The longest delay setTimeout honours; a deadline further away is not timed in this page view. */
const MAX_TIMEOUT_MS = 2_147_483_647;
/** Long enough for a screen reader to notice the emptied region before the sentence arrives. */
const ANNOUNCE_AFTER_CLEAR_MS = 100;
/** The AuthShell headline's id (components/AuthShell.tsx). */
const AUTH_TITLE_ID = 'auth-title';

/**
 * True from about a minute before `deadline` until the deadline changes, for the visible warning line. At
 * that moment `announce` says `message` once: pass the announce of a live region that is already mounted
 * (useFormAnnouncer), so the sentence arrives as a change to it. A null deadline (no timed step on screen)
 * never warns.
 */
export function useDeadlineWarning(deadline: string | null | undefined, announce: (message: string) => void, message: string): boolean {
    const [warned, setWarned] = useState<string | null>(null);
    const latest = useRef({ announce, message });
    latest.current = { announce, message };
    useEffect(() => {
        if (!deadline)
            return;
        const remaining = Date.parse(deadline) - Date.now();
        // Already over (the step's own expiry takes over), unreadable, or too far away to time.
        if (!(remaining > 0) || remaining - DEADLINE_WARNING_MS > MAX_TIMEOUT_MS)
            return;
        const timer = setTimeout(() => {
            setWarned(deadline);
            latest.current.announce(latest.current.message);
        }, Math.max(0, remaining - DEADLINE_WARNING_MS));
        return () => clearTimeout(timer);
    }, [deadline]);
    return !!deadline && warned === deadline;
}

/**
 * An always-mounted, visually hidden assertive live region that becomes role="alert" while it holds a
 * sentence. It renders empty and `alert` sets its sentence a moment after emptying it, so the expiry is
 * announced as a change to a region the reader already tracks, instead of relying on how a reader treats an
 * alert inserted already holding its text; while empty it is no alert, so "no alert on screen" stays true.
 * `clear` empties it once the step is left.
 */
export function useAlertRegion(): Readonly<{ alert: (message: string) => void; clear: () => void; region: JSX.Element }> {
    const [text, setText] = useState('');
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    const alert = useCallback((message: string) => {
        clearTimeout(timer.current);
        setText('');
        timer.current = setTimeout(() => setText(message), ANNOUNCE_AFTER_CLEAR_MS);
    }, []);
    const clear = useCallback(() => {
        clearTimeout(timer.current);
        setText('');
    }, []);
    return { alert, clear, region: <p className="srOnly" role={text ? 'alert' : undefined} aria-live="assertive" aria-atomic="true">{text}</p> };
}

/**
 * Each step of an AuthShell flow replaces the controls that held focus, which would drop focus to the
 * page. Whenever `step` changes after the first render, focus moves to the AuthShell headline (the
 * EmailPendingScreen and LockoutPrompt pattern). Returns the value for AuthShell's `focusTitle`, which
 * gives the headline tabIndex={-1}; it turns on with the first change, so a page that opens on its first
 * step keeps the browser's own starting point. `target` may name another element to land on for this
 * change, such as an expiry message that the restart control follows.
 */
export function useStepFocus(step: string, target?: () => HTMLElement | null | undefined): boolean {
    const [initial] = useState(step);
    const [moved, setMoved] = useState(false);
    if (!moved && step !== initial)
        setMoved(true);
    const previous = useRef(step);
    const pick = useRef(target);
    pick.current = target;
    useEffect(() => {
        if (previous.current === step)
            return;
        previous.current = step;
        (pick.current?.() ?? document.getElementById(AUTH_TITLE_ID))?.focus();
    }, [step]);
    return moved || step !== initial;
}
