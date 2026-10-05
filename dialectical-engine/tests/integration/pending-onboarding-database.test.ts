import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createPool, migrate, PostgresOnboardingEvidenceRepository, PostgresSessionRepository, type Pool } from '@debateai/db';
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, SESSION_POLICY_DEPLOYMENT_REGISTER_ROW, sessionPolicyFromValue } from '@debateai/register';
import { SessionService } from '../../apps/api/src/sessions.js';
import { OnboardingEvidenceService } from '../../apps/api/src/onboarding-evidence.js';
import type { AuditContextHasher } from '@debateai/crypto';
import { hashToken } from '@debateai/crypto';
import { currentDocument } from '@debateai/legal-manifest';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
let db: TestDatabase, authorization: Pool, registration: Pool;
const source = { ipArgon2id: 'argon2id-audit:v1:' + 'ab'.repeat(32), userAgentArgon2id: 'argon2id-audit:v1:' + 'cd'.repeat(32) }, proof = () => hashToken('verification', randomBytes(32).toString('base64url'));
const legal = (['TERMS', 'PRIVACY'] as const).map(kind => ({ kind, locale: 'en', ...currentDocument(kind, 'en')! }));
const policy = { minAge: 18, ruleVersion: 'age-gate/v2-single-min-age-18', countryCode: 'RO' };
async function audited(pool: Pool, sql: string, values: unknown[]) { const c = await pool.connect(); try {
    await c.query('BEGIN');
    await c.query('SELECT identity.begin_runtime_audit_attempt()');
    const r = await c.query(sql, [...values, source]);
    await c.query('COMMIT');
    return r.rows;
}
catch (e) {
    await c.query('ROLLBACK');
    throw e;
}
finally {
    c.release();
} }
async function account() { const user = randomUUID(), channel = randomUUID(), index = randomBytes(32), tokenHash = proof(); await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1::uuid,$2,'{}','fixture',$1::text,'pending_mfa',now())`, [user, index]); await db.pool.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at,verification_token_hash,verification_expires_at,verification_consumed_at) VALUES($1,$2,'email','{}','verified',now(),now(),$3,now()+interval '24 hours',now())`, [channel, user, tokenHash]); await db.pool.query(`INSERT INTO identity.verification_token_credential VALUES($1,$2,now()-interval '1 second',now()+interval '24 hours',now())`, [tokenHash, channel]); return { user, channel, index, tokenHash }; }
beforeAll(async () => { db = await startTestDatabase(); await migrate(db.pool); for (const [name, role] of [['pending_auth_test', 'debateai_authorization_runtime'], ['pending_register_test', 'debateai_runtime']])
    await db.pool.query(`CREATE ROLE ${name} LOGIN PASSWORD 'pending-test-only' IN ROLE ${role}`); const u = new URL(db.connectionString); u.password = 'pending-test-only'; u.username = 'pending_auth_test'; authorization = createPool(u.toString()); u.username = 'pending_register_test'; registration = createPool(u.toString()); }, 120000);
