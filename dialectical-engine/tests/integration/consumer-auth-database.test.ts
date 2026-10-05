import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate, PostgresConsumerAuthRepository, PostgresSessionRepository, type Pool } from '@debateai/db';
import { hashToken, Argon2WorkerPool, encrypt, generateTotpSecret, hashPassword, totpCodeAtStep, decodeBase32, createEmailBlindIndex, type AuditContextHasher } from '@debateai/crypto';
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, SESSION_POLICY_REGISTER_ROW, SESSION_POLICY_DEPLOYMENT_REGISTER_ROW, sessionPolicyFromValue } from '@debateai/register';
import { currentDocument } from '@debateai/legal-manifest';
import { ConsumerWebAuthnService } from '../../apps/api/src/consumer-webauthn.js';
import { MfaEnrollmentService } from '../../apps/api/src/mfa.js';
import { SessionService, type AuthenticatedSession } from '../../apps/api/src/sessions.js';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
import { consumerFixture, origin, rpId, b64 } from '../support/consumerWebAuthnFixtures.js';
let database: TestDatabase, runtime: Pool, repo: PostgresConsumerAuthRepository, sessions: SessionService, service: ConsumerWebAuthnService;
const source = { ip: '192.0.2.7', userAgent: 'consumer-test', requestId: 'task7' }, audit = { hashSourceIp: async () => 'ab'.repeat(32), hashUserAgent: async () => 'cd'.repeat(32) } as unknown as AuditContextHasher;
const token = () => b64(randomBytes(32));
const hash = (value: string) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const handleHash = (kind: string, value: string) => hash('consumer-passkey:' + kind + '\0' + value);
const env = { v: 1 as const, keyId: 'fixture', nonce: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA==', ct: 'YQ==' };
const fixturePasswordCost=authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS).password.argon2id;
const fixturePassword=`$argon2id$v=19$m=${fixturePasswordCost.memoryCostKiB},t=${fixturePasswordCost.timeCost},p=${fixturePasswordCost.parallelism}$${Buffer.alloc(16,1).toString('base64').replace(/=/g,'')}$${Buffer.alloc(fixturePasswordCost.hashLength,1).toString('base64').replace(/=/g,'')}`;
let risks = 0, sourceSequence = 0;
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
    sessions = await freshSessions();
    service = new ConsumerWebAuthnService(repo, sessions.consumerProducer(), { publicAppUrl: origin });
}, 120000);
async function freshSessions() {
    return SessionService.create({ repository: new PostgresSessionRepository(runtime, audit), riskSignals: { recordForSession: async () => { risks++; return 'recorded'; } } as never, onRiskSignalFailure: () => undefined,
        dekStore: {} as never, argon2: {} as never, authPolicy: authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), mfaPolicy: mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value),
        sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value, SESSION_POLICY_REGISTER_ROW.sourceRef), blindIndexKey: Buffer.alloc(32, 5), dummyPasswordHash: fixturePassword });
}
afterAll(async () => { await runtime?.end(); await database?.stop(); });
async function account(badLegal = false, missingAdult = false) {
    // Independent synthetic clients keep correctness cases independent of the real shared source gate.
    source.ip = `198.51.${Math.floor(++sourceSequence / 256)}.${sourceSequence % 256}`;
    const userId = randomUUID(), bearer = token(), channelId = randomUUID();
    const u = (await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at,phone_ciphertext,phone_source,phone_verification_status,phone_updated_at) VALUES($1::uuid,$2,'{}',NULL,$4,$1::text,'pending_mfa',clock_timestamp(),$3,'manual','unverified',clock_timestamp()) RETURNING owner_ref,audit_token`, [userId, randomBytes(32), env,fixturePassword])).rows[0];
    await database.pool.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at,verification_token_hash,verification_expires_at,verification_consumed_at) VALUES($1,$2,'email','{}','verified',now(),now(),$3,now()+interval '24 hours',now())`, [channelId, userId, hashToken('verification', bearer)]);
    await database.pool.query(`INSERT INTO identity.verification_token_credential VALUES($1,$2,now()-interval '1 second',now()+interval '24 hours',now())`, [hashToken('verification', bearer), channelId]);
    await database.pool.query(`INSERT INTO identity.age_check VALUES($1,'passed',18,'RO','fixture-v1','registration',now())`, [userId]);
    for (const kind of ['TERMS', 'ADULT', 'PRIVACY_SHOWN']) {
        if(missingAdult && kind==='ADULT') continue;
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
    const identity = { userId: a.userId, ownerRef: a.ownerRef, auditToken: a.auditToken, passwordHash: fixturePassword, factorId, secretCiphertext: env, lastAcceptedStep: 1 };
    expect(await sessionRepo.rotateAfterStepUp({ identity, currentSessionId: authenticated.session.session_id, currentTokenHash: authenticated.tokenHash, acceptedStep: 2, replacementTokenHash: hashToken('session', replacement), replacementCsrfHash: hashToken('csrf', csrf), bindingContext: { user_agent_hash: sessions.consumerProducer().bindingHash(source) }, occurredAt: new Date(), idleExpiresAt: new Date(Date.now() + 1209600000), source,
        grant: { grantId: randomUUID(), grantTokenHash: hashToken('step-up-grant', grant), action: action as 'ADD_PASSKEY', expiresAt: new Date(Date.now() + 300000) } })).toBe(true);
    const session = await sessions.authenticate(replacement, source);
    if (!session)
        throw new Error('ROTATED_SESSION_MISSING');
    return { grant, session, old: authenticated, factorId, replacement };
}
describe('restricted consumer passkey authority', () => {
    it('uses a real nonsuperuser with execute-only capabilities, fixed owners/search paths, and no consumer table access', async () => {
        const role = (await runtime.query('SELECT current_user,rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0];
        expect(role).toEqual({ current_user: 'consumer_test_runtime', rolsuper: false });
        for (const table of ['consumer_passkey_subject', 'consumer_passkey_credential', 'consumer_passkey_challenge']) {
            await expect(runtime.query('SELECT * FROM identity.' + table)).rejects.toMatchObject({ code: '42501' });
            await expect(runtime.query('TRUNCATE identity.' + table)).rejects.toMatchObject({ code: '42501' });
        }
        for (const fn of ['append_consumer_passkey_audit_internal(uuid,text,jsonb)', 'consumer_initial_evidence_internal(uuid,jsonb)', 'insert_consumer_session_internal(uuid,jsonb,text)', 'lock_consumer_challenges_internal(integer)', 'reserve_consumer_challenge_internal(uuid,text,text,integer,integer)', 'assert_consumer_options_capacity_internal(uuid,integer)', 'consumer_options_context_internal(uuid,text,timestamptz)']) {
            expect((await database.pool.query("SELECT has_function_privilege('consumer_test_runtime',$1,'EXECUTE') AS allowed", ['identity.' + fn])).rows[0].allowed).toBe(false);
        }
        const functions = (await database.pool.query("SELECT p.proname,p.prosecdef,p.proconfig,p.proowner=(SELECT proowner FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure) AS owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='identity' AND p.proname=ANY($1::text[])", [["prune_consumer_passkey_challenges", "lock_consumer_challenges_internal", "reserve_consumer_challenge_internal", "assert_consumer_options_capacity_internal", "consumer_options_context_internal", "prepare_consumer_passkey_enrollment", "append_consumer_passkey_audit_internal", "consumer_initial_evidence_internal", "begin_consumer_passkey_enrollment", "begin_consumer_passkey_login", "read_consumer_passkey_challenge", "read_consumer_passkey_credential", "insert_consumer_session_internal", "complete_consumer_passkey_enrollment", "complete_consumer_passkey_login"]])).rows;
        expect(functions.length).toBe(15);
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
            const sessionRepo = new PostgresSessionRepository(runtime, audit), identity = { userId: a.userId, ownerRef: a.ownerRef, auditToken: a.auditToken, passwordHash: fixturePassword, factorId: g.factorId, secretCiphertext: env, lastAcceptedStep: 2 };
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
        let blockerOpen = false;
        try {
            await blocker.query('BEGIN');
            blockerOpen = true;
            await blocker.query("INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin) VALUES($1,$2,$3,0,'multiDevice',true,$4,$5)", [other.userId, f.credentialId, b64(f.k.wire), rpId, origin]);
            const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, facade = { query: client.query.bind(client), connect: async () => ({ query: client.query.bind(client), release: () => undefined }) } as unknown as Pool;
            const isolated = new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(facade, audit), sessions.consumerProducer(), { publicAppUrl: origin });
            const result = isolated.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source), denied = expect(result).rejects.toThrow();
            await pending(pid);
            await new Promise(r => setTimeout(r, 300));
            await blocker.query('ROLLBACK');
            blockerOpen = false;
            await denied;
            expect(await state(a)).toEqual({ state: 'pending_mfa', credentials: 0, sessions: 0 });
            expect((await database.pool.query('SELECT consumed_at FROM identity.consumer_passkey_challenge WHERE handle_hash=$1', [handleHash('ENROLLMENT', o.challenge_handle)])).rows[0].consumed_at).toBeNull();
        }
        finally {
            if (blockerOpen)
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
        let blockerOpen = false;
        try {
            await blocker.query('BEGIN');
            blockerOpen = true;
            await blocker.query('SELECT identity.lock_security_subjects(ARRAY[$1::uuid])', [a.userId]);
            const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
            const facade = { query: client.query.bind(client), connect: async () => ({ query: client.query.bind(client), release: () => undefined }) } as unknown as Pool;
            const isolated = new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(facade, audit), sessions.consumerProducer(), { publicAppUrl: origin });
            const result = isolated.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source), denied = expect(result).rejects.toThrow();
            await pending(pid);
            await new Promise(r => setTimeout(r, 300));
            await blocker.query('COMMIT');
            blockerOpen = false;
            await denied;
            expect(await state(a)).toEqual({ state: 'pending_mfa', credentials: 0, sessions: 0 });
        }
        finally {
            if (blockerOpen)
                await blocker.query('ROLLBACK');
            blocker.release();
            client.release();
        }
    });
    it('rechecks login expiry after waiting on its credential lock', async () => {
        const a = await enrolled(), l = await login(a), blocker = await database.pool.connect(), client = await runtime.connect();
        await database.pool.query("UPDATE identity.consumer_passkey_challenge SET expires_at=clock_timestamp()+interval '250 milliseconds' WHERE handle_hash=$1", [handleHash('LOGIN', l.options.challenge_handle)]);
        let blockerOpen = false;
        try {
            await blocker.query('BEGIN');
            blockerOpen = true;
            await blocker.query('SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=$1 FOR UPDATE', [a.userId]);
            const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, facade = { query: client.query.bind(client), connect: async () => ({ query: client.query.bind(client), release: () => undefined }) } as unknown as Pool;
            const isolated = new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(facade, audit), sessions.consumerProducer(), { publicAppUrl: origin });
            const result = isolated.completePasskeyLogin(l.input, source), denied = expect(result).rejects.toThrow();
            await pending(pid);
            await new Promise(r => setTimeout(r, 300));
            await blocker.query('COMMIT');
            blockerOpen = false;
            await denied;
            expect((await state(a)).sessions).toBe(1);
        }
        finally {
            if (blockerOpen)
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
async function seedInventory(userId: string, count: number, idBytes: number) {
    await database.pool.query('DELETE FROM identity.consumer_passkey_credential WHERE user_id=$1', [userId]);
    const ids = Array.from({ length: count }, () => b64(randomBytes(idBytes)));
    await database.pool.query(`INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin)
      SELECT $1,id,$3,0,'multiDevice',true,$4,$5 FROM unnest($2::text[]) AS id`, [userId, ids, b64(consumerFixture().k.wire), rpId, origin]);
}
async function beginMutationState(a: {
    userId: string;
    auditToken: string;
}, grant: string) {
    return (await database.pool.query(`SELECT (SELECT consumed_at FROM identity.step_up_grant WHERE token_hash=$1) AS consumed,
      (SELECT count(*)::int FROM identity.consumer_passkey_challenge WHERE user_id=$2 AND consumed_at IS NULL AND expires_at>clock_timestamp()) AS challenges,
      (SELECT count(*)::int FROM identity.audit_event WHERE actor_key_ref=$3) AS audits`, [hashToken('step-up-grant', grant), a.userId, a.auditToken])).rows[0];
}
describe('bounded enrollment options transaction', () => {
    it('does not spend proof, create challenge or audit for an unbounded current exclusion response', async () => {
        for (const [count, bytes] of [[101, 32], [31, 768]]) {
            const a = await enrolled(), g = await addGrant(a);
            await seedInventory(a.userId, count!, bytes!);
            const before = await beginMutationState(a, g.grant);
            await expect(service.beginPasskeyEnrollment({ step_up_grant: g.grant }, source, g.session)).rejects.toThrow();
            expect(await beginMutationState(a, g.grant)).toEqual(before);
        }
    });
    it('allows the hundredth short ID but rolls back completion that would create 101 exclusions', async () => {
        const a = await enrolled(), g = await addGrant(a);
        await seedInventory(a.userId, 100, 32);
        const o = await service.beginPasskeyEnrollment({ step_up_grant: g.grant }, source, g.session), f = consumerFixture();
        expect(o.options.excludeCredentials).toHaveLength(100);
        const before = await beginMutationState(a, g.grant);
        await expect(service.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source, g.session)).rejects.toThrow();
        expect(await beginMutationState(a, g.grant)).toEqual(before);
        expect((await state(a)).credentials).toBe(100);
        await database.pool.query('DELETE FROM identity.consumer_passkey_credential WHERE consumer_credential_id=(SELECT consumer_credential_id FROM identity.consumer_passkey_credential WHERE user_id=$1 LIMIT 1)', [a.userId]);
        expect(await service.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source, g.session)).toEqual({ status: 'enrolled' });
        expect((await state(a)).credentials).toBe(100);
    });
    it('accepts thirty maximum-length IDs, rejects the thirty-first long ID, and permits a short ID in the same live ceremony', async () => {
        const a = await enrolled(), g = await addGrant(a);
        await seedInventory(a.userId, 30, 768);
        const o = await service.beginPasskeyEnrollment({ step_up_grant: g.grant }, source, g.session), long = consumerFixture(undefined, randomBytes(768));
        expect(Buffer.byteLength(JSON.stringify(o))).toBeLessThanOrEqual(32768);
        const base = (await database.pool.query('SELECT options_base_bytes FROM identity.consumer_passkey_challenge WHERE handle_hash=$1', [handleHash('ENROLLMENT', o.challenge_handle)])).rows[0].options_base_bytes;
        const descriptors = o.options.excludeCredentials!;
        expect(base + descriptors.reduce((sum, d) => sum + Buffer.byteLength(JSON.stringify(d)), 0) + descriptors.length - 1).toBe(Buffer.byteLength(JSON.stringify(o)));
        const before = await beginMutationState(a, g.grant);
        await expect(service.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: long.registration(o.options.challenge) }, source, g.session)).rejects.toThrow();
        expect(await beginMutationState(a, g.grant)).toEqual(before);
        expect((await state(a)).credentials).toBe(30);
        const short = consumerFixture();
        expect(await service.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: short.registration(o.options.challenge) }, source, g.session)).toEqual({ status: 'enrolled' });
        expect((await state(a)).credentials).toBe(31);
    });
});
describe('retained ceremony bounds and transaction order', () => {
    it('bounds anonymous and email-resume pending state across fresh API instances while retaining independent ceremonies', async () => {
        const a = await account(), limits = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value).verificationLimits;
        const registrations: Awaited<ReturnType<typeof service.beginPasskeyEnrollment>>[] = [];
        const logins: Awaited<ReturnType<typeof service.beginPasskeyLogin>>[] = [];
        for (let i = 0; i < limits.perEnrollment + 2; i++) {
            const fresh = new ConsumerWebAuthnService(repo, (await freshSessions()).consumerProducer(), { publicAppUrl: origin });
            registrations.push(await fresh.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source));
            logins.push(await fresh.beginPasskeyLogin({}, source));
        }
        expect(new Set(registrations.map(o => o.options.user.id)).size).toBe(1);
        const admission = await (await freshSessions()).consumerProducer().admit('LOGIN_BEGIN', 'discoverable', source);
        const rows = (await database.pool.query('SELECT purpose,count(*)::int AS n FROM identity.consumer_passkey_challenge WHERE user_id=$1 OR (user_id IS NULL AND retention_hash=$2) GROUP BY purpose', [a.userId, admission.retentionKey])).rows;
        expect(rows).toEqual(expect.arrayContaining([{ purpose: 'INITIAL_ENROLLMENT', n: limits.perEnrollment }, { purpose: 'LOGIN', n: limits.perEnrollment }]));
        expect(await repo.readChallenge(handleHash('ENROLLMENT', registrations[0]!.challenge_handle), 'ENROLLMENT', sessions.consumerProducer().bindingHash(source))).toBeNull();
        expect(await repo.readChallenge(handleHash('LOGIN', logins[0]!.challenge_handle), 'LOGIN', sessions.consumerProducer().bindingHash(source))).toBeNull();
        const last = registrations.at(-1)!, f = consumerFixture();
        expect((await service.completePasskeyEnrollment({ challenge_handle: last.challenge_handle, credential: f.registration(last.options.challenge) }, source)).status).toBe('authenticated');
    });
    it('bounds one password continuation fan-out by the same account/purpose policy', async () => {
        const a = await enrolled(), g = await addGrant(a), continuation = token();
        const identity = { userId: a.userId, ownerRef: a.ownerRef, auditToken: a.auditToken, passwordHash: fixturePassword, factorId: g.factorId, secretCiphertext: env, lastAcceptedStep: 2 };
        expect(await new PostgresSessionRepository(runtime, audit).createLoginChallenge({ identity, challengeId: randomUUID(), challengeTokenHash: hashToken('login-challenge', continuation), bindingHash: sessions.consumerProducer().bindingHash(source), occurredAt: new Date(), expiresAt: new Date(Date.now() + 300000), source })).toBe(true);
        for (let i = 0; i < 7; i++)
            await new ConsumerWebAuthnService(repo, (await freshSessions()).consumerProducer(), { publicAppUrl: origin }).beginPasskeyLogin({ continuation_token: continuation }, source);
        expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.consumer_passkey_challenge WHERE user_id=$1 AND purpose='LOGIN'", [a.userId])).rows[0].n).toBe(5);
    });
    it('removes expired anonymous/account-bound and consumed rows on the next admitted begin, and bounds the global retained set', async () => {
        await database.pool.query('DELETE FROM identity.consumer_passkey_challenge');
        const capacity = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value).verificationLimits.capacity;
        await database.pool.query(`INSERT INTO identity.consumer_passkey_challenge(handle_hash,challenge_hash,retention_hash,purpose,binding_hash,rp_id,origin,expires_at)
          SELECT 'sha256:'||md5('handle'||n)||md5('handle2'||n),'sha256:'||repeat('a',64),'sha256:'||md5('source'||n)||md5('source2'||n),'LOGIN','sha256:'||repeat('b',64),$2,$3,now()+interval '5 minutes' FROM generate_series(1,$1::integer) n`, [capacity, rpId, origin]);
        const local = { ...source, ip: '203.0.113.210' }, fresh = new ConsumerWebAuthnService(repo, (await freshSessions()).consumerProducer(), { publicAppUrl: origin });
        await expect(fresh.beginPasskeyLogin({}, local)).rejects.toMatchObject({ code: 'MFA_RATE_LIMITED' });
        expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.consumer_passkey_challenge')).rows[0].n).toBe(capacity);
        await database.pool.query("UPDATE identity.consumer_passkey_challenge SET created_at=now()-interval '10 minutes',expires_at=now()-interval '5 minutes'");
        await fresh.beginPasskeyLogin({}, local);
        expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.consumer_passkey_challenge')).rows[0].n).toBe(1);
        const a = await account();
        await service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source);
        const b = await enrolled(); // Completed challenge is retained only until the next admitted begin.
        await database.pool.query("UPDATE identity.consumer_passkey_challenge SET created_at=now()-interval '10 minutes',expires_at=now()-interval '5 minutes' WHERE user_id=$1", [a.userId]);
        await fresh.beginPasskeyLogin({}, local);
        expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.consumer_passkey_challenge WHERE user_id IN ($1,$2)', [a.userId, b.userId])).rows[0].n).toBe(0);
    });
    it('serializes concurrent additions so only one can cross from 29 to 30 long IDs', async () => {
        const a = await enrolled(), independent = await login(a), secondLogin = await service.completePasskeyLogin(independent.input, source);
        const one = await addGrant(a), two = await addGrant({ ...a, result: secondLogin });
        await seedInventory(a.userId, 29, 768);
        const first = await service.beginPasskeyEnrollment({ step_up_grant: one.grant }, source, one.session), second = await service.beginPasskeyEnrollment({ step_up_grant: two.grant }, source, two.session);
        const firstKey = consumerFixture(undefined, randomBytes(768)), secondKey = consumerFixture(undefined, randomBytes(768));
        const results = await Promise.allSettled([service.completePasskeyEnrollment({ challenge_handle: first.challenge_handle, credential: firstKey.registration(first.options.challenge) }, source, one.session), service.completePasskeyEnrollment({ challenge_handle: second.challenge_handle, credential: secondKey.registration(second.options.challenge) }, source, two.session)]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect((await state(a)).credentials).toBe(30);
        const rows = (await database.pool.query('SELECT consumed_at FROM identity.consumer_passkey_challenge WHERE handle_hash=ANY($1::text[])', [[handleHash('ENROLLMENT', first.challenge_handle), handleHash('ENROLLMENT', second.challenge_handle)]])).rows;
        expect(rows.filter(r => r.consumed_at === null)).toHaveLength(1);
    });
    it('rolls back even a post-preflight or post-insert exact-options callback failure', async () => {
        const a = await enrolled(), g = await addGrant(a);
        const failingBegin = new Proxy(repo, { get(target, property) {
                if (property === 'beginEnrollment')
                    return (...args: Parameters<typeof repo.beginEnrollment>) => target.beginEnrollment(args[0], args[1], args[2], async (candidate) => { await args[3](candidate); throw new Error('FIXTURE_OPTIONS_FAILURE'); });
                const value = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
            } });
        const before = await beginMutationState(a, g.grant);
        await expect(new ConsumerWebAuthnService(failingBegin, sessions.consumerProducer(), { publicAppUrl: origin }).beginPasskeyEnrollment({ step_up_grant: g.grant }, source, g.session)).rejects.toThrow('FIXTURE_OPTIONS_FAILURE');
        expect(await beginMutationState(a, g.grant)).toEqual(before);
        const o = await service.beginPasskeyEnrollment({ step_up_grant: g.grant }, source, g.session), f = consumerFixture(), afterBegin = await beginMutationState(a, g.grant);
        const failingComplete = new Proxy(repo, { get(target, property) {
                if (property === 'completeEnrollment')
                    return (...args: Parameters<typeof repo.completeEnrollment>) => target.completeEnrollment(args[0], args[1], args[2], async (candidate) => { await args[3](candidate); throw new Error('FIXTURE_OPTIONS_FAILURE'); });
                const value = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
            } });
        await expect(new ConsumerWebAuthnService(failingComplete, sessions.consumerProducer(), { publicAppUrl: origin }).completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source, g.session)).rejects.toThrow('FIXTURE_OPTIONS_FAILURE');
        expect(await beginMutationState(a, g.grant)).toEqual(afterBegin);
        expect((await state(a)).credentials).toBe(1);
    });
    it('finishes cleanup before waiting for the account held by an already-verified completion', async () => {
        const a = await account(), o = await service.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source), f = consumerFixture();
        const completeClient = await runtime.connect(), beginClient = await runtime.connect(), locked = deferred(), resume = deferred();
        const completingPool = { query: completeClient.query.bind(completeClient), connect: async () => ({ query: async (sql: string, values?: unknown[]) => {
                    if (sql.includes('identity.complete_consumer_passkey_enrollment')) {
                        await completeClient.query('SELECT identity.assert_session_current($1,$2,$3)', [a.userId, randomUUID(), hash(token())]);
                        locked.resolve();
                        await resume.promise;
                    }
                    return completeClient.query(sql, values);
                }, release: () => undefined }) } as unknown as Pool;
        const beginningPool = { query: beginClient.query.bind(beginClient), connect: async () => ({ query: beginClient.query.bind(beginClient), release: () => undefined }) } as unknown as Pool;
        const completing = new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(completingPool, audit), sessions.consumerProducer(), { publicAppUrl: origin });
        const beginning = new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(beginningPool, audit), sessions.consumerProducer(), { publicAppUrl: origin });
        const result = completing.completePasskeyEnrollment({ challenge_handle: o.challenge_handle, credential: f.registration(o.options.challenge) }, source);
        const completionError = result.then(() => null, (error: unknown) => error);
        let next: Promise<Awaited<ReturnType<typeof service.beginPasskeyEnrollment>>> | undefined;
        try {
            await Promise.race([locked.promise, completionError.then(error => { throw error ?? new Error('COMPLETION_DID_NOT_PAUSE'); })]);
            await database.pool.query("UPDATE identity.consumer_passkey_challenge SET expires_at=clock_timestamp() WHERE handle_hash=$1", [handleHash('ENROLLMENT', o.challenge_handle)]);
            const pid = (await beginClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
            next = beginning.beginPasskeyEnrollment({ enrollment_token: a.bearer }, source);
            await pending(pid);
            // The expired challenge is already durably removed, although preflight is still waiting for the account.
            expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.consumer_passkey_challenge WHERE handle_hash=$1', [handleHash('ENROLLMENT', o.challenge_handle)])).rows[0].n).toBe(0);
            resume.resolve();
            expect(await completionError).toMatchObject({ code: 'AUTH_CREDENTIALS_INVALID' });
            expect((await next).options.user.id).toBe(o.options.user.id);
        }
        finally {
            resume.resolve();
            await Promise.allSettled([result, ...(next ? [next] : [])]);
            completeClient.release();
            beginClient.release();
        }
    });
});


