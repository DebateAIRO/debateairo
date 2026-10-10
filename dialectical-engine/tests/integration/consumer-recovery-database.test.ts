import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createPool, migrate, type Pool } from '@debateai/db';
import { hashToken } from '@debateai/crypto';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
let database: TestDatabase, runtime: Pool;
const source = { ipArgon2id: 'argon2id-audit:v1:' + 'ab'.repeat(32), userAgentArgon2id: 'argon2id-audit:v1:' + 'cd'.repeat(32) };
const hash = () => hashToken('session', randomBytes(32).toString('base64url'));
const codeHash = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXJhbmRvbXNhbHQ$' + Buffer.alloc(32, 1).toString('base64').replace(/=/g, '');
async function audited(sql: string, values: unknown[]) { const c = await runtime.connect(); try {
    await c.query('BEGIN');
    await c.query('SELECT identity.begin_runtime_audit_attempt()');
    const r = await c.query(sql, [...values, source]);
    await c.query('COMMIT');
    return r.rows[0].value;
}
catch (e) {
    await c.query('ROLLBACK');
    throw e;
}
finally {
    c.release();
} }
async function account() {
    const userId = randomUUID(), index = randomBytes(32), channelId = randomUUID(), codeId = randomUUID();
    await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1::uuid,$2,'{}','fixture',$1::text,'active',now())`, [userId, index]);
    await database.pool.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,$2,'email','{}','verified',now(),now())`, [channelId, userId]);
    await database.pool.query('INSERT INTO identity.recovery_code(recovery_code_id,user_id,code_slot,code_hash,created_at) VALUES($1,$2,1,$3,now())', [codeId, userId, codeHash]);
    return { userId, index, channelId, codeId };
}
beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); await database.pool.query("CREATE ROLE recovery_test_runtime LOGIN PASSWORD 'recovery-test-only' IN ROLE debateai_authorization_runtime"); const url = new URL(database.connectionString); url.username = 'recovery_test_runtime'; url.password = 'recovery-test-only'; runtime = createPool(url.toString()); }, 120000);
afterAll(async () => { await runtime?.end(); await database?.stop(); });
describe('consumer token plus saved-code recovery', () => {
    it('reserves one bounded attempt and atomically consumes both proofs without creating a session', async () => {
        const a = await account(), tokenHash = hash();
        const start = await audited('SELECT identity.start_consumer_recovery($1,$2,$3) AS value', [a.index, tokenHash]);
        expect(start.userId).toBe(a.userId);
        expect(await audited('SELECT identity.start_consumer_recovery($1,$2,$3) AS value', [a.index, hash()])).toBeNull();
        // Design note 2026-10-09 item 3: no replacement code is sent, none is stored, and every verified email is told.
        const capHash = hash(), input = { tokenHash, codeId: a.codeId, codeHash, capHash, method: 'passkey' };
        const result = await audited('SELECT identity.prove_consumer_recovery($1,$2) AS value', [input]);
        expect(result.expiresAt).toBeTruthy();
        expect((await database.pool.query('SELECT count(*)::int n FROM identity.session WHERE user_id=$1', [a.userId])).rows[0].n).toBe(0);
        expect((await database.pool.query('SELECT count(*)::int n FROM identity.recovery_code WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL', [a.userId])).rows[0].n).toBe(0);
        expect((await database.pool.query("SELECT event_kind FROM identity.consumer_security_notice WHERE user_id=$1 AND event_kind IN ('RECOVERY_PROVED','RECOVERY_CODE_USED') ORDER BY event_kind", [a.userId])).rows.map(r => r.event_kind)).toEqual(['RECOVERY_CODE_USED', 'RECOVERY_PROVED']);
        await expect(audited('SELECT identity.prove_consumer_recovery($1,$2) AS value', [input])).rejects.toThrow();
    });
    it('requires current channel and forbids raw capability-table access', async () => {
        const a = await account(), tokenHash = hash();
        await audited('SELECT identity.start_consumer_recovery($1,$2,$3) AS value', [a.index, tokenHash]);
        await database.pool.query("UPDATE identity.channel_binding SET state='revoked' WHERE channel_binding_id=$1", [a.channelId]);
        await expect(audited('SELECT identity.prove_consumer_recovery($1,$2) AS value', [{ tokenHash, codeId: a.codeId, codeHash, replacementHash: codeHash + 'A', capHash: hash(), method: 'totp' }])).rejects.toThrow();
        await expect(runtime.query('SELECT * FROM identity.consumer_recovery_gate')).rejects.toMatchObject({ code: '42501' });
        expect((await database.pool.query('SELECT consumed_at FROM identity.recovery_code WHERE recovery_code_id=$1', [a.codeId])).rows[0].consumed_at).toBeNull();
    });
    it('keeps recovery enrollment separate and refuses a method swap or missing current evidence', async () => {
        const a = await account(), tokenHash = hash(), capHash = hash();
        await audited('SELECT identity.start_consumer_recovery($1,$2,$3) AS value', [a.index, tokenHash]);
        await audited('SELECT identity.prove_consumer_recovery($1,$2) AS value', [{ tokenHash, codeId: a.codeId, codeHash, replacementHash: codeHash + 'A', capHash, method: 'passkey' }]);
        const input = { capHash, userId: a.userId, method: 'passkey', factorId: randomUUID(), handleHash: hash(), bindingHash: hash(), challengeHash: hash(), rpId: 'example.test', origin: 'https://example.test', userHandle: randomBytes(32).toString('base64url') };
        const begun = await audited('SELECT identity.begin_recovery_enrollment($1,$2) AS value', [input]);
        expect(begun.userHandle).toBe(input.userHandle);
        await expect(audited('SELECT identity.begin_recovery_enrollment($1,$2) AS value', [{ ...input, method: 'totp' }])).rejects.toThrow();
        await expect(audited('SELECT identity.complete_recovery_enrollment($1,$2,$3) AS value', [{ ...input, credentialId: randomBytes(32).toString('base64url'), publicKey: 'AQID', counter: 0, deviceType: 'multiDevice', backedUp: true, transports: [], ruleVersion: 'age-gate/v2-single-min-age-18', minAge: 18, countryCode: 'RO' }, '[]'])).rejects.toThrow();
        expect((await database.pool.query('SELECT active FROM identity.consumer_recovery_gate WHERE user_id=$1', [a.userId])).rows[0].active).toBe(true);
        expect((await database.pool.query('SELECT count(*)::int n FROM identity.session WHERE user_id=$1', [a.userId])).rows[0].n).toBe(0);
    });
    it('lets a security hold winning the account lock deny proof without consuming token or code', async () => {
        const a = await account(), tokenHash = hash();
        await audited('SELECT identity.start_consumer_recovery($1,$2,$3) AS value', [a.index, tokenHash]);
        const blocker = await database.pool.connect();
        let pending: Promise<unknown> | undefined;
        let blockerCommitted=false;
        try {
            await blocker.query('BEGIN');
            await blocker.query('SELECT identity.lock_security_subjects(ARRAY[$1::uuid])', [a.userId]);
            pending = audited('SELECT identity.prove_consumer_recovery($1,$2) AS value', [{ tokenHash, codeId: a.codeId, codeHash, replacementHash: codeHash + 'A', capHash: hash(), method: 'passkey' }]);
            const refusal = expect(pending).rejects.toThrow('CONSUMER_RECOVERY_INVALID');
            let blocked = false;
            for (let i = 0; i < 100; i++) {
                if ((await database.pool.query("SELECT 1 FROM pg_stat_activity WHERE usename='recovery_test_runtime' AND wait_event_type='Lock' AND query LIKE '%prove_consumer_recovery%' ")).rowCount) {
                    blocked = true;
                    break;
                }
                await new Promise(r => setTimeout(r, 10));
            }
            expect(blocked).toBe(true);
            await blocker.query('INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,1)', [a.userId]);
            await blocker.query('COMMIT');blockerCommitted=true;
            await refusal;
        }
        finally {
            if(!blockerCommitted)await blocker.query('ROLLBACK');
            blocker.release();
            await pending?.catch(() => { });
        }
        expect((await database.pool.query('SELECT consumed_at FROM identity.recovery_code WHERE recovery_code_id=$1', [a.codeId])).rows[0].consumed_at).toBeNull();
        expect((await database.pool.query('SELECT consumed_at FROM identity.consumer_recovery_token WHERE token_hash=$1', [tokenHash])).rows[0].consumed_at).toBeNull();
    });
    it('refuses affiliated and scheduled-erasure accounts and cancels new recovery/notice state at actual PREPARE', async () => {
        for (const state of ['staff', 'scheduled']) {
            const a = await account();
            if (state === 'staff')
                await database.pool.query('INSERT INTO staff.subject(user_id) VALUES($1)', [a.userId]);
            else
                await database.pool.query("INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at) VALUES($1,$2,clock_timestamp(),clock_timestamp()+interval '1 day')", [randomUUID(), a.userId]);
            expect(await audited('SELECT identity.start_consumer_recovery($1,$2,$3) AS value', [a.index, hash()])).toBeNull();
        }
        const a = await account(), tokenHash = hash(), capHash = hash();
        await audited('SELECT identity.start_consumer_recovery($1,$2,$3) AS value', [a.index, tokenHash]);
        await audited('SELECT identity.prove_consumer_recovery($1,$2) AS value', [{ tokenHash, codeId: a.codeId, codeHash, replacementHash: codeHash + 'A', capHash, method: 'passkey' }]);
        const id = randomUUID();
        await database.pool.query("INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at) VALUES($1,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')", [id, a.userId]);
        const c = await database.pool.connect();
        try {
            await c.query('BEGIN');
            await c.query('SET LOCAL ROLE debateai_erasure_runtime');
            expect((await c.query("SELECT identity.prepare_account_erasure($1,'{}'::uuid[],'{}'::uuid[],'{}'::uuid[]) value", [id])).rows[0].value).toBe('PREPARED');
            await c.query('COMMIT');
        }
        finally {
            await c.query('ROLLBACK');
            c.release();
        }
        await expect(runtime.query('SELECT identity.prepare_recovery_enrollment($1)', [capHash])).rejects.toThrow();
        for (const table of ['consumer_recovery_token', 'consumer_recovery_enrollment', 'consumer_security_notice'])
            expect((await database.pool.query('SELECT count(*)::int n FROM identity.' + table + ' WHERE user_id=$1', [a.userId])).rows[0].n).toBe(0);
        await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [a.userId]);
        expect((await database.pool.query('SELECT count(*)::int n FROM identity.consumer_recovery_gate WHERE user_id=$1', [a.userId])).rows[0].n).toBe(0);
    });
});