afterAll(async () => { await authorization?.end(); await registration?.end(); await db?.stop(); });
describe('pending onboarding independent email-proof authority', () => {
    it('refreshes pending_mfa with the existing bounded reservation ledger while keeping the old current proof', async () => {
        const a = await account(), newHash = proof();
        const rows = await audited(registration, 'SELECT * FROM identity.prepare_verification_resend_reserved_with_audit($1,$2,86400000,clock_timestamp(),60000,3600000,3,\'atomic_rolling_reservation_ledger\',$3)', [a.index, newHash]);
        expect(rows[0].status).toBe('SEND');
        expect((await db.pool.query('SELECT verification_token_hash FROM identity.channel_binding WHERE channel_binding_id=$1', [a.channel])).rows[0].verification_token_hash).toBe(a.tokenHash);
        expect((await audited(registration, 'SELECT identity.consume_verification_with_audit($1,clock_timestamp(),$2) valid', [newHash]))[0].valid).toBe(true);
        expect((await db.pool.query('SELECT state FROM identity."user" WHERE user_id=$1', [a.user])).rows[0].state).toBe('pending_mfa');
    });
    it('reads only requirements from a current consumed bound proof and rejects siblings and expired authority', async () => {
        const a = await account(), input = { kind: 'PENDING', proofHash: a.tokenHash, ...policy };
        const good = await authorization.query('SELECT identity.read_onboarding_requirements($1,$2) value', [input, JSON.stringify(legal)]);
        expect(good.rows[0].value.ageRequired).toBe(true);
        await expect(authorization.query('SELECT identity.read_onboarding_requirements($1,$2) value', [{ ...input, proofHash: proof() }, JSON.stringify(legal)])).rejects.toThrow();
        await db.pool.query("UPDATE identity.verification_token_credential SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1", [a.tokenHash]);
        await expect(authorization.query('SELECT identity.read_onboarding_requirements($1,$2) value', [input, JSON.stringify(legal)])).rejects.toThrow();
        expect((await db.pool.query('SELECT count(*)::int n FROM identity.session WHERE user_id=$1', [a.user])).rows[0].n).toBe(0);
    });
    it('rechecks email proof expiry after a real account-lock wait', async () => {
        const a = await account(), blocker = await db.pool.connect();
        let pending: Promise<unknown> | undefined;
        try {
            await blocker.query('BEGIN');
            await blocker.query('SELECT identity.lock_security_subjects(ARRAY[$1::uuid])', [a.user]);
            pending = authorization.query('SELECT identity.read_onboarding_requirements($1,$2) value', [{ kind: 'PENDING', proofHash: a.tokenHash, ...policy }, JSON.stringify(legal)]);
            const refused = expect(pending).rejects.toThrow('ONBOARDING_AUTHORITY_INVALID');
            let blocked = false;
            for (let i = 0; i < 100; i++) {
                if ((await db.pool.query("SELECT 1 FROM pg_stat_activity WHERE usename='pending_auth_test' AND wait_event_type='Lock'")).rowCount) {
                    blocked = true;
                    break;
                }
                await new Promise(r => setTimeout(r, 10));
            }
            expect(blocked).toBe(true);
            await blocker.query("UPDATE identity.verification_token_credential SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE token_hash=$1", [a.tokenHash]);
            await blocker.query('COMMIT');
            await refused;
        }
        finally {
            await blocker.query('ROLLBACK');
            blocker.release();
            await pending?.catch(() => { });
        }
    });
    it('completes current legal and age evidence only, idempotently, without a session or factor reset', async () => {
        const a = await account(), audit = { hashSourceIp: async () => 'ab'.repeat(32), hashUserAgent: async () => 'cd'.repeat(32) } as unknown as AuditContextHasher;
        const sessions = await SessionService.create({ repository: new PostgresSessionRepository(authorization, audit), riskSignals: { recordForSession: async () => 'recorded' } as never, onRiskSignalFailure: () => { }, dekStore: {} as never, argon2: {} as never, authPolicy: authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), mfaPolicy: mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value), sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef), blindIndexKey: Buffer.alloc(32, 1), dummyPasswordHash: 'fixture' });
        const evidence = new OnboardingEvidenceService(new PostgresOnboardingEvidenceRepository(authorization, audit), sessions.consumerProducer(), Buffer.alloc(32, 9)), requestSource = { ip: '192.0.2.210', userAgent: 'pending-completion', requestId: randomUUID(), countryCode: 'RO' };
        // The fixture stores only a hash, so use a new explicitly bound consumed proof with known bytes.
        const token = randomBytes(32).toString('base64url'), tokenHash = hashToken('verification', token);
        await db.pool.query('UPDATE identity.channel_binding SET verification_token_hash=$1 WHERE channel_binding_id=$2', [tokenHash, a.channel]);
        await db.pool.query('UPDATE identity.verification_token_credential SET token_hash=$1 WHERE token_hash=$2', [tokenHash, a.tokenHash]);
        const input = { enrollment_token: token, locale: 'en', terms: currentDocument('TERMS', 'en'), privacy: currentDocument('PRIVACY', 'en'), terms_accepted: true, privacy_acknowledged: true, adult_affirmed: true };
        expect(await evidence.status('PENDING', { enrollment_token: token, locale: 'en' }, requestSource)).toMatchObject({ status: 'pending_mfa', age_confirmation_required: true, legal_acceptance_required: true });
        await evidence.complete('PENDING', { ...input, date_of_birth: '1990-01-01' }, requestSource);
        await evidence.complete('PENDING', input, requestSource);
        expect(await evidence.status('PENDING', { enrollment_token: token, locale: 'en' }, requestSource)).toMatchObject({ age_confirmation_required: false, legal_acceptance_required: false });
        expect((await db.pool.query('SELECT count(*)::int n FROM legal.acceptance WHERE owner_ref=(SELECT owner_ref FROM identity."user" WHERE user_id=$1)', [a.user])).rows[0].n).toBe(3);
        expect((await db.pool.query('SELECT count(*)::int n FROM identity.session WHERE user_id=$1', [a.user])).rows[0].n).toBe(0);
        expect((await db.pool.query('SELECT state FROM identity."user" WHERE user_id=$1', [a.user])).rows[0].state).toBe('pending_mfa');
        expect((await db.pool.query('SELECT identity.consumer_initial_evidence_internal($1,$2) ok', [a.user, JSON.stringify(legal)])).rows[0].ok).toBe(true);
    });
});