const totpDek=Buffer.alloc(32,29);
function totpService(repository=repo,producer=sessions.consumerProducer()) {
  return new MfaEnrollmentService({repository:{recordMfaVerificationFailure:async()=>{}} as never,consumerRepository:repository,sessions:producer,
    dekStore:{load:async()=>Buffer.from(totpDek)} as never,argon2:{} as never,policy:mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value)});
}
const totpCode=(secret:string)=>totpCodeAtStep(decodeBase32(secret),Math.floor(Date.now()/30000));
const additionHash=(value:string)=>hash('consumer-totp:ADD_TOTP\0'+value);
describe('direct TOTP activation and addition authority',()=>{
  it('activates verified TOTP atomically into a usable session without recovery generation',async()=>{
    const a=await account(),mfa=totpService(),before=risks,b=await mfa.beginTotp({enrollmentToken:a.bearer},source);
    expect(b.enrollment_token).toBe(a.bearer);
    const results=await Promise.allSettled([mfa.verifyTotp({enrollmentToken:b.enrollment_token,code:totpCode(b.secret)},source),mfa.verifyTotp({enrollmentToken:b.enrollment_token,code:totpCode(b.secret)},source)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const result=results.find(r=>r.status==='fulfilled')!;
    if(result.status!=='fulfilled'||result.value.status!=='authenticated')throw Error('NO_SESSION');
    expect(await sessions.authenticate(result.value.sessionToken,source)).toMatchObject({userId:a.userId});
    expect(await state(a)).toEqual({state:'active',credentials:0,sessions:1});expect(risks).toBe(before+1);
    expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.recovery_code WHERE user_id=$1',[a.userId])).rows[0].n).toBe(0);
    expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.audit_event WHERE actor_key_ref=$1 AND event_type=ANY($2)',[a.auditToken,['identity.mfa.totp.verified','identity.mfa.enrollment.activated','identity.session.created']])).rows[0].n).toBe(3);
  });
  it.each(['email','consumed','legal','adult','age','hold','expiry'])('refuses changed %s authority at completion and leaves no partial activation',async mutation=>{
    const a=await account(mutation==='legal',mutation==='adult'),mfa=totpService(),b=await mfa.beginTotp({enrollmentToken:a.bearer},source);
    if(mutation==='email')await database.pool.query("UPDATE identity.channel_binding SET state='pending_verification' WHERE user_id=$1",[a.userId]);
    if(mutation==='consumed')await database.pool.query('UPDATE identity.verification_token_credential SET consumed_at=NULL WHERE channel_binding_id=$1',[a.channelId]);
    if(mutation==='age')await database.pool.query("UPDATE identity.age_check SET outcome='refused' WHERE user_id=$1",[a.userId]);
    if(mutation==='hold')await database.pool.query("INSERT INTO identity.account_security_hold(user_id,held,security_epoch,changed_at) VALUES($1,true,1,now()) ON CONFLICT(user_id) DO UPDATE SET held=true,security_epoch=1",[a.userId]);
    if(mutation==='expiry')await database.pool.query("UPDATE identity.verification_token_credential SET expires_at=issued_at+interval '1 microsecond' WHERE channel_binding_id=$1",[a.channelId]);
    await expect(mfa.verifyTotp({enrollmentToken:a.bearer,code:totpCode(b.secret)},source)).rejects.toThrow();
    expect((await state(a)).sessions).toBe(0);expect((await state(a)).state).toBe('pending_mfa');
    expect((await database.pool.query('SELECT state FROM identity.mfa_factor WHERE user_id=$1',[a.userId])).rows[0].state).toBe('pending');
  });
  it('rolls back factor, activation, bearer and session on failed durable audit and records risk only after commit',async()=>{
    const a=await account(),mfa=totpService(),b=await mfa.beginTotp({enrollmentToken:a.bearer},source),before=risks;
    await database.pool.query(`CREATE FUNCTION identity.totp_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.event_type='identity.mfa.totp.verified' THEN RAISE EXCEPTION 'TOTP_AUDIT_FAILURE';END IF;RETURN NEW;END$$;CREATE TRIGGER totp_fixture_fail BEFORE INSERT ON identity.audit_event FOR EACH ROW EXECUTE FUNCTION identity.totp_fixture_fail()`);
    try {
      await expect(mfa.verifyTotp({enrollmentToken:a.bearer,code:totpCode(b.secret)},source)).rejects.toThrow('TOTP_AUDIT_FAILURE');
      expect(await state(a)).toEqual({state:'pending_mfa',credentials:0,sessions:0});expect(risks).toBe(before);
      expect((await database.pool.query('SELECT state,last_accepted_step FROM identity.mfa_factor WHERE user_id=$1',[a.userId])).rows[0]).toEqual({state:'pending',last_accepted_step:null});
      expect((await database.pool.query('SELECT verification_token_hash FROM identity.channel_binding WHERE user_id=$1',[a.userId])).rows[0].verification_token_hash).toBe(hashToken('verification',a.bearer));
    } finally {await database.pool.query('DROP TRIGGER totp_fixture_fail ON identity.audit_event;DROP FUNCTION identity.totp_fixture_fail()');}
  });
  it('requires exact fresh ADD_TOTP authority and returns enrolled without another session',async()=>{
    const a=await enrolled(),mfa=totpService(),wrong=await addGrant(a,'ADD_PASSKEY');
    await expect(mfa.beginTotp({stepUpGrant:wrong.grant},source,wrong.session)).rejects.toThrow();
    const g=await addGrant({...a,result:{...a.result,sessionToken:wrong.replacement}},'ADD_TOTP'),b=await mfa.beginTotp({stepUpGrant:g.grant},source,g.session);
    expect(b.enrollment_token).not.toBe(a.bearer);expect(b.enrollment_token).not.toBe(g.grant);
    await expect(mfa.beginTotp({stepUpGrant:g.grant},source,g.session)).rejects.toThrow();
    await expect(mfa.verifyTotp({enrollmentToken:b.enrollment_token,code:totpCode(b.secret)},source)).rejects.toThrow();
    await expect(mfa.verifyTotp({enrollmentToken:b.enrollment_token,code:totpCode(b.secret)},source,g.session)).resolves.toEqual({status:'enrolled'});
    expect((await state(a)).sessions).toBe(1);
    await expect(mfa.verifyTotp({enrollmentToken:b.enrollment_token,code:totpCode(b.secret)},source,g.session)).rejects.toThrow();
    await expect(runtime.query('SELECT * FROM identity.consumer_totp_enrollment')).rejects.toMatchObject({code:'42501'});
  });
  it.each(['rotation','revocation','expiry','epoch'])('rechecks added-factor %s after begin',async mutation=>{
    const a=await enrolled(),mfa=totpService(),g=await addGrant(a,'ADD_TOTP'),b=await mfa.beginTotp({stepUpGrant:g.grant},source,g.session);
    if(mutation==='rotation')await database.pool.query('UPDATE identity.session SET token_hash=$2 WHERE session_id=$1',[g.session.session.session_id,hash(token())]);
    if(mutation==='revocation')await database.pool.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE session_id=$1',[g.session.session.session_id]);
    if(mutation==='expiry')await database.pool.query("UPDATE identity.consumer_totp_enrollment SET expires_at=created_at+interval '1 microsecond' WHERE user_id=$1",[a.userId]);
    if(mutation==='epoch')await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held,security_epoch,changed_at) VALUES($1,false,1,now()) ON CONFLICT(user_id) DO UPDATE SET security_epoch=1',[a.userId]);
    await expect(mfa.verifyTotp({enrollmentToken:b.enrollment_token,code:totpCode(b.secret)},source,g.session)).rejects.toThrow();
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.mfa_factor WHERE user_id=$1 AND state='pending'",[a.userId])).rows[0].n).toBe(1);
  });
  it('removes only an obsolete pending TOTP seed when passkey activation wins',async()=>{
    const a=await account();await totpService().beginTotp({enrollmentToken:a.bearer},source);
    const b=await service.beginPasskeyEnrollment({enrollment_token:a.bearer},source),f=consumerFixture();
    await service.completePasskeyEnrollment({challenge_handle:b.challenge_handle,credential:f.registration(b.options.challenge)},source);
    expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.mfa_factor WHERE user_id=$1',[a.userId])).rows[0].n).toBe(0);
  });
});

it('offers passkey-only password continuation and cancellation cannot produce password-only access',async()=>{
  const a=await enrolled(),argon2=new Argon2WorkerPool({workers:1});await argon2.ready();
  try {
    const authPolicy=authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS),password='Task8 passkey-only password!',email=`task8-${randomUUID()}@example.test`,blindIndexKey=Buffer.alloc(32,5);
    const passwordHash=await hashPassword(argon2,password,authPolicy.password.argon2id);
    await database.pool.query('UPDATE identity."user" SET email_blind_index=$2,password_hash=$3 WHERE user_id=$1',[a.userId,createEmailBlindIndex(blindIndexKey,email),passwordHash]);
    const actual=await SessionService.create({repository:new PostgresSessionRepository(runtime,audit),riskSignals:{recordForSession:async()=> 'recorded'} as never,onRiskSignalFailure:()=>{},dekStore:{} as never,argon2,authPolicy,mfaPolicy:mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value),sessionPolicy:sessionPolicyFromValue(SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.value,SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef),blindIndexKey,dummyPasswordHash:passwordHash});
    const begun=await actual.beginLogin({email,password},source);
    expect(begun.availableMethods).toEqual(['passkey']);expect((await state(a)).sessions).toBe(1);
    const passkeys=new ConsumerWebAuthnService(repo,actual.consumerProducer(),{publicAppUrl:origin});
    const cancelled=await passkeys.beginPasskeyLogin({continuation_token:begun.challengeToken},source);
    expect(cancelled.options.userVerification).toBe('required');
    await expect(actual.completeLogin({challengeToken:begun.challengeToken,code:''},source)).rejects.toMatchObject({code:'AUTH_CREDENTIALS_INVALID'});
    await expect(actual.completeLogin({challengeToken:begun.challengeToken,code:'123456'},source)).rejects.toMatchObject({code:'AUTH_CREDENTIALS_INVALID'});
    expect((await state(a)).sessions).toBe(1);
    const result=await passkeys.completePasskeyLogin({challenge_handle:cancelled.challenge_handle,credential:a.f.assertion(cancelled.options.challenge,{userHandle:a.userHandle})},source);
    expect(await actual.authenticate(result.sessionToken,source)).toMatchObject({userId:a.userId});expect((await state(a)).sessions).toBe(2);
  } finally {await argon2.close();}
});

