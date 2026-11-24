import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { verifyConsumerRegistration, verifyConsumerAuthentication } from '../../apps/api/src/consumer-webauthn-verifier.js';
import { b64, consumerFixture, key, origin, rpId } from '../support/consumerWebAuthnFixtures.js';
const challenge = b64(randomBytes(32));
const expected = { origin, rpId, challengeHash: 'sha256:' + createHash('sha256').update(challenge).digest('hex') };
const stored = (f: ReturnType<typeof consumerFixture>, counter = 0, deviceType: 'multiDevice' | 'singleDevice' = 'multiDevice') => ({ credentialId: f.credentialId, publicKey: b64(f.k.wire), counter, deviceType, backedUp: deviceType === 'multiDevice', userHandle: f.handle });
describe('verified consumer WebAuthn protocol', () => {
    it.each([-7, -257] as const)('verifies independently encoded registration and genuine %s signatures', async (alg) => {
        const f = consumerFixture(key(alg));
        expect(await verifyConsumerRegistration(f.registration(challenge), expected)).toMatchObject({ credentialId: f.credentialId, deviceType: 'multiDevice', backedUp: true, counter: 0 });
        expect(await verifyConsumerAuthentication(f.assertion(challenge), stored(f), expected)).toMatchObject({ counter: 0, deviceType: 'multiDevice' });
    });
    it('checks signed origin, RP, challenge, UV, UP, BE/BS and signature before authority', async () => {
        const f = consumerFixture();
        for (const custom of [{ rpId: 'evil.test' }, { client: f.client('webauthn.get', challenge, { origin: 'https://evil.test' }) },
            { client: f.client('webauthn.get', b64(randomBytes(32))) }, { client: f.client('webauthn.get', challenge, { crossOrigin: true }) }, { client: f.client('webauthn.get', challenge, { topOrigin: origin }) }, { flags: 0x19 }, { flags: 0x1c }, { flags: 0x15 },
            { signature: Buffer.alloc(64) }, { privateKey: key().privateKey }]) {
            await expect(verifyConsumerAuthentication(f.assertion(challenge, custom), stored(f), expected)).rejects.toThrow('CONSUMER_WEBAUTHN_INVALID');
        }
    });
    it('compares returned user handles and ID with the server selected credential owner', async () => {
        const f = consumerFixture(), a = f.assertion(challenge);
        await expect(verifyConsumerAuthentication({ ...a, rawId: 'AQ' }, stored(f), expected)).rejects.toThrow();
        await expect(verifyConsumerAuthentication(f.assertion(challenge, { userHandle: b64(randomBytes(32)) }), stored(f), expected)).rejects.toThrow();
        await expect(verifyConsumerAuthentication(a, { ...stored(f), credentialId: 'AQ' }, expected)).rejects.toThrow();
        const { userHandle: _, ...response } = a.response;
        expect((await verifyConsumerAuthentication({ ...a, response }, stored(f), expected)).counter).toBe(0);
    });
    it('allows verified multiDevice nonincrease/reset, retains device eligibility, and accepts BS changes', async () => {
        const f = consumerFixture();
        for (const counter of [0, 3, 4, 5])
            expect((await verifyConsumerAuthentication(f.assertion(challenge, { counter }), stored(f, 4), expected)).counter).toBe(counter);
        expect((await verifyConsumerAuthentication(f.assertion(challenge, { flags: 0x0d }), stored(f), expected)).backedUp).toBe(false);
        await expect(verifyConsumerAuthentication(f.assertion(challenge, { flags: 5 }), stored(f), expected)).rejects.toThrow();
    });
    it('preserves singleDevice strict monotonic and valid zero/zero behavior', async () => {
        const f = consumerFixture();
        expect((await verifyConsumerAuthentication(f.assertion(challenge, { flags: 5, counter: 0 }), stored(f, 0, 'singleDevice'), expected)).counter).toBe(0);
        for (const counter of [0, 1])
            await expect(verifyConsumerAuthentication(f.assertion(challenge, { flags: 5, counter }), stored(f, 1, 'singleDevice'), expected)).rejects.toThrow();
        expect((await verifyConsumerAuthentication(f.assertion(challenge, { flags: 5, counter: 2 }), stored(f, 1, 'singleDevice'), expected)).counter).toBe(2);
        await expect(verifyConsumerAuthentication(f.assertion(challenge), stored(f, 0, 'singleDevice'), expected)).rejects.toThrow();
    });
    it('rejects registration without UV/UP or with illegal backup flags, ignores convenience fields', async () => {
        const f = consumerFixture();
        for (const flags of [0x59, 0x5c, 0x55])
            await expect(verifyConsumerRegistration(f.registration(challenge, flags), expected)).rejects.toThrow();
        const r = f.registration(challenge);
        expect((await verifyConsumerRegistration({ ...r, response: { ...r.response, publicKey: 'ZmFrZQ', publicKeyAlgorithm: -257, authenticatorData: 'ZmFrZQ' } }, expected)).publicKey).toBe(b64(f.k.wire));
    });
});
import { SessionService } from '../../apps/api/src/sessions.js';
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, SESSION_POLICY_REGISTER_ROW, sessionPolicyFromValue } from '@debateai/register';
it('consumer material retains selected earlier expiry while imposing fourteen/thirty day ceilings', async () => {
    const now = new Date('2026-10-05T00:00:00.000Z'), source = { ip: '192.0.2.1', userAgent: 'test', requestId: 'test' };
    for (const [idle, absolute, expectedIdle, expectedAbsolute] of [[1209600000, 7776000000, 1209600000, 2592000000], [3600000, 7200000, 3600000, 7200000]]) {
        const service = await SessionService.create({ repository: {} as never, riskSignals: {} as never, onRiskSignalFailure: () => undefined, dekStore: {} as never, argon2: {} as never, blindIndexKey: Buffer.alloc(32, 5), dummyPasswordHash: 'fixture', clock: () => now,
            authPolicy: authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), mfaPolicy: mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value), sessionPolicy: sessionPolicyFromValue({ ...SESSION_POLICY_REGISTER_ROW.value, idle_ttl_ms: idle, absolute_ttl_ms: absolute }, SESSION_POLICY_REGISTER_ROW.sourceRef) });
        const producer = service.consumerProducer(), material = producer.prepare(source);
        expect(material.idleExpiresAt.getTime() - now.getTime()).toBe(expectedIdle);
        expect(material.absoluteExpiresAt.getTime() - now.getTime()).toBe(expectedAbsolute);
        expect(material.bindingHash).toBe(producer.bindingHash(source));
        expect(material.sessionBindingContext.user_agent_hash).toBe(material.bindingHash);
    }
});
import { ConsumerWebAuthnService } from '../../apps/api/src/consumer-webauthn.js';
import { hashToken } from '@debateai/crypto';
import type { ConsumerAllowCredential } from '@debateai/db';
describe('a passkey sign-in after the first step names only the bound account\'s own passkeys', () => {
    const source = { ip: '192.0.2.9', userAgent: 'unit', requestId: 'unit' }, continuation = 'c'.repeat(43), binding = 'sha256:' + 'b'.repeat(64);
    const handleHashOf = (handle: string) => 'sha256:' + createHash('sha256').update('consumer-passkey:LOGIN\0' + handle).digest('hex');
    /** The service on a stand-in repository: beginLogin writes nothing, and the list is whatever the database would answer. */
    function harness(list: readonly ConsumerAllowCredential[], refused = false) {
        const begun: Array<Record<string, unknown>> = [], read: Array<[string, string]> = [];
        const unused = async () => { throw new Error('UNUSED'); };
        const repository = {
            beginLogin: async (input: Record<string, unknown>) => {
                begun.push(input);
                if (refused) throw new Error('CONSUMER_AUTH_INVALID');
                return { expiresAt: new Date(Date.now() + 300000).toISOString() };
            },
            readAllowCredentials: async (handleHash: string, bindingHash: string) => { read.push([handleHash, bindingHash]); return list; },
            readChallenge: unused, readCredential: unused, beginEnrollment: unused, completeEnrollment: unused, completeLogin: unused
        };
        const sessions = { admit: async () => ({ retentionKey: 'sha256:' + 'a'.repeat(64), challengeCapacity: 1000, challengesPerScope: 10 }), bindingHash: () => binding, prepare: () => { throw new Error('UNUSED'); }, committed: unused };
        return { service: new ConsumerWebAuthnService(repository as never, sessions as never, { publicAppUrl: origin }), begun, read };
    }
    it('with a continuation, the options carry exactly the ids the database answers for the challenge just written, with their transports', async () => {
        const { service, begun, read } = harness([{ id: 'AQID', transports: ['internal', 'hybrid'] }, { id: 'BAUG', transports: [] }]);
        const response = await service.beginPasskeyLogin({ continuation_token: continuation }, source);
        expect(begun).toHaveLength(1);
        expect(begun[0]!.continuationHash).toBe(hashToken('login-challenge', continuation));
        // Read for the challenge this call wrote, from the same browser, after it was written.
        expect(read).toEqual([[handleHashOf(response.challenge_handle), binding]]);
        expect(begun[0]!.handleHash).toBe(handleHashOf(response.challenge_handle));
        expect(response.options.allowCredentials).toEqual([{ id: 'AQID', type: 'public-key', transports: ['internal', 'hybrid'] }, { id: 'BAUG', type: 'public-key' }]);
        expect(response.options).toMatchObject({ rpId, userVerification: 'required', timeout: 300000 });
    });
    it('without a continuation (the "sign in with a passkey" button), no list is read and none is sent', async () => {
        const { service, read } = harness([{ id: 'AQID', transports: ['internal'] }]);
        for (const input of [{}, undefined]) {
            const response = await service.beginPasskeyLogin(input, source);
            expect(response.options.allowCredentials).toBeUndefined();
            expect(JSON.stringify(response)).not.toContain('allowCredentials');
        }
        expect(read).toEqual([]);
    });
    it('an account with no passkey that could pass gets no list, as before, and the sign-in does not fail', async () => {
        const { service, read } = harness([]);
        const response = await service.beginPasskeyLogin({ continuation_token: continuation }, source);
        expect(read).toHaveLength(1);
        expect(response.options.allowCredentials).toBeUndefined();
        expect(JSON.stringify(response)).not.toContain('allowCredentials');
    });
    it('a list beyond the contract\'s bounds is left out rather than failing the sign-in', async () => {
        const { service } = harness(Array.from({ length: 101 }, (_, index) => ({ id: b64(Buffer.from([index, 1, 2])), transports: ['usb'] })));
        const response = await service.beginPasskeyLogin({ continuation_token: continuation }, source);
        expect(response.options.allowCredentials).toBeUndefined();
        expect(response.challenge_handle).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    });
    it('a refused first step reads no list: the begin fails before it', async () => {
        const { service, begun, read } = harness([{ id: 'AQID', transports: [] }], true);
        await expect(service.beginPasskeyLogin({ continuation_token: continuation }, source)).rejects.toMatchObject({ code: 'AUTH_CREDENTIALS_INVALID' });
        expect(begun).toHaveLength(1);
        expect(read).toEqual([]);
    });
});
