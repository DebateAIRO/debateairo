import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate, PostgresSocialIdentityRepository, type Pool } from '@debateai/db';
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
it('keeps every new table/helper private and separates API signup from authorization-runtime capabilities', async () => {
    for (const table of ['social_flow', 'social_identity', 'social_enrollment'])
        for (const role of ['debateai_runtime', 'debateai_authorization_runtime', 'debateai_erasure_runtime', 'debateai_replay']) {
            const r = (await database.pool.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed", [role, 'identity.' + table])).rows[0];
            expect(r.allowed).toBe(false);
        }
    for (const signature of ['prune_social_flows()', 'begin_social_flow(jsonb)', 'claim_social_flow(jsonb)', 'finish_social_callback(jsonb,jsonb)', 'read_social_signup(jsonb)', 'create_social_account(jsonb,jsonb)', 'complete_social_login(jsonb,jsonb)', 'read_social_links(jsonb)', 'unlink_social_identity(jsonb,jsonb)', 'read_social_step_up(jsonb)', 'begin_social_step_up_passkey(jsonb)', 'complete_social_step_up(jsonb,jsonb)', 'create_social_account_v2(jsonb,jsonb)', 'finish_social_callback_v2(jsonb,jsonb)', 'prune_social_flows_evicting(integer)']) {
        const r = (await database.pool.query("SELECT prosecdef,proconfig,proowner=(SELECT proowner FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure) owner,has_function_privilege('social_test_runtime',oid,'EXECUTE') allowed,has_function_privilege('debateai_runtime',oid,'EXECUTE') app_allowed FROM pg_proc WHERE oid=$1::regprocedure", ['identity.' + signature])).rows[0];
        expect(r).toMatchObject({ prosecdef: true, owner: true, allowed: !signature.startsWith('create_social_account'), app_allowed: false });
        if(signature.startsWith('create_social_account'))expect((await database.pool.query("SELECT has_function_privilege('debateai_billing_runtime',$1,'EXECUTE') allowed",['identity.'+signature])).rows[0].allowed).toBe(true);
        // The auth DB batch step re-pins the functions it replaces to search pg_temp last (create_social_account keeps
        // exactly pg_catalog: the sealed effective-capability verifier pins it); NV-13's v2 functions are new, so pg_temp last.
        expect(r.proconfig).toContain(['complete_social_login(jsonb,jsonb)','complete_social_step_up(jsonb,jsonb)','create_social_account_v2(jsonb,jsonb)','finish_social_callback_v2(jsonb,jsonb)','prune_social_flows_evicting(integer)'].includes(signature) ? 'search_path=pg_catalog, pg_temp' : 'search_path=pg_catalog');
    }
    for (const signature of ['guard_social_parent()', 'require_social_password_origin()', 'require_social_password_origin_v2()', 'social_first_step_current_internal(uuid,jsonb,text)', 'login_first_step_current_internal(uuid,jsonb,text)', 'lock_consumer_enrollment_internal(text,text,text,text,jsonb)', 'consumer_social_path_internal(uuid,uuid,text,text,boolean,jsonb)', 'append_social_audit_internal(uuid,text,jsonb)'])
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
// NV-13: an untrusted social sign-up leaves a NULL-password, link-less pending_verification row, which the v2 origin
// check admits; every other state still needs a password or a link. Each case is one rolled-back transaction.
it('binds both origin triggers to the v2 check, which admits a NULL-password, link-less row only while it is pending_verification', async () => {
    expect((await database.pool.query(`SELECT t.tgrelid::regclass::text relation,t.tgname,t.tgfoid::regprocedure::text fn,t.tgenabled::text enabled,t.tgdeferrable,t.tginitdeferred
        FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname IN ('social_password_origin','social_password_origin_link') ORDER BY t.tgname`)).rows).toEqual([
        { relation: 'identity."user"', tgname: 'social_password_origin', fn: 'identity.require_social_password_origin_v2()', enabled: 'O', tgdeferrable: true, tginitdeferred: true },
        { relation: 'identity.social_identity', tgname: 'social_password_origin_link', fn: 'identity.require_social_password_origin_v2()', enabled: 'O', tgdeferrable: true, tginitdeferred: true }]);
    expect((await database.pool.query("SELECT count(*)::int n FROM pg_trigger WHERE tgfoid='identity.require_social_password_origin()'::regprocedure")).rows[0].n).toBe(0);
    type Step = (c: PoolClient, user: string) => Promise<unknown>;
    const link: Step = (c, user) => c.query("INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration) VALUES($1,'google','https://accounts.google.com','nv13-origin',$2,$3)", [user, user, 'sha256:' + '12'.repeat(32)]);
    const unlink: Step = (c, user) => c.query('DELETE FROM identity.social_identity WHERE user_id=$1', [user]);
    const immediate = (constraint: string): Step => (c) => c.query(`SET CONSTRAINTS identity.${constraint} IMMEDIATE`);
    const attempt = async (state: string, password: string | null, ...steps: Step[]) => {
        const c = await database.pool.connect(), user = randomUUID();
        try {
            await c.query('BEGIN');
            await c.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
                VALUES($1,$2,'{}','{}',$3,$4,$5,clock_timestamp())`, [user, createHash('sha256').update(user).digest(), password, user, state]);
            for (const step of steps) await step(c, user);
            return 'admitted';
        } catch (error) { return (error as Error).message; }
        finally { await c.query('ROLLBACK'); c.release(); }
    };
    // (a) pending_verification, no password, no link: admitted
    expect(await attempt('pending_verification', null, immediate('social_password_origin'))).toBe('admitted');
    // (b) pending_mfa, no password, no link: refused
    expect(await attempt('pending_mfa', null, immediate('social_password_origin'))).toBe('PASSWORD_REQUIRED');
    // (c) a pending_verification row with a password that leaves pending_verification and loses its password: refused
    expect(await attempt('pending_verification', 'synthetic-password', (c, user) => c.query(`UPDATE identity."user" SET state='active',password_hash=NULL WHERE user_id=$1`, [user]), immediate('social_password_origin'))).toBe('PASSWORD_REQUIRED');
    // (d) pending_mfa with a link is admitted; deleting its last link is refused, as with 0101's check
    expect(await attempt('pending_mfa', null, link, immediate('social_password_origin'))).toBe('admitted');
    expect(await attempt('pending_mfa', null, link, immediate('social_password_origin'), unlink, immediate('social_password_origin_link'))).toBe('PASSWORD_REQUIRED');
    // (e) deleting the link of a pending_verification row is admitted (0101's check refused it)
    expect(await attempt('pending_verification', null, link, immediate('social_password_origin'), unlink, immediate('social_password_origin_link'))).toBe('admitted');
});
// NV-41: at capacity 8 both marks are 7, so the repository's cleanup gives up exactly one row: the oldest unclaimed LOGIN
// row of the heaviest source. A claimed row is never a candidate.
it("NV-41: a full social store gives up the heaviest source's oldest unclaimed row", async () => {
    await database.pool.query('DELETE FROM identity.social_flow');
    const flow = (retentionKey: string) => ({ stateHash: hash(), cookieHash: hash(), bindingHash: hash(), nonceHash: hash(), retentionKey, provider: 'google', configuration: 'sha256:' + '12'.repeat(32), purpose: 'LOGIN' as const, next: '/', challengeCapacity: 8, challengesPerScope: 5 });
    const sourceA = hash(), a = Array.from({ length: 5 }, () => flow(sourceA)), others = [flow(hash()), flow(hash()), flow(hash())];
    for (const seed of [...a, ...others]) await runtime.query('SELECT identity.begin_social_flow($1)', [seed]);
    await database.pool.query('UPDATE identity.social_flow SET claimed_at=clock_timestamp(),claim_id=gen_random_uuid() WHERE state_hash=$1', [a[0]!.stateHash]);
    const e = flow(hash());
    await expect(new PostgresSocialIdentityRepository(runtime, {} as never).begin(e, { ip: '203.0.113.5', userAgent: 'it', requestId: 'r', mailLocale: 'en' })).resolves.toMatchObject({ expiresAt: expect.anything() });
    const left = (await database.pool.query('SELECT state_hash FROM identity.social_flow')).rows.map(row => row.state_hash);
    expect(left).toHaveLength(8);
    expect(left).not.toContain(a[1]!.stateHash);
    expect(new Set(left)).toEqual(new Set([a[0]!, ...a.slice(2), ...others, e].map(seed => seed.stateHash)));
    // The cleanup it supersedes keeps its owner; the new one searches pg_temp last and has no PUBLIC row.
    expect((await database.pool.query("SELECT p.proconfig,p.proowner=(SELECT proowner FROM pg_proc WHERE oid='identity.prune_social_flows()'::regprocedure) owner,has_function_privilege('public',p.oid,'EXECUTE') public_allowed FROM pg_proc p WHERE p.oid='identity.prune_social_flows_evicting(integer)'::regprocedure")).rows[0])
        .toEqual({ proconfig: ['search_path=pg_catalog, pg_temp'], owner: true, public_allowed: false });
});
