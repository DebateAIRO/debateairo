import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyOidcIdentity } from '../../apps/api/src/social-providers/oidc.js';
const key = generateKeyPairSync('rsa', { modulusLength: 2048 }), other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...key.publicKey.export({ format: 'jwk' }), kid: 'key-one', use: 'sig', alg: 'RS256' };
const now = new Date('2026-10-05T04:00:00.000Z'), seconds = now.getTime() / 1000;
const expected = { provider: 'google' as const, clientId: 'our-client', nonce: 'transaction-nonce', now };
const claims = { iss: 'https://accounts.google.com', aud: 'our-client', sub: 'immutable-subject', iat: seconds - 10, exp: seconds + 300, nonce: 'transaction-nonce', email: 'User@gmail.com', email_verified: true, name: 'A person' };
function jwt(overrides: Record<string, unknown> = {}, header: Record<string, unknown> = {}, signingKey = key.privateKey) {
    const input = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-one', ...header })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ ...claims, ...overrides })).toString('base64url');
    return input + '.' + sign('RSA-SHA256', Buffer.from(input), signingKey).toString('base64url');
}
describe('real signed provider identity assertions', () => {
    it('returns immutable canonical identity and only minimal prefill from a genuinely signed Google token', () => {
        expect(verifyOidcIdentity(jwt({ picture: 'https://ignored.example/avatar', phone_number: '+12025550123' }), { keys: [jwk] }, expected)).toEqual({ provider: 'google', issuer: 'https://accounts.google.com', subject: 'immutable-subject', email: 'user@gmail.com', name: 'A person', emailTrust: 'google-authoritative' });
    });
    it.each([
        [{ iss: 'https://attacker.example' }, {}], [{ aud: 'another-client' }, {}], [{ aud: ['our-client', 'another-client'] }, {}],
        [{ azp: 'another-client' }, {}], [{ nonce: 'other-transaction' }, {}], [{ exp: seconds }, {}], [{ iat: seconds + 61 }, {}],
        [{ sub: '' }, {}], [{}, { alg: 'none' }], [{}, { kid: 'unknown' }], [{}, { jku: 'https://attacker.example/keys' }], [{}, { x5u: 'https://attacker.example/cert' }]
    ])('rejects claim/header substitution %#', (payload, header) => {
        expect(() => verifyOidcIdentity(jwt(payload, header), { keys: [jwk] }, expected)).toThrow('SOCIAL_PROOF_INVALID');
    });
    it('rejects forged signatures and ambiguous or private JWKS entries', () => {
        expect(() => verifyOidcIdentity(jwt({}, {}, other.privateKey), { keys: [jwk] }, expected)).toThrow('SOCIAL_PROOF_INVALID');
        expect(() => verifyOidcIdentity(jwt(), { keys: [jwk, jwk] }, expected)).toThrow('SOCIAL_PROOF_INVALID');
        expect(() => verifyOidcIdentity(jwt(), { keys: [{ ...jwk, d: 'AA' }] }, expected)).toThrow('SOCIAL_PROOF_INVALID');
    });
    it('accepts a correctly rotated key only from the fixed-operation returned JWKS', () => {
        const rotated = { ...other.publicKey.export({ format: 'jwk' }), kid: 'key-two', alg: 'RS256', use: 'sig' };
        expect(verifyOidcIdentity(jwt({}, { kid: 'key-two' }, other.privateKey), { keys: [rotated] }, expected)).toMatchObject({ subject: 'immutable-subject' });
    });
    it.each([
        [{ email: 'user@third-party.test', email_verified: true }, 'local'],
        [{ email: 'user@company.test', email_verified: true, hd: 'company.test' }, 'google-authoritative'],
        [{ email: 'user@company.test', email_verified: false, hd: 'company.test' }, 'local'],
        [{ email: 'user@gmail.com', email_verified: 'true' }, 'local'],
        [{ email: undefined, email_verified: true }, 'local']
    ])('does not treat all verified Google email as current mailbox authority %#', (payload, trust) => {
        expect(verifyOidcIdentity(jwt(payload), { keys: [jwk] }, expected)).toMatchObject({ emailTrust: trust });
    });
    it.each([[true, 'apple-verified'], ['true', 'apple-verified'], [false, 'local'], ['false', 'local'], ['TRUE', 'local']])('normalizes Apple email_verified exactly (%s)', (verified, trust) => {
        expect(verifyOidcIdentity(jwt({ iss: 'https://appleid.apple.com', email: 'hidden@privaterelay.appleid.com', email_verified: verified }), { keys: [jwk] }, { ...expected, provider: 'apple' })).toMatchObject({ issuer: 'https://appleid.apple.com', email: 'hidden@privaterelay.appleid.com', emailTrust: trust });
    });
});
import { SocialProviders, socialAuthorizationUrl, socialConfigurations } from '../../apps/api/src/social-providers/provider.js';
it('uses minimal exact provider URLs, real S256 PKCE and confidential Apple nonce/form_post without fake PKCE', () => {
    for (const provider of ['google', 'apple', 'facebook', 'x']) {
        const c = socialConfigurations(JSON.stringify([{ provider, clientId: 'our-client', appScope: 'scope', access: 'existing-approved' }]), 'https://app.example.test')[0]!;
        const u = new URL(socialAuthorizationUrl(c, 's'.repeat(43), 'n'.repeat(43), 'v'.repeat(43)));
        expect(u.searchParams.get('redirect_uri')).toBe(`https://app.example.test/v1/auth/social/${provider}/callback`);
        expect(u.toString()).not.toMatch(/People|phone|contacts|offline|picture/);
        if (provider === 'apple') {
            expect(u.searchParams.get('response_mode')).toBe('form_post');
            expect(u.searchParams.has('code_challenge')).toBe(false);
            expect(u.searchParams.get('nonce')).toBe('n'.repeat(43));
        }
        if (provider === 'google' || provider === 'x')
            expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    }
});
it('never activates providers from a transport success without matching public configuration and worker custody/access capability', async () => {
    const c = socialConfigurations(JSON.stringify([{ provider: 'google', clientId: 'our-client', appScope: 'scope', access: 'existing-approved' }, { provider: 'facebook', clientId: 'fb', appScope: 'fb', access: 'existing-approved' }]), 'https://app.example.test');
    expect(await new SocialProviders(c).available()).toEqual([]);
    expect(await new SocialProviders(c, { operation: async () => ({ providers: [{ provider: 'google', clientId: 'wrong', appScope: 'scope', callback: c[0]!.callback }] }) }).available()).toEqual([]);
    expect(await new SocialProviders(c, { operation: async () => ({ providers: c.map(p => ({ provider: p.provider, clientId: p.clientId, appScope: p.appScope, callback: p.callback })) }) }).available()).toEqual([c[0]]);
    expect(() => socialConfigurations('[{"provider":"google","clientId":"x","appScope":"x","access":"existing-approved","clientSecret":"must-not-enter-api"}]', 'https://app.example.test')).toThrow();
});
it('bounds unknown-kid refreshes and accepts actual rotation only after the refresh budget opens', async () => {
    let clock = now.getTime(), requests = 0, second = false;
    const c = socialConfigurations(JSON.stringify([{ provider: 'google', clientId: 'our-client', appScope: 'scope', access: 'existing-approved' }]), 'https://app.example.test')[0]!;
    const provider = new SocialProviders([c], { operation: async (p) => {
            if (p.operation === 'google.keys') {
                requests++;
                return { keys: second ? [{ ...other.publicKey.export({ format: 'jwk' }), kid: 'two', alg: 'RS256' }] : [jwk] };
            }
            return { id_token: second ? jwt({}, { kid: 'two' }, other.privateKey) : jwt() };
        } }, () => new Date(clock));
    await provider.verify(c, 'code', 'transaction-nonce', 'v'.repeat(43));
    second = true;
    for (let i = 0; i < 4; i++)
        await expect(provider.verify(c, 'other-code', 'transaction-nonce', 'v'.repeat(43))).rejects.toThrow('SOCIAL_PROOF_INVALID');
    expect(requests).toBe(1);
    clock += 31000;
    expect(await provider.verify(c, 'fresh-code', 'transaction-nonce', 'v'.repeat(43))).toMatchObject({ subject: 'immutable-subject' });
    expect(requests).toBe(2);
});
it('checks Meta app, debug subject, validity, both expiries and scopes, keeping email local-proof only', async () => {
    const c = socialConfigurations(JSON.stringify([{ provider: 'facebook', clientId: 'app', appScope: 'app', access: 'existing-approved' }]), 'https://app.example.test')[0]!;
    const debug = { app_id: 'app', user_id: 'user', is_valid: true, expires_at: seconds + 300, data_access_expires_at: seconds + 300, scopes: ['email', 'public_profile'] }, user = { id: 'user', email: 'profile@example.test', name: 'Person', verified: true };
    const valid = new SocialProviders([c], { operation: async () => ({ debug, user }) }, () => now);
    expect(await valid.verify(c, 'code', 'nonce', 'verifier')).toMatchObject({ subject: 'user', emailTrust: 'local' });
    for (const changed of [{ app_id: 'another-app' }, { user_id: 'another-user' }, { is_valid: false }, { expires_at: seconds }, { data_access_expires_at: seconds }, { scopes: ['email'] }]) {
        const invalid = new SocialProviders([c], { operation: async () => ({ debug: { ...debug, ...changed }, user }) }, () => now);
        await expect(invalid.verify(c, 'code', 'nonce', 'verifier')).rejects.toThrow('SOCIAL_PROOF_INVALID');
    }
});