it('replaces own pending TOTP at full source capacity and cleans abandoned seeds without touching active factors',async()=>{
  const owned:Array<{a:Awaited<ReturnType<typeof enrolled>>;g:Awaited<ReturnType<typeof addGrant>>;b:Awaited<ReturnType<MfaEnrollmentService['beginTotp']>>}>=[];
  const sourceKey='192.0.2.222';
  try {
    for(let i=0;i<5;i++) {
      const a=await enrolled();source.ip=sourceKey;const g=await addGrant(a,'ADD_TOTP');
      const b=await totpService(repo,(await freshSessions()).consumerProducer()).beginTotp({stepUpGrant:g.grant},source,g.session);owned.push({a,g,b});
    }
    const first=owned[0]!;source.ip=sourceKey;
    const g=await addGrant({...first.a,result:{...first.a.result,sessionToken:first.g.replacement}},'ADD_TOTP');
    const b=await totpService(repo,(await freshSessions()).consumerProducer()).beginTotp({stepUpGrant:g.grant},source,g.session);
    expect(b.enrollment_token).not.toBe(first.b.enrollment_token);
    expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.consumer_totp_enrollment WHERE retention_hash=(SELECT retention_hash FROM identity.consumer_totp_enrollment WHERE user_id=$1)',[first.a.userId])).rows[0].n).toBe(5);
    const extra=await enrolled();source.ip=sourceKey;const extraGrant=await addGrant(extra,'ADD_TOTP');
    await expect(totpService(repo,(await freshSessions()).consumerProducer()).beginTotp({stepUpGrant:extraGrant.grant},source,extraGrant.session)).rejects.toMatchObject({code:'MFA_RATE_LIMITED'});
    expect((await database.pool.query('SELECT consumed_at FROM identity.step_up_grant WHERE token_hash=$1',[hashToken('step-up-grant',extraGrant.grant)])).rows[0].consumed_at).toBeNull();
    const oldFactor=(await database.pool.query('SELECT factor_id FROM identity.consumer_totp_enrollment WHERE user_id=$1',[first.a.userId])).rows[0].factor_id;
    const activeCount=(await database.pool.query("SELECT count(*)::int AS n FROM identity.mfa_factor WHERE user_id=$1 AND state='active'",[first.a.userId])).rows[0].n;
    await database.pool.query("UPDATE identity.consumer_totp_enrollment SET expires_at=created_at+interval '1 microsecond' WHERE user_id=$1",[first.a.userId]);
    await runtime.query('SELECT identity.prune_totp_addition($1)',[first.a.userId]);
    expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.mfa_factor WHERE mfa_factor_id=$1',[oldFactor])).rows[0].n).toBe(0);
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.mfa_factor WHERE user_id=$1 AND state='active'",[first.a.userId])).rows[0].n).toBe(activeCount);
    await expect(totpService(repo,(await freshSessions()).consumerProducer()).beginTotp({stepUpGrant:extraGrant.grant},source,extraGrant.session)).resolves.toMatchObject({status:'verification_required'});
  } finally {for(const {a} of owned) {await database.pool.query("UPDATE identity.consumer_totp_enrollment SET expires_at=created_at+interval '1 microsecond' WHERE user_id=$1",[a.userId]);await runtime.query('SELECT identity.prune_totp_addition($1)',[a.userId]);}}
});

