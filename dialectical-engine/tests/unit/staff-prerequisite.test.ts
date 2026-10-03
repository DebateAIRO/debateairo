import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encrypt, generateDek, generateTotpSecret, totpCodeAtStep, type Argon2Executor } from '@debateai/crypto';
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, SESSION_POLICY_REGISTER_ROW, sessionPolicyFromValue } from '@debateai/register';
import { SessionService } from '../../apps/api/src/sessions.js';
import { testHttpIdentity } from '../support/httpSession.js';
const passwordHash = '$argon2id$v=19$m=19456,t=2,p=1$' + Buffer.alloc(16, 1).toString('base64').replace(/=+$/, '') + '$' + Buffer.alloc(32, 2).toString('base64').replace(/=+$/, '');
const source = {ip: '203.0.113.4', userAgent: 'task7-only', requestId: 'task7-prerequisite'};
async function setup(available = true) {
    const base = testHttpIdentity('task7-prerequisite').authenticated, dek = generateDek(), secret = generateTotpSecret(), factorId = randomUUID(), now = new Date();
    const identity = {userId: base.userId, ownerRef: base.ownerRef, passwordHash, factorId, auditToken: randomUUID(),
        lastAcceptedStep: null, secretCiphertext: encrypt(dek, secret, ['identity','mfa_factor.secret_ciphertext',factorId,'run:none',base.userId,`user-dek:${base.userId}`,'1'])};
    const accepted: unknown[] = [], failures: unknown[] = [];
    const repo = { readStepUpIdentity: async () => identity, recordStepUpFailure: async (i: unknown) => {failures.push(i);},
        rotateAfterStepUp: async () => { throw new Error('ORDINARY_ROTATION_CANNOT_PRODUCE_STAFF_RECEIPT'); }};
    const mfaPolicy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);
    const service = await SessionService.create({repository: repo as never, riskSignals: {} as never, onRiskSignalFailure: () => {},
        dekStore: {load: async () => Buffer.from(dek), store: async () => {}, exists: async () => true, destroy: async () => 'ALREADY_ABSENT'},
        argon2: {verifyPassword: async (input: Uint8Array) => Buffer.from(input).toString() === 'fresh-password'} as unknown as Argon2Executor,
        authPolicy: authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), mfaPolicy,
        sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value, SESSION_POLICY_REGISTER_ROW.sourceRef),
        blindIndexKey: Buffer.alloc(32, 4), dummyPasswordHash: passwordHash, clock: () => now,
        ...(available ? {staffPrerequisites: {complete: async (input: unknown) => {accepted.push(input); return {expiresAt: new Date(now.getTime()+300000)};}}} : {})
    } as Parameters<typeof SessionService.create>[0]);
    return {service, base, accepted, failures, code: totpCodeAtStep(secret, Math.floor(now.getTime()/(mfaPolicy.totp.periodSeconds*1000)))};
}
describe('fresh factor prerequisite producer', () => {
    it('produces distinct scoped receipt and rotation only after real password and encrypted TOTP verification', async () => {
        expect(typeof SessionService.prototype.stepUpStaffPrerequisite).toBe('function');
        const f = await setup();
        const result = await f.service.stepUpStaffPrerequisite({session: f.base, password: 'fresh-password', code: f.code, purpose: 'KEY_PREREGISTRATION'},source);
        expect(result.prerequisiteHandle).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(result.sessionToken).not.toBe(result.prerequisiteHandle); expect(result.csrfToken).not.toBe(result.sessionToken);
        expect(result).not.toHaveProperty('staffToken'); expect(result).not.toHaveProperty('grantToken');
        expect(f.accepted).toHaveLength(1);
        expect(Object.keys((f.accepted[0] as {identity: object}).identity).sort()).toEqual(['factorId','ownerRef','passwordHash','userId']);
    });
    it('fails closed without producer or fresh factors, sharing the existing failure audit', async () => {
        expect(typeof SessionService.prototype.stepUpStaffPrerequisite).toBe('function');
        const missing = await setup(false);
        await expect(missing.service.stepUpStaffPrerequisite({session: missing.base,password: 'fresh-password',code: missing.code,purpose: 'KEY_PREREGISTRATION'},source)).rejects.toThrow('STAFF_UNAVAILABLE');
        const f = await setup();
        for (const input of [{password: 'wrong', code: f.code},{password: 'fresh-password',code: '000000'}]) {
            await expect(f.service.stepUpStaffPrerequisite({session: f.base,...input,purpose: 'KEY_PREREGISTRATION'},source)).rejects.toThrow('AUTH_CREDENTIALS_INVALID');
        }
        expect(f.accepted).toHaveLength(0); expect(f.failures).toHaveLength(2);
    });
});
