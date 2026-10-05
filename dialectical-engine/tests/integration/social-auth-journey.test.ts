import { ConsumerSecurityService } from '../../apps/api/src/consumer-security.js';
import { ConsumerRecoveryService } from '../../apps/api/src/consumer-recovery.js';
import { SocialStepUpService } from '../../apps/api/src/social-step-up.js';
import { MfaEnrollmentService } from '../../apps/api/src/mfa.js';
import { consumerSecuritySession } from '../../apps/api/src/consumer-security.js';
import type { AuthenticatedSession } from '../../apps/api/src/sessions.js';
import type { StepUpAuthorizationRequest } from '@debateai/contract';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate, PostgresSocialIdentityRepository, PostgresConsumerAuthRepository, PostgresIdentityRepository, PostgresConsumerSecurityRepository, PostgresSessionRepository, PostgresAccountProfileRepository, PostgresAccountErasureRepository, PostgresConsumerRecoveryRepository, type Pool } from '@debateai/db';
import { Argon2WorkerPool, createEmailBlindIndex, hashPassword, hashToken, decrypt, decodeBase32, totpCodeAtStep, type AuditContextHasher } from '@debateai/crypto';
import { AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, SESSION_POLICY_DEPLOYMENT_REGISTER_ROW, sessionPolicyFromValue, CONSUMER_RECOVERY_POLICY_REGISTER_ROW, consumerRecoveryPolicyFromValue } from '@debateai/register';
import { currentDocument } from '@debateai/legal-manifest';
import { RegistrationService, InProcessAuthRateLimiter } from '../../apps/api/src/registration.js';
import { SessionService } from '../../apps/api/src/sessions.js';
import { SocialAuthService } from '../../apps/api/src/social-auth.js';
import { SocialProviders, socialConfigurations } from '../../apps/api/src/social-providers/provider.js';
import { socialHash } from '../../apps/api/src/social-providers/hashes.js';
import { ConsumerWebAuthnService } from '../../apps/api/src/consumer-webauthn.js';
import { consumerFixture, origin } from '../support/consumerWebAuthnFixtures.js';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
let db: TestDatabase, runtime: Pool, registrationRuntime: Pool, erasureRuntime: Pool, argon2: Argon2WorkerPool, dummy: string;
const audit = { hashSourceIp: async () => 'ab'.repeat(32), hashUserAgent: async () => 'cd'.repeat(32) } as unknown as AuditContextHasher;
const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS), mfaPolicy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value), blindKey = Buffer.alloc(32, 7), recordsKey = Buffer.alloc(32, 9);
const key = generateKeyPairSync('rsa', { modulusLength: 2048 }), jwk = { ...key.publicKey.export({ format: 'jwk' }), kid: 'journey-key', alg: 'RS256', use: 'sig' };
const configurations = socialConfigurations(JSON.stringify([{ provider: 'google', clientId: 'journey-client', appScope: 'journey-client', access: 'existing-approved' }]), origin);
const terms = currentDocument('TERMS', 'en')!, privacy = currentDocument('PRIVACY', 'en')!;
let sequence = 0;
beforeAll(async () => {
    db = await startTestDatabase();
    await migrate(db.pool);
    await db.pool.query("CREATE ROLE social_journey LOGIN PASSWORD 'journey-test-only' IN ROLE debateai_authorization_runtime");
    await db.pool.query("CREATE ROLE social_registration LOGIN PASSWORD 'journey-test-only' IN ROLE debateai_runtime");
    await db.pool.query("CREATE ROLE social_erasure LOGIN PASSWORD 'journey-test-only' IN ROLE debateai_erasure_runtime");
    const url = new URL(db.connectionString);
    url.username = 'social_journey';
    url.password = 'journey-test-only';
    runtime = createPool(url.toString());
    url.username = 'social_registration';
    registrationRuntime = createPool(url.toString());
    url.username = 'social_erasure';
    erasureRuntime = createPool(url.toString());
    argon2 = new Argon2WorkerPool({ workers: 1 });
    await argon2.ready();
    dummy = await hashPassword(argon2, 'Strong dummy password 123!', authPolicy.password.argon2id);
}, 120000);
afterAll(async () => { await argon2?.close(); await runtime?.end(); await registrationRuntime?.end(); await erasureRuntime?.end(); await db?.stop(); });
async function harness() {
    const keys = new Map<string, Buffer>(), sent: {
        token: string;
        recipient: string;
    }[] = [];
    const users = { store: async (id: string, key: Buffer) => { keys.set(id, Buffer.from(key)); }, load: async (id: string) => { const key = keys.get(id); if (!key)
            throw new Error('MISSING_TEST_DEK'); return Buffer.from(key); } };
    const source = { ip: `198.51.100.${++sequence}`, userAgent: 'social-journey', requestId: randomUUID(), countryCode: 'RO' };
    let assertion = { sub: randomUUID(), nonce: '', email: `person-${sequence}@gmail.com`, email_verified: true };
    let enabled = true;
    const providers = new SocialProviders(configurations, { operation: async (p) => {
            if (p.operation === 'capabilities')
                return { providers: enabled ? configurations.map(c => ({ provider: c.provider, clientId: c.clientId, appScope: c.appScope, callback: c.callback })) : [] };
            if (p.operation === 'google.keys')
                return { keys: [jwk] };
            if (p.operation === 'google.exchange') {
                const now = Math.floor(Date.now() / 1000), content = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'journey-client', iat: now - 1, exp: now + 300, ...assertion })).toString('base64url');
                return { id_token: content + '.' + sign('RSA-SHA256', Buffer.from(content), key.privateKey).toString('base64url') };
            }
            throw new Error('UNEXPECTED_EXTERNAL_OPERATION');
        } });
    const sessions = await SessionService.create({ repository: new PostgresSessionRepository(runtime, audit), riskSignals: { recordForSession: async () => 'recorded' } as never, onRiskSignalFailure: () => { }, dekStore: users as never, argon2, authPolicy, mfaPolicy, sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef), blindIndexKey: blindKey, dummyPasswordHash: dummy, socialProviderBindings: async () => (await providers.available()).map(c => c.configuration) });
    const repository = new PostgresSocialIdentityRepository(runtime, audit);
    const registration = new RegistrationService({ repository: new PostgresIdentityRepository(registrationRuntime, audit), socialRepository: repository, mail: { sendVerification: async (m: {
                token: string;
                recipient: string;
            }) => { sent.push(m); } } as never, dekStore: users as never, blindIndexKey: blindKey, policy: authPolicy, limiter: new InProcessAuthRateLimiter(authPolicy.rateLimits, 1024, authPolicy.rateLimitRefusalAuditIntervalMs), argon2, legalAcceptance: { recordsKey }, sleep: async () => { } });
    const social = new SocialAuthService(repository, providers, sessions.consumerProducer(), { registration, security: new PostgresConsumerSecurityRepository(runtime, audit), authPolicy, blindIndexKey: blindKey });
    const passkeys = new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(runtime, audit), sessions.consumerProducer(), { publicAppUrl: origin });
    const mfa = new MfaEnrollmentService({ repository: new PostgresIdentityRepository(registrationRuntime, audit), consumerRepository: new PostgresConsumerAuthRepository(runtime, audit), sessions: sessions.consumerProducer(), dekStore: users as never, policy: mfaPolicy, argon2 });
    const stepUp = new SocialStepUpService(repository, providers, sessions.consumerProducer(), { publicAppUrl: origin, users: users as never, argon2, mfaPolicy });
    const security = new ConsumerSecurityService(new PostgresConsumerSecurityRepository(runtime, audit), sessions.consumerProducer(), { publicAppUrl: origin, argon2, mfaPolicy, authPolicy });
    const recovery = new ConsumerRecoveryService(new PostgresConsumerRecoveryRepository(runtime, audit), sessions.consumerProducer(), { publicAppUrl: origin, users: users as never, argon2, mfaPolicy, authPolicy, policy: consumerRecoveryPolicyFromValue(CONSUMER_RECOVERY_POLICY_REGISTER_ROW.value, CONSUMER_RECOVERY_POLICY_REGISTER_ROW.sourceRef), blindIndexKey: blindKey, mail: { sendRecovery: async (m) => { sent.push(m); } }, onMailFailure: () => { throw new Error('UNEXPECTED_MAIL_FAILURE'); } });
    const callback = async (extra: Record<string, unknown> = {}, session?: AuthenticatedSession, authorization?: StepUpAuthorizationRequest, beforeCallback?: () => Promise<void>) => {
        const begin = session && authorization ? await social.beginStepUp('google', { authorization }, source, session) : await social.begin('google', {}, source), authorizationUrl = new URL(begin.authorization_url);
        assertion = { ...assertion, nonce: authorizationUrl.searchParams.get('nonce')!, ...extra };
        await beforeCallback?.();
        return social.callback('google', { state: authorizationUrl.searchParams.get('state'), code: 'one-use-code' }, begin.flowCookie, source);
    };
    const finishFlow=async(begin:{authorization_url:string;flowCookie:string},extra:Record<string,unknown>={},metadata:Record<string,string>={})=>{const url=new URL(begin.authorization_url);assertion={...assertion,nonce:url.searchParams.get('nonce')!,...extra};return social.callback('google',{state:url.searchParams.get('state'),code:'link-code',...metadata},begin.flowCookie,source);};
    const signup = async (email?: string) => {
        const cb = await callback(), bound = { ...source, socialBrowserHash: socialHash('browser', cb.browserCookie), legal: { terms, privacy, locale: 'en' as const } };
        const input = { continuation_token: cb.token, email: email ?? assertion.email, phone: '+40212345678', date_of_birth: '1990-01-01', terms, privacy, locale: 'en', ui_locale: 'en', time_zone: 'Europe/Bucharest', turnstile_token: 'isolated-test-proof' };
        const admission = await registration.admitSource({ route: 'social', input: { email: input.email, phone: input.phone, adultAffirmed: true }, source: bound });
        return { cb, bound, input, result: await social.completeSignup(input, bound, admission) };
    };
    return { social, repository, security, recovery, finishFlow, stepUp, mfa, sessions, registration, passkeys, callback, signup, source, sent, users, disable: () => { enabled = false; } };
}
describe('actual signed-provider and restricted-database journeys', () => {
    it('creates a NULL-password encrypted-phone account from a signed authoritative subject, then requires one genuine UV method', async () => {
        const h = await harness();
        try {
            const signup = await h.signup();
            expect(signup.result).toHaveProperty('status', 'mfa_required');
            if (!('status' in signup.result))
                throw new Error('EXPECTED_ENROLLMENT');
            const row = (await db.pool.query('SELECT * FROM identity."user" WHERE email_blind_index=$1', [createEmailBlindIndex(blindKey, signup.input.email)])).rows[0];
            expect(row.password_hash).toBeNull();
            expect(row.state).toBe('pending_mfa');
            expect(h.sent).toHaveLength(0);
            const dek = await h.users.load(row.user_id);
            const phone = decrypt(dek, row.phone_ciphertext, ['identity', 'user.phone_ciphertext', row.user_id, 'run:none', row.user_id, `user-dek:${row.user_id}`, '1']);
            expect(phone.toString()).toBe('+40212345678');
            phone.fill(0);
            dek.fill(0);
            expect(row.phone_source).toBe('manual');
            expect(row.phone_verification_status).toBe('unverified');
            await expect(h.passkeys.beginPasskeyEnrollment({ enrollment_token: signup.result.enrollment_token }, { ...signup.bound, socialBrowserHash: socialHash('browser', 'a'.repeat(43)) })).rejects.toThrow();
            const options = await h.passkeys.beginPasskeyEnrollment({ enrollment_token: signup.result.enrollment_token }, signup.bound), authenticator = consumerFixture();
            const session = await h.passkeys.completePasskeyEnrollment({ challenge_handle: options.challenge_handle, credential: authenticator.registration(options.options.challenge) }, signup.bound);
            expect(session.status).toBe('authenticated');
            expect((await db.pool.query('SELECT count(*)::int n FROM identity.session WHERE user_id=$1', [row.user_id])).rows[0].n).toBe(1);
            const again = await h.callback({ email: 'changed@third-party.test' });
            expect(again.status).toBe('mfa_required');
            const source = { ...h.source, socialBrowserHash: socialHash('browser', again.browserCookie) }, login = await h.passkeys.beginPasskeyLogin({ continuation_token: again.token }, source);
            const completed = await h.passkeys.completePasskeyLogin({ challenge_handle: login.challenge_handle, credential: authenticator.assertion(login.options.challenge, { userHandle: options.options.user.id }) }, source);
            expect(completed.status).toBe('authenticated');
            expect((await db.pool.query('SELECT email_blind_index FROM identity."user" WHERE user_id=$1', [row.user_id])).rows[0].email_blind_index).toEqual(createEmailBlindIndex(blindKey, signup.input.email));
            await expect(h.passkeys.completePasskeyLogin({ challenge_handle: login.challenge_handle, credential: authenticator.assertion(login.options.challenge, { userHandle: options.options.user.id }) }, source)).rejects.toThrow();
        }
        finally {
            await h.registration.drainMailDispatches();
        }
    });
    it('requires local mail for an edited signed address and never turns an existing-email collision into linking', async () => {
        const h = await harness();
        try {
            const first = await h.signup('edited@example.test');
            expect(first.result).not.toHaveProperty('enrollment_token');
            await h.registration.drainMailDispatches();
            expect(h.sent).toHaveLength(1);
            expect(h.sent[0]!.recipient).toBe('edited@example.test');
            const row = (await db.pool.query('SELECT user_id,state FROM identity."user" WHERE email_blind_index=$1', [createEmailBlindIndex(blindKey, 'edited@example.test')])).rows[0];
            expect(row.state).toBe('pending_verification');
            const second = await harness();
            try {
                const collision = await second.signup('edited@example.test');
                expect(collision.result).not.toHaveProperty('enrollment_token');
                await second.registration.drainMailDispatches();
                expect(second.sent).toHaveLength(0);
                expect((await db.pool.query('SELECT count(*)::int n FROM identity.social_identity WHERE user_id=$1', [row.user_id])).rows[0].n).toBe(1);
            }
            finally {
                await second.registration.drainMailDispatches();
            }
        }
        finally {
            await h.registration.drainMailDispatches();
        }
    });
    it.each(['ADD_PASSKEY', 'READ_PHONE_PROFILE', 'DELETE_ACCOUNT'] as const)('lets a provider-only TOTP account authorize exactly %s on its current session', async (action) => {
        const h = await harness();
        try {
            const signup = await h.signup();
            if (!('status' in signup.result))
                throw new Error('EXPECTED_ENROLLMENT');
            const options = await h.mfa.beginTotp({ enrollmentToken: signup.result.enrollment_token }, signup.bound), secret = decodeBase32(options.secret), step = Math.floor(Date.now() / 30000);
            const logged = await h.mfa.verifyTotp({ enrollmentToken: signup.result.enrollment_token, code: totpCodeAtStep(secret, step) }, signup.bound);
            if (logged.status !== 'authenticated')
                throw new Error('EXPECTED_SESSION');
            const session = (await h.sessions.authenticate(logged.sessionToken, h.source))!;
            const callback = await h.callback({}, session, { action });
            expect(callback.status).toBe('provider_step_up_required');
            const source = { ...h.source, socialBrowserHash: socialHash('browser', callback.browserCookie) };
            const status = await h.stepUp.status({ continuation_token: callback.token }, session, source);
            expect(status.authorization).toEqual({ action });
            await expect(h.sessions.completeLogin({ challengeToken: callback.token, code: totpCodeAtStep(secret, step + 1) }, source)).rejects.toThrow();
            await expect(h.stepUp.complete({ continuation_token: callback.token, code: totpCodeAtStep(secret, step + 1), authorization: { action: 'LINK_PROVIDER', target_provider: 'google' } }, session, source)).rejects.toThrow();
            const before = (await db.pool.query('SELECT count(*)::int n FROM identity.session WHERE user_id=$1', [session.userId])).rows[0].n;
            const completed = await h.stepUp.complete({ continuation_token: callback.token, code: totpCodeAtStep(secret, step + 1) }, session, source);
            secret.fill(0);
            expect(completed.response.step_up_grant).toMatchObject({ action, expires_at: status.expires_at });
            expect((await db.pool.query('SELECT count(*)::int n FROM identity.session WHERE user_id=$1', [session.userId])).rows[0].n).toBe(before);
            expect(await h.sessions.authenticate(logged.sessionToken, h.source)).toBeNull();
            const current = (await h.sessions.authenticate(completed.sessionToken, h.source))!;
            expect(current.session.session_id).toBe(session.session.session_id);
            await expect(h.stepUp.complete({ continuation_token: callback.token, code: '123456' }, current, source)).rejects.toThrow();
            const grant = completed.response.step_up_grant!;
            if (action === 'ADD_PASSKEY') {
                const enrollment = await h.passkeys.beginPasskeyEnrollment({ step_up_grant: grant.token }, source, current), fresh = consumerFixture();
                expect(await h.passkeys.completePasskeyEnrollment({ challenge_handle: enrollment.challenge_handle, credential: fresh.registration(enrollment.options.challenge) }, source, current)).toEqual({ status: 'enrolled' });
            }
            else if (action === 'READ_PHONE_PROFILE') {
                const profile = new PostgresAccountProfileRepository(runtime, audit);
                expect(await profile.use(consumerSecuritySession(current), { action: 'READ_PHONE_PROFILE', grantTokenHash: hashToken('step-up-grant', grant.token) }, source)).not.toBeNull();
                expect(await profile.use(consumerSecuritySession(current), { action: 'READ_PHONE_PROFILE', grantTokenHash: hashToken('step-up-grant', grant.token) }, source)).toBeNull();
            }
            else {
                const row = (await db.pool.query('SELECT action,target_account_id,issuing_session_token_hash FROM identity.step_up_grant WHERE token_hash=$1', [hashToken('step-up-grant', grant.token)])).rows[0];
                expect(row).toEqual({ action: 'DELETE_ACCOUNT', target_account_id: session.userId, issuing_session_token_hash: current.tokenHash });
                const erasure = new PostgresAccountErasureRepository(erasureRuntime, audit);
                const scheduled=await erasure.schedule({ userId: current.userId, ownerRef: current.ownerRef, sessionId: current.session.session_id, grantTokenHash: hashToken('step-up-grant', grant.token) });
                expect(scheduled).toHaveProperty('status','SCHEDULED');
                // Scheduling preserves the existing sign-in path for cancellation;
                // PREPARE is the canonical transition that freezes ordinary auth.
                expect((await h.callback()).status).toBe('mfa_required');
                await db.pool.query("UPDATE identity.account_erasure_request SET requested_at=clock_timestamp()-interval '2 seconds',execute_at=clock_timestamp()-interval '1 second' WHERE erasure_id=$1",[scheduled!.erasureId]);
                expect(await erasure.prepare(scheduled!.erasureId,[],[],[])).toBe('PREPARED');
                await expect(h.callback()).rejects.toThrow();
            }
        }
        finally {
            await h.registration.drainMailDispatches();
        }
    });
    it('serializes unlink and last-passkey removal and refuses disabled providers as replacement paths', async () => {
        const h = await harness();
        try {
            const signup = await h.signup();
            if (!('status' in signup.result))
                throw new Error('EXPECTED_ENROLLMENT');
            const options = await h.mfa.beginTotp({ enrollmentToken: signup.result.enrollment_token }, signup.bound), secret = decodeBase32(options.secret);
            const authenticated = await h.mfa.verifyTotp({ enrollmentToken: signup.result.enrollment_token, code: totpCodeAtStep(secret, Math.floor(Date.now() / 30000)) }, signup.bound);
            secret.fill(0);
            if (authenticated.status !== 'authenticated')
                throw new Error('EXPECTED_SESSION');
            const session = (await h.sessions.authenticate(authenticated.sessionToken, h.source))!, profile = consumerSecuritySession(session), factor = randomUUID(), key = consumerFixture();
            await db.pool.query('INSERT INTO identity.consumer_passkey_subject(user_id,user_handle) VALUES($1,$2)', [session.userId, key.handle]);
            await db.pool.query("INSERT INTO identity.consumer_passkey_credential(consumer_credential_id,user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin) VALUES($1,$2,$3,$4,0,'multiDevice',true,'app.example.test',$5)", [factor, session.userId, key.credentialId, Buffer.from(key.k.wire).toString('base64url'), origin]);
            const issue = async (action: string, provider: string | null, factorId: string | null) => { const token = randomUUID(); const digest = 'sha256:' + Buffer.from(token).toString('hex').padEnd(64, '0').slice(0, 64); await db.pool.query("INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_account_id,target_factor_id,target_provider,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$4,$6,$7,statement_timestamp(),statement_timestamp()+interval '5 minutes')", [randomUUID(), digest, profile.sessionId, profile.userId, action, factorId, provider]); return digest; };
            const security = new PostgresConsumerSecurityRepository(runtime, audit), password = { passwordHashSnapshot: null, passwordUsable: false, admittedProviders: [configurations[0]!.configuration] };
            const removed = await issue('REMOVE_AUTH_METHOD', null, factor), unlinked = await issue('UNLINK_PROVIDER', 'google', null);
            await expect(security.removeAuthMethod(profile, factor, removed, { ...password, admittedProviders: [] }, h.source)).rejects.toThrow('CONSUMER_LAST_METHOD');
            const results = await Promise.allSettled([security.removeAuthMethod(profile, factor, removed, password, h.source), h.repository.unlink(profile, 'google', unlinked, password, password.admittedProviders, h.source)]);
            expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
            expect((await db.pool.query('SELECT (SELECT count(*) FROM identity.consumer_passkey_credential WHERE user_id=$1 AND revoked_at IS NULL)+(SELECT count(*) FROM identity.social_identity WHERE user_id=$1 AND revoked_at IS NULL) n', [session.userId])).rows[0].n).toBe('1');
        }
        finally {
            await h.registration.drainMailDispatches();
        }
    });
    it.each(['rotation', 'hold', 'expiry', 'substitution', 'staff'] as const)('refuses provider step-up %s before granting authority', async (refusal) => {
        const h = await harness();
        try {
            const signup = await h.signup();
            if (!('status' in signup.result))
                throw new Error('EXPECTED_ENROLLMENT');
            const key = consumerFixture(), options = await h.passkeys.beginPasskeyEnrollment({ enrollment_token: signup.result.enrollment_token }, signup.bound), login = await h.passkeys.completePasskeyEnrollment({ challenge_handle: options.challenge_handle, credential: key.registration(options.options.challenge) }, signup.bound);
            if (login.status !== 'authenticated')
                throw new Error('EXPECTED_SESSION');
            const session = (await h.sessions.authenticate(login.sessionToken, h.source))!;
            await expect(h.callback(refusal === 'substitution' ? { sub: randomUUID() } : {}, session, { action: 'READ_PHONE_PROFILE' }, async () => {
                if (refusal === 'rotation')
                    await db.pool.query('UPDATE identity.session SET token_hash=$1 WHERE session_id=$2', [hashToken('session', 'r'.repeat(43)), session.session.session_id]);
                if (refusal === 'hold')
                    await db.pool.query('INSERT INTO identity.account_security_hold(user_id,held) VALUES($1,true)', [session.userId]);
                if (refusal === 'staff')
                    await db.pool.query('INSERT INTO staff.subject(user_id) VALUES($1)', [session.userId]);
                if (refusal === 'expiry')
                    await db.pool.query("UPDATE identity.social_flow SET created_at=clock_timestamp()-interval '6 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE user_id=$1", [session.userId]);
            })).rejects.toThrow();
            expect((await db.pool.query('SELECT count(*)::int n FROM identity.step_up_grant WHERE user_id=$1', [session.userId])).rows[0].n).toBe(0);
        }
        finally {
            await h.registration.drainMailDispatches();
        }
    });
    it('rolls back provider step-up token/code/grant changes when immutable audit insertion fails', async () => {
        const h = await harness();
        try {
            const signup = await h.signup();
            if (!('status' in signup.result))
                throw new Error('EXPECTED_ENROLLMENT');
            const options = await h.mfa.beginTotp({ enrollmentToken: signup.result.enrollment_token }, signup.bound), secret = decodeBase32(options.secret), step = Math.floor(Date.now() / 30000), logged = await h.mfa.verifyTotp({ enrollmentToken: signup.result.enrollment_token, code: totpCodeAtStep(secret, step) }, signup.bound);
            if (logged.status !== 'authenticated')
                throw new Error('EXPECTED_SESSION');
            const session = (await h.sessions.authenticate(logged.sessionToken, h.source))!, cb = await h.callback({}, session, { action: 'READ_PHONE_PROFILE' }), source = { ...h.source, socialBrowserHash: socialHash('browser', cb.browserCookie) }, input = { continuation_token: cb.token, code: totpCodeAtStep(secret, step + 1) };
            secret.fill(0);
            await db.pool.query("CREATE FUNCTION identity.social_test_audit_rejection() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.event_type='identity.consumer_security.STEP_UP' THEN RAISE EXCEPTION 'SOCIAL_TEST_AUDIT_REJECTION';END IF;RETURN NEW;END$$");
            await db.pool.query('CREATE TRIGGER social_test_audit_rejection BEFORE INSERT ON identity.audit_event FOR EACH ROW EXECUTE FUNCTION identity.social_test_audit_rejection()');
            try {
                await expect(h.stepUp.complete(input, session, source)).rejects.toThrow('SOCIAL_TEST_AUDIT_REJECTION');
            }
            finally {
                await db.pool.query('DROP TRIGGER social_test_audit_rejection ON identity.audit_event');
                await db.pool.query('DROP FUNCTION identity.social_test_audit_rejection()');
            }
            expect((await db.pool.query('SELECT token_hash FROM identity.session WHERE session_id=$1', [session.session.session_id])).rows[0].token_hash).toBe(session.tokenHash);
            expect((await db.pool.query('SELECT consumed_at FROM identity.social_flow WHERE proof_hash=$1', [socialHash('step-up', cb.token)])).rows[0].consumed_at).toBeNull();
            expect((await h.stepUp.complete(input, session, source)).response.step_up_grant?.action).toBe('READ_PHONE_PROFILE');
        }
        finally {
            await h.registration.drainMailDispatches();
        }
    });
    it('binds provider step-up to a genuine UV assertion, rejects switched ceremonies, and replaces saved codes without making them permanent paths', async () => {
        const h = await harness();
        try {
            const signup = await h.signup();
            if (!('status' in signup.result))
                throw new Error('EXPECTED_ENROLLMENT');
            const key = consumerFixture(), enroll = await h.passkeys.beginPasskeyEnrollment({ enrollment_token: signup.result.enrollment_token }, signup.bound), login = await h.passkeys.completePasskeyEnrollment({ challenge_handle: enroll.challenge_handle, credential: key.registration(enroll.options.challenge) }, signup.bound);
            if (login.status !== 'authenticated')
                throw new Error('EXPECTED_SESSION');
            let session = (await h.sessions.authenticate(login.sessionToken, h.source))!;
            const cb = await h.callback({}, session, { action: 'REGENERATE_RECOVERY_CODES' }), source = { ...h.source, socialBrowserHash: socialHash('browser', cb.browserCookie) }, one = await h.stepUp.beginPasskey({ continuation_token: cb.token }, session, source), two = await h.stepUp.beginPasskey({ continuation_token: cb.token }, session, source);
            expect(two.expires_at).toBe(one.expires_at);
            await expect(h.stepUp.complete({ continuation_token: cb.token, challenge_handle: one.challenge_handle, credential: key.assertion(one.options.challenge, { userHandle: enroll.options.user.id }) }, session, source)).rejects.toThrow();
            const result = await h.stepUp.complete({ continuation_token: cb.token, challenge_handle: two.challenge_handle, credential: key.assertion(two.options.challenge, { userHandle: enroll.options.user.id }) }, session, source);
            session = (await h.sessions.authenticate(result.sessionToken, h.source))!;
            const codes = await h.security.regenerateRecoveryCodes({ step_up_grant: result.response.step_up_grant!.token }, session, h.source);
            expect(codes.codes).toHaveLength(10);
            const second = await h.callback({}, session, { action: 'READ_PHONE_PROFILE' }), bound = { ...h.source, socialBrowserHash: socialHash('browser', second.browserCookie) };
            const completed = await h.stepUp.complete({ continuation_token: second.token, code: codes.codes[0] }, session, bound);
            expect(completed.response.replacement_recovery_code).toBeTruthy();
            expect(completed.response.replacement_recovery_code).not.toBe(codes.codes[0]);
            expect((await db.pool.query('SELECT count(*)::int n FROM identity.recovery_code WHERE user_id=$1 AND consumed_at IS NOT NULL', [session.userId])).rows[0].n).toBe(1);
        }
        finally {
            await h.registration.drainMailDispatches();
        }
    });
    it('keeps NULL-password recovery passkey-only and revokes old provider links before returning the replacement session', async () => {
        const h = await harness();
        try {
            const signup = await h.signup();
            if (!('status' in signup.result))
                throw new Error('EXPECTED_ENROLLMENT');
            const options = await h.mfa.beginTotp({ enrollmentToken: signup.result.enrollment_token }, signup.bound), secret = decodeBase32(options.secret), step = Math.floor(Date.now() / 30000), login = await h.mfa.verifyTotp({ enrollmentToken: signup.result.enrollment_token, code: totpCodeAtStep(secret, step) }, signup.bound);
            if (login.status !== 'authenticated')
                throw new Error('EXPECTED_SESSION');
            let session = (await h.sessions.authenticate(login.sessionToken, h.source))!;
            const cb = await h.callback({}, session, { action: 'REGENERATE_RECOVERY_CODES' }), bound = { ...h.source, socialBrowserHash: socialHash('browser', cb.browserCookie) }, grant = await h.stepUp.complete({ continuation_token: cb.token, code: totpCodeAtStep(secret, step + 1) }, session, bound);
            secret.fill(0);
            session = (await h.sessions.authenticate(grant.sessionToken, h.source))!;
            const codes = await h.security.regenerateRecoveryCodes({ step_up_grant: grant.response.step_up_grant!.token }, session, h.source);
            await h.registration.dispatchRecoveryMail(() => h.recovery.prepareStart({ email: signup.input.email }, h.source));
            await h.registration.drainMailDispatches();
            const mail = h.sent.at(-1)!;
            expect(mail.recipient).toBe(signup.input.email);
            const proof = await h.recovery.prove({ token: mail.token, recovery_code: codes.codes[0], method: 'passkey' }, h.source);
            expect(proof.available_methods).toEqual(['passkey']);
            expect(proof.totp_unavailable_reason).toBe('PASSWORD_UNAVAILABLE');
            await expect(h.recovery.beginEnrollment({ recovery_capability: proof.recovery_capability, method: 'totp' }, h.source)).rejects.toThrow();
            await expect(h.callback()).rejects.toThrow();
            const replacement = await h.recovery.beginEnrollment({ recovery_capability: proof.recovery_capability, method: 'passkey' }, h.source);
            if (replacement.method !== 'passkey')
                throw new Error('EXPECTED_PASSKEY');
            const fresh = consumerFixture();
            expect((await h.recovery.completeEnrollment({ recovery_capability: proof.recovery_capability, challenge_handle: replacement.challenge_handle, credential: fresh.registration(replacement.options.challenge) }, h.source)).status).toBe('authenticated');
            expect((await db.pool.query('SELECT count(*)::int n FROM identity.social_identity WHERE user_id=$1 AND revoked_at IS NULL', [session.userId])).rows[0].n).toBe(0);
            expect((await db.pool.query('SELECT active FROM identity.consumer_recovery_gate WHERE user_id=$1', [session.userId])).rows[0].active).toBe(false);
            await expect(h.callback()).rejects.toThrow();
        }
        finally {
            await h.registration.drainMailDispatches();
        }
    });
    it('completes provider-first TOTP through the ordinary session producer and refuses browser substitution and replay', async () => {
        const h = await harness();
        try {
            const signup = await h.signup();
            if (!('status' in signup.result))
                throw new Error('EXPECTED_ENROLLMENT');
            const options = await h.mfa.beginTotp({ enrollmentToken: signup.result.enrollment_token }, signup.bound), secret = decodeBase32(options.secret), step = Math.floor(Date.now() / 30000);
            await h.mfa.verifyTotp({ enrollmentToken: signup.result.enrollment_token, code: totpCodeAtStep(secret, step - 1) }, signup.bound);
            const cb = await h.callback(), source = { ...h.source, socialBrowserHash: socialHash('browser', cb.browserCookie) }, input = { challengeToken: cb.token, code: totpCodeAtStep(secret, step) };
            secret.fill(0);
            await expect(h.sessions.completeLogin(input, { ...source, socialBrowserHash: socialHash('browser', 'b'.repeat(43)) })).rejects.toThrow('AUTH_CREDENTIALS_INVALID');
            const logged = await h.sessions.completeLogin(input, source);
            expect(logged.status).toBe('authenticated');
            expect(await h.sessions.authenticate(logged.sessionToken, source)).not.toBeNull();
            await expect(h.sessions.completeLogin(input, source)).rejects.toThrow();
        }
        finally {
            await h.registration.drainMailDispatches();
        }
    });
    it.each([null,'malformed'])('resumes expired provider enrollment via mail and UV when provider and password path %s are unavailable', async (passwordState) => {
        const h = await harness();
        try {
            const signup = await h.signup();
            if (!('status' in signup.result))
                throw new Error('EXPECTED_ENROLLMENT');
            await db.pool.query("UPDATE identity.social_enrollment SET created_at=clock_timestamp()-interval '6 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE token_hash=$1", [socialHash('enrollment', signup.result.enrollment_token)]);
            h.disable();
            if(passwordState!==null)await db.pool.query('UPDATE identity."user" SET password_hash=$1 WHERE email_blind_index=$2',[passwordState,createEmailBlindIndex(blindKey,signup.input.email)]);
            await expect(h.passkeys.beginPasskeyEnrollment({ enrollment_token: signup.result.enrollment_token }, signup.bound)).rejects.toThrow();
            await h.registration.resendVerification({ email: signup.input.email }, h.source);
            await h.registration.drainMailDispatches();
            expect(h.sent).toHaveLength(1);
            expect(await h.registration.verifyEmail({ token: h.sent[0]!.token }, h.source)).toEqual({ status: 'mfa_required' });
            const setup=await h.mfa.beginTotp({enrollmentToken:h.sent[0]!.token},h.source),secret=decodeBase32(setup.secret),code=totpCodeAtStep(secret,Math.floor(Date.now()/30000));secret.fill(0);
            await expect(h.mfa.verifyTotp({enrollmentToken:h.sent[0]!.token,code},h.source)).rejects.toMatchObject({code:'MFA_FIRST_STEP_UNAVAILABLE'});
            const options=await h.passkeys.beginPasskeyEnrollment({enrollment_token:h.sent[0]!.token},h.source),fresh=consumerFixture();
            expect((await h.passkeys.completePasskeyEnrollment({challenge_handle:options.challenge_handle,credential:fresh.registration(options.options.challenge)},h.source)).status).toBe('authenticated');
        }
        finally {
            await h.registration.drainMailDispatches();
        }
    });
    it('links only after an exact fresh provider grant, never refreshes email, and validates options before consuming proof',async()=>{
        const h=await harness();try{
            const signup=await h.signup();if(!('status' in signup.result))throw new Error('EXPECTED_ENROLLMENT');const key=consumerFixture(),options=await h.passkeys.beginPasskeyEnrollment({enrollment_token:signup.result.enrollment_token},signup.bound),login=await h.passkeys.completePasskeyEnrollment({challenge_handle:options.challenge_handle,credential:key.registration(options.options.challenge)},signup.bound);if(login.status!=='authenticated')throw new Error('EXPECTED_SESSION');let session=(await h.sessions.authenticate(login.sessionToken,h.source))!;
            const prove=async(authorization:StepUpAuthorizationRequest)=>{const o=await h.security.beginPasskeyStepUp({authorization},session,h.source),r=await h.security.completePasskeyStepUp({challenge_handle:o.challenge_handle,credential:key.assertion(o.options.challenge,{userHandle:options.options.user.id})},session,h.source);session=(await h.sessions.authenticate(r.sessionToken,h.source))!;return r.response.step_up_grant!;};
            const remove=await prove({action:'UNLINK_PROVIDER',target_provider:'google'});await h.social.unlink({provider:'google',step_up_grant:remove.token},session,h.source);
            const link=await prove({action:'LINK_PROVIDER',target_provider:'google'});
            await expect(h.social.begin('google',{step_up_grant:link.token,next:'//evil.test'},h.source,session)).rejects.toThrow();expect((await db.pool.query('SELECT consumed_at FROM identity.step_up_grant WHERE token_hash=$1',[hashToken('step-up-grant',link.token)])).rows[0].consumed_at).toBeNull();
            const begun=await h.social.begin('google',{step_up_grant:link.token,next:'/settings'},h.source,session);expect((await h.finishFlow(begun,{email:'changed@example.test'})).status).toBe('linked');await expect(h.finishFlow(begun)).rejects.toThrow();
            expect((await db.pool.query('SELECT count(*)::int n FROM identity.social_identity WHERE user_id=$1 AND revoked_at IS NULL',[session.userId])).rows[0].n).toBe(1);expect((await db.pool.query('SELECT email_blind_index FROM identity."user" WHERE user_id=$1',[session.userId])).rows[0].email_blind_index).toEqual(createEmailBlindIndex(blindKey,signup.input.email));
        }finally{await h.registration.drainMailDispatches();}
    });
    it('serializes concurrent verified-subject signups for one submitted email without merging identities',async()=>{
        const a=await harness(),b=await harness(),email='concurrent-'+randomUUID()+'@example.test';try{
            const results=await Promise.all([a.signup(email),b.signup(email)]);expect(results.every(r=>'message' in r.result)).toBe(true);await Promise.all([a.registration.drainMailDispatches(),b.registration.drainMailDispatches()]);
            expect(a.sent.length+b.sent.length).toBe(1);expect((await db.pool.query('SELECT count(*)::int n FROM identity.social_identity WHERE user_id IN (SELECT user_id FROM identity."user" WHERE email_blind_index=$1)',[createEmailBlindIndex(blindKey,email)])).rows[0].n).toBe(1);
        }finally{await Promise.all([a.registration.drainMailDispatches(),b.registration.drainMailDispatches()]);}
    });

    it('cancels a pending link flow when another current session unlinks that provider',async()=>{
        const h=await harness();try{
            const signup=await h.signup();if(!('status' in signup.result))throw new Error('EXPECTED_ENROLLMENT');const key=consumerFixture(),options=await h.passkeys.beginPasskeyEnrollment({enrollment_token:signup.result.enrollment_token},signup.bound),first=await h.passkeys.completePasskeyEnrollment({challenge_handle:options.challenge_handle,credential:key.registration(options.options.challenge)},signup.bound);if(first.status!=='authenticated')throw new Error('EXPECTED_SESSION');let a=(await h.sessions.authenticate(first.sessionToken,h.source))!;
            const approve=async(session:AuthenticatedSession,authorization:StepUpAuthorizationRequest)=>{const o=await h.security.beginPasskeyStepUp({authorization},session,h.source),r=await h.security.completePasskeyStepUp({challenge_handle:o.challenge_handle,credential:key.assertion(o.options.challenge,{userHandle:options.options.user.id})},session,h.source);return{session:(await h.sessions.authenticate(r.sessionToken,h.source))!,grant:r.response.step_up_grant!};};
            const link=await approve(a,{action:'LINK_PROVIDER',target_provider:'google'});a=link.session;
            const pending=await h.social.begin('google',{step_up_grant:link.grant.token},h.source,a);
            const login=await h.passkeys.beginPasskeyLogin({},h.source),second=await h.passkeys.completePasskeyLogin({challenge_handle:login.challenge_handle,credential:key.assertion(login.options.challenge,{userHandle:options.options.user.id})},h.source),b=(await h.sessions.authenticate(second.sessionToken,h.source))!;
            const unlink=await approve(b,{action:'UNLINK_PROVIDER',target_provider:'google'});await h.social.unlink({provider:'google',step_up_grant:unlink.grant.token},unlink.session,h.source);
            await expect(h.finishFlow(pending)).rejects.toThrow();expect((await db.pool.query('SELECT count(*)::int n FROM identity.social_identity WHERE user_id=$1 AND revoked_at IS NULL',[a.userId])).rows[0].n).toBe(0);
        }finally{await h.registration.drainMailDispatches();}
    });

    it('accepts harmless Google callback metadata without treating unsigned hd as mailbox authority',async()=>{
        const h=await harness();try{const begun=await h.social.begin('google',{},h.source),callback=await h.finishFlow(begun,{email:'third-party@example.test'},{scope:'openid email profile',authuser:'0',prompt:'consent',hd:'unsigned.example'});expect(callback.status).toBe('signup_required');expect((await db.pool.query('SELECT asserted_email_index FROM identity.social_flow WHERE proof_hash=$1',[socialHash('signup',callback.token)])).rows[0].asserted_email_index).toBeNull();}finally{await h.registration.drainMailDispatches();}
    });

});