it('checks the verified TOTP bearer deadline after waiting for a factor lock',async()=>{
  const a=await account(),mfa=totpService(),b=await mfa.beginTotp({enrollmentToken:a.bearer},source),producer=sessions.consumerProducer();
  const lookup={enrollmentTokenHash:hashToken('verification',a.bearer),additionHandleHash:additionHash(a.bearer),bindingHash:producer.bindingHash(source)};
  const e=(await repo.readTotpEnrollment(lookup))!,material=producer.prepare(source),legal=(['TERMS','PRIVACY'] as const).map(kind=>({kind,locale:'en',...currentDocument(kind,'en')!}));
  const blocker=await database.pool.connect(),client=await runtime.connect();let blockerOpen=false;
  try {
    await database.pool.query("UPDATE identity.verification_token_credential SET expires_at=clock_timestamp()+interval '250 milliseconds' WHERE channel_binding_id=$1",[a.channelId]);
    await blocker.query('BEGIN');blockerOpen=true;await blocker.query('SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=$1 FOR UPDATE',[e.factorId]);
    const facade={connect:async()=>({query:client.query.bind(client),release:()=>{}})} as unknown as Pool;
    const pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const operation=new PostgresConsumerAuthRepository(facade,audit).completeTotpEnrollment({...lookup,passwordHashSnapshot:e.passwordHash,passwordUsable:sessions.consumerProducer().passwordUsable?.(e.passwordHash)??false,userId:e.userId,factorId:e.factorId,secretCiphertext:e.secretCiphertext,acceptedStep:Math.floor(Date.now()/30000),material:{sessionId:material.sessionId,sessionTokenHash:material.sessionTokenHash,csrfTokenHash:material.csrfTokenHash,sessionBindingContext:material.sessionBindingContext,idleExpiresAt:material.idleExpiresAt,absoluteExpiresAt:material.absoluteExpiresAt}},legal,source);
    const denial=expect(operation).rejects.toThrow('CONSUMER_AUTH_INVALID');await pending(pid);await new Promise(r=>setTimeout(r,300));await blocker.query('ROLLBACK');blockerOpen=false;await denial;
    expect(await state(a)).toEqual({state:'pending_mfa',credentials:0,sessions:0});
  } finally {if(blockerOpen)await blocker.query('ROLLBACK');blocker.release();client.release();}
});

