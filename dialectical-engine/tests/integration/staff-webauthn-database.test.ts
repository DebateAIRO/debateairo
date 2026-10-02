import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { createPool, migrate, PostgresStaffRepository, type Pool, type StaffEnrollmentIntentBinding } from '@debateai/db';
import { verifyAssertion } from '../../apps/api/src/staff/webauthn-verifier.js';
import type { StaffContext, ActionBinding } from '@debateai/kernel';
import { StaffWebAuthnService } from '../../apps/api/src/staff/webauthn.js';
import { b64, digest, fixture, key, origin, rpId, type FixtureKey } from '../support/staffWebAuthnFixtures.js';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
let database: TestDatabase, runtime: Pool, repo: PostgresStaffRepository, service: StaffWebAuthnService;
const env = { v: 1 as const, keyId: 'fixture', nonce: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA==', ct: 'YQ==' };
async function account() { const userId = randomUUID(), ordinarySessionId = randomUUID(), factorId = randomUUID(); await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash('sha256').update(userId).digest(), userId]); await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step) VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [factorId, userId]); await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at) VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [ordinarySessionId, userId, digest(ordinarySessionId), digest('csrf' + ordinarySessionId)]); await database.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`, [userId]); const ownerRef = (await database.pool.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0].owner_ref as string; return { userId, ordinarySessionId, factorId, ownerRef }; }
type Account = Awaited<ReturnType<typeof account>>;
async function prerequisite(a: Account, purpose = 'KEY_PREREGISTRATION', commandId: string | null = null, nonce: string | null = null, step = 2) { const handle = b64(randomBytes(32)), replacement = digest(randomBytes(32)); await runtime.query('SELECT staff.step_up_prerequisite($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15)', [a.userId, a.ownerRef, 'fixture-password', a.factorId, step, a.ordinarySessionId, digest(a.ordinarySessionId), replacement, digest(randomBytes(32)), {}, { ipArgon2id: 'argon2id-audit:v1:' + '0'.repeat(64), userAgentArgon2id: 'argon2id-audit:v1:' + '1'.repeat(64) }, digest(handle), purpose, commandId, nonce]); return handle; }
async function enrolled(a: Account, k: FixtureKey = key()) { const f = fixture(k, 1, randomBytes(32)), id = randomUUID(); await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter) VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),$5,$6,true,false,false,$7,0)`, [id, a.userId, f.expected.credentialId, { format: 'COSE_KEY_BASE64URL_V1', value: b64(k.wire) }, rpId, origin, { ...env, keyId: 'passkey-label:' + id + ':v1' }]); await database.pool.query('INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256,transports) VALUES($1,$2,$3,$4)', [id, a.userId, digest(f.handle), ['usb']]); return { f, id }; }
async function staff(owner = false) { const a = await account(), staffId = randomUUID(); await database.pool.query('INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)', [staffId, a.userId, owner ? ['TEAM_READ', 'TEAM_INVITE', 'TEAM_GRANT', 'TEAM_DISABLE', 'AUDIT_READ', 'EMERGENCY_DISABLE'] : ['TEAM_READ']]); if (owner) {
    await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE active');
    await database.pool.query('INSERT INTO staff.owner_designation(staff_id) VALUES($1)', [staffId]);
} const one = await enrolled(a); if (owner)
    await enrolled(a); return { ...a, staffId, one }; }
function assertion(f: ReturnType<typeof fixture>, challenge: string, counter = 1) { return f.assertion({ client: Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin })), auth: f.auth(5, counter) }); }
function registration(f: ReturnType<typeof fixture>, challenge: string) { return { ...f.registration, response: { ...f.registration.response, clientDataJSON: b64(Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin }))) } }; }
const ownerRequest = (context: Awaited<ReturnType<typeof preparedPair>>['context'], selection: {
    credentialId: string;
    commandNonce: string;
}, options: {
    challenge_handle: string;
}, credential: unknown) => ({ ...request(options, credential), command_id: context.command.commandId, command_nonce: selection.commandNonce, credential_id: selection.credentialId });
const request = (options: {
    challenge_handle: string;
}, credential: unknown) => ({ challenge_handle: options.challenge_handle, credential });
const enrollmentIntent = (expectedOperationId: string) => async (input: StaffEnrollmentIntentBinding) => { expect(input.operationId).toBe(expectedOperationId); return { operationId: input.operationId, factorId: input.factorId, deviceLabelEnvelope: { ...env, keyId: 'passkey-label:' + input.factorId + ':v1' }, alertIntent: { schema: 'staff-alert-v1' as const, event: 'KEY_CHANGE' as const, operationId: input.operationId, envelope: env } }; };
async function elevation(a: Awaited<ReturnType<typeof staff>>) { const options = await service.beginElevation(a); const issued = await service.finishElevation(a, request(options, assertion(a.one.f, options.options.challenge))); const context = await repo.readContext({ ...a, staffTokenHash: digest(issued.staffToken) }); if (!context)
    throw new Error('NO_CONTEXT'); return { context, issued }; }
