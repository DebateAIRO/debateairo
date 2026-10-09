/**
 * A typed or pasted authenticator code (auth UI repair, 2026-10-09). Spaces and dashes are ignored, so
 * "123 456" and "123-456" read as 123456; anything else (letters, a seventh digit) is reported as not a
 * six-digit code rather than being cut down to six digits and sent. Full-width digits, spaces and dashes
 * from a Japanese or Chinese keyboard ("１２３　４５６") are folded to their plain forms first (NFKC).
 */
export function readSixDigitCode(raw: string): Readonly<{ digits: string; valid: boolean; complete: boolean }> {
    const digits = raw.normalize('NFKC').replace(/[\s-]/g, '');
    const valid = /^\d{0,6}$/.test(digits);
    return { digits, valid, complete: valid && digits.length === 6 };
}

/** The check every six-digit code form runs on submit: the digits to send, or null when it is not exactly six digits. */
export function sixDigitCodeToSend(raw: string): string | null {
    const code = readSixDigitCode(raw);
    return code.complete ? code.digits : null;
}