it('retains interrupted enrollment resume while retiring every runtime type-back activation capability',async()=>{
  for(const pendingState of ['verified_pending_recovery','recovery_pending']) {
    const a=await account(),mfa=totpService(),b=await mfa.beginTotp({enrollmentToken:a.bearer},source);
    await database.pool.query('UPDATE identity.mfa_factor SET state=$2 WHERE user_id=$1',[a.userId,pendingState]);
    await expect(mfa.beginTotp({enrollmentToken:a.bearer},source)).rejects.toMatchObject({code:'MFA_ENROLLMENT_STATE_INVALID'});
    await expect(mfa.confirmRecoveryCode({enrollmentToken:a.bearer,recoveryCode:'unused'},source)).rejects.toMatchObject({code:'MFA_ENROLLMENT_STATE_INVALID'});
    await expect(mfa.verifyTotp({enrollmentToken:a.bearer,code:totpCode(b.secret)},source)).resolves.toMatchObject({status:'authenticated'});
  }
  expect((await database.pool.query("SELECT has_function_privilege('consumer_test_runtime','identity.activate_mfa_enrollment_with_audit(text,uuid,timestamptz,jsonb)','EXECUTE') AS allowed")).rows[0].allowed).toBe(false);
  await expect(runtime.query('SELECT identity.activate_mfa_enrollment_with_audit($1,$2,$3,$4)',[hash(token()),randomUUID(),new Date(),{}])).rejects.toMatchObject({code:'42501'});
});

