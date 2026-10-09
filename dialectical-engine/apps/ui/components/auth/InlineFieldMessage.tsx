import { useCallback, useEffect, useRef, useState, type JSX } from 'react';

export function InlineFieldMessage({ id, message }: {
    id: string;
    message?: string | null;
}) {
    // Not a live region: the field points here with aria-describedby and the form moves focus to the first
    // invalid field, so one submit is announced once instead of once per field (auth UI repair, 2026-10-09).
    // A submit made from inside a field that is already focused moves focus nowhere, so the form's own
    // live region (useFormErrorAnnouncer) says the first error.
    return message ? <p id={id} className="authFieldError">{message}</p> : null;
}

/** Long enough for a screen reader to notice the emptied region before the sentence arrives. */
const ANNOUNCE_AFTER_CLEAR_MS = 100;

/**
 * One polite, visually hidden live region per form (review fix, 2026-10-09). `announce` empties the
 * region, then sets the sentence a moment later, so pressing Enter again on the same mistake is read
 * again even though the text is identical. Render `region` directly inside the form.
 */
export function useFormErrorAnnouncer(): Readonly<{ announce: (message: string | null | undefined) => void; region: JSX.Element }> {
    const [text, setText] = useState('');
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    const announce = useCallback((message: string | null | undefined) => {
        if (!message)
            return;
        clearTimeout(timer.current);
        setText('');
        timer.current = setTimeout(() => setText(message), ANNOUNCE_AFTER_CLEAR_MS);
    }, []);
    return { announce, region: <p className="srOnly" aria-live="polite" aria-atomic="true">{text}</p> };
}
