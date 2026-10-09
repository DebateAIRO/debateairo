/**
 * A typed or pasted authenticator code (auth UI repair, 2026-10-09). Spaces and dashes are ignored, so
 * "123 456" and "123-456" read as 123456; anything else (letters, a seventh digit) is reported as not a
 * six-digit code rather than being cut down to six digits and sent.
 */
export function readSixDigitCode(raw: string): Readonly<{ digits: string; valid: boolean; complete: boolean }> {
    const digits = raw.replace(/[\s-]/g, '');
    const valid = /^\d{0,6}$/.test(digits);
    return { digits, valid, complete: valid && digits.length === 6 };
}
