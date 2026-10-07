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
