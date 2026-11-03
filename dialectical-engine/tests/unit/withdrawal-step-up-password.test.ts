import { describe, expect, it, vi } from 'vitest';
import { ConsumerSecurityService, refuseWithdrawalWithoutPassword } from '../../apps/api/src/consumer-security.js';
import { SocialAuthService } from '../../apps/api/src/social-auth.js';
import type { AuthenticatedSession, ConsumerSessionProducer } from '../../apps/api/src/sessions.js';

// Romania's withdrawal rules (owner ruling 2026-11-03): the withdrawal grant comes only from the password and the
// authenticator code (POST /v1/auth/step-up). A passkey or a provider step-up is refused before anything is admitted.
const ADMITTED = new Error('ADMITTED');
const session = { userId: 'u', tokenHash: 't', session: { session_id: 's' } } as unknown as AuthenticatedSession;
const source = {} as never;
function producer() {
    return { admit: vi.fn(async () => { throw ADMITTED; }) } as unknown as ConsumerSessionProducer & { admit: ReturnType<typeof vi.fn> };
}

describe('the withdrawal grant needs the password and the authenticator code', () => {
    it('refuses WITHDRAW_SUBSCRIPTION and nothing else', () => {
        expect(() => refuseWithdrawalWithoutPassword({ action: 'WITHDRAW_SUBSCRIPTION' })).toThrow(expect.objectContaining({ code: 'AUTH_INPUT_INVALID' }));
        for (const action of ['DELETE_ACCOUNT', 'CHANGE_EMAIL', 'EXPORT_DATA', 'ADD_TOTP'])
            expect(() => refuseWithdrawalWithoutPassword({ action }), action).not.toThrow();
    });

    it('a passkey step-up never begins for a withdrawal', async () => {
        const sessions = producer();
        const security = new ConsumerSecurityService({} as never, sessions, { publicAppUrl: 'https://app.test/', argon2: {} as never, mfaPolicy: {} as never, authPolicy: {} as never });
        await expect(security.beginPasskeyStepUp({ authorization: { action: 'WITHDRAW_SUBSCRIPTION' } }, session, source))
            .rejects.toMatchObject({ code: 'AUTH_INPUT_INVALID' });
        expect(sessions.admit).not.toHaveBeenCalled();
        await expect(security.beginPasskeyStepUp({ authorization: { action: 'DELETE_ACCOUNT' } }, session, source)).rejects.toBe(ADMITTED);
    });

    it('a provider step-up (social sign-in) never begins for a withdrawal', async () => {
        const sessions = producer();
        const social = new SocialAuthService({} as never, {} as never, sessions, { registration: {} as never, security: {} as never, authPolicy: {} as never, blindIndexKey: new Uint8Array(32) });
        await expect(social.beginStepUp('google', { authorization: { action: 'WITHDRAW_SUBSCRIPTION' } }, source, session))
            .rejects.toMatchObject({ code: 'AUTH_INPUT_INVALID' });
        expect(sessions.admit).not.toHaveBeenCalled();
        await expect(social.beginStepUp('google', { authorization: { action: 'DELETE_ACCOUNT' } }, source, session)).rejects.toBe(ADMITTED);
    });
});