async function waitForLock(pid: number) { for (let i = 0; i < 100; i++) {
    const row = (await database.pool.query('SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0];
    if (row?.wait_event_type === 'Lock')
        return row;
    await new Promise(resolve => setTimeout(resolve, 10));
} throw new Error('BARRIER_NOT_BLOCKED'); }
async function completion(a: Awaited<ReturnType<typeof staff>>, options: Awaited<ReturnType<StaffWebAuthnService['beginElevation']>>, counter = 1) { const response = assertion(a.one.f, options.options.challenge, counter), verified = verifyAssertion(response, { credentialId: a.one.f.expected.credentialId, publicKey: b64(a.one.f.k.wire), counter: 0, userHandleSha256: digest(a.one.f.handle) }, { origin, rpId, challengeSha256: digest(options.options.challenge) }); const challenge = await repo.readWebAuthnChallenge({ ...a, purpose: 'ELEVATION', handleHash: digest(options.challenge_handle), context: null, binding: null, scope: {} }); if (!challenge)
    throw new Error('MISSING_CHALLENGE'); return { ...a, challengeId: challenge.challengeId, credentialId: verified.credentialId, newCounter: verified.counter, rpId, origin, purpose: 'ELEVATION' as const, context: null, binding: null, scope: {}, tokenHash: digest(randomBytes(32)), csrfHash: digest(randomBytes(32)) }; }
async function preparedPair(a: Account) { const one = await enrolled(a), two = await enrolled(a), nonce = b64(randomBytes(32)); const expiry = (await database.pool.query("SELECT (clock_timestamp()+interval '5 minutes')::text AS value")).rows[0].value as string; await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery LOGIN PASSWORD 'task3-recovery-test-only' VALID UNTIL '${expiry}'`); const url = new URL(database.connectionString); url.username = 'debateai_prod_staff_recovery'; url.password = 'task3-recovery-test-only'; const closed = createPool(url.toString()); try {
    const command = (await closed.query('SELECT staff.prepare_owner_command($1,$2,$3,$4::text[],$5,$6) AS value', ['BOOTSTRAP', a.userId, null, [one.f.expected.credentialId, two.f.expected.credentialId], randomUUID(), digest(nonce)])).rows[0].value;
    const prerequisiteHandle = await prerequisite(a, 'OWNER_POSSESSION', command.commandId, digest(nonce));
    const context = await repo.readOwnerPossessionContext({ ...a, commandId: command.commandId, nonceHash: digest(nonce), credentialId: one.f.expected.credentialId, prerequisiteHandleHash: digest(prerequisiteHandle) });
    if (!context)
        throw new Error('MISSING_POSSESSION_CONTEXT');
    return { one, two, nonce, prerequisiteHandle, context };
}
finally {
    await closed.end();
    await database.pool.query("ALTER ROLE debateai_prod_staff_recovery PASSWORD NULL VALID UNTIL '-infinity'");
} }
beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); await database.pool.query(`CREATE ROLE webauthn_test_runtime LOGIN PASSWORD 'webauthn-test-only' IN ROLE debateai_runtime`); const url = new URL(database.connectionString); url.username = 'webauthn_test_runtime'; url.password = 'webauthn-test-only'; runtime = createPool(url.toString()); repo = new PostgresStaffRepository(runtime); service = new StaffWebAuthnService(repo, { publicAppUrl: origin }); }, 120000);
afterAll(async () => { await runtime?.end(); await database?.stop(); });
describe('owned WebAuthn persistence and trusted API composition', () => {
    it('enrolls only through real rotated preregistration; stores opaque handle hash and KEY_CHANGE atomically', async () => { const a = await account(), handle = await prerequisite(a), operationId = randomUUID(), options = await service.beginRegistration(a, { kind: 'PREREQUISITE', prerequisiteHandle: handle, operationId }), f = fixture(key(), 1, randomBytes(32)), intent = enrollmentIntent(operationId); const result = await service.finishRegistration(a, request(options, registration(f, options.options.challenge)), intent); expect(result.credentialId).toBe(f.expected.credentialId); expect(result.receipt.recordedAt).toBeInstanceOf(Date); expect(options.options.user.id).not.toBe(b64(Buffer.from(a.userId))); const rows = (await database.pool.query('SELECT user_handle_sha256,transports FROM identity.staff_webauthn_metadata WHERE user_id=$1', [a.userId])).rows; expect(rows).toEqual([{ user_handle_sha256: digest(Buffer.from(options.options.user.id, 'base64url')), transports: [] }]); expect((await database.pool.query("SELECT count(*)::int AS n FROM staff.audit_event a JOIN staff.alert_outbox o USING(event_id) WHERE a.operation_id=$1 AND a.event_type='KEY_CHANGE'", [operationId])).rows[0].n).toBe(1); await expect(service.finishRegistration(a, request(options, registration(f, options.options.challenge)), intent)).rejects.toThrow(); });
    it('denies normal registration and elevation for stolen password/TOTP without existing staff key proof', async () => { const a = await staff(); await expect(prerequisite(a)).rejects.toThrow('STAFF_EXISTING_SUBJECT_REQUIRES_KEY_PROOF'); await expect(service.beginRegistration(a, { kind: 'PREREQUISITE', prerequisiteHandle: b64(randomBytes(32)), operationId: randomUUID() })).rejects.toThrow(); const options = await service.beginElevation(a); await expect(service.finishElevation(a, request(options, fixture().assertion({})))).rejects.toThrow(); const ordinary = await account(); await enrolled(ordinary); await expect(service.beginElevation(ordinary)).rejects.toThrow(); });
    it('issues trusted cookie tokens only after signature and clips timestamps to ordinary absolute expiry', async () => { const a = await staff(); await database.pool.query("UPDATE identity.session SET absolute_expires_at=clock_timestamp()+interval '10 minutes',idle_expires_at=clock_timestamp()+interval '9 minutes' WHERE session_id=$1", [a.ordinarySessionId]); const { issued, context } = await elevation(a); expect(issued.staffToken).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(issued.staffCsrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(context.staffId).toBe(a.staffId); const row = (await database.pool.query('SELECT token_hash,csrf_token_hash,created_at,last_seen_at,idle_expires_at,absolute_expires_at FROM staff.privilege_session WHERE privilege_session_id=$1', [context.privilegeSessionId])).rows[0]; expect(row.token_hash).toBe(digest(issued.staffToken)); expect(row.csrf_token_hash).toBe(digest(issued.staffCsrfToken)); expect(issued.expiresAt).toEqual(row.absolute_expires_at); expect(row.idle_expires_at <= row.absolute_expires_at).toBe(true); });
    it('durably counts five failed signatures without consuming or minting privilege', async () => { const a = await staff(), options = await service.beginElevation(a), valid = assertion(a.one.f, options.options.challenge), bad = { ...valid, response: { ...valid.response, signature: b64(Buffer.alloc(64)) } }; for (let n = 1; n <= 5; n++) {
        await expect(service.finishElevation(a, request(options, bad))).rejects.toThrow('STAFF_WEBAUTHN_INVALID');
        expect((await database.pool.query('SELECT failed_attempts,consumed_at FROM staff.webauthn_challenge WHERE handle_sha256=$1', [digest(options.challenge_handle)])).rows[0]).toMatchObject({ failed_attempts: n, consumed_at: null });
    } await expect(service.finishElevation(a, request(options, valid))).rejects.toThrow(); expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.privilege_session WHERE user_id=$1', [a.userId])).rows[0].n).toBe(0); });
    it('binds independent same-user challenges to handle/session/purpose/epoch/allowlist', async () => { const a = await staff(), one = await service.beginElevation(a), two = await service.beginElevation(a); await expect(service.finishElevation(a, request(one, assertion(a.one.f, two.options.challenge)))).rejects.toThrow(); expect((await service.finishElevation(a, request(two, assertion(a.one.f, two.options.challenge)))).staffToken).toBeTruthy(); const other = await account(); await expect(service.finishElevation(other, request(one, assertion(a.one.f, one.options.challenge)))).rejects.toThrow(); await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,false,1)', [a.userId]); await expect(service.finishElevation(a, request(one, assertion(a.one.f, one.options.challenge, 2)))).rejects.toThrow(); });
    it('binds action proof to persistent caller context and exact action body digest; permits only proven self key enrollment', async () => { const a = await staff(true), { context } = await elevation(a), binding: ActionBinding = { action: 'CREDENTIAL_REGISTER', targetId: a.userId, bodySha256: 'a'.repeat(64), expectedRevision: 0, operationId: randomUUID() }, options = await service.beginAction(context, binding); await expect(service.finishAction(context, { ...binding, bodySha256: 'b'.repeat(64) }, request(options, assertion(a.one.f, options.options.challenge, 2)))).rejects.toThrow(); const result = await service.finishAction(context, binding, request(options, assertion(a.one.f, options.options.challenge, 2))); expect(result.proof.binding).toEqual(binding); await expect(service.beginRegistration(a, { kind: 'STAFF_PROOF', context: { ...context, staffId: randomUUID() }, proofHandle: result.proofHandle, binding, operationId: binding.operationId })).rejects.toThrow(); const reg = await service.beginRegistration(a, { kind: 'STAFF_PROOF', context, proofHandle: result.proofHandle, binding, operationId: binding.operationId }), f = fixture(key(), 1, randomBytes(32)); expect((await service.finishRegistration(a, request(reg, registration(f, reg.options.challenge)), enrollmentIntent(binding.operationId))).credentialId).toBe(f.expected.credentialId); await expect(service.beginRegistration(a, { kind: 'STAFF_PROOF', context, proofHandle: result.proofHandle, binding, operationId: binding.operationId })).rejects.toThrow(); });
    it('rolls enrollment back on missing intent and actual audit/outbox write failure', async () => { for (const table of ['audit_event', 'alert_outbox']) {
        const a = await account(), handle = await prerequisite(a), operationId = randomUUID(), options = await service.beginRegistration(a, { kind: 'PREREQUISITE', prerequisiteHandle: handle, operationId }), f = fixture(key(), 1, randomBytes(32)), intent = enrollmentIntent(operationId);
        await expect(service.finishRegistration(a, request(options, registration(f, options.options.challenge)), async (binding) => ({ ...await intent(binding), alertIntent: { ...(await intent(binding)).alertIntent, event: 'GRANT' } }))).rejects.toThrow();
        await database.pool.query(`CREATE FUNCTION staff.fixture_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'FIXTURE_WRITE_FAILURE';END$$; CREATE TRIGGER fixture_fail BEFORE INSERT ON staff.${table} FOR EACH ROW EXECUTE FUNCTION staff.fixture_fail_insert()`);
        try {
            await expect(service.finishRegistration(a, request(options, registration(f, options.options.challenge)), intent)).rejects.toThrow('FIXTURE_WRITE_FAILURE');
            expect((await database.pool.query('SELECT consumed_at FROM staff.webauthn_challenge WHERE handle_sha256=$1', [digest(options.challenge_handle)])).rows[0].consumed_at).toBeNull();
            expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.mfa_factor WHERE credential_id=$1', [f.expected.credentialId])).rows[0].n).toBe(0);
        }
        finally {
            await database.pool.query(`DROP TRIGGER fixture_fail ON staff.${table};DROP FUNCTION staff.fixture_fail_insert()`);
        }
    } });
    it('rejects revoked keys, disabled staff, held sessions, expired and erased accounts', async () => { for (const mutation of ['key', 'staff', 'session', 'expiry', 'erasure']) {
        const a = await staff(), options = await service.beginElevation(a);
        if (mutation === 'key')
            await database.pool.query("UPDATE identity.mfa_factor SET state='revoked',revoked_at=clock_timestamp() WHERE mfa_factor_id=$1", [a.one.id]);
        if (mutation === 'staff')
            await database.pool.query("UPDATE staff.subject SET state='DISABLED',security_epoch=security_epoch+1 WHERE staff_id=$1", [a.staffId]);
        if (mutation === 'session')
            await database.pool.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE session_id=$1', [a.ordinarySessionId]);
        if (mutation === 'expiry')
            await database.pool.query("UPDATE staff.webauthn_challenge SET expires_at=created_at WHERE handle_sha256=$1", [digest(options.challenge_handle)]);
        if (mutation === 'erasure')
            await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [a.userId]);
        await expect(service.finishElevation(a, request(options, assertion(a.one.f, options.options.challenge)))).rejects.toThrow();
    } });
    it('refuses delegated Owner-only action proof and null bindings through actual runtime definers', async () => { const a = await staff(), { context } = await elevation(a); for (const action of ['TEAM_INVITE', 'TEAM_GRANT', 'TEAM_DISABLE'] as const) {
        const binding = { action, targetId: randomUUID(), bodySha256: 'a'.repeat(64), expectedRevision: 0, operationId: randomUUID() };
        await expect(service.beginAction(context, binding)).rejects.toThrow();
    } for (const binding of [null, { action: null, targetId: randomUUID(), bodySha256: null, expectedRevision: 0, operationId: randomUUID() }])
        await expect(repo.beginWebAuthn({ ...a, purpose: 'ACTION', challengeHash: digest(randomBytes(32)), handleHash: digest(randomBytes(32)), rpId, origin, userHandleHash: null, operationId: null, context, binding: binding as never, scope: {} })).rejects.toThrow(); });
    it('proves invitation scope with live issuer rechecks and no privilege context/token', async () => { const issuer = await staff(true), { context } = await elevation(issuer), target = await account(), owned = await enrolled(target), invitationHandle = b64(randomBytes(32)), operationId = randomUUID(), binding: ActionBinding = { action: 'TEAM_INVITE', targetId: target.userId, bodySha256: 'd'.repeat(64), expectedRevision: 0, operationId }, options = await service.beginAction(context, binding), action = await service.finishAction(context, binding, request(options, assertion(issuer.one.f, options.options.challenge, 2))); await repo.invite({ actor: context, proof: action.proof, operationId, reason: { code: 'TEAM_ONBOARDING' }, alertIntent: { schema: 'staff-alert-v1', event: 'INVITE', operationId, envelope: env }, targetUserId: target.userId, capabilities: ['TEAM_READ'], invitationTokenHash: digest(invitationHandle), deliveryIntent: { schema: 'staff-invitation-delivery-v1', operationId, envelope: env } }); const invitation = await repo.readInvitationContext({ targetUserId: target.userId, ordinarySessionId: target.ordinarySessionId, invitationTokenHash: digest(invitationHandle) }); if (!invitation)
        throw new Error('INVITATION_MISSING'); const first = await service.beginInvitationAcceptance(invitation, { invitationHandle }), second = await service.beginInvitationAcceptance(invitation, { invitationHandle }); await expect(service.finishElevation(target, request(first, assertion(owned.f, first.options.challenge)))).rejects.toThrow(); await expect(service.finishInvitationAcceptance({ ...invitation, invitationRevision: 1 }, { invitationHandle }, request(first, assertion(owned.f, first.options.challenge)))).rejects.toThrow(); const proof = await service.finishInvitationAcceptance(invitation, { invitationHandle }, request(first, assertion(owned.f, first.options.challenge))); expect(proof.proof.purpose).toBe('INVITATION_ACCEPT'); expect(proof).not.toHaveProperty('staffToken'); expect(proof.proof.context).not.toHaveProperty('privilegeSessionId'); await database.pool.query("UPDATE staff.subject SET state='DISABLED',security_epoch=security_epoch+1 WHERE staff_id=$1", [issuer.staffId]); await expect(service.finishInvitationAcceptance(invitation, { invitationHandle }, request(second, assertion(owned.f, second.options.challenge, 2)))).rejects.toThrow(); expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.privilege_session WHERE user_id=$1', [target.userId])).rows[0].n).toBe(0); });
    it('proves exactly the selected members of a real JIT-prepared fixed Owner pair and scopes receipts', async () => { const target = await account(), prepared = await preparedPair(target), selection = { credentialId: prepared.one.f.expected.credentialId, commandNonce: prepared.nonce, prerequisiteHandle: prepared.prerequisiteHandle }, one = await service.beginOwnerPossession(prepared.context, selection), other = { ...selection, credentialId: prepared.two.f.expected.credentialId }, two = await service.beginOwnerPossession(prepared.context, other); expect(one.options.allowCredentials.map(x => x.id)).toEqual([selection.credentialId]); await expect(service.finishOwnerPossession(target, ownerRequest(prepared.context, other, one, assertion(prepared.two.f, one.options.challenge)))).rejects.toThrow(); await expect(service.finishOwnerPossession(target, ownerRequest(prepared.context, { ...selection, commandNonce: b64(randomBytes(32)) }, one, assertion(prepared.one.f, one.options.challenge)))).rejects.toThrow(); await expect(service.finishElevation(target, request(one, assertion(prepared.one.f, one.options.challenge)))).rejects.toThrow(); const receipt1 = await service.finishOwnerPossession(target, ownerRequest(prepared.context, selection, one, assertion(prepared.one.f, one.options.challenge))), receipt2 = await service.finishOwnerPossession(target, ownerRequest(prepared.context, other, two, assertion(prepared.two.f, two.options.challenge))); expect(receipt1.receiptId).not.toBe(receipt2.receiptId); expect(receipt1.expiresAt).toBeInstanceOf(Date); expect(receipt1).not.toHaveProperty('staffToken'); await expect(service.finishOwnerPossession(target, ownerRequest(prepared.context, selection, one, assertion(prepared.one.f, one.options.challenge, 2)))).rejects.toThrow(); expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.owner_possession_receipt WHERE command_id=$1', [prepared.context.command.commandId])).rows[0].n).toBe(2); expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.privilege_session WHERE user_id=$1', [target.userId])).rows[0].n).toBe(0); });
    it('denies empty nullable credential binding instead of completing an arbitrary key', async () => { const a = await staff(), options = await service.beginElevation(a), input = await completion(a, options); await database.pool.query("UPDATE staff.webauthn_challenge SET allowed_credential_ids=NULL WHERE challenge_id=$1", [input.challengeId]); await expect(repo.completeWebAuthnAssertion(input)).rejects.toThrow(); expect((await database.pool.query('SELECT consumed_at FROM staff.webauthn_challenge WHERE challenge_id=$1', [input.challengeId])).rows[0].consumed_at).toBeNull(); });
    it('serializes actual two-connection replay and same-key counter advancement', async () => { for (const scenario of ['replay', 'counter']) {
        const a = await staff(), one = await service.beginElevation(a), two = scenario === 'replay' ? one : await service.beginElevation(a), input1 = await completion(a, one), input2 = await completion(a, two), first = await runtime.connect(), second = await runtime.connect();
        try {
            await first.query('BEGIN');
            await second.query('BEGIN');
            const r1 = new PostgresStaffRepository({ query: first.query.bind(first) } as unknown as Pool), r2 = new PostgresStaffRepository({ query: second.query.bind(second) } as unknown as Pool);
            await r1.completeWebAuthnAssertion(input1);
            const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number, pending = r2.completeWebAuthnAssertion(input2), denial = expect(pending).rejects.toThrow();
            expect((await waitForLock(pid)).wait_event).toBe('advisory');
            await first.query('COMMIT');
            await denial;
            await second.query('ROLLBACK');
            expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.privilege_session WHERE user_id=$1', [a.userId])).rows[0].n).toBe(1);
            expect((await database.pool.query('SELECT signature_counter FROM identity.mfa_factor WHERE mfa_factor_id=$1', [a.one.id])).rows[0].signature_counter).toBe('1');
        }
        finally {
            await first.query('ROLLBACK');
            await second.query('ROLLBACK');
            first.release();
            second.release();
        }
    } });
    it('rechecks disable after an actual security-subject blocking lock', async () => { const a = await staff(), options = await service.beginElevation(a), input = await completion(a, options), first = await database.pool.connect(), second = await runtime.connect(); try {
        await first.query('BEGIN');
        await first.query('SELECT identity.lock_security_subjects($1::uuid[])', [[a.userId]]);
        await first.query("UPDATE staff.subject SET state='DISABLED',security_epoch=security_epoch+1 WHERE staff_id=$1", [a.staffId]);
        const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number, pending = new PostgresStaffRepository({ query: second.query.bind(second) } as unknown as Pool).completeWebAuthnAssertion(input), denial = expect(pending).rejects.toThrow();
        expect((await waitForLock(pid)).wait_event).toBe('advisory');
        await first.query('COMMIT');
        await denial;
        expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.privilege_session WHERE user_id=$1', [a.userId])).rows[0].n).toBe(0);
    }
    finally {
        await first.query('ROLLBACK');
        first.release();
        second.release();
    } });
    it('rechecks expiry after the last blocking factor lock, before counter consumption or session issuance', async () => { const a = await staff(), options = await service.beginElevation(a), input = await completion(a, options), first = await database.pool.connect(), second = await runtime.connect(); await database.pool.query("UPDATE staff.webauthn_challenge SET expires_at=clock_timestamp()+interval '250 milliseconds' WHERE challenge_id=$1", [input.challengeId]); try {
        await first.query('BEGIN');
        await first.query('SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=$1 FOR UPDATE', [a.one.id]);
        const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number, pending = new PostgresStaffRepository({ query: second.query.bind(second) } as unknown as Pool).completeWebAuthnAssertion(input), denial = expect(pending).rejects.toThrow();
        expect((await waitForLock(pid)).wait_event_type).toBe('Lock');
        await new Promise(resolve => setTimeout(resolve, 300));
        await first.query('COMMIT');
        await denial;
        expect((await database.pool.query('SELECT signature_counter FROM identity.mfa_factor WHERE mfa_factor_id=$1', [a.one.id])).rows[0].signature_counter).toBe('0');
        expect((await database.pool.query('SELECT consumed_at FROM staff.webauthn_challenge WHERE challenge_id=$1', [input.challengeId])).rows[0].consumed_at).toBeNull();
    }
    finally {
        await first.query('ROLLBACK');
        first.release();
        second.release();
    } });
    it('rejects uploaded authority claims before completion and persists their bounded failure', async () => { const a = await staff(), options = await service.beginElevation(a), valid = assertion(a.one.f, options.options.challenge); await expect(service.finishElevation(a, { ...request(options, valid), verified: true, actor: { role: 'OWNER' } })).rejects.toThrow('STAFF_WEBAUTHN_INVALID'); const row = (await database.pool.query('SELECT failed_attempts,consumed_at FROM staff.webauthn_challenge WHERE handle_sha256=$1', [digest(options.challenge_handle)])).rows[0]; expect(row).toMatchObject({ failed_attempts: 1, consumed_at: null }); });
    it('fails null caller context/body/scope at the actual public challenge/completion seams', async () => { const a = await staff(), { context } = await elevation(a), binding: ActionBinding = { action: 'CREDENTIAL_REVOKE', targetId: a.userId, bodySha256: 'e'.repeat(64), expectedRevision: 0, operationId: randomUUID() }, options = await service.beginAction(context, binding); for (const [caller, body, scope] of [[null, binding, {}], [context, null, {}], [context, binding, null]])
        expect(await repo.readWebAuthnChallenge({ ...a, purpose: 'ACTION', handleHash: digest(options.challenge_handle), context: caller as never, binding: body as never, scope: scope as never })).toBeNull(); });
    it('captures exact guarded-definer/role/column ACL inventory without raw runtime public keys', async () => { const names = ['owned_action_allowed', 'owned_challenge_current', 'begin_owned_webauthn', 'read_owned_webauthn_challenge', 'fail_owned_webauthn', 'complete_owned_webauthn_registration', 'complete_owned_webauthn_assertion', 'staff_read_owned_webauthn_key', 'staff_insert_owned_webauthn_key']; const functions = (await database.pool.query(`SELECT n.nspname,p.proname,p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl::text AS acl,EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE x.grantee=0 AND x.privilege_type='EXECUTE') AS public,has_function_privilege('debateai_runtime',p.oid,'EXECUTE') AS runtime,has_function_privilege('debateai_staff_recovery',p.oid,'EXECUTE') AS recovery FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('staff','identity') AND p.proname=ANY($1) ORDER BY signature`, [names])).rows; expect(functions).toHaveLength(9); const runtimeNames = new Set(['begin_owned_webauthn', 'read_owned_webauthn_challenge', 'fail_owned_webauthn', 'complete_owned_webauthn_registration', 'complete_owned_webauthn_assertion', 'staff_read_owned_webauthn_key']); for (const f of functions) {
        expect(f.public).toBe(false);
        expect(f.recovery).toBe(false);
        expect(f.runtime).toBe(runtimeNames.has(f.proname));
        expect(f.prosecdef).toBe(true);
        expect(f.proconfig).toEqual(['search_path=pg_catalog']);
    } const columns = (await database.pool.query(`SELECT a.attname,has_column_privilege('debateai_runtime',c.oid,a.attnum,'SELECT') AS runtime,has_column_privilege('webauthn_test_runtime',c.oid,a.attnum,'SELECT') AS actual_runtime,has_column_privilege('debateai_staff_security_owner',c.oid,a.attnum,'SELECT') AS staff_owner FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.oid='identity.mfa_factor'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`)).rows; const expected = ['mfa_factor_id', 'user_id', 'factor_type', 'state', 'created_at', 'secret_ciphertext', 'last_accepted_step'].sort(); expect(columns.filter(c => c.runtime).map(c => c.attname).sort()).toEqual(expected); expect(columns.filter(c => c.actual_runtime).map(c => c.attname).sort()).toEqual(expected); expect(columns.find(c => c.attname === 'public_key')).toMatchObject({ runtime: false, actual_runtime: false, staff_owner: false }); const roles = (await database.pool.query(`SELECT rolname,rolcanlogin,rolinherit,rolvaliduntil FROM pg_roles WHERE rolname IN('debateai_staff_security_owner','debateai_staff_recovery','debateai_prod_staff_recovery') ORDER BY rolname`)).rows; const memberships = (await database.pool.query(`SELECT pg_get_userbyid(m.member) AS member,pg_get_userbyid(m.roleid) AS role,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m WHERE pg_get_userbyid(m.member) IN('debateai_runtime','debateai_staff_security_owner','debateai_prod_staff_recovery','webauthn_test_runtime') ORDER BY member,role`)).rows; expect(memberships.filter(m => m.member === 'debateai_staff_security_owner')).toEqual([]); expect(memberships.filter(m => m.member === 'debateai_prod_staff_recovery').map(m => m.role)).toEqual(['debateai_staff_recovery']); const inventory = { functions, columns, roles, memberships }; await writeFile('/Users/stefannour/DebateAIRO/docs/operations/admin-implementation-2026-10-02/logs/task3-owned-catalog-acl.json', JSON.stringify(inventory, null, 2) + '\n'); });
    it('rejects an oversized original wrapper before decoding or spending a challenge failure', async () => { const a = await staff(), options = await service.beginElevation(a), valid = request(options, assertion(a.one.f, options.options.challenge)); await expect(service.finishElevation(a, { ...valid, extra: 'a'.repeat(32768) })).rejects.toThrow('STAFF_WEBAUTHN_INVALID'); expect((await database.pool.query('SELECT failed_attempts,consumed_at FROM staff.webauthn_challenge WHERE handle_sha256=$1', [digest(options.challenge_handle)])).rows[0]).toMatchObject({ failed_attempts: 0, consumed_at: null }); expect((await service.finishElevation(a, valid)).staffToken).toBeTruthy(); });
    it('rechecks ordinary expiry after the stored command row lock before issuing a possession receipt', async () => { const target = await account(), pair = await preparedPair(target), selection = { credentialId: pair.one.f.expected.credentialId, commandNonce: pair.nonce, prerequisiteHandle: pair.prerequisiteHandle }, options = await service.beginOwnerPossession(pair.context, selection), response = assertion(pair.one.f, options.options.challenge), verified = verifyAssertion(response, { ...pair.one.f.expected, publicKey: b64(pair.one.f.k.wire) }, { origin, rpId, challengeSha256: digest(options.options.challenge) }), challenge = await repo.readWebAuthnChallenge({ ...target, purpose: 'OWNER_POSSESSION', handleHash: digest(options.challenge_handle), context: null, binding: null, scope: { commandId: pair.context.command.commandId, nonceHash: digest(pair.nonce), credentialId: selection.credentialId } }); if (!challenge)
        throw new Error('MISSING_CHALLENGE'); const first = await database.pool.connect(), second = await runtime.connect(); await database.pool.query("UPDATE identity.session SET absolute_expires_at=clock_timestamp()+interval '250 milliseconds',idle_expires_at=clock_timestamp()+interval '200 milliseconds' WHERE session_id=$1", [target.ordinarySessionId]); try {
        await first.query('BEGIN');
        await first.query('SELECT 1 FROM staff.owner_command WHERE command_id=$1 FOR UPDATE', [pair.context.command.commandId]);
        const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number, pending = new PostgresStaffRepository({ query: second.query.bind(second) } as unknown as Pool).completeWebAuthnAssertion({ ...target, purpose: 'OWNER_POSSESSION', challengeId: challenge.challengeId, credentialId: verified.credentialId, newCounter: verified.counter, rpId, origin, context: null, binding: null, scope: challenge.scope, tokenHash: null, csrfHash: null }), denial = expect(pending).rejects.toThrow();
        expect((await waitForLock(pid)).wait_event_type).toBe('Lock');
        let factorAvailable = true;
        try {
            await database.pool.query('SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=$1 FOR UPDATE NOWAIT', [pair.one.id]);
        }
        catch {
            factorAvailable = false;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        await first.query('COMMIT');
        await denial;
        expect(factorAvailable).toBe(true);
        expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.owner_possession_receipt WHERE command_id=$1', [pair.context.command.commandId])).rows[0].n).toBe(0);
        expect((await database.pool.query('SELECT signature_counter FROM identity.mfa_factor WHERE mfa_factor_id=$1', [pair.one.id])).rows[0].signature_counter).toBe('0');
    }
    finally {
        await first.query('ROLLBACK');
        first.release();
        second.release();
    } });
    it('rechecks expiry after a different account duplicate credential INSERT rolls back', async () => {
        const a = await account(), other = await account(), prerequisiteHandle = await prerequisite(a), operationId = randomUUID();
        const options = await service.beginRegistration(a, { kind: 'PREREQUISITE', prerequisiteHandle, operationId });
        const f = fixture(key(), 1, randomBytes(32)), factorId = randomUUID();
        const first = await database.pool.connect(), second = await runtime.connect();
        await database.pool.query("UPDATE staff.webauthn_challenge SET expires_at=clock_timestamp()+interval '250 milliseconds' WHERE handle_sha256=$1", [digest(options.challenge_handle)]);
        try {
            await first.query('BEGIN');
            await first.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter) VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),$5,$6,true,false,false,$7,0)`, [factorId, other.userId, f.expected.credentialId, { format: 'COSE_KEY_BASE64URL_V1', value: b64(f.k.wire) }, rpId, origin, { ...env, keyId: 'passkey-label:' + factorId + ':v1' }]);
            const isolated = new StaffWebAuthnService(new PostgresStaffRepository({ query: second.query.bind(second) } as unknown as Pool), { publicAppUrl: origin });
            const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
            const pending = isolated.finishRegistration(a, request(options, registration(f, options.options.challenge)), enrollmentIntent(operationId));
            const denial = expect(pending).rejects.toThrow();
            expect((await waitForLock(pid)).wait_event_type).toBe('Lock');
            await new Promise(resolve => setTimeout(resolve, 300));
            await first.query('ROLLBACK');
            await denial;
            expect((await database.pool.query('SELECT consumed_at FROM staff.webauthn_challenge WHERE handle_sha256=$1', [digest(options.challenge_handle)])).rows[0].consumed_at).toBeNull();
            expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.mfa_factor WHERE credential_id=$1', [f.expected.credentialId])).rows[0].n).toBe(0);
            expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.audit_event WHERE operation_id=$1', [operationId])).rows[0].n).toBe(0);
        } finally {
            await first.query('ROLLBACK'); first.release(); second.release();
        }
    });
    it('executes the scoped key helper under a real nonsuperuser identity owner with an explicit guard ACL', async () => {
        const a = await staff(), options = await service.beginElevation(a);
        const challenge = (await database.pool.query('SELECT challenge_id FROM staff.webauthn_challenge WHERE handle_sha256=$1', [digest(options.challenge_handle)])).rows[0].challenge_id as string;
        const owner = (await database.pool.query("SELECT pg_get_userbyid(relowner) AS role FROM pg_class WHERE oid='identity.mfa_factor'::regclass")).rows[0].role as string;
        // Private disposable role inherits the original identity owner's object privileges;
        // SUPERUSER is not inherited. The scoped helper itself executes as this real NOSUPERUSER.
        expect(owner).toBe('debateai');
        const admin = await database.pool.connect();
        await admin.query('CREATE ROLE task3_fixture_identity_owner NOLOGIN NOSUPERUSER INHERIT');
        await admin.query('GRANT debateai TO task3_fixture_identity_owner WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
        await admin.query('ALTER FUNCTION identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text) OWNER TO task3_fixture_identity_owner');
        try {
            expect((await database.pool.query("SELECT rolsuper FROM pg_roles WHERE rolname='task3_fixture_identity_owner'")).rows[0].rolsuper).toBe(false);
            expect((await database.pool.query("SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid='identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text)'::regprocedure")).rows[0].owner).toBe('task3_fixture_identity_owner');
            const value = (await runtime.query('SELECT identity.staff_read_owned_webauthn_key($1,$2,$3,$4) AS value', [a.userId, a.ordinarySessionId, challenge, a.one.f.expected.credentialId])).rows[0].value;
            expect(value.publicKey).toBe(b64(a.one.f.k.wire));
            await admin.query('SET ROLE task3_fixture_identity_owner');
            const executed = (await admin.query('SELECT current_user AS execution_role,identity.staff_read_owned_webauthn_key($1,$2,$3,$4) AS value', [a.userId, a.ordinarySessionId, challenge, a.one.f.expected.credentialId])).rows[0];
            expect(executed.execution_role).toBe('task3_fixture_identity_owner');
            expect(executed.value.publicKey).toBe(b64(a.one.f.k.wire));
            await admin.query('RESET ROLE');
            const explicit = (await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl WHERE n.nspname='staff' AND p.proname='owned_challenge_current' AND acl.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND acl.privilege_type='EXECUTE') AS allowed`, [owner])).rows[0].allowed;
            expect(explicit).toBe(true);
        } finally {
            await admin.query('RESET ROLE');
            await admin.query('ALTER FUNCTION identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text) OWNER TO debateai');
            await admin.query('DROP ROLE task3_fixture_identity_owner');
            admin.release();
        }
    });
    it('closes runtime raw keys/secrets/metadata and permits only owned challenge-scoped key read', async () => { const a = await staff(); for (const table of ['identity.mfa_factor', 'identity.staff_webauthn_metadata', 'staff.webauthn_challenge'])
        await expect(runtime.query('SELECT * FROM ' + table)).rejects.toMatchObject({ code: '42501' }); const options = await service.beginElevation(a), row = (await database.pool.query('SELECT challenge_id FROM staff.webauthn_challenge WHERE handle_sha256=$1', [digest(options.challenge_handle)])).rows[0]; expect((await runtime.query('SELECT identity.staff_read_owned_webauthn_key($1,$2,$3,$4) AS value', [a.userId, a.ordinarySessionId, row.challenge_id, a.one.f.expected.credentialId])).rows[0].value.publicKey).toBe(b64(a.one.f.k.wire)); for (const [user, session, challenge, credential] of [[randomUUID(), a.ordinarySessionId, row.challenge_id, a.one.f.expected.credentialId], [a.userId, randomUUID(), row.challenge_id, a.one.f.expected.credentialId], [a.userId, a.ordinarySessionId, randomUUID(), a.one.f.expected.credentialId], [a.userId, a.ordinarySessionId, row.challenge_id, 'AQ']])
        expect((await runtime.query('SELECT identity.staff_read_owned_webauthn_key($1,$2,$3,$4) AS value', [user, session, challenge, credential])).rows[0].value).toBeNull(); });
});
