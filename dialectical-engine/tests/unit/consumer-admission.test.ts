import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SessionService } from '../../apps/api/src/sessions.js';
import { ConsumerWebAuthnService } from '../../apps/api/src/consumer-webauthn.js';
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, SESSION_POLICY_REGISTER_ROW, sessionPolicyFromValue } from '@debateai/register';
import { consumerFixture, origin } from '../support/consumerWebAuthnFixtures.js';
const token = () => randomBytes(32).toString('base64url');
async function fixture(overrides: Record<string, number> = {}) {
    let work = 0, refusals = 0;
    const source = { ip: '192.0.2.50', userAgent: 'test', requestId: 'admission' };
    const sessions = await SessionService.create({ repository: { recordLoginFailure: async () => { refusals++; } } as never, riskSignals: {} as never, onRiskSignalFailure: () => undefined, dekStore: {} as never, argon2: {} as never, blindIndexKey: Buffer.alloc(32, 1), dummyPasswordHash: 'fixture',
        authPolicy: authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), mfaPolicy: { ...mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value), verificationLimits: { ...mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value).verificationLimits, ...overrides } }, sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value, SESSION_POLICY_REGISTER_ROW.sourceRef) });
    const reject = async () => { work++; throw new Error('REPOSITORY_REACHED'); };
    const service = new ConsumerWebAuthnService({ beginLogin: reject, beginEnrollment: reject, readChallenge: reject } as never, sessions.consumerProducer(), { publicAppUrl: origin });
    return { service, sessions, source, get work() { return work; }, get refusals() { return refusals; } };
}
describe('consumer admission before repository and cryptographic work', () => {
    it('shares a source budget across all four methods even as handles and continuations rotate', async () => {
        const f = await fixture({ perEnrollment: 100 }), key = consumerFixture();
        for (let n = 0; n < 28; n++) {
            const h = token();
            const operation = [() => f.service.beginPasskeyLogin({ continuation_token: h }, f.source), () => f.service.beginPasskeyEnrollment({ enrollment_token: h }, f.source),
                () => f.service.completePasskeyLogin({ challenge_handle: h, credential: key.assertion(h) }, f.source), () => f.service.completePasskeyEnrollment({ challenge_handle: h, credential: key.registration(h) }, f.source)][n % 4]!;
            await expect(operation()).rejects.toThrow(n < 20 ? 'REPOSITORY_REACHED' : 'MFA_RATE_LIMITED');
        }
        expect(f.work).toBe(20);
        expect(f.refusals).toBe(1);
    });
    it('enforces the existing per-enrollment budget without a new source and audits refusal once', async () => {
        const f = await fixture(), bearer = token();
        for (let n = 0; n < 8; n++)
            await expect(f.service.beginPasskeyEnrollment({ enrollment_token: bearer }, f.source)).rejects.toThrow(n < 5 ? 'REPOSITORY_REACHED' : 'MFA_RATE_LIMITED');
        expect(f.work).toBe(5);
        expect(f.refusals).toBe(1);
    });
    it('refuses capacity before ceremony work and keeps its refusal audit bounded across new sources', async () => {
        const f = await fixture({ capacity: 2 });
        await expect(f.service.beginPasskeyLogin({}, f.source)).rejects.toThrow('REPOSITORY_REACHED');
        for (let n = 0; n < 8; n++)
            await expect(f.service.beginPasskeyLogin({ continuation_token: token() }, { ...f.source, ip: '192.0.2.' + (60 + n) })).rejects.toThrow('MFA_RATE_LIMITED');
        expect(f.work).toBe(1);
        expect(f.refusals).toBe(1);
    });
});
import { PostgresConsumerAuthRepository } from '@debateai/db';
it('source refusal occurs before the real ceremony repository acquires a pool or hashes audit context', async () => {
    const f = await fixture({ perEnrollment: 100 });
    for (let i = 0; i < 20; i++)
        await f.sessions.consumerProducer().admit('LOGIN_BEGIN', token(), f.source);
    let queries = 0, connections = 0, hashes = 0;
    const pool = { query: async () => { queries++; throw new Error('UNEXPECTED_QUERY'); }, connect: async () => { connections++; throw new Error('UNEXPECTED_CONNECT'); } };
    const audit = { hashSourceIp: async () => { hashes++; return 'a'.repeat(64); }, hashUserAgent: async () => { hashes++; return 'b'.repeat(64); } };
    const service = new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(pool as never, audit as never), f.sessions.consumerProducer(), { publicAppUrl: origin }), key = consumerFixture(), h = token();
    for (const operation of [() => service.beginPasskeyLogin({}, f.source), () => service.beginPasskeyEnrollment({ enrollment_token: h }, f.source),
        () => service.completePasskeyLogin({ challenge_handle: h, credential: key.assertion(h) }, f.source), () => service.completePasskeyEnrollment({ challenge_handle: h, credential: key.registration(h) }, f.source)])
        await expect(operation()).rejects.toThrow('MFA_RATE_LIMITED');
    expect({ queries, connections, hashes }).toEqual({ queries: 0, connections: 0, hashes: 0 });
    expect(f.refusals).toBe(1);
});