it('rolls back replacement of a pending addition, including the grant, when begin audit fails',async()=>{
  const a=await enrolled(),g=await addGrant(a,'ADD_TOTP'),mfa=totpService(),b=await mfa.beginTotp({stepUpGrant:g.grant},source,g.session);
  const nextGrant=await addGrant({...a,result:{...a.result,sessionToken:g.replacement}},'ADD_TOTP');
  const before=(await database.pool.query('SELECT * FROM identity.consumer_totp_enrollment WHERE user_id=$1',[a.userId])).rows[0];
  await database.pool.query(`CREATE FUNCTION identity.totp_begin_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.event_type='identity.mfa.totp.begin' THEN RAISE EXCEPTION 'TOTP_BEGIN_AUDIT_FAILURE';END IF;RETURN NEW;END$$;CREATE TRIGGER totp_begin_fixture_fail BEFORE INSERT ON identity.audit_event FOR EACH ROW EXECUTE FUNCTION identity.totp_begin_fixture_fail()`);
  try {
    await expect(mfa.beginTotp({stepUpGrant:nextGrant.grant},source,nextGrant.session)).rejects.toThrow('TOTP_BEGIN_AUDIT_FAILURE');
    expect((await database.pool.query('SELECT * FROM identity.consumer_totp_enrollment WHERE user_id=$1',[a.userId])).rows[0]).toEqual(before);
    expect((await database.pool.query('SELECT consumed_at FROM identity.step_up_grant WHERE token_hash=$1',[hashToken('step-up-grant',nextGrant.grant)])).rows[0].consumed_at).toBeNull();
    expect((await database.pool.query('SELECT state FROM identity.mfa_factor WHERE mfa_factor_id=$1',[before.factor_id])).rows[0].state).toBe('pending');
  } finally {await database.pool.query('DROP TRIGGER totp_begin_fixture_fail ON identity.audit_event;DROP FUNCTION identity.totp_begin_fixture_fail()');}
});

