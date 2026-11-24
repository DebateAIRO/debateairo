import type { AuthMethodsResponse } from '@debateai/contract';

/**
 * What an account still lacks so that losing one sign-in step does not lock the person out:
 * - 'none': it has unused recovery codes, or both an authenticator app and a passkey (either one gets them back in);
 * - 'codes': it has a passkey and no authenticator app, so a saved recovery code is the only way back if the passkey
 *   is lost;
 * - 'codes-or-passkey': anything else (an authenticator app alone, or nothing yet), where recovery codes or a passkey
 *   would each help.
 * Shared by the "Don't get locked out" card and the reminder in Settings → Security, so both follow one rule.
 */
export type LockoutNeed = 'none' | 'codes' | 'codes-or-passkey';

export function lockoutNeed(account: Pick<AuthMethodsResponse, 'methods' | 'recovery_codes_remaining'>): LockoutNeed {
    if (account.recovery_codes_remaining > 0) return 'none';
    const passkey = account.methods.some(method => method.type === 'passkey');
    const authenticator = account.methods.some(method => method.type === 'totp');
    if (passkey && authenticator) return 'none';
    return passkey ? 'codes' : 'codes-or-passkey';
}
