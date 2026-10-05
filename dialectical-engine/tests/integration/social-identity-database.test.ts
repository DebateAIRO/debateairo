import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate, type Pool } from '@debateai/db';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
let database: TestDatabase, runtime: Pool;
const hash = () => 'sha256:' + randomBytes(32).toString('hex');
beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    await database.pool.query("CREATE ROLE social_test_runtime LOGIN PASSWORD 'social-test-only' IN ROLE debateai_authorization_runtime");
    const url = new URL(database.connectionString);
    url.username = 'social_test_runtime';
    url.password = 'social-test-only';
    runtime = createPool(url.toString());
}, 120000);
afterAll(async () => { await runtime?.end(); await database?.stop(); });
describe('restricted-role social browser flow authority', () => {
    it('claims a bound state only once and rejects a substituted cookie without spending it', async () => {
        const stateHash = hash(), cookieHash = hash(), bindingHash = hash();
        const seed = { stateHash, cookieHash, bindingHash, nonceHash: hash(), retentionKey: hash(), provider: 'google', configuration: 'sha256:' + '12'.repeat(32), purpose: 'LOGIN', next: '/', challengeCapacity: 8192, challengesPerScope: 5 };
        const begun = await runtime.query('SELECT identity.begin_social_flow($1) value', [seed]);
        expect(begun.rows[0].value.expiresAt).toBeTruthy();
        const claim = { stateHash, cookieHash, bindingHash, provider: 'google', configuration: seed.configuration };
        expect((await runtime.query('SELECT identity.claim_social_flow($1) value', [{ ...claim, cookieHash: hash() }])).rows[0].value).toBeNull();
        const outcomes = await Promise.all([runtime.query('SELECT identity.claim_social_flow($1) value', [claim]), runtime.query('SELECT identity.claim_social_flow($1) value', [claim])]);
        expect(outcomes.filter(x => x.rows[0].value !== null)).toHaveLength(1);
        await expect(runtime.query('SELECT * FROM identity.social_flow')).rejects.toMatchObject({ code: '42501' });
    });
});
it('keeps every new table/helper private and exposes only fixed authorization-runtime capabilities', async () => {
    for (const table of ['social_flow', 'social_identity', 'social_enrollment'])
        for (const role of ['debateai_runtime', 'debateai_authorization_runtime', 'debateai_erasure_runtime', 'debateai_replay']) {
            const r = (await database.pool.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed", [role, 'identity.' + table])).rows[0];
            expect(r.allowed).toBe(false);
        }
    for (const signature of ['prune_social_flows()', 'begin_social_flow(jsonb)', 'claim_social_flow(jsonb)', 'finish_social_callback(jsonb,jsonb)', 'read_social_signup(jsonb)', 'create_social_account(jsonb,jsonb)', 'complete_social_login(jsonb,jsonb)', 'read_social_links(jsonb)', 'unlink_social_identity(jsonb,jsonb)', 'read_social_step_up(jsonb)', 'begin_social_step_up_passkey(jsonb)', 'complete_social_step_up(jsonb,jsonb)']) {
        const r = (await database.pool.query("SELECT prosecdef,proconfig,proowner=(SELECT proowner FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure) owner,has_function_privilege('social_test_runtime',oid,'EXECUTE') allowed,has_function_privilege('debateai_runtime',oid,'EXECUTE') app_allowed FROM pg_proc WHERE oid=$1::regprocedure", ['identity.' + signature])).rows[0];
        expect(r).toMatchObject({ prosecdef: true, owner: true, allowed: true, app_allowed: false });
        expect(r.proconfig).toContain('search_path=pg_catalog');
    }
    for (const signature of ['guard_social_parent()', 'require_social_password_origin()', 'social_first_step_current_internal(uuid,jsonb,text)', 'login_first_step_current_internal(uuid,jsonb,text)', 'lock_consumer_enrollment_internal(text,text,text,text,jsonb)', 'consumer_social_path_internal(uuid,uuid,text,text,boolean,jsonb)', 'append_social_audit_internal(uuid,text,jsonb)'])
        expect((await database.pool.query("SELECT has_function_privilege('social_test_runtime',$1,'EXECUTE') allowed", ['identity.' + signature])).rows[0].allowed).toBe(false);
    await expect(runtime.query('TRUNCATE identity.social_flow')).rejects.toMatchObject({ code: '42501' });
});
it('bounds anonymous state by source and capacity, then prunes expiration before permitting reuse', async () => {
    await database.pool.query('DELETE FROM identity.social_flow');
    const seed = { stateHash: hash(), cookieHash: hash(), bindingHash: hash(), nonceHash: hash(), retentionKey: hash(), provider: 'google', configuration: 'sha256:' + '12'.repeat(32), purpose: 'LOGIN', next: '/', challengeCapacity: 2, challengesPerScope: 1 };
    await runtime.query('SELECT identity.begin_social_flow($1)', [seed]);
    await expect(runtime.query('SELECT identity.begin_social_flow($1)', [{ ...seed, stateHash: hash() }])).rejects.toThrow('CONSUMER_CHALLENGE_CAPACITY');
    await runtime.query('SELECT identity.begin_social_flow($1)', [{ ...seed, stateHash: hash(), retentionKey: hash() }]);
    await expect(runtime.query('SELECT identity.begin_social_flow($1)', [{ ...seed, stateHash: hash(), retentionKey: hash() }])).rejects.toThrow('CONSUMER_CHALLENGE_CAPACITY');
    await database.pool.query("UPDATE identity.social_flow SET created_at=clock_timestamp()-interval '5 minutes',expires_at=clock_timestamp()-interval '1 second'");
    expect((await runtime.query('SELECT identity.claim_social_flow($1) value', [seed])).rows[0].value).toBeNull();
    await runtime.query('SELECT identity.prune_social_flows()');
    await runtime.query('SELECT identity.begin_social_flow($1)', [{ ...seed, stateHash: hash() }]);
    expect((await database.pool.query('SELECT count(*)::int n FROM identity.social_flow')).rows[0].n).toBe(1);
});