it('cleanup waits for a verified addition account without holding a global or challenge lock',async()=>{
  const a=await enrolled(),g=await addGrant(a,'ADD_TOTP'),b=await totpService().beginTotp({stepUpGrant:g.grant},source,g.session);
  const completingClient=await runtime.connect(),cleanupClient=await runtime.connect(),locked=deferred(),resume=deferred();
  const facade={query:completingClient.query.bind(completingClient),connect:async()=>({query:async(sql:string,values?:unknown[])=>{
    if(sql.includes('identity.complete_secure_totp_enrollment')) {await completingClient.query('SELECT identity.assert_session_current($1,$2,$3)',[a.userId,g.session.session.session_id,g.session.tokenHash]);locked.resolve();await resume.promise;}
    return completingClient.query(sql,values);
  },release:()=>{}})} as unknown as Pool;
  const result=totpService(new PostgresConsumerAuthRepository(facade,audit)).verifyTotp({enrollmentToken:b.enrollment_token,code:totpCode(b.secret)},source,g.session);
  const outcome=result.then(value=>value,error=>error);let cleanup:Promise<unknown>|undefined;
  try {
    await Promise.race([locked.promise,outcome.then(()=>{throw Error('DID_NOT_PAUSE');})]);
    await database.pool.query("UPDATE identity.consumer_totp_enrollment SET expires_at=created_at+interval '1 microsecond' WHERE user_id=$1",[a.userId]);
    const pid=(await cleanupClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    cleanup=cleanupClient.query('SELECT identity.prune_totp_addition($1)',[a.userId]);await pending(pid);
    expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.consumer_totp_enrollment WHERE user_id=$1',[a.userId])).rows[0].n).toBe(1);
    resume.resolve();expect(await outcome).toMatchObject({code:'MFA_ENROLLMENT_INVALID'});await cleanup;
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.mfa_factor WHERE user_id=$1 AND state='pending'",[a.userId])).rows[0].n).toBe(0);
  } finally {resume.resolve();await Promise.allSettled([result,...(cleanup?[cleanup]:[])]);completingClient.release();cleanupClient.release();}
});

it('produces ADD_TOTP from genuinely verified password/TOTP step-up and keeps the authenticated session',async()=>{
  const a=await account(),mfa=totpService(),b=await mfa.beginTotp({enrollmentToken:a.bearer},source),signed=await mfa.verifyTotp({enrollmentToken:a.bearer,code:totpCode(b.secret)},source);
  if(signed.status!=='authenticated')throw Error('NO_SESSION');
  const argon2=new Argon2WorkerPool({workers:1});await argon2.ready();
  try {
    const authPolicy=authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS),password='Task8 real additional TOTP proof!',passwordHash=await hashPassword(argon2,password,authPolicy.password.argon2id);
    await database.pool.query('UPDATE identity."user" SET password_hash=$2 WHERE user_id=$1',[a.userId,passwordHash]);
    const actual=await SessionService.create({repository:new PostgresSessionRepository(runtime,audit),riskSignals:{recordForSession:async()=> 'recorded'} as never,onRiskSignalFailure:()=>{},dekStore:{load:async()=>Buffer.from(totpDek)} as never,argon2,authPolicy,mfaPolicy:mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value),sessionPolicy:sessionPolicyFromValue(SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.value,SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef),blindIndexKey:Buffer.alloc(32,5),dummyPasswordHash:passwordHash});
    const current=(await actual.authenticate(signed.sessionToken,source))!;
    const rotated=await actual.stepUp({session:current,password,code:totpCodeAtStep(decodeBase32(b.secret),Math.floor(Date.now()/30000)+1),authorization:{action:'ADD_TOTP'}},source);
    const fresh=(await actual.authenticate(rotated.sessionToken,source))!;expect(fresh).not.toBeNull();
    const added=await mfa.beginTotp({stepUpGrant:rotated.grantToken!},source,fresh);
    await expect(mfa.verifyTotp({enrollmentToken:added.enrollment_token,code:totpCode(added.secret)},source,fresh)).resolves.toEqual({status:'enrolled'});
    expect((await state(a)).sessions).toBe(1);expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.mfa_factor WHERE user_id=$1 AND state='active'",[a.userId])).rows[0].n).toBe(2);
  } finally {await argon2.close();}
});

