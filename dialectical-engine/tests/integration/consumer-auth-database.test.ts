import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate, PostgresConsumerAuthRepository, PostgresSessionRepository, type Pool } from '@debateai/db';
import { hashToken, Argon2WorkerPool, encrypt, generateTotpSecret, hashPassword, totpCodeAtStep, type AuditContextHasher } from '@debateai/crypto';
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, SESSION_POLICY_REGISTER_ROW, sessionPolicyFromValue } from '@debateai/register';
import { currentDocument } from '@debateai/legal-manifest';
import { ConsumerWebAuthnService } from '../../apps/api/src/consumer-webauthn.js';
import { SessionService, type AuthenticatedSession } from '../../apps/api/src/sessions.js';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
import { consumerFixture, origin, rpId, b64 } from '../support/consumerWebAuthnFixtures.js';
let database: TestDatabase, runtime: Pool, repo: PostgresConsumerAuthRepository, sessions: SessionService, service: ConsumerWebAuthnService;
const source = { ip: '192.0.2.7', userAgent: 'consumer-test', requestId: 'task7' }, audit = { hashSourceIp: async () => 'ab'.repeat(32), hashUserAgent: async () => 'cd'.repeat(32) } as unknown as AuditContextHasher;
const token = () => b64(randomBytes(32));
const hash = (value: string) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const handleHash = (kind: string, value: string) => hash('consumer-passkey:' + kind + '\0' + value);
const env = { v: 1 as const, keyId: 'fixture', nonce: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA==', ct: 'YQ==' };
let risks = 0;
function deferred() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, resolve: () => release() }; }
beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    await database.pool.query("CREATE ROLE consumer_test_runtime LOGIN PASSWORD 'consumer-test-only' IN ROLE debateai_authorization_runtime");
    const url = new URL(database.connectionString);
    url.username = 'consumer_test_runtime';
    url.password = 'consumer-test-only';
    runtime = createPool(url.toString());
    repo = new PostgresConsumerAuthRepository(runtime, audit);
    sessions = await SessionService.create({ repository: new PostgresSessionRepository(runtime, audit), riskSignals: { recordForSession: async () => { risks++; return 'recorded'; } } as never, onRiskSignalFailure: () => undefined,
        dekStore: {} as never, argon2: {} as never, authPolicy: authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), mfaPolicy: mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value),
        sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value, SESSION_POLICY_REGISTER_ROW.sourceRef), blindIndexKey: Buffer.alloc(32, 5), dummyPasswordHash: 'fixture-password' });
    service = new ConsumerWebAuthnService(repo, sessions.consumerProducer(), { publicAppUrl: origin });
}, 120000);
afterAll(async () => { await runtime?.end(); await database?.stop(); });
async function account(badLegal = false) {
    const userId = randomUUID(), bearer = token(), channelId = randomUUID();
    const u = (await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at,phone_ciphertext,phone_source,phone_verification_status,phone_updated_at) VALUES($1::uuid,$2,'{}',NULL,'fixture-password',$1::text,'pending_mfa',clock_timestamp(),$3,'manual','unverified',clock_timestamp()) RETURNING owner_ref,audit_token`, [userId, randomBytes(32), env])).rows[0];
    await database.pool.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at,verification_token_hash,verification_expires_at,verification_consumed_at) VALUES($1,$2,'email','{}','verified',now(),now(),$3,now()+interval '24 hours',now())`, [channelId, userId, hashToken('verification', bearer)]);
    await database.pool.query(`INSERT INTO identity.verification_token_credential VALUES($1,$2,now()-interval '1 second',now()+interval '24 hours',now())`, [hashToken('verification', bearer), channelId]);
    await database.pool.query(`INSERT INTO identity.age_check VALUES($1,'passed',18,'RO','fixture-v1','registration',now())`, [userId]);
    for (const kind of ['TERMS', 'ADULT', 'PRIVACY_SHOWN']) {
        const pair = currentDocument(kind === 'PRIVACY_SHOWN' ? 'PRIVACY' : 'TERMS', 'en')!;
        await database.pool.query(`INSERT INTO legal.acceptance(acceptance_id,owner_ref,kind,document_version,document_sha256,locale,surface,accepted_at,evidence_ciphertext,key_id) VALUES($1,$2,$3,$4,$5,'en','SIGN_UP',now(),$6,'aaaaaaaaaaaaaaaa')`, [randomUUID(), u.owner_ref, kind, pair.version, badLegal ? 'b'.repeat(64) : pair.sha256, Buffer.alloc(30)]);
    }
    return { userId, ownerRef: u.owner_ref as string, auditToken: u.audit_token as string, bearer, channelId };
}
async function enrolled(flags = 0x5d, counter = 0) {
    const a = await account(), options = await service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source), f = consumerFixture();
    const result = await service.completePasskeyEnrollment({ challenge_handle: options.challenge_handle, credential: f.registration(options.options.challenge, flags, counter) }, source);
    if (result.status !== 'authenticated')
        throw new Error('MISSING_SESSION');
    return { ...a, f, userHandle: options.options.user.id, result };
}
async function login(a: Awaited<ReturnType<typeof enrolled>>, counter = 0, flags = 0x1d) {
    const options = await service.beginPasskeyLogin({}, source);
    const input = { challenge_handle: options.challenge_handle, credential: a.f.assertion(options.options.challenge, { counter, flags, userHandle: a.userHandle }) };
    return { options, input };
}
async function state(a: {
    userId: string;
}) {
    return (await database.pool.query(`SELECT state,(SELECT count(*)::int FROM identity.consumer_passkey_credential WHERE user_id=u.user_id) AS credentials,(SELECT count(*)::int FROM identity.session WHERE user_id=u.user_id) AS sessions FROM identity."user" u WHERE user_id=$1`, [a.userId])).rows[0];
}
async function pending(pid: number) {
    for (let n = 0; n < 100; n++) {
        const row = (await database.pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0];
        if (row?.wait_event_type === 'Lock')
            return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('NOT_BLOCKED');
}
async function addGrant(a: Awaited<ReturnType<typeof enrolled>>, action = 'ADD_PASSKEY') {
    const authenticated = await sessions.authenticate(a.result.sessionToken, source);
    if (!authenticated)
        throw new Error('SESSION_MISSING');
    const factorId = randomUUID();
    await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step) VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [factorId, a.userId]);
    const grant = token(), replacement = token(), csrf = token(), sessionRepo = new PostgresSessionRepository(runtime, audit);
    const identity = { userId: a.userId, ownerRef: a.ownerRef, auditToken: a.auditToken, passwordHash: 'fixture-password', factorId, secretCiphertext: env, lastAcceptedStep: 1 };
    expect(await sessionRepo.rotateAfterStepUp({ identity, currentSessionId: authenticated.session.session_id, currentTokenHash: authenticated.tokenHash, acceptedStep: 2, replacementTokenHash: hashToken('session', replacement), replacementCsrfHash: hashToken('csrf', csrf), bindingContext: { user_agent_hash: sessions.consumerProducer().bindingHash(source) }, occurredAt: new Date(), idleExpiresAt: new Date(Date.now() + 1209600000), source,
        grant: { grantId: randomUUID(), grantTokenHash: hashToken('step-up-grant', grant), action: action as 'ADD_PASSKEY', expiresAt: new Date(Date.now() + 300000) } })).toBe(true);
    const session = await sessions.authenticate(replacement, source);
    if (!session)
        throw new Error('ROTATED_SESSION_MISSING');
    return { grant, session, old: authenticated, factorId };
}
describe('restricted consumer passkey authority', () => {
    it('uses a real nonsuperuser with execute-only capabilities, fixed owners/search paths, and no consumer table access', async () => {
        const role = (await runtime.query('SELECT current_user,rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0];
        expect(role).toEqual({ current_user: 'consumer_test_runtime', rolsuper: false });
        for (const table of ['consumer_passkey_subject', 'consumer_passkey_credential', 'consumer_passkey_challenge']) {
            await expect(runtime.query('SELECT * FROM identity.' + table)).rejects.toMatchObject({ code: '42501' });
            await expect(runtime.query('TRUNCATE identity.' + table)).rejects.toMatchObject({ code: '42501' });
        }
        for (const fn of ['append_consumer_passkey_audit_internal(uuid,text,jsonb)', 'consumer_initial_evidence_internal(uuid,jsonb)', 'insert_consumer_session_internal(uuid,jsonb,text)']) {
            expect((await database.pool.query("SELECT has_function_privilege('consumer_test_runtime',$1,'EXECUTE') AS allowed", ['identity.' + fn])).rows[0].allowed).toBe(false);
        }
        const functions = (await database.pool.query("SELECT p.proname,p.prosecdef,p.proconfig,p.proowner=(SELECT proowner FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure) AS owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='identity' AND p.proname LIKE '%consumer%'")).rows;
        expect(functions.length).toBe(9);
        expect(functions.every(x => x.owner && x.prosecdef && x.proconfig.includes('search_path=pg_catalog'))).toBe(true);
    });
    it('requires discoverability and UV without attachment restrictions and safely resumes the bound email enrollment', async () => {
        const a = await account(), one = await service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source), two = await service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source);
        expect(one.options.authenticatorSelection).toEqual({ residentKey: 'required', requireResidentKey: true, userVerification: 'required' });
        expect(one.options.attestation).toBe('none');
        expect(one.options.user.id).toBe(two.options.user.id);
        expect(one.expires_at).toBeTruthy();
        expect(one.options.user.id).not.toBe(b64(Buffer.from(a.userId)));
    });
    it('atomically activates, audits, and issues an ordinary session compatible with existing authentication and bindings', async () => {
        const before = risks, a = await enrolled(0x45);
        expect(await state(a)).toEqual({ state: 'active', credentials: 1, sessions: 1 });
        expect(risks).toBe(before + 1);
        expect(await sessions.authenticate(a.result.sessionToken, source)).toMatchObject({ userId: a.userId, ownerRef: a.ownerRef });
        expect(await sessions.authenticate(a.result.sessionToken, { ...source, userAgent: 'other' })).toBeNull();
        expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.mfa_factor WHERE user_id=$1', [a.userId])).rows[0].n).toBe(0);
        expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.staff_webauthn_metadata WHERE user_id=$1', [a.userId])).rows[0].n).toBe(0);
        expect((await database.pool.query('SELECT verification_token_hash FROM identity.channel_binding WHERE user_id=$1', [a.userId])).rows[0].verification_token_hash).toBeNull();
        await expect(service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source)).rejects.toThrow();
    });
    it('keeps activation/challenge/session untouched for signed invalid registration and refuses stale/mismatched legal pairs or failed age', async () => {
        const stale = await account(true);
        await expect(service.beginPasskeyEnrollment({ enrollment_token: stale.bearer }, source)).rejects.toThrow();
        const a = await account(), o = await service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source), f = consumerFixture();
        await expect(service.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge, 0x59) }, source)).rejects.toThrow();
        expect(await state(a)).toEqual({ state: 'pending_mfa', credentials: 0, sessions: 0 });
        await database.pool.query("UPDATE identity.age_check SET outcome='refused' WHERE user_id=$1", [a.userId]);
        await expect(service.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source)).rejects.toThrow();
    });
    it('permits at most one initial completion/session and enforces purpose and source binding', async () => {
        const a = await account(), o = await service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source), f = consumerFixture(), input = { challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) };
        await expect(service.completePasskeyEnrollment(input, { ...source, userAgent: 'other' })).rejects.toThrow();
        const results = await Promise.allSettled([service.completePasskeyEnrollment(input, source), service.completePasskeyEnrollment(input, source)]);
        expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
        expect(await state(a)).toEqual({ state: 'active', credentials: 1, sessions: 1 });
        await expect(service.completePasskeyLogin({ challenge_handle: o.challenge_handle, credential: f.assertion(o.options.challenge) }, source)).rejects.toThrow();
    });
    it('logs multiDevice nonincrease/reset anomalies while retaining max, allows BS changes and zero counters', async () => {
        const a = await enrolled(0x5d, 4);
        for (const [counter, flags] of [[4, 0x1d], [0, 0x0d], [3, 0x1d], [5, 0x1d]]) {
            const l = await login(a, counter, flags);
            await service.completePasskeyLogin(l.input, source);
        }
        expect((await database.pool.query('SELECT signature_counter,backed_up FROM identity.consumer_passkey_credential WHERE user_id=$1', [a.userId])).rows[0]).toEqual({ signature_counter: '5', backed_up: true });
        expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.audit_event WHERE actor_key_ref=$1 AND event_type='identity.consumer_passkey.counter_anomaly'", [a.auditToken])).rows[0].n).toBe(3);
        const zero = await enrolled(), l = await login(zero);
        await service.completePasskeyLogin(l.input, source);
    });
    it('rejects replay and two concurrent login completions produce one session', async () => {
        const a = await enrolled(), l = await login(a), results = await Promise.allSettled([service.completePasskeyLogin(l.input, source), service.completePasskeyLogin(l.input, source)]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect((await state(a)).sessions).toBe(2);
        await expect(service.completePasskeyLogin(l.input, source)).rejects.toThrow();
    });
    it('refuses revoked/held/erased keys, security epoch changes and cross-owner credential IDs', async () => {
        for (const mutation of ['revoked', 'hold', 'epoch', 'erasure']) {
            const a = await enrolled(), l = await login(a);
            if (mutation === 'revoked')
                await database.pool.query('UPDATE identity.consumer_passkey_credential SET revoked_at=clock_timestamp() WHERE user_id=$1', [a.userId]);
            if (mutation === 'hold' || mutation === 'epoch')
                await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,$2,1)', [a.userId, mutation === 'hold']);
            if (mutation === 'erasure')
                await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [a.userId]);
            if (mutation === 'epoch') {
                // An anonymous login reads the new epoch legitimately; an in-flight verified snapshot must not survive it.
                const hashValue = handleHash('LOGIN', l.options.challenge_handle), binding = sessions.consumerProducer().bindingHash(source), cred = await repo.readCredential(hashValue, a.f.credentialId, binding);
                if (!cred)
                    throw new Error('MISSING_CREDENTIAL');
                await expect(repo.completeLogin({ ...cred, securityEpoch: 0, handleHash: hashValue, challengeHash: hash(l.options.options.challenge), bindingHash: binding, material: sessions.consumerProducer().prepare(source) }, source)).rejects.toThrow();
            }
            else
                await expect(service.completePasskeyLogin(l.input, source)).rejects.toThrow();
        }
        const a = await account(), b = await enrolled(), o = await service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source);
        await expect(service.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: b.f.registration(o.options.challenge) }, source)).rejects.toThrow();
        expect(await state(a)).toEqual({ state: 'pending_mfa', credentials: 0, sessions: 0 });
    });
    it('rechecks hold, revocation, erasure, password, key and owner-handle state after genuine signature verification', async () => {
        for (const mutation of ['hold', 'revoked', 'erased', 'password', 'key', 'handle']) {
            const a = await enrolled(), l = await login(a), ready = deferred(), resume = deferred();
            const delayed = new Proxy(repo, { get(target, property) {
                    if (property === 'completeLogin')
                        return async (input: Parameters<typeof repo.completeLogin>[0], context: typeof source) => { ready.resolve(); await resume.promise; return target.completeLogin(input, context); };
                    const value = Reflect.get(target, property, target);
                    return typeof value === 'function' ? value.bind(target) : value;
                } });
            const isolated = new ConsumerWebAuthnService(delayed, sessions.consumerProducer(), { publicAppUrl: origin }), result = isolated.completePasskeyLogin(l.input, source), denied = expect(result).rejects.toThrow();
            await ready.promise;
            try {
                if (mutation === 'hold')
                    await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,1)', [a.userId]);
                if (mutation === 'revoked')
                    await database.pool.query('UPDATE identity.consumer_passkey_credential SET revoked_at=clock_timestamp() WHERE user_id=$1', [a.userId]);
                if (mutation === 'erased')
                    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [a.userId]);
                if (mutation === 'password')
                    await database.pool.query('UPDATE identity."user" SET password_hash=$2 WHERE user_id=$1', [a.userId, 'changed']);
                if (mutation === 'key')
                    await database.pool.query('UPDATE identity.consumer_passkey_credential SET public_key=$2 WHERE user_id=$1', [a.userId, b64(consumerFixture().k.wire)]);
                if (mutation === 'handle')
                    await database.pool.query('UPDATE identity.consumer_passkey_subject SET user_handle=$2 WHERE user_id=$1', [a.userId, token()]);
            }
            finally {
                resume.resolve();
            }
            await denied;
            if (mutation !== 'erased')
                expect((await state(a)).sessions).toBe(1);
        }
    });
    it('retains the maximum multiDevice counter across independent concurrent signed challenges', async () => {
        const a = await enrolled(0x5d, 4), one = await login(a, 6), two = await login(a, 5);
        const results = await Promise.all([service.completePasskeyLogin(one.input, source), service.completePasskeyLogin(two.input, source)]);
        expect(results.every(r => r.status === 'authenticated')).toBe(true);
        expect((await database.pool.query('SELECT signature_counter FROM identity.consumer_passkey_credential WHERE user_id=$1', [a.userId])).rows[0].signature_counter).toBe('6');
    });
    it('rechecks the current bound verified email, pending state, and hold during initial activation', async () => {
        for (const mutation of ['binding', 'channel', 'state', 'hold']) {
            const a = await account(), o = await service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source), f = consumerFixture();
            if (mutation === 'binding')
                await database.pool.query('UPDATE identity.channel_binding SET verification_token_hash=$2 WHERE user_id=$1', [a.userId, hashToken('verification', token())]);
            if (mutation === 'channel')
                await database.pool.query("UPDATE identity.channel_binding SET state='revoked',revoked_at=clock_timestamp() WHERE user_id=$1", [a.userId]);
            if (mutation === 'state')
                await database.pool.query("UPDATE identity.\"user\" SET state='suspended' WHERE user_id=$1", [a.userId]);
            if (mutation === 'hold')
                await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,1)', [a.userId]);
            await expect(service.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source)).rejects.toThrow();
            expect((await state(a)).credentials).toBe(0);
            expect((await state(a)).sessions).toBe(0);
        }
    });
    it('requires exact fresh ADD_PASSKEY proof, current session generation and preserves profile purposes', async () => {
        for (const action of ['READ_PHONE_PROFILE', 'CHANGE_PHONE_PROFILE', 'CHANGE_RECOVERY_EMAIL']) {
            const a = await enrolled(), g = await addGrant(a, action);
            await expect(service.beginPasskeyEnrollment({ step_up_grant: g.grant }, source, g.session)).rejects.toThrow();
        }
        const a = await enrolled(), g = await addGrant(a);
        await expect(service.beginPasskeyEnrollment({ step_up_grant: g.grant }, source, g.old)).rejects.toThrow();
        const o = await service.beginPasskeyEnrollment({ step_up_grant: g.grant }, source, g.session), f = consumerFixture();
        await expect(service.beginPasskeyEnrollment({ step_up_grant: g.grant }, source, g.session)).rejects.toThrow();
        const result = await service.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source, g.session);
        expect(result).toEqual({ status: 'enrolled' });
        expect((await state(a)).sessions).toBe(1);
        expect((await state(a)).credentials).toBe(2);
    });
    it('enrolls an added passkey after a genuinely verified password and TOTP ADD_PASSKEY rotation', async () => {
        const a = await enrolled(), factorId = randomUUID(), secret = generateTotpSecret(), dek = Buffer.alloc(32, 7), argon2 = new Argon2WorkerPool({ workers: 1 });
        await argon2.ready();
        try {
            const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), password = 'Consumer passkey fixture password!';
            const passwordHash = await hashPassword(argon2, password, authPolicy.password.argon2id);
            await database.pool.query('UPDATE identity."user" SET password_hash=$2 WHERE user_id=$1', [a.userId, passwordHash]);
            await database.pool.query("INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp',$3,'active',now(),now())", [factorId, a.userId, encrypt(dek, secret, ['identity', 'mfa_factor.secret_ciphertext', factorId, 'run:none', a.userId, `user-dek:${a.userId}`, '1'])]);
            const realSessions = await SessionService.create({ repository: new PostgresSessionRepository(runtime, audit), riskSignals: { recordForSession: async () => 'recorded' } as never, onRiskSignalFailure: () => undefined,
                dekStore: { load: async () => Buffer.from(dek) } as never, argon2, authPolicy, mfaPolicy: mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value), sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value, SESSION_POLICY_REGISTER_ROW.sourceRef), blindIndexKey: Buffer.alloc(32, 5), dummyPasswordHash: passwordHash });
            const authenticated = (await realSessions.authenticate(a.result.sessionToken, source))!;
            const rotation = await realSessions.stepUp({ session: authenticated, password, code: totpCodeAtStep(secret, Math.floor(Date.now() / 30000)), authorization: { action: 'ADD_PASSKEY' } }, source);
            expect(rotation.grantToken).toBeTruthy();
            expect(await realSessions.authenticate(a.result.sessionToken, source)).toBeNull();
            const current = (await realSessions.authenticate(rotation.sessionToken, source))!, o = await service.beginPasskeyEnrollment({ step_up_grant: rotation.grantToken }, source, current), f = consumerFixture();
            expect(await service.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source, current)).toEqual({ status: 'enrolled' });
        }
        finally {
            secret.fill(0);
            dek.fill(0);
            await argon2.close();
        }
    });
    it('caps active enrollment by the original grant expiry and rechecks revoked/rotated sessions', async () => {
        for (const mutation of ['expiry', 'rotation', 'revoke']) {
            const a = await enrolled(), g = await addGrant(a);
            if (mutation === 'expiry')
                await database.pool.query("UPDATE identity.step_up_grant SET expires_at=clock_timestamp()+interval '250 milliseconds' WHERE token_hash=$1", [hashToken('step-up-grant', g.grant)]);
            const o = await service.beginPasskeyEnrollment({ step_up_grant: g.grant }, source, g.session), f = consumerFixture();
            if (mutation === 'expiry') {
                expect(new Date(o.expires_at).getTime() - Date.now()).toBeLessThan(300);
                await new Promise(r => setTimeout(r, 300));
            }
            if (mutation === 'rotation')
                await database.pool.query('UPDATE identity.session SET token_hash=$2 WHERE session_id=$1', [g.session.session.session_id, hashToken('session', token())]);
            if (mutation === 'revoke')
                await database.pool.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE session_id=$1', [g.session.session.session_id]);
            await expect(service.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source, g.session)).rejects.toThrow();
            expect((await state(a)).credentials).toBe(1);
        }
    });
    it('binds password continuation to account, source, current password/method, expiry and one-time completion', async () => {
        for (const mutation of ['valid', 'owner', 'binding', 'password', 'method', 'expiry', 'used']) {
            const a = await enrolled(), g = await addGrant(a), continuation = token();
            const sessionRepo = new PostgresSessionRepository(runtime, audit), identity = { userId: a.userId, ownerRef: a.ownerRef, auditToken: a.auditToken, passwordHash: 'fixture-password', factorId: g.factorId, secretCiphertext: env, lastAcceptedStep: 2 };
            expect(await sessionRepo.createLoginChallenge({ identity, challengeId: randomUUID(), challengeTokenHash: hashToken('login-challenge', continuation), bindingHash: sessions.consumerProducer().bindingHash(source), occurredAt: new Date(), expiresAt: new Date(Date.now() + 300000), source })).toBe(true);
            if (mutation === 'binding') {
                await expect(service.beginPasskeyLogin({ continuation_token: continuation }, { ...source, userAgent: 'other' })).rejects.toThrow();
                continue;
            }
            const o = await service.beginPasskeyLogin({ continuation_token: continuation }, source);
            if (mutation === 'password')
                await database.pool.query('UPDATE identity."user" SET password_hash=$2 WHERE user_id=$1', [a.userId, 'different-password']);
            if (mutation === 'method')
                await database.pool.query("UPDATE identity.mfa_factor SET state='revoked',revoked_at=clock_timestamp() WHERE mfa_factor_id=$1", [g.factorId]);
            if (mutation === 'expiry')
                await database.pool.query("UPDATE identity.login_challenge SET expires_at=created_at+interval '1 microsecond' WHERE token_hash=$1", [hashToken('login-challenge', continuation)]);
            if (mutation === 'used')
                await database.pool.query('UPDATE identity.login_challenge SET consumed_at=clock_timestamp() WHERE token_hash=$1', [hashToken('login-challenge', continuation)]);
            const signer = mutation === 'owner' ? await enrolled() : a, input = { challenge_handle: o.challenge_handle, credential: signer.f.assertion(o.options.challenge, { userHandle: signer.userHandle }) };
            if (mutation === 'valid') {
                await service.completePasskeyLogin(input, source);
                expect((await database.pool.query('SELECT consumed_at FROM identity.login_challenge WHERE token_hash=$1', [hashToken('login-challenge', continuation)])).rows[0].consumed_at).toBeInstanceOf(Date);
                await expect(service.beginPasskeyLogin({ continuation_token: continuation }, source)).rejects.toThrow();
            }
            else {
                await expect(service.completePasskeyLogin(input, source)).rejects.toThrow();
                expect((await state(a)).sessions).toBe(1);
            }
        }
    });
    it('rechecks expiry after a conflicting cross-owner credential insertion rolls back', async () => {
        const a = await account(), other = await account(), o = await service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source), f = consumerFixture();
        await service.beginPasskeyEnrollment({ enrollment_token: other.bearer }, source);
        await database.pool.query("UPDATE identity.consumer_passkey_challenge SET expires_at=clock_timestamp()+interval '250 milliseconds' WHERE handle_hash=$1", [handleHash('ENROLLMENT', o.challenge_handle)]);
        const blocker = await database.pool.connect(), client = await runtime.connect();
        try {
            await blocker.query('BEGIN');
            await blocker.query("INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin) VALUES($1,$2,$3,0,'multiDevice',true,$4,$5)", [other.userId, f.credentialId, b64(f.k.wire), rpId, origin]);
            const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, facade = { query: client.query.bind(client), connect: async () => ({ query: client.query.bind(client), release: () => undefined }) } as unknown as Pool;
            const isolated = new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(facade, audit), sessions.consumerProducer(), { publicAppUrl: origin });
            const result = isolated.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source), denied = expect(result).rejects.toThrow();
            await pending(pid);
            await new Promise(r => setTimeout(r, 300));
            await blocker.query('ROLLBACK');
            await denied;
            expect(await state(a)).toEqual({ state: 'pending_mfa', credentials: 0, sessions: 0 });
            expect((await database.pool.query('SELECT consumed_at FROM identity.consumer_passkey_challenge WHERE handle_hash=$1', [handleHash('ENROLLMENT', o.challenge_handle)])).rows[0].consumed_at).toBeNull();
        }
        finally {
            await blocker.query('ROLLBACK');
            blocker.release();
            client.release();
        }
    });
    it('rolls back activation, key, counter, consumed challenge and session when durable audit insertion fails', async () => {
        const a = await account(), o = await service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source), f = consumerFixture(), b = await enrolled(0x5d, 4), l = await login(b, 5), before = risks;
        await database.pool.query(`CREATE FUNCTION identity.consumer_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.event_type LIKE 'identity.consumer_passkey.%' THEN RAISE EXCEPTION 'FIXTURE_AUDIT_FAILURE';END IF;RETURN NEW;END$$;CREATE TRIGGER consumer_fixture_fail BEFORE INSERT ON identity.audit_event FOR EACH ROW EXECUTE FUNCTION identity.consumer_fixture_fail()`);
        try {
            await expect(service.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source)).rejects.toThrow('FIXTURE_AUDIT_FAILURE');
            await expect(service.completePasskeyLogin(l.input, source)).rejects.toThrow('FIXTURE_AUDIT_FAILURE');
            expect(await state(a)).toEqual({ state: 'pending_mfa', credentials: 0, sessions: 0 });
            expect((await state(b)).sessions).toBe(1);
            expect(risks).toBe(before);
            expect((await database.pool.query('SELECT signature_counter FROM identity.consumer_passkey_credential WHERE user_id=$1', [b.userId])).rows[0].signature_counter).toBe('4');
            expect((await database.pool.query('SELECT consumed_at FROM identity.consumer_passkey_challenge WHERE handle_hash=$1', [handleHash('LOGIN', l.options.challenge_handle)])).rows[0].consumed_at).toBeNull();
        }
        finally {
            await database.pool.query('DROP TRIGGER consumer_fixture_fail ON identity.audit_event;DROP FUNCTION identity.consumer_fixture_fail()');
        }
        await service.completePasskeyLogin(l.input, source);
    });
    it('rejects tampered audit source and rolls back the verified login transaction', async () => {
        const a = await enrolled(), l = await login(a, 1), bindingHash = sessions.consumerProducer().bindingHash(source), h = handleHash('LOGIN', l.options.challenge_handle);
        const credential = (await repo.readCredential(h, a.f.credentialId, bindingHash))!, { sessionToken: _raw, csrfToken: _csrf, ...material } = sessions.consumerProducer().prepare(source), client = await runtime.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT identity.begin_runtime_audit_attempt()');
            await expect(client.query('SELECT identity.complete_consumer_passkey_login($1,$2)', [{ ...credential, counter: 1, handleHash: h, challengeHash: hash(l.options.options.challenge), bindingHash, material }, { ipArgon2id: 'argon2id-audit:v1:' + 'a'.repeat(64), userAgentArgon2id: 'argon2id-audit:v1:' + 'b'.repeat(64), arbitrary: 'denied' }])).rejects.toThrow('CONSUMER_AUDIT_INVALID');
        }
        finally {
            await client.query('ROLLBACK');
            client.release();
        }
        expect((await state(a)).sessions).toBe(1);
        expect((await database.pool.query('SELECT signature_counter FROM identity.consumer_passkey_credential WHERE user_id=$1', [a.userId])).rows[0].signature_counter).toBe('0');
        await service.completePasskeyLogin(l.input, source);
    });
    it('rechecks enrollment bearer expiry after waiting on the security subject lock', async () => {
        const a = await account(), o = await service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source), f = consumerFixture();
        await database.pool.query("UPDATE identity.verification_token_credential SET expires_at=clock_timestamp()+interval '250 milliseconds' WHERE token_hash=$1", [hashToken('verification', a.bearer)]);
        const blocker = await database.pool.connect(), client = await runtime.connect();
        try {
            await blocker.query('BEGIN');
            await blocker.query('SELECT identity.lock_security_subjects(ARRAY[$1::uuid])', [a.userId]);
            const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
            const facade = { query: client.query.bind(client), connect: async () => ({ query: client.query.bind(client), release: () => undefined }) } as unknown as Pool;
            const isolated = new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(facade, audit), sessions.consumerProducer(), { publicAppUrl: origin });
            const result = isolated.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source), denied = expect(result).rejects.toThrow();
            await pending(pid);
            await new Promise(r => setTimeout(r, 300));
            await blocker.query('COMMIT');
            await denied;
            expect(await state(a)).toEqual({ state: 'pending_mfa', credentials: 0, sessions: 0 });
        }
        finally {
            await blocker.query('ROLLBACK');
            blocker.release();
            client.release();
        }
    });
    it('rechecks login expiry after waiting on its credential lock', async () => {
        const a = await enrolled(), l = await login(a), blocker = await database.pool.connect(), client = await runtime.connect();
        await database.pool.query("UPDATE identity.consumer_passkey_challenge SET expires_at=clock_timestamp()+interval '250 milliseconds' WHERE handle_hash=$1", [handleHash('LOGIN', l.options.challenge_handle)]);
        try {
            await blocker.query('BEGIN');
            await blocker.query('SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=$1 FOR UPDATE', [a.userId]);
            const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, facade = { query: client.query.bind(client), connect: async () => ({ query: client.query.bind(client), release: () => undefined }) } as unknown as Pool;
            const isolated = new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(facade, audit), sessions.consumerProducer(), { publicAppUrl: origin });
            const result = isolated.completePasskeyLogin(l.input, source), denied = expect(result).rejects.toThrow();
            await pending(pid);
            await new Promise(r => setTimeout(r, 300));
            await blocker.query('COMMIT');
            await denied;
            expect((await state(a)).sessions).toBe(1);
        }
        finally {
            await blocker.query('ROLLBACK');
            blocker.release();
            client.release();
        }
    });
    it('erasure cascades every consumer account/credential/challenge row and table truncation remains guarded for owners', async () => {
        const a = await enrolled(), g = await addGrant(a);
        await service.beginPasskeyEnrollment({ step_up_grant: g.grant }, source, g.session);
        await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [a.userId]);
        for (const table of ['consumer_passkey_subject', 'consumer_passkey_credential', 'consumer_passkey_challenge'])
            expect((await database.pool.query(`SELECT count(*)::int AS n FROM identity.${table} WHERE user_id=$1`, [a.userId])).rows[0].n).toBe(0);
        await expect(database.pool.query('TRUNCATE identity.consumer_passkey_challenge')).rejects.toThrow();
    });
});
