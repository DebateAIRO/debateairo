import { expect, it } from 'vitest';
import { PasskeyAuthenticationOptionsResponseSchema } from '@debateai/contract';
it('requires server-authoritative options expiration in the public contract', () => {
    const input = { challenge_handle: 'a'.repeat(43), options: { challenge: 'b'.repeat(43), rpId: 'app.example.test', userVerification: 'required' } };
    expect(PasskeyAuthenticationOptionsResponseSchema.safeParse(input).success).toBe(false);
    expect(PasskeyAuthenticationOptionsResponseSchema.safeParse({ ...input, expires_at: '2026-10-05T12:00:00.000Z' }).success).toBe(true);
});
import { describe } from 'vitest';
import { buildApi, SESSION_COOKIE_NAME, CSRF_COOKIE_NAME, type AskApplication } from '../../apps/api/src/index.js';
import type { SessionApplication, AuthenticatedSession } from '../../apps/api/src/sessions.js';
import { CompletePasskeyEnrollmentRequestSchema, StepUpAuthorizationRequestSchema, createContractClient } from '@debateai/contract';
import { consumerFixture, origin } from '../support/consumerWebAuthnFixtures.js';
const bearer = 's'.repeat(43), csrf = 'c'.repeat(43), handle = 'h'.repeat(43);
const session: AuthenticatedSession = { userId: '44444444-4444-4444-8444-444444444444', ownerRef: '22222222-2222-4222-8222-222222222222', tokenHash: 'sha256:' + 'a'.repeat(64), csrfTokenHash: 'sha256:' + 'b'.repeat(64), authKind: 'cookie', session: { asker_id: 'owner:22222222-2222-4222-8222-222222222222', session_id: '33333333-3333-4333-8333-333333333333', caller_scope: 'ASKER', ownership_provenance: 'server_session', provisional_identity_model: false } };
const headers = { origin, cookie: `${SESSION_COOKIE_NAME}=${bearer}; ${CSRF_COOKIE_NAME}=${csrf}`, 'x-csrf-token': csrf };
function harness() {
    const calls: unknown[] = [];
    const authenticated = { status: 'authenticated' as const, sessionToken: bearer, csrfToken: csrf, session: session.session };
    const api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, sessions: { authenticate: async (t: string) => t === bearer ? session : null, verifyCsrf: (_s: AuthenticatedSession, t: string) => t === csrf } as unknown as SessionApplication,
        consumerWebAuthn: {
            beginPasskeyEnrollment: async (input, _source, s) => { calls.push({ input, s }); return { challenge_handle: handle, expires_at: '2026-10-05T12:00:00.000Z', options: { challenge: handle, rp: { id: 'app.example.test', name: 'Dialectical Engine' }, user: { id: handle, name: handle, displayName: 'Account' }, pubKeyCredParams: [{ alg: -7, type: 'public-key' }], authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' }, attestation: 'none' } }; },
            completePasskeyEnrollment: async (input, _source, s) => { calls.push({ input, s }); return s ? { status: 'enrolled' } : authenticated; },
            beginPasskeyLogin: async (input) => { calls.push(input); return { challenge_handle: handle, expires_at: '2026-10-05T12:00:00.000Z', options: { challenge: handle, rpId: 'app.example.test', userVerification: 'required' } }; },
            completePasskeyLogin: async (input) => { calls.push(input); return authenticated; }
        } });
    return { api, calls };
}
describe('consumer ceremony HTTP trust boundary', () => {
    it.each(['/v1/auth/passkeys/enrollment/complete', '/v1/auth/passkeys/login/complete'])('projects existing auth response/cookies without raw bearers at %s', async (url) => {
        const { api } = harness();
        try {
            const response = await api.inject({ method: 'POST', url, headers: { origin }, payload: { challenge_handle: handle, credential: {} } });
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({ status: 'authenticated', csrf_token: csrf, session: session.session });
            expect(response.body).not.toContain(bearer);
            expect(response.body).not.toContain('sessionToken');
            const cookies = response.headers['set-cookie'];
            expect(cookies).toEqual(expect.arrayContaining([expect.stringContaining(`${SESSION_COOKIE_NAME}=${bearer}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`), expect.stringContaining(`${CSRF_COOKIE_NAME}=${csrf}; Path=/; Max-Age=1209600; Secure; SameSite=Lax`)]));
        }
        finally {
            await api.close();
        }
    });
    it('bounds the entire 32 KiB envelope before service work, including overhead outside credential', async () => {
        const { api, calls } = harness();
        try {
            const credential = consumerFixture().registration(handle), payload = { challenge_handle: handle, label: 'key', credential: { ...credential, response: { ...credential.response, publicKey: '' } } };
            payload.credential.response.publicKey = 'A'.repeat(32768 - Buffer.byteLength(JSON.stringify(payload)));
            expect(Buffer.byteLength(JSON.stringify(payload))).toBe(32768);
            expect(CompletePasskeyEnrollmentRequestSchema.safeParse(payload).success).toBe(true);
            expect((await api.inject({ method: 'POST', url: '/v1/auth/passkeys/enrollment/complete', headers: { origin }, payload })).statusCode).toBe(200);
            expect(calls).toHaveLength(1);
            payload.label += 'x';
            expect(Buffer.byteLength(JSON.stringify(payload.credential))).toBeLessThan(32768);
            expect(CompletePasskeyEnrollmentRequestSchema.safeParse(payload).success).toBe(false);
            expect((await api.inject({ method: 'POST', url: '/v1/auth/passkeys/enrollment/complete', headers: { origin }, payload })).statusCode).toBe(413);
            expect(calls).toHaveLength(1);
        }
        finally {
            await api.close();
        }
    });
    it('requires exact origin and current cookie CSRF for active additions, with a distinct enrolled response', async () => {
        const { api, calls } = harness();
        try {
            for (const bad of [{ origin: 'https://evil.test' }, { origin, cookie: headers.cookie }])
                expect((await api.inject({ method: 'POST', url: '/v1/auth/passkeys/enrollment/options', headers: bad, payload: { step_up_grant: handle } })).statusCode).toBe(403);
            expect(calls).toHaveLength(0);
            const response = await api.inject({ method: 'POST', url: '/v1/auth/passkeys/enrollment/complete', headers, payload: { challenge_handle: handle, credential: {} } });
            expect(response.json()).toEqual({ status: 'enrolled' });
            expect(calls[0]).toMatchObject({ s: session });
        }
        finally {
            await api.close();
        }
    });
    it('exposes ADD_PASSKEY through the existing step-up schema and consumer client retains expires_at', async () => {
        expect(StepUpAuthorizationRequestSchema.parse({ action: 'ADD_PASSKEY' })).toEqual({ action: 'ADD_PASSKEY' });
        const { api } = harness();
        try {
            const client = createContractClient(origin, async (input, init) => {
                const response = await api.inject({ method: (init?.method ?? 'GET') as 'POST', url: new URL(input instanceof Request ? input.url : String(input)).pathname, headers: { origin, 'content-type': 'application/json' }, payload: init?.body as string });
                return new Response(response.body, { status: response.statusCode, headers: { 'content-type': 'application/json' } });
            });
            expect((await client.beginPasskeyLogin()).expires_at).toBe('2026-10-05T12:00:00.000Z');
            expect((await client.beginPasskeyEnrollment({ enrollment_token: handle })).options.authenticatorSelection.residentKey).toBe('required');
        }
        finally {
            await api.close();
        }
    });
});
import {vi} from 'vitest';
it('source admission refuses auth-method availability before the metadata producer or provider-capability work',async()=>{const methods=vi.fn().mockResolvedValue({methods:[],recovery_codes_remaining:0,available_step_up_methods:[],step_up_providers:[]}),decide=vi.fn().mockReturnValue({allowed:false,reason:'LIMIT',retryAfterMs:1000,windowMs:60000}),diagnostic=vi.spyOn(console,'error').mockImplementation(()=>undefined);const api=buildApi({application:{} as AskApplication,allowedOrigin:origin,sessions:{authenticate:async()=>session,verifyCsrf:()=>true} as never,consumerSecurity:{authMethods:methods} as never,admission:{decide} as never});try{const response=await api.inject({method:'GET',url:'/v1/account/auth-methods',headers});expect(response.statusCode).toBe(429);expect(response.json()).toEqual({error:'ADMISSION_RATE_LIMITED',message:'ADMISSION_RATE_LIMITED'});expect(methods).not.toHaveBeenCalled();expect(decide).toHaveBeenCalledWith('publicReads',expect.any(String),expect.any(Date));expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('api.admission.refused'));}finally{await api.close();diagnostic.mockRestore();}});