it('enforces the policy8192 addition capacity across fresh processes, admits own replacement and incrementally cleans expired seeds',async()=>{
  while(true) {const candidates=(await runtime.query('SELECT user_id FROM identity.expired_totp_addition_candidates(5)')).rows;if(!candidates.length)break;for(const c of candidates)await runtime.query('SELECT identity.prune_totp_addition($1)',[c.user_id]);}
  const a=await enrolled(),g=await addGrant(a,'ADD_TOTP'),b=await totpService().beginTotp({stepUpGrant:g.grant},source,g.session);
  const extra=await enrolled(),extraGrant=await addGrant(extra,'ADD_TOTP'),sourceForExtra={...source};
  const retained=(await database.pool.query('SELECT count(*)::int AS n FROM identity.consumer_totp_enrollment')).rows[0].n;
  const ids=Array.from({length:8192-retained},()=>randomUUID());
  try {
    await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) SELECT id,decode(md5(id::text)||md5('email'||id::text),'hex'),'{}','fixture',id::text,'active',clock_timestamp() FROM unnest($1::uuid[]) id`,[ids]);
    await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at) SELECT id,id,'totp','{}','pending',clock_timestamp() FROM unnest($1::uuid[]) id`,[ids]);
    await database.pool.query(`INSERT INTO identity.consumer_totp_enrollment(user_id,factor_id,handle_hash,retention_hash,binding_hash,ordinary_session_id,ordinary_token_hash,account_security_epoch,created_at,expires_at)
      SELECT id,id,'sha256:'||md5(id::text)||md5('handle'||id::text),'sha256:'||md5(id::text)||md5('source'||id::text),'sha256:'||repeat('a',64),id,'sha256:'||repeat('b',64),0,clock_timestamp(),clock_timestamp()+interval '4 minutes' FROM unnest($1::uuid[]) id`,[ids]);
    expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.consumer_totp_enrollment')).rows[0].n).toBe(8192);
    await expect(totpService(repo,(await freshSessions()).consumerProducer()).beginTotp({stepUpGrant:extraGrant.grant},sourceForExtra,extraGrant.session)).rejects.toMatchObject({code:'MFA_RATE_LIMITED'});
    const replacementGrant=await addGrant({...a,result:{...a.result,sessionToken:g.replacement}},'ADD_TOTP');
    await expect(totpService(repo,(await freshSessions()).consumerProducer()).beginTotp({stepUpGrant:replacementGrant.grant},source,replacementGrant.session)).resolves.toMatchObject({status:'verification_required'});
    expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.consumer_totp_enrollment')).rows[0].n).toBe(8192);
    await database.pool.query("UPDATE identity.consumer_totp_enrollment SET expires_at=created_at+interval '1 microsecond' WHERE user_id=ANY($1::uuid[])",[ids.slice(0,5)]);
    await expect(totpService(repo,(await freshSessions()).consumerProducer()).beginTotp({stepUpGrant:extraGrant.grant},sourceForExtra,extraGrant.session)).resolves.toMatchObject({status:'verification_required'});
    expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.mfa_factor WHERE mfa_factor_id=ANY($1::uuid[])',[ids.slice(0,5)])).rows[0].n).toBe(0);
  } finally {await database.pool.query('DELETE FROM identity.consumer_totp_enrollment WHERE user_id=ANY($1::uuid[])',[ids]);await database.pool.query('DELETE FROM identity.mfa_factor WHERE user_id=ANY($1::uuid[])',[ids]);await database.pool.query('DELETE FROM identity."user" WHERE user_id=ANY($1::uuid[])',[ids]);}
});
