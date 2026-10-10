import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createPool, migrate, PostgresConsumerRecoveryRepository, PostgresConsumerAuthRepository, PostgresOnboardingEvidenceRepository, PostgresSessionRepository, PostgresConsumerSecurityRepository, PostgresIdentityRepository, PostgresRecoveryStartRepository, PostgresConsumerSecurityNoticeRepository, type Pool } from '@debateai/db';
import { Argon2WorkerPool, encrypt, generateRecoveryCode, generateTotpSecret, hashRecoveryCode, hashPassword, hashToken, decodeBase32, totpCodeAtStep, createEmailBlindIndex, type AuditContextHasher } from '@debateai/crypto';
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, SESSION_POLICY_DEPLOYMENT_REGISTER_ROW, sessionPolicyFromValue, CONSUMER_RECOVERY_POLICY_REGISTER_ROW, consumerRecoveryPolicyFromValue } from '@debateai/register';
import { currentDocument } from '@debateai/legal-manifest';
import { ConsumerRecoveryService } from '../../apps/api/src/consumer-recovery.js';
import { OnboardingEvidenceService } from '../../apps/api/src/onboarding-evidence.js';
import { ConsumerWebAuthnService } from '../../apps/api/src/consumer-webauthn.js';
import { ConsumerSecurityNoticeReconciler } from '../../apps/api/src/consumer-security-notices.js';
import { ConsumerSecurityService } from '../../apps/api/src/consumer-security.js';
import { MfaEnrollmentService } from '../../apps/api/src/mfa.js';
import { RecoveryStartService, RECOVERY_START_PUBLIC_RESPONSE } from '../../apps/api/src/recovery.js';
import { SessionService } from '../../apps/api/src/sessions.js';
import { consumerFixture, origin, rpId, b64 } from '../support/consumerWebAuthnFixtures.js';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
let db: TestDatabase, runtime: Pool, p2Runtime: Pool, argon2: Argon2WorkerPool, passwordHash: string;
const audit = { hashSourceIp: async () => 'ab'.repeat(32), hashUserAgent: async () => 'cd'.repeat(32) } as unknown as AuditContextHasher;
const mfaPolicy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value), authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), blindKey = Buffer.alloc(32, 7), recordsKey = Buffer.alloc(32, 9);
let sequence = 0;
beforeAll(async () => { db = await startTestDatabase(); await migrate(db.pool); await db.pool.query("CREATE ROLE recovery_journey LOGIN PASSWORD 'journey-test-only' IN ROLE debateai_authorization_runtime"); const u = new URL(db.connectionString); u.username = 'recovery_journey'; u.password = 'journey-test-only'; runtime = createPool(u.toString()); await db.pool.query("CREATE ROLE p2_recovery_journey LOGIN PASSWORD 'journey-test-only' IN ROLE debateai_runtime"); u.username = 'p2_recovery_journey'; p2Runtime = createPool(u.toString()); argon2 = new Argon2WorkerPool({ workers: 1 }); await argon2.ready(); passwordHash = await hashPassword(argon2, 'Strong fixture password 123!', authPolicy.password.argon2id); }, 120000);
afterAll(async () => { await argon2?.close(); await runtime?.end(); await p2Runtime?.end(); await db?.stop(); });
async function account() {
    const userId = randomUUID(), channelId = randomUUID(), dek = randomBytes(32), email = `recovery-${userId}@example.test`, code = generateRecoveryCode(1), codeHash = await hashRecoveryCode(argon2, code, mfaPolicy.recoveryCodes.argon2id), source = { ip: `198.51.100.${++sequence}`, userAgent: 'recovery-journey', requestId: randomUUID(), countryCode: 'RO' }, old = consumerFixture();
    const cipher = encrypt(dek, Buffer.from(email), ['identity', 'user.email_ciphertext', userId, 'run:none', userId, `user-dek:${userId}`, '1']);
    const ownerRef = (await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1::uuid,$2,$3,$4,$1::text,'active',now()) RETURNING owner_ref`, [userId, createEmailBlindIndex(blindKey, email), cipher, passwordHash])).rows[0].owner_ref;
    await db.pool.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,$2,'email',$3,'verified',now(),now())`, [channelId, userId, cipher]);
    await db.pool.query('INSERT INTO identity.recovery_code(recovery_code_id,user_id,code_slot,code_hash,created_at) VALUES($1,$2,1,$3,now())', [randomUUID(), userId, codeHash]);
    await db.pool.query('INSERT INTO identity.consumer_passkey_subject VALUES($1,$2)', [userId, old.handle]);
    await db.pool.query(`INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin) VALUES($1,$2,$3,0,'multiDevice',true,$4,$5)`, [userId, old.credentialId, b64(old.k.wire), rpId, origin]);
    const users = { load: async (id: string) => { if (id !== userId)
            throw new Error('WRONG_DEK'); return Buffer.from(dek); } };
    const sessions = await SessionService.create({ repository: new PostgresSessionRepository(runtime, audit), riskSignals: { recordForSession: async () => 'recorded' } as never, onRiskSignalFailure: () => { }, dekStore: users as never, argon2, authPolicy, mfaPolicy, sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef), blindIndexKey: blindKey, dummyPasswordHash: passwordHash });
    const delivered: {
        recipient: string;
        token: string;
        expiresAt: Date;
    }[] = [];
    const recovery = new ConsumerRecoveryService(new PostgresConsumerRecoveryRepository(runtime, audit), sessions.consumerProducer(), { publicAppUrl: origin, users: users as never, argon2, mfaPolicy, authPolicy, policy: consumerRecoveryPolicyFromValue(CONSUMER_RECOVERY_POLICY_REGISTER_ROW.value, CONSUMER_RECOVERY_POLICY_REGISTER_ROW.sourceRef), blindIndexKey: blindKey, mail: { sendRecovery: async (m) => { delivered.push(m); } }, onMailFailure: () => { throw new Error('UNEXPECTED_DELIVERY_FAILURE'); } });
    const evidence = new OnboardingEvidenceService(new PostgresOnboardingEvidenceRepository(runtime, audit), sessions.consumerProducer(), recordsKey), passkeys = new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(runtime, audit), sessions.consumerProducer(), { publicAppUrl: origin });
    return { userId, ownerRef, channelId, code, email, source, old, delivered, recovery, evidence, passkeys, sessions, users };
}
/** Design note 2026-10-09 item 3: a used code is no longer refilled, so a restart needs another saved code. */
async function secondCode(a: Awaited<ReturnType<typeof account>>) { const code = generateRecoveryCode(2); await db.pool.query('INSERT INTO identity.recovery_code(recovery_code_id,user_id,code_slot,code_hash,created_at) VALUES($1,$2,2,$3,now())', [randomUUID(), a.userId, await hashRecoveryCode(argon2, code, mfaPolicy.recoveryCodes.argon2id)]); return code; }
async function proof(a: Awaited<ReturnType<typeof account>>, code = a.code) { const send = await a.recovery.prepareStart({ email: a.email }, a.source); await send?.(); expect(a.delivered.at(-1)?.recipient).toBe(a.email); return a.recovery.prove({ token: a.delivered.at(-1)!.token, recovery_code: code, method: 'passkey' }, a.source); }
async function accept(a: Awaited<ReturnType<typeof account>>, cap: string) { const status = await a.evidence.status('RECOVERY', { recovery_capability: cap, locale: 'en' }, a.source); await a.evidence.complete('RECOVERY', { recovery_capability: cap, locale: 'en', terms: currentDocument('TERMS', 'en'), privacy: currentDocument('PRIVACY', 'en'), terms_accepted: true, privacy_acknowledged: true, adult_affirmed: true, ...(status.age_confirmation_required ? { date_of_birth: '1990-01-01' } : {}) }, a.source); }
describe('real consumer recovery crypto and replacement journeys', () => {
    it('accepts both proofs only, completes one signed UV replacement, and denies old methods while gated', async () => {
        const a = await account(), p = await proof(a);
        expect(p.status).toBe('RECOVERY_ENROLL_ONLY');
        expect(p).not.toHaveProperty('session');
        expect(p).not.toHaveProperty('replacement_recovery_code');
        const login = await a.passkeys.beginPasskeyLogin({}, a.source);
        await expect(a.passkeys.completePasskeyLogin({ challenge_handle: login.challenge_handle, credential: a.old.assertion(login.options.challenge) }, a.source)).rejects.toThrow();
        await expect(a.recovery.prove({ token: a.delivered[0]!.token, recovery_code: a.code, method: 'passkey' }, a.source)).rejects.toThrow();
        await accept(a, p.recovery_capability);
        const o = await a.recovery.beginEnrollment({ recovery_capability: p.recovery_capability, method: 'passkey' }, a.source);
        if (o.method !== 'passkey')
            throw new Error('WRONG_METHOD');
        const fresh = consumerFixture();
        expect((await db.pool.query("SELECT count(*)::int n FROM identity.audit_event WHERE actor_key_ref=(SELECT audit_token::text FROM identity.\"user\" WHERE user_id=$1) AND event_type='identity.consumer_security.RECOVERY_PROVED'", [a.userId])).rows[0].n).toBe(1);
        const input = { recovery_capability: p.recovery_capability, challenge_handle: o.challenge_handle, credential: fresh.registration(o.options.challenge) };
        const outcomes = await Promise.allSettled([a.recovery.completeEnrollment(input, a.source), a.recovery.completeEnrollment(input, a.source)]);
        expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
        const result = outcomes.find(x => x.status === 'fulfilled');
        if (result?.status !== 'fulfilled')
            throw new Error('NO_SESSION');
        expect(await a.sessions.authenticate(result.value.sessionToken, a.source)).toMatchObject({ userId: a.userId });
        expect((await db.pool.query('SELECT count(*)::int n FROM identity.consumer_passkey_credential WHERE user_id=$1 AND revoked_at IS NULL', [a.userId])).rows[0].n).toBe(1);
        expect((await db.pool.query('SELECT count(*)::int n FROM identity.recovery_code WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL', [a.userId])).rows[0].n).toBe(0);
        await expect(a.evidence.status('RECOVERY', { recovery_capability: p.recovery_capability, locale: 'en' }, a.source)).rejects.toThrow();
    });
    it('switches to verified TOTP within the original deadline and invalidates the prior signed ceremony', async () => {
        const a = await account(), p = await proof(a);
        await accept(a, p.recovery_capability);
        const one = await a.recovery.beginEnrollment({ recovery_capability: p.recovery_capability, method: 'passkey' }, a.source);
        if (one.method !== 'passkey')
            throw new Error('WRONG_METHOD');
        const two = await a.recovery.beginEnrollment({ recovery_capability: p.recovery_capability, method: 'totp' }, a.source);
        if (two.method !== 'totp')
            throw new Error('WRONG_METHOD');
        expect(two.expires_at).toBe(one.expires_at);
        await expect(a.recovery.completeEnrollment({ recovery_capability: p.recovery_capability, challenge_handle: one.challenge_handle, credential: consumerFixture().registration(one.options.challenge) }, a.source)).rejects.toThrow();
        const secret = decodeBase32(two.secret);
        const result = await a.recovery.completeEnrollment({ recovery_capability: p.recovery_capability, challenge_handle: two.challenge_handle, code: totpCodeAtStep(secret, Math.floor(Date.now() / 30000)) }, a.source);
        secret.fill(0);
        expect(result.status).toBe('authenticated');
        expect((await db.pool.query("SELECT count(*)::int n FROM identity.mfa_factor WHERE user_id=$1 AND state='active'", [a.userId])).rows[0].n).toBe(1);
    });
    it('restarts after capability expiry using a fresh mailed token plus another saved code, never a refilled one', async () => {
        const a = await account(), p = await proof(a), another = await secondCode(a);
        expect((await db.pool.query('SELECT count(*)::int n FROM identity.recovery_code WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL', [a.userId])).rows[0].n).toBe(1);
        await db.pool.query("UPDATE identity.consumer_recovery_gate SET cap_expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1", [a.userId]);
        await db.pool.query("UPDATE identity.consumer_recovery_reservation SET reserved_at=reserved_at-interval '61 seconds' WHERE user_id=$1", [a.userId]);
        await expect(a.recovery.beginEnrollment({ recovery_capability: p.recovery_capability, method: 'passkey' }, a.source)).rejects.toThrow();
        const next = await proof(a, another);
        expect(next.recovery_capability).not.toBe(p.recovery_capability);
        expect(next).not.toHaveProperty('replacement_recovery_code');
        expect((await db.pool.query('SELECT count(*)::int n FROM identity.recovery_code WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL', [a.userId])).rows[0].n).toBe(0);
    });
    it('composes actual P2 request persistence and independent consumer token delivery behind the same generic start', async () => {
        const a = await account();
        let risks = 0;
        const composite = new RecoveryStartService({ repository: new PostgresRecoveryStartRepository(p2Runtime, audit, a.users as never), consumerPrepare: (input, source) => a.recovery.prepareStart(input, source), mailDispatch: { dispatchRecoveryMail: async (prepare) => { const work = await prepare(); await work?.(); } }, riskSignals: { recordForRecovery: async () => { risks++; return 'recorded'; } }, onRiskSignalFailure: () => { throw new Error('RISK_FAILURE'); }, blindIndexKey: blindKey, enumerationFloorMs: 1, publicResponsePolicy: 'ENUMERATION_RESISTANT_GENERIC' });
        expect(await composite.start({ email: a.email }, a.source)).toEqual(RECOVERY_START_PUBLIC_RESPONSE);
        expect(risks).toBe(1);
        expect(a.delivered).toHaveLength(1);
        expect((await db.pool.query('SELECT count(*)::int n FROM identity.account_recovery_binding WHERE user_id=$1', [a.userId])).rows[0].n).toBe(1);
        expect((await db.pool.query('SELECT count(*)::int n FROM identity.consumer_recovery_token WHERE user_id=$1', [a.userId])).rows[0].n).toBe(1);
    });
    it('uses genuinely signed passkey ADD_TOTP and regeneration grants, preserving password plus saved-code consume-and-replace', async () => {
        const a = await account(), m = a.sessions.consumerProducer().prepare(a.source);
        await db.pool.query('SELECT identity.insert_consumer_session_internal($1,$2,$3)', [a.userId, { sessionId: m.sessionId, sessionTokenHash: m.sessionTokenHash, csrfTokenHash: m.csrfTokenHash, sessionBindingContext: m.sessionBindingContext, idleExpiresAt: m.idleExpiresAt, absoluteExpiresAt: m.absoluteExpiresAt }, m.bindingHash]);
        const initial = await a.sessions.authenticate(m.sessionToken, a.source);
        if (!initial)
            throw new Error('NO_INITIAL_SESSION');
        const security = new ConsumerSecurityService(new PostgresConsumerSecurityRepository(runtime, audit), a.sessions.consumerProducer(), { publicAppUrl: origin, argon2, mfaPolicy, authPolicy });
        const methods = await security.authMethods(initial);
        expect(methods.methods).toHaveLength(1);
        expect(methods.methods[0]!.created_at).toMatch(/Z$/);
        const options = await security.beginPasskeyStepUp({ authorization: { action: 'ADD_TOTP' } }, initial, a.source);
        await expect(security.completePasskeyStepUp({ challenge_handle: options.challenge_handle, credential: a.old.assertion(options.options.challenge, { signature: Buffer.alloc(64) }) }, initial, a.source)).rejects.toThrow();
        const rotated = await security.completePasskeyStepUp({ challenge_handle: options.challenge_handle, credential: a.old.assertion(options.options.challenge) }, initial, a.source);
        expect(rotated.response.step_up_grant?.action).toBe('ADD_TOTP');
        expect(await a.sessions.authenticate(m.sessionToken, a.source)).toBeNull();
        const current = await a.sessions.authenticate(rotated.sessionToken, a.source);
        if (!current || !rotated.response.step_up_grant)
            throw new Error('NO_ROTATED_SESSION');
        const mfa = new MfaEnrollmentService({ repository: new PostgresIdentityRepository(p2Runtime, audit), consumerRepository: new PostgresConsumerAuthRepository(runtime, audit), sessions: a.sessions.consumerProducer(), dekStore: a.users as never, argon2, policy: mfaPolicy });
        const totp = await mfa.beginTotp({ stepUpGrant: rotated.response.step_up_grant.token }, a.source, current), secret = decodeBase32(totp.secret);
        expect(await mfa.verifyTotp({ enrollmentToken: totp.enrollment_token, code: totpCodeAtStep(secret, Math.floor(Date.now() / 30000)) }, a.source, current)).toEqual({ status: 'enrolled' });
        secret.fill(0);
        const codesOptions = await security.beginPasskeyStepUp({ authorization: { action: 'REGENERATE_RECOVERY_CODES' } }, current, a.source), codesProof = await security.completePasskeyStepUp({ challenge_handle: codesOptions.challenge_handle, credential: a.old.assertion(codesOptions.options.challenge) }, current, a.source), codesSession = await a.sessions.authenticate(codesProof.sessionToken, a.source);
        if (!codesSession || !codesProof.response.step_up_grant)
            throw new Error('NO_CODE_GRANT');
        const codes = await security.regenerateRecoveryCodes({ step_up_grant: codesProof.response.step_up_grant.token }, codesSession, a.source);
        expect(codes.codes).toHaveLength(10);
        await expect(security.regenerateRecoveryCodes({ step_up_grant: codesProof.response.step_up_grant.token }, codesSession, a.source)).rejects.toThrow();
        const login = await a.sessions.beginLogin({ email: a.email, password: 'Strong fixture password 123!' }, a.source);
        const result = await a.sessions.completeLogin({ challengeToken: login.challengeToken, code: codes.codes[0]! }, a.source);
        expect(result.status).toBe('authenticated');
        expect(result).not.toHaveProperty('replacementRecoveryCode');
        expect((await db.pool.query('SELECT count(*)::int n FROM identity.recovery_code WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL', [a.userId])).rows[0].n).toBe(9);
    });
    it('rolls back replacement, cap consumption, gate clearing and session creation when immutable audit append fails', async () => {
        const a = await account(), p = await proof(a);
        await accept(a, p.recovery_capability);
        const o = await a.recovery.beginEnrollment({ recovery_capability: p.recovery_capability, method: 'passkey' }, a.source);
        if (o.method !== 'passkey')
            throw new Error('WRONG_METHOD');
        const input = { recovery_capability: p.recovery_capability, challenge_handle: o.challenge_handle, credential: consumerFixture().registration(o.options.challenge) };
        await db.pool.query(`CREATE FUNCTION identity.task9_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.event_type='identity.consumer_security.RECOVERY_COMPLETED' THEN RAISE EXCEPTION 'TASK9_AUDIT_FAILURE';END IF;RETURN NEW;END$$;CREATE TRIGGER task9_fail_audit BEFORE INSERT ON identity.audit_event FOR EACH ROW EXECUTE FUNCTION identity.task9_fail_audit()`);
        try {
            await expect(a.recovery.completeEnrollment(input, a.source)).rejects.toThrow('TASK9_AUDIT_FAILURE');
            expect((await db.pool.query('SELECT active FROM identity.consumer_recovery_gate WHERE user_id=$1', [a.userId])).rows[0].active).toBe(true);
            expect((await db.pool.query('SELECT count(*)::int n FROM identity.session WHERE user_id=$1', [a.userId])).rows[0].n).toBe(0);
            expect((await db.pool.query('SELECT count(*)::int n FROM identity.consumer_passkey_credential WHERE user_id=$1 AND revoked_at IS NULL', [a.userId])).rows[0].n).toBe(1);
        }
        finally {
            await db.pool.query('DROP TRIGGER task9_fail_audit ON identity.audit_event;DROP FUNCTION identity.task9_fail_audit()');
        }
        expect((await a.recovery.completeEnrollment(input, a.source)).status).toBe('authenticated');
    });
    it('keeps stale displayed documents out of evidence and never extends the capability during completion', async () => {
        const a = await account(), p = await proof(a), before = (await db.pool.query('SELECT cap_issued_at,cap_expires_at,epoch FROM identity.consumer_recovery_gate WHERE user_id=$1', [a.userId])).rows[0];
        await a.evidence.status('RECOVERY', { recovery_capability: p.recovery_capability, locale: 'en' }, a.source);
        await expect(a.evidence.complete('RECOVERY', { recovery_capability: p.recovery_capability, locale: 'en', terms: { version: '0.0', sha256: 'a'.repeat(64) }, privacy: currentDocument('PRIVACY', 'en'), terms_accepted: true, privacy_acknowledged: true, adult_affirmed: true, date_of_birth: '1990-01-01' }, a.source)).rejects.toThrow();
        expect((await db.pool.query('SELECT count(*)::int n FROM legal.acceptance WHERE owner_ref=$1', [a.ownerRef])).rows[0].n).toBe(0);
        await accept(a, p.recovery_capability);
        await accept(a, p.recovery_capability);
        expect((await db.pool.query('SELECT cap_issued_at,cap_expires_at,epoch FROM identity.consumer_recovery_gate WHERE user_id=$1', [a.userId])).rows[0]).toEqual(before);
        expect((await db.pool.query('SELECT count(*)::int n FROM legal.acceptance WHERE owner_ref=$1', [a.ownerRef])).rows[0].n).toBe(3);
        expect(JSON.stringify((await db.pool.query('SELECT * FROM identity.age_check WHERE user_id=$1', [a.userId])).rows)).not.toContain('1990-01-01');
        await expect(a.evidence.status('PENDING', { enrollment_token: p.recovery_capability, locale: 'en' }, a.source)).rejects.toThrow();
    });
    it('offers only standalone passkey recovery when the stored password cannot pass selected-policy admission', async () => {
        const a = await account();
        await db.pool.query('UPDATE identity."user" SET password_hash=$2 WHERE user_id=$1', [a.userId, 'unsupported-password-envelope']);
        const p = await proof(a);
        expect(p.available_methods).toEqual(['passkey']);
        expect(p.totp_unavailable_reason).toBe('PASSWORD_UNAVAILABLE');
        expect(JSON.stringify(p)).not.toContain('unsupported-password-envelope');
        await expect(a.recovery.beginEnrollment({ recovery_capability: p.recovery_capability, method: 'totp' }, a.source)).rejects.toThrow('MFA_ENROLLMENT_STATE_INVALID');
        await accept(a, p.recovery_capability);
        const o = await a.recovery.beginEnrollment({ recovery_capability: p.recovery_capability, method: 'passkey' }, a.source);
        if (o.method !== 'passkey')
            throw new Error('WRONG_METHOD');
        expect((await a.recovery.completeEnrollment({ recovery_capability: p.recovery_capability, challenge_handle: o.challenge_handle, credential: consumerFixture().registration(o.options.challenge) }, a.source)).status).toBe('authenticated');
    });
    it('refuses verified TOTP completion if its admitted password snapshot changed before commit', async () => {
        const a = await account(), p = await proof(a);
        await accept(a, p.recovery_capability);
        const o = await a.recovery.beginEnrollment({ recovery_capability: p.recovery_capability, method: 'totp' }, a.source);
        if (o.method !== 'totp')
            throw new Error('WRONG_METHOD');
        await db.pool.query('UPDATE identity."user" SET password_hash=$2 WHERE user_id=$1', [a.userId, await hashPassword(argon2, 'A new unrelated password 456!', authPolicy.password.argon2id)]);
        const secret = decodeBase32(o.secret);
        try {
            await expect(a.recovery.completeEnrollment({ recovery_capability: p.recovery_capability, challenge_handle: o.challenge_handle, code: totpCodeAtStep(secret, Math.floor(Date.now() / 30000)) }, a.source)).rejects.toThrow('CONSUMER_PASSWORD_PATH_UNAVAILABLE');
        }
        finally {
            secret.fill(0);
        }
        expect((await db.pool.query('SELECT active FROM identity.consumer_recovery_gate WHERE user_id=$1', [a.userId])).rows[0].active).toBe(true);
        expect((await db.pool.query('SELECT count(*)::int n FROM identity.session WHERE user_id=$1', [a.userId])).rows[0].n).toBe(0);
    });
    it('holds the same erasure key-destruction lease through notice send and zeroes the loaded DEK before release', async () => {
        const a = await account(), repository = new PostgresConsumerSecurityNoticeRepository(runtime), claim = (await repository.claim(100)).find(c => c.userId === a.userId);
        if (!claim)
            throw new Error('NOTICE_MISSING');
        let entered!: () => void, release!: () => void;
        const ready = new Promise<void>(r => { entered = r; }), wait = new Promise<void>(r => { release = r; }), keys: Buffer[] = [];
        let mail: unknown;
        const selected = new Proxy(repository, { get(target, p) { if (p === 'claim')
                return async () => [claim]; const value = Reflect.get(target, p); return typeof value === 'function' ? value.bind(target) : value; } });
        const notices = new ConsumerSecurityNoticeReconciler(selected, { load: async (id: string) => { const key = await a.users.load(id); keys.push(key); return key; } } as never, { sendConsumerSecurityNotice: async (value) => { mail = value; entered(); await wait; } });
        const sending = notices.reconcile(), eraser = await db.pool.connect();
        let locked = false;
        let acquiring: Promise<unknown> | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('NOTICE_DID_NOT_REACH_TRANSPORT')), 5000); })]);
            clearTimeout(timer);
            acquiring = eraser.query('SELECT pg_advisory_lock(hashtextextended($1,0))', ['debateai:account-erasure-notification:v1:' + a.userId]).then(() => { locked = true; });
            await new Promise(r => setTimeout(r, 30));
            expect(locked).toBe(false);
            release();
            await sending;
            await acquiring;
            expect(mail).toMatchObject({ recipient: a.email, eventKind: 'METHOD_CHANGED' });
            expect(keys.length).toBe(1);
            expect(keys[0]!.every(byte => byte === 0)).toBe(true);
        }
        finally {
            clearTimeout(timer);
            release();
            await sending;
            await acquiring?.catch(() => { });
            if (locked)
                await eraser.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', ['debateai:account-erasure-notification:v1:' + a.userId]);
            eraser.release();
        }
    });
    it('retains the recovery gate through channel deletion, blocks old password/passkey paths, and restarts on a fresh verified channel', async () => {
        const a=await account(),channelId=randomUUID(),factorId=randomUUID(),secret=generateTotpSecret(),dek=await a.users.load(a.userId);
        try {
            const backup='backup-'+a.userId+'@example.test';
            const cipher=encrypt(dek,Buffer.from(backup),['identity','user.recovery_email_ciphertext',a.userId,'run:none',a.userId,`user-dek:${a.userId}`,'1']);
            await db.pool.query('UPDATE identity."user" SET recovery_email_ciphertext=$1 WHERE user_id=$2',[cipher,a.userId]);
            await db.pool.query("INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,$2,'recovery_email',$3,'verified',now(),now())",[channelId,a.userId,cipher]);
            await db.pool.query("INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp',$3,'active',now(),now())",[factorId,a.userId,encrypt(dek,secret,['identity','mfa_factor.secret_ciphertext',factorId,'run:none',a.userId,`user-dek:${a.userId}`,'1'])]);
            const send=await a.recovery.prepareStart({email:a.email},a.source);await send?.();expect(a.delivered.at(-1)!.recipient).toBe(backup);
            const p=await a.recovery.prove({token:a.delivered.at(-1)!.token,recovery_code:a.code,method:'passkey'},a.source);
            await db.pool.query("UPDATE identity.consumer_recovery_reservation SET reserved_at=reserved_at-interval '61 seconds' WHERE user_id=$1",[a.userId]);
            await db.pool.query('DELETE FROM identity.channel_binding WHERE channel_binding_id=$1',[channelId]);
            const login=await a.passkeys.beginPasskeyLogin({},a.source);
            const oldPasskeyOpened=await a.passkeys.completePasskeyLogin({challenge_handle:login.challenge_handle,credential:a.old.assertion(login.options.challenge)},a.source).then(()=>true,()=>false);
            expect(oldPasskeyOpened).toBe(false);
            const oldPasswordOpened=await a.sessions.beginLogin({email:a.email,password:'Strong fixture password 123!'},a.source).then(c=>a.sessions.completeLogin({challengeToken:c.challengeToken,code:totpCodeAtStep(secret,Math.floor(Date.now()/30000))},a.source)).then(()=>true,()=>false);
            expect(oldPasswordOpened).toBe(false);
            expect((await db.pool.query('SELECT active FROM identity.consumer_recovery_gate WHERE user_id=$1',[a.userId])).rows[0].active).toBe(true);
            expect((await db.pool.query('SELECT count(*)::int n FROM identity.consumer_recovery_reservation WHERE user_id=$1',[a.userId])).rows[0].n).toBe(1);
            await expect(a.evidence.status('RECOVERY',{recovery_capability:p.recovery_capability,locale:'en'},a.source)).rejects.toThrow();
            const next=await proof(a,await secondCode(a));expect(next.recovery_capability).not.toBe(p.recovery_capability);
            expect((await db.pool.query('SELECT count(*)::int n FROM identity.consumer_recovery_reservation WHERE user_id=$1',[a.userId])).rows[0].n).toBe(2);
            await db.pool.query('DELETE FROM identity."user" WHERE user_id=$1',[a.userId]);
            for(const table of ['consumer_recovery_gate','consumer_recovery_token','consumer_recovery_reservation','consumer_recovery_enrollment','consumer_security_notice','consumer_passkey_credential','mfa_factor'])expect((await db.pool.query('SELECT count(*)::int n FROM identity.'+table+' WHERE user_id=$1',[a.userId])).rows[0].n).toBe(0);
        } finally { secret.fill(0);dek.fill(0); }
    });

});
