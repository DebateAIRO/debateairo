import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate, type Pool } from '@debateai/db';
import { hashToken } from '@debateai/crypto';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
let database: TestDatabase, runtime: Pool;
const source = { ipArgon2id: 'argon2id-audit:v1:' + 'ab'.repeat(32), userAgentArgon2id: 'argon2id-audit:v1:' + 'cd'.repeat(32) };
const fixturePasswordHash = '$argon2id$v=19$m=65536,t=3,p=1$' + Buffer.alloc(16, 1).toString('base64').replace(/=/g, '') + '$' + Buffer.alloc(32, 1).toString('base64').replace(/=/g, '');
const token = () => randomBytes(32).toString('base64url');
async function mutation(name: string, input: unknown) {
    const c = await runtime.connect();
    try {
        await c.query('BEGIN');
        await c.query('SELECT identity.begin_runtime_audit_attempt()');
        const r = await c.query(`SELECT identity.${name}($1,$2) AS value`, [input, source]);
        await c.query('COMMIT');
        return r.rows[0].value;
    }
    catch (e) {
        await c.query('ROLLBACK');
        throw e;
    }
    finally {
        c.release();
    }
}
async function account() {
    const userId = randomUUID(), sessionId = randomUUID(), sessionToken = token();
    await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1::uuid,$2,'{}',$3,$1::text,'active',now())`, [userId, randomBytes(32), fixturePasswordHash]);
    await database.pool.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,$2,'email','{}','verified',now(),now())`, [randomUUID(), userId]);
    await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at) VALUES($1,$2,$3,$4,'{}',now(),now(),now()+interval '336 hours',now()+interval '720 hours',now())`, [sessionId, userId, hashToken('session', sessionToken), hashToken('csrf', token())]);
    await database.pool.query(`INSERT INTO identity.consumer_passkey_subject VALUES($1,$2)`, [userId, token()]);
    const factors = [randomUUID(), randomUUID()];
    for (const id of factors)
        await database.pool.query(`INSERT INTO identity.consumer_passkey_credential(consumer_credential_id,user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin) VALUES($1,$2,$3,'AQID',0,'multiDevice',true,'example.test','https://example.test')`, [id, userId, token()]);
    return { userId, sessionId, passwordHashSnapshot: fixturePasswordHash, passwordUsable: true, tokenHash: hashToken('session', sessionToken), factors };
}
async function grant(a: Awaited<ReturnType<typeof account>>, factor: string) {
    const value = token();
    await database.pool.query(`INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_account_id,target_factor_id,issued_at,expires_at) VALUES($1,$2,$3,$4,'REMOVE_AUTH_METHOD',$4,$5,statement_timestamp(),statement_timestamp()+interval '5 minutes')`, [randomUUID(), hashToken('step-up-grant', value), a.sessionId, a.userId, factor]);
    return hashToken('step-up-grant', value);
}
beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); await database.pool.query("CREATE ROLE security_test_runtime LOGIN PASSWORD 'security-test-only' IN ROLE debateai_authorization_runtime"); const url = new URL(database.connectionString); url.username = 'security_test_runtime'; url.password = 'security-test-only'; runtime = createPool(url.toString()); }, 120000);
afterAll(async () => { await runtime?.end(); await database?.stop(); });
describe('consumer security execute-only authority', () => {
    it('serializes two removals and preserves exactly one viable ordinary sign-in path', async () => {
        const a = await account();
        const outcomes = await Promise.allSettled(a.factors.map(async (factorId) => mutation('remove_consumer_auth_method', { ...a, factors: undefined, factorId, grantHash: await grant(a, factorId) })));
        expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
        expect((await database.pool.query('SELECT count(*)::int n FROM identity.consumer_passkey_credential WHERE user_id=$1 AND revoked_at IS NULL', [a.userId])).rows[0].n).toBe(1);
        expect((await database.pool.query('SELECT count(*)::int n FROM identity.consumer_security_notice WHERE user_id=$1', [a.userId])).rows[0].n).toBe(1);
    });
    it('returns safe metadata and denies raw tables, stale tokens and wrong-factor grants', async () => {
        const a = await account();
        const result = await runtime.query('SELECT identity.read_consumer_auth_methods($1) AS value', [a]);
        expect(result.rows[0].value.methods).toHaveLength(2);
        expect(JSON.stringify(result.rows[0].value)).not.toMatch(/public_key|credential_id|password|ciphertext|token_hash/);
        await expect(runtime.query('SELECT * FROM identity.consumer_security_notice')).rejects.toMatchObject({ code: '42501' });
        const grantHash = await grant(a, a.factors[0]!);
        await expect(mutation('remove_consumer_auth_method', { ...a, factorId: a.factors[1], grantHash })).rejects.toThrow();
        await expect(mutation('remove_consumer_auth_method', { ...a, tokenHash: hashToken('session', token()), factorId: a.factors[0], grantHash })).rejects.toThrow();
        expect((await database.pool.query('SELECT consumed_at FROM identity.step_up_grant WHERE token_hash=$1', [grantHash])).rows[0].consumed_at).toBeNull();
    });
    it('binds a distinct step-up challenge to the current session generation and exact action', async () => {
        const a = await account(), seed = { ...a, handleHash: hashToken('login-challenge', token()), challengeHash: hashToken('login-challenge', token()), bindingHash: 'sha256:' + 'ef'.repeat(32), retentionKey: 'sha256:' + 'aa'.repeat(32), challengeCapacity: 512, challengesPerScope: 5, rpId: 'example.test', origin: 'https://example.test', authorization: { action: 'ADD_TOTP' } };
        const begun = await runtime.query('SELECT identity.begin_consumer_security_step_up($1) AS value', [seed]);
        expect(begun.rows[0].value.expiresAt).toBeTruthy();
        const lookup = { handleHash: seed.handleHash, credentialId: (await database.pool.query('SELECT credential_id FROM identity.consumer_passkey_credential WHERE consumer_credential_id=$1', [a.factors[0]])).rows[0].credential_id, bindingHash: seed.bindingHash, ...a };
        const c = (await runtime.query('SELECT identity.read_consumer_security_step_up($1) AS value', [lookup])).rows[0].value;
        expect(c.authorization).toEqual({ action: 'ADD_TOTP' });
        await database.pool.query('UPDATE identity.session SET token_hash=$1 WHERE session_id=$2', [hashToken('session', token()), a.sessionId]);
        expect((await runtime.query('SELECT identity.read_consumer_security_step_up($1) AS value', [lookup])).rows[0].value).toBeNull();
        await expect(mutation('complete_consumer_security_step_up', { ...lookup, ...c, counter: 0, backedUp: true, replacementTokenHash: hashToken('session', token()), replacementCsrfHash: hashToken('csrf', token()), grantHash: hashToken('step-up-grant', token()) })).rejects.toThrow();
    });
    it('allows staff TOTP replacement but preserves the last verified ordinary TOTP', async () => {
        const a = await account(), one = randomUUID(), two = randomUUID();
        await database.pool.query('INSERT INTO staff.subject(user_id) VALUES($1)', [a.userId]);
        for (const id of [one, two])
            await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp','{}','active',now(),now())`, [id, a.userId]);
        expect(await mutation('remove_consumer_auth_method', { ...a, factorId: one, grantHash: await grant(a, one) })).toBe(true);
        await expect(mutation('remove_consumer_auth_method', { ...a, factorId: two, grantHash: await grant(a, two) })).rejects.toThrow('CONSUMER_LAST_METHOD');
        expect((await database.pool.query("SELECT count(*)::int n FROM identity.mfa_factor WHERE user_id=$1 AND state='active'", [a.userId])).rows[0].n).toBe(1);
    });
    it('claims bounded verified-channel notices and preserves a newer coalesced event on old acknowledgement', async () => {
        const a = await account();
        await mutation('remove_consumer_auth_method', { ...a, factorId: a.factors[0], grantHash: await grant(a, a.factors[0]!) });
        const claimed = (await runtime.query('SELECT * FROM identity.claim_consumer_security_notices(100)')).rows.find(x => x.user_id === a.userId);
        expect(claimed).toBeTruthy();
        await database.pool.query("SELECT identity.enqueue_consumer_security_notice_internal($1,'METHOD_CHANGED')", [a.userId]);
        expect((await runtime.query('SELECT identity.ack_consumer_security_notice($1,$2) value', [claimed.notice_id, claimed.claim_token])).rows[0].value).toBe(true);
        expect((await database.pool.query('SELECT count(*)::int n FROM identity.consumer_security_notice WHERE user_id=$1', [a.userId])).rows[0].n).toBe(1);
        await expect(runtime.query('SELECT * FROM identity.claim_consumer_security_notices(101)')).rejects.toThrow();
    });
    it('refuses an unconsumed grant after a later session-token generation replaces its issuing generation', async () => {
        const a = await account(), grantHash = await grant(a, a.factors[0]!);
        const later = hashToken('session', token());
        await database.pool.query('UPDATE identity.session SET token_hash=$1 WHERE session_id=$2', [later, a.sessionId]);
        await expect(mutation('remove_consumer_auth_method', { ...a, tokenHash: later, factorId: a.factors[0], grantHash })).rejects.toThrow();
        expect((await database.pool.query('SELECT count(*)::int n FROM identity.consumer_passkey_credential WHERE user_id=$1 AND revoked_at IS NULL', [a.userId])).rows[0].n).toBe(2);
    });
    it('keeps every new table execute-only and every helper private with fixed definer owners/search paths', async () => {
        expect((await runtime.query('SELECT current_user,rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0]).toEqual({ current_user: 'security_test_runtime', rolsuper: false });
        for (const table of ['consumer_security_notice', 'consumer_security_challenge', 'consumer_recovery_gate', 'consumer_recovery_token', 'consumer_recovery_reservation', 'consumer_recovery_enrollment']) {
            await expect(runtime.query('SELECT * FROM identity.' + table)).rejects.toMatchObject({ code: '42501' });
            await expect(runtime.query('TRUNCATE identity.' + table)).rejects.toMatchObject({ code: '42501' });
        }
        for (const signature of ['guard_consumer_security_parent()', 'append_consumer_security_audit_internal(uuid,text,jsonb)', 'enqueue_consumer_security_notice_internal(uuid,text)', 'consumer_viable_path_internal(uuid,uuid,text,boolean)', 'consumer_method_removable_internal(uuid,uuid,text,boolean)', 'consume_consumer_security_grant_internal(jsonb,text,uuid,text)', 'valid_consumer_authorization_internal(jsonb)', 'insert_consumer_grant_internal(uuid,uuid,text,jsonb,timestamptz)', 'consumer_recovery_eligible_internal(uuid)', 'recovery_cap_internal(text)', 'onboarding_subject_internal(jsonb)', 'onboarding_legal_current_internal(uuid,jsonb)', 'consumer_method_notice_trigger()', 'cancel_consumer_notices_before_erasure()', 'bind_consumer_grant_generation()']) {
            const r = (await database.pool.query("SELECT p.prosecdef,p.proconfig,p.proowner=(SELECT proowner FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure) owner,has_function_privilege('security_test_runtime',p.oid,'EXECUTE') allowed FROM pg_proc p WHERE p.oid=$1::regprocedure", ['identity.' + signature])).rows[0];
            expect(r).toMatchObject({ prosecdef: true, owner: true, allowed: false });
            expect(r.proconfig).toContain('search_path=pg_catalog');
        }
        expect((await database.pool.query("SELECT has_function_privilege('security_test_runtime','staff.consumer_security_affiliated(uuid)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
    });
    it('permits trusted invalidation of stale grants once revoked, expired, held or erasing authority is gone', async () => {
        for (const state of ['revoked', 'expired', 'held', 'erasing']) {
            const a = await account(), h = await grant(a, a.factors[0]!);
            await database.pool.query('UPDATE identity.session SET token_hash=$1 WHERE session_id=$2', [hashToken('session', token()), a.sessionId]);
            if (state === 'revoked')
                await database.pool.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE session_id=$1', [a.sessionId]);
            if (state === 'expired')
                await database.pool.query("UPDATE identity.session SET created_at=clock_timestamp()-interval '2 minutes',last_seen_at=clock_timestamp()-interval '1 minute',last_mfa_at=clock_timestamp()-interval '1 minute',idle_expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [a.sessionId]);
            if (state === 'held')
                await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held) VALUES($1,true)', [a.userId]);
            if (state === 'erasing')
                await database.pool.query("UPDATE identity.\"user\" SET state='suspended' WHERE user_id=$1", [a.userId]);
            await database.pool.query('UPDATE identity.step_up_grant SET consumed_at=clock_timestamp() WHERE token_hash=$1', [h]);
            expect((await database.pool.query('SELECT consumed_at FROM identity.step_up_grant WHERE token_hash=$1', [h])).rows[0].consumed_at).not.toBeNull();
        }
    });
    it('rolls back factor removal, grant use and notices when supplied audit context is tampered', async () => {
        const a = await account(), h = await grant(a, a.factors[0]!);
        const c = await runtime.connect();
        await c.query('BEGIN');
        await c.query('SELECT identity.begin_runtime_audit_attempt()');
        try {
            await expect(c.query('SELECT identity.remove_consumer_auth_method($1,$2)', [{ ...a, factorId: a.factors[0], grantHash: h }, { ...source, phone: '+0000' }])).rejects.toThrow('CONSUMER_SECURITY_AUDIT_INVALID');
        }
        finally {
            await c.query('ROLLBACK');
            c.release();
        }
        expect((await database.pool.query('SELECT consumed_at FROM identity.step_up_grant WHERE token_hash=$1', [h])).rows[0].consumed_at).toBeNull();
        expect((await database.pool.query('SELECT count(*)::int n FROM identity.consumer_passkey_credential WHERE user_id=$1 AND revoked_at IS NULL', [a.userId])).rows[0].n).toBe(2);
    });
    it('does not count a TOTP with a malformed or stale password snapshot as a complete path', async () => {
        const a = await account();
        await database.pool.query('DELETE FROM identity.consumer_passkey_credential WHERE consumer_credential_id=$1', [a.factors[1]]);
        await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp','{}','active',now(),now())`, [randomUUID(), a.userId]);
        const input = { ...a, passwordHashSnapshot: 'fixture-password', passwordUsable: false };
        const methods = (await runtime.query('SELECT identity.read_consumer_auth_methods($1) value', [input])).rows[0].value;
        expect(methods.methods.find((m: {
            type: string;
        }) => m.type === 'passkey').removable).toBe(false);
        await expect(mutation('remove_consumer_auth_method', { ...input, factorId: a.factors[0], grantHash: await grant(a, a.factors[0]!) })).rejects.toThrow('CONSUMER_LAST_METHOD');
        const stale = await grant(a,a.factors[0]!);
        await database.pool.query('UPDATE identity.\"user\" SET password_hash=$1 WHERE user_id=$2',[fixturePasswordHash.replace('m=65536','m=65537'),a.userId]);
        await expect(mutation('remove_consumer_auth_method',{...a,factorId:a.factors[0],grantHash:stale})).rejects.toThrow('CONSUMER_LAST_METHOD');
    });
    it('projects only usable step-up paths with NULL passwords, exact admitted providers and current snapshots', async()=>{
      const a=await account(),configuration='sha256:'+ 'aa'.repeat(32);
      await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp','{}','active',now(),now())`,[randomUUID(),a.userId]);
      const read=async(input:unknown)=>(await runtime.query('SELECT identity.read_consumer_auth_methods($1) value',[input])).rows[0].value;
      expect((await read(a)).available_step_up_methods).toEqual(['passkey','password_totp']);
      await database.pool.query(`INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration) VALUES($1,'google','https://accounts.google.com','test-app',$2,$3)`,[a.userId,randomUUID(),configuration]);
      await database.pool.query('UPDATE identity."user" SET password_hash=NULL WHERE user_id=$1',[a.userId]);
      const nullable={...a,passwordHashSnapshot:null,passwordUsable:false,admittedProviders:[configuration]};
      expect(await read(nullable)).toMatchObject({available_step_up_methods:['passkey','provider'],step_up_providers:['google']});
      expect(await read({...nullable,admittedProviders:[]})).toMatchObject({available_step_up_methods:['passkey'],step_up_providers:[]});
      await database.pool.query('UPDATE identity."user" SET password_hash=$1 WHERE user_id=$2',['malformed',a.userId]);
      expect((await read({...a,passwordHashSnapshot:'malformed',passwordUsable:false})).available_step_up_methods).toEqual(['passkey']);
      expect((await read(a)).available_step_up_methods).toEqual(['passkey']);
      await database.pool.query('INSERT INTO staff.subject(user_id) VALUES($1)',[a.userId]);
      expect((await read({...nullable,admittedProviders:[configuration]})).step_up_providers).toEqual([]);
      await expect(runtime.query('SELECT identity.consumer_social_path_internal($1,NULL,NULL,NULL,false,$2)',[a.userId,JSON.stringify([configuration])])).rejects.toMatchObject({code:'42501'});
      await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held) VALUES($1,true)',[a.userId]);
      await expect(read(nullable)).rejects.toThrow('CONSUMER_SECURITY_INVALID');
    });

});
