import { describe, it, expect } from 'vitest';
import { buildApi, SESSION_COOKIE_NAME, type AskApplication } from '../../apps/api/src/index.js';
import type { SessionApplication } from '../../apps/api/src/sessions.js';
import { ConsumerRecoveryProveRequestSchema, PendingOnboardingCompleteRequestSchema, RecoveryEvidenceCompleteRequestSchema } from '@debateai/contract';
const origin = 'https://app.example.test', cap = 'r'.repeat(43), csrf = 'c'.repeat(43), sessionToken = 's'.repeat(43), session = { asker_id: 'owner:22222222-2222-4222-8222-222222222222', session_id: '33333333-3333-4333-8333-333333333333', caller_scope: 'ASKER' as const, ownership_provenance: 'server_session' as const, provisional_identity_model: false as const };
describe('recovery HTTP authority boundary', () => {
    it('proof and evidence endpoints issue no normal cookie; only verified replacement uses normal cookie projection', async () => {
        const api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, sessions: { authenticate: async () => null, verifyCsrf: () => false } as unknown as SessionApplication,
            consumerRecovery: { prove: async () => ({ status: 'RECOVERY_ENROLL_ONLY', available_methods: ['passkey', 'totp'], totp_unavailable_reason: null, recovery_capability: cap, replacement_recovery_code: '01-EXAMPLE-SAVED-CODE', expires_at: '2026-10-05T12:00:00.000Z' }), beginEnrollment: async () => { throw new Error('unused'); }, completeEnrollment: async () => ({ status: 'authenticated', sessionToken, csrfToken: csrf, session }) },
            onboardingEvidence: { status: async () => { throw new Error('unused'); }, complete: async () => { } } });
        try {
            const proof = await api.inject({ method: 'POST', url: '/v1/auth/recovery/prove', headers: { origin }, payload: { token: 'a'.repeat(43), recovery_code: '01-code', method: 'passkey' } });
            expect(proof.statusCode).toBe(200);
            expect(proof.headers['set-cookie']).toBeUndefined();
            expect(proof.json()).not.toHaveProperty('session');
            expect(proof.json()).not.toHaveProperty('csrf_token');
            const evidence = await api.inject({ method: 'POST', url: '/v1/auth/recovery/enrollment/complete-evidence', headers: { origin }, payload: { recovery_capability: cap } });
            expect(evidence.statusCode).toBe(204);
            expect(evidence.headers['set-cookie']).toBeUndefined();
            for (const [method, url] of [['GET', '/v1/account/profile'], ['DELETE', '/v1/account'], ['POST', '/v1/auth/step-up']] as const) {
                const denied = await api.inject({ method, url, headers: { origin, cookie: `${SESSION_COOKIE_NAME}=${cap}`, ...(method === 'GET' ? {} : { 'x-csrf-token': csrf }) }, ...(method === 'GET' ? {} : { payload: {} }) });
                expect(denied.statusCode).toBe(401);
            }
            const done = await api.inject({ method: 'POST', url: '/v1/auth/recovery/enrollment/complete', headers: { origin }, payload: { recovery_capability: cap } });
            expect(done.statusCode).toBe(200);
            expect(done.json()).toEqual({ status: 'authenticated', csrf_token: csrf, session });
            expect(done.body).not.toContain(sessionToken);
            expect(done.headers['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining(`${SESSION_COOKIE_NAME}=${sessionToken}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`)]));
            expect((await api.inject({ method: 'POST', url: '/v1/auth/recovery/prove', headers: { origin: 'https://other.test' }, payload: {} })).statusCode).toBe(403);
        }
        finally {
            await api.close();
        }
    });
    it('requires both proofs and keeps pending proof and recovery capability schemas disjoint', () => {
        expect(ConsumerRecoveryProveRequestSchema.safeParse({ token: cap, method: 'passkey' }).success).toBe(false);
        expect(ConsumerRecoveryProveRequestSchema.safeParse({ recovery_code: '01-code', method: 'totp' }).success).toBe(false);
        const legal = { locale: 'en', terms: { version: '1.0', sha256: 'a'.repeat(64) }, privacy: { version: '1.0', sha256: 'b'.repeat(64) }, terms_accepted: true, privacy_acknowledged: true, adult_affirmed: true };
        expect(PendingOnboardingCompleteRequestSchema.safeParse({ ...legal, enrollment_token: cap }).success).toBe(true);
        expect(PendingOnboardingCompleteRequestSchema.safeParse({ ...legal, recovery_capability: cap }).success).toBe(false);
        expect(RecoveryEvidenceCompleteRequestSchema.safeParse({ ...legal, enrollment_token: cap }).success).toBe(false);
    });
});
