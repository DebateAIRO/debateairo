import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { createPool, migrate, PostgresStaffRepository, type Pool } from '@debateai/db';
import { StaffWebAuthnService } from '../../apps/api/src/staff/webauthn.js';
import { b64, digest, fixture, key, origin, rpId } from '../support/staffWebAuthnFixtures.js';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
const access = await import('../../apps/api/src/staff/access.js');
let database: TestDatabase, runtime: Pool, repo: PostgresStaffRepository, web: StaffWebAuthnService;
const env = { v: 1 as const, keyId: 'fixture', nonce: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA==', ct: 'YQ==' };
const source = { ipArgon2id: 'argon2id-audit:v1:' + '0'.repeat(64), userAgentArgon2id: 'argon2id-audit:v1:' + '1'.repeat(64) };
async function staff(owner = false) {
    const userId = randomUUID(), ordinarySessionId = randomUUID(), factorId = randomUUID(), staffId = randomUUID(), ordinaryTokenHash = digest(ordinarySessionId);
    await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash('sha256').update(userId).digest(), userId]);
    await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step) VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [factorId, userId]);
    await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour',now()+interval '2 hours',now())`, [ordinarySessionId, userId, ordinaryTokenHash, digest('csrf' + ordinarySessionId), { user_agent_hash: digest('browser') }]);
    await database.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`, [userId]);
    await database.pool.query('INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)', [staffId, userId, owner ? ['TEAM_READ', 'TEAM_INVITE', 'TEAM_GRANT', 'TEAM_DISABLE', 'AUDIT_READ', 'EMERGENCY_DISABLE'] : ['TEAM_READ']]);
    if (owner) {
        await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE active');
        await database.pool.query('INSERT INTO staff.owner_designation(staff_id) VALUES($1)', [staffId]);
    }
    const one = fixture(key(), 1, randomBytes(32)), passkeyId = randomUUID();
    await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter) VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),$5,$6,true,false,false,$7,0)`, [passkeyId, userId, one.expected.credentialId, { format: 'COSE_KEY_BASE64URL_V1', value: b64(one.k.wire) }, rpId, origin, { ...env, keyId: 'passkey-label:' + passkeyId + ':v1' }]);
    await database.pool.query('INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256,transports) VALUES($1,$2,$3,$4)', [passkeyId, userId, digest(one.handle), ['usb']]);
    if (owner) {
        const two = fixture(key(), 1, randomBytes(32)), id = randomUUID();
        await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter) VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),$5,$6,true,false,false,$7,0)`, [id, userId, two.expected.credentialId, { format: 'COSE_KEY_BASE64URL_V1', value: b64(two.k.wire) }, rpId, origin, { ...env, keyId: 'passkey-label:' + id + ':v1' }]);
        await database.pool.query('INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256,transports) VALUES($1,$2,$3,$4)', [id, userId, digest(two.handle), ['usb']]);
    }
    const ownerRef = (await database.pool.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0].owner_ref as string;
    return { userId, ordinarySessionId, factorId, staffId, one, ordinaryTokenHash, ownerRef };
}
type Actor = Awaited<ReturnType<typeof staff>>;
const assertion = (a: Actor, challenge: string, counter = 1) => a.one.assertion({ client: Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin })), auth: a.one.auth(5, counter) });
async function elevation(a: Actor) {
    const options = await web.beginElevation(a), issued = await web.finishElevation(a, { challenge_handle: options.challenge_handle, credential: assertion(a, options.options.challenge) }), context = await repo.readContext({ ...a, staffTokenHash: digest(issued.staffToken) });
    if (!context)
        throw new Error('NO_CONTEXT');
    return { issued, context };
}
async function action(a: Actor, c: NonNullable<Awaited<ReturnType<typeof repo.readContext>>>, targetId: string, kind: 'TEAM_DISABLE' | 'TEAM_GRANT' | 'EMERGENCY_DISABLE' = 'TEAM_DISABLE', counter = 2) { const binding = { action: kind, targetId, bodySha256: 'a'.repeat(64), expectedRevision: 0, operationId: randomUUID() }, options = await web.beginAction(c, binding), p = await web.finishAction(c, binding, { challenge_handle: options.challenge_handle, credential: assertion(a, options.options.challenge, counter) }); return { ...p, binding }; }
async function disable(owner: Actor, c: NonNullable<Awaited<ReturnType<typeof repo.readContext>>>, target: Actor, mode: 'OFFBOARD' | 'COMPROMISE', connection = runtime, counter = 2) { const p = await action(owner, c, target.staffId, mode === 'COMPROMISE' ? 'EMERGENCY_DISABLE' : 'TEAM_DISABLE', counter); return new PostgresStaffRepository(connection).disable({ actor: c, proof: p.proof, targetStaffId: target.staffId, mode, operationId: p.binding.operationId, reason: { code: 'SECURITY_RESPONSE' }, alertIntent: { schema: 'staff-alert-v1', event: 'DISABLE', operationId: p.binding.operationId, envelope: env } }); }
async function waitForLock(pid: number) {
    for (let n = 0; n < 100; n++) {
        const row = (await database.pool.query('SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0];
        if (row?.wait_event_type === 'Lock')
            return row;
        await new Promise(r => setTimeout(r, 10));
    }
    throw new Error('BARRIER_NOT_BLOCKED');
}
beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); await database.pool.query(`CREATE ROLE task4_test_runtime LOGIN PASSWORD 'task4-test-only' IN ROLE debateai_runtime,debateai_authorization_runtime`); const url = new URL(database.connectionString); url.username = 'task4_test_runtime'; url.password = 'task4-test-only'; runtime = createPool(url.toString()); repo = new PostgresStaffRepository(runtime); web = new StaffWebAuthnService(repo, { publicAppUrl: origin }); }, 120000);
afterAll(async () => { await runtime?.end(); await database?.stop(); });
describe('Task4 guards and actual disable races', () => {
    it('installs named guarded ordinary/current/proof reads with closed ACLs', async () => {
        const names = ['assert_session_current', 'read_authentication', 'read_current_context', 'read_action_proof'];
        const rows = (await database.pool.query(`SELECT p.oid::regprocedure::text AS signature,p.proname,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl::text AS acl,EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public,has_function_privilege('debateai_runtime',p.oid,'EXECUTE') AS runtime,has_function_privilege('debateai_authorization_runtime',p.oid,'EXECUTE') AS authorization,has_function_privilege('debateai_staff_recovery',p.oid,'EXECUTE') AS recovery FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('staff','identity') AND p.proname=ANY($1) ORDER BY signature`, [names])).rows;
        expect(rows).toHaveLength(4);
        for (const row of rows) {
            expect(row.public).toBe(false);
            expect(row.recovery).toBe(false);
            expect(row.prosecdef).toBe(true);
            expect(row.proconfig).toEqual(['search_path=pg_catalog']);
        }
        await writeFile('/Users/stefannour/DebateAIRO/docs/operations/admin-implementation-2026-10-02/logs/task4-catalog-acl.json', JSON.stringify(rows, null, 2) + '\n');
    });
    it('rejects caller time after a final blocking challenge lock rather than minting an expired TOTP session', async () => {
        const a = await staff(), challenge = randomUUID(), challengeHash = digest(challenge), now = new Date();
        await database.pool.query(`INSERT INTO identity.login_challenge(login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,password_hash_snapshot,created_at,expires_at) VALUES($1,$2,$3,$4,$5,'fixture-password',now(),now()+interval '250 milliseconds')`, [challenge, a.userId, a.factorId, challengeHash, digest('browser')]);
        await new Promise(r => setTimeout(r, 3));
        const actualNow = (await database.pool.query('SELECT clock_timestamp() AS t')).rows[0].t as Date;
        const first = await database.pool.connect(), second = await runtime.connect();
        try {
            await first.query('BEGIN');
            await first.query('SELECT 1 FROM identity.login_challenge WHERE login_challenge_id=$1 FOR UPDATE', [challenge]);
            await second.query('BEGIN');
            await second.query('SELECT identity.begin_runtime_audit_attempt()');
            const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, sessionId = randomUUID(), pending = second.query('SELECT identity.complete_totp_login_with_audit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) AS valid', [a.userId, a.ownerRef, 'fixture-password', a.factorId, challenge, challengeHash, digest('browser'), 2, sessionId, digest(sessionId), digest('newcsrf'), {}, actualNow, new Date(actualNow.getTime() + 60000), new Date(actualNow.getTime() + 120000), source]);
            await waitForLock(pid);
            await new Promise(r => setTimeout(r, 300));
            await first.query('COMMIT');
            expect((await pending).rows[0].valid).toBe(false);
            await second.query('COMMIT');
            expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.session WHERE session_id=$1', [sessionId])).rows[0].n).toBe(0);
        }
        finally {
            await first.query('ROLLBACK');
            await second.query('ROLLBACK');
            first.release();
            second.release();
        }
    });
    it('binds guarded authentication and proof reads to ordinary token generation and exact stored action without consuming', async () => {
        const a = await staff(true), { issued, context } = await elevation(a), p = await action(a, context, a.staffId, 'TEAM_GRANT');
        const input = { userId: a.userId, ordinarySessionId: a.ordinarySessionId, ordinaryTokenHash: a.ordinaryTokenHash, staffTokenHash: digest(issued.staffToken) };
        expect((await repo.readAuthentication(input))?.context).toEqual(context);
        expect((await repo.readCurrentContext({ context, ordinaryTokenHash: a.ordinaryTokenHash }))?.csrfTokenHash).toBe(digest(issued.staffCsrfToken));
        for (const b of [p.binding, { ...p.binding, expectedRevision: 1 }, { ...p.binding, targetId: randomUUID() }])
            expect(await repo.readActionProof({ context, ordinaryTokenHash: a.ordinaryTokenHash, proofHandleHash: digest(p.proofHandle), binding: b })).toEqual(b === p.binding ? p.proof : null);
        expect((await database.pool.query('SELECT consumed_at FROM staff.action_proof WHERE proof_id=$1', [p.proof.proofId])).rows[0].consumed_at).toBeNull();
        await database.pool.query('UPDATE identity.session SET token_hash=$1 WHERE session_id=$2', [digest('rotated'), a.ordinarySessionId]);
        expect(await repo.readAuthentication(input)).toBeNull();
        expect(await repo.readCurrentContext({ context, ordinaryTokenHash: a.ordinaryTokenHash })).toBeNull();
    });
    it('OFFBOARD kills staff authority while preserving ordinary session and factors; COMPROMISE kills both', async () => {
        const owner = await staff(true), e = await elevation(owner);
        for (const mode of ['OFFBOARD', 'COMPROMISE'] as const) {
            const target = await staff(), t = await elevation(target), options = await web.beginElevation(target);
            await disable(owner, e.context, target, mode, runtime, mode === 'OFFBOARD' ? 2 : 3);
            expect(await repo.readContext({ ...target, staffTokenHash: digest(t.issued.staffToken) })).toBeNull();
            await expect(web.finishElevation(target, { challenge_handle: options.challenge_handle, credential: assertion(target, options.options.challenge, 2) })).rejects.toThrow();
            const row = (await database.pool.query('SELECT revoked_at FROM identity.session WHERE session_id=$1', [target.ordinarySessionId])).rows[0];
            expect(row.revoked_at === null).toBe(mode === 'OFFBOARD');
            const factors = (await database.pool.query("SELECT count(*)::int AS n FROM identity.mfa_factor WHERE user_id=$1 AND state='active'", [target.userId])).rows[0].n;
            expect(factors > 0).toBe(mode === 'OFFBOARD');
        }
    });
    it('linearizes actual COMPROMISE before an ordinary password-challenge producer waiting on the security subject', async () => {
        const owner = await staff(true), e = await elevation(owner), target = await staff(), p = await action(owner, e.context, target.staffId, 'EMERGENCY_DISABLE'), first = await runtime.connect(), second = await runtime.connect();
        try {
            await first.query('BEGIN');
            const txRepo = new PostgresStaffRepository({ query: first.query.bind(first) } as unknown as Pool);
            await txRepo.disable({ actor: e.context, proof: p.proof, targetStaffId: target.staffId, mode: 'COMPROMISE', operationId: p.binding.operationId, reason: { code: 'SECURITY_RESPONSE' }, alertIntent: { schema: 'staff-alert-v1', event: 'DISABLE', operationId: p.binding.operationId, envelope: env } });
            await second.query('BEGIN');
            await second.query('SELECT identity.begin_runtime_audit_attempt()');
            const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, now = new Date(), pending = second.query('SELECT identity.create_login_challenge_with_audit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS valid', [target.userId, target.ownerRef, 'fixture-password', target.factorId, randomUUID(), digest(randomBytes(32)), digest('browser'), now, new Date(now.getTime() + 60000), source]);
            await waitForLock(pid);
            await first.query('COMMIT');
            expect((await pending).rows[0].valid).toBe(false);
            await second.query('COMMIT');
        }
        finally {
            await first.query('ROLLBACK');
            await second.query('ROLLBACK');
            first.release();
            second.release();
        }
    });
});
it('cancels the actual private PostgreSQL snapshot query and its waiting iterator on abort', async () => {
    const { PostgresAskApplication } = await import('../../apps/api/src/index.js');
    const a = await staff(), controller = new AbortController(), first = await database.pool.connect();
    const app = new PostgresAskApplication(runtime, {} as never, {} as never, { read: async () => [] }, runtime, { server: {} as never, legacy: {} as never });
    const session = { session_id: a.ordinarySessionId, asker_id: 'owner:' + a.ownerRef, caller_scope: 'ASKER' as const, ownership_provenance: 'server_session' as const, provisional_identity_model: false as const };
    let pending: Promise<string> | undefined;
    try {
        await first.query('BEGIN');
        await first.query('LOCK TABLE core.run_progress_event IN ACCESS EXCLUSIVE MODE');
        const iterator = app.events(randomUUID(), session, { ownerRef: a.ownerRef, legacyAskerId: null }, controller.signal)[Symbol.asyncIterator]();
        pending = iterator.next().then(() => 'completed', () => 'cancelled');
        let blocked = false;
        for (let n = 0; n < 100; n++) {
            blocked = (await database.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='task4_test_runtime' AND wait_event_type='Lock' AND query LIKE '%core.run_progress_event%') AS blocked")).rows[0].blocked;
            if (blocked)
                break;
            await new Promise(r => setTimeout(r, 10));
        }
        expect(blocked).toBe(true);
        controller.abort();
        expect(await Promise.race([pending, new Promise<string>(r => setTimeout(() => r('pending'), 150))])).toBe('cancelled');
    }
    finally {
        await first.query('ROLLBACK');
        first.release();
        await pending;
    }
});
it('bounds a genuinely blocked current check locally without refreshing ordinary/staff expiry or leaving a transaction', async () => {
    const a = await staff(), e = await elevation(a), before = (await database.pool.query('SELECT last_seen_at,idle_expires_at FROM staff.privilege_session WHERE privilege_session_id=$1', [e.context.privilegeSessionId])).rows[0];
    expect(await repo.readCurrentContext({ context: e.context, ordinaryTokenHash: a.ordinaryTokenHash })).not.toBeNull();
    expect((await database.pool.query('SELECT last_seen_at,idle_expires_at FROM staff.privilege_session WHERE privilege_session_id=$1', [e.context.privilegeSessionId])).rows[0]).toEqual(before);
    const first = await database.pool.connect();
    try {
        await first.query('BEGIN');
        await first.query('SELECT identity.lock_security_subjects($1::uuid[])', [[a.userId]]);
        const started = Date.now();
        await expect(repo.readCurrentContext({ context: e.context, ordinaryTokenHash: a.ordinaryTokenHash })).rejects.toThrow();
        expect(Date.now() - started).toBeLessThan(1000);
        await first.query('ROLLBACK');
        expect(await repo.readCurrentContext({ context: e.context, ordinaryTokenHash: a.ordinaryTokenHash })).not.toBeNull();
    }
    finally {
        await first.query('ROLLBACK');
        first.release();
    }
});
it('observes fixed notifications only after commit, rechecks persistent authority and unsubscribes', async () => {
    const a = await staff(), e = await elevation(a);
    let notifications = 0;
    const dispose = repo.subscribeRevocations(() => { notifications++; });
    await new Promise(r => setTimeout(r, 30));
    const first = await database.pool.connect();
    try {
        await first.query('BEGIN');
        await first.query("UPDATE staff.subject SET capabilities='{}',security_epoch=security_epoch+1 WHERE staff_id=$1", [a.staffId]);
        await new Promise(r => setTimeout(r, 20));
        expect(notifications).toBe(0);
        await first.query('COMMIT');
        for (let n = 0; n < 100 && notifications === 0; n++)
            await new Promise(r => setTimeout(r, 5));
        expect(notifications).toBeGreaterThan(0);
        expect(await repo.readCurrentContext({ context: e.context, ordinaryTokenHash: a.ordinaryTokenHash })).toBeNull();
        dispose();
        const seen = notifications;
        await database.pool.query("SELECT pg_notify('staff_authority_changed','changed')");
        await new Promise(r => setTimeout(r, 10));
        expect(notifications).toBe(seen);
    }
    finally {
        dispose();
        await first.query('ROLLBACK');
        first.release();
    }
});
it('serializes actual compromise against native action-proof issuance and ordinary TOTP/recovery/step-up admission', async () => {
    for (const kind of ['proof', 'totp', 'recovery', 'stepup'] as const) {
        const owner = await staff(true), o = await elevation(owner), target = await staff(), t = await elevation(target), challenge = randomUUID(), challengeHash = digest(challenge), recoveryId = randomUUID();
        await database.pool.query(`INSERT INTO identity.login_challenge(login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,password_hash_snapshot,created_at,expires_at) VALUES($1,$2,$3,$4,$5,'fixture-password',now(),now()+interval '5 minutes')`, [challenge, target.userId, target.factorId, challengeHash, digest('browser')]);
        await database.pool.query(`INSERT INTO identity.recovery_code(recovery_code_id,user_id,code_slot,code_hash) VALUES($1,$2,1,'fixture-recovery')`, [recoveryId, target.userId]);
        const binding = { action: 'CREDENTIAL_REVOKE' as const, targetId: target.userId, bodySha256: 'd'.repeat(64), expectedRevision: 0, operationId: randomUUID() }, options = await web.beginAction(t.context, binding), p = await action(owner, o.context, target.staffId, 'EMERGENCY_DISABLE'), first = await runtime.connect(), second = await runtime.connect();
        try {
            await first.query('BEGIN');
            await new PostgresStaffRepository({ query: first.query.bind(first) } as unknown as Pool).disable({ actor: o.context, proof: p.proof, targetStaffId: target.staffId, mode: 'COMPROMISE', operationId: p.binding.operationId, reason: { code: 'SECURITY_RESPONSE' }, alertIntent: { schema: 'staff-alert-v1', event: 'DISABLE', operationId: p.binding.operationId, envelope: env } });
            await second.query('BEGIN');
            const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, now = new Date(), freshId = randomUUID();
            let pending: Promise<unknown>;
            if (kind === 'proof') {
                pending = new StaffWebAuthnService(new PostgresStaffRepository({ query: second.query.bind(second) } as unknown as Pool), { publicAppUrl: origin }).finishAction(t.context, binding, { challenge_handle: options.challenge_handle, credential: assertion(target, options.options.challenge, 2) });
            }
            else {
                await second.query('SELECT identity.begin_runtime_audit_attempt()');
                if (kind === 'stepup')
                    pending = second.query('SELECT identity.rotate_session_after_step_up_with_audit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) AS valid', [target.userId, target.ownerRef, 'fixture-password', target.factorId, 2, target.ordinarySessionId, target.ordinaryTokenHash, digest(freshId), digest('newcsrf' + freshId), {}, new Date(now.getTime() + 60000), null, null, null, null, null, source]);
                else if (kind === 'totp')
                    pending = second.query('SELECT identity.complete_totp_login_with_audit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) AS valid', [target.userId, target.ownerRef, 'fixture-password', target.factorId, challenge, challengeHash, digest('browser'), 2, freshId, digest(freshId), digest('newcsrf' + freshId), {}, now, new Date(now.getTime() + 60000), new Date(now.getTime() + 120000), source]);
                else
                    pending = second.query('SELECT identity.complete_recovery_login_with_audit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) AS valid', [target.userId, target.ownerRef, 'fixture-password', target.factorId, challenge, challengeHash, digest('browser'), recoveryId, 'fixture-replacement', freshId, digest(freshId), digest('newcsrf' + freshId), {}, now, new Date(now.getTime() + 60000), new Date(now.getTime() + 120000), source]);
            }
            const observed = pending.then(value => ({ value, error: false }), () => ({ value: null, error: true }));
            await waitForLock(pid);
            await first.query('COMMIT');
            const result = await observed;
            if (kind === 'proof')
                expect(result.error).toBe(true);
            else
                expect((result.value as {
                    rows: {
                        valid: boolean;
                    }[];
                }).rows[0]!.valid).toBe(false);
            await second.query('ROLLBACK');
            expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.action_proof WHERE user_id=$1 AND consumed_at IS NULL', [target.userId])).rows[0].n).toBe(0);
            expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.session WHERE user_id=$1 AND revoked_at IS NULL', [target.userId])).rows[0].n).toBe(0);
        }
        finally {
            await first.query('ROLLBACK');
            await second.query('ROLLBACK');
            first.release();
            second.release();
        }
    }
});
it('records a mutation committed first, then disables its actor without claiming the committed grant was undone', async () => {
    const owner = await staff(true), o = await elevation(owner), actor = await staff(true), a = await elevation(actor), target = await staff(), p = await action(actor, a.context, target.staffId, 'TEAM_GRANT'), first = await runtime.connect();
    // actor is the new Owner; the previous Owner retains emergency disable capability.
    try {
        await first.query('BEGIN');
        const receipt = await new PostgresStaffRepository({ query: first.query.bind(first) } as unknown as Pool).grant({ actor: a.context, proof: p.proof, targetStaffId: target.staffId, capabilities: ['AUDIT_READ'], operationId: p.binding.operationId, reason: { code: 'GRANT_CHANGE' }, alertIntent: { schema: 'staff-alert-v1', event: 'GRANT', operationId: p.binding.operationId, envelope: env } });
        expect(receipt.outcome).toBe('COMPLETED');
        await first.query('COMMIT');
        const ownerContext = (await repo.readContext({ ...owner, staffTokenHash: digest(o.issued.staffToken) }))!;
        await disable(owner, ownerContext, actor, 'COMPROMISE');
        expect((await database.pool.query('SELECT capabilities,grant_revision FROM staff.subject WHERE staff_id=$1', [target.staffId])).rows[0]).toMatchObject({ capabilities: ['AUDIT_READ'], grant_revision: '1' });
        expect((await database.pool.query("SELECT count(*)::int AS n FROM staff.audit_event a JOIN staff.alert_outbox o USING(event_id) WHERE a.operation_id=$1 AND a.event_type='GRANT'", [p.binding.operationId])).rows[0].n).toBe(1);
        expect(await repo.readCurrentContext({ context: a.context, ordinaryTokenHash: actor.ordinaryTokenHash })).toBeNull();
    }
    finally {
        await first.query('ROLLBACK');
        first.release();
    }
});
it('captures every Task4 new/replaced definer, unchanged secret-column floor and principal membership', async () => {
    const names = ['assert_session_current', 'read_authentication', 'read_current_context', 'read_action_proof', 'notify_authority_change', 'create_login_challenge_with_audit', 'complete_totp_login_with_audit', 'complete_recovery_login_with_audit', 'authenticate_session_t9', 'rotate_session_after_step_up', 'read_account_security_hold'];
    const functions = (await database.pool.query(`SELECT n.nspname,p.proname,p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl::text AS acl,pg_get_functiondef(p.oid) AS definition,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition_sha256,EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE x.grantee=0 AND x.privilege_type='EXECUTE') AS public,has_function_privilege('debateai_runtime',p.oid,'EXECUTE') AS runtime,has_function_privilege('debateai_authorization_runtime',p.oid,'EXECUTE') AS authorization,has_function_privilege('debateai_staff_recovery',p.oid,'EXECUTE') AS recovery FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('staff','identity') AND p.proname=ANY($1) ORDER BY signature`, [names])).rows;
    expect(functions).toHaveLength(11);
    for (const f of functions) {
        expect(f.public, f.signature).toBe(false);
        expect(f.recovery, f.signature).toBe(false);
        expect(f.prosecdef).toBe(true);
        expect(f.proconfig).toEqual(['search_path=pg_catalog']);
    }
    for (const name of ['read_authentication', 'read_current_context', 'read_action_proof'])
        expect(functions.find(f => f.proname === name)).toMatchObject({ owner: 'debateai_staff_security_owner', runtime: true });
    expect(functions.find(f => f.proname === 'assert_session_current')).toMatchObject({ runtime: true, authorization: true });
    expect(functions.find(f => f.proname === 'notify_authority_change')).toMatchObject({ runtime: false, authorization: false });
    const columns = (await database.pool.query(`SELECT c.oid::regclass::text AS relation,a.attname,has_column_privilege('debateai_runtime',c.oid,a.attnum,'SELECT') AS runtime,has_column_privilege('debateai_authorization_runtime',c.oid,a.attnum,'SELECT') AS authorization,has_column_privilege('debateai_staff_security_owner',c.oid,a.attnum,'SELECT') AS staff_owner FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.oid IN('identity.mfa_factor'::regclass,'identity.session'::regclass,'identity."user"'::regclass) AND a.attnum>0 AND NOT a.attisdropped ORDER BY relation,a.attnum`)).rows;
    expect(columns.filter(c => c.relation === 'identity.mfa_factor' && c.runtime).map(c => c.attname).sort()).toEqual(['mfa_factor_id', 'user_id', 'factor_type', 'state', 'created_at', 'secret_ciphertext', 'last_accepted_step'].sort());
    for (const [relation, column] of [['identity.mfa_factor', 'public_key'], ['identity.mfa_factor', 'secret_ciphertext'], ['identity.session', 'token_hash'], ['identity."user"', 'password_hash']])
        expect(columns.find(c => c.relation === relation && c.attname === column)?.staff_owner).toBe(false);
    const roles = (await database.pool.query(`SELECT rolname,rolcanlogin,rolinherit,rolvaliduntil FROM pg_roles WHERE rolname IN('debateai_runtime','debateai_authorization_runtime','debateai_staff_security_owner','debateai_staff_recovery','debateai_prod_staff_recovery') ORDER BY rolname`)).rows;
    const memberships = (await database.pool.query(`SELECT pg_get_userbyid(m.member) AS member,pg_get_userbyid(m.roleid) AS role,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m WHERE pg_get_userbyid(m.member) IN('debateai_runtime','debateai_authorization_runtime','debateai_staff_security_owner','debateai_prod_staff_recovery','task4_test_runtime') ORDER BY member,role`)).rows;
    expect(memberships.filter(m => m.member === 'debateai_staff_security_owner')).toEqual([]);
    expect(memberships.filter(m => m.member === 'debateai_prod_staff_recovery').map(m => m.role)).toEqual(['debateai_staff_recovery']);
    const triggers = (await database.pool.query("SELECT tgname,tgrelid::regclass::text AS relation,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgname LIKE 'staff_notify_%' ORDER BY tgname")).rows;
    expect(triggers).toHaveLength(5);
    await writeFile('/Users/stefannour/DebateAIRO/docs/operations/admin-implementation-2026-10-02/logs/task4-full-catalog-acl.json', JSON.stringify({ functions, columns, roles, memberships, triggers }, null, 2) + '\n');
});
it('invalidates current privilege and owned proofs after grant revision changes while preserving ordinary credentials', async () => {
    const owner = await staff(true), o = await elevation(owner), target = await staff(), t = await elevation(target);
    const binding = { action: 'CREDENTIAL_REVOKE' as const, targetId: target.userId, bodySha256: 'e'.repeat(64), expectedRevision: 0, operationId: randomUUID() }, options = await web.beginAction(t.context, binding), proof = await web.finishAction(t.context, binding, { challenge_handle: options.challenge_handle, credential: assertion(target, options.options.challenge, 2) });
    expect(await repo.readActionProof({ context: t.context, ordinaryTokenHash: target.ordinaryTokenHash, proofHandleHash: digest(proof.proofHandle), binding })).not.toBeNull();
    const grant = await action(owner, o.context, target.staffId, 'TEAM_GRANT');
    await repo.grant({ actor: o.context, proof: grant.proof, targetStaffId: target.staffId, capabilities: ['AUDIT_READ'], operationId: grant.binding.operationId, reason: { code: 'GRANT_CHANGE' }, alertIntent: { schema: 'staff-alert-v1', event: 'GRANT', operationId: grant.binding.operationId, envelope: env } });
    expect(await repo.readCurrentContext({ context: t.context, ordinaryTokenHash: target.ordinaryTokenHash })).toBeNull();
    expect(await repo.readActionProof({ context: t.context, ordinaryTokenHash: target.ordinaryTokenHash, proofHandleHash: digest(proof.proofHandle), binding })).toBeNull();
    expect((await runtime.query('SELECT identity.assert_session_current($1,$2,$3) AS current', [target.userId, target.ordinarySessionId, target.ordinaryTokenHash])).rows[0].current).toBe(true);
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.mfa_factor WHERE user_id=$1 AND state='active'", [target.userId])).rows[0].n).toBe(2);
});
it('slides persisted staff idle on authenticated activity and denies an idle-expired cookie before absolute expiry', async () => {
    const a = await staff(), e = await elevation(a), input = { userId: a.userId, ordinarySessionId: a.ordinarySessionId, ordinaryTokenHash: a.ordinaryTokenHash, staffTokenHash: digest(e.issued.staffToken) };
    await database.pool.query("UPDATE staff.privilege_session SET idle_expires_at=clock_timestamp()+interval '1 second' WHERE privilege_session_id=$1", [e.context.privilegeSessionId]);
    expect(await repo.readAuthentication(input)).not.toBeNull();
    expect((await database.pool.query("SELECT idle_expires_at>clock_timestamp()+interval '14 minutes' AS slid,absolute_expires_at>clock_timestamp()+interval '1 hour' AS absolute_live FROM staff.privilege_session WHERE privilege_session_id=$1", [e.context.privilegeSessionId])).rows[0]).toEqual({ slid: true, absolute_live: true });
    await database.pool.query("UPDATE staff.privilege_session SET idle_expires_at=clock_timestamp()-interval '1 second' WHERE privilege_session_id=$1", [e.context.privilegeSessionId]);
    expect(await repo.readAuthentication(input)).toBeNull();
});
