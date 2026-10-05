import { describe, expect, it } from 'vitest';
import { buildApi, type AskApplication } from '../../apps/api/src/index.js';
describe('social sign-in availability boundary', () => {
    it('advertises no provider when no validated social configuration or worker is composed', async () => {
        const api = buildApi({ application: {} as AskApplication, allowedOrigin: 'https://app.example.test' });
        try {
            const response = await api.inject({ method: 'GET', url: '/v1/auth/providers' });
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({ providers: [] });
            expect(response.headers['cache-control']).toBe('no-store');
        }
        finally {
            await api.close();
        }
    });
    it('refuses unavailable provider initiation after normal exact-Origin validation', async () => {
        const api = buildApi({ application: {} as AskApplication, allowedOrigin: 'https://app.example.test' });
        try {
            for (const provider of ['google', 'apple', 'facebook', 'x']) {
                const denied = await api.inject({ method: 'POST', url: `/v1/auth/social/${provider}/begin`, headers: { origin: 'https://evil.example' }, payload: {} });
                expect(denied.statusCode).toBe(403);
                const unavailable = await api.inject({ method: 'POST', url: `/v1/auth/social/${provider}/begin`, headers: { origin: 'https://app.example.test' }, payload: {} });
                expect(unavailable.statusCode).toBe(503);
                expect(unavailable.json()).toMatchObject({ error: 'SOCIAL_PROVIDER_UNAVAILABLE' });
                expect(unavailable.headers['set-cookie']).toBeUndefined();
            }
        }
        finally {
            await api.close();
        }
    });
});
import type { SocialAuthApplication } from '../../apps/api/src/social-auth.js';
import { SOCIAL_APPLE_FLOW_COOKIE, SOCIAL_BROWSER_COOKIE, SocialAuthError } from '../../apps/api/src/social-auth.js';
it('scopes Apple form_post parsing and cross-site proof to its exact callback while normal CSRF remains active', async () => {
    const token = 'a'.repeat(43), cookie = 'b'.repeat(43);
    let received: unknown;
    const social = { authProviders: async () => ({ providers: [] }), callback: async (provider: string, input: unknown, flowCookie: string | null) => {
            if (provider !== 'apple' || flowCookie !== cookie)
                throw new SocialAuthError('SOCIAL_PROOF_INVALID');
            received = input;
            return { status: 'signup_required', token, browserCookie: 'c'.repeat(43), next: '/', expiresAt: new Date(Date.now() + 120000).toISOString() };
        } } as unknown as SocialAuthApplication;
    const api = buildApi({ application: {} as AskApplication, allowedOrigin: 'https://app.example.test', socialAuth: social });
    try {
        const headers = { origin: 'https://appleid.apple.com', 'content-type': 'application/x-www-form-urlencoded', cookie: `${SOCIAL_APPLE_FLOW_COOKIE}=${cookie}` };
        const result = await api.inject({ method: 'POST', url: '/v1/auth/social/apple/callback', headers, payload: new URLSearchParams({ state: token, code: 'apple-code' }).toString() });
        expect(result.statusCode).toBe(303);
        expect(result.headers.location).toBe('/social/complete#kind=signup&token=' + token + '&next=%2F');
        expect(received).toEqual({ state: token, code: 'apple-code' });
        expect(result.headers['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining(`${SOCIAL_APPLE_FLOW_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`), expect.stringContaining(`${SOCIAL_BROWSER_COOKIE}=`)]));
        expect((await api.inject({ method: 'POST', url: '/v1/auth/social/apple/callback', headers, payload: 'state=a&state=b&code=x' })).statusCode).toBe(400);
        expect((await api.inject({ method: 'POST', url: '/v1/auth/social/apple/callback', headers: { ...headers, cookie: '' }, payload: 'state=a&code=x' })).statusCode).toBe(400);
        expect((await api.inject({ method: 'POST', url: '/v1/auth/social/google/begin', headers, payload: 'state=a&code=x' })).statusCode).toBe(415);
        expect((await api.inject({ method: 'POST', url: '/v1/auth/social/google/begin', headers: { origin: 'https://appleid.apple.com' }, payload: {} })).statusCode).toBe(403);
    }
    finally {
        await api.close();
    }
});
import { vi } from 'vitest';
import { MfaEnrollmentService } from '../../apps/api/src/mfa.js';
import { MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue } from '@debateai/register';
it.each(['begin', 'complete'])('charges shared source admission before provider-capability network work during TOTP %s', async (operation) => {
    const socialBindings = vi.fn(async () => []), service = new MfaEnrollmentService({ repository: {} as never, consumerRepository: {} as never, sessions: { admit: async () => { throw new Error('SOURCE_REFUSED'); }, bindingHash: () => 'sha256:' + 'a'.repeat(64), socialBindings } as never, dekStore: {} as never, argon2: {} as never, policy: mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value) });
    const input = { enrollmentToken: 'a'.repeat(43), code: '123456' }, source = { ip: '198.51.100.1', userAgent: 'test', requestId: 'test' };
    await expect(operation === 'begin' ? service.beginTotp(input, source) : service.verifyTotp(input, source)).rejects.toThrow('SOURCE_REFUSED');
    expect(socialBindings).not.toHaveBeenCalled();
});
