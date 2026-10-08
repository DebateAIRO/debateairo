/** One authority+code attempt. Editing permits retry; rerenders and manual submit do not. */
export function createCodeAttempt() {
    let attempted: string | null = null;
    return {
        edited() {
            attempted = null;
        },
        claim(authority: string, code: string) {
            const key = `${authority}:${code}`;
            if (!/^\d{6}$/.test(code) || key === attempted)
                return false;
            attempted = key;
            return true;
        }
    };
}
